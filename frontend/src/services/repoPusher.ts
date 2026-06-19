// ──────────────────────────────────────────────────────────
// GitHub / GitLab 브랜치 생성 및 파일 커밋
//   GitHub : Contents API (파일별 PUT)
//   GitLab : Commits API (단일 커밋으로 다중 파일)
// ──────────────────────────────────────────────────────────

import type { RepoInfo, FetchedFile } from './repoFetcher'

export interface FileToCommit extends FetchedFile {
  newContent: string
}

export interface PushResult {
  branchUrl: string
}

// ── 유틸: 문자열 → base64 (UTF-8 안전) ───────────────────

function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  return btoa(String.fromCharCode(...bytes))
}

// ── GitHub ────────────────────────────────────────────────

async function pushGithub(
  info: RepoInfo,
  token: string,
  branchName: string,
  files: FileToCommit[],
  commitMessage: string,
): Promise<PushResult> {
  const base = `https://api.github.com/repos/${info.owner}/${info.repo}`
  const h = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  // 1. 베이스 브랜치 SHA 조회 (main → master 순으로 시도)
  const candidates = info.branch !== 'master' ? [info.branch, 'master'] : ['master', 'main']
  let baseSha = ''
  let baseBranch = ''
  for (const candidate of candidates) {
    const refRes = await fetch(`${base}/git/ref/heads/${candidate}`, { headers: h })
    if (refRes.ok) {
      baseSha = (await refRes.json()).object.sha
      baseBranch = candidate
      break
    }
    if (refRes.status === 401 || refRes.status === 403) {
      throw new Error('Token 권한을 확인하세요 (repo 스코프 필요)')
    }
  }
  if (!baseSha) throw new Error(`기본 브랜치(main/master)를 찾을 수 없습니다`)

  // 2. 새 브랜치 생성
  const brRes = await fetch(`${base}/git/refs`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
  })
  if (!brRes.ok && brRes.status !== 422) {
    throw new Error(`브랜치 생성 실패 (${brRes.status}) — 이미 존재하거나 권한이 없습니다`)
  }

  // 3. 파일별 커밋
  for (const file of files) {
    const body: Record<string, unknown> = {
      message: commitMessage,
      content: toBase64(file.newContent),
      branch:  branchName,
    }
    if (file.sha) body.sha = file.sha  // 기존 파일 업데이트에 필요

    const fileRes = await fetch(`${base}/contents/${file.path}`, {
      method: 'PUT',
      headers: h,
      body: JSON.stringify(body),
    })
    if (!fileRes.ok) {
      const msg = fileRes.status === 409
        ? `파일 충돌 (${file.path}) — SHA가 변경됐습니다. 다시 가져오기 후 시도하세요`
        : `파일 커밋 실패 (${file.path}): ${fileRes.status}`
      throw new Error(msg)
    }
  }

  return { branchUrl: `https://github.com/${info.owner}/${info.repo}/tree/${branchName}` }
}

// ── GitLab ────────────────────────────────────────────────

async function pushGitlab(
  info: RepoInfo,
  token: string,
  branchName: string,
  files: FileToCommit[],
  commitMessage: string,
): Promise<PushResult> {
  const pid  = encodeURIComponent(`${info.owner}/${info.repo}`)
  const base = `https://${info.host}/api/v4/projects/${pid}`
  const h    = { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/json' }

  // 1. 브랜치 생성 (main → master 순으로 시도)
  const candidates = info.branch !== 'master' ? [info.branch, 'master'] : ['master', 'main']
  let created = false
  for (const ref of candidates) {
    const brRes = await fetch(`${base}/repository/branches`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ branch: branchName, ref }),
    })
    if (brRes.ok) { created = true; break }
    if (brRes.status === 400) {
      const body = await brRes.json().catch(() => ({}))
      if (JSON.stringify(body).toLowerCase().includes('already exists')) { created = true; break }
      throw new Error(body?.message ?? 'Branch creation failed')
    }
    if (brRes.status === 401 || brRes.status === 403) throw new Error('Token 권한을 확인하세요 (api 스코프 필요)')
  }
  if (!created) throw new Error('기본 브랜치(main/master)를 찾을 수 없습니다')

  // 2. 단일 커밋으로 모든 파일 업데이트
  const actions = files.map(f => ({
    action:    'update',
    file_path: f.path,
    content:   f.newContent,
  }))

  const commitRes = await fetch(`${base}/repository/commits`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ branch: branchName, commit_message: commitMessage, actions }),
  })
  if (!commitRes.ok) {
    throw new Error(`커밋 실패 (${commitRes.status}) — 파일 경로나 권한을 확인하세요`)
  }

  return { branchUrl: `https://${info.host}/${info.owner}/${info.repo}/-/tree/${branchName}` }
}

// ── 공개 API ─────────────────────────────────────────────

export async function pushToBranch(
  info: RepoInfo,
  token: string,
  branchName: string,
  files: FileToCommit[],
  commitMessage: string,
): Promise<PushResult> {
  if (info.platform === 'github') {
    return pushGithub(info, token, branchName, files, commitMessage)
  }
  return pushGitlab(info, token, branchName, files, commitMessage)
}

// ── 브랜치명 자동 생성 ────────────────────────────────────

export function generateBranchName(targets: Record<string, string>): string {
  const date   = new Date().toISOString().slice(0, 10)
  const stacks = Object.entries(targets)
    .filter(([, v]) => v)
    .map(([k]) => k)

  if (stacks.length === 1) {
    const ver = targets[stacks[0]].replace(/[^0-9]/g, '')
    return `migration/${date}-${stacks[0]}-${ver}`
  }
  return `migration/${date}-version-bump`
}

// ── 커밋 메시지 자동 생성 ────────────────────────────────

import type { ChangeSummary } from './versionRewriter'

export function generateCommitMessage(changes: ChangeSummary[]): string {
  if (changes.length === 0) return 'chore: version bump'

  const lines = changes.map(c => `- ${c.label}: ${c.before} → ${c.after}`)
  return `chore: version bump\n\n${lines.join('\n')}`
}

// ──────────────────────────────────────────────────────────
// GitHub / GitLab 레포에서 설정 파일 가져오기
//   - Token 없음: Public 레포 전용 (rate limit 60 req/hr)
//   - Token 있음: Private 레포 지원, 파일 SHA 반환 (push에 필요)
//   - GitLab 셀프호스팅 지원: host 필드로 인스턴스 URL 관리
// ──────────────────────────────────────────────────────────

export interface RepoInfo {
  platform: 'github' | 'gitlab'
  owner: string
  repo: string
  branch: string
  host: string   // GitHub: 'github.com' / GitLab: 'gitlab.com' 또는 'git.company.com' 등
}

export interface FetchedFile {
  filename: string
  path: string
  content: string
  sha?: string  // GitHub only — PUT /contents 시 필요
}

// ── base64 → UTF-8 문자열 (한글 등 멀티바이트 안전) ──────────
function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ''))
  const bytes  = Uint8Array.from(binary, c => c.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

// ── URL 파싱 ─────────────────────────────────────────────

export function parseRepoUrl(url: string): RepoInfo | null {
  const s = url.trim().replace(/\/$/, '')

  // GitHub: https://github.com/owner/repo[/tree/branch]
  const gh = s.match(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\/tree\/([^\s/?#]+))?(?:\.git)?$/)
  if (gh) return { platform: 'github', owner: gh[1], repo: gh[2], branch: gh[3] ?? 'main', host: 'github.com' }

  // GitLab (gitlab.com 및 셀프호스팅):
  //   https://host/owner[/subgroup...]/repo[/-/tree/branch]
  const glMatch = s.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?(?:\/-\/tree\/([^\s/?#]+))?$/)
  if (glMatch) {
    const host  = glMatch[1]
    const parts = glMatch[2].split('/')
    if (parts.length >= 2) {
      const repo  = parts[parts.length - 1]
      const owner = parts.slice(0, -1).join('/')
      return { platform: 'gitlab', owner, repo, branch: glMatch[3] ?? 'main', host }
    }
  }

  return null
}

// ── 브랜치 후보 (main → master 순) ───────────────────────

function branches(base: string): string[] {
  return base !== 'master' ? [base, 'master'] : ['master', 'main']
}

// ── GitHub 파일 fetch ─────────────────────────────────────

async function fetchGithub(
  owner: string, repo: string, path: string, branch: string, token?: string,
): Promise<{ content: string; sha: string } | null> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (token) headers.Authorization = `Bearer ${token}`

  for (const ref of branches(branch)) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${ref}`,
        { headers },
      )
      if (!res.ok) continue
      const d = await res.json()
      if (d.type !== 'file' || !d.content) continue
      return { content: decodeBase64Utf8(d.content), sha: d.sha }
    } catch { continue }
  }
  return null
}

// ── GitLab 파일 fetch ─────────────────────────────────────

async function fetchGitlab(
  owner: string, repo: string, path: string, branch: string, token?: string, host = 'gitlab.com',
): Promise<{ content: string } | null> {
  const headers: Record<string, string> = {}
  if (token) headers['PRIVATE-TOKEN'] = token

  const pid = encodeURIComponent(`${owner}/${repo}`)
  const fp  = encodeURIComponent(path)

  for (const ref of branches(branch)) {
    try {
      const res = await fetch(
        `https://${host}/api/v4/projects/${pid}/repository/files/${fp}?ref=${ref}`,
        { headers },
      )
      // 인증 오류는 모든 브랜치에서 동일하게 실패하므로 즉시 throw
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Token이 유효하지 않거나 접근 권한이 없습니다 (${host} api 스코프 필요)`)
      }
      if (!res.ok) continue
      const d = await res.json()
      if (!d.content) continue
      return { content: decodeBase64Utf8(d.content) }
    } catch (e) {
      if (e instanceof Error && (e.message.includes('Token') || e.message.includes('권한'))) throw e
      continue
    }
  }
  return null
}

// ── GitHub 전체 파일 트리 조회 ───────────────────────────────

async function fetchGithubTree(
  owner: string, repo: string, branch: string, token?: string,
): Promise<string[]> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (token) headers.Authorization = `Bearer ${token}`

  for (const ref of branches(branch)) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`,
        { headers },
      )
      if (!res.ok) continue
      const data = await res.json()
      return (data.tree as { path: string; type: string }[])
        .filter(f => f.type === 'blob')
        .map(f => f.path)
    } catch { continue }
  }
  return []
}

// ── GitLab 전체 파일 트리 조회 ───────────────────────────────

async function fetchGitlabTree(
  owner: string, repo: string, branch: string, token?: string, host = 'gitlab.com',
): Promise<string[]> {
  const headers: Record<string, string> = {}
  if (token) headers['PRIVATE-TOKEN'] = token
  const pid = encodeURIComponent(`${owner}/${repo}`)

  for (const ref of branches(branch)) {
    try {
      const paths: string[] = []
      let page = 1
      const MAX_PAGES = 50
      while (page <= MAX_PAGES) {
        const res = await fetch(
          `https://${host}/api/v4/projects/${pid}/repository/tree?recursive=true&ref=${ref}&per_page=100&page=${page}`,
          { headers },
        )
        if (res.status === 401 || res.status === 403) {
          throw new Error(`Token이 유효하지 않거나 접근 권한이 없습니다 (${host} api 스코프 필요)`)
        }
        if (!res.ok) break
        const items = await res.json() as { path: string; type: string }[]
        paths.push(...items.filter(i => i.type === 'blob').map(i => i.path))
        if (items.length < 100) break
        page++
      }
      if (paths.length > 0) return paths
    } catch { continue }
  }
  return []
}

// ── 소스 파일 fetch (확장자 필터) ────────────────────────────

export async function fetchSourceFiles(
  info: RepoInfo,
  token?: string,
  extensions: string[] = ['.java', '.kt', '.ts', '.tsx'],
  onProgress?: (tried: number, total: number) => void,
): Promise<FetchedFile[]> {
  const allPaths = info.platform === 'github'
    ? await fetchGithubTree(info.owner, info.repo, info.branch, token)
    : await fetchGitlabTree(info.owner, info.repo, info.branch, token, info.host)

  const matching = allPaths.filter(p =>
    extensions.some(ext => p.toLowerCase().endsWith(ext))
  )

  const results: FetchedFile[] = []
  let tried = 0

  // 10개씩 청크 단위 병렬 fetch — Rate Limit 및 브라우저 연결 한도 초과 방지
  const CHUNK_SIZE = 10
  for (let i = 0; i < matching.length; i += CHUNK_SIZE) {
    const chunk = matching.slice(i, i + CHUNK_SIZE)
    await Promise.allSettled(
      chunk.map(async path => {
        const filename = path.split('/').pop()!
        let result: { content: string; sha?: string } | null = null

        if (info.platform === 'github') {
          result = await fetchGithub(info.owner, info.repo, path, info.branch, token)
        } else {
          result = await fetchGitlab(info.owner, info.repo, path, info.branch, token, info.host)
        }

        tried++
        onProgress?.(tried, matching.length)

        if (result) {
          results.push({ filename, path, content: result.content, sha: (result as { content: string; sha?: string }).sha })
        }
      }),
    )
  }

  return results
}

// ── 탐색 경로 ─────────────────────────────────────────────

const SEARCH_PATHS = [
  // 루트
  'package.json',
  'build.gradle',
  'build.gradle.kts',
  'pom.xml',
  'gradle.properties',
  // Android 모듈
  'app/build.gradle',
  'app/build.gradle.kts',
  // 모노레포 — 프론트
  'frontend/package.json',
  'client/package.json',
  'web/package.json',
  // 모노레포 — 백엔드
  'backend/build.gradle',
  'backend/build.gradle.kts',
  'backend/pom.xml',
  'server/build.gradle',
  'server/build.gradle.kts',
  'server/pom.xml',
]

// ── 레포 설정 파일 전체 fetch ─────────────────────────────

export async function fetchRepoFiles(
  info: RepoInfo,
  token?: string,
  onProgress?: (tried: number, total: number) => void,
): Promise<FetchedFile[]> {
  // GitLab: 파일 탐색 전 프로젝트 접근 가능 여부 먼저 확인 + 실제 기본 브랜치 취득
  if (info.platform === 'gitlab') {
    const pid = encodeURIComponent(`${info.owner}/${info.repo}`)
    const h: Record<string, string> = {}
    if (token) h['PRIVATE-TOKEN'] = token
    try {
      const probe = await fetch(`https://${info.host}/api/v4/projects/${pid}`, { headers: h })
      if (probe.status === 401 || probe.status === 403) {
        throw new Error(`Token이 유효하지 않거나 접근 권한이 없습니다\n• ${info.host} → Settings → Access Tokens → api 스코프 필요`)
      }
      if (probe.status === 404) {
        throw new Error(`레포를 찾을 수 없습니다\n• URL을 확인하세요 (서브그룹: ${info.host}/group/subgroup/repo)\n• Private 레포라면 Token을 입력하세요`)
      }
      if (!probe.ok) {
        throw new Error(`GitLab API 오류 (${probe.status}) — 잠시 후 다시 시도하세요`)
      }
      // 실제 기본 브랜치로 보정 (develop, release 등 main/master 아닌 경우 대비)
      const projectData = await probe.json()
      if (projectData.default_branch) {
        info = { ...info, branch: projectData.default_branch }
      }
    } catch (e) {
      if (e instanceof TypeError) {
        throw new Error(`${info.host} API 연결 실패 — 네트워크 오류 또는 CORS 문제`)
      }
      throw e
    }
  }

  const found: FetchedFile[] = []
  const seen  = new Set<string>()
  let tried   = 0

  await Promise.allSettled(
    SEARCH_PATHS.map(async path => {
      const filename = path.split('/').pop()!
      let result: { content: string; sha?: string } | null = null

      if (info.platform === 'github') {
        result = await fetchGithub(info.owner, info.repo, path, info.branch, token)
      } else {
        result = await fetchGitlab(info.owner, info.repo, path, info.branch, token, info.host)
      }

      tried++
      onProgress?.(tried, SEARCH_PATHS.length)

      if (result) {
        const key = `${filename}:${path}`
        if (!seen.has(key)) {
          seen.add(key)
          found.push({ filename, path, content: result.content, sha: (result as { content: string; sha?: string }).sha })
        }
      }
    }),
  )

  return found
}

// ── 에러 메시지 해석 ──────────────────────────────────────

export function interpretFetchError(status: number, _platform: 'github' | 'gitlab'): string {
  if (status === 401 || status === 403) return 'Token이 유효하지 않거나 접근 권한이 없습니다'
  if (status === 404) return `레포를 찾을 수 없습니다. Public 레포인지 확인하세요 (Private은 Token 필요)`
  if (status === 429) return `API 요청 한도 초과. 잠시 후 다시 시도하거나 Token을 입력하세요`
  return `fetch 실패 (${status})`
}

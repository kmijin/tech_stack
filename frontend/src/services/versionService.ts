// ──────────────────────────────────────────────────────────
// 공개 API에서 최신 버전을 가져오는 서비스
//
// 소스별 API:
//   npm registry  → React, Vite, Zustand
//   GitHub API    → Spring Boot, QueryDSL
//   Adoptium API  → Java LTS
// ──────────────────────────────────────────────────────────

export interface VersionInfo {
  version: string      // "19.2.0", "4.0.5" 등
  publishedAt: string  // ISO 날짜 문자열
  releaseUrl: string
}

// ── npm registry ──────────────────────────────────────────
async function fetchNpm(pkg: string): Promise<VersionInfo> {
  const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`)
  if (!res.ok) throw new Error(`npm fetch failed: ${pkg}`)
  const data = await res.json()
  return {
    version: data.version,
    publishedAt: data._time ?? data.time ?? '',
    releaseUrl: `https://www.npmjs.com/package/${pkg}`,
  }
}

// ── GitHub Releases API ───────────────────────────────────
async function fetchGithubLatest(owner: string, repo: string): Promise<VersionInfo> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
    { headers: { Accept: 'application/vnd.github+json' } },
  )
  if (!res.ok) throw new Error(`GitHub fetch failed: ${owner}/${repo}`)
  const data = await res.json()
  // tag 예: "v4.0.5" → "4.0.5"
  const version = (data.tag_name as string).replace(/^v/, '')
  return {
    version,
    publishedAt: data.published_at ?? '',
    releaseUrl: data.html_url,
  }
}

// ── Adoptium (Eclipse Temurin) — Java LTS 최신 ────────────
async function fetchJavaLatest(): Promise<VersionInfo> {
  // LTS 버전 목록 조회 후 가장 높은 feature version 선택
  const res = await fetch(
    'https://api.adoptium.net/v3/info/available_releases',
  )
  if (!res.ok) throw new Error('Adoptium fetch failed')
  const data = await res.json()
  const lts: number[] = data.available_lts_releases ?? []
  const latest = Math.max(...lts)

  // 해당 LTS의 최신 GA 릴리스 정보
  const relRes = await fetch(
    `https://api.adoptium.net/v3/assets/latest/${latest}/hotspot?architecture=x64&image_type=jdk&os=linux&vendor=eclipse`,
  )
  if (!relRes.ok) {
    return { version: String(latest), publishedAt: '', releaseUrl: 'https://adoptium.net' }
  }
  const relData = await relRes.json()
  const info = relData?.[0]?.version
  const semver = info
    ? `${info.major}.${info.minor ?? 0}.${info.security ?? 0}`
    : String(latest)
  return {
    version: semver,
    publishedAt: relData?.[0]?.timestamp ?? '',
    releaseUrl: `https://adoptium.net/temurin/releases/?version=${latest}`,
  }
}

// ── 전체 최신 버전 조회 ───────────────────────────────────
export type StackId = 'java' | 'springboot' | 'react' | 'vite' | 'zustand' | 'querydsl'

export async function fetchAllLatestVersions(): Promise<Record<StackId, VersionInfo>> {
  const [java, springboot, react, vite, zustand, querydsl] = await Promise.allSettled([
    fetchJavaLatest(),
    fetchGithubLatest('spring-projects', 'spring-boot'),
    fetchNpm('react'),
    fetchNpm('vite'),
    fetchNpm('zustand'),
    fetchGithubLatest('querydsl', 'querydsl'),
  ])

  function unwrap(r: PromiseSettledResult<VersionInfo>, fallback: VersionInfo): VersionInfo {
    return r.status === 'fulfilled' ? r.value : fallback
  }

  return {
    java:       unwrap(java,       { version: '25',     publishedAt: '2025-09-16', releaseUrl: 'https://adoptium.net' }),
    springboot: unwrap(springboot, { version: '4.0.5',  publishedAt: '2025-11-20', releaseUrl: 'https://spring.io' }),
    react:      unwrap(react,      { version: '19.2.0', publishedAt: '2025-10-01', releaseUrl: 'https://react.dev' }),
    vite:       unwrap(vite,       { version: '6.3.0',  publishedAt: '2024-11-26', releaseUrl: 'https://vite.dev' }),
    zustand:    unwrap(zustand,    { version: '5.0.9',  publishedAt: '2024-10-01', releaseUrl: 'https://github.com/pmndrs/zustand' }),
    querydsl:   unwrap(querydsl,   { version: '5.1.0',  publishedAt: '2023-12-01', releaseUrl: 'https://github.com/querydsl/querydsl' }),
  }
}

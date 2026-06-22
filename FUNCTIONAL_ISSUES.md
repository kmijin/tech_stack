# 기능 검토 — 버그 및 개선사항

> 검토일: 2026-06-22  
> 검토 방법: Playwright 브라우저 직접 조작 + 전체 소스코드 정적 분석

---

## 목차

1. [Critical — 런타임 크래시](#critical--런타임-크래시)
2. [High — 사용자에게 잘못된 결과 또는 무응답](#high--사용자에게-잘못된-결과-또는-무응답)
3. [Medium — 데이터 정확성 · 피드백 부재](#medium--데이터-정확성--피드백-부재)
4. [Low — UX · 경고성](#low--ux--경고성)
5. [우선순위 요약](#우선순위-요약)

---

## Critical — 런타임 크래시

### [FUNC-01] `toBase64` 대용량 파일에서 스택 오버플로

- **파일**: `frontend/src/services/repoPusher.ts:21`
- **증상**: 수백 개 의존성을 가진 `pom.xml`(~100KB 이상) 또는 대형 `package.json`을 GitHub에 커밋할 때 `Maximum call stack size exceeded` 에러 발생 → 브랜치 생성 전체 실패
- **원인**: `String.fromCharCode(...bytes)` spread 연산자가 대형 `Uint8Array`를 인자로 전개할 때 JS 콜 스택 한도 초과

```ts
// 현재 (문제)
function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  return btoa(String.fromCharCode(...bytes))  // ← 대형 배열 전체 spread → 스택 오버플로
}

// 수정 — 32KB 청크 단위 spread
// - 단순 for 루프(binary += ...)는 스택 오버플로는 해결되지만,
//   JS 문자열 불변성으로 인해 반복마다 새 객체 생성 → 대용량에서 느림
// - subarray로 32KB씩 잘라 spread하면 스택 한도에도 걸리지 않고 빠름
//   (200KB pom.xml 기준 7번 반복으로 처리)
function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  const CHUNK = 0x8000 // 32KB
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}
```

---

## High — 사용자에게 잘못된 결과 또는 무응답

### [FUNC-02] GitHub 429(Rate Limit) 무응답 처리

- **파일**: `frontend/src/services/repoFetcher.ts:75`
- **증상**: 토큰 없이 public repo를 조회하면 시간당 60회 제한 소진 후 아무 안내 없이 빈 결과만 반환. 많은 사용자가 동시에 접속할수록 빠르게 소진.
- **원인**: `if (!res.ok) continue` — 404, 429, 401 모두 동일하게 무시하고 다음 브랜치로 넘어감

```ts
// 현재 (문제) — fetchGithub() 내부
if (!res.ok) continue

// 수정
if (res.status === 401 || res.status === 403) {
  throw new Error('Token 권한을 확인하세요 (repo 스코프 필요)')
}
if (res.status === 429) {
  throw new Error(
    'GitHub API 요청 한도 초과 (60회/시간) — Token을 입력하면 5,000회/시간으로 늘어납니다'
  )
}
if (!res.ok) continue
```

> `fetchGithubTree()` (line 127) 도 동일 패턴 — 함께 수정 필요

---

### [FUNC-03] 대형 레포 파일 탐색 5,000개 한도 무통보 절단

- **파일**: `frontend/src/services/repoFetcher.ts:154`
- **증상**: GitLab 레포의 파일이 5,000개를 초과하면 탐색이 조용히 멈춤. 소스 파일 일부가 누락된 채로 마이그레이션이 진행되는데 사용자는 전혀 알 수 없음.
- **원인**: `while (page <= MAX_PAGES)` 루프가 50페이지(5,000개)에서 중단되지만, 페이지 한도 초과 여부를 외부로 알리는 반환값이 없음

```ts
// 현재 (문제) — fetchGitlabTree() 반환
return paths  // 5,000개 초과 여부를 알 수 없음

// 수정 — 반환 타입 변경
interface TreeResult {
  paths: string[]
  truncated: boolean  // 한도 초과 여부
}

// 루프 내 한도 초과 감지
let truncated = false
while (page <= MAX_PAGES) {
  ...
  if (items.length < 100) break
  if (page === MAX_PAGES) { truncated = true; break }
  page++
}
return { paths, truncated }

// TechNewsBoard에서 사용 시
if (treeResult.truncated) {
  setScanWarning('파일이 5,000개를 초과해 일부만 스캔됐습니다. 소스 변환 결과를 반드시 직접 검토하세요.')
}
```

---

### [FUNC-04] AI 변환 실패 시 에러 완전 무시

- **파일**: `frontend/src/TechNewsBoard.tsx:1632`
- **증상**: Claude API 키 만료, 네트워크 오류, Rate Limit(429) 등 어떤 이유로 AI 변환이 실패해도 사용자에게 아무 피드백이 없음. 복잡한 패턴(`WebSecurityConfigurerAdapter` 등)이 변환 안 된 채로 커밋됨.
- **원인**: catch 블록이 에러를 완전히 삼킴

```ts
// 현재 (문제)
try {
  const aiResult = await aiTransformFile(...)
  if (aiResult) { newContent = aiResult }
} catch { /* AI 실패 시 단순 결과 유지 */ }

// 수정
try {
  const aiResult = await aiTransformFile(...)
  if (aiResult) { newContent = aiResult }
} catch (e) {
  const reason = e instanceof Error ? e.message : '알 수 없는 오류'
  // AI 실패 파일을 수동 확인 목록으로 이동
  manualList.push({
    path: file.path,
    patterns: complex.map(p => ({ ...p })),
    aiError: `AI 변환 실패: ${reason}`,
  })
}
```

> `aiTransformer.ts:162-165` 에서 HTTP 상태코드별 메시지도 개선:

```ts
// 현재
throw new Error(err?.error?.message ?? `API 오류 (${res.status})`)

// 수정
if (res.status === 401) throw new Error('Anthropic API 키가 유효하지 않습니다. 키를 확인하세요.')
if (res.status === 429) throw new Error('Anthropic API 요청 한도 초과. 잠시 후 다시 시도하세요.')
if (res.status >= 500) throw new Error('Anthropic 서버 오류. 잠시 후 다시 시도하세요.')
throw new Error(err?.error?.message ?? `API 오류 (${res.status})`)
```

---

### [FUNC-05] `rewriteGradleProperties` `g` 플래그 누락 — 중복 키 첫 번째만 교체

- **파일**: `frontend/src/services/versionRewriter.ts:143-151`
- **증상**: `gradle.properties`에 동일 키가 두 번 이상 등장(이전 버전 주석 처리 후 새 값 추가한 경우 등)하면 첫 번째만 교체되고 나머지는 그대로 남음. 커밋 후 실제 적용되는 값이 두 번째 키일 수 있어 버전이 바뀌지 않은 것처럼 동작.
- **원인**: `String.prototype.replace()`는 `g` 플래그 없으면 첫 번째 매칭만 교체

```ts
// 현재 (문제)
out = out.replace(/(springBootVersion\s*=\s*).+/,  `$1${ver}`)
out = out.replace(/(spring_boot_version\s*=\s*).+/, `$1${ver}`)
out = out.replace(/(javaVersion\s*=\s*).+/,         `$1${jv}`)
out = out.replace(/(sourceCompatibility\s*=\s*).+/, `$1${jv}`)
out = out.replace(/(targetCompatibility\s*=\s*).+/, `$1${jv}`)

// 수정 — 모두 g 플래그 추가
out = out.replace(/(springBootVersion\s*=\s*).+/g,  `$1${ver}`)
out = out.replace(/(spring_boot_version\s*=\s*).+/g, `$1${ver}`)
out = out.replace(/(javaVersion\s*=\s*).+/g,         `$1${jv}`)
out = out.replace(/(sourceCompatibility\s*=\s*).+/g, `$1${jv}`)
out = out.replace(/(targetCompatibility\s*=\s*).+/g, `$1${jv}`)
```

---

## Medium — 데이터 정확성 · 피드백 부재

### [FUNC-06] URL 유효성 검사 지연 — 입력 즉시 피드백 없음

- **파일**: `frontend/src/TechNewsBoard.tsx` (RepoBranchPanel URL 입력부)
- **증상**: `https://github.com/owner` 처럼 repo 없는 URL을 입력해도 "가져오기" 버튼 클릭 전까지 아무 표시 없음. 사용자가 fetch 타임아웃까지 기다린 후에야 실패를 알게 됨.
- **수정**: URL 입력 `onChange`에서 `parseRepoUrl()`로 실시간 검사 후 인라인 에러 표시

```tsx
// 수정
const [urlError, setUrlError] = useState<string | null>(null)

function handleUrlChange(val: string) {
  setUrl(val)
  if (!val.trim()) { setUrlError(null); return }
  const parsed = parseRepoUrl(val)
  setUrlError(parsed ? null : 'GitHub 또는 GitLab URL 형식을 확인하세요 (예: https://github.com/owner/repo)')
}

// 입력 필드 아래
{urlError && <p className="text-xs text-red-500 mt-1">{urlError}</p>}
```

---

### [FUNC-07] `configParser` JSON 파싱 실패 메시지 불명확

- **파일**: `frontend/src/services/configParser.ts:152`
- **증상**: `package.json`이 JSON 문법 오류인 경우 `warnings: ['JSON 파싱 실패']`를 반환하지만 UI에서는 "0개 버전 추출됨"으로만 보임. 사용자가 파일이 손상된 건지 지원 버전이 없는 건지 구분 불가.
- **수정**: warnings가 있을 경우 UI에서 별도 표시

```tsx
// RepoBranchPanel 파일 목록 표시 부분에 추가
{parsedFile.warnings.length > 0 && (
  <p className="text-xs text-amber-600 mt-1">
    ⚠ {parsedFile.warnings.join(' / ')}
  </p>
)}
```

---

## Low — UX · 경고성

### [FUNC-08] favicon.ico 없음 — 브라우저 콘솔 404 에러

- **파일**: `frontend/public/` 디렉토리 자체 없음
- **증상**: 브라우저 콘솔에 `GET /favicon.ico 404` 에러가 계속 찍힘. 사용자가 처음 DevTools를 열면 바로 눈에 띔.
- **수정**: `frontend/public/` 디렉토리 생성 후 `favicon.ico` 또는 `favicon.svg` 추가

```html
<!-- index.html <head>에 추가 -->
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

```svg
<!-- frontend/public/favicon.svg — 간단한 예시 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <text y="26" font-size="28">📡</text>
</svg>
```

---

### [FUNC-09] 모바일 / 좁은 화면 레이아웃 미지원

- **파일**: `frontend/src/TechNewsBoard.tsx` (전반)
- **증상**: 1,024px 미만 화면(태블릿·노트북)에서 카드 그리드가 넘치거나 입력 필드가 잘림. 내부 도구라도 듀얼 모니터 없는 환경에서 한쪽에 띄워 쓰면 UI 깨짐.
- **수정 방향**: 버전 카드 그리드 `grid-cols-3 → sm:grid-cols-2 lg:grid-cols-3`, 입력 패널 `flex → flex-wrap`으로 조정

---

## 우선순위 요약

| 순위 | ID | 항목 | 파일 | 영향 |
|------|----|------|------|------|
| 🔴 Critical | FUNC-01 | `toBase64` 스택 오버플로 | `repoPusher.ts:21` | 대형 파일 커밋 전체 실패 |
| 🔴 High | FUNC-02 | GitHub 429 무응답 | `repoFetcher.ts:75` | 토큰 없는 사용자 무한 대기 |
| 🔴 High | FUNC-03 | 대형 레포 절단 무통보 | `repoFetcher.ts:154` | 불완전 마이그레이션 감지 불가 |
| 🔴 High | FUNC-04 | AI 실패 에러 완전 무시 | `TechNewsBoard.tsx:1632` | 복잡 패턴 미변환 채로 커밋 |
| 🟡 Medium | FUNC-05 | `g` 플래그 누락 | `versionRewriter.ts:143` | 중복 키 환경에서 버전 미교체 |
| 🟡 Medium | FUNC-06 | URL 검사 지연 | `TechNewsBoard.tsx` | 잘못된 URL 피드백 늦음 |
| 🟡 Medium | FUNC-07 | JSON 파싱 실패 메시지 불명확 | `configParser.ts:152` | 오류 원인 구분 불가 |
| 🟢 Low | FUNC-08 | favicon 없음 | `frontend/public/` | 콘솔 404 에러 노출 |
| 🟢 Low | FUNC-09 | 반응형 미지원 | `TechNewsBoard.tsx` | 좁은 화면 레이아웃 깨짐 |

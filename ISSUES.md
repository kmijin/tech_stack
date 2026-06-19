# 버그 및 개선사항 목록

> 분석일: 2026-06-19

---

## 목차

1. [Critical — 보안](#critical--보안)
2. [High — 버그](#high--버그)
3. [High — 에러 핸들링](#high--에러-핸들링)
4. [Medium — 성능](#medium--성능)
5. [Medium — 코드 품질](#medium--코드-품질)
6. [Low — UX](#low--ux)
7. [우선순위 요약](#우선순위-요약)

---

## Critical — 보안

### [SEC-01] Anthropic API 키 브라우저 직접 노출

- **파일**: `frontend/src/services/aiTransformer.ts:147`
- **문제**: `x-api-key` 헤더가 브라우저 DevTools Network 탭에 그대로 노출됨. 공용 PC 사용 시 키 탈취 가능.
- **전제**: 사용자가 자신의 개인 키를 직접 입력하는 내부 도구 → 백엔드 프록시 없이 완화로 충분

```ts
// 현재 코드
headers: {
  'x-api-key': apiKey,
  'anthropic-dangerous-direct-browser-access': 'true',
}
```

- **해결 방법**:
  1. 키 입력 필드 옆에 경고 문구 표시 — "공용 PC에서는 사용 후 키를 초기화하세요"
  2. AI 변환 완료 후 키 자동 초기화 옵션 제공 (체크박스)
  3. 사용자에게 Anthropic 대시보드에서 월 사용량 한도 설정 권고

---

## High — 버그

### [BUG-01] `useMemo` 안에서 `setState` 호출 (React 안티패턴)

- **파일**: `frontend/src/TechNewsBoard.tsx:1554`
- **문제**: `useMemo`는 값을 반환하기 위한 Hook. 내부에서 `setState`를 호출하면 렌더링 흐름이 예측 불가능해짐.

```ts
// Before
useMemo(() => { setBranchName(generateBranchName(targetVersions)) }, [targetVersions])

// After
useEffect(() => { setBranchName(generateBranchName(targetVersions)) }, [targetVersions])
```

---

### [BUG-02] `Math.max` 빈 배열 전달 시 `-Infinity` 반환

- **파일**: `frontend/src/services/versionService.ts:73`
- **문제**: `available_lts_releases`가 빈 배열이면 `Math.max(...[])` → `-Infinity` 반환. 이후 fetch URL이 `/assets/latest/Infinity/hotspot...`이 되어 비정상 동작.

```ts
// Before
const lts: number[] = data.available_lts_releases ?? []
const latest = Math.max(...lts)

// After
const lts: number[] = data.available_lts_releases ?? []
if (lts.length === 0) throw new Error('No LTS releases found')
const latest = Math.max(...lts)
```

---

### [BUG-03] `parseMajor` 정규식 `g` 플래그 누락

- **파일**: `frontend/src/services/compatSimulator.ts:65`
- **문제**: `/[^\d]/`는 첫 번째 비숫자 문자만 제거. `"^18.0.0"` → `"180.0"` → `parseInt` 결과 `180` 반환.

```ts
// Before
parseInt(v.replace(/[^\d]/, '')) || 0

// After
parseInt(v.replace(/[^\d.]/g, '')) || 0
```

---

### [BUG-04] deprecated `unescape()` 사용

- **파일**: `frontend/src/services/repoPusher.ts:19`
- **문제**: `unescape()`는 Web 표준에서 deprecated된 함수. 브라우저마다 동작이 다를 수 있음.

```ts
// Before
function toBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
}

// After
function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  return btoa(String.fromCharCode(...bytes))
}
```

---

### [BUG-05] GitLab 파일 트리 조회 무한 루프 가능성

- **파일**: `frontend/src/services/repoFetcher.ts:154`
- **문제**: 페이지당 100개 이상 반환되거나 API 버그 시 루프 탈출 조건이 없어 무한 루프 발생 가능.

```ts
// Before
while (true) {
  ...
  if (items.length < 100) break
  page++
}

// After
const MAX_PAGES = 50
while (page <= MAX_PAGES) {
  ...
  if (items.length < 100) break
  page++
}
```

---

### [BUG-06] `repoInfo!` non-null assertion으로 런타임 오류 가능

- **파일**: `frontend/src/TechNewsBoard.tsx:2960`
- **문제**: `fetchedFiles.length > 0`이어도 `repoInfo`가 `null`인 비정상 상태에서 런타임 오류 발생 가능.

```tsx
// Before
{fetchedFiles.length > 0 && <BranchCreator repoInfo={repoInfo!} ...>}

// After
{fetchedFiles.length > 0 && repoInfo !== null && <BranchCreator repoInfo={repoInfo} ...>}
```

---

### [BUG-07] GitHub API 브랜치 생성 body에 불필요한 `base` 필드

- **파일**: `frontend/src/services/repoPusher.ts:60`
- **문제**: GitHub Git References API (`POST /git/refs`)는 `ref`와 `sha`만 받음. `base`는 없는 필드.

```ts
// Before
body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha, base: baseBranch })

// After
body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha })
```

---

### [BUG-08] GitLab 브랜치 HTTP 400을 무조건 성공으로 처리

- **파일**: `frontend/src/services/repoPusher.ts:113`
- **문제**: 400은 "이미 존재" 또는 "잘못된 요청" 두 경우를 포함. 잘못된 요청도 `created = true`가 되어 이후 커밋이 실패.

```ts
// Before
if (brRes.ok || brRes.status === 400) { created = true; break }

// After
if (brRes.ok) { created = true; break }
if (brRes.status === 400) {
  const body = await brRes.json().catch(() => ({}))
  if (body?.message?.includes('already exists')) { created = true; break }
  throw new Error(body?.message ?? 'Branch creation failed')
}
```

---

## High — 에러 핸들링

### [ERR-01] 소스 스캔 실패를 조용히 무시

- **파일**: `frontend/src/TechNewsBoard.tsx:1608`
- **문제**: 소스 파일 스캔 실패 시 catch 블록에서 아무 피드백 없이 무시. 사용자는 스캔이 실패했는지 알 수 없음.

```ts
// Before
} catch {
  // 소스 스캔 실패해도 설정 파일 커밋은 진행
}

// After
} catch (e) {
  setScanError(`소스 파일 스캔 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`)
  // 결과 화면에 경고 배너로 표시
}
```

---

### [ERR-02] `FileReader.onerror` 핸들러 누락

- **파일**: `frontend/src/TechNewsBoard.tsx` (`ConfigDropZone` 내부)
- **문제**: 파일 읽기 실패(퍼미션 오류, 파일 사라짐 등) 시 아무 피드백 없음.

```ts
// After
reader.onerror = () => alert(`파일 읽기 실패: ${file.name}`)
```

---

## Medium — 성능

### [PERF-01] 소스 파일 수백 개를 제한 없이 동시 fetch

- **파일**: `frontend/src/services/repoFetcher.ts:193`
- **문제**: 대규모 레포에서 수백 개 파일을 동시 요청 → GitHub Rate Limit 초과 또는 브라우저 연결 한도 초과.

```ts
// Before
await Promise.allSettled(matching.map(async path => fetchFile(path)))

// After — 10개씩 청크 처리
const CHUNK_SIZE = 10
for (let i = 0; i < matching.length; i += CHUNK_SIZE) {
  const chunk = matching.slice(i, i + CHUNK_SIZE)
  const results = await Promise.allSettled(chunk.map(path => fetchFile(path)))
  // 결과 수집
}
```

---

### [PERF-02] 렌더링마다 `parseConfigFile` 반복 호출

- **파일**: `frontend/src/TechNewsBoard.tsx:1478`
- **문제**: DOMParser 등 무거운 파싱 작업이 렌더링 사이클마다 반복 실행됨.

```ts
// Before
{foundFiles.map((f) => {
  const { versions } = parseConfigFile(f.filename, f.content)  // 렌더링마다 실행
  ...
})}

// After — useMemo로 캐싱
const parsedFiles = useMemo(() =>
  fetchedFiles.map(f => ({ ...f, parsed: parseConfigFile(f.filename, f.content) })),
  [fetchedFiles]
)
```

---

### [PERF-03] `gcTime`이 `staleTime`보다 짧음

- **파일**: `frontend/src/hooks/useLatestVersions.ts`
- **문제**: `staleTime` 30분인데 `gcTime` 기본값 5분 → 컴포넌트 언마운트 시 캐시 조기 삭제.

```ts
// After
useQuery({
  staleTime: 1000 * 60 * 30,
  gcTime: 1000 * 60 * 35,  // staleTime보다 길게 설정
})
```

---

## Medium — 코드 품질

### [QUAL-01] `parseFloat`로 버전 비교 시 의미론적 오류

- **파일**: `frontend/src/services/migrationGuide.ts:184`
- **문제**: `parseFloat("3.10")` → `3.1`. Spring Boot 3.10 같은 버전이 나오면 버전 비교 오류 발생.

```ts
// Before
const v = (ver: string) => parseFloat(ver?.replace(/[^0-9.]/g, '') ?? '0') || 0

// After
const v = (ver: string) => {
  const [major, minor = 0] = (ver ?? '0').replace(/[^0-9.]/g, '').split('.').map(Number)
  return major * 100 + minor  // 3.10 → 310, 4.0 → 400 (정확한 비교)
}
```

---

### [QUAL-02] Vite STACK 데이터 불일치

- **파일**: `frontend/src/TechNewsBoard.tsx:214`
- **문제**: `latestVersion: '8'`인데 `releaseDate`와 `link`는 Vite 6 기준으로 데이터 일관성이 없음.
- **해결 방법**: `latestVersion`, `releaseDate`, `link`를 실제 최신 버전 기준으로 통일.

---

## Low — UX

### [UX-01] 파일 선택 버튼에 `ExternalLink` 아이콘 사용

- **파일**: `frontend/src/TechNewsBoard.tsx:583`
- **문제**: 외부 링크 아이콘을 파일 선택 버튼에 사용해 사용자가 외부 링크로 이동한다고 오인 가능.

```tsx
// Before
<ExternalLink size={12} /> 파일 선택

// After
<Upload size={12} /> 파일 선택
```

---

### [UX-02] 폴더 스캔 진행 바가 항상 100%

- **파일**: `frontend/src/TechNewsBoard.tsx` (`ScriptPanel` 내부)
- **문제**: `w-full`로 항상 100% 너비 표시. `progress.scanned` 값이 있는데 미반영.

```tsx
// Before
<div className="h-full bg-violet-500 rounded-full animate-pulse w-full" />

// After
<div
  className="h-full bg-violet-500 rounded-full transition-all"
  style={{ width: `${Math.min(100, (progress.scanned / progress.total) * 100)}%` }}
/>
```

---

### [UX-03] 붙여넣기 시 파일명 `'unknown'` 고정

- **파일**: `frontend/src/TechNewsBoard.tsx` (`ConfigDropZone` 내부)
- **문제**: 파일 타입 선택 수단 없이 `'unknown'`으로 전달되어 자동 감지 실패 시 오파싱 가능.
- **해결 방법**: 붙여넣기 UI에 파일 타입 선택 드롭다운 추가.

```tsx
<select value={pasteFileType} onChange={e => setPasteFileType(e.target.value)}>
  <option value="auto">자동 감지</option>
  <option value="package.json">package.json</option>
  <option value="build.gradle">build.gradle</option>
  <option value="build.gradle.kts">build.gradle.kts</option>
  <option value="pom.xml">pom.xml</option>
  <option value="gradle.properties">gradle.properties</option>
</select>
```

---

### [UX-04] 브랜치 생성 버튼 disabled 사유 미표시

- **파일**: `frontend/src/TechNewsBoard.tsx:1689`
- **문제**: 4가지 disabled 조건 중 어떤 이유로 버튼이 비활성인지 사용자에게 표시되지 않음.

```tsx
// After
{rewritePlan.length === 0 && (
  <p className="text-sm text-gray-400">설정 파일을 먼저 가져오세요.</p>
)}
{rewritePlan.length > 0 && allChanges.length === 0 && (
  <p className="text-sm text-gray-400">변경할 버전이 현재와 동일합니다.</p>
)}
```

---

## 우선순위 요약

| 순위 | ID | 항목 | 파일 |
|------|----|------|------|
| 🔴 Critical | SEC-01 | API 키 브라우저 직접 노출 | `aiTransformer.ts:147` |
| 🔴 High | BUG-01 | `useMemo` 내 setState | `TechNewsBoard.tsx:1554` |
| 🔴 High | BUG-02 | `Math.max` 빈 배열 → Infinity | `versionService.ts:73` |
| 🔴 High | BUG-03 | `parseMajor` 정규식 버그 | `compatSimulator.ts:65` |
| 🔴 High | BUG-04 | deprecated `unescape` | `repoPusher.ts:19` |
| 🔴 High | BUG-05 | GitLab 무한 루프 | `repoFetcher.ts:154` |
| 🔴 High | BUG-06 | `repoInfo!` 런타임 오류 가능 | `TechNewsBoard.tsx:2960` |
| 🔴 High | BUG-07 | GitHub API 불필요한 `base` 필드 | `repoPusher.ts:60` |
| 🔴 High | BUG-08 | GitLab 400 무조건 성공 처리 | `repoPusher.ts:113` |
| 🔴 High | ERR-01 | 소스 스캔 실패 무시 | `TechNewsBoard.tsx:1608` |
| 🔴 High | ERR-02 | FileReader 오류 핸들러 누락 | `TechNewsBoard.tsx` |
| 🟡 Medium | PERF-01 | 무제한 병렬 fetch | `repoFetcher.ts:193` |
| 🟡 Medium | PERF-02 | 렌더링 중 반복 파싱 | `TechNewsBoard.tsx:1478` |
| 🟡 Medium | PERF-03 | `gcTime` < `staleTime` | `useLatestVersions.ts` |
| 🟡 Medium | QUAL-01 | `parseFloat` 버전 비교 오류 | `migrationGuide.ts:184` |
| 🟡 Medium | QUAL-02 | Vite 버전 데이터 불일치 | `TechNewsBoard.tsx:214` |
| 🟢 Low | UX-01 | 잘못된 아이콘 | `TechNewsBoard.tsx:583` |
| 🟢 Low | UX-02 | 진행 바 항상 100% | `TechNewsBoard.tsx` |
| 🟢 Low | UX-03 | 붙여넣기 파일 타입 선택 없음 | `TechNewsBoard.tsx` |
| 🟢 Low | UX-04 | 버튼 disabled 사유 미표시 | `TechNewsBoard.tsx:1689` |

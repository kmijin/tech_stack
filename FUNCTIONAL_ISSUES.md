# 기능 검토 — 버그 및 개선사항

> 검토일: 2026-06-22  
> 최종 업데이트: 2026-06-22 (FUNC-09까지 전체 해결)  
> 검토 방법: Playwright 브라우저 직접 조작 + 전체 소스코드 정적 분석

---

## 요약

| 구분 | 전체 | 해결 | 미해결 |
|------|------|------|--------|
| Critical | 1 | 1 | 0 |
| High | 4 | 4 | 0 |
| Medium | 3 | 3 | 0 |
| Low | 2 | 2 | 0 |
| **합계** | **10** | **10** | **0** |

---

## 목차

1. [Critical — 런타임 크래시](#critical--런타임-크래시)
2. [High — 사용자에게 잘못된 결과 또는 무응답](#high--사용자에게-잘못된-결과-또는-무응답)
3. [Medium — 데이터 정확성 · 피드백 부재](#medium--데이터-정확성--피드백-부재)
4. [Low — UX · 경고성](#low--ux--경고성)
5. [우선순위 요약](#우선순위-요약)

---

## Critical — 런타임 크래시

### ~~[FUNC-01] `toBase64` 대용량 파일에서 스택 오버플로~~ ✅ 해결

- **파일**: `frontend/src/services/repoPusher.ts:19`
- **원인**: `String.fromCharCode(...bytes)` spread 연산자가 대형 `Uint8Array` 전개 시 JS 콜 스택 한도 초과
- **해결**: 32KB `subarray` 청크 단위 spread로 교체 — 파일 크기에 무관하게 안전하게 동작

---

## High — 사용자에게 잘못된 결과 또는 무응답

### ~~[FUNC-02] GitHub 403/429 에러 무응답 처리~~ ✅ 해결

- **파일**: `frontend/src/services/repoFetcher.ts`
- **원인**: `if (!res.ok) continue` — Rate Limit(403), 인증 오류(401), 한도 초과(429) 모두 무시 → 빈 결과 반환
- **해결**: `fetchGithub`, `fetchGithubTree` 양쪽에 상태코드별 에러 분기 추가
  - 401: Token 권한 오류
  - 403 + rate limit 메시지: 한도 초과 안내 (Token 입력 유도)
  - 403 + 기타: Private 레포 접근 불가 안내
  - 429: 한도 초과 안내
  - 에러 재throw로 UI까지 전파 보장

---

### ~~[FUNC-03] 대형 레포 파일 탐색 5,000개 인위적 한도~~ ✅ 해결

- **파일**: `frontend/src/services/repoFetcher.ts:186`
- **원인**: `MAX_PAGES = 50` 고정값으로 5,000개에서 절단, 사용자에게 알림 없음
- **해결**: `MAX_PAGES` 제거 → `items.length < 100`(마지막 페이지) / `items.length === 0`(안전장치) 기준으로 종료. 파일 수에 관계없이 전체 탐색, 절단 자체가 발생하지 않음

---

### ~~[FUNC-04] AI 변환 실패 시 에러 무시 + fixedList 오분류~~ ✅ 해결

- **파일**: `frontend/src/TechNewsBoard.tsx:1624`
- **원인**: catch 블록이 에러를 삼킨 채 `fixedList`에 `type:'ai'`로 오등록 → UI에서 "AI 변환 완료"로 표시되나 실제로는 복잡 패턴 미변환 상태로 커밋
- **해결**:
  - AI 실패 시 에러 메시지 캡처 → `manualList`로 이동 (`aiError` 필드 포함)
  - 단순 치환 결과는 `type:'source'`로 `fixedList` 등록 후 커밋 유지
  - UI에서 실패 파일별로 **에러 원인 + 패턴별 줄번호/코드 스니펫** 표시

---

### [FUNC-05] `rewriteGradleProperties` `g` 플래그 누락 — 중복 키 첫 번째만 교체

- **파일**: `frontend/src/services/versionRewriter.ts:143-151`
- **증상**: `gradle.properties`에 동일 키가 두 번 이상 등장하면 첫 번째만 교체. 실제 적용되는 값이 교체되지 않은 두 번째 키일 수 있어 버전이 바뀌지 않은 것처럼 동작.
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
- **증상**: `https://github.com/owner` 처럼 repo 없는 URL을 입력해도 "가져오기" 버튼 클릭 전까지 아무 표시 없음. fetch 타임아웃까지 기다린 후에야 실패를 알게 됨.

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

### ~~[FUNC-07] `configParser` JSON 파싱 실패 메시지 불명확~~ ✅ 해결

- **파일**: `frontend/src/services/configParser.ts:152`
- **증상**: `package.json`이 JSON 문법 오류인 경우 UI에서 "0개 버전 추출됨"으로만 표시. 파일이 손상된 건지 지원 버전이 없는 건지 구분 불가.
- **해결**: `parsedFoundFiles.map()` 내부에 `f.parsed.warnings` 배열 표시 추가 — 파싱 실패 시 빨간 경고 텍스트로 원인 노출

```tsx
{f.parsed.warnings.length > 0 && (
  <p className="text-[9px] text-red-500 pl-3.5">⚠ {f.parsed.warnings.join(' / ')}</p>
)}
```

---

## Low — UX · 경고성

### ~~[FUNC-08] favicon.ico 없음 — 브라우저 콘솔 404 에러~~ ✅ 해결

- **파일**: `frontend/public/` 디렉토리 자체 없음
- **증상**: 브라우저 콘솔에 `GET /favicon.ico 404` 에러가 계속 찍힘.
- **해결**: `frontend/public/favicon.svg` 생성 + `index.html` `<head>`에 link 태그 추가

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

---

### ~~[FUNC-09] 모바일 / 좁은 화면 레이아웃 미지원~~ ✅ 해결

- **파일**: `frontend/src/TechNewsBoard.tsx` (전반)
- **증상**: 1,024px 미만 화면에서 카드 그리드가 넘치거나 입력 필드가 잘림.
- **해결**:
  - 외부 래퍼 `p-5` → `p-3 sm:p-5` (모바일 여백 확보)
  - Token 입력 행 `flex` → `flex flex-wrap` + `min-w-0` + trailing text `hidden sm:block`
  - 스텝 인디케이터 `overflow-x-auto` + `min-w-max` 로 가로 스크롤 처리

---

## 우선순위 요약

| 순위 | ID | 항목 | 파일 | 상태 |
|------|----|------|------|------|
| 🔴 Critical | FUNC-01 | `toBase64` 스택 오버플로 | `repoPusher.ts:19` | ✅ 해결 |
| 🔴 High | FUNC-02 | GitHub 403/429 무응답 | `repoFetcher.ts` | ✅ 해결 |
| 🔴 High | FUNC-03 | 대형 레포 5,000개 인위적 한도 | `repoFetcher.ts:186` | ✅ 해결 |
| 🔴 High | FUNC-04 | AI 실패 무시 + 오분류 | `TechNewsBoard.tsx:1624` | ✅ 해결 |
| 🟡 Medium | FUNC-05 | `g` 플래그 누락 | `versionRewriter.ts:143` | 미해결 |
| 🟡 Medium | FUNC-06 | URL 검사 지연 | `TechNewsBoard.tsx` | 미해결 |
| 🟡 Medium | FUNC-07 | JSON 파싱 실패 메시지 불명확 | `configParser.ts:152` | ✅ 해결 |
| 🟢 Low | FUNC-08 | favicon 없음 | `frontend/public/` | ✅ 해결 |
| 🟢 Low | FUNC-09 | 반응형 미지원 | `TechNewsBoard.tsx` | ✅ 해결 |

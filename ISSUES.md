# 버그 및 개선사항 목록

> 분석일: 2026-06-19  
> 최종 업데이트: 2026-06-22 — **전체 이슈 해결 완료**

---

## 요약

| 구분 | 전체 | 해결 | 미해결 |
|------|------|------|--------|
| Critical | 1 | 1 | 0 |
| High (버그) | 8 | 8 | 0 |
| High (에러 핸들링) | 2 | 2 | 0 |
| Medium (성능) | 3 | 3 | 0 |
| Medium (코드 품질) | 2 | 2 | 0 |
| Low (UX) | 4 | 4 | 0 |
| **합계** | **20** | **20** | **0** |

---

## Critical — 보안

### ~~[SEC-01] Anthropic API 키 브라우저 직접 노출~~ ✅ 해결

- **파일**: `frontend/src/services/aiTransformer.ts:147`
- **해결**: 키 입력 필드 옆 경고 문구 추가("공용 PC에서는 주의하세요"), 브랜치 생성 완료 후 키 자동 초기화 체크박스 구현, `onClearKey` 콜백으로 키 초기화 처리

---

## High — 버그

### ~~[BUG-01] `useMemo` 안에서 `setState` 호출~~ ✅ 해결

- **파일**: `frontend/src/TechNewsBoard.tsx:1592`
- **해결**: `useMemo` → `useEffect`로 교체

### ~~[BUG-02] `Math.max` 빈 배열 전달 시 `-Infinity` 반환~~ ✅ 해결

- **파일**: `frontend/src/services/versionService.ts:73`
- **해결**: `lts.length === 0` 가드 추가 후 `Math.max` 호출

### ~~[BUG-03] `parseMajor` 정규식 `g` 플래그 누락~~ ✅ 해결

- **파일**: `frontend/src/services/compatSimulator.ts:65`
- **해결**: `/[^\d]/` → `/[^\d.]/g` (g 플래그 + `.` 보존)

### ~~[BUG-04] deprecated `unescape()` 사용~~ ✅ 해결

- **파일**: `frontend/src/services/repoPusher.ts:19`
- **해결**: `unescape(encodeURIComponent(str))` → `TextEncoder().encode(str)` + `String.fromCharCode(...bytes)`

### ~~[BUG-05] GitLab 파일 트리 조회 무한 루프 가능성~~ ✅ 해결

- **파일**: `frontend/src/services/repoFetcher.ts:154`
- **해결**: `while (true)` → `const MAX_PAGES = 50; while (page <= MAX_PAGES)`

### ~~[BUG-06] `repoInfo!` non-null assertion으로 런타임 오류 가능~~ ✅ 해결

- **파일**: `frontend/src/TechNewsBoard.tsx:3023`
- **해결**: `fetchedFiles.length > 0 && repoInfo !== null &&` 로 명시적 null 체크

### ~~[BUG-07] GitHub API 브랜치 생성 body에 불필요한 `base` 필드~~ ✅ 해결

- **파일**: `frontend/src/services/repoPusher.ts:61`
- **해결**: `base` 필드 제거, `{ ref, sha }` 만 전송

### ~~[BUG-08] GitLab 브랜치 HTTP 400을 무조건 성공으로 처리~~ ✅ 해결

- **파일**: `frontend/src/services/repoPusher.ts:114`
- **해결**: 400 응답 body 파싱 후 `already exists` 포함 시에만 성공 처리, 그 외는 에러 throw

---

## High — 에러 핸들링

### ~~[ERR-01] 소스 스캔 실패를 조용히 무시~~ ✅ 해결

- **파일**: `frontend/src/TechNewsBoard.tsx:1647`
- **해결**: catch 블록에서 `setScanError(...)` 호출로 경고 배너 표시, 설정 파일 커밋은 계속 진행

### ~~[ERR-02] `FileReader.onerror` 핸들러 누락~~ ✅ 해결

- **파일**: `frontend/src/TechNewsBoard.tsx:562`
- **해결**: `reader.onerror = () => alert(파일 읽기 실패: ${file.name})` 추가

---

## Medium — 성능

### ~~[PERF-01] 소스 파일 수백 개를 제한 없이 동시 fetch~~ ✅ 해결

- **파일**: `frontend/src/services/repoFetcher.ts:195`
- **해결**: `CHUNK_SIZE = 10` 기준 청크 단위 순차 병렬 처리

### ~~[PERF-02] 렌더링마다 `parseConfigFile` 반복 호출~~ ✅ 해결

- **파일**: `frontend/src/TechNewsBoard.tsx:1435`
- **해결**: `parsedFoundFiles` useMemo로 캐싱

### ~~[PERF-03] `gcTime`이 `staleTime`보다 짧음~~ ✅ 해결

- **파일**: `frontend/src/hooks/useLatestVersions.ts`
- **해결**: `gcTime: 1000 * 60 * 35` (35분, staleTime 30분보다 길게 설정)

---

## Medium — 코드 품질

### ~~[QUAL-01] `parseFloat`로 버전 비교 시 의미론적 오류~~ ✅ 해결

- **파일**: `frontend/src/services/migrationGuide.ts:184`
- **해결**: `major * 100 + minor` 정수 변환 방식으로 교체 (`3.10` → `310`)

### ~~[QUAL-02] Vite STACK 데이터 불일치~~ ✅ 해결

- **파일**: `frontend/src/TechNewsBoard.tsx:213`
- **해결**: `latestVersion: '8'`, `releaseDate: '2025-07-01'`, `link: '.../announcing-vite8'` 로 Vite 8 기준 통일

---

## Low — UX

### ~~[UX-01] 파일 선택 버튼에 `ExternalLink` 아이콘 사용~~ ✅ 해결

- **파일**: `frontend/src/TechNewsBoard.tsx:592`
- **해결**: `<ExternalLink />` → `<Upload />` 로 교체

### ~~[UX-02] 폴더 스캔 진행 바가 항상 100%~~ ✅ 해결

- **파일**: `frontend/src/TechNewsBoard.tsx:1492`
- **해결**: `w-full` 제거, `style={{ width: \`${(progress.tried / progress.total) * 100}%\` }}` 적용

### ~~[UX-03] 붙여넣기 시 파일명 `'unknown'` 고정~~ ✅ 해결

- **파일**: `frontend/src/TechNewsBoard.tsx:551`
- **해결**: `pasteFileType` state + 파일 타입 선택 드롭다운 추가 (auto / package.json / build.gradle 등)

### ~~[UX-04] 브랜치 생성 버튼 disabled 사유 미표시~~ ✅ 해결

- **파일**: `frontend/src/TechNewsBoard.tsx:1737`
- **해결**: `rewritePlan.length === 0` / `allChanges.length === 0` 조건별 안내 문구 표시

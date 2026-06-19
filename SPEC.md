# Tech Stack 대시보드 — 개발 명세서

## 개요

팀 기술 스택의 버전을 조회하고, GitHub/GitLab 레포를 연동해 마이그레이션 브랜치를 자동 생성하는 내부 대시보드.

---

## 기술 스택 (대시보드 자체)

| 항목 | 버전 |
|------|------|
| React | 18.3.1 |
| TypeScript | 5.6.2 |
| Vite | 5.4.10 |
| Tailwind CSS | 3.4.14 |
| TanStack React Query | 5.99.2 |
| lucide-react | 0.460.0 |

---

## 탭 구성

| 탭 | 설명 |
|----|------|
| 📡 버전 현황 | 최신 버전 그리드 + 버전별 변경사항 카드. 버전 배지 클릭 시 해당 버전 상세 표시 |
| 🔗 레포 마이그레이션 | GitHub/GitLab 레포 연동 → 설정 파일 분석 → 브랜치 자동 생성 |

> 마이그레이션 탭(독립형 버전 입력 + 분석)은 임시 비활성화 상태.

---

## 파일 구조

```
src/
├── main.tsx                      # 앱 진입점, QueryClientProvider 설정
├── TechNewsBoard.tsx             # 메인 컴포넌트 (전체 UI)
├── hooks/
│   └── useLatestVersions.ts      # 버전 조회 훅 (React Query, staleTime 30분)
└── services/
    ├── versionService.ts         # 외부 API 호출 (npm, GitHub, Adoptium)
    ├── configParser.ts           # 설정 파일 파서
    ├── migrationGuide.ts         # 마이그레이션 수정 가이드 (FIX_GUIDES, LINE_TRANSFORMS)
    ├── migrationScript.ts        # 마이그레이션 스캔 스크립트 생성기
    ├── folderScanner.ts          # 브라우저 폴더 스캔 (File System Access API)
    ├── compatSimulator.ts        # 신규 라이브러리 호환성 시뮬레이터
    ├── repoFetcher.ts            # GitHub / GitLab 설정 파일 가져오기
    ├── versionRewriter.ts        # 설정 파일 버전 자동 수정 + 변경 감지
    ├── repoPusher.ts             # GitHub / GitLab 브랜치 생성 및 커밋
    └── aiTransformer.ts          # Claude API를 이용한 소스 파일 자동 변환
```

---

## 주요 기능

### 1. 최신 버전 조회

3개 외부 API를 `Promise.allSettled`로 병렬 조회. API 실패 시 하드코딩된 폴백 사용.

| 스택 | API |
|------|-----|
| React, Vite, Zustand | npm registry (`registry.npmjs.org`) |
| Spring Boot | GitHub Releases API |
| QueryDSL | GitHub Releases API (`QUERYDSL_5_1_0` 형식 태그 → `5.1.0` 파싱) |
| Java | Adoptium API (최신 LTS 자동 선택) |

- `staleTime`: 30분 / `retry`: 2회
- API 실패 시 폴백 버전 사용
- 새로고침 버튼 ("현재 최신 버전" 헤더 옆): `refetch()` 수동 트리거, 조회 중 스핀 애니메이션

---

### 2. 버전 현황 탭

#### 최신 버전 그리드
추적 중인 6개 스택의 현재 최신 버전을 카드 형태로 표시.

#### 버전별 상세 조회 (StackCard)

버전 배지를 클릭하면:
1. 카드 상단 큰 버전 숫자가 선택한 버전으로 변경
2. 카드 설명 텍스트가 해당 버전의 **첫 번째 주요 변경사항** 텍스트로 변경
3. 아코디언이 열리며 해당 버전의 전체 변경사항 목록 표시
4. 같은 배지를 다시 클릭하면 선택 해제 → 기본 요약 복귀

버전 매칭 순서 (`resolveViewFeatures`): 정확 일치 → Major.Minor → Major (폴백)
- 폴백 시: "X.Y 전용 데이터 없음 — Z 기준으로 표시합니다" 안내
- 매칭 없음: "패치 버전 — 별도 변경사항 없음" 안내

#### quickVersions 자동 확장

`enrichedStack` 생성 시 라이브 API 버전의 major가 기존 `quickVersions`에 없으면 자동 추가:
```
// API에서 React 20.0.0 반환 시 → major "20"이 없으면 배지에 자동 추가
quickVersions: [...staticVersions, "20.0.0"]
```
버전 현황 탭(StackCard 히스토리 배지)과 레포 마이그레이션 탭(퀵 버전 버튼) 양쪽에 동시 반영.

#### 정적 quickVersions 목록

| 스택 | 버전 |
|------|------|
| Java | 8, 11, 17, 21, 25 |
| Spring Boot | 2.7, 3.0, 3.2, 3.3, 3.4, 4.0, 4.0.5 |
| React | 16, 17, 18, 18.2, 18.3, 19, 19.2 |
| Vite | 4, 5, 5.4, 6, 6.3, 7, 8 |
| Zustand | 3, 4, 5 |
| QueryDSL | 4.4, 5.0, 5.1 |

---

### 3. 설정 파일 자동 파싱

드래그&드롭, 파일 선택, 직접 붙여넣기로 설정 파일 업로드 시 버전 자동 추출.

| 파일 | 추출 항목 |
|------|----------|
| `package.json` | react, vite, zustand |
| `build.gradle` / `build.gradle.kts` | Spring Boot 플러그인 버전, Java 버전, QueryDSL 버전 |
| `pom.xml` | spring-boot parent 버전, java.version, QueryDSL 의존성 버전 |
| `gradle.properties` | springBootVersion, javaVersion |

추출 근거(어떤 필드에서 어떤 값을 뽑았는지) 화면에 표시.

#### 의존성 호환성 어드바이저리

| 의존성 | 경고 조건 | 권장 조치 |
|--------|----------|----------|
| Lombok | `1.18.35` 이하 | `1.18.36` 이상 (Java 21+ 컴파일러 내부 API 변경) |
| jjwt | `0.10.x` / `0.11.x` | `0.12.x` 이상 (Java 17+ 리플렉션 강화) |
| Firebase Admin | `9.x` 미만 | `9.x` 이상 (Java 21+ 호환성) |
| MySQL Connector/J | `8.x` 미만 | `8.x` 이상 (Java 21+ TLS 핸드셰이크 오류 방지) |

---

### 4. 버전 입력 패널 (현재 / 목표)

추적 대상 스택: **Java, Spring Boot, React, Vite, Zustand, QueryDSL**

| 입력란 | 동작 |
|--------|------|
| **현재** | 설정 파일 자동 파싱 결과 반영. **읽기 전용** (직접 수정 불가) |
| **목표** | 직접 입력 또는 퀵 버전 버튼 선택. `최신` 버튼으로 API 버전 자동 입력 |

퀵 버전 목록은 버전 현황 탭과 레포 마이그레이션 탭 공통 (`enrichedStack.quickVersions`).

---

### 5. 레포 마이그레이션 (GitHub / GitLab)

#### 흐름

```
레포 URL + Token 입력
  ↓ repoFetcher — package.json / build.gradle / pom.xml / gradle.properties 자동 탐색
현재 버전 자동 파싱 → 현재 버전 필드 반영 (읽기 전용)
  ↓
목표 버전 설정
  ↓ versionRewriter — rewriteConfig()
수정 파일 미리보기 (Before → After)
  ↓ allChanges.length > 0 일 때만 브랜치 생성 버튼 활성화
  ↓ repoPusher — pushToBranch()
브랜치 생성 + 커밋 → 브랜치 URL 제공
```

#### 브랜치 생성 조건

`allChanges.length > 0` 일 때만 버튼 활성화. 변경사항이 없으면 버튼 비활성화 + 안내 문구 표시.

#### versionRewriter 동작

버전 비교는 **target의 세분화 수준**에서만 수행 (`versionsDiffer`):

```
target = "18"   → major만 비교: "18.3" vs "18" → 동일 → 변경 없음
target = "18.3" → major.minor 비교: "18.2" vs "18.3" → 다름 → 수정
```

`configParser.cleanVersion`이 `"^18.3.0"` → `"18.3"`으로 정규화하므로, target이 `"18"`(major만)일 때 false positive 방지.

`rewritePackageJson`도 동일 로직으로 기존 `"^18.3.0"`에 target `"18"` 적용 시 major가 같으면 덮어쓰지 않음 (불필요한 다운그레이드 방지).

#### 지원 플랫폼

| 플랫폼 | Token 스코프 |
|--------|------------|
| GitHub | `repo` |
| GitLab | `api` |

Public 레포는 Token 없이 사용 가능. Token은 브라우저 메모리에만 저장.

#### 소스 파일 자동 변환

**규칙 기반 변환** (`versionRewriter.rewriteSourceFile`):
- `.java` / `.kt`: `javax.*` → `jakarta.*`, `new ObjectMapper()` → Bean 주입
- `.ts` / `.tsx` / `.js` / `.jsx`: Zustand default import 수정, `ReactDOM.render` → `createRoot`

**AI 변환** (`aiTransformer.aiTransformFile` — Claude API):

| 패턴 | 변환 |
|------|------|
| `WebSecurityConfigurerAdapter` | `@Bean SecurityFilterChain` |
| `configure(HttpSecurity)` | `SecurityFilterChain filterChain(HttpSecurity)` |
| `finalize()` | `Cleaner` / `AutoCloseable` |
| `new ThreadLocal<>()` | `ScopedValue.newInstance()` |
| `new ObjectMapper()` | `@Autowired` 주입 |
| `sun.*` | 표준 Java API |
| `JPAQueryFactory` | jakarta 패키지 |
| `ReactDOM.render()` | `createRoot().render()` |
| `extends Component` | 함수형 컴포넌트 + hooks |

패턴이 감지되지 않거나 변환 전후가 동일하면 `null` 반환 (커밋 제외).

---

### 6. 맞춤 권장사항 (현재 → 최신)

**필터 조건**: `현재버전 < sinceVersion`

- 스택별 Breaking Changes / 신기능 목록
- 업그레이드 격차 배지 (최신 / 마이너 / 메이저)

---

### 7. 마이그레이션 분석 (현재 → 목표 범위) ※임시 비활성화

**필터 조건**: `현재버전 < sinceVersion ≤ 목표버전`

| Breaking 건수 | 등급 |
|--------------|------|
| 0건 | LOW |
| 1~2건 | MEDIUM |
| 3건 이상 | HIGH |

---

### 8. 신규 라이브러리 호환성 시뮬레이터

**npm**: 패키지 이름 → npm registry `peerDependencies` 조회 → 현재 스택과 비교 → 호환 / 경고 / 충돌

**Maven / Gradle**: Group ID + Artifact ID + 버전 → 정적 룰 DB 기반 호환성 체크

---

## 데이터 흐름

```
외부 API (npm / GitHub / Adoptium)
        ↓ useLatestVersions (30분 캐시, 새로고침 버튼으로 수동 refetch)
TechNewsBoard
        ↓ enrichedStack (API 버전 오버라이드 + quickVersions 자동 확장)
        ├── StackCard          (버전 배지 클릭 → 버전 숫자·설명·아코디언 동시 변경)
        ├── RecommendSection   (현재 버전 기준 맞춤 권장사항)
        └── RepoBranchPanel    (레포 연동 → 수정 미리보기 → 브랜치 생성)

레포 연동
        ↓ repoFetcher (설정 파일 탐색 + 다운로드)
        ↓ configParser (버전 파싱 → currentVersions)
        ↓ versionRewriter (versionsDiffer로 target 세분화 비교, false positive 방지)
        ↓ aiTransformer (복잡한 패턴 AI 변환)
        └── repoPusher (브랜치 생성 + 커밋)
```

---

## 주요 유틸 함수

| 함수 | 위치 | 설명 |
|------|------|------|
| `fetchAllLatestVersions()` | `versionService.ts` | 3개 API 병렬 조회, 폴백 포함 |
| `fetchQueryDslLatest()` | `versionService.ts` | QueryDSL GitHub 릴리스 조회, `QUERYDSL_X_Y_Z` 태그 파싱 |
| `parseConfigFile(filename, content)` | `configParser.ts` | 파일명/내용으로 타입 감지 후 파싱 |
| `rewriteConfig(filename, content, targets)` | `versionRewriter.ts` | 목표 버전으로 설정 파일 수정, 변경 시에만 새 내용 반환 |
| `versionsDiffer(current, target)` | `versionRewriter.ts` | target 세분화 수준 버전 비교 (false positive 방지) |
| `rewriteSourceFile(filename, content)` | `versionRewriter.ts` | 규칙 기반 소스 파일 자동 변환 |
| `resolveViewFeatures(features, version)` | `TechNewsBoard.tsx` | 버전 배지 선택 시 정확·MajorMinor·Major 순 폴백 매칭 |
| `detectComplexPatterns(content)` | `aiTransformer.ts` | AI 변환이 필요한 복잡한 패턴 감지 |
| `aiTransformFile(...)` | `aiTransformer.ts` | Claude API로 소스 파일 변환 |
| `pushToBranch(...)` | `repoPusher.ts` | GitHub/GitLab 브랜치 생성 + 파일 커밋 |
| `generateBranchName(targets)` | `repoPusher.ts` | `migration/YYYY-MM-DD-stack-ver` 형식 브랜치명 생성 |
| `versionGap(userVer, latestVer)` | `TechNewsBoard.tsx` | up-to-date / minor / major 판정 |

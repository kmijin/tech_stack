# Tech Stack 대시보드 — 개발 명세서

## 개요

팀 기술 스택의 최신 버전을 실시간으로 조회하고, 현재 사용 중인 버전을 입력하면 맞춤 업그레이드 권장사항과 마이그레이션 분석을 제공하는 내부 대시보드.

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

## 파일 구조

```
src/
├── main.tsx                      # 앱 진입점, QueryClientProvider 설정
├── TechNewsBoard.tsx             # 메인 컴포넌트 (전체 UI)
├── hooks/
│   └── useLatestVersions.ts      # 실시간 버전 조회 훅
└── services/
    ├── versionService.ts         # 외부 API 호출 (npm, GitHub, Adoptium)
    ├── configParser.ts           # 설정 파일 파서 (package.json / build.gradle / pom.xml)
    └── migrationScript.ts        # 마이그레이션 스캔 스크립트 생성기
```

---

## 주요 기능

### 1. 실시간 최신 버전 조회

3개 외부 API를 `Promise.allSettled`로 병렬 조회. API 실패 시 하드코딩된 폴백 데이터 사용.

| 스택 | API |
|------|-----|
| React, Vite, Zustand | npm registry (`registry.npmjs.org`) |
| Spring Boot, QueryDSL | GitHub Releases API |
| Java | Adoptium API (최신 LTS 자동 선택) |

- `staleTime`: 30분 (불필요한 재요청 방지)
- `retry`: 2회
- 헤더에 실시간 조회 상태 표시 (로딩 / 에러 / 마지막 갱신 시각)

---

### 2. 설정 파일 자동 파싱

드래그&드롭, 파일 선택, 직접 붙여넣기로 설정 파일을 업로드하면 버전을 자동 추출해 **현재 버전** 입력란에 반영.

| 파일 | 추출 항목 |
|------|----------|
| `package.json` | react, vite, zustand |
| `build.gradle` / `build.gradle.kts` | Spring Boot 플러그인 버전, Java 버전, QueryDSL 버전 |
| `pom.xml` | spring-boot parent 버전, java.version 프로퍼티, QueryDSL 의존성 버전 |

추출 근거(어떤 필드에서 어떤 값을 뽑았는지)를 화면에 표시.

---

### 3. 버전 입력 패널 (현재 / 목표)

추적 대상 스택: **Java, Spring Boot, React, Vite, Zustand, QueryDSL**

각 스택마다 두 개의 입력란 제공:

- **현재**: 지금 사용 중인 버전
- **목표**: 마이그레이션하려는 목표 버전 (`최신` 버튼으로 자동 입력 가능)

하단 퀵 버전 버튼 동작:
- 현재가 비어있으면 → **현재** 설정
- 현재가 채워져 있고 목표가 비어있으면 → **목표** 설정
- 둘 다 채워져 있으면 → **현재** 재설정

선택된 버전은 `현` / `목` 배지로 구분 표시.

---

### 4. 맞춤 권장사항 (현재 → 최신)

현재 버전을 기준으로 최신 버전까지의 Breaking Changes와 신기능을 필터링해서 표시.

**필터 조건**: `현재버전 < sinceVersion`

- Breaking Changes 목록 (스택별 분류)
- 업그레이드 시 획득 가능한 신기능 목록
- 스택별 업그레이드 격차 표시 (최신 / 마이너 / 메이저)

---

### 5. 마이그레이션 분석 (현재 → 목표 범위)

현재와 목표 버전이 모두 입력된 스택에 대해 **해당 범위에 해당하는** 변경사항만 필터링.

**필터 조건**: `현재버전 < sinceVersion ≤ 목표버전`

- 범위 내 Breaking Changes 목록
- 범위 내 신기능 목록
- 스택별 복잡도 배지 (Breaking 건수 기준)

**복잡도 기준**:

| Breaking 건수 | 등급 |
|--------------|------|
| 0건 | LOW |
| 1~2건 | MEDIUM |
| 3건 이상 | HIGH |

백엔드만, 프론트엔드만, 일부 스택만 입력해도 해당 스택에 대해서만 분석 활성화.

---

### 6. 대규모 프로젝트 스캔 스크립트

파일 수가 많은 프로젝트는 대시보드에서 직접 분석하기 어려우므로, 로컬에서 실행할 수 있는 grep 스크립트를 자동 생성.

**지원 플랫폼**: bash (Linux/macOS), PowerShell (Windows)

> CMD는 지원하지 않습니다. Windows는 PowerShell을 사용하세요.

#### 실행 방법

```bash
# bash (Linux/macOS)
bash migrate-scan.sh /path/to/project
```

```powershell
# PowerShell (Windows)
.\migrate-scan.ps1 C:\path\to\project
```

스크립트는 마이그레이션 경로(스택 ID + 현재 버전 + 목표 버전)를 기반으로 필요한 grep 항목만 선택해서 생성.

#### 스캔 항목

| 키 | 설명 | 해당 마이그레이션 |
|----|------|-----------------|
| `javax_imports` | `javax.*` import 파일 수 | Spring Boot 2.x → 3.x |
| `websecurity_adapter` | `WebSecurityConfigurerAdapter` 상속 파일 수 | Spring Boot 2.x → 3.x |
| `sun_imports` | `sun.*` internal API 사용 파일 수 | Java 8 → 9+ |
| `deprecated_finalize` | `finalize()` 오버라이드 파일 수 | Java 17 → 18+ |
| `threadlocal_usage` | `new ThreadLocal` 사용 파일 수 | Java → 21+ |
| `jackson_objectmapper` | `ObjectMapper` 커스텀 Bean 파일 수 | Spring Boot 3.x → 4.x |
| `querydsl_config` | `JPAQueryFactory` 설정 파일 수 | QueryDSL 4.x → 5.x |
| `react_dom_render` | `ReactDOM.render()` 사용 파일 수 | React 17 → 18+ |
| `class_components` | class 컴포넌트(`extends Component`) 파일 수 | React → 18+ |
| `zustand_default_import` | Zustand default import 사용 파일 수 | Zustand 4.x → 5.x |
| `vite_plugin_usage` | `vite.config.*`의 `plugins` 항목 수 | Vite 5 → 6 |

#### 스캔 결과 분석

스크립트 실행 후 출력된 JSON을 대시보드 **"스캔 결과 붙여넣기"** 칸에 붙여넣으면 파일 수와 복잡도 자동 계산.

**파일 수 기준 복잡도**:

| 파일 수 | 등급 |
|---------|------|
| 0 | 영향 없음 |
| 1 ~ 10 | LOW |
| 11 ~ 30 | MEDIUM |
| 31 이상 | HIGH |

---

## 데이터 흐름

```
외부 API (npm / GitHub / Adoptium)
        ↓ useLatestVersions (30분 캐시)
TechNewsBoard
        ↓ enrichedStack (API 결과로 버전 오버라이드)
        ├── StackCard          (스택별 카드, 현재 → 최신 갭 표시)
        ├── RecommendSection   (현재 버전 기준 맞춤 권장사항)
        └── MigrationSection   (현재 → 목표 범위 분석 + ScriptPanel)

설정 파일 업로드
        ↓ configParser (parseConfigFile)
        └── currentVersions 상태에 반영
```

---

## 주요 유틸 함수

| 함수 | 위치 | 설명 |
|------|------|------|
| `fetchAllLatestVersions()` | `versionService.ts` | 3개 API 병렬 조회, 폴백 포함 |
| `parseConfigFile(filename, content)` | `configParser.ts` | 파일명/내용으로 타입 감지 후 파싱 |
| `generateScript(migrations, platform)` | `migrationScript.ts` | bash / PowerShell 스크립트 문자열 생성 |
| `parseScanResult(json)` | `migrationScript.ts` | bash JSON / PowerShell JSON 양쪽 파싱 |
| `requiredKeys(stackId, from, to)` | `migrationScript.ts` | 마이그레이션 경로에 필요한 grep 키 목록 반환 |
| `isInRange(current, target, since)` | `TechNewsBoard.tsx` | `current < since ≤ target` 범위 필터 |

---

## 로컬 실행

```bash
npm install
npm run dev
```

기본 포트: `5173` (사용 중이면 자동으로 다음 포트 사용)

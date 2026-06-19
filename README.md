# Tech Stack 대시보드

팀 기술 스택의 버전을 조회하고, GitHub/GitLab 레포를 연동해 마이그레이션 브랜치를 자동 생성하는 내부 대시보드입니다.

## 시작하기

```bash
cd frontend
npm install
npm run dev
```

기본 포트: `5173`

## 탭 구성

### 📡 버전 현황
- 추적 중인 스택(Java, Spring Boot, React, Vite, Zustand, QueryDSL)의 최신 버전 카드 표시
- 버전 배지 클릭 시 해당 버전의 주요 변경사항이 카드 설명에 반영
- API에서 새 major 버전이 감지되면 버전 배지에 자동 추가
- 우측 상단 새로고침 버튼으로 버전 수동 갱신
- 스택 호환성 체크리스트

### 🔗 레포 마이그레이션
GitHub/GitLab 레포를 연동하면 설정 파일을 분석해 마이그레이션 브랜치를 자동으로 생성합니다.

| 구분 | 내용 |
|------|------|
| **자동 반영** | 의존성 버전 업데이트, 패키지명 변경 자동 치환 |
| **AI 코드 변환** | WebSecurityConfigurerAdapter → SecurityFilterChain, ReactDOM.render → createRoot, Class 컴포넌트 → 함수형 등 복잡한 패턴 (Claude API 사용) |
| **직접 검토 필요** | 비즈니스 로직 Breaking Change, application.yml 구조 변경, 테스트 코드 |

## 주요 기능

### 버전 현황 카드 (StackCard)
- 버전 배지를 클릭하면 해당 버전의 **첫 번째 주요 변경사항**이 카드 설명에 표시
- 아코디언을 열면 해당 버전의 전체 변경사항 목록 확인
- API에서 새 버전이 오면 `quickVersions` 배지에 자동 추가 (버전 현황 · 마이그레이션 탭 공통)
- 새로고침 버튼으로 최신 버전 재조회

### 레포 연동 및 브랜치 자동 생성
- GitHub/GitLab URL + Personal Access Token 입력
- `package.json`, `build.gradle`, `pom.xml`, `gradle.properties` 자동 탐색 (루트 + 모노레포)
- 가져온 설정 파일에서 현재 버전 자동 파싱 → 현재 버전 필드 자동 반영
- 목표 버전 설정 시 수정될 파일·변경사항 미리보기
- **변경사항이 없을 경우 브랜치 생성 버튼 비활성화** (이미 목표 버전과 동일한 경우 등)
- 브랜치명 자동 생성 (`migration/YYYY-MM-DD-stack-version`), 원클릭 커밋

### 버전 입력 패널
- **현재 버전** — 설정 파일 자동 감지 (읽기 전용)
- **목표 버전** — 직접 입력 또는 퀵 버전 버튼으로 선택
- `최신` 버튼으로 API 조회 버전 자동 입력

#### 퀵 버전 목록

| 스택 | 선택 가능 버전 |
|------|--------------|
| Java | 8, 11, 17, 21, 25 |
| Spring Boot | 2.7, 3.0, 3.2, 3.3, 3.4, 4.0, 4.0.5 |
| React | 16, 17, 18, 18.2, 18.3, 19, 19.2 |
| Vite | 4, 5, 5.4, 6, 6.3, 7, 8 |
| Zustand | 3, 4, 5 |
| QueryDSL | 4.4, 5.0, 5.1 |

> API에서 새 major 버전이 감지되면 위 목록 끝에 자동 추가됩니다.

### AI 코드 변환 (Claude API)
복잡한 패턴을 감지해 Claude API로 자동 변환합니다.

| 패턴 | 변환 |
|------|------|
| `WebSecurityConfigurerAdapter` | `@Bean SecurityFilterChain` 방식으로 재작성 |
| `configure(HttpSecurity)` | `SecurityFilterChain filterChain(HttpSecurity)` |
| `ReactDOM.render()` | `createRoot().render()` |
| `extends Component` | 함수형 컴포넌트 + hooks |
| `new ThreadLocal<>()` | `ScopedValue.newInstance()` |
| `finalize()` | `Cleaner` / `AutoCloseable` |
| `new ObjectMapper()` | `@Autowired` 주입 방식 |
| `sun.*` internal API | 표준 Java API |

### 설정 파일 자동 파싱
드래그&드롭, 파일 선택, 직접 붙여넣기로 설정 파일 업로드 시 버전 자동 추출

| 파일 | 추출 항목 |
|------|----------|
| `package.json` | react, vite, zustand |
| `build.gradle` / `build.gradle.kts` | Spring Boot, Java, QueryDSL |
| `pom.xml` | Spring Boot parent, java.version, QueryDSL |
| `gradle.properties` | springBootVersion, javaVersion |

#### 의존성 호환성 어드바이저리

| 의존성 | 경고 조건 | 권장 조치 |
|--------|----------|----------|
| Lombok | `1.18.35` 이하 | `1.18.36` 이상으로 업그레이드 |
| jjwt | `0.10.x` / `0.11.x` | `0.12.x` 이상으로 업그레이드 |
| Firebase Admin | `9.x` 미만 | `9.x` 이상으로 업그레이드 |
| MySQL Connector/J | `8.x` 미만 | `8.x` 이상으로 업그레이드 |

## 추적 스택

| 스택 | 최신 버전 | API |
|------|----------|-----|
| Java | 25 LTS | Adoptium API |
| Spring Boot | 4.0.x | GitHub Releases |
| React | 19.x | npm registry |
| Vite | 8.x | npm registry |
| Zustand | 5.x | npm registry |
| QueryDSL | 5.1.x | GitHub Releases (`QUERYDSL_5_1_0` 태그 파싱) |

## 프로젝트 구조

```
frontend/
├── src/
│   ├── TechNewsBoard.tsx          # 메인 대시보드 컴포넌트
│   ├── hooks/
│   │   └── useLatestVersions.ts   # 버전 조회 훅 (React Query)
│   └── services/
│       ├── versionService.ts      # npm / GitHub / Adoptium API 조회
│       ├── configParser.ts        # 설정 파일 파싱
│       ├── migrationGuide.ts      # 마이그레이션 수정 가이드
│       ├── migrationScript.ts     # 스캔 스크립트 생성
│       ├── folderScanner.ts       # 브라우저 폴더 스캔
│       ├── compatSimulator.ts     # 신규 라이브러리 호환성 시뮬레이터
│       ├── repoFetcher.ts         # GitHub / GitLab 설정 파일 가져오기
│       ├── versionRewriter.ts     # 설정 파일 버전 자동 수정
│       ├── repoPusher.ts          # GitHub / GitLab 브랜치 생성 및 커밋
│       └── aiTransformer.ts       # Claude API 코드 자동 변환
```

## 데이터 업데이트 방법

- **버전 정보** — 외부 API 자동 수집 (앱 로드 시 조회, 새로고침 버튼으로 수동 갱신)
- **Breaking Changes · 신기능** — `src/TechNewsBoard.tsx` 내 `STACK` 상수에서 수동 관리
- **마이그레이션 수정 가이드** — `src/services/migrationGuide.ts`의 `FIX_GUIDES` 업데이트
- **Java 라이브러리 호환성 룰** — `src/services/compatSimulator.ts`의 `JAVA_RULES` 배열에 추가

## 상세 명세

[SPEC.md](./SPEC.md)

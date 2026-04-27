# Tech Stack 대시보드

팀 기술 스택의 최신 버전을 실시간으로 조회하고, 마이그레이션 분석 · 코드 스니펫 분석 · 신규 라이브러리 호환성 시뮬레이션을 제공하는 내부 대시보드입니다.

## 시작하기

```bash
cd frontend
npm install
npm run dev
```

## 주요 기능

### 버전 조회 및 입력
- **실시간 버전 조회** — npm, GitHub Releases, Adoptium API에서 최신 버전 자동 수집 (30분 캐시)
- **설정 파일 파싱** — `package.json` / `build.gradle` / `build.gradle.kts` / `pom.xml` / `gradle.properties` 업로드 또는 붙여넣기로 현재 버전 자동 추출
- **의존성 호환성 경고** — 파싱 시 Lombok, JJWT, Firebase Admin, MySQL Connector 등 주요 의존성의 알려진 호환성 문제를 자동 감지해 경고 표시
- **현재 / 목표 버전 입력** — 스택별 현재·목표 버전을 직접 입력하거나 빠른 선택 버튼으로 설정

### 마이그레이션 분석
- **맞춤 권장사항** — 현재 버전 기준 Breaking Changes 및 신기능 목록 안내
- **마이그레이션 범위 분석** — 현재 → 목표 버전 범위의 변경사항 필터링 및 복잡도(LOW / MEDIUM / HIGH) 산정
- **스캔 스크립트 생성** — 대규모 프로젝트용 bash / PowerShell 스크립트 자동 생성 · 복사 · 다운로드
- **폴더 선택 스캔** — 브라우저에서 직접 프로젝트 폴더를 선택해 스캔 (Chrome / Edge 전용, 파일 외부 전송 없음)
- **파일 상세 표시** — 스캔 결과에서 파일 경로 · 줄 번호 · 매칭 코드 라인 확인
- **자동 수정 제안** — 단순 치환 가능한 패턴은 수정 코드를 즉시 표시 (예: `javax.*` → `jakarta.*`)
- **수정 가이드** — 패턴별 Before / After 코드 블록 및 주의사항 제공

### 코드 스니펫 분석
코드를 붙여넣으면 현재 → 목표 버전 범위 기준으로 수정이 필요한 라인을 탐지합니다.

- **언어 선택** — Java / TypeScript·React 선택
- **위험도 표시** — 상 / 중 / 하로 구분
  - 상: 자동 수정 불가, 전체 재작성 필요 (WebSecurityConfigurerAdapter, ThreadLocal 등)
  - 중: 부분 자동 변환 가능 (javax→jakarta, ReactDOM.render 등)
  - 하: 단순 치환 (Zustand default import, Vite plugin 등)
- **수정 전 / 수정 후 코드** — 줄 번호와 함께 Before(빨강) / After(초록) 표시
- **수동 확인 필요** — 복잡한 로직은 이유와 함께 명시
- **주의사항** — 라이브러리 버전별 주의 메시지 표시

### 신규 라이브러리 호환성 시뮬레이터
새 라이브러리 추가 전에 기존 프로젝트와의 호환성을 사전에 확인합니다.

**npm (프론트엔드)**
- 패키지 이름 입력 → npm registry에서 `peerDependencies` 실시간 조회
- 현재 스택 버전과 비교해 호환 / 경고 / 충돌 판정
- 빠른 선택: `axios`, `moment`, `lodash`, `zustand`, `@tanstack/react-query`, `react-router-dom` 등 10개

**Maven / Gradle (백엔드)**
- Group ID + Artifact ID + 버전 입력 → 정적 룰 DB 기반 호환성 체크
- Spring Boot 버전 / Java 버전과의 충돌 여부 판정
- 빠른 선택: Lombok, JJWT, QueryDSL, Firebase Admin, MySQL Connector, MapStruct, Flyway, Springdoc 8개

**공통**
- 현재 버전을 기준으로 체크 (위에서 입력한 버전 자동 연동)
- 버전 직접 입력으로 오버라이드 가능
- **대안 라이브러리 제안** — 충돌 발생 시 또는 더 나은 선택지 안내

## 추적 스택

| 스택 | 최신 버전 | 비고 |
|------|----------|------|
| Java | 25 LTS | Adoptium API 실시간 조회 |
| Spring Boot | 4.0.x | GitHub Releases 실시간 조회 |
| React | 19.x | npm registry 실시간 조회 |
| Vite | 6.x | npm registry 실시간 조회 |
| Zustand | 5.x | npm registry 실시간 조회 |
| QueryDSL | 5.1.x | GitHub Releases 실시간 조회 |

## 탐지 패턴 목록

| 패턴 | 대상 | 관련 마이그레이션 |
|------|------|-----------------|
| `javax.*` import | Java | Spring Boot 3.0+ |
| `WebSecurityConfigurerAdapter` | Java | Spring Boot 3.0+ |
| `sun.*` internal API | Java | Java 9+ |
| `finalize()` | Java | Java 18+ |
| `new ThreadLocal` | Java | Java 21+ (Virtual Thread) |
| `ObjectMapper` 커스텀 Bean | Java | Spring Boot 4.0+ (Jackson 3) |
| `JPAQueryFactory` | Java | Spring Boot 4.0+ |
| `ReactDOM.render()` | TypeScript/React | React 18→19 |
| `extends Component` | TypeScript/React | React 18+ |
| `import create from 'zustand'` | TypeScript | Zustand v5 |
| `plugins` in vite.config | TypeScript | Vite 6 (SSR 환경) |

## 폴더 스캔 사용법

1. 마이그레이션 경로(현재 버전 → 목표 버전)를 입력합니다.
2. **마이그레이션 분석** 패널 내 **폴더 선택해서 바로 스캔** 버튼을 클릭합니다.
3. 로컬 프로젝트 루트 폴더를 선택하면 브라우저 내에서 파일을 읽어 자동으로 분석합니다.
4. 결과에서 영향받는 파일 경로와 코드 라인, 수정 제안을 확인합니다.

> **참고** — `showDirectoryPicker` API는 Chrome / Edge 브라우저에서만 지원됩니다.  
> Firefox · Safari에서는 스크립트를 직접 실행하는 방식을 사용하세요.

## 데이터 업데이트 방법

- **실시간 버전** — 외부 API에서 자동 수집 (별도 작업 불필요)
- **Breaking Changes · 신기능 목록** — `src/TechNewsBoard.tsx` 내 `STACK` 상수에서 수동 관리
- **마이그레이션 수정 가이드** — `src/services/migrationGuide.ts`의 `FIX_GUIDES` 업데이트
- **Java 라이브러리 호환성 룰** — `src/services/compatSimulator.ts`의 `JAVA_RULES` 배열에 추가
- **npm 대안 라이브러리** — `src/services/compatSimulator.ts`의 `NPM_ALTERNATIVES` 객체에 추가

## 프로젝트 구조

```
frontend/
├── src/
│   ├── TechNewsBoard.tsx          # 메인 대시보드 컴포넌트
│   ├── hooks/
│   │   └── useLatestVersions.ts   # 최신 버전 조회 훅 (React Query)
│   └── services/
│       ├── versionService.ts      # npm / GitHub / Adoptium API 조회
│       ├── configParser.ts        # 설정 파일 파싱 (package.json, Gradle, pom.xml)
│       ├── migrationGuide.ts      # 마이그레이션 수정 가이드 (FIX_GUIDES, LINE_TRANSFORMS)
│       ├── migrationScript.ts     # 스캔 스크립트 생성 및 결과 파싱
│       ├── folderScanner.ts       # 브라우저 폴더 스캔 (File System Access API)
│       └── compatSimulator.ts     # 신규 라이브러리 호환성 시뮬레이터
```

## 상세 명세

[SPEC.md](./SPEC.md)

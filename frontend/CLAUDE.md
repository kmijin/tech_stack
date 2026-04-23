# 프론트엔드 에이전트 설정

당신은 **프론트엔드 개발자**입니다. React + Vite 최신 버전 기반으로 UI 컴포넌트와 화면을 구현합니다.

---

## 기술 스택

| 항목 | 버전/사양 |
|------|----------|
| Framework | React 19+ |
| Build Tool | Vite (최신) |
| Language | TypeScript |
| 상태 관리 | Zustand 또는 React Query (목적에 맞게 선택) |
| HTTP Client | Axios 또는 fetch (일관되게 통일) |
| 스타일 | CSS Modules 또는 Tailwind CSS |
| 환경 | dev, prod |

---

## 코딩 규칙

### 컴포넌트
- **함수형 컴포넌트**만 사용 — class 컴포넌트 금지
- 컴포넌트 파일명은 **PascalCase** (예: `UserCard.tsx`)
- 훅 파일명은 **camelCase**, `use` 접두사 필수 (예: `useUserList.ts`)
- Props 타입은 인터페이스로 명시적 선언

```tsx
// 컴포넌트 예시
interface UserCardProps {
  id: number;
  name: string;
  email: string;
}

export function UserCard({ id, name, email }: UserCardProps) {
  return (
    <div className={styles.card}>
      <h3>{name}</h3>
      <p>{email}</p>
    </div>
  );
}
```

### 코드 중복 방지
- 반복되는 UI 패턴은 공통 컴포넌트로 추출 (`components/common/`)
- API 호출 로직은 커스텀 훅으로 분리 (`hooks/`)
- 공통 타입은 `types/` 폴더에 중앙 관리
- 유틸리티 함수는 `utils/` 폴더로 분리

### 로그 (console)
- **`console.log` 커밋 금지** — 개발 중 디버그 로그는 커밋 전 제거
- 에러 처리 시 `console.error`는 허용 (사용자에게 알리기 어려운 에러)
- 프로덕션에서는 에러 모니터링 서비스(Sentry 등)로 대체 권장

---

## 환경 설정

### 구성 파일 구조
```
frontend/
├── .env.development      # dev 환경 전용
├── .env.production       # prod 환경 전용
└── .env.example          # 팀원 공유용 템플릿 (실제 값 없음)
```

### 절대 금지
```ts
// 하드코딩 금지!
const API_URL = 'http://localhost:8080/api';
const SECRET_KEY = 'abc123';

// 올바른 방법 — 환경변수 사용
const API_URL = import.meta.env.VITE_API_URL;
```

### .env.development 예시
```
VITE_API_URL=http://localhost:8080/api
VITE_APP_NAME=Huhbilon Dev
```

### .env.production 예시
```
VITE_API_URL=https://api.huhbilon.com/api
VITE_APP_NAME=Huhbilon
```

### .env.example (커밋 대상)
```
VITE_API_URL=
VITE_APP_NAME=
```

### vite.config.ts 환경별 프록시 예시
```ts
export default defineConfig(({ mode }) => ({
  server: {
    proxy: mode === 'development' ? {
      '/api': { target: 'http://localhost:8080', changeOrigin: true }
    } : undefined,
  },
}));
```

---

## 폴더 구조

```
src/
├── components/
│   ├── common/     # 공통 재사용 컴포넌트
│   └── {도메인명}/ # 도메인별 컴포넌트
├── pages/          # 라우트 단위 페이지
├── hooks/          # 커스텀 훅
├── services/       # API 호출 함수
├── stores/         # 전역 상태 (Zustand 등)
├── types/          # TypeScript 타입 정의
└── utils/          # 유틸리티 함수
```

---

## API 연동

- API base URL은 항상 환경변수 `VITE_API_URL`에서 읽음
- 에러 응답 처리는 인터셉터에서 공통 처리
- 백엔드 `ApiResponse<T>` 형식에 맞춰 타입 정의

```ts
// types/api.ts
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  message: string | null;
}
```

---

## 보안

- `.env.development`, `.env.production` 파일은 `.gitignore`에 추가
- 민감 정보는 절대 소스코드에 포함 금지
- API 토큰은 메모리 또는 httpOnly 쿠키로 관리 (localStorage 지양)

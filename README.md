# Tech Stack 대시보드

팀 기술 스택의 최신 버전을 실시간으로 조회하고, 마이그레이션 분석과 스캔 스크립트를 제공하는 내부 대시보드입니다.

## 시작하기

```bash
cd frontend
npm install
npm run dev
```

## 주요 기능

- **실시간 버전 조회** — npm, GitHub Releases, Adoptium API에서 최신 버전 자동 수집
- **설정 파일 파싱** — `package.json` / `build.gradle` / `pom.xml` 업로드 또는 붙여넣기로 현재 버전 자동 추출
- **맞춤 권장사항** — 현재 버전 기준 Breaking Changes 및 신기능 안내
- **마이그레이션 분석** — 현재 → 목표 버전 범위의 변경사항 필터링 및 복잡도 산정
- **스캔 스크립트 생성** — 대규모 프로젝트용 bash / PowerShell 스크립트 자동 생성 및 결과 분석

## 추적 스택

`Java` `Spring Boot` `React` `Vite` `Zustand` `QueryDSL`

## 상세 명세

[SPEC.md](./SPEC.md)

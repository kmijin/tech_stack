// ──────────────────────────────────────────────────────────
// 신규 라이브러리 호환성 시뮬레이터
//   npm  : registry.npmjs.org에서 peerDependencies 실시간 조회
//   Java : 정적 룰 DB 기반 Spring Boot / Java 버전 호환성 체크
// ──────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────

export interface PeerDepCheck {
  pkg: string
  required: string
  current: string | null
  status: 'ok' | 'warn' | 'conflict' | 'unknown'
  statusMessage: string
}

export interface Alternative {
  name: string
  description: string
}

export interface NpmSimResult {
  type: 'npm'
  pkg: string
  version: string
  description: string
  license: string
  peerDeps: PeerDepCheck[]
  overallStatus: 'ok' | 'warn' | 'conflict'
  alternatives: Alternative[]
}

export interface JavaCheck {
  label: string
  status: 'ok' | 'warn' | 'conflict'
  message: string
}

export interface JavaSimResult {
  type: 'java'
  groupId: string
  artifactId: string
  version: string
  overallStatus: 'ok' | 'warn' | 'conflict' | 'unknown'
  checks: JavaCheck[]
  notes: string[]
  alternatives: Alternative[]
}

export type SimResult = NpmSimResult | JavaSimResult

// ── npm: 패키지명 → 내부 스택 키 매핑 ────────────────────

const NPM_TO_STACK_KEY: Record<string, string> = {
  'react':                      'react',
  'react-dom':                  'react',
  'vite':                       'vite',
  '@vitejs/plugin-react':       'vite',
  '@vitejs/plugin-react-swc':   'vite',
  'zustand':                    'zustand',
}

// ── npm: 버전 호환성 체크 (간소화된 semver) ───────────────

function parseMajor(v: string): number {
  return parseInt(v.replace(/[^\d.]/g, '')) || 0
}

export function checkPeerDep(
  required: string,
  current: string | null,
): PeerDepCheck['status'] {
  if (!current) return 'unknown'

  const curMajor = parseMajor(current)

  // OR 범위 분리: "^18.0.0 || ^19.0.0"
  const parts    = required.split('||').map(p => p.trim())
  const reqMajors = parts
    .map(p => { const m = p.match(/\d+/); return m ? parseInt(m[0]) : null })
    .filter((n): n is number => n !== null)

  if (reqMajors.length === 0) return 'ok'
  if (reqMajors.includes(curMajor)) return 'ok'
  if (curMajor > Math.max(...reqMajors)) return 'warn'  // 더 높은 버전 — 대부분 호환
  return 'conflict'
}

function peerDepMessage(
  status: PeerDepCheck['status'],
  required: string,
  current: string | null,
): string {
  switch (status) {
    case 'ok':       return `현재 버전(${current})이 요구사항(${required})을 충족합니다`
    case 'warn':     return `현재 버전(${current})이 요구사항(${required})보다 높습니다 — 대부분 호환되나 확인 권장`
    case 'conflict': return `현재 버전(${current})이 요구사항(${required})을 충족하지 않습니다 — 업그레이드 필요`
    case 'unknown':  return `현재 버전 정보 없음 — 직접 확인 필요 (요구사항: ${required})`
  }
}

// ── npm: registry 조회 ────────────────────────────────────

export async function fetchNpmPkg(name: string, version?: string): Promise<{
  version: string
  description: string
  license: string
  peerDependencies: Record<string, string>
}> {
  const tag = version && version !== 'latest' ? version : 'latest'
  const res = await fetch(`https://registry.npmjs.org/${name}/${tag}`)
  if (!res.ok) throw new Error(`패키지를 찾을 수 없습니다: ${name}${version ? `@${version}` : ''}`)
  const data = await res.json()
  return {
    version:          data.version ?? tag,
    description:      data.description ?? '',
    license:          data.license ?? '',
    peerDependencies: data.peerDependencies ?? {},
  }
}

// ── npm: 시뮬레이션 실행 ──────────────────────────────────

export async function simulateNpm(
  pkg: string,
  version: string | undefined,
  currentVersions: Record<string, string>,
): Promise<NpmSimResult> {
  const meta = await fetchNpmPkg(pkg, version)

  const peerDeps: PeerDepCheck[] = Object.entries(meta.peerDependencies).map(([name, req]) => {
    const key     = NPM_TO_STACK_KEY[name]
    const current = key ? (currentVersions[key] ?? null) : null
    const status  = checkPeerDep(req, current)
    return { pkg: name, required: req, current, status, statusMessage: peerDepMessage(status, req, current) }
  })

  const overallStatus: NpmSimResult['overallStatus'] =
    peerDeps.some(p => p.status === 'conflict') ? 'conflict' :
    peerDeps.some(p => p.status === 'warn' || p.status === 'unknown') ? 'warn' :
    'ok'

  return {
    type: 'npm',
    pkg,
    version:      meta.version,
    description:  meta.description,
    license:      meta.license,
    peerDeps,
    overallStatus,
    alternatives: NPM_ALTERNATIVES[pkg.toLowerCase()] ?? [],
  }
}

// ── Java: 정적 룰 DB ──────────────────────────────────────

interface JavaLibRule {
  groupId: string
  artifactId: string
  check: (version: string, springBoot?: string, java?: string) => JavaCheck[]
  notes: string[]
  alternatives: Alternative[]
}

const JAVA_RULES: JavaLibRule[] = [
  {
    groupId: 'org.projectlombok', artifactId: 'lombok',
    check: (v, sb) => {
      const [, minor, patch] = v.split('.').map(Number)
      const checks: JavaCheck[] = []
      if (minor === 18 && patch < 36) {
        checks.push({ label: 'Java 21+ 호환성', status: 'conflict', message: `Lombok ${v} — Java 21+ 컴파일러 내부 API 변경으로 빌드 오류 발생. 1.18.36 이상 필수` })
      } else {
        checks.push({ label: 'Java 21+ 호환성', status: 'ok', message: `Lombok ${v} — Java 21+ 호환 버전입니다` })
      }
      if (sb && parseFloat(sb) >= 3) {
        checks.push({ label: 'Spring Boot 3/4 호환성', status: 'ok', message: 'annotationProcessor 순서만 주의하면 정상 동작합니다' })
      }
      return checks
    },
    notes: [
      'annotationProcessor 순서: Lombok → MapStruct 순서 고정 필수',
      'Kotlin 프로젝트에서는 kapt 대신 KSP 사용 권장',
    ],
    alternatives: [],
  },
  {
    groupId: 'io.jsonwebtoken', artifactId: 'jjwt-api',
    check: (v) => {
      if (v.startsWith('0.10') || v.startsWith('0.11')) {
        return [{ label: 'Java 17+ 호환성', status: 'conflict', message: `jjwt ${v} — Java 17+ 리플렉션 강화로 런타임 오류 가능. 0.12.x 이상 필수` }]
      }
      if (v.startsWith('0.12')) {
        return [{ label: 'Java 17+ 호환성', status: 'ok', message: '0.12.x — Java 17+ 완전 지원' }]
      }
      return [{ label: '버전 확인', status: 'warn', message: `jjwt ${v} — 공식 릴리스 노트에서 호환성을 직접 확인하세요` }]
    },
    notes: [
      '0.12.x부터 Claims 생성 방법 등 API가 크게 변경됨',
      'jjwt-impl, jjwt-jackson 의존성도 함께 업그레이드 필요',
    ],
    alternatives: [
      { name: 'spring-security-oauth2-jose', description: 'Spring Security 내장 JWT 지원 — 추가 라이브러리 불필요' },
    ],
  },
  {
    groupId: 'com.querydsl', artifactId: 'querydsl-jpa',
    check: (v, sb) => {
      const checks: JavaCheck[] = []
      const sbMajor = sb ? parseFloat(sb) : 0
      if (parseFloat(v) < 5) {
        checks.push({ label: 'Spring Boot 3+ 호환성', status: 'conflict', message: `QueryDSL ${v} — Spring Boot 3 (Jakarta EE 9+)에서 미지원. 5.x 이상 필요` })
      } else {
        checks.push({ label: '버전', status: 'ok', message: `QueryDSL ${v} — Spring Boot 3/4 지원 버전입니다` })
      }
      if (sbMajor >= 3) {
        checks.push({ label: 'Jakarta EE 분류자', status: 'warn', message: `Spring Boot ${sb}에서는 ':jakarta' 분류자 명시 필수: querydsl-jpa:${v}:jakarta` })
      }
      return checks
    },
    notes: [
      'JPAQueryFactory 초기화 시 import가 jakarta.persistence.EntityManager 여야 함',
      'Q클래스 생성용 annotationProcessor 설정 별도 필요',
    ],
    alternatives: [
      { name: 'Spring Data JPA Specifications', description: 'JPA Criteria 기반 동적 쿼리 — 추가 라이브러리 불필요' },
      { name: 'jOOQ', description: 'SQL 중심 타입 세이프 쿼리 빌더 — 복잡한 쿼리에 강점' },
    ],
  },
  {
    groupId: 'com.google.firebase', artifactId: 'firebase-admin',
    check: (v) => {
      if (parseInt(v) < 9) {
        return [{ label: 'Java 21+ 호환성', status: 'conflict', message: `firebase-admin ${v} — 9.x 미만은 Java 21+ 호환성 미보장. 9.x 이상 권장` }]
      }
      return [{ label: 'Java 21+ 호환성', status: 'ok', message: `firebase-admin ${v} — Java 21+ 호환 버전입니다` }]
    },
    notes: [
      'Spring Boot의 기본 ObjectMapper와 충돌 가능 — Jackson Bean 설정 별도 확인',
      'GCP 환경에서는 Application Default Credentials 사용 권장',
    ],
    alternatives: [],
  },
  {
    groupId: 'com.mysql', artifactId: 'mysql-connector-j',
    check: (v) => {
      if (parseInt(v) < 8) {
        return [{ label: 'Java 21+ TLS 호환성', status: 'conflict', message: `mysql-connector-j ${v} — 8.x 미만은 Java 21+에서 TLS 핸드셰이크 오류 가능. 8.x 이상 필수` }]
      }
      return [{ label: 'Java 21+ TLS 호환성', status: 'ok', message: `mysql-connector-j ${v} — Java 21+ 호환 버전입니다` }]
    },
    notes: [
      'Spring Boot 3+ 사용 시 그룹 ID가 mysql → com.mysql 로 변경됨',
      '패키지명도 mysql-connector-java → mysql-connector-j 로 변경 (8.0.31+)',
    ],
    alternatives: [
      { name: 'R2DBC MySQL', description: 'WebFlux / 리액티브 스택 전용 비동기 드라이버' },
    ],
  },
  {
    groupId: 'org.mapstruct', artifactId: 'mapstruct',
    check: (v) => {
      if (parseFloat(v) < 1.5) {
        return [{ label: 'Java 21+ 호환성', status: 'warn', message: `MapStruct ${v} — 1.5 미만은 Java 21에서 경고 발생 가능. 1.5.x 이상 권장` }]
      }
      return [{ label: 'Java 21+ 호환성', status: 'ok', message: `MapStruct ${v} — Java 21+ 완전 지원` }]
    },
    notes: [
      'Lombok과 함께 사용 시 annotationProcessor 순서: Lombok → MapStruct 필수',
      '@Mapper(componentModel = "spring") 설정으로 Spring Bean 자동 등록',
    ],
    alternatives: [],
  },
  {
    groupId: 'org.flywaydb', artifactId: 'flyway-core',
    check: (v, sb) => {
      const checks: JavaCheck[] = []
      const sbMajor = sb ? parseFloat(sb) : 0
      if (sbMajor >= 3 && parseInt(v) < 9) {
        checks.push({ label: 'Spring Boot 3 호환성', status: 'conflict', message: `Flyway ${v} — Spring Boot 3에서는 9.x 이상 필요` })
      } else if (sbMajor >= 3) {
        checks.push({ label: 'Spring Boot 3 호환성', status: 'ok', message: `Flyway ${v} — Spring Boot 3 지원 버전입니다` })
      }
      if (sbMajor >= 4 && parseInt(v) < 10) {
        checks.push({ label: 'Spring Boot 4 호환성', status: 'warn', message: `Spring Boot 4와 Flyway ${v} 호환성을 릴리스 노트에서 확인하세요` })
      }
      return checks
    },
    notes: [
      'Jakarta 네임스페이스 마이그레이션 시 기존 SQL migration 파일은 수정 불필요',
      'MySQL 8.4+에서 SQL 문법 변경 사항 별도 확인 필요',
    ],
    alternatives: [
      { name: 'Liquibase', description: 'XML/YAML/JSON 기반 DB 마이그레이션 — 롤백 지원 강점' },
    ],
  },
  {
    groupId: 'org.springdoc', artifactId: 'springdoc-openapi-starter-webmvc-ui',
    check: (v, sb) => {
      const sbMajor = sb ? parseFloat(sb) : 0
      if (sbMajor >= 3 && parseFloat(v) < 2) {
        return [{ label: 'Spring Boot 3 호환성', status: 'conflict', message: `springdoc ${v} — Spring Boot 3에서는 2.x 이상 필요. artifact ID도 변경됨` }]
      }
      if (sbMajor >= 3 && parseFloat(v) >= 2) {
        return [{ label: 'Spring Boot 3 호환성', status: 'ok', message: `springdoc ${v} — Spring Boot 3 지원 버전입니다` }]
      }
      return [{ label: '버전', status: 'ok', message: `springdoc ${v}` }]
    },
    notes: [
      'Spring Boot 3 마이그레이션 시 artifact ID: springdoc-openapi-ui → springdoc-openapi-starter-webmvc-ui',
      'Swagger UI 경로: /swagger-ui/index.html',
    ],
    alternatives: [],
  },
]

// ── Java: 시뮬레이션 실행 ─────────────────────────────────

export function simulateJava(
  groupId: string,
  artifactId: string,
  version: string,
  currentVersions: Record<string, string>,
): JavaSimResult {
  const rule = JAVA_RULES.find(
    r => r.groupId.toLowerCase()    === groupId.toLowerCase() &&
         r.artifactId.toLowerCase() === artifactId.toLowerCase()
  )

  if (!rule) {
    return {
      type: 'java', groupId, artifactId, version,
      overallStatus: 'unknown',
      checks: [{ label: '데이터베이스 조회', status: 'warn', message: '이 라이브러리에 대한 호환성 규칙이 없습니다. 공식 릴리스 노트를 직접 확인하세요.' }],
      notes: [],
      alternatives: [],
    }
  }

  const checks = rule.check(version, currentVersions['springboot'], currentVersions['java'])

  const overallStatus: JavaSimResult['overallStatus'] =
    checks.some(c => c.status === 'conflict') ? 'conflict' :
    checks.some(c => c.status === 'warn')     ? 'warn'     :
    'ok'

  return {
    type: 'java', groupId, artifactId, version,
    overallStatus,
    checks,
    notes:        rule.notes,
    alternatives: rule.alternatives,
  }
}

// ── npm 대안 라이브러리 DB ────────────────────────────────

export const NPM_ALTERNATIVES: Record<string, Alternative[]> = {
  'moment': [
    { name: 'dayjs',      description: '2KB 경량 Moment.js 대체 — API 거의 동일, Tree-shakeable' },
    { name: 'date-fns',   description: '함수형 날짜 유틸리티 — 필요한 함수만 import 가능' },
    { name: 'luxon',      description: 'Moment.js 후속 — 타임존·국제화 강점' },
  ],
  'lodash': [
    { name: '네이티브 JS', description: 'ES2020+ 기준 대부분의 lodash 기능이 네이티브 제공' },
    { name: 'radash',     description: 'TypeScript-first, Tree-shakeable, 모던 API' },
    { name: 'remeda',     description: 'TypeScript-first — pipe/compose 지원' },
  ],
  'axios': [
    { name: 'ky',           description: '경량 fetch 래퍼 — axios와 유사한 API' },
    { name: 'ofetch',       description: 'Nuxt 팀 제작 — 자동 JSON 파싱, 인터셉터 지원' },
    { name: '네이티브 fetch', description: 'React 19에서 캐싱/서버 컴포넌트 fetch 강화 — 별도 라이브러리 불필요' },
  ],
  'redux': [
    { name: 'zustand', description: '보일러플레이트 없는 경량 상태 관리 — React 19 완전 지원' },
    { name: 'jotai',   description: '원자(Atom) 기반 — Suspense 친화적' },
    { name: 'valtio',  description: 'Proxy 기반 — 직관적인 변경 방식' },
  ],
  'react-redux': [
    { name: 'zustand', description: '보일러플레이트 없는 경량 상태 관리' },
    { name: 'jotai',   description: '원자 기반 상태 관리' },
  ],
  'styled-components': [
    { name: 'tailwindcss',      description: '유틸리티 우선 CSS — 런타임 JS 없음, 빌드 타임 최적화' },
    { name: '@emotion/react',   description: '런타임 CSS-in-JS — styled-components와 유사한 API' },
    { name: 'vanilla-extract',  description: '타입 안전 CSS — 빌드 타임 생성, 제로 런타임' },
  ],
  'formik': [
    { name: 'react-hook-form', description: '비제어 컴포넌트 기반 — 성능 우수, 번들 크기 작음' },
  ],
  'yup': [
    { name: 'zod',      description: 'TypeScript-first 스키마 검증 — 타입 추론 강점' },
    { name: 'valibot',  description: '모듈식 검증 — zod보다 번들 크기 작음' },
  ],
  'react-query': [
    { name: '@tanstack/react-query', description: 'React Query v5 공식 후속 패키지 — React 19 지원' },
  ],
  '@reduxjs/toolkit': [
    { name: 'zustand', description: '훨씬 적은 보일러플레이트로 동일한 역할' },
    { name: 'jotai',   description: '원자 기반 — 파생 상태 관리 강점' },
  ],
}

// ── npm 빠른 입력 예시 ────────────────────────────────────

export const NPM_QUICK_PICKS = [
  'axios', 'moment', 'lodash', 'zustand',
  '@tanstack/react-query', 'react-router-dom',
  'framer-motion', 'recharts', 'react-hook-form', 'zod',
]

// ── Java 빠른 입력 예시 ───────────────────────────────────

export const JAVA_QUICK_PICKS: { groupId: string; artifactId: string; label: string }[] = [
  { groupId: 'org.projectlombok',   artifactId: 'lombok',                                    label: 'Lombok' },
  { groupId: 'io.jsonwebtoken',     artifactId: 'jjwt-api',                                  label: 'JJWT' },
  { groupId: 'com.querydsl',        artifactId: 'querydsl-jpa',                               label: 'QueryDSL' },
  { groupId: 'com.google.firebase', artifactId: 'firebase-admin',                             label: 'Firebase Admin' },
  { groupId: 'com.mysql',           artifactId: 'mysql-connector-j',                          label: 'MySQL Connector' },
  { groupId: 'org.mapstruct',       artifactId: 'mapstruct',                                  label: 'MapStruct' },
  { groupId: 'org.flywaydb',        artifactId: 'flyway-core',                                label: 'Flyway' },
  { groupId: 'org.springdoc',       artifactId: 'springdoc-openapi-starter-webmvc-ui',        label: 'Springdoc' },
]

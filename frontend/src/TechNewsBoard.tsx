import { useState, useMemo, useEffect } from 'react'
import {
  Cpu, Zap, Globe, Package, GitBranch, AlertTriangle,
  CheckCircle, ExternalLink, ChevronDown, ChevronUp,
  TrendingUp, Star, Clock, Database, RefreshCw,
  ArrowUpRight, Info, Shield, Settings, Sparkles, X,
  Terminal, Copy, Download, BarChart2, FileText, Upload,
} from 'lucide-react'
import { useLatestVersions } from './hooks/useLatestVersions'
import type { StackId, VersionInfo } from './services/versionService'
import { parseConfigFile } from './services/configParser'
import type { ParseResult } from './services/configParser'
import {
  generateScript, parseScanResult, getFileCount, GREP_DEFS, requiredKeys,
} from './services/migrationScript'
import type { ScriptInput, ScanResult } from './services/migrationScript'
import {
  scanFolder, pickFolder, isFolderPickerSupported, PATTERNS, KEY_EXTS,
} from './services/folderScanner'
import type { ScanProgress, FolderScanResult } from './services/folderScanner'
import { FIX_GUIDES, LINE_TRANSFORMS, getMigrationChecklist } from './services/migrationGuide'
import type { ChecklistItem } from './services/migrationGuide'
import {
  simulateNpm, simulateJava,
  NPM_QUICK_PICKS, JAVA_QUICK_PICKS,
} from './services/compatSimulator'
import type { SimResult } from './services/compatSimulator'
import { parseRepoUrl, fetchRepoFiles, fetchSourceFiles } from './services/repoFetcher'
import type { RepoInfo, FetchedFile } from './services/repoFetcher'
import { rewriteConfig, getChangeSummary, rewriteSourceFile, deriveCompatibleTargets } from './services/versionRewriter'
import { pushToBranch, generateBranchName, generateCommitMessage } from './services/repoPusher'
import { aiTransformFile, detectComplexPatterns, AiTransformError, AI_ERROR_CODE } from './services/aiTransformer'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface Feature {
  text: string
  type: 'new' | 'improved' | 'breaking' | 'tip'
  sinceVersion: string
}
interface StackItem {
  id: string
  name: string
  category: 'backend' | 'frontend' | 'tool'
  latestVersion: string
  latestLabel: string
  releaseDate: string
  status: 'stable' | 'lts' | 'milestone' | 'latest'
  icon: React.ElementType
  color: string
  bgColor: string
  borderColor: string
  iconBg: string
  summary: string
  features: Feature[]
  link: string
  quickVersions: string[]
  ltsVersions?: string[]
  unitLabel: string
}
interface CompatItem {
  name: string
  compatible: 'ok' | 'warn' | 'check'
  note: string
  relatedIds: string[]
}

// ─────────────────────────────────────────────
// Version Utils
// ─────────────────────────────────────────────
function parseMajorMinor(v: string): number {
  const num = parseFloat(v.replace(/[^0-9.]/g, ''))
  return isNaN(num) ? 0 : num
}
function isAffected(userVer: string, sinceVersion: string): boolean {
  return parseMajorMinor(userVer) < parseMajorMinor(sinceVersion)
}
// current < sinceVersion ≤ target
function isInRange(current: string, target: string, sinceVersion: string): boolean {
  const c = parseMajorMinor(current)
  const t = parseMajorMinor(target)
  const s = parseMajorMinor(sinceVersion)
  return c < s && s <= t
}
function versionGap(userVer: string, latestVer: string): 'up-to-date' | 'minor' | 'major' {
  const u = parseMajorMinor(userVer)
  const l = parseMajorMinor(latestVer)
  if (u >= l) return 'up-to-date'
  if (Math.floor(u) === Math.floor(l)) return 'minor'
  return 'major'
}
function fileComplexity(count: number): { level: string; cls: string } {
  if (count === 0) return { level: '영향 없음', cls: 'bg-gray-100 text-gray-500' }
  if (count <= 10) return { level: 'LOW', cls: 'bg-emerald-100 text-emerald-700' }
  if (count <= 30) return { level: 'MEDIUM', cls: 'bg-amber-100 text-amber-700' }
  return { level: 'HIGH', cls: 'bg-red-100 text-red-700' }
}
function overallComplexity(breakingCount: number): { level: string; cls: string; dot: string } {
  if (breakingCount === 0) return { level: 'LOW',    cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' }
  if (breakingCount <= 2)  return { level: 'MEDIUM', cls: 'bg-amber-100 text-amber-700 border-amber-200',       dot: 'bg-amber-500' }
  return                         { level: 'HIGH',   cls: 'bg-red-100 text-red-700 border-red-200',             dot: 'bg-red-500' }
}

// ─────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────
const STACK: StackItem[] = [
  {
    id: 'java', name: 'Java', category: 'backend',
    latestVersion: '25', latestLabel: '25',
    releaseDate: '2025-09-16', status: 'lts',
    icon: Cpu,
    color: 'text-orange-600', bgColor: 'bg-orange-50', borderColor: 'border-orange-200', iconBg: 'bg-orange-100',
    quickVersions: ['8', '11', '17', '21', '25'], unitLabel: '예: 17',
    summary: 'Java LTS 기준 표시 (8·11·17·21·25). 최신 릴리스는 Java 26 (2026-03, 비 LTS). 프로덕션은 Java 25 LTS 권장.',
    link: 'https://openjdk.org/projects/jdk/26/',
    features: [
      { text: 'Java 26 — 2026년 3월 비 LTS 릴리스. 프로덕션 권장 LTS는 Java 25 (2025-09)', type: 'tip', sinceVersion: '26' },
      { text: 'JEP 519 — Compact Object Headers: 객체 헤더 64→32bit, 힙 메모리 10~20% 절감', type: 'new', sinceVersion: '25' },
      { text: 'JEP 521 — Generational Shenandoah GC: 저지연·예측 가능한 응답시간 확보', type: 'new', sinceVersion: '25' },
      { text: 'JEP 506 — Scoped Values 정식화: ThreadLocal 대체, Virtual Thread 환경 안전한 값 공유', type: 'new', sinceVersion: '25' },
      { text: 'JEP 512 — Compact Source Files & Instance Main Methods: 보일러플레이트 없는 스크립트형 Java', type: 'improved', sinceVersion: '25' },
      { text: 'Post-Quantum 암호화: ML-KEM, ML-DSA 알고리즘 기본 내장', type: 'new', sinceVersion: '25' },
      { text: 'Virtual Threads (JEP 444) 정식화 — 21에서 안정화, 25에서 성능 개선', type: 'improved', sinceVersion: '22' },
      { text: 'Record Patterns + Pattern Matching for switch — 17 preview → 21 정식화', type: 'improved', sinceVersion: '21' },
      { text: 'sun.* internal API 제거 — 직접 참조 코드 수정 필요', type: 'breaking', sinceVersion: '9' },
      { text: 'finalize() 지원 종료 — Cleaner/PhantomReference로 교체 권장', type: 'breaking', sinceVersion: '18' },
      { text: 'Lambda 표현식 · Stream API · Optional<T> — 함수형 프로그래밍 패러다임 도입', type: 'new', sinceVersion: '8' },
      { text: 'java.time 패키지 (JSR-310): LocalDate, LocalDateTime, ZonedDateTime — Date/Calendar 대체', type: 'new', sinceVersion: '8' },
      { text: 'Default & Static 인터페이스 메서드: 인터페이스에 구현 코드 포함 가능', type: 'new', sinceVersion: '8' },
      { text: 'CompletableFuture: 비동기 파이프라인 체이닝 지원', type: 'new', sinceVersion: '8' },
      { text: 'HTTP Client API (JEP 321) 정식화: java.net.http.HttpClient — URLConnection 대체', type: 'new', sinceVersion: '11' },
      { text: 'String 신규 메서드: isBlank(), strip(), lines(), repeat() 추가', type: 'new', sinceVersion: '11' },
      { text: 'Files.readString() / writeString(): 파일 읽기·쓰기 한 줄 처리', type: 'new', sinceVersion: '11' },
      { text: 'Java EE · CORBA 모듈 제거 — javax.xml.bind(JAXB) 등 별도 의존성 추가 필요', type: 'breaking', sinceVersion: '11' },
      { text: 'ZGC (JEP 333) 실험적 도입: 저지연 GC', type: 'new', sinceVersion: '11' },
      { text: 'var in 람다 파라미터 (JEP 323): (var x, var y) -> x + y 형태 지원', type: 'improved', sinceVersion: '11' },
      { text: 'Sealed Classes 정식화 (JEP 409): permits로 상속 가능 클래스 제한', type: 'new', sinceVersion: '17' },
      { text: 'Records 정식화 (JEP 395): 불변 데이터 클래스 간결 선언', type: 'new', sinceVersion: '17' },
      { text: 'Pattern Matching for instanceof 정식화 (JEP 394): instanceof 후 캐스팅 생략', type: 'new', sinceVersion: '17' },
      { text: 'Text Blocks 정식화 (JEP 378): 멀티라인 문자열 """..."""', type: 'new', sinceVersion: '17' },
      { text: 'JDK 내부 API 강력 캡슐화 (JEP 403): --illegal-access 옵션 제거', type: 'breaking', sinceVersion: '17' },
      { text: 'RMI Activation 제거 (JEP 407) · Applet API Deprecated (JEP 398)', type: 'breaking', sinceVersion: '17' },
    ],
  },
  {
    id: 'springboot', name: 'Spring Boot', category: 'backend',
    latestVersion: '4.0', latestLabel: '4.0.5',
    releaseDate: '2025-11-20', status: 'stable',
    icon: Zap,
    color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200', iconBg: 'bg-emerald-100',
    quickVersions: ['2.7', '3.0', '3.2', '3.3', '3.4', '4.0', '4.0.5'], unitLabel: '예: 3.3',
    summary: 'Spring Boot 4.0 GA 2025-11. Spring Framework 7 + Jakarta EE 11 기반. 4.1.0-M4 진행 중.',
    link: 'https://spring.io/blog/2025/11/20/spring-boot-4-0-0-available-now/',
    features: [
      { text: 'Spring Framework 7 + Jakarta EE 11 전환 (Servlet 6.1, JPA 3.2, Bean Validation 3.1)', type: 'breaking', sinceVersion: '4.0' },
      { text: 'new ObjectMapper() 직접 생성 비권장 — Spring Boot 4는 Jackson 2.17+ 사용 (Jackson 3 미출시), Bean 주입으로 교체 권장', type: 'breaking', sinceVersion: '4.0' },
      { text: 'QueryDSL: querydsl-jpa에 jakarta 분류자 사용 필수 (javax→jakarta 완전 이동)', type: 'breaking', sinceVersion: '4.0' },
      { text: 'First-class API Versioning: MVC/WebFlux에 버전별 라우팅, RestClient 버전 헤더 내장', type: 'new', sinceVersion: '4.0' },
      { text: 'spring-boot-starter-opentelemetry: OTLP 메트릭·트레이스 단일 스타터', type: 'new', sinceVersion: '4.0' },
      { text: 'HTTP Service Client 자동 설정: 인터페이스만 선언하면 구현체 자동 생성', type: 'new', sinceVersion: '4.0' },
      { text: 'javax.* → jakarta.* 전면 교체 (Spring Boot 3.0 때 이미 시작)', type: 'breaking', sinceVersion: '3.0' },
      { text: 'Spring Security 6 — WebSecurityConfigurerAdapter 완전 제거', type: 'breaking', sinceVersion: '3.0' },
      { text: 'spring-security-oauth2 완전 제거 → spring-authorization-server로 전환 필요 (API 구조 상이)', type: 'breaking', sinceVersion: '3.0' },
      { text: 'RestTemplate 유지보수 모드 전환 → RestClient(동기) 또는 WebClient(비동기) 사용 권장', type: 'breaking', sinceVersion: '3.2' },
      { text: 'Actuator /info, /health 기본 노출 변경 — application.properties 재설정 필요', type: 'tip', sinceVersion: '3.0' },
      { text: 'auto-configuration 등록 방식 예고 변경: spring.factories → META-INF/spring/…AutoConfiguration.imports (3.0 이전 호환)', type: 'tip', sinceVersion: '2.7' },
      { text: 'Spring Security 5.7: WebSecurityConfigurerAdapter Deprecated 시작 — SecurityFilterChain Bean 방식 권장', type: 'breaking', sinceVersion: '2.7' },
      { text: 'Spring Framework 5.3 기반 — 마지막 2.x LTS 버전', type: 'tip', sinceVersion: '2.7' },
      { text: 'Automatic CDS (Class Data Sharing): 별도 설정 없이 JVM 시작 시간 단축', type: 'new', sinceVersion: '3.3' },
      { text: 'spring.threads.virtual.enabled=true: Virtual Thread 원클릭 활성화 (Java 21+)', type: 'new', sinceVersion: '3.3' },
      { text: 'Spring Security 6.3: Passive JWK Set URI · 메서드 수준 인증 개선', type: 'improved', sinceVersion: '3.3' },
      { text: 'RestClient 기본 HTTP 클라이언트 전환 — RestTemplate 완전 대체 권장', type: 'improved', sinceVersion: '3.4' },
      { text: '@MockitoBean / @MockitoSpyBean: 테스트용 @MockBean 대체 어노테이션 도입', type: 'new', sinceVersion: '3.4' },
      { text: 'Structured Logging 지원: JSON 형식 로그 출력 설정 간소화', type: 'new', sinceVersion: '3.4' },
      { text: 'Spring Framework 6.2 기반: 조건부 빈 등록 및 AOP 개선', type: 'improved', sinceVersion: '3.4' },
    ],
  },
  {
    id: 'react', name: 'React', category: 'frontend',
    latestVersion: '19', latestLabel: '19.2',
    releaseDate: '2025-10-01', status: 'latest',
    icon: Globe,
    color: 'text-cyan-600', bgColor: 'bg-cyan-50', borderColor: 'border-cyan-200', iconBg: 'bg-cyan-100',
    quickVersions: ['16', '17', '18', '18.2', '18.3', '19', '19.2'], unitLabel: '예: 18',
    summary: 'React 19.0(2024-12) → 19.2(2025-10). 컴파일러 자동 최적화, Actions API, Concurrent 기본 활성화.',
    link: 'https://react.dev/blog/2024/12/05/react-19',
    features: [
      { text: 'React Compiler: 빌드타임 자동 최적화 — useMemo/useCallback 없이도 25~40% 리렌더링 감소', type: 'new', sinceVersion: '19' },
      { text: 'Actions API: 폼 제출 + 서버 상태 업데이트 + 리밸리데이션을 단일 async 함수로 처리', type: 'new', sinceVersion: '19' },
      { text: 'use() Hook: Promise·Context를 조건부 렌더링 안에서 직접 읽기 가능', type: 'new', sinceVersion: '19' },
      { text: 'Document Metadata: <title>, <meta> 컴포넌트 내부 선언 — react-helmet 대체', type: 'new', sinceVersion: '19' },
      { text: 'Owner Stack (19.1): 에러 발생 시 렌더링 책임 컴포넌트 정확히 추적', type: 'improved', sinceVersion: '19' },
      { text: 'Concurrent Rendering 기본 활성화 — startTransition, useDeferredValue 팀 가이드라인 필요', type: 'tip', sinceVersion: '19' },
      { text: 'Legacy Root API (ReactDOM.render) 완전 제거 → createRoot() 전환 필수', type: 'breaking', sinceVersion: '19' },
      { text: 'PropTypes 내장 지원 제거 — prop-types 패키지는 유지되나 런타임 체크 불가. TypeScript 또는 JSDoc으로 대체 권장', type: 'breaking', sinceVersion: '19' },
      { text: 'Automatic Batching 기본 적용 — setTimeout·Promise 내부도 배치 처리', type: 'improved', sinceVersion: '18' },
      { text: 'Fiber 아키텍처 재작성: 렌더링 우선순위 제어 · 증분 렌더링 기반 마련', type: 'new', sinceVersion: '16' },
      { text: 'Error Boundaries: componentDidCatch로 하위 컴포넌트 에러 격리', type: 'new', sinceVersion: '16' },
      { text: 'Portals: ReactDOM.createPortal() — DOM 외부 노드에 렌더링', type: 'new', sinceVersion: '16' },
      { text: 'Fragments (<></> / <React.Fragment>): 불필요한 div 래핑 제거', type: 'new', sinceVersion: '16' },
      { text: 'createRef · forwardRef: ref 관리 체계화', type: 'new', sinceVersion: '16' },
      { text: '새 JSX Transform: React import 없이 JSX 사용 가능 — 번들 크기 감소', type: 'new', sinceVersion: '17' },
      { text: '이벤트 위임 변경: document → root 컨테이너로 이벤트 연결 (React 트리 격리 개선)', type: 'improved', sinceVersion: '17' },
      { text: 'React 17은 신규 기능 없음 — 여러 React 버전 동시 사용(점진적 업그레이드) 지원이 주목적', type: 'tip', sinceVersion: '17' },
      { text: 'useId · useSyncExternalStore · useInsertionEffect 안정화', type: 'improved', sinceVersion: '18.2' },
      { text: 'Concurrent Features 안정화: startTransition, useDeferredValue 공식 지원', type: 'improved', sinceVersion: '18.2' },
      { text: 'React 19 준비: propTypes · defaultProps(함수 컴포넌트) · string ref 사용 시 Deprecation 경고 추가', type: 'tip', sinceVersion: '18.3' },
      { text: 'Owner Stack (19.1→19.2): 에러 발생 시 렌더링 책임 컴포넌트 정확히 추적', type: 'improved', sinceVersion: '19.2' },
      { text: 'React Compiler 안정화: useMemo/useCallback 없이도 자동 최적화', type: 'improved', sinceVersion: '19.2' },
    ],
  },
  {
    id: 'vite', name: 'Vite', category: 'tool',
    latestVersion: '8', latestLabel: '8.x',
    releaseDate: '2025-07-01', status: 'stable',
    icon: Package,
    color: 'text-violet-600', bgColor: 'bg-violet-50', borderColor: 'border-violet-200', iconBg: 'bg-violet-100',
    quickVersions: ['4', '5', '5.4', '6', '6.3', '7', '8'], unitLabel: '예: 6',
    summary: 'Vite 8 출시. Environment API 안정화, 빌드 성능 개선. SPA는 하위 호환.',
    link: 'https://vite.dev/blog/announcing-vite8',
    features: [
      { text: 'Environment API: dev/prod 환경을 독립 단위로 분리 — SSR·Edge 배포 시나리오 지원', type: 'new', sinceVersion: '6' },
      { text: 'ESM Module Federation: 마이크로 프론트엔드 빌드타임 공유 모듈 지원', type: 'new', sinceVersion: '6' },
      { text: 'SPA 단일 환경 사용 시 5→6 하위 호환 — vite.config.ts 변경 최소화', type: 'tip', sinceVersion: '6' },
      { text: 'Node.js 21 드롭 — 18/20/22+ 지원', type: 'improved', sinceVersion: '6' },
      { text: 'Rollup 4 기반으로 전환 (Vite 5) — 일부 plugin API 변경', type: 'breaking', sinceVersion: '5' },
      { text: 'Rollup 3 기반 전환: 빌드 성능 향상 · 청크당 CSS 자동 분리', type: 'improved', sinceVersion: '4' },
      { text: 'Node.js 14.18+ 요구 · Sass/Less 레거시 API Deprecation 경고 시작', type: 'tip', sinceVersion: '4' },
      { text: 'Lightning CSS 선택적 사용 지원: PostCSS 대체 가능', type: 'new', sinceVersion: '5.4' },
      { text: 'Environment API 프리뷰: SSR/Edge 빌드 분리 지원 예고', type: 'new', sinceVersion: '5.4' },
      { text: 'Environment API 안정화 마일스톤 — SSR/Edge 빌드 분리 개선', type: 'improved', sinceVersion: '6.3' },
      { text: 'CSS @import 처리 성능 개선', type: 'improved', sinceVersion: '6.3' },
      { text: 'Node.js 20+ 요구 — Node 18 지원 종료', type: 'breaking', sinceVersion: '7' },
      { text: 'Rollup 4 레거시 output 옵션 일부 제거', type: 'breaking', sinceVersion: '7' },
      { text: '대형 프로젝트 번들 속도 대폭 향상', type: 'improved', sinceVersion: '7' },
      { text: 'Node.js 22+ 요구 — Node 20 지원 종료', type: 'breaking', sinceVersion: '8' },
      { text: 'Rust 기반 모듈 해석 도입: 의존성 크롤링 속도 향상', type: 'improved', sinceVersion: '8' },
    ],
  },
  {
    id: 'zustand', name: 'Zustand', category: 'frontend',
    latestVersion: '5', latestLabel: 'v5.0.9',
    releaseDate: '2024-10-01', status: 'stable',
    icon: Database,
    color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-200', iconBg: 'bg-amber-100',
    quickVersions: ['3', '4', '5'], unitLabel: '예: 4',
    summary: 'Zustand v5: 레거시 제거 집중. default export 삭제, ESM 전용, React 18 최소 요구.',
    link: 'https://github.com/pmndrs/zustand/releases/tag/v5.0.0',
    features: [
      { text: 'default export 제거 → import { create } from "zustand" 로 전환 필수', type: 'breaking', sinceVersion: '5' },
      { text: 'UMD/SystemJS/ES5 빌드 완전 드롭 — ESM 전용 (Vite 환경은 영향 없음)', type: 'breaking', sinceVersion: '5' },
      { text: 'React 18 최소 요구 — React 16/17 지원 종료', type: 'breaking', sinceVersion: '5' },
      { text: 'v5.0.9: unstable_ssrSafe 실험 미들웨어 — Next.js SSR 안전 스토어 지원', type: 'new', sinceVersion: '5' },
      { text: 'createStore, useStore API 명확화 — subscribe 시그니처 변경', type: 'breaking', sinceVersion: '5' },
      { text: 'middleware (subscribeWithSelector, immer 등) import 경로 유지되나 createStore는 zustand/vanilla로 분리', type: 'breaking', sinceVersion: '5' },
      { text: '기본 스토어 생성 및 selector 패턴 확립 — React Context 없이 전역 상태 관리', type: 'new', sinceVersion: '3' },
      { text: '보일러플레이트 최소화: create() 한 줄로 스토어 정의', type: 'new', sinceVersion: '3' },
      { text: 'middleware API 안정화: persist · devtools · immer · subscribeWithSelector', type: 'new', sinceVersion: '4' },
      { text: 'TypeScript 지원 강화: StoreApi · StateCreator 타입 명확화', type: 'improved', sinceVersion: '4' },
      { text: 'React 18 Concurrent Mode 호환성 확보', type: 'improved', sinceVersion: '4' },
      { text: 'v5.0.9: unstable_ssrSafe 실험 미들웨어 — Next.js SSR 안전 스토어 지원', type: 'new', sinceVersion: '5' },
    ],
  },
  {
    id: 'querydsl', name: 'QueryDSL', category: 'backend',
    latestVersion: '5.1', latestLabel: '5.1.0',
    releaseDate: '2023-12-01', status: 'stable',
    icon: Database,
    color: 'text-rose-600', bgColor: 'bg-rose-50', borderColor: 'border-rose-200', iconBg: 'bg-rose-100',
    quickVersions: ['4.4', '5.0', '5.1'], unitLabel: '예: 4.4',
    summary: 'Spring Boot 4 + Jakarta EE 11 환경에서는 jakarta 분류자 명시 필수.',
    link: 'https://github.com/querydsl/querydsl/releases',
    features: [
      { text: 'Jakarta EE 분류자 필수: querydsl-jpa:5.1.0:jakarta — javax 분류자 사용 불가', type: 'breaking', sinceVersion: '5.1' },
      { text: 'JPAQueryFactory: javax.persistence.EntityManager → jakarta.persistence.EntityManager', type: 'breaking', sinceVersion: '5.1' },
      { text: '4.x에서 5.x 이동 시 패키지명 일부 변경 확인 필요', type: 'breaking', sinceVersion: '5.0' },
      { text: 'QuerydslPredicateExecutor는 Spring Data JPA 3.x API와 완전 호환', type: 'tip', sinceVersion: '5.0' },
      { text: 'javax.persistence 기반 마지막 안정 버전 — Spring Boot 2.x 환경 표준', type: 'tip', sinceVersion: '4.4' },
      { text: 'JPAQueryFactory · BooleanBuilder · QuerydslPredicateExecutor 핵심 API 안정화', type: 'new', sinceVersion: '4.4' },
      { text: '4.x → 5.x 이동 시 querydsl-jpa 의존성에 jakarta 분류자 추가 필요', type: 'tip', sinceVersion: '4.4' },
    ],
  },
]

const COMPAT: CompatItem[] = [
  { name: 'Java 25 LTS ↔ Spring Boot 4.0.5', compatible: 'ok', note: 'Spring Boot 4는 Java 17+ 요구. Java 25 LTS 완전 지원.', relatedIds: ['java', 'springboot'] },
  { name: 'QueryDSL 5.1 ↔ Spring Boot 4', compatible: 'warn', note: 'querydsl-jpa:5.1.0:jakarta 의존성 명시 필요.', relatedIds: ['querydsl', 'springboot'] },
  { name: 'MapStruct ↔ Lombok ↔ Records', compatible: 'warn', note: 'annotationProcessor 순서: Lombok → MapStruct 고정 필요.', relatedIds: ['java', 'springboot'] },
  { name: 'React 19.2 ↔ Zustand v5', compatible: 'ok', note: 'Zustand v5는 React 18+ 요구. React 19 완전 지원.', relatedIds: ['react', 'zustand'] },
  { name: 'React 19.2 ↔ React Query v5', compatible: 'ok', note: 'TanStack Query v5는 React 19 공식 지원.', relatedIds: ['react'] },
  { name: 'Vite 5 → 6 업그레이드', compatible: 'check', note: 'SPA는 하위 호환. vite.config.ts 환경 API 미사용 시 무변경.', relatedIds: ['vite'] },
  { name: 'ObjectMapper ↔ Spring Boot 4', compatible: 'warn', note: 'Spring Boot 4는 Jackson 2.17+ 사용 (Jackson 3 미출시). new ObjectMapper() 직접 생성 → Bean 주입으로 교체 권장.', relatedIds: ['springboot'] },
  { name: 'Jakarta EE 11 ↔ 기존 javax 코드', compatible: 'warn', note: 'javax.* import를 jakarta.*로 일괄 변경 필요.', relatedIds: ['java', 'springboot', 'querydsl'] },
]


// ─────────────────────────────────────────────
// Sub Components
// ─────────────────────────────────────────────
const featureStyle: Record<Feature['type'], { badge: string; label: string }> = {
  new:      { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'NEW' },
  improved: { badge: 'bg-blue-100 text-blue-700 border-blue-200',          label: 'UPDATE' },
  breaking: { badge: 'bg-red-100 text-red-700 border-red-200',             label: 'BREAKING' },
  tip:      { badge: 'bg-amber-100 text-amber-700 border-amber-200',       label: 'TIP' },
}

function FeatureRow({ f, highlight }: { f: Feature; highlight?: boolean }) {
  const { badge, label } = featureStyle[f.type]
  return (
    <li className={`flex items-start gap-2.5 py-2 border-b border-gray-100 last:border-0 rounded px-1
      ${highlight ? 'bg-red-50 border-l-2 border-l-red-400 -ml-1 pl-2' : ''}`}>
      <span className={`shrink-0 mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded border ${badge}`}>{label}</span>
      <span className="text-xs text-gray-600 leading-relaxed">{f.text}</span>
    </li>
  )
}

const statusCfg: Record<StackItem['status'], { label: string; cls: string }> = {
  stable:    { label: 'STABLE',    cls: 'bg-emerald-100 text-emerald-700' },
  lts:       { label: 'LTS',       cls: 'bg-blue-100 text-blue-700' },
  milestone: { label: 'MILESTONE', cls: 'bg-amber-100 text-amber-700' },
  latest:    { label: 'LATEST',    cls: 'bg-violet-100 text-violet-700' },
}

const gapCfg: Record<ReturnType<typeof versionGap>, { label: string; cls: string; dot: string }> = {
  'up-to-date': { label: '최신',             cls: 'text-emerald-700 bg-emerald-100 border-emerald-200', dot: 'bg-emerald-500' },
  'minor':      { label: '마이너 업데이트',   cls: 'text-amber-700 bg-amber-100 border-amber-200',       dot: 'bg-amber-500' },
  'major':      { label: '메이저 업그레이드', cls: 'text-red-700 bg-red-100 border-red-200',             dot: 'bg-red-500' },
}

// 버전 Fallback 매칭: 클릭 버전 → Major.Minor → Major 순으로 탐색
function resolveViewFeatures(features: Feature[], version: string): { features: Feature[]; matchedVersion: string | null } {
  // 1. 정확히 일치
  const exact = features.filter(f => f.sinceVersion === version)
  if (exact.length > 0) return { features: exact, matchedVersion: version }

  const parts = version.split('.')

  // 2. Major.Minor (예: 4.0.5 → 4.0)
  if (parts.length >= 3) {
    const majorMinor = parts.slice(0, 2).join('.')
    const mm = features.filter(f => f.sinceVersion === majorMinor)
    if (mm.length > 0) return { features: mm, matchedVersion: majorMinor }
  }

  // 3. Major (예: 4.0.5 → 4)
  if (parts.length >= 2) {
    const major = parts[0]
    const maj = features.filter(f => f.sinceVersion === major)
    if (maj.length > 0) return { features: maj, matchedVersion: major }
  }

  return { features: [], matchedVersion: null }
}

function StackCard({ item, currentVersion, viewVersion, onViewVersionChange }: {
  item: StackItem
  currentVersion: string
  viewVersion: string | null
  onViewVersionChange: (v: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const Icon = item.icon
  const hasInput = currentVersion.trim() !== ''
  const gap = hasInput ? versionGap(currentVersion, item.latestVersion) : null
  const affectedFeatures = hasInput ? item.features.filter(f => isAffected(currentVersion, f.sinceVersion)) : []
  const breakingAffected = affectedFeatures.filter(f => f.type === 'breaking').length

  const viewResult = viewVersion ? resolveViewFeatures(item.features, viewVersion) : null
  const viewFeatures = viewResult?.features ?? null
  const viewMatchedVersion = viewResult?.matchedVersion ?? null
  const isFallback = viewVersion !== null && viewMatchedVersion !== null && viewMatchedVersion !== viewVersion
  const isPatchOnly = viewVersion !== null && viewMatchedVersion === null

  return (
    <div className={`rounded-2xl border ${item.borderColor} bg-white shadow-sm
      transition-all duration-200 hover:shadow-md animate-fade-in`}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${item.iconBg}`}>
              <Icon size={16} className={item.color} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-gray-800">{item.name}</span>
                {breakingAffected > 0 && (
                  <span className="text-[9px] bg-red-100 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-full font-bold">
                    ⚠ Breaking {breakingAffected}건
                  </span>
                )}
              </div>
              {hasInput ? (
                <p className="text-[10px] text-gray-500 mt-0.5">
                  현재 <span className={`font-mono font-bold ${item.color}`}>{currentVersion}</span>
                  <span className="text-gray-300 mx-1">→</span>
                  최신 <span className="font-mono font-bold text-gray-700">{item.latestLabel}</span>
                </p>
              ) : (
                <p className="text-[10px] text-gray-400 mt-0.5">버전을 선택해 변경사항을 확인하세요</p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusCfg[item.status].cls}`}>
              {statusCfg[item.status].label}
            </span>
            {gap && (
              <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${gapCfg[gap].cls}`}>
                {gapCfg[gap].label}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <p className={`text-2xl font-mono font-bold ${item.color}`}>
                {viewVersion ?? item.latestLabel}
              </p>
              {!viewVersion && item.status === 'lts' && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">LTS</span>
              )}
            </div>
            {!viewVersion && (
              <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                <Clock size={9} /> {item.releaseDate}
              </p>
            )}
          </div>
          <a href={item.link} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-blue-600 transition-colors">
            릴리스 노트 <ExternalLink size={10} />
          </a>
        </div>

        <p className="text-xs text-gray-500 leading-relaxed">
          {isPatchOnly
            ? '해당 버전은 안정성 향상을 위한 패치 버전입니다.'
            : isFallback
              ? `${viewVersion} 전용 데이터 없음 — ${viewMatchedVersion} 기준으로 표시합니다.`
              : viewVersion && viewFeatures && viewFeatures.length > 0
                ? viewFeatures[0].text
                : item.summary}
        </p>

        {/* 버전 히스토리 */}
        <div className="flex items-center gap-1.5 mt-3 flex-wrap">
          <span className="text-[10px] text-gray-400 shrink-0">버전 히스토리</span>
          {item.quickVersions.map((v) => {
            const candidates = item.quickVersions.filter(
              qv => qv === item.latestLabel || item.latestLabel.startsWith(qv + '.')
            )
            const latestBadge = candidates.sort((a, b) => b.length - a.length)[0]
            const isLatest  = v === latestBadge
            const isSelected = viewVersion === v
            return (
              <button
                key={v}
                onClick={() => { onViewVersionChange(isSelected ? null : v); setOpen(true) }}
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-all ${
                  isSelected
                    ? `${item.bgColor} ${item.color} ${item.borderColor} font-bold ring-2 ring-offset-1 ring-current`
                    : isLatest
                      ? `${item.bgColor} ${item.color} ${item.borderColor} font-bold hover:opacity-80`
                      : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100 hover:text-gray-600'
                }`}
              >
                {v}{isLatest ? ' ★' : ''}
              </button>
            )
          })}
        </div>
      </div>

      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 border-t border-gray-100
          text-xs text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-all rounded-b-2xl">
        <span>
          {viewVersion
            ? isPatchOnly
              ? <span className="text-gray-400">패치 버전 — 별도 변경사항 없음</span>
              : <span className={`font-medium ${item.color}`}>
                  {isFallback && <span className="text-gray-400 font-normal">{viewVersion} → </span>}
                  {viewMatchedVersion} 변경사항 {viewFeatures?.length ?? 0}개
                </span>
            : hasInput && affectedFeatures.length > 0
              ? <span className="text-amber-600 font-medium">내 버전 관련 변경사항 {affectedFeatures.length}개</span>
              : `전체 변경사항 ${item.features.length}개`}
        </span>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {open && (
        <div className="relative rounded-b-2xl after:pointer-events-none after:absolute after:bottom-0 after:inset-x-0 after:h-8 after:rounded-b-2xl after:bg-gradient-to-t after:from-gray-50 after:to-transparent">
        <ul className="px-5 pb-4 pt-1 bg-gray-50 rounded-b-2xl max-h-64 overflow-y-auto scrollbar-card">
          {(viewVersion
            ? (viewFeatures ?? [])
            : hasInput && affectedFeatures.length > 0
              ? affectedFeatures
              : item.features
          ).map((f, i) => (
            <FeatureRow key={i} f={f}
              highlight={!viewVersion && hasInput && f.type === 'breaking' && isAffected(currentVersion, f.sinceVersion)} />
          ))}
          {isPatchOnly && (
            <li className="text-[11px] text-gray-400 py-3 text-center">
              해당 버전은 안정성 향상을 위한 패치 버전입니다.
            </li>
          )}
        </ul>
        </div>
      )}
    </div>
  )
}

function CompatRow({ item }: { item: CompatItem }) {
  const cfg: Record<CompatItem['compatible'], { Icon: React.ElementType; cls: string; bg: string; label: string }> = {
    ok:    { Icon: CheckCircle,   cls: 'text-emerald-600', bg: 'bg-emerald-100 text-emerald-700', label: 'OK' },
    warn:  { Icon: AlertTriangle, cls: 'text-amber-600',   bg: 'bg-amber-100 text-amber-700',     label: '주의' },
    check: { Icon: Info,          cls: 'text-blue-600',    bg: 'bg-blue-100 text-blue-700',        label: '확인' },
  }
  const { Icon: CIcon, cls, bg, label } = cfg[item.compatible]
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors">
      <CIcon size={14} className={`${cls} mt-0.5 shrink-0`} />
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-800 font-medium">{item.name}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${bg}`}>{label}</span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.note}</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Config Drop Zone
// ─────────────────────────────────────────────
const FILE_TYPE_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  'package.json':     { label: 'package.json',     color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200' },
  'build.gradle':     { label: 'build.gradle',     color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  'build.gradle.kts': { label: 'build.gradle.kts', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  'pom.xml':          { label: 'pom.xml',           color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
  'unknown':          { label: '알 수 없음',          color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200' },
}

function ConfigDropZone({ onParsed }: { onParsed: (result: ParseResult) => void }) {
  const [dragging, setDragging] = useState(false)
  const [text, setText] = useState('')
  const [result, setResult] = useState<ParseResult | null>(null)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteFileType, setPasteFileType] = useState('auto')

  function process(filename: string, content: string) {
    const r = parseConfigFile(filename, content)
    setResult(r)
    onParsed(r)
  }

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => process(file.name, e.target?.result as string)
    reader.onerror = () => alert(`파일 읽기 실패: ${file.name}`)
    reader.readAsText(file)
  }

  function handlePaste() {
    if (!text.trim()) return
    const filename = pasteFileType === 'auto' ? 'unknown' : pasteFileType
    process(filename, text)
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault(); setDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) handleFile(file)
        }}
        className={`relative border-2 border-dashed rounded-xl p-5 text-center transition-all
          ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/30'}`}
      >
        <div className="flex items-center justify-center gap-6 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-600 mb-1">파일을 여기에 끌어다 놓거나</p>
            <p className="text-xs text-gray-400">package.json · build.gradle · build.gradle.kts · pom.xml</p>
          </div>
          <label className="cursor-pointer flex items-center gap-1.5 text-xs font-semibold text-blue-600
            bg-white border border-blue-200 px-3 py-2 rounded-lg shadow-sm hover:bg-blue-50 transition-colors">
            <Upload size={12} /> 파일 선택
            <input type="file" className="hidden"
              accept=".json,.gradle,.kts,.xml"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
          </label>
          <button
            onClick={() => setShowPaste(v => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-600
              bg-white border border-gray-200 px-3 py-2 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
          >
            <Info size={12} /> 직접 붙여넣기
          </button>
        </div>
      </div>

      {showPaste && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500 shrink-0">파일 타입</span>
            <select
              value={pasteFileType}
              onChange={e => setPasteFileType(e.target.value)}
              className="bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700
                focus:outline-none focus:border-blue-400 transition-all"
            >
              <option value="auto">자동 감지</option>
              <option value="package.json">package.json</option>
              <option value="build.gradle">build.gradle</option>
              <option value="build.gradle.kts">build.gradle.kts</option>
              <option value="pom.xml">pom.xml</option>
              <option value="gradle.properties">gradle.properties</option>
            </select>
          </div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'package.json, build.gradle, pom.xml 내용을 붙여넣으세요...\n\n예시:\n{\n  "dependencies": {\n    "react": "^19.2.0",\n    "vite": "^8.0.0"\n  }\n}'}
            rows={8}
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-xs font-mono
              text-gray-700 placeholder-gray-300 focus:outline-none focus:border-blue-400
              focus:ring-2 focus:ring-blue-100 transition-all resize-y"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => { setText(''); setResult(null); setShowPaste(false); setPasteFileType('auto') }}
              className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              취소
            </button>
            <button onClick={handlePaste}
              className="text-xs font-semibold text-white bg-blue-600 px-4 py-1.5 rounded-lg
                hover:bg-blue-700 transition-colors shadow-sm">
              버전 추출
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className={`rounded-xl border p-4 ${FILE_TYPE_LABEL[result.fileType].bg}`}>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${FILE_TYPE_LABEL[result.fileType].bg} ${FILE_TYPE_LABEL[result.fileType].color}`}>
                {FILE_TYPE_LABEL[result.fileType].label}
              </span>
              <span className="text-xs font-semibold text-gray-700">
                {Object.keys(result.versions).length}개 버전 추출됨
              </span>
            </div>
            <button onClick={() => setResult(null)}
              className="text-gray-400 hover:text-gray-600 transition-colors">
              <X size={13} />
            </button>
          </div>

          {result.evidence.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {result.evidence.map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <CheckCircle size={11} className="text-emerald-500 shrink-0" />
                  <span className="font-semibold text-gray-600 w-32 shrink-0">{e.key}</span>
                  <span className="font-mono text-gray-400 truncate">{e.raw}</span>
                  <ArrowUpRight size={10} className="text-gray-300 shrink-0" />
                  <span className="font-mono font-bold text-gray-700">{e.extracted}</span>
                </div>
              ))}
            </div>
          )}

          {result.warnings.map((w, i) => (
            <p key={i} className="flex items-start gap-1.5 text-[11px] text-amber-700 mt-1">
              <AlertTriangle size={11} className="shrink-0 mt-0.5" /> {w}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Stack Input Panel (dual column: 현재 / 목표)
// ─────────────────────────────────────────────
function StackInputPanel({
  stack, currentVersions, targetVersions,
  onTargetChange,
}: {
  stack: StackItem[]
  currentVersions: Record<string, string>
  targetVersions: Record<string, string>
  onCurrentChange: (id: string, v: string) => void
  onTargetChange:  (id: string, v: string) => void
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {stack.map(item => {
        const Icon = item.icon
        const cur = currentVersions[item.id] ?? ''
        const tgt = targetVersions[item.id] ?? ''
        return (
          <div key={item.id} className={`rounded-xl border ${item.borderColor} bg-white p-3 flex flex-col gap-2 shadow-sm`}>
            {/* Header */}
            <div className="flex items-center gap-1.5">
              <div className={`p-1 rounded-lg ${item.iconBg}`}>
                <Icon size={11} className={item.color} />
              </div>
              <span className="text-xs font-semibold text-gray-700">{item.name}</span>
              <span className="text-[9px] text-gray-400 ml-auto">{item.category === 'backend' ? 'BE' : item.category === 'frontend' ? 'FE' : 'Tool'}</span>
            </div>

            {/* Two inputs */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[9px] font-semibold text-gray-400 mb-1">현재 <span className="text-gray-300">(설정 파일 자동 감지)</span></p>
                <input
                  type="text"
                  value={cur}
                  readOnly
                  placeholder="자동 감지"
                  className="w-full bg-gray-100 border border-gray-200 rounded-lg px-2 py-1.5
                    text-xs text-gray-500 placeholder-gray-300 font-mono cursor-not-allowed"
                />
              </div>
              <div>
                <p className="text-[9px] font-semibold text-gray-400 mb-1">목표</p>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={tgt}
                    onChange={e => onTargetChange(item.id, e.target.value)}
                    placeholder="입력..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5
                      text-xs text-gray-700 placeholder-gray-300 focus:outline-none focus:border-violet-400
                      focus:ring-2 focus:ring-violet-100 transition-all font-mono"
                  />
                  <button
                    onClick={e => { e.stopPropagation(); onTargetChange(item.id, item.latestVersion) }}
                    title={`최신: ${item.latestLabel}`}
                    className={`shrink-0 text-[9px] font-bold px-1.5 rounded-lg border ${item.borderColor} ${item.color} ${item.bgColor} hover:opacity-80 transition-opacity`}
                  >
                    최신
                  </button>
                </div>
              </div>
            </div>

            {/* Quick versions: 항상 목표 버전으로 설정 */}
            <div className="flex flex-wrap gap-1">
              {item.quickVersions.map(v => {
                const isCur = cur === v
                const isTgt = tgt === v
                return (
                  <button
                    key={v}
                    onClick={() => onTargetChange(item.id, v)}
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-all relative
                      ${isCur
                        ? `${item.borderColor} ${item.color} ${item.bgColor} font-bold`
                        : isTgt
                        ? 'border-violet-400 text-violet-600 bg-violet-50 font-bold'
                        : 'border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 bg-white'}`}
                  >
                    {v}
                    {isCur && <span className="absolute -top-1.5 -right-1 text-[7px] leading-none bg-blue-500 text-white rounded-full px-0.5">현</span>}
                    {isTgt && <span className="absolute -top-1.5 -right-1 text-[7px] leading-none bg-violet-500 text-white rounded-full px-0.5">목</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────
// Personalized Recommendations (current → latest)
// ─────────────────────────────────────────────
function RecommendSection({ versions, stack }: { versions: Record<string, string>; stack: StackItem[] }) {
  const hasAnyInput = Object.values(versions).some(v => v.trim() !== '')
  if (!hasAnyInput) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
        <Sparkles size={28} className="text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-500">위에서 현재 사용 중인 버전을 입력하면</p>
        <p className="text-sm text-gray-400 mt-1">맞춤 Breaking Change & 업그레이드 권장사항이 표시됩니다.</p>
      </div>
    )
  }

  type RecommendItem = {
    stackName: string; color: string; bgColor: string; borderColor: string; iconBg: string; icon: React.ElementType
    userVer: string; latestVer: string; gap: ReturnType<typeof versionGap>
    breaking: Feature[]; newFeatures: Feature[]
  }

  const items: RecommendItem[] = stack
    .filter(s => versions[s.id]?.trim())
    .map(s => {
      const uv = versions[s.id]
      const gap = versionGap(uv, s.latestVersion)
      const affected = s.features.filter(f => isAffected(uv, f.sinceVersion))
      return {
        stackName: s.name, color: s.color, bgColor: s.bgColor, borderColor: s.borderColor, iconBg: s.iconBg, icon: s.icon,
        userVer: uv, latestVer: s.latestLabel, gap,
        breaking: affected.filter(f => f.type === 'breaking'),
        newFeatures: affected.filter(f => f.type === 'new'),
      }
    })
    .filter(i => i.gap !== 'up-to-date')

  const breaking = items.flatMap(i => i.breaking.map(f => ({ ...f, stackName: i.stackName, color: i.color })))
  const newFeats  = items.flatMap(i => i.newFeatures.map(f => ({ ...f, stackName: i.stackName, color: i.color })))

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center shadow-sm">
        <CheckCircle size={24} className="text-emerald-500 mx-auto mb-2" />
        <p className="text-sm font-semibold text-emerald-700">모든 스택이 최신 버전입니다!</p>
        <p className="text-xs text-emerald-600 mt-1">추가 마이그레이션 작업이 필요하지 않습니다.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {items.map(item => {
          const Icon = item.icon
          const g = gapCfg[item.gap]
          return (
            <div key={item.stackName}
              className={`rounded-xl border ${item.borderColor} bg-white p-3 shadow-sm`}>
              <div className="flex items-center gap-1.5 mb-2">
                <div className={`p-1 rounded-lg ${item.iconBg}`}>
                  <Icon size={11} className={item.color} />
                </div>
                <span className="text-xs font-semibold text-gray-700">{item.stackName}</span>
                <span className={`ml-auto w-2 h-2 rounded-full ${g.dot}`} />
              </div>
              <p className="text-[10px] font-mono text-gray-500">
                <span className={`font-bold ${item.color}`}>{item.userVer}</span>
                <span className="text-gray-300 mx-1">→</span>
                <span className="font-bold text-gray-700">{item.latestVer}</span>
              </p>
              <p className={`text-[9px] mt-1 font-semibold ${g.cls.split(' ')[0]}`}>{g.label}</p>
            </div>
          )
        })}
      </div>

      {breaking.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-red-700 mb-3 flex items-center gap-2">
            <AlertTriangle size={15} /> 현재 버전 기준 Breaking Changes ({breaking.length}건)
          </h3>
          <ul className="space-y-2">
            {breaking.map((f, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="shrink-0 mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded border bg-red-100 text-red-600 border-red-200">
                  {f.stackName}
                </span>
                <span className="text-xs text-gray-700 leading-relaxed">{f.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {newFeats.length > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-emerald-700 mb-3 flex items-center gap-2">
            <Sparkles size={15} /> 업그레이드 시 활용 가능한 신기능 ({newFeats.length}건)
          </h3>
          <ul className="space-y-2">
            {newFeats.map((f, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="shrink-0 mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded border bg-emerald-100 text-emerald-700 border-emerald-200">
                  {f.stackName}
                </span>
                <span className="text-xs text-gray-700 leading-relaxed">{f.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Script Panel
// ─────────────────────────────────────────────
function ScriptPanel({ migrations }: { migrations: ScriptInput[] }) {
  const [platform, setPlatform]     = useState<'bash' | 'powershell'>('bash')
  const [copied, setCopied]         = useState(false)
  const [scanText, setScanText]     = useState('')
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [scriptOpen, setScriptOpen] = useState(false)
  const [isScanning, setIsScanning]       = useState(false)
  const [progress, setProgress]           = useState<ScanProgress | null>(null)
  const [folderDetail, setFolderDetail]   = useState<FolderScanResult | null>(null)
  const [expandedKey, setExpandedKey]     = useState<string | null>(null)
  const folderSupported                   = isFolderPickerSupported()

  const script = generateScript(migrations, platform)

  // grep keys needed for these migrations
  const neededKeys = new Set<string>()
  for (const m of migrations) {
    const from = parseFloat(m.current.replace(/[^0-9.]/g, '')) || 0
    const to   = parseFloat(m.target.replace(/[^0-9.]/g, '')) || 0
    requiredKeys(m.stackId, from, to).forEach(k => neededKeys.add(k))
  }
  const grepDefs = GREP_DEFS.filter(d => neededKeys.has(d.key))

  function copyScript() {
    navigator.clipboard.writeText(script).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function downloadScript() {
    const ext  = platform === 'bash' ? 'sh' : 'ps1'
    const blob = new Blob([script], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `migrate-scan.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  function parseScan() {
    if (!scanText.trim()) return
    const r = parseScanResult(scanText)
    setScanResult(r)
  }

  async function handleFolderScan() {
    const dir = await pickFolder()
    if (!dir) return

    setIsScanning(true)
    setProgress({ scanned: 0 })
    setScanResult(null)
    setFolderDetail(null)
    setExpandedKey(null)

    try {
      const result = await scanFolder(dir, [...neededKeys], p => setProgress(p))
      setFolderDetail(result)
      // 카운트 결과도 기존 ScanResult 형식으로 변환 (복잡도 계산용)
      const sr: ScanResult = {
        meta: { total_java_files: result.javaFiles },
        results: Object.fromEntries(
          Object.entries(result.counts).map(([k, v]) => [k, { files: v }])
        ),
      }
      setScanResult(sr)
    } finally {
      setIsScanning(false)
      setProgress(null)
    }
  }

  if (script === '' && grepDefs.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic px-1">
        이 마이그레이션 범위에 해당하는 스캔 항목이 없습니다.
      </p>
    )
  }

  return (
    <div className="space-y-4">

      {/* ── 스크립트 생성 (접기/펼치기) ── */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <button
          onClick={() => setScriptOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <Terminal size={13} className="text-gray-500" />
            <span className="text-xs font-semibold text-gray-700">스캔 스크립트 생성</span>
            <span className="text-[10px] text-gray-400">bash / PowerShell</span>
          </div>
          {scriptOpen ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
        </button>

        {scriptOpen && (
          <div className="px-4 pb-4 border-t border-gray-100 space-y-3 pt-3">
            {/* Platform toggle + actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
                <button
                  onClick={() => setPlatform('bash')}
                  className={`px-3 py-1.5 transition-colors ${platform === 'bash' ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  bash
                </button>
                <button
                  onClick={() => setPlatform('powershell')}
                  className={`px-3 py-1.5 transition-colors ${platform === 'powershell' ? 'bg-blue-700 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  PowerShell
                </button>
              </div>
              <button onClick={copyScript}
                className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
                <Copy size={11} /> {copied ? '복사됨!' : '복사'}
              </button>
              <button onClick={downloadScript}
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors shadow-sm">
                <Download size={11} /> 다운로드
              </button>
            </div>

            <pre className="bg-gray-900 text-gray-100 text-[11px] font-mono rounded-xl p-4 overflow-x-auto leading-relaxed max-h-56 overflow-y-auto">
              {script}
            </pre>

            <div className="text-[11px] text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
              {platform === 'bash'
                ? '실행: bash migrate-scan.sh [프로젝트_루트]'
                : '실행: .\\migrate-scan.ps1 [프로젝트_루트]'}
              &nbsp;→ 출력된 JSON을 아래 스캔 결과에 붙여넣기
            </div>
          </div>
        )}
      </div>

      {/* ── 스캔 결과 ── */}
      <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-4 space-y-3">
        <p className="text-xs font-semibold text-violet-700 flex items-center gap-1.5">
          <BarChart2 size={12} /> 프로젝트 스캔
        </p>

        {/* 폴더 선택 버튼 (Chrome/Edge) */}
        {folderSupported && (
          <div className="space-y-2">
            <button
              onClick={handleFolderScan}
              disabled={isScanning}
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold
                text-white bg-violet-600 px-4 py-2.5 rounded-xl hover:bg-violet-700
                transition-colors shadow-sm disabled:opacity-50"
            >
              {isScanning ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  스캔 중... {progress?.scanned ?? 0}개 파일 처리
                </>
              ) : (
                <>
                  <Download size={14} />
                  폴더 선택해서 바로 스캔
                </>
              )}
            </button>
            {isScanning && (
              <div className="space-y-0.5">
                <p className="text-[10px] text-violet-500">{progress?.scanned ?? 0}개 파일 처리 중...</p>
                <div className="w-full bg-violet-100 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full animate-[slide_1.5s_ease-in-out_infinite]"
                    style={{ width: '40%' }} />
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-violet-100" />
              <span className="text-[10px] text-violet-400">또는 스크립트 실행 후 붙여넣기</span>
              <div className="flex-1 h-px bg-violet-100" />
            </div>
          </div>
        )}

        {/* 직접 붙여넣기 */}
        <textarea
          value={scanText}
          onChange={e => setScanText(e.target.value)}
          rows={folderSupported ? 3 : 4}
          placeholder={'{\n  "javax_imports": { "files": 23 },\n  "websecurity_adapter": { "files": 2 }\n}'}
          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-xs font-mono
            text-gray-700 placeholder-gray-300 focus:outline-none focus:border-violet-400
            focus:ring-2 focus:ring-violet-100 transition-all resize-y"
        />
        <div className="flex justify-end gap-2">
          {(scanText || scanResult) && (
            <button onClick={() => { setScanText(''); setScanResult(null) }}
              className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              초기화
            </button>
          )}
          <button onClick={parseScan}
            disabled={!scanText.trim()}
            className="text-xs font-semibold text-white bg-violet-600 px-4 py-1.5 rounded-lg hover:bg-violet-700 transition-colors shadow-sm disabled:opacity-40">
            결과 분석
          </button>
        </div>

        {/* Scan result display */}
        {scanResult && (
          <div className="space-y-2 pt-1">
            {scanResult.meta && (
              <div className="text-[11px] text-gray-500 flex flex-wrap gap-3">
                {scanResult.meta.scanned_at && <span>스캔: {scanResult.meta.scanned_at.slice(0, 10)}</span>}
                {scanResult.meta.project_root && <span>루트: <code className="font-mono">{scanResult.meta.project_root}</code></span>}
                {scanResult.meta.total_java_files != null && <span>Java 파일: {scanResult.meta.total_java_files}개</span>}
              </div>
            )}

            <div className="space-y-1.5">
              {grepDefs.map(def => {
                const count    = getFileCount(scanResult, def.key)
                const cx       = fileComplexity(count)
                const details  = folderDetail?.matches[def.key] ?? []
                const isOpen   = expandedKey === def.key

                return (
                  <div key={def.key} className="rounded-lg border border-gray-100 overflow-hidden bg-white">
                    {/* 항목 헤더 */}
                    <button
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
                      onClick={() => count > 0 && setExpandedKey(isOpen ? null : def.key)}
                    >
                      <span className="text-xs text-gray-700 flex-1">{def.label}</span>
                      <span className="font-mono text-sm font-bold text-gray-800 w-8 text-right">{count}</span>
                      <span className="text-[10px] text-gray-400">파일</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cx.cls} w-16 text-center`}>
                        {cx.level}
                      </span>
                      {count > 0 && details.length > 0 && (
                        isOpen
                          ? <ChevronUp size={11} className="text-gray-400 shrink-0" />
                          : <ChevronDown size={11} className="text-gray-400 shrink-0" />
                      )}
                    </button>

                    {/* 파일 상세 + 수정 가이드 (폴더 스캔 시만 표시) */}
                    {isOpen && details.length > 0 && (
                      <div className="border-t border-gray-100 bg-gray-50">
                        {/* 파일별 매칭 줄 */}
                        <div className="divide-y divide-gray-100">
                          {details.map((detail, fi) => (
                            <div key={fi} className="px-3 py-2.5">
                              <p className="text-[10px] font-mono font-semibold text-violet-700 mb-2 flex items-center gap-1">
                                <FileText size={9} className="shrink-0" />
                                {detail.filePath}
                              </p>
                              <div className="space-y-1.5">
                                {detail.lines.map((ln, li) => (
                                  <div key={li} className="space-y-0.5">
                                    {/* 현재 코드 */}
                                    <div className="flex items-start gap-2">
                                      <span className="text-[9px] font-mono text-gray-400 w-8 text-right shrink-0 pt-0.5 select-none">
                                        {ln.lineNumber}
                                      </span>
                                      <code className="text-[10px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-100 flex-1 break-all">
                                        {ln.content}
                                      </code>
                                    </div>
                                    {/* 자동 수정안 */}
                                    {ln.fixSuggestion && (
                                      <div className="flex items-start gap-2">
                                        <span className="text-[9px] font-mono text-emerald-500 w-8 text-right shrink-0 pt-0.5 select-none">→</span>
                                        <code className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 flex-1 break-all">
                                          {ln.fixSuggestion}
                                        </code>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* 수정 가이드 */}
                        {FIX_GUIDES[def.key] && (
                          <div className="mx-3 mb-3 rounded-lg border border-blue-200 bg-white overflow-hidden">
                            <div className="px-3 py-2 bg-blue-50 border-b border-blue-100">
                              <p className="text-[10px] font-bold text-blue-700 flex items-center gap-1">
                                <Info size={9} /> 수정 방법 — {FIX_GUIDES[def.key].title}
                              </p>
                            </div>
                            <div className="p-3 space-y-2">
                              <div>
                                <p className="text-[9px] font-bold text-red-500 mb-1">Before</p>
                                <pre className="text-[10px] font-mono text-gray-700 bg-red-50 rounded px-2.5 py-2 overflow-x-auto leading-relaxed border border-red-100">
                                  {FIX_GUIDES[def.key].before}
                                </pre>
                              </div>
                              <div>
                                <p className="text-[9px] font-bold text-emerald-600 mb-1">After</p>
                                <pre className="text-[10px] font-mono text-gray-700 bg-emerald-50 rounded px-2.5 py-2 overflow-x-auto leading-relaxed border border-emerald-100">
                                  {FIX_GUIDES[def.key].after}
                                </pre>
                              </div>
                              {FIX_GUIDES[def.key].note && (
                                <p className="text-[10px] text-amber-700 bg-amber-50 rounded px-2.5 py-1.5 border border-amber-100 flex items-start gap-1">
                                  <AlertTriangle size={9} className="shrink-0 mt-0.5" />
                                  {FIX_GUIDES[def.key].note}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Overall complexity */}
            {(() => {
              const totalFiles = grepDefs.reduce((s, d) => s + getFileCount(scanResult, d.key), 0)
              const affected   = grepDefs.filter(d => getFileCount(scanResult, d.key) > 0).length
              const cx         = overallComplexity(affected)
              return (
                <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${cx.cls}`}>
                  <div>
                    <p className="text-xs font-bold">전체 마이그레이션 복잡도</p>
                    <p className="text-[11px] mt-0.5 opacity-80">영향 파일 합계 {totalFiles}개 · 변경 필요 항목 {affected}종</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${cx.dot}`} />
                    <span className="text-lg font-bold">{cx.level}</span>
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Migration Section (current → target range)
// ─────────────────────────────────────────────
function MigrationSection({
  currentVersions, targetVersions, stack,
}: {
  currentVersions: Record<string, string>
  targetVersions:  Record<string, string>
  stack: StackItem[]
}) {

  // Pairs that have BOTH current + target
  const activeMigrations = stack
    .filter(s => currentVersions[s.id]?.trim() && targetVersions[s.id]?.trim())
    .map(s => ({
      stack: s,
      current: currentVersions[s.id],
      target:  targetVersions[s.id],
      inRangeFeatures: s.features.filter(f => isInRange(currentVersions[s.id], targetVersions[s.id], f.sinceVersion)),
    }))

  if (activeMigrations.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center shadow-sm">
        <GitBranch size={24} className="text-gray-300 mx-auto mb-2" />
        <p className="text-sm font-medium text-gray-500">분석할 스택의 현재·목표 버전을 입력하세요</p>
        <p className="text-sm text-gray-400 mt-1">백엔드만, 프론트엔드만, 일부 스택만 입력해도 됩니다.</p>
      </div>
    )
  }

  const allBreaking = activeMigrations.flatMap(m =>
    m.inRangeFeatures.filter(f => f.type === 'breaking').map(f => ({ ...f, stackName: m.stack.name, color: m.stack.color }))
  )
  const allNew = activeMigrations.flatMap(m =>
    m.inRangeFeatures.filter(f => f.type === 'new').map(f => ({ ...f, stackName: m.stack.name, color: m.stack.color }))
  )

  const scriptInputs: ScriptInput[] = activeMigrations.map(m => ({
    stackId: m.stack.id,
    current: m.current,
    target:  m.target,
  }))

  return (
    <div className="space-y-4">
      {/* Migration path summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {activeMigrations.map(({ stack: s, current, target, inRangeFeatures }) => {
          const Icon = s.icon
          const breakingCount = inRangeFeatures.filter(f => f.type === 'breaking').length
          const cx = overallComplexity(breakingCount)
          return (
            <div key={s.id} className={`rounded-xl border ${s.borderColor} bg-white p-3 shadow-sm`}>
              <div className="flex items-center gap-1.5 mb-2">
                <div className={`p-1 rounded-lg ${s.iconBg}`}>
                  <Icon size={11} className={s.color} />
                </div>
                <span className="text-xs font-semibold text-gray-700">{s.name}</span>
                <span className={`ml-auto w-2 h-2 rounded-full ${cx.dot}`} />
              </div>
              <p className="text-[10px] font-mono text-gray-500">
                <span className={`font-bold ${s.color}`}>{current}</span>
                <span className="text-gray-300 mx-1">→</span>
                <span className="font-bold text-gray-700">{target}</span>
              </p>
              <div className="flex items-center justify-between mt-1">
                <p className={`text-[9px] font-bold ${cx.cls.split(' ')[0]}`}>{cx.level}</p>
                {breakingCount > 0 && (
                  <span className="text-[9px] text-red-600 font-semibold">Breaking {breakingCount}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Range-filtered breaking changes */}
      {allBreaking.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-red-700 mb-3 flex items-center gap-2">
            <AlertTriangle size={15} /> 마이그레이션 범위 Breaking Changes ({allBreaking.length}건)
          </h3>
          <ul className="space-y-2">
            {allBreaking.map((f, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="shrink-0 mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded border bg-red-100 text-red-600 border-red-200">
                  {f.stackName}
                </span>
                <span className="text-xs text-gray-700 leading-relaxed">{f.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* New features in range */}
      {allNew.length > 0 && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-blue-700 mb-3 flex items-center gap-2">
            <Star size={15} /> 이 범위에서 획득하는 신기능 ({allNew.length}건)
          </h3>
          <ul className="space-y-2">
            {allNew.map((f, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="shrink-0 mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded border bg-blue-100 text-blue-700 border-blue-200">
                  {f.stackName}
                </span>
                <span className="text-xs text-gray-700 leading-relaxed">{f.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {allBreaking.length === 0 && allNew.length === 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center shadow-sm">
          <CheckCircle size={20} className="text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-emerald-700">이 범위에는 주목할 변경사항이 없습니다.</p>
        </div>
      )}

      {/* Script generation + 스캔 결과 입력 */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
        <p className="text-xs font-bold text-gray-700 flex items-center gap-2 mb-4">
          <Terminal size={13} className="text-gray-500" /> 대규모 프로젝트 스캔
          <span className="text-[10px] font-normal text-gray-400">— 스크립트 생성 → 로컬 실행 → 결과 붙여넣기</span>
        </p>
        <ScriptPanel migrations={scriptInputs} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Repo Connector
// ─────────────────────────────────────────────

function RepoConnector({
  onFetched,
  onTokenChange,
}: {
  onFetched: (info: RepoInfo, files: FetchedFile[]) => void
  onTokenChange?: (token: string) => void
}) {
  const [url, setUrl]             = useState('')
  const [token, setToken]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [progress, setProgress]   = useState<{ tried: number; total: number } | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [urlError, setUrlError]   = useState<string | null>(null)
  const [foundFiles, setFoundFiles] = useState<FetchedFile[]>([])
  const [repoInfo, setRepoInfo]   = useState<RepoInfo | null>(null)

  async function fetch_() {
    const info = parseRepoUrl(url)
    if (!info) { setError('GitHub 또는 GitLab URL을 입력하세요\n예: https://github.com/owner/repo'); return }

    setLoading(true); setError(null); setFoundFiles([]); setRepoInfo(null)
    setProgress({ tried: 0, total: 15 })

    try {
      const files = await fetchRepoFiles(info, token || undefined, (tried, total) =>
        setProgress({ tried, total })
      )
      if (files.length === 0) {
        setError('설정 파일을 찾지 못했습니다.\n• Public 레포인지 확인하세요\n• Private 레포라면 Token을 입력하세요')
        return
      }
      setFoundFiles(files)
      setRepoInfo(info)
      onFetched(info, files)
    } catch (e) {
      setError(e instanceof Error ? e.message : '가져오기 실패')
    } finally {
      setLoading(false); setProgress(null)
    }
  }

  const platformColor = url.includes('gitlab') ? 'text-orange-600' : 'text-gray-800'

  // 렌더링마다 반복 파싱 방지 — parseConfigFile은 DOMParser 등 무거운 작업 포함
  const parsedFoundFiles = useMemo(() =>
    foundFiles.map(f => ({ ...f, parsed: parseConfigFile(f.filename, f.content) })),
    [foundFiles]
  )

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      {/* URL 입력 */}
      <div className="flex gap-2">
        <input
          value={url}
          onChange={e => {
            const val = e.target.value
            setUrl(val)
            setError(null)
            // 도메인까지 입력된 상태에서만 실시간 검사 — 타이핑 중 불필요한 에러 방지
            if (val.includes('github.com/') || val.includes('gitlab.') ) {
              setUrlError(parseRepoUrl(val) ? null : 'owner/repo 형식을 확인하세요 (예: https://github.com/owner/repo)')
            } else {
              setUrlError(null)
            }
          }}
          onKeyDown={e => e.key === 'Enter' && fetch_()}
          placeholder="https://github.com/owner/repo  또는  https://gitlab.com/owner/repo"
          className={`flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono
            placeholder-gray-300 focus:outline-none focus:border-blue-400 focus:ring-2
            focus:ring-blue-100 transition-all ${platformColor}`}
        />
        <button
          onClick={fetch_}
          disabled={loading || !url.trim()}
          className="flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 px-4 py-2
            rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-40 shrink-0"
        >
          {loading
            ? <><RefreshCw size={11} className="animate-spin" /> 가져오는 중</>
            : <><Download size={11} /> 가져오기</>}
        </button>
      </div>
      {urlError && (
        <p className="text-[11px] text-red-500 flex items-center gap-1 -mt-1">
          <AlertTriangle size={10} className="shrink-0" /> {urlError}
        </p>
      )}

      {/* Token 입력 */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500 shrink-0">
          <Shield size={11} className="text-gray-400" /> Personal Access Token
        </div>
        <input
          type="password"
          value={token}
          onChange={e => { setToken(e.target.value); onTokenChange?.(e.target.value) }}
          placeholder="ghp_xxxx  (GitHub repo 스코프)  또는  glpat-xxxx  (GitLab api 스코프)"
          autoComplete="new-password"
          className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono
            text-gray-700 placeholder-gray-300 focus:outline-none focus:border-blue-400
            focus:ring-2 focus:ring-blue-100 transition-all"
        />
        <span className="hidden sm:block text-[9px] text-gray-400 shrink-0">브라우저 메모리에만 저장</span>
      </div>

      {/* 진행 상태 */}
      {loading && progress && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-gray-400">
            <span>설정 파일 탐색 중...</span>
            <span>{progress.tried} / {progress.total}</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1 overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${(progress.tried / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
          <AlertTriangle size={12} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-700 whitespace-pre-line">{error}</p>
        </div>
      )}

      {/* 찾은 파일 목록 */}
      {foundFiles.length > 0 && repoInfo && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 space-y-2">
          <p className="text-[10px] font-bold text-emerald-700 flex items-center gap-1.5">
            <CheckCircle size={11} /> {repoInfo.owner}/{repoInfo.repo} — {foundFiles.length}개 파일 발견
          </p>
          {parsedFoundFiles.map((f, i) => {
            const { versions } = f.parsed
            const parsed = [
              versions.java       && `Java ${versions.java}`,
              versions.springboot && `Spring Boot ${versions.springboot}`,
              versions.react      && `React ${versions.react}`,
              versions.vite       && `Vite ${versions.vite}`,
              versions.zustand    && `Zustand ${versions.zustand}`,
              versions.querydsl   && `QueryDSL ${versions.querydsl}`,
            ].filter(Boolean)
            return (
              <div key={i} className="space-y-0.5">
                <div className="flex items-center gap-2 text-[10px] text-emerald-700">
                  <FileText size={9} className="shrink-0" />
                  <code className="font-mono">{f.path}</code>
                </div>
                {parsed.length > 0
                  ? <p className="text-[9px] text-emerald-600 pl-3.5">추출됨: {parsed.join(' · ')}</p>
                  : <p className="text-[9px] text-amber-500 pl-3.5">버전 정보를 찾지 못했습니다</p>
                }
                {f.parsed.warnings.length > 0 && (
                  <p className="text-[9px] text-red-500 pl-3.5">⚠ {f.parsed.warnings.join(' / ')}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Branch Creator
// ─────────────────────────────────────────────

function BranchCreator({
  repoInfo,
  repoToken,
  fetchedFiles,
  currentVersions,
  targetVersions,
  anthropicKey,
  aiModel,
  onClearKey,
}: {
  repoInfo: RepoInfo
  repoToken: string
  fetchedFiles: FetchedFile[]
  currentVersions: Record<string, string>
  targetVersions: Record<string, string>
  anthropicKey: string
  aiModel: 'haiku' | 'sonnet'
  onClearKey?: () => void
}) {
  const hasTargets = Object.values(targetVersions).some(v => v.trim())

  const { targets: derivedTargets, derived: derivedMessages } = useMemo(
    () => deriveCompatibleTargets(currentVersions as any, targetVersions as any),
    [currentVersions, targetVersions],
  )

  const rewritePlan = useMemo(() => {
    if (!hasTargets) return []
    return fetchedFiles
      .map(file => {
        const newContent = rewriteConfig(file.filename, file.content, derivedTargets as any)
        if (!newContent || newContent === file.content) return null
        const changes = getChangeSummary(file.filename, file.content, derivedTargets as any)
        return { file, newContent, changes }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }, [fetchedFiles, derivedTargets, hasTargets])

  const allChanges = rewritePlan.flatMap(p => p.changes)

  const checklist = useMemo<ChecklistItem[]>(
    () => getMigrationChecklist(currentVersions, targetVersions),
    [currentVersions, targetVersions],
  )

  const [branchName,   setBranchName]   = useState(() => generateBranchName(targetVersions))
  const [pushStatus,   setPushStatus]   = useState<string | null>(null)
  const [pushError,    setPushError]    = useState<string | null>(null)
  const [pushResult,   setPushResult]   = useState<string | null>(null)
  const [scanError,    setScanError]    = useState<string | null>(null)
  type ManualReason = 'no_key' | 'haiku_too_large' | 'sonnet_too_large' | 'ai_error'
  const [autoFixed,    setAutoFixed]    = useState<{ path: string; type: 'config' | 'source' | 'ai' }[]>([])
  const [needsManual,  setNeedsManual]  = useState<{ path: string; patterns: { description: string; line: number; snippet: string }[]; reason: ManualReason; aiError?: string }[]>([])

  // 목표 버전이 바뀌면 브랜치명 자동 갱신
  useEffect(() => { setBranchName(generateBranchName(targetVersions)) }, [targetVersions])

  async function push() {
    if (!repoToken) { setPushError('Token이 필요합니다. 위 "가져오기" 패널에서 입력하세요.'); return }

    setPushStatus('준비 중...'); setPushError(null); setPushResult(null)
    setAutoFixed([]); setNeedsManual([])

    // 1. 설정 파일 수정
    const configFiles = rewritePlan.map(p => ({ ...p.file, newContent: p.newContent }))
    const fixedList: typeof autoFixed = configFiles.map(f => ({ path: f.path, type: 'config' as const }))
    const manualList: typeof needsManual = []

    // 2. 소스 파일 자동 스캔 + 수정
    setPushStatus('소스 파일 스캔 중...')
    let srcFiles: typeof configFiles = []
    try {
      const fetched = await fetchSourceFiles(
        repoInfo, repoToken || undefined,
        ['.java', '.kt', '.ts', '.tsx'],
      )

      let aiDone = 0
      const aiTotal = anthropicKey
        ? fetched.filter(f => detectComplexPatterns(f.content).length > 0).length
        : 0

      srcFiles = (await Promise.all(
        fetched.map(async file => {
          let newContent = rewriteSourceFile(file.filename, file.content)
          const complex  = detectComplexPatterns(newContent ?? file.content)

          if (complex.length > 0 && anthropicKey) {
            // AI 변환
            let aiError: string | undefined
            let reason: ManualReason = 'ai_error'
            try {
              const aiResult = await aiTransformFile(
                file.filename, newContent ?? file.content,
                currentVersions, targetVersions, anthropicKey, aiModel,
              )
              if (aiResult) { newContent = aiResult }
            } catch (e) {
              if (e instanceof AiTransformError) {
                reason = e.code === AI_ERROR_CODE.HAIKU_TOO_LARGE  ? 'haiku_too_large'
                       : e.code === AI_ERROR_CODE.SONNET_TOO_LARGE ? 'sonnet_too_large'
                       : 'ai_error'
              }
              aiError = e instanceof Error ? e.message : '알 수 없는 오류'
            }
            aiDone++
            setPushStatus(`AI 변환 중... (${aiDone}/${aiTotal})`)
            if (aiError) {
              manualList.push({ path: file.path, patterns: complex.map(p => ({ description: p.description, line: p.line, snippet: p.snippet })), reason, aiError })
              if (newContent) fixedList.push({ path: file.path, type: 'source' })
            } else {
              if (newContent) fixedList.push({ path: file.path, type: 'ai' })
            }
          } else if (complex.length > 0 && !anthropicKey) {
            manualList.push({ path: file.path, patterns: complex.map(p => ({ description: p.description, line: p.line, snippet: p.snippet })), reason: 'no_key' })
          } else if (newContent) {
            fixedList.push({ path: file.path, type: 'source' })
          }

          return newContent ? { ...file, newContent } : null
        })
      )).filter((x): x is NonNullable<typeof x> => x !== null)
    } catch (e) {
      // 소스 스캔 실패해도 설정 파일 커밋은 진행 (사용자에게 경고 표시)
      setScanError(`소스 파일 스캔 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'} — 설정 파일만 커밋됩니다.`)
    }

    if (configFiles.length === 0 && srcFiles.length === 0) {
      setPushStatus(null); setPushError('수정할 파일이 없습니다.'); return
    }

    // 3. 브랜치 생성 + 커밋
    setPushStatus(`커밋 중... (설정 ${configFiles.length}개${srcFiles.length > 0 ? ` + 소스 ${srcFiles.length}개` : ''})`)
    try {
      const commitMsg = generateCommitMessage(allChanges)
      const result = await pushToBranch(repoInfo, repoToken, branchName, [...configFiles, ...srcFiles], commitMsg)
      setPushResult(result.branchUrl)
      setAutoFixed(fixedList)
      setNeedsManual(manualList)
      onClearKey?.()  // 사용 후 키 초기화 (SEC-01)
    } catch (e) {
      setPushError(e instanceof Error ? e.message : '브랜치 생성 실패')
    } finally {
      setPushStatus(null)
    }
  }

  if (!hasTargets) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center">
        <GitBranch size={20} className="text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-400">목표 버전을 설정하면 수정 파일이 자동으로 생성됩니다</p>
      </div>
    )
  }

  if (rewritePlan.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
        <CheckCircle size={18} className="text-emerald-500 mx-auto mb-2" />
        <p className="text-sm font-semibold text-emerald-700">수정할 내용이 없습니다</p>
        <p className="text-xs text-emerald-600 mt-1">현재 파일의 버전이 이미 목표 버전과 동일합니다</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* 호환성 자동 유도 경고 */}
      {derivedMessages.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 flex gap-2 items-start">
          <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>
          <div className="text-xs text-amber-700 space-y-0.5">
            <p className="font-semibold">호환성 문제 감지 — 아래 버전을 자동 조정했습니다</p>
            {derivedMessages.map((m, i) => <p key={i}>• {m}</p>)}
          </div>
        </div>
      )}

      {/* 수정 예정 파일 목록 */}
      {rewritePlan.map(({ file, changes }, i) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
            <FileText size={12} className="text-gray-500" />
            <code className="text-xs font-mono font-semibold text-gray-700">{file.path}</code>
          </div>
          <div className="px-4 py-3 space-y-1.5">
            {changes.map((c, j) => (
              <div key={j} className="flex items-center gap-2 text-xs">
                <span className="text-gray-500 w-20 shrink-0 font-medium">{c.label}</span>
                <code className="text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100 font-mono">{c.before}</code>
                <ArrowUpRight size={11} className="text-gray-400 shrink-0" />
                <code className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 font-mono">{c.after}</code>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* 브랜치명 + 생성 버튼 */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-indigo-700 flex items-center gap-1.5">
            <GitBranch size={12} /> 브랜치 생성
          </p>
          <span className="text-[10px] text-indigo-400">소스 파일 수정(javax→jakarta 등) 자동 포함</span>
        </div>
        <div className="flex gap-2">
          <input
            value={branchName}
            onChange={e => setBranchName(e.target.value)}
            className="flex-1 bg-white border border-indigo-200 rounded-lg px-3 py-2 text-xs font-mono
              text-gray-700 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
          />
          <button
            onClick={push}
            disabled={!!pushStatus || !branchName.trim() || rewritePlan.length === 0 || allChanges.length === 0}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 px-4 py-2
              rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-40 shrink-0"
          >
            {pushStatus
              ? <><RefreshCw size={11} className="animate-spin" /> {pushStatus}</>
              : <><GitBranch size={11} /> 브랜치 생성</>}
          </button>
          {rewritePlan.length === 0 && hasTargets && (
            <p className="text-[10px] text-emerald-600 flex items-center gap-1">
              <CheckCircle size={9} /> 변경할 내용이 없습니다 — 이미 목표 버전과 동일하거나 최신입니다.
            </p>
          )}
          {rewritePlan.length > 0 && allChanges.length === 0 && (
            <p className="text-[10px] text-emerald-600 flex items-center gap-1">
              <CheckCircle size={9} /> 변경사항이 없습니다 — 파일이 이미 목표 버전으로 설정되어 있습니다.
            </p>
          )}
        </div>
        {!repoToken && (
          <p className="text-[10px] text-amber-600 flex items-center gap-1">
            <AlertTriangle size={9} /> Token이 필요합니다. 위 연동 패널에서 입력하세요.
          </p>
        )}
      </div>

      {/* 소스 스캔 경고 */}
      {scanError && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
          <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700">{scanError}</p>
        </div>
      )}

      {/* 에러 */}
      {pushError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
          <AlertTriangle size={12} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-700">{pushError}</p>
        </div>
      )}

      {/* 완료 */}
      {pushResult && (
        <div className="space-y-3">
          {/* 브랜치 링크 */}
          <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2">
              <CheckCircle size={15} className="text-emerald-600" />
              <div>
                <p className="text-sm font-bold text-emerald-700">브랜치 생성 완료</p>
                <p className="text-[10px] text-emerald-600 font-mono mt-0.5">{branchName}</p>
              </div>
            </div>
            <a
              href={pushResult}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-white
                border border-emerald-300 px-3 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors"
            >
              브랜치 열기 <ExternalLink size={11} />
            </a>
          </div>

          {/* 자동 수정 목록 */}
          {autoFixed.length > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-white overflow-hidden">
              <div className="px-4 py-2.5 bg-emerald-50 border-b border-emerald-100">
                <p className="text-[11px] font-bold text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle size={11} /> 자동 수정됨 ({autoFixed.length}개)
                </p>
              </div>
              <div className="px-4 py-2 space-y-1">
                {autoFixed.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] text-gray-600">
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold
                      ${f.type === 'ai'     ? 'bg-violet-100 text-violet-600' :
                        f.type === 'config' ? 'bg-blue-100 text-blue-600' :
                                              'bg-emerald-100 text-emerald-600'}`}>
                      {f.type === 'ai' ? 'AI' : f.type === 'config' ? '설정' : '소스'}
                    </span>
                    <code className="font-mono text-gray-500">{f.path}</code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 수동 확인 필요 */}
          {needsManual.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-white overflow-hidden">
              <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
                <p className="text-[11px] font-bold text-amber-700 flex items-center gap-1.5">
                  <AlertTriangle size={11} /> 수동 확인 필요 ({needsManual.length}개)
                </p>
                {!anthropicKey && (
                  <span className="text-[9px] text-amber-500">Anthropic API 키 입력 시 자동 수정 가능</span>
                )}
              </div>
              <div className="px-4 py-2 space-y-4">
                {needsManual.map((f, i) => {
                  const reasonMsg =
                    f.reason === 'no_key'           ? { text: 'Anthropic API 키를 입력하면 자동 변환 가능합니다', cls: 'text-violet-600' } :
                    f.reason === 'haiku_too_large'  ? { text: '파일이 너무 큽니다 — Sonnet 선택 시 전체 파일 처리 가능합니다', cls: 'text-amber-600' } :
                    f.reason === 'sonnet_too_large' ? { text: '파일이 너무 큽니다 — 수동 변환이 필요합니다', cls: 'text-red-600' } :
                                                      { text: `AI 변환 실패: ${f.aiError ?? '알 수 없는 오류'}`, cls: 'text-red-600' }
                  return (
                  <div key={i} className="space-y-2">
                    <code className="text-[10px] font-mono text-gray-600">{f.path}</code>
                    <p className={`text-[10px] flex items-center gap-1 pl-2 ${reasonMsg.cls}`}>
                      <AlertTriangle size={10} className="shrink-0" />
                      {reasonMsg.text}
                    </p>
                    {f.patterns.map((p, j) => (
                      <div key={j} className="pl-2 space-y-0.5">
                        <p className="text-[10px] text-amber-700 flex items-start gap-1">
                          <span className="shrink-0 mt-0.5">→</span>
                          <span><span className="font-semibold">L{p.line}</span> {p.description}</span>
                        </p>
                        <pre className="text-[9px] font-mono bg-amber-50 border border-amber-100 rounded px-2 py-1 text-gray-700 overflow-x-auto whitespace-pre-wrap break-all">{p.snippet}</pre>
                      </div>
                    ))}
                  </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 마이그레이션 체크리스트 */}
          {checklist.length > 0 && (
            <div className="rounded-xl border border-orange-200 bg-white overflow-hidden">
              <div className="px-4 py-2.5 bg-orange-50 border-b border-orange-100">
                <p className="text-[11px] font-bold text-orange-700 flex items-center gap-1.5">
                  <AlertTriangle size={11} /> PR 머지 전 직접 검토 필요 ({checklist.length}건)
                </p>
              </div>
              <div className="divide-y divide-orange-50">
                {checklist.map((item, i) => (
                  <div key={i} className="px-4 py-2.5 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold
                        ${item.severity === 'high'   ? 'bg-red-100 text-red-600' :
                          item.severity === 'medium' ? 'bg-amber-100 text-amber-600' :
                                                       'bg-gray-100 text-gray-500'}`}>
                        {item.severity === 'high' ? '필수' : item.severity === 'medium' ? '권장' : '선택'}
                      </span>
                      <span className="text-[10px] font-semibold text-gray-500">{item.category}</span>
                    </div>
                    <p className="text-[11px] text-gray-700">{item.description}</p>
                    {item.guideKey && FIX_GUIDES[item.guideKey] && (
                      <details className="mt-1">
                        <summary className="text-[10px] text-blue-600 cursor-pointer hover:text-blue-800 select-none flex items-center gap-1">
                          <Info size={9} /> 수정 방법 보기
                        </summary>
                        <div className="mt-1.5 rounded-lg border border-blue-100 overflow-hidden">
                          <div className="px-3 py-1.5 bg-blue-50 border-b border-blue-100">
                            <p className="text-[10px] font-bold text-blue-700">{FIX_GUIDES[item.guideKey].title}</p>
                          </div>
                          <div className="p-2.5 space-y-1.5">
                            <pre className="text-[9px] font-mono text-gray-700 bg-red-50 rounded px-2 py-1.5 overflow-x-auto leading-relaxed border border-red-100">{FIX_GUIDES[item.guideKey].before}</pre>
                            <pre className="text-[9px] font-mono text-gray-700 bg-emerald-50 rounded px-2 py-1.5 overflow-x-auto leading-relaxed border border-emerald-100">{FIX_GUIDES[item.guideKey].after}</pre>
                            {FIX_GUIDES[item.guideKey].note && (
                              <p className="text-[9px] text-amber-700 bg-amber-50 rounded px-2 py-1 border border-amber-100">{FIX_GUIDES[item.guideKey].note}</p>
                            )}
                          </div>
                        </div>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Compat Simulator
// ─────────────────────────────────────────────

const SIM_STATUS_CFG = {
  ok:      { label: '호환',   cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle,   color: 'text-emerald-600', bg: 'border-emerald-200 bg-emerald-50' },
  warn:    { label: '경고',   cls: 'bg-amber-100 text-amber-700 border-amber-200',       icon: AlertTriangle, color: 'text-amber-600',   bg: 'border-amber-200 bg-amber-50' },
  conflict:{ label: '충돌',   cls: 'bg-red-100 text-red-700 border-red-200',             icon: X,             color: 'text-red-600',     bg: 'border-red-200 bg-red-50' },
  unknown: { label: '미확인', cls: 'bg-gray-100 text-gray-600 border-gray-200',          icon: Info,          color: 'text-gray-500',    bg: 'border-gray-200 bg-gray-50' },
} as const

function CompatSimulator({ currentVersions }: { currentVersions: Record<string, string> }) {
  const [ecosystem, setEcosystem]       = useState<'npm' | 'java'>('npm')
  const [pkgName, setPkgName]           = useState('')
  const [pkgVersion, setPkgVersion]     = useState('')
  const [groupId, setGroupId]           = useState('')
  const [artifactId, setArtifactId]     = useState('')
  const [javaVer, setJavaVer]           = useState('')
  const [overrides, setOverrides]       = useState<Record<string, string>>({})
  const [showOverride, setShowOverride] = useState(false)
  const [result, setResult]             = useState<SimResult | null>(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)

  const effectiveVersions = useMemo(
    () => ({ ...currentVersions, ...overrides }),
    [currentVersions, overrides],
  )

  const canRun = ecosystem === 'npm'
    ? pkgName.trim() !== ''
    : groupId.trim() !== '' && artifactId.trim() !== '' && javaVer.trim() !== ''

  async function run() {
    if (!canRun) return
    setLoading(true); setError(null); setResult(null)
    try {
      if (ecosystem === 'npm') {
        setResult(await simulateNpm(pkgName.trim(), pkgVersion.trim() || undefined, effectiveVersions))
      } else {
        setResult(simulateJava(groupId.trim(), artifactId.trim(), javaVer.trim(), effectiveVersions))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '시뮬레이션 실패')
    } finally {
      setLoading(false)
    }
  }

  function applyQuickPick(pick: typeof JAVA_QUICK_PICKS[number]) {
    setGroupId(pick.groupId); setArtifactId(pick.artifactId); setJavaVer('')
    setResult(null); setError(null)
  }

  return (
    <div className="space-y-4">
      {/* 입력 패널 */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">

        {/* 생태계 선택 */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-gray-500">생태계</span>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
            {(['npm', 'java'] as const).map(eco => (
              <button key={eco}
                onClick={() => { setEcosystem(eco); setResult(null); setError(null) }}
                className={`px-3 py-1.5 transition-colors ${
                  ecosystem === eco
                    ? eco === 'npm' ? 'bg-red-500 text-white' : 'bg-orange-500 text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}>
                {eco === 'npm' ? 'npm (프론트엔드)' : 'Maven / Gradle (백엔드)'}
              </button>
            ))}
          </div>
        </div>

        {/* 빠른 선택 */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 mb-1.5">빠른 선택</p>
          <div className="flex flex-wrap gap-1.5">
            {ecosystem === 'npm'
              ? NPM_QUICK_PICKS.map(p => (
                  <button key={p}
                    onClick={() => { setPkgName(p); setPkgVersion(''); setResult(null); setError(null) }}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-all
                      ${pkgName === p
                        ? 'border-red-400 text-red-700 bg-red-50 font-bold'
                        : 'border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-600 bg-white'}`}>
                    {p}
                  </button>
                ))
              : JAVA_QUICK_PICKS.map(p => (
                  <button key={p.artifactId}
                    onClick={() => applyQuickPick(p)}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-all
                      ${artifactId === p.artifactId
                        ? 'border-orange-400 text-orange-700 bg-orange-50 font-bold'
                        : 'border-gray-200 text-gray-500 hover:border-orange-300 hover:text-orange-600 bg-white'}`}>
                    {p.label}
                  </button>
                ))
            }
          </div>
        </div>

        {/* 패키지 입력 */}
        {ecosystem === 'npm' ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <p className="text-[10px] font-semibold text-gray-400 mb-1">패키지 이름</p>
              <input value={pkgName} onChange={e => setPkgName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && run()}
                placeholder="예: axios, @tanstack/react-query"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono
                  text-gray-700 placeholder-gray-300 focus:outline-none focus:border-red-400
                  focus:ring-2 focus:ring-red-100 transition-all" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 mb-1">버전 (비우면 latest)</p>
              <input value={pkgVersion} onChange={e => setPkgVersion(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && run()}
                placeholder="예: 1.7.0"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono
                  text-gray-700 placeholder-gray-300 focus:outline-none focus:border-red-400
                  focus:ring-2 focus:ring-red-100 transition-all" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: 'Group ID',    value: groupId,    set: setGroupId,    ph: 'org.projectlombok' },
              { label: 'Artifact ID', value: artifactId, set: setArtifactId, ph: 'lombok' },
              { label: '버전',        value: javaVer,    set: setJavaVer,    ph: '1.18.36' },
            ].map(({ label, value, set, ph }) => (
              <div key={label}>
                <p className="text-[10px] font-semibold text-gray-400 mb-1">{label}</p>
                <input value={value} onChange={e => set(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && run()}
                  placeholder={ph}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono
                    text-gray-700 placeholder-gray-300 focus:outline-none focus:border-orange-400
                    focus:ring-2 focus:ring-orange-100 transition-all" />
              </div>
            ))}
          </div>
        )}

        {/* 기준 버전 표시 + 오버라이드 */}
        <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold text-gray-400">시뮬레이션 기준 버전</p>
            <button onClick={() => setShowOverride(v => !v)}
              className="text-[10px] text-blue-500 hover:text-blue-700 transition-colors">
              {showOverride ? '닫기' : '버전 직접 입력'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STACK.map(s => {
              const ver = effectiveVersions[s.id]
              if (!ver) return null
              return (
                <span key={s.id} className={`text-[10px] font-mono px-2 py-0.5 rounded border ${s.borderColor} ${s.color} ${s.bgColor}`}>
                  {s.name} {ver}
                </span>
              )
            })}
            {!Object.values(effectiveVersions).some(Boolean) && (
              <span className="text-[10px] text-gray-400">버전 미입력 — 위 "내 스택 버전 입력"에서 설정하거나 직접 입력하세요</span>
            )}
          </div>

          {showOverride && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {STACK.map(s => (
                <div key={s.id}>
                  <p className="text-[9px] font-semibold text-gray-400 mb-1">{s.name}</p>
                  <input
                    value={overrides[s.id] ?? currentVersions[s.id] ?? ''}
                    onChange={e => setOverrides(prev => ({ ...prev, [s.id]: e.target.value }))}
                    placeholder={s.unitLabel}
                    className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1 text-[10px] font-mono
                      text-gray-700 placeholder-gray-300 focus:outline-none focus:border-blue-400 transition-all" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button onClick={run} disabled={loading || !canRun}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 px-4 py-2 rounded-lg
              hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-40">
            {loading
              ? <><RefreshCw size={11} className="animate-spin" /> 조회 중...</>
              : <><Zap size={11} /> 호환성 시뮬레이션</>}
          </button>
        </div>
      </div>

      {/* 에러 */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-2">
          <AlertTriangle size={13} className="text-red-500 shrink-0" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* 결과 */}
      {result && (() => {
        const status = result.type === 'npm' ? result.overallStatus
          : result.overallStatus === 'unknown' ? 'warn' : result.overallStatus
        const cfg = SIM_STATUS_CFG[status as keyof typeof SIM_STATUS_CFG]
        const StatusIcon = cfg.icon

        return (
          <div className="space-y-3">
            {/* 전체 상태 배너 */}
            <div className={`rounded-xl border px-5 py-4 flex items-center justify-between gap-3 flex-wrap ${cfg.bg}`}>
              <div className="flex items-center gap-3">
                <StatusIcon size={20} className={cfg.color} />
                <div>
                  <p className={`text-sm font-bold ${cfg.color}`}>
                    {result.type === 'npm'
                      ? `${result.pkg}@${result.version}`
                      : `${result.groupId}:${result.artifactId}:${result.version}`}
                    &nbsp;— {cfg.label}
                  </p>
                  {result.type === 'npm' && result.description && (
                    <p className="text-[11px] text-gray-500 mt-0.5">{result.description}</p>
                  )}
                  {result.type === 'npm' && result.license && (
                    <p className="text-[10px] text-gray-400 mt-0.5">License: {result.license}</p>
                  )}
                </div>
              </div>
              <span className={`text-xs font-bold px-3 py-1 rounded-full border ${cfg.cls}`}>
                {cfg.label}
              </span>
            </div>

            {/* npm: peerDependencies */}
            {result.type === 'npm' && (
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-bold text-gray-700 mb-3 flex items-center gap-1.5">
                  <GitBranch size={12} /> peerDependencies 확인
                </p>
                {result.peerDeps.length === 0 ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle size={13} className="text-emerald-500" />
                    <p className="text-xs text-emerald-700">peerDependencies 없음 — 다른 패키지와 버전 충돌 위험 없음</p>
                  </div>
                ) : (
                  <div className="space-y-0">
                    {result.peerDeps.map((dep, i) => {
                      const dc = SIM_STATUS_CFG[dep.status === 'unknown' ? 'warn' : dep.status]
                      const DepIcon = dc.icon
                      return (
                        <div key={i} className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0">
                          <DepIcon size={13} className={`${dc.color} shrink-0 mt-0.5`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="text-xs font-mono font-bold text-gray-800">{dep.pkg}</span>
                              <span className="text-[10px] text-gray-400">
                                필요: <code className="font-mono bg-gray-100 px-1 rounded">{dep.required}</code>
                              </span>
                              {dep.current && (
                                <span className="text-[10px] text-gray-400">
                                  현재: <code className={`font-mono font-bold ${dc.color}`}>{dep.current}</code>
                                </span>
                              )}
                            </div>
                            <p className={`text-[11px] ${dc.color}`}>{dep.statusMessage}</p>
                          </div>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${dc.cls}`}>
                            {dc.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Java: 호환성 체크 */}
            {result.type === 'java' && (
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-bold text-gray-700 mb-3 flex items-center gap-1.5">
                  <Shield size={12} /> 호환성 체크
                </p>
                <div className="space-y-0">
                  {result.checks.map((check, i) => {
                    const cc = SIM_STATUS_CFG[check.status]
                    const CheckIcon = cc.icon
                    return (
                      <div key={i} className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0">
                        <CheckIcon size={13} className={`${cc.color} shrink-0 mt-0.5`} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-semibold text-gray-700">{check.label}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${cc.cls}`}>{cc.label}</span>
                          </div>
                          <p className={`text-[11px] ${cc.color}`}>{check.message}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Java: 주의사항 */}
            {result.type === 'java' && result.notes.length > 0 && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-[11px] font-bold text-blue-700 mb-2 flex items-center gap-1.5">
                  <Info size={11} /> 주의사항
                </p>
                <ul className="space-y-1">
                  {result.notes.map((note, i) => (
                    <li key={i} className="text-[11px] text-blue-700 flex items-start gap-1.5">
                      <span className="shrink-0">·</span> {note}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 대안 라이브러리 */}
            {result.alternatives.length > 0 && (
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                <p className="text-[11px] font-bold text-violet-700 mb-3 flex items-center gap-1.5">
                  <Sparkles size={11} /> 대안 라이브러리
                </p>
                <div className="space-y-2">
                  {result.alternatives.map((alt, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <ArrowUpRight size={11} className="text-violet-500 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-violet-700">
                        <span className="font-bold font-mono">{alt.name}</span>
                        <span className="text-violet-500 ml-2">— {alt.description}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}

// ─────────────────────────────────────────────
// Code Analyzer
// ─────────────────────────────────────────────

interface CodeFinding {
  key: string
  lineNumber: number
  originalLine: string
  fixSuggestion: string | null
  guide: typeof FIX_GUIDES[string] | null
  risk: 'high' | 'medium' | 'low'
}

const RISK_META = {
  high:   { label: '상', cls: 'bg-red-100 text-red-700 border-red-200' },
  medium: { label: '중', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  low:    { label: '하', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
} as const

const PATTERN_RISK: Record<string, 'high' | 'medium' | 'low'> = {
  javax_imports:          'medium',
  websecurity_adapter:    'high',
  sun_imports:            'high',
  deprecated_finalize:    'high',
  threadlocal_usage:      'high',
  jackson_objectmapper:   'medium',
  querydsl_config:        'high',
  react_dom_render:       'medium',
  class_components:       'high',
  zustand_default_import: 'low',
  vite_plugin_usage:      'low',
}

const MANUAL_REVIEW_REASON: Record<string, string> = {
  websecurity_adapter: 'SecurityFilterChain Bean 방식으로 전체 클래스 구조를 재작성해야 합니다.',
  sun_imports:         '사용 중인 sun.* 클래스에 따라 대체 API가 다릅니다. 컴파일 에러 메시지로 하나씩 확인하세요.',
  deprecated_finalize: 'Cleaner 또는 AutoCloseable 패턴으로 리소스 관리 방식 전반을 재설계해야 합니다.',
  threadlocal_usage:   'Virtual Thread 환경 여부를 확인 후 ScopedValue 마이그레이션 여부를 결정하세요.',
  querydsl_config:     'build.gradle에 :jakarta 분류자 추가 후 EntityManager import도 함께 변경해야 합니다.',
  class_components:    '클래스 컴포넌트를 함수형으로 변환하려면 생명주기 메서드를 useEffect로 재설계해야 합니다.',
}

function analyzeCode(
  code: string,
  lang: 'java' | 'typescript',
  neededKeys: string[],
): CodeFinding[] {
  const findings: CodeFinding[] = []
  const lines = code.split('\n')
  const extSet = lang === 'java'
    ? new Set(['.java'])
    : new Set(['.ts', '.tsx', '.js', '.jsx'])

  for (const key of neededKeys) {
    if (!PATTERNS[key]) continue
    const allowedExts = KEY_EXTS[key]
    if (allowedExts && ![...allowedExts].some(e => extSet.has(e))) continue

    lines.forEach((line, idx) => {
      if (!PATTERNS[key].test(line)) return
      const fixSuggestion = LINE_TRANSFORMS[key]?.(line.trim()) ?? null
      findings.push({
        key,
        lineNumber: idx + 1,
        originalLine: line.trim(),
        fixSuggestion,
        guide: FIX_GUIDES[key] ?? null,
        risk: PATTERN_RISK[key] ?? 'medium',
      })
    })
  }

  return findings
}

function CodeAnalyzer({
  currentVersions,
  targetVersions,
}: {
  currentVersions: Record<string, string>
  targetVersions:  Record<string, string>
}) {
  const [code, setCode]             = useState('')
  const [lang, setLang]             = useState<'java' | 'typescript'>('java')
  const [findings, setFindings]     = useState<CodeFinding[] | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const neededKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const s of STACK) {
      const cur = currentVersions[s.id]?.trim()
      const tgt = targetVersions[s.id]?.trim()
      if (!cur || !tgt) continue
      const from = parseFloat(cur.replace(/[^0-9.]/g, '')) || 0
      const to   = parseFloat(tgt.replace(/[^0-9.]/g, '')) || 0
      requiredKeys(s.id, from, to).forEach(k => keys.add(k))
    }
    return [...keys]
  }, [currentVersions, targetVersions])

  const hasVersions = neededKeys.length > 0

  function analyze() {
    if (!code.trim() || !hasVersions) return
    setFindings(analyzeCode(code, lang, neededKeys))
    setExpandedKey(null)
  }

  const grouped: [string, CodeFinding[]][] = findings
    ? Object.entries(
        findings.reduce((acc, f) => {
          if (!acc[f.key]) acc[f.key] = []
          acc[f.key].push(f)
          return acc
        }, {} as Record<string, CodeFinding[]>)
      ).sort(([, a], [, b]) => {
        const order = { high: 0, medium: 1, low: 2 }
        return order[a[0].risk] - order[b[0].risk]
      })
    : []

  if (!hasVersions) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center shadow-sm">
        <FileText size={24} className="text-gray-300 mx-auto mb-2" />
        <p className="text-sm font-medium text-gray-500">위에서 현재·목표 버전을 먼저 입력하세요</p>
        <p className="text-sm text-gray-400 mt-1">버전 범위가 설정되면 코드 분석이 활성화됩니다.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 입력 영역 */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-gray-500">언어</span>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
            <button
              onClick={() => setLang('java')}
              className={`px-3 py-1.5 transition-colors ${lang === 'java' ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              Java
            </button>
            <button
              onClick={() => setLang('typescript')}
              className={`px-3 py-1.5 transition-colors ${lang === 'typescript' ? 'bg-cyan-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              TypeScript / React
            </button>
          </div>
          <span className="text-[10px] text-gray-400 ml-auto">
            탐지 항목: {neededKeys.map(k => GREP_DEFS.find(d => d.key === k)?.label ?? k).join(' · ')}
          </span>
        </div>

        <textarea
          value={code}
          onChange={e => setCode(e.target.value)}
          rows={12}
          placeholder={lang === 'java'
            ? '// Java 코드를 붙여넣으세요\nimport javax.persistence.Entity;\n\npublic class UserService {\n  ...\n}'
            : '// TypeScript / React 코드를 붙여넣으세요\nimport create from \'zustand\';\nimport ReactDOM from \'react-dom\';\n...'}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs font-mono
            text-gray-700 placeholder-gray-300 focus:outline-none focus:border-blue-400
            focus:ring-2 focus:ring-blue-100 transition-all resize-y"
        />

        <div className="flex justify-end gap-2">
          {(code || findings) && (
            <button
              onClick={() => { setCode(''); setFindings(null) }}
              className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              초기화
            </button>
          )}
          <button
            onClick={analyze}
            disabled={!code.trim()}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 px-4 py-1.5 rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-40"
          >
            <Shield size={11} /> 코드 분석
          </button>
        </div>
      </div>

      {/* 결과 */}
      {findings && (
        <div className="space-y-3">
          {/* 요약 배너 */}
          <div className={`rounded-xl border px-4 py-3 flex items-center justify-between flex-wrap gap-2
            ${findings.length === 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
            {findings.length === 0 ? (
              <>
                <div className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-emerald-600" />
                  <span className="text-sm font-semibold text-emerald-700">수정 필요 항목 없음</span>
                </div>
                <span className="text-xs text-emerald-600">이 버전 범위에서 감지된 문제가 없습니다.</span>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-red-600" />
                  <span className="text-sm font-semibold text-red-700">{findings.length}건 수정 필요</span>
                </div>
                <div className="flex items-center gap-2">
                  {(['high', 'medium', 'low'] as const).map(r => {
                    const cnt = findings.filter(f => f.risk === r).length
                    if (cnt === 0) return null
                    return (
                      <span key={r} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${RISK_META[r].cls}`}>
                        위험도 {RISK_META[r].label} {cnt}건
                      </span>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* 패턴별 결과 */}
          {grouped.map(([key, items]) => {
            const guide    = items[0].guide
            const risk     = items[0].risk
            const isManual = !!MANUAL_REVIEW_REASON[key]
            const isOpen   = expandedKey === key

            return (
              <div key={key} className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                {/* 헤더 */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left flex-wrap"
                  onClick={() => setExpandedKey(isOpen ? null : key)}
                >
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${RISK_META[risk].cls}`}>
                    위험도 {RISK_META[risk].label}
                  </span>
                  <span className="text-xs font-semibold text-gray-800 flex-1 min-w-0 truncate">
                    {guide?.title ?? key}
                  </span>
                  <span className="text-[10px] text-gray-400 shrink-0">{items.length}줄 감지</span>
                  {isManual && (
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
                      수동 확인 필요
                    </span>
                  )}
                  {isOpen
                    ? <ChevronUp size={12} className="text-gray-400 shrink-0" />
                    : <ChevronDown size={12} className="text-gray-400 shrink-0" />}
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-4">
                    {/* 수동 확인 필요 알림 */}
                    {isManual && (
                      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                        <AlertTriangle size={12} className="text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[11px] font-bold text-amber-700 mb-0.5">수동 확인 필요</p>
                          <p className="text-[11px] text-amber-700">{MANUAL_REVIEW_REASON[key]}</p>
                        </div>
                      </div>
                    )}

                    {/* 줄별 결과 */}
                    <div className="space-y-2">
                      {items.map((finding, i) => (
                        <div key={i} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 border-b border-gray-200">
                            <span className="text-[9px] text-gray-500 font-mono font-semibold">Line {finding.lineNumber}</span>
                          </div>
                          <div className="p-3 space-y-2">
                            <div>
                              <p className="text-[9px] font-bold text-red-500 mb-1">수정 전</p>
                              <pre className="text-[11px] font-mono text-red-700 bg-red-50 rounded px-2.5 py-2 overflow-x-auto border border-red-100 whitespace-pre-wrap break-all">
                                {finding.originalLine}
                              </pre>
                            </div>
                            {finding.fixSuggestion ? (
                              <div>
                                <p className="text-[9px] font-bold text-emerald-600 mb-1">수정 후</p>
                                <pre className="text-[11px] font-mono text-emerald-700 bg-emerald-50 rounded px-2.5 py-2 overflow-x-auto border border-emerald-100 whitespace-pre-wrap break-all">
                                  {finding.fixSuggestion}
                                </pre>
                              </div>
                            ) : guide?.after ? (
                              <div>
                                <p className="text-[9px] font-bold text-emerald-600 mb-1">수정 후 (예시)</p>
                                <pre className="text-[11px] font-mono text-gray-700 bg-emerald-50 rounded px-2.5 py-2 overflow-x-auto border border-emerald-100 max-h-40 whitespace-pre">
                                  {guide.after}
                                </pre>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 주의사항 */}
                    {guide?.note && (
                      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
                        <Info size={11} className="text-blue-600 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-blue-700">{guide.note}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

const PAGE_TABS = ['레포 마이그레이션', '버전 현황'] as const
type PageTab = typeof PAGE_TABS[number]

export default function TechNewsBoard() {
  const [pageTab, setPageTab]           = useState<PageTab>('레포 마이그레이션')

  const [currentVersions, setCurrentVersions] = useState<Record<string, string>>({})
  const [targetVersions,  setTargetVersions]  = useState<Record<string, string>>({})
  const [viewVersions,    setViewVersions]    = useState<Record<string, string | null>>({})
  const [repoInfo,      setRepoInfo]      = useState<RepoInfo | null>(null)
  const [repoToken,     setRepoToken]     = useState('')
  const [fetchedFiles,  setFetchedFiles]  = useState<FetchedFile[]>([])
  const [anthropicKey,    setAnthropicKey]    = useState('')
  const [aiModel,         setAiModel]         = useState<'haiku' | 'sonnet'>('haiku')
  const [clearKeyAfterUse, setClearKeyAfterUse] = useState(true)

  const { data: liveVersions, refetch, isFetching } = useLatestVersions()

  const enrichedStack = STACK.map(s => {
    const live: VersionInfo | undefined = liveVersions?.[s.id as StackId]
    if (!live) return s
    const latestLabel = live.version
    // 기존 badge 중 latestLabel의 prefix인 것이 있으면 이미 커버됨
    // 예: "25" → "25.0.3" 커버, "4.0" → "4.1.0" 미커버 (minor 다름)
    const latestMajorMinor = latestLabel.split('.').slice(0, 2).join('.')
    const minorCovered = s.quickVersions.some(v =>
      v === latestLabel ||
      v === latestMajorMinor ||
      v.startsWith(latestMajorMinor + '.') ||
      latestMajorMinor.startsWith(v + '.') ||  // "25" 가 "25.0" 커버
      latestLabel.startsWith(v + '.')           // "25" 가 "25.0.3" 커버
    )
    const quickVersions = !minorCovered
      ? [...s.quickVersions, latestMajorMinor]
      : s.quickVersions
    return {
      ...s,
      latestVersion: live.version.split('.')[0] + (live.version.includes('.') ? '.' + live.version.split('.')[1] : ''),
      latestLabel,
      releaseDate:   live.publishedAt ? live.publishedAt.slice(0, 10) : s.releaseDate,
      link:          live.releaseUrl || s.link,
      quickVersions,
    }
  })

  const setCurrent = (id: string, v: string) => setCurrentVersions(prev => ({ ...prev, [id]: v }))
  const setTarget  = (id: string, v: string) => setTargetVersions(prev => ({ ...prev, [id]: v }))

  const clearAll = () => { setCurrentVersions({}); setTargetVersions({}) }

function handleParsed(result: ParseResult) {
    const p = result.versions
    setCurrentVersions(prev => ({
      ...prev,
      ...(p.java       ? { java: p.java }             : {}),
      ...(p.springboot ? { springboot: p.springboot } : {}),
      ...(p.react      ? { react: p.react }           : {}),
      ...(p.vite       ? { vite: p.vite }             : {}),
      ...(p.zustand    ? { zustand: p.zustand }       : {}),
      ...(p.querydsl   ? { querydsl: p.querydsl }     : {}),
    }))
  }

  function handleRepoFetch(info: RepoInfo, files: FetchedFile[]) {
    setRepoInfo(info)
    setFetchedFiles(files)

    // 모든 파일에서 버전을 먼저 합친 뒤 한 번만 setState
    const merged: Record<string, string> = {}
    for (const file of files) {
      const { versions } = parseConfigFile(file.filename, file.content)
      if (versions.java)       merged.java       = versions.java
      if (versions.springboot) merged.springboot = versions.springboot
      if (versions.react)      merged.react      = versions.react
      if (versions.vite)       merged.vite       = versions.vite
      if (versions.zustand)    merged.zustand    = versions.zustand
      if (versions.querydsl)   merged.querydsl   = versions.querydsl
    }
    if (Object.keys(merged).length > 0) {
      setCurrentVersions(prev => ({ ...prev, ...merged }))
    }
  }

  const hasCurrentInput = Object.values(currentVersions).some(v => v.trim() !== '')
  const hasTargetInput  = Object.values(targetVersions).some(v => v.trim() !== '')
  const inputCount = Object.values(currentVersions).filter(v => v.trim()).length


  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-3 sm:p-5">

      {/* Header */}
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <TrendingUp size={22} className="text-blue-600" />
          Tech Stack 업데이트
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          GitHub / GitLab 레포 연동 · 버전 자동 감지 · 마이그레이션 브랜치 자동 생성
        </p>
      </header>

      {/* 페이지 탭 */}
      <div className="flex gap-1 mb-6 bg-white border border-gray-200 p-1 rounded-xl w-fit shadow-sm">
        {PAGE_TABS.map(t => (
          <button
            key={t}
            onClick={() => setPageTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200
              ${pageTab === t
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}
          >
            {t === '버전 현황' ? '📡 버전 현황' : '🔗 레포 마이그레이션'}
          </button>
        ))}
      </div>

      {/* ─── 버전 현황 탭 ─── */}
      {pageTab === '버전 현황' && (<>


        {/* 최신 버전 현황 */}
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
            <TrendingUp size={12} className="text-blue-500" /> 현재 최신 버전
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              title="버전 새로고침"
              className="ml-1 p-1 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 disabled:opacity-40 transition-colors"
            >
              <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
            </button>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {enrichedStack.map(s => {
              const Icon = s.icon
              return (
                <div key={s.id} className={`rounded-2xl border ${s.borderColor} ${s.bgColor} p-4 text-center shadow-sm`}>
                  <div className={`p-2 rounded-xl ${s.iconBg} w-fit mx-auto mb-2`}>
                    <Icon size={16} className={s.color} />
                  </div>
                  <p className="text-xs font-semibold text-gray-600 mb-1">{s.name}</p>
                  <p className={`text-lg font-mono font-bold ${s.color}`}>{s.latestLabel}</p>
                  {s.status === 'lts' && (
                    <span className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 mt-0.5">LTS</span>
                  )}
                  <p className="text-[10px] text-gray-400 mt-1 flex items-center justify-center gap-1">
                    <Clock size={9} /> {s.releaseDate}
                  </p>
                </div>
              )
            })}
          </div>
        </section>

        {/* 버전별 변경사항 */}
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
          <Star size={12} className="text-blue-500" /> 버전별 변경사항
        </h2>
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
          {enrichedStack.map(item => (
            <StackCard
              key={item.id}
              item={item}
              currentVersion=""
              viewVersion={viewVersions[item.id] ?? null}
              onViewVersionChange={v => setViewVersions(prev => ({ ...prev, [item.id]: v }))}
            />
          ))}
        </section>

        {/* 호환성 체크리스트 */}
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
            <GitBranch size={12} className="text-blue-500" /> 스택 호환성 체크리스트
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800 mb-1 flex items-center gap-2">
                <Shield size={14} className="text-blue-600" /> 백엔드 호환성
              </h3>
              <p className="text-xs text-gray-400 mb-4">Spring Boot 4 마이그레이션 시 확인 항목</p>
              {COMPAT.filter((_, i) => i < 4).map(item => <CompatRow key={item.name} item={item} />)}
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800 mb-1 flex items-center gap-2">
                <Globe size={14} className="text-cyan-600" /> 프론트엔드 호환성
              </h3>
              <p className="text-xs text-gray-400 mb-4">React 19 + Vite 8 전환 시 확인 항목</p>
              {COMPAT.filter((_, i) => i >= 4).map(item => <CompatRow key={item.name} item={item} />)}
            </div>
          </div>
        </section>

      </>)}

      {/* ─── 레포 마이그레이션 탭 ─── */}
      {pageTab === '레포 마이그레이션' && (<>

        {/* 설명 */}
        <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-blue-800 mb-0.5">레포를 연동하면 마이그레이션 브랜치를 자동 생성합니다.</p>
            <p className="text-[11px] text-blue-600">
              생성된 브랜치는 <span className="font-semibold">PR 초안</span>입니다. 반드시 CI 통과 확인 + 코드 리뷰 후 머지하세요.
              메이저 버전 업그레이드(Spring Boot 2→3, Java 11→21 등)는 자동 배포 없이 사람이 직접 검토해야 합니다.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
              <p className="text-[11px] font-bold text-emerald-700 mb-1.5">자동으로 반영</p>
              <ul className="text-[11px] text-emerald-600 space-y-0.5 list-disc list-inside">
                <li>의존성 버전 업데이트 (pom.xml / build.gradle / package.json)</li>
                <li>Jakarta EE 패키지 치환 (javax.persistence → jakarta 등)</li>
                <li>Zustand named import, ReactDOM.render 주석 마킹</li>
              </ul>
            </div>
            <div className="flex-1 rounded-xl bg-violet-50 border border-violet-200 px-4 py-3">
              <p className="text-[11px] font-bold text-violet-700 mb-1.5">AI 키 입력 시 추가 변환</p>
              <ul className="text-[11px] text-violet-600 space-y-0.5 list-disc list-inside">
                <li>WebSecurityConfigurerAdapter → SecurityFilterChain</li>
                <li>Class 컴포넌트 → 함수형 + hooks</li>
                <li>finalize() · ThreadLocal 등 복잡한 패턴</li>
                <li className="text-violet-400">※ AI 변환 결과도 반드시 리뷰 필요</li>
              </ul>
            </div>
            <div className="flex-1 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-[11px] font-bold text-red-700 mb-1.5">자동화 불가 — 직접 수정</p>
              <ul className="text-[11px] text-red-600 space-y-0.5 list-disc list-inside">
                <li>application.yml 키 변경 (spring.redis.* 등)</li>
                <li>spring.factories → AutoConfiguration.imports</li>
                <li>Spring Security 인증·인가 비즈니스 로직</li>
                <li>테스트 코드 · DB 마이그레이션 스크립트</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 스텝 인디케이터 */}
        <div className="overflow-x-auto mb-6">
        <div className="flex items-center gap-2 text-xs text-gray-400 font-medium min-w-max">
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all
            ${fetchedFiles.length > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
            <span className="w-4 h-4 rounded-full bg-current opacity-20 inline-flex items-center justify-center text-[10px] font-bold">①</span>
            레포 연동
          </span>
          <div className="flex-1 h-px bg-gray-200" />
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all
            ${Object.values(targetVersions).some(v => v) ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : fetchedFiles.length > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
            <span className="w-4 h-4 rounded-full bg-current opacity-20 inline-flex items-center justify-center text-[10px] font-bold">②</span>
            목표 버전 설정
          </span>
          <div className="flex-1 h-px bg-gray-200" />
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all
            ${Object.values(targetVersions).some(v => v) && fetchedFiles.length > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
            <span className="w-4 h-4 rounded-full bg-current opacity-20 inline-flex items-center justify-center text-[10px] font-bold">③</span>
            브랜치 생성
          </span>
        </div>
        </div>

        {/* ① 레포 연동 */}
        <section className="mb-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
            <GitBranch size={12} className="text-gray-400" /> ① 레포 연동
          </h2>
          <RepoConnector onFetched={handleRepoFetch} onTokenChange={setRepoToken} />
        </section>

        {/* ② 목표 버전 설정 */}
        {fetchedFiles.length > 0 && (
          <section className="mb-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
              <Settings size={12} className="text-blue-500" /> ② 목표 버전 설정
            </h2>
            <div className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] text-gray-400 mb-3">
                <span className="text-blue-600 font-semibold">현재</span> — 레포에서 자동 추출 &nbsp;|&nbsp;
                <span className="text-violet-600 font-semibold">목표</span> — 업그레이드할 버전 입력
              </p>
              <StackInputPanel
                stack={enrichedStack.filter(item =>
                  currentVersions[item.id] || targetVersions[item.id]
                )}
                currentVersions={currentVersions}
                targetVersions={targetVersions}
                onCurrentChange={setCurrent}
                onTargetChange={setTarget}
              />
              {enrichedStack.every(item => !currentVersions[item.id]) && (
                <p className="text-[11px] text-gray-400 mt-2">
                  설정 파일에서 버전을 감지하지 못했습니다. 파일을 다시 가져오거나 직접 입력하세요.
                </p>
              )}
            </div>
          </section>
        )}

        {/* AI 키 입력 (선택) */}
        {fetchedFiles.length > 0 && (
          <section className="mb-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
              <Sparkles size={12} className="text-violet-400" /> AI 코드 변환 (선택)
            </h2>
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 space-y-3">
              <p className="text-[11px] text-violet-700">
                Anthropic API 키를 입력하면 <strong>WebSecurityConfigurerAdapter, finalize(), ThreadLocal</strong> 등
                단순 치환으로 안 되는 복잡한 패턴도 Claude가 자동으로 수정합니다.
              </p>

              {/* 모델 선택 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {([
                  {
                    value: 'haiku' as const,
                    label: 'Claude Haiku',
                    badge: '빠름·저렴',
                    badgeCls: 'bg-emerald-100 text-emerald-700',
                    desc: '패턴 위치 ±25줄만 전달. 대형 파일은 수동 확인으로 넘어갈 수 있습니다.',
                  },
                  {
                    value: 'sonnet' as const,
                    label: 'Claude Sonnet',
                    badge: '정확·비쌈',
                    badgeCls: 'bg-violet-100 text-violet-700',
                    desc: '파일 전체를 보고 변환. 복잡한 Security 설정, 대형 클래스도 처리합니다.',
                  },
                ] as const).map(m => (
                  <button
                    key={m.value}
                    onClick={() => setAiModel(m.value)}
                    className={`text-left rounded-lg border px-3 py-2.5 transition-all
                      ${aiModel === m.value
                        ? 'border-violet-400 bg-white shadow-sm ring-2 ring-violet-100'
                        : 'border-violet-200 bg-violet-50 hover:bg-white'}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[11px] font-bold text-gray-700">{m.label}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${m.badgeCls}`}>{m.badge}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-relaxed">{m.desc}</p>
                  </button>
                ))}
              </div>

              <div className="flex gap-2 items-center">
                <span className="text-[11px] text-violet-600 shrink-0 font-medium">Anthropic API Key</span>
                <input
                  type="password"
                  value={anthropicKey}
                  onChange={e => setAnthropicKey(e.target.value)}
                  placeholder="sk-ant-xxxx  (없으면 단순 치환만 적용)"
                  autoComplete="new-password"
                  className="flex-1 min-w-0 bg-white border border-violet-200 rounded-lg px-3 py-2 text-xs font-mono
                    text-gray-700 placeholder-gray-300 focus:outline-none focus:border-violet-400
                    focus:ring-2 focus:ring-violet-100 transition-all"
                />
              </div>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={clearKeyAfterUse}
                    onChange={e => setClearKeyAfterUse(e.target.checked)}
                    className="accent-violet-500"
                  />
                  <span className="text-[10px] text-violet-600">브랜치 생성 완료 후 키 자동 초기화</span>
                </label>
                <p className="text-[9px] text-amber-600 flex items-center gap-1">
                  <AlertTriangle size={9} /> 키는 브라우저 메모리에만 저장되나 DevTools에서 확인될 수 있습니다. 공용 PC에서는 주의하세요.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ③ 브랜치 생성 */}
        {fetchedFiles.length > 0 && repoInfo !== null && (
          <section className="mb-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
              <GitBranch size={12} className="text-indigo-500" /> ③ 브랜치 생성
            </h2>
            <BranchCreator
              repoInfo={repoInfo}
              repoToken={repoToken}
              fetchedFiles={fetchedFiles}
              currentVersions={currentVersions}
              targetVersions={targetVersions}
              anthropicKey={anthropicKey}
              aiModel={aiModel}
              onClearKey={clearKeyAfterUse ? () => setAnthropicKey('') : undefined}
            />
          </section>
        )}

        {/* 아직 연동 전 안내 */}
        {fetchedFiles.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
            <GitBranch size={28} className="text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-400 mb-1">레포를 먼저 연동하세요</p>
            <p className="text-xs text-gray-300">URL과 Token을 입력하고 "가져오기"를 클릭하면<br/>② 버전 설정 · ③ 브랜치 생성 단계가 순서대로 나타납니다</p>
          </div>
        )}

      </>)}

      {/* Footer */}
      <footer className="pt-5 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-400">
        <span className="font-medium text-gray-500">Tech News Board</span>
        <div className="flex items-center gap-3">
          <span>Java 25 LTS</span><span>·</span>
          <span>Spring Boot 4.0.5</span><span>·</span>
          <span>React 19.2</span><span>·</span>
          <span>Vite 8</span><span>·</span>
          <span>Zustand v5</span>
        </div>
      </footer>
    </div>
  )
}

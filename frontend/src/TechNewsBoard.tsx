import { useState } from 'react'
import {
  Cpu, Zap, Globe, Package, GitBranch, AlertTriangle,
  CheckCircle, ExternalLink, ChevronDown, ChevronUp,
  TrendingUp, Star, Clock, Layers, Database, RefreshCw,
  ArrowUpRight, Info, Shield, Settings, Sparkles, X, Wifi, WifiOff,
  Terminal, Copy, Download, BarChart2, FileText,
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
  scanFolder, pickFolder, isFolderPickerSupported,
} from './services/folderScanner'
import type { ScanProgress, FolderScanResult } from './services/folderScanner'
import { FIX_GUIDES } from './services/migrationGuide'

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
    latestVersion: '25', latestLabel: 'Java 25 LTS',
    releaseDate: '2025-09-16', status: 'lts',
    icon: Cpu,
    color: 'text-orange-600', bgColor: 'bg-orange-50', borderColor: 'border-orange-200', iconBg: 'bg-orange-100',
    quickVersions: ['8', '11', '17', '21', '25'], unitLabel: '예: 17',
    summary: 'Java 25가 2025년 9월 LTS 출시. 18개 JEP. 힙 최적화, 저지연 GC, Scoped Values 정식화.',
    link: 'https://openjdk.org/projects/jdk/25/',
    features: [
      { text: 'JEP 519 — Compact Object Headers: 객체 헤더 64→32bit, 힙 메모리 10~20% 절감', type: 'new', sinceVersion: '25' },
      { text: 'JEP 521 — Generational Shenandoah GC: 저지연·예측 가능한 응답시간 확보', type: 'new', sinceVersion: '25' },
      { text: 'JEP 506 — Scoped Values 정식화: ThreadLocal 대체, Virtual Thread 환경 안전한 값 공유', type: 'new', sinceVersion: '25' },
      { text: 'JEP 512 — Compact Source Files & Instance Main Methods: 보일러플레이트 없는 스크립트형 Java', type: 'improved', sinceVersion: '25' },
      { text: 'Post-Quantum 암호화: ML-KEM, ML-DSA 알고리즘 기본 내장', type: 'new', sinceVersion: '25' },
      { text: 'Virtual Threads (JEP 444) 정식화 — 21에서 안정화, 25에서 성능 개선', type: 'improved', sinceVersion: '22' },
      { text: 'Record Patterns + Pattern Matching for switch — 17 preview → 21 정식화', type: 'improved', sinceVersion: '21' },
      { text: 'sun.* internal API 제거 — 직접 참조 코드 수정 필요', type: 'breaking', sinceVersion: '9' },
      { text: 'finalize() 지원 종료 — Cleaner/PhantomReference로 교체 권장', type: 'breaking', sinceVersion: '18' },
    ],
  },
  {
    id: 'springboot', name: 'Spring Boot', category: 'backend',
    latestVersion: '4.0', latestLabel: '4.0.5',
    releaseDate: '2025-11-20', status: 'stable',
    icon: Zap,
    color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200', iconBg: 'bg-emerald-100',
    quickVersions: ['2.7', '3.0', '3.2', '3.3', '4.0'], unitLabel: '예: 3.3',
    summary: 'Spring Boot 4.0 GA 2025-11. Spring Framework 7 + Jakarta EE 11 기반. 4.1.0-M4 진행 중.',
    link: 'https://spring.io/blog/2025/11/20/spring-boot-4-0-0-available-now/',
    features: [
      { text: 'Spring Framework 7 + Jakarta EE 11 전환 (Servlet 6.1, JPA 3.2, Bean Validation 3.1)', type: 'breaking', sinceVersion: '4.0' },
      { text: 'Jackson 3 기본값 적용 — Jackson 2 deprecated, 직렬화 설정 전체 재검토 필요', type: 'breaking', sinceVersion: '4.0' },
      { text: 'QueryDSL: querydsl-jpa에 jakarta 분류자 사용 필수 (javax→jakarta 완전 이동)', type: 'breaking', sinceVersion: '4.0' },
      { text: 'First-class API Versioning: MVC/WebFlux에 버전별 라우팅, RestClient 버전 헤더 내장', type: 'new', sinceVersion: '4.0' },
      { text: 'spring-boot-starter-opentelemetry: OTLP 메트릭·트레이스 단일 스타터', type: 'new', sinceVersion: '4.0' },
      { text: 'HTTP Service Client 자동 설정: 인터페이스만 선언하면 구현체 자동 생성', type: 'new', sinceVersion: '4.0' },
      { text: 'javax.* → jakarta.* 전면 교체 (Spring Boot 3.0 때 이미 시작)', type: 'breaking', sinceVersion: '3.0' },
      { text: 'Spring Security 6 — WebSecurityConfigurerAdapter 완전 제거', type: 'breaking', sinceVersion: '3.0' },
      { text: 'Actuator /info, /health 기본 노출 변경 — application.properties 재설정 필요', type: 'tip', sinceVersion: '3.0' },
    ],
  },
  {
    id: 'react', name: 'React', category: 'frontend',
    latestVersion: '19', latestLabel: '19.2',
    releaseDate: '2025-10-01', status: 'latest',
    icon: Globe,
    color: 'text-cyan-600', bgColor: 'bg-cyan-50', borderColor: 'border-cyan-200', iconBg: 'bg-cyan-100',
    quickVersions: ['16', '17', '18', '19'], unitLabel: '예: 18',
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
      { text: 'Automatic Batching 기본 적용 — setTimeout·Promise 내부도 배치 처리', type: 'improved', sinceVersion: '18' },
    ],
  },
  {
    id: 'vite', name: 'Vite', category: 'tool',
    latestVersion: '6', latestLabel: '6.3',
    releaseDate: '2024-11-26', status: 'stable',
    icon: Package,
    color: 'text-violet-600', bgColor: 'bg-violet-50', borderColor: 'border-violet-200', iconBg: 'bg-violet-100',
    quickVersions: ['3', '4', '5', '6'], unitLabel: '예: 5',
    summary: 'Vite 6 출시(2024-11). 주간 다운로드 750만→1700만. Environment API 도입, SPA는 하위 호환.',
    link: 'https://vite.dev/blog/announcing-vite6',
    features: [
      { text: 'Environment API: dev/prod 환경을 독립 단위로 분리 — SSR·Edge 배포 시나리오 지원', type: 'new', sinceVersion: '6' },
      { text: 'ESM Module Federation: 마이크로 프론트엔드 빌드타임 공유 모듈 지원', type: 'new', sinceVersion: '6' },
      { text: 'SPA 단일 환경 사용 시 5→6 하위 호환 — vite.config.ts 변경 최소화', type: 'tip', sinceVersion: '6' },
      { text: 'Node.js 21 드롭 — 18/20/22+ 지원', type: 'improved', sinceVersion: '6' },
      { text: 'Rollup 4 기반으로 전환 (Vite 5) — 일부 plugin API 변경', type: 'breaking', sinceVersion: '5' },
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
    ],
  },
]

const COMPAT: CompatItem[] = [
  { name: 'Java 25 ↔ Spring Boot 4.0.5', compatible: 'ok', note: 'Spring Boot 4는 Java 17+ 요구. Java 25 완전 지원.', relatedIds: ['java', 'springboot'] },
  { name: 'QueryDSL 5.1 ↔ Spring Boot 4', compatible: 'warn', note: 'querydsl-jpa:5.1.0:jakarta 의존성 명시 필요.', relatedIds: ['querydsl', 'springboot'] },
  { name: 'MapStruct ↔ Lombok ↔ Records', compatible: 'warn', note: 'annotationProcessor 순서: Lombok → MapStruct 고정 필요.', relatedIds: ['java', 'springboot'] },
  { name: 'React 19.2 ↔ Zustand v5', compatible: 'ok', note: 'Zustand v5는 React 18+ 요구. React 19 완전 지원.', relatedIds: ['react', 'zustand'] },
  { name: 'React 19.2 ↔ React Query v5', compatible: 'ok', note: 'TanStack Query v5는 React 19 공식 지원.', relatedIds: ['react'] },
  { name: 'Vite 5 → 6 업그레이드', compatible: 'check', note: 'SPA는 하위 호환. vite.config.ts 환경 API 미사용 시 무변경.', relatedIds: ['vite'] },
  { name: 'Jackson 3 ↔ Spring Boot 4', compatible: 'warn', note: 'ObjectMapper 커스텀 Bean 및 Jackson 2 설정 전체 재검토.', relatedIds: ['springboot'] },
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

function StackCard({ item, currentVersion }: { item: StackItem; currentVersion: string }) {
  const [open, setOpen] = useState(false)
  const Icon = item.icon
  const hasInput = currentVersion.trim() !== ''
  const gap = hasInput ? versionGap(currentVersion, item.latestVersion) : null
  const affectedFeatures = hasInput ? item.features.filter(f => isAffected(currentVersion, f.sinceVersion)) : []
  const breakingAffected = affectedFeatures.filter(f => f.type === 'breaking').length

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
                <p className="text-[10px] text-gray-400 mt-0.5">버전 미입력</p>
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
            <p className={`text-2xl font-mono font-bold ${item.color}`}>{item.latestLabel}</p>
            <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
              <Clock size={9} /> {item.releaseDate}
            </p>
          </div>
          <a href={item.link} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-blue-600 transition-colors">
            릴리스 노트 <ExternalLink size={10} />
          </a>
        </div>

        <p className="text-xs text-gray-500 leading-relaxed">{item.summary}</p>
      </div>

      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 border-t border-gray-100
          text-xs text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-all rounded-b-2xl">
        <span>
          {hasInput && affectedFeatures.length > 0
            ? <span className="text-amber-600 font-medium">내 버전 관련 변경사항 {affectedFeatures.length}개</span>
            : `전체 변경사항 ${item.features.length}개`}
        </span>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {open && (
        <ul className="px-5 pb-4 pt-1 bg-gray-50 rounded-b-2xl">
          {(hasInput && affectedFeatures.length > 0 ? affectedFeatures : item.features)
            .map((f, i) => (
              <FeatureRow key={i} f={f}
                highlight={hasInput && f.type === 'breaking' && isAffected(currentVersion, f.sinceVersion)} />
            ))}
        </ul>
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

  function process(filename: string, content: string) {
    const r = parseConfigFile(filename, content)
    setResult(r)
    onParsed(r)
  }

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => process(file.name, e.target?.result as string)
    reader.readAsText(file)
  }

  function handlePaste() {
    if (!text.trim()) return
    process('unknown', text)
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
            <ExternalLink size={12} /> 파일 선택
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
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'package.json, build.gradle, pom.xml 내용을 붙여넣으세요...\n\n예시:\n{\n  "dependencies": {\n    "react": "^19.2.0",\n    "vite": "^6.3.0"\n  }\n}'}
            rows={8}
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-xs font-mono
              text-gray-700 placeholder-gray-300 focus:outline-none focus:border-blue-400
              focus:ring-2 focus:ring-blue-100 transition-all resize-y"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => { setText(''); setResult(null); setShowPaste(false) }}
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
  currentVersions, targetVersions,
  onCurrentChange, onTargetChange,
}: {
  currentVersions: Record<string, string>
  targetVersions: Record<string, string>
  onCurrentChange: (id: string, v: string) => void
  onTargetChange:  (id: string, v: string) => void
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {STACK.map(item => {
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
                <p className="text-[9px] font-semibold text-gray-400 mb-1">현재</p>
                <input
                  type="text"
                  value={cur}
                  onChange={e => onCurrentChange(item.id, e.target.value)}
                  placeholder={item.unitLabel}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5
                    text-xs text-gray-700 placeholder-gray-300 focus:outline-none focus:border-blue-400
                    focus:ring-2 focus:ring-blue-100 transition-all font-mono"
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

            {/* Quick versions: 현재 비어있으면 현재, 채워져 있으면 목표 */}
            <div className="flex flex-wrap gap-1">
              {item.quickVersions.map(v => {
                const isCur = cur === v
                const isTgt = tgt === v
                return (
                  <button
                    key={v}
                    onClick={() => {
                      if (!cur) {
                        onCurrentChange(item.id, v)
                      } else if (!tgt) {
                        onTargetChange(item.id, v)
                      } else {
                        onCurrentChange(item.id, v)
                      }
                    }}
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
              <div className="w-full bg-violet-100 rounded-full h-1.5 overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full animate-pulse w-full" />
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
// Main
// ─────────────────────────────────────────────
const TABS = ['전체', '백엔드', '프론트엔드', '툴체인'] as const
type Tab = typeof TABS[number]

export default function TechNewsBoard() {
  const [activeTab, setActiveTab]       = useState<Tab>('전체')
  const [inputOpen, setInputOpen]       = useState(true)
  const [currentVersions, setCurrentVersions] = useState<Record<string, string>>({})
  const [targetVersions,  setTargetVersions]  = useState<Record<string, string>>({})

  const { data: liveVersions, isLoading, isError, dataUpdatedAt, refetch, isFetching } = useLatestVersions()

  const enrichedStack = STACK.map(s => {
    const live: VersionInfo | undefined = liveVersions?.[s.id as StackId]
    if (!live) return s
    return {
      ...s,
      latestVersion: live.version.split('.')[0] + (live.version.includes('.') ? '.' + live.version.split('.')[1] : ''),
      latestLabel:   live.version,
      releaseDate:   live.publishedAt ? live.publishedAt.slice(0, 10) : s.releaseDate,
      link:          live.releaseUrl || s.link,
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

  const hasCurrentInput = Object.values(currentVersions).some(v => v.trim() !== '')
  const hasTargetInput  = Object.values(targetVersions).some(v => v.trim() !== '')
  const inputCount = Object.values(currentVersions).filter(v => v.trim()).length

  const filtered = enrichedStack.filter(s => {
    if (activeTab === '전체')    return true
    if (activeTab === '백엔드')  return s.category === 'backend'
    if (activeTab === '프론트엔드') return s.category === 'frontend'
    if (activeTab === '툴체인')  return s.category === 'tool'
    return true
  })

  const allBreaking = enrichedStack.flatMap(s => s.features).filter(f => f.type === 'breaking').length
  const allNew      = enrichedStack.flatMap(s => s.features).filter(f => f.type === 'new').length

  const myBreaking = hasCurrentInput
    ? enrichedStack.flatMap(s =>
        s.features.filter(f => f.type === 'breaking' && currentVersions[s.id] && isAffected(currentVersions[s.id], f.sinceVersion))
      ).length
    : null

  const upgradable = hasCurrentInput
    ? enrichedStack.filter(s => currentVersions[s.id]?.trim() && versionGap(currentVersions[s.id], s.latestVersion) !== 'up-to-date').length
    : 2

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-5">

      {/* Header */}
      <header className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-full tracking-widest">
            HUBILON GROUPWARE
          </span>
          <div className="ml-auto flex items-center gap-2">
            {isLoading && (
              <span className="flex items-center gap-1 text-[10px] text-blue-500 animate-pulse">
                <RefreshCw size={10} className="animate-spin" /> 최신 버전 조회 중...
              </span>
            )}
            {isError && (
              <span className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                <WifiOff size={10} /> API 오류 — 캐시 데이터 사용 중
              </span>
            )}
            {!isLoading && !isError && lastUpdated && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                <Wifi size={10} /> 실시간 · {lastUpdated} 기준
              </span>
            )}
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-blue-600 transition-colors px-2 py-1 rounded-lg hover:bg-blue-50 disabled:opacity-40"
            >
              <RefreshCw size={10} className={isFetching ? 'animate-spin' : ''} /> 새로고침
            </button>
          </div>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <TrendingUp size={22} className="text-blue-600" />
          Tech Stack 최신 업데이트
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Java 25 · Spring Boot 4 · React 19 · Vite 6 — 버전 입력 시 맞춤 권장사항 및 마이그레이션 분석 제공
        </p>
      </header>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: '추적 중인 기술', value: STACK.length, icon: Layers, color: 'text-blue-600', bg: 'bg-white border-blue-100', num: 'text-blue-600' },
          { label: '신규 기능',      value: allNew,        icon: Star,   color: 'text-emerald-600', bg: 'bg-white border-emerald-100', num: 'text-emerald-600' },
          {
            label: myBreaking !== null ? '내 버전 Breaking' : '전체 Breaking',
            value: myBreaking !== null ? myBreaking : allBreaking,
            icon: AlertTriangle,
            color: (myBreaking ?? 0) > 0 ? 'text-red-600' : 'text-gray-400',
            bg: (myBreaking ?? 0) > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200',
            num: (myBreaking ?? 0) > 0 ? 'text-red-600' : 'text-gray-400',
          },
          { label: hasCurrentInput ? '업그레이드 대상' : '업그레이드 권장', value: upgradable, icon: ArrowUpRight, color: 'text-amber-600', bg: 'bg-white border-amber-100', num: 'text-amber-600' },
        ].map(({ label, value, icon: Icon, color, bg, num }) => (
          <div key={label} className={`rounded-2xl border ${bg} p-4 flex items-center gap-3 shadow-sm transition-all hover:shadow-md`}>
            <div className="p-2 rounded-xl bg-gray-50">
              <Icon size={18} className={color} />
            </div>
            <div>
              <p className={`text-2xl font-bold ${num}`}>{value}</p>
              <p className="text-[11px] text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 내 스택 입력 패널 */}
      <section className="mb-6 rounded-2xl border border-blue-200 bg-white shadow-sm">
        <button
          onClick={() => setInputOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-blue-50 rounded-2xl transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-100">
              <Settings size={14} className="text-blue-600" />
            </div>
            <span className="text-sm font-bold text-gray-800">내 스택 버전 입력</span>
            <span className="text-xs text-gray-400 hidden sm:block">— 현재/목표 버전 입력으로 마이그레이션 분석</span>
            {hasCurrentInput && (
              <span className="text-[10px] bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-semibold">
                {inputCount}개 입력됨
              </span>
            )}
            {hasTargetInput && (
              <span className="text-[10px] bg-violet-100 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full font-semibold">
                마이그레이션 목표 설정
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(hasCurrentInput || hasTargetInput) && (
              <button onClick={e => { e.stopPropagation(); clearAll() }}
                className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50">
                <X size={10} /> 초기화
              </button>
            )}
            {inputOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
          </div>
        </button>

        {inputOpen && (
          <div className="px-5 pb-5 border-t border-gray-100">
            {/* 파일 파서 */}
            <div className="mt-4 mb-4">
              <p className="text-[11px] font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
                <Package size={11} /> 설정 파일에서 현재 버전 자동 추출
              </p>
              <ConfigDropZone onParsed={handleParsed} />
            </div>

            {/* 구분선 */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-[11px] text-gray-400">또는 직접 입력</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            {/* Dual-column stack input */}
            <p className="text-[11px] text-gray-400 mb-2">
              <span className="text-blue-600 font-semibold">현재</span> — 지금 사용 중인 버전 &nbsp;|&nbsp;
              <span className="text-violet-600 font-semibold">목표</span> — 마이그레이션할 목표 버전 (입력 시 범위 분석 활성화)
            </p>
            <StackInputPanel
              currentVersions={currentVersions}
              targetVersions={targetVersions}
              onCurrentChange={setCurrent}
              onTargetChange={setTarget}
            />
          </div>
        )}
      </section>

      {/* 맞춤 권장사항 (current → latest) */}
      <section className="mb-7">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
          <Sparkles size={12} className="text-blue-500" /> 맞춤 권장사항 — 현재 버전 기준 최신 비교
        </h2>
        <RecommendSection versions={currentVersions} stack={enrichedStack} />
      </section>

      {/* 마이그레이션 분석 (current → target range) */}
      <section className="mb-7">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
          <GitBranch size={12} className="text-violet-500" /> 마이그레이션 분석 — 목표 버전 범위
        </h2>
        <MigrationSection
          currentVersions={currentVersions}
          targetVersions={targetVersions}
          stack={enrichedStack}
        />
      </section>

      {/* Tabs + Cards */}
      <div className="flex gap-1.5 mb-4 bg-white p-1 rounded-xl w-fit border border-gray-200 shadow-sm">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200
              ${activeTab === tab
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}>
            {tab}
          </button>
        ))}
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        {filtered.map(item => (
          <StackCard key={item.id} item={item} currentVersion={currentVersions[item.id] ?? ''} />
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
            <p className="text-xs text-gray-400 mb-4">React 19 + Vite 6 전환 시 확인 항목</p>
            {COMPAT.filter((_, i) => i >= 4).map(item => <CompatRow key={item.name} item={item} />)}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="pt-5 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-400">
        <span className="font-medium text-gray-500">Hubilon Tech News Board</span>
        <div className="flex items-center gap-3">
          <span>Java 25 LTS</span><span>·</span>
          <span>Spring Boot 4.0.5</span><span>·</span>
          <span>React 19.2</span><span>·</span>
          <span>Vite 6</span><span>·</span>
          <span>Zustand v5</span>
        </div>
      </footer>
    </div>
  )
}

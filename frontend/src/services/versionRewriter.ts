// ──────────────────────────────────────────────────────────
// 설정 파일 버전 자동 수정
//   package.json / build.gradle / build.gradle.kts
//   pom.xml / gradle.properties
// ──────────────────────────────────────────────────────────

import { parseConfigFile } from './configParser'
import type { ParsedVersions } from './configParser'
import { LINE_TRANSFORMS } from './migrationGuide'

// ── 스택 키 → npm 패키지 매핑 ────────────────────────────

const STACK_TO_NPM: Record<string, string[]> = {
  react:   ['react', 'react-dom', '@types/react', '@types/react-dom'],
  vite:    ['vite', '@vitejs/plugin-react', '@vitejs/plugin-react-swc'],
  zustand: ['zustand'],
}

// ── 버전 포맷 헬퍼 ────────────────────────────────────────

// target 의 세분화 수준에서만 비교 ("18" → major만, "18.2" → major.minor만)
// "^18.3.0" vs "18"  → false (같은 major → 변경 없음)
// "^17.0.0" vs "18"  → true  (major 다름 → 변경 필요)
// "18.2.0"  vs "18.3"→ true  (minor 다름 → 변경 필요)
function versionsDiffer(current: string, target: string): boolean {
  const cur = current.replace(/[^\d.]/g, '').split('.')
  const tgt = target.replace(/[^\d.]/g, '').split('.')
  for (let i = 0; i < tgt.length; i++) {
    if ((cur[i] ?? '0') !== tgt[i]) return true
  }
  return false
}

function toNpmRange(target: string): string {
  // "19" → "^19.0.0" / "19.2" → "^19.2.0" / "19.2.1" → "^19.2.1"
  const clean = target.replace(/[^0-9.]/g, '')
  const parts = clean.split('.')
  while (parts.length < 3) parts.push('0')
  return `^${parts.slice(0, 3).join('.')}`
}

function toFullVersion(target: string): string {
  // "4.0" → "4.0.0" / "4.0.5" → "4.0.5" / "25" → "25.0.0"
  const clean = target.replace(/[^0-9.]/g, '')
  const parts = clean.split('.')
  while (parts.length < 3) parts.push('0')
  return parts.slice(0, 3).join('.')
}

// ── package.json ─────────────────────────────────────────

function rewritePackageJson(content: string, targets: ParsedVersions): string {
  let parsed: Record<string, unknown>
  try { parsed = JSON.parse(content) } catch { return content }

  const deps    = { ...(parsed.dependencies    as Record<string, string> ?? {}) }
  const devDeps = { ...(parsed.devDependencies as Record<string, string> ?? {}) }

  let changed = false
  for (const [stackKey, pkgs] of Object.entries(STACK_TO_NPM)) {
    const target = targets[stackKey as keyof ParsedVersions]
    if (!target) continue
    const newVer = toNpmRange(target)
    for (const pkg of pkgs) {
      // 기존 버전이 target의 세분화 수준에서 이미 일치하면 덮어쓰지 않음
      // (예: "^18.3.0" vs target "18" → major 동일 → 변경 안 함)
      if (pkg in deps && versionsDiffer(deps[pkg], target))    { deps[pkg]    = newVer; changed = true }
      if (pkg in devDeps && versionsDiffer(devDeps[pkg], target)) { devDeps[pkg] = newVer; changed = true }
    }
  }

  if (!changed) return content

  const result = { ...parsed }
  if (Object.keys(deps).length)    result.dependencies    = deps
  if (Object.keys(devDeps).length) result.devDependencies = devDeps

  return JSON.stringify(result, null, 2) + '\n'
}

// ── build.gradle / build.gradle.kts ─────────────────────

function rewriteGradle(content: string, targets: ParsedVersions): string {
  let out = content

  if (targets.springboot) {
    const ver = toFullVersion(targets.springboot)
    // id '...' version 'x.y.z'  또는  id("...") version "x.y.z"
    out = out.replace(
      /(id\s*[\('"]*org\.springframework\.boot[\)'"]*\s+version\s+)["'][^"']+["']/,
      `$1"${ver}"`,
    )
    // ext.springBootVersion = '...'
    out = out.replace(
      /(springBootVersion\s*[=:]\s*)["'][^"']+["']/g,
      `$1"${ver}"`,
    )
  }

  if (targets.java) {
    const jv = targets.java.replace(/[^0-9]/g, '')
    out = out.replace(/JavaVersion\.VERSION_\d+/g, `JavaVersion.VERSION_${jv}`)
    out = out.replace(/((?:source|target|java)Compatibility\s*=\s*)["'][\d.]+["']/g, `$1"${jv}"`)
    out = out.replace(/((?:source|target|java)Compatibility\s*=\s*)[\d.]+(?!\S)/g,   `$1${jv}`)
    out = out.replace(/(JavaLanguageVersion\.of\()\d+(\))/g, `$1${jv}$2`)
    out = out.replace(/(jvmToolchain\()\d+(\))/g, `$1${jv}$2`)
  }

  return out
}

// ── pom.xml ───────────────────────────────────────────────

function rewritePomXml(content: string, targets: ParsedVersions): string {
  let out = content

  if (targets.springboot) {
    const ver = toFullVersion(targets.springboot)
    // Spring Boot parent block version
    out = out.replace(
      /(<parent>[\s\S]*?<groupId>[^<]*springframework[^<]*<\/groupId>[\s\S]*?<version>)[^<]+(<\/version>[\s\S]*?<\/parent>)/,
      `$1${ver}$2`,
    )
  }

  if (targets.java) {
    const jv = targets.java.replace(/[^0-9]/g, '')
    out = out.replace(/(<java\.version>)[^<]+(<\/java\.version>)/g,                `$1${jv}$2`)
    out = out.replace(/(<maven\.compiler\.source>)[^<]+(<\/maven\.compiler\.source>)/g, `$1${jv}$2`)
    out = out.replace(/(<maven\.compiler\.target>)[^<]+(<\/maven\.compiler\.target>)/g, `$1${jv}$2`)
  }

  return out
}

// ── gradle.properties ────────────────────────────────────

function rewriteGradleProperties(content: string, targets: ParsedVersions): string {
  let out = content

  if (targets.springboot) {
    const ver = toFullVersion(targets.springboot)
    out = out.replace(/(springBootVersion\s*=\s*).+/g,  `$1${ver}`)
    out = out.replace(/(spring_boot_version\s*=\s*).+/g, `$1${ver}`)
  }

  if (targets.java) {
    const jv = targets.java.replace(/[^0-9]/g, '')
    out = out.replace(/(javaVersion\s*=\s*).+/g,         `$1${jv}`)
    out = out.replace(/(sourceCompatibility\s*=\s*).+/g, `$1${jv}`)
    out = out.replace(/(targetCompatibility\s*=\s*).+/g, `$1${jv}`)
  }

  return out
}

// ── 공개 API ─────────────────────────────────────────────

export function rewriteConfig(
  filename: string,
  content: string,
  targets: ParsedVersions,
): string | null {
  const name = filename.toLowerCase()
  if (name === 'package.json')       return rewritePackageJson(content, targets)
  if (name === 'build.gradle')       return rewriteGradle(content, targets)
  if (name === 'build.gradle.kts')   return rewriteGradle(content, targets)
  if (name === 'pom.xml')            return rewritePomXml(content, targets)
  if (name === 'gradle.properties')  return rewriteGradleProperties(content, targets)
  return null
}

// ── 소스 파일 자동 변환 ───────────────────────────────────

const JAVA_TRANSFORM_KEYS  = ['javax_imports', 'jackson_objectmapper'] as const
const TS_TRANSFORM_KEYS    = ['zustand_default_import', 'react_dom_render'] as const

export interface SourceChangeSummary {
  linesChanged: number
}

export function rewriteSourceFile(
  filename: string,
  content: string,
): string | null {
  const lower = filename.toLowerCase()
  let keys: readonly string[]

  if (lower.endsWith('.java') || lower.endsWith('.kt'))           keys = JAVA_TRANSFORM_KEYS
  else if (lower.endsWith('.ts') || lower.endsWith('.tsx') ||
           lower.endsWith('.js') || lower.endsWith('.jsx'))       keys = TS_TRANSFORM_KEYS
  else return null

  const lines = content.split('\n')
  let changed = false
  const newLines = lines.map(line => {
    for (const key of keys) {
      const fn = LINE_TRANSFORMS[key as keyof typeof LINE_TRANSFORMS]
      if (!fn) continue
      const result = fn(line)
      if (result !== null && result !== line) {
        changed = true
        return result
      }
    }
    return line
  })

  return changed ? newLines.join('\n') : null
}

// ── 변경 요약 생성 ────────────────────────────────────────

export interface ChangeSummary {
  key: string
  label: string
  before: string
  after: string
}

const STACK_LABEL: Record<string, string> = {
  java: 'Java', springboot: 'Spring Boot',
  react: 'React', vite: 'Vite', zustand: 'Zustand', querydsl: 'QueryDSL',
}

export function getChangeSummary(
  filename: string,
  content: string,
  targets: ParsedVersions,
): ChangeSummary[] {
  const { versions: current } = parseConfigFile(filename, content)
  const changes: ChangeSummary[] = []

  for (const [key, target] of Object.entries(targets) as [keyof ParsedVersions, string][]) {
    if (!target) continue
    const before = current[key]
    if (before && versionsDiffer(before, target)) {
      changes.push({ key, label: STACK_LABEL[key] ?? key, before, after: target })
    }
  }

  return changes
}

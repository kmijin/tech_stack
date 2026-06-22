// ──────────────────────────────────────────────────────────
// 설정 파일 파서 — package.json / build.gradle / pom.xml
// ──────────────────────────────────────────────────────────

export type ParsedVersions = Partial<Record<
  'java' | 'springboot' | 'react' | 'vite' | 'zustand' | 'querydsl',
  string
>>

export type FileType =
  | 'package.json'
  | 'build.gradle'
  | 'build.gradle.kts'
  | 'pom.xml'
  | 'gradle.properties'
  | 'unknown'

export interface ParseResult {
  fileType: FileType
  versions: ParsedVersions
  // 어디서 어떻게 추출했는지 근거 (디버그용 표시)
  evidence: { key: string; raw: string; extracted: string }[]
  warnings: string[]
}

// ── 파일 타입 감지 ────────────────────────────────────────
export function detectFileType(filename: string, content: string): FileType {
  const name = filename.toLowerCase()
  if (name === 'package.json' || name.endsWith('/package.json')) return 'package.json'
  if (name === 'build.gradle.kts') return 'build.gradle.kts'
  if (name === 'build.gradle') return 'build.gradle'
  if (name === 'pom.xml') return 'pom.xml'
  if (name === 'gradle.properties') return 'gradle.properties'

  // 내용으로 추론
  if (content.trim().startsWith('{') && content.includes('"dependencies"')) return 'package.json'
  if (content.includes('<project') && content.includes('xmlns')) return 'pom.xml'
  if (content.includes('org.springframework.boot') && content.includes('kotlin')) return 'build.gradle.kts'
  if (content.includes('org.springframework.boot') || content.includes('implementation')) return 'build.gradle'
  return 'unknown'
}

// ── 버전 문자열 정규화 ────────────────────────────────────
function cleanVersion(v: string): string {
  // "^19.2.0" → "19.2", "~4.0.5" → "4.0", "VERSION_25" → "25"
  return v
    .replace(/[\^~>=<]/g, '')
    .replace(/^VERSION_/i, '')
    .replace(/^\d+\.\d+\.\d+$/, m => m.split('.').slice(0, 2).join('.'))
    .trim()
}

// ── 의존성 호환성 어드바이저리 ────────────────────────────────
const DEP_RULES: Record<string, { label: string; check: (v: string) => string | null }> = {
  'lombok': {
    label: 'Lombok',
    check: (v) => {
      const [, minor, patch] = v.split('.').map(Number)
      if (minor === 18 && patch < 36)
        return `Lombok ${v} — Java 21+ 컴파일러 내부 API 변경으로 빌드 오류 가능. 1.18.36 이상 권장`
      return null
    },
  },
  'jjwt-api': {
    label: 'jjwt',
    check: (v) => {
      if (v.startsWith('0.10') || v.startsWith('0.11'))
        return `jjwt ${v} — 구버전. Java 17+ 리플렉션 강화로 런타임 오류 가능. 0.12.x 이상 권장`
      return null
    },
  },
  'firebase-admin': {
    label: 'Firebase Admin',
    check: (v) => {
      if (parseInt(v) < 9)
        return `firebase-admin ${v} — 9.x 미만은 Java 21+ 호환성 미보장. 9.x 이상 권장`
      return null
    },
  },
  'mysql-connector-j': {
    label: 'MySQL Connector/J',
    check: (v) => {
      if (parseInt(v) < 8)
        return `mysql-connector-j ${v} — 8.x 미만은 Java 21+ 에서 TLS 핸드셰이크 오류 가능. 8.x 이상 권장`
      return null
    },
  },
}

// Gradle 의존성 버전 추출 (short form / long form 모두 처리)
function extractGradleDeps(content: string): Record<string, string> {
  const deps: Record<string, string> = {}
  let m: RegExpExecArray | null

  // 'group:artifact:version'
  const shortRe = /['"][^'"]*:([\w.-]+):([0-9][^'"]*)['"]/g
  while ((m = shortRe.exec(content)) !== null)
    deps[m[1].toLowerCase()] = m[2].trim()

  // name: 'artifact', ..., version: 'x' (같은 행)
  const longRe = /name\s*:\s*['"]([^'"]+)['"]\s*,\s*version\s*:\s*['"]([^'"]+)['"]/g
  while ((m = longRe.exec(content)) !== null)
    deps[m[1].toLowerCase()] = m[2].trim()

  // version: 'x', ..., name: 'artifact'
  const longRe2 = /version\s*:\s*['"]([^'"]+)['"]\s*,\s*name\s*:\s*['"]([^'"]+)['"]/g
  while ((m = longRe2.exec(content)) !== null)
    deps[m[2].toLowerCase()] = m[1].trim()

  return deps
}

function checkGradleAdvisories(content: string): string[] {
  const deps = extractGradleDeps(content)
  const warnings: string[] = []
  for (const [artifact, rule] of Object.entries(DEP_RULES)) {
    const ver = deps[artifact.toLowerCase()]
    if (ver) {
      const w = rule.check(ver)
      if (w) warnings.push(w)
    }
  }
  return warnings
}

function checkPomAdvisories(doc: Document): string[] {
  const warnings: string[] = []
  const depEls = [...doc.getElementsByTagName('dependency')]
  for (const dep of depEls) {
    const artifactId = dep.getElementsByTagName('artifactId')[0]?.textContent?.trim() ?? ''
    const version    = dep.getElementsByTagName('version')[0]?.textContent?.trim() ?? ''
    if (!version || version.startsWith('$')) continue
    const rule = DEP_RULES[artifactId.toLowerCase()]
    if (rule) {
      const w = rule.check(version)
      if (w) warnings.push(w)
    }
  }
  return warnings
}

// ── package.json 파서 ──────────────────────────────────────
function parsePackageJson(content: string): ParseResult {
  const evidence: ParseResult['evidence'] = []
  const warnings: string[] = []
  const versions: ParsedVersions = {}

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(content)
  } catch {
    return { fileType: 'package.json', versions, evidence, warnings: ['JSON 파싱 실패'] }
  }

  const deps: Record<string, string> = {
    ...(parsed.dependencies as Record<string, string> ?? {}),
    ...(parsed.devDependencies as Record<string, string> ?? {}),
  }

  const map: [string, string, keyof ParsedVersions][] = [
    ['react',     'react',   'react'],
    ['react-dom', 'react',   'react'],
    ['vite',      'vite',    'vite'],
    ['zustand',   'zustand', 'zustand'],
  ]

  for (const [pkg, label, key] of map) {
    if (deps[pkg] && !versions[key]) {
      const v = cleanVersion(deps[pkg])
      versions[key] = v
      evidence.push({ key: label, raw: deps[pkg], extracted: v })
    }
  }

  // engines.node → 참고용
  const engines = parsed.engines as Record<string, string> | undefined
  if (engines?.node) {
    warnings.push(`Node.js 요구사항: ${engines.node}`)
  }

  return { fileType: 'package.json', versions, evidence, warnings }
}

// ── build.gradle / build.gradle.kts 파서 ─────────────────
function parseGradle(content: string, kts: boolean): ParseResult {
  const evidence: ParseResult['evidence'] = []
  const warnings: string[] = []
  const versions: ParsedVersions = {}

  // Spring Boot 플러그인 버전
  // id 'org.springframework.boot' version '4.0.5'
  // id("org.springframework.boot") version "4.0.5"
  const sbMatch = content.match(
    /id\s*[\(']org\.springframework\.boot[\)']\s+version\s+["']([^"']+)["']/
  )
  if (sbMatch) {
    const v = cleanVersion(sbMatch[1])
    versions.springboot = v
    evidence.push({ key: 'Spring Boot plugin', raw: sbMatch[0], extracted: v })
  }

  // Java 버전
  // sourceCompatibility = JavaVersion.VERSION_25
  // sourceCompatibility = '25'
  // java { toolchain { languageVersion = JavaLanguageVersion.of(25) } }
  const javaMatch =
    content.match(/JavaVersion\.VERSION_(\d+)/) ??
    content.match(/(?:source|target|java)Compatibility\s*=\s*["']([\d.]+)["']/) ??
    content.match(/(?:source|target|java)Compatibility\s*=\s*([\d.]+)/) ??
    content.match(/JavaLanguageVersion\.of\((\d+)\)/) ??
    content.match(/jvmToolchain\((\d+)\)/)
  if (javaMatch) {
    versions.java = javaMatch[1]
    evidence.push({ key: 'Java version', raw: javaMatch[0], extracted: javaMatch[1] })
  }

  // QueryDSL 버전
  // implementation 'com.querydsl:querydsl-jpa:5.1.0:jakarta'
  const qdslMatch = content.match(/querydsl[^"'\s]*:([0-9]+\.[0-9]+\.[0-9]+)/)
  if (qdslMatch) {
    const v = cleanVersion(qdslMatch[1])
    versions.querydsl = v
    evidence.push({ key: 'QueryDSL', raw: qdslMatch[0], extracted: v })
  }

  // ext / gradle.properties 인라인 변수
  // springBootVersion = "4.0.5"
  if (!versions.springboot) {
    const extMatch = content.match(/springBootVersion\s*[=:]\s*["']([^"']+)["']/)
    if (extMatch) {
      const v = cleanVersion(extMatch[1])
      versions.springboot = v
      evidence.push({ key: 'springBootVersion var', raw: extMatch[0], extracted: v })
    }
  }

  if (!kts && content.includes('kotlin')) {
    warnings.push('Kotlin DSL이 섞인 Groovy 파일로 보입니다. .kts 파일을 붙여넣으세요.')
  }

  warnings.push(...checkGradleAdvisories(content))

  return { fileType: kts ? 'build.gradle.kts' : 'build.gradle', versions, evidence, warnings }
}

// ── pom.xml 파서 ──────────────────────────────────────────
function parsePomXml(content: string): ParseResult {
  const evidence: ParseResult['evidence'] = []
  const warnings: string[] = []
  const versions: ParsedVersions = {}

  let doc: Document
  try {
    doc = new DOMParser().parseFromString(content, 'application/xml')
    if (doc.querySelector('parsererror')) throw new Error('XML parse error')
  } catch {
    return { fileType: 'pom.xml', versions, evidence, warnings: ['XML 파싱 실패'] }
  }

  // xmlns 네임스페이스가 있으면 querySelector가 동작하지 않으므로
  // getElementsByTagName 사용 (네임스페이스 무관하게 로컬명으로 검색)
  const byTag = (tag: string): Element | null =>
    doc.getElementsByTagName(tag)[0] ?? null

  const childText = (parent: Element | null, tag: string): string =>
    parent?.getElementsByTagName(tag)[0]?.textContent?.trim() ?? ''

  // Spring Boot parent version
  const parentEl = byTag('parent')
  const parentGroupId = childText(parentEl, 'groupId')
  if (parentGroupId.includes('springframework')) {
    const parentVer = childText(parentEl, 'version')
    if (parentVer) {
      const v = cleanVersion(parentVer)
      versions.springboot = v
      evidence.push({ key: 'spring-boot parent', raw: parentVer, extracted: v })
    }
  }

  // properties — getElementsByTagName으로 dot 포함 태그명도 정확히 검색
  const propertiesEl = byTag('properties')
  const getText = (tag: string): string => childText(propertiesEl, tag)

  const javaVersion = getText('java.version') || getText('maven.compiler.source')
  if (javaVersion) {
    const v = cleanVersion(javaVersion)
    versions.java = v
    evidence.push({ key: 'java.version property', raw: javaVersion, extracted: v })
  }

  // Spring Boot dependency (spring-boot-starter-parent 아닌 경우)
  if (!versions.springboot) {
    const deps = [...doc.getElementsByTagName('dependency')]
    const sbDep = deps.find(
      d => d.getElementsByTagName('artifactId')[0]?.textContent?.startsWith('spring-boot')
    )
    if (sbDep) {
      const ver = sbDep.getElementsByTagName('version')[0]?.textContent?.trim() ?? ''
      if (ver) {
        const v = cleanVersion(ver)
        versions.springboot = v
        evidence.push({ key: 'spring-boot dependency', raw: ver, extracted: v })
      }
    }
  }

  // QueryDSL — 먼저 <properties>에서 버전 탐색 (${...} 참조 없이 실제 값)
  const qdslPropVer = getText('querydsl.version') || getText('querydslVersion') || getText('querydsl_version')
  if (qdslPropVer) {
    const v = cleanVersion(qdslPropVer)
    versions.querydsl = v
    evidence.push({ key: 'querydsl.version property', raw: qdslPropVer, extracted: v })
  } else {
    // 직접 의존성에서 탐색
    const deps = [...doc.getElementsByTagName('dependency')]
    const qdslDep = deps.find(
      d => d.getElementsByTagName('groupId')[0]?.textContent === 'com.querydsl'
    )
    if (qdslDep) {
      let ver = qdslDep.getElementsByTagName('version')[0]?.textContent?.trim() ?? ''
      // Maven 프로퍼티 참조 (${querydsl.version}) → <properties>에서 resolve
      const propRef = ver.match(/^\$\{([^}]+)\}$/)
      if (propRef) ver = getText(propRef[1]) || ''
      if (ver && !ver.startsWith('${')) {
        const v = cleanVersion(ver)
        versions.querydsl = v
        evidence.push({ key: 'querydsl dependency', raw: ver, extracted: v })
      }
    }
  }

  if (parentGroupId && !parentGroupId.includes('springframework')) {
    warnings.push(`다른 parent (${parentGroupId}) 사용 중 — Spring Boot 버전이 간접 포함될 수 있습니다.`)
  }

  warnings.push(...checkPomAdvisories(doc))

  return { fileType: 'pom.xml', versions, evidence, warnings }
}

// ── gradle.properties 파서 ───────────────────────────────
function parseGradleProperties(content: string): ParseResult {
  const evidence: ParseResult['evidence'] = []
  const warnings: string[] = []
  const versions: ParsedVersions = {}

  // key=value 형식으로 파싱 (주석 제외)
  const props: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    props[key] = val
  }

  // Spring Boot 버전 관련 키
  const sbKeys = ['springBootVersion', 'spring_boot_version', 'springboot.version', 'spring.boot.version']
  for (const k of sbKeys) {
    if (props[k]) {
      const v = cleanVersion(props[k])
      versions.springboot = v
      evidence.push({ key: k, raw: props[k], extracted: v })
      break
    }
  }

  // Java 버전 관련 키
  const javaKeys = ['javaVersion', 'java_version', 'java.version', 'sourceCompatibility', 'targetCompatibility']
  for (const k of javaKeys) {
    if (props[k]) {
      const v = cleanVersion(props[k])
      versions.java = v
      evidence.push({ key: k, raw: props[k], extracted: v })
      break
    }
  }

  // QueryDSL 버전 관련 키
  const qdslKeys = ['querydslVersion', 'querydsl_version', 'querydsl.version']
  for (const k of qdslKeys) {
    if (props[k]) {
      const v = cleanVersion(props[k])
      versions.querydsl = v
      evidence.push({ key: k, raw: props[k], extracted: v })
      break
    }
  }

  if (Object.keys(versions).length === 0) {
    warnings.push('버전 관련 프로퍼티를 찾지 못했습니다. springBootVersion, javaVersion 등의 키를 확인하세요.')
  }

  return { fileType: 'gradle.properties', versions, evidence, warnings }
}

// ── 메인 파서 ─────────────────────────────────────────────
export function parseConfigFile(filename: string, content: string): ParseResult {
  const fileType = detectFileType(filename, content)
  switch (fileType) {
    case 'package.json':        return parsePackageJson(content)
    case 'build.gradle':        return parseGradle(content, false)
    case 'build.gradle.kts':    return parseGradle(content, true)
    case 'pom.xml':             return parsePomXml(content)
    case 'gradle.properties':   return parseGradleProperties(content)
    default:
      return {
        fileType: 'unknown',
        versions: {},
        evidence: [],
        warnings: ['지원하지 않는 파일 형식입니다. package.json / build.gradle / gradle.properties / pom.xml 을 사용해주세요.'],
      }
  }
}

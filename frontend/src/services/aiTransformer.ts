// ──────────────────────────────────────────────────────────
// Claude API를 이용한 소스 파일 마이그레이션 자동 변환
//
// Haiku  — 패턴 위치 ±25줄 청크 단위 처리 (빠름·저렴)
// Sonnet — 파일 전체 전송, 풍부한 컨텍스트 (정확·느림)
// ──────────────────────────────────────────────────────────

const CONTEXT_LINES = 25  // Haiku 청크: 패턴 중심 ±25줄

// ── 에러 타입 ────────────────────────────────────────────

export const AI_ERROR_CODE = {
  HAIKU_TOO_LARGE:  'HAIKU_TOO_LARGE',   // Haiku 청크도 잘림 → Sonnet 전환 권장
  SONNET_TOO_LARGE: 'SONNET_TOO_LARGE',  // Sonnet도 잘림 → 수동 필요
  API_ERROR:        'API_ERROR',         // API 호출 오류
} as const

export type AiErrorCode = typeof AI_ERROR_CODE[keyof typeof AI_ERROR_CODE]

export class AiTransformError extends Error {
  constructor(public code: AiErrorCode, message: string) {
    super(message)
    this.name = 'AiTransformError'
  }
}

// ── 복잡한 패턴 목록 ──────────────────────────────────────

const COMPLEX_PATTERNS: { regex: RegExp; description: string }[] = [
  { regex: /WebSecurityConfigurerAdapter/,          description: 'WebSecurityConfigurerAdapter → SecurityFilterChain' },
  { regex: /protected void configure\(HttpSecurity/, description: 'Spring Security configure 메서드' },
  { regex: /\bfinalize\s*\(\s*\)/,                  description: 'finalize() → Cleaner/AutoCloseable' },
  { regex: /new\s+ThreadLocal\s*[<(]/,              description: 'ThreadLocal → ScopedValue (Virtual Thread 환경)' },
  { regex: /new\s+ObjectMapper\s*\(\s*\)/,          description: 'new ObjectMapper() → @Autowired 주입' },
  { regex: /import\s+sun\./,                        description: 'sun.* internal API → 표준 Java API' },
  { regex: /JPAQueryFactory/,                       description: 'JPAQueryFactory jakarta 패키지' },
  { regex: /ReactDOM\.render\s*\(/,                 description: 'ReactDOM.render → createRoot' },
  { regex: /extends\s+Component\s*[<{]/,            description: 'Class 컴포넌트 → 함수형' },
]

export interface ComplexPattern {
  description: string
  line: number
  snippet: string
}

/** 파일에서 복잡한 패턴 감지 — 줄 번호 및 코드 스니펫 포함 */
export function detectComplexPatterns(content: string): ComplexPattern[] {
  const lines = content.split('\n')
  const results: ComplexPattern[] = []
  const seen = new Set<string>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const p of COMPLEX_PATTERNS) {
      if (seen.has(p.description)) continue
      const r = new RegExp(p.regex.source, p.regex.flags)
      if (r.test(line)) {
        seen.add(p.description)
        results.push({ description: p.description, line: i + 1, snippet: line.trim() })
      }
    }
  }

  return results
}

// ── 공통 지시사항 생성 ────────────────────────────────────

function buildInstructions(
  filename: string,
  fromVersions: Record<string, string>,
  toVersions: Record<string, string>,
  patterns: ComplexPattern[],
): string {
  const isJava = /\.(java|kt)$/.test(filename)
  const isTs   = /\.(ts|tsx|js|jsx)$/.test(filename)
  const lines: string[] = []

  const sbFrom    = parseFloat(fromVersions.springboot ?? '0')
  const sbTo      = parseFloat(toVersions.springboot   ?? '0')
  const jFrom     = parseFloat((fromVersions.java ?? '0').replace('1.', ''))
  const jTo       = parseFloat((toVersions.java   ?? '0').replace('1.', ''))
  const reactFrom = parseFloat(fromVersions.react ?? '0')
  const reactTo   = parseFloat(toVersions.react   ?? '0')
  const zustandTo = parseFloat(toVersions.zustand ?? '0')

  for (const p of patterns) {
    if (isJava) {
      if (p.description.includes('WebSecurityConfigurerAdapter') || p.description.includes('configure')) {
        if (!lines.some(l => l.includes('SecurityFilterChain'))) {
          lines.push('- WebSecurityConfigurerAdapter를 상속한 클래스는 @Bean SecurityFilterChain 방식으로 재작성')
          lines.push('- configure(HttpSecurity http) → SecurityFilterChain filterChain(HttpSecurity http) @Bean 메서드로 교체')
        }
      }
      if (p.description.includes('finalize')) {
        lines.push('- finalize() 메서드는 java.lang.ref.Cleaner 또는 AutoCloseable + try-with-resources로 교체')
      }
      if (p.description.includes('ThreadLocal')) {
        lines.push('- new ThreadLocal<>()은 ScopedValue.newInstance()로 교체, ScopedValue.where(...).run(...) 패턴 적용')
      }
      if (p.description.includes('ObjectMapper')) {
        lines.push('- new ObjectMapper() 직접 생성은 생성자 주입(@Autowired 또는 @RequiredArgsConstructor)으로 교체')
      }
      if (p.description.includes('sun.')) {
        lines.push('- sun.* internal API는 표준 Java API(java.util.Base64, java.lang.invoke 등)로 교체')
      }
      if (p.description.includes('JPAQueryFactory')) {
        lines.push('- JPAQueryFactory를 jakarta 패키지 기반으로 교체')
      }
      // 버전 범위 기반 추가 지시사항
      if (sbFrom < 3 && sbTo >= 3) {
        if (!lines.some(l => l.includes('javax'))) lines.push('- import javax.* → import jakarta.*')
      }
      if (sbFrom < 4 && sbTo >= 4) {
        if (!lines.some(l => l.includes('ObjectMapper'))) lines.push('- new ObjectMapper() → Bean 주입')
      }
      if (jFrom < 18 && jTo >= 18) {
        if (!lines.some(l => l.includes('finalize'))) lines.push('- finalize() → Cleaner/AutoCloseable')
      }
      if (jTo >= 21) {
        if (!lines.some(l => l.includes('ThreadLocal'))) lines.push('- new ThreadLocal<>() → ScopedValue')
      }
    }
    if (isTs) {
      if (p.description.includes('ReactDOM.render')) {
        if (!lines.some(l => l.includes('createRoot'))) lines.push('- ReactDOM.render()는 createRoot().render() 방식으로 교체')
      }
      if (p.description.includes('Class 컴포넌트')) {
        if (!lines.some(l => l.includes('함수형'))) lines.push('- class 컴포넌트(extends Component)는 함수형 컴포넌트 + hooks로 교체')
      }
      if (p.description.includes('zustand') || zustandTo >= 5) {
        if (!lines.some(l => l.includes('zustand'))) lines.push("- import create from 'zustand' → import { create } from 'zustand'")
      }
      if (reactFrom < 18 && reactTo >= 18) {
        if (!lines.some(l => l.includes('createRoot'))) lines.push('- ReactDOM.render() → createRoot().render()')
      }
    }
  }

  return lines.join('\n')
}

// ── Haiku: 청크 방식 ──────────────────────────────────────

interface CodeChunk {
  startLine: number
  endLine: number
  content: string
  patterns: ComplexPattern[]
}

function buildChunks(lines: string[], patterns: ComplexPattern[]): CodeChunk[] {
  const sorted = [...patterns].sort((a, b) => a.line - b.line)
  const chunks: CodeChunk[] = []

  for (const pattern of sorted) {
    const center = pattern.line - 1
    const start  = Math.max(0, center - CONTEXT_LINES)
    const end    = Math.min(lines.length - 1, center + CONTEXT_LINES)

    const last = chunks[chunks.length - 1]
    if (last && start <= last.endLine + 5) {
      last.endLine = Math.min(lines.length - 1, Math.max(last.endLine, end))
      last.content = lines.slice(last.startLine, last.endLine + 1).join('\n')
      last.patterns.push(pattern)
    } else {
      chunks.push({ startLine: start, endLine: end, content: lines.slice(start, end + 1).join('\n'), patterns: [pattern] })
    }
  }

  return chunks
}

async function callApi(
  prompt: string,
  apiKey: string,
  modelId: string,
  maxTokens: number,
  tooLargeCode: AiErrorCode,
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new AiTransformError(AI_ERROR_CODE.API_ERROR, (err as any)?.error?.message ?? `API 오류 (${res.status})`)
  }

  const data = await res.json()
  if (data.stop_reason === 'max_tokens') {
    throw new AiTransformError(tooLargeCode, '파일이 너무 커서 변환이 완료되지 않았습니다')
  }

  const text: string = data.content?.[0]?.text ?? ''
  return text.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim()
}

async function transformByChunks(
  filename: string,
  content: string,
  patterns: ComplexPattern[],
  fromVersions: Record<string, string>,
  toVersions: Record<string, string>,
  apiKey: string,
  modelId: string,
): Promise<string | null> {
  const lines = content.split('\n')
  const chunks = buildChunks(lines, patterns)
  const sortedChunks = [...chunks].sort((a, b) => b.startLine - a.startLine)

  const resultLines = [...lines]
  let changed = false

  for (const chunk of sortedChunks) {
    const instructions = buildInstructions(filename, fromVersions, toVersions, chunk.patterns)
    if (!instructions) continue

    const prompt = `당신은 코드 마이그레이션 전문가입니다. 아래 코드 조각(${filename})에 다음 변경사항만 정확히 적용하세요:\n\n${instructions}\n\n규칙:\n- 위 지시사항에 해당하는 부분만 수정하고 나머지는 절대 변경하지 마세요\n- 설명이나 마크다운 없이 수정된 코드 조각만 반환하세요\n- 변경할 내용이 없으면 원본을 그대로 반환하세요\n\n코드 조각:\n\`\`\`\n${chunk.content}\n\`\`\``

    const fixed = await callApi(prompt, apiKey, modelId, 4096, AI_ERROR_CODE.HAIKU_TOO_LARGE)
    if (fixed && fixed !== chunk.content.trim()) {
      resultLines.splice(chunk.startLine, chunk.endLine - chunk.startLine + 1, ...fixed.split('\n'))
      changed = true
    }
  }

  return changed ? resultLines.join('\n') : null
}

// ── Sonnet: 전체 파일 방식 ────────────────────────────────

async function transformFullFile(
  filename: string,
  content: string,
  patterns: ComplexPattern[],
  fromVersions: Record<string, string>,
  toVersions: Record<string, string>,
  apiKey: string,
  modelId: string,
): Promise<string | null> {
  const instructions = buildInstructions(filename, fromVersions, toVersions, patterns)
  if (!instructions) return null

  const prompt = `당신은 코드 마이그레이션 전문가입니다. 아래 파일(${filename})에 다음 변경사항만 정확히 적용하세요:\n\n${instructions}\n\n규칙:\n- 위 지시사항에 해당하는 부분만 수정하고 나머지 코드는 절대 변경하지 마세요\n- 주석, 공백, 변수명 등 관련 없는 부분은 원본 그대로 유지하세요\n- 설명이나 마크다운 없이 수정된 파일 전체 내용만 반환하세요\n- 변경할 내용이 없으면 원본을 그대로 반환하세요\n\n파일 내용:\n\`\`\`\n${content}\n\`\`\``

  const fixed = await callApi(prompt, apiKey, modelId, 8192, AI_ERROR_CODE.SONNET_TOO_LARGE)
  return fixed && fixed !== content.trim() ? fixed : null
}

// ── 공개 API ─────────────────────────────────────────────

export async function aiTransformFile(
  filename: string,
  content: string,
  fromVersions: Record<string, string>,
  toVersions: Record<string, string>,
  apiKey: string,
  model: 'haiku' | 'sonnet' = 'haiku',
): Promise<string | null> {
  const patterns = detectComplexPatterns(content)
  if (patterns.length === 0) return null

  const modelId = model === 'sonnet'
    ? 'claude-sonnet-4-6'
    : 'claude-haiku-4-5-20251001'

  if (model === 'sonnet') {
    return transformFullFile(filename, content, patterns, fromVersions, toVersions, apiKey, modelId)
  } else {
    return transformByChunks(filename, content, patterns, fromVersions, toVersions, apiKey, modelId)
  }
}

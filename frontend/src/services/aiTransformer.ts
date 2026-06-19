// ──────────────────────────────────────────────────────────
// Claude API를 이용한 소스 파일 마이그레이션 자동 변환
// ──────────────────────────────────────────────────────────

// 복잡한 패턴 감지 (단순 치환으로 해결 안 되는 것들)
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
  const seen = new Set<string>()  // 패턴별 첫 번째 매치만

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const p of COMPLEX_PATTERNS) {
      if (seen.has(p.description)) continue
      // reset lastIndex for stateful regexes
      const r = new RegExp(p.regex.source, p.regex.flags)
      if (r.test(line)) {
        seen.add(p.description)
        results.push({
          description: p.description,
          line: i + 1,
          snippet: line.trim(),
        })
      }
    }
  }

  return results
}

/** 마이그레이션 맥락에 맞는 지시사항 생성 */
function buildInstructions(
  filename: string,
  fromVersions: Record<string, string>,
  toVersions: Record<string, string>,
  patterns: ComplexPattern[],
): string {
  const isJava = /\.(java|kt)$/.test(filename)
  const isTs   = /\.(ts|tsx|js|jsx)$/.test(filename)

  const lines: string[] = []

  if (isJava) {
    const sbFrom = parseFloat(fromVersions.springboot ?? '0')
    const sbTo   = parseFloat(toVersions.springboot   ?? '0')
    const jFrom  = parseFloat((fromVersions.java ?? '0').replace('1.', ''))
    const jTo    = parseFloat((toVersions.java   ?? '0').replace('1.', ''))

    if (sbFrom < 3 && sbTo >= 3) {
      lines.push('- import javax.* → import jakarta.* 로 일괄 변경')
      lines.push('- WebSecurityConfigurerAdapter를 상속한 클래스는 @Bean SecurityFilterChain 방식으로 완전히 재작성')
      lines.push('- configure(HttpSecurity http) 메서드를 SecurityFilterChain filterChain(HttpSecurity http) @Bean 메서드로 교체')
    }
    if (sbFrom < 4 && sbTo >= 4) {
      lines.push('- new ObjectMapper() 직접 생성은 생성자 주입(@Autowired 또는 @RequiredArgsConstructor)으로 교체')
    }
    if (jFrom < 18 && jTo >= 18) {
      lines.push('- finalize() 메서드는 java.lang.ref.Cleaner 방식 또는 AutoCloseable + try-with-resources로 교체')
    }
    if (jTo >= 21) {
      lines.push('- sun.* internal API는 표준 Java API(java.util.Base64, java.lang.invoke 등)로 교체')
    }
    if (jTo >= 21) {
      lines.push('- new ThreadLocal<>()은 ScopedValue.newInstance()로 교체하고 ScopedValue.where(...).run(...) 패턴 적용')
    }
  }

  if (isTs) {
    const reactFrom = parseFloat(fromVersions.react ?? '0')
    const reactTo   = parseFloat(toVersions.react   ?? '0')
    const zustandTo = parseFloat(toVersions.zustand ?? '0')

    if (reactFrom < 18 && reactTo >= 18) {
      lines.push('- ReactDOM.render()는 createRoot().render() 방식으로 교체')
    }
    if (reactFrom < 19 && reactTo >= 19) {
      lines.push('- class 컴포넌트(extends Component)는 함수형 컴포넌트 + hooks로 교체')
    }
    if (zustandTo >= 5) {
      lines.push("- import create from 'zustand' → import { create } from 'zustand'")
    }
  }

  // 패턴에서 추가 지시사항
  for (const p of patterns) {
    if (!lines.some(l => l.includes(p.description.split(' ')[0]))) {
      lines.push(`- ${p.description} 패턴 수정`)
    }
  }

  return lines.join('\n')
}

/** Claude API로 파일 변환 */
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

  const instructions = buildInstructions(filename, fromVersions, toVersions, patterns)
  if (!instructions) return null

  const modelId = model === 'sonnet'
    ? 'claude-sonnet-4-6'
    : 'claude-haiku-4-5-20251001'

  const prompt = `당신은 코드 마이그레이션 전문가입니다. 아래 파일(${filename})에 다음 변경사항만 정확히 적용하세요:

${instructions}

규칙:
- 위 지시사항에 해당하는 부분만 수정하고 나머지 코드는 절대 변경하지 마세요
- 주석, 공백, 변수명 등 관련 없는 부분은 원본 그대로 유지하세요
- 설명이나 마크다운 없이 수정된 파일 내용만 반환하세요
- 변경할 내용이 없으면 원본을 그대로 반환하세요

파일 내용:
\`\`\`
${content}
\`\`\``

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
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any)?.error?.message ?? `API 오류 (${res.status})`)
  }

  const data = await res.json()
  const text: string = data.content?.[0]?.text ?? ''

  // 코드 블록 제거 (Claude가 ```로 감쌀 경우)
  const unwrapped = text
    .replace(/^```[\w]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim()

  // 내용이 동일하면 null 반환
  return unwrapped === content.trim() ? null : unwrapped
}

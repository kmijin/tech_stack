// ──────────────────────────────────────────────────────────
// 마이그레이션 스캔 스크립트 생성기
// ──────────────────────────────────────────────────────────

export interface GrepDef {
  key: string
  label: string
  bash: string        // Unix/macOS
  powershell: string  // Windows
}

// ── 전체 grep 항목 정의 ───────────────────────────────────
export const GREP_DEFS: GrepDef[] = [
  // ── Backend: Java ──
  {
    key: 'javax_imports',
    label: 'javax.* import 파일',
    bash:        `grep -rl "import javax\\." "$ROOT/src" --include="*.java" | wc -l | tr -d ' '`,
    powershell:  `(Get-ChildItem -Path "$Root\\src" -Recurse -Filter *.java | Select-String 'import javax\\.').Path | Sort-Object -Unique | Measure-Object | Select-Object -ExpandProperty Count`,
  },
  {
    key: 'websecurity_adapter',
    label: 'WebSecurityConfigurerAdapter 상속 파일',
    bash:        `grep -rl "WebSecurityConfigurerAdapter" "$ROOT/src" --include="*.java" | wc -l | tr -d ' '`,
    powershell:  `(Get-ChildItem -Path "$Root\\src" -Recurse -Filter *.java | Select-String 'WebSecurityConfigurerAdapter').Path | Sort-Object -Unique | Measure-Object | Select-Object -ExpandProperty Count`,
  },
  {
    key: 'sun_imports',
    label: 'sun.* internal API 사용 파일',
    bash:        `grep -rl "import sun\\." "$ROOT/src" --include="*.java" | wc -l | tr -d ' '`,
    powershell:  `(Get-ChildItem -Path "$Root\\src" -Recurse -Filter *.java | Select-String 'import sun\\.').Path | Sort-Object -Unique | Measure-Object | Select-Object -ExpandProperty Count`,
  },
  {
    key: 'deprecated_finalize',
    label: 'finalize() 오버라이드 파일',
    bash:        `grep -rl "void finalize()" "$ROOT/src" --include="*.java" | wc -l | tr -d ' '`,
    powershell:  `(Get-ChildItem -Path "$Root\\src" -Recurse -Filter *.java | Select-String 'void finalize\(\)').Path | Sort-Object -Unique | Measure-Object | Select-Object -ExpandProperty Count`,
  },
  {
    key: 'threadlocal_usage',
    label: 'ThreadLocal 직접 사용 파일',
    bash:        `grep -rl "new ThreadLocal" "$ROOT/src" --include="*.java" | wc -l | tr -d ' '`,
    powershell:  `(Get-ChildItem -Path "$Root\\src" -Recurse -Filter *.java | Select-String 'new ThreadLocal').Path | Sort-Object -Unique | Measure-Object | Select-Object -ExpandProperty Count`,
  },
  {
    key: 'jackson_objectmapper',
    label: 'ObjectMapper 커스텀 Bean 파일',
    bash:        `grep -rl "ObjectMapper" "$ROOT/src" --include="*.java" | wc -l | tr -d ' '`,
    powershell:  `(Get-ChildItem -Path "$Root\\src" -Recurse -Filter *.java | Select-String 'ObjectMapper').Path | Sort-Object -Unique | Measure-Object | Select-Object -ExpandProperty Count`,
  },
  {
    key: 'querydsl_config',
    label: 'JPAQueryFactory 설정 파일',
    bash:        `grep -rl "JPAQueryFactory" "$ROOT/src" --include="*.java" | wc -l | tr -d ' '`,
    powershell:  `(Get-ChildItem -Path "$Root\\src" -Recurse -Filter *.java | Select-String 'JPAQueryFactory').Path | Sort-Object -Unique | Measure-Object | Select-Object -ExpandProperty Count`,
  },
  // ── Frontend: React ──
  {
    key: 'react_dom_render',
    label: 'ReactDOM.render() 사용 파일',
    bash:        `grep -rl "ReactDOM\\.render" "$ROOT/src" --include="*.tsx" --include="*.jsx" --include="*.ts" --include="*.js" | wc -l | tr -d ' '`,
    powershell:  `(Get-ChildItem -Path "$Root\\src" -Recurse -Include *.tsx,*.jsx,*.ts,*.js | Select-String 'ReactDOM\.render').Path | Sort-Object -Unique | Measure-Object | Select-Object -ExpandProperty Count`,
  },
  {
    key: 'class_components',
    label: 'class 컴포넌트 (extends Component) 파일',
    bash:        `grep -rl "extends.*Component" "$ROOT/src" --include="*.tsx" --include="*.jsx" | wc -l | tr -d ' '`,
    powershell:  `(Get-ChildItem -Path "$Root\\src" -Recurse -Include *.tsx,*.jsx | Select-String 'extends.*Component').Path | Sort-Object -Unique | Measure-Object | Select-Object -ExpandProperty Count`,
  },
  // ── Frontend: Zustand ──
  {
    key: 'zustand_default_import',
    label: 'Zustand default import 파일',
    bash:        `grep -rl "import zustand\\|import create from" "$ROOT/src" --include="*.ts" --include="*.tsx" | wc -l | tr -d ' '`,
    powershell:  `(Get-ChildItem -Path "$Root\\src" -Recurse -Include *.ts,*.tsx | Select-String 'import zustand|import create from').Path | Sort-Object -Unique | Measure-Object | Select-Object -ExpandProperty Count`,
  },
  // ── Frontend: Vite ──
  {
    key: 'vite_plugin_usage',
    label: 'vite.config 플러그인 API 사용 수',
    bash:        `find "$ROOT" -maxdepth 2 -name "vite.config.*" | xargs grep -l "plugins" 2>/dev/null | wc -l | tr -d ' '`,
    powershell:  `(Get-ChildItem -Path "$Root" -Depth 2 -Include vite.config.ts,vite.config.js,vite.config.mjs,vite.config.cjs -ErrorAction SilentlyContinue | Select-String -Pattern 'plugins' -ErrorAction SilentlyContinue).Path | Sort-Object -Unique | Measure-Object | Select-Object -ExpandProperty Count`,
  },
]

const GREP_MAP = Object.fromEntries(GREP_DEFS.map(d => [d.key, d]))

// ── 마이그레이션 경로별 필요한 grep keys ─────────────────
type MigrationId = string  // e.g. "springboot:2.7→3.2"

function requiredKeys(stackId: string, from: number, to: number): string[] {
  const keys: string[] = []
  if (stackId === 'java') {
    if (from < 9)  keys.push('sun_imports')
    if (from < 18) keys.push('deprecated_finalize')
    if (to >= 21)  keys.push('threadlocal_usage')
  }
  if (stackId === 'springboot') {
    if (from < 3 && to >= 3) keys.push('javax_imports', 'websecurity_adapter')
    if (from < 4 && to >= 4) keys.push('jackson_objectmapper', 'querydsl_config')
  }
  if (stackId === 'querydsl') {
    keys.push('querydsl_config')
  }
  if (stackId === 'react') {
    if (from < 18 && to >= 18) keys.push('class_components')
    if (from < 19 && to >= 19) keys.push('react_dom_render')
  }
  if (stackId === 'zustand') {
    if (from < 5 && to >= 5) keys.push('zustand_default_import')
  }
  if (stackId === 'vite') {
    keys.push('vite_plugin_usage')
  }
  return [...new Set(keys)]
}

// ── 스크립트 생성 ─────────────────────────────────────────
export interface ScriptInput {
  stackId: string
  current: string
  target: string
}

function parseVer(v: string): number {
  return parseFloat(v.replace(/[^0-9.]/g, '')) || 0
}

export function generateScript(
  migrations: ScriptInput[],
  platform: 'bash' | 'powershell',
): string {
  const allKeys = new Set<string>()
  for (const m of migrations) {
    const from = parseVer(m.current)
    const to   = parseVer(m.target)
    requiredKeys(m.stackId, from, to).forEach(k => allKeys.add(k))
  }

  const defs = [...allKeys].map(k => GREP_MAP[k]).filter(Boolean)
  if (defs.length === 0) return ''

  const migrationLabel = migrations
    .map(m => `${m.stackId} ${m.current}→${m.target}`)
    .join(', ')

  if (platform === 'bash') {
    return [
      '#!/bin/bash',
      `# Hubilon Migration Scanner — ${migrationLabel}`,
      '# 실행: bash migrate-scan.sh [프로젝트_루트_경로]',
      '# 예시: bash migrate-scan.sh /home/user/my-project',
      '',
      'ROOT=${1:-.}',
      '',
      'echo "{"',
      '  echo \'"meta": {\'',
      `  echo \'"scanned_at": "\'$(date -u +%Y-%m-%dT%H:%M:%SZ)\'",\'`,
      '  echo \'"project_root": "\'$(realpath "$ROOT")\'",\'',
      '  echo \'"total_java_files": \'$(find "$ROOT/src" -name "*.java" 2>/dev/null | wc -l | tr -d \' \')',
      '  echo \'},\'',
      '  echo \'"results": {\'',
      ...defs.map((d, i) => {
        const comma = i < defs.length - 1 ? ',' : ''
        return [
          `  # ${d.label}`,
          `  _${d.key}=$(${d.bash})`,
          `  echo '"${d.key}": { "files": \'$_${d.key}\' }${comma}'`,
        ].join('\n')
      }),
      '  echo "}"',
      'echo "}"',
    ].join('\n')
  } else {
    return [
      '# Hubilon Migration Scanner (PowerShell)',
      `# 마이그레이션: ${migrationLabel}`,
      '# 실행 방법 (PowerShell에서):',
      '#   .\\migrate-scan.ps1',
      '#   .\\migrate-scan.ps1 C:\\path\\to\\your-project',
      '# CMD는 지원하지 않습니다. PowerShell을 사용하세요.',
      '',
      'param([string]$Root = ".")',
      '',
      '$results = @{}',
      '',
      ...defs.map(d => [
        `# ${d.label}`,
        `$results["${d.key}"] = ${d.powershell}`,
      ].join('\n')),
      '',
      'Write-Host ""',
      'Write-Host "========================================="',
      'Write-Host "아래 한 줄을 복사해서 대시보드에 붙여넣기"',
      'Write-Host "========================================="',
      '$results | ConvertTo-Json -Compress',
      'Write-Host "========================================="',
    ].join('\n')
  }
}

// ── 스캔 결과 파싱 ────────────────────────────────────────
export interface ScanResult {
  meta?: { scanned_at?: string; project_root?: string; total_java_files?: number }
  results: Record<string, { files: number; lines?: number } | number>
}

export function parseScanResult(json: string): ScanResult | null {
  try {
    const data = JSON.parse(json)
    // PowerShell은 { key: number } 형태로 나올 수 있음
    if (typeof data === 'object' && !data.results) {
      const results: ScanResult['results'] = {}
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === 'number') results[k] = { files: v }
      }
      return { results }
    }
    return data as ScanResult
  } catch {
    return null
  }
}

export function getFileCount(result: ScanResult, key: string): number {
  const v = result.results[key]
  if (v == null) return 0
  if (typeof v === 'number') return v
  return v.files ?? 0
}

export { requiredKeys, parseVer, GREP_MAP }

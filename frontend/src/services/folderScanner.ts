// ──────────────────────────────────────────────────────────
// 폴더 선택 API 기반 로컬 프로젝트 스캐너
// Chrome / Edge (File System Access API) 전용
// ──────────────────────────────────────────────────────────
import { LINE_TRANSFORMS } from './migrationGuide'

const SKIP_DIRS = new Set([
  'node_modules', 'build', 'dist', '.gradle', 'target',
  '.git', '.idea', 'out', '.vite', '.next', 'coverage', '__pycache__',
])

const PATTERNS: Record<string, RegExp> = {
  javax_imports:          /import javax\./,
  websecurity_adapter:    /WebSecurityConfigurerAdapter/,
  sun_imports:            /import sun\./,
  deprecated_finalize:    /void finalize\s*\(\s*\)/,
  threadlocal_usage:      /new ThreadLocal/,
  jackson_objectmapper:   /ObjectMapper/,
  querydsl_config:        /JPAQueryFactory/,
  react_dom_render:       /ReactDOM\.render/,
  class_components:       /extends\s+.*Component/,
  zustand_default_import: /import zustand|import create from/,
  vite_plugin_usage:      /plugins/,
}

const KEY_EXTS: Record<string, Set<string>> = {
  javax_imports:          new Set(['.java']),
  websecurity_adapter:    new Set(['.java']),
  sun_imports:            new Set(['.java']),
  deprecated_finalize:    new Set(['.java']),
  threadlocal_usage:      new Set(['.java']),
  jackson_objectmapper:   new Set(['.java']),
  querydsl_config:        new Set(['.java']),
  react_dom_render:       new Set(['.ts', '.tsx', '.js', '.jsx']),
  class_components:       new Set(['.tsx', '.jsx']),
  zustand_default_import: new Set(['.ts', '.tsx']),
  vite_plugin_usage:      new Set(['.ts', '.js', '.mjs', '.cjs']),
}

const ALL_EXTS = new Set(
  Object.values(KEY_EXTS).flatMap(s => [...s])
)

export interface ScanProgress {
  scanned: number
}

// 파일 내 매칭된 줄 정보
export interface MatchLine {
  lineNumber: number
  content: string
  fixSuggestion?: string  // 자동 변환 가능한 경우
}

// 파일 단위 매칭 결과
export interface MatchDetail {
  filePath: string
  lines: MatchLine[]
}

// 전체 스캔 결과
export interface FolderScanResult {
  counts: Record<string, number>
  matches: Record<string, MatchDetail[]>   // 파일 경로 + 매칭 줄
  totalFiles: number
  javaFiles: number
}

// 디렉토리 재귀 순회 (상대 경로 포함)
async function* walkFiles(
  dir: FileSystemDirectoryHandle,
  basePath = ''
): AsyncGenerator<{ handle: FileSystemFileHandle; relativePath: string }> {
  // @ts-ignore — File System Access API (Chrome/Edge)
  for await (const entry of dir.values()) {
    const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name
    if (entry.kind === 'directory') {
      if (!SKIP_DIRS.has(entry.name)) {
        yield* walkFiles(entry as FileSystemDirectoryHandle, entryPath)
      }
    } else if (entry.kind === 'file') {
      const ext = entry.name.slice(entry.name.lastIndexOf('.'))
      if (ALL_EXTS.has(ext)) {
        yield { handle: entry as FileSystemFileHandle, relativePath: entryPath }
      }
    }
  }
}

export async function scanFolder(
  dirHandle: FileSystemDirectoryHandle,
  keys: string[],
  onProgress: (p: ScanProgress) => void
): Promise<FolderScanResult> {
  const activeKeys = keys.filter(k => PATTERNS[k])
  const counts  = Object.fromEntries(activeKeys.map(k => [k, 0])) as Record<string, number>
  const matches = Object.fromEntries(activeKeys.map(k => [k, []])) as Record<string, MatchDetail[]>
  let totalFiles = 0
  let javaFiles  = 0

  for await (const { handle, relativePath } of walkFiles(dirHandle)) {
    try {
      const file = await handle.getFile()
      const ext  = file.name.slice(file.name.lastIndexOf('.'))
      const text = await file.text()
      const lines = text.split('\n')

      if (ext === '.java') javaFiles++

      for (const key of activeKeys) {
        if (!KEY_EXTS[key]?.has(ext)) continue

        const matchingLines: MatchLine[] = []
        lines.forEach((line, idx) => {
          if (PATTERNS[key].test(line)) {
            const content       = line.trim().slice(0, 120)
            const fixSuggestion = LINE_TRANSFORMS[key]?.(line.trim()) ?? undefined
            matchingLines.push({ lineNumber: idx + 1, content, fixSuggestion })
          }
        })

        if (matchingLines.length > 0) {
          counts[key]++
          matches[key].push({
            filePath: relativePath,
            lines: matchingLines.slice(0, 5),  // 파일당 최대 5줄
          })
        }
      }
    } catch {
      // 읽기 실패 파일 스킵
    }

    totalFiles++
    onProgress({ scanned: totalFiles })
  }

  return { counts, matches, totalFiles, javaFiles }
}

export function isFolderPickerSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    // @ts-ignore
    return await window.showDirectoryPicker({ mode: 'read' })
  } catch {
    return null
  }
}

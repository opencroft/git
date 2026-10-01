/**
 * Utilities for constructing unified diff patches from diff block descriptions.
 * Pure functions — no React, no server deps.
 *
 * Patches are applied with `git apply --recount`, so the @@ line numbers are a
 * best-effort hint (git recomputes them); the BODY (context/removed/added lines)
 * must match the target content exactly. Context is anchored on the ORIGINAL
 * side, which is correct for insertions, modifications, and deletions alike.
 */

/** A contiguous block of changed lines (from Monaco's getLineChanges()) */
export interface DiffBlock {
  /** 1-based start line in original content (0 = pure addition) */
  originalStart: number
  /** 1-based end line in original content, inclusive (0 = pure addition) */
  originalEnd: number
  /** 1-based start line in modified content (0 = pure deletion) */
  modifiedStart: number
  /** 1-based end line in modified content, inclusive (0 = pure deletion) */
  modifiedEnd: number
}

/** Line range selected by the user in the modified editor */
export interface ModifiedSelection {
  startLine: number // 1-based, inclusive
  endLine: number // 1-based, inclusive
}

/**
 * Convert Monaco ILineChange[] to DiffBlock[].
 * Monaco uses 0 to indicate "no lines" for pure insertions/deletions.
 * For an insertion, originalStartLineNumber is the original line AFTER which the
 * new lines were inserted (originalEndLineNumber === 0). For a deletion,
 * modifiedStartLineNumber is the modified line after which lines were removed
 * (modifiedEndLineNumber === 0).
 */
export function lineChangesToBlocks(
  changes: Array<{
    originalStartLineNumber: number
    originalEndLineNumber: number
    modifiedStartLineNumber: number
    modifiedEndLineNumber: number
  }>,
): DiffBlock[] {
  return changes.map((c) => ({
    originalStart: c.originalStartLineNumber,
    originalEnd: c.originalEndLineNumber || 0,
    modifiedStart: c.modifiedStartLineNumber,
    modifiedEnd: c.modifiedEndLineNumber || 0,
  }))
}

const CONTEXT_LINES = 3

/** Split content into lines, ignoring a single trailing newline so the line
 * list matches the blob/file content (git treats files as newline-terminated). */
function splitLines(content: string): string[] {
  return content.replace(/\n$/, '').split('\n')
}

/**
 * Whole-file patch for a newly-added (untracked, not in index) or fully-deleted
 * file. A regular modify-hunk can't stage these — git needs the new/deleted file
 * mode header and /dev/null on the missing side.
 */
function wholeFilePatch(content: string, filePath: string, kind: 'new' | 'deleted'): string {
  const lines = splitLines(content)
  if (kind === 'new') {
    return [`diff --git a/${filePath} b/${filePath}`, 'new file mode 100644', '--- /dev/null', `+++ b/${filePath}`, `@@ -0,0 +1,${lines.length} @@`, ...lines.map((l) => `+${l}`)].join('\n')
  }
  return [`diff --git a/${filePath} b/${filePath}`, 'deleted file mode 100644', `--- a/${filePath}`, '+++ /dev/null', `@@ -1,${lines.length} +0,0 @@`, ...lines.map((l) => `-${l}`)].join('\n')
}

/**
 * Build a single unified-diff hunk for a block. `clip`, when given, restricts
 * the ADDED lines to a selection range on the modified side.
 */
function buildHunk(oLines: string[], mLines: string[], block: DiffBlock, clip?: ModifiedSelection): string {
  const oStart = block.originalStart || 0
  const oEnd = block.originalEnd || 0
  const mStart = block.modifiedStart || 0
  const mEnd = block.modifiedEnd || 0

  const insertion = oEnd === 0 // no original lines removed
  const deletion = mEnd === 0 // no modified lines added

  const removed = insertion ? [] : oLines.slice(oStart - 1, oEnd)

  let addedStart = mStart
  let addedEnd = mEnd
  if (clip && !deletion) {
    addedStart = Math.max(mStart, clip.startLine)
    addedEnd = Math.min(mEnd, clip.endLine)
  }
  const added = deletion ? [] : mLines.slice(addedStart - 1, addedEnd)

  // Context is anchored on the original side.
  // Number of original lines that precede the change:
  //  - insertion: lines 1..oStart precede (inserted AFTER oStart)
  //  - modify/delete: lines 1..oStart-1 precede (removing oStart..oEnd)
  const linesBefore = insertion ? oStart : oStart - 1
  const ctxBeforeStart = Math.max(0, linesBefore - CONTEXT_LINES)
  const ctxBefore = oLines.slice(ctxBeforeStart, linesBefore)

  // First original line after the change (0-based index):
  //  - insertion: oStart (line right after the insertion point)
  //  - modify/delete: oEnd
  const afterIdx = insertion ? oStart : oEnd
  const ctxAfter = oLines.slice(afterIdx, afterIdx + CONTEXT_LINES)

  const oldStart = ctxBeforeStart + 1
  const oldCount = ctxBefore.length + removed.length + ctxAfter.length
  const newCount = ctxBefore.length + added.length + ctxAfter.length
  const header = `@@ -${oldStart},${oldCount} +${oldStart},${newCount} @@`

  return [header, ...ctxBefore.map((l) => ` ${l}`), ...removed.map((l) => `-${l}`), ...added.map((l) => `+${l}`), ...ctxAfter.map((l) => ` ${l}`)].join('\n')
}

/** Build a unified diff patch for a single DiffBlock with context lines. */
export function buildPatchForBlock(originalContent: string, modifiedContent: string, block: DiffBlock, filePath: string): string {
  if (originalContent === '') {
    return wholeFilePatch(modifiedContent, filePath, 'new')
  }
  if (modifiedContent === '') {
    return wholeFilePatch(originalContent, filePath, 'deleted')
  }
  const oLines = splitLines(originalContent)
  const mLines = splitLines(modifiedContent)
  const hunk = buildHunk(oLines, mLines, block)
  return [`--- a/${filePath}`, `+++ b/${filePath}`, hunk].join('\n')
}

/**
 * Build a unified diff patch covering only the selected changed lines
 * within the blocks that intersect the selection range.
 */
export function buildPatchForSelection(originalContent: string, modifiedContent: string, blocks: DiffBlock[], selection: ModifiedSelection, filePath: string): string {
  if (originalContent === '') {
    return wholeFilePatch(modifiedContent, filePath, 'new')
  }
  if (modifiedContent === '') {
    return wholeFilePatch(originalContent, filePath, 'deleted')
  }
  const oLines = splitLines(originalContent)
  const mLines = splitLines(modifiedContent)

  const hunks: string[] = []
  for (const block of blocks) {
    if (!blockIntersectsSelection(block, selection)) {
      continue
    }
    if ((block.modifiedStart || 0) === 0) {
      continue // pure deletion — nothing on the modified side to select
    }
    hunks.push(buildHunk(oLines, mLines, block, selection))
  }

  if (hunks.length === 0) {
    throw new Error('No diff blocks intersect the selection')
  }

  return [`--- a/${filePath}`, `+++ b/${filePath}`, ...hunks].join('\n')
}

function blockIntersectsSelection(block: DiffBlock, sel: ModifiedSelection): boolean {
  const bStart = block.modifiedStart || 0
  const bEnd = block.modifiedEnd || bStart
  if (bStart === 0) {
    return false
  }
  return bEnd >= sel.startLine && bStart <= sel.endLine
}

import { legacy } from '@opencroft/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { applyHunkPatch } from '../lib/apply-patch'
import { useGit } from '../lib/git-context'
import { buildPatchForBlock, buildPatchForSelection, type DiffBlock, lineChangesToBlocks, type ModifiedSelection } from '../lib/patch'
import { useFillHeight } from '../lib/use-fill-height'
import { DiffActionBar } from './diff-action-bar'

const { CodeEditor } = legacy

type MonacoNamespace = legacy.MonacoNamespace
type MonacoDiffEditor = legacy.MonacoDiffEditor

// Monaco's decoration types, reached through the editor method that takes them
// rather than through a `monaco-editor` import. An extension bundle has no
// runtime module resolver and this repository does not declare that package, so
// what it can rely on is what `@opencroft/client` declares — and that already
// describes the editor precisely enough for these to be derived from it.
type DecorationsCollection = ReturnType<legacy.MonacoCodeEditor['createDecorationsCollection']>
type DeltaDecoration = NonNullable<Parameters<legacy.MonacoCodeEditor['createDecorationsCollection']>[0]>[number]

type DiffMode = 'unstaged' | 'staged' | 'committed'

export interface DiffNavigator {
  next: () => void
  previous: () => void
}

interface InteractiveDiffViewerProps {
  path: string
  original: string
  modified: string
  language: string
  sideBySide?: boolean
  diffMode: DiffMode
  /** false (default) collapses unchanged regions to a few lines of context around each change. */
  expanded?: boolean
  /** Reveal and place the cursor on this 1-based (modified-side) line once, on mount. */
  line?: number
  /** Called once the diff editor (and its change navigator) is ready, or null on unmount. */
  onNavigatorReady?: (navigator: DiffNavigator | null) => void
  /** Called after a successful stage/unstage/discard so the diff can refresh. */
  onApplied?: () => void
}

interface BarPosition {
  top: number
  right: number
}

/** CSS injected once to style diff block outlines */
const BLOCK_OUTLINE_STYLE = `
.diff-block-first {
  border-top: 1px solid hsl(var(--border) / 0.4);
  border-left: 1px solid hsl(var(--border) / 0.4);
  border-right: 1px solid hsl(var(--border) / 0.4);
  border-top-left-radius: 4px;
  border-top-right-radius: 4px;
}
.diff-block-middle {
  border-left: 1px solid hsl(var(--border) / 0.4);
  border-right: 1px solid hsl(var(--border) / 0.4);
}
.diff-block-last {
  border-bottom: 1px solid hsl(var(--border) / 0.4);
  border-left: 1px solid hsl(var(--border) / 0.4);
  border-right: 1px solid hsl(var(--border) / 0.4);
  border-bottom-left-radius: 4px;
  border-bottom-right-radius: 4px;
}
.diff-block-single {
  border: 1px solid hsl(var(--border) / 0.4);
  border-radius: 4px;
}
.diff-target-first, .diff-target-middle, .diff-target-last, .diff-target-single {
  background: rgb(59 130 246 / 0.12);
}
.diff-target-first {
  border-top: 2px solid rgb(59 130 246);
  border-left: 2px solid rgb(59 130 246);
  border-right: 2px solid rgb(59 130 246);
  border-top-left-radius: 4px;
  border-top-right-radius: 4px;
}
.diff-target-middle {
  border-left: 2px solid rgb(59 130 246);
  border-right: 2px solid rgb(59 130 246);
}
.diff-target-last {
  border-bottom: 2px solid rgb(59 130 246);
  border-left: 2px solid rgb(59 130 246);
  border-right: 2px solid rgb(59 130 246);
  border-bottom-left-radius: 4px;
  border-bottom-right-radius: 4px;
}
.diff-target-single {
  border: 2px solid rgb(59 130 246);
  border-radius: 4px;
}
`

let styleInjected = false
function injectBlockStyles() {
  if (styleInjected || typeof document === 'undefined') return
  const el = document.createElement('style')
  el.setAttribute('data-diff-blocks', '')
  el.textContent = BLOCK_OUTLINE_STYLE
  document.head.appendChild(el)
  styleInjected = true
}

function blockDecorationClass(block: DiffBlock, line: number): string | undefined {
  const start = block.modifiedStart || 0
  const end = block.modifiedEnd || start
  if (line < start || line > end) return undefined
  if (start === end) return 'diff-block-single'
  if (line === start) return 'diff-block-first'
  if (line === end) return 'diff-block-last'
  return 'diff-block-middle'
}

export function InteractiveDiffViewer({
  path,
  original,
  modified,
  language,
  sideBySide = true,
  diffMode,
  expanded = false,
  line,
  onNavigatorReady,
  onApplied,
}: InteractiveDiffViewerProps) {
  const { workspace, refresh } = useGit()
  const [fillRef, fillHeight] = useFillHeight()
  const editorRef = useRef<MonacoDiffEditor | null>(null)
  // Handed over by the editor on mount. Constructing the values Monaco's own
  // APIs take (a `Range` for a decoration) needs the namespace itself, and this
  // is the only way an extension bundle can hold one.
  const monacoRef = useRef<MonacoNamespace | null>(null)
  const blocksRef = useRef<DiffBlock[]>([])
  const decorationsRef = useRef<DecorationsCollection | null>(null)
  const targetDecorationsRef = useRef<DecorationsCollection | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const barHoveredRef = useRef(false)
  const onNavigatorReadyRef = useRef(onNavigatorReady)
  onNavigatorReadyRef.current = onNavigatorReady

  const [blocks, setBlocks] = useState<DiffBlock[]>([])
  const [hoveredBlock, setHoveredBlock] = useState<DiffBlock | null>(null)
  const [selection, setSelection] = useState<ModifiedSelection | null>(null)
  const [barPos, setBarPos] = useState<BarPosition | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Inject block outline CSS once
  useEffect(() => {
    injectBlockStyles()
  }, [])

  // Keep blocksRef in sync
  useEffect(() => {
    blocksRef.current = blocks
  }, [blocks])

  // Let the header know the navigator is gone on unmount.
  useEffect(() => {
    return () => {
      onNavigatorReadyRef.current?.(null)
    }
  }, [])

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const scheduleHide = useCallback(() => {
    clearHideTimer()
    hideTimerRef.current = setTimeout(() => {
      if (!barHoveredRef.current) {
        setHoveredBlock(null)
      }
      hideTimerRef.current = null
    }, 150)
  }, [clearHideTimer])

  const computeBarPos = useCallback((lineNumber: number) => {
    const ed = editorRef.current
    if (!ed) return null
    const mod = ed.getModifiedEditor()
    const top = mod.getTopForLineNumber(lineNumber) - mod.getScrollTop()
    if (top < 0 || top > mod.getLayoutInfo().height) return null
    return { top, right: 8 }
  }, [])

  // Update Monaco decorations for always-visible block outlines
  const updateBlockDecorations = useCallback((ed: MonacoDiffEditor, blks: DiffBlock[]) => {
    const mod = ed.getModifiedEditor()
    const monaco = monacoRef.current
    if (!monaco) return

    const decorations: DeltaDecoration[] = []

    for (const block of blks) {
      const start = block.modifiedStart || 0
      const end = block.modifiedEnd || start
      if (start === 0) continue

      for (let line = start; line <= end; line++) {
        const cls = blockDecorationClass(block, line)
        if (!cls) continue
        decorations.push({
          range: new monaco.Range(line, 1, line, 1),
          options: {
            isWholeLine: true,
            className: cls,
          },
        })
      }
    }

    const model = mod.getModel()
    if (!model) return

    if (decorationsRef.current) {
      decorationsRef.current.clear()
    }
    decorationsRef.current = mod.createDecorationsCollection(decorations)
  }, [])

  // Highlight the lines the action bar will act on (selection, else hovered
  // block) with a stronger bordered rect so it's clear what gets staged /
  // unstaged / discarded.
  const updateTargetDecorations = useCallback(() => {
    const ed = editorRef.current
    const monaco = monacoRef.current
    if (!ed || !monaco) {
      return
    }
    const mod = ed.getModifiedEditor()
    if (!mod.getModel()) {
      return
    }

    let start = 0
    let end = 0
    if (selection) {
      start = selection.startLine
      end = selection.endLine
    } else if (hoveredBlock) {
      start = hoveredBlock.modifiedStart || 0
      end = hoveredBlock.modifiedEnd || start
    }

    const decorations: DeltaDecoration[] = []
    if (start > 0 && end >= start) {
      for (let line = start; line <= end; line++) {
        const cls = start === end ? 'diff-target-single' : line === start ? 'diff-target-first' : line === end ? 'diff-target-last' : 'diff-target-middle'
        decorations.push({
          range: new monaco.Range(line, 1, line, 1),
          options: { isWholeLine: true, className: cls },
        })
      }
    }

    if (targetDecorationsRef.current) {
      targetDecorationsRef.current.clear()
    }
    targetDecorationsRef.current = mod.createDecorationsCollection(decorations)
  }, [selection, hoveredBlock])

  useEffect(() => {
    updateTargetDecorations()
  }, [updateTargetDecorations])

  // Jump the modified editor's cursor to the next/previous change block,
  // wrapping around at either end. Anchors on modifiedStart (0 = pure
  // deletion with no modified-side line to land on, so those are skipped).
  const navigateChange = useCallback((direction: 1 | -1) => {
    const ed = editorRef.current
    if (!ed) {
      return
    }
    const mod = ed.getModifiedEditor()
    const anchors = [...new Set(blocksRef.current.map((b) => b.modifiedStart).filter((line) => line > 0))].sort((a, b) => a - b)
    if (anchors.length === 0) {
      return
    }
    const current = mod.getPosition()?.lineNumber ?? 0
    const target =
      direction === 1 ? (anchors.find((line) => line > current) ?? anchors[0]) : ([...anchors].reverse().find((line) => line < current) ?? anchors[anchors.length - 1])
    mod.revealLineInCenter(target)
    mod.setPosition({ lineNumber: target, column: 1 })
    mod.focus()
  }, [])

  const handleMount = useCallback<legacy.CodeEditorOnMount>(
    (mounted, monaco) => {
      // `original` is always given below, so the editor handed over is the diff
      // one. Narrowing on the method only it has is how the shared mount
      // signature is meant to be read.
      if (!('getModifiedEditor' in mounted)) {
        return
      }
      const ed = mounted
      monacoRef.current = monaco
      editorRef.current = ed
      const mod = ed.getModifiedEditor()

      onNavigatorReadyRef.current?.({ next: () => navigateChange(1), previous: () => navigateChange(-1) })

      // Revealing `line` is the editor's own job (it does it before calling
      // this, so the cursor is already at rest by the time anything here moves
      // it) — hence no reveal of our own.

      const updateBlocks = () => {
        const changes = ed.getLineChanges()
        const b = changes ? lineChangesToBlocks(changes) : []
        setBlocks(b)
        updateBlockDecorations(ed, b)
      }

      ed.onDidUpdateDiff(updateBlocks)
      updateBlocks()

      // Hover tracking — DON'T clear on mouseLeave immediately
      mod.onMouseMove((e) => {
        const line = e.target?.position?.lineNumber
        if (!line) return
        clearHideTimer()
        const b = blocksRef.current.find((bl) => line >= bl.modifiedStart && line <= (bl.modifiedEnd || bl.modifiedStart))
        if (b) {
          setHoveredBlock(b)
          setBarPos(computeBarPos(b.modifiedStart))
        } else {
          // Mouse left the block area — schedule hide (bar can cancel)
          scheduleHide()
        }
      })

      // Mouse leaves editor entirely — schedule hide
      mod.onMouseLeave(() => scheduleHide())

      // Selection tracking
      mod.onDidChangeCursorSelection((e) => {
        const sel = e.selection
        if (sel.startLineNumber === sel.endLineNumber && sel.startColumn === sel.endColumn) {
          setSelection(null)
          return
        }
        const intersects = blocksRef.current.some((bl) => (bl.modifiedEnd || bl.modifiedStart) >= sel.startLineNumber && bl.modifiedStart <= sel.endLineNumber)
        if (intersects) {
          const s = {
            startLine: sel.startLineNumber,
            endLine: sel.endLineNumber,
          }
          setSelection(s)
          setBarPos(computeBarPos(s.startLine))
        } else {
          setSelection(null)
        }
      })

      // Scroll tracking
      mod.onDidScrollChange(() => {
        setHoveredBlock((prev) => {
          if (prev) setBarPos(computeBarPos(prev.modifiedStart))
          return prev
        })
        setSelection((prev) => {
          if (prev) setBarPos(computeBarPos(prev.startLine))
          return prev
        })
      })
    },
    [computeBarPos, updateBlockDecorations, clearHideTimer, scheduleHide, navigateChange],
  )

  // Bar hover handlers — keep bar alive while hovering it
  const handleBarEnter = useCallback(() => {
    barHoveredRef.current = true
    clearHideTimer()
  }, [clearHideTimer])

  const handleBarLeave = useCallback(() => {
    barHoveredRef.current = false
    setHoveredBlock(null)
  }, [])

  const handleAction = useCallback(
    async (mode: 'stage' | 'discard' | 'unstage') => {
      const patch = selection ? buildPatchForSelection(original, modified, blocks, selection, path) : hoveredBlock ? buildPatchForBlock(original, modified, hoveredBlock, path) : null

      if (!patch) return
      setLoading(true)
      setActionError(null)
      try {
        await applyHunkPatch({ data: { path, patch, mode, workspace } })
        setHoveredBlock(null)
        setSelection(null)
        setBarPos(null)
        await refresh()
        onApplied?.()
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'Action failed')
      } finally {
        setLoading(false)
      }
    },
    [original, modified, blocks, selection, hoveredBlock, path, refresh, workspace, onApplied],
  )

  const showStage = diffMode === 'unstaged'
  const showDiscard = diffMode === 'unstaged'
  const showUnstage = diffMode === 'staged'

  const hasBar = barPos !== null && (hoveredBlock !== null || selection !== null) && diffMode !== 'committed'

  // `false` is the editor's shorthand for the whole file; the object is merged
  // over its defaults, so naming the context width keeps the rest of them.
  const hideUnchangedRegions = useMemo(() => (expanded ? (false as const) : { contextLineCount: 5 }), [expanded])

  return (
    <div ref={fillRef} className='relative h-full'>
      <CodeEditor
        value={modified}
        original={original}
        language={language}
        height={fillHeight}
        line={line}
        // `commit-panel` draws the unified/split control in its own toolbar, so
        // the editor's overlaid copy of it is suppressed rather than left to
        // sit on top of the diff competing with it.
        diffMode={sideBySide ? 'split' : 'unified'}
        showModeToggle={false}
        hideUnchangedRegions={hideUnchangedRegions}
        onMount={handleMount}
      />
      {hasBar && (
        <DiffActionBar
          top={barPos.top}
          right={barPos.right}
          onStage={showStage ? () => handleAction('stage') : undefined}
          onDiscard={showDiscard ? () => handleAction('discard') : undefined}
          onUnstage={showUnstage ? () => handleAction('unstage') : undefined}
          onMouseEnter={handleBarEnter}
          onMouseLeave={handleBarLeave}
          loading={loading}
        />
      )}
      {actionError && <div className='absolute bottom-2 left-2 right-2 z-50 rounded-md border bg-destructive/10 px-3 py-2 text-xs text-destructive'>{actionError}</div>}
    </div>
  )
}

import { legacy } from '@opencroft/client'
import { useEffect, useState } from 'react'

import { useCodeSelectionMount } from '../lib/code-selection'
import type { FileDiff } from '../lib/git-data'
import { langFromPath } from '../lib/lang'
import { useFillHeight } from '../lib/use-fill-height'
import { Skeleton } from '../ui'
import type { DiffNavigator } from './interactive-diff-viewer'
import { InteractiveDiffViewer } from './interactive-diff-viewer'

const { CodeEditor } = legacy

type DiffMode = 'unstaged' | 'staged' | 'committed'

interface FileDiffViewerProps {
  /** Path of the file being viewed */
  path: string
  /** Fetcher that returns original/modified content */
  fetchDiff: () => Promise<FileDiff>
  /** true = only show modified content (no diff) */
  singlePane?: boolean
  /** Enable hunk-level stage/discard/unstage actions */
  interactive?: boolean
  /** Which side of the staging area we're viewing */
  diffMode?: DiffMode
  /** Side-by-side or unified diff layout */
  sideBySide?: boolean
  /** false (default) collapses unchanged regions to a few lines of context around each change. Interactive mode only. */
  expanded?: boolean
  /** Reveal and place the cursor on this 1-based line once, on mount. */
  line?: number
  /** Called once the diff editor's change navigator is ready, or null when it's gone. Interactive mode only. */
  onNavigatorReady?: (navigator: DiffNavigator | null) => void
}

export function FileDiffViewer({
  path,
  fetchDiff,
  singlePane = false,
  interactive = false,
  diffMode = 'committed',
  sideBySide = true,
  expanded,
  line,
  onNavigatorReady,
}: FileDiffViewerProps) {
  const [diff, setDiff] = useState<FileDiff | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Bumped after a stage/discard/unstage action so the now-changed diff is
  // re-fetched (the route loader refresh doesn't re-run this fetcher).
  const [reloadKey, setReloadKey] = useState(0)
  const [fillRef, fillHeight] = useFillHeight()
  const reportSelectionOnMount = useCodeSelectionMount(path)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    fetchDiff()
      .then((d) => {
        if (active) setDiff(d)
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [fetchDiff, reloadKey])

  const language = langFromPath(path)

  if (loading) {
    return (
      <div className='flex h-full flex-col gap-3 p-4'>
        <div className='flex gap-3'>
          <Skeleton className='h-4 w-1/3' />
          <Skeleton className='h-4 w-1/4' />
        </div>
        {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((k) => (
          <Skeleton key={k} className='h-4 w-full' />
        ))}
      </div>
    )
  }

  if (error) {
    return <div className='flex h-full items-center justify-center text-xs text-destructive'>{error}</div>
  }

  if (!diff) {
    return null
  }

  if (singlePane) {
    return <CodeEditor value={diff.modified} language={language} height='100%' line={line} onMount={reportSelectionOnMount} />
  }

  if (interactive) {
    return (
      <InteractiveDiffViewer
        path={path}
        original={diff.original}
        modified={diff.modified}
        language={language}
        diffMode={diffMode}
        sideBySide={sideBySide}
        expanded={expanded}
        line={line}
        onNavigatorReady={onNavigatorReady}
        onApplied={() => setReloadKey((k) => k + 1)}
      />
    )
  }

  return (
    <div ref={fillRef} className='h-full'>
      <CodeEditor
        value={diff.modified}
        original={diff.original}
        language={language}
        height={fillHeight}
        line={line}
        // The layout is the caller's — `commit-panel` draws this control in its
        // own toolbar, so the editor's overlaid copy of it is suppressed rather
        // than left to sit on top of the diff competing with it.
        diffMode={sideBySide ? 'split' : 'unified'}
        showModeToggle={false}
        // This view has always shown the whole file, which is also what a
        // deep-linked `line` needs: folding can close over the very line being
        // revealed.
        hideUnchangedRegions={false}
      />
    </div>
  )
}

import { SquareMinus, SquarePen, SquarePlus } from 'lucide-react'

import { addToGitignore, createPatch, discardFiles } from '../lib/actions/changes'
import { typeIcon } from '../lib/file-type-icon'
import { useGit } from '../lib/git-context'
import { stageFiles, unstageFiles } from '../lib/git-data'
import type { FileChange, SelectModifiers } from '../lib/types'
import { useGitAction } from '../lib/use-git-action'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '../ui'
import { EntryRow } from './entry-row'
import { useGitDialogs } from './git-dialogs'

interface FileEntryProps {
  file: FileChange
  label?: string
  depth?: number
  selected?: boolean
  rounding?: string
  /** Flat list (no expandable siblings) — drops the reserved chevron column. */
  flat?: boolean
  onSelect?: (modifiers: SelectModifiers) => void
  onActivate?: () => void
  /** True when this row lives in the Staged section, false/undefined when unstaged. */
  staged?: boolean
  /** Paths a stage/unstage action should affect (the whole selection if this row is part of it, else just this path). */
  actionPaths?: string[]
  /** Every path in this section, for the "stage/unstage all" entries. */
  allPaths?: string[]
}

function statusIcon(status: FileChange['status']) {
  if (status === 'added' || status === 'untracked') {
    return <SquarePlus className='size-4 shrink-0 text-success' />
  }
  if (status === 'deleted') {
    return <SquareMinus className='size-4 shrink-0 text-destructive' />
  }
  return <SquarePen className='size-4 shrink-0 text-warning' />
}

function downloadPatch(filename: string, patch: string) {
  const blob = new Blob([patch], { type: 'text/x-patch' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function FileEntry({
  file,
  label,
  depth,
  selected,
  rounding,
  flat,
  onSelect,
  onActivate,
  staged,
  actionPaths,
  allPaths,
}: FileEntryProps) {
  const { workspace } = useGit()
  const { run, error } = useGitAction()
  const { confirm } = useGitDialogs()

  const path = file.path
  const targets = actionPaths && actionPaths.length > 0 ? actionPaths : [path]

  const createPatchForSelection = async () => {
    const r = await createPatch({
      data: { paths: targets, staged, workspace },
    })
    downloadPatch(r.filename, r.patch)
    await navigator.clipboard.writeText(r.patch)
  }

  const discard = async () => {
    const ok = await confirm({
      title: 'Discard changes?',
      description: `Working-tree changes for ${targets.length} path(s) will be lost.`,
      confirmLabel: 'Discard',
      danger: true,
    })
    if (ok) {
      await run(discardFiles, { paths: targets })
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className='min-w-0' />}>
        <EntryRow
          label={label ?? file.path}
          icon={
            <>
              {statusIcon(file.status)}
              {typeIcon(file.path)}
            </>
          }
          depth={depth}
          selected={selected}
          rounding={rounding}
          reserveChevron={!flat}
          onSelect={onSelect}
          onActivate={onActivate}
          trailing={
            <>
              {file.additions > 0 && <span className='shrink-0 font-mono text-success'>+{file.additions}</span>}
              {file.deletions > 0 && <span className='shrink-0 font-mono text-destructive'>-{file.deletions}</span>}
            </>
          }
        />
      </ContextMenuTrigger>
      <ContextMenuContent className='w-48'>
        {staged ? (
          <>
            <ContextMenuItem onClick={() => run(unstageFiles, { paths: targets })}>Unstage</ContextMenuItem>
            {allPaths && allPaths.length > 0 && (
              <ContextMenuItem onClick={() => run(unstageFiles, { paths: allPaths })}>Unstage all</ContextMenuItem>
            )}
          </>
        ) : (
          <>
            <ContextMenuItem onClick={() => run(stageFiles, { paths: targets })}>Stage</ContextMenuItem>
            {allPaths && allPaths.length > 0 && (
              <ContextMenuItem onClick={() => run(stageFiles, { paths: allPaths })}>Stage all</ContextMenuItem>
            )}
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={createPatchForSelection}>Create patch</ContextMenuItem>
        <ContextMenuItem onClick={() => run(addToGitignore, { patterns: [path] })}>Add to .gitignore</ContextMenuItem>
        <ContextMenuItem onClick={() => navigator.clipboard.writeText(path)}>Copy path</ContextMenuItem>
        {!staged && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant='destructive' onClick={discard}>
              Discard changes...
            </ContextMenuItem>
          </>
        )}
        {error && <div className='px-2 py-1 text-[11px] text-destructive bg-destructive/10 rounded'>{error}</div>}
      </ContextMenuContent>
    </ContextMenu>
  )
}

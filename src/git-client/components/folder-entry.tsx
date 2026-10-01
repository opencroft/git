import { ChevronRight } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { discardFiles } from '../lib/actions/changes'
import { stageFiles } from '../lib/git-data'
import type { SelectModifiers } from '../lib/types'
import { useGitAction } from '../lib/use-git-action'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '../ui'
import { EntryRow } from './entry-row'
import { useGitDialogs } from './git-dialogs'

interface FolderEntryProps {
  label: string
  icon?: ReactNode
  depth?: number
  emphasized?: boolean
  defaultOpen?: boolean
  open?: boolean
  onToggle?: () => void
  selected?: boolean
  rounding?: string
  onSelect?: (modifiers: SelectModifiers) => void
  onActivate?: () => void
  children: ReactNode
  /**
   * When set, the folder header gets a change context menu acting on this
   * directory path (its whole subtree, deduped server-side).
   */
  menuPath?: string
  /**
   * Arbitrary context-menu content (ContextMenu*Item nodes) attached to the
   * folder header row only — children keep their own menus.
   */
  menu?: ReactNode
  /** Trailing controls for the folder header row, e.g. a VisibilityToggle. */
  trailing?: ReactNode
}

function FolderMenu({ path, row }: { path: string; row: ReactNode }) {
  const { run, error } = useGitAction()
  const { confirm } = useGitDialogs()

  const discard = async () => {
    const ok = await confirm({
      title: 'Discard folder?',
      description: `All working-tree changes under "${path}" will be lost.`,
      confirmLabel: 'Discard',
      danger: true,
    })
    if (ok) {
      await run(discardFiles, { paths: [path] })
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className='min-w-0' />}>
        {row}
      </ContextMenuTrigger>
      <ContextMenuContent className='w-48'>
        <ContextMenuItem onClick={() => run(stageFiles, { paths: [path] })}>Stage all in folder</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant='destructive' onClick={discard}>
          Discard folder...
        </ContextMenuItem>
        {error && <div className='px-2 py-1 text-[11px] text-destructive bg-destructive/10 rounded'>{error}</div>}
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function FolderEntry({
  label,
  icon,
  depth = 0,
  emphasized,
  defaultOpen = true,
  open: openProp,
  onToggle,
  selected,
  rounding,
  onSelect,
  onActivate,
  children,
  menuPath,
  menu,
  trailing,
}: FolderEntryProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const open = openProp ?? internalOpen
  const toggle = onToggle ?? (() => setInternalOpen((value) => !value))

  const row = (
    <EntryRow
      label={label}
      icon={icon}
      depth={depth}
      emphasized={emphasized}
      selected={selected}
      rounding={rounding}
      onSelect={onSelect ?? toggle}
      onActivate={onActivate}
      trailing={trailing}
      leading={
        <button
          type='button'
          aria-label='Toggle folder'
          className='flex size-4 shrink-0 items-center justify-center text-muted-foreground'
          onClick={(e) => {
            e.stopPropagation()
            toggle()
          }}
        >
          <ChevronRight className={`size-4 transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
      }
    />
  )

  let header: ReactNode
  if (menuPath) {
    header = <FolderMenu path={menuPath} row={row} />
  } else if (menu) {
    header = (
      <ContextMenu>
        <ContextMenuTrigger render={<div className='min-w-0' />}>
          {row}
        </ContextMenuTrigger>
        <ContextMenuContent>{menu}</ContextMenuContent>
      </ContextMenu>
    )
  } else {
    header = row
  }

  return (
    <div className='min-w-0'>
      {header}
      {open && <div className='min-w-0'>{children}</div>}
    </div>
  )
}

import { Folder, FolderTree } from 'lucide-react'

import {
  deinitSubmodule,
  initSubmodule,
  removeSubmodule,
  syncSubmodule,
  updateSubmodule,
} from '../lib/actions/submodules'
import type { GitSubmodule } from '../lib/types'
import { useGitAction } from '../lib/use-git-action'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '../ui'
import { EntryRow } from './entry-row'
import { FolderEntry } from './folder-entry'
import { useGitDialogs } from './git-dialogs'

interface SubmodulesTreeProps {
  submodules: GitSubmodule[]
  depth: number
}

function SubmoduleRow({ sub, depth }: { sub: GitSubmodule; depth: number }) {
  const { run } = useGitAction()
  const { confirm } = useGitDialogs()

  const parts = sub.path.split('/')
  const label = parts[parts.length - 1]

  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className='min-w-0' />}>
        <EntryRow
          label={label}
          subtitle={sub.path}
          icon={<FolderTree className='size-4 shrink-0 text-muted-foreground mt-0.5' />}
          depth={depth}
        />
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onClick={() =>
            run(updateSubmodule, {
              path: sub.path,
              init: true,
              recursive: true,
            })
          }
        >
          Update
        </ContextMenuItem>
        <ContextMenuItem onClick={() => run(initSubmodule, { path: sub.path })}>Init</ContextMenuItem>
        <ContextMenuItem onClick={() => run(syncSubmodule, { path: sub.path })}>Sync URL</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => navigator.clipboard.writeText(sub.path)}>Copy path</ContextMenuItem>
        <ContextMenuItem onClick={() => navigator.clipboard.writeText(sub.url)}>Copy URL</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant='destructive'
          onClick={async () => {
            const ok = await confirm({
              title: 'Deinit submodule?',
              description: sub.path,
              danger: true,
            })
            if (ok) {
              await run(deinitSubmodule, { path: sub.path, force: true })
            }
          }}
        >
          Deinit...
        </ContextMenuItem>
        <ContextMenuItem
          variant='destructive'
          onClick={async () => {
            const ok = await confirm({
              title: 'Remove submodule?',
              description: sub.path,
              danger: true,
            })
            if (ok) {
              await run(removeSubmodule, { path: sub.path })
            }
          }}
        >
          Remove submodule...
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function SubmodulesTree({ submodules, depth }: SubmodulesTreeProps) {
  const { error } = useGitAction()

  const groups = new Map<string, GitSubmodule[]>()
  const standalone: GitSubmodule[] = []

  for (const sub of submodules) {
    const parts = sub.path.split('/')
    if (parts.length > 1) {
      const prefix = parts[0]
      const list = groups.get(prefix) ?? []
      list.push(sub)
      groups.set(prefix, list)
    } else {
      standalone.push(sub)
    }
  }

  return (
    <div className='pb-1 min-w-0'>
      {error && <div className='px-2 py-1 text-[11px] text-destructive bg-destructive/10 rounded'>{error}</div>}
      {[...groups.entries()].map(([prefix, items]) => (
        <FolderEntry
          key={prefix}
          label={prefix}
          depth={depth}
          icon={<Folder className='size-4 shrink-0 text-muted-foreground' />}
        >
          {items.map((sub) => (
            <SubmoduleRow key={sub.path} sub={sub} depth={depth + 1} />
          ))}
        </FolderEntry>
      ))}
      {standalone.map((sub) => (
        <SubmoduleRow key={sub.path} sub={sub} depth={depth} />
      ))}
      {submodules.length === 0 && (
        <p className='px-2 py-2 text-[11px] text-muted-foreground text-center'>No submodules</p>
      )}
    </div>
  )
}

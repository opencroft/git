import { Folder, Tag } from 'lucide-react'

import { createBranch } from '../lib/actions/branches'
import { checkoutCommit, mergeRef, resetTo } from '../lib/actions/commits'
import { deleteRemoteTag, deleteTag, pushTag } from '../lib/actions/tags'
import type { GitTag } from '../lib/types'
import { useGitAction } from '../lib/use-git-action'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '../ui'
import { EntryRow } from './entry-row'
import { FolderEntry } from './folder-entry'
import { useGitDialogs } from './git-dialogs'

interface TagsTreeProps {
  tags: GitTag[]
  depth: number
}

export function TagsTree({ tags, depth }: TagsTreeProps) {
  const { run, error } = useGitAction()
  const { confirm, prompt } = useGitDialogs()

  const groups = new Map<string, GitTag[]>()
  const standalone: GitTag[] = []

  for (const tag of tags) {
    const parts = tag.name.split('/')
    if (parts.length > 1) {
      const prefix = parts[0]
      const list = groups.get(prefix) ?? []
      list.push(tag)
      groups.set(prefix, list)
    } else {
      standalone.push(tag)
    }
  }

  return (
    <div className='pb-1'>
      {error && (
        <div className='mx-2 mb-1 px-2 py-1 text-[11px] text-destructive bg-destructive/10 rounded'>{error}</div>
      )}
      {[...groups.entries()].map(([prefix, items]) => (
        <FolderEntry
          key={prefix}
          label={prefix}
          depth={depth}
          icon={<Folder className='size-4 shrink-0 text-muted-foreground' />}
        >
          {items.map((tag) => (
            <TagRow
              key={tag.name}
              tag={tag}
              label={tag.name.split('/').slice(1).join('/')}
              depth={depth + 1}
              run={run}
              confirm={confirm}
              prompt={prompt}
            />
          ))}
        </FolderEntry>
      ))}
      {standalone.map((tag) => (
        <TagRow key={tag.name} tag={tag} label={tag.name} depth={depth} run={run} confirm={confirm} prompt={prompt} />
      ))}
      {tags.length === 0 && <p className='px-2 py-2 text-[11px] text-muted-foreground text-center'>No tags</p>}
    </div>
  )
}

function TagRow({
  tag,
  label,
  depth,
  run,
  confirm,
  prompt,
}: {
  tag: GitTag
  label: string
  depth: number
  run: ReturnType<typeof useGitAction>['run']
  confirm: ReturnType<typeof useGitDialogs>['confirm']
  prompt: ReturnType<typeof useGitDialogs>['prompt']
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className='min-w-0' />}>
        <EntryRow
          label={label}
          icon={<Tag className='size-4 shrink-0 text-muted-foreground' />}
          depth={depth}
          title='Double-click to checkout'
          onActivate={() => {
            void run(checkoutCommit, { hash: tag.hash })
          }}
        />
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => run(checkoutCommit, { hash: tag.hash })}>Checkout (detached)</ContextMenuItem>
        <ContextMenuItem
          onClick={async () => {
            const name = await prompt({
              title: 'Branch name',
              required: true,
            })
            if (!name) {
              return
            }
            await run(createBranch, {
              name,
              startPoint: tag.name,
              checkout: true,
            })
          }}
        >
          Create branch from tag...
        </ContextMenuItem>
        <ContextMenuItem onClick={() => run(mergeRef, { ref: tag.name })}>Merge into current</ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>Reset current to here</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem
              onClick={async () => {
                const ok = await confirm({
                  title: 'Reset (soft) to tag?',
                  description: tag.name,
                })
                if (ok) {
                  await run(resetTo, { ref: tag.name, mode: 'soft' })
                }
              }}
            >
              Soft...
            </ContextMenuItem>
            <ContextMenuItem
              onClick={async () => {
                const ok = await confirm({
                  title: 'Reset (mixed) to tag?',
                  description: tag.name,
                })
                if (ok) {
                  await run(resetTo, { ref: tag.name, mode: 'mixed' })
                }
              }}
            >
              Mixed...
            </ContextMenuItem>
            <ContextMenuItem
              variant='destructive'
              onClick={async () => {
                const ok = await confirm({
                  title: 'Reset (hard) to tag?',
                  description: tag.name,
                  danger: true,
                })
                if (ok) {
                  await run(resetTo, { ref: tag.name, mode: 'hard' })
                }
              }}
            >
              Hard...
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => run(pushTag, { name: tag.name })}>Push tag</ContextMenuItem>
        <ContextMenuItem onClick={() => navigator.clipboard.writeText(tag.name)}>Copy name</ContextMenuItem>
        <ContextMenuItem onClick={() => navigator.clipboard.writeText(tag.hash)}>Copy hash</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant='destructive'
          onClick={async () => {
            const ok = await confirm({
              title: 'Delete tag?',
              description: tag.name,
              danger: true,
            })
            if (ok) {
              await run(deleteTag, { name: tag.name })
            }
          }}
        >
          Delete tag...
        </ContextMenuItem>
        <ContextMenuItem
          variant='destructive'
          onClick={async () => {
            const ok = await confirm({
              title: 'Delete remote tag?',
              description: tag.name,
              danger: true,
            })
            if (ok) {
              await run(deleteRemoteTag, { name: tag.name })
            }
          }}
        >
          Delete remote tag...
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

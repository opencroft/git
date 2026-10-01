import { Archive } from 'lucide-react'

import { stashApply, stashBranch, stashDrop, stashPop } from '../lib/actions/stashes'
import type { GitStash } from '../lib/types'
import { useGitAction } from '../lib/use-git-action'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '../ui'
import { EntryRow } from './entry-row'
import { useGitDialogs } from './git-dialogs'

interface StashesTreeProps {
  stashes: GitStash[]
  depth: number
}

export function StashesTree({ stashes, depth }: StashesTreeProps) {
  const { run, error } = useGitAction()
  const { confirm, prompt } = useGitDialogs()

  return (
    <div className='pb-1'>
      {error && (
        <div className='mx-2 mb-1 px-2 py-1 text-[11px] text-destructive bg-destructive/10 rounded'>{error}</div>
      )}
      {stashes.map((stash) => (
        <StashRow key={stash.index} stash={stash} depth={depth} run={run} confirm={confirm} prompt={prompt} />
      ))}
      {stashes.length === 0 && <p className='px-2 py-2 text-[11px] text-muted-foreground text-center'>No stashes</p>}
    </div>
  )
}

interface StashRowProps {
  stash: GitStash
  depth: number
  run: ReturnType<typeof useGitAction>['run']
  confirm: ReturnType<typeof useGitDialogs>['confirm']
  prompt: ReturnType<typeof useGitDialogs>['prompt']
}

function StashRow({ stash, depth, run, confirm, prompt }: StashRowProps) {
  const index = stash.index

  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className='min-w-0' />}>
        <EntryRow
          label={stash.message}
          subtitle={`stash@{${index}} on ${stash.branchName}`}
          icon={<Archive className='size-4 shrink-0 text-muted-foreground mt-0.5' />}
          depth={depth}
        />
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => run(stashApply, { index })}>Apply</ContextMenuItem>
        <ContextMenuItem onClick={() => run(stashPop, { index })}>Pop</ContextMenuItem>
        <ContextMenuItem
          onClick={async () => {
            const name = await prompt({
              title: 'Create branch from stash',
              label: 'Branch name',
              required: true,
            })
            if (!name) {
              return
            }
            await run(stashBranch, { index, name })
          }}
        >
          Create branch from stash...
        </ContextMenuItem>
        <ContextMenuItem onClick={() => navigator.clipboard.writeText(`stash@{${index}}`)}>Copy ref</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant='destructive'
          onClick={async () => {
            const ok = await confirm({
              title: 'Drop stash?',
              description: `stash@{${index}} will be permanently removed.`,
              danger: true,
            })
            if (ok) {
              await run(stashDrop, { index })
            }
          }}
        >
          Drop...
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

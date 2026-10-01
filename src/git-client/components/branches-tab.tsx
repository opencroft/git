import { Folder, GitBranch } from 'lucide-react'

import { checkoutBranch, createBranch, deleteBranch, renameBranch, setUpstream } from '../lib/actions/branches'
import { mergeRef, rebaseOnto, resetTo } from '../lib/actions/commits'
import { createTag } from '../lib/actions/tags'
import { useGit } from '../lib/git-context'
import type { GitBranch as GitBranchType, VisibilityMode } from '../lib/types'
import { useGitAction } from '../lib/use-git-action'
import { cn } from 'cn'
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
import { VisibilityToggle } from './visibility-toggle'

type RunFn = ReturnType<typeof useGitAction>['run']

interface BranchesTreeProps {
  branches: GitBranchType[]
  visibilityMap: Map<string, VisibilityMode>
  depth: number
  onSelect: (hash: string) => void
  onToggleWhitelist: (name: string) => void
  onToggleBlacklist: (name: string) => void
  onToggleFolderWhitelist: (names: string[]) => void
  onToggleFolderBlacklist: (names: string[]) => void
}

function BranchItem({
  branch,
  mode,
  depth,
  run,
  onSelect,
  onWhitelist,
  onBlacklist,
}: {
  branch: GitBranchType
  mode: VisibilityMode
  depth: number
  run: RunFn
  onSelect: () => void
  onWhitelist: () => void
  onBlacklist: () => void
}) {
  const { activeBranch } = useGit()
  const { confirm, prompt } = useGitDialogs()

  const name = branch.name
  const tip = branch.tipHash
  const isHead = branch.isHead
  const detached = !activeBranch

  const parts = name.split('/')
  const displayName = parts[parts.length - 1]

  const onCreateBranch = async () => {
    const entered = await prompt({
      title: 'Create branch from here',
      description: `New branch starting at ${name}.`,
      label: 'Branch name',
      placeholder: 'feature/my-branch',
      required: true,
    })
    if (entered) {
      await run(createBranch, {
        name: entered,
        startPoint: name,
        checkout: true,
      })
    }
  }

  const onRename = async () => {
    const entered = await prompt({
      title: 'Rename branch',
      label: 'New name',
      defaultValue: name,
      required: true,
    })
    if (entered && entered !== name) {
      await run(renameBranch, { oldName: name, newName: entered })
    }
  }

  const onCreateTag = async () => {
    const tagName = await prompt({
      title: 'Create tag here',
      description: `Tag pointing at ${name}.`,
      label: 'Tag name',
      placeholder: 'v1.0.0',
      required: true,
    })
    if (!tagName) {
      return
    }
    const message = await prompt({
      title: 'Tag message',
      description: 'Leave empty for a lightweight tag.',
      label: 'Message',
      multiline: true,
    })
    await run(createTag, {
      name: tagName,
      ref: name,
      message: message || undefined,
    })
  }

  const onSetUpstream = async () => {
    const entered = await prompt({
      title: 'Set upstream',
      description: `Track a remote branch for ${name}.`,
      label: 'Upstream',
      placeholder: 'origin/main',
      required: true,
    })
    if (entered) {
      await run(setUpstream, { name, upstream: entered })
    }
  }

  const onReset = async (resetMode: 'soft' | 'mixed' | 'hard') => {
    const ok = await confirm({
      title: `Reset ${activeBranch?.name ?? 'active branch'} to ${displayName}?`,
      description:
        resetMode === 'hard'
          ? 'Hard reset discards uncommitted changes in the working tree.'
          : `${resetMode[0].toUpperCase()}${resetMode.slice(1)} reset moves the branch tip to ${name}.`,
      danger: resetMode === 'hard',
      confirmLabel: 'Reset',
    })
    if (ok) {
      await run(resetTo, { ref: name, mode: resetMode })
    }
  }

  const onDelete = async (force: boolean) => {
    const ok = await confirm({
      title: force ? 'Force delete branch?' : 'Delete branch?',
      description: `This will delete the branch "${name}".`,
      danger: true,
      confirmLabel: 'Delete',
    })
    if (ok) {
      await run(deleteBranch, force ? { name, force: true } : { name })
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className='min-w-0' />}>
        <EntryRow
          label={
            <span className='flex flex-1 items-center gap-1 min-w-0'>
              <span className={cn('truncate min-w-0', isHead && 'font-bold')}>{displayName}</span>
              {isHead && (
                <span className='shrink-0 text-[9px] font-medium text-muted-foreground bg-muted px-1 rounded'>
                  HEAD
                </span>
              )}
            </span>
          }
          icon={<GitBranch className='size-4 shrink-0 text-muted-foreground' />}
          depth={depth}
          dimmed={mode === 'hidden'}
          title='Double-click to checkout'
          trailing={<VisibilityToggle mode={mode} onWhitelist={onWhitelist} onBlacklist={onBlacklist} />}
          onSelect={onSelect}
          onActivate={() => {
            void run(checkoutBranch, { name })
          }}
        />
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem disabled={isHead} onClick={() => run(checkoutBranch, { name })}>
          Checkout
        </ContextMenuItem>
        {!isHead && activeBranch && (
          <ContextMenuItem onClick={() => run(mergeRef, { ref: name })}>
            Merge into {activeBranch.name}
          </ContextMenuItem>
        )}
        <ContextMenuItem disabled={isHead || detached} onClick={() => run(rebaseOnto, { onto: name })}>
          Rebase {activeBranch?.name ?? 'active branch'} onto this
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onCreateBranch}>Create branch from here...</ContextMenuItem>
        <ContextMenuItem onClick={onRename}>Rename...</ContextMenuItem>
        <ContextMenuItem onClick={onCreateTag}>Create tag here...</ContextMenuItem>
        <ContextMenuItem onClick={onSetUpstream}>Set upstream...</ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={detached}>
            Reset {activeBranch?.name ?? 'active branch'} to here
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={() => onReset('soft')}>Soft...</ContextMenuItem>
            <ContextMenuItem onClick={() => onReset('mixed')}>Mixed...</ContextMenuItem>
            <ContextMenuItem variant='destructive' onClick={() => onReset('hard')}>
              Hard...
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => navigator.clipboard.writeText(name)}>Copy branch name</ContextMenuItem>
        <ContextMenuItem onClick={() => navigator.clipboard.writeText(tip)}>Copy tip hash</ContextMenuItem>
        <ContextMenuItem variant='destructive' disabled={isHead} onClick={() => onDelete(false)}>
          Delete...
        </ContextMenuItem>
        <ContextMenuItem variant='destructive' disabled={isHead} onClick={() => onDelete(true)}>
          Delete (force)...
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function BranchesTree({
  branches,
  visibilityMap,
  depth,
  onSelect,
  onToggleWhitelist,
  onToggleBlacklist,
  onToggleFolderWhitelist,
  onToggleFolderBlacklist,
}: BranchesTreeProps) {
  const { run, error } = useGitAction()

  const groups = new Map<string, GitBranchType[]>()
  const standalone: GitBranchType[] = []

  for (const b of branches) {
    const parts = b.name.split('/')
    if (parts.length > 1) {
      const prefix = parts[0]
      const list = groups.get(prefix) ?? []
      list.push(b)
      groups.set(prefix, list)
    } else {
      standalone.push(b)
    }
  }

  return (
    <div className='pb-1 min-w-0'>
      {error && <div className='px-2 py-1 text-[11px] text-destructive bg-destructive/10 rounded'>{error}</div>}
      {[...groups.entries()].map(([prefix, items]) => {
        const childNames = items.map((b) => b.name)
        const folderMode =
          childNames.length > 0 && childNames.every((n) => visibilityMap.get(n) === 'shown')
            ? 'shown'
            : childNames.length > 0 && childNames.every((n) => visibilityMap.get(n) === 'hidden')
              ? 'hidden'
              : 'default'
        return (
          <FolderEntry
            key={prefix}
            label={prefix}
            depth={depth}
            icon={<Folder className='size-4 shrink-0 text-muted-foreground' />}
            trailing={
              <VisibilityToggle
                mode={folderMode}
                onWhitelist={() => onToggleFolderWhitelist(childNames)}
                onBlacklist={() => onToggleFolderBlacklist(childNames)}
              />
            }
          >
            {items.map((b) => (
              <BranchItem
                key={b.name}
                branch={b}
                mode={visibilityMap.get(b.name) ?? 'default'}
                depth={depth + 1}
                run={run}
                onSelect={() => onSelect(b.tipHash)}
                onWhitelist={() => onToggleWhitelist(b.name)}
                onBlacklist={() => onToggleBlacklist(b.name)}
              />
            ))}
          </FolderEntry>
        )
      })}
      {standalone.map((b) => (
        <BranchItem
          key={b.name}
          branch={b}
          mode={visibilityMap.get(b.name) ?? 'default'}
          depth={depth}
          run={run}
          onSelect={() => onSelect(b.tipHash)}
          onWhitelist={() => onToggleWhitelist(b.name)}
          onBlacklist={() => onToggleBlacklist(b.name)}
        />
      ))}
    </div>
  )
}

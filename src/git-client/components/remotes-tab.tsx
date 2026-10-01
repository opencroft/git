import { Cloud, Folder, GitBranch } from 'lucide-react'

import { createBranch } from '../lib/actions/branches'
import { mergeRef } from '../lib/actions/commits'
import {
  checkoutRemoteBranch,
  deleteRemoteBranch,
  fetchRemote,
  pruneRemote,
  pullRemote,
  removeRemote,
  renameRemote,
  setRemoteUrl,
} from '../lib/actions/remotes'
import type { GitBranch as GitBranchType, GitRemote, VisibilityMode } from '../lib/types'
import { useGitAction } from '../lib/use-git-action'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '../ui'
import { EntryRow } from './entry-row'
import { FolderEntry } from './folder-entry'
import { useGitDialogs } from './git-dialogs'
import { VisibilityToggle } from './visibility-toggle'

interface RemotesTreeProps {
  remotes: GitRemote[]
  visibilityMap: Map<string, VisibilityMode>
  depth: number
  onSelect: (hash: string) => void
  onToggleWhitelist: (name: string) => void
  onToggleBlacklist: (name: string) => void
  onToggleFolderWhitelist: (names: string[]) => void
  onToggleFolderBlacklist: (names: string[]) => void
}

function folderMode(names: string[], visibilityMap: Map<string, VisibilityMode>): VisibilityMode {
  if (names.length === 0) {
    return 'default'
  }
  if (names.every((n) => visibilityMap.get(n) === 'shown')) {
    return 'shown'
  }
  if (names.every((n) => visibilityMap.get(n) === 'hidden')) {
    return 'hidden'
  }
  return 'default'
}

export function RemotesTree({
  remotes,
  visibilityMap,
  depth,
  onSelect,
  onToggleWhitelist,
  onToggleBlacklist,
  onToggleFolderWhitelist,
  onToggleFolderBlacklist,
}: RemotesTreeProps) {
  const { error } = useGitAction()

  return (
    <div className='pb-1'>
      {error && (
        <div className='mx-2 mb-1 px-2 py-1 text-[11px] text-destructive bg-destructive/10 rounded'>{error}</div>
      )}
      {remotes.map((remote) => (
        <RemoteGroup
          key={remote.name}
          remote={remote}
          visibilityMap={visibilityMap}
          depth={depth}
          onSelect={onSelect}
          onToggleWhitelist={onToggleWhitelist}
          onToggleBlacklist={onToggleBlacklist}
          onToggleFolderWhitelist={onToggleFolderWhitelist}
          onToggleFolderBlacklist={onToggleFolderBlacklist}
        />
      ))}
    </div>
  )
}

interface RemoteGroupProps {
  remote: GitRemote
  visibilityMap: Map<string, VisibilityMode>
  depth: number
  onSelect: (hash: string) => void
  onToggleWhitelist: (name: string) => void
  onToggleBlacklist: (name: string) => void
  onToggleFolderWhitelist: (names: string[]) => void
  onToggleFolderBlacklist: (names: string[]) => void
}

function RemoteGroup({
  remote,
  visibilityMap,
  depth,
  onSelect,
  onToggleWhitelist,
  onToggleBlacklist,
  onToggleFolderWhitelist,
  onToggleFolderBlacklist,
}: RemoteGroupProps) {
  const { run, error } = useGitAction()
  const { confirm, prompt } = useGitDialogs()

  const shortOf = (b: GitBranchType) => b.name.replace(`${remote.name}/`, '')

  // Group branches into sub-folders by the first "/" segment of the short
  // name, mirroring branches-tab's grouping.
  const groups = new Map<string, GitBranchType[]>()
  const standalone: GitBranchType[] = []
  for (const b of remote.branches) {
    const short = shortOf(b)
    const slash = short.indexOf('/')
    if (slash > -1) {
      const prefix = short.slice(0, slash)
      const list = groups.get(prefix) ?? []
      list.push(b)
      groups.set(prefix, list)
    } else {
      standalone.push(b)
    }
  }

  const allNames = remote.branches.map((b) => b.name)

  const editUrl = async () => {
    const url = await prompt({
      title: 'Edit remote URL',
      label: 'URL',
      defaultValue: remote.url,
      required: true,
    })
    if (url) {
      await run(setRemoteUrl, { name: remote.name, url })
    }
  }

  const rename = async () => {
    const newName = await prompt({
      title: 'Rename remote',
      label: 'Name',
      defaultValue: remote.name,
      required: true,
    })
    if (newName) {
      await run(renameRemote, { oldName: remote.name, newName })
    }
  }

  const removeThisRemote = async () => {
    const ok = await confirm({
      title: 'Remove remote?',
      description: `${remote.name} will be removed.`,
      danger: true,
    })
    if (ok) {
      await run(removeRemote, { name: remote.name })
    }
  }

  return (
    <>
      {error && (
        <div className='mx-2 mb-1 px-2 py-1 text-[11px] text-destructive bg-destructive/10 rounded'>{error}</div>
      )}
      <FolderEntry
        label={remote.name}
        depth={depth}
        icon={<Cloud className='size-4 shrink-0 text-muted-foreground' />}
        trailing={
          <VisibilityToggle
            mode={folderMode(allNames, visibilityMap)}
            onWhitelist={() => onToggleFolderWhitelist(allNames)}
            onBlacklist={() => onToggleFolderBlacklist(allNames)}
          />
        }
        menu={
          <>
            <ContextMenuItem onClick={() => run(fetchRemote, { name: remote.name })}>Fetch</ContextMenuItem>
            <ContextMenuItem onClick={() => run(fetchRemote, { name: remote.name, prune: true })}>
              Fetch and prune
            </ContextMenuItem>
            <ContextMenuItem onClick={() => run(pruneRemote, { name: remote.name })}>Prune</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={editUrl}>Edit URL...</ContextMenuItem>
            <ContextMenuItem onClick={rename}>Rename...</ContextMenuItem>
            <ContextMenuItem onClick={() => navigator.clipboard.writeText(remote.url)}>
              Copy remote address
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant='destructive' onClick={removeThisRemote}>
              Remove remote...
            </ContextMenuItem>
          </>
        }
      >
        {[...groups.entries()].map(([prefix, items]) => {
          const childNames = items.map((b) => b.name)
          return (
            <FolderEntry
              key={prefix}
              label={prefix}
              depth={depth + 1}
              icon={<Folder className='size-4 shrink-0 text-muted-foreground' />}
              trailing={
                <VisibilityToggle
                  mode={folderMode(childNames, visibilityMap)}
                  onWhitelist={() => onToggleFolderWhitelist(childNames)}
                  onBlacklist={() => onToggleFolderBlacklist(childNames)}
                />
              }
            >
              {items.map((b) => (
                <RemoteBranchRow
                  key={b.name}
                  remote={remote}
                  branch={b}
                  mode={visibilityMap.get(b.name) ?? 'default'}
                  depth={depth + 2}
                  onSelect={onSelect}
                  onToggleWhitelist={onToggleWhitelist}
                  onToggleBlacklist={onToggleBlacklist}
                />
              ))}
            </FolderEntry>
          )
        })}
        {standalone.map((b) => (
          <RemoteBranchRow
            key={b.name}
            remote={remote}
            branch={b}
            mode={visibilityMap.get(b.name) ?? 'default'}
            depth={depth + 1}
            onSelect={onSelect}
            onToggleWhitelist={onToggleWhitelist}
            onToggleBlacklist={onToggleBlacklist}
          />
        ))}
      </FolderEntry>
    </>
  )
}

interface RemoteBranchRowProps {
  remote: GitRemote
  branch: GitBranchType
  mode: VisibilityMode
  depth: number
  onSelect: (hash: string) => void
  onToggleWhitelist: (name: string) => void
  onToggleBlacklist: (name: string) => void
}

function RemoteBranchRow({
  remote,
  branch,
  mode,
  depth,
  onSelect,
  onToggleWhitelist,
  onToggleBlacklist,
}: RemoteBranchRowProps) {
  const { run, error } = useGitAction()
  const { confirm, prompt } = useGitDialogs()
  const fullName = branch.name
  const short = fullName.replace(`${remote.name}/`, '')
  const leaf = short.includes('/') ? short.slice(short.lastIndexOf('/') + 1) : short

  return (
    <ContextMenu>
      {error && (
        <div className='mx-2 mb-1 px-2 py-1 text-[11px] text-destructive bg-destructive/10 rounded'>{error}</div>
      )}
      <ContextMenuTrigger render={<div className='min-w-0' />}>
        <EntryRow
          label={leaf}
          icon={<GitBranch className='size-4 shrink-0 text-muted-foreground' />}
          depth={depth}
          title='Double-click to checkout'
          trailing={
            <VisibilityToggle
              mode={mode}
              onWhitelist={() => onToggleWhitelist(fullName)}
              onBlacklist={() => onToggleBlacklist(fullName)}
            />
          }
          onSelect={() => onSelect(branch.tipHash)}
          onActivate={() => {
            void run(checkoutRemoteBranch, {
              remote: remote.name,
              branch: short,
            })
          }}
        />
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onClick={async () => {
            const localName = await prompt({
              title: 'Checkout as local branch',
              label: 'Local branch name',
              defaultValue: short,
              required: true,
            })
            if (localName) {
              await run(checkoutRemoteBranch, {
                remote: remote.name,
                branch: short,
                localName,
              })
            }
          }}
        >
          Checkout as local...
        </ContextMenuItem>
        <ContextMenuItem onClick={() => run(mergeRef, { ref: fullName })}>Merge into current</ContextMenuItem>
        <ContextMenuItem onClick={() => run(pullRemote, { remote: remote.name, branch: short })}>
          Pull this branch
        </ContextMenuItem>
        <ContextMenuItem
          onClick={async () => {
            const name = await prompt({
              title: 'Create local branch from',
              label: 'Branch name',
              defaultValue: short,
              required: true,
            })
            if (name) {
              await run(createBranch, {
                name,
                startPoint: fullName,
                checkout: true,
              })
            }
          }}
        >
          Create local branch from...
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => navigator.clipboard.writeText(fullName)}>Copy name</ContextMenuItem>
        <ContextMenuItem onClick={() => navigator.clipboard.writeText(branch.tipHash)}>Copy hash</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant='destructive'
          onClick={async () => {
            const ok = await confirm({
              title: 'Delete remote branch?',
              description: `${fullName} will be deleted on ${remote.name}.`,
              danger: true,
            })
            if (ok) {
              await run(deleteRemoteBranch, {
                remote: remote.name,
                branch: short,
              })
            }
          }}
        >
          Delete remote branch...
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

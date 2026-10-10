import { TerminalRef, TerminalSelector } from '@opencroft/client/terminal'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { isWorktreeTarget } from '../../../worktreeContext'
import { createBranch } from '../lib/actions/branches'
import { fetchRemote, pullRemote, pushRemote } from '../lib/actions/remotes'
import type { GitData } from '../lib/types'
import { GitToolbar, type GitToolbarRemote } from './git-toolbar'
import { type TerminalFolder, TerminalFolderDialog } from './terminal-folder-dialog'

interface ClientToolbarProps {
  folder: string
  target: string
  /** The repository as last read; `null` before the first answer. */
  data: GitData | null
  loading: boolean
  refresh: () => Promise<void>
  onPlaceChange: (place: TerminalFolder) => void
  onBookmarks: () => void
}

// Remote-tracking refs arrive as "origin/main"; the dialogs offer what the
// remote itself calls them.
function toolbarRemotes(data: GitData | null): GitToolbarRemote[] {
  return (data?.remotes ?? []).map((remote) => ({
    name: remote.name,
    branches: remote.branches.map((branch) => branch.name.slice(remote.name.length + 1)),
  }))
}

/**
 * The kit's toolbar wired to this client: git actions through the `gitui`
 * server functions, the terminal and folder through the host's picker.
 */
export function ClientToolbar({
  folder,
  target,
  data,
  loading,
  refresh,
  onPlaceChange,
  onBookmarks,
}: ClientToolbarProps) {
  const [picking, setPicking] = useState(false)
  const [fetching, setFetching] = useState(false)
  const remotes = useMemo(() => toolbarRemotes(data), [data])
  const branches = useMemo(() => (data?.branches ?? []).map(({ name, upstream }) => ({ name, upstream })), [data])
  const currentBranch = data?.branches.find((branch) => branch.isHead)?.name
  const repoOpen = Boolean(data && !data.error)

  const onRefresh = useCallback(async () => {
    setFetching(true)
    try {
      // A folder that is not a repository has nothing to fetch; the reload
      // below is what shows why.
      if (repoOpen) {
        await fetchRemote({ data: { prune: true } })
      }
    } catch (err) {
      toast.error(`Fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      await refresh()
      setFetching(false)
    }
  }, [repoOpen, refresh])

  // A failed pull still changes the working tree (a conflict leaves the merge
  // in progress), so the repository is re-read whether or not git refused.
  const thenRefresh = useCallback(
    async (work: Promise<void>) => {
      try {
        await work
      } finally {
        await refresh()
      }
    },
    [refresh],
  )

  const openPlace = useCallback(
    (place: TerminalFolder) => {
      // A worktree's terminal already stands in its checkout. Any other
      // terminal starts wherever it starts, which is not a repository to open.
      if (!place.folder && !isWorktreeTarget(place.terminal)) {
        throw new Error("This terminal isn't a worktree. Enter the folder of a repository on it.")
      }
      onPlaceChange(place)
    },
    [onPlaceChange],
  )

  const name = folder.split('/').filter(Boolean).pop()

  return (
    <>
      <GitToolbar
        terminal={
          target ? (
            <>
              <TerminalRef target={target} className='min-w-0 truncate' />
              {name ? <span className='shrink-0 text-muted-foreground'>· {name}</span> : null}
            </>
          ) : (
            <span className='text-muted-foreground'>Choose a terminal</span>
          )
        }
        onBookmarks={onBookmarks}
        onPickTerminal={() => setPicking(true)}
        onRefresh={onRefresh}
        refreshing={fetching || loading}
        currentBranch={currentBranch}
        branches={branches}
        remotes={remotes}
        onPull={({ remote, branch }) => thenRefresh(pullRemote({ data: { remote, branch } }))}
        onPush={({ localBranch, remote, remoteBranch, setUpstream, tags, force }) =>
          thenRefresh(pushRemote({ data: { remote, branch: localBranch, remoteBranch, setUpstream, tags, force } }))
        }
        onCreateBranch={({ name: branch }) => thenRefresh(createBranch({ data: { name: branch, checkout: true } }))}
      />
      {/* No `spaceSlug`, deliberately: the client is not bound to the workspace
          it was opened from and may be pointed at any terminal in any space. */}
      <TerminalFolderDialog
        open={picking}
        onOpenChange={setPicking}
        defaultValue={{ terminal: target, folder }}
        renderTerminalPicker={({ value, onChange }) => (
          <TerminalSelector value={value} onChange={onChange} placeholder='Select a terminal' />
        )}
        onSubmit={openPlace}
      />
    </>
  )
}

import { invoke } from '@opencroft/client/actions'
import type { AppComponentProps } from '@opencroft/client/app'
import { ChatDock } from '@opencroft/client/chat'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { isWorktreeTarget, joinWorkspacePath, worktreeHandleForRelPath } from '../worktreeContext'
import { GitClient } from './git-client/git-client'
import { GitRepoList, type Repo, type RepoDeletionCheck } from './workspace/repo-list'

/**
 * How this app addresses its workspace in the `git.*` server actions: the Git
 * App instance's terminal target and folder. Spread into every action's params.
 * Host wiring, so it lives here rather than with the screen that renders the
 * repositories -- that one is handed values and hands back callbacks.
 */
export interface WorkspaceRef {
  target: string
  folder: string
}

interface DeepLink {
  repository: string
  /**
   * The terminal the CLIENT is pointed at, which need not be the instance's
   * own: the client is free-standing and may be sent at any terminal source in
   * any space. It rides the link for the reason the repository does -- a view
   * of another machine should survive a reload and be sendable to someone.
   */
  terminal: string
  file: string
  line?: number
}

/**
 * Where the client is pointed: the terminal it reads through, and the path
 * within it. A WORKTREE is addressed by its own handle and carries no path --
 * the handle already resolves to that checkout's cwd, so re-deriving a path
 * beside it would only be a second spelling of the same place, and a stale one
 * as soon as the workspace folder moves.
 */
interface LastPlace {
  repository: string
  terminal: string
}

/** A place worth returning to: a path, or a terminal that IS a checkout. */
function isPlace(place: LastPlace): boolean {
  return Boolean(place.repository) || isWorktreeTarget(place.terminal)
}

// Per space AND per added instance, because two Git Apps in one space are two
// workspaces and remembering one place for both would send the reader
// somewhere they never were. localStorage is already per reader, so the key
// carries the other two halves.
function memoryKey(spaceSlug: string, instanceId: string): string {
  return `git.${spaceSlug}.${instanceId}`
}

function readLastPlace(key: string): LastPlace | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const raw = window.localStorage.getItem(key)
    const parsed = raw ? (JSON.parse(raw) as Partial<LastPlace>) : null
    // A remembered place with no repository is not a place to return to, so it
    // reads as nothing remembered -- which is what hides the control offering it.
    if (!parsed) {
      return null
    }
    const place = { repository: parsed.repository ?? '', terminal: parsed.terminal ?? '' }
    return isPlace(place) ? place : null
  } catch {
    return null
  }
}

function writeLastPlace(key: string, place: LastPlace): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(place))
  } catch {
    // A full or blocked store costs the reader a shortcut, never a navigation.
  }
}

/** Splits a "path/to/file.tsx:42" style file param into its path and 1-based line. */
function parseFileParam(raw: string): { path: string; line?: number } {
  const match = raw.match(/^(.*):(\d+)$/)
  if (!match) {
    return { path: raw }
  }
  return { path: match[1], line: Number(match[2]) }
}

// Deep-linking: reflect what the client has open — the repository folder, the
// terminal it is reading through, and the selected file (optionally with a
// :line suffix) — as `?repository=&terminal=&file=`, so a view is shareable
// and survives a reload. An empty repository is the workspace's repo list, and
// there the terminal is absent too: the list always reads through the
// instance's own, so a link naming one would describe a screen that ignores it.
// Read once on mount; written via replaceState (not pushState) so browsing
// files doesn't spam browser history.
function readDeepLink(): DeepLink {
  if (typeof window === 'undefined') {
    return { repository: '', terminal: '', file: '' }
  }
  const params = new URLSearchParams(window.location.search)
  const { path, line } = parseFileParam(params.get('file') ?? '')
  return {
    repository: params.get('repository') ?? '',
    terminal: params.get('terminal') ?? '',
    file: path,
    line,
  }
}

function writeDeepLink(patch: Partial<Pick<DeepLink, 'repository' | 'terminal' | 'file'>>): void {
  if (typeof window === 'undefined') {
    return
  }
  const params = new URLSearchParams(window.location.search)
  for (const key of ['repository', 'terminal', 'file'] as const) {
    const value = key in patch ? patch[key] : params.get(key)
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
  }
  const qs = params.toString()
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
  window.history.replaceState(null, '', url)
}

/** The workspace's front page: its repositories and worktrees, with clone and open. */
function WorkspaceBrowser({
  ws,
  onOpen,
  onOpenClient,
}: {
  ws: WorkspaceRef
  onOpen: (relPath: string) => void
  onOpenClient?: () => void
}) {
  const [repos, setRepos] = useState<Repo[] | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setRepos((await invoke('git.listRepos', ws)) as Repo[])
    } catch {
      setRepos([])
    } finally {
      setLoading(false)
    }
  }, [ws])

  useEffect(() => {
    refresh()
  }, [refresh])

  // The screen reports what was pressed and shows progress until the promise
  // settles. Reaching git, re-reading the list and saying what went wrong are
  // this side's job -- which is why the failure is re-thrown after the message
  // rather than swallowed: the row it came from restores what was typed only
  // if it sees the rejection.
  const run = useCallback(
    async (action: string, params: Record<string, unknown>, done: string, failed: string) => {
      try {
        await invoke(action, { ...ws, ...params })
        await refresh()
        toast.success(done)
      } catch (err) {
        toast.error(`${failed}: ${(err as Error).message ?? String(err)}`)
        throw err
      }
    },
    [ws, refresh],
  )

  // Asked when a delete confirm opens. Its failure is the confirm's to show,
  // so it is passed back rather than toasted here. The confirm lists the
  // worktrees that are deleted; one kept in place is already among the blockers.
  const checkDelete = useCallback(
    async (repo: Repo): Promise<RepoDeletionCheck> => {
      const report = (await invoke('git.inspectRepoDeletion', { ...ws, repo: repo.name })) as {
        worktrees: { name: string; branch: string; removable: boolean }[]
        blockers: string[]
      }
      return { worktrees: report.worktrees.filter((w) => w.removable), blockers: report.blockers }
    },
    [ws],
  )

  return (
    <GitRepoList
      repos={repos}
      loading={loading}
      onRefresh={refresh}
      onOpenClient={onOpenClient}
      onOpen={onOpen}
      onClone={(url, { bare }) =>
        run(
          bare ? 'git.cloneBare' : 'git.clone',
          { url },
          bare ? 'Repository cloned (bare)' : 'Repository cloned',
          'Clone failed',
        )
      }
      onCreateRepo={(repo) =>
        run(
          'git.createRepo',
          { name: repo.name, bare: repo.bare, initialBranch: repo.initialBranch },
          `Created ${repo.name}`,
          'Create failed',
        )
      }
      onCheckDelete={checkDelete}
      onDeleteRepo={(repo, { force }) =>
        run('git.deleteRepo', { repo: repo.name, force }, `Deleted ${repo.name}`, 'Delete failed')
      }
      onAddWorktree={(repo, worktree) =>
        run(
          'git.addWorktree',
          { repo: repo.name, name: worktree.name, base: worktree.base },
          'Worktree added',
          'Add worktree failed',
        )
      }
      onRemoveWorktree={(repo, worktree) =>
        run(
          'git.removeWorktree',
          { repo: repo.name, name: worktree.name },
          `Removed worktree ${worktree.name}`,
          'Remove worktree failed',
        )
      }
    />
  )
}

/**
 * The Git App's component: one instance = one workspace (a terminal source
 * plus a folder of repositories). Opens on the repository list; opening a
 * repository or worktree shows the full git client, with the chat anchored to
 * the SPACE the instance was added to.
 */
export function GitAppView({ instanceId, spaceSlug, params }: AppComponentProps) {
  const target = params.terminal ?? ''
  const folder = (params.folder ?? '').replace(/\/+$/, '')
  const ws = useMemo<WorkspaceRef>(() => ({ target, folder }), [target, folder])

  const key = useMemo(() => memoryKey(spaceSlug, instanceId), [spaceSlug, instanceId])

  const [initial] = useState(readDeepLink)
  const [repository, setRepository] = useState(initial.repository)
  // The link wins over the instance's own terminal, so a shared view opens on
  // the machine it describes rather than on this workspace's.
  const [terminal, setTerminal] = useState(initial.terminal || target)
  // The linked file belongs to the place the link opened; any other place the
  // reader moves to opens with no file.
  const [linkedFile, setLinkedFile] = useState<{ path: string; line?: number }>({
    path: initial.file,
    line: initial.line,
  })
  const [remembered, setRemembered] = useState(() => readLastPlace(key))

  const remember = useCallback(
    (place: LastPlace) => {
      if (!isPlace(place)) {
        return
      }
      writeLastPlace(key, place)
      setRemembered(place)
    },
    [key],
  )

  const openAt = useCallback(
    (place: LastPlace) => {
      setRepository(place.repository)
      setTerminal(place.terminal)
      setLinkedFile({ path: '' })
      writeDeepLink({ repository: place.repository, terminal: place.terminal, file: '' })
      remember(place)
    },
    [remember],
  )

  // Back to the list clears both from the link rather than keeping them: that
  // screen always reads through the instance's own terminal, so a link naming
  // another would describe a screen that ignores it. Where the reader was is
  // kept in memory instead, which is what the list's own control offers back.
  const backToList = useCallback(() => {
    setRepository('')
    setTerminal(target)
    setLinkedFile({ path: '' })
    writeDeepLink({ repository: '', terminal: '', file: '' })
  }, [target])

  // A worktree opens as its own git handle, with no path: the handle is the
  // address the App already publishes for that checkout, and the host resolves
  // it -- through the identity form "<instanceId>/<handleId>" -- to a context
  // whose cwd IS the checkout. A repository has no handle, so it opens the only
  // way it can, as a path read through the instance's own terminal.
  const openFromList = useCallback(
    (relPath: string) => {
      const handleId = worktreeHandleForRelPath(relPath)
      openAt(
        handleId
          ? { repository: '', terminal: `${instanceId}/${handleId}` }
          : { repository: joinWorkspacePath(folder, relPath), terminal: target },
      )
    },
    [instanceId, folder, target, openAt],
  )

  // The client's picker hands back a terminal and a folder together; opening
  // them is the same move as opening a place from memory.
  const changePlace = useCallback(
    (next: { terminal: string; folder: string }) => openAt({ repository: next.folder, terminal: next.terminal }),
    [openAt],
  )

  const openClient = useCallback(() => {
    if (remembered) {
      openAt(remembered)
    }
  }, [remembered, openAt])

  const onFileChange = useCallback((next?: string) => {
    writeDeepLink({ file: next ?? '' })
  }, [])

  // Open on a path, or on a terminal that is itself a checkout -- a worktree
  // handle carries the location with no path beside it.
  const clientOpen = Boolean(repository) || isWorktreeTarget(terminal)

  const body = clientOpen ? (
    <GitClient
      folder={repository}
      target={terminal}
      onPlaceChange={changePlace}
      onBookmarks={backToList}
      initialFilePath={linkedFile.path || undefined}
      initialFileLine={linkedFile.line}
      onFileChange={onFileChange}
    />
  ) : (
    <WorkspaceBrowser ws={ws} onOpen={openFromList} onOpenClient={remembered ? openClient : undefined} />
  )

  // The chat's whole chrome -- launcher, docking, floating window, mobile
  // cover -- is the host's ChatDock, the same surface the space canvas mounts.
  // The app contributes only which thread is this instance's default: the
  // instance's own, since the conversation is about this workspace. The
  // selection scope is the host's, around the whole App page; the client
  // publishes into it what it has open.
  return (
    <ChatDock space={spaceSlug} id={`git-${instanceId}`} title={`Chat · ${spaceSlug}`}>
      <div className='min-h-0 min-w-0 flex-1 overflow-hidden'>{body}</div>
    </ChatDock>
  )
}

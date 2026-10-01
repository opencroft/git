import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import host, { invoke, toast } from '@ext/host'
import type { AppComponentProps } from '@opencroft/client'

import { isWorktreeTarget, joinWorkspacePath, worktreeHandleForRelPath, worktreeRelPath } from '../worktreeContext'

import { GitClient } from './git-client/git-client'
import { type CodeSelection, CodeSelectionProvider } from './git-client/lib/code-selection'
import { Button } from './git-client/ui'
import { GitRepoList, type Repo } from './workspace/repo-list'

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

// Taken off the host object rather than as named imports: the shim exports a
// fixed list of names plus the whole object as its default, and these are
// newer than that list. Read defensively so a host without them renders the
// app without a chat instead of failing to mount.
//
// The chat's whole chrome -- launcher, docking, floating window, mobile
// cover -- is the host's ChatDock, the same surface the space canvas mounts.
// The app contributes only what is its own: the selection bridge and which
// thread is this instance's default.
const ChatDock = host?.ChatDock
const SelectionProvider = host?.SelectionProvider
const useSelection = host?.useSelection

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

// Publishes whatever the reader currently has open as the scope's selection,
// so the chat beside it can carry that context into a message. Renders
// nothing -- it is wiring, and it lives in its own component because the hook
// has to run inside the provider.
function GitSelectionBridge({
  repository,
  file,
  line,
  code,
}: {
  repository: string
  file: string
  line?: number
  code: CodeSelection | null
}) {
  const { setSelection, clearSelection } = useSelection()

  // Highlighted code wins over the bare file: it is the more specific thing
  // the reader is pointing at, and it carries the lines to quote.
  const codeForFile = code && code.path === file ? code : null
  const name = file.split('/').pop() ?? file
  const label = codeForFile
    ? `${name}:${codeForFile.startLine} · ${codeForFile.endLine - codeForFile.startLine + 1} line${codeForFile.endLine === codeForFile.startLine ? '' : 's'}`
    : name
  const content = !file
    ? ''
    : codeForFile
      ? [
          `Repository: ${repository || 'unknown'}`,
          `File: ${file}`,
          codeForFile.startLine === codeForFile.endLine
            ? `Lines: ${codeForFile.startLine}`
            : `Lines: ${codeForFile.startLine}-${codeForFile.endLine}`,
          '',
          codeForFile.text,
        ].join('\n')
      : [`Repository: ${repository || 'unknown'}`, `File: ${line ? `${file}:${line}` : file}`].join('\n')

  // Keyed on the VALUES, not the objects: they are rebuilt every render, and
  // republishing re-arms passing, which would undo a reader who had just
  // switched it off.
  useEffect(() => {
    if (!file) {
      clearSelection()
      return
    }
    setSelection({ label, content })
  }, [file, label, content, setSelection, clearSelection])
  return null
}

/** The workspace's front page: its repositories and worktrees, with clone and open. */
function WorkspaceBrowser({
  ws,
  onOpen,
  onOpenClient,
}: { ws: WorkspaceRef; onOpen: (relPath: string) => void; onOpenClient?: () => void }) {
  const [repos, setRepos] = useState<Repo[] | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setRepos(await invoke<Repo[]>('git.listRepos', ws))
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
        await invoke<void>(action, { ...ws, ...params })
        await refresh()
        toast.success(done)
      } catch (err) {
        toast.error(`${failed}: ${(err as Error).message ?? String(err)}`)
        throw err
      }
    },
    [ws, refresh],
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
      onRemoveRepo={(repo) => run('git.removeRepo', { repo: repo.name }, `Removed ${repo.name}`, 'Remove failed')}
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
  const [file, setFile] = useState(initial.file)
  // The lines the reader has highlighted in the editor. Dropped when the file
  // changes -- lines from a file you have left are not context for the one you
  // are looking at -- but NOT when the highlight itself collapses, which is
  // what clicking into the composer does.
  const [code, setCode] = useState<CodeSelection | null>(null)
  useEffect(() => {
    setCode(null)
  }, [file])
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
      setFile('')
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
    setFile('')
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

  // A path typed inside the client keeps the terminal it is already reading.
  const changeFolder = useCallback((next: string) => openAt({ repository: next, terminal }), [terminal, openAt])

  const changeTerminal = useCallback(
    (next: string) => {
      setTerminal(next)
      writeDeepLink({ terminal: next })
      remember({ repository, terminal: next })
    },
    [repository, remember],
  )

  const openClient = useCallback(() => {
    if (remembered) {
      openAt(remembered)
    }
  }, [remembered, openAt])

  const onFileChange = useCallback((next?: string) => {
    setFile(next ?? '')
    writeDeepLink({ file: next ?? '' })
  }, [])

  // Open on a path, or on a terminal that is itself a checkout -- a worktree
  // handle carries the location with no path beside it.
  const clientOpen = Boolean(repository) || isWorktreeTarget(terminal)

  // What to CALL the open repository, for the chat beside it. A worktree
  // addressed by handle has no path to quote, so its checkout path is read back
  // out of the handle rather than left as "unknown".
  const opened = repository || worktreeRelPath(terminal.slice(terminal.indexOf('/') + 1)) || ''

  const body = clientOpen ? (
    <div className='flex h-full min-h-0 flex-col'>
      <div className='flex shrink-0 items-center border-b px-2 py-1'>
        <Button variant='ghost' size='sm' className='h-6 gap-1 px-1.5 text-xs' onClick={backToList}>
          <ArrowLeft className='size-3.5' />
          Repositories
        </Button>
      </div>
      <div className='min-h-0 flex-1'>
        {/* Lets the editor several levels down report a selection without
            every component in between carrying a prop for it. */}
        <CodeSelectionProvider onSelection={setCode}>
          <GitClient
            folder={repository}
            target={terminal}
            onFolderChange={changeFolder}
            onTargetChange={changeTerminal}
            initialFilePath={initial.file || undefined}
            initialFileLine={initial.line}
            onFileChange={onFileChange}
          />
        </CodeSelectionProvider>
      </div>
    </div>
  ) : (
    <WorkspaceBrowser
      ws={ws}
      onOpen={openFromList}
      onOpenClient={remembered ? openClient : undefined}
    />
  )

  // A host without the shared chat surface: the app is the git surface alone.
  if (!ChatDock || !SelectionProvider || !useSelection) {
    return <div className='h-full w-full overflow-hidden'>{body}</div>
  }

  // The whole surface is one selection scope -- leaving the app unmounts the
  // provider and the selection goes with it. The instance's own thread by
  // default: the conversation is about this workspace.
  return (
    <SelectionProvider>
      <ChatDock space={spaceSlug} id={`git-${instanceId}`} title={`Chat · ${spaceSlug}`}>
        <GitSelectionBridge repository={opened} file={file} line={initial.line} code={code} />
        <div className='min-h-0 min-w-0 flex-1 overflow-hidden'>{body}</div>
      </ChatDock>
    </SelectionProvider>
  )
}

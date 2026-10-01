import { Fragment, useCallback, useId, useState } from 'react'
import type { ChangeEvent, ElementType, KeyboardEvent, ReactNode } from 'react'
import { icons } from '@ext/host'

import { cn } from 'cn'
import {
  Badge,
  Button,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
  Label,
  Skeleton,
} from '../git-client/ui'

// The primitives come from the extension's host-UI surface and the icons off the
// host's bundled set.
const {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Download,
  FilePen,
  FolderGit2,
  GitBranch,
  GitBranchPlus,
  GitGraph,
  Loader2,
  MoreVertical,
  Plus,
  RotateCw,
  SquareArrowOutUpRight,
  Trash2,
  X,
} = icons

/** One worktree attached to a repository. */
export interface RepoWorktree {
  /** Directory name, unique within its repository. */
  name: string
  /** Where it sits relative to the workspace folder. This is what a press reports. */
  relPath: string
  branch: string
  /** Files modified in this worktree. */
  changes: number
}

/** One repository in the workspace folder. */
export interface Repo {
  name: string
  /** A bare repository has no working tree: it holds worktrees and cannot be opened itself. */
  bare: boolean
  branch: string
  changes: number
  ahead: number
  behind: number
  worktrees: RepoWorktree[]
}

export interface GitRepoListProps {
  /** The repositories to show. `null` means the host has not answered yet. */
  repos: Repo[] | null
  /** A refresh is in flight. */
  loading?: boolean
  /** Start with the clone form open. Read once, when the component mounts. */
  defaultCloneOpen?: boolean
  onRefresh?: () => void
  /**
   * Leave for the git client on whatever it was last pointed at, rather than at
   * one of the repositories below. Offered beside the list because where the
   * reader left the client is not something this screen can show.
   */
  onOpenClient?: () => void
  /** Open a repository or a worktree, addressed relative to the workspace folder. */
  onOpen?: (relPath: string) => void
  onClone?: (url: string, options: { bare: boolean }) => void | Promise<void>
  onRemoveRepo?: (repo: Repo) => void | Promise<void>
  onAddWorktree?: (repo: Repo, worktree: { name: string; base?: string }) => void | Promise<void>
  onRemoveWorktree?: (repo: Repo, worktree: RepoWorktree) => void | Promise<void>
  className?: string
}

interface RowAction {
  key: string
  label: string
  icon: ReactNode
  onSelect: () => void
  destructive?: boolean
  separatorBefore?: boolean
}

// One action list, rendered into whichever menu is asking. The row offers the
// same set from its trailing button and from a right-click or long press, so
// every action has a route that needs neither hover nor a fine pointer.
function renderActions(actions: RowAction[], Item: ElementType, Separator: ElementType) {
  return actions.map((action) => (
    <Fragment key={action.key}>
      {action.separatorBefore ? <Separator /> : null}
      <Item
        onClick={action.onSelect}
        className={action.destructive ? 'text-destructive focus:text-destructive' : undefined}
      >
        {action.icon}
        {action.label}
      </Item>
    </Fragment>
  ))
}

interface CloneFormProps {
  onClone?: (url: string, options: { bare: boolean }) => void | Promise<void>
  onDone: () => void
}

function CloneForm({ onClone, onDone }: CloneFormProps) {
  const bareId = useId()
  const [url, setUrl] = useState('')
  const [bare, setBare] = useState(true)
  const [busy, setBusy] = useState(false)

  const submit = useCallback(async () => {
    const address = url.trim()
    if (!address || !onClone || busy) {
      return
    }
    setBusy(true)
    try {
      await onClone(address, { bare })
      setUrl('')
      onDone()
    } catch {
      // The host performs the clone, so the host reports why it failed. Here
      // the obligation is only to stop showing progress and to keep what was
      // typed, so a retry does not start from an empty field.
    } finally {
      setBusy(false)
    }
  }, [url, bare, busy, onClone, onDone])

  return (
    <div className='flex flex-col gap-3 rounded-md border p-3'>
      <div className='flex flex-col gap-2 sm:flex-row'>
        <Input
          value={url}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setUrl(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') {
              submit()
            }
          }}
          placeholder='https://example.com/team/project.git'
          aria-label='Repository URL'
        />
        <Button onClick={submit} disabled={busy || !url.trim()}>
          {busy ? <Loader2 className='size-4 animate-spin' /> : <Download className='size-4' />}
          Clone
        </Button>
      </div>
      <div className='flex items-start gap-2'>
        <Checkbox
          id={bareId}
          checked={bare}
          onCheckedChange={(checked) => setBare(checked === true)}
        />
        <Label htmlFor={bareId} className='text-xs leading-snug font-normal text-muted-foreground'>
          Bare clone, so worktrees can be attached to it.
        </Label>
      </div>
    </div>
  )
}

interface AddWorktreeFormProps {
  repo: Repo
  onAdd?: (repo: Repo, worktree: { name: string; base?: string }) => void | Promise<void>
  onDone: () => void
}

function AddWorktreeForm({ repo, onAdd, onDone }: AddWorktreeFormProps) {
  const [name, setName] = useState('')
  const [base, setBase] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = useCallback(async () => {
    const branch = name.trim()
    if (!branch || !onAdd || busy) {
      return
    }
    setBusy(true)
    try {
      await onAdd(repo, { name: branch, base: base.trim() || undefined })
      setName('')
      setBase('')
      onDone()
    } catch {
      // Reported by the host, which is the half that talks to git.
    } finally {
      setBusy(false)
    }
  }, [name, base, busy, onAdd, repo, onDone])

  return (
    <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
      <Input
        value={name}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') {
            submit()
          }
        }}
        placeholder='worktree name'
        aria-label='Worktree name'
        className='h-8 sm:flex-1'
      />
      <Input
        value={base}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setBase(event.target.value)}
        placeholder='base branch (optional)'
        aria-label='Base branch'
        className='h-8 sm:w-44'
      />
      <div className='flex gap-2'>
        <Button size='sm' onClick={submit} disabled={busy || !name.trim()}>
          {busy ? <Loader2 className='size-4 animate-spin' /> : <GitBranchPlus className='size-4' />}
          Add
        </Button>
        <Button variant='ghost' size='sm' onClick={onDone} aria-label='Cancel'>
          <X className='size-4' />
        </Button>
      </div>
    </div>
  )
}

interface WorktreeRowProps {
  repo: Repo
  worktree: RepoWorktree
  onOpen?: (relPath: string) => void
  onRemove?: (repo: Repo, worktree: RepoWorktree) => void | Promise<void>
}

function WorktreeRow({ repo, worktree, onOpen, onRemove }: WorktreeRowProps) {
  const [busy, setBusy] = useState(false)

  const remove = useCallback(async () => {
    if (!onRemove) {
      return
    }
    setBusy(true)
    try {
      await onRemove(repo, worktree)
    } catch {
      // Reported by the host.
    } finally {
      setBusy(false)
    }
  }, [onRemove, repo, worktree])

  const actions: RowAction[] = []
  if (onOpen) {
    actions.push({
      key: 'open',
      label: 'Open',
      icon: <SquareArrowOutUpRight className='size-4' />,
      onSelect: () => onOpen(worktree.relPath),
    })
  }
  if (onRemove) {
    actions.push({
      key: 'remove',
      label: 'Remove worktree',
      icon: <Trash2 className='size-4' />,
      onSelect: remove,
      destructive: true,
      separatorBefore: actions.length > 0,
    })
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className='flex items-center gap-2 rounded-sm py-0.5' />}>
        <button
          type='button'
          onClick={onOpen ? () => onOpen(worktree.relPath) : undefined}
          title={worktree.relPath}
          className='flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
        >
          <GitBranch className='size-3.5 shrink-0 text-muted-foreground' />
          <span className='min-w-0 flex-1 truncate text-sm'>{worktree.name}</span>
          {worktree.branch && worktree.branch !== worktree.name ? (
            <span className='max-w-[40%] shrink-0 truncate text-xs text-muted-foreground' title='Checked-out branch'>
              {worktree.branch}
            </span>
          ) : null}
          {worktree.changes > 0 ? (
            <span
              className='flex shrink-0 items-center gap-1 text-xs text-muted-foreground'
              title='Modified files'
            >
              <FilePen className='size-3' />
              {worktree.changes}
            </span>
          ) : null}
        </button>
        {actions.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-7 shrink-0'
                  aria-label={`Actions for worktree ${worktree.name}`}
                />
              }
            >
              {busy ? <Loader2 className='size-4 animate-spin' /> : <MoreVertical className='size-4' />}
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              {renderActions(actions, DropdownMenuItem, DropdownMenuSeparator)}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </ContextMenuTrigger>
      <ContextMenuContent>
        {renderActions(actions, ContextMenuItem, ContextMenuSeparator)}
      </ContextMenuContent>
    </ContextMenu>
  )
}

interface RepoRowProps {
  repo: Repo
  onOpen?: (relPath: string) => void
  onRemoveRepo?: (repo: Repo) => void | Promise<void>
  onAddWorktree?: (repo: Repo, worktree: { name: string; base?: string }) => void | Promise<void>
  onRemoveWorktree?: (repo: Repo, worktree: RepoWorktree) => void | Promise<void>
}

function RepoRow({ repo, onOpen, onRemoveRepo, onAddWorktree, onRemoveWorktree }: RepoRowProps) {
  // Open a repository that has worktrees, and leave one with nothing under it
  // closed: an expanded row whose only content is the line saying it has none
  // spends more height on the absence than on anything present.
  const [expanded, setExpanded] = useState(repo.worktrees.length > 0)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)

  const canOpen = !repo.bare && !!onOpen
  const toggle = useCallback(() => setExpanded((value) => !value), [])

  const remove = useCallback(async () => {
    if (!onRemoveRepo) {
      return
    }
    setBusy(true)
    try {
      await onRemoveRepo(repo)
    } catch {
      // Reported by the host.
    } finally {
      setBusy(false)
    }
  }, [onRemoveRepo, repo])

  const actions: RowAction[] = []
  if (canOpen && onOpen) {
    actions.push({
      key: 'open',
      label: 'Open',
      icon: <SquareArrowOutUpRight className='size-4' />,
      onSelect: () => onOpen(repo.name),
    })
  }
  if (onAddWorktree) {
    actions.push({
      key: 'add-worktree',
      label: 'Add worktree',
      icon: <GitBranchPlus className='size-4' />,
      onSelect: () => {
        setExpanded(true)
        setAdding(true)
      },
    })
  }
  if (onRemoveRepo) {
    actions.push({
      key: 'remove',
      label: 'Remove repository',
      icon: <Trash2 className='size-4' />,
      onSelect: remove,
      destructive: true,
      separatorBefore: actions.length > 0,
    })
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className='flex flex-col rounded-md px-3 py-2.5 hover:bg-accent/50' />}>
        <div className='flex items-center gap-2'>
          <Button
            variant='ghost'
            size='icon'
            className='size-7 shrink-0'
            onClick={toggle}
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${repo.name}` : `Expand ${repo.name}`}
          >
            <ChevronRight className={cn('size-4 transition-transform', expanded && 'rotate-90')} />
          </Button>
          <button
            type='button'
            onClick={canOpen && onOpen ? () => onOpen(repo.name) : toggle}
            className='flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
          >
            <FolderGit2 className='size-4 shrink-0 text-muted-foreground' />
            <span className='min-w-0 truncate text-sm font-medium'>{repo.name}</span>
            {repo.bare ? (
              <Badge variant='secondary' className='shrink-0'>
                bare
              </Badge>
            ) : (
              <span className='flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'>
                <span className='flex items-center gap-1' title='Checked-out branch'>
                  <GitBranch className='size-3.5' />
                  {repo.branch}
                </span>
                {repo.ahead > 0 ? (
                  <span className='flex items-center gap-1' title='Commits ahead of upstream'>
                    <ArrowUp className='size-3.5' />
                    {repo.ahead}
                  </span>
                ) : null}
                {repo.behind > 0 ? (
                  <span className='flex items-center gap-1' title='Commits behind upstream'>
                    <ArrowDown className='size-3.5' />
                    {repo.behind}
                  </span>
                ) : null}
                <span className='flex items-center gap-1' title='Modified files'>
                  <FilePen className='size-3.5' />
                  {repo.changes}
                </span>
              </span>
            )}
          </button>
          {actions.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant='ghost'
                    size='icon'
                    className='size-7 shrink-0'
                    aria-label={`Actions for ${repo.name}`}
                  />
                }
              >
                {busy ? <Loader2 className='size-4 animate-spin' /> : <MoreVertical className='size-4' />}
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                {renderActions(actions, DropdownMenuItem, DropdownMenuSeparator)}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleContent>
            <div className='mt-2 ml-9 flex flex-col gap-0.5 border-l pl-3'>
              {repo.worktrees.length > 0 ? (
                repo.worktrees.map((worktree) => (
                  <WorktreeRow
                    key={worktree.relPath}
                    repo={repo}
                    worktree={worktree}
                    onOpen={onOpen}
                    onRemove={onRemoveWorktree}
                  />
                ))
              ) : (
                <p className='py-0.5 text-xs text-muted-foreground'>No worktrees.</p>
              )}
              {onAddWorktree ? (
                adding ? (
                  <div className='pt-1'>
                    <AddWorktreeForm repo={repo} onAdd={onAddWorktree} onDone={() => setAdding(false)} />
                  </div>
                ) : (
                  <Button
                    variant='ghost'
                    size='sm'
                    className='h-7 self-start text-muted-foreground'
                    onClick={() => setAdding(true)}
                  >
                    <Plus className='size-4' />
                    New worktree
                  </Button>
                )
              ) : null}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {renderActions(actions, ContextMenuItem, ContextMenuSeparator)}
      </ContextMenuContent>
    </ContextMenu>
  )
}

function RepoListSkeleton() {
  return (
    <div className='flex flex-col gap-0.5'>
      {['first', 'second', 'third'].map((row) => (
        <div key={row} className='flex flex-col gap-2 px-3 py-2.5'>
          <div className='flex items-center gap-2'>
            <Skeleton className='size-4 shrink-0 rounded-sm' />
            <Skeleton className='h-4 w-40' />
          </div>
          <Skeleton className='ml-9 h-3 w-48' />
        </div>
      ))}
    </div>
  )
}

/**
 * The front page of a git workspace: the repositories in its folder, each with
 * the worktrees attached to it.
 *
 * Presentation only. Every repository it shows arrives as a prop and every
 * action it offers leaves as a callback, so the component holds no idea of
 * where the workspace is or how git is reached.
 */
export function GitRepoList({
  repos,
  loading = false,
  defaultCloneOpen = false,
  onRefresh,
  onOpenClient,
  onOpen,
  onClone,
  onRemoveRepo,
  onAddWorktree,
  onRemoveWorktree,
  className,
}: GitRepoListProps) {
  const [cloning, setCloning] = useState(defaultCloneOpen)

  let body: ReactNode
  if (repos === null) {
    body = <RepoListSkeleton />
  } else if (repos.length === 0) {
    body = (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <FolderGit2 />
          </EmptyMedia>
          <EmptyTitle>No repositories</EmptyTitle>
          <EmptyDescription>
            Clone one into this workspace, and its worktrees will be listed here beside it.
          </EmptyDescription>
        </EmptyHeader>
        {onClone ? (
          <EmptyContent>
            <Button onClick={() => setCloning(true)}>
              <Download className='size-4' />
              Clone a repository
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    )
  } else {
    body = (
      <div className='flex flex-col gap-0.5'>
        {repos.map((repo) => (
          <RepoRow
            key={repo.name}
            repo={repo}
            onOpen={onOpen}
            onRemoveRepo={onRemoveRepo}
            onAddWorktree={onAddWorktree}
            onRemoveWorktree={onRemoveWorktree}
          />
        ))}
      </div>
    )
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className='flex shrink-0 items-center gap-2 border-b px-3 py-2.5 sm:px-4'>
        <h2 className='min-w-0 flex-1 truncate text-sm font-semibold'>Repositories</h2>
        {repos && repos.length > 0 ? (
          <Badge variant='secondary' className='shrink-0'>
            {repos.length}
          </Badge>
        ) : null}
        {onOpenClient ? (
          <Button variant='outline' size='sm' onClick={onOpenClient}>
            <GitGraph className='size-4' />
            <span className='hidden sm:inline'>Open client</span>
          </Button>
        ) : null}
        {onRefresh ? (
          <Button variant='outline' size='sm' onClick={onRefresh} disabled={loading}>
            <RotateCw className={cn('size-4', loading && 'animate-spin')} />
            <span className='hidden sm:inline'>Refresh</span>
          </Button>
        ) : null}
        {onClone ? (
          <Button size='sm' onClick={() => setCloning((value) => !value)} aria-expanded={cloning}>
            <Download className='size-4' />
            <span className='hidden sm:inline'>Clone</span>
          </Button>
        ) : null}
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto'>
        <div className='flex w-full flex-col gap-4 p-3 sm:p-4'>
          <Collapsible open={cloning} onOpenChange={setCloning}>
            <CollapsibleContent>
              <CloneForm onClone={onClone} onDone={() => setCloning(false)} />
            </CollapsibleContent>
          </Collapsible>
          {body}
        </div>
      </div>
    </div>
  )
}

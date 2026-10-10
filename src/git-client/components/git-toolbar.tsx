import { cn } from 'cn'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Bookmark,
  ChevronDown,
  GitBranchPlus,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { useId, useState } from 'react'

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui'

/** A branch on a remote, by its name there (`main`, not `origin/main`). */
export interface GitRemoteBranch {
  remote: string
  branch: string
}

/** A remote and the branches it has, by their names on the remote. */
export interface GitToolbarRemote {
  name: string
  branches: string[]
}

/** A local branch, and the remote branch it tracks when it tracks one. */
export interface GitToolbarBranch {
  name: string
  upstream?: GitRemoteBranch
}

/** The remote branch to merge into the current branch. */
export type GitPullRequest = GitRemoteBranch

export interface GitPushRequest {
  localBranch: string
  remote: string
  remoteBranch: string
  /** Make the pushed remote branch the local branch's upstream (`git push -u`). */
  setUpstream: boolean
  tags: boolean
  /** Overwrite the remote branch, but only if it holds nothing that was not fetched. */
  force: boolean
}

export interface GitNewBranchRequest {
  name: string
}

export type GitToolbarDialog = 'pull' | 'push' | 'branch'

export interface GitToolbarProps {
  /** What the terminal button shows: the terminal the client reads through. */
  terminal: ReactNode
  /** Back to the repositories and worktrees. */
  onBookmarks: () => void
  /** Pick another terminal and folder. */
  onPickTerminal: () => void
  onRefresh: () => void
  /** A refresh is in flight. */
  refreshing?: boolean
  /** The checked-out branch; absent on a detached HEAD. */
  currentBranch?: string
  /** Local branches, each with the remote branch it tracks. */
  branches: GitToolbarBranch[]
  remotes: GitToolbarRemote[]
  /**
   * The three dialogs' actions. Each may return a promise: while it is pending
   * the dialog shows progress, it closes when it resolves, and a rejection keeps
   * it open with the error's message.
   */
  onPull: (request: GitPullRequest) => void | Promise<void>
  onPush: (request: GitPushRequest) => void | Promise<void>
  onCreateBranch: (request: GitNewBranchRequest) => void | Promise<void>
  /** Start with one dialog open. Read once, when the component mounts. */
  defaultDialog?: GitToolbarDialog
  className?: string
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

interface ActionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  submitLabel: string
  icon: ReactNode
  canSubmit: boolean
  onSubmit: () => void | Promise<void>
  children: ReactNode
}

// One frame for the three dialogs: the form, the busy state, and the place
// git's own words go when it refuses, kept open so the reader can act on them.
function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  icon,
  canSubmit,
  onSubmit,
  children,
}: ActionDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit || busy) {
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      await onSubmit()
      onOpenChange(false)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (!next) {
          setError(undefined)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <form className='flex min-w-0 flex-col gap-4' onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
          {error ? (
            <pre
              role='alert'
              className='max-h-48 overflow-auto rounded-md bg-destructive/10 px-3 py-2 font-mono text-xs whitespace-pre-wrap text-destructive'
            >
              {error}
            </pre>
          ) : null}
          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type='submit' disabled={!canSubmit || busy}>
              {busy ? <Loader2 className='animate-spin' /> : icon}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface ChoiceOption {
  value: string
  label: string
}

interface ChoiceProps {
  label: string
  value: string
  options: ChoiceOption[]
  onChange: (value: string) => void
  /** Shown while nothing is chosen. */
  placeholder: string
  /** Shown when there is nothing to choose from. */
  emptyLabel: string
}

function Choice({ label, value, options, onChange, placeholder, emptyLabel }: ChoiceProps) {
  const id = useId()
  return (
    <div className='flex min-w-0 flex-1 flex-col gap-2'>
      <Label id={id}>{label}</Label>
      <Select
        value={value || null}
        items={options}
        onValueChange={(next: string | null) => onChange(next ?? '')}
        disabled={options.length === 0}
      >
        <SelectTrigger className='w-full min-w-0' aria-labelledby={id}>
          <SelectValue placeholder={options.length === 0 ? emptyLabel : placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function refLabel({ remote, branch }: GitRemoteBranch): string {
  return `${remote}/${branch}`
}

// A remote branch as a select value. Not its label: remote and branch names
// may both hold slashes, so "team/fork/main" can't be split back into its two.
function refKey({ remote, branch }: GitRemoteBranch): string {
  return JSON.stringify([remote, branch])
}

function remoteBranches(remotes: GitToolbarRemote[]): GitRemoteBranch[] {
  return remotes.flatMap((remote) => remote.branches.map((branch) => ({ remote: remote.name, branch })))
}

function hasRef(refs: GitRemoteBranch[], ref: GitRemoteBranch): boolean {
  return refs.some((candidate) => refKey(candidate) === refKey(ref))
}

// The remote a branch that tracks nothing is pushed to: `origin` by
// convention, else the first.
function defaultRemote(remotes: GitToolbarRemote[]): string {
  return (remotes.find((remote) => remote.name === 'origin') ?? remotes[0])?.name ?? ''
}

interface TrackingProps {
  branch: GitToolbarBranch
  /** The remote branches fetched here. */
  fetched: GitRemoteBranch[]
}

// Which remote branch a local branch tracks, for the sentence each dialog ends on.
function Tracking({ branch: { upstream }, fetched }: TrackingProps) {
  if (!upstream) {
    return <>tracks no remote branch</>
  }
  return (
    <>
      tracks <span className='font-medium text-foreground'>{refLabel(upstream)}</span>
      {hasRef(fetched, upstream) ? null : ', which is not among the fetched remote branches'}
    </>
  )
}

interface DialogBodyProps {
  currentBranch?: string
  branches: GitToolbarBranch[]
  remotes: GitToolbarRemote[]
  onClose: () => void
}

function PullDialog({
  currentBranch,
  branches,
  remotes,
  onPull,
  onClose,
}: DialogBodyProps & { onPull: GitToolbarProps['onPull'] }) {
  const sources = remoteBranches(remotes)
  const current = branches.find((branch) => branch.name === currentBranch)
  // The pull starts on what the current branch tracks, and otherwise on
  // nothing. Never a stand-in such as the first branch: one press would then
  // merge a branch nobody picked.
  const [source, setSource] = useState(() =>
    current?.upstream && hasRef(sources, current.upstream) ? refKey(current.upstream) : '',
  )
  const chosen = sources.find((ref) => refKey(ref) === source)

  return (
    <ActionDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title='Pull'
      description='Fetch a remote branch and merge it into the branch checked out here.'
      submitLabel='Pull'
      icon={<ArrowDownToLine />}
      canSubmit={Boolean(currentBranch && chosen)}
      onSubmit={() => (chosen ? onPull(chosen) : undefined)}
    >
      <Choice
        label='From'
        value={source}
        options={sources.map((ref) => ({ value: refKey(ref), label: refLabel(ref) }))}
        placeholder='Choose a remote branch'
        emptyLabel='No remote branches'
        onChange={setSource}
      />
      <p className='text-sm text-muted-foreground'>
        {current ? (
          <>
            Into <span className='font-medium text-foreground'>{current.name}</span>, the current branch, which{' '}
            <Tracking branch={current} fetched={sources} />.
          </>
        ) : (
          'No branch is checked out, so there is nothing to pull into.'
        )}
      </p>
    </ActionDialog>
  )
}

interface PushTarget {
  ref: GitRemoteBranch
  /** Not on the remote yet: the push creates it. */
  isNew: boolean
}

// Where a branch can go: every fetched remote branch, then the ones the push
// would create, which are the branch's own upstream when it is gone from the
// remote and a branch of its own name on each remote that lacks one.
function pushTargets(remotes: GitToolbarRemote[], source: GitToolbarBranch | undefined): PushTarget[] {
  const fetched = remoteBranches(remotes)
  const targets = fetched.map((ref) => ({ ref, isNew: false }))
  if (!source) {
    return targets
  }
  const candidates = [
    ...(source.upstream ? [source.upstream] : []),
    ...remotes.map((remote) => ({ remote: remote.name, branch: source.name })),
  ]
  for (const ref of candidates) {
    const listed = targets.map((target) => target.ref)
    if (!hasRef(listed, ref)) {
      targets.push({ ref, isNew: true })
    }
  }
  return targets
}

// What a branch is pushed to unless the reader picks another: what it tracks,
// else the branch of its own name on `origin` (or the only remote).
function defaultTarget(remotes: GitToolbarRemote[], source: GitToolbarBranch | undefined): string {
  if (!source) {
    return ''
  }
  if (source.upstream) {
    return refKey(source.upstream)
  }
  const remote = defaultRemote(remotes)
  return remote ? refKey({ remote, branch: source.name }) : ''
}

function PushDialog({
  currentBranch,
  branches,
  remotes,
  onPush,
  onClose,
}: DialogBodyProps & { onPush: GitToolbarProps['onPush'] }) {
  const tagsId = useId()
  const forceId = useId()
  // On a detached HEAD nothing is chosen, for the same reason as the pull's source.
  const [localBranch, setLocalBranch] = useState(currentBranch ?? '')
  const branchNamed = (name: string) => branches.find((branch) => branch.name === name)
  const source = branchNamed(localBranch)
  const [target, setTarget] = useState(() => defaultTarget(remotes, source))
  const [tags, setTags] = useState(false)
  const [force, setForce] = useState(false)
  const targets = pushTargets(remotes, source)
  const chosen = targets.find((candidate) => refKey(candidate.ref) === target)
  // A branch that tracks nothing takes the remote branch its push creates as
  // its upstream; one that tracks something keeps tracking it.
  const setUpstream = Boolean(chosen?.isNew && !source?.upstream)

  return (
    <ActionDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title='Push'
      description='Send a local branch to a branch on a remote.'
      submitLabel={force ? 'Force push' : 'Push'}
      icon={<ArrowUpFromLine />}
      canSubmit={Boolean(source && chosen)}
      onSubmit={() =>
        chosen
          ? onPush({
              localBranch,
              remote: chosen.ref.remote,
              remoteBranch: chosen.ref.branch,
              setUpstream,
              tags,
              force,
            })
          : undefined
      }
    >
      <Choice
        label='Local branch'
        value={localBranch}
        options={branches.map((branch) => ({ value: branch.name, label: branch.name }))}
        placeholder='Choose a local branch'
        emptyLabel='No branches'
        onChange={(next) => {
          setLocalBranch(next)
          setTarget(defaultTarget(remotes, branchNamed(next)))
        }}
      />
      <Choice
        label='To'
        value={target}
        options={targets.map(({ ref, isNew }) => ({
          value: refKey(ref),
          label: isNew ? `${refLabel(ref)} (new)` : refLabel(ref),
        }))}
        placeholder='Choose a remote branch'
        emptyLabel='No remotes'
        onChange={setTarget}
      />
      {source ? (
        <p className='text-sm text-muted-foreground'>
          <span className='font-medium text-foreground'>{source.name}</span>{' '}
          <Tracking branch={source} fetched={remoteBranches(remotes)} />.
          {chosen?.isNew ? (
            <>
              {' '}
              The push creates <span className='font-medium text-foreground'>{refLabel(chosen.ref)}</span>
              {setUpstream ? ' and makes it the upstream.' : '.'}
            </>
          ) : null}
        </p>
      ) : null}
      <div className='flex flex-col gap-3'>
        <div className='flex items-center gap-2'>
          <Checkbox id={tagsId} checked={tags} onCheckedChange={(checked: boolean) => setTags(checked === true)} />
          <Label htmlFor={tagsId} className='font-normal'>
            Push tags
          </Label>
        </div>
        <div className='flex items-start gap-2'>
          <Checkbox id={forceId} checked={force} onCheckedChange={(checked: boolean) => setForce(checked === true)} />
          <div className='flex flex-col gap-1'>
            <Label htmlFor={forceId} className='font-normal'>
              Force push
            </Label>
            <p className='text-xs text-muted-foreground'>
              Replaces the remote branch, and refuses if it has commits that were not fetched here.
            </p>
          </div>
        </div>
      </div>
    </ActionDialog>
  )
}

function NewBranchDialog({
  currentBranch,
  onCreateBranch,
  onClose,
}: DialogBodyProps & { onCreateBranch: GitToolbarProps['onCreateBranch'] }) {
  const nameId = useId()
  const [name, setName] = useState('')
  const branch = name.trim()

  return (
    <ActionDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title='New branch'
      description='Create a branch and switch to it.'
      submitLabel='Create branch'
      icon={<GitBranchPlus />}
      canSubmit={Boolean(branch)}
      onSubmit={() => onCreateBranch({ name: branch })}
    >
      <p className='text-sm text-muted-foreground'>
        From <span className='font-medium text-foreground'>{currentBranch ?? 'the checked-out commit'}</span>
        {currentBranch ? ', the current branch.' : ' (no branch is checked out).'}
      </p>
      <div className='flex flex-col gap-2'>
        <Label htmlFor={nameId}>Branch name</Label>
        <Input
          id={nameId}
          autoFocus
          value={name}
          placeholder='feature/my-branch'
          autoComplete='off'
          onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
        />
      </div>
    </ActionDialog>
  )
}

/**
 * The git client's header: one row, left to right Bookmarks, the terminal,
 * Refresh, Pull, Push and New branch. Below the `sm` width the three git
 * actions keep their icons and drop their words, so the terminal keeps room.
 */
export function GitToolbar({
  terminal,
  onBookmarks,
  onPickTerminal,
  onRefresh,
  refreshing = false,
  currentBranch,
  branches,
  remotes,
  onPull,
  onPush,
  onCreateBranch,
  defaultDialog,
  className,
}: GitToolbarProps) {
  const [dialog, setDialog] = useState<GitToolbarDialog | null>(defaultDialog ?? null)
  const body: DialogBodyProps = { currentBranch, branches, remotes, onClose: () => setDialog(null) }

  return (
    <div
      role='toolbar'
      aria-label='Repository'
      className={cn('flex min-w-0 items-center gap-1 border-b bg-card px-2 py-1', className)}
    >
      <Button
        variant='ghost'
        size='icon-sm'
        aria-label='Repositories and worktrees'
        title='Repositories and worktrees'
        onClick={onBookmarks}
      >
        <Bookmark />
      </Button>
      <Button
        variant='ghost'
        size='sm'
        className='min-w-0 shrink justify-start font-normal'
        title='Choose a terminal and folder'
        onClick={onPickTerminal}
      >
        <span className='flex min-w-0 items-center gap-1.5 truncate'>{terminal}</span>
        <ChevronDown className='text-muted-foreground' />
      </Button>
      <div className='flex-1' />
      <Button
        variant='ghost'
        size='icon-sm'
        aria-label='Refresh'
        title='Fetch and refresh'
        onClick={onRefresh}
        disabled={refreshing}
      >
        <RefreshCw className={cn(refreshing && 'animate-spin')} />
      </Button>
      <Button variant='ghost' size='sm' aria-label='Pull' onClick={() => setDialog('pull')}>
        <ArrowDownToLine />
        <span className='hidden sm:inline'>Pull</span>
      </Button>
      <Button variant='ghost' size='sm' aria-label='Push' onClick={() => setDialog('push')}>
        <ArrowUpFromLine />
        <span className='hidden sm:inline'>Push</span>
      </Button>
      <Button variant='ghost' size='sm' aria-label='New branch' onClick={() => setDialog('branch')}>
        <GitBranchPlus />
        <span className='hidden sm:inline'>New branch</span>
      </Button>
      {/* Mounted only while open, so each opening starts from the repository as it is now. */}
      {dialog === 'pull' ? <PullDialog {...body} onPull={onPull} /> : null}
      {dialog === 'push' ? <PushDialog {...body} onPush={onPush} /> : null}
      {dialog === 'branch' ? <NewBranchDialog {...body} onCreateBranch={onCreateBranch} /> : null}
    </div>
  )
}

import { Archive, Cloud, Tag } from 'lucide-react'
import { type MouseEvent, type ReactElement, type ReactNode, useState } from 'react'

import { checkoutBranch, createBranch, deleteBranch } from '../lib/actions/branches'
import { checkoutCommit, cherryPick, mergeRef, rebaseOnto, resetTo, revertCommit } from '../lib/actions/commits'
import { checkoutRemoteBranch, deleteRemoteBranch } from '../lib/actions/remotes'
import { stashApply, stashDrop, stashPop } from '../lib/actions/stashes'
import { createTag, deleteTag } from '../lib/actions/tags'
import { useGit } from '../lib/git-context'
import type { CommitGraphData, GitCommit } from '../lib/types'
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../ui'
import { CommitGraph, ROW_HEIGHT } from './commit-graph'
import { useGitDialogs } from './git-dialogs'
import { InteractiveRebaseDialog } from './interactive-rebase-dialog'

interface CommitRowProps {
  commit: GitCommit
  graphData: CommitGraphData
  isHead: boolean
  isSelected: boolean
  dimmed: boolean
  onSelect: (hash: string) => void
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Right-click menu attached to an individual ref badge. stopPropagation on the
// badge keeps the parent commit context menu from also opening.
function BadgeMenu({ items, children }: { items: ReactNode; children: ReactElement }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent className='w-52'>{items}</ContextMenuContent>
    </ContextMenu>
  )
}

export function CommitRow({ commit, graphData, isHead, isSelected, dimmed, onSelect }: CommitRowProps) {
  const { run, error } = useGitAction()
  const { confirm } = useGitDialogs()

  // Double-clicking the row picks the best checkout target: a local branch on
  // this commit, else offer to track a remote branch, else a detached checkout.
  const onRowDoubleClick = async () => {
    if (commit.branchNames.length > 0) {
      await run(checkoutBranch, { name: commit.branchNames[0] })
      return
    }
    if (commit.remoteBranches.length > 0) {
      const rb = commit.remoteBranches[0]
      const slash = rb.indexOf('/')
      const ok = await confirm({
        title: 'Track remote branch?',
        description: `Create a local branch tracking ${rb} and check it out?`,
        confirmLabel: 'Create & checkout',
      })
      if (ok) {
        await run(checkoutRemoteBranch, {
          remote: rb.slice(0, slash),
          branch: rb.slice(slash + 1),
        })
      }
      return
    }
    const ok = await confirm({
      title: `Checkout ${commit.shortHash} (detached)?`,
      description: 'No branch points here — HEAD will be detached.',
      confirmLabel: 'Checkout',
    })
    if (ok) {
      await run(checkoutCommit, { hash: commit.hash })
    }
  }

  // Local and remote branch badges share the commit's graph lane color: a tinted
  // fill plus a matching border, while the label text stays neutral.
  const branchBadgeStyle = {
    borderColor: graphData.dotColor,
    backgroundColor: `color-mix(in oklab, ${graphData.dotColor} 20%, transparent)`,
  }
  // Badge labels follow the commit message: grayed when the commit is dimmed.
  const badgeText = dimmed ? 'text-muted-foreground' : 'text-foreground'

  const stopCtx = (e: MouseEvent) => e.stopPropagation()
  const checkoutLocalBranch = (name: string) => (e: MouseEvent) => {
    e.stopPropagation()
    void run(checkoutBranch, { name })
  }
  const splitRemote = (rb: string) => {
    const slash = rb.indexOf('/')
    return { remote: rb.slice(0, slash), branch: rb.slice(slash + 1) }
  }
  const checkoutRemote = (rb: string) => (e: MouseEvent) => {
    e.stopPropagation()
    void run(checkoutRemoteBranch, splitRemote(rb))
  }

  const onDeleteBranch = (name: string, force: boolean) => async () => {
    const ok = await confirm({
      title: force ? `Force delete branch ${name}?` : `Delete branch ${name}?`,
      danger: true,
      confirmLabel: 'Delete',
    })
    if (ok) {
      await run(deleteBranch, force ? { name, force: true } : { name })
    }
  }
  const onDeleteRemoteBranch = (rb: string) => async () => {
    const { remote, branch } = splitRemote(rb)
    const ok = await confirm({
      title: `Delete remote branch ${rb}?`,
      description: `Deletes ${branch} on ${remote}.`,
      danger: true,
      confirmLabel: 'Delete',
    })
    if (ok) {
      await run(deleteRemoteBranch, { remote, branch })
    }
  }
  const onDeleteTag = (name: string) => async () => {
    const ok = await confirm({
      title: `Delete tag ${name}?`,
      danger: true,
      confirmLabel: 'Delete',
    })
    if (ok) {
      await run(deleteTag, { name })
    }
  }
  const stashIndex = commit.stashRef ? Number(commit.stashRef.replace(/\D/g, '')) : -1
  const onDropStash = () => async () => {
    const ok = await confirm({
      title: `Drop ${commit.stashRef}?`,
      danger: true,
      confirmLabel: 'Drop',
    })
    if (ok) {
      await run(stashDrop, { index: stashIndex })
    }
  }

  return (
    <>
      <CommitContextMenu commit={commit}>
        {/* biome-ignore lint/a11y/useSemanticElements: clickable commit row is a flex container, not a button */}
        <div
          className={`flex items-center cursor-pointer rounded-md ${isSelected ? 'bg-secondary' : 'hover:bg-secondary'}`}
          style={{ height: ROW_HEIGHT }}
          onClick={() => onSelect(commit.hash)}
          onDoubleClick={() => {
            void onRowDoubleClick()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onSelect(commit.hash)
            }
          }}
          role='button'
          tabIndex={0}
        >
          <div className='flex items-center gap-1 min-w-0 flex-1'>
            <CommitGraph data={graphData} />
            <div className='flex items-center gap-1.5 min-w-0 flex-1 pr-2'>
              {commit.branchNames.map((bn) => (
                <BadgeMenu
                  key={bn}
                  items={
                    <>
                      <ContextMenuItem
                        disabled={bn === commit.branchNames[0] && isHead}
                        onClick={() => run(checkoutBranch, { name: bn })}
                      >
                        Checkout
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem variant='destructive' onClick={onDeleteBranch(bn, false)}>
                        Delete branch...
                      </ContextMenuItem>
                      <ContextMenuItem variant='destructive' onClick={onDeleteBranch(bn, true)}>
                        Delete (force)...
                      </ContextMenuItem>
                    </>
                  }
                >
                  {/* biome-ignore lint/a11y/noStaticElementInteractions: badge shortcut; row is keyboard-accessible */}
                  <span
                    title={`Double-click to checkout ${bn}`}
                    onContextMenu={stopCtx}
                    onDoubleClick={checkoutLocalBranch(bn)}
                    style={branchBadgeStyle}
                    className={`text-xs font-medium px-1.5 py-0 rounded border ${badgeText} whitespace-nowrap shrink-0 hover:ring-1 hover:ring-primary/40`}
                  >
                    {bn}
                  </span>
                </BadgeMenu>
              ))}
              {commit.remoteBranches.map((rb) => {
                const branchPart = rb.slice(rb.indexOf('/') + 1)
                const collapsed = commit.branchNames.includes(branchPart)
                return (
                  <BadgeMenu
                    key={rb}
                    items={
                      <>
                        <ContextMenuItem onClick={() => run(checkoutRemoteBranch, splitRemote(rb))}>
                          Checkout (track)
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem variant='destructive' onClick={onDeleteRemoteBranch(rb)}>
                          Delete remote branch...
                        </ContextMenuItem>
                      </>
                    }
                  >
                    {/* biome-ignore lint/a11y/noStaticElementInteractions: badge shortcut; row is keyboard-accessible */}
                    <span
                      title={`Double-click to checkout ${rb}`}
                      onContextMenu={stopCtx}
                      onDoubleClick={checkoutRemote(rb)}
                      style={branchBadgeStyle}
                      className={`flex items-center gap-1 text-xs font-medium px-1.5 py-0 rounded border ${badgeText} whitespace-nowrap shrink-0 hover:ring-1 hover:ring-primary/40`}
                    >
                      <Cloud className='size-2.5 shrink-0' />
                      {!collapsed && <span className='truncate'>{rb}</span>}
                    </span>
                  </BadgeMenu>
                )
              })}
              {commit.stashRef && (
                <BadgeMenu
                  items={
                    <>
                      <ContextMenuItem onClick={() => run(stashApply, { index: stashIndex })}>Apply</ContextMenuItem>
                      <ContextMenuItem onClick={() => run(stashPop, { index: stashIndex })}>Pop</ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem variant='destructive' onClick={onDropStash()}>
                        Drop...
                      </ContextMenuItem>
                    </>
                  }
                >
                  {/* biome-ignore lint/a11y/noStaticElementInteractions: badge shortcut */}
                  <span
                    onContextMenu={stopCtx}
                    className={`flex items-center gap-1 text-xs font-medium px-1.5 py-0 rounded border border-border bg-muted ${badgeText} whitespace-nowrap shrink-0`}
                  >
                    <Archive className='size-2.5 shrink-0' />
                    {commit.stashRef}
                  </span>
                </BadgeMenu>
              )}
              {commit.tags?.map((t) => (
                <BadgeMenu
                  key={t}
                  items={
                    <>
                      <ContextMenuItem onClick={() => run(checkoutCommit, { hash: commit.hash })}>
                        Checkout (detached)
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem variant='destructive' onClick={onDeleteTag(t)}>
                        Delete tag...
                      </ContextMenuItem>
                    </>
                  }
                >
                  {/* biome-ignore lint/a11y/noStaticElementInteractions: badge shortcut */}
                  <span
                    onContextMenu={stopCtx}
                    className={`flex items-center gap-1 text-xs font-medium px-1.5 py-0 rounded border border-border bg-muted ${badgeText} whitespace-nowrap shrink-0 hover:ring-1 hover:ring-primary/40`}
                  >
                    <Tag className='size-2.5 shrink-0' />
                    {t}
                  </span>
                </BadgeMenu>
              ))}
              <span
                className={`text-xs truncate min-w-0 flex-1 ${dimmed ? 'text-muted-foreground' : 'text-foreground'} ${isHead ? 'font-semibold' : ''}`}
              >
                {commit.message}
              </span>
            </div>
          </div>

          <div className='w-28 shrink-0 px-2 text-xs text-muted-foreground truncate flex items-center gap-1.5'>
            <span className='size-4 rounded-full bg-muted flex items-center justify-center text-[8px] font-semibold text-muted-foreground shrink-0'>
              {commit.author
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <span className='truncate'>{commit.author}</span>
          </div>

          <Tooltip>
            <TooltipTrigger
              render={<span className='w-16 shrink-0 px-2 text-[11px] font-mono text-muted-foreground hover:text-foreground' />}
            >
              {commit.shortHash}
            </TooltipTrigger>
            <TooltipContent side='bottom' className='font-mono text-xs'>
              {commit.hash}
            </TooltipContent>
          </Tooltip>

          <div className='w-36 shrink-0 px-2 text-[11px] text-muted-foreground whitespace-nowrap'>
            {formatDate(commit.date)}
          </div>
        </div>
      </CommitContextMenu>
      {error && <div className='px-2 text-[10px] text-destructive bg-destructive/10 rounded'>{error}</div>}
    </>
  )
}

export function CommitContextMenu({ commit, children }: { commit: GitCommit; children: ReactElement }) {
  const { activeBranch } = useGit()
  const { run, error } = useGitAction()
  const { confirm, prompt } = useGitDialogs()
  const [rebaseOpen, setRebaseOpen] = useState(false)

  const hash = commit.hash
  const short = commit.shortHash
  const detached = !activeBranch

  const onCheckout = async () => {
    const ok = await confirm({ title: `Detach HEAD at ${short}?` })
    if (ok) {
      await run(checkoutCommit, { hash })
    }
  }

  const onCreateBranch = async () => {
    const name = await prompt({
      title: 'New branch',
      label: 'Branch name',
      required: true,
    })
    if (name) {
      await run(createBranch, { name, startPoint: hash, checkout: true })
    }
  }

  const onCreateTag = async () => {
    const name = await prompt({
      title: 'New tag',
      label: 'Tag name',
      required: true,
    })
    if (!name) {
      return
    }
    const message = await prompt({
      title: 'Tag message',
      label: 'Message (optional)',
      multiline: true,
    })
    await run(createTag, message ? { name, ref: hash, message } : { name, ref: hash })
  }

  const onReset = async (mode: 'soft' | 'mixed' | 'hard') => {
    const ok = await confirm({
      title: `Reset current branch to ${short} (${mode})?`,
      danger: mode === 'hard',
    })
    if (ok) {
      await run(resetTo, { ref: hash, mode })
    }
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger render={children} />
        <ContextMenuContent className='w-56'>
          <ContextMenuItem onClick={onCheckout}>Checkout (detached)...</ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              void run(cherryPick, { hash })
            }}
          >
            Cherry-pick onto current
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              void run(revertCommit, { hash })
            }}
          >
            Revert
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={onCreateBranch}>New branch...</ContextMenuItem>
          <ContextMenuItem onClick={onCreateTag}>New tag...</ContextMenuItem>
          <ContextMenuItem
            disabled={detached}
            onClick={() => {
              void run(mergeRef, { ref: hash })
            }}
          >
            Merge into current
          </ContextMenuItem>
          <ContextMenuItem
            disabled={detached}
            onClick={() => {
              void run(rebaseOnto, { onto: hash })
            }}
          >
            Rebase current onto this
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={detached}>Reset current branch to here</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem onClick={() => onReset('soft')}>Soft...</ContextMenuItem>
              <ContextMenuItem onClick={() => onReset('mixed')}>Mixed...</ContextMenuItem>
              <ContextMenuItem variant='destructive' onClick={() => onReset('hard')}>
                Hard...
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem disabled={detached} onClick={() => setRebaseOpen(true)}>
            Interactive rebase from here...
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => {
              void navigator.clipboard.writeText(hash)
            }}
          >
            Copy hash
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              void navigator.clipboard.writeText(short)
            }}
          >
            Copy short hash
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {error && <div className='px-2 py-1 text-[11px] text-destructive bg-destructive/10 rounded'>{error}</div>}
      <InteractiveRebaseDialog base={`${hash}^`} open={rebaseOpen} onOpenChange={setRebaseOpen} />
    </>
  )
}

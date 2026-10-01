import { ChevronDown, ChevronUp } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { getRebaseCommits, rebaseAbort, rebaseContinue, runInteractiveRebase } from '../lib/actions/rebase-interactive'
import { useGit } from '../lib/git-context'
import { useGitAction } from '../lib/use-git-action'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input } from '../ui'

type RebaseAction = 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'drop'

const ACTIONS: RebaseAction[] = ['pick', 'reword', 'edit', 'squash', 'fixup', 'drop']

interface RebaseStepState {
  hash: string
  shortHash: string
  subject: string
  action: RebaseAction
  message: string
}

interface InteractiveRebaseDialogProps {
  base: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InteractiveRebaseDialog({ base, open, onOpenChange }: InteractiveRebaseDialogProps) {
  const { workspace, refresh } = useGit()
  const { run, busy } = useGitAction()

  const [steps, setSteps] = useState<RebaseStepState[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    setPaused(false)
    setSteps([])
    getRebaseCommits({ data: { base, workspace } })
      .then((commits) => {
        if (!active) {
          return
        }
        setSteps(
          commits.map((c) => ({
            hash: c.hash,
            shortHash: c.shortHash,
            subject: c.subject,
            action: 'pick' as RebaseAction,
            message: '',
          })),
        )
      })
      .catch((e) => {
        if (active) {
          setError(e instanceof Error ? e.message : 'Failed to load commits')
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [open, base, workspace])

  const setStep = useCallback((index: number, patch: Partial<RebaseStepState>) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }, [])

  const move = useCallback((index: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const target = index + dir
      if (target < 0 || target >= prev.length) {
        return prev
      }
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }, [])

  const start = useCallback(async () => {
    setError(null)
    try {
      const res = await runInteractiveRebase({
        data: {
          base,
          steps: steps.map((s) => ({
            hash: s.hash,
            action: s.action,
            message: s.message || undefined,
          })),
          workspace,
        },
      })
      await refresh()
      if (res.status === 'paused') {
        setPaused(true)
      } else {
        onOpenChange(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rebase failed')
    }
  }, [base, steps, workspace, refresh, onOpenChange])

  const onContinue = useCallback(async () => {
    const ok = await run(rebaseContinue)
    if (ok) {
      onOpenChange(false)
    }
  }, [run, onOpenChange])

  const onAbort = useCallback(async () => {
    await run(rebaseAbort)
    onOpenChange(false)
  }, [run, onOpenChange])

  const startDisabled = busy || loading || steps.length === 0 || steps.some((s) => s.action === 'reword' && s.message.trim() === '')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Interactive rebase</DialogTitle>
          <DialogDescription>
            Reorder, edit, or combine commits from <span className='font-mono'>{base}</span> onward.
          </DialogDescription>
        </DialogHeader>

        {error && <div className='px-2 py-1 text-[11px] text-destructive bg-destructive/10 rounded'>{error}</div>}

        {paused ? (
          <div className='flex flex-col gap-2'>
            <div className='px-2 py-1 text-[11px] text-amber-600 bg-amber-500/10 rounded'>Rebase paused (edit step or conflict)</div>
            <div className='flex justify-end gap-2'>
              <Button variant='outline' size='sm' disabled={busy} onClick={onAbort}>
                Abort
              </Button>
              <Button size='sm' disabled={busy} onClick={onContinue}>
                Continue
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className='max-h-80 overflow-y-auto rounded border'>
              {loading && <p className='px-2 py-4 text-center text-[11px] text-muted-foreground'>Loading commits...</p>}
              {!loading && steps.length === 0 && <p className='px-2 py-4 text-center text-[11px] text-muted-foreground'>No commits to rebase</p>}
              {steps.map((step, index) => (
                <div key={step.hash} className='flex flex-col gap-1 border-b px-2 py-1.5 last:border-b-0'>
                  <div className='flex items-center gap-2'>
                    <div className='flex flex-col'>
                      <button type='button' className='text-muted-foreground hover:text-foreground disabled:opacity-30' disabled={index === 0} onClick={() => move(index, -1)} aria-label='Move up'>
                        <ChevronUp className='size-4' />
                      </button>
                      <button
                        type='button'
                        className='text-muted-foreground hover:text-foreground disabled:opacity-30'
                        disabled={index === steps.length - 1}
                        onClick={() => move(index, 1)}
                        aria-label='Move down'
                      >
                        <ChevronDown className='size-4' />
                      </button>
                    </div>
                    <select
                      className='h-7 rounded border bg-background px-1.5 text-xs'
                      value={step.action}
                      onChange={(e) =>
                        setStep(index, {
                          action: e.target.value as RebaseAction,
                        })
                      }
                    >
                      {ACTIONS.map((a) => (
                        <option key={a} value={a} disabled={index === 0 && (a === 'squash' || a === 'fixup')}>
                          {a}
                        </option>
                      ))}
                    </select>
                    <span className='font-mono text-[11px] text-muted-foreground shrink-0'>{step.shortHash}</span>
                    <span className='truncate text-xs'>{step.subject}</span>
                  </div>
                  {(step.action === 'reword' || step.action === 'squash') && (
                    <Input
                      className='h-7 text-xs'
                      value={step.message}
                      placeholder={step.action === 'reword' ? 'New commit message (required)' : 'Combined message (optional)'}
                      onChange={(e) => setStep(index, { message: e.target.value })}
                    />
                  )}
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button variant='outline' size='sm' onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button size='sm' disabled={startDisabled} onClick={start}>
                Start rebase
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

import { useCallback, useState } from 'react'

import { useGit } from './git-context'

/** A git-client server function taking `data` plus the workspace, which `run` supplies. */
type GitMutation<I> = (opts: { data: I & { workspace: string } }) => Promise<unknown>

export function useGitAction(): {
  run: <I>(fn: GitMutation<I>, data: NoInfer<I>) => Promise<boolean>
  busy: boolean
  error: string | null
  clearError: () => void
} {
  const { workspace, refresh } = useGit()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async <I>(fn: GitMutation<I>, data: NoInfer<I>) => {
      setBusy(true)
      setError(null)
      try {
        await fn({ data: { ...data, workspace } })
        await refresh()
        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Action failed')
        return false
      } finally {
        setBusy(false)
      }
    },
    [refresh, workspace],
  )

  const clearError = useCallback(() => setError(null), [])

  return { run, busy, error, clearError }
}

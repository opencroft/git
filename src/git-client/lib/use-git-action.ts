import { useCallback, useState } from 'react'
import { useGit } from './git-context'

// biome-ignore lint/suspicious/noExplicitAny: server fn payload shapes vary per mutation
type GitMutation = (opts: { data: any }) => Promise<unknown>

export function useGitAction(): {
  run: (fn: GitMutation, data?: Record<string, unknown>) => Promise<boolean>
  busy: boolean
  error: string | null
  clearError: () => void
} {
  const { workspace, refresh } = useGit()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async (fn: GitMutation, data?: Record<string, unknown>) => {
      setBusy(true)
      setError(null)
      try {
        await fn({ data: { ...(data ?? {}), workspace } })
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

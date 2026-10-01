import { invoke } from '@ext/host'

/**
 * Client stub for a `gitui.*` server action. Mirrors the call shape of the
 * original TanStack server functions (`fn({ data })`) so components keep
 * their call sites unchanged.
 *
 * The active repo context (workspace folder + terminal target) is merged into
 * every call so server actions run against the selected node's terminal rather
 * than local git. Explicit per-call data still wins.
 */
let repoContext: { workspace?: string; target?: string } = {}

export function setRepoContext(context: { workspace?: string; target?: string }): void {
  repoContext = context
}

export function serverFn<I, R>(name: string) {
  return (opts?: { data?: I }): Promise<R> => invoke<R>(`gitui.${name}`, { ...repoContext, ...(opts?.data ?? {}) })
}

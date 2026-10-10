// The worktree classifier, in its own module with no host imports so it can be run by
// `node --test` directly. It is pure -- facts in, verdict out, no git and no filesystem
// -- which is what makes the one safety-critical decision here testable at all.
// `server/git.ts` gathers the facts, calls this, and re-exports it.

export type WorktreeState =
  /** The branch is still on the remote: in flight, whatever its ancestry says. */
  | 'live'
  /** Gone from the remote AND an ancestor of the integration branch. Removable. */
  | 'merged'
  /** Gone from the remote but NOT an ancestor: never pushed, or rebased past. */
  | 'unpublished'
  /** Uncommitted changes. Checked before anything else and never removed. */
  | 'dirty'
  /** Not this workspace's to manage — see `foreignReason` at the classifier. */
  | 'foreign'
  /**
   * The remote's branch list could not be read, so "gone from the remote" has no
   * answer. Never removable: absence of evidence is not evidence of absence, and
   * here the two look identical.
   */
  | 'unknown'

export interface WorktreeFacts {
  /** Where this worktree is being read from. */
  ownPath: string
  /** Where git has it registered, read back from the admin entry. */
  registeredPath: string
  dirtyFiles: number
  branch: string
  integrationBranch: string
  /**
   * Whether the remote's own branch list was read at all.
   *
   * False means `onRemote` below is not a fact but the absence of one, and nothing
   * may be removed on the strength of it.
   */
  remoteKnown: boolean
  /**
   * Whether the branch is on the REMOTE, per `ls-remote` -- not whether a
   * `refs/remotes/origin/<branch>` exists locally. Those differ: a fetch without
   * `--prune` never deletes a tracking
   * ref, so a branch merged and deleted on the forge stays present locally forever
   * and every worktree of it reads as still in flight.
   */
  onRemote: boolean
  mergedIntoIntegration: boolean
}

/**
 * Which state a worktree is in, from the facts gathered about it.
 *
 * The order of these checks is the safety property, not a style: every reason to
 * KEEP a worktree is tested before the one reason to remove it, so a worktree
 * that is both dirty and merged is reported rather than deleted.
 */
export function classifyWorktree(facts: WorktreeFacts): { state: WorktreeState; reason: string } {
  const { ownPath, registeredPath, branch, integrationBranch } = facts

  // Registered somewhere other than where it is being read from: a checkout
  // mounted into another container, read from outside it. Never ours to remove,
  // and the case that looks most like garbage from here.
  if (registeredPath !== `${ownPath}/.git`) {
    const where = registeredPath || 'nowhere readable'
    return { state: 'foreign', reason: `registered at ${where}, read from ${ownPath} -- another host's checkout` }
  }
  if (!branch || branch === 'HEAD' || branch.startsWith('(detached')) {
    return { state: 'foreign', reason: 'detached HEAD: no branch to decide about' }
  }
  if (branch === integrationBranch) {
    return { state: 'foreign', reason: `checked out on ${integrationBranch}, the branch work merges into` }
  }
  if (facts.dirtyFiles > 0) {
    const files = facts.dirtyFiles === 1 ? '1 uncommitted file' : `${facts.dirtyFiles} uncommitted files`
    return { state: 'dirty', reason: `${files}: nobody has seen this work` }
  }
  // An unreadable remote and a branch genuinely gone from it produce the same silence,
  // and one of those is removable. Refusing to classify is the only safe reading of it:
  // a network failure must never present as "every branch has been deleted".
  if (!facts.remoteKnown) {
    return {
      state: 'unknown',
      reason: `origin's branch list could not be read: whether ${branch} is still on it is unanswered`,
    }
  }
  if (facts.onRemote) {
    return { state: 'live', reason: `origin/${branch} still exists` }
  }
  if (facts.mergedIntoIntegration) {
    return { state: 'merged', reason: `gone from the remote and an ancestor of ${integrationBranch}` }
  }
  return {
    state: 'unpublished',
    reason: `gone from the remote but not an ancestor of ${integrationBranch}: never pushed, or rebased past`,
  }
}

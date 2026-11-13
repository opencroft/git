// The command lines pull and push run, and how a failed pull is reported, apart
// from reaching the repository: each takes the git runner it needs, so they are
// checkable without a terminal behind them.

export interface PullArgsInput {
  remote?: string
  branch?: string
  rebase?: boolean
}

export function pullArgs(data: PullArgsInput): string[] {
  // Said either way: with neither, a git that has no pull.rebase configured
  // refuses a diverged pull outright instead of merging it.
  const args = ['pull', data.rebase ? '--rebase' : '--no-rebase']
  if (data.remote) {
    args.push('--', data.remote.trim())
    if (data.branch) {
      args.push(data.branch.trim())
    }
  }
  return args
}

/** Runs git in the repository and resolves with its stdout; rejects with its stderr. */
export type RunGit = (args: string[]) => Promise<string>

async function unmergedFiles(run: RunGit): Promise<string[]> {
  return (await run(['diff', '--name-only', '--diff-filter=U'])).split('\n').filter(Boolean)
}

/**
 * Pulls, and when the pull stops on conflicts it started, names the files. git
 * prints its CONFLICT lines on stdout, and a failed command reaches the caller
 * with stderr only, which for a conflicted pull is just the fetch's progress.
 * Files already unmerged before the pull are not its conflicts: git refuses to
 * pull over them and says so, and that refusal goes through as git wrote it.
 */
export async function pull(run: RunGit, data: PullArgsInput): Promise<void> {
  const unmergedBefore = await unmergedFiles(run)
  try {
    await run(pullArgs(data))
  } catch (err) {
    const conflicted = unmergedBefore.length === 0 ? await unmergedFiles(run).catch(() => []) : []
    if (conflicted.length === 0) {
      throw err
    }
    const count = conflicted.length === 1 ? '1 file' : `${conflicted.length} files`
    throw new Error(
      `The pull stopped on a merge conflict in ${count}: ${conflicted.join(', ')}. Resolve them to finish the pull, or abort it.`,
    )
  }
}

export interface CheckoutRemoteArgsInput {
  remote: string
  /** The branch's name on the remote. */
  branch: string
  /** The local branch to create; the branch's name on the remote when absent. */
  localName?: string
}

/**
 * Creates a local branch from a remote branch, checks it out and sets it to
 * track that branch. git's own `--track` can't be left to do either part once
 * a remote name holds a slash: it names the new branch by dropping the
 * remote-tracking name's first segment ("team/fork/main" becomes "fork/main"),
 * and it finds the remote through the fetch refspecs, where with remotes
 * "team" and "team/fork" both claim `refs/remotes/team/fork/*` and git refuses
 * as ambiguous. So the name is always given and the upstream is written as
 * the remote and branch the caller named. The start point is the full ref, so
 * a local branch that shares the remote-tracking branch's short name doesn't
 * make it ambiguous.
 */
export async function checkoutRemote(run: RunGit, data: CheckoutRemoteArgsInput): Promise<void> {
  const remote = data.remote.trim()
  const branch = data.branch.trim()
  const localName = data.localName?.trim() || branch
  await run(['checkout', '-b', localName, '--no-track', `refs/remotes/${remote}/${branch}`])
  await run(['config', `branch.${localName}.remote`, remote])
  await run(['config', `branch.${localName}.merge`, `refs/heads/${branch}`])
}

export interface PushArgsInput {
  remote?: string
  /** The local branch to push. */
  branch?: string
  /** Where `branch` goes on the remote, when not to the branch of the same name. */
  remoteBranch?: string
  setUpstream?: boolean
  /** Runs as --force-with-lease: refused when the remote branch has commits not fetched here. */
  force?: boolean
  tags?: boolean
}

export function pushArgs(data: PushArgsInput): string[] {
  const args = ['push']
  if (data.setUpstream) {
    args.push('-u')
  }
  // Never a bare --force: the lease is what keeps someone else's pushed work
  // from being overwritten by a branch that never saw it.
  if (data.force) {
    args.push('--force-with-lease')
  }
  if (data.tags) {
    args.push('--tags')
  }
  if (data.remote) {
    args.push('--', data.remote.trim())
    if (data.branch) {
      const remoteBranch = data.remoteBranch?.trim()
      args.push(remoteBranch ? `${data.branch.trim()}:${remoteBranch}` : data.branch.trim())
    }
  }
  return args
}

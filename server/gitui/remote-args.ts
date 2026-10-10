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

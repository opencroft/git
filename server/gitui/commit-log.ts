// How the commit graph's log is read: the log options and their parser, apart
// from reaching the repository, so they are checkable against a real git
// without a terminal behind them.

import type { GitCommit, RemoteBranchRef } from '../../src/git-client/lib/types'
import { SEP } from './field-separator.ts'
import { remoteBranchOf } from './remote-refs.ts'

const HEADS = 'refs/heads/'
const REMOTES = 'refs/remotes/'
const TAGS = 'refs/tags/'

// The refs on each commit are read in full: short, a local branch
// "team/fork/main" and the remote-tracking branch of remote "team/fork" print
// the same, and a remote-tracking ref of a remote that isn't configured can't
// be told from a local branch.
export const LOG_FORMAT_ARGS = [
  '--decorate=full',
  `--pretty=format:%H${SEP}%h${SEP}%s${SEP}%an${SEP}%aI${SEP}%P${SEP}%D`,
]

export function parseCommits(log: string, remoteNames: string[]): GitCommit[] {
  if (!log) {
    return []
  }
  return log.split('\n').map((line) => {
    const [hash, shortHash, message, author, date, parentStr, refs] = line.split(SEP)
    const branchNames: string[] = []
    const remoteBranches: RemoteBranchRef[] = []
    const tags: string[] = []
    for (const entry of (refs ?? '').split(', ')) {
      const ref = entry.trim().replace(/^HEAD -> /, '')
      if (ref.startsWith(`tag: ${TAGS}`)) {
        tags.push(ref.slice(`tag: ${TAGS}`.length))
      } else if (ref.startsWith(HEADS)) {
        branchNames.push(ref.slice(HEADS.length))
      } else if (ref.startsWith(REMOTES) && !ref.endsWith('/HEAD')) {
        remoteBranches.push(remoteBranchOf(ref.slice(REMOTES.length), remoteNames))
      }
    }
    const commit: GitCommit = {
      hash,
      shortHash,
      message,
      author,
      date,
      parents: parentStr ? parentStr.split(' ') : [],
      branchNames,
      remoteBranches,
    }
    if (tags.length > 0) {
      commit.tags = tags
    }
    return commit
  })
}

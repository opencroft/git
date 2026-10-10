// How local branches are read: the for-each-ref format and its parser, apart
// from reaching the repository, so they are checkable against a real git
// without a terminal behind them.

import type { GitBranch } from '../../src/git-client/lib/types'
import { SEP } from './field-separator.ts'

// The upstream is read as its remote and its name there, not as
// `%(upstream:short)`: "origin/a/b" can't be split back into a remote and a
// branch once either may hold a slash.
export const BRANCH_FORMAT = [
  '%(refname:short)',
  '%(objectname)',
  '%(HEAD)',
  '%(upstream:remotename)',
  '%(upstream:remoteref)',
].join(SEP)

export function parseBranches(raw: string): GitBranch[] {
  if (!raw) {
    return []
  }
  return raw.split('\n').map((line) => {
    const [name, tipHash, head, remote, remoteRef] = line.split(SEP)
    const branch: GitBranch = { name, isHead: head === '*', tipHash }
    // A branch set to track another local branch has the remote ".", which
    // names no remote: it tracks nothing a pull or push could reach.
    if (remote && remote !== '.' && remoteRef?.startsWith('refs/heads/')) {
      branch.upstream = { remote, branch: remoteRef.slice('refs/heads/'.length) }
    }
    return branch
  })
}

export interface GitCommit {
  hash: string
  shortHash: string
  message: string
  author: string
  date: string
  parents: string[]
  branchNames: string[]
  remoteBranches: RemoteBranchRef[]
  tags?: string[]
  stashRef?: string
}

/**
 * A remote-tracking branch: its full name (`team/fork/main`) and the remote and
 * branch the server split it into (`team/fork`, `main`). Both remote and
 * branch names may hold slashes, so the name is never split again here.
 */
export interface RemoteBranchRef {
  name: string
  remote: string
  branch: string
}

export interface GitBranch {
  name: string
  isHead: boolean
  tipHash: string
  /**
   * The remote branch a local branch tracks, by its name on the remote (`main`,
   * not `origin/main`). Absent when it tracks none, and on remote branches.
   */
  upstream?: { remote: string; branch: string }
}

export interface GitRemote {
  name: string
  url: string
  branches: GitBranch[]
}

export interface GitTag {
  name: string
  hash: string
}

export interface GitStash {
  index: number
  message: string
  branchName: string
  date: string
}

export interface GitSubmodule {
  name: string
  path: string
  url: string
  currentHash: string
}

export interface FileChange {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'untracked'
  additions: number
  deletions: number
}

export type VisibilityMode = 'default' | 'shown' | 'hidden'

export type SidebarView = 'changes' | 'commits'

export interface GraphSegment {
  topLane: number
  bottomLane: number
  top: number
  bottom: number
  color: string
}

export interface CommitGraphData {
  dotLane: number
  dotColor: string
  segments: GraphSegment[]
  maxLane: number
}

export interface GitData {
  commits: GitCommit[]
  branches: GitBranch[]
  remotes: GitRemote[]
  tags: GitTag[]
  stashes: GitStash[]
  submodules: GitSubmodule[]
  changedFiles: FileChange[]
  stagedFiles: FileChange[]
  files: string[]
  /** The repository's top-level folder on the machine git ran on, which every path above is relative to. */
  root?: string
  /** Set when the repo failed to open (bad workspace/target); other fields are empty defaults. */
  error?: string
}

export type ChangesView = 'graph' | 'workspace' | 'tree' | 'path' | 'file'

export interface SelectModifiers {
  shift: boolean
  ctrl: boolean
}

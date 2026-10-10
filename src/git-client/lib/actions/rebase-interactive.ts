import { serverFn } from '../rpc'

export type RebaseAction = 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'drop'

export interface RebaseStep {
  hash: string
  action: RebaseAction
  message?: string
}

interface GetRebaseCommitsInput {
  base: string
  workspace?: string
}

interface RunInteractiveRebaseInput {
  base: string
  steps: RebaseStep[]
  workspace?: string
}

interface WorkspaceOnlyInput {
  workspace?: string
}

export interface RebaseCommit {
  hash: string
  shortHash: string
  subject: string
}

export interface RebaseResult {
  status: 'ok' | 'paused'
  message: string
}

export interface RebaseStatus {
  type: 'rebase' | 'merge' | 'cherry-pick' | 'revert' | 'none'
}

export const getRebaseCommits = serverFn<GetRebaseCommitsInput, RebaseCommit[]>('getRebaseCommits')
export const runInteractiveRebase = serverFn<RunInteractiveRebaseInput, RebaseResult>('runInteractiveRebase')
export const getRebaseStatus = serverFn<WorkspaceOnlyInput, RebaseStatus>('getRebaseStatus')
export const rebaseContinue = serverFn<WorkspaceOnlyInput, void>('rebaseContinue')
export const rebaseAbort = serverFn<WorkspaceOnlyInput, void>('rebaseAbort')
export const rebaseSkip = serverFn<WorkspaceOnlyInput, void>('rebaseSkip')
export const mergeAbort = serverFn<WorkspaceOnlyInput, void>('mergeAbort')
export const cherryPickAbort = serverFn<WorkspaceOnlyInput, void>('cherryPickAbort')
export const revertAbort = serverFn<WorkspaceOnlyInput, void>('revertAbort')

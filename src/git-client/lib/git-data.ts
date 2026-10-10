import { serverFn } from './rpc'
import type { FileChange, GitData } from './types'

interface WorkspaceInput {
  workspace?: string
  target?: string
}

interface CommitInput {
  subject: string
  body: string
  amend: boolean
  workspace?: string
}

export interface FileDiff {
  original: string
  modified: string
}

export const getGitData = serverFn<WorkspaceInput | undefined, GitData>('getGitData')

export const getCommitChanges = serverFn<{ hash: string; workspace?: string }, FileChange[]>('getCommitChanges')

export const getCommitMessage = serverFn<{ hash: string; workspace?: string }, { subject: string; body: string }>(
  'getCommitMessage',
)

export const stageFiles = serverFn<{ paths: string[]; workspace?: string }, void>('stageFiles')

export const unstageFiles = serverFn<{ paths: string[]; workspace?: string }, void>('unstageFiles')

export const getHeadMessage = serverFn<WorkspaceInput | undefined, { subject: string; body: string }>('getHeadMessage')

export const commitChanges = serverFn<CommitInput, void>('commitChanges')

export const getCommitFileDiff = serverFn<{ hash: string; path: string; workspace?: string }, FileDiff>(
  'getCommitFileDiff',
)

export const getStagedFileDiff = serverFn<{ path: string; workspace?: string }, FileDiff>('getStagedFileDiff')

export const getUnstagedFileDiff = serverFn<{ path: string; workspace?: string }, FileDiff>('getUnstagedFileDiff')

export const trustRepo = serverFn<{ path: string; target?: string }, void>('trustRepo')

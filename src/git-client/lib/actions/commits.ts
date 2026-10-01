import { serverFn } from '../rpc'

interface CheckoutCommitInput {
  hash: string
  workspace?: string
}

interface CherryPickInput {
  hash: string
  noCommit?: boolean
  workspace?: string
}

interface RevertCommitInput {
  hash: string
  noCommit?: boolean
  workspace?: string
}

interface ResetToInput {
  ref: string
  mode: 'soft' | 'mixed' | 'hard'
  workspace?: string
}

interface MergeRefInput {
  ref: string
  noFf?: boolean
  ffOnly?: boolean
  message?: string
  workspace?: string
}

interface RebaseOntoInput {
  onto: string
  workspace?: string
}

export const checkoutCommit = serverFn<CheckoutCommitInput, void>('checkoutCommit')
export const cherryPick = serverFn<CherryPickInput, void>('cherryPick')
export const revertCommit = serverFn<RevertCommitInput, void>('revertCommit')
export const resetTo = serverFn<ResetToInput, void>('resetTo')
export const mergeRef = serverFn<MergeRefInput, void>('mergeRef')
export const rebaseOnto = serverFn<RebaseOntoInput, void>('rebaseOnto')

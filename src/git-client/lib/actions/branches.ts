import { serverFn } from '../rpc'

interface CreateBranchInput {
  name: string
  startPoint?: string
  checkout?: boolean
  workspace?: string
}

interface RenameBranchInput {
  oldName: string
  newName: string
  workspace?: string
}

interface DeleteBranchInput {
  name: string
  force?: boolean
  workspace?: string
}

interface CheckoutBranchInput {
  name: string
  workspace?: string
}

interface SetUpstreamInput {
  name: string
  upstream: string
  workspace?: string
}

export const createBranch = serverFn<CreateBranchInput, void>('createBranch')
export const renameBranch = serverFn<RenameBranchInput, void>('renameBranch')
export const deleteBranch = serverFn<DeleteBranchInput, void>('deleteBranch')
export const checkoutBranch = serverFn<CheckoutBranchInput, void>('checkoutBranch')
export const setUpstream = serverFn<SetUpstreamInput, void>('setUpstream')

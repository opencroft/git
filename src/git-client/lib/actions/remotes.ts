import { serverFn } from '../rpc'

interface AddRemoteInput {
  name: string
  url: string
  workspace?: string
}

interface RenameRemoteInput {
  oldName: string
  newName: string
  workspace?: string
}

interface RemoveRemoteInput {
  name: string
  workspace?: string
}

interface SetRemoteUrlInput {
  name: string
  url: string
  workspace?: string
}

interface FetchRemoteInput {
  name?: string
  prune?: boolean
  workspace?: string
}

interface PruneRemoteInput {
  name: string
  workspace?: string
}

interface PullRemoteInput {
  remote?: string
  branch?: string
  rebase?: boolean
  workspace?: string
}

interface PushRemoteInput {
  remote?: string
  branch?: string
  setUpstream?: boolean
  force?: boolean
  tags?: boolean
  workspace?: string
}

interface DeleteRemoteBranchInput {
  remote: string
  branch: string
  workspace?: string
}

interface CheckoutRemoteBranchInput {
  remote: string
  branch: string
  localName?: string
  workspace?: string
}

export const addRemote = serverFn<AddRemoteInput, void>('addRemote')
export const renameRemote = serverFn<RenameRemoteInput, void>('renameRemote')
export const removeRemote = serverFn<RemoveRemoteInput, void>('removeRemote')
export const setRemoteUrl = serverFn<SetRemoteUrlInput, void>('setRemoteUrl')
export const fetchRemote = serverFn<FetchRemoteInput, void>('fetchRemote')
export const pruneRemote = serverFn<PruneRemoteInput, void>('pruneRemote')
export const pullRemote = serverFn<PullRemoteInput, void>('pullRemote')
export const pushRemote = serverFn<PushRemoteInput, void>('pushRemote')
export const deleteRemoteBranch = serverFn<DeleteRemoteBranchInput, void>('deleteRemoteBranch')
export const checkoutRemoteBranch = serverFn<CheckoutRemoteBranchInput, void>('checkoutRemoteBranch')

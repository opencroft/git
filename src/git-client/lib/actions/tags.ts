import { serverFn } from '../rpc'

interface CreateTagInput {
  name: string
  ref?: string
  message?: string
  force?: boolean
  workspace?: string
}

interface DeleteTagInput {
  name: string
  workspace?: string
}

interface PushTagInput {
  name: string
  remote?: string
  workspace?: string
}

interface DeleteRemoteTagInput {
  name: string
  remote?: string
  workspace?: string
}

export const createTag = serverFn<CreateTagInput, void>('createTag')
export const deleteTag = serverFn<DeleteTagInput, void>('deleteTag')
export const pushTag = serverFn<PushTagInput, void>('pushTag')
export const deleteRemoteTag = serverFn<DeleteRemoteTagInput, void>('deleteRemoteTag')

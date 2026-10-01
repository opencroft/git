import { serverFn } from '../rpc'

interface AddSubmoduleInput {
  url: string
  path: string
  branch?: string
  workspace?: string
}

interface UpdateSubmoduleInput {
  path?: string
  init?: boolean
  recursive?: boolean
  workspace?: string
}

interface SubmodulePathInput {
  path?: string
  workspace?: string
}

interface DeinitSubmoduleInput {
  path: string
  force?: boolean
  workspace?: string
}

interface RemoveSubmoduleInput {
  path: string
  workspace?: string
}

export const addSubmodule = serverFn<AddSubmoduleInput, void>('addSubmodule')
export const updateSubmodule = serverFn<UpdateSubmoduleInput, void>('updateSubmodule')
export const initSubmodule = serverFn<SubmodulePathInput, void>('initSubmodule')
export const syncSubmodule = serverFn<SubmodulePathInput, void>('syncSubmodule')
export const deinitSubmodule = serverFn<DeinitSubmoduleInput, void>('deinitSubmodule')
export const removeSubmodule = serverFn<RemoveSubmoduleInput, void>('removeSubmodule')

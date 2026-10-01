import { serverFn } from '../rpc'

interface DiscardFilesInput {
  paths: string[]
  workspace?: string
}

interface WorkspaceOnlyInput {
  workspace?: string
}

interface AddToGitignoreInput {
  patterns: string[]
  workspace?: string
}

interface WriteFileContentInput {
  path: string
  content: string
  workspace?: string
}

interface CreatePatchInput {
  paths?: string[]
  staged?: boolean
  commit?: string
  range?: string
  workspace?: string
}

interface ApplyPatchFileInput {
  patch?: string
  path?: string
  index?: boolean
  reverse?: boolean
  threeWay?: boolean
  workspace?: string
}

export const discardFiles = serverFn<DiscardFilesInput, void>('discardFiles')
export const discardAll = serverFn<WorkspaceOnlyInput, void>('discardAll')
export const unstageAll = serverFn<WorkspaceOnlyInput, void>('unstageAll')
export const addToGitignore = serverFn<AddToGitignoreInput, void>('addToGitignore')
export const createPatch = serverFn<CreatePatchInput, { patch: string; filename: string }>('createPatch')
export const applyPatchFile = serverFn<ApplyPatchFileInput, void>('applyPatchFile')
export const writeFileContent = serverFn<WriteFileContentInput, void>('writeFileContent')

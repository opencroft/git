import { serverFn } from './rpc'

interface ApplyPatchInput {
  path: string
  patch: string
  mode: 'stage' | 'discard' | 'unstage'
  workspace?: string
}

export const applyHunkPatch = serverFn<ApplyPatchInput, void>('applyHunkPatch')

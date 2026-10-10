import { serverFn } from '../rpc'
import type { FileChange } from '../types'

interface StashPushInput {
  message?: string
  includeUntracked?: boolean
  keepIndex?: boolean
  workspace?: string
}

interface StashIndexInput {
  index: number
  workspace?: string
}

interface StashBranchInput {
  index: number
  name: string
  workspace?: string
}

export const stashPush = serverFn<StashPushInput, void>('stashPush')
export const stashApply = serverFn<StashIndexInput, void>('stashApply')
export const stashPop = serverFn<StashIndexInput, void>('stashPop')
export const stashDrop = serverFn<StashIndexInput, void>('stashDrop')
export const stashBranch = serverFn<StashBranchInput, void>('stashBranch')
export const getStashDiff = serverFn<StashIndexInput, FileChange[]>('getStashDiff')

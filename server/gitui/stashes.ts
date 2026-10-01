import type { FileChange } from '../../src/git-client/lib/types'
import { action } from './action'
import { openRepo } from './run-git'

function validateIndex(index: number): number {
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
    throw new Error('Invalid stash index')
  }
  return index
}

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) {
      return true
    }
  }
  return false
}

function validateBranchName(name: string): string {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('Branch name is required')
  }
  if (name.startsWith('-') || name.includes('..') || /[\s~^:?*[\\]/.test(name) || hasControlChar(name)) {
    throw new Error('Invalid branch name')
  }
  return name
}

interface StashPushInput {
  message?: string
  includeUntracked?: boolean
  keepIndex?: boolean
  workspace?: string
}
export const stashPush = action(
  (input: StashPushInput) => {
    if (input.message !== undefined && typeof input.message !== 'string') {
      throw new Error('Invalid stash message')
    }
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    const args = ['stash', 'push']
    if (data.includeUntracked) {
      args.push('-u')
    }
    if (data.keepIndex) {
      args.push('--keep-index')
    }
    if (data.message) {
      args.push('-m', data.message)
    }
    await run(args)
  },
)

interface StashApplyInput {
  index: number
  workspace?: string
}
export const stashApply = action(
  (input: StashApplyInput) => {
    validateIndex(input.index)
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    await run(['stash', 'apply', `stash@{${data.index}}`])
  },
)

interface StashPopInput {
  index: number
  workspace?: string
}
export const stashPop = action(
  (input: StashPopInput) => {
    validateIndex(input.index)
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    await run(['stash', 'pop', `stash@{${data.index}}`])
  },
)

interface StashDropInput {
  index: number
  workspace?: string
}
export const stashDrop = action(
  (input: StashDropInput) => {
    validateIndex(input.index)
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    await run(['stash', 'drop', `stash@{${data.index}}`])
  },
)

interface StashBranchInput {
  index: number
  name: string
  workspace?: string
}
export const stashBranch = action(
  (input: StashBranchInput) => {
    validateIndex(input.index)
    validateBranchName(input.name)
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    await run(['stash', 'branch', data.name, `stash@{${data.index}}`])
  },
)

interface GetStashDiffInput {
  index: number
  workspace?: string
}
export const getStashDiff = action(
  (input: GetStashDiffInput) => {
    validateIndex(input.index)
    return input
  },
  async ({ data }): Promise<FileChange[]> => {
    const { run } = await openRepo(data)
    const ref = `stash@{${data.index}}`

    const numstat = await run(['stash', 'show', ref, '--numstat'])
    const nameStatus = await run(['stash', 'show', ref, '--name-status'])

    const statusByPath = new Map<string, FileChange['status']>()
    for (const line of nameStatus.split('\n')) {
      if (!line.trim()) {
        continue
      }
      const parts = line.split('\t')
      const code = parts[0]?.charAt(0)
      const path = parts[parts.length - 1]
      if (!path) {
        continue
      }
      const status: FileChange['status'] = code === 'A' ? 'added' : code === 'D' ? 'deleted' : 'modified'
      statusByPath.set(path, status)
    }

    const changes: FileChange[] = []
    for (const line of numstat.split('\n')) {
      if (!line.trim()) {
        continue
      }
      const [adds, dels, ...rest] = line.split('\t')
      const path = rest.join('\t')
      if (!path) {
        continue
      }
      changes.push({
        path,
        status: statusByPath.get(path) ?? 'modified',
        additions: adds === '-' ? 0 : Number.parseInt(adds, 10) || 0,
        deletions: dels === '-' ? 0 : Number.parseInt(dels, 10) || 0,
      })
    }

    return changes
  },
)

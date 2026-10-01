import { action } from './action'
import { openRepo } from './run-git'

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) {
      return true
    }
  }
  return false
}

function validatePath(path: string): string {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new Error('path is required')
  }
  if (path.startsWith('/')) {
    throw new Error('path must be relative, not absolute')
  }
  if (path.split(/[/\\]/).includes('..')) {
    throw new Error('path must not contain ".."')
  }
  if (hasControlChars(path)) {
    throw new Error('path must not contain control characters')
  }
  return path
}

function validateUrl(url: string): string {
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error('url is required')
  }
  if (url.startsWith('-')) {
    throw new Error('url must not start with "-"')
  }
  if (hasControlChars(url)) {
    throw new Error('url must not contain control characters')
  }
  return url
}

function validateBranch(branch: string): string {
  if (typeof branch !== 'string' || branch.trim() === '') {
    throw new Error('branch is required')
  }
  if (branch.startsWith('-')) {
    throw new Error('branch must not start with "-"')
  }
  if (/\s/.test(branch) || branch.includes('..') || branch.includes('~') || branch.includes('^') || branch.includes(':') || branch.includes('\\') || hasControlChars(branch)) {
    throw new Error('invalid branch name')
  }
  return branch
}

interface AddSubmoduleInput {
  url: string
  path: string
  branch?: string
  workspace?: string
}
export const addSubmodule = action(
  (input: AddSubmoduleInput) => {
    validateUrl(input.url)
    validatePath(input.path)
    if (input.branch !== undefined) {
      validateBranch(input.branch)
    }
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    const args = ['-c', 'protocol.file.allow=always', 'submodule', 'add']
    if (data.branch) {
      args.push('-b', data.branch)
    }
    args.push('--', data.url, data.path)
    await run(args)
  },
)

interface UpdateSubmoduleInput {
  path?: string
  init?: boolean
  recursive?: boolean
  workspace?: string
}
export const updateSubmodule = action(
  (input: UpdateSubmoduleInput) => {
    if (input.path !== undefined) {
      validatePath(input.path)
    }
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    const args = ['submodule', 'update']
    if (data.init) {
      args.push('--init')
    }
    if (data.recursive) {
      args.push('--recursive')
    }
    if (data.path) {
      args.push('--', data.path)
    }
    await run(args)
  },
)

interface InitSubmoduleInput {
  path?: string
  workspace?: string
}
export const initSubmodule = action(
  (input: InitSubmoduleInput) => {
    if (input.path !== undefined) {
      validatePath(input.path)
    }
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    const args = ['submodule', 'init']
    if (data.path) {
      args.push('--', data.path)
    }
    await run(args)
  },
)

interface SyncSubmoduleInput {
  path?: string
  workspace?: string
}
export const syncSubmodule = action(
  (input: SyncSubmoduleInput) => {
    if (input.path !== undefined) {
      validatePath(input.path)
    }
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    const args = ['submodule', 'sync']
    if (data.path) {
      args.push('--', data.path)
    }
    await run(args)
  },
)

interface DeinitSubmoduleInput {
  path: string
  force?: boolean
  workspace?: string
}
export const deinitSubmodule = action(
  (input: DeinitSubmoduleInput) => {
    validatePath(input.path)
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    const args = ['submodule', 'deinit']
    if (data.force) {
      args.push('-f')
    }
    args.push('--', data.path)
    await run(args)
  },
)

interface RemoveSubmoduleInput {
  path: string
  workspace?: string
}
export const removeSubmodule = action(
  (input: RemoveSubmoduleInput) => {
    validatePath(input.path)
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    await run(['submodule', 'deinit', '-f', '--', data.path])
    await run(['rm', '-f', '--', data.path])
  },
)

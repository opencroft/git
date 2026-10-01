import { action } from './action'
import { openRepo } from './run-git'

function assertRemoteName(name: string, label = 'name'): string {
  const value = name?.trim()
  if (!value) {
    throw new Error(`${label} is required`)
  }
  if (value.startsWith('-')) {
    throw new Error(`${label} must not start with "-"`)
  }
  if (/[\s~^:?*[\]\\]/.test(value) || value.includes('..')) {
    throw new Error(`${label} contains invalid characters`)
  }
  return value
}

function assertRefName(ref: string, label = 'branch'): string {
  const value = ref?.trim()
  if (!value) {
    throw new Error(`${label} is required`)
  }
  if (value.startsWith('-')) {
    throw new Error(`${label} must not start with "-"`)
  }
  if (/[\s~^:?*[\]\\]/.test(value) || value.includes('..') || value.endsWith('/') || value.endsWith('.lock')) {
    throw new Error(`${label} is not a valid ref name`)
  }
  return value
}

function assertUrl(url: string): string {
  const value = url?.trim()
  if (!value) {
    throw new Error('url is required')
  }
  if (value.startsWith('-')) {
    throw new Error('url must not start with "-"')
  }
  return value
}

interface AddRemoteInput {
  name: string
  url: string
  workspace?: string
}

export const addRemote = action(
  (input: AddRemoteInput) => {
    assertRemoteName(input.name)
    assertUrl(input.url)
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    await run(['remote', 'add', '--', data.name.trim(), data.url.trim()])
  },
)

interface RenameRemoteInput {
  oldName: string
  newName: string
  workspace?: string
}

export const renameRemote = action(
  (input: RenameRemoteInput) => {
    assertRemoteName(input.oldName, 'oldName')
    assertRemoteName(input.newName, 'newName')
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    await run(['remote', 'rename', data.oldName.trim(), data.newName.trim()])
  },
)

interface RemoveRemoteInput {
  name: string
  workspace?: string
}

export const removeRemote = action(
  (input: RemoveRemoteInput) => {
    assertRemoteName(input.name)
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    await run(['remote', 'remove', data.name.trim()])
  },
)

interface SetRemoteUrlInput {
  name: string
  url: string
  workspace?: string
}

export const setRemoteUrl = action(
  (input: SetRemoteUrlInput) => {
    assertRemoteName(input.name)
    assertUrl(input.url)
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    await run(['remote', 'set-url', '--', data.name.trim(), data.url.trim()])
  },
)

interface FetchRemoteInput {
  name?: string
  prune?: boolean
  workspace?: string
}

export const fetchRemote = action(
  (input: FetchRemoteInput) => {
    if (input.name !== undefined) {
      assertRemoteName(input.name)
    }
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    const args = ['fetch']
    if (data.prune) {
      args.push('--prune')
    }
    if (data.name) {
      args.push('--', data.name.trim())
    } else {
      args.push('--all')
    }
    await run(args)
  },
)

interface PruneRemoteInput {
  name: string
  workspace?: string
}

export const pruneRemote = action(
  (input: PruneRemoteInput) => {
    assertRemoteName(input.name)
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    await run(['remote', 'prune', data.name.trim()])
  },
)

interface PullRemoteInput {
  remote?: string
  branch?: string
  rebase?: boolean
  workspace?: string
}

export const pullRemote = action(
  (input: PullRemoteInput) => {
    if (input.remote !== undefined) {
      assertRemoteName(input.remote, 'remote')
    }
    if (input.branch !== undefined) {
      assertRefName(input.branch)
    }
    if (input.branch && !input.remote) {
      throw new Error('remote is required when branch is provided')
    }
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    const args = ['pull']
    if (data.rebase) {
      args.push('--rebase')
    }
    if (data.remote) {
      args.push('--', data.remote.trim())
      if (data.branch) {
        args.push(data.branch.trim())
      }
    }
    await run(args)
  },
)

interface PushRemoteInput {
  remote?: string
  branch?: string
  setUpstream?: boolean
  force?: boolean
  tags?: boolean
  workspace?: string
}

export const pushRemote = action(
  (input: PushRemoteInput) => {
    if (input.remote !== undefined) {
      assertRemoteName(input.remote, 'remote')
    }
    if (input.branch !== undefined) {
      assertRefName(input.branch)
    }
    if (input.branch && !input.remote) {
      throw new Error('remote is required when branch is provided')
    }
    if (input.setUpstream && (!input.remote || !input.branch)) {
      throw new Error('remote and branch are required to set upstream')
    }
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    const args = ['push']
    if (data.setUpstream) {
      args.push('-u')
    }
    if (data.force) {
      args.push('--force-with-lease')
    }
    if (data.tags) {
      args.push('--tags')
    }
    if (data.remote) {
      args.push('--', data.remote.trim())
      if (data.branch) {
        args.push(data.branch.trim())
      }
    }
    await run(args)
  },
)

interface DeleteRemoteBranchInput {
  remote: string
  branch: string
  workspace?: string
}

export const deleteRemoteBranch = action(
  (input: DeleteRemoteBranchInput) => {
    assertRemoteName(input.remote, 'remote')
    assertRefName(input.branch)
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    await run(['push', data.remote.trim(), '--delete', data.branch.trim()])
  },
)

interface CheckoutRemoteBranchInput {
  remote: string
  branch: string
  localName?: string
  workspace?: string
}

export const checkoutRemoteBranch = action(
  (input: CheckoutRemoteBranchInput) => {
    assertRemoteName(input.remote, 'remote')
    assertRefName(input.branch)
    if (input.localName !== undefined) {
      assertRefName(input.localName, 'localName')
    }
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    const remote = data.remote.trim()
    const branch = data.branch.trim()
    const tracking = `${remote}/${branch}`
    if (data.localName) {
      await run(['checkout', '-b', data.localName.trim(), '--track', tracking])
    } else {
      await run(['checkout', '--track', tracking])
    }
  },
)

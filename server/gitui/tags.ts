import { action } from './action'
import { openRepo } from './run-git'

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

function validateTagName(name: unknown): string {
  if (typeof name !== 'string') throw new Error('Tag name is required')
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Tag name is required')
  if (trimmed.startsWith('-')) throw new Error('Invalid tag name')
  if (/[\s~^:?*[\\]/.test(trimmed)) throw new Error('Invalid tag name')
  if (trimmed.includes('..')) throw new Error('Invalid tag name')
  if (hasControlChars(trimmed)) throw new Error('Invalid tag name')
  if (trimmed.endsWith('.') || trimmed.endsWith('.lock')) throw new Error('Invalid tag name')
  return trimmed
}

function validateRef(ref: unknown): string {
  if (typeof ref !== 'string') throw new Error('Invalid ref')
  const trimmed = ref.trim()
  if (!trimmed) throw new Error('Invalid ref')
  if (trimmed.startsWith('-')) throw new Error('Invalid ref')
  if (/[\s~^:?*[\\]/.test(trimmed)) throw new Error('Invalid ref')
  if (trimmed.includes('..')) throw new Error('Invalid ref')
  if (hasControlChars(trimmed)) throw new Error('Invalid ref')
  return trimmed
}

function validateRemote(remote: unknown): string {
  if (remote === undefined || remote === null) return 'origin'
  if (typeof remote !== 'string') throw new Error('Invalid remote')
  const trimmed = remote.trim()
  if (!trimmed) return 'origin'
  if (trimmed.startsWith('-')) throw new Error('Invalid remote')
  if (/[\s\\]/.test(trimmed)) throw new Error('Invalid remote')
  if (hasControlChars(trimmed)) throw new Error('Invalid remote')
  return trimmed
}

interface CreateTagInput {
  name: string
  ref?: string
  message?: string
  force?: boolean
  workspace?: string
}

export const createTag = action(
  (input: CreateTagInput) => {
    validateTagName(input.name)
    if (input.ref !== undefined) validateRef(input.ref)
    if (input.message !== undefined && typeof input.message !== 'string') throw new Error('Invalid message')
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    const name = data.name.trim()
    const args = ['tag']
    const message = data.message
    if (message !== undefined && message !== '') {
      args.push('-a')
      if (data.force) args.push('-f')
      args.push(name, '-m', message)
    } else {
      if (data.force) args.push('-f')
      args.push(name)
    }
    if (data.ref !== undefined) args.push(data.ref.trim())
    await run(args)
  },
)

interface DeleteTagInput {
  name: string
  workspace?: string
}

export const deleteTag = action(
  (input: DeleteTagInput) => {
    validateTagName(input.name)
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    await run(['tag', '-d', data.name.trim()])
  },
)

interface PushTagInput {
  name: string
  remote?: string
  workspace?: string
}

export const pushTag = action(
  (input: PushTagInput) => {
    validateTagName(input.name)
    validateRemote(input.remote)
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    const remote = validateRemote(data.remote)
    await run(['push', remote, 'tag', data.name.trim()])
  },
)

interface DeleteRemoteTagInput {
  name: string
  remote?: string
  workspace?: string
}

export const deleteRemoteTag = action(
  (input: DeleteRemoteTagInput) => {
    validateTagName(input.name)
    validateRemote(input.remote)
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    const remote = validateRemote(data.remote)
    await run(['push', remote, '--delete', `refs/tags/${data.name.trim()}`])
  },
)

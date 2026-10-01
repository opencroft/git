import { action } from './action'
import { openRepo } from './run-git'

const HASH_RE = /^[0-9a-fA-F]{4,40}$/
const REF_BAD_CHARS = /[\s~^:?*[\\]|\.\.|@\{/

function validateHash(hash: unknown): string {
  if (typeof hash !== 'string' || !HASH_RE.test(hash)) {
    throw new Error('hash must be a 4-40 character hexadecimal commit id')
  }
  return hash
}

function validateRef(ref: unknown, field: string): string {
  if (typeof ref !== 'string' || ref.length === 0) {
    throw new Error(`${field} is required`)
  }
  if (ref.startsWith('-')) {
    throw new Error(`${field} must not start with "-"`)
  }
  for (let i = 0; i < ref.length; i++) {
    const code = ref.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) {
      throw new Error(`${field} contains control characters`)
    }
  }
  if (REF_BAD_CHARS.test(ref)) {
    throw new Error(`${field} contains invalid characters`)
  }
  return ref
}

interface CheckoutCommitInput {
  hash: string
  workspace?: string
}

export const checkoutCommit = action(
  (input: CheckoutCommitInput) => {
    validateHash(input.hash)
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    await run(['checkout', '--detach', data.hash])
  },
)

interface CherryPickInput {
  hash: string
  noCommit?: boolean
  workspace?: string
}

export const cherryPick = action(
  (input: CherryPickInput) => {
    validateHash(input.hash)
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    const args = ['cherry-pick']
    if (data.noCommit) {
      args.push('-n')
    }
    args.push(data.hash)
    await run(args)
  },
)

interface RevertCommitInput {
  hash: string
  noCommit?: boolean
  workspace?: string
}

export const revertCommit = action(
  (input: RevertCommitInput) => {
    validateHash(input.hash)
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    const args = ['revert', '--no-edit']
    if (data.noCommit) {
      args.push('-n')
    }
    args.push(data.hash)
    await run(args)
  },
)

interface ResetToInput {
  ref: string
  mode: 'soft' | 'mixed' | 'hard'
  workspace?: string
}

export const resetTo = action(
  (input: ResetToInput) => {
    validateRef(input.ref, 'ref')
    if (input.mode !== 'soft' && input.mode !== 'mixed' && input.mode !== 'hard') {
      throw new Error('mode must be one of "soft", "mixed", "hard"')
    }
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    await run(['reset', `--${data.mode}`, data.ref])
  },
)

interface MergeRefInput {
  ref: string
  noFf?: boolean
  ffOnly?: boolean
  message?: string
  workspace?: string
}

export const mergeRef = action(
  (input: MergeRefInput) => {
    validateRef(input.ref, 'ref')
    if (input.noFf && input.ffOnly) {
      throw new Error('noFf and ffOnly are mutually exclusive')
    }
    if (input.message !== undefined && typeof input.message !== 'string') {
      throw new Error('message must be a string')
    }
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    const args = ['merge', '--no-edit']
    if (data.noFf) {
      args.push('--no-ff')
    }
    if (data.ffOnly) {
      args.push('--ff-only')
    }
    if (data.message) {
      args.push('-m', data.message)
    }
    args.push(data.ref)
    await run(args)
  },
)

interface RebaseOntoInput {
  onto: string
  workspace?: string
}

export const rebaseOnto = action(
  (input: RebaseOntoInput) => {
    validateRef(input.onto, 'onto')
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    await run(['rebase', data.onto])
  },
)

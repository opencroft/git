import { action } from './action'
import { openRepo } from './run-git'

// Characters and sequences git forbids in ref names, mirroring
// `git check-ref-format`: whitespace, ~ ^ : ? * [ \, the ".." range,
// "@{", trailing/leading patterns, and ASCII control characters.
// biome-ignore lint/suspicious/noControlCharactersInRegex: reject control chars in ref names
const BAD_REF = /[\s~^:?*[\\\x00-\x1f\x7f]|\.\.|@\{|\/\/|\/$|^\/|\.$|\.lock$/

function assertBranchName(name: string, label = 'branch name'): string {
  const value = name?.trim()
  if (!value) {
    throw new Error(`A ${label} is required.`)
  }
  if (value.startsWith('-')) {
    throw new Error(`Invalid ${label}: cannot start with "-".`)
  }
  if (BAD_REF.test(value)) {
    throw new Error(`Invalid ${label}: "${value}".`)
  }
  return value
}

function assertStartPoint(ref: string): string {
  const value = ref?.trim()
  if (!value) {
    throw new Error('Invalid start point: empty.')
  }
  if (value.startsWith('-')) {
    throw new Error('Invalid start point: cannot start with "-".')
  }
  if (BAD_REF.test(value)) {
    throw new Error(`Invalid start point: "${value}".`)
  }
  return value
}

interface CreateBranchInput {
  name: string
  startPoint?: string
  checkout?: boolean
  workspace?: string
}

export const createBranch = action(
  (input: CreateBranchInput) => {
    assertBranchName(input.name)
    if (input.startPoint != null) {
      assertStartPoint(input.startPoint)
    }
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    const startPoint = data.startPoint?.trim()
    if (data.checkout) {
      const args = ['checkout', '-b', data.name.trim()]
      if (startPoint) {
        args.push(startPoint)
      }
      await run(args)
      return
    }
    const args = ['branch', data.name.trim()]
    if (startPoint) {
      args.push(startPoint)
    }
    await run(args)
  },
)

interface RenameBranchInput {
  oldName: string
  newName: string
  workspace?: string
}

export const renameBranch = action(
  (input: RenameBranchInput) => {
    assertBranchName(input.oldName, 'old branch name')
    assertBranchName(input.newName, 'new branch name')
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    await run(['branch', '-m', data.oldName.trim(), data.newName.trim()])
  },
)

interface DeleteBranchInput {
  name: string
  force?: boolean
  workspace?: string
}

export const deleteBranch = action(
  (input: DeleteBranchInput) => {
    assertBranchName(input.name)
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    const name = data.name.trim()
    const current = await run(['rev-parse', '--abbrev-ref', 'HEAD'])
    if (current === name) {
      throw new Error(`Cannot delete "${name}": it is the currently checked-out branch.`)
    }
    await run(['branch', data.force ? '-D' : '-d', name])
  },
)

interface CheckoutBranchInput {
  name: string
  workspace?: string
}

export const checkoutBranch = action(
  (input: CheckoutBranchInput) => {
    assertBranchName(input.name)
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    await run(['checkout', data.name.trim()])
  },
)

interface SetUpstreamInput {
  name: string
  upstream: string
  workspace?: string
}

export const setUpstream = action(
  (input: SetUpstreamInput) => {
    assertBranchName(input.name)
    assertStartPoint(input.upstream)
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    await run(['branch', `--set-upstream-to=${data.upstream.trim()}`, data.name.trim()])
  },
)

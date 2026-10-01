import { action } from './action'
import { openRepo } from './run-git'

/**
 * Reject paths that are absolute or escape the repo root via "..".
 * Throws on the first invalid entry.
 */
function validatePaths(paths: string[]): string[] {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('paths must be a non-empty array')
  }
  for (const p of paths) {
    if (typeof p !== 'string' || p.trim() === '') {
      throw new Error('path entries must be non-empty strings')
    }
    if (p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p)) {
      throw new Error(`path must be relative to the repo root: ${p}`)
    }
    if (p.split(/[\\/]/).some((seg) => seg === '..')) {
      throw new Error(`path must not contain "..": ${p}`)
    }
  }
  return paths
}

interface DiscardFilesInput {
  paths: string[]
  workspace?: string
}

/**
 * Discard working-tree changes for the listed paths only.
 *
 * For TRACKED modifications, `git restore -- <paths>` reverts them. For
 * UNTRACKED files `git restore` errors (nothing to restore) so it is wrapped
 * in try/catch and ignored, then `git clean -fd -- <paths>` removes any
 * untracked files/dirs among the listed paths. Staged changes for other paths
 * are left untouched.
 */
export const discardFiles = action(
  (input: DiscardFilesInput) => {
    validatePaths(input.paths)
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    try {
      await run(['restore', '--', ...data.paths])
    } catch {
      // Untracked paths have nothing to restore; clean handles them below.
    }
    await run(['clean', '-fd', '--', ...data.paths])
  },
)

interface WorkspaceOnlyInput {
  workspace?: string
}

/**
 * Discard ALL tracked working-tree changes and remove ALL untracked files.
 * `git checkout -- .` reverts tracked modifications; `git clean -fd` removes
 * untracked files and directories. DANGEROUS — the UI must confirm first.
 */
export const discardAll = action(
  (input: WorkspaceOnlyInput) => input ?? {},
  async ({ data }) => {
    const { run } = await openRepo(data ?? {})
    await run(['checkout', '--', '.'])
    await run(['clean', '-fd'])
  },
)

/**
 * Unstage everything (mixed reset). Leaves the working tree untouched.
 */
export const unstageAll = action(
  (input: WorkspaceOnlyInput) => input ?? {},
  async ({ data }) => {
    const { run } = await openRepo(data ?? {})
    await run(['reset'])
  },
)

interface AddToGitignoreInput {
  patterns: string[]
  workspace?: string
}

/**
 * Append the given patterns to <root>/.gitignore, one per line, skipping any
 * that already appear in the file. Creates .gitignore if it does not exist.
 */
export const addToGitignore = action(
  (input: AddToGitignoreInput) => {
    if (!Array.isArray(input.patterns) || input.patterns.length === 0) {
      throw new Error('patterns must be a non-empty array')
    }
    for (const pattern of input.patterns) {
      if (typeof pattern !== 'string' || pattern.trim() === '') {
        throw new Error('pattern entries must be non-empty strings')
      }
    }
    return input
  },
  async ({ data }) => {
    const repo = await openRepo(data)

    let existing = ''
    try {
      existing = await repo.readFile('.gitignore')
    } catch {
      // No .gitignore yet; it will be created below.
    }
    const present = new Set(
      existing
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== ''),
    )

    const toAdd: string[] = []
    for (const pattern of data.patterns) {
      const trimmed = pattern.trim()
      if (!present.has(trimmed)) {
        present.add(trimmed)
        toAdd.push(trimmed)
      }
    }
    if (toAdd.length === 0) {
      return
    }

    const prefix = existing === '' || existing.endsWith('\n') ? existing : `${existing}\n`
    await repo.writeFile('.gitignore', `${prefix}${toAdd.join('\n')}\n`)
  },
)

interface WriteFileContentInput {
  path: string
  content: string
  workspace?: string
}

/**
 * Overwrite a file's full working-tree content. Backs the editable single-pane
 * file view — this is a plain overwrite, not a hunk-level patch.
 */
export const writeFileContent = action(
  (input: WriteFileContentInput) => {
    validatePaths([input.path])
    if (typeof input.content !== 'string') {
      throw new Error('content must be a string')
    }
    return input
  },
  async ({ data }) => {
    const repo = await openRepo(data)
    await repo.writeFile(data.path, data.content)
  },
)

interface CreatePatchInput {
  paths?: string[]
  staged?: boolean
  commit?: string
  range?: string
  workspace?: string
}

/**
 * Reject refs/ranges that are empty or look like git options / contain
 * dangerous ref characters. Mirrors git check-ref-format expectations.
 */
function validateRef(ref: string, label: string): string {
  if (typeof ref !== 'string' || ref.trim() === '') {
    throw new Error(`${label} must be a non-empty string`)
  }
  if (ref.startsWith('-')) {
    throw new Error(`${label} must not start with "-": ${ref}`)
  }
  if (/[\s~^:\\]/.test(ref)) {
    throw new Error(`${label} contains invalid characters: ${ref}`)
  }
  return ref
}

/**
 * Produce patch text plus a sensible filename for the UI to copy/download.
 *
 * - `commit`: `git format-patch -1 --stdout <commit>` (filename <shorthash>.patch).
 * - `range` (e.g. "A..B"): `git format-patch <range> --stdout`.
 * - otherwise a working-tree diff (`git diff [--cached] [-- <paths>]`).
 */
export const createPatch = action(
  (input: CreatePatchInput) => {
    const value = input ?? {}
    if (value.commit) {
      validateRef(value.commit, 'commit')
    }
    if (value.range) {
      validateRef(value.range, 'range')
      if (!value.range.includes('..')) {
        throw new Error('range must be a revision range like "A..B"')
      }
    }
    if (value.paths) {
      validatePaths(value.paths)
    }
    return value
  },
  async ({ data }) => {
    const { run } = await openRepo(data ?? {})

    if (data?.commit) {
      const patch = await run(['format-patch', '-1', '--stdout', data.commit, '--'])
      const short = await run(['rev-parse', '--short', data.commit])
      return { patch, filename: `${short}.patch` }
    }

    if (data?.range) {
      const patch = await run(['format-patch', '--stdout', data.range, '--'])
      const safe = data.range.replace(/[^A-Za-z0-9._-]/g, '_')
      return { patch, filename: `${safe}.patch` }
    }

    const args = ['diff']
    if (data?.staged) {
      args.push('--cached')
    }
    if (data?.paths && data.paths.length > 0) {
      args.push('--', ...data.paths)
    }
    const patch = await run(args)
    const filename = data?.staged ? 'staged.patch' : 'working-tree.patch'
    return { patch, filename }
  },
)

interface ApplyPatchFileInput {
  patch?: string
  path?: string
  index?: boolean
  reverse?: boolean
  threeWay?: boolean
  workspace?: string
}

/**
 * Apply a patch from either inline text or an existing .patch file path.
 *
 * If `patch` text is supplied it is written to a temp file (cleaned up after).
 * If `path` is supplied that file is applied directly. Flags: `index` adds
 * `--cached`, `reverse` adds `-R`, `threeWay` adds `--3way`. As in the existing
 * apply-patch.ts, a failed apply is retried with `--3way` before giving up.
 */
export const applyPatchFile = action(
  (input: ApplyPatchFileInput) => {
    const value = input ?? {}
    if (!value.patch && !value.path) {
      throw new Error('either patch text or a path is required')
    }
    if (value.patch && value.path) {
      throw new Error('provide either patch text or a path, not both')
    }
    if (value.path) {
      validatePaths([value.path])
    }
    return value
  },
  async ({ data }) => {
    const { run, runInput } = await openRepo(data)

    const flags = ['apply', '--whitespace=nowarn']
    if (data.index) {
      flags.push('--cached')
    }
    if (data.reverse) {
      flags.push('-R')
    }

    // Apply either an on-disk patch file (by path) or inline patch text (stdin).
    const apply = (threeWay: boolean): Promise<string> => {
      const args = [...flags]
      if (threeWay) {
        args.push('--3way')
      }
      if (data.path) {
        args.push('--', data.path)
        return run(args)
      }
      const text = data.patch ?? ''
      return runInput(args, text.endsWith('\n') ? text : `${text}\n`)
    }

    try {
      await apply(Boolean(data.threeWay))
    } catch (applyErr) {
      const reason = applyErr instanceof Error ? applyErr.message : String(applyErr)
      if (data.threeWay) {
        throw new Error(`Failed to apply patch: ${reason}`)
      }
      try {
        await apply(true)
      } catch {
        throw new Error(`Failed to apply patch: ${reason}`)
      }
    }
  },
)



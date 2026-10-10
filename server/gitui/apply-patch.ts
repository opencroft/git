import { action } from './action'
import { openRepo } from './run-git'

interface ApplyPatchInput {
  path: string
  patch: string
  // stage   -> apply hunk to the index (git apply --cached)
  // discard -> revert hunk in the working tree (git apply -R)
  // unstage -> remove hunk from the index (git apply --cached -R)
  mode: 'stage' | 'discard' | 'unstage'
  workspace?: string
}

function modeFlags(mode: ApplyPatchInput['mode']): string[] {
  if (mode === 'stage') {
    return ['--cached']
  }
  if (mode === 'unstage') {
    return ['--cached', '-R']
  }
  return ['-R']
}

export const applyHunkPatch = action(
  (input: ApplyPatchInput) => {
    if (!input.path || !input.patch || !input.mode) {
      throw new Error('path, patch, and mode are required')
    }
    return input
  },
  async ({ data }) => {
    const { runInput } = await openRepo(data)
    const { patch, mode } = data
    const flags = modeFlags(mode)
    const text = patch.endsWith('\n') ? patch : `${patch}\n`

    try {
      await runInput(['apply', '--recount', '--whitespace=nowarn', ...flags], text)
    } catch (applyErr) {
      // Retry with --3way for more flexibility
      try {
        await runInput(['apply', '--3way', '--whitespace=nowarn', ...flags], text)
      } catch {
        throw new Error(`Failed to apply patch: ${applyErr instanceof Error ? applyErr.message : String(applyErr)}`)
      }
    }
  },
)

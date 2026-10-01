import { action } from './action'
import { openRepo, SEP } from './run-git'

// ---------------------------------------------------------------------------
// Shared validation helpers
// ---------------------------------------------------------------------------

/** Validate a commit-ish / ref used as a rebase base. Rejects obvious garbage
 *  and option injection (leading "-"). */
function assertRef(ref: string, label: string): string {
  if (typeof ref !== 'string' || ref.trim() === '') {
    throw new Error(`${label} is required`)
  }
  const value = ref.trim()
  if (value.startsWith('-')) {
    throw new Error(`${label} must not start with "-"`)
  }
  if (/[\s~^:\\]/.test(value) || value.includes('..')) {
    throw new Error(`${label} contains invalid characters`)
  }
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control chars in refs
  if (/[\x00-\x1f\x7f]/.test(value)) {
    throw new Error(`${label} contains control characters`)
  }
  return value
}

/** Validate a raw commit hash (full or abbreviated). */
function assertHash(hash: string): string {
  if (typeof hash !== 'string' || !/^[0-9a-fA-F]{4,40}$/.test(hash.trim())) {
    throw new Error('invalid commit hash')
  }
  return hash.trim()
}

const REBASE_ACTIONS = ['pick', 'reword', 'edit', 'squash', 'fixup', 'drop'] as const
type RebaseAction = (typeof REBASE_ACTIONS)[number]

// ---------------------------------------------------------------------------
// getRebaseCommits — list candidate commits for the interactive todo list.
// Returns commits in <base>..HEAD in APPLY ORDER (oldest first), which is the
// same order git rebase -i lays out its todo list.
// ---------------------------------------------------------------------------

interface GetRebaseCommitsInput {
  base: string
  workspace?: string
}

export const getRebaseCommits = action(
  (input: GetRebaseCommitsInput) => {
    assertRef(input.base, 'base')
    return input
  },
  async ({ data }) => {
    const { run } = await openRepo(data)
    const out = await run(['log', `${data.base}..HEAD`, '--reverse', `--pretty=format:%H${SEP}%h${SEP}%s`])
    if (out.trim() === '') {
      return [] as { hash: string; shortHash: string; subject: string }[]
    }
    return out.split('\n').map((line) => {
      const [hash, shortHash, subject = ''] = line.split(SEP)
      return { hash, shortHash, subject }
    })
  },
)

// ---------------------------------------------------------------------------
// runInteractiveRebase — drive `git rebase -i <base>` head-less via scripted
// editors (no TTY). The todo list is supplied as an ordered `steps` array
// (oldest first, matching git's todo order).
// ---------------------------------------------------------------------------

interface RebaseStep {
  hash: string
  action: RebaseAction
  /** New/combined message for reword (always) and squash (optional custom
   *  message). Ignored for pick/edit/drop/fixup. */
  message?: string
}

interface RunInteractiveRebaseInput {
  base: string
  steps: RebaseStep[]
  workspace?: string
  target?: string
}

export const runInteractiveRebase = action(
  (input: RunInteractiveRebaseInput) => {
    assertRef(input.base, 'base')
    if (!Array.isArray(input.steps) || input.steps.length === 0) {
      throw new Error('steps must be a non-empty array')
    }
    for (const step of input.steps) {
      assertHash(step.hash)
      if (!REBASE_ACTIONS.includes(step.action)) {
        throw new Error(`invalid action: ${String(step.action)}`)
      }
    }
    const first = input.steps[0].action
    if (first === 'squash' || first === 'fixup') {
      throw new Error('first step cannot be squash or fixup (no parent to combine into)')
    }
    return input
  },
  async ({ data }) => {
    if (data.target) {
      throw new Error('Interactive rebase is not yet supported over a remote terminal context')
    }
    const { execFileSync } = await import('node:child_process')
    const fs = await import('node:fs')
    const os = await import('node:os')
    const path = await import('node:path')

    const { run } = await openRepo(data)
    const root = await run(['rev-parse', '--show-toplevel'])

    const rebaseInProgress = () => fs.existsSync(path.join(root, '.git', 'rebase-merge')) || fs.existsSync(path.join(root, '.git', 'rebase-apply'))

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'git-irebase-'))
    try {
      // Build the rebase todo: one line per step in array order.
      const todoLines = data.steps.map((step) => {
        const subject = step.message?.split('\n')[0] ?? ''
        return `${step.action} ${step.hash} ${subject}`.trimEnd()
      })
      const todoPath = path.join(tmp, 'todo')
      fs.writeFileSync(todoPath, `${todoLines.join('\n')}\n`, 'utf8')

      // Build message files in the ORDER git requests them via GIT_EDITOR:
      //   - reword  -> editor opens once for that commit's message
      //   - squash  -> editor opens once for the combined message
      //   - fixup   -> NO editor (parent message kept)
      //   - pick/edit/drop -> NO message editor (edit pauses, not via editor)
      // We only enqueue a message file when a custom message is supplied;
      // otherwise the msg-editor leaves git's buffer untouched.
      let msgIndex = 0
      for (const step of data.steps) {
        const opensEditor = step.action === 'reword' || step.action === 'squash'
        if (!opensEditor) continue
        const slot = msgIndex++
        if (typeof step.message === 'string' && step.message.trim() !== '') {
          fs.writeFileSync(path.join(tmp, `msg-${slot}`), step.message, 'utf8')
        }
      }

      // Sequence editor: install our todo.
      const seqEditor = path.join(tmp, 'seq-editor.sh')
      fs.writeFileSync(seqEditor, '#!/bin/sh\ncat "$SEQ_TODO" > "$1"\n', 'utf8')

      // Message editor: pop the next message file by index counter. If none
      // exists for that index, leave the buffer unchanged (exit 0) so squash
      // keeps git's default combined message.
      const msgEditor = path.join(tmp, 'msg-editor.sh')
      fs.writeFileSync(
        msgEditor,
        `${[
          '#!/bin/sh',
          'IDX_FILE="$RB_DIR/msg-idx"',
          'if [ -f "$IDX_FILE" ]; then i=$(cat "$IDX_FILE"); else i=0; fi',
          'next=$((i + 1))',
          'echo "$next" > "$IDX_FILE"',
          'MSG="$RB_DIR/msg-$i"',
          'if [ -f "$MSG" ]; then cat "$MSG" > "$1"; fi',
          'exit 0',
        ].join('\n')}\n`,
        'utf8',
      )
      fs.chmodSync(seqEditor, 0o755)
      fs.chmodSync(msgEditor, 0o755)

      let message = ''
      try {
        message = execFileSync('git', ['-c', 'commit.gpgsign=false', 'rebase', '-i', data.base], {
          cwd: root,
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024,
          env: {
            ...process.env,
            GIT_SEQUENCE_EDITOR: seqEditor,
            GIT_EDITOR: msgEditor,
            SEQ_TODO: todoPath,
            RB_DIR: tmp,
          },
        })
      } catch (err) {
        // Non-zero exit usually means a conflict pause. (An "edit" stop
        // exits 0.) Capture output and only rethrow if nothing is paused.
        const e = err as {
          stdout?: string
          stderr?: string
          message?: string
        }
        message = (e.stdout ?? '') + (e.stderr ?? '') || e.message || String(err)
        if (!rebaseInProgress()) {
          throw new Error(message.trim() || 'git rebase failed')
        }
      }

      // Either a conflict (non-zero) or an "edit" step (zero) can leave a
      // rebase in progress that the user must resolve/continue.
      if (rebaseInProgress()) {
        return { status: 'paused' as const, message: message.trim() }
      }
      return { status: 'ok' as const, message: message.trim() }
    } finally {
      try {
        fs.rmSync(tmp, { recursive: true, force: true })
      } catch {
        // best-effort cleanup
      }
    }
  },
)

// ---------------------------------------------------------------------------
// getRebaseStatus — report any in-progress operation by inspecting the git dir.
// ---------------------------------------------------------------------------

interface GetRebaseStatusInput {
  workspace?: string
}

export const getRebaseStatus = action(
  (input: GetRebaseStatusInput) => input ?? {},
  async ({ data }) => {
    const repo = await openRepo(data ?? {})
    const gitDir = await repo.run(['rev-parse', '--git-dir'])
    const has = (name: string): Promise<boolean> => repo.exists(`${gitDir}/${name}`)

    let type: 'rebase' | 'merge' | 'cherry-pick' | 'revert' | 'none' = 'none'
    if ((await has('rebase-merge')) || (await has('rebase-apply'))) {
      type = 'rebase'
    } else if (await has('MERGE_HEAD')) {
      type = 'merge'
    } else if (await has('CHERRY_PICK_HEAD')) {
      type = 'cherry-pick'
    } else if (await has('REVERT_HEAD')) {
      type = 'revert'
    }

    return { type }
  },
)

// ---------------------------------------------------------------------------
// Operation continuation / abort helpers. All run head-less; core.editor=true
// on rebase --continue prevents an editor hang when git wants to confirm a
// commit message.
// ---------------------------------------------------------------------------

interface WorkspaceOnlyInput {
  workspace?: string
}

export const rebaseContinue = action(
  (input: WorkspaceOnlyInput) => input ?? {},
  async ({ data }) => {
    const { run } = await openRepo(data ?? {})
    await run(['-c', 'core.editor=true', 'rebase', '--continue'])
  },
)

export const rebaseAbort = action(
  (input: WorkspaceOnlyInput) => input ?? {},
  async ({ data }) => {
    const { run } = await openRepo(data ?? {})
    await run(['rebase', '--abort'])
  },
)

export const rebaseSkip = action(
  (input: WorkspaceOnlyInput) => input ?? {},
  async ({ data }) => {
    const { run } = await openRepo(data ?? {})
    await run(['rebase', '--skip'])
  },
)

export const mergeAbort = action(
  (input: WorkspaceOnlyInput) => input ?? {},
  async ({ data }) => {
    const { run } = await openRepo(data ?? {})
    await run(['merge', '--abort'])
  },
)

export const cherryPickAbort = action(
  (input: WorkspaceOnlyInput) => input ?? {},
  async ({ data }) => {
    const { run } = await openRepo(data ?? {})
    await run(['cherry-pick', '--abort'])
  },
)

export const revertAbort = action(
  (input: WorkspaceOnlyInput) => input ?? {},
  async ({ data }) => {
    const { run } = await openRepo(data ?? {})
    await run(['revert', '--abort'])
  },
)

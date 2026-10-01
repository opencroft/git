import host from '@ext/host'

export const SEP = '\x1f'

export interface RepoTarget {
  workspace?: string
  target?: string
}

export interface Repo {
  root: string
  run(args: string[]): Promise<string>
  runInput(args: string[], stdin: string): Promise<string>
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  exists(path: string): Promise<boolean>
  /** Raw `git show <ref>:<path>` content, untrimmed — unlike run(), preserves a real trailing newline. */
  showFile(ref: string, path: string): Promise<string>
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function joinArgs(args: string[]): string {
  return args.map((a) => (/^[\w./:@=,-]+$/.test(a) ? a : quote(a))).join(' ')
}

export function trimEnd(out: string): string {
  return out.replace(/\n+$/, '')
}

/**
 * Replace the raw "git rev-parse --show-toplevel" failure (a wall of shell/
 * docker-exec noise) with a clear, actionable message. Every gitui action
 * opens the repo through here, so this is the one place to fix it for all of them.
 */
function repoOpenError(reason: string, workspace: string | undefined): Error {
  if (/not a git repository/i.test(reason)) {
    return new Error(workspace ? `"${workspace}" is not a git repository.` : 'Enter a workspace folder to open a repository.')
  }
  if (/no such file or directory/i.test(reason)) {
    return new Error(`Folder not found: "${workspace}".`)
  }
  return new Error(`Failed to open repository${workspace ? ` at "${workspace}"` : ''}: ${reason}`)
}

async function localRepo(workspace?: string): Promise<Repo> {
  const { execFileSync } = await import('node:child_process')
  const { existsSync, readFileSync, writeFileSync } = await import('node:fs')
  const { isAbsolute, join } = await import('node:path')
  const git = (args: string[], cwd: string, stdin?: string): string =>
    trimEnd(execFileSync('git', args, { cwd, input: stdin, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
  let root: string
  try {
    root = git(['rev-parse', '--show-toplevel'], workspace || process.cwd())
  } catch (e) {
    throw repoOpenError(e instanceof Error ? e.message : String(e), workspace)
  }
  const abs = (p: string): string => (isAbsolute(p) ? p : join(root, p))
  return {
    root,
    run: async (args) => git(args, root),
    runInput: async (args, stdin) => git(args, root, stdin),
    readFile: async (p) => readFileSync(abs(p), 'utf8'),
    writeFile: async (p, content) => writeFileSync(abs(p), content, 'utf8'),
    exists: async (p) => existsSync(abs(p)),
    showFile: async (ref, p) => execFileSync('git', ['show', `${ref}:${p}`], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }),
  }
}

export function parseTarget(target: string): { nodeId: string; handleId: string } {
  const slash = target.indexOf('/')
  const nodeId = slash === -1 ? target : target.slice(0, slash)
  const handleId = slash === -1 ? '' : target.slice(slash + 1)
  if (!nodeId || !handleId) {
    throw new Error(`Invalid terminal target "${target}" (expected "node-id/handle-id")`)
  }
  return { nodeId, handleId }
}

async function remoteRepo(target: string, workspace?: string): Promise<Repo> {
  const { nodeId, handleId } = parseTarget(target)
  const ctx = await host.terminal.getContext(nodeId, handleId)
  const sh = (command: string): Promise<string> => host.terminal.exec(ctx, command)
  let root: string
  try {
    root = trimEnd(await sh(`cd ${quote(workspace || '.')} && git rev-parse --show-toplevel`))
  } catch (e) {
    throw repoOpenError(e instanceof Error ? e.message : String(e), workspace)
  }
  const at = (p: string): string => (p.startsWith('/') ? p : `${root}/${p}`)
  // The heredoc's own closing-delimiter line already supplies one trailing
  // newline for the last content line, so strip a pre-existing one from
  // `stdin` first — otherwise content that already ends in "\n" (as file
  // content normally does) gets written with an extra blank line.
  const heredoc = (command: string, stdin: string): string => `${command} << 'GIT_STDIN_EOF'\n${stdin.replace(/\n$/, '')}\nGIT_STDIN_EOF`
  return {
    root,
    run: async (args) => trimEnd(await sh(`cd ${quote(root)} && git ${joinArgs(args)}`)),
    runInput: async (args, stdin) => trimEnd(await sh(heredoc(`cd ${quote(root)} && git ${joinArgs(args)}`, stdin))),
    readFile: async (p) => sh(`cat ${quote(at(p))}`),
    writeFile: async (p, content) => {
      await sh(heredoc(`cat > ${quote(at(p))}`, content))
    },
    exists: async (p) => trimEnd(await sh(`test -e ${quote(at(p))} && echo 1 || echo 0`)) === '1',
    showFile: async (ref, p) => sh(`cd ${quote(root)} && git show ${quote(`${ref}:${p}`)}`),
  }
}

// Open a repo handle. Runs locally when no target is set, otherwise over the
// terminal context resolved from the target ("node-id/handle-id").
export function openRepo(opts?: RepoTarget): Promise<Repo> {
  if (opts?.target) {
    return remoteRepo(opts.target, opts.workspace)
  }
  return localRepo(opts?.workspace)
}

// Marks a path as a git safe.directory, independent of repo-root resolution
// (which is exactly what fails with "dubious ownership" errors).
export async function trustDirectory(path: string, target?: string): Promise<void> {
  const cmd = `git config --global --add safe.directory ${quote(path)}`
  if (target) {
    const { nodeId, handleId } = parseTarget(target)
    const ctx = await host.terminal.getContext(nodeId, handleId)
    await host.terminal.exec(ctx, cmd)
    return
  }
  const { execFileSync } = await import('node:child_process')
  execFileSync('sh', ['-c', cmd])
}

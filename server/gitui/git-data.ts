import type {
  FileChange,
  GitBranch,
  GitCommit,
  GitData,
  GitRemote,
  GitStash,
  GitSubmodule,
  GitTag,
} from '../../src/git-client/lib/types'
import { action } from './action'
import { openRepo, SEP, trustDirectory } from './run-git'

interface LineStat {
  additions: number
  deletions: number
}

interface SplitChanges {
  staged: FileChange[]
  unstaged: FileChange[]
}

function parseCommits(log: string, remotes: Set<string>): GitCommit[] {
  if (!log) {
    return []
  }
  return log.split('\n').map((line) => {
    const [hash, shortHash, message, author, date, parentStr, refs] = line.split(SEP)
    const branchNames: string[] = []
    const remoteBranches: string[] = []
    const tags: string[] = []
    for (const entry of (refs ?? '').split(', ')) {
      const ref = entry.trim()
      if (!ref) {
        continue
      }
      if (ref.startsWith('tag: ')) {
        tags.push(ref.slice(5))
        continue
      }
      const name = ref.replace('HEAD -> ', '')
      if (name === 'HEAD' || name.startsWith('refs/') || name.endsWith('/HEAD')) {
        continue
      }
      if (remotes.has(name.split('/')[0])) {
        remoteBranches.push(name)
        continue
      }
      branchNames.push(name)
    }
    const commit: GitCommit = {
      hash,
      shortHash,
      message,
      author,
      date,
      parents: parentStr ? parentStr.split(' ') : [],
      branchNames,
      remoteBranches,
    }
    if (tags.length > 0) {
      commit.tags = tags
    }
    return commit
  })
}

function parseBranches(raw: string): GitBranch[] {
  if (!raw) {
    return []
  }
  return raw.split('\n').map((line) => {
    const [name, tipHash, head] = line.split(SEP)
    return { name, isHead: head === '*', tipHash }
  })
}

function parseRemotes(raw: string, remoteList: string): GitRemote[] {
  const urls = new Map<string, string>()
  for (const line of remoteList.split('\n')) {
    const [name, rest] = line.split('\t')
    if (name && rest) {
      urls.set(name, rest.replace(/ \((fetch|push)\)$/, ''))
    }
  }
  const byName = new Map<string, GitRemote>()
  for (const line of raw.split('\n')) {
    if (!line) {
      continue
    }
    const [refName, tipHash] = line.split(SEP)
    if (refName.endsWith('/HEAD')) {
      continue
    }
    const remote = refName.split('/')[0]
    let entry = byName.get(remote)
    if (!entry) {
      entry = { name: remote, url: urls.get(remote) ?? '', branches: [] }
      byName.set(remote, entry)
    }
    entry.branches.push({ name: refName, isHead: false, tipHash })
  }
  return [...byName.values()]
}

function parseTags(raw: string): GitTag[] {
  if (!raw) {
    return []
  }
  return raw.split('\n').map((line) => {
    const [name, hash] = line.split(SEP)
    return { name, hash }
  })
}

function parseStashes(raw: string): GitStash[] {
  if (!raw) {
    return []
  }
  return raw.split('\n').map((line) => {
    const [gd, subject, date] = line.split(SEP)
    const branch = subject.match(/on (.+?): /)
    return {
      index: Number(gd.replace(/\D/g, '')),
      message: subject.replace(/^WIP on .+?: /, ''),
      branchName: branch ? branch[1] : '',
      date,
    }
  })
}

function parseStashCommits(raw: string): GitCommit[] {
  if (!raw) {
    return []
  }
  return raw.split('\n').map((line) => {
    const [hash, shortHash, subject, author, date, ref, parentStr] = line.split(SEP)
    return {
      hash,
      shortHash,
      message: subject,
      author,
      date,
      parents: parentStr ? [parentStr.split(' ')[0]] : [],
      branchNames: [],
      remoteBranches: [],
      stashRef: ref,
    }
  })
}

function parseSubmodules(raw: string): GitSubmodule[] {
  if (!raw) {
    return []
  }
  return raw.split('\n').map((line) => {
    const [currentHash, path] = line.trim().split(/\s+/)
    return { name: path.split('/').pop() ?? path, path, url: '', currentHash }
  })
}

function parseNumstat(raw: string): Map<string, LineStat> {
  const counts = new Map<string, LineStat>()
  for (const line of raw.split('\n')) {
    if (!line) {
      continue
    }
    const [add, del, path] = line.split('\t')
    counts.set(path, {
      additions: add === '-' ? 0 : Number(add),
      deletions: del === '-' ? 0 : Number(del),
    })
  }
  return counts
}

function fileStatus(code: string): FileChange['status'] {
  if (code[0] === 'A') {
    return 'added'
  }
  if (code[0] === 'D') {
    return 'deleted'
  }
  return 'modified'
}

function statusPath(line: string): string {
  const path = line.slice(3)
  const arrow = path.indexOf(' -> ')
  return arrow === -1 ? path : path.slice(arrow + 4)
}

function parseChanges(
  raw: string,
  stagedCounts: Map<string, LineStat>,
  unstagedCounts: Map<string, LineStat>,
): SplitChanges {
  const staged: FileChange[] = []
  const unstaged: FileChange[] = []
  for (const line of raw.split('\n')) {
    if (!line) {
      continue
    }
    const x = line[0]
    const y = line[1]
    const path = statusPath(line)
    if (x === '?' && y === '?') {
      unstaged.push({ path, status: 'untracked', additions: 0, deletions: 0 })
      continue
    }
    if (x !== ' ') {
      const stat = stagedCounts.get(path) ?? { additions: 0, deletions: 0 }
      staged.push({
        path,
        status: fileStatus(x),
        additions: stat.additions,
        deletions: stat.deletions,
      })
    }
    if (y !== ' ') {
      const stat = unstagedCounts.get(path) ?? { additions: 0, deletions: 0 }
      unstaged.push({
        path,
        status: fileStatus(y),
        additions: stat.additions,
        deletions: stat.deletions,
      })
    }
  }
  return { staged, unstaged }
}

const emptyData: GitData = {
  files: [],
  commits: [],
  branches: [],
  remotes: [],
  tags: [],
  stashes: [],
  submodules: [],
  changedFiles: [],
  stagedFiles: [],
}

export const getGitData = action(
  (input: { workspace?: string; target?: string } | undefined) => input,
  async ({ data }): Promise<GitData> => {
    try {
      const { run } = await openRepo(data ?? {})

      const remoteList = await run(['remote', '-v'])
      const remoteNames = new Set(
        remoteList
          .split('\n')
          .map((line) => line.split('\t')[0])
          .filter(Boolean),
      )

      const log = await run([
        'log',
        'HEAD',
        '--branches',
        '--remotes',
        '--tags',
        '--topo-order',
        `--pretty=format:%H${SEP}%h${SEP}%s${SEP}%an${SEP}%aI${SEP}%P${SEP}%D`,
      ])

      const changes = parseChanges(
        await run(['status', '--porcelain=v1', '--untracked-files=all']),
        parseNumstat(await run(['diff', '--cached', '--numstat', '--no-renames'])),
        parseNumstat(await run(['diff', '--numstat', '--no-renames'])),
      )

      const files = [
        ...new Set(
          [
            ...(await run(['ls-files'])).split('\n'),
            ...(await run(['ls-files', '--others', '--exclude-standard'])).split('\n'),
          ].filter(Boolean),
        ),
      ].sort()

      const commits = parseCommits(log, remoteNames)
      const stashCommits = parseStashCommits(
        await run(['stash', 'list', `--format=%H${SEP}%h${SEP}%gs${SEP}%an${SEP}%aI${SEP}%gd${SEP}%P`]),
      )
      for (const stash of stashCommits) {
        const index = commits.findIndex((c) => c.hash === stash.parents[0])
        if (index === -1) {
          commits.unshift(stash)
        } else {
          commits.splice(index, 0, stash)
        }
      }

      return {
        files,
        commits,
        branches: parseBranches(
          await run(['for-each-ref', 'refs/heads', `--format=%(refname:short)${SEP}%(objectname)${SEP}%(HEAD)`]),
        ),
        remotes: parseRemotes(
          await run(['for-each-ref', 'refs/remotes', `--format=%(refname:short)${SEP}%(objectname)`]),
          remoteList,
        ),
        tags: parseTags(await run(['for-each-ref', 'refs/tags', `--format=%(refname:short)${SEP}%(objectname)`])),
        stashes: parseStashes(await run(['stash', 'list', `--format=%gd${SEP}%gs${SEP}%cI`])),
        submodules: parseSubmodules(await run(['submodule', 'status'])),
        changedFiles: changes.unstaged,
        stagedFiles: changes.staged,
      }
    } catch (e) {
      return { ...emptyData, error: e instanceof Error ? e.message : String(e) }
    }
  },
)

export const trustRepo = action(
  (input: { path: string; target?: string }) => input,
  async ({ data }): Promise<void> => {
    await trustDirectory(data.path, data.target)
  },
)

export const getCommitChanges = action(
  (input: { hash: string; workspace?: string }) => {
    if (!/^[0-9a-fA-F]{4,40}$/.test(input.hash)) {
      throw new Error('invalid commit hash')
    }
    return input
  },
  async ({ data }): Promise<FileChange[]> => {
    const { hash } = data
    const { run } = await openRepo(data)
    const counts = parseNumstat(await run(['show', hash, '--numstat', '--no-renames', '--format=']))
    const changes: FileChange[] = []
    for (const line of (await run(['show', hash, '--name-status', '--no-renames', '--format='])).split('\n')) {
      if (!line) {
        continue
      }
      const [code, path] = line.split('\t')
      const stat = counts.get(path) ?? { additions: 0, deletions: 0 }
      changes.push({
        path,
        status: fileStatus(code),
        additions: stat.additions,
        deletions: stat.deletions,
      })
    }
    return changes
  },
)

export const getCommitMessage = action(
  (input: { hash: string; workspace?: string }) => {
    if (!/^[0-9a-fA-F]{4,40}$/.test(input.hash)) {
      throw new Error('invalid commit hash')
    }
    return input
  },
  async ({ data }): Promise<{ subject: string; body: string }> => {
    const { run } = await openRepo(data)
    return {
      subject: await run(['log', '-1', '--format=%s', data.hash]),
      body: await run(['log', '-1', '--format=%b', data.hash]),
    }
  },
)

export const stageFiles = action(
  (input: { paths: string[]; workspace?: string }) => input,
  async ({ data }) => {
    const { paths } = data
    if (paths.length === 0) {
      return
    }
    const { run } = await openRepo(data)
    await run(['add', '--', ...paths])
  },
)

export const unstageFiles = action(
  (input: { paths: string[]; workspace?: string }) => input,
  async ({ data }) => {
    const { paths } = data
    if (paths.length === 0) {
      return
    }
    const { run } = await openRepo(data)
    await run(['restore', '--staged', '--', ...paths])
  },
)

export const getHeadMessage = action(
  (input: { workspace?: string } | undefined) => input,
  async ({ data }): Promise<{ subject: string; body: string }> => {
    const { run } = await openRepo(data ?? {})
    return {
      subject: await run(['log', '-1', '--format=%s']),
      body: await run(['log', '-1', '--format=%b']),
    }
  },
)

interface CommitInput {
  subject: string
  body: string
  amend: boolean
  workspace?: string
}

export const commitChanges = action(
  (input: CommitInput) => input,
  async ({ data }) => {
    const { run } = await openRepo(data)
    const args = ['commit']
    if (data.amend) {
      args.push('--amend')
    }
    if (data.subject) {
      args.push('-m', data.subject)
      if (data.body) {
        args.push('-m', data.body)
      }
    } else if (data.amend) {
      args.push('--no-edit')
    }
    await run(args)
  },
)

export interface FileDiff {
  original: string
  modified: string
}

export const getCommitFileDiff = action(
  (input: { hash: string; path: string; workspace?: string }) => input,
  async ({ data }): Promise<FileDiff> => {
    const { hash, path } = data
    const repo = await openRepo(data)
    let original = ''
    let modified = ''
    try {
      original = await repo.showFile(`${hash}^`, path)
    } catch {
      // file was added in this commit — no parent version
    }
    try {
      modified = await repo.showFile(hash, path)
    } catch {
      // file was deleted in this commit — no current version
    }
    return { original, modified }
  },
)

export const getStagedFileDiff = action(
  (input: { path: string; workspace?: string }) => input,
  async ({ data }): Promise<FileDiff> => {
    const { path } = data
    const repo = await openRepo(data)
    let original = ''
    let modified = ''
    try {
      original = await repo.showFile('HEAD', path)
    } catch {
      // new file — no committed version
    }
    try {
      modified = await repo.showFile('', path)
    } catch {
      // deleted file — no index version
    }
    return { original, modified }
  },
)

export const getUnstagedFileDiff = action(
  (input: { path: string; workspace?: string }) => input,
  async ({ data }): Promise<FileDiff> => {
    const { path } = data
    const repo = await openRepo(data)
    let original = ''
    try {
      // showFile (not run()) so a real trailing newline in the index blob
      // isn't stripped — otherwise it mismatches the working-tree read below
      // and shows up as a phantom "line added" diff.
      original = await repo.showFile('', path)
    } catch {
      // untracked file — no index version
    }
    let modified = ''
    try {
      modified = await repo.readFile(path)
    } catch {
      // deleted file — no working tree version
    }
    return { original, modified }
  },
)

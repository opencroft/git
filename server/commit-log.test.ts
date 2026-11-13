// The commit graph's badges and their checkout come from the refs git prints on
// each commit, so they are read from a real git: the log options are only as
// right as what git prints for them.

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { LOG_FORMAT_ARGS, parseCommits } from './gitui/commit-log.ts'
import { parseRemoteList } from './gitui/remote-refs.ts'

// The machine's own git config stays out of the repositories made here.
const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
}

// Signing is off on the command line too: a key set through GIT_CONFIG_*
// variables, which the spread of process.env passes on, would make every
// commit here try to sign.
function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], {
    cwd,
    env: ENV,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

const skip = spawnSync('git', ['--version']).error ? 'no git on PATH, and every test here runs one' : false

function readLog(work: string) {
  const remoteNames = [...parseRemoteList(git(work, 'remote', '-v')).keys()]
  return parseCommits(git(work, 'log', 'HEAD', '--branches', '--remotes', '--tags', ...LOG_FORMAT_ARGS), remoteNames)
}

test('each remote branch on a commit carries the remote and branch it belongs to, whatever slashes they hold', {
  skip,
}, (t) => {
  const root = mkdtempSync(join(tmpdir(), 'commit-log-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const remote = join(root, 'remote.git')
  const work = join(root, 'work')
  git(root, 'init', '-q', '--bare', '-b', 'main', remote)
  git(root, 'init', '-q', '-b', 'main', work)
  git(work, 'commit', '-q', '--allow-empty', '-m', 'first')
  // "team" is a prefix of "team/fork", and the branch "feature/x" holds a slash
  // too: neither may come back as remote "team", branch "fork/...".
  git(work, 'remote', 'add', 'origin', remote)
  git(work, 'remote', 'add', 'team/fork', remote)
  git(work, 'remote', 'add', 'team', remote)
  git(work, 'push', '-q', 'origin', 'main', 'main:feature/x')
  git(work, 'fetch', '-q', '--all')
  // A local branch with a remote-tracking branch's short name, a ref of a
  // remote that isn't configured, and a tag.
  git(work, 'branch', 'team/fork/main')
  git(work, 'update-ref', 'refs/remotes/gone/old', 'HEAD')
  git(work, 'tag', 'v1')

  const [commit] = readLog(work)

  assert.deepEqual(commit.branchNames.sort(), ['main', 'team/fork/main'])
  assert.deepEqual(
    commit.remoteBranches.sort((a, b) => a.name.localeCompare(b.name)),
    [
      { name: 'gone/old', remote: 'gone', branch: 'old' },
      { name: 'origin/feature/x', remote: 'origin', branch: 'feature/x' },
      { name: 'origin/main', remote: 'origin', branch: 'main' },
      { name: 'team/feature/x', remote: 'team', branch: 'feature/x' },
      { name: 'team/fork/feature/x', remote: 'team/fork', branch: 'feature/x' },
      { name: 'team/fork/main', remote: 'team/fork', branch: 'main' },
      { name: 'team/main', remote: 'team', branch: 'main' },
    ],
  )
  assert.deepEqual(commit.tags, ['v1'])
})

test('a detached HEAD and a remote HEAD are not branches', { skip }, (t) => {
  const root = mkdtempSync(join(tmpdir(), 'commit-log-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const remote = join(root, 'remote.git')
  const work = join(root, 'work')
  git(root, 'init', '-q', '--bare', '-b', 'main', remote)
  git(root, 'init', '-q', '-b', 'main', work)
  git(work, 'commit', '-q', '--allow-empty', '-m', 'first')
  git(work, 'remote', 'add', 'origin', remote)
  git(work, 'push', '-q', 'origin', 'main')
  git(work, 'fetch', '-q', 'origin')
  git(work, 'remote', 'set-head', 'origin', 'main')
  git(work, 'checkout', '-q', '--detach')

  const [commit] = readLog(work)

  assert.deepEqual(commit.branchNames, ['main'])
  assert.deepEqual(commit.remoteBranches, [{ name: 'origin/main', remote: 'origin', branch: 'main' }])
  assert.equal(commit.tags, undefined)
})

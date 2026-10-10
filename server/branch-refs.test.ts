// The toolbar's Pull and Push start on the branch a local branch tracks, so the
// upstream is read from a real git: the format string is only as right as
// what git prints for it.

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { BRANCH_FORMAT, parseBranches } from './gitui/branch-refs.ts'
import { parseRemoteList, parseRemotes, REMOTE_REF_FORMAT } from './gitui/remote-refs.ts'

// The machine's own git config stays out: a global push.autoSetupRemote or
// branch.autoSetupMerge would set upstreams this test means to leave unset.
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

test('each local branch carries the remote branch it tracks, found among the fetched branches of that remote', {
  skip,
}, () => {
  const root = mkdtempSync(join(tmpdir(), 'branch-refs-'))
  try {
    const remote = join(root, 'remote.git')
    const work = join(root, 'work')
    git(root, 'init', '--bare', '-b', 'main', remote)
    git(root, 'init', '-b', 'main', work)
    git(work, 'commit', '--allow-empty', '-m', 'first')
    // Slashes on both sides: "team/fork" + "feature/x" must not come back as
    // remote "team", branch "fork/feature/x".
    git(work, 'remote', 'add', 'team/fork', remote)
    git(work, 'push', 'team/fork', 'main', 'main:feature/x')
    git(work, 'fetch', 'team/fork')
    git(work, 'branch', '--set-upstream-to=team/fork/main', 'main')
    git(work, 'branch', '--track', 'feature/x', 'team/fork/feature/x')
    git(work, 'branch', 'untracked')
    git(work, 'branch', '--track', 'follows-local', 'main')

    const branches = parseBranches(git(work, 'for-each-ref', 'refs/heads', `--format=${BRANCH_FORMAT}`).trimEnd())
    const byName = new Map(branches.map((branch) => [branch.name, branch]))

    assert.deepEqual([...byName.keys()].sort(), ['feature/x', 'follows-local', 'main', 'untracked'])
    assert.equal(byName.get('main')?.isHead, true)
    assert.deepEqual(byName.get('main')?.upstream, { remote: 'team/fork', branch: 'main' })
    assert.deepEqual(byName.get('feature/x')?.upstream, { remote: 'team/fork', branch: 'feature/x' })
    assert.equal(byName.get('untracked')?.upstream, undefined)
    // Tracks a local branch: nothing a pull or push could reach.
    assert.equal(byName.get('follows-local')?.upstream, undefined)

    // The fetched branches must group under the same remote the upstream
    // names, or the toolbar can't find the upstream among them. Around them:
    // a remote whose name "team/fork" starts with, a local branch that makes
    // a remote branch's short name ambiguous, and a ref of a remote that is
    // no longer configured.
    git(work, 'remote', 'add', 'team', remote)
    git(work, 'fetch', 'team')
    git(work, 'branch', 'team/fork/main')
    git(work, 'update-ref', 'refs/remotes/gone/old', 'HEAD')

    const remotes = parseRemotes(
      git(work, 'for-each-ref', 'refs/remotes', `--format=${REMOTE_REF_FORMAT}`).trimEnd(),
      parseRemoteList(git(work, 'remote', '-v')),
    )
    const grouped = remotes.map((r) => [r.name, r.url, r.branches.map((b) => b.name).sort()])
    assert.deepEqual(
      grouped.sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      [
        ['gone', '', ['gone/old']],
        ['team', remote, ['team/feature/x', 'team/main']],
        ['team/fork', remote, ['team/fork/feature/x', 'team/fork/main']],
      ],
    )
    const upstream = byName.get('feature/x')?.upstream
    const fork = remotes.find((r) => r.name === upstream?.remote)
    assert.ok(fork?.branches.some((b) => b.name === `${upstream?.remote}/${upstream?.branch}`))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a branch whose remote branch was deleted and pruned still names it', { skip }, () => {
  const root = mkdtempSync(join(tmpdir(), 'branch-refs-'))
  try {
    const remote = join(root, 'remote.git')
    const work = join(root, 'work')
    git(root, 'init', '--bare', '-b', 'main', remote)
    git(root, 'init', '-b', 'main', work)
    git(work, 'commit', '--allow-empty', '-m', 'first')
    git(work, 'remote', 'add', 'origin', remote)
    git(work, 'push', 'origin', 'main')
    git(work, 'switch', '-c', 'topic')
    git(work, 'push', '-u', 'origin', 'topic')
    git(work, 'push', 'origin', '--delete', 'topic')
    git(work, 'fetch', '--prune', 'origin')
    assert.equal(git(work, 'branch', '-r', '--list', 'origin/topic'), '')

    const branches = parseBranches(git(work, 'for-each-ref', 'refs/heads', `--format=${BRANCH_FORMAT}`).trimEnd())
    const topic = branches.find((branch) => branch.name === 'topic')
    assert.deepEqual(topic?.upstream, { remote: 'origin', branch: 'topic' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

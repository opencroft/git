// Pull and push are what the toolbar's dialogs run. The command lines are
// checked first, then each is handed to a real git against throwaway
// repositories, because the promises that matter -- a force push that refuses
// unseen work, a conflict that is reported -- are git's behaviour, not ours.

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { pull, pullArgs, pushArgs, type RunGit } from './gitui/remote-args.ts'

test('pull names the merge strategy either way', () => {
  assert.deepEqual(pullArgs({ remote: 'origin', branch: 'main' }), ['pull', '--no-rebase', '--', 'origin', 'main'])
  assert.deepEqual(pullArgs({ remote: 'origin', branch: 'main', rebase: true }), [
    'pull',
    '--rebase',
    '--',
    'origin',
    'main',
  ])
})

test('push maps a local branch onto a remote branch of another name', () => {
  assert.deepEqual(pushArgs({ remote: 'origin', branch: 'topic', remoteBranch: 'review/topic' }), [
    'push',
    '--',
    'origin',
    'topic:review/topic',
  ])
  assert.deepEqual(pushArgs({ remote: 'origin', branch: 'topic' }), ['push', '--', 'origin', 'topic'])
})

test('force push is always the lease, never a bare --force', () => {
  const args = pushArgs({ remote: 'origin', branch: 'topic', force: true, tags: true })
  assert.deepEqual(args, ['push', '--force-with-lease', '--tags', '--', 'origin', 'topic'])
  assert.ok(!args.includes('--force'))
})

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
function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], {
    cwd,
    env: ENV,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

// The command-line tests above need no git; every test below runs one.
const skip = spawnSync('git', ['--version']).error ? 'no git on PATH, and this test runs one' : false

/** Runs git and returns its stderr when it refuses; fails the test when it does not. */
function refused(cwd: string, args: string[]): string {
  try {
    git(cwd, args)
  } catch (err) {
    const { stdout, stderr } = err as { stdout: string; stderr: string }
    return `${stdout}${stderr}`
  }
  assert.fail(`git ${args.join(' ')} succeeded`)
}

function commit(cwd: string, file: string, content: string): void {
  writeFileSync(join(cwd, file), content)
  git(cwd, ['add', file])
  git(cwd, ['commit', '-q', '-m', `${file}: ${content.trim()}`])
}

// A remote and two clones of it: ours, and a colleague's who pushes first.
function setup(t: test.TestContext): { ours: string; theirs: string } {
  const root = mkdtempSync(join(tmpdir(), 'git-remote-args-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const remote = join(root, 'remote.git')
  git(root, ['init', '-q', '--bare', '-b', 'main', remote])
  const ours = join(root, 'ours')
  const theirs = join(root, 'theirs')
  git(root, ['clone', '-q', remote, ours])
  git(ours, ['checkout', '-q', '-b', 'main'])
  commit(ours, 'file.txt', 'base\n')
  git(ours, ['push', '-q', 'origin', 'main'])
  git(root, ['clone', '-q', remote, theirs])
  commit(theirs, 'file.txt', 'theirs\n')
  git(theirs, ['push', '-q', 'origin', 'main'])
  return { ours, theirs }
}

test('a push behind the remote is rejected, with git saying why', { skip }, (t) => {
  const { ours } = setup(t)
  commit(ours, 'file.txt', 'ours\n')
  const out = refused(ours, pushArgs({ remote: 'origin', branch: 'main' }))
  assert.match(out, /\[rejected\]/)
})

test('a force push refuses to overwrite commits that were never fetched', { skip }, (t) => {
  const { ours } = setup(t)
  commit(ours, 'file.txt', 'ours\n')
  const out = refused(ours, pushArgs({ remote: 'origin', branch: 'main', force: true }))
  assert.match(out, /stale info/)
})

test('a push that creates the remote branch makes it the upstream only when asked', { skip }, (t) => {
  const { ours } = setup(t)
  git(ours, ['checkout', '-q', '-b', 'topic'])
  git(ours, ['checkout', '-q', '-b', 'other'])
  git(ours, pushArgs({ remote: 'origin', branch: 'topic', remoteBranch: 'topic', setUpstream: true }))
  git(ours, pushArgs({ remote: 'origin', branch: 'other', remoteBranch: 'other' }))
  assert.equal(git(ours, ['rev-parse', '--abbrev-ref', 'topic@{upstream}']).trim(), 'origin/topic')
  assert.match(refused(ours, ['rev-parse', '--abbrev-ref', 'other@{upstream}']), /no upstream configured/)
})

/** A runner shaped like the host's: stdout on success, an Error carrying stderr alone on failure. */
function runner(cwd: string): RunGit {
  return async (args) => {
    try {
      return git(cwd, args)
    } catch (err) {
      throw new Error((err as { stderr: string }).stderr)
    }
  }
}

test('a pull that conflicts names the conflicted files, leaving the merge to resolve', { skip }, async (t) => {
  const { ours } = setup(t)
  commit(ours, 'file.txt', 'ours\n')
  await assert.rejects(pull(runner(ours), { remote: 'origin', branch: 'main' }), {
    message: 'The pull stopped on a merge conflict in 1 file: file.txt. Resolve them to finish the pull, or abort it.',
  })
  assert.equal(git(ours, ['diff', '--name-only', '--diff-filter=U']), 'file.txt\n')
})

test('a pull refused over an unfinished merge reports git refusing, not a new conflict', { skip }, async (t) => {
  const { ours } = setup(t)
  commit(ours, 'file.txt', 'ours\n')
  await assert.rejects(pull(runner(ours), { remote: 'origin', branch: 'main' }))
  await assert.rejects(pull(runner(ours), { remote: 'origin', branch: 'main' }), (err: Error) => {
    assert.match(err.message, /Pulling is not possible because you have unmerged files/)
    assert.doesNotMatch(err.message, /The pull stopped on a merge conflict/)
    return true
  })
})

test('a pull that fails without conflicts reports what git said', { skip }, async (t) => {
  const { ours } = setup(t)
  await assert.rejects(pull(runner(ours), { remote: 'origin', branch: 'missing' }), {
    message: /couldn't find remote ref missing/,
  })
})

test('a pull with nothing in its way merges the remote branch', { skip }, async (t) => {
  const { ours } = setup(t)
  await pull(runner(ours), { remote: 'origin', branch: 'main' })
  assert.equal(git(ours, ['show', 'HEAD:file.txt']), 'theirs\n')
})

test('a mapped push creates the remote branch under its new name', { skip }, (t) => {
  const { ours } = setup(t)
  git(ours, ['checkout', '-q', '-b', 'topic'])
  commit(ours, 'topic.txt', 'topic\n')
  git(ours, pushArgs({ remote: 'origin', branch: 'topic', remoteBranch: 'review/topic' }))
  assert.match(git(ours, ['ls-remote', '--heads', 'origin']), /refs\/heads\/review\/topic$/m)
})

// Creating and deleting repositories, run against a real git: every script
// here is what the Git App sends to its terminal, and the facts a deletion is
// decided on are only as right as what git prints for them.

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  createRepoName,
  createRepoScript,
  deleteRepoScript,
  deletionRefusal,
  inspectRepoScript,
  parseRepoInspection,
  type RepoDeletionReport,
} from './repo-lifecycle.ts'

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

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], {
    cwd,
    env: ENV,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function sh(script: string) {
  return spawnSync('bash', ['-c', script], { env: ENV, encoding: 'utf8' })
}

function commit(cwd: string, file: string) {
  writeFileSync(join(cwd, file), `${file}\n`)
  git(cwd, 'add', file)
  git(cwd, 'commit', '-q', '-m', `add ${file}`)
}

function inspect(folder: string, repo: string): RepoDeletionReport {
  const run = sh(inspectRepoScript(folder, repo))
  assert.equal(run.status, 0, run.stderr)
  return parseRepoInspection(run.stdout, folder, repo)
}

const skip = spawnSync('git', ['--version']).error ? 'no git on PATH, and every test here runs one' : false

/** A temp root holding `ws` (the workspace folder) and `up` (an upstream with two commits on main). */
function setup(t: { after: (fn: () => void) => void }) {
  const root = mkdtempSync(join(tmpdir(), 'repo-lifecycle-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const ws = join(root, 'ws')
  mkdirSync(ws)
  const up = join(root, 'up')
  mkdirSync(up)
  git(up, 'init', '-q', '-b', 'main')
  commit(up, 'one.txt')
  commit(up, 'two.txt')
  return { root, ws, up }
}

test('creates a bare or a non-bare repository on the initial branch asked for', { skip }, (t) => {
  const { ws } = setup(t)
  for (const [name, bare, initialBranch, head] of [
    ['bare.git', true, '', 'refs/heads/main'],
    ['tree', false, 'trunk', 'refs/heads/trunk'],
  ] as const) {
    const run = sh(createRepoScript({ folder: ws, name, bare, initialBranch }))
    assert.equal(run.status, 0, run.stderr)
    assert.equal(git(join(ws, name), 'rev-parse', '--is-bare-repository').trim(), String(bare), name)
    assert.equal(git(join(ws, name), 'symbolic-ref', 'HEAD').trim(), head, name)
  }
})

test('refuses a name that is taken by itself or by a repository sharing its worktrees folder', { skip }, (t) => {
  const { ws } = setup(t)
  mkdirSync(join(ws, 'a.git'))
  mkdirSync(join(ws, 'b'))
  mkdirSync(join(ws, 'c.worktrees'))
  for (const [name, taken] of [
    ['a', 'a.git'],
    ['b', 'b'],
    ['c.git', 'c.worktrees'],
  ]) {
    const run = sh(createRepoScript({ folder: ws, name, bare: true, initialBranch: 'main' }))
    assert.equal(run.status, 1, name)
    assert.match(run.stderr, new RegExp(`${taken.replace('.', '\\.')} already exists`), name)
  }
  // Nothing was initialised in the directories that were already there.
  assert.equal(existsSync(join(ws, 'a')), false)
  assert.equal(existsSync(join(ws, 'b', 'HEAD')), false)
  assert.equal(existsSync(join(ws, 'c.git')), false)
})

test('refuses a name that is not one directory, or names a worktrees folder', () => {
  for (const name of ['', '..', 'a/b', 'd.worktrees']) {
    assert.throws(() => createRepoName(name), /Invalid repository name/, JSON.stringify(name))
  }
  assert.equal(createRepoName(' e.git '), 'e.git')
})

test('refuses an initial branch git would not accept, creating nothing', { skip }, (t) => {
  const { ws } = setup(t)
  const run = sh(createRepoScript({ folder: ws, name: 'f.git', bare: true, initialBranch: 'bad..name' }))
  assert.equal(run.status, 1)
  assert.match(run.stderr, /Invalid initial branch name: bad\.\.name/)
  assert.equal(existsSync(join(ws, 'f.git')), false)
})

test('a repository with no remote counts its commits as unpushed, and its dirty working tree', { skip }, (t) => {
  const { ws } = setup(t)
  assert.equal(sh(createRepoScript({ folder: ws, name: 'local', bare: false, initialBranch: 'main' })).status, 0)
  commit(join(ws, 'local'), 'first.txt')
  writeFileSync(join(ws, 'local', 'scratch.txt'), 'x\n')

  const report = inspect(ws, 'local')
  assert.equal(report.bare, false)
  assert.deepEqual(report.worktrees, [])
  assert.deepEqual(report.unpushed, [{ ref: 'branch main', commits: 1 }])
  assert.deepEqual(report.uncommitted, [{ where: 'the working tree', files: 1 }])
  assert.deepEqual(report.blockers, [
    'the working tree has 1 uncommitted file',
    'branch main has 1 commit that no remote has',
  ])
})

test('an untouched bare clone, which has no remote-tracking refs, has nothing unpushed', { skip }, (t) => {
  const { ws, up } = setup(t)
  git(ws, 'clone', '-q', '--bare', up, 'up.git')
  // The shape that makes this case matter: the clone's branches are local ones.
  assert.equal(git(join(ws, 'up.git'), 'for-each-ref', 'refs/remotes').trim(), '')
  assert.equal(git(join(ws, 'up.git'), 'rev-list', '--count', 'refs/heads/main').trim(), '2')

  const report = inspect(ws, 'up.git')
  assert.equal(report.bare, true)
  assert.deepEqual(report.unpushed, [])
  assert.deepEqual(report.unreachableRemotes, [])
  assert.deepEqual(report.blockers, [])
})

test('work in a worktree of a clone is reported: a new commit, a detached commit and a dirty file', { skip }, (t) => {
  const { ws, up } = setup(t)
  git(ws, 'clone', '-q', '--bare', up, 'up.git')
  const repo = join(ws, 'up.git')
  git(repo, 'worktree', 'add', '-q', '-b', 'feat', join(ws, 'up.worktrees', 'feat'), 'main')
  commit(join(ws, 'up.worktrees', 'feat'), 'feat.txt')
  writeFileSync(join(ws, 'up.worktrees', 'feat', 'wip.txt'), 'x\n')
  git(repo, 'worktree', 'add', '-q', '--detach', join(ws, 'up.worktrees', 'det'), 'main')
  commit(join(ws, 'up.worktrees', 'det'), 'det.txt')

  const report = inspect(ws, 'up.git')
  assert.deepEqual(
    report.worktrees.map((w) => [w.name, w.path, w.branch, w.dirtyFiles, w.removable]),
    [
      ['det', 'up.worktrees/det', '', 0, true],
      ['feat', 'up.worktrees/feat', 'feat', 1, true],
    ],
  )
  assert.deepEqual(report.unpushed, [
    { ref: 'branch feat', commits: 1 },
    { ref: 'worktree det (detached HEAD)', commits: 1 },
  ])
  assert.deepEqual(report.uncommitted, [{ where: 'worktree feat', files: 1 }])
})

test('a remote that cannot be reached is a blocker, never a clean answer', { skip }, (t) => {
  const { root, ws, up } = setup(t)
  git(ws, 'clone', '-q', '--bare', up, 'up.git')
  git(join(ws, 'up.git'), 'remote', 'set-url', 'origin', join(root, 'nowhere.git'))

  const report = inspect(ws, 'up.git')
  assert.deepEqual(report.unreachableRemotes, ['origin'])
  assert.ok(
    report.blockers.includes('remote origin could not be reached, so commits it lacks could not be counted'),
    report.blockers.join('\n'),
  )
})

test('a non-bare clone counts against its remote-tracking refs when the remote cannot answer', { skip }, (t) => {
  const { root, ws, up } = setup(t)
  git(ws, 'clone', '-q', up, 'tree')
  const repo = join(ws, 'tree')
  git(repo, 'remote', 'set-url', 'origin', join(root, 'nowhere.git'))

  // Only the tracking refs vouch for main here: the remote advertises nothing.
  const before = inspect(ws, 'tree')
  assert.deepEqual(before.unreachableRemotes, ['origin'])
  assert.deepEqual(before.unpushed, [])

  commit(repo, 'local.txt')
  assert.deepEqual(inspect(ws, 'tree').unpushed, [{ ref: 'branch main', commits: 1 }])
})

test('a branch whose history cannot be read is a blocker, never a clean answer', { skip }, (t) => {
  const { ws } = setup(t)
  git(ws, 'init', '-q', '-b', 'main', 'broken')
  const repo = join(ws, 'broken')
  commit(repo, 'one.txt')
  commit(repo, 'two.txt')
  // The parent commit's object goes missing: the branch still lists, but its history cannot be walked.
  const parent = git(repo, 'rev-parse', 'HEAD~1').trim()
  rmSync(join(repo, '.git', 'objects', parent.slice(0, 2), parent.slice(2)))
  assert.notEqual(spawnSync('git', ['-C', repo, 'rev-list', '--count', 'main'], { env: ENV }).status, 0)

  const report = inspect(ws, 'broken')
  assert.deepEqual(report.blockers, ['branch main could not be checked for commits no remote has'])
  assert.notEqual(deletionRefusal(report, false), null)
})

test('a step that failed or never reported is a blocker, never a clean answer', { skip }, (t) => {
  const { ws, up } = setup(t)
  git(ws, 'clone', '-q', '--bare', up, 'up.git')
  git(join(ws, 'up.git'), 'worktree', 'add', '-q', '--detach', join(ws, 'up.worktrees', 'det'), 'main')
  const run = sh(inspectRepoScript(ws, 'up.git'))
  assert.equal(run.status, 0, run.stderr)
  const lines = run.stdout.trimEnd().split('\n')
  // The real output this table edits: every step ran and nothing is at risk.
  assert.deepEqual(parseRepoInspection(run.stdout, ws, 'up.git').blockers, [])
  assert.ok(lines.includes(`DETACHED\t${join(ws, 'up.worktrees', 'det')}\t0`), run.stdout)
  const without = (row: string) => {
    assert.ok(lines.includes(row), `${row} is in the output`)
    return lines.filter((l) => l !== row)
  }
  const replaced = (row: string, by: string) => without(row).concat(by)

  for (const [label, edited, blocker] of [
    [
      'a failed step',
      replaced('STEP\tbranches\tok', 'STEP\tbranches\tfailed'),
      'the branch list could not be read, so commits no remote has could not be counted',
    ],
    [
      'a missing step',
      without('STEP\tadvertised\tok'),
      'what the remotes have could not be read, so commits they lack could not be counted',
    ],
    [
      'a failed branch count',
      replaced('BRANCH\tmain\t0', 'BRANCH\tmain\tfailed'),
      'branch main could not be checked for commits no remote has',
    ],
    [
      'a detached HEAD with no count',
      lines.filter((l) => !l.startsWith('DETACHED\t')),
      'worktree det (detached HEAD) could not be checked for commits no remote has',
    ],
    ['output cut short', without('END'), 'the check did not finish, so work that would be lost could not be ruled out'],
  ] as const) {
    assert.deepEqual(parseRepoInspection(edited.join('\n'), ws, 'up.git').blockers, [blocker], label)
  }
})

test('a check that cannot create its scratch folder is refused, not read as clean', { skip }, (t) => {
  const { root, ws } = setup(t)
  git(ws, 'init', '-q', '-b', 'main', 'local')
  const run = spawnSync('bash', ['-c', inspectRepoScript(ws, 'local')], {
    env: { ...ENV, TMPDIR: join(root, 'no-such-dir') },
    encoding: 'utf8',
  })
  assert.equal(run.status, 0, run.stderr)
  assert.deepEqual(parseRepoInspection(run.stdout, ws, 'local').blockers, [
    'the check could not create its scratch folder, so nothing was checked',
    'the check did not finish, so work that would be lost could not be ruled out',
  ])
})

test('counts unpushed commits when the remotes advertise more commits than fit on a command line', { skip }, (t) => {
  const { root, ws } = setup(t)
  // An upstream whose main is a chain of commits, each also advertised under
  // its own ref, as a forge advertises one ref per pull request.
  const many = join(root, 'many.git')
  git(root, 'init', '-q', '--bare', '-b', 'main', many)
  const count = 5000
  const stream: string[] = []
  for (let i = 1; i <= count; i++) {
    const msg = `c${i}\n`
    stream.push(
      'commit refs/heads/main',
      `mark :${i}`,
      'committer Test <test@example.com> 1700000000 +0000',
      `data ${Buffer.byteLength(msg)}`,
      msg.slice(0, -1),
      ...(i > 1 ? [`from :${i - 1}`] : []),
      '',
      `reset refs/pull/${i}/head`,
      `from :${i}`,
      '',
    )
  }
  execFileSync('git', ['fast-import', '--quiet'], { cwd: many, env: ENV, input: `${stream.join('\n')}\n` })
  git(ws, 'clone', '-q', '--bare', many, 'many.git')
  const clone = join(ws, 'many.git')
  git(clone, 'worktree', 'add', '-q', '-b', 'feat', join(ws, 'many.worktrees', 'feat'), 'main')
  commit(join(ws, 'many.worktrees', 'feat'), 'feat.txt')

  // A 256 KiB stack caps arguments plus environment at Linux's floor of
  // 128 KiB, under the advertised commits' names alone (41 bytes each).
  const run = spawnSync('bash', ['-c', `ulimit -s 256 && ${inspectRepoScript(ws, 'many.git')}`], {
    env: ENV,
    encoding: 'utf8',
  })
  assert.equal(run.status, 0, run.stderr)
  assert.deepEqual(parseRepoInspection(run.stdout, ws, 'many.git').blockers, [
    'branch feat has 1 commit that no remote has',
  ])
})

test('a worktree registered outside the workspace is a blocker and is not deleted', { skip }, (t) => {
  const { root, ws, up } = setup(t)
  git(ws, 'clone', '-q', '--bare', up, 'up.git')
  const outside = join(root, 'elsewhere', 'out')
  git(join(ws, 'up.git'), 'worktree', 'add', '-q', '--detach', outside, 'main')

  const report = inspect(ws, 'up.git')
  assert.deepEqual(
    report.worktrees.map((w) => [w.path, w.removable]),
    [[outside, false]],
  )
  assert.match(report.blockers.join('\n'), /worktree out is at .*outside this repository's worktrees folder/)

  const run = sh(deleteRepoScript(ws, report))
  assert.equal(run.status, 0, run.stderr)
  assert.equal(existsSync(join(ws, 'up.git')), false)
  assert.equal(existsSync(join(outside, 'one.txt')), true)
})

test('delete removes the repository and its own worktrees, and leaves a sibling sharing the folder', { skip }, (t) => {
  const { ws, up } = setup(t)
  // `x` and `x.git` share `x.worktrees`: only what git registers for each is theirs.
  git(ws, 'init', '-q', '-b', 'main', 'x')
  commit(join(ws, 'x'), 'x.txt')
  git(join(ws, 'x'), 'worktree', 'add', '-q', '-b', 'other', join(ws, 'x.worktrees', 'other'))
  git(ws, 'clone', '-q', '--bare', up, 'x.git')
  git(join(ws, 'x.git'), 'worktree', 'add', '-q', '-b', 'a', join(ws, 'x.worktrees', 'a'), 'main')

  const bareReport = inspect(ws, 'x.git')
  assert.deepEqual(
    bareReport.worktrees.map((w) => w.path),
    ['x.worktrees/a'],
  )
  const first = sh(deleteRepoScript(ws, bareReport))
  assert.equal(first.status, 0, first.stderr)
  assert.equal(existsSync(join(ws, 'x.git')), false)
  assert.equal(existsSync(join(ws, 'x.worktrees', 'a')), false)
  assert.equal(existsSync(join(ws, 'x.worktrees', 'other', 'x.txt')), true)
  assert.equal(existsSync(join(ws, 'x', 'x.txt')), true)

  const second = sh(deleteRepoScript(ws, inspect(ws, 'x')))
  assert.equal(second.status, 0, second.stderr)
  assert.equal(existsSync(join(ws, 'x')), false)
  // The shared folder goes once nothing is left in it.
  assert.equal(existsSync(join(ws, 'x.worktrees')), false)
})

test('a directory that is not a repository is neither inspected nor deleted', { skip }, (t) => {
  const { ws } = setup(t)
  mkdirSync(join(ws, 'plain'))
  writeFileSync(join(ws, 'plain', 'keep.txt'), 'x\n')
  assert.throws(() => inspect(ws, 'plain'), /Repository not found in workspace: plain/)

  const forged: RepoDeletionReport = {
    repo: 'plain',
    bare: true,
    worktrees: [],
    uncommitted: [],
    unpushed: [],
    unreachableRemotes: [],
    blockers: [],
  }
  const run = sh(deleteRepoScript(ws, forged))
  assert.equal(run.status, 1)
  assert.match(run.stderr, /Not a git repository: plain/)
  assert.equal(existsSync(join(ws, 'plain', 'keep.txt')), true)
})

test('a delete with blockers is refused with each of them unless forced', () => {
  const report: RepoDeletionReport = {
    repo: 'r.git',
    bare: true,
    worktrees: [],
    uncommitted: [],
    unpushed: [],
    unreachableRemotes: [],
    blockers: ['branch b has 1 commit that no remote has', 'worktree w has 2 uncommitted files'],
  }
  assert.equal(
    deletionRefusal(report, false),
    [
      'Not deleting r.git:',
      '- branch b has 1 commit that no remote has',
      '- worktree w has 2 uncommitted files',
      'Deleting it anyway loses this work, and needs force.',
    ].join('\n'),
  )
  assert.equal(deletionRefusal(report, true), null)
  assert.equal(deletionRefusal({ ...report, blockers: [] }, false), null)
})

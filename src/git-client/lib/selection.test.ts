import assert from 'node:assert/strict'
import test from 'node:test'

import { type ClientView, gitSelection, lastSelectedLine, openInClient } from './selection.ts'
import type { GitCommit } from './types.ts'

const commit: GitCommit = {
  hash: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
  shortHash: 'a1b2c3d',
  message: 'Add the parser',
  author: 'alice',
  date: '2026-01-01T00:00:00Z',
  parents: [],
  branchNames: [],
  remoteBranches: [],
}

const changes: ClientView = { sidebarView: 'changes', commits: [commit] }
const history: ClientView = { sidebarView: 'commits', commits: [commit] }

test('what is open follows the view the reader is in', async (t) => {
  const cases: [string, ClientView, ReturnType<typeof openInClient>][] = [
    ['nothing in the changes view', changes, null],
    ['a working-tree file', { ...changes, selectedFilePath: 'src/a.ts' }, { kind: 'file', path: 'src/a.ts' }],
    [
      "a file opened from a commit's change list",
      { ...changes, selectedFilePath: 'src/a.ts', selectedCommitHash: commit.hash },
      { kind: 'commit', sha: commit.hash, subject: 'Add the parser', path: 'src/a.ts' },
    ],
    ['nothing selected in the history', { ...history, selectedFilePath: 'src/a.ts' }, null],
    [
      'a commit selected in the history',
      { ...history, selectedCommit: commit, selectedFilePath: 'src/other.ts' },
      { kind: 'commit', sha: commit.hash, subject: 'Add the parser' },
    ],
    [
      "a file open in the history's commit details",
      { ...history, selectedCommit: commit, selectedCommitFilePath: 'src/a.ts' },
      { kind: 'commit', sha: commit.hash, subject: 'Add the parser', path: 'src/a.ts' },
    ],
  ]
  for (const [name, view, expected] of cases) {
    await t.test(name, () => assert.deepEqual(openInClient(view), expected))
  }
})

test('a file on a worktree handle stays relative to the checkout', () => {
  assert.deepEqual(
    gitSelection({ terminal: 'app-1/worktree-terminal-repo-task' }, { kind: 'file', path: 'src/a.ts' }, null),
    {
      items: [{ kind: 'file', terminal: 'app-1/worktree-terminal-repo-task', path: 'src/a.ts' }],
    },
  )
})

test("a file in a repository opened as a folder is joined onto the repository's root", () => {
  assert.deepEqual(
    gitSelection({ terminal: 'node-1/terminal', root: '/srv/repos/sample' }, { kind: 'file', path: 'src/a.ts' }, null),
    { items: [{ kind: 'file', terminal: 'node-1/terminal', path: '/srv/repos/sample/src/a.ts' }] },
  )
})

test('highlighted lines of the open file travel with their range and text', () => {
  const code = { path: 'src/a.ts', startLine: 3, endLine: 5, text: 'one\ntwo\nthree' }
  assert.deepEqual(
    gitSelection({ terminal: 'node-1/terminal', root: '/r' }, { kind: 'file', path: 'src/a.ts' }, code),
    {
      items: [
        {
          kind: 'file',
          terminal: 'node-1/terminal',
          path: '/r/src/a.ts',
          lines: { from: 3, to: 5 },
          text: 'one\ntwo\nthree',
        },
      ],
    },
  )
})

test('a highlight in another file is not quoted with the open one', () => {
  const code = { path: 'src/b.ts', startLine: 1, endLine: 2, text: 'x\ny' }
  assert.deepEqual(gitSelection({ terminal: 't/h' }, { kind: 'file', path: 'src/a.ts' }, code), {
    items: [{ kind: 'file', terminal: 't/h', path: 'src/a.ts' }],
  })
})

test('a commit names its repository only when the client was opened on a folder', () => {
  const open = { kind: 'commit', sha: commit.hash, subject: 'Add the parser', path: 'src/a.ts' } as const
  assert.deepEqual(gitSelection({ terminal: 't/h', root: '/srv/repos/sample' }, open, null), {
    items: [
      {
        kind: 'commit',
        terminal: 't/h',
        repository: '/srv/repos/sample',
        sha: commit.hash,
        subject: 'Add the parser',
        path: 'src/a.ts',
      },
    ],
  })
  assert.deepEqual(gitSelection({ terminal: 't/h' }, { kind: 'commit', sha: commit.hash }, null), {
    items: [{ kind: 'commit', terminal: 't/h', sha: commit.hash }],
  })
})

test('nothing is published with nothing open or no terminal to read through', () => {
  assert.equal(gitSelection({ terminal: 't/h' }, null, null), null)
  assert.equal(gitSelection({ terminal: '' }, { kind: 'file', path: 'src/a.ts' }, null), null)
})

test('whole lines selected end on the last line that holds highlighted text', async (t) => {
  const cases: [string, Parameters<typeof lastSelectedLine>[0], number][] = [
    ['ending at the start of the next line', { startLineNumber: 3, endLineNumber: 6, endColumn: 1 }, 5],
    ['ending inside a line', { startLineNumber: 3, endLineNumber: 6, endColumn: 4 }, 6],
    ['the start of one line alone', { startLineNumber: 4, endLineNumber: 4, endColumn: 1 }, 4],
  ]
  for (const [name, range, expected] of cases) {
    await t.test(name, () => assert.equal(lastSelectedLine(range), expected))
  }
})

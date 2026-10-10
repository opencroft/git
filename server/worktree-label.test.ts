import assert from 'node:assert/strict'
import test from 'node:test'

import { worktreeHandleId, worktreeHandleLabel } from '../worktreeContext.ts'

test('a worktree handle reads as its repository and worktree name', () => {
  assert.equal(worktreeHandleLabel(worktreeHandleId('myrepo.git', 'my-task')), 'myrepo · my-task')
})

test('dashes inside both names survive the label', () => {
  assert.equal(worktreeHandleLabel(worktreeHandleId('my-app.git', 'alice-login-form')), 'my-app · alice-login-form')
})

test('an id outside the worktree scheme has no label', () => {
  assert.equal(worktreeHandleLabel('terminal'), undefined)
  assert.equal(worktreeHandleLabel('worktree-terminal-'), undefined)
})

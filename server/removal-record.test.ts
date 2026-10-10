import assert from 'node:assert/strict'
import test from 'node:test'

import { REMOVAL_RECORD_FIELDS, type RemovalRecord, removalRecordLine } from './removal-record.ts'

function record(overrides: Partial<RemovalRecord> = {}): RemovalRecord {
  return {
    at: '2026-01-02T03:04:05Z',
    repo: 'myrepo.git',
    worktree: 'my-task',
    branch: 'my-task',
    by: 'Someone',
    reason: 'merged',
    force: false,
    outcome: 'removed',
    ...overrides,
  }
}

test('a complete record is one line, in a fixed field order', () => {
  const line = removalRecordLine(record())
  assert.equal(
    line,
    ['2026-01-02T03:04:05Z', 'removed', 'myrepo.git', 'my-task', 'my-task', 'agent:Someone', 'no-force', 'merged'].join(
      '\t',
    ),
  )
  assert.equal(line.split('\t').length, REMOVAL_RECORD_FIELDS)
})

test('an agent caller is named as one; the UI is named as itself, never left blank', () => {
  // The whole point of the file. A removal nobody can account for is what this
  // record exists to end, so "no agent was involved" has to be a statement and
  // not an empty column -- those two read identically once a person is scanning
  // a log, and only one of them is a fact.
  assert.equal(removalRecordLine(record({ by: 'Someone' })).split('\t')[5], 'agent:Someone')
  assert.equal(removalRecordLine(record({ by: undefined })).split('\t')[5], 'workspace-ui')
  assert.equal(removalRecordLine(record({ by: '   ' })).split('\t')[5], 'workspace-ui')
})

test('an absent reason says so rather than leaving a gap', () => {
  assert.equal(removalRecordLine(record({ reason: '' })).split('\t')[7], '(none given)')
  assert.equal(removalRecordLine(record({ reason: '  \n ' })).split('\t')[7], '(none given)')
})

test('a detached HEAD says so rather than reporting an empty branch', () => {
  assert.equal(removalRecordLine(record({ branch: '' })).split('\t')[4], '(detached)')
})

test('free text cannot split one removal into two lines or grow a column', () => {
  // A reason comes from the caller and can hold anything. Both characters that
  // would break the file's one structural promise are in it here: the newline
  // that would make one removal look like two, and the tab that would shift
  // every field after it.
  const line = removalRecordLine(record({ reason: 'merged\nand\tdeployed', by: 'Some\tAgent' }))
  assert.equal(line.includes('\n'), false, 'one removal stays one line')
  assert.equal(line.split('\t').length, REMOVAL_RECORD_FIELDS, 'and keeps exactly its own fields')
  assert.equal(line.split('\t')[5], 'agent:Some Agent')
  assert.equal(line.split('\t')[7], 'merged and deployed')
})

test('force and outcome are both recorded, in both of their states', () => {
  // Force is the difference between removing a worktree and removing one whose
  // uncommitted work nobody had seen, and the failed case has to be on the
  // record too: an attempt that did not go through still answers "who asked".
  assert.equal(removalRecordLine(record({ force: true })).split('\t')[6], 'force')
  assert.equal(removalRecordLine(record({ force: false })).split('\t')[6], 'no-force')
  assert.equal(removalRecordLine(record({ outcome: 'failed' })).split('\t')[1], 'failed')
  assert.equal(removalRecordLine(record({ outcome: 'removed' })).split('\t')[1], 'removed')
})

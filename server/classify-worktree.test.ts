// The classifier decides whether a worktree is deleted, so it is the one thing here
// that earns a committed test. No framework: it is pure and exported, and `node --test`
// ships with the runtime.
//
// Each case below was first established by hand against a real worktree and then written
// down as facts. Fixture names are deliberately fictional -- the point of a case is the
// SHAPE of the facts, and a real branch name goes stale the week after it merges.

import assert from 'node:assert/strict'
import test from 'node:test'

import { classifyWorktree, type WorktreeFacts } from './classify-worktree.ts'

const WORKSPACE = '/workspace'

// The boring case, spelled out once so each test states only what makes it different:
// a clean worktree, registered where it is read from, on its own branch.
function facts(over: Partial<WorktreeFacts> = {}): WorktreeFacts {
  const ownPath = over.ownPath ?? `${WORKSPACE}/repo.worktrees/feature-a`
  return {
    ownPath,
    registeredPath: `${ownPath}/.git`,
    dirtyFiles: 0,
    branch: 'feature-a',
    integrationBranch: 'main',
    remoteKnown: true,
    onRemote: false,
    mergedIntoIntegration: false,
    ...over,
  }
}

test('a merged pull request whose branch was deleted is removable', () => {
  const { state } = classifyWorktree(facts({ onRemote: false, mergedIntoIntegration: true }))
  assert.equal(state, 'merged')
})

test('a commit that was never pushed is kept, not removed', () => {
  const { state } = classifyWorktree(facts({ onRemote: false, mergedIntoIntegration: false }))
  assert.equal(state, 'unpublished')
})

test('work that shipped but was rebased past is kept, because ancestry cannot see it', () => {
  // Indistinguishable from "never pushed" on the facts, and that is the point: both
  // are kept. Guessing between them is what would destroy the second one.
  const { state } = classifyWorktree(facts({ onRemote: false, mergedIntoIntegration: false }))
  assert.equal(state, 'unpublished')
})

test('an uncommitted file outranks every other verdict', () => {
  // Dirty AND merged: the check order is what makes this a keep rather than a delete.
  const { state, reason } = classifyWorktree(
    facts({ dirtyFiles: 1, onRemote: false, mergedIntoIntegration: true }),
  )
  assert.equal(state, 'dirty')
  assert.match(reason, /nobody has seen this work/)
})

test('a branch still on the remote is in flight, whatever its ancestry says', () => {
  const { state } = classifyWorktree(facts({ onRemote: true, mergedIntoIntegration: true }))
  assert.equal(state, 'live')
})

test("another host's checkout is never ours to remove", () => {
  // A checkout bind-mounted into a container registers the path the CONTAINER sees, so
  // from outside it looks like a worktree pointing nowhere -- while being a running
  // instance with a live database in it.
  const { state, reason } = classifyWorktree(
    facts({
      ownPath: `${WORKSPACE}/service-checkout`,
      registeredPath: '/mounted-elsewhere/.git',
      mergedIntoIntegration: true,
    }),
  )
  assert.equal(state, 'foreign')
  assert.match(reason, /another host's checkout/)
})

test('a detached HEAD has no branch to decide about', () => {
  const { state } = classifyWorktree(facts({ branch: '(detached HEAD)', mergedIntoIntegration: true }))
  assert.equal(state, 'foreign')
})

test('the integration branch itself is never a candidate', () => {
  const { state } = classifyWorktree(facts({ branch: 'main', mergedIntoIntegration: true }))
  assert.equal(state, 'foreign')
})

// ── Reading the remote ─────────────────────────────────────────────────────────

test('a branch deleted on the forge is merged, even though a local tracking ref survives', () => {
  // What can go wrong here is in FACT GATHERING, not in the classifier: a fetch
  // without `--prune` never removes a tracking ref, so reading `onRemote` from
  // `refs/remotes/origin/<branch>` would keep every worktree of shipped work `live`
  // forever.
  //
  // So this case pins the CONTRACT rather than the plumbing: `onRemote` means "present
  // in `ls-remote --heads origin`", and nothing else. Gather it from a local ref
  // and these facts stop describing reality -- which no unit test can catch, and which
  // is why the field carries that definition in its own doc comment.
  const { state, reason } = classifyWorktree(facts({ onRemote: false, mergedIntoIntegration: true }))
  assert.equal(state, 'merged')
  assert.match(reason, /gone from the remote and an ancestor of main/)
})

test('an unreadable remote is refused, not read as "every branch is gone"', () => {
  // `ls-remote` failing and a branch genuinely absent produce the same silence, and one
  // of them is removable. Without this the first network blip would present every
  // merged-and-clean worktree as removable at once.
  const { state, reason } = classifyWorktree(
    facts({ remoteKnown: false, onRemote: false, mergedIntoIntegration: true }),
  )
  assert.equal(state, 'unknown')
  assert.match(reason, /could not be read/)
})

test('only `merged` is ever removable', () => {
  // The sweep acts on exactly one state. This asserts the states it must never act on,
  // so a new state added later cannot quietly become removable by default.
  const keeps: WorktreeFacts[] = [
    facts({ dirtyFiles: 2, mergedIntoIntegration: true }),
    facts({ onRemote: true }),
    facts({ remoteKnown: false, mergedIntoIntegration: true }),
    facts({ branch: '(detached HEAD)', mergedIntoIntegration: true }),
    facts({ registeredPath: '/elsewhere/.git', mergedIntoIntegration: true }),
    facts({ onRemote: false, mergedIntoIntegration: false }),
  ]
  for (const f of keeps) {
    assert.notEqual(classifyWorktree(f).state, 'merged')
  }
})

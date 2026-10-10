// The removal record, in its own module with no host imports so it can be run by
// `node --test` directly. Pure -- facts in, one line out -- which is what makes the
// format's invariants testable without a terminal, the same reason
// `classify-worktree.ts` sits apart from the code that gathers its facts.
//
// WHY RECORD AT ALL
//
// A worktree removal leaves no trace of itself. The reflog does not cover it, the
// checkout is gone, and the branch it had is deleted in the same breath. So without
// a record, "who removed this, and why" can only be answered by asking people one
// by one, and that is not an answer a system should require.
//
// This does not decide whether a removal is allowed. It records that one was
// asked for, by whom, and what came of it.

/** What became of the removal the record describes. */
export type RemovalOutcome = 'removed' | 'failed'

export interface RemovalRecord {
  /** ISO 8601 UTC. Stamped by the caller, so this module stays pure. */
  at: string
  repo: string
  worktree: string
  /** The branch the worktree had checked out; empty for a detached HEAD. */
  branch: string
  /**
   * The agent the host attributed the call to, when there was one.
   *
   * Absent means the workspace UI: a person clicked the button, and no agent was
   * involved. That is a different fact from "nobody knows", and the record must
   * not render the two the same way -- "nobody knows" is the state this exists
   * to end.
   */
  by?: string
  /** Why, in the caller's own words. */
  reason: string
  force: boolean
  outcome: RemovalOutcome
}

/** No agent made this call -- the workspace UI did, on somebody's click. */
const WORKSPACE_UI = 'workspace-ui'
const NO_REASON = '(none given)'
const DETACHED = '(detached)'

/**
 * Free text, flattened.
 *
 * A reason arrives from a caller and can hold anything, including the two
 * characters that would otherwise let one removal become two lines or grow a
 * column: a newline and a tab. Collapsing all whitespace is what makes "one
 * removal is one line, with this many fields" true of every possible input
 * rather than of the polite ones.
 */
function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * One removal, one line.
 *
 * Tab-separated in a fixed field order rather than JSON: this file is read by
 * whoever is investigating a removal, usually with grep, usually long after the
 * fact. A format that survives being looked at in a terminal is worth more here
 * than one that parses cleanly, and the fields are few and fixed.
 *
 * EVERY FIELD IS FILLED. A blank column is precisely what an unattributed
 * removal looks like, so the format is built so it cannot produce one: an
 * absent actor reads as the UI, an absent reason says so, a detached HEAD says
 * so. Each of those is a statement; a blank is silence, and silence is what this
 * record replaces.
 */
export function removalRecordLine(record: RemovalRecord): string {
  const by = oneLine(record.by ?? '')
  const reason = oneLine(record.reason)
  return [
    record.at,
    record.outcome,
    record.repo,
    record.worktree,
    oneLine(record.branch) || DETACHED,
    by ? `agent:${by}` : WORKSPACE_UI,
    record.force ? 'force' : 'no-force',
    reason || NO_REASON,
  ].join('\t')
}

/** Fields per line, so a reader can tell a truncated line from a complete one. */
export const REMOVAL_RECORD_FIELDS = 8

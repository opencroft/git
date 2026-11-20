import type { Selection, SelectionItem } from '@opencroft/client/chat'

import type { CodeSelection } from './code-selection'
import type { GitCommit, SidebarView } from './types'

/** What the client shows the reader: a file of the working tree, or a commit and maybe one of its files. */
export type OpenInClient =
  | { kind: 'file'; path: string }
  | { kind: 'commit'; sha: string; subject?: string; path?: string }

/** The client's state that decides what is open. */
export interface ClientView {
  sidebarView: SidebarView
  /** The commit selected in the history. */
  selectedCommit?: GitCommit
  /** The file open in the history's commit details. */
  selectedCommitFilePath?: string
  /** The file open in the changes view. */
  selectedFilePath?: string
  /** The commit the changes view's file was opened from (the graph's change lists). */
  selectedCommitHash?: string
  commits: readonly GitCommit[]
}

/**
 * What is open, as the reader sees it: the history shows the selected commit
 * and the file of it opened in its details; the changes view shows its file,
 * which belongs to a commit when it was opened from one's change list.
 */
export function openInClient(view: ClientView): OpenInClient | null {
  if (view.sidebarView === 'commits') {
    const commit = view.selectedCommit
    return commit ? commitOpen(commit.hash, commit, view.selectedCommitFilePath) : null
  }
  if (!view.selectedFilePath) {
    return null
  }
  if (view.selectedCommitHash) {
    const hash = view.selectedCommitHash
    return commitOpen(
      hash,
      view.commits.find((c) => c.hash === hash),
      view.selectedFilePath,
    )
  }
  return { kind: 'file', path: view.selectedFilePath }
}

function commitOpen(sha: string, commit: GitCommit | undefined, path: string | undefined): OpenInClient {
  return {
    kind: 'commit',
    sha,
    ...(commit?.message ? { subject: commit.message } : {}),
    ...(path ? { path } : {}),
  }
}

/** Where the repository the client reads is. */
export interface ClientPlace {
  /** The `remote_*` target the client reads through. */
  terminal: string
  /**
   * The repository's top-level folder on that terminal. Absent when the
   * terminal's own working directory is the checkout (a worktree's handle):
   * paths then stay relative to it, and git runs there without `-C`.
   */
  root?: string
}

/**
 * The client's selection for the chat: the open file, with the lines the
 * reader highlighted in it, or the open commit, with the file of it that is
 * open. Paths are the repository's, joined onto `root` when there is one, so
 * each item resolves on its terminal as written. Null with nothing open, and
 * with no terminal, since then no agent tool reaches the repository.
 */
export function gitSelection(
  place: ClientPlace,
  open: OpenInClient | null,
  code: CodeSelection | null,
): Selection | null {
  if (!place.terminal || !open) {
    return null
  }
  const { terminal, root } = place
  if (open.kind === 'commit') {
    const item: SelectionItem = {
      kind: 'commit',
      terminal,
      sha: open.sha,
      ...(root ? { repository: root } : {}),
      ...(open.subject ? { subject: open.subject } : {}),
      ...(open.path ? { path: open.path } : {}),
    }
    return { items: [item] }
  }
  const highlight = code && code.path === open.path ? code : null
  const item: SelectionItem = {
    kind: 'file',
    terminal,
    path: root ? joinPath(root, open.path) : open.path,
    ...(highlight ? { lines: { from: highlight.startLine, to: highlight.endLine }, text: highlight.text } : {}),
  }
  return { items: [item] }
}

/**
 * The last line an editor highlight covers. Selecting whole lines (a drag down
 * the gutter, Shift+Down) ends the range at column 1 of the line after them,
 * which holds none of the highlighted characters.
 */
export function lastSelectedLine(range: { startLineNumber: number; endLineNumber: number; endColumn: number }): number {
  return range.endColumn === 1 && range.endLineNumber > range.startLineNumber
    ? range.endLineNumber - 1
    : range.endLineNumber
}

function joinPath(root: string, path: string): string {
  return root.endsWith('/') ? `${root}${path}` : `${root}/${path}`
}

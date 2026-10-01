// The single source for the Git App's handle-id and path scheme: how a
// worktree's dynamic `worktree-terminal-<repo>-<name>` handle id is built and
// parsed, and how workspace-relative paths join onto the workspace folder.
// Keep this file framework-free (no @ext/host or React imports) so it can be
// bundled into both the server and client entry points.

export const WORKTREE_HANDLE_PREFIX = 'worktree-terminal-'

/** Strip a trailing ".git" so a bare repo "<base>.git" maps onto its worktree dir "<base>.worktrees". */
export function repoBase(repo: string): string {
  return repo.replace(/\.git$/, '')
}

// Doubling every literal "-" means the single, unescaped "-" joining the two segments below is
// always unambiguous — it can't be confused with a "-" that was already part of a repo/worktree
// name (e.g. "my-app", "my-feature-branch").
function escapeSegment(s: string): string {
  return s.replace(/-/g, '--')
}

function unescapeSegment(s: string): string {
  return s.replace(/--/g, '-')
}

/** Builds the dynamic output handle id for a worktree, e.g. ("myrepo.git", "my-task") -> "worktree-terminal-myrepo-my--task". */
export function worktreeHandleId(repo: string, name: string): string {
  return `${WORKTREE_HANDLE_PREFIX}${escapeSegment(repoBase(repo))}-${escapeSegment(name)}`
}

function splitHandleTail(tail: string): { repoBase: string; name: string } | undefined {
  const match = /(?<!-)-(?!-)/.exec(tail)
  if (!match) {
    return undefined
  }
  return {
    repoBase: unescapeSegment(tail.slice(0, match.index)),
    name: unescapeSegment(tail.slice(match.index + 1)),
  }
}

/** Trim trailing slashes, but the filesystem root must stay "/" — not become "" (which would make shell commands operate on the exec cwd instead). */
export function normalizeWorkspaceFolder(folder: string): string {
  const trimmed = folder.replace(/\/+$/, '')
  return trimmed === '' && folder.startsWith('/') ? '/' : trimmed
}

/** Join a workspace-relative path onto the folder without producing "//". */
export function joinWorkspacePath(folder: string, rel: string): string {
  return folder === '/' ? `/${rel}` : `${folder}/${rel}`
}

/** True for a "<node-or-app>/<handleId>" target whose handle is a worktree's. */
export function isWorktreeTarget(target: string): boolean {
  const slash = target.indexOf('/')
  return slash > 0 && worktreeRelPath(target.slice(slash + 1)) !== undefined
}

/**
 * The handle id for a workspace-relative checkout path -- the inverse of
 * worktreeRelPath, for a caller holding the path rather than the two names.
 * Undefined when the path is not a worktree checkout, or when the names in it
 * do not survive the round trip (a repo or worktree named so that the escaping
 * is ambiguous), which is the same guard listHandles applies when advertising.
 */
export function worktreeHandleForRelPath(relPath: string): string | undefined {
  const match = /^(.+)\.worktrees\/(.+)$/.exec(relPath)
  if (!match) {
    return undefined
  }
  const handleId = worktreeHandleId(match[1], match[2])
  return worktreeRelPath(handleId) === relPath ? handleId : undefined
}

/**
 * Parse a worktree handle id back into the worktree's workspace-relative
 * checkout path, e.g. "worktree-terminal-myrepo-my--task" -> "myrepo.worktrees/my-task".
 * Undefined for ids outside the scheme.
 */
export function worktreeRelPath(handleId: string): string | undefined {
  if (!handleId.startsWith(WORKTREE_HANDLE_PREFIX)) {
    return undefined
  }
  const parsed = splitHandleTail(handleId.slice(WORKTREE_HANDLE_PREFIX.length))
  if (!parsed) {
    return undefined
  }
  return `${parsed.repoBase}.worktrees/${parsed.name}`
}

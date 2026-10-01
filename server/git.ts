import host from '@ext/host'

import { joinWorkspacePath, normalizeWorkspaceFolder, repoBase, worktreeHandleId } from '../worktreeContext'
import { classifyWorktree, type WorktreeFacts, type WorktreeState } from './classify-worktree'
import { parseTarget } from './gitui/run-git'
import { removalRecordLine } from './removal-record'

export { classifyWorktree }
export type { WorktreeFacts, WorktreeState }

interface TerminalContext {
  type: string
  [key: string]: unknown
}

interface ResolvedGitWorkspace {
  context: TerminalContext
  folder: string
  integrationBranches: Record<string, string>
}

/**
 * How every workspace-level action addresses its workspace: the Git App
 * instance's parameters — a terminal source ("node-id/handle-id") and the
 * workspace folder on it, plus the optional integration-branch configuration.
 */
export interface GitWorkspaceRef {
  target?: string
  folder?: string
  /**
   * Per repository, the branch its work actually merges into, as
   * "myrepo.git=main" entries separated by commas or newlines.
   *
   * THERE IS DELIBERATELY NO DEFAULT. A repository's own default branch can be
   * hundreds of commits behind the branch its pull requests land on, and git
   * reports that stale branch without any error -- so every branch merged in
   * the meantime reads as unmerged, and a sweep built on it looks like it is
   * working while being wrong about most of what it examines. An unconfigured
   * repository is therefore skipped and reported, never swept against a guess.
   */
  integrationBranches?: string
}

/** Parse the "repo=branch" list; malformed entries are dropped rather than guessed at. */
export function parseIntegrationBranches(raw: string | undefined): Record<string, string> {
  const result: Record<string, string> = {}
  for (const entry of (raw ?? '').split(/[,\n]/)) {
    const eq = entry.indexOf('=')
    if (eq <= 0) {
      continue
    }
    const repo = entry.slice(0, eq).trim()
    const branch = entry.slice(eq + 1).trim()
    if (repo && branch) {
      result[repo] = branch
    }
  }
  return result
}

async function resolveGitWorkspace(ref: GitWorkspaceRef): Promise<ResolvedGitWorkspace> {
  if (!ref.target || !ref.folder) {
    throw new Error('A git workspace needs a target and a folder')
  }
  const { nodeId, handleId } = parseTarget(ref.target)
  const context = (await host.terminal.getContext(nodeId, handleId)) as TerminalContext
  return {
    context,
    folder: normalizeWorkspaceFolder(ref.folder),
    integrationBranches: parseIntegrationBranches(ref.integrationBranches),
  }
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

/** A single path component (repo dir or worktree name) safe to splice into a path. */
function safeComponent(value: string, label: string): string {
  const name = value.trim()
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\') || name.includes('\0')) {
    throw new Error(`Invalid ${label}: ${JSON.stringify(value)}`)
  }
  return name
}

function worktreesDir(repo: string): string {
  return `${repoBase(repo)}.worktrees`
}

// ── Listing ───────────────────────────────────────────────────────────────

export interface WorktreeInfo {
  /** Final path component — also the dynamic handle suffix and the value passed back to remove/add. */
  name: string
  /** Path relative to the workspace folder. */
  relPath: string
  branch: string
  head: string
  changes: number
}

export interface RepoInfo {
  name: string
  bare: boolean
  branch: string
  changes: number
  ahead: number
  behind: number
  worktrees: WorktreeInfo[]
}

export type GitListReposParams = GitWorkspaceRef

const GIT = `git -c safe.directory='*'`

// Emits, per repo in the workspace folder, one REPO line followed by one WT line
// per linked worktree. Worktree change counts are computed per worktree. Output
// is tab-separated; paths are absolute so JS can derive the workspace-relative form.
function listScript(folder: string): string {
  const root = shellQuote(folder)
  return [
    `cd ${root} 2>/dev/null || exit 0`,
    'for d in */; do',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion
    '  d="${d%/}"',
    `  isbare=$(${GIT} -C "$d" rev-parse --is-bare-repository 2>/dev/null)`,
    '  [ -z "$isbare" ] && continue',
    // A directory merely INSIDE a repo also passes rev-parse — only accept actual repo
    // roots: a .git entry (dir or worktree/submodule file) for normal repos, or the
    // git dir being the directory itself for bare repos.
    '  if [ "$isbare" = "true" ]; then',
    `    [ "$(${GIT} -C "$d" rev-parse --git-dir 2>/dev/null)" = "." ] || continue`,
    '  else',
    '    [ -e "$d/.git" ] || continue',
    '  fi',
    '  if [ "$isbare" = "true" ]; then',
    `    branch=$(${GIT} -C "$d" symbolic-ref --short HEAD 2>/dev/null || ${GIT} -C "$d" rev-parse --short HEAD 2>/dev/null)`,
    '    [ -n "$branch" ] || branch="?"',
    '    branch=$(printf "%s" "$branch" | tr -d "\\n\\t")',
    '    printf "REPO\\t%s\\t1\\t%s\\t0\\t0\\t0\\n" "$d" "$branch"',
    '  else',
    `    branch=$(${GIT} -C "$d" symbolic-ref --short HEAD 2>/dev/null || ${GIT} -C "$d" rev-parse --short HEAD 2>/dev/null)`,
    '    [ -n "$branch" ] || branch="?"',
    `    changes=$(${GIT} -C "$d" status --porcelain 2>/dev/null | awk 'END{print NR+0}')`,
    `    track=$(${GIT} -C "$d" rev-list --left-right --count HEAD...@{upstream} 2>/dev/null)`,
    '    ahead=$(printf "%s" "$track" | awk \'{print $1+0}\')',
    '    behind=$(printf "%s" "$track" | awk \'{print $2+0}\')',
    '    [ -n "$ahead" ] || ahead=0',
    '    [ -n "$behind" ] || behind=0',
    '    branch=$(printf "%s" "$branch" | tr -d "\\n\\t")',
    '    printf "REPO\\t%s\\t0\\t%s\\t%s\\t%s\\t%s\\n" "$d" "$branch" "$changes" "$ahead" "$behind"',
    '  fi',
    `  ${GIT} -C "$d" worktree list --porcelain 2>/dev/null | {`,
    '    wpath=""; wbranch=""; whead=""; wbare=0',
    '    while IFS= read -r line; do',
    '      case "$line" in',
    '        "worktree "*)',
    '          if [ -n "$wpath" ] && [ "$wbare" = 0 ]; then',
    `            wch=$(${GIT} -C "$wpath" status --porcelain 2>/dev/null | awk 'END{print NR+0}')`,
    '            printf "WT\\t%s\\t%s\\t%s\\t%s\\t%s\\n" "$d" "$wpath" "$wbranch" "$whead" "$wch"',
    '          fi',
    '          wpath=${line#worktree }; wbranch=""; whead=""; wbare=0 ;;',
    '        "bare") wbare=1 ;;',
    '        "HEAD "*) whead=${line#HEAD } ;;',
    '        "branch "*) wbranch=${line#branch refs/heads/} ;;',
    '      esac',
    '    done',
    '    if [ -n "$wpath" ] && [ "$wbare" = 0 ]; then',
    `      wch=$(${GIT} -C "$wpath" status --porcelain 2>/dev/null | awk 'END{print NR+0}')`,
    '      printf "WT\\t%s\\t%s\\t%s\\t%s\\t%s\\n" "$d" "$wpath" "$wbranch" "$whead" "$wch"',
    '    fi',
    '  }',
    'done',
  ].join('\n')
}

export async function gitListRepos(params: GitListReposParams): Promise<RepoInfo[]> {
  const { context, folder } = await resolveGitWorkspace(params)
  let out = ''
  try {
    out = await host.terminal.exec(context, listScript(folder))
  } catch (err) {
    console.error(`[git.listRepos] failed for ${params.target}:`, err)
    return []
  }
  const repos: RepoInfo[] = []
  const byName = new Map<string, RepoInfo>()
  const prefix = folder === '/' ? '/' : `${folder}/`
  for (const line of out.split('\n')) {
    if (!line) {
      continue
    }
    const cols = line.split('\t')
    if (cols[0] === 'REPO') {
      const [, name, bare, branch, changes, ahead, behind] = cols
      const repo: RepoInfo = {
        name,
        bare: bare === '1',
        branch: branch || '?',
        changes: Number(changes) || 0,
        ahead: Number(ahead) || 0,
        behind: Number(behind) || 0,
        worktrees: [],
      }
      repos.push(repo)
      byName.set(name, repo)
    } else if (cols[0] === 'WT') {
      const [, repoName, path, branch, head, changes] = cols
      const repo = byName.get(repoName)
      if (!repo) {
        continue
      }
      const relPath = path.startsWith(prefix) ? path.slice(prefix.length) : path
      // Skip a normal repo's own main worktree (its checkout dir is the repo dir itself).
      if (relPath === repoName) {
        continue
      }
      repo.worktrees.push({
        name: relPath.split('/').pop() || relPath,
        relPath,
        branch: branch || (head ? `(detached ${head.slice(0, 7)})` : '?'),
        head,
        changes: Number(changes) || 0,
      })
    }
  }
  return repos
}

// ── Worktree audit ────────────────────────────────────────────────────────

export interface WorktreeAudit {
  repo: string
  /** Final path component — same value addWorktree/removeWorktree take as `name`. */
  name: string
  relPath: string
  branch: string
  head: string
  lastCommit: string
  dirtyFiles: number
  upstream: string | null
  ahead: number
  behind: number
  /** The branch this repo's work merges into, as configured. Null when none is. */
  integrationBranch: string | null
  /**
   * Whether the remote's branch list was read at all. False makes `onRemote` below an
   * absence of evidence rather than evidence, and nothing is removable on it.
   */
  remoteKnown: boolean
  /** Whether the branch still exists on the remote, per `ls-remote --heads origin`. */
  onRemote: boolean
  /** Whether HEAD is an ancestor of the configured integration branch. */
  mergedIntoIntegration: boolean
  state: WorktreeState
  /** Why this state, in terms someone reading the report can act on. */
  reason: string
}

/**
 * What a worktree is, for the purpose of deciding whether it may be removed.
 *
 * ONLY `merged` IS REMOVABLE, and it requires two independent signals to agree:
 * the branch is gone from the remote, AND its tip is an ancestor of the
 * configured integration branch. Either signal alone is wrong in a way that
 * destroys work --
 *
 * - gone-from-the-remote alone cannot tell "deleted because it merged" from
 *   "never pushed at all", and the second is somebody's only copy;
 * - ancestry alone counts a branch that was rebased mid-flight as unmerged,
 *   and counts nothing at all when it is measured against the wrong branch.
 *
 * Requiring both means the states disagree toward keeping. A worktree that has
 * merged but reads as `unpublished` costs disk; the reverse costs work.
 */
export interface GitListWorktreesParams extends GitWorkspaceRef {
  /** Limit the audit to one repo (e.g. "myrepo.git"); omit to sweep every repo in the workspace. */
  repo?: string
}

/** A repository the audit did not examine, and why. */
export interface SkippedRepo {
  repo: string
  worktrees: number
  reason: string
}

export interface WorktreeAuditReport {
  /**
   * When this was measured. A worktree count is a live number -- one can appear or
   * be removed between two readings -- so a count without its time is a snapshot
   * presenting itself as a fact.
   */
  measuredAt: string
  audits: WorktreeAudit[]
  /**
   * Repositories that were NOT examined, named rather than omitted. An audit that
   * silently returns fewer rows because it could not look at something reports a
   * clean workspace and an unexamined one identically.
   */
  skipped: SkippedRepo[]
}

// Per repo: a pruning full-refspec fetch and one `ls-remote`. Per worktree: last commit,
// ahead/behind, ancestry against the INTEGRATION branch, and where git has the worktree
// registered.
//
// Whether a branch is still on the remote comes from `ls-remote`, NOT from the presence of
// a `refs/remotes/origin/<branch>`. Those are different questions: a fetch without --prune
// never removes a tracking ref, so a branch merged and deleted on the forge would stay
// present locally and its worktree would classify `live` forever -- shipped work reading
// as in flight.
//
// `@{upstream}` is not used either: a bare `clone --bare` never configures
// `remote.origin.fetch`, so branch tracking config (even from `push -u`) cannot resolve to
// a tracking ref there.
//
// This emits FACTS ONLY and no verdict -- the classification lives in JS, where it can be
// read and tested, rather than in a generated shell script. Three facts decide it: whether
// the branch is still on the remote, whether HEAD is an ancestor of the INTEGRATION branch,
// and which path git has this worktree registered under.
//
// There is deliberately no patch-id fallback: against a forge that lands pull requests as
// merge commits it can never fire, because `diff-tree -p` on a merge emits nothing and its
// patch-id is empty, so it would only ever agree with ancestry, which has already answered.
function worktreeAuditScript(
  folder: string,
  repoDir: string,
  integrationBranch: string,
  worktrees: { relPath: string; branch: string }[],
): string {
  const repoPath = shellQuote(joinWorkspacePath(folder, repoDir))
  // Ref names (unlike paths) come from git discovery output, not from us — a branch name may
  // legally contain shell metacharacters ($, (, ;, ...). Route every ref name through a
  // single-quoted shellQuote() assignment and reference it only via "$var" afterwards, so its
  // content is never re-parsed by the shell, the same way paths already are.
  const lines = [
    `${GIT} -C ${repoPath} fetch --prune origin '+refs/heads/*:refs/remotes/origin/*' >/dev/null 2>&1 || true`,
    // The forge's own branch list, asked for directly rather than inferred from what a
    // fetch left behind. A local `refs/remotes/origin/<branch>` cannot answer "is this
    // branch still on the remote": without --prune a fetch never deletes one, so a
    // branch merged and deleted on the forge keeps its tracking ref indefinitely and
    // every worktree of that shipped work reads as still in flight. --prune above fixes
    // the refs; this makes the answer independent of them having been fixed.
    //
    // Its failure is handled rather than swallowed. `ls-remote` failing and a branch
    // genuinely gone produce the same silence, and one of those is removable -- so the
    // exit status is captured separately from the parse (a pipe would report sed's) and
    // travels with each row.
    'remoteKnown=false',
    'remoteRaw=$(mktemp)',
    'remoteBranches=$(mktemp)',
    `if ${GIT} -C ${repoPath} ls-remote --heads origin > "$remoteRaw" 2>/dev/null; then`,
    `  sed -n 's#^[0-9a-f]*[[:space:]]*refs/heads/##p' "$remoteRaw" > "$remoteBranches"`,
    '  remoteKnown=true',
    'fi',
    `intBranch=${shellQuote(integrationBranch)}`,
    'intRef="$intBranch"',
    `${GIT} -C ${repoPath} rev-parse --verify -q "refs/remotes/origin/$intBranch" >/dev/null 2>&1 && intRef="refs/remotes/origin/$intBranch"`,
  ]
  for (const { relPath, branch } of worktrees) {
    const wt = shellQuote(joinWorkspacePath(folder, relPath))
    const detached = branch.startsWith('(detached')
    lines.push(
      `wt=${wt}`,
      `br=${shellQuote(branch)}`,
      `lastCommit=$(${GIT} -C "$wt" log -1 --oneline 2>/dev/null | tr -d '\\n')`,
      'upstream=""; ahead=0; behind=0',
    )
    if (!detached) {
      lines.push(
        // Membership of the remote's list, not existence of a local ref. `-F` and `-x`
        // so a branch name is matched literally and whole; `--` so one beginning with a
        // dash is not read as an option.
        'if [ "$remoteKnown" = true ] && grep -Fxq -- "$br" "$remoteBranches"; then upstream="origin/$br"; fi',
        'if [ -n "$upstream" ]; then',
        `  track=$(${GIT} -C "$wt" rev-list --left-right --count HEAD..."refs/remotes/origin/$br" 2>/dev/null)`,
        '  ahead=$(printf "%s" "$track" | awk \'{print $1+0}\')',
        '  behind=$(printf "%s" "$track" | awk \'{print $2+0}\')',
        'fi',
      )
    }
    lines.push(
      'merged=false',
      `${GIT} -C "$wt" merge-base --is-ancestor HEAD "$intRef" 2>/dev/null && merged=true`,
      // The path git has this worktree registered under, which is not always the path it is
      // being read from. A checkout bind-mounted into a container registers the path the
      // container sees, so from anywhere else it presents as a worktree whose location does
      // not resolve -- indistinguishable from one abandoned years ago, while it may be a
      // running instance with a live database inside it. Reading the admin
      // entry back is what tells those apart; nothing about the directory itself does.
      'registered=""',
      `gd=$(sed -n 's/^gitdir: //p' "$wt/.git" 2>/dev/null)`,
      '[ -n "$gd" ] && registered=$(cat "$gd/gitdir" 2>/dev/null)',
      `printf "WT\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n" "$wt" "$lastCommit" "$upstream" "$ahead" "$behind" "$merged" "$registered" "$remoteKnown"`,
    )
  }
  lines.push('rm -f "$remoteRaw" "$remoteBranches"')
  return lines.join('\n')
}

function parseWorktreeAudit(
  folder: string,
  repo: RepoInfo,
  integrationBranch: string,
  out: string,
): WorktreeAudit[] {
  const prefix = folder === '/' ? '/' : `${folder}/`
  const byRelPath = new Map<string, WorktreeAudit>()
  for (const line of out.split('\n')) {
    if (!line) {
      continue
    }
    const cols = line.split('\t')
    if (cols[0] !== 'WT') {
      continue
    }
    const [, path, lastCommit, upstream, ahead, behind, merged, registered, remoteKnownCol] = cols
    const relPath = path.startsWith(prefix) ? path.slice(prefix.length) : path
    const wt = repo.worktrees.find((w) => w.relPath === relPath)
    if (!wt) {
      continue
    }
    byRelPath.set(relPath, {
      repo: repo.name,
      name: wt.name,
      relPath: wt.relPath,
      branch: wt.branch,
      head: wt.head,
      lastCommit,
      dirtyFiles: wt.changes,
      upstream: upstream || null,
      ahead: Number(ahead) || 0,
      behind: Number(behind) || 0,
      integrationBranch,
      remoteKnown: remoteKnownCol === 'true',
      onRemote: Boolean(upstream),
      mergedIntoIntegration: merged === 'true',
      ...classifyWorktree({
        ownPath: path,
        registeredPath: registered ?? '',
        dirtyFiles: wt.changes,
        branch: wt.branch,
        integrationBranch,
        remoteKnown: remoteKnownCol === 'true',
        onRemote: Boolean(upstream),
        mergedIntoIntegration: merged === 'true',
      }),
    })
  }
  // Preserve discovery order regardless of the shell loop's output order.
  return repo.worktrees.map((w) => byRelPath.get(w.relPath)).filter((a): a is WorktreeAudit => Boolean(a))
}

/**
 * Full worktree audit built on top of the existing discovery (`gitListRepos` — the same
 * enumeration behind the node's worktree list and the dynamic worktree-terminal handles).
 * `listRepos` stays a fast, fetch-free inventory; this does the heavier per-worktree work.
 * Omit `repo` to sweep every repo in the workspace in one call.
 */
export async function gitListWorktrees(params: GitListWorktreesParams): Promise<WorktreeAuditReport> {
  const { context, folder, integrationBranches } = await resolveGitWorkspace(params)
  const repos = await gitListRepos(params)
  const repoFilter = params.repo?.trim() ? safeComponent(params.repo, 'repository') : undefined
  if (repoFilter && !repos.some((r) => r.name === repoFilter)) {
    throw new Error(`Repository not found in workspace: ${repoFilter}`)
  }
  const targets = repoFilter ? repos.filter((r) => r.name === repoFilter) : repos
  const audits: WorktreeAudit[] = []
  const skipped: SkippedRepo[] = []
  for (const repo of targets) {
    if (repo.worktrees.length === 0) {
      continue
    }
    // No configured integration branch, no audit. Falling back to the repo's own
    // default branch is what makes this silently wrong: a default branch can be
    // hundreds of commits behind the one work lands on, and git says so without
    // complaint, so every worktree reads unmerged and the sweep looks like it ran.
    // A repository nobody configured is named here instead of being examined.
    const integrationBranch = integrationBranches[repo.name]?.trim()
    if (!integrationBranch) {
      skipped.push({
        repo: repo.name,
        worktrees: repo.worktrees.length,
        reason: 'no integration branch configured for this repository',
      })
      continue
    }
    const script = worktreeAuditScript(
      folder,
      repo.name,
      integrationBranch,
      repo.worktrees.map((w) => ({ relPath: w.relPath, branch: w.branch })),
    )
    let out = ''
    try {
      out = await host.terminal.exec(context, script)
    } catch (err) {
      console.error(`[git.listWorktrees] failed for ${repo.name}:`, err)
      skipped.push({ repo: repo.name, worktrees: repo.worktrees.length, reason: `audit failed: ${String(err)}` })
      continue
    }
    audits.push(...parseWorktreeAudit(folder, repo, integrationBranch, out))
  }
  return { measuredAt: new Date().toISOString(), audits, skipped }
}

// ── Prune ─────────────────────────────────────────────────────────────────

export interface GitPruneWorktreesParams extends GitWorkspaceRef {
  /** Limit to one repo; omit to sweep every configured repo in the workspace. */
  repo?: string
  /**
   * Actually remove what the audit found removable. DEFAULTS TO FALSE.
   *
   * The first answer a sweep gives is a list somebody reads. A worktree wrongly on
   * that list is recoverable for exactly as long as it is only a line of output,
   * and each obvious predicate for "this one is finished" -- ancestry against the
   * wrong branch, patch-equivalence against a merge commit, absence from the
   * remote -- can be confidently wrong, two of them in the direction that
   * destroys work.
   */
  apply?: boolean
}

export interface WorktreePruneReport {
  measuredAt: string
  /** False when this was a report and nothing was touched. */
  applied: boolean
  /** Removable: gone from the remote AND an ancestor of the integration branch. */
  removable: WorktreeAudit[]
  /** Actually removed. Empty on a report. */
  removed: { repo: string; name: string }[]
  /** Everything kept, each carrying the state and the reason that kept it. */
  kept: WorktreeAudit[]
  /** Repositories not examined at all -- an unexamined workspace is not a clean one. */
  skipped: SkippedRepo[]
  /** Removals attempted and failed, named rather than dropped. */
  failures: { repo: string; name: string; error: string }[]
}

/**
 * Remove the worktrees whose work has landed, and report everything else.
 *
 * Built on the audit rather than beside it, so there is one classifier and the
 * list a person reads is the same list the removal acts on. A second
 * implementation of "is this finished" is how the two answers drift apart.
 */
export async function gitPruneWorktrees(params: GitPruneWorktreesParams): Promise<WorktreePruneReport> {
  const report = await gitListWorktrees(params)
  const removable = report.audits.filter((a) => a.state === 'merged')
  const kept = report.audits.filter((a) => a.state !== 'merged')
  const removed: { repo: string; name: string }[] = []
  const failures: { repo: string; name: string; error: string }[] = []
  if (params.apply === true) {
    for (const wt of removable) {
      try {
        // Never forced. `git worktree remove` refuses a tree with uncommitted
        // changes, and it reads the tree at REMOVAL time rather than at audit
        // time -- so work written in the seconds between the two still stops it.
        // The audit's own dirty check cannot cover that gap; this does.
        await gitRemoveWorktree({ target: params.target, folder: params.folder, repo: wt.repo, name: wt.name })
        removed.push({ repo: wt.repo, name: wt.name })
      } catch (err) {
        failures.push({ repo: wt.repo, name: wt.name, error: err instanceof Error ? err.message : String(err) })
      }
    }
  }
  return {
    measuredAt: report.measuredAt,
    applied: params.apply === true,
    removable,
    removed,
    kept,
    skipped: report.skipped,
    failures,
  }
}

// ── Clone ─────────────────────────────────────────────────────────────────

export interface GitCloneParams extends GitWorkspaceRef {
  url: string
}

/** Standard (working-tree) clone — kept for backward compatibility. */
export async function gitClone(params: GitCloneParams): Promise<void> {
  const { context, folder } = await resolveGitWorkspace(params)
  const root = shellQuote(folder)
  const script = `mkdir -p ${root} && cd ${root} && git clone ${shellQuote(params.url)}`
  await host.terminal.exec(context, script)
}

export interface GitCloneBareParams extends GitWorkspaceRef {
  url: string
  /** Optional directory name; defaults to "<repo>.git" derived from the URL. */
  name?: string
}

function deriveBareName(url: string): string {
  const tail = url.replace(/\/+$/, '').split(/[/:]/).pop() || 'repo'
  const base = tail.replace(/\.git$/, '') || 'repo'
  return `${base}.git`
}

/** Clone a repository in bare mode so worktrees can be attached to it. */
export async function gitCloneBare(params: GitCloneBareParams): Promise<{ name: string }> {
  const { context, folder } = await resolveGitWorkspace(params)
  if (!params.url?.trim()) {
    throw new Error('Repository URL is required')
  }
  const name = safeComponent(params.name?.trim() || deriveBareName(params.url), 'repository name')
  const root = shellQuote(folder)
  const script = `mkdir -p ${root} && cd ${root} && git clone --bare ${shellQuote(params.url.trim())} ${shellQuote(name)}`
  await host.terminal.exec(context, script)
  return { name }
}

// ── Worktrees ─────────────────────────────────────────────────────────────

export interface GitAddWorktreeParams extends GitWorkspaceRef {
  /** Owning repository directory (e.g. "myrepo.git"). */
  repo: string
  /** Worktree name — also the checkout dir and the new branch name. */
  name: string
  /** Optional start point (branch / tag / commit) for the new branch. Defaults to the repo's HEAD. */
  base?: string
  /**
   * How to name the Git App instance that exposes the new worktree's terminal
   * handle. When set, the result announces the handle as
   * `<handleOwner>/<handleId>`, which is a string the caller is expected to
   * paste — so pass the instance's public address, not its internal id.
   */
  handleOwner?: string
}

/** Add a worktree to a repo on a new branch named <name>. Checkout lands in "<base>.worktrees/<name>" beside the repo. */
export async function gitAddWorktree(params: GitAddWorktreeParams): Promise<string> {
  const { context, folder } = await resolveGitWorkspace(params)
  const repo = safeComponent(params.repo, 'repository')
  const name = safeComponent(params.name, 'worktree name')
  const relPath = `${worktreesDir(repo)}/${name}`
  const wtPath = shellQuote(joinWorkspacePath(folder, relPath))
  const repoPath = shellQuote(joinWorkspacePath(folder, repo))
  const base = params.base?.trim()
  const start = base ? ` ${shellQuote(base)}` : ''
  await host.terminal.exec(context, `${GIT} -C ${repoPath} worktree add -b ${shellQuote(name)} ${wtPath}${start}`)
  const access = params.handleOwner
    ? `it can be accessed by \`${params.handleOwner}/${worktreeHandleId(repo, name)}\``
    : `checked out at ${joinWorkspacePath(folder, relPath)}`
  return (
    `Worktree created, ${access}. ` +
    'It has no git identity configured. Do not run `git config user.*` here — that writes to the ' +
    "repo's shared config and races with every other worktree of it. Commit with per-commit env vars: " +
    'GIT_AUTHOR_NAME=<you> GIT_AUTHOR_EMAIL=<you>@example.com GIT_COMMITTER_NAME=<you> ' +
    "GIT_COMMITTER_EMAIL=<you>@example.com git commit -m '...'"
  )
}

/** Where the removal record is appended: beside the repositories it is about. */
export const REMOVAL_LOG = '.worktree-removals.log'

export interface GitRemoveWorktreeParams extends GitWorkspaceRef {
  repo: string
  name: string
  force?: boolean
  /** Why this worktree is being removed. Recorded, and required of an agent. */
  reason?: string
  /** Who the host attributed this call to, when an agent made it. */
  callerAgent?: string
}

/**
 * Remove a worktree and delete the branch it had checked out (skipped for a
 * detached HEAD), recording who asked and why beside the workspace.
 *
 * The record is NOT a guard. Nothing here refuses a removal git would perform;
 * it answers a question nothing else can -- who removed this,
 * and why -- and it is written for a failed attempt as well as a successful
 * one, because "who asked" is worth the same either way.
 */
export async function gitRemoveWorktree(params: GitRemoveWorktreeParams): Promise<void> {
  const { context, folder } = await resolveGitWorkspace(params)
  const repo = safeComponent(params.repo, 'repository')
  const name = safeComponent(params.name, 'worktree name')
  const reason = (params.reason ?? '').trim()
  // Enforced at the destructive function rather than at the action that declares
  // it required, because this is reachable through two doors -- the App action
  // agents call, and the App view's own `invoke` surface -- and a rule living on
  // one of them is a rule for one of them.
  //
  // Scoped to an agent caller on purpose: the view has no field to type a reason
  // into, so requiring one there would break its button rather than guard
  // anything. The record still names that path for what it is.
  if (params.callerAgent && !reason) {
    throw new Error(
      'A reason is required to remove a worktree: the removal deletes the checked-out branch with it, and leaves no other trace of who asked or why.',
    )
  }
  const wtPath = shellQuote(joinWorkspacePath(folder, `${worktreesDir(repo)}/${name}`))
  const repoPath = shellQuote(joinWorkspacePath(folder, repo))
  const force = params.force ? ' --force' : ''
  // Read in its own call, before anything is removed: the branch is the most
  // useful field in the record and it stops existing one line later. `|| true`
  // because a detached HEAD and a missing checkout both exit non-zero here, and
  // neither is an error -- the first is a fact the record states, the second is
  // for `worktree remove` to report.
  const branch = (
    await host.terminal.exec(context, `${GIT} -C ${wtPath} symbolic-ref --short HEAD 2>/dev/null || true`)
  ).trim()
  const base = {
    at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    repo,
    worktree: name,
    branch,
    reason,
    force: params.force === true,
    ...(params.callerAgent ? { by: params.callerAgent } : {}),
  }
  const logPath = shellQuote(joinWorkspacePath(folder, REMOVAL_LOG))
  const script = [
    `${GIT} -C ${repoPath} worktree remove${force} ${wtPath}`,
    'status=$?',
    // The branch goes whether or not the removal reported success.
    branch ? `${GIT} -C ${repoPath} branch -D ${shellQuote(branch)}` : ':',
    'if [ "$status" -eq 0 ]; then',
    `  printf '%s\\n' ${shellQuote(removalRecordLine({ ...base, outcome: 'removed' }))} >> ${logPath}`,
    'else',
    `  printf '%s\\n' ${shellQuote(removalRecordLine({ ...base, outcome: 'failed' }))} >> ${logPath}`,
    'fi',
    // The append runs after the removal, so without this its status would become
    // the action's and a failed removal would be reported as a success.
    'exit "$status"',
  ].join('\n')
  await host.terminal.exec(context, script)
}

// ── Remove repo ───────────────────────────────────────────────────────────

export interface GitRemoveRepoParams extends GitWorkspaceRef {
  repo: string
}

/** Remove a cloned repository and any worktrees attached to it. */
export async function gitRemoveRepo(params: GitRemoveRepoParams): Promise<void> {
  const { context, folder } = await resolveGitWorkspace(params)
  const repo = safeComponent(params.repo, 'repository')
  const repoPath = shellQuote(joinWorkspacePath(folder, repo))
  const wtPath = shellQuote(joinWorkspacePath(folder, worktreesDir(repo)))
  // Guard: only delete a path that is actually a git repository.
  const script = [
    `if [ -z "$(${GIT} -C ${repoPath} rev-parse --git-dir 2>/dev/null)" ]; then`,
    `  echo "Not a git repository: ${repo}" >&2; exit 1`,
    'fi',
    `rm -rf ${repoPath} ${wtPath}`,
  ].join('\n')
  await host.terminal.exec(context, script)
}

// Creating and deleting a repository in the workspace: the shell scripts that
// gather facts or act, and the JS that reads those facts and decides. No host
// imports, so `node --test` runs every script here against a real git.

import { joinWorkspacePath, repoBase } from '../worktreeContext.ts'

/** Every git call in the workspace, readable whoever owns the repository on disk. */
export const GIT = `git -c safe.directory='*'`

export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

/** A single path component (repo dir or worktree name) safe to splice into a path. */
export function safeComponent(value: string, label: string): string {
  const name = value.trim()
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\') || name.includes('\0')) {
    throw new Error(`Invalid ${label}: ${JSON.stringify(value)}`)
  }
  return name
}

// ── Create ────────────────────────────────────────────────────────────────

export const DEFAULT_INITIAL_BRANCH = 'main'

export interface CreateRepoRequest {
  folder: string
  name: string
  bare: boolean
  initialBranch: string
}

/**
 * The repository name as it will land on disk, refused when it cannot be one.
 *
 * A name ending in `.worktrees` is refused because that is where another
 * repository's checkouts live.
 */
export function createRepoName(value: string): string {
  const name = safeComponent(value, 'repository name')
  if (name.endsWith('.worktrees')) {
    throw new Error(`Invalid repository name: ${JSON.stringify(value)} ends in ".worktrees", which holds worktrees`)
  }
  return name
}

/**
 * Initialise an empty repository, refusing a name that is taken.
 *
 * "Taken" covers more than the directory itself. `x` and `x.git` share the
 * worktrees folder `x.worktrees` and the same worktree handle ids, so each of
 * the three blocks the others. The check and the `git init` run in one script
 * because `git init` on an existing repository succeeds quietly, and a check
 * made in an earlier call would leave that gap open.
 */
export function createRepoScript(req: CreateRepoRequest): string {
  const name = createRepoName(req.name)
  const base = repoBase(name)
  const taken = [...new Set([name, base, `${base}.git`, `${base}.worktrees`])]
  const branch = req.initialBranch.trim() || DEFAULT_INITIAL_BRANCH
  return [
    `root=${shellQuote(req.folder)}`,
    ...taken.map(
      (entry) =>
        `if [ -e ${shellQuote(joinWorkspacePath(req.folder, entry))} ]; then echo ${shellQuote(`${entry} already exists in the workspace`)} >&2; exit 1; fi`,
    ),
    `if ! ${GIT} check-ref-format --branch ${shellQuote(branch)} >/dev/null 2>&1; then echo ${shellQuote(`Invalid initial branch name: ${branch}`)} >&2; exit 1; fi`,
    'mkdir -p "$root" || exit 1',
    `${GIT} init -q${req.bare ? ' --bare' : ''} -b ${shellQuote(branch)} ${shellQuote(joinWorkspacePath(req.folder, name))}`,
  ].join('\n')
}

// ── Inspect before delete ─────────────────────────────────────────────────

/**
 * Prints the facts a deletion is decided on, one tab-separated row each, and
 * always exits 0: the verdict is reached in JS from the rows. Each step
 * prints whether it ran (`STEP <name> ok|failed`), each branch and detached
 * HEAD prints its count or `failed`, and the last row is `END`, so a step that
 * failed or never ran can be told apart from one that found nothing.
 *
 * Unpushed means reachable from a local branch, or from a worktree's detached
 * HEAD, and from none of: a remote-tracking ref, or a ref a remote advertises
 * right now. The second half is what makes a bare clone read correctly: `git
 * clone --bare` writes the remote's branches as local branches and no
 * `refs/remotes` at all, so subtracting tracking refs alone would count every
 * commit of every ordinary bare clone as unpushed.
 *
 * `ls-remote` cannot stop on a credential prompt (prompts off, askpass
 * answering nothing, ssh in batch mode, a time bound where `timeout` exists).
 * Only remote NAMES are printed: a URL can carry a credential.
 */
export function inspectRepoScript(folder: string, repo: string): string {
  const repoPath = shellQuote(joinWorkspacePath(folder, safeComponent(repo, 'repository')))
  return [
    `repo=${repoPath}`,
    `isbare=$(${GIT} -C "$repo" rev-parse --is-bare-repository 2>/dev/null)`,
    'if [ "$isbare" = true ]; then',
    `  [ "$(${GIT} -C "$repo" rev-parse --git-dir 2>/dev/null)" = "." ] || { printf 'KIND\\tnone\\n'; exit 0; }`,
    "  printf 'KIND\\tbare\\n'",
    'elif [ "$isbare" = false ]; then',
    `  [ -e "$repo/.git" ] || { printf 'KIND\\tnone\\n'; exit 0; }`,
    "  printf 'KIND\\tnormal\\n'",
    'else',
    "  printf 'KIND\\tnone\\n'; exit 0",
    'fi',
    'step() { printf \'STEP\\t%s\\t%s\\n\' "$1" "$2"; }',
    'tmp=$(mktemp -d 2>/dev/null) || tmp=""',
    'if [ -z "$tmp" ] || [ ! -d "$tmp" ]; then step scratch failed; exit 0; fi',
    'trap \'rm -rf "$tmp"\' EXIT',
    'heads="$tmp/heads"',
    'if ! : > "$heads" 2>/dev/null; then step scratch failed; exit 0; fi',
    'step scratch ok',
    // Worktrees as git has them registered. The first entry is the repository
    // itself: its working tree for a normal repo, a `bare` line otherwise.
    'emit() {',
    '  [ -n "$wpath" ] || return 0',
    '  [ "$wbare" = 1 ] && return 0',
    '  ex=0; [ -e "$wpath" ] && ex=1',
    `  if out=$(${GIT} -C "$wpath" status --porcelain 2>/dev/null); then`,
    "    n=$(printf '%s\\n' \"$out\" | sed '/^$/d' | wc -l | tr -d ' ')",
    '  else',
    '    n=-1',
    '  fi',
    '  printf \'WT\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n\' "$wpath" "$wbranch" "$whead" "$n" "$ex" "$wmain"',
    '  if [ -z "$wbranch" ] && [ -n "$whead" ]; then printf \'%s\\t%s\\n\' "$whead" "$wpath" >> "$heads"; fi',
    '}',
    'wpath=""; wbranch=""; whead=""; wbare=0; wmain=1; first=1',
    `if ${GIT} -C "$repo" worktree list --porcelain > "$tmp/wt" 2>/dev/null; then`,
    '  while IFS= read -r line; do',
    '    case "$line" in',
    '      "worktree "*)',
    '        emit',
    '        if [ "$first" = 1 ]; then wmain=1; first=0; else wmain=0; fi',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion
    '        wpath=${line#worktree }; wbranch=""; whead=""; wbare=0 ;;',
    '      "bare") wbare=1 ;;',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion
    '      "HEAD "*) whead=${line#HEAD } ;;',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion
    '      "branch "*) wbranch=${line#branch refs/heads/} ;;',
    '    esac',
    '  done < "$tmp/wt"',
    '  emit',
    '  step worktrees ok',
    'else',
    '  step worktrees failed',
    'fi',
    // The commits subtracted from every count, one `^<sha>` line each, fed to
    // `rev-list --stdin` so their number is not bounded by the argument list.
    // First what every remote advertises, kept to the commits this repository
    // has: an object it lacks cannot be an ancestor of anything local.
    'neg="$tmp/neg"',
    'to=""; command -v timeout >/dev/null 2>&1 && to="timeout 30"',
    'advok=1',
    ': > "$tmp/adv" || advok=0',
    `if ${GIT} -C "$repo" remote > "$tmp/remotes" 2>/dev/null; then`,
    '  step remotes ok',
    '  while IFS= read -r r; do',
    '    [ -n "$r" ] || continue',
    `    if GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=true SSH_ASKPASS=true GIT_SSH_COMMAND='ssh -o BatchMode=yes' $to ${GIT} -C "$repo" ls-remote "$r" > "$tmp/ls" 2>/dev/null < /dev/null; then`,
    '      printf \'REMOTE\\t%s\\tok\\n\' "$r"',
    '      cut -f1 "$tmp/ls" >> "$tmp/adv" || advok=0',
    '    else',
    '      printf \'REMOTE\\t%s\\tfailed\\n\' "$r"',
    '    fi',
    '  done < "$tmp/remotes"',
    'else',
    '  step remotes failed',
    'fi',
    `if [ "$advok" = 1 ] && sort -u "$tmp/adv" > "$tmp/adv.u" && sed 's/$/^{commit}/' "$tmp/adv.u" > "$tmp/adv.q" && ${GIT} -C "$repo" cat-file --batch-check='%(objectname) %(objecttype)' < "$tmp/adv.q" > "$tmp/adv.t" 2>/dev/null && awk '$2 == "commit" { print "^" $1 }' "$tmp/adv.t" > "$neg"; then`,
    '  step advertised ok',
    'else',
    '  step advertised failed',
    'fi',
    `if ${GIT} -C "$repo" for-each-ref --format='^%(objectname)' refs/remotes >> "$neg" 2>/dev/null; then`,
    '  step tracking ok',
    'else',
    '  step tracking failed',
    'fi',
    // A branch is listed by its full ref, so a short name that is ambiguous
    // with a tag or a remote cannot be counted against the wrong ref.
    `if ${GIT} -C "$repo" for-each-ref --format='%(refname)' refs/heads > "$tmp/branches" 2>/dev/null; then`,
    '  step branches ok',
    '  while IFS= read -r ref; do',
    '    [ -n "$ref" ] || continue',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion
    '    b=${ref#refs/heads/}',
    `    if n=$(${GIT} -C "$repo" rev-list --count --stdin "$ref" < "$neg" 2>/dev/null) && [ -n "$n" ]; then`,
    '      printf \'BRANCH\\t%s\\t%s\\n\' "$b" "$n"',
    '    else',
    '      printf \'BRANCH\\t%s\\tfailed\\n\' "$b"',
    '    fi',
    '  done < "$tmp/branches"',
    'else',
    '  step branches failed',
    'fi',
    // A detached HEAD also has the local branches subtracted: a commit on one
    // of them is already counted there.
    'dok=0',
    `cp "$neg" "$tmp/negd" 2>/dev/null && ${GIT} -C "$repo" for-each-ref --format='^%(objectname)' refs/heads >> "$tmp/negd" 2>/dev/null && dok=1`,
    'while IFS="$(printf \'\\t\')" read -r h p; do',
    '  [ -n "$h" ] || continue',
    `  if [ "$dok" = 1 ] && n=$(${GIT} -C "$repo" rev-list --count --stdin "$h" < "$tmp/negd" 2>/dev/null) && [ -n "$n" ]; then`,
    '    printf \'DETACHED\\t%s\\t%s\\n\' "$p" "$n"',
    '  else',
    '    printf \'DETACHED\\t%s\\tfailed\\n\' "$p"',
    '  fi',
    'done < "$heads"',
    "printf 'END\\n'",
    'exit 0',
  ].join('\n')
}

/** One worktree of the repository being deleted, as git has it registered. */
export interface RepoDeletionWorktree {
  /** Its directory name. */
  name: string
  /** Relative to the workspace folder when it is inside it, else the absolute path git registered. */
  path: string
  /** Empty for a detached HEAD. */
  branch: string
  /** Null when its status could not be read. */
  dirtyFiles: number | null
  /**
   * Whether deleting the repository deletes this checkout: true only for the
   * repository's own worktrees folder, where `addWorktree` puts them.
   */
  removable: boolean
}

export interface RepoDeletionReport {
  repo: string
  bare: boolean
  /** Linked worktrees; a normal repository's own working tree is not one of them. */
  worktrees: RepoDeletionWorktree[]
  /** Places holding uncommitted files: "the working tree", or "worktree <name>". */
  uncommitted: { where: string; files: number }[]
  /** Branches, and detached worktree HEADs, with commits no remote has. */
  unpushed: { ref: string; commits: number }[]
  /** Remotes that did not answer, so the unpushed list is not known to be complete. */
  unreachableRemotes: string[]
  /**
   * Every reason to stop, as a sentence. Empty means a delete loses nothing
   * this inspection could see.
   */
  blockers: string[]
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * The steps `inspectRepoScript` reports, each with what stays unknown when it
 * did not run: one of these missing or failed is a reason to stop, because
 * the work it would have found cannot be ruled out.
 */
const INSPECTION_STEPS: Record<string, string> = {
  scratch: 'the check could not create its scratch folder, so nothing was checked',
  worktrees: 'the worktree list could not be read, so uncommitted files and detached commits could not be counted',
  remotes: 'the remote list could not be read, so commits the remotes lack could not be counted',
  advertised: 'what the remotes have could not be read, so commits they lack could not be counted',
  tracking: 'the remote-tracking branches could not be read, so commits the remotes lack could not be counted',
  branches: 'the branch list could not be read, so commits no remote has could not be counted',
}

/** A count row's value, or null when the script printed `failed` or anything else that is not a count. */
function countOf(value: string | undefined): number | null {
  const n = Number(value)
  return value !== undefined && /^\d+$/.test(value) && Number.isSafeInteger(n) ? n : null
}

function unchecked(ref: string): string {
  return `${ref} could not be checked for commits no remote has`
}

/** Reads `inspectRepoScript`'s rows. Throws for a name that is not a repository. */
export function parseRepoInspection(out: string, folder: string, repo: string): RepoDeletionReport {
  const prefix = folder === '/' ? '/' : `${folder}/`
  const ownWorktrees = `${prefix}${repoBase(repo)}.worktrees/`
  let kind = ''
  let finished = false
  let sawWorkingTree = false
  const steps = new Map<string, string>()
  const worktrees: RepoDeletionWorktree[] = []
  const uncommitted: { where: string; files: number }[] = []
  const unpushed: { ref: string; commits: number }[] = []
  const unreachableRemotes: string[] = []
  const notCounted: string[] = []
  const blockers: string[] = []
  const nameOf = new Map<string, string>()
  // Every detached HEAD the worktree list names, crossed off by its count row.
  const detachedPending = new Set<string>()
  const detachedLabel = (path: string) => `worktree ${nameOf.get(path) ?? path} (detached HEAD)`

  for (const line of out.split('\n')) {
    const cols = line.split('\t')
    if (cols[0] === 'KIND') {
      kind = cols[1]
    } else if (cols[0] === 'STEP') {
      steps.set(cols[1], cols[2])
    } else if (cols[0] === 'END') {
      finished = true
    } else if (cols[0] === 'WT') {
      const [, path, branch, head, dirty, exists, main] = cols
      const n = Number(dirty)
      const dirtyFiles = Number.isInteger(n) && n >= 0 ? n : null
      const name = path.split('/').pop() || path
      nameOf.set(path, name)
      if (!branch && head) {
        detachedPending.add(path)
      }
      if (main === '1') {
        sawWorkingTree = true
        if (dirtyFiles === null) {
          blockers.push('the working tree could not be read')
        } else if (dirtyFiles > 0) {
          uncommitted.push({ where: 'the working tree', files: dirtyFiles })
        }
        continue
      }
      const removable = path.startsWith(ownWorktrees) && !path.slice(ownWorktrees.length).includes('/')
      worktrees.push({
        name,
        path: path.startsWith(prefix) ? path.slice(prefix.length) : path,
        branch,
        dirtyFiles,
        removable,
      })
      if (exists !== '1') {
        // A registered checkout whose directory is gone holds nothing to lose.
        continue
      }
      if (!removable) {
        blockers.push(
          `worktree ${name} is at ${path}, outside this repository's worktrees folder, and would be left behind pointing at a deleted repository`,
        )
      }
      if (dirtyFiles === null) {
        blockers.push(`worktree ${name} could not be read`)
      } else if (dirtyFiles > 0) {
        uncommitted.push({ where: `worktree ${name}`, files: dirtyFiles })
      }
    } else if (cols[0] === 'REMOTE' && cols[2] === 'failed') {
      unreachableRemotes.push(cols[1])
    } else if (cols[0] === 'BRANCH' || cols[0] === 'DETACHED') {
      const [type, ref, count] = cols
      if (type === 'DETACHED') {
        detachedPending.delete(ref)
      }
      const label = type === 'DETACHED' ? detachedLabel(ref) : `branch ${ref}`
      const commits = countOf(count)
      if (commits === null) {
        notCounted.push(label)
      } else if (commits > 0) {
        unpushed.push({ ref: label, commits })
      }
    }
  }

  if (kind !== 'bare' && kind !== 'normal') {
    throw new Error(`Repository not found in workspace: ${repo}`)
  }
  for (const { where, files } of uncommitted) {
    blockers.push(`${where} has ${plural(files, 'uncommitted file')}`)
  }
  for (const { ref, commits } of unpushed) {
    blockers.push(`${ref} has ${plural(commits, 'commit')} that no remote has`)
  }
  for (const remote of unreachableRemotes) {
    blockers.push(`remote ${remote} could not be reached, so commits it lacks could not be counted`)
  }
  for (const ref of notCounted) {
    blockers.push(unchecked(ref))
  }
  for (const [step, unknown] of Object.entries(INSPECTION_STEPS)) {
    const result = steps.get(step)
    // A step the script never reached is reported once, as the unfinished check below.
    if (result === 'failed' || (result !== 'ok' && finished)) {
      blockers.push(unknown)
    }
  }
  if (finished) {
    for (const path of detachedPending) {
      blockers.push(unchecked(detachedLabel(path)))
    }
    if (kind === 'normal' && steps.get('worktrees') === 'ok' && !sawWorkingTree) {
      blockers.push('the working tree could not be read')
    }
  } else {
    blockers.push('the check did not finish, so work that would be lost could not be ruled out')
  }
  return { repo, bare: kind === 'bare', worktrees, uncommitted, unpushed, unreachableRemotes, blockers }
}

/** Why a delete must not go ahead, or null when it may. */
export function deletionRefusal(report: RepoDeletionReport, force: boolean): string | null {
  if (force || report.blockers.length === 0) {
    return null
  }
  return [
    `Not deleting ${report.repo}:`,
    ...report.blockers.map((b) => `- ${b}`),
    'Deleting it anyway loses this work, and needs force.',
  ].join('\n')
}

// ── Delete ────────────────────────────────────────────────────────────────

/**
 * Remove the repository and the worktrees the report marks removable: the
 * paths git registers for THIS repository, never a folder picked by name, so
 * a sibling sharing the worktrees folder (`x` beside `x.git`) keeps its
 * checkouts. The folder itself goes only once it is empty. No remote is
 * contacted.
 */
export function deleteRepoScript(folder: string, report: RepoDeletionReport): string {
  const repo = safeComponent(report.repo, 'repository')
  const repoPath = shellQuote(joinWorkspacePath(folder, repo))
  const removed = report.worktrees.filter((w) => w.removable).map((w) => shellQuote(joinWorkspacePath(folder, w.path)))
  return [
    `repo=${repoPath}`,
    `isbare=$(${GIT} -C "$repo" rev-parse --is-bare-repository 2>/dev/null)`,
    'ok=0',
    `if [ "$isbare" = true ] && [ "$(${GIT} -C "$repo" rev-parse --git-dir 2>/dev/null)" = "." ]; then ok=1; fi`,
    'if [ "$isbare" = false ] && [ -e "$repo/.git" ]; then ok=1; fi',
    `if [ "$ok" != 1 ]; then echo ${shellQuote(`Not a git repository: ${repo}`)} >&2; exit 1; fi`,
    ...(removed.length > 0 ? [`rm -rf -- ${removed.join(' ')} || exit 1`] : []),
    'rm -rf -- "$repo" || exit 1',
    `rmdir -- ${shellQuote(joinWorkspacePath(folder, `${repoBase(repo)}.worktrees`))} 2>/dev/null || true`,
  ].join('\n')
}

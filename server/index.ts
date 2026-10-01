import type { AppActionContext, AppInstanceContext, AppsExport } from '@opencroft/server'
import host from '@ext/host'

import { joinWorkspacePath, normalizeWorkspaceFolder, worktreeHandleId, worktreeRelPath } from '../worktreeContext'
import {
  type GitAddWorktreeParams,
  type GitCloneBareParams,
  type GitCloneParams,
  type GitListReposParams,
  type GitListWorktreesParams,
  type GitPruneWorktreesParams,
  type GitRemoveRepoParams,
  type GitRemoveWorktreeParams,
  type GitWorkspaceRef,
  gitAddWorktree,
  gitClone,
  gitCloneBare,
  gitListRepos,
  gitListWorktrees,
  gitPruneWorktrees,
  gitRemoveRepo,
  gitRemoveWorktree,
} from './git'
import { parseTarget } from './gitui/run-git'
import * as applyPatch from './gitui/apply-patch'
import * as branches from './gitui/branches'
import * as changes from './gitui/changes'
import * as commits from './gitui/commits'
import * as gitData from './gitui/git-data'
import * as rebaseInteractive from './gitui/rebase-interactive'
import * as remotes from './gitui/remotes'
import * as stashes from './gitui/stashes'
import * as submodules from './gitui/submodules'
import * as tags from './gitui/tags'

const gitui = {
  ...applyPatch,
  ...branches,
  ...changes,
  ...commits,
  ...gitData,
  ...rebaseInteractive,
  ...remotes,
  ...stashes,
  ...submodules,
  ...tags,
}

// The App view's server surface (reached via `invoke`); agents use the App
// actions below instead.
export const actions = {
  'git.listRepos': (params: GitListReposParams) => gitListRepos(params),
  'git.listWorktrees': (params: GitListWorktreesParams) => gitListWorktrees(params),
  'git.pruneWorktrees': (params: GitPruneWorktreesParams) => gitPruneWorktrees(params),
  'git.clone': (params: GitCloneParams) => gitClone(params),
  'git.cloneBare': (params: GitCloneBareParams) => gitCloneBare(params),
  'git.addWorktree': (params: GitAddWorktreeParams) => gitAddWorktree(params),
  'git.removeWorktree': (params: GitRemoveWorktreeParams) => gitRemoveWorktree(params),
  'git.removeRepo': (params: GitRemoveRepoParams) => gitRemoveRepo(params),
  ...Object.fromEntries(Object.entries(gitui).map(([name, fn]) => [`gitui.${name}`, fn])),
}

// ── The Git App ────────────────────────────────────────────────────────────
// One instance = one workspace: a terminal source plus a folder of (bare)
// repositories on it. The workspace address every action needs comes from the
// instance's parameters, so agents pass only the action's own arguments.

function wsOf(ctx: AppInstanceContext): GitWorkspaceRef {
  return {
    target: ctx.params.terminal,
    folder: ctx.params.folder,
    integrationBranches: ctx.params.integrationBranches,
  }
}

function str(params: Record<string, unknown>, key: string): string {
  const value = params[key]
  return typeof value === 'string' ? value : ''
}

function optStr(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

// Each worktree is exposed as a `worktree-terminal-<repo>-<name>` source
// handle on the App INSTANCE (declared in the manifest's apps entry): its
// terminal context is the instance's configured terminal, rooted (`cwd`) at
// the worktree directory. `listHandles` enumerates live worktrees on every
// discovery, so a handle appears with its worktree and goes with it.
async function listWorktreeHandles(ctx: AppInstanceContext): Promise<string[]> {
  const repos = await gitListRepos(wsOf(ctx))
  return repos.flatMap((repo) =>
    repo.worktrees
      // Only worktrees whose id round-trips back to their checkout path get a
      // handle: one checked out at a foreign path (e.g. a bind-mounted running
      // instance) would advertise a handle whose cwd does not exist.
      .filter((wt) => worktreeRelPath(worktreeHandleId(repo.name, wt.name)) === wt.relPath)
      .map((wt) => worktreeHandleId(repo.name, wt.name)),
  )
}

async function worktreeHandleContext(
  ctx: AppInstanceContext,
  handleId: string,
): Promise<Record<string, unknown> | undefined> {
  const relPath = worktreeRelPath(handleId)
  const folder = normalizeWorkspaceFolder(ctx.params.folder ?? '')
  if (!relPath || !folder || !ctx.params.terminal) {
    return undefined
  }
  const { nodeId, handleId: sourceHandle } = parseTarget(ctx.params.terminal)
  const base = await host.terminal.getContext(nodeId, sourceHandle)
  return { ...base, cwd: joinWorkspacePath(folder, relPath) }
}

export const apps: AppsExport = {
  git: {
    listHandles: listWorktreeHandles,
    getHandleContext: worktreeHandleContext,
    actions: {
      listRepos: (ctx: AppActionContext) => gitListRepos(wsOf(ctx)),
      listWorktrees: (ctx: AppActionContext, params: Record<string, unknown>) =>
        gitListWorktrees({ ...wsOf(ctx), repo: optStr(params, 'repo') }),
      // `apply` must be exactly true to remove anything. Anything else -- absent,
      // a string, a truthy value from a caller that guessed -- reports and removes
      // nothing, because the safe reading of an ambiguous request is the one that
      // is still recoverable afterwards.
      pruneWorktrees: (ctx: AppActionContext, params: Record<string, unknown>) =>
        gitPruneWorktrees({
          ...wsOf(ctx),
          repo: optStr(params, 'repo'),
          apply: params.apply === true,
        }),
      cloneRepo: (ctx: AppActionContext, params: Record<string, unknown>) =>
        gitCloneBare({ ...wsOf(ctx), url: str(params, 'url'), name: optStr(params, 'name') }),
      addWorktree: (ctx: AppActionContext, params: Record<string, unknown>) =>
        gitAddWorktree({
          ...wsOf(ctx),
          repo: str(params, 'repo'),
          name: str(params, 'name'),
          base: optStr(params, 'base'),
          // What a reader is told to paste has to be the form the listings
          // teach: `<space>.<app-slug>`. The instance id still resolves, so it
          // stays as the fallback for the degenerate case where the space
          // cannot be named — a target that does not resolve would be worse
          // than an unfashionable one.
          handleOwner: ctx.spaceSlug ? `${ctx.spaceSlug}.${ctx.slug}` : ctx.instanceId,
        }),
      removeWorktree: (ctx: AppActionContext, params: Record<string, unknown>) =>
        gitRemoveWorktree({
          ...wsOf(ctx),
          repo: str(params, 'repo'),
          name: str(params, 'name'),
          force: params.force === true,
          reason: str(params, 'reason'),
          // Who the host says asked. Absent for the App view's own surface,
          // which is how the record tells a person's click from an agent's call.
          callerAgent: ctx.callerAgent,
        }),
      removeRepo: (ctx: AppActionContext, params: Record<string, unknown>) =>
        gitRemoveRepo({ ...wsOf(ctx), repo: str(params, 'repo') }),
    },
  },
}

# Git

Provides the **Git App**: add it to a space with a terminal source (Localhost / WSL / Server / Docker application instance) and a workspace folder, then clone repositories (working-tree or bare), manage worktrees, and review, commit and browse history in a full-page git client. A `Git` command mode opens the same client as an overlay anywhere.

## App parameters

- `terminal` — the terminal source the workspace lives on, as `node-id/handle-id` (picked with the host's TerminalSelector).
- `folder` — the folder on that terminal holding the git repositories.
- `integrationBranches` — per repository, the branch its work merges into (`repo=branch` entries separated by commas or newlines). Worktree audits skip repositories without one rather than guess.

## Handles

Each worktree is exposed as a dynamic `worktree-terminal-<repo>-<name>` terminal-context source on the App instance — addressable as `<instanceId>/<handleId>` wherever node targets are accepted (remote file tools, TerminalSelector, other Apps). The context is the instance's configured terminal rooted (`cwd`) at the worktree directory. Handles track live worktrees: one appears with its worktree and goes with it.

## App actions (agent-invokable)

Discover with `app_list` and run with `app_call`:

- `listRepos` — list repositories in the workspace folder, each with its branch status and worktrees.
- `listWorktrees` — full worktree audit built on `listRepos`' discovery: per worktree, after a full-refspec fetch, `lastCommit`, `dirtyFiles`, `upstream`/`ahead`/`behind`, and a state — live, merged, unpublished, dirty or foreign — with the reason for it. Repositories with no configured integration branch are reported as skipped. Optional `repo` to scope to one repository. Heavier than `listRepos` (it fetches) — use it for cleanup audits, not as routine inventory.
- `pruneWorktrees` — report which worktrees can be removed (gone from the remote AND merged into the configured integration branch), and remove them only when `apply` is exactly `true`.
- `cloneRepo` — clone a repository in **bare** mode (as `<repo>.git`) so worktrees can be attached. Params: `url`, optional `name`.
- `addWorktree` — add a worktree to a repository on a new branch named `<name>`. Checkout lands in `<base>.worktrees/<name>`. Params: `repo`, `name`, optional `base` (start point for the new branch; defaults to the repo's HEAD). The new worktree has no git identity: don't `git config user.*` there (a worktree of a shared bare clone shares its config with every other worktree of that repo, so this races). Commit with `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL`/`GIT_COMMITTER_NAME`/`GIT_COMMITTER_EMAIL` set on the `git commit` invocation itself instead.
- `removeWorktree` — remove a worktree and delete the branch it had checked out. Params: `repo`, `name`, `reason`, optional `force`. The removal is recorded, with who asked and why, as one line in `.worktree-removals.log` in the workspace folder.
- `removeRepo` — remove a cloned repository and any worktrees attached to it. Params: `repo`.

## Server actions

- `git.listRepos`, `git.listWorktrees`, `git.pruneWorktrees`, `git.clone`, `git.cloneBare`, `git.addWorktree`, `git.removeWorktree`, `git.removeRepo` — the App view's surface; each takes the workspace address as `target` + `folder`.
- `gitui.*` — backing actions for the git client.

All run over the configured terminal context, which may be local, WSL, SSH, or a `docker exec` into a running application instance.

## Layout

For a bare repo `<base>.git`, worktrees are checked out beside it under `<base>.worktrees/<name>`. `removeRepo` removes both.

## Dependencies

- `extensionDependencies: builtin.core` — for the shared `builtin.core.terminal-context` handle type.

## Note on worktree `cwd`

Each worktree handle carries the worktree path as a `cwd` on the exposed terminal context. Consumers that honor `cwd` (e.g. the git client, which is opened directly at the worktree path, and the remote file tools) operate in the worktree.

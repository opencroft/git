// How remote-tracking branches are read: the for-each-ref format and its
// parser, apart from reaching the repository, so they are checkable against a
// real git without a terminal behind them.

import type { GitRemote } from '../../src/git-client/lib/types'
import { SEP } from './field-separator.ts'

const PREFIX = 'refs/remotes/'

// The full ref name, not `%(refname:short)`: the short form turns into
// "remotes/<remote>/<branch>" when a local branch shares the name.
export const REMOTE_REF_FORMAT = ['%(refname)', '%(objectname)'].join(SEP)

/** The configured remotes by name, each with its URL, from `git remote -v`. */
export function parseRemoteList(raw: string): Map<string, string> {
  const urls = new Map<string, string>()
  for (const line of raw.split('\n')) {
    const [name, rest] = line.split('\t')
    if (name && rest) {
      urls.set(name, rest.replace(/ \((fetch|push)\)$/, ''))
    }
  }
  return urls
}

/**
 * The configured remote a "<remote>/<branch>" name belongs to, or undefined
 * when none does. Remote and branch names may both hold slashes, so the name
 * can't be split at a slash; it goes to the longest remote name it starts
 * with, which also settles "team" against "team/fork".
 */
export function remoteOf(name: string, remoteNames: Iterable<string>): string | undefined {
  let found: string | undefined
  for (const remote of remoteNames) {
    if (name.startsWith(`${remote}/`) && remote.length > (found?.length ?? 0)) {
      found = remote
    }
  }
  return found
}

/**
 * The remote-tracking branches from `for-each-ref refs/remotes` in
 * REMOTE_REF_FORMAT, grouped under their remotes. Each branch keeps its
 * "<remote>/<branch>" name. A ref left behind by a remote that is no longer
 * configured is grouped under its first segment, with no URL, so it still
 * shows.
 */
export function parseRemotes(raw: string, urls: Map<string, string>): GitRemote[] {
  const byName = new Map<string, GitRemote>()
  for (const line of raw.split('\n')) {
    const [ref, tipHash] = line.split(SEP)
    if (!ref?.startsWith(PREFIX) || ref.endsWith('/HEAD')) {
      continue
    }
    const name = ref.slice(PREFIX.length)
    const remote = remoteOf(name, urls.keys()) ?? name.split('/')[0]
    let entry = byName.get(remote)
    if (!entry) {
      entry = { name: remote, url: urls.get(remote) ?? '', branches: [] }
      byName.set(remote, entry)
    }
    entry.branches.push({ name, isHead: false, tipHash })
  }
  return [...byName.values()]
}

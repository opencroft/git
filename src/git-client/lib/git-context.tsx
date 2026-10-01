import { createContext, useContext, useMemo } from 'react'
import type { GitBranch, GitData, GitRemote, GitStash, GitSubmodule, GitTag } from './types'

interface GitContextValue {
  workspace: string
  data: GitData
  refresh: () => Promise<void>
  activeBranch: GitBranch | undefined
  branches: GitBranch[]
  remotes: GitRemote[]
  tags: GitTag[]
  stashes: GitStash[]
  submodules: GitSubmodule[]
}

const GitContext = createContext<GitContextValue | null>(null)

export function GitProvider(props: { workspace: string; data: GitData; refresh: () => Promise<void>; children: React.ReactNode }) {
  const { workspace, data, refresh, children } = props

  const value = useMemo<GitContextValue>(
    () => ({
      workspace,
      data,
      refresh,
      activeBranch: data.branches.find((b) => b.isHead),
      branches: data.branches,
      remotes: data.remotes,
      tags: data.tags,
      stashes: data.stashes,
      submodules: data.submodules,
    }),
    [workspace, data, refresh],
  )

  return <GitContext.Provider value={value}>{children}</GitContext.Provider>
}

export function useGit(): GitContextValue {
  const value = useContext(GitContext)
  if (!value) {
    throw new Error('useGit must be used within a <GitProvider>')
  }
  return value
}

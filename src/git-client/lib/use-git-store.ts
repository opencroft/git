import { useMemo, useState } from 'react'
import { computeAllGraphData } from './graph-utils'
import type { ChangesView, GitData, SidebarView, VisibilityMode } from './types'

export interface GitStoreInitial {
  filePath?: string
  fileStaged?: boolean
}

export function useGitStore(data: GitData, initial?: GitStoreInitial) {
  const [sidebarView, setSidebarView] = useState<SidebarView>(initial?.filePath ? 'changes' : 'commits')
  const [changesView, setChangesView] = useState<ChangesView>('tree')
  const [filterText, setFilterText] = useState('')
  const [changesFilterText, setChangesFilterText] = useState('')
  const [selectedHash, setSelectedHash] = useState<string>()
  const [visibilityMap, setVisibilityMap] = useState<Map<string, VisibilityMode>>(new Map())
  const [selectedFilePath, setSelectedFilePath] = useState<string | undefined>(initial?.filePath)
  const [selectedFileStaged, setSelectedFileStaged] = useState(initial?.fileStaged ?? false)
  // Set when the selected file came from a specific commit's change list (Graph
  // view), so the panel shows that commit's diff read-only instead of the
  // working-tree/staged one.
  const [selectedCommitHash, setSelectedCommitHash] = useState<string>()

  const { branches, remotes, tags, stashes, submodules, commits } = data
  const { changedFiles, stagedFiles, files } = data

  const activeBranch = useMemo(() => branches.find((b) => b.isHead), [branches])

  const selectedFileHasChanges = useMemo(() => {
    if (!selectedFilePath) {
      return false
    }
    return changedFiles.some((f) => f.path === selectedFilePath) || stagedFiles.some((f) => f.path === selectedFilePath)
  }, [selectedFilePath, changedFiles, stagedFiles])

  const headReachable = useMemo(() => {
    const byHash = new Map(commits.map((c) => [c.hash, c]))
    if (!activeBranch) {
      return new Set(byHash.keys())
    }
    const set = new Set<string>()
    const stack = [activeBranch.tipHash]
    while (stack.length > 0) {
      const hash = stack.pop()
      if (!hash || set.has(hash)) {
        continue
      }
      const commit = byHash.get(hash)
      if (!commit) {
        continue
      }
      set.add(hash)
      stack.push(...commit.parents)
    }
    return set
  }, [commits, activeBranch])

  const setMode = (branchName: string, target: VisibilityMode) => {
    setVisibilityMap((prev) => {
      const next = new Map(prev)
      const current = next.get(branchName) ?? 'default'
      const mode = current === target ? 'default' : target
      if (mode === 'default') {
        next.delete(branchName)
      } else {
        next.set(branchName, mode)
      }
      return next
    })
  }

  // Toggle a whole folder of refs at once: if every ref already has the target
  // mode, clear them all (back to default); otherwise set them all.
  const setNamesMode = (names: string[], target: VisibilityMode) => {
    if (names.length === 0) {
      return
    }
    setVisibilityMap((prev) => {
      const next = new Map(prev)
      const allSet = names.every((n) => next.get(n) === target)
      for (const n of names) {
        if (allSet) {
          next.delete(n)
        } else {
          next.set(n, target)
        }
      }
      return next
    })
  }

  const toggleWhitelist = (branchName: string) => setMode(branchName, 'shown')
  const toggleBlacklist = (branchName: string) => setMode(branchName, 'hidden')
  const toggleFolderWhitelist = (names: string[]) => setNamesMode(names, 'shown')
  const toggleFolderBlacklist = (names: string[]) => setNamesMode(names, 'hidden')

  const visibleCommits = useMemo(() => {
    const shown = [...visibilityMap.entries()].filter(([, m]) => m === 'shown')
    const hidden = [...visibilityMap.entries()].filter(([, m]) => m === 'hidden')
    const refsOf = (c: (typeof commits)[number]) => [...c.branchNames, ...c.remoteBranches]

    if (shown.length > 0) {
      const shownNames = new Set(shown.map(([n]) => n))
      return commits.filter((c) => {
        const refs = refsOf(c)
        if (refs.some((bn) => shownNames.has(bn))) {
          return true
        }
        return refs.length === 0
      })
    }

    if (hidden.length > 0) {
      const hiddenNames = new Set(hidden.map(([n]) => n))
      return commits.filter((c) => {
        const refs = refsOf(c)
        return !(refs.length > 0 && refs.every((bn) => hiddenNames.has(bn)))
      })
    }

    return commits
  }, [visibilityMap, commits])

  const selectedCommit = useMemo(() => visibleCommits.find((c) => c.hash === selectedHash), [visibleCommits, selectedHash])

  const graphData = useMemo(() => computeAllGraphData(visibleCommits), [visibleCommits])

  const filteredBranches = useMemo(() => (filterText ? branches.filter((b) => b.name.toLowerCase().includes(filterText.toLowerCase())) : branches), [filterText, branches])

  const filteredRemotes = useMemo(() => {
    if (!filterText) {
      return remotes
    }
    const q = filterText.toLowerCase()
    return remotes
      .map((r) => ({
        ...r,
        branches: r.branches.filter((b) => b.name.toLowerCase().includes(q)),
      }))
      .filter((r) => r.branches.length > 0)
  }, [filterText, remotes])

  const filteredTags = useMemo(() => (filterText ? tags.filter((t) => t.name.toLowerCase().includes(filterText.toLowerCase())) : tags), [filterText, tags])

  const filteredStashes = useMemo(() => (filterText ? stashes.filter((s) => s.message.toLowerCase().includes(filterText.toLowerCase())) : stashes), [filterText, stashes])

  const filteredSubmodules = useMemo(() => (filterText ? submodules.filter((s) => s.name.toLowerCase().includes(filterText.toLowerCase())) : submodules), [filterText, submodules])

  return {
    branches,
    remotes,
    tags,
    stashes,
    submodules,
    commits,
    changedFiles,
    stagedFiles,
    files,
    activeBranch,
    visibleCommits,
    graphData,
    headReachable,

    filteredBranches,
    filteredRemotes,
    filteredTags,
    filteredStashes,
    filteredSubmodules,

    sidebarView,
    setSidebarView,
    changesView,
    setChangesView,
    filterText,
    setFilterText,
    changesFilterText,
    setChangesFilterText,
    visibilityMap,
    toggleWhitelist,
    toggleBlacklist,
    toggleFolderWhitelist,
    toggleFolderBlacklist,
    selectedHash,
    selectedCommit,
    selectCommit: setSelectedHash,
    selectedFilePath,
    selectFile: (path: string, staged?: boolean, commitHash?: string) => {
      setSelectedFilePath(path)
      setSelectedFileStaged(!!staged)
      setSelectedCommitHash(commitHash)
    },
    selectedFileStaged,
    selectedFileHasChanges,
    selectedCommitHash,
  }
}

export type GitStore = ReturnType<typeof useGitStore>

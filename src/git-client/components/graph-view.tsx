import { ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { useGit } from '../lib/git-context'
import { getCommitChanges } from '../lib/git-data'
import { computeAllGraphData } from '../lib/graph-utils'
import type { CommitGraphData, FileChange, GitCommit } from '../lib/types'
import { ScrollArea } from '../ui'
import { CommitGraph, ROW_HEIGHT } from './commit-graph'
import { CommitContextMenu } from './commit-row'
import { FileEntry } from './file-entry'

interface GraphViewProps {
  /** Full commit list (not filtered by the All Commits tab's branch/tag visibility toggles). */
  commits: GitCommit[]
  headReachable: Set<string>
  headHash: string | undefined
  changedFiles: FileChange[]
  stagedFiles: FileChange[]
  onFileSelect?: (path: string, staged?: boolean, commitHash?: string) => void
}

const UNCOMMITTED_HASH = '__uncommitted__'
const GRAY = 'var(--muted-foreground)'

export function GraphView({ commits, headReachable, headHash, changedFiles, stagedFiles, onFileSelect }: GraphViewProps) {
  const { workspace } = useGit()

  // Current checkout only — not the All Commits tab's full multi-branch history.
  const currentBranchCommits = useMemo(() => commits.filter((c) => headReachable.has(c.hash)), [commits, headReachable])

  // Unstaged overwrites staged for a path that's partially staged, matching the
  // workspace tree's convention (buildTree's changes map is built the same way).
  const uncommittedFiles = useMemo(() => {
    const map = new Map<string, { file: FileChange; staged: boolean }>()
    for (const f of stagedFiles) {
      map.set(f.path, { file: f, staged: true })
    }
    for (const f of changedFiles) {
      map.set(f.path, { file: f, staged: false })
    }
    return [...map.values()]
  }, [changedFiles, stagedFiles])
  const hasUncommitted = uncommittedFiles.length > 0

  // A synthetic commit, parented on HEAD, so it renders as a real (grayed-out)
  // node at the top of the same graph — sharing CommitGraph/computeAllGraphData
  // instead of a one-off row style.
  const displayCommits = useMemo((): GitCommit[] => {
    if (!hasUncommitted) {
      return currentBranchCommits
    }
    const uncommittedCommit: GitCommit = {
      hash: UNCOMMITTED_HASH,
      shortHash: '',
      message: 'Uncommitted Changes',
      author: '',
      date: '',
      parents: headHash ? [headHash] : [],
      branchNames: [],
      remoteBranches: [],
    }
    return [uncommittedCommit, ...currentBranchCommits]
  }, [hasUncommitted, currentBranchCommits, headHash])

  // Gray out the synthetic node and the one real segment-half that connects to
  // it, so the line reads as a single muted stroke rather than switching color
  // partway down.
  const graphData = useMemo(() => {
    const map = computeAllGraphData(displayCommits)
    const synthetic = map.get(UNCOMMITTED_HASH)
    if (!synthetic) {
      return map
    }
    const grayOut = (gd: CommitGraphData, onlyLane?: number): CommitGraphData => ({
      ...gd,
      dotColor: onlyLane === undefined ? GRAY : gd.dotColor,
      segments: gd.segments.map((s) =>
        onlyLane === undefined || (s.topLane === onlyLane && s.bottomLane === onlyLane && s.top === 0 && s.bottom === 0.5) ? { ...s, color: GRAY } : s,
      ),
    })
    map.set(UNCOMMITTED_HASH, grayOut(synthetic))
    const next = displayCommits[1]
    const nextData = next && map.get(next.hash)
    if (nextData) {
      map.set(next.hash, grayOut(nextData, synthetic.dotLane))
    }
    return map
  }, [displayCommits])

  const [expandedHash, setExpandedHash] = useState<string | null>(UNCOMMITTED_HASH)
  const [commitFiles, setCommitFiles] = useState<Record<string, FileChange[]>>({})
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  useEffect(() => {
    if (!expandedHash || expandedHash === UNCOMMITTED_HASH || commitFiles[expandedHash]) {
      return
    }
    let active = true
    getCommitChanges({ data: { hash: expandedHash, workspace } }).then((files) => {
      if (active) {
        setCommitFiles((prev) => ({ ...prev, [expandedHash]: files }))
      }
    })
    return () => {
      active = false
    }
  }, [expandedHash, workspace, commitFiles])

  const toggleExpand = (hash: string) => {
    setExpandedHash((prev) => (prev === hash ? null : hash))
  }

  const selectCommitFile = (hash: string, path: string, staged = false) => {
    setSelectedKey(`${hash}:${path}`)
    onFileSelect?.(path, staged, hash === UNCOMMITTED_HASH ? undefined : hash)
  }

  return (
    <ScrollArea className='h-full' innerClassName='block min-w-0!'>
      <div className='p-1'>
        {displayCommits.map((commit) => {
          const gd = graphData.get(commit.hash)
          if (!gd) {
            return null
          }
          const isUncommitted = commit.hash === UNCOMMITTED_HASH
          const expanded = expandedHash === commit.hash
          const files = isUncommitted ? uncommittedFiles.map((u) => u.file) : commitFiles[commit.hash]
          const row = (
            // biome-ignore lint/a11y/useSemanticElements: clickable commit row, not a button element
            <div
              className={`flex items-center gap-1 cursor-pointer rounded-md ${expanded ? 'bg-secondary' : 'hover:bg-secondary'}`}
              style={{ height: ROW_HEIGHT }}
              onClick={() => toggleExpand(commit.hash)}
              onKeyDown={(e) => e.key === 'Enter' && toggleExpand(commit.hash)}
              role='button'
              tabIndex={0}
            >
              <ChevronRight className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
              <CommitGraph data={gd} />
              <span className={`truncate text-xs flex-1 ${isUncommitted ? 'italic text-muted-foreground' : commit.hash === headHash ? 'font-semibold' : ''}`}>
                {commit.message}
              </span>
            </div>
          )
          return (
            <div key={commit.hash}>
              {isUncommitted ? row : <CommitContextMenu commit={commit}>{row}</CommitContextMenu>}
              {expanded && (
                <div className='pl-4'>
                  {files === undefined ? (
                    <p className='px-2 py-1 text-[11px] text-muted-foreground'>Loading...</p>
                  ) : files.length === 0 ? (
                    <p className='px-2 py-1 text-[11px] text-muted-foreground'>No file changes</p>
                  ) : isUncommitted ? (
                    uncommittedFiles.map(({ file, staged }) => (
                      <FileEntry
                        key={file.path}
                        file={file}
                        flat
                        staged={staged}
                        selected={selectedKey === `${commit.hash}:${file.path}`}
                        onSelect={() => selectCommitFile(commit.hash, file.path, staged)}
                      />
                    ))
                  ) : (
                    files.map((file) => (
                      <FileEntry
                        key={file.path}
                        file={file}
                        flat
                        selected={selectedKey === `${commit.hash}:${file.path}`}
                        onSelect={() => selectCommitFile(commit.hash, file.path)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}

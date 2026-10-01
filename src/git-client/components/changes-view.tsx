import { File, Folders, FolderTree, GitBranch, List } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'

import { applyPatchFile, discardAll } from '../lib/actions/changes'
import { allFolderPaths, buildTree, dedupePaths, flattenVisible, rowRounding } from '../lib/file-tree'
import { useGit } from '../lib/git-context'
import { stageFiles, unstageFiles } from '../lib/git-data'
import type { FileChange, GitCommit, SelectModifiers, ChangesView as ViewMode } from '../lib/types'
import { useGitAction } from '../lib/use-git-action'
import { Button, ResizableHandle, ResizablePanel, ResizablePanelGroup, ScrollArea } from '../ui'
import { ChangeTree } from './change-tree'
import { FileEntry } from './file-entry'
import { useGitDialogs } from './git-dialogs'
import { GraphView } from './graph-view'

type SectionId = 'changes' | 'staged'

const EMPTY: Set<string> = new Set()

interface ChangesViewProps {
  changedFiles: FileChange[]
  stagedFiles: FileChange[]
  files: string[]
  commits: GitCommit[]
  headReachable: Set<string>
  headHash?: string
  view: ViewMode
  onViewChange: (view: ViewMode) => void
  onFileSelect?: (path: string, staged?: boolean, commitHash?: string) => void
  filterText?: string
}

const VIEWS = [
  { id: 'graph', icon: GitBranch, label: 'Graph' },
  { id: 'workspace', icon: Folders, label: 'Workspace' },
  { id: 'tree', icon: FolderTree, label: 'Tree' },
  { id: 'path', icon: List, label: 'Path' },
  { id: 'file', icon: File, label: 'File' },
] as const

function basename(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

function Section({
  title,
  count,
  action,
  children,
}: {
  title: string
  count: number
  action: ReactNode
  children: ReactNode
}) {
  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div className='flex shrink-0 items-center justify-between gap-2 px-2 pt-1 pb-0.5'>
        <p className='truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground'>
          {title} ({count})
        </p>
        {action}
      </div>
      <ScrollArea className='flex-1 min-h-0' innerClassName='block min-w-0!'>
        <div className='p-1 min-w-0'>{children}</div>
      </ScrollArea>
    </div>
  )
}

export function ChangesView({
  changedFiles: allChangedFiles,
  stagedFiles: allStagedFiles,
  files: allFiles,
  commits,
  headReachable,
  headHash,
  view,
  onViewChange,
  onFileSelect,
  filterText = '',
}: ChangesViewProps) {
  const { workspace, refresh } = useGit()
  const { run, error } = useGitAction()
  const { confirm, prompt } = useGitDialogs()

  // Space-separated words, all of which must appear (in any order) in a path for it to match.
  const words = useMemo(() => filterText.trim().toLowerCase().split(/\s+/).filter(Boolean), [filterText])
  const matchesFilter = (path: string): boolean => {
    if (words.length === 0) {
      return true
    }
    const lower = path.toLowerCase()
    return words.every((w) => lower.includes(w))
  }
  const changedFiles = useMemo(() => (words.length ? allChangedFiles.filter((f) => matchesFilter(f.path)) : allChangedFiles), [allChangedFiles, words])
  const stagedFiles = useMemo(() => (words.length ? allStagedFiles.filter((f) => matchesFilter(f.path)) : allStagedFiles), [allStagedFiles, words])
  const files = useMemo(() => (words.length ? allFiles.filter((p) => matchesFilter(p)) : allFiles), [allFiles, words])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [section, setSection] = useState<SectionId>('changes')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [workspaceSelected, setWorkspaceSelected] = useState<string | null>(null)
  // Folders default to collapsed in the workspace tree (it lists the whole repo, not
  // just changes), so track exceptions the user explicitly opened instead.
  const [workspaceExpanded, setWorkspaceExpanded] = useState<Set<string>>(new Set())

  const toggleCollapse = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const select = (sec: SectionId, path: string, order: string[], m: SelectModifiers) => {
    onFileSelect?.(path, sec === 'staged')
    if (sec !== section) {
      setSection(sec)
      setSelected(new Set([path]))
      setAnchor(path)
      return
    }
    if (m.shift && anchor && order.includes(anchor)) {
      const a = order.indexOf(anchor)
      const b = order.indexOf(path)
      const [lo, hi] = a < b ? [a, b] : [b, a]
      setSelected(new Set(order.slice(lo, hi + 1)))
      return
    }
    if (m.ctrl) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(path)) {
          next.delete(path)
        } else {
          next.add(path)
        }
        return next
      })
      setAnchor(path)
      return
    }
    setSelected(new Set([path]))
    setAnchor(path)
  }

  const stage = async (paths: string[]) => {
    const resolved = dedupePaths(paths)
    if (resolved.length === 0) {
      return
    }
    await stageFiles({ data: { paths: resolved, workspace } })
    setSelected(new Set())
    await refresh()
  }
  const unstage = async (paths: string[]) => {
    const resolved = dedupePaths(paths)
    if (resolved.length === 0) {
      return
    }
    await unstageFiles({ data: { paths: resolved, workspace } })
    setSelected(new Set())
    await refresh()
  }
  const activate = (sec: SectionId, path: string) => {
    if (sec === 'changes') {
      stage([path])
    } else {
      unstage([path])
    }
  }

  // A context action on a row that is part of the current selection acts on the
  // whole selection; otherwise just that one path.
  const actionPathsFor = (sec: SectionId, path: string): string[] => {
    if (sec === section && selected.size > 0 && selected.has(path)) {
      return [...selected]
    }
    return [path]
  }

  const discardEverything = async () => {
    const ok = await confirm({
      title: 'Discard all changes?',
      description:
        'All tracked working-tree changes will be reverted and untracked files removed. This cannot be undone.',
      confirmLabel: 'Discard all',
      danger: true,
    })
    if (ok) {
      await run(discardAll)
    }
  }

  const applyPatch = async () => {
    const p = await prompt({
      title: 'Paste patch text',
      multiline: true,
      required: true,
    })
    if (p) {
      await run(applyPatchFile, { patch: p })
    }
  }

  const workspaceTree = useMemo(() => {
    const map = new Map([...stagedFiles, ...changedFiles].map((f) => [f.path, f]))
    return buildTree(files, map)
  }, [files, stagedFiles, changedFiles])
  const workspaceFileSet = useMemo(() => new Set(files), [files])
  // While filtering, expand everything so matches aren't hidden inside a collapsed folder.
  const workspaceCollapsed = useMemo(
    () => (words.length > 0 ? EMPTY : new Set(allFolderPaths(workspaceTree).filter((path) => !workspaceExpanded.has(path)))),
    [workspaceTree, workspaceExpanded, words],
  )
  const workspaceOrder = useMemo(() => flattenVisible(workspaceTree, workspaceCollapsed), [workspaceTree, workspaceCollapsed])
  const workspaceSelectedSet = workspaceSelected ? new Set([workspaceSelected]) : EMPTY

  const toggleWorkspaceCollapse = (path: string) => {
    setWorkspaceExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  // Folder rows also route through here; ignore them so only files load content.
  const selectWorkspaceFile = (path: string) => {
    if (!workspaceFileSet.has(path)) {
      return
    }
    setWorkspaceSelected(path)
    onFileSelect?.(path, false)
  }

  const renderFiles = (list: FileChange[], sec: SectionId) => {
    const sel = section === sec ? selected : EMPTY
    const staged = sec === 'staged'
    const allPaths = list.map((f) => f.path)
    if (view === 'tree') {
      const map = new Map(list.map((f) => [f.path, f]))
      const nodes = buildTree(
        list.map((f) => f.path),
        map,
      )
      // While filtering, expand everything so matches aren't hidden inside a collapsed folder.
      const effectiveCollapsed = words.length > 0 ? EMPTY : collapsed
      const order = flattenVisible(nodes, effectiveCollapsed)
      return (
        <ChangeTree
          nodes={nodes}
          collapsed={effectiveCollapsed}
          selected={sel}
          roundingFor={(path) => rowRounding(order, sel, path)}
          onToggle={toggleCollapse}
          onSelect={(path, m) => select(sec, path, order, m)}
          onActivate={(path) => activate(sec, path)}
          staged={staged}
          actionPathsFor={(path) => actionPathsFor(sec, path)}
          allPaths={allPaths}
        />
      )
    }
    return list.map((f) => (
      <FileEntry
        key={f.path}
        file={f}
        label={view === 'file' ? basename(f.path) : undefined}
        selected={sel.has(f.path)}
        rounding={rowRounding(allPaths, sel, f.path)}
        flat
        onSelect={(m) => select(sec, f.path, allPaths, m)}
        onActivate={() => activate(sec, f.path)}
        staged={staged}
        actionPaths={actionPathsFor(sec, f.path)}
        allPaths={allPaths}
      />
    ))
  }

  const changesToStage = section === 'changes' && selected.size > 0 ? [...selected] : changedFiles.map((f) => f.path)
  const stagedToUnstage = section === 'staged' && selected.size > 0 ? [...selected] : stagedFiles.map((f) => f.path)

  const changes = (
    <Section
      title='Changes'
      count={changedFiles.length}
      action={
        <div className='flex items-center gap-1'>
          <Button variant='ghost' size='sm' className='h-5 px-2 text-[10px]' onClick={applyPatch}>
            Apply patch...
          </Button>
          <Button
            variant='ghost'
            size='sm'
            className='h-5 px-2 text-[10px] text-destructive hover:text-destructive'
            disabled={changedFiles.length === 0}
            onClick={discardEverything}
          >
            Discard all...
          </Button>
          <Button
            variant='secondary'
            size='sm'
            className='h-5 px-2 text-[10px]'
            disabled={changedFiles.length === 0}
            onClick={() => stage(changesToStage)}
          >
            Stage
          </Button>
        </div>
      }
    >
      {renderFiles(changedFiles, 'changes')}
    </Section>
  )

  return (
    <div className='flex flex-1 min-h-0 flex-col'>
      <div className='flex items-center gap-0.5 border-b px-1 py-1 shrink-0'>
        {VIEWS.map((v) => (
          <Button
            key={v.id}
            variant={view === v.id ? 'secondary' : 'ghost'}
            size='icon-xs'
            title={v.label}
            onClick={() => onViewChange(v.id)}
          >
            <v.icon className='size-4' />
          </Button>
        ))}
      </div>
      {error && (
        <div className='mx-1 mt-1 px-2 py-1 text-[11px] text-destructive bg-destructive/10 rounded shrink-0'>
          {error}
        </div>
      )}
      <div className='flex-1 min-h-0'>
        {view === 'graph' ? (
          <GraphView
            commits={commits}
            headReachable={headReachable}
            headHash={headHash}
            changedFiles={changedFiles}
            stagedFiles={stagedFiles}
            onFileSelect={onFileSelect}
          />
        ) : view === 'workspace' ? (
          <ScrollArea className='h-full' innerClassName='block min-w-0!'>
            <div className='p-1 min-w-0'>
              <ChangeTree
                nodes={workspaceTree}
                collapsed={workspaceCollapsed}
                selected={workspaceSelectedSet}
                roundingFor={(path) => rowRounding(workspaceOrder, workspaceSelectedSet, path)}
                onToggle={toggleWorkspaceCollapse}
                onSelect={(path) => selectWorkspaceFile(path)}
              />
            </div>
          </ScrollArea>
        ) : stagedFiles.length > 0 ? (
          <ResizablePanelGroup orientation='vertical'>
            <ResizablePanel defaultSize='60%'>{changes}</ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize='40%'>
              <Section
                title='Staged'
                count={stagedFiles.length}
                action={
                  <Button
                    variant='secondary'
                    size='sm'
                    className='h-5 px-2 text-[10px]'
                    disabled={stagedFiles.length === 0}
                    onClick={() => unstage(stagedToUnstage)}
                  >
                    Unstage
                  </Button>
                }
              >
                {renderFiles(stagedFiles, 'staged')}
              </Section>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          changes
        )}
      </div>
    </div>
  )
}

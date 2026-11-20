import { usePublishSelection } from '@opencroft/client/chat'
import { useCallback, useEffect, useState } from 'react'

import { BranchHeader } from './components/branch-header'
import { ClientToolbar } from './components/client-toolbar'
import { CommitDetails } from './components/commit-details'
import { CommitPanel } from './components/commit-panel'
import { CommitTable } from './components/commit-table'
import { GitDialogProvider } from './components/git-dialogs'
import { GitSidebar } from './components/git-sidebar'
import type { TerminalFolder } from './components/terminal-folder-dialog'
import { type CodeSelection, CodeSelectionProvider } from './lib/code-selection'
import { GitProvider } from './lib/git-context'
import { getGitData, trustRepo } from './lib/git-data'
import { setRepoContext } from './lib/rpc'
import { gitSelection } from './lib/selection'
import type { GitData } from './lib/types'
import { useGitStore } from './lib/use-git-store'
import { Button, ResizableHandle, ResizablePanel, ResizablePanelGroup, TooltipProvider } from './ui'

const DUBIOUS_OWNERSHIP = /dubious ownership in repository at '([^']+)'/

/** Where a load of the repository read from, kept with what it read. */
interface LoadedPlace {
  folder: string
  target: string
}

function GitClientBody({
  place,
  data,
  refresh,
  initialFilePath,
  initialFileStaged,
  initialFileLine,
  onFileChange,
}: {
  place: LoadedPlace
  data: GitData
  refresh: () => Promise<void>
  initialFilePath?: string
  initialFileStaged?: boolean
  initialFileLine?: number
  onFileChange?: (path: string | undefined) => void
}) {
  const workspace = place.folder
  const store = useGitStore(data, { filePath: initialFilePath, fileStaged: initialFileStaged })

  useEffect(() => {
    onFileChange?.(store.selectedFilePath)
  }, [store.selectedFilePath, onFileChange])

  // The lines the reader has highlighted in the editor. Dropped when what is
  // open changes -- lines from a file you have left are not context for the
  // one you are looking at -- but NOT when the highlight itself collapses,
  // which is what clicking into the composer does.
  const [code, setCode] = useState<CodeSelection | null>(null)
  const openKey = store.open ? JSON.stringify(store.open) : ''
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when what is open changes, which is the point; it reads nothing of it
  useEffect(() => {
    setCode(null)
  }, [openKey])

  // A checkout reached through its own worktree handle, with no folder, is
  // the terminal's working directory: its paths stay relative to it. Opened
  // as a folder, the repository's root is where its paths start.
  usePublishSelection(
    gitSelection({ terminal: place.target, root: place.folder ? data.root : undefined }, store.open, code),
  )

  return (
    // Lets the editor several levels down report a highlight without every
    // component in between carrying a prop for it.
    <CodeSelectionProvider onSelection={setCode}>
      <TooltipProvider>
        <GitProvider workspace={workspace} data={data} refresh={refresh}>
          <GitDialogProvider>
            <ResizablePanelGroup orientation='horizontal'>
              <ResizablePanel defaultSize='20%' minSize='12%' maxSize='50%'>
                <GitSidebar {...store} />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize='80%'>
                {store.sidebarView === 'changes' ? (
                  <CommitPanel
                    hasStaged={store.stagedFiles.length > 0}
                    selectedFilePath={store.selectedFilePath}
                    selectedFileStaged={store.selectedFileStaged}
                    selectedFileHasChanges={store.selectedFileHasChanges}
                    selectedCommitHash={store.selectedCommitHash}
                    selectedFileLine={initialFileLine}
                  />
                ) : (
                  <ResizablePanelGroup orientation='vertical'>
                    <ResizablePanel defaultSize='65%'>
                      <div className='flex h-full min-w-0 flex-col overflow-hidden'>
                        <BranchHeader activeBranch={store.activeBranch} commitCount={store.visibleCommits.length} />
                        <CommitTable
                          commits={store.visibleCommits}
                          graphData={store.graphData}
                          headHash={store.activeBranch?.tipHash}
                          headReachable={store.headReachable}
                          selectedHash={store.selectedHash}
                          onSelect={store.selectCommit}
                        />
                      </div>
                    </ResizablePanel>
                    <ResizableHandle withHandle />
                    <ResizablePanel defaultSize='35%'>
                      <CommitDetails
                        commit={store.selectedCommit}
                        selectedPath={store.selectedCommitFilePath}
                        onSelectPath={store.selectCommitFile}
                      />
                    </ResizablePanel>
                  </ResizablePanelGroup>
                )}
              </ResizablePanel>
            </ResizablePanelGroup>
          </GitDialogProvider>
        </GitProvider>
      </TooltipProvider>
    </CodeSelectionProvider>
  )
}

function RepoErrorPanel({
  error,
  target,
  onTrusted,
}: {
  error: string
  target: string
  onTrusted: () => Promise<void>
}) {
  const [trusting, setTrusting] = useState(false)
  const dubious = error.match(DUBIOUS_OWNERSHIP)

  const trust = async () => {
    if (!dubious) {
      return
    }
    setTrusting(true)
    try {
      await trustRepo({ data: { path: dubious[1], target: target || undefined } })
      await onTrusted()
    } finally {
      setTrusting(false)
    }
  }

  if (dubious) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-3 p-4 text-center'>
        <p className='text-sm font-medium'>Repository not trusted</p>
        <p className='max-w-md text-xs text-muted-foreground'>
          Git won't operate on "{dubious[1]}" because it's owned by a different user than the one running this command.
          Trust it to let this workspace read and write it — only do this if you trust its contents.
        </p>
        <Button size='sm' onClick={trust} disabled={trusting}>
          {trusting ? 'Trusting...' : 'Trust repository'}
        </Button>
      </div>
    )
  }

  return <div className='flex h-full items-center justify-center p-4 text-center text-xs text-destructive'>{error}</div>
}

interface GitClientProps {
  /**
   * Where the client is pointed. CONTROLLED, both of them: the client is
   * free-standing -- any terminal, any path -- so where it currently is has to
   * be somewhere that outlives it, which is the caller's business rather than
   * this component's. Holding them there is what puts the pair in the URL and
   * in the caller's own memory of the last place.
   *
   * Do not keep local copies seeded from these: an effect that re-seeds on a
   * folder change overwrites the terminal with the one the caller passed, and
   * changing the folder snaps the terminal back.
   */
  folder: string
  target: string
  /** A terminal and folder were picked together, in the toolbar's dialog. */
  onPlaceChange: (place: TerminalFolder) => void
  /** Back to the workspace's repositories and worktrees. */
  onBookmarks: () => void
  initialFilePath?: string
  initialFileStaged?: boolean
  initialFileLine?: number
  onFileChange?: (path: string | undefined) => void
}

export function GitClient({
  folder,
  target,
  onPlaceChange,
  onBookmarks,
  initialFilePath,
  initialFileStaged,
  initialFileLine,
  onFileChange,
}: GitClientProps) {
  // What was read, with where it was read from: while another place loads,
  // the last load stays on screen, and it must keep naming its own place.
  const [loaded, setLoaded] = useState<{ data: GitData; place: LoadedPlace } | null>(null)
  const data = loaded?.data ?? null
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setRepoContext({ workspace: folder || undefined, target: target || undefined })
  }, [folder, target])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const next = await getGitData({
        data: folder || target ? { workspace: folder || undefined, target: target || undefined } : undefined,
      })
      setLoaded({ data: next, place: { folder, target } })
    } finally {
      setLoading(false)
    }
  }, [folder, target])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <div className='flex h-full w-full flex-col overflow-hidden'>
      <ClientToolbar
        folder={folder}
        target={target}
        data={data}
        loading={loading}
        refresh={refresh}
        onPlaceChange={onPlaceChange}
        onBookmarks={onBookmarks}
      />
      <div className='min-h-0 flex-1'>
        {data?.error ? (
          <RepoErrorPanel error={data.error} target={target} onTrusted={refresh} />
        ) : loaded ? (
          // A new place starts a new body: what was open in the last one --
          // its file, commit and highlight -- names nothing in this one.
          <GitClientBody
            key={JSON.stringify(loaded.place)}
            place={loaded.place}
            data={loaded.data}
            refresh={refresh}
            initialFilePath={initialFilePath}
            initialFileStaged={initialFileStaged}
            initialFileLine={initialFileLine}
            onFileChange={onFileChange}
          />
        ) : (
          <div className='flex h-full items-center justify-center text-xs text-muted-foreground'>
            Loading repository...
          </div>
        )}
      </div>
    </div>
  )
}

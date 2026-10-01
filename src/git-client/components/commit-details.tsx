import { useCallback, useEffect, useState } from 'react'

import { useGit } from '../lib/git-context'
import { getCommitChanges, getCommitFileDiff, getCommitMessage } from '../lib/git-data'
import type { FileChange, GitCommit } from '../lib/types'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup, ScrollArea } from '../ui'
import { CommitContextMenu } from './commit-row'
import { FileDiffViewer } from './file-diff-viewer'
import { FileEntry } from './file-entry'

interface CommitDetailsProps {
  commit: GitCommit | undefined
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function CommitDetails({ commit }: CommitDetailsProps) {
  const { workspace } = useGit()
  const [changes, setChanges] = useState<FileChange[]>([])
  const [body, setBody] = useState('')
  const [selectedPath, setSelectedPath] = useState<string>()
  const hash = commit?.hash

  useEffect(() => {
    if (!hash) {
      setChanges([])
      setBody('')
      return
    }
    let active = true
    getCommitChanges({ data: { hash, workspace } }).then((data) => {
      if (active) {
        setChanges(data)
      }
    })
    getCommitMessage({ data: { hash, workspace } }).then((data) => {
      if (active) {
        setBody(data.body.trim())
      }
    })
    return () => {
      active = false
    }
  }, [hash, workspace])

  // Reset file selection when commit changes
  useEffect(() => {
    setSelectedPath(undefined)
  }, [hash])

  const diffFetcher = useCallback(() => {
    if (!hash || !selectedPath) throw new Error('No file selected')
    return getCommitFileDiff({ data: { hash, path: selectedPath, workspace } })
  }, [hash, selectedPath, workspace])

  if (!commit) {
    return (
      <div className='flex h-full items-center justify-center bg-card text-xs text-muted-foreground'>
        Select a commit to view its changes
      </div>
    )
  }

  return (
    <ResizablePanelGroup orientation='horizontal'>
      <ResizablePanel defaultSize='35%' minSize='20%' maxSize='60%'>
        <div className='flex h-full flex-col bg-card'>
          <CommitContextMenu commit={commit}>
            <div className='border-b px-3 py-2 select-text!'>
              <p className='text-sm font-medium'>{commit.message}</p>
              {body && <p className='mt-1 whitespace-pre-wrap text-xs'>{body}</p>}
              <p className='mt-2 text-xs text-muted-foreground'>
                {commit.author} · <span className='font-mono'>{commit.shortHash}</span>
                {' · '}
                {formatDate(commit.date)}
              </p>
            </div>
          </CommitContextMenu>
          <ScrollArea className='min-h-0 flex-1'>
            <div className='flex flex-col gap-0.5 p-2'>
              {changes.map((file) => (
                <FileEntry
                  key={file.path}
                  file={file}
                  selected={selectedPath === file.path}
                  flat
                  onSelect={() => setSelectedPath(file.path)}
                />
              ))}
              {changes.length === 0 && (
                <p className='px-2 py-4 text-center text-[11px] text-muted-foreground'>No file changes</p>
              )}
            </div>
          </ScrollArea>
        </div>
      </ResizablePanel>
      {selectedPath && (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize='65%'>
            <div className='flex h-full flex-col overflow-hidden bg-card'>
              <div className='shrink-0 border-b px-3 py-1.5'>
                <p className='truncate font-mono text-xs text-muted-foreground'>{selectedPath}</p>
              </div>
              <div className='min-h-0 flex-1'>
                <FileDiffViewer path={selectedPath} fetchDiff={diffFetcher} />
              </div>
            </div>
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  )
}

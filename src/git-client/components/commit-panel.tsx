import { ChevronDown, ChevronUp, Columns2, Pencil, Rows4, UnfoldVertical } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { writeFileContent } from '../lib/actions/changes'
import { useGit } from '../lib/git-context'
import { commitChanges, getCommitFileDiff, getHeadMessage, getStagedFileDiff, getUnstagedFileDiff } from '../lib/git-data'
import { langFromPath } from '../lib/lang'
import { Button, Checkbox, Input, Label, Textarea } from '../ui'
import { EditFileView } from './edit-file-view'
import { FileDiffViewer } from './file-diff-viewer'
import type { DiffNavigator } from './interactive-diff-viewer'

interface CommitPanelProps {
  hasStaged: boolean
  selectedFilePath?: string
  selectedFileStaged?: boolean
  /** False for files opened via the workspace tree that have no diff to show. */
  selectedFileHasChanges?: boolean
  /** Reveal this 1-based line once, when selectedFilePath first loads (deep-linking). */
  selectedFileLine?: number
  /** Set when the file was opened from a commit's change list (Graph view) — shows that commit's diff read-only, no editing. */
  selectedCommitHash?: string
}

export function CommitPanel({
  hasStaged,
  selectedFilePath,
  selectedFileStaged,
  selectedFileHasChanges = true,
  selectedFileLine,
  selectedCommitHash,
}: CommitPanelProps) {
  const isCommitView = Boolean(selectedCommitHash)
  const showDiffControls = isCommitView || selectedFileHasChanges
  const { workspace, refresh } = useGit()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [amend, setAmend] = useState(false)
  const [sideBySide, setSideBySide] = useState(true)
  // A deep-linked line needs the full file visible to be revealed reliably
  // (hideUnchangedRegions can fold right over it) — force expanded just for
  // that first file, then fall back to the normal collapsed-by-default view.
  const forceExpandOnceRef = useRef(Boolean(selectedFileLine))
  const [expanded, setExpanded] = useState(forceExpandOnceRef.current)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState<string | null>(null)
  const [editDirty, setEditDirty] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const navigatorRef = useRef<DiffNavigator | null>(null)

  // Each newly selected file starts collapsed to just its changed regions
  // (unless this is the deep-linked file with a line to reveal), and out of edit mode.
  useEffect(() => {
    setExpanded(forceExpandOnceRef.current)
    forceExpandOnceRef.current = false
    setEditing(false)
  }, [selectedFilePath])

  // Load the current working-tree content whenever edit mode is entered.
  useEffect(() => {
    if (!editing || !selectedFilePath) {
      return
    }
    let active = true
    setEditContent(null)
    setEditDirty(false)
    setEditError(null)
    const fetcher = selectedFileStaged ? getStagedFileDiff : getUnstagedFileDiff
    fetcher({ data: { path: selectedFilePath, workspace } })
      .then((d) => {
        if (active) setEditContent(d.modified)
      })
      .catch((e) => {
        if (active) setEditError(e instanceof Error ? e.message : 'Failed to load')
      })
    return () => {
      active = false
    }
  }, [editing, selectedFilePath, selectedFileStaged, workspace])

  const saveEdit = async () => {
    if (editContent === null || !selectedFilePath) {
      return
    }
    setEditSaving(true)
    setEditError(null)
    try {
      await writeFileContent({ data: { path: selectedFilePath, content: editContent, workspace } })
      await refresh()
      setEditing(false)
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setEditSaving(false)
    }
  }

  const toggleAmend = async (checked: boolean) => {
    setAmend(checked)
    if (!checked) {
      setSubject('')
      setBody('')
      return
    }
    const head = await getHeadMessage({ data: { workspace } })
    setSubject(head.subject)
    setBody(head.body)
  }

  const commit = async () => {
    await commitChanges({ data: { subject, body, amend, workspace } })
    setSubject('')
    setBody('')
    setAmend(false)
    refresh()
  }

  const diffFetcher = useCallback(() => {
    if (!selectedFilePath) throw new Error('No file selected')
    if (selectedCommitHash) {
      return getCommitFileDiff({ data: { hash: selectedCommitHash, path: selectedFilePath, workspace } })
    }
    if (selectedFileStaged) {
      return getStagedFileDiff({ data: { path: selectedFilePath, workspace } })
    }
    return getUnstagedFileDiff({ data: { path: selectedFilePath, workspace } })
  }, [selectedFilePath, selectedFileStaged, selectedCommitHash, workspace])

  const diffMode = isCommitView ? 'committed' : selectedFileStaged ? 'staged' : 'unstaged'

  return (
    <div className='flex h-full flex-col bg-card'>
      {selectedFilePath ? (
        <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
          <div className='flex shrink-0 items-center justify-between border-b px-3 py-1.5'>
            <p className='truncate font-mono text-xs text-muted-foreground'>{selectedFilePath}</p>
            <div className='ml-2 flex shrink-0 items-center gap-1'>
              {editing ? (
                <>
                  {editError && <span className='text-xs text-destructive'>{editError}</span>}
                  <Button variant='outline' size='sm' className='h-6 px-2 text-[10px]' onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button size='sm' className='h-6 px-2 text-[10px]' onClick={saveEdit} disabled={editSaving || editContent === null || !editDirty}>
                    {editSaving ? 'Saving...' : 'Save'}
                  </Button>
                </>
              ) : (
                <div className='flex items-center gap-0.5'>
                  {showDiffControls && (
                    <>
                      <Button variant='ghost' size='sm' className='h-6 w-6 p-0' title='Previous change' onClick={() => navigatorRef.current?.previous()}>
                        <ChevronUp className='size-4' />
                      </Button>
                      <Button variant='ghost' size='sm' className='h-6 w-6 p-0' title='Next change' onClick={() => navigatorRef.current?.next()}>
                        <ChevronDown className='size-4' />
                      </Button>
                      <Button
                        variant={expanded ? 'secondary' : 'ghost'}
                        size='sm'
                        className='h-6 w-6 p-0'
                        title={expanded ? 'Show only changed lines' : 'Show full file'}
                        onClick={() => setExpanded((v) => !v)}
                      >
                        <UnfoldVertical className='size-4' />
                      </Button>
                      <Button variant='ghost' size='sm' className='h-6 w-6 p-0' title={sideBySide ? 'Unified diff' : 'Side by side'} onClick={() => setSideBySide((v) => !v)}>
                        {sideBySide ? <Rows4 className='size-4' /> : <Columns2 className='size-4' />}
                      </Button>
                    </>
                  )}
                  {!isCommitView && (
                    <Button variant='ghost' size='sm' className='h-6 w-6 p-0' title='Edit file' onClick={() => setEditing(true)}>
                      <Pencil className='size-4' />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className='min-h-0 flex-1'>
            {editing ? (
              <EditFileView
                value={editContent}
                language={langFromPath(selectedFilePath)}
                onChange={(v) => {
                  setEditContent(v)
                  setEditDirty(true)
                }}
              />
            ) : (
              <FileDiffViewer
                path={selectedFilePath}
                fetchDiff={diffFetcher}
                singlePane={!showDiffControls}
                interactive={!isCommitView && selectedFileHasChanges}
                diffMode={diffMode}
                sideBySide={sideBySide}
                expanded={expanded}
                line={selectedFileLine}
                onNavigatorReady={(nav) => {
                  navigatorRef.current = nav
                }}
              />
            )}
          </div>
        </div>
      ) : (
        <div className='flex min-h-0 flex-1 items-center justify-center text-xs text-muted-foreground'>Select a file to view its content</div>
      )}
      <div className='flex flex-col gap-2 border-t p-3'>
        <Input placeholder='Commit subject' value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Textarea placeholder='Description' value={body} onChange={(e) => setBody(e.target.value)} rows={1} className='min-h-0' />
        <div className='flex items-center justify-between gap-2'>
          <Label className='flex items-center gap-2 text-xs'>
            <Checkbox checked={amend} onCheckedChange={(checked) => toggleAmend(checked === true)} />
            Amend
          </Label>
          <Button size='sm' onClick={commit} disabled={!amend && !hasStaged}>
            Commit
          </Button>
        </div>
      </div>
    </div>
  )
}

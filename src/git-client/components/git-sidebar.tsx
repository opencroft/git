import { Archive, FolderTree, GitBranch, Globe, Tag } from 'lucide-react'

import { createBranch } from '../lib/actions/branches'
import { addRemote } from '../lib/actions/remotes'
import { stashPush } from '../lib/actions/stashes'
import { addSubmodule } from '../lib/actions/submodules'
import { createTag } from '../lib/actions/tags'
import { useGitAction } from '../lib/use-git-action'
import type { GitStore } from '../lib/use-git-store'
import { ContextMenuItem, ScrollArea, Separator } from '../ui'
import { BranchesTree } from './branches-tab'
import { ChangesView } from './changes-view'
import { CollapsibleSection } from './collapsible-section'
import { FilterInput } from './filter-input'
import { useGitDialogs } from './git-dialogs'
import { RemotesTree } from './remotes-tab'
import { SidebarHeader } from './sidebar-header'
import { StashesTree } from './stashes-tab'
import { SubmodulesTree } from './submodules-tab'
import { TagsTree } from './tags-tab'

// Section content sits one level under its collapsible header.
const SECTION_DEPTH = 1

interface GitSidebarProps extends GitStore {}

export function GitSidebar(store: GitSidebarProps) {
  const { run, error } = useGitAction()
  const { prompt } = useGitDialogs()

  const onNewBranch = async () => {
    const name = await prompt({
      title: 'New branch',
      label: 'Branch name',
      placeholder: 'feature/my-branch',
      required: true,
    })
    if (name) {
      await run(createBranch, { name, checkout: true })
    }
  }

  const onAddRemote = async () => {
    const name = await prompt({ title: 'Add remote', label: 'Name', required: true })
    if (!name) {
      return
    }
    const url = await prompt({
      title: `Remote URL for ${name}`,
      label: 'URL',
      required: true,
    })
    if (url) {
      await run(addRemote, { name, url })
    }
  }

  const onCreateTag = async () => {
    const name = await prompt({
      title: 'Create tag',
      label: 'Tag name',
      placeholder: 'v1.0.0',
      required: true,
    })
    if (!name) {
      return
    }
    const message = await prompt({
      title: 'Tag message',
      label: 'Message (optional)',
      multiline: true,
    })
    await run(createTag, message ? { name, message } : { name })
  }

  const onStash = async () => {
    const message = await prompt({
      title: 'Stash changes',
      label: 'Message (optional)',
    })
    if (message === null) {
      return
    }
    await run(stashPush, {
      message: message || undefined,
      includeUntracked: true,
    })
  }

  const onAddSubmodule = async () => {
    const url = await prompt({
      title: 'Add submodule',
      label: 'Repository URL',
      required: true,
    })
    if (!url) {
      return
    }
    const path = await prompt({
      title: 'Submodule path',
      label: 'Path',
      placeholder: 'vendor/lib',
      required: true,
    })
    if (path) {
      await run(addSubmodule, { url, path })
    }
  }

  return (
    <aside className='flex h-full min-w-0 flex-col overflow-hidden border-r bg-card'>
      <SidebarHeader
        changedFileCount={store.changedFiles.length}
        activeView={store.sidebarView}
        onViewChange={store.setSidebarView}
      />
      <Separator />
      {store.sidebarView === 'commits' ? (
        <>
          <FilterInput value={store.filterText} onChange={store.setFilterText} placeholder='Filter...' />
          {error && (
            <div className='mx-2 mb-1 px-2 py-1 text-[11px] text-destructive bg-destructive/10 rounded'>{error}</div>
          )}
          <ScrollArea className='flex-1 min-h-0' innerClassName='block min-w-0!'>
            <div className='px-1 py-1 flex flex-col gap-0.5 min-w-0'>
              <CollapsibleSection
                title='Branches'
                icon={<GitBranch className='size-4 text-muted-foreground' />}
                count={store.filteredBranches.length}
                defaultOpen
                menu={<ContextMenuItem onClick={onNewBranch}>New branch...</ContextMenuItem>}
              >
                <BranchesTree
                  branches={store.filteredBranches}
                  visibilityMap={store.visibilityMap}
                  depth={SECTION_DEPTH}
                  onSelect={store.selectCommit}
                  onToggleWhitelist={store.toggleWhitelist}
                  onToggleBlacklist={store.toggleBlacklist}
                  onToggleFolderWhitelist={store.toggleFolderWhitelist}
                  onToggleFolderBlacklist={store.toggleFolderBlacklist}
                />
              </CollapsibleSection>

              <CollapsibleSection
                title='Remotes'
                icon={<Globe className='size-4 text-muted-foreground' />}
                count={store.filteredRemotes.reduce((sum, r) => sum + r.branches.length, 0)}
                menu={<ContextMenuItem onClick={onAddRemote}>Add remote...</ContextMenuItem>}
              >
                <RemotesTree
                  remotes={store.filteredRemotes}
                  visibilityMap={store.visibilityMap}
                  depth={SECTION_DEPTH}
                  onSelect={store.selectCommit}
                  onToggleWhitelist={store.toggleWhitelist}
                  onToggleBlacklist={store.toggleBlacklist}
                  onToggleFolderWhitelist={store.toggleFolderWhitelist}
                  onToggleFolderBlacklist={store.toggleFolderBlacklist}
                />
              </CollapsibleSection>

              <CollapsibleSection
                title='Tags'
                icon={<Tag className='size-4 text-muted-foreground' />}
                count={store.filteredTags.length}
                defaultOpen={false}
                menu={<ContextMenuItem onClick={onCreateTag}>Create tag...</ContextMenuItem>}
              >
                <TagsTree tags={store.filteredTags} depth={SECTION_DEPTH} />
              </CollapsibleSection>

              <CollapsibleSection
                title='Stashes'
                icon={<Archive className='size-4 text-muted-foreground' />}
                count={store.filteredStashes.length}
                defaultOpen={false}
                menu={<ContextMenuItem onClick={onStash}>Stash changes...</ContextMenuItem>}
              >
                <StashesTree stashes={store.filteredStashes} depth={SECTION_DEPTH} />
              </CollapsibleSection>

              <CollapsibleSection
                title='Submodules'
                icon={<FolderTree className='size-4 text-muted-foreground' />}
                count={store.filteredSubmodules.length}
                defaultOpen={false}
                menu={<ContextMenuItem onClick={onAddSubmodule}>Add submodule...</ContextMenuItem>}
              >
                <SubmodulesTree submodules={store.filteredSubmodules} depth={SECTION_DEPTH} />
              </CollapsibleSection>
            </div>
          </ScrollArea>
        </>
      ) : (
        <>
          <FilterInput value={store.changesFilterText} onChange={store.setChangesFilterText} placeholder='Filter...' />
          <ChangesView
            changedFiles={store.changedFiles}
            stagedFiles={store.stagedFiles}
            files={store.files}
            commits={store.commits}
            headReachable={store.headReachable}
            headHash={store.activeBranch?.tipHash}
            view={store.changesView}
            onViewChange={store.setChangesView}
            onFileSelect={store.selectFile}
            filterText={store.changesFilterText}
          />
        </>
      )}
    </aside>
  )
}

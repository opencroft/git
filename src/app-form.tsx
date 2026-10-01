import type { AppFormProps } from '@opencroft/client'
import { TerminalSelector } from '@opencroft/client'

// Custom parameter form for the Git App — replaces the host's generic one so
// the terminal is PICKED from the space's terminal sources rather than typed
// as a raw "node-id/handle-id" string. Controlled: the host owns the dialog
// and the submit; this only renders and reports values.
export function GitAppForm({ spaceSlug, params, onChange }: AppFormProps) {
  const set = (id: string) => (value: string) => onChange({ ...params, [id]: value })

  return (
    <div className='flex w-full flex-col gap-3'>
      <div className='flex w-full flex-col gap-1'>
        <span className='text-sm font-medium'>Terminal *</span>
        <TerminalSelector
          value={params.terminal ?? ''}
          onChange={set('terminal')}
          spaceSlug={spaceSlug}
          placeholder='Select the terminal the workspace lives on'
        />
      </div>
      <div className='flex w-full flex-col gap-1'>
        <label htmlFor='git-app-folder' className='text-sm font-medium'>
          Workspace folder *
        </label>
        <input
          id='git-app-folder'
          className='w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
          value={params.folder ?? ''}
          placeholder='/home/user/workspace'
          onChange={(e) => set('folder')(e.target.value)}
        />
        <p className='text-xs text-muted-foreground'>The folder on that terminal holding the git repositories.</p>
      </div>
      <div className='flex w-full flex-col gap-1'>
        <label htmlFor='git-app-integration' className='text-sm font-medium'>
          Integration branches
        </label>
        <textarea
          id='git-app-integration'
          rows={2}
          className='w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
          value={params.integrationBranches ?? ''}
          placeholder={'myrepo.git=main\nother.git=develop'}
          onChange={(e) => set('integrationBranches')(e.target.value)}
        />
        <p className='text-xs text-muted-foreground'>
          Per repository, the branch its work merges into ("repo=branch" per line). Worktree audits skip repositories
          without one rather than guess.
        </p>
      </div>
    </div>
  )
}

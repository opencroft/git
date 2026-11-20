import type { AppFormProps } from '@opencroft/client/app'
import { TerminalSelector } from '@opencroft/client/terminal'
import { FieldHint } from '@opencroft/client/ui'

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
        <FieldHint about='Workspace folder' text='The folder on that terminal holding the git repositories.'>
          <label htmlFor='git-app-folder' className='text-sm font-medium'>
            Workspace folder *
          </label>
        </FieldHint>
        <input
          id='git-app-folder'
          className='w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
          value={params.folder ?? ''}
          placeholder='/home/user/workspace'
          onChange={(e) => set('folder')(e.target.value)}
        />
      </div>
      <div className='flex w-full flex-col gap-1'>
        <FieldHint
          about='Integration branches'
          text={
            'Per repository, the branch its work merges into. Worktree audits skip repositories without one ' +
            'rather than guess.'
          }
        >
          <label htmlFor='git-app-integration' className='text-sm font-medium'>
            Integration branches
          </label>
        </FieldHint>
        <textarea
          id='git-app-integration'
          rows={2}
          className='w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
          value={params.integrationBranches ?? ''}
          placeholder={'myrepo.git=main\nother.git=develop'}
          onChange={(e) => set('integrationBranches')(e.target.value)}
        />
        <p className='text-xs text-muted-foreground'>One "repo=branch" per line.</p>
      </div>
    </div>
  )
}

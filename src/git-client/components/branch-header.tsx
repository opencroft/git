import { GitBranch } from 'lucide-react'
import type { GitBranch as GitBranchType } from '../lib/types'
import { Badge } from '../ui'

interface BranchHeaderProps {
  activeBranch: GitBranchType | undefined
  commitCount: number
}

export function BranchHeader({ activeBranch, commitCount }: BranchHeaderProps) {
  return (
    <div className='flex items-center gap-2 border-b px-3 py-1.5 bg-card'>
      <GitBranch className='size-4 text-primary' />
      <span className='text-sm font-medium'>{activeBranch?.name ?? 'detached'}</span>
      <Badge variant='secondary' className='text-[10px] px-1.5 py-0'>
        {commitCount} commits
      </Badge>
    </div>
  )
}

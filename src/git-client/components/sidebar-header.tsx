import { FileEdit, GitCommitHorizontal } from 'lucide-react'
import type { SidebarView } from '../lib/types'
import { cn } from 'cn'
import { Badge, Button } from '../ui'

interface SidebarHeaderProps {
  changedFileCount: number
  activeView: SidebarView
  onViewChange: (view: SidebarView) => void
}

export function SidebarHeader({ changedFileCount, activeView, onViewChange }: SidebarHeaderProps) {
  return (
    <div className='flex flex-col gap-0.5 p-2'>
      <Button
        variant={activeView === 'changes' ? 'secondary' : 'ghost'}
        size='sm'
        className={cn('justify-between', activeView === 'changes' && 'bg-secondary/50')}
        onClick={() => onViewChange('changes')}
      >
        <span className='flex items-center gap-2'>
          <FileEdit className='size-4' />
          Local Changes
        </span>
        <Badge variant='secondary' className='text-[10px] px-1.5 py-0'>
          {changedFileCount}
        </Badge>
      </Button>
      <Button
        variant={activeView === 'commits' ? 'secondary' : 'ghost'}
        size='sm'
        className={cn('justify-start', activeView === 'commits' && 'bg-secondary/50')}
        onClick={() => onViewChange('commits')}
      >
        <GitCommitHorizontal className='size-4' />
        All Commits
      </Button>
    </div>
  )
}

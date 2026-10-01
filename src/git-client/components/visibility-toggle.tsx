import { Eye, EyeOff, Filter } from 'lucide-react'
import type { MouseEvent } from 'react'
import type { VisibilityMode } from '../lib/types'
import { cn } from 'cn'
import { Button } from '../ui'

interface VisibilityToggleProps {
  mode: VisibilityMode
  onWhitelist: () => void
  onBlacklist: () => void
}

function stop(handler: () => void) {
  return (event: MouseEvent) => {
    event.stopPropagation()
    handler()
  }
}

export function VisibilityToggle({ mode, onWhitelist, onBlacklist }: VisibilityToggleProps) {
  const whitelisted = mode === 'shown'
  const blacklisted = mode === 'hidden'
  return (
    <span className='flex shrink-0 items-center gap-0.5'>
      <Button
        variant='ghost'
        size='icon-xs'
        title='Filter (whitelist)'
        onClick={stop(onWhitelist)}
        className={cn('size-4', whitelisted ? 'text-chart-1 hover:text-chart-1' : 'text-muted-foreground hover:text-foreground')}
      >
        <Filter className='size-4' />
      </Button>
      <Button
        variant='ghost'
        size='icon-xs'
        title='Hide (blacklist)'
        onClick={stop(onBlacklist)}
        className={cn('size-4', blacklisted ? 'text-destructive hover:text-destructive' : 'text-muted-foreground hover:text-foreground')}
      >
        {blacklisted ? <EyeOff className='size-4' /> : <Eye className='size-4' />}
      </Button>
    </span>
  )
}

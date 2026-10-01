import { Button } from '../ui'

interface DiffActionBarProps {
  top: number
  right?: number
  onStage?: () => void
  onDiscard?: () => void
  onUnstage?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  loading?: boolean
}

export function DiffActionBar({ top, right = 8, onStage, onDiscard, onUnstage, onMouseEnter, onMouseLeave, loading }: DiffActionBarProps) {
  return (
    <div role='toolbar' className='absolute z-50 flex gap-0.5 rounded-md border bg-popover/95 p-0.5 shadow-md' style={{ top, right }} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {onStage && (
        <Button variant='ghost' size='sm' className='h-6 px-2 text-[11px]' onClick={onStage} disabled={loading}>
          Stage
        </Button>
      )}
      {onDiscard && (
        <Button variant='ghost' size='sm' className='h-6 px-2 text-[11px] text-destructive hover:text-destructive' onClick={onDiscard} disabled={loading}>
          Discard
        </Button>
      )}
      {onUnstage && (
        <Button variant='ghost' size='sm' className='h-6 px-2 text-[11px]' onClick={onUnstage} disabled={loading}>
          Unstage
        </Button>
      )}
    </div>
  )
}

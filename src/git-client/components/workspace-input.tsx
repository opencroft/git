import { FolderOpen, type LucideIcon, RefreshCw, TerminalSquare } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { TerminalSelector } from '@opencroft/client'
import { cn } from 'cn'
import { Button, Input } from '../ui'

interface FieldProps {
  value: string
  placeholder: string
  icon: LucideIcon
  onChange: (value: string) => void
}

function DebouncedField({ value, placeholder, icon: Icon, onChange }: FieldProps) {
  const [draft, setDraft] = useState(value)
  const timerRef = useRef(0)
  const committed = useRef(value)

  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value
      setDraft(value)
    }
  }, [value])

  const commit = useCallback(
    (v: string) => {
      committed.current = v
      onChange(v)
    },
    [onChange],
  )

  const sync = useCallback(
    (v: string) => {
      clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => commit(v), 600)
    },
    [commit],
  )

  return (
    <div className='flex flex-1 items-center gap-2'>
      <Icon className='size-4 shrink-0 text-muted-foreground' />
      <Input
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          sync(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            clearTimeout(timerRef.current)
            commit(draft)
          }
        }}
        placeholder={placeholder}
        className='h-6 text-xs'
      />
    </div>
  )
}

interface WorkspaceInputProps {
  folder: string
  target: string
  onFolderChange: (value: string) => void
  onTargetChange: (value: string) => void
  loading?: boolean
  onRefresh?: () => void
}

// The terminal is PICKED, never typed: a handle is "<node-id>/<handle-id>", and
// both halves are opaque ids, so a text field asks the reader to recognise and
// retype a string that means nothing to them. The host's own picker names the
// sources instead, and it is reached through @opencroft/client rather than
// rebuilt here -- it is the same component the App's parameter form uses.
//
// No `spaceSlug`, deliberately: the client is not bound to the workspace it was
// opened from and may be pointed at any terminal source in any space, so
// limiting the choices to one space would take that away.
export function WorkspaceInput({ folder, target, onFolderChange, onTargetChange, loading, onRefresh }: WorkspaceInputProps) {
  return (
    <div className='flex items-center gap-3 border-b bg-card px-3 py-1'>
      <div className='flex flex-1 items-center gap-2'>
        <TerminalSquare className='size-4 shrink-0 text-muted-foreground' />
        <TerminalSelector value={target} onChange={onTargetChange} placeholder='Select a terminal' />
      </div>
      <DebouncedField value={folder} placeholder='Repository path...' icon={FolderOpen} onChange={onFolderChange} />
      <Button variant='ghost' size='icon-xs' title='Refresh' onClick={onRefresh} disabled={loading}>
        <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
      </Button>
    </div>
  )
}

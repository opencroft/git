import type { ReactNode } from 'react'

import type { SelectModifiers } from '../lib/types'
import { cn } from 'cn'

interface EntryRowProps {
  /** Primary text. Pass a node to compose inline trailing content (e.g. a HEAD badge). */
  label: ReactNode
  /** Secondary line under the label, rendered muted (turns the row two-line). */
  subtitle?: ReactNode
  icon?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  depth?: number
  emphasized?: boolean
  selected?: boolean
  /** Fades the row, e.g. a hidden branch. */
  dimmed?: boolean
  title?: string
  rounding?: string
  /** Reserve the chevron column so chevron-less rows align under expandable ones; off for flat lists. */
  reserveChevron?: boolean
  onSelect?: (modifiers: SelectModifiers) => void
  onActivate?: () => void
}

/** Placeholder matching the chevron's box so chevron-less rows align with folders. */
function ChevronSpacer() {
  return <span className='size-4 shrink-0' />
}

export function EntryRow({
  label,
  subtitle,
  icon,
  leading,
  trailing,
  depth = 0,
  emphasized,
  selected,
  dimmed,
  title,
  rounding = 'rounded-md',
  reserveChevron = true,
  onSelect,
  onActivate,
}: EntryRowProps) {
  const interactive = Boolean(onSelect || onActivate)
  const handleSelect = (e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    onSelect?.({ shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey })
  }
  return (
    // biome-ignore lint/a11y/useSemanticElements: selectable row, not a button element
    <div
      className={cn(
        'flex gap-1 min-w-0 px-2 py-1 text-xs',
        subtitle ? 'items-start' : 'items-center',
        rounding,
        selected ? 'bg-secondary' : 'hover:bg-secondary',
        dimmed && 'opacity-50',
        interactive && 'cursor-pointer',
      )}
      style={depth > 0 ? { paddingLeft: depth * 8 + 8 } : undefined}
      title={title}
      onClick={onSelect ? handleSelect : undefined}
      onDoubleClick={onActivate}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') {
          return
        }
        if (onSelect) {
          handleSelect(e)
        } else {
          onActivate?.()
        }
      }}
      role='button'
      tabIndex={0}
    >
      {leading ?? (reserveChevron ? <ChevronSpacer /> : null)}
      {icon}
      {subtitle ? (
        <div className='flex-1 min-w-0'>
          <p className={cn('truncate', emphasized && 'font-medium')}>{label}</p>
          <p className='truncate text-[10px] text-muted-foreground'>{subtitle}</p>
        </div>
      ) : typeof label === 'string' ? (
        <span className={cn('flex-1 truncate', emphasized && 'font-medium')}>{label}</span>
      ) : (
        label
      )}
      {trailing}
    </div>
  )
}

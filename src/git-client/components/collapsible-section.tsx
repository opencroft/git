import type { ReactNode } from 'react'
import { FolderEntry } from './folder-entry'

interface CollapsibleSectionProps {
  title: string
  icon: ReactNode
  count?: number
  defaultOpen?: boolean
  /** Context-menu content (ContextMenu*Item nodes) shown on right-click of the section header. */
  menu?: ReactNode
  children: ReactNode
}

export function CollapsibleSection({ title, icon, count, defaultOpen = true, menu, children }: CollapsibleSectionProps) {
  return (
    <FolderEntry
      label={title}
      icon={icon}
      emphasized
      defaultOpen={defaultOpen}
      menu={menu}
      trailing={count !== undefined ? <span className='shrink-0 text-[10px] text-muted-foreground'>{count}</span> : undefined}
    >
      {children}
    </FolderEntry>
  )
}

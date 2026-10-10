import { File, Folder } from 'lucide-react'

import type { TreeNode } from '../lib/file-tree'
import type { SelectModifiers } from '../lib/types'
import { EntryRow } from './entry-row'
import { FileEntry } from './file-entry'
import { FolderEntry } from './folder-entry'

interface TreeRowProps {
  node: TreeNode
  depth: number
  collapsed?: Set<string>
  selected?: Set<string>
  roundingFor?: (path: string) => string
  onToggle?: (path: string) => void
  onSelect?: (path: string, modifiers: SelectModifiers) => void
  onActivate?: (path: string) => void
  /** True when these rows belong to the Staged section. */
  staged?: boolean
  /** Selection-aware target paths for a stage/unstage action on a file row. */
  actionPathsFor?: (path: string) => string[]
  /** Every file path in this section, for the "stage/unstage all" entries. */
  allPaths?: string[]
}

function TreeRow({
  node,
  depth,
  collapsed,
  selected,
  roundingFor,
  onToggle,
  onSelect,
  onActivate,
  staged,
  actionPathsFor,
  allPaths,
}: TreeRowProps) {
  if (node.children.length === 0) {
    const file = node.file
    if (file) {
      return (
        <FileEntry
          file={file}
          label={node.name}
          depth={depth}
          selected={selected?.has(file.path)}
          rounding={roundingFor?.(file.path)}
          onSelect={onSelect ? (m) => onSelect(file.path, m) : undefined}
          onActivate={onActivate ? () => onActivate(file.path) : undefined}
          staged={staged}
          actionPaths={actionPathsFor?.(file.path)}
          allPaths={allPaths}
        />
      )
    }
    return (
      <EntryRow
        label={node.name}
        icon={<File className='size-4 shrink-0' />}
        depth={depth}
        dimmed
        selected={selected?.has(node.path)}
        rounding={roundingFor?.(node.path)}
        onSelect={onSelect ? (m) => onSelect(node.path, m) : undefined}
      />
    )
  }
  return (
    <FolderEntry
      label={node.name}
      icon={<Folder className='size-4 shrink-0 text-muted-foreground' />}
      depth={depth}
      open={collapsed ? !collapsed.has(node.path) : undefined}
      onToggle={onToggle ? () => onToggle(node.path) : undefined}
      selected={selected?.has(node.path)}
      rounding={roundingFor?.(node.path)}
      onSelect={onSelect ? (m) => onSelect(node.path, m) : undefined}
      onActivate={onActivate ? () => onActivate(node.path) : undefined}
      menuPath={onSelect && !staged ? node.path : undefined}
    >
      {node.children.map((child) => (
        <TreeRow
          key={child.path}
          node={child}
          depth={depth + 1}
          collapsed={collapsed}
          selected={selected}
          roundingFor={roundingFor}
          onToggle={onToggle}
          onSelect={onSelect}
          onActivate={onActivate}
          staged={staged}
          actionPathsFor={actionPathsFor}
          allPaths={allPaths}
        />
      ))}
    </FolderEntry>
  )
}

interface ChangeTreeProps {
  nodes: TreeNode[]
  collapsed?: Set<string>
  selected?: Set<string>
  roundingFor?: (path: string) => string
  onToggle?: (path: string) => void
  onSelect?: (path: string, modifiers: SelectModifiers) => void
  onActivate?: (path: string) => void
  staged?: boolean
  actionPathsFor?: (path: string) => string[]
  allPaths?: string[]
}

export function ChangeTree({
  nodes,
  collapsed,
  selected,
  roundingFor,
  onToggle,
  onSelect,
  onActivate,
  staged,
  actionPathsFor,
  allPaths,
}: ChangeTreeProps) {
  return (
    <div className='min-w-0'>
      {nodes.map((node) => (
        <TreeRow
          key={node.path}
          node={node}
          depth={0}
          collapsed={collapsed}
          selected={selected}
          roundingFor={roundingFor}
          onToggle={onToggle}
          onSelect={onSelect}
          onActivate={onActivate}
          staged={staged}
          actionPathsFor={actionPathsFor}
          allPaths={allPaths}
        />
      ))}
    </div>
  )
}

import type { FileChange } from './types'

export interface TreeNode {
  name: string
  path: string
  children: TreeNode[]
  file?: FileChange
}

function sortNodes(node: TreeNode) {
  node.children.sort((a, b) => {
    const aDir = a.children.length > 0
    const bDir = b.children.length > 0
    if (aDir !== bDir) {
      return aDir ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })
  for (const child of node.children) {
    sortNodes(child)
  }
}

export function buildTree(paths: string[], changes: Map<string, FileChange>): TreeNode[] {
  const root: TreeNode = { name: '', path: '', children: [] }
  for (const path of paths) {
    const parts = path.split('/').filter(Boolean)
    let node = root
    let acc = ''
    parts.forEach((part, index) => {
      acc = acc ? `${acc}/${part}` : part
      let child = node.children.find((c) => c.name === part)
      if (!child) {
        child = { name: part, path: acc, children: [] }
        node.children.push(child)
      }
      node = child
      if (index === parts.length - 1) {
        node.file = changes.get(path)
      }
    })
  }
  sortNodes(root)
  return root.children
}

export function allFolderPaths(nodes: TreeNode[]): string[] {
  const out: string[] = []
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      if (node.children.length > 0) {
        out.push(node.path)
        walk(node.children)
      }
    }
  }
  walk(nodes)
  return out
}

export function flattenVisible(nodes: TreeNode[], collapsed: Set<string>): string[] {
  const out: string[] = []
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      out.push(node.path)
      if (node.children.length > 0 && !collapsed.has(node.path)) {
        walk(node.children)
      }
    }
  }
  walk(nodes)
  return out
}

export function rowRounding(order: string[], selected: Set<string>, path: string): string {
  if (!selected.has(path)) {
    return 'rounded-md'
  }
  const index = order.indexOf(path)
  const top = index <= 0 || !selected.has(order[index - 1])
  const bottom = index === order.length - 1 || !selected.has(order[index + 1])
  if (top && bottom) {
    return 'rounded-md'
  }
  if (top) {
    return 'rounded-t-md'
  }
  if (bottom) {
    return 'rounded-b-md'
  }
  return 'rounded-none'
}

export function dedupePaths(paths: string[]): string[] {
  const sorted = [...paths].sort()
  const result: string[] = []
  for (const path of sorted) {
    const covered = result.some((kept) => path === kept || path.startsWith(`${kept}/`))
    if (!covered) {
      result.push(path)
    }
  }
  return result
}

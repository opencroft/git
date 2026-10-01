import type { legacy } from '@opencroft/client'
import { createContext, type ReactNode, useContext, useMemo } from 'react'

export interface CodeSelection {
  path: string
  /** 1-based, inclusive. */
  startLine: number
  endLine: number
  text: string
}

/**
 * Where a code selection is reported to.
 *
 * A context rather than props: the editor that knows the selection sits several
 * components below the app view that wants it (app view -> client -> commit
 * panel/details -> diff viewer -> editor), and it is rendered from two
 * different call sites. Threading a callback through all of that would put a
 * prop nobody in between has any use for into every one of them.
 *
 * Null when nothing is listening, so the editor works unchanged outside a
 * provider — the git client is also mounted as a command-mode overlay, which
 * has no chat beside it.
 */
const CodeSelectionContext = createContext<((selection: CodeSelection) => void) | null>(null)

export function CodeSelectionProvider({
  onSelection,
  children,
}: {
  onSelection: (selection: CodeSelection) => void
  children: ReactNode
}) {
  return <CodeSelectionContext.Provider value={onSelection}>{children}</CodeSelectionContext.Provider>
}

/**
 * An `onMount` for the host's `CodeEditor` that reports what the reader
 * highlights in `path`, or undefined when nothing is listening.
 *
 * Monaco paints its own selection over a hidden textarea, so the document's
 * selection APIs never see what is highlighted — the editor has to be asked.
 * In exchange the line numbers are exact and need no mapping back to the
 * source, unlike a rendered-markdown surface.
 */
export function useCodeSelectionMount(path: string): legacy.CodeEditorOnMount | undefined {
  const report = useContext(CodeSelectionContext)
  return useMemo(() => {
    if (!report) {
      return undefined
    }
    return (mounted) => {
      // Only a plain editor is reported: a diff editor shows two versions, and
      // a selection in it names lines of neither file on its own.
      if ('getModifiedEditor' in mounted) {
        return
      }
      const disposable = mounted.onDidChangeCursorSelection((event) => {
        const selection = event.selection
        // AN EMPTY SELECTION IS NOT A CLEAR. Clicking into the composer to type
        // the question collapses the highlight, and reporting that as "nothing
        // selected" would throw away the very lines the reader picked out in
        // order to ask about them. Only a real selection is reported; clearing
        // belongs to the badge's own X.
        if (selection.isEmpty()) {
          return
        }
        const text = mounted.getModel()?.getValueInRange(selection) ?? ''
        if (!text.trim()) {
          return
        }
        report({ path, startLine: selection.startLineNumber, endLine: selection.endLineNumber, text })
      })
      mounted.onDidDispose(() => disposable.dispose())
    }
  }, [report, path])
}

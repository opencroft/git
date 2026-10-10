import { useCallback, useRef, useState } from 'react'

/**
 * The measured pixel height of a box, kept in step with its layout.
 *
 * Every diff in this client fills a pane, and a pane is the one shape the host
 * `CodeEditor` will not adopt on its own in diff mode: left to itself it sizes
 * to the diff's own content between a floor and a 400px ceiling, and its two
 * wrapper elements have automatic height, so a `height='100%'` handed down from
 * here would resolve against a box whose height depends on the editor inside it
 * and collapse. Its answer to that is documented — "a caller that wants a fixed
 * box passes `height`" — and a fixed box is what this measures.
 *
 * A `ResizeObserver` rather than a render-time read because the panes are
 * resizable and dragging the handle changes their size without a React render.
 *
 * A callback ref rather than an object one because the box being measured is
 * usually behind a loading branch: an effect keyed on mount would run while the
 * placeholder is on screen, find no element, and never look again. This runs
 * whenever the element attaches or detaches, which is the moment that matters.
 */
export function useFillHeight(): [(element: HTMLDivElement | null) => void, number | undefined] {
  // Undefined until the first measurement, which is what the editor should be
  // given rather than a guessed number: it is one frame, and a wrong height
  // would lay Monaco out twice.
  const [height, setHeight] = useState<number>()
  const observerRef = useRef<ResizeObserver | null>(null)

  const ref = useCallback((element: HTMLDivElement | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!element) {
      return
    }
    const measure = () => {
      // Rounded, so the sub-pixel heights a drag produces do not re-render the
      // editor for a change nothing can see.
      const next = Math.round(element.getBoundingClientRect().height)
      setHeight((previous) => (previous === next ? previous : next))
    }
    // Measured here as well as by the observer: a callback ref runs in the
    // commit phase, so the first height lands before the browser paints.
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    observerRef.current = observer
  }, [])

  return [ref, height]
}

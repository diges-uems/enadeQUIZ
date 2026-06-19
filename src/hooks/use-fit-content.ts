'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Scales down child content to fit inside its parent container WITHOUT
 * showing a scrollbar.
 *
 * How it works:
 *   1. The `containerRef` is attached to the parent (which has a fixed
 *      height from flexbox — `flex-1 min-h-0`).
 *   2. The hook measures both the parent's available height and the
 *      child's natural (unscaled) height.
 *   3. If the child is taller than the parent, it applies
 *      `transform: scale(ratio)` with `transform-origin: top left` so
 *      the child shrinks to fit. Width is adjusted via `width: 100/scale%`
 *      so the scaled content still fills the horizontal space.
 *   4. If the child fits naturally, scale = 1 (no transform).
 *
 * Re-runs on:
 *   - Mount
 *   - Window resize
 *   - `deps` array changes (e.g. when the question text changes)
 *   - Content mutations via ResizeObserver on the child
 *
 * Returns:
 *   - `containerRef` — attach to the parent element
 *   - `contentRef` — attach to the child element (the one that might
 *     overflow)
 *   - `scale` — the current scale ratio (1 = no scaling)
 */
export function useFitContent<T extends HTMLElement = HTMLDivElement>(
  deps: unknown[] = []
) {
  const containerRef = useRef<T | null>(null)
  const contentRef = useRef<T | null>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content) return

    const compute = () => {
      const containerHeight = container.clientHeight
      if (containerHeight <= 0) return

      // Reset any previous transform so we measure the natural height.
      content.style.transform = 'none'
      content.style.width = ''
      // Force a reflow so scrollHeight is accurate.
      const naturalHeight = content.scrollHeight

      if (naturalHeight <= containerHeight) {
        setScale(1)
        return
      }

      const ratio = containerHeight / naturalHeight
      // Don't scale below 0.4 — text becomes unreadable.
      const clamped = Math.max(0.4, Math.min(1, ratio))
      setScale(clamped)
    }

    // Initial compute (double rAF to ensure layout is settled).
    const raf1 = requestAnimationFrame(() => {
      compute()
    })

    // Recompute on window resize.
    const handleResize = () => compute()
    window.addEventListener('resize', handleResize)

    // Observe content mutations (e.g. image loads, text changes).
    const ro = new ResizeObserver(() => compute())
    ro.observe(content)
    ro.observe(container)

    return () => {
      cancelAnimationFrame(raf1)
      window.removeEventListener('resize', handleResize)
      ro.disconnect()
    }
  }, deps)

  return { containerRef, contentRef, scale }
}

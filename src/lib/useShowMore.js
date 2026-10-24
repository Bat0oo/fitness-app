import { useEffect, useState } from 'react'

// Renders a long list in chunks: shows `step` items, and adds another `step`
// whenever the sentinel element (placed after the list) scrolls into view.
// `resetKey` (e.g. the search text) jumps back to the first chunk when it changes.
export function useShowMore(list, step = 100, resetKey) {
  const [count, setCount] = useState(step)
  // callback ref (not useRef) so we notice when the sentinel mounts later
  const [sentinel, setSentinel] = useState(null)

  useEffect(() => { setCount(step) }, [resetKey, step])

  const hasMore = count < list.length

  useEffect(() => {
    if (!sentinel || !hasMore || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) setCount(c => c + step)
    }, { rootMargin: '200px' })
    obs.observe(sentinel) // re-observing after each chunk re-checks visibility
    return () => obs.disconnect()
  }, [sentinel, hasMore, step, count])

  return {
    shown: list.slice(0, count),
    hasMore,
    showMore: () => setCount(c => c + step), // button fallback
    sentinelRef: setSentinel,
  }
}

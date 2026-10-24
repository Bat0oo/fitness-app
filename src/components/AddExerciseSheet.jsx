import { useState } from 'react'
import { searchExercises } from '../lib/library'
import { useShowMore } from '../lib/useShowMore'

export default function AddExerciseSheet({ dayTitle, library, onPick, onClose }) {
  const [search, setSearch] = useState('')
  const q = search.trim()
  const filtered = searchExercises(library, q)
  const { shown, hasMore, showMore, sentinelRef } = useShowMore(filtered, 100, q)
  // show a "add your own" option when the typed text isn't an exact library match
  const exactMatch = library.some(e => e.name.toLowerCase() === q.toLowerCase())

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <div className="sheet-title">Add to {dayTitle}</div>
          <button className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <input
          className="sheet-search"
          placeholder="Search or type your own…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />
        <div className="sheet-list">
          {q && !exactMatch && (
            <button className="sheet-item sheet-custom" onClick={() => { onPick(q); onClose() }}>
              <span>Add "{q}"</span>
              <span className="sheet-group">custom</span>
            </button>
          )}
          {shown.map(e => (
            <button key={e.name} className="sheet-item"
              onClick={() => { onPick(e.name); onClose() }}>
              <span>{e.name}</span>
              <span className="sheet-group">{e.group}</span>
            </button>
          ))}
          {filtered.length === 0 && !q && <div className="sheet-empty">Type to search</div>}
          {hasMore && (
            <button ref={sentinelRef} className="lib-more" onClick={showMore}>
              Showing {shown.length} of {filtered.length} — load more
            </button>
          )}
        </div>
        <div className="lib-credit">
          Exercises from <a href="https://wger.de" target="_blank" rel="noreferrer">wger</a> (CC-BY-SA)
        </div>
      </div>
    </div>
  )
}
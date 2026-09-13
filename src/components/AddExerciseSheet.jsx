import { useState } from 'react'
import { EXERCISE_LIBRARY } from '../lib/library'

export default function AddExerciseSheet({ dayTitle, onPick, onClose }) {
  const [search, setSearch] = useState('')
  const q = search.trim()
  const filtered = EXERCISE_LIBRARY.filter(
    e => !q || e.name.toLowerCase().includes(q.toLowerCase())
  )
  // show a "add your own" option when the typed text isn't an exact library match
  const exactMatch = EXERCISE_LIBRARY.some(e => e.name.toLowerCase() === q.toLowerCase())

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
          {filtered.map(e => (
            <button key={e.name} className="sheet-item"
              onClick={() => { onPick(e.name); onClose() }}>
              <span>{e.name}</span>
              <span className="sheet-group">{e.group}</span>
            </button>
          ))}
          {filtered.length === 0 && !q && <div className="sheet-empty">Type to search</div>}
        </div>
      </div>
    </div>
  )
}
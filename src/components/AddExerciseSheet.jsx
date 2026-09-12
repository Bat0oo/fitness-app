import { useState } from 'react'
import { EXERCISE_LIBRARY } from '../lib/library'

// Bottom sheet shown on mobile when tapping "+ Add exercise" on a day card.
// Tap an exercise to add it — no drag needed.
export default function AddExerciseSheet({ dayTitle, onPick, onClose }) {
  const [search, setSearch] = useState('')
  const filtered = EXERCISE_LIBRARY.filter(
    e => !search || e.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <div className="sheet-title">Add to {dayTitle}</div>
          <button className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <input
          className="sheet-search"
          placeholder="Search exercises…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />
        <div className="sheet-list">
          {filtered.map(e => (
            <button
              key={e.name}
              className="sheet-item"
              onClick={() => { onPick(e.name); onClose() }}
            >
              <span>{e.name}</span>
              <span className="sheet-group">{e.group}</span>
            </button>
          ))}
          {filtered.length === 0 && <div className="sheet-empty">No matches</div>}
        </div>
      </div>
    </div>
  )
}

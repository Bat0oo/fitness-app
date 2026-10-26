import { useState } from 'react'

// Bottom sheet: copy one exercise to any day of the current plan.
export default function CopySheet({ ex, days, fromDayId, onCopy, onClose }) {
  const [busy, setBusy] = useState(false)

  async function pick(dayId) {
    setBusy(true)
    try {
      await onCopy(dayId)
      onClose()
    } catch (e) {
      console.error('copy exercise failed', e)
      window.alert(`Couldn't copy the exercise: ${e?.message || e}`)
      setBusy(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <div className="sheet-title">Copy “{ex.name}” to…</div>
          <button className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="grp-help">Sets, reps and weight are copied too.</p>
        <div className="sheet-list">
          {days.map(d => (
            <button key={d.id} className="sheet-item" disabled={busy} onClick={() => pick(d.id)}>
              <span className="copy-day">
                <span className="copy-dot" style={{ background: d.color }} />
                {d.title || 'Workout'}
                <span className="sheet-group">{d.label}</span>
              </span>
              <span className="sheet-group">{d.id === fromDayId ? 'this day' : ''}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import * as data from '../lib/data'
import { bestRecord, formatWeight } from '../lib/pr'

// Bottom sheet: last 5 sessions (completed sets only) for one exercise.
export default function HistorySheet({ userId, name, unit = 'kg', onClose }) {
  const [sessions, setSessions] = useState(null)
  const [err, setErr] = useState('')
  const [record, setRecord] = useState(null)

  useEffect(() => {
    let alive = true
    data.loadRecentSessionsByExercise(userId, [name], { maxSessions: 5 })
      .then(byKey => { if (alive) setSessions(byKey[data.exerciseKey(name)] || []) })
      .catch(e => { console.error(e); if (alive) setErr("Couldn't load history.") })
    // fetched fresh so sets ticked moments ago count
    data.loadPRs(userId, [name])
      .then(byKey => { if (alive) setRecord(bestRecord(byKey[data.exerciseKey(name)], unit)) })
      .catch(e => console.error('load PR failed', e))
    return () => { alive = false }
  }, [userId, name, unit])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <div className="sheet-title">{name}</div>
          <button className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {record && (
          <div className="hist-best">
            <span>Best <b>{formatWeight(record.weight)} {record.unit}</b> × {record.reps}</span>
            {record.e1rm && <span>Est. 1RM <b>{formatWeight(record.e1rm)} {record.unit}</b></span>}
          </div>
        )}
        <div className="sheet-list">
          {err && <div className="sheet-empty">{err}</div>}
          {!err && !sessions && <div className="sheet-empty">Loading…</div>}
          {sessions?.length === 0 && (
            <div className="sheet-empty">No logged sets yet. Tick off sets during a workout to build history.</div>
          )}
          {sessions?.map(s => (
            <div key={s.sessionId} className="hist-session">
              <div className="hist-date">
                {new Date(s.date).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
              <div className="hist-sets">
                {s.sets.map(set => (
                  <span key={set.set_number} className="hist-set">
                    {set.weight ?? '–'} {set.unit} × {set.reps ?? '–'}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import * as data from '../lib/data'
import HistorySheet from './HistorySheet'
import { bestRecord, convert, estimate1RM } from '../lib/pr'

// "12,5" -> 12.5, "" -> null
const toWeight = v => {
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
// "8-10" -> 8, "" -> null
const toReps = v => {
  const n = parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) ? n : null
}
const str = v => (v === null || v === undefined ? '' : String(v))

// Build the rows shown for one exercise: logged values win, then last
// session's values, then the plan's numbers.
function buildSets(planEx, logged, last) {
  const n = Math.max(
    planEx?.sets || 0,
    last.length,
    ...logged.map(s => s.set_number),
    1
  )
  const rows = []
  for (let i = 1; i <= n; i++) {
    const log = logged.find(s => s.set_number === i)
    const prev = last.find(s => s.set_number === i) || null
    if (log) {
      rows.push({ set_number: i, weight: str(log.weight), reps: str(log.reps), done: log.done, saved: true, prev })
    } else if (prev) {
      rows.push({ set_number: i, weight: str(prev.weight), reps: str(prev.reps), done: false, saved: false, prev })
    } else {
      rows.push({
        set_number: i,
        weight: str(toWeight(planEx?.kg)),
        reps: str(toReps(planEx?.reps)),
        done: false, saved: false, prev: null,
      })
    }
  }
  return rows
}

export default function SessionView({ session, day, userId, unit, prs = {}, onExit }) {
  const [exercises, setExercises] = useState(null) // [{ key, name, exercise_id, sets }]
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [historyFor, setHistoryFor] = useState(null)

  // initial load: merge plan + already-logged sets + last session's numbers
  useEffect(() => {
    let alive = true
    const planEx = day?.exercises ?? []
    const loggedByKey = {}
    for (const s of session.sets || []) (loggedByKey[s.exercise_key] ||= []).push(s)

    // plan order first, then anything logged that's no longer in the plan
    const entries = []
    const seen = new Set()
    for (const ex of planEx) {
      const key = data.exerciseKey(ex.name)
      if (seen.has(key)) continue
      seen.add(key)
      entries.push({ key, name: ex.name, exercise_id: ex.id, planEx: ex })
    }
    for (const s of session.sets || []) {
      if (seen.has(s.exercise_key)) continue
      seen.add(s.exercise_key)
      entries.push({ key: s.exercise_key, name: s.exercise_name, exercise_id: s.exercise_id, planEx: null })
    }

    data.loadRecentSessionsByExercise(userId, entries.map(e => e.name), {
      maxSessions: 1, excludeSessionId: session.id,
    })
      .catch(e => { console.error('load previous sets failed', e); return {} })
      .then(prevByKey => {
        if (!alive) return
        setExercises(entries.map(e => ({
          key: e.key, name: e.name, exercise_id: e.exercise_id,
          sets: buildSets(e.planEx, loggedByKey[e.key] || [], prevByKey[e.key]?.[0]?.sets || []),
        })))
      })
    return () => { alive = false }
    // only on mount: later plan edits shouldn't reset an in-progress workout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  function patchSet(exKey, setNumber, fields) {
    setExercises(list => list.map(ex => ex.key !== exKey ? ex : {
      ...ex, sets: ex.sets.map(s => s.set_number === setNumber ? { ...s, ...fields } : s),
    }))
  }

  async function persist(ex, set) {
    try {
      await data.saveSet({
        session_id: session.id,
        user_id: userId,
        exercise_id: ex.exercise_id ?? null,
        exercise_name: ex.name,
        set_number: set.set_number,
        weight: toWeight(set.weight),
        reps: toReps(set.reps),
        unit,
        done: set.done,
      })
      patchSet(ex.key, set.set_number, { saved: true })
      setErr('')
    } catch (e) {
      console.error('save set failed', e)
      setErr(`Couldn't save that set: ${e?.message || e}`)
    }
  }

  function toggleDone(ex, set) {
    const next = { ...set, done: !set.done }
    patchSet(ex.key, set.set_number, { done: next.done })
    persist(ex, next)
  }

  // editing a set that's already stored keeps the stored copy in sync
  function onBlurSet(ex, set) {
    if (set.saved || set.done) persist(ex, set)
  }

  function addSet(ex) {
    const last = ex.sets[ex.sets.length - 1]
    const n = (last?.set_number || 0) + 1
    setExercises(list => list.map(e => e.key !== ex.key ? e : {
      ...e,
      sets: [...e.sets, {
        set_number: n, weight: last?.weight ?? '', reps: last?.reps ?? '',
        done: false, saved: false, prev: null,
      }],
    }))
  }

  async function removeLastSet(ex) {
    const last = ex.sets[ex.sets.length - 1]
    if (!last || ex.sets.length <= 1) return
    if (last.saved) {
      try {
        await data.deleteSet(session.id, ex.name, last.set_number)
      } catch (e) {
        console.error('delete set failed', e)
        setErr("Couldn't remove that set.")
        return
      }
    }
    setExercises(list => list.map(e => e.key !== ex.key ? e : { ...e, sets: e.sets.slice(0, -1) }))
  }

  // A ticked set beats the best weight or est. 1RM logged before this workout.
  // (The PR snapshot is loaded when the planner opens; it's refreshed after Finish.)
  function isPR(ex, set) {
    if (!set.done) return false
    const rec = bestRecord(prs[ex.key], unit)
    if (!rec) return false // first time logging this exercise: nothing to beat yet
    const w = toWeight(set.weight)
    if (w === null) return false
    if (w > convert(rec.weight, rec.unit, unit) + 0.01) return true
    const e = estimate1RM(w, toReps(set.reps))
    return e !== null && rec.e1rm !== null && e > convert(rec.e1rm, rec.unit, unit) + 0.01
  }

  const doneCount = exercises?.reduce((n, ex) => n + ex.sets.filter(s => s.done).length, 0) ?? 0

  async function finish() {
    if (doneCount === 0) {
      if (!window.confirm('No sets ticked yet. Discard this workout instead?')) return
      return discard(true)
    }
    setBusy(true)
    try {
      await data.finishSession(session.id)
      onExit()
    } catch (e) {
      console.error(e)
      setErr("Couldn't finish the workout — try again.")
      setBusy(false)
    }
  }

  async function discard(skipConfirm) {
    if (!skipConfirm && !window.confirm('Discard this workout? Logged sets will be deleted.')) return
    setBusy(true)
    try {
      await data.discardSession(session.id)
      onExit()
    } catch (e) {
      console.error(e)
      setErr("Couldn't discard the workout — try again.")
      setBusy(false)
    }
  }

  const started = new Date(session.started_at)

  return (
    <div className="session">
      <div className="session-top">
        <div>
          <div className="session-title">{session.day_title || day?.title || 'Workout'}</div>
          <div className="session-sub">
            Started {started.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {' · '}{doneCount} set{doneCount === 1 ? '' : 's'} done
          </div>
        </div>
        <div className="session-actions">
          <button className="btn-ghost" onClick={() => discard(false)} disabled={busy}>Discard</button>
          <button className="btn-finish" onClick={finish} disabled={busy || !exercises}>Finish</button>
        </div>
      </div>

      {err && <div className="session-err">{err}</div>}

      {!exercises && <div className="center-msg">Loading…</div>}
      {exercises?.length === 0 && (
        <div className="session-empty">This day has no exercises. Add some in the planner first.</div>
      )}

      {exercises?.map(ex => (
        <div key={ex.key} className="log-card">
          <div className="log-head">
            <div className="log-name">{ex.name}</div>
            <button className="log-history-btn" onClick={() => setHistoryFor(ex.name)}>History</button>
          </div>

          <div className="log-grid log-grid-head">
            <span>Set</span><span>Previous</span><span>{unit}</span><span>Reps</span><span>✓</span>
          </div>
          {ex.sets.map(set => (
            <div key={set.set_number} className={`log-grid ${set.done ? 'done' : ''}`}>
              <span className="log-setno">
                {isPR(ex, set) ? <span className="pr-mark" title="New personal record">PR</span> : set.set_number}
              </span>
              <span className="log-prev">
                {set.prev
                  ? `${str(set.prev.weight) || '–'}${set.prev.unit !== unit ? ' ' + set.prev.unit : ''} × ${str(set.prev.reps) || '–'}`
                  : '—'}
              </span>
              <input className="log-input" inputMode="decimal" value={set.weight}
                aria-label={`Set ${set.set_number} weight in ${unit}`}
                onChange={e => patchSet(ex.key, set.set_number, { weight: e.target.value })}
                onBlur={() => onBlurSet(ex, set)} />
              <input className="log-input" inputMode="numeric" value={set.reps}
                aria-label={`Set ${set.set_number} reps`}
                onChange={e => patchSet(ex.key, set.set_number, { reps: e.target.value })}
                onBlur={() => onBlurSet(ex, set)} />
              <input type="checkbox" className="log-check" checked={set.done}
                aria-label={`Set ${set.set_number} done`}
                onChange={() => toggleDone(ex, set)} />
            </div>
          ))}

          <div className="log-foot">
            <button className="btn-ghost" onClick={() => addSet(ex)}>+ Add set</button>
            {ex.sets.length > 1 && (
              <button className="btn-ghost" onClick={() => removeLastSet(ex)}>− Remove set</button>
            )}
          </div>
        </div>
      ))}

      {historyFor && (
        <HistorySheet userId={userId} name={historyFor} unit={unit} onClose={() => setHistoryFor(null)} />
      )}
    </div>
  )
}

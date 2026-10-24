import { useEffect, useState } from 'react'
import * as data from '../lib/data'
import HistorySheet from './HistorySheet'
import { bestRecord, convert, estimate1RM } from '../lib/pr'
import { dayGroups, groupSummary, pickLimit } from '../lib/groups'

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
  // alternatives: { [groupId]: { group, keys: [exerciseKey...] } } and which keys are picked
  const [groups, setGroups] = useState({})
  const [picked, setPicked] = useState({}) // { [groupId]: [exerciseKey...] }

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
    const planGroups = day ? dayGroups(day) : {}
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
        const built = entries.map(e => ({
          key: e.key, name: e.name, exercise_id: e.exercise_id,
          groupId: planGroups[e.planEx?.group_id] ? e.planEx.group_id : null,
          lastDone: prevByKey[e.key]?.[0]?.date ?? null,
          sets: buildSets(e.planEx, loggedByKey[e.key] || [], prevByKey[e.key]?.[0]?.sets || []),
        }))
        const g = {}
        for (const ex of built) {
          if (!ex.groupId) continue
          ;(g[ex.groupId] ||= { group: planGroups[ex.groupId].group, keys: [] }).keys.push(ex.key)
        }
        setExercises(built)
        setGroups(g)
        setPicked(initialPicks(g, built))
      })
    return () => { alive = false }
    // only on mount: later plan edits shouldn't reset an in-progress workout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  // Pre-select per group: anything already logged this session, then the
  // least recently done alternatives (never done counts as oldest).
  function initialPicks(g, built) {
    const byKey = Object.fromEntries(built.map(e => [e.key, e]))
    const out = {}
    for (const [id, { group, keys }] of Object.entries(g)) {
      const limit = pickLimit(group, keys.length)
      const logged = keys.filter(k => byKey[k].sets.some(s => s.saved))
      const rest = keys
        .filter(k => !logged.includes(k))
        .sort((a, b) => {
          const da = byKey[a].lastDone ? new Date(byKey[a].lastDone).getTime() : 0
          const db = byKey[b].lastDone ? new Date(byKey[b].lastDone).getTime() : 0
          return da - db // stable sort keeps plan order on ties
        })
      out[id] = [...logged, ...rest].slice(0, Math.max(limit, logged.length))
    }
    return out
  }

  const hasDone = ex => ex.sets.some(s => s.done)

  // Tap a tab: select it; if over the limit, drop the earliest pick that has no ticked sets.
  function pick(groupId, key) {
    const { group, keys } = groups[groupId]
    const limit = pickLimit(group, keys.length)
    setPicked(p => {
      const cur = p[groupId] || []
      if (cur.includes(key)) {
        // in "choose" mode a second tap un-picks (unless it has ticked sets)
        const ex = exercises.find(e => e.key === key)
        if (limit > 1 && cur.length > 1 && !hasDone(ex)) return { ...p, [groupId]: cur.filter(k => k !== key) }
        return p
      }
      let next = [...cur, key]
      while (next.length > limit) {
        const drop = next.find(k => k !== key && !hasDone(exercises.find(e => e.key === k)))
        if (!drop) break // everything else already has ticked sets: keep them all
        next = next.filter(k => k !== drop)
      }
      return { ...p, [groupId]: next }
    })
  }

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

  // Plan order; a group is drawn once, where its first member is.
  function renderItems() {
    if (!exercises) return []
    const drawn = new Set()
    const items = []
    for (const ex of exercises) {
      if (!ex.groupId || !groups[ex.groupId]) items.push({ type: 'ex', ex })
      else if (!drawn.has(ex.groupId)) {
        drawn.add(ex.groupId)
        items.push({ type: 'group', id: ex.groupId, ...groups[ex.groupId] })
      }
    }
    return items
  }

  function renderExercise(ex) {
    return (
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
    )
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

      {renderItems().map(item => item.type === 'group' ? (
        <div key={`g-${item.id}`} className="log-group">
          <div className="log-group-head">
            <span className="grp-tag">⇄ {groupSummary(item.group, item.keys.length)}</span>
            {item.group.label && <span className="grp-name">{item.group.label}</span>}
          </div>
          <div className="log-tabs" role="tablist">
            {item.keys.map(k => {
              const ex = exercises.find(e => e.key === k)
              const on = (picked[item.id] || []).includes(k)
              return (
                <button key={k} role="tab" aria-selected={on}
                  className={`log-tab ${on ? 'active' : ''}`}
                  onClick={() => pick(item.id, k)}>
                  {ex.name}{hasDone(ex) ? ' ✓' : ''}
                </button>
              )
            })}
          </div>
          {item.keys
            .map(k => exercises.find(e => e.key === k))
            .filter(ex => (picked[item.id] || []).includes(ex.key) || hasDone(ex))
            .map(renderExercise)}
        </div>
      ) : renderExercise(item.ex))}

      {historyFor && (
        <HistorySheet userId={userId} name={historyFor} unit={unit} onClose={() => setHistoryFor(null)} />
      )}
    </div>
  )
}

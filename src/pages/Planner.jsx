import { useEffect, useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useAuth } from '../lib/useAuth'
import { DAY_COLORS, STARTER_TEMPLATE, useExerciseLibrary, searchExercises } from '../lib/library'
import { dayGroups } from '../lib/groups'
import { useShowMore } from '../lib/useShowMore'
import * as data from '../lib/data'
import DayCard from '../components/DayCard'
import LibraryItem from '../components/LibraryItem'
import AddExerciseSheet from '../components/AddExerciseSheet'
import SessionView from '../components/SessionView'
import HistorySheet from '../components/HistorySheet'
import GroupSheet from '../components/GroupSheet'
import CopySheet from '../components/CopySheet'
import Welcome from '../components/Welcome'

export default function Planner() {
  const { user, signOut } = useAuth()
  const [workout, setWorkout] = useState(null)
  const [workouts, setWorkouts] = useState([]) // all plans (rows only, for the switcher)
  const [switching, setSwitching] = useState(false)
  const [newPlanName, setNewPlanName] = useState(null) // null = form closed
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeName, setActiveName] = useState(null)
  const [sheetDay, setSheetDay] = useState(null)
  const [unit, setUnit] = useState('kg')
  const [session, setSession] = useState(null) // in-progress workout, if any
  const [historyFor, setHistoryFor] = useState(null)
  const [prs, setPrs] = useState({}) // { [exerciseKey]: PR rows }
  const [groupEdit, setGroupEdit] = useState(null) // { dayId, exId }
  const [copyEx, setCopyEx] = useState(null) // { dayId, exId }
  const library = useExerciseLibrary()
  const filtered = searchExercises(library.list, search)
  // rendering ~900 draggables at once is sluggish, so load more as you scroll
  const { shown, hasMore, showMore, sentinelRef } = useShowMore(filtered, 100, search)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  )

  useEffect(() => {
    if (!user) return
    let alive = true
    ;(async () => {
      try {
        const [list, profile, active] = await Promise.all([
          data.listOrCreateWorkouts(user.id),
          // profile + session failures must never block the planner
          data.loadProfile(user.id).catch(e => {
            console.error('load profile failed', e)
            return { unit: 'kg', active_workout_id: null }
          }),
          data.loadActiveSession(user.id).catch(e => {
            console.error('load active session failed', e)
            return null
          }),
        ])
        if (!alive) return
        setUnit(profile.unit)

        // open the last-used plan — or, when resuming a workout, the plan it came from
        let targetId = profile.active_workout_id
        if (active?.day_id) {
          const wid = await data.workoutIdForDay(active.day_id).catch(() => null)
          if (wid) targetId = wid
        }
        const row = list.find(w => w.id === targetId) || list[0]
        const w = await data.loadWorkout(row)
        if (!alive) return
        setWorkouts(list)
        setWorkout(w)
        setSession(active) // resume a workout left unfinished (reload, closed tab…)
      } catch (e) {
        console.error(e)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    refreshPRs()
    return () => { alive = false }
  }, [user])

  // ---------- multiple plans ----------

  async function switchWorkout(id) {
    if (id === workout?.id) return
    const row = workouts.find(w => w.id === id)
    if (!row) return
    setSwitching(true)
    try {
      const w = await data.loadWorkout(row)
      setWorkout(w)
      setSheetDay(null); setHistoryFor(null); setGroupEdit(null); setCopyEx(null)
      data.saveActiveWorkout(user.id, id).catch(e => console.error('save active plan failed', e))
    } catch (e) {
      console.error(e)
      window.alert(`Couldn't open that plan: ${e?.message || e}`)
    } finally {
      setSwitching(false)
    }
  }

  async function newWorkout(e) {
    e?.preventDefault()
    const name = (newPlanName || '').trim()
    if (!name) return
    try {
      const row = await data.createWorkout(user.id, name)
      setWorkouts(list => [...list, row])
      setWorkout({ ...row, days: [] })
      setNewPlanName(null)
      data.saveActiveWorkout(user.id, row.id).catch(e => console.error('save active plan failed', e))
    } catch (e) {
      console.error(e)
      window.alert(`Couldn't create the plan: ${e?.message || e}`)
    }
  }

  async function deleteCurrentWorkout() {
    if (workouts.length <= 1) return
    const ok = window.confirm(
      `Delete "${workout.name || 'this plan'}"? Its days and exercises will be removed.\n` +
      'Your logged workouts, history and PRs are kept.'
    )
    if (!ok) return
    try {
      await data.deleteWorkout(workout.id)
      const rest = workouts.filter(w => w.id !== workout.id)
      setWorkouts(rest)
      setWorkout(await data.loadWorkout(rest[0]))
      data.saveActiveWorkout(user.id, rest[0].id).catch(e => console.error('save active plan failed', e))
    } catch (e) {
      console.error(e)
      window.alert(`Couldn't delete the plan: ${e?.message || e}`)
    }
  }

  function refreshPRs() {
    if (!user) return
    data.loadPRs(user.id)
      .then(setPrs)
      .catch(e => console.error('load PRs failed', e))
  }

  if (loading) return <div className="center-msg">Loading…</div>
  if (!workout) return <div className="center-msg">Something went wrong.</div>

  if (session) {
    return (
      <div className="app app-session">
        <SessionView
          session={session}
          day={workout.days.find(d => d.id === session.day_id)}
          userId={user.id}
          unit={unit}
          prs={prs}
          onExit={() => { setSession(null); refreshPRs() }}
        />
      </div>
    )
  }

  async function startWorkout(day) {
    try {
      setSession(await data.startSession(user.id, day))
    } catch (e) {
      console.error('start session failed', e)
      window.alert(`Couldn't start the workout: ${e?.message || e}`)
    }
  }


  async function addExerciseToDay(dayId, name) {
    const day = workout.days.find(d => d.id === dayId)
    if (!day) return
    const position = day.exercises.length
    const ex = await data.addExercise(dayId, name, position)
    setWorkout(w => ({
      ...w,
      days: w.days.map(d => d.id === dayId ? { ...d, exercises: [...d.exercises, ex] } : d),
    }))
  }

  // Find which day an exercise id belongs to
  function findDayOfExercise(exId) {
    return workout.days.find(d => d.exercises.some(e => e.id === exId))
  }

  async function handleDragEnd(event) {
    setActiveName(null)
    const { active, over } = event
    if (!over) return

    const activeId = String(active.id)

    // Case 1: dragging from the library into a day (id starts with "lib-")
    if (activeId.startsWith('lib-')) {
      const name = active.data.current?.name
      const overId = String(over.id)
      // dropped on a day container, or on an exercise inside a day
      let dayId = overId.startsWith('day-') ? overId.replace('day-', '') : null
      if (!dayId) {
        const day = findDayOfExercise(overId)
        dayId = day?.id
      }
      if (name && dayId) await addExerciseToDay(dayId, name)
      return
    }

    // Case 2: reordering exercises within the same day
    const fromDay = findDayOfExercise(activeId)
    const toDay = findDayOfExercise(String(over.id)) ||
                  (String(over.id).startsWith('day-')
                    ? workout.days.find(d => d.id === String(over.id).replace('day-', ''))
                    : null)
    if (!fromDay || !toDay || fromDay.id !== toDay.id) return // only same-day reorder for now

    const oldIndex = fromDay.exercises.findIndex(e => e.id === activeId)
    const newIndex = fromDay.exercises.findIndex(e => e.id === String(over.id))
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

    const newExercises = arrayMove(fromDay.exercises, oldIndex, newIndex)
    // optimistic UI update
    setWorkout(w => ({
      ...w,
      days: w.days.map(d => d.id === fromDay.id ? { ...d, exercises: newExercises } : d),
    }))
    // persist
    try {
      await data.reorderExercises(newExercises.map(e => e.id))
    } catch (err) {
      console.error('reorder failed', err)
    }
  }

  async function addDay() {
    const color = DAY_COLORS[workout.days.length % DAY_COLORS.length]
    const day = await data.addDay(workout.id, workout.days.length, color)
    setWorkout(w => ({ ...w, days: [...w.days, day] }))
  }

  // Copy a day (exercises + alternative groups) to the end of the plan.
  async function duplicateDay(dayId) {
    const day = workout.days.find(d => d.id === dayId)
    if (!day) return
    const groups = Object.values(dayGroups(day)).map(g => g.group) // only real (2+ member) groups
    const copy = await data.createDayWithExercises(
      workout.id,
      workout.days.length,
      {
        label: day.label,
        title: `${day.title} (copy)`,
        color: DAY_COLORS[workout.days.length % DAY_COLORS.length],
      },
      day.exercises,
      groups,
    )
    setWorkout(w => ({ ...w, days: [...w.days, copy] }))
  }

  async function copyExerciseTo(exId, fromDayId, toDayId) {
    const from = workout.days.find(d => d.id === fromDayId)
    const ex = from?.exercises.find(e => e.id === exId)
    const to = workout.days.find(d => d.id === toDayId)
    if (!ex || !to) return
    const copy = await data.copyExercise(ex, toDayId, to.exercises.length)
    setWorkout(w => ({
      ...w,
      days: w.days.map(d => d.id === toDayId ? { ...d, exercises: [...d.exercises, copy] } : d),
    }))
  }

  // Empty-plan welcome: create the starter Push / Pull / Legs days.
  async function applyTemplate() {
    try {
      const created = []
      for (const [i, t] of STARTER_TEMPLATE.entries()) {
        created.push(await data.createDayWithExercises(
          workout.id,
          workout.days.length + i,
          { label: t.label, title: t.title, color: DAY_COLORS[(workout.days.length + i) % DAY_COLORS.length] },
          t.exercises,
        ))
      }
      setWorkout(w => ({ ...w, days: [...w.days, ...created] }))
    } catch (e) {
      console.error('template failed', e)
      window.alert(`Couldn't set up the template: ${e?.message || e}`)
    }
  }

  async function updateDay(id, fields) {
    await data.updateDay(id, fields)
    setWorkout(w => ({ ...w, days: w.days.map(d => d.id === id ? { ...d, ...fields } : d) }))
  }

  async function removeDay(id) {
    await data.removeDay(id)
    setWorkout(w => ({ ...w, days: w.days.filter(d => d.id !== id) }))
  }

  async function updateEx(id, fields) {
    await data.updateExercise(id, fields)
    setWorkout(w => ({
      ...w,
      days: w.days.map(d => ({
        ...d, exercises: d.exercises.map(e => e.id === id ? { ...e, ...fields } : e),
      })),
    }))
  }

  async function removeEx(id) {
    const day = findDayOfExercise(id)
    const ex = day?.exercises.find(e => e.id === id)
    await data.removeExercise(id)
    // a group left with a single member isn't a group any more
    let dropGroup = null
    if (ex?.group_id && day.exercises.filter(e => e.group_id === ex.group_id).length <= 2) {
      dropGroup = ex.group_id
      await data.deleteGroup(dropGroup).catch(e => console.error('delete group failed', e))
    }
    setWorkout(w => ({
      ...w,
      days: w.days.map(d => ({
        ...d,
        groups: (d.groups || []).filter(g => g.id !== dropGroup),
        exercises: d.exercises
          .filter(e => e.id !== id)
          .map(e => (dropGroup && e.group_id === dropGroup ? { ...e, group_id: null } : e)),
      })),
    }))
  }

  // Create / update / dissolve an alternatives group on a day.
  async function saveGroup(dayId, { groupId, memberIds, label, mode, pick_count }) {
    const day = workout.days.find(d => d.id === dayId)
    if (!day) return

    if (memberIds.length < 2) {
      if (groupId) await data.deleteGroup(groupId) // members are cleared by the FK
      setWorkout(w => ({
        ...w,
        days: w.days.map(d => d.id !== dayId ? d : {
          ...d,
          groups: (d.groups || []).filter(g => g.id !== groupId),
          exercises: d.exercises.map(e => (e.group_id === groupId ? { ...e, group_id: null } : e)),
        }),
      }))
      return
    }

    const fields = { label, mode, pick_count }
    let group
    if (groupId) {
      await data.updateGroup(groupId, fields)
      group = { ...day.groups.find(g => g.id === groupId), ...fields }
    } else {
      group = await data.createGroup(dayId, fields)
    }

    const wanted = new Set(memberIds)
    const before = day.exercises.filter(e => e.group_id === group.id).map(e => e.id)
    const removed = before.filter(id => !wanted.has(id))
    const added = memberIds.filter(id => !before.includes(id))
    await data.setExercisesGroup(removed, null)
    await data.setExercisesGroup(added, group.id)

    setWorkout(w => ({
      ...w,
      days: w.days.map(d => d.id !== dayId ? d : {
        ...d,
        groups: [...(d.groups || []).filter(g => g.id !== group.id), group],
        exercises: d.exercises.map(e =>
          wanted.has(e.id) ? { ...e, group_id: group.id }
            : e.group_id === group.id ? { ...e, group_id: null } : e),
      }),
    }))
  }

  async function changeUnit(next) {
    if (next === unit) return
    const prev = unit
    setUnit(next) // optimistic
    try {
      await data.saveUnit(user.id, next)
    } catch (err) {
      console.error('save unit failed', err)
      setUnit(prev)
    }
  }

  async function renameWorkout(name) {
    if (name === workout.name) return
    await data.renameWorkout(workout.id, name)
    setWorkout(w => ({ ...w, name }))
    setWorkouts(list => list.map(w => (w.id === workout.id ? { ...w, name } : w)))
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={e => setActiveName(e.active.data.current?.name)}
      onDragEnd={handleDragEnd}
    >
      <div className="app">
        <aside className="sidebar">
          <div className="sidebar-title">Exercise library</div>
          <input className="search" placeholder="Search…"
            value={search} onChange={e => setSearch(e.target.value)} />
          <div className="lib-list">
            {shown.map(e => <LibraryItem key={e.name} name={e.name} />)}
            {filtered.length === 0 && (
              <div className="lib-note">No match — type it into a day card as a custom exercise.</div>
            )}
            {hasMore && (
              <button ref={sentinelRef} className="lib-more" onClick={showMore}>
                Showing {shown.length} of {filtered.length} — load more
              </button>
            )}
          </div>
          {library.status === 'loading' && <div className="lib-note">Loading exercises…</div>}
          {library.status === 'offline' && (
            <div className="lib-note">Exercise database unreachable — showing a basic list.</div>
          )}
          <div className="lib-credit">
            Exercises from <a href="https://wger.de" target="_blank" rel="noreferrer">wger</a> (CC-BY-SA)
          </div>
        </aside>

        <main className="main">
          <div className="topbar">
            <select className="plan-select" value={workout.id} disabled={switching}
              aria-label="Switch plan"
              onChange={e => (e.target.value === '__new' ? setNewPlanName('') : switchWorkout(e.target.value))}>
              {workouts.map(w => <option key={w.id} value={w.id}>{w.name || 'Untitled plan'}</option>)}
              <option value="__new">+ New plan…</option>
            </select>
            {newPlanName !== null && (
              <form className="new-plan" onSubmit={newWorkout}>
                <input autoFocus className="new-plan-input" placeholder="New plan name, e.g. Upper/Lower"
                  value={newPlanName} onChange={e => setNewPlanName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setNewPlanName(null) }} />
                <button type="submit" className="btn" disabled={!newPlanName.trim()}>Create</button>
                <button type="button" className="btn-ghost" onClick={() => setNewPlanName(null)}>Cancel</button>
              </form>
            )}
            {/* key resets the uncontrolled input when switching plans */}
            <input key={workout.id} className="workout-name" defaultValue={workout.name}
              aria-label="Plan name" title="Rename this plan"
              onBlur={e => renameWorkout(e.target.value)} />
            <div className="topbar-actions">
              <div className="unit-toggle" role="group" aria-label="Weight unit">
                {['kg', 'lb'].map(u => (
                  <button key={u} type="button"
                    className={unit === u ? 'active' : ''}
                    aria-pressed={unit === u}
                    onClick={() => changeUnit(u)}>{u}</button>
                ))}
              </div>
              <button onClick={addDay} className="btn">+ Add day</button>
              {workouts.length > 1 && (
                <button onClick={deleteCurrentWorkout} className="btn-ghost btn-del-plan">Delete plan</button>
              )}
              <button onClick={signOut} className="btn-ghost">Sign out</button>
            </div>
          </div>

          {workout.days.length === 0 && (
            <Welcome
              isFirstPlan={workouts.length <= 1}
              onAddDay={addDay}
              onUseTemplate={applyTemplate}
            />
          )}

          <div className="days-grid">
            {workout.days.map(day => (
              <DayCard
                key={day.id}
                day={day}
                unit={unit}
                prs={prs}
                onUpdateDay={updateDay}
                onRemoveDay={removeDay}
                onUpdateEx={updateEx}
                onRemoveEx={removeEx}
                onAddClick={setSheetDay}
                onAddCustom={addExerciseToDay}
                onStart={startWorkout}
                onHistory={setHistoryFor}
                onGroup={(d, ex) => setGroupEdit({ dayId: d.id, exId: ex.id })}
                onCopyEx={(d, ex) => setCopyEx({ dayId: d.id, exId: ex.id })}
                onDuplicate={duplicateDay}
              />
            ))}
          </div>
        </main>
      </div>

      <DragOverlay>
        {activeName ? <div className="lib-item dragging">{activeName}</div> : null}
      </DragOverlay>

      {copyEx && (() => {
        const d = workout.days.find(x => x.id === copyEx.dayId)
        const ex = d?.exercises.find(x => x.id === copyEx.exId)
        if (!ex) return null
        return (
          <CopySheet ex={ex} days={workout.days} fromDayId={d.id}
            onCopy={toDayId => copyExerciseTo(ex.id, d.id, toDayId)}
            onClose={() => setCopyEx(null)} />
        )
      })()}

      {groupEdit && (() => {
        const d = workout.days.find(x => x.id === groupEdit.dayId)
        const ex = d?.exercises.find(x => x.id === groupEdit.exId)
        if (!d || !ex) return null
        return (
          <GroupSheet day={d} ex={ex}
            onSave={g => saveGroup(d.id, g)}
            onClose={() => setGroupEdit(null)} />
        )
      })()}

      {historyFor && (
        <HistorySheet userId={user.id} name={historyFor} unit={unit} onClose={() => setHistoryFor(null)} />
      )}

      {sheetDay && (
        <AddExerciseSheet
          dayTitle={sheetDay.title}
          library={library.list}
          onPick={name => addExerciseToDay(sheetDay.id, name)}
          onClose={() => setSheetDay(null)}
        />
      )}
    </DndContext>
  )
}
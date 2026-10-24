import { useEffect, useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useAuth } from '../lib/useAuth'
import { DAY_COLORS, useExerciseLibrary, searchExercises } from '../lib/library'
import { useShowMore } from '../lib/useShowMore'
import * as data from '../lib/data'
import DayCard from '../components/DayCard'
import LibraryItem from '../components/LibraryItem'
import AddExerciseSheet from '../components/AddExerciseSheet'
import SessionView from '../components/SessionView'
import HistorySheet from '../components/HistorySheet'

export default function Planner() {
  const { user, signOut } = useAuth()
  const [workout, setWorkout] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeName, setActiveName] = useState(null)
  const [sheetDay, setSheetDay] = useState(null)
  const [unit, setUnit] = useState('kg')
  const [session, setSession] = useState(null) // in-progress workout, if any
  const [historyFor, setHistoryFor] = useState(null)
  const [prs, setPrs] = useState({}) // { [exerciseKey]: PR rows }
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
    data.loadOrCreateWorkout(user.id)
      .then(w => setWorkout(w))
      .catch(e => console.error(e))
      .finally(() => setLoading(false))
    // unit preference loads separately so a failure here never blocks the planner
    data.loadUnit(user.id)
      .then(u => setUnit(u))
      .catch(e => console.error('load unit failed', e))
    // resume a workout left unfinished (reload, closed tab…)
    data.loadActiveSession(user.id)
      .then(s => setSession(s))
      .catch(e => console.error('load active session failed', e))
    refreshPRs()
  }, [user])

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
    await data.removeExercise(id)
    setWorkout(w => ({
      ...w,
      days: w.days.map(d => ({ ...d, exercises: d.exercises.filter(e => e.id !== id) })),
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
    await data.renameWorkout(workout.id, name)
    setWorkout(w => ({ ...w, name }))
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
            <input className="workout-name" defaultValue={workout.name}
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
              <button onClick={signOut} className="btn-ghost">Sign out</button>
            </div>
          </div>

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
              />
            ))}
          </div>
        </main>
      </div>

      <DragOverlay>
        {activeName ? <div className="lib-item dragging">{activeName}</div> : null}
      </DragOverlay>

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
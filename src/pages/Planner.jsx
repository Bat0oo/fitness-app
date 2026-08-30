import { useEffect, useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useAuth } from '../lib/useAuth'
import { EXERCISE_LIBRARY, DAY_COLORS } from '../lib/library'
import * as data from '../lib/data'
import DayCard from '../components/DayCard'
import LibraryItem from '../components/LibraryItem'

export default function Planner() {
  const { user, signOut } = useAuth()
  const [workout, setWorkout] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeName, setActiveName] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  )

  useEffect(() => {
    if (!user) return
    data.loadOrCreateWorkout(user.id)
      .then(w => setWorkout(w))
      .catch(e => console.error(e))
      .finally(() => setLoading(false))
  }, [user])

  if (loading) return <div className="center-msg">Loading…</div>
  if (!workout) return <div className="center-msg">Something went wrong.</div>

  const filtered = EXERCISE_LIBRARY.filter(
    e => !search || e.name.toLowerCase().includes(search.toLowerCase())
  )

  // ---- handlers ----
  async function handleDragEnd(event) {
    setActiveName(null)
    const { active, over } = event
    if (!over) return
    const name = active.data.current?.name
    const dayId = String(over.id).replace('day-', '')
    if (!name || !dayId) return

    const day = workout.days.find(d => d.id === dayId)
    if (!day) return
    const position = day.exercises.length
    const ex = await data.addExercise(dayId, name, position)

    setWorkout(w => ({
      ...w,
      days: w.days.map(d => d.id === dayId ? { ...d, exercises: [...d.exercises, ex] } : d),
    }))
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
        ...d,
        exercises: d.exercises.map(e => e.id === id ? { ...e, ...fields } : e),
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
          <input
            className="search"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="lib-list">
            {filtered.map(e => <LibraryItem key={e.name} name={e.name} />)}
          </div>
        </aside>

        <main className="main">
          <div className="topbar">
            <input
              className="workout-name"
              defaultValue={workout.name}
              onBlur={e => renameWorkout(e.target.value)}
            />
            <div className="topbar-actions">
              <button onClick={addDay} className="btn">+ Add day</button>
              <button onClick={signOut} className="btn-ghost">Sign out</button>
            </div>
          </div>

          <div className="days-grid">
            {workout.days.map(day => (
              <DayCard
                key={day.id}
                day={day}
                onUpdateDay={updateDay}
                onRemoveDay={removeDay}
                onUpdateEx={updateEx}
                onRemoveEx={removeEx}
              />
            ))}
          </div>
        </main>
      </div>

      <DragOverlay>
        {activeName ? <div className="lib-item dragging">{activeName}</div> : null}
      </DragOverlay>
    </DndContext>
  )
}

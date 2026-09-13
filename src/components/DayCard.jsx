import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import SortableExerciseRow from './SortableExerciseRow'

export default function DayCard({
  day, onUpdateDay, onRemoveDay, onUpdateEx, onRemoveEx, onAddClick, onAddCustom,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${day.id}` })
  const [custom, setCustom] = useState('')

  function submitCustom(e) {
    e.preventDefault()
    const name = custom.trim()
    if (!name) return
    onAddCustom(day.id, name)
    setCustom('')
  }

  return (
    <div className="day-card">
      <div className="day-head" style={{ background: day.color }}>
        <input className="day-label-input" defaultValue={day.label}
          onBlur={e => onUpdateDay(day.id, { label: e.target.value })} />
        <input className="day-title-input" defaultValue={day.title}
          onBlur={e => onUpdateDay(day.id, { title: e.target.value })} />
      </div>

      <div ref={setNodeRef} className={`day-list ${isOver ? 'over' : ''}`}>
        {day.exercises.length === 0 && <div className="day-empty">No exercises yet</div>}
        <SortableContext
          items={day.exercises.map(e => e.id)}
          strategy={verticalListSortingStrategy}
        >
          {day.exercises.map(ex => (
            <SortableExerciseRow
              key={ex.id}
              ex={ex}
              onChange={fields => onUpdateEx(ex.id, fields)}
              onRemove={() => onRemoveEx(ex.id)}
            />
          ))}
        </SortableContext>
      </div>

      <div className="day-foot">
        {/* type your own exercise */}
        <form onSubmit={submitCustom} className="custom-ex">
          <input
            className="custom-ex-input"
            placeholder="+ Type your own exercise"
            value={custom}
            onChange={e => setCustom(e.target.value)}
          />
          {custom.trim() && <button type="submit" className="custom-ex-add">Add</button>}
        </form>

        {/* mobile: pick from library (hidden on desktop via CSS) */}
        <button className="btn-add-ex" onClick={() => onAddClick(day)}>+ Add from library</button>

        <button className="btn-danger-ghost" onClick={() => onRemoveDay(day.id)}>Remove day</button>
      </div>
    </div>
  )
}
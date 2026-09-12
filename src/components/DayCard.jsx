import { useDroppable } from '@dnd-kit/core'
import ExerciseRow from './ExerciseRow'

export default function DayCard({ day, onUpdateDay, onRemoveDay, onUpdateEx, onRemoveEx, onAddClick }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${day.id}` })

  return (
    <div className="day-card">
      <div className="day-head" style={{ background: day.color }}>
        <input
          className="day-label-input"
          defaultValue={day.label}
          onBlur={e => onUpdateDay(day.id, { label: e.target.value })}
        />
        <input
          className="day-title-input"
          defaultValue={day.title}
          onBlur={e => onUpdateDay(day.id, { title: e.target.value })}
        />
      </div>

      <div ref={setNodeRef} className={`day-list ${isOver ? 'over' : ''}`}>
        {day.exercises.length === 0 && <div className="day-empty">No exercises yet</div>}
        {day.exercises.map(ex => (
          <ExerciseRow
            key={ex.id}
            ex={ex}
            onChange={fields => onUpdateEx(ex.id, fields)}
            onRemove={() => onRemoveEx(ex.id)}
          />
        ))}
      </div>

      <div className="day-foot">
        <button className="btn-add-ex" onClick={() => onAddClick(day)}>+ Add exercise</button>
        <button className="btn-danger-ghost" onClick={() => onRemoveDay(day.id)}>Remove day</button>
      </div>
    </div>
  )
}
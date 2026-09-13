import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// A single exercise line that can be dragged up/down to reorder within its day.
export default function SortableExerciseRow({ ex, onChange, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: ex.id })

  const [sets, setSets] = useState(ex.sets)
  const [reps, setReps] = useState(ex.reps)
  const [kg, setKg] = useState(ex.kg ?? '')

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="ex-row">
      {/* drag handle — only this grabs, so the inputs stay tappable */}
      <button className="drag-handle" {...attributes} {...listeners} aria-label="Drag to reorder">
        ⋮⋮
      </button>

      <div className="ex-left">
        <div className="ex-name">{ex.name}</div>
        <div className="ex-detail">
          <input className="mini" value={sets}
            onChange={e => setSets(e.target.value)}
            onBlur={() => onChange({ sets: parseInt(sets) || 0 })} />
          <span>×</span>
          <input className="mini wide" value={reps}
            onChange={e => setReps(e.target.value)}
            onBlur={() => onChange({ reps })} />
          <span>·</span>
          <input className="mini" placeholder="kg" value={kg}
            onChange={e => setKg(e.target.value)}
            onBlur={() => onChange({ kg })} />
        </div>
      </div>

      <button className="icon-btn" onClick={onRemove} aria-label="Remove exercise">✕</button>
    </div>
  )
}
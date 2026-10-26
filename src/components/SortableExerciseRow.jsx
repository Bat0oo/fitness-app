import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { formatWeight } from '../lib/pr'

// A single exercise line that can be dragged up/down to reorder within its day.
export default function SortableExerciseRow({ ex, unit = 'kg', record, onChange, onRemove, onHistory, onGroup, onCopy }) {
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
        {/* name + PR badge + small actions share the top line, so the
            number inputs below get the full row width */}
        <div className="ex-top">
          <span className="ex-name" title={ex.name}>{ex.name}</span>
          {record && (
            <span className="pr-badge" title={record.e1rm ? `Est. 1RM ${formatWeight(record.e1rm)} ${record.unit}` : undefined}>
              PR {formatWeight(record.weight)} {record.unit}
            </span>
          )}
          <div className="ex-actions">
            {onGroup && (
              <button className="icon-btn icon-group" onClick={onGroup}
                aria-label={`Alternatives for ${ex.name}`} title="Alternatives (this OR that)">⇄</button>
            )}
            {onCopy && (
              <button className="icon-btn icon-copy" onClick={onCopy}
                aria-label={`Copy ${ex.name}`} title="Copy to a day">⧉</button>
            )}
            {onHistory && (
              <button className="icon-btn icon-history" onClick={onHistory}
                aria-label={`History for ${ex.name}`} title="History">↺</button>
            )}
            <button className="icon-btn" onClick={onRemove} aria-label="Remove exercise">✕</button>
          </div>
        </div>
        <div className="ex-detail">
          <input className="mini" value={sets}
            onChange={e => setSets(e.target.value)}
            onBlur={() => onChange({ sets: parseInt(sets) || 0 })} />
          <span>×</span>
          <input className="mini wide" value={reps}
            onChange={e => setReps(e.target.value)}
            onBlur={() => onChange({ reps })} />
          <span>·</span>
          <input className="mini" placeholder="—" inputMode="decimal" value={kg}
            aria-label={`Weight in ${unit}`}
            onChange={e => setKg(e.target.value)}
            onBlur={() => onChange({ kg })} />
          <span className="unit-label">{unit}</span>
        </div>
      </div>
    </div>
  )
}
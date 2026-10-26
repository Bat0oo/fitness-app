import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import SortableExerciseRow from './SortableExerciseRow'
import { exerciseKey } from '../lib/data'
import { bestRecord } from '../lib/pr'
import { dayGroups, groupSummary } from '../lib/groups'

export default function DayCard({
  day, unit = 'kg', prs = {}, onUpdateDay, onRemoveDay, onUpdateEx, onRemoveEx, onAddClick, onAddCustom, onStart, onHistory, onGroup,
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

  // Plan order, but a group's members are drawn together in one box,
  // at the position of the group's first member.
  function renderItems() {
    const groups = dayGroups(day)
    const drawn = new Set()
    const items = []
    for (const ex of day.exercises) {
      const g = ex.group_id && groups[ex.group_id]
      if (!g) items.push({ type: 'ex', ex })
      else if (!drawn.has(g.group.id)) {
        drawn.add(g.group.id)
        items.push({ type: 'group', ...g })
      }
    }
    return items
  }

  function renderRow(ex) {
    return (
      <SortableExerciseRow
        key={ex.id}
        ex={ex}
        unit={unit}
        record={bestRecord(prs[exerciseKey(ex.name)], unit)}
        onChange={fields => onUpdateEx(ex.id, fields)}
        onRemove={() => onRemoveEx(ex.id)}
        onHistory={() => onHistory?.(ex.name)}
        onGroup={day.exercises.length > 1 ? () => onGroup?.(day, ex) : undefined}
      />
    )
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
          {renderItems().map(item => item.type === 'group' ? (
            <div key={`g-${item.group.id}`} className="grp-box">
              <button className="grp-head" onClick={() => onGroup?.(day, item.members[0])}>
                <span className="grp-tag">⇄ {groupSummary(item.group, item.members.length)}</span>
                {item.group.label && <span className="grp-name">{item.group.label}</span>}
                <span className="grp-edit">Edit</span>
              </button>
              {item.members.map(renderRow)}
            </div>
          ) : renderRow(item.ex))}
        </SortableContext>
      </div>

      <div className="day-foot">
        {day.exercises.length > 0 && (
          <button className="btn-start" onClick={() => onStart(day)}>▶ Start workout</button>
        )}

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
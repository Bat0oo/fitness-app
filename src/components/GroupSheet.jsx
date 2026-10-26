import { useState } from 'react'
import { dayGroups } from '../lib/groups'

// Bottom sheet to create / edit the alternatives group that `ex` belongs to.
// onSave({ groupId, memberIds, label, mode, pick_count }) — memberIds < 2 means "ungroup".
export default function GroupSheet({ day, ex, onSave, onClose }) {
  const groups = dayGroups(day)
  const current = ex.group_id && groups[ex.group_id] ? groups[ex.group_id] : null
  const group = current?.group

  // candidates: this exercise, members of its group, and ungrouped exercises
  const candidates = day.exercises.filter(e =>
    e.id === ex.id || !e.group_id || !groups[e.group_id] || e.group_id === ex.group_id
  )

  const [members, setMembers] = useState(() =>
    new Set(current ? current.members.map(m => m.id) : [ex.id])
  )
  const [label, setLabel] = useState(group?.label ?? '')
  const [mode, setMode] = useState(group?.mode ?? 'rotate')
  const [pick, setPick] = useState(group?.pick_count ?? 1)
  const [saving, setSaving] = useState(false)

  function toggle(id) {
    if (id === ex.id) return
    setMembers(s => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function save(memberIds) {
    setSaving(true)
    try {
      await onSave({
        groupId: group?.id ?? null,
        memberIds,
        label: label.trim(),
        mode,
        pick_count: mode === 'choose' ? Math.max(1, Math.min(pick, memberIds.length - 1 || 1)) : 1,
      })
      onClose()
    } catch (e) {
      console.error('save group failed', e)
      window.alert(`Couldn't save the group: ${e?.message || e}`)
      setSaving(false)
    }
  }

  const count = members.size
  const maxPick = Math.max(1, count - 1) // picking all of them isn't "alternatives"

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <div className="sheet-title">{group ? 'Edit alternatives' : 'Make alternatives'}</div>
          <button className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="sheet-list">
          <p className="grp-help">
            Tick the exercises that are alternatives to <b>{ex.name}</b>. You'll do one of them
            (or a few) per workout instead of all.
          </p>

          {candidates.length < 2 && (
            <div className="sheet-empty">Add another exercise to this day first.</div>
          )}

          {candidates.map(c => (
            <label key={c.id} className={`grp-option ${c.id === ex.id ? 'locked' : ''}`}>
              <input type="checkbox" checked={members.has(c.id)}
                disabled={c.id === ex.id} onChange={() => toggle(c.id)} />
              <span>{c.name}</span>
            </label>
          ))}

          {count >= 2 && (
            <div className="grp-settings">
              <input className="grp-label" placeholder="Label (optional), e.g. Chest fly"
                value={label} onChange={e => setLabel(e.target.value)} />

              <div className="unit-toggle grp-mode" role="group" aria-label="Group mode">
                <button type="button" className={mode === 'rotate' ? 'active' : ''}
                  onClick={() => setMode('rotate')}>Rotate</button>
                <button type="button" className={mode === 'choose' ? 'active' : ''}
                  onClick={() => setMode('choose')}>Choose</button>
              </div>
              <p className="grp-help">
                {mode === 'rotate'
                  ? 'Each workout suggests the one you did least recently — you can still switch.'
                  : 'Each workout, pick which to do. The least recently done are pre-selected.'}
              </p>

              {mode === 'choose' && (
                <label className="grp-pick">
                  Pick
                  <select value={Math.min(pick, maxPick)} onChange={e => setPick(Number(e.target.value))}>
                    {Array.from({ length: maxPick }, (_, i) => i + 1).map(n =>
                      <option key={n} value={n}>{n}</option>)}
                  </select>
                  of {count}
                </label>
              )}
            </div>
          )}
        </div>

        <div className="grp-actions">
          {group && (
            <button className="btn-danger-ghost" disabled={saving} onClick={() => save([])}>
              Ungroup
            </button>
          )}
          <button className="btn-primary" disabled={saving || count < 2}
            onClick={() => save([...members])}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Helpers for alternative-exercise groups (pure functions, no Supabase).

// { [groupId]: { group, members: [exercise...] } } for groups on this day
// that still have 2+ members. A group left with one member is treated as
// a normal exercise.
export function dayGroups(day) {
  const out = {}
  for (const g of day.groups || []) out[g.id] = { group: g, members: [] }
  for (const ex of day.exercises) {
    if (ex.group_id && out[ex.group_id]) out[ex.group_id].members.push(ex)
  }
  for (const id of Object.keys(out)) if (out[id].members.length < 2) delete out[id]
  return out
}

// Short header text, e.g. "Rotate" / "Pick 2 of 3"
export function groupSummary(group, memberCount) {
  if (group.mode === 'choose') return `Pick ${Math.min(group.pick_count, memberCount)} of ${memberCount}`
  return 'Rotate'
}

export function pickLimit(group, memberCount) {
  return group.mode === 'choose' ? Math.max(1, Math.min(group.pick_count, memberCount)) : 1
}

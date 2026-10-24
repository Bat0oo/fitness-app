// Helpers for personal records (pure functions, no Supabase).

const LB_PER_KG = 2.20462262

export function convert(weight, from, to) {
  if (weight === null || weight === undefined || from === to) return weight
  return from === 'kg' ? weight * LB_PER_KG : weight / LB_PER_KG
}

const round1 = n => Math.round(n * 10) / 10

// Epley estimate; null outside 1–12 reps (too unreliable). Matches the SQL view.
export function estimate1RM(weight, reps) {
  if (!(weight > 0) || !(reps >= 1 && reps <= 12)) return null
  return reps === 1 ? weight : round1(weight * (1 + reps / 30))
}

// Collapse an exercise's per-unit PR rows into one record.
// If everything was logged in one unit, show it as-is; if units are mixed,
// convert to the current display unit so the comparison is fair.
export function bestRecord(rows, displayUnit) {
  if (!rows || rows.length === 0) return null
  const units = new Set(rows.map(r => r.unit))
  const target = units.size === 1 ? rows[0].unit : displayUnit
  let best = null
  for (const r of rows) {
    const weight = Number(convert(Number(r.best_weight), r.unit, target))
    const e1rm = r.best_e1rm === null ? null : Number(convert(Number(r.best_e1rm), r.unit, target))
    if (!best || weight > best.weight) best = { ...best, weight, reps: r.reps_at_best }
    if (e1rm !== null && (best.e1rm == null || e1rm > best.e1rm)) best.e1rm = e1rm
  }
  return {
    weight: round1(best.weight),
    reps: best.reps,
    e1rm: best.e1rm == null ? null : round1(best.e1rm),
    unit: target,
  }
}

export const formatWeight = n => (n === null || n === undefined ? '–' : String(round1(n)))

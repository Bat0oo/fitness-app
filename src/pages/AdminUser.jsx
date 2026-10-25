import { useEffect, useState } from 'react'
import * as data from '../lib/data'

const fmtDate = d => (d ? new Date(d).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const fmtDuration = (a, b) => {
  if (!a || !b) return null
  const min = Math.round((new Date(b) - new Date(a)) / 60000)
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min} min`
}
const w = v => (v === null || v === undefined || v === '' ? '–' : Number(v))

// Group a session's sets by exercise, keeping the order they were done in.
function byExercise(sets) {
  const out = []
  for (const s of sets) {
    let row = out.find(r => r.name === s.exercise)
    if (!row) out.push(row = { name: s.exercise, sets: [] })
    row.sets.push(s)
  }
  return out
}

// Read-only view of one user's plans, PRs and recent workouts (admin only).
export default function AdminUser({ email, onBack }) {
  const [detail, setDetail] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    setDetail(null); setErr('')
    data.loadAdminUserDetail(email)
      .then(d => { if (alive) setDetail(d) })
      .catch(e => { console.error(e); if (alive) setErr(e?.message || String(e)) })
    return () => { alive = false }
  }, [email])

  return (
    <div className="admin">
      <div className="admin-top">
        <div>
          <button className="btn-ghost admin-back" onClick={onBack}>← All users</button>
          <h1 className="admin-title">{email}</h1>
          {detail && (
            <div className="admin-me">
              Joined {fmtDate(detail.user.created_at)} · last sign-in {fmtDate(detail.user.last_sign_in_at)}
            </div>
          )}
        </div>
        <span className="admin-readonly">Read-only</span>
      </div>

      {err && <div className="session-err">Couldn’t load this user: {err}</div>}
      {!err && !detail && <div className="center-msg">Loading…</div>}

      {detail && (
        <>
          {/* ---------- plans ---------- */}
          <h2 className="admin-h2">Plans ({detail.plans.length})</h2>
          {detail.plans.length === 0 && <p className="admin-empty">No plans.</p>}
          {detail.plans.map(plan => (
            <div key={plan.id} className="admin-plan">
              <div className="admin-plan-name">{plan.name || 'Untitled plan'}</div>
              <div className="days-grid">
                {plan.days.length === 0 && <p className="admin-empty">No days.</p>}
                {plan.days.map(day => {
                  const groups = Object.fromEntries(day.groups.map(g => [g.id, g]))
                  return (
                    <div key={day.id} className="day-card">
                      <div className="day-head" style={{ background: day.color }}>
                        <div className="admin-day-label">{day.label}</div>
                        <div className="admin-day-title">{day.title}</div>
                      </div>
                      <div className="day-list">
                        {day.exercises.length === 0 && <div className="day-empty">No exercises</div>}
                        {day.exercises.map((ex, i) => {
                          const g = ex.group_id && groups[ex.group_id]
                          return (
                            <div key={i} className="admin-ex">
                              <span className="admin-ex-name">
                                {ex.name}
                                {g && (
                                  <span className="grp-tag" title={g.label || undefined}>
                                    ⇄ {g.mode === 'choose' ? `pick ${g.pick_count}` : 'rotate'}
                                  </span>
                                )}
                              </span>
                              <span className="admin-ex-detail">
                                {ex.sets}×{ex.reps}{ex.kg ? ` · ${ex.kg}` : ''}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* ---------- PRs ---------- */}
          <h2 className="admin-h2">Personal records ({detail.prs.length})</h2>
          {detail.prs.length === 0 ? <p className="admin-empty">No logged sets yet.</p> : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Exercise</th><th>Best</th><th>Est. 1RM</th><th>Last logged</th></tr>
                </thead>
                <tbody>
                  {detail.prs.map(p => (
                    <tr key={p.exercise_key + p.unit}>
                      <td className="admin-email">{p.exercise_key}</td>
                      <td>{w(p.best_weight)} {p.unit} × {p.reps_at_best}</td>
                      <td>{p.best_e1rm ? `${w(p.best_e1rm)} ${p.unit}` : '—'}</td>
                      <td>{fmtDate(p.last_logged_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ---------- workouts ---------- */}
          <h2 className="admin-h2">Recent workouts ({detail.sessions.length}{detail.sessions.length === 30 ? ', latest 30' : ''})</h2>
          {detail.sessions.length === 0 && <p className="admin-empty">No workouts logged.</p>}
          <div className="admin-sessions">
            {detail.sessions.map((s, i) => (
              <div key={i} className="admin-session">
                <div className="admin-session-head">
                  <b>{s.day_title || 'Workout'}</b>
                  <span>{fmtDate(s.started_at)}</span>
                  <span className="admin-me">
                    {s.finished_at ? fmtDuration(s.started_at, s.finished_at) : 'not finished'}
                  </span>
                </div>
                {s.sets.length === 0 && <div className="admin-empty">No sets ticked.</div>}
                {byExercise(s.sets).map(ex => (
                  <div key={ex.name} className="admin-session-ex">
                    <span className="admin-ex-name">{ex.name}</span>
                    <span className="hist-sets">
                      {ex.sets.map(set => (
                        <span key={set.set} className="hist-set">{w(set.weight)} {set.unit} × {w(set.reps)}</span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

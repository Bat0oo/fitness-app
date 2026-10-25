import { useEffect, useState } from 'react'
import { useAuth } from '../lib/useAuth'
import * as data from '../lib/data'
import AdminUser from './AdminUser'

const fmtDate = d => (d ? new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const fmtAgo = d => {
  if (!d) return '—'
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`
}

// Hidden usage dashboard at /admin. Access is decided by the database
// (admin_stats() checks the `admins` table); this page only displays it.
export default function Admin() {
  const { user, signOut } = useAuth()
  const [stats, setStats] = useState(null)
  const [state, setState] = useState('loading') // loading | ok | denied | error
  const [err, setErr] = useState('')
  const [sort, setSort] = useState('created_at')
  // selected user lives in the URL (?user=…) so the back button and links work
  const [viewing, setViewing] = useState(() => new URLSearchParams(window.location.search).get('user'))

  useEffect(() => {
    const onPop = () => setViewing(new URLSearchParams(window.location.search).get('user'))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function openUser(email) {
    window.history.pushState(null, '', email ? `/admin?user=${encodeURIComponent(email)}` : '/admin')
    setViewing(email)
    window.scrollTo(0, 0)
  }

  function load() {
    setState('loading')
    data.loadAdminStats()
      .then(s => { setStats(s); setState('ok') })
      .catch(e => {
        console.error(e)
        // 42501 = not authorized; PGRST202 = function missing (SQL not run)
        if (e?.code === '42501' || /not authorized/i.test(e?.message)) setState('denied')
        else { setErr(e?.message || String(e)); setState('error') }
      })
  }
  useEffect(load, [])

  if (state === 'loading') return <div className="center-msg">Loading…</div>
  if (state === 'denied') {
    // same look as any unknown page: don't advertise that an admin area exists
    return (
      <div className="center-msg">
        <p>Page not found.</p>
        <a className="link-btn" href="/">Back to your planner</a>
      </div>
    )
  }
  if (state === 'error') {
    return (
      <div className="center-msg">
        <p>Couldn’t load stats: {err}</p>
        <button className="btn" style={{ marginTop: 12 }} onClick={load}>Retry</button>
      </div>
    )
  }

  if (viewing) return <AdminUser email={viewing} onBack={() => openUser(null)} />

  const t = stats.totals
  const users = [...stats.users].sort((a, b) => {
    if (sort === 'email') return (a.email || '').localeCompare(b.email || '')
    const av = a[sort] ?? '', bv = b[sort] ?? ''
    if (typeof av === 'number' || typeof bv === 'number') return (bv || 0) - (av || 0)
    return String(bv).localeCompare(String(av)) // dates: newest first
  })

  const cards = [
    ['Users', t.users, `+${t.new_7d} this week`],
    ['Signed in · 7d', t.signed_in_7d, `${t.signed_in_30d} in 30d`],
    ['Logged a workout · 7d', t.logged_7d, `${t.logged_30d} in 30d`],
    ['Workouts finished', t.sessions, `${t.sets} sets ticked`],
    ['Plans', t.workouts, `${t.exercises} exercises`],
  ]

  const cols = [
    ['email', 'Email'],
    ['created_at', 'Joined'],
    ['last_sign_in_at', 'Last sign-in'],
    ['workouts', 'Plans'],
    ['exercises', 'Exercises'],
    ['sessions', 'Workouts'],
    ['sets', 'Sets'],
    ['last_workout', 'Last workout'],
  ]

  return (
    <div className="admin">
      <div className="admin-top">
        <h1 className="admin-title">Admin</h1>
        <div className="admin-actions">
          <span className="admin-me">{user?.email}</span>
          <button className="btn" onClick={load}>Refresh</button>
          <a className="btn" href="/">Planner</a>
          <button className="btn-ghost" onClick={signOut}>Sign out</button>
        </div>
      </div>

      <div className="admin-cards">
        {cards.map(([label, value, sub]) => (
          <div key={label} className="admin-card">
            <div className="admin-card-label">{label}</div>
            <div className="admin-card-value">{value}</div>
            <div className="admin-card-sub">{sub}</div>
          </div>
        ))}
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              {cols.map(([key, label]) => (
                <th key={key}>
                  <button className={`admin-sort ${sort === key ? 'active' : ''}`} onClick={() => setSort(key)}>
                    {label}{sort === key ? ' ▾' : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.email}>
                <td className="admin-email">
                  <button className="admin-user-link" onClick={() => openUser(u.email)}>{u.email}</button>
                </td>
                <td>{fmtDate(u.created_at)}</td>
                <td>{fmtAgo(u.last_sign_in_at)}</td>
                <td className="num">{u.workouts}</td>
                <td className="num">{u.exercises}</td>
                <td className="num">{u.sessions}</td>
                <td className="num">{u.sets}</td>
                <td>{fmtAgo(u.last_workout)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="admin-foot">Generated {new Date(stats.generated_at).toLocaleString()}</p>
    </div>
  )
}

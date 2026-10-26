import { AuthProvider, useAuth } from './lib/useAuth'
import Login from './pages/Login'
import Planner from './pages/Planner'
import Admin from './pages/Admin'

function Gate() {
  const { user, loading } = useAuth()
  if (loading) return <div className="center-msg">Loading…</div>
  if (!user) return <Login />
  // hidden stats page; the database decides who may see the data
  if (window.location.pathname.replace(/\/+$/, '') === '/admin') return <Admin />
  return <Planner />
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}


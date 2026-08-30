import { AuthProvider, useAuth } from './lib/useAuth'
import Login from './pages/Login'
import Planner from './pages/Planner'

function Gate() {
  const { user, loading } = useAuth()
  if (loading) return <div className="center-msg">Loading…</div>
  return user ? <Planner /> : <Login />
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

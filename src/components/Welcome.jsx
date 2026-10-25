import { useState } from 'react'

// Shown instead of the day grid when the current plan has no days yet.
export default function Welcome({ isFirstPlan, onAddDay, onUseTemplate }) {
  const [busy, setBusy] = useState(false)

  async function run(fn) {
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }

  return (
    <div className="welcome">
      <h2 className="welcome-title">{isFirstPlan ? 'Welcome! Let’s build your plan 💪' : 'This plan is empty'}</h2>
      <ol className="welcome-steps">
        <li>
          <b>Add a day</b> for each workout in your week, e.g. Push / Pull / Legs.
          Tap its name to rename it.
        </li>
        <li>
          <b>Add exercises</b> — drag them from the library on the left, tap
          “+ Add from library” on your phone, or type your own. Set sets × reps and weight.
        </li>
        <li>
          <b>Train:</b> hit <b>▶ Start workout</b> on a day and tick off sets as you go.
          A rest timer starts after each set, and your history and PRs build up automatically.
        </li>
      </ol>
      <div className="welcome-actions">
        <button className="btn-start" disabled={busy} onClick={() => run(onAddDay)}>+ Add your first day</button>
        <button className="btn" disabled={busy} onClick={() => run(onUseTemplate)}>
          {busy ? 'Setting up…' : 'Start from a Push / Pull / Legs template'}
        </button>
      </div>
      <p className="welcome-note">You can change or delete anything later. Tip: use the ⇄ button to make “this OR that” alternatives.</p>
    </div>
  )
}

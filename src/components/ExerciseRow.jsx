import { useState } from 'react'

export default function ExerciseRow({ ex, onChange, onRemove }) {
  const [sets, setSets] = useState(ex.sets)
  const [reps, setReps] = useState(ex.reps)
  const [kg, setKg] = useState(ex.kg ?? '')

  function commit(field, value) {
    onChange({ [field]: value })
  }

  return (
    <div className="ex-row">
      <div className="ex-left">
        <div className="ex-name">{ex.name}</div>
        <div className="ex-detail">
          <input
            className="mini"
            value={sets}
            onChange={e => setSets(e.target.value)}
            onBlur={() => commit('sets', parseInt(sets) || 0)}
          />
          <span>×</span>
          <input
            className="mini wide"
            value={reps}
            onChange={e => setReps(e.target.value)}
            onBlur={() => commit('reps', reps)}
          />
          <span>·</span>
          <input
            className="mini"
            placeholder="kg"
            value={kg}
            onChange={e => setKg(e.target.value)}
            onBlur={() => commit('kg', kg)}
          />
        </div>
      </div>
      <button className="icon-btn" onClick={onRemove} aria-label="Remove exercise">✕</button>
    </div>
  )
}

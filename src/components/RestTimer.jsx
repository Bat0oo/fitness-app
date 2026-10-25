import { useEffect, useRef, useState } from 'react'

// ---------- preferences (per device; localStorage can throw in private mode) ----------

const DEFAULT_KEY = 'rest-seconds'
const MIN_REST = 15
const MAX_REST = 600

export function getDefaultRest() {
  try {
    const n = parseInt(localStorage.getItem(DEFAULT_KEY), 10)
    if (n >= MIN_REST && n <= MAX_REST) return n
  } catch { /* ignore */ }
  return 90
}

function setDefaultRest(sec) {
  try { localStorage.setItem(DEFAULT_KEY, String(sec)) } catch { /* ignore */ }
}

// ---------- end-of-rest alert ----------

let audioCtx = null

// Browsers only allow sound after a user gesture, so call this from a click.
export function unlockAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    if (!audioCtx) audioCtx = new Ctx()
    if (audioCtx.state === 'suspended') audioCtx.resume()
  } catch { /* no audio: fine */ }
}

function alertDone() {
  try { navigator.vibrate?.([200, 100, 200]) } catch { /* ignore */ }
  if (!audioCtx) return
  try {
    // three short beeps
    for (let i = 0; i < 3; i++) {
      const t = audioCtx.currentTime + i * 0.25
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.2, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15)
      osc.connect(gain).connect(audioCtx.destination)
      osc.start(t)
      osc.stop(t + 0.16)
    }
  } catch { /* ignore */ }
}

const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

// Bottom bar counting down to `rest.endAt` (ms timestamp). Based on the end
// time, not on ticks, so it stays correct when the tab sleeps in the background.
// rest = { endAt, total }  ·  onChange(rest | null)
export default function RestTimer({ rest, onChange }) {
  const [now, setNow] = useState(Date.now())
  const alerted = useRef(false)

  useEffect(() => {
    alerted.current = false
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [rest.endAt])

  const left = Math.max(0, Math.ceil((rest.endAt - now) / 1000))
  const finished = left === 0

  useEffect(() => {
    if (!finished || alerted.current) return
    alerted.current = true
    alertDone()
    const id = setTimeout(() => onChange(null), 4000) // hide shortly after
    return () => clearTimeout(id)
  }, [finished, onChange])

  function adjust(delta) {
    const total = Math.min(MAX_REST, Math.max(MIN_REST, rest.total + delta))
    const applied = total - rest.total
    if (applied === 0) return
    setDefaultRest(total) // the length you settle on becomes the default
    onChange({ endAt: Math.max(Date.now(), rest.endAt + applied * 1000), total })
  }

  const pct = finished ? 100 : Math.min(100, ((rest.total - left) / rest.total) * 100)

  return (
    <div className={`rest-bar ${finished ? 'finished' : ''}`} role="timer" aria-live="polite">
      <div className="rest-progress" style={{ width: `${pct}%` }} />
      <div className="rest-inner">
        <div className="rest-time">
          {finished ? 'Rest over — next set!' : <>Rest <b>{fmt(left)}</b></>}
        </div>
        {!finished && (
          <div className="rest-btns">
            <button onClick={() => adjust(-15)} aria-label="15 seconds less">−15s</button>
            <button onClick={() => adjust(15)} aria-label="15 seconds more">+15s</button>
            <button onClick={() => onChange(null)}>Skip</button>
          </div>
        )}
        {finished && <div className="rest-btns"><button onClick={() => onChange(null)}>OK</button></div>}
      </div>
    </div>
  )
}

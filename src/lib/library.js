import { useEffect, useState } from 'react'

// Exercise library: English exercise names from wger's open exercise DB
// (https://wger.de, CC-BY-SA). Fetched once, cached in memory + localStorage.
// If wger is slow or down we fall back to the small built-in list below.

const WGER_URL = 'https://wger.de/api/v2/exerciseinfo/?language=2&limit=1000'
const ENGLISH = 2
const CACHE_KEY = 'wger-exercises-v1'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // refresh weekly
const FETCH_TIMEOUT_MS = 10000

// Built-in fallback, used before wger loads or when it's unreachable.
export const FALLBACK_LIBRARY = [
  { name: 'Dumbbell Bench Press', group: 'Chest' },
  { name: 'DB Incline Bench Press', group: 'Chest' },
  { name: 'Lever Chest Press', group: 'Chest' },
  { name: 'Pec Deck / Cable Fly', group: 'Chest' },
  { name: 'Lever Seated Shoulder Press', group: 'Shoulders' },
  { name: 'Lateral Raise', group: 'Shoulders' },
  { name: 'Rear Delt Fly', group: 'Shoulders' },
  { name: 'Face Pull', group: 'Shoulders' },
  { name: 'Triceps Pushdown', group: 'Triceps' },
  { name: 'Tricep Overhead Extension', group: 'Triceps' },
  { name: 'Cable Wide-Grip Lat Pulldown', group: 'Back' },
  { name: 'Cable Seated Row V-bar', group: 'Back' },
  { name: 'Lever Seated Row', group: 'Back' },
  { name: 'DB Shrug', group: 'Back' },
  { name: 'Hammer Curl', group: 'Biceps' },
  { name: 'Bicep Curl', group: 'Biceps' },
  { name: 'EZ Bar Curl', group: 'Biceps' },
  { name: 'Sled 45° Leg Press', group: 'Legs' },
  { name: 'Romanian Deadlift', group: 'Legs' },
  { name: 'Hip Thrust', group: 'Legs' },
  { name: 'Lever Lying Leg Curl', group: 'Legs' },
  { name: 'Leg Extension', group: 'Legs' },
  { name: 'Plank', group: 'Core' },
  { name: 'Russian Twist', group: 'Core' },
  { name: 'Dead Bug', group: 'Core' },
  { name: 'Dead Hang', group: 'Other' },
]

export const DAY_COLORS = ['#D85A30', '#1D9E75', '#378ADD', '#5F5E5A', '#534AB7', '#D4537E']

// ---------- cache helpers (localStorage can throw in private mode) ----------

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed?.list) || parsed.list.length === 0) return null
    return parsed // { savedAt, list }
  } catch {
    return null
  }
}

function writeCache(list) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), list }))
  } catch { /* ignore quota / privacy errors */ }
}

// ---------- fetch ----------

// wger result -> [{ name, group }], English only, deduped, sorted.
function normalize(results) {
  const seen = new Set()
  const list = []
  for (const ex of results) {
    const t = ex.translations?.find(tr => tr.language === ENGLISH)
    const name = t?.name?.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue // names double as drag ids, so they must be unique
    seen.add(key)
    list.push({ name, group: ex.category?.name || 'Other' })
  }
  return list.sort((a, b) => a.name.localeCompare(b.name))
}

async function fetchFromWger() {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(WGER_URL, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`wger responded ${res.status}`)
    const json = await res.json()
    const list = normalize(json.results || [])
    if (list.length === 0) throw new Error('wger returned no exercises')
    return list
  } finally {
    clearTimeout(timer)
  }
}

// One in-flight/finished request per page load, shared by every caller.
let memoryPromise = null

// Resolves to { list, source: 'wger' | 'cache' | 'fallback' }. Never rejects.
export function loadExerciseLibrary() {
  if (memoryPromise) return memoryPromise
  const cached = readCache()
  if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
    memoryPromise = Promise.resolve({ list: cached.list, source: 'cache' })
    return memoryPromise
  }
  memoryPromise = fetchFromWger()
    .then(list => {
      writeCache(list)
      return { list, source: 'wger' }
    })
    .catch(err => {
      console.warn('wger exercise fetch failed, using fallback', err)
      memoryPromise = null // allow a retry on next mount
      // an expired cache beats the tiny fallback list
      return cached
        ? { list: cached.list, source: 'cache' }
        : { list: FALLBACK_LIBRARY, source: 'fallback' }
    })
  return memoryPromise
}

// React hook: shows cached/fallback list instantly, swaps in wger data when ready.
export function useExerciseLibrary() {
  const [state, setState] = useState(() => {
    const cached = readCache()
    return cached
      ? { list: cached.list, status: 'ready' }
      : { list: FALLBACK_LIBRARY, status: 'loading' }
  })

  useEffect(() => {
    let alive = true
    loadExerciseLibrary().then(({ list, source }) => {
      if (alive) setState({ list, status: source === 'fallback' ? 'offline' : 'ready' })
    })
    return () => { alive = false }
  }, [])

  return state // { list, status: 'loading' | 'ready' | 'offline' }
}

// Shared search used by the sidebar and the mobile sheet.
export function searchExercises(list, query) {
  // every typed word must appear, in any order ("db bench" style queries)
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return list
  return list.filter(e => {
    const name = e.name.toLowerCase()
    return words.every(w => name.includes(w))
  })
}

// Starter plan offered on the empty-plan welcome screen.
export const STARTER_TEMPLATE = [
  {
    label: 'Day 1', title: 'Push',
    exercises: [
      { name: 'Bench Press', sets: 3, reps: '6-8' },
      { name: 'Incline Dumbbell Press', sets: 3, reps: '8-10' },
      { name: 'Shoulder Press', sets: 3, reps: '8-10' },
      { name: 'Lateral Raise', sets: 3, reps: '12-15' },
      { name: 'Triceps Pushdown', sets: 3, reps: '10-12' },
    ],
  },
  {
    label: 'Day 2', title: 'Pull',
    exercises: [
      { name: 'Lat Pulldown', sets: 3, reps: '8-10' },
      { name: 'Seated Cable Row', sets: 3, reps: '8-10' },
      { name: 'Face Pull', sets: 3, reps: '12-15' },
      { name: 'Biceps Curl', sets: 3, reps: '10-12' },
      { name: 'Hammer Curl', sets: 3, reps: '10-12' },
    ],
  },
  {
    label: 'Day 3', title: 'Legs',
    exercises: [
      { name: 'Squat', sets: 3, reps: '6-8' },
      { name: 'Romanian Deadlift', sets: 3, reps: '8-10' },
      { name: 'Leg Press', sets: 3, reps: '10-12' },
      { name: 'Leg Curl', sets: 3, reps: '10-12' },
      { name: 'Calf Raise', sets: 3, reps: '12-15' },
    ],
  },
]

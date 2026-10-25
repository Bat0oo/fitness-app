import { supabase } from './supabase'

// All of the user's workouts (plans), oldest first. Creates a starter one if none.
export async function listOrCreateWorkouts(userId) {
  const { data, error } = await supabase
    .from('workouts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  if (data.length > 0) return data
  return [await createWorkout(userId, 'My workout')]
}

export async function createWorkout(userId, name) {
  const { data, error } = await supabase
    .from('workouts')
    .insert({ user_id: userId, name })
    .select()
    .single()
  if (error) throw error
  return data
}

// Deletes the plan with its days, exercises and groups (cascade).
// Logged sessions/sets are kept — they just lose the link to the day.
export async function deleteWorkout(id) {
  const { error } = await supabase.from('workouts').delete().eq('id', id)
  if (error) throw error
}

// Which workout a day belongs to (used to resume a session from another plan).
export async function workoutIdForDay(dayId) {
  const { data, error } = await supabase.from('days').select('workout_id').eq('id', dayId).maybeSingle()
  if (error) throw error
  return data?.workout_id ?? null
}

// One workout row -> the same workout with all days + exercises + groups nested.
export async function loadWorkout(workout) {
  const { data: days, error: dErr } = await supabase
    .from('days')
    .select('*, exercises(*)')
    .eq('workout_id', workout.id)
    .order('position', { ascending: true })
  if (dErr) throw dErr

  // sort nested exercises by position
  days.forEach(d => d.exercises.sort((a, b) => a.position - b.position))

  // alternative groups load separately so a missing table never blocks the planner
  const groups = await loadGroups(days.map(d => d.id)).catch(e => {
    console.error('load exercise groups failed', e)
    return []
  })
  days.forEach(d => { d.groups = groups.filter(g => g.day_id === d.id) })

  return { ...workout, days }
}

export async function renameWorkout(id, name) {
  const { error } = await supabase.from('workouts').update({ name }).eq('id', id)
  if (error) throw error
}

export async function addDay(workoutId, position, color) {
  const { data, error } = await supabase
    .from('days')
    .insert({ workout_id: workoutId, label: 'New day', title: 'Workout', color, position })
    .select()
    .single()
  if (error) throw error
  return { ...data, exercises: [] }
}

export async function updateDay(id, fields) {
  const { error } = await supabase.from('days').update(fields).eq('id', id)
  if (error) throw error
}

export async function removeDay(id) {
  const { error } = await supabase.from('days').delete().eq('id', id)
  if (error) throw error
}

export async function addExercise(dayId, name, position) {
  const { data, error } = await supabase
    .from('exercises')
    .insert({ day_id: dayId, name, sets: 3, reps: '10', kg: '', position })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateExercise(id, fields) {
  const { error } = await supabase.from('exercises').update(fields).eq('id', id)
  if (error) throw error
}

export async function removeExercise(id) {
  const { error } = await supabase.from('exercises').delete().eq('id', id)
  if (error) throw error
}

export async function reorderExercises(orderedIds) {
  // Update each exercise's position to match its index in the array.
  const updates = orderedIds.map((id, index) =>
    supabase.from('exercises').update({ position: index }).eq('id', id)
  )
  const results = await Promise.all(updates)
  const failed = results.find(r => r.error)
  if (failed) throw failed.error
}
// ---------- profile / preferences ----------

// Returns the user's weight unit ('kg' | 'lb'). Defaults to 'kg' if no profile row yet.
export async function loadUnit(userId) {
  return (await loadProfile(userId)).unit
}

// { unit, active_workout_id } with defaults when there's no profile row yet.
// select('*') so a missing column (SQL not run yet) doesn't break loading.
export async function loadProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return {
    unit: data?.unit === 'lb' ? 'lb' : 'kg',
    active_workout_id: data?.active_workout_id ?? null,
  }
}

// Remember which plan the user last had open (synced across devices).
export async function saveActiveWorkout(userId, workoutId) {
  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: userId, active_workout_id: workoutId }, { onConflict: 'user_id' })
  if (error) throw error
}

// Saves the weight unit (creates the profile row on first save).
export async function saveUnit(userId, unit) {
  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: userId, unit }, { onConflict: 'user_id' })
  if (error) throw error
}

// ---------- session logging ----------

// Same normalisation as the generated `exercise_key` column in Postgres.
export const exerciseKey = name => (name || '').trim().toLowerCase()

export async function startSession(userId, day) {
  const { data, error } = await supabase
    .from('sessions')
    .insert({ user_id: userId, day_id: day.id, day_title: day.title || '' })
    .select()
    .single()
  if (error) throw error
  return { ...data, sets: [] }
}

// The most recent unfinished session (to resume after a reload), or null.
export async function loadActiveSession(userId) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*, sets:set_logs(*)')
    .eq('user_id', userId)
    .is('finished_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return data?.[0] ?? null
}

export async function finishSession(id) {
  const { error } = await supabase
    .from('sessions')
    .update({ finished_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// Deletes the session and (via cascade) all its sets.
export async function discardSession(id) {
  const { error } = await supabase.from('sessions').delete().eq('id', id)
  if (error) throw error
}

// Insert or update one set (unique per session + exercise + set number).
export async function saveSet(set) {
  const { data, error } = await supabase
    .from('set_logs')
    .upsert(
      { ...set, logged_at: new Date().toISOString() },
      { onConflict: 'session_id,exercise_key,set_number' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteSet(sessionId, exerciseName, setNumber) {
  const { error } = await supabase
    .from('set_logs')
    .delete()
    .eq('session_id', sessionId)
    .eq('exercise_key', exerciseKey(exerciseName))
    .eq('set_number', setNumber)
  if (error) throw error
}

// Completed sets for the given exercise names, newest first, grouped into
// sessions: { [exerciseKey]: [{ sessionId, date, sets: [...] }, ...] }
// `maxSessions` per exercise; `excludeSessionId` skips the current session.
// One small indexed query per exercise, so a frequently-trained exercise
// can't crowd out one you last did months ago.
export async function loadRecentSessionsByExercise(userId, names, { maxSessions = 5, excludeSessionId } = {}) {
  const keys = [...new Set(names.map(exerciseKey))].filter(Boolean)
  const results = await Promise.all(
    keys.map(key => loadRecentSessionsForKey(userId, key, maxSessions, excludeSessionId))
  )
  return Object.fromEntries(keys.map((key, i) => [key, results[i]]))
}

async function loadRecentSessionsForKey(userId, key, maxSessions, excludeSessionId) {
  let q = supabase
    .from('set_logs')
    .select('session_id, exercise_key, set_number, weight, reps, unit, logged_at, sessions(started_at)')
    .eq('user_id', userId)
    .eq('exercise_key', key)
    .eq('done', true)
    .order('logged_at', { ascending: false })
    .limit(maxSessions * 20) // generous: up to 20 sets per session
  if (excludeSessionId) q = q.neq('session_id', excludeSessionId)

  const { data, error } = await q
  if (error) throw error

  const sessions = []
  for (const row of data) {
    let s = sessions.find(x => x.sessionId === row.session_id)
    if (!s) {
      if (sessions.length >= maxSessions) continue
      s = { sessionId: row.session_id, date: row.sessions?.started_at || row.logged_at, sets: [] }
      sessions.push(s)
    }
    s.sets.push(row)
  }
  sessions.sort((a, b) => new Date(b.date) - new Date(a.date))
  sessions.forEach(s => s.sets.sort((a, b) => a.set_number - b.set_number))
  return sessions
}

// ---------- personal records ----------

// The user's PR rows: { [exerciseKey]: [{ unit, best_weight, reps_at_best, best_e1rm }] }
// (one entry per unit the exercise was logged in). Pass `names` to limit it.
export async function loadPRs(userId, names) {
  let q = supabase
    .from('exercise_prs')
    .select('exercise_key, unit, best_weight, reps_at_best, best_e1rm')
    .eq('user_id', userId)
  if (names) q = q.in('exercise_key', names.map(exerciseKey))
  const { data, error } = await q
  if (error) throw error
  const out = {}
  for (const row of data) (out[row.exercise_key] ||= []).push(row)
  return out
}

// ---------- alternative exercise groups ----------

async function loadGroups(dayIds) {
  if (dayIds.length === 0) return []
  const { data, error } = await supabase.from('exercise_groups').select('*').in('day_id', dayIds)
  if (error) throw error
  return data
}

export async function createGroup(dayId, fields) {
  const { data, error } = await supabase
    .from('exercise_groups')
    .insert({ day_id: dayId, ...fields })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateGroup(id, fields) {
  const { error } = await supabase.from('exercise_groups').update(fields).eq('id', id)
  if (error) throw error
}

// Members' group_id is cleared automatically (on delete set null).
export async function deleteGroup(id) {
  const { error } = await supabase.from('exercise_groups').delete().eq('id', id)
  if (error) throw error
}

// Put exercises into a group, or take them out with groupId = null.
export async function setExercisesGroup(exerciseIds, groupId) {
  if (exerciseIds.length === 0) return
  const { error } = await supabase.from('exercises').update({ group_id: groupId }).in('id', exerciseIds)
  if (error) throw error
}

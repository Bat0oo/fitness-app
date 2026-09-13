import { supabase } from './supabase'

// Load the user's workout with all days + exercises nested.
// If the user has no workout yet, create a starter one.
export async function loadOrCreateWorkout(userId) {
  let { data: workouts, error } = await supabase
    .from('workouts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (error) throw error

  let workout = workouts?.[0]
  if (!workout) {
    const { data, error: insErr } = await supabase
      .from('workouts')
      .insert({ user_id: userId, name: 'My workout' })
      .select()
      .single()
    if (insErr) throw insErr
    workout = data
  }

  const { data: days, error: dErr } = await supabase
    .from('days')
    .select('*, exercises(*)')
    .eq('workout_id', workout.id)
    .order('position', { ascending: true })
  if (dErr) throw dErr

  // sort nested exercises by position
  days.forEach(d => d.exercises.sort((a, b) => a.position - b.position))

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
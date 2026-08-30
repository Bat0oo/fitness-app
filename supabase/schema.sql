-- ============================================================
-- Workout Planner — database schema
-- Run this in Supabase: Dashboard > SQL Editor > New query > paste > Run
-- ============================================================

-- A workout is a whole plan (e.g. "My PPL split"). Belongs to one user.
create table if not exists workouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null default 'My workout',
  created_at  timestamptz not null default now()
);

-- A day is a card inside a workout (e.g. "Monday / Push").
create table if not exists days (
  id          uuid primary key default gen_random_uuid(),
  workout_id  uuid not null references workouts(id) on delete cascade,
  label       text not null default 'Day',        -- e.g. "Monday"
  title       text not null default 'Workout',    -- e.g. "Push"
  color       text not null default '#D85A30',
  position    int  not null default 0,            -- order of cards
  created_at  timestamptz not null default now()
);

-- An exercise inside a day.
create table if not exists exercises (
  id          uuid primary key default gen_random_uuid(),
  day_id      uuid not null references days(id) on delete cascade,
  name        text not null,
  sets        int  not null default 3,
  reps        text not null default '10',         -- text so "8-10" works
  kg          text default '',
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);

-- Helpful indexes
create index if not exists idx_days_workout on days(workout_id);
create index if not exists idx_exercises_day on exercises(day_id);

-- ============================================================
-- Row Level Security: each user sees ONLY their own data.
-- ============================================================
alter table workouts  enable row level security;
alter table days      enable row level security;
alter table exercises enable row level security;

-- WORKOUTS: owner-only, all operations
create policy "own workouts" on workouts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- DAYS: allowed if the parent workout belongs to the user
create policy "own days" on days
  for all using (
    exists (select 1 from workouts w where w.id = days.workout_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from workouts w where w.id = days.workout_id and w.user_id = auth.uid())
  );

-- EXERCISES: allowed if the parent day's workout belongs to the user
create policy "own exercises" on exercises
  for all using (
    exists (
      select 1 from days d
      join workouts w on w.id = d.workout_id
      where d.id = exercises.day_id and w.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from days d
      join workouts w on w.id = d.workout_id
      where d.id = exercises.day_id and w.user_id = auth.uid()
    )
  );

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

-- PROFILES: per-user preferences (one row per user).

create table if not exists profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  unit        text not null default 'kg' check (unit in ('kg', 'lb')),
  created_at  timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "own profile" on profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- sessions = one workout you actually did; set_logs = one row per set.
-- History is grouped by exercise NAME (exercise_key), so it survives
-- removing/re-adding an exercise in the plan. Deleting plan rows never
-- deletes logs (day_id / exercise_id are set null).

create table if not exists sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  day_id       uuid references days(id) on delete set null,
  day_title    text not null default '',          -- snapshot of the day title
  started_at   timestamptz not null default now(),
  finished_at  timestamptz                        -- null = still in progress
);

create table if not exists set_logs (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references sessions(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  exercise_id    uuid references exercises(id) on delete set null,
  exercise_name  text not null,
  exercise_key   text generated always as (lower(trim(exercise_name))) stored,
  set_number     int  not null check (set_number > 0),
  weight         numeric(7,2),
  reps           int check (reps >= 0),
  unit           text not null default 'kg' check (unit in ('kg', 'lb')),
  done           boolean not null default false,
  logged_at      timestamptz not null default now(),
  unique (session_id, exercise_key, set_number)
);

create index if not exists idx_sessions_user_started on sessions (user_id, started_at desc);
create index if not exists idx_set_logs_history on set_logs (user_id, exercise_key, logged_at desc);
create index if not exists idx_set_logs_session on set_logs (session_id);

alter table sessions enable row level security;
alter table set_logs enable row level security;

-- SESSIONS: owner-only; a session may only point at one of your own days
create policy "own sessions" on sessions
  for all using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id and (
      day_id is null or exists (
        select 1 from days d join workouts w on w.id = d.workout_id
        where d.id = sessions.day_id and w.user_id = auth.uid()
      )
    )
  );

-- SET_LOGS: owner-only, and only inside one of your own sessions
create policy "own set logs" on set_logs
  for all using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id and exists (
      select 1 from sessions s where s.id = set_logs.session_id and s.user_id = auth.uid()
    )
  );

-- ============================================================
-- PERSONAL RECORDS
-- Computed on the fly from set_logs — nothing stored, always up to date.
-- One row per user + exercise + unit (units are never mixed in SQL;
-- the app converts for display). security_invoker makes the view obey
-- set_logs' RLS, so users only ever see their own PRs.
-- est. 1RM uses Epley: weight × (1 + reps/30), only for 1–12 reps.
-- ============================================================
create or replace view exercise_prs with (security_invoker = true) as
select
  user_id,
  exercise_key,
  unit,
  max(weight)                                                   as best_weight,
  (array_agg(reps order by weight desc, reps desc))[1]          as reps_at_best,
  max(case when reps = 1 then weight
           else round(weight * (1 + reps / 30.0), 1) end)
    filter (where reps between 1 and 12)                         as best_e1rm,
  max(logged_at)                                                as last_logged_at
from set_logs
where done and weight > 0 and reps > 0
group by user_id, exercise_key, unit;

-- ============================================================
-- ALTERNATIVE GROUPS — "this OR that" exercises
-- A group is a slot on a day holding 2+ alternative exercises.
--   mode 'rotate': app suggests the least-recently-done one (pick 1)
--   mode 'choose': you pick `pick_count` of them for the session
-- Exercises not in a group are always done. Which alternative was
-- actually done is already recorded in set_logs.exercise_name.
-- ============================================================
create table if not exists exercise_groups (
  id          uuid primary key default gen_random_uuid(),
  day_id      uuid not null references days(id) on delete cascade,
  label       text not null default '',
  mode        text not null default 'rotate' check (mode in ('rotate', 'choose')),
  pick_count  int  not null default 1 check (pick_count >= 1),
  created_at  timestamptz not null default now()
);

alter table exercises
  add column if not exists group_id uuid references exercise_groups(id) on delete set null;

create index if not exists idx_exercise_groups_day on exercise_groups(day_id);
create index if not exists idx_exercises_group on exercises(group_id);

alter table exercise_groups enable row level security;

-- EXERCISE_GROUPS: allowed if the parent day's workout belongs to the user
create policy "own exercise groups" on exercise_groups
  for all using (
    exists (
      select 1 from days d join workouts w on w.id = d.workout_id
      where d.id = exercise_groups.day_id and w.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from days d join workouts w on w.id = d.workout_id
      where d.id = exercise_groups.day_id and w.user_id = auth.uid()
    )
  );

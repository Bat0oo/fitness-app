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

-- ============================================================
-- MULTIPLE WORKOUTS remember the last-opened plan per user.
-- ============================================================
alter table profiles
  add column if not exists active_workout_id uuid references workouts(id) on delete set null;

-- ============================================================
-- ADMIN STATS
-- Access is enforced HERE, server-side: admin_stats() checks that the
-- caller's user id is in `admins`. `admins` has RLS on and no policies,
-- so nobody can read or modify it through the API — only the SQL Editor.
-- Keyed by user id (not email) so an unverified sign-up can't pose as you.
-- ============================================================
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table admins enable row level security;  -- intentionally no policies

create or replace function admin_stats()
returns json
language plpgsql
security definer                    -- runs as owner so it can count all users
set search_path = public, auth
as $$
begin
  if not exists (select 1 from admins where user_id = auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return json_build_object(
    'generated_at', now(),
    'totals', json_build_object(
      'users',         (select count(*) from auth.users),
      'new_7d',        (select count(*) from auth.users where created_at      > now() - interval '7 days'),
      'signed_in_7d',  (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
      'signed_in_30d', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
      'logged_7d',     (select count(distinct user_id) from sessions where started_at > now() - interval '7 days'),
      'logged_30d',    (select count(distinct user_id) from sessions where started_at > now() - interval '30 days'),
      'workouts',      (select count(*) from workouts),
      'exercises',     (select count(*) from exercises),
      'sessions',      (select count(*) from sessions where finished_at is not null),
      'sets',          (select count(*) from set_logs where done)
    ),
    'users', (
      select coalesce(json_agg(u order by u.created_at desc), '[]'::json)
      from (
        select
          au.email,
          au.created_at,
          au.last_sign_in_at,
          (select count(*) from workouts w where w.user_id = au.id) as workouts,
          (select count(*) from exercises e
             join days d on d.id = e.day_id
             join workouts w on w.id = d.workout_id
           where w.user_id = au.id)                                 as exercises,
          (select count(*) from sessions s
           where s.user_id = au.id and s.finished_at is not null)    as sessions,
          (select count(*) from set_logs l where l.user_id = au.id and l.done) as sets,
          (select max(s.started_at) from sessions s where s.user_id = au.id)    as last_workout
        from auth.users au
      ) u
    )
  );
end;
$$;

revoke all on function admin_stats() from public, anon;
grant execute on function admin_stats() to authenticated;

-- Make yourself admin (run once; change the email if needed):
-- insert into admins (user_id)
--   select id from auth.users where email = 'YOUR-EMAIL' on conflict do nothing;

-- Read-only detail for one user (admin only): plans → days → exercises,
-- PRs, and the last 30 workouts with their ticked sets.
create or replace function admin_user_detail(target_email text)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid;
begin
  if not exists (select 1 from admins where user_id = auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select id into uid from auth.users where lower(email) = lower(target_email);
  if uid is null then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  return json_build_object(
    'user', (
      select json_build_object('email', email, 'created_at', created_at, 'last_sign_in_at', last_sign_in_at)
      from auth.users where id = uid
    ),
    'plans', (
      select coalesce(json_agg(json_build_object(
        'id', w.id, 'name', w.name, 'created_at', w.created_at,
        'days', (
          select coalesce(json_agg(json_build_object(
            'id', d.id, 'label', d.label, 'title', d.title, 'color', d.color,
            'exercises', (
              select coalesce(json_agg(json_build_object(
                'name', e.name, 'sets', e.sets, 'reps', e.reps, 'kg', e.kg, 'group_id', e.group_id
              ) order by e.position), '[]'::json)
              from exercises e where e.day_id = d.id
            ),
            'groups', (
              select coalesce(json_agg(json_build_object(
                'id', g.id, 'label', g.label, 'mode', g.mode, 'pick_count', g.pick_count
              )), '[]'::json)
              from exercise_groups g where g.day_id = d.id
            )
          ) order by d.position), '[]'::json)
          from days d where d.workout_id = w.id
        )
      ) order by w.created_at), '[]'::json)
      from workouts w where w.user_id = uid
    ),
    'prs', (
      select coalesce(json_agg(p order by p.last_logged_at desc), '[]'::json)
      from (
        select exercise_key, unit, best_weight, reps_at_best, best_e1rm, last_logged_at
        from exercise_prs where user_id = uid
      ) p
    ),
    'sessions', (
      select coalesce(json_agg(x order by x.started_at desc), '[]'::json)
      from (
        select s.started_at, s.finished_at, s.day_title,
          (
            select coalesce(json_agg(json_build_object(
              'exercise', l.exercise_name, 'set', l.set_number,
              'weight', l.weight, 'unit', l.unit, 'reps', l.reps
            ) order by l.logged_at, l.set_number), '[]'::json)
            from set_logs l where l.session_id = s.id and l.done
          ) as sets
        from sessions s
        where s.user_id = uid
        order by s.started_at desc
        limit 30
      ) x
    )
  );
end;
$$;

revoke all on function admin_user_detail(text) from public, anon;
grant execute on function admin_user_detail(text) to authenticated;

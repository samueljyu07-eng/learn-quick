-- Run this once in the Supabase SQL editor.
-- Locks and points are written by the server with the service role key.
-- That key bypasses these policies. The browser uses the anon key, so a signed-in
-- person can read and edit only their own definitions, and can read only their own points.

create table if not exists public.definitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  term text not null,
  definition text not null,
  source text not null default '',
  added_at timestamptz not null default now()
);

alter table public.definitions enable row level security;

drop policy if exists "Read own definitions" on public.definitions;
drop policy if exists "Insert own definitions" on public.definitions;
drop policy if exists "Update own definitions" on public.definitions;
drop policy if exists "Delete own definitions" on public.definitions;

create policy "Read own definitions"
  on public.definitions for select
  using (auth.uid() = user_id);

create policy "Insert own definitions"
  on public.definitions for insert
  with check (auth.uid() = user_id);

create policy "Update own definitions"
  on public.definitions for update
  using (auth.uid() = user_id);

create policy "Delete own definitions"
  on public.definitions for delete
  using (auth.uid() = user_id);

create table if not exists public.hardcore_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  runs jsonb not null default '[]'::jsonb,
  locks jsonb not null default '[]'::jsonb,
  pending jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.hardcore_state enable row level security;

create table if not exists public.point_awards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  material_hash text not null,
  session_saved_at timestamptz not null,
  day date not null,
  points integer not null check (points >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, session_saved_at)
);

create index if not exists point_awards_user_day on public.point_awards (user_id, day);
create index if not exists point_awards_user_material on public.point_awards (user_id, material_hash);

alter table public.point_awards enable row level security;

drop policy if exists "Read own points" on public.point_awards;

create policy "Read own points"
  on public.point_awards for select
  using (auth.uid() = user_id);

create table if not exists public.saved_lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  added_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists saved_lessons_user_added on public.saved_lessons (user_id, added_at desc);

alter table public.saved_lessons enable row level security;

drop policy if exists "Read own lessons" on public.saved_lessons;
drop policy if exists "Insert own lessons" on public.saved_lessons;
drop policy if exists "Update own lessons" on public.saved_lessons;
drop policy if exists "Delete own lessons" on public.saved_lessons;

create policy "Read own lessons"
  on public.saved_lessons for select
  using (auth.uid() = user_id);

create policy "Insert own lessons"
  on public.saved_lessons for insert
  with check (auth.uid() = user_id);

create policy "Update own lessons"
  on public.saved_lessons for update
  using (auth.uid() = user_id);

create policy "Delete own lessons"
  on public.saved_lessons for delete
  using (auth.uid() = user_id);

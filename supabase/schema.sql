-- Scouted multiplayer + leaderboard.
--
-- Writes never come from the browser: every mutation goes through a route
-- handler holding the service-role key, so RLS below grants read access only.
-- That keeps a player from awarding themselves points by calling the table
-- directly with the public anon key, which is visible in any browser.

create table if not exists rooms (
  code             text primary key,
  host_id          text not null,
  status           text not null default 'lobby',   -- lobby | playing | done
  rounds           int  not null default 5,
  round_seconds    int  not null default 90,
  current_round    int  not null default 0,
  -- The answers for every round, fixed when the room is created, so each
  -- player in the room sees the same sequence.
  answer_ids       jsonb not null default '[]'::jsonb,
  round_started_at timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists room_players (
  room_code text not null references rooms(code) on delete cascade,
  player_id text not null,
  name      text not null,
  score     int  not null default 0,
  joined_at timestamptz not null default now(),
  primary key (room_code, player_id)
);

create table if not exists room_results (
  room_code text not null references rooms(code) on delete cascade,
  player_id text not null,
  round     int  not null,
  solved    boolean not null default false,
  guesses   int,
  points    int  not null default 0,
  created_at timestamptz not null default now(),
  primary key (room_code, player_id, round)
);

create table if not exists leaderboard (
  id         bigint generated always as identity primary key,
  name       text not null,
  streak     int  not null check (streak >= 0),
  created_at timestamptz not null default now()
);

create index if not exists leaderboard_streak_idx on leaderboard (streak desc, created_at asc);
create index if not exists rooms_created_idx on rooms (created_at desc);

alter table rooms         enable row level security;
alter table room_players  enable row level security;
alter table room_results  enable row level security;
alter table leaderboard   enable row level security;

do $$
begin
  -- Read-only for the public key. Mutations use the service role, which
  -- bypasses RLS entirely.
  if not exists (select 1 from pg_policies where tablename = 'rooms' and policyname = 'read rooms') then
    create policy "read rooms" on rooms for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'room_players' and policyname = 'read room players') then
    create policy "read room players" on room_players for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'room_results' and policyname = 'read room results') then
    create policy "read room results" on room_results for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'leaderboard' and policyname = 'read leaderboard') then
    create policy "read leaderboard" on leaderboard for select using (true);
  end if;
end $$;

-- Realtime: clients watch these tables instead of polling.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'rooms') then
    alter publication supabase_realtime add table rooms;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'room_players') then
    alter publication supabase_realtime add table room_players;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'room_results') then
    alter publication supabase_realtime add table room_results;
  end if;
end $$;

-- One row per player, holding their best run. Without this a single person
-- posting repeatedly fills the whole top 20 and the board stops being a
-- ranking of players.
create unique index if not exists leaderboard_name_key on leaderboard (lower(name));

-- Server-owned unlimited runs.
--
-- A streak posted by the browser is just a number the browser chose, so the
-- leaderboard cannot trust it. Here the server picks each answer, judges each
-- guess and counts the streak itself; the only way onto the board is to have
-- actually played. The client never learns the answer until the round is over.
create table if not exists runs (
  id         uuid primary key default gen_random_uuid(),
  player_id  text not null,
  streak     int  not null default 0,
  answer_id  int,
  guesses    int  not null default 0,
  -- Players already beaten in this run, so the same answer cannot repeat.
  seen_ids   jsonb not null default '[]'::jsonb,
  status     text not null default 'active',   -- active | ended
  claimed    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists runs_player_idx on runs (player_id, created_at desc);

-- No read policy: the answer lives in this table, so the public key must not
-- be able to select from it at all. Everything goes through the route
-- handlers, which use the service role.
alter table runs enable row level security;

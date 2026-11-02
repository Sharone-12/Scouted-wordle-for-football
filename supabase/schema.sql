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

-- Einmalig im Supabase-Dashboard unter "SQL Editor" ausführen.
create table if not exists users (
  id bigint generated always as identity primary key,
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  title text not null,
  start_date date not null,
  end_date date not null,
  start_time text,
  end_time text,
  color text not null default '#4f46e5',
  note text not null default '',
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists idx_events_user on events(user_id, start_date, end_date);

-- Zeilensicherheit an, ohne Regeln: Der öffentliche Key (anon) kommt an nichts heran.
-- Nur das Backend mit dem Service-Key darf lesen und schreiben.
alter table users enable row level security;
alter table events enable row level security;

-- ---------- Aufgaben (Update: bei bestehendem Projekt einfach nochmal ausführen) ----------
create table if not exists todo_lists (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  name text not null,
  emoji text not null default '📝',
  color text not null default '#4f46e5',
  created_at timestamptz not null default now()
);

create table if not exists todos (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  list_id bigint not null references todo_lists(id) on delete cascade,
  title text not null,
  due_date date,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_todos_user on todos(user_id, list_id, due_date);

alter table todo_lists enable row level security;
alter table todos enable row level security;

-- ---------- Termin-Symbol (Update: bei bestehendem Projekt ausführen) ----------
alter table events add column if not exists icon text not null default '';

-- ---------- Stundenplan (Update: bei bestehendem Projekt ausführen) ----------
create table if not exists timetable (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  title text not null,
  weekday int not null check (weekday between 1 and 7),
  start_time text not null,
  end_time text,
  room text not null default '',
  color text not null default '#4f46e5',
  icon text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_timetable_user on timetable(user_id, weekday, start_time);
alter table timetable enable row level security;

-- ---------- Freunde (Update: bei bestehendem Projekt ausführen) ----------
alter table events add column if not exists private boolean not null default false;
create table if not exists friendships (
  id bigint generated always as identity primary key,
  requester_id bigint not null references users(id) on delete cascade,
  addressee_id bigint not null references users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);
create unique index if not exists uq_friend_pair on friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create table if not exists shares (
  owner_id bigint not null references users(id) on delete cascade,
  viewer_id bigint not null references users(id) on delete cascade,
  calendar boolean not null default false,
  timetable boolean not null default false,
  todos boolean not null default false,
  primary key (owner_id, viewer_id)
);
alter table friendships enable row level security;
alter table shares enable row level security;
grant all on friendships, shares to service_role;
grant all on all sequences in schema public to service_role;

-- ---------- Profilbild (Update: bei bestehendem Projekt ausführen) ----------
alter table users add column if not exists avatar text not null default '';

-- ---------- Börse (Update: bei bestehendem Projekt ausführen) ----------
create table if not exists watchlist (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  symbol text not null,
  name text not null default '',
  exchange text not null default '',
  currency text not null default '',
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, symbol, exchange)
);
create table if not exists market_briefings (
  user_id bigint not null references users(id) on delete cascade,
  day date not null,
  content text not null,
  created_at double precision not null,
  primary key (user_id, day)
);
alter table watchlist enable row level security;
alter table market_briefings enable row level security;
grant all on watchlist, market_briefings to service_role;
grant all on all sequences in schema public to service_role;

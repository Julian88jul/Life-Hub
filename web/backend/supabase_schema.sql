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

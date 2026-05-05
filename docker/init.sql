create extension if not exists "pgcrypto";

create table if not exists attendance_records (
  id uuid primary key default gen_random_uuid(),
  user_name text not null default '',
  work_date date not null,
  start_time time not null,
  end_time time,
  status text not null check (status in ('present', 'remote', 'vacation', 'holiday')),
  note text,
  created_at timestamptz not null default now()
);

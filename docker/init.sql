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

create table if not exists overtime_requests (
  id uuid primary key default gen_random_uuid(),
  user_name text not null,
  request_date date not null,
  planned_start time not null,
  planned_end time not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approver_name text,
  approver_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

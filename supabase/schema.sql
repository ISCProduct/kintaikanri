create extension if not exists "pgcrypto";

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  user_name text not null,
  work_date date not null,
  start_time time not null,
  end_time time,
  status text not null check (status in ('present', 'remote', 'vacation', 'holiday')),
  note text,
  created_at timestamptz not null default now()
);

-- 既存テーブルへの追加用（テーブルが既に存在する場合）
alter table public.attendance_records
  add column if not exists user_name text not null default '';

alter table public.attendance_records enable row level security;

create policy "Allow read for anon and authenticated"
  on public.attendance_records
  for select
  to anon, authenticated
  using (true);

create policy "Allow insert for anon and authenticated"
  on public.attendance_records
  for insert
  to anon, authenticated
  with check (true);

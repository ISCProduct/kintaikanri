create extension if not exists "pgcrypto";

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  start_time time not null,
  end_time time,
  status text not null check (status in ('present', 'remote', 'vacation', 'holiday')),
  note text,
  created_at timestamptz not null default now()
);

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

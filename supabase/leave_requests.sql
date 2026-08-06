-- 有給休暇申請テーブル（Supabase / 既存 DB 向け）
create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_name text not null,
  leave_date date not null,
  leave_type text not null check (leave_type in ('full', 'half_am', 'half_pm')),
  leave_category text not null default 'paid'
    check (leave_category in ('paid', 'sick', 'special', 'absence', 'compensatory')),
  days numeric(3,1) not null default 1,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  approver_name text,
  approver_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leave_requests_user_date on public.leave_requests (user_name, leave_date);

alter table public.leave_requests enable row level security;

drop policy if exists "Allow all for leave_requests" on public.leave_requests;
create policy "Allow all for leave_requests"
  on public.leave_requests
  for all
  to anon, authenticated
  using (true)
  with check (true);

alter table public.leave_requests
  add column if not exists leave_category text not null default 'paid';

insert into public.system_rules (key, value, label) values
  ('standard_start_time', '09:00', '所定出勤時刻'),
  ('standard_end_time',   '18:00', '所定退勤時刻')
on conflict (key) do nothing;

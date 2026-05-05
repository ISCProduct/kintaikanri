create extension if not exists "pgcrypto";

create table if not exists attendance_records (
  id uuid primary key default gen_random_uuid(),
  user_name text not null default '',
  work_date date not null,
  start_time time not null,
  end_time time,
  status text not null check (status in ('present', 'remote', 'vacation', 'holiday')),
  note text,
  created_at timestamptz not null default now(),
  unique (user_name, work_date)
);

-- システム設定（管理者が画面から変更可能なルール）
create table if not exists system_rules (
  key text primary key,
  value text not null,
  label text not null,
  updated_at timestamptz not null default now()
);

insert into system_rules (key, value, label) values
  ('overtime_threshold_hours', '30', '月次残業時間の閾値（時間）'),
  ('overtime_leave_grant_days', '1',  '閾値超過時の有給付与日数')
on conflict (key) do nothing;

-- 有給残日数管理
create table if not exists paid_leave_balances (
  id uuid primary key default gen_random_uuid(),
  user_name text not null,
  granted_days numeric(5,1) not null default 0,
  used_days numeric(5,1) not null default 0,
  reason text,
  target_month text,  -- 'YYYY-MM' 付与対象月
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

create extension if not exists "pgcrypto";

-- ユーザープロフィール（PIN管理・管理職フラグ）
create table if not exists user_profiles (
  user_name text primary key,
  pin_hash text not null,
  is_manager boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists attendance_records (
  id uuid primary key default gen_random_uuid(),
  user_name text not null default '',
  work_date date not null,
  start_time time not null,
  end_time time,
  overtime_start time,
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
  ('overtime_threshold_hours', '30',  '月次残業時間の閾値（時間）'),
  ('overtime_leave_grant_days', '1',  '閾値超過時の有給付与日数'),
  ('admin_pin',                '0000', '管理者PINコード'),
  ('discord_webhook_url',      '',     'Discord通知用WebhookURL'),
  ('standard_start_time',      '09:00', '所定出勤時刻'),
  ('standard_end_time',        '18:00', '所定退勤時刻')
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

-- 月次締め管理
create table if not exists monthly_closings (
  month text primary key,  -- 'YYYY-MM'
  closed_by text not null,
  closed_at timestamptz not null default now()
);

-- 休憩・外出イベント
create table if not exists attendance_events (
  id uuid primary key default gen_random_uuid(),
  user_name text not null,
  work_date date not null,
  event_type text not null check (event_type in ('break_start', 'break_end', 'outing_start', 'outing_return')),
  event_time time not null,
  created_at timestamptz not null default now()
);
create index if not exists attendance_events_user_date on attendance_events (user_name, work_date);

-- 有給休暇申請
create table if not exists leave_requests (
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
create index if not exists leave_requests_user_date on leave_requests (user_name, leave_date);

-- 祝日・会社休日
create table if not exists holidays (
  holiday_date date primary key,
  name text not null,
  kind text not null check (kind in ('national', 'company')),
  created_at timestamptz not null default now()
);

-- 監査ログ
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_name text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_at on audit_logs (created_at desc);

-- 勤怠修正申請
create table if not exists correction_requests (
  id uuid primary key default gen_random_uuid(),
  user_name text not null,
  target_date date not null,
  before_start time,
  before_end time,
  after_start time not null,
  after_end time,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  approver_name text,
  approver_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

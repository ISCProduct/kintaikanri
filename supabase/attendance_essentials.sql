-- Issue #36: 祝日・監査ログ・休暇種別カラム（既存 DB 向け）

-- 祝日・会社休日
create table if not exists public.holidays (
  holiday_date date primary key,
  name text not null,
  kind text not null check (kind in ('national', 'company')),
  created_at timestamptz not null default now()
);

alter table public.holidays enable row level security;
drop policy if exists "Allow all for holidays" on public.holidays;
create policy "Allow all for holidays"
  on public.holidays for all to anon, authenticated
  using (true) with check (true);

-- 監査ログ
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_name text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_at on public.audit_logs (created_at desc);

alter table public.audit_logs enable row level security;
drop policy if exists "Allow all for audit_logs" on public.audit_logs;
create policy "Allow all for audit_logs"
  on public.audit_logs for all to anon, authenticated
  using (true) with check (true);

-- 休暇申請: 種別（有給/病休など）を追加
alter table public.leave_requests
  add column if not exists leave_category text not null default 'paid';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leave_requests_leave_category_check'
  ) then
    alter table public.leave_requests
      add constraint leave_requests_leave_category_check
      check (leave_category in ('paid', 'sick', 'special', 'absence', 'compensatory'));
  end if;
end $$;

-- Edgewonk-inspired round 2: discipline, advanced filters, planning

alter table public.trades
  add column if not exists entry_comment text,
  add column if not exists management_comment text,
  add column if not exists exit_comment text,
  add column if not exists entry_rating smallint not null default 0 check (entry_rating in (-1, 0, 1)),
  add column if not exists management_rating smallint not null default 0 check (management_rating in (-1, 0, 1)),
  add column if not exists exit_rating smallint not null default 0 check (exit_rating in (-1, 0, 1)),
  add column if not exists custom_stats jsonb not null default '{}'::jsonb;

create table if not exists public.trading_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  setup_id uuid references public.setups(id) on delete set null,
  symbol text not null,
  side text not null check (side in ('long', 'short')),
  session text not null default 'other' check (session in ('asia', 'london', 'newyork', 'other')),
  planned_entry numeric(18, 8),
  planned_stop_loss numeric(18, 8),
  planned_take_profit numeric(18, 8),
  note text,
  status text not null default 'planned' check (status in ('planned', 'executed', 'missed')),
  planned_at timestamptz not null default now(),
  executed_trade_id uuid references public.trades(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists trading_plans_user_id_idx on public.trading_plans(user_id);
create index if not exists trading_plans_status_idx on public.trading_plans(status);

alter table public.trading_plans enable row level security;

drop policy if exists "select own trading plans" on public.trading_plans;
create policy "select own trading plans"
on public.trading_plans for select
using (auth.uid() = user_id);

drop policy if exists "insert own trading plans" on public.trading_plans;
create policy "insert own trading plans"
on public.trading_plans for insert
with check (auth.uid() = user_id);

drop policy if exists "update own trading plans" on public.trading_plans;
create policy "update own trading plans"
on public.trading_plans for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "delete own trading plans" on public.trading_plans;
create policy "delete own trading plans"
on public.trading_plans for delete
using (auth.uid() = user_id);

-- TradeOS Edgewonk v1 core schema

create table if not exists public.trading_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  broker text,
  platform text not null default 'mt5',
  account_currency text not null default 'USD',
  starting_balance numeric(14, 2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.setups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid references public.trading_accounts(id) on delete set null,
  setup_id uuid references public.setups(id) on delete set null,
  symbol text not null,
  side text not null check (side in ('long', 'short')),
  session text not null default 'other' check (session in ('asia', 'london', 'newyork', 'other')),
  status text not null default 'closed' check (status in ('open', 'closed')),
  opened_at timestamptz not null,
  closed_at timestamptz,
  entry_price numeric(18, 8),
  exit_price numeric(18, 8),
  stop_loss numeric(18, 8),
  take_profit numeric(18, 8),
  risk_amount numeric(14, 2),
  position_size numeric(18, 4),
  fees numeric(14, 2) not null default 0,
  swap numeric(14, 2) not null default 0,
  net_pnl numeric(14, 2) not null default 0,
  r_multiple numeric(10, 4),
  confidence smallint check (confidence between 1 and 100),
  plan_followed boolean not null default true,
  mistake text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists trades_user_id_idx on public.trades(user_id);
create index if not exists trades_opened_at_idx on public.trades(opened_at desc);
create index if not exists trades_symbol_idx on public.trades(symbol);
create index if not exists trades_setup_id_idx on public.trades(setup_id);

create table if not exists public.trade_tags (
  trade_id uuid not null references public.trades(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (trade_id, tag_id)
);

-- Link legacy journal notes to trades when needed
alter table public.journal_entries
  add column if not exists trade_id uuid references public.trades(id) on delete set null;

alter table public.trading_accounts enable row level security;
alter table public.setups enable row level security;
alter table public.tags enable row level security;
alter table public.trades enable row level security;
alter table public.trade_tags enable row level security;

-- trading_accounts policies
 drop policy if exists "select own trading accounts" on public.trading_accounts;
 create policy "select own trading accounts"
 on public.trading_accounts for select
 using (auth.uid() = user_id);

 drop policy if exists "insert own trading accounts" on public.trading_accounts;
 create policy "insert own trading accounts"
 on public.trading_accounts for insert
 with check (auth.uid() = user_id);

 drop policy if exists "update own trading accounts" on public.trading_accounts;
 create policy "update own trading accounts"
 on public.trading_accounts for update
 using (auth.uid() = user_id)
 with check (auth.uid() = user_id);

 drop policy if exists "delete own trading accounts" on public.trading_accounts;
 create policy "delete own trading accounts"
 on public.trading_accounts for delete
 using (auth.uid() = user_id);

-- setups policies
 drop policy if exists "select own setups" on public.setups;
 create policy "select own setups"
 on public.setups for select
 using (auth.uid() = user_id);

 drop policy if exists "insert own setups" on public.setups;
 create policy "insert own setups"
 on public.setups for insert
 with check (auth.uid() = user_id);

 drop policy if exists "update own setups" on public.setups;
 create policy "update own setups"
 on public.setups for update
 using (auth.uid() = user_id)
 with check (auth.uid() = user_id);

 drop policy if exists "delete own setups" on public.setups;
 create policy "delete own setups"
 on public.setups for delete
 using (auth.uid() = user_id);

-- tags policies
 drop policy if exists "select own tags" on public.tags;
 create policy "select own tags"
 on public.tags for select
 using (auth.uid() = user_id);

 drop policy if exists "insert own tags" on public.tags;
 create policy "insert own tags"
 on public.tags for insert
 with check (auth.uid() = user_id);

 drop policy if exists "update own tags" on public.tags;
 create policy "update own tags"
 on public.tags for update
 using (auth.uid() = user_id)
 with check (auth.uid() = user_id);

 drop policy if exists "delete own tags" on public.tags;
 create policy "delete own tags"
 on public.tags for delete
 using (auth.uid() = user_id);

-- trades policies
 drop policy if exists "select own trades" on public.trades;
 create policy "select own trades"
 on public.trades for select
 using (auth.uid() = user_id);

 drop policy if exists "insert own trades" on public.trades;
 create policy "insert own trades"
 on public.trades for insert
 with check (auth.uid() = user_id);

 drop policy if exists "update own trades" on public.trades;
 create policy "update own trades"
 on public.trades for update
 using (auth.uid() = user_id)
 with check (auth.uid() = user_id);

 drop policy if exists "delete own trades" on public.trades;
 create policy "delete own trades"
 on public.trades for delete
 using (auth.uid() = user_id);

-- trade_tags policies (ownership derived through trade + tag)
 drop policy if exists "select own trade tags" on public.trade_tags;
 create policy "select own trade tags"
 on public.trade_tags for select
 using (
   exists (
     select 1 from public.trades t
     where t.id = trade_id and t.user_id = auth.uid()
   )
 );

 drop policy if exists "insert own trade tags" on public.trade_tags;
 create policy "insert own trade tags"
 on public.trade_tags for insert
 with check (
   exists (
     select 1 from public.trades t
     where t.id = trade_id and t.user_id = auth.uid()
   )
   and exists (
     select 1 from public.tags tg
     where tg.id = tag_id and tg.user_id = auth.uid()
   )
 );

 drop policy if exists "delete own trade tags" on public.trade_tags;
 create policy "delete own trade tags"
 on public.trade_tags for delete
 using (
   exists (
     select 1 from public.trades t
     where t.id = trade_id and t.user_id = auth.uid()
   )
 );

create or replace view public.trade_daily_summary
with (security_invoker = true) as
select
  t.user_id,
  (coalesce(t.closed_at, t.opened_at) at time zone 'utc')::date as trade_date,
  count(*)::int as trades_count,
  sum(t.net_pnl)::numeric(14, 2) as net_pnl,
  sum(t.fees)::numeric(14, 2) as total_fees,
  sum(case when t.net_pnl > 0 then 1 else 0 end)::int as wins,
  sum(case when t.net_pnl < 0 then 1 else 0 end)::int as losses
from public.trades t
group by t.user_id, (coalesce(t.closed_at, t.opened_at) at time zone 'utc')::date;
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

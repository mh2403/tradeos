-- MT5 connection settings + ingest identity for idempotent imports

create table if not exists public.mt5_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trading_account_id uuid references public.trading_accounts(id) on delete set null,
  api_key text not null unique,
  mt5_login text,
  broker text,
  server text,
  sync_enabled boolean not null default true,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.mt5_connections enable row level security;

create or replace function public.touch_mt5_connections_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_mt5_connections_updated_at on public.mt5_connections;
create trigger touch_mt5_connections_updated_at
before update on public.mt5_connections
for each row execute function public.touch_mt5_connections_updated_at();

drop policy if exists "select own mt5 connections" on public.mt5_connections;
create policy "select own mt5 connections"
on public.mt5_connections for select
using (auth.uid() = user_id);

drop policy if exists "insert own mt5 connections" on public.mt5_connections;
create policy "insert own mt5 connections"
on public.mt5_connections for insert
with check (auth.uid() = user_id);

drop policy if exists "update own mt5 connections" on public.mt5_connections;
create policy "update own mt5 connections"
on public.mt5_connections for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "delete own mt5 connections" on public.mt5_connections;
create policy "delete own mt5 connections"
on public.mt5_connections for delete
using (auth.uid() = user_id);

alter table public.trades
  add column if not exists external_source text not null default 'manual',
  add column if not exists external_trade_id text,
  add column if not exists external_position_id text,
  add column if not exists external_order_id text,
  add column if not exists imported_at timestamptz,
  add constraint trades_external_source_check check (external_source in ('manual', 'mt5'));

create unique index if not exists trades_mt5_external_trade_unique
on public.trades(user_id, external_source, external_trade_id);

create index if not exists trades_external_source_idx
on public.trades(external_source);

grant select, insert, update, delete on table public.mt5_connections to authenticated;

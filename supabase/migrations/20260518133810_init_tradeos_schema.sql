-- TradeOS starter schema

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

alter table public.journal_entries enable row level security;

create policy "select own journal entries"
on public.journal_entries
for select
using (auth.uid() = user_id);

create policy "insert own journal entries"
on public.journal_entries
for insert
with check (auth.uid() = user_id);

create policy "update own journal entries"
on public.journal_entries
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "delete own journal entries"
on public.journal_entries
for delete
using (auth.uid() = user_id);

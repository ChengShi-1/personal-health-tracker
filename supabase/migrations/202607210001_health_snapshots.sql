create table if not exists public.health_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.health_snapshots enable row level security;

grant select, insert, update, delete on public.health_snapshots to authenticated;

create policy "Users can read their own health snapshot"
on public.health_snapshots for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own health snapshot"
on public.health_snapshots for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own health snapshot"
on public.health_snapshots for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own health snapshot"
on public.health_snapshots for delete to authenticated
using ((select auth.uid()) = user_id);

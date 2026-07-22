create table public.health_chat_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  request jsonb not null,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index health_chat_jobs_user_created_idx
  on public.health_chat_jobs (user_id, created_at desc);

alter table public.health_chat_jobs enable row level security;

grant select, insert, delete on public.health_chat_jobs to authenticated;

create policy "Users can read their own chat jobs"
on public.health_chat_jobs for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own chat jobs"
on public.health_chat_jobs for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own chat jobs"
on public.health_chat_jobs for delete to authenticated
using ((select auth.uid()) = user_id);

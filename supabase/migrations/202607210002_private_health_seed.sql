create table if not exists public.health_seed_data (
  id boolean primary key default true check (id),
  data jsonb not null,
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.health_seed_data enable row level security;
revoke all on public.health_seed_data from anon, authenticated;

create or replace function public.claim_health_seed()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  seed jsonb;
begin
  if caller is null then
    raise exception 'Authentication required';
  end if;

  select data into seed
  from public.health_seed_data
  where id = true and claimed_by is null
  for update;

  if seed is null then
    return null;
  end if;

  insert into public.health_snapshots (user_id, data, updated_at)
  values (caller, seed, now())
  on conflict (user_id) do update
    set data = excluded.data, updated_at = excluded.updated_at;

  update public.health_seed_data
  set claimed_by = caller, claimed_at = now()
  where id = true;

  return seed;
end;
$$;

revoke all on function public.claim_health_seed() from public, anon;
grant execute on function public.claim_health_seed() to authenticated;

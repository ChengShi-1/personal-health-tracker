create table public.menstrual_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  start_date date not null,
  end_date date,
  flow text check (flow in ('light','medium','heavy')),
  symptoms text[] not null default '{}',
  is_estimated boolean not null default false,
  notes text,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index menstrual_entries_user_date_idx
  on public.menstrual_entries (user_id, start_date);

alter table public.menstrual_entries enable row level security;
grant select, insert, update, delete on public.menstrual_entries to authenticated;

create policy "Users manage own menstrual entries"
on public.menstrual_entries for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.get_menstrual_entries()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'date', to_char(start_date, 'YYYY-MM-DD'),
    'endDate', case when end_date is null then null else to_char(end_date, 'YYYY-MM-DD') end,
    'flow', flow,
    'symptoms', symptoms,
    'isEstimated', is_estimated,
    'notes', notes
  ) order by start_date, id), '[]'::jsonb)
  from public.menstrual_entries
  where user_id = auth.uid();
$$;

create or replace function public.save_menstrual_entries(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from public.menstrual_entries where user_id = auth.uid();
  insert into public.menstrual_entries
    (user_id, id, start_date, end_date, flow, symptoms, is_estimated, notes)
  select auth.uid(), x->>'id', (x->>'date')::date,
    nullif(x->>'endDate','')::date, nullif(x->>'flow',''),
    array(select jsonb_array_elements_text(
      case when jsonb_typeof(x->'symptoms')='array' then x->'symptoms' else '[]'::jsonb end
    )),
    coalesce((x->>'isEstimated')::boolean, false), x->>'notes'
  from jsonb_array_elements(coalesce(payload, '[]'::jsonb)) x;
end;
$$;

revoke all on function public.get_menstrual_entries() from public, anon;
revoke all on function public.save_menstrual_entries(jsonb) from public, anon;
grant execute on function public.get_menstrual_entries() to authenticated;
grant execute on function public.save_menstrual_entries(jsonb) to authenticated;

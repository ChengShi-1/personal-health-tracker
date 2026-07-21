create table public.health_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  data_audit jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.nutrition_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  entry_date date not null,
  entry_time time,
  meal_type text check (meal_type in ('breakfast','lunch','dinner','snack','drink')),
  food_name text not null,
  quantity numeric,
  unit text,
  calories_kcal integer,
  protein_g integer,
  carbs_g integer,
  fat_g integer,
  fiber_g integer,
  is_estimated boolean not null default false,
  estimation_reason text,
  source_text text,
  notes text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.cardio_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  entry_date date not null,
  start_time time,
  activity_type text not null check (activity_type in ('dance','walking','running','cycling','other')),
  activity_name text,
  duration_minutes integer,
  distance_km numeric,
  steps integer,
  calories_burned_kcal integer,
  average_heart_rate_bpm integer,
  max_heart_rate_bpm integer,
  activity_strain numeric,
  intensity text check (intensity in ('low','moderate','high')),
  is_estimated boolean not null default false,
  estimation_reason text,
  source_text text,
  notes text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.strength_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  entry_date date not null,
  exercise_name text not null,
  primary_body_parts text[] not null default '{}',
  secondary_body_parts text[] not null default '{}',
  sets integer,
  total_reps integer,
  weight_kg numeric,
  duration_minutes integer,
  calories_burned_kcal integer,
  average_heart_rate_bpm integer,
  max_heart_rate_bpm integer,
  volume_kg numeric,
  is_estimated boolean not null default false,
  estimation_reason text,
  source_text text,
  notes text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.body_metric_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  entry_date date not null,
  weight_kg numeric,
  body_fat_percentage numeric,
  waist_cm numeric,
  hip_cm numeric,
  chest_cm numeric,
  thigh_cm numeric,
  arm_cm numeric,
  is_estimated boolean not null default false,
  source_text text,
  notes text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.audited_daily_totals (
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  calories_kcal integer not null,
  calorie_range_kcal integer[],
  protein_g integer,
  protein_range_g integer[],
  is_estimated boolean not null default false,
  source text not null default '',
  reason text not null default '',
  raw_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_date)
);

create index nutrition_entries_user_date_idx on public.nutrition_entries (user_id, entry_date);
create index cardio_entries_user_date_idx on public.cardio_entries (user_id, entry_date);
create index strength_entries_user_date_idx on public.strength_entries (user_id, entry_date);
create index body_metric_entries_user_date_idx on public.body_metric_entries (user_id, entry_date);

alter table public.health_profiles enable row level security;
alter table public.nutrition_entries enable row level security;
alter table public.cardio_entries enable row level security;
alter table public.strength_entries enable row level security;
alter table public.body_metric_entries enable row level security;
alter table public.audited_daily_totals enable row level security;

grant select, insert, update, delete on public.health_profiles, public.nutrition_entries,
  public.cardio_entries, public.strength_entries, public.body_metric_entries,
  public.audited_daily_totals to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['health_profiles','nutrition_entries','cardio_entries','strength_entries','body_metric_entries','audited_daily_totals'] loop
    execute format('create policy %I on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', 'Users manage own ' || table_name, table_name);
  end loop;
end $$;

create or replace function public._replace_normalized_health_data(target_user uuid, payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.nutrition_entries where user_id = target_user;
  delete from public.cardio_entries where user_id = target_user;
  delete from public.strength_entries where user_id = target_user;
  delete from public.body_metric_entries where user_id = target_user;
  delete from public.audited_daily_totals where user_id = target_user;

  insert into public.health_profiles (user_id, profile, metadata, data_audit, updated_at)
  values (target_user, coalesce(payload->'profile','{}'), coalesce(payload->'metadata','{}'), coalesce(payload->'dataAudit','{}'), now())
  on conflict (user_id) do update set profile=excluded.profile, metadata=excluded.metadata, data_audit=excluded.data_audit, updated_at=now();

  insert into public.nutrition_entries
    (user_id,id,entry_date,entry_time,meal_type,food_name,quantity,unit,calories_kcal,protein_g,carbs_g,fat_g,fiber_g,is_estimated,estimation_reason,source_text,notes,raw_data)
  select target_user, x->>'id', (x->>'date')::date, nullif(x->>'time','')::time, x->>'mealType', x->>'foodName',
    nullif(x->>'quantity','')::numeric, x->>'unit', nullif(x->>'caloriesKcal','')::integer,
    nullif(x->>'proteinG','')::integer, nullif(x->>'carbsG','')::integer, nullif(x->>'fatG','')::integer,
    nullif(x->>'fiberG','')::integer, coalesce((x->>'isEstimated')::boolean,false), x->>'estimationReason',
    x->>'sourceText', x->>'notes', x
  from jsonb_array_elements(coalesce(payload->'nutritionEntries','[]')) x;

  insert into public.cardio_entries
    (user_id,id,entry_date,start_time,activity_type,activity_name,duration_minutes,distance_km,steps,calories_burned_kcal,average_heart_rate_bpm,max_heart_rate_bpm,activity_strain,intensity,is_estimated,estimation_reason,source_text,notes,raw_data)
  select target_user, x->>'id', (x->>'date')::date, nullif(x->>'startTime','')::time, x->>'activityType', x->>'activityName',
    nullif(x->>'durationMinutes','')::integer, nullif(x->>'distanceKm','')::numeric, nullif(x->>'steps','')::integer,
    nullif(x->>'caloriesBurnedKcal','')::integer, nullif(x->>'averageHeartRateBpm','')::integer,
    nullif(x->>'maxHeartRateBpm','')::integer, nullif(x->>'activityStrain','')::numeric, x->>'intensity',
    coalesce((x->>'isEstimated')::boolean,false), x->>'estimationReason', x->>'sourceText', x->>'notes', x
  from jsonb_array_elements(coalesce(payload->'cardioEntries','[]')) x;

  insert into public.strength_entries
    (user_id,id,entry_date,exercise_name,primary_body_parts,secondary_body_parts,sets,total_reps,weight_kg,duration_minutes,calories_burned_kcal,average_heart_rate_bpm,max_heart_rate_bpm,volume_kg,is_estimated,estimation_reason,source_text,notes,raw_data)
  select target_user, x->>'id', (x->>'date')::date, x->>'exerciseName',
    array(select jsonb_array_elements_text(case when jsonb_typeof(x->'primaryBodyParts')='array' then x->'primaryBodyParts' else '[]'::jsonb end)),
    array(select jsonb_array_elements_text(case when jsonb_typeof(x->'secondaryBodyParts')='array' then x->'secondaryBodyParts' else '[]'::jsonb end)),
    nullif(x->>'sets','')::integer, nullif(x->>'totalReps','')::integer, nullif(x->>'weightKg','')::numeric,
    nullif(x->>'durationMinutes','')::integer, nullif(x->>'caloriesBurnedKcal','')::integer,
    nullif(x->>'averageHeartRateBpm','')::integer, nullif(x->>'maxHeartRateBpm','')::integer,
    nullif(x->>'volumeKg','')::numeric, coalesce((x->>'isEstimated')::boolean,false), x->>'estimationReason',
    x->>'sourceText', x->>'notes', x
  from jsonb_array_elements(coalesce(payload->'strengthEntries','[]')) x;

  insert into public.body_metric_entries
    (user_id,id,entry_date,weight_kg,body_fat_percentage,waist_cm,hip_cm,chest_cm,thigh_cm,arm_cm,is_estimated,source_text,notes,raw_data)
  select target_user, x->>'id', (x->>'date')::date, nullif(x->>'weightKg','')::numeric,
    nullif(x->>'bodyFatPercentage','')::numeric, nullif(x->>'waistCm','')::numeric, nullif(x->>'hipCm','')::numeric,
    nullif(x->>'chestCm','')::numeric, nullif(x->>'thighCm','')::numeric, nullif(x->>'armCm','')::numeric,
    coalesce((x->>'isEstimated')::boolean,false), x->>'sourceText', x->>'notes', x
  from jsonb_array_elements(coalesce(payload->'bodyMetricEntries','[]')) x;

  insert into public.audited_daily_totals
    (user_id,entry_date,calories_kcal,calorie_range_kcal,protein_g,protein_range_g,is_estimated,source,reason,raw_data)
  select target_user, (x->>'date')::date, (x->>'caloriesKcal')::integer,
    array(select jsonb_array_elements_text(case when jsonb_typeof(x->'calorieRangeKcal')='array' then x->'calorieRangeKcal' else '[]'::jsonb end))::integer[],
    nullif(x->>'proteinG','')::integer,
    array(select jsonb_array_elements_text(case when jsonb_typeof(x->'proteinRangeG')='array' then x->'proteinRangeG' else '[]'::jsonb end))::integer[],
    coalesce((x->>'isEstimated')::boolean,false), coalesce(x->>'source',''), coalesce(x->>'reason',''), x
  from jsonb_array_elements(coalesce(payload->'auditedDailyTotals','[]')) x;
end;
$$;

do $$
declare snapshot record;
begin
  for snapshot in select user_id, data from public.health_snapshots loop
    perform public._replace_normalized_health_data(snapshot.user_id, public.correct_july_protein(snapshot.data));
  end loop;
end $$;

create or replace function public.get_health_data()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'nutritionEntries', coalesce((select jsonb_agg(raw_data order by entry_date,id) from public.nutrition_entries where user_id=auth.uid()),'[]'),
    'cardioEntries', coalesce((select jsonb_agg(raw_data order by entry_date,id) from public.cardio_entries where user_id=auth.uid()),'[]'),
    'strengthEntries', coalesce((select jsonb_agg(raw_data order by entry_date,id) from public.strength_entries where user_id=auth.uid()),'[]'),
    'bodyMetricEntries', coalesce((select jsonb_agg(raw_data order by entry_date,id) from public.body_metric_entries where user_id=auth.uid()),'[]'),
    'auditedDailyTotals', coalesce((select jsonb_agg(raw_data order by entry_date) from public.audited_daily_totals where user_id=auth.uid()),'[]'),
    'profile', coalesce((select profile from public.health_profiles where user_id=auth.uid()),'{}'),
    'metadata', coalesce((select metadata from public.health_profiles where user_id=auth.uid()),'{}'),
    'dataAudit', coalesce((select data_audit from public.health_profiles where user_id=auth.uid()),'{}')
  );
$$;

create or replace function public.save_health_data(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform public._replace_normalized_health_data(auth.uid(), payload);
end;
$$;

create or replace function public.claim_health_seed_normalized()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare seed jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.health_profiles where user_id=auth.uid()) then return false; end if;
  select data into seed from public.health_seed_data where id=true and claimed_by is null for update;
  if seed is null then return false; end if;
  perform public._replace_normalized_health_data(auth.uid(), public.correct_july_protein(seed));
  update public.health_seed_data set claimed_by=auth.uid(), claimed_at=now() where id=true;
  return true;
end;
$$;

revoke all on function public._replace_normalized_health_data(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.get_health_data() from public, anon;
revoke all on function public.save_health_data(jsonb) from public, anon;
revoke all on function public.claim_health_seed_normalized() from public, anon;
grant execute on function public.get_health_data(), public.save_health_data(jsonb), public.claim_health_seed_normalized() to authenticated;

drop function if exists public.claim_health_seed();
drop function if exists public.apply_health_data_corrections();
drop table public.health_snapshots;

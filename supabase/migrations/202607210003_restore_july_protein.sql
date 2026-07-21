create or replace function public.correct_july_protein(payload jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_set(
    payload,
    '{auditedDailyTotals}',
    coalesce((
      select jsonb_agg(
        case item->>'date'
          when '2026-07-15' then item || jsonb_build_object('proteinG', 87, 'isEstimated', true)
          when '2026-07-16' then item || jsonb_build_object(
            'proteinG', 74,
            'proteinRangeG', jsonb_build_array(69, 79),
            'isEstimated', true,
            'reason', 'Recovered from the original conversation final estimate of 69–79 g; midpoint rounded to 74 g.'
          )
          when '2026-07-17' then item || jsonb_build_object('proteinG', 68, 'isEstimated', true)
          when '2026-07-18' then item || jsonb_build_object(
            'proteinG', 100,
            'proteinRangeG', jsonb_build_array(95, 105),
            'isEstimated', true,
            'reason', 'Recovered from the original conversation statement that final protein was close to 100 g.'
          )
          when '2026-07-19' then item || jsonb_build_object('proteinG', 92, 'isEstimated', true)
          else item
        end
        order by ordinal
      )
      from jsonb_array_elements(coalesce(payload->'auditedDailyTotals', '[]'::jsonb))
        with ordinality as totals(item, ordinal)
    ), '[]'::jsonb),
    true
  );
$$;

update public.health_seed_data
set data = public.correct_july_protein(data)
where id = true;

create or replace function public.apply_health_data_corrections()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  corrected jsonb;
begin
  if caller is null then
    raise exception 'Authentication required';
  end if;

  update public.health_snapshots
  set data = public.correct_july_protein(data), updated_at = now()
  where user_id = caller
  returning data into corrected;

  return corrected;
end;
$$;

revoke all on function public.correct_july_protein(jsonb) from public, anon, authenticated;
revoke all on function public.apply_health_data_corrections() from public, anon;
grant execute on function public.apply_health_data_corrections() to authenticated;

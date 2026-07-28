-- Reject suspicious whole-dataset truncation while allowing normal single-record deletion.
create or replace function public.save_health_data(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_nutrition integer;
  current_cardio integer;
  current_strength integer;
  incoming_nutrition integer := jsonb_array_length(coalesce(payload->'nutritionEntries','[]'));
  incoming_cardio integer := jsonb_array_length(coalesce(payload->'cardioEntries','[]'));
  incoming_strength integer := jsonb_array_length(coalesce(payload->'strengthEntries','[]'));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select count(*) into current_nutrition from public.nutrition_entries where user_id=auth.uid();
  select count(*) into current_cardio from public.cardio_entries where user_id=auth.uid();
  select count(*) into current_strength from public.strength_entries where user_id=auth.uid();

  if incoming_nutrition < current_nutrition - 3
    or incoming_cardio < current_cardio - 3
    or incoming_strength < current_strength - 3 then
    raise exception 'Bulk data loss protection: incoming health dataset is unexpectedly smaller';
  end if;

  perform public._replace_normalized_health_data(auth.uid(), payload);
end;
$$;

revoke all on function public.save_health_data(jsonb) from public, anon;
grant execute on function public.save_health_data(jsonb) to authenticated;

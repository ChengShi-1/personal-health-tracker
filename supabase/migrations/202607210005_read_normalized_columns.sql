create or replace function public.get_health_data()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'nutritionEntries', coalesce((
      select jsonb_agg(raw_data || jsonb_build_object(
        'id',id,'date',to_char(entry_date,'YYYY-MM-DD'),'time',entry_time,'mealType',meal_type,
        'foodName',food_name,'quantity',quantity,'unit',unit,'caloriesKcal',calories_kcal,
        'proteinG',protein_g,'carbsG',carbs_g,'fatG',fat_g,'fiberG',fiber_g,
        'isEstimated',is_estimated,'estimationReason',estimation_reason,'sourceText',source_text,'notes',notes
      ) order by entry_date,id)
      from public.nutrition_entries where user_id=auth.uid()
    ),'[]'),
    'cardioEntries', coalesce((
      select jsonb_agg(raw_data || jsonb_build_object(
        'id',id,'date',to_char(entry_date,'YYYY-MM-DD'),'startTime',start_time,
        'activityType',activity_type,'activityName',activity_name,'durationMinutes',duration_minutes,
        'distanceKm',distance_km,'steps',steps,'caloriesBurnedKcal',calories_burned_kcal,
        'averageHeartRateBpm',average_heart_rate_bpm,'maxHeartRateBpm',max_heart_rate_bpm,
        'activityStrain',activity_strain,'intensity',intensity,'isEstimated',is_estimated,
        'estimationReason',estimation_reason,'sourceText',source_text,'notes',notes
      ) order by entry_date,id)
      from public.cardio_entries where user_id=auth.uid()
    ),'[]'),
    'strengthEntries', coalesce((
      select jsonb_agg(raw_data || jsonb_build_object(
        'id',id,'date',to_char(entry_date,'YYYY-MM-DD'),'exerciseName',exercise_name,
        'primaryBodyParts',primary_body_parts,'secondaryBodyParts',secondary_body_parts,
        'sets',sets,'totalReps',total_reps,'weightKg',weight_kg,'durationMinutes',duration_minutes,
        'caloriesBurnedKcal',calories_burned_kcal,'averageHeartRateBpm',average_heart_rate_bpm,
        'maxHeartRateBpm',max_heart_rate_bpm,'volumeKg',volume_kg,'isEstimated',is_estimated,
        'estimationReason',estimation_reason,'sourceText',source_text,'notes',notes
      ) order by entry_date,id)
      from public.strength_entries where user_id=auth.uid()
    ),'[]'),
    'bodyMetricEntries', coalesce((
      select jsonb_agg(raw_data || jsonb_build_object(
        'id',id,'date',to_char(entry_date,'YYYY-MM-DD'),'weightKg',weight_kg,
        'bodyFatPercentage',body_fat_percentage,'waistCm',waist_cm,'hipCm',hip_cm,
        'chestCm',chest_cm,'thighCm',thigh_cm,'armCm',arm_cm,'isEstimated',is_estimated,
        'sourceText',source_text,'notes',notes
      ) order by entry_date,id)
      from public.body_metric_entries where user_id=auth.uid()
    ),'[]'),
    'auditedDailyTotals', coalesce((
      select jsonb_agg(raw_data || jsonb_build_object(
        'date',to_char(entry_date,'YYYY-MM-DD'),'caloriesKcal',calories_kcal,
        'calorieRangeKcal',calorie_range_kcal,'proteinG',protein_g,'proteinRangeG',protein_range_g,
        'isEstimated',is_estimated,'source',source,'reason',reason
      ) order by entry_date)
      from public.audited_daily_totals where user_id=auth.uid()
    ),'[]'),
    'profile', coalesce((select profile from public.health_profiles where user_id=auth.uid()),'{}'),
    'metadata', coalesce((select metadata from public.health_profiles where user_id=auth.uid()),'{}'),
    'dataAudit', coalesce((select data_audit from public.health_profiles where user_id=auth.uid()),'{}')
  );
$$;

revoke all on function public.get_health_data() from public, anon;
grant execute on function public.get_health_data() to authenticated;

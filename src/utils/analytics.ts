import {
  eachDayOfInterval,
  format,
  parseISO,
  startOfWeek,
} from "date-fns";
import type { HealthData, StrengthEntry } from "../types/health";

const sum = (values: (number | null | undefined)[]) =>
  values.reduce<number>((total, value) => total + (value ?? 0), 0);

const bodyWeightForDate = (data: HealthData, date: string) => {
  const known = data.bodyMetricEntries
    .filter((entry) => entry.weightKg != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  return (
    known.filter((entry) => entry.date <= date).at(-1)?.weightKg ??
    known.at(-1)?.weightKg ??
    null
  );
};

const estimatedStrengthCalories = (
  entry: StrengthEntry,
  weightKg: number | null,
) => {
  if (entry.caloriesBurnedKcal != null)
    return { calories: entry.caloriesBurnedKcal, estimated: entry.isEstimated };
  if (weightKg == null) return { calories: null, estimated: false };
  const minutes =
    entry.durationMinutes != null
      ? entry.durationMinutes
      : entry.sets != null
        ? entry.sets * 1.5
        : null;
  if (minutes == null || minutes <= 0)
    return { calories: null, estimated: false };
  // 3.5 MET：一般中等强度力量训练；kcal = MET × 3.5 × kg ÷ 200 × min。
  return {
    calories: Math.round((3.5 * 3.5 * weightKg * minutes) / 200),
    estimated: true,
  };
};

export function daily(data: HealthData) {
  const dates = [
    ...data.nutritionEntries,
    ...data.cardioEntries,
    ...data.strengthEntries,
    ...data.bodyMetricEntries,
    ...(data.auditedDailyTotals ?? []),
  ]
    .map((entry) => entry.date)
    .sort();
  if (!dates.length) return [];
  return eachDayOfInterval({
    start: parseISO(dates[0]),
    end: parseISO(dates.at(-1)!),
  }).map((day) => {
    const date = format(day, "yyyy-MM-dd");
    const nutrition = data.nutritionEntries.filter(
      (entry) => entry.date === date,
    );
    const cardioEntries = data.cardioEntries.filter(
      (entry) => entry.date === date,
    );
    const strengthEntries = data.strengthEntries.filter(
      (entry) => entry.date === date,
    );
    const audited = data.auditedDailyTotals?.find(
      (entry) => entry.date === date,
    );
    const known = (
      key: "caloriesKcal" | "proteinG" | "carbsG" | "fatG",
    ) =>
      nutrition.some((entry) => entry[key] != null)
        ? sum(nutrition.map((entry) => entry[key]))
        : null;
    const cardioWithCalories = cardioEntries.filter(
      (entry) => entry.caloriesBurnedKcal != null,
    );
    const cardioBurn = cardioWithCalories.length
      ? sum(cardioWithCalories.map((entry) => entry.caloriesBurnedKcal))
      : null;
    const weightKg = bodyWeightForDate(data, date);
    const strengthEstimates = strengthEntries.map((entry) =>
      estimatedStrengthCalories(entry, weightKg),
    );
    const strengthWithCalories = strengthEstimates.filter(
      (entry) => entry.calories != null,
    );
    const strengthBurn = strengthWithCalories.length
      ? sum(strengthWithCalories.map((entry) => entry.calories))
      : null;
    const hasBurn = cardioBurn != null || strengthBurn != null;
    return {
      date,
      label: format(day, "M/d"),
      calories: audited?.caloriesKcal ?? known("caloriesKcal"),
      protein: audited?.proteinG ?? known("proteinG"),
      carbs: known("carbsG"),
      fat: known("fatG"),
      cardio: sum(cardioEntries.map((entry) => entry.durationMinutes)),
      strength: strengthEntries.some((entry) => entry.durationMinutes != null)
        ? sum(strengthEntries.map((entry) => entry.durationMinutes))
        : null,
      cardioBurn,
      strengthBurn,
      strengthBurnEstimated: strengthWithCalories.some(
        (entry) => entry.estimated,
      ),
      burned: hasBurn ? (cardioBurn ?? 0) + (strengthBurn ?? 0) : null,
      burnedEstimated: strengthWithCalories.some((entry) => entry.estimated),
      hasNutrition: nutrition.length > 0 || audited != null,
      hasCardio: cardioEntries.length > 0,
      hasStrength: strengthEntries.length > 0,
    };
  });
}

export function weekly(data: HealthData) {
  const result = new Map<
    string,
    {
      week: string;
      cardio: number;
      strength: number;
      sessions: number;
      volume: number;
    }
  >();
  daily(data).forEach((entry) => {
    const week = format(
      startOfWeek(parseISO(entry.date), { weekStartsOn: 1 }),
      "M/d",
    );
    const value = result.get(week) ?? {
      week,
      cardio: 0,
      strength: 0,
      sessions: 0,
      volume: 0,
    };
    value.cardio += entry.cardio;
    value.strength += entry.strength ?? 0;
    result.set(week, value);
  });
  data.strengthEntries.forEach((entry) => {
    const key = format(
      startOfWeek(parseISO(entry.date), { weekStartsOn: 1 }),
      "M/d",
    );
    const value = result.get(key);
    if (value) {
      value.sessions++;
      value.volume += entry.volumeKg ?? 0;
    }
  });
  return [...result.values()];
}

export const fmt = (value: number | null | undefined, digits = 0) =>
  value == null
    ? "—"
    : Number.isInteger(value)
      ? String(value)
      : value.toFixed(digits);

export function movingAverage(
  values: { date: string; weightKg?: number | null }[],
) {
  return values.map((entry, index) => {
    const window = values
      .slice(Math.max(0, index - 6), index + 1)
      .map((value) => value.weightKg)
      .filter((value): value is number => value != null);
    return {
      ...entry,
      average: window.length ? sum(window) / window.length : null,
      label: format(parseISO(entry.date), "M/d"),
    };
  });
}

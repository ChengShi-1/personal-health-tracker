export type MealType = "breakfast" | "lunch" | "dinner" | "snack" | "drink";
export type BodyPart =
  | "Chest"
  | "Back"
  | "Shoulders"
  | "Biceps"
  | "Triceps"
  | "Core"
  | "Glutes"
  | "Quadriceps"
  | "Hamstrings"
  | "Calves"
  | "Full Body"
  | "Other";
export interface NutritionEntry {
  id: string;
  date: string;
  time?: string | null;
  mealType?: MealType;
  foodName: string;
  quantity?: number | null;
  unit?: string | null;
  caloriesKcal?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  fiberG?: number | null;
  isEstimated: boolean;
  estimationReason?: string | null;
  sourceText?: string;
  notes?: string | null;
}
export interface CardioEntry {
  id: string;
  date: string;
  startTime?: string | null;
  activityType: "dance" | "walking" | "running" | "cycling" | "other";
  activityName?: string;
  durationMinutes?: number | null;
  distanceKm?: number | null;
  steps?: number | null;
  caloriesBurnedKcal?: number | null;
  averageHeartRateBpm?: number | null;
  maxHeartRateBpm?: number | null;
  activityStrain?: number | null;
  intensity?: "low" | "moderate" | "high";
  isEstimated: boolean;
  estimationReason?: string | null;
  sourceText?: string;
  notes?: string | null;
}
export interface StrengthEntry {
  id: string;
  date: string;
  exerciseName: string;
  primaryBodyParts: BodyPart[];
  secondaryBodyParts: BodyPart[];
  sets?: number | null;
  totalReps?: number | null;
  weightKg?: number | null;
  durationMinutes?: number | null;
  caloriesBurnedKcal?: number | null;
  averageHeartRateBpm?: number | null;
  maxHeartRateBpm?: number | null;
  volumeKg?: number | null;
  isEstimated: boolean;
  estimationReason?: string | null;
  sourceText?: string;
  notes?: string | null;
}
export interface BodyMetricEntry {
  id: string;
  date: string;
  weightKg?: number | null;
  bodyFatPercentage?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
  chestCm?: number | null;
  thighCm?: number | null;
  armCm?: number | null;
  isEstimated?: boolean;
  sourceText?: string;
  notes?: string | null;
}
export interface AuditedDailyTotal {
  date: string;
  caloriesKcal: number;
  calorieRangeKcal?: number[] | null;
  proteinG?: number | null;
  proteinRangeG?: number[] | null;
  isEstimated: boolean;
  source: string;
  reason: string;
}
export interface HealthData {
  nutritionEntries: NutritionEntry[];
  cardioEntries: CardioEntry[];
  strengthEntries: StrengthEntry[];
  bodyMetricEntries: BodyMetricEntry[];
  auditedDailyTotals?: AuditedDailyTotal[];
  dataAudit: Record<string, unknown>;
  metadata: Record<string, unknown>;
  profile: Record<string, unknown>;
}
export const emptyHealthData = (): HealthData => ({
  nutritionEntries: [],
  cardioEntries: [],
  strengthEntries: [],
  bodyMetricEntries: [],
  auditedDailyTotals: [],
  dataAudit: {},
  metadata: {},
  profile: {},
});

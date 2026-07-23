import { useState } from "react";
import { format } from "date-fns";
import type {
  BodyPart,
  BodyMetricEntry,
  CardioEntry,
  MenstrualEntry,
  NutritionEntry,
  StrengthEntry,
} from "../types/health";

export type EntryKind =
  | "nutrition"
  | "cardio"
  | "strength"
  | "body"
  | "menstrual";
export type EditableEntry =
  | NutritionEntry
  | CardioEntry
  | StrengthEntry
  | BodyMetricEntry
  | MenstrualEntry;

const parts: BodyPart[] = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Core",
  "Glutes",
  "Quadriceps",
  "Hamstrings",
  "Calves",
  "Full Body",
];

const value = (input: number | string | null | undefined) =>
  input == null ? "" : String(input);
const numberOrNull = (input: string | boolean | undefined) =>
  input === "" || input == null ? null : Number(input);

function initialForm(kind: EntryKind, entry?: EditableEntry) {
  const base: Record<string, string | boolean> = {
    date: entry?.date ?? format(new Date(), "yyyy-MM-dd"),
    isEstimated: entry?.isEstimated ?? false,
    notes: entry?.notes ?? "",
  };
  if (!entry) return base;
  if (kind === "menstrual") {
    const item = entry as MenstrualEntry;
    return {
      ...base,
      endDate: item.endDate ?? "",
      flow: item.flow ?? "",
      symptoms: item.symptoms.join("、"),
    };
  }
  if (kind === "nutrition") {
    const item = entry as NutritionEntry;
    return {
      ...base,
      name: item.foodName,
      time: item.time ?? "",
      mealType: item.mealType ?? "snack",
      quantity: value(item.quantity),
      unit: item.unit ?? "",
      calories: value(item.caloriesKcal),
      protein: value(item.proteinG),
      carbs: value(item.carbsG),
      fat: value(item.fatG),
      fiber: value(item.fiberG),
    };
  }
  if (kind === "cardio") {
    const item = entry as CardioEntry;
    return {
      ...base,
      name: item.activityName ?? "",
      activityType: item.activityType,
      duration: value(item.durationMinutes),
      calories: value(item.caloriesBurnedKcal),
      distance: value(item.distanceKm),
      steps: value(item.steps),
      intensity: item.intensity ?? "",
    };
  }
  if (kind === "strength") {
    const item = entry as StrengthEntry;
    return {
      ...base,
      name: item.exerciseName,
      part: item.primaryBodyParts[0] ?? "Full Body",
      duration: value(item.durationMinutes),
      calories: value(item.caloriesBurnedKcal),
      sets: value(item.sets),
      reps: value(item.totalReps),
      weight: value(item.weightKg),
    };
  }
  const item = entry as BodyMetricEntry;
  return {
    ...base,
    weight: value(item.weightKg),
    bodyFat: value(item.bodyFatPercentage),
    waist: value(item.waistCm),
    hip: value(item.hipCm),
    chest: value(item.chestCm),
    thigh: value(item.thighCm),
    arm: value(item.armCm),
  };
}

export function EntryForm({
  kind,
  initial,
  onSave,
}: {
  kind: EntryKind;
  initial?: EditableEntry;
  onSave: (kind: EntryKind, item: EditableEntry) => void;
}) {
  const [form, setForm] = useState<Record<string, string | boolean>>(() =>
    initialForm(kind, initial),
  );
  const input = (key: string, label: string, type = "text") => (
    <label>
      {label}
      <input
        type={type}
        value={String(form[key] ?? "")}
        onChange={(event) =>
          setForm({ ...form, [key]: event.target.value })
        }
      />
    </label>
  );
  const base = () => ({
    ...(initial ?? {}),
    id: initial?.id ?? `${kind}-${Date.now()}`,
    date: String(form.date),
    isEstimated: Boolean(form.isEstimated),
    notes: String(form.notes ?? ""),
    estimationReason: form.isEstimated
      ? (initial && "estimationReason" in initial
          ? initial.estimationReason
          : null) || "用户手动标记为估算值"
      : null,
  });
  const save = () => {
    if (kind === "nutrition")
      onSave(kind, {
        ...base(),
        foodName: String(form.name),
        time: String(form.time || "") || null,
        mealType: (form.mealType || "snack") as NutritionEntry["mealType"],
        quantity: numberOrNull(form.quantity),
        unit: String(form.unit || "") || null,
        caloriesKcal: numberOrNull(form.calories),
        proteinG: numberOrNull(form.protein),
        carbsG: numberOrNull(form.carbs),
        fatG: numberOrNull(form.fat),
        fiberG: numberOrNull(form.fiber),
      } as NutritionEntry);
    if (kind === "cardio")
      onSave(kind, {
        ...base(),
        activityType: (form.activityType || "other") as CardioEntry["activityType"],
        activityName: String(form.name),
        durationMinutes: numberOrNull(form.duration),
        caloriesBurnedKcal: numberOrNull(form.calories),
        distanceKm: numberOrNull(form.distance),
        steps: numberOrNull(form.steps),
        intensity: (form.intensity || undefined) as CardioEntry["intensity"],
      } as CardioEntry);
    if (kind === "strength")
      onSave(kind, {
        ...base(),
        exerciseName: String(form.name),
        primaryBodyParts: [(form.part || "Full Body") as BodyPart],
        secondaryBodyParts:
          (initial as StrengthEntry | undefined)?.secondaryBodyParts ?? [],
        sets: numberOrNull(form.sets),
        totalReps: numberOrNull(form.reps),
        weightKg: numberOrNull(form.weight),
        durationMinutes: numberOrNull(form.duration),
        caloriesBurnedKcal: numberOrNull(form.calories),
      } as StrengthEntry);
    if (kind === "body")
      onSave(kind, {
        ...base(),
        weightKg: numberOrNull(form.weight),
        bodyFatPercentage: numberOrNull(form.bodyFat),
        waistCm: numberOrNull(form.waist),
        hipCm: numberOrNull(form.hip),
        chestCm: numberOrNull(form.chest),
        thighCm: numberOrNull(form.thigh),
        armCm: numberOrNull(form.arm),
      } as BodyMetricEntry);
    if (kind === "menstrual")
      onSave(kind, {
        ...base(),
        endDate: String(form.endDate || "") || null,
        flow: (form.flow || null) as MenstrualEntry["flow"],
        symptoms: String(form.symptoms || "")
          .split(/[、,，]/)
          .map((item) => item.trim())
          .filter(Boolean),
      } as MenstrualEntry);
  };
  const hasRequired =
    Boolean(form.date) &&
    (kind === "menstrual"
      ? true
      : kind === "body"
      ? [
          form.weight,
          form.bodyFat,
          form.waist,
          form.hip,
          form.chest,
          form.thigh,
          form.arm,
        ].some((item) => item !== "" && item != null)
      : Boolean(form.name));
  return (
    <div className="form-grid">
      {input("date", "日期", "date")}
      {kind !== "body" &&
        input("name", kind === "nutrition" ? "食物名称" : "活动 / 动作")}
      {kind === "nutrition" && (
        <>
          {input("time", "时间", "time")}
          <label>
            餐次
            <select
              value={String(form.mealType || "snack")}
              onChange={(event) =>
                setForm({ ...form, mealType: event.target.value })
              }
            >
              <option value="breakfast">早餐</option>
              <option value="lunch">午餐</option>
              <option value="dinner">晚餐</option>
              <option value="snack">加餐</option>
              <option value="drink">饮料</option>
            </select>
          </label>
          {input("quantity", "数量", "number")}
          {input("unit", "单位")}
          {input("calories", "热量（kcal）", "number")}
          {input("protein", "蛋白质（g）", "number")}
          {input("carbs", "碳水（g）", "number")}
          {input("fat", "脂肪（g）", "number")}
          {input("fiber", "纤维（g）", "number")}
        </>
      )}
      {kind === "cardio" && (
        <>
          <label>
            类型
            <select
              value={String(form.activityType || "other")}
              onChange={(event) =>
                setForm({ ...form, activityType: event.target.value })
              }
            >
              <option value="dance">跳舞</option>
              <option value="walking">走路</option>
              <option value="running">跑步</option>
              <option value="cycling">骑行</option>
              <option value="other">其他</option>
            </select>
          </label>
          {input("duration", "时长（分钟）", "number")}
          {input("calories", "消耗（kcal）", "number")}
          {input("distance", "距离（km）", "number")}
          {input("steps", "步数", "number")}
          <label>
            强度
            <select
              value={String(form.intensity || "")}
              onChange={(event) =>
                setForm({ ...form, intensity: event.target.value })
              }
            >
              <option value="">未记录</option>
              <option value="low">低</option>
              <option value="moderate">中</option>
              <option value="high">高</option>
            </select>
          </label>
        </>
      )}
      {kind === "strength" && (
        <>
          <label>
            主要部位
            <select
              value={String(form.part || "Full Body")}
              onChange={(event) =>
                setForm({ ...form, part: event.target.value })
              }
            >
              {parts.map((part) => (
                <option key={part}>{part}</option>
              ))}
            </select>
          </label>
          {input("duration", "时长（分钟）", "number")}
          {input("sets", "组数", "number")}
          {input("reps", "总次数", "number")}
          {input("weight", "重量（kg）", "number")}
          {input("calories", "消耗（kcal）", "number")}
        </>
      )}
      {kind === "body" && (
        <>
          {input("weight", "体重（kg）", "number")}
          {input("bodyFat", "体脂（%）", "number")}
          {input("waist", "腰围（cm）", "number")}
          {input("hip", "臀围（cm）", "number")}
          {input("chest", "胸围（cm）", "number")}
          {input("thigh", "大腿围（cm）", "number")}
          {input("arm", "臂围（cm）", "number")}
        </>
      )}
      {kind === "menstrual" && (
        <>
          {input("endDate", "经期结束日", "date")}
          <label>
            经量
            <select
              value={String(form.flow || "")}
              onChange={(event) =>
                setForm({ ...form, flow: event.target.value })
              }
            >
              <option value="">未记录</option>
              <option value="light">少</option>
              <option value="medium">中</option>
              <option value="heavy">多</option>
            </select>
          </label>
          {input("symptoms", "症状（用顿号分隔）")}
        </>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={Boolean(form.isEstimated)}
          onChange={(event) =>
            setForm({ ...form, isEstimated: event.target.checked })
          }
        />
        估算值
      </label>
      <label className="span2">
        备注
        <textarea
          value={String(form.notes ?? "")}
          onChange={(event) =>
            setForm({ ...form, notes: event.target.value })
          }
        />
      </label>
      <button
        className="primary span2"
        disabled={!hasRequired}
        onClick={save}
      >
        {initial ? "保存修改" : "保存记录"}
      </button>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  eachDayOfInterval,
} from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  Apple,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  FileDown,
  LayoutDashboard,
  MessageCircle,
  Moon,
  Plus,
  Scale,
  Sun,
  Upload,
} from "lucide-react";
import { emptyHealthData, type HealthData } from "./types/health";
import { daily, fmt, movingAverage, weekly } from "./utils/analytics";
import { ChartCard } from "./components/ChartCard";
import { Modal } from "./components/Modal";
import { EntryForm } from "./components/EntryForm";
import { MuscleHeatmap } from "./components/MuscleHeatmap";
import { DailyExerciseList } from "./components/DailyExerciseList";
import { HealthChat } from "./components/HealthChat";
import type { ProposedChanges } from "./components/HealthChat";
import { CloudSync } from "./components/CloudSync";
void useMemo;
type Page =
  | "chat"
  | "dashboard"
  | "nutrition"
  | "exercise"
  | "body"
  | "calendar"
  | "audit";
const COLORS = ["#2f6b4f", "#cfe96e", "#ef806d", "#6aa6a0", "#9f80c9"];
const nav: [Page, string, typeof Activity][] = [
  ["dashboard", "概览", LayoutDashboard],
  ["nutrition", "饮食", Apple],
  ["exercise", "运动", Dumbbell],
  ["body", "身体趋势", Scale],
  ["calendar", "日历", CalendarDays],
  ["audit", "数据审计", Activity],
];
const mobileNav: [Page, string, typeof Activity][] = [
  ["chat", "对话", MessageCircle],
  ["dashboard", "概览", LayoutDashboard],
  ["nutrition", "饮食", Apple],
  ["exercise", "运动", Dumbbell],
  ["calendar", "日历", CalendarDays],
];
export default function App() {
  const [data, setData] = useState<HealthData>(() => emptyHealthData()),
    [page, setPage] = useState<Page>(() =>
      window.matchMedia("(max-width: 760px)").matches ? "chat" : "dashboard",
    ),
    [dark, setDark] = useState(
      () => localStorage.getItem("health-theme") === "dark",
    ),
    [add, setAdd] = useState<"nutrition" | "cardio" | "strength" | null>(null),
    [range, setRange] = useState({
      from: "2026-06-26",
      to: format(new Date(), "yyyy-MM-dd"),
    }),
    file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("health-theme", dark ? "dark" : "light");
  }, [dark]);
  const all = daily(data),
    filtered = all.filter((x) => x.date >= range.from && x.date <= range.to);
  const save = (kind: string, item: unknown) => {
    const key =
      kind === "nutrition"
        ? "nutritionEntries"
        : kind === "cardio"
          ? "cardioEntries"
          : "strengthEntries";
    setData((d) => ({ ...d, [key]: [...(d[key] as unknown[]), item] }));
    setAdd(null);
  };
  const applyChat = (changes: ProposedChanges) =>
    setData((current) => {
      const merge = <T extends { id: string }>(
        existing: T[],
        incoming: T[],
      ) => {
        const next = new Map(existing.map((x) => [x.id, x]));
        incoming.forEach((x) => next.set(x.id, x));
        return [...next.values()];
      };
      return {
        ...current,
        nutritionEntries: merge(
          current.nutritionEntries,
          changes.nutritionEntries,
        ),
        cardioEntries: merge(current.cardioEntries, changes.cardioEntries),
        strengthEntries: merge(
          current.strengthEntries,
          changes.strengthEntries,
        ),
        bodyMetricEntries: merge(
          current.bodyMetricEntries,
          changes.bodyMetricEntries,
        ),
      };
    });
  const del = (kind: string, id: string) => {
    if (!confirm("确定删除这条记录吗？")) return;
    setData((d) => ({
      ...d,
      [kind]: (d[kind as keyof HealthData] as { id: string }[]).filter(
        (x) => x.id !== id,
      ),
    }));
  };
  const download = (name: string, text: string, type = "application/json") => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const csv = () => {
    const rows = [
      ["类别", "日期", "名称", "热量/消耗", "蛋白质", "时长", "估算", "备注"],
      ...data.nutritionEntries.map((x) => [
        "饮食",
        x.date,
        x.foodName,
        x.caloriesKcal,
        x.proteinG,
        "",
        x.isEstimated,
        x.notes,
      ]),
      ...data.cardioEntries.map((x) => [
        "有氧",
        x.date,
        x.activityName || x.activityType,
        x.caloriesBurnedKcal,
        "",
        x.durationMinutes,
        x.isEstimated,
        x.notes,
      ]),
      ...data.strengthEntries.map((x) => [
        "无氧",
        x.date,
        x.exerciseName,
        "",
        "",
        x.durationMinutes,
        x.isEstimated,
        x.notes,
      ]),
    ];
    download(
      "health-data.csv",
      "\ufeff" +
        rows
          .map((r) =>
            r
              .map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`)
              .join(","),
          )
          .join("\n"),
      "text/csv",
    );
  };
  const importJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(String(r.result));
        if (!parsed.nutritionEntries || !parsed.cardioEntries) throw Error();
        setData(parsed);
      } catch {
        alert("JSON 格式不正确");
      }
    };
    r.readAsText(f);
  };
  return (
    <div className="app-shell">
      <aside>
        <div className="brand">
          <span>脉</span>
          <div>
            <b>健康脉络</b>
            <small>PERSONAL LOG</small>
          </div>
        </div>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button
              className={page === id ? "active" : ""}
              key={id}
              onClick={() => setPage(id)}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <small>健康数据仅存 Supabase</small>
          <button onClick={() => setDark(!dark)}>
            {dark ? <Sun size={17} /> : <Moon size={17} />}{" "}
            {dark ? "浅色模式" : "深色模式"}
          </button>
        </div>
      </aside>
      <main className={page === "chat" ? "chat-page-active" : undefined}>
        <header>
          <div>
            <p className="eyebrow">2026 · PERSONAL HEALTH</p>
            <h1>{[...mobileNav, ...nav].find((x) => x[0] === page)?.[1]}</h1>
          </div>
          <div className="header-actions">
            <label className="date-range">
              <input
                type="date"
                value={range.from}
                onChange={(e) => setRange({ ...range, from: e.target.value })}
              />
              <span>至</span>
              <input
                type="date"
                value={range.to}
                onChange={(e) => setRange({ ...range, to: e.target.value })}
              />
            </label>
            <button className="primary" onClick={() => setAdd("nutrition")}>
              <Plus size={17} />
              添加记录
            </button>
          </div>
        </header>
        <div className={`mobile-chat-page${page === "chat" ? " active" : ""}`}>
          <HealthChat embedded onApply={applyChat} />
        </div>
        {page === "dashboard" && <Dashboard data={data} rows={filtered} />}{" "}
        {page === "nutrition" && (
          <Nutrition data={data} rows={filtered} del={del} />
        )}{" "}
        {page === "exercise" && (
          <Exercise data={data} rows={filtered} del={del} add={setAdd} />
        )}{" "}
        {page === "body" && <Body data={data} />}{" "}
        {page === "calendar" && <Calendar data={data} />}{" "}
        {page === "audit" && (
          <Audit
            data={data}
            onExport={() =>
              download("health-data.json", JSON.stringify(data, null, 2))
            }
            onCsv={csv}
            onImport={() => file.current?.click()}
          />
        )}
        <input
          hidden
          ref={file}
          type="file"
          accept="application/json"
          onChange={importJson}
        />
      </main>
      {add && (
        <Modal
          title={
            add === "nutrition"
              ? "新增饮食"
              : add === "cardio"
                ? "新增有氧"
                : "新增无氧"
          }
          onClose={() => setAdd(null)}
        >
          <EntryForm kind={add} onSave={save} />
        </Modal>
      )}
      <CloudSync data={data} onCloudLoad={setData} />
      <div className="desktop-health-chat">
        <HealthChat onApply={applyChat} />
      </div>
      <MobileNav page={page} setPage={setPage} />
    </div>
  );
}
function Dashboard({
  data,
  rows,
}: {
  data: HealthData;
  rows: ReturnType<typeof daily>;
}) {
  const last = rows.at(-1),
    weight = [...data.bodyMetricEntries]
      .filter((x) => x.weightKg != null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .at(-1)?.weightKg;
  const streak = new Set(
    [
      ...data.nutritionEntries,
      ...data.cardioEntries,
      ...data.strengthEntries,
    ].map((x) => x.date),
  ).size;
  const cards = [
    ["摄入热量", fmt(last?.calories), "kcal"],
    ["蛋白质", fmt(last?.protein, 1), "g"],
    ["碳水", fmt(last?.carbs, 1), "g"],
    ["脂肪", fmt(last?.fat, 1), "g"],
    ["运动时间", fmt((last?.cardio ?? 0) + (last?.strength ?? 0)), "min"],
    ["有氧 / 无氧", `${last?.cardio ?? 0} / ${fmt(last?.strength)}`, "min"],
    ["估算运动消耗", fmt(last?.burned), "kcal"],
    [
      "记录热量差值",
      last?.calories != null && last?.burned != null
        ? fmt(last.calories - last.burned)
        : "—",
      "kcal",
    ],
    ["当前体重", fmt(weight, 1), "kg"],
    ["记录覆盖", String(streak), "天"],
  ];
  return (
    <>
      <div className="notice">
        <b>数据说明</b>{" "}
        未提供的数据保持为空；“记录热量差值”仅为摄入减去已记录运动消耗，不代表真实盈余或缺口。
      </div>
      <div className="metrics">
        {cards.map(([a, b, c], i) => (
          <article key={a} className={i === 0 ? "hero-metric" : ""}>
            <p>{a}</p>
            <strong>{b}</strong>
            <span>{c}</span>
          </article>
        ))}
      </div>
      <div className="grid2">
        <ChartCard
          title="饮食热量与运动量"
          subtitle="kcal · 空缺保持为空"
          empty={!rows.some((x) => x.calories != null || x.burned != null)}
        >
          <ResponsiveContainer>
            <ComposedChart data={rows}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" />
              <YAxis domain={[0, "auto"]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="burned" name="运动消耗" fill="#cfe96e" />
              <Line
                dataKey="calories"
                name="摄入热量"
                stroke="#2f6b4f"
                strokeWidth={3}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="每日运动时间" subtitle="有氧与无氧分钟数">
          <ResponsiveContainer>
            <BarChart data={rows}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" />
              <YAxis domain={[0, "auto"]} />
              <Tooltip />
              <Legend />
              <Bar
                dataKey="cardio"
                name="有氧"
                fill="#2f6b4f"
                radius={[5, 5, 0, 0]}
              />
              <Bar
                dataKey="strength"
                name="无氧"
                fill="#ef806d"
                radius={[5, 5, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </>
  );
}
function Nutrition({
  data,
  rows,
  del,
}: {
  data: HealthData;
  rows: ReturnType<typeof daily>;
  del: (k: string, id: string) => void;
}) {
  const [q, setQ] = useState(""),
    [meal, setMeal] = useState("all");
  const list = data.nutritionEntries.filter(
    (x) =>
      x.date >= rows[0]?.date &&
      x.date <= rows.at(-1)?.date &&
      (meal === "all" || x.mealType === meal) &&
      x.foodName.toLowerCase().includes(q.toLowerCase()),
  );
  const macros = [
    { name: "蛋白质", value: rows.reduce((a, x) => a + (x.protein ?? 0), 0) },
    { name: "碳水", value: rows.reduce((a, x) => a + (x.carbs ?? 0), 0) },
    { name: "脂肪", value: rows.reduce((a, x) => a + (x.fat ?? 0), 0) },
  ].filter((x) => x.value > 0);
  const known = rows.filter((x) => x.calories != null);
  return (
    <>
      <div className="stat-strip">
        <div>
          <span>平均每日摄入</span>
          <b>
            {known.length
              ? fmt(
                  known.reduce((a, x) => a + (x.calories ?? 0), 0) /
                    known.length,
                )
              : "—"}{" "}
            kcal
          </b>
        </div>
        <div>
          <span>摄入最高</span>
          <b>
            {known.sort((a, b) => (b.calories ?? 0) - (a.calories ?? 0))[0]
              ?.date ?? "—"}
          </b>
        </div>
        <div>
          <span>摄入最低</span>
          <b>
            {known.sort((a, b) => (a.calories ?? 0) - (b.calories ?? 0))[0]
              ?.date ?? "—"}
          </b>
        </div>
      </div>
      <div className="grid2">
        <ChartCard title="每日热量摄入" subtitle="kcal">
          <ResponsiveContainer>
            <LineChart data={rows}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" />
              <YAxis domain={[0, "auto"]} />
              <Tooltip />
              <Line
                dataKey="calories"
                name="热量"
                stroke="#2f6b4f"
                strokeWidth={3}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="每日蛋白质" subtitle="克">
          <ResponsiveContainer>
            <AreaChart data={rows}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" />
              <YAxis domain={[0, "auto"]} />
              <Tooltip />
              <Area
                dataKey="protein"
                name="蛋白质"
                stroke="#ef806d"
                fill="#ef806d33"
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard
          title="营养素比例"
          subtitle="仅统计已知克数"
          empty={!macros.length}
        >
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={macros}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={85}
              >
                {macros.map((_, i) => (
                  <Cell key={i} fill={COLORS[i]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="每餐热量分布">
          <ResponsiveContainer>
            <BarChart
              data={Object.entries(
                Object.groupBy(
                  data.nutritionEntries,
                  (x) => x.mealType || "unknown",
                ),
              ).map(([name, v]) => ({
                name,
                value: v?.reduce((a, x) => a + (x.caloriesKcal ?? 0), 0),
              }))}
            >
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar
                dataKey="value"
                name="kcal"
                fill="#6aa6a0"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <section className="panel">
        <div className="section-head">
          <div>
            <h3>食物记录</h3>
            <p className="muted">{list.length} 条</p>
          </div>
          <div className="filters">
            <input
              placeholder="搜索食物"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select value={meal} onChange={(e) => setMeal(e.target.value)}>
              <option value="all">全部餐次</option>
              <option value="breakfast">早餐</option>
              <option value="lunch">午餐</option>
              <option value="dinner">晚餐</option>
              <option value="snack">加餐</option>
              <option value="drink">饮料</option>
            </select>
          </div>
        </div>
        <EntryTable
          data={data}
          rows={list.map((x) => ({
            id: x.id,
            date: x.date,
            name: x.foodName,
            detail: `${x.caloriesKcal ?? "—"} kcal · ${x.proteinG ?? "—"}g 蛋白`,
            estimated: x.isEstimated,
            source: x.sourceText,
          }))}
          onDelete={(id) => del("nutritionEntries", id)}
        />
      </section>
    </>
  );
}
function Exercise({
  data,
  rows,
  del,
  add,
}: {
  data: HealthData;
  rows: ReturnType<typeof daily>;
  del: (k: string, id: string) => void;
  add: (v: "cardio" | "strength") => void;
}) {
  const types = Object.entries(
    Object.groupBy(data.cardioEntries, (x) => x.activityType),
  ).map(([name, v]) => ({
    name,
    value: v?.reduce((a, x) => a + (x.durationMinutes ?? 0), 0),
  }));
  return (
    <>
      <div className="section-head">
        <div className="tabs">
          <span className="pill">有氧 {data.cardioEntries.length}</span>
          <span className="pill coral">无氧 {data.strengthEntries.length}</span>
        </div>
        <div className="filters">
          <button onClick={() => add("cardio")}>+ 有氧</button>
          <button onClick={() => add("strength")}>+ 无氧</button>
        </div>
      </div>
      <div className="grid2">
        <ChartCard title="每日有氧和无氧分钟数">
          <ResponsiveContainer>
            <BarChart data={rows}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="cardio" name="有氧" fill="#2f6b4f" />
              <Bar dataKey="strength" name="无氧" fill="#ef806d" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="每周运动时长">
          <ResponsiveContainer>
            <BarChart data={weekly(data)}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="week" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar
                dataKey="cardio"
                name="有氧分钟"
                stackId="a"
                fill="#2f6b4f"
              />
              <Bar
                dataKey="strength"
                name="无氧分钟"
                stackId="a"
                fill="#ef806d"
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="有氧类型占比" empty={!types.length}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={types}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={82}
              >
                {types.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard
          title="无氧训练部位热力图"
          subtitle="颜色越深表示训练频率越高"
        >
          <MuscleHeatmap entries={data.strengthEntries} />
        </ChartCard>
      </div>
      <DailyExerciseList
        cardio={data.cardioEntries}
        strength={data.strengthEntries}
        onDelete={del}
      />
    </>
  );
}
function Body({ data }: { data: HealthData }) {
  const w = data.bodyMetricEntries
      .filter((x) => x.weightKg != null)
      .sort((a, b) => a.date.localeCompare(b.date)),
    chart = movingAverage(w),
    first = w[0]?.weightKg,
    last = w.at(-1)?.weightKg,
    prev = w.at(-2)?.weightKg;
  return (
    <>
      <div className="stat-strip">
        <div>
          <span>当前体重</span>
          <b>{fmt(last, 2)} kg</b>
        </div>
        <div>
          <span>较第一条</span>
          <b>
            {last != null && first != null
              ? `${last - first > 0 ? "+" : ""}${fmt(last - first, 2)} kg`
              : "—"}
          </b>
        </div>
        <div>
          <span>较上一条</span>
          <b>
            {last != null && prev != null
              ? `${last - prev > 0 ? "+" : ""}${fmt(last - prev, 2)} kg`
              : "—"}
          </b>
        </div>
      </div>
      <div className="grid2">
        <ChartCard
          title="体重变化"
          subtitle="原始值与 7 条记录移动平均"
          empty={!chart.length}
        >
          <ResponsiveContainer>
            <LineChart data={chart}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" />
              <YAxis domain={["dataMin - 1", "dataMax + 1"]} />
              <Tooltip />
              <Legend />
              <Line
                dataKey="weightKg"
                name="体重 kg"
                stroke="#2f6b4f"
                strokeWidth={3}
              />
              <Line
                dataKey="average"
                name="7 条移动平均"
                stroke="#ef806d"
                strokeDasharray="5 4"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard
          title="体脂趋势"
          empty={
            !data.bodyMetricEntries.some((x) => x.bodyFatPercentage != null)
          }
        >
          <div />
        </ChartCard>
        <ChartCard
          title="身体围度趋势"
          empty={
            !data.bodyMetricEntries.some(
              (x) => x.waistCm != null || x.hipCm != null,
            )
          }
        >
          <div />
        </ChartCard>
        <section className="panel">
          <h3>记录说明</h3>
          <p className="empty-copy">
            体脂和身体围度尚无数据。新增记录后，趋势图会自动出现；缺失值不会被当作
            0。
          </p>
        </section>
      </div>
    </>
  );
}
function Calendar({ data }: { data: HealthData }) {
  const [month, setMonth] = useState(parseISO("2026-07-01")),
    [selected, setSelected] = useState("2026-07-19");
  const days = eachDayOfInterval({
      start: startOfWeek(startOfMonth(month)),
      end: endOfWeek(endOfMonth(month)),
    }),
    d = daily(data),
    info = d.find((x) => x.date === selected);
  const foods = data.nutritionEntries.filter((x) => x.date === selected),
    cardio = data.cardioEntries.filter((x) => x.date === selected),
    strength = data.strengthEntries.filter((x) => x.date === selected);
  const mealLabels = {
      breakfast: "早餐",
      lunch: "午餐",
      dinner: "晚餐",
      snack: "加餐",
    } as const,
    mealOrder = ["breakfast", "lunch", "dinner", "snack"] as const;
  const foodGroups = Object.groupBy(foods, (x) =>
    x.mealType === "breakfast" ||
    x.mealType === "lunch" ||
    x.mealType === "dinner"
      ? x.mealType
      : "snack",
  );
  const hasEntries = foods.length + cardio.length + strength.length > 0;
  return (
    <div className="calendar-layout">
      <section className="panel calendar">
        <div className="section-head">
          <button
            className="icon-btn"
            onClick={() => setMonth(subMonths(month, 1))}
          >
            <ChevronLeft />
          </button>
          <h2>{format(month, "yyyy 年 M 月", { locale: zhCN })}</h2>
          <button
            className="icon-btn"
            onClick={() => setMonth(addMonths(month, 1))}
          >
            <ChevronRight />
          </button>
        </div>
        <div className="weekdays">
          {["日", "一", "二", "三", "四", "五", "六"].map((x) => (
            <b key={x}>{x}</b>
          ))}
        </div>
        <div className="days">
          {days.map((day) => {
            const date = format(day, "yyyy-MM-dd"),
              x = d.find((v) => v.date === date);
            return (
              <button
                key={date}
                onClick={() => setSelected(date)}
                className={`${!isSameMonth(day, month) ? "outside" : ""} ${date === selected ? "selected" : ""}`}
              >
                <span>{format(day, "d")}</span>
                <div className="dots">
                  {x?.hasNutrition && <i className="food" />}
                  {x?.hasCardio && <i className="cardio" />}
                  {x?.hasStrength && <i className="strength" />}
                </div>
                {x?.calories != null && <small>{fmt(x.calories)} kcal</small>}
                {x && x.cardio + (x.strength ?? 0) > 0 && (
                  <small>{x.cardio + (x.strength ?? 0)} min</small>
                )}
              </button>
            );
          })}
        </div>
      </section>
      <aside className="panel day-detail">
        <p className="eyebrow">DAY DETAIL</p>
        <h2>{selected}</h2>
        {info && (
          <div className="mini-stats">
            <span>{fmt(info.calories)} kcal</span>
            <span>{info.cardio + (info.strength ?? 0)} min</span>
          </div>
        )}
        {hasEntries ? (
          <>
            {mealOrder.map((kind) =>
              foodGroups[kind]?.map((x) => (
                <div className="day-row" key={x.id}>
                  <b>{mealLabels[kind]}</b>
                  <span>{x.foodName}</span>
                </div>
              )),
            )}
            {cardio.map((x) => (
              <div className="day-row" key={x.id}>
                <b>有氧</b>
                <span>{x.activityName || x.activityType}</span>
              </div>
            ))}
            {strength.map((x) => (
              <div className="day-row" key={x.id}>
                <b>无氧</b>
                <span>{x.exerciseName}</span>
              </div>
            ))}
          </>
        ) : (
          <div className="empty">当天没有记录</div>
        )}
      </aside>
    </div>
  );
}
function Audit({
  data,
  onExport,
  onCsv,
  onImport,
}: {
  data: HealthData;
  onExport: () => void;
  onCsv: () => void;
  onImport: () => void;
}) {
  const a = data.dataAudit as {
    summary?: Record<string, number>;
    estimatedEntryCounts?: Record<string, number>;
    missingDateEntryIds?: string[];
    possibleDuplicateGroups?: unknown[];
    unitConversions?: unknown[];
    dataIssues?: { entryId: string; issue: string }[];
    assumptions?: string[];
  };
  return (
    <>
      <div className="audit-hero">
        <div>
          <p className="eyebrow">DATA QUALITY REPORT</p>
          <h2>数据审计摘要</h2>
          <p>所有数据保留原始文本引用；没有依据的营养值保持为空。</p>
        </div>
        <div className="export-actions">
          <button onClick={onImport}>
            <Upload size={16} />
            导入 JSON
          </button>
          <button onClick={onExport}>
            <FileDown size={16} />
            导出 JSON
          </button>
          <button onClick={onCsv}>
            <FileDown size={16} />
            导出 CSV
          </button>
        </div>
      </div>
      <div className="metrics audit-metrics">
        {[
          ["饮食记录", a.summary?.nutritionEntryCount],
          ["有氧记录", a.summary?.cardioEntryCount],
          ["无氧记录", a.summary?.strengthEntryCount],
          ["身体记录", a.summary?.bodyMetricEntryCount],
          [
            "估算记录",
            Object.values(a.estimatedEntryCounts || {}).reduce(
              (x, y) => x + y,
              0,
            ),
          ],
          ["缺少日期", a.missingDateEntryIds?.length ?? 0],
          ["重复组", a.possibleDuplicateGroups?.length ?? 0],
          ["单位换算", a.unitConversions?.length ?? 0],
        ].map(([x, y]) => (
          <article key={String(x)}>
            <p>{x}</p>
            <strong>{y}</strong>
            <span>条</span>
          </article>
        ))}
      </div>
      <div className="grid2">
        <section className="panel">
          <h3>估算与数据问题</h3>
          {a.dataIssues?.map((x) => (
            <div className="issue" key={x.entryId}>
              <b>{x.entryId}</b>
              <span>{x.issue}</span>
            </div>
          ))}
        </section>
        <section className="panel">
          <h3>清洗规则</h3>
          {a.assumptions?.map((x, i) => (
            <div className="issue" key={i}>
              <b>0{i + 1}</b>
              <span>{x}</span>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
function EntryTable({
  data,
  rows,
  onDelete,
}: {
  data: HealthData;
  rows: {
    id: string;
    date: string;
    name: string;
    detail: string;
    estimated: boolean;
    source?: string;
  }[];
  onDelete: (id: string) => void;
}) {
  if (rows.some((x) => x.id.startsWith("nutrition-"))) {
    const info = new Map(data.nutritionEntries.map((x) => [x.id, x]));
    const audited = new Map(
      (data.auditedDailyTotals ?? []).map((x) => [x.date, x.caloriesKcal]),
    );
    const labels = {
      breakfast: "早餐",
      lunch: "午餐",
      dinner: "晚餐",
      snack: "加餐",
    } as const;
    const order = ["breakfast", "lunch", "dinner", "snack"] as const;
    const days = Object.entries(Object.groupBy(rows, (x) => x.date)).sort(
      ([a], [b]) => b.localeCompare(a),
    );
    return (
      <div className="entry-list workout-list food-list">
        {days.map(([date, items]) => {
          const dayItems = items || [],
            groups = Object.groupBy(dayItems, (x) => {
              const type = info.get(x.id)?.mealType;
              return type === "breakfast" ||
                type === "lunch" ||
                type === "dinner"
                ? type
                : "snack";
            }),
            total =
              audited.get(date) ??
              dayItems.reduce(
                (sum, x) => sum + (info.get(x.id)?.caloriesKcal ?? 0),
                0,
              );
          return (
            <details className="workout-session food-session" key={date}>
              <summary>
                <time>{format(parseISO(date), "M/d")}</time>
                <div>
                  <b>{fmt(total)} kcal</b>
                  <span>
                    {order
                      .filter((k) => groups[k]?.length)
                      .map((k) => `${labels[k]} ${groups[k]?.length}`)
                      .join(" · ")}
                  </span>
                </div>
                <ChevronRight size={18} />
              </summary>
              <div className="workout-details">
                {order.map((kind) =>
                  groups[kind]?.length ? (
                    <section className="meal-group" key={kind}>
                      <h4>{labels[kind]}</h4>
                      {groups[kind]?.map((x) => (
                        <div className="workout-move" key={x.id}>
                          <div>
                            <b>
                              {x.name}
                              {x.estimated && <em>估算</em>}
                            </b>
                            <span>{x.detail}</span>
                            {x.source && <p>“{x.source}”</p>}
                          </div>
                          <button
                            className="delete"
                            onClick={() => onDelete(x.id)}
                          >
                            删除
                          </button>
                        </div>
                      ))}
                    </section>
                  ) : null,
                )}
              </div>
            </details>
          );
        })}
      </div>
    );
  }
  if (rows.some((x) => x.id.startsWith("strength-"))) {
    const sessions = Object.entries(Object.groupBy(rows, (x) => x.date)).sort(
      ([a], [b]) => b.localeCompare(a),
    );
    const title = (items: typeof rows) => {
      const text = items.map((x) => `${x.name} ${x.detail}`).join(" ");
      if (/臀|腿|Glutes|Quadriceps|Hamstrings/.test(text)) return "臀腿训练";
      if (/胸|Chest/.test(text))
        return /Core|核心/.test(text) ? "胸部 + 核心训练" : "胸部训练";
      if (/背|Back/.test(text) && /肩|Shoulders/.test(text)) return "肩背训练";
      if (/背|Back/.test(text)) return "背部训练";
      if (/肩|Shoulders/.test(text)) return "肩部训练";
      return "力量训练";
    };
    const pounds = (detail: string) =>
      detail
        .replace(
          /(\d+(?:\.\d+)?) kg/g,
          (_, v) => `${Math.round(Number(v) * 2.20462)} lb`,
        )
        .replace("— kg", "自重 / 未记录重量");
    return (
      <div className="entry-list workout-list">
        {sessions.map(([date, items]) => (
          <details className="workout-session" key={date}>
            <summary>
              <time>{format(parseISO(date), "M/d")}</time>
              <div>
                <b>{title(items || [])}</b>
                <span>{items?.length || 0} 个动作 · 点击展开训练内容</span>
              </div>
              <ChevronRight size={18} />
            </summary>
            <div className="workout-details">
              {items?.map((x) => (
                <div className="workout-move" key={x.id}>
                  <div>
                    <b>{x.name}</b>
                    <span>{pounds(x.detail)}</span>
                    {x.source && <p>{x.source}</p>}
                  </div>
                  <button className="delete" onClick={() => onDelete(x.id)}>
                    删除
                  </button>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    );
  }
  return (
    <div className="entry-list">
      {rows.length ? (
        rows.map((x) => (
          <div className="entry" key={x.id}>
            <time>{format(parseISO(x.date), "M/d")}</time>
            <div>
              <b>
                {x.name}
                {x.estimated && <em>估算</em>}
              </b>
              <span>{x.detail}</span>
              {x.source && (
                <details>
                  <summary>原始记录</summary>
                  <p>“{x.source}”</p>
                </details>
              )}
            </div>
            <button className="delete" onClick={() => onDelete(x.id)}>
              删除
            </button>
          </div>
        ))
      ) : (
        <div className="empty">暂无记录</div>
      )}
    </div>
  );
}
function MobileNav({
  page,
  setPage,
}: {
  page: Page;
  setPage: (p: Page) => void;
}) {
  return (
    <div className="mobile-nav">
      {mobileNav.map(([id, label, Icon]) => (
        <button
          className={page === id ? "active" : ""}
          key={id}
          onClick={() => setPage(id)}
        >
          <Icon size={19} />
          <small>{label}</small>
        </button>
      ))}
    </div>
  );
}

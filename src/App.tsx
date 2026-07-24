import { useEffect, useMemo, useRef, useState } from "react";
import {
  addMonths,
  differenceInCalendarDays,
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
  ReferenceArea,
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
  Droplets,
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
import {
  EntryForm,
  type EditableEntry,
  type EntryKind,
} from "./components/EntryForm";
import { MuscleHeatmap } from "./components/MuscleHeatmap";
import { DailyExerciseList } from "./components/DailyExerciseList";
import { HealthChat } from "./components/HealthChat";
import type { ProposedChanges } from "./components/HealthChat";
import { CloudSync } from "./components/CloudSync";
import { supabase } from "./lib/supabase";
void useMemo;
type Page =
  | "chat"
  | "dashboard"
  | "nutrition"
  | "exercise"
  | "body"
  | "cycle"
  | "calendar"
  | "audit";
const COLORS = ["#2f6b4f", "#cfe96e", "#ef806d", "#6aa6a0", "#9f80c9"];
const nav: [Page, string, typeof Activity][] = [
  ["dashboard", "概览", LayoutDashboard],
  ["nutrition", "饮食", Apple],
  ["exercise", "运动", Dumbbell],
  ["body", "身体趋势", Scale],
  ["cycle", "经期", Droplets],
  ["calendar", "日历", CalendarDays],
  ["audit", "数据审计", Activity],
];
const mobileNav: [Page, string, typeof Activity][] = [
  ["chat", "对话", MessageCircle],
  ["dashboard", "概览", LayoutDashboard],
  ["nutrition", "饮食", Apple],
  ["exercise", "运动", Dumbbell],
  ["calendar", "日历", CalendarDays],
  ["cycle", "经期", Droplets],
];
export default function App() {
  const [data, setData] = useState<HealthData>(() => emptyHealthData()),
    [page, setPage] = useState<Page>(() =>
      window.matchMedia("(max-width: 760px)").matches ? "chat" : "dashboard",
    ),
    [dark, setDark] = useState(
      () => localStorage.getItem("health-theme") === "dark",
    ),
    [add, setAdd] = useState<EntryKind | null>(null),
    [recordChooser, setRecordChooser] = useState<
      "category" | "exercise" | null
    >(null),
    [macroJobId, setMacroJobId] = useState<string | null>(
      () => localStorage.getItem("nutrition-macro-job"),
    ),
    [macroStatus, setMacroStatus] = useState(""),
    [editing, setEditing] = useState<{
      kind: EntryKind;
      item: EditableEntry;
    } | null>(null),
    [range, setRange] = useState({
      from: "2026-06-26",
      to: format(new Date(), "yyyy-MM-dd"),
    }),
    file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("health-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    const viewport = window.matchMedia("(max-width: 760px)");
    const syncPageWithViewport = (event: MediaQueryListEvent) => {
      setPage((current) =>
        event.matches ? "chat" : current === "chat" ? "dashboard" : current,
      );
    };
    viewport.addEventListener("change", syncPageWithViewport);
    return () => viewport.removeEventListener("change", syncPageWithViewport);
  }, []);
  useEffect(() => {
    if (!macroJobId || !supabase) return;
    let active = true;
    let timer = 0;
    let failures = 0;
    const check = async () => {
      const { data: job, error } = await supabase.functions.invoke(
        "health-chat",
        { body: { action: "status", jobId: macroJobId } },
      );
      if (!active) return;
      if (error) {
        failures += 1;
        if (failures >= 5) {
          localStorage.removeItem("nutrition-macro-job");
          setMacroJobId(null);
          setMacroStatus("无法查询后台任务，请重新点击补全");
          return;
        }
      } else {
        failures = 0;
        if (job?.status === "queued") setMacroStatus("等待后台估算…");
        if (job?.status === "running") setMacroStatus("后台估算中…");
      }
      if (!error && job?.status === "completed" && job.result) {
        const changes = job.result as ProposedChanges;
        setData((current) => {
          const next = new Map(
            current.nutritionEntries.map((entry) => [entry.id, entry]),
          );
          changes.nutritionEntries.forEach((entry) => next.set(entry.id, entry));
          return { ...current, nutritionEntries: [...next.values()] };
        });
        localStorage.removeItem("nutrition-macro-job");
        setMacroJobId(null);
        setMacroStatus(`已补全 ${changes.nutritionEntries.length} 条`);
        return;
      }
      if (!error && job?.status === "failed") {
        localStorage.removeItem("nutrition-macro-job");
        setMacroJobId(null);
        setMacroStatus(job.error || "补全失败");
        return;
      }
      if (active) timer = window.setTimeout(check, 2500);
    };
    void check();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [macroJobId]);
  const all = daily(data),
    filtered = all.filter((x) => x.date >= range.from && x.date <= range.to);
  const save = (kind: EntryKind, item: EditableEntry) => {
    const key =
      kind === "nutrition"
        ? "nutritionEntries"
        : kind === "cardio"
          ? "cardioEntries"
          : kind === "strength"
            ? "strengthEntries"
            : kind === "body"
              ? "bodyMetricEntries"
              : "menstrualEntries";
    setData((current) => ({
      ...current,
      [key]: editing
        ? (current[key] as EditableEntry[]).map((entry) =>
            entry.id === editing.item.id ? item : entry,
          )
        : [...(current[key] as EditableEntry[]), item],
    }));
    setAdd(null);
    setEditing(null);
  };
  const edit = (kind: EntryKind, item: EditableEntry) =>
    setEditing({ kind, item });
  const backfillMacros = async () => {
    if (!supabase || macroJobId) return;
    const missing = data.nutritionEntries.filter(
      (entry) =>
        entry.caloriesKcal == null ||
        entry.proteinG == null ||
        entry.carbsG == null ||
        entry.fatG == null ||
        entry.fiberG == null,
    );
    if (!missing.length) {
      setMacroStatus("没有缺失营养素");
      return;
    }
    setMacroStatus(`正在估算 ${missing.length} 条…`);
    const { data: result, error } = await supabase.functions.invoke(
      "health-chat",
      { body: { action: "backfill-macros", entries: missing } },
    );
    if (error || !result?.jobId) {
      setMacroStatus(error?.message || "无法创建补全任务");
      return;
    }
    localStorage.setItem("nutrition-macro-job", result.jobId);
    setMacroJobId(result.jobId);
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
            <button
              className="primary"
              onClick={() => setRecordChooser("category")}
            >
              <Plus size={17} />
              添加记录
            </button>
          </div>
        </header>
        <CloudSync
          data={data}
          onCloudLoad={setData}
          inline={page === "chat"}
        />
        <div className={`mobile-chat-page${page === "chat" ? " active" : ""}`}>
          <HealthChat embedded onApply={applyChat} />
        </div>
        {page === "dashboard" && <Dashboard data={data} rows={filtered} />}{" "}
        {page === "nutrition" && (
          <Nutrition
            data={data}
            rows={filtered}
            del={del}
            edit={edit}
            onBackfill={backfillMacros}
            backfillStatus={macroStatus}
            backfillRunning={Boolean(macroJobId)}
          />
        )}{" "}
        {page === "exercise" && (
          <Exercise
            data={data}
            rows={filtered}
            del={del}
            add={setAdd}
            edit={edit}
          />
        )}{" "}
        {page === "body" && (
          <Body data={data} del={del} add={setAdd} edit={edit} />
        )}{" "}
        {page === "cycle" && (
          <Cycle data={data} del={del} add={setAdd} edit={edit} />
        )}{" "}
        {page === "calendar" && (
          <Calendar data={data} del={del} edit={edit} />
        )}{" "}
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
      {recordChooser && (
        <Modal
          title={recordChooser === "category" ? "添加什么记录？" : "选择运动类型"}
          onClose={() => setRecordChooser(null)}
        >
          <div className="record-choice-grid">
            {recordChooser === "category" ? (
              <>
                <button
                  onClick={() => {
                    setRecordChooser(null);
                    setAdd("nutrition");
                  }}
                >
                  <Apple size={22} />
                  <b>饮食</b>
                  <span>食物、饮料与营养</span>
                </button>
                <button onClick={() => setRecordChooser("exercise")}>
                  <Dumbbell size={22} />
                  <b>运动</b>
                  <span>有氧或无氧训练</span>
                </button>
                <button
                  onClick={() => {
                    setRecordChooser(null);
                    setAdd("body");
                  }}
                >
                  <Scale size={22} />
                  <b>体重 / 身体</b>
                  <span>体重、体脂与围度</span>
                </button>
                <button
                  onClick={() => {
                    setRecordChooser(null);
                    setAdd("menstrual");
                  }}
                >
                  <Droplets size={22} />
                  <b>经期</b>
                  <span>日期、经量与症状</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setRecordChooser(null);
                    setAdd("cardio");
                  }}
                >
                  <Activity size={22} />
                  <b>有氧运动</b>
                  <span>跳舞、走路、跑步等</span>
                </button>
                <button
                  onClick={() => {
                    setRecordChooser(null);
                    setAdd("strength");
                  }}
                >
                  <Dumbbell size={22} />
                  <b>无氧运动</b>
                  <span>动作、组数、次数与重量</span>
                </button>
                <button
                  className="choice-back"
                  onClick={() => setRecordChooser("category")}
                >
                  返回上一层
                </button>
              </>
            )}
          </div>
        </Modal>
      )}
      {add && (
        <Modal
          title={
            add === "nutrition"
              ? "新增饮食"
              : add === "cardio"
                ? "新增有氧"
                : add === "strength"
                  ? "新增无氧"
                  : add === "body"
                    ? "新增身体数据"
                    : "新增经期记录"
          }
          onClose={() => setAdd(null)}
        >
          <EntryForm kind={add} onSave={save} />
        </Modal>
      )}
      {editing && (
        <Modal
          title={
            editing.kind === "nutrition"
              ? "编辑饮食"
              : editing.kind === "cardio"
                ? "编辑有氧"
                : editing.kind === "strength"
                  ? "编辑无氧"
                  : editing.kind === "body"
                    ? "编辑身体数据"
                    : "编辑经期记录"
          }
          onClose={() => setEditing(null)}
        >
          <EntryForm
            kind={editing.kind}
            initial={editing.item}
            onSave={save}
          />
        </Modal>
      )}
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
  const chartRows = rows.map((row) => {
      const cycle = cycleStatus(data, row.date);
      return {
        ...row,
        cyclePhase: cycle?.phase ?? null,
      };
    }),
    phaseRanges = chartRows.reduce<
      { phase: CyclePhase; start: string; end: string }[]
    >((ranges, row) => {
      if (!row.cyclePhase) return ranges;
      const previous = ranges.at(-1);
      if (previous?.phase === row.cyclePhase) previous.end = row.label;
      else
        ranges.push({
          phase: row.cyclePhase,
          start: row.label,
          end: row.label,
        });
      return ranges;
    }, []),
    last = rows.at(-1),
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
        无氧消耗缺失时，使用最近体重和 3.5 MET
        估算；缺少时长时按每组约 1.5 分钟估算。“记录热量差值”仅为摄入减去已记录或估算的运动消耗，不代表真实盈余或缺口。
      </div>
      <div className="metrics dashboard-metrics">
        <article className="hero-metric">
          <p>摄入热量</p>
          <strong>{fmt(last?.calories)}</strong>
          <span>kcal</span>
        </article>
        <article className="metric-group macro-metric">
          <p>宏量营养素</p>
          <div className="metric-group-values">
            <div>
              <small>蛋白质</small>
              <b>{fmt(last?.protein, 1)}g</b>
            </div>
            <div>
              <small>碳水</small>
              <b>{fmt(last?.carbs, 1)}g</b>
            </div>
            <div>
              <small>脂肪</small>
              <b>{fmt(last?.fat, 1)}g</b>
            </div>
          </div>
        </article>
        <article className="metric-group exercise-metric">
          <p>运动概况</p>
          <div className="metric-group-values">
            <div>
              <small>运动时间</small>
              <b>
                {fmt((last?.cardio ?? 0) + (last?.strength ?? 0))}
                <i>min</i>
              </b>
            </div>
            <div>
              <small>
                {last?.burnedEstimated ? "消耗（含估算）" : "运动消耗"}
              </small>
              <b>
                {fmt(last?.burned)}
                <i>kcal</i>
              </b>
            </div>
            <div>
              <small>有氧 / 无氧</small>
              <b>
                {last?.cardio ?? 0} / {fmt(last?.strength)}
                <i>min</i>
              </b>
            </div>
          </div>
        </article>
        {cards.map(([a, b, c]) => (
          <article key={a}>
            <p>{a}</p>
            <strong>{b}</strong>
            <span>{c}</span>
          </article>
        ))}
      </div>
      <div className="grid2 overview-chart-grid">
        <ChartCard
          title="饮食热量与运动量"
          subtitle="kcal · 有氧记录值 + 无氧记录/估算值"
          empty={!rows.some((x) => x.calories != null || x.burned != null)}
        >
          <div className="phase-chart">
            <div className="phase-chart-legend">
              {(Object.keys(phaseLabels) as CyclePhase[]).map((phase) => (
                <span key={phase}>
                  <i style={{ background: phaseColors[phase] }} />
                  {phaseLabels[phase]}
                </span>
              ))}
            </div>
            <ResponsiveContainer>
              <ComposedChart data={chartRows} barCategoryGap={0}>
                {phaseRanges.map((range, index) => (
                  <ReferenceArea
                    key={`${range.phase}-${range.start}-${index}`}
                    yAxisId="calories"
                    x1={range.start}
                    x2={range.end}
                    fill={phaseColors[range.phase]}
                    fillOpacity={0.16}
                    strokeOpacity={0}
                    ifOverflow="hidden"
                  />
                ))}
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" />
                <YAxis yAxisId="calories" domain={[0, "auto"]} />
                <Tooltip />
                <Legend />
                <Bar
                  yAxisId="calories"
                  dataKey="cardioBurn"
                  stackId="burned"
                  name="有氧消耗"
                  fill="#82b593"
                />
                <Bar
                  yAxisId="calories"
                  dataKey="strengthBurn"
                  stackId="burned"
                  name="无氧消耗（含估算）"
                  fill="#ef806d"
                />
                <Line
                  yAxisId="calories"
                  dataKey="calories"
                  name="摄入热量"
                  stroke="#2f6b4f"
                  strokeWidth={3}
                  connectNulls={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>
    </>
  );
}
function Nutrition({
  data,
  rows,
  del,
  edit,
  onBackfill,
  backfillStatus,
  backfillRunning,
}: {
  data: HealthData;
  rows: ReturnType<typeof daily>;
  del: (k: string, id: string) => void;
  edit: (kind: EntryKind, item: EditableEntry) => void;
  onBackfill: () => void;
  backfillStatus: string;
  backfillRunning: boolean;
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
            <button
              className="macro-backfill"
              onClick={onBackfill}
              disabled={backfillRunning}
            >
              {backfillRunning ? "后台估算中…" : "补全缺失营养素"}
            </button>
            {backfillStatus && (
              <small className="macro-backfill-status">{backfillStatus}</small>
            )}
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
          onEdit={(id) => {
            const item = data.nutritionEntries.find((entry) => entry.id === id);
            if (item) edit("nutrition", item);
          }}
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
  edit,
}: {
  data: HealthData;
  rows: ReturnType<typeof daily>;
  del: (k: string, id: string) => void;
  add: (v: EntryKind) => void;
  edit: (kind: EntryKind, item: EditableEntry) => void;
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
        onEdit={edit}
      />
    </>
  );
}
function Body({
  data,
  del,
  add,
  edit,
}: {
  data: HealthData;
  del: (kind: string, id: string) => void;
  add: (kind: EntryKind) => void;
  edit: (kind: EntryKind, item: EditableEntry) => void;
}) {
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
      <section className="panel">
        <div className="section-head">
          <div>
            <h3>身体数据记录</h3>
            <p className="muted">{data.bodyMetricEntries.length} 条</p>
          </div>
          <button className="primary" onClick={() => add("body")}>
            <Plus size={16} /> 新增身体数据
          </button>
        </div>
        <EntryTable
          data={data}
          rows={[...data.bodyMetricEntries]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((entry) => ({
              id: entry.id,
              date: entry.date,
              name: [
                entry.weightKg != null ? `体重 ${entry.weightKg} kg` : null,
                entry.bodyFatPercentage != null
                  ? `体脂 ${entry.bodyFatPercentage}%`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || "身体围度记录",
              detail:
                [
                  entry.waistCm != null ? `腰围 ${entry.waistCm} cm` : null,
                  entry.hipCm != null ? `臀围 ${entry.hipCm} cm` : null,
                  entry.chestCm != null ? `胸围 ${entry.chestCm} cm` : null,
                  entry.thighCm != null ? `大腿围 ${entry.thighCm} cm` : null,
                  entry.armCm != null ? `臂围 ${entry.armCm} cm` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "无围度数据",
              estimated: Boolean(entry.isEstimated),
              source: entry.sourceText,
            }))}
          onDelete={(id) => del("bodyMetricEntries", id)}
          onEdit={(id) => {
            const item = data.bodyMetricEntries.find(
              (entry) => entry.id === id,
            );
            if (item) edit("body", item);
          }}
        />
      </section>
    </>
  );
}
type CyclePhase = "menstrual" | "follicular" | "ovulation" | "luteal";
const phaseLabels: Record<CyclePhase, string> = {
  menstrual: "月经期",
  follicular: "卵泡期",
  ovulation: "排卵期",
  luteal: "黄体期",
};
const phaseColors: Record<CyclePhase, string> = {
  menstrual: "#d96c7a",
  follicular: "#8fbd73",
  ovulation: "#e6b84a",
  luteal: "#9a7ac2",
};
function cycleStatus(data: HealthData, date: string) {
  const entries = [...data.menstrualEntries].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  if (!entries.length) return null;
  if (date < entries[0].date) return null;
  const intervals = entries
    .slice(1)
    .map((entry, index) =>
      differenceInCalendarDays(
        parseISO(entry.date),
        parseISO(entries[index].date),
      ),
    )
    .filter((days) => days >= 21 && days <= 35);
  const cycleLength = intervals.length
    ? Math.round(intervals.reduce((sum, days) => sum + days, 0) / intervals.length)
    : 28;
  const latest =
    entries.filter((entry) => entry.date <= date).at(-1) ?? entries[0];
  const rawDay =
    differenceInCalendarDays(parseISO(date), parseISO(latest.date)) + 1;
  const cycleDay = ((Math.max(1, rawDay) - 1) % cycleLength) + 1;
  const recordedDuration = latest.endDate
    ? differenceInCalendarDays(parseISO(latest.endDate), parseISO(latest.date)) +
      1
    : 5;
  const menstrualDays = Math.min(Math.max(recordedDuration, 1), 10);
  const ovulationDay = Math.max(menstrualDays + 2, cycleLength - 14);
  let phase: CyclePhase;
  if (cycleDay <= menstrualDays) phase = "menstrual";
  else if (cycleDay < ovulationDay) phase = "follicular";
  else if (cycleDay <= ovulationDay + 1) phase = "ovulation";
  else phase = "luteal";
  const insideRecordedPeriod =
    date >= latest.date && Boolean(latest.endDate && date <= latest.endDate);
  return {
    phase,
    cycleDay,
    cycleLength,
    menstrualDays,
    ovulationDay,
    isPrediction: phase !== "menstrual" || !insideRecordedPeriod,
    irregular: intervals.length > 1 && Math.max(...intervals) - Math.min(...intervals) > 7,
  };
}
const cycleAdvice: Record<
  CyclePhase,
  { training: string[]; nutrition: string[] }
> = {
  menstrual: {
    training: [
      "没有明显不适时可照常训练；腹痛、疲劳或经量较大时，可降低强度、缩短训练或休息。",
      "散步、轻松有氧、活动度训练和较轻的力量训练都是可选项，以主观感受为准。",
    ],
    nutrition: [
      "保持正常均衡饮食、蛋白质和水分，不必因经期强制改变热量目标。",
      "经量较大者可关注含铁食物；铁补充剂应先咨询医生或营养师。",
    ],
  },
  follicular: {
    training: [
      "感觉良好时可按原计划渐进训练力量、容量或有氧，不需要因为阶段标签强制加量。",
      "继续记录表现与恢复，用个人趋势决定训练负荷。",
    ],
    nutrition: [
      "维持足够总能量、蛋白质和训练前后碳水，支持恢复与渐进训练。",
      "没有可靠证据要求卵泡期采用特殊饮食比例。",
    ],
  },
  ovulation: {
    training: [
      "可以正常训练；预测排卵期并不代表表现一定达到峰值。",
      "按当天睡眠、疼痛和主观疲劳调整强度，正常热身并保持动作控制。",
    ],
    nutrition: [
      "保持日常均衡饮食和补水；训练量高时相应补充碳水和蛋白质。",
      "此阶段无需额外补充特定保健品。",
    ],
  },
  luteal: {
    training: [
      "可以维持原计划；若出现 PMS、睡眠变差或主观用力感升高，可减少容量或安排恢复训练。",
      "规律有氧活动可能帮助部分人缓解 PMS，但以症状反应为准。",
    ],
    nutrition: [
      "保持均衡饮食；若食欲波动，可尝试规律、较小份餐食和富含复合碳水的食物。",
      "不要因短期体重或水分波动过度限制热量。",
    ],
  },
};
function Cycle({
  data,
  del,
  add,
  edit,
}: {
  data: HealthData;
  del: (kind: string, id: string) => void;
  add: (kind: EntryKind) => void;
  edit: (kind: EntryKind, item: EditableEntry) => void;
}) {
  const today = format(new Date(), "yyyy-MM-dd");
  const status = cycleStatus(data, today);
  const advice = status ? cycleAdvice[status.phase] : null;
  const flowLabels = { light: "少", medium: "中", heavy: "多" } as const;
  return (
    <>
      <section className="cycle-hero">
        <div>
          <p className="eyebrow">CYCLE TRACKER</p>
          <h2>
            {status
              ? `${status.isPrediction ? "预测" : ""}${phaseLabels[status.phase]}`
              : "尚未记录经期"}
          </h2>
          <p>
            {status
              ? `周期第 ${status.cycleDay} 天 · 当前平均周期约 ${status.cycleLength} 天`
              : "添加最近一次月经开始日后，才能显示周期阶段。"}
          </p>
        </div>
        <button className="primary" onClick={() => add("menstrual")}>
          <Plus size={16} /> 记录经期
        </button>
      </section>
      {status && (
        <>
          <section className="panel cycle-timeline">
            <h3>周期阶段</h3>
            <div>
              {(
                [
                  ["menstrual", `第 1–${status.menstrualDays} 天`],
                  [
                    "follicular",
                    `第 ${status.menstrualDays + 1}–${status.ovulationDay - 1} 天`,
                  ],
                  [
                    "ovulation",
                    `约第 ${status.ovulationDay}–${status.ovulationDay + 1} 天`,
                  ],
                  [
                    "luteal",
                    `第 ${status.ovulationDay + 2}–${status.cycleLength} 天`,
                  ],
                ] as [CyclePhase, string][]
              ).map(([phase, range]) => (
                <article
                  key={phase}
                  className={status.phase === phase ? `active ${phase}` : phase}
                >
                  <b>{phaseLabels[phase]}</b>
                  <span>{range}</span>
                </article>
              ))}
            </div>
            <p className="muted">
              除已记录的月经日期外，其他阶段均为日历预测，不能确认真实排卵日。
              {status.irregular && " 最近周期波动较大，预测可信度较低。"}
            </p>
          </section>
          <div className="grid2 cycle-advice">
            <section className="panel">
              <h3>{phaseLabels[status.phase]} · 健身建议</h3>
              {advice?.training.map((item) => <p key={item}>{item}</p>)}
            </section>
            <section className="panel">
              <h3>{phaseLabels[status.phase]} · 饮食建议</h3>
              {advice?.nutrition.map((item) => <p key={item}>{item}</p>)}
            </section>
          </div>
        </>
      )}
      <section className="panel">
        <div className="section-head">
          <div>
            <h3>经期记录</h3>
            <p className="muted">{data.menstrualEntries.length} 条</p>
          </div>
          <button className="primary" onClick={() => add("menstrual")}>
            <Plus size={16} /> 新增
          </button>
        </div>
        <EntryTable
          data={data}
          rows={[...data.menstrualEntries]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((entry) => ({
              id: entry.id,
              date: entry.date,
              name: `月经期${entry.endDate ? ` · 至 ${entry.endDate}` : ""}`,
              detail: [
                entry.flow ? `经量 ${flowLabels[entry.flow]}` : null,
                entry.symptoms.length ? entry.symptoms.join("、") : null,
              ]
                .filter(Boolean)
                .join(" · ") || "未记录经量或症状",
              estimated: entry.isEstimated,
            }))}
          onDelete={(id) => del("menstrualEntries", id)}
          onEdit={(id) => {
            const item = data.menstrualEntries.find((entry) => entry.id === id);
            if (item) edit("menstrual", item);
          }}
        />
      </section>
      <div className="notice cycle-notice">
        建议用于自我观察，不代替医疗意见。周期少于 21 天、超过 35
        天、经期超过 7 天、异常出血或症状影响生活时，建议咨询医生。
      </div>
    </>
  );
}
function Calendar({
  data,
  del,
  edit,
}: {
  data: HealthData;
  del: (kind: string, id: string) => void;
  edit: (kind: EntryKind, item: EditableEntry) => void;
}) {
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
    strength = data.strengthEntries.filter((x) => x.date === selected),
    bodyMetrics = data.bodyMetricEntries.filter((x) => x.date === selected);
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
  const hasEntries =
    foods.length + cardio.length + strength.length + bodyMetrics.length > 0;
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
                  <div className="entry-actions">
                    <button className="edit" onClick={() => edit("nutrition", x)}>
                      编辑
                    </button>
                    <button
                      className="delete"
                      onClick={() => del("nutritionEntries", x.id)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              )),
            )}
            {cardio.map((x) => (
              <div className="day-row" key={x.id}>
                <b>有氧</b>
                <span>{x.activityName || x.activityType}</span>
                <div className="entry-actions">
                  <button className="edit" onClick={() => edit("cardio", x)}>
                    编辑
                  </button>
                  <button
                    className="delete"
                    onClick={() => del("cardioEntries", x.id)}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
            {strength.map((x) => (
              <div className="day-row" key={x.id}>
                <b>无氧</b>
                <span>{x.exerciseName}</span>
                <div className="entry-actions">
                  <button className="edit" onClick={() => edit("strength", x)}>
                    编辑
                  </button>
                  <button
                    className="delete"
                    onClick={() => del("strengthEntries", x.id)}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
            {bodyMetrics.map((x) => (
              <div className="day-row" key={x.id}>
                <b>身体</b>
                <span>
                  {x.weightKg != null ? `${x.weightKg} kg` : "身体围度记录"}
                </span>
                <div className="entry-actions">
                  <button className="edit" onClick={() => edit("body", x)}>
                    编辑
                  </button>
                  <button
                    className="delete"
                    onClick={() => del("bodyMetricEntries", x.id)}
                  >
                    删除
                  </button>
                </div>
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
  onEdit,
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
  onEdit: (id: string) => void;
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
                          <div className="entry-actions">
                            <button
                              className="edit"
                              onClick={() => onEdit(x.id)}
                            >
                              编辑
                            </button>
                            <button
                              className="delete"
                              onClick={() => onDelete(x.id)}
                            >
                              删除
                            </button>
                          </div>
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
                  <div className="entry-actions">
                    <button className="edit" onClick={() => onEdit(x.id)}>
                      编辑
                    </button>
                    <button className="delete" onClick={() => onDelete(x.id)}>
                      删除
                    </button>
                  </div>
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
            <div className="entry-actions">
              <button className="edit" onClick={() => onEdit(x.id)}>
                编辑
              </button>
              <button className="delete" onClick={() => onDelete(x.id)}>
                删除
              </button>
            </div>
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

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  MessageCircle,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { format } from "date-fns";
import type {
  BodyMetricEntry,
  CardioEntry,
  NutritionEntry,
  StrengthEntry,
} from "../types/health";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

type ChatMessage = { role: "user" | "assistant"; content: string };
export type ProposedChanges = {
  reply: string;
  nutritionEntries: NutritionEntry[];
  cardioEntries: CardioEntry[];
  strengthEntries: StrengthEntry[];
  bodyMetricEntries: BodyMetricEntry[];
};
const kinds = [
  ["nutritionEntries", "饮食"],
  ["cardioEntries", "有氧"],
  ["strengthEntries", "无氧"],
  ["bodyMetricEntries", "身体"],
] as const;
const name = (item: Record<string, unknown>) =>
  String(
    item.foodName ||
      item.activityName ||
      item.exerciseName ||
      (item.weightKg != null ? `体重 ${item.weightKg} kg` : "身体数据"),
  );
const suggestions = [
  "早餐：两个蛋白，一杯200ml牛奶",
  "跳舞45分钟，中等强度",
  "今天体重55.8kg",
];
const detail = (item: Record<string, unknown>) => {
  if (item.foodName)
    return [
      item.caloriesKcal != null ? `${item.caloriesKcal} kcal` : null,
      item.proteinG != null ? `${item.proteinG}g 蛋白` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  if (item.activityType)
    return item.durationMinutes != null ? `${item.durationMinutes} 分钟` : "";
  if (item.exerciseName)
    return [
      item.sets != null ? `${item.sets} 组` : null,
      item.totalReps != null ? `${item.totalReps} 次` : null,
      item.weightKg != null
        ? `${Math.round(Number(item.weightKg) * 2.20462)} lb`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
  return "";
};
async function requestHealthChat(payload: {
  message: string;
  history: ChatMessage[];
  today: string;
}) {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.functions.invoke("health-chat", {
      body: payload,
    });
    if (error) {
      let detail = "";
      const context = (error as { context?: Response }).context;
      if (context)
        try {
          const body = (await context.clone().json()) as { error?: string };
          detail = body.error || "";
        } catch {
          try {
            detail = await context.clone().text();
          } catch {
            detail = "";
          }
        }
      throw new Error(
        detail || error.message || "Supabase Edge Function 请求失败",
      );
    }
    return data as ProposedChanges;
  }
  const response = await fetch("/api/health-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  if (!raw.trim())
    throw new Error(
      "AI 服务没有响应。请确认使用 npm run dev 启动，并检查终端中的 API 服务状态。",
    );
  let json: ProposedChanges & { error?: string };
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(
      `AI 服务返回了无法解析的内容（HTTP ${response.status}）。请检查本地 API 终端日志。`,
    );
  }
  if (!response.ok) throw new Error(json.error || "AI 请求失败");
  return json;
}

export function HealthChat({
  onApply,
}: {
  onApply: (changes: ProposedChanges) => void;
}) {
  const [open, setOpen] = useState(false),
    [text, setText] = useState(""),
    [loading, setLoading] = useState(false),
    [pending, setPending] = useState<ProposedChanges | null>(null),
    [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);
  const send = async () => {
    const message = text.trim();
    if (!message || loading) return;
    setText("");
    setError("");
    setPending(null);
    setMessages((v) => [...v, { role: "user", content: message }]);
    setLoading(true);
    try {
      const json = await requestHealthChat({
        message,
        history: messages,
        today: format(new Date(), "yyyy-MM-dd"),
      });
      setPending(json);
      setMessages((v) => [...v, { role: "assistant", content: json.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 请求失败");
    } finally {
      setLoading(false);
    }
  };
  const count = pending
    ? kinds.reduce((total, [key]) => total + pending[key].length, 0)
    : 0;
  const apply = () => {
    if (!pending) return;
    onApply(pending);
    setMessages((v) => [
      ...v,
      { role: "assistant", content: `已保存 ${count} 条健康记录。` },
    ]);
    setPending(null);
  };
  const clear = () => {
    setMessages([]);
    setPending(null);
    setError("");
  };
  return (
    <>
      <button
        className="chat-fab"
        onClick={() => setOpen(true)}
        aria-label="打开健康助手"
      >
        <MessageCircle size={22} />
      </button>
      {open && (
        <aside className="health-chat" aria-label="AI 健康记录助手">
          <header>
            <div>
              <span>
                <Bot size={17} />
              </span>
              <div>
                <b>健康记录助手</b>
                <small><i /> 已连接 Supabase · 确认后写入</small>
              </div>
            </div>
            <div className="chat-header-actions">
              {!!messages.length && (
                <button onClick={clear} aria-label="清空本次对话" title="清空本次对话">
                  <Trash2 size={16} />
                </button>
              )}
              <button onClick={() => setOpen(false)} aria-label="关闭">
                <X size={18} />
              </button>
            </div>
          </header>
          <div className="chat-messages">
            {!messages.length && (
              <div className="chat-welcome">
                <span><Sparkles size={19} /></span>
                <b>今天记录什么？</b>
                <p>用自然语言输入饮食、运动或身体数据，我会先整理给你确认。</p>
                <div className="chat-suggestions">
                  {suggestions.map((suggestion) => (
                    <button key={suggestion} onClick={() => setText(suggestion)}>
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble ${m.role}`}>
                {m.content}
              </div>
            ))}
            {loading && (
              <div className="chat-bubble assistant chat-typing">
                <i /><i /><i /><span>正在整理记录</span>
              </div>
            )}
            {error && <div className="chat-error">{error}</div>}
            {pending && count > 0 && (
              <section className="chat-preview">
                <div>
                  <b>待写入 {count} 条</b>
                  <span>请先核对</span>
                </div>
                {kinds.map(([key, label]) =>
                  pending[key].length ? (
                    <div className="preview-group" key={key}>
                      <strong>{label}</strong>
                      {pending[key].map((item) => (
                        <p key={item.id}>
                          <span>{item.date}</span>
                          <b>
                            {name(item as unknown as Record<string, unknown>)}
                            <small>{detail(item as unknown as Record<string, unknown>)}</small>
                          </b>
                          {item.isEstimated && <i>估算</i>}
                        </p>
                      ))}
                    </div>
                  ) : null,
                )}
                <div className="preview-actions">
                  <button onClick={() => setPending(null)}>取消</button>
                  <button className="confirm" onClick={apply}>
                    <Check size={15} />
                    确认写入
                  </button>
                </div>
              </section>
            )}
            <div ref={end} />
          </div>
          <div className="chat-compose">
            <div>
              <textarea
                value={text}
                maxLength={1000}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="例如：午餐鸡肉饭一份，少油…"
                aria-label="健康记录内容"
                rows={2}
              />
              <small>Enter 发送 · Shift + Enter 换行</small>
            </div>
            <button
              onClick={send}
              disabled={!text.trim() || loading}
              aria-label="发送"
            >
              <Send size={18} />
            </button>
          </div>
        </aside>
      )}
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Camera,
  Check,
  LoaderCircle,
  MessageCircle,
  Mic,
  MicOff,
  Minus,
  Send,
  Sparkles,
  Trash2,
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
type StoredChatJob = { jobId: string; message: string; createdAt: string };
type SpeechResultEvent = {
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => {
  detect: (source: ImageBitmap) => Promise<Array<{ rawValue: string }>>;
};

const voiceLanguages = [
  ["zh-CN", "中文"],
  ["en-US", "English"],
  ["es-ES", "Español"],
  ["fr-FR", "Français"],
  ["ja-JP", "日本語"],
  ["ko-KR", "한국어"],
] as const;
const pendingJobKey = "health-chat-pending-job";
const readStoredJob = (): StoredChatJob | null => {
  try {
    const value = localStorage.getItem(pendingJobKey);
    return value ? (JSON.parse(value) as StoredChatJob) : null;
  } catch {
    return null;
  }
};
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
async function submitHealthChat(payload: {
  message: string;
  history: ChatMessage[];
  today: string;
}): Promise<{ jobId?: string; result?: ProposedChanges }> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.functions.invoke("health-chat", {
      body: { action: "submit", ...payload },
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
    return { jobId: (data as { jobId: string }).jobId };
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
  return { result: json };
}
async function checkHealthChatJob(jobId: string) {
  if (!supabase) throw new Error("Supabase 未配置");
  const { data, error } = await supabase.functions.invoke("health-chat", {
    body: { action: "status", jobId },
  });
  if (error) throw error;
  return data as {
    status: "queued" | "running" | "completed" | "failed";
    result: ProposedChanges | null;
    error: string | null;
  };
}
async function loadHealthChatHistory(): Promise<ChatMessage[]> {
  if (!supabase) return [];
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return [];
  const { data, error } = await supabase.functions.invoke("health-chat", {
    body: { action: "history" },
  });
  if (error) throw error;
  const jobs = (data as {
    jobs: Array<{
      request: { message?: string };
      result: ProposedChanges | null;
    }>;
  }).jobs;
  return jobs.flatMap((job) => {
    const messages: ChatMessage[] = [];
    if (job.request?.message)
      messages.push({ role: "user", content: job.request.message });
    if (job.result?.reply)
      messages.push({ role: "assistant", content: job.result.reply });
    return messages;
  });
}

async function lookupOpenFoodFacts(barcode: string) {
  const response = await fetch(
    `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}.json?fields=code,product_name,product_name_zh,brands,quantity,serving_size,nutriments`,
  );
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    status?: string;
    product?: {
      product_name?: string;
      product_name_zh?: string;
      brands?: string;
      quantity?: string;
      serving_size?: string;
      nutriments?: Record<string, number | string>;
    };
  };
  if (!payload.product || payload.status === "failure") return null;
  return payload.product;
}

const nutrientValue = (
  nutrients: Record<string, number | string> | undefined,
  key: string,
) => {
  const value = nutrients?.[`${key}_100g`];
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
};

export function HealthChat({
  onApply,
  embedded = false,
}: {
  onApply: (changes: ProposedChanges) => void;
  embedded?: boolean;
}) {
  const restoredJob = readStoredJob();
  const [hadRestoredJob] = useState(Boolean(restoredJob));
  const [open, setOpen] = useState(embedded),
    [text, setText] = useState(""),
    [loading, setLoading] = useState(Boolean(restoredJob)),
    [jobId, setJobId] = useState<string | null>(restoredJob?.jobId ?? null),
    [pending, setPending] = useState<ProposedChanges | null>(null),
    [error, setError] = useState(""),
    [notification, setNotification] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    restoredJob ? [{ role: "user", content: restoredJob.message }] : [],
  );
  const end = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const openRef = useRef(open);
  const [voiceLanguage, setVoiceLanguage] = useState("zh-CN");
  const [listening, setListening] = useState(false);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [mediaStatus, setMediaStatus] = useState("");
  useEffect(() => {
    openRef.current = open;
    if (open) setNotification(null);
  }, [open]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);
  useEffect(() => {
    if (!supabase || hadRestoredJob) return;
    let active = true;
    const load = async () => {
      try {
        const history = await loadHealthChatHistory();
        if (active && history.length)
          setMessages((current) => (current.length ? current : history));
      } catch {
        // 未登录或临时离线时保持空白；登录后认证事件会再次加载。
      }
    };
    void load();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") void load();
      if (event === "SIGNED_OUT" && active) setMessages([]);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [hadRestoredJob]);
  useEffect(
    () => () => {
      recognition.current?.stop();
    },
    [],
  );
  useEffect(() => {
    if (!jobId) return;
    let active = true;
    let timer = 0;
    let checking = false;
    const check = async () => {
      if (!active || checking) return;
      checking = true;
      try {
        const job = await checkHealthChatJob(jobId);
        if (!active) return;
        if (job.status === "completed" && job.result) {
          setPending(job.result);
          setMessages((value) => [
            ...value,
            { role: "assistant", content: job.result!.reply },
          ]);
          if (readStoredJob()?.jobId === jobId)
            localStorage.removeItem(pendingJobKey);
          setJobId(null);
          setLoading(false);
          setError("");
          if (!embedded && !openRef.current)
            setNotification("健康记录已经整理完成，点击查看");
          return;
        }
        if (job.status === "failed") {
          setError(job.error || "后台处理失败");
          if (readStoredJob()?.jobId === jobId)
            localStorage.removeItem(pendingJobKey);
          setJobId(null);
          setLoading(false);
          if (!embedded && !openRef.current)
            setNotification("后台处理失败，点击查看详情");
          return;
        }
      } catch {
        // 手机恢复联网或回到前台后会继续查询同一任务。
      } finally {
        checking = false;
      }
      if (active) timer = window.setTimeout(check, document.hidden ? 10000 : 2000);
    };
    const resume = () => {
      if (document.hidden) return;
      window.clearTimeout(timer);
      void check();
    };
    void check();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [jobId, embedded]);
  const send = async () => {
    const message = text.trim();
    if (!message || loading) return;
    setText("");
    setError("");
    setPending(null);
    setMessages((v) => [...v, { role: "user", content: message }]);
    setLoading(true);
    try {
      const submitted = await submitHealthChat({
        message,
        history: messages,
        today: format(new Date(), "yyyy-MM-dd"),
      });
      if (submitted.jobId) {
        localStorage.setItem(
          pendingJobKey,
          JSON.stringify({
            jobId: submitted.jobId,
            message,
            createdAt: new Date().toISOString(),
          } satisfies StoredChatJob),
        );
        setJobId(submitted.jobId);
      } else if (submitted.result) {
        setPending(submitted.result);
        setMessages((v) => [
          ...v,
          { role: "assistant", content: submitted.result!.reply },
        ]);
        setLoading(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 请求失败");
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
    if (supabase)
      void supabase.functions.invoke("health-chat", {
        body: { action: "clear-history" },
      });
  };
  const toggleVoice = () => {
    if (listening) {
      recognition.current?.stop();
      setListening(false);
      return;
    }
    const browserWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition =
      browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setMediaStatus("此浏览器不支持语音输入，请使用最新版 Chrome 或 Safari。");
      return;
    }
    const instance = new Recognition();
    instance.lang = voiceLanguage;
    instance.continuous = true;
    instance.interimResults = false;
    instance.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();
      if (transcript)
        setText((current) =>
          [current.trim(), transcript].filter(Boolean).join(" "),
        );
    };
    instance.onerror = (event) => {
      setMediaStatus(
        event.error === "not-allowed"
          ? "请允许浏览器使用麦克风。"
          : `语音识别失败：${event.error}`,
      );
      setListening(false);
    };
    instance.onend = () => setListening(false);
    recognition.current = instance;
    setMediaStatus(`正在听写（${voiceLanguages.find(([id]) => id === voiceLanguage)?.[1]}）…`);
    setListening(true);
    instance.start();
  };
  const processPhoto = async (file: File) => {
    setPhotoProcessing(true);
    setMediaStatus("正在本地识别照片，不会上传原图…");
    try {
      let barcode = "";
      const detectorWindow = window as typeof window & {
        BarcodeDetector?: BarcodeDetectorConstructor;
      };
      if (detectorWindow.BarcodeDetector) {
        try {
          const bitmap = await createImageBitmap(file);
          const detector = new detectorWindow.BarcodeDetector({
            formats: ["ean_13", "ean_8", "upc_a", "upc_e", "qr_code"],
          });
          barcode = (await detector.detect(bitmap))[0]?.rawValue || "";
          bitmap.close();
        } catch {
          // 条码 API 并非所有浏览器均完整支持，继续使用 OCR。
        }
      }
      if (barcode) {
        setMediaStatus("识别到条码，正在查询 Open Food Facts…");
        const product = await lookupOpenFoodFacts(barcode);
        if (product) {
          const nutrients = product.nutriments;
          const facts = [
            ["热量", nutrientValue(nutrients, "energy-kcal"), "kcal"],
            ["蛋白质", nutrientValue(nutrients, "proteins"), "g"],
            ["碳水", nutrientValue(nutrients, "carbohydrates"), "g"],
            ["脂肪", nutrientValue(nutrients, "fat"), "g"],
            ["纤维", nutrientValue(nutrients, "fiber"), "g"],
          ]
            .filter(([, value]) => value != null)
            .map(([label, value, unit]) => `${label} ${value}${unit}`)
            .join("，");
          setText((current) =>
            [
              current.trim(),
              `照片条码 ${barcode}（Open Food Facts）：${product.product_name_zh || product.product_name || "未命名产品"}${product.brands ? `，品牌 ${product.brands}` : ""}${product.quantity ? `，包装 ${product.quantity}` : ""}${product.serving_size ? `，每份 ${product.serving_size}` : ""}${facts ? `；每100g：${facts}` : ""}。我食用了：`,
            ]
              .filter(Boolean)
              .join("\n"),
          );
          setMediaStatus("已从 Open Food Facts 填入产品信息，请补充食用份量。");
          return;
        }
      }
      setMediaStatus("未找到可用条码，正在本地识别中英文标签…");
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng+chi_sim");
      try {
        const result = await worker.recognize(file);
        const recognized = result.data.text.replace(/\n{3,}/g, "\n\n").trim();
        if (!recognized) {
          setMediaStatus("未识别到文字或条码，请在输入框补充食物名称和份量。");
          return;
        }
        setText((current) =>
          [
            current.trim(),
            `照片本地 OCR 结果（原图未上传）：\n${recognized}\n请从中提取食物、份量和营养信息。`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        );
        setMediaStatus("OCR 完成。请检查文字，确认后再发送。");
      } finally {
        await worker.terminate();
      }
    } catch (photoError) {
      setMediaStatus(
        photoError instanceof Error
          ? `照片识别失败：${photoError.message}`
          : "照片识别失败，请重试。",
      );
    } finally {
      setPhotoProcessing(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  return (
    <>
      {!embedded && (
        <button
          className={`chat-fab${loading ? " loading" : ""}`}
          onClick={() => {
            setNotification(null);
            setOpen(true);
          }}
          aria-label="打开健康助手"
        >
          <MessageCircle size={22} />
        </button>
      )}
      {!embedded && !open && notification && (
        <button
          className="chat-notification"
          onClick={() => {
            setNotification(null);
            setOpen(true);
          }}
        >
          <span><Bot size={16} /></span>
          <b>{notification}</b>
        </button>
      )}
      {open && (
        <aside className={`health-chat${embedded ? " embedded" : ""}`} aria-label="AI 健康记录助手">
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
              {!embedded && (
                <button
                  onClick={() => setOpen(false)}
                  aria-label="最小化对话"
                  title="最小化"
                >
                  <Minus size={19} />
                </button>
              )}
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
              <div className="chat-media-tools">
                <button
                  type="button"
                  className={listening ? "active" : ""}
                  onClick={toggleVoice}
                  disabled={photoProcessing}
                  aria-label={listening ? "停止语音输入" : "开始语音输入"}
                  title={listening ? "停止听写" : "语音输入"}
                >
                  {listening ? <MicOff size={16} /> : <Mic size={16} />}
                  <span>{listening ? "停止" : "语音"}</span>
                </button>
                <select
                  value={voiceLanguage}
                  onChange={(event) => setVoiceLanguage(event.target.value)}
                  disabled={listening}
                  aria-label="语音识别语言"
                >
                  {voiceLanguages.map(([id, label]) => (
                    <option value={id} key={id}>{label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={photoProcessing || listening}
                  aria-label="上传照片"
                  title="拍照或上传营养标签"
                >
                  {photoProcessing ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Camera size={16} />
                  )}
                  <span>{photoProcessing ? "识别中" : "照片"}</span>
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void processPhoto(file);
                  }}
                />
              </div>
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
              <small>
                {mediaStatus || "Enter 发送 · Shift + Enter 换行 · 原始语音和照片不发送给 OpenAI"}
              </small>
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

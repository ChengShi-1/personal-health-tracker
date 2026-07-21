import { useEffect, useRef, useState } from "react";
import { Cloud, CloudOff, LogOut, X } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { emptyHealthData, type HealthData } from "../types/health";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export function CloudSync({
  data,
  onCloudLoad,
}: {
  data: HealthData;
  onCloudLoad: (data: HealthData) => void;
}) {
  const [session, setSession] = useState<Session | null>(null),
    [open, setOpen] = useState(false),
    [email, setEmail] = useState(""),
    [status, setStatus] = useState(isSupabaseConfigured ? "未登录" : "未配置"),
    [sending, setSending] = useState(false);
  const loaded = useRef(false),
    timer = useRef<number>();
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      loaded.current = false;
      setSession(next);
      if (!next) onCloudLoad(emptyHealthData());
    });
    return () => subscription.unsubscribe();
  }, [onCloudLoad]);
  useEffect(() => {
    if (!supabase || !session || loaded.current) return;
    let active = true;
    (async () => {
      setStatus("同步中");
      const { data: cloudData, error } = await supabase.rpc("get_health_data");
      if (!active) return;
      if (error) {
        setStatus("同步失败");
        return;
      }
      const normalized = cloudData as HealthData | null;
      onCloudLoad(normalized ?? emptyHealthData());
      loaded.current = true;
      setStatus(normalized?.nutritionEntries?.length ? "已同步" : "云端暂无数据");
    })();
    return () => {
      active = false;
    };
  }, [session, onCloudLoad]);
  useEffect(() => {
    if (!supabase || !session || !loaded.current) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setStatus("保存中");
      const { error } = await supabase.rpc("save_health_data", {
        payload: data,
      });
      setStatus(error ? "保存失败" : "已同步");
    }, 900);
    return () => window.clearTimeout(timer.current);
  }, [data, session]);
  const login = async () => {
    if (!supabase || !email.trim()) return;
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: new URL(import.meta.env.BASE_URL, window.location.origin)
          .href,
      },
    });
    setStatus(error ? error.message : "登录链接已发送");
    setSending(false);
  };
  const logout = async () => {
    await supabase?.auth.signOut();
    loaded.current = false;
    setStatus("未登录");
  };
  return (
    <>
      <button
        className={`cloud-pill ${session ? "online" : ""}`}
        onClick={() => setOpen(true)}
      >
        {session ? <Cloud size={14} /> : <CloudOff size={14} />}
        <span>{status}</span>
      </button>
      {open && (
        <div className="cloud-popover">
          <header>
            <b>Supabase 云同步</b>
            <button onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </header>
          {!isSupabaseConfigured ? (
            <>
              <p>
                请先在 <code>.env</code> 配置 Supabase URL 和 Publishable Key。
              </p>
            </>
          ) : session ? (
            <>
              <p>
                <strong>{session.user.email}</strong>
              </p>
              <p>数据修改后会自动保存到你的私有标准化数据表。</p>
              <button className="cloud-logout" onClick={logout}>
                <LogOut size={14} />
                退出登录
              </button>
            </>
          ) : (
            <>
              <p>输入邮箱后，Supabase 会发送安全登录链接。</p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="你的邮箱"
              />
              <button
                className="cloud-login"
                onClick={login}
                disabled={sending || !email.trim()}
              >
                {sending ? "发送中…" : "发送登录链接"}
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

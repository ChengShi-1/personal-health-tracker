import { useEffect, useRef, useState } from "react";
import { Cloud, CloudOff, LogOut, X } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { emptyHealthData, type HealthData } from "../types/health";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export function CloudSync({
  data,
  onCloudLoad,
  inline = false,
}: {
  data: HealthData;
  onCloudLoad: (data: HealthData) => void;
  inline?: boolean;
}) {
  const [session, setSession] = useState<Session | null>(null),
    [open, setOpen] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [authMode, setAuthMode] = useState<"login" | "register">("login"),
    [recovering, setRecovering] = useState(false),
    [status, setStatus] = useState(isSupabaseConfigured ? "未登录" : "未配置"),
    [sending, setSending] = useState(false);
  const loaded = useRef(false),
    timer = useRef<number>();
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      loaded.current = false;
      setSession(next);
      if (event === "PASSWORD_RECOVERY") {
        setRecovering(true);
        setOpen(true);
        setStatus("请输入新密码");
      }
      if (!next) onCloudLoad(emptyHealthData());
    });
    return () => subscription.unsubscribe();
  }, [onCloudLoad]);
  useEffect(() => {
    if (!supabase || !session || loaded.current) return;
    let active = true;
    (async () => {
      setStatus("同步中");
      const [healthResult, menstrualResult] = await Promise.all([
        supabase.rpc("get_health_data"),
        supabase.rpc("get_menstrual_entries"),
      ]);
      if (!active) return;
      if (healthResult.error || menstrualResult.error) {
        setStatus("同步失败");
        return;
      }
      const normalized = healthResult.data
        ? ({
            ...(healthResult.data as HealthData),
            menstrualEntries:
              (menstrualResult.data as HealthData["menstrualEntries"]) ?? [],
          } as HealthData)
        : null;
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
      const [healthResult, menstrualResult] = await Promise.all([
        supabase.rpc("save_health_data", { payload: data }),
        supabase.rpc("save_menstrual_entries", {
          payload: data.menstrualEntries,
        }),
      ]);
      setStatus(
        healthResult.error || menstrualResult.error ? "保存失败" : "已同步",
      );
    }, 900);
    return () => window.clearTimeout(timer.current);
  }, [data, session]);
  const login = async () => {
    if (!supabase || !email.trim() || password.length < 6) return;
    setSending(true);
    const credentials = { email: email.trim(), password };
    const { data: authData, error } =
      authMode === "register"
        ? await supabase.auth.signUp(credentials)
        : await supabase.auth.signInWithPassword(credentials);
    setStatus(
      error
        ? error.message
        : authMode === "register" && !authData.session
          ? "账户已创建，请检查邮箱并确认后登录"
          : authMode === "register"
            ? "注册成功"
            : "登录成功",
    );
    if (!error) setPassword("");
    setSending(false);
  };
  const logout = async () => {
    await supabase?.auth.signOut();
    loaded.current = false;
    setStatus("未登录");
  };
  const requestPasswordReset = async () => {
    if (!supabase || !email.trim()) {
      setStatus("请先输入邮箱");
      return;
    }
    setSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: new URL(import.meta.env.BASE_URL, window.location.origin).href,
    });
    setStatus(error ? error.message : "密码设置链接已发送至邮箱");
    setSending(false);
  };
  const saveNewPassword = async () => {
    if (!supabase || password.length < 6) return;
    setSending(true);
    const { error } = await supabase.auth.updateUser({ password });
    setStatus(error ? error.message : "密码已更新");
    if (!error) {
      setPassword("");
      setRecovering(false);
    }
    setSending(false);
  };
  const accountContent = !isSupabaseConfigured ? (
    <p>请先配置 Supabase URL 和 Publishable Key。</p>
  ) : session && recovering ? (
    <>
      <div className="cloud-account-copy">
        <strong>设置新密码</strong>
        <small>{status}</small>
      </div>
      <div className="cloud-inline-login">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="新密码（至少 6 位）"
          autoComplete="new-password"
        />
        <button
          className="cloud-login"
          onClick={saveNewPassword}
          disabled={sending || password.length < 6}
        >
          保存新密码
        </button>
      </div>
    </>
  ) : session ? (
    <>
      <div className="cloud-account-copy">
        <strong>{session.user.email}</strong>
        <small>{status} · 健康数据自动云端保存</small>
      </div>
      <button className="cloud-logout" onClick={logout}>
        <LogOut size={14} />
        退出登录
      </button>
    </>
  ) : (
    <>
      <div className="cloud-account-copy">
        <strong>{authMode === "login" ? "登录健康账户" : "创建健康账户"}</strong>
        <small>{status === "未登录" ? "登录后读取并自动同步健康数据" : status}</small>
      </div>
      <div className="cloud-inline-login">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="你的邮箱"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密码（至少 6 位）"
          autoComplete={authMode === "login" ? "current-password" : "new-password"}
          onKeyDown={(e) => {
            if (e.key === "Enter") void login();
          }}
        />
        <button
          className="cloud-login"
          onClick={login}
          disabled={sending || !email.trim() || password.length < 6}
        >
          {sending ? "处理中…" : authMode === "login" ? "登录" : "注册"}
        </button>
        <button
          className="cloud-auth-switch"
          type="button"
          onClick={() => {
            setAuthMode((mode) => (mode === "login" ? "register" : "login"));
            setStatus("未登录");
          }}
        >
          {authMode === "login" ? "没有账户？注册" : "已有账户？登录"}
        </button>
        {authMode === "login" && (
          <button
            className="cloud-auth-switch"
            type="button"
            onClick={requestPasswordReset}
            disabled={sending}
          >
            忘记或设置密码
          </button>
        )}
      </div>
    </>
  );
  return (
    <>
      {inline && (
        <section className={`cloud-inline ${session ? "online" : ""}`}>
          <span className="cloud-inline-icon">
            {session ? <Cloud size={17} /> : <CloudOff size={17} />}
          </span>
          {accountContent}
        </section>
      )}
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
            <b>健康账户</b>
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
          ) : session && recovering ? (
            <>
              <p>请输入至少 6 位的新密码。</p>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="新密码（至少 6 位）"
                autoComplete="new-password"
              />
              <button
                className="cloud-login"
                onClick={saveNewPassword}
                disabled={sending || password.length < 6}
              >
                {sending ? "保存中…" : "保存新密码"}
              </button>
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
              <p>
                {authMode === "login"
                  ? "使用邮箱和密码登录。"
                  : "创建账户后，你的健康数据会安全同步到云端。"}
              </p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="你的邮箱"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码（至少 6 位）"
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void login();
                }}
              />
              <button
                className="cloud-login"
                onClick={login}
                disabled={sending || !email.trim() || password.length < 6}
              >
                {sending ? "处理中…" : authMode === "login" ? "登录" : "注册"}
              </button>
              <button
                className="cloud-auth-switch"
                type="button"
                onClick={() => {
                  setAuthMode((mode) =>
                    mode === "login" ? "register" : "login",
                  );
                  setStatus("未登录");
                }}
              >
                {authMode === "login" ? "没有账户？注册" : "已有账户？登录"}
              </button>
              {authMode === "login" && (
                <button
                  className="cloud-auth-switch"
                  type="button"
                  onClick={requestPasswordReset}
                  disabled={sending}
                >
                  忘记或设置密码
                </button>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

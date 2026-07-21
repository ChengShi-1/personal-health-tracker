# 个人健康追踪 App

## Supabase 免费后端

项目已经包含：

- Supabase 邮箱 Magic Link 登录
- 受 Row Level Security 保护的个人健康数据快照
- 自动云同步与换设备恢复
- 调用 OpenAI 的 `health-chat` Edge Function
- 通过 Supabase Secret 保存 OpenAI API Key

### 1. 创建免费项目

在 [Supabase Dashboard](https://supabase.com/dashboard) 创建一个项目，然后记录：

- Project Reference
- Project URL
- Publishable Key（旧项目可能显示为 anon key）

不要把 Secret Key 或 service_role key 放进前端。

### 2. 绑定并部署数据库

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

这会创建 `health_snapshots` 表并启用 RLS。每个登录用户只能读写 `user_id = auth.uid()` 的记录。

### 3. 安全保存 OpenAI API Key

推荐进入 Supabase Dashboard：

```text
Edge Functions → Secrets
```

添加：

```text
OPENAI_API_KEY = 你的 OpenAI API Key
OPENAI_MODEL = gpt-5.6-sol
```

也可以复制 `supabase/.env.secrets.example` 为 `supabase/.env.secrets`，填写后执行：

```bash
npx supabase secrets set --env-file supabase/.env.secrets
```

`supabase/.env.secrets` 已被 `.gitignore` 排除。

### 4. 部署 AI Edge Function

```bash
npx supabase functions deploy health-chat
```

函数默认要求有效的 Supabase 用户 JWT，未登录用户不能调用你的 OpenAI Key。

### 5. 配置前端

```bash
cp .env.example .env
```

填写公开的 Supabase 浏览器配置：

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=你的_publishable_或_anon_key
```

使用 Supabase 后端时，不需要把 `OPENAI_API_KEY` 写入本地 `.env`。本地 Key 字段仅供不使用 Supabase时的本地 Node API 备用。

在 Supabase Authentication 的 URL Configuration 中，将本地开发地址加入 Redirect URLs：

```text
http://localhost:5173
```

### 6. 启动

```bash
npm install
npm run dev
```

打开 `http://localhost:5173`：

1. 点击右下角“未登录/未配置”云同步按钮。
2. 输入邮箱并打开 Magic Link。
3. 第一次登录会把本机健康数据上传到你的私有云快照。
4. 之后的新增、修改、删除和 AI 确认写入都会自动同步。

## 检查

```bash
npm run lint
npm run build
```

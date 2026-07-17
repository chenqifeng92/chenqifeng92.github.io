# 陈棋烽简历聊天机器人

一个部署在 GitHub Pages 简历网站上的 AI 聊天助手，后端用 Cloudflare Worker 代理 DeepSeek API，前端是一个可嵌入的浮动聊天组件。

```
浏览器（GitHub Pages 上的聊天框）
   │  POST { messages }
   ▼
Cloudflare Worker  ← 藏 API Key、注入人设 System Prompt、流式转发
   │  Bearer DEEPSEEK_API_KEY
   ▼
DeepSeek API（deepseek-chat，流式 SSE）
```

## 为什么这样设计

- **GitHub Pages 是纯静态的**，不能在后端藏 API Key。如果前端直连 DeepSeek，Key 会暴露在 JS 源码里被偷。
- **Cloudflare Worker** 是 Serverless 函数，免费档 10 万次/天，足够个人用；API Key 存在它的加密环境变量里，浏览器拿不到。
- **不需要买服务器**，也不需要备案。Worker 的 `*.workers.dev` 域名国内基本可访问。

## ⚠️ API Key 安全（必读）

**绝对不要把 `sk-...` 直接写进代码、README 或 Git 提交里。**

- 正确做法：把 Key 存到部署平台的**加密环境变量/Secrets**里（Cloudflare Worker Secret / 阿里云 FC 环境变量 / GitHub Actions Secrets）。
- 代码里只通过环境变量读取：`env.DEEPSEEK_API_KEY` 或 `process.env.DEEPSEEK_API_KEY`。
- 如果不慎把 Key 提交到 GitHub，立即到 DeepSeek 平台撤销该 Key 并新建一个。
- 不要把 Key 发给任何人，包括我（Claude）。我只帮你写读取环境变量的代码，不需要知道你的 Key。

## 文件说明

| 文件 | 作用 |
|---|---|
| `worker.js` | Cloudflare Worker 后端：人设 Prompt + DeepSeek 代理 + 流式转发 + v2 Function Calling 预留 |
| `worker-fc.js` | 阿里云函数计算 FC 后端（非流式，国内访问更稳） |
| `widget.js` | 前端聊天组件：浮动按钮 + 对话面板 + 流式/非流式兼容渲染，原生 JS 无依赖 |
| `persona.md` | **人设与知识库源文件**：所有关于陈棋烽的介绍、经历、回答规则都写在这里 |
| `sync-persona.js` | 把 `persona.md` 同步到 `worker.js` 的 `SYSTEM_PROMPT` |
| `wrangler.toml` | wrangler CLI 部署配置 |
| `package.json` | 本地开发依赖 |

---

## Cloudflare Pages 一体化部署（推荐：静态 + 函数同源）

把静态简历和代理函数放到同一个 `*.pages.dev` 域下，前端 `widget.js` 直接请求同源 `/api/chat`，无需跨域。代理函数在仓库根的 `functions/api/chat.js`（Pages 约定：`functions/api/chat.js` → 路由 `/api/chat`）。

**方式一：GitHub 连接（push 自动部署）**
1. 推代码到 GitHub（先建空仓库，不要勾 README）。
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git → 选仓库。
3. 构建设置：Framework preset = None；Build command 留空；Build output directory = `/`。
4. Environment variables：加 `DEEPSEEK_API_KEY=sk-...`（Type 选 Secret，Environment 选 Production）。
5. Save and Deploy，拿到 `https://<项目名>.pages.dev`。
6. 验证：访问 `/api/chat`（GET）返回 `{"ok":true,"service":"qifeng-chatbot-pages",...}`；访问 `/index_default_chn.html` 点💬聊天。

**方式二：wrangler CLI 直传（不用 GitHub）**
```bash
cd 仓库根
npx wrangler login
npx wrangler pages project create qifeng-chatbot
npx wrangler pages secret put DEEPSEEK_API_KEY --project-name qifeng-chatbot   # 粘贴 sk-...
npx wrangler pages deploy . --project-name qifeng-chatbot
```

**本地预览**：仓库根建 `.dev.vars`（写 `DEEPSEEK_API_KEY=sk-...`，已 gitignore），运行 `npx wrangler pages dev .`，开 `http://localhost:8788/index_default_chn.html` 测试。

> 注意：`functions/` 必须在仓库根；密钥务必加到 Production 环境，否则线上函数返回 500。若想 `/` 直接打开简历，把 `index_default_chn.html` 重命名为 `index.html`（注意同步 README/persona 引用）或加一个跳转页。

---

## 部署步骤

### 第 0 步：准备两个账号

1. **DeepSeek**：到 https://platform.deepseek.com 注册，创建 API Key（`sk-...`）。新用户有免费额度，之后按量付费，极便宜（deepseek-chat 缓存命中 ¥0.5/百万 token）。
2. **Cloudflare**：到 https://dash.cloudflare.com 注册（免费）。

### 第 1 步：部署 Worker（二选一）

#### 方式 A：网页粘贴（最简单，推荐首次使用）

1. Cloudflare Dashboard 左侧 → **Workers & Pages** → **Create** → **Create Worker**。
2. 起个名字，比如 `qifeng-chatbot`，点 **Deploy**。
3. 部署后点 **Edit code**，把 `worker.js` 的全部内容粘贴进去覆盖默认代码，点 **Deploy**。
4. 记下右上角的地址，形如 `https://qifeng-chatbot.<你的子域>.workers.dev`。

#### 方式 B：wrangler CLI（适合后续迭代）

```bash
cd chatbot
npm install
npx wrangler login          # 浏览器授权
npx wrangler deploy         # 部署
```

部署后终端会打印 Worker 地址。

### 第 2 步：设置 API Key（关键，别跳过）

Worker 需要 `DEEPSEEK_API_KEY` 环境变量才能工作。

- **网页方式**：Worker 详情页 → **Settings** → **Variables and Secrets** → **Add**，名称填 `DEEPSEEK_API_KEY`，值填你的 `sk-...`，类型选 **Secret**，保存。
- **CLI 方式**：`npx wrangler secret put DEEPSEEK_API_KEY`，粘贴 Key 回车。

### 第 3 步：验证后端

浏览器打开你的 Worker 地址，看到：
```json
{"ok":true,"service":"qifeng-chatbot","model":"deepseek-chat","toolsEnabled":false}
```
就说明后端 OK。

### 第 3.5 步（可选）：修改机器人人设

想调整机器人怎么介绍你、回答什么语气？不要直接改 `worker.js`：

1. 编辑 `chatbot/persona.md`（Markdown 格式，随便加经历、项目、规则）。
2. 运行 `node sync-persona.js`，自动同步到 `worker.js`。
3. 重新部署 Worker。

这样你的人设文件独立、可读、好版本管理。

### 第 4 步：把聊天组件加到网页

在你要显示聊天窗的 HTML 页面，`</body>` 标签前加一行：

```html
<script src="chatbot/widget.js" data-worker="https://qifeng-chatbot.你的子域.workers.dev" defer></script>
```

把 `data-worker` 的值换成你第 1 步拿到的真实 Worker 地址。

本仓库已在以下页面注入该脚本（部署前记得把 `data-worker` 占位地址改成你的真实地址）：
- `index_default_chn.html`（简历主页）

其他页面（AgentInsight.html / WhatIveDoneAtRHZL.html / RHZLProjectInsight.html）未注入，如需添加把上面那行代码复制到对应页面 `</body>` 前即可。

### 第 5 步：本地测试

直接用浏览器打开 HTML 文件（或 `python3 -m http.server` 起个本地服务），点右下角 💬 图标，问"简单介绍一下棋烽"，应该能流式返回。

### 第 6 步：推到 GitHub Pages

```bash
git add chatbot/ *.html
git commit -m "feat: add AI chatbot widget"
git push
```

GitHub Pages 自动构建后，线上即可用。

---

## 上下文管理与自动压缩

`worker.js` / `worker-fc.js` 都做了上下文管理：

1. **数量裁剪**：只保留最近 12 轮对话，避免历史无限增长。
2. **字符预算**：估算总 token（按字符数保守估计），超过 12K 字符时自动丢弃最老的一对 `user+assistant` 消息。
3. **兜底重试**：如果 DeepSeek 仍返回 `context_length_exceeded`，会进一步压缩到只保留 `system prompt + 最后一条 user 消息`，然后重试一次。

当前策略是"丢历史"而不是"摘要历史"，因为摘要需要额外调 LLM、增加成本和延迟。对简历问答这种短对话场景，丢历史完全够用。

---

## 国内访问更稳：阿里云函数计算 FC 版

如果你担心 Cloudflare Worker 在国内访问不稳定，可以用 `worker-fc.js` 部署到阿里云函数计算 FC：

1. 阿里云 FC 控制台创建函数，运行时选 **Node.js 18/20**，触发器选 **HTTP**。
2. 把 `worker-fc.js` 内容粘贴进去（作为 `index.js`）。
3. 函数配置 → 环境变量 → 添加 `DEEPSEEK_API_KEY=sk-...`。
4. 复制 HTTP 触发器地址，替换 `index_default_chn.html` 里 `widget.js` 的 `data-worker`。
5. `widget.js` 已同时兼容流式（Cloudflare）和非流式（FC）响应。

注意：绑自定义域名需要 ICP 备案；未备案时只能用 FC 默认分配的公网地址。

---

## v2：升级成"真 Agent"（Function Calling）

`worker.js` 已预留结构，升级步骤：

1. 把 `const ENABLE_TOOLS = false` 改成 `true`。
2. 在 `TOOLS` 数组里加工具 schema（文件里有示例）。
3. 在 `executeTool` 里实现工具逻辑（可读 Cloudflare KV/D1、外部 API 等）。
4. 把主流程的"流式透传"分支改为"非流式 tool 循环"：调 DeepSeek（`stream:false`）→ 若返回 `tool_calls` 则执行 `executeTool`，把结果以 `role: 'tool'` 追加再调一次 → 直到返回普通文本。
5. 文件末尾的注释里有详细思路。

推荐的工具灵感：
- `get_project_detail(name)` — 返回某项目完整细节
- `get_career_insight(topic)` — 从 AgentInsight 取某主题的深度分析
- `switch_language(lang)` — 显式切换中英文
- `summarize_doc(name)` — 概述某个文档

---

## 成本估算

- **Cloudflare Worker**：免费档 10 万次请求/天，个人简历机器人完全够用，0 元。
- **DeepSeek**：假设每天 20 次对话、每次约 2000 token，约 4 万 token/天，deepseek-chat 约 ¥2/百万 token，**每天不到 ¥0.1**。
- **总额**：每月 ¥3-5，可以忽略。

## 安全说明

- API Key 只存在 Cloudflare 的 Secret 里，前端和 GitHub 仓库里都不会出现。
- Worker 做了对话历史裁剪（最近 12 条）和 `max_tokens` 限制，防止单次滥用。
- 如需更强防护，可在 Worker 里加：IP 限流（用 Cloudflare KV 计数）、Referer 校验、验证码。

## 常见问题

**Q：国内访问 Worker 慢/打不开？**
A：`*.workers.dev` 偶尔波动。可选方案：① 给 Worker 绑定自己的域名（Cloudflare DNS，仍免费）；② 换腾讯云/阿里云函数计算（国内快但要备案）。

**Q：可以换成 Kimi（Moonshot）吗？**
A：可以。把 `worker.js` 里的 `DEEPSEEK_URL` 换成 `https://api.moonshot.cn/v1/chat/completions`，`MODEL` 换成 `moonshot-v1-8k` 或 `moonshot-v1-32k`，环境变量名对应改 Kimi 的 Key 即可。两者都是 OpenAI 兼容接口。

**Q：聊天记录会保存吗？**
A：当前不持久化，刷新页面后清空（仅本次会话内存）。如需保存，可在前端用 localStorage 存对话，或后端接 Cloudflare D1/KV。

**Q：怎么改机器人回答的内容/人设？**
A：编辑 `worker.js` 里的 `SYSTEM_PROMPT` 常量，重新部署 Worker 即可，不用动前端。

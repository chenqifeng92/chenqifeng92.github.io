# chenqifeng92.github.io

陈棋烽（Qifeng Chen）个人简历网站，附 AI 问答机器人。线上：https://cv.cqf.kdns.fr

## 这是什么

- **在线简历**：单页 HTML，中英双语切换，记录工作经历、技能栈与项目经验。
- **AI 问答机器人**：右下角聊天浮窗，访客（HR、面试官、朋友）可就简历内容直接提问，由大模型基于本人"人设"作答。

## 链路

三个入口都能打开简历页面，但 chat API 统一走国内可达的 cv.cqf.kdns.fr：

```
访客浏览器（三入口，均 200）
  https://chenqifeng92.github.io     GitHub Pages 托管静态页（国内访问 GitHub 不稳）
  https://cv.cqf.kdns.fr             Cloudflare Worker "cv" 提供静态页 + API（主入口，国内可达）
  https://cv.chenqifeng.workers.dev  Worker 默认域名（国内 SNI 封锁，需外网）
        │
        ▼
index.html  <script src="chatbot/widget.js" data-worker="https://cv.cqf.kdns.fr/api/chat">
        │
        ▼
chatbox widget.js：无论从哪个入口进，chat API 都跨域调用 https://cv.cqf.kdns.fr/api/chat（CORS 全开）
        │
        ▼
Cloudflare Worker "cv"（worker.js，根入口，路由分发）
  ├─ /api/chat、/api/suggestions -> functions/api/chat.js -> 调用 DeepSeek API（SSE 流式）
  └─ 其他路径 -> env.ASSETS（静态资源：index.html、chatbot/widget.js）
```

- `cv.cqf.kdns.fr` 是绑定在 Cloudflare 账户的自定义域名，用于绕过 `workers.dev` 在中国大陆的 SNI 封锁，使访客在国内也能顺畅访问 Worker 并调用 DeepSeek。
- `chatbot/widget.js` 界面随页面语言（中/英）切换。
- 人设（SYSTEM_PROMPT）写在 `chatbot/persona.md`，由 `sync-persona.js` 同步进 `functions/api/chat.js`，不手改代码段。
- 防刷：`POST /api/chat` 与 `/api/suggestions` 走 Workers Rate Limiting 绑定（`CHAT_RATE_LIMITER`，按客户端 IP 60 次/60 秒），超限返回 429；入参另做长度/条数硬约束，DeepSeek 预付余额维持低位作最终兜底。

## 仓库结构

```
.
├── index.html              # 简历页面（中英双语）
├── worker.js               # Worker "cv" 入口，路由分发
├── wrangler.jsonc          # Cloudflare Worker 配置（name=cv，assets binding=ASSETS，CHAT_RATE_LIMITER 限流绑定）
├── .assetsignore           # 不作为静态资产公开的文件清单
├── functions/api/chat.js   # /api/chat 后端：DeepSeek SSE 流式 + 人设
└── chatbot/
    ├── widget.js           # 前端聊天浮窗组件（i18n、动态追问建议）
    ├── persona.md          # 人设源文件（SYSTEM_PROMPT 源）
    └── sync-persona.js     # persona.md -> chat.js 同步脚本
```

## 部署

- Cloudflare Workers Builds 连接本 GitHub 仓库，`master` 分支 push 即自动构建部署到 Worker `cv`。
- `DEEPSEEK_API_KEY` 在 Cloudflare Dashboard 配为 Worker Secret，不进代码仓库。
- `.assetsignore` 排除 `worker.js`、`wrangler.jsonc`、`functions/`、`chatbot/persona.md`、`chatbot/sync-persona.js`，避免后端源码与人设作为静态资源公开。

## 本地开发

```bash
# 改人设：编辑 chatbot/persona.md 后同步到 chat.js
node chatbot/sync-persona.js

# 本地起 Worker（需配 DEEPSEEK_API_KEY，可用 .dev.vars）
npx wrangler dev
```

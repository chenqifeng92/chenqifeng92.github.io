# 个人简历网站 + AI 问答机器人

陈棋烽（Qifeng Chen）个人简历网站，附 AI 问答机器人。

- 主入口（国内可达）：https://cv.cqf.kdns.fr
- 镜像入口：https://chenqifeng92.gitlab.io
- GitHub Pages 入口：https://chenqifeng92.github.io

## 这是什么

- **在线简历**：单页 HTML，中英双语切换，可打印。
- **AI 问答机器人**：右下角聊天浮窗，访客（HR、面试官、朋友）可就简历内容直接提问，由大模型基于本人“人设”作答。

## 链路

同一份站点内容部署在两个仓库；前端互相镜像，**聊天后端只在 Cloudflare Worker 上跑一份**，所有入口的聊天请求都跨域打到它。

```
入口（三选一，均能打开简历页）：
  https://cv.cqf.kdns.fr           Cloudflare Worker "cv"（主入口，国内可达）
  https://chenqifeng92.gitlab.io   GitLab Pages（镜像，默认中文简历）
  https://chenqifeng92.github.io   GitHub Pages（国内访问 GitHub 不稳，默认英文简历）

聊天 API（只在 Worker 上）：
  index.html
    <script src="chatbot/widget.js" data-worker="https://cv.cqf.kdns.fr/api/chat">
       │
       ▼  无论从哪个入口进，widget.js 都跨域调用
  https://cv.cqf.kdns.fr/api/chat   （CORS: Access-Control-Allow-Origin: *）
       │
       ▼
  Cloudflare Worker "cv"（worker.js 路由分发）
    ├─ /api/chat、/api/suggestions -> functions/api/chat.js -> DeepSeek API（SSE 流式）
    └─ 其他路径 -> env.ASSETS 静态资源（index.html、chatbot/widget.js 等）
```

两个仓库的部署方式：

- **github `chenqifeng92.github.io`**：仓库根既是 Worker 静态资产目录，也含 Worker 源。`master` push -> Cloudflare Workers Builds -> 部署到 Worker `cv`，同时提供静态页与聊天 API。
- **gitlab `chenqifeng92.gitlab.io`**：只托管静态站。`master` push -> GitLab CI -> GitLab Pages，serve `public/` 目录。聊天框经 `data-worker` 跨域调 Worker，本仓库不跑后端。
- `cv.cqf.kdns.fr` 是绑定在 Cloudflare 账户的自定义域名，绕过 `workers.dev` 在中国大陆的 SNI 封锁。

## 文件清单

github 仓库根 = Worker 静态资产目录 + Worker 源 + 人设源；gitlab 仓库 = 最小静态镜像（只含站点运行必需文件，`public/` 由 CI 生成、不进版本库）。

| 文件 | 作用 | github | gitlab |
|---|---|---|---|
| `index.html` | 简历页面（中英双语、可打印） | 根 | 根（CI 拷到 `public/`） |
| `chatbot/widget.js` | 聊天浮窗前端（UI、markdown 渲染、复制按钮、跨域调 Worker） | `chatbot/` | `chatbot/`（CI 拷到 `public/chatbot/`） |
| `fonts/open-sans-latin-300.woff2` | 自托管 Open Sans:300 英文字体（OFL），unicode-range 仅覆盖拉丁字符 | `fonts/` | `fonts/`（CI 拷到 `public/fonts/`） |
| `chatbot/persona.md` | 人设源文档（SYSTEM_PROMPT 的源），运行时不读 | `chatbot/` | - |
| `chatbot/sync-persona.js` | dev 脚本：persona.md -> chat.js 的 SYSTEM_PROMPT | `chatbot/` | - |
| `functions/api/chat.js` | Worker 聊天后端：/api/chat、/api/suggestions，DeepSeek SSE 代理 + CORS + 入参硬约束；SYSTEM_PROMPT 烤在里面 | `functions/api/` | - |
| `worker.js` | Worker "cv" 入口，路由分发 | 根 | - |
| `wrangler.jsonc` | Cloudflare Worker 配置（name=cv，assets binding=ASSETS） | 根 | - |
| `.gitlab-ci.yml` | GitLab Pages CI（把 index.html + widget.js + fonts/ 拷进 `public/` 发布） | — | 根 |
| `.gitignore` | 忽略 `.DS_Store` 等 | 根 | 根 |
| `.assetsignore` | Worker assets binding 不 serve 的文件清单（仅 github 生效，不影响 git） | 根 | - |
| `README.md` | 本文档 | 根 | 根 |

> gitlab 只保留站点运行的最小必需（`index.html`、`chatbot/widget.js`、`fonts/open-sans-latin-300.woff2`、`.gitlab-ci.yml`、`.gitignore`、`README.md`）。Worker 后端源码与人设源文件只在 github 仓库，避免两份版本漂移。改后端/人设只需在 github 改并部署。

## 密钥

- `DEEPSEEK_API_KEY` 只在 Cloudflare Dashboard > Workers & Pages > cv > Settings > Variables and Secrets 配为 Secret，不进代码、不进仓库（源码已确认无硬编码 key）。

## 改人设流程

1. 编辑 `chatbot/persona.md`。
2. 在 github 仓库根运行 `node chatbot/sync-persona.js`：读 persona.md，重写 `functions/api/chat.js` 里 `// === PERSONA_START ===` … `// === PERSONA_END ===` 之间的 `SYSTEM_PROMPT` 常量。
3. commit + push 到 github `master`，Workers Builds 自动部署。

> 运行时 Worker 读的是 `chat.js` 里烤好的 `SYSTEM_PROMPT` 常量，**不读 persona.md**；光改 persona.md 不同步 + 部署不生效。persona 文本同时存在于 persona.md（源）与 chat.js（烤进去），两份都在公开的 github 仓库里。gitlab 不含 persona.md（最小镜像）。

## 防刷

- IP 限流：Cloudflare WAF Rate Limiting 规则（Dashboard 配，不在仓库），匹配 POST `/api/chat` 与 `/api/suggestions`，同 IP 60 次/60 秒超限 Block。
- 入参硬约束：单条消息 ≤ 4000 字、消息条数 ≤ 30。
- DeepSeek 预付余额维持低位作最终兜底。
- gitlab / github 静态站的聊天请求都打到同一个 Worker，上述限流对两条入口都生效。

## 本地开发（github 仓库）

```bash
node chatbot/sync-persona.js   # persona.md -> chat.js
npx wrangler dev               # 本地起 Worker（DEEPSEEK_API_KEY 配 .dev.vars）
```

## 备注：`.assetsignore`（仅 github）

github 仓库用 `.assetsignore` 告诉 Worker 的 assets binding **不要**把下列文件当 HTTP 静态资源 serve：`worker.js`、`wrangler.jsonc`、`functions/`、`chatbot/persona.md`、`chatbot/sync-persona.js`，以及 `.git` / `.claude` / `.wrangler` / `node_modules` / `.DS_Store` / `.dev.vars` 等本地目录。即 `cv.cqf.kdns.fr/chatbot/persona.md` 等返回 404，只有 `index.html`、`chatbot/widget.js` 等站点文件被 serve。**`.assetsignore` 只管 Worker 的 HTTP serve，不影响 git**--这些文件仍在版本库里公开（git 只看 `.gitignore`）。gitlab 不含这些源文件（最小镜像），CI 只把 `index.html` + `chatbot/widget.js` + `fonts/` 拷进 `public/` 发布，达到同样不暴露的效果。

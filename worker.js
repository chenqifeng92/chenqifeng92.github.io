/**
 * 陈棋烽简历站点 - Cloudflare Worker 统一入口
 *
 * 路由：
 *   /api/chat  -> AI 聊天后端（DeepSeek 代理，逻辑在 functions/api/chat.js）
 *   其他路径   -> 静态资产（index.html、chatbot/widget.js 等，由 ASSETS 绑定提供）
 *
 * 密钥：DEEPSEEK_API_KEY 通过 Cloudflare Dashboard > Workers & Pages > cv
 *       > Settings > Variables and Secrets 配置，或本地运行
 *       npx wrangler secret put DEEPSEEK_API_KEY。不要写进代码或提交到 Git。
 */

import { onRequestPost, onRequestGet, onRequestOptions, onRequestPostSuggestions } from './functions/api/chat.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/chat') {
      const context = { request, env, ctx };
      switch (request.method) {
        case 'POST':
          return onRequestPost(context);
        case 'GET':
          return onRequestGet(context);
        case 'OPTIONS':
          return onRequestOptions(context);
        default:
          return new Response('Method Not Allowed', {
            status: 405,
            headers: { Allow: 'GET, POST, OPTIONS' },
          });
      }
    }

    if (url.pathname === '/api/suggestions') {
      const context = { request, env, ctx };
      switch (request.method) {
        case 'POST':
          return onRequestPostSuggestions(context);
        case 'OPTIONS':
          return onRequestOptions(context);
        default:
          return new Response('Method Not Allowed', {
            status: 405,
            headers: { Allow: 'POST, OPTIONS' },
          });
      }
    }

    return env.ASSETS.fetch(request);
  },
};

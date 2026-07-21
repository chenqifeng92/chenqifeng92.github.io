/**
 * 陈棋烽简历站点 - Cloudflare Worker 统一入口
 *
 * 路由：
 *   /api/chat  -> AI 聊天后端（DeepSeek 代理，逻辑在 functions/api/chat.js）
 *   其他路径   -> 静态资产（index.html、chatbot/widget.js 等，由 ASSETS 绑定提供）
 *
 * 限流：POST /api/chat、POST /api/suggestions 走 CHAT_RATE_LIMITER 绑定（Workers Rate
 *       Limiting），按客户端 IP 60 次/60 秒，超限返回 429。fail-open：绑定未配置（如本地
 *       wrangler dev）或调用异常时放行，不让限流器故障误伤正常访客。
 *
 * 密钥：DEEPSEEK_API_KEY 通过 Cloudflare Dashboard > Workers & Pages > cv
 *       > Settings > Variables and Secrets 配置，或本地运行
 *       npx wrangler secret put DEEPSEEK_API_KEY。不要写进代码或提交到 Git。
 */

import { onRequestPost, onRequestGet, onRequestOptions, onRequestPostSuggestions } from './functions/api/chat.js';

// 限流窗口（秒），与 wrangler.jsonc 中 CHAT_RATE_LIMITER 的 period 保持一致
const RATE_LIMIT_PERIOD = 60;

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

// 是否超过速率限制。fail-open：绑定未配置（如本地 wrangler dev）或调用异常时返回 false（放行）。
async function overRateLimit(env, request) {
  const limiter = env.CHAT_RATE_LIMITER;
  if (!limiter) return false;
  try {
    const { success } = await limiter.limit({ key: clientIp(request) });
    return !success;
  } catch {
    return false;
  }
}

function tooManyRequests() {
  return new Response(JSON.stringify({ error: 'Too Many Requests' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Retry-After': String(RATE_LIMIT_PERIOD),
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/chat') {
      const context = { request, env, ctx };
      switch (request.method) {
        case 'POST':
          if (await overRateLimit(env, request)) return tooManyRequests();
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
          if (await overRateLimit(env, request)) return tooManyRequests();
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

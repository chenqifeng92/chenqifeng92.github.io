/**
 * 埋点接收端点 - Worker "cv" 后端模块
 *
 * 由根 worker.js 路由分发调用：POST /api/track 收事件写 D1；GET /api/track 冒烟。
 *
 * POST /api/track：前端埋点统一入口（index.html / widget.js 用 sendBeacon 上报）
 *   body: { site, event_type, path?, payload? }
 *   - site：来源站 github / gitlab / cv
 *   - event_type：pageview | duration | print_click | download_click | chat_open | chat_question
 *   - payload：事件细节（duration 为秒数对象，chat_question 为问题原文）
 *   - ip / ua / device 由服务端从请求头解析补齐，不信任客户端上报
 * GET /api/track：冒烟与健康检查——验证 D1 绑定经 Workers Builds 部署后是否真实生效
 *   （ratelimit 绑定有过部署后不生效的前科，见 worker.js 头注释，故此端点必须能明确报告绑定状态）
 *
 * 数据落在 D1 库 cv-feedback 的 events 表，读取侧见 /api/stats（feedback.html 用）。
 */

const ALLOWED_EVENTS = new Set([
  'pageview',
  'duration',
  'print_click',
  'download_click',
  'chat_open',
  'chat_question',
]);
const ALLOWED_SITES = new Set(['github', 'gitlab', 'cv']);

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Max-Age': '86400',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() },
  });
}

// UA 粗分设备类型：tablet / mobile / desktop / unknown
function parseDevice(ua) {
  if (!ua) return 'unknown';
  if (/iPad|Tablet|Nexus (7|9|10)|SM-T\d/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|Android|Windows Phone/i.test(ua)) return 'mobile';
  return 'desktop';
}

function truncate(s, n) {
  if (typeof s !== 'string') return null;
  s = s.trim();
  return s.length > n ? s.slice(0, n) : s;
}

async function handleTrackPost(request, env) {
  if (!env.FEEDBACK_DB) {
    return json({ ok: false, error: 'FEEDBACK_DB not bound' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const eventType = String(body.event_type || '');
  if (!ALLOWED_EVENTS.has(eventType)) {
    return json({ ok: false, error: 'invalid event_type' }, 400);
  }

  // 入参硬约束：site 白名单、超长截断，配合 zone 级 WAF 限流兜底
  const site = ALLOWED_SITES.has(body.site) ? body.site : null;
  const path = truncate(body.path, 120);
  let payload = body.payload;
  if (payload !== undefined && payload !== null) {
    payload = typeof payload === 'string' ? payload : JSON.stringify(payload);
    payload = truncate(payload, 600);
  }

  const ip = truncate(request.headers.get('CF-Connecting-IP'), 60);
  const ua = truncate(request.headers.get('User-Agent'), 250);
  const device = parseDevice(ua);

  try {
    await env.FEEDBACK_DB.prepare(
      'INSERT INTO events (site, event_type, path, device, ip, ua, payload) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(site, eventType, path, device, ip, ua, payload)
      .run();
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String((e && e.message) || e).slice(0, 120) }, 500);
  }
}

async function handleTrackGet(request, env) {
  if (!env.FEEDBACK_DB) {
    return json({ ok: false, error: 'FEEDBACK_DB not bound' }, 500);
  }
  try {
    const r = await env.FEEDBACK_DB.prepare('SELECT COUNT(*) AS n FROM events').first();
    return json({ ok: true, db: 'FEEDBACK_DB', total_events: r ? r.n : 0 });
  } catch (e) {
    return json({ ok: false, error: String((e && e.message) || e).slice(0, 120) }, 500);
  }
}

export async function onRequestPost(context) {
  return handleTrackPost(context.request, context.env);
}

export async function onRequestGet(context) {
  return handleTrackGet(context.request, context.env);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

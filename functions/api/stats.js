/**
 * 统计读取端点 - Worker "cv" 后端模块
 *
 * 由根 worker.js 路由分发调用：GET /api/stats?days=14
 *
 * 从 D1 库 cv-stats 聚合埋点数据，供 stats.html 后台页面渲染：
 *   - 每日事件计数（按北京时间 +8h 分天，date(ts,'+8 hours')）
 *   - 来源站 / 设备分布、停留时长分桶与均值
 *   - 最近事件明细（时间/站/事件/设备/IP）、最近提问原文
 *
 * 鉴权钩子：环境变量 STATS_KEY 存在时要求 Authorization: Bearer <key>；
 * 未配置 STATS_KEY 时放行（鉴权后置设计——以后在 Dashboard 加变量即生效，无需改代码）。
 */

const MAX_DAYS = 90;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Max-Age': '86400',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() },
  });
}

export async function onRequestGetStats(context) {
  const { request, env } = context;

  // 鉴权钩子：配置了 STATS_KEY 才校验（见头注释的后置设计）
  if (env.STATS_KEY) {
    const auth = request.headers.get('Authorization') || '';
    if (auth !== `Bearer ${env.STATS_KEY}`) {
      return json({ ok: false, error: 'unauthorized' }, 401);
    }
  }

  if (!env.STATS_DB) {
    return json({ ok: false, error: 'STATS_DB not bound' }, 500);
  }

  let days = parseInt(new URL(request.url).searchParams.get('days') || '14', 10);
  if (!Number.isFinite(days) || days < 1) days = 14;
  if (days > MAX_DAYS) days = MAX_DAYS;
  const since = `-${days} days`;
  // by_day 取双倍窗口：前端用后半程对比前半程算环比
  const since2 = `-${days * 2} days`;

  const db = env.STATS_DB;
  try {
    // 一次 batch 跑完所有聚合，减少往返
    const results = await db.batch([
      // 1. 每日每类事件计数（北京时间分天，双倍窗口供环比）
      db.prepare(
        `SELECT date(ts, '+8 hours') AS d, event_type, COUNT(*) AS n
         FROM events WHERE ts >= datetime('now', ?1)
         GROUP BY d, event_type ORDER BY d`
      ).bind(since2),
      // 2. 来源站分布（按 pageview 口径）
      db.prepare(
        `SELECT site, COUNT(*) AS n FROM events
         WHERE event_type = 'pageview' AND ts >= datetime('now', ?1)
         GROUP BY site ORDER BY n DESC`
      ).bind(since),
      // 3. 设备分布（按 pageview 口径）
      db.prepare(
        `SELECT device, COUNT(*) AS n FROM events
         WHERE event_type = 'pageview' AND ts >= datetime('now', ?1)
         GROUP BY device ORDER BY n DESC`
      ).bind(since),
      // 4. 停留时长分桶
      db.prepare(
        `SELECT CASE
           WHEN CAST(json_extract(payload, '$.seconds') AS INT) < 30 THEN 'lt30'
           WHEN CAST(json_extract(payload, '$.seconds') AS INT) < 120 THEN '30_2m'
           WHEN CAST(json_extract(payload, '$.seconds') AS INT) < 600 THEN '2_10m'
           ELSE 'gt10'
         END AS bucket, COUNT(*) AS n
         FROM events WHERE event_type = 'duration' AND ts >= datetime('now', ?1)
         GROUP BY bucket`
      ).bind(since),
      // 5. 平均停留
      db.prepare(
        `SELECT AVG(CAST(json_extract(payload, '$.seconds') AS REAL)) AS avg_s, COUNT(*) AS n
         FROM events WHERE event_type = 'duration' AND ts >= datetime('now', ?1)`
      ).bind(since),
      // 6. 各事件总数
      db.prepare(
        `SELECT event_type, COUNT(*) AS n FROM events
         WHERE ts >= datetime('now', ?1)
         GROUP BY event_type`
      ).bind(since),
      // 7. 最近 50 条事件明细
      db.prepare(
        `SELECT datetime(ts, '+8 hours') AS t, site, event_type, device, ip
         FROM events ORDER BY id DESC LIMIT 50`
      ),
      // 8. 最近 100 条提问原文
      db.prepare(
        `SELECT datetime(ts, '+8 hours') AS t, site, device, payload
         FROM events WHERE event_type = 'chat_question'
         ORDER BY id DESC LIMIT 100`
      ),
    ]);

    const [byDay, bySite, byDevice, buckets, avgDur, totals, recent, questions] = results.map(
      (r) => (r.results || [])
    );

    return json({
      ok: true,
      days: days,
      by_day: byDay,
      by_site: bySite,
      by_device: byDevice,
      duration_buckets: buckets,
      avg_duration_seconds: avgDur.length ? Math.round(avgDur[0].avg_s || 0) : null,
      duration_samples: avgDur.length ? avgDur[0].n : 0,
      totals: totals,
      recent_events: recent,
      recent_questions: questions,
    });
  } catch (e) {
    return json({ ok: false, error: String((e && e.message) || e).slice(0, 200) }, 500);
  }
}

export async function onRequestOptionsStats() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

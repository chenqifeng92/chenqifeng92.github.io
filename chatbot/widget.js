/**
 * 陈棋烽简历聊天机器人 - 前端聊天组件
 *
 * 用法：在任意 HTML 页面 </body> 前加一行：
 *   <script src="chatbot/widget.js" data-worker="https://你的-worker.workers.dev" defer></script>
 *
 * 把 data-worker 换成你部署后的 Cloudflare Worker 地址。
 * 无依赖，原生 JS，自带样式，自动适配暗色模式与移动端。
 */
(function () {
  'use strict';

  const SCRIPT = document.currentScript || document.querySelector('script[data-worker]');
  const WORKER_URL = (SCRIPT && SCRIPT.dataset.worker) || '';
  if (!WORKER_URL) {
    console.warn('[chatbot] 缺少 data-worker 属性，聊天机器人未启动。');
    return;
  }

  const TOOLTIP_TEXT = '和棋烽的蒸馏智能体聊天，了解他的个人情况';

  const SUGGESTIONS = [
    '简单介绍一下棋烽',
    '他最近在做什么项目？',
    '他的技术栈有哪些？',
    '为什么想转 AI Agent 方向？',
    '怎么联系他？',
  ];

  const WELCOME = '你好！我是棋烽的职业助手，可以介绍他的经历、技能和近况。试试下面的问题，或直接问我 👇';

  // ---------- 样式 ----------
  const css = `
  /* 按钮 */
  #qf-chat-btn{
    position:fixed;right:22px;bottom:22px;width:60px;height:60px;border-radius:50%;
    background:#1a1a1a;color:#fff;border:none;cursor:pointer;
    box-shadow:0 8px 24px rgba(0,0,0,.32);
    font-size:26px;display:flex;align-items:center;justify-content:center;
    z-index:9998;transition:transform .25s cubic-bezier(.175,.885,.32,1.275),box-shadow .25s ease;
    animation:qf-pop-in .7s cubic-bezier(.175,.885,.32,1.275) both;
  }
  #qf-chat-btn:hover{transform:scale(1.1) rotate(4deg);box-shadow:0 10px 30px rgba(0,0,0,.4)}
  #qf-chat-btn.hidden{opacity:0;pointer-events:none;transform:scale(.6)}
  @keyframes qf-pop-in{
    0%{opacity:0;transform:scale(0) rotate(-40deg)}
    60%{transform:scale(1.18) rotate(8deg)}
    100%{opacity:1;transform:scale(1) rotate(0)}
  }

  /* 引导气泡（在按钮上方） */
  #qf-chat-tooltip{
    position:fixed;right:22px;bottom:88px;max-width:260px;
    background:#1a1a1a;color:#fff;padding:11px 34px 11px 15px;border-radius:14px;
    font-size:13.5px;line-height:1.55;
    box-shadow:0 8px 24px rgba(0,0,0,.26);
    z-index:9997;animation:qf-tooltip-in .55s ease .45s both;
    cursor:default;-webkit-font-smoothing:subpixel-antialiased;
  }
  #qf-chat-tooltip::after{
    content:'';position:absolute;right:22px;bottom:-7px;transform:translateX(50%);
    border-width:9px 7px 0 7px;border-style:solid;border-color:#1a1a1a transparent transparent transparent
  }
  #qf-chat-tooltip .qf-close{
    position:absolute;top:5px;right:6px;width:20px;height:20px;line-height:20px;
    text-align:center;font-size:15px;color:rgba(255,255,255,.65);cursor:pointer;border-radius:50%
  }
  #qf-chat-tooltip .qf-close:hover{color:#fff;background:rgba(255,255,255,.18)}
  @keyframes qf-tooltip-in{
    0%{opacity:0;transform:translateY(12px) scale(.95)}
    100%{opacity:1;transform:translateY(0) scale(1)}
  }
  #qf-chat-tooltip.hidden{opacity:0;pointer-events:none;transform:translateY(12px);transition:all .25s ease}

  /* 主面板 */
  #qf-chat-panel{
    position:fixed;right:20px;bottom:96px;width:390px;max-width:calc(100vw - 40px);
    height:580px;max-height:calc(100vh - 130px);background:#fff;border-radius:18px;
    box-shadow:0 16px 50px rgba(0,0,0,.24);display:none;flex-direction:column;overflow:hidden;
    z-index:9999;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Helvetica Neue",Arial,sans-serif;
    font-size:15px;line-height:1.65;color:#222;
    -webkit-font-smoothing:subpixel-antialiased;-moz-osx-font-smoothing:auto;
  }
  #qf-chat-panel.open{display:flex;animation:qf-panel-in .25s ease both}
  @keyframes qf-panel-in{0%{opacity:0;transform:translateY(14px) scale(.97)}100%{opacity:1;transform:translateY(0) scale(1)}}

  /* 头部 */
  #qf-chat-head{background:#1a1a1a;color:#fff;padding:15px 18px;display:flex;align-items:center;justify-content:space-between}
  #qf-chat-head .title{font-weight:700;font-size:16px;letter-spacing:.2px}
  #qf-chat-head .sub{font-size:12px;opacity:.85;margin-top:3px;font-weight:400}
  #qf-chat-close{background:transparent;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1;padding:0 4px;opacity:.8;transition:opacity .15s}
  #qf-chat-close:hover{opacity:1}

  /* 消息区 */
  #qf-chat-body{flex:1;overflow-y:auto;padding:16px;background:#f6f6f3}
  #qf-chat-body .msg{margin-bottom:14px;display:flex;flex-direction:column;max-width:86%}
  #qf-chat-body .msg.bot{align-self:flex-start}
  #qf-chat-body .msg.user{align-self:flex-end;align-items:flex-end}
  #qf-chat-body .bubble{padding:10px 14px;border-radius:14px;line-height:1.7;word-break:break-word;white-space:pre-wrap;box-shadow:0 1px 2px rgba(0,0,0,.04)}
  #qf-chat-body .msg.bot .bubble{background:#fff;border:1px solid #e6e6e2;color:#222}
  #qf-chat-body .msg.user .bubble{background:#1a1a1a;color:#fff}
  #qf-chat-body .bubble code{background:rgba(0,0,0,.08);padding:2px 6px;border-radius:5px;font-family:"SF Mono",Menlo,Consolas,monospace;font-size:.84em}
  #qf-chat-body .bubble pre{background:rgba(0,0,0,.07);padding:10px 12px;border-radius:8px;overflow-x:auto;margin:8px 0;font-family:"SF Mono",Menlo,Consolas,monospace;font-size:.84em;white-space:pre}

  /* 推荐问题 */
  #qf-chat-suggest{padding:0 16px 10px;display:flex;flex-wrap:wrap;gap:7px;background:#f6f6f3}
  #qf-chat-suggest .chip{font-size:12.5px;padding:6px 12px;border:1px solid #d0d0c8;border-radius:16px;background:#fff;cursor:pointer;color:#444;transition:all .15s;font-weight:500}
  #qf-chat-suggest .chip:hover{border-color:#1a1a1a;color:#1a1a1a;background:#fafafa}
  #qf-chat-suggest.hidden{display:none}

  /* 输入区 */
  #qf-chat-form{display:flex;gap:10px;padding:12px 14px;border-top:1px solid #eaeae6;background:#fff}
  #qf-chat-input{flex:1;border:1px solid #d8d8d2;border-radius:10px;padding:10px 13px;font-size:15px;font-family:inherit;resize:none;max-height:100px;outline:none;line-height:1.5;color:#222;-webkit-font-smoothing:subpixel-antialiased}
  #qf-chat-input:focus{border-color:#1a1a1a;box-shadow:0 0 0 3px rgba(26,26,26,.08)}
  #qf-chat-input::placeholder{color:#999}
  #qf-chat-send{background:#1a1a1a;color:#fff;border:none;border-radius:10px;padding:0 18px;cursor:pointer;font-size:14px;font-weight:700;transition:opacity .15s,transform .1s}
  #qf-chat-send:active{transform:scale(.96)}
  #qf-chat-send:disabled{opacity:.45;cursor:not-allowed;transform:none}

  /* 打字指示器 */
  .qf-typing{display:inline-flex;gap:4px;padding:10px 6px}
  .qf-typing span{width:7px;height:7px;border-radius:50%;background:#888;animation:qfblink 1.3s infinite both}
  .qf-typing span:nth-child(2){animation-delay:.22s}
  .qf-typing span:nth-child(3){animation-delay:.44s}
  @keyframes qfblink{0%,80%,100%{opacity:.25}40%{opacity:1}}

  /* 错误 */
  #qf-chat-err{margin:0 16px 10px;padding:9px 12px;background:#fdecea;border:1px solid #f5c6cb;color:#a94442;border-radius:9px;font-size:12.5px;display:none;line-height:1.5}

  /* 移动端 */
  @media (max-width:520px){
    /* 用 dvh/dvw 适配移动端动态地址栏，避免面板高度超出可视区被遮；
       dvh 不支持时回退到前面的 vh/vw */
    #qf-chat-panel{
      right:0;bottom:0;
      width:100vw;width:100dvw;
      height:100vh;height:100dvh;
      max-height:100vh;max-height:100dvh;
      border-radius:0;
    }
    #qf-chat-btn{right:16px;bottom:16px;width:56px;height:56px}
    #qf-chat-tooltip{right:82px;bottom:22px;max-width:210px;font-size:12.5px}
    /* 避开底部 home indicator 与顶部状态栏/刘海 */
    #qf-chat-head{padding-top:calc(15px + env(safe-area-inset-top))}
    #qf-chat-form{padding-bottom:calc(12px + env(safe-area-inset-bottom))}
  }

  /* 暗色模式 */
  @media (prefers-color-scheme:dark){
    #qf-chat-panel{background:#1f2225;color:#ecece8}
    #qf-chat-body,#qf-chat-suggest{background:#16181a}
    #qf-chat-body .msg.bot .bubble{background:#262a2e;border-color:#2f3336;color:#ecece8}
    #qf-chat-body .msg.user .bubble{background:#d0d0d0;color:#1a1a1a}
    #qf-chat-body .bubble code,#qf-chat-body .bubble pre{background:rgba(255,255,255,.1)}
    #qf-chat-suggest .chip{background:#262a2e;border-color:#454a4e;color:#a0a09a}
    #qf-chat-suggest .chip:hover{border-color:#d0d0d0;color:#d0d0d0;background:#2a2e32}
    #qf-chat-input{background:#262a2e;border-color:#454a4e;color:#ecece8}
    #qf-chat-input:focus{border-color:#d0d0d0;box-shadow:0 0 0 3px rgba(208,208,208,.12)}
    #qf-chat-form{background:#1f2225;border-color:#2f3336}
  }
  `;

  // ---------- DOM ----------
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.id = 'qf-chat-btn';
  btn.innerHTML = '💬';
  btn.setAttribute('aria-label', '打开聊天');
  document.body.appendChild(btn);

  const tooltip = document.createElement('div');
  tooltip.id = 'qf-chat-tooltip';
  tooltip.innerHTML = `${escapeHtml(TOOLTIP_TEXT)}<span class="qf-close" aria-label="关闭提示">×</span>`;
  document.body.appendChild(tooltip);

  const panel = document.createElement('div');
  panel.id = 'qf-chat-panel';
  panel.innerHTML = `
    <div id="qf-chat-head">
      <div>
        <div class="title">棋烽助手</div>
        <div class="sub">简历问答 · AI Agent</div>
      </div>
      <button id="qf-chat-close" aria-label="关闭">×</button>
    </div>
    <div id="qf-chat-body"></div>
    <div id="qf-chat-suggest"></div>
    <div id="qf-chat-err"></div>
    <form id="qf-chat-form">
      <textarea id="qf-chat-input" rows="1" placeholder="问点什么…" autocomplete="off"></textarea>
      <button id="qf-chat-send" type="submit">发送</button>
    </form>
  `;
  document.body.appendChild(panel);

  const body = panel.querySelector('#qf-chat-body');
  const suggestBox = panel.querySelector('#qf-chat-suggest');
  const errBox = panel.querySelector('#qf-chat-err');
  const form = panel.querySelector('#qf-chat-form');
  const input = panel.querySelector('#qf-chat-input');
  const sendBtn = panel.querySelector('#qf-chat-send');
  const closeBtn = panel.querySelector('#qf-chat-close');
  const tooltipClose = tooltip.querySelector('.qf-close');

  // ---------- 状态 ----------
  let messages = []; // {role, content}
  let streaming = false;

  // ---------- 渲染 ----------
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function renderMd(text) {
    let s = escapeHtml(text);
    s = s.replace(/```([\s\S]*?)```/g, (_, c) => `<pre>${c.replace(/^\n/, '')}</pre>`);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return s;
  }
  function addMsg(role, text) {
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + (role === 'user' ? 'user' : 'bot');
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = role === 'user' ? escapeHtml(text) : renderMd(text);
    wrap.appendChild(bubble);
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
    return bubble;
  }
  function typingIndicator() {
    const wrap = document.createElement('div');
    wrap.className = 'msg bot';
    wrap.id = 'qf-typing-wrap';
    wrap.innerHTML = '<div class="bubble"><span class="qf-typing"><span></span><span></span><span></span></span></div>';
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
  }
  function removeTyping() {
    const t = body.querySelector('#qf-typing-wrap');
    if (t) t.remove();
  }
  function showError(msg) {
    errBox.textContent = msg;
    errBox.style.display = 'block';
    setTimeout(() => { errBox.style.display = 'none'; }, 6000);
  }
  function renderSuggestions() {
    suggestBox.innerHTML = '';
    SUGGESTIONS.forEach(q => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = q;
      chip.onclick = () => { input.value = q; send(); };
      suggestBox.appendChild(chip);
    });
  }

  // ---------- 打开/关闭 ----------
  let tooltipTimer = null;
  function hideTooltip() {
    if (tooltipTimer) { clearTimeout(tooltipTimer); tooltipTimer = null; }
    tooltip.classList.add('hidden');
  }
  function resetTooltipTimer() {
    if (tooltipTimer) { clearTimeout(tooltipTimer); tooltipTimer = null; }
    tooltipTimer = setTimeout(hideTooltip, 8000);
  }
  function openPanel() {
    hideTooltip();
    panel.classList.add('open');
    // 通知页面：聊天面板已打开，页面可据此让出空间（如简历纸左移）
    document.body.classList.add('qf-chat-open');
    // 气泡变为关闭按钮：不隐藏，点击即可收起
    btn.classList.add('is-open');
    btn.innerHTML = '×';
    btn.setAttribute('aria-label', '关闭聊天');
    setTimeout(() => input.focus(), 100);
  }
  // 8 秒后自动隐藏引导气泡
  resetTooltipTimer();
  function closePanel() {
    panel.classList.remove('open');
    document.body.classList.remove('qf-chat-open');
    btn.classList.remove('is-open');
    btn.innerHTML = '💬';
    btn.setAttribute('aria-label', '打开聊天');
  }
  // 气泡作为开关：已打开则收起，否则打开
  btn.onclick = () => {
    if (panel.classList.contains('open')) closePanel();
    else openPanel();
  };
  closeBtn.onclick = closePanel;
  tooltipClose.onclick = (e) => { e.stopPropagation(); hideTooltip(); };

  // 鼠标悬停在按钮或气泡上时重置计时器
  btn.addEventListener('mouseenter', resetTooltipTimer);
  tooltip.addEventListener('mouseenter', resetTooltipTimer);
  btn.addEventListener('mouseleave', resetTooltipTimer);
  tooltip.addEventListener('mouseleave', resetTooltipTimer);

  // ---------- 发送 & 流式接收 ----------
  async function send() {
    const text = input.value.trim();
    if (!text || streaming) return;
    errBox.style.display = 'none';
    suggestBox.classList.add('hidden');

    messages.push({ role: 'user', content: text });
    addMsg('user', text);
    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;
    streaming = true;
    typingIndicator();

    const botBubble = addMsg('bot', '');
    let acc = '';

    try {
      const resp = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      });

      if (!resp.ok) {
        let detail = '';
        try { detail = (await resp.json()).error || ''; } catch {}
        throw new Error(detail || `HTTP ${resp.status}`);
      }

      const contentType = resp.headers.get('Content-Type') || '';
      removeTyping();

      if (contentType.includes('text/event-stream')) {
        // 流式响应（Cloudflare Worker / DeepSeek 标准 SSE）
        const reader = resp.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            const t = line.trim();
            if (!t || !t.startsWith('data:')) continue;
            const data = t.slice(5).trim();
            if (data === '[DONE]') continue;
            try {
              const json = JSON.parse(data);
              const delta = json.choices && json.choices[0] && json.choices[0].delta;
              if (delta && delta.content) {
                acc += delta.content;
                botBubble.innerHTML = renderMd(acc);
                body.scrollTop = body.scrollHeight;
              }
            } catch {}
          }
        }
      } else {
        // 非流式响应（阿里云 FC / 腾讯云函数等）
        const data = await resp.json();
        const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (content) {
          acc = content;
          botBubble.innerHTML = renderMd(acc);
          body.scrollTop = body.scrollHeight;
        }
      }

      if (!acc) {
        botBubble.innerHTML = '<span style="color:#999">（没有返回内容）</span>';
      } else {
        messages.push({ role: 'assistant', content: acc });
      }
    } catch (e) {
      removeTyping();
      if (!acc) botBubble.remove();
      showError('请求失败：' + (e.message || '网络错误') + '。请稍后再试。');
      // 失败时回滚用户消息，方便重试
      messages.pop();
    } finally {
      streaming = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  form.onsubmit = (e) => { e.preventDefault(); send(); };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  });

  // ---------- 初始化 ----------
  addMsg('bot', WELCOME);
  renderSuggestions();
})();

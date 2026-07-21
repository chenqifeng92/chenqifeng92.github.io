/**
 * 陈棋烽简历聊天机器人 - 前端聊天组件
 *
 * 用法：在任意 HTML 页面 </body> 前加一行：
 *   <script src="chatbot/widget.js" data-worker="https://你的-worker.workers.dev" defer></script>
 *
 * 把 data-worker 换成你部署后的 Cloudflare Worker 地址。
 * 无依赖，原生 JS，自带样式，自动适配暗色模式与移动端。
 * 界面语言跟随简历页面（body.lang-en / body.lang-zh）切换；
 * AI 回复语言则跟随用户提问语言（由 persona 规则保证），两者独立。
 */
(function () {
  'use strict';

  const SCRIPT = document.currentScript || document.querySelector('script[data-worker]');
  const WORKER_URL = (SCRIPT && SCRIPT.dataset.worker) || '';
  if (!WORKER_URL) {
    console.warn('[chatbot] 缺少 data-worker 属性，聊天机器人未启动。');
    return;
  }

  // ---------- 多语言文案（跟随简历页面中英文切换） ----------
  // 注意：界面语言跟页面；AI 回复语言跟用户提问（persona 规则），两者独立。
  const I18N = {
    zh: {
      title: '棋烽助手',
      sub: '简历问答 · AI Agent',
      tooltip: '和棋烽的蒸馏智能体聊天，了解他的个人情况',
      welcome: '你好！我是棋烽的职业助手，可以介绍他的经历、技能和近况。试试下面的问题，或直接问我 👇',
      suggestions: ['简单介绍一下棋烽', '他最近在做什么项目？', '他的技术栈有哪些？', '为什么想转 AI Agent 方向？', '怎么联系他？'],
      placeholder: '问点什么…',
      send: '发送',
      openLabel: '打开聊天',
      closeLabel: '关闭聊天',
      tipClose: '关闭提示',
      errPrefix: '请求失败：',
      errSuffix: '。请稍后再试。',
      errNetwork: '网络错误',
      emptyReply: '（没有返回内容）',
    },
    en: {
      title: 'Qifeng Assistant',
      sub: 'Resume Q&A · AI Agent',
      tooltip: "Chat with Qifeng's distilled agent to learn about him",
      welcome: "Hi! I'm Qifeng's career assistant — ask about his background, skills, and latest work. Try a question below or just ask 👇",
      suggestions: ['Tell me about Qifeng briefly', "What's his latest project?", 'What is his tech stack?', 'Why pivot to AI Agents?', 'How to contact him?'],
      placeholder: 'Ask me anything…',
      send: 'Send',
      openLabel: 'Open chat',
      closeLabel: 'Close chat',
      tipClose: 'Close',
      errPrefix: 'Request failed: ',
      errSuffix: '. Please try again later.',
      errNetwork: 'network error',
      emptyReply: '(no response)',
    },
  };
  let currentLang = document.body.classList.contains('lang-en') ? 'en' : 'zh';
  function tr() { return I18N[currentLang]; }
  let welcomeBubble = null; // 首条欢迎气泡，切换语言时更新

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
  #qf-chat-tooltip .qf-tip-text{display:inline}
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
  #qf-chat-body .bubble p{margin:0 0 6px}
  #qf-chat-body .bubble p:last-child{margin-bottom:0}
  #qf-chat-body .bubble ul,#qf-chat-body .bubble ol{margin:0 0 6px;padding-left:20px}
  #qf-chat-body .bubble li{margin:2px 0}
  #qf-chat-body .bubble h3,#qf-chat-body .bubble h4,#qf-chat-body .bubble h5{margin:8px 0 4px;line-height:1.4;font-weight:700}
  #qf-chat-body .bubble h3{font-size:1.02em}
  #qf-chat-body .bubble h4{font-size:.96em}
  #qf-chat-body .bubble h5{font-size:.92em}
  #qf-chat-body .bubble a{color:#1a6dcc;text-decoration:underline;word-break:break-all}
  #qf-chat-body .bubble blockquote{margin:0 0 6px;padding:2px 0 2px 10px;border-left:3px solid #d6d6cf;color:#777}
  #qf-chat-body .bubble hr{border:none;border-top:1px solid #e6e6e2;margin:8px 0}
  #qf-chat-body .bubble pre{background:rgba(0,0,0,.07);padding:10px 12px;border-radius:8px;overflow-x:auto;margin:8px 0;font-family:"SF Mono",Menlo,Consolas,monospace;font-size:.84em;white-space:pre}
  #qf-chat-body .qf-code{margin:8px 0;border:1px solid #e6e6e2;border-radius:8px;overflow:hidden;background:rgba(0,0,0,.035)}
  #qf-chat-body .qf-code .qf-code-head{display:flex;align-items:center;justify-content:space-between;padding:3px 8px 3px 10px;background:rgba(0,0,0,.05);font-size:11px}
  #qf-chat-body .qf-code .qf-code-lang{color:#888;text-transform:lowercase;letter-spacing:.3px}
  #qf-chat-body .qf-code .qf-copy-btn{background:transparent;border:1px solid #d6d6cf;color:#666;border-radius:5px;padding:1px 8px;font-size:11px;cursor:pointer;line-height:1.5}
  #qf-chat-body .qf-code .qf-copy-btn:hover{background:#fff;color:#222}
  #qf-chat-body .qf-code .qf-copy-btn.copied{color:#1a9f5f}
  #qf-chat-body .qf-code pre{margin:0;border-radius:0;background:transparent}
  #qf-chat-body .qf-code pre code{background:none;padding:0;font-size:.84em;color:inherit}

  /* 推荐问题 */
  #qf-chat-suggest{padding:0 16px 10px;display:flex;flex-wrap:wrap;gap:7px;background:#f6f6f3}
  #qf-chat-suggest .chip{font-size:12.5px;padding:6px 12px;border:1px solid #d0d0c8;border-radius:16px;background:#fff;cursor:pointer;color:#444;transition:all .15s;font-weight:500}
  #qf-chat-suggest .chip:hover{border-color:#1a1a1a;color:#1a1a1a;background:#fafafa}
  #qf-chat-suggest.hidden{display:none}
  #qf-chat-suggest:not(.hidden){animation:qf-suggest-in .25s ease both}
  @keyframes qf-suggest-in{0%{opacity:0;transform:translateY(8px)}100%{opacity:1;transform:translateY(0)}}

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
  #qf-chat-body .bubble a{color:#7ab8ff}
  #qf-chat-body .bubble blockquote{border-color:#3a3f44;color:#9a9a94}
  #qf-chat-body .bubble hr{border-top-color:#2f3336}
  #qf-chat-body .qf-code{border-color:#2f3336;background:rgba(255,255,255,.04)}
  #qf-chat-body .qf-code .qf-code-head{background:rgba(255,255,255,.06)}
  #qf-chat-body .qf-code .qf-code-lang{color:#8a8a84}
  #qf-chat-body .qf-code .qf-copy-btn{border-color:#454a4e;color:#a0a09a}
  #qf-chat-body .qf-code .qf-copy-btn:hover{background:rgba(255,255,255,.08);color:#d0d0d0}
  #qf-chat-body .qf-code pre,#qf-chat-body .qf-code pre code{background:transparent}
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
  btn.setAttribute('aria-label', tr().openLabel);
  document.body.appendChild(btn);

  const tooltip = document.createElement('div');
  tooltip.id = 'qf-chat-tooltip';
  // 文本与关闭按钮分离为两个 span：切换语言时只更新文本 span，
  // 关闭按钮节点不重建，其事件绑定保持有效。
  tooltip.innerHTML = `<span class="qf-tip-text"></span><span class="qf-close" aria-label="">×</span>`;
  document.body.appendChild(tooltip);

  const L0 = tr();
  const panel = document.createElement('div');
  panel.id = 'qf-chat-panel';
  panel.innerHTML = `
    <div id="qf-chat-head">
      <div>
        <div class="title">${L0.title}</div>
        <div class="sub">${L0.sub}</div>
      </div>
      <button id="qf-chat-close" aria-label="${L0.closeLabel}">×</button>
    </div>
    <div id="qf-chat-body"></div>
    <div id="qf-chat-suggest"></div>
    <div id="qf-chat-err"></div>
    <form id="qf-chat-form">
      <textarea id="qf-chat-input" rows="1" placeholder="${L0.placeholder}" autocomplete="off"></textarea>
      <button id="qf-chat-send" type="submit">${L0.send}</button>
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
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // 内联规则：行内代码、链接、粗体、斜体。输入须已 escapeHtml。
  function renderInline(s) {
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (_, c) => {
      const i = codes.length;
      codes.push('<code>' + c + '</code>');
      return '@@C' + i + '@@';
    });
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+?)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*a-zA-Z0-9])\*([^*\n]+?)\*(?![a-zA-Z0-9])/g, '$1<em>$2</em>');
    s = s.replace(/@@C(\d+)@@/g, (_, n) => codes[+n] || '');
    return s;
  }
  // 代码块：语言标签 + 复制按钮（内容已转义）
  function renderCodeBlock(lang, code) {
    const langLabel = lang ? escapeHtml(lang) : 'text';
    return '<div class="qf-code">'
      + '<div class="qf-code-head"><span class="qf-code-lang">' + langLabel + '</span>'
      + '<button class="qf-copy-btn" type="button">复制</button></div>'
      + '<pre><code>' + escapeHtml(code) + '</code></pre></div>';
  }
  // 文本段（代码围栏之间）-> 块级 HTML：标题/分隔线/引用/列表/段落
  function renderTextSegment(seg) {
    if (!seg) return '';
    const lines = seg.replace(/\r/g, '').split('\n');
    let html = '';
    let para = [];
    let listType = null;
    let listItems = [];
    let quote = [];
    const closeList = () => {
      if (listType) {
        const tag = listType;
        html += '<' + tag + '>' + listItems.map((li) => '<li>' + renderInline(escapeHtml(li)) + '</li>').join('') + '</' + tag + '>';
        listType = null; listItems = [];
      }
    };
    const closeQuote = () => {
      if (quote.length) {
        html += '<blockquote>' + quote.map((q) => renderInline(escapeHtml(q))).join('<br>') + '</blockquote>';
        quote = [];
      }
    };
    const flushPara = () => {
      if (para.length) {
        html += '<p>' + para.map((t) => renderInline(escapeHtml(t))).join('<br>') + '</p>';
        para = [];
      }
    };
    const closeAll = () => { closeList(); closeQuote(); flushPara(); };
    for (const line of lines) {
      if (/^\s*$/.test(line)) { closeAll(); continue; }
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { closeAll(); const n = Math.min(h[1].length, 3) + 2; html += '<h' + n + '>' + renderInline(escapeHtml(h[2])) + '</h' + n + '>'; continue; }
      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { closeAll(); html += '<hr>'; continue; }
      const q = line.match(/^>\s?(.*)$/);
      if (q) { flushPara(); closeList(); quote.push(q[1]); continue; }
      closeQuote();
      const ul = line.match(/^[-*+]\s+(.*)$/);
      if (ul) { flushPara(); if (listType && listType !== 'ul') closeList(); listType = 'ul'; listItems.push(ul[1]); continue; }
      const ol = line.match(/^\d+[.)]\s+(.*)$/);
      if (ol) { flushPara(); if (listType && listType !== 'ol') closeList(); listType = 'ol'; listItems.push(ol[1]); continue; }
      closeList();
      para.push(line);
    }
    closeAll();
    return html;
  }
  // markdown 渲染：按代码围栏切分，代码段（含流式未闭合的末段）走代码块，其余走块级渲染。
  function renderMd(text) {
    if (!text) return '';
    const parts = text.split('```');
    const blocks = [];
    let html = '';
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        let seg = parts[i];
        let lang = '';
        const nl = seg.indexOf('\n');
        if (nl !== -1) {
          const fl = seg.slice(0, nl).trim();
          if (fl && /^[A-Za-z0-9+#.\-]{1,20}$/.test(fl)) { lang = fl; seg = seg.slice(nl + 1); }
        } else if (/^[A-Za-z0-9+#.\-]{1,20}$/.test(seg.trim())) {
          // 流式：只有语言、还没换行，按语言标签 + 空代码渲染
          lang = seg.trim(); seg = '';
        }
        const idx = blocks.length;
        blocks.push(renderCodeBlock(lang, seg.replace(/^\n+/, '').replace(/\n+$/, '')));
        html += '@@B' + idx + '@@';
      } else {
        html += renderTextSegment(parts[i]);
      }
    }
    return html.replace(/@@B(\d+)@@/g, (_, n) => blocks[+n] || '');
  }
  // 长回答分多气泡：活动气泡累积到此字符数时，在段落边界（连续空行）切分封存，
  // 剩余进入新气泡继续流式渲染。切点须在代码围栏闭合处（``` 偶数），避免把代码块切成两半。
  // 对话历史仍存完整一条 assistant 消息，仅展示层拆分。
  // 阈值取 1000：十个面试题量级的长回答约分成 5~6 个气泡，每气泡一屏半左右，阅读舒适且不碎。
  const SPLIT_THRESHOLD = 1000;
  // 在 text 里找第一个"切点前内容已达 minLen"的安全切点：返回切点之后的起始索引（下一段开头）；
  // 切点 = 连续空行之后，且该位置之前 ``` 围栏数为偶数（代码块已闭合）。取第一个够长的切点，
  // 使各气泡大小接近阈值、分布均匀，避免按"最后一个切点"切出大量小尾巴气泡。找不到返回 -1。
  function findSafeSplit(text, minLen) {
    const re = /\n{2,}/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const after = m.index + m[0].length;
      if (after < minLen) continue;
      const fences = (text.slice(0, m.index).match(/```/g) || []).length;
      if (fences % 2 === 0) return after;
    }
    return -1;
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
  function renderSuggestions(items) {
    items = items || tr().suggestions;
    suggestBox.innerHTML = '';
    items.forEach(q => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = q;
      chip.onclick = () => { input.value = q; send(); };
      suggestBox.appendChild(chip);
    });
  }
  // 根据当前语言刷新所有界面文案（tooltip / 头部 / 输入区 / 欢迎语 / 首屏建议）
  function applyLang(lang) {
    if (!I18N[lang]) return;
    currentLang = lang;
    const L = I18N[lang];
    tooltip.querySelector('.qf-tip-text').textContent = L.tooltip;
    tooltip.querySelector('.qf-close').setAttribute('aria-label', L.tipClose);
    panel.querySelector('#qf-chat-head .title').textContent = L.title;
    panel.querySelector('#qf-chat-head .sub').textContent = L.sub;
    input.placeholder = L.placeholder;
    sendBtn.textContent = L.send;
    if (welcomeBubble) welcomeBubble.innerHTML = renderMd(L.welcome);
    // 无对话历史时刷新首屏建议；有对话时保留动态建议（其语言跟随对话上下文）
    if (messages.length === 0) renderSuggestions(L.suggestions);
    btn.setAttribute('aria-label', panel.classList.contains('open') ? L.closeLabel : L.openLabel);
  }
  // 动态追问建议：根据已发生的对话上下文，由后端 LLM 生成用户可能想追问的问题。
  // 仅在前三轮对话内启用；超过三轮不再生成，引导用户自由提问。
  const SUGGESTIONS_URL = WORKER_URL.replace(/\/api\/chat$/, '/api/suggestions');
  let suggestReqId = 0; // 防竞态：用户连发消息时丢弃过期的建议请求
  async function fetchDynamicSuggestions() {
    const myId = suggestReqId;
    try {
      const resp = await fetch(SUGGESTIONS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, lang: currentLang }),
      });
      if (!resp.ok) return;
      const data = await resp.json();
      if (myId !== suggestReqId) return; // 期间又发了新消息，丢弃过期结果
      const items = Array.isArray(data.suggestions)
        ? data.suggestions.filter(Boolean).slice(0, 3)
        : [];
      if (items.length === 0) return;
      renderSuggestions(items);
      suggestBox.classList.remove('hidden');
      // 建议区出现会挤压消息区高度，等下一帧布局更新后滚动到底，
      // 确保最后一条气泡完整可见、不被建议区遮挡
      requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
    } catch {}
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
    btn.setAttribute('aria-label', tr().closeLabel);
    setTimeout(() => input.focus(), 100);
  }
  // 8 秒后自动隐藏引导气泡
  resetTooltipTimer();
  function closePanel() {
    panel.classList.remove('open');
    document.body.classList.remove('qf-chat-open');
    btn.classList.remove('is-open');
    btn.innerHTML = '💬';
    btn.setAttribute('aria-label', tr().openLabel);
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

  // 代码块复制按钮：事件委托（流式重渲染会重建按钮，直接绑会丢）
  body.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.qf-copy-btn');
    if (!copyBtn) return;
    const box = copyBtn.closest('.qf-code');
    const codeEl = box && box.querySelector('pre code');
    if (!codeEl) return;
    const txt = codeEl.textContent;
    const done = () => {
      const orig = copyBtn.textContent;
      copyBtn.textContent = '已复制';
      copyBtn.classList.add('copied');
      setTimeout(() => { copyBtn.textContent = orig; copyBtn.classList.remove('copied'); }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done).catch(() => {});
    } else {
      const ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (_) {}
      document.body.removeChild(ta);
    }
  });

  // ---------- 发送 & 流式接收 ----------
  async function send() {
    const text = input.value.trim();
    if (!text || streaming) return;
    errBox.style.display = 'none';
    suggestBox.classList.add('hidden');
    suggestReqId++; // 作废上一轮未返回的建议请求

    messages.push({ role: 'user', content: text });
    addMsg('user', text);
    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;
    streaming = true;
    typingIndicator();

    let activeBubble = addMsg('bot', '');
    let activeAcc = '';   // 当前活动气泡累积的文本
    let fullAcc = '';    // 完整输出，用于写入对话历史（多气泡展示合并为一条）
    const bubbles = [];  // 本次创建的 bot 气泡（失败回滚用）
    bubbles.push(activeBubble);
    // 活动气泡累积超过阈值时，在最近的安全段落边界切分：前段固化进当前气泡，
    // 后段进入新活动气泡继续流式渲染。while 循环确保一次大块内容也能切多段。
    const seal = () => {
      while (activeAcc.length >= SPLIT_THRESHOLD) {
        const at = findSafeSplit(activeAcc, SPLIT_THRESHOLD);
        if (at <= 0) break;
        activeBubble.innerHTML = renderMd(activeAcc.slice(0, at));
        activeAcc = activeAcc.slice(at);
        activeBubble = addMsg('bot', '');
        bubbles.push(activeBubble);
      }
    };

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
                fullAcc += delta.content;
                activeAcc += delta.content;
                seal();
                activeBubble.innerHTML = renderMd(activeAcc);
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
          fullAcc = content;
          activeAcc = content;
          seal();
          activeBubble.innerHTML = renderMd(activeAcc);
          body.scrollTop = body.scrollHeight;
        }
      }

      if (!fullAcc) {
        activeBubble.innerHTML = '<span style="color:#999">' + tr().emptyReply + '</span>';
      } else {
        messages.push({ role: 'assistant', content: fullAcc });
        // 前三轮：根据上下文动态生成引导追问
        const userTurns = messages.filter(m => m.role === 'user').length;
        if (userTurns <= 3) fetchDynamicSuggestions();
      }
    } catch (e) {
      removeTyping();
      // 无内容则移除本次创建的空 bot 气泡；有部分输出则保留在屏幕上（不写入历史）
      if (!fullAcc) bubbles.forEach((b) => { const w = b.closest('.msg'); if (w) w.remove(); });
      showError(tr().errPrefix + (e.message || tr().errNetwork) + tr().errSuffix);
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
  welcomeBubble = addMsg('bot', tr().welcome);
  renderSuggestions();
  // 应用当前语言：填充 tooltip 文本等创建时留空的文案
  applyLang(currentLang);
  // 监听简历页面语言切换，同步更新聊天界面语言
  const langObserver = new MutationObserver(() => {
    const next = document.body.classList.contains('lang-en') ? 'en' : 'zh';
    if (next !== currentLang) applyLang(next);
  });
  langObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
})();

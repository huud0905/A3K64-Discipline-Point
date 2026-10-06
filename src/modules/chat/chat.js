/* ============================================================
   A3K64 — Aris (chat AI)
   • Gọi backend action 'chatStream' (SSE) → server chọn model theo "mức suy luận", giữ khoá OpenRouter bí mật.
   • Lịch sử hội thoại lưu trên máy (IndexedDB, theo từng tài khoản) — kể cả ảnh/tệp đính kèm.
   • Lượt AI: mỗi cuộc trò chuyện dùng 1 mã phiên (quotaSession) → xem sessionQuotaGate ở worker.js.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- Hằng số ---------- */
  const LEVELS = [
    { key: 'auto',     label: 'Tự động',   hint: 'Aris tự chọn mức theo độ khó câu hỏi' },
    { key: 'fast',     label: 'Nhanh',     hint: 'Câu hỏi đơn giản, cần trả lời gấp' },
    { key: 'balanced', label: 'Cân bằng',  hint: 'Hợp với đa số câu hỏi, ảnh đơn giản' },
    { key: 'deep',     label: 'Suy luận',  hint: 'Toán, logic, code, bài khó — chậm hơn' },
    { key: 'expert',   label: 'Chuyên gia', hint: 'Model lớn nhất, bài rất khó — chậm nhất' },
  ];
  const MODES = [
    { key: 'general', label: 'Chung',     hint: 'Hỏi đáp đa năng' },
    { key: 'tutor',   label: 'Gia sư',    hint: 'Gợi ý từng bước để bạn tự làm, không đưa đáp án ngay' },
    { key: 'writing', label: 'Viết lách', hint: 'Sửa lỗi, viết lại, góp ý văn bản' },
    { key: 'code',    label: 'Lập trình', hint: 'Code chạy được, giải thích ngắn gọn' },
  ];
  const SUG_ICONS = [
    '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>',
    '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/></svg>',
    '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4"/></svg>',
    '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/></svg>'
  ];
  const SUGGESTIONS = [
    { t: 'Giải thích dễ hiểu', d: 'Giải thích khái niệm khó như cho học sinh lớp 10', p: 'Giải thích giúp mình một cách dễ hiểu: ' },
    { t: 'Giải bài từng bước', d: 'Toán, lý, hoá — có các bước và kiểm tra lại', p: 'Giải giúp mình bài này, trình bày từng bước:\n' },
    { t: 'Viết & sửa văn bản', d: 'Đoạn văn, thư, bài thuyết trình', p: 'Giúp mình viết lại đoạn sau cho mạch lạc và hay hơn:\n' },
    { t: 'Đọc ảnh / tệp', d: 'Chụp bài tập, đính kèm PDF hay file code', p: 'Hãy đọc tệp/ảnh đính kèm và ' },
  ];
  // Ảnh chụp đề (nhiều câu, chữ nhỏ) bị thu quá nhỏ thì AI đọc thiếu chữ → để 1600px (≈1 ảnh 0,2–0,5MB, 4 ảnh vẫn dưới MAX_BIN_CHARS)
  const MAX_ATT = 4, MAX_IMG_SIDE = 1600, MAX_PDF_BYTES = 14 * 1024 * 1024, MAX_TEXT_CHARS = 40000, MAX_BIN_CHARS = 19500000;
  const TEXT_EXT = /\.(txt|md|csv|tsv|json|js|jsx|ts|tsx|py|java|c|cpp|h|cs|go|rs|php|rb|html|css|xml|yml|yaml|sql|sh|log|ini|toml)$/i;
  const SID_MAX_AGE = 18 * 60 * 1000, SID_MAX_CALLS = 36;       // < TTL 20 phút / 40 lệnh của server

  const LV_LABEL = { fast: 'Nhanh', balanced: 'Cân bằng', deep: 'Suy luận', expert: 'Chuyên gia' };
  // Chế độ Tự động: đoán mức theo độ dài/loại câu hỏi (chạy ở client, không tốn lượt)
  // prev = mức của câu trả lời trước trong cuộc trò chuyện (nếu có). Tin nối tiếp ngắn kiểu "Có 3 câu phải mà", "làm tiếp đi"
  // phụ thuộc ngữ cảnh bài đang giải → KHÔNG được tụt xuống "Nhanh" (trả lời vài câu bằng model nhỏ), mà giữ mức của lượt trước.
  function pickLevel(text, atts, prev) {
    const t = String(text || '').toLowerCase();
    const hasMedia = (atts || []).some(a => a.kind === 'image' || a.kind === 'pdf');
    const hard = /chứng minh|phân tích|so sánh|thuật toán|debug|phương trình|bài toán|lập trình|giải (bài|giúp|hộ)|\d\s*[-+*\/^=]\s*\d|```/.test(t);
    const prevHeavy = prev === 'deep' || prev === 'expert';          // "Chuyên gia" chỉ do người dùng tự chọn, Tự động tối đa tới "Suy luận"
    if ((hard && t.length > 80) || t.length > 600) return 'deep';
    // Ảnh/PDF: nếu không có dấu hiệu bài khó thì đọc ảnh TRỰC TIẾP bằng 1 model (Cân bằng) — nhanh hơn nhiều so với đọc ảnh → rồi mới suy luận (2 bước)
    if (hasMedia) return prevHeavy ? 'deep' : 'balanced';
    if (prevHeavy) return 'deep';                                    // tin nối tiếp: giữ mức cũ
    if (prev === 'balanced') return prev;
    return (t.length < 140 && t.indexOf('\n') < 0) ? 'fast' : 'balanced';
  }
  // Mức của câu trả lời AI gần nhất (bỏ qua tin lỗi) — dùng cho chế độ Tự động.
  function prevLevel(t) {
    for (let i = t.messages.length - 1; i >= 0; i--) { const m = t.messages[i]; if (m.role === 'assistant' && !m.error && m.level) return m.level; }
    return '';
  }

  /* ---------- Tiện ích ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const gasUrl = () => (window.A3K64_CONFIG && window.A3K64_CONFIG.gasUrl) || '';
  const token = () => (window.A3AI && window.A3AI.readToken && window.A3AI.readToken()) || '';
  function username() {
    try {
      const u = JSON.parse(sessionStorage.getItem('a3k64-user') || localStorage.getItem('a3k64-user') || 'null') || {};
      return String(u.username || u.email || u.user || '').toLowerCase();
    } catch (e) { return ''; }
  }
  const isTouch = () => window.matchMedia && matchMedia('(pointer:coarse)').matches;

  /* ---------- Lưu trữ (IndexedDB, có dự phòng bộ nhớ tạm) ---------- */
  let db = null;
  const mem = new Map();
  function dbOpen() {
    return new Promise(resolve => {
      try {
        const r = indexedDB.open('a3k64-chat-v1', 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('threads', { keyPath: 'id' }).createIndex('user', 'user'); };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }
  const req2p = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function dbAll(user) {
    if (!db) return [...mem.values()].filter(t => t.user === user);
    try { return await req2p(db.transaction('threads').objectStore('threads').index('user').getAll(user)); } catch (e) { return []; }
  }
  async function dbPut(t) {
    mem.set(t.id, t);
    if (!db) return;
    try { await req2p(db.transaction('threads', 'readwrite').objectStore('threads').put(JSON.parse(JSON.stringify(t, (k, v) => (k === 'streaming' ? undefined : v))))); } catch (e) { /* hết dung lượng → bỏ qua */ }
  }
  async function dbDel(id) {
    mem.delete(id);
    if (!db) return;
    try { await req2p(db.transaction('threads', 'readwrite').objectStore('threads').delete(id)); } catch (e) {}
  }

  /* ---------- Markdown an toàn (tự viết, không phụ thuộc thư viện) ---------- */
  function inline(s) {
    const codes = [];
    s = s.replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
         .replace(/(^|[^*])\*([^*\s][^*\n]*?)\*(?!\*)/g, '$1<em>$2</em>')
         .replace(/~~([^~\n]+?)~~/g, '<del>$1</del>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => '<code>' + codes[i] + '</code>');
  }
  // Khối code có ghi tên file (vd ```js worker.js, ```html index.html) = "file": hiện thẻ file + Tải về + Xem trước.
  const EXT_LANG = { js: 'js', mjs: 'js', html: 'html', htm: 'html', svg: 'svg', md: 'md', markdown: 'md', css: 'css', json: 'json', py: 'py', txt: 'txt', csv: 'csv' };
  const PREVIEWABLE = { html: 1, svg: 1, md: 1, js: 1 };
  function fileKind(lang, name) {
    const ext = (name.match(/\.(\w+)$/) || [])[1] || '';
    return EXT_LANG[ext.toLowerCase()] || String(lang || '').toLowerCase().replace(/^(javascript|node)$/, 'js').replace(/^(markdown)$/, 'md');
  }
  function codeBlock(lang, body, info) {
    let name = '';
    const tok = String(info || '').match(/(?:title|file(?:name)?)\s*=\s*["']?([^\s"']+)|([\w][\w.\-\/]*\.[A-Za-z0-9]{1,8})\b/);
    if (tok) name = (tok[1] || tok[2] || '').split('/').pop();
    else if (/^[\w][\w.\-]*\.[A-Za-z0-9]{1,8}$/.test(lang || '')) name = lang;
    const kind = fileKind(name ? '' : lang, name) || fileKind(lang, name);
    if (!name) return '<div class="cx-code"><div class="cx-code-h"><span>' + esc(lang || 'code') + '</span><button class="cx-copy" data-copy type="button">Sao chép</button></div><pre><code>' + esc(body) + '</code></pre></div>';
    const prev = PREVIEWABLE[kind];
    return '<div class="cx-code cx-file" data-kind="' + esc(kind) + '" data-name="' + esc(name) + '"><div class="cx-code-h"><span>📄 ' + esc(name) + '</span><span class="cx-fbtns">' +
      (prev ? '<button class="cx-copy" data-prev type="button">' + (kind === 'js' ? 'Chạy thử' : 'Xem trước') + '</button>' : '') +
      '<button class="cx-copy" data-dl type="button">Tải file</button><button class="cx-copy" data-copy type="button">Sao chép</button></span></div>' +
      '<div class="cx-prev" hidden></div><pre><code>' + esc(body) + '</code></pre></div>';
  }
  // Dựng khung xem trước trong iframe sandbox (không cùng origin, không đụng được dữ liệu trang). Gọi khi bấm nút / tự mở khi trả lời xong.
  function buildPreview(card) {
    const box = card.querySelector('.cx-prev'), code = card.querySelector('code').textContent, kind = card.dataset.kind;
    if (!box.hidden) { box.hidden = true; box.innerHTML = ''; return; }
    let doc;
    if (kind === 'html') doc = code;
    else if (kind === 'svg') doc = '<!doctype html><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#fff">' + code + '</body>';
    else if (kind === 'md') doc = '<!doctype html><meta charset="utf-8"><body style="font:15px/1.6 system-ui;padding:14px;color:#111;background:#fff"><style>pre{background:#f4f4f5;padding:10px;border-radius:8px;overflow:auto}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style>' + md(code) + '</body>';
    else {      // js: chạy thử, in console.log ra khung kết quả
      doc = '<!doctype html><meta charset="utf-8"><body style="font:13px/1.5 ui-monospace,monospace;padding:12px;color:#111;background:#fff"><pre id="o" style="margin:0;white-space:pre-wrap"></pre><script>' +
        'var o=document.getElementById("o");function w(c,a){o.textContent+=(c?c+" ":"")+Array.prototype.map.call(a,function(x){try{return typeof x==="string"?x:JSON.stringify(x)}catch(e){return String(x)}}).join(" ")+"\\n"}' +
        'console.log=function(){w("",arguments)};console.error=function(){w("[lỗi]",arguments)};console.warn=function(){w("[cảnh báo]",arguments)};' +
        'window.onerror=function(m){w("[lỗi]",[m])};try{(0,eval)(' + JSON.stringify(code).replace(/</g, '\\u003c') + ')}catch(e){w("[lỗi]",[e.message])}' + '<\/script></body>';
    }
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts'); f.setAttribute('referrerpolicy', 'no-referrer'); f.className = 'cx-prev-f' + (kind === 'js' ? ' js' : '');
    f.srcdoc = doc; box.innerHTML = ''; box.appendChild(f); box.hidden = false;
  }
  function downloadFile(card) {
    const name = card.dataset.name || 'file.txt', mime = { html: 'text/html', svg: 'image/svg+xml', md: 'text/markdown', js: 'text/javascript', css: 'text/css', json: 'application/json', csv: 'text/csv' }[card.dataset.kind] || 'text/plain';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([card.querySelector('code').textContent], { type: mime + ';charset=utf-8' })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function md(src) {
    const blocks = [];
    // 1) tách khối code (kể cả khối chưa đóng khi đang stream)
    src = String(src || '').replace(/```([\w+#.-]*)([^\n]*)\n([\s\S]*?)(```|$)/g, (_, lang, info, body) => {
      blocks.push(codeBlock(lang, body.replace(/\n$/, ''), info)); return '\n\u0001' + (blocks.length - 1) + '\u0001\n';
    });
    // 2) tách công thức toán ra trước khi escape để markdown/escape không làm hỏng TeX
    const maths = [];
    src = src.replace(/(`[^`\n]+`)|\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^\s$`](?:[^$\n`]*?[^\s$`])?)\$(?!\d)/g, (m, code, dd, db, pa, sd) => {
      if (code) return code;
      const tex = (dd ?? db ?? pa ?? sd ?? '').trim();
      if (!tex) return m;
      maths.push({ tex, d: dd != null || db != null });
      return '\u0003' + (maths.length - 1) + '\u0003';
    });
    const lines = esc(src).split('\n');
    const out = [];
    let i = 0;
    const isTableSep = l => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l || '');
    const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    while (i < lines.length) {
      const l = lines[i];
      let m;
      if (!l.trim()) { i++; continue; }
      if ((m = l.match(/^\u0001(\d+)\u0001$/))) { out.push(blocks[+m[1]]); i++; continue; }
      if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { out.push('<h' + m[1].length + '>' + inline(m[2]) + '</h' + m[1].length + '>'); i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
      if (/^&gt;\s?/.test(l)) {
        const q = []; while (i < lines.length && /^&gt;\s?/.test(lines[i])) q.push(lines[i++].replace(/^&gt;\s?/, ''));
        out.push('<blockquote>' + inline(q.join('<br>')) + '</blockquote>'); continue;
      }
      if (l.includes('|') && isTableSep(lines[i + 1])) {
        const head = cells(l); i += 2; const rows = [];
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
        out.push('<div class="tw"><table><thead><tr>' + head.map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>' +
          rows.map(r => '<tr>' + head.map((_, k) => '<td>' + inline(r[k] || '') + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>');
        continue;
      }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {                       // danh sách (có lồng theo thụt dòng)
        const stack = []; let html = '';
        while (i < lines.length && (/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && stack.length))) {
          const mm = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
          if (!mm) { html += '<br>' + inline(lines[i].trim()); i++; continue; }
          const depth = Math.floor(mm[1].length / 2), tag = /\d/.test(mm[2]) ? 'ol' : 'ul';
          while (stack.length - 1 > depth) { html += '</li></' + stack.pop() + '>'; }
          if (stack.length - 1 === depth) html += '</li>';
          else { html += '<' + tag + '>'; stack.push(tag); }
          html += '<li>' + inline(mm[3]); i++;
        }
        while (stack.length) html += '</li></' + stack.pop() + '>';
        out.push(html); continue;
      }
      const p = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|&gt;|\s*([-*+]|\d+[.)])\s+|\u0001\d+\u0001$)/.test(lines[i]) && !(lines[i].includes('|') && isTableSep(lines[i + 1]))) p.push(lines[i++]);
      if (!p.length) { out.push('<p>' + inline(lines[i++]) + '</p>'); continue; }
      out.push('<p>' + inline(p.join('<br>')) + '</p>');
    }
    return out.join('').replace(/\u0003(\d+)\u0003/g, (_, i) => {
      const x = maths[+i];
      return '<span class="cx-m' + (x.d ? ' cx-m-d' : '') + '">' + esc(x.tex) + '</span>';
    });
  }
  /* ---------- Công thức toán (KaTeX, tải lười từ CDN đã dùng sẵn trong dự án) ---------- */
  const KX_BASE = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/';
  let kxPromise = null;
  function loadKatex() {
    if (window.katex) return Promise.resolve(window.katex);
    if (!kxPromise) kxPromise = new Promise((res, rej) => {
      if (!document.querySelector('link[data-kx]')) {
        const l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = KX_BASE + 'katex.min.css'; l.dataset.kx = '1';
        document.head.appendChild(l);
      }
      const s = document.createElement('script');
      s.src = KX_BASE + 'katex.min.js'; s.async = true;
      s.onload = () => (window.katex ? res(window.katex) : rej(new Error('katex')));
      s.onerror = () => { kxPromise = null; rej(new Error('katex load failed')); };
      document.head.appendChild(s);
    });
    return kxPromise;
  }
  function typesetMath(root) {
    const els = root.querySelectorAll('.cx-m');
    if (!els.length) return;
    els.forEach(el => { if (el.dataset.tex == null) el.dataset.tex = el.textContent; });
    loadKatex().then(k => {
      els.forEach(el => {
        if (el.dataset.done || !el.isConnected) return;
        el.dataset.done = '1';
        try {
          k.render(el.dataset.tex, el, { displayMode: el.classList.contains('cx-m-d'), throwOnError: false, strict: 'ignore' });
        } catch (e) { el.textContent = el.dataset.tex; }
      });
    }).catch(() => {});
  }
  // Một số model nhúng <think>…</think> vào nội dung → tách ra làm "phần suy nghĩ"
  function splitThink(raw) {
    raw = String(raw || ''); let think = '';
    raw = raw.replace(/<think>([\s\S]*?)(<\/think>|$)/gi, (_, t) => { think += t; return ''; });
    return { think: think.trim(), answer: raw.replace(/^\s+/, '') };
  }

  /* ---------- Trạng thái ---------- */
  const S = { threads: [], cur: null, mode: 'general', level: 'auto', skills: [], pend: [], q: '', busy: false, ctl: null, user: '', stick: true };
  try { const l = localStorage.getItem('a3k64-chat-level'); if (LEVELS.some(x => x.key === l)) S.level = l; } catch (e) {}
  try { const m = localStorage.getItem('a3k64-chat-mode'); if (MODES.some(x => x.key === m)) S.mode = m; } catch (e) {}

  /* ---------- Khung giao diện ---------- */
  const root = $('#cx-root');
  root.innerHTML =
    '<div class="cx-app" id="cx-app">' +
      '<div class="cx-scrim" id="cx-scrim"></div>' +
      '<aside class="cx-side">' +
        '<div class="cx-side-head"><button class="cx-new" id="cx-new" type="button"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Cuộc trò chuyện mới</button><input class="cx-search" id="cx-search" type="search" placeholder="Tìm trong lịch sử…" aria-label="Tìm"></div>' +
        '<div class="cx-list cx-scroll" id="cx-list"></div>' +
        '<div class="cx-side-foot" id="cx-sidefoot">Lịch sử chỉ lưu trên thiết bị này.</div>' +
      '</aside>' +
      '<main class="cx-main">' +
        '<header class="cx-head"><button class="cx-menu" id="cx-menu" type="button" aria-label="Danh sách">☰</button><div class="cx-title" id="cx-title">Aris</div><div class="cx-quota" id="cx-quota" hidden></div><button class="cx-exp" id="cx-export" type="button" title="Tải cuộc trò chuyện (.md)" aria-label="Tải về">⤓</button></header>' +
        '<div class="cx-msgs cx-scroll" id="cx-msgs"><div class="cx-col" id="cx-col"></div></div>' +
        '<button class="cx-down" id="cx-down" type="button" aria-label="Xuống cuối" hidden>↓</button>' +
        '<div class="cx-toast" id="cx-toast"></div>' +
        '<div class="cx-modal" id="cx-modal" hidden></div>' +
        '<div class="cx-dock"><div class="cx-dock-in">' +
          '<div class="cx-box" id="cx-box">' +
            '<div class="cx-pend" id="cx-pend" hidden></div>' +
            '<div class="cx-chips" id="cx-chips" hidden></div>' +
            '<div class="cx-row">' +
              '<button class="cx-plus" id="cx-plus" type="button" title="Thêm tệp, chế độ, skill" aria-label="Thêm" aria-haspopup="true" aria-expanded="false"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>' +
              '<textarea class="cx-ta" id="cx-ta" name="aris-msg" rows="1" placeholder="Hỏi Aris điều gì đó…" aria-label="Tin nhắn" autocomplete="off" autocorrect="on" autocapitalize="sentences" spellcheck="false" enterkeyhint="send" data-form-type="other" data-lpignore="true" data-1p-ignore data-bwignore></textarea>' +
              '<input class="cx-ghost" type="text" tabindex="-1" aria-hidden="true" autocomplete="off" name="aris-ghost">' +
              '<button class="cx-lvbtn" id="cx-lvbtn" type="button" title="Mức suy luận" aria-haspopup="true" aria-expanded="false"><b id="cx-lvname"></b><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button>' +
              '<button class="cx-mic" id="cx-mic" type="button" title="Nhập bằng giọng nói" aria-label="Giọng nói" hidden><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>' +
              '<button class="cx-send" id="cx-send" type="button" aria-label="Gửi" disabled><svg class="i-go" viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg><svg class="i-stop" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg></button>' +
            '</div>' +
            '<div class="cx-pop" id="cx-pop-plus" role="menu" hidden></div>' +
            '<div class="cx-pop cx-pop-lv" id="cx-pop-lv" role="menu" hidden></div>' +
          '</div>' +
          '<div class="cx-foot">Aris có thể sai — hãy kiểm tra lại thông tin quan trọng.</div>' +
        '</div></div>' +
        '<input type="file" id="cx-file" multiple hidden accept="image/*,.pdf,.txt,.md,.csv,.tsv,.json,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.h,.cs,.go,.rs,.php,.rb,.html,.css,.xml,.yml,.yaml,.sql,.sh,.log,.ini,.toml,text/*">' +
      '</main>' +
    '</div>';
  const elApp = $('#cx-app'), elList = $('#cx-list'), elMsgs = $('#cx-msgs'), elCol = $('#cx-col'), elTa = $('#cx-ta'), elSend = $('#cx-send'),
        elPend = $('#cx-pend'), elTitle = $('#cx-title'), elFile = $('#cx-file'), elBox = $('#cx-box'), elToast = $('#cx-toast'), elQuota = $('#cx-quota');

  let toastT;
  function toast(msg) { elToast.textContent = msg; elToast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => elToast.classList.remove('show'), 2600); }

  /* ---------- Skill cá nhân (lưu trên máy, theo từng tài khoản) ---------- */
  const SKILL_MAX = 12, SKILL_ACTIVE_MAX = 3, SKILL_NAME_MAX = 40, SKILL_DESC_MAX = 120, SKILL_TEXT_MAX = 2000;
  const SKILL_TEMPLATES = [
    { name: 'Giải thích đơn giản', desc: 'Như cho học sinh lớp 10, có ví dụ đời thường',
      text: 'Khi giải thích một khái niệm, hãy dùng ngôn ngữ đơn giản như đang nói với học sinh lớp 10. Luôn có ít nhất một ví dụ đời thường và một dòng tóm tắt ý chính ở cuối.' },
    { name: 'Chấm bài văn', desc: 'Nhận xét theo bố cục, lập luận, diễn đạt và gợi ý sửa',
      text: 'Khi mình gửi một bài văn/đoạn văn, hãy nhận xét theo 4 mục: bố cục, lập luận, diễn đạt, lỗi chính tả/ngữ pháp. Chỉ ra điểm tốt trước, rồi 3 điểm cần sửa nhất kèm ví dụ viết lại. Không viết lại cả bài.' },
    { name: 'Ôn thi trắc nghiệm', desc: 'Tự đặt câu hỏi để kiểm tra mình, giải thích sau khi mình trả lời',
      text: 'Khi mình nêu một chủ đề, hãy đặt từng câu hỏi trắc nghiệm một (4 đáp án), đợi mình trả lời rồi mới giải thích đúng/sai và đặt câu tiếp theo. Tăng dần độ khó.' },
  ];
  function skillKey() { return 'a3k64-chat-skills-' + (S.user || 'guest'); }
  function loadSkills() {
    try {
      const a = JSON.parse(localStorage.getItem(skillKey()) || '[]');
      S.skills = (Array.isArray(a) ? a : []).filter(x => x && x.id && x.name && x.text).slice(0, SKILL_MAX);
    } catch (e) { S.skills = []; }
  }
  function saveSkills() { try { localStorage.setItem(skillKey(), JSON.stringify(S.skills)); } catch (e) { toast('Không lưu được skill (trình duyệt chặn lưu trữ)'); } }
  const activeSkills = () => S.skills.filter(k => k.on).slice(0, SKILL_ACTIVE_MAX);

  /* ---------- Thanh nhập kiểu Gemini: nút +, menu mức suy luận, chip đang bật ---------- */
  const IC = {
    clip:  '<svg viewBox="0 0 24 24"><path d="M21 12.5 12.6 21a5.5 5.5 0 0 1-7.8-7.8l9-9a3.7 3.7 0 0 1 5.2 5.3l-9 9a1.8 1.8 0 0 1-2.6-2.6l8.3-8.3"/></svg>',
    chat:  '<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg>',
    cap:   '<svg viewBox="0 0 24 24"><path d="m2 9 10-5 10 5-10 5L2 9Z"/><path d="M6 11.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.5"/></svg>',
    pen:   '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>',
    code:  '<svg viewBox="0 0 24 24"><path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/></svg>',
    spark: '<svg viewBox="0 0 24 24"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"/><path d="M19 16v4M17 18h4"/></svg>',
    gear:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
    check: '<svg class="ck" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  };
  const MODE_ICON = { general: IC.chat, tutor: IC.cap, writing: IC.pen, code: IC.code };
  const elPop = $('#cx-pop-plus'), elPopLv = $('#cx-pop-lv'), elChips = $('#cx-chips'), elPlus = $('#cx-plus'), elLvBtn = $('#cx-lvbtn');

  function closePops() {
    elPop.hidden = true; elPopLv.hidden = true;
    elPlus.setAttribute('aria-expanded', 'false'); elLvBtn.setAttribute('aria-expanded', 'false');
  }
  function openPop(which) {
    const pop = which === 'lv' ? elPopLv : elPop, other = which === 'lv' ? elPop : elPopLv, btn = which === 'lv' ? elLvBtn : elPlus;
    other.hidden = true; (which === 'lv' ? elPlus : elLvBtn).setAttribute('aria-expanded', 'false');
    if (!pop.hidden) { closePops(); return; }
    if (which === 'lv') renderLvMenu(); else renderPlusMenu();
    pop.hidden = false; btn.setAttribute('aria-expanded', 'true');
  }
  function renderPlusMenu() {
    const sk = S.skills;
    elPop.innerHTML =
      '<button class="cx-mi" type="button" data-m="upload"><span class="ic">' + IC.clip + '</span><span class="t">Tải ảnh / tệp lên</span></button>' +
      '<div class="cx-sep"></div><div class="cx-mh">Chế độ</div>' +
      MODES.map(m => '<button class="cx-mi' + (S.mode === m.key ? ' on' : '') + '" type="button" data-m="mode:' + m.key + '" title="' + esc(m.hint) + '"><span class="ic">' + MODE_ICON[m.key] + '</span><span class="t">' + esc(m.label) + '</span>' + (S.mode === m.key ? IC.check : '') + '</button>').join('') +
      '<div class="cx-sep"></div><div class="cx-mh">Skill của tôi</div>' +
      (sk.length ? sk.map(k => '<button class="cx-mi" type="button" data-m="skill:' + esc(k.id) + '" title="' + esc(k.desc || '') + '"><span class="ic">' + IC.spark + '</span><span class="t">' + esc(k.name) + '</span><span class="cx-sw' + (k.on ? ' on' : '') + '"></span></button>').join('')
                 : '<div class="cx-mnote">Chưa có skill nào. Skill là hướng dẫn riêng bạn viết sẵn để Aris luôn làm theo.</div>') +
      '<button class="cx-mi" type="button" data-m="manage"><span class="ic">' + (sk.length ? IC.gear : IC.spark) + '</span><span class="t">' + (sk.length ? 'Quản lý skill…' : 'Tạo skill đầu tiên…') + '</span></button>';
  }
  function renderLvMenu() {
    elPopLv.innerHTML = LEVELS.map(l => '<button class="cx-mi cx-mi-lv' + (S.level === l.key ? ' on' : '') + '" type="button" data-lv="' + l.key + '"><span class="t"><b>' + esc(l.label) + '</b><small>' + esc(l.hint) + '</small></span>' + (S.level === l.key ? IC.check : '') + '</button>').join('');
  }
  elPop.addEventListener('click', e => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    const [kind, arg] = b.dataset.m.split(':');
    if (kind === 'upload') { closePops(); elFile.click(); }
    else if (kind === 'mode') { S.mode = arg; try { localStorage.setItem('a3k64-chat-mode', S.mode); } catch (er) {} paintMode(); closePops(); elTa.focus(); }
    else if (kind === 'skill') {
      const k = S.skills.find(x => x.id === arg); if (!k) return;
      if (!k.on && activeSkills().length >= SKILL_ACTIVE_MAX) { toast('Chỉ bật được tối đa ' + SKILL_ACTIVE_MAX + ' skill cùng lúc'); return; }
      k.on = !k.on; saveSkills(); renderPlusMenu(); paintMode();
    }
    else if (kind === 'manage') { closePops(); openSkillModal(); }
  });
  elPopLv.addEventListener('click', e => {
    const b = e.target.closest('[data-lv]'); if (!b) return;
    S.level = b.dataset.lv; try { localStorage.setItem('a3k64-chat-level', S.level); } catch (er) {}
    paintLevel(); closePops(); elTa.focus();
  });
  elPlus.addEventListener('click', e => { e.stopPropagation(); openPop('plus'); });
  elLvBtn.addEventListener('click', e => { e.stopPropagation(); openPop('lv'); });
  document.addEventListener('click', e => { if (!e.target.closest('.cx-pop')) closePops(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closePops(); closeSkillModal(); } });

  function paintLevel() { $('#cx-lvname').textContent = LEVELS.find(l => l.key === S.level).label; elLvBtn.title = 'Mức suy luận — ' + LEVELS.find(l => l.key === S.level).hint; }
  function paintMode() {
    const m = MODES.find(x => x.key === S.mode);
    elTa.placeholder = 'Hỏi Aris điều gì đó…';
    const sk = activeSkills();
    const chips = (S.mode !== 'general' ? ['<span class="cx-chip-on" title="' + esc(m.hint) + '"><i>' + MODE_ICON[S.mode] + '</i>' + esc(m.label) + '<button type="button" data-x="mode" aria-label="Tắt chế độ">×</button></span>'] : [])
      .concat(sk.map(k => '<span class="cx-chip-on sk" title="' + esc(k.desc || k.name) + '"><i>' + IC.spark + '</i>' + esc(k.name) + '<button type="button" data-x="' + esc(k.id) + '" aria-label="Tắt skill">×</button></span>'));
    elChips.hidden = !chips.length; elChips.innerHTML = chips.join('');
  }
  elChips.addEventListener('click', e => {
    const b = e.target.closest('[data-x]'); if (!b) return;
    if (b.dataset.x === 'mode') { S.mode = 'general'; try { localStorage.setItem('a3k64-chat-mode', S.mode); } catch (er) {} }
    else { const k = S.skills.find(x => x.id === b.dataset.x); if (k) { k.on = false; saveSkills(); } }
    paintMode();
  });

  /* ---------- Cửa sổ quản lý skill ---------- */
  const elModal = $('#cx-modal');
  function closeSkillModal() { elModal.hidden = true; elModal.innerHTML = ''; }
  function openSkillModal(view, id) {
    const card = (title, body) => '<div class="cx-modal-card" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="cx-modal-h"><b>' + esc(title) + '</b><button type="button" class="cx-modal-x" data-mc="close" aria-label="Đóng">×</button></div>' + body + '</div>';
    if (view === 'edit') {
      const k = S.skills.find(x => x.id === id) || { name: '', desc: '', text: '' };
      elModal.innerHTML = card(id ? 'Sửa skill' : 'Skill mới',
        '<div class="cx-modal-b">' +
          '<label>Tên skill<input id="sk-name" maxlength="' + SKILL_NAME_MAX + '" placeholder="VD: Gia sư Toán" value="' + esc(k.name) + '"></label>' +
          '<label>Mô tả ngắn <em>(không bắt buộc)</em><input id="sk-desc" maxlength="' + SKILL_DESC_MAX + '" placeholder="Skill này dùng khi nào?" value="' + esc(k.desc || '') + '"></label>' +
          '<label>Hướng dẫn cho Aris<textarea id="sk-text" rows="7" maxlength="' + SKILL_TEXT_MAX + '" placeholder="VD: Luôn gợi ý từng bước, không đưa đáp án ngay. Cuối mỗi câu trả lời, hỏi mình đã hiểu chưa.">' + esc(k.text) + '</textarea></label>' +
          '<div class="cx-count" id="sk-count"></div>' +
        '</div><div class="cx-modal-f"><button type="button" data-mc="back">Quay lại</button><button type="button" class="ok" data-mc="save" data-id="' + esc(id || '') + '">Lưu</button></div>');
      const tx = $('#sk-text'), ct = $('#sk-count'), upd = () => { ct.textContent = tx.value.length + ' / ' + SKILL_TEXT_MAX; };
      tx.addEventListener('input', upd); upd(); $('#sk-name').focus();
    } else {
      elModal.innerHTML = card('Skill cá nhân',
        '<div class="cx-modal-b"><p class="cx-modal-p">Skill là hướng dẫn riêng do bạn viết. Khi bật (tối đa ' + SKILL_ACTIVE_MAX + '), Aris sẽ làm theo ở mọi câu hỏi. Skill chỉ lưu trên thiết bị này.</p>' +
        (S.skills.length ? '<div class="cx-sk-list">' + S.skills.map(k => '<div class="cx-sk"><div class="cx-sk-i"><b>' + esc(k.name) + '</b><span>' + esc(k.desc || k.text.slice(0, 80)) + '</span></div>' +
            '<span class="cx-sw' + (k.on ? ' on' : '') + '" data-mc="tog" data-id="' + esc(k.id) + '" role="switch" aria-checked="' + !!k.on + '" tabindex="0"></span>' +
            '<button type="button" class="cx-ic" data-mc="edit" data-id="' + esc(k.id) + '" title="Sửa">✎</button>' +
            '<button type="button" class="cx-ic danger" data-mc="del" data-id="' + esc(k.id) + '" title="Xoá">🗑</button></div>').join('') + '</div>' : '') +
        (S.skills.length < SKILL_MAX ? '<div class="cx-mh" style="margin:14px 0 6px">Mẫu có sẵn</div><div class="cx-tpls">' + SKILL_TEMPLATES.map((t, i) => '<button type="button" class="cx-tpl" data-mc="tpl" data-i="' + i + '"><b>' + esc(t.name) + '</b><span>' + esc(t.desc) + '</span></button>').join('') + '</div>' : '') +
        '</div><div class="cx-modal-f"><button type="button" data-mc="close">Xong</button>' + (S.skills.length < SKILL_MAX ? '<button type="button" class="ok" data-mc="new">+ Skill mới</button>' : '') + '</div>');
    }
    elModal.hidden = false;
  }
  elModal.addEventListener('click', e => {
    if (e.target === elModal) { closeSkillModal(); paintMode(); return; }
    const b = e.target.closest('[data-mc]'); if (!b) return;
    const act = b.dataset.mc, id = b.dataset.id;
    if (act === 'close') { closeSkillModal(); paintMode(); }
    else if (act === 'back') openSkillModal();
    else if (act === 'new') openSkillModal('edit');
    else if (act === 'edit') openSkillModal('edit', id);
    else if (act === 'tog') {
      const k = S.skills.find(x => x.id === id); if (!k) return;
      if (!k.on && activeSkills().length >= SKILL_ACTIVE_MAX) { toast('Chỉ bật được tối đa ' + SKILL_ACTIVE_MAX + ' skill cùng lúc'); return; }
      k.on = !k.on; saveSkills(); openSkillModal();
    } else if (act === 'del') {
      if (!b.classList.contains('arm')) { b.classList.add('arm'); b.textContent = 'Xoá?'; setTimeout(() => { if (b.isConnected) { b.classList.remove('arm'); b.textContent = '🗑'; } }, 2500); return; }
      S.skills = S.skills.filter(x => x.id !== id); saveSkills(); openSkillModal();
    } else if (act === 'tpl') {
      const t = SKILL_TEMPLATES[+b.dataset.i]; if (!t) return;
      const k = { id: 'k' + uid(), name: t.name, desc: t.desc, text: t.text, on: false };
      S.skills.push(k); saveSkills(); openSkillModal('edit', k.id);
    } else if (act === 'save') {
      const name = $('#sk-name').value.trim().slice(0, SKILL_NAME_MAX), desc = $('#sk-desc').value.trim().slice(0, SKILL_DESC_MAX), text = $('#sk-text').value.trim().slice(0, SKILL_TEXT_MAX);
      if (!name) { toast('Hãy đặt tên cho skill'); $('#sk-name').focus(); return; }
      if (text.length < 10) { toast('Hướng dẫn quá ngắn — hãy mô tả rõ hơn'); $('#sk-text').focus(); return; }
      const k = id && S.skills.find(x => x.id === id);
      if (k) { k.name = name; k.desc = desc; k.text = text; }
      else if (S.skills.length < SKILL_MAX) S.skills.push({ id: 'k' + uid(), name, desc, text, on: false });
      saveSkills(); openSkillModal();
    }
  });
  elModal.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.cx-sw')) { e.preventDefault(); e.target.click(); } });

  /* ---------- Danh sách cuộc trò chuyện ---------- */
  function relGroup(ts) {
    const d = new Date(); d.setHours(0, 0, 0, 0); const day = 864e5;
    if (ts >= d.getTime()) return 'Hôm nay';
    if (ts >= d.getTime() - 6 * day) return '7 ngày qua';
    return 'Cũ hơn';
  }
  function renderList() {
    const q = S.q.trim().toLowerCase();
    const ts = S.threads.filter(t => !q || t.title.toLowerCase().includes(q) || t.messages.some(m => String(m.content || '').toLowerCase().includes(q))).sort((a, b) => (!!b.pinned - !!a.pinned) || (b.updatedAt - a.updatedAt));
    if (!ts.length) { elList.innerHTML = '<div class="cx-empty-list">' + (S.q.trim() ? 'Không tìm thấy kết quả.' : 'Chưa có cuộc trò chuyện nào.<br>Hãy đặt câu hỏi đầu tiên!') + '</div>'; return; }
    let html = '', g = '';
    ts.forEach(t => {
      const gr = t.pinned ? 'Đã ghim' : relGroup(t.updatedAt);
      if (gr !== g) { g = gr; html += '<div class="cx-group">' + gr + '</div>'; }
      html += '<div class="cx-item' + (S.cur && S.cur.id === t.id ? ' on' : '') + '" data-id="' + t.id + '"><div class="cx-item-t">' + esc(t.title) + '</div>' +
        '<div class="cx-item-b"><button class="cx-ic' + (t.pinned ? ' pinned' : '') + '" data-act="pin" title="' + (t.pinned ? 'Bỏ ghim' : 'Ghim') + '" type="button">📌</button><button class="cx-ic" data-act="ren" title="Đổi tên" type="button">✎</button><button class="cx-ic danger" data-act="del" title="Xoá" type="button">🗑</button></div></div>';
    });
    elList.innerHTML = html;
  }
  elList.addEventListener('click', e => {
    const item = e.target.closest('.cx-item'); if (!item) return;
    const t = S.threads.find(x => x.id === item.dataset.id); if (!t) return;
    const act = e.target.closest('[data-act]');
    if (!act) { if (!item.querySelector('input')) openThread(t); return; }
    e.stopPropagation();
    if (act.dataset.act === 'pin') { t.pinned = !t.pinned; dbPut(t); renderList(); return; }
    if (act.dataset.act === 'del') {
      if (!act.classList.contains('arm')) { act.classList.add('arm'); act.textContent = 'Xoá?'; setTimeout(() => { if (act.isConnected) { act.classList.remove('arm'); act.textContent = '🗑'; } }, 2500); return; }
      deleteThread(t);
    } else if (act.dataset.act === 'ren') {
      const box = item.querySelector('.cx-item-t'); box.innerHTML = '<input maxlength="80" value="' + esc(t.title) + '">';
      const inp = box.firstChild; inp.focus(); inp.select();
      const done = ok => { if (ok && inp.value.trim()) { t.title = inp.value.trim().slice(0, 80); dbPut(t); } renderList(); if (S.cur === t) elTitle.textContent = t.title; };
      inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') done(true); else if (ev.key === 'Escape') done(false); });
      inp.addEventListener('blur', () => done(true)); inp.addEventListener('click', ev => ev.stopPropagation());
    }
  });
  async function deleteThread(t) {
    if (S.busy && S.cur === t) stopStream();
    await dbDel(t.id); S.threads = S.threads.filter(x => x !== t);
    if (S.cur === t) newThread(); else renderList();
  }

  /* ---------- Vòng đời cuộc trò chuyện ---------- */
  function newThread() {
    if (S.busy) stopStream();
    S.cur = { id: uid(), user: S.user, title: 'Cuộc trò chuyện mới', level: S.level, updatedAt: Date.now(), messages: [], sid: '', sidAt: 0, sidCalls: 0, fresh: true };
    S.pend = []; renderPend(); renderAll(); renderList(); closeDrawer(); elTa.focus();
  }
  function openThread(t) {
    if (S.busy) stopStream();
    S.cur = t; S.pend = []; renderPend();
    renderAll(); renderList(); closeDrawer(); scrollDown(true);
  }
  function persist(t) { t.updatedAt = Date.now(); if (t.fresh) { delete t.fresh; S.threads.push(t); } dbPut(t); renderList(); }

  /* ---------- Vẽ tin nhắn ---------- */
  function attHtml(a, removable, idx) {
    const x = removable ? '<button class="x" data-rm="' + idx + '" type="button" aria-label="Bỏ">×</button>' : '';
    if (a.kind === 'image') return '<div class="cx-att img"><img src="' + a.data + '" alt="' + esc(a.name) + '">' + (removable ? '<span>' + esc(a.name) + '</span>' : '') + x + '</div>';
    return '<div class="cx-att"><span>' + (a.kind === 'pdf' ? '📕 ' : '📄 ') + esc(a.name) + '</span>' + x + '</div>';
  }
  function msgNode(m, idx, last) {
    const n = document.createElement('div'); n.className = 'cx-msg ' + m.role; n.dataset.i = idx;
    if (m.role === 'user') {
      n.innerHTML = '<div class="cx-body">' + ((m.atts && m.atts.length) ? '<div class="cx-atts">' + m.atts.map(a => attHtml(a, false)).join('') + '</div>' : '') +
        (m.content ? '<div class="cx-bubble">' + esc(m.content) + '</div>' : '') +
        '<div class="cx-meta cx-umeta"><button class="cx-chip" data-a="edit" type="button">Sửa</button></div></div>';
      return n;
    }
    n.innerHTML = '<div class="cx-av">A</div><div class="cx-body"><div class="cx-think" hidden><button class="cx-think-h" type="button"><span class="dot"></span><span class="lbl"></span><span class="chev">▼</span></button>' +
      '<div class="cx-think-b"><div><div class="cx-think-t"></div></div></div></div><div class="cx-ans"></div><div class="cx-extra"></div>' +
      '<div class="cx-meta"><button class="cx-chip" data-a="copy" type="button">Sao chép</button><button class="cx-chip" data-a="redo" type="button">Trả lời lại</button><span class="cx-model"></span></div></div>';
    paintAssistant(n, m);
    return n;
  }
  function paintAssistant(n, m) {
    const { think: t2, answer } = splitThink(m.content);
    let think = ((m.reasoning || '') + (t2 ? '\n' + t2 : '')).trim();
    const tk = n.querySelector('.cx-think'), live = !!m.streaming;
    if (live && !answer && !think) think = 'Đang gửi yêu cầu tới máy chủ…';
    tk.hidden = !think;
    if (think) {
      tk.classList.toggle('live', live && !answer);
      const secs = m.thinkMs ? Math.max(1, Math.round(m.thinkMs / 1000)) : 0;
      tk.querySelector('.lbl').textContent = (live && !answer) ? ('Đang suy nghĩ… ' + Math.max(0, Math.round((Date.now() - (m.ts || Date.now())) / 1000)) + 's') : ('Đã suy nghĩ' + (secs ? ' ' + secs + ' giây' : ''));
      const tt = tk.querySelector('.cx-think-t'); tt.textContent = think; if (live && !answer) tt.scrollTop = tt.scrollHeight;
      if (live && !answer && !tk.dataset.touched) tk.classList.add('open');
      if (answer && !tk.dataset.touched) tk.classList.remove('open');
    }
    const ans = n.querySelector('.cx-ans');
    ans.innerHTML = (live && !answer && !think) ? '<span class="cx-dots"><i></i><i></i><i></i></span>' : md(answer);
    typesetMath(ans);
    ans.classList.toggle('cx-caret', live && !!answer);
    const ex = n.querySelector('.cx-extra'); ex.innerHTML = '';
    if (m.error) {
      ex.innerHTML = '<div class="cx-err">' + esc(m.error) + (m.locked ? '' : '<button data-a="retry" type="button">Thử lại</button>') + '</div>';
    } else if (m.truncated && !live) ex.innerHTML = '<div class="cx-note">Câu trả lời bị cắt vì chạm giới hạn độ dài. <button class="cx-cont" data-a="cont" type="button">Tiếp tục ▸</button></div>';
    n.querySelector('.cx-model').textContent = [LV_LABEL[m.level], m.model && m.model.replace(/:free$/, '').split('/').pop(), m.ttft && (m.ttft / 1000).toFixed(1) + 's'].filter(Boolean).join(' · ');
    n.querySelector('.cx-meta').style.display = live ? 'none' : '';
    n.querySelector('[data-a="redo"]').style.display = n.matches(':last-child') ? '' : 'none';
    if (!live) ans.querySelectorAll('.cx-file[data-kind="html"],.cx-file[data-kind="svg"],.cx-file[data-kind="md"]').forEach(c => { if (c.querySelector('.cx-prev').hidden) buildPreview(c); });   // file xem được → tự hiện preview
  }
  function renderAll() {
    const t = S.cur; elTitle.textContent = t.fresh ? 'Aris' : t.title;
    if (!t.messages.length) {
      elCol.innerHTML = '<div class="cx-hero"><div class="cx-orb">A</div><h1>Xin chào, mình là Aris</h1><p>Hỏi bài tập, nhờ viết lách, code hoặc gửi ảnh và tệp. Bấm dấu + để thêm tệp, chọn chế độ hay bật skill.</p>' +
        '<div class="cx-sugs">' + SUGGESTIONS.map((s, i) => '<button class="cx-sug" type="button" data-s="' + i + '"><span class="ico">' + SUG_ICONS[i] + '</span><b>' + s.t + '</b><span class=\"d\">' + s.d + '</span></button>').join('') + '</div></div>';
      return;
    }
    elCol.innerHTML = '';
    t.messages.forEach((m, i) => elCol.appendChild(msgNode(m, i)));
    refreshRedo();
  }
  function refreshRedo() { elCol.querySelectorAll('.cx-msg.assistant').forEach(n => { const b = n.querySelector('[data-a="redo"]'); if (b) b.style.display = (n === elCol.lastElementChild && !S.busy) ? '' : 'none'; }); }
  elCol.addEventListener('click', e => {
    const sug = e.target.closest('.cx-sug');
    if (sug) { elTa.value = SUGGESTIONS[+sug.dataset.s].p; autosize(); elTa.focus(); return; }
    const th = e.target.closest('.cx-think-h');
    if (th) { const box = th.parentElement; box.dataset.touched = '1'; box.classList.toggle('open'); return; }
    const pv = e.target.closest('[data-prev]');
    if (pv) { buildPreview(pv.closest('.cx-file')); return; }
    const dl = e.target.closest('[data-dl]');
    if (dl) { downloadFile(dl.closest('.cx-file')); return; }
    const cp = e.target.closest('[data-copy]');
    if (cp) { copyText(cp.closest('.cx-code').querySelector('code').textContent, cp); return; }
    const a = e.target.closest('[data-a]'); if (!a) return;
    const node = a.closest('.cx-msg'), m = S.cur.messages[+node.dataset.i];
    if (a.dataset.a === 'copy') copyText(splitThink(m.content).answer, a);
    else if (a.dataset.a === 'redo' || a.dataset.a === 'retry') regenerate();
    else if (a.dataset.a === 'cont') { if (!S.busy) { elTa.value = 'Tiếp tục'; submit(); } }
    else if (a.dataset.a === 'edit') startEdit(node, +node.dataset.i);
  });
  // Sửa tin nhắn đã gửi: bỏ phần hội thoại phía sau rồi hỏi lại (giữ nguyên tệp đính kèm cũ)
  function startEdit(node, idx) {
    if (S.busy) { toast('Hãy đợi Aris trả lời xong hoặc bấm Dừng'); return; }
    const t = S.cur, m = t.messages[idx]; if (!m || m.role !== 'user') return;
    const body = node.querySelector('.cx-body'), bub = body.querySelector('.cx-bubble');
    body.querySelector('.cx-umeta').hidden = true;
    const wrap = document.createElement('div'); wrap.className = 'cx-edit';
    wrap.innerHTML = '<textarea rows="2" maxlength="20000"></textarea><div class="cx-edit-b"><button type="button" data-e="ok" class="ok">Gửi lại</button><button type="button" data-e="no">Huỷ</button></div>';
    if (bub) bub.replaceWith(wrap); else body.appendChild(wrap);
    const ta = wrap.querySelector('textarea'); ta.value = m.content || ''; ta.focus();
    ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 240) + 'px';
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 240) + 'px'; });
    ta.addEventListener('keydown', ev => { if (ev.key === 'Escape') renderAll(); else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) wrap.querySelector('[data-e="ok"]').click(); });
    wrap.addEventListener('click', ev => {
      const b = ev.target.closest('[data-e]'); if (!b) return;
      if (b.dataset.e === 'no') { renderAll(); return; }
      const v = ta.value.trim(); if (!v && !(m.atts || []).length) return;
      m.content = v; t.messages.length = idx + 1;
      t.level = S.level === 'auto' ? pickLevel(v, m.atts, prevLevel(t)) : S.level;
      persist(t); renderAll(); runAnswer(t);
    });
  }
  function copyText(txt, btn) {
    const done = () => { if (!btn) return; const o = btn.textContent; btn.textContent = 'Đã chép ✓'; btn.classList.add('ok'); setTimeout(() => { btn.textContent = o; btn.classList.remove('ok'); }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, () => fallback());
    else fallback();
    function fallback() { const ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Không sao chép được'); } ta.remove(); }
  }

  /* ---------- Cuộn ---------- */
  const elDown = $('#cx-down');
  elMsgs.addEventListener('scroll', () => {
    S.stick = elMsgs.scrollHeight - elMsgs.scrollTop - elMsgs.clientHeight < 90;
    elDown.hidden = S.stick || !(S.cur && S.cur.messages.length);
  });
  elDown.addEventListener('click', () => { S.stick = true; scrollDown(true); elDown.hidden = true; });
  // Người dùng đang chạm/lăn chuột lên trên → ngừng tự bám đáy ngay (tránh bị kéo ngược xuống khi đang stream)
  const unstick = () => { S.stick = false; };
  elMsgs.addEventListener('wheel', e => { if (e.deltaY < 0) unstick(); }, { passive: true });
  elMsgs.addEventListener('touchmove', () => { if (S.busy && elMsgs.scrollHeight - elMsgs.scrollTop - elMsgs.clientHeight > 30) unstick(); }, { passive: true });
  // Ảnh/công thức tải xong làm nội dung cao thêm → nếu đang bám đáy thì cuộn theo
  elMsgs.addEventListener('load', () => scrollDown(), true);
  function scrollDown(force) { if (force || S.stick) { elMsgs.scrollTop = elMsgs.scrollHeight; } }

  /* ---------- Ô nhập ---------- */
  function autosize() { elTa.style.height = 'auto'; elTa.style.height = Math.min(elTa.scrollHeight, 200) + 'px'; updateSend(); }
  function updateSend() {
    const can = !!(elTa.value.trim() || S.pend.length);
    elSend.disabled = !S.busy && !can;
    elSend.classList.toggle('stop', S.busy); elSend.setAttribute('aria-label', S.busy ? 'Dừng' : 'Gửi');
  }
  elTa.addEventListener('input', autosize);
  elTa.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isTouch()) { e.preventDefault(); if (!S.busy) submit(); }
  });
  elSend.addEventListener('click', () => { if (S.busy) stopStream(); else submit(); });
  elFile.addEventListener('change', () => { addFiles(elFile.files); elFile.value = ''; });
  elTa.addEventListener('paste', e => { const fs = [...(e.clipboardData && e.clipboardData.files || [])]; if (fs.length) { e.preventDefault(); addFiles(fs); } });
  ['dragenter', 'dragover'].forEach(ev => elBox.addEventListener(ev, e => { e.preventDefault(); elBox.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => elBox.addEventListener(ev, e => { e.preventDefault(); elBox.classList.remove('drag'); }));
  elBox.addEventListener('drop', e => addFiles(e.dataTransfer.files));
  elPend.addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { S.pend.splice(+b.dataset.rm, 1); renderPend(); } });
  function renderPend() { elPend.hidden = !S.pend.length; elPend.innerHTML = S.pend.map((a, i) => attHtml(a, true, i)).join(''); updateSend(); }

  const readText = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(f); });
  const readData = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
  function shrinkImage(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = Math.min(1, MAX_IMG_SIDE / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('img')); };
      img.src = url;
    });
  }
  async function addFiles(list) {
    for (const f of [...list]) {
      if (S.pend.length >= MAX_ATT) { toast('Tối đa ' + MAX_ATT + ' tệp mỗi tin nhắn'); break; }
      try {
        let a;
        if (/^image\//.test(f.type)) a = { kind: 'image', name: f.name || 'ảnh.jpg', data: await shrinkImage(f) };
        else if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
          if (f.size > MAX_PDF_BYTES) { toast('PDF lớn hơn 14MB, hãy chọn tệp nhỏ hơn'); continue; }
          a = { kind: 'pdf', name: f.name, data: await readData(f) };
        } else if (/^text\//.test(f.type) || TEXT_EXT.test(f.name)) {
          let t = await readText(f); if (t.length > MAX_TEXT_CHARS) { t = t.slice(0, MAX_TEXT_CHARS) + '\n…[đã cắt bớt]'; toast('Tệp dài, chỉ gửi phần đầu'); }
          a = { kind: 'text', name: f.name, text: t };
        } else { toast('Chưa hỗ trợ loại tệp: ' + (f.name || '')); continue; }
        S.pend.push(a); renderPend();
      } catch (e) { toast('Không đọc được: ' + (f.name || 'tệp')); }
    }
    const bin = S.pend.reduce((n, a) => n + (a.data ? a.data.length : 0), 0);
    if (bin > MAX_BIN_CHARS) { S.pend.pop(); renderPend(); toast('Tổng dung lượng đính kèm quá lớn'); }
  }

  /* ---------- Dựng payload gửi server ---------- */
  function toApi(msgs) {
    const binIdx = new Set(msgs.map((m, i) => (m.role === 'user' && (m.atts || []).some(a => a.data)) ? i : -1).filter(i => i >= 0).slice(-3));
    const out = [];
    msgs.forEach((m, i) => {
      if (m.role === 'assistant') { const a = splitThink(m.content).answer.trim(); if (a && !m.error) out.push({ role: 'assistant', content: a }); return; }
      let text = m.content || ''; const parts = [];
      (m.atts || []).forEach(a => {
        if (a.kind === 'text') text += '\n\n[Tệp: ' + a.name + ']\n```\n' + a.text + '\n```';
        else if (a.desc) text += '\n\n[' + (a.kind === 'pdf' ? 'PDF' : 'Ảnh') + ' đính kèm: ' + a.name + ' — AI đã đọc và chuyển thành chữ (có thể sai chi tiết)]\n' + a.desc;   // đã có bản chữ → khỏi gửi lại ảnh, các lượt sau vẫn hiểu ngữ cảnh
        else if (!binIdx.has(i)) text += '\n\n[Đã đính kèm ' + (a.kind === 'pdf' ? 'PDF' : 'ảnh') + ': ' + a.name + ' — không còn trong ngữ cảnh]';
        else if (a.kind === 'image') { a.aid = a.aid || ('a' + uid()); parts.push({ type: 'image_url', image_url: { url: a.data }, aid: a.aid }); }
        else if (a.kind === 'pdf') { a.aid = a.aid || ('a' + uid()); parts.push({ type: 'file', file: { filename: a.name, file_data: a.data }, aid: a.aid }); }
      });
      text = text.trim();
      if (!text && !parts.length) return;
      out.push({ role: 'user', content: parts.length ? [{ type: 'text', text: text || 'Hãy xem tệp đính kèm.' }, ...parts] : text });
    });
    return out;
  }
  function quotaSid(t) {
    const now = Date.now();
    if (!t.sid || now - t.sidAt > SID_MAX_AGE || t.sidCalls >= SID_MAX_CALLS) { t.sid = window.A3AI && window.A3AI.newSession ? window.A3AI.newSession() : 's' + uid(); t.sidAt = now; t.sidCalls = 0; }
    t.sidCalls++; return t.sid;
  }

  /* ---------- Gửi & nhận stream ---------- */
  async function submit() {
    const text = elTa.value.trim(); if ((!text && !S.pend.length) || S.busy) return;
    if (!token()) { toast('Bạn cần đăng nhập để dùng Aris'); return; }
    const t = S.cur;
    t.messages.push({ role: 'user', content: text, atts: S.pend.map(a => ({ ...a })), ts: Date.now() });
    if (t.title === 'Cuộc trò chuyện mới') t.title = (text || (S.pend[0] && S.pend[0].name) || 'Cuộc trò chuyện').replace(/\s+/g, ' ').slice(0, 48);
    t.level = S.level === 'auto' ? pickLevel(text, S.pend, prevLevel(t)) : S.level;
    elTa.value = ''; S.pend = []; renderPend(); autosize();
    persist(t); elTitle.textContent = t.title;
    await runAnswer(t);
  }
  function regenerate() {
    if (S.busy) return; const t = S.cur;
    while (t.messages.length && t.messages[t.messages.length - 1].role === 'assistant') t.messages.pop();
    if (!t.messages.length) return; const lu = t.messages[t.messages.length - 1]; t.level = S.level === 'auto' ? pickLevel(lu.content, lu.atts, prevLevel(t)) : S.level; renderAll(); runAnswer(t);
  }
  function stopStream() { if (S.ctl) S.ctl.abort(); }

  async function runAnswer(t) {
    const a = { role: 'assistant', content: '', reasoning: '', streaming: true, level: t.level, ts: Date.now() };
    t.messages.push(a); renderAll();
    const node = elCol.lastElementChild; S.stick = true; scrollDown(true);
    S.busy = true; S.ctl = new AbortController(); updateSend(); refreshRedo();
    const t0 = Date.now(); let firstAns = 0, raf = 0, dirty = false;
    const paint = () => { raf = 0; if (!dirty) return; dirty = false; paintAssistant(node, a); scrollDown(); };
    const touch = () => { dirty = true; if (!raf) raf = requestAnimationFrame(paint); };
    const tick = setInterval(() => { if (a.streaming && !a.content) touch(); }, 1000);
    touch();
    try {
      const res = await fetch(gasUrl(), {
        method: 'POST', signal: S.ctl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify({ action: 'chatStream', sessionToken: token(), level: t.level, mode: S.mode, skills: activeSkills().map(k => ({ name: k.name, text: k.text })), quotaSession: quotaSid(t), messages: toApi(t.messages.slice(0, -1)) }),
      });
      if (!/event-stream/i.test(res.headers.get('Content-Type') || '')) {
        let j = null; try { j = await res.json(); } catch (e) {}
        const inner = j && j.data && typeof j.data === 'object' ? j.data : j;
        if (inner && inner.locked) { a.locked = true; if (window.A3AI && window.A3AI.showUpgrade) window.A3AI.showUpgrade(inner.error); throw new Error(inner.error || 'Bạn đã hết lượt AI.'); }
        throw new Error((inner && inner.error) || (j && j.error) || ('Lỗi máy chủ (' + res.status + ')'));
      }
      a.model = res.headers.get('X-Chat-Model') || '';
      const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
      const onLine = line => {
        if (line.indexOf('data:') !== 0) return;                       // bỏ dòng chú thích ": OPENROUTER PROCESSING"
        const d = line.slice(5).trim(); if (!d || d === '[DONE]') return;
        let j; try { j = JSON.parse(d); } catch (e) { return; }
        if (j.aris) {                                                  // sự kiện riêng của Aris: mô tả ảnh/PDF, tên model, lỗi sau khi luồng đã mở
          const x = j.aris;
          if (x.model) a.model = x.model;
          if (Array.isArray(x.desc)) x.desc.forEach(dd => { if (dd && dd.aid && typeof dd.text === 'string') t.messages.forEach(mm => (mm.atts || []).forEach(at => { if (at.aid === dd.aid) at.desc = dd.text.slice(0, 24000); })); });
          if (x.error) { if (x.locked) { a.locked = true; if (window.A3AI && window.A3AI.showUpgrade) window.A3AI.showUpgrade(x.error); } throw new Error(x.error); }
          return;
        }
        if (j.error) throw new Error(j.error.message || 'Nhà cung cấp AI báo lỗi');
        const ch = j.choices && j.choices[0]; if (!ch) return;
        const dl = ch.delta || {};
        if (!a.ttft) a.ttft = Date.now() - t0;
        const rs = dl.reasoning || dl.reasoning_content || '';
        if (rs) a.reasoning += rs;
        if (dl.content) { if (!firstAns) { firstAns = Date.now(); a.thinkMs = firstAns - t0; } a.content += dl.content; }
        if (ch.finish_reason === 'length') a.truncated = true;
        touch();
      };
      for (;;) {
        const { done, value } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let k; while ((k = buf.indexOf('\n')) >= 0) { onLine(buf.slice(0, k).replace(/\r$/, '')); buf = buf.slice(k + 1); }
      }
      if (buf) onLine(buf.replace(/\r$/, ''));
      if (!a.content.trim() && !a.reasoning.trim()) throw new Error('Model không trả về nội dung. Hãy thử lại hoặc chọn mức khác.');
      if (!firstAns) a.thinkMs = Date.now() - t0;
    } catch (e) {
      if (e && e.name === 'AbortError') { a.stopped = true; if (!a.content.trim() && !a.reasoning.trim()) a.content = '_Đã dừng._'; }
      else a.error = (e && e.message) || 'Có lỗi xảy ra';
    } finally {
      clearInterval(tick); a.streaming = false; S.busy = false; S.ctl = null; if (raf) cancelAnimationFrame(raf);
      paintAssistant(node, a); refreshRedo(); updateSend(); persist(t); scrollDown();
      if (!a.error) refreshQuota(true);
    }
  }

  /* ---------- Số lượt AI còn lại ---------- */
  function refreshQuota(force) {
    if (!window.A3AI || !A3AI.quotaText) return;
    (force && A3AI.refreshEnt ? A3AI.refreshEnt(0) : Promise.resolve()).then(() => A3AI.quotaText()).then(txt => {
      if (!txt) { elQuota.hidden = true; return; }
      elQuota.hidden = false; elQuota.textContent = txt; elQuota.classList.add('flash'); setTimeout(() => elQuota.classList.remove('flash'), 900);
    }).catch(() => {});
  }

  /* ---------- Nhập bằng giọng nói ---------- */
  (function voice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition, btn = $('#cx-mic');
    if (!SR) return;
    btn.hidden = false;
    let rec = null, base = '';
    function stop() { try { rec && rec.stop(); } catch (e) {} }
    btn.addEventListener('click', () => {
      if (rec) { stop(); return; }
      rec = new SR(); rec.lang = 'vi-VN'; rec.interimResults = true; rec.continuous = false;
      base = elTa.value ? elTa.value.replace(/\s+$/, '') + ' ' : '';
      rec.onresult = ev => { let s = ''; for (let i = 0; i < ev.results.length; i++) s += ev.results[i][0].transcript; elTa.value = base + s; autosize(); };
      rec.onerror = ev => { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') toast('Chưa được cấp quyền micro'); };
      rec.onend = () => { rec = null; btn.classList.remove('rec'); elTa.focus(); };
      try { rec.start(); btn.classList.add('rec'); } catch (e) { rec = null; }
    });
  })();

  /* ---------- Ngăn kéo (mobile) ---------- */
  const closeDrawer = () => elApp.classList.remove('drawer');
  $('#cx-menu').addEventListener('click', () => elApp.classList.add('drawer'));
  $('#cx-scrim').addEventListener('click', closeDrawer);
  $('#cx-new').addEventListener('click', () => { if (S.cur && !S.cur.messages.length) { closeDrawer(); elTa.focus(); } else newThread(); });

  $('#cx-search').addEventListener('input', e => { S.q = e.target.value; renderList(); });
  $('#cx-export').addEventListener('click', () => {
    const t = S.cur; if (!t || !t.messages.length) { toast('Chưa có nội dung để tải'); return; }
    const md = '# ' + t.title + '\n\n' + t.messages.map(m => (m.role === 'user' ? '**Bạn:** ' : '**Aris:** ') + (m.role === 'user' ? m.content + (m.atts && m.atts.length ? '\n\n_(đính kèm: ' + m.atts.map(a => a.name).join(', ') + ')_' : '') : splitThink(m.content).answer)).join('\n\n---\n\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    a.download = (t.title.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 40) || 'aris-chat') + '.md'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  // Làm "nóng" kết nối tới máy chủ (DNS/TLS) khi mở app và khi bấm vào ô nhập → tin đầu tiên khỏi chờ bắt tay
  let warmAt = 0;
  function warm() { const n = Date.now(); if (n - warmAt < 45000 || !gasUrl()) return; warmAt = n; try { fetch(gasUrl(), { method: 'OPTIONS' }).catch(() => {}); } catch (e) {} }
  elTa.addEventListener('focus', warm);

  /* ---------- Khởi động ---------- */
  (async function init() {
    S.user = username() || 'guest';
    db = await dbOpen();
    if (!db) $('#cx-sidefoot').textContent = 'Trình duyệt chặn lưu trữ — lịch sử chỉ giữ tới khi đóng trang.';
    S.threads = await dbAll(S.user);
    loadSkills();
    newThread();
    paintLevel(); paintMode(); autosize(); refreshQuota(false); warm();
  })();
})();
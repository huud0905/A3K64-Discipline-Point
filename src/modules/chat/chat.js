/* ============================================================
   A3K64 — Aris (chat AI)
   • Gọi backend action 'chatStream' (SSE) → server chọn model theo "mức suy luận", giữ khoá OpenRouter bí mật.
   • Lịch sử hội thoại lưu trên máy (IndexedDB, theo từng tài khoản) — kể cả ảnh/tệp đính kèm.
   • Đồng bộ giữa các thiết bị qua server (chatSyncPull/Push/Delete/Ids trong worker.js): tin nhắn dạng chữ lưu trong Turso;
     ảnh/PDF/tệp đính kèm lưu trên Cloudflare R2 (chatFileUpload/Get) nếu server đã gắn R2, trong hạn mức dung lượng theo gói.
   • Lượt AI: mỗi cuộc trò chuyện dùng 1 mã phiên (quotaSession) → xem sessionQuotaGate ở worker.js.
*/
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
  // Ảnh chụp đề (nhiều câu, chữ nhỏ) bị thu quá nhỏ thì AI đọc thiếu chữ → để 1600px (≈1 ảnh 0,2–0,5MB; 10 ảnh thường ~3–7MB chữ base64)
  // MAX_ATT = số tệp tối đa mỗi tin nhắn. MAX_BIN_CHARS = tổng dữ liệu ảnh/PDF của TẤT CẢ tin gửi đi trong 1 lượt (server chặn ở 21 triệu ký tự).
  // MAX_API_ITEMS = tổng số ảnh/PDF gửi kèm trong 1 lượt (gồm cả vài tin trước) — khớp CHAT_OCR_MAX_ITEMS ở worker.js.
  const MAX_ATT = 10, MAX_API_ITEMS = 16, MAX_IMG_SIDE = 1600, MAX_PDF_BYTES = 1024 * 1024 * 1024, MAX_TEXT_CHARS = 40000, MAX_BIN_CHARS = 1500000000;  const TEXT_EXT = /\.(txt|md|csv|tsv|json|js|jsx|ts|tsx|py|java|c|cpp|h|cs|go|rs|php|rb|html|css|xml|yml|yaml|sql|sh|log|ini|toml)$/i;  const SID_MAX_AGE = 18 * 60 * 1000, SID_MAX_CALLS = 36;       // < TTL 20 phút / 40 lệnh của server

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
  const esc = s => window.a3k64EscapeHtml(s);   // dùng chung — xem shared/esc.js
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

  /* ---------- Lưu trữ (IndexedDB, có dự phòng bộ nhớ tạm) ---------- [P1-35, P1-37 Fix] */
  let db = null;
  let dbPromise = null;
  const mem = new Map();
  function dbOpen() {
    if (db) return Promise.resolve(db);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(resolve => {
      try {
        const r = indexedDB.open('a3k64-chat-v1', 1);
        r.onupgradeneeded = () => {
          const store = r.result.createObjectStore('threads', { keyPath: 'id' });
          if (!store.indexNames.contains('user')) {
            store.createIndex('user', 'user', { unique: false });
          }
        };
        r.onsuccess = () => {
          db = r.result;
          db.onversionchange = () => {
            try { db.close(); } catch (_) {}
            db = null;
          };
          resolve(db);
        };
        r.onerror = () => resolve(null);
        r.onblocked = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return dbPromise;
  }
  const req2p = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function dbAll(user) {
    const openedDb = await dbOpen();
    if (!openedDb) return [...mem.values()].filter(t => t.user === user);
    try {
      return await req2p(openedDb.transaction('threads', 'readonly').objectStore('threads').index('user').getAll(user));
    } catch (e) {
      return [...mem.values()].filter(t => t.user === user);
    }
  }
  async function dbPut(t) {
    mem.set(t.id, t);
    const openedDb = await dbOpen();
    if (!openedDb) return;
    try {
      await req2p(openedDb.transaction('threads', 'readwrite').objectStore('threads').put(JSON.parse(JSON.stringify(t, (k, v) => (k === 'streaming' ? undefined : v)))));
    } catch (e) { /* hết dung lượng → bỏ qua */ }
  }
  async function dbDel(id) {
    mem.delete(id);
    const openedDb = await dbOpen();
    if (!openedDb) return;
    try {
      await req2p(openedDb.transaction('threads', 'readwrite').objectStore('threads').delete(id));
    } catch (e) {}
  }
  /* ---------- Kho sách OCR (IndexedDB: a3k64_aris_books / books) ---------- */
  let bookDb = null;
  let bookDbPromise = null;  let bookDbDisabled = false;
  const bookMem = window._arisBookMemCache = window._arisBookMemCache || new Map();
  const bookFiles = new Map();
  const bookJobs = new Map();
  const BOOK_OCR_BATCH = 6;
  const BOOK_CTX_MAX_CHARS = 90000;

  function disableBookDb() {
    bookDbDisabled = true;
    const old = bookDb;
    bookDb = null;
    try { if (old) old.close(); } catch (_) {}
  }

  function bookDbOpen() {
    if (bookDbDisabled) return Promise.resolve(null);
    if (bookDb) return Promise.resolve(bookDb);
    if (bookDbPromise) return bookDbPromise;
    bookDbPromise = new Promise(resolve => {
      let settled = false;
      let timer;
      const finish = value => {
        if (settled) {
          if (value) { try { value.close(); } catch (_) {} }
          return;
        }
        settled = true;
        clearTimeout(timer);
        if (!value) bookDbDisabled = true;
        resolve(value);
      };
      timer = setTimeout(() => finish(null), 3000);
      try {
        const idb = window.indexedDB;
        if (!idb) { finish(null); return; }
        const r = idb.open('a3k64_aris_books', 1);
        r.onupgradeneeded = () => {
          try {
            if (!r.result.objectStoreNames.contains('books')) {
              r.result.createObjectStore('books', { keyPath: 'bookKey' });
            }
          } catch (_) {
            try { r.transaction.abort(); } catch (_) {}
            finish(null);
          }
        };
        r.onsuccess = () => {
          try {
            const opened = r.result;
            if (!settled) {
              bookDb = opened;
              opened.onversionchange = () => disableBookDb();
            }
            finish(opened);
          } catch (_) { finish(null); }
        };
        r.onerror = () => finish(null);
        r.onblocked = () => finish(null);
      } catch (_) { finish(null); }
    });
    return bookDbPromise;
  }

  function bookRequest(mode, operation) {
    return new Promise(resolve => {
      let settled = false;
      let timer;
      const finish = (ok, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!ok) disableBookDb();
        resolve(ok ? value : null);
      };
      timer = setTimeout(() => finish(false), 3000);
      try {
        const tx = bookDb.transaction('books', mode);
        tx.onabort = () => finish(false);
        tx.onerror = () => finish(false);
        const store = tx.objectStore('books');
        const request = operation(store);
        let result = null;
        request.onsuccess = () => {
          try {
            result = request.result;
            if (mode !== 'readwrite') finish(true, result);
          } catch (_) { finish(false); }
        };
        request.onerror = () => finish(false);
        if (mode === 'readwrite') tx.oncomplete = () => finish(true, result);
      } catch (_) { finish(false); }
    });
  }

  async function bookGet(bookKey) {
    if (!bookKey) return null;
    try {
      const opened = await bookDbOpen();
      if (opened && bookDb) {
        const rec = await bookRequest('readonly', store => store.get(bookKey));
        if (rec) bookMem.set(bookKey, rec);
      }
    } catch (_) { disableBookDb(); }
    return bookMem.get(bookKey) || null;
  }

  async function bookPut(rec) {
    if (!rec || !rec.bookKey) return;
    bookMem.set(rec.bookKey, rec);
    try {
      const opened = await bookDbOpen();
      if (opened && bookDb) {
        await bookRequest('readwrite', store => store.put(JSON.parse(JSON.stringify(rec))));
      }
    } catch (_) { disableBookDb(); }
  }  const BOOK_STOP_WORDS = new Set([
    'là', 'của', 'và', 'có', 'cho', 'trong', 'với', 'các', 'những', 'này', 'đó', 'được', 'không',
    'một', 'người', 'khi', 'về', 'từ', 'theo', 'như', 'để', 'hãy', 'giúp', 'mình', 'tôi', 'bạn',
    'aris', 'cuốn', 'sách', 'trang', 'chương', 'phần', 'nào', 'gì', 'sao', 'thế', 'nêu', 'trình',
    'bày', 'giải', 'thích', 'tóm', 'tắt', 'viết', 'đọc', 'nội', 'dung', 'câu', 'hỏi',
    'the', 'and', 'for', 'with', 'what', 'how', 'why', 'about', 'from', 'this', 'that', 'are', 'was', 'were'
  ]);
  function summarizeBookPage(text, maxLen) {
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return '[Trang trống]';
    const headings = lines.filter(l => /^(chương|phần|bài|mục|chapter|part|unit|lesson|section|\d+(\.\d+)*[.)])\b/i.test(l) || (l.length <= 70 && l === l.toUpperCase() && /\p{L}/u.test(l)));
    const headStr = headings.slice(0, 2).join(' | ');
    const bodyStr = lines.filter(l => !headings.includes(l)).join(' ');
    const combined = (headStr ? '[' + headStr + '] ' : '') + bodyStr;
    return combined.length > maxLen ? combined.slice(0, Math.max(24, maxLen - 1)).trim() + '…' : combined;
  }
  function buildBookContext(rec, question, limit) {
    const maxChars = limit || BOOK_CTX_MAX_CHARS;
    const pages = (rec && rec.pages) || {};
    const pageNums = Object.keys(pages).map(Number).filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
    if (!pageNums.length) return '';
    const totalPages = rec.totalPages || pageNums[pageNums.length - 1] || pageNums.length;
    const entries = pageNums.map(p => {
      const raw = String(pages[p] || '').trim();
      return { p, raw, block: '[Trang ' + p + '/' + totalPages + ']\n' + (raw || '[Trang trống]') };
    });
    const full = entries.map(e => e.block).join('\n\n');
    if (full.length <= maxChars) return full;

    const qLower = String(question || '').toLowerCase();
    const words = [...new Set((qLower.match(/[\p{L}\p{N}]+/gu) || []).filter(w => w.length >= 2 && !BOOK_STOP_WORDS.has(w)))];
    const chapRefs = [...qLower.matchAll(/(?:chương|phần|bài|mục|chapter|part|unit|trang|page)\s*(\d+|[ivxlcdm]+)/gi)].map(m => m[0]);
    const rawScores = entries.map((e, idx) => {
      const lower = e.raw.toLowerCase();
      let sc = (idx < 4 || /mục lục|table of contents/i.test(lower)) ? 8 : 0;
      for (const w of words) {
        const hits = lower.split(w).length - 1;
        if (hits > 0) sc += 3 + Math.min(5, hits);
      }
      for (const cr of chapRefs) {
        if (lower.includes(cr)) sc += 15;
      }
      return sc;
    });
    const scores = rawScores.map((s, i) => s + (i > 0 ? rawScores[i - 1] * 0.35 : 0) + (i + 1 < rawScores.length ? rawScores[i + 1] * 0.35 : 0));
    const hasSignal = scores.some(s => s > 0);
    const fullBudget = Math.floor(maxChars * 0.72);
    const chosen = new Set();
    let chosenChars = 0;

    if (hasSignal) {
      const ranked = entries.map((_, i) => i).sort((a, b) => (scores[b] - scores[a]) || (a - b));
      for (const i of ranked) {
        const len = entries[i].block.length + 2;
        if (chosenChars + len <= fullBudget) {
          chosen.add(i);
          chosenChars += len;
        }
      }
    } else {
      const step = Math.max(1, Math.floor(entries.length / 24));
      for (let i = 0; i < entries.length; i += step) {
        const len = entries[i].block.length + 2;
        if (chosenChars + len <= fullBudget) {
          chosen.add(i);
          chosenChars += len;
        }
      }
    }

    const header = '[Sách dài ' + full.length.toLocaleString('vi-VN') + ' ký tự (> ' + maxChars.toLocaleString('vi-VN') + ') — ưu tiên ' + chosen.size + '/' + entries.length + ' trang khớp câu hỏi và tóm tắt các phần còn lại]\n\n';
    const remBudget = Math.max(2000, maxChars - header.length - chosenChars - 200);
    const remCount = Math.max(1, entries.length - chosen.size);
    const perRem = Math.max(70, Math.min(360, Math.floor(remBudget / remCount)));

    const out = [header];
    let sumUsed = 0;
    let i = 0;
    while (i < entries.length) {
      if (chosen.has(i)) {
        out.push(entries[i].block);
        i++;
        continue;
      }
      const start = i;
      const lines = [];
      while (i < entries.length && !chosen.has(i)) {
        if (sumUsed < remBudget) {
          const snip = summarizeBookPage(entries[i].raw, perRem);
          const line = '• Tr.' + entries[i].p + ': ' + snip;
          if (sumUsed + line.length + 1 <= remBudget) {
            lines.push(line);
            sumUsed += line.length + 1;
          }
        }
        i++;
      }
      const end = i - 1;
      const label = entries[start].p === entries[end].p
        ? '[Tóm tắt trang ' + entries[start].p + ']'
        : '[Tóm tắt các trang ' + entries[start].p + '–' + entries[end].p + ']';
      out.push(label + '\n' + (lines.length ? lines.join('\n') : '(Đã rút gọn do giới hạn độ dài ngữ cảnh)'));
    }
    return out.join('\n\n').slice(0, maxChars);
  }
  async function loadBookContexts(msgs) {
    const map = new Map();
    let lastQuestion = '';
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user' && msgs[i].content) { lastQuestion = String(msgs[i].content); break; }
    }
    const keys = new Set();
    msgs.forEach(m => {
      if (m.role !== 'user') return;
      (m.atts || []).forEach(a => { if (a && a.bookKey) keys.add(a.bookKey); });
    });
    for (const k of keys) {
      const rec = await bookGet(k);
      const count = rec && rec.pages ? Object.keys(rec.pages).length : 0;
      if (count > 0) {
        const text = buildBookContext(rec, lastQuestion, BOOK_CTX_MAX_CHARS);
        if (text) map.set(k, { text, readCount: count, totalPages: rec.totalPages || 0 });
      }
    }
    return map;
  }
  /* ---------- Markdown an toàn (tự viết, không phụ thuộc thư viện) ---------- */
  // Chỉ dựng lại các phần tử và thuộc tính được phép từ cây HTML đã phân tích.
  function sanitizeChatHtml(html) {
    if (!html) return '';

    const allowedTags = new Set([
      'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'code', 'pre',
      'blockquote', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr',
      'th', 'td', 'a', 'img', 'span', 'div', 'h1', 'h2', 'h3', 'h4',
      'h5', 'h6', 'hr'
    ]);
    const dropContents = new Set([
      'script', 'iframe', 'object', 'embed', 'svg', 'math', 'style',
      'link', 'form', 'input', 'button', 'textarea', 'select', 'base',
      'meta', 'template'
    ]);
    const allowedClasses = new Set(['tw', 'cx-m', 'cx-m-d']);
    const htmlNamespace = 'http://www.w3.org/1999/xhtml';

    function safeUrl(value, tag) {
      const url = value.trim();
      // Không chấp nhận ký tự điều khiển hoặc khoảng trắng bên trong URL.
      if (!url || /[\u0000-\u0020\u007f]/.test(url)) return false;
      if (/^https?:\/\//i.test(url)) {
        try {
          const parsed = new URL(url);
          return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !!parsed.hostname;
        } catch (_) { return false; }
      }
      if (tag === 'a' && /^mailto:/i.test(url)) return true;
      return tag === 'img' &&
        /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[a-z0-9+/]+={0,2}$/i.test(url);
    }

    try {
      const parsed = new DOMParser().parseFromString(String(html), 'text/html');
      const output = document.createElement('div');
      const pending = [{ source: parsed.body, target: output }];

      while (pending.length) {
        const { source, target } = pending.pop();
        for (const node of source.childNodes) {
          if (node.nodeType === 3) {
            target.appendChild(document.createTextNode(node.data));
            continue;
          }
          if (node.nodeType !== 1 || node.namespaceURI !== htmlNamespace) continue;

          const tag = node.localName;
          if (dropContents.has(tag)) continue;
          if (!allowedTags.has(tag)) {
            // Thẻ không được phép bị loại cùng toàn bộ nội dung bên trong.
            continue;
          }

          const clean = document.createElement(tag);
          const classes = (node.getAttribute('class') || '').split(/\s+/)
            .filter(name => allowedClasses.has(name));
          if ((tag === 'span' || tag === 'div') && classes.length) {
            clean.className = classes.join(' ');
          }

          if (tag === 'a') {
            const href = node.getAttribute('href');
            if (href && safeUrl(href, tag)) {
              clean.setAttribute('href', href.trim());
              clean.setAttribute('target', '_blank');
              clean.setAttribute('rel', 'noopener noreferrer');
            }
          } else if (tag === 'img') {
            const src = node.getAttribute('src');
            if (src && safeUrl(src, tag)) clean.setAttribute('src', src.trim());
            if (node.hasAttribute('alt')) clean.setAttribute('alt', node.getAttribute('alt'));
          }

          target.appendChild(clean);
          pending.push({ source: node, target: clean });
        }
      }
      return output.innerHTML;
    } catch (_) {
      // Nếu không thể phân tích hoặc dựng lại cây, không render HTML đầu vào.
      return '';
    }
  }
  function inline(s) {
    const codes = [];
    s = s.replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
      const safeUrl = esc(url.replace(/["'<>]/g, ''));
      return '<a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer">' + esc(label) + '</a>';
    });
    s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
         .replace(/(^|[^*])\*([^*\s][^*\n]*?)\*(?!\*)/g, '$1<em>$2</em>')
         .replace(/~~([^~\n]+?)~~/g, '<s>$1</s>');    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => '<code>' + esc(codes[i]) + '</code>');
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

  // Một số model (vd Nemotron "Chuyên gia") viết luôn bản nháp suy nghĩ bằng tiếng Anh vào NỘI DUNG trả lời thay vì kênh "reasoning".
  // Nhận diện bản nháp đó để đưa vào khung "Đã suy nghĩ" (thu gọn), chỉ hiện phần trả lời thật ở ngoài.
  const COT_RE = /\b(but wait|wait,|hmm|let me|let's|i need to|we need to|we should|we are (asked|given)|the user (is|wants|asks|asked|said)|actually,|alternatively|this seems|that works|let's check|double-check|so the (answer|approach|plan))\b/gi;
  const COT_OPEN = /^\s*(hmm|let me|let's|we need to|we are (asked|given)|i need to|the user (is|wants|asks|asked)|but wait|wait[,:]|first,? (i|let|we)|so,? (we|i|the))\b/i;
  const VI_CH = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/gi;
  function cotHits(t) { const k = t.match(COT_RE); return k ? k.length : 0; }
  function viRatio(t) { const L = (t.match(/\p{L}/gu) || []).length; return L ? (t.match(VI_CH) || []).length / L : 0; }
  function leakSplit(txt, m) {
    if (!txt || txt.length < 40) return null;
    const live = !!m.streaming, hits = cotHits(txt.slice(0, 2500)), strong = COT_OPEN.test(txt.slice(0, 120));
    if (viRatio(txt.slice(0, 500)) >= 0.01) return null;                    // mở đầu đã là tiếng Việt → trả lời thật
    if (!(hits >= 3 || (strong && (hits >= 1 || live)) || txt.length >= 600)) return null;      // không giống bản nháp (hoặc đoạn dài, không mở đầu bằng tiếng Việt → coi là nháp)
    const ps = txt.split(/\n{2,}/);
    let last = -1;                                                          // đoạn nháp cuối cùng
    ps.forEach((q, i) => { const h = cotHits(q); if (h >= 2 || (h >= 1 && q.length >= 150 && viRatio(q) < 0.01) || COT_OPEN.test(q)) last = i; });
    let b = -1;
    for (let i = last + 1; i < ps.length; i++) { if (ps[i].length >= 30 && viRatio(ps[i]) >= 0.04) { b = i; break; } }
    if (b < 0) {
      if (!m.truncated && !m.stopped && !live) return null;                               // đã xong, không thấy phần trả lời tiếng Việt → có thể đây là câu trả lời tiếng Anh thật: giữ nguyên
      return { think: txt.trim(), answer: '', onlyThink: true };            // đang viết dở hoặc bị cắt khi còn nháp → toàn bộ là suy nghĩ
    }
    return { think: ps.slice(0, b).join('\n\n').trim(), answer: ps.slice(b).join('\n\n').replace(/^\s+/, ''), onlyThink: false };
  }
  function splitMsg(m) {
    const s = splitThink(m.content), lk = m.role === 'assistant' ? leakSplit(s.answer, m) : null;
    if (!lk) return { think: s.think, answer: s.answer, onlyThink: false };
    return { think: (s.think ? s.think + '\n' : '') + lk.think, answer: lk.answer, onlyThink: lk.onlyThink };
  }

  /* ---------- Quản lý tùy chọn Aris (Preferences) ---------- */
  const PREFS_KEY = 'a3k64_aris_prefs';
  const DEFAULT_ARIS_PREFS = {
    defaultLevel: 'auto',
    defaultMode: 'general',
    fontSize: 'md',
    readingWidth: 'normal',
    fontFamily: 'sans',
    showThinking: true,
    autoScroll: true,
    customInstruction: '',
    voiceLang: 'vi-VN',
    ttsRate: 1.0,
  };
  function loadArisPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      return Object.assign({}, DEFAULT_ARIS_PREFS, raw ? JSON.parse(raw) : {});
    } catch (_) { return Object.assign({}, DEFAULT_ARIS_PREFS); }
  }
  let arisPrefs = loadArisPrefs();
  let cloudSyncTimer = null;
  let saveStatusTimer = null;
  function showSettingsSaved() {
    if (!elSettingsModal || elSettingsModal.hidden) return;
    const el = elSettingsModal.querySelector('#aris-settings-save-status');
    if (!el) return;
    el.classList.add('show');
    if (saveStatusTimer) clearTimeout(saveStatusTimer);
    saveStatusTimer = setTimeout(() => { if (el) el.classList.remove('show'); }, 2000);
  }
  async function syncArisPrefsToCloud() {
    if (!token() || S.user === 'guest' || typeof gasUrl !== 'function' || !gasUrl()) return;
    try {
      await syncCall({ action: 'savePersonalization', personalization: { arisPrefs } });
    } catch (_) {}
  }
  async function loadArisPrefsFromCloud() {
    if (!token() || S.user === 'guest' || typeof gasUrl !== 'function' || !gasUrl()) return;
    try {
      const res = await syncCall({ action: 'getPersonalization' });
      const p = res?.personalization;
      if (p && p.arisPrefs && typeof p.arisPrefs === 'object') {
        arisPrefs = Object.assign({}, DEFAULT_ARIS_PREFS, arisPrefs, p.arisPrefs);
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(arisPrefs)); } catch (_) {}
        applyArisPrefs();
        if (elSettingsModal && !elSettingsModal.hidden) renderSettingsTab();
      }
    } catch (_) {}
  }
  function saveArisPrefs(patch) {
    arisPrefs = Object.assign({}, arisPrefs, patch);
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(arisPrefs)); } catch (_) {}
    applyArisPrefs();
    showSettingsSaved();
    if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
    cloudSyncTimer = setTimeout(syncArisPrefsToCloud, 1500);
  }
  function applyArisPrefs() {
    if (elApp) {
      elApp.dataset.fontSize = arisPrefs.fontSize || 'md';
      elApp.dataset.fontFamily = arisPrefs.fontFamily || 'sans';
      elApp.dataset.showThinking = String(arisPrefs.showThinking !== false);
    }
    if (elCol) {
      elCol.dataset.width = arisPrefs.readingWidth || 'normal';
    }
  }
  /* ---------- Trạng thái ---------- */
  const S = { threads: [], cur: null, mode: arisPrefs.defaultMode || 'general', level: arisPrefs.defaultLevel || 'auto', skills: [], libOn: [], pend: [], q: '', busy: false, ctl: null, user: '', stick: true };
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
        '<header class="cx-head"><button class="cx-menu" id="cx-menu" type="button" aria-label="Danh sách">☰</button><div class="cx-title" id="cx-title">Aris</div><div class="cx-quota" id="cx-quota" hidden></div><button class="cx-exp" id="cx-export" type="button" title="Tải cuộc trò chuyện (.md)" aria-label="Tải về">⤓</button><button class="cx-exp cx-settings-btn" id="aris-settings-btn" type="button" title="Cài đặt AI Aris" aria-label="Cài đặt">⚙️</button></header>' +
        '<div class="cx-msgs cx-scroll" id="cx-msgs"><div class="cx-col" id="cx-col"></div></div>' +
        '<button class="cx-down" id="cx-down" type="button" aria-label="Xuống cuối" hidden>↓</button>' +
        '<div class="cx-toast" id="cx-toast"></div>' +
        '<div class="cx-modal" id="cx-modal" hidden></div>' +
        '<div class="cx-view" id="cx-view" hidden></div>' +
        '<div class="aris-settings-modal" id="aris-settings-modal" hidden></div>' +
        '<div class="cx-dock"><div class="cx-dock-in">' +
          '<div class="cx-box" id="cx-box">' +            '<div class="cx-pend" id="cx-pend" hidden></div>' +
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
  const SKILL_MAX = 12, SKILL_ACTIVE_MAX = 4, SKILL_NAME_MAX = 40, SKILL_DESC_MAX = 120, SKILL_TEXT_MAX = 2000;
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
  // Thư viện skill dựng sẵn (chat-skills.js): bật/tắt lưu theo tài khoản, không tính vào giới hạn SKILL_MAX của skill cá nhân
  const LIB = () => (Array.isArray(window.A3ChatSkills) ? window.A3ChatSkills : []);
  const libKey = () => 'a3k64-chat-libskills-' + (S.user || 'guest');
  function loadLib() { try { const a = JSON.parse(localStorage.getItem(libKey()) || '[]'); S.libOn = Array.isArray(a) ? a.filter(id => LIB().some(k => k.id === id)) : []; } catch (e) { S.libOn = []; } }
  function saveLib() { try { localStorage.setItem(libKey(), JSON.stringify(S.libOn)); } catch (e) { toast('Không lưu được skill (trình duyệt chặn lưu trữ)'); } }
  const activeSkills = () => S.skills.filter(k => k.on).concat(LIB().filter(k => (S.libOn || []).indexOf(k.id) >= 0)).slice(0, SKILL_ACTIVE_MAX);
  const isActiveSkill = id => activeSkills().some(k => k.id === id);

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
      '<button class="cx-mi" type="button" data-m="manage"><span class="ic">' + (sk.length ? IC.gear : IC.spark) + '</span><span class="t">' + (sk.length ? 'Quản lý skill…' : 'Tạo skill đầu tiên…') + '</span></button>' +
      (LIB().length ? '<button class="cx-mi" type="button" data-m="lib"><span class="ic">' + IC.spark + '</span><span class="t">Thư viện skill (' + LIB().length + ')…</span>' + ((S.libOn || []).length ? '<span class="cx-mcount">' + S.libOn.length + ' đang bật</span>' : '') + '</button>' : '');
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
    else if (kind === 'lib') { closePops(); openSkillModal('lib'); }
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

  function paintLevel() { const _lv = LEVELS.find(l => l.key === S.level) || LEVELS[0]; $('#cx-lvname').textContent = _lv.label; elLvBtn.title = 'Mức suy luận — ' + _lv.hint; }
  function paintMode() {
    const m = MODES.find(x => x.key === S.mode) || MODES[0];
    elTa.placeholder = 'Hỏi Aris điều gì đó…';
    const sk = activeSkills();
    const chips = (S.mode !== 'general' && m ? ['<span class="cx-chip-on" title="' + esc(m.hint) + '"><i>' + MODE_ICON[S.mode] + '</i>' + esc(m.label) + '<button type="button" data-x="mode" aria-label="Tắt chế độ">×</button></span>'] : [])
      .concat(sk.map(k => '<span class="cx-chip-on sk" title="' + esc(k.desc || k.name) + '"><i>' + IC.spark + '</i>' + esc(k.name) + '<button type="button" data-x="' + esc(k.id) + '" aria-label="Tắt skill">×</button></span>'));
    elChips.hidden = !chips.length; elChips.innerHTML = chips.join('');
  }
  elChips.addEventListener('click', e => {
    const b = e.target.closest('[data-x]'); if (!b) return;
    if (b.dataset.x === 'mode') { S.mode = 'general'; try { localStorage.setItem('a3k64-chat-mode', S.mode); } catch (er) {} }
    else { const k = S.skills.find(x => x.id === b.dataset.x); if (k) { k.on = false; saveSkills(); } else if ((S.libOn || []).indexOf(b.dataset.x) >= 0) { S.libOn = S.libOn.filter(i => i !== b.dataset.x); saveLib(); } }
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
    } else if (view === 'lib') {
      const cats = []; LIB().forEach(k => { if (cats.indexOf(k.cat) < 0) cats.push(k.cat); });
      elModal.innerHTML = card('Thư viện skill',
        '<div class="cx-modal-b"><p class="cx-modal-p">Skill dựng sẵn giúp Aris làm việc như một gia sư, biên tập viên hay lập trình viên. Bật tối đa ' + SKILL_ACTIVE_MAX + ' skill cùng lúc (tính cả skill cá nhân); Aris sẽ làm theo ở mọi câu hỏi tới khi bạn tắt.</p>' +
        '<input class="cx-sk-q" id="lib-q" type="search" placeholder="Tìm skill…" aria-label="Tìm skill" autocomplete="off">' +
        cats.map(c => '<div class="cx-mh lib-cat" style="margin:12px 0 6px">' + esc(c) + '</div><div class="cx-sk-list lib-grp">' + LIB().filter(k => k.cat === c).map(k => '<div class="cx-sk lib-it" data-q="' + esc((k.name + ' ' + k.desc + ' ' + k.cat).toLowerCase()) + '"><div class="cx-sk-i"><b>' + esc(k.name) + '</b><span>' + esc(k.desc) + '</span></div>' +
            '<span class="cx-sw' + ((S.libOn || []).indexOf(k.id) >= 0 ? ' on' : '') + '" data-mc="libtog" data-id="' + esc(k.id) + '" role="switch" aria-checked="' + ((S.libOn || []).indexOf(k.id) >= 0) + '" tabindex="0"></span></div>').join('') + '</div>').join('') +
        '</div><div class="cx-modal-f"><button type="button" data-mc="close">Xong</button><button type="button" class="ok" data-mc="manage">Skill cá nhân…</button></div>');
      const q = $('#lib-q');
      q.addEventListener('input', () => {
        const v = q.value.trim().toLowerCase();
        elModal.querySelectorAll('.lib-it').forEach(el => { el.hidden = !!v && el.dataset.q.indexOf(v) < 0; });
        elModal.querySelectorAll('.lib-grp').forEach(g => { const any = !!g.querySelector('.lib-it:not([hidden])'); g.hidden = !any; g.previousElementSibling.hidden = !any; });
      });
    } else {
      elModal.innerHTML = card('Skill cá nhân',
        '<div class="cx-modal-b"><p class="cx-modal-p">Skill là hướng dẫn riêng do bạn viết. Khi bật (tối đa ' + SKILL_ACTIVE_MAX + '), Aris sẽ làm theo ở mọi câu hỏi. Skill cá nhân chỉ lưu trên thiết bị này.</p>' +
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
    else if (act === 'manage') openSkillModal();
    else if (act === 'libtog') {
      const on = (S.libOn || []).indexOf(id) >= 0;
      if (!on && activeSkills().length >= SKILL_ACTIVE_MAX) { toast('Chỉ bật được tối đa ' + SKILL_ACTIVE_MAX + ' skill cùng lúc'); return; }
      S.libOn = on ? S.libOn.filter(i => i !== id) : (S.libOn || []).concat(id); saveLib();
      b.classList.toggle('on', !on); b.setAttribute('aria-checked', String(!on));
    }
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
    if (act.dataset.act === 'pin') { t.pinned = !t.pinned; markDirty(t); dbPut(t); renderList(); return; }
    if (act.dataset.act === 'del') {
      if (!act.classList.contains('arm')) { act.classList.add('arm'); act.textContent = 'Xoá?'; setTimeout(() => { if (act.isConnected) { act.classList.remove('arm'); act.textContent = '🗑'; } }, 2500); return; }
      deleteThread(t);
    } else if (act.dataset.act === 'ren') {
      const box = item.querySelector('.cx-item-t'); box.innerHTML = '<input maxlength="80" value="' + esc(t.title) + '">';
      const inp = box.firstChild; inp.focus(); inp.select();
      const done = ok => { if (ok && inp.value.trim()) { t.title = inp.value.trim().slice(0, 80); markDirty(t); dbPut(t); } renderList(); if (S.cur === t) elTitle.textContent = t.title; };
      inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') done(true); else if (ev.key === 'Escape') done(false); });
      inp.addEventListener('blur', () => done(true)); inp.addEventListener('click', ev => ev.stopPropagation());
    }
  });
  async function deleteThread(t) {
    if (S.busy && S.cur === t) stopStream();
    await dbDel(t.id); S.threads = S.threads.filter(x => x !== t); queueRemoteDelete(t.id);
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
  function persist(t) { t.updatedAt = Date.now(); if (t.fresh) { delete t.fresh; S.threads.push(t); } markDirty(t); dbPut(t); renderList(); }


  /* ---------- Đồng bộ lịch sử giữa các thiết bị ----------
     Lưu trên server: tiêu đề, ghim, tin nhắn dạng chữ (Turso); ảnh/PDF/tệp đính kèm tải lên R2 (nếu bật) và chỉ gửi mã tệp `fid` trong tin nhắn.
     KHÔNG gửi phần "suy nghĩ" của AI. Xung đột: bản có `rev` (mốc sửa) mới hơn thắng. Xoá được báo lên server để thiết bị khác xoá theo. */
  const sKey = k => 'a3k64-chat-sync-' + k + '-' + (S.user || 'guest');
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const syncOn = () => lsGet(sKey('off'), '') !== '1';
  const SY = { running: false, again: false, timer: 0, state: '', usage: null, noR2: false, quotaToast: false };
  function pendDel() { try { const a = JSON.parse(lsGet(sKey('del'), '[]')); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function markDirty(t) { t.rev = Date.now(); t.dirty = true; scheduleSync(2500); }
  function queueRemoteDelete(id) { const a = pendDel(); if (a.indexOf(id) < 0) a.push(id); lsSet(sKey('del'), JSON.stringify(a.slice(-200))); scheduleSync(800); }
  function scheduleSync(ms) { if (!syncOn()) return; clearTimeout(SY.timer); SY.timer = setTimeout(runSync, ms || 0); }
  const fmtMB = b => { const m = b / 1048576; return (m >= 100 ? Math.round(m) : m.toFixed(1)) + ' MB'; };
  function paintSync() {
    const el = $('#cx-sidefoot'); if (!el) return;
    const on = syncOn();
    el.innerHTML = '<span>' + (!on ? 'Đồng bộ đang tắt — lịch sử chỉ lưu trên thiết bị này.' : (SY.state || 'Đồng bộ giữa các thiết bị.')) + (on && SY.usage ? '<br>Lưu trữ ảnh/tệp: ' + fmtMB(SY.usage.used) + ' / ' + fmtMB(SY.usage.limit) : '') + '</span> <button type="button" class="cx-synctg" id="cx-synctg">' + (on ? 'Tắt' : 'Bật') + '</button>';
  }
  async function syncCall(body) {
    const r = await fetch(gasUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }, body: JSON.stringify(Object.assign({ sessionToken: token() }, body)) });
    const j = await r.json(); const d = j && j.data && typeof j.data === 'object' ? j.data : j;
    if (!d || d.ok === false) { const er = new Error((d && d.error) || 'Đồng bộ lỗi'); er.data = d || null; throw er; }
    return d;
  }
  // Bản nhẹ để gửi lên: bỏ toàn bộ dữ liệu ảnh/tệp, chỉ giữ tên tệp + bản chữ AI đã đọc.
  function slimMsgs(msgs) {
    return msgs.filter(m => !m.error && !m.streaming && (m.role === 'user' || m.role === 'assistant')).map(m => {
      const o = { role: m.role, content: String(m.content || ''), ts: m.ts };
      if (m.role === 'assistant') { o.level = m.level; o.model = m.model; if (m.truncated && splitMsg(m).answer.trim()) o.truncated = true; }
      else if (m.atts && m.atts.length) o.atts = m.atts.map(a => ({ name: a.name, kind: a.kind, fid: a.fid || '', desc: typeof a.desc === 'string' ? a.desc : '' }));
      return o;
    });
  }  function mergeMsgs(local, remote) {     // giữ lại tin local trùng (còn ảnh/tệp gốc), phần còn lại lấy từ server
    const idx = new Map(); local.forEach(m => idx.set(m.role + '|' + m.ts, m));
    return remote.map(r => { const l = idx.get(r.role + '|' + r.ts); return (l && l.content === r.content) ? l : r; });
  }
  function applyRemote(r) {
    const local = S.threads.find(x => x.id === r.id);
    if (r.deleted) {
      if (!local || (local.dirty && (local.rev || 0) > r.rev)) return false;
      if (S.busy && S.cur === local) return false;
      S.threads = S.threads.filter(x => x !== local); dbDel(local.id);
      if (S.cur === local) newThread();
      return true;
    }
    const last = r.messages.length ? (r.messages[r.messages.length - 1].ts || r.rev) : r.rev;
    if (!local) {
      if (!r.messages.length) return false;
      const lvl = [...r.messages].reverse().map(m => m.level).find(Boolean) || S.level;
      const t = { id: r.id, user: S.user, title: r.title || 'Cuộc trò chuyện', pinned: !!r.pinned, level: lvl === 'auto' ? 'balanced' : lvl, updatedAt: last, rev: r.rev, messages: r.messages.map(m => m.atts ? Object.assign({}, m, { atts: m.atts.map(a => Object.assign({ kind: 'gone' }, a)) }) : m), sid: '', sidAt: 0, sidCalls: 0 };
      S.threads.push(t); dbPut(t); return true;
    }
    if (r.rev > (local.rev || 0)) {
      if (S.busy && S.cur === local) return false;
      local.title = r.title || local.title; local.pinned = !!r.pinned; local.rev = r.rev; local.updatedAt = last; delete local.dirty;
      local.messages = mergeMsgs(local.messages, r.messages.map(m => m.atts ? Object.assign({}, m, { atts: m.atts.map(a => Object.assign({ kind: 'gone' }, a)) }) : m));
      dbPut(local); if (S.cur === local) { renderAll(); elTitle.textContent = local.title; }
      return true;
    }
    return false;
  }
  /* ---------- Ảnh/tệp trên R2 ---------- */
  async function fileBlob(fid) {
    const r = await fetch(gasUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }, body: JSON.stringify({ action: 'chatFileGet', sessionToken: token(), id: fid }) });
    if (/json/i.test(r.headers.get('Content-Type') || '')) { const j = await r.json(); const d = (j && j.data) || j; throw new Error((d && d.error) || 'Không tải được tệp'); }
    if (!r.ok) throw new Error('Lỗi máy chủ (' + r.status + ')');
    return r.blob();
  }
  const blobToUrl = b => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(b); });
  function hydrateFiles(n, m) {      // ảnh của tin nhắn đồng bộ từ máy khác: tải từ R2 khi hiển thị
    (m.atts || []).forEach(a => {
      if (a.kind !== 'image' || a.data || !a.fid) return;
      const img = n.querySelector('img[data-fid="' + a.fid + '"]'); if (!img) return;
      fileBlob(a.fid).then(blobToUrl).then(url => { a.data = url; if (img.isConnected) img.src = url; })
        .catch(() => { const box = img.parentElement; if (box && box.isConnected) box.innerHTML = '<span>🖼 ' + esc(a.name) + ' (không tải được)</span>'; });
    });
  }
  async function uploadAtt(t, a) {
    const body = { action: 'chatFileUpload', threadId: t.id, name: a.name || 'tep' };
    if (a.kind === 'text') body.text = String(a.text);
    else { const mm = /^data:([^;,]+);base64,(.*)$/.exec(a.data || ''); if (!mm) { a.noStore = true; return false; } body.mime = mm[1]; body.b64 = mm[2]; }
    try {
      const d = await syncCall(body);
      a.fid = d.id; if (SY.usage) { SY.usage.used = d.used; SY.usage.limit = d.limit; }
      return true;
    } catch (e) {
      const d = e && e.data;
      if (d && d.nor2) SY.noR2 = true;                                  // server chưa gắn R2 → khỏi thử nữa trong phiên này
      else if (d) { a.noStore = true; if (d.quota && !SY.quotaToast) { SY.quotaToast = true; toast(d.error); } }   // lỗi nghiệp vụ (hết dung lượng, quá lớn…) → giữ tệp trên máy này, không thử lại
      return false;                                                     // lỗi mạng: để lần đồng bộ sau thử lại
    }
  }
  async function runSync() {
    if (!syncOn() || !token() || S.user === 'guest' || !gasUrl()) return;
    if (SY.running) { SY.again = true; return; }
    SY.running = true; SY.again = false; SY.state = 'Đang đồng bộ…'; paintSync();
    try {
      const dels = pendDel();
      if (dels.length) { await syncCall({ action: 'chatSyncDelete', ids: dels.slice(0, 50) }); lsSet(sKey('del'), JSON.stringify(pendDel().filter(id => dels.slice(0, 50).indexOf(id) < 0))); }
      let since = Number(lsGet(sKey('srv'), '0')) || 0, guard = 0, changed = false;
      for (;;) {
        const d = await syncCall({ action: 'chatSyncPull', since });
        d.threads.forEach(r => { if (applyRemote(r)) changed = true; });
        if (d.maxSrv > since) since = d.maxSrv;
        if (!d.more || ++guard > 30) break;
      }
      lsSet(sKey('srv'), String(since));
      // Cuộc đã đồng bộ trước đó (không còn chỉnh sửa dở) mà server không còn → đã bị xoá ở thiết bị khác → xoá cục bộ theo
      const idsR = await syncCall({ action: 'chatSyncIds' }); const live = new Set(idsR.ids || []);
      if (idsR.files) SY.usage = idsR.files;
      const gone = S.threads.filter(t => !t.dirty && t.rev != null && !live.has(t.id) && !(S.busy && t === S.cur));
      if (gone.length) {
        gone.forEach(t => dbDel(t.id)); const curGone = gone.indexOf(S.cur) >= 0;
        S.threads = S.threads.filter(t => gone.indexOf(t) < 0); changed = true;
        if (curGone) newThread();
      }
      const dirty = S.threads.filter(t => t.dirty && t.messages.length && !(S.busy && t === S.cur)).sort((a, b) => (a.rev || 0) - (b.rev || 0));
      if (!SY.noR2) for (const t of dirty) {              // tải ảnh/tệp mới lên R2 trước khi đẩy tin nhắn (tin chỉ mang mã tệp)
        let up = false;
        for (const m of t.messages) for (const a of (m.atts || [])) {
          if (SY.noR2 || a.fid || a.noStore || !(a.data || a.text != null)) continue;
          if (await uploadAtt(t, a)) up = true;
        }
        if (up) dbPut(t);
      }
      for (let i = 0; i < dirty.length; i += 8) {
        const batch = dirty.slice(i, i + 8), sent = batch.map(t => t.rev);
        await syncCall({ action: 'chatSyncPush', threads: batch.map(t => ({ id: t.id, title: t.title, pinned: !!t.pinned, rev: t.rev, messages: slimMsgs(t.messages) })) });
        batch.forEach((t, k) => { if (t.rev === sent[k]) { delete t.dirty; dbPut(t); } });
      }
      if (changed) renderList();
      const n = new Date(); SY.state = 'Đã đồng bộ ' + String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
    } catch (e) { SY.state = 'Chưa đồng bộ được — sẽ thử lại.'; }
    SY.running = false; paintSync();
    if (SY.again) scheduleSync(1500);
  }
  document.addEventListener('click', e => {
    if (!e.target.closest || !e.target.closest('#cx-synctg')) return;
    const on = syncOn(); lsSet(sKey('off'), on ? '1' : '0'); SY.state = '';
    if (on) clearTimeout(SY.timer); else scheduleSync(0);
    paintSync();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleSync(300); });
  // BUG-16: Quản lý timer bằng singleton handle chống leak timer khi reload
  if (window._a3ChatSyncInterval) {
    clearInterval(window._a3ChatSyncInterval);
  }
  window._a3ChatSyncInterval = setInterval(() => { if (!document.hidden && !S.busy) scheduleSync(0); }, 60000);

  /* ---------- Vẽ tin nhắn ---------- */
  function bookChipState(a) {
    const total = Number(a.totalPages) || 0;
    const job = a.bookKey ? bookJobs.get(a.bookKey) : null;
    const rec = a.bookKey ? bookMem.get(a.bookKey) : null;
    const savedCount = rec && rec.pages ? Object.keys(rec.pages).length : (Number(a.bookDone) || 0);
    const doneCount = Math.min(total || savedCount, savedCount);
    const pct = total > 0 ? Math.max(0, Math.min(100, Math.round(doneCount / total * 100))) : 0;
    if (job && job.running) {
      return { running: true, done: false, pct: job.pct != null ? job.pct : pct, label: job.label || ('Đang đọc trang ' + Math.min(total, doneCount + 1) + '/' + total + '...') };
    }
    if (total > 0 && doneCount >= total) {
      return { running: false, done: true, pct: 100, label: '✓ Đã đọc cả cuốn (' + total + ' trang)' };
    }
    return { running: false, done: false, pct, label: '📖 Đọc cả cuốn' + (total ? ' (' + total + ' trang)' : '') };  }
  function updateBookChipUI(bookKey) {
    if (!bookKey) return;
    document.querySelectorAll('.cx-att-book').forEach(el => {
      if (el.dataset.bookKey !== bookKey) return;
      const btn = el.querySelector('.cx-book-btn');
      const bar = el.querySelector('.cx-book-bar');
      const prog = el.querySelector('.cx-book-prog');
      const total = Number(el.dataset.totalPages) || 0;
      const st = bookChipState({ bookKey, totalPages: total, bookDone: Number(el.dataset.bookDone) || 0 });
      if (btn) {
        btn.textContent = st.label;
        btn.disabled = st.running;
        btn.classList.toggle('running', st.running);
        btn.classList.toggle('done', st.done);
      }
      if (bar) bar.style.width = st.pct + '%';
      if (prog) prog.setAttribute('aria-valuenow', String(st.pct));
    });
  }
  function refreshBookChips(atts) {
    (atts || []).forEach(a => {
      if (!a || !a.bookKey) return;
      bookGet(a.bookKey).then(rec => {
        if (rec && rec.pages) {
          a.bookDone = Object.keys(rec.pages).length;
          updateBookChipUI(a.bookKey);
        }
      }).catch(() => {});
    });
  }
  function attHtml(a, removable, idx, mi) {
    const x = removable ? '<button class="x" data-rm="' + idx + '" type="button" aria-label="Bỏ">×</button>' : '';
    const vw = ' data-view="' + idx + '" data-vm="' + (removable ? 'p' : mi) + '" title="Bấm để xem"';       // bấm vào để xem ảnh / tệp (khay chờ gửi: vm=p)
    if (a.kind === 'image' && a.data) return '<div class="cx-att img"' + vw + '><img src="' + a.data + '" alt="' + esc(a.name) + '">' + (removable ? '<span>' + esc(a.name) + '</span>' : '') + x + '</div>';
    if (a.kind === 'image' && a.fid) return '<div class="cx-att img lazy"' + vw + '><img data-fid="' + esc(a.fid) + '" alt="' + esc(a.name) + '"></div>';        // ảnh trên R2: tải khi hiển thị
    if (a.kind === 'pdf' && a.bookKey) {      const ui = bookChipState(a);
      return '<div class="cx-att cx-att-book" data-book-key="' + esc(a.bookKey) + '" data-total-pages="' + esc(String(a.totalPages)) + '" data-book-done="' + esc(String(a.bookDone || 0)) + '"' + vw + '>' +
        '<div class="cx-att-top"><span>📕 ' + esc(a.name) + '</span>' + x + '</div>' +
        '<div class="cx-book-ctrl">' +
          '<button type="button" class="cx-book-btn' + (ui.done ? ' done' : '') + (ui.running ? ' running' : '') + '" data-book-ocr="' + esc(a.bookKey) + '"' + (ui.running ? ' disabled' : '') + '>' + esc(ui.label) + '</button>' +
          '<div class="cx-book-prog" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + ui.pct + '"><div class="cx-book-bar" style="width:' + ui.pct + '%"></div></div>' +
        '</div>' +
      '</div>';
    }
    return '<div class="cx-att"' + vw + '><span>' + (a.kind === 'pdf' ? '📕 ' : '📄 ') + esc(a.name) + '</span>' + x + '</div>';
  }
  function msgNode(m, idx, last) {
    const n = document.createElement('div'); n.className = 'cx-msg ' + m.role; n.dataset.i = idx;
    if (m.role === 'user') {
      n.innerHTML = '<div class="cx-body">' + ((m.atts && m.atts.length) ? '<div class="cx-atts">' + m.atts.map((a, ai) => attHtml(a, false, ai, idx)).join('') + '</div>' : '') +
        (m.content ? '<div class="cx-bubble">' + esc(m.content) + '</div>' : '') +
        '<div class="cx-meta cx-umeta"><button class="cx-chip" data-a="edit" type="button">Sửa</button></div></div>';
      hydrateFiles(n, m);
      refreshBookChips(m.atts);
      return n;
    }    n.innerHTML = '<div class="cx-av">A</div><div class="cx-body"><details class="cx-think" hidden><summary class="cx-think-h"><span class="dot"></span><span class="lbl"></span></summary>' +
      '<div class="cx-think-b"><div class="cx-think-t"></div></div></details><div class="cx-ans"></div><div class="cx-extra"></div>' +
      '<div class="cx-meta"><button class="cx-chip" data-a="copy" type="button">Sao chép</button><button class="cx-chip" data-a="speak" type="button">Đọc</button><button class="cx-chip" data-a="redo" type="button">Trả lời lại</button><span class="cx-model"></span></div></div>';    paintAssistant(n, m);
    return n;

  function paintAssistant(n, m) {
    const { think: t2, answer, onlyThink } = splitMsg(m);
    let think = ((m.reasoning || '') + (t2 ? '\n' + t2 : '')).trim();
    const tk = n.querySelector('.cx-think'), live = !!m.streaming;
    const rawText = think, rawLen = think.length;      // dòng trạng thái đơn giản ở tiêu đề; nội dung suy luận thô chỉ hiện khi người dùng bấm mở
    if (live && !answer && !think) think = 'x';
    tk.hidden = !think;
    tk.classList.toggle('empty', !rawLen);               // chưa có nội dung thô → chưa bấm mở được
    if (think) {
      tk.classList.toggle('live', live && !answer);
      const secs = m.thinkMs ? Math.max(1, Math.round(m.thinkMs / 1000)) : 0;
      const stage = !rawLen ? 'Đang gửi yêu cầu tới máy chủ' : rawLen < 600 ? 'Đang đọc và hiểu đề' : rawLen < 2500 ? 'Đang phân tích và lên hướng giải' : rawLen < 7000 ? 'Đang tính toán từng bước' : 'Đang kiểm tra lại kết quả';
      tk.querySelector('.lbl').textContent = (live && !answer) ? (stage + '… ' + Math.max(0, Math.round((Date.now() - (m.ts || Date.now())) / 1000)) + 's') : ('Đã suy nghĩ' + (secs ? ' ' + secs + ' giây' : ''));
      const tt = tk.querySelector('.cx-think-t');
      const isOpen = tk.open;
      if (isOpen || tt.dataset.n !== String(rawLen)) { tt.textContent = rawText; tt.dataset.n = String(rawLen); if (live && !answer && isOpen) tt.scrollTop = tt.scrollHeight; }
    }
    const ans = n.querySelector('.cx-ans');
    if (!live && !answer && m.error) {
      ans.innerHTML = '<div class="cx-empty-error"><span class="cx-err-icon">⚠️</span> ' + esc(m.error) + '</div>';
    } else {
      ans.innerHTML = (live && !answer && !think) ? '<span class="cx-dots"><i></i><i></i><i></i></span>' : sanitizeChatHtml(md(answer));
    }
    typesetMath(ans);    ans.classList.toggle('cx-caret', live && !!answer);
    const ex = n.querySelector('.cx-extra'); ex.innerHTML = '';
    const hasAns = !!answer.trim();
    if (m.error) {
      ex.innerHTML = '<div class="cx-err">' + esc(m.error) + (m.locked ? '' : '<button data-a="retry" type="button">Thử lại</button>') + '</div>';
    } else if (m.truncated && !live && hasAns) {
      ex.innerHTML = '<div class="cx-note">Câu trả lời bị cắt vì chạm giới hạn độ dài. <button class="cx-cont" data-a="cont" type="button">Tiếp tục ▸</button></div>';
    }    n.querySelector('.cx-model').textContent = [LV_LABEL[m.level], m.model && m.model.replace(/:free$/, '').split('/').pop(), m.ttft && (m.ttft / 1000).toFixed(1) + 's'].filter(Boolean).join(' · ');
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
    const bk = e.target.closest('[data-book-ocr]');
    if (bk) { e.stopPropagation(); startBookOcr(bk.dataset.bookOcr); return; }
    const vw = e.target.closest('[data-view]');
    if (vw) { const m = S.cur.messages[+vw.dataset.vm]; if (m && m.atts) openView(m.atts, +vw.dataset.view); return; }    const dlf = e.target.closest('[data-dlf]');
    if (dlf) {
      fileBlob(dlf.dataset.dlf).then(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = dlf.dataset.name || 'tep'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }).catch(er => toast(er.message || 'Không tải được tệp'));
      return;
    }
    const pv = e.target.closest('[data-prev]');
    if (pv) { buildPreview(pv.closest('.cx-file')); return; }
    const dl = e.target.closest('[data-dl]');
    if (dl) { downloadFile(dl.closest('.cx-file')); return; }
    const cp = e.target.closest('[data-copy]');
    if (cp) { copyText(cp.closest('.cx-code').querySelector('code').textContent, cp); return; }
    const a = e.target.closest('[data-a]'); if (!a) return;
    const node = a.closest('.cx-msg'), m = S.cur.messages[+node.dataset.i];
    if (a.dataset.a === 'copy') copyText(splitMsg(m).answer, a);
    else if (a.dataset.a === 'speak') {
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { toast('Trình duyệt không hỗ trợ đọc phản hồi'); return; }
      const text = splitMsg(m).answer.trim();
      if (!text) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = arisPrefs.voiceLang || 'vi-VN';
      utterance.rate = Number(arisPrefs.ttsRate) || 1;
      window.speechSynthesis.speak(utterance);
    }
    else if (a.dataset.a === 'redo' || a.dataset.a === 'retry') regenerate();    else if (a.dataset.a === 'final') regenerate(true);
    else if (a.dataset.a === 'cont') {
      if (!S.busy) {
        const msgs = S.cur.messages;
        const lastMsg = msgs[msgs.length - 1];
        const lastAns = lastMsg && lastMsg.role === 'assistant' ? splitMsg(lastMsg).answer.trim() : '';
        if (!lastAns) {
          // Nếu bong bóng trợ lý trước đó rỗng nội dung → xóa bong bóng đó và tạo lại câu trả lời trực tiếp cho câu hỏi gốc
          regenerate(true);
        } else {
          elTa.value = 'Tiếp tục'; S.cont = true; submit();
        }
      }
    }    else if (a.dataset.a === 'edit') startEdit(node, +node.dataset.i);
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
  function scrollDown(force) { if (force || (arisPrefs.autoScroll !== false && S.stick)) { elMsgs.scrollTop = elMsgs.scrollHeight; } }
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
  elPend.addEventListener('click', e => {
    const b = e.target.closest('[data-rm]');
    if (b) {
      const removed = S.pend.splice(+b.dataset.rm, 1)[0];
      if (removed && removed.bookKey) {
        const job = bookJobs.get(removed.bookKey);
        if (job && job.running && !S.pend.some(x => x.bookKey === removed.bookKey)) {
          job.aborted = true;
          if (job.controller) job.controller.abort();
        }
      }
      renderPend();
      return;
    }
    const bk = e.target.closest('[data-book-ocr]');
    if (bk) { e.stopPropagation(); startBookOcr(bk.dataset.bookOcr); return; }
    const v = e.target.closest('[data-view]'); if (v) openView(S.pend, +v.dataset.view);
  });  function renderPend() { elPend.hidden = !S.pend.length; elPend.innerHTML = S.pend.map((a, i) => attHtml(a, true, i)).join(''); updateSend(); }
  const readText = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(f); });
  const readData = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
  let pdfJsPromise = null;
  async function ensurePdfJs() {
    if (!window.pdfjsLib) {
      if (!pdfJsPromise) {
        pdfJsPromise = new Promise((resolve, reject) => {
          const s = document.createElement('script');
          let settled = false;
          const finish = err => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            s.onload = s.onerror = null;
            if (err) { s.remove(); reject(err); }
            else resolve();
          };
          const timer = setTimeout(() => finish(new Error('pdf.js load timeout')), 10000);
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
          s.onload = () => window.pdfjsLib ? finish() : finish(new Error('Cannot load pdf.js'));
          s.onerror = () => finish(new Error('Cannot load pdf.js'));
          try { document.head.appendChild(s); } catch (e) { finish(e); }
        }).catch(e => { pdfJsPromise = null; throw e; });
      }
      await pdfJsPromise;
    }
    if (!window.pdfjsLib) throw new Error('Cannot load pdf.js');
    if (window.pdfjsLib.GlobalWorkerOptions) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }  function extractOcrPageResults(res, batch) {
    const out = {};
    const pObj = res && (res.pages || res.texts);
    if (Array.isArray(pObj)) {
      pObj.forEach((it, idx) => {
        if (!it || typeof it !== 'object') return;
        const p = Number(it.page != null ? it.page : (it.pageNum != null ? it.pageNum : (batch[idx] && batch[idx].page)));
        if (p > 0) out[p] = String(it.text != null ? it.text : (it.content != null ? it.content : ''));
      });
    } else if (pObj && typeof pObj === 'object') {
      Object.keys(pObj).forEach(k => {
        const p = Number(k);
        if (p > 0) out[p] = String(pObj[k] != null ? pObj[k] : '');
      });
    } else if (res && Array.isArray(res.results)) {
      res.results.forEach((it, idx) => {
        if (!it || typeof it !== 'object') return;
        const p = Number(it.page != null ? it.page : (it.pageNum != null ? it.pageNum : (batch[idx] && batch[idx].page)));
        if (p > 0) out[p] = String(it.text != null ? it.text : (it.content != null ? it.content : ''));
      });
    } else if (res && typeof res.text === 'string' && batch.length === 1) {
      out[batch[0].page] = res.text;
    }
    return out;
  }
  function syncBookAttachmentCount(bookKey, doneCount) {
    let touched = false;
    S.pend.forEach(a => { if (a && a.bookKey === bookKey) a.bookDone = doneCount; });
    if (S.cur && Array.isArray(S.cur.messages)) {
      S.cur.messages.forEach(m => (m.atts || []).forEach(a => {
        if (a && a.bookKey === bookKey) { a.bookDone = doneCount; touched = true; }
      }));
    }
    if (touched && S.cur && !S.cur.fresh) dbPut(S.cur);
  }
  async function startBookOcr(bookKey) {
    if (!bookKey) return;
    const prevJob = bookJobs.get(bookKey);
    if (prevJob && prevJob.running) return;
    if (!token() || !gasUrl()) { toast('Bạn cần đăng nhập để Aris đọc cả cuốn sách'); return; }
    const file = bookFiles.get(bookKey);
    if (!file) { toast('Hãy đính kèm lại tệp PDF này để tiếp tục đọc'); return; }

    let objUrl = null;
    let loadingTask = null;
    const controller = new AbortController();
    const job = { running: true, aborted: false, label: 'Đang chuẩn bị…', pct: 0, controller };
    bookJobs.set(bookKey, job);
    updateBookChipUI(bookKey);

    try {
      await ensurePdfJs();
      objUrl = URL.createObjectURL(file);
      loadingTask = window.pdfjsLib.getDocument({ url: objUrl, disableWorker: true, disableRange: false, disableStream: false });
      const pdf = await loadingTask.promise;
      const totalPages = pdf.numPages || 1;
      let rec = await bookGet(bookKey);
      if (!rec) {
        rec = { bookKey, fileName: file.name, fileSize: file.size, totalPages, pages: {}, updatedAt: Date.now() };
      } else {
        rec = Object.assign({}, rec, {
          fileName: file.name,
          fileSize: file.size,
          totalPages,
          pages: Object.assign({}, rec.pages || {})
        });
      }
      const todo = [];
      for (let p = 1; p <= totalPages; p++) {
        if (rec.pages[p] == null) todo.push(p);
      }
      if (!todo.length) {
        job.running = false;
        job.pct = 100;
        syncBookAttachmentCount(bookKey, totalPages);
        updateBookChipUI(bookKey);
        return;
      }

      for (let i = 0; i < todo.length; i += BOOK_OCR_BATCH) {
        if (job.aborted || controller.signal.aborted) break;
        const slice = todo.slice(i, i + BOOK_OCR_BATCH);
        const batch = [];
        for (const p of slice) {
          if (job.aborted || controller.signal.aborted) break;
          const doneNow = Object.keys(rec.pages).length;
          job.label = 'Đang đọc trang ' + p + '/' + totalPages + '...';
          job.pct = Math.round(doneNow / totalPages * 100);
          updateBookChipUI(bookKey);

          const page = await pdf.getPage(p);
          let canvas = null;
          try {
            const viewport = page.getViewport({ scale: 1.15 });
            canvas = document.createElement('canvas');
            canvas.width = Math.round(viewport.width);
            canvas.height = Math.round(viewport.height);
            const ctx = canvas.getContext('2d');
            if (ctx) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
            await page.render({ canvasContext: ctx, viewport }).promise;
            const imgData = canvas.toDataURL('image/jpeg', 0.7);
            if (imgData && imgData.startsWith('data:image/jpeg')) {
              batch.push({ page: p, data: imgData });
            }
          } finally {
            if (canvas) { canvas.width = 0; canvas.height = 0; canvas = null; }
            page.cleanup();
          }
        }
        if (!batch.length || job.aborted || controller.signal.aborted) break;

        const batchLast = batch[batch.length - 1].page;
        job.label = 'Đang đọc trang ' + batchLast + '/' + totalPages + '...';
        updateBookChipUI(bookKey);

        const res = await syncCall({
          action: 'chatOcrPages',
          bookKey,
          fileName: file.name,
          totalPages,
          pages: batch
        }, controller.signal);
        const parsed = extractOcrPageResults(res, batch);
        batch.forEach(item => {
          if (parsed[item.page] != null) rec.pages[item.page] = parsed[item.page];
        });
        rec.updatedAt = Date.now();
        await bookPut(rec);

        const doneCount = Object.keys(rec.pages).length;
        job.pct = Math.round(doneCount / totalPages * 100);
        syncBookAttachmentCount(bookKey, doneCount);
        updateBookChipUI(bookKey);
      }

      const finalCount = Object.keys(rec.pages).length;
      if (finalCount >= totalPages) {
        toast('Đã đọc xong cả cuốn (' + totalPages + ' trang)');
      } else if (!job.aborted && !controller.signal.aborted) {
        toast('Đã lưu ' + finalCount + '/' + totalPages + ' trang, bấm lại để đọc tiếp');
      }
    } catch (e) {
      if (controller.signal.aborted) {
        toast('Đã huỷ đọc sách');
      } else {
        toast((e && e.message) || 'Lỗi khi đọc sách PDF — tiến trình đã được lưu');
      }
    } finally {
      job.running = false;
      updateBookChipUI(bookKey);
      if (loadingTask) { try { await loadingTask.destroy(); } catch (_) {} }
      if (objUrl) URL.revokeObjectURL(objUrl);
    }
  }
  async function extractPdfText(file, signal) {
    let objUrl = null;
    let loadingTask = null;
    try {
      await ensurePdfJs();
      objUrl = URL.createObjectURL(file);
      loadingTask = window.pdfjsLib.getDocument({ url: objUrl, disableRange: false, disableStream: false });
      const pdf = await loadingTask.promise;      const totalPages = pdf.numPages || 1;
      let text = '';
      const MAX_TOTAL_CHARS = 80000;

      const pageIndices = [];
      if (totalPages <= 30) {
        for (let p = 1; p <= totalPages; p++) pageIndices.push(p);
      } else {
        for (let p = 1; p <= Math.min(15, totalPages); p++) pageIndices.push(p);
        const midStart = Math.max(16, Math.floor(totalPages / 2) - 7);
        const midEnd = Math.min(midStart + 14, totalPages - 15);
        for (let p = midStart; p <= midEnd; p++) pageIndices.push(p);
        const endStart = Math.max(midEnd + 1, totalPages - 14);
        for (let p = endStart; p <= totalPages; p++) pageIndices.push(p);
      }

      for (const p of pageIndices) {
        if (signal?.aborted) break;
        try {
          const page = await pdf.getPage(p);
          try {
            const tc = await page.getTextContent();
            const pageStr = tc.items.map(item => item.str).join(' ').trim();
            if (pageStr) text += (text ? '\n\n' : '') + `[Trang ${p}/${totalPages}]\n` + pageStr;
          } finally {
            page.cleanup();
          }
          if (text.length >= MAX_TOTAL_CHARS) {
            text = text.slice(0, MAX_TOTAL_CHARS) + '\n…[đã cắt bớt do đạt giới hạn 80.000 ký tự]';
            break;
          }
        } catch (_) {}
      }
      const trimmedText = text.trim();
      const scanImages = [];

      // PDF có rất ít chữ có thể là bản scan: render tối đa 6 trang đầu.
      if (trimmedText.length < 150 && totalPages > 0) {
        const maxScanPages = Math.min(totalPages, 6);
        for (let p = 1; p <= maxScanPages; p++) {
          if (signal?.aborted) break;
          try {
            const page = await pdf.getPage(p);
            let canvas;
            try {
              const viewport = page.getViewport({ scale: 1.2 });
              canvas = document.createElement('canvas');
              canvas.width = Math.round(viewport.width);
              canvas.height = Math.round(viewport.height);
              const ctx = canvas.getContext('2d');
              if (ctx) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
              await page.render({ canvasContext: ctx, viewport }).promise;              const imgData = canvas.toDataURL('image/jpeg', 0.72);
              if (imgData && imgData.startsWith('data:image/jpeg')) {
                scanImages.push({ page: p, data: imgData });
              }
            } finally {
              if (canvas) { canvas.width = 0; canvas.height = 0; canvas = null; }
              page.cleanup();
            }
          } catch (_) {}
        }
      }

      return { text: trimmedText, scanImages, totalPages, isScan: scanImages.length > 0 };
    } catch (e) {
      if (signal?.aborted) return { text: '', scanImages: [], totalPages: 0, isScan: false, aborted: true };
      console.warn('[PDF Extract] Không thể trích xuất văn bản từ PDF:', e);
      return { text: '', scanImages: [], totalPages: 0, isScan: false };    } finally {
      if (loadingTask) {
        try { await loadingTask.destroy(); } catch (_) {}
      }

      if (objUrl) { try { URL.revokeObjectURL(objUrl); } catch (_) {} }
    }
  }
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();      img.onload = () => {
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
      // BUG-19: Client-side file type defense-in-depth check
      if (!f || !f.name) continue;
      const isImg = /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name);
      const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      const isTxt = /^text\//.test(f.type) || TEXT_EXT.test(f.name);
      if (!isImg && !isPdf && !isTxt) {
        toast('Chưa hỗ trợ định dạng tệp: ' + (f.name || 'tệp'));
        continue;
      }
      if (S.pend.length >= MAX_ATT) { toast('Tối đa ' + MAX_ATT + ' tệp mỗi tin nhắn'); break; }
      if (isPdf) {
        if (f.size > MAX_PDF_BYTES) { toast('PDF lớn hơn 1GB, hãy chọn tệp nhỏ hơn'); continue; }

        const bookKey = f.name + '_' + f.size;
        const controller = new AbortController();
        const a = {
          kind: 'pdf', name: f.name, size: f.size, data: '',
          extractedText: '', scanImages: [], totalPages: 0,
          isScan: false, large: f.size > 15 * 1024 * 1024,
          bookKey, bookDone: 0, _abortController: controller
        };
        bookFiles.set(bookKey, f);
        S.pend.push(a);
        renderPend();

        // Chip đã được gắn; lỗi hoặc timeout khi phân tích không loại bỏ tệp.
        try {
          let timer;
          const timeout = new Promise(resolve => {
            timer = setTimeout(() => resolve(null), 15000);
          });
          let res;
          try { res = await Promise.race([extractPdfText(f, controller.signal), timeout]); }
          finally { clearTimeout(timer); }
          if (res && !res.aborted) {
            a.extractedText = (typeof res === 'string' ? res : res.text) || '';
            a.scanImages = (Array.isArray(res.scanImages) ? res.scanImages : [])
              .map(img => typeof img === 'string' ? img : (img && (img.data || img.url)))
              .filter(url => typeof url === 'string' && url.length > 0);
            const pages = Number(res.totalPages);
            a.totalPages = Number.isSafeInteger(pages) && pages > 0 ? pages : 0;
            a.isScan = a.scanImages.length > 0 || (a.totalPages > 0 && a.extractedText.length < 150);
          }
          const existingBook = await bookGet(bookKey);
          if (existingBook && existingBook.pages) a.bookDone = Object.keys(existingBook.pages).length;
          if (!a.large && !a.scanImages.length) {
            try {
              let readTimer;
              const readTimeout = new Promise(resolve => {
                readTimer = setTimeout(() => resolve(''), 10000);
              });
              let data;
              try { data = await Promise.race([readData(f), readTimeout]); }
              finally { clearTimeout(readTimer); }
              const used = S.pend.reduce((sum, p) => sum + (p.data ? p.data.length : 0), 0);
              if (data && used + data.length <= MAX_BIN_CHARS) a.data = data;
            } catch (_) {}
          }
        } catch (_) {
          // Tên, dung lượng và File gốc vẫn còn trong chip và bookFiles.
        }
        if (S.pend.includes(a)) renderPend();
        continue;
      }

      try {
        let a;
        if (isImg) {
          a = { kind: 'image', name: f.name || 'ảnh.jpg', data: await shrinkImage(f) };
        } else if (isTxt) {
          let t = await readText(f); if (t.length > MAX_TEXT_CHARS) { t = t.slice(0, MAX_TEXT_CHARS) + '\n…[đã cắt bớt]'; toast('Tệp dài, chỉ gửi phần đầu'); }
          a = { kind: 'text', name: f.name, text: t, size: f.size };
        } else { toast('Chưa hỗ trợ loại tệp: ' + (f.name || '')); continue; }
        const used = S.pend.reduce((acc, p) => acc + (p.data ? p.data.length : 0), 0);
        if (a.data && used + a.data.length > MAX_BIN_CHARS) { toast('Tổng dung lượng đính kèm quá lớn — đã nhận ' + S.pend.length + ' tệp'); break; }
        if (S.pend.length >= MAX_ATT) { toast('Tối đa ' + MAX_ATT + ' tệp mỗi tin nhắn'); break; }
        S.pend.push(a); renderPend();
      } catch (e) { toast('Không đọc được: ' + (f.name || 'tệp')); }    }
  }

  /* ---------- Xem ảnh / tệp đính kèm (bấm vào ảnh hoặc thẻ tệp, như Claude) ---------- */
  const elView = $('#cx-view');
  const V = { list: [], i: 0, url: '', tk: 0 };
  function dataToBlob(d) {
    const mm = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(d || ''); if (!mm) return new Blob([]);
    const bin = mm[2] ? atob(mm[3]) : decodeURIComponent(mm[3]), u8 = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
    return new Blob([u8], { type: mm[1] || 'application/octet-stream' });
  }
  async function attBlob(a) {
    if (a.kind === 'pdf' && a.bookKey && bookFiles.has(a.bookKey)) return bookFiles.get(a.bookKey);
    if (a.data) return dataToBlob(a.data);    if (a.scanImages && a.scanImages.length) {
      const first = a.scanImages[0];
      const d = typeof first === 'string' ? first : (first && (first.data || first.url));
      if (typeof d === 'string' && d) return dataToBlob(d);
    }    if (a.text != null) return new Blob([a.text], { type: 'text/plain;charset=utf-8' });
    if (a.fid) return fileBlob(a.fid);
    if (a.extractedText) return new Blob([a.extractedText], { type: 'text/plain;charset=utf-8' });
    throw new Error('Tệp không còn trên thiết bị này');  }  function openView(list, i) { if (!list || !list[i]) return; V.list = list.slice(); V.i = i; viewShow(); }
  function viewClose() { V.tk++; elView.hidden = true; elView.innerHTML = ''; if (V.url) { URL.revokeObjectURL(V.url); V.url = ''; } }
  async function viewShow() {
    const a = V.list[V.i], tk = ++V.tk, nav = V.list.length > 1;
    if (V.url) { URL.revokeObjectURL(V.url); V.url = ''; }
    V.z = 100; V.fit = 1;
    elView.innerHTML = '<div class="cx-view-bg" data-vc="close"></div><div class="cx-view-card" role="dialog" aria-modal="true" aria-label="' + esc(a.name) + '">' +
      '<div class="cx-view-h"><b>' + esc(a.name) + '</b>' +
      (a.kind === 'image' ? '<div class="cx-zoom"><button type="button" data-vc="zout" aria-label="Thu nhỏ">−</button><input type="range" class="cx-zoom-r" min="25" max="400" step="5" value="100" aria-label="Phóng to / thu nhỏ"><button type="button" data-vc="zin" aria-label="Phóng to">+</button><button type="button" class="cx-zoom-v" data-vc="zfit" title="Về vừa khung">100%</button></div>' : '') +
      '<span class="cx-view-n">' + (nav ? (V.i + 1) + ' / ' + V.list.length : '') + '</span>' +
      '<button type="button" class="cx-view-b1" data-vc="dl">Tải về</button><button type="button" class="cx-modal-x" data-vc="close" aria-label="Đóng">×</button></div>' +
      '<div class="cx-view-b"><div class="cx-view-load">Đang tải…</div></div>' +
      (nav ? '<button type="button" class="cx-view-nav prev" data-vc="prev" aria-label="Trước">‹</button><button type="button" class="cx-view-nav next" data-vc="next" aria-label="Sau">›</button>' : '') + '</div>';
    elView.hidden = false;
    const box = elView.querySelector('.cx-view-b');
    try {
      if (a.kind === 'image') {
        const src = a.data || await blobToUrl(await fileBlob(a.fid)); if (tk !== V.tk) return;
        box.innerHTML = '<img class="cx-view-img" draggable="false" src="' + src + '" alt="' + esc(a.name) + '">';
        const im = box.firstChild; im.onload = viewFit; if (im.complete) viewFit();
      } else if (a.kind === 'pdf') {
        const b = await attBlob(a); if (tk !== V.tk) return;
        if (!a.data && !a.fid && !(a.bookKey && bookFiles.has(a.bookKey)) && !a.scanImages?.length && a.extractedText) {          box.innerHTML = '<pre class="cx-view-pre"></pre>'; box.firstChild.textContent = a.extractedText;        } else {
          V.url = URL.createObjectURL(b);
          box.innerHTML = '<iframe class="cx-view-pdf" src="' + V.url + '" title="' + esc(a.name) + '"></iframe><a class="cx-view-open" href="' + V.url + '" target="_blank" rel="noopener">Mở trong tab mới</a>';
        }      } else {
        const t = a.text != null ? a.text : await (await attBlob(a)).text(); if (tk !== V.tk) return;
        box.innerHTML = '<pre class="cx-view-pre"></pre>'; box.firstChild.textContent = t;
      }
    } catch (er) { if (tk === V.tk) box.innerHTML = '<div class="cx-view-load">' + esc(er.message || 'Không mở được tệp') + '</div>'; }
  }
  // Phóng to / thu nhỏ ảnh: 100% = vừa khung; thanh kéo 25–400%; Ctrl + lăn chuột, phím + − 0; kéo ảnh để di chuyển khi đã phóng to
  function viewFit() {
    const box = elView.querySelector('.cx-view-b'), im = elView.querySelector('.cx-view-img'); if (!box || !im || !im.naturalWidth) return;
    V.fit = Math.min(1, box.clientWidth / im.naturalWidth, box.clientHeight / im.naturalHeight) || 1; viewZoom(V.z);
  }
  function viewZoom(z) {
    const box = elView.querySelector('.cx-view-b'), im = elView.querySelector('.cx-view-img'); if (!box || !im || !im.naturalWidth) return;
    z = Math.max(25, Math.min(400, Math.round(z))); V.z = z;
    const cx = (box.scrollLeft + box.clientWidth / 2) / (box.scrollWidth || 1), cy = (box.scrollTop + box.clientHeight / 2) / (box.scrollHeight || 1);
    im.style.width = Math.max(20, Math.round(im.naturalWidth * V.fit * z / 100)) + 'px';
    box.scrollLeft = cx * box.scrollWidth - box.clientWidth / 2; box.scrollTop = cy * box.scrollHeight - box.clientHeight / 2;
    box.classList.toggle('zoomed', z > 100);
    const r = elView.querySelector('.cx-zoom-r'), v = elView.querySelector('.cx-zoom-v'); if (r) r.value = z; if (v) v.textContent = z + '%';
  }
  window.addEventListener('resize', () => { if (!elView.hidden) viewFit(); });
  elView.addEventListener('input', e => { if (e.target.matches('.cx-zoom-r')) viewZoom(+e.target.value); });
  elView.addEventListener('wheel', e => { if ((e.ctrlKey || e.metaKey) && e.target.closest('.cx-view-b')) { e.preventDefault(); viewZoom(V.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)); } }, { passive: false });
  let vDrag = null;
  elView.addEventListener('pointerdown', e => {
    const box = e.target.closest('.cx-view-b'); if (!box || !e.target.closest('.cx-view-img') || e.button) return;
    vDrag = { x: e.clientX, y: e.clientY, l: box.scrollLeft, t: box.scrollTop, box, moved: false };
  });
  window.addEventListener('pointermove', e => {
    if (!vDrag) return; const dx = e.clientX - vDrag.x, dy = e.clientY - vDrag.y;
    if (!vDrag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    vDrag.moved = true; vDrag.box.classList.add('drag'); vDrag.box.scrollLeft = vDrag.l - dx; vDrag.box.scrollTop = vDrag.t - dy;
  });
  window.addEventListener('pointerup', () => { if (vDrag) { vDrag.box.classList.remove('drag'); const mv = vDrag.moved; vDrag = null; if (mv) V.skipClick = true; } });
  elView.addEventListener('click', async e => {
    if (e.target.closest('.cx-view-img')) { if (V.skipClick) { V.skipClick = false; return; } viewZoom(V.z > 100 ? 100 : 200); return; }    // bấm vào ảnh: vừa khung ⇄ 200%
    const b = e.target.closest('[data-vc]'); if (!b) return;
    const k = b.dataset.vc;
    if (k === 'zin') viewZoom(V.z + 25); else if (k === 'zout') viewZoom(V.z - 25); else if (k === 'zfit') viewZoom(100);
    else if (k === 'close') viewClose();
    else if (k === 'prev' || k === 'next') { V.i = (V.i + (k === 'next' ? 1 : V.list.length - 1)) % V.list.length; viewShow(); }
    else if (k === 'dl') {
      const a = V.list[V.i];
      try { const bl = await attBlob(a), u = URL.createObjectURL(bl), l = document.createElement('a'); l.href = u; l.download = (a.kind === 'pdf' && !a.data && !a.fid && !(a.bookKey && bookFiles.has(a.bookKey)) && !a.scanImages?.length && a.extractedText) ? (a.name || 'tep').replace(/\.pdf$/i, '') + '.txt' : (a.name || 'tep'); document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }      catch (er) { toast(er.message || 'Không tải được tệp'); }    }
  });
  document.addEventListener('keydown', e => {
    if (elView.hidden) return;
    if (e.key === 'Escape') { e.stopPropagation(); viewClose(); }
    else if (e.key === '+' || e.key === '=') viewZoom(V.z + 25);
    else if (e.key === '-') viewZoom(V.z - 25);
    else if (e.key === '0') viewZoom(100);
    else if (V.list.length > 1 && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { V.i = (V.i + (e.key === 'ArrowRight' ? 1 : V.list.length - 1)) % V.list.length; viewShow(); }
  }, true);

  /* ---------- Dựng payload gửi server ---------- */
  function toApi(msgs, hint, tail, bookCtxMap) {
    // Chỉ gửi lại dữ liệu ảnh/PDF của tối đa 3 tin gần nhất có tệp, tính từ mới → cũ, và dừng khi vượt ngân sách số tệp / dung lượng.
    // Tin mới nhất luôn được gửi đủ (đã bị giới hạn ở MAX_ATT/MAX_BIN_CHARS khi đính kèm); tin cũ hơn chỉ còn bản chữ nếu không đủ chỗ.
    const latestBookMsgIdx = new Map();
    if (bookCtxMap && bookCtxMap.size) {
      msgs.forEach((m, i) => {
        if (m.role !== 'user') return;
        (m.atts || []).forEach(a => { if (a && a.bookKey && bookCtxMap.has(a.bookKey)) latestBookMsgIdx.set(a.bookKey, i); });
      });
    }
    const binIdx = new Set(); let binItems = 0, binChars = 0;
    for (let i = msgs.length - 1; i >= 0 && binIdx.size < 3; i--) {
      const m = msgs[i]; if (m.role !== 'user') continue;
      const bin = (m.atts || []).flatMap(a => {
        if (a.kind === 'pdf' && a.bookKey && bookCtxMap && bookCtxMap.has(a.bookKey)) return [];
        if (a.kind === 'pdf' && a.scanImages?.length) {
          return a.scanImages.slice(0, 8)
            .map(img => typeof img === 'string' ? img : (img && (img.data || img.url)))
            .filter(url => typeof url === 'string' && url.length > 0);
        }        return a.data && !a.desc ? [a.data] : [];
      });
      if (!bin.length) continue;
      const n = bin.length, c = bin.reduce((k, data) => k + data.length, 0);      if (binIdx.size && (binItems + n > MAX_API_ITEMS || binChars + c > MAX_BIN_CHARS)) break;
      binIdx.add(i); binItems += n; binChars += c;
    }
    const out = []; let prevEmpty = false;
    msgs.forEach((m, i) => {
      if (m.role === 'assistant') { const a = splitMsg(m).answer.trim(); prevEmpty = !a && !m.error; if (a && !m.error) out.push({ role: 'assistant', content: a }); return; }
      if (m.cont && prevEmpty) { hint = true; prevEmpty = false; return; }          // bấm "Tiếp tục" khi lượt trước chỉ có bản nháp → coi như yêu cầu viết lời giải
      prevEmpty = false;
      let text = m.content || ''; const parts = [];
      if (m.cont) text += '\n\n(Hãy viết TIẾP câu trả lời ngay phía trên, bắt đầu đúng từ chỗ đang dừng dở. Không hỏi lại, không chào, không tóm tắt lại và không lặp lại phần đã viết; dựa vào cuộc trò chuyện ở trên.)';
      (m.atts || []).forEach(a => {
        if (a.kind === 'text') text += a.text != null ? '\n\n[Tệp: ' + a.name + ']\n```\n' + a.text + '\n```' : '\n\n[Đã đính kèm tệp: ' + a.name + ' — nội dung không còn trong ngữ cảnh]';
        else if (a.kind === 'pdf') {
          const sizeMb = a.size ? (a.size / (1024 * 1024)).toFixed(1) : '';
          const sizeStr = sizeMb ? ' (' + sizeMb + ' MB)' : '';
          const bk = a.bookKey && bookCtxMap ? bookCtxMap.get(a.bookKey) : null;
          if (bk) {
            if (latestBookMsgIdx.get(a.bookKey) === i) {
              text += '\n\n[Nội dung sách PDF: ' + a.name + sizeStr + ' — đã đọc ' + bk.readCount + '/' + (bk.totalPages || a.totalPages || bk.readCount) + ' trang]\n' + bk.text;
            } else {
              text += '\n\n[Sách PDF: ' + a.name + sizeStr + ' — nội dung đã được nạp ở phần dưới]';
            }
          } else if (a.scanImages && a.scanImages.length) {
            if (binIdx.has(i)) {
              text += '\n\n[Tệp PDF scan: ' + a.name + sizeStr + ' — Đã trích xuất ' + a.scanImages.length + ' trang ảnh để đọc trực tiếp]';
              a.aid = a.aid || ('a' + uid());
              a.scanImages.slice(0, 8).forEach((img, idx) => {
                const imgUrl = typeof img === 'string' ? img : (img && (img.data || img.url));
                if (typeof imgUrl === 'string' && imgUrl) {
                  parts.push({ type: 'image_url', image_url: { url: imgUrl }, aid: a.aid + '_p' + (idx + 1) });
                }
              });            } else {
              text += '\n\n[Tệp PDF scan: ' + a.name + sizeStr + ' — ảnh trang không còn trong ngữ cảnh]';
            }
          } else if (a.extractedText) {
            text += '\n\n[Tệp PDF đính kèm: ' + a.name + sizeStr + ' — Nội dung trích xuất]:\n' + a.extractedText;
          } else if (a.desc) {
            text += '\n\n[PDF đính kèm: ' + a.name + sizeStr + ' — AI đã đọc và chuyển thành chữ]:\n' + a.desc;
          } else if (!a.data || !binIdx.has(i) || a.data.length >= 4000000) {
            text += '\n\n[Tệp PDF đính kèm: ' + a.name + sizeStr + ' — nội dung không còn trong ngữ cảnh]';
          }
          if (!bk && a.data && !a.desc && !a.scanImages?.length && binIdx.has(i) && a.data.length < 4000000) {
            a.aid = a.aid || ('a' + uid());
            parts.push({ type: 'file', file: { filename: a.name, file_data: a.data }, aid: a.aid });
          }        }
        else if (a.desc) text += '\n\n[Ảnh đính kèm: ' + a.name + ' — AI đã đọc và chuyển thành chữ (có thể sai chi tiết)]\n' + a.desc;
        else if (!a.data || !binIdx.has(i)) text += '\n\n[Đã đính kèm ảnh: ' + a.name + ' — không còn trong ngữ cảnh]';
        else if (a.kind === 'image') { a.aid = a.aid || ('a' + uid()); parts.push({ type: 'image_url', image_url: { url: a.data }, aid: a.aid }); }      });      text = text.trim();      if (!text && !parts.length) return;
      out.push({ role: 'user', content: parts.length ? [{ type: 'text', text: text || 'Hãy xem tệp đính kèm.' }, ...parts] : text });
    });
    if (hint && out.length && out[out.length - 1].role === 'user') {      // lần trước model dùng hết giới hạn để nháp → nhắc viết thẳng lời giải (chỉ gửi cho model, không hiện trong khung chat)
      const u = out[out.length - 1], H = '\n\n(Lưu ý: chỉ suy nghĩ thật ngắn, KHÔNG viết bản nháp ra phần trả lời. Viết ngay lời giải/câu trả lời cuối cùng bằng tiếng Việt, gọn và đầy đủ các bước chính.)';
      if (typeof u.content === 'string') u.content += H; else if (Array.isArray(u.content) && u.content[0] && u.content[0].type === 'text') u.content[0].text += H;
    }
    if (tail) {                                                                // viết tiếp câu trả lời đang dở (sau khi tải lại trang)
      const u = out[out.length - 1];
      if (u && u.role === 'user') { if (typeof u.content === 'string') u.content += '\n\n' + tail; else if (Array.isArray(u.content) && u.content[0] && u.content[0].type === 'text') u.content[0].text += '\n\n' + tail; }
      else out.push({ role: 'user', content: tail });
    }
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
    t.messages.push({ role: 'user', content: text, atts: S.pend.map(a => ({ ...a })), ts: Date.now(), ...(S.cont ? { cont: true } : {}) }); S.cont = false;
    if (t.title === 'Cuộc trò chuyện mới') t.title = (text || (S.pend[0] && S.pend[0].name) || 'Cuộc trò chuyện').replace(/\s+/g, ' ').slice(0, 48);
    t.level = S.level === 'auto' ? pickLevel(text, S.pend, prevLevel(t)) : S.level;
    elTa.value = ''; S.pend = []; renderPend(); autosize();
    persist(t); elTitle.textContent = t.title;
    await runAnswer(t);
  }
  function regenerate(hint) {
    if (S.busy) return; const t = S.cur;
    while (t.messages.length && t.messages[t.messages.length - 1].role === 'assistant') t.messages.pop();
    if (!t.messages.length) return; const lu = t.messages[t.messages.length - 1]; t.level = S.level === 'auto' ? pickLevel(lu.content, lu.atts, prevLevel(t)) : S.level; renderAll(); runAnswer(t, hint);
  }
  function stopStream() { if (S.ctl) S.ctl.abort(); }

  const CONT_TAIL = 'Hãy viết TIẾP câu trả lời ngay phía trên, bắt đầu đúng từ chỗ đang dừng dở (kết nối bị ngắt giữa chừng, vd trang bị tải lại). Không hỏi lại, không chào, không tóm tắt lại và không lặp lại phần đã viết; dựa vào cuộc trò chuyện ở trên.';
  const genId = () => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const isNetErr = e => !!e && e.name !== 'AbortError' && (e instanceof TypeError || /network|failed to fetch|load failed|terminated|stream|ngắt|connection/i.test(String(e.message || '')));
  // Vẽ lại đúng tin nhắn `a` nếu thread đang mở
  function paintMsg(t, a) { if (S.cur !== t) return; const n = elCol.querySelector('.cx-msg[data-i="' + t.messages.indexOf(a) + '"]'); if (n) { paintAssistant(n, a); scrollDown(); } }
  // Theo dõi 1 câu trả lời đang được SERVER viết (hỏi chatGenGet mỗi ~1,5s). Trả về: 'done' | 'dead' (server ngừng cập nhật) | 'none' (server không có) | 'stopped'
  async function followGen(t, a) {
    let miss = 0, none = 0;
    for (;;) {
      if (S.ctl && S.ctl.signal.aborted) return 'stopped';
      let d = null;
      try { d = await syncCall({ action: 'chatGenGet', gen: a.gen }); miss = 0; }
      catch (e) { if (/Unknown action/i.test(String((e && e.message) || ''))) return 'none'; if (++miss >= 6) return 'dead'; await sleep(2000); continue; }       // 'Unknown action' = worker.js chưa được cập nhật
      if (!d || d.status === 'none') { if (++none >= 4) return 'none'; await sleep(1500); continue; }
      none = 0;
      const m = d.meta || {};
      a.content = d.content || ''; a.reasoning = d.reasoning || '';
      if (m.model) a.model = m.model;
      if (d.truncated && splitMsg(a).answer.trim()) a.truncated = true;      (m.descs || []).forEach(dd => { if (dd && dd.aid && typeof dd.text === 'string') t.messages.forEach(mm => (mm.atts || []).forEach(at => { if (at.aid === dd.aid) at.desc = dd.text.slice(0, 24000); })); });
      if (d.status === 'running') { if (d.age > 25000) return 'dead'; paintMsg(t, a); await sleep(1500); continue; }
      if (d.status === 'error') { if (m.locked) a.locked = true; a.error = m.error || (a.content.trim() ? 'Luồng trả lời bị ngắt giữa chừng.' : 'Model không trả về nội dung. Hãy thử lại hoặc chọn mức khác.'); }
      return 'done';
    }
  }
  // Mở lại trang khi AI đang viết dở: lấy phần server đã/đang viết; nếu server không còn viết được nữa thì viết TIẾP từ phần đã có.
  async function recoverPending() {
    const now = Date.now(), jobs = [];
    S.threads.forEach(t => (t.messages || []).forEach(m => { if (m && m.role === 'assistant' && m.pending && m.gen) jobs.push({ t, m }); }));
    if (!jobs.length) return;
    jobs.sort((x, y) => (y.m.ts || 0) - (x.m.ts || 0));
    const settle = (t, m, r) => {
      m.streaming = false; delete m.pending;
      if (r === 'stopped') m.stopped = true;
      else if (r !== 'done' && !m.error) { if (splitMsg(m).answer.trim()) m.truncated = true; else m.error = 'Câu trả lời bị gián đoạn khi tải lại trang.'; }
      persist(t); paintMsg(t, m);
    };
    const old = jobs.filter(j => now - (j.m.ts || 0) > 15 * 60000), cur = jobs.filter(j => now - (j.m.ts || 0) <= 15 * 60000);
    old.forEach(j => { delete j.m.pending; if (!j.m.content) j.m.error = 'Câu trả lời bị gián đoạn khi tải lại trang.'; dbPut(j.t); });
    if (!cur.length) { renderList(); return; }
    const first = cur[0];
    first.m.streaming = true; delete first.m.error;
    openThread(first.t);
    S.busy = true; S.ctl = new AbortController(); updateSend(); refreshRedo(); paintMsg(first.t, first.m);
    let r = 'dead';
    const tk = setInterval(() => paintMsg(first.t, first.m), 1000);        // đồng hồ "Đang … Ns" chạy tiếp như lúc đầu
    try { r = await followGen(first.t, first.m); } catch (e) { r = 'dead'; }
    clearInterval(tk); S.busy = false; S.ctl = null; updateSend();
    if (r === 'dead' || r === 'none') { first.m.streaming = false; renderAll(); await runAnswer(first.t, false, first.m); }
    else { settle(first.t, first.m, r); refreshRedo(); if (r === 'done' && !first.m.error) refreshQuota(true); }
    for (const j of cur.slice(1)) {          // các câu dở khác (thread khác): chỉ lấy kết quả nếu server đã viết xong
      j.m.streaming = true; let rr = 'dead';
      try { rr = await followGen(j.t, j.m); } catch (e) {}
      settle(j.t, j.m, rr);
    }
  }
  async function runAnswer(t, hint, resume) {
    const a = resume || { role: 'assistant', content: '', reasoning: '', streaming: true, level: t.level, ts: Date.now() };
    let tail = '', needResume = false;
    if (resume) {
      a.streaming = true; a.truncated = false; a.stopped = false; delete a.error;
      if (splitMsg(a).answer.trim()) tail = CONT_TAIL; else { a.content = ''; a.reasoning = ''; hint = true; }
    }
    a.gen = genId(); a.pending = true;                                            // đánh dấu "đang viết" → nếu trang bị tải lại, init sẽ nhặt lại (recoverPending)
    if (!resume) t.messages.push(a);
    dbPut(t); renderAll();
    const node = elCol.lastElementChild; S.stick = true; scrollDown(true);
    S.busy = true; S.ctl = new AbortController(); updateSend(); refreshRedo();
    const t0 = Date.now(); let firstAns = 0, raf = 0, dirty = false, sawFinish = false;
    const paint = () => { raf = 0; if (!dirty) return; dirty = false; paintAssistant(node, a); scrollDown(); };
    const touch = () => { dirty = true; if (!raf) raf = requestAnimationFrame(paint); };
    const tick = setInterval(() => { if (a.streaming && !a.content) touch(); }, 1000);
    touch();
    try {
      const apiSourceMsgs = tail ? t.messages : t.messages.slice(0, -1);
      const bookCtxMap = await loadBookContexts(apiSourceMsgs);
      const res = await fetch(gasUrl(), {
        method: 'POST', signal: S.ctl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify({ action: 'chatStream', sessionToken: token(), level: t.level, mode: S.mode, skills: activeSkills().map(k => ({ name: k.name, text: k.text })).concat(arisPrefs.customInstruction.trim() ? [{ name: 'Chỉ dẫn riêng', text: arisPrefs.customInstruction.trim() }] : []), quotaSession: quotaSid(t), gen: a.gen, messages: toApi(apiSourceMsgs, hint, tail, bookCtxMap) }),
      });      if (!/event-stream/i.test(res.headers.get('Content-Type') || '')) {
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
          if (Array.isArray(x.desc)) x.desc.forEach(dd => { if (dd && dd.aid && typeof dd.text === 'string') t.messages.forEach(mm => (mm.atts || []).forEach(at => { if (at.aid === dd.aid) at.desc = dd.text.slice(0, 1000000); })); });
          if (x.error) { a.error = x.error; if (x.locked) { a.locked = true; if (window.A3AI && window.A3AI.showUpgrade) window.A3AI.showUpgrade(x.error); } throw new Error(x.error); }
          return;
        }        if (j.error) throw new Error(j.error.message || 'Nhà cung cấp AI báo lỗi');
        const ch = j.choices && j.choices[0]; if (!ch) return;
        const dl = ch.delta || {};
        if (!a.ttft) a.ttft = Date.now() - t0;
        const rs = dl.reasoning || dl.reasoning_content || '';
        if (rs) a.reasoning += rs;
        if (dl.content) { if (!firstAns) { firstAns = Date.now(); if (!resume) a.thinkMs = firstAns - t0; } a.content += dl.content; }
        if (ch.finish_reason) sawFinish = true;
        if (/^(length|max_tokens)$/i.test(String(ch.finish_reason || '')) && splitMsg(a).answer.trim()) a.truncated = true;        touch();
      };
      for (;;) {
        const { done, value } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let k; while ((k = buf.indexOf('\n')) >= 0) { onLine(buf.slice(0, k).replace(/\r$/, '')); buf = buf.slice(k + 1); }
      }
      if (buf) onLine(buf.replace(/\r$/, ''));
      if (!a.content.trim()) {
        throw new Error((a.reasoning && a.reasoning.trim())
          ? 'Model đã dừng trong quá trình suy nghĩ mà chưa tạo câu trả lời. Hãy bấm Thử lại hoặc chuyển sang mức khác.'
          : 'Model không trả về nội dung. Hãy thử lại hoặc chọn mức khác.');
      }
      if (!firstAns && !resume) a.thinkMs = Date.now() - t0;
      // Đang viết dở mà không có tín hiệu kết thúc → hiện nút "Tiếp tục"
      if (a.content.trim() && !sawFinish && splitMsg(a).answer.trim()) a.truncated = true;    } catch (e) {      if (e && e.name === 'AbortError') { a.stopped = true; if (!a.content.trim() && !a.reasoning.trim()) a.content = '_Đã dừng._'; }
      else if (a.gen && isNetErr(e) && (a.resumes || 0) < 2) {                // mất kết nối giữa chừng: server vẫn có thể đang viết → lấy lại; không được thì viết tiếp
        a.resumes = (a.resumes || 0) + 1; let r = 'dead';
        try { r = await followGen(t, a); } catch (er) {}
        if (r === 'dead' || r === 'none') needResume = true; else if (r === 'stopped') a.stopped = true;
      }
      else a.error = (e && e.message) || 'Có lỗi xảy ra';
    } finally {
      delete a.pending;
      clearInterval(tick); a.streaming = false; S.busy = false; S.ctl = null; if (raf) cancelAnimationFrame(raf);
      paintAssistant(node, a); refreshRedo(); updateSend(); persist(t); scrollDown();
      if (!a.error) refreshQuota(true);
    }
    if (needResume) return runAnswer(t, false, a);
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
      rec = new SR(); rec.lang = arisPrefs.voiceLang || 'vi-VN'; rec.interimResults = true; rec.continuous = false;      base = elTa.value ? elTa.value.replace(/\s+$/, '') + ' ' : '';
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
    const md = '# ' + t.title + '\n\n' + t.messages.map(m => (m.role === 'user' ? '**Bạn:** ' : '**Aris:** ') + (m.role === 'user' ? m.content + (m.atts && m.atts.length ? '\n\n_(đính kèm: ' + m.atts.map(a => a.name).join(', ') + ')_' : '') : splitMsg(m).answer)).join('\n\n---\n\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    a.download = (t.title.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 40) || 'aris-chat') + '.md'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  /* ---------- Cài đặt Aris ---------- */
  const elSettingsModal = $('#aris-settings-modal');
  const elSettingsBtn = $('#aris-settings-btn');
  let settingsTab = 'general';
  let settingsRequest = 0;

  function closeArisSettingsModal() {
    if (!elSettingsModal) return;
    settingsRequest++;
    elSettingsModal.hidden = true;
    elSettingsModal.innerHTML = '';
    if (elSettingsBtn) elSettingsBtn.focus();
  }

  function openArisSettingsModal(initialTab) {
    if (!elSettingsModal) return;
    const groups = [
      ['TÀI KHOẢN & HẠN MỨC', [['usage', 'Hạn mức & Gói AI'], ['storage', 'Dung lượng tệp R2']]],
      ['ỨNG DỤNG & CÁ NHÂN HÓA', [['general', 'Giao diện & Đọc'], ['voice', 'Cá nhân hóa & Giọng nói']]],
      ['SKILLS & DỮ LIỆU', [['skills', 'Quản lý Skills'], ['data', 'Dữ liệu & Quyền riêng tư']]]
    ];
    const tabs = groups.flatMap(g => g[1].map(x => x[0]));
    settingsTab = tabs.includes(initialTab) ? initialTab : 'general';
    elSettingsModal.innerHTML =
      '<div class="aris-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="aris-settings-title">' +
        '<div class="aris-settings-header"><span class="aris-settings-title" id="aris-settings-title">Cài đặt AI Aris</span>' +
        '<button class="aris-settings-x" type="button" data-settings-action="close" aria-label="Đóng">×</button></div>' +
        '<div class="aris-settings-layout"><nav class="aris-settings-nav" aria-label="Các mục cài đặt">' +
        groups.map(g => '<div class="aris-nav-group-title">' + esc(g[0]) + '</div>' +
          g[1].map(x => '<button class="aris-nav-item" type="button" data-settings-tab="' + x[0] + '">' + esc(x[1]) + '</button>').join('')).join('') +
        '</nav><div class="aris-settings-content"></div></div></div>';
    elSettingsModal.hidden = false;
    renderSettingsTab();
    elSettingsModal.querySelector('.aris-settings-x').focus();
  }

  function settingsOptions(values, selected) {
    return values.map(x => '<option value="' + esc(String(x[0])) + '"' +
      (String(selected) === String(x[0]) ? ' selected' : '') + '>' + esc(x[1]) + '</option>').join('');
  }

  function settingsSelect(label, key, values) {
    return '<label class="aris-row"><span class="aris-label"><b>' + esc(label) + '</b></span>' +
      '<select class="aris-select" data-pref="' + key + '">' + settingsOptions(values, arisPrefs[key]) + '</select></label>';
  }

  function settingsCheck(label, key) {
    return '<label class="aris-row"><span class="aris-label"><b>' + esc(label) + '</b></span>' +
      '<input type="checkbox" data-pref="' + key + '"' + (arisPrefs[key] !== false ? ' checked' : '') + '></label>';
  }

  function settingsProgress(used, limit) {
    const pct = limit > 0 ? Math.max(0, Math.min(100, used / limit * 100)) : 0;
    return '<div class="aris-prog-track"><div class="aris-prog-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="aris-prog-meta"><span>Đã dùng ' + Math.round(pct) + '%</span></div>';
  }

  function settingsDownload(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type: type + ';charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function settingsSkillsHtml() {
    const cats = [...new Set(LIB().map(k => k.cat || 'Khác'))];
    return '<h2 class="aris-sec-title">Skills cá nhân</h2>' +
      '<p class="aris-sec-desc">Bật tối đa ' + SKILL_ACTIVE_MAX + ' skills cùng lúc, gồm cả skills dựng sẵn.</p>' +
      '<div class="aris-card">' + (S.skills.length ? S.skills.map(k =>
        '<div class="aris-row"><span class="aris-label"><b>' + esc(k.name) + '</b><span>' + esc(k.desc || '') + '</span></span>' +
        '<span><label><input type="checkbox" data-skill-toggle="' + esc(k.id) + '"' + (k.on ? ' checked' : '') + '> Bật</label> ' +
        '<button class="aris-btn" type="button" data-settings-action="edit-skill" data-id="' + esc(k.id) + '">Sửa</button> ' +
        '<button class="aris-btn danger" type="button" data-settings-action="delete-skill" data-id="' + esc(k.id) + '">Xóa</button></span></div>'
      ).join('') : '<p>Chưa có skill cá nhân.</p>') +
      '<button class="aris-btn primary" type="button" data-settings-action="new-skill">+ Tạo mới</button></div>' +
      '<div id="aris-skill-editor"></div><h2 class="aris-sec-title">Skills dựng sẵn</h2>' +
      '<label>Tìm skill <input class="aris-input" type="search" data-settings-search placeholder="Tìm theo tên, mô tả hoặc nhóm"></label>' +
      '<div data-settings-library>' + (cats.length ? cats.map(cat =>
        '<section data-library-group><h3 class="aris-sec-title">' + esc(cat) + '</h3>' +
        LIB().filter(k => (k.cat || 'Khác') === cat).map(k =>
          '<label class="aris-row" data-library-item data-search="' + esc((k.name + ' ' + (k.desc || '') + ' ' + cat).toLowerCase()) + '">' +
          '<span class="aris-label"><b>' + esc(k.name) + '</b><span>' + esc(k.desc || '') + '</span></span>' +
          '<input type="checkbox" data-library-toggle="' + esc(k.id) + '"' + (S.libOn.includes(k.id) ? ' checked' : '') + '></label>'
        ).join('') + '</section>'
      ).join('') : '<p>Chưa có thư viện skill.</p>') + '</div>';
  }

  function renderSettingsTab() {
    if (!elSettingsModal || elSettingsModal.hidden) return;
    const content = elSettingsModal.querySelector('.aris-settings-content');
    const request = ++settingsRequest;
    elSettingsModal.querySelectorAll('[data-settings-tab]').forEach(b => {
      const on = b.dataset.settingsTab === settingsTab;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });


    if (settingsTab === 'general') {
      content.innerHTML = '<h2 class="aris-sec-title">Giao diện & Đọc</h2><div class="aris-card">' +
        settingsSelect('Mức suy luận mặc định', 'defaultLevel', LEVELS.map(x => [x.key, x.label])) +
        settingsSelect('Chế độ mặc định', 'defaultMode', MODES.map(x => [x.key, x.label])) +
        settingsSelect('Cỡ chữ đọc', 'fontSize', [['sm', 'Nhỏ'], ['md', 'Vừa'], ['lg', 'Lớn']]) +
        settingsSelect('Phông chữ câu trả lời', 'fontFamily', [['sans', 'Mặc định (Sans)'], ['serif', 'Chữ có chân (Serif)'], ['mono', 'Mã nguồn (Mono)']]) +
        settingsSelect('Độ rộng khung đọc', 'readingWidth', [['normal', 'Bình thường'], ['wide', 'Rộng'], ['full', 'Toàn bộ']]) +
        settingsCheck('Hiển thị suy nghĩ', 'showThinking') +
        settingsCheck('Tự động cuộn theo câu trả lời', 'autoScroll') + '</div>' +
        '<div class="aris-pane-foot"><span class="aris-save-status" id="aris-settings-save-status">✓ Đã lưu</span>' +
        '<button class="aris-btn" type="button" data-settings-action="reset-defaults">Đặt lại mặc định</button></div>';
    } else if (settingsTab === 'voice') {
      const instLen = (arisPrefs.customInstruction || '').length;
      content.innerHTML = '<h2 class="aris-sec-title">Cá nhân hóa & Giọng nói</h2><div class="aris-card">' +
        '<label class="aris-label"><b>Chỉ dẫn riêng của bạn cho Aris</b><span>Ví dụ: cách xưng hô, phong cách trả lời hoặc các quy ước mong muốn</span></label>' +
        '<div class="aris-textarea-wrap">' +
        '<textarea class="aris-textarea" id="aris-custom-inst" rows="4" maxlength="2000" data-pref="customInstruction" placeholder="Ví dụ: Xưng hô với mình là \'bạn\', giải thích từng bước có ví dụ thực tế và luôn tóm tắt ý chính ở cuối...">' +
        esc(arisPrefs.customInstruction || '') + '</textarea>' +
        '<div class="aris-char-count' + (instLen >= 2000 ? ' limit' : '') + '" id="aris-char-count">' + instLen + ' / 2000</div></div>' +
        '<div class="aris-preset-chips">' +
        '<span class="aris-preset-chip" data-preset="Giải từng bước dễ hiểu, có ví dụ minh họa.">💡 Giải từng bước dễ hiểu</span>' +
        '<span class="aris-preset-chip" data-preset="Tóm tắt ngắn gọn, đi thẳng vào trọng tâm.">⚡ Tóm tắt ngắn gọn</span>' +
        '<span class="aris-preset-chip" data-preset="Phong cách nghiêm túc, chuẩn xác, trích dẫn rõ công thức/nguồn.">📐 Phong cách nghiêm túc, chuẩn xác</span>' +
        '<span class="aris-preset-chip" data-preset="Xưng hô thân thiện, đóng vai người bạn đồng hành trong học tập.">🤝 Xưng hô thân thiện</span>' +
        '</div>' +
        settingsSelect('Ngôn ngữ nhận diện giọng nói', 'voiceLang', [['vi-VN', 'Tiếng Việt'], ['en-US', 'English (US)']]) +
        settingsSelect('Tốc độ đọc phản hồi', 'ttsRate', [[0.8, '0.8x'], [1, '1.0x'], [1.2, '1.2x'], [1.5, '1.5x']]) + '</div>' +
        '<div class="aris-pane-foot"><span class="aris-save-status" id="aris-settings-save-status">✓ Đã lưu</span>' +
        '<button class="aris-btn" type="button" data-settings-action="reset-defaults">Đặt lại mặc định</button></div>';
    } else if (settingsTab === 'skills') {
      content.innerHTML = settingsSkillsHtml();
    } else if (settingsTab === 'data') {      content.innerHTML = '<h2 class="aris-sec-title">Dữ liệu & Quyền riêng tư</h2>' +
        '<div class="aris-card"><p data-sync-status>' + esc(!syncOn() ? 'Đồng bộ đang tắt.' : (SY.state || 'Chưa đồng bộ.')) + '</p>' +
        '<button class="aris-btn" type="button" data-settings-action="sync">Đồng bộ ngay</button></div>' +
        '<div class="aris-card"><button class="aris-btn" type="button" data-settings-action="export-json">Xuất JSON (.json)</button> ' +
        '<button class="aris-btn" type="button" data-settings-action="export-md">Xuất Markdown (.md)</button></div>' +
        '<div class="aris-card"><h3>Vùng nguy hiểm</h3><button class="aris-btn danger" type="button" data-settings-action="delete-all">Xóa toàn bộ lịch sử trò chuyện</button></div>';
    } else {
      content.innerHTML = '<h2 class="aris-sec-title">' + (settingsTab === 'usage' ? 'Hạn mức & Gói AI' : 'Dung lượng tệp R2') +
        '</h2><div class="aris-card" data-settings-result>Đang tải…</div>';
      const promise = settingsTab === 'usage'
        ? (window.A3AI && window.A3AI.getEntitlements ? window.A3AI.getEntitlements(0) : syncCall({ action: 'getEntitlements' }))
        : syncCall({ action: 'chatFileUsage' });
      Promise.resolve(promise).then(d => {
        if (request !== settingsRequest || elSettingsModal.hidden) return;
        const result = content.querySelector('[data-settings-result]');
        if (settingsTab === 'usage') {
          const u = d && d.aiFreeUsage;
          if (!u) { result.textContent = 'Không có thông tin hạn mức.'; return; }
          const unlimited = Number(u.limit) < 0;
          const reset = u.resetAt ? new Date(Number(u.resetAt)) : null;
          result.innerHTML = '<p>Gói: <b>' + esc(u.plan || 'free') + '</b></p><p>Số lượt còn lại: <b>' +
            (unlimited ? 'Không giới hạn' : esc(String(u.remaining != null ? u.remaining : Math.max(0, u.limit - u.used)))) +
            '</b></p>' + (unlimited ? '' : settingsProgress(Number(u.used) || 0, Number(u.limit) || 0)) +
            '<p>Ngày đặt lại: ' + (reset && !isNaN(reset.getTime()) ? esc(reset.toLocaleString('vi-VN')) : 'Chưa có thông tin') + '</p>';
        } else {
          const u = d && d.files;
          if (!u) { result.textContent = 'Bộ nhớ R2 chưa khả dụng.'; return; }
          SY.usage = u; paintSync();
          result.innerHTML = '<p>Đã dùng: <b>' + esc(fmtMB(u.used)) + ' / ' + esc(fmtMB(u.limit)) + '</b></p>' +
            settingsProgress(Number(u.used) || 0, Number(u.limit) || 0) + '<p>Số tệp lưu trữ: ' + esc(String(u.count || 0)) + '</p>';
        }
      }).catch(() => {
        if (request === settingsRequest && !elSettingsModal.hidden) content.querySelector('[data-settings-result]').textContent = 'Không tải được dữ liệu. Vui lòng thử lại.';
      });
    }
  }

  function settingsEditSkill(id) {
    const editor = elSettingsModal.querySelector('#aris-skill-editor');
    const k = S.skills.find(x => x.id === id) || { name: '', desc: '', text: '' };
    editor.innerHTML = '<form class="aris-card" data-skill-form data-id="' + esc(id || '') + '">' +
      '<h3>' + (id ? 'Sửa skill' : 'Tạo skill') + '</h3>' +
      '<label>Tên <input class="aris-input" name="name" maxlength="40" required value="' + esc(k.name) + '"></label><br>' +
      '<label>Mô tả <input class="aris-input" name="desc" maxlength="120" value="' + esc(k.desc || '') + '"></label><br>' +
      '<label>Nội dung <textarea class="aris-textarea" name="text" maxlength="2000" rows="6" required>' + esc(k.text) + '</textarea></label>' +
      '<button class="aris-btn primary" type="submit">Lưu</button> ' +
      '<button class="aris-btn" type="button" data-settings-action="cancel-skill">Hủy</button></form>';
    editor.querySelector('[name="name"]').focus();
  }

  if (elSettingsBtn) elSettingsBtn.addEventListener('click', () => openArisSettingsModal('general'));

  if (elSettingsModal) {
    elSettingsModal.addEventListener('click', async e => {
      if (e.target === elSettingsModal) { closeArisSettingsModal(); return; }
      const tab = e.target.closest('[data-settings-tab]');
      if (tab) { settingsTab = tab.dataset.settingsTab; renderSettingsTab(); return; }
      const chip = e.target.closest('[data-preset]');
      if (chip) {
        const text = chip.dataset.preset || '';
        const ta = elSettingsModal.querySelector('#aris-custom-inst') || elSettingsModal.querySelector('[data-pref="customInstruction"]');
        if (ta) {
          const cur = ta.value.trim();
          ta.value = cur ? (cur + '\n' + text).slice(0, 2000) : text.slice(0, 2000);
          saveArisPrefs({ customInstruction: ta.value });
          const cc = elSettingsModal.querySelector('#aris-char-count');
          if (cc) {
            cc.textContent = ta.value.length + ' / 2000';
            cc.classList.toggle('limit', ta.value.length >= 2000);
          }
        }
        return;
      }
      const b = e.target.closest('[data-settings-action]');
      if (!b) return;
      const action = b.dataset.settingsAction;
      if (action === 'close') closeArisSettingsModal();

      else if (action === 'reset-defaults') {
        if (!confirm('Đặt lại tất cả cài đặt AI Aris về mặc định?')) return;
        saveArisPrefs(Object.assign({}, DEFAULT_ARIS_PREFS));
        S.level = DEFAULT_ARIS_PREFS.defaultLevel;
        S.mode = DEFAULT_ARIS_PREFS.defaultMode;
        try {
          localStorage.setItem('a3k64-chat-level', S.level);
          localStorage.setItem('a3k64-chat-mode', S.mode);
        } catch (_) {}
        paintLevel();
        paintMode();
        renderSettingsTab();
        showSettingsSaved();
        toast('Đã đặt lại cài đặt về mặc định');
      } else if (action === 'create-skill') {
        if (S.skills.length >= SKILL_MAX) { toast('Đã đạt số skill cá nhân tối đa'); return; }
        settingsEditSkill('');
      } else if (action === 'edit-skill') settingsEditSkill(b.dataset.id);      else if (action === 'cancel-skill') elSettingsModal.querySelector('#aris-skill-editor').innerHTML = '';
      else if (action === 'delete-skill') {
        if (!confirm('Xóa skill này?')) return;
        S.skills = S.skills.filter(k => k.id !== b.dataset.id); saveSkills(); paintMode(); renderSettingsTab();
      } else if (action === 'sync') {
        const status = elSettingsModal.querySelector('[data-sync-status]');
        if (!syncOn()) { status.textContent = 'Đồng bộ đang tắt. Hãy bật ở thanh lịch sử.'; return; }
        if (!token() || S.user === 'guest' || !gasUrl()) { status.textContent = 'Cần đăng nhập và kết nối máy chủ để đồng bộ.'; return; }
        scheduleSync(0); status.textContent = 'Đã yêu cầu đồng bộ Turso/R2. Xem trạng thái ở thanh lịch sử.';
      } else if (action === 'export-json') {
        settingsDownload('aris-history.json', JSON.stringify(S.threads, null, 2), 'application/json');
      } else if (action === 'export-md') {
        const text = S.threads.map(t => '# ' + t.title + '\n\n' + t.messages.map(m =>
          (m.role === 'user' ? '**Bạn:** ' : '**Aris:** ') +
          (m.role === 'user' ? String(m.content || '') + ((m.atts || []).length ? '\n\n_(đính kèm: ' + m.atts.map(a => a.name).join(', ') + ')_' : '') : splitMsg(m).answer)
        ).join('\n\n---\n\n')).join('\n\n---\n\n');
        settingsDownload('aris-history.md', text, 'text/markdown');
      } else if (action === 'delete-all') {
        if (S.busy || SY.running) { toast('Hãy đợi trả lời và đồng bộ hoàn tất trước khi xóa'); return; }
        if (!confirm('Xóa toàn bộ lịch sử trò chuyện trên thiết bị này và máy chủ?')) return;
        b.disabled = true;
        clearTimeout(SY.timer);
        try {
          const ids = new Set(S.threads.map(t => t.id).concat(pendDel()));
          if (token() && S.user !== 'guest' && gasUrl()) {
            const remote = await syncCall({ action: 'chatSyncIds' });
            (remote.ids || []).forEach(id => ids.add(id));
            const all = [...ids];
            for (let i = 0; i < all.length; i += 50) await syncCall({ action: 'chatSyncDelete', ids: all.slice(i, i + 50) });
          } else if (S.user !== 'guest') {
            throw new Error('Cần kết nối và đăng nhập để xóa lịch sử trên máy chủ.');
          }
          await Promise.all(S.threads.map(t => dbDel(t.id)));
          lsSet(sKey('del'), '[]');
          S.threads = []; newThread(); renderList(); renderAll();
          toast('Đã xóa lịch sử trò chuyện');
        } catch (err) {
          toast((err && err.message) || 'Không xóa được lịch sử. Vui lòng thử lại.');
        } finally {
          if (b.isConnected) b.disabled = false;
        }
      }
    });

    elSettingsModal.addEventListener('change', e => {
      const input = e.target;
      if (input.dataset.pref) {
        const key = input.dataset.pref;
        const value = input.type === 'checkbox' ? input.checked : key === 'ttsRate' ? Number(input.value) : input.value;
        saveArisPrefs({ [key]: value });
        if (key === 'defaultLevel') {
          S.level = value; try { localStorage.setItem('a3k64-chat-level', value); } catch (_) {}
          paintLevel();
        } else if (key === 'defaultMode') {
          S.mode = value; try { localStorage.setItem('a3k64-chat-mode', value); } catch (_) {}
          paintMode();
        }
      } else if (input.dataset.skillToggle) {
        const k = S.skills.find(x => x.id === input.dataset.skillToggle);
        if (!k) return;
        if (input.checked && activeSkills().length >= SKILL_ACTIVE_MAX) {
          input.checked = false; toast('Chỉ bật được tối đa ' + SKILL_ACTIVE_MAX + ' skill cùng lúc'); return;
        }
        k.on = input.checked; saveSkills(); paintMode();
      } else if (input.dataset.libraryToggle) {
        const id = input.dataset.libraryToggle;
        if (input.checked && activeSkills().length >= SKILL_ACTIVE_MAX) {
          input.checked = false; toast('Chỉ bật được tối đa ' + SKILL_ACTIVE_MAX + ' skill cùng lúc'); return;
        }
        S.libOn = input.checked ? [...new Set(S.libOn.concat(id))] : S.libOn.filter(x => x !== id);
        saveLib(); paintMode();
      }
    });

    elSettingsModal.addEventListener('input', e => {
      if (e.target.dataset.pref === 'customInstruction') {
        let val = e.target.value;
        if (val.length > 2000) {
          val = val.slice(0, 2000);
          e.target.value = val;
        }
        const cc = elSettingsModal.querySelector('#aris-char-count');
        if (cc) {
          cc.textContent = val.length + ' / 2000';
          cc.classList.toggle('limit', val.length >= 2000);
        }
        saveArisPrefs({ customInstruction: val });
      }
      if (!e.target.matches('[data-settings-search]')) return;      const q = e.target.value.trim().toLowerCase();
      elSettingsModal.querySelectorAll('[data-library-item]').forEach(item => { item.hidden = !!q && !item.dataset.search.includes(q); });
      elSettingsModal.querySelectorAll('[data-library-group]').forEach(group => {
        group.hidden = !group.querySelector('[data-library-item]:not([hidden])');
      });
    });

    elSettingsModal.addEventListener('submit', e => {
      const form = e.target.closest('[data-skill-form]');
      if (!form) return;
      e.preventDefault();
      const name = form.elements.name.value.trim().slice(0, SKILL_NAME_MAX);
      const desc = form.elements.desc.value.trim().slice(0, SKILL_DESC_MAX);
      const text = form.elements.text.value.trim().slice(0, SKILL_TEXT_MAX);
      if (!name || text.length < 10) { toast('Hãy nhập tên và hướng dẫn ít nhất 10 ký tự'); return; }
      const k = S.skills.find(x => x.id === form.dataset.id);
      if (k) Object.assign(k, { name, desc, text });
      else if (S.skills.length < SKILL_MAX) S.skills.push({ id: 'k' + uid(), name, desc, text, on: false });
      else { toast('Đã đạt số skill cá nhân tối đa'); return; }
      saveSkills(); paintMode(); renderSettingsTab();
    });
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && elSettingsModal && !elSettingsModal.hidden) closeArisSettingsModal();
  });

  // Làm nóng kết nối khi mở ứng dụng và khi chọn ô nhập.
  let warmAt = 0;
  function warm() {
    const n = Date.now();
    if (n - warmAt < 45000 || typeof gasUrl !== 'function' || !gasUrl()) return;
    warmAt = n;
    try { fetch(gasUrl(), { method: 'OPTIONS' }).catch(() => {}); } catch (e) {}
  }
  elTa.addEventListener('focus', warm);

  /* ---------- Đồng bộ accent màu chủ đạo ---------- */
  function applyAccentFromStorage() {
    try {
      const keys = ['desktop-accent', 'desktop-accent-color', 'accent-color', 'accent', 'login-accent', 'a3k64-accent'];
      let raw = '';
      for (const k of keys) {
        raw = localStorage.getItem(k);
        if (raw) break;
      }
      if (!raw && window.parent && window.parent !== window) {
        try {
          for (const k of keys) {
            raw = window.parent.localStorage.getItem(k);
            if (raw) break;
          }
        } catch (_) {}
      }
      if (!raw) return;
      let hex = raw.trim();
      if (!hex.startsWith('#') && /^[0-9a-fA-F]{3,8}$/.test(hex)) hex = '#' + hex;
      if (!/^#([0-9a-fA-F]{3}){1,2}$/.test(hex) && !/^#([0-9a-fA-F]{4}){1,2}$/.test(hex)) return;

      let r = 20, g = 184, b = 166;
      let cleanHex = hex.replace('#', '');
      if (cleanHex.length === 3) {
        r = parseInt(cleanHex[0] + cleanHex[0], 16);
        g = parseInt(cleanHex[1] + cleanHex[1], 16);
        b = parseInt(cleanHex[2] + cleanHex[2], 16);
      } else if (cleanHex.length >= 6) {
        r = parseInt(cleanHex.slice(0, 2), 16);
        g = parseInt(cleanHex.slice(2, 4), 16);
        b = parseInt(cleanHex.slice(4, 6), 16);
      }
      const rgbStr = `${r}, ${g}, ${b}`;

      function adjustBrightness(percent) {
        const t = percent < 0 ? 0 : 255;
        const p = Math.abs(percent) / 100;
        const nr = Math.round((t - r) * p + r);
        const ng = Math.round((t - g) * p + g);
        const nb = Math.round((t - b) * p + b);
        return `#${((1 << 24) + (nr << 16) + (ng << 8) + nb).toString(16).slice(1)}`;
      }

      const hoverColor = r * 0.299 + g * 0.587 + b * 0.114 > 150 ? adjustBrightness(-15) : adjustBrightness(15);
      const contrastColor = r * 0.299 + g * 0.587 + b * 0.114 > 165 ? '#0f172a' : '#ffffff';

      const rootEl = document.documentElement;
      rootEl.style.setProperty('--a3-accent', hex);
      rootEl.style.setProperty('--a3-accent-rgb', rgbStr);
      rootEl.style.setProperty('--a3-accent-hover', hoverColor);
      rootEl.style.setProperty('--a3-accent-soft', `rgba(${rgbStr}, 0.14)`);
      rootEl.style.setProperty('--a3-accent-border', `rgba(${rgbStr}, 0.32)`);
      rootEl.style.setProperty('--a3-accent-contrast', contrastColor);
      rootEl.style.setProperty('--desktop-accent', hex);
    } catch (_) {}
  }

  window.addEventListener('message', e => {
    try {
      const data = e.data;
      if (!data) return;
      if (data.type === 'a3-accent-sync' || data.type === 'a3k64-accent-sync' || data.accent) {
        const hex = data.accent || data.color || data.value;
        if (hex) {
          try {
            localStorage.setItem('desktop-accent', hex);
            localStorage.setItem('a3k64-accent', hex);
          } catch (_) {}
          applyAccentFromStorage();
        }
      }
    } catch (_) {}
  });

  window.addEventListener('storage', e => {
    if (!e.key || ['desktop-accent', 'desktop-accent-color', 'accent-color', 'accent', 'login-accent', 'a3k64-accent'].includes(e.key)) {
      applyAccentFromStorage();
    }
  });

  /* ---------- Khởi động ---------- */
  (async function init() {
    applyAccentFromStorage();
    S.user = username() || 'guest';
    db = await dbOpen();    bookDb = await bookDbOpen();    if (!db) $('#cx-sidefoot').textContent = 'Trình duyệt chặn lưu trữ — lịch sử chỉ giữ tới khi đóng trang.';    S.threads = await dbAll(S.user);
    S.threads.forEach(t => { if (t.rev == null) { t.rev = t.updatedAt || Date.now(); t.dirty = true; } });   // lịch sử cũ → đẩy lên server lần đầu
    loadSkills(); loadLib();
    newThread();
    paintSync(); scheduleSync(400);
    applyArisPrefs();
    loadArisPrefsFromCloud().catch(() => {});
    paintLevel(); paintMode(); autosize(); refreshQuota(false);
    typeof warm === 'function' && warm();    recoverPending().catch(() => {});          // trang vừa tải lại giữa lúc AI đang viết → nhặt lại và viết cho xong
  })();})();
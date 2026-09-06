/* ============================================================
   A3K64 — Notification Center (notify.js)
   Pill nổi kiểu iOS/Android, dùng chung cho mọi app.
   API:
     A3Notify.show(message, options?)
     A3Notify.success(message, options?)
     A3Notify.error(message, options?)
     A3Notify.info(message, options?)
     A3Notify.warn(message, options?)
     A3Notify.broadcast(message, options?)   ← gửi tới MỌI user online
   Options: { type, duration, action: { label, fn } }
   Broadcast options thêm: { gasUrl }
   ============================================================ */
(function (global) {
  'use strict';

  const ROOT_ID    = 'a3k64-notify-root';
  const STYLE_ID   = 'a3k64-notify-style';
  const DURATION   = { success: 3200, info: 3600, warn: 4200, error: 5000 };
  const ICONS = {
    success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
    error:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`,
    warn:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    info:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
  };

  /* ── Inject CSS một lần ── */
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #${ROOT_ID} {
        position: fixed;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        pointer-events: none;
        width: max-content;
        max-width: min(480px, calc(100vw - 32px));
      }

      .a3n-pill {
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 10px 16px 10px 13px;
        border-radius: 999px;
        font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
        font-size: 13.5px;
        font-weight: 600;
        line-height: 1.3;
        white-space: nowrap;
        max-width: 100%;
        cursor: default;
        user-select: none;
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        box-shadow:
          0 4px 24px rgba(0,0,0,.28),
          0 1px 4px rgba(0,0,0,.18),
          inset 0 1px 0 rgba(255,255,255,.10);
        border: 1px solid rgba(255,255,255,.10);

        /* Hiệu ứng vào */
        animation: a3n-in .32s cubic-bezier(.34,1.4,.64,1) both;
        transition: opacity .22s ease, transform .22s ease;
      }

      .a3n-pill.a3n-out {
        animation: a3n-out .28s ease forwards;
      }

      @keyframes a3n-in {
        from { opacity: 0; transform: translateY(-14px) scale(.88); }
        to   { opacity: 1; transform: translateY(0)     scale(1); }
      }
      @keyframes a3n-out {
        from { opacity: 1; transform: scale(1); }
        to   { opacity: 0; transform: scale(.88) translateY(-8px); }
      }
      @media (prefers-reduced-motion: reduce) {
        .a3n-pill { animation: none !important; }
        .a3n-pill.a3n-out { opacity: 0; animation: none !important; }
      }

      /* ── Màu theo type ── */
      .a3n-pill.a3n-success {
        background: rgba(16, 185, 129, .92);
        color: #fff;
      }
      .a3n-pill.a3n-error {
        background: rgba(239, 68, 68, .92);
        color: #fff;
      }
      .a3n-pill.a3n-warn {
        background: rgba(245, 158, 11, .92);
        color: #fff;
      }
      .a3n-pill.a3n-info {
        background: rgba(30, 41, 59, .92);
        color: #f8fafc;
      }
      [data-theme="light"] .a3n-pill.a3n-info {
        background: rgba(255, 255, 255, .94);
        color: #0f172a;
        border-color: rgba(0,0,0,.10);
        box-shadow:
          0 4px 24px rgba(0,0,0,.14),
          0 1px 4px rgba(0,0,0,.08),
          inset 0 1px 0 rgba(255,255,255,.8);
      }

      /* ── Icon wrapper ── */
      .a3n-icon {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: .95;
      }

      /* ── Text (có thể xuống dòng nếu quá dài) ── */
      .a3n-text {
        flex: 1;
        min-width: 0;
        white-space: normal;
        word-break: break-word;
      }

      /* ── Action button ── */
      .a3n-action {
        flex-shrink: 0;
        border: none;
        background: rgba(255,255,255,.18);
        color: inherit;
        font: inherit;
        font-size: 12px;
        font-weight: 700;
        padding: 3px 10px;
        border-radius: 999px;
        cursor: pointer;
        transition: background .15s;
        margin-left: 2px;
      }
      .a3n-action:hover { background: rgba(255,255,255,.28); }
      [data-theme="light"] .a3n-pill.a3n-info .a3n-action {
        background: rgba(0,0,0,.08);
        color: #0f172a;
      }

      /* ── Close button ── */
      .a3n-close {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        border: none;
        background: transparent;
        color: inherit;
        cursor: pointer;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: .6;
        border-radius: 50%;
        margin-left: 1px;
        transition: opacity .15s;
      }
      .a3n-close:hover { opacity: 1; }
    `;
    document.head.appendChild(s);
  }

  /* ── Đảm bảo root container tồn tại ── */
  function ensureRoot() {
    let el = document.getElementById(ROOT_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = ROOT_ID;
      el.setAttribute('role', 'region');
      el.setAttribute('aria-label', 'Thông báo');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    return el;
  }

  /* ── Tạo và hiển thị 1 pill ── */
  function show(message, opts) {
    opts = opts || {};
    const type     = opts.type     || 'info';
    const duration = opts.duration !== undefined ? opts.duration : (DURATION[type] || 3500);
    const action   = opts.action   || null; // { label, fn }

    injectStyle();
    const root = ensureRoot();

    const pill = document.createElement('div');
    pill.className = `a3n-pill a3n-${type}`;
    pill.setAttribute('role', 'status');

    pill.innerHTML = `
      <span class="a3n-icon" aria-hidden="true">${ICONS[type] || ICONS.info}</span>
      <span class="a3n-text">${escNotif(message)}</span>
      ${action ? `<button class="a3n-action" type="button">${escNotif(action.label)}</button>` : ''}
      <button class="a3n-close" type="button" aria-label="Đóng">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    `;

    /* Action button */
    if (action && action.fn) {
      pill.querySelector('.a3n-action').addEventListener('click', () => {
        dismiss(pill);
        try { action.fn(); } catch(e) {}
      });
    }

    /* Close button */
    pill.querySelector('.a3n-close').addEventListener('click', () => dismiss(pill));

    /* Swipe up to dismiss (mobile) */
    let startY = null;
    pill.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
    pill.addEventListener('touchmove', e => {
      if (startY === null) return;
      const dy = startY - e.touches[0].clientY;
      if (dy > 20) dismiss(pill);
    }, { passive: true });

    root.appendChild(pill);

    /* Auto dismiss */
    let timer = null;
    if (duration > 0) {
      timer = setTimeout(() => dismiss(pill), duration);
    }

    /* Pause timer on hover */
    pill.addEventListener('mouseenter', () => { if (timer) clearTimeout(timer); });
    pill.addEventListener('mouseleave', () => {
      if (duration > 0) timer = setTimeout(() => dismiss(pill), Math.min(duration, 1800));
    });

    return pill;
  }

  function dismiss(pill) {
    if (!pill || pill.classList.contains('a3n-out')) return;
    pill.classList.add('a3n-out');
    setTimeout(() => pill.remove(), 300);
  }

  function escNotif(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ============================================================
     BROADCAST SYSTEM
     Gửi thông báo tới MỌI user đang online trong hệ thống.

     Cơ chế 2 lớp:
       1. BroadcastChannel  — instant, cùng origin (mọi tab/cửa sổ
                              trên cùng thiết bị, không cần server)
       2. GAS push          — cross-device/cross-user: ghi message
                              lên Google Sheets, các tab khác poll
                              và nhận khi vòng polling tiếp theo chạy.

     Để dùng cross-device, truyền opts.gasUrl hoặc set
     A3Notify.gasUrl = '...' một lần từ desktop.js sau khi load config.
  ============================================================ */

  const BC_CHANNEL_NAME = 'a3k64-broadcast';
  const BC_POLL_KEY     = 'a3k64-bc-last';   // localStorage key cho fallback

  /* ── Client id duy nhất cho tab/thiết bị này ──
     Dùng để loại bỏ "echo": khi client A tự gửi broadcast rồi sau đó
     tự poll GAS và nhận lại CHÍNH broadcast của mình → không hiện lại. */
  function _getClientId() {
    try {
      let id = sessionStorage.getItem('a3k64-notify-client-id');
      if (!id) {
        id = 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem('a3k64-notify-client-id', id);
      }
      return id;
    } catch (err) {
      // sessionStorage không dùng được → id tạm theo phiên load trang
      return _fallbackClientId || (_fallbackClientId = 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10));
    }
  }
  let _fallbackClientId = null;
  const CLIENT_ID = _getClientId();

  /* ── BroadcastChannel (same-origin cross-tab, instant) ── */
  let _bc = null;
  function _ensureBC() {
    if (_bc) return _bc;
    if (!('BroadcastChannel' in window)) return null;
    try {
      _bc = new BroadcastChannel(BC_CHANNEL_NAME);
      _bc.onmessage = function(e) {
        const d = e.data;
        if (d && d.type === 'a3k64-broadcast' && d.message && d.origin !== CLIENT_ID) {
          // Bỏ qua broadcast từ iframe con (frameSource) nếu window này là top-level.
          // Iframe đã tự hiện pill cục bộ (showLocally=true) — desktop nhận lại
          // qua BroadcastChannel chính là nguyên nhân pill hiện 2 lần.
          if (d.frameSource && window === window.top) return;
          show(d.message, { type: d.notifType || 'info', duration: d.duration });
        }
      };
    } catch(err) { _bc = null; }
    return _bc;
  }
  /* Khởi tạo ngay khi load */
  _ensureBC();

  /* ── localStorage fallback (same-origin, hoạt động kể cả khi
     BroadcastChannel không được hỗ trợ — lắng nghe storage event) ── */
  window.addEventListener('storage', function(e) {
    if (e.key !== BC_POLL_KEY || !e.newValue) return;
    try {
      const d = JSON.parse(e.newValue);
      // Chỉ hiện nếu message được tạo trong 10s qua (tránh hiện lại khi reload)
      // và không phải echo từ chính client này (đã hiện ở bước broadcast() rồi).
      if (d && d.message && d.origin !== CLIENT_ID && (Date.now() - (d.ts || 0)) < 10000) {
        if (d.frameSource && window === window.top) return;
        show(d.message, { type: d.notifType || 'info', duration: d.duration });
      }
    } catch(err) {}
  });

  /**
   * broadcast(message, opts?)
   * Gửi thông báo ngang tới:
   *   - Tất cả tab/cửa sổ cùng origin trên máy này (BroadcastChannel + localStorage)
   *   - Tất cả user/device khác qua GAS nếu opts.gasUrl hoặc A3Notify.gasUrl được set
   *
   * opts: { type, duration, gasUrl }
   */
  function broadcast(message, opts) {
    opts = opts || {};
    const notifType = opts.type || 'info';
    const duration  = opts.duration;
    const gasUrl    = opts.gasUrl || A3Notify.gasUrl || null;
    /* Cho phép gọi ngoài (scoreboard.js) tắt việc tự hiện pill cục bộ,
       để tránh trùng với _notify() đã hiện trước đó. Mặc định vẫn hiện
       (giữ hành vi cũ) để không phá các chỗ gọi broadcast() độc lập. */
    const showLocally = opts.showLocally !== false;

    /* 1. Hiện ngay cho tab hiện tại (có thể tắt qua opts.showLocally=false) */
    if (showLocally) show(message, { type: notifType, duration });

    /* 2. BroadcastChannel → các tab khác cùng máy */
    const payload = { type: 'a3k64-broadcast', message, notifType, duration, ts: Date.now(), origin: CLIENT_ID };
    const bc = _ensureBC();
    if (bc) {
      try { bc.postMessage(payload); } catch(err) {}
    }

    /* 3. localStorage fallback → storage event trên tab khác */
    try {
      localStorage.setItem(BC_POLL_KEY, JSON.stringify(payload));
      /* Xóa ngay sau 100ms để lần sau vẫn trigger được storage event */
      setTimeout(function() {
        try { localStorage.removeItem(BC_POLL_KEY); } catch(e) {}
      }, 100);
    } catch(err) {}

    /* 4. GAS push → cross-device (user khác trên thiết bị khác) */
    if (gasUrl) {
      _pushBroadcastToGas(gasUrl, message, notifType).catch(function() {});
    }
  }

  /**
   * Ghi broadcast message lên GAS.
   * GAS action: 'pushBroadcast' — lưu vào sheet hoặc PropertiesService,
   * các client poll bằng action: 'getBroadcasts' để nhận.
   */
  async function _pushBroadcastToGas(gasUrl, message, type) {
    const url = new URL(gasUrl);
    url.searchParams.set('action', 'pushBroadcast');
    url.searchParams.set('message', message);
    url.searchParams.set('notifType', type);
    url.searchParams.set('ts', String(Date.now()));
    url.searchParams.set('origin', CLIENT_ID); // để client tự lọc echo khi poll
    url.searchParams.set('t', String(Date.now())); // cache-bust
    await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
  }

  /* ── Polling nhận broadcast từ GAS (gọi bởi desktop.js sau initDesktop) ── */
  let _bcPollTimer   = null;
  let _bcLastSeen    = Date.now(); // chỉ hiện broadcast MỚI HƠN thời điểm load

  /**
   * startBroadcastPoll(gasUrl, intervalMs?)
   * Bắt đầu poll GAS để nhận broadcast từ user khác.
   * Gọi từ desktop.js sau khi biết gasUrl.
   * intervalMs mặc định 12000 (12s) — đủ nhanh mà không spam GAS.
   */
  function startBroadcastPoll(gasUrl, intervalMs) {
    stopBroadcastPoll();
    if (!gasUrl) return;
    intervalMs = intervalMs || 12000;

    async function poll() {
      try {
        const url = new URL(gasUrl);
        url.searchParams.set('action', 'getBroadcasts');
        url.searchParams.set('since', String(_bcLastSeen));
        url.searchParams.set('t', String(Date.now()));
        const res  = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
        const json = await res.json();
        const items = Array.isArray(json?.data) ? json.data : [];
        items.forEach(function(item) {
          if (!item || !item.message) return;
          const ts = Number(item.ts) || 0;
          if (ts <= _bcLastSeen) return;
          _bcLastSeen = ts;
          // Bỏ qua broadcast do CHÍNH client này gửi lên GAS — client đã tự
          // hiện pill ngay khi gửi (bước 1 trong broadcast()), nên nếu không
          // lọc ở đây, mỗi lần poll sẽ hiện lại broadcast của chính mình
          // (đây chính là nguyên nhân pill hiện tới 3 lần).
          if (item.origin && item.origin === CLIENT_ID) return;
          show(item.message, { type: item.notifType || 'info' });
        });
      } catch(err) {
        /* Mạng lỗi hoặc GAS chưa có action getBroadcasts — im lặng */
      }
    }

    poll(); // chạy ngay lần đầu
    _bcPollTimer = setInterval(poll, intervalMs);
  }

  function stopBroadcastPoll() {
    if (_bcPollTimer) { clearInterval(_bcPollTimer); _bcPollTimer = null; }
  }

  /* ── Public API ── */
  const A3Notify = {
    show,
    success: (msg, opts) => show(msg, Object.assign({ type: 'success' }, opts)),
    error:   (msg, opts) => show(msg, Object.assign({ type: 'error'   }, opts)),
    warn:    (msg, opts) => show(msg, Object.assign({ type: 'warn'    }, opts)),
    info:    (msg, opts) => show(msg, Object.assign({ type: 'info'    }, opts)),
    broadcast,
    startBroadcastPoll,
    stopBroadcastPoll,
    gasUrl: null, // set từ ngoài: A3Notify.gasUrl = window.A3K64_CONFIG?.gasUrl
  };

  global.A3Notify = A3Notify;
})(window);
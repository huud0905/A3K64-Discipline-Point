/* ============================================================
   A3K64 — AI proxy dùng chung (window.A3AI)
   - Mọi lệnh gọi AI đi qua backend (action 'aiCall'), kèm token đăng nhập.
   - Không còn key Gemini riêng trong localStorage (tự xoá nếu còn sót).
   - Hết lượt miễn phí → backend trả locked:true → hiện hộp "Nâng cấp".
   Nạp file này SAU config.js và TRƯỚC scoreboard-ai.js.
   ============================================================ */
(function () {
  'use strict';

  // Dọn key cũ: từ giờ không còn chức năng nhập key riêng.
  try { localStorage.removeItem('a3k64-gemini-key'); } catch {}

  // Liên hệ để nâng cấp — ĐỔI cho đúng (Zalo/Facebook/email của bạn).
  const UPGRADE_CONTACT = window.A3K64_CONFIG?.upgradeContact || 'Liên hệ quản trị viên để nâng cấp.';

  function gasUrl() {
    return window.A3K64_CONFIG?.gasUrl || '';
  }

  function readToken() {
    try { const s = sessionStorage.getItem('a3k64-session-token'); if (s) return s; } catch {}
    try {
      const l = JSON.parse(localStorage.getItem('a3k64-session-token') || 'null');
      if (l?.token && !(l.expiresAt && Date.now() > l.expiresAt)) return l.token;
    } catch {}
    return '';
  }

  async function post(action, extra) {
    const url = gasUrl();
    if (!url) throw new Error('Chưa cấu hình máy chủ (gasUrl).');
    const token = readToken();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: JSON.stringify({ action, sessionToken: token, ...extra }),
    });
    if (!res.ok) throw new Error('Proxy lỗi: HTTP ' + res.status);
    return res.json();
  }

  /* ---------- Bảng giá / nâng cấp ----------
     Sửa giá + quyền lợi ở mảng PLANS bên dưới (hoặc ghi đè bằng A3K64_CONFIG.plans).
     id phải trùng khoá trong AI_PLANS ở backend (free / plus / max). */
  const PLANS = window.A3K64_CONFIG?.plans || [
    { id: 'free', name: 'Miễn phí', tagline: 'Quản lý lớp đầy đủ, dùng thử AI', price: '0đ', per: '/ tuần',
      features: ['Chấm điểm, bảng điểm, trực nhật, sơ đồ chỗ ngồi, hồ sơ: dùng đầy đủ', 'Xuất Excel, chụp ảnh và In bảng điểm', 'Tổng kết: xem dạng bảng cơ bản', 'AI: 3 lượt/tuần/người, lưu được kết quả (Tự tính điểm, Nhận xét thi đua, AI xoá, AI ghi chú Trực nhật)'] },
    { id: 'plus', name: 'Plus', tagline: 'Đủ dùng cho cả tháng', price: '49.000đ', per: '/ tháng',
      features: ['Mọi thứ trong Miễn phí', 'Tổng kết: xuất Excel, In, AI nhận xét học sinh / cả lớp / ai tiến bộ-sa sút', '100 lượt AI mỗi tháng, dùng chung cả lớp', 'Chỉ cần 1 người mua, cả lớp cùng dùng'] },
    { id: 'max', name: 'Max', tagline: 'Dùng thoải mái, không đếm lượt', price: '99.000đ', per: '/ tháng',
      features: ['Mọi thứ trong Plus', 'AI không giới hạn cho cả lớp', 'AI chạy tự động: Hậu kiểm AI sau mỗi lần lưu, Quét AI nền', 'Tổng kết: biểu đồ, hỏi AI tự do, so sánh 2 kỳ, báo cáo gửi giáo viên', 'Theme & hình nền cao cấp cho mọi người'] },
  ];

  /* Giá lấy từ server, cache vào localStorage để lần mở sau hiện đúng ngay (không nháy giá cũ) */
  const PRICE_KEY = 'a3-plan-prices-v1';
  const fmtVnd = n => Number(n).toLocaleString('vi-VN') + 'đ';
  let pricesReady = false;
  function applyPrices(pr) {
    if (!pr || typeof pr !== 'object') return false;
    let ch = false;
    PLANS.forEach(p => {
      const v = Number(pr[p.id]);
      if (v > 0) { const t = fmtVnd(v); if (p.price !== t) { p.price = t; ch = true; } }
    });
    pricesReady = true;
    return ch;
  }
  function savePrices(pr) { try { localStorage.setItem(PRICE_KEY, JSON.stringify(pr)); } catch {} }
  try { applyPrices(JSON.parse(localStorage.getItem(PRICE_KEY) || 'null')); } catch {}

  /* Gói đang dùng: cache theo tài khoản, nạp ngay khi trang chạy; server xác nhận lại ở nền */
  const PLAN_KEY = 'a3-plan-cur-v1';
  let curPlanCache = 'free', planKnown = false, curUnlimited = false;
  try {
    const c = JSON.parse(localStorage.getItem(PLAN_KEY) || 'null');
    if (c && c.plan && c.u && c.u === currentUsername()) { curPlanCache = c.plan; planKnown = true; curUnlimited = !!c.ul; }
  } catch {}
  function applyEnt(en) {
    if (!en || en.ok === false) return;
    if (en.prices) { applyPrices(en.prices); savePrices(en.prices); }
    if (en.aiFreeUsage) {
      const p = planKey(en.aiFreeUsage.plan);
      curPlanCache = p; planKnown = true;
      curUnlimited = !!(en.features && en.features.ai_unlimited);   // admin mở khoá cả lớp cũng tính là trả phí
      try { localStorage.setItem(PLAN_KEY, JSON.stringify({ u: currentUsername(), plan: p, ul: curUnlimited })); } catch {}
    }
  }

  function injectUpgradeCss() {
    if (document.getElementById('a3up-css')) return;
    const st = document.createElement('style');
    st.id = 'a3up-css';
    st.textContent = `
/* Màu theo chế độ sáng/tối: đọc data-theme trên <html> (do desktop/settings đặt), mặc định tối.
   Màu nhấn lấy --accent của ứng dụng nên đổi theo cài đặt cá nhân. */
#a3up{--u-backdrop:rgba(3,8,16,.66);--u-panel:#0b1422;--u-card:#08111e;--u-line:#1f2d42;--u-text:#f1f5f9;
  --u-sub:#94a3b8;--u-dim:#64748b;--u-alt:#101d30;--u-alt-h:#16263d;--u-shadow:0 24px 70px rgba(0,0,0,.55);
  --u-accent:var(--accent,#2563eb);--u-accent-fg:#fff}
:root[data-theme="light"] #a3up{--u-backdrop:rgba(15,23,42,.42);--u-panel:#ffffff;--u-card:#f8fafc;--u-line:#e2e8f0;
  --u-text:#0f172a;--u-sub:#475569;--u-dim:#94a3b8;--u-alt:#f1f5f9;--u-alt-h:#e2e8f0;--u-shadow:0 24px 70px rgba(15,23,42,.22)}
#a3up{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:18px;
  background:var(--u-backdrop);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:var(--u-text);
  font-family:inherit;font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif}
#a3up *{box-sizing:border-box}
#a3up .a3up-panel{position:relative;width:100%;max-width:1000px;max-height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch;
  background:var(--u-panel);border:1px solid var(--u-line);border-radius:20px;box-shadow:var(--u-shadow);padding:36px 28px 26px}
#a3up .a3up-x{position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:10px;border:1px solid var(--u-line);
  background:var(--u-alt);color:var(--u-text);font-size:19px;line-height:1;cursor:pointer}
#a3up .a3up-x:hover{background:var(--u-alt-h)}
#a3up h2{margin:0;text-align:center;font-size:clamp(22px,3.4vw,30px);font-weight:700;line-height:1.2;letter-spacing:-.015em}
#a3up .a3up-sub{margin:10px auto 0;max-width:520px;text-align:center;font-size:14px;line-height:1.55;color:var(--u-sub)}
#a3up .a3up-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-top:26px}
#a3up .a3up-card{display:flex;flex-direction:column;background:var(--u-card);border:1px solid var(--u-line);border-radius:16px;overflow:hidden}
#a3up .a3up-card.is-cur{border-color:var(--u-accent);box-shadow:0 0 0 1px var(--u-accent)}
#a3up .a3up-top{padding:20px 20px 16px}
#a3up .a3up-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
#a3up .a3up-name{margin:0;font-size:19px;font-weight:700;line-height:1.2}
#a3up .a3up-badge{font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;white-space:nowrap;
  color:var(--u-accent);background:color-mix(in srgb,var(--u-accent) 14%,transparent)}
#a3up .a3up-tag{margin:4px 0 0;font-size:13px;color:var(--u-sub);min-height:18px}
#a3up .a3up-price{display:flex;align-items:baseline;gap:6px;margin:16px 0 14px}
#a3up .a3up-price b{font-size:28px;font-weight:700;letter-spacing:-.02em}
#a3up .a3up-price span{font-size:12px;color:var(--u-sub)}
#a3up .a3up-btn{width:100%;padding:10px 14px;border-radius:10px;border:1px solid transparent;background:var(--u-accent);
  color:var(--u-accent-fg);font:600 14px Inter,system-ui,sans-serif;cursor:pointer;transition:filter .15s}
#a3up .a3up-btn:hover{filter:brightness(1.1)}
#a3up .a3up-btn[disabled]{background:var(--u-alt);color:var(--u-dim);border-color:var(--u-line);cursor:default;filter:none}
#a3up .a3up-btn.alt{background:var(--u-alt);color:var(--u-text);border-color:var(--u-line)}
#a3up .a3up-btn.alt:hover{background:var(--u-alt-h);filter:none}
#a3up .a3up-note{margin:8px 0 0;text-align:center;font-size:12px;color:var(--u-dim)}
#a3up .a3up-feat{margin:0;padding:14px 20px 20px;list-style:none;border-top:1px solid var(--u-line);flex:1}
#a3up .a3up-feat li{position:relative;padding:5px 0 5px 24px;font-size:13.5px;line-height:1.45;color:var(--u-text)}
#a3up .a3up-feat li::before{content:"";position:absolute;left:3px;top:9px;width:5px;height:9px;border:solid var(--u-accent);
  border-width:0 2px 2px 0;transform:rotate(45deg)}
#a3up .a3up-foot{margin:18px 0 0;text-align:center;font-size:12px;color:var(--u-dim)}
#a3up .a3up-req{max-width:460px;margin:0 auto;padding:6px 0 0}
#a3up .a3up-req h3{margin:0 0 6px;font-size:20px;font-weight:700}
#a3up .a3up-req p{margin:0 0 14px;font-size:13.5px;line-height:1.55;color:var(--u-sub)}
#a3up .a3up-msg{width:100%;resize:none;padding:11px 12px;border-radius:10px;border:1px solid var(--u-line);background:var(--u-card);
  color:var(--u-text);font:13.5px/1.5 Inter,system-ui,sans-serif}
#a3up .a3up-row{display:flex;gap:10px;margin-top:12px}
#a3up button:focus-visible{outline:2px solid var(--u-accent);outline-offset:2px}
#a3up .a3up-pay{max-width:430px;margin:0 auto;text-align:center}
#a3up .a3up-pay h3{margin:0 0 4px;font-size:20px;font-weight:700}
#a3up .a3up-pay .a3up-hint{margin:0 0 14px;font-size:13px;color:var(--u-sub)}
#a3up .a3up-qr{display:inline-block;padding:10px;background:#fff;border-radius:14px;border:1px solid var(--u-line)}
#a3up .a3up-qr img{display:block;width:230px;height:230px;max-width:100%}
#a3up .a3up-qr-load{width:230px;height:230px;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:13px}
#a3up .a3up-info{margin:14px 0 0;text-align:left;background:var(--u-card);border:1px solid var(--u-line);border-radius:12px;padding:4px 14px}
#a3up .a3up-info .r{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--u-line);font-size:13.5px}
#a3up .a3up-info .r:last-child{border-bottom:0}
#a3up .a3up-info .k{color:var(--u-sub);flex-shrink:0}
#a3up .a3up-info .v{font-weight:600;text-align:right;word-break:break-all}
#a3up .a3up-cp{margin-left:8px;padding:2px 8px;border-radius:7px;border:1px solid var(--u-line);background:var(--u-alt);color:var(--u-text);font:600 11.5px Inter,system-ui,sans-serif;cursor:pointer}
#a3up .a3up-state{margin-top:14px;padding:10px 12px;border-radius:10px;font-size:13.5px;font-weight:600;background:color-mix(in srgb,#f59e0b 16%,transparent);color:#d97706}
#a3up .a3up-state.ok{background:color-mix(in srgb,#16a34a 16%,transparent);color:#16a34a}
#a3up .a3up-state.bad{background:color-mix(in srgb,#dc2626 14%,transparent);color:#dc2626}
#a3up .a3up-cd{margin-top:6px;font-size:12px;color:var(--u-dim);min-height:16px}
#a3up .a3up-ok-ic{width:60px;height:60px;border-radius:50%;margin:6px auto 12px;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;color:#fff;background:#16a34a}
@media (max-width:520px){#a3up{padding:0;align-items:stretch}
  #a3up .a3up-panel{border-radius:0;border:0;max-height:none;padding:56px 16px 22px}}
`;
    document.head.appendChild(st);
  }

  const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const planKey = p => (p === 'pro' ? 'max' : (p || 'free'));   // 'pro' cũ = 'max'

  function currentUsername() {
    try {
      const u = JSON.parse(sessionStorage.getItem('a3k64-user') || localStorage.getItem('a3k64-user') || 'null') || {};
      return u.username || u.email || u.user || '';
    } catch { return ''; }
  }

  function showUpgrade(msg) {
    if (document.getElementById('a3up')) return;
    injectUpgradeCss();
    const root = document.createElement('div');
    root.id = 'a3up';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'a3up-title');
    const prevFocus = document.activeElement;
    let curPlan = planKnown ? curPlanCache : 'free';
    let timers = [];
    const clearTimers = () => { timers.forEach(t => { clearInterval(t); clearTimeout(t); }); timers = []; };

    function close() {
      clearTimers();
      document.removeEventListener('keydown', onKey, true);
      root.remove();
      try { prevFocus && prevFocus.focus && prevFocus.focus(); } catch {}
    }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    document.addEventListener('keydown', onKey, true);

    function renderPlans() {
      const cards = PLANS.map(p => {
        const isCur = p.id === curPlan;
        const btn = isCur
          ? '<button class="a3up-btn" disabled>Gói hiện tại</button>'
          : (p.id === 'free'
              ? '<button class="a3up-btn" disabled>Gói mặc định</button>'
              : `<button class="a3up-btn" data-pick="${escHtml(p.id)}">Chọn gói ${escHtml(p.name)}</button>`);
        return `<section class="a3up-card${isCur ? ' is-cur' : ''}">
          <div class="a3up-top">
            <div class="a3up-head"><h3 class="a3up-name">${escHtml(p.name)}</h3>${isCur ? '<span class="a3up-badge">Đang dùng</span>' : ''}</div>
            <p class="a3up-tag">${escHtml(p.tagline)}</p>
            <div class="a3up-price"><b>${escHtml(pricesReady || p.id === 'free' ? p.price : '…')}</b><span>${escHtml(p.per)}</span></div>
            ${btn}
            ${p.id !== 'free' && !isCur ? '<p class="a3up-note">Không ràng buộc · Hết hạn tự về Miễn phí</p>' : ''}
          </div>
          <ul class="a3up-feat">${p.features.map(f => `<li>${escHtml(f)}</li>`).join('')}</ul>
        </section>`;
      }).join('');
      root.innerHTML =
        '<div class="a3up-panel">' +
        '<button class="a3up-x" aria-label="Đóng" data-close>×</button>' +
          '<h2 id="a3up-title">Chọn gói phù hợp với bạn</h2>' +
          '<p class="a3up-sub">' + escHtml(msg || 'Bạn đã dùng hết lượt AI của gói hiện tại.') + '</p>' +
          '<div class="a3up-grid">' + cards + '</div>' +
          '<p class="a3up-foot">Giá và quyền lợi có thể thay đổi. Gói áp dụng cho CẢ LỚP — chỉ cần 1 bạn mua, mọi người cùng dùng.</p>' +
        '</div>';
      root.querySelector('[data-close]').focus();
    }

    const vnd = n => Number(n).toLocaleString('vi-VN') + 'đ';

    // Bấm chọn gói → tạo mã thanh toán ở server → hiện QR → tự dò trạng thái
    async function renderRequest(planId) {
      clearTimers();
      const p = PLANS.find(x => x.id === planId) || PLANS[1];
      root.innerHTML = '<div class="a3up-panel"><button class="a3up-x" aria-label="Đóng" data-close>×</button>' +
        '<div class="a3up-pay"><h3>Gói ' + escHtml(p.name) + '</h3><p class="a3up-hint">Đang tạo mã thanh toán…</p>' +
        '<div class="a3up-qr"><div class="a3up-qr-load">Đang tạo mã QR…</div></div></div></div>';
      let d;
      try {
        const w = await post('createPayment', { plan: p.id });
        d = (w && w.data && typeof w.data === 'object' && 'ok' in w.data) ? w.data : w;
      } catch (err) { d = { ok: false, error: err.message }; }
      if (!document.getElementById('a3up')) return;           // đã đóng hộp thoại trong lúc chờ
      if (d && d.ok) return renderPay(d, p);
      if (d && d.code === 'no_payment_config') return renderManual(planId);   // chưa bật thanh toán tự động → cách cũ
      root.innerHTML = '<div class="a3up-panel"><button class="a3up-x" aria-label="Đóng" data-close>×</button>' +
        '<div class="a3up-pay"><h3>Chưa tạo được mã thanh toán</h3>' +
        '<div class="a3up-state bad">' + escHtml((d && d.error) || 'Lỗi không xác định.') + '</div>' +
        '<div class="a3up-row"><button class="a3up-btn alt" data-back>Quay lại</button>' +
        '<button class="a3up-btn" data-retry="' + escHtml(p.id) + '">Thử lại</button></div></div></div>';
    }

    function renderPay(d, p) {
      const rows = [
        ['Ngân hàng', escHtml(d.bank), ''],
        ['Số tài khoản', escHtml(d.accountNumber), d.accountNumber],
        d.accountName ? ['Chủ tài khoản', escHtml(d.accountName), ''] : null,
        ['Số tiền', escHtml(vnd(d.amount)), String(d.amount)],
        ['Nội dung CK', escHtml(d.code), d.code],
      ].filter(Boolean).map(([k, v, cp]) =>
        '<div class="r"><span class="k">' + k + '</span><span class="v">' + v +
        (cp ? '<button type="button" class="a3up-cp" data-copyval="' + escHtml(cp) + '">Chép</button>' : '') + '</span></div>').join('');
      root.innerHTML =
        '<div class="a3up-panel"><button class="a3up-x" aria-label="Đóng" data-close>×</button>' +
        '<div class="a3up-pay">' +
          '<h3>Thanh toán gói ' + escHtml(p.name) + ' · ' + escHtml(vnd(d.amount)) + '</h3>' +
          '<p class="a3up-hint">Mở app ngân hàng → quét mã QR → giữ nguyên số tiền và nội dung. Gói sẽ tự kích hoạt cho <b>cả lớp</b> sau khi tiền về.</p>' +
          '<div class="a3up-qr"><img alt="Mã QR thanh toán" src="' + escHtml(d.qrUrl) + '"></div>' +
          '<div class="a3up-info">' + rows + '</div>' +
          '<div class="a3up-state" data-state>Đang chờ thanh toán…</div>' +
          '<div class="a3up-cd" data-cd></div>' +
          '<div class="a3up-row"><button class="a3up-btn alt" data-back>Chọn gói khác</button></div>' +
        '</div></div>';

      const stEl = () => root.querySelector('[data-state]');
      const setState = (txt, cls) => { const e = stEl(); if (e) { e.textContent = txt; e.className = 'a3up-state' + (cls ? ' ' + cls : ''); } };
      const endAll = () => { clearTimers(); const c = root.querySelector('[data-cd]'); if (c) c.textContent = ''; };

      // Đồng hồ đếm ngược
      const cd = setInterval(() => {
        const left = Math.max(0, Math.floor((d.expiresAt - Date.now()) / 1000));
        const c = root.querySelector('[data-cd]');
        if (c) c.textContent = left > 0 ? 'Mã QR còn hiệu lực ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') : '';
      }, 1000);
      timers.push(cd);

      // Dò trạng thái mỗi 3 giây
      let busy = false;
      const poll = setInterval(async () => {
        if (busy) return; busy = true;
        try {
          const w = await post('getPaymentStatus', { code: d.code });
          const r = (w && w.data && typeof w.data === 'object' && 'ok' in w.data) ? w.data : w;
          if (!document.getElementById('a3up')) return;
          if (r.status === 'paid') { endAll(); return renderPaid(p); }
          if (r.status === 'expired') {
            endAll();
            setState('Mã QR đã hết hạn. Nếu bạn đã chuyển tiền rồi thì gói vẫn tự kích hoạt khi tiền về, không cần làm gì thêm.', 'bad');
            const row = root.querySelector('.a3up-row');
            if (row) row.insertAdjacentHTML('beforeend', '<button class="a3up-btn" data-retry="' + escHtml(p.id) + '">Tạo mã mới</button>');
          } else if (r.status === 'underpaid') {
            endAll(); setState('Số tiền chuyển chưa đủ. Hãy liên hệ quản trị viên để được hỗ trợ (kèm nội dung CK ' + d.code + ').', 'bad');
          } else if (r.status === 'review') {
            endAll(); setState('Đã nhận tiền, quản trị viên sẽ xác nhận gói cho lớp sớm nhất.', 'ok');
          } else if (r.status === 'cancelled') {
            endAll(); setState('Mã này đã bị thay bằng mã mới. Hãy mở lại bảng giá để lấy mã mới.', 'bad');
          }
        } catch { /* mất mạng thoáng qua: lần dò sau tự thử lại */ }
        finally { busy = false; }
      }, 3000);
      timers.push(poll);
    }

    function renderPaid(p) {
      root.innerHTML =
        '<div class="a3up-panel"><button class="a3up-x" aria-label="Đóng" data-close>×</button>' +
        '<div class="a3up-pay"><div class="a3up-ok-ic">✓</div><h3>Thanh toán thành công</h3>' +
        '<p class="a3up-hint">Gói ' + escHtml(p.name) + ' đã được kích hoạt cho cả lớp. Mọi bạn trong lớp tải lại trang là dùng được.</p>' +
        '<div class="a3up-row"><button class="a3up-btn" data-close>Đóng</button></div></div></div>';
      try { window.dispatchEvent(new CustomEvent('a3-plan-changed', { detail: { plan: p.id } })); } catch {}
    }

    // Khi chưa có thanh toán tự động: người dùng sao chép tin nhắn và liên hệ quản trị viên (không còn gửi yêu cầu trong app)
    function renderManual(planId) {
      const p = PLANS.find(x => x.id === planId) || PLANS[1];
      const who = currentUsername();
      const text = `Mình muốn nâng cấp gói ${p.name} (${p.price} ${p.per})` + (who ? ` cho cả lớp (người mua: ${who}).` : ' cho cả lớp.');
      root.innerHTML =
        '<div class="a3up-panel"><button class="a3up-x" aria-label="Đóng" data-close>×</button>' +
        '<div class="a3up-req">' +
          '<h3>Nâng cấp gói ' + escHtml(p.name) + '</h3>' +
          '<p>Thanh toán tự động chưa mở. Hãy sao chép tin nhắn dưới đây gửi cho quản trị viên, gói sẽ được kích hoạt cho cả lớp (mọi bạn trong lớp đều dùng được).</p>' +
          '<textarea class="a3up-msg" rows="3" readonly>' + escHtml(text) + '</textarea>' +
          '<p style="margin:12px 0 0">' + escHtml(UPGRADE_CONTACT) + '</p>' +
          '<div class="a3up-row">' +
            '<button class="a3up-btn alt" data-back>Quay lại</button>' +
            '<button class="a3up-btn" data-copy>Sao chép</button>' +
          '</div>' +
        '</div></div>';
      root.querySelector('[data-copy]').focus();
      root.querySelector('[data-copy]').addEventListener('click', async e => {
        const b = e.currentTarget;
        try { await navigator.clipboard.writeText(text); }
        catch { const t = root.querySelector('.a3up-msg'); t.select(); document.execCommand && document.execCommand('copy'); }
        b.textContent = 'Đã sao chép';
      });
    }

    root.addEventListener('click', e => {
      if (e.target === root || e.target.closest('[data-close]')) return close();
      const pick = e.target.closest('[data-pick]');
      if (pick) return renderRequest(pick.dataset.pick);
      const retry = e.target.closest('[data-retry]');
      if (retry) return renderRequest(retry.dataset.retry);
      const cp = e.target.closest('[data-copyval]');
      if (cp) {
        const val = cp.dataset.copyval;
        (navigator.clipboard ? navigator.clipboard.writeText(val) : Promise.reject()).catch(() => {
          const t = document.createElement('textarea'); t.value = val; document.body.appendChild(t); t.select();
          try { document.execCommand('copy'); } catch {} t.remove();
        });
        cp.textContent = 'Đã chép';
        return;
      }
      if (e.target.closest('[data-back]')) { clearTimers(); renderPlans(); }
    });

    renderPlans();
    document.body.appendChild(root);
    root.querySelector('[data-close]').focus();

    // Hộp thoại mở ra là có sẵn giá + gói từ cache/tải trước; chỉ vẽ lại nếu server trả khác
    const snap = () => PLANS.map(p => p.price).join('|') + '#' + curPlanCache + pricesReady;
    const before = snap();
    refreshEnt().then(() => {
      if (!pricesReady) pricesReady = true;                      // lỗi mạng → dùng giá dự phòng
      if (planKnown) curPlan = curPlanCache;
      if (document.getElementById('a3up') && root.querySelector('.a3up-grid') && snap() !== before) renderPlans();
    });
  }

  /* ---------- Gọi Gemini qua backend ----------
     Trả JSON y hệt Gemini. Lỗi ném ra có thể kèm:
       err.httpStatus  — mã HTTP từ Gemini (nếu có)
       err.locked      — true khi hết lượt miễn phí / cần nâng cấp
       err.__aiFatal   — true khi nên DỪNG hẳn, không thử model khác */
  // Mã phiên: mọi lệnh gọi AI của cùng 1 lần chạy tính năng dùng chung 1 mã → server chỉ trừ 1 lượt khi có kết quả.
  function newSession() {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  // feature (tuỳ chọn): 'audit' = Hậu kiểm/Quét AI nền (gói Max), 'duty_note' = AI ghi chú Trực nhật (mọi gói).
  // Server dựa vào đây để khoá đúng gói TRƯỚC khi trừ lượt.
  async function callGemini(model, body, sid, feature) {
    const wrapper = await post('aiCall', { model, geminiBody: body, ...(sid ? { quotaSession: sid } : {}), ...(feature ? { aiFeature: feature } : {}) });
    const inner = wrapper && wrapper.data;

    // backend bọc kết quả trong { ok:true, data:{...} }; locked nằm ở data
    const res = (inner && typeof inner === 'object' && ('locked' in inner || 'ok' in inner)) ? inner : wrapper;
    if (res && res.locked) {
      const err = new Error(res.error || 'Đã hết lượt AI miễn phí tuần này.');
      err.locked = true; err.__aiFatal = true; err.feature = res.feature;
      showUpgrade(err.message);
      throw err;
    }
    if (!wrapper || wrapper.ok === false) {
      const err = new Error((wrapper && wrapper.error) || 'Proxy trả về lỗi không xác định');
      if (/đăng nhập|phiên|session/i.test(err.message)) err.__aiFatal = true;
      throw err;
    }
    if (inner && typeof inner === 'object' && inner.ok === false) {
      const err = new Error(inner.error || 'Gemini lỗi không xác định');
      err.httpStatus = inner.httpStatus || 0;
      if (/đăng nhập|phiên|session/i.test(err.message)) err.__aiFatal = true;
      throw err;
    }
    return inner;
  }

  /* ---------- Xem gói + lượt AI đã dùng ---------- */
  async function getEntitlements() {
    try {
      const w = await post('getEntitlements', {});
      const en = (w && w.data) || w || null;
      applyEnt(en);
      return en;
    } catch { return null; }
  }

  /* Dòng chữ gọn: "AI: còn 3/5 lượt tuần này" hoặc "AI không giới hạn" */
  async function quotaText() {
    const e = await getEntitlements();
    if (!e || !e.ok) return '';
    if (e.features?.ai_unlimited) return e.classPlan ? 'AI không giới hạn (gói của lớp)' : 'AI không giới hạn';
    const u = e.aiFreeUsage;
    if (!u) return '';
    if (u.limit < 0) return `AI (${u.plan === 'max' || u.plan === 'pro' ? 'Max' : u.plan}): không giới hạn`;
    const left = Math.max(0, u.limit - u.used);
    return u.plan && u.plan !== 'free'
      ? `AI (${u.plan === 'plus' ? 'Plus' : u.plan}${e.classPlan ? ' · cả lớp' : ''}): còn ${left}/${u.limit} lượt`
      : `AI: còn ${left}/${u.limit} lượt miễn phí tuần này`;
  }

  // Tải trước giá + gói đang dùng NGAY khi vào trang (không đợi người dùng mở bảng nâng cấp)
  let _entBusy = null;
  function refreshEnt() {
    if (!readToken()) return Promise.resolve(null);
    return _entBusy || (_entBusy = getEntitlements().finally(() => { _entBusy = null; }));
  }
  refreshEnt();
  setTimeout(refreshEnt, 1500);                                  // phòng khi token tới trễ sau đăng nhập
  window.addEventListener('a3-plan-changed', () => { refreshEnt(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshEnt(); });

  /* ---------- Chặn tính năng AI trên gói Miễn phí ----------
     Gói Miễn phí: AI vẫn chạy để xem trước kết quả, nhưng LƯU / TẠO NHẬN XÉT / QUÉT cần gói Plus hoặc Max
     (hoặc lớp đang được admin mở khoá AI). Gói của lớp: 1 người mua, cả lớp cùng dùng. */
  function isPaid() { return planKnown && (curPlanCache !== 'free' || curUnlimited); }

  // Dùng ở nơi chạy nền (quét tự động): dùng gói đã cache, chỉ hỏi server khi chưa biết gói.
  // Nếu cache đang là Miễn phí thì hỏi lại server tối đa 1 lần/60 giây (phòng khi vừa mua gói mà cache chưa kịp cập nhật).
  let _lastRecheck = 0;
  async function recheckIfFree() {
    if (planKnown && (curPlanCache !== 'free' || curUnlimited)) return;
    if (Date.now() - _lastRecheck < 60000) return;
    _lastRecheck = Date.now();
    try { await refreshEnt(); } catch {}
  }
  async function canUsePaid() {
    if (!planKnown) { try { await refreshEnt(); } catch {} }
    else await recheckIfFree();
    return isPaid();
  }

  // Dùng khi người dùng BẤM nút: lấy gói mới nhất từ server; nếu là gói Miễn phí → hiện bảng nâng cấp, trả false.
  async function requirePaid(msg) {
    try { await refreshEnt(); } catch {}
    if (isPaid()) return true;
    showUpgrade(msg || 'Tính năng này cần gói Plus hoặc Max.');
    return false;
  }

  // Gói Max (cho tính năng chỉ Max: Hậu kiểm AI, Quét AI nền). Cache theo gói của lớp/tài khoản; server vẫn kiểm tra lại.
  function isMax() { return planKnown && curPlanCache === 'max'; }
  async function canUseMax() {
    if (!planKnown) { try { await refreshEnt(); } catch {} }
    else if (curPlanCache !== 'max') await recheckIfFree();
    return isMax();
  }
  async function requireMax(msg) {
    try { await refreshEnt(); } catch {}
    if (isMax()) return true;
    showUpgrade(msg || 'Tính năng này cần gói Max.');
    return false;
  }

  window.A3AI = { newSession, callGemini, getEntitlements, refreshEnt, quotaText, showUpgrade, readToken, api: post, PLANS, planKey, UPGRADE_CONTACT, isPaid, canUsePaid, requirePaid, isMax, canUseMax, requireMax };
})();
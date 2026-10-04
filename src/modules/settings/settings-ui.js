/* ═══════════════════════════════════════════════════════
   SETTINGS UI — navigation, sidebar, page renderers,
   UI interaction helpers.
   Phụ thuộc: settings-core.js, settings-sync.js
   A3K64 © 2025
   ═══════════════════════════════════════════════════════ */

// ─── Navigation ──────────────────────────────────────
const PAGES = [
  { id: 'home',       label: 'Cá nhân hóa', icon: 'palette',  parent: null },
  { id: 'account',    label: 'Tài khoản',   icon: 'user',     parent: null },
  { id: 'system',     label: 'Hệ thống',    icon: 'settings', parent: null },
  { id: 'color',      label: 'Màu sắc',     icon: 'palette',  parent: 'home' },
  { id: 'background', label: 'Hình nền',    icon: 'wallpaper', parent: 'home' },
  { id: 'taskbar',    label: 'Thanh taskbar', icon: 'monitor', parent: 'home' },
  { id: 'display',    label: 'Màn hình',    icon: 'monitor',  parent: 'system' },
  { id: 'about',      label: 'Giới thiệu',  icon: 'info',     parent: 'system' },
  { id: 'billing',    label: 'Thanh toán',  icon: 'card',     parent: null },
  { id: 'account-profile',  label: 'Thông tin cá nhân', icon: 'user',     parent: 'account' },
  { id: 'account-password', label: 'Đổi mật khẩu',      icon: 'lock',     parent: 'account' },
  { id: 'account-email',    label: 'Email đăng nhập',   icon: 'settings', parent: 'account' },
];

function navigate(id) {
  $$('.page').forEach(el => el.classList.remove('active'));
  const el = $(`#page-${id}`);
  if (el) {
    el.classList.add('active');
    el.classList.add('anim-in');
    setTimeout(() => el.classList.remove('anim-in'), 300);
  }
  currentPage = id;
  renderPageContent(id);
  $$('#sidebar-nav .nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === id || btn.dataset.page === PAGES.find(p => p.id === id)?.parent);
  });
}

// ─── Sidebar ─────────────────────────────────────────
function buildSidebar() {
  const user = readUser();
  if (user) {
    const av = $('#sb-avatar');
    if (user.photoURL) { av.innerHTML = `<img src="${user.photoURL}" alt="Avatar">`; }
    else { av.textContent = (user.displayName || 'A3').charAt(0).toUpperCase(); }
    $('#sb-name').textContent  = user.displayName || 'Người dùng 12A3';
    $('#sb-email').textContent = user.email || user.role || 'Đang đăng nhập';
  }

  const nav = $('#sidebar-nav');
  nav.innerHTML = [
    { id: 'home',    icon: 'palette',  label: 'Cá nhân hóa' },
    { id: 'account', icon: 'user',     label: 'Tài khoản' },
    { id: 'billing', icon: 'card',     label: 'Thanh toán' },
    { id: 'system',  icon: 'settings', label: 'Hệ thống' },
  ].map(p => `
    <button class="nav-btn" data-page="${p.id}" onclick="navigate('${p.id}')">
      ${svg(ICONS[p.icon], 18)} ${p.label}
    </button>`).join('');
}

// ─── Page renderers ──────────────────────────────────
function renderPageContent(id) {
  const el = $(`#page-${id}`);
  if (!el) return;
  if (id === 'home')       return renderHome();
  if (id === 'account')    return renderAccount(el);
  if (id === 'system')     return renderSystem();
  if (id === 'color')      return renderColor(el);
  if (id === 'background') return renderBackground(el);
  if (id === 'taskbar')    return renderTaskbar(el);
  if (id === 'display')    return renderDisplay(el);
  if (id === 'about')      return renderAbout(el);
  if (id === 'billing')    return renderBilling(el);
  if (id === 'account-profile')  return renderAccountProfile(el);
  if (id === 'account-password') return renderAccountPassword(el);
  if (id === 'account-email')    return renderAccountEmail(el);
}

function breadcrumb(parentLabel, parentId, currentLabel) {
  return `<div class="breadcrumb">
    <button onclick="navigate('${parentId}')">${parentLabel}</button>
    ${svg(ICONS.chevronRight, 16)}
    <span>${currentLabel}</span>
  </div>`;
}

function renderHome() {
  const el = $('#home-nav-grid');
  el.innerHTML = [
    { id: 'background', icon: 'wallpaper', label: 'Hình nền',        sub: 'Ảnh nền desktop' },
    { id: 'color',      icon: 'palette',   label: 'Màu sắc',         sub: 'Màu chủ đạo và chế độ giao diện' },
    { id: 'taskbar',    icon: 'monitor',   label: 'Thanh taskbar',   sub: 'Căn chỉnh và hành vi' },
    { id: 'account',    icon: 'user',      label: 'Tài khoản',       sub: 'Mật khẩu, email, ngày sinh, SĐT' },
    { id: 'billing',    icon: 'card',      label: 'Thanh toán',      sub: 'Gói, lượt AI và nâng cấp' },
  ].map(p => `
    <button class="nav-card" onclick="navigate('${p.id}')">
      ${svg(ICONS[p.icon], 22)}
      <div><strong>${p.label}</strong><span>${p.sub}</span></div>
      <span class="chevron">${svg(ICONS.chevronRight, 18)}</span>
    </button>`).join('');
}

function renderSystem() {
  const el = $('#page-system');
  el.innerHTML = `
    <div class="page-title">Hệ thống</div>
    <div class="nav-grid">
      ${[
        { id: 'display', icon: 'monitor', label: 'Màn hình',   sub: 'Tỷ lệ và bố cục hiển thị' },
        { id: 'about',   icon: 'info',    label: 'Giới thiệu', sub: 'Thông tin ứng dụng' },
      ].map(p => `
        <button class="nav-card" onclick="navigate('${p.id}')">
          ${svg(ICONS[p.icon], 22)}
          <div><strong>${p.label}</strong><span>${p.sub}</span></div>
          <span class="chevron">${svg(ICONS.chevronRight, 18)}</span>
        </button>`).join('')}
    </div>`;
}

function renderColor(el) {
  accent = readAccent();
  theme  = readTheme();
  const recent = recentAccents.length ? recentAccents : ['#06b6d4','#52525b','#ef4444','#db2777'];

  el.innerHTML = `
    ${breadcrumb('Cá nhân hóa', 'home', 'Màu sắc')}
    <div class="s-card">
      <div class="s-card-head">
        ${svg(ICONS.palette, 20)}
        <div><h2>Màu sắc</h2><p>Màu chủ đạo, chế độ giao diện và hiệu ứng.</p></div>
      </div>

      <div class="s-row">
        <div class="s-row-left">${svg(ICONS.monitor, 18)}<div><strong>Chế độ giao diện</strong><span>Đổi giữa Tối, Sáng hoặc theo hệ thống.</span></div></div>
        <div class="s-row-right">
          <div class="sel-wrap" id="theme-sel-wrap">
            <button class="sel-btn" onclick="toggleSel('theme-sel-wrap')">
              <span id="theme-label">${THEME_LABELS[theme]}</span>
              ${svg(ICONS.chevronRight, 15)}
            </button>
            <div class="sel-menu" id="theme-sel-menu" style="display:none">
              ${['dark','light','auto'].map(m => `<button class="${m === theme ? 'active' : ''}" onclick="applyThemeUI('${m}')">${THEME_LABELS[m]}</button>`).join('')}
            </div>
          </div>
        </div>
      </div>

      <div class="s-row">
        <div class="s-row-left">${svg(ICONS.sparkles, 18)}<div><strong>Hiệu ứng trong suốt</strong><span>Cửa sổ và bề mặt có hiệu ứng kính mờ.</span></div></div>
        <div class="s-row-right">
          <button class="toggle ${ls.get('desktop-transparency') !== 'off' ? 'on' : ''}" onclick="toggleLS(this,'desktop-transparency','on','off')"><span></span></button>
        </div>
      </div>

      <div class="color-section">
        <div class="cs-head">
          <div><strong>Màu chủ đạo</strong><span>Chọn từ bảng màu hoặc dùng màu tùy chỉnh.</span></div>
          <div class="accent-chip" id="accent-chip" style="background:${accent}"></div>
        </div>
        <div class="color-label">Màu gần đây</div>
        <div class="color-swatches" id="recent-swatches">
          ${recent.map(c => `<button style="background:${c}" onclick="applyAccentUI('${c}')">${c.toLowerCase() === accent.toLowerCase() ? svg(ICONS.check, 16) : ''}</button>`).join('')}
        </div>
        <div class="color-label">Bảng màu</div>
        <div class="color-swatches" id="palette-swatches">
          ${SWATCH_PALETTE.map(c => `<button style="background:${c}" class="${c.toLowerCase() === accent.toLowerCase() ? 'active' : ''}" onclick="applyAccentUI('${c}')">${c.toLowerCase() === accent.toLowerCase() ? svg(ICONS.check, 16) : ''}</button>`).join('')}
        </div>
        <div class="custom-row">
          <div><strong>Màu tùy chỉnh</strong><span>Chọn bất kỳ màu nào bằng bảng chọn màu.</span></div>
          <div style="display:flex;align-items:center;gap:10px">
            <input type="color" class="custom-color-input" value="${accent}" oninput="applyAccentUI(this.value)" title="Chọn màu tùy chỉnh"/>
            <button class="soft-btn" onclick="applyAccentUI(document.querySelector('.custom-color-input').value)">Áp dụng</button>
          </div>
        </div>
      </div>

      <div class="s-row">
        <div class="s-row-left"><div><strong>Hiện màu trên Start và taskbar</strong></div></div>
        <div class="s-row-right">
          <button class="toggle ${ls.get('accent-taskbar') === 'on' ? 'on' : ''}" onclick="toggleLS(this,'accent-taskbar','on','off')"><span></span></button>
        </div>
      </div>
      <div class="s-row">
        <div class="s-row-left"><div><strong>Hiện màu trên viền cửa sổ</strong></div></div>
        <div class="s-row-right">
          <button class="toggle ${ls.get('accent-borders') === 'on' ? 'on' : ''}" onclick="toggleLS(this,'accent-borders','on','off')"><span></span></button>
        </div>
      </div>
    </div>`;
}

// Gói trả phí: null = chưa biết (đang hỏi backend), true/false = đã biết
let premiumUI = null;
let _premiumFetchedAt = 0;
// Hỏi lại backend (tối đa mỗi 15 giây, hoặc ép buộc bằng force). Nếu lỗi mạng/token thì KHÔNG
// coi là "chưa mua" — giữ nguyên trạng thái cũ để lần sau thử lại, tránh khoá nhầm tài khoản Max.
function loadPremiumUI(force) {
  if (!window.A3AI) { premiumUI = false; return; }
  if (!force && Date.now() - _premiumFetchedAt < 15000) return;
  _premiumFetchedAt = Date.now();
  window.A3AI.getEntitlements().then(e => {
    if (!e || !e.features) return;
    const next = !!e.features.premium_ui;
    const changed = next !== premiumUI;
    premiumUI = next;
    if (changed && currentPage === 'background') renderPageContent('background');
  });
}

async function pickWallpaper(id) {
  if (!window.A3Premium) return;
  if (id && premiumUI !== true) {
    // Có thể vừa nâng cấp xong: hỏi lại server trước khi báo khoá.
    const e = await window.A3AI?.getEntitlements();
    if (e && e.features) premiumUI = !!e.features.premium_ui;
    if (premiumUI !== true) { window.A3AI?.showUpgrade('Hình nền cao cấp thuộc gói Max.'); renderPageContent('background'); return; }
    renderPageContent('background');
  }
  window.A3Premium.set(id);
  renderPageContent('background');
  Sync.scheduleSave();
}

function renderBackground(el) {
  loadPremiumUI();
  const P = window.A3Premium;
  const cur = P ? P.get() : '';
  const locked = premiumUI !== true;
  const prev = P && P.WALLPAPERS[cur] ? `style="background:${P.WALLPAPERS[cur].css}"` : '';
  const tiles = P ? Object.entries(P.WALLPAPERS).map(([id, w]) => `
        <button class="wp-tile ${id === cur ? 'active' : ''}" onclick="pickWallpaper('${id}')" title="${w.label}"
          style="background:${w.css};position:relative;height:64px;border-radius:10px;border:2px solid ${id === cur ? 'var(--accent)' : 'transparent'};cursor:pointer;color:#fff;font-size:12px;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:flex-start;padding:6px">
          ${w.label}${locked ? '<span style="position:absolute;top:6px;right:8px">🔒</span>' : ''}
        </button>`).join('') : '';
  el.innerHTML = `
    ${breadcrumb('Cá nhân hóa', 'home', 'Hình nền')}
    <div class="s-card">
      <div class="s-card-head">
        ${svg(ICONS.wallpaper, 20)}
        <div><h2>Hình nền</h2><p>Tùy chỉnh nền desktop.</p></div>
      </div>
      <div class="bg-preview" ${prev}><span>Xem trước hình nền</span></div>
      <div class="s-row" style="flex-direction:column;align-items:stretch;gap:10px">
        <div class="s-row-left">${svg(ICONS.sparkles, 18)}<div><strong>Giao diện cao cấp</strong><span>${locked ? '🔒 Dành cho gói Max.' : 'Chọn một hình nền bên dưới.'}</span></div></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px">${tiles}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${cur ? `<button class="soft-btn" onclick="pickWallpaper('')">Về nền mặc định</button>` : ''}
          ${locked ? `<button class="soft-btn" onclick="window.A3AI?.showUpgrade('Gói Max mở khoá hình nền và giao diện cao cấp.')">🔒 Nâng cấp</button>` : ''}
        </div>
      </div>
    </div>`;
}


// ─── Thanh toán & gói ────────────────────────────────
function billFmtDate(ms) {
  if (ms == null) return '';
  const d = new Date(Number(ms));
  return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}
function billPlanName(id) {
  const key = window.A3AI?.planKey ? window.A3AI.planKey(id) : (id || 'free');
  return (window.A3AI?.PLANS || []).find(p => p.id === key)?.name || key;
}

async function renderBilling(el) {
  if (!window.A3AI) {
    el.innerHTML = `<div class="s-card"><div class="bill-empty">Không tải được module gói. Hãy tải lại trang.</div></div>`;
    return;
  }
  el.innerHTML = `<div class="page-title">Thanh toán</div><div class="s-card"><div class="bill-empty">Đang tải thông tin gói…</div></div>`;

  const en = await window.A3AI.getEntitlements();
  if (currentPage !== 'billing') return; // người dùng đã chuyển trang

  if (!en || !en.ok) {
    el.innerHTML = `<div class="page-title">Thanh toán</div><div class="s-card"><div class="bill-empty">Không đọc được thông tin gói. Kiểm tra mạng hoặc đăng nhập lại rồi thử lại.</div></div>`;
    return;
  }

  const u = en.aiFreeUsage || {};
  const planId = window.A3AI.planKey(u.plan || 'free');
  const isPaid = planId !== 'free';
  const unlimited = (u.limit != null && u.limit < 0) || !!en.features?.ai_unlimited;
  const used = Number(u.used || 0), limit = Number(u.limit || 0);
  const pct = unlimited || !limit ? 0 : Math.min(100, Math.round(used / limit * 100));
  const exp = u.planExpiresAt != null ? Number(u.planExpiresAt) : null;
  const daysLeft = exp ? Math.ceil((exp - Date.now()) / 86400000) : null;
  const premium = !!en.features?.premium_ui;
  const cp = en.classPlan || null;   // gói của cả lớp (1 người mua, cả lớp dùng)
  const buyer = cp ? (cp.boughtByMe ? 'bạn' : (cp.boughtByName || cp.boughtBy || 'một bạn trong lớp')) : '';

  let sub;
  if (isPaid) sub = (cp ? `Do ${escapeBill(buyer)} mua cho cả lớp · ` : '') + (exp ? `Hết hạn ${billFmtDate(exp)}${daysLeft != null ? ` · còn ${Math.max(0, daysLeft)} ngày` : ''}` : 'Không có ngày hết hạn');
  else sub = u.resetAt ? `Lượt AI làm mới lúc ${billFmtDate(u.resetAt)}` : 'Gói mặc định';

  const warn = isPaid && daysLeft != null && daysLeft <= 3
    ? `<div class="bill-alert">Gói ${billPlanName(planId)} sắp hết hạn${daysLeft <= 0 ? ' (hôm nay)' : ` trong ${daysLeft} ngày`}. Hết hạn sẽ tự về gói Miễn phí. Hãy gia hạn để không bị gián đoạn.</div>`
    : (!unlimited && limit && used >= limit
        ? `<div class="bill-alert">Bạn đã dùng hết lượt AI của gói hiện tại.</div>` : '');

  const perks = billPerks(planId, { unlimited, limit, used, isPaid, premium });

  el.innerHTML = `
    <div class="page-title">Thanh toán</div>

    <div class="s-card">
      <div class="s-card-head">
        ${svg(ICONS.card, 20)}
        <div><h2>${cp ? 'Gói của lớp' : 'Gói của lớp bạn'}</h2><p>Chỉ cần 1 bạn mua, cả lớp cùng dùng.</p></div>
      </div>
      <div class="bill-plan">
        <div class="bill-plan-top">
          <div>
            <div class="bill-plan-name">${billPlanName(planId)}</div>
            <div class="bill-plan-sub">${sub}</div>
          </div>
          <span class="bill-badge ${isPaid ? 'ok' : ''}">${isPaid ? 'Đang kích hoạt' : 'Mặc định'}</span>
        </div>
        ${warn}
        <div>
          <div class="bill-bar ${!unlimited && limit && used >= limit ? 'full' : ''}"><i style="width:${unlimited ? 100 : pct}%"></i></div>
          <div class="bill-use"><span>Lượt AI</span><span>${unlimited ? 'Không giới hạn' : `${used}/${limit} đã dùng · còn ${Math.max(0, limit - used)}`}</span></div>
        </div>
        <div class="bill-actions">
          <button class="soft-btn" onclick="window.A3AI.showUpgrade('Chọn gói bạn muốn dùng.')">${isPaid ? 'Đổi / gia hạn gói' : 'Nâng cấp'}</button>
          <button class="soft-btn" onclick="loadPremiumUI(true);renderBilling($('#page-billing'))">Làm mới</button>
        </div>
      </div>
    </div>

    <div class="s-card" style="margin-top:16px">
      <div class="s-card-head">${svg(ICONS.sparkles, 20)}<div><h2>Quyền lợi đang có</h2><p>Tất cả tính năng theo gói hiện tại. Dòng có ổ khoá thuộc gói cao hơn.</p></div></div>
      ${perks}
    </div>

    ${billCompareCard(planId)}

    <div class="s-card" style="margin-top:16px">
      <div class="s-card-head">${svg(ICONS.info, 20)}<div><h2>Phương thức thanh toán</h2><p>Thanh toán tự động chưa mở.</p></div></div>
      <div class="bill-empty">Hiện gói được kích hoạt thủ công: bấm Nâng cấp, liên hệ quản trị viên và thanh toán theo hướng dẫn, gói sẽ được bật cho cả lớp. ${escapeBill(window.A3AI.UPGRADE_CONTACT)}</div>
    </div>`;
}

// ─── Bảng so sánh các gói ────────────────────────────
// v[planId]: true = có · false = không có · chuỗi = hiện nguyên văn (giới hạn / điều kiện).
// Khi đổi quyền lợi gói, sửa ở đây cho khớp với PLANS trong ai-proxy.js.
const PLAN_COMPARE = [
  { group: 'Quản lý lớp', rows: [
    { label: 'Đầy đủ tính năng quản lý lớp', hint: 'Chấm điểm, bảng điểm, trực nhật, sơ đồ chỗ ngồi, hồ sơ.',
      v: { free: true, plus: true, max: true } },
    { label: 'Xuất Excel, chụp ảnh và in bảng điểm',                    v: { free: true, plus: true, max: true } },
  ]},
  { group: 'AI', rows: [
    { id: 'ai_quota', label: 'Số lượt AI', v: { free: '3 lượt / tuần / người', plus: '100 lượt / tháng', max: 'Không giới hạn' },
      hint: 'Gói Plus dùng chung cả lớp.' },
    { label: 'Lưu kết quả AI', hint: 'Tự tính điểm, Nhận xét thi đua, AI xoá, AI ghi chú Trực nhật.',
      v: { free: true, plus: true, max: true } },
    { label: 'AI chạy tự động', hint: 'Hậu kiểm AI sau mỗi lần lưu, Quét AI nền.',
      v: { free: false, plus: false, max: true } },
  ]},
  { group: 'Tổng kết', rows: [
    { label: 'Xem dạng bảng cơ bản',  v: { free: true,  plus: true,  max: true } },
    { label: 'Xuất Excel và In',      v: { free: false, plus: true,  max: true } },
    { label: 'AI nhận xét', hint: 'Học sinh, cả lớp, ai tiến bộ / sa sút.',
      v: { free: false, plus: true, max: true } },
    { label: 'Biểu đồ & hỏi AI tự do', hint: 'Gồm so sánh 2 kỳ và báo cáo gửi giáo viên.',
      v: { free: false, plus: false, max: true } },
  ]},
  { group: 'Giao diện', rows: [
    { id: 'premium_ui', label: 'Theme & hình nền cao cấp', hint: 'Bật cho mọi người trong lớp.',
      v: { free: false, plus: false, max: true } },
  ]},
];

function billCompareCell(val, cur) {
  const cls = 'cmp-cell' + (cur ? ' cur' : '');
  if (val === true)  return `<td class="${cls}"><span class="cmp-yes" title="Có">${svg(ICONS.check, 14)}</span><span class="sr-only">Có</span></td>`;
  if (val === false || val == null) return `<td class="${cls}"><span class="cmp-no" title="Không có">${svg(ICONS.minus, 14)}</span><span class="sr-only">Không có</span></td>`;
  return `<td class="${cls}"><span class="cmp-txt">${escapeBill(val)}</span></td>`;
}

function billCompareCard(planId) {
  const plans = window.A3AI?.PLANS || [];
  if (plans.length < 2) return '';
  const curIdx = plans.findIndex(p => p.id === planId);
  const cols = plans.length + 1;

  const head = plans.map(p => `
    <th class="cmp-plan${p.id === planId ? ' cur' : ''}" scope="col">
      ${p.id === planId ? '<span class="cmp-now">Đang dùng</span>' : ''}
      <span class="cmp-name">${escapeBill(p.name)}</span>
      <span class="cmp-price">${escapeBill(p.price)}<small> ${escapeBill(p.per || '')}</small></span>
    </th>`).join('');

  const body = PLAN_COMPARE.map(g => `
    <tr class="cmp-group"><th colspan="${cols}" scope="colgroup">${escapeBill(g.group)}</th></tr>
    ${g.rows.map(r => `
    <tr>
      <th scope="row" class="cmp-feat">${escapeBill(r.label)}${r.hint ? `<small>${escapeBill(r.hint)}</small>` : ''}</th>
      ${plans.map(p => billCompareCell(r.v[p.id], p.id === planId)).join('')}
    </tr>`).join('')}`).join('');

  const foot = plans.map((p, i) => {
    const cur = p.id === planId;
    let inner = '';
    if (cur) inner = '<span class="cmp-here">Gói hiện tại</span>';
    else if (i > curIdx) inner = `<button class="soft-btn" onclick="window.A3AI.showUpgrade('Chọn gói bạn muốn dùng.')">Nâng cấp</button>`;
    return `<td class="cmp-cell${cur ? ' cur' : ''}">${inner}</td>`;
  }).join('');

  return `
    <div class="s-card" style="margin-top:16px">
      <div class="s-card-head">${svg(ICONS.sparkles, 20)}<div><h2>So sánh các gói</h2><p>Xem mỗi gói có gì để chọn gói phù hợp với lớp bạn.</p></div></div>
      <div class="cmp-wrap">
        <table class="cmp-table">
          <thead><tr><th class="cmp-corner" scope="col"><span class="sr-only">Tính năng</span></th>${head}</tr></thead>
          <tbody>${body}</tbody>
          <tfoot><tr><td class="cmp-corner"></td>${foot}</tr></tfoot>
        </table>
      </div>
    </div>`;
}

// Danh sách "Quyền lợi đang có": liệt kê TẤT CẢ tính năng trong PLAN_COMPARE theo gói hiện tại
// (✓ = đã có · 🔒 = thuộc gói cao hơn, ghi rõ gói nào mở khoá).
function billPerks(planId, st) {
  const plans = window.A3AI?.PLANS || [];
  const row = (on, text, note, detail) => `<div class="bill-perk ${on ? '' : 'off'}">${svg(on ? ICONS.check : ICONS.lock, 16)}<span>${text}${detail ? `<em class="bill-perk-d">${detail}</em>` : ''}</span>${note ? `<small>${note}</small>` : ''}</div>`;
  return PLAN_COMPARE.map(g => `<div class="bill-perk-group">${escapeBill(g.group)}</div>` + g.rows.map(r => {
    if (r.id === 'ai_quota') {   // số lượt thật của tài khoản/lớp
      return row(true,
        st.unlimited ? 'Lượt AI không giới hạn' : `${st.limit} lượt AI ${st.isPaid ? 'trong kỳ gói (dùng chung cả lớp)' : 'mỗi tuần'}`,
        st.unlimited ? '' : `đã dùng ${st.used}`, '');
    }
    const on = r.id === 'premium_ui' ? !!st.premium : !!r.v[planId];   // giao diện cao cấp theo quyền thực tế từ server
    const need = on ? null : plans.find(p => r.v[p.id]);
    return row(on, escapeBill(r.label), need ? 'Gói ' + escapeBill(need.name) : '', r.hint ? escapeBill(r.hint) : '');
  }).join('')).join('');
}

function escapeBill(t) {
  return String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderTaskbar(el) {
  tb = readTB();
  el.innerHTML = `
    ${breadcrumb('Cá nhân hóa', 'home', 'Thanh taskbar')}
    <div class="s-card">
      <div class="s-card-head">
        ${svg(ICONS.monitor, 20)}
        <div><h2>Thanh taskbar</h2><p>Biểu tượng, căn chỉnh, thông báo và hành vi.</p></div>
      </div>
      <div class="tb-group">
        <div class="tb-group-head"><strong>Mục trên taskbar</strong><span>Hiện hoặc ẩn các nút xuất hiện trên taskbar.</span></div>
        <div class="s-row">
          <div class="s-row-left">${svg(ICONS.search, 18)}<div><strong>Tìm kiếm</strong></div></div>
          <div class="s-row-right">
            <div class="sel-wrap" id="search-sel-wrap">
              <button class="sel-btn" onclick="toggleSel('search-sel-wrap')">
                <span>${tb.searchMode === 'icon' ? 'Chỉ biểu tượng' : 'Ô tìm kiếm'}</span>
                ${svg(ICONS.chevronRight, 15)}
              </button>
              <div class="sel-menu" style="display:none">
                <button class="${tb.searchMode === 'box'  ? 'active' : ''}" onclick="updateTB('searchMode','box');closeSels();renderPageContent('taskbar')">Ô tìm kiếm</button>
                <button class="${tb.searchMode === 'icon' ? 'active' : ''}" onclick="updateTB('searchMode','icon');closeSels();renderPageContent('taskbar')">Chỉ biểu tượng</button>
              </div>
            </div>
          </div>
        </div>
        <div class="s-row">
          <div class="s-row-left"><div><strong>Chế độ xem tác vụ</strong></div></div>
          <div class="s-row-right"><button class="toggle ${tb.taskView ? 'on' : ''}" onclick="updateTBToggle(this,'taskView')"><span></span></button></div>
        </div>
        <div class="s-row">
          <div class="s-row-left"><div><strong>Tiện ích</strong></div></div>
          <div class="s-row-right"><button class="toggle ${tb.widgets ? 'on' : ''}" onclick="updateTBToggle(this,'widgets')"><span></span></button></div>
        </div>
        <div class="s-row">
          <div class="s-row-left"><div><strong>Tiếp tục</strong><span>Hiện ứng dụng có thông báo khi khả dụng.</span></div></div>
          <div class="s-row-right"><button class="toggle ${tb.resume ? 'on' : ''}" onclick="updateTBToggle(this,'resume')"><span></span></button></div>
        </div>
      </div>
      <div class="tb-group">
        <div class="tb-group-head"><strong>Hành vi của taskbar</strong><span>Căn chỉnh, huy hiệu và tự động ẩn.</span></div>
        <div class="s-row">
          <div class="s-row-left"><div><strong>Căn chỉnh taskbar</strong></div></div>
          <div class="s-row-right">
            <div class="sel-wrap" id="align-sel-wrap">
              <button class="sel-btn" onclick="toggleSel('align-sel-wrap')">
                <span>${tb.alignment === 'left' ? 'Trái' : 'Giữa'}</span>
                ${svg(ICONS.chevronRight, 15)}
              </button>
              <div class="sel-menu" style="display:none">
                <button class="${tb.alignment === 'center' ? 'active' : ''}" onclick="updateTB('alignment','center');closeSels();renderPageContent('taskbar')">Giữa</button>
                <button class="${tb.alignment === 'left'   ? 'active' : ''}" onclick="updateTB('alignment','left');closeSels();renderPageContent('taskbar')">Trái</button>
              </div>
            </div>
          </div>
        </div>
        <div class="s-row">
          <div class="s-row-left"><div><strong>Tự động ẩn taskbar</strong></div></div>
          <div class="s-row-right"><button class="toggle ${tb.autoHide ? 'on' : ''}" onclick="updateTBToggle(this,'autoHide')"><span></span></button></div>
        </div>
        <div class="s-row">
          <div class="s-row-left"><div><strong>Hiện huy hiệu trên ứng dụng taskbar</strong></div></div>
          <div class="s-row-right"><button class="toggle ${tb.badges ? 'on' : ''}" onclick="updateTBToggle(this,'badges')"><span></span></button></div>
        </div>
      </div>
    </div>`;
}

function renderDisplay(el) {
  const SCALE_OPTS = [75, 80, 90, 100, 110, 125, 150, 175, 200];
  const savedScale = Number(ls.get('a3k64-display-scale')) || 100;
  el.innerHTML = `
    ${breadcrumb('Hệ thống', 'system', 'Màn hình')}
    <div class="s-card">
      <div class="s-card-head">
        ${svg(ICONS.monitor, 20)}
        <div><h2>Màn hình</h2><p>Tỷ lệ và bố cục hiển thị giao diện.</p></div>
      </div>
      <div class="s-row">
        <div class="s-row-left">${svg(ICONS.monitor, 18)}<div><strong>Tỷ lệ và bố cục</strong><span>Thay đổi kích thước chữ và ứng dụng.</span></div></div>
        <div class="s-row-right">
          <select style="height:38px;border:1px solid var(--border3);border-radius:10px;padding:0 12px;color:var(--text);background:var(--surface2);font:inherit;font-size:13px;font-weight:700;cursor:pointer;outline:none" onchange="applyScale(+this.value)">
            ${SCALE_OPTS.map(s => `<option value="${s}" ${s === savedScale ? 'selected' : ''}>${s}%${s === 100 ? ' (Mặc định)' : ''}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>`;
}

// ─── Trang Tài khoản ──────────────────────────────────
function accountMsg(id, text, isError) {
  const el = $(`#${id}`);
  if (!el) return;
  el.textContent = text || '';
  el.style.color = isError ? '#f87171' : '#10b981';
}

function renderAccount(el) {
  el.innerHTML = `
    ${breadcrumb('Cá nhân hóa', 'home', 'Tài khoản')}
    <div class="nav-grid">
      ${[
        { id: 'account-profile',  icon: 'user',     label: 'Thông tin cá nhân', sub: 'Ngày sinh, số điện thoại' },
        { id: 'account-password', icon: 'lock',     label: 'Đổi mật khẩu',      sub: 'Cần nhập đúng mật khẩu hiện tại' },
        { id: 'account-email',    icon: 'settings', label: 'Email đăng nhập',   sub: 'Dùng để đăng nhập vào hệ thống' },
      ].map(p => `
        <button class="nav-card" onclick="navigate('${p.id}')">
          ${svg(ICONS[p.icon], 22)}
          <div><strong>${p.label}</strong><span>${p.sub}</span></div>
          <span class="chevron">${svg(ICONS.chevronRight, 18)}</span>
        </button>`).join('')}
    </div>`;
}

function renderAccountProfile(el) {
  const u = readUser() || {};
  el.innerHTML = `
    ${breadcrumb('Tài khoản', 'account', 'Thông tin cá nhân')}
    <div id="acc-load-banner" class="s-card" style="margin-bottom:16px;padding:14px 18px;display:flex;align-items:center;gap:10px;color:var(--muted)">
      ${svg(ICONS.spinner, 16)} <span>Đang tải thông tin tài khoản…</span>
    </div>
    <div class="s-card" id="acc-profile-card">
      <div class="s-card-head">
        ${svg(ICONS.user, 20)}
        <div><h2>Thông tin cá nhân</h2><p>Họ tên do nhà trường quản lý, không thể tự đổi.</p></div>
      </div>
      <div class="s-row">
        <div class="s-row-left">${svg(ICONS.user, 18)}<div><strong>Họ và tên</strong><span id="acc-fullname">${u.displayName || '—'}</span></div></div>
      </div>
      <div class="color-section">
        <div class="color-label">Ngày sinh</div>
        <input type="date" id="acc-dob" disabled style="height:38px;border:1px solid var(--border3);border-radius:10px;padding:0 12px;color:var(--text);background:var(--surface2);font:inherit;font-size:13px;margin-bottom:14px;width:100%;max-width:220px">
        <div class="color-label">Số điện thoại của bạn</div>
        <input type="tel" id="acc-phone-self" disabled placeholder="Đang tải…" style="height:38px;border:1px solid var(--border3);border-radius:10px;padding:0 12px;color:var(--text);background:var(--surface2);font:inherit;font-size:13px;margin-bottom:14px;width:100%;max-width:220px">
        <div class="color-label">Số điện thoại của bố</div>
        <input type="tel" id="acc-phone-father" disabled placeholder="Đang tải…" style="height:38px;border:1px solid var(--border3);border-radius:10px;padding:0 12px;color:var(--text);background:var(--surface2);font:inherit;font-size:13px;margin-bottom:14px;width:100%;max-width:220px">
        <div class="color-label">Số điện thoại của mẹ</div>
        <input type="tel" id="acc-phone-mother" disabled placeholder="Đang tải…" style="height:38px;border:1px solid var(--border3);border-radius:10px;padding:0 12px;color:var(--text);background:var(--surface2);font:inherit;font-size:13px;margin-bottom:6px;width:100%;max-width:220px">
        <div style="display:flex;align-items:center;gap:12px;margin-top:10px">
          <button class="soft-btn" id="acc-profile-btn" onclick="submitOwnProfile()" disabled>Lưu thông tin</button>
          <span id="acc-profile-msg" style="font-size:12px"></span>
        </div>
      </div>
    </div>`;

  loadOwnProfile(u);
}

function renderAccountPassword(el) {
  el.innerHTML = `
    ${breadcrumb('Tài khoản', 'account', 'Đổi mật khẩu')}
    <div class="s-card">
      <div class="s-card-head">
        ${svg(ICONS.lock, 20)}
        <div><h2>Đổi mật khẩu</h2><p>Cần nhập đúng mật khẩu hiện tại.</p></div>
      </div>
      <div class="color-section">
        <div class="color-label">Mật khẩu hiện tại</div>
        <input type="password" id="acc-old-pass" style="height:38px;border:1px solid var(--border3);border-radius:10px;padding:0 12px;color:var(--text);background:var(--surface2);font:inherit;font-size:13px;margin-bottom:14px;width:100%;max-width:260px">
        <div class="color-label">Mật khẩu mới (tối thiểu 6 ký tự)</div>
        <input type="password" id="acc-new-pass" style="height:38px;border:1px solid var(--border3);border-radius:10px;padding:0 12px;color:var(--text);background:var(--surface2);font:inherit;font-size:13px;margin-bottom:14px;width:100%;max-width:260px">
        <div class="color-label">Nhập lại mật khẩu mới</div>
        <input type="password" id="acc-new-pass2" style="height:38px;border:1px solid var(--border3);border-radius:10px;padding:0 12px;color:var(--text);background:var(--surface2);font:inherit;font-size:13px;margin-bottom:6px;width:100%;max-width:260px">
        <div style="display:flex;align-items:center;gap:12px;margin-top:10px">
          <button class="soft-btn" id="acc-pass-btn" onclick="submitChangePassword()">Đổi mật khẩu</button>
          <span id="acc-pass-msg" style="font-size:12px"></span>
        </div>
      </div>
    </div>`;
}

function renderAccountEmail(el) {
  const u = readUser() || {};
  el.innerHTML = `
    ${breadcrumb('Tài khoản', 'account', 'Email đăng nhập')}
    <div id="acc-load-banner" class="s-card" style="margin-bottom:16px;padding:14px 18px;display:flex;align-items:center;gap:10px;color:var(--muted)">
      ${svg(ICONS.spinner, 16)} <span>Đang tải thông tin tài khoản…</span>
    </div>
    <div class="s-card">
      <div class="s-card-head">
        ${svg(ICONS.settings, 20)}
        <div><h2>Email đăng nhập</h2><p>Dùng để đăng nhập, không phải Gmail liên kết Google.</p></div>
      </div>
      <div class="color-section">
        <div class="color-label">Email hiện tại</div>
        <input type="email" id="acc-email" disabled placeholder="Đang tải…" style="height:38px;border:1px solid var(--border3);border-radius:10px;padding:0 12px;color:var(--text);background:var(--surface2);font:inherit;font-size:13px;margin-bottom:6px;width:100%;max-width:300px">
        <div style="display:flex;align-items:center;gap:12px;margin-top:10px">
          <button class="soft-btn" id="acc-email-btn" onclick="submitChangeEmail()" disabled>Đổi email</button>
          <span id="acc-email-msg" style="font-size:12px"></span>
        </div>
      </div>
    </div>`;

  loadOwnProfile(u);
}

/** Nạp dữ liệu hiện có từ backend để điền sẵn form. Luôn kết thúc bằng
 * trạng thái RÕ RÀNG cho người dùng — thành công (mở khoá form + điền số
 * liệu thật), hoặc lỗi (banner đỏ + nút Thử lại) — không bao giờ im lặng
 * để nguyên placeholder khiến người dùng tưởng nhầm là dữ liệu thật. */
async function loadOwnProfile(u) {
  u = u || readUser() || {};
  const banner = $('#acc-load-banner');
  const res = await postAction('getOwnProfile', {});

  if (!res?.ok) {
    if (banner) {
      banner.style.color = '#f87171';
      banner.innerHTML = `${svg(ICONS.info, 16)}
        <span>Không tải được thông tin tài khoản: ${res?.error || 'lỗi không xác định'}.</span>
        <button class="soft-btn" style="margin-left:auto" onclick="loadOwnProfile()">Thử lại</button>`;
    }
    return;
  }

  const p = res.profile || {};
  if ($('#acc-dob'))          $('#acc-dob').value = p.dateOfBirth || '';
  if ($('#acc-phone-self'))   { $('#acc-phone-self').value = p.phoneSelf || '';     $('#acc-phone-self').placeholder = '09xxxxxxxx'; }
  if ($('#acc-phone-father')) { $('#acc-phone-father').value = p.phoneFather || ''; $('#acc-phone-father').placeholder = '09xxxxxxxx'; }
  if ($('#acc-phone-mother')) { $('#acc-phone-mother').value = p.phoneMother || ''; $('#acc-phone-mother').placeholder = '09xxxxxxxx'; }
  if ($('#acc-email'))        { $('#acc-email').value = res.username || u?.email || ''; $('#acc-email').placeholder = ''; }
  if ($('#acc-fullname'))     $('#acc-fullname').textContent = res.fullName || u?.displayName || '—';

  ['acc-dob','acc-phone-self','acc-phone-father','acc-phone-mother','acc-email','acc-profile-btn','acc-email-btn']
    .forEach(id => { const el = $(`#${id}`); if (el) el.disabled = false; });

  if (banner) banner.remove();

  if (!res.profile || (!p.dateOfBirth && !p.phoneSelf && !p.phoneFather && !p.phoneMother)) {
    const card = $('#acc-profile-card');
    if (card) {
      const status = res.debug?.linkStatus;
      const msg = status === 'no_student_id'
        ? 'Tài khoản này chưa được gắn với hồ sơ học sinh (student_id trống trong bảng accounts) — nhờ GVCN/Admin kiểm tra lại, chưa thể tự điền ngày sinh/SĐT ở đây.'
        : status === 'not_found'
          ? `Tài khoản đang trỏ tới student_id "${res.debug?.studentId}" nhưng không tìm thấy bản ghi này trong bảng students — dữ liệu bị lệch, nhờ Admin kiểm tra lại.`
          : 'Hồ sơ chưa có ngày sinh/SĐT trong hệ thống — điền và bấm "Lưu thông tin" để cập nhật.';
      const note = document.createElement('div');
      note.style.cssText = 'padding:10px 18px;font-size:12px;color:var(--muted)';
      note.textContent = msg;
      card.appendChild(note);
    }
  }
}

async function submitOwnProfile() {
  const btn = $('#acc-profile-btn');
  btn.disabled = true;
  accountMsg('acc-profile-msg', 'Đang lưu…', false);
  const res = await postAction('updateOwnProfile', {
    dateOfBirth: $('#acc-dob').value.trim(),
    phoneSelf:   $('#acc-phone-self').value.trim(),
    phoneFather: $('#acc-phone-father').value.trim(),
    phoneMother: $('#acc-phone-mother').value.trim(),
  });
  btn.disabled = false;
  accountMsg('acc-profile-msg', res?.ok ? 'Đã lưu.' : (res?.error || 'Lưu thất bại.'), !res?.ok);
}

async function submitChangePassword() {
  const oldPass = $('#acc-old-pass').value;
  const newPass = $('#acc-new-pass').value;
  const newPass2 = $('#acc-new-pass2').value;
  if (!oldPass || !newPass) return accountMsg('acc-pass-msg', 'Nhập đầy đủ mật khẩu.', true);
  if (newPass !== newPass2) return accountMsg('acc-pass-msg', 'Mật khẩu mới nhập lại không khớp.', true);
  const btn = $('#acc-pass-btn');
  btn.disabled = true;
  accountMsg('acc-pass-msg', 'Đang xử lý…', false);
  const res = await postAction('changePassword', { oldPassword: oldPass, newPassword: newPass });
  btn.disabled = false;
  accountMsg('acc-pass-msg', res?.ok ? 'Đổi mật khẩu thành công.' : (res?.error || 'Đổi mật khẩu thất bại.'), !res?.ok);
  if (res?.ok) { $('#acc-old-pass').value = ''; $('#acc-new-pass').value = ''; $('#acc-new-pass2').value = ''; }
}

async function submitChangeEmail() {
  const newEmail = $('#acc-email').value.trim();
  if (!newEmail) return accountMsg('acc-email-msg', 'Nhập email mới.', true);
  const btn = $('#acc-email-btn');
  btn.disabled = true;
  accountMsg('acc-email-msg', 'Đang xử lý…', false);
  const res = await postAction('changeAccountCredentials', { newEmail });
  btn.disabled = false;
  accountMsg('acc-email-msg', res?.ok ? 'Đã đổi email — hãy dùng email mới để đăng nhập lần sau.' : (res?.error || 'Đổi email thất bại.'), !res?.ok);
}

function renderAbout(el) {
  el.innerHTML = `
    ${breadcrumb('Hệ thống', 'system', 'Giới thiệu')}
    <div class="s-card">
      <div class="s-card-head">
        ${svg(ICONS.info, 20)}
        <div><h2>Giới thiệu</h2><p>Thông tin ứng dụng quản lý thi đua.</p></div>
      </div>
      <div class="about-box">
        <strong>12A3 – Quản lý Thi Đua</strong>
        <span>Phiên bản web nội bộ A3K64.</span>
        <span>Đăng nhập bằng Google, phân quyền theo ACCOUNTS và đồng bộ cá nhân hoá qua <strong>backend GAS</strong> (sheet PERSONALIZATION).</span>
        <span style="margin-top:4px;color:var(--accent);font-weight:700">A3K64 © 2025</span>
      </div>
    </div>`;
}

// ─── UI helpers ──────────────────────────────────────
function toggleSel(wrapId) {
  const wrap = $(`#${wrapId}`);
  if (!wrap) return;
  const menu   = wrap.querySelector('.sel-menu');
  const isOpen = menu.style.display !== 'none';
  closeSels();
  if (!isOpen) menu.style.display = 'block';
}

function closeSels() { $$('.sel-menu').forEach(m => m.style.display = 'none'); }

document.addEventListener('click', e => { if (!e.target.closest('.sel-wrap')) closeSels(); });

/** Toggle một setting boolean trong localStorage và schedule backend save. */
function toggleLS(btn, key, onVal, offVal) {
  const isOn = btn.classList.toggle('on');
  ls.set(key, isOn ? onVal : offVal);
  Sync.scheduleSave();
}

/** Cập nhật accent trên UI + lưu local + schedule backend save. */
function applyAccentUI(color) {
  const norm = saveAccent(color);   // saveAccent đã gọi Sync.scheduleSave()
  accent = norm;
  const chip = $('#accent-chip');
  if (chip) chip.style.background = norm;
  $$('#palette-swatches button').forEach((btn, i) => {
    const c = SWATCH_PALETTE[i];
    btn.classList.toggle('active', c.toLowerCase() === norm.toLowerCase());
    btn.innerHTML = c.toLowerCase() === norm.toLowerCase() ? svg(ICONS.check, 16) : '';
  });
  $$('#recent-swatches button').forEach(btn => {
    const c   = btn.style.background;
    const hex = rgbToHex(c) || c;
    btn.innerHTML = hex.toLowerCase() === norm.toLowerCase() ? svg(ICONS.check, 16) : '';
  });
  recentAccents = [norm, ...recentAccents.filter(c => c.toLowerCase() !== norm.toLowerCase())].slice(0, 4);
  ls.set('recent-accents', JSON.stringify(recentAccents));
}

function rgbToHex(rgb) {
  const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return null;
  return '#' + [m[1],m[2],m[3]].map(n => (+n).toString(16).padStart(2, '0')).join('');
}

/** Đổi theme trên UI + lưu local + schedule backend save. */
function applyThemeUI(mode) {
  theme = mode;
  applyTheme(mode);
  Sync.scheduleSave();
  const el = $('#page-color');
  if (el) renderColor(el);
  const label = $('#theme-label');
  if (label) label.textContent = THEME_LABELS[mode];
}

/** Cập nhật một trường taskbar + schedule backend save. */
function updateTB(key, value) {
  tb[key] = value;
  saveTB(tb);   // saveTB đã gọi Sync.scheduleSave()
}

function updateTBToggle(btn, key) {
  const isOn = btn.classList.toggle('on');
  updateTB(key, isOn);
}

// ─── Listen for external storage changes ─────────────
window.addEventListener('storage', () => {
  accent = readAccent();
  theme  = readTheme();
  document.documentElement.style.setProperty('--accent', accent);
  applyTheme(theme);
});
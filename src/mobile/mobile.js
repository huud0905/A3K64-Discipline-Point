/* ============================================================
   MOBILE SHELL  (< 768 px)
   Native-app layout: bottom tab-bar + fullscreen pages.
   Kích hoạt khi window.innerWidth < 768.
*/

const MOB_BREAKPOINT = 768;

/* ── Fix chiều cao viewport thật trên iOS Safari ──
   `100dvh`/`100vh` trên Safari (đặc biệt bản cũ, hoặc lúc thanh địa chỉ
   đang co/giãn) tính sai so với vùng nhìn thấy thực tế → các khối cha
   dùng nó có thể bị lệch chiều cao, khiến các div con overflow-y:auto
   bên trong (trang chủ, iframe bảng điểm...) không nhận được cử chỉ
   vuốt đúng cách dù nhìn layout vẫn "có vẻ" ổn. Set 1 CSS variable
   bằng window.innerHeight thật (luôn chính xác, kể cả Safari cũ) rồi
   dùng nó làm lớp fallback thứ 2 trong CSS (xem mobile.css .win-root).
*/
function _setAppVH() {
  document.documentElement.style.setProperty('--app-vh', `${window.innerHeight * 0.01}px`);
}
_setAppVH();
window.addEventListener('resize', _setAppVH);
window.addEventListener('orientationchange', () => setTimeout(_setAppVH, 60));

/* Dùng cạnh NHỎ HƠN giữa width/height thay vì chỉ innerWidth.
   Lý do: khi xoay ngang điện thoại, width và height chỉ hoán đổi
   cho nhau chứ kích thước vật lý màn hình không đổi — nếu chỉ so
   innerWidth thì máy sẽ bị "tưởng" là desktop lúc xoay ngang (vd
   862x427) và nhảy sang gọi render() của desktop trong khi trang
   mobile.html không hề nạp desktop.css → vỡ giao diện. */
function isMobile() {
  return Math.min(window.innerWidth, window.innerHeight) < MOB_BREAKPOINT;
}

function isMobileDeviceUA() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/* App key → iframe src mapping */
function mobIframeSrc(appKey) {
  const map = {
    dashboard: '../modules/scoreboard/scoreboard-window.html',
    settings:  '../modules/settings/settings-window.html',
    students:  '../modules/seating/seating-window.html',
    profile:   '../modules/profile/profile-window.html',
    duty:      '../modules/duty/duty-window.html',
    summary:   '../modules/summary/summary-window.html',
    chat:      '../modules/chat/chat-window.html',
    admin:     '../modules/admin/admin-window.html',
  };
  return map[appKey] || null;
}

/* Which tabs appear in bottom bar (always visible) */
const MOB_TABS = [
  { key: 'home',      label: 'Trang chủ', iconName: 'home'      },
  { key: 'dashboard', label: 'Bảng điểm', iconName: 'gauge'     },
  { key: 'students',  label: 'Sơ đồ lớp', iconName: 'users'     },
  { key: 'profile',   label: 'Profile',   iconName: 'user'       },
];

/* Mobile state */
let mobActiveTab   = 'home';   // 'home' | app.key
let mobDrawerOpen  = false;
let mobOpenedApps  = {};       // { [appKey]: HTMLIFrameElement } — cached iframes
let _mobRendered   = false;    // true sau lần render đầu tiên
const _mobIframeTimers = new Map();

// computeAccentVars() và applyAccentVars() được dùng chung từ desktop.js,
// vốn đã được mobile shell nạp trước mobile.js.
function mobSendTheme(frame) {
  try {
    frame?.contentWindow?.postMessage({ type: 'theme_change', theme: resolvedTheme, accent }, '*');
    // Tương thích với các module hiện đang nghe tên sự kiện cũ.
    frame?.contentWindow?.postMessage({ type: 'a3k64-theme-change', theme: resolvedTheme, accent }, '*');
    frame?.contentWindow?.postMessage({
      type: 'a3-accent-sync',
      ...computeAccentVars(accent),
      theme: resolvedTheme,
    }, '*');
  } catch {}
}

function mobStartIframeTimer(appKey) {
  clearTimeout(_mobIframeTimers.get(appKey));
  _mobIframeTimers.set(appKey, setTimeout(() => {
    _mobIframeTimers.delete(appKey);
    mobIframeError(appKey);
  }, 15000));
}

function mobRetryIframe(appKey) {
  const frame = document.getElementById(`mob-iframe-${appKey}`);
  const loader = document.getElementById(`mob-loading-${appKey}`);
  if (!frame || !loader) return;
  loader.classList.remove('hidden');
  loader.innerHTML = '<div class="mob-spinner"></div>';
  mobStartIframeTimer(appKey);
  frame.src = frame.src;
}

function mobUpdateOfflineBanner() {
  const banner = document.getElementById('mob-offline-banner');
  if (banner) banner.hidden = navigator.onLine;
}
window.addEventListener('online', mobUpdateOfflineBanner);
window.addEventListener('offline', mobUpdateOfflineBanner);

let _mobSwipe = null;
document.addEventListener('touchstart', (event) => {
  _mobSwipe = null;
  if (!isMobile() || event.touches.length !== 1 || event.touches[0].clientX >= 40) return;
  // Nhường cử chỉ cho bảng hoặc vùng có thể cuộn ngang.
  for (let el = event.target; el && el !== document.body; el = el.parentElement) {
    if (el.matches?.('table, input, textarea, select, [contenteditable="true"]')) return;
    const overflow = getComputedStyle(el).overflowX;
    if (/(auto|scroll)/.test(overflow) && el.scrollWidth > el.clientWidth + 1) return;
  }
  _mobSwipe = { x: event.touches[0].clientX, y: event.touches[0].clientY };
}, { passive: true });
document.addEventListener('touchend', (event) => {
  if (!_mobSwipe || event.changedTouches.length !== 1) { _mobSwipe = null; return; }
  const dx = event.changedTouches[0].clientX - _mobSwipe.x;
  const dy = event.changedTouches[0].clientY - _mobSwipe.y;
  _mobSwipe = null;
  if (dx >= 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    if (mobDrawerOpen) mobToggleDrawer();
    else if (mobActiveTab !== 'home') mobGoHome();
  }
}, { passive: true });
document.addEventListener('touchcancel', () => { _mobSwipe = null; }, { passive: true });

/* ── Build helpers ── */function mobAvatarContent() {
  return user?.photoURL
    ? `<img src="${_escH(user.photoURL)}" alt="Avatar">`
    : getInitials(user?.displayName);
}

function mobBuildTopbar() {
  return `
    <header class="mob-topbar" id="mob-topbar">
      <div class="mob-topbar-brand">
        <div class="mob-topbar-logo" data-class-logo>${window.classLogoHTML ? window.classLogoHTML() : '🛡'}</div>
        <span class="mob-topbar-title" data-class-name>${window.CLASS_NAME || ''}</span>
      </div>
      <div class="mob-topbar-right">
        <button class="mob-topbar-btn" title="Thông báo" onclick="event.preventDefault(); mobOpenApp('dashboard')">
          <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        </button>
        <button class="mob-avatar-btn" title="Menu" onclick="event.preventDefault(); mobToggleDrawer()">
          ${mobAvatarContent()}
        </button>
      </div>
    </header>`;
}

function mobBuildTabbar() {
  return `
    <nav class="mob-tabbar" id="mob-tabbar">
      ${MOB_TABS.map(tab => `
        <button class="mob-tab ${mobActiveTab === tab.key ? 'active' : ''}"
          data-tab="${tab.key}"
          onclick="event.preventDefault(); mobSwitchTab('${tab.key}')">
          ${icon(tab.iconName)}
          <span>${tab.label}</span>
        </button>
      `).join('')}
    </nav>`;
}

function mobBuildHome() {
  const avatarContent = mobAvatarContent();
  return `
    <div class="mob-page ${mobActiveTab === 'home' ? 'active' : ''}" id="mob-page-home">
      <div class="mob-home">
        <div class="mob-home-user">
          <div class="mob-home-avatar">${avatarContent}</div>
          <div class="mob-home-user-info">
            <div class="mob-home-user-name">${_escH(user?.displayName) || 'Học sinh'}</div>
            <div class="mob-home-user-sub">${_escH(user?.email) || ''} · ${user?.role === 'gvcn' ? 'Giáo viên' : user?.role === 'lop_truong' ? 'Lớp trưởng' : 'Học sinh'}</div>
          </div>        </div>

        <div class="mob-stats">
          ${QUICK_STATS.map(s => `
            <div class="mob-stat">
              <div class="mob-stat-val">${s.value}</div>
              <div class="mob-stat-label">${s.label}</div>
            </div>
          `).join('')}
        </div>

        <button class="mob-app-tile" style="width:100%;margin-bottom:12px"
          onclick="event.preventDefault(); mobOpenApp('duty')">
          <div class="mob-tile-icon">📅</div>
          <div>
            <div class="mob-tile-name">Lịch tuần</div>
            <div class="mob-tile-sub">Xem lịch trực tuần này</div>
          </div>
        </button>
        <div class="mob-app-grid">
          ${APPS.map(app => {            const locked = !canOpen(app);
            return `
              <button class="mob-app-tile ${locked ? 'locked' : ''}"
                onclick="event.preventDefault(); ${locked ? "showToast('Mục này chỉ dành cho gvcn, lop_truong hoặc bi_thu.')" : `mobOpenApp('${app.key}')`}">
                <div class="mob-tile-icon">${icon(app.icon)}</div>
                <div>
                  <div class="mob-tile-name">${app.title}</div>
                  <div class="mob-tile-sub">${app.subtitle}</div>
                </div>
              </button>`;
          }).join('')}
        </div>
      </div>
    </div>`;
}

function mobBuildAppPage(appKey) {
  const app = getApp(appKey);
  const src  = mobIframeSrc(appKey);
  const isTab = MOB_TABS.some(t => t.key === appKey);
  const active = mobActiveTab === appKey;

  let content = '';
  if (src) {
    content = `
      <div class="mob-app-iframe-wrap">
        <div class="mob-app-loading" id="mob-loading-${appKey}">
          <div class="mob-spinner"></div>
        </div>
        <iframe class="mob-app-iframe win-embed-frame"
          id="mob-iframe-${appKey}"
          src="${src}"
          title="${app.title}"
          scrolling="yes"
          onload="mobIframeLoaded('${appKey}')"
          onerror="mobIframeError('${appKey}')">
        </iframe>
      </div>`;
  } else {
    // Placeholder for apps without a dedicated iframe module
    content = `
      <div style="padding:20px">
        <div class="mob-home-user" style="margin-bottom:16px">
          <div class="mob-tile-icon" style="width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:color-mix(in srgb,var(--desktop-accent) 18%,transparent);color:var(--desktop-accent)">
            ${icon(app.icon)}
          </div>
          <div>
            <div class="mob-home-user-name">${app.title}</div>
            <div class="mob-home-user-sub">${app.subtitle}</div>
          </div>
        </div>
        <div style="color:#94a3b8;font-size:14px;line-height:1.6">Module này đang được phát triển cho mobile.</div>
      </div>`;
  }

  return `
    <div class="mob-page ${active ? 'active' : ''}" id="mob-page-${appKey}">
      ${!isTab ? `
        <div class="mob-app-topbar">
          <button class="mob-app-back" onclick="event.preventDefault(); mobGoHome()">
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span class="mob-app-bar-title">${app.title}</span>
        </div>` : ''}
      ${content}
    </div>`;
}

function mobBuildDrawer() {
  const avatarContent = mobAvatarContent();
  const drawerApps = APPS.filter(a => !MOB_TABS.some(t => t.key === a.key));

  return `
    <div class="mob-drawer-backdrop ${mobDrawerOpen ? 'open' : ''}" id="mob-backdrop" onclick="event.preventDefault(); mobToggleDrawer()"></div>
    <aside class="mob-drawer ${mobDrawerOpen ? 'open' : ''}" id="mob-drawer">
      <div class="mob-drawer-header">
        <h2>Menu</h2>
        <button class="mob-drawer-close" onclick="event.preventDefault(); mobToggleDrawer()">
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="mob-drawer-user">
        <div class="mob-drawer-avatar">${avatarContent}</div>
        <div>
          <div class="mob-drawer-name">${_escH(user?.displayName) || 'Học sinh'}</div>
          <div class="mob-drawer-email">${_escH(user?.email) || ''}</div>
        </div>
      </div>
      <nav class="mob-drawer-nav">
        ${drawerApps.map(app => {
          const locked = !canOpen(app);
          return `
            <button class="mob-drawer-item"
              onclick="event.preventDefault(); ${locked ? "showToast('Mục này chỉ dành cho gvcn, lop_truong hoặc bi_thu.'); mobToggleDrawer();" : `mobOpenApp('${app.key}'); mobToggleDrawer();`}">
              <div class="mob-drawer-item-icon">${icon(app.icon)}</div>
              ${app.title}
              ${locked ? ' 🔒' : ''}
            </button>`;
        }).join('')}
      </nav>
      <div class="mob-drawer-footer">
        <button class="mob-logout-btn" onclick="event.preventDefault(); handleLogout()">
          ${icon('logout')}
          Đăng xuất
        </button>
      </div>
      <!-- P1-40: Nút đóng các app đang mở (trừ home & tab-bar) -->
      <div class="mob-drawer-app-manager" id="mob-drawer-app-manager" style="display:none;">
        <div class="mob-drawer-section-title">Ứng dụng đang mở</div>
        <div class="mob-drawer-app-list" id="mob-drawer-app-list"></div>
      </div>
    </aside>`;
}
/* ── Full mobile render ── */
function mobRender() {
  const root = document.getElementById('desktop-root');
  if (!root) return;

  // Nếu đã render rồi (vd: resize về mobile), chỉ show lại shell, không rebuild
  if (_mobRendered) {
    root.className = `win-root theme-${resolvedTheme}`;
    applyAccentVars();
    // Đảm bảo active tab đúng
    document.querySelectorAll('.mob-page').forEach(p => {
      p.classList.toggle('active', p.id === `mob-page-${mobActiveTab}`);
    });
    document.querySelectorAll('.mob-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === mobActiveTab);
    });
    return;
  }
  _mobRendered = true;

  // Collect app pages — always home + tabs + any other opened app
  const pageKeys = new Set(MOB_TABS.map(t => t.key).filter(k => k !== 'home'));
  if (mobActiveTab !== 'home' && !pageKeys.has(mobActiveTab)) pageKeys.add(mobActiveTab);

  root.innerHTML = `
    ${mobBuildTopbar()}
    <div class="mob-pages" id="mob-pages">
      ${mobBuildHome()}
      ${[...pageKeys].map(k => mobBuildAppPage(k)).join('')}
    </div>
    ${mobBuildTabbar()}
    ${mobBuildDrawer()}
  `;

  // Bắt đầu timeout cho các iframe được tạo cùng shell.
  document.querySelectorAll('iframe.win-embed-frame').forEach(frame => {
    const appKey = frame.id.replace(/^mob-iframe-/, '');
    mobOpenedApps[appKey] = frame;
    mobStartIframeTimer(appKey);
    mobSendTheme(frame);
  });
  mobUpdateOfflineBanner();

  // P1-40: Khởi tạo danh sách app đang mở (sẽ ẩn vì chưa có app nào ngoài tab-bar)  updateDrawerAppList();
}
/* ── Navigation ── */
function mobSwitchTab(tabKey) {
  if (tabKey === 'home') { mobGoHome(); return; }

  mobActiveTab = tabKey;

  // Update tab active state without full re-render
  document.querySelectorAll('.mob-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabKey);
  });

  // Show correct page
  document.querySelectorAll('.mob-page').forEach(p => {
    p.classList.toggle('active', p.id === `mob-page-${tabKey}`);
  });

  history.pushState({}, '', '#' + tabKey);
}

function mobOpenApp(appKey) {
  if (appKey === 'home') { mobGoHome(); return; }
  if (appKey === 'quickScore') {
    showToast('Đang mở Bảng điểm để chấm thi đua…');
    return mobOpenApp('dashboard');
  }
  if (appKey === 'ranking') {
    showToast('Đang mở Bảng tổng kết & xếp hạng…');
    return mobOpenApp('summary');
  }
  const app = getApp(appKey);
  if (!app) {
    mobGoHome();
    return;
  }
  if (!canOpen(app)) {
    showToast('Mục này chỉ dành cho ' + (app.roles || []).join(', ') + '.');
    return;
  }

  // If page already exists in DOM, just switch to it  const existing = document.getElementById(`mob-page-${appKey}`);
  if (existing) {
    mobActiveTab = appKey;
    document.querySelectorAll('.mob-page').forEach(p => p.classList.remove('active'));
    existing.classList.add('active');
    document.querySelectorAll('.mob-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === appKey);
    });
    history.pushState({}, '', '#' + appKey);
    return;
  }

  // Page doesn't exist yet — inject it
  const pagesEl = document.getElementById('mob-pages');
  if (pagesEl) {
    document.querySelectorAll('.mob-page').forEach(p => p.classList.remove('active'));
    const tmp = document.createElement('div');
    tmp.innerHTML = mobBuildAppPage(appKey);
    const newPage = tmp.firstElementChild;
    newPage.classList.remove('active');
    mobActiveTab = appKey;
    pagesEl.appendChild(newPage);
    const frame = newPage.querySelector('iframe.win-embed-frame');
    if (frame) {
      mobOpenedApps[appKey] = frame;
      mobStartIframeTimer(appKey);
    }
    // Force reflow then activate for transition    requestAnimationFrame(() => newPage.classList.add('active'));
  } else {
    mobActiveTab = appKey;
  }
  // Update tab bar
  document.querySelectorAll('.mob-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === appKey);
  });

  history.pushState({}, '', '#' + appKey);
}

/* P1-39: Đóng app (trừ home & tab-bar apps) — xóa iframe khỏi DOM để giải phóng bộ nhớ */
function mobCloseApp(appKey) {
  if (appKey === 'home') return;
  if (MOB_TABS.some(t => t.key === appKey)) return; // tab-bar apps luôn giữ lại
  clearTimeout(_mobIframeTimers.get(appKey));
  _mobIframeTimers.delete(appKey);
  delete mobOpenedApps[appKey];
  const page = document.getElementById(`mob-page-${appKey}`);
  if (page) {
    // Cleanup iframe reference    const iframe = page.querySelector('iframe.win-embed-frame');
    if (iframe) {
      iframe.src = 'about:blank';
      iframe.remove();
    }
    page.remove();
  }
  // Nếu app đang active thì về home
  if (mobActiveTab === appKey) {
    mobGoHome();
  }
}
function mobGoHome() {
  mobActiveTab = 'home';
  document.querySelectorAll('.mob-page').forEach(p => p.classList.remove('active'));
  const home = document.getElementById('mob-page-home');
  if (home) home.classList.add('active');
  document.querySelectorAll('.mob-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === 'home');
  });
  history.pushState({}, '', '#home');
}

function mobToggleDrawer() {
  mobDrawerOpen = !mobDrawerOpen;
  const drawer   = document.getElementById('mob-drawer');
  const backdrop = document.getElementById('mob-backdrop');
  if (drawer)   drawer.classList.toggle('open', mobDrawerOpen);
  if (backdrop) backdrop.classList.toggle('open', mobDrawerOpen);

  // P1-40: Cập nhật danh sách app đang mở khi mở drawer
  if (mobDrawerOpen) {
    updateDrawerAppList();
  }
}

/* P1-40: Render danh sách app đang mở (trừ home & tab-bar) trong drawer */
function updateDrawerAppList() {
  const listEl = document.getElementById('mob-drawer-app-list');
  const managerEl = document.getElementById('mob-drawer-app-manager');
  if (!listEl || !managerEl) return;

  // Lấy các page đang có trong DOM (trừ home và tab-bar apps)
  const pages = document.querySelectorAll('.mob-page[id^="mob-page-"]');
  const openApps = [];
  pages.forEach(page => {
    const appKey = page.id.replace('mob-page-', '');
    if (appKey === 'home') return;
    if (MOB_TABS.some(t => t.key === appKey)) return;
    const app = getApp(appKey);
    if (app) openApps.push({ key: appKey, title: app.title, icon: app.icon });
  });

  if (openApps.length === 0) {
    managerEl.style.display = 'none';
    return;
  }

  managerEl.style.display = 'block';
  listEl.innerHTML = openApps.map(({ key, title, icon }) => `
    <button class="mob-drawer-app-item" onclick="event.preventDefault(); mobCloseApp('${key}');">
      <div class="mob-drawer-app-icon">${icon(icon)}</div>
      <span>${title}</span>
      <button class="mob-drawer-app-close" onclick="event.stopPropagation(); mobCloseApp('${key}');" aria-label="Đóng ${title}">
        <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </button>
  `).join('');
}
function mobIframeLoaded(appKey) {
  clearTimeout(_mobIframeTimers.get(appKey));
  _mobIframeTimers.delete(appKey);
  const loader = document.getElementById(`mob-loading-${appKey}`);
  if (loader) loader.classList.add('hidden');
  mobSendTheme(document.getElementById(`mob-iframe-${appKey}`));
}

function mobIframeError(appKey) {
  clearTimeout(_mobIframeTimers.get(appKey));
  _mobIframeTimers.delete(appKey);
  const loader = document.getElementById(`mob-loading-${appKey}`);
  if (!loader) return;
  loader.classList.remove('hidden');
  loader.replaceChildren();
  const message = document.createElement('p');
  message.textContent = 'Không thể tải ứng dụng hoặc đã hết thời gian chờ.';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Tải lại ứng dụng';
  retry.addEventListener('click', () => mobRetryIframe(appKey));
  loader.append(message, retry);
}
/* ── Override initDesktop to branch on mobile ── */
const _origInitDesktop = initDesktop;
/* ── Đọc & áp lại tỷ lệ hiển thị đã lưu (Cài đặt → Màn hình) ──
   Cần gọi lúc boot vì settings-window.html chỉ áp tỷ lệ vào lúc người
   dùng đổi (applyScale) — reload trang thì mất, chưa có ai đọc lại. */
function readDisplayScale() {
  const n = Number(localStorage.getItem('a3k64-display-scale'));
  return n > 0 ? n : 100;
}
function applyDisplayScale() {
  const root = document.getElementById('desktop-root');
  if (!root) return;
  const ratio = readDisplayScale() / 100;
  document.documentElement.style.setProperty('--a3-display-scale', ratio);
  root.style.setProperty('--root-w', `${window.innerWidth / ratio}px`);
  root.style.setProperty('--root-h', `${window.innerHeight / ratio}px`);
  if (ratio === 1) {    root.style.transform = '';
    root.style.transformOrigin = '';
    root.style.width = '';
    root.style.height = '';
    root.style.minHeight = '';
  } else {
    // px tuyệt đối từ innerWidth/innerHeight — tránh phụ thuộc % (đòi hỏi
    // ancestor có height xác định) và đè min-height:100vh/dvh của .win-root.
    const w = window.innerWidth  / ratio;
    const h = window.innerHeight / ratio;
    root.style.transformOrigin = 'top left';
    root.style.transform = `scale(${ratio})`;
    root.style.width  = `${w}px`;
    root.style.height = `${h}px`;
    root.style.minHeight = `${h}px`;
  }
}
// Kích thước px ở trên tính từ innerWidth/innerHeight tại thời điểm áp —
// cần tính lại mỗi khi viewport đổi (xoay ngang, thanh địa chỉ co giãn...).
window.addEventListener('resize', applyDisplayScale);

let _mobWasOnMobile = null;

window.initDesktop = function(desktopUser) {
  user = desktopUser;
  accent = readAccent();
  resolvedTheme = readTheme();
  taskbarSettings = readTaskbarSettings();
  pinnedApps = readPinned();
  _mobWasOnMobile = isMobile();

  if (!_mobWasOnMobile && !isMobileDeviceUA()) {
    window.location.replace('../desktop/desktop.html');
    return;
  }

  const root = document.getElementById('desktop-root');
  if (!root) return;
  root.className = `win-root theme-${resolvedTheme}`;
  applyAccentVars();
  applyDisplayScale();

  // Trang mobile.html chỉ nạp mobile.css — luôn giữ mobile shell an toàn
  mobRender();
  if (typeof _initPreload === 'function') _initPreload(desktopUser);
  if (typeof _syncPersonalizationOnLogin === 'function') _syncPersonalizationOnLogin(desktopUser);
  // Open app from hash if present
  const hash = location.hash.slice(1);
  if (hash && hash !== 'home' && hash !== 'desktop') {
    setTimeout(() => mobOpenApp(hash), 80);
    return;
  }
};/* ── Handle responsive resize ── */
window.addEventListener('resize', () => {
  // Helper chuẩn hóa nhận diện
  function isMobileDevice() {
    const hasFinePointer = window.matchMedia && window.matchMedia('(pointer: fine) and (hover: hover)').matches;
    const width = Math.min(window.innerWidth || 9999, window.screen?.width || 9999);
    if (hasFinePointer && width >= 768) return false;
    return true;
  }

  const nowMobile = isMobileDevice();
  if (!nowMobile) {
    window.location.replace('../desktop/desktop.html');
    return;
  }

  if (user) {
    const root = document.getElementById('desktop-root');
    if (!root) return;
    root.className = `win-root theme-${resolvedTheme}`;
    applyAccentVars();
    // P1-38: Chỉ render lại khi chưa render hoặc khi chuyển từ desktop -> mobile
    // Tránh re-render không cần thiết làm mất trạng thái iframe/app đang mở
    if (!_mobRendered) {
      mobRender();
    }
  }
});/* ── Sync theme / accent changes into mobile shell ── */
window.addEventListener('storage', (e) => {
  if (!isMobile() && !isMobileDeviceUA()) return;
  const RELEVANT = ['login-accent','accent-color','accent','desktop-accent','a3k64-accent','a3k64-theme','login-theme','desktop-theme','theme-mode','a3k64-display-scale'];
  if (e.key && !RELEVANT.includes(e.key)) return;
  accent = readAccent();
  resolvedTheme = readTheme();
  applyAccentVars();
  applyThemeClass();
  applyDisplayScale();
  const _themeRoot = document.getElementById('desktop-root');
  if (_themeRoot) _themeRoot.className = `win-root theme-${resolvedTheme}`;
  Object.values(mobOpenedApps).forEach(mobSendTheme);
});
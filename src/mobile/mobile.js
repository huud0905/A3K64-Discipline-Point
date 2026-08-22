/* ============================================================
   MOBILE SHELL  (< 768 px)
   Native-app layout: bottom tab-bar + fullscreen pages.
   Kích hoạt khi window.innerWidth < 768.
   ============================================================ */

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

/* App key → iframe src mapping */
function mobIframeSrc(appKey) {
  const map = {
    dashboard: '../modules/scoreboard/scoreboard-window.html',
    settings:  '../modules/settings/settings-window.html',
    students:  '../modules/seating/seating-window.html',
    profile:   '../modules/profile/profile-window.html',
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

/* ── Build helpers ── */
function mobAvatarContent() {
  return user?.photoURL
    ? `<img src="${user.photoURL}" alt="Avatar">`
    : getInitials(user?.displayName);
}

function mobBuildTopbar() {
  return `
    <header class="mob-topbar" id="mob-topbar">
      <div class="mob-topbar-brand">
        <div class="mob-topbar-logo">🛡</div>
        <span class="mob-topbar-title">A3K64</span>
      </div>
      <div class="mob-topbar-right">
        <button class="mob-topbar-btn" title="Thông báo" onclick="mobOpenApp('dashboard')">
          <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        </button>
        <button class="mob-avatar-btn" title="Menu" onclick="mobToggleDrawer()">
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
          onclick="mobSwitchTab('${tab.key}')">
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
            <div class="mob-home-user-name">${user?.displayName || 'Học sinh'}</div>
            <div class="mob-home-user-sub">${user?.email || ''} · ${user?.role === 'gvcn' ? 'Giáo viên' : user?.role === 'lop_truong' ? 'Lớp trưởng' : 'Học sinh'}</div>
          </div>
        </div>

        <div class="mob-stats">
          ${QUICK_STATS.map(s => `
            <div class="mob-stat">
              <div class="mob-stat-val">${s.value}</div>
              <div class="mob-stat-label">${s.label}</div>
            </div>
          `).join('')}
        </div>

        <div class="mob-app-grid">
          ${APPS.map(app => {
            const locked = !canOpen(app);
            return `
              <button class="mob-app-tile ${locked ? 'locked' : ''}"
                onclick="${locked ? "showToast('Mục này chỉ dành cho gvcn, lop_truong hoặc bi_thu.')" : `mobOpenApp('${app.key}')`}">
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
          <button class="mob-app-back" onclick="mobGoHome()">
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
    <div class="mob-drawer-backdrop ${mobDrawerOpen ? 'open' : ''}" id="mob-backdrop" onclick="mobToggleDrawer()"></div>
    <aside class="mob-drawer ${mobDrawerOpen ? 'open' : ''}" id="mob-drawer">
      <div class="mob-drawer-header">
        <h2>Menu</h2>
        <button class="mob-drawer-close" onclick="mobToggleDrawer()">
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="mob-drawer-user">
        <div class="mob-drawer-avatar">${avatarContent}</div>
        <div>
          <div class="mob-drawer-name">${user?.displayName || 'Học sinh'}</div>
          <div class="mob-drawer-email">${user?.email || ''}</div>
        </div>
      </div>
      <nav class="mob-drawer-nav">
        ${drawerApps.map(app => {
          const locked = !canOpen(app);
          return `
            <button class="mob-drawer-item"
              onclick="${locked ? "showToast('Mục này chỉ dành cho gvcn, lop_truong hoặc bi_thu.'); mobToggleDrawer();" : `mobOpenApp('${app.key}'); mobToggleDrawer();`}">
              <div class="mob-drawer-item-icon">${icon(app.icon)}</div>
              ${app.title}
              ${locked ? ' 🔒' : ''}
            </button>`;
        }).join('')}
      </nav>
      <div class="mob-drawer-footer">
        <button class="mob-logout-btn" onclick="handleLogout()">
          ${icon('logout')}
          Đăng xuất
        </button>
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

  // Re-apply theme propagation into iframes when re-rendered
  document.querySelectorAll('iframe.win-embed-frame').forEach(frame => {
    try { frame.contentWindow?.postMessage({ type: 'a3k64-theme-change', theme: resolvedTheme }, '*'); } catch {}
  });
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

  // If page already exists in DOM, just switch to it
  const existing = document.getElementById(`mob-page-${appKey}`);
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
  mobActiveTab = appKey;
  const pagesEl = document.getElementById('mob-pages');
  if (pagesEl) {
    document.querySelectorAll('.mob-page').forEach(p => p.classList.remove('active'));
    const tmp = document.createElement('div');
    tmp.innerHTML = mobBuildAppPage(appKey);
    const newPage = tmp.firstElementChild;
    pagesEl.appendChild(newPage);
    // Force reflow then activate for transition
    requestAnimationFrame(() => newPage.classList.add('active'));
  }

  // Update tab bar
  document.querySelectorAll('.mob-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === appKey);
  });

  history.pushState({}, '', '#' + appKey);
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
}

function mobIframeLoaded(appKey) {
  const loader = document.getElementById(`mob-loading-${appKey}`);
  if (loader) loader.classList.add('hidden');
  // Propagate theme
  const frame = document.getElementById(`mob-iframe-${appKey}`);
  try { frame?.contentWindow?.postMessage({ type: 'a3k64-theme-change', theme: resolvedTheme }, '*'); } catch {}
}

function mobIframeError(appKey) {
  const loader = document.getElementById(`mob-loading-${appKey}`);
  if (loader) loader.classList.add('hidden');
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
  if (ratio === 1) {
    root.style.transform = '';
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

window.initDesktop = function(desktopUser) {
  user = desktopUser;
  accent = readAccent();
  resolvedTheme = readTheme();
  taskbarSettings = readTaskbarSettings();
  pinnedApps = readPinned();

  const root = document.getElementById('desktop-root');
  root.className = `win-root theme-${resolvedTheme}`;
  applyAccentVars();
  applyDisplayScale();

  if (isMobile()) {
    mobRender();
    // Open app from hash if present
    const hash = location.hash.replace('#', '');
    if (hash && hash !== 'home' && hash !== 'desktop') {
      setTimeout(() => mobOpenApp(hash), 80);
    }
  } else {
    render();
  }
};

/* ── Handle responsive resize ── */
let _mobWasOnMobile = null;
window.addEventListener('resize', () => {
  const nowMobile = isMobile();
  if (_mobWasOnMobile === nowMobile) return;
  _mobWasOnMobile = nowMobile;
  // Reinit on crossing breakpoint
  if (user) {
    const root = document.getElementById('desktop-root');
    root.className = `win-root theme-${resolvedTheme}`;
    applyAccentVars();
    if (nowMobile) {
      mobRender();
    } else {
      render();
      startClock();
    }
  }
});

/* ── Sync theme / accent changes into mobile shell ── */
window.addEventListener('storage', (e) => {
  if (!isMobile()) return;
  const RELEVANT = ['login-accent','accent-color','accent','desktop-accent','a3k64-accent','a3k64-theme','login-theme','desktop-theme','theme-mode','a3k64-display-scale'];
  if (e.key && !RELEVANT.includes(e.key)) return;
  accent = readAccent(); applyAccentVars();
  resolvedTheme = readTheme(); applyThemeClass();
  applyDisplayScale();
  const _themeRoot = document.getElementById('desktop-root');
  if (_themeRoot) _themeRoot.className = `win-root theme-${resolvedTheme}`;
  document.querySelectorAll('iframe.win-embed-frame').forEach(frame => {
    try { frame.contentWindow?.postMessage({ type: 'a3k64-theme-change', theme: resolvedTheme }, '*'); } catch {}
  });
});
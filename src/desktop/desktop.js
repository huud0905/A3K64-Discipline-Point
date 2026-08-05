/* ============================================================
   A3K64 — Desktop shell script
   ============================================================ */

/* ---------- SVG icon helpers ---------- */
const ICONS = {
  gauge:       `<svg viewBox="0 0 24 24"><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M12 2a10 10 0 0 1 7.38 16.75M4.62 18.75a10 10 0 0 1 2.32-14.1"/><path d="M12 12 8 8"/></svg>`,
  settings:    `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>`,
  user:        `<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>`,
  clipboard:   `<svg viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-3"/></svg>`,
  medal:       `<svg viewBox="0 0 24 24"><circle cx="12" cy="15" r="6"/><path d="M8.5 8.5 7 4h10l-1.5 4.5"/></svg>`,
  trophy:      `<svg viewBox="0 0 24 24"><path d="M8 21h8m-4-4v4"/><path d="M6 3H4v5a5 5 0 0 0 5 5h6a5 5 0 0 0 5-5V3h-2"/><path d="M6 3v5M18 3v5"/></svg>`,
  users:       `<svg viewBox="0 0 24 24"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85"/></svg>`,
  lock:        `<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  logout:      `<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  minus:       `<svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  maximize:    `<svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`,
  minimize2:   `<svg viewBox="0 0 24 24"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>`,
  x:           `<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  menu:        `<svg viewBox="0 0 24 24"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>`,
  search:      `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  sparkles:    `<svg viewBox="0 0 24 24"><path d="M9.94 2a.5.5 0 0 1 .49.4l.7 3.5 3.5.7a.5.5 0 0 1 0 .98l-3.5.7-.7 3.5a.5.5 0 0 1-.98 0l-.7-3.5-3.5-.7a.5.5 0 0 1 0-.98l3.5-.7.7-3.5A.5.5 0 0 1 9.94 2z"/><path d="M17 13.5a.5.5 0 0 1 .49.4l.44 2.2 2.2.44a.5.5 0 0 1 0 .98l-2.2.44-.44 2.2a.5.5 0 0 1-.98 0l-.44-2.2-2.2-.44a.5.5 0 0 1 0-.98l2.2-.44.44-2.2A.5.5 0 0 1 17 13.5z"/></svg>`,
  list:        `<svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  home:        `<svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  bell:        `<svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
  calendar:    `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  shield:      `<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  chevron:     `<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>`,
};

function icon(name) {
  return ICONS[name] || '';
}

/* ---------- App definitions ---------- */
const ACCENT_COLORS = {
  blue:   '#2563eb', violet: '#7c3aed', pink: '#db2777',
  green:  '#059669', amber:  '#d97706', red:  '#dc2626',
};

const APPS = [
  { key: 'dashboard', title: 'Bảng điểm A3',      subtitle: 'Tổng quan điểm thi đua lớp',              icon: 'gauge',     path: '/desktop/bang-diem-a3'     },
  { key: 'settings',  title: 'Cài đặt',            subtitle: 'Cá nhân hóa, màu sắc và thanh taskbar',    icon: 'settings',  path: '/desktop/cai-dat'           },
  { key: 'profile',   title: 'Profile',             subtitle: 'Hồ sơ học sinh',                           icon: 'user',      path: '/desktop/profile'           },
  { key: 'quickScore',title: 'Nhập điểm nhanh',    subtitle: 'Cộng/trừ điểm nề nếp và học tập',          icon: 'clipboard', path: '/desktop/nhap-diem-nhanh'  },
  { key: 'ranking',   title: 'Xếp hạng',           subtitle: 'Top tổ, cá nhân theo tuần/tháng',          icon: 'medal',     path: '/desktop/xep-hang'         },
  { key: 'contests',  title: 'Cuộc thi hiện tại',  subtitle: 'Chỉ GVCN, lớp trưởng, bí thư',            icon: 'trophy',    path: '/desktop/cuoc-thi-hien-tai', roles: ['gvcn','lop_truong','bi_thu'] },
  { key: 'students',  title: 'Sơ đồ lớp',          subtitle: 'Học sinh, tổ và chức vụ',                  icon: 'users',     path: '/desktop/so-do-lop'        },
];
const SHORTCUTS = ['dashboard', 'settings', 'profile', 'students'];

const QUICK_STATS = [
  { label: 'Tổng điểm tuần', value: '+245', note: 'Tăng 32 điểm',  icon: 'sparkles' },
  { label: 'Vi phạm',        value: '08',   note: 'Cần xử lý',     icon: 'list'     },
  { label: 'Tổ dẫn đầu',    value: 'Tổ 2', note: 'Ổn định',       icon: 'trophy'   },
];

/* ---------- State ---------- */
let user        = null;   // set by initDesktop()
let windows     = [];     // { key, x, y, z, minimized, maximized }
let focusedKey  = null;
let pinnedApps  = [];
let startOpen   = false;
let searchOpen  = false;
let taskAppMenu = null;   // { x, y, appKey } | null
let zCounter    = 20;
let accent      = '#2563eb';
let resolvedTheme = 'dark';
let taskbarSettings = {
  searchMode: 'box', taskView: true, widgets: false,
  resume: true, alignment: 'center', autoHide: false, badges: true,
};
let clockInterval = null;

/* ---------- Task View state ---------- */
let taskViewOpen  = false;   // full overlay open
let taskViewPeek  = false;   // mini hover-peek open
let taskViewPeekTimer = null;
let taskViewPeekCloseTimer = null; // grace-period timer before the peek actually closes
let taskViewDesktops = [];   // [{ id, name, thumb }]
let taskViewActiveId = 'desk-1';

function _tvInit() {
  if (taskViewDesktops.length) return;
  taskViewDesktops = [{ id: 'desk-1', name: 'Desktop 1' }];
  taskViewActiveId = 'desk-1';
}

/* ---------- Helpers ---------- */
function getApp(key) { return APPS.find(a => a.key === key) || APPS[0]; }

function getInitials(name) {
  if (!name) return 'A3';
  const parts = name.trim().split(/\s+/).slice(-2);
  return parts.map(p => p[0]?.toUpperCase()).join('') || 'A3';
}

function canOpen(app) {
  if (!app.roles?.length) return true;
  return app.roles.includes(String(user?.role || 'hoc_sinh'));
}

function normalizeColor(val) {
  if (!val) return null;
  const raw = val.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return raw;
  return ACCENT_COLORS[raw.toLowerCase()] || null;
}

function readAccent() {
  const keys = ['login-accent','accent-color','accent','desktop-accent','a3k64-accent'];
  for (const k of keys) {
    const c = normalizeColor(localStorage.getItem(k));
    if (c) return c;
  }
  return ACCENT_COLORS.blue;
}

function readTheme() {
  // Đọc theo đúng thứ tự ưu tiên mà settings-window.html thực sự ghi vào
  // (desktop-theme là key "mới nhất"/đáng tin nhất). Trước đây hàm này chỉ
  // đọc 'a3k64-theme' rồi mới tới 'login-theme' — nếu 'a3k64-theme' còn
  // giá trị cũ (vd. 'dark' từ trước), nó sẽ CHE mất lựa chọn mới người
  // dùng vừa đổi ở Cài đặt (được ghi vào 'desktop-theme'/'theme-mode'),
  // khiến bấm "Sáng" không có tác dụng trên toàn hệ thống.
  const raw = localStorage.getItem('desktop-theme')
    || localStorage.getItem('login-theme')
    || localStorage.getItem('theme-mode')
    || localStorage.getItem('a3k64-theme')
    || 'dark';
  const map = { light:'light', sang:'light', sáng:'light', dark:'dark', toi:'dark', tối:'dark', auto:'auto' };
  const mode = map[raw.toLowerCase()] || 'dark';
  if (mode === 'auto') return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  return mode;
}

function readTaskbarSettings() {
  try { return { ...taskbarSettings, ...JSON.parse(localStorage.getItem('taskbar-settings') || '{}') }; }
  catch { return taskbarSettings; }
}

function readPinned() {
  try { return JSON.parse(localStorage.getItem('pinned-apps') || '[]'); } catch { return []; }
}

function savePinned() { localStorage.setItem('pinned-apps', JSON.stringify(pinnedApps)); }

/* ---------- Render helpers ---------- */
function applyAccentVars() {
  document.documentElement.style.setProperty('--desktop-accent', accent);
}

function applyThemeClass() {
  const root = document.getElementById('desktop-root');
  if (!root) return;
  root.className = root.className.replace(/theme-\w+/g, '').trim();
  root.classList.add(`theme-${resolvedTheme}`);
  // Propagate theme vào tất cả iframe con (scoreboard, settings, seating...)
  // để chúng sync data-theme mà không cần reload
  document.querySelectorAll('iframe.win-embed-frame').forEach(frame => {
    try {
      frame.contentWindow?.postMessage({ type: 'a3k64-theme-change', theme: resolvedTheme }, '*');
    } catch {}
  });
}

/* ---------- Clock ---------- */
function startClock() {
  const el = document.getElementById('clock-time');
  const ed = document.getElementById('clock-date');
  function tick() {
    const now = new Date();
    if (el) el.textContent = now.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' });
    if (ed) ed.textContent = now.toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' });
  }
  tick();
  clockInterval = setInterval(tick, 1000);
}

/* ---------- Toast ---------- */
function showToast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.getElementById('desktop-root').appendChild(t); }
  t.textContent = msg;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.remove(), 2600);
}

/* ---------- Desktop icons coverage detection ---------- */
function updateIconsCovered() {
  const icons = document.querySelector('.desktop-icons');
  if (!icons) return;
  const iconRect = icons.getBoundingClientRect();
  const openWins = [...document.querySelectorAll('.win-window:not(.minimized)')];
  const covered  = openWins.some(win => {
    const r = win.getBoundingClientRect();
    return !(r.right < iconRect.left || r.left > iconRect.right || r.bottom < iconRect.top || r.top > iconRect.bottom);
  });
  icons.classList.toggle('covered', covered);
}

/* ---------- Window management ---------- */
function bringToFront(key, restore = true) {
  zCounter++;
  windows = windows.map(w => w.key === key
    ? { ...w, minimized: restore ? false : w.minimized, z: zCounter }
    : w);
  focusedKey = key;
  renderWindows();
  updateTaskbarActiveState();
}

function openApp(app, e) {
  if (e) e.preventDefault();
  if (!canOpen(app)) { showToast('Mục này chỉ dành cho gvcn, lop_truong hoặc bi_thu.'); return; }
  startOpen = false; searchOpen = false; taskAppMenu = null;
  zCounter++;
  const exists = windows.find(w => w.key === app.key);
  if (exists) {
    windows = windows.map(w => w.key === app.key ? { ...w, minimized: false, z: zCounter } : w);
  } else {
    const offset = Math.min(windows.length * 28, 110);
    windows.push({ key: app.key, x: offset, y: offset, z: zCounter, minimized: false, maximized: false });
  }
  focusedKey = app.key;
  history.pushState({}, '', '#' + app.key);

  // Targeted updates — no full re-render
  _patchOverlays();          // close start menu / search / context menu
  renderWindows();           // add the new window to DOM
  renderTaskbar();           // thêm icon app mới vào taskbar
  updateIconsCovered();

  // Hide empty-note when first window opens
  const note = document.querySelector('.win-empty-note');
  if (note) note.style.display = 'none';
}

function closeWindow(key) {
  windows = windows.filter(w => w.key !== key);
  if (focusedKey === key) {
    const next = windows.filter(w => !w.minimized).sort((a,b) => b.z - a.z)[0] || null;
    focusedKey = next?.key || null;
    history.pushState({}, '', next ? '#' + next.key : '#desktop');
  }
  taskAppMenu = null;
  renderWindows();
  renderTaskbar();           // xoá icon app đã đóng khỏi taskbar
  updateIconsCovered();
  // Show empty-note again when all windows closed
  if (windows.length === 0) {
    const note = document.querySelector('.win-empty-note');
    if (note) note.style.display = '';
  }
}

function minimizeWindow(key) {
  windows = windows.map(w => w.key === key ? { ...w, minimized: true } : w);
  if (focusedKey === key) {
    const next = windows.filter(w => !w.minimized).sort((a,b) => b.z - a.z)[0] || null;
    focusedKey = next?.key || null;
    history.pushState({}, '', next ? '#' + next.key : '#desktop');
  }
  renderWindows();
  updateTaskbarActiveState();
  updateIconsCovered();
}

function toggleMaximize(key) {
  windows = windows.map(w => w.key === key ? { ...w, maximized: !w.maximized, snapZone: null } : w);
  bringToFront(key, true);
}

/* ---------- Drag ---------- */
function startDrag(e, win) {
  if (win.maximized || win.snapZone || e.button !== 0) return;
  e.preventDefault();
  bringToFront(win.key, true);
  const startX = e.clientX, startY = e.clientY;
  const startPos = { x: win.x, y: win.y };
  // Khi rê chuột đè lên vùng <iframe> (Bảng điểm/Cài đặt/Sơ đồ lớp...),
  // sự kiện mousemove bị iframe "nuốt" mất — nó thuộc document riêng của
  // iframe chứ không nổi bọt lên document cha, nên listener gắn trên
  // window ở đây ngừng nhận được sự kiện → kéo bị "đơ" cho tới khi chuột
  // ra khỏi vùng iframe. Tắt pointer-events trên mọi iframe trong lúc kéo
  // để toàn bộ chuyển động chuột luôn tới được listener này.
  document.body.classList.add('win-interacting');
  function move(mv) {
    const TASKBAR_H = 64;         // taskbar + gap at bottom
    const TITLEBAR_H = 46;        // min visible strip at top
    const MIN_VISIBLE_X = 80;     // px of window that must stay on-screen horizontally

    const winEl = document.getElementById(`win-${win.key}`);
    const winW  = winEl ? winEl.offsetWidth  : 800;
    const winH  = winEl ? winEl.offsetHeight : 600;

    const rawX = startPos.x + mv.clientX - startX;
    const rawY = startPos.y + mv.clientY - startY;

    const clampedX = Math.max(-(winW - MIN_VISIBLE_X), Math.min(rawX, window.innerWidth  - MIN_VISIBLE_X));
    const clampedY = Math.max(-TITLEBAR_H + 8,          Math.min(rawY, window.innerHeight - TASKBAR_H - TITLEBAR_H));

    windows = windows.map(w => w.key === win.key
      ? { ...w, x: clampedX, y: clampedY }
      : w);
    renderWindows(); // fast update only windows layer
    updateIconsCovered();
  }
  function up() {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    document.body.classList.remove('win-interacting');
  }
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}

/* ---------- Resize ---------- */
function startResize(e, key, dir) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();

  // Resizing means leaving Snap placement — switch back to the normal
  // floating width/height system so the drag actually has an effect.
  windows = windows.map(w => w.key === key ? { ...w, snapZone: null } : w);

  bringToFront(key, true);

  const MIN_W = 360, MIN_H = 260;
  const winEl = document.getElementById(`win-${key}`);
  if (!winEl) return;

  const startX = e.clientX, startY = e.clientY;
  const startW = winEl.offsetWidth, startH = winEl.offsetHeight;
  // Tương tự startDrag(): tắt pointer-events trên iframe trong lúc resize
  // để chuột đè lên iframe (vùng chiếm gần hết thân cửa sổ) không làm mất
  // sự kiện mousemove và khiến việc kéo dãn bị đơ giữa chừng.
  document.body.classList.add('win-interacting');

  function move(mv) {
    const dX = mv.clientX - startX;
    const dY = mv.clientY - startY;
    let newW = startW, newH = startH;
    if (dir === 'e'  || dir === 'se') newW = Math.max(MIN_W, startW + dX);
    if (dir === 's'  || dir === 'se') newH = Math.max(MIN_H, startH + dY);
    winEl.style.width  = newW + 'px';
    winEl.style.height = newH + 'px';
    updateIconsCovered();
  }
  function up() {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    document.body.style.cursor = '';
    document.body.classList.remove('win-interacting');
    // Persist final size into state so renderWindows() keeps it
    const el = document.getElementById(`win-${key}`);
    if (el) {
      windows = windows.map(w => w.key === key
        ? { ...w, w: el.offsetWidth, h: el.offsetHeight }
        : w);
    }
  }
  document.body.style.cursor =
    dir === 's' ? 's-resize' : dir === 'e' ? 'e-resize' : 'se-resize';
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}

/* ---------- Taskbar items ---------- */
function taskbarItems() {
  return [...new Set([...pinnedApps, ...windows.map(w => w.key)])];
}

/* ---------- Targeted taskbar active-state patch ---------- */
function updateTaskbarActiveState() {
  const taskbar = document.querySelector('.taskbar');
  if (!taskbar) return;
  taskbar.querySelectorAll('.task-icon[data-appkey]').forEach(btn => {
    const key      = btn.dataset.appkey;
    const winState = windows.find(w => w.key === key);
    const isOpen   = !!winState;
    const isFocused = focusedKey === key && !winState?.minimized;
    btn.classList.toggle('active',      isFocused);
    btn.classList.toggle('running-app', isOpen);
    btn.classList.toggle('show-badge',  taskbarSettings.badges && isOpen);
  });
}

function renderTaskbar() {
  const root = document.getElementById('desktop-root');
  if (!root) return;
  let tb = root.querySelector('.taskbar');
  if (!tb) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = buildTaskbar();
  tb.replaceWith(tmp.firstElementChild);
  startClock(); // re-attach clock to new taskbar DOM nodes
}

function togglePin(appKey) {
  if (pinnedApps.includes(appKey)) pinnedApps = pinnedApps.filter(k => k !== appKey);
  else pinnedApps.push(appKey);
  savePinned(); taskAppMenu = null;
  renderTaskbar();
  _patchOverlays(); // close context menu
}

function handleTaskbarClick(appKey) {
  const win = windows.find(w => w.key === appKey);
  if (win) { bringToFront(appKey, true); history.pushState({}, '', '#' + appKey); return; }
  openApp(getApp(appKey));
}

/* ---------- Focus mode ---------- */
let focusMode = false;
function toggleFocusMode() {
  startOpen = false; searchOpen = false; taskAppMenu = null;
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.().catch(() => {});
}
document.addEventListener('fullscreenchange', () => {
  focusMode = !!document.fullscreenElement;
  render();
});

/* ---------- Build HTML ---------- */
function buildDesktopIcons() {
  return SHORTCUTS.map(key => {
    const app = getApp(key);
    const locked = !canOpen(app);
    return `
      <button class="desktop-shortcut" title="${locked ? 'Bạn chưa có quyền xem mục này' : app.title + ' – bấm đúp để mở'}"
        data-app="${app.key}" ondblclick="openApp(getApp('${app.key}'), event)">
        <div class="desktop-shortcut-icon">${locked ? icon('lock') : icon(app.icon)}</div>
        <span>${app.title}</span>
      </button>`;
  }).join('');
}

function buildWindowContent(app) {
  // "Bảng điểm A3" mở app Scoreboard thật (HTML/CSS/JS thuần), nhúng qua iframe
  // cùng-origin để cô lập vòng render riêng của nó khỏi vòng render của desktop.
  if (app.key === 'dashboard') {
    return `
      <div class="win-embed">
        <iframe class="win-embed-frame" src="../modules/scoreboard/scoreboard-window.html" title="${app.title}" loading="lazy"></iframe>
      </div>`;
  }

  if (app.key === 'settings') {
    return `
      <div class="win-embed">
        <iframe class="win-embed-frame" src="../modules/settings/settings-window.html" title="${app.title}" loading="lazy"></iframe>
      </div>`;
  }

  // "Sơ đồ lớp" mở app Seating thật (HTML/CSS/JS thuần), nhúng qua iframe
  // cùng-origin, cùng quy ước với dashboard/settings ở trên.
  if (app.key === 'students') {
    return `
      <div class="win-embed">
        <iframe class="win-embed-frame" src="../modules/seating/seating-window.html" title="${app.title}" loading="lazy"></iframe>
      </div>`;
  }

  // "Profile" mở app Profile thật (HTML/CSS/JS thuần), nhúng qua iframe
  // cùng-origin, cùng quy ước với dashboard/settings/students ở trên.
  if (app.key === 'profile') {
    return `
      <div class="win-embed">
        <iframe class="win-embed-frame" src="../modules/profile/profile-window.html" title="${app.title}" loading="lazy"></iframe>
      </div>`;
  }

  // Generic placeholder content (replace with real app content later)
  return `
    <section class="win-content">
      <div class="content-hero">
        <div class="content-hero-top">
          <div>
            <span class="hero-chip">${icon(app.icon)} ${app.title}</span>
            <h1>12A3 – Quản lý thi đua</h1>
            <p>${app.subtitle}. Đường dẫn: <b>${app.path}</b></p>
          </div>
          <button class="hero-action">Tạo mới</button>
        </div>
      </div>
      <div class="stat-grid">
        ${QUICK_STATS.map(s => `
          <article class="stat-card">
            <div class="stat-card-head"><span>${s.label}</span>${icon(s.icon)}</div>
            <strong>${s.value}</strong>
            <span class="stat-note">${s.note}</span>
          </article>`).join('')}
      </div>
      <div class="panel-grid">
        <section class="win-panel">
          <div class="panel-header">
            <div><h2>Hoạt động gần đây</h2><span class="panel-sub">Cập nhật điểm mới nhất</span></div>
            ${icon('chevron')}
          </div>
          <div class="table-like">
            <div class="table-row"><div><strong>Phát biểu xây dựng bài</strong><span class="row-sub">Học tập · vừa xong</span></div><div class="score-pill">+5</div></div>
            <div class="table-row"><div><strong>Không đeo thẻ học sinh</strong><span class="row-sub">Nề nếp · 15 phút trước</span></div><div class="score-pill negative">-5</div></div>
            <div class="table-row"><div><strong>Kiểm tra bài cũ đạt 10</strong><span class="row-sub">Học tập · hôm nay</span></div><div class="score-pill">+10</div></div>
          </div>
        </section>
        <section class="win-panel">
          <div class="panel-header">
            <div><h2>Lịch &amp; thông báo</h2><span class="panel-sub">Nhắc việc trong tuần</span></div>
            ${icon('bell')}
          </div>
          <div class="table-like">
            <div class="table-row"><div><strong>Tổng kết thi đua tuần</strong><span class="row-sub">Thứ 7 · 17:00</span></div>${icon('calendar')}</div>
            <div class="table-row"><div><strong>Kiểm tra danh sách vi phạm</strong><span class="row-sub">Lớp trưởng / Bí thư</span></div>${icon('shield')}</div>
          </div>
        </section>
      </div>
    </section>`;
}

function buildSidebar(activeKey) {
  const avatarContent = user.photoURL
    ? `<img src="${user.photoURL}" alt="Avatar">`
    : getInitials(user.displayName);
  return `
    <aside class="win-sidebar">
      <div class="user-card">
        <div class="avatar">${avatarContent}</div>
        <div style="min-width:0">
          <strong>${user.displayName || 'Người dùng 12A3'}</strong>
          <span class="user-email">${user.email || user.role || 'Đang đăng nhập'}</span>
        </div>
      </div>
      <nav class="side-nav">
        ${APPS.map(app => {
          const locked = !canOpen(app);
          return `
            <button class="side-item ${app.key === activeKey ? 'active' : ''} ${locked ? 'locked' : ''}"
              onclick="openApp(getApp('${app.key}'), event)">
              <div class="side-item-icon">${locked ? icon('lock') : icon(app.icon)}</div>
              <div style="min-width:0">
                <strong>${app.title}</strong>
                <span class="side-subtitle">${app.subtitle}</span>
              </div>
            </button>`;
        }).join('')}
      </nav>
      <div class="side-bottom">
        <button class="logout-button" onclick="handleLogout()">
          ${icon('logout')} Đăng xuất
        </button>
      </div>
    </aside>`;
}

function buildWindowHTML(win) {
  const app = getApp(win.key);
  const isFocused = focusedKey === win.key;
  const fullWidth = ['settings','dashboard','profile','students'].includes(win.key);
  // Chỉ gắn width/height tuỳ chỉnh (từ lần resize tay trước đó) khi cửa sổ
  // KHÔNG maximize — nếu không, inline style sẽ đè lên width:100vw/height
  // của class .maximized (inline có độ ưu tiên cao hơn class) và cửa sổ
  // sẽ không bao giờ phóng to hết cỡ được.
  const sizeStyle = win.maximized
    ? ''
    : win.snapZone
      // Real Snap Layouts placement — fixed to an exact region of the desktop
      // (100vh - 58px is the working area above the taskbar), overriding the
      // normal transform-based floating position entirely.
      ? `;position:fixed;transform:none;min-height:0;` +
        `left:${win.snapZone.x}vw;` +
        `top:calc((100vh - 58px) * ${win.snapZone.y / 100});` +
        `width:${win.snapZone.w}vw;` +
        `height:calc((100vh - 58px) * ${win.snapZone.h / 100})`
      : `${win.w ? `;width:${win.w}px` : ''}${win.h ? `;height:${win.h}px` : ''}`;
  return `
    <section class="win-window ${win.maximized ? 'maximized' : ''} ${win.snapZone ? 'snapped' : ''} ${win.minimized ? 'minimized' : ''} ${isFocused ? 'focused' : ''}"
      id="win-${win.key}"
      style="--win-x:${win.x}px;--win-y:${win.y}px;z-index:${win.z}${sizeStyle}"
      onmousedown="bringToFront('${win.key}', true)"
      oncontextmenu="return false">
      <header class="win-titlebar"
        onmousedown="handleTitlebarMouseDown(event, '${win.key}')"
        ondblclick="toggleMaximize('${win.key}')">
        <div class="title-left">
          <div class="title-icon">${icon(app.icon)}</div>
          <strong>${app.title}</strong>
        </div>
        <div class="window-actions" onmousedown="event.stopPropagation()">
          <button title="Thu nhỏ"     onclick="minimizeWindow('${win.key}')">${icon('minus')}</button>
          <button class="btn-maximize" title="${win.maximized ? 'Khôi phục' : 'Phóng to'}"
            onclick="toggleMaximize('${win.key}'); openSnapPopoverAt('${win.key}', this)"
            onmouseenter="scheduleSnapOpen('${win.key}', this)"
            onmouseleave="scheduleSnapClose()">${win.maximized ? icon('minimize2') : icon('maximize')}</button>
          <button class="btn-close" title="Đóng" onclick="closeWindow('${win.key}')">${icon('x')}</button>
        </div>
      </header>
      <div class="win-body ${fullWidth ? 'full-width' : ''}">
        ${fullWidth ? '' : buildSidebar(win.key)}
        ${buildWindowContent(app)}
      </div>
      <div class="resize-handle resize-s"  onmousedown="startResize(event,'${win.key}','s')"></div>
      <div class="resize-handle resize-e"  onmousedown="startResize(event,'${win.key}','e')"></div>
      <div class="resize-handle resize-se" onmousedown="startResize(event,'${win.key}','se')"></div>
    </section>`;
}

function buildWindows() {
  return windows.map(buildWindowHTML).join('');
}

function buildTaskbar() {
  const items = taskbarItems();
  const searchMode = taskbarSettings.searchMode;
  const alignment  = taskbarSettings.alignment;
  return `
    <nav class="taskbar align-${alignment} ${taskbarSettings.autoHide ? 'auto-hide' : ''}" aria-label="Taskbar">
      <div class="task-left"></div>
      <div class="task-center">
        <button class="task-start" onclick="toggleStartMenu()" title="Start">${icon('menu')}</button>
        ${searchMode === 'icon'
          ? `<button class="task-icon" onclick="toggleSearchPanel()" title="Tìm kiếm">${icon('search')}</button>`
          : `<button class="task-search" onclick="toggleSearchPanel()">${icon('search')}<span>Tìm kiếm</span></button>`}
        <button class="task-focus-switch ${focusMode ? 'on' : ''}" onclick="toggleFocusMode()" title="Tập trung toàn màn hình">
          <span class="task-focus-knob"></span>
          <span class="task-focus-text">${focusMode ? 'ON' : 'OFF'}</span>
        </button>
        ${taskbarSettings.taskView ? `<button class="task-icon task-view-btn" id="task-view-btn" title="Chế độ xem tác vụ"
          onmouseenter="scheduleTaskViewPeek(this)"
          onmouseleave="cancelTaskViewPeek()"
          onclick="toggleTaskView()">${icon('list')}</button>` : ''}
        ${taskbarSettings.widgets  ? `<button class="task-icon" title="Tiện ích">${icon('sparkles')}</button>` : ''}
        ${taskbarSettings.resume   ? `<button class="task-icon" title="Tiếp tục">${icon('home')}</button>` : ''}
        ${items.map(key => {
          const a   = getApp(key);
          const isOpen    = windows.some(w => w.key === key);
          const winState  = windows.find(w => w.key === key);
          const isFocused = focusedKey === key && !winState?.minimized;
          const isPinned  = pinnedApps.includes(key);
          return `
            <button class="task-icon ${isFocused ? 'active' : ''} ${isOpen ? 'running-app' : ''} ${isPinned ? 'pinned-app' : ''} ${taskbarSettings.badges && isOpen ? 'show-badge' : ''}"
              data-appkey="${key}"
              title="${a.title}"
              onclick="handleTaskbarClick('${key}')"
              oncontextmenu="showTaskAppMenu(event,'${key}')">
              ${icon(a.icon)}
            </button>`;
        }).join('')}
      </div>
      <div class="task-right">
        <span id="clock-time"></span>
        <span id="clock-date"></span>
      </div>
    </nav>`;
}

function buildStartMenu() {
  if (!startOpen) return '';
  const alignment = taskbarSettings.alignment;
  const avatarContent = user.photoURL
    ? `<img src="${user.photoURL}" alt="Avatar">`
    : getInitials(user.displayName);
  return `
    <section class="start-menu align-${alignment}">
      <div class="start-header"><h2>Đã ghim</h2></div>
      <div class="start-app-grid">
        ${APPS.map(app => `
          <button class="start-app" onclick="openApp(getApp('${app.key}'), event)">
            <div class="start-app-icon">${canOpen(app) ? icon(app.icon) : icon('lock')}</div>
            <span>${app.title}</span>
          </button>`).join('')}
      </div>
      <div class="start-footer">
        <div class="user-card" style="padding:0;background:transparent">
          <div class="avatar" style="width:34px;height:34px;border-radius:12px">${avatarContent}</div>
          <strong>${user.displayName || '12A3'}</strong>
        </div>
        <button class="logout-button" style="width:118px" onclick="handleLogout()">${icon('logout')} Thoát</button>
      </div>
    </section>`;
}

function buildSearchPanel() {
  if (!searchOpen) return '';
  const alignment = taskbarSettings.alignment;
  return `
    <section class="search-panel align-${alignment}">
      <div class="search-header"><h2>Tìm kiếm</h2></div>
      <div class="table-like">
        ${APPS.map(app => `
          <button class="side-item" onclick="openApp(getApp('${app.key}'), event)">
            <div class="side-item-icon">${icon(app.icon)}</div>
            <div>
              <strong>${app.title}</strong>
              <span class="side-subtitle">${app.subtitle}</span>
            </div>
          </button>`).join('')}
      </div>
    </section>`;
}

function buildTaskAppMenu() {
  if (!taskAppMenu) return '';
  const app = getApp(taskAppMenu.appKey);
  const isPinned = pinnedApps.includes(taskAppMenu.appKey);
  const isOpen   = windows.some(w => w.key === taskAppMenu.appKey);
  return `
    <div class="task-app-menu" style="left:${taskAppMenu.x}px;top:${taskAppMenu.y}px"
      onclick="event.stopPropagation()">
      <button onclick="togglePin('${app.key}')">
        <span>📌</span>${isPinned ? 'Bỏ ghim khỏi taskbar' : 'Ghim vào taskbar'}
      </button>
      ${isOpen ? `<button onclick="closeWindow('${app.key}');taskAppMenu=null;_patchOverlays()"><span>×</span>Đóng cửa sổ</button>` : ''}
    </div>`;
}

function buildEmptyNote() {
  if (windows.length > 0) return '';
  return `
    <div class="win-empty-note">
      ${icon('user')}
      <h1>Desktop 12A3</h1>
      <p>Bấm đúp vào icon bên trái, hoặc mở ứng dụng từ Start menu.</p>
    </div>`;
}

/* ---------- Targeted overlay patch (avoids full re-render) ---------- */
function _patchOverlays() {
  const root = document.getElementById('desktop-root');
  if (!root) return;

  // Start menu
  let sm = root.querySelector('.start-menu');
  if (startOpen) {
    const html = buildStartMenu();
    if (!sm) {
      const div = document.createElement('div');
      div.innerHTML = html;
      root.appendChild(div.firstElementChild);
    }
    // else already present — content didn't change; skip
  } else {
    if (sm) sm.remove();
  }

  // Search panel
  let sp = root.querySelector('.search-panel');
  if (searchOpen) {
    if (!sp) {
      const div = document.createElement('div');
      div.innerHTML = buildSearchPanel();
      root.appendChild(div.firstElementChild);
    }
  } else {
    if (sp) sp.remove();
  }

  // Task-app context menu
  let tm = root.querySelector('.task-app-menu');
  if (taskAppMenu) {
    const html = buildTaskAppMenu();
    if (!tm) {
      const div = document.createElement('div');
      div.innerHTML = html;
      root.appendChild(div.firstElementChild);
    } else {
      // position may have changed
      tm.style.left = taskAppMenu.x + 'px';
      tm.style.top  = taskAppMenu.y + 'px';
    }
  } else {
    if (tm) tm.remove();
  }
}

/* ---------- Render ---------- */
function renderWindows() {
  const zone = document.getElementById('windows-zone');
  if (!zone) return;

  // First paint: nothing to diff against, just build everything.
  if (!zone.children.length && windows.length) {
    zone.innerHTML = buildWindows();
    return;
  }

  const wantedKeys = new Set(windows.map(w => w.key));

  // Remove DOM nodes for windows that were closed.
  Array.from(zone.children).forEach(el => {
    const key = el.id.replace(/^win-/, '');
    if (!wantedKeys.has(key)) el.remove();
  });

  // Create-once / patch-in-place for the rest — this is what keeps an
  // embedded iframe (ex: Scoreboard) alive across drag/focus/minimize
  // instead of getting torn down and reloaded on every update.
  windows.forEach(win => {
    let el = document.getElementById(`win-${win.key}`);
    if (!el) {
      const wrap = document.createElement('div');
      wrap.innerHTML = buildWindowHTML(win);
      el = wrap.firstElementChild;
      zone.appendChild(el);
      return; // freshly built from current state already, nothing else to patch
    }
    el.classList.toggle('maximized', !!win.maximized);
    el.classList.toggle('minimized', !!win.minimized);
    el.classList.toggle('focused', focusedKey === win.key);
    el.style.setProperty('--win-x', win.x + 'px');
    el.style.setProperty('--win-y', win.y + 'px');
    el.style.zIndex = win.z;
    // Inline width/height (từ lần resize tay trước đó) có độ ưu tiên CSS
    // CAO HƠN class .maximized (width:100vw;height:calc(100vh - 58px)).
    // Nếu cứ set inline width/height mỗi lần patch, cửa sổ đã từng bị
    // resize tay sẽ KHÔNG BAO GIỜ phóng to hết cỡ được nữa — đây chính là
    // lỗi "phóng to lên không to hết cỡ". Khi maximized, phải xoá hẳn
    // inline width/height để CSS .maximized toàn quyền kiểm soát kích
    // thước; kích thước resize tay (win.w/win.h) chỉ áp dụng lại khi
    // khôi phục (không maximized).
    el.classList.toggle('snapped', !!win.snapZone);
    if (win.maximized) {
      el.style.removeProperty('width');
      el.style.removeProperty('height');
      el.style.removeProperty('left');
      el.style.removeProperty('top');
      el.style.removeProperty('position');
      el.style.removeProperty('transform');
      el.style.removeProperty('min-height');
    } else if (win.snapZone) {
      // Snap Layouts docking — must be applied here too, not just in
      // buildWindowHTML, because this patch-in-place path is what actually
      // runs for a window that already exists in the DOM (which is always
      // the case right after clicking a zone on its own Maximize button).
      const z = win.snapZone;
      el.style.position   = 'fixed';
      el.style.transform  = 'none';
      el.style.minHeight  = '0';
      el.style.left       = z.x + 'vw';
      el.style.top        = `calc((100vh - 58px) * ${z.y / 100})`;
      el.style.width      = z.w + 'vw';
      el.style.height     = `calc((100vh - 58px) * ${z.h / 100})`;
    } else {
      el.style.removeProperty('position');
      el.style.removeProperty('transform');
      el.style.removeProperty('min-height');
      el.style.removeProperty('left');
      el.style.removeProperty('top');
      if (win.w) el.style.width = win.w + 'px'; else el.style.removeProperty('width');
      if (win.h) el.style.height = win.h + 'px'; else el.style.removeProperty('height');
    }
    const maxBtn = el.querySelector('.btn-maximize');
    if (maxBtn) {
      maxBtn.title = win.maximized ? 'Khôi phục' : 'Phóng to';
      maxBtn.innerHTML = win.maximized ? icon('minimize2') : icon('maximize');
    }
  });
}

/* ============================================================
   TASK VIEW — peek (hover) + full overlay (click)
   ============================================================ */

// ---- Peek (0.5s hover → mini tooltip above taskbar button) ----
// The peek panel is rendered a few pixels ABOVE the button (there's a gap
// between them), so moving the mouse from the button up into the panel
// briefly leaves the button's bounding box. If we closed the peek the
// instant the mouse left the button, it would vanish before the mouse
// ever reached it. To fix that, "leaving" only *schedules* a close after
// a short grace period — entering either the button or the peek panel
// within that window cancels the pending close.
function scheduleTaskViewPeek(btn) {
  clearTimeout(taskViewPeekTimer);
  clearTimeout(taskViewPeekCloseTimer);
  if (taskViewPeek) return; // already showing — just cancel any pending close
  taskViewPeekTimer = setTimeout(() => {
    _tvInit();
    taskViewPeek = true;
    _renderTaskViewPeek(btn);
  }, 500);
}

function cancelTaskViewPeek() {
  clearTimeout(taskViewPeekTimer);
  taskViewPeekTimer = null;
  clearTimeout(taskViewPeekCloseTimer);
  taskViewPeekCloseTimer = setTimeout(() => {
    if (!taskViewOpen) _removeTaskViewPeek();
  }, 150);
}

function _removeTaskViewPeek() {
  clearTimeout(taskViewPeekCloseTimer);
  taskViewPeekCloseTimer = null;
  const el = document.getElementById('tv-peek');
  if (el) el.remove();
  taskViewPeek = false;
}

function _renderTaskViewPeek(anchorBtn) {
  _removeTaskViewPeek();
  const root = document.getElementById('desktop-root');
  if (!root || taskViewOpen) return;
  const rect = anchorBtn.getBoundingClientRect();
  const peek = document.createElement('div');
  peek.id = 'tv-peek';
  peek.className = 'tv-peek';
  // Position: horizontally centered on button, above taskbar
  const thumbW = 160, thumbH = 100, gap = 10;
  const totalW = taskViewDesktops.length * (thumbW + gap) - gap;
  let left = rect.left + rect.width / 2 - totalW / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - totalW - 8));
  peek.style.cssText = `left:${left}px;bottom:${window.innerHeight - rect.top + 8}px`;
  peek.innerHTML = taskViewDesktops.map(d => `
    <div class="tv-peek-desk ${d.id === taskViewActiveId ? 'active' : ''}" data-id="${d.id}">
      <div class="tv-peek-thumb">
        <div class="tv-peek-thumb-label">${d.name}</div>
      </div>
    </div>`).join('') +
    `<div class="tv-peek-desk tv-peek-new">
      <div class="tv-peek-thumb tv-peek-plus">+</div>
    </div>`;
  peek.addEventListener('mouseleave', () => { if (!taskViewOpen) cancelTaskViewPeek(); });
  peek.addEventListener('mouseenter', () => {
    clearTimeout(taskViewPeekTimer);
    clearTimeout(taskViewPeekCloseTimer);
  });
  root.appendChild(peek);
}

// ---- Full overlay (click on task-view button) ----
function toggleTaskView() {
  _tvInit();
  taskViewOpen = !taskViewOpen;
  taskViewPeek = false;
  _removeTaskViewPeek();
  if (taskViewOpen) {
    startOpen = false; searchOpen = false; taskAppMenu = null;
    _patchOverlays();
    _renderTaskViewOverlay();
  } else {
    _removeTaskViewOverlay();
  }
}

function _removeTaskViewOverlay() {
  const el = document.getElementById('tv-overlay');
  if (el) el.remove();
  taskViewOpen = false;
}

function _renderTaskViewOverlay() {
  _removeTaskViewOverlay();
  const root = document.getElementById('desktop-root');
  if (!root) return;

  const overlay = document.createElement('div');
  overlay.id = 'tv-overlay';
  overlay.className = 'tv-overlay';
  overlay.innerHTML = _buildTaskViewOverlayHTML();

  // Click outside desktop-strip → close
  overlay.addEventListener('mousedown', e => {
    if (e.target === overlay) { _removeTaskViewOverlay(); }
  });

  root.appendChild(overlay);
  // Focus the rename input if currently editing
}

// Thumbnails of currently-open app windows, shown ABOVE the desktop strip
// (same layout as native Windows 11 Task View: open windows on top,
// desktop switcher pinned to the bottom).
function _buildTaskViewWindowsHTML() {
  if (!windows.length) {
    return `<div class="tv-windows tv-windows-empty">
      <div class="tv-windows-empty-msg">Không có cửa sổ nào đang mở</div>
    </div>`;
  }
  const cards = windows.slice().sort((a, b) => b.z - a.z).map(w => {
    const app = getApp(w.key);
    return `
      <div class="tv-win-thumb ${w.key === focusedKey ? 'active' : ''} ${w.minimized ? 'minimized' : ''}"
           data-winkey="${w.key}"
           onclick="tvFocusWindow('${w.key}')" title="${app.title}">
        <div class="tv-win-titlebar">
          <span class="tv-win-icon">${icon(app.icon)}</span>
          <span class="tv-win-title">${app.title}</span>
          <button class="tv-win-close" onclick="event.stopPropagation(); tvCloseWindow('${w.key}')" title="Đóng cửa sổ">✕</button>
        </div>
        <div class="tv-win-body">
          <span class="tv-win-body-icon">${icon(app.icon)}</span>
        </div>
      </div>`;
  }).join('');
  return `<div class="tv-windows">${cards}</div>`;
}

function _buildTaskViewOverlayHTML() {
  const desksHTML = taskViewDesktops.map((d, idx) => `
    <div class="tv-desk-thumb ${d.id === taskViewActiveId ? 'active' : ''}"
         data-id="${d.id}"
         onclick="tvSwitchDesktop('${d.id}')">
      <div class="tv-desk-preview">
        <span class="tv-desk-preview-label">${d.name}</span>
      </div>
      <div class="tv-desk-label">
        <span class="tv-desk-name" ondblclick="tvStartRename('${d.id}', event)">${d.name}</span>
        ${taskViewDesktops.length > 1
          ? `<button class="tv-desk-close" onclick="tvRemoveDesktop('${d.id}', event)" title="Xóa desktop">✕</button>`
          : ''}
      </div>
    </div>`).join('');

  return `
    ${_buildTaskViewWindowsHTML()}
    <div class="tv-strip">
      <div class="tv-desks">
        ${desksHTML}
        <div class="tv-new-desk" onclick="tvAddDesktop()">
          <div class="tv-new-icon">+</div>
          <span>Desktop mới</span>
        </div>
      </div>
    </div>`;
}

// Click a window thumbnail → bring that window to front and leave Task View,
// same as clicking a window's live thumbnail in real Windows 11.
function tvFocusWindow(key) {
  bringToFront(key, true);
  renderTaskbar();
  _removeTaskViewOverlay();
}

// Close a window straight from its Task View thumbnail without leaving
// Task View — re-render just the windows row so the strip below stays put.
function tvCloseWindow(key) {
  closeWindow(key);
  const overlay = document.getElementById('tv-overlay');
  if (!overlay) return;
  const oldWindowsEl = overlay.querySelector('.tv-windows');
  if (oldWindowsEl) oldWindowsEl.outerHTML = _buildTaskViewWindowsHTML();
}

function tvSwitchDesktop(id) {
  taskViewActiveId = id;
  _removeTaskViewOverlay();
}

function tvAddDesktop() {
  const num = taskViewDesktops.length + 1;
  const id  = 'desk-' + Date.now();
  taskViewDesktops.push({ id, name: 'Desktop ' + num });
  taskViewActiveId = id;
  // Re-render the overlay in place
  const overlay = document.getElementById('tv-overlay');
  if (overlay) overlay.innerHTML = _buildTaskViewOverlayHTML();
  // Re-attach events
  overlay.addEventListener('mousedown', e => {
    if (e.target === overlay) _removeTaskViewOverlay();
  });
}

function tvRemoveDesktop(id, e) {
  e.stopPropagation();
  if (taskViewDesktops.length <= 1) return;
  const idx = taskViewDesktops.findIndex(d => d.id === id);
  taskViewDesktops = taskViewDesktops.filter(d => d.id !== id);
  if (taskViewActiveId === id) {
    taskViewActiveId = taskViewDesktops[Math.max(0, idx - 1)].id;
  }
  const overlay = document.getElementById('tv-overlay');
  if (overlay) overlay.innerHTML = _buildTaskViewOverlayHTML();
}

function tvStartRename(id, e) {
  e.stopPropagation();
  const desk = taskViewDesktops.find(d => d.id === id);
  if (!desk) return;
  const span = e.target;
  const parent = span.closest('.tv-desk-label');
  span.style.display = 'none';
  const input = document.createElement('input');
  input.className = 'tv-rename-input';
  input.value = desk.name;
  parent.insertBefore(input, span);
  input.focus(); input.select();
  function commit() {
    const val = input.value.trim();
    if (val) desk.name = val;
    input.remove();
    span.textContent = desk.name;
    span.style.display = '';
    // refresh peek/overlay labels too
    const overlay = document.getElementById('tv-overlay');
    if (overlay) overlay.innerHTML = _buildTaskViewOverlayHTML();
  }
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') commit();
    if (ev.key === 'Escape') { input.remove(); span.style.display = ''; }
  });
}

/* ---- Close task-view on Escape ---- */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && taskViewOpen) _removeTaskViewOverlay();
});

function render() {
  const root = document.getElementById('desktop-root');
  if (!root) return;

  root.innerHTML = `
    <section class="win-desktop login-push-enter" id="win-desktop">
      <div class="desktop-icons" id="desktop-icons">
        ${buildDesktopIcons()}
      </div>
      ${buildEmptyNote()}
      <div id="windows-zone">${buildWindows()}</div>
    </section>
    ${buildTaskbar()}
    ${buildStartMenu()}
    ${buildSearchPanel()}
    ${buildTaskAppMenu()}
  `;

  // Remove entry animation after first render
  const desktop = document.getElementById('win-desktop');
  if (desktop) {
    desktop.addEventListener('animationend', () => desktop.classList.remove('login-push-enter'), { once: true });
  }

  startClock();
  updateIconsCovered();
}

/* ---------- Event handlers (called from HTML) ---------- */
function handleTitlebarMouseDown(e, key) {
  const win = windows.find(w => w.key === key);
  if (win) startDrag(e, win);
}

function toggleStartMenu() {
  startOpen  = !startOpen;
  if (startOpen) { searchOpen = false; taskAppMenu = null; }
  _patchOverlays();
}

function toggleSearchPanel() {
  searchOpen = !searchOpen;
  if (searchOpen) { startOpen = false; taskAppMenu = null; }
  _patchOverlays();
}

function showTaskAppMenu(e, appKey) {
  e.preventDefault(); e.stopPropagation();
  taskAppMenu = { x: e.clientX, y: e.clientY, appKey };
  startOpen = false; searchOpen = false;
  _patchOverlays();
}

function handleLogout() {
  clearInterval(clockInterval);
  window.dispatchEvent(new CustomEvent('a3k64-logout'));
}

/* ---------- Global click-away ---------- */
document.addEventListener('click', e => {
  let changed = false;
  if (!e.target.closest('.start-menu') && !e.target.closest('.task-start') && startOpen) {
    startOpen = false; changed = true;
  }
  if (!e.target.closest('.search-panel') && !e.target.closest('.task-search') && !e.target.closest('.task-icon[title="Tìm kiếm"]') && searchOpen) {
    searchOpen = false; changed = true;
  }
  if (!e.target.closest('.task-app-menu') && taskAppMenu) {
    taskAppMenu = null; changed = true;
  }
  if (changed) _patchOverlays();
});

window.addEventListener('resize', updateIconsCovered);

/* ---------- Sync accent / theme from localStorage changes ---------- */
// QUAN TRỌNG: trước đây handler này gọi render() — hàm desktop-level làm
// root.innerHTML = ... rebuild TOÀN BỘ desktop, kể cả #windows-zone, tức
// là xoá và tạo lại <iframe src="../modules/scoreboard/scoreboard-window.html"> / iframe khác
// từ đầu mỗi lần sự kiện 'storage' nổ ra. Sự kiện này fire ở document cha
// (desktop.html) MỖI KHI bất kỳ document cùng-origin nào ghi localStorage
// — kể cả chính scoreboard-window.html (iframe con) tự ghi (đổi vị trí
// tổ, ghim nội quy...). Kết quả: mỗi thao tác trong Scoreboard làm cả app
// bị reload lại từ đầu, đúng hiện tượng "render lại toàn bộ / load dữ
// liệu lại từ đầu" — dù bản thân scoreboard.js không hề gọi render() thừa.
//
// Sửa: chỉ cập nhật accent/theme (CSS vars + class, không đụng DOM cây
// windows-zone) và patch riêng phần taskbar (renderTaskbar() chỉ thay
// node .taskbar, không đụng windows-zone/iframe) — không gọi render()
// full nữa. Đồng thời lọc theo key để bỏ qua các key không liên quan
// (GROUP_ORDER_KEY, PINNED_RULES_KEY... do app con tự ghi).
window.addEventListener('storage', (e) => {
  const RELEVANT_KEYS = ['login-accent','accent-color','accent','desktop-accent','a3k64-accent','a3k64-theme','login-theme','desktop-theme','theme-mode','taskbar-settings'];
  if (e.key && !RELEVANT_KEYS.includes(e.key)) return;

  accent = readAccent(); applyAccentVars();
  resolvedTheme = readTheme(); applyThemeClass();
  taskbarSettings = readTaskbarSettings();
  renderTaskbar(); // KHÔNG gọi render() — tránh phá huỷ/tạo lại windows-zone + iframe
});

/* ---------- Public init ---------- */
function initDesktop(desktopUser) {
  user = desktopUser;
  accent = readAccent();
  resolvedTheme = readTheme();
  taskbarSettings = readTaskbarSettings();
  pinnedApps = readPinned();

  const root = document.getElementById('desktop-root');
  root.className = `win-root theme-${resolvedTheme}`;
  applyAccentVars();

  render();
}

/* ============================================================
   SNAP LAYOUTS — Windows 11 style zone-click window snapping
   ============================================================ */

ICONS['layout-grid'] = `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`;

let snapOpen = false;

const SNAP_LAYOUTS = [
  { id: 'split-2',    label: '50 / 50',     previewCols: '1fr 1fr',     previewRows: '1fr',
    zones: [ { x:0,     y:0, w:50,    h:100 }, { x:50,    y:0, w:50,    h:100 } ] },
  { id: 'main-side',  label: '70 / 30',     previewCols: '7fr 3fr',     previewRows: '1fr',
    zones: [ { x:0,     y:0, w:70,    h:100 }, { x:70,    y:0, w:30,    h:100 } ] },
  { id: 'side-main',  label: '30 / 70',     previewCols: '3fr 7fr',     previewRows: '1fr',
    zones: [ { x:0,     y:0, w:30,    h:100 }, { x:30,    y:0, w:70,    h:100 } ] },
  { id: 'split-3',    label: '3 cột',       previewCols: '1fr 1fr 1fr', previewRows: '1fr',
    zones: [ { x:0,     y:0, w:33.34, h:100 }, { x:33.34, y:0, w:33.33, h:100 }, { x:66.67, y:0, w:33.33, h:100 } ] },
  { id: 'rows',       label: '2 hàng',      previewCols: '1fr',         previewRows: '1fr 1fr',
    zones: [ { x:0, y:0,  w:100, h:50 }, { x:0, y:50, w:100, h:50 } ] },
  { id: 'grid-4',     label: 'Lưới 2x2',   previewCols: '1fr 1fr',     previewRows: '1fr 1fr',
    zones: [ { x:0,  y:0,  w:50, h:50 }, { x:50, y:0,  w:50, h:50 },
             { x:0,  y:50, w:50, h:50 }, { x:50, y:50, w:50, h:50 } ] },
];

/* ---------- Snap Popover toggle (taskbar button — bottom-center anchor) ---------- */
function toggleSnapPopover() {
  snapOpen         = !snapOpen;
  snapAnchorEl     = null; // taskbar mode uses the default bottom-center CSS anchor
  snapTargetWinKey = focusedKey || null; // no specific window context → target the focused one
  startOpen  = false; searchOpen = false; taskAppMenu = null;
  if (snapOpen) _patchOverlays();
  renderSnapPopover();
}

/* ---------- Snap Popover anchored to a window's Maximize button ---------- */
let snapAnchorEl        = null;  // DOM element (.btn-maximize) the popover is pinned under
let snapTargetWinKey    = null;  // which window a zone-click will actually snap
let snapHoverTimer      = null;
let snapCloseTimer      = null;
let snapPopoverHovered  = false;

// Hover over Maximize (~200ms) opens the popover pinned under that button
function scheduleSnapOpen(winKey, btnEl) {
  clearTimeout(snapCloseTimer);
  clearTimeout(snapHoverTimer);
  snapHoverTimer = setTimeout(() => openSnapPopoverAt(winKey, btnEl), 200);
}

// Leaving Maximize (or the popover) closes it after a short grace delay,
// unless the cursor has moved onto the popover itself.
function scheduleSnapClose() {
  clearTimeout(snapHoverTimer);
  clearTimeout(snapCloseTimer);
  snapCloseTimer = setTimeout(() => {
    if (!snapPopoverHovered) closeSnapPopover();
  }, 150);
}

function openSnapPopoverAt(winKey, btnEl) {
  clearTimeout(snapHoverTimer);
  clearTimeout(snapCloseTimer);
  snapAnchorEl     = btnEl;
  snapTargetWinKey = winKey; // this popover instance snaps THIS window
  snapOpen         = true;
  startOpen = false; searchOpen = false; taskAppMenu = null;
  _patchOverlays();
  renderSnapPopover();
}

function closeSnapPopover() {
  if (!snapOpen) return;
  snapOpen = false;
  renderSnapPopover();
}

/* ---------- Real window snapping (Windows 11 zone-click behavior) ---------- */
// Clicking one zone of a preset snaps the target window straight into that
// region of the desktop — no whole-preset "apply" step.
function handleSnapZoneClick(layoutId, zoneIdx) {
  const layout = SNAP_LAYOUTS.find(l => l.id === layoutId);
  if (!layout) return;
  const zone   = layout.zones[zoneIdx];
  const winKey = snapTargetWinKey || focusedKey;
  if (!winKey) { showToast('Không có cửa sổ nào đang mở để ghép Snap.'); return; }

  applyWindowSnap(winKey, zone);
  closeSnapPopover();

  // Snap Assist: offer the other open windows to fill whatever zones are left
  const remainingIdxs = layout.zones.map((_, i) => i).filter(i => i !== zoneIdx);
  const others = windows.filter(w => w.key !== winKey && !w.minimized);
  if (remainingIdxs.length && others.length) {
    startSnapAssist(layoutId, remainingIdxs, [winKey]);
  }
}

// Resizes/repositions the actual window element to fill the given zone
// (percentages of the desktop working area, i.e. excluding the taskbar).
function applyWindowSnap(winKey, zone) {
  windows = windows.map(w => w.key === winKey
    ? { ...w, maximized: false, snapZone: { ...zone } }
    : w);
  bringToFront(winKey, true);
}

function restoreSnapTarget() {
  const key = snapTargetWinKey || focusedKey;
  if (key) {
    windows = windows.map(w => w.key === key ? { ...w, snapZone: null, maximized: false } : w);
    renderWindows();
    showToast('Đã bỏ Snap — cửa sổ trở về chế độ tự do.');
  }
  closeSnapPopover();
}

/* ---------- Snap Assist ---------- */
// After one window snaps into a zone, show the remaining empty zone(s) as
// pickable drop targets listing the other open windows, so the person can
// fill the rest of the layout with one more click — same as Windows 11.
// The layer only ever covers the exact leftover zone rectangle(s); it never
// blocks clicks anywhere else on the desktop/taskbar/other windows.
let snapAssist = null; // { layoutId, remainingZoneIdxs:[...], excludeKeys:Set }

function startSnapAssist(layoutId, remainingZoneIdxs, excludeKeys) {
  snapAssist = { layoutId, remainingZoneIdxs: [...remainingZoneIdxs], excludeKeys: new Set(excludeKeys) };
  renderSnapAssist();
}

function pickSnapAssistWindow(winKey, zoneIdx, btnEl) {
  if (!snapAssist) return;
  const layout = SNAP_LAYOUTS.find(l => l.id === snapAssist.layoutId);
  if (!layout) { dismissSnapAssist(); return; }

  // This window may be listed on more than one remaining zone panel —
  // disable every copy of its card immediately, then play the pick
  // animation (zoom + fade) on the one actually clicked before the real
  // window slides into place and the picker updates.
  document.querySelectorAll(`.snap-assist-thumb[data-winkey="${winKey}"]`).forEach(b => {
    b.style.pointerEvents = 'none';
  });
  if (btnEl) btnEl.classList.add('picked');

  setTimeout(() => {
    const el = document.getElementById(`win-${winKey}`);
    if (el) el.classList.remove('snap-assist-hiding');
    applyWindowSnap(winKey, layout.zones[zoneIdx]);

    if (!snapAssist) return; // dismissed mid-animation (e.g. Escape)
    snapAssist.excludeKeys.add(winKey);
    snapAssist.remainingZoneIdxs = snapAssist.remainingZoneIdxs.filter(i => i !== zoneIdx);
    if (!snapAssist.remainingZoneIdxs.length) {
      dismissSnapAssist();
    } else {
      renderSnapAssist();
    }
  }, 200);
}

function dismissSnapAssist() {
  // Any candidate window that was hidden for the picker but never actually
  // got chosen needs to reappear exactly where it already was.
  if (snapAssist) {
    windows.forEach(w => {
      if (!snapAssist.excludeKeys.has(w.key)) {
        const el = document.getElementById(`win-${w.key}`);
        if (el) el.classList.remove('snap-assist-hiding');
      }
    });
  }
  snapAssist = null;
  const el = document.getElementById('snap-assist-layer');
  if (el) el.remove();
  document.removeEventListener('mousedown', _snapAssistOutsideClick, true);
}

function renderSnapAssist() {
  const root = document.getElementById('desktop-root');
  if (!root) return;
  const existing = document.getElementById('snap-assist-layer');
  if (existing) existing.remove();
  if (!snapAssist) return;

  const layout = SNAP_LAYOUTS.find(l => l.id === snapAssist.layoutId);
  if (!layout) { snapAssist = null; return; }

  const others = windows.filter(w => !snapAssist.excludeKeys.has(w.key) && !w.minimized);
  if (!others.length) { dismissSnapAssist(); return; }

  // Hide every candidate window in place — it shouldn't float in the
  // middle of the screen while the picker is up. It reappears docked (if
  // picked) or exactly where it already was (if the picker gets dismissed
  // unused).
  others.forEach(w => {
    const el = document.getElementById(`win-${w.key}`);
    if (el) el.classList.add('snap-assist-hiding');
  });

  const zonesHTML = snapAssist.remainingZoneIdxs.map(idx => {
    const z = layout.zones[idx];
    const thumbs = others.map(w => {
      const app = getApp(w.key);
      return `<button class="snap-assist-thumb" data-winkey="${w.key}"
        onclick="event.stopPropagation(); pickSnapAssistWindow('${w.key}', ${idx}, this)" title="${app.title}">
        <span class="snap-assist-thumb-icon">${icon(app.icon)}</span>
        <span class="snap-assist-thumb-title">${app.title}</span>
      </button>`;
    }).join('');
    return `
      <div class="snap-assist-zone" style="
        left:${z.x}vw;
        top:calc((100vh - 58px) * ${z.y / 100});
        width:${z.w}vw;
        height:calc((100vh - 58px) * ${z.h / 100});
      ">
        <div class="snap-assist-title">Chọn cửa sổ để ghép vào vùng này</div>
        <div class="snap-assist-thumbs">${thumbs}</div>
      </div>`;
  }).join('');

  const div = document.createElement('div');
  div.id = 'snap-assist-layer';
  div.className = 'snap-assist-layer';
  div.innerHTML = zonesHTML;
  root.appendChild(div);

  // Dismiss on any click outside the zone panel(s) — the layer itself has
  // pointer-events:none (see CSS) so this only ever fires from a listener
  // on document, never by swallowing clicks meant for the desktop.
  document.addEventListener('mousedown', _snapAssistOutsideClick, true);
}

function _snapAssistOutsideClick(e) {
  if (!snapAssist) {
    document.removeEventListener('mousedown', _snapAssistOutsideClick, true);
    return;
  }
  if (!e.target.closest('.snap-assist-zone')) dismissSnapAssist();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && snapAssist) dismissSnapAssist();
});

/* ---------- Build Snap Popover HTML ---------- */
// Each preset is rendered as an independent clickable grid of zones — no
// single "apply layout" button. Hovering a zone highlights only that zone;
// clicking it snaps the target window (snapTargetWinKey / focusedKey)
// straight into that region of the desktop.
function buildSnapPresetIcon(layout) {
  const zonesHTML = layout.zones.map((z, i) => `
    <div class="snap-zone"
      title="${layout.label} · Vùng ${i + 1}"
      onclick="event.stopPropagation(); handleSnapZoneClick('${layout.id}', ${i})"
    ></div>`).join('');
  return `<div class="snap-preset-icon" style="grid-template-columns:${layout.previewCols};grid-template-rows:${layout.previewRows}">${zonesHTML}</div>`;
}

function buildSnapPopoverHTML() {
  return `
    <div class="snap-popover" id="snap-popover" onclick="event.stopPropagation()">
      <div class="snap-popover-header">
        <h3><span class="snap-header-icon">${icon('layout-grid')}</span>Snap Layouts</h3>
        <button class="snap-reset-btn" onclick="restoreSnapTarget()">↺ Bỏ Snap</button>
      </div>
      <div class="snap-presets">
        ${SNAP_LAYOUTS.map(l => `
          <div class="snap-preset">
            ${buildSnapPresetIcon(l)}
            <span>${l.label}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderSnapPopover() {
  const root = document.getElementById('desktop-root');
  if (!root) return;
  let el = root.querySelector('.snap-popover');
  if (snapOpen) {
    if (!el) {
      const div = document.createElement('div');
      div.innerHTML = buildSnapPopoverHTML();
      el = div.firstElementChild;
      if (snapAnchorEl) {
        el.classList.add('anchor-window');
        el.addEventListener('mouseenter', () => {
          snapPopoverHovered = true;
          clearTimeout(snapCloseTimer);
        });
        el.addEventListener('mouseleave', () => {
          snapPopoverHovered = false;
          scheduleSnapClose();
        });
      }
      root.appendChild(el);
    } else {
      el.classList.toggle('anchor-window', !!snapAnchorEl);
    }
    if (snapAnchorEl) positionSnapPopover(el, snapAnchorEl);
  } else {
    if (el) el.remove();
    snapAnchorEl = null;
  }
  // Update taskbar button active class (only relevant in taskbar-anchor mode)
  const btn = document.querySelector('.task-snap-layout');
  if (btn) btn.classList.toggle('active', snapOpen && !snapAnchorEl);
}

// Pins the popover directly under a given Maximize button (Windows 11 style),
// clamping to the viewport so it never runs off-screen, and points the
// pseudo-element arrow at the button's horizontal center.
function positionSnapPopover(el, anchorEl) {
  const rect   = anchorEl.getBoundingClientRect();
  const popW   = el.offsetWidth || 340;
  const margin = 8;

  let left = rect.left + rect.width / 2 - popW / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - popW - margin));

  el.style.position  = 'fixed';
  el.style.top        = (rect.bottom + 8) + 'px';
  el.style.left       = left + 'px';
  el.style.right      = 'auto';
  el.style.bottom     = 'auto';
  el.style.transform  = 'none';

  // Arrow follows the button center even after the popover gets clamped sideways
  const arrowLeft = rect.left + rect.width / 2 - left;
  el.style.setProperty('--snap-arrow-left', arrowLeft + 'px');
}

/* ---------- Click-away for the snap popover ---------- */
document.addEventListener('click', e => {
  if (snapOpen
    && !e.target.closest('.snap-popover')
    && !e.target.closest('.task-snap-layout')
    && !e.target.closest('.btn-maximize')) {
    snapOpen = false;
    renderSnapPopover();
  }
});
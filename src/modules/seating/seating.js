/* ============================================================
   A3K64 — Sơ đồ chỗ ngồi — Vanilla JS (port 1:1 từ React/TSX)
   Không cần React, không cần Babel, không cần bước build.
   ============================================================ */

/* ---------- Storage keys ---------- */
const SEAT_STORAGE_KEY     = 'a3k64-seating-map-v1';
const SEAT_DB_KEY          = 'a3k64-seating-sheet-local-db-v1';
const SEAT_CURRENT_KEY     = 'a3k64-seating-sheet-current-id-v1';
const SEAT_PUBLISH_PREFIX  = 'a3k64-seating-publish-lite-v1:';

/* ---------- Dữ liệu mặc định (54 học sinh 11A3) ---------- */
const SEAT_DEFAULT = {
  left: [
    ['', '', 'N Minh', 'Thành'],
    ['Tiến', 'Y Nhi', 'Đức', 'Nhân'],
    ['Trang', 'Bảo', 'Thiện', 'Sang'],
    ['K Ngân', 'Hiền Linh', 'Việt An', 'C Trường'],
    ['Tuấn', 'Sáng', 'Đức Anh', 'A Đạt'],
    ['H Nhi', 'T Tâm', 'Thắng', 'Hằng'],
    ['Hữu', 'Thục Anh', 'Lộc', 'Thuỷ'],
  ],
  right: [
    ['Tinh', 'Đức An', 'Hà Tâm', 'Trí'],
    ['Q Nhi', 'Tài', 'Như', 'N Hiếu'],
    ['Huy Đạt', 'Trung', 'H Giang', 'Thắm'],
    ['Đức Nam', 'K Linh', 'Duy', 'D Hiếu'],
    ['V Trường', 'Thành Đạt', 'Hà Linh', 'Hoàng Linh'],
    ['Đ Minh', 'Lê Mạnh', 'Đan', 'Quân'],
    ['Na', 'Mạnh', 'Thơ', 'Khánh'],
  ],
};

/* Danh sách học sinh duy nhất, sort theo tiếng Việt */
const SEAT_STUDENTS = Array.from(new Set(
  SEAT_DEFAULT.left.flat().concat(SEAT_DEFAULT.right.flat())
    .map(n => n.trim()).filter(Boolean)
)).sort((a, b) => a.localeCompare(b, 'vi'));

/* ---------- Pure helpers ---------- */
function seatNorm(v) {
  return String(v || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').trim();
}
function cloneState(s) {
  return { left: s.left.map(r => r.slice()), right: s.right.map(r => r.slice()) };
}
function normalizeRows(rows) {
  const norm = (Array.isArray(rows) ? rows : []).map(row => {
    const next = Array.isArray(row) ? row.slice(0, 4).map(x => String(x || '').trim()) : [];
    while (next.length < 4) next.push('');
    return next;
  });
  while (norm.length < 7) norm.push(['', '', '', '']);
  return norm.slice(0, 7);
}
function loadSeatState() {
  try {
    const raw = localStorage.getItem(SEAT_STORAGE_KEY);
    if (!raw) return cloneState(SEAT_DEFAULT);
    const p = JSON.parse(raw);
    return { left: normalizeRows(p.left), right: normalizeRows(p.right) };
  } catch { return cloneState(SEAT_DEFAULT); }
}
function saveSeatState(s) {
  localStorage.setItem(SEAT_STORAGE_KEY, JSON.stringify(s));
}
function findSeat(state, name) {
  const want = seatNorm(name);
  for (const side of ['left', 'right']) {
    for (let row = 0; row < state[side].length; row++) {
      for (let seat = 0; seat < state[side][row].length; seat++) {
        if (seatNorm(state[side][row][seat]) === want) return { side, row, seat };
      }
    }
  }
  return null;
}
function seatAt(state, pos) { return state[pos.side][pos.row]?.[pos.seat] || ''; }
function withSeatSet(state, pos, value) {
  const next = cloneState(state);
  next[pos.side][pos.row][pos.seat] = value;
  return next;
}
function withSeatMove(state, payload, target) {
  let next = cloneState(state);
  const targetName = seatAt(next, target);
  if (payload.type === 'seat') {
    if (payload.pos.side === target.side && payload.pos.row === target.row && payload.pos.seat === target.seat) return next;
    next = withSeatSet(next, payload.pos, targetName);
    next = withSeatSet(next, target, payload.name);
    return next;
  }
  // type === 'student'
  const current = findSeat(next, payload.name);
  if (current) next = withSeatSet(next, current, targetName);
  next = withSeatSet(next, target, payload.name);
  return next;
}
function seatAllAssigned(state) {
  return SEAT_STUDENTS.every(name => findSeat(state, name));
}

/* ---------- Multi-sheet local DB ---------- */
function readDb() {
  try {
    const db = JSON.parse(localStorage.getItem(SEAT_DB_KEY) || '{}');
    return Array.isArray(db.items) ? db.items : [];
  } catch { return []; }
}
function writeDb(items) { localStorage.setItem(SEAT_DB_KEY, JSON.stringify({ items })); }
function ensureDb(seats) {
  let items = readDb();
  if (items.length) return items;
  const now = new Date().toISOString();
  const item = { id: `seat_${Date.now()}`, title: 'Sơ đồ 1', active: true, createdAt: now, updatedAt: now, layout: { seats, exportedAt: now } };
  items = [item];
  writeDb(items);
  localStorage.setItem(SEAT_CURRENT_KEY, item.id);
  return items;
}
function currentSheetId(sheets) {
  return localStorage.getItem(SEAT_CURRENT_KEY) || sheets.find(i => i.active)?.id || sheets[0]?.id || '';
}
function saveSheet(sheets, id, title, seats) {
  const items = sheets.length ? sheets.slice() : ensureDb(seats);
  const now = new Date().toISOString();
  let item = id ? items.find(i => i.id === id) : undefined;
  if (item) {
    item.title = title; item.layout = { seats, exportedAt: now }; item.updatedAt = now;
  } else {
    item = { id: `seat_${Date.now()}`, title, active: true, createdAt: now, updatedAt: now, layout: { seats, exportedAt: now } };
    items.push(item);
  }
  items.forEach(i => i.active = i.id === item.id);
  writeDb(items);
  localStorage.setItem(SEAT_CURRENT_KEY, item.id);
  return { items, item };
}
function publishKey(id) { return `${SEAT_PUBLISH_PREFIX}${id}`; }
function readPublish(id) {
  try { return JSON.parse(localStorage.getItem(publishKey(id)) || 'null') || { status: 'private' }; }
  catch { return { status: 'private' }; }
}
function writePublish(id, config) { localStorage.setItem(publishKey(id), JSON.stringify(config)); }

/* ============================================================
   GAS API — sơ đồ chỗ ngồi thật sự lưu lên Google Sheets tại đây.
   Trước đây file này CHỈ đọc/ghi localStorage nên "sửa" trông như
   thành công nhưng không hề lên Sheet — người khác mở lại/đồng bộ
   lại thì mất. dataSource='gas' khi có gasUrl và load lần đầu OK,
   ngược lại rơi về 'local' (localStorage) như hành vi cũ.
   ============================================================ */
let gasUrl     = null;
let dataSource = 'local'; // 'local' | 'gas'
let userRole   = null;    // role của người đang đăng nhập (từ desktop session)

// Chỉ GVCN và lớp trưởng được sửa sơ đồ / xem sơ đồ khi đang riêng tư.
// Khớp với quyền phía backend (A3SeatFinal_canEditRole_ trong api.gs) —
// đổi ở đây thì nhớ đổi cả bên đó.
const SEAT_EDIT_ROLES = ['gvcn', 'loptruong'];
function seatRoleNorm(v) {
  return String(v || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '');
}
function canEditSeating() { return SEAT_EDIT_ROLES.includes(seatRoleNorm(userRole)); }

// Polling: chỉ áp dụng cho người KHÔNG phải gvcn/lop_truong — họ luôn xem/sửa
// được nên không cần tự mở/tự khoá. Với người xem thường: cứ 10 giây kiểm
// tra lại trạng thái công bố — nếu đang bị chặn mà giờ đã công bố thì tự mở
// ra; nếu đang xem bình thường mà bị chuyển về riêng tư (GVCN khoá lại) thì
// khoá ngay, không cần đợi người dùng thao tác hay tải lại trang.
const SEAT_ACCESS_POLL_SECONDS = 10;
let seatAccessCountdown = SEAT_ACCESS_POLL_SECONDS;
let seatAccessPollTimer = null;

async function fetchFromGas(params = {}) {
  if (!gasUrl) return null;
  try {
    const url = new URL(gasUrl);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    url.searchParams.set('t', String(Date.now()));
    const res = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
    return await res.json();
  } catch { return null; }
}
async function postToGas(action, payload = {}) {
  if (!gasUrl) return null;
  try {
    const body = JSON.stringify({ action, ...payload });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    let res;
    try { res = await fetch(gasUrl, { method: 'POST', body, signal: controller.signal }); }
    finally { clearTimeout(timeoutId); }
    return await res.json();
  } catch { return null; }
}
function gasData(json) { return json?.data || json || {}; }

async function gasListCharts() {
  const data = gasData(await fetchFromGas({ action: 'listSeatingCharts', role: userRole || '' }));
  return Array.isArray(data.charts) ? data.charts : [];
}
// Trả cả cờ restricted + status: khi sơ đồ đang riêng tư và người xem không
// đủ quyền, backend từ chối trả layout thật (chặn ngay ở API, không chỉ ẩn
// UI) — chart sẽ là null nhưng restricted=true để boot()/applySheet() biết
// lý do và không hiểu lầm là lỗi mạng.
async function gasGetChart(id) {
  const json = await fetchFromGas({ action: 'getSeatingChart', id: id || '', role: userRole || '' });
  const data = gasData(json);
  return { chart: data.chart || null, restricted: !!(json?.restricted || data.restricted), status: json?.status || data.status || '' };
}
async function gasSaveChart(id, title, seats) {
  const json = await postToGas('saveSeatingChart', {
    id: id || '', title, layout: { seats }, makeActive: true,
    role: userRole || '', actor: { name: userName, role: userRole },
  });
  const data = gasData(json);
  return { chart: data.chart || null, error: json?.ok === false ? (json.error || '') : (data.error || '') };
}
async function gasGetAccess(chartId, chartTitle) {
  const data = gasData(await fetchFromGas({ action: 'getSeatingAccess', chartId: chartId || '', chartTitle: chartTitle || '', role: userRole || '' }));
  return data.access || { status: 'private' };
}
async function gasSaveAccess(chartId, chartTitle, status) {
  const json = await postToGas('saveSeatingAccess', {
    chartId: chartId || '', chartTitle: chartTitle || '', status,
    role: userRole || '', actor: { name: userName, role: userRole },
  });
  const data = gasData(json);
  return { access: data.access || null, error: json?.error || data.error || null };
}

/* ---------- App state ---------- */
let seatState      = loadSeatState();
let sheets         = ensureDb(seatState);       // fallback cục bộ, ghi đè bằng dữ liệu GAS trong boot() nếu có
let currentId      = currentSheetId(sheets);
let publishConfig  = readPublish(currentId);
let query          = '';
let editMode       = false;
let selectOpen     = false;
let modal          = null;   // null | 'create' | 'publish' | 'manage'
let modalOpening   = false;  // true trong lượt render() đầu tiên sau openModal() — kích hoạt fade-in
let notifications  = [];   // { id, message, time } — thay cho toast nổi giữa màn hình
let dragPayload    = null;   // { type, name, pos? }

/* User from desktop session */
const ACCENT_COLORS = { blue:'#2563eb', violet:'#7c3aed', pink:'#db2777', green:'#059669', amber:'#d97706', red:'#dc2626' };
function readAccent() {
  for (const k of ['login-accent','accent-color','accent','desktop-accent','a3k64-accent']) {
    const raw = (localStorage.getItem(k) || '').trim();
    if (!raw) continue;
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return raw;
    if (ACCENT_COLORS[raw.toLowerCase()]) return ACCENT_COLORS[raw.toLowerCase()];
  }
  return '#2563eb';
}
function readDesktopUser() {
  try { return JSON.parse(sessionStorage.getItem('a3k64-user') || 'null'); } catch { return null; }
}
const desktopUser = readDesktopUser();
const userName    = desktopUser?.displayName || null;
document.documentElement.style.setProperty('--desktop-accent', readAccent());


/* ---------- Thông báo (sidebar) ---------- */
// Trước đây là toast nổi giữa màn hình (che mất thanh công cụ) — giờ dồn
// thẳng vào box "Thông báo" ở sidebar trái, xếp chồng nhiều thông báo,
// không che UI. Patch trực tiếp box này (không render() lại toàn bộ) để
// không làm mất focus ô tìm kiếm / đóng dropdown đang mở giữa chừng.
function showToast(msg) {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  notifications = [{ id: `n_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, message: msg, time }, ...notifications].slice(0, 8);
  const box = document.getElementById('seat-notif-box');
  if (box) { box.outerHTML = renderNotifBox(); bindNotifEvents(); }
}

function renderNotifBox() {
  const hasNotifs = notifications.length > 0;
  return `
        <div class="seat-notif${hasNotifs ? '' : ' collapsed'}" id="seat-notif-box">
          <div class="seat-notif-head">
            <strong>Thông báo${hasNotifs ? ` (${notifications.length})` : ''}</strong>
            ${hasNotifs ? `<button id="btn-notif-clear" title="Xoá tất cả thông báo">×</button>` : ''}
          </div>
          ${hasNotifs ? `<div class="seat-notif-list">
            ${notifications.map(n => `
              <div class="seat-notif-item">
                <span>${escH(n.message)}</span><small>${n.time}</small>
              </div>`).join('')}
          </div>` : ''}
        </div>`;
}

function bindNotifEvents() {
  on('btn-notif-clear', () => { notifications = []; const box = document.getElementById('seat-notif-box'); if (box) box.outerHTML = renderNotifBox(); });
}

/* ============================================================
   RENDER — one big re-render, patching only what changed
   ============================================================ */
function render() {
  const root = document.getElementById('seating-root');
  if (!root) return;

  const editable = canEditSeating();
  const status = publishConfig.status || 'private';

  // Riêng tư + không đủ quyền (không phải GVCN/lớp trưởng) → cấm xem luôn,
  // không hiện sơ đồ, danh sách học sinh, hay bất kỳ điều khiển nào.
  if (!editable && status !== 'published') {
    if (modal) modal = null;
    root.innerHTML = renderSeatBlocked(status);
    return;
  }
  // Người xem thường (không sửa được) không có lý do gì để mở modal quản lý.
  if (!editable && modal) modal = null;

  const currentTitle = sheets.find(i => i.id === currentId)?.title || 'Sơ đồ 1';
  const q = seatNorm(query);
  const unassignedStudents = SEAT_STUDENTS.filter(name => !findSeat(seatState, name));
  const filteredStudents = unassignedStudents.filter(name => !q || seatNorm(name).includes(q));

  root.innerHTML = `
<div class="seat-app">
  <!-- ── Toolbar ── -->
  <div class="seat-toolbar">
    <div class="seat-heading">
      <div>
        <h1>SƠ ĐỒ CHỖ NGỒI LỚP 11A3</h1>
        <p>${editable ? 'Bật sửa rồi kéo tên từ danh sách bên trái vào ghế' : 'Đang xem ở chế độ chỉ đọc.'}</p>
      </div>
    </div>
    <div class="seat-tools">
      <!-- (a) Cụm chọn sơ đồ & quản lý -->
      <div class="seat-group seat-group-left">
        <div class="seat-select${selectOpen ? ' open' : ''}" id="sheet-select">
          <button class="seat-select-trigger" id="btn-sheet-trigger">
            ${seatIcon('layoutGrid', 18)}
            <span>${escH(currentTitle)}</span>
            ${seatIcon('chevronDown', 18)}
          </button>
          <div class="seat-select-menu">
            ${sheets.map(item => `
              <button class="seat-select-option${item.id === currentId ? ' active' : ''}" data-sheet-id="${escH(item.id)}">${escH(item.title || 'Sơ đồ')}</button>
            `).join('')}
          </div>
        </div>
        ${editable ? `<button id="btn-manage" class="seat-icon-btn" title="Quản lý sơ đồ">${seatIcon('settings', 18)}</button>` : ''}
      </div>

      <!-- (b) Cụm công cụ thao tác -->
      <div class="seat-group seat-group-mid">
        <div class="seat-search-wrap">
          ${seatIcon('search', 18)}
          <input id="seat-search" value="${escH(query)}" placeholder="Tìm học sinh..." />
        </div>
        ${editable ? `<button id="btn-edit" class="seat-btn-edit${editMode ? ' active' : ''}">
          ${editMode ? seatIcon('unlock', 18) + ' Đang sửa' : seatIcon('pencil', 18) + ' Bật sửa'}
        </button>` : ''}
      </div>

      <!-- (c) Cụm tiện ích phụ — icon-only, có tooltip qua title -->
      <div class="seat-group seat-icon-group">
        ${editable ? `<button id="btn-random" class="seat-icon-btn" title="Sắp xếp ngẫu nhiên"${editMode ? '' : ' disabled'}>${seatIcon('shuffle', 18)}</button>` : ''}
        ${editable ? `<button id="btn-reset" class="seat-icon-btn" title="Khôi phục vị trí ban đầu"${editMode ? '' : ' disabled'}>${seatIcon('rotateCcw', 18)}</button>` : ''}
        <button id="btn-print" class="seat-icon-btn" title="Xuất file hoặc in A4">${seatIcon('printer', 18)}</button>
      </div>

      <!-- (d) Cụm hành động chính -->
      <div class="seat-group seat-group-actions">
        ${editable ? `<button id="btn-create" class="seat-btn-ghost">${seatIcon('plus', 18)} Tạo mới</button>` : ''}
        ${editable ? `<button id="btn-publish" class="seat-btn-badge${publishConfig.status === 'published' ? ' is-on' : ''}">${seatIcon('globe', 18)} Công bố${publishConfig.status === 'published' ? ' ✓' : ''}</button>` : ''}
        ${editable ? `<button id="btn-save" class="seat-btn-save">${seatIcon('save', 18)} Lưu sơ đồ</button>` : ''}
      </div>
    </div>
  </div>

  <!-- ── Main ── -->
  <div class="seat-main">
    <!-- Sidebar -->
    <div class="seat-side-col">
      ${renderNotifBox()}
      <aside class="seat-students">
        <div class="seat-students-head">
          <div>
            <strong>Danh sách học sinh</strong>
            <span>Kéo tên vào ô ghế để đổi chỗ nhanh</span>
          </div>
          <span class="seat-badge">${unassignedStudents.length}</span>
        </div>
        <div class="seat-student-list">
          ${filteredStudents.length === 0
            ? (unassignedStudents.length === 0
                ? `<div class="seat-students-note">Tất cả học sinh đã có chỗ ngồi.</div>`
                : `<div class="seat-notif-empty">Không tìm thấy học sinh.</div>`)
            : filteredStudents.map(name => {
                const hit = Boolean(q && seatNorm(name).includes(q));
                return `<div class="seat-student-card${hit ? ' highlight' : ''}" draggable="${editable && editMode}" data-student="${escH(name)}">
                  <span>${escH(name)}</span><small>Chưa xếp</small>
                </div>`;
              }).join('')
          }
        </div>
      </aside>
    </div>

    <!-- Board -->
    <div class="seat-board">
      <div class="seat-room-window left a"></div>
      <div class="seat-room-window left b"></div>
      <div class="seat-room-window right a"></div>
      <div class="seat-room-window right b"></div>
      <div class="seat-room-door"></div>
      <div class="seat-back-label">CUỐI LỚP</div>
      <div class="seat-layout">
        ${renderSide('left', q)}
        <div class="seat-aisle">LỐI ĐI</div>
        ${renderSide('right', q)}
      </div>
      <div class="seat-front">
        <span class="teacher">BÀN GV</span>
        <span>BẢNG</span>
        <span class="door">CỬA RA VÀO</span>
      </div>
      <div class="seat-approve">GVCN: Võ Thị Ngọc Tân – Đã Duyệt</div>

      <!-- Modal chỉ che khu vực sơ đồ — sidebar (Thông báo/Danh sách học
           sinh) nằm ngoài .seat-board nên vẫn hiện rõ, vẫn thao tác được. -->
      ${renderModal(currentTitle, publishConfig)}
    </div>
  </div>
</div>
`;

  bindEvents();
}

function escH(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ---------- Icon set (SVG inline, quy chuẩn kiểu Lucide) ---------- */
const SEAT_ICON_PATHS = {
  layoutGrid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  unlock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  shuffle: '<path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/>',
  rotateCcw: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
};
function seatIcon(name, size = 18) {
  const body = SEAT_ICON_PATHS[name] || '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

// Man hinh chan xem - hien cho nguoi khong phai GVCN/lop truong khi so do
// dang o trang thai rieng tu (chua cong bo).
function renderSeatBlocked(status) {
  return `<div class="seat-app">
    <div class="seat-blocked">
      <div class="seat-blocked-card">
        <div class="seat-blocked-icon">🔒</div>
        <h2>Sơ đồ lớp chưa được công bố</h2>
        <p>Sơ đồ chỗ ngồi đang ở chế độ riêng tư. Chỉ GVCN và lớp trưởng mới xem/sửa được lúc này - vui lòng quay lại sau khi sơ đồ được công bố.</p>
        <p class="seat-blocked-countdown">Tự động kiểm tra lại sau <b id="seat-blocked-countdown-num">${seatAccessCountdown}</b>s…</p>
      </div>
    </div>
  </div>`;
}


function renderSide(side, q) {
  return `<div class="seat-side" data-side="${side}">
    ${seatState[side].map((row, rowIdx) => `
      <div class="seat-row">
        ${row.map((name, seatIdx) => {
          const hit = Boolean(q && name && seatNorm(name).includes(q));
          const isSelf = Boolean(userName && name && seatNorm(name) === seatNorm(userName));
          const cls = [
            'seat-cell',
            name ? '' : 'empty',
            hit ? 'highlight' : '',
            isSelf ? 'self-seat' : '',
          ].filter(Boolean).join(' ');
          return `<div class="${cls}"
            draggable="${canEditSeating() && editMode}"
            data-side="${side}" data-row="${rowIdx}" data-seat="${seatIdx}">
            ${isSelf ? '<span class="seat-you-badge">Bạn</span>' : ''}
            ${escH(name || 'Trống')}
          </div>`;
        }).join('')}
      </div>`).join('')}
  </div>`;
}

function renderModal(currentTitle, publishConfig) {
  if (!modal) return '';
  const isPublished = publishConfig.status === 'published';

  if (modal === 'create') {
    const suggested = `Sơ đồ ${sheets.length + 1}`;
    return `<div class="seat-modal-backdrop" id="modal-backdrop">
      <div class="seat-modal">
        <div>
          <h3>Tạo sơ đồ mới</h3>
          <p>Sơ đồ mới sẽ mặc định ở chế độ Riêng tư cho đến khi bạn công bố.</p>
        </div>
        <label>Tên sơ đồ mới
          <input id="modal-title-input" value="${escH(suggested)}" maxlength="60" />
        </label>
        <div class="seat-modal-actions">
          <button id="modal-cancel">Huỷ</button>
          <button class="primary" id="modal-confirm">Tạo sơ đồ</button>
        </div>
      </div>
    </div>`;
  }

  if (modal === 'publish') {
    return `<div class="seat-modal-backdrop" id="modal-backdrop">
      <div class="seat-modal">
        <div>
          <h3>Cài đặt công bố sơ đồ</h3>
          <p>${escH(currentTitle)}</p>
        </div>
        <label>Trạng thái
          <select id="modal-publish-select">
            <option value="private"${!isPublished ? ' selected' : ''}>Riêng tư</option>
            <option value="published"${isPublished ? ' selected' : ''}>Công bố cho học sinh xem</option>
          </select>
        </label>
        <div class="seat-modal-actions">
          <button id="modal-cancel">Huỷ</button>
          <button class="primary" id="modal-confirm">Lưu cài đặt</button>
        </div>
      </div>
    </div>`;
  }

  if (modal === 'manage') {
    return `<div class="seat-modal-backdrop" id="modal-backdrop">
      <div class="seat-modal">
        <div>
          <h3>Quản lý công bố</h3>
          <p>${escH(currentTitle)}</p>
        </div>
        <div class="seat-status-row">
          <div>
            <strong>Trạng thái hiện tại</strong>
            <span>${isPublished ? 'Học sinh có thể xem sơ đồ này' : 'Chỉ GVCN/cán bộ lớp xem được'}</span>
          </div>
          <span class="seat-status-pill ${isPublished ? 'published' : 'private'}">${isPublished ? 'Đã công bố' : 'Riêng tư'}</span>
        </div>
        <div class="seat-modal-manage-actions">
          <button class="seat-mini-btn" id="modal-edit-settings">Sửa cài đặt</button>
          <button class="seat-mini-btn primary" id="modal-toggle">${isPublished ? 'Đưa về riêng tư' : 'Công bố ngay'}</button>
        </div>
        <div class="seat-modal-actions">
          <button id="modal-cancel">Đóng</button>
        </div>
      </div>
    </div>`;
  }

  return '';
}

/* ---------- Bind events after each render ---------- */
function bindEvents() {
  /* toolbar */
  on('btn-publish',  () => openModal('publish'));
  on('btn-manage',   () => openModal('manage'));
  on('btn-save',     handleSaveSheet);
  on('btn-create',   () => openModal('create'));
  on('btn-edit',     () => { editMode = !editMode; render(); });
  on('btn-reset',    handleReset);
  on('btn-random',   handleRandom);
  on('btn-print',    () => window.print());
  bindNotifEvents();

  /* search */
  const searchEl = document.getElementById('seat-search');
  if (searchEl) searchEl.addEventListener('input', e => { query = e.target.value; render(); });

  /* sheet dropdown */
  on('btn-sheet-trigger', e => { e.stopPropagation(); selectOpen = !selectOpen; render(); });
  document.querySelectorAll('[data-sheet-id]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      selectOpen = false;
      const id = btn.dataset.sheetId;
      const item = sheets.find(i => i.id === id);
      if (item) applySheet(item);
    });
  });

  /* close dropdown on outside click */
  document.addEventListener('click', closeSelect, { once: true });

  /* drag-and-drop — student cards */
  document.querySelectorAll('[data-student]').forEach(card => {
    card.addEventListener('dragstart', () => {
      dragPayload = { type: 'student', name: card.dataset.student };
    });
  });

  /* drag-and-drop — seat cells */
  document.querySelectorAll('[data-side][data-row]').forEach(cell => {
    const pos = { side: cell.dataset.side, row: +cell.dataset.row, seat: +cell.dataset.seat };
    cell.addEventListener('dragstart', () => {
      dragPayload = { type: 'seat', pos, name: seatAt(seatState, pos) };
    });
    cell.addEventListener('dragover', e => { e.preventDefault(); cell.classList.add('drag-over'); });
    cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
    cell.addEventListener('drop', e => {
      e.preventDefault();
      cell.classList.remove('drag-over');
      handleDrop(pos);
    });
  });

  /* modals */
  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
    // Mới mở (openModal vừa gọi render()) → đợi 2 khung hình để trình duyệt
    // "chốt" trạng thái opacity:0 ban đầu rồi mới thêm is-open, để transition
    // opacity thật sự chạy (fade mượt) thay vì nhảy thẳng luôn opacity:1.
    // Re-render trong lúc modal đang mở sẵn (vd đổi trạng thái công bố) →
    // giữ nguyên trạng thái đang mở, không phát lại hiệu ứng fade.
    if (modalOpening) {
      modalOpening = false;
      requestAnimationFrame(() => requestAnimationFrame(() => backdrop.classList.add('is-open')));
    } else {
      backdrop.classList.add('is-open');
    }
  }

  on('modal-cancel', closeModal);

  if (modal === 'create') {
    const inp = document.getElementById('modal-title-input');
    if (inp) { inp.focus(); inp.select(); }
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') doCreateSheet(); });
    on('modal-confirm', doCreateSheet);
  }

  if (modal === 'publish') {
    on('modal-confirm', async () => {
      const sel = document.getElementById('modal-publish-select');
      if (!sel) return;
      await setPublishStatus(sel.value);
      closeModal();
    });
  }

  if (modal === 'manage') {
    on('modal-edit-settings', () => openModal('publish'));
    on('modal-toggle', async () => {
      const next = publishConfig.status === 'published' ? 'private' : 'published';
      await setPublishStatus(next);
      closeModal();
    });
  }
}

async function setPublishStatus(status) {
  if (!canEditSeating()) { showToast('Bạn không có quyền công bố sơ đồ.'); return; }
  const title = sheets.find(i => i.id === currentId)?.title || 'Sơ đồ 1';

  if (dataSource === 'gas') {
    // "Công bố" thao tác trên 1 dòng THẬT trong sheet SEATING CHART. Nếu sơ
    // đồ hiện tại chưa từng được "Lưu sơ đồ" (currentId rỗng / chưa khớp
    // dòng nào), backend saveSeatingAccess sẽ báo lỗi "Chưa tìm thấy sơ đồ
    // thật..." và trước đây lỗi này bị nuốt mất, người dùng chỉ thấy im
    // lặng không có gì xảy ra. Ở đây tự lưu layout hiện tại trước để đảm
    // bảo luôn có dòng thật trước khi đổi trạng thái công bố.
    showToast('Đang cập nhật trạng thái công bố...');
    const { chart, error: saveErr } = await gasSaveChart(currentId, title, seatState);
    if (!chart) {
      showToast(saveErr || 'Không lưu được sơ đồ lên Google Sheets — kiểm tra kết nối rồi thử lại.');
      return;
    }
    currentId = chart.id;
    saveSeatState(seatState);
    localStorage.setItem(SEAT_CURRENT_KEY, chart.id);
    sheets = await gasListCharts();

    const { access, error } = await gasSaveAccess(currentId, title, status);
    if (!access) {
      showToast(error || 'Không lưu được trạng thái công bố — kiểm tra kết nối rồi thử lại.');
      return;
    }
    publishConfig = access;
  } else {
    writePublish(currentId, { status });
    publishConfig = { status };
  }
  render();
  showToast(status === 'published' ? 'Đã công bố sơ đồ.' : 'Đã chuyển về riêng tư.');
}

function on(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}
function openModal(kind) { modal = kind; modalOpening = true; render(); }
function closeModal() {
  const backdrop = document.getElementById('modal-backdrop');
  if (!backdrop) { modal = null; render(); return; }
  // Gỡ is-open trước để backdrop fade mờ dần (transition opacity .3s ease đã
  // khai báo ở CSS), CHỈ THỰC SỰ gỡ khỏi DOM (modal=null + render()) sau khi
  // hiệu ứng chạy xong — không cắt ngang giữa chừng.
  backdrop.classList.remove('is-open');
  setTimeout(() => { modal = null; render(); }, 300);
}
function closeSelect() { if (selectOpen) { selectOpen = false; render(); } }

/* ---------- Handlers ---------- */
function commitSeatState(next) { seatState = next; saveSeatState(next); render(); }

async function applySheet(item) {
  if (!item) return;
  selectOpen = false;
  let layoutSeats = item.layout?.seats || null;

  if (dataSource === 'gas' && !layoutSeats) {
    showToast('Đang mở sơ đồ...');
    const res = await gasGetChart(item.id);
    if (res.restricted) {
      // Sơ đồ này đang riêng tư và mình không đủ quyền — không có gì để
      // hiển thị, cứ để publishConfig phản ánh đúng trạng thái rồi render()
      // sẽ tự chuyển sang màn hình chặn.
      currentId = item.id;
      publishConfig = { status: res.status || 'private' };
      render();
      showToast('Sơ đồ này đang ở chế độ riêng tư.');
      return;
    }
    layoutSeats = res.chart?.layout?.seats || null;
  }
  if (!layoutSeats) { showToast('Không đọc được sơ đồ này.'); return; }

  seatState = { left: normalizeRows(layoutSeats.left), right: normalizeRows(layoutSeats.right) };
  saveSeatState(seatState); // vẫn giữ 1 bản cục bộ để mở nhanh / phòng khi mất mạng
  currentId = item.id;
  localStorage.setItem(SEAT_CURRENT_KEY, item.id);

  if (dataSource === 'gas') {
    publishConfig = await gasGetAccess(currentId, item.title);
  } else {
    publishConfig = readPublish(currentId);
  }
  render();
  showToast(`Đã mở "${item.title || 'sơ đồ'}".`);
}

async function handleSaveSheet() {
  if (!canEditSeating()) { showToast('Bạn không có quyền sửa sơ đồ.'); return; }
  const title = sheets.find(i => i.id === currentId)?.title || 'Sơ đồ hiện tại';

  if (dataSource === 'gas') {
    showToast('Đang lưu lên Google Sheets...');
    const { chart, error: saveErr } = await gasSaveChart(currentId, title, seatState);
    if (!chart) { showToast(saveErr || 'Lưu thất bại — kiểm tra kết nối rồi thử lại.'); return; }
    currentId = chart.id;
    saveSeatState(seatState);
    localStorage.setItem(SEAT_CURRENT_KEY, chart.id);
    sheets = await gasListCharts();
    render();
    showToast('Đã lưu sơ đồ lên Google Sheets.');
    return;
  }

  const { items, item } = saveSheet(sheets, currentId, title, seatState);
  sheets = items; currentId = item.id;
  render();
  showToast('Đã lưu sơ đồ (cục bộ — chưa kết nối Google Sheets).');
}

async function doCreateSheet() {
  if (!canEditSeating()) { showToast('Bạn không có quyền tạo sơ đồ mới.'); modal = null; render(); return; }
  const inp = document.getElementById('modal-title-input');
  const title = (inp?.value || '').trim();
  if (!title) { inp?.focus(); return; }
  modal = null;

  if (dataSource === 'gas') {
    showToast('Đang tạo sơ đồ mới...');
    const { chart, error: saveErr } = await gasSaveChart('', title, seatState);
    if (!chart) { showToast(saveErr || 'Tạo sơ đồ thất bại — kiểm tra kết nối rồi thử lại.'); return; }
    sheets = await gasListCharts();
    await applySheet(chart);
    showToast('Đã tạo sơ đồ mới.');
    return;
  }

  const { items, item } = saveSheet(sheets, null, title, seatState);
  writePublish(item.id, { status: 'private' });
  sheets = items;
  await applySheet(item);
  showToast('Đã tạo sơ đồ mới.');
}

function handleReset() {
  if (!canEditSeating()) return;
  if (!editMode) { showToast('Bấm "Bật sửa" trước khi khôi phục sơ đồ.'); return; }
  if (!window.confirm('Khôi phục sơ đồ mặc định?')) return;
  commitSeatState(cloneState(SEAT_DEFAULT));
}

function handleRandom() {
  if (!canEditSeating()) return;
  if (!editMode) { showToast('Bấm "Bật sửa" trước khi random chỗ ngồi.'); return; }
  const positions = [], names = [];
  for (const side of ['left', 'right']) {
    seatState[side].forEach((row, rowIdx) =>
      row.forEach((name, seatIdx) => {
        if (!name) return;
        positions.push({ side, row: rowIdx, seat: seatIdx });
        names.push(name);
      })
    );
  }
  if (names.length < 2) { showToast('Không đủ học sinh để random.'); return; }
  const shuffled = names.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  let next = cloneState(seatState);
  positions.forEach((pos, i) => { next = withSeatSet(next, pos, shuffled[i]); });
  commitSeatState(next);
  showToast('Đã random chỗ ngồi cục bộ. Bấm Lưu sơ đồ để lưu lại.');
}

function handleDrop(target) {
  if (!canEditSeating() || !dragPayload || !dragPayload.name) return;
  commitSeatState(withSeatMove(seatState, dragPayload, target));
  dragPayload = null;
}

function updateSeatCountdownText() {
  const el = document.getElementById('seat-blocked-countdown-num');
  if (el) el.textContent = String(seatAccessCountdown);
}

function startAccessPolling() {
  // GVCN/lớp trưởng luôn xem/sửa được — không cần tự mở/tự khoá theo trạng
  // thái công bố. Không có gasUrl thì cũng không có gì để hỏi lại.
  if (!gasUrl || canEditSeating() || seatAccessPollTimer) return;
  seatAccessPollTimer = setInterval(() => {
    seatAccessCountdown -= 1;
    if (seatAccessCountdown > 0) { updateSeatCountdownText(); return; }
    seatAccessCountdown = SEAT_ACCESS_POLL_SECONDS;
    checkAccessNow();
  }, 1000);
}

// Hỏi lại trạng thái công bố mỗi 10 giây (đồng hồ đếm ngược ở trên).
// - Đang bị chặn (riêng tư) mà giờ đã công bố → tự tải sơ đồ thật rồi mở ra.
// - Đang xem bình thường (đã công bố) mà bị chuyển về riêng tư → khoá ngay.
// - Vẫn đang bị chặn như cũ → chỉ cập nhật lại số đếm ngược, không render
//   lại toàn bộ cho đỡ giật.
async function checkAccessNow() {
  if (!gasUrl || canEditSeating()) return;
  const wasBlocked = publishConfig.status !== 'published';
  const title = sheets.find(i => i.id === currentId)?.title || '';
  const access = await gasGetAccess(currentId, title);
  if (!access) { updateSeatCountdownText(); return; } // lỗi mạng tạm thời — thử lại lượt sau
  publishConfig = access;
  const isBlockedNow = publishConfig.status !== 'published';

  if (wasBlocked && !isBlockedNow) {
    const res = await gasGetChart(currentId || '');
    if (res.chart?.layout?.seats) {
      seatState = { left: normalizeRows(res.chart.layout.seats.left), right: normalizeRows(res.chart.layout.seats.right) };
      saveSeatState(seatState);
    }
    showToast('Sơ đồ vừa được công bố.');
    render();
  } else if (!wasBlocked && isBlockedNow) {
    showToast('Sơ đồ đã được chuyển về chế độ riêng tư.');
    render();
  } else if (isBlockedNow) {
    updateSeatCountdownText();
  }
}

/* ---------- Boot ---------- */
async function boot() {
  // Render ngay với dữ liệu cục bộ để không bị trắng màn hình trong lúc
  // chờ gọi Google Sheets.
  render();

  if (!gasUrl) { dataSource = 'local'; return; }

  try {
    const charts = await gasListCharts();
    dataSource = 'gas';

    if (charts.length) {
      sheets = charts;
      const active = charts.find(c => c.active) || charts[0];
      currentId = active.id;
      const res = await gasGetChart(currentId);
      // res.restricted === true nghĩa là sơ đồ đang riêng tư và mình không
      // đủ quyền — không có seats thật để nạp, cứ để publishConfig (đọc
      // bên dưới, luôn cho phép xem status) quyết định render() có chặn hay
      // không, không hiện tạm dữ liệu mặc định cục bộ đánh lừa người xem.
      if (res.chart?.layout?.seats) {
        seatState = { left: normalizeRows(res.chart.layout.seats.left), right: normalizeRows(res.chart.layout.seats.right) };
        saveSeatState(seatState);
      }
      publishConfig = await gasGetAccess(currentId, active.title);
    } else {
      // Sheet SEATING CHART chưa có sơ đồ nào — vẫn hiện dữ liệu mặc định
      // cục bộ; bấm "Lưu sơ đồ" sẽ tạo dòng đầu tiên thật trên Sheet.
      sheets = [];
      currentId = '';
      publishConfig = { status: 'private' };
    }
    render();
  } catch (e) {
    dataSource = 'local';
    showToast('Không kết nối được Google Sheets — đang dùng dữ liệu cục bộ.');
  }

  startAccessPolling();
}

function initSeating(opts = {}) {
  gasUrl = opts.gasUrl || null;
  userRole = opts.userRole || null;
  void boot();
}

/* Auto-init khi dùng độc lập (không qua seating-window.html gọi initSeating) */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('seating-root') && !window.__seating_manual_init) initSeating();
  });
} else if (document.getElementById('seating-root') && !window.__seating_manual_init) {
  initSeating();
}
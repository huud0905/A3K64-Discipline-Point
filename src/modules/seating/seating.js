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

/* ---------- Cấu hình phòng (cửa sổ / cửa / nhãn hàng trước) ----------
 * Khác lớp khác phòng thì vị trí cửa sổ, cửa, hoặc tên nhãn (BÀN GV/BẢNG/
 * CỬA RA VÀO) có thể khác nhau — nên để dữ liệu-hoá thay vì hardcode.
 * Lưu kèm trong layout.room của mỗi sơ đồ (đã có cột room_json ở backend). */
const SEAT_DEFAULT_ROOM = {
  windows: {
    left:  [{ top: 14, height: 90 }, { top: 61, height: 90 }],
    right: [{ top: 9,  height: 90 }, { top: 37, height: 90 }],
  },
  door: { side: 'right', top: 74, height: 108 },
  front: [
    { key: 'teacher',    icon: 'desk',       label: 'BÀN GV' },
    { key: 'board-label',icon: 'blackboard', label: 'BẢNG' },
    { key: 'door',       icon: 'doorOpen',   label: 'CỬA RA VÀO' },
  ],
};
function cloneRoom(r) { return JSON.parse(JSON.stringify(r)); }
function clampNum(v, min, max, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
function normalizeWindowList(list, fallback) {
  const src = Array.isArray(list) && list.length ? list : fallback;
  return src.slice(0, 4).map((w, i) => ({
    top:    clampNum(w && w.top,    2, 96, fallback[i]?.top || (10 + i * 25)),
    height: clampNum(w && w.height, 30, 260, fallback[i]?.height || 90),
  }));
}
function normalizeRoom(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const windows = r.windows && typeof r.windows === 'object' ? r.windows : {};
  const door = r.door && typeof r.door === 'object' ? r.door : {};
  const front = Array.isArray(r.front) && r.front.length ? r.front : null;
  return {
    windows: {
      left:  normalizeWindowList(windows.left,  SEAT_DEFAULT_ROOM.windows.left),
      right: normalizeWindowList(windows.right, SEAT_DEFAULT_ROOM.windows.right),
    },
    door: {
      side:   door.side === 'left' ? 'left' : 'right',
      top:    clampNum(door.top,    2, 96,  SEAT_DEFAULT_ROOM.door.top),
      height: clampNum(door.height, 30, 260, SEAT_DEFAULT_ROOM.door.height),
    },
    front: (front || SEAT_DEFAULT_ROOM.front).slice(0, 3).map((f, i) => ({
      key:   String(f?.key || SEAT_DEFAULT_ROOM.front[i]?.key || `slot${i}`),
      icon:  String(f?.icon || SEAT_DEFAULT_ROOM.front[i]?.icon || 'desk'),
      label: String(f?.label || SEAT_DEFAULT_ROOM.front[i]?.label || ''),
    })),
  };
}

/* ---------- Bảng mapping: tên ngắn (seat_name) → họ tên đầy đủ ---------- *
 * Hardcode 1:1 — không cần cột seat_name trong ACCOUNTS, không cần so khớp  *
 * đuôi tên. Mọi chỗ hiển thị tên đều qua seatFullName(name).                */
const SEAT_FULL_NAME = {
  'A Đạt':      'Phan Anh Đạt',
  'Bảo':        'Lê Hoàng Đức Bảo',
  'C Trường':   'Nguyễn Lê Công Trường',
  'D Hiếu':     'Dương Trung Hiếu',
  'Duy':        'Nguyễn Văn Khánh Duy',
  'Đ Minh':     'Phạm Đăng Minh',
  'Đan':        'Nguyễn Bùi Linh Đan',
  'Đức':        'Nguyễn Minh Đức',
  'Đức An':     'Nguyễn Bá Đức An',
  'Đức Anh':    'Lương Hoàng Đức Anh',
  'Đức Nam':    'Nguyễn Đức Nam',
  'H Giang':    'Phan Thị Hương Giang',
  'H Nhi':      'Nguyễn Lê Hải Nhi',
  'Hà Linh':    'Nguyễn Hà Linh',
  'Hà Tâm':    'Hà Minh Tâm',
  'Hằng':       'Nguyễn Thị Hằng',
  'Hiền Linh':  'Lê Hiền Linh',
  'Hoàng Linh': 'Nguyễn Hoàng Linh',
  'Hữu':        'Đinh Mạnh Hữu',
  'Huy Đạt':   'Nguyễn Huy Thành Đạt',
  'K Linh':     'Nguyễn Khánh Linh',
  'K Ngân':    'Nguyễn Thị Kim Ngân',
  'Khánh':      'Nguyễn Ngọc Nam Khánh',
  'Lê Mạnh':   'Nguyễn Lê Đức Mạnh',
  'Lộc':        'Mai Thanh Lộc',
  'Mạnh':       'Thái Đức Mạnh',
  'N Hiếu':    'Nguyễn Ngọc Hiếu',
  'N Minh':    'Hoàng Nguyễn Nhật Minh',
  'Na':         'Vi Kim Na',
  'Nhân':       'Nguyễn Trọng Nhân',
  'Như':        'Lê Hoàng Gia Như',
  'Q Nhi':     'Nguyễn Quỳnh Nhi',
  'Quân':       'Nguyễn Bảo Quân',
  'Sang':       'Phạm Tiến Sang',
  'Sáng':       'Phạm Minh Sáng',
  'T Tâm':     'Phạm Thanh Tâm',
  'Tài':        'Lê Văn Tấn Tài',
  'Thành':      'Trần Văn Thành',
  'Thành Đạt': 'Nguyễn Thành Đạt',
  'Thắm':       'Nguyễn Thị Hồng Thắm',
  'Thắng':      'Nguyễn Chiến Thắng',
  'Thiện':      'Nguyễn Minh Thiện',
  'Thơ':        'Lê Thị Anh Thơ',
  'Thục Anh':  'Lê Thục Anh',
  'Thuỷ':       'Thái Thị Thuỳ',
  'Tiến':       'Đặng Lê Tiến',
  'Tinh':       'Nguyễn Văn Quang Tinh',
  'Trang':      'Nguyễn Thị Thu Trang',
  'Trí':        'Nguyễn Minh Trí',
  'Trung':      'Nguyễn Hữu Trung',
  'Tuấn':       'Nguyễn Văn Tuấn',
  'V Trường':  'Võ Văn Trường',
  'Việt An':   'Ngô Việt An',
  'Y Nhi':     'Nguyễn Thị Yến Nhi',
};

/** Trả họ tên đầy đủ từ tên ngắn. Fallback về chính tên ngắn nếu không tìm thấy. */
function seatFullName(shortName) {
  const s = String(shortName || '').trim();
  return SEAT_FULL_NAME[s] || s;
}

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
  const item = { id: `seat_${Date.now()}`, title: 'Sơ đồ 1', active: true, createdAt: now, updatedAt: now, layout: { seats, room: cloneRoom(SEAT_DEFAULT_ROOM), exportedAt: now } };
  items = [item];
  writeDb(items);
  localStorage.setItem(SEAT_CURRENT_KEY, item.id);
  return items;
}
function currentSheetId(sheets) {
  return localStorage.getItem(SEAT_CURRENT_KEY) || sheets.find(i => i.active)?.id || sheets[0]?.id || '';
}
function saveSheet(sheets, id, title, seats, room) {
  const items = sheets.length ? sheets.slice() : ensureDb(seats);
  const now = new Date().toISOString();
  let item = id ? items.find(i => i.id === id) : undefined;
  const roomToSave = room || item?.layout?.room || cloneRoom(SEAT_DEFAULT_ROOM);
  if (item) {
    item.title = title; item.layout = { seats, room: roomToSave, exportedAt: now }; item.updatedAt = now;
  } else {
    item = { id: `seat_${Date.now()}`, title, active: true, createdAt: now, updatedAt: now, layout: { seats, room: roomToSave, exportedAt: now } };
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

// Kiểm tra người dùng hiện tại có trong danh sách xem trước không.
// previewStudents là chuỗi tên phân cách bằng dấu phẩy (lưu ở backend).
// Backend lưu tên NGẮN (seat_name) nhưng userName trong session là tên ĐẦY ĐỦ
// → so khớp theo cả hai chiều:
//   (1) seatNorm(entry) === seatNorm(userName)           — entry là tên đầy đủ
//   (2) seatNorm(seatFullName(entry)) === seatNorm(userName) — entry là tên ngắn → tra mapping lấy full
//   (3) seatNorm(entry) khớp với seatNorm của tên ngắn nào có full-name = userName — ngược lại
function isInPreviewList(previewStudents) {
  if (!userName) return false;
  const wantNorm = seatNorm(userName);
  // Tập các norm của tên ngắn mà full-name khớp với userName (tra ngược SEAT_FULL_NAME)
  const shortNormsForUser = Object.entries(SEAT_FULL_NAME)
    .filter(([, full]) => seatNorm(full) === wantNorm)
    .map(([short]) => seatNorm(short));

  return String(previewStudents || '').split(',')
    .map(n => n.trim()).filter(Boolean)
    .some(n => {
      const nNorm = seatNorm(n);
      // (1) entry khớp trực tiếp với userName (tên đầy đủ)
      if (nNorm === wantNorm) return true;
      // (2) entry là tên ngắn → tra mapping lấy full rồi so
      if (seatNorm(seatFullName(n)) === wantNorm) return true;
      // (3) entry là tên ngắn khớp với bất kỳ short-name nào của user
      if (shortNormsForUser.includes(nNorm)) return true;
      return false;
    });
}

// Người dùng hiện tại có thể xem sơ đồ không (kể cả preview)?
// - Luôn true với GVCN/lớp trưởng.
// - status='published' → tất cả xem được.
// - status='preview'   → chỉ những ai trong previewStudents.
// - status='private'   → chỉ GVCN/lớp trưởng (đã bắt ở trên).
function canViewSeating(status, previewStudents) {
  if (canEditSeating()) return true;
  if (status === 'published') return true;
  if (status === 'preview') return isInPreviewList(previewStudents);
  return false;
}

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
async function gasSaveChart(id, title, seats, room) {
  const json = await postToGas('saveSeatingChart', {
    id: id || '', title, layout: { seats, room: room || cloneRoom(SEAT_DEFAULT_ROOM) }, makeActive: true,
    role: userRole || '', actor: { name: userName, role: userRole },
  });
  const data = gasData(json);
  return { chart: data.chart || null, error: json?.ok === false ? (json.error || '') : (data.error || '') };
}
async function gasGetAccess(chartId, chartTitle) {
  const data = gasData(await fetchFromGas({ action: 'getSeatingAccess', chartId: chartId || '', chartTitle: chartTitle || '', role: userRole || '' }));
  return data.access || { status: 'private' };
}
async function gasSaveAccess(chartId, chartTitle, status, previewStudents) {
  const json = await postToGas('saveSeatingAccess', {
    chartId: chartId || '', chartTitle: chartTitle || '', status,
    previewStudents: previewStudents || '',
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
let roomConfig     = normalizeRoom(sheets.find(i => i.id === currentId)?.layout?.room);
let query          = '';
let editMode       = false;
let selectOpen     = false;
let modal          = null;   // null | 'create' | 'publish' | 'manage'
let modalOpening   = false;  // true trong lượt render() đầu tiên sau openModal() — kích hoạt fade-in
let dragPayload    = null;   // { type, name, pos? }
let dragFrontIndex = null;   // index đang kéo trong hàng BÀN GV/BẢNG/CỬA
let roomDrag        = null;  // di chuyển tự do cửa sổ/cửa bằng chuột
let roomResize       = null; // đổi kích thước cửa sổ/cửa bằng chuột
let sidebarCollapsed = false; // true khi người dùng ẩn sidebar

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
/* showToast → A3Notify (notify.js). Giữ tên hàm để không đổi các call site */
function showToast(msg, type) {
  if (window.A3Notify) {
    window.A3Notify.show(msg, { type: type || 'info' });
  } else {
    console.info('[A3K64]', msg);
  }
}

/* ============================================================
   RENDER — one big re-render, patching only what changed
   ============================================================ */
function render() {
  const root = document.getElementById('seating-root');
  if (!root) return;

  const editable = canEditSeating();
  const status = publishConfig.status || 'private';
  const previewStudents = publishConfig.previewStudents || publishConfig.preview_students || '';

  // Không đủ quyền xem → màn hình chặn.
  if (!canViewSeating(status, previewStudents)) {
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
        <h1>SƠ ĐỒ CHỖ NGỒI LỚP 12A3</h1>
        <p>${editable ? 'Bật sửa rồi kéo tên vào ghế, hoặc kéo đổi chỗ BÀN GV / BẢNG / CỬA RA VÀO' : 'Đang xem ở chế độ chỉ đọc.'}</p>
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
        ${editable ? `<button id="btn-publish" class="seat-btn-badge${publishConfig.status === 'published' ? ' is-on' : publishConfig.status === 'preview' ? ' is-preview' : ''}">${seatIcon('globe', 18)} Công bố${publishConfig.status === 'published' ? ' ✓' : publishConfig.status === 'preview' ? ' 👁' : ''}</button>` : ''}
        ${editable ? `<button id="btn-save" class="seat-btn-save">${seatIcon('save', 18)} Lưu sơ đồ</button>` : ''}
      </div>
    </div>
  </div>

  <!-- ── Main ── -->
  <div class="seat-main${sidebarCollapsed ? ' sidebar-collapsed' : ''}">
    <!-- Sidebar -->
    <div class="seat-side-col">
      <!-- Nút thu gọn / mở rộng sidebar — luôn hiện, kể cả khi đã collapsed -->
      <button id="btn-sidebar-toggle" class="seat-sidebar-toggle" title="${sidebarCollapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}">
        ${seatIcon(sidebarCollapsed ? 'sidebarExpand' : 'sidebarCollapse', 16)}
        <span>${sidebarCollapsed ? '' : 'Thu gọn'}</span>
      </button>
      ${sidebarCollapsed ? '' : `
      <aside class="seat-students">
        <div class="seat-students-head">
          <div>
            <strong>Danh sách học sinh</strong>
            <span>${unassignedStudents.length === 0 ? 'Tất cả đã có chỗ ngồi' : 'Kéo vào ô ghế để xếp chỗ'}</span>
          </div>
          <span class="seat-badge">${unassignedStudents.length}</span>
        </div>
        <div class="seat-student-list">
          ${filteredStudents.length === 0
            ? (unassignedStudents.length === 0
                ? `<div class="seat-students-note">✓ Tất cả học sinh đã có chỗ ngồi.</div>`
                : `<div class="seat-notif-empty">Không tìm thấy học sinh.</div>`)
            : filteredStudents.map(name => {
                const hit = Boolean(q && seatNorm(name).includes(q));
                const fullN = seatFullName(name);
                return `<div class="seat-student-card${hit ? ' highlight' : ''}" draggable="${editable && editMode}" data-student="${escH(name)}" title="${escH(fullN)}">
                  <span>${escH(name)}</span><small>${escH(fullN !== name ? fullN : 'Chưa xếp')}</small>
                </div>`;
              }).join('')
          }
        </div>
      </aside>`}
    </div>

    <!-- Board — fit-to-screen bằng CSS scale, overflow:hidden -->
    <div class="seat-board-wrap">
      <div class="seat-board">
        ${roomConfig.windows.left.map((w, i) => `<div class="seat-room-window left${editable && editMode ? ' room-draggable' : ''}"
          style="top:${w.top}%;height:${w.height}px" data-room-type="window" data-room-side="left" data-room-index="${i}">
          ${editable && editMode ? `<span class="seat-room-resize" data-room-resize="1"></span>` : ''}
        </div>`).join('')}
        ${roomConfig.windows.right.map((w, i) => `<div class="seat-room-window right${editable && editMode ? ' room-draggable' : ''}"
          style="top:${w.top}%;height:${w.height}px" data-room-type="window" data-room-side="right" data-room-index="${i}">
          ${editable && editMode ? `<span class="seat-room-resize" data-room-resize="1"></span>` : ''}
        </div>`).join('')}
        <div class="seat-room-door ${roomConfig.door.side}${editable && editMode ? ' room-draggable' : ''}"
          style="top:${roomConfig.door.top}%;height:${roomConfig.door.height}px" data-room-type="door">
          ${editable && editMode ? `<span class="seat-room-resize" data-room-resize="1"></span>` : ''}
        </div>
        <div class="seat-back-label">CUỐI LỚP</div>
        <div class="seat-layout">
          ${renderSide('left', q)}
          <div class="seat-aisle">LỐI ĐI</div>
          ${renderSide('right', q)}
        </div>
        <div class="seat-front">
          ${roomConfig.front.map((f, i) => `<span class="${(String(f.key).replace(/[^a-zA-Z0-9_-]/g, '') || 'front-slot')}"
            draggable="${editable && editMode}" data-front-index="${i}">
            <span class="seat-front-icon">${seatIcon(f.icon, 15)}</span>
            ${escH(f.label)}
          </span>`).join('')}
        </div>
        <div class="seat-approve">GVCN: Võ Thị Ngọc Tân – Đã Duyệt</div>

        <!-- Modal chỉ che khu vực sơ đồ -->
        ${renderModal(currentTitle, publishConfig)}
      </div>
    </div>
  </div>
</div>
`;

  bindEvents();
  scheduleFitBoard();
}

function escH(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ---------- Icon set (SVG inline, quy chuẩn kiểu Lucide) ---------- */
const SEAT_ICON_PATHS = {
  layoutGrid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  desk: '<rect x="2" y="7" width="20" height="3" rx="1"/><path d="M6 10v7M18 10v7"/><path d="M4 17h16"/>',
  blackboard: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  doorOpen: '<path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4l-6 2v14l6 2V4z"/>',
  sidebarCollapse: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/>',
  sidebarExpand: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m14 9 3 3-3 3"/>',
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
function renderSeatBlocked(_status) {
  return `<div class="seat-app">
    <div class="seat-blocked">
      <div class="seat-blocked-card">
        <div class="seat-blocked-icon">🔒</div>
        <h2>Sơ đồ lớp chưa được công bố</h2>
        <p>Sơ đồ chỗ ngồi đang ở chế độ riêng tư. Chỉ GVCN mới xem/sửa được lúc này — vui lòng quay lại sau khi sơ đồ được công bố.</p>
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
          // So khớp cả tên ngắn lẫn full-name với userName (tên đầy đủ trong session)
          const isSelf = Boolean(userName && name && (
            seatNorm(name) === seatNorm(userName) ||
            seatNorm(seatFullName(name)) === seatNorm(userName)
          ));
          const cls = [
            'seat-cell',
            name ? '' : 'empty',
            hit ? 'highlight' : '',
            isSelf ? 'self-seat' : '',
          ].filter(Boolean).join(' ');
          const fullName = name ? seatFullName(name) : '';
          return `<div class="${cls}"
            draggable="${canEditSeating() && editMode}"
            data-side="${side}" data-row="${rowIdx}" data-seat="${seatIdx}"
            ${fullName ? `title="${escH(fullName)}"` : ''}>
            ${isSelf ? '<span class="seat-you-badge">Bạn</span>' : ''}
            <span class="seat-short-name">${escH(name || 'Trống')}</span>
            ${fullName && fullName !== name ? `<span class="seat-full-name">${escH(fullName)}</span>` : ''}
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
    const curStatus = publishConfig.status || 'private';
    const previewStudents = publishConfig.previewStudents || publishConfig.preview_students || '';
    // Render danh sách checkbox học sinh để chọn xem trước
    const previewList = previewStudents.split(',').map(n => seatNorm(n.trim())).filter(Boolean);
    const studentChecks = SEAT_STUDENTS.map(name => {
      const checked = previewList.includes(seatNorm(name));
      const fullN = seatFullName(name);
      return `<label class="seat-preview-check-label" title="${escH(fullN)}">
        <input type="checkbox" class="seat-preview-student-cb" value="${escH(name)}"${checked ? ' checked' : ''}>
        <span>${escH(name)}</span>${fullN !== name ? `<small class="seat-preview-full">${escH(fullN)}</small>` : ''}
      </label>`;
    }).join('');

    return `<div class="seat-modal-backdrop" id="modal-backdrop">
      <div class="seat-modal seat-modal-publish">
        <div>
          <h3>Cài đặt công bố sơ đồ</h3>
          <p>${escH(currentTitle)}</p>
        </div>
        <label>Trạng thái
          <select id="modal-publish-select">
            <option value="private"${curStatus === 'private' ? ' selected' : ''}>🔒 Riêng tư</option>
            <option value="preview"${curStatus === 'preview' ? ' selected' : ''}>👁 Xem trước (học sinh được chọn)</option>
            <option value="published"${curStatus === 'published' ? ' selected' : ''}>🌐 Công bố cho cả lớp</option>
          </select>
        </label>
        <div id="modal-preview-section" class="${curStatus !== 'preview' ? 'seat-hidden' : ''}">
          <div class="seat-preview-section-head">
            <span>Học sinh được xem trước</span>
            <div class="seat-preview-section-actions">
              <button type="button" id="btn-preview-all">Chọn tất cả</button>
              <button type="button" id="btn-preview-none">Bỏ chọn</button>
            </div>
          </div>
          <div class="seat-preview-student-grid" id="modal-preview-grid">
            ${studentChecks}
          </div>
        </div>
        <div class="seat-modal-actions">
          <button id="modal-cancel">Huỷ</button>
          <button class="primary" id="modal-confirm">Lưu cài đặt</button>
        </div>
      </div>
    </div>`;
  }

  if (modal === 'manage') {
    const curStatus = publishConfig.status || 'private';
    const previewStudents = publishConfig.previewStudents || publishConfig.preview_students || '';
    const previewCount = previewStudents.split(',').map(n => n.trim()).filter(Boolean).length;
    const statusLabel = curStatus === 'published' ? 'Đã công bố' : curStatus === 'preview' ? 'Xem trước' : 'Riêng tư';
    const statusDesc  = curStatus === 'published' ? 'Cả lớp có thể xem sơ đồ này'
      : curStatus === 'preview' ? `${previewCount} học sinh đang được xem trước`
      : 'Chỉ GVCN/cán bộ lớp xem được';
    const pillClass   = curStatus === 'published' ? 'published' : curStatus === 'preview' ? 'preview' : 'private';
    return `<div class="seat-modal-backdrop" id="modal-backdrop">
      <div class="seat-modal">
        <div>
          <h3>Quản lý công bố</h3>
          <p>${escH(currentTitle)}</p>
        </div>
        <div class="seat-status-row">
          <div>
            <strong>Trạng thái hiện tại</strong>
            <span>${statusDesc}</span>
          </div>
          <span class="seat-status-pill ${pillClass}">${statusLabel}</span>
        </div>
        <div class="seat-modal-manage-actions">
          <button class="seat-mini-btn" id="modal-edit-settings">Sửa cài đặt</button>
          <button class="seat-mini-btn primary" id="modal-toggle">${curStatus === 'published' ? 'Đưa về riêng tư' : 'Công bố ngay'}</button>
        </div>
        <div class="seat-room-form">
          <strong>Đổi nhãn BÀN GV / BẢNG / CỬA RA VÀO</strong>
          <p class="seat-room-hint">Muốn đổi <b>vị trí/kích thước</b>? Đóng cửa sổ này, bấm "Bật sửa" rồi kéo-thả hoặc kéo giãn cửa sổ/cửa ngay trên sơ đồ.</p>
          ${roomConfig.front.map((f, i) => `<label>Nhãn ô ${i === 0 ? 'bàn GV' : i === 1 ? 'bảng' : 'cửa'}
            <input type="text" id="room-front-${i}" value="${escH(f.label)}" maxlength="24" />
          </label>`).join('')}
          <button class="seat-mini-btn" id="modal-room-save">Lưu nhãn</button>
        </div>
        <div class="seat-modal-actions">
          <button id="modal-cancel">Đóng</button>
        </div>
      </div>
    </div>`;
  }

  return '';
}


/* ============================================================
   PRINT / XUẤT A4 — port từ seatingPrintExportA4.ts
   ============================================================ */
const PRINT_MODAL_ID = 'a3k64-seat-print-modal';

function printTodayText() {
  const now = new Date();
  return `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
}

function printCurrentSeats() {
  // Đọc từ seatState (luôn có, không cần DOM fallback)
  const norm = (rows) => Array.from({length:7},(_,ri)=>{
    const row = Array.isArray(rows?.[ri]) ? rows[ri] : [];
    return Array.from({length:4},(_,si)=>String(row[si]||'').trim());
  });
  return { left: norm(seatState.left), right: norm(seatState.right) };
}

function printCell(name) {
  const clean = String(name||'').trim();
  const display = clean || 'Ø';
  const len = clean.length;
  const cls = len >= 12 ? 'tiny' : len >= 9 ? 'small' : '';
  return `<td class="${cls}"><span>${escH(display)}</span></td>`;
}

function printSide(rows) {
  return `<div class="side">${rows.map(row=>`<table class="desk"><tr>${row.map(printCell).join('')}</tr></table>`).join('')}</div>`;
}

function printBuildHtml(seats, changeNo, dateText) {
  const no   = escH(changeNo   || '...');
  const date = escH(dateText   || '.../.../...');
  // Lấy nhãn BÀN GV / BẢNG / CỬA RA VÀO từ roomConfig hiện tại
  const frontLabels = roomConfig.front.map(f => escH(f.label));
  while (frontLabels.length < 3) frontLabels.push('');

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8"/>
<title>Sơ đồ chỗ ngồi lớp 12A3</title>
<style>
  @page{size:A4 landscape;margin:7mm 9mm;}
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;background:#fff;color:#000;font-family:"Times New Roman","Noto Serif",Arial,serif;}
  body{width:279mm;min-height:192mm;}
  .page{width:100%;min-height:192mm;position:relative;padding:6mm 7mm 7mm;}
  .title{text-align:center;color:red;font-size:19pt;font-weight:700;margin:0 0 3.5mm;text-transform:uppercase;}
  .subtitle{text-align:center;color:red;font-size:15.5pt;font-weight:700;margin:0 0 2mm;}
  .room{position:relative;border:1.8px solid #0f3554;min-height:148mm;padding:12mm 10mm 9mm;}
  .back{position:absolute;top:4mm;left:50%;transform:translateX(-50%);font-size:14pt;font-weight:700;}
  .layout{display:grid;grid-template-columns:minmax(0,1fr) 23mm minmax(0,1fr);gap:12mm;align-items:stretch;margin-top:1mm;}
  .side{display:grid;grid-template-rows:repeat(7,1fr);gap:8.8mm;align-content:stretch;min-width:0;}
  .desk{width:100%;height:8.8mm;border-collapse:collapse;table-layout:fixed;font-size:12.4pt;}
  .desk td{border:1px solid #000;text-align:center;vertical-align:middle;height:8.8mm;width:25%;padding:0 1.1mm;white-space:nowrap;line-height:1.05;overflow:hidden;}
  .desk td span{display:block;width:100%;overflow:hidden;text-overflow:clip;white-space:nowrap;}
  .desk td.small{font-size:11.4pt;letter-spacing:-.02em;}
  .desk td.tiny{font-size:10.3pt;letter-spacing:-.04em;}
  .aisle{display:flex;align-items:flex-end;justify-content:center;font-size:13pt;font-weight:700;padding-bottom:1mm;}
  .front{display:grid;grid-template-columns:minmax(0,1fr) 23mm minmax(0,1fr);gap:12mm;margin-top:2mm;font-size:14pt;font-weight:700;}
  .front span{text-align:center;}
  .gv{position:absolute;right:8mm;bottom:2mm;font-size:13.2pt;}
  .window{position:absolute;width:5mm;height:26mm;background:#176a8b;border:1.3px solid #08384d;}
  .window.left.a{left:-2.7mm;top:16%;}.window.left.b{left:-2.7mm;top:66%;}
  .window.right.a{right:-2.7mm;top:10%;}.window.right.b{right:-2.7mm;top:38%;}
  .door{position:absolute;right:-2.7mm;bottom:5mm;width:5mm;height:34mm;background:#050505;border:1.3px solid #050505;}
  @media print{.page{break-inside:avoid;}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
</style>
</head>
<body>
  <main class="page">
    <h1 class="title">SƠ ĐỒ CHỖ NGỒI LỚP 12A3</h1>
    <h2 class="subtitle">Thay đổi lần ${no} – Áp dụng từ ngày ${date}</h2>
    <section class="room">
      <div class="window left a"></div><div class="window left b"></div>
      <div class="window right a"></div><div class="window right b"></div>
      <div class="door"></div>
      <div class="back">CUỐI LỚP</div>
      <div class="layout">
        ${printSide(seats.left)}
        <div class="aisle"></div>
        ${printSide(seats.right)}
      </div>
      <div class="front">
        <span>${frontLabels[0]||'BÀN GV'}</span>
        <span>${frontLabels[1]||'BẢNG'}</span>
        <span>${frontLabels[2]||'CỬA RA VÀO'}</span>
      </div>
      <div class="gv">GVCN: Võ Thị Ngọc Tân – Đã duyệt</div>
    </section>
  </main>
  <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),120));<\/script>
</body>
</html>`;
}

function printOpenWindow(changeNo, dateText) {
  const seats = printCurrentSeats();
  const html  = printBuildHtml(seats, changeNo, dateText);
  const win   = window.open('', '_blank', 'width=1200,height=820');
  if (!win) {
    // Popup bị chặn → fallback tải file
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'so-do-cho-ngoi-12A3.html'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function showPrintModal() {
  // Xoá modal cũ nếu còn
  document.getElementById(PRINT_MODAL_ID)?.remove();

  // Inject style modal một lần
  if (!document.getElementById('a3k64-print-modal-style')) {
    const s = document.createElement('style');
    s.id = 'a3k64-print-modal-style';
    s.textContent = `
      #${PRINT_MODAL_ID}{position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.45);display:grid;place-items:center;padding:20px;font-family:var(--seat-font,system-ui,sans-serif);}
      #${PRINT_MODAL_ID} .pm-card{width:min(480px,calc(100vw - 32px));background:var(--seat-card-bg,#111827);border:1px solid var(--seat-border,#263244);border-radius:20px;box-shadow:0 32px 80px rgba(0,0,0,.5);padding:24px;color:var(--seat-text,#f8fafc);}
      #${PRINT_MODAL_ID} h3{margin:0 0 5px;font-size:18px;font-weight:800;letter-spacing:-.02em;}
      #${PRINT_MODAL_ID} p{margin:0 0 18px;color:var(--seat-text-muted,#94a3b8);font-size:12.5px;}
      #${PRINT_MODAL_ID} .pm-grid{display:grid;grid-template-columns:.6fr 1fr;gap:11px;margin-bottom:18px;}
      #${PRINT_MODAL_ID} label{display:grid;gap:5px;font-size:11px;font-weight:700;color:var(--seat-text-muted,#94a3b8);text-transform:uppercase;letter-spacing:.06em;}
      #${PRINT_MODAL_ID} input{height:40px;border:1px solid var(--seat-border,#263244);border-radius:11px;padding:0 12px;font-size:14px;font-weight:700;color:var(--seat-text,#f8fafc);background:var(--seat-input-bg,#0f172a);outline:none;width:100%;}
      #${PRINT_MODAL_ID} input:focus{border-color:var(--seat-accent,#2563eb);box-shadow:0 0 0 3px color-mix(in srgb,var(--seat-accent,#2563eb) 20%,transparent);}
      #${PRINT_MODAL_ID} .pm-actions{display:flex;justify-content:flex-end;gap:8px;}
      #${PRINT_MODAL_ID} .pm-btn{height:40px;border:1px solid var(--seat-border,#263244);border-radius:11px;padding:0 16px;background:var(--seat-card-bg,#111827);color:var(--seat-text,#f8fafc);font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;}
      #${PRINT_MODAL_ID} .pm-btn.primary{background:var(--seat-accent,#2563eb);border-color:transparent;color:#fff;}
      #${PRINT_MODAL_ID} .pm-btn:hover{opacity:.88;}
      @media(max-width:480px){#${PRINT_MODAL_ID} .pm-grid{grid-template-columns:1fr;}}
    `;
    document.head.appendChild(s);
  }

  const wrap = document.createElement('div');
  wrap.id = PRINT_MODAL_ID;
  wrap.innerHTML = `
    <div class="pm-card" role="dialog" aria-modal="true" aria-label="In sơ đồ chỗ ngồi">
      <h3>In / Xuất sơ đồ A4</h3>
      <p>Khổ A4 ngang · Lớp 12A3 · Times New Roman</p>
      <div class="pm-grid">
        <label>Thay đổi lần
          <input id="pm-change-no" type="text" inputmode="numeric" value="1" placeholder="1" />
        </label>
        <label>Áp dụng từ ngày
          <input id="pm-change-date" type="text" value="${printTodayText()}" placeholder="dd/mm/yyyy" />
        </label>
      </div>
      <div class="pm-actions">
        <button class="pm-btn" id="pm-cancel">Huỷ</button>
        <button class="pm-btn primary" id="pm-print">🖨 In A4 ngang</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  // Bind events
  document.getElementById('pm-cancel').onclick = () => wrap.remove();
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
  document.getElementById('pm-print').onclick = () => {
    const changeNo  = (document.getElementById('pm-change-no').value  || '').trim();
    const dateText  = (document.getElementById('pm-change-date').value || '').trim();
    wrap.remove();
    printOpenWindow(changeNo, dateText);
  };

  // Focus ô số lần thay đổi
  setTimeout(() => document.getElementById('pm-change-no')?.select(), 60);
}

/* ---------- Bind events after each render ---------- */
function bindEvents() {
  /* sidebar toggle */
  on('btn-sidebar-toggle', () => { sidebarCollapsed = !sidebarCollapsed; render(); });

  /* toolbar */
  on('btn-publish',  () => openModal('publish'));
  on('btn-manage',   () => openModal('manage'));
  on('btn-save',     handleSaveSheet);
  on('btn-create',   () => openModal('create'));
  on('btn-edit',     () => { editMode = !editMode; render(); });
  on('btn-reset',    handleReset);
  on('btn-random',   handleRandom);
  on('btn-print',    () => showPrintModal());

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

  /* drag-and-drop — hàng BÀN GV / BẢNG / CỬA RA VÀO (đổi chỗ như xếp hình) */
  document.querySelectorAll('[data-front-index]').forEach(el => {
    const idx = +el.dataset.frontIndex;
    el.addEventListener('dragstart', () => { dragFrontIndex = idx; });
    el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', e => {
      e.preventDefault();
      el.classList.remove('drag-over');
      handleFrontDrop(idx);
    });
  });

  /* kéo tự do cửa sổ/cửa bằng chuột (đổi vị trí + kích thước, không cần thiết lập thủ công) */
  document.querySelectorAll('[data-room-type]').forEach(el => {
    el.addEventListener('mousedown', e => {
      if (e.target.closest('[data-room-resize]')) return;
      startRoomMove(e, el);
    });
  });
  document.querySelectorAll('[data-room-resize]').forEach(handle => {
    handle.addEventListener('mousedown', e => { e.stopPropagation(); startRoomResize(e, handle); });
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
    // Ẩn/hiện danh sách học sinh khi chọn trạng thái
    const publishSel = document.getElementById('modal-publish-select');
    const previewSection = document.getElementById('modal-preview-section');
    if (publishSel && previewSection) {
      publishSel.addEventListener('change', () => {
        previewSection.classList.toggle('seat-hidden', publishSel.value !== 'preview');
      });
    }
    // Chọn / bỏ chọn tất cả
    on('btn-preview-all', () => {
      document.querySelectorAll('.seat-preview-student-cb').forEach(cb => { cb.checked = true; });
    });
    on('btn-preview-none', () => {
      document.querySelectorAll('.seat-preview-student-cb').forEach(cb => { cb.checked = false; });
    });

    on('modal-confirm', async () => {
      const sel = document.getElementById('modal-publish-select');
      if (!sel) return;
      const status = sel.value;
      let previewStudents = '';
      if (status === 'preview') {
        const checked = [...document.querySelectorAll('.seat-preview-student-cb:checked')];
        previewStudents = checked.map(cb => cb.value).join(',');
        if (!previewStudents) {
          showToast('Chọn ít nhất một học sinh để dùng chế độ Xem trước.', 'warn');
          return;
        }
      }
      await setPublishStatus(status, previewStudents);
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
    on('modal-room-save', async () => {
      if (!canEditSeating()) { showToast('Bạn không có quyền sửa nhãn.', 'error'); return; }
      const next = cloneRoom(roomConfig);
      roomConfig.front.forEach((f, i) => {
        const inp = document.getElementById(`room-front-${i}`);
        next.front[i].label = (inp?.value || '').trim() || f.label;
      });
      roomConfig = normalizeRoom(next);
      await handleSaveRoomConfig();
      closeModal();
    });
  }
}

async function setPublishStatus(status, previewStudents) {
  if (!canEditSeating()) { showToast('Bạn không có quyền công bố sơ đồ.', 'error'); return; }
  const title = sheets.find(i => i.id === currentId)?.title || 'Sơ đồ 1';

  if (dataSource === 'gas') {
    // "Công bố" thao tác trên 1 dòng THẬT trong sheet SEATING CHART. Nếu sơ
    // đồ hiện tại chưa từng được "Lưu sơ đồ" (currentId rỗng / chưa khớp
    // dòng nào), backend saveSeatingAccess sẽ báo lỗi "Chưa tìm thấy sơ đồ
    // thật..." và trước đây lỗi này bị nuốt mất, người dùng chỉ thấy im
    // lặng không có gì xảy ra. Ở đây tự lưu layout hiện tại trước để đảm
    // bảo luôn có dòng thật trước khi đổi trạng thái công bố.
    showToast('Đang cập nhật trạng thái công bố...', 'info');
    const { chart, error: saveErr } = await gasSaveChart(currentId, title, seatState, roomConfig);
    if (!chart) {
      showToast(saveErr || 'Không lưu được sơ đồ lên Google Sheets — kiểm tra kết nối rồi thử lại.', 'error');
      return;
    }
    currentId = chart.id;
    saveSeatState(seatState);
    localStorage.setItem(SEAT_CURRENT_KEY, chart.id);
    sheets = await gasListCharts();

    const { access, error } = await gasSaveAccess(currentId, title, status, previewStudents || '');
    if (!access) {
      showToast(error || 'Không lưu được trạng thái công bố — kiểm tra kết nối rồi thử lại.', 'error');
      return;
    }
    publishConfig = access;
  } else {
    writePublish(currentId, { status, previewStudents: previewStudents || '' });
    publishConfig = { status, previewStudents: previewStudents || '' };
  }
  render();
  showToast(
    status === 'published' ? 'Đã công bố sơ đồ cho cả lớp.' :
    status === 'preview'   ? `Đã bật Xem trước — ${(previewStudents||'').split(',').filter(Boolean).length} học sinh được xem.` :
    'Đã chuyển về riêng tư.',
    status === 'private' ? 'warn' : 'success'
  );
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
  let layoutRoom  = item.layout?.room || null;

  if (dataSource === 'gas' && !layoutSeats) {
    showToast('Đang mở sơ đồ...', 'info');
    const res = await gasGetChart(item.id);
    if (res.restricted) {
      // Sơ đồ này đang riêng tư và mình không đủ quyền — không có gì để
      // hiển thị, cứ để publishConfig phản ánh đúng trạng thái rồi render()
      // sẽ tự chuyển sang màn hình chặn.
      currentId = item.id;
      publishConfig = { status: res.status || 'private' };
      render();
      showToast('Sơ đồ này đang ở chế độ riêng tư.', 'warn');
      return;
    }
    layoutSeats = res.chart?.layout?.seats || null;
    layoutRoom  = res.chart?.layout?.room || layoutRoom;
  }
  if (!layoutSeats) { showToast('Không đọc được sơ đồ này.', 'error'); return; }

  seatState = { left: normalizeRows(layoutSeats.left), right: normalizeRows(layoutSeats.right) };
  saveSeatState(seatState); // vẫn giữ 1 bản cục bộ để mở nhanh / phòng khi mất mạng
  roomConfig = normalizeRoom(layoutRoom);
  currentId = item.id;
  localStorage.setItem(SEAT_CURRENT_KEY, item.id);

  if (dataSource === 'gas') {
    publishConfig = await gasGetAccess(currentId, item.title);
  } else {
    publishConfig = readPublish(currentId);
  }
  render();
  showToast(`Đã mở "${item.title || 'sơ đồ'}".`, 'success');
}

async function handleSaveRoomConfig() {
  const title = sheets.find(i => i.id === currentId)?.title || 'Sơ đồ hiện tại';
  if (dataSource === 'gas') {
    showToast('Đang lưu cấu hình phòng...', 'info');
    const { chart, error: saveErr } = await gasSaveChart(currentId, title, seatState, roomConfig);
    if (!chart) { showToast(saveErr || 'Lưu thất bại — kiểm tra kết nối rồi thử lại.', 'error'); return; }
    currentId = chart.id;
    sheets = await gasListCharts();
    render();
    showToast('Đã lưu cấu hình phòng.', 'success');
    return;
  }
  const { items, item } = saveSheet(sheets, currentId, title, seatState, roomConfig);
  sheets = items; currentId = item.id;
  render();
  showToast('Đã lưu cấu hình phòng (cục bộ — chưa kết nối Google Sheets).', 'success');
}

async function handleSaveSheet() {
  if (!canEditSeating()) { showToast('Bạn không có quyền sửa sơ đồ.', 'error'); return; }
  const title = sheets.find(i => i.id === currentId)?.title || 'Sơ đồ hiện tại';

  if (dataSource === 'gas') {
    showToast('Đang lưu lên Google Sheets...', 'info');
    const { chart, error: saveErr } = await gasSaveChart(currentId, title, seatState, roomConfig);
    if (!chart) { showToast(saveErr || 'Lưu thất bại — kiểm tra kết nối rồi thử lại.', 'error'); return; }
    currentId = chart.id;
    saveSeatState(seatState);
    localStorage.setItem(SEAT_CURRENT_KEY, chart.id);
    sheets = await gasListCharts();
    render();
    showToast('Đã lưu sơ đồ lên Google Sheets.', 'success');
    return;
  }

  const { items, item } = saveSheet(sheets, currentId, title, seatState, roomConfig);
  sheets = items; currentId = item.id;
  render();
  showToast('Đã lưu sơ đồ (cục bộ — chưa kết nối Google Sheets).', 'success');
}

async function doCreateSheet() {
  if (!canEditSeating()) { showToast('Bạn không có quyền tạo sơ đồ mới.', 'error'); modal = null; render(); return; }
  const inp = document.getElementById('modal-title-input');
  const title = (inp?.value || '').trim();
  if (!title) { inp?.focus(); return; }
  modal = null;

  if (dataSource === 'gas') {
    showToast('Đang tạo sơ đồ mới...', 'info');
    const { chart, error: saveErr } = await gasSaveChart('', title, seatState, roomConfig);
    if (!chart) { showToast(saveErr || 'Tạo sơ đồ thất bại — kiểm tra kết nối rồi thử lại.', 'error'); return; }
    sheets = await gasListCharts();
    await applySheet(chart);
    showToast('Đã tạo sơ đồ mới.', 'success');
    return;
  }

  const { items, item } = saveSheet(sheets, null, title, seatState, roomConfig);
  writePublish(item.id, { status: 'private' });
  sheets = items;
  await applySheet(item);
  showToast('Đã tạo sơ đồ mới.', 'success');
}

/* ---------- Kéo tự do cửa sổ/cửa bằng chuột ---------- */
function startRoomMove(e, el) {
  if (!canEditSeating() || !editMode) return;
  e.preventDefault();
  const board = document.querySelector('.seat-board');
  if (!board) return;
  const type = el.dataset.roomType;
  const side = el.dataset.roomSide || roomConfig.door.side;
  const index = el.dataset.roomIndex != null ? +el.dataset.roomIndex : null;
  const startTop = type === 'window' ? roomConfig.windows[side][index].top : roomConfig.door.top;
  roomDrag = { type, origSide: side, index, el, board, lastSide: side, lastTopPct: startTop };
  document.body.classList.add('seat-room-dragging');
  el.classList.add('is-dragging-room');
  document.addEventListener('mousemove', onRoomMoveMove);
  document.addEventListener('mouseup', onRoomMoveEnd);
}
function onRoomMoveMove(e) {
  if (!roomDrag) return;
  const boardRect = roomDrag.board.getBoundingClientRect();
  const relY = Math.min(Math.max(e.clientY - boardRect.top, 0), boardRect.height);
  const topPct = Math.min(96, Math.max(2, (relY / boardRect.height) * 100));
  const midX = boardRect.left + boardRect.width / 2;
  const newSide = e.clientX < midX ? 'left' : 'right';
  if (newSide !== roomDrag.lastSide) {
    roomDrag.el.classList.remove(roomDrag.lastSide);
    roomDrag.el.classList.add(newSide);
    roomDrag.lastSide = newSide;
  }
  roomDrag.el.style.top = `${topPct}%`;
  roomDrag.lastTopPct = topPct;
}
function onRoomMoveEnd() {
  if (!roomDrag) return;
  document.removeEventListener('mousemove', onRoomMoveMove);
  document.removeEventListener('mouseup', onRoomMoveEnd);
  document.body.classList.remove('seat-room-dragging');
  const { type, origSide, index, lastSide, lastTopPct } = roomDrag;
  const next = cloneRoom(roomConfig);
  if (type === 'window') {
    const item = next.windows[origSide][index];
    next.windows[origSide].splice(index, 1);
    next.windows[lastSide].push({ top: lastTopPct, height: item.height });
  } else {
    next.door.side = lastSide;
    next.door.top = lastTopPct;
  }
  roomConfig = normalizeRoom(next);
  roomDrag = null;
  render();
  showToast('Đã đổi vị trí — bấm "Lưu sơ đồ" để lưu lại.', 'info');
}

function startRoomResize(e, handle) {
  if (!canEditSeating() || !editMode) return;
  e.preventDefault();
  const el = handle.closest('[data-room-type]');
  const board = document.querySelector('.seat-board');
  if (!el || !board) return;
  const boardRect = board.getBoundingClientRect();
  const scale = boardRect.height / (board.clientHeight || 1);
  roomResize = {
    type: el.dataset.roomType,
    side: el.dataset.roomSide || roomConfig.door.side,
    index: el.dataset.roomIndex != null ? +el.dataset.roomIndex : null,
    el, startY: e.clientY, startHeight: el.offsetHeight / scale, scale,
    lastHeight: null,
  };
  document.body.classList.add('seat-room-dragging');
  document.addEventListener('mousemove', onRoomResizeMove);
  document.addEventListener('mouseup', onRoomResizeEnd);
}
function onRoomResizeMove(e) {
  if (!roomResize) return;
  const deltaPx = (e.clientY - roomResize.startY) / roomResize.scale;
  const newHeight = Math.min(260, Math.max(30, Math.round(roomResize.startHeight + deltaPx)));
  roomResize.el.style.height = `${newHeight}px`;
  roomResize.lastHeight = newHeight;
}
function onRoomResizeEnd() {
  if (!roomResize) return;
  document.removeEventListener('mousemove', onRoomResizeMove);
  document.removeEventListener('mouseup', onRoomResizeEnd);
  document.body.classList.remove('seat-room-dragging');
  const { type, side, index, lastHeight } = roomResize;
  if (lastHeight) {
    const next = cloneRoom(roomConfig);
    if (type === 'window') next.windows[side][index].height = lastHeight;
    else next.door.height = lastHeight;
    roomConfig = normalizeRoom(next);
  }
  roomResize = null;
  render();
  showToast('Đã đổi kích thước — bấm "Lưu sơ đồ" để lưu lại.', 'info');
}

function handleFrontDrop(targetIdx) {
  if (!canEditSeating() || !editMode) return;
  if (dragFrontIndex === null || dragFrontIndex === targetIdx) { dragFrontIndex = null; return; }
  const next = cloneRoom(roomConfig);
  const tmp = next.front[targetIdx];
  next.front[targetIdx] = next.front[dragFrontIndex];
  next.front[dragFrontIndex] = tmp;
  // Cửa vật lý ở tường trái/phải tự đồng bộ theo vị trí mới của ô "CỬA RA VÀO"
  const doorIdx = next.front.findIndex(f => f.key === 'door');
  if (doorIdx === 0) next.door.side = 'left';
  else if (doorIdx === 2) next.door.side = 'right';
  roomConfig = normalizeRoom(next);
  dragFrontIndex = null;
  render();
  showToast('Đã đổi vị trí — bấm "Lưu sơ đồ" để lưu lại.', 'info');
}

function handleReset() {
  if (!canEditSeating()) return;
  if (!editMode) { showToast('Bấm "Bật sửa" trước khi khôi phục sơ đồ.', 'warn'); return; }
  if (!window.confirm('Khôi phục sơ đồ mặc định?')) return;
  commitSeatState(cloneState(SEAT_DEFAULT));
}

function handleRandom() {
  if (!canEditSeating()) return;
  if (!editMode) { showToast('Bấm "Bật sửa" trước khi random chỗ ngồi.', 'warn'); return; }
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
  if (names.length < 2) { showToast('Không đủ học sinh để random.', 'warn'); return; }
  const shuffled = names.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  let next = cloneState(seatState);
  positions.forEach((pos, i) => { next = withSeatSet(next, pos, shuffled[i]); });
  commitSeatState(next);
  showToast('Đã random chỗ ngồi cục bộ. Bấm Lưu sơ đồ để lưu lại.', 'success');
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
  const wasBlocked = !canViewSeating(publishConfig.status || 'private', publishConfig.previewStudents || publishConfig.preview_students || '');
  const title = sheets.find(i => i.id === currentId)?.title || '';
  const access = await gasGetAccess(currentId, title);
  if (!access) { updateSeatCountdownText(); return; } // lỗi mạng tạm thời — thử lại lượt sau
  publishConfig = access;
  const isBlockedNow = !canViewSeating(publishConfig.status || 'private', publishConfig.previewStudents || publishConfig.preview_students || '');

  if (wasBlocked && !isBlockedNow) {
    const newStatus = publishConfig.status || 'private';
    const res = await gasGetChart(currentId || '');
    if (res.chart?.layout?.seats) {
      seatState = { left: normalizeRows(res.chart.layout.seats.left), right: normalizeRows(res.chart.layout.seats.right) };
      saveSeatState(seatState);
    }
    showToast(newStatus === 'preview' ? 'Bạn vừa được thêm vào danh sách xem trước.' : 'Sơ đồ vừa được công bố.', 'success');
    render();
  } else if (!wasBlocked && isBlockedNow) {
    showToast('Sơ đồ đã được chuyển về chế độ riêng tư.', 'warn');
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
      roomConfig = normalizeRoom(res.chart?.layout?.room);
      publishConfig = await gasGetAccess(currentId, active.title);
    } else {
      // Sheet SEATING CHART chưa có sơ đồ nào — vẫn hiện dữ liệu mặc định
      // cục bộ; bấm "Lưu sơ đồ" sẽ tạo dòng đầu tiên thật trên Sheet.
      sheets = [];
      currentId = '';
      roomConfig = normalizeRoom(null);
      publishConfig = { status: 'private' };
    }
    render();
  } catch (e) {
    dataSource = 'local';
    showToast('Không kết nối được Google Sheets — đang dùng dữ liệu cục bộ.', 'warn');
  }

  startAccessPolling();
}

/* ---------- Fit-to-screen: scale .seat-board để vừa .seat-board-wrap ----------
   Chạy sau mỗi render() và khi cửa sổ thay đổi kích thước. CSS overflow:hidden
   loại scrollbar; transform:scale() thu nhỏ nội dung thay vì cắt bỏ.          */
function fitBoard() {
  const wrap  = document.querySelector('.seat-board-wrap');
  const board = document.querySelector('.seat-board');
  if (!wrap || !board) return;
  // Reset về 1 để đo kích thước tự nhiên
  board.style.transform = '';
  board.style.transformOrigin = '';
  const wW = wrap.clientWidth;
  const wH = wrap.clientHeight;
  const bW = board.scrollWidth;
  const bH = board.scrollHeight;
  const scaleX = wW / bW;
  const scaleY = wH / bH;
  const scale  = Math.min(scaleX, scaleY, 1); // không phóng to, chỉ thu nhỏ
  if (scale < 1) {
    board.style.transformOrigin = 'top left';
    board.style.transform = `scale(${scale})`;
    // Co wrapper lại đúng kích thước sau scale để không xuất hiện khoảng trắng
    board.style.width  = `${100 / scale}%`;
    board.style.height = `${100 / scale}%`;
  } else {
    board.style.width  = '';
    board.style.height = '';
  }
}

let _fitBoardTimer = null;
function scheduleFitBoard() {
  clearTimeout(_fitBoardTimer);
  _fitBoardTimer = setTimeout(fitBoard, 40);
}

function initSeating(opts = {}) {
  gasUrl = opts.gasUrl || null;
  userRole = opts.userRole || null;
  window.addEventListener('resize', scheduleFitBoard);
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
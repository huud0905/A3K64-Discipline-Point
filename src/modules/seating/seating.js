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

/* ---------- App state ---------- */
let seatState     = loadSeatState();
let sheets        = ensureDb(loadSeatState());
let currentId     = currentSheetId(sheets);
let query         = '';
let editMode      = false;
let selectOpen    = false;
let modal         = null;   // null | 'create' | 'publish' | 'manage'
let notifDismissed = false;
let dragPayload   = null;   // { type, name, pos? }
let toastTimer    = null;

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

/* ---------- Toast ---------- */
function showToast(msg) {
  let el = document.getElementById('seat-toast-el');
  if (!el) { el = document.createElement('div'); el.id = 'seat-toast-el'; el.className = 'seat-toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { if (el) el.style.display = 'none'; }, 1800);
}

/* ============================================================
   RENDER — one big re-render, patching only what changed
   ============================================================ */
function render() {
  const root = document.getElementById('seating-root');
  if (!root) return;

  const currentTitle = sheets.find(i => i.id === currentId)?.title || 'Sơ đồ 1';
  const publishConfig = readPublish(currentId);
  const q = seatNorm(query);
  const allAssigned = seatAllAssigned(seatState);
  const filteredStudents = SEAT_STUDENTS.filter(name => !q || seatNorm(name).includes(q));

  root.innerHTML = `
<div class="seat-app">
  <!-- ── Toolbar ── -->
  <div class="seat-toolbar">
    <div class="seat-heading">
      <div>
        <h1>SƠ ĐỒ CHỖ NGỒI LỚP 11A3</h1>
        <p>Bật sửa rồi kéo tên từ danh sách bên trái vào ghế</p>
      </div>
    </div>
    <div class="seat-tools">
      <button id="btn-publish">${publishConfig.status === 'published' ? 'Công bố ✓' : 'Công bố'}</button>
      <button id="btn-manage">QL</button>
      <div class="seat-select${selectOpen ? ' open' : ''}" id="sheet-select">
        <button class="seat-select-trigger" id="btn-sheet-trigger">
          <span>${escH(currentTitle)}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div class="seat-select-menu">
          ${sheets.map(item => `
            <button class="seat-select-option${item.id === currentId ? ' active' : ''}" data-sheet-id="${escH(item.id)}">${escH(item.title || 'Sơ đồ')}</button>
          `).join('')}
        </div>
      </div>
      <button id="btn-save" class="primary">Lưu sơ đồ</button>
      <button id="btn-create">Tạo sơ đồ mới</button>
      <input id="seat-search" value="${escH(query)}" placeholder="Tìm học sinh..." />
      <button id="btn-edit" class="${editMode ? 'primary' : ''}">${editMode ? 'Đang sửa' : 'Bật sửa'}</button>
      <button id="btn-reset">Khôi phục</button>
      <button id="btn-random">Random</button>
      <button id="btn-print">Xuất/in</button>
    </div>
  </div>

  <!-- ── Main ── -->
  <div class="seat-main">
    <!-- Sidebar -->
    <div class="seat-side-col">
      ${!notifDismissed ? `
        <div class="seat-notif">
          <div class="seat-notif-head">
            <strong>Thông báo</strong>
            <button id="btn-notif-close" title="Đóng">×</button>
          </div>
          <div class="seat-notif-empty">Chưa có thông báo.</div>
        </div>` : ''}
      <aside class="seat-students">
        <div class="seat-students-head">
          <div>
            <strong>Danh sách học sinh</strong>
            <span>Kéo tên vào ô ghế để đổi chỗ nhanh</span>
          </div>
          <span class="seat-badge">${SEAT_STUDENTS.length}</span>
        </div>
        <div class="seat-student-list">
          ${filteredStudents.length === 0
            ? `<div class="seat-notif-empty">Không tìm thấy học sinh.</div>`
            : filteredStudents.map(name => {
                const pos = findSeat(seatState, name);
                const label = pos ? `${pos.side === 'left' ? 'Trái' : 'Phải'} · Bàn ${pos.row + 1}` : 'Chưa xếp';
                const hit = Boolean(q && seatNorm(name).includes(q));
                return `<div class="seat-student-card${hit ? ' highlight' : ''}" draggable="${editMode}" data-student="${escH(name)}">
                  <span>${escH(name)}</span><small>${label}</small>
                </div>`;
              }).join('')
          }
        </div>
        ${allAssigned ? `<div class="seat-students-note">Tất cả học sinh đã có chỗ ngồi.</div>` : ''}
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
    </div>
  </div>
</div>

<!-- ── Modal ── -->
${renderModal(currentTitle, publishConfig)}
`;

  bindEvents();
}

function escH(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

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
            draggable="${editMode}"
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
  on('btn-notif-close', () => { notifDismissed = true; render(); });

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
  if (backdrop) backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });

  on('modal-cancel', closeModal);

  if (modal === 'create') {
    const inp = document.getElementById('modal-title-input');
    if (inp) { inp.focus(); inp.select(); }
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') doCreateSheet(); });
    on('modal-confirm', doCreateSheet);
  }

  if (modal === 'publish') {
    on('modal-confirm', () => {
      const sel = document.getElementById('modal-publish-select');
      if (!sel) return;
      writePublish(currentId, { status: sel.value });
      showToast(sel.value === 'published' ? 'Đã công bố sơ đồ.' : 'Đã chuyển về riêng tư.');
      closeModal();
    });
  }

  if (modal === 'manage') {
    on('modal-edit-settings', () => openModal('publish'));
    on('modal-toggle', () => {
      const cfg = readPublish(currentId);
      const next = cfg.status === 'published' ? 'private' : 'published';
      writePublish(currentId, { status: next });
      showToast(next === 'published' ? 'Đã công bố sơ đồ.' : 'Đã chuyển về riêng tư.');
      closeModal();
    });
  }
}

function on(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}
function openModal(kind) { modal = kind; render(); }
function closeModal() { modal = null; render(); }
function closeSelect() { if (selectOpen) { selectOpen = false; render(); } }

/* ---------- Handlers ---------- */
function commitSeatState(next) { seatState = next; saveSeatState(next); render(); }

function applySheet(item) {
  if (!item?.layout?.seats) return;
  seatState = { left: normalizeRows(item.layout.seats.left), right: normalizeRows(item.layout.seats.right) };
  saveSeatState(seatState);
  currentId = item.id;
  localStorage.setItem(SEAT_CURRENT_KEY, item.id);
  render();
  showToast(`Đã mở "${item.title || 'sơ đồ'}".`);
}

function handleSaveSheet() {
  const title = sheets.find(i => i.id === currentId)?.title || 'Sơ đồ hiện tại';
  const { items, item } = saveSheet(sheets, currentId, title, seatState);
  sheets = items; currentId = item.id;
  render();
  showToast('Đã lưu sơ đồ.');
}

function doCreateSheet() {
  const inp = document.getElementById('modal-title-input');
  const title = (inp?.value || '').trim();
  if (!title) { inp?.focus(); return; }
  const { items, item } = saveSheet(sheets, null, title, seatState);
  writePublish(item.id, { status: 'private' });
  sheets = items;
  modal = null;
  applySheet(item);
  showToast('Đã tạo sơ đồ mới.');
}

function handleReset() {
  if (!window.confirm('Khôi phục sơ đồ mặc định?')) return;
  commitSeatState(cloneState(SEAT_DEFAULT));
}

function handleRandom() {
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
  if (!dragPayload || !dragPayload.name) return;
  commitSeatState(withSeatMove(seatState, dragPayload, target));
  dragPayload = null;
}

/* ---------- Boot ---------- */
render();
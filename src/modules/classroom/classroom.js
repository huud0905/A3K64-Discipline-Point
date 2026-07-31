/* ============================================================
   A3K64 — Classroom / Sơ đồ lớp App (vanilla JS)
   ============================================================ */

const CLASS_ROSTER_KEY = 'a3k64-classroom-roster-v1';
const CLASS_SEATS_KEY  = 'a3k64-classroom-seats-v1';
const FULL_ACCESS_ROLES = ['gvcn', 'lop_truong', 'bi_thu'];

const SEATS_PER_ROW = 4;
const DEFAULT_ROWS  = 4;
const MIN_ROWS = 2;
const MAX_ROWS = 8;

const ICONS = {
  plus:    `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  shuffle: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>`,
  reset:   `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`,
  x:       `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  print:   `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`,
  publish: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>`,
};

/* ---- state ---- */
let opts = { userRole: 'hoc_sinh', userName: null, userGroup: null, gasUrl: null };
let roster = [];                 // [{ id, name }]
let seats  = {};                 // { "r-c": studentId }
let rowCount = DEFAULT_ROWS;
let selectedStudentId = null;    // click-to-place fallback (touch friendly)
let dragStudentId = null;
let chartId = null;              // id của sơ đồ trên sheet SEATING CHART (nếu có)
let chartTitle = 'Sơ đồ lớp 12A3';
let gasSaveTimer = null;
let saveState = 'idle';          // 'idle' | 'saving' | 'saved' | 'offline'

/* ---- công bố / xem trước (publish & preview access) ---- */
let access = {
  status: 'private',            // 'private' | 'preview' | 'published'
  revision: 0,
  previewStudents: '',          // danh sách tên, phân tách bằng dấu phẩy — dùng khi status = 'preview'
  publishAt: '',                // ISO string — hẹn giờ công bố (khi status = 'published')
  previewMode: 'view',          // 'view' | 'edit' — HS xem trước có được sửa không
};
let watchTimer = null;
let publishPanelOpen = false;

function canEdit() { return FULL_ACCESS_ROLES.includes(String(opts.userRole || 'hoc_sinh')); }
// Ai được phép công bố / đổi trạng thái xem trước — dùng chung quyền với canEdit()
function canPublish() { return canEdit(); }

function normalizeName(v) {
  return String(v || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/\s+/g, ' ');
}

// Người xem hiện tại có nằm trong danh sách "xem trước" không.
function isPreviewedViewer() {
  const me = normalizeName(opts.userName);
  if (!me || !access.previewStudents) return false;
  return access.previewStudents.split(',').map(normalizeName).filter(Boolean).includes(me);
}

// true nếu người dùng hiện tại được phép NHÌN THẤY sơ đồ (khác với canEdit — quyền sửa).
function canView() {
  if (canEdit()) return true;
  if (access.status === 'published') {
    if (access.publishAt && new Date(access.publishAt).getTime() > Date.now()) return false; // hẹn giờ, chưa tới
    return true;
  }
  if (access.status === 'preview') return isPreviewedViewer();
  return false; // private
}

// HS xem trước có bật quyền chỉnh sửa tạm thời không (preview + previewMode=edit).
function canEditAsPreviewer() {
  return !canEdit() && access.status === 'preview' && isPreviewedViewer() && access.previewMode === 'edit';
}
// Được phép xếp/đổi chỗ ngay bây giờ — GVCN/lớp trưởng/bí thư luôn được,
// hoặc học sinh đang xem trước với quyền chỉnh sửa tạm thời (previewMode='edit').
function canPlaceSeats() { return canEdit() || canEditAsPreviewer(); }

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(-2);
  return parts.map(p => p[0]?.toUpperCase()).join('') || '?';
}

function uid() { return 'st_' + Math.random().toString(36).slice(2, 9); }

/* ---- persistence ---- */
function loadState() {
  try { roster = JSON.parse(localStorage.getItem(CLASS_ROSTER_KEY) || '[]'); }
  catch { roster = []; }

  try {
    const saved = JSON.parse(localStorage.getItem(CLASS_SEATS_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      rowCount = Math.min(MAX_ROWS, Math.max(MIN_ROWS, saved.rows || DEFAULT_ROWS));
      seats = saved.seats || {};
    } else {
      rowCount = DEFAULT_ROWS;
      seats = {};
    }
  } catch { rowCount = DEFAULT_ROWS; seats = {}; }

  // Seed a starter roster once, so the board isn't empty on first run.
  if (!roster.length && !localStorage.getItem(CLASS_ROSTER_KEY)) {
    roster = [
      { id: uid(), name: 'Nguyễn Thị Hằng' },
      { id: uid(), name: 'Nguyễn Minh Thiện' },
      { id: uid(), name: 'Nguyễn Ngọc Hiếu' },
      { id: uid(), name: 'Đinh Mạnh Hữu' },
    ];
    saveRoster();
  }
}

function saveRoster() {
  try { localStorage.setItem(CLASS_ROSTER_KEY, JSON.stringify(roster)); } catch {}
}
function saveSeats() {
  try { localStorage.setItem(CLASS_SEATS_KEY, JSON.stringify({ rows: rowCount, seats })); } catch {}
}

/* ---- GAS sync (Google Sheets — sheet SEATING CHART) ---- */
function gasUrl() { return opts.gasUrl || null; }

async function fetchChartFromGas() {
  const url = gasUrl();
  if (!url) return null;
  try {
    const u = new URL(url);
    u.searchParams.set('action', 'getSeatingChart');
    if (chartId) u.searchParams.set('id', chartId);
    u.searchParams.set('t', String(Date.now()));
    const res = await fetch(u.toString(), { method: 'GET', redirect: 'follow' });
    return await res.json();
  } catch { return null; }
}

// Ghi lên Google Sheets (debounce nhẹ để gộp các thay đổi liên tiếp:
// kéo-thả nhiều học sinh, xoá hàng loạt, v.v.)
function queueGasSave() {
  if (!gasUrl() || !canPlaceSeats()) return;
  saveState = 'saving';
  updateSaveIndicator();
  if (gasSaveTimer) clearTimeout(gasSaveTimer);
  // Debounce nhẹ để gộp các thay đổi liên tiếp (tự động lưu — không cần bấm nút).
  gasSaveTimer = setTimeout(saveChartToGas, 700);
}

async function saveChartToGas() {
  const url = gasUrl();
  if (!url) return;
  try {
    const body = JSON.stringify({
      action: 'saveSeatingChart',
      id: chartId || undefined,
      title: chartTitle,
      makeActive: true,
      layout: { seats, roster, room: { rows: rowCount, seatsPerRow: SEATS_PER_ROW }, version: 1 },
      actor: { name: opts.userName, role: opts.userRole },
    });
    const res = await fetch(url, { method: 'POST', body });
    const json = await res.json();
    const chart = json?.data?.chart;
    if (chart?.id) chartId = chart.id;
    saveState = 'saved';
  } catch {
    // offline: vẫn còn bản lưu ở localStorage
    saveState = 'offline';
  }
  updateSaveIndicator();
}

// Cập nhật chữ "Đã lưu / Đang lưu..." trên toolbar mà không phải render lại toàn bộ cây DOM.
function updateSaveIndicator() {
  const el = document.getElementById('save-indicator');
  if (!el) return;
  const map = {
    saving: '💾 Đang lưu…',
    saved:  '✅ Đã lưu tự động',
    offline:'⚠️ Chưa lưu — mất kết nối',
    idle:   '',
  };
  el.textContent = map[saveState] || '';
}

/* ---- công bố / xem trước — đọc & ghi qua backend (getSeatingAccess / saveSeatingAccess) ---- */
async function fetchAccessFromGas() {
  const url = gasUrl();
  if (!url) return null;
  try {
    const u = new URL(url);
    u.searchParams.set('action', 'getSeatingAccess');
    if (chartId) u.searchParams.set('chartId', chartId);
    if (chartTitle) u.searchParams.set('chartTitle', chartTitle);
    u.searchParams.set('t', String(Date.now()));
    const res = await fetch(u.toString(), { method: 'GET', redirect: 'follow' });
    const json = await res.json();
    return json?.access || json?.data?.access || null;
  } catch { return null; }
}

function applyAccess(a) {
  if (!a) return;
  access = {
    status: a.status || 'private',
    revision: Number(a.revision ?? a.access_revision ?? 0) || 0,
    previewStudents: a.previewStudents || a.preview_students || '',
    publishAt: a.publishAt || a.publish_at || '',
    previewMode: a.previewMode || a.preview_mode || 'view',
  };
}

async function loadAccess() {
  const a = await fetchAccessFromGas();
  if (a) applyAccess(a);
}

async function saveAccessToGas(next) {
  const url = gasUrl();
  if (!url || !canPublish()) return;
  const body = JSON.stringify({
    action: 'saveSeatingAccess',
    chartId, chartTitle,
    status: next.status,
    previewStudents: next.previewStudents || '',
    publishAt: next.publishAt || '',
    previewMode: next.previewMode || 'view',
    actor: { name: opts.userName, role: opts.userRole },
  });
  try {
    const res = await fetch(url, { method: 'POST', body });
    const json = await res.json();
    const a = json?.access || json?.data?.access;
    if (a) applyAccess(a);
  } catch { /* giữ nguyên trạng thái cục bộ nếu mất mạng */ }
  publishPanelOpen = false;
  render();
}

// Theo dõi thay đổi công bố từ người khác (GVCN công bố trên máy khác) — poll nhẹ mỗi 10s.
function startWatchAccess() {
  if (!gasUrl() || watchTimer) return;
  watchTimer = setInterval(async () => {
    const url = gasUrl();
    if (!url) return;
    try {
      const u = new URL(url);
      u.searchParams.set('action', 'watchSeatingChart');
      if (chartId) u.searchParams.set('chartId', chartId);
      if (chartTitle) u.searchParams.set('chartTitle', chartTitle);
      u.searchParams.set('t', String(Date.now()));
      const res = await fetch(u.toString(), { method: 'GET', redirect: 'follow' });
      const json = await res.json();
      const rev = Number(json?.revision ?? json?.access?.revision ?? 0) || 0;
      if (rev !== access.revision) {
        applyAccess(json?.access || json);
        // Nếu vừa được công bố/xem trước, tải lại sơ đồ mới nhất luôn.
        await loadChartFromGas();
        render();
      }
    } catch { /* bỏ qua lỗi mạng tạm thời */ }
  }, 10000);
}

// Nạp sơ đồ từ Google Sheets (nếu có cấu hình gasUrl); trả về true nếu
// nạp thành công và đã cập nhật state cục bộ.
async function loadChartFromGas() {
  const json = await fetchChartFromGas();
  const chart = json?.data?.chart;
  if (!json?.data?.success || !chart || !chart.layout) return false;

  chartId = chart.id || chartId;
  const layout = chart.layout || {};
  if (Array.isArray(layout.roster)) roster = layout.roster;
  if (layout.seats && typeof layout.seats === 'object') seats = layout.seats;
  const rows = layout.room?.rows;
  if (rows) rowCount = Math.min(MAX_ROWS, Math.max(MIN_ROWS, rows));

  saveRoster();
  saveSeats();
  return true;
}

/* ---- roster helpers ---- */
function studentById(id) { return roster.find(s => s.id === id) || null; }
function seatKeyOf(studentId) {
  return Object.keys(seats).find(k => seats[k] === studentId) || null;
}
function isSeated(studentId) { return !!seatKeyOf(studentId); }

function addStudent(name) {
  const clean = name.trim();
  if (!clean || !canEdit()) return;
  roster.push({ id: uid(), name: clean });
  saveRoster();
  queueGasSave();
  render();
}

function removeStudent(id) {
  if (!canEdit()) return;
  const key = seatKeyOf(id);
  if (key) delete seats[key];
  roster = roster.filter(s => s.id !== id);
  saveRoster();
  saveSeats();
  queueGasSave();
  if (selectedStudentId === id) selectedStudentId = null;
  render();
}

function placeStudent(studentId, seatKey) {
  if (!canPlaceSeats() || !studentId) return;
  const prevKey = seatKeyOf(studentId);
  if (prevKey) delete seats[prevKey];
  // If seat already occupied, swap the occupant back to unseated.
  if (seats[seatKey] && seats[seatKey] !== studentId) {
    // no-op: previous occupant simply becomes unseated (removed from seats map)
  }
  seats[seatKey] = studentId;
  saveSeats();
  queueGasSave();
  selectedStudentId = null;
  render();
}

function unseat(seatKey) {
  if (!canPlaceSeats()) return;
  delete seats[seatKey];
  saveSeats();
  queueGasSave();
  render();
}

function shuffleSeats() {
  if (!canEdit()) return;
  const ids = roster.map(s => s.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const keys = allSeatKeys();
  seats = {};
  ids.slice(0, keys.length).forEach((id, i) => { seats[keys[i]] = id; });
  saveSeats();
  queueGasSave();
  render();
}

function clearSeats() {
  if (!canEdit()) return;
  seats = {};
  saveSeats();
  queueGasSave();
  render();
}

function allSeatKeys() {
  const keys = [];
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < SEATS_PER_ROW; c++) keys.push(`${r}-${c}`);
  }
  return keys;
}

function addRow() {
  if (!canEdit() || rowCount >= MAX_ROWS) return;
  rowCount++; saveSeats(); queueGasSave(); render();
}
function removeRow() {
  if (!canEdit() || rowCount <= MIN_ROWS) return;
  // Unseat anyone in the row being dropped.
  const r = rowCount - 1;
  for (let c = 0; c < SEATS_PER_ROW; c++) delete seats[`${r}-${c}`];
  rowCount--; saveSeats(); queueGasSave(); render();
}

/* ---- render ---- */
function root() { return document.getElementById('classroom-root'); }

function render() {
  const editable = canEdit();
  const el = root();

  if (!canView()) {
    el.innerHTML = renderBlockedNotice();
    return;
  }

  el.innerHTML = `
    <div class="classroom-app">
      ${renderSidebar(editable)}
      ${renderMain(editable)}
    </div>
    ${canPublish() && publishPanelOpen ? renderPublishPanel() : ''}`;
  wireEvents(editable);
  updateSaveIndicator();
}

// Màn hình hiển thị cho HS khi sơ đồ chưa công bố / chưa tới lượt xem trước.
function renderBlockedNotice() {
  const scheduled = access.status === 'published' && access.publishAt && new Date(access.publishAt).getTime() > Date.now();
  const title = scheduled ? 'Sơ đồ sẽ được công bố' : 'Sơ đồ lớp chưa được công bố';
  const sub = scheduled
    ? `Dự kiến công bố lúc ${new Date(access.publishAt).toLocaleString('vi-VN')}.`
    : 'GVCN/lớp trưởng/bí thư chưa công bố hoặc chưa thêm bạn vào danh sách xem trước.';
  return `
    <div class="classroom-blocked">
      <div class="classroom-blocked-card">
        <div class="classroom-blocked-icon">🔒</div>
        <h2>${title}</h2>
        <p>${sub}</p>
      </div>
    </div>`;
}

function renderSidebar(editable) {
  const unseated = roster.filter(s => !isSeated(s.id));
  const seatedCount = roster.length - unseated.length;

  return `
    <aside class="classroom-sidebar">
      <div class="sidebar-title">
        <span>Sơ đồ lớp</span>
        <strong>Danh sách học sinh</strong>
        <small>${roster.length} học sinh · ${seatedCount} đã xếp chỗ</small>
      </div>

      ${editable ? `
      <div class="roster-add">
        <input id="roster-add-input" type="text" placeholder="Tên học sinh mới…" maxlength="40" />
        <button id="roster-add-btn">${ICONS.plus}</button>
      </div>` : ''}

      <div class="roster-list">
        ${roster.length ? roster.map(s => `
          <div class="roster-chip ${isSeated(s.id) ? 'seated' : ''}" data-student="${s.id}" ${canPlaceSeats() ? 'draggable="true"' : ''}>
            <div class="avatar">${initials(s.name)}</div>
            <div class="info">
              <b>${escapeHtml(s.name)}</b>
              <small>${isSeated(s.id) ? 'Đã xếp chỗ' : (editable ? 'Kéo hoặc bấm để xếp chỗ' : 'Chưa xếp chỗ')}</small>
            </div>
            ${editable ? `<button class="remove" data-remove="${s.id}" title="Xoá học sinh">${ICONS.x}</button>` : ''}
          </div>
        `).join('') : `<div class="roster-empty">Chưa có học sinh nào.</div>`}
      </div>

      ${!editable ? `
      <div class="readonly-note">
        Bạn đang xem ở chế độ chỉ đọc. Chỉ GVCN, lớp trưởng hoặc bí thư mới có thể chỉnh sơ đồ chỗ ngồi.
      </div>` : ''}
    </aside>`;
}

function renderMain(editable) {
  const placeAllowed = canPlaceSeats();
  return `
    <section class="classroom-main">
      ${renderAccessBanner()}
      <div class="classroom-toolbar">
        <div>
          <h1>${escapeHtml(chartTitle)}</h1>
          <p>${placeAllowed ? 'Kéo học sinh vào chỗ trống, hoặc bấm chọn rồi bấm vào chỗ ngồi.' : 'Xem vị trí chỗ ngồi hiện tại của lớp.'}</p>
        </div>
        <div class="toolbar-actions">
          <span id="save-indicator" class="save-indicator"></span>
          <button class="toolbar-btn" id="print-btn" title="In / xuất khổ A4">${ICONS.print} In A4</button>
          ${editable ? `
            <div class="rows-stepper">
              <span>Số dãy bàn</span>
              <button id="row-minus" ${rowCount <= MIN_ROWS ? 'disabled' : ''}>−</button>
              <strong>${rowCount}</strong>
              <button id="row-plus" ${rowCount >= MAX_ROWS ? 'disabled' : ''}>+</button>
            </div>
            <button class="toolbar-btn" id="shuffle-btn">${ICONS.shuffle} Xếp ngẫu nhiên</button>
            <button class="toolbar-btn" id="clear-btn">${ICONS.reset} Xoá chỗ ngồi</button>
          ` : ''}
          ${canPublish() ? `
            <button class="toolbar-btn primary" id="publish-btn">${ICONS.publish} Công bố</button>
          ` : ''}
        </div>
      </div>

      <div class="classroom-board-wrap" id="print-area">
        <div class="blackboard">Bảng</div>
        <div class="seat-grid">
          ${renderRows(editable)}
        </div>
      </div>
    </section>`;
}

// Dải thông báo trạng thái công bố — hiển thị cho cả người xem lẫn người chỉnh sửa.
function renderAccessBanner() {
  if (canEdit()) {
    const label = { private: 'Riêng tư — chỉ GVCN/cán bộ lớp thấy', preview: 'Đang xem trước', published: 'Đã công bố' }[access.status] || '';
    return `<div class="access-banner access-${access.status}"><span>${label}</span></div>`;
  }
  if (access.status === 'preview') {
    return `<div class="access-banner access-preview"><span>👀 Bạn đang xem thử sơ đồ — GVCN có thể thay đổi trước khi công bố chính thức.${access.previewMode === 'edit' ? ' Bạn được phép thử xếp chỗ.' : ''}</span></div>`;
  }
  return '';
}

// Bảng điều khiển công bố / xem trước (GVCN, lớp trưởng, bí thư).
function renderPublishPanel() {
  const st = access.status;
  return `
    <div class="publish-overlay" id="publish-overlay">
      <div class="publish-panel">
        <div class="publish-head">
          <h2>Công bố sơ đồ lớp</h2>
          <button class="publish-close" id="publish-close">${ICONS.x}</button>
        </div>

        <div class="publish-body">
          <label class="publish-option ${st === 'private' ? 'active' : ''}">
            <input type="radio" name="pub-status" value="private" ${st === 'private' ? 'checked' : ''}/>
            <div><b>Riêng tư</b><small>Chỉ GVCN, lớp trưởng, bí thư nhìn thấy.</small></div>
          </label>
          <label class="publish-option ${st === 'preview' ? 'active' : ''}">
            <input type="radio" name="pub-status" value="preview" ${st === 'preview' ? 'checked' : ''}/>
            <div><b>Xem trước</b><small>Chỉ những học sinh được chọn bên dưới mới xem được.</small></div>
          </label>
          <label class="publish-option ${st === 'published' ? 'active' : ''}">
            <input type="radio" name="pub-status" value="published" ${st === 'published' ? 'checked' : ''}/>
            <div><b>Công bố</b><small>Cả lớp đều xem được.</small></div>
          </label>

          <div class="publish-field" id="preview-students-field" style="${st === 'preview' ? '' : 'display:none'}">
            <label>Học sinh được xem trước (cách nhau bằng dấu phẩy)</label>
            <textarea id="preview-students-input" rows="2" placeholder="Nguyễn Văn A, Trần Thị B">${escapeHtml(access.previewStudents)}</textarea>
            <label class="publish-checkbox">
              <input type="checkbox" id="preview-edit-toggle" ${access.previewMode === 'edit' ? 'checked' : ''}/>
              Cho phép các bạn này thử xếp chỗ (chỉ xem trước, không ảnh hưởng bản chính thức nếu tắt tự động lưu)
            </label>
          </div>

          <div class="publish-field" id="publish-at-field" style="${st === 'published' ? '' : 'display:none'}">
            <label>Hẹn giờ công bố (tuỳ chọn — để trống nếu công bố ngay)</label>
            <input type="datetime-local" id="publish-at-input" value="${access.publishAt ? toLocalInputValue(access.publishAt) : ''}"/>
          </div>
        </div>

        <div class="publish-actions">
          <button class="toolbar-btn" id="publish-cancel">Huỷ</button>
          <button class="toolbar-btn primary" id="publish-save">Lưu</button>
        </div>
      </div>
    </div>`;
}

function toLocalInputValue(iso) {
  try {
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return ''; }
}

function renderRows(editable) {
  let html = '';
  for (let r = 0; r < rowCount; r++) {
    html += `<div class="seat-row">`;
    for (let c = 0; c < SEATS_PER_ROW; c++) {
      const key = `${r}-${c}`;
      const studentId = seats[key];
      const student = studentId ? studentById(studentId) : null;
      const isSelf = student && opts.userName && student.name.trim().toLowerCase() === String(opts.userName).trim().toLowerCase();
      html += renderSeat(key, student, editable, isSelf);
      if (c === 1) html += `<div class="aisle"></div>`;
    }
    html += `</div>`;
  }
  return html;
}

function renderSeat(key, student, editable, isSelf) {
  const cls = ['seat'];
  if (student) cls.push('occupied');
  if (canPlaceSeats()) cls.push('editable');
  if (isSelf) cls.push('self-seat');

  return `
    <div class="${cls.join(' ')}" data-seat="${key}">
      ${student ? `
        <div class="avatar">${initials(student.name)}</div>
        <div class="seat-name">${escapeHtml(student.name)}</div>
        ${isSelf ? `<div class="seat-role">Bạn</div>` : ''}
      ` : `
        <div class="seat-empty-icon">${ICONS.plus}</div>
        <div class="seat-label">Trống</div>
      `}
    </div>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[ch]));
}

/* ---- events ---- */
function wireEvents(editable) {
  const addBtn = document.getElementById('roster-add-btn');
  const addInput = document.getElementById('roster-add-input');
  if (addBtn && addInput) {
    const submit = () => { addStudent(addInput.value); };
    addBtn.addEventListener('click', submit);
    addInput.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  }

  document.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      removeStudent(btn.getAttribute('data-remove'));
    });
  });

  document.getElementById('shuffle-btn')?.addEventListener('click', shuffleSeats);
  document.getElementById('clear-btn')?.addEventListener('click', clearSeats);
  document.getElementById('row-plus')?.addEventListener('click', addRow);
  document.getElementById('row-minus')?.addEventListener('click', removeRow);
  document.getElementById('print-btn')?.addEventListener('click', () => window.print());

  wirePublishPanel();

  if (!canPlaceSeats()) return;

  // Roster chip: click-to-select + drag source
  document.querySelectorAll('.roster-chip[data-student]').forEach(chip => {
    const id = chip.getAttribute('data-student');

    chip.addEventListener('click', () => {
      selectedStudentId = selectedStudentId === id ? null : id;
      render();
    });

    chip.addEventListener('dragstart', e => {
      dragStudentId = id;
      chip.classList.add('dragging');
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.effectAllowed = 'move';
    });
    chip.addEventListener('dragend', () => {
      dragStudentId = null;
      chip.classList.remove('dragging');
    });

    if (id === selectedStudentId) chip.style.outline = `2px solid var(--accent)`;
  });

  // Seats: drop target + click target + click-to-unseat
  document.querySelectorAll('.seat[data-seat]').forEach(seatEl => {
    const key = seatEl.getAttribute('data-seat');
    const occupied = seatEl.classList.contains('occupied');

    seatEl.addEventListener('dragover', e => { e.preventDefault(); seatEl.classList.add('drop-target'); });
    seatEl.addEventListener('dragleave', () => seatEl.classList.remove('drop-target'));
    seatEl.addEventListener('drop', e => {
      e.preventDefault();
      seatEl.classList.remove('drop-target');
      const id = e.dataTransfer.getData('text/plain') || dragStudentId;
      if (id) placeStudent(id, key);
    });

    seatEl.addEventListener('click', () => {
      if (selectedStudentId) {
        placeStudent(selectedStudentId, key);
      } else if (occupied) {
        unseat(key);
      }
    });
  });
}

/* ---- entry point (called from classroom-window.html) ---- */
async function initClassroom(userOpts = {}) {
  opts = { ...opts, ...userOpts };
  loadState();   // hiện dữ liệu cục bộ/cache ngay để không bị trắng màn hình
  render();

  if (gasUrl()) {
    const ok = await loadChartFromGas();
    if (ok) render();
  }
}
/* ---- wirePublishPanel (was missing from original) ---- */
function wirePublishPanel() {
  document.getElementById('publish-btn')?.addEventListener('click', () => {
    publishPanelOpen = true;
    render();
  });

  const overlay = document.getElementById('publish-overlay');
  if (!overlay) return;

  const closePanel = () => { publishPanelOpen = false; render(); };
  document.getElementById('publish-close')?.addEventListener('click', closePanel);
  document.getElementById('publish-cancel')?.addEventListener('click', closePanel);
  overlay.addEventListener('click', e => { if (e.target === overlay) closePanel(); });

  // Toggling status radio — show/hide sub-fields
  overlay.querySelectorAll('input[name="pub-status"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const val = radio.value;
      const previewField = document.getElementById('preview-students-field');
      const publishAtField = document.getElementById('publish-at-field');
      overlay.querySelectorAll('.publish-option').forEach(o => o.classList.toggle('active', o.querySelector('input')?.value === val));
      if (previewField)  previewField.style.display  = val === 'preview'   ? '' : 'none';
      if (publishAtField) publishAtField.style.display = val === 'published' ? '' : 'none';
    });
  });

  document.getElementById('publish-save')?.addEventListener('click', async () => {
    const statusEl = overlay.querySelector('input[name="pub-status"]:checked');
    const status = statusEl?.value || access.status;
    const previewStudents = document.getElementById('preview-students-input')?.value || '';
    const publishAt = document.getElementById('publish-at-input')?.value
      ? new Date(document.getElementById('publish-at-input').value).toISOString()
      : '';
    const previewMode = document.getElementById('preview-edit-toggle')?.checked ? 'edit' : 'view';

    const next = { status, previewStudents, publishAt, previewMode };
    applyAccess(next);
    await saveAccessToGas(next);
  });
}
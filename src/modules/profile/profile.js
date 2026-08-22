/* ═══════════════════════════════════════════════
   A3K64 — Profile Window (vanilla JS)
   ═══════════════════════════════════════════════ */

/* ── Data layer ──
   BUG CŨ: đọc GAS URL từ localStorage['a3k64-config'] — key này không
   tồn tại ở đâu trong hệ thống. Toàn bộ app (login.html, scoreboard-
   window.html) đều lấy URL từ window.A3K64_CONFIG.gasUrl, được inject
   bởi assets/js/config.js. Thiếu cả 2 điều này khiến GAS_API_URL luôn
   rỗng → Profile luôn rơi xuống dữ liệu mock rỗng (toàn số 0). */
const GAS_API_URL = (() => {
  try { return (window.A3K64_CONFIG && window.A3K64_CONFIG.gasUrl) || ''; } catch { return ''; }
})();

const LOCAL_EVENTS_KEY = 'scoreboard-local-events-v1';
const LOCAL_WEEKS_KEY  = 'scoreboard-local-weeks-v1';
const VTABS_KEY        = 'profile-vertical-tabs-v1';

let DATA = { students: [], events: [], weeks: [], source: 'loading' };

function normalize(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').replace(/\s+/g, ' ').trim().toLowerCase();
}
function formatScore(n) { return n > 0 ? `+${n}` : String(n); }
function givenName(name) { const p = name.trim().split(/\s+/); return p[p.length - 1] || name; }
function pad2(n) { return String(n).padStart(2, '0'); }
function categoryLabel(cat) {
  return cat === 'HOC_TAP' ? 'Học tập' : cat === 'NE_NEP' ? 'Nề nếp' : cat === 'PHONG_TRAO' ? 'Phong trào' : cat;
}
function getStatus(total) {
  if (total >= 50) return 'Tốt';
  if (total >= 0) return 'Khá';
  if (total >= -50) return 'Đạt';
  return 'Chưa đạt';
}
function isHiddenEvent(ev) { return String(ev.note || '').includes('__SHEET_TOTAL__'); }

/* ── Date parsing (BUG: "Thời gian" hiển thị sai) ──
   GAS/Sheet trả createdAt dạng chuỗi Việt hoá "HH:MM:SS DD/MM/YYYY"
   (giống 2 dòng log trong ảnh: "15:45:00 25/03/2026"). new Date(str)
   mặc định parse theo kiểu Mỹ MM/DD/YYYY, nên với ngày > 12 nó trả về
   Invalid Date, còn với ngày <= 12 nó ÂM THẦM đảo lộn ngày/tháng —
   đó là lý do "thời gian nhập" hiển thị sai mà không báo lỗi gì.
   Hàm dưới đây parse tay các định dạng thực tế trước khi fallback
   sang Date() gốc. */
function parseAnyDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === 'number') { const d = new Date(v); return isNaN(d) ? null : d; }
  const s = String(v).trim();

  // "HH:MM:SS DD/MM/YYYY" hoặc "DD/MM/YYYY HH:MM:SS" (dấu / hoặc -)
  let m = s.match(/^(\d{1,2}):(\d{2}):(\d{2})\s+(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) { const [, hh, mi, ss, dd, mo, yy] = m; return new Date(+yy, +mo - 1, +dd, +hh, +mi, +ss); }
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})[ ,T]+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (m) { const [, dd, mo, yy, hh, mi, ss] = m; return new Date(+yy, +mo - 1, +dd, +hh, +mi, +ss); }
  // "DD/MM/YYYY" không giờ
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) { const [, dd, mo, yy] = m; return new Date(+yy, +mo - 1, +dd); }

  // ISO chuẩn hoặc định dạng Date() nhận được thẳng (RFC2822, epoch string...)
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
function formatDateTime(v) {
  const d = parseAnyDate(v);
  return d ? d.toLocaleString('vi-VN') : '—';
}

function summarize(students, events, week) {
  const list = students.map(s => {
    const wEvs = events.filter(e => e.studentId === s.id && e.week === week);
    const visible = wEvs.filter(e => !isHiddenEvent(e));
    const total = wEvs.reduce((sum, e) => sum + e.points, 0);
    const positive = visible.filter(e => e.points > 0).reduce((sum, e) => sum + e.points, 0);
    const negative = visible.filter(e => e.points < 0).reduce((sum, e) => sum + e.points, 0);
    return { ...s, total, positive, negative, rank: 0, status: getStatus(total) };
  });
  const sorted = [...list].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'vi'));
  let rank = 0; let prev = null;
  sorted.forEach((s, i) => {
    if (prev === null || s.total !== prev) { rank = i + 1; prev = s.total; }
    const idx = list.findIndex(x => x.id === s.id);
    if (idx >= 0) list[idx].rank = rank;
  });
  return list;
}

function catTotal(events, cat) {
  return events.filter(e => e.category === cat).reduce((s, e) => s + e.points, 0);
}

function realWeeks() {
  const from = DATA.weeks.filter(w => Number.isFinite(w) && w > 0);
  const fromEvs = DATA.events.map(e => Number(e.week)).filter(w => Number.isFinite(w) && w > 0);
  return [...new Set([...from, ...fromEvs])].sort((a, b) => a - b);
}

function latestWeek() {
  const w = realWeeks();
  return w[w.length - 1] || 1;
}

function alphabetStudents(arr) {
  return [...arr].sort((a, b) => {
    const g = givenName(a.name).localeCompare(givenName(b.name), 'vi', { sensitivity: 'base' });
    return g || a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' });
  });
}

function studentTitle(id) {
  const sorted = alphabetStudents(DATA.students);
  const s = DATA.students.find(x => x.id === id) || sorted.find(x => x.id === id);
  const idx = Math.max(0, sorted.findIndex(x => x.id === id)) + 1;
  return `${pad2(idx)} – ${s?.name || 'Học sinh'}`;
}

/* ── Perf: cache dữ liệu GAS ngắn hạn ──
   BUG CŨ: mỗi lần loadData() chạy (mở app, refreshData, mở tab học sinh
   đầu tiên...) đều gọi fetch({cache:'no-cache'}) — ép trình duyệt bỏ qua
   cache và luôn round-trip lên GAS, dù dữ liệu vừa tải xong vài giây
   trước. Thêm cache bộ nhớ + sessionStorage với TTL ngắn để các lượt
   load liên tiếp (vd mở nhiều tab liền) dùng lại dữ liệu đã có, chỉ
   thật sự gọi mạng khi cache hết hạn hoặc người dùng bấm "Làm mới". */
const GAS_CACHE_KEY = 'a3k64-profile-gas-cache-v1';
const GAS_CACHE_TTL_MS = 20000;
let gasMemCache = null; // { data, ts }

function readGasCache() {
  if (gasMemCache && Date.now() - gasMemCache.ts < GAS_CACHE_TTL_MS) return gasMemCache.data;
  try {
    const raw = JSON.parse(sessionStorage.getItem(GAS_CACHE_KEY) || 'null');
    if (raw && Date.now() - raw.ts < GAS_CACHE_TTL_MS) { gasMemCache = raw; return raw.data; }
  } catch {}
  return null;
}
function writeGasCache(data) {
  gasMemCache = { data, ts: Date.now() };
  try { sessionStorage.setItem(GAS_CACHE_KEY, JSON.stringify(gasMemCache)); } catch {}
}

async function loadData(forceFresh) {
  // Try GAS
  if (GAS_API_URL) {
    const cached = !forceFresh && readGasCache();
    if (cached?.students?.length) {
      DATA = { students: cached.students, events: cached.events || [], weeks: cached.weeks?.length ? cached.weeks : [1], source: 'gas' };
      return;
    }
    try {
      const r = await fetch(`${GAS_API_URL}?action=getScoreboard`, { cache: 'no-cache' });
      const j = await r.json();
      // BUG CŨ: GAS luôn bọc dữ liệu trong { ok, data: {...} } (xem
      // login.html, scoreboard.js normalizeScoreboardPayload) nhưng code
      // cũ chỉ đọc j.students thẳng — luôn undefined nên luôn rơi xuống
      // nhánh local bên dưới, kể cả khi gasUrl đã đúng.
      const data = (j && j.data) || j || {};
      const source = Array.isArray(data.students) ? data : (data.scoreboard || data);
      if (source?.students?.length) {
        DATA = { students: source.students, events: source.events || [], weeks: source.weeks?.length ? source.weeks : [1], source: 'gas' };
        writeGasCache(source);
        return;
      }
    } catch {}
  }
  // Try localStorage
  try {
    const evs = JSON.parse(localStorage.getItem(LOCAL_EVENTS_KEY) || 'null');
    const wks = JSON.parse(localStorage.getItem(LOCAL_WEEKS_KEY) || 'null');
    DATA = {
      students: MOCK_STUDENTS,
      events: evs?.length ? evs : [],
      weeks: wks?.length ? wks : [1],
      source: 'local'
    };
    return;
  } catch {}
  DATA = { students: MOCK_STUDENTS, events: [], weeks: [1], source: 'local' };
}

/* ── Mock students (fallback) ── */
function initials(name) {
  const p = name.trim().split(/\s+/);
  return (p[p.length - 1]?.[0] || name[0] || '?').toUpperCase();
}
const MOCK_STUDENTS = [
  { id: 's01', name: 'Nguyễn Thị Hằng', group: 1 },
  { id: 's02', name: 'Nguyễn Minh Thiện', group: 1 },
  { id: 's03', name: 'Nguyễn Ngọc Hiếu', group: 3 },
  { id: 's04', name: 'Đinh Mạnh Hữu', group: 3, role: 'Lớp trưởng' },
].map(s => ({ ...s, avatarInitial: initials(s.name) }));

/* ── Tab state ── */
let tabs = [];       // { key, kind:'student'|'new', id?, name?, title }
let activeKey = '';
let ctxMenu = null;  // { x, y, key }
let verticalTabs = localStorage.getItem(VTABS_KEY) !== 'off';

// Per-tab state
let tabWeeks = {};      // key → current week
let tabFilters = {};    // key → filter string

function newTabKey() { return `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`; }

function getUser() {
  try { return JSON.parse(sessionStorage.getItem('a3k64-user') || 'null') || {}; } catch { return {}; }
}

function currentUserStudent() {
  const u = getUser();
  const names = [u.displayName, u.email?.split('@')[0], u.hoten, u.name]
    .map(normalize).filter(Boolean);
  return DATA.students.find(s => names.some(n =>
    normalize(s.name) === n || normalize(s.name).includes(n) || n.includes(normalize(s.name))
  )) || alphabetStudents(DATA.students)[0];
}

function openStudent(id, week) {
  if (DATA.source === 'loading' || !DATA.students.length) return;
  const s = id ? DATA.students.find(x => x.id === id) : currentUserStudent();
  if (!s) return;
  const targetWeek = week || latestWeek();
  // Check if already open
  const existing = tabs.find(t => t.kind === 'student' && normalize(t.name) === normalize(s.name));
  if (existing) {
    activeKey = existing.key;
    tabWeeks[existing.key] = targetWeek;
    render();
    return;
  }
  // Replace active new-tab or push new
  const active = tabs.find(t => t.key === activeKey);
  const tab = {
    key: active?.kind === 'new' ? active.key : `student-${s.id}-${Date.now()}`,
    kind: 'student',
    id: s.id,
    name: s.name,
    title: studentTitle(s.id)
  };
  if (active?.kind === 'new') {
    tabs = tabs.map(t => t.key === active.key ? tab : t);
  } else {
    tabs.push(tab);
  }
  activeKey = tab.key;
  tabWeeks[tab.key] = targetWeek;
  render();
}

function openNewTab(afterKey) {
  const tab = { key: newTabKey(), kind: 'new', title: 'Tab mới' };
  if (afterKey) {
    const idx = tabs.findIndex(t => t.key === afterKey);
    tabs.splice(idx >= 0 ? idx + 1 : tabs.length, 0, tab);
  } else {
    tabs.push(tab);
  }
  activeKey = tab.key;
  render();
}

function closeTab(key) {
  const idx = tabs.findIndex(t => t.key === key);
  tabs = tabs.filter(t => t.key !== key);
  if (activeKey === key) {
    activeKey = tabs[Math.max(0, idx - 1)]?.key || tabs[0]?.key || '';
  }
  render();
}

function closeCtxMenu() { ctxMenu = null; document.getElementById('ctx-menu').style.display = 'none'; }

/* ── Chart rendering ── */
function buildChart(rows) {
  if (!rows.length) return '<p style="color:var(--muted);font-size:13px">Chưa có dữ liệu</p>';
  const H = 200, pl = 40, pr = 16, pt = 26, pb = 36;
  const minGap = 46;
  const plotW = Math.max(220 - pl - pr, (rows.length - 1) * minGap);
  const W = pl + plotW + pr;
  const vals = rows.flatMap(r => [r.me, r.group, r.cls]);
  const minV = Math.min(0, ...vals) - 8;
  const maxV = Math.max(60, ...vals) + 8;
  const rng = Math.max(1, maxV - minV);
  const x = i => pl + (rows.length < 2 ? plotW / 2 : i * plotW / (rows.length - 1));
  const y = v => H - pb - ((v - minV) * (H - pt - pb)) / rng;
  const pts = key => rows.map((r, i) => `${x(i)},${y(r[key])}`).join(' ');

  return `<div class="chart-scroll" data-scrollwatch>
    <svg class="profile-chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="min-width:${W}px">
    <line x1="${pl}" y1="${H - pb}" x2="${W - pr}" y2="${H - pb}" class="chart-axis"/>
    <line x1="${pl}" y1="${pt}" x2="${pl}" y2="${H - pb}" class="chart-axis"/>
    <polyline class="chart-line-cls" points="${pts('cls')}"/>
    <polyline class="chart-line-grp" points="${pts('group')}"/>
    <polyline class="chart-line-me" points="${pts('me')}"/>
    ${rows.map((r, i) => `
      <circle cx="${x(i)}" cy="${y(r.me)}" r="4.5" class="chart-dot"/>
      <text x="${x(i)}" y="${y(r.me) - 9}" text-anchor="middle" class="chart-value">${r.me}</text>
      <text x="${x(i)}" y="${H - 10}" text-anchor="middle" class="chart-label">T${r.week}</text>
    `).join('')}
    <g class="chart-legend">
      <line x1="${pl}" y1="${pt - 10}" x2="${pl + 16}" y2="${pt - 10}" stroke="#2563eb" stroke-width="3" stroke-linecap="round"/>
      <text x="${pl + 21}" y="${pt - 6}" fill="#2563eb">Tôi</text>
      <line x1="${pl + 56}" y1="${pt - 10}" x2="${pl + 72}" y2="${pt - 10}" stroke="#9333ea" stroke-width="3" stroke-linecap="round"/>
      <text x="${pl + 77}" y="${pt - 6}" fill="#9333ea">Tổ</text>
      <line x1="${pl + 105}" y1="${pt - 10}" x2="${pl + 121}" y2="${pt - 10}" stroke="#ea580c" stroke-width="3" stroke-linecap="round" stroke-dasharray="4 3"/>
      <text x="${pl + 126}" y="${pt - 6}" fill="#ea580c">Lớp</text>
    </g>
  </svg></div>`;
}

/* ── Profile page HTML ── */
function buildProfilePage(tab) {
  const weeks = realWeeks();
  const activeWeek = tabWeeks[tab.key] || latestWeek();
  const filter = tabFilters[tab.key] || 'all';

  const summaries = summarize(DATA.students, DATA.events, activeWeek);
  const student = summaries.find(s => s.id === tab.id);
  if (!student) return `<div class="p-empty">Không tìm thấy học sinh này.<br>Hãy mở tab mới để tìm lại.</div>`;

  const allEvents = DATA.events.filter(e => e.studentId === student.id && !isHiddenEvent(e));
  const weekEvents = allEvents.filter(e => e.week === activeWeek);
  const groupMembers = summaries.filter(s => s.group === student.group).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'vi'));
  const groupRank = Math.max(1, groupMembers.findIndex(s => s.id === student.id) + 1);
  const groupAvg = groupMembers.length ? Math.round(groupMembers.reduce((s, m) => s + m.total, 0) / groupMembers.length) : 0;
  const above = groupMembers[groupRank - 2];
  const below = groupMembers[groupRank];

  const weekIdx = weeks.indexOf(activeWeek);
  const prevWeek = weekIdx > 0 ? weeks[weekIdx - 1] : null;
  const nextWeek = weekIdx >= 0 && weekIdx < weeks.length - 1 ? weeks[weekIdx + 1] : null;

  const isMobile = window.innerWidth <= 600;
  const chartWeekCount = isMobile ? 4 : 9;
  const tableWeeks = weeks.slice(-chartWeekCount);
  const weekRows = tableWeeks.map(w => {
    const sums = summarize(DATA.students, DATA.events, w);
    const cur = sums.find(s => s.id === student.id);
    const grp = sums.filter(s => s.group === student.group);
    const wEvs = allEvents.filter(e => e.week === w);
    return {
      week: w,
      total: cur?.total ?? 0,
      positive: cur?.positive ?? 0,
      negative: cur?.negative ?? 0,
      hocTap: catTotal(wEvs, 'HOC_TAP'),
      neNep: catTotal(wEvs, 'NE_NEP'),
      phongTrao: catTotal(wEvs, 'PHONG_TRAO'),
      rank: cur?.rank ?? 0,
      status: cur?.status ?? '—',
      groupAvg: grp.length ? Math.round(grp.reduce((s, m) => s + m.total, 0) / grp.length) : 0,
    };
  });

  const chartRows = tableWeeks.map(w => {
    const sums = summarize(DATA.students, DATA.events, w);
    const cur = sums.find(s => s.id === student.id);
    const grp = sums.filter(s => s.group === student.group);
    const cls = sums;
    return {
      week: w,
      me: cur?.total ?? 0,
      group: grp.length ? Math.round(grp.reduce((s, m) => s + m.total, 0) / grp.length) : 0,
      cls: cls.length ? Math.round(cls.reduce((s, m) => s + m.total, 0) / cls.length) : 0,
    };
  });

  const history = allEvents
    .filter(e => {
      if (filter === 'all') return true;
      if (filter === 'plus') return e.points > 0;
      if (filter === 'minus') return e.points < 0;
      return e.category === filter;
    })
    .sort((a, b) => b.week - a.week || ((parseAnyDate(b.createdAt)?.getTime() || 0) - (parseAnyDate(a.createdAt)?.getTime() || 0)));

  const notes = [
    student.total >= 50 ? 'Đang ở mức Tốt, hãy duy trì phong độ.' : student.total >= 0 ? 'Kết quả ổn, có thể bứt lên nhóm Tốt.' : 'Điểm đang thấp, cần giảm lỗi trừ điểm.',
    weekEvents.some(e => e.points < 0) ? 'Tuần này có điểm trừ — kiểm tra lịch sử.' : 'Tuần này chưa có lỗi trừ điểm.',
    student.total >= groupAvg ? 'Điểm cao hơn hoặc bằng trung bình tổ.' : 'Điểm thấp hơn trung bình tổ.',
  ];

  const scoreClass = v => v < 0 ? 'color-negative' : 'color-positive';

  return `<div class="profile-page" data-tabkey="${tab.key}">

    <section class="p-hero">
      <div class="p-avatar">${student.avatarInitial || student.name[0]}</div>
      <div class="p-hero-info">
        <div class="p-hero-meta">
          <span>Hồ sơ học sinh · Tuần ${activeWeek}</span>
          <div class="week-sw" aria-label="Chọn tuần">
            <button ${!prevWeek ? 'disabled' : ''} data-prevweek="${tab.key}" title="Tuần trước">◀</button>
            <select data-weekselect="${tab.key}">
              ${weeks.map(w => `<option value="${w}" ${w === activeWeek ? 'selected' : ''}>Tuần ${w}</option>`).join('')}
            </select>
            <button ${!nextWeek ? 'disabled' : ''} data-nextweek="${tab.key}" title="Tuần sau">▶</button>
          </div>
        </div>
        <h1>${student.name}</h1>
        <p>Tổ ${student.group} · ${student.role || 'Học sinh'} · ${student.status}</p>
      </div>
      <div class="p-rank-badge">
        <strong>#${student.rank}</strong>
        <small>Hạng lớp</small>
      </div>
    </section>

    <div class="p-stat-grid">
      <article class="stat-card total-rank">
        <div class="tr-left">
          <span>Tổng điểm</span>
          <b class="${scoreClass(student.total)}">${formatScore(student.total)}</b>
        </div>
        <div class="tr-right">
          <span>Hạng lớp</span>
          <b>#${student.rank}</b>
        </div>
      </article>
      ${[
        ['Điểm cộng', formatScore(student.positive), true, false],
        ['Điểm trừ', String(student.negative), student.negative < 0, false],
        [`Hạng tổ`, `#${groupRank}/${groupMembers.length}`, false, false],
        ['Học tập', formatScore(catTotal(weekEvents, 'HOC_TAP')), catTotal(weekEvents, 'HOC_TAP') >= 0, catTotal(weekEvents, 'HOC_TAP') === 0],
        ['Nề nếp', formatScore(catTotal(weekEvents, 'NE_NEP')), catTotal(weekEvents, 'NE_NEP') >= 0, catTotal(weekEvents, 'NE_NEP') === 0],
        ['Phong trào', formatScore(catTotal(weekEvents, 'PHONG_TRAO')), catTotal(weekEvents, 'PHONG_TRAO') >= 0, catTotal(weekEvents, 'PHONG_TRAO') === 0],
        ['TB tổ', String(groupAvg), groupAvg >= 0, false],
        // Cờ isZero: chỉ áp dụng "hạ tông" cho 3 nhóm khi = 0
      ].map(([label, val, pos, isZero]) => `<article class="stat-card${isZero ? ' is-zero' : ''}"><span>${label}</span><b class="${pos ? 'color-positive' : 'color-negative'}">${val}</b></article>`).join('')}
    </div>

    <div class="p-mid-grid">
      <article class="p-card">
        <h2>📈 Biểu đồ so sánh tuần</h2>
        ${buildChart(chartRows)}
      </article>
      <article class="p-card">
        <h2>💬 Nhận xét</h2>
        <ul>${notes.map(n => `<li>${n}</li>`).join('')}</ul>
        <h2 style="margin-top:12px">So sánh trong tổ</h2>
        <p>Cách người trên: <b>${above ? `${Math.max(0, above.total - student.total)} điểm` : 'Đang dẫn đầu'}</b></p>
        <p>Cách người dưới: <b>${below ? `${Math.max(0, student.total - below.total)} điểm` : 'Cuối nhóm'}</b></p>
        <p>So với TB tổ: <b class="${scoreClass(student.total - groupAvg)}">${formatScore(student.total - groupAvg)}</b></p>
      </article>
    </div>

    <article class="p-card">
      <h2>📊 Tổng quan các tuần so sánh</h2>
      <div class="p-table-wrap" data-scrollwatch>
        <table>
          <thead><tr>
            <th>Tuần</th><th>Tổng</th><th>Cộng</th><th>Trừ</th>
            <th>Học tập</th><th>Nề nếp</th><th>Phong trào</th>
            <th>Hạng lớp</th><th>Xếp loại</th>
          </tr></thead>
          <tbody>
            ${weekRows.map(r => `<tr data-rowweek="${r.week}" data-tabkey="${tab.key}" style="cursor:pointer">
              <td>T${r.week}</td>
              <td class="${scoreClass(r.total)}">${formatScore(r.total)}</td>
              <td class="color-positive">${formatScore(r.positive)}</td>
              <td class="${r.negative < 0 ? 'color-negative' : ''}">${r.negative}</td>
              <td>${formatScore(r.hocTap)}</td>
              <td>${formatScore(r.neNep)}</td>
              <td>${formatScore(r.phongTrao)}</td>
              <td>${r.rank ? '#' + r.rank : '—'}</td>
              <td>${r.status}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </article>

    <article class="p-card">
      <h2>📋 Lịch sử điểm</h2>
      <div class="filter-row">
        ${[['all','Tất cả'],['plus','Cộng'],['minus','Trừ'],['HOC_TAP','Học tập'],['NE_NEP','Nề nếp'],['PHONG_TRAO','Phong trào']]
          .map(([v, l]) => `<button class="filter-btn ${filter === v ? 'active' : ''}" data-filter="${v}" data-tabkey="${tab.key}">${l}</button>`).join('')}
      </div>

      <!-- Bảng: hiển thị trên desktop -->
      <div class="p-table-wrap p-history-table" data-scrollwatch>
        <table>
          <thead><tr><th>Tuần</th><th>Nội dung</th><th>Điểm</th><th>Loại</th><th>Người nhập</th><th>Thời gian</th></tr></thead>
          <tbody>
            ${history.length ? history.map(e => `<tr>
              <td>T${e.week}</td>
              <td>${e.title}</td>
              <td class="${scoreClass(e.points)}">${formatScore(e.points)}</td>
              <td>${categoryLabel(e.category)}</td>
              <td>${e.createdBy || 'Chưa rõ'}</td>
              <td>${formatDateTime(e.createdAt)}</td>
            </tr>`).join('') : `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px">Chưa có dữ liệu.</td></tr>`}
          </tbody>
        </table>
      </div>

      <!-- Card list: hiển thị trên mobile -->
      <div class="p-event-list">
        ${history.length ? history.map(e => `
          <div class="p-event-card">
            <div class="p-event-dot ${e.points > 0 ? 'positive' : e.points < 0 ? 'negative' : ''}"></div>
            <div>
              <div class="ev-title">${e.title}</div>
              <div class="ev-meta">T${e.week} · ${categoryLabel(e.category)} · ${e.createdBy || 'Chưa rõ'}</div>
            </div>
            <div class="ev-score ${scoreClass(e.points)}">${formatScore(e.points)}</div>
          </div>
        `).join('') : `<div class="p-empty" style="padding:20px">Chưa có dữ liệu.</div>`}
      </div>
    </article>
  </div>`;
}

/* ── New-tab search page ── */
function buildNewTabPage(tab) {
  return `<div class="new-tab-page" data-tabkey="${tab.key}">
    <div class="browser-bar">
      <button class="browser-nav" disabled title="Quay lại">◀</button>
      <button class="browser-nav" disabled title="Tiến">▶</button>
      <button class="browser-nav" data-refresh title="Làm mới" style="font-size:16px">↻</button>
      <div class="address-bar">
        <span style="font-size:14px;opacity:.6">🔍</span>
        <input autofocus placeholder="Tìm học sinh..." id="search-input-${tab.key}" autocomplete="off"/>
      </div>
    </div>
    <div class="search-results-wrap" id="results-wrap-${tab.key}"></div>
  </div>`;
}

/* ── Render engine ── */
function renderSidebar() {
  const list = document.getElementById('tab-list');
  const shell = document.getElementById('shell');
  if (!list || !shell) return;
  if (verticalTabs) shell.classList.remove('horizontal');
  else shell.classList.add('horizontal');

  list.innerHTML = tabs.map(t => `
    <button class="tab-btn ${t.key === activeKey ? 'active' : ''}"
      data-tabkey="${t.key}"
      data-kind="${t.kind}"
      oncontextmenu="showCtx(event,'${t.key}')">
      <span>${t.title}</span>
      <span class="close-icon" data-closetab="${t.key}">×</span>
    </button>
  `).join('');
}

function renderMain() {
  const main = document.getElementById('main');
  if (!main) return;
  if (!tabs.length) {
    main.innerHTML = `<div class="p-empty">Bấm <b>Tab mới</b> để tìm và mở hồ sơ học sinh.</div>`;
    return;
  }
  const tab = tabs.find(t => t.key === activeKey) || tabs[0];
  if (!tab) return;

  if (DATA.source === 'loading') {
    main.innerHTML = `<div class="p-loading"><div class="spinner"></div>Đang tải dữ liệu…</div>`;
    return;
  }

  if (tab.kind === 'new') {
    main.innerHTML = buildNewTabPage(tab);
    const input = document.getElementById(`search-input-${tab.key}`);
    if (input) {
      input.focus();
      input.addEventListener('input', () => renderSearchResults(tab.key, input.value));
    }
    const refreshBtn = main.querySelector('[data-refresh]');
    if (refreshBtn) refreshBtn.addEventListener('click', () => { refreshData(); });
  } else {
    main.innerHTML = buildProfilePage(tab);
    attachProfileEvents(tab.key);
  }
}

function renderSearchResults(tabKey, query) {
  const wrap = document.getElementById(`results-wrap-${tabKey}`);
  if (!wrap) return;
  if (!query.trim()) { wrap.innerHTML = ''; return; }
  const q = normalize(query);
  const results = alphabetStudents(DATA.students)
    .filter(s => normalize(s.name).includes(q) || String(s.group).includes(query.trim()))
    .slice(0, 10);
  if (!results.length) {
    wrap.innerHTML = `<div class="search-results"><div class="no-result">Không tìm thấy học sinh phù hợp.</div></div>`;
    return;
  }
  wrap.innerHTML = `<div class="search-results">${results.map(s => `
    <button class="result-btn" data-openid="${s.id}">
      <span>${s.name}</span>
      <small>Tổ ${s.group}</small>
    </button>
  `).join('')}</div>`;
  wrap.querySelectorAll('[data-openid]').forEach(btn => {
    btn.addEventListener('click', () => {
      openStudent(btn.dataset.openid);
    });
  });
}

function attachProfileEvents(tabKey) {
  const page = document.querySelector(`.profile-page[data-tabkey="${tabKey}"]`);
  if (!page) return;

  // Week switcher
  page.querySelectorAll(`[data-weekselect="${tabKey}"]`).forEach(sel => {
    sel.addEventListener('change', e => {
      tabWeeks[tabKey] = Number(e.target.value);
      renderMain();
    });
  });
  page.querySelectorAll(`[data-prevweek="${tabKey}"]`).forEach(btn => {
    btn.addEventListener('click', () => {
      const weeks = realWeeks();
      const cur = tabWeeks[tabKey] || latestWeek();
      const idx = weeks.indexOf(cur);
      if (idx > 0) { tabWeeks[tabKey] = weeks[idx - 1]; renderMain(); }
    });
  });
  page.querySelectorAll(`[data-nextweek="${tabKey}"]`).forEach(btn => {
    btn.addEventListener('click', () => {
      const weeks = realWeeks();
      const cur = tabWeeks[tabKey] || latestWeek();
      const idx = weeks.indexOf(cur);
      if (idx >= 0 && idx < weeks.length - 1) { tabWeeks[tabKey] = weeks[idx + 1]; renderMain(); }
    });
  });

  // Filter buttons
  page.querySelectorAll(`[data-filter][data-tabkey="${tabKey}"]`).forEach(btn => {
    btn.addEventListener('click', () => {
      tabFilters[tabKey] = btn.dataset.filter;
      renderMain();
    });
  });

  // Table row week navigation
  page.querySelectorAll(`[data-rowweek][data-tabkey="${tabKey}"]`).forEach(row => {
    row.addEventListener('click', () => {
      tabWeeks[tabKey] = Number(row.dataset.rowweek);
      renderMain();
    });
  });

  initScrollWatchers(page);
}

function initScrollWatchers(scope) {
  const root = scope || document;
  root.querySelectorAll('[data-scrollwatch]').forEach(el => {
    const update = () => {
      const overflow = el.scrollWidth - el.clientWidth > 4;
      el.classList.toggle('has-overflow-x', overflow);
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      el.classList.toggle('at-end', atEnd);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
  });
}

function render() {
  renderSidebar();
  renderMain();
  attachSidebarEvents();
}

function attachSidebarEvents() {
  document.getElementById('tab-list')?.querySelectorAll('.tab-btn').forEach(btn => {
    const key = btn.dataset.tabkey;
    btn.addEventListener('click', e => {
      if (e.target.closest('[data-closetab]')) return;
      activeKey = key;
      render();
    });
    btn.querySelector('[data-closetab]')?.addEventListener('click', e => {
      e.stopPropagation();
      closeTab(key);
    });
  });
}

/* ── Context menu ── */
function showCtx(e, key) {
  e.preventDefault();
  e.stopPropagation();
  activeKey = key;
  render();
  ctxMenu = { x: e.clientX, y: e.clientY, key };
  const menu = document.getElementById('ctx-menu');
  const tab = tabs.find(t => t.key === key);
  const idx = tabs.findIndex(t => t.key === key);
  const hasBelow = idx >= 0 && idx < tabs.length - 1;
  menu.innerHTML = `
    <button data-ctx="new-tab">Tab mới <kbd>Ctrl+T</kbd></button>
    <button data-ctx="refresh">Làm mới <kbd>Ctrl+R</kbd></button>
    <button data-ctx="pin">Ghim tab</button>
    <div class="ctx-sep"></div>
    <button data-ctx="close">Đóng tab</button>
    <button data-ctx="close-others" ${tabs.length <= 1 ? 'disabled' : ''}>Đóng các tab khác</button>
    <button data-ctx="close-below" ${!hasBelow ? 'disabled' : ''}>Đóng tab bên dưới</button>
    <div class="ctx-sep"></div>
    <button data-ctx="toggle-layout">${verticalTabs ? 'Tắt tab dọc' : 'Bật tab dọc'}</button>
  `;
  menu.style.display = 'grid';
  menu.style.left = Math.min(e.clientX, window.innerWidth - 230) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - 240) + 'px';
  menu.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => handleCtx(btn.dataset.ctx, key));
  });
}

function handleCtx(action, key) {
  closeCtxMenu();
  if (action === 'new-tab') { openNewTab(key); }
  else if (action === 'refresh') { refreshData(); }
  else if (action === 'pin') { const t = tabs.find(x => x.key === key); if (t) { tabs = [t, ...tabs.filter(x => x.key !== key)]; activeKey = key; render(); } }
  else if (action === 'close') { closeTab(key); }
  else if (action === 'close-others') { tabs = tabs.filter(t => t.key === key); activeKey = key; render(); }
  else if (action === 'close-below') { const idx = tabs.findIndex(t => t.key === key); tabs = tabs.slice(0, idx + 1); if (!tabs.find(t => t.key === activeKey)) activeKey = key; render(); }
  else if (action === 'toggle-layout') { verticalTabs = !verticalTabs; localStorage.setItem(VTABS_KEY, verticalTabs ? 'on' : 'off'); render(); }
}

/* ── Theme / accent sync ── */
function readThemeMode() {
  try {
    const raw = (
      localStorage.getItem('desktop-theme') ||
      localStorage.getItem('login-theme')   ||
      localStorage.getItem('theme-mode')    ||
      localStorage.getItem('a3k64-theme')   ||
      'dark'
    ).toLowerCase();
    const map = { light: 'light', sang: 'light', 'sáng': 'light', dark: 'dark', toi: 'dark', 'tối': 'dark' };
    if (raw === 'auto') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    return map[raw] || 'dark';
  } catch { return 'dark'; }
}

function applyTheme(mode) {
  try {
    const isLight = (mode || readThemeMode()) === 'light';
    document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
    document.body.className = isLight ? 'theme-light' : '';
  } catch {}
  try {
    const keys = ['login-accent','accent-color','accent','desktop-accent','a3k64-accent'];
    for (const k of keys) {
      const v = localStorage.getItem(k);
      if (v && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim())) {
        document.documentElement.style.setProperty('--accent', v.trim());
        break;
      }
    }
  } catch {}
}

/* ── Data refresh ── */
async function refreshData() {
  DATA = { ...DATA, source: 'loading' };
  render();
  await loadData(true); // bấm "Làm mới" luôn bỏ qua cache, lấy dữ liệu mới nhất
  tabs = tabs.map(t => t.kind === 'student' ? { ...t, title: studentTitle(t.id) } : t);
  render();
}

/* ── Boot ── */
document.getElementById('btn-new-tab').addEventListener('click', () => openNewTab(activeKey));
document.getElementById('btn-mini-new').addEventListener('click', () => openNewTab(activeKey));

document.addEventListener('click', e => {
  if (ctxMenu && !e.target.closest('.ctx-menu')) closeCtxMenu();
});

window.addEventListener('storage', () => {
  applyTheme();
  refreshData();
});

// Lắng nghe theme broadcast trực tiếp từ desktop.js (postMessage)
window.addEventListener('message', e => {
  if (e.data?.type === 'a3k64-theme-change') applyTheme(e.data.theme);
});

window.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') { e.preventDefault(); openNewTab(activeKey); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') { e.preventDefault(); refreshData(); }
  if (e.key === 'Escape') closeCtxMenu();
});

// Listen for deeplink from parent (desktop.js can postMessage to open a student)
window.addEventListener('message', e => {
  if (e.data?.type === 'profile-open') openStudent(e.data.studentId, e.data.week);
});

applyTheme();

(async () => {
  openNewTab();
  render();
  await loadData();
  tabs = tabs.map(t => t.kind === 'student' ? { ...t, title: studentTitle(t.id) } : t);
  if (tabs.length && tabs[0].kind === 'new') {
    openStudent(null, latestWeek());
  }
  render();
})();
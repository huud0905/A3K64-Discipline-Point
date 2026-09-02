/* ============================================================

   duty.js v2 — A3K64 Trực nhật (viết lại từ đầu)
   Cấu trúc tab mới:
     0 - Hôm nay   : hero card + session cards (mặc định)
     1 - Tuần này  : bảng gọn cả tuần
     2 - Quản lý   : sổ nợ + sân trường + cấu hình (tổ trưởng)
     3 - Báo cáo   : GVCN
   Backend / GAS actions: giữ nguyên 100% như v1.
   DUTY_DEBUG = true để log toàn bộ request/response.
   ============================================================ */

const DUTY_DEBUG = false;

/* ── GAS helpers ── */

// v3: 4 role được xác nhận vắng có lý do chính đáng
const CAN_EXCUSE_ABSENCE_ROLES = ['gvcn', 'lop_truong', 'to_truong', 'bi_thu'];

function canExcuseAbsence(user) {
  const role = ((user && (user.role || user.vaiTro)) || '').toLowerCase();
  return CAN_EXCUSE_ABSENCE_ROLES.some(r => role.includes(r));
}

function getDutyGasUrl() {
  try { return window.A3K64_CONFIG?.gasUrl || null; } catch { return null; }
}

function readDutyUser() {
  try { return JSON.parse(sessionStorage.getItem('a3k64-user') || 'null'); } catch { return null; }
}

function dutyNotify(msg, type) {
  if (type === 'error') console.error('[duty]', msg);
  else if (DUTY_DEBUG) console.log('[duty]', msg);
  if (window.notify) { try { window.notify(msg, type); } catch(e) { console.error(e); } }
  // Không dùng alert() — lỗi wizard đã hiện qua banner inline .dt-wizard-error
}

function dutyCanEdit() {
  const u = readDutyUser();
  const role = ((u && (u.role || u.vaiTro)) || '').toLowerCase();
  return ['gvcn','lop_truong','bi_thu','to_truong'].some(r => role.includes(r));
}

function dutyIsDone(status) {
  const s = String(status || '').trim().toLowerCase();
  return s === 'hoàn thành' || s === 'hoan thanh';
}

function dutyEscape(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

async function dutyApiGet(action, payload) {
  const gasUrl = getDutyGasUrl();
  if (!gasUrl) throw new Error('Chưa cấu hình GAS URL (config.js).');
  const qs = `action=${encodeURIComponent(action)}&payload=${encodeURIComponent(JSON.stringify(payload||{}))}&_=${Date.now()}`;
  if (DUTY_DEBUG) console.log(`[duty→GET] ${action}`, payload);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  let res;
  try {
    res = await fetch(`${gasUrl}?${qs}`, { signal: ctrl.signal, cache: 'no-store' });
  } catch(err) {
    if (err?.name === 'AbortError') throw new Error('Máy chủ phản hồi quá lâu, vui lòng thử lại.');
    throw new Error(`Không kết nối được máy chủ cho "${action}".`);
  } finally { clearTimeout(t); }
  let json;
  try { json = await res.json(); }
  catch { throw new Error(`Server trả về dữ liệu không hợp lệ cho "${action}" (HTTP ${res.status}).`); }
  if (DUTY_DEBUG) console.log(`[duty←GET] ${action}`, json);
  if (json?.ok === false) throw new Error(json.error || 'Backend từ chối yêu cầu.');
  return json.data;
}

const DUTY_POST_MAX_RETRIES = 2; // số lần thử lại khi rớt mạng (không tính lần đầu)
const DUTY_POST_RETRY_DELAY_MS = 800; // delay cơ bản, tăng dần (backoff tuyến tính)

function dutySleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function dutyApiPost(action, payload) {
  const gasUrl = getDutyGasUrl();
  if (!gasUrl) throw new Error('Chưa cấu hình GAS URL (config.js).');
  if (DUTY_DEBUG) console.log(`[duty→POST] ${action}`, payload);

  let lastNetworkErr = null;
  for (let attempt = 0; attempt <= DUTY_POST_MAX_RETRIES; attempt++) {
    let res;
    try {
      res = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, ...(payload||{}) }),
      });
    } catch(err) {
      // Lỗi mạng cấp trình duyệt (Failed to fetch) — có thể thử lại.
      lastNetworkErr = new Error(`Không kết nối được máy chủ cho "${action}".`);
      if (attempt < DUTY_POST_MAX_RETRIES) {
        if (DUTY_DEBUG) console.log(`[duty→POST] ${action} rớt mạng, thử lại lần ${attempt+1}/${DUTY_POST_MAX_RETRIES}...`);
        await dutySleep(DUTY_POST_RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      throw lastNetworkErr;
    }
    let json;
    try { json = await res.json(); }
    catch { throw new Error(`Server trả về dữ liệu không hợp lệ cho "${action}" (HTTP ${res.status}).`); }
    if (DUTY_DEBUG) console.log(`[duty←POST] ${action}`, json);
    // Lỗi logic từ backend (ok:false) — không retry, retry cũng vô ích.
    if (json?.ok === false) throw new Error(json.error || 'Backend từ chối yêu cầu.');
    return json.data;
  }
  // Không thể tới đây trên lý thuyết, nhưng để an toàn:
  throw lastNetworkErr || new Error(`Không kết nối được máy chủ cho "${action}".`);
}

/* ── Hằng số ── */

const DUTY_DAYS = ['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'];

const SLOT_LABEL = { sang: 'Sáng', chieu: 'Chiều' };

/* Danh sách model AI theo thứ tự ưu tiên (waterfall) — khớp với
   AI_PROXY_ALLOWED_MODELS ở backend (ok.js). Khi model đầu bị quota/lỗi,
   tự động thử model tiếp theo. Key API lấy sẵn ở backend, không cần nhập. */
const AI_MODEL_FALLBACKS = [
    'gemini-3.1-flash-lite',       // 15 RPM, 500 RPD ★ ưu tiên 1
    'gemini-3.5-flash-lite',                // 15 RPM, 500 RPD ★ ưu tiên 2
    'gemini-2.5-flash-lite',  // 10 RPM, 20 RPD
    'gemini-2.5-flash',       // 5 RPM, 20 RPD
    'gemini-3.5-flash',                     // 5 RPM, 20 RPD
    'gemini-3.6-flash',                     // 5 RPM, 20 RPD
    'gemini-3.7-flash',                     // 5 RPM, 20 RPD
    'gemini-3.0-flash',                     // 5 RPM, 20 RPD
    'gemini-2.0-flash-lite',                // 0/0 — cuối bảng
    'gemini-2.0-flash',                     // 0/0
    'gemini-3.1-pro',                       // 0/0
    'gemini-2.5-pro',  
];

/* Gọi AI qua backend (action "aiCall") — thử lần lượt các model trong
   AI_MODEL_FALLBACKS, model nào hết quota/lỗi thì tự động chuyển sang
   model kế tiếp. Trả về text trả lời đầu tiên gọi thành công. */
async function dutyAiCallWithFallback(promptText, generationConfig) {
  let lastErr = null;
  for (const model of AI_MODEL_FALLBACKS) {
    try {
      const data = await dutyApiPost('aiCall', {
        model,
        geminiBody: {
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: generationConfig || {},
        },
      });
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
      lastErr = new Error('AI không trả lời.');
    } catch (err) {
      lastErr = err;
      // Thử model tiếp theo khi lỗi (hết quota, rate limit, v.v.)
    }
  }
  throw lastErr || new Error('Không gọi được AI.');
}

/* ── Lấy tuần hiện tại ── */

function dutyCurrentWeekGuess() {
  try {
    const stored = Number(localStorage.getItem('a3k64-current-week'));
    if (stored > 0) return stored;
  } catch {}
  return 1;
}

/* ── Tải danh sách tuần (bảng weeks) + xác định tuần đang hoạt động ── */

async function dutyLoadWeeksList() {
  if (Duty.weeksListLoaded || Duty.weeksListLoading) return;
  Duty.weeksListLoading = true;
  try {
    const list = await dutyApiGet('getWeeks', {}) || [];
    Duty.weeksList = list.slice().sort((a, b) => (a.week||0) - (b.week||0));
    Duty.weeksListLoaded = true;
  } catch(err) {
    console.error('[duty] Không tải được danh sách tuần:', err);
    Duty.weeksList = [];
  } finally { Duty.weeksListLoading = false; }
}

// Chọn tuần đang hoạt động dựa vào start_date/end_date trong bảng weeks (không đoán ngẫu nhiên).
function dutyPickActiveWeek(list) {
  if (!list || !list.length) return dutyCurrentWeekGuess();
  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  // 1) Tuần mà hôm nay nằm trong khoảng start_date..end_date
  const inRange = list.find(w => w.startDate && w.endDate && todayStr >= w.startDate && todayStr <= w.endDate);
  if (inRange) return inRange.week;
  // 2) Không có tuần nào khớp ngày hôm nay → lấy tuần mới nhất đã bắt đầu (start_date <= hôm nay)
  const started = list.filter(w => w.startDate && w.startDate <= todayStr);
  if (started.length) return started[started.length - 1].week;
  // 3) Fallback cuối: tuần có số thứ tự lớn nhất trong bảng weeks
  return list[list.length - 1].week;
}

/* ── Lấy ngày hôm nay dạng "Thứ X" ── */

function dutyTodayDayLabel() {
  const d = new Date().getDay(); // 0=Sun,1=Mon,...6=Sat
  // Thứ 2=1, Thứ 3=2,...Thứ 7=6; Chủ nhật không có trực
  const map = { 1:'Thứ 2', 2:'Thứ 3', 3:'Thứ 4', 4:'Thứ 5', 5:'Thứ 6', 6:'Thứ 7' };
  return map[d] || null;
}

function dutySlotsForToday(classSlots) {
  const todayLabel = dutyTodayDayLabel();
  if (!todayLabel) return [];
  return (classSlots || []).filter(r => r.day === todayLabel);
}

/* ── Checklist cấu hình cũ (đã thay bằng dutyRenderWizard, xem bên dưới) ── */

/* ── State ── */

const Duty = {
  week: 1,
  activeTab: 'today', // 'today' | 'week' | 'manage' | 'report'
  // Danh sách tuần (bảng weeks) — dùng để xác định tuần đang hoạt động + đổ vào dropdown chọn tuần
  weeksList: [], weeksListLoaded: false, weeksListLoading: false,
  // Dữ liệu chung
  students: [], studentsLoaded: false, studentsLoading: false,
  workItems: [], workItemsLoaded: false, workItemsLoading: false,
  outdoorWorkItems: [], outdoorWorkItemsLoaded: false, outdoorWorkItemsLoading: false,
  // Tab Today + Week — LỚP (classSlots) và SÂN TRƯỜNG (outdoorSlots) tự sinh song song
  classSlots: [], classLoaded: false, classLoading: false, classError: '',
  weekGroup: null,
  outdoorSlots: [], outdoorGroup: null,
  exemptList: [],
  // UI state — Today
  openKebab: null,     // rowIndex|workItemId đang mở kebab menu
  editingCell: null,   // { rowIndex, workItemId } đang mở inline edit
  // Tab Manage — Sổ nợ
  debts: [], debtsLoaded: false, debtsLoading: false, debtsError: '',
  debtClearRow: null,
  penaltyFormOpen: false,
  // Tab Manage — Nhà xe cố định
  parkingFixed: [], parkingFixedLoaded: false,
  parkingConfigOpen: false, parkingDraft: null, parkingSaving: false,
  // Tab Manage — Cấu hình tuần (accordion)
  weekConfigOpen: false, weekConfigDraft: null, weekConfigSaving: false,
  outdoorWeekConfigOpen: false, outdoorWeekConfigDraft: null, outdoorWeekConfigSaving: false,
  // Tab Manage — Ghi đè theo ngày/tuần (Day/Week Override — Tầng 2)
  overrideOpen: false, overrides: [], overridesLoaded: false, overridesLoading: false, overridesError: '',
  overrideForm: null, overrideSaving: false,
  // Tab Manage — Cấu hình đầu việc (accordion)
  workItemsConfigOpen: false, workItemsDraft: null, workItemsSaving: false,
  outdoorWorkItemsConfigOpen: false, outdoorWorkItemsDraft: null, outdoorWorkItemsSaving: false,
  // Tab Manage — Rules
  rulesOpen: false, rules: [], rulesLoaded: false, rulesLoading: false, rulesError: '',
  ruleForm: null,
  // Tab Report
  report: null, reportLoading: false, reportError: '',
  reportFrom: null, reportTo: null,
  // v3 — Yêu cầu đổi ca (swapRequests) và bù ca (swapMakeup)
  swapRequests: [], swapRequestsLoaded: false, swapRequestsLoading: false, swapRequestsError: '',
  swapMakeups: [], swapMakeupsLoaded: false, swapMakeupsLoading: false, swapMakeupsError: '',
  swapRequestsOpen: false,
  swapMakeupsOpen: false,
  // v3 — Form xin đổi ca inline (mở từ kebab)
  swapFormOpen: null, // { rowIndex, workItemId, studentId, studentName, groupStudents: [] }
  // v3 — Form vắng có lý do inline (mở từ kebab)
  excuseFormOpen: null, // { rowIndex, workItemId, studentId, studentName }
  // v4 — Ngày nghỉ trong tuần (lễ/không đi học → không tính trực)
  skipDays: [], skipDaysLoaded: false,
  // v4 — Wizard tạo lịch (B1–B5), thay cho checklist tĩnh cũ
  wizardOpen: false, wizardStep: 1, wizardDraft: null, wizardSaving: false, wizardError: null,
};

/* ═══════════════════════════════════════════════════════════

   RENDER ROOT
   ═══════════════════════════════════════════════════════════ */

function dutyRenderRoot() {
  const root = document.getElementById('duty-root');
  if (!root) { console.error('[duty] #duty-root không tìm thấy'); return; }
  const debtCount = (Duty.debts || []).filter(d => (d.owedSlots||0) > 0).length;
  const debtBadge = debtCount > 0 ? `<span class="da-tab-badge">${debtCount}</span>` : '';
  root.innerHTML = `
    <div class="da-app">
      <div class="da-header">
        <h1 class="da-title">📋 Trực nhật</h1>
        <span class="da-subtitle">${Duty.weekGroup ? `Tuần ${Duty.week} — Tổ ${dutyEscape(String(Duty.weekGroup))} phụ trách` : `Tuần ${Duty.week}`}</span>
        <div class="da-tools">
          <div class="da-week-nav">
            <select class="da-week-select" id="da-week-select" title="Chọn tuần">
              ${(Duty.weeksList && Duty.weeksList.length ? Duty.weeksList : [{ week: Duty.week, label: 'Tuần ' + Duty.week }])
                .map(w => `<option value="${w.week}" ${w.week===Duty.week?'selected':''}>${dutyEscape(w.label || ('Tuần ' + w.week))}</option>`)
                .join('')}
            </select>
          </div>
          <button class="da-icon-btn" id="da-print-btn" title="In bản gọn" style="font-size:17px;">🖨</button>
        </div>
      </div>
      <div class="da-tabs">
        <button class="da-tab ${Duty.activeTab==='today'  ? 'active':''}" data-tab="today">Hôm nay</button>
        <button class="da-tab ${Duty.activeTab==='week'   ? 'active':''}" data-tab="week">Tuần này</button>
        <button class="da-tab ${Duty.activeTab==='create' ? 'active':''}" data-tab="create">Tạo lịch trực</button>
        <button class="da-tab ${Duty.activeTab==='manage' ? 'active':''}" data-tab="manage">Quản lý${debtBadge}</button>
        <button class="da-tab ${Duty.activeTab==='report' ? 'active':''}" data-tab="report">Báo cáo</button>
      </div>
      <div class="da-body" id="da-body"></div>
    </div>
    <div class="da-print-sheet" id="da-print-sheet"></div>
  `;
  document.getElementById('da-week-select').onchange = (e) => {
    const wk = Number(e.target.value);
    if (wk > 0) dutySetWeek(wk);
  };
  document.getElementById('da-print-btn').onclick = () => { dutyBuildPrint(); window.print(); };
  root.querySelectorAll('.da-tab').forEach(btn => {
    btn.onclick = () => {
      const tab = btn.dataset.tab;
      if (tab === 'create') {
        // Tab "Tạo lịch trực" luôn mở lại wizard từ đầu (Bước 1) mỗi khi bấm vào.
        dutyOpenWizard();
      } else {
        Duty.wizardOpen = false; Duty.wizardDraft = null;
        Duty.activeTab = tab;
        dutyRenderRoot();
      }
    };
  });
  // Click ra ngoài → đóng kebab menu
  document.addEventListener('click', dutyCloseKebabOutside, { once: true });
  dutyRenderBody();
}

function dutyRenderBody() {
  const body = document.getElementById('da-body');
  if (!body) return;
  try {
    if (Duty.wizardOpen) { dutyRenderWizard(); return; }
    switch (Duty.activeTab) {
      case 'today':  dutyRenderToday();  break;
      case 'week':   dutyRenderWeek();   break;
      case 'create': dutyOpenWizard();   break; // fallback: chưa có draft thì mở lại wizard
      case 'manage': dutyRenderManage(); break;
      case 'report': dutyRenderReport(); break;
    }
  } catch(err) {
    console.error('[duty] Lỗi render:', err);
    body.innerHTML = `<div class="da-error">Lỗi hiển thị: ${dutyEscape(err?.message||err)}<br><small>F12 → Console để xem chi tiết.</small></div>`;
  }

}

function dutySetWeek(week) {
  Duty.week = Math.max(1, week);
  Duty.classLoaded = false; Duty.classSlots = []; Duty.weekGroup = null; Duty.exemptList = [];
  Duty.outdoorSlots = []; Duty.outdoorGroup = null;
  Duty.report = null;
  Duty.editingCell = null; Duty.openKebab = null;
  try { localStorage.setItem('a3k64-current-week', String(Duty.week)); } catch {}
  dutyRenderRoot();
}

function dutyChangeWeek(delta) {
  dutySetWeek(Duty.week + delta);
}

/* ═══════════════════════════════════════════════════════════

   LOAD DATA
   ═══════════════════════════════════════════════════════════ */

async function dutyLoadStudents() {
  if (Duty.studentsLoaded || Duty.studentsLoading) return;
  Duty.studentsLoading = true;
  try {
    const d = await dutyApiGet('getScoreboard', {});
    Duty.students = (d && d.students) || [];
    Duty.studentsLoaded = true;
  } catch(err) { console.error('[duty] Không tải được danh sách học sinh:', err); Duty.students = []; }
  finally { Duty.studentsLoading = false; }
}

async function dutyLoadWorkItems() {
  if (Duty.workItemsLoaded || Duty.workItemsLoading) return;
  Duty.workItemsLoading = true;
  try {
    Duty.workItems = await dutyApiGet('getDutyWorkItems', {}) || [];
    Duty.workItemsLoaded = true;
  } catch(err) { console.error('[duty] Không tải được đầu việc:', err); Duty.workItems = []; }
  finally { Duty.workItemsLoading = false; }
}

async function dutyLoadClass() {
  if (Duty.classLoading) return;
  Duty.classLoading = true; Duty.classError = ''; dutyRenderBody();
  try {
    await Promise.all([dutyLoadWorkItems(), dutyLoadOutdoorWorkItems(), dutyLoadStudents()]);
    const [data, outdoorData] = await Promise.all([
      dutyApiGet('getDutyRoster', { week: Duty.week }),
      dutyApiGet('getDutyOutdoorRoster', { week: Duty.week }),
    ]);
    Duty.classSlots = (data && data.slots) || [];
    Duty.weekGroup  = (data && data.group) || null;
    Duty.outdoorSlots = (outdoorData && outdoorData.slots) || [];
    Duty.outdoorGroup = (outdoorData && outdoorData.group) || null;
    Duty.exemptList = await dutyApiGet('getDutyExempt', { week: Duty.week }) || [];
    Duty.skipDays = await dutyApiGet('getDutySkipDays', { week: Duty.week }) || [];
    Duty.skipDaysLoaded = true;
    Duty.classLoaded = true;
  } catch(err) {
    Duty.classError = 'Không tải được lịch: ' + (err?.message || err);
  } finally { Duty.classLoading = false; dutyRenderBody(); }

}

/* ═══════════════════════════════════════════════════════════

   TAB 0 — HÔM NAY
   ═══════════════════════════════════════════════════════════ */

function dutyRenderToday() {
  const body = document.getElementById('da-body');
  if (!body) return;
  if (!Duty.classLoaded && !Duty.classLoading) { dutyLoadClass(); return; }
  if (Duty.classLoading) { body.innerHTML = `<div class="da-loading">Đang tải lịch…</div>`; return; }
  if (Duty.classError)   { body.innerHTML = `<div class="da-error">${dutyEscape(Duty.classError)}</div><div style="text-align:center;padding:12px;">${dutyCanEdit()?`<button class="da-btn primary" id="da-setup-btn">Khởi tạo lịch tuần</button>`:''}</div>`; document.getElementById('da-setup-btn')?.addEventListener('click',()=>{Duty.activeTab='manage';Duty.weekConfigOpen=true;dutyRenderRoot();}); return; }
  const todaySlots = dutySlotsForToday(Duty.classSlots);
  const todayLabel = dutyTodayDayLabel();
  const items = Duty.workItems || [];
  const canEdit = dutyCanEdit();
  /* Hero section */
  const heroHtml = Duty.weekGroup ? `
    <div class="dt-hero">
      <div class="dt-hero-icon">🏫</div>
      <div class="dt-hero-info">
        <div class="dt-hero-label">Tổ phụ trách tuần ${Duty.week}</div>
        <div class="dt-hero-group">Tổ ${dutyEscape(String(Duty.weekGroup))}</div>
        ${todayLabel ? `<div class="dt-hero-sub">Hôm nay: ${dutyEscape(todayLabel)}</div>` : '<div class="dt-hero-sub" style="color:var(--text-3)">Hôm nay không có trực (cuối tuần)</div>'}
        <div class="dt-hero-meta">
          ${(Duty.exemptList||[]).length ? `<span class="da-badge warn">⚡ Xung kích: ${dutyEscape(Duty.exemptList.map(e=>e.studentName).join(', '))}</span>` : ''}
        </div>
      </div>
    </div>
  ` : (Duty.classSlots.length === 0 ? `
    <div class="dt-no-schedule">
      <strong>Chưa có lịch trực tuần ${Duty.week}</strong>
      <p style="margin:8px 0 12px;font-size:13px;color:var(--text-3);">Tạo lịch trực nhật chỉ với vài bước hướng dẫn.</p>
      ${canEdit ? `<button class="da-btn primary" id="da-goto-setup" style="margin-top:4px;">Bắt đầu tạo lịch</button>` : ''}
    </div>
  ` : '');
  /* Sessions — LỚP */
  let sessionsHtml = '';
  if (todayLabel && todaySlots.length > 0) {
    const sang  = todaySlots.filter(r => r.slot === 'sang');
    const chieu = todaySlots.filter(r => r.slot === 'chieu');
    sessionsHtml = `<div class="dt-sessions">
      ${dutyRenderSessionCard('sang',   sang,  items, canEdit)}
      ${dutyRenderSessionCard('chieu', chieu,  items, canEdit)}
    </div>`;
  } else if (todayLabel && Duty.classSlots.length > 0) {
    sessionsHtml = `<div class="dt-no-schedule"><strong>Hôm nay (${dutyEscape(todayLabel)}) không có buổi trực nào.</strong></div>`;
  }
  /* Hero + Sessions — SÂN TRƯỜNG (Tổ kế tiếp, tự sinh song song) */
  const todayOutdoorSlots = dutySlotsForToday(Duty.outdoorSlots);
  const outdoorItems = Duty.outdoorWorkItems || [];
  const outdoorHeroHtml = Duty.outdoorGroup ? `
    <div class="dt-hero" style="margin-top:14px;">
      <div class="dt-hero-icon">🌳</div>
      <div class="dt-hero-info">
        <div class="dt-hero-label">Tổ phụ trách SÂN TRƯỜNG tuần ${Duty.week}</div>
        <div class="dt-hero-group">Tổ ${dutyEscape(String(Duty.outdoorGroup))}</div>
      </div>
    </div>
  ` : '';
  let outdoorSessionsHtml = '';
  if (Duty.outdoorGroup && todayLabel && todayOutdoorSlots.length > 0) {
    const sang  = todayOutdoorSlots.filter(r => r.slot === 'sang');
    const chieu = todayOutdoorSlots.filter(r => r.slot === 'chieu');
    outdoorSessionsHtml = `<div class="dt-sessions">
      ${dutyRenderSessionCard('sang',   sang,  outdoorItems, canEdit)}
      ${dutyRenderSessionCard('chieu', chieu,  outdoorItems, canEdit)}
    </div>`;
  }
  body.innerHTML = `<div class="dt-today"><div class="dt-columns">
    <div class="dt-col">${heroHtml}${sessionsHtml}</div>
    <div class="dt-col">${outdoorHeroHtml}${outdoorSessionsHtml}</div>
  </div></div>`;
  document.getElementById('da-goto-setup')?.addEventListener('click', () => { dutyOpenWizard(); });
  dutyBindTodayEvents(canEdit);
}

function dutyRenderSessionCard(slot, rows, items, canEdit) {
  const cls = slot === 'sang' ? 'morning' : 'afternoon';
  const label = slot === 'sang' ? 'SÁNG' : 'CHIỀU';
  if (!rows.length) {
    return `<div class="dt-session">
      <div class="dt-session-head">
        <span class="dt-session-badge ${cls}">${label}</span>
        <span class="dt-session-title" style="color:var(--text-3);font-weight:500">Không có buổi này</span>
      </div>
    </div>`;
  }
  // Tổng hợp: mỗi workItem là 1 task, gộp names từ tất cả các row của buổi này
  const allDone = rows.every(r => r.items.every(it => dutyIsDone(it.status)));
  const taskBlocks = items.map(itemDef => {
    // Tìm tất cả ô (it) cho itemDef trong buổi này
    const cells = rows.flatMap(r => r.items.filter(it => it.workItemId === itemDef.id));
    if (!cells.length) return '';
    const cell = cells[0]; // lấy cell đầu (cùng buổi, chỉ có 1 row per slot)
    const isDone = cells.every(c => dutyIsDone(c.status));
    // rowIndex = id thật của roster entry trong DB (cell.rowIndex không tồn tại
    // trong dữ liệu backend trả về — dùng nhầm field này khiến mọi thao tác
    // (đánh dấu muộn/bỏ trực, lưu phân công, đổi ca, vắng có lý do...) đều gửi
    // "undefined" lên server và âm thầm thất bại).
    const rowIndex = cell.id;
    const isEditing = Duty.editingCell?.rowIndex === rowIndex && Duty.editingCell?.workItemId === itemDef.id;
    const exempted = (cell.exemptedStudents || []);
    const peopleHtml = (cell.assignedStudents || []).length
      ? (cell.assignedStudents || []).map(s => {
          const penaltyTag = s.penalty === 'absent'
            ? `<span class="dt-penalty-tag bo">Bỏ trực</span>`
            : s.penalty === 'late'
              ? `<span class="dt-penalty-tag muon">Muộn</span>`
              : '';
          const debtTag = s.owedSlots > 0 ? `<span class="dt-debt-tag">⚠ Nợ ${s.owedSlots}</span>` : '';
          const pClass = s.penalty ? 'penalised' : '';
          const menuKey = `${rowIndex}|${s.id}`;
          const isOpen = Duty.openKebab === menuKey;
          // v3: lấy danh sách cùng tổ để đổi ca (trừ chính học sinh này)
          const sameGroupStudents = (Duty.students || []).filter(st =>
            Number(st.group) === Number(rows[0]?.group) && st.id !== s.id
          );
          const excuseBtn = canExcuseAbsence(readDutyUser())
            ? `<button data-excuse="${rowIndex}|${s.id}|${dutyEscape(itemDef.id)}">🗓 Vắng có lý do</button>`
            : '';
          const kebabMenu = !canEdit ? '' : `
            <div class="dt-task-actions">
              <button class="dt-kebab-btn" data-kebab="${menuKey}" title="Tuỳ chọn">⋯</button>
              ${isOpen ? `<div class="dt-kebab-menu" data-kebab-menu="${menuKey}">
                ${!s.penalty ? `
                  <button data-mark="${rowIndex}|${s.id}|late">Đánh dấu đến muộn (+1)</button>
                  <button data-mark="${rowIndex}|${s.id}|absent">Đánh dấu bỏ trực (+2)</button>
                ` : `
                  <button data-unmark="${rowIndex}|${s.id}">↺ Bỏ đánh dấu vi phạm</button>
                `}
                <button data-swap-open="${rowIndex}|${dutyEscape(s.id)}|${dutyEscape(itemDef.id)}|${dutyEscape(s.name)}|${dutyEscape(String(rows[0]?.group||''))}">🔄 Xin đổi ca</button>
                ${excuseBtn}
              </div>` : ''}
            </div>`;
          return `<div class="dt-person">
            <span class="dt-person-name ${pClass}">${dutyEscape(s.name)}${s.fromDebt?`<small style="font-size:9.5px;color:var(--warn);margin-left:4px;">trả nợ</small>`:''}</span>
            ${debtTag}${penaltyTag}${kebabMenu}
          </div>`;
        }).join('')
      : `<div class="dt-person"><span style="font-size:12px;color:var(--text-3);font-style:italic;">Chưa phân công</span></div>`;
    const editForm = isEditing ? dutyRenderCellEditForm(rows[0], cell, itemDef) : '';
    // v3 — form đổi ca inline (hiện ngay dưới task này nếu đang mở cho đúng học sinh + việc)
    const swapF = Duty.swapFormOpen;
    const swapForm = (swapF && swapF.rowIndex === rowIndex && swapF.workItemId === itemDef.id)
      ? dutyRenderSwapForm(swapF)
      : '';
    // v3 — form vắng có lý do inline
    const excF = Duty.excuseFormOpen;
    const excuseForm = (excF && excF.rowIndex === rowIndex && excF.workItemId === itemDef.id)
      ? dutyRenderExcuseForm(excF)
      : '';
    return `
      <div class="dt-task${isEditing?' is-editing':''}">
        <button class="dt-check ${isDone?'checked':''}" data-toggle-done="${rowIndex}" title="${isDone?'Đánh dấu chưa xong':'Đánh dấu hoàn thành'}">✓</button>
        <div class="dt-task-info">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="dt-task-name">${dutyEscape(itemDef.name)}</span>
            ${isDone?`<span class="da-chip done">✓ Xong</span>`:''}
            ${cell.mode === 'manual' ? `<span class="da-badge warn" style="font-size:10px;padding:1px 6px;">nợ</span>` : ''}
          </div>
          <div class="dt-task-people">${peopleHtml}</div>
          ${exempted.length?`<div class="dt-exempt">Miễn trừ: ${dutyEscape(exempted.map(e=>e.name).join(', '))}</div>`:''}
        </div>
        ${canEdit ? `<div class="dt-task-actions" style="margin-top:0">
          <button class="dt-kebab-btn" data-edit-cell="${rowIndex}|${itemDef.id}" title="Sửa phân công">✎</button>
        </div>` : ''}
      </div>
      ${editForm}${swapForm}${excuseForm}`;
  }).join('');
  return `<div class="dt-session">
    <div class="dt-session-head">
      <span class="dt-session-badge ${cls}">${label}</span>
      <span class="dt-session-title">${rows[0]?.day || ''}</span>
      <span class="dt-session-done">
        ${allDone ? `<span class="da-chip done">Hoàn thành</span>` : `<span class="da-chip pend">Đang trực</span>`}
      </span>
    </div>
    <div class="dt-tasks">${taskBlocks || '<div class="da-empty">Không có đầu việc.</div>'}</div>
  </div>`;
}

function dutyRenderCellEditForm(row, cell, itemDef) {
  const groupStudents = (Duty.students || []).filter(s => Number(s.group) === Number(row.group));
  const selectedIds = new Set((cell.assignedStudents || []).map(s => s.id));
  const checks = groupStudents.length
    ? groupStudents.map(s => `<label><input type="checkbox" class="edit-check" value="${dutyEscape(s.id)}" data-name="${dutyEscape(s.name)}" ${selectedIds.has(s.id)?'checked':''} />${dutyEscape(s.name)}</label>`).join('')
    : `<span style="font-size:12px;color:var(--text-3);">Tổ ${dutyEscape(String(row.group))} chưa có học sinh.</span>`;
  return `<div class="dt-edit-form" id="dt-edit-${cell.id}-${itemDef.id}">
    <div style="font-size:11.5px;font-weight:700;color:var(--text-3);">Phân công lại — ${dutyEscape(itemDef.name)} (Tổ ${dutyEscape(String(row.group))})</div>
    <div class="dt-check-list">${checks}</div>
    <div class="dt-edit-form-row">
      <input type="text" id="dt-note-${cell.id}" value="${dutyEscape(cell.note||'')}" placeholder="Ghi chú (không bắt buộc)" style="flex:1;font-family:inherit;font-size:12.5px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:8px;padding:6px 9px;" />
    </div>
    <div class="dt-form-actions">
      <button class="da-btn sm" data-cancel-edit="${cell.id}|${itemDef.id}">Huỷ</button>
      <button class="da-btn sm primary" data-save-edit="${cell.id}|${itemDef.id}">Lưu</button>
    </div>
  </div>`;
}

/* ── v3: Form xin đổi ca inline ── */
function dutyRenderSwapForm(swapF) {
  const groupStudents = swapF.groupStudents || [];
  const opts = groupStudents.length
    ? groupStudents.map(s => `<option value="${dutyEscape(s.id)}" data-name="${dutyEscape(s.name)}">${dutyEscape(s.name)}</option>`).join('')
    : `<option value="">— Tổ này không có bạn nào khác —</option>`;
  return `<div class="dt-edit-form" id="dt-swap-form">
    <div style="font-size:11.5px;font-weight:700;color:var(--text-3);">Xin đổi ca — ${dutyEscape(swapF.studentName)} (trong tổ)</div>
    <p class="da-form-hint" style="margin:4px 0;">Chỉ đổi được với bạn cùng tổ trực tuần này. Bạn được chọn sẽ nhận thông báo để đồng ý/từ chối.</p>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:700;color:var(--text-3);">Đổi với bạn
      <select id="dt-swap-target" style="font-family:inherit;font-size:12.5px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:7px;padding:6px 8px;">
        ${opts}
      </select>
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:700;color:var(--text-3);">Lý do (không bắt buộc)
      <input type="text" id="dt-swap-reason" placeholder="Vd: Bận ôn thi" style="font-family:inherit;font-size:12.5px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:7px;padding:6px 8px;" />
    </label>
    <div class="dt-form-actions">
      <button class="da-btn sm" id="dt-swap-cancel">Huỷ</button>
      <button class="da-btn sm primary" id="dt-swap-submit" ${!groupStudents.length?'disabled':''}>Gửi yêu cầu đổi ca</button>
    </div>
  </div>`;
}

/* ── v3: Form vắng có lý do inline (chỉ role được phép) ── */
function dutyRenderExcuseForm(excF) {
  return `<div class="dt-edit-form" id="dt-excuse-form">
    <div style="font-size:11.5px;font-weight:700;color:var(--text-3);">Xác nhận vắng có lý do — ${dutyEscape(excF.studentName)}</div>
    <p class="da-form-hint" style="margin:4px 0;">Xác nhận vắng có lý do: không tính vi phạm, nhưng sẽ tạo khoản bù ca. Hệ thống sẽ chọn ngẫu nhiên 1 bạn trong tổ làm thay.</p>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:700;color:var(--text-3);">Lý do vắng
      <input type="text" id="dt-excuse-reason" placeholder="Vd: Nghỉ ốm có phép" required style="font-family:inherit;font-size:12.5px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:7px;padding:6px 8px;" />
    </label>
    <div class="dt-form-actions">
      <button class="da-btn sm" id="dt-excuse-cancel">Huỷ</button>
      <button class="da-btn sm primary" id="dt-excuse-submit">Xác nhận vắng có lý do</button>
    </div>
  </div>`;
}

function dutyBindTodayEvents(canEdit) {
  const body = document.getElementById('da-body');
  if (!body) return;
  // Toggle done
  body.querySelectorAll('[data-toggle-done]').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const rowIndex = btn.dataset.toggleDone; // id thật của roster entry, không phải số
      // Tìm cell tương ứng — có thể ở lớp hoặc sân trường
      const slot = Duty.classSlots.flatMap(r => r.items).find(it => it.id === rowIndex)
        || Duty.outdoorSlots.flatMap(r => r.items).find(it => it.id === rowIndex);
      if (!slot) return;
      const next = dutyIsDone(slot.status) ? 'Chưa hoàn thành' : 'Hoàn thành';
      try {
        const result = await dutyApiPost('saveDutyOverride', { id: rowIndex, status: next });
        if (result?.ok === false) throw new Error(result.error || 'Backend từ chối yêu cầu.');
        slot.status = next;
        dutyRenderBody();
      } catch(err) { dutyNotify('Không lưu được: ' + (err?.message||err), 'error'); }
    };
  });
  // Edit cell toggle
  body.querySelectorAll('[data-edit-cell]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const [ri, wid] = btn.dataset.editCell.split('|');
      const key = { rowIndex: ri, workItemId: wid };
      const isOpen = Duty.editingCell?.rowIndex === key.rowIndex && Duty.editingCell?.workItemId === key.workItemId;
      Duty.editingCell = isOpen ? null : key;
      Duty.openKebab = null;
      dutyRenderBody();
    };
  });
  // Cancel edit
  body.querySelectorAll('[data-cancel-edit]').forEach(btn => {
    btn.onclick = () => { Duty.editingCell = null; dutyRenderBody(); };
  });
  // Save edit
  body.querySelectorAll('[data-save-edit]').forEach(btn => {
    btn.onclick = async () => {
      const [ri, wid] = btn.dataset.saveEdit.split('|');
      const rowIndex = ri; // id thật của roster entry
      const formEl = document.getElementById(`dt-edit-${ri}-${wid}`);
      if (!formEl) return;
      const assignedStudents = Array.from(formEl.querySelectorAll('input.edit-check:checked'))
        .map(cb => ({ id: cb.value, name: cb.dataset.name }));
      const noteEl = document.getElementById(`dt-note-${ri}`);
      try {
        const result = await dutyApiPost('saveDutyOverride', {
          id: rowIndex, assignedStudents, note: noteEl ? noteEl.value.trim() : undefined,
        });
        if (result?.ok === false) throw new Error(result.error || 'Backend từ chối yêu cầu.');
        Duty.editingCell = null;
        await dutyLoadClass();
        dutyNotify('Đã lưu phân công', 'success');
      } catch(err) { dutyNotify('Không lưu được: ' + (err?.message||err), 'error'); }
    };
  });
  // Kebab menu — mở/đóng
  body.querySelectorAll('[data-kebab]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const key = btn.dataset.kebab;
      Duty.openKebab = Duty.openKebab === key ? null : key;
      Duty.editingCell = null;
      dutyRenderBody();
      // Đóng khi click ra ngoài
      setTimeout(() => {
        document.addEventListener('click', dutyCloseKebabOutside, { once: true });
      }, 0);
    };
  });
  // Đánh dấu vi phạm
  body.querySelectorAll('[data-mark]').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const [rowIndex, studentId, kind] = btn.dataset.mark.split('|'); // kind: 'late' | 'absent'
      Duty.openKebab = null;
      try {
        const result = await dutyApiPost('markDutyAssignmentPenalty', { id: rowIndex, studentId, penaltyType: kind });
        if (result?.ok === false) throw new Error(result.error || 'Backend từ chối yêu cầu.');
        await dutyLoadClass();
        dutyNotify(kind==='absent' ? 'Đã đánh dấu bỏ trực (+2 lượt nợ)' : 'Đã đánh dấu đến muộn (+1 lượt nợ)', 'success');
      } catch(err) { dutyNotify('Không đánh dấu được: ' + (err?.message||err), 'error'); }
    };
  });
  // Bỏ đánh dấu vi phạm
  body.querySelectorAll('[data-unmark]').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const [rowIndex, studentId] = btn.dataset.unmark.split('|');
      Duty.openKebab = null;
      try {
        const result = await dutyApiPost('unmarkDutyAssignmentPenalty', { id: rowIndex, studentId });
        if (result?.ok === false) throw new Error(result.error || 'Backend từ chối yêu cầu.');
        await dutyLoadClass();
        dutyNotify('Đã bỏ đánh dấu. Lượt nợ đã cộng trước đó không tự hoàn — sửa ở tab Quản lý → Sổ nợ.', 'success');
      } catch(err) { dutyNotify('Không bỏ đánh dấu được: ' + (err?.message||err), 'error'); }
    };
  });
  // v3 — Mở form xin đổi ca
  body.querySelectorAll('[data-swap-open]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const [rowIndex, studentId, workItemId, studentName, group] = btn.dataset.swapOpen.split('|');
      Duty.openKebab = null;
      const groupStudents = (Duty.students || []).filter(s =>
        Number(s.group) === Number(group) && s.id !== studentId
      );
      Duty.swapFormOpen = { rowIndex, workItemId, studentId, studentName, group: Number(group), groupStudents };
      Duty.excuseFormOpen = null;
      Duty.editingCell = null;
      dutyRenderBody();
    };
  });
  body.querySelectorAll('[data-excuse]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const [rowIndex, studentId, workItemId] = btn.dataset.excuse.split('|');
      const slot = Duty.classSlots.flatMap(r => r.items).find(it => it.id === rowIndex)
        || Duty.outdoorSlots.flatMap(r => r.items).find(it => it.id === rowIndex);
      const stu = (slot?.assignedStudents || []).find(s => s.id === studentId);
      Duty.openKebab = null;
      Duty.excuseFormOpen = { rowIndex, workItemId, studentId, studentName: stu?.name || studentId };
      Duty.swapFormOpen = null;
      Duty.editingCell = null;
      dutyRenderBody();
    };
  });
  // v3 — Event delegation trên body cho các nút trong swap/excuse form
  // Remove trước để tránh bind nhân bản sau mỗi lần render
  body.removeEventListener('click', dutyHandleTodayDelegated);
  body.addEventListener('click', dutyHandleTodayDelegated);
}

async function dutyHandleTodayDelegated(e) {
  // Huỷ form đổi ca
  if (e.target.id === 'dt-swap-cancel') {
    Duty.swapFormOpen = null; dutyRenderBody(); return;
  }
  // Submit form đổi ca
  if (e.target.id === 'dt-swap-submit') {
    const swapF = Duty.swapFormOpen;
    if (!swapF) return;
    const targetEl = document.getElementById('dt-swap-target');
    const toStudentId = targetEl?.value;
    const toStudentName = targetEl?.selectedOptions[0]?.dataset?.name || targetEl?.selectedOptions[0]?.text || '';
    if (!toStudentId) { dutyNotify('Chọn bạn để đổi ca.', 'error'); return; }
    const reason = document.getElementById('dt-swap-reason')?.value.trim() || '';
    e.target.disabled = true;
    try {
      const result = await dutyApiPost('requestDutySwap', {
        fromStudentId: swapF.studentId,
        toStudentId,
        rosterEntryId: swapF.rowIndex, // id thật của roster entry — không phải chuỗi ghép
        reason,
      });
      if (result?.ok === false) throw new Error(result.error || 'Backend từ chối yêu cầu.');
      Duty.swapFormOpen = null;
      dutyNotify(`Đã gửi yêu cầu đổi ca đến ${toStudentName}. Chờ bạn ấy xác nhận.`, 'success');
      dutyRenderBody();
    } catch(err) {
      e.target.disabled = false;
      dutyNotify('Không gửi được: ' + (err?.message||err), 'error');
    }
    return;
  }
  // Huỷ form vắng có lý do
  if (e.target.id === 'dt-excuse-cancel') {
    Duty.excuseFormOpen = null; dutyRenderBody(); return;
  }
  // Submit form vắng có lý do
  if (e.target.id === 'dt-excuse-submit') {
    const excF = Duty.excuseFormOpen;
    if (!excF) return;
    const reason = document.getElementById('dt-excuse-reason')?.value.trim();
    if (!reason) { dutyNotify('Nhập lý do vắng trước.', 'error'); return; }
    e.target.disabled = true;
    try {
      const result = await dutyApiPost('markDutyExcusedAbsence', {
        id: excF.rowIndex,
        studentId: excF.studentId,
        workItemId: excF.workItemId,
        reason,
        // Backend chỉ đọc actor.role (không có fallback vaiTro như phía client) —
        // chuẩn hoá tại đây để tài khoản lưu quyền ở field "vaiTro" không bị từ chối oan.
        actor: (() => { const u = readDutyUser(); return u ? { ...u, role: u.role || u.vaiTro } : u; })(),
      });
      if (result?.ok === false) throw new Error(result.error || 'Backend từ chối yêu cầu.');
      Duty.excuseFormOpen = null;
      await dutyLoadClass();
      dutyNotify(`Đã xác nhận ${excF.studentName} vắng có lý do. Hệ thống sẽ chọn người làm thay và tạo bù ca.`, 'success');
    } catch(err) {
      e.target.disabled = false;
      dutyNotify('Không xác nhận được: ' + (err?.message||err), 'error');
    }
    return;
  }
}

function dutyCloseKebabOutside(e) {
  // Nếu click không vào menu hoặc nút kebab → đóng
  if (!e.target.closest('[data-kebab]') && !e.target.closest('[data-kebab-menu]')) {
    if (Duty.openKebab) { Duty.openKebab = null; dutyRenderBody(); }
  }

}

/* ═══════════════════════════════════════════════════════════

   TAB 1 — TUẦN NÀY
   ═══════════════════════════════════════════════════════════ */

function dutyRenderWeek() {
  const body = document.getElementById('da-body');
  if (!body) return;
  if (!Duty.classLoaded && !Duty.classLoading) { dutyLoadClass(); return; }
  if (Duty.classLoading) { body.innerHTML = `<div class="da-loading">Đang tải lịch tuần…</div>`; return; }
  if (Duty.classError)   { body.innerHTML = `<div class="da-error">${dutyEscape(Duty.classError)}</div>`; return; }
  const classRows = Duty.classSlots || [];
  const outdoorRows = Duty.outdoorSlots || [];
  if (!classRows.length && !outdoorRows.length) {
    const canEdit = dutyCanEdit();
    body.innerHTML = `<div class="dt-no-schedule">
      <strong>Chưa có lịch trực tuần ${Duty.week}</strong>
      <p style="margin:8px 0 12px;font-size:13px;color:var(--text-3);">Cần cấu hình theo đúng thứ tự trước khi bấm "Tạo lịch".</p>
      ${canEdit ? `<button class="da-btn primary" id="dw-goto-setup">Đi tới cấu hình</button>` : ''}
    </div>`;
    document.getElementById('dw-goto-setup')?.addEventListener('click', () => { dutyOpenWizard(); });
    return;
  }
  const classTable = classRows.length ? dutyBuildWeekTable(classRows, Duty.workItems || []) : '';
  const outdoorTable = outdoorRows.length ? dutyBuildWeekTable(outdoorRows, Duty.outdoorWorkItems || []) : '';
  body.innerHTML = `
    <div class="dw-table-wrap">
      <div class="dm-section-title" style="margin-bottom:8px;">🏠 Trong lớp${Duty.weekGroup?` — Tổ ${dutyEscape(String(Duty.weekGroup))}`:''}</div>
      <table class="dw-table">${classTable}</table>
    </div>
    ${outdoorTable ? `
    <div class="dw-table-wrap" style="margin-top:18px;">
      <div class="dm-section-title" style="margin-bottom:8px;">🏫 Sân trường${Duty.outdoorGroup?` — Tổ ${dutyEscape(String(Duty.outdoorGroup))}`:''}</div>
      <table class="dw-table">${outdoorTable}</table>
    </div>` : ''}`;
}

function dutyBuildWeekTable(rows, items) {
  const todayLabel = dutyTodayDayLabel();
  const thead = `<thead><tr>
    <th class="day-col">Ngày / Buổi</th>
    ${items.map(it => `<th>${dutyEscape(it.name)}</th>`).join('')}
  </tr></thead>`;
  const tbody = rows.map(row => {
    const isToday = row.day === todayLabel;
    const sessionCls = row.slot === 'sang' ? 'morning' : 'afternoon';
    const allDone = row.items.length > 0 && row.items.every(it => dutyIsDone(it.status));
    const dayCell = `<td class="${isToday?'dw-today-row':''}">
      <div class="dw-slot-cell">
        <span class="dw-slot-badge ${sessionCls}">${row.slot === 'sang' ? 'S' : 'C'}</span>
        <div>
          <div class="dw-day">${dutyEscape(row.day)}${isToday?' <span style="color:var(--accent);font-size:10px;font-weight:800;">● HÔM NAY</span>':''}</div>
          ${allDone ? `<span class="da-chip done" style="font-size:10px;">✓ Xong</span>` : ''}
        </div>
      </div>
    </td>`;
    const cells = items.map(itemDef => {
      const cell = row.items.find(it => it.workItemId === itemDef.id);
      if (!cell) return `<td><span style="color:var(--text-3);font-size:12px;">—</span></td>`;
      const names = (cell.assignedStudents || []).map(s =>
        `<div class="dw-name ${s.penalty?'penalised':''}">${dutyEscape(s.name)}${s.penalty==='absent'?` <span class="dt-penalty-tag bo" style="font-size:9.5px;">Bỏ</span>`:s.penalty==='late'?` <span class="dt-penalty-tag muon" style="font-size:9.5px;">Muộn</span>`:''}</div>`
      ).join('') || `<span style="font-size:12px;color:var(--text-3);font-style:italic;">Chưa phân công</span>`;
      const doneChip = dutyIsDone(cell.status) ? `<span class="da-chip done" style="font-size:10px;display:block;margin-bottom:4px;">✓</span>` : '';
      return `<td>${doneChip}<div class="dw-names">${names}</div></td>`;
    }).join('');
    return `<tr${isToday?' style="background:color-mix(in srgb,var(--accent) 5%,var(--surface))"':''}>${dayCell}${cells}</tr>`;
  }).join('');
  return `${thead}<tbody>${tbody}</tbody>`;
}

/* ═══════════════════════════════════════════════════════════

   TAB 2 — QUẢN LÝ
   ═══════════════════════════════════════════════════════════ */

function dutyRenderManage() {
  const body = document.getElementById('da-body');
  if (!body) return;
  const canEdit = dutyCanEdit();
  // Khởi tải nếu chưa có
  if (!Duty.debtsLoaded && !Duty.debtsLoading) { dutyLoadDebts(); return; }
  if (!Duty.classLoaded && !Duty.classLoading) { dutyLoadClass(); return; }
  let html = `<div class="dm-layout">`;
  /* ── 1. Sổ nợ — v3: tách 3 nhóm theo kind ── */
  const allDebts = (Duty.debts || []).slice().sort((a,b) => new Date(a.ngayPhatSinh||a.createdWeek||0) - new Date(b.ngayPhatSinh||b.createdWeek||0));
  // Tách theo kind; bản ghi cũ (không có kind) mặc định là 'penalty' để tương thích ngược
  const penaltyDebts   = allDebts.filter(d => !d.kind || d.kind === 'penalty');
  const excusedDebts   = allDebts.filter(d => d.kind === 'excusedAbsence');
  const swapMkDebts    = allDebts.filter(d => d.kind === 'swapMakeup');
  function renderDebtGroup(debts, label, emptyMsg, showClear) {
    if (!debts.length) return `<div class="da-empty" style="font-size:12px;padding:6px 0;">${emptyMsg}</div>`;
    return `<div class="dm-debt-list">` + debts.map((d, idx) => {
      const meta = d.kind === 'swapMakeup'
        ? `<span class="da-badge accent" style="font-size:10px;">Bù ca</span> <span style="margin-left:4px;font-size:11.5px;">A sẽ làm thay B ở lượt <strong>${dutyEscape(d.workItemId||'(việc này)')}</strong> tiếp theo</span>`
        : `<span class="da-badge ${idx===0?'warn':'accent'}" style="font-size:10px;">${idx===0?'FIFO — trả trước':'Chờ'}</span>
           <span style="margin-left:6px;font-size:11.5px;">Từ ${dutyEscape(d.ngayPhatSinh||d.createdWeek||'—')}</span>`;
      return `<div class="dm-debt-row">
        <div class="dm-debt-info">
          <div class="dm-debt-name">${dutyEscape(d.nguoiNoName||d.studentId||'?')} <span style="color:var(--text-3);font-weight:500;">nợ</span> ${dutyEscape(d.nguoiChoNoName||d.owedToStudentId||'?')}</div>
          <div class="dm-debt-meta">${meta}</div>
          ${d.note ? `<div class="dm-debt-note" style="font-size:11px;color:var(--text-3);margin-top:2px;">${dutyEscape(d.note)}</div>` : ''}
        </div>
        ${showClear ? `<button class="da-btn sm danger" data-clear-debt="${dutyEscape(d.id)}" data-clear-name="${dutyEscape(d.nguoiNoName||d.studentId||'')}">Xoá nợ</button>` : ''}
      </div>`;
    }).join('') + `</div>`;
  }
  html += `
    <div>
      <div class="dm-section-head">
        <span class="dm-section-title">Sổ nợ trực</span>
        ${canEdit ? `<button class="da-btn sm primary" id="dm-penalty-toggle">${Duty.penaltyFormOpen?'Đóng':'+ Ghi nợ mới'}</button>` : ''}
      </div>`;
  if (Duty.debtsLoading) { html += `<div class="da-loading" style="padding:16px;">Đang tải sổ nợ…</div>`; }
  else if (Duty.debtsError) { html += `<div class="da-error" style="padding:16px;">${dutyEscape(Duty.debtsError)}</div>`; }
  else if (Duty.penaltyFormOpen && canEdit) { html += dutyRenderPenaltyForm(); }
  else if (!allDebts.length) { html += `<div class="da-empty">Không ai đang nợ lượt trực.</div>`; }
  else {
    // v3: 3 nhóm rõ ràng
    html += `
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div>
          <div class="dm-debt-group-label">⚠ Đang bị phạt</div>
          ${renderDebtGroup(penaltyDebts, 'Đang bị phạt', 'Không có ai đang bị phạt.', canEdit)}
        </div>
        <div>
          <div class="dm-debt-group-label">📋 Đang chờ bù (vắng có lý do)</div>
          ${renderDebtGroup(excusedDebts, 'Đang chờ bù (vắng lý do)', 'Không có ai đang chờ bù vắng có lý do.', canEdit)}
        </div>
        <div>
          <div class="dm-debt-group-label">🔄 Đang chờ bù ca (đổi ca)</div>
          ${renderDebtGroup(swapMkDebts, 'Đang chờ bù ca', 'Không có khoản bù ca nào đang chờ.', canEdit)}
        </div>
      </div>`;
  }
  html += `</div>`;
  /* ── 2. Sân trường (tự sinh song song với lớp) ── */
  html += `
    <div>
      <div class="dm-section-head">
        <span class="dm-section-title">Sân trường (tuần ${Duty.week})</span>
      </div>
      ${Duty.outdoorGroup
        ? `<div class="da-badge accent" style="width:fit-content;">🏫 Tổ ${dutyEscape(String(Duty.outdoorGroup))} phụ trách sân trường tuần này — tự động</div>
           <p class="da-form-hint" style="margin-top:6px;">Lịch sân trường tự sinh song song với lớp, xem &amp; sửa tay ở tab "Hôm nay" / "Tuần này" như lớp. Cấu hình đầu việc riêng ở "Cấu hình đầu việc sân trường" bên dưới.</p>`
        : `<div class="da-empty">Cần ít nhất 2 Tổ để tách riêng sân trường khỏi lớp.</div>`}
    </div>`;
  /* ── 3. Cấu hình (chỉ tổ trưởng) ── */
  if (canEdit) {
    html += `<div>
      <div class="dm-section-head"><span class="dm-section-title">Cấu hình</span></div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${dutyRenderAccordion('swap-requests', 'Yêu cầu đổi ca', `${(Duty.swapRequests||[]).length} yêu cầu`, Duty.swapRequestsOpen, Duty.swapRequestsOpen ? dutyRenderSwapRequestsPanel() : '')}
        ${dutyRenderAccordion('swap-makeups', 'Đang chờ bù ca', `${(Duty.swapMakeups||[]).filter(m=>m.status==='pending').length} bù ca pending`, Duty.swapMakeupsOpen, Duty.swapMakeupsOpen ? dutyRenderSwapMakeupsPanel() : '')}
        ${dutyRenderAccordion('override-config', 'Ghi đè theo ngày/tuần', `${(Duty.overrides||[]).length} ghi đè`, Duty.overrideOpen, Duty.overrideOpen ? dutyRenderOverridePanel() : '')}
        ${dutyRenderAccordion('week-config', 'Khởi tạo lịch tuần', 'Tổ trực · Xung kích', Duty.weekConfigOpen, Duty.weekConfigOpen ? dutyRenderWeekConfigPanel() : '')}
        ${dutyRenderAccordion('outdoor-week-config', 'Khởi tạo lịch sân trường', 'Tổ trực · Xung kích', Duty.outdoorWeekConfigOpen, Duty.outdoorWeekConfigOpen ? dutyRenderOutdoorWeekConfigPanel() : '')}
        ${dutyRenderAccordion('workitems-config', 'Cấu hình đầu việc (lớp)', `${(Duty.workItems||[]).length} việc`, Duty.workItemsConfigOpen, Duty.workItemsConfigOpen ? dutyRenderWorkItemsPanel() : '')}
        ${dutyRenderAccordion('outdoor-workitems-config', 'Cấu hình đầu việc sân trường', `${(Duty.outdoorWorkItems||[]).length} việc`, Duty.outdoorWorkItemsConfigOpen, Duty.outdoorWorkItemsConfigOpen ? dutyRenderOutdoorWorkItemsPanel() : '')}
        ${dutyRenderAccordion('parking-config', 'Nhà xe cố định', '2 người cả năm', Duty.parkingConfigOpen, Duty.parkingConfigOpen ? dutyRenderParkingPanel() : '')}
        ${dutyRenderAccordion('rules-panel', 'Quy tắc & Mức phạt', `${(Duty.rules||[]).length} quy tắc`, Duty.rulesOpen, Duty.rulesOpen ? dutyRenderRulesPanel() : '')}
      </div>
    </div>`;
  }
  /* ── 4. Danger zone (chỉ canEdit) ── */
  if (canEdit) {
    const hasRoster = (Duty.classSlots||[]).length > 0 || (Duty.outdoorSlots||[]).length > 0;
    html += `
    <div class="dm-danger-zone">
      <div class="dm-section-head">
        <span class="dm-section-title" style="color:var(--danger);">⚠ Vùng nguy hiểm</span>
      </div>
      <p class="da-form-hint">Các thao tác dưới đây <strong>không thể hoàn tác</strong>. Chỉ dùng khi cần thiết.</p>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px;">
        <div class="dm-danger-row">
          <div>
            <div class="dm-danger-label">Xoá lịch tuần ${Duty.week}</div>
            <div class="dm-danger-desc">Xoá toàn bộ slots lịch trực tuần này. Giữ nguyên cấu hình tổ &amp; xung kích — bấm "Khởi tạo lịch tuần" lại để tạo mới.</div>
          </div>
          <button class="da-btn danger" id="dm-clear-roster" ${!hasRoster?'disabled title="Tuần này chưa có lịch"':''}>Xoá lịch</button>
        </div>
        <div class="dm-danger-row">
          <div>
            <div class="dm-danger-label">Xoá sạch tuần ${Duty.week}</div>
            <div class="dm-danger-desc">Xoá cả lịch lẫn cấu hình tổ trực &amp; xung kích tuần này. Phải cấu hình lại từ đầu.</div>
          </div>
          <button class="da-btn danger" id="dm-clear-all" ${!hasRoster?'disabled title="Tuần này chưa có lịch"':''}>Xoá sạch</button>
        </div>
      </div>
    </div>`;
  }
  html += `</div>`;
  body.innerHTML = html;
  dutyBindManageEvents(canEdit);
}

function dutyRenderAccordion(id, label, sub, isOpen, bodyHtml) {
  return `<div class="dm-accordion" id="dm-acc-${id}">
    <button class="dm-accordion-head" data-accordion="${id}">
      <span class="dm-accordion-icon">${isOpen?'▾':'▶'}</span>
      <span class="dm-accordion-label">${dutyEscape(label)}</span>
      <span class="dm-accordion-sub">${dutyEscape(sub)}</span>
    </button>
    <div class="dm-accordion-body" id="dm-acc-body-${id}" ${isOpen?'':'hidden'}>${bodyHtml}</div>
  </div>`;
}

/* ── Cấu hình tuần ── */

function dutyRenderWeekConfigPanel() {
  if (!Duty.studentsLoaded) return `<div class="da-loading" style="padding:8px;">Đang tải…</div>`;
  const groups = Array.from(new Set((Duty.students||[]).map(s=>Number(s.group)))).filter(Boolean).sort((a,b)=>a-b);
  const draft = Duty.weekConfigDraft || { group: Duty.weekGroup || groups[0] || 1, exemptIds: (Duty.exemptList||[]).map(e=>e.studentId) };
  Duty.weekConfigDraft = draft;
  const members = (Duty.students||[]).filter(s=>Number(s.group)===Number(draft.group));
  const exemptSet = new Set(draft.exemptIds);
  return `
    <p class="da-form-hint">Chọn Tổ trực LỚP và ai đang Xung kích/miễn trừ tuần này. Bấm "Khởi tạo" để áp dụng — lịch cũ (cả lớp lẫn sân trường) sẽ bị xoá.</p>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:700;color:var(--text-3);">Tổ trực LỚP tuần ${Duty.week}
      <select id="dm-wc-group" style="font-family:inherit;font-size:13px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:8px;padding:7px 9px;">
        ${groups.length ? groups.map(g=>`<option value="${g}" ${g===draft.group?'selected':''}>Tổ ${g}</option>`).join('') : '<option>— Chưa có Tổ —</option>'}
      </select>
    </label>
    <p class="da-form-hint" style="margin-top:-4px;">Lưu ý: chỉ khởi tạo lại lịch <strong>Lớp</strong>. Muốn đổi Tổ trực Sân trường, dùng tab <strong>Tạo lịch trực</strong>.</p>
    <div>
      <div style="font-size:11.5px;font-weight:700;color:var(--text-3);margin-bottom:6px;">Xung kích / Miễn trừ tuần này</div>
      <div class="da-check-group">
        ${members.length ? members.map(s=>`<label><input type="checkbox" data-exempt-id="${dutyEscape(s.id)}" ${exemptSet.has(s.id)?'checked':''} />${dutyEscape(s.name)}</label>`).join('') : `<span style="font-size:12px;color:var(--text-3);">Tổ này chưa có học sinh.</span>`}
      </div>
    </div>
    <div class="da-form-actions">
      <button class="da-btn primary" id="dm-wc-generate" ${Duty.weekConfigSaving?'disabled':''}>${Duty.weekConfigSaving?'Đang khởi tạo…':'↻ Khởi tạo lịch tuần'}</button>
    </div>`;
}

/* ── Cấu hình tuần — Sân trường (nhánh riêng, không đụng Lớp) ── */

function dutyRenderOutdoorWeekConfigPanel() {
  if (!Duty.studentsLoaded) return `<div class="da-loading" style="padding:8px;">Đang tải…</div>`;
  const groups = Array.from(new Set((Duty.students||[]).map(s=>Number(s.group)))).filter(Boolean).sort((a,b)=>a-b);
  if (groups.length < 2) return `<div class="da-empty">Cần ít nhất 2 Tổ để tách riêng Sân trường khỏi Lớp.</div>`;
  const draft = Duty.outdoorWeekConfigDraft || { group: Duty.outdoorGroup || null, exemptIds: (Duty.exemptList||[]).map(e=>e.studentId) };
  Duty.outdoorWeekConfigDraft = draft;
  // Tổ đang giữ Lớp thì loại khỏi danh sách chọn — 1 Tổ không thể vừa Lớp vừa Sân trường.
  const availableGroups = groups.filter(g => g !== Number(Duty.weekGroup));
  const members = (Duty.students||[]).filter(s=>Number(s.group)===Number(draft.group));
  const exemptSet = new Set(draft.exemptIds);
  return `
    <p class="da-form-hint">Chọn Tổ trực SÂN TRƯỜNG và ai đang Xung kích/miễn trừ tuần này. Bấm "Khởi tạo" để áp dụng — chỉ lịch Sân trường bị xoá &amp; tạo lại, Lớp giữ nguyên.</p>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:700;color:var(--text-3);">Tổ trực SÂN TRƯỜNG tuần ${Duty.week}
      <select id="dm-owc-group" style="font-family:inherit;font-size:13px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:8px;padding:7px 9px;">
        <option value="" ${!draft.group?'selected':''}>— Chọn Tổ —</option>
        ${availableGroups.map(g=>`<option value="${g}" ${g===Number(draft.group)?'selected':''}>Tổ ${g}</option>`).join('')}
      </select>
    </label>
    <p class="da-form-hint" style="margin-top:-4px;">Lưu ý: chỉ khởi tạo lại lịch <strong>Sân trường</strong>. Muốn đổi Tổ trực Lớp, dùng panel "Khởi tạo lịch tuần" ở trên.</p>
    <div>
      <div style="font-size:11.5px;font-weight:700;color:var(--text-3);margin-bottom:6px;">Xung kích / Miễn trừ tuần này</div>
      <div class="da-check-group">
        ${members.length ? members.map(s=>`<label><input type="checkbox" data-outdoor-exempt-id="${dutyEscape(s.id)}" ${exemptSet.has(s.id)?'checked':''} />${dutyEscape(s.name)}</label>`).join('') : `<span style="font-size:12px;color:var(--text-3);">${draft.group?'Tổ này chưa có học sinh.':'Chọn Tổ để hiện danh sách.'}</span>`}
      </div>
    </div>
    <div class="da-form-actions">
      <button class="da-btn primary" id="dm-owc-generate" ${Duty.outdoorWeekConfigSaving?'disabled':''}>${Duty.outdoorWeekConfigSaving?'Đang khởi tạo…':'↻ Khởi tạo lịch sân trường'}</button>
    </div>`;
}


/* ── Cấu hình đầu việc ── */

function dutyRenderWorkItemsPanel() {
  const draft = Duty.workItemsDraft || (Duty.workItems||[]).map(w=>Object.assign({},w));
  Duty.workItemsDraft = draft;
  const rows = draft.map((item,idx) => `
    <div style="display:flex;align-items:center;gap:8px;background:var(--surface-2);border:1px solid var(--border-s);border-radius:9px;padding:8px 10px;">
      <input type="text" data-widx="${idx}" data-field="name" value="${dutyEscape(item.name)}" style="flex:1;font-family:inherit;font-size:12.5px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:7px;padding:5px 8px;" />
      <input type="number" min="1" data-widx="${idx}" data-field="peoplePerSlot" value="${item.peoplePerSlot}" title="Số người/buổi" style="width:50px;font-family:inherit;font-size:12.5px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:7px;padding:5px 7px;" />
      <button class="da-btn sm" data-remove-widx="${idx}">✕</button>
    </div>`).join('');
  return `
    <p class="da-form-hint">Danh sách đầu việc &amp; số người/buổi. Lưu xong → Quản lý → Khởi tạo lịch tuần.</p>
    <div style="display:flex;flex-direction:column;gap:6px;" id="dm-wi-list">${rows||'<span class="da-empty">Chưa có đầu việc.</span>'}</div>
    <button class="da-btn sm" id="dm-wi-add">+ Thêm đầu việc</button>
    <div class="da-form-actions">
      <button class="da-btn primary" id="dm-wi-save" ${Duty.workItemsSaving?'disabled':''}>${Duty.workItemsSaving?'Đang lưu…':'Lưu cấu hình'}</button>
    </div>`;
}

/* ── Cấu hình đầu việc sân trường ── */

function dutyRenderOutdoorWorkItemsPanel() {
  const draft = Duty.outdoorWorkItemsDraft || (Duty.outdoorWorkItems||[]).map(w=>Object.assign({},w));
  Duty.outdoorWorkItemsDraft = draft;
  const rows = draft.map((item,idx) => `
    <div style="display:flex;align-items:center;gap:8px;background:var(--surface-2);border:1px solid var(--border-s);border-radius:9px;padding:8px 10px;">
      <input type="text" data-owidx="${idx}" data-field="name" value="${dutyEscape(item.name)}" style="flex:1;font-family:inherit;font-size:12.5px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:7px;padding:5px 8px;" />
      <input type="number" min="1" data-owidx="${idx}" data-field="peoplePerSlot" value="${item.peoplePerSlot}" title="Số người/buổi" style="width:50px;font-family:inherit;font-size:12.5px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:7px;padding:5px 7px;" />
      <button class="da-btn sm" data-remove-owidx="${idx}">✕</button>
    </div>`).join('');
  return `
    <p class="da-form-hint">Đầu việc riêng cho Tổ SÂN TRƯỜNG (Tổ kế tiếp, tự xoay — xem "Khởi tạo lịch tuần"). Lưu xong → Khởi tạo lịch tuần lại.</p>
    <div style="display:flex;flex-direction:column;gap:6px;" id="dm-owi-list">${rows||'<span class="da-empty">Chưa có đầu việc.</span>'}</div>
    <button class="da-btn sm" id="dm-owi-add">+ Thêm đầu việc</button>
    <div class="da-form-actions">
      <button class="da-btn primary" id="dm-owi-save" ${Duty.outdoorWorkItemsSaving?'disabled':''}>${Duty.outdoorWorkItemsSaving?'Đang lưu…':'Lưu cấu hình'}</button>
    </div>`;
}

/* ── Nhà xe cố định ── */

function dutyRenderParkingPanel() {
  const draft = Duty.parkingDraft || (Duty.parkingFixed||[]).map(p=>Object.assign({},p));
  Duty.parkingDraft = draft;
  const rows = draft.map((p,idx) => `
    <div style="display:flex;align-items:center;gap:8px;background:var(--surface-2);border:1px solid var(--border-s);border-radius:9px;padding:8px 10px;">
      <select data-pidx="${idx}" data-field="studentId" style="flex:1;font-family:inherit;font-size:12.5px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:7px;padding:5px 8px;">
        <option value="">— Chọn học sinh —</option>
        ${(Duty.students||[]).map(s=>`<option value="${dutyEscape(s.id)}" ${s.id===p.studentId?'selected':''}>${dutyEscape(s.name)} (Tổ ${dutyEscape(String(s.group))})</option>`).join('')}
      </select>
      <select data-pidx="${idx}" data-field="weekday" style="width:90px;font-family:inherit;font-size:12.5px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:7px;padding:5px 7px;">
        ${DUTY_DAYS.map(d=>`<option value="${dutyEscape(d)}" ${p.weekday===d?'selected':''}>${dutyEscape(d)}</option>`).join('')}
      </select>
      <button class="da-btn sm" data-remove-pidx="${idx}">✕</button>
    </div>`).join('');
  return `
    <p class="da-form-hint">2 người phụ trách nhà xe cố định cả năm — được miễn trừ khỏi rổ chia lượt của tổ.</p>
    <div style="display:flex;flex-direction:column;gap:6px;">${rows||'<span class="da-empty">Chưa cấu hình.</span>'}</div>
    <button class="da-btn sm" id="dm-parking-add">+ Thêm người</button>
    <div class="da-form-actions">
      <button class="da-btn primary" id="dm-parking-save" ${Duty.parkingSaving?'disabled':''}>${Duty.parkingSaving?'Đang lưu…':'Lưu cấu hình'}</button>
    </div>`;
}

/* ── Quy tắc & Mức phạt ── */

function dutyRenderRulesPanel() {
  if (!Duty.rulesLoaded && !Duty.rulesLoading) { dutyLoadRules(); return ''; }
  if (Duty.rulesLoading) return `<div class="da-loading" style="padding:8px;">Đang tải…</div>`;
  const rules = Duty.rules || [];
  const ruleForm = Duty.ruleForm ? `
    <form id="dm-rule-form" style="display:flex;flex-direction:column;gap:8px;background:var(--surface-2);border:1px solid var(--border-s);border-radius:11px;padding:12px;">
      <div class="da-form-grid">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:700;color:var(--text-3);">Tổ áp dụng<input type="number" min="1" id="dm-rf-group" placeholder="Để trống = mọi Tổ" value="${Duty.ruleForm.group||''}" style="font-family:inherit;font-size:12.5px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:7px;padding:6px 8px;" /></label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:700;color:var(--text-3);">Số lượt trực bù<input type="number" min="1" id="dm-rf-extra" value="${Duty.ruleForm.extraSlots||1}" style="font-family:inherit;font-size:12.5px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:7px;padding:6px 8px;" /></label>
      </div>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:700;color:var(--text-3);">Lỗi vi phạm<input type="text" id="dm-rf-violation" value="${dutyEscape(Duty.ruleForm.violation||'')}" placeholder="Vd: Đi muộn / Không làm / Làm chưa sạch" required style="font-family:inherit;font-size:12.5px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:7px;padding:6px 8px;" /></label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:700;color:var(--text-3);">Hình phạt<input type="text" id="dm-rf-penalty" value="${dutyEscape(Duty.ruleForm.penalty||'')}" placeholder="Vd: Trực bù 2 lượt" required style="font-family:inherit;font-size:12.5px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:7px;padding:6px 8px;" /></label>
      <div class="da-form-actions">
        <button type="button" class="da-btn sm" id="dm-rf-cancel">Huỷ</button>
        <button type="submit" class="da-btn sm primary">${Duty.ruleForm.id?'Lưu thay đổi':'Thêm quy tắc'}</button>
      </div>
    </form>` : '';
  const list = rules.length ? rules.map(r => `
    <div class="dm-rule-row ${r.active?'':'inactive'}">
      <div class="dm-rule-info">
        <div class="dm-rule-violation">${dutyEscape(r.violation)}</div>
        <div class="dm-rule-penalty">${dutyEscape(r.penalty)}${r.group?` · Tổ ${dutyEscape(String(r.group))}`:''}</div>
      </div>
      <button class="da-btn sm" data-toggle-rule="${dutyEscape(JSON.stringify(r))}">${r.active?'Tắt':'Bật'}</button>
      <button class="da-btn sm" data-edit-rule="${dutyEscape(JSON.stringify(r))}">Sửa</button>
    </div>`).join('') : `<div class="da-empty">Chưa có quy tắc nào.</div>`;
  return `
    <button class="da-btn sm primary" id="dm-rule-add-btn">+ Thêm quy tắc</button>
    ${ruleForm}
    <div style="display:flex;flex-direction:column;gap:6px;">${list}</div>`;
}

function dutyBindManageEvents(canEdit) {
  const body = document.getElementById('da-body');
  if (!body) return;
  /* Danger zone */
  document.getElementById('dm-clear-roster')?.addEventListener('click', async () => {
    if (!confirm(`Xoá toàn bộ lịch trực tuần ${Duty.week}?\n\nCấu hình tổ & xung kích vẫn được giữ. Bấm "Khởi tạo lịch tuần" để tạo lại.`)) return;
    const btn = document.getElementById('dm-clear-roster');
    if (btn) { btn.disabled = true; btn.textContent = 'Đang xoá…'; }
    try {
      await dutyApiPost('clearDutyRoster', { week: Duty.week, clearConfig: false });
      Duty.classLoaded = false; Duty.classSlots = []; Duty.weekGroup = null;
      Duty.outdoorSlots = []; Duty.outdoorGroup = null; Duty.exemptList = [];
      dutyNotify(`Đã xoá lịch tuần ${Duty.week}. Cấu hình tổ vẫn còn, bấm "Khởi tạo" để tạo lại.`, 'success');
      dutyRenderBody();
    } catch(err) { dutyNotify('Không xoá được: ' + (err?.message||err), 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Xoá lịch'; } }
  });
  document.getElementById('dm-clear-all')?.addEventListener('click', async () => {
    if (!confirm(`Xoá SẠCH tuần ${Duty.week}?\n\nLịch trực VÀ cấu hình tổ, xung kích đều bị xoá. Phải cấu hình lại từ đầu.`)) return;
    const btn = document.getElementById('dm-clear-all');
    if (btn) { btn.disabled = true; btn.textContent = 'Đang xoá…'; }
    try {
      await dutyApiPost('clearDutyRoster', { week: Duty.week, clearConfig: true });
      Duty.classLoaded = false; Duty.classSlots = []; Duty.weekGroup = null;
      Duty.outdoorSlots = []; Duty.outdoorGroup = null; Duty.exemptList = [];
      Duty.weekConfigDraft = null;
      dutyNotify(`Đã xoá sạch lịch & cấu hình tuần ${Duty.week}.`, 'success');
      dutyRenderBody();
    } catch(err) { dutyNotify('Không xoá được: ' + (err?.message||err), 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Xoá sạch'; } }
  });
  /* Penalty form toggle */
  document.getElementById('dm-penalty-toggle')?.addEventListener('click', () => { Duty.penaltyFormOpen = !Duty.penaltyFormOpen; dutyRenderBody(); });
  /* Penalty form submit */
  document.getElementById('dm-penalty-form')?.addEventListener('submit', dutySubmitPenalty);
  document.getElementById('dm-penalty-cancel')?.addEventListener('click', () => { Duty.penaltyFormOpen = false; dutyRenderBody(); });
  /* Clear debt (xoá 1 bản ghi nợ cụ thể — coi như đã tự trả) */
  body.querySelectorAll('[data-clear-debt]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.clearDebt;
      if (!confirm(`Xoá khoản nợ của ${btn.dataset.clearName}? (coi như đã trả xong)`)) return;
      try {
        await dutyApiPost('clearDutySwapDebt', { id });
        Duty.debtsLoaded = false;
        await dutyLoadDebts();
        dutyNotify('Đã xoá nợ', 'success');
      } catch(err) { dutyNotify('Không xoá được: ' + (err?.message||err), 'error'); }
    });
  });
  /* v3 — Đồng ý / từ chối yêu cầu đổi ca */
  body.querySelectorAll('[data-respond-swap]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const [id, accept] = btn.dataset.respondSwap.split('|');
      const acceptBool = accept === 'true';
      try {
        await dutyApiPost('respondDutySwap', { swapRequestId: id, accept: acceptBool });
        Duty.swapRequestsLoaded = false;
        await dutyLoadSwapRequests();
        dutyNotify(acceptBool ? 'Đã đồng ý đổi ca.' : 'Đã từ chối đổi ca.', 'success');
      } catch(err) { dutyNotify('Không cập nhật được: ' + (err?.message||err), 'error'); }
    });
  });
  /* v3 — Xử lý tay bù ca swapMakeup không thể tự bù */
  body.querySelectorAll('[data-settle-makeup]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.settleMakeup;
      if (!confirm('Xác nhận khoản bù ca này đã được giải quyết tay?')) return;
      try {
        await dutyApiPost('settleDutySwapMakeup', { id });
        Duty.swapMakeupsLoaded = false;
        await dutyLoadSwapMakeups();
        dutyNotify('Đã đánh dấu đã bù ca.', 'success');
      } catch(err) { dutyNotify('Không cập nhật được: ' + (err?.message||err), 'error'); }
    });
  });
  /* Accordion toggles */
  body.querySelectorAll('[data-accordion]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.accordion;
      if (id === 'week-config') {
        Duty.weekConfigOpen = !Duty.weekConfigOpen; Duty.weekConfigDraft = null;
        if (Duty.weekConfigOpen) dutyLoadStudents().then(() => dutyRenderBody()); else dutyRenderBody();
      } else if (id === 'outdoor-week-config') {
        Duty.outdoorWeekConfigOpen = !Duty.outdoorWeekConfigOpen; Duty.outdoorWeekConfigDraft = null;
        if (Duty.outdoorWeekConfigOpen) dutyLoadStudents().then(() => dutyRenderBody()); else dutyRenderBody();
      } else if (id === 'workitems-config') {
        Duty.workItemsConfigOpen = !Duty.workItemsConfigOpen; Duty.workItemsDraft = null;
        dutyRenderBody();
      } else if (id === 'outdoor-workitems-config') {
        Duty.outdoorWorkItemsConfigOpen = !Duty.outdoorWorkItemsConfigOpen; Duty.outdoorWorkItemsDraft = null;
        dutyRenderBody();
      } else if (id === 'parking-config') {
        Duty.parkingConfigOpen = !Duty.parkingConfigOpen; Duty.parkingDraft = null;
        if (Duty.parkingConfigOpen && !Duty.parkingFixedLoaded) dutyLoadParkingFixed().then(()=>dutyRenderBody()); else dutyRenderBody();
      } else if (id === 'rules-panel') {
        Duty.rulesOpen = !Duty.rulesOpen;
        if (Duty.rulesOpen && !Duty.rulesLoaded) dutyLoadRules(); else dutyRenderBody();
      } else if (id === 'override-config') {
        Duty.overrideOpen = !Duty.overrideOpen;
        if (Duty.overrideOpen && !Duty.overridesLoaded) dutyLoadOverrides(); else dutyRenderBody();
      } else if (id === 'swap-requests') {
        Duty.swapRequestsOpen = !Duty.swapRequestsOpen;
        if (Duty.swapRequestsOpen && !Duty.swapRequestsLoaded) dutyLoadSwapRequests(); else dutyRenderBody();
      } else if (id === 'swap-makeups') {
        Duty.swapMakeupsOpen = !Duty.swapMakeupsOpen;
        if (Duty.swapMakeupsOpen && !Duty.swapMakeupsLoaded) dutyLoadSwapMakeups(); else dutyRenderBody();
      }
    });
  });
  /* ── Ghi đè theo ngày/tuần ── */
  document.getElementById('dm-ov-add-btn')?.addEventListener('click', () => {
    Duty.overrideForm = { scope: 'day', day: DUTY_DAYS[0], slot: 'all', type: 'group', target: (Duty.students[0]?.group)||1, reason: '' };
    dutyRenderBody();
  });
  document.getElementById('dm-ov-cancel')?.addEventListener('click', () => { Duty.overrideForm = null; dutyRenderBody(); });
  document.getElementById('dm-ov-scope')?.addEventListener('change', function() {
    Duty.overrideForm.scope = this.value;
    document.getElementById('dm-ov-day-fields').hidden = this.value !== 'day';
  });
  document.getElementById('dm-ov-type')?.addEventListener('change', function() {
    Duty.overrideForm.type = this.value;
    document.getElementById('dm-ov-group-field').hidden = this.value === 'penaltyTeam';
  });
  document.getElementById('dm-ov-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const scope = document.getElementById('dm-ov-scope').value;
    const type = document.getElementById('dm-ov-type').value;
    const payload = {
      week: Duty.week,
      scope,
      day: scope === 'day' ? document.getElementById('dm-ov-day').value : null,
      slot: scope === 'day' ? document.getElementById('dm-ov-slot').value : null,
      type,
      target: type === 'penaltyTeam' ? null : Number(document.getElementById('dm-ov-group').value),
      reason: document.getElementById('dm-ov-reason').value.trim(),
    };
    Duty.overrideSaving = true; dutyRenderBody();
    try {
      await dutyApiPost('saveDutyOverrideRule', payload);
      Duty.overrideForm = null; Duty.overridesLoaded = false;
      await dutyLoadOverrides();
      dutyNotify('Đã lưu ghi đè. Bấm "Khởi tạo lịch tuần" lại để áp dụng.', 'success');
    } catch(err) { dutyNotify('Không lưu được: ' + (err?.message||err), 'error'); }
    finally { Duty.overrideSaving = false; dutyRenderBody(); }
  });
  body.querySelectorAll('[data-remove-override]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Xoá ghi đè này?')) return;
      try {
        await dutyApiPost('deleteDutyOverrideRule', { id: btn.dataset.removeOverride });
        Duty.overridesLoaded = false;
        await dutyLoadOverrides();
        dutyNotify('Đã xoá ghi đè', 'success');
      } catch(err) { dutyNotify('Không xoá được: ' + (err?.message||err), 'error'); }
    });
  });
  /* Week config — group select */
  document.getElementById('dm-wc-group')?.addEventListener('change', function() {
    if (Duty.weekConfigDraft) { Duty.weekConfigDraft.group = Number(this.value); }
    const accBody = document.getElementById('dm-acc-body-week-config');
    if (accBody) { accBody.innerHTML = dutyRenderWeekConfigPanel(); dutyBindManageEvents(canEdit); }
  });
  document.querySelectorAll('[data-exempt-id]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (!Duty.weekConfigDraft) return;
      const id = cb.dataset.exemptId;
      if (cb.checked) { if (!Duty.weekConfigDraft.exemptIds.includes(id)) Duty.weekConfigDraft.exemptIds.push(id); }
      else { Duty.weekConfigDraft.exemptIds = Duty.weekConfigDraft.exemptIds.filter(x => x !== id); }
    });
  });
  document.getElementById('dm-wc-generate')?.addEventListener('click', dutyGenerateWeek);
  /* Outdoor week config — group select */
  document.getElementById('dm-owc-group')?.addEventListener('change', function() {
    if (Duty.outdoorWeekConfigDraft) { Duty.outdoorWeekConfigDraft.group = this.value ? Number(this.value) : null; }
    const accBody = document.getElementById('dm-acc-body-outdoor-week-config');
    if (accBody) { accBody.innerHTML = dutyRenderOutdoorWeekConfigPanel(); dutyBindManageEvents(canEdit); }
  });
  document.querySelectorAll('[data-outdoor-exempt-id]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (!Duty.outdoorWeekConfigDraft) return;
      const id = cb.dataset.outdoorExemptId;
      if (cb.checked) { if (!Duty.outdoorWeekConfigDraft.exemptIds.includes(id)) Duty.outdoorWeekConfigDraft.exemptIds.push(id); }
      else { Duty.outdoorWeekConfigDraft.exemptIds = Duty.outdoorWeekConfigDraft.exemptIds.filter(x => x !== id); }
    });
  });
  document.getElementById('dm-owc-generate')?.addEventListener('click', dutyGenerateOutdoorWeek);
  /* Work items config */
  document.querySelectorAll('[data-widx]').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = Number(inp.dataset.widx); const field = inp.dataset.field;
      if (!Duty.workItemsDraft) return;
      Duty.workItemsDraft[idx][field] = field==='peoplePerSlot' ? (Number(inp.value)||1) : inp.value;
    });
  });
  document.querySelectorAll('[data-remove-widx]').forEach(btn => {
    btn.addEventListener('click', () => {
      Duty.workItemsDraft?.splice(Number(btn.dataset.removeWidx), 1);
      const accBody = document.getElementById('dm-acc-body-workitems-config');
      if (accBody) { accBody.innerHTML = dutyRenderWorkItemsPanel(); dutyBindManageEvents(canEdit); }
    });
  });
  document.getElementById('dm-wi-add')?.addEventListener('click', () => {
    const draft = Duty.workItemsDraft || [];
    const used = new Set(draft.map(d=>d.id));
    let base = 'viecMoi'; let n = 2; while (used.has(base)) { base = 'viecMoi'+n; n++; }
    draft.push({ id: base, name: 'Việc mới', peoplePerSlot: 1 });
    Duty.workItemsDraft = draft;
    const accBody = document.getElementById('dm-acc-body-workitems-config');
    if (accBody) { accBody.innerHTML = dutyRenderWorkItemsPanel(); dutyBindManageEvents(canEdit); }
  });
  document.getElementById('dm-wi-save')?.addEventListener('click', dutySaveWorkItems);
  /* Outdoor work items config */
  document.querySelectorAll('[data-owidx]').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = Number(inp.dataset.owidx); const field = inp.dataset.field;
      if (!Duty.outdoorWorkItemsDraft) return;
      Duty.outdoorWorkItemsDraft[idx][field] = field==='peoplePerSlot' ? (Number(inp.value)||1) : inp.value;
    });
  });
  document.querySelectorAll('[data-remove-owidx]').forEach(btn => {
    btn.addEventListener('click', () => {
      Duty.outdoorWorkItemsDraft?.splice(Number(btn.dataset.removeOwidx), 1);
      const accBody = document.getElementById('dm-acc-body-outdoor-workitems-config');
      if (accBody) { accBody.innerHTML = dutyRenderOutdoorWorkItemsPanel(); dutyBindManageEvents(canEdit); }
    });
  });
  document.getElementById('dm-owi-add')?.addEventListener('click', () => {
    const draft = Duty.outdoorWorkItemsDraft || [];
    const used = new Set(draft.map(d=>d.id));
    let base = 'stMoi'; let n = 2; while (used.has(base)) { base = 'stMoi'+n; n++; }
    draft.push({ id: base, name: 'Việc mới', peoplePerSlot: 1 });
    Duty.outdoorWorkItemsDraft = draft;
    const accBody = document.getElementById('dm-acc-body-outdoor-workitems-config');
    if (accBody) { accBody.innerHTML = dutyRenderOutdoorWorkItemsPanel(); dutyBindManageEvents(canEdit); }
  });
  document.getElementById('dm-owi-save')?.addEventListener('click', dutySaveOutdoorWorkItems);
  /* Parking config */
  document.querySelectorAll('[data-pidx]').forEach(sel => {
    sel.addEventListener('change', () => {
      if (!Duty.parkingDraft) return;
      Duty.parkingDraft[Number(sel.dataset.pidx)][sel.dataset.field] = sel.value;
    });
  });
  document.querySelectorAll('[data-remove-pidx]').forEach(btn => {
    btn.addEventListener('click', () => {
      Duty.parkingDraft?.splice(Number(btn.dataset.removePidx), 1);
      const accBody = document.getElementById('dm-acc-body-parking-config');
      if (accBody) { accBody.innerHTML = dutyRenderParkingPanel(); dutyBindManageEvents(canEdit); }
    });
  });
  document.getElementById('dm-parking-add')?.addEventListener('click', () => {
    if (!Duty.parkingDraft) Duty.parkingDraft = [];
    Duty.parkingDraft.push({ studentId:'', studentName:'', weekday: DUTY_DAYS[0] });
    const accBody = document.getElementById('dm-acc-body-parking-config');
    if (accBody) { accBody.innerHTML = dutyRenderParkingPanel(); dutyBindManageEvents(canEdit); }
  });
  document.getElementById('dm-parking-save')?.addEventListener('click', dutySaveParkingFixed);
  /* Rules */
  document.getElementById('dm-rule-add-btn')?.addEventListener('click', () => {
    Duty.ruleForm = { id:null, group:'', violation:'', penalty:'', extraSlots:1, active:true };
    const accBody = document.getElementById('dm-acc-body-rules-panel');
    if (accBody) { accBody.innerHTML = dutyRenderRulesPanel(); dutyBindManageEvents(canEdit); }
  });
  document.getElementById('dm-rf-cancel')?.addEventListener('click', () => {
    Duty.ruleForm = null;
    const accBody = document.getElementById('dm-acc-body-rules-panel');
    if (accBody) { accBody.innerHTML = dutyRenderRulesPanel(); dutyBindManageEvents(canEdit); }
  });
  document.getElementById('dm-rule-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      id: Duty.ruleForm.id || undefined,
      group: Number(document.getElementById('dm-rf-group').value) || null,
      violation: document.getElementById('dm-rf-violation').value.trim(),
      penalty: document.getElementById('dm-rf-penalty').value.trim(),
      extraSlots: Number(document.getElementById('dm-rf-extra').value) || 1,
      active: true,
    };
    if (!payload.violation || !payload.penalty) return;
    try {
      await dutyApiPost('saveDutyRule', payload);
      Duty.ruleForm = null; Duty.rulesLoaded = false;
      await dutyLoadRules();
      dutyNotify('Đã lưu quy tắc', 'success');
    } catch(err) { dutyNotify('Không lưu được: ' + (err?.message||err), 'error'); }
  });
  body.querySelectorAll('[data-toggle-rule]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const rule = JSON.parse(btn.dataset.toggleRule);
        await dutyApiPost('saveDutyRule', Object.assign({}, rule, { active: !rule.active }));
        Duty.rulesLoaded = false; await dutyLoadRules();
      } catch(err) { dutyNotify('Không cập nhật được: ' + (err?.message||err), 'error'); }
    });
  });
  body.querySelectorAll('[data-edit-rule]').forEach(btn => {
    btn.addEventListener('click', () => {
      try {
        Duty.ruleForm = JSON.parse(btn.dataset.editRule);
      } catch(err) {
        dutyNotify('Không đọc được dữ liệu quy tắc: ' + (err?.message||err), 'error');
        return;
      }
      const accBody = document.getElementById('dm-acc-body-rules-panel');
      if (accBody) { accBody.innerHTML = dutyRenderRulesPanel(); dutyBindManageEvents(canEdit); }
    });
  });
}

/* ── Ghi nợ mới (swap 1-1: nguoiThay trực thay nguoiVang) ── */

function dutyRenderPenaltyForm() {
  return `<form class="da-inline-form" id="dm-penalty-form">
    <p class="da-form-hint" style="margin:0 0 4px;">Dùng khi 1 người vắng ca trực và có người khác làm thay — hệ thống ghi "người thay đang nợ người vắng".</p>
    <div class="da-form-grid">
      <label>Người vắng (chủ nợ)
        <select id="dm-pf-absent" style="font-family:inherit;font-size:12.5px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:7px;padding:6px 8px;">
          ${(Duty.students||[]).map(s=>`<option value="${dutyEscape(s.id)}" data-name="${dutyEscape(s.name)}">${dutyEscape(s.name)} (Tổ ${dutyEscape(String(s.group))})</option>`).join('')}
        </select>
      </label>
      <label>Người trực thay (người nợ)
        <select id="dm-pf-sub" style="font-family:inherit;font-size:12.5px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:7px;padding:6px 8px;">
          ${(Duty.students||[]).map(s=>`<option value="${dutyEscape(s.id)}" data-name="${dutyEscape(s.name)}">${dutyEscape(s.name)} (Tổ ${dutyEscape(String(s.group))})</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="da-form-grid">
      <label>Ngày phát sinh (để trống = hôm nay)
        <input type="date" id="dm-pf-date" />
      </label>
      <label>Ghi chú
        <input type="text" id="dm-pf-note" placeholder="Vd: A nghỉ ốm Thứ 2 tuần 3" />
      </label>
    </div>
    <div class="da-form-actions">
      <button type="button" class="da-btn sm" id="dm-penalty-cancel">Huỷ</button>
      <button type="submit" class="da-btn sm primary">Ghi nợ</button>
    </div>
  </form>`;
}

async function dutySubmitPenalty(e) {
  e.preventDefault();
  const absentEl = document.getElementById('dm-pf-absent');
  const subEl = document.getElementById('dm-pf-sub');
  const nguoiChoNoId = absentEl?.value, nguoiNoId = subEl?.value;
  if (!nguoiChoNoId || !nguoiNoId) { dutyNotify('Chọn cả 2 người trước.', 'error'); return; }
  if (nguoiChoNoId === nguoiNoId) { dutyNotify('Người vắng và người thay không thể là cùng 1 người.', 'error'); return; }
  const ngayPhatSinh = document.getElementById('dm-pf-date')?.value || new Date().toISOString().slice(0,10);
  const note = document.getElementById('dm-pf-note')?.value.trim()||'';
  try {
    await dutyApiPost('saveDutySwapDebt', {
      nguoiNoId, nguoiNoName: subEl.selectedOptions[0]?.dataset.name,
      nguoiChoNoId, nguoiChoNoName: absentEl.selectedOptions[0]?.dataset.name,
      ngayPhatSinh, note,
    });
    Duty.penaltyFormOpen = false; Duty.debtsLoaded = false;
    await dutyLoadDebts();
    dutyNotify('Đã ghi nợ', 'success');
  } catch(err) { dutyNotify('Không ghi nhận được: ' + (err?.message||err), 'error'); }

}

/* ── Outdoor add form ── */

/* ── Load debts / parking / rules ── */

async function dutyLoadDebts() {
  if (Duty.debtsLoading) return;
  Duty.debtsLoading = true; Duty.debtsError = ''; dutyRenderBody();
  try {
    await dutyLoadStudents();
    Duty.debts = await dutyApiGet('getDutyDebts', {}) || [];
    Duty.debtsLoaded = true;
  } catch(err) { Duty.debtsError = 'Không tải được sổ nợ: ' + (err?.message||err); }
  finally { Duty.debtsLoading = false; dutyRenderBody(); }
}

async function dutyLoadOutdoorWorkItems() {
  if (Duty.outdoorWorkItemsLoaded || Duty.outdoorWorkItemsLoading) return;
  Duty.outdoorWorkItemsLoading = true;
  try {
    Duty.outdoorWorkItems = await dutyApiGet('getDutyOutdoorWorkItems', {}) || [];
    Duty.outdoorWorkItemsLoaded = true;
  } catch(err) { console.error('[duty] Không tải được đầu việc sân trường:', err); Duty.outdoorWorkItems = []; }
  finally { Duty.outdoorWorkItemsLoading = false; }
}

async function dutyLoadParkingFixed() {
  if (Duty.parkingFixedLoaded) return;
  try {
    Duty.parkingFixed = await dutyApiGet('getDutyParkingFixed', {}) || [];
    Duty.parkingFixedLoaded = true;
  } catch(err) { console.error('[duty] Không tải được nhà xe cố định:', err); }

}

async function dutyLoadRules() {
  if (Duty.rulesLoading) return;
  Duty.rulesLoading = true; Duty.rulesError = ''; dutyRenderBody();
  try {
    Duty.rules = await dutyApiGet('getDutyRules', {}) || [];
    Duty.rulesLoaded = true;
  } catch(err) { Duty.rulesError = 'Không tải được quy tắc: ' + (err?.message||err); }
  finally { Duty.rulesLoading = false; dutyRenderBody(); }
}

/* ── v3: Yêu cầu đổi ca ── */
async function dutyLoadSwapRequests() {
  if (Duty.swapRequestsLoading) return;
  Duty.swapRequestsLoading = true; Duty.swapRequestsError = ''; dutyRenderBody();
  try {
    Duty.swapRequests = await dutyApiGet('getDutySwapRequests', { week: Duty.week }) || [];
    Duty.swapRequestsLoaded = true;
  } catch(err) { Duty.swapRequestsError = 'Không tải được yêu cầu đổi ca: ' + (err?.message||err); }
  finally { Duty.swapRequestsLoading = false; dutyRenderBody(); }
}

function dutyRenderSwapRequestsPanel() {
  if (!Duty.swapRequestsLoaded && !Duty.swapRequestsLoading) { dutyLoadSwapRequests(); return ''; }
  if (Duty.swapRequestsLoading) return `<div class="da-loading" style="padding:8px;">Đang tải…</div>`;
  if (Duty.swapRequestsError) return `<div class="da-error" style="padding:8px;">${dutyEscape(Duty.swapRequestsError)}</div>`;
  const reqs = Duty.swapRequests || [];
  const pending = reqs.filter(r => r.status === 'pending');
  const resolved = reqs.filter(r => r.status !== 'pending');
  const currentUser = readDutyUser();
  const userId = currentUser?.id || currentUser?.studentId || '';
  const renderRow = (r) => {
    const isPending = r.status === 'pending';
    const isRecipient = r.toStudentId === userId;
    return `<div class="dm-debt-row">
      <div class="dm-debt-info">
        <div class="dm-debt-name">${dutyEscape(r.fromStudentName||r.fromStudentId)} <span style="color:var(--text-3);">xin đổi ca với</span> ${dutyEscape(r.toStudentName||r.toStudentId)}</div>
        <div class="dm-debt-meta">
          <span class="da-badge ${isPending?'warn':'accent'}" style="font-size:10px;">${isPending?'Chờ xác nhận':r.status==='accepted'?'Đã đồng ý':'Đã từ chối'}</span>
          ${r.reason ? `<span style="margin-left:6px;font-size:11px;color:var(--text-3);">${dutyEscape(r.reason)}</span>` : ''}
        </div>
        <div style="font-size:11px;color:var(--text-3);margin-top:2px;">Việc: ${dutyEscape(r.workItemId||'—')} · Tuần ${dutyEscape(String(r.week||Duty.week))}</div>
      </div>
      ${isPending && (isRecipient || dutyCanEdit()) ? `
        <div style="display:flex;gap:6px;">
          <button class="da-btn sm primary" data-respond-swap="${dutyEscape(r.id)}|true">Đồng ý</button>
          <button class="da-btn sm danger" data-respond-swap="${dutyEscape(r.id)}|false">Từ chối</button>
        </div>` : ''}
    </div>`;
  };
  const pendingHtml = pending.length
    ? `<div class="dm-debt-list">${pending.map(renderRow).join('')}</div>`
    : `<div class="da-empty" style="font-size:12px;">Không có yêu cầu nào đang chờ.</div>`;
  const resolvedHtml = resolved.length
    ? `<details style="margin-top:8px;"><summary style="font-size:11.5px;color:var(--text-3);cursor:pointer;">Đã xử lý (${resolved.length})</summary>
        <div class="dm-debt-list" style="margin-top:6px;">${resolved.map(renderRow).join('')}</div>
      </details>`
    : '';
  return `
    <p class="da-form-hint">Yêu cầu đổi ca chỉ được gửi trong phạm vi cùng tổ trực tuần đó. Người nhận có thể đồng ý hoặc từ chối.</p>
    <div style="font-size:11.5px;font-weight:700;color:var(--text-3);margin-bottom:6px;">Đang chờ (${pending.length})</div>
    ${pendingHtml}
    ${resolvedHtml}`;
}

/* ── v3: Bù ca swapMakeup ── */
async function dutyLoadSwapMakeups() {
  if (Duty.swapMakeupsLoading) return;
  Duty.swapMakeupsLoading = true; Duty.swapMakeupsError = ''; dutyRenderBody();
  try {
    Duty.swapMakeups = await dutyApiGet('getDutySwapMakeups', {}) || [];
    Duty.swapMakeupsLoaded = true;
  } catch(err) { Duty.swapMakeupsError = 'Không tải được danh sách bù ca: ' + (err?.message||err); }
  finally { Duty.swapMakeupsLoading = false; dutyRenderBody(); }
}

function dutyRenderSwapMakeupsPanel() {
  if (!Duty.swapMakeupsLoaded && !Duty.swapMakeupsLoading) { dutyLoadSwapMakeups(); return ''; }
  if (Duty.swapMakeupsLoading) return `<div class="da-loading" style="padding:8px;">Đang tải…</div>`;
  if (Duty.swapMakeupsError) return `<div class="da-error" style="padding:8px;">${dutyEscape(Duty.swapMakeupsError)}</div>`;
  const makeups = Duty.swapMakeups || [];
  const pending = makeups.filter(m => m.status === 'pending');
  const settled = makeups.filter(m => m.status === 'settled');
  const renderMakeup = (m, showSettle) => `<div class="dm-debt-row">
    <div class="dm-debt-info">
      <div class="dm-debt-name">${dutyEscape(m.studentId||'?')} <span style="color:var(--text-3);">sẽ làm thay</span> ${dutyEscape(m.owedToStudentId||'?')}</div>
      <div class="dm-debt-meta">
        <span class="da-badge ${m.status==='pending'?'warn':'accent'}" style="font-size:10px;">${m.status==='pending'?'Chờ bù':'Đã bù'}</span>
        <span style="margin-left:6px;font-size:11px;">Việc: <strong>${dutyEscape(m.workItemId||'—')}</strong></span>
        ${m.createdWeek ? `<span style="margin-left:6px;font-size:11px;color:var(--text-3);">Phát sinh tuần ${dutyEscape(String(m.createdWeek))}</span>` : ''}
      </div>
      <div style="font-size:11px;color:var(--text-3);margin-top:2px;">
        ${m.status==='pending'
          ? `Bù khi đến lượt <strong>${dutyEscape(m.owedToStudentId||'?')}</strong> được xếp làm việc <strong>${dutyEscape(m.workItemId||'?')}</strong> tiếp theo`
          : 'Đã bù xong'}
      </div>
    </div>
    ${showSettle ? `<button class="da-btn sm" data-settle-makeup="${dutyEscape(m.id)}">Xử lý tay</button>` : ''}
  </div>`;
  const pendingHtml = pending.length
    ? `<div class="dm-debt-list">${pending.map(m => renderMakeup(m, dutyCanEdit())).join('')}</div>`
    : `<div class="da-empty" style="font-size:12px;">Không có khoản bù ca nào đang chờ.</div>`;
  const settledHtml = settled.length
    ? `<details style="margin-top:8px;"><summary style="font-size:11.5px;color:var(--text-3);cursor:pointer;">Đã bù xong (${settled.length})</summary>
        <div class="dm-debt-list" style="margin-top:6px;">${settled.map(m => renderMakeup(m, false)).join('')}</div>
      </details>`
    : '';
  return `
    <p class="da-form-hint">Mỗi khoản bù ca gắn với đúng đầu việc — người nợ sẽ tự động được xếp vào slot việc đó ở lần tiếp theo. Tổ trưởng/GVCN có thể xử lý tay nếu đầu việc bị xoá.</p>
    <div style="font-size:11.5px;font-weight:700;color:var(--text-3);margin-bottom:6px;">Đang chờ bù (${pending.length})</div>
    ${pendingHtml}
    ${settledHtml}`;
}

/* ── Tầng 2: Day/Week Override (Ghi đè lịch) ── */

async function dutyLoadOverrides() {
  if (Duty.overridesLoading) return;
  Duty.overridesLoading = true; Duty.overridesError = ''; dutyRenderBody();
  try {
    Duty.overrides = await dutyApiGet('getDutyOverrides', { week: Duty.week }) || [];
    Duty.overridesLoaded = true;
  } catch(err) { Duty.overridesError = 'Không tải được ghi đè: ' + (err?.message||err); }
  finally { Duty.overridesLoading = false; dutyRenderBody(); }
}

function dutyRenderOverridePanel() {
  if (!Duty.overridesLoaded && !Duty.overridesLoading) { dutyLoadOverrides(); return ''; }
  if (Duty.overridesLoading) return `<div class="da-loading" style="padding:8px;">Đang tải…</div>`;
  if (Duty.overridesError) return `<div class="da-error" style="padding:8px;">${dutyEscape(Duty.overridesError)}</div>`;
  const groups = Array.from(new Set((Duty.students||[]).map(s=>Number(s.group)))).filter(Boolean).sort((a,b)=>a-b);
  const list = (Duty.overrides||[]).slice().sort((a,b) => {
    if (a.scope !== b.scope) return a.scope === 'day' ? -1 : 1; // day override lên trước (ưu tiên cao hơn)
    return (DUTY_DAYS.indexOf(a.day||'') - DUTY_DAYS.indexOf(b.day||''));
  });
  const rows = list.length ? list.map(o => `
    <div class="dm-ov-row">
      <div class="dm-ov-info">
        <span class="da-badge ${o.scope==='day'?'accent':'warn'}">${o.scope==='day'?'Cấp ngày':'Cấp tuần'}</span>
        <span class="dm-ov-desc">
          ${o.scope==='day' ? `${dutyEscape(o.day)}${o.slot && o.slot!=='all' ? ' — '+SLOT_LABEL[o.slot] : ' (cả ngày)'}` : `Tuần ${o.week}`}
          → ${o.type==='penaltyTeam' ? '<strong>Đội phạt</strong>' : `<strong>Tổ ${dutyEscape(String(o.target))}</strong>`}
        </span>
        ${o.reason ? `<span class="dm-ov-reason">${dutyEscape(o.reason)}</span>` : ''}
      </div>
      <button class="da-btn sm danger" data-remove-override="${dutyEscape(o.id)}">Xoá</button>
    </div>`).join('') : `<div class="da-empty">Chưa có ghi đè nào cho tuần ${Duty.week}.</div>`;
  const form = Duty.overrideForm ? `
    <form id="dm-ov-form" style="display:flex;flex-direction:column;gap:8px;background:var(--surface-2);border:1px solid var(--border-s);border-radius:11px;padding:12px;margin-bottom:10px;">
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:700;color:var(--text-3);">Phạm vi
        <select id="dm-ov-scope" style="font-family:inherit;font-size:13px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:8px;padding:7px 9px;">
          <option value="day" ${Duty.overrideForm.scope==='day'?'selected':''}>Cấp ngày — đổi 1 buổi/ngày cụ thể</option>
          <option value="week" ${Duty.overrideForm.scope==='week'?'selected':''}>Cấp tuần — đổi cả tuần ${Duty.week}</option>
        </select>
      </label>
      <div id="dm-ov-day-fields" ${Duty.overrideForm.scope!=='day'?'hidden':''} class="da-form-grid">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:700;color:var(--text-3);">Ngày
          <select id="dm-ov-day" style="font-family:inherit;font-size:12.5px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:7px;padding:6px 8px;">
            ${DUTY_DAYS.map(d=>`<option value="${d}" ${Duty.overrideForm.day===d?'selected':''}>${d}</option>`).join('')}
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:700;color:var(--text-3);">Buổi
          <select id="dm-ov-slot" style="font-family:inherit;font-size:12.5px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:7px;padding:6px 8px;">
            <option value="all" ${Duty.overrideForm.slot==='all'?'selected':''}>Cả ngày</option>
            <option value="sang" ${Duty.overrideForm.slot==='sang'?'selected':''}>Sáng</option>
            <option value="chieu" ${Duty.overrideForm.slot==='chieu'?'selected':''}>Chiều</option>
          </select>
        </label>
      </div>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:700;color:var(--text-3);">Chế độ
        <select id="dm-ov-type" style="font-family:inherit;font-size:13px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:8px;padding:7px 9px;">
          <option value="group" ${Duty.overrideForm.type!=='penaltyTeam'?'selected':''}>Chỉ định Tổ trực</option>
          <option value="penaltyTeam" ${Duty.overrideForm.type==='penaltyTeam'?'selected':''}>Đội phạt phụ trách (không lấy Tổ nào)</option>
        </select>
      </label>
      <div id="dm-ov-group-field" ${Duty.overrideForm.type==='penaltyTeam'?'hidden':''}>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:700;color:var(--text-3);">Tổ được gán
          <select id="dm-ov-group" style="font-family:inherit;font-size:13px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:8px;padding:7px 9px;">
            ${groups.map(g=>`<option value="${g}" ${Number(Duty.overrideForm.target)===g?'selected':''}>Tổ ${g}</option>`).join('')}
          </select>
        </label>
      </div>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:700;color:var(--text-3);">Lý do (không bắt buộc)
        <input type="text" id="dm-ov-reason" value="${dutyEscape(Duty.overrideForm.reason||'')}" placeholder="Vd: Tổ 1 bận thi xung kích" style="font-family:inherit;font-size:12.5px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:7px;padding:6px 8px;" />
      </label>
      <div class="da-form-actions">
        <button type="button" class="da-btn sm" id="dm-ov-cancel">Huỷ</button>
        <button type="submit" class="da-btn sm primary" ${Duty.overrideSaving?'disabled':''}>${Duty.overrideSaving?'Đang lưu…':'Lưu ghi đè'}</button>
      </div>
    </form>` : '';
  return `
    <p class="da-form-hint">Ưu tiên xử lý: <strong>Cấp ngày</strong> &gt; <strong>Cấp tuần</strong> &gt; Xoay vòng mặc định. Dùng khi Tổ đang trực bận thi/nghỉ lễ/đổi ca đột xuất.</p>
    <button class="da-btn sm primary" id="dm-ov-add-btn">+ Thêm ghi đè</button>
    ${form}
    <div class="dm-ov-list">${rows}</div>`;
}

async function dutyGenerateWeek() {
  const draft = Duty.weekConfigDraft;
  if (!draft?.group) { dutyNotify('Chưa chọn Tổ trực.', 'error'); return; }
  if (!confirm(`Khởi tạo lại lịch trực lớp tuần ${Duty.week} cho Tổ ${draft.group}? Lịch cũ sẽ bị xoá.`)) return;
  Duty.weekConfigSaving = true; dutyRenderBody();
  try {
    const exemptList = draft.exemptIds.map(id => {
      const s = (Duty.students||[]).find(x=>x.id===id);
      return { studentId: id, studentName: s?.name||'' };
    });
    await dutyApiPost('saveDutyWeekGroup', { week: Duty.week, group: draft.group });
    await dutyApiPost('saveDutyExempt', { week: Duty.week, list: exemptList });
    await dutyApiPost('generateDutyRoster', { week: Duty.week, force: true });
    Duty.weekConfigDraft = null; Duty.weekConfigOpen = false;
    Duty.classLoaded = false;
    await dutyLoadClass();
    dutyNotify(`Đã khởi tạo lịch tuần ${Duty.week} cho Tổ ${draft.group}`, 'success');
  } catch(err) { dutyNotify('Không khởi tạo được: ' + (err?.message||err), 'error'); }
  finally { Duty.weekConfigSaving = false; dutyRenderBody(); }
}

async function dutyGenerateOutdoorWeek() {
  const draft = Duty.outdoorWeekConfigDraft;
  if (!draft?.group) { dutyNotify('Chưa chọn Tổ trực Sân trường.', 'error'); return; }
  if (Number(draft.group) === Number(Duty.weekGroup)) {
    dutyNotify('Tổ này đang phụ trách Lớp — không thể vừa phụ trách Sân trường.', 'error');
    return;
  }
  if (!confirm(`Khởi tạo lại lịch trực Sân trường tuần ${Duty.week} cho Tổ ${draft.group}? Lịch Sân trường cũ sẽ bị xoá.`)) return;
  Duty.outdoorWeekConfigSaving = true; dutyRenderBody();
  try {
    const exemptList = draft.exemptIds.map(id => {
      const s = (Duty.students||[]).find(x=>x.id===id);
      return { studentId: id, studentName: s?.name||'' };
    });
    await dutyApiPost('saveDutyOutdoorWeekGroup', { week: Duty.week, group: draft.group });
    await dutyApiPost('saveDutyExempt', { week: Duty.week, list: exemptList });
    await dutyApiPost('generateDutyRoster', { week: Duty.week, force: true });
    Duty.outdoorWeekConfigDraft = null; Duty.outdoorWeekConfigOpen = false;
    Duty.classLoaded = false;
    await dutyLoadClass();
    dutyNotify(`Đã khởi tạo lịch Sân trường tuần ${Duty.week} cho Tổ ${draft.group}`, 'success');
  } catch(err) { dutyNotify('Không khởi tạo được: ' + (err?.message||err), 'error'); }
  finally { Duty.outdoorWeekConfigSaving = false; dutyRenderBody(); }
}


async function dutySaveWorkItems() {
  const draft = (Duty.workItemsDraft||[]).filter(it=>(it.name||'').trim());
  if (!draft.length) { dutyNotify('Cần ít nhất 1 đầu việc.', 'error'); return; }
  Duty.workItemsSaving = true; dutyRenderBody();
  try {
    await dutyApiPost('saveDutyWorkItems', { items: draft });
    Duty.workItems = draft; Duty.workItemsDraft = null;
    dutyNotify('Đã lưu đầu việc. Bấm "Khởi tạo lịch tuần" để áp dụng cho tuần này.', 'success');
  } catch(err) { dutyNotify('Không lưu được: ' + (err?.message||err), 'error'); }
  finally { Duty.workItemsSaving = false; dutyRenderBody(); }
}

async function dutySaveOutdoorWorkItems() {
  const draft = (Duty.outdoorWorkItemsDraft||[]).filter(it=>(it.name||'').trim());
  if (!draft.length) { dutyNotify('Cần ít nhất 1 đầu việc sân trường.', 'error'); return; }
  Duty.outdoorWorkItemsSaving = true; dutyRenderBody();
  try {
    await dutyApiPost('saveDutyOutdoorWorkItems', { items: draft });
    Duty.outdoorWorkItems = draft; Duty.outdoorWorkItemsDraft = null;
    dutyNotify('Đã lưu đầu việc sân trường. Bấm "Khởi tạo lịch tuần" để áp dụng cho tuần này.', 'success');
  } catch(err) { dutyNotify('Không lưu được: ' + (err?.message||err), 'error'); }
  finally { Duty.outdoorWorkItemsSaving = false; dutyRenderBody(); }
}

async function dutySaveParkingFixed() {
  const draft = (Duty.parkingDraft||[]).filter(p=>p.studentId);
  Duty.parkingSaving = true; dutyRenderBody();
  try {
    const list = draft.map(p => {
      const s = (Duty.students||[]).find(x=>x.id===p.studentId);
      return { studentId: p.studentId, studentName: s?.name||(p.studentName||''), weekday: p.weekday };
    });
    await dutyApiPost('saveDutyParkingFixed', { list });
    Duty.parkingFixed = list; Duty.parkingDraft = null;
    dutyNotify('Đã lưu cấu hình nhà xe cố định', 'success');
  } catch(err) { dutyNotify('Không lưu được: ' + (err?.message||err), 'error'); }
  finally { Duty.parkingSaving = false; dutyRenderBody(); }
}

/* ═══════════════════════════════════════════════════════════

   WIZARD TẠO LỊCH — B1..B5
   B1 Chọn tổ trực · B2 Chọn người miễn trực · B3 Chọn ngày nghỉ
   B4 Khu vực & Đầu việc (Lớp + Sân trường) · B5 Xem lại & Tạo lịch
   Cấu hình đầu việc (B4) lưu sẵn trong DB — mở wizard lần sau tự
   điền lại, chỉ cần next-next nếu không đổi gì.
   ═══════════════════════════════════════════════════════════ */

const WIZARD_STEPS = [
  { n: 1, label: 'Khu vực & Tổ trực' },
  { n: 2, label: 'Miễn trực' },
  { n: 3, label: 'Ngày nghỉ' },
  { n: 4, label: 'Đầu việc' },
  { n: 5, label: 'Xem lại' },
];

async function dutyOpenWizard() {
  await Promise.all([dutyLoadWorkItems(), dutyLoadOutdoorWorkItems(), dutyLoadStudents()]);
  if (!Duty.skipDaysLoaded) {
    try { Duty.skipDays = await dutyApiGet('getDutySkipDays', { week: Duty.week }) || []; }
    catch (_) { Duty.skipDays = []; }
    Duty.skipDaysLoaded = true;
  }
  // Khu vực đã tạo lịch xong (có Tổ phụ trách) → khoá lại, chỉ mở khu vực chưa có lịch.
  // Nếu cả 2 khu vực đều đã có lịch → lock cả 2 (user dùng tab Quản lý để sửa).
  // Nếu chỉ 1 khu vực có lịch → lock khu vực đó, auto-select khu vực còn lại.
  const lockedAreas = [];
  if (Duty.outdoorGroup) lockedAreas.push('outdoor');
  if (Duty.weekGroup)    lockedAreas.push('class');

  // activeAreas: khu vực sẽ được tạo lần này = khu vực chưa lock.
  // Nếu outdoor đã lock → mở class; nếu class đã lock → mở outdoor; nếu cả 2 đã lock → mở class (user sẽ thấy cả 2 lock).
  let activeAreas;
  if (lockedAreas.includes('outdoor') && !lockedAreas.includes('class')) {
    activeAreas = ['class'];
  } else if (lockedAreas.includes('class') && !lockedAreas.includes('outdoor')) {
    activeAreas = ['outdoor'];
  } else {
    // Chưa có gì hoặc cả 2 đều lock → mặc định class
    activeAreas = ['class'];
  }
  // Tổ khả dụng cho mỗi khu vực = tất cả tổ TRỪ tổ đã khoá ở khu vực còn lại.
  const usedByOutdoor = Duty.outdoorGroup ? Number(Duty.outdoorGroup) : null;
  const usedByClass   = Duty.weekGroup    ? Number(Duty.weekGroup)    : null;
  Duty.wizardDraft = {
    classGroup:   Duty.weekGroup || null,
    outdoorGroup: Duty.outdoorGroup || null,
    exemptIds:   (Duty.exemptList||[]).map(e=>e.studentId),
    skipDays:    (Duty.skipDays||[]).slice(),
    workItems:        (Duty.workItems||[]).map(w=>Object.assign({},w)),
    outdoorWorkItems: (Duty.outdoorWorkItems||[]).map(w=>Object.assign({},w)),
    activeAreas,
    lockedAreas,   // khu vực không cho đổi lần này
    usedByOutdoor, // tổ đang khoá ở outdoor (không hiện trong picker class)
    usedByClass,   // tổ đang khoá ở class   (không hiện trong picker outdoor)
  };
  Duty.wizardStep = 1;
  Duty.wizardOpen = true;
  Duty.wizardError = null;
  Duty.activeTab = 'create';
  dutyRenderRoot();
}

function dutyCloseWizard() {
  Duty.wizardOpen = false;
  Duty.wizardDraft = null;
  Duty.wizardError = null;
  if (Duty.activeTab === 'create') Duty.activeTab = 'today';
  dutyRenderRoot();
}

function dutyRenderWizard() {
  const body = document.getElementById('da-body');
  if (!body) return;
  const draft = Duty.wizardDraft;
  if (!draft) { dutyCloseWizard(); return; }
  const step = Duty.wizardStep;
  const progress = `<div class="dt-wizard-progress">${WIZARD_STEPS.map(s => `
    <div class="dt-wizard-dot ${s.n < step ? 'done' : (s.n === step ? 'active' : '')}"></div>`).join('')}</div>
    <div class="dt-wizard-steplabel">Bước ${step}/5 — ${dutyEscape(WIZARD_STEPS[step-1].label)}</div>`;
  let leftHtml = '';
  if (step === 1) leftHtml = dutyRenderWizardStep1(draft);
  else if (step === 2) leftHtml = dutyRenderWizardStep2(draft);
  else if (step === 3) leftHtml = dutyRenderWizardStep3(draft);
  else if (step === 4) leftHtml = dutyRenderWizardStep4(draft);
  else if (step === 5) leftHtml = dutyRenderWizardStep5(draft);
  const hasSplit = true;
  const stepHtml = `
    <div class="dt-wizard-split">
      <div class="dt-wizard-split-left">${leftHtml}</div>
      <div class="dt-wizard-split-right">${dutyRenderWizardPreviewPanel(draft)}</div>
    </div>`;
  const errorHtml = Duty.wizardError ? `<div class="dt-wizard-error">⚠️ ${dutyEscape(Duty.wizardError)}</div>` : '';
  body.innerHTML = `<div class="dt-wizard has-split">
    ${progress}
    <div class="dt-wizard-card">${errorHtml}${stepHtml}</div>
    <div class="dt-wizard-actions">
      <button class="da-btn" id="dt-wz-cancel">Huỷ</button>
      <div style="display:flex;gap:8px;">
        ${step > 1 ? `<button class="da-btn" id="dt-wz-back">‹ Quay lại</button>` : ''}
        ${step < 5
          ? `<button class="da-btn primary" id="dt-wz-next">Tiếp theo ›</button>`
          : `<button class="da-btn primary" id="dt-wz-finish" ${Duty.wizardSaving?'disabled':''}>${Duty.wizardSaving ? ((Duty.wizardDraft?.aiNote||'').trim() ? 'AI đang xử lý…' : 'Đang tạo…') : '✓ Tạo lịch'}</button>`}
      </div>
    </div>
  </div>`;
  document.getElementById('dt-wz-cancel')?.addEventListener('click', dutyCloseWizard);
  document.getElementById('dt-wz-back')?.addEventListener('click', () => {
    Duty.wizardError = null; Duty.wizardStep--; dutyRenderBody();
  });
  document.getElementById('dt-wz-next')?.addEventListener('click', () => {
    Duty.wizardError = null;
    if (dutyWizardValidateStep(step)) { Duty.wizardStep++; }
    dutyRenderBody();
  });
  document.getElementById('dt-wz-finish')?.addEventListener('click', dutyWizardSubmit);
  dutyBindWizardStepEvents(step, draft);
}

function dutyWizardValidateStep(step) {
  const draft = Duty.wizardDraft;
  if (step === 1) {
    if (!draft.activeAreas.length) { Duty.wizardError = 'Vui lòng chọn ít nhất 1 khu vực trực.'; return false; }
    if (draft.activeAreas.includes('class')   && !draft.classGroup)   { Duty.wizardError = 'Chưa chọn Tổ cho khu vực Lớp.'; return false; }
    if (draft.activeAreas.includes('outdoor') && !draft.outdoorGroup) { Duty.wizardError = 'Chưa chọn Tổ cho khu vực Sân trường.'; return false; }
    if (draft.activeAreas.includes('class') && draft.activeAreas.includes('outdoor')
        && Number(draft.classGroup) === Number(draft.outdoorGroup)) {
      Duty.wizardError = 'Một Tổ không thể vừa phụ trách Lớp vừa phụ trách Sân trường — hãy chọn 2 Tổ khác nhau.';
      dutyRenderBody();
      return false;
    }
  }
  if (step === 4) {
    if (draft.activeAreas.includes('class') && !(draft.workItems||[]).some(w=>(w.name||'').trim())) { Duty.wizardError = 'Cần ít nhất 1 đầu việc cho khu vực Lớp.'; return false; }
    if (draft.activeAreas.includes('outdoor') && !(draft.outdoorWorkItems||[]).some(w=>(w.name||'').trim())) { Duty.wizardError = 'Cần ít nhất 1 đầu việc cho khu vực Sân trường.'; return false; }
  }
  return true;
}

/* ── Preview bên phải (B2–B5): công việc dự kiến từng người, Thứ 2 → CN ──
   Đây là bản xem trước tham khảo (chia vòng tròn đơn giản theo thứ tự danh
   sách) — lịch thật sự khi bấm "Tạo lịch" sẽ do hệ thống tự xoay công bằng
   dựa theo lịch sử trực (không nhất thiết giống hệt bản xem trước này). */
function dutyWizardAreaMembers(draft, area) {
  const groupNum = area === 'class' ? draft.classGroup : draft.outdoorGroup;
  if (!groupNum) return [];
  const exemptSet = new Set(draft.exemptIds);
  return (Duty.students || []).filter(s => Number(s.group) === Number(groupNum) && !exemptSet.has(s.id));
}

function dutyWizardBuildAreaPreview(draft, area) {
  const groupNum = area === 'class' ? draft.classGroup : draft.outdoorGroup;
  const workItems = ((area === 'class' ? draft.workItems : draft.outdoorWorkItems) || []).filter(w => (w.name || '').trim());
  const members = dutyWizardAreaMembers(draft, area);
  const skipSet = new Set(draft.skipDays || []);
  const map = new Map();
  members.forEach(m => map.set(m.id, {}));
  if (members.length && workItems.length) {
    let cursor = 0;
    WIZARD_TABLE_DAYS.forEach(day => {
      ['sang', 'chieu'].forEach(slot => {
        if (skipSet.has(day + '|' + slot)) return;
        workItems.forEach(item => {
          const n = Math.max(1, Number(item.peoplePerSlot) || 1);
          for (let i = 0; i < n; i++) {
            const person = members[cursor % members.length];
            cursor++;
            const rec = map.get(person.id);
            if (!rec[day]) rec[day] = {};
            if (!rec[day][slot]) rec[day][slot] = [];
            rec[day][slot].push(item.name);
          }
        });
      });
    });
  }
  return { groupNum, members, map, hasWork: workItems.length > 0 };
}

function dutyRenderWizardPreviewPanel(draft) {
  const areas = (draft.activeAreas || []).filter(a => (a === 'class' && draft.classGroup) || (a === 'outdoor' && draft.outdoorGroup));
  if (!areas.length) {
    return `
      <div class="dt-wizard-preview-title">👀 Xem trước lịch tuần</div>
      <div class="dt-wizard-preview-empty">Chọn khu vực &amp; Tổ trực để xem trước lịch tuần.</div>`;
  }
  const blocks = areas.map(area => {
    const { groupNum, members, map, hasWork } = dutyWizardBuildAreaPreview(draft, area);
    const icon = area === 'class' ? '🏠' : '🌳';
    const label = area === 'class' ? 'Lớp' : 'Sân trường';
    if (!members.length) {
      return `<div class="dt-wizard-preview-block">
        <div class="dt-wizard-preview-blocktitle">${icon} ${label} — Tổ ${dutyEscape(String(groupNum))}</div>
        <div class="dt-wizard-preview-empty">Chưa có thành viên (kiểm tra danh sách Tổ / miễn trực).</div>
      </div>`;
    }
    const rows = members.map(m => {
      const cells = WIZARD_TABLE_DAYS.map(day => {
        const dayData = map.get(m.id)[day];
        if (!dayData) return `<td class="dt-wizard-preview-cell"></td>`;
        const title = [...(dayData.sang || []), ...(dayData.chieu || [])].join(', ');
        const sangDot = dayData.sang ? `<span class="dt-wizard-preview-dot s"></span>` : '';
        const chieuDot = dayData.chieu ? `<span class="dt-wizard-preview-dot c"></span>` : '';
        return `<td class="dt-wizard-preview-cell" title="${dutyEscape(title)}">${sangDot}${chieuDot}</td>`;
      }).join('');
      return `<tr><td class="dt-wizard-preview-name">${dutyEscape(m.name)}</td>${cells}</tr>`;
    }).join('');
    return `<div class="dt-wizard-preview-block">
      <div class="dt-wizard-preview-blocktitle">${icon} ${label} — Tổ ${dutyEscape(String(groupNum))}</div>
        <table class="dt-wizard-preview-table">
        <thead><tr><th></th>${WIZARD_TABLE_DAYS.map(d => `<th>${dutyEscape(d.replace('Thứ ', 'T').replace('Chủ nhật', 'CN'))}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${!hasWork ? `<div class="dt-wizard-preview-empty" style="margin-top:4px;">Thêm đầu việc ở Bước 4 để xem phân công chi tiết.</div>` : ''}
    </div>`;
  }).join('');
  return `
    <div class="dt-wizard-preview-title">👀 Xem trước lịch tuần</div>
    <p class="dt-wizard-preview-hint">Dự kiến theo thứ tự chia — lịch thật do hệ thống tự xoay công bằng khi tạo.</p>
    ${blocks}
  `;
}

/* Cập nhật riêng khung xem trước bên phải, không vẽ lại toàn bộ Bước
   (giữ nguyên trạng thái checkbox / focus đang thao tác bên trái). */
function dutyRenderWizardPreviewOnly() {
  const el = document.querySelector('.dt-wizard-split-right');
  if (!el || !Duty.wizardDraft) return;
  el.innerHTML = dutyRenderWizardPreviewPanel(Duty.wizardDraft);
}

/* B1 — Khu vực trực & Tổ phụ trách từng khu vực (có thể chọn cả 2 khu vực, mỗi khu vực 1 Tổ riêng) */
function dutyRenderWizardStep1(draft) {
  const groups = Array.from(new Set((Duty.students||[]).map(s=>Number(s.group)))).filter(Boolean).sort((a,b)=>a-b);
  const hasOutdoor = groups.length > 1;
  if (!hasOutdoor) draft.activeAreas = draft.activeAreas.filter(a => a !== 'outdoor');
  const classChecked   = draft.activeAreas.includes('class');
  const outdoorChecked = draft.activeAreas.includes('outdoor');
  const locked = draft.lockedAreas || [];
  // Mỗi Tổ chỉ được chọn 1 khu vực/tuần. Tổ đã được khu vực kia dùng (kể cả khi khu vực kia
  // KHÔNG được tick sửa ở lượt này — nghĩa là cấu hình cũ vẫn đang khoá) sẽ bị loại khỏi danh
  // sách chọn của khu vực đang sửa, để tránh 1 Tổ bị gán trùng 2 khu vực.
  // excludeGroup: tổ đang khoá ở khu vực kia → ẩn khỏi picker này
  const groupPicker = (name, selected, excludeGroup) => `
    <div class="da-check-group" style="max-height:none;margin-top:8px;">
      ${groups.filter(g => g !== Number(excludeGroup)).map(g => `
        <label style="display:flex;align-items:center;gap:8px;">
          <input type="radio" name="${name}" value="${g}" ${Number(selected)===g?'checked':''} />
          Tổ ${g}
        </label>`).join('')}
    </div>`;

  // Card khu vực bị khoá (đã tạo xong) — chỉ hiển thị thông tin, không cho chọn
  const lockedCard = (icon, title, desc, group) => `
    <div class="dt-wizard-area-card locked" style="opacity:.6;cursor:not-allowed;position:relative;">
      <input type="radio" name="dt-wz-area" value="_locked_" disabled style="pointer-events:none;" />
      <div style="flex:1;">
        <div class="dt-wizard-area-card-title">${icon} ${title}
          <span style="font-size:11px;font-weight:600;color:var(--accent);background:var(--accent-bg);border-radius:6px;padding:2px 7px;margin-left:6px;">✓ Tổ ${dutyEscape(String(group))} — Đã tạo</span>
        </div>
        <div class="dt-wizard-area-card-desc">${desc} Khu vực này đã có lịch tuần ${Duty.week} — chỉ có thể chỉnh sửa ở tab Quản lý.</div>
      </div>
    </div>`;

  const outdoorIsLocked = locked.includes('outdoor') && draft.usedByOutdoor;
  const classIsLocked   = locked.includes('class')   && draft.usedByClass;

  return `
    <div class="dt-wizard-title">Tuần ${Duty.week} trực khu vực nào?</div>
    <p class="dt-wizard-desc">Chỉ chọn <strong>1 trong 2</strong> khu vực bên dưới để tạo lịch cho khu vực đó. Chọn khu vực này sẽ tự bỏ chọn khu vực kia. Khu vực không chọn sẽ giữ nguyên cấu hình cũ.</p>
    <div class="dt-wizard-areas">
      ${hasOutdoor
        ? outdoorIsLocked
          ? lockedCard('🌳', 'Làm ngoài sân', 'Quét sân, dọn vệ sinh khu vực ngoài lớp.', draft.usedByOutdoor)
          : `<label class="dt-wizard-area-card ${outdoorChecked ? 'selected' : ''}">
              <input type="radio" name="dt-wz-area" value="outdoor" ${outdoorChecked?'checked':''} />
              <div style="flex:1;">
                <div class="dt-wizard-area-card-title">🌳 Làm ngoài sân</div>
                <div class="dt-wizard-area-card-desc">Quét sân, dọn vệ sinh khu vực ngoài lớp.</div>
                ${outdoorChecked ? groupPicker('dt-wz-outdoor-group', draft.outdoorGroup, classIsLocked ? draft.usedByClass : null) : ''}
              </div>
            </label>`
        : `<p class="dt-wizard-desc">Chỉ có 1 Tổ trong danh sách lớp nên không tách riêng Sân trường.</p>`}
      ${classIsLocked
        ? lockedCard('🏠', 'Làm trong lớp', 'Quét dọn, trực nhật trong lớp học.', draft.usedByClass)
        : `<label class="dt-wizard-area-card ${classChecked ? 'selected' : ''}">
            <input type="radio" name="dt-wz-area" value="class" ${classChecked?'checked':''} />
            <div style="flex:1;">
              <div class="dt-wizard-area-card-title">🏠 Làm trong lớp</div>
              <div class="dt-wizard-area-card-desc">Quét dọn, trực nhật trong lớp học.</div>
              ${classChecked ? groupPicker('dt-wz-class-group', draft.classGroup, outdoorIsLocked ? draft.usedByOutdoor : null) : ''}
            </div>
          </label>`}
    </div>
  `;
}

/* B2 — Chọn người miễn trực (không phải xung kích, làm việc khác) */
function dutyRenderWizardStep2(draft) {
  const involvedGroups = new Set();
  if (draft.activeAreas.includes('class')   && draft.classGroup)   involvedGroups.add(Number(draft.classGroup));
  if (draft.activeAreas.includes('outdoor') && draft.outdoorGroup) involvedGroups.add(Number(draft.outdoorGroup));
  const members = (Duty.students||[]).filter(s=>involvedGroups.has(Number(s.group)));
  const exemptSet = new Set(draft.exemptIds);
  const groupLabel = Array.from(involvedGroups).sort((a,b)=>a-b).map(g=>`Tổ ${g}`).join(', ') || '—';
  return `
    <div class="dt-wizard-title">Ai không tham gia trực tuần này?</div>
    <p class="dt-wizard-desc">Chọn thành viên ${dutyEscape(groupLabel)} đang bận việc khác (xung kích, ốm, v.v.) — sẽ được miễn khỏi lượt chia việc tuần này.</p>
    <div class="da-check-group">
      ${members.length ? members.map(s=>`
        <label><input type="checkbox" data-wz-exempt-id="${dutyEscape(s.id)}" ${exemptSet.has(s.id)?'checked':''} />${dutyEscape(s.name)}${involvedGroups.size>1?` <span style="color:var(--text-3);font-size:11px;">(Tổ ${dutyEscape(String(s.group))})</span>`:''}</label>`).join('')
        : `<span style="font-size:14px;color:var(--text-3);">Chưa có học sinh trong Tổ đã chọn.</span>`}
    </div>
  `;
}

/* B3 — Chọn buổi nghỉ trong tuần (lễ, không đi học → không tính trực) */
const WIZARD_TABLE_DAYS = DUTY_DAYS.concat(['Chủ nhật']);
function dutyRenderWizardStep3(draft) {
  const skipSet = new Set(draft.skipDays);
  const rows = WIZARD_TABLE_DAYS.map(d => `
    <tr>
      <td style="text-align:left;font-weight:700;">${dutyEscape(d)}</td>
      <td><input type="checkbox" data-wz-skip="${dutyEscape(d)}|sang" ${skipSet.has(d+'|sang')?'checked':''} /></td>
      <td><input type="checkbox" data-wz-skip="${dutyEscape(d)}|chieu" ${skipSet.has(d+'|chieu')?'checked':''} /></td>
    </tr>`).join('');
  return `
    <div class="dt-wizard-title">Tuần này buổi nào không đi học?</div>
    <p class="dt-wizard-desc">Tick vào buổi nghỉ (lễ, không đi học) — buổi đó sẽ không tính trực. Bỏ trống nếu học đủ cả tuần.</p>
    <table class="dt-wizard-skip-table">
      <thead><tr><th></th><th>Sáng</th><th>Chiều</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/* B4 — Chia đầu việc theo từng khu vực đã chọn ở Bước 1 */
function dutyRenderWizardStep4(draft) {
  let html = `
    <div class="dt-wizard-title">Chia đầu việc</div>
    <p class="dt-wizard-desc">Danh sách việc được lưu sẵn — lần sau mở wizard sẽ tự điền lại.</p>`;
  if (draft.activeAreas.includes('class')) {
    const wiRows = (draft.workItems||[]).map((item,idx) => `
      <div class="dt-wizard-workitem-row">
        <input type="text" data-wz-widx="${idx}" data-field="name" value="${dutyEscape(item.name)}" placeholder="Tên đầu việc" />
        <input type="number" min="1" data-wz-widx="${idx}" data-field="peoplePerSlot" value="${item.peoplePerSlot}" title="Số người/buổi" />
        <button class="da-btn sm" data-wz-remove-widx="${idx}">✕</button>
      </div>`).join('');
    html += `
      <div class="dt-wizard-subhead">🏠 Khu vực Lớp — Tổ ${dutyEscape(String(draft.classGroup))} — đầu việc</div>
      <div style="display:flex;flex-direction:column;gap:6px;">${wiRows || '<span class="da-empty">Chưa có đầu việc.</span>'}</div>
      <button class="da-btn sm" id="dt-wz-wi-add">+ Thêm đầu việc</button>`;
  }
  if (draft.activeAreas.includes('outdoor')) {
    const owiRows = (draft.outdoorWorkItems||[]).map((item,idx) => `
      <div class="dt-wizard-workitem-row">
        <input type="text" data-wz-owidx="${idx}" data-field="name" value="${dutyEscape(item.name)}" placeholder="Tên đầu việc" />
        <input type="number" min="1" data-wz-owidx="${idx}" data-field="peoplePerSlot" value="${item.peoplePerSlot}" title="Số người/buổi" />
        <button class="da-btn sm" data-wz-remove-owidx="${idx}">✕</button>
      </div>`).join('');
    html += `
      <div class="dt-wizard-subhead">🌳 Khu vực Sân trường — Tổ ${dutyEscape(String(draft.outdoorGroup))} — đầu việc</div>
      <div style="display:flex;flex-direction:column;gap:6px;">${owiRows || '<span class="da-empty">Chưa có đầu việc.</span>'}</div>
      <button class="da-btn sm" id="dt-wz-owi-add">+ Thêm đầu việc</button>`;
  }
  // AI ghi chú — yêu cầu cố định / điều chỉnh phân công bằng ngôn ngữ tự nhiên
  html += dutyRenderAiNotePanel(draft);
  return html;
}

/* ── AI ghi chú tại Bước 4: nhập yêu cầu bằng ngôn ngữ tự nhiên → AI chỉnh workItems ──
   Key API lấy sẵn ở backend (ok.js), không cần người dùng nhập key. */
function dutyRenderAiNotePanel(draft) {
  const noteVal = dutyEscape(draft.aiNote || '');
  return `<div class="dt-ai-panel dt-ai-note-panel" id="dt-ai-note-panel" style="margin-top:18px;">
    <div class="dt-ai-header">
      <span class="dt-ai-title">Yêu cầu đặc biệt (AI)</span>
    </div>
    <div class="dt-ai-body">
      <p style="margin:0 0 8px;font-size:12.5px;color:var(--text-2);">Ghi yêu cầu bằng lời thường — AI sẽ điều chỉnh danh sách đầu việc & số người/buổi phù hợp. Ví dụ: "Cố định bạn Hằng đóng cửa tắt điện", "Thêm việc lau bảng 2 người mỗi buổi", "Bạn Thiện miễn quét sân", "Hoàng Linh tắt điện đóng cửa cả tuần trừ thứ 6, thứ 6 random"…</p>
      <textarea id="dt-ai-note-input" rows="3" placeholder="Ghi yêu cầu đặc biệt…" style="width:100%;box-sizing:border-box;font-family:inherit;font-size:13px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:8px;padding:8px 10px;resize:vertical;">${noteVal}</textarea>
      <p style="margin:6px 0 0;font-size:11.5px;color:var(--text-3);">AI sẽ tự động xử lý yêu cầu này khi bạn bấm <strong>Tạo lịch</strong> ở bước cuối.</p>
    </div>
  </div>`;
}

/* dutyAiApplyNote — gọi AI để điều chỉnh workItems theo draft.aiNote.
   Có thể gọi từ bước 5 submit (silent=true → không re-render giữa chừng)
   hoặc standalone (silent=false, mặc định). */
async function dutyAiApplyNote(draft, silent = true) {
  const note = (draft.aiNote || '').trim();
  if (!note) return;

  const isClass   = draft.activeAreas.includes('class');
  const isOutdoor = draft.activeAreas.includes('outdoor');
  const workItems = isClass ? draft.workItems : draft.outdoorWorkItems;
  const members = dutyWizardAreaMembers(draft, isClass ? 'class' : 'outdoor');

  const prompt = `Bạn là trợ lý tạo lịch trực nhật cho lớp học Việt Nam.
Danh sách đầu việc hiện tại (JSON): ${JSON.stringify(workItems)}
Danh sách học sinh trong tổ: ${members.map(m=>m.name).join(', ')}
Yêu cầu điều chỉnh của giáo viên/lớp trưởng: "${note}"

Các ngày hợp lệ (đúng chính tả, có dấu): "Thứ 2","Thứ 3","Thứ 4","Thứ 5","Thứ 6","Thứ 7".

Hãy trả về JSON hợp lệ duy nhất (không có markdown, không có giải thích), là mảng đầu việc đã được cập nhật theo yêu cầu. Mỗi phần tử có dạng:
{"id":"...","name":"...","peoplePerSlot":N,"fixedStudents":["tên1","tên2"],"fixedExceptDays":["Thứ 6"]}

- "fixedStudents": chỉ thêm khi yêu cầu CỐ ĐỊNH một/vài người cụ thể luôn làm việc đó, còn lại để mảng rỗng [].
- "fixedExceptDays": những ngày mà việc cố định ở trên KHÔNG áp dụng — buổi đó sẽ random người như bình thường thay vì gán người cố định. Chỉ thêm khi yêu cầu có nói dạng "trừ thứ X", "trừ khi vắng thứ X", "trừ buổi sáng thứ X"…; nếu không có ngoại lệ thì để mảng rỗng []. Nếu ngoại lệ chỉ áp dụng 1 buổi cụ thể (sáng/chiều), ghi dạng "Thứ 6|sang" hoặc "Thứ 6|chieu"; nếu áp dụng cả 2 buổi trong ngày đó thì ghi "Thứ 6" (không cần buổi).
- Nếu yêu cầu KHÔNG liên quan tới cố định người (VD chỉ đổi số người/buổi, thêm/xoá việc, miễn trực…) thì giữ nguyên "fixedStudents" và "fixedExceptDays" hiện có của việc đó, không tự ý xoá.
Giữ nguyên các việc không bị yêu cầu thay đổi. Trả về JSON thuần, không có \`\`\`.`;

  draft.aiNoteError = null; draft.aiNoteResult = null;
  if (!silent) { draft.aiNoteLoading = true; dutyRenderBody(); }

  try {
    let text = await dutyAiCallWithFallback(prompt, { maxOutputTokens: 600, temperature: 0.3 });
    text = text.replace(/```json|```/g, '').trim();
    const updated = JSON.parse(text);
    if (!Array.isArray(updated)) throw new Error('AI trả về định dạng không hợp lệ.');
    if (isClass)   draft.workItems = updated;
    else           draft.outdoorWorkItems = updated;
    draft.aiNoteResult = `✓ Đã áp dụng ${updated.length} đầu việc theo yêu cầu.`;
  } catch(err) {
    draft.aiNoteError = err?.message || String(err);
    // Không throw — submit vẫn tiếp tục với workItems hiện tại
  } finally {
    if (!silent) { draft.aiNoteLoading = false; dutyRenderBody(); }
  }
}

/* B5 — Xem lại & Tạo lịch */
function dutyRenderWizardStep5(draft) {
  const exemptNames = draft.exemptIds
    .map(id => (Duty.students||[]).find(s=>s.id===id)?.name)
    .filter(Boolean);
  const isClass   = draft.activeAreas.includes('class');
  const isOutdoor = draft.activeAreas.includes('outdoor');
  const areaLabel = [isClass ? '🏠 Lớp' : '', isOutdoor ? '🌳 Sân trường' : ''].filter(Boolean).join(' + ');
  const classWorkCount   = (draft.workItems||[]).filter(w=>(w.name||'').trim()).length;
  const outdoorWorkCount = (draft.outdoorWorkItems||[]).filter(w=>(w.name||'').trim()).length;
  const skipDaysLabel = draft.skipDays.length
    ? dutyEscape(draft.skipDays.map(k=>{const [d,s]=k.split('|');return d+' '+(SLOT_LABEL[s]||s);}).join(', '))
    : 'Không có';
  return `
    <div class="dt-wizard-title">Xem lại trước khi tạo lịch</div>
    <div class="dt-wizard-review">
      <div class="dt-wizard-review-row">
        <span class="dt-wizard-review-label">Khu vực trực</span>
        <span class="dt-wizard-review-value">${areaLabel || 'Chưa chọn'}</span>
      </div>
      ${isClass ? `
      <div class="dt-wizard-review-row">
        <span class="dt-wizard-review-label">Tổ phụ trách Lớp</span>
        <span class="dt-wizard-review-value">Tổ ${dutyEscape(String(draft.classGroup))}</span>
      </div>
      <div class="dt-wizard-review-row">
        <span class="dt-wizard-review-label">Đầu việc Lớp</span>
        <span class="dt-wizard-review-value">${classWorkCount} việc</span>
      </div>` : ''}
      ${isOutdoor ? `
      <div class="dt-wizard-review-row">
        <span class="dt-wizard-review-label">Tổ phụ trách Sân trường</span>
        <span class="dt-wizard-review-value">Tổ ${dutyEscape(String(draft.outdoorGroup))}</span>
      </div>
      <div class="dt-wizard-review-row">
        <span class="dt-wizard-review-label">Đầu việc Sân trường</span>
        <span class="dt-wizard-review-value">${outdoorWorkCount} việc</span>
      </div>` : ''}
      <div class="dt-wizard-review-row">
        <span class="dt-wizard-review-label">Miễn trực</span>
        <span class="dt-wizard-review-value">${exemptNames.length ? dutyEscape(exemptNames.join(', ')) : 'Không có'}</span>
      </div>
      <div class="dt-wizard-review-row">
        <span class="dt-wizard-review-label">Buổi nghỉ</span>
        <span class="dt-wizard-review-value">${skipDaysLabel}</span>
      </div>
      ${(draft.aiNote||'').trim() ? `
      <div class="dt-wizard-review-row">
        <span class="dt-wizard-review-label">Yêu cầu AI</span>
        <span class="dt-wizard-review-value" style="font-style:italic;color:var(--accent);">${dutyEscape((draft.aiNote||'').trim())}</span>
      </div>` : ''}
    </div>
    <p class="dt-wizard-desc">Bấm "Tạo lịch" để áp dụng. Lịch cũ của tuần ${Duty.week} (nếu có) sẽ bị xoá và tạo lại.${(draft.aiNote||'').trim() ? ' AI sẽ xử lý yêu cầu đặc biệt trước khi tạo.' : ''}</p>
  `;
}

function dutyBindWizardStepEvents(step, draft) {
  if (step === 1) {
    document.querySelectorAll('input[name="dt-wz-area"]').forEach(cb => {
      cb.addEventListener('change', () => {
        // Chỉ cho chọn 1 trong 2 khu vực mỗi lần tạo lịch — chọn ô này sẽ tự bỏ chọn ô kia.
        // Chọn khu vực nào thì reset Tổ của khu vực KIA về null — đây chỉ là lựa chọn
        // đang soạn, chưa lưu, nên không được giữ lại làm "đã dùng". Việc loại Tổ khỏi
        // picker (excludeGroup) giờ chỉ dựa vào usedByOutdoor/usedByClass khi khu vực đó
        // THỰC SỰ đã khoá (đã tạo & lưu ở backend — classIsLocked/outdoorIsLocked), nên
        // không còn cần đồng bộ tay 2 biến này nữa → không còn kẹt "ghost Tổ" khi qua lại.
        draft.activeAreas = cb.checked ? [cb.value] : [];
        draft.classGroup   = null;
        draft.outdoorGroup = null;
        dutyRenderBody();
      });
    });
    document.querySelectorAll('input[name="dt-wz-class-group"]').forEach(r => {
      r.addEventListener('change', () => { draft.classGroup = Number(r.value); dutyRenderBody(); });
    });
    document.querySelectorAll('input[name="dt-wz-outdoor-group"]').forEach(r => {
      r.addEventListener('change', () => { draft.outdoorGroup = Number(r.value); dutyRenderBody(); });
    });
  } else if (step === 2) {
    document.querySelectorAll('[data-wz-exempt-id]').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.getAttribute('data-wz-exempt-id');
        draft.exemptIds = cb.checked
          ? [...new Set([...draft.exemptIds, id])]
          : draft.exemptIds.filter(x=>x!==id);
        dutyRenderWizardPreviewOnly();
      });
    });
  } else if (step === 3) {
    document.querySelectorAll('[data-wz-skip]').forEach(cb => {
      cb.addEventListener('change', () => {
        const key = cb.getAttribute('data-wz-skip');
        draft.skipDays = cb.checked
          ? [...new Set([...draft.skipDays, key])]
          : draft.skipDays.filter(x=>x!==key);
        dutyRenderWizardPreviewOnly();
      });
    });
  } else if (step === 4) {
    document.querySelectorAll('[data-wz-widx]').forEach(inp => {
      inp.addEventListener('input', () => {
        const idx = Number(inp.getAttribute('data-wz-widx')), field = inp.getAttribute('data-field');
        draft.workItems[idx][field] = field==='peoplePerSlot' ? (Number(inp.value)||1) : inp.value;
        dutyRenderWizardPreviewOnly();
      });
    });
    document.querySelectorAll('[data-wz-remove-widx]').forEach(btn => {
      btn.addEventListener('click', () => {
        draft.workItems.splice(Number(btn.getAttribute('data-wz-remove-widx')), 1);
        dutyRenderBody();
      });
    });
    document.getElementById('dt-wz-wi-add')?.addEventListener('click', () => {
      const used = new Set(draft.workItems.map(d=>d.id));
      let base = 'viecMoi', n = 2; while (used.has(base)) { base = 'viecMoi'+n; n++; }
      draft.workItems.push({ id: base, name: 'Việc mới', peoplePerSlot: 1 });
      dutyRenderBody();
    });
    document.querySelectorAll('[data-wz-owidx]').forEach(inp => {
      inp.addEventListener('input', () => {
        const idx = Number(inp.getAttribute('data-wz-owidx')), field = inp.getAttribute('data-field');
        draft.outdoorWorkItems[idx][field] = field==='peoplePerSlot' ? (Number(inp.value)||1) : inp.value;
        dutyRenderWizardPreviewOnly();
      });
    });
    document.querySelectorAll('[data-wz-remove-owidx]').forEach(btn => {
      btn.addEventListener('click', () => {
        draft.outdoorWorkItems.splice(Number(btn.getAttribute('data-wz-remove-owidx')), 1);
        dutyRenderBody();
      });
    });
    document.getElementById('dt-wz-owi-add')?.addEventListener('click', () => {
      const used = new Set(draft.outdoorWorkItems.map(d=>d.id));
      let base = 'viecSanMoi', n = 2; while (used.has(base)) { base = 'viecSanMoi'+n; n++; }
      draft.outdoorWorkItems.push({ id: base, name: 'Việc mới', peoplePerSlot: 1 });
      dutyRenderBody();
    });
    // AI note panel — Bước 4: chỉ lưu nội dung vào draft, AI chạy lúc Tạo lịch (bước 5)
    document.getElementById('dt-ai-note-input')?.addEventListener('input', (e) => {
      draft.aiNote = e.target.value;
    });
  }
}

async function dutyWizardSubmit() {
  const draft = Duty.wizardDraft;
  const isClass   = draft.activeAreas.includes('class');
  const isOutdoor = draft.activeAreas.includes('outdoor');
  if (!isClass && !isOutdoor) { dutyNotify('Chưa chọn khu vực trực.', 'error'); return; }
  if (isClass   && !draft.classGroup)   { dutyNotify('Chưa chọn Tổ cho khu vực Lớp.', 'error'); return; }
  if (isOutdoor && !draft.outdoorGroup) { dutyNotify('Chưa chọn Tổ cho khu vực Sân trường.', 'error'); return; }
  // v6 — Chỉ tính/lưu tổ cho ĐÚNG khu vực người dùng chọn ở wizard. Có thể chọn cả
  // 2 khu vực cùng lúc, mỗi khu vực 1 Tổ riêng — không còn tự suy ra tổ kế tiếp cho
  // khu vực không chọn.
  const classGroup   = isClass   ? draft.classGroup   : null;
  const outdoorGroup = isOutdoor ? draft.outdoorGroup : null;
  Duty.wizardSaving = true; dutyRenderBody();
  try {
    // Nếu có yêu cầu AI → gọi AI điều chỉnh workItems TRƯỚC khi lưu
    if ((draft.aiNote || '').trim()) {
      await dutyAiApplyNote(draft);
      // Nếu AI thất bại (aiNoteError) → vẫn tiếp tục với workItems hiện tại (không block)
    }
    const workItems        = (draft.workItems||[]).filter(it=>(it.name||'').trim());
    const outdoorWorkItems = (draft.outdoorWorkItems||[]).filter(it=>(it.name||'').trim());
    if (isClass   && !workItems.length)        throw new Error('Cần ít nhất 1 đầu việc cho Lớp.');
    if (isOutdoor && !outdoorWorkItems.length) throw new Error('Cần ít nhất 1 đầu việc cho Sân trường.');
    const exemptList = draft.exemptIds.map(id => {
      const s = (Duty.students||[]).find(x=>x.id===id);
      return { studentId: id, studentName: s?.name||'' };
    });
    // Lưu đầu việc theo khu vực được chọn
    if (isClass   && workItems.length)        await dutyApiPost('saveDutyWorkItems',        { items: workItems });
    if (isOutdoor && outdoorWorkItems.length) await dutyApiPost('saveDutyOutdoorWorkItems', { items: outdoorWorkItems });
    // Lưu tổ trực đúng khu vực đã chọn (có thể cả 2, mỗi khu vực 1 Tổ độc lập)
    if (classGroup)   await dutyApiPost('saveDutyWeekGroup',        { week: Duty.week, group: classGroup });
    if (outdoorGroup) await dutyApiPost('saveDutyOutdoorWeekGroup', { week: Duty.week, group: outdoorGroup });
    await dutyApiPost('saveDutyExempt',   { week: Duty.week, list: exemptList });
    await dutyApiPost('saveDutySkipDays', { week: Duty.week, slots: draft.skipDays });
    await dutyApiPost('generateDutyRoster', { week: Duty.week, force: true });
    if (isClass)   Duty.workItems        = workItems;
    if (isOutdoor) Duty.outdoorWorkItems = outdoorWorkItems;
    Duty.skipDays = draft.skipDays; Duty.skipDaysLoaded = true;
    const areaLabel = [
      isClass   ? `Lớp (Tổ ${classGroup})` : '',
      isOutdoor ? `Sân trường (Tổ ${outdoorGroup})` : '',
    ].filter(Boolean).join(' + ');
    Duty.wizardOpen = false; Duty.wizardDraft = null;
    Duty.activeTab = 'today';
    Duty.classLoaded = false;
    await dutyLoadClass();
    dutyNotify(`Đã tạo lịch trực tuần ${Duty.week} — ${areaLabel}`, 'success');
  } catch(err) {
    dutyNotify('Không tạo được lịch: ' + (err?.message||err), 'error');
  } finally {
    Duty.wizardSaving = false;
    dutyRenderRoot();
  }
}

/* ═══════════════════════════════════════════════════════════

   TAB 3 — BÁO CÁO
   ═══════════════════════════════════════════════════════════ */

function dutyRenderReport() {
  const body = document.getElementById('da-body');
  if (!body) return;
  if (!Duty.report && !Duty.reportLoading) { dutyLoadReport(Duty.reportFrom, Duty.reportTo); return; }
  if (Duty.reportLoading) { body.innerHTML = `<div class="da-loading">Đang tải báo cáo…</div>`; return; }
  if (Duty.reportError)   { body.innerHTML = `<div class="da-error">${dutyEscape(Duty.reportError)}</div>`; return; }
  const weeks = (Duty.report?.weeks) || [];
  const debts  = (Duty.report?.debts) || [];
  const owingCount = debts.filter(d=>(d.owedSlots||0)>0).length;
  const owingTotalSlots = debts.reduce((sum,d)=>sum+(d.owedSlots||0),0);
  const withRate = weeks.map(w => ({
    ...w,
    rate: w.totalWorkItems ? Math.round((w.completed/w.totalWorkItems)*100) : 0,
  }));
  const avgRate = withRate.length
    ? Math.round(withRate.reduce((s,w)=>s+w.rate,0) / withRate.length)
    : 0;
  const bestWeek  = withRate.length ? withRate.reduce((a,b)=> b.rate>a.rate?b:a) : null;
  const worstWeek = withRate.length ? withRate.reduce((a,b)=> b.rate<a.rate?b:a) : null;
  const totalManual = withRate.reduce((s,w)=>s+(Number(w.manualModeItems)||0),0);
  const rows = withRate.length ? withRate.map(w => {
    const rateClass = w.rate===100?'good':w.rate>=60?'warn':'bad';
    return `<tr><td>Tuần ${w.week}</td><td>${w.completed}/${w.totalWorkItems}</td><td><span class="dr-rate ${rateClass}">${w.rate}%</span></td><td>${w.manualModeItems}</td></tr>`;
  }).join('') : `<tr><td colspan="4"><div class="da-empty">Chưa có dữ liệu.</div></td></tr>`;
  const summaryCards = `<div class="dr-cards">
    <div class="dr-card">
      <div class="dr-card-label">Tỷ lệ hoàn thành TB</div>
      <div class="dr-card-value ${avgRate===100?'good':avgRate>=60?'warn':'bad'}">${avgRate}%</div>
      <div class="dr-card-sub">${withRate.length} tuần được thống kê</div>
    </div>
    <div class="dr-card">
      <div class="dr-card-label">Học sinh đang nợ trực</div>
      <div class="dr-card-value ${owingCount?'bad':'good'}">${owingCount}</div>
      <div class="dr-card-sub">${owingTotalSlots} lượt cần trả</div>
    </div>
    <div class="dr-card">
      <div class="dr-card-label">Tuần tốt nhất</div>
      <div class="dr-card-value good">${bestWeek?bestWeek.rate+'%':'—'}</div>
      <div class="dr-card-sub">${bestWeek?'Tuần '+bestWeek.week:'Chưa có dữ liệu'}</div>
    </div>
    <div class="dr-card">
      <div class="dr-card-label">Đầu việc phải sửa tay</div>
      <div class="dr-card-value ${totalManual?'warn':'good'}">${totalManual}</div>
      <div class="dr-card-sub">Ghi đè thủ công (nợ / đổi ca)</div>
    </div>
  </div>`;
  const chart = withRate.length ? dutyBuildReportChart(withRate) : '';
  body.innerHTML = `<div class="dr-layout">
    <div class="dr-toolbar">
      <label>Từ tuần <input type="number" min="1" id="dr-from" value="${Duty.reportFrom||''}" placeholder="1" /></label>
      <label>Đến tuần <input type="number" min="1" id="dr-to" value="${Duty.reportTo||''}" placeholder="${Duty.week}" /></label>
      <button class="da-btn primary" id="dr-apply">Xem báo cáo</button>
    </div>
    ${summaryCards}
    ${owingCount ? `<div class="dr-summary">Hiện có <strong>${owingCount}</strong> học sinh đang nợ lượt trực — chi tiết xem ở tab <strong>Quản lý → Sổ nợ</strong>.</div>` : ''}
    ${chart}
    <div class="dr-table-wrap">
      <table class="dr-table">
        <thead><tr><th>Tuần</th><th>Đầu việc hoàn thành</th><th>Tỷ lệ</th><th>Ưu tiên trả nợ</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
  document.getElementById('dr-apply')?.addEventListener('click', () => {
    const from = Number(document.getElementById('dr-from').value)||null;
    const to   = Number(document.getElementById('dr-to').value)||null;
    Duty.reportFrom = from; Duty.reportTo = to;
    dutyLoadReport(from, to);
  });

}

function dutyBuildReportChart(withRate) {
  const barW = 34, gap = 14, chartH = 130;
  const bars = withRate.map((w, i) => {
    const h = Math.max(3, Math.round((w.rate/100) * chartH));
    const cls = w.rate===100?'good':w.rate>=60?'warn':'bad';
    const x = i * (barW+gap);
    return `<g transform="translate(${x},0)">
      <rect x="0" y="${chartH-h}" width="${barW}" height="${h}" rx="6" class="dr-bar ${cls}"></rect>
      <text x="${barW/2}" y="${chartH-h-8}" text-anchor="middle" class="dr-bar-val">${w.rate}%</text>
      <text x="${barW/2}" y="${chartH+18}" text-anchor="middle" class="dr-bar-label">T${w.week}</text>
    </g>`;
  }).join('');
  const width = withRate.length * (barW+gap);
  return `<div class="dr-chart-wrap">
    <div class="dr-chart-title">Tỷ lệ hoàn thành theo tuần</div>
    <div class="dr-chart-scroll">
      <svg viewBox="0 0 ${width} ${chartH+34}" width="${width}" height="${chartH+34}" class="dr-chart">${bars}</svg>
    </div>
  </div>`;
}

async function dutyLoadReport(fromWeek, toWeek) {
  Duty.reportLoading = true; Duty.reportError = ''; dutyRenderBody();
  try {
    Duty.report = await dutyApiGet('getDutyReport', { fromWeek, toWeek });
  } catch(err) { Duty.reportError = 'Không tải được báo cáo: ' + (err?.message||err); }
  finally { Duty.reportLoading = false; dutyRenderBody(); }
}

/* ═══════════════════════════════════════════════════════════

   PRINT
   ═══════════════════════════════════════════════════════════ */

function dutyBuildPrintTable(rows, items) {
  const body = rows.map(row => `<tr>
    <td>${dutyEscape(row.day)} — ${row.slot==='sang'?'Sáng':'Chiều'}</td>
    ${items.map(it => {
      const cell = row.items.find(x=>x.workItemId===it.id);
      return `<td>${dutyEscape((cell?.assignedStudents||[]).map(s=>s.name).join(', '))||'—'}</td>`;
    }).join('')}
  </tr>`).join('');
  return `<table>
    <thead><tr><th>Buổi</th>${items.map(it=>`<th>${dutyEscape(it.name)}</th>`).join('')}</tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function dutyBuildPrint() {
  const sheet = document.getElementById('da-print-sheet');
  if (!sheet) return;
  const classTable = dutyBuildPrintTable(Duty.classSlots || [], Duty.workItems || []);
  const outdoorRows = Duty.outdoorSlots || [];
  const outdoorSection = outdoorRows.length ? `
    <h2>LỊCH TRỰC SÂN TRƯỜNG — TUẦN ${Duty.week}${Duty.outdoorGroup?' — TỔ '+dutyEscape(String(Duty.outdoorGroup)):''}</h2>
    ${dutyBuildPrintTable(outdoorRows, Duty.outdoorWorkItems || [])}` : '';
  sheet.innerHTML = `<h2>LỊCH TRỰC LỚP — TUẦN ${Duty.week}${Duty.weekGroup?' — TỔ '+dutyEscape(String(Duty.weekGroup)):''}</h2>
    ${classTable}
    ${outdoorSection}`;
}

/* ═══════════════════════════════════════════════════════════

   BOOT
   ═══════════════════════════════════════════════════════════ */

(async function bootDuty() {
  // Hiển thị tạm ngay (đoán từ lần chọn gần nhất) để tránh màn hình trắng khi chờ mạng.
  Duty.week = dutyCurrentWeekGuess();
  dutyRenderRoot();
  // Sau đó tải bảng weeks và chốt lại đúng tuần đang hoạt động (theo start_date/end_date).
  await dutyLoadWeeksList();
  const activeWeek = dutyPickActiveWeek(Duty.weeksList);
  if (activeWeek !== Duty.week) {
    Duty.week = activeWeek;
    Duty.classLoaded = false; Duty.classSlots = []; Duty.weekGroup = null; Duty.exemptList = [];
    Duty.outdoorSlots = []; Duty.outdoorGroup = null; Duty.report = null;
  }
  try { localStorage.setItem('a3k64-current-week', String(Duty.week)); } catch {}
  dutyRenderRoot();
})();
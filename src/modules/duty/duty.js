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

  else if (type === 'error') alert(msg);

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



async function dutyApiPost(action, payload) {

  const gasUrl = getDutyGasUrl();

  if (!gasUrl) throw new Error('Chưa cấu hình GAS URL (config.js).');

  if (DUTY_DEBUG) console.log(`[duty→POST] ${action}`, payload);

  let res;

  try {

    res = await fetch(gasUrl, {

      method: 'POST',

      headers: { 'Content-Type': 'text/plain;charset=utf-8' },

      body: JSON.stringify({ action, ...(payload||{}) }),

    });

  } catch(err) { throw new Error(`Không kết nối được máy chủ cho "${action}".`); }

  let json;

  try { json = await res.json(); }

  catch { throw new Error(`Server trả về dữ liệu không hợp lệ cho "${action}" (HTTP ${res.status}).`); }

  if (DUTY_DEBUG) console.log(`[duty←POST] ${action}`, json);

  if (json?.ok === false) throw new Error(json.error || 'Backend từ chối yêu cầu.');

  return json.data;

}



/* ── Hằng số ── */

const DUTY_DAYS = ['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'];

const SLOT_LABEL = { sang: 'Sáng', chieu: 'Chiều' };



/* ── Lấy tuần hiện tại ── */

function dutyCurrentWeekGuess() {

  try {

    const stored = Number(localStorage.getItem('a3k64-current-week'));

    if (stored > 0) return stored;

  } catch {}

  return 1;

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



/* ── Checklist cấu hình theo đúng pipeline 3 tầng ── */

function dutySetupChecklist() {

  const hasMaster = (Duty.studentsLoaded && (Duty.students||[]).length > 0)

                  && (Duty.workItemsLoaded && (Duty.workItems||[]).length > 0);

  const hasOverrideChecked = Duty.overridesLoaded; // đã xem qua bước override (có thể không cần ghi đè gì)

  const hasGroupChosen = !!(Duty.weekConfigDraft?.group);

  const hasExemptChecked = !!Duty.weekConfigDraft; // đã mở panel xung kích ít nhất 1 lần



  const steps = [

    { label: 'Tầng 1 — Danh sách lớp & Đầu việc', done: hasMaster,

      hint: !Duty.studentsLoaded || !(Duty.students||[]).length ? 'Chưa có danh sách học sinh' : (!(Duty.workItems||[]).length ? 'Chưa cấu hình đầu việc' : '') },

    { label: 'Tầng 2 — Ghi đè theo ngày/tuần (nếu có ca đột xuất)', done: hasOverrideChecked,

      hint: 'Bỏ qua nếu tuần này không có gì đột xuất' },

    { label: 'Tầng 2 — Chốt Tổ/Đội phụ trách tuần', done: hasGroupChosen, hint: '' },

    { label: 'Tầng 3 — Lọc xung kích/miễn trừ', done: hasExemptChecked, hint: '' },

    { label: 'Bấm "Tạo lịch"', done: false, hint: '' },

  ];



  return `<div class="dt-setup-checklist">${steps.map((s,i) => `

    <div class="dt-setup-step ${s.done?'done':''}">

      <span class="dt-setup-icon">${s.done?'✓':i+1}</span>

      <div class="dt-setup-text">

        <div class="dt-setup-label">${dutyEscape(s.label)}</div>

        ${s.hint ? `<div class="dt-setup-hint">${dutyEscape(s.hint)}</div>` : ''}

      </div>

    </div>`).join('')}</div>`;

}



/* ── State ── */

const Duty = {

  week: 1,

  activeTab: 'today', // 'today' | 'week' | 'manage' | 'report'



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

            <button class="da-icon-btn" id="da-prev-week" title="Tuần trước">‹</button>

            <span>Tuần ${Duty.week}</span>

            <button class="da-icon-btn" id="da-next-week" title="Tuần sau">›</button>

          </div>

          <button class="da-icon-btn" id="da-print-btn" title="In bản gọn" style="font-size:17px;">🖨</button>

        </div>

      </div>



      <div class="da-tabs">

        <button class="da-tab ${Duty.activeTab==='today'  ? 'active':''}" data-tab="today">Hôm nay</button>

        <button class="da-tab ${Duty.activeTab==='week'   ? 'active':''}" data-tab="week">Tuần này</button>

        <button class="da-tab ${Duty.activeTab==='manage' ? 'active':''}" data-tab="manage">Quản lý${debtBadge}</button>

        <button class="da-tab ${Duty.activeTab==='report' ? 'active':''}" data-tab="report">Báo cáo</button>

      </div>



      <div class="da-body" id="da-body"></div>

    </div>



    <div class="da-print-sheet" id="da-print-sheet"></div>

  `;



  document.getElementById('da-prev-week').onclick = () => dutyChangeWeek(-1);

  document.getElementById('da-next-week').onclick = () => dutyChangeWeek(1);

  document.getElementById('da-print-btn').onclick = () => { dutyBuildPrint(); window.print(); };



  root.querySelectorAll('.da-tab').forEach(btn => {

    btn.onclick = () => { Duty.activeTab = btn.dataset.tab; dutyRenderRoot(); };

  });



  // Click ra ngoài → đóng kebab menu

  document.addEventListener('click', dutyCloseKebabOutside, { once: true });



  dutyRenderBody();

}



function dutyRenderBody() {

  const body = document.getElementById('da-body');

  if (!body) return;

  try {

    switch (Duty.activeTab) {

      case 'today':  dutyRenderToday();  break;

      case 'week':   dutyRenderWeek();   break;

      case 'manage': dutyRenderManage(); break;

      case 'report': dutyRenderReport(); break;

    }

  } catch(err) {

    console.error('[duty] Lỗi render:', err);

    body.innerHTML = `<div class="da-error">Lỗi hiển thị: ${dutyEscape(err?.message||err)}<br><small>F12 → Console để xem chi tiết.</small></div>`;

  }

}



function dutyChangeWeek(delta) {

  Duty.week = Math.max(1, Duty.week + delta);

  Duty.classLoaded = false; Duty.classSlots = []; Duty.weekGroup = null; Duty.exemptList = [];

  Duty.outdoorSlots = []; Duty.outdoorGroup = null;

  Duty.report = null;

  Duty.editingCell = null; Duty.openKebab = null;

  dutyRenderRoot();

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

      <p style="margin:8px 0 12px;font-size:13px;color:var(--text-3);">Cần cấu hình theo đúng thứ tự trước khi bấm "Tạo lịch":</p>

      ${dutySetupChecklist()}

      ${canEdit ? `<button class="da-btn primary" id="da-goto-setup" style="margin-top:12px;">Đi tới cấu hình</button>` : ''}

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



  body.innerHTML = `<div class="dt-today">${heroHtml}${sessionsHtml}${outdoorHeroHtml}${outdoorSessionsHtml}</div>`;



  document.getElementById('da-goto-setup')?.addEventListener('click', () => {

    Duty.activeTab = 'manage';

    // Mở đúng accordion còn thiếu đầu tiên theo pipeline

    if (!(Duty.workItems||[]).length) { Duty.workItemsConfigOpen = true; }

    else if (!Duty.overridesLoaded) { Duty.overrideOpen = true; }

    else { Duty.weekConfigOpen = true; }

    dutyRenderRoot();

  });



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

    const rowIndex = cell.rowIndex;

    const isEditing = Duty.editingCell?.rowIndex === rowIndex && Duty.editingCell?.workItemId === itemDef.id;

    const exempted = (cell.exemptedStudents || []);



    const peopleHtml = (cell.assignedStudents || []).length

      ? (cell.assignedStudents || []).map(s => {

          const penaltyTag = s.penalty === 'bo'

            ? `<span class="dt-penalty-tag bo">Bỏ trực</span>`

            : s.penalty === 'muon'

              ? `<span class="dt-penalty-tag muon">Muộn</span>`

              : '';

          const debtTag = s.owedSlots > 0 ? `<span class="dt-debt-tag">⚠ Nợ ${s.owedSlots}</span>` : '';

          const pClass = s.penalty ? 'penalised' : '';

          const menuKey = `${rowIndex}|${s.id}`;

          const isOpen = Duty.openKebab === menuKey;

          const kebabMenu = !canEdit ? '' : `

            <div class="dt-task-actions">

              <button class="dt-kebab-btn" data-kebab="${menuKey}" title="Tuỳ chọn">⋯</button>

              ${isOpen ? `<div class="dt-kebab-menu" data-kebab-menu="${menuKey}">

                ${!s.penalty ? `

                  <button data-mark="${rowIndex}|${s.id}|muon">Đánh dấu đến muộn (+1)</button>

                  <button data-mark="${rowIndex}|${s.id}|bo">Đánh dấu bỏ trực (+2)</button>

                ` : `

                  <button data-unmark="${rowIndex}|${s.id}">↺ Bỏ đánh dấu vi phạm</button>

                `}

              </div>` : ''}

            </div>`;

          return `<div class="dt-person">

            <span class="dt-person-name ${pClass}">${dutyEscape(s.name)}${s.fromDebt?`<small style="font-size:9.5px;color:var(--warn);margin-left:4px;">trả nợ</small>`:''}</span>

            ${debtTag}${penaltyTag}${kebabMenu}

          </div>`;

        }).join('')

      : `<div class="dt-person"><span style="font-size:12px;color:var(--text-3);font-style:italic;">Chưa phân công</span></div>`;



    const editForm = isEditing ? dutyRenderCellEditForm(rows[0], cell, itemDef) : '';



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

      ${editForm}`;

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



  return `<div class="dt-edit-form" id="dt-edit-${cell.rowIndex}-${itemDef.id}">

    <div style="font-size:11.5px;font-weight:700;color:var(--text-3);">Phân công lại — ${dutyEscape(itemDef.name)} (Tổ ${dutyEscape(String(row.group))})</div>

    <div class="dt-check-list">${checks}</div>

    <div class="dt-edit-form-row">

      <input type="text" id="dt-note-${cell.rowIndex}" value="${dutyEscape(cell.note||'')}" placeholder="Ghi chú (không bắt buộc)" style="flex:1;font-family:inherit;font-size:12.5px;color:var(--text);background:var(--input-bg);border:1px solid var(--border);border-radius:8px;padding:6px 9px;" />

    </div>

    <div class="dt-form-actions">

      <button class="da-btn sm" data-cancel-edit="${cell.rowIndex}|${itemDef.id}">Huỷ</button>

      <button class="da-btn sm primary" data-save-edit="${cell.rowIndex}|${itemDef.id}">Lưu</button>

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

      const rowIndex = Number(btn.dataset.toggleDone);

      // Tìm cell tương ứng — có thể ở lớp hoặc sân trường

      const slot = Duty.classSlots.flatMap(r => r.items).find(it => it.rowIndex === rowIndex)

        || Duty.outdoorSlots.flatMap(r => r.items).find(it => it.rowIndex === rowIndex);

      if (!slot) return;

      const next = dutyIsDone(slot.status) ? 'Chưa hoàn thành' : 'Hoàn thành';

      try {

        await dutyApiPost('saveDutyOverride', { rowIndex, status: next });

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

      const key = { rowIndex: Number(ri), workItemId: wid };

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

      const rowIndex = Number(ri);

      const formEl = document.getElementById(`dt-edit-${ri}-${wid}`);

      if (!formEl) return;

      const assignedStudents = Array.from(formEl.querySelectorAll('input.edit-check:checked'))

        .map(cb => ({ id: cb.value, name: cb.dataset.name }));

      const noteEl = document.getElementById(`dt-note-${ri}`);

      try {

        await dutyApiPost('saveDutyOverride', {

          rowIndex, assignedStudents, note: noteEl ? noteEl.value.trim() : undefined,

        });

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

      const [rowIndex, studentId, kind] = btn.dataset.mark.split('|');

      Duty.openKebab = null;

      try {

        await dutyApiPost('markDutyAssignmentPenalty', { rowIndex: Number(rowIndex), studentId, kind });

        await dutyLoadClass();

        dutyNotify(kind==='bo' ? 'Đã đánh dấu bỏ trực (+2 lượt nợ)' : 'Đã đánh dấu đến muộn (+1 lượt nợ)', 'success');

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

        await dutyApiPost('unmarkDutyAssignmentPenalty', { rowIndex: Number(rowIndex), studentId });

        await dutyLoadClass();

        dutyNotify('Đã bỏ đánh dấu. Lượt nợ đã cộng trước đó không tự hoàn — sửa ở tab Quản lý → Sổ nợ.', 'success');

      } catch(err) { dutyNotify('Không bỏ đánh dấu được: ' + (err?.message||err), 'error'); }

    };

  });

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

    document.getElementById('dw-goto-setup')?.addEventListener('click', () => {

      Duty.activeTab = 'manage'; Duty.weekConfigOpen = true; dutyRenderRoot();

    });

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

        `<div class="dw-name ${s.penalty?'penalised':''}">${dutyEscape(s.name)}${s.penalty==='bo'?` <span class="dt-penalty-tag bo" style="font-size:9.5px;">Bỏ</span>`:s.penalty==='muon'?` <span class="dt-penalty-tag muon" style="font-size:9.5px;">Muộn</span>`:''}</div>`

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



  /* ── 1. Sổ nợ (model cặp: A nợ B, FIFO) ── */

  // Mỗi bản ghi: { id, nguoiNoId, nguoiNoName, nguoiChoNoId, nguoiChoNoName, ngayPhatSinh, group }

  const pairedDebts = (Duty.debts || []).slice().sort((a,b) => new Date(a.ngayPhatSinh) - new Date(b.ngayPhatSinh)); // FIFO: nợ lâu nhất lên đầu

  html += `

    <div>

      <div class="dm-section-head">

        <span class="dm-section-title">Sổ nợ trực (swap 1-1)</span>

        ${canEdit ? `<button class="da-btn sm primary" id="dm-penalty-toggle">${Duty.penaltyFormOpen?'Đóng':'+ Ghi nợ mới'}</button>` : ''}

      </div>`;



  if (Duty.debtsLoading) { html += `<div class="da-loading" style="padding:16px;">Đang tải sổ nợ…</div>`; }

  else if (Duty.debtsError) { html += `<div class="da-error" style="padding:16px;">${dutyEscape(Duty.debtsError)}</div>`; }

  else if (Duty.penaltyFormOpen && canEdit) { html += dutyRenderPenaltyForm(); }

  else if (!pairedDebts.length) { html += `<div class="da-empty">Không ai đang nợ lượt trực.</div>`; }

  else {

    html += `<div class="dm-debt-list">` + pairedDebts.map((d, idx) => `

      <div class="dm-debt-row">

        <div class="dm-debt-info">

          <div class="dm-debt-name">${dutyEscape(d.nguoiNoName)} <span style="color:var(--text-3);font-weight:500;">nợ</span> ${dutyEscape(d.nguoiChoNoName)}</div>

          <div class="dm-debt-meta">

            <span class="da-badge ${idx===0?'warn':'accent'}">${idx===0?'FIFO — trả trước':'Chờ'}</span>

            <span style="margin-left:6px;">Từ ${dutyEscape(d.ngayPhatSinh)}</span>

          </div>

        </div>

        ${canEdit ? `<button class="da-btn sm danger" data-clear-debt="${dutyEscape(d.id)}" data-clear-name="${dutyEscape(d.nguoiNoName)}">Xoá nợ (đã tự trả)</button>` : ''}

      </div>

    `).join('') + `</div>`;

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

        ${dutyRenderAccordion('override-config', 'Ghi đè theo ngày/tuần', `${(Duty.overrides||[]).length} ghi đè`, Duty.overrideOpen, Duty.overrideOpen ? dutyRenderOverridePanel() : '')}

        ${dutyRenderAccordion('week-config', 'Khởi tạo lịch tuần', 'Tổ trực · Xung kích', Duty.weekConfigOpen, Duty.weekConfigOpen ? dutyRenderWeekConfigPanel() : '')}

        ${dutyRenderAccordion('workitems-config', 'Cấu hình đầu việc (lớp)', `${(Duty.workItems||[]).length} việc`, Duty.workItemsConfigOpen, Duty.workItemsConfigOpen ? dutyRenderWorkItemsPanel() : '')}

        ${dutyRenderAccordion('outdoor-workitems-config', 'Cấu hình đầu việc sân trường', `${(Duty.outdoorWorkItems||[]).length} việc`, Duty.outdoorWorkItemsConfigOpen, Duty.outdoorWorkItemsConfigOpen ? dutyRenderOutdoorWorkItemsPanel() : '')}

        ${dutyRenderAccordion('parking-config', 'Nhà xe cố định', '2 người cả năm', Duty.parkingConfigOpen, Duty.parkingConfigOpen ? dutyRenderParkingPanel() : '')}

        ${dutyRenderAccordion('rules-panel', 'Quy tắc & Mức phạt', `${(Duty.rules||[]).length} quy tắc`, Duty.rulesOpen, Duty.rulesOpen ? dutyRenderRulesPanel() : '')}

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

    ${groups.length > 1 ? `<div class="da-badge accent" style="width:fit-content;">🏫 Tổ SÂN TRƯỜNG tuần này (tự động) = Tổ ${dutyEscape(String(groups[(groups.indexOf(draft.group)+1) % groups.length]))}</div>` : ''}

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



  /* Accordion toggles */

  body.querySelectorAll('[data-accordion]').forEach(btn => {

    btn.addEventListener('click', () => {

      const id = btn.dataset.accordion;

      if (id === 'week-config') {

        Duty.weekConfigOpen = !Duty.weekConfigOpen; Duty.weekConfigDraft = null;

        if (Duty.weekConfigOpen) dutyLoadStudents().then(() => dutyRenderBody()); else dutyRenderBody();

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

      Duty.ruleForm = JSON.parse(btn.dataset.editRule);

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



  const rows = weeks.length ? weeks.map(w => {

    const rate = w.totalWorkItems ? Math.round((w.completed/w.totalWorkItems)*100) : 0;

    const rateClass = rate===100?'good':rate>=60?'warn':'bad';

    return `<tr><td>Tuần ${w.week}</td><td>${w.completed}/${w.totalWorkItems}</td><td><span class="dr-rate ${rateClass}">${rate}%</span></td><td>${w.manualModeItems}</td></tr>`;

  }).join('') : `<tr><td colspan="4"><div class="da-empty">Chưa có dữ liệu.</div></td></tr>`;



  body.innerHTML = `<div class="dr-layout">

    <div class="dr-toolbar">

      <label>Từ tuần <input type="number" min="1" id="dr-from" value="${Duty.reportFrom||''}" placeholder="1" /></label>

      <label>Đến tuần <input type="number" min="1" id="dr-to" value="${Duty.reportTo||''}" placeholder="${Duty.week}" /></label>

      <button class="da-btn primary" id="dr-apply">Xem báo cáo</button>

    </div>

    ${owingCount ? `<div class="dr-summary">Hiện có <strong>${owingCount}</strong> học sinh đang nợ lượt trực — chi tiết xem ở tab <strong>Quản lý → Sổ nợ</strong>.</div>` : ''}

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

(function bootDuty() {

  Duty.week = dutyCurrentWeekGuess();

  dutyRenderRoot();

})();
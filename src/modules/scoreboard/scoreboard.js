/* ============================================================
   A3K64 — Scoreboard App (vanilla JS port)
   ============================================================ */

/* ---- Types / Constants ---- */
const STORAGE_KEY      = 'scoreboard-local-events-v1';
const WEEK_STORAGE_KEY = 'scoreboard-local-weeks-v1';
const SESSION_KEY      = 'a3k64-login-session-v1';
const PINNED_RULES_KEY = 'a3k64-pinned-vi-pham-rules';
const GROUP_ORDER_KEY  = 'a3k64-overview-group-order-v2';
const FULL_ACCESS_ROLES = ['gvcn','lop_truong','bi_thu'];
const WEEK_CREATORS    = ['to_truong','gvcn','lop_truong','bi_thu'];
const LIVE_REFRESH_MS  = 7000;
const FRESH_EVENT_MARGIN_MS = 2500;
const SAVE_GUARD_MS    = 45000;

const SCORE_WEEKS = [1];
const subjects = ['Toán','Vật Lí','Hoá Học','Sinh Học','Tin Học','Ngữ Văn','Lịch Sử','Tiếng Anh','Quốc Phòng','Thể Dục','GDĐP','TNHN','Chào Cờ','SHL'];
const days = [
  { key: 2, label: 'T2', full: 'Thứ 2' },
  { key: 3, label: 'T3', full: 'Thứ 3' },
  { key: 4, label: 'T4', full: 'Thứ 4' },
  { key: 5, label: 'T5', full: 'Thứ 5' },
  { key: 6, label: 'T6', full: 'Thứ 6' },
  { key: 7, label: 'T7', full: 'Thứ 7' },
  { key: 0, label: 'CN', full: 'Chủ nhật' },
];

/* ---- Mock data (mirrors mockScoreData.ts) ---- */
const mockStudents = [
  { id:'s01', name:'Nguyễn Thị Hằng',  group:1 },
  { id:'s02', name:'Nguyễn Minh Thiện', group:1 },
  { id:'s03', name:'Nguyễn Ngọc Hiếu',  group:3 },
  { id:'s04', name:'Đinh Mạnh Hữu',     group:3, role:'Lớp trưởng' },
].map(s => ({ ...s, avatarInitial: lastNameInitial(s.name) }));

const mockScoreEvents = [];

/* ---- State ---- */
let state = {
  students: [],
  events: [],
  weeks: readLocalWeeks(),
  week: 1,
  weekSettings: [],
  activeTab: 'overview',        // 'overview' | 'scoring'
  viewMode: 'overview',         // 'overview' | 'students'
  groupFilter: [],              // string[]  '1'|'2'|'3'|'4'
  statusFilter: 'all',
  sortMode: 'score-desc',
  dataSource: 'loading',        // 'loading'|'gas'|'local'|'error'
  syncMessage: '',
  editingStudentId: null,
  createWeekConfirmOpen: false,
  isCreatingWeek: false,
  liveToasts: [],
  groupOrder: readGroupOrder(),
  // modal state
  modal: {
    activeDay: 2,
    section: 'add',             // 'add' | 'review'
    subject: subjects[0],
    category: 'HOC_TAP',
    specialTitle: '',
    specialPoint: '',
    violationCount: 1,
    ruleSearch: '',
    ruleDropdownOpen: false,
    rules: [],
    pinnedRuleKeys: readPinnedRuleKeys(),
    rulesStatus: 'Đang đọc VI_PHAM...',
    draftEvents: [],
    deletedEventIds: [],
    bulkScope: 'single',
    selectedStudentIds: [],
    bulkNote: '',
    isSaving: false,
  },
};

let userRole = 'hoc_sinh';
let userGroup = null;
let gasUrl = null;
let liveTimer = null;
let seenSignatures = new Set();
let liveStartedAt = Date.now();
let pollingActive = false;
let savingActive  = false;
let pendingSaveGuard = null;
let cachedRules = null;

/* ============================================================
   PURE HELPERS
   ============================================================ */
function lastNameInitial(name) {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length-1]?.[0] || name[0] || '?').toUpperCase();
}
function givenName(fullName) {
  const p = fullName.trim().split(/\s+/);
  return p[p.length-1] || fullName;
}
function normalizeRole(r) { return String(r||'hoc_sinh').trim().toLowerCase(); }
function parseGroup(v) {
  const n = Number(String(v??'').replace(/[^0-9]/g,''));
  return (n>=1&&n<=4) ? n : null;
}
function readLocalWeeks() {
  try { const s=localStorage.getItem(WEEK_STORAGE_KEY); const w=s?JSON.parse(s):SCORE_WEEKS; return w.length?w:SCORE_WEEKS; } catch { return SCORE_WEEKS; }
}
function readGroupOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem(GROUP_ORDER_KEY)||'null');
    return normalizeOrder(saved || [1,2,3,4]);
  } catch { return [1,2,3,4]; }
}
function normalizeOrder(order) {
  const valid = order.filter((g,i,l)=>[1,2,3,4].includes(g)&&l.indexOf(g)===i);
  return [...valid,...[1,2,3,4].filter(g=>!valid.includes(g))];
}
function readPinnedRuleKeys() {
  try { const s=JSON.parse(localStorage.getItem(PINNED_RULES_KEY)||'[]'); return Array.isArray(s)?s.filter(x=>typeof x==='string'):[]; } catch { return []; }
}
function readSavedSessionUser() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')?.user||null; } catch { return null; }
}
function readSavedUserGroup() {
  const u=readSavedSessionUser();
  return parseGroup(u?.group)||parseGroup(u?.to);
}
function readSavedUserName() {
  const u=readSavedSessionUser();
  return String(u?.displayName||u?.hoten||u?.name||'').trim();
}
function eventSignature(ev) {
  return [ev.studentId,ev.week,ev.title,ev.points,ev.type,ev.category,ev.note||'',ev.createdBy||''].join('|');
}
function scoreContentSig(ev) {
  return [ev.studentId,ev.week,ev.title,ev.points,ev.type,ev.category,ev.note||''].join('|');
}
function eventTime(ev) { const t=Date.parse(ev.createdAt||''); return isFinite(t)?t:0; }
function formatScore(p) { return p>0?`+${p}`:String(p); }
function categoryLabel(c) {
  if(c==='HOC_TAP') return 'Học tập';
  if(c==='NE_NEP') return 'Nề nếp';
  return 'Phong trào';
}
function getScoreStatus(total) {
  if(total>=50) return 'Tốt';
  if(total>=0)  return 'Khá';
  if(total>=-50) return 'Đạt';
  return 'Chưa đạt';
}
function statusClass(s) { return s.toLowerCase().replace(/\s+/g,'-'); }
function statusTone(s) {
  const l=s.toLowerCase();
  if(l.includes('tốt')) return 'good';
  if(l.includes('khá')) return 'warning';
  if(l.includes('đạt')&&!l.includes('chưa')) return 'orange';
  return 'danger';
}
function isSheetTotalEvent(ev) { return String(ev.note||'').includes('__SHEET_TOTAL__'); }
function parseDay(title) {
  const t=title.toLowerCase();
  const m=t.match(/thứ\s*([2-7])/i);
  if(m) return Number(m[1]);
  return t.includes('chủ nhật')?0:null;
}
function eventDay(ev) { return parseDay(ev.title)??new Date(ev.createdAt).getDay(); }
function ruleKey(rule) { return `${rule.title}::${rule.points}::${rule.category}`; }
function shortTitle(t) { return t.length>30?`${t.slice(0,30)}...`:t; }
function cleanTitleFromEvent(t) { return t.replace(/^Thứ\s*[2-7]:\s*/i,'').replace(/^Chủ nhật:\s*/i,''); }
function normalizeVi(v) {
  return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d').replace(/Đ/g,'D').replace(/\s+/g,' ').trim().toLowerCase();
}
function compareByGivenName(a,b) {
  const g=givenName(a.name).localeCompare(givenName(b.name),'vi',{sensitivity:'base'});
  return g||a.name.localeCompare(b.name,'vi',{sensitivity:'base'});
}
function matchesGroups(group, selectedGroups) {
  return !selectedGroups.length || selectedGroups.includes(String(group));
}
function formatSavedTitle(day,category,subject,title,points) {
  const dl=days.find(d=>d.key===day)?.full||'Không rõ ngày';
  const ct=categoryLabel(category);
  const sp=category==='HOC_TAP'?`: [${subject}]`:'';
  return `${dl}: [${ct}]${sp} ${title} (${formatScore(points)})`;
}
function newEventDateForDay(day) {
  const now=new Date();
  now.setDate(now.getDate()+(day-now.getDay()));
  now.setHours(12,0,0,0);
  return now.toISOString();
}
function makeDraftEvent(partial) {
  return { ...partial, id:`draft-${Date.now()}-${Math.random().toString(36).slice(2)}` };
}

/* ============================================================
   SUMMARIZE / STATS
   ============================================================ */
function summarizeStudents(students, events, week) {
  const summaries = students.map(student => {
    const se = events.filter(e=>e.studentId===student.id&&e.week===week);
    const visible = se.filter(e=>!isSheetTotalEvent(e));
    const total = se.reduce((s,e)=>s+e.points,0);
    const positive = visible.filter(e=>e.points>0).reduce((s,e)=>s+e.points,0);
    const negative = visible.filter(e=>e.points<0).reduce((s,e)=>s+e.points,0);
    return { ...student, total, positive, negative, rank:0, status:getScoreStatus(total), events:visible };
  });
  const sorted=[...summaries].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'vi'));
  let curRank=0, prevTotal=null;
  const rankMap=new Map();
  sorted.forEach((s,i)=>{
    if(prevTotal===null||s.total!==prevTotal){ curRank=i+1; prevTotal=s.total; }
    rankMap.set(s.id,curRank);
  });
  return summaries.map(s=>({ ...s, rank:rankMap.get(s.id)||0 }));
}

function getGroupStats(summaries) {
  return [1,2,3,4].map(group=>{
    const members=summaries.filter(s=>s.group===group);
    const total=members.reduce((s,m)=>s+m.total,0);
    const average=members.length?Math.round(total/members.length):0;
    const good=members.filter(m=>m.status==='Tốt'||m.status==='Khá').length;
    const warning=members.filter(m=>m.status==='Chưa đạt').length;
    return { group, label:`Tổ ${group}`, total, average, good, warning, members };
  });
}

/* ============================================================
   DERIVED STATE
   ============================================================ */
function getDerived() {
  const role = normalizeRole(userRole);
  const hasFullAccess  = FULL_ACCESS_ROLES.includes(role);
  const isGroupLeader  = role==='to_truong';
  const isStudentOnly  = role==='hoc_sinh';
  const canUseScoringTab = hasFullAccess||isGroupLeader;
  const canCreateWeek  = WEEK_CREATORS.includes(role);
  const ugn = parseGroup(userGroup)||readSavedUserGroup();

  const curWeekSetting = state.weekSettings.find(w=>Number(w.week)===Number(state.week));
  const lockedForLeader = isGroupLeader&&Boolean(curWeekSetting?.locked);
  const permNote = lockedForLeader ? `Tuần ${state.week} đã quá hạn chấm điểm${curWeekSetting?.start||curWeekSetting?.end?` (${curWeekSetting?.start||'?'} → ${curWeekSetting?.end||'?'})`:''}. Chỉ khóa nút Sửa, vẫn có thể xem bảng chấm.` : '';
  const highlightName = role==='gvcn'?'':readSavedUserName();
  const nextWeek = Math.max(0,...state.weeks)+1;

  const rawSummaries = summarizeStudents(state.students, state.events, state.week);
  const groupFiltered = rawSummaries.filter(s=>matchesGroups(s.group,state.groupFilter));

  const isOverview = state.viewMode==='overview';
  const isScoring  = state.activeTab==='scoring';
  const shownStatus = (isOverview||isScoring)?'all':state.statusFilter;
  const shownSort   = (isOverview||isScoring)?'score-desc':state.sortMode;

  const filtered = groupFiltered.filter(s=>shownStatus==='all'||s.status===shownStatus);
  const sorted = [...filtered].sort((a,b)=>{
    const nc=compareByGivenName(a,b);
    if(shownSort==='name-az') return nc;
    if(shownSort==='name-za') return -nc;
    if(shownSort==='score-asc') return a.total-b.total||nc;
    return b.total-a.total||nc;
  });

  const byId=new Map(groupFiltered.map(s=>[s.id,s]));
  const scoringSummaries=state.students.map(s=>byId.get(s.id)).filter(Boolean);

  const groupStats = getGroupStats(groupFiltered);
  const totalScore = groupFiltered.reduce((s,x)=>s+x.total,0);
  const goodCount  = groupFiltered.filter(s=>s.status==='Tốt'||s.status==='Khá').length;
  const warnCount  = groupFiltered.filter(s=>s.status==='Chưa đạt').length;
  const topGroup   = [...groupStats].sort((a,b)=>b.average-a.average||b.total-a.total)[0];

  const canEditStudent = (student) => {
    if(hasFullAccess) return true;
    if(isGroupLeader) return !lockedForLeader&&Boolean(ugn&&Number(student.group)===ugn);
    return false;
  };

  return {
    role, hasFullAccess, isGroupLeader, isStudentOnly, canUseScoringTab, canCreateWeek,
    ugn, lockedForLeader, permNote, highlightName, nextWeek,
    rawSummaries, groupFiltered, sorted, scoringSummaries, groupStats,
    totalScore, goodCount, warnCount, topGroup, canEditStudent,
  };
}

/* ============================================================
   GAS API (via JSONP / fetch)
   ============================================================ */
async function fetchFromGas(params={}) {
  if(!gasUrl) return null;
  try {
    const url = new URL(gasUrl);
    Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));
    url.searchParams.set('t',String(Date.now()));
    const res = await fetch(url.toString(),{method:'GET',redirect:'follow'});
    return await res.json();
  } catch { return null; }
}

async function fetchScoreboardFromGas(force=false) {
  const json = await fetchFromGas({action:'getScoreboard'});
  if(!json) return null;
  const data = json?.data||json;
  return {
    students: Array.isArray(data?.students)?data.students:[],
    events:   Array.isArray(data?.events)?data.events:[],
    weeks:    Array.isArray(data?.weeks)?data.weeks:[],
    weekSettings: Array.isArray(data?.weekSettings)?data.weekSettings:[],
  };
}

async function fetchRulesFromGas() {
  if(cachedRules) return cachedRules;
  const json = await fetchFromGas({action:'getRules'});
  if(!json) return [];
  const data = json?.data||json;
  const raw  = data?.rules||data?.quickScoreReasons||data;
  if(!Array.isArray(raw)) return [];
  cachedRules = raw.map(item=>{
    const title = String(item.title||item['Tên']||item.ten||'').trim();
    const rawPt = Number(item.points||item['Điểm']||item.diem||0);
    if(!title||!isFinite(rawPt)) return null;
    const rawType = String(item.type||item['Tính']||item.tinh||'').toUpperCase();
    const type = (rawType==='CONG'||rawType==='TRU')?rawType:rawPt>=0?'CONG':'TRU';
    const rawCat = String(item.category||item['Phân loại']||item.phanloai||'').toUpperCase();
    let category='HOC_TAP';
    if(rawCat.includes('NỀ')||rawCat.includes('NE')) category='NE_NEP';
    else if(rawCat.includes('PHONG')) category='PHONG_TRAO';
    const points = type==='TRU'?-Math.abs(rawPt):Math.abs(rawPt);
    return { title, points, type, category, note:String(item.note||item['Ghi chú']||item.ghichu||'').trim()||undefined };
  }).filter(Boolean);
  return cachedRules;
}

/* ============================================================
   DATA LOADING
   ============================================================ */
async function loadScoreboardData(force=false) {
  setState({dataSource:'loading',syncMessage:''});
  const remote = await fetchScoreboardFromGas(force);
  if(!remote) {
    const localEvents = (() => { try { const s=localStorage.getItem(STORAGE_KEY); return s?JSON.parse(s):mockScoreEvents; } catch { return mockScoreEvents; } })();
    setState({
      students: mockStudents, events: localEvents, weeks: readLocalWeeks(),
      weekSettings: [], dataSource:'local',
      syncMessage: 'Đang dùng dữ liệu cục bộ. Chưa cấu hình hoặc chưa đọc được Google Apps Script.',
    });
    seenSignatures = new Set(localEvents.map(eventSignature));
    liveStartedAt = Date.now();
    return;
  }
  applyRemoteData(remote, {silent:false,notify:false});
  liveStartedAt = Date.now();
}

function applyRemoteData(remote, opts={}) {
  let nextEvents = remote.events;
  const guard = pendingSaveGuard;
  if(guard) {
    if(guard.expiresAt<Date.now()) pendingSaveGuard=null;
    else if(remoteContainsSavedChanges(nextEvents,guard)) pendingSaveGuard=null;
    else nextEvents=mergeGuardedEvents(nextEvents,guard);
  }
  const nextWeeks = remote.weeks.length?remote.weeks:[state.week||1];
  const now = Date.now();
  if(opts.notify&&state.dataSource==='gas'&&!savingActive) {
    const newEvs = nextEvents.filter(ev=>{
      if(seenSignatures.has(eventSignature(ev))) return false;
      const t=eventTime(ev);
      return t&&t>=liveStartedAt-FRESH_EVENT_MARGIN_MS&&t<=now+FRESH_EVENT_MARGIN_MS;
    }).sort((a,b)=>eventTime(b)-eventTime(a));
    if(newEvs.length) {
      const ev=newEvs[0];
      const sn=remote.students.find(s=>s.id===ev.studentId)?.name||'học sinh';
      const actor=ev.createdBy||'Có người';
      const pts=ev.points||0;
      showLiveToast({
        kind:'foreground',
        title:'Điểm vừa được cập nhật',
        message:`${actor} vừa sửa điểm của ${sn}: ${ev.title} (${formatScore(pts)})`,
        points:pts,
      });
    }
  }
  seenSignatures = new Set(nextEvents.map(eventSignature));
  const nw = nextWeeks.includes(state.week)?state.week:nextWeeks[0]||1;
  const nextSyncMessage = (!remote.students.length&&!opts.silent)?'Không đọc được học sinh trong sheet TUẦN hiện tại.':'';

  // Polling (LIVE_REFRESH_MS) gọi applyRemoteData() liên tục dù dữ liệu
  // không hề đổi — trước đây setState() vẫn chạy mỗi lần, khiến toàn bộ
  // app bị render lại (phá huỷ + tạo lại toàn bộ bảng) mỗi 7 giây dù
  // chẳng có gì thay đổi. Giờ chỉ setState() khi dữ liệu THỰC SỰ khác.
  const unchanged = state.dataSource==='gas'
    && nw===state.week
    && nextSyncMessage===state.syncMessage
    && sameEventSet(state.events, nextEvents)
    && sameStudentSet(state.students, remote.students)
    && sameWeekList(state.weeks, nextWeeks)
    && JSON.stringify(state.weekSettings||[])===JSON.stringify(remote.weekSettings||[]);
  if(unchanged) return;

  setState({
    students: remote.students, events: nextEvents, weeks: nextWeeks,
    weekSettings: remote.weekSettings||[], week: nw,
    dataSource:'gas',
    syncMessage: nextSyncMessage,
  }, `applyRemoteData(silent=${!!opts.silent})`);
}

function sameEventSet(a,b) {
  if(a===b) return true;
  if(!a||!b||a.length!==b.length) return false;
  const setA=new Set(a.map(eventSignature));
  return b.every(e=>setA.has(eventSignature(e)));
}
function sameStudentSet(a,b) {
  if(a===b) return true;
  if(!a||!b||a.length!==b.length) return false;
  return a.every((s,i)=>{
    const t=b[i];
    return t&&s.id===t.id&&s.name===t.name&&s.group===t.group&&s.role===t.role;
  });
}
function sameWeekList(a,b) {
  if(a===b) return true;
  if(!a||!b||a.length!==b.length) return false;
  return a.every((w,i)=>w===b[i]);
}

function scoreContentCounts(evs) {
  const m=new Map();
  evs.forEach(e=>{ const k=scoreContentSig(e); m.set(k,(m.get(k)||0)+1); });
  return m;
}
function remoteContainsSavedChanges(remoteEvs,guard) {
  const counts=scoreContentCounts(remoteEvs);
  const addOk=guard.additions.every(e=>{ const k=scoreContentSig(e); const l=counts.get(k)||0; if(l<=0) return false; counts.set(k,l-1); return true; });
  const delOk=[...guard.deletions].every(id=>!remoteEvs.some(e=>e.id===id));
  return addOk&&delOk;
}
function mergeGuardedEvents(remoteEvs,guard) {
  const counts=scoreContentCounts(remoteEvs);
  const guarded=remoteEvs.filter(e=>!guard.deletions.has(e.id));
  const missing=[];
  guard.additions.forEach(e=>{ const k=scoreContentSig(e); const l=counts.get(k)||0; if(l>0) counts.set(k,l-1); else missing.push(e); });
  return [...missing,...guarded];
}

/* ============================================================
   SAVE SCORE
   ============================================================ */
async function saveScoreChanges(changes) {
  const { additions, deletions } = changes;
  const delSet = new Set(deletions);
  const { rawSummaries, canEditStudent } = getDerived();
  const allowed = additions.filter(e=>{
    const st=rawSummaries.find(s=>s.id===e.studentId);
    return st&&canEditStudent(st);
  });
  const optimistic = allowed.map((e,i)=>({
    ...e,
    id:`local-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
    createdAt: e.createdAt||new Date().toISOString(),
  }));
  if(!optimistic.length&&!delSet.size) return;
  const prevEvents = state.events;
  const nextEvents = [...optimistic,...state.events.filter(e=>!delSet.has(e.id))];
  pendingSaveGuard = { additions:optimistic, deletions:delSet, expiresAt:Date.now()+SAVE_GUARD_MS };
  setState({events:nextEvents, syncMessage:''});
  if(state.dataSource!=='gas') return;
  savingActive=true;
  try {
    const body = JSON.stringify({action:'saveScoreChanges',additions:optimistic,deletions:[...delSet]});
    const res = await fetch(gasUrl,{method:'POST',body});
    const json = await res.json();
    if(json?.data) applyRemoteData(json.data,{silent:true,notify:false});
    setTimeout(async()=>{ const fresh=await fetchScoreboardFromGas(true); if(fresh) applyRemoteData(fresh,{silent:true,notify:false}); },9500);
  } catch(err) {
    pendingSaveGuard=null;
    setState({events:prevEvents, syncMessage:String(err?.message||'Không lưu được lên Google Sheets. Đã hoàn tác.')});
  } finally {
    savingActive=false;
  }
}

/* ============================================================
   TOAST
   ============================================================ */
function showLiveToast(toast) {
  const id=`toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  setState({liveToasts:[{...toast,id},...state.liveToasts].slice(0,4)});
  setTimeout(()=>setState({liveToasts:state.liveToasts.filter(t=>t.id!==id)}),toast.kind==='foreground'?3600:5200);
}

/* ============================================================
   STATE & RENDER WIRING
   ============================================================ */
// ── DEBUG TẠM: đặt true để in ra console AI đang gọi setState()/render()
//    và TẠI SAO. Đã xác định xong nguyên nhân chính (desktop.js recreate
//    iframe qua sự kiện 'storage') nên tắt mặc định — bật lại khi cần.
window.__A3_DEBUG_RENDER__ = false;

function setState(partial, __debugTag) {
  Object.assign(state, partial);
  if (window.__A3_DEBUG_RENDER__) {
    console.groupCollapsed(
      `%c🔥 setState()${__debugTag ? ' ['+__debugTag+']' : ''}`,
      'color:#f97316;font-weight:700'
    );
    console.log('partial:', partial);
    console.trace('call stack');
    console.groupEnd();
  }
  render();
}

/* ============================================================
   SVG ICONS (inline — no external dep)
   ============================================================ */
const Icons = {
  crown:     `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M3 21h18M5 21V9l7-6 7 6v12M9 21V13h6v8"/></svg>`,
  medal:     `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><circle cx="12" cy="15" r="6"/><path d="M8.5 8.5 7 4h10l-1.5 4.5"/></svg>`,
  trophy:    `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M8 21h8m-4-4v4"/><path d="M6 3H4v5a5 5 0 0 0 5 5h6a5 5 0 0 0 5-5V3h-2"/><path d="M6 3v5M18 3v5"/></svg>`,
  pencil:    `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>`,
  download:  `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  camera:    `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  sparkles:  `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M9.94 2a.5.5 0 0 1 .49.4l.7 3.5 3.5.7a.5.5 0 0 1 0 .98l-3.5.7-.7 3.5a.5.5 0 0 1-.98 0l-.7-3.5-3.5-.7a.5.5 0 0 1 0-.98l3.5-.7.7-3.5A.5.5 0 0 1 9.94 2z"/></svg>`,
  refresh:   `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4"/></svg>`,
  chevdown:  `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`,
  check:     `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
  x:         `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  calendar:  `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  filter:    `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
  plus:      `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
};

/* ============================================================
   BUILD CHART
   ============================================================ */
function niceStep(raw) {
  const exp=Math.floor(Math.log10(Math.max(raw,1)));
  const base=Math.pow(10,exp);
  const f=raw/base;
  if(f<=1) return base; if(f<=2) return 2*base; if(f<=5) return 5*base; return 10*base;
}
function buildScale(values) {
  const rawMax=Math.max(0,...values), rawMin=Math.min(0,...values);
  const rawRange=rawMax-rawMin;
  const targetRange=Math.max(50,rawRange||Math.max(Math.abs(rawMax),Math.abs(rawMin),50));
  const step=niceStep(targetRange/5);
  const maxY=rawMax>0?Math.ceil(rawMax/step)*step:0;
  const minY=rawMin<0?Math.floor(rawMin/step)*step:0;
  const ticks=[];
  for(let v=maxY;v>=minY;v-=step) ticks.push(Number(v.toFixed(10)));
  if(!ticks.includes(0)) ticks.push(0);
  return { minY, maxY:maxY===minY?maxY+step:maxY, ticks:ticks.sort((a,b)=>b-a) };
}
function pos(value,minY,maxY) {
  const r=maxY-minY||1; return Math.max(0,Math.min(100,((maxY-value)/r)*100));
}

function buildGroupChart(summaries) {
  const stats = getGroupStats(summaries);
  const values = stats.map(s=>s.average);
  const {minY,maxY,ticks}=buildScale(values);
  const zeroTop=pos(0,minY,maxY);
  return `
    <section class="score-panel chart-panel group-stats-v2-panel">
      <div class="section-heading"><span>📈</span><strong>Thống kê tổ</strong></div>
      <div class="group-stats-v2-chart">
        <div class="group-stats-v2-axis">
          ${ticks.map(t=>`<span style="top:${pos(t,minY,maxY)}%">${t}</span>`).join('')}
        </div>
        <div class="group-stats-v2-plot">
          <div class="group-stats-v2-grid">
            ${ticks.map(t=>`<i class="${t===0?'zero':''}" style="top:${pos(t,minY,maxY)}%"></i>`).join('')}
          </div>
          <div class="group-stats-v2-columns">
            ${stats.map(item=>{
              const vt=pos(item.average,minY,maxY);
              const neg=item.average<0;
              const h=Math.max(4,Math.abs(zeroTop-vt));
              const top=neg?zeroTop:vt;
              return `
                <div class="group-stats-v2-column">
                  <div class="group-stats-v2-track">
                    <div class="group-stats-v2-bar group-${item.group} ${neg?'negative':'positive'}" style="top:${top}%;height:${h}%">
                      <span>${Number(item.average).toFixed(1)}</span>
                    </div>
                  </div>
                  <strong>${item.label}</strong>
                  <small>TB ${Number(item.average).toFixed(1)} · Tổng ${item.total} · ${item.members.length} HS</small>
                </div>`;
            }).join('')}
          </div>
        </div>
      </div>
    </section>`;
}

/* ============================================================
   BUILD PODIUM
   ============================================================ */
function buildPodium(summaries, canEditStudent, highlightName) {
  const top=[...summaries].sort((a,b)=>b.total-a.total||compareByGivenName(a,b)).slice(0,3);
  const order=[top[1],top[0],top[2]].filter(Boolean);
  if(!top.length) return `<section class="score-panel ranking-panel"><div class="section-heading"><span>🏆</span><strong>Bảng vinh danh</strong></div><div style="padding:24px;text-align:center;color:var(--score-muted);font-size:13px">Chưa có dữ liệu điểm.</div></section>`;
  return `
    <section class="score-panel ranking-panel">
      <div class="section-heading"><span>🏆</span><strong>Bảng vinh danh</strong></div>
      <div class="podium-grid">
        ${order.map(student=>{
          const rank=top.findIndex(s=>s.id===student.id)+1;
          const ic=rank===1?Icons.crown:rank===2?Icons.medal:Icons.trophy;
          const canOpen=canEditStudent?canEditStudent(student):false;
          const isCur=highlightName&&normalizeVi(student.name)===normalizeVi(highlightName);
          return `
            <button type="button" class="podium-card rank-${rank}${isCur?' podium-current-user':''}" ${canOpen?`onclick="openStudent('${student.id}')"`:'disabled'} title="${student.name}">
              <div class="podium-rank">${ic}<span>#${rank}</span></div>
              <div class="podium-avatar" style="${isCur?'box-shadow:0 0 0 3px var(--accent),0 0 24px color-mix(in srgb,var(--accent) 50%,transparent);':''}"><span>${student.avatarInitial||lastNameInitial(student.name)}</span></div>
              <strong style="${isCur?'color:var(--accent);text-shadow:0 0 16px color-mix(in srgb,var(--accent) 60%,transparent);font-weight:900;':''}">${student.name}</strong>
              <span class="${student.total>=0?'score-positive':'score-negative'}">${formatScore(student.total)}</span>
            </button>`;
        }).join('')}
      </div>
    </section>`;
}

/* ============================================================
   BUILD STUDENT TABLE
   ============================================================ */
function buildCompactTable(students, startIndex, canEditStudent, highlightName) {
  return `
    <div class="score-table-wrap compact-table-wrap">
      <table class="score-table compact-score-table">
        <thead><tr><th>STT</th><th>Học sinh</th><th>Điểm</th><th>Thứ</th><th>XL</th></tr></thead>
        <tbody>
          ${students.map((s,i)=>{
            const editable=canEditStudent?canEditStudent(s):false;
            const isCur=highlightName&&normalizeVi(s.name)===normalizeVi(highlightName);
            return `
              <tr class="${!editable?'readonly-student-row':''} ${isCur?'current-user-row':''}">
                <td>${startIndex+i+1}</td>
                <td>
                  <button type="button" class="student-name-button" onclick="openProfile('${s.id}')">${s.name}</button>
                  ${s.role?`<span class="student-role">${s.role}</span>`:''}
                </td>
                <td class="${s.total>=0?'score-positive':'score-negative'}">${formatScore(s.total)}</td>
                <td class="rank-text">#${s.rank}</td>
                <td><span class="status-pill status-${statusClass(s.status)}">${s.status==='Chưa đạt'?'CĐ':s.status}</span></td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function buildStudentTable(students, opts={}) {
  const { title, compact, canEditStudent, highlightName, onEdit } = opts;

  if(compact) {
    const shouldSplit = title==='Danh sách cá nhân'&&students.length>12;
    if(shouldSplit) {
      const mid=Math.ceil(students.length/2);
      return `
        <section class="score-panel student-table-panel compact-split-panel">
          ${title?`<div class="table-title">${title}</div>`:''}
          <div class="compact-split-grid">
            ${buildCompactTable(students.slice(0,mid),0,canEditStudent,highlightName)}
            ${buildCompactTable(students.slice(mid),mid,canEditStudent,highlightName)}
          </div>
        </section>`;
    }
    return `
      <section class="score-panel student-table-panel">
        ${title?`<div class="table-title">${title}</div>`:''}
        ${buildCompactTable(students,0,canEditStudent,highlightName)}
      </section>`;
  }

  // Full scoring table
  return `
    <section class="score-panel student-table-panel">
      ${title?`<div class="table-title">${title}</div>`:''}
      <div class="score-table-wrap">
        <table class="score-table score-detail-table">
          <thead><tr>
            <th>STT</th><th>Học sinh</th><th>Cộng (+)</th><th>Điểm +</th>
            <th>Trừ (-)</th><th>Điểm -</th><th>Tổng</th><th>Xếp loại</th><th>Sửa</th>
          </tr></thead>
          <tbody>
            ${students.map((s,idx)=>{
              const editable=canEditStudent?canEditStudent(s):false;
              const vis=s.events.filter(e=>!isSheetTotalEvent(e));
              const plus=vis.filter(e=>e.points>0);
              const minus=vis.filter(e=>e.points<0);
              const vpos=plus.reduce((a,e)=>a+e.points,0);
              const vneg=minus.reduce((a,e)=>a+e.points,0);
              const isCur=highlightName&&normalizeVi(s.name)===normalizeVi(highlightName);
              return `
                <tr class="${!editable?'readonly-student-row':''} ${isCur?'current-user-row':''}">
                  <td class="table-index">${idx+1}</td>
                  <td class="student-cell">
                    <button type="button" class="student-name-button detail-name"
                      ${editable?`onclick="openStudent('${s.id}')"`:``}
                      ${!editable?'disabled':''}>
                      ${s.name}
                    </button>
                    <span class="student-role">Tổ ${s.group}${s.role?` · ${s.role}`:''}</span>
                  </td>
                  <td><div class="event-stack">${plus.length?plus.map(e=>`<span class="event-line event-plus">${e.title}</span>`).join(''):'<span class="muted-dash">-</span>'}</div></td>
                  <td class="point-cell score-positive">${vpos>0?formatScore(vpos):'0'}</td>
                  <td><div class="event-stack">${minus.length?minus.map(e=>`<span class="event-line event-minus">${e.title}</span>`).join(''):'<span class="muted-dash">-</span>'}</div></td>
                  <td class="point-cell score-negative">${vneg<0?vneg:'0'}</td>
                  <td class="total-cell ${s.total>=0?'score-positive':'score-negative'}">${formatScore(s.total)}</td>
                  <td><span class="status-pill status-${statusClass(s.status)}">${s.status==='Chưa đạt'?'CĐ':s.status}</span></td>
                  <td>
                    <button class="edit-score-button" type="button"
                      ${editable?`onclick="openStudent('${s.id}')"`:''}
                      ${!editable||!onEdit?'disabled':''}
                      title="${editable?'Sửa điểm':'Bạn không có quyền'}">
                      ${Icons.pencil}
                    </button>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </section>`;
}

/* ============================================================
   BUILD OVERVIEW PAGE
   ============================================================ */
function buildOverviewPage(d) {
  const orderedGroups = normalizeOrder(state.groupOrder)
    .map(g=>getGroupStats(d.groupFiltered).find(s=>s.group===g))
    .filter(Boolean);

  if(state.viewMode==='students') {
    return `<div class="score-page overview-compact-page">
      ${buildStudentTable(d.sorted,{title:'Danh sách cá nhân',compact:true,canEditStudent:d.canUseScoringTab?d.canEditStudent:undefined,highlightName:d.highlightName})}
    </div>`;
  }

  return `<div class="score-page overview-compact-page">
    <section class="overview-feature-grid">
      ${buildPodium(d.rawSummaries,d.canUseScoringTab?d.canEditStudent:undefined,d.highlightName)}
      ${buildGroupChart(d.groupFiltered)}
    </section>
    <section class="group-overview-grid ordered-groups" id="group-overview-grid">
      ${orderedGroups.map((group,idx)=>`
        <div class="score-panel group-overview-card ordered-group-card" data-group="${group.group}">
          <div class="group-overview-title draggable-group-title clean-draggable-title"
            onmousedown="startGroupDrag(event,${group.group})"
            title="Giữ chuột và kéo ngang để đổi vị trí tổ">
            Tổ ${group.group}
          </div>
          ${buildCompactTable(group.members,0,d.canEditStudent,d.highlightName)}
        </div>`).join('')}
    </section>
  </div>`;
}

/* ============================================================
   BUILD SCORING PAGE
   ============================================================ */
function buildScoringPage(d) {
  return `<div class="score-page">
    <section class="score-panel">
      <div class="table-toolbar">
        <div class="section-heading-inner">
          <strong>Bảng chấm tuần ${state.week}</strong>
          ${d.permNote?`<span class="score-permission-note">${d.permNote}</span>`:''}
        </div>
      </div>
      ${buildStudentTable(d.scoringSummaries,{canEditStudent:d.canEditStudent,onEdit:true})}
    </section>
  </div>`;
}

/* ============================================================
   BUILD LEFT SIDEBAR
   ============================================================ */
function buildFilterSelect(id,value,options,disabled,title='') {
  const cur=options.find(o=>String(o.value)===String(value))||options[0];
  return `
    <div class="filter-select" id="fs-${id}">
      <button type="button" class="filter-select-button" ${disabled?'disabled':''} title="${title}"
        onclick="toggleFilterSelect('${id}')">
        <span>${cur?.label||'Chọn'}</span>${Icons.chevdown}
      </button>
      <div class="filter-select-menu" id="fsm-${id}" style="display:none">
        ${options.map(o=>`
          <button type="button" class="filter-select-option ${String(o.value)===String(value)?'active':''}"
            onclick="selectFilterOption('${id}','${o.value}')">
            ${o.label}
          </button>`).join('')}
      </div>
    </div>`;
}

function buildGroupMultiSelect(value) {
  const groups=['1','2','3','4'];
  const allSel=!value.length;
  const label=allSel?'Tất cả tổ':groups.filter(g=>value.includes(g)).map(g=>`Tổ ${g}`).join(' + ');
  return `
    <div class="filter-select group-multi-select" id="fs-group">
      <button type="button" class="filter-select-button" onclick="toggleFilterSelect('group')">
        <span>${label}</span>${Icons.chevdown}
      </button>
      <div class="filter-select-menu group-multi-menu" id="fsm-group" style="display:none">
        <button type="button" class="filter-select-option group-multi-option ${allSel?'active':''}" onclick="selectGroupAll()">
          <span class="group-check-box">${allSel?Icons.check:''}</span><span>Tất cả tổ</span>
        </button>
        ${groups.map(g=>{
          const checked=!allSel&&value.includes(g);
          return `<button type="button" class="filter-select-option group-multi-option ${checked?'active':''}" onclick="toggleGroup('${g}')">
            <span class="group-check-box">${checked?Icons.check:''}</span><span>Tổ ${g}</span>
          </button>`;
        }).join('')}
      </div>
    </div>`;
}

function buildSidebar(d) {
  const isOverview=state.viewMode==='overview';
  const isScoring=state.activeTab==='scoring';
  return `
    <aside class="scoreboard-left-tools">
      <div class="left-tools-title">
        <span>A3K64</span><strong>Bộ lọc</strong><small>Điều khiển bảng điểm</small>
      </div>
      <div class="score-filter-bar">
        <label class="score-filter">
          <span>${Icons.calendar} Tuần</span>
          <div class="week-select-row">
            ${buildFilterSelect('week',state.week,state.weeks.map(w=>({value:w,label:`Tuần ${w}`})),false)}
            <button type="button" class="create-week-button" onclick="requestCreateWeek()"
              ${!d.canCreateWeek||state.isCreatingWeek?'disabled':''}
              title="${d.canCreateWeek?'Tạo tuần mới':'Chỉ tổ trưởng, lớp trưởng, bí thư hoặc GVCN được tạo tuần mới'}">
              ${Icons.plus}
            </button>
          </div>
        </label>
        ${(state.syncMessage||d.permNote)?`<div class="score-sync-warning">${state.syncMessage||d.permNote}</div>`:''}
        <label class="score-filter">
          <span>${Icons.filter} Chế độ xem</span>
          ${buildFilterSelect('viewMode',state.viewMode,[{value:'overview',label:'Tổng quan'},{value:'students',label:'Cá nhân'}],isScoring,isScoring?'Bảng chấm không dùng chế độ xem':'')}
        </label>
        <label class="score-filter">
          <span>Tổ</span>
          ${buildGroupMultiSelect(state.groupFilter)}
        </label>
        <label class="score-filter">
          <span>Xếp loại</span>
          ${buildFilterSelect('statusFilter',state.statusFilter,[
            {value:'all',label:'Tất cả xếp loại'},{value:'Tốt',label:'Tốt'},
            {value:'Khá',label:'Khá'},{value:'Đạt',label:'Đạt'},{value:'Chưa đạt',label:'Chưa đạt'}],
            isOverview||isScoring,isOverview?'Chỉ mở khi xem Cá nhân':isScoring?'Bảng chấm không dùng lọc xếp loại':'')}
        </label>
        <label class="score-filter">
          <span>Sắp xếp</span>
          ${buildFilterSelect('sortMode',state.sortMode,[
            {value:'score-desc',label:'Điểm cao đến thấp'},{value:'score-asc',label:'Điểm thấp đến cao'},
            {value:'name-az',label:'Theo tên A-Z'},{value:'name-za',label:'Theo tên Z-A'}],
            isOverview||isScoring)}
        </label>
      </div>
      <div class="left-mini-section">
        <div class="left-mini-title">Tóm tắt tuần</div>
        <div class="mini-stat"><span>Tổng điểm</span><strong class="${d.totalScore>=0?'score-positive':'score-negative'}">${d.totalScore>0?`+${d.totalScore}`:d.totalScore}</strong></div>
        <div class="mini-stat"><span>Ổn định</span><strong>${d.goodCount}/${d.groupFiltered.length}</strong></div>
        <div class="mini-stat"><span>Cần chú ý</span><strong>${d.warnCount}</strong></div>
        <div class="mini-stat"><span>Tổ dẫn đầu</span><strong>${d.topGroup?.label||'Chưa có'}</strong></div>
      </div>
    </aside>`;
}

/* ============================================================
   BUILD SCORE EDIT MODAL
   ============================================================ */
function buildScoreEditModal(student, justOpened) {
  const m = state.modal;
  const weekEvents = m.draftEvents.filter(e=>e.studentId===student.id&&e.week===state.week);
  const visible = weekEvents.filter(e=>!isSheetTotalEvent(e));
  const plusTotal = visible.filter(e=>e.points>0).reduce((s,e)=>s+e.points,0);
  const minusTotal = visible.filter(e=>e.points<0).reduce((s,e)=>s+e.points,0);
  const total = weekEvents.reduce((s,e)=>s+e.points,0);
  const draftAdditions = m.draftEvents.filter(e=>e.id.startsWith('draft-'));
  const hasChanges = draftAdditions.length>0||m.deletedEventIds.length>0;

  const activeDayEvents = visible.filter(e=>eventDay(e)===m.activeDay);
  const activeDayName = days.find(d=>d.key===m.activeDay)?.full||'Thứ 2';

  const orderedRules = (() => {
    const pinned=new Set(m.pinnedRuleKeys);
    return [...m.rules].sort((a,b)=>Number(pinned.has(ruleKey(b)))-Number(pinned.has(ruleKey(a)))||Number(b.points)-Number(a.points));
  })();
  const filteredSuggestions = orderedRules.filter(r=>{
    if(!m.ruleSearch) return true;
    const s=normalizeVi(m.ruleSearch).split(/\s+/).filter(Boolean);
    const hay=normalizeVi(`${r.title} ${categoryLabel(r.category)} ${r.note||''} ${Math.abs(r.points)}`);
    return s.every(t=>hay.includes(t));
  }).slice(0,12);

  const summaryForDay = (day) => {
    const list=visible.filter(e=>eventDay(e)===day);
    const plus=list.filter(e=>e.points>0), minus=list.filter(e=>e.points<0);
    return {plus,minus,plusTotal:plus.reduce((s,e)=>s+e.points,0),minusTotal:minus.reduce((s,e)=>s+e.points,0)};
  };
  const summarizeTitles = (list) => !list.length?'-':list.map(e=>shortTitle(cleanTitleFromEvent(e.title))).join(' • ');

  // Group members for bulk
  const { rawSummaries } = getDerived();
  const groupMembers = rawSummaries.filter(s=>s.group===student.group);

  return `
    <div class="score-edit-backdrop ${justOpened?'a3-enter':''}" onclick="backdropClick(event)">
      <div class="score-edit-modal modern-score-editor ${justOpened?'a3-enter':''}">
        <header class="score-edit-header">
          <div><h2>Chấm điểm: <b>${student.name}</b></h2></div>
          <button type="button" class="score-edit-close" onclick="closeModal()" ${m.isSaving?'disabled':''} title="Đóng">${Icons.x}</button>
        </header>
        <section class="score-edit-body">
          <div class="score-edit-left">
            <!-- Week matrix -->
            <div class="score-week-table">
              <div class="score-edit-section-title">Bảng tổng quan tuần</div>
              <div class="week-matrix">
                <div class="matrix-cell matrix-head">Nội dung</div>
                ${days.map(d=>`<div class="matrix-cell matrix-head day-head matrix-day-jump" onclick="jumpToDay(${d.key})">${d.label}</div>`).join('')}
                <div class="matrix-cell matrix-label">Điểm (+)</div>
                ${days.map(d=>{ const data=summaryForDay(d.key); return `<div class="matrix-cell matrix-day-jump" onclick="jumpToDay(${d.key})">${data.plusTotal?formatScore(data.plusTotal):'-'}</div>`; }).join('')}
                <div class="matrix-cell matrix-label">Điểm (-)</div>
                ${days.map(d=>{ const data=summaryForDay(d.key); return `<div class="matrix-cell matrix-day-jump" onclick="jumpToDay(${d.key})">${data.minusTotal?data.minusTotal:'-'}</div>`; }).join('')}
                <div class="matrix-cell matrix-label">Nội dung (+)</div>
                ${days.map(d=>{ const data=summaryForDay(d.key); const t=summarizeTitles(data.plus); return `<div class="matrix-cell matrix-content matrix-day-jump" title="${t}" onclick="jumpToDay(${d.key})"><span>${t}</span></div>`; }).join('')}
                <div class="matrix-cell matrix-label">Nội dung (-)</div>
                ${days.map(d=>{ const data=summaryForDay(d.key); const t=summarizeTitles(data.minus); return `<div class="matrix-cell matrix-content matrix-day-jump" title="${t}" onclick="jumpToDay(${d.key})"><span>${t}</span></div>`; }).join('')}
              </div>
            </div>
            <!-- Day tabs -->
            <div class="score-day-switch-row">
              <div class="day-tabs">
                ${days.map(d=>`<button type="button" class="${m.activeDay===d.key?'active':''}" onclick="jumpToDay(${d.key})" ${m.isSaving?'disabled':''}>${d.label}</button>`).join('')}
              </div>
              <div class="day-record-head inline-day-head">
                <strong>Ngày ${activeDayName}</strong>
                <span>Chỉ ghi vào Google Sheets khi bấm Save all changes.</span>
              </div>
            </div>
            <!-- Mobile tabs -->
            <div class="score-mobile-mode-tabs">
              <button type="button" class="${m.section==='add'?'active':''}" onclick="setModalSection('add')">Chấm điểm</button>
              <button type="button" class="${m.section==='review'?'active':''}" onclick="setModalSection('review')">Xem lại / xoá</button>
            </div>
            <!-- Two-column edit -->
            <div class="score-edit-columns">
              <!-- ADD PANEL -->
              <div class="score-add-panel ${m.section!=='add'?'mobile-hidden-section':''}">
                <!-- Rule search form -->
                <div class="score-custom-form rule-select-form">
                  <div class="form-row rule-pick-row">
                    <div class="category-picker subject-picker">
                      ${buildFilterSelect('modal-subject',m.subject,subjects.map(s=>({value:s,label:s})),m.isSaving,'',true)}
                    </div>
                    <div class="rule-search-box">
                      <input class="rule-search-input" id="rule-search-input" value="${m.ruleSearch.replace(/"/g,'&quot;')}"
                        oninput="onRuleSearchInput(this.value)" onfocus="setState({modal:{...state.modal,ruleDropdownOpen:true}})"
                        placeholder="Tìm nội quy" ${m.isSaving?'disabled':''}/>
                      <span class="rule-search-arrow">▾</span>
                      ${m.ruleDropdownOpen&&!m.isSaving&&filteredSuggestions.length?`
                        <div class="rule-suggestion-menu" id="rule-suggestion-menu">
                          ${filteredSuggestions.map(r=>`
                            <button type="button" class="${r.points>=0?'plus':'minus'}" onclick="chooseRule(${JSON.stringify(r).replace(/"/g,'&quot;')})">
                              <strong>${r.title}</strong>
                              <span>${r.points>=0?'Cộng':'Trừ'}: ${Math.abs(r.points)}đ</span>
                            </button>`).join('')}
                        </div>`:''}
                      ${m.ruleDropdownOpen&&!m.isSaving&&!filteredSuggestions.length&&m.ruleSearch?`<div class="rule-suggestion-menu"><div class="rule-suggestion-empty">Không tìm thấy nội quy phù hợp.</div></div>`:''}
                    </div>
                    <div class="count-box">
                      <span>Lần</span>
                      <input type="number" min="1" step="1" value="${m.violationCount}"
                        onchange="setModalField('violationCount',Math.max(1,Math.trunc(Number(this.value)||1)))"
                        ${m.isSaving?'disabled':''}/>
                    </div>
                  </div>
                  <button type="button" class="score-add-button" onclick="handleSelectedRuleAdd()"
                    ${m.isSaving||!m.ruleSearch?'disabled':''}>
                    Thêm mới (Enter)
                  </button>
                </div>
                <!-- Special score form -->
                <div class="score-custom-form special-score-form">
                  <strong>Lỗi / Thưởng đặc biệt khác</strong>
                  <div class="form-row special-row">
                    <input id="modal-special-title-input" value="${(m.specialTitle||'').replace(/"/g,'&quot;')}" oninput="setModalField('specialTitle',this.value)" placeholder="Nhập lỗi khác..." ${m.isSaving?'disabled':''}/>
                    <input id="modal-special-point-input" type="text" inputmode="numeric" value="${(m.specialPoint||'').replace(/"/g,'&quot;')}" oninput="setModalField('specialPoint',this.value)" placeholder="Điểm" ${m.isSaving?'disabled':''}/>
                  </div>
                  <div class="form-row special-row second">
                    <div class="category-picker special-category-picker">
                      ${buildFilterSelect('modal-category',m.category,[
                        {value:'HOC_TAP',label:'Học tập'},{value:'NE_NEP',label:'Nề nếp'},{value:'PHONG_TRAO',label:'Phong trào'}],
                        m.isSaving,'',true)}
                    </div>
                    <button type="button" class="score-add-button secondary" onclick="handleSpecialAdd()" ${m.isSaving?'disabled':''}>Thêm lỗi/thưởng khác</button>
                  </div>
                </div>
                <!-- Bulk -->
                <div class="bulk-score-box">
                  <strong>Chấm hàng loạt</strong>
                  <span>Bao gồm học sinh đang chấm</span>
                  ${buildFilterSelect('modal-bulk',m.bulkScope,[
                    {value:'single',label:'Chỉ học sinh này'},{value:'group',label:'Cả tổ'},{value:'selected',label:'Chọn học sinh trong tổ'}],
                    m.isSaving,'',true)}
                  ${m.bulkScope==='selected'?`
                    <div class="bulk-student-list">
                      ${groupMembers.map(s=>`<label><input type="checkbox" ${m.selectedStudentIds.includes(s.id)?'checked':''} onchange="toggleBulkStudent('${s.id}')"/> <span>${s.name}</span></label>`).join('')}
                    </div>`:''} 
                  <textarea id="modal-bulk-note-input" oninput="setModalField('bulkNote',this.value)" placeholder="Nhập ghi chú riêng...">${m.bulkNote}</textarea>
                  <small>Đối tượng: ${m.bulkScope==='group'?`Cả tổ ${student.group} · ${groupMembers.length} HS`:m.bulkScope==='selected'?`Đã chọn ${m.selectedStudentIds.length} HS`:'Chỉ học sinh này'}</small>
                </div>
              </div>
              <!-- REVIEW PANEL -->
              <div class="day-record-panel ${m.section!=='review'?'mobile-hidden-section':''}">
                <div class="day-event-list">
                  ${activeDayEvents.length===0?`<div class="empty-day-record">Chưa có nội dung cho ngày này.</div>`
                    :activeDayEvents.map(ev=>`
                      <div class="day-event ${ev.points>=0?'plus':'minus'} ${ev.id.startsWith('draft-')?'draft':''}">
                        <span>${cleanTitleFromEvent(ev.title)}</span>
                        <strong>${formatScore(ev.points)}</strong>
                        <button type="button" onclick="removeModalEvent('${ev.id}')" ${m.isSaving?'disabled':''} title="Xoá dòng này">${Icons.x}</button>
                      </div>`).join('')}
                </div>
              </div>
            </div>
          </div>
          <!-- Rules sidebar -->
          <aside class="rules-directory">
            <h3>VI_PHAM</h3>
            ${m.rulesStatus?`<p class="rules-status">${m.rulesStatus}</p>`:''}
            <div class="rules-grid">
              ${orderedRules.map((rule,i)=>{
                const pinned=m.pinnedRuleKeys.includes(ruleKey(rule));
                return `<button key="${i}" type="button" class="rule-card ${rule.points>=0?'plus':'minus'} ${pinned?'pinned':''}"
                  onclick="handleQuickRule(${JSON.stringify(rule).replace(/"/g,'&quot;')})"
                  oncontextmenu="togglePinnedRule(${JSON.stringify(rule).replace(/"/g,'&quot;')});return false"
                  ${m.isSaving?'disabled':''}
                  title="Kéo thả hoặc chuột phải để ghim">
                  <span>${pinned?'📌 ':''}${rule.title}</span>
                  <strong>${formatScore(rule.points)}</strong>
                </button>`;
              }).join('')}
            </div>
          </aside>
        </section>
        <footer class="score-edit-footer">
          <strong class="footer-plus">${formatScore(plusTotal)}</strong>
          <strong class="footer-minus">${minusTotal}</strong>
          <strong class="footer-final-total">TỔNG ${formatScore(total)}</strong>
          <strong class="footer-status ${statusTone(student.status)}">${student.status==='Chưa đạt'?'CĐ':student.status}</strong>
          <button type="button" onclick="handleModalSave()" ${m.isSaving?'disabled':''}>
            ${m.isSaving?'Đang lưu...':hasChanges?'Save all changes':'Đóng'}
          </button>
        </footer>
      </div>
    </div>`;
}

/* ============================================================
   MAIN RENDER
   ============================================================ */
// Các cờ này chỉ đổi giá trị đúng 1 lần khi shell/modal thật sự
// "mở mới" — dùng để chỉ cho animation chạy lúc đó, không chạy lại
// mỗi khi setState() làm render() dựng lại toàn bộ innerHTML (gõ phím,
// tick checkbox, đổi tab...).
let __a3AppMounted = false;
let __a3PrevEditModalOpen = false;
let __a3PrevCreateWeekOpen = false;

// Giữ focus + vị trí con trỏ của input/textarea đang gõ dở qua một lần
// render(), vì render() thay toàn bộ innerHTML nên input cũ bị huỷ và
// tạo input mới → mất focus, con trỏ nhảy về cuối, cảm giác như "nháy".
function __a3CaptureFocus(root) {
  const el = document.activeElement;
  if (!el || !root || !root.contains(el)) return null;
  if (!el.id) return null;
  const info = { id: el.id };
  if (typeof el.selectionStart === 'number') {
    info.selectionStart = el.selectionStart;
    info.selectionEnd = el.selectionEnd;
  }
  return info;
}
function __a3RestoreFocus(root, info) {
  if (!info) return;
  const el = root.querySelector('#' + CSS.escape(info.id));
  if (!el) return;
  el.focus({ preventScroll: true });
  if (typeof info.selectionStart === 'number' && typeof el.setSelectionRange === 'function') {
    try { el.setSelectionRange(info.selectionStart, info.selectionEnd); } catch {}
  }
}

function render() {
  if (window.__A3_DEBUG_RENDER__) {
    console.log(`%c🔥 SCOREBOARD RENDER @ ${new Date().toISOString().slice(11,23)}`, 'color:#ef4444;font-weight:800');
  }
  const d = getDerived();
  const root = document.getElementById('scoreboard-root');
  if(!root) return;

  const editStudent = state.editingStudentId ? d.rawSummaries.find(s=>s.id===state.editingStudentId) : null;
  const canEditCurrent = editStudent ? d.canEditStudent(editStudent) : false;

  // "Mở mới" hay chỉ là re-render trong lúc vẫn đang mở?
  const shellFirstPaint = !__a3AppMounted;
  const editModalOpenNow = !!(editStudent && canEditCurrent);
  const editModalJustOpened = editModalOpenNow && !__a3PrevEditModalOpen;
  const createWeekOpenNow = !!state.createWeekConfirmOpen;
  const createWeekJustOpened = createWeekOpenNow && !__a3PrevCreateWeekOpen;

  const focusInfo = __a3CaptureFocus(root);

  root.innerHTML = `
    <div class="scoreboard-app ${shellFirstPaint?'a3-enter':''} role-${d.role} ${d.isStudentOnly?'student-readonly-mode':''}">
      ${buildSidebar(d)}
      <section class="scoreboard-main">
        <!-- Header -->
        <header class="scoreboard-header">
          <div>
            <span class="app-eyebrow">Bảng chấm điểm</span>
            <h1>System <b>A3K64</b></h1>
            <p>Quản lý điểm thi đua, xếp hạng học tập và nề nếp theo tuần.</p>
          </div>
          <nav class="scoreboard-tabs two-tabs">
            <button type="button" class="${state.activeTab==='overview'?'active':''}" onclick="setTab('overview')">Tổng quan</button>
            <button type="button" class="${state.activeTab==='scoring'?'active':''}"
              onclick="${d.canUseScoringTab?`setTab('scoring')`:'null'}"
              ${!d.canUseScoringTab?'disabled':''}>Bảng chấm</button>
          </nav>
        </header>
        <!-- Toolbar -->
        ${!d.isStudentOnly?`
          <div class="scoreboard-actionbar">
            <div class="toolbar-actions">
              <button type="button" class="toolbar-button export">${Icons.download}Xuất Excel</button>
              <button type="button" class="toolbar-button camera">${Icons.camera}Chụp ảnh</button>
              <button type="button" class="toolbar-button auto">${Icons.sparkles}Tự tính điểm</button>
              <button type="button" class="toolbar-button" onclick="resetData()">${Icons.refresh}Làm mới dữ liệu</button>
            </div>
          </div>`:''}
        <!-- Content -->
        <main class="scoreboard-content">
          ${state.dataSource==='loading'?`<div style="padding:40px;text-align:center;color:var(--score-muted)">Đang tải dữ liệu...</div>`:
            state.activeTab==='overview'?buildOverviewPage(d):
            d.canUseScoringTab?buildScoringPage(d):''}
        </main>
      </section>
    </div>

    <!-- Score edit modal -->
    ${editStudent&&canEditCurrent?buildScoreEditModal(editStudent, editModalJustOpened):''}

    <!-- Create week modal -->
    ${state.createWeekConfirmOpen?`
      <div class="create-week-modal-backdrop ${createWeekJustOpened?'a3-enter':''}" onclick="if(event.target===this)setState({createWeekConfirmOpen:false})">
        <div class="create-week-modal-card ${createWeekJustOpened?'a3-enter':''}">
          <button type="button" class="create-week-modal-close" onclick="setState({createWeekConfirmOpen:false})" ${state.isCreatingWeek?'disabled':''}>${Icons.x}</button>
          <div class="create-week-modal-icon">+</div>
          <h2>Tạo tuần ${d.nextWeek}?</h2>
          <p>Hệ thống sẽ nhân bản sheet <b>TUẦN 0</b> và đổi tiêu đề thành <b>LỚP 11A3 - TUẦN ${d.nextWeek}</b>.</p>
          <div class="create-week-modal-actions">
            <button type="button" class="create-week-cancel" onclick="setState({createWeekConfirmOpen:false})" ${state.isCreatingWeek?'disabled':''}>Huỷ</button>
            <button type="button" class="create-week-confirm" onclick="createNewWeek()" ${state.isCreatingWeek?'disabled':''}>${state.isCreatingWeek?'Đang tạo...':'Tạo tuần'}</button>
          </div>
        </div>
      </div>`:''}

    <!-- Live toasts -->
    ${state.liveToasts.length?`
      <div class="score-live-toast-layer" aria-live="polite">
        ${state.liveToasts.map(t=>`
          <div class="score-live-toast ${t.kind} ${t.points!==undefined&&t.points<0?'minus':'plus'}">
            <div class="score-live-dot">${t.points!==undefined&&t.points<0?'−':'+'}</div>
            <div><strong>${t.title}</strong><span>${t.message}</span></div>
            <button type="button" onclick="dismissToast('${t.id}')">×</button>
          </div>`).join('')}
      </div>`:''}
  `;

  __a3AppMounted = true;
  __a3PrevEditModalOpen = editModalOpenNow;
  __a3PrevCreateWeekOpen = createWeekOpenNow;
  __a3RestoreFocus(root, focusInfo);
}

/* ============================================================
   EVENT HANDLERS (called from HTML)
   ============================================================ */
function setTab(tab) {
  const d=getDerived();
  if(tab==='scoring'&&!d.canUseScoringTab) return;
  setState({activeTab:tab}, 'setTab');
}

function toggleFilterSelect(id) {
  const menu = document.getElementById(`fsm-${id}`);
  if(!menu) return;
  // close all others
  document.querySelectorAll('.filter-select-menu').forEach(m=>{ if(m.id!==`fsm-${id}`) m.style.display='none'; });
  menu.style.display = menu.style.display==='none'?'block':'none';
}

function selectFilterOption(id,value) {
  document.getElementById(`fsm-${id}`)?.style && (document.getElementById(`fsm-${id}`).style.display='none');
  if(id==='week') setState({week:Number(value)});
  else if(id==='viewMode') setState({viewMode:value});
  else if(id==='statusFilter') setState({statusFilter:value});
  else if(id==='sortMode') setState({sortMode:value});
  else if(id==='modal-subject') setState({modal:{...state.modal,subject:value}});
  else if(id==='modal-category') setState({modal:{...state.modal,category:value}});
  else if(id==='modal-bulk') setState({modal:{...state.modal,bulkScope:value}});
}

function selectGroupAll() {
  document.getElementById('fsm-group')?.style && (document.getElementById('fsm-group').style.display='none');
  setState({groupFilter:[]});
}
function toggleGroup(g) {
  document.getElementById('fsm-group')?.style && (document.getElementById('fsm-group').style.display='none');
  const cur=state.groupFilter;
  const allSel=!cur.length;
  let next;
  if(allSel) next=[g];
  else if(cur.includes(g)) next=cur.filter(x=>x!==g);
  else next=[...cur,g];
  if(next.length===4) next=[];
  setState({groupFilter:next});
}

// Close dropdowns on outside click
document.addEventListener('click',e=>{
  if(!e.target.closest('.filter-select')) {
    document.querySelectorAll('.filter-select-menu').forEach(m=>m.style.display='none');
  }
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape') {
    document.querySelectorAll('.filter-select-menu').forEach(m=>m.style.display='none');
    if(state.editingStudentId) closeModal();
    if(state.modal.ruleDropdownOpen) setState({modal:{...state.modal,ruleDropdownOpen:false}});
  }
});

function openStudent(id) {
  const { rawSummaries, canEditStudent } = getDerived();
  const s = rawSummaries.find(x=>x.id===id);
  if(!s||!canEditStudent(s)) return;
  const m = state.modal;
  setState({
    editingStudentId: id,
    modal: {
      ...m,
      activeDay: 2, section:'add',
      draftEvents: state.events.filter(e=>e.studentId===id&&e.week===state.week),
      deletedEventIds: [],
      selectedStudentIds: [id],
      isSaving: false,
    }
  });
  // Load rules lazily
  if(!state.modal.rules.length) {
    fetchRulesFromGas().then(rules=>{
      setState({modal:{...state.modal,rules:rules||[],rulesStatus:rules?.length?'':'Sheet VI_PHAM chưa có dữ liệu.'}});
    }).catch(()=>setState({modal:{...state.modal,rulesStatus:'Không đọc được sheet VI_PHAM.'}}));
  }
}
function openProfile(id) { window.dispatchEvent(new CustomEvent('a3k64-open-profile',{detail:{studentId:id}})); }
function closeModal() { setState({editingStudentId:null}); }
function backdropClick(e) { if(e.target===e.currentTarget) closeModal(); }

function setModalField(field, value) {
  setState({modal:{...state.modal,[field]:value}});
}
function setModalSection(section) { setState({modal:{...state.modal,section}}); }
function jumpToDay(day) { setState({modal:{...state.modal,activeDay:day,section:'review'}}); }

function onRuleSearchInput(value) {
  setState({modal:{...state.modal,ruleSearch:value,ruleDropdownOpen:true}});
}

function chooseRule(rule) {
  if(typeof rule==='string') try { rule=JSON.parse(rule); } catch { return; }
  setState({modal:{...state.modal,
    ruleSearch:rule.title,ruleDropdownOpen:false,
    category:rule.category, specialTitle:rule.title, specialPoint:String(rule.points),
  }});
}

function handleSelectedRuleAdd() {
  const m=state.modal;
  const rule={title:m.ruleSearch,points:Number(m.specialPoint)||0,category:m.category};
  if(!rule.title||!rule.points) return;
  stageScore(rule);
}
function handleSpecialAdd() {
  const m=state.modal;
  const pts=Number(m.specialPoint);
  if(!m.specialTitle.trim()||!isFinite(pts)||pts===0) return;
  stageScore({title:m.specialTitle,points:pts,category:m.category});
}
function handleQuickRule(rule) {
  if(typeof rule==='string') try { rule=JSON.parse(rule); } catch { return; }
  chooseRule(rule);
  stageScore({title:rule.title,points:rule.points,category:rule.category});
}

function stageScore(payload, day=state.modal.activeDay) {
  const m=state.modal;
  if(m.isSaving) return;
  const title=payload.title.trim();
  const count=Math.max(1,Math.trunc(m.violationCount||1));
  const points=payload.points*count;
  if(!title||!points) return;
  const targetIds = m.bulkScope==='group'
    ? getDerived().rawSummaries.filter(s=>s.group===getDerived().rawSummaries.find(x=>x.id===state.editingStudentId)?.group).map(s=>s.id)
    : m.bulkScope==='selected'?(m.selectedStudentIds.length?m.selectedStudentIds:[state.editingStudentId])
    : [state.editingStudentId];
  const newDrafts = targetIds.map(studentId=>makeDraftEvent({
    studentId, week:state.week,
    title: formatSavedTitle(day,payload.category,m.subject,title,points),
    points, type:points>=0?'CONG':'TRU',
    category:payload.category, note:m.bulkNote.trim()||undefined,
    createdBy:'Web', createdAt:newEventDateForDay(day),
  }));
  setState({modal:{...m,draftEvents:[...newDrafts,...m.draftEvents],section:'review'}});
}

function removeModalEvent(eventId) {
  const m=state.modal;
  setState({modal:{...m,
    draftEvents:m.draftEvents.filter(e=>e.id!==eventId),
    deletedEventIds:eventId.startsWith('draft-')?m.deletedEventIds:[...m.deletedEventIds.filter(id=>id!==eventId),eventId],
  }});
}

function togglePinnedRule(rule) {
  if(typeof rule==='string') try { rule=JSON.parse(rule); } catch { return; }
  const k=ruleKey(rule);
  const m=state.modal;
  const next=m.pinnedRuleKeys.includes(k)?m.pinnedRuleKeys.filter(x=>x!==k):[k,...m.pinnedRuleKeys];
  localStorage.setItem(PINNED_RULES_KEY,JSON.stringify(next));
  setState({modal:{...m,pinnedRuleKeys:next}});
}

function toggleBulkStudent(studentId) {
  const m=state.modal;
  const cur=m.selectedStudentIds;
  setState({modal:{...m,selectedStudentIds:cur.includes(studentId)?cur.filter(id=>id!==studentId):[...cur,studentId]}});
}

async function handleModalSave() {
  const m=state.modal;
  const draftAdditions=m.draftEvents.filter(e=>e.id.startsWith('draft-'));
  const hasChanges=draftAdditions.length>0||m.deletedEventIds.length>0;
  if(!hasChanges||m.isSaving) { closeModal(); return; }
  setState({modal:{...m,isSaving:true}});
  const additions=draftAdditions.map(({id:_,...ev})=>ev);
  await saveScoreChanges({additions,deletions:m.deletedEventIds});
  setState({editingStudentId:null,modal:{...state.modal,isSaving:false}});
}

function dismissToast(id) {
  setState({liveToasts:state.liveToasts.filter(t=>t.id!==id)});
}

function requestCreateWeek() {
  const {canCreateWeek}=getDerived();
  if(!canCreateWeek||state.isCreatingWeek) return;
  setState({createWeekConfirmOpen:true});
}

async function createNewWeek() {
  const {nextWeek,canCreateWeek}=getDerived();
  if(!canCreateWeek||state.isCreatingWeek) return;
  setState({createWeekConfirmOpen:false,isCreatingWeek:true});
  try {
    if(state.dataSource==='gas') {
      await fetchFromGas({action:'createWeek',week:String(nextWeek)});
      await loadScoreboardData(true);
    } else {
      setState({weeks:[...new Set([...state.weeks,nextWeek])].sort((a,b)=>a-b)});
    }
    setState({week:nextWeek,activeTab:'scoring',syncMessage:''});
  } catch { setState({syncMessage:`Không tạo được tuần ${nextWeek} trên Google Sheets.`}); }
  finally { setState({isCreatingWeek:false}); }
}

function resetData() {
  pendingSaveGuard=null;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(WEEK_STORAGE_KEY);
  if(state.dataSource==='gas') { loadScoreboardData(true); return; }
  setState({ students:mockStudents, events:mockScoreEvents, weeks:SCORE_WEEKS, week:1, weekSettings:[] });
  seenSignatures=new Set(mockScoreEvents.map(eventSignature));
  liveStartedAt=Date.now();
}

/* ============================================================
   GROUP DRAG-REORDER
   ============================================================ */
let groupDrag = null;

function startGroupDrag(e,groupNumber) {
  if(e.button!==0) return;
  e.preventDefault();
  groupDrag = { group:groupNumber, startX:e.clientX, currentX:e.clientX };
  document.addEventListener('mousemove',onGroupDragMove);
  document.addEventListener('mouseup',onGroupDragEnd);
}
function onGroupDragMove(e) {
  if(!groupDrag) return;
  groupDrag.currentX=e.clientX;
  const card=document.querySelector(`.ordered-group-card[data-group="${groupDrag.group}"]`);
  if(card) card.style.transform=`translate3d(${e.clientX-groupDrag.startX}px,-14px,0) scale(1.025)`;
}
function onGroupDragEnd(e) {
  if(!groupDrag) return;
  document.removeEventListener('mousemove',onGroupDragMove);
  document.removeEventListener('mouseup',onGroupDragEnd);
  const delta=e.clientX-groupDrag.startX;
  const cards=Array.from(document.querySelectorAll('.ordered-group-card'));
  const firstCard=cards[0], secondCard=cards[1];
  const cardW=firstCard?.getBoundingClientRect().width||280;
  const gap=firstCard&&secondCard?Math.max(0,secondCard.getBoundingClientRect().left-firstCard.getBoundingClientRect().right):14;
  const colSize=Math.max(1,cardW+gap);
  const offset=Math.round(delta/colSize);
  const draggedGroup=groupDrag.group;
  const next=normalizeOrder(state.groupOrder);
  const from=next.indexOf(draggedGroup);
  const to=Math.max(0,Math.min(next.length-1,from+offset));
  if(from!==to) { const [r]=next.splice(from,1); next.splice(to,0,r); }
  localStorage.setItem(GROUP_ORDER_KEY,JSON.stringify(next));
  groupDrag=null;

  // Chỉ ĐỔI VỊ TRÍ các node .ordered-group-card đã tồn tại sẵn trong DOM
  // (không gọi setState()/render() ở đây) — tránh phá huỷ + tạo lại toàn
  // bộ bảng của cả 4 tổ chỉ vì đổi thứ tự, vốn là nguyên nhân gây "nháy
  // như bấm render lại" khi kéo-thả đổi vị trí tổ.
  //
  // LƯU Ý: `next` là thứ tự ĐẦY ĐỦ 4 tổ (kể cả tổ đang bị `state.groupFilter`
  // ẩn khỏi lưới). Trước đây điều kiện đòi hỏi CẢ 4 tổ trong `next` phải có
  // card trong DOM — nên hễ đang lọc chỉ xem 1-2 tổ là rơi vào nhánh
  // fallback setState() → render() lại toàn bộ, đúng hiện tượng bị báo.
  // Sửa: chỉ cần các tổ ĐANG HIỂN THỊ trong lưới khớp đủ là dùng DOM-move,
  // không quan tâm tổ nào đang bị ẩn.
  const grid=document.getElementById('group-overview-grid');
  const visibleCards = grid ? Array.from(grid.querySelectorAll('.ordered-group-card[data-group]')) : [];
  const visibleGroups = new Set(visibleCards.map(c=>c.getAttribute('data-group')));
  const visibleOrder = next.filter(g=>visibleGroups.has(String(g)));
  const canDomMove = grid && visibleOrder.length===visibleGroups.size && visibleOrder.length>0;

  if(canDomMove) {
    state.groupOrder = next;
    visibleOrder.forEach(g=>{
      const card=grid.querySelector(`.ordered-group-card[data-group="${g}"]`);
      if(card) grid.appendChild(card); // di chuyển node có sẵn, không tạo mới
    });
    const draggedCard=grid.querySelector(`.ordered-group-card[data-group="${draggedGroup}"]`);
    if(draggedCard) draggedCard.style.transform='';
  } else {
    // Fallback: chỉ còn xảy ra khi lưới chưa tồn tại trong DOM hoàn toàn
    // (ví dụ đổi tab đúng lúc đang kéo). Không có cách nào tránh render()
    // ở đây vì không có gì để di chuyển — nhưng trường hợp này giờ không
    // còn xảy ra trong thao tác kéo-thả bình thường nữa.
    setState({groupOrder:next}, 'onGroupDragEnd:FALLBACK(canDomMove=false)');
  }
}

/* ============================================================
   LIVE POLLING
   ============================================================ */
function startLivePolling() {
  if(liveTimer) clearInterval(liveTimer);
  liveTimer=setInterval(async()=>{
    if(pollingActive||savingActive||state.editingStudentId||state.dataSource!=='gas') return;
    pollingActive=true;
    try {
      const remote=await fetchScoreboardFromGas(true);
      if(remote) applyRemoteData(remote,{silent:true,notify:true});
    } finally { pollingActive=false; }
  },LIVE_REFRESH_MS);
}

/* ============================================================
   PUBLIC INIT
   ============================================================ */
function initScoreboard(opts={}) {
  userRole  = opts.userRole  || 'hoc_sinh';
  userGroup = opts.userGroup || null;
  gasUrl    = opts.gasUrl    || null;

  // Apply accent / theme from desktop if available
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--desktop-accent').trim() || '#2563eb';
  document.documentElement.style.setProperty('--accent',accent);

  render();
  loadScoreboardData().then(()=>startLivePolling());

  // Sync accent if desktop changes theme
  window.addEventListener('storage',()=>{
    const newAccent = getComputedStyle(document.documentElement).getPropertyValue('--desktop-accent').trim();
    if(newAccent) document.documentElement.style.setProperty('--accent',newAccent);
  });
}

/* Auto-init when used standalone */
if(document.readyState==='loading') {
  document.addEventListener('DOMContentLoaded',()=>{
    if(document.getElementById('scoreboard-root')&&!window.__scoreboard_manual_init) {
      initScoreboard();
    }
  });
} else if(document.getElementById('scoreboard-root')&&!window.__scoreboard_manual_init) {
  initScoreboard();
}
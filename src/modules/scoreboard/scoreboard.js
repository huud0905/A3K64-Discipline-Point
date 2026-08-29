/* ============================================================
   A3K64 — Scoreboard App (vanilla JS port)
   ------------------------------------------------------------
   SYSTEM CORE
   Chịu trách nhiệm cho: hằng số/enum dùng chung, trạng thái ứng
   dụng (state), các hàm thuần (pure helpers), trạng thái suy ra
   (derived state / selectors), lớp lưu trữ cục bộ (localStorage/
   sessionStorage), lớp giao tiếp với Google Apps Script (GAS),
   nạp & đồng bộ dữ liệu, và lưu điểm (optimistic update + guard).

   KHÔNG thay đổi hành vi/nghiệp vụ so với bản gốc — chỉ tổ chức
   lại code, đặt tên rõ ràng hơn, gom các chuỗi/số "ma thuật" vào
   hằng số, và bổ sung xử lý lỗi tường minh (không còn "nuốt" lỗi
   trong catch{} rỗng — luôn log để dễ chẩn đoán khi có sự cố).

   Phần UI (render, build*, modal handlers, drag-reorder...) nằm
   phía dưới file này và giữ nguyên như bản gốc.
   ============================================================ */

/* ============================================================
   1. HẰNG SỐ / ENUM
   ============================================================ */

/** Khoá lưu trữ dùng trong localStorage / sessionStorage. */
const STORAGE_KEY           = 'scoreboard-local-events-v1';
const WEEK_STORAGE_KEY      = 'scoreboard-local-weeks-v1';
const DATA_CACHE_KEY        = 'a3k64-scoreboard-data-cache-v1';
const RULES_CACHE_KEY       = 'a3k64-rules-cache-v1'; // ghi/đọc bởi preload.js (A3K64Preload)
const SESSION_KEY           = 'a3k64-login-session-v1';
const PINNED_RULES_KEY      = 'a3k64-pinned-vi-pham-rules';
const GROUP_ORDER_KEY       = 'a3k64-overview-group-order-v2';

/** Thời gian / ngưỡng dùng trong đồng bộ dữ liệu. */
const DATA_CACHE_MAX_AGE_MS = 15 * 60 * 1000; // Cache còn dùng được tối đa 15 phút
const LIVE_REFRESH_MS       = 20000;         // Chu kỳ polling khi idle (tăng từ 7s → 20s)
const LIVE_REFRESH_MS_ACTIVE = 10000;        // Chu kỳ polling khi vừa có thao tác
const FRESH_EVENT_MARGIN_MS = 2500;          // Biên độ coi 1 sự kiện là "vừa xảy ra"
const SAVE_GUARD_MS         = 45000;         // Thời gian tối đa giữ optimistic update
const GAS_SAVE_TIMEOUT_MS   = 25000;         // Timeout khi lưu điểm lên GAS
const GAS_REFRESH_DELAY_MS  = 4000;          // PATCHED: 4s thay vì 9.5s — thấy kết quả nhanh hơn
const SAVE_DEDUPE_WINDOW_MS = 30000;         // Chặn gửi trùng yêu cầu lưu điểm

/** Vai trò người dùng (đồng bộ với normalizeRoleForScoreboard trong HTML host). */
const ROLE = {
  STUDENT:      'hoc_sinh',
  GROUP_LEADER: 'to_truong',
  CLASS_MONITOR:'lop_truong',
  SECRETARY:    'bi_thu',
  HOMEROOM:     'gvcn',
};
const FULL_ACCESS_ROLES = [ROLE.HOMEROOM, ROLE.CLASS_MONITOR, ROLE.SECRETARY];
const WEEK_CREATORS     = [ROLE.GROUP_LEADER, ROLE.HOMEROOM, ROLE.CLASS_MONITOR, ROLE.SECRETARY];

/** Phân loại điểm (điểm cộng/trừ) và nhóm nội dung chấm điểm. */
const SCORE_TYPE = { PLUS: 'CONG', MINUS: 'TRU' };
const CATEGORY = { STUDY: 'HOC_TAP', DISCIPLINE: 'NE_NEP', MOVEMENT: 'PHONG_TRAO' };

/** Xếp loại kết quả theo tổng điểm — ngưỡng giữ nguyên như bản gốc. */
const SCORE_STATUS = { GOOD: 'Tốt', FAIR: 'Khá', PASS: 'Đạt', FAIL: 'CĐ' };
const SCORE_STATUS_THRESHOLDS = [
  { min: 50,          status: SCORE_STATUS.GOOD },
  { min: 0,           status: SCORE_STATUS.FAIR },
  { min: -50,         status: SCORE_STATUS.PASS },
  { min: -Infinity,   status: SCORE_STATUS.FAIL },
];

/** Nguồn dữ liệu hiện tại của ứng dụng. */
const DATA_SOURCE = { LOADING: 'loading', GAS: 'gas', LOCAL: 'local', ERROR: 'error' };

const VALID_GROUPS = [1, 2, 3, 4];
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

/* ============================================================
   2. PERSISTENCE LAYER (localStorage / sessionStorage an toàn)
   ------------------------------------------------------------
   Mọi truy cập Web Storage đi qua đây để: (a) không bao giờ làm
   crash ứng dụng khi storage bị chặn/đầy/không khả dụng (chế độ
   ẩn danh, iframe bị hạn chế...), và (b) luôn log lỗi ra console
   thay vì "nuốt" lỗi trong catch{} rỗng như bản gốc.
   ============================================================ */
const SafeStorage = {
  /** Đọc 1 khoá dạng JSON. Trả về `fallback` nếu thiếu/hỏng/không đọc được. */
  readJSON(storage, key, fallback) {
    try {
      const raw = storage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      console.warn(`[SafeStorage] Không đọc được "${key}":`, err);
      return fallback;
    }
  },
  /** Ghi 1 khoá dạng JSON. Trả về true/false thay vì ném lỗi ra ngoài. */
  writeJSON(storage, key, value) {
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn(`[SafeStorage] Không ghi được "${key}":`, err);
      return false;
    }
  },
  remove(storage, key) {
    try {
      storage.removeItem(key);
      return true;
    } catch (err) {
      console.warn(`[SafeStorage] Không xoá được "${key}":`, err);
      return false;
    }
  },
};

function readLocalWeeks() {
  const w = SafeStorage.readJSON(localStorage, WEEK_STORAGE_KEY, SCORE_WEEKS);
  return (Array.isArray(w) && w.length) ? w : SCORE_WEEKS;
}
function readGroupOrder() {
  const saved = SafeStorage.readJSON(localStorage, GROUP_ORDER_KEY, null);
  return normalizeOrder(saved || [...VALID_GROUPS]);
}
function readSavedSessionUser() {
  return SafeStorage.readJSON(localStorage, SESSION_KEY, null)?.user || null;
}
function readSavedUserGroup() {
  const u=readSavedSessionUser();
  return parseGroup(u?.group)||parseGroup(u?.to);
}
function readSavedUserName() {
  const u=readSavedSessionUser();
  return String(u?.displayName||u?.hoten||u?.name||'').trim();
}

/* ============================================================
   3. DỮ LIỆU MẪU (mirrors mockScoreData.ts)
   ============================================================ */
const mockStudents = [
  { id:'s01', name:'Nguyễn Thị Hằng',  group:1 },
  { id:'s02', name:'Nguyễn Minh Thiện', group:1 },
  { id:'s03', name:'Nguyễn Ngọc Hiếu',  group:3 },
  { id:'s04', name:'Đinh Mạnh Hữu',     group:3, role:'Lớp trưởng' },
].map(s => ({ ...s, avatarInitial: lastNameInitial(s.name) }));

const mockScoreEvents = [];

/* ============================================================
   4. TRẠNG THÁI ỨNG DỤNG (state)
   ============================================================ */
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
  dataSource: DATA_SOURCE.LOADING,
  editingStudentId: null,
  createWeekConfirmOpen: false,
  isCreatingWeek: false,
  groupOrder: readGroupOrder(),
  mobileFilterOpen: false,
};

/** Cấu hình do initScoreboard() truyền vào (vai trò, tổ, URL Apps Script). */
let userRole = ROLE.STUDENT;
let userGroup = null;
let gasUrl = null;
/** Danh tính người chấm điểm hiện tại — gửi kèm mỗi request lưu điểm để
 *  api.gs ghi đúng người vào cột "Người chỉnh sửa", thay vì fallback "Web". */
let userEmail = null;
let userName = null;

/** Cờ / bộ nhớ tạm dùng cho polling & lưu điểm — không thuộc `state` vì
 *  không cần kích hoạt render() khi thay đổi. */
let liveTimer = null;
let seenSignatures = new Set();
let liveStartedAt = Date.now();
let pollingActive = false;
let savingActive  = false;
let lastActivityAt = Date.now(); // Thời điểm có thao tác gần nhất (dùng cho adaptive polling)
let pendingSaveGuard = null;
let lastSaveSignature = null;
let lastSaveAt = 0;
let cachedRules = null;

/* ============================================================
   5. HÀM THUẦN (PURE HELPERS)
   ============================================================ */
function lastNameInitial(name) {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length-1]?.[0] || name[0] || '?').toUpperCase();
}
function givenName(fullName) {
  const p = fullName.trim().split(/\s+/);
  return p[p.length-1] || fullName;
}
function normalizeRole(r) { return String(r || ROLE.STUDENT).trim().toLowerCase(); }
function parseGroup(v) {
  const n = Number(String(v ?? '').replace(/[^0-9]/g,''));
  return VALID_GROUPS.includes(n) ? n : null;
}
function normalizeOrder(order) {
  const valid = order.filter((g,i,l)=>VALID_GROUPS.includes(g)&&l.indexOf(g)===i);
  return [...valid, ...VALID_GROUPS.filter(g=>!valid.includes(g))];
}
function eventSignature(ev) {
  return [ev.studentId,ev.week,ev.title,ev.points,ev.type,ev.category,ev.note||'',ev.createdBy||''].join('|');
}
// FIX (thêm điểm bị x2 trên UI): chuẩn hoá text (Unicode NFC + gộp
// khoảng trắng thừa + trim) trước khi so khớp. Trước đây so ev.title
// bằng chuỗi thô — nếu server trả lại title với dạng Unicode tổ hợp
// khác (vd. dấu tiếng Việt ở dạng NFD thay vì NFC sau khi qua Google
// Sheets) hoặc lệch 1 khoảng trắng, 2 chuỗi NHÌN GIỐNG HỆT NHAU nhưng
// so sánh === lại ra false → guard tưởng dòng vừa lưu CHƯA có trên
// server, nên giữ lại bản ghi optimistic cục bộ CHỒNG lên bản ghi thật
// đã có trên server → hiển thị 2 dòng giống hệt nhau dù backend chỉ
// ghi nhận ĐÚNG 1 dòng duy nhất.
function normTitleForMatch(t) {
  return String(t || '').normalize('NFC').replace(/\s+/g, ' ').trim();
}
// Dùng để so khớp "sự kiện vừa lưu đã có trên server chưa" (save guard).
// CHỈ gồm các trường được bảo toàn CHÍNH XÁC qua vòng ghi/đọc lại sheet:
// studentId, week, title, points. KHÔNG gồm category/note — vì
// cellEvents() ở api.gs luôn tái tạo note="" và tự đoán lại category từ
// text tiêu đề (không giữ nguyên giá trị gốc client gửi lên). Nếu đưa
// note/category vào đây, một event có note khác rỗng (vd. các dòng do AI
// tự tính điểm tạo ra, note='AI Auto-Parsing') sẽ KHÔNG BAO GIỜ khớp được
// với chính nó sau khi lưu — khiến guard luôn coi là "chưa có trên server"
// và hiển thị trùng dòng đó trên UI cho tới khi guard hết hạn sau 45s.
// CŨNG BỎ `type` khỏi khoá so khớp — type luôn được suy ra 1-1 từ dấu
// của points (points>=0 → CONG, ngược lại → TRU) ngay tại nơi tạo
// optimistic event, nên so thêm type chỉ tạo thêm 1 điểm có thể lệch
// (vd. nếu server tự suy lại type theo cách khác) mà không thêm được
// thông tin gì mới — dùng title đã chuẩn hoá là đủ định danh nội dung.
function scoreContentSig(ev) {
  return [ev.studentId,ev.week,normTitleForMatch(ev.title),ev.points].join('|');
}
function eventTime(ev) { const t=Date.parse(ev.createdAt||''); return isFinite(t)?t:0; }
function formatThousands(n) { return Math.abs(Math.trunc(n || 0)).toLocaleString('vi-VN'); }
function formatScore(p) {
  const n = Math.trunc(p || 0);
  if (n > 0) return `+${formatThousands(n)}`;
  if (n < 0) return `-${formatThousands(n)}`;
  return '0';
}
function categoryLabel(c) {
  if(c===CATEGORY.STUDY) return 'Học tập';
  if(c===CATEGORY.DISCIPLINE) return 'Nề nếp';
  return 'Phong trào';
}
/** Xếp loại theo tổng điểm, dùng chung 1 bảng ngưỡng (SCORE_STATUS_THRESHOLDS)
 *  thay vì if/else lặp lại — ngưỡng và kết quả giữ nguyên như bản gốc. */
function getScoreStatus(total) {
  const match = SCORE_STATUS_THRESHOLDS.find(t => total >= t.min);
  return match ? match.status : SCORE_STATUS.FAIL;
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
  const sp=category===CATEGORY.STUDY?`: [${subject}]`:'';
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
   6. TỔNG HỢP / THỐNG KÊ (SUMMARIZE / STATS)
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
  return VALID_GROUPS.map(group=>{
    const members=summaries.filter(s=>s.group===group);
    const total=members.reduce((s,m)=>s+m.total,0);
    const average=members.length?Math.round(total/members.length):0;
    const good=members.filter(m=>m.status===SCORE_STATUS.GOOD||m.status===SCORE_STATUS.FAIR).length;
    const warning=members.filter(m=>m.status===SCORE_STATUS.FAIL).length;
    return { group, label:`Tổ ${group}`, total, average, good, warning, members };
  });
}

/* ============================================================
   7. DERIVED STATE (selectors suy ra từ `state` + quyền hạn)
   ============================================================ */
function getDerived() {
  const role = normalizeRole(userRole);
  const hasFullAccess  = FULL_ACCESS_ROLES.includes(role);
  const isGroupLeader  = role===ROLE.GROUP_LEADER;
  const isStudentOnly  = role===ROLE.STUDENT;
  const canUseScoringTab = hasFullAccess||isGroupLeader;
  const canCreateWeek  = WEEK_CREATORS.includes(role);
  const ugn = parseGroup(userGroup)||readSavedUserGroup();

  const curWeekSetting = state.weekSettings.find(w=>Number(w.week)===Number(state.week));
  const lockedForLeader = isGroupLeader&&Boolean(curWeekSetting?.locked);
  const permNote = lockedForLeader ? `Tuần ${state.week} đã quá hạn chấm điểm${curWeekSetting?.start||curWeekSetting?.end?` (${curWeekSetting?.start||'?'} → ${curWeekSetting?.end||'?'})`:''}. Chỉ khóa nút Sửa, vẫn có thể xem bảng chấm.` : '';
  const highlightName = role===ROLE.HOMEROOM?'':readSavedUserName();
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
  const goodCount  = groupFiltered.filter(s=>s.status===SCORE_STATUS.GOOD||s.status===SCORE_STATUS.FAIR).length;
  const warnCount  = groupFiltered.filter(s=>s.status===SCORE_STATUS.FAIL).length;
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
   8. GAS API (Google Apps Script backend, qua fetch)
   ============================================================ */

/**
 * Gọi Google Apps Script bằng GET + query params.
 * Trả về JSON đã parse, hoặc `null` nếu chưa cấu hình gasUrl, lỗi mạng,
 * hoặc phản hồi không phải JSON hợp lệ. Lỗi luôn được log để dễ chẩn đoán,
 * thay vì bị "nuốt" âm thầm như bản gốc.
 */
async function fetchFromGas(params={}) {
  if(!gasUrl) return null;
  try {
    const url = new URL(gasUrl);
    Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));
    url.searchParams.set('t',String(Date.now()));
    const res = await fetch(url.toString(),{method:'GET',redirect:'follow'});
    if (!res.ok) {
      console.warn(`[fetchFromGas] HTTP ${res.status} cho action="${params.action||'?'}"`);
    }
    return await res.json();
  } catch (err) {
    console.warn(`[fetchFromGas] Lỗi khi gọi action="${params.action||'?'}":`, err);
    return null;
  }
}

async function fetchScoreboardFromGas(force=false) {
  const json = await fetchFromGas({action:'getScoreboard'});
  if(!json) return null;
  return normalizeScoreboardPayload(json);
}

/**
 * Chuẩn hoá dữ liệu scoreboard nhận từ GAS về đúng 1 shape cố định
 * {students, events, weeks, weekSettings} (luôn là mảng, không bao giờ
 * undefined). Một số action (vd. saveScoreChanges) trả dữ liệu lồng trong
 * `data.scoreboard` thay vì để phẳng ở `data` — nếu không chuẩn hoá,
 * applyRemoteData() sẽ đọc remote.weeks/remote.students là undefined và
 * crash ("Cannot read properties of undefined (reading 'length')") ngay
 * sau khi lưu điểm.
 */
function normalizeScoreboardPayload(json) {
  const data = json?.data || json || {};
  const source = Array.isArray(data.weeks) || Array.isArray(data.students)
    ? data
    : (data.scoreboard || data);
  return {
    students: Array.isArray(source?.students)?source.students:[],
    events:   Array.isArray(source?.events)?source.events:[],
    weeks:    Array.isArray(source?.weeks)?source.weeks:[],
    weekSettings: Array.isArray(source?.weekSettings)?source.weekSettings:[],
  };
}

function normalizeRuleType(rawType, rawPoints) {
  if (rawType === SCORE_TYPE.PLUS || rawType === SCORE_TYPE.MINUS) return rawType;
  return rawPoints >= 0 ? SCORE_TYPE.PLUS : SCORE_TYPE.MINUS;
}
function normalizeRuleCategory(rawCategory) {
  if (rawCategory.includes('NỀ') || rawCategory.includes('NE')) return CATEGORY.DISCIPLINE;
  if (rawCategory.includes('PHONG')) return CATEGORY.MOVEMENT;
  return CATEGORY.STUDY;
}

function normalizeRulesRaw(raw) {
  if(!Array.isArray(raw)) return [];
  return raw.map(item=>{
    const title = String(item.title||item['Tên']||item.ten||'').trim();
    const rawPt = Number(item.points||item['Điểm']||item.diem||0);
    if(!title||!isFinite(rawPt)) return null;
    const type = normalizeRuleType(String(item.type||item['Tính']||item.tinh||'').toUpperCase(), rawPt);
    const category = normalizeRuleCategory(String(item.category||item['Phân loại']||item.phanloai||'').toUpperCase());
    const points = type===SCORE_TYPE.MINUS?-Math.abs(rawPt):Math.abs(rawPt);
    return { title, points, type, category, note:String(item.note||item['Ghi chú']||item.ghichu||'').trim()||undefined };
  }).filter(Boolean);
}

/** Đọc rules raw (chưa normalize) mà preload.js đã ghi sẵn vào RULES_CACHE_KEY. */
function readRulesRawCache() {
  // Thử sessionStorage trước (cùng tab); fallback localStorage (từ preload ở tab login)
  const parsed = SafeStorage.readJSON(sessionStorage, RULES_CACHE_KEY, null)
              || SafeStorage.readJSON(localStorage,   RULES_CACHE_KEY, null);
  if(!parsed||!Array.isArray(parsed.raw)||!parsed.savedAt) return null;
  if(Date.now()-parsed.savedAt > DATA_CACHE_MAX_AGE_MS) return null;
  return parsed.raw;
}
function writeRulesRawCache(raw) {
  SafeStorage.writeJSON(sessionStorage, RULES_CACHE_KEY, { savedAt: Date.now(), raw });
}

async function fetchRulesFromGas() {
  if(cachedRules) return cachedRules;

  // Preload.js (chạy ngay sau login) có thể đã fetch getRules từ trước —
  // dùng ngay cache đó, khỏi phải gọi GAS lại và chờ round-trip.
  const cachedRaw = readRulesRawCache();
  if(cachedRaw) {
    cachedRules = normalizeRulesRaw(cachedRaw);
    return cachedRules;
  }

  const json = await fetchFromGas({action:'getRules'});
  if(!json) return [];
  const data = json?.data||json;
  const raw  = data?.rules||data?.quickScoreReasons||data;
  if(!Array.isArray(raw)) return [];
  writeRulesRawCache(raw);
  cachedRules = normalizeRulesRaw(raw);
  return cachedRules;
}

/* ============================================================
   9. DATA CACHE (tải nhanh lần mở đầu, tránh chờ Google Apps Script)
   ============================================================ */
function readDataCache() {
  // Thử sessionStorage trước (cùng tab); fallback localStorage (từ preload ở tab login)
  const parsed = SafeStorage.readJSON(sessionStorage, DATA_CACHE_KEY, null)
              || SafeStorage.readJSON(localStorage,   DATA_CACHE_KEY, null);
  if(!parsed||!parsed.remote||!parsed.savedAt) return null;
  if(Date.now()-parsed.savedAt > DATA_CACHE_MAX_AGE_MS) return null;
  return parsed.remote;
}
function writeDataCache(remote) {
  SafeStorage.writeJSON(sessionStorage, DATA_CACHE_KEY, { savedAt: Date.now(), remote });
}

/* ============================================================
   10. NẠP DỮ LIỆU (DATA LOADING)
   ============================================================ */
async function loadScoreboardData(force=false) {
  // Nếu có dữ liệu cache còn mới, hiển thị ngay lập tức (không phải chờ
  // mạng/GAS) rồi vẫn âm thầm tải bản mới nhất ở nền để cập nhật khi xong.
  const cached = force ? null : readDataCache();
  if(cached) {
    applyRemoteData(cached, {silent:true,notify:false});
    seenSignatures = new Set(cached.events.map(eventSignature));
    liveStartedAt = Date.now();
  } else {
    setState({dataSource:DATA_SOURCE.LOADING});
  }

  const remote = await fetchScoreboardFromGas(force);
  if(!remote) {
    if(!cached) {
      const localEvents = SafeStorage.readJSON(localStorage, STORAGE_KEY, mockScoreEvents);
      _notify('Đang dùng dữ liệu cục bộ. Chưa cấu hình hoặc chưa đọc được Google Apps Script.', 'warn');
      setState({
        students: mockStudents, events: localEvents, weeks: readLocalWeeks(),
        weekSettings: [], dataSource: DATA_SOURCE.LOCAL,
      });
      seenSignatures = new Set(localEvents.map(eventSignature));
      liveStartedAt = Date.now();
    }
    return;
  }
  writeDataCache(remote);
  applyRemoteData(remote, {silent:false,notify:false});
  liveStartedAt = Date.now();
}

function applyRemoteData(remote, opts={}) {
  remote = {
    students: Array.isArray(remote?.students)?remote.students:[],
    events:   Array.isArray(remote?.events)?remote.events:[],
    weeks:    Array.isArray(remote?.weeks)?remote.weeks:[],
    weekSettings: Array.isArray(remote?.weekSettings)?remote.weekSettings:[],
  };
  let nextEvents = remote.events;
  const guard = pendingSaveGuard;
  if(guard) {
    if(guard.expiresAt<Date.now()) pendingSaveGuard=null;
    else if(remoteContainsSavedChanges(nextEvents,guard)) pendingSaveGuard=null;
    else nextEvents=mergeGuardedEvents(nextEvents,guard);
  }
  const nextWeeks = remote.weeks.length?remote.weeks:[state.week||1];
  // Đã BỎ live-toast (thông báo xanh chi tiết khi polling phát hiện dữ liệu
  // mới) theo yêu cầu — chỉ dùng thông báo ngắn gọn từ notifyScoreEdit() lúc
  // lưu điểm (xem saveScoreChanges). Việc dò "sự kiện mới nhất" qua polling
  // từng gây hiện nhầm thông báo của học sinh khác không liên quan tới lượt
  // sửa vừa broadcast.
  seenSignatures = new Set(nextEvents.map(eventSignature));
  const nw = nextWeeks.includes(state.week)?state.week:nextWeeks[0]||1;
  if (!remote.students.length && !opts.silent) {
    _notify('Không đọc được học sinh trong sheet TUẦN hiện tại.', 'warn');
  }

  // Polling (LIVE_REFRESH_MS) gọi applyRemoteData() liên tục dù dữ liệu
  // không hề đổi — trước đây setState() vẫn chạy mỗi lần, khiến toàn bộ
  // app bị render lại (phá huỷ + tạo lại toàn bộ bảng) mỗi 7 giây dù
  // chẳng có gì thay đổi. Giờ chỉ setState() khi dữ liệu THỰC SỰ khác.
  const unchanged = state.dataSource===DATA_SOURCE.GAS
    && nw===state.week
    && sameEventSet(state.events, nextEvents)
    && sameStudentSet(state.students, remote.students)
    && sameWeekList(state.weeks, nextWeeks)
    && JSON.stringify(state.weekSettings||[])===JSON.stringify(remote.weekSettings||[]);
  if(unchanged) return;

  // Cập nhật cache ngay sau khi áp dữ liệu mới — kể cả khi gọi từ
  // saveScoreChanges (sau xoá/thêm). Trước đây chỉ writeDataCache() trong
  // loadScoreboardData() nên cache giữ nguyên bản cũ sau mỗi lần lưu,
  // khiến reload trang / mở lại window vẫn hiện dữ liệu chưa xoá.
  writeDataCache({ students: remote.students, events: nextEvents, weeks: nextWeeks, weekSettings: remote.weekSettings||[] });

  setState({
    students: remote.students, events: nextEvents, weeks: nextWeeks,
    weekSettings: remote.weekSettings||[], week: nw,
    dataSource: DATA_SOURCE.GAS,
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
// Khoá theo NỘI DUNG thuần (không gồm type/category/note) — dùng riêng cho
// việc xoá, vì ID sự kiện hiện được backend sinh THEO VỊ TRÍ dòng trong ô
// (`w{tuần}r{dòng}{p|m}_{chỉ số}`). Xoá 1 dòng không phải dòng cuối sẽ làm
// TOÀN BỘ id của các dòng phía sau bị đánh số lại → nếu so khớp theo id cũ,
// dòng đứng sau (khác nội dung) có thể "thừa hưởng" đúng id vừa xoá, khiến
// guard tưởng nhầm là chưa xoá được (hoặc xoá nhầm dòng đó khỏi UI).
function delContentKey(d) { return [d.studentId, d.week, normTitleForMatch(d.title), d.points].join('|'); }
function countByDelKey(evs) {
  const m=new Map();
  evs.forEach(e=>{ const k=delContentKey(e); m.set(k,(m.get(k)||0)+1); });
  return m;
}
function remoteContainsSavedChanges(remoteEvs,guard) {
  const counts=scoreContentCounts(remoteEvs);
  const addOk=guard.additions.every(e=>{ const k=scoreContentSig(e); const l=counts.get(k)||0; if(l<=0) return false; counts.set(k,l-1); return true; });

  // So số lượng theo nội dung TRƯỚC/SAU khi lưu — không dùng id. Với mỗi nội
  // dung cần xoá, số lượng còn lại ở remote phải giảm đúng bằng số lần yêu
  // cầu xoá nội dung đó (đề phòng có nhiều dòng trùng y hệt nhau).
  const wantGone = new Map();
  (guard.deletions||[]).forEach(d=>{ if(!d.title||!isFinite(d.points)) return; const k=delContentKey(d); wantGone.set(k,(wantGone.get(k)||0)+1); });
  const remoteCounts = countByDelKey(remoteEvs);
  let delOk = true;
  wantGone.forEach((wantCount,k)=>{
    const before = guard.beforeDelCounts?.get(k)||0;
    const after  = remoteCounts.get(k)||0;
    if(before-after < wantCount) delOk = false;
  });
  // Các mục xoá kiểu cũ chỉ có id (không có title/points — không thể xác
  // minh theo nội dung) — coi như đã xử lý xong ngay, không giữ guard mãi.
  return addOk && delOk;
}
function mergeGuardedEvents(remoteEvs,guard) {
  const counts=scoreContentCounts(remoteEvs);
  // Ẩn tạm (ở mức UI) đúng SỐ LƯỢNG dòng theo nội dung đang chờ xoá — không
  // xoá theo id vì id có thể đã bị đánh lại cho một dòng khác.
  const dropBudget = new Map();
  (guard.deletions||[]).forEach(d=>{ if(!d.title||!isFinite(d.points)) return; const k=delContentKey(d); dropBudget.set(k,(dropBudget.get(k)||0)+1); });
  const guarded = remoteEvs.filter(e=>{
    const k=delContentKey(e);
    const left=dropBudget.get(k)||0;
    if(left>0){ dropBudget.set(k,left-1); return false; }
    return true;
  });
  const missing=[];
  guard.additions.forEach(e=>{ const k=scoreContentSig(e); const l=counts.get(k)||0; if(l>0) counts.set(k,l-1); else missing.push(e); });
  return [...missing,...guarded];
}

/* ============================================================
   11. LƯU ĐIỂM (SAVE SCORE) — optimistic update + save guard
   ============================================================ */

/** Xây dựng chữ ký (signature) duy nhất cho 1 lượt lưu, dùng để chặn gửi
 *  trùng nếu người dùng bấm Lưu nhiều lần liên tiếp cho cùng nội dung. */
function buildSaveRequestSignature(allowedAdditions, deletionDescriptors) {
  return JSON.stringify({
    a: allowedAdditions.map(e=>[e.studentId,e.week,e.title,e.points]).sort(),
    d: deletionDescriptors.map(d=>[d.studentId,d.week,d.title,d.points]).sort(),
  });
}

async function saveScoreChanges(changes) {
  const { additions, deletions } = changes;
  const deletionDescriptors = (deletions || []).map(d => typeof d === 'string' ? { id: d } : d);
  const delSet = new Set(deletionDescriptors.map(d => d.id).filter(Boolean));
  const { rawSummaries, canEditStudent } = getDerived();
  const allowed = additions.filter(e => {
    const st = rawSummaries.find(s => s.id === e.studentId);
    return st && canEditStudent(st);
  });
  const optimistic = allowed.map((e, i) => ({
    ...e,
    id: `local-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
    createdAt: e.createdAt || new Date().toISOString(),
  }));
  if (!optimistic.length && !deletionDescriptors.length) return;

  const signature = buildSaveRequestSignature(allowed, deletionDescriptors);
  if (savingActive && signature === lastSaveSignature && (Date.now() - lastSaveAt) < SAVE_DEDUPE_WINDOW_MS) {
    _notify('Yêu cầu này đang được gửi rồi, vui lòng đợi vài giây...', 'warn');
    return;
  }
  lastSaveSignature = signature;
  lastSaveAt = Date.now();

  const prevEvents = state.events;
  const nextEvents = [...optimistic, ...state.events.filter(e => !delSet.has(e.id))];
  const beforeDelCounts = countByDelKey(prevEvents);
  pendingSaveGuard = {
    additions: optimistic,
    deletions: deletionDescriptors,
    beforeDelCounts,
    expiresAt: Date.now() + SAVE_GUARD_MS
  };
  setState({ events: nextEvents });
  if (state.dataSource !== DATA_SOURCE.GAS) return;

  savingActive = true;
  markActivity();
  try {
    const body = JSON.stringify({
      action: 'saveScoreChanges',
      additions: optimistic,
      deletions: deletionDescriptors,
      actorEmail: userEmail || undefined,
      actorName: userName || undefined,
    });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GAS_SAVE_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(gasUrl, { method: 'POST', body, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
    const json = await res.json();

    if (json?.ok === false) {
      throw new Error(json.error || 'Máy chủ từ chối lưu điểm (không rõ lý do).');
    }
    if (!json?.data) {
      throw new Error('Không nhận được xác nhận đã lưu từ máy chủ — có thể chưa ghi được vào Google Sheets.');
    }

    // Xoá guard TRƯỚC khi áp data từ response — server đã xác nhận lưu thành
    // công nên guard không còn cần thiết. Nếu giữ guard lúc này, applyRemoteData
    // sẽ gọi mergeGuardedEvents() và thêm lại bản ghi optimistic ĐÈ LÊN bản ghi
    // thật server vừa trả về → hiển thị x2 dù backend chỉ ghi đúng 1 dòng.
    pendingSaveGuard = null;

    // Áp data từ response ngay lập tức
    applyRemoteData(normalizeScoreboardPayload(json), { silent: true, notify: false });

    // Broadcast cho người dùng khác
    // Chỉ dùng thông báo ngắn gọn kiểu "X vừa sửa điểm của Y" — không kèm
    // chi tiết mục/điểm. Gom theo từng HỌC SINH duy nhất (không phải từng
    // dòng điểm) để nếu 1 lượt lưu có nhiều mục cho cùng 1 học sinh thì vẫn
    // chỉ có 1 thông báo cho học sinh đó, không lặp lại.
    if (optimistic.length) {
      const actor = userName || 'Ai đó';
      const uniqueStudentIds = [...new Set(optimistic.map(ev => ev.studentId))];
      uniqueStudentIds.forEach(sid => {
        const sn = state.students.find(s => s.id === sid)?.name || 'học sinh';
        notifyScoreEdit(actor, sn);
      });
    }

    // Báo lỗi xóa không khớp
    const unmatched = json?.data?.unmatchedDeletions;
    if (Array.isArray(unmatched) && unmatched.length) {
      pendingSaveGuard = null;
      const names = unmatched
        .map(u => `${u.title} (${u.points > 0 ? '+' : ''}${u.points})`)
        .join(', ');
      _notify(
        `Không xoá được: ${names}. Dữ liệu trên Sheet đã thay đổi — vui lòng tải lại và xoá lại.`,
        'error'
      );
    }

    // PATCHED: nếu response đã có đủ data → pull nhẹ (cache=true) sau 4s
    //          nếu response thiếu data (hiếm) → pull force sau 4s
    const freshFromResponse = normalizeScoreboardPayload(json);
    const responseHasData = Array.isArray(freshFromResponse.students)
      && freshFromResponse.students.length > 0;

    setTimeout(async () => {
      const fresh = await fetchScoreboardFromGas(!responseHasData);
      if (fresh) applyRemoteData(fresh, { silent: true, notify: false });
    }, GAS_REFRESH_DELAY_MS);

  } catch (err) {
    console.error('[saveScoreChanges] Lưu điểm thất bại, đã hoàn tác:', err);
    pendingSaveGuard = null;
    const timedOut = err?.name === 'AbortError';
    _notify(
      timedOut
        ? `Google Sheets phản hồi quá lâu (>${GAS_SAVE_TIMEOUT_MS / 1000}s). Đã hoàn tác, vui lòng thử lưu lại.`
        : String(err?.message || 'Không lưu được lên Google Sheets. Đã hoàn tác.'),
      'error'
    );
    setState({ events: prevEvents });
  } finally {
    savingActive = false;
  }
}

/* ============================================================
   12. TOAST — helper thống nhất cho toàn bộ scoreboard
   ============================================================ */

/**
 * _notify(message, type?)
 * Hiển thị toast nổi qua A3Notify (pill trong iframe) VÀ
 * bridge lên desktop notification center qua postMessage.
 * type: 'success' | 'error' | 'warn' | 'info'  (mặc định 'info')
 */
function _notify(message, type) {
  type = type || 'info';
  const msg = String(message || '');
  if (!msg) return;
  if (window.A3Notify) window.A3Notify.show(msg, { type });
  try {
    window.parent.postMessage({ type: 'a3k64-notif', title: 'Bảng điểm', body: msg }, '*');
  } catch(e) {}
}

/* ── Toast khi có điểm mới từ polling live ──
   GHI CHÚ: không còn được gọi ở đâu (đã tắt live-toast trong applyRemoteData
   theo yêu cầu — chỉ dùng thông báo ngắn gọn từ notifyScoreEdit()). Giữ lại
   hàm này phòng khi cần bật lại, không xoá để tránh vỡ chỗ khác lỡ còn gọi. */
function showLiveToast(toast) {
  const type = toast.points !== undefined ? (toast.points >= 0 ? 'success' : 'error') : 'info';
  _notify(toast.message || '', type);
}

/* ── Broadcast khi lưu điểm ──
   TRƯỚC ĐÂY: gọi _notify() — hàm này CHỈ hiện pill cục bộ (A3Notify.show)
   và postMessage lên window.parent (chỉ trong cùng 1 trình duyệt). Nó
   KHÔNG bao giờ gửi gì lên GAS, nên các thiết bị/người dùng khác không
   bao giờ nhận được thông báo "vừa sửa điểm" dù backend (api.gs, action
   pushBroadcast/getBroadcasts) đã hỗ trợ đầy đủ.
   SỬA: gọi thẳng A3Notify.broadcast() kèm `gasUrl` của chính scoreboard
   này — không dựa vào A3Notify.gasUrl toàn cục, vì iframe scoreboard có
   instance `window.A3Notify` RIÊNG với context của desktop.js, nên
   _initNotify() bên desktop set gasUrl không hề lan được vào trong đây. */
function notifyScoreEdit(actorName, studentName) {
  const message = `${actorName || 'Ai đó'} vừa sửa điểm của ${studentName || 'học sinh'}`;
  // SỬA: KHÔNG gọi _notify() ở đây nữa — A3Notify.broadcast() bên dưới đã tự
  // hiện pill cục bộ cho tab hiện tại (bước 1 trong notify.js). Gọi cả hai
  // là nguyên nhân khiến người sửa thấy pill hiện 2 lần cho cùng 1 lần lưu
  // (kết hợp với việc client tự poll lại broadcast của chính mình → thành 3 lần).
  if (!gasUrl) {
    // Không có gasUrl (không cross-device được) → vẫn cần hiện pill cục bộ.
    _notify(message, 'info');
    return;
  }
  if (window.A3Notify && typeof window.A3Notify.broadcast === 'function') {
    window.A3Notify.broadcast(message, { type: 'info', gasUrl: gasUrl, frameSource: 'scoreboard' });
  } else {
    // Fallback: A3Notify không có broadcast() → tự hiện pill cục bộ + gọi thẳng GAS
    _notify(message, 'info');
    try {
      fetch(gasUrl + '?action=pushBroadcast&message=' +
        encodeURIComponent(message) + '&notifType=info&ts=' + Date.now(),
        { method: 'GET', redirect: 'follow' }
      ).catch(function(){});
    } catch(e) {}
  }
}


/* ============================================================
   13. STATE & RENDER WIRING
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
                <td><span class="status-pill status-${statusClass(s.status)}">${s.status}</span></td>
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

  // Full scoring table — PC: bảng ngang như cũ; Mobile: card layout dọc
  const tableRows = students.map((s,idx)=>{
    const editable=canEditStudent?canEditStudent(s):false;
    const vis=s.events.filter(e=>!isSheetTotalEvent(e));
    const plus=vis.filter(e=>e.points>0);
    const minus=vis.filter(e=>e.points<0);
    const vpos=plus.reduce((a,e)=>a+e.points,0);
    const vneg=minus.reduce((a,e)=>a+e.points,0);
    const isCur=highlightName&&normalizeVi(s.name)===normalizeVi(highlightName);
    return { s, idx, editable, plus, minus, vpos, vneg, isCur };
  });

  return `
    <section class="score-panel student-table-panel">
      ${title?`<div class="table-title">${title}</div>`:''}

      <!-- PC: bảng ngang — ẩn trên mobile -->
      <div class="score-table-wrap score-detail-desktop-only">
        <table class="score-table score-detail-table">
          <thead><tr>
            <th>STT</th><th>Học sinh</th><th>Cộng (+)</th><th>Điểm +</th>
            <th>Trừ (-)</th><th>Điểm -</th><th>Tổng</th><th>Xếp loại</th><th>Sửa</th>
          </tr></thead>
          <tbody>
            ${tableRows.map(({s,idx,editable,plus,minus,vpos,vneg,isCur})=>`
              <tr class="${!editable?'readonly-student-row':''} ${isCur?'current-user-row':''}">
                <td class="table-index">${idx+1}</td>
                <td class="student-cell">
                  <button type="button" class="student-name-button detail-name"
                    ${editable?`onclick="openStudent('${s.id}')"`:''}
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
                <td><span class="status-pill status-${statusClass(s.status)}">${s.status}</span></td>
                <td>
                  <button class="edit-score-button" type="button"
                    ${editable?`onclick="openStudent('${s.id}')"`:''}
                    ${!editable||!onEdit?'disabled':''}
                    title="${editable?'Sửa điểm':'Bạn không có quyền'}">
                    ${Icons.pencil}
                  </button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <!-- Mobile: card layout dọc — ẩn trên PC -->
      <div class="score-card-list score-detail-mobile-only">
        ${tableRows.map(({s,idx,editable,plus,minus,vpos,vneg,isCur})=>`
          <div class="score-student-card ${!editable?'readonly-student-row':''} ${isCur?'current-user-row':''}">
            <div class="ssc-top">
              <div class="ssc-left">
                <span class="ssc-stt">${idx+1}</span>
                <div class="ssc-nameblock">
                  <button type="button" class="student-name-button ssc-name"
                    ${editable?`onclick="openStudent('${s.id}')"`:''}
                    ${!editable?'disabled':''}>
                    ${s.name}
                  </button>
                  <span class="student-role">Tổ ${s.group}${s.role?` · ${s.role}`:''}</span>
                </div>
              </div>
              <button class="edit-score-button ssc-edit" type="button"
                ${editable?`onclick="openStudent('${s.id}')"`:''}
                ${!editable||!onEdit?'disabled':''}
                title="${editable?'Sửa điểm':'Bạn không có quyền'}">
                ${Icons.pencil}
              </button>
            </div>
            <div class="ssc-scores">
              <div class="ssc-score-item">
                <span class="ssc-score-label">Cộng</span>
                <span class="ssc-score-val score-positive">${vpos>0?formatScore(vpos):'0'}</span>
              </div>
              <div class="ssc-score-divider"></div>
              <div class="ssc-score-item">
                <span class="ssc-score-label">Trừ</span>
                <span class="ssc-score-val score-negative">${vneg<0?formatScore(vneg):'0'}</span>
              </div>
              <div class="ssc-score-divider"></div>
              <div class="ssc-score-item">
                <span class="ssc-score-label">Tổng</span>
                <span class="ssc-score-val ${s.total>=0?'score-positive':'score-negative'}">${formatScore(s.total)}</span>
              </div>
              <span class="status-pill status-${statusClass(s.status)} ssc-badge">${s.status}</span>
            </div>
            ${(plus.length||minus.length)?`
              <div class="ssc-tags">
                ${plus.map(e=>`<span class="event-line event-plus">${e.title}</span>`).join('')}
                ${minus.map(e=>`<span class="event-line event-minus">${e.title}</span>`).join('')}
              </div>`:`<div class="ssc-tags"><span class="muted-dash" style="font-size:12px">Chưa có điểm</span></div>`
            }
          </div>`).join('')}
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
  const mobOpen=!!state.mobileFilterOpen;
  return `
    <aside class="scoreboard-left-tools${mobOpen?' sidebar-mobile-open':''}">
      <div class="left-tools-title">
        <div class="left-tools-title-row">
          <div>
            <span>A3K64</span><strong>Bộ lọc</strong><small>Điều khiển bảng điểm</small>
          </div>
          <button type="button" class="sidebar-toggle-btn sidebar-toggle-mobile" onclick="closeMobileFilter()"
            title="Đóng bộ lọc">
            <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" width="16" height="16">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
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
        ${d.permNote?`<div class="score-sync-warning">${d.permNote}</div>`:''}
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
            {value:'all',label:'Tất cả xếp loại'},{value:SCORE_STATUS.GOOD,label:'Tốt'},
            {value:SCORE_STATUS.FAIR,label:'Khá'},{value:SCORE_STATUS.PASS,label:'Đạt'},{value:SCORE_STATUS.FAIL,label:'CĐ'}],
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

function toggleMobileFilter() {
  setState({ mobileFilterOpen: !state.mobileFilterOpen }, 'toggleMobileFilter');
}

function closeMobileFilter() {
  if (state.mobileFilterOpen) setState({ mobileFilterOpen: false }, 'closeMobileFilter');
}

/* ============================================================
   MAIN RENDER
   ============================================================ */
// Các cờ này chỉ đổi giá trị đúng 1 lần khi shell/modal thật sự
// "mở mới" — dùng để chỉ cho animation chạy lúc đó, không chạy lại
// mỗi khi setState() làm render() dựng lại toàn bộ innerHTML (gõ phím,
// tick checkbox, đổi tab...).
let __a3AppMounted = false;
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

  // "Mở mới" hay chỉ là re-render trong lúc vẫn đang mở?
  const shellFirstPaint = !__a3AppMounted;
  const createWeekOpenNow = !!state.createWeekConfirmOpen;
  const createWeekJustOpened = createWeekOpenNow && !__a3PrevCreateWeekOpen;

  const focusInfo = __a3CaptureFocus(root);

  root.innerHTML = `
    <div class="scoreboard-app ${shellFirstPaint?'a3-enter':''} role-${d.role} ${d.isStudentOnly?'student-readonly-mode':''}">
      ${buildSidebar(d)}
      <div class="sidebar-mobile-backdrop${state.mobileFilterOpen?' show':''}" onclick="closeMobileFilter()"></div>
      <section class="scoreboard-main">
        <!-- Header -->
        <header class="scoreboard-header">
          <div class="header-title-row">
            <button type="button" class="mobile-filter-trigger" onclick="toggleMobileFilter()" title="Bộ lọc">${Icons.filter}</button>
            <div>
              <span class="app-eyebrow">Bảng chấm điểm</span>
              <h1>System <b>A3K64</b></h1>
              <p>Quản lý điểm thi đua, xếp hạng học tập và nề nếp theo tuần.</p>
            </div>
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
              <button type="button" class="toolbar-button export" title="Xuất Excel">${Icons.download}<span class="tb-label">Xuất Excel</span></button>
              <button type="button" class="toolbar-button camera" title="Chụp ảnh">${Icons.camera}<span class="tb-label">Chụp ảnh</span></button>
              <button type="button" class="toolbar-button auto" title="Tự tính điểm">${Icons.sparkles}<span class="tb-label">Tự tính điểm</span></button>
              <button type="button" class="toolbar-button" onclick="resetData()" title="Làm mới dữ liệu">${Icons.refresh}<span class="tb-label">Làm mới dữ liệu</span></button>
            </div>
          </div>`:''}
        <!-- Content -->
        <main class="scoreboard-content">
          ${state.dataSource===DATA_SOURCE.LOADING?`<div style="padding:40px;text-align:center;color:var(--score-muted)">Đang tải dữ liệu, lần đầu có thể hơi chậm...</div>`:
            state.activeTab==='overview'?buildOverviewPage(d):
            d.canUseScoringTab?buildScoringPage(d):''}
        </main>
      </section>
    </div>

    <!-- Create week modal -->
    ${state.createWeekConfirmOpen?`
      <div class="create-week-modal-backdrop ${createWeekJustOpened?'a3-enter':''}" onclick="if(event.target===this)setState({createWeekConfirmOpen:false})">
        <div class="create-week-modal-card ${createWeekJustOpened?'a3-enter':''}">
          <button type="button" class="create-week-modal-close" onclick="setState({createWeekConfirmOpen:false})" ${state.isCreatingWeek?'disabled':''}>${Icons.x}</button>
          <div class="create-week-modal-icon">+</div>
          <h2>Tạo tuần ${d.nextWeek}?</h2>
          <p>Hệ thống sẽ nhân bản sheet <b>TUẦN 0</b> và đổi tiêu đề thành <b>LỚP 12A3 - TUẦN ${d.nextWeek}</b>.</p>
          <div class="create-week-modal-actions">
            <button type="button" class="create-week-cancel" onclick="setState({createWeekConfirmOpen:false})" ${state.isCreatingWeek?'disabled':''}>Huỷ</button>
            <button type="button" class="create-week-confirm" onclick="createNewWeek()" ${state.isCreatingWeek?'disabled':''}>${state.isCreatingWeek?'Đang tạo...':'Tạo tuần'}</button>
          </div>
        </div>
      </div>`:''}

    <!-- Live toasts -->
  `;

  __a3AppMounted = true;
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
    if(state.mobileFilterOpen) closeMobileFilter();
  }
});

function openProfile(id) { window.dispatchEvent(new CustomEvent('a3k64-open-profile',{detail:{studentId:id}})); }


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
    if(state.dataSource===DATA_SOURCE.GAS) {
      await fetchFromGas({action:'createWeek',week:String(nextWeek)});
      await loadScoreboardData(true);
    } else {
      setState({weeks:[...new Set([...state.weeks,nextWeek])].sort((a,b)=>a-b)});
    }
    setState({week:nextWeek,activeTab:'scoring'});
  } catch (err) {
    console.error('[createNewWeek] Không tạo được tuần mới:', err);
    _notify(`Không tạo được tuần ${nextWeek} trên Google Sheets.`, 'error');
  }
  finally { setState({isCreatingWeek:false}); }
}

function resetData() {
  pendingSaveGuard=null;
  SafeStorage.remove(localStorage, STORAGE_KEY);
  SafeStorage.remove(localStorage, WEEK_STORAGE_KEY);
  if(state.dataSource===DATA_SOURCE.GAS) { loadScoreboardData(true); return; }
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
  // Adaptive polling: tick mỗi 2s nhưng chỉ thực sự gọi GAS khi đến chu kỳ.
  // - Trong 60s sau lần hoạt động cuối: poll mỗi LIVE_REFRESH_MS_ACTIVE (10s)
  // - Khi idle quá 60s: poll mỗi LIVE_REFRESH_MS (20s)
  let lastPollAt = 0;
  liveTimer=setInterval(async()=>{
    if(pollingActive||savingActive||state.editingStudentId||state.dataSource!==DATA_SOURCE.GAS) return;
    const idleMs = Date.now() - lastActivityAt;
    const interval = idleMs < 60000 ? LIVE_REFRESH_MS_ACTIVE : LIVE_REFRESH_MS;
    if(Date.now() - lastPollAt < interval) return;
    lastPollAt = Date.now();
    pollingActive=true;
    try {
      const remote=await fetchScoreboardFromGas(true);
      if(remote) applyRemoteData(remote,{silent:true,notify:true});
    } catch (err) {
      // fetchScoreboardFromGas() đã tự bắt lỗi mạng và trả về null; nhánh
      // này chỉ còn lại lỗi bất ngờ trong applyRemoteData() (vd. dữ liệu
      // dị dạng) — log để chẩn đoán thay vì làm dừng hẳn vòng polling.
      console.warn('[startLivePolling] Bỏ qua 1 lượt polling do lỗi:', err);
    } finally {
      pollingActive=false;
    }
  }, 2000);
}

/** Gọi khi có thao tác của người dùng (chấm điểm, mở modal...)
 *  để chuyển sang chế độ polling nhanh (10s) trong 60 giợy tiếp theo. */
function markActivity() {
  lastActivityAt = Date.now();
}

/* ============================================================
   PUBLIC INIT
   ============================================================ */
function initScoreboard(opts={}) {
  userRole  = opts.userRole  || ROLE.STUDENT;
  userGroup = opts.userGroup || null;
  gasUrl    = opts.gasUrl    || null;
  userEmail = opts.actorEmail || null;
  userName  = opts.actorName  || null;

  // Khởi động A3Notify broadcast poll — dùng retry loop đề phòng
  // notify.js load xong nhưng A3Notify chưa gán vào window kịp.
  if (gasUrl) {
    (function _startNotifyPoll(attempts) {
      if (window.A3Notify) {
        window.A3Notify.gasUrl = gasUrl;
        if (typeof window.A3Notify.startBroadcastPoll === 'function') {
          window.A3Notify.startBroadcastPoll(gasUrl, 12000);
        }
      } else if (attempts > 0) {
        setTimeout(function() { _startNotifyPoll(attempts - 1); }, 300);
      }
    })(20); // thử tối đa 20 lần × 300ms = 6 giây
  }

  applyDesktopAccent({ useFallback:true });
  render();
  loadScoreboardData().then(()=>startLivePolling());
  window.addEventListener('storage', () => applyDesktopAccent({ useFallback:false }));

  // Expose internals cho các module phụ (scoreboard-ai.js, scoreboard-modal.js, ...)
  // Dùng getter để luôn trả về giá trị mới nhất (state, gasUrl thay đổi theo thời gian)
  window.__scoreboard = window.__scoreboard || {};
  Object.defineProperties(window.__scoreboard, {
    state:                { get: () => state,                configurable: true },
    getDerived:           { get: () => getDerived,           configurable: true },
    gasUrl:               { get: () => gasUrl,               configurable: true },
    fetchRulesFromGas:    { get: () => fetchRulesFromGas,    configurable: true },
    formatScore:          { get: () => formatScore,          configurable: true },
    normalizeVi:          { get: () => normalizeVi,          configurable: true },
    normalizeRuleCategory:{ get: () => normalizeRuleCategory,configurable: true },
    CATEGORY:             { get: () => CATEGORY,             configurable: true },
    SafeStorage:          { get: () => SafeStorage,          configurable: true },
    makeDraftEvent:       { get: () => makeDraftEvent,       configurable: true },
    saveScoreChanges:     { get: () => saveScoreChanges,     configurable: true },
    formatSavedTitle:     { get: () => formatSavedTitle,     configurable: true },
    newEventDateForDay:   { get: () => newEventDateForDay,   configurable: true },
  });
}

/** Áp màu chủ đạo (accent) do ứng dụng desktop host thiết lập qua biến
 *  CSS `--desktop-accent`. Tách riêng để dùng cả lúc khởi tạo (có màu mặc
 *  định dự phòng) và mỗi khi desktop phát sự kiện 'storage' báo đổi theme
 *  (không dùng mặc định, chỉ cập nhật khi có giá trị mới thật sự). */
function applyDesktopAccent({ useFallback } = {}) {
  try {
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--desktop-accent').trim();
    if (accent) {
      document.documentElement.style.setProperty('--accent', accent);
    } else if (useFallback) {
      document.documentElement.style.setProperty('--accent', '#2563eb');
    }
  } catch (err) {
    console.warn('[applyDesktopAccent] Không đọc được màu chủ đạo:', err);
  }
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
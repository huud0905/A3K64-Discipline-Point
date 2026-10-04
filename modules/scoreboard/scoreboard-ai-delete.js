/* ============================================================
   scoreboard-ai-delete.js — XOÁ ĐIỂM BẰNG AI
   ------------------------------------------------------------
   Luồng (đối xứng với "Tự tính điểm" bằng AI, nhưng cho việc XOÁ):
     1. Người dùng gõ yêu cầu bằng lời, VD:
          "xoá điểm trừ không ghi bài của Đức Anh thứ 3 tiết 2"
          "xoá GVNN của Na tuần 4"
     2. AI CHỈ ĐỌC yêu cầu và đổi thành bộ lọc (học sinh, tuần, thứ,
        tiết, nội dung...). AI KHÔNG nhìn thấy dữ liệu điểm, KHÔNG
        phân tích, KHÔNG quyết định xoá gì.
     3. Hệ thống tự ĐỐI CHIẾU bộ lọc với CƠ SỞ DỮ LIỆU (tải mới
        getScoreboard từ máy chủ) và liệt kê đúng các mục khớp.
     4. Người dùng xem lại "có đúng ý mình không", bỏ tích mục nào
        không muốn xoá, rồi bấm xoá (có bước xác nhận lần 2).
     5. Xoá theo từng LÔ nhỏ (tránh lỗi "Too many subrequests" của
        Cloudflare Worker), rồi kiểm tra lại với CSDL xem đã xoá thật.

   LOAD SAU scoreboard.js, scoreboard-ai.js (cần window.__scoreboard,
   window.A3AI). Thêm vào scoreboard-window.html:
       <script src="scoreboard-ai-delete.js"></script>
   ============================================================ */
(function () {
  'use strict';

  const ROOT_ID       = 'a3-aidel-root';
  const ALLOWED_ROLES = ['to_truong', 'gvcn', 'lop_truong', 'bi_thu'];
  const FULL_ACCESS   = ['gvcn', 'lop_truong', 'bi_thu'];
  const DELETE_CHUNK  = 15;    // mỗi lô xoá tốn ~1 subrequest/mục + ~5 cố định → luôn < 50
  const MAX_REQUESTS  = 40;    // tối đa số "yêu cầu" AI được trả về từ 1 lần gõ
  const MAX_TEXT      = 4000;

  const MODELS = [
    'gemini-3.1-flash-lite',
    'groq:openai/gpt-oss-120b',
    'gemini-3.5-flash-lite',
    'groq:openai/gpt-oss-20b',
    'gemini-2.5-flash-lite',
    'groq:qwen/qwen3.8-27b',
    'gemini-2.5-flash',
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-3.7-flash',
    'gemini-3.0-flash',
  ];
  const SUBJECTS = [
    'Toán', 'Vật Lí', 'Hoá Học', 'Sinh Học', 'Tin Học', 'Ngữ Văn', 'Lịch Sử',
    'Tiếng Anh', 'Quốc Phòng', 'Thể Dục', 'GDĐP', 'TNHN', 'Chào Cờ', 'SHL',
  ];
  const AI_FATAL_RE = /api[ _-]?key|permission|unauthorized|forbidden|billing|chưa cấu hình gas url/i;

  /* ----------------------------------------------------------
     Trạng thái
  ---------------------------------------------------------- */
  let _stage      = 'input';          // 'input' | 'review' | 'done'
  let _text       = '';
  let _week       = null;             // tuần mặc định cho yêu cầu không nêu tuần
  let _busy       = false;
  let _status     = '';
  let _error      = '';
  let _filters    = [];               // bộ lọc do AI đọc ra
  let _groups     = [];               // [{ f, matches:[ev], unresolved, note }]
  let _selected   = new Set();        // id các mục được tích chọn để xoá
  let _confirming = false;
  let _confirmTimer = null;
  let _usedLocal  = false;            // true = không tải được CSDL, đang dùng dữ liệu trên màn hình
  let _doneInfo   = null;

  /* ----------------------------------------------------------
     Tiện ích
  ---------------------------------------------------------- */
  function _sb() { return window.__scoreboard || {}; }
  function _esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function _norm(s) {
    try { if (typeof _sb().normalizeVi === 'function') return _sb().normalizeVi(s); } catch {}
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  function _notify(msg, type) {
    try { if (typeof window._notify === 'function') window._notify(msg, type); } catch {}
  }

  function _user() {
    try {
      if (typeof userRole !== 'undefined' && userRole) {
        return { role: String(userRole).toLowerCase(), group: (typeof userGroup !== 'undefined') ? userGroup : null };
      }
    } catch {}
    try {
      const raw = sessionStorage.getItem('a3k64-user');
      if (raw) { const u = JSON.parse(raw); return { role: String(u?.role || 'hoc_sinh').toLowerCase(), group: u?.group ?? u?.to ?? null }; }
    } catch {}
    try {
      const raw = localStorage.getItem('a3k64-login-session-v1');
      if (raw) { const s = JSON.parse(raw); const u = s?.user || s; return { role: String(u?.role || 'hoc_sinh').toLowerCase(), group: u?.group ?? u?.to ?? null }; }
    } catch {}
    return { role: 'hoc_sinh', group: null };
  }
  function _canUse() { return ALLOWED_ROLES.includes(_user().role); }
  function _userGroupNo() {
    const g = _user().group;
    try { if (typeof parseGroup === 'function') { const n = parseGroup(g); if (n) return n; } } catch {}
    try { if (typeof readSavedUserGroup === 'function') { const n = readSavedUserGroup(); if (n) return Number(n); } } catch {}
    const n = Number(String(g ?? '').replace(/[^0-9]/g, ''));
    return n || null;
  }

  function _isWeekLocked(week) {
    let list = [];
    try { list = Array.isArray(_sb().state.weekSettings) ? _sb().state.weekSettings : []; } catch {}
    const f = list.find(w => Number(w.week) === Number(week));
    return !!(f && (f.locked || f.isLocked || f.is_closed));
  }
  function _weeks() {
    let raw = [];
    try { raw = Array.isArray(_sb().state.weeks) ? _sb().state.weeks : []; } catch {}
    return [...new Set(raw.map(Number))].filter(w => Number.isFinite(w) && w > 0).sort((a, b) => a - b);
  }
  function _currentWeek() { try { return Number(_sb().state.week) || 1; } catch { return 1; } }

  /** Học sinh trong PHẠM VI của người dùng (tổ trưởng → chỉ tổ mình). Map id → học sinh. */
  function _scopeStudents() {
    let all = [];
    try { all = Array.isArray(_sb().state.students) ? _sb().state.students : []; } catch {}
    const u = _user();
    if (u.role === 'to_truong') {
      const g = _userGroupNo();
      return all.filter(s => Number(s.group) === g);
    }
    return all;
  }
  function _studentMap(list) { return new Map((list || []).map(s => [s.id, s])); }

  /** Mục này người dùng có quyền xoá không? (tổ trưởng: đúng tổ mình + tuần chưa khoá) */
  function _canDeleteEvent(ev, scopeMap) {
    const u = _user();
    if (FULL_ACCESS.includes(u.role)) return true;
    if (u.role !== 'to_truong') return false;
    if (!scopeMap.has(ev.studentId)) return false;
    return !_isWeekLocked(ev.week);
  }

  /** Chỉ các dòng điểm thật mới xoá được — không đụng điểm cơ bản / nghỉ tự sinh. */
  function _isDeletable(e) {
    if (!e || !e.id) return false;
    const id = String(e.id);
    if (id.startsWith('base_') || id.startsWith('draft-') || id.startsWith('local-')) return false;
    const n = String(e.note || '');
    if (n.includes('__SHEET_TOTAL__') || n.includes('__TT_ABSENCE__') || n.includes('__ONTHI_ABSENCE__')) return false;
    return true;
  }

  /* ----------------------------------------------------------
     Gọi AI (đọc yêu cầu → bộ lọc)
  ---------------------------------------------------------- */
  function _parseJsonArray(raw) {
    let t = String(raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
      let v = JSON.parse(t);
      if (v && !Array.isArray(v)) { const arr = Object.values(v).find(Array.isArray); if (arr) v = arr; }
      return v;
    } catch {}
    const a = t.indexOf('['), b = t.lastIndexOf(']');
    if (a !== -1 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
    return null;
  }

  let _quotaSid = '';   // 1 lần bấm tìm = 1 phiên → chỉ tính 1 lượt khi AI trả kết quả
  async function _callAI(systemInstruction, userText) {
    if (!window.A3AI) throw new Error('Thiếu ai-proxy.js (chưa nạp trong scoreboard-window.html).');
    const body = {
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: [{ parts: [{ text: userText }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 4096 },
    };
    const models = (typeof window.A3AI.availableModels === 'function') ? window.A3AI.availableModels(MODELS) : MODELS;
    let lastErr = null, empties = 0;
    for (const model of models) {
      try {
        const data = await window.A3AI.callGemini(model, body, _quotaSid);
        const raw = (data?.candidates?.[0]?.content?.parts || []).map(p => p?.text || '').join('');
        const arr = _parseJsonArray(raw);
        if (!Array.isArray(arr)) throw new Error('trả về dữ liệu không phải JSON hợp lệ');
        if (!arr.length && ++empties < 2) throw new Error('trả về danh sách rỗng');   // thử thêm 1 model rồi mới chấp nhận rỗng
        return arr;
      } catch (err) {
        const st = Number(err?.httpStatus) || 0;
        if (err?.locked || err?.__aiFatal || st === 401 || st === 403 || AI_FATAL_RE.test(String(err?.message || ''))) throw err;
        lastErr = err;
        console.warn(`[AIDelete] Bỏ qua ${model}: ${err?.message || err}`);
      }
    }
    throw new Error('Đã thử hết các model AI nhưng đều lỗi (quá tải hoặc hết lượt). Vui lòng thử lại sau.\n(' + (lastErr?.message || 'không rõ lỗi') + ')');
  }

  async function _buildSystemPrompt(students) {
    const stuList = students.map(s => `${s.id}:::${s.name}:::Tổ ${s.group}`).join('\n');
    const weeks = _weeks().join(', ') || String(_currentWeek());
    let rules = [];
    try { rules = await _sb().fetchRulesFromGas(); } catch { rules = []; }
    const rulesTxt = (Array.isArray(rules) && rules.length)
      ? rules.map(r => String(r.title || '').trim()).filter(Boolean).join('\n')
      : '(không đọc được danh sách quy định)';

    return `Bạn là bộ ĐỌC YÊU CẦU XOÁ ĐIỂM cho lớp A3K64.

NHIỆM VỤ: đổi yêu cầu của người dùng thành danh sách JSON các "bộ lọc" mô tả mục điểm cần xoá.
Bạn KHÔNG nhìn thấy dữ liệu điểm, KHÔNG phân tích, KHÔNG chấm điểm và KHÔNG tự quyết định xoá gì.
Hệ thống sẽ tự tìm trong cơ sở dữ liệu rồi hỏi lại người dùng — việc của bạn chỉ là hiểu đúng câu chữ.

═══ DANH SÁCH HỌC SINH (ID:::Họ tên:::Tổ) ═══
${stuList}

═══ CÁC TUẦN ĐANG CÓ ═══
${weeks}

═══ DANH SÁCH MÔN HỌC CHÍNH THỨC ═══
${SUBJECTS.join(', ')}

═══ TÊN QUY ĐỊNH LỖI/THƯỞNG CHUẨN (để gọi đúng tên nội dung) ═══
${rulesTxt}

═══ ĐỊNH DẠNG ĐẦU RA ═══
Chỉ trả về MỘT mảng JSON, mỗi phần tử có đúng các trường:
{
  "student_id": string|null,    // ID lấy ĐÚNG từ danh sách trên
  "student_name": string|null,  // tên người dùng gõ (khi không chắc ID)
  "group": number|null,         // số tổ nếu yêu cầu nhắm cả một tổ
  "week": number|null,          // số tuần nếu có nêu, ngược lại null
  "day": number|null,           // Thứ 2..7 → 2..7; Chủ nhật → 0; không nêu → null
  "tiet": number|null,          // số tiết nếu có nêu
  "keyword": string|null,       // nội dung lỗi/thưởng, viết chuẩn có dấu
  "subject": string|null,       // tên môn chuẩn nếu có nêu
  "sign": "plus"|"minus"|null,  // plus = điểm cộng/thưởng; minus = điểm trừ/lỗi/vi phạm
  "points": number|null,        // số ĐIỂM cụ thể, CHỈ khi người dùng nói rõ "N điểm" (luôn là số DƯƠNG)
  "times": number|null,         // số LẦN/mục cần xoá cho MỖI học sinh ("1 lần", "xoá 2 lần", "xoá bớt 1") ; không nêu → null
  "raw": string                 // đoạn gốc trong yêu cầu
}

═══ QUY TẮC ═══
1. Mỗi học sinh một phần tử riêng: "Na và Đức Anh" → 2 phần tử.
2. Không chắc học sinh nào → student_id = null và ghi student_name đúng như người dùng gõ. Tuyệt đối không đoán bừa ID.
3. "cả lớp", "mọi người", "tất cả" → student_id = null, student_name = null, group = null.
   "cả tổ 2" → group = 2, student_id = null.
4. keyword: nội dung ngắn gọn, KHÔNG kèm tên học sinh, thứ, tiết, môn hay số điểm. Sửa viết tắt thành chữ chuẩn ("k ghi bài" → "không ghi bài"). Nếu "giáo viên nhắc nhở"/"GVNN"/"nhắc nhở" → "Giáo Viên Nhắc Nhở". Không nêu nội dung → null.
5. Chỉ điền trường nào người dùng THỰC SỰ nói tới; còn lại để null. Không bịa thông tin.
6. "N lần" nghĩa là SỐ MỤC cần xoá (times = N), TUYỆT ĐỐI KHÔNG phải số điểm. Chỉ điền points khi người dùng nói rõ "N điểm".
7. Chỉ trả về mảng JSON, không giải thích.

Ví dụ: "xoá điểm trừ không ghi bài của Đức Anh thứ 3 tiết 2 tuần 5" →
[{"student_id":"<id của Đức Anh>","student_name":"Đức Anh","group":null,"week":5,"day":3,"tiet":2,"keyword":"không ghi bài","subject":null,"sign":"minus","points":null,"raw":"xoá điểm trừ không ghi bài của Đức Anh thứ 3 tiết 2 tuần 5"}]`;
  }

  function _normFilter(it) {
    const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);
    const str = v => { const t = (v == null) ? '' : String(v).trim(); return (t && t.toLowerCase() !== 'null') ? t : ''; };
    let sign = str(it?.sign).toLowerCase();
    if (sign !== 'plus' && sign !== 'minus') sign = '';
    let points = num(it?.points);
    if (points !== null && points < 0 && !sign) sign = 'minus';
    if (points !== null) points = Math.abs(points);
    // Chốt chặn: chỉ nhận points khi câu gốc thật sự có "<số> điểm" (tránh hiểu nhầm "1 lần" thành "1 điểm")
    if (points !== null) {
      const rawTxt = String(it?.raw || '');
      if (!new RegExp('(^|[^0-9])' + points + '\\s*(điểm|diem|đ)(?![a-zà-ỹ])', 'i').test(rawTxt)) points = null;
    }
    let times = num(it?.times); times = (times && times >= 1) ? Math.floor(times) : null;
    let day = num(it?.day);  if (day !== null && !(day >= 0 && day <= 7)) day = null;
    let tiet = num(it?.tiet); if (tiet !== null && !(tiet >= 1 && tiet <= 12)) tiet = null;
    const week = num(it?.week);
    const group = num(it?.group);
    return {
      studentId: str(it?.student_id), studentName: str(it?.student_name), group: group && group > 0 ? group : null,
      week: week && week > 0 ? week : null, day, tiet,
      keyword: str(it?.keyword), subject: str(it?.subject), sign, points, times, raw: str(it?.raw),
    };
  }
  function _isNarrow(f) {
    return f.day !== null || f.tiet !== null || !!f.keyword || !!f.subject || !!f.sign || f.points !== null || f.times !== null;
  }

  async function _readRequest(text) {
    const students = _scopeStudents();
    if (!students.length) throw new Error('Chưa có dữ liệu học sinh — hãy đợi bảng điểm tải xong rồi thử lại.');
    const system = await _buildSystemPrompt(students);
    const arr = await _callAI(system, text.slice(0, MAX_TEXT));
    return arr.slice(0, MAX_REQUESTS).map(_normFilter);
  }

  /* ----------------------------------------------------------
     Đối chiếu với CƠ SỞ DỮ LIỆU (không AI)
  ---------------------------------------------------------- */
  async function _fetchDbEvents() {
    const base = _sb().gasUrl;
    if (!base) throw new Error('Chưa cấu hình địa chỉ máy chủ.');
    const url = new URL(base);
    url.searchParams.set('action', 'getScoreboard');
    url.searchParams.set('t', String(Date.now()));
    const res = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
    if (!res.ok) throw new Error('Máy chủ trả HTTP ' + res.status);
    const json = await res.json();
    if (json && json.ok === false) throw new Error(json.error || 'Máy chủ từ chối.');
    const data = json?.data || json || {};
    const src = (Array.isArray(data.events) || Array.isArray(data.students)) ? data : (data.scoreboard || data);
    if (!Array.isArray(src?.events)) throw new Error('Dữ liệu máy chủ không hợp lệ.');
    return src.events;
  }

  function _dayOf(t) {
    const m = t.match(/(?:^|\s)thu\s*(\d)/);
    if (m) return Number(m[1]);
    if (/(?:^|\s)(?:cn|chu nhat)(?:\s|:|$)/.test(t)) return 0;
    return null;
  }
  function _tietOf(t) {
    const m = t.match(/tiet\s*(\d+)/);
    return m ? Number(m[1]) : null;
  }
  function _tokens(k) {
    return _norm(k).split(/[\s,.;:()\[\]+\-]+/).filter(x => x.length >= 2 || /^\d$/.test(x));
  }

  function _resolveTargets(f, scope) {
    // → { ids:Set|null (null = cả phạm vi), unresolved:string }
    if (f.studentId) {
      if (scope.has(f.studentId)) return { ids: new Set([f.studentId]), unresolved: '' };
    }
    if (f.studentName || f.studentId) {
      const want = _norm(f.studentName || '');
      if (want) {
        const exact = [...scope.values()].filter(s => _norm(s.name) === want);
        const hits = exact.length ? exact : [...scope.values()].filter(s => _norm(s.name).includes(want));
        if (hits.length === 1) return { ids: new Set([hits[0].id]), unresolved: '' };
        if (hits.length > 1) return { ids: new Set(hits.map(s => s.id)), unresolved: '', ambiguous: hits.length };
      }
      return { ids: new Set(), unresolved: `Không tìm thấy học sinh «${f.studentName || f.studentId}» trong phạm vi của bạn.` };
    }
    if (f.group) {
      const ids = [...scope.values()].filter(s => Number(s.group) === Number(f.group)).map(s => s.id);
      if (!ids.length) return { ids: new Set(), unresolved: `Không có học sinh nào của Tổ ${f.group} trong phạm vi của bạn.` };
      return { ids: new Set(ids), unresolved: '' };
    }
    return { ids: null, unresolved: '' };   // cả lớp (trong phạm vi)
  }

  function _matchEvents(f, events, targets, scope) {
    const week = f.week ?? _week;
    const subj = _norm(f.subject);
    const kw = _tokens(f.keyword);
    const out = events.filter(e => {
      if (Number(e.week) !== Number(week)) return false;
      if (targets.ids) { if (!targets.ids.has(e.studentId)) return false; }
      else if (!scope.has(e.studentId)) return false;
      const pts = Number(e.points) || 0;
      if (f.sign === 'plus' && !(pts > 0)) return false;
      if (f.sign === 'minus' && !(pts < 0)) return false;
      if (f.points !== null && Math.abs(pts) !== f.points) return false;
      const t = _norm(e.title);
      if (f.day !== null && _dayOf(t) !== f.day) return false;
      if (f.tiet !== null && _tietOf(t) !== f.tiet) return false;
      if (subj && !t.includes(subj)) return false;
      if (kw.length && !kw.every(k => t.includes(k))) return false;
      return true;
    }).sort((a, b) => (_dayOf(_norm(a.title)) ?? 9) - (_dayOf(_norm(b.title)) ?? 9) || String(a.id).localeCompare(String(b.id)));
    if (!f.times) return out;
    // "xoá N lần": mỗi học sinh chỉ lấy N mục (các mục tạo sau cùng), phần còn lại giữ nguyên
    const byStu = new Map();
    out.forEach(e => { if (!byStu.has(e.studentId)) byStu.set(e.studentId, []); byStu.get(e.studentId).push(e); });
    const keep = new Set();
    byStu.forEach(list => list.slice(-f.times).forEach(e => keep.add(e.id)));
    return out.filter(e => keep.has(e.id));
  }

  async function _lookup() {
    let events;
    _usedLocal = false;
    try { events = await _fetchDbEvents(); }
    catch (err) {
      console.warn('[AIDelete] Không tải được CSDL, dùng dữ liệu trên màn hình:', err);
      _usedLocal = true;
      events = Array.isArray(_sb().state.events) ? _sb().state.events : [];
    }
    events = events.filter(_isDeletable);

    const scopeList = _scopeStudents();
    const scope = _studentMap(scopeList);

    _groups = _filters.map(f => {
      const targets = _resolveTargets(f, scope);
      let matches = targets.unresolved ? [] : _matchEvents(f, events, targets, scope);
      const before = matches.length;
      matches = matches.filter(e => _canDeleteEvent(e, scope));
      return {
        f, matches, unresolved: targets.unresolved,
        ambiguous: targets.ambiguous || 0,
        blocked: before - matches.length,            // khớp nhưng không đủ quyền xoá
        narrow: _isNarrow(f),
      };
    });

    // Chỉ tích sẵn khi yêu cầu đủ cụ thể; yêu cầu rộng (chỉ "điểm của Na tuần 3") → để người dùng tự tích.
    _selected = new Set();
    _groups.forEach(g => { if (g.narrow && !g.unresolved && !g.ambiguous) g.matches.forEach(e => _selected.add(e.id)); });
    _confirming = false;
  }

  /* ----------------------------------------------------------
     Xoá thật (chia lô) + kiểm tra lại CSDL
  ---------------------------------------------------------- */
  async function _doDelete() {
    if (_busy) return;
    const valid = new Set();
    _groups.forEach(g => g.matches.forEach(e => valid.add(e.id)));
    const ids = [..._selected].filter(id => valid.has(id));
    if (!ids.length) return;

    if (typeof _sb().saveScoreChanges !== 'function') { _error = 'Không tìm thấy hàm lưu điểm của bảng điểm.'; _render(); return; }

    _busy = true; _error = ''; _confirming = false; clearTimeout(_confirmTimer);
    let fatal = '';
    try {
      for (let i = 0; i < ids.length; i += DELETE_CHUNK) {
        const chunk = ids.slice(i, i + DELETE_CHUNK);
        _status = `Đang xoá ${Math.min(i + DELETE_CHUNK, ids.length)}/${ids.length} mục…`;
        _render();
        await _sb().saveScoreChanges({ additions: [], deletions: chunk });
        // saveScoreChanges() tự nuốt lỗi (hoàn tác + báo toast) → nếu mục vẫn còn trong state thì lô này lỗi.
        const still = new Set((_sb().state.events || []).map(e => e.id));
        if (chunk.some(id => still.has(id))) { fatal = 'Một lô xoá bị máy chủ từ chối hoặc lỗi mạng — đã dừng để tránh xoá dở dang.'; break; }
      }
    } catch (err) {
      fatal = String(err?.message || err);
    }

    // Kiểm tra lại với CƠ SỞ DỮ LIỆU: mục nào đã thật sự biến mất?
    _status = 'Đang kiểm tra lại với cơ sở dữ liệu…'; _render();
    let deleted = [], remaining = [];
    try {
      const fresh = await _fetchDbEvents();
      const left = new Set(fresh.map(e => e.id));
      deleted = ids.filter(id => !left.has(id));
      remaining = ids.filter(id => left.has(id));
    } catch {
      const left = new Set((_sb().state.events || []).map(e => e.id));
      deleted = ids.filter(id => !left.has(id));
      remaining = ids.filter(id => left.has(id));
      _usedLocal = true;
    }
    _doneInfo = { total: ids.length, deleted: deleted.length, remaining: remaining.length, fatal };
    _selected = new Set(remaining);
    _stage = 'done';
    _busy = false; _status = '';
    _render();
    if (deleted.length) _notify(`Đã xoá ${deleted.length} mục điểm bằng AI.`, 'success');
  }

  /* ----------------------------------------------------------
     Luồng bấm "Tìm trong dữ liệu"
  ---------------------------------------------------------- */
  async function _search() {
    if (_busy) return;
    const text = (_text || '').trim();
    if (!text) { _error = 'Hãy nhập yêu cầu xoá điểm.'; _render(); return; }
    if (!_canUse()) { _error = 'Bạn không có thẩm quyền sử dụng tính năng này.'; _render(); return; }

    _busy = true; _error = ''; _status = 'AI đang đọc yêu cầu của bạn…'; _render();
    try {
      _quotaSid = window.A3AI && window.A3AI.newSession ? window.A3AI.newSession() : '';
      _filters = await _readRequest(text);
      if (!_filters.length) throw new Error('AI không hiểu được yêu cầu. Hãy nêu rõ tên học sinh và nội dung điểm cần xoá.');
      _status = 'Đang đối chiếu với cơ sở dữ liệu…'; _render();
      await _lookup();
      _stage = 'review';
    } catch (err) {
      if (err?.locked) {
        try { window.A3AI?.showUpgrade?.(); } catch {}
        _error = 'Đã hết lượt dùng AI miễn phí.';
      } else {
        _error = String(err?.message || err);
      }
    } finally {
      _busy = false; _status = ''; _render();
    }
  }

  /* ----------------------------------------------------------
     Giao diện
  ---------------------------------------------------------- */
  function _root() { return document.getElementById(ROOT_ID); }

  function _open() {
    if (!_canUse()) { _notify('Bạn không có thẩm quyền sử dụng tính năng xoá điểm bằng AI.', 'error'); return; }
    _stage = 'input'; _error = ''; _status = ''; _busy = false; _confirming = false;
    _filters = []; _groups = []; _selected = new Set(); _doneInfo = null;
    const weeks = _weeks();
    const cur = _currentWeek();
    _week = weeks.includes(cur) ? cur : (weeks[weeks.length - 1] || cur);
    _ensureRoot();
    _render();
    setTimeout(() => _root()?.querySelector('#aidel-text')?.focus(), 60);
  }
  function _close() {
    if (_busy) return;
    clearTimeout(_confirmTimer);
    const r = _root(); if (r) r.innerHTML = '';
  }
  function _ensureRoot() {
    let r = _root();
    if (r) return r;
    r = document.createElement('div');
    r.id = ROOT_ID;
    document.body.appendChild(r);
    r.addEventListener('click', _onClick);
    r.addEventListener('change', _onChange);
    r.addEventListener('input', _onInput);
    r.addEventListener('keydown', (e) => {
      if (e.target?.id === 'aidel-text' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); _search(); }
    });
    return r;
  }

  function _weekOptions() {
    const weeks = _weeks();
    const full = FULL_ACCESS.includes(_user().role);
    if (!weeks.length) return `<option value="${_week}">Tuần ${_week}</option>`;
    return weeks.map(w => {
      const locked = _isWeekLocked(w);
      const dis = locked && !full;
      return `<option value="${w}" ${dis ? 'disabled' : ''} ${w === _week ? 'selected' : ''}>Tuần ${w}${locked ? ' (đã khoá)' : ''}</option>`;
    }).join('');
  }

  function _ptsHtml(p) {
    const n = Number(p) || 0;
    const s = (n > 0 ? '+' : '') + n;
    return `<b class="${n > 0 ? 'aidel-pos' : 'aidel-neg'}">${_esc(s)}</b>`;
  }

  function _chips(g) {
    const f = g.f, c = [];
    const who = f.studentName || (f.studentId ? ((_studentMap(_scopeStudents()).get(f.studentId) || {}).name || f.studentId) : '');
    c.push(who ? `👤 ${_esc(who)}` : (f.group ? `👥 Tổ ${f.group}` : '👥 Cả lớp'));
    c.push(`📅 Tuần ${f.week ?? _week}`);
    if (f.day !== null) c.push(f.day === 0 ? 'Chủ nhật' : `Thứ ${f.day}`);
    if (f.tiet !== null) c.push(`Tiết ${f.tiet}`);
    if (f.subject) c.push(`Môn ${_esc(f.subject)}`);
    if (f.keyword) c.push(`“${_esc(f.keyword)}”`);
    if (f.sign === 'plus') c.push('Điểm cộng');
    if (f.sign === 'minus') c.push('Điểm trừ');
    if (f.points !== null) c.push(`${f.points} điểm`);
    if (f.times !== null) c.push(`Xoá ${f.times} lần/người`);
    return c.map(x => `<span class="aidel-chip">${x}</span>`).join('');
  }

  function _reviewHtml() {
    const scope = _studentMap(_scopeStudents());
    const total = new Set(); _groups.forEach(g => g.matches.forEach(e => total.add(e.id)));
    const empty = _groups.filter(g => !g.matches.length).length;
    let html = `<div class="aidel-sum">Tìm thấy <b>${total.size}</b> mục khớp cho <b>${_groups.length}</b> yêu cầu${empty ? ` · <span class="aidel-warn">${empty} yêu cầu không có kết quả</span>` : ''}.
      Xem lại xem có <b>đúng ý bạn</b> không, bỏ tích mục nào không muốn xoá.</div>`;
    if (_usedLocal) html += `<div class="aidel-note">⚠ Không tải được dữ liệu mới từ máy chủ — đang đối chiếu với dữ liệu đang hiển thị trên màn hình.</div>`;

    _groups.forEach((g, gi) => {
      html += `<section class="aidel-req"><div class="aidel-reqhead"><div class="aidel-chips">${_chips(g)}</div><span class="aidel-cnt">${g.matches.length} mục</span></div>`;
      if (g.f.raw) html += `<div class="aidel-raw">“${_esc(g.f.raw)}”</div>`;
      if (g.unresolved) html += `<div class="aidel-warnbox">${_esc(g.unresolved)}</div>`;
      if (g.ambiguous) html += `<div class="aidel-warnbox">Tên này khớp ${g.ambiguous} học sinh — hãy kiểm tra kỹ từng mục bên dưới (chưa tích sẵn).</div>`;
      if (g.blocked) html += `<div class="aidel-warnbox">${g.blocked} mục khớp nhưng bạn không có quyền xoá (khác tổ hoặc tuần đã khoá) nên không hiển thị.</div>`;
      if (!g.matches.length && !g.unresolved) html += `<div class="aidel-empty">Không tìm thấy mục nào khớp trong cơ sở dữ liệu.</div>`;
      if (g.matches.length && !g.narrow) html += `<div class="aidel-warnbox">Yêu cầu khá rộng (chưa nêu thứ/tiết/nội dung) — chưa tích sẵn, hãy chọn tay mục cần xoá.</div>`;
      if (g.matches.length > 1) html += `<div class="aidel-tools"><button type="button" data-act="sel-all" data-g="${gi}">Chọn tất cả</button><button type="button" data-act="sel-none" data-g="${gi}">Bỏ chọn</button></div>`;
      g.matches.forEach(e => {
        const st = scope.get(e.studentId);
        html += `<label class="aidel-row"><input type="checkbox" data-id="${_esc(e.id)}" ${_selected.has(e.id) ? 'checked' : ''}>
          <span class="aidel-rowtxt"><span class="aidel-t">${_esc(e.title)}</span>
          <span class="aidel-m">${_esc(st?.name || e.studentId)} · Tuần ${_esc(e.week)} · ${_ptsHtml(e.points)}</span></span></label>`;
      });
      html += `</section>`;
    });
    return html;
  }

  function _render() {
    const root = _root(); if (!root) return;
    const body0 = root.querySelector('.aidel-body');
    const scrollTop = body0 ? body0.scrollTop : 0;

    let body = '', footer = '';
    if (_busy) {
      body = `<div class="aidel-loading"><div class="aidel-spin"></div><div>${_esc(_status || 'Đang xử lý…')}</div></div>`;
      footer = '';
    } else if (_stage === 'input') {
      body = `
        <p class="aidel-hint">Mô tả điểm cần xoá bằng lời. AI <b>chỉ đọc yêu cầu</b> của bạn — không phân tích hay chấm lại gì cả.
        Sau đó hệ thống tìm các mục khớp <b>trong cơ sở dữ liệu</b> để bạn xem lại rồi mới xoá.</p>
        <textarea id="aidel-text" class="aidel-ta" rows="6" maxlength="${MAX_TEXT}"
          placeholder="VD:&#10;Xoá điểm trừ không ghi bài của Đức Anh thứ 3 tiết 2&#10;Xoá GVNN của Na tuần 4&#10;Xoá điểm cộng phát biểu của Tổ 2 thứ 5">${_esc(_text)}</textarea>
        <label class="aidel-weekrow">Tuần mặc định (khi yêu cầu không nêu tuần):
          <select id="aidel-week">${_weekOptions()}</select></label>
        ${_error ? `<div class="aidel-err">${_esc(_error)}</div>` : ''}`;
      footer = `<button type="button" class="aidel-btn" data-act="close">Huỷ</button>
        <button type="button" class="aidel-btn primary" data-act="search">Tìm trong dữ liệu</button>`;
    } else if (_stage === 'review') {
      body = `${_reviewHtml()}${_error ? `<div class="aidel-err">${_esc(_error)}</div>` : ''}`;
      const n = _selected.size;
      footer = `<button type="button" class="aidel-btn" data-act="back">← Sửa yêu cầu</button>
        <button type="button" class="aidel-btn danger ${_confirming ? 'confirming' : ''}" data-act="delete" ${n ? '' : 'disabled'}>
          ${_confirming ? `Bấm lần nữa để XÁC NHẬN xoá ${n} mục` : `Xoá ${n} mục đã chọn`}</button>`;
    } else {
      const d = _doneInfo || { total: 0, deleted: 0, remaining: 0, fatal: '' };
      const ok = d.remaining === 0 && !d.fatal;
      body = `<div class="aidel-done ${ok ? 'ok' : 'bad'}">
        <div class="aidel-done-ic">${ok ? '✓' : '!'}</div>
        <div class="aidel-done-t">${ok ? 'Đã xoá xong' : 'Xoá chưa hoàn tất'}</div>
        <div>Đã xoá <b>${d.deleted}</b>/${d.total} mục (đã đối chiếu lại với cơ sở dữ liệu).</div>
        ${d.remaining ? `<div class="aidel-warn">Còn ${d.remaining} mục chưa xoá được.</div>` : ''}
        ${d.fatal ? `<div class="aidel-err">${_esc(d.fatal)}</div>` : ''}
        ${_usedLocal ? `<div class="aidel-note">Không tải được dữ liệu mới từ máy chủ nên kết quả kiểm tra dựa trên dữ liệu trên màn hình.</div>` : ''}</div>`;
      footer = `${d.remaining ? `<button type="button" class="aidel-btn" data-act="retry">Xem lại phần còn lại</button>` : ''}
        <button type="button" class="aidel-btn" data-act="again">Xoá thêm</button>
        <button type="button" class="aidel-btn primary" data-act="close">Đóng</button>`;
    }

    root.innerHTML = `<div class="aidel-backdrop"><div class="aidel-card" role="dialog" aria-modal="true">
      <header class="aidel-head"><h2>🗑️ Xoá điểm bằng AI</h2>
        <button type="button" class="aidel-x" data-act="close" ${_busy ? 'disabled' : ''} title="Đóng">×</button></header>
      <div class="aidel-body">${body}</div>
      ${footer ? `<footer class="aidel-foot">${footer}</footer>` : ''}
    </div></div>`;
    const b = root.querySelector('.aidel-body'); if (b && scrollTop) b.scrollTop = scrollTop;
  }

  function _onInput(e) {
    if (e.target?.id === 'aidel-text') _text = e.target.value;
  }
  function _onChange(e) {
    const t = e.target;
    if (t?.id === 'aidel-week') { _week = Number(t.value) || _week; return; }
    if (t?.matches?.('input[type="checkbox"][data-id]')) {
      const id = t.getAttribute('data-id');
      if (t.checked) _selected.add(id); else _selected.delete(id);
      _confirming = false; clearTimeout(_confirmTimer);
      _render();
    }
  }
  async function _onClick(e) {
    const el = e.target.closest?.('[data-act]'); if (!el || el.disabled) return;
    const act = el.getAttribute('data-act');
    if (act === 'close') return _close();
    if (act === 'search') return _search();
    if (act === 'back') { _stage = 'input'; _error = ''; _confirming = false; return _render(); }
    if (act === 'again') { _stage = 'input'; _text = ''; _error = ''; _doneInfo = null; _groups = []; _selected = new Set(); return _render(); }
    if (act === 'retry') {
      _busy = true; _status = 'Đang đối chiếu lại với cơ sở dữ liệu…'; _render();
      try { await _lookup(); _stage = 'review'; } catch (err) { _error = String(err?.message || err); }
      _busy = false; _status = ''; return _render();
    }
    if (act === 'sel-all' || act === 'sel-none') {
      const g = _groups[Number(el.getAttribute('data-g'))]; if (!g) return;
      g.matches.forEach(ev => { if (act === 'sel-all') _selected.add(ev.id); else _selected.delete(ev.id); });
      _confirming = false; clearTimeout(_confirmTimer);
      return _render();
    }
    if (act === 'delete') {
      if (!_selected.size) return;
      if (!_confirming) {
        _confirming = true; _render();
        clearTimeout(_confirmTimer);
        _confirmTimer = setTimeout(() => { _confirming = false; if (_stage === 'review' && !_busy) _render(); }, 6000);
        return;
      }
      return _doDelete();
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _root()?.firstChild && !_busy) { e.stopPropagation(); _close(); }
  }, true);

  /* ----------------------------------------------------------
     Nút "Xoá bằng AI" trên thanh công cụ (cạnh nút Tự tính điểm)
  ---------------------------------------------------------- */
  function _inject() {
    if (!_canUse()) return;
    document.querySelectorAll('.toolbar-actions').forEach(bar => {
      if (bar.querySelector('.toolbar-button.ai-delete')) return;
      const anchor = bar.querySelector('.toolbar-button.auto');
      if (!anchor) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toolbar-button ai-delete';
      btn.title = 'Xoá điểm bằng AI (AI đọc yêu cầu, hệ thống tìm trong dữ liệu để bạn xác nhận)';
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
        <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg><span class="tb-label">Xoá bằng AI</span>`;
      anchor.insertAdjacentElement('afterend', btn);
    });
  }
  let _raf = 0;
  function _schedule() { if (_raf) return; _raf = requestAnimationFrame(() => { _raf = 0; _inject(); }); }

  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('.toolbar-button.ai-delete');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    _open();
  });

  function _boot() {
    _injectCSS();
    new MutationObserver(_schedule).observe(document.getElementById('scoreboard-root') || document.body, { childList: true, subtree: true });
    _inject();
  }

  /* ----------------------------------------------------------
     CSS
  ---------------------------------------------------------- */
  function _injectCSS() {
    if (document.getElementById('a3-aidel-css')) return;
    const st = document.createElement('style');
    st.id = 'a3-aidel-css';
    st.textContent = `
.toolbar-button.ai-delete { background: color-mix(in srgb, #ef4444 14%, var(--bg-mid)); color: #f87171; border-color: #ef444433; }
.toolbar-button.ai-delete:hover { background: color-mix(in srgb, #ef4444 24%, var(--bg-mid)); box-shadow: 0 8px 20px #ef444422; transform: translateY(-2px); }
[data-theme="light"] .toolbar-button.ai-delete { color: #dc2626; }

#a3-aidel-root:empty { display: none; }
.aidel-backdrop { position: fixed; inset: 0; z-index: 9600; background: rgba(2,6,15,.62); display: flex; align-items: center; justify-content: center; padding: 16px; animation: aidelFade .15s ease both; }
@keyframes aidelFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes aidelSpin { to { transform: rotate(360deg) } }
.aidel-card { width: 100%; max-width: 720px; max-height: 92vh; display: flex; flex-direction: column; background: var(--bg-modal, #0b1422); color: var(--text, #f1f5f9); border: 1px solid var(--border-modal, #1a2840); border-radius: 16px; box-shadow: 0 24px 64px rgba(0,0,0,.45); overflow: hidden; }
.aidel-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; background: var(--bg-modal-header, #060d1a); border-bottom: 1px solid var(--border-subtle, rgba(148,163,184,.12)); }
.aidel-head h2 { margin: 0; font-size: 16px; font-weight: 800; }
.aidel-x { background: none; border: 0; color: inherit; font-size: 24px; line-height: 1; cursor: pointer; opacity: .7; }
.aidel-x:hover:not(:disabled) { opacity: 1; }
.aidel-body { padding: 16px 18px; overflow-y: auto; flex: 1; min-height: 120px; }
.aidel-foot { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; padding: 12px 18px; border-top: 1px solid var(--border-subtle, rgba(148,163,184,.12)); background: var(--bg-modal-header, #060d1a); }
.aidel-hint { margin: 0 0 10px; font-size: 13px; line-height: 1.55; color: var(--text-muted, #94a3b8); }
.aidel-ta { width: 100%; box-sizing: border-box; resize: vertical; padding: 10px 12px; border-radius: 10px; font: inherit; font-size: 14px; line-height: 1.5; color: inherit; background: var(--bg-input, #060e1a); border: 1px solid var(--border-input, #1a2e48); }
.aidel-ta:focus { outline: 2px solid var(--accent, #2563eb); outline-offset: 0; }
.aidel-weekrow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 10px; font-size: 12.5px; color: var(--text-muted, #94a3b8); }
.aidel-weekrow select { padding: 5px 8px; border-radius: 8px; color: inherit; background: var(--bg-input, #060e1a); border: 1px solid var(--border-input, #1a2e48); font: inherit; }
.aidel-btn { padding: 9px 16px; border-radius: 10px; font: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; color: inherit; background: transparent; border: 1px solid var(--border-input, #1a2e48); }
.aidel-btn:hover:not(:disabled) { background: rgba(148,163,184,.1); }
.aidel-btn:disabled { opacity: .45; cursor: not-allowed; }
.aidel-btn.primary { background: var(--accent, #2563eb); border-color: transparent; color: #fff; }
.aidel-btn.primary:hover:not(:disabled) { filter: brightness(1.1); background: var(--accent, #2563eb); }
.aidel-btn.danger { background: #dc2626; border-color: transparent; color: #fff; }
.aidel-btn.danger:hover:not(:disabled) { background: #b91c1c; }
.aidel-btn.danger.confirming { animation: aidelPulse 1s ease-in-out infinite; }
@keyframes aidelPulse { 50% { box-shadow: 0 0 0 5px rgba(220,38,38,.28) } }
.aidel-err { margin-top: 10px; padding: 9px 12px; border-radius: 10px; font-size: 13px; white-space: pre-wrap; color: #fca5a5; background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.3); }
.aidel-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 36px 0; font-size: 14px; color: var(--text-muted, #94a3b8); }
.aidel-spin { width: 30px; height: 30px; border-radius: 50%; border: 3px solid rgba(148,163,184,.25); border-top-color: var(--accent, #2563eb); animation: aidelSpin .8s linear infinite; }
.aidel-sum { font-size: 13.5px; line-height: 1.55; margin-bottom: 10px; }
.aidel-warn { color: #fbbf24; font-weight: 700; }
.aidel-note { margin-bottom: 10px; padding: 8px 12px; border-radius: 10px; font-size: 12.5px; color: #fcd34d; background: rgba(245,158,11,.1); border: 1px solid rgba(245,158,11,.28); }
.aidel-req { margin-bottom: 12px; padding: 10px 12px; border-radius: 12px; background: var(--bg-input, #060e1a); border: 1px solid var(--border-subtle, rgba(148,163,184,.12)); }
.aidel-reqhead { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.aidel-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.aidel-chip { padding: 2px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 700; background: rgba(148,163,184,.14); }
.aidel-cnt { flex-shrink: 0; font-size: 12px; font-weight: 800; color: var(--text-muted, #94a3b8); }
.aidel-raw { margin-top: 6px; font-size: 12px; font-style: italic; color: var(--text-muted, #94a3b8); }
.aidel-warnbox { margin-top: 8px; padding: 7px 10px; border-radius: 8px; font-size: 12.5px; color: #fcd34d; background: rgba(245,158,11,.1); }
.aidel-empty { margin-top: 8px; font-size: 13px; color: var(--text-muted, #94a3b8); }
.aidel-tools { display: flex; gap: 10px; margin-top: 8px; }
.aidel-tools button { background: none; border: 0; padding: 0; font: inherit; font-size: 12px; font-weight: 700; color: var(--accent, #60a5fa); cursor: pointer; }
.aidel-row { display: flex; align-items: flex-start; gap: 10px; margin-top: 6px; padding: 8px 10px; border-radius: 10px; cursor: pointer; background: rgba(148,163,184,.06); border: 1px solid transparent; }
.aidel-row:hover { border-color: var(--border-input, #1a2e48); }
.aidel-row input { margin-top: 3px; width: 16px; height: 16px; flex-shrink: 0; accent-color: #dc2626; }
.aidel-rowtxt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.aidel-t { font-size: 13.5px; font-weight: 600; line-height: 1.4; word-break: break-word; }
.aidel-m { font-size: 12px; color: var(--text-muted, #94a3b8); }
.aidel-pos { color: #34d399; } .aidel-neg { color: #f87171; }
.aidel-done { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 22px 0; text-align: center; font-size: 14px; }
.aidel-done-ic { width: 54px; height: 54px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 800; color: #fff; background: #16a34a; }
.aidel-done.bad .aidel-done-ic { background: #d97706; }
.aidel-done-t { font-size: 17px; font-weight: 800; }
@media (max-width: 700px) {
  .aidel-backdrop { padding: 0; align-items: stretch; }
  .aidel-card { max-width: none; max-height: none; height: 100%; border-radius: 0; border: 0; }
  .aidel-foot .aidel-btn { flex: 1 1 auto; }
}
`;
    document.head.appendChild(st);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _boot);
  else _boot();

  window.openAIDelete = _open;
})();
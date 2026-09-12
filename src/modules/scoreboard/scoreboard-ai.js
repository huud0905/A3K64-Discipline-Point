/* ============================================================
   A3K64 — Tự tính điểm (AI Auto-Parsing) v1
   Dùng Gemini API để bóc tách văn bản báo lỗi thành danh sách
   điểm, hiển thị preview và batch-apply vào state.
   ------------------------------------------------------------
   Phụ thuộc (từ scoreboard.js / scoreboard-modal.js):
     state, getDerived(), formatScore(), normalizeVi(),
     makeDraftEvent(), saveScoreChanges(), SafeStorage,
     CATEGORY, formatSavedTitle(), newEventDateForDay()
   ============================================================ */

(function A3AIParser() {
  'use strict';

  /* ────────────────────────────────────────────────────────
     CONFIG
  ──────────────────────────────────────────────────────── */
  const AI_ROOT_ID      = 'a3-ai-modal-root';
  const AI_KEY_STORE    = 'a3k64-gemini-key';
  const AI_BASE_URL     = 'https://generativelanguage.googleapis.com/v1beta/models';

  /**
   * Danh sách model thử theo thứ tự ưu tiên (waterfall).
   * Khi model đầu bị quota/lỗi, tự động thử model tiếp theo.
   */
  /**
   * Thứ tự: ưu tiên model có RPM/RPD cao nhất trước.
   * Model ID theo Gemini API (generativelanguage.googleapis.com).
   * UI name → API ID:
   *   Gemini 3.1 Flash Lite → gemini-3.1-flash-lite  (15 RPM, 500 RPD)
   *   Gemini 3.5 Flash Lite → gemini-3.5-flash-lite            (15 RPM, 500 RPD)
   *   Gemini 2.5 Flash Lite → gemini-2.5-flash-lite (10 RPM, 20 RPD)
   *   Gemini 2.5 Flash      → gemini-2.5-flash (5 RPM, 20 RPD)
   *   Gemini 3.5 Flash      → gemini-3.5-flash                (5 RPM, 20 RPD)
   *   Gemini 3.6 Flash      → gemini-3.6-flash                (5 RPM, 20 RPD)
   *   Gemini 3.7 Flash      → gemini-3.7-flash                (5 RPM, 20 RPD)
   *   Gemini 3 Flash        → gemini-3.0-flash                (5 RPM, 20 RPD)
   *   Gemini 2.0 Flash Lite → gemini-2.0-flash-lite           (0/0 — thử vẫn đưa vào)
   *   Gemini 2.0 Flash      → gemini-2.0-flash                (0/0)
   *   Gemini 3.1 Pro        → gemini-3.1-pro                  (0/0)
   *   Gemini 2.5 Pro        → gemini-2.5-pro   (0/0)
   */
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
    'gemini-2.5-pro',         // 0/0
  ];

  /**
   * API Key mặc định dùng chung cho cả lớp.
   * Nếu người dùng lưu key riêng vào localStorage thì key đó được ưu tiên.
   * Để trống chuỗi nếu không muốn hardcode.
   */
  // Không hardcode key ở đây nữa — khi user chưa lưu key riêng,
  // mọi lệnh gọi Gemini sẽ đi qua GAS proxy (action 'aiCall'), nơi
  // giữ key thật trong Script Properties phía server.
  const AI_DEFAULT_KEY  = '';

  /** Các role được phép dùng tính năng AI chấm điểm */
  const ALLOWED_AI_ROLES = ['to_truong', 'gvcn', 'lop_truong', 'bi_thu'];

  /** Danh sách môn học chính thức trong hệ thống */
  const SUBJECTS = [
    'Toán', 'Vật Lí', 'Hoá Học', 'Sinh Học', 'Tin Học',
    'Ngữ Văn', 'Lịch Sử', 'Tiếng Anh', 'Quốc Phòng',
    'Thể Dục', 'GDĐP', 'TNHN', 'Chào Cờ', 'SHL',
  ];

  /* Toolbar nút khởi động AI — inject vào scoreboard action bar */

  /* ────────────────────────────────────────────────────────
     STATE
  ──────────────────────────────────────────────────────── */
  let _open      = false;
  let _loading   = false;
  let _results   = [];   // [{studentId,studentName,reason,score,_matched}]
  let _rawText   = '';
  let _errorMsg  = '';
  /* Chế độ nhập liệu: 'text' | 'image' */
  let _inputMode = 'text';
  /* Dữ liệu ảnh đã upload: { base64: string, mimeType: string, name: string } | null */
  let _imageData = null;
  /* Trạng thái thu gọn cột nhập liệu (PC) để bảng xem trước chiếm
     toàn bộ chiều rộng — lưu localStorage để nhớ lựa chọn giữa các lần mở. */
  let _leftCollapsed = (() => {
    try { return localStorage.getItem('a3-ai-left-collapsed') === '1'; } catch { return false; }
  })();

  /* ────────────────────────────────────────────────────────
     HELPERS
  ──────────────────────────────────────────────────────── */
  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function _root() { return document.getElementById(AI_ROOT_ID); }

  /** Truy cập an toàn vào các biến nội bộ của scoreboard.js qua bridge window.__scoreboard */
  function _sb() { return window.__scoreboard || {}; }

  function _students() {
    try { return _sb().getDerived().rawSummaries || []; } catch { return []; }
  }
  function _currentWeek() {
    try { return _sb().state.week || 1; } catch { return 1; }
  }

  /**
   * Danh sách các Tuần THỰC TẾ đang tồn tại trong hệ thống (đọc từ
   * state.weeks — đã do api.gs trả về), bỏ qua Tuần 0, sắp xếp tăng dần.
   */
  function _weekList() {
    let raw = [];
    try { raw = Array.isArray(_sb().state.weeks) ? _sb().state.weeks : []; } catch { raw = []; }
    return [...new Set(raw.map(Number))].filter(w => Number.isFinite(w) && w > 0).sort((a, b) => a - b);
  }

  /** Tuần có đang bị khoá (isLocked/is_closed) theo state.weekSettings không. */
  function _isWeekLocked(week) {
    let settings = [];
    try { settings = Array.isArray(_sb().state.weekSettings) ? _sb().state.weekSettings : []; } catch { settings = []; }
    const found = settings.find(s => Number(s.week) === Number(week));
    return !!(found && (found.locked || found.isLocked || found.is_closed));
  }

  /** Chọn mặc định: Tuần hiện tại (nếu đang mở) → Tuần mở gần nhất → Tuần mới nhất (nếu tất cả đều khoá). */
  function _defaultApplyWeek() {
    const weeks = _weekList();
    const cur = _currentWeek();
    if (!weeks.length) return cur;
    if (weeks.includes(cur) && !_isWeekLocked(cur)) return cur;
    const openWeeks = weeks.filter(w => !_isWeekLocked(w));
    if (openWeeks.length) return openWeeks[openWeeks.length - 1];
    return weeks[weeks.length - 1];
  }

  /** Render các <option> Tuần, disable tuần đã khoá, chọn sẵn tuần mặc định. */
  function _weekOptionsHtml() {
    const weeks = _weekList();
    if (!weeks.length) {
      const cur = _currentWeek();
      return `<option value="${cur}">Tuần ${cur}</option>`;
    }
    const def = _defaultApplyWeek();
    return weeks.map(w => {
      const locked = _isWeekLocked(w);
      return `<option value="${w}" ${locked ? 'disabled' : ''} ${w === def ? 'selected' : ''}>Tuần ${w}${locked ? ' (Đã khóa)' : ''}</option>`;
    }).join('');
  }
  function _apiKey() {
    try {
      const stored = localStorage.getItem(AI_KEY_STORE);
      // Ưu tiên key người dùng lưu; fallback về key mặc định hardcoded
      return (stored && stored.trim()) ? stored.trim() : AI_DEFAULT_KEY;
    } catch { return AI_DEFAULT_KEY; }
  }
  function _saveApiKey(k) {
    try { localStorage.setItem(AI_KEY_STORE, k.trim()); } catch {}
  }
  /** Kiểm tra key hiện tại có phải key mặc định (không, dùng qua server proxy) không */
  function _isUsingDefaultKey() {
    try {
      const stored = localStorage.getItem(AI_KEY_STORE);
      return !stored || !stored.trim();
    } catch { return true; }
  }

  /** Lấy gasUrl đang dùng chung với scoreboard.js qua bridge window.__scoreboard */
  function _gasUrlForAI() {
    try { return _sb().gasUrl || null; } catch { return null; }
  }

  /**
   * Gọi Gemini gián tiếp qua GAS proxy (action 'aiCall') — dùng khi
   * người dùng KHÔNG nhập key riêng. Server giữ key thật, client
   * không bao giờ thấy key.
   * @param {string} model
   * @param {object} body Payload gốc gửi cho Gemini (system_instruction, contents, ...)
   * @returns {Promise<object>} JSON response y hệt Gemini trả về
   */
  async function _callGeminiViaProxy(model, body) {
    const url = _gasUrlForAI();
    if (!url) {
      throw new Error('Chưa cấu hình GAS URL nên không dùng được key mặc định. Vui lòng nhập Gemini API Key riêng ở bên dưới.');
    }
    // KHÔNG set header Content-Type: application/json — Apps Script Web App
    // không trả lời preflight (OPTIONS) nên request sẽ bị CORS chặn. Gửi
    // body dạng "simple request" (không có headers tuỳ chỉnh) để trình
    // duyệt tự dùng text/plain — api.gs đã tự parse JSON từ raw body rồi.
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ action: 'aiCall', model, geminiBody: body }),
    });
    if (!res.ok) throw new Error(`Proxy lỗi: HTTP ${res.status}`);
    const wrapper = await res.json();
    if (!wrapper || !wrapper.ok) throw new Error((wrapper && wrapper.error) || 'Proxy trả về lỗi không xác định');
    // Worker trả ok:true nhưng data.ok:false khi Gemini lỗi (404 model gone, v.v.)
    const data = wrapper.data;
    if (data && typeof data === 'object' && data.ok === false) {
      const errMsg = data.error || 'Gemini lỗi không xác định';
      const httpStatus = data.httpStatus || 0;
      // Ném lỗi kèm status code để caller biết skip hay dừng
      const err = new Error(errMsg + (httpStatus ? ` (HTTP ${httpStatus})` : ''));
      err.httpStatus = httpStatus;
      throw err;
    }
    return data;
  }

  /**
   * Lấy thông tin user hiện tại.
   * Ưu tiên: biến global userRole/userGroup (set bởi initScoreboard())
   * → fallback sessionStorage 'a3k64-user'
   * → fallback localStorage 'a3k64-login-session-v1'
   */
  function _currentUser() {
    // 1. Biến module-level được set bởi initScoreboard({ userRole, userGroup })
    try {
      if (typeof userRole !== 'undefined' && userRole) {
        return {
          role:  String(userRole).toLowerCase() || 'hoc_sinh',
          group: userGroup ?? null,
        };
      }
    } catch {}

    // 2. sessionStorage 'a3k64-user' (key mà scoreboard-window.html dùng)
    try {
      const raw = sessionStorage.getItem('a3k64-user');
      if (raw) {
        const u = JSON.parse(raw);
        return {
          role:  String(u?.role  || 'hoc_sinh').toLowerCase(),
          group: u?.group ?? u?.to ?? null,
        };
      }
    } catch {}

    // 3. localStorage 'a3k64-login-session-v1' (key của scoreboard.js)
    try {
      const raw = localStorage.getItem('a3k64-login-session-v1');
      if (raw) {
        const session = JSON.parse(raw);
        const u = session?.user || session;
        return {
          role:  String(u?.role  || 'hoc_sinh').toLowerCase(),
          group: u?.group ?? u?.to ?? null,
        };
      }
    } catch {}

    return { role: 'hoc_sinh', group: null };
  }

  /** Kiểm tra user hiện tại có quyền dùng AI không */
  function _canUseAI() {
    return ALLOWED_AI_ROLES.includes(_currentUser().role);
  }

  /* ────────────────────────────────────────────────────────
     GEMINI CALL
  ──────────────────────────────────────────────────────── */
  /**
   * Xây dựng cấu trúc danh sách học sinh phân theo Tổ từ rawSummaries.
   * Trả về object { "Tổ 1": [{id, name}, …], "Tổ 2": […], … }
   * và chuỗi mô tả đẹp để đưa vào system prompt.
   */
  function _buildGroupStructure(students) {
    const groups = {};
    for (const s of students) {
      // Trường group/to/nhom có thể có tên khác nhau tuỳ scoreboard.js
      const grp = s.group || s.to || s.nhom || s.to_nhom || null;
      const label = grp ? `Tổ ${grp}` : 'Chưa phân tổ';
      if (!groups[label]) groups[label] = [];
      groups[label].push({ id: s.id, name: s.name });
    }
    const lines = Object.entries(groups).map(([label, members]) => {
      const memberStr = members.map(m => `    ${m.id}:::${m.name}`).join('\n');
      return `${label}:\n${memberStr}`;
    });
    return { groups, description: lines.join('\n\n') };
  }

  /**
   * Định dạng danh sách quy định VI_PHAM (title, points) thành text
   * để đưa vào system prompt cho Gemini tra cứu.
   * Trả về chuỗi dạng: "r1:::Tên quy định:::-100"
   */
  function _buildRulesCatalog(rules) {
    if (!Array.isArray(rules) || !rules.length) {
      return '(Không đọc được sheet VI_PHAM — tự ước lượng điểm và loại hợp lý theo ngữ cảnh)';
    }
    return rules.map((r, i) => {
      const pts = Number(r.points) || 0;
      const cat = r.category || 'NE_NEP';
      return `r${i + 1}:::${r.title}:::${pts >= 0 ? '+' : ''}${pts}:::${cat}`;
    }).join('\n');
  }

  /**
   * Chuẩn hoá chuỗi "Thứ" do Gemini trả về (VD: "Thứ 3", "T3", "Chủ nhật")
   * thành day-key nội bộ của app: 2,3,4,5,6,7 (T2..T7), 0 (CN).
   * Trả về null nếu không parse được.
   */
  function _dayTextToKey(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    let t;
    try { t = (_sb().normalizeVi || (v=>v))(raw.toLowerCase()); } catch { t = raw.toLowerCase(); }
    if (/chu\s*nhat|^cn$/.test(t)) return 0;
    const m = t.match(/(\d)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 2 && n <= 7) return n;
    }
    return null;
  }

  /**
   * Chuẩn hoá giá trị "tiet" do Gemini trả về (số nguyên, chuỗi "Tiết 2",
   * "T2", hoặc null/thiếu) thành số nguyên Tiết (1–10) hoặc null nếu
   * KHÔNG xác định được — theo yêu cầu KHÔNG được tự đoán số Tiết,
   * nên bất cứ giá trị nào không rõ ràng đều phải trả về null thay vì
   * áng chừng một con số nào đó.
   */
  function _tietTextToKey(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      const n = Math.trunc(raw);
      return (n >= 1 && n <= 10) ? n : null;
    }
    const t = String(raw).trim();
    if (!t) return null;
    const m = t.match(/(\d{1,2})/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return (n >= 1 && n <= 10) ? n : null;
  }

  /* ────────────────────────────────────────────────────────
     POST-PROCESS: Phát hiện Gemini gộp dòng GVNN lặp lại
  ──────────────────────────────────────────────────────────
   Gemini đôi khi bỏ qua quy tắc "mỗi lần xuất hiện = 1 entry riêng"
   và gộp nhiều lần cùng học sinh/tiết thành 1 entry duy nhất.
   Hàm này:
   1. Quét raw text theo ngữ cảnh ngày/tiết đang chạy (carry-over)
   2. Đếm số lần mỗi tên học sinh xuất hiện trong mỗi khoá (ngày, tiết)
   3. So sánh với số entry AI trả về — nếu AI trả ít hơn, nhân bản thêm
   Chỉ áp dụng cho GVNN (matched_rule = "Giáo Viên Nhắc Nhở").
  ──────────────────────────────────────────────────────── */
  /* ──────────────────────────────────────────────────────
     POST-PROCESS: Tính lại điểm + chữ "Lần N" hiển thị GVNN
     theo CẤP SỐ CỘNG
  ──────────────────────────────────────────────────────────
   Gemini luôn trả "score" theo điểm GỐC cố định (VD: -20 cho mọi dòng
   GVNN) và "matched_rule" là tên quy định TĨNH (VD: "Giáo Viên Nhắc Nhở
   - Lần 1" cho MỌI dòng, kể cả dòng thứ 2/3 cùng tiết) — vì bản thân AI
   không biết đây là lần thứ mấy trong tiết, việc đếm đó hoàn toàn do
   backend làm khi LƯU THẬT (xem addGvnnAction trong ok.js, gọi tuần tự
   qua addGvnnEvent — điểm lưu vào DB luôn đúng luỹ tiến).
   Nhưng nếu không tính lại ở đây, bảng XEM TRƯỚC (preview) sẽ hiển thị
   SAI cả điểm lẫn chữ — mọi dòng GVNN cùng hiện "-20" và "Lần 1" dù là
   lần thứ 2/3, khiến giáo viên tưởng nhầm là lỗi rồi mới áp dụng thì kết
   quả thật lại khác → gây hoang mang, dù bản thân việc lưu điểm không hề
   sai.
   Hàm này CHỈ sửa "score" và "matched_rule" để HIỂN THỊ cho đúng —
   KHÔNG ảnh hưởng gì tới luồng lưu thật (GVNN luôn dùng addGvnnEvent,
   backend tự đếm lại từ DB, không phụ thuộc giá trị hiển thị ở đây).
   Giới hạn: chỉ đếm được số lần XUẤT HIỆN TRONG PHIÊN PHÂN TÍCH NÀY
   (theo đúng thứ tự trong mảng results, nhóm theo ngày+tiết+học sinh).
   Nếu học sinh đó trong tuần đã có sẵn vài lần GVNN cùng tiết được lưu
   từ trước (lần phân tích/áp dụng trước đó), preview ở đây sẽ không biết
   để cộng dồn tiếp — điểm thật khi áp dụng vẫn đúng (backend đếm lại từ
   DB), chỉ preview có thể thấp hơn số thật trong trường hợp hiếm này.
  ──────────────────────────────────────────────────────── */
  function _applyGvnnProgressiveScores(results) {
    if (!results || !results.length) return results;
    const GVNN_RULE = 'Giáo Viên Nhắc Nhở';
    const GVNN_STEP = 20;
    const _isGvnn = t => String(t || '').trim().startsWith(GVNN_RULE);

    const occurrenceCount = {}; // key "day|tiet|student_id" -> số lần đã gặp
    return results.map(r => {
      if (!_isGvnn(r.matched_rule)) return r;
      const key = `${r.day}|${r.tiet}|${r.student_id}`;
      const occurrence = (occurrenceCount[key] || 0) + 1;
      occurrenceCount[key] = occurrence;
      // Ghi đè matched_rule tĩnh của Gemini bằng đúng số lần thực tế, để
      // chữ hiển thị luôn khớp với điểm vừa tính lại (tránh trường hợp
      // điểm đã đúng -20/-40 nhưng chữ vẫn lì "Lần 1" ở cả 2 dòng).
      return { ...r, score: -(occurrence * GVNN_STEP), matched_rule: `${GVNN_RULE} - Lần ${occurrence}` };
    });
  }

  function _fixGvnnMerge(results, rawText, students) {
    // Nếu không có raw text (chế độ ảnh) hoặc không có kết quả → bỏ qua
    if (!rawText || !results || !results.length) return results;

    const GVNN_RULE = 'Giáo Viên Nhắc Nhở';
    const _isGvnn   = t => String(t || '').trim().startsWith(GVNN_RULE);

    // Chỉ xử lý các entry GVNN; nếu không có → trả luôn
    const hasGvnn = results.some(r => _isGvnn(r.matched_rule));
    if (!hasGvnn) return results;

    // ─── Bước 1: Xây bảng chuẩn hoá tên học sinh ───────────────────────
    // normKey: lowercase, bỏ dấu, bỏ khoảng trắng — để fuzzy-match
    function _nk(s) {
      return String(s || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd').replace(/\s+/g, '');
    }
    // Map normKey(tên) → student object
    const studentByNorm = {};
    (students || []).forEach(s => { studentByNorm[_nk(s.name)] = s; });

    // ─── Bước 2: Quét raw text, đếm số lần mỗi (normKey(tên), day, tiet) xuất hiện ──
    // Regex nhận diện: Thứ N, T2-T7, thứ hai/ba...
    const DAY_PATTERNS = [
      /thứ\s*([2-7])/i,
      /t([2-7])\b/i,
      /chủ\s*nhật|chu\s*nhat|^cn\s*:/i,
    ];
    const TIET_PATTERN = /tiết\s*(\d{1,2})/i;

    // Bảng: key = "day|tiet|normStudentName" → count
    const rawCounts = {};

    const lines = rawText.split(/\r?\n/);
    let curDay  = null; // ngày đang carry-over (số 2-7 hoặc 0)
    let curTiet = null; // tiết đang carry-over (số 1-10)

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Cập nhật ngày nếu dòng này có Thứ mới
      let dayFound = null;
      for (const pat of DAY_PATTERNS) {
        const m = line.match(pat);
        if (m) {
          if (/chủ|chu/i.test(m[0])) { dayFound = 0; }
          else { dayFound = parseInt(m[1] || m[0].replace(/\D/g, ''), 10) || null; }
          break;
        }
      }
      if (dayFound !== null) curDay = dayFound;

      // Cập nhật tiết nếu dòng này có Tiết mới
      const tietMatch = line.match(TIET_PATTERN);
      if (tietMatch) {
        const tn = parseInt(tietMatch[1], 10);
        if (tn >= 1 && tn <= 10) curTiet = tn;
      }

      if (curDay === null || curTiet === null) continue; // chưa đủ ngữ cảnh

      // Tách phần nội dung sau "Thứ X:" và "Tiết Y:" và "Môn:" (nếu có)
      // để lấy phần tên học sinh
      let content = line
        .replace(/thứ\s*[2-7]/i, '')
        .replace(/t[2-7]\b/i, '')
        .replace(/chủ\s*nhật|chu\s*nhat/i, '')
        .replace(/tiết\s*\d{1,2}/i, '')
        // bỏ tên môn học chuẩn
        .replace(/\b(toán|vật\s*lí|vật\s*ly|hoá\s*học|hoa\s*hoc|hoá|hoa|sinh\s*học|sinh|tin\s*học|tin|ngữ\s*văn|van|lịch\s*sử|su|tiếng\s*anh|anh|quốc\s*phòng|qp|thể\s*dục|td|gdđp|tnhn|chào\s*cờ|cc|shl|lý)\b/gi, '')
        .replace(/[:\-,;]+/g, ' ')
        .trim();

      if (!content) continue;

      // Tách các token (tên học sinh có thể được liệt kê cách nhau bởi dấu phẩy/và)
      const nameParts = content.split(/[,;&và]+/i).map(t => t.trim()).filter(Boolean);
      for (const namePart of nameParts) {
        const nk = _nk(namePart);
        if (!nk || nk.length < 2) continue;

        // Fuzzy: tìm học sinh có normKey bắt đầu bằng nk, hoặc nk chứa trong normKey
        const matched = Object.keys(studentByNorm).find(k =>
          k.startsWith(nk) || nk.startsWith(k) || (nk.length >= 4 && k.includes(nk))
        );
        if (!matched) continue;

        const key = `${curDay}|${curTiet}|${matched}`;
        rawCounts[key] = (rawCounts[key] || 0) + 1;
      }
    }

    // ─── Bước 3: So sánh với AI results và nhân bản thiếu ───────────────
    // Đếm số entry AI đã trả cho mỗi (day, tiet, normStudentName)
    const aiCounts = {};
    results.forEach(r => {
      if (!_isGvnn(r.matched_rule)) return;
      const nk = _nk(r.student_name);
      if (!nk) return;
      // Map sang normKey học sinh thực tế (có thể AI trả tên đầy đủ)
      const matched = Object.keys(studentByNorm).find(k =>
        k === nk || k.startsWith(nk) || nk.startsWith(k) || (nk.length >= 4 && k.includes(nk))
      );
      if (!matched) return;
      const key = `${r.day}|${r.tiet}|${matched}`;
      aiCounts[key] = (aiCounts[key] || 0) + 1;
    });

    // Nhân bản các entry thiếu
    const additions = [];
    for (const [key, rawCount] of Object.entries(rawCounts)) {
      const aiCount = aiCounts[key] || 0;
      if (rawCount <= aiCount) continue; // AI đã đủ hoặc nhiều hơn → OK

      const [dayStr, tietStr, normName] = key.split('|');
      const day  = parseInt(dayStr,  10);
      const tiet = parseInt(tietStr, 10);
      const stu  = studentByNorm[normName];
      if (!stu) continue;

      // Tìm 1 entry GVNN mẫu của cùng học sinh/tiết để clone
      const template = results.find(r =>
        _isGvnn(r.matched_rule) &&
        r.day  === day  &&
        r.tiet === tiet &&
        _nk(r.student_name) === normName
      ) || results.find(r =>
        _isGvnn(r.matched_rule) &&
        r.day === day &&
        r.tiet === tiet &&
        Object.keys(studentByNorm).find(k =>
          (k.startsWith(_nk(r.student_name)) || _nk(r.student_name).startsWith(k)) &&
          k === normName
        )
      );
      if (!template) continue;

      const missing = rawCount - aiCount;
      for (let i = 0; i < missing; i++) {
        additions.push({
          ...template,
          student_id:   stu.id,
          student_name: stu.name,
          _autoDuplicated: true, // flag để UI có thể highlight
        });
      }
    }

    if (!additions.length) return results;

    // Chèn các bản sao sau entry gốc tương ứng (giữ nhóm ngày/tiết liền nhau)
    const out = [...results];
    for (const dup of additions) {
      // Tìm vị trí entry gốc cuối cùng cùng (day, tiet, student) để chèn sau
      let insertAfter = out.findLastIndex(r =>
        r.day === dup.day &&
        r.tiet === dup.tiet &&
        r.student_id === dup.student_id &&
        _isGvnn(r.matched_rule)
      );
      if (insertAfter === -1) insertAfter = out.length - 1;
      out.splice(insertAfter + 1, 0, dup);
    }

    console.info(`[AI] _fixGvnnMerge: thêm ${additions.length} entry bị gộp nhầm (raw vs AI: ${JSON.stringify(rawCounts)} vs ${JSON.stringify(aiCounts)})`);
    return out;
  }

  async function _callGemini(text) {
    // Có key riêng do người dùng nhập → gọi thẳng Gemini bằng key đó.
    // Không có key riêng → gọi qua GAS proxy, dùng key dùng chung được
    // giữ bí mật ở server (không hardcode/lộ ở client nữa).
    const usingOwnKey = !_isUsingDefaultKey();
    const key = usingOwnKey ? _apiKey() : null;

    // Lọc phạm vi học sinh theo role
    const allStudents = _students();
    const user = _currentUser();
    let targetStudents;
    if (user.role === 'to_truong' && user.group) {
      // Tổ trưởng → chỉ thấy học sinh trong tổ của mình
      const grp = String(user.group);
      targetStudents = allStudents.filter(s => {
        const sg = String(s.group || s.to || s.nhom || s.to_nhom || '');
        return sg === grp;
      });
      if (!targetStudents.length) targetStudents = allStudents; // fallback
    } else {
      // GVCN, Lớp trưởng, Bí thư → toàn bộ lớp
      targetStudents = allStudents;
    }
    const nameList = targetStudents.map(s => `${s.id}:::${s.name}`).join('\n');
    const { description: groupDesc } = _buildGroupStructure(targetStudents);

    // Lấy danh sách quy định lỗi/thưởng chuẩn từ sheet VI_PHAM (đã cache
    // sẵn qua fetchRulesFromGas() dùng chung với modal Chấm điểm).
    let rulesRaw = [];
    try { rulesRaw = await _sb().fetchRulesFromGas(); } catch { rulesRaw = []; }
    const rulesDesc = _buildRulesCatalog(rulesRaw);

    const subjectsList = SUBJECTS.join(', ');
    const systemInstruction = `Bạn là trợ lý tự động phân tích và chấm điểm nề nếp cho lớp A3K64.

═══════════════════════════════════════
DANH SÁCH HỌC SINH ĐƯỢC PHÉP CHẤM (phân theo Tổ, định dạng ID:::Họ tên)
═══════════════════════════════════════
${groupDesc}

═══════════════════════════════════════
DANH SÁCH ĐẦY ĐỦ (để fuzzy-match tên viết tắt/nickname)
═══════════════════════════════════════
${nameList}

═══════════════════════════════════════
DANH SÁCH QUY ĐỊNH LỖI/THƯỞNG CHUẨN (SHEET VI_PHAM — định dạng id:::tên:::điểm:::loại)
loai chỉ nhận 1 trong 3 giá trị: NE_NEP (nề nếp), HOC_TAP (học tập), PHONG_TRAO (phong trào).
═══════════════════════════════════════
${rulesDesc}

═══════════════════════════════════════
DANH SÁCH MÔN HỌC CHÍNH THỨC
═══════════════════════════════════════
${subjectsList}

Quy đổi tên viết tắt/tên gọi tắt thường gặp sang tên chuẩn:
- "sinh", "môn sinh", "Sinh" → "Sinh Học"
- "lý", "môn lý", "LÝ", "vật lý" → "Vật Lí"
- "văn", "ngữ văn" → "Ngữ Văn"
- "sử", "lịch sử" → "Lịch Sử"
- "hóa", "hoá", "môn hóa" → "Hoá Học"
- "toán", "môn toán" → "Toán"
- "tin", "tin học" → "Tin Học"
- "anh", "tiếng anh", "e" → "Tiếng Anh"
- "td", "thể dục" → "Thể Dục"
- "qp", "quốc phòng" → "Quốc Phòng"
- "gdđp", "địa phương" → "GDĐP"
- "tnhn", "trải nghiệm" → "TNHN"
- "chào cờ", "cc" → "Chào Cờ"
- "shl", "sinh hoạt lớp" → "SHL"

═══════════════════════════════════════
NHIỆM VỤ
═══════════════════════════════════════
Phân tích đoạn văn bản thô bên dưới (báo lỗi/thưởng nề nếp theo Thứ/Tiết) và bóc tách
thành danh sách JSON. Áp dụng đúng các quy tắc sau:

1. NGÀY: Đọc Thứ được nhắc tới ngay trước mỗi đoạn nội dung (VD: "Thứ 3: Tiết 2:
   Đức Anh, Na k ghi bài môn sinh" → day = "Thứ 3"). Nếu một dòng không nhắc lại
   Thứ mới, dùng lại Thứ gần nhất đã đọc được ở phía trên trong văn bản.
2. TIẾT (tách RIÊNG khỏi Thứ, bắt buộc phải cẩn thận — không được gộp chung với
   bước 1): Đọc số Tiết được nhắc ngay sau Thứ trong cùng đoạn (VD: "Thứ 3: Tiết 2:
   Đức Anh, Na k ghi bài môn sinh" → tiet = 2). Nếu một dòng không nhắc lại Tiết
   mới nhưng vẫn thuộc cùng đoạn với Tiết đã đọc ở ngay phía trên (chưa gặp Thứ
   hoặc Tiết mới nào chen giữa), dùng lại Tiết gần nhất đó. TUYỆT ĐỐI KHÔNG được
   tự suy đoán/áng chừng số Tiết khi văn bản không hề nhắc tới — nếu không tìm
   được Tiết nào áp dụng cho dòng đó (kể cả sau khi dò ngược lên trên), đặt
   "tiet": null. Không dùng 0, không bịa số, không lấy đại Tiết của đoạn khác.
3. MẶC ĐỊNH GVNN: Nếu một dòng có định dạng "Thứ : Môn : Tên" (hoặc biến thể như
   "Chiều thứ X : Môn : Tên", "Sáng thứ X : Môn : Tên") mà KHÔNG ghi kèm lỗi cụ
   thể nào phía sau tên học sinh — tức là sau tên chỉ là hết dòng, hoặc chỉ có
   "lần 2", "lần 3"... — thì LUÔN hiểu đây là vi phạm "Giáo Viên Nhắc Nhở" (GVNN).
   Đặt "matched_rule" = "Giáo Viên Nhắc Nhở", "category" = "NE_NEP".
   Ngược lại, nếu sau tên có mô tả lỗi rõ ràng (VD: "ngủ trong giờ", "không ghi bài",
   "nói chuyện"...) thì khớp với quy định chuẩn theo bước 5 bên dưới như bình thường.
   Môn học đọc được trong dòng (VD: "Toán") ghi vào "subject" — kể cả với GVNN.
4. KHÔNG ĐƯỢC GỘP CÁC DÒNG LẶP LẠI — MỖI LẦN XUẤT HIỆN LÀ 1 ENTRY RIÊNG (cực kỳ
   quan trọng với GVNN): Nếu cùng một học sinh, trong cùng một Thứ + Tiết, được
   ghi nhắc tới NHIỀU LẦN trong văn bản gốc — kể cả khi các dòng đó GIỐNG HỆT
   NHAU về nội dung (VD: "Thứ 2: Tiết 1: Hoá: Thục Anh" xuất hiện 2 dòng liên
   tiếp), hoặc có đánh số "lần 1"/"lần 2"/"lần 3", hoặc chỉ là tên bị viết lặp
   lại — thì đó là NHIỀU vi phạm riêng biệt trong cùng 1 tiết, PHẢI trả về ĐÚNG
   SỐ LƯỢNG entry JSON tương ứng với số lần xuất hiện (VD: xuất hiện 2 lần →
   trả 2 entry JSON giống nhau cho học sinh đó, KHÔNG được gộp lại thành 1).
   TUYỆT ĐỐI KHÔNG tự ý coi các dòng trùng lặp là lỗi đánh máy/lặp ý rồi bỏ bớt
   — điểm trừ GVNN được tính luỹ tiến theo đúng số lần vi phạm trong tiết
   (lần 1 -20, lần 2 -40, lần 3 -60...), nên đếm thiếu 1 dòng là tính sai điểm.
   BULLET/DÒNG CON THỤT LỀ CŨNG LÀ ENTRY RIÊNG: Nếu dưới một dòng "Tiết N: Môn: Tên"
   có thêm một hoặc nhiều dòng con thụt lề vào trong (bullet cấp 2, gạch đầu dòng
   phụ, hoặc chỉ lùi vào so với dòng cha) — dù nội dung dòng con KHÁC với dòng cha
   (VD: dòng cha "Tiết 1: Hóa: Thúc Anh", dòng con thụt lề "Hoài: Thúc Anh") — vẫn
   PHẢI hiểu đây là một vi phạm GVNN RIÊNG BIỆT thuộc cùng học sinh + cùng Tiết đó,
   KHÔNG được coi dòng con là ghi chú/chú thích bổ sung cho dòng cha rồi gộp bỏ.
   Mỗi cấp bullet (cha lẫn con) đều sinh ra 1 entry JSON độc lập.
5. ĐỐI CHIẾU QUY ĐỊNH CHUẨN: So khớp lỗi/thành tích trong văn bản với DANH SÁCH
   QUY ĐỊNH CHUẨN ở trên để tìm quy định gần nghĩa nhất → lấy đúng "tên" của quy
   định đó làm "matched_rule" và lấy "điểm" tương ứng làm "score" mặc định.
6. ƯU TIÊN ĐIỂM GHI RÕ: Nếu người dùng có ghi rõ số điểm trong ngoặc (VD: "(-50)"),
   LUÔN ưu tiên lấy đúng số điểm đó làm "score" thay vì điểm mặc định của quy định
   đã khớp ở bước 5 (nhưng vẫn giữ "matched_rule" là tên quy định gần nhất).
7. LOẠI ĐÁNH GIÁ: Lấy đúng "loai" (category) của quy định đã khớp ở bước 5 làm giá
   trị "category" của dòng đó. Nếu không khớp được quy định chuẩn nào, tự suy luận
   loại hợp lý nhất theo ngữ cảnh nội dung (mặc định NE_NEP nếu không rõ).
8. MÔN HỌC: Nếu vi phạm/thành tích liên quan đến một môn học cụ thể (thường thuộc
   loại HOC_TAP), nhận diện và chuẩn hóa sang tên môn học chính thức trong danh sách
   ở trên, ghi vào trường "subject". Nếu không liên quan đến môn học nào (ví dụ: vi
   phạm nề nếp chung, vắng chào cờ…) thì "subject" = null.
9. FUZZY MATCHING TÊN: Khớp tên viết tắt, nickname, họ đơn trong văn bản với tên
   đầy đủ trong DANH SÁCH HỌC SINH.
10. UNKNOWN: Nếu không khớp được học sinh nào → student_id = "UNKNOWN",
   student_name = tên xuất hiện y nguyên trong văn bản.
11. XỬ LÝ LỖI TẬP THỂ:
   - "Tổ N" / "Cả tổ N" → nhân bản lỗi/thưởng đó cho TẤT CẢ học sinh thuộc Tổ N
     trong danh sách phân tổ ở trên, mỗi học sinh một entry riêng.
   - "Cả lớp" / "Tất cả" / "Toàn lớp" → nhân bản cho TẤT CẢ học sinh trong danh sách.
   - Có cụm "mỗi người" / "mỗi em" → áp dụng điểm riêng cho từng cá nhân (KHÔNG
     nhân điểm lên theo số người).
12. GIỚI HẠN PHẠM VI (bắt buộc): Chỉ trả kết quả cho học sinh CÓ TÊN trong danh
   sách được cấp ở trên. Bỏ qua hoàn toàn tên học sinh KHÔNG thuộc danh sách này.
13. OUTPUT: Chỉ trả về JSON thuần, KHÔNG có markdown, KHÔNG có backtick, KHÔNG
   giải thích gì thêm ngoài JSON. Trường "tiet" LUÔN phải xuất hiện ở mỗi phần tử —
   là số nguyên nếu đọc được, hoặc null nếu không đọc được (không được bỏ trường này).

MẪU KẾT QUẢ JSON TRẢ VỀ:
[
  {
    "student_id": "vi-kim-na",
    "student_name": "Vi Kim Na",
    "day": "Thứ 3",
    "tiet": 2,
    "reason": "Không ghi bài môn Sinh",
    "matched_rule": "Không ghi bài",
    "category": "HOC_TAP",
    "subject": "Sinh Học",
    "score": -100
  },
  {
    "student_id": "nguyen-van-a",
    "student_name": "Nguyễn Văn A",
    "day": "Thứ 2",
    "tiet": null,
    "reason": "Đi học muộn (văn bản không ghi rõ Tiết)",
    "matched_rule": "Đi học muộn",
    "category": "NE_NEP",
    "subject": null,
    "score": -50
  }
]`;

    const body = {
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: [{ parts: [{ text: text }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 2048,
      },
    };

    // Waterfall: thử từng model cho đến khi thành công
    let lastError = null;
    for (const model of AI_MODEL_FALLBACKS) {
      try {
        let data;
        if (usingOwnKey) {
          const endpoint = `${AI_BASE_URL}/${model}:generateContent?key=${encodeURIComponent(key)}`;
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            const errMsg  = errJson?.error?.message || `HTTP ${res.status}`;
            const isQuota = res.status === 429 || /quota|rate.?limit|resource.?exhaust/i.test(errMsg);
            const isGone  = res.status === 404 || /no longer available|not found|deprecated/i.test(errMsg);
            if (isQuota || isGone) {
              lastError = new Error(`[${model}] ${isGone ? 'model không còn tồn tại' : 'quota hết'}`);
              console.warn(`[AI] ${model} ${isGone ? 'không còn tồn tại' : 'bị quota'}, thử model tiếp theo…`);
              continue;
            }
            throw new Error(`Gemini lỗi (${model}): ${errMsg}`);
          }
          data = await res.json();
        } else {
          try {
            data = await _callGeminiViaProxy(model, body);
          } catch (proxyErr) {
            const errMsg  = proxyErr?.message || 'Lỗi proxy';
            const isQuota = /quota|rate.?limit|resource.?exhaust|429/i.test(errMsg);
            const isGone  = /no longer available|not found|deprecated|404/i.test(errMsg);
            if (isQuota || isGone) {
              lastError = new Error(`[${model}] ${isGone ? 'model không còn tồn tại' : 'quota hết'}`);
              console.warn(`[AI] ${model} ${isGone ? 'không còn tồn tại' : 'bị quota'}, thử model tiếp theo…`);
              continue;
            }
            throw new Error(`Gemini lỗi (${model}): ${errMsg}`);
          }
        }

        const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        try {
          const parsed = JSON.parse(raw.trim());
          if (!Array.isArray(parsed)) throw new Error('Không phải array');
          // Ghi nhớ model thành công để lần sau ưu tiên
          console.info(`[AI] Dùng model: ${model}`);
          return parsed;
        } catch {
          throw new Error(`Gemini (${model}) trả về dữ liệu không hợp lệ. Thử lại hoặc làm ngắn văn bản.`);
        }
      } catch (err) {
        // Nếu là lỗi quota đã được xử lý bên trong → continue đã được gọi
        // Nếu là throw thủ công từ bên trong → re-throw
        if (!err.message.startsWith(`[${model}] quota`)) throw err;
        lastError = err;
      }
    }

    // Tất cả model đều hết quota
    throw new Error(
      `Tất cả ${AI_MODEL_FALLBACKS.length} model đều hết quota. 
` +
      `Vui lòng thử lại sau vài phút hoặc dùng API key khác.
(${lastError?.message})`
    );
  }

  /**
   * Gọi Gemini với đầu vào là ảnh (inline_data base64).
   * Dùng cùng system prompt và waterfall model như _callGemini,
   * nhưng contents chứa thêm phần image part.
   */
  async function _callGeminiWithImage(imgData) {
    const usingOwnKey = !_isUsingDefaultKey();
    const key = usingOwnKey ? _apiKey() : null;

    // Xây dựng danh sách học sinh y hệt _callGemini
    const allStudents = _students();
    const user = _currentUser();
    let targetStudents;
    if (user.role === 'to_truong' && user.group) {
      const grp = String(user.group);
      targetStudents = allStudents.filter(s => {
        const sg = String(s.group || s.to || s.nhom || s.to_nhom || '');
        return sg === grp;
      });
      if (!targetStudents.length) targetStudents = allStudents;
    } else {
      targetStudents = allStudents;
    }
    const nameList = targetStudents.map(s => `${s.id}:::${s.name}`).join('\n');
    const { description: groupDesc } = _buildGroupStructure(targetStudents);

    let rulesRaw = [];
    try { rulesRaw = await _sb().fetchRulesFromGas(); } catch { rulesRaw = []; }
    const rulesDesc = _buildRulesCatalog(rulesRaw);
    const subjectsList = SUBJECTS.join(', ');

    // System prompt giống _callGemini, chỉ thay phần NHIỆM VỤ để nhận ảnh
    const systemInstruction = `Bạn là trợ lý tự động phân tích và chấm điểm nề nếp cho lớp A3K64.

═══════════════════════════════════════
DANH SÁCH HỌC SINH ĐƯỢC PHÉP CHẤM (phân theo Tổ, định dạng ID:::Họ tên)
═══════════════════════════════════════
${groupDesc}

═══════════════════════════════════════
DANH SÁCH ĐẦY ĐỦ (để fuzzy-match tên viết tắt/nickname)
═══════════════════════════════════════
${nameList}

═══════════════════════════════════════
DANH SÁCH QUY ĐỊNH LỖI/THƯỞNG CHUẨN (SHEET VI_PHAM — định dạng id:::tên:::điểm:::loại)
loai chỉ nhận 1 trong 3 giá trị: NE_NEP (nề nếp), HOC_TAP (học tập), PHONG_TRAO (phong trào).
═══════════════════════════════════════
${rulesDesc}

═══════════════════════════════════════
DANH SÁCH MÔN HỌC CHÍNH THỨC
═══════════════════════════════════════
${subjectsList}

Quy đổi tên viết tắt/tên gọi tắt thường gặp sang tên chuẩn:
- "sinh", "môn sinh", "Sinh" → "Sinh Học"
- "lý", "môn lý", "LÝ", "vật lý" → "Vật Lí"
- "văn", "ngữ văn" → "Ngữ Văn"
- "sử", "lịch sử" → "Lịch Sử"
- "hóa", "hoá", "môn hóa" → "Hoá Học"
- "toán", "môn toán" → "Toán"
- "tin", "tin học" → "Tin Học"
- "anh", "tiếng anh", "e" → "Tiếng Anh"
- "td", "thể dục" → "Thể Dục"
- "qp", "quốc phòng" → "Quốc Phòng"
- "gdđp", "địa phương" → "GDĐP"
- "tnhn", "trải nghiệm" → "TNHN"
- "chào cờ", "cc" → "Chào Cờ"
- "shl", "sinh hoạt lớp" → "SHL"

═══════════════════════════════════════
NHIỆM VỤ
═══════════════════════════════════════
Đọc nội dung từ ẢNH được gửi kèm (có thể là ảnh chụp màn hình chat, ảnh chụp tờ giấy, bảng chấm điểm tay viết, v.v.) và bóc tách thành danh sách JSON điểm nề nếp. Áp dụng đúng các quy tắc sau:

1. NHẬN DẠNG VĂN BẢN TỪ ẢNH: Đọc toàn bộ văn bản có trong ảnh, bao gồm chữ in, chữ viết tay, nội dung chat, bảng biểu.
2. NGÀY: Đọc Thứ được nhắc tới ngay trước mỗi đoạn nội dung. Nếu một dòng không nhắc lại Thứ mới, dùng lại Thứ gần nhất đã đọc được ở phía trên.
3. TIẾT: Đọc số Tiết được nhắc ngay sau Thứ. Nếu không tìm được Tiết nào áp dụng, đặt "tiet": null. Không tự suy đoán số Tiết.
4. MẶC ĐỊNH GVNN: Nếu một dòng có định dạng "Thứ : Môn : Tên" mà KHÔNG ghi kèm lỗi cụ thể — LUÔN hiểu là vi phạm "Giáo Viên Nhắc Nhở" (GVNN). Đặt "matched_rule" = "Giáo Viên Nhắc Nhở", "category" = "NE_NEP".
5. KHÔNG ĐƯỢC GỘP CÁC DÒNG LẶP LẠI — MỖI LẦN XUẤT HIỆN LÀ 1 ENTRY RIÊNG (cực kỳ quan trọng với GVNN): Nếu cùng một học sinh, trong cùng một Thứ + Tiết, xuất hiện NHIỀU dòng trong ảnh — kể cả khi các dòng đó GIỐNG HỆT NHAU (VD: 2 dòng viết tay liên tiếp đều là "Tiết 1: Hoá: Thục Anh"), hoặc có đánh số "lần 1"/"lần 2" — thì đó là NHIỀU vi phạm riêng biệt, PHẢI trả về ĐÚNG SỐ LƯỢNG entry JSON tương ứng với số lần xuất hiện trong ảnh (KHÔNG gộp các dòng trùng lặp thành 1 entry). Điểm trừ GVNN tính luỹ tiến theo đúng số lần vi phạm trong tiết (lần 1 -20, lần 2 -40, lần 3 -60...), nên bỏ sót 1 dòng là tính sai điểm.
5b. BULLET/DÒNG CON THỤT LỀ TRONG ẢNH CŨNG LÀ ENTRY RIÊNG: Nếu trong ảnh, dưới một dòng "Tiết N: Môn: Tên" có thêm một hoặc nhiều dòng con được thụt lề/lùi vào so với dòng cha (bullet cấp 2, gạch đầu dòng phụ, hoặc chỉ căn lề vào trong hơn) — dù nội dung dòng con KHÁC với dòng cha (VD: dòng cha "Tiết 1: Hóa: Thúc Anh", dòng con thụt lề "Hoài: Thúc Anh") — vẫn PHẢI hiểu đây là một vi phạm GVNN RIÊNG BIỆT của cùng học sinh, cùng Thứ + Tiết đó. TUYỆT ĐỐI KHÔNG được coi dòng con thụt lề là ghi chú/chú thích/bổ sung của dòng cha rồi bỏ qua không tạo entry cho nó — mỗi cấp bullet (cả dòng cha lẫn dòng con) đều phải sinh ra 1 entry JSON độc lập.
6. ĐỐI CHIẾU QUY ĐỊNH CHUẨN: So khớp lỗi/thành tích với DANH SÁCH QUY ĐỊNH CHUẨN để tìm quy định gần nghĩa nhất.
7. ƯU TIÊN ĐIỂM GHI RÕ: Nếu người dùng ghi rõ số điểm trong ngoặc (VD: "(-50)"), LUÔN ưu tiên lấy đúng số điểm đó.
8. LOẠI ĐÁNH GIÁ: Lấy đúng "loai" của quy định đã khớp. Nếu không khớp, tự suy luận loại hợp lý (mặc định NE_NEP).
9. MÔN HỌC: Nhận diện môn học liên quan, chuẩn hóa sang tên chính thức. Nếu không liên quan môn học → "subject": null.
10. FUZZY MATCHING TÊN: Khớp tên viết tắt, nickname với tên đầy đủ trong DANH SÁCH HỌC SINH.
11. UNKNOWN: Nếu không khớp được học sinh nào → student_id = "UNKNOWN", student_name = tên trong ảnh.
12. XỬ LÝ LỖI TẬP THỂ: "Tổ N" / "Cả tổ N" → nhân bản cho TẤT CẢ học sinh Tổ N. "Cả lớp" / "Tất cả" → nhân bản cho TẤT CẢ.
13. GIỚI HẠN PHẠM VI: Chỉ trả kết quả cho học sinh CÓ TÊN trong danh sách được cấp.
14. OUTPUT: Chỉ trả về JSON thuần, KHÔNG có markdown, KHÔNG có backtick, KHÔNG giải thích gì thêm ngoài JSON.

MẪU KẾT QUẢ JSON TRẢ VỀ:
[
  {
    "student_id": "vi-kim-na",
    "student_name": "Vi Kim Na",
    "day": "Thứ 3",
    "tiet": 2,
    "reason": "Không ghi bài môn Sinh",
    "matched_rule": "Không ghi bài",
    "category": "HOC_TAP",
    "subject": "Sinh Học",
    "score": -100
  }
]`;

    const body = {
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: [{
        parts: [
          {
            inline_data: {
              mime_type: imgData.mimeType,
              data: imgData.base64,
            },
          },
          { text: 'Hãy đọc ảnh trên và trả về JSON danh sách điểm theo đúng định dạng đã mô tả.' },
        ],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 2048,
      },
    };

    // Waterfall model — ưu tiên model vision (multimodal)
    // Tất cả Gemini Flash/Pro đều hỗ trợ vision, dùng lại AI_MODEL_FALLBACKS
    let lastError = null;
    for (const model of AI_MODEL_FALLBACKS) {
      try {
        let data;
        if (usingOwnKey) {
          const endpoint = `${AI_BASE_URL}/${model}:generateContent?key=${encodeURIComponent(key)}`;
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            const errMsg  = errJson?.error?.message || `HTTP ${res.status}`;
            const isQuota = res.status === 429 || /quota|rate.?limit|resource.?exhaust/i.test(errMsg);
            const isGone  = res.status === 404 || /no longer available|not found|deprecated/i.test(errMsg);
            if (isQuota || isGone) {
              lastError = new Error(`[${model}] ${isGone ? 'model không còn tồn tại' : 'quota hết'}`);
              console.warn(`[AI-Image] ${model} ${isGone ? 'không còn tồn tại' : 'bị quota'}, thử model tiếp theo…`);
              continue;
            }
            throw new Error(`Gemini lỗi (${model}): ${errMsg}`);
          }
          data = await res.json();
        } else {
          try {
            data = await _callGeminiViaProxy(model, body);
          } catch (proxyErr) {
            const errMsg  = proxyErr?.message || 'Lỗi proxy';
            const isQuota = /quota|rate.?limit|resource.?exhaust|429/i.test(errMsg);
            const isGone  = /no longer available|not found|deprecated|404/i.test(errMsg);
            if (isQuota || isGone) {
              lastError = new Error(`[${model}] ${isGone ? 'model không còn tồn tại' : 'quota hết'}`);
              console.warn(`[AI-Image] ${model} ${isGone ? 'không còn tồn tại' : 'bị quota'}, thử model tiếp theo…`);
              continue;
            }
            throw new Error(`Gemini lỗi (${model}): ${errMsg}`);
          }
        }

        const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        try {
          const parsed = JSON.parse(raw.trim());
          if (!Array.isArray(parsed)) throw new Error('Không phải array');
          console.info(`[AI-Image] Dùng model: ${model}`);
          return parsed;
        } catch {
          throw new Error(`Gemini (${model}) trả về dữ liệu không hợp lệ. Thử lại hoặc dùng ảnh rõ hơn.`);
        }
      } catch (err) {
        if (!err.message.startsWith(`[${model}] quota`)) throw err;
        lastError = err;
      }
    }

    throw new Error(
      `Tất cả ${AI_MODEL_FALLBACKS.length} model đều hết quota. Vui lòng thử lại sau vài phút hoặc dùng API key khác.\n(${lastError?.message})`
    );
  }

  /* ────────────────────────────────────────────────────────
     OPEN / CLOSE
  ──────────────────────────────────────────────────────── */
  function _open_modal() {
    if (_open) return;
    _open         = true;
    _loading      = false;
    _results      = [];
    _rawText      = '';
    _errorMsg     = '';
    _inputMode    = 'text';
    _imageData    = null;
    _mobActiveTab = 'input'; // luôn bắt đầu từ tab nhập liệu
    _mount();
  }

  function _close() {
    if (!_open) return;
    _open = false;
    const root = _root();
    if (root) root.innerHTML = '';
    document.removeEventListener('keydown', _onKey);
    document.removeEventListener('paste', _onPaste);
  }

  function _onKey(e) {
    if (e.key === 'Escape' && _open) _close();
  }

  /**
   * Ctrl+V / Cmd+V dán ảnh trực tiếp (chụp màn hình, copy ảnh từ nơi khác…)
   * vào modal — không cần lưu file ra ổ đĩa rồi mới chọn.
   * Bỏ qua nếu clipboard không chứa ảnh (để không phá hành vi dán text
   * bình thường khi đang gõ trong ô văn bản).
   */
  function _onPaste(e) {
    if (!_open) return;
    const items = e.clipboardData?.items;
    if (!items || !items.length) return;
    let imageFile = null;
    for (const item of items) {
      if (item.kind === 'file' && item.type?.startsWith('image/')) {
        imageFile = item.getAsFile();
        break;
      }
    }
    if (!imageFile) return; // không có ảnh trong clipboard → giữ hành vi paste mặc định
    e.preventDefault();
    if (_inputMode !== 'image') _switchInputMode('image');
    // File dán từ clipboard thường không có tên thật — đặt tên dễ nhận biết
    const named = imageFile.name && imageFile.name !== 'image.png'
      ? imageFile
      : new File([imageFile], `paste_${Date.now()}.${(imageFile.type.split('/')[1] || 'png')}`, { type: imageFile.type });
    _loadImageFile(named);
  }

  /* ────────────────────────────────────────────────────────
     MOUNT
  ──────────────────────────────────────────────────────── */
  function _mount() {
    const root = _root();
    if (!root) return;
    root.innerHTML = _buildHTML();
    _bindEvents();
    document.addEventListener('keydown', _onKey);
    document.addEventListener('paste', _onPaste);
    // Áp dụng trạng thái tab ngay sau khi render:
    // ai-right phải có mob-hidden lúc đầu (tab "input" đang active)
    _mobSwitchTab(_mobActiveTab);
    setTimeout(() => root.querySelector('#ai-textarea')?.focus(), 80);
  }

  function _buildHTML() {
    const key = _apiKey();
    return `
<div class="ai-backdrop" id="ai-backdrop">
  <div class="ai-modal${_leftCollapsed ? ' ai-left-collapsed' : ''}" role="dialog" aria-modal="true" aria-label="Tự tính điểm bằng AI">

    <!-- HEADER -->
    <header class="ai-header">
      <div class="ai-header-left">
        <div class="ai-header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="22" height="22">
            <path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
          </svg>
        </div>
        <div>
          <div class="ai-header-title">Tự tính điểm <span class="ai-badge">AI</span></div>
          <div class="ai-header-sub">Dán văn bản hoặc chụp ảnh báo lỗi → Gemini tự bóc tách tên & điểm</div>
        </div>
      </div>
      <button type="button" class="ai-close-btn" id="ai-close-btn" title="Đóng (Esc)">
        <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2.5" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </header>

    <!-- BODY: 2 cột (PC) / tab switcher (mobile) -->
    <div class="ai-body">

      <!-- Tab bar — chỉ hiện trên mobile (display:none trên PC qua CSS) -->
      <div class="ai-mob-tabs" style="display:none" id="ai-mob-tabs">
        <button type="button" class="ai-mob-tab active" id="ai-mob-tab-input" onclick="aiMobSwitchTab('input')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Nhập liệu
        </button>
        <button type="button" class="ai-mob-tab" id="ai-mob-tab-preview" onclick="aiMobSwitchTab('preview')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          Bảng xem trước
          <span class="ai-mob-tab-count" id="ai-mob-preview-count" style="display:none">0</span>
        </button>
      </div>

      <!-- CỘT TRÁI: Input -->
      <div class="ai-left" id="ai-panel-input">
        <!-- Tuần áp dụng — LUÔN Ở ĐẦU cột trái -->
        <div class="ai-section ai-week-section ai-week-top-section">
          <label class="ai-section-label" for="ai-week-input">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Tuần áp dụng
          </label>
          <select id="ai-week-input" class="ai-select ai-week-input ai-week-input-full">
            ${_weekOptionsHtml()}
          </select>
        </div>

        <!-- Input mode switcher -->
        <div class="ai-input-mode-bar">
          <button type="button" class="ai-mode-tab${_inputMode === 'text' ? ' active' : ''}" id="ai-mode-tab-text" data-mode="text">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Văn bản
          </button>
          <button type="button" class="ai-mode-tab${_inputMode === 'image' ? ' active' : ''}" id="ai-mode-tab-image" data-mode="image">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            Hình ảnh
          </button>
        </div>

        <!-- Panel: Văn bản -->
        <div class="ai-section ai-input-panel-text${_inputMode !== 'text' ? ' ai-input-panel-hidden' : ''}">
          <textarea id="ai-textarea" class="ai-textarea"
            placeholder="Ví dụ:
Tiến sử dụng điện thoại trừ 600
Thắng không nạp điện thoại trừ 300
Hằng đạt giải văn nghệ cộng 200
Cả tổ 3 vắng chào cờ trừ 100 mỗi người"
            spellcheck="false">${_esc(_rawText)}</textarea>
          <div class="ai-input-actions">
            <span class="ai-char-count" id="ai-char-count">${_rawText.length} ký tự</span>
            <button type="button" class="ai-clear-btn" id="ai-clear-textarea" title="Xoá nội dung">Xoá</button>
          </div>
        </div>

        <!-- Panel: Hình ảnh -->
        <div class="ai-section ai-input-panel-image${_inputMode !== 'image' ? ' ai-input-panel-hidden' : ''}">
          <div class="ai-image-drop-zone" id="ai-image-drop-zone" tabindex="0" role="button" aria-label="Chọn hoặc kéo thả ảnh vào đây">
            ${_imageData
              ? `<div class="ai-image-preview-wrap">
                   <img class="ai-image-preview" id="ai-image-preview-img" src="data:${_imageData.mimeType};base64,${_imageData.base64}" alt="Ảnh đã chọn"/>
                   <div class="ai-image-preview-name">${_esc(_imageData.name)}</div>
                 </div>`
              : `<div class="ai-image-drop-placeholder">
                   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="38" height="38" opacity=".35"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                   <span>Kéo thả ảnh vào đây<br/>hoặc <strong>bấm để chọn file</strong><br/>hoặc dán bằng <strong>Ctrl+V</strong></span>
                   <span class="ai-image-drop-hint">PNG, JPG, WEBP · tối đa 10 MB</span>
                 </div>`
            }
          </div>
          <input type="file" id="ai-image-file-input" accept="image/png,image/jpeg,image/webp,image/gif" style="display:none" aria-hidden="true"/>
          <div class="ai-input-actions">
            <span class="ai-char-count" id="ai-image-status">${_imageData ? _imageData.name : 'Chưa có ảnh'}</span>
            <button type="button" class="ai-clear-btn" id="ai-clear-image" title="Xoá ảnh"${!_imageData ? ' disabled style="opacity:.4;cursor:not-allowed"' : ''}>Xoá</button>
          </div>
        </div>

        <!-- Analyze button -->
        <button type="button"
          class="ai-analyze-btn${_loading ? ' loading' : ''}${!_canUseAI() ? ' disabled no-perm' : ''}"
          id="ai-analyze-btn"
          ${(_loading || !_canUseAI()) ? 'disabled' : ''}>
          ${_loading
            ? `<span class="ai-spinner"></span> Đang phân tích…`
            : !_canUseAI()
              ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Không có quyền`
              : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="16" height="16"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> Phân tích dữ liệu`
          }
        </button>
        ${!_canUseAI() ? `<div class="ai-no-perm-banner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span>Bạn không có thẩm quyền sử dụng tính năng AI chấm điểm.<br/>
          <small>Chỉ Tổ trưởng, Lớp trưởng, Bí thư và GVCN mới được phép.</small></span>
        </div>` : ''}

        ${_errorMsg ? `<div class="ai-error-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          ${_esc(_errorMsg)}
        </div>` : ''}

        <!-- API Key section -->
        <div class="ai-section ai-key-section">
          <label class="ai-section-label" for="ai-key-input">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
            Gemini API Key
            ${_isUsingDefaultKey()
              ? `<span class="ai-key-default-badge">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10"><polyline points="20 6 9 17 4 12"/></svg>
                  Dùng key mặc định
                </span>`
              : `<span class="ai-key-custom-badge">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10"><polyline points="20 6 9 17 4 12"/></svg>
                  Key riêng
                </span>`
            }
          </label>
          <div class="ai-key-row">
            <div class="ai-key-input-wrap">
              <input type="password" id="ai-key-input" class="ai-key-input"
                placeholder="${_isUsingDefaultKey() ? '(đang dùng key mặc định)' : 'AIza…'}"
                value="${_isUsingDefaultKey() ? '' : _esc(key)}"
                autocomplete="off" spellcheck="false"/>
              <button type="button" class="ai-key-eye-btn" id="ai-key-eye-btn" title="Ẩn/hiện key" aria-label="Toggle hiển thị API key">
                <svg id="ai-eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </div>
            <button type="button" class="ai-key-save-btn" id="ai-key-save-btn">Lưu</button>
            ${!_isUsingDefaultKey() ? `<button type="button" class="ai-key-reset-btn" id="ai-key-reset-btn" title="Xoá key riêng, dùng lại key mặc định">↩</button>` : ''}
          </div>
          <div class="ai-key-hint">
            ${_isUsingDefaultKey()
              ? 'Đang dùng key mặc định của lớp. Nhập key riêng bên trên nếu muốn ghi đè.'
              : `Key riêng được lưu ở localStorage trên trình duyệt này. <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener" class="ai-link">Lấy key mới</a>`
            }
          </div>
        </div>

        <!-- Loại mặc định (dùng khi AI không xác định được loại cho 1 dòng) -->
        <div class="ai-section ai-week-section">
          <label class="ai-section-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3H4a1 1 0 0 0-1 1v5.59a2 2 0 0 0 .59 1.41L13.17 21a2 2 0 0 0 2.82 0l4.6-4.6a2 2 0 0 0 0-2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            Loại (mặc định)
          </label>
          <div class="ai-week-row">
            <label class="ai-week-label">Khi AI không xác định được
              <select id="ai-category-input" class="ai-select">
                <option value="NE_NEP" selected>Nề nếp</option>
                <option value="HOC_TAP">Học tập</option>
                <option value="PHONG_TRAO">Phong trào</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <!-- CỘT PHẢI: Preview table -->
      <div class="ai-right" id="ai-panel-preview">
        <div class="ai-preview-head">
          <div class="ai-preview-head-left">
            <button type="button" class="ai-collapse-btn${_leftCollapsed ? ' active' : ''}" id="ai-collapse-btn"
              title="${_leftCollapsed ? 'Hiện lại khung nhập liệu' : 'Thu gọn khung nhập liệu — xem full bảng'}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="14" height="14">
                <polyline points="${_leftCollapsed ? '9 6 15 12 9 18' : '15 6 9 12 15 18'}"/>
              </svg>
              <span>${_leftCollapsed ? 'Mở rộng' : 'Thu gọn'}</span>
            </button>
            <span class="ai-section-label">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              Bảng xem trước
            </span>
          </div>
          <div class="ai-preview-stats" id="ai-preview-stats"></div>
        </div>
        <div class="ai-preview-wrap" id="ai-preview-wrap">
          ${_buildPreviewContent()}
        </div>
      </div>

    </div>


    <!-- FOOTER -->
    <footer class="ai-footer">
      <div class="ai-footer-left">
        <span class="ai-footer-hint">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          Kiểm tra kỹ trước khi áp dụng. Thao tác không thể hoàn tác.
        </span>
      </div>
      <div class="ai-footer-right">
        <button type="button" class="ai-cancel-btn" id="ai-cancel-btn">Hủy</button>
        <button type="button" class="ai-apply-btn${_results.length ? '' : ' disabled'}" id="ai-apply-btn"
          ${!_results.length ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15"><polyline points="20 6 9 17 4 12"/></svg>
          Xác nhận áp dụng
          ${_results.length ? `<span class="ai-apply-count">${_results.length}</span>` : ''}
        </button>
      </div>
    </footer>

  </div>
</div>`;
  }

  /* ────────────────────────────────────────────────────────
     BUILD PREVIEW TABLE
  ──────────────────────────────────────────────────────── */
  function _buildPreviewContent() {
    if (_loading) {
      return `<div class="ai-preview-loading">
        <div class="ai-big-spinner"></div>
        <span>Gemini đang phân tích…</span>
      </div>`;
    }
    if (!_results.length && !_rawText) {
      return `<div class="ai-preview-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40" opacity=".25"><path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
        <span>Dán văn bản bên trái và bấm<br/><strong>Phân tích dữ liệu</strong></span>
      </div>`;
    }
    if (!_results.length) {
      return `<div class="ai-preview-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36" opacity=".2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        <span>Không bóc tách được dữ liệu nào.<br/>Thử làm rõ hơn nội dung văn bản.</span>
      </div>`;
    }

    const dayOptions = [
      {v:2,l:'T2'},{v:3,l:'T3'},{v:4,l:'T4'},{v:5,l:'T5'},{v:6,l:'T6'},{v:7,l:'T7'},{v:0,l:'CN'},
    ];
    const tietOptions = [1,2,3,4,5,6,7,8,9,10];
    const categoryOptions = [
      {v:'NE_NEP',l:'Nề nếp'},{v:'HOC_TAP',l:'Học tập'},{v:'PHONG_TRAO',l:'Phong trào'},
    ];
    function categoryCssKey(c) {
      return String(c||'NE_NEP').toLowerCase().replace(/[^a-z_]/g,'');
    }
    const students = _students();
    const rows = _results.map((r, i) => {
      const unmatched = r.student_id === 'UNKNOWN' || !r.student_id;
      const missingTiet = r.tiet === null || r.tiet === undefined || r.tiet === '';
      const autoDup = !!r._autoDuplicated;
      const scoreClass = Number(r.score) >= 0 ? 'pos' : 'neg';
      const selectOpts = students.map(s =>
        `<option value="${_esc(s.id)}" ${s.id === r.student_id ? 'selected' : ''}>${_esc(s.name)}</option>`
      ).join('');
      const dayOpts = dayOptions.map(d =>
        `<option value="${d.v}" ${Number(r.day) === d.v ? 'selected' : ''}>${d.l}</option>`
      ).join('');
      const tietOpts = `<option value="" ${missingTiet ? 'selected' : ''}>—</option>` + tietOptions.map(n =>
        `<option value="${n}" ${Number(r.tiet) === n ? 'selected' : ''}>Tiết ${n}</option>`
      ).join('');
      const categoryOpts = categoryOptions.map(c =>
        `<option value="${c.v}" ${(r.category||'NE_NEP') === c.v ? 'selected' : ''}>${c.l}</option>`
      ).join('');
      // Nội dung hiển thị: ưu tiên tên quy định chuẩn đã khớp (matched_rule);
      // nếu AI không khớp được quy định nào thì hiện lại mô tả gốc (reason).
      const contentValue = r.matched_rule || r.reason || '';
      const showSubReason = r.matched_rule && r.reason && r.reason !== r.matched_rule;

      return `<tr class="ai-row${unmatched ? ' unmatched' : ''}${missingTiet ? ' missing-tiet' : ''}${autoDup ? ' auto-dup' : ''}" data-idx="${i}">
        <td class="ai-td ai-td-day">
          <select class="ai-day-badge" data-idx="${i}" data-field="day" title="Sửa Thứ nếu AI đọc sai">${dayOpts}</select>
        </td>
        <td class="ai-td ai-td-tiet">
          <select class="ai-tiet-badge${missingTiet ? ' missing' : ''}" data-idx="${i}" data-field="tiet" title="${missingTiet ? 'AI không đọc được Tiết — vui lòng chọn thủ công' : 'Sửa Tiết nếu AI đọc sai'}">${tietOpts}</select>
        </td>
        <td class="ai-td ai-td-student">
          <div class="ai-student-cell">
            ${unmatched
              ? `<span class="ai-unmatched-badge" title="AI không khớp được tên này">?</span>`
              : `<span class="ai-student-avatar">${(students.find(s=>s.id===r.student_id)?.avatarInitial || r.student_name?.[0] || '?').toUpperCase()}</span>`
            }
            <select class="ai-student-select${unmatched ? '' : ' matched'}" data-idx="${i}" data-field="student_id"
              title="AI đã khớp tên &quot;${_esc(r.student_name)}&quot; — bấm để sửa lại nếu khớp nhầm (VD: trùng tên với học sinh khác)">
              <option value="UNKNOWN" ${unmatched ? 'selected' : ''}>— Chọn học sinh —</option>
              ${selectOpts}
            </select>
          </div>
        </td>
        <td class="ai-td ai-td-category">
          <select class="ai-category-badge cat-${categoryCssKey(r.category)}" data-idx="${i}" data-field="category" title="Sửa loại nếu AI đọc sai">${categoryOpts}</select>
        </td>
        <td class="ai-td ai-td-subject">
          ${r.subject
            ? `<span class="ai-subject-badge">${_esc(r.subject)}</span>`
            : `<span class="ai-subject-none">—</span>`
          }
        </td>
        <td class="ai-td ai-td-reason">
          <input type="text" class="ai-reason-input" data-idx="${i}" data-field="matched_rule"
            value="${_esc(contentValue)}" placeholder="Nội dung lỗi/thưởng…"/>
          ${showSubReason ? `<div class="ai-reason-sub" title="Mô tả gốc AI đọc được">${_esc(r.reason)}</div>` : ''}
        </td>
        <td class="ai-td ai-td-score">
          <input type="number" class="ai-score-input ${scoreClass}" data-idx="${i}" data-field="score"
            value="${r.score}"/>
        </td>
        <td class="ai-td ai-td-del">
          <button type="button" class="ai-row-del" data-idx="${i}" title="Xoá dòng này">
            <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2.5" width="13" height="13"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </td>
      </tr>`;
    }).join('');

    const unmatchedCount  = _results.filter(r => r.student_id === 'UNKNOWN').length;
    const missingTietCount = _results.filter(r => r.tiet === null || r.tiet === undefined || r.tiet === '').length;
    const autoDupCount    = _results.filter(r => r._autoDuplicated).length;

    return `
      ${autoDupCount ? `<div class="ai-unmatched-warn" style="background:rgba(99,102,241,.12);border-color:rgba(99,102,241,.35);color:#a5b4fc;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Phát hiện <strong>${autoDupCount} dòng GVNN</strong> bị AI gộp nhầm — đã tự động khôi phục. Kiểm tra lại số lần vi phạm trước khi áp dụng.
      </div>` : ''}
      ${unmatchedCount ? `<div class="ai-unmatched-warn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <strong>${unmatchedCount} dòng</strong> chưa khớp tên — hãy chọn thủ công trước khi áp dụng.
      </div>` : ''}
      ${missingTietCount ? `<div class="ai-unmatched-warn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <strong>${missingTietCount} dòng</strong> chưa xác định Tiết (văn bản không ghi rõ) — hãy chọn thủ công trước khi áp dụng.
      </div>` : ''}
      <table class="ai-preview-table">
        <thead>
          <tr>
            <th class="ai-th ai-th-day">Thứ</th>
            <th class="ai-th ai-th-tiet">Tiết</th>
            <th class="ai-th ai-th-student">Học sinh</th>
            <th class="ai-th ai-th-category">Loại</th>
            <th class="ai-th ai-th-subject">Môn học</th>
            <th class="ai-th ai-th-reason">Nội dung lỗi / thưởng</th>
            <th class="ai-th ai-th-score">Điểm</th>
            <th class="ai-th ai-th-del"></th>
          </tr>
        </thead>
        <tbody id="ai-preview-tbody">${rows}</tbody>
      </table>`;
  }

  function _buildPreviewStats() {
    if (!_results.length) return '';
    const total  = _results.length;
    const plus   = _results.filter(r => Number(r.score) >= 0).reduce((s,r) => s + Number(r.score), 0);
    const minus  = _results.filter(r => Number(r.score) <  0).reduce((s,r) => s + Number(r.score), 0);
    const unknown= _results.filter(r => r.student_id === 'UNKNOWN').length;
    return `<span class="ai-stat-chip">${total} dòng</span>
      ${plus  ? `<span class="ai-stat-chip pos">+${plus}</span>` : ''}
      ${minus ? `<span class="ai-stat-chip neg">${minus}</span>` : ''}
      ${unknown ? `<span class="ai-stat-chip warn">${unknown} chưa khớp</span>` : ''}`;
  }

  /* ────────────────────────────────────────────────────────
     BIND EVENTS
  ──────────────────────────────────────────────────────── */
  function _bindEvents() {
    const root = _root();
    if (!root) return;

    // Close
    root.querySelector('#ai-close-btn')?.addEventListener('click', _close);
    root.querySelector('#ai-cancel-btn')?.addEventListener('click', _close);
    root.querySelector('#ai-backdrop')?.addEventListener('click', e => {
      if (e.target.id === 'ai-backdrop') _close();
    });

    // Thu gọn / mở rộng khung nhập liệu (PC) — cập nhật DOM trực tiếp,
    // không re-render toàn bộ để không mất focus/scroll đang có.
    root.querySelector('#ai-collapse-btn')?.addEventListener('click', () => {
      _leftCollapsed = !_leftCollapsed;
      try { localStorage.setItem('a3-ai-left-collapsed', _leftCollapsed ? '1' : '0'); } catch {}
      const modalEl = root.querySelector('.ai-modal');
      const btnEl   = root.querySelector('#ai-collapse-btn');
      modalEl?.classList.toggle('ai-left-collapsed', _leftCollapsed);
      if (btnEl) {
        btnEl.classList.toggle('active', _leftCollapsed);
        btnEl.title = _leftCollapsed ? 'Hiện lại khung nhập liệu' : 'Thu gọn khung nhập liệu — xem full bảng';
        btnEl.querySelector('span').textContent = _leftCollapsed ? 'Mở rộng' : 'Thu gọn';
        btnEl.querySelector('polyline')?.setAttribute('points', _leftCollapsed ? '9 6 15 12 9 18' : '15 6 9 12 15 18');
      }
    });

    // Input mode switcher
    root.querySelector('#ai-mode-tab-text')?.addEventListener('click', () => _switchInputMode('text'));
    root.querySelector('#ai-mode-tab-image')?.addEventListener('click', () => _switchInputMode('image'));

    // Textarea
    const ta = root.querySelector('#ai-textarea');
    if (ta) {
      ta.addEventListener('input', () => {
        _rawText = ta.value;
        const cnt = root.querySelector('#ai-char-count');
        if (cnt) cnt.textContent = `${_rawText.length} ký tự`;
      });
    }
    root.querySelector('#ai-clear-textarea')?.addEventListener('click', () => {
      _rawText = '';
      if (ta) ta.value = '';
      const cnt = root.querySelector('#ai-char-count');
      if (cnt) cnt.textContent = '0 ký tự';
    });

    // Image upload — click vào drop zone
    const dropZone = root.querySelector('#ai-image-drop-zone');
    const fileInput = root.querySelector('#ai-image-file-input');
    if (dropZone && fileInput) {
      dropZone.addEventListener('click', () => fileInput.click());
      dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
      // Drag & drop
      dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
      dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer?.files?.[0];
        if (file) _loadImageFile(file);
      });
      fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (file) _loadImageFile(file);
        fileInput.value = ''; // reset để chọn lại cùng file nếu cần
      });
    }
    root.querySelector('#ai-clear-image')?.addEventListener('click', () => {
      _imageData = null;
      _refreshInputPanel();
    });

    // API key — save
    root.querySelector('#ai-key-save-btn')?.addEventListener('click', () => {
      const inp = root.querySelector('#ai-key-input');
      if (!inp) return;
      const val = inp.value.trim();
      if (!val) { _errorMsg = 'Nhập API key trước khi lưu.'; _refreshAll(); return; }
      _saveApiKey(val);
      inp.style.color = '#34d399';
      setTimeout(() => { _refreshAll(); }, 900);
    });

    // API key — toggle visibility (eye button)
    root.querySelector('#ai-key-eye-btn')?.addEventListener('click', () => {
      const inp = root.querySelector('#ai-key-input');
      const icon = root.querySelector('#ai-eye-icon');
      if (!inp) return;
      const isHidden = inp.type === 'password';
      inp.type = isHidden ? 'text' : 'password';
      if (icon) {
        icon.innerHTML = isHidden
          ? /* eye-off */
            `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`
          : /* eye */
            `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
      }
    });

    // API key — reset về default
    root.querySelector('#ai-key-reset-btn')?.addEventListener('click', () => {
      try { localStorage.removeItem(AI_KEY_STORE); } catch {}
      _refreshAll();
    });

    // Analyze
    root.querySelector('#ai-analyze-btn')?.addEventListener('click', _runAnalysis);

    // Apply
    root.querySelector('#ai-apply-btn')?.addEventListener('click', _applyResults);

    // Preview table events (delegated)
    root.querySelector('#ai-preview-wrap')?.addEventListener('change', _onPreviewChange);
    root.querySelector('#ai-preview-wrap')?.addEventListener('input', _onPreviewInput);
    root.querySelector('#ai-preview-wrap')?.addEventListener('click', _onPreviewClick);
  }

  /* ────────────────────────────────────────────────────────
     MOBILE TAB SWITCHER
  ──────────────────────────────────────────────────────── */
  let _mobActiveTab = 'input'; // 'input' | 'preview'

  function _mobSwitchTab(tab) {
    _mobActiveTab = tab;
    const root = _root();
    if (!root) return;
    const inputPanel   = root.querySelector('#ai-panel-input');
    const previewPanel = root.querySelector('#ai-panel-preview');
    const tabInput     = root.querySelector('#ai-mob-tab-input');
    const tabPreview   = root.querySelector('#ai-mob-tab-preview');
    if (inputPanel)   inputPanel.classList.toggle('mob-hidden',   tab !== 'input');
    if (previewPanel) previewPanel.classList.toggle('mob-hidden', tab !== 'preview');
    if (tabInput)     tabInput.classList.toggle('active',   tab === 'input');
    if (tabPreview)   tabPreview.classList.toggle('active', tab === 'preview');
  }

  /** Cập nhật badge số dòng trên tab Bảng xem trước */
  function _mobUpdatePreviewCount() {
    const root = _root();
    if (!root) return;
    const badge = root.querySelector('#ai-mob-preview-count');
    if (!badge) return;
    const n = _results.length;
    badge.style.display = n ? 'inline-flex' : 'none';
    badge.textContent   = n;
  }

  function _onPreviewChange(e) {
    const el = e.target;
    const idx = parseInt(el.dataset.idx);
    const field = el.dataset.field;
    if (!Number.isFinite(idx) || !field) return;
    if (!_results[idx]) return;

    if (field === 'student_id') {
      const val = el.value;
      _results[idx].student_id = val;
      const students = _students();
      const found = students.find(s => s.id === val);
      if (found) _results[idx].student_name = found.name;
      // Đổi học sinh có thể làm thay đổi nhóm (ngày+tiết+học sinh) dùng để
      // đếm "Lần N" của GVNN — tính lại để điểm/chữ luôn khớp đúng học sinh
      // mới chọn (VD: dòng vừa đổi từ "Nguyễn Thành Đạt" sang "Nguyễn Huy
      // Thành Đạt" phải tính lại xem đây là lần thứ mấy của CHÍNH học sinh
      // "Nguyễn Huy Thành Đạt" trong tiết đó, không phải của người kia).
      _results = _applyGvnnProgressiveScores(_results);
      _refreshPreview();
    }
    if (field === 'day') {
      _results[idx].day = Number(el.value);
    }
    if (field === 'tiet') {
      _results[idx].tiet = el.value === '' ? null : Number(el.value);
      _refreshPreview(); // cập nhật lại cảnh báo "thiếu Tiết" + highlight hàng
    }
    if (field === 'category') {
      _results[idx].category = el.value;
      _refreshPreview();
    }
  }

  function _onPreviewInput(e) {
    const el = e.target;
    const idx = parseInt(el.dataset.idx);
    const field = el.dataset.field;
    if (!Number.isFinite(idx) || !field || !_results[idx]) return;

    if (field === 'matched_rule') _results[idx].matched_rule = el.value;
    if (field === 'score')  _results[idx].score  = Number(el.value) || 0;

    // Update stats
    const statsEl = _root()?.querySelector('#ai-preview-stats');
    if (statsEl) statsEl.innerHTML = _buildPreviewStats();
  }

  function _onPreviewClick(e) {
    const btn = e.target.closest('.ai-row-del');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx);
    if (!Number.isFinite(idx)) return;
    _results.splice(idx, 1);
    _refreshPreview();
  }

  /* ────────────────────────────────────────────────────────
     IMAGE INPUT HELPERS
  ──────────────────────────────────────────────────────── */

  /** Chuyển chế độ nhập liệu text ↔ image, cập nhật DOM không re-render toàn bộ */
  function _switchInputMode(mode) {
    if (_inputMode === mode) return;
    _inputMode = mode;
    const root = _root();
    if (!root) return;
    // Cập nhật tab buttons
    root.querySelector('#ai-mode-tab-text')?.classList.toggle('active', mode === 'text');
    root.querySelector('#ai-mode-tab-image')?.classList.toggle('active', mode === 'image');
    // Cập nhật panel hiển thị
    root.querySelector('.ai-input-panel-text')?.classList.toggle('ai-input-panel-hidden', mode !== 'text');
    root.querySelector('.ai-input-panel-image')?.classList.toggle('ai-input-panel-hidden', mode !== 'image');
    // Focus textarea khi chuyển về text
    if (mode === 'text') setTimeout(() => root.querySelector('#ai-textarea')?.focus(), 60);
  }

  /**
   * Đọc File ảnh → base64, lưu vào _imageData, cập nhật UI.
   * Chỉ chấp nhận PNG/JPG/WEBP/GIF, tối đa 10 MB.
   */
  function _loadImageFile(file) {
    const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    const MAX_SIZE_MB = 10;
    if (!ALLOWED_TYPES.includes(file.type)) {
      _errorMsg = `Định dạng ảnh không hỗ trợ: ${file.type}. Chỉ chấp nhận PNG, JPG, WEBP, GIF.`;
      _refreshAll();
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      _errorMsg = `Ảnh quá lớn (${(file.size / 1024 / 1024).toFixed(1)} MB). Tối đa ${MAX_SIZE_MB} MB.`;
      _refreshAll();
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      // e.target.result là "data:image/png;base64,xxxx"
      const dataUrl = e.target.result;
      const base64  = dataUrl.split(',')[1];
      _imageData    = { base64, mimeType: file.type, name: file.name };
      _errorMsg     = '';
      _refreshInputPanel();
    };
    reader.onerror = () => {
      _errorMsg = 'Không đọc được file ảnh. Thử lại với file khác.';
      _refreshAll();
    };
    reader.readAsDataURL(file);
  }

  /** Refresh chỉ khu vực image panel (drop zone + status) mà không re-render modal */
  function _refreshInputPanel() {
    const root = _root();
    if (!root) return;
    const dropZone = root.querySelector('#ai-image-drop-zone');
    const statusEl = root.querySelector('#ai-image-status');
    const clearBtn = root.querySelector('#ai-clear-image');
    if (dropZone) {
      dropZone.innerHTML = _imageData
        ? `<div class="ai-image-preview-wrap">
             <img class="ai-image-preview" id="ai-image-preview-img" src="data:${_imageData.mimeType};base64,${_imageData.base64}" alt="Ảnh đã chọn"/>
             <div class="ai-image-preview-name">${_esc(_imageData.name)}</div>
           </div>`
        : `<div class="ai-image-drop-placeholder">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="38" height="38" opacity=".35"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
             <span>Kéo thả ảnh vào đây<br/>hoặc <strong>bấm để chọn file</strong><br/>hoặc dán bằng <strong>Ctrl+V</strong></span>
             <span class="ai-image-drop-hint">PNG, JPG, WEBP · tối đa 10 MB</span>
           </div>`;
    }
    if (statusEl) statusEl.textContent = _imageData ? _imageData.name : 'Chưa có ảnh';
    if (clearBtn) {
      clearBtn.disabled = !_imageData;
      clearBtn.style.opacity = _imageData ? '' : '0.4';
      clearBtn.style.cursor  = _imageData ? '' : 'not-allowed';
    }
  }

  /* ────────────────────────────────────────────────────────
     RUN ANALYSIS
  ──────────────────────────────────────────────────────── */
  async function _runAnalysis() {
    // Kiểm tra quyền trước khi gọi API
    if (!_canUseAI()) {
      _errorMsg = 'Bạn không có thẩm quyền sử dụng tính năng AI chấm điểm.';
      _refreshAll();
      return;
    }
    const root = _root();

    // Validate theo mode
    if (_inputMode === 'image') {
      if (!_imageData) {
        _errorMsg = 'Vui lòng chọn hoặc kéo thả một ảnh trước khi phân tích.';
        _refreshAll();
        return;
      }
    } else {
      const ta = root?.querySelector('#ai-textarea');
      const text = ta?.value?.trim() || _rawText.trim();
      if (!text) {
        _errorMsg = 'Vui lòng nhập văn bản trước khi phân tích.';
        _refreshAll();
        return;
      }
      _rawText = text;
    }

    _loading  = true;
    _errorMsg = '';
    _results  = [];
    // Chỉ cập nhật nút + preview — KHÔNG re-render toàn bộ modal để tránh flash
    _refreshLoading();

    try {
      const parsed = _inputMode === 'image'
        ? await _callGeminiWithImage(_imageData)
        : await _callGemini(_rawText);
      _results = parsed.map(item => ({
        student_id:   item.student_id || 'UNKNOWN',
        student_name: item.student_name || '',
        day:          _dayTextToKey(item.day) ?? 2,
        tiet:         _tietTextToKey(item.tiet),
        reason:       item.reason || '',
        matched_rule: item.matched_rule || '',
        category:     (_sb().normalizeRuleCategory || (c=>c))(String(item.category || item.loai || '').toUpperCase()),
        subject:      item.subject || null,
        score:        Number(item.score) || 0,
      }));
      // Post-process: phát hiện và khôi phục các dòng GVNN bị Gemini gộp nhầm.
      // Chỉ chạy với chế độ văn bản (có _rawText để đối chiếu);
      // chế độ ảnh không có raw text nên bỏ qua.
      if (_inputMode === 'text' && _rawText) {
        _results = _fixGvnnMerge(_results, _rawText, _students());
      }
      // Tính lại "score" + "matched_rule" hiển thị cho các dòng GVNN theo
      // cấp số cộng (lần 1 -20, lần 2 -40...) — áp dụng cho cả 2 chế độ
      // văn bản/ảnh, chạy SAU _fixGvnnMerge để các dòng vừa được nhân bản
      // bù thiếu cũng được tính đúng thứ tự.
      _results = _applyGvnnProgressiveScores(_results);
      _errorMsg = '';
    } catch (err) {
      _errorMsg = err.message || 'Lỗi không xác định.';
      _results  = [];
    } finally {
      _loading = false;
      // Khôi phục nút phân tích
      const root = _root();
      const btn = root?.querySelector('#ai-analyze-btn');
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('loading');
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="16" height="16"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> Phân tích dữ liệu`;
      }
      // Nếu có lỗi → hiện error box mà không re-render toàn modal
      if (_errorMsg && root) {
        const existing = root.querySelector('.ai-error-box');
        const errHtml = `<div class="ai-error-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          ${_errorMsg.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
        </div>`;
        if (existing) { existing.outerHTML = errHtml; }
        else { btn?.insertAdjacentHTML('afterend', errHtml); }
      }
      // Cập nhật preview + nút apply (không đụng phần còn lại)
      _refreshPreview();
      // Mobile: cập nhật badge + tự chuyển sang tab Bảng xem trước nếu có kết quả
      _mobUpdatePreviewCount();
      if (_results.length && _mobActiveTab === 'input') {
        _mobSwitchTab('preview');
      }
    }
  }

  /* ────────────────────────────────────────────────────────
     BUILD EVENT TITLE — cú pháp output chuẩn
  ──────────────────────────────────────────────────────── */
  /**
   * Tạo chuỗi title lưu vào database theo cú pháp chuẩn:
   *   Có môn:    Thứ N: Tiết N: [Loại]: [Môn] Nội dung (±pts)
   *   Không môn: Thứ N: Tiết N: [Loại] Nội dung (±pts)
   *
   * Không có prefix [Tự tính]. Tiết luôn có mặt vì _applyResults() đã
   * chặn không cho áp dụng khi còn dòng thiếu Tiết (xem _runAnalysis /
   * _applyResults) — tiet truyền vào đây không bao giờ là null.
   */
  function _buildEventTitle(day, tiet, category, subject, content, pts) {
    const dayStr = day === 0 ? 'CN' : `Thứ ${day}`;
    const tietStr = Number.isFinite(Number(tiet)) ? `: Tiết ${Number(tiet)}` : '';
    const catLabel = _categoryLabel(category);
    const scoreStr = pts > 0 ? `(+${pts})` : `(${pts})`;
    if (subject) {
      return `${dayStr}${tietStr}: [${catLabel}]: [${subject}] ${content} ${scoreStr}`;
    }
    return `${dayStr}${tietStr}: [${catLabel}] ${content} ${scoreStr}`;
  }

  /** Chuyển category code → nhãn hiển thị tiếng Việt */
  function _categoryLabel(category) {
    const map = { NE_NEP: 'Nề nếp', HOC_TAP: 'Học tập', PHONG_TRAO: 'Phong trào' };
    return map[String(category || '').toUpperCase()] || category || 'Nề nếp';
  }

  /* ────────────────────────────────────────────────────────
     APPLY RESULTS → batch save
  ──────────────────────────────────────────────────────── */
  async function _applyResults() {
    if (!_results.length) return;

    const root = _root();
    const week            = parseInt(root?.querySelector('#ai-week-input')?.value)     || _currentWeek();
    const fallbackCategory= root?.querySelector('#ai-category-input')?.value           || 'NE_NEP';

    // Validate: không cho apply nếu còn UNKNOWN
    const unknowns = _results.filter(r => !r.student_id || r.student_id === 'UNKNOWN');
    if (unknowns.length) {
      _errorMsg = `Còn ${unknowns.length} học sinh chưa được chọn tên đầy đủ. Hãy chọn trước khi áp dụng.`;
      _refreshAll();
      return;
    }
    // Validate: không cho apply nếu còn dòng thiếu Tiết — theo yêu cầu AI KHÔNG
    // được tự đoán số Tiết, người dùng phải tự chọn thủ công trước khi áp dụng.
    const missingTiets = _results.filter(r => r.tiet === null || r.tiet === undefined || r.tiet === '');
    if (missingTiets.length) {
      _errorMsg = `Còn ${missingTiets.length} dòng chưa xác định Tiết. Hãy chọn Tiết thủ công trước khi áp dụng.`;
      _refreshAll();
      return;
    }

    const applyBtn = root?.querySelector('#ai-apply-btn');
    if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = 'Đang áp dụng…'; }

    try {
      // GVNN ("Giáo Viên Nhắc Nhở") KHÔNG dùng điểm cố định như các lỗi
      // khác — điểm trừ tăng luỹ tiến theo số lần vi phạm trong CÙNG 1 tiết,
      // do backend tự đếm (action 'addGvnn'), không thể tính trước ở client.
      // Tách riêng các dòng khớp lỗi này ra khỏi mảng additions gộp thường.
      // Dùng isGvnnTitle() (startsWith) thay vì so khớp tuyệt đối vì tên rule
      // thật trong DB có thể có hậu tố (VD: "Giáo Viên Nhắc Nhở - Lần 1").
      const _isGvnn = _sb().isGvnnTitle || (t => String(t||'').trim() === (_sb().GVNN_TITLE || 'Giáo Viên Nhắc Nhở'));
      const normalRows = [];
      const gvnnRows   = [];
      _results.forEach(r => (_isGvnn(r.matched_rule) ? gvnnRows : normalRows).push(r));

      const additions = normalRows.map(r => {
        const pts      = Number(r.score) || 0;
        const rowDay   = Number.isFinite(Number(r.day)) ? Number(r.day) : 2;
        const rowTiet  = Number.isFinite(Number(r.tiet)) ? Number(r.tiet) : null; // đã bị chặn null ở validate phía trên
        const category = r.category || fallbackCategory;
        const content  = r.matched_rule || r.reason || 'Ghi chú AI';
        const subject  = r.subject || null;

        // Cấu trúc title chuẩn (KHÔNG có prefix [Tự tính]):
        //   Có môn: Thứ N: Tiết N: [Loại]: [Môn] Nội dung (điểm)
        //   Không môn: Thứ N: Tiết N: [Loại] Nội dung (điểm)
        const title    = _buildEventTitle(rowDay, rowTiet, category, subject, content, pts);

        return {
          studentId:  r.student_id,
          week,
          title,
          points:     pts,
          type:       pts >= 0 ? 'CONG' : 'TRU',
          category,
          // dayLabel/tiet giữ nguyên dạng tách riêng (không chỉ gộp vào title)
          // để backend có thể dùng cho các logic theo-tiết trong tương lai
          // (VD: đếm số lần vi phạm trong cùng 1 tiết) mà không cần parse lại title.
          dayLabel:   rowDay === 0 ? 'CN' : `Thứ ${rowDay}`,
          tiet:       rowTiet,
          note:       'AI Auto-Parsing',
          createdBy:  'AI',
          createdAt:  (_sb().newEventDateForDay || (()=>new Date().toISOString()))(rowDay),
        };
      });

      if (additions.length) {
        await _sb().saveScoreChanges({ additions, deletions: [] });
      }

      // Các dòng GVNN: mỗi dòng là 1 request 'addGvnn' RIÊNG, gọi TUẦN TỰ
      // (await từng cái) — xem addGvnnEvent() trong scoreboard.js để biết
      // lý do không được gộp/song song. Lỗi ở 1 dòng không rollback các
      // dòng GVNN khác đã lưu thành công trước đó.
      let gvnnSuccessCount = 0;
      const gvnnErrors = [];
      for (const r of gvnnRows) {
        const rowDay   = Number.isFinite(Number(r.day)) ? Number(r.day) : 2;
        const dayLabel = rowDay === 0 ? 'CN' : `Thứ ${rowDay}`;
        const tiet     = Number(r.tiet);
        const res = await _sb().addGvnnEvent({ studentId: r.student_id, week, dayLabel, tiet });
        if (res?.ok) gvnnSuccessCount++;
        else gvnnErrors.push(`${r.student_name || r.student_id}: ${res?.error || 'lỗi không rõ'}`);
      }

      const totalSaved = additions.length + gvnnSuccessCount;

      if (gvnnErrors.length) {
        // Lưu thành công 1 phần — KHÔNG hoàn tác các dòng đã lưu (additions
        // gộp lẫn các dòng GVNN đã ghi thành công), chỉ báo lỗi phần còn lại.
        _errorMsg = `Đã lưu ${totalSaved}/${_results.length} mục. Lỗi ghi GVNN cho ${gvnnErrors.length} dòng: ${gvnnErrors.slice(0, 3).join('; ')}${gvnnErrors.length > 3 ? '…' : ''}`;
        if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = 'Xác nhận áp dụng'; }
        _refreshAll();
        return;
      }

      // Success feedback
      if (root) {
        root.innerHTML = `<div class="ai-success-screen" id="ai-backdrop">
          <div class="ai-success-card">
            <div class="ai-success-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="36" height="36"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div class="ai-success-title">Áp dụng thành công!</div>
            <div class="ai-success-sub">Đã ghi <strong>${totalSaved}</strong> mục điểm vào Tuần ${week}.</div>
            <button type="button" class="ai-success-close" id="ai-success-close">Đóng</button>
          </div>
        </div>`;
        root.querySelector('#ai-success-close')?.addEventListener('click', _close);
        root.querySelector('#ai-backdrop')?.addEventListener('click', e => {
          if (e.target.id === 'ai-backdrop') _close();
        });
        setTimeout(_close, 2800);
      }
    } catch (err) {
      _errorMsg = `Lỗi khi lưu: ${err.message || 'Thử lại.'}`;
      if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = 'Xác nhận áp dụng'; }
      _refreshAll();
    }
  }

  /* ────────────────────────────────────────────────────────
     REFRESH HELPERS
  ──────────────────────────────────────────────────────── */
  function _refreshPreview() {
    const root = _root();
    if (!root) return;
    const wrap = root.querySelector('#ai-preview-wrap');
    // Thay thế nội dung bảng — event delegation đã được gắn 1 lần từ _bindEvents()
    // KHÔNG gắn thêm listener ở đây để tránh stacking (mỗi lần refresh lại thêm 1 bộ)
    if (wrap) wrap.innerHTML = _buildPreviewContent();
    const statsEl = root.querySelector('#ai-preview-stats');
    if (statsEl) statsEl.innerHTML = _buildPreviewStats();
    const applyBtn = root.querySelector('#ai-apply-btn');
    if (applyBtn) {
      applyBtn.disabled = !_results.length;
      applyBtn.className = `ai-apply-btn${_results.length ? '' : ' disabled'}`;
      // Rebuild inner content của apply btn để cập nhật count và icon
      if (_results.length) {
        applyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15"><polyline points="20 6 9 17 4 12"/></svg> Xác nhận áp dụng <span class="ai-apply-count">${_results.length}</span>`;
      } else {
        applyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15"><polyline points="20 6 9 17 4 12"/></svg> Xác nhận áp dụng`;
      }
      // Re-bind apply click vì innerHTML đã replace button content
      applyBtn.onclick = _applyResults;
    }
    // Re-bind preview wrap events sau khi innerHTML thay đổi
    // Dùng cloneNode trick để xoá toàn bộ listener cũ trước khi gắn mới
    if (wrap) {
      const newWrap = wrap.cloneNode(true);
      wrap.parentNode.replaceChild(newWrap, wrap);
      newWrap.addEventListener('change', _onPreviewChange);
      newWrap.addEventListener('input', _onPreviewInput);
      newWrap.addEventListener('click', _onPreviewClick);
    }
    // Sync mobile badge
    _mobUpdatePreviewCount();
  }

  function _refreshLoading() {
    const root = _root();
    if (!root) return;
    // Cập nhật nút phân tích → trạng thái loading (không tạo lại modal)
    const btn = root.querySelector('#ai-analyze-btn');
    if (btn) {
      btn.disabled = true;
      btn.classList.add('loading');
      btn.innerHTML = `<span class="ai-spinner"></span> Đang phân tích…`;
    }
    // Hiện spinner trong vùng preview
    const wrap = root.querySelector('#ai-preview-wrap');
    if (wrap) {
      wrap.innerHTML = `<div class="ai-preview-loading">
        <div class="ai-big-spinner"></div>
        <span>Gemini đang phân tích…</span>
      </div>`;
    }
    // Disable nút apply trong khi loading
    const applyBtn = root.querySelector('#ai-apply-btn');
    if (applyBtn) { applyBtn.disabled = true; applyBtn.classList.add('disabled'); }
    // Ẩn error cũ nếu có
    const errBox = root.querySelector('.ai-error-box');
    if (errBox) errBox.remove();
  }

  function _refreshAll() {
    const root = _root();
    if (!root) return;
    root.innerHTML = _buildHTML();
    _bindEvents();
  }

  /* ────────────────────────────────────────────────────────
     TOOLBAR BUTTON — event delegation
     Nút .toolbar-button.auto được render bởi scoreboard.js
     qua innerHTML → listener phải dùng delegation trên document.
  ──────────────────────────────────────────────────────── */
  function _bindToolbarButton() {
    document.addEventListener('click', (e) => {
      if (e.target.closest?.('.toolbar-button.auto')) {
        e.preventDefault();
        e.stopPropagation();
        _open_modal();
      }
    });
  }

  /* ────────────────────────────────────────────────────────
     INJECT CSS
  ──────────────────────────────────────────────────────── */
  function _injectCSS() {
    // Luôn xoá CSS cũ và inject lại để đảm bảo không bị cache version cũ
    const existing = document.getElementById('a3-ai-css');
    if (existing) existing.remove();
    const st = document.createElement('style');
    st.id = 'a3-ai-css';
    st.textContent = `
/* ================================================================
   A3K64 — AI Auto-Parsing Modal CSS
   ================================================================ */

#a3-ai-modal-root {
  position: fixed; inset: 0; z-index: 9000; pointer-events: none;
}
#a3-ai-modal-root:not(:empty) { pointer-events: auto; }

/* Backdrop */
.ai-backdrop {
  position: fixed; inset: 0;
  background: var(--bg-modal);
  display: flex; flex-direction: column;
  animation: aiFadeIn .18s ease both;
  z-index: 9000;
}
@keyframes aiFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes aiPopIn  { from { opacity: 0; transform: scale(.96) translateY(12px); } to { opacity: 1; transform: none; } }

/* Modal */
.ai-modal {
  width: 100%;
  height: 100%;
  max-height: 100%;
  background: var(--bg-modal);
  border: none;
  border-top: 1px solid rgba(148,163,184,.10);
  border-radius: 0;
  box-shadow: none;
  display: grid;
  grid-template-rows: auto 1fr auto;
  overflow: hidden;
  animation: aiPopIn .22s cubic-bezier(.2,.9,.2,1) both;
}

/* ── Header ── */
.ai-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; padding: 18px 22px;
  background: linear-gradient(135deg, var(--bg-deep) 0%, var(--bg-modal) 100%);
  border-bottom: 1px solid rgba(148,163,184,.09);
  flex-shrink: 0;
}
.ai-header-left {
  display: flex; align-items: center; gap: 14px;
}
.ai-header-icon {
  width: 46px; height: 46px; border-radius: 14px; flex-shrink: 0;
  background: color-mix(in srgb, var(--accent) 18%, var(--bg-mid));
  border: 1px solid color-mix(in srgb, var(--accent) 32%, transparent);
  display: grid; place-items: center;
  color: var(--accent);
}
.ai-header-title {
  font-size: 20px; font-weight: 900; color: var(--text);
  letter-spacing: -.025em;
  display: flex; align-items: center; gap: 8px;
}
.ai-badge, .ai-btn-badge {
  font-size: 9.5px; font-weight: 900;
  text-transform: uppercase; letter-spacing: .1em;
  padding: 2px 7px; border-radius: 999px;
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 60%, #9333ea));
  color: #fff;
  vertical-align: middle;
}
.ai-btn-badge {
  font-size: 8.5px; padding: 1.5px 5px; margin-left: 4px;
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #9333ea));
}
.ai-header-sub {
  font-size: 12.5px; color: var(--text-muted); margin-top: 3px;
}
.ai-close-btn {
  width: 38px; height: 38px; border-radius: 11px;
  border: 1px solid rgba(148,163,184,.14);
  background: rgba(255,255,255,.04);
  color: var(--text-muted); display: grid; place-items: center; cursor: pointer;
  transition: all .14s ease; flex-shrink: 0;
}
.ai-close-btn:hover { background: rgba(239,68,68,.14); color: #f87171; border-color: rgba(239,68,68,.3); }

/* ── Body ── */
.ai-body {
  display: grid;
  grid-template-columns: 380px minmax(0,1fr);
  overflow: hidden; min-height: 0;
  transition: grid-template-columns .18s ease;
}
/* Thu gọn khung nhập liệu — bảng xem trước chiếm full chiều rộng */
.ai-modal.ai-left-collapsed .ai-body { grid-template-columns: 0 minmax(0,1fr); }
.ai-modal.ai-left-collapsed .ai-left {
  padding-left: 0; padding-right: 0; border-right: 0;
  overflow: hidden; opacity: 0; pointer-events: none;
}

/* ── Left ── */
.ai-left {
  border-right: 1px solid rgba(148,163,184,.08);
  overflow-y: auto; padding: 18px 20px;
  display: flex; flex-direction: column; gap: 14px;
  background: var(--bg-form);
}
.ai-section { display: flex; flex-direction: column; gap: 8px; }
.ai-section-label {
  font-size: 11px; font-weight: 900; color: var(--text-dim);
  text-transform: uppercase; letter-spacing: .08em;
  display: flex; align-items: center; gap: 6px;
}
.ai-section-label svg { color: color-mix(in srgb, var(--accent) 70%, var(--text-dim)); }

.ai-textarea {
  width: 100%; min-height: 180px; max-height: 300px;
  padding: 12px 14px;
  border: 1.5px solid rgba(148,163,184,.12);
  border-radius: 14px;
  background: var(--bg-deep);
  color: var(--text); font-size: 13.5px; line-height: 1.65;
  font-family: inherit; resize: vertical;
  transition: border-color .14s ease, box-shadow .14s ease;
}
.ai-textarea::placeholder { color: var(--text-dim); }
.ai-textarea:focus {
  outline: none; border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent);
}
.ai-input-actions {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: -4px;
}
.ai-char-count { font-size: 11px; color: var(--text-dim); }
.ai-clear-btn {
  border: 0; background: transparent; color: var(--text-dim);
  font-size: 11.5px; font-weight: 700; cursor: pointer; padding: 2px 6px;
  border-radius: 6px; transition: color .12s ease, background .12s ease;
}
.ai-clear-btn:hover { color: #f87171; background: rgba(239,68,68,.1); }

.ai-analyze-btn {
  width: 100%; height: 48px;
  border: 0; border-radius: 14px;
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 58%, #050d1c));
  color: #fff; font-size: 15px; font-weight: 900; letter-spacing: .01em;
  cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
  box-shadow: 0 4px 24px color-mix(in srgb, var(--accent) 34%, transparent);
  transition: transform .15s ease, box-shadow .15s ease;
}
.ai-analyze-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 14px 36px color-mix(in srgb, var(--accent) 40%, transparent);
}
.ai-analyze-btn:active { transform: scale(.98); }
.ai-analyze-btn:disabled { opacity: .55; cursor: not-allowed; box-shadow: none; }
.ai-analyze-btn.loading { animation: aiPulse 1.5s ease-in-out infinite; }
@keyframes aiPulse { 0%,100%{opacity:.7} 50%{opacity:1} }

.ai-spinner {
  width: 16px; height: 16px; border-radius: 50%;
  border: 2.5px solid rgba(255,255,255,.3);
  border-top-color: #fff;
  animation: aiSpin .7s linear infinite; flex-shrink: 0;
}
@keyframes aiSpin { to { transform: rotate(360deg); } }

.ai-error-box {
  padding: 11px 14px; border-radius: 12px;
  background: rgba(239,68,68,.09);
  border: 1px solid rgba(248,113,113,.25);
  color: #f87171; font-size: 12.5px; line-height: 1.55;
  display: flex; align-items: flex-start; gap: 8px;
}
.ai-error-box svg { flex-shrink: 0; margin-top: 1px; }

/* API key */
.ai-key-section {
  background: var(--bg-deep); border: 1px solid rgba(148,163,184,.08);
  border-radius: 14px; padding: 12px 14px; gap: 9px;
}
.ai-key-row { display: flex; gap: 7px; }
.ai-key-input {
  flex: 1; height: 38px; padding: 0 12px;
  border: 1px solid rgba(148,163,184,.14); border-radius: 10px;
  background: var(--bg-deep); color: var(--text); font-size: 13.5px;
  font-family: monospace; transition: border-color .14s ease;
}
.ai-key-input:focus { outline: none; border-color: var(--accent); }
.ai-key-save-btn {
  height: 38px; padding: 0 14px; border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border-input));
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-input));
  color: var(--accent); font-size: 13.5px; font-weight: 800;
  cursor: pointer; transition: all .14s ease;
}
.ai-key-save-btn:hover { background: color-mix(in srgb, var(--accent) 18%, var(--bg-input)); }
.ai-key-hint { font-size: 11px; color: var(--text-dim); line-height: 1.5; }
.ai-link { color: color-mix(in srgb, var(--accent) 80%, var(--text-muted)); text-decoration: none; }
.ai-link:hover { text-decoration: underline; }

/* Week/day/category */
.ai-week-section {
  background: var(--bg-deep); border: 1px solid rgba(148,163,184,.08);
  border-radius: 14px; padding: 12px 14px;
}
.ai-week-row { display: flex; gap: 8px; flex-wrap: wrap; }
.ai-week-label { font-size: 11px; color: var(--text-dim); font-weight: 700; display: flex; flex-direction: column; gap: 5px; }
.ai-week-input, .ai-select {
  height: 36px; padding: 0 10px; border-radius: 10px;
  border: 1px solid rgba(148,163,184,.14);
  background: var(--bg-deep); color: var(--text); font-size: 13.5px;
  cursor: pointer; font-family: inherit;
}
.ai-week-input { width: 96px; }
.ai-week-input:focus, .ai-select:focus { outline: none; border-color: var(--accent); }
.ai-week-input-full { width: 100%; }
.ai-week-top-section { order: -1; }

/* ── Right / Preview ── */
.ai-right {
  display: flex; flex-direction: column; overflow: hidden; min-height: 0;
  background: var(--bg-form);
}
.ai-preview-head {
  padding: 14px 18px 10px;
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  border-bottom: 1px solid rgba(148,163,184,.07); flex-shrink: 0;
}
.ai-preview-head-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
.ai-collapse-btn {
  display: flex; align-items: center; gap: 5px; flex-shrink: 0;
  height: 28px; padding: 0 10px; border-radius: 999px;
  border: 1px solid rgba(148,163,184,.18);
  background: rgba(148,163,184,.07); color: var(--text-muted);
  font-size: 11.5px; font-weight: 800; cursor: pointer;
  transition: all .14s ease;
}
.ai-collapse-btn:hover { background: rgba(148,163,184,.14); color: var(--text); }
.ai-collapse-btn.active {
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
}
.ai-preview-stats { display: flex; align-items: center; gap: 5px; }
.ai-stat-chip {
  font-size: 11.5px; font-weight: 800; padding: 3px 9px; border-radius: 999px;
  background: rgba(148,163,184,.08); color: var(--text-muted); border: 1px solid rgba(148,163,184,.14);
}
.ai-stat-chip.pos { color: #34d399; background: rgba(16,185,129,.1); border-color: rgba(52,211,153,.25); }
.ai-stat-chip.neg { color: #f87171; background: rgba(239,68,68,.1); border-color: rgba(248,113,113,.25); }
.ai-stat-chip.warn{ color: #fb923c; background: rgba(249,115,22,.1); border-color: rgba(249,115,22,.25); }

.ai-preview-wrap {
  flex: 1 1 0; min-height: 0; overflow-y: auto;
  padding: 0;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--accent) 55%, #334155) transparent;
}
.ai-preview-wrap::-webkit-scrollbar { width: 8px; }
.ai-preview-wrap::-webkit-scrollbar-track { background: transparent; }
.ai-preview-wrap::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--accent) 45%, #334155);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
.ai-preview-wrap::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--accent) 65%, #334155);
  background-clip: padding-box;
}

.ai-preview-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; min-height: 240px; gap: 14px;
  color: var(--text-dim); font-size: 13.5px; text-align: center; line-height: 1.6;
}
.ai-preview-empty strong { color: var(--text-muted); }

.ai-preview-loading {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; min-height: 240px; gap: 16px;
  color: var(--text-muted); font-size: 13.5px;
}
.ai-big-spinner {
  width: 36px; height: 36px; border-radius: 50%;
  border: 3px solid rgba(148,163,184,.14);
  border-top-color: var(--accent);
  animation: aiSpin .8s linear infinite;
}

.ai-unmatched-warn {
  margin: 10px 14px 0; padding: 10px 14px; border-radius: 12px;
  background: rgba(249,115,22,.09); border: 1px solid rgba(249,115,22,.28);
  color: #fb923c; font-size: 12.5px; display: flex; align-items: center; gap: 8px;
}
.ai-unmatched-warn strong { font-weight: 900; }

.ai-preview-table {
  width: 100%; border-collapse: collapse;
  table-layout: fixed; font-size: 13.5px;
  margin-top: 6px;
}
.ai-th {
  position: sticky; top: 0; z-index: 1;
  text-align: left; font-size: 10px; font-weight: 900;
  text-transform: uppercase; letter-spacing: .1em; color: var(--text-dim);
  background: var(--bg-form); padding: 8px 14px;
  border-bottom: 1px solid rgba(148,163,184,.1);
}
.ai-th-day     { width: 60px; text-align: center; }
.ai-th-tiet    { width: 72px; text-align: center; }
.ai-th-student { width: 200px; }
.ai-th-category{ width: 100px; text-align: center; }
.ai-th-reason  { width: auto; }
.ai-th-score   { width: 90px; text-align: center; }
.ai-th-del     { width: 50px; text-align: right; }

.ai-td { padding: 8px 14px; border-bottom: 1px solid rgba(148,163,184,.06); vertical-align: middle; transition: background .12s ease; }
.ai-row { transition: background .12s ease; }
.ai-row:hover { background: rgba(255,255,255,.04); }
.ai-row:hover .ai-td { background: transparent; }
.ai-row:last-child .ai-td { border-bottom: 0; }
.ai-row.unmatched { background: rgba(249,115,22,.06); }
.ai-row.unmatched:hover { background: rgba(249,115,22,.12); }
.ai-row.missing-tiet { background: rgba(249,115,22,.06); }
.ai-row.missing-tiet:hover { background: rgba(249,115,22,.12); }
.ai-row.auto-dup { background: rgba(99,102,241,.07); }
.ai-row.auto-dup:hover { background: rgba(99,102,241,.13); }

.ai-td-day { text-align: center; }
.ai-day-badge {
  appearance: none; -webkit-appearance: none;
  width: 52px; height: 24px; border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, rgba(148,163,184,.2));
  background: color-mix(in srgb, var(--accent) 14%, var(--bg-mid));
  color: var(--accent); font-size: 11.5px; font-weight: 900;
  text-align: center; text-align-last: center; cursor: pointer;
}
.ai-day-badge:focus { outline: none; border-color: var(--accent); }

.ai-td-tiet { text-align: center; }
.ai-tiet-badge {
  appearance: none; -webkit-appearance: none;
  width: 64px; height: 24px; border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, rgba(148,163,184,.2));
  background: color-mix(in srgb, var(--accent) 14%, var(--bg-mid));
  color: var(--accent); font-size: 11px; font-weight: 900;
  text-align: center; text-align-last: center; cursor: pointer;
}
.ai-tiet-badge:focus { outline: none; border-color: var(--accent); }
.ai-tiet-badge.missing {
  border-color: rgba(249,115,22,.55);
  background: rgba(249,115,22,.14);
  color: #fb923c;
}

.ai-td-category { text-align: center; }
.ai-category-badge {
  appearance: none; -webkit-appearance: none;
  width: 100%; max-width: 92px; height: 24px; border-radius: 999px;
  border: 1px solid rgba(148,163,184,.22);
  background: rgba(148,163,184,.1); color: var(--text-muted);
  font-size: 11px; font-weight: 800;
  text-align: center; text-align-last: center; cursor: pointer;
  padding: 0 6px;
}
.ai-category-badge:focus { outline: none; }
.ai-category-badge.cat-ne_nep {
  border-color: rgba(52,211,153,.32); background: rgba(16,185,129,.12); color: #34d399;
}
.ai-category-badge.cat-hoc_tap {
  border-color: rgba(96,165,250,.35); background: rgba(59,130,246,.12); color: #60a5fa;
}
.ai-category-badge.cat-phong_trao {
  border-color: rgba(251,191,36,.35); background: rgba(245,158,11,.12); color: #fbbf24;
}

.ai-reason-sub { font-size: 10.5px; color: var(--text-dim); padding: 0 9px; margin-top: -2px; }

.ai-student-cell { display: flex; align-items: center; gap: 9px; }
.ai-student-avatar {
  width: 30px; height: 30px; border-radius: 9px; flex-shrink: 0;
  background: color-mix(in srgb, var(--accent) 18%, var(--bg-mid));
  border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
  display: grid; place-items: center;
  font-size: 12px; font-weight: 900; color: var(--accent);
}
.ai-student-name { font-size: 13px; font-weight: 700; color: var(--text); }
.ai-student-id   { font-size: 10.5px; color: var(--text-dim); margin-top: 1px; }

.ai-unmatched-wrap { display: flex; align-items: center; gap: 7px; }
.ai-unmatched-badge {
  width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
  background: rgba(249,115,22,.18); border: 1px solid rgba(249,115,22,.38);
  color: #fb923c; font-size: 12px; font-weight: 900;
  display: grid; place-items: center;
}
.ai-student-select {
  flex: 1; height: 34px; border-radius: 9px;
  border: 1px solid rgba(249,115,22,.35);
  background: rgba(249,115,22,.07); color: var(--text);
  font-size: 13px; cursor: pointer; padding: 0 8px;
}
/* Dòng ĐÃ khớp tên (không phải UNKNOWN) — màu trung tính, không phải cam
   cảnh báo, để không gây hiểu nhầm là lỗi. Vẫn có thể bấm để sửa nếu AI
   khớp nhầm (VD: trùng tên với học sinh khác trong lớp). */
.ai-student-select.matched {
  border-color: rgba(148,163,184,.25);
  background: transparent;
}
.ai-student-select.matched:hover { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); }
.ai-student-select:focus { outline: none; border-color: var(--accent); }

.ai-reason-input {
  width: 100%; height: 34px; padding: 0 9px;
  border: 1px solid transparent; border-radius: 8px;
  background: transparent; color: var(--text); font-size: 13px;
  font-family: inherit; transition: border-color .12s ease, background .12s ease;
}
.ai-reason-input:hover { border-color: rgba(148,163,184,.18); background: rgba(255,255,255,.04); }
.ai-reason-input:focus { outline: none; border-color: var(--accent); background: rgba(255,255,255,.04); }

.ai-td-score { text-align: center; }
.ai-score-input {
  width: 76px; height: 28px; margin: 0 auto; display: block;
  border: 1px solid transparent; border-radius: 999px;
  background: rgba(148,163,184,.08); color: var(--text); font-size: 13px;
  font-family: inherit; text-align: center; font-weight: 900;
  transition: border-color .12s ease, background .12s ease;
  -moz-appearance: textfield;
}
.ai-score-input::-webkit-inner-spin-button,
.ai-score-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.ai-score-input:hover { border-color: rgba(148,163,184,.25); }
.ai-score-input:focus { outline: none; border-color: var(--accent); }
.ai-score-input.pos { color: #34d399; background: rgba(16,185,129,.12); }
.ai-score-input.neg { color: #f87171; background: rgba(239,68,68,.12); }

/* ── Subject badge ── */
.ai-td-subject { white-space: nowrap; }
.ai-subject-badge {
  display: inline-flex; align-items: center;
  padding: 3px 9px; border-radius: 999px;
  font-size: 11.5px; font-weight: 700; letter-spacing: .02em;
  background: rgba(99,102,241,.15);
  border: 1px solid rgba(129,140,248,.28);
  color: #a5b4fc;
  white-space: nowrap;
}
.ai-subject-none {
  color: var(--text-dim); font-size: 13px;
}
.ai-th-subject { min-width: 90px; }

.ai-row-del {
  width: 28px; height: 28px; border-radius: 8px;
  border: 0; background: rgba(255,255,255,.03); color: var(--text-dim);
  cursor: pointer; display: inline-grid; place-items: center;
  transition: all .12s ease;
}
.ai-row-del:hover { background: rgba(239,68,68,.18); color: #f87171; transform: scale(1.1); }

/* ── Footer ── */
.ai-footer {
  padding: 13px 20px;
  background: var(--bg-deep);
  border-top: 1px solid rgba(148,163,184,.09);
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  flex-shrink: 0;
}
.ai-footer-left { flex: 1; min-width: 0; }
.ai-footer-hint {
  font-size: 12px; color: var(--text-dim);
  display: flex; align-items: center; gap: 6px;
}
.ai-footer-right { display: flex; align-items: center; gap: 9px; }
.ai-cancel-btn {
  height: 44px; padding: 0 18px; border-radius: 12px;
  border: 1px solid rgba(148,163,184,.14);
  background: rgba(255,255,255,.04); color: var(--text-muted);
  font-size: 14px; font-weight: 700; cursor: pointer;
  transition: all .14s ease;
}
.ai-cancel-btn:hover { background: rgba(255,255,255,.07); color: var(--text-muted); }
.ai-apply-btn {
  height: 44px; padding: 0 22px; border-radius: 12px;
  border: 0;
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff; font-size: 14.5px; font-weight: 900;
  cursor: pointer; display: flex; align-items: center; gap: 8px;
  box-shadow: 0 4px 22px rgba(16,185,129,.32);
  transition: transform .14s ease, box-shadow .14s ease;
}
.ai-apply-btn:hover:not(:disabled):not(.disabled) {
  transform: translateY(-2px);
  box-shadow: 0 14px 36px rgba(16,185,129,.38);
}
.ai-apply-btn.disabled, .ai-apply-btn:disabled {
  background: rgba(148,163,184,.1); box-shadow: none;
  color: var(--text-dim); cursor: not-allowed;
}
.ai-apply-count {
  min-width: 20px; height: 20px; border-radius: 999px;
  background: rgba(255,255,255,.12); font-size: 11.5px; font-weight: 900;
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0 5px;
}

/* Success screen */
.ai-success-screen {
  display: flex; align-items: center; justify-content: center;
}
.ai-success-card {
  text-align: center; padding: 48px 32px;
  display: flex; flex-direction: column; align-items: center; gap: 16px;
}
.ai-success-icon {
  width: 72px; height: 72px; border-radius: 22px;
  background: rgba(16,185,129,.14);
  border: 2px solid rgba(52,211,153,.35);
  display: grid; place-items: center;
  color: #34d399;
  animation: aiSuccessIn .5s cubic-bezier(.2,.9,.2,1) both;
}
@keyframes aiSuccessIn { from { transform: scale(.6); opacity: 0; } to { transform: none; opacity: 1; } }
.ai-success-title { font-size: 24px; font-weight: 900; color: var(--text); letter-spacing: -.03em; }
.ai-success-sub { font-size: 14px; color: var(--text-muted); }
.ai-success-sub strong { color: var(--text); font-weight: 900; }
.ai-success-close {
  margin-top: 8px; height: 44px; padding: 0 24px; border-radius: 12px;
  border: 1px solid rgba(148,163,184,.16);
  background: rgba(255,255,255,.05); color: var(--text-muted);
  font-size: 14px; font-weight: 800; cursor: pointer;
}

/* ── API Key enhancements ── */
.ai-key-default-badge, .ai-key-custom-badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 999px;
  letter-spacing: .04em; vertical-align: middle; margin-left: 6px;
}
.ai-key-default-badge {
  background: rgba(52,211,153,.12); border: 1px solid rgba(52,211,153,.3); color: #34d399;
}
.ai-key-custom-badge {
  background: rgba(var(--accent-rgb, 37,99,235),.12); border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); color: var(--accent);
}

.ai-key-input-wrap {
  position: relative; flex: 1; display: flex; align-items: center;
}
.ai-key-input-wrap .ai-key-input {
  width: 100%; padding-right: 36px;
}
.ai-key-eye-btn {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
  width: 26px; height: 26px; border: 0; background: transparent;
  color: var(--text-dim); cursor: pointer; border-radius: 7px;
  display: grid; place-items: center;
  transition: color .12s ease, background .12s ease;
}
.ai-key-eye-btn:hover { color: var(--text-muted); background: rgba(255,255,255,.06); }

.ai-key-reset-btn {
  height: 38px; padding: 0 11px; border-radius: 10px;
  border: 1px solid rgba(148,163,184,.14);
  background: rgba(255,255,255,.03); color: var(--text-muted);
  font-size: 15px; cursor: pointer; flex-shrink: 0;
  transition: all .12s ease;
}
.ai-key-reset-btn:hover { background: rgba(239,68,68,.1); color: #f87171; border-color: rgba(239,68,68,.25); }

/* Toolbar button */
.ai-toolbar-btn {
  color: #c4b5fd !important;
  border-color: rgba(167,139,250,.35) !important;
  background: rgba(109,40,217,.2) !important;
}
.ai-toolbar-btn:hover {
  background: rgba(109,40,217,.32) !important;
  border-color: rgba(167,139,250,.55) !important;
  color: #ddd6fe !important;
}

/* ── No-permission banner ── */
.ai-no-perm-banner {
  display: flex; align-items: flex-start; gap: 10px;
  margin: 10px 0 0; padding: 13px 16px; border-radius: 13px;
  background: rgba(239,68,68,.09); border: 1px solid rgba(239,68,68,.28);
  color: #f87171; font-size: 13px; line-height: 1.55;
}
.ai-no-perm-banner svg { flex-shrink: 0; margin-top: 2px; }
.ai-no-perm-banner small { font-size: 11.5px; color: #f87171; opacity: .75; }
.ai-analyze-btn.no-perm {
  background: rgba(239,68,68,.12) !important;
  box-shadow: none !important;
  color: #f87171 !important;
  cursor: not-allowed !important;
}
.ai-analyze-btn.no-perm:hover { transform: none !important; }

/* ================================================================
   MOBILE — Tab switcher (Input | Bảng xem trước)
   Approach: .ai-modal dùng flex column, .ai-body flex:1,
   tab bar + 2 panel đều absolute-fill trong body.
   Điều kiện thứ 2 (landscape + max-height) bắt cả trường hợp điện
   thoại xoay ngang — lúc đó width có thể vượt 700px (iPhone landscape
   ~700-930px) nhưng height lại rất thấp, nếu chỉ so max-width thì
   modal sẽ rớt về layout desktop 2 cột và vỡ giao diện.
   ================================================================ */
@media (max-width: 700px), (orientation: landscape) and (max-height: 700px) {

  /* Backdrop + modal: fixed full-screen, dùng 100dvh để tránh bị
     cắt bởi address bar trên mobile */
  .ai-backdrop {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
  }
  .ai-modal {
    flex: 1 1 0;
    min-height: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
    border-radius: 0;
    height: 100%;
    max-height: 100%;
  }

  /* Header: compact hơn trên mobile */
  .ai-header { padding: 8px 12px; gap: 8px; }
  .ai-header-icon { width: 28px; height: 28px; border-radius: 8px; }
  .ai-header-icon svg { width: 16px; height: 16px; }
  .ai-header-title { font-size: 14.5px; gap: 6px; }
  .ai-badge { font-size: 8px; padding: 1.5px 5px; }
  /* Ẩn dòng mô tả phụ — chiếm chỗ mà không cần thiết trên màn nhỏ */
  .ai-header-sub { display: none; }
  .ai-close-btn { width: 30px; height: 30px; border-radius: 9px; }
  .ai-close-btn svg { width: 13px; height: 13px; }

  /* Body: flex column, chiếm hết chiều cao còn lại */
  .ai-body {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    /* Xoá grid hoàn toàn */
    grid-template-columns: unset;
  }

  /* Tab bar */
  .ai-mob-tabs {
    display: flex !important;
    flex-shrink: 0;
    height: 36px;
    border-bottom: 1px solid rgba(148,163,184,.12);
    background: var(--bg-deep);
  }
  .ai-mob-tab {
    flex: 1; height: 36px;
    border: 0; background: transparent;
    color: var(--text-dim); font-size: 12px; font-weight: 700;
    cursor: pointer; position: relative;
    transition: color .14s ease;
    display: flex; align-items: center; justify-content: center; gap: 6px;
  }
  .ai-mob-tab svg { width: 12px; height: 12px; }
  .ai-mob-tab.active { color: var(--accent); }
  .ai-mob-tab.active::after {
    content: '';
    position: absolute; bottom: 0; left: 16px; right: 16px; height: 2px;
    background: var(--accent); border-radius: 2px 2px 0 0;
  }
  .ai-mob-tab-count {
    min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    color: var(--accent); font-size: 10.5px; font-weight: 900;
    display: inline-flex; align-items: center; justify-content: center;
  }

  /* Các panel: mỗi cái chiếm toàn bộ phần còn lại và scroll độc lập */
  .ai-left, .ai-right {
    flex: 1 1 0;
    min-height: 0;
    overflow-y: auto;
    border-right: 0 !important;
    -webkit-overflow-scrolling: touch;
  }

  /* Panel ẩn */
  .ai-left.mob-hidden,
  .ai-right.mob-hidden {
    display: none !important;
  }

  /* ai-right khi hiện: cũng là flex column để preview-wrap có thể flex:1 */
  .ai-right:not(.mob-hidden) {
    display: flex;
    flex-direction: column;
  }

  /* Preview wrap trong mobile: flex:1, scroll dọc + ngang (giữ layout
     bảng như PC thay vì bị bóp chữ xuống dòng từng ký tự) */
  .ai-right:not(.mob-hidden) .ai-preview-wrap {
    flex: 1 1 0;
    min-height: 0;
    overflow-y: auto;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  /* Bảng xem trước: không co lại theo màn hình nữa, giữ nguyên độ rộng
     cột như bản PC — cuộn ngang khi cần thay vì bóp chữ */
  .ai-preview-table {
    width: max-content;
    min-width: 100%;
    table-layout: auto;
  }
  .ai-th-day     { width: 60px; }
  .ai-th-tiet    { width: 68px; }
  .ai-th-student { width: 200px; }
  .ai-th-category{ width: 100px; }
  .ai-th-subject { width: 110px; }
  .ai-th-reason  { width: 220px; }
  .ai-th-score   { width: 90px; }
  .ai-th-del     { width: 44px; }

  /* Nút thu gọn chỉ có ý nghĩa ở layout 2 cột (PC) — trên mobile mỗi
     lúc chỉ hiện 1 panel qua tab bar rồi nên bảng đã full-width sẵn */
  .ai-collapse-btn { display: none !important; }

  /* Preview head: gọn lại, chip nhỏ hơn */
  .ai-preview-head { padding: 8px 12px 6px; }
  .ai-stat-chip { font-size: 10.5px; padding: 2px 7px; }

  /* Footer: compact — ẩn dòng cảnh báo dài, chỉ giữ 2 nút hành động
     để tiết kiệm chiều cao (màn mobile vốn đã bị tab-bar ngoài chiếm
     thêm 1 dải nữa ở dưới cùng) */
  .ai-footer { padding: 8px 12px; gap: 8px; }
  .ai-footer-left { display: none; }
  .ai-footer-right { width: 100%; }
  .ai-apply-btn { flex: 1; height: 38px; font-size: 13px; padding: 0 14px; }
  .ai-cancel-btn { height: 38px; font-size: 13px; padding: 0 16px; }
}

/* ── Landscape thấp (điện thoại xoay ngang, height thực tế chỉ
   ~300-430px) — nén thêm lần nữa để chừa tối đa chỗ cho nội dung ── */
@media (orientation: landscape) and (max-height: 500px) {
  .ai-header { padding: 5px 10px; gap: 6px; }
  .ai-header-icon { width: 22px; height: 22px; border-radius: 6px; }
  .ai-header-icon svg { width: 12px; height: 12px; }
  .ai-header-title { font-size: 13px; }
  .ai-close-btn { width: 24px; height: 24px; border-radius: 7px; }
  .ai-close-btn svg { width: 11px; height: 11px; }

  .ai-mob-tabs { height: 30px; }
  .ai-mob-tab { height: 30px; font-size: 11px; }

  .ai-preview-head { padding: 5px 10px 4px; }

  .ai-footer { padding: 5px 10px; gap: 6px; }
  .ai-apply-btn { height: 32px; font-size: 12px; }
  .ai-cancel-btn { height: 32px; font-size: 12px; padding: 0 12px; }
}

/* ================================================================
   INPUT MODE SWITCHER (Text / Image)
   ================================================================ */
.ai-input-mode-bar {
  display: flex;
  gap: 4px;
  padding: 10px 16px 2px;
  flex-shrink: 0;
}
.ai-mode-tab {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 14px; border-radius: 8px;
  border: 1px solid rgba(148,163,184,.13);
  background: transparent;
  color: var(--text-dim);
  font-size: 12.5px; font-weight: 700;
  cursor: pointer;
  transition: all .14s ease;
}
.ai-mode-tab:hover { background: rgba(255,255,255,.05); color: var(--text-muted); }
.ai-mode-tab.active {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
  color: var(--accent);
}

/* Hidden input panel */
.ai-input-panel-hidden { display: none !important; }

/* ================================================================
   IMAGE DROP ZONE
   ================================================================ */
.ai-input-panel-image { padding-top: 4px; }

.ai-image-drop-zone {
  margin: 0 16px;
  min-height: 180px;
  border: 2px dashed rgba(148,163,184,.2);
  border-radius: 14px;
  background: rgba(255,255,255,.02);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease;
  overflow: hidden;
  outline: none;
}
.ai-image-drop-zone:hover,
.ai-image-drop-zone:focus {
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  background: color-mix(in srgb, var(--accent) 5%, transparent);
}
.ai-image-drop-zone.drag-over {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.ai-image-drop-placeholder {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 28px 24px; text-align: center;
  color: var(--text-dim);
  font-size: 13px; line-height: 1.6;
  pointer-events: none;
}
.ai-image-drop-placeholder strong { color: var(--accent); font-weight: 700; }
.ai-image-drop-hint {
  font-size: 11px; color: rgba(148,163,184,.5); margin-top: 2px;
}

.ai-image-preview-wrap {
  width: 100%; display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 12px;
}
.ai-image-preview {
  max-width: 100%; max-height: 220px;
  border-radius: 10px;
  object-fit: contain;
  box-shadow: 0 4px 20px rgba(0,0,0,.35);
}
.ai-image-preview-name {
  font-size: 11.5px; color: var(--text-dim);
  text-align: center; word-break: break-all; padding: 0 8px;
}

/* Mobile adjustments for image zone */
@media (max-width: 700px), (orientation: landscape) and (max-height: 700px) {
  .ai-image-drop-zone { min-height: 130px; margin: 0 12px; }
  .ai-image-preview { max-height: 160px; }
  .ai-input-mode-bar { padding: 8px 12px 2px; gap: 4px; }
  .ai-mode-tab { padding: 5px 10px; font-size: 11.5px; }
}
    `;
    document.head.appendChild(st);
  }

  /* ────────────────────────────────────────────────────────
     INIT
  ──────────────────────────────────────────────────────── */
  _injectCSS();

  // Ensure mount point
  if (!document.getElementById(AI_ROOT_ID)) {
    const div = document.createElement('div');
    div.id = AI_ROOT_ID;
    document.body.appendChild(div);
  }

  // Inject toolbar button after DOM ready
  if (document.readyState === 'loading') {
    _bindToolbarButton();
  } else {
    _bindToolbarButton();
  }

  // Expose
  window.openAIParser = _open_modal;
  window.__a3AI = { open: _open_modal, close: _close };
  // Global cho onclick trong HTML tab buttons
  window.aiMobSwitchTab = _mobSwitchTab;

})();
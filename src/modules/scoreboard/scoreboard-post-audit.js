/* ============================================================
   A3K64 — Hậu kiểm AI sau khi lưu điểm (Post-Save AI Audit)  v1
   ------------------------------------------------------------
   MỤC ĐÍCH
   Trong lúc chấm nhanh, người chấm có thể chọn NHẦM "Loại" (Học
   tập / Nề nếp / Phong trào) hoặc "Môn học" cho 1 mục điểm — ví
   dụ: nội dung thực chất là lỗi Nề nếp ("Không xơ vin sau nhắc
   nhở") nhưng lại bị lưu thành [Học Tập][Toán] Không xơ vin sau
   nhắc nhở (-100).

   Vì việc gọi AI kiểm tra từng dòng MẤT THỜI GIAN nên tính năng
   này KHÔNG chặn lúc chấm — nó chạy NGẦM, SAU KHI dữ liệu đã lưu
   thành công lên hệ thống (đã qua saveScoreChanges()), rồi mới
   báo lại gợi ý sửa (nếu có) qua 1 nút nổi ở góc màn hình.

   HAI LOẠI LỖI ĐƯỢC RÀ SOÁT
   1. Sai Loại/Môn: đối chiếu nội dung đã lưu với DANH SÁCH QUY
      ĐỊNH CHUẨN (sheet VI_PHAM) — nếu khớp 1 quy định có "loại"
      khác với loại đang gán → gợi ý sửa lại đúng loại (và bỏ môn
      học nếu loại mới không phải Học Tập).
   2. Viết tắt: CHỈ áp dụng cho các mục tự do (không khớp quy định
      chuẩn nào) — nếu nội dung dùng chữ viết tắt không trang
      trọng (k = không, cs = có, ko = không, đc = được, …) → gợi ý
      viết lại đầy đủ, KHÔNG viết tắt, nhưng vẫn ngắn gọn đúng ý.

   CÁCH HOẠT ĐỘNG
   - "Bọc" (wrap) hàm saveScoreChanges() toàn cục: sau mỗi lần lưu
     thành công có thêm mục mới, xếp các mục đó vào hàng đợi.
   - Debounce ~4s (gộp nhiều lượt lưu liên tiếp lại 1 lần gọi AI)
     rồi mới thực sự gọi Gemini kiểm tra theo lô.
   - Có vấn đề → hiện nút nổi "⚠ AI: N mục cần xem lại" ở góc màn
     hình; bấm vào để xem chi tiết từng mục kèm nút "Áp dụng" (tự
     xoá dòng cũ + thêm dòng đã sửa) hoặc "Bỏ qua" (ghi nhớ, không
     nhắc lại mục đó nữa).

   LOAD SAU scoreboard.js (cần saveScoreChanges, state, CATEGORY,
   formatSavedTitle, fetchRulesFromGas, subjects, days, _notify…)
     <script src="scoreboard-post-audit.js"></script>
   ============================================================ */

(function A3PostSaveAudit() {
  'use strict';

  /* ----------------------------------------------------------
     CONFIG
  ---------------------------------------------------------- */
  const ROOT_ID        = 'a3-audit-root';
  const ALLOWED_ROLES  = ['to_truong', 'gvcn', 'lop_truong', 'bi_thu'];
  const DEBOUNCE_MS    = 4000;
  const RETRY_BUSY_MS  = 1500;
  const MAX_BATCH      = 25;           // tối đa 1 lượt gọi AI / lần
  const AI_KEY_STORE   = 'a3k64-gemini-key';        // dùng chung key với scoreboard-ai.js
  const AI_BASE_URL    = 'https://generativelanguage.googleapis.com/v1beta/models';
  const AI_MODELS      = [
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
  const DISMISSED_KEY  = 'a3k64-audit-dismissed-v1';
  const CHECKED_KEY    = 'a3k64-audit-checked-v1';
  const MAX_STORE_ITEMS = 500;
  const MAX_HISTORY_ITEMS = 30; // số mục "AI đã sửa" giữ lại để có thể Hoàn tác
  const HISTORY_LOAD_LIMIT = 200; // số bản ghi tối đa tải từ server khi mở panel lịch sử

  /* ----------------------------------------------------------
     STATE
  ---------------------------------------------------------- */
  let _queue       = [];   // event[] vừa lưu, chờ audit
  let _timer       = null;
  let _busy        = false;
  let _suggestions = [];   // gợi ý đang chờ người dùng xem xét
  let _panelOpen   = false;
  let _panelView   = 'suggestions'; // 'suggestions' | 'history'
  let _applyingIds = new Set();

  /* _appliedHistory: bản ghi lịch sử mới nhất đã tải từ server (hoặc
     ghi vào server trong phiên này). Không còn chỉ "trong phiên" nữa —
     mọi thao tác Áp dụng / Hoàn tác đều được đồng bộ lên GAS ngay lập
     tức, và panel Lịch sử tải lại từ server khi mở.                    */
  let _appliedHistory = []; // { historyId, studentId, studentName, week, oldTitle, newTitle, points, originalCategory, originalSubject, actorName, actorEmail, appliedAt, undone, undoneBy, undoneAt, undoing }
  let _historyLoading  = false;   // đang gọi getAiEditHistory
  let _historyLoaded   = false;   // đã tải ít nhất 1 lần trong phiên
  let _historyFilter   = { week: '', studentId: '' }; // bộ lọc hiện tại
  let _initialScanDone   = false;
  let _initialScanTries  = 0;
  const INITIAL_SCAN_MAX_TRIES = 120; // ~60s (poll mỗi 500ms) rồi thôi chờ

  // Các id đang chờ server phản hồi "claim" (xem _claimIdsRemote) — dùng để
  // không claim trùng chính id đó 2 lần cục bộ trong lúc đang chờ mạng.
  let _pendingClaim = new Set();

  let _dismissed = _loadSet(DISMISSED_KEY);
  let _checked   = _loadSet(CHECKED_KEY);

  /* ----------------------------------------------------------
     HELPERS chung
  ---------------------------------------------------------- */
  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function normalizeStrSafe(s) {
    return String(s || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .toLowerCase().trim();
  }
  function _loadSet(key) {
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
    catch { return new Set(); }
  }
  function _saveSet(key, set) {
    try { localStorage.setItem(key, JSON.stringify([...set].slice(-MAX_STORE_ITEMS))); } catch {}
  }
  function _dismissKey(studentId, week, title, points) {
    return [studentId, week, title, points].join('|');
  }

  function _currentUser() {
    try {
      if (typeof userRole !== 'undefined' && userRole) {
        return { role: String(userRole).toLowerCase() || 'hoc_sinh', group: (typeof userGroup !== 'undefined' ? userGroup : null) };
      }
    } catch {}
    try {
      const raw = sessionStorage.getItem('a3k64-user');
      if (raw) { const u = JSON.parse(raw); return { role: String(u?.role || 'hoc_sinh').toLowerCase(), group: u?.group ?? u?.to ?? null }; }
    } catch {}
    return { role: 'hoc_sinh', group: null };
  }
  function _canUseAudit() { return ALLOWED_ROLES.includes(_currentUser().role); }

  /** Tổ nào sửa tổ đó — tính theo ĐÚNG TUẦN của dòng điểm đang xét.
   *  - gvcn / lop_truong / bi_thu: luôn được sửa, kể cả tuần khoá.
   *  - to_truong: chỉ sửa học sinh trong tổ mình VÀ tuần chưa khoá.
   *  Hàm này TỰ TRA quyền, không dùng canEditStudent() hay getDerived()
   *  của app (vì những hàm đó chỉ xét tuần đang XEM, không phải tuần
   *  của dòng điểm đang được hậu kiểm). */
  const _FULL_ACCESS = ['gvcn', 'lop_truong', 'bi_thu'];
  function _canEditStudentId(studentId, week) {
    try {
      // 1. Lấy role hiện tại
      let role = 'hoc_sinh';
      try { if (typeof userRole !== 'undefined' && userRole) role = String(userRole).trim().toLowerCase(); } catch {}
      if (!role) {
        try {
          const raw = sessionStorage.getItem('a3k64-user');
          if (raw) role = String(JSON.parse(raw)?.role || 'hoc_sinh').trim().toLowerCase();
        } catch {}
      }

      // 2. Quyền cao nhất — không bị chặn bởi bất kỳ khoá tuần nào
      if (_FULL_ACCESS.includes(role)) return true;

      // 3. Tổ trưởng — chỉ sửa được tổ mình, và tuần đó chưa bị khoá
      if (role !== 'to_truong') return false;

      // Lấy số tổ của người dùng
      let ugn = null;
      try {
        if (typeof parseGroup === 'function' && typeof userGroup !== 'undefined') ugn = parseGroup(userGroup);
        if (!ugn && typeof readSavedUserGroup === 'function') ugn = readSavedUserGroup();
      } catch {}
      if (!ugn) return false;

      // Kiểm tra học sinh có thuộc tổ không
      let st = null;
      try {
        if (typeof getDerived === 'function') {
          const { rawSummaries } = getDerived();
          st = rawSummaries.find(s => s.id === studentId);
        } else if (Array.isArray(state?.students)) {
          st = state.students.find(s => s.id === studentId);
        }
      } catch {}
      if (!st || Number(st.group) !== ugn) return false;

      // Kiểm tra khoá tuần
      try {
        const weekSetting = (state.weekSettings || []).find(w => Number(w.week) === Number(week));
        if (weekSetting && weekSetting.locked) return false;
      } catch {}

      return true;
    } catch { return false; }
  }
  function _gasUrlForAudit() { try { return (typeof gasUrl !== 'undefined' && gasUrl) ? gasUrl : null; } catch { return null; } }
  function _apiKey() {
    try { const s = localStorage.getItem(AI_KEY_STORE); return (s && s.trim()) ? s.trim() : ''; } catch { return ''; }
  }
  function _isUsingDefaultKey() {
    try { const s = localStorage.getItem(AI_KEY_STORE); return !s || !s.trim(); } catch { return true; }
  }

  /* ----------------------------------------------------------
     Parse title → {category, subject, contentTitle} (như v2.2
     click-to-edit) — dùng để biết mục này đang được gán loại/môn
     gì và nội dung gốc là gì.
  ---------------------------------------------------------- */
  function parseEventTitle(rawTitle) {
    let t = String(rawTitle || '').replace(/^(Thứ\s*[2-7]|Chủ nhật):\s*/i, '').trim();

    let category = 'HOC_TAP';
    const catMatch = t.match(/^\[([^\]]+)\]/);
    if (catMatch) {
      const catLabel = normalizeStrSafe(catMatch[1]);
      if (catLabel.includes('ne')) category = 'NE_NEP';
      else if (catLabel.includes('phong')) category = 'PHONG_TRAO';
      else category = 'HOC_TAP';
      t = t.slice(catMatch[0].length).replace(/^:\s*/, '').trim();
    }

    let subject = null;
    const subMatch = t.match(/^\[([^\]]+)\]/);
    if (subMatch && category === 'HOC_TAP') {
      subject = subMatch[1].trim();
      t = t.slice(subMatch[0].length).trim();
    }

    const ptsMatch = t.match(/\(([+-]?\d+)\)\s*$/);
    if (ptsMatch) t = t.slice(0, t.lastIndexOf(ptsMatch[0])).trim();

    return { category, subject, contentTitle: t };
  }

  /* ----------------------------------------------------------
     HOOK saveScoreChanges — bắt các mục vừa lưu thành công
  ---------------------------------------------------------- */
  function _installHook() {
    if (typeof window.saveScoreChanges !== 'function') { setTimeout(_installHook, 300); return; }
    if (window.saveScoreChanges.__a3AuditWrapped) return;

    const original = window.saveScoreChanges;
    const wrapped = async function (changes) {
      const beforeIds = new Set((state.events || []).map(e => e.id));
      const sigs = (changes?.additions || []).map(scoreContentSig);
      const result = await original(changes);
      try {
        if (sigs.length && _canUseAudit()) {
          const matched = (state.events || []).filter(e => !beforeIds.has(e.id) && sigs.includes(scoreContentSig(e)));
          if (matched.length) _enqueue(matched);
        }
      } catch (err) {
        console.warn('[A3PostSaveAudit] Lỗi khi bắt sự kiện vừa lưu:', err);
      }
      return result;
    };
    wrapped.__a3AuditWrapped = true;
    window.saveScoreChanges = wrapped;
  }

  /* ----------------------------------------------------------
     "Claim" id trên server trước khi thực sự gọi AI — tránh trường hợp
     nhiều người mở bảng điểm cùng lúc (mỗi trình duyệt tự quét độc lập)
     cùng gọi AI trùng nhau cho đúng 1 dòng điểm, phí quota. Chỉ những id
     server xác nhận CHƯA ai claim mới thực sự được đưa vào hàng đợi gọi
     AI của trình duyệt này. Mất mạng / chưa cấu hình GAS → fallback tự
     coi như claim được hết (không để mất tính năng hậu kiểm chỉ vì tính
     năng chống trùng bị lỗi).
  ---------------------------------------------------------- */
  async function _claimIdsRemote(ids) {
    try {
      const url = _gasUrlForAudit();
      if (!url || !ids.length) return ids; // không có GAS URL → fallback coi như claim hết
      const res = await fetch(url, {
        method: 'POST',
        body: JSON.stringify({ action: 'claimAuditIds', payload: { ids } }),
      });
      if (!res.ok) return ids;
      const json = await res.json();
      // GAS wrapper: { ok: true, data: { claimed: [...] } }
      if (!json || json.ok === false) return ids;
      const claimed = json?.data?.claimed ?? json?.claimed;
      if (!Array.isArray(claimed)) return ids;
      return claimed;
    } catch {
      return ids; // mất mạng → fallback coi như claim hết, không làm hỏng tính năng
    }
  }

  function _releaseIdsRemote(ids) {
    try {
      const url = _gasUrlForAudit();
      if (!url || !ids.length) return;
      fetch(url, { method: 'POST', body: JSON.stringify({ action: 'releaseAuditIds', payload: { ids } }) }).catch(() => {});
    } catch { /* noop */ }
  }

  /* ----------------------------------------------------------
     GAS helpers — lịch sử chỉnh sửa bền (AI_EDIT_HISTORY)
  ---------------------------------------------------------- */
  async function _gasPost(action, payload) {
    const url = _gasUrlForAudit();
    if (!url) throw new Error('Chưa cấu hình GAS URL.');
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ action, payload }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json || json.ok === false) throw new Error(json?.error || 'GAS trả lỗi không xác định');
    return json;
  }

  async function _logAiEditRemote(entry) {
    try {
      await _gasPost('logAiEdit', {
        id:               entry.historyId,
        studentId:        entry.studentId,
        studentName:      entry.studentName,
        week:             String(entry.week ?? ''),
        oldTitle:         entry.oldTitle,
        newTitle:         entry.newTitle,
        points:           String(entry.points ?? ''),
        originalCategory: entry.originalCategory || '',
        originalSubject:  entry.originalSubject  || '',
        originalPoints:   String(entry.originalPoints ?? entry.points ?? ''),
        actorName:        entry.actorName  || '',
        actorEmail:       entry.actorEmail || '',
        appliedAt:        entry.appliedAt  || new Date().toISOString(),
      });
    } catch (err) {
      console.warn('[A3PostSaveAudit] Không ghi được lịch sử lên server:', err);
    }
  }

  async function _loadHistoryRemote(filterWeek, filterStudentId) {
    const json = await _gasPost('getAiEditHistory', {
      limit:     HISTORY_LOAD_LIMIT,
      week:      filterWeek      || '',
      studentId: filterStudentId || '',
    });
    return (json.data || []).map(rec => ({
      historyId:        rec.id,
      studentId:        rec.studentId,
      studentName:      rec.studentName,
      week:             rec.week,
      oldTitle:         rec.oldTitle,
      newTitle:         rec.newTitle,
      points:           isNaN(Number(rec.points)) ? 0 : Number(rec.points),
      originalCategory: rec.originalCategory || 'HOC_TAP',
      originalSubject:  rec.originalSubject  || null,
      // Nếu bản ghi cũ (trước bản vá này) chưa có originalPoints trên server
      // thì đành fallback về points hiện tại — chấp nhận Hoàn tác kém chính
      // xác hơn cho riêng các bản ghi lịch sử cũ đó, các bản ghi mới trở đi
      // đều có originalPoints chuẩn.
      originalPoints:   isNaN(Number(rec.originalPoints)) ? (isNaN(Number(rec.points)) ? 0 : Number(rec.points)) : Number(rec.originalPoints),
      actorName:        rec.actorName  || '',
      actorEmail:       rec.actorEmail || '',
      appliedAt:        rec.appliedAt  || '',
      undone:           rec.undone === 'true' || rec.undone === true,
      undoneBy:         rec.undoneBy || '',
      undoneAt:         rec.undoneAt || '',
      undoing:          false,
    }));
  }

  async function _undoAiEditRemote(historyId) {
    const u = _currentUser();
    const actorEmail = (() => { try { return typeof actorEmail !== 'undefined' ? actorEmail : (sessionStorage.getItem('a3k64-user') ? (JSON.parse(sessionStorage.getItem('a3k64-user'))?.email || '') : ''); } catch { return ''; } })();
    await _gasPost('undoAiEdit', {
      id:       historyId,
      undoneBy: actorEmail || u.role,
      undoneAt: new Date().toISOString(),
    });
  }

  async function _ensureHistoryLoaded(forceReload) {
    if (_historyLoading) return;
    if (_historyLoaded && !forceReload) return;
    _historyLoading = true;
    _renderBadge(); // cập nhật trạng thái loading
    try {
      _appliedHistory = await _loadHistoryRemote(_historyFilter.week, _historyFilter.studentId);
      _historyLoaded = true;
    } catch (err) {
      console.warn('[A3PostSaveAudit] Không tải được lịch sử từ server:', err);
    } finally {
      _historyLoading = false;
      _renderBadge();
    }
  }

  async function _enqueue(events) {
    const fresh = events.filter(e => e?.id && !isSheetTotalEvent(e) && !_checked.has(e.id) && !_pendingClaim.has(e.id));
    if (!fresh.length) return;

    fresh.forEach(e => _pendingClaim.add(e.id));
    const claimedIds = await _claimIdsRemote(fresh.map(e => e.id));
    fresh.forEach(e => _pendingClaim.delete(e.id));

    // Dù claim được hay không, coi như đã "xử lý" cục bộ ngay — nếu KHÔNG
    // claim được nghĩa là trình duyệt khác đã/đang lo mục này rồi, không
    // cần hỏi lại nữa (nếu lượt gọi AI của họ lỡ thất bại, server sẽ tự
    // "nhả" lại id đó — xem _runAudit — nên vẫn được thử lại ở lượt sau).
    fresh.forEach(e => _checked.add(e.id));
    _saveSet(CHECKED_KEY, _checked);

    const claimedSet = new Set(claimedIds);
    const toQueue = fresh.filter(e => claimedSet.has(e.id));
    if (!toQueue.length) return;

    _queue.push(...toQueue);
    clearTimeout(_timer);
    _timer = setTimeout(_runAudit, DEBOUNCE_MS);
  }

  /* ----------------------------------------------------------
     Gọi Gemini (dùng chung key/proxy với scoreboard-ai.js)
  ---------------------------------------------------------- */
  async function _callGeminiViaProxy(model, body) {
    const url = _gasUrlForAudit();
    if (!url) throw new Error('Chưa cấu hình GAS URL.');
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ action: 'aiCall', model, geminiBody: body }),
    });
    if (!res.ok) throw new Error(`Proxy lỗi: HTTP ${res.status}`);
    const wrapper = await res.json();
    if (!wrapper || !wrapper.ok) throw new Error((wrapper && wrapper.error) || 'Proxy trả về lỗi không xác định');
    return wrapper.data;
  }

  async function _callGemini(body) {
    const usingOwnKey = !_isUsingDefaultKey();
    const key = usingOwnKey ? _apiKey() : null;
    let lastError = null;

    for (const model of AI_MODELS) {
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
            const errMsg = errJson?.error?.message || `HTTP ${res.status}`;
            if (res.status === 429 || /quota|rate.?limit|resource.?exhaust/i.test(errMsg)) {
              lastError = new Error(`[${model}] quota hết`);
              continue;
            }
            throw new Error(`Gemini lỗi (${model}): ${errMsg}`);
          }
          data = await res.json();
        } else {
          try {
            data = await _callGeminiViaProxy(model, body);
          } catch (proxyErr) {
            const errMsg = proxyErr?.message || 'Lỗi proxy';
            if (/quota|rate.?limit|resource.?exhaust|429/i.test(errMsg)) {
              lastError = new Error(`[${model}] quota hết`);
              continue;
            }
            throw new Error(`Gemini lỗi (${model}): ${errMsg}`);
          }
        }
        const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        const parsed = JSON.parse(raw.trim());
        if (!Array.isArray(parsed)) throw new Error('Không phải array');
        return parsed;
      } catch (err) {
        if (!String(err.message || '').startsWith(`[${model}] quota`)) throw err;
        lastError = err;
      }
    }
    throw lastError || new Error('Không gọi được model AI nào.');
  }

  function _buildRulesCatalog(rules) {
    if (!Array.isArray(rules) || !rules.length) return '(không đọc được sheet VI_PHAM)';
    return rules.map((r, i) => {
      const pts = Number(r.points) || 0;
      return `${i + 1}:::${r.title}:::${pts >= 0 ? '+' : ''}${pts}:::${r.category}`;
    }).join('\n');
  }

  function _categoryLabelForPrompt(cat, subject) {
    if (cat === 'HOC_TAP') return `Học Tập${subject ? ` (môn: ${subject})` : ''}`;
    if (cat === 'PHONG_TRAO') return 'Phong Trào';
    return 'Nề Nếp';
  }

  function _buildItemsBlock(parsedList) {
    return parsedList.map((it, i) => {
      const p = it.parsed;
      return `${i}:::${_categoryLabelForPrompt(p.category, p.subject)}:::${p.contentTitle}:::${it.ev.points >= 0 ? '+' : ''}${it.ev.points}`;
    }).join('\n');
  }

  async function _callAuditModel(parsedList, rules) {
    const rulesCatalog = _buildRulesCatalog(rules);
    const subjectsList = (typeof subjects !== 'undefined' ? subjects : []).join(', ');
    const itemsBlock = _buildItemsBlock(parsedList);

    const systemInstruction = `Bạn là trợ lý HẬU KIỂM (rà soát lại SAU KHI đã lưu) cho hệ thống chấm điểm nề nếp lớp A3K64.

═══════════════════════════════════════
DANH SÁCH QUY ĐỊNH CHUẨN (SHEET VI_PHAM — định dạng số thứ tự:::tên:::điểm:::loại)
loai chỉ nhận 1 trong 3 giá trị: NE_NEP (nề nếp), HOC_TAP (học tập), PHONG_TRAO (phong trào)
═══════════════════════════════════════
${rulesCatalog}

═══════════════════════════════════════
DANH SÁCH MÔN HỌC CHÍNH THỨC
═══════════════════════════════════════
${subjectsList}

═══════════════════════════════════════
NHIỆM VỤ
═══════════════════════════════════════
Dưới đây là các mục điểm NGƯỜI DÙNG VỪA CHẤM VÀ ĐÃ LƯU (định dạng
index:::loại đang gán:::nội dung:::điểm). Rà soát TỪNG mục theo 2 loại lỗi:

1. SAI LOẠI/MÔN (issue = "category"):
   So khớp "nội dung" với DANH SÁCH QUY ĐỊNH CHUẨN ở trên. Nếu nội dung THỰC
   SỰ cùng nghĩa với 1 quy định có "loại" KHÁC với loại đang được gán cho mục
   đó (ví dụ nội dung là lỗi Nề Nếp nhưng đang bị gán Học Tập + 1 môn học) →
   đây là lỗi chấm nhầm. Đặt "suggested_category" đúng theo quy định đã khớp,
   và BẮT BUỘC điền "matched_rule_index" = đúng SỐ THỨ TỰ (cột đầu tiên, trước
   dấu ":::") của quy định đã khớp trong DANH SÁCH QUY ĐỊNH CHUẨN — dùng số
   này để lấy đúng ĐIỂM CHUẨN của quy định (không phải điểm đang lưu, vì điểm
   đang lưu có thể SAI theo đúng loại sai đó, ví dụ lỗi bị chấm nhầm thành
   cộng điểm trong khi quy định đúng là trừ điểm).
   CHỈ báo lỗi khi CHẮC CHẮN khớp đúng 1 quy định cụ thể — không suy đoán khi
   mơ hồ hoặc nội dung không nằm trong danh sách quy định chuẩn.

2. VIẾT TẮT (issue = "abbr"):
   CHỈ áp dụng cho các mục KHÔNG khớp quy định chuẩn nào ở trên (nội dung tự
   do người dùng gõ tay). Nếu nội dung dùng chữ viết tắt không trang trọng
   (ví dụ: "k"/"ko" → "không", "cs" → "có", "hs" → "học sinh", "đc" → "được",
   "vs" → "với", "bth" → "bình thường", và các viết tắt tương tự) → đặt
   "suggested_title" là nội dung viết lại ĐẦY ĐỦ, KHÔNG còn viết tắt, nhưng
   vẫn NGẮN GỌN và giữ đúng nghĩa gốc — không thêm ý ngoài nội dung ban đầu.
   "matched_rule_index" = null (vì đây là mục tự do, không khớp quy định nào).

3. SAI ĐIỂM (issue = "points"):
   Nếu nội dung khớp 1 quy định chuẩn nhưng điểm đang lưu KHÁC RÕ RÀNG so
   với điểm quy định (ví dụ quy định là -100 nhưng đang lưu -10.000, hoặc
   quy định +20 nhưng đang lưu +2.000) → điểm đang lưu rất có thể do nhầm
   dấu chấm nghìn (locale VN) khi nhập tay. Đặt "matched_rule_index" = số thứ
   tự đúng của quy định đã khớp để server lấy điểm chuẩn. "suggested_title"
   giữ nguyên nội dung gốc. Chỉ báo lỗi khi CHẮC CHẮN khớp đúng 1 quy định
   CỤ THỂ và điểm lệch rõ ràng — không báo nếu chỉ nghi ngờ mơ hồ.

Nếu 1 mục vừa sai loại (mục 1) vừa có viết tắt (mục 2): báo issue = "category"
và vẫn điền "suggested_title" đã sửa viết tắt trong cùng lúc, kèm
"matched_rule_index" theo mục 1.
Nếu mục không có vấn đề gì (đã đúng loại/môn, không viết tắt, điểm đúng) → issue = "none",
để "suggested_title" giữ nguyên nội dung gốc, "matched_rule_index" = null và
"reason" để trống.

Chỉ báo lỗi khi thật sự có cơ sở rõ ràng — tránh báo nhầm những mục vốn đã ổn.

═══════════════════════════════════════
CÁC MỤC CẦN RÀ SOÁT
═══════════════════════════════════════
${itemsBlock}

TRẢ VỀ JSON — 1 mảng, MỖI phần tử ứng ĐÚNG 1 mục theo index ở trên, không bỏ
sót mục nào, không thêm chữ nào ngoài JSON, đúng định dạng:
[
  {
    "index": 0,
    "issue": "none",
    "suggested_category": null,
    "suggested_subject": null,
    "suggested_title": "nội dung giữ nguyên hoặc đã sửa viết tắt",
    "matched_rule_index": null,
    "reason": ""
  }
]`;

    const body = {
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: [{ parts: [{ text: 'Hãy rà soát các mục trên theo đúng định dạng JSON yêu cầu.' }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 3072 },
    };
    return _callGemini(body);
  }

  /* ----------------------------------------------------------
     Chạy 1 đợt audit
  ---------------------------------------------------------- */
  async function _runAudit() {
    if (_busy) { _timer = setTimeout(_runAudit, RETRY_BUSY_MS); return; }
    if (!_queue.length) return;
    if (!_canUseAudit()) { _queue = []; return; }

    const batch = _dedupeById(_queue.splice(0, _queue.length)).slice(0, MAX_BATCH);
    if (!batch.length) return;
    // Còn dư (quá MAX_BATCH) → giữ lại đợt sau
    if (_queue.length) { clearTimeout(_timer); _timer = setTimeout(_runAudit, RETRY_BUSY_MS); }

    // Lưu ý: batch đã được đánh dấu "đã kiểm tra" (_checked) + "đã claim"
    // (server) ngay từ lúc _enqueue(), không lặp lại ở đây nữa.

    _busy = true;
    try {
      let rules = [];
      try { rules = await fetchRulesFromGas(); } catch { rules = []; }

      const parsedList = batch.map(ev => ({ ev, parsed: parseEventTitle(ev.title) }));
      const result = await _callAuditModel(parsedList, rules);
      const newSug = _buildSuggestions(parsedList, result, rules);
      if (newSug.length) {
        const ids = new Set(newSug.map(s => s.id));
        _suggestions = [..._suggestions.filter(s => !ids.has(s.id)), ...newSug];
        _renderBadge();
      }
    } catch (err) {
      console.warn('[A3PostSaveAudit] Không kiểm tra được lô vừa lưu:', err);
      // Gọi AI cho cả lô thất bại → "nhả" lại quyền kiểm tra (cả server lẫn
      // cục bộ) để lô này còn được thử lại ở lượt sau (bởi trình duyệt này
      // hoặc trình duyệt khác) — tránh bị đánh dấu "đã kiểm tra" vĩnh viễn
      // trong khi thực ra AI CHƯA từng xem qua các mục này.
      const failedIds = batch.map(e => e.id);
      failedIds.forEach(fid => _checked.delete(fid));
      _saveSet(CHECKED_KEY, _checked);
      _releaseIdsRemote(failedIds);
    } finally {
      _busy = false;
    }
  }

  function _dedupeById(events) {
    const seen = new Set();
    const out = [];
    for (const e of events) { if (e?.id && !seen.has(e.id)) { seen.add(e.id); out.push(e); } }
    return out;
  }

  const CATEGORY_VALUES = ['HOC_TAP', 'NE_NEP', 'PHONG_TRAO'];

  /** Khi lỗi là "sai loại" (issue === 'category'), điểm ĐÚNG phải lấy từ
   *  quy định chuẩn đã khớp trong sheet VI_PHAM — TUYỆT ĐỐI không được giữ
   *  nguyên điểm cũ (ev.points), vì điểm cũ chính là điểm đã bị chấm SAI
   *  theo loại sai (ví dụ: "Không học bài" bị chấm nhầm thành +100 kiểu
   *  Học Tập, trong khi quy định 46 thuộc Nề Nếp và phải là -100). Nếu vẫn
   *  giữ ev.points thì dòng "đã sửa" sẽ chỉ đổi nhãn loại/môn nhưng vẫn
   *  cộng sai điểm y như cũ.
   *
   *  matchedRuleIndex (nếu có, 1-based, do chính AI trả về — xem prompt) là
   *  nguồn đáng tin CẬY NHẤT: AI đã tự nói rõ nó đối chiếu với đúng quy định
   *  số mấy trong danh sách, nên tra thẳng theo vị trí đó, KHÔNG cần so
   *  khớp text nữa (so khớp text rất dễ trượt vì suggested_title là AI viết
   *  LẠI theo văn phong riêng, không nhất thiết giống hệt tên quy định gốc
   *  — ví dụ đã gặp: quy định là "Nề Nếp" ghi điểm +11.111 kiểu Nề Nếp,
   *  suggested_title là "không làm bài tập về nhà" != tên quy định gốc "k lm
   *  bTVN", so text có thể không khớp dù AI ĐÃ xác định đúng quy định).
   *  Chỉ khi KHÔNG có matchedRuleIndex hợp lệ mới fallback về so khớp text
   *  (trường hợp model cũ chưa hỗ trợ trường này, hoặc trả về thiếu). Nếu cả
   *  2 cách đều không tìm được, đành fallback về điểm cũ — không có gì chắc
   *  chắn để thay thế. */
  function _resolveCorrectPoints(rules, suggestedCategory, suggestedContentTitle, fallbackPoints, matchedRuleIndex) {
    if (!Array.isArray(rules) || !rules.length) return fallbackPoints;

    if (Number.isInteger(matchedRuleIndex) && matchedRuleIndex >= 1 && matchedRuleIndex <= rules.length) {
      const byIndex = rules[matchedRuleIndex - 1];
      if (byIndex && Number.isFinite(Number(byIndex.points))) return Number(byIndex.points);
    }

    const norm = normalizeStrSafe(suggestedContentTitle);
    const matched = rules.find(rr => rr && normalizeStrSafe(rr.title) === norm && rr.category === suggestedCategory)
                 || rules.find(rr => rr && normalizeStrSafe(rr.title) === norm);
    if (matched && Number.isFinite(Number(matched.points))) return Number(matched.points);
    return fallbackPoints;
  }

  function _buildSuggestions(parsedList, result, rules) {
    const out = [];
    if (!Array.isArray(result)) return out;

    result.forEach(r => {
      const item = parsedList[r?.index];
      if (!item || !r || r.issue === 'none' || !r.issue) return;

      const ev = item.ev;
      // Tổ nào sửa tổ đó — kiểm tra lại quyền tại thời điểm build (quyền có
      // thể đổi trong lúc chờ AI trả lời, vd. tuần vừa bị khoá).
      if (!_canEditStudentId(ev.studentId, ev.week)) return;
      const p  = item.parsed;
      if (_dismissed.has(_dismissKey(ev.studentId, ev.week, ev.title, ev.points))) return;

      const suggestedCategory = CATEGORY_VALUES.includes(r.suggested_category) ? r.suggested_category : p.category;
      const subjectsList = typeof subjects !== 'undefined' ? subjects : [];
      const suggestedSubject = suggestedCategory === 'HOC_TAP'
        ? (r.suggested_subject && subjectsList.includes(r.suggested_subject) ? r.suggested_subject : (p.subject || subjectsList[0] || null))
        : null;
      const suggestedContentTitle = String(r.suggested_title || p.contentTitle || '').trim();
      if (!suggestedContentTitle) return;

      // KHÔNG dựa vào r.issue (nhãn AI tự gắn) để biết loại có đổi hay không —
      // model đôi khi trả "abbr" dù suggested_category thực tế đã khác loại
      // gốc (đã gặp thực tế: đổi Nề Nếp → Học Tập nhưng vẫn báo issue "abbr").
      // Phải tự đối chiếu suggestedCategory/suggestedSubject với loại/môn GỐC
      // — đây là nguồn sự thật đáng tin hơn để quyết định có cần tính lại
      // điểm chuẩn hay không, tránh lặp lại đúng lỗi vừa sửa trước đó (giữ
      // điểm sai khi đổi loại).
      const sameCat  = suggestedCategory === p.category;
      const sameSubj = suggestedCategory === 'HOC_TAP' ? (suggestedSubject === p.subject) : true;
      const categoryChanged = !sameCat || !sameSubj;

      const suggestedPoints = categoryChanged
        ? _resolveCorrectPoints(rules, suggestedCategory, suggestedContentTitle, ev.points, Number.isInteger(r.matched_rule_index) ? r.matched_rule_index : null)
        : (r.issue === 'points' && Number.isInteger(r.matched_rule_index)
            ? _resolveCorrectPoints(rules, suggestedCategory, suggestedContentTitle, ev.points, r.matched_rule_index)
            : ev.points);

      const sameTitle  = normalizeStrSafe(suggestedContentTitle) === normalizeStrSafe(p.contentTitle);
      const samePoints = suggestedPoints === ev.points;
      if (sameCat && sameSubj && sameTitle && samePoints) return; // AI báo có vấn đề nhưng thực ra không đổi gì → bỏ qua

      let day;
      try { day = eventDay(ev); } catch { day = null; }
      if (day === null || day === undefined) return;

      let newTitle;
      try { newTitle = formatSavedTitle(day, suggestedCategory, suggestedSubject || (subjectsList[0] || ''), suggestedContentTitle, suggestedPoints); }
      catch { return; }

      out.push({
        id: ev.id,
        studentId: ev.studentId,
        week: ev.week,
        studentName: (state.students || []).find(s => s.id === ev.studentId)?.name || '?',
        oldTitle: ev.title,
        newTitle,
        points: suggestedPoints,
        category: suggestedCategory,
        // Giữ nguyên note gốc (vd. dấu nghỉ tập trung __TT_ABSENCE__...) —
        // nếu không mang theo, dòng "đã sửa" sẽ mất dấu hiệu đặc biệt này
        // dù nội dung điểm vẫn đúng, làm mất tích trong tab Nghỉ tập trung.
        note: ev.note,
        // Giữ lại loại/môn/ĐIỂM GỐC (trước khi sửa) — cần để có thể Hoàn tác
        // đúng như cũ nếu sau này phát hiện AI sửa sai.
        originalCategory: p.category,
        originalSubject: p.subject || null,
        originalPoints: ev.points,
        reason: String(r.reason || '').trim(),
        // Nhãn hiển thị (badge "Sai loại/môn" vs "Viết tắt") tự suy ra từ
        // categoryChanged thực tế — KHÔNG dùng r.issue thô của AI, vì lý do
        // đã giải thích ở trên.
        issueType: categoryChanged ? 'category' : (!samePoints ? 'points' : 'abbr'),
      });
    });

    return out;
  }

  /* ----------------------------------------------------------
     ÁP DỤNG / BỎ QUA gợi ý
  ---------------------------------------------------------- */
  async function _applyFix(sugId) {
    const s = _suggestions.find(x => x.id === sugId);
    if (!s || _applyingIds.has(sugId)) return;

    // Chốt cứng cuối cùng — bắt buộc kiểm tra lại NGAY TRƯỚC KHI gửi lệnh
    // xoá/thêm. saveScoreChanges() chỉ tự lọc quyền cho phần "additions",
    // KHÔNG lọc quyền cho "deletions" — nếu không chặn ở đây, 1 người
    // (vd. tổ trưởng tổ khác, hoặc tuần vừa bị khoá) có thể vô tình XOÁ
    // được dòng cũ mà dòng mới lại bị chặn không thêm vào được → mất điểm.
    if (!_canEditStudentId(s.studentId, s.week)) {
      if (typeof _notify === 'function') {
        _notify('Bạn không có quyền sửa mục này (không thuộc tổ của bạn hoặc tuần đã khoá).', 'error');
      }
      _suggestions = _suggestions.filter(x => x.id !== sugId);
      _renderBadge();
      return;
    }

    _applyingIds.add(sugId);
    _renderBadge();
    let keepSuggestion = false;
    try {
      const beforeIds = new Set((state.events || []).map(e => e.id));
      const origPoints = s.originalPoints ?? s.points;
      await saveScoreChanges({
        additions: [{
          studentId: s.studentId, week: s.week, title: s.newTitle,
          points: s.points, type: s.points >= 0 ? 'CONG' : 'TRU',
          category: s.category, createdBy: 'AI Hậu kiểm',
          createdAt: new Date().toISOString(),
          // Mang theo note gốc (vd. dấu nghỉ tập trung) sang dòng mới —
          // nếu không, dòng sửa xong sẽ mất dấu dù điểm/tiêu đề đúng, và
          // vì đây là dữ liệu gửi thẳng lên GAS nên mất luôn cả sau reload.
          note: s.note,
        }],
        // Dòng CŨ đang bị xoá có điểm CŨ (có thể sai, ví dụ +100) — phải
        // dùng originalPoints ở đây, KHÔNG dùng s.points (điểm mới, đã sửa),
        // nếu không saveScoreChanges() sẽ không khớp được đúng dòng cần xoá.
        deletions: [{ id: s.id, studentId: s.studentId, week: s.week, title: s.oldTitle, points: origPoints }],
      });

      // XÁC MINH dòng CŨ đã thực sự bị xoá. saveScoreChanges() có thể xoá
      // "không khớp" (server trả unmatchedDeletions) một cách ÂM THẦM — chỉ
      // tự bắn 1 toast riêng, KHÔNG throw lỗi ra ngoài — nên nếu không tự
      // kiểm tra lại ở đây, hàm này sẽ tưởng đã xong trong khi dòng cũ (sai)
      // vẫn còn nguyên, gây cộng trùng điểm (đúng thực tế đã gặp: vừa có
      // dòng cũ +11.111 vừa có dòng mới -100 cùng tồn tại).
      // FIX: so title bằng bản đã chuẩn hoá (NFC + gộp khoảng trắng) thay vì
      // === thô — nếu không, một chênh lệch Unicode/khoảng trắng vô hình khi
      // hiển thị (title "nhìn giống hệt" nhau) sẽ khiến hàm này KHÔNG tìm ra
      // dòng cũ còn sót (leftoverOld = undefined) dù nó vẫn còn trên UI, nên
      // toàn bộ bước kiểm tra lại/xoá lại phía dưới bị bỏ qua oan.
      const findLeftoverOld = () => (state.events || []).find(e =>
        e.studentId === s.studentId && e.week === s.week &&
        normTitleForMatch(e.title) === normTitleForMatch(s.oldTitle) && e.points === origPoints
      );
      let leftoverOld = findLeftoverOld();

      if (leftoverOld) {
        // Thử xoá lại đúng 1 lần với ID MỚI NHẤT của dòng cũ — phòng trường
        // hợp id cũ (s.id) đã bị lệch vị trí do có thay đổi khác xen vào
        // giữa lúc quét và lúc bấm Áp dụng (id sinh theo vị trí dòng).
        try {
          await saveScoreChanges({
            additions: [],
            deletions: [{ id: leftoverOld.id, studentId: s.studentId, week: s.week, title: s.oldTitle, points: origPoints }],
          });
        } catch { /* để kiểm tra lại ngay dưới, không cần throw ở đây */ }
        leftoverOld = findLeftoverOld();
      }

      if (leftoverOld) {
        if (typeof _notify === 'function') {
          _notify(`Đã thêm dòng sửa của ${s.studentName} nhưng KHÔNG xoá được dòng cũ (đang trùng điểm) — vui lòng bấm "Áp dụng" lại hoặc xoá dòng cũ thủ công.`, 'error');
        }
        // Cập nhật lại id dòng cũ theo trạng thái mới nhất rồi GIỮ gợi ý này
        // lại trong hàng đợi (không coi là đã xử lý xong) để người dùng còn
        // bấm "Áp dụng" lại được ngay, nhắm đúng dòng.
        s.id = leftoverOld.id;
        keepSuggestion = true;
        return;
      }

      // Tìm id của dòng MỚI vừa được tạo ra (server tự sinh id, không biết
      // trước) — cần để có thể Hoàn tác đúng dòng này sau này nếu cần.
      let newId = null;
      try {
        (state.events || []).forEach(e => {
          if (newId) return;
          if (!beforeIds.has(e.id) && e.studentId === s.studentId && e.week === s.week
            && normTitleForMatch(e.title) === normTitleForMatch(s.newTitle) && e.points === s.points) newId = e.id;
        });
      } catch { /* noop — không tìm được id mới thì vẫn cho phép Hoàn tác, chỉ là kém chính xác hơn */ }

      const u = _currentUser();
      const _actorName  = (() => { try { return typeof actorName  !== 'undefined' ? actorName  : (JSON.parse(sessionStorage.getItem('a3k64-user') || 'null')?.displayName || ''); } catch { return ''; } })();
      const _actorEmail = (() => { try { return typeof actorEmail !== 'undefined' ? actorEmail : (JSON.parse(sessionStorage.getItem('a3k64-user') || 'null')?.email      || ''); } catch { return ''; } })();
      const newEntry = {
        historyId:        `h-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        newId,
        studentId:        s.studentId,
        week:             s.week,
        studentName:      s.studentName,
        oldTitle:         s.oldTitle,
        newTitle:         s.newTitle,
        points:           s.points,
        // Note gốc (vd. dấu nghỉ tập trung) — cần để Hoàn tác khôi phục
        // đúng dòng ban đầu, không chỉ đúng điểm/tiêu đề.
        note:             s.note,
        originalCategory: s.originalCategory,
        originalSubject:  s.originalSubject,
        originalPoints:   origPoints,
        actorName:        _actorName,
        actorEmail:       _actorEmail,
        appliedAt:        new Date().toISOString(),
        undone:   false,
        undoing:  false,
      };
      // Thêm vào đầu danh sách local — để panel lịch sử hiện ngay mà không cần reload
      _appliedHistory.unshift(newEntry);
      if (_appliedHistory.length > MAX_HISTORY_ITEMS) _appliedHistory.length = MAX_HISTORY_ITEMS;

      // Ghi bền lên server (bất đồng bộ, không chặn UI)
      _logAiEditRemote(newEntry);

      if (typeof _notify === 'function') {
        _notify(`Đã sửa 1 mục điểm của ${s.studentName} theo gợi ý AI.`, 'success');
      }
    } catch (err) {
      if (typeof _notify === 'function') _notify('Áp dụng gợi ý thất bại: ' + (err?.message || ''), 'error');
    } finally {
      _applyingIds.delete(sugId);
      if (!keepSuggestion) _suggestions = _suggestions.filter(x => x.id !== sugId);
      _renderBadge();
    }
  }

  /* ----------------------------------------------------------
     HOÀN TÁC — phòng khi gợi ý AI đã Áp dụng hoá ra lại sai, hoặc chỉ đơn
     giản người dùng đổi ý. Xoá dòng do AI vừa tạo, thêm lại dòng đúng như
     nội dung GỐC trước khi sửa.
  ---------------------------------------------------------- */
  async function _undoFix(historyId) {
    const h = _appliedHistory.find(x => x.historyId === historyId);
    if (!h || h.undone || h.undoing) return;

    // Chốt quyền y hệt lúc Áp dụng — tránh hoàn tác được dòng không thuộc
    // tổ mình hoặc dòng thuộc tuần đã khoá.
    if (!_canEditStudentId(h.studentId, h.week)) {
      if (typeof _notify === 'function') {
        _notify('Bạn không có quyền hoàn tác mục này (không thuộc tổ của bạn hoặc tuần đã khoá).', 'error');
      }
      return;
    }

    h.undoing = true;
    _renderBadge();
    try {
      const beforeIds = new Set((state.events || []).map(e => e.id));
      // Khôi phục lại ĐÚNG như dòng gốc trước khi AI sửa → phải dùng
      // originalPoints (điểm gốc, trước khi bị đổi), KHÔNG dùng h.points
      // (điểm MỚI sau khi đã sửa) — nếu không, "Hoàn tác" sẽ chỉ đổi lại
      // tên/loại nhưng vẫn giữ điểm đã sửa, tức là hoàn tác không trọn vẹn.
      const restorePoints = h.originalPoints ?? h.points;
      await saveScoreChanges({
        additions: [{
          studentId: h.studentId, week: h.week, title: h.oldTitle,
          points: restorePoints, type: restorePoints >= 0 ? 'CONG' : 'TRU',
          category: h.originalCategory || 'HOC_TAP', createdBy: 'Hoàn tác AI Hậu kiểm',
          createdAt: new Date().toISOString(),
          // Khôi phục lại đúng note gốc (vd. dấu nghỉ tập trung) — nếu
          // không, Hoàn tác sẽ trả đúng điểm/tiêu đề nhưng vẫn thiếu dấu.
          note: h.note,
        }],
        deletions: h.newId ? [{ id: h.newId, studentId: h.studentId, week: h.week, title: h.newTitle, points: h.points }] : [],
      });

      // Coi mục vừa khôi phục là "đã bỏ qua" để AI không lập tức báo lại
      // đúng gợi ý vừa bị người dùng từ chối bằng cách hoàn tác, đồng thời
      // đánh dấu dòng mới khôi phục là "đã kiểm tra" (không cần quét lại).
      _dismissed.add(_dismissKey(h.studentId, h.week, h.oldTitle, restorePoints));
      _saveSet(DISMISSED_KEY, _dismissed);
      try {
        const restored = (state.events || []).find(e => !beforeIds.has(e.id)
          && e.studentId === h.studentId && e.week === h.week && normTitleForMatch(e.title) === normTitleForMatch(h.oldTitle) && e.points === restorePoints);
        if (restored) { _checked.add(restored.id); _saveSet(CHECKED_KEY, _checked); }
      } catch { /* noop */ }

      h.undone = true;
      // Cập nhật bền trên server (bất đồng bộ)
      _undoAiEditRemote(h.historyId).catch(err => {
        console.warn('[A3PostSaveAudit] Không cập nhật được trạng thái Hoàn tác lên server:', err);
      });
      if (typeof _notify === 'function') _notify(`Đã hoàn tác mục điểm của ${h.studentName}.`, 'success');
    } catch (err) {
      if (typeof _notify === 'function') _notify('Hoàn tác thất bại: ' + (err?.message || ''), 'error');
    } finally {
      h.undoing = false;
      _renderBadge();
    }
  }

  function _dismissFix(sugId) {
    const s = _suggestions.find(x => x.id === sugId);
    if (s) { _dismissed.add(_dismissKey(s.studentId, s.week, s.oldTitle, s.points)); _saveSet(DISMISSED_KEY, _dismissed); }
    _suggestions = _suggestions.filter(x => x.id !== sugId);
    _renderBadge();
  }

  function _dismissAll() {
    _suggestions.forEach(s => _dismissed.add(_dismissKey(s.studentId, s.week, s.oldTitle, s.points)));
    _saveSet(DISMISSED_KEY, _dismissed);
    _suggestions = [];
    _panelOpen = false;
    _renderBadge();
  }

  /* ----------------------------------------------------------
     UI — nút nổi + panel gợi ý
  ---------------------------------------------------------- */
  function _root() {
    let root = document.getElementById(ROOT_ID);
    if (!root) { root = document.createElement('div'); root.id = ROOT_ID; document.body.appendChild(root); }
    return root;
  }

  function _issueLabel(t) { return t === 'abbr' ? 'Viết tắt' : t === 'points' ? 'Sai điểm' : 'Sai loại/môn'; }
  // Đếm mục chưa hoàn tác (trong batch đang giữ local — đủ để hiển thị badge)
  function _visibleHistoryCount() { return _appliedHistory.filter(h => !h.undone).length; }
  // Số bản ghi đã hoàn tác (để hiển thị thêm trong panel)
  function _undoneHistoryCount()  { return _appliedHistory.filter(h =>  h.undone).length; }

  function _suggestionsPanelHtml() {
    const rows = _suggestions.map(s => `
      <div class="a3-audit-row" data-id="${_esc(s.id)}">
        <div class="a3-audit-row-top">
          <span class="a3-audit-student">${_esc(s.studentName)}</span>
          <span class="a3-audit-tag ${s.issueType === 'abbr' ? 'abbr' : s.issueType === 'points' ? 'points' : 'cat'}">${_esc(_issueLabel(s.issueType))}</span>
        </div>
        <div class="a3-audit-diff">
          <div class="a3-audit-old">${_esc(cleanTitleFromEvent ? cleanTitleFromEvent(s.oldTitle) : s.oldTitle)}</div>
          <div class="a3-audit-arrow">→</div>
          <div class="a3-audit-new">${_esc(cleanTitleFromEvent ? cleanTitleFromEvent(s.newTitle) : s.newTitle)}</div>
        </div>
        ${s.reason ? `<div class="a3-audit-reason">${_esc(s.reason)}</div>` : ''}
        <div class="a3-audit-actions">
          <button type="button" class="a3-audit-apply" data-id="${_esc(s.id)}" ${_applyingIds.has(s.id) ? 'disabled' : ''}>
            ${_applyingIds.has(s.id) ? 'Đang sửa…' : 'Áp dụng'}
          </button>
          <button type="button" class="a3-audit-skip" data-id="${_esc(s.id)}" ${_applyingIds.has(s.id) ? 'disabled' : ''}>Bỏ qua</button>
        </div>
      </div>
    `).join('');

    const histCount = _visibleHistoryCount();
    return `
      <div class="a3-audit-panel" id="a3-audit-panel">
        <div class="a3-audit-panel-head">
          <span>AI Hậu kiểm — ${_suggestions.length} mục cần xem lại</span>
          <button type="button" class="a3-audit-close" id="a3-audit-close-btn" title="Đóng">✕</button>
        </div>
        <div class="a3-audit-panel-body">${rows || '<div class="a3-audit-empty">Không còn mục nào.</div>'}</div>
        <div class="a3-audit-panel-foot">
          ${_suggestions.length ? `<button type="button" id="a3-audit-dismiss-all">Bỏ qua tất cả</button>` : ''}
          <button type="button" id="a3-audit-show-history">↩ Lịch sử AI đã sửa${histCount ? ` (${histCount})` : ''}</button>
        </div>
      </div>
    `;
  }

  function _historyPanelHtml() {
    // Lấy danh sách tuần duy nhất để hiển thị trong bộ lọc
    const weeks = [...new Set(_appliedHistory.map(h => h.week).filter(Boolean))].sort((a, b) => Number(b) - Number(a));
    const students = [...new Map(_appliedHistory.map(h => [h.studentId, h.studentName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));

    const fWeek      = _historyFilter.week;
    const fStudent   = _historyFilter.studentId;
    const filtered   = _appliedHistory.filter(h =>
      (!fWeek    || h.week      === fWeek) &&
      (!fStudent || h.studentId === fStudent)
    );

    const rows = filtered.map(h => {
      const dateLabel = h.appliedAt ? new Date(h.appliedAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
      const actorLabel = h.actorName || h.actorEmail || '';
      return `
      <div class="a3-audit-row" data-hid="${_esc(h.historyId)}">
        <div class="a3-audit-row-top">
          <span class="a3-audit-student">${_esc(h.studentName)}${h.week ? ` <span class="a3-audit-week-tag">Tuần ${_esc(h.week)}</span>` : ''}</span>
          <span class="a3-audit-tag ${h.undone ? 'undone' : 'cat'}">${h.undone ? 'Đã hoàn tác' : 'AI đã sửa'}</span>
        </div>
        <div class="a3-audit-diff">
          <div class="a3-audit-old">${_esc(cleanTitleFromEvent ? cleanTitleFromEvent(h.oldTitle) : h.oldTitle)}</div>
          <div class="a3-audit-arrow">→</div>
          <div class="a3-audit-new">${_esc(cleanTitleFromEvent ? cleanTitleFromEvent(h.newTitle) : h.newTitle)}</div>
        </div>
        ${dateLabel || actorLabel ? `<div class="a3-audit-meta">${_esc(dateLabel)}${actorLabel ? ` · ${_esc(actorLabel)}` : ''}</div>` : ''}
        ${h.undone && h.undoneBy ? `<div class="a3-audit-meta undone-by">Hoàn tác bởi: ${_esc(h.undoneBy)}${h.undoneAt ? ' · ' + new Date(h.undoneAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</div>` : ''}
        ${!h.undone && _canEditStudentId(h.studentId, h.week) ? `
        <div class="a3-audit-actions">
          <button type="button" class="a3-audit-undo" data-hid="${_esc(h.historyId)}" ${h.undoing ? 'disabled' : ''}>
            ${h.undoing ? 'Đang hoàn tác…' : 'Hoàn tác'}
          </button>
        </div>` : ''}
      </div>`;
    }).join('');

    const loadingMsg = _historyLoading ? '<div class="a3-audit-empty">Đang tải lịch sử…</div>' : '';
    const emptyMsg   = (!_historyLoading && !filtered.length) ? '<div class="a3-audit-empty">Chưa có bản ghi nào.</div>' : '';

    return `
      <div class="a3-audit-panel a3-audit-panel-lg" id="a3-audit-panel">
        <div class="a3-audit-panel-head">
          <span>Lịch sử AI Hậu kiểm</span>
          <div style="display:flex;gap:6px;align-items:center;">
            <button type="button" class="a3-audit-history-reload" title="Tải lại từ server" id="a3-audit-reload-btn">↻</button>
            <button type="button" class="a3-audit-close" id="a3-audit-close-btn" title="Đóng">✕</button>
          </div>
        </div>
        <div class="a3-audit-history-filters">
          <select id="a3-audit-filter-week" class="a3-audit-filter-sel">
            <option value="">Tất cả tuần</option>
            ${weeks.map(w => `<option value="${_esc(w)}" ${w === fWeek ? 'selected' : ''}>Tuần ${_esc(w)}</option>`).join('')}
          </select>
          <select id="a3-audit-filter-student" class="a3-audit-filter-sel">
            <option value="">Tất cả học sinh</option>
            ${students.map(([sid, sname]) => `<option value="${_esc(sid)}" ${sid === fStudent ? 'selected' : ''}>${_esc(sname)}</option>`).join('')}
          </select>
        </div>
        <div class="a3-audit-history-count">${filtered.length} / ${_appliedHistory.length} bản ghi${fWeek || fStudent ? ' (đang lọc)' : ''}</div>
        <div class="a3-audit-panel-body">${loadingMsg}${rows}${emptyMsg}</div>
        <div class="a3-audit-panel-foot">
          <button type="button" id="a3-audit-back-to-suggestions">← Quay lại gợi ý${_suggestions.length ? ` (${_suggestions.length})` : ''}</button>
        </div>
      </div>
    `;
  }

  function _panelHtml() {
    return _panelView === 'history' ? _historyPanelHtml() : _suggestionsPanelHtml();
  }

  function _renderBadge() {
    const root = _root();
    if (!_canUseAudit()) { root.innerHTML = ''; _panelOpen = false; return; }

    const sugCount  = _suggestions.length;
    const histCount = _visibleHistoryCount();

    // Ẩn badge khi chưa có gì để hiện VÀ AI chưa quét xong lần đầu
    // (tránh badge trống ngay lúc mở trang — chờ ít nhất lần quét đầu tiên)
    if (!sugCount && !histCount && !_initialScanDone && !_historyLoaded) {
      root.innerHTML = ''; _panelOpen = false; return;
    }
    // Từ sau lần quét đầu hoặc đã load lịch sử: luôn hiện badge cho quyền quản trị
    if (!sugCount) _panelView = 'history';

    _injectCSS();
    const label = sugCount ? `AI: ${sugCount} mục cần xem lại` : `AI: đã sửa ${histCount} mục`;
    root.innerHTML = `
      <button type="button" class="a3-audit-badge${sugCount ? '' : ' a3-audit-badge-calm'}" id="a3-audit-badge-btn">
        <span class="a3-audit-badge-icon">${sugCount ? '⚠' : '↩'}</span>
        <span>${label}</span>
      </button>
      ${_panelOpen ? _panelHtml() : ''}
    `;
    root.querySelector('#a3-audit-badge-btn')?.addEventListener('click', () => { _panelOpen = !_panelOpen; _renderBadge(); });
    if (!_panelOpen) return;

    root.querySelector('#a3-audit-close-btn')?.addEventListener('click', () => { _panelOpen = false; _renderBadge(); });
    root.querySelector('#a3-audit-dismiss-all')?.addEventListener('click', _dismissAll);
    root.querySelector('#a3-audit-show-history')?.addEventListener('click', () => {
      _panelView = 'history';
      _renderBadge();
      // Tải lịch sử từ server (nếu chưa tải hoặc cần reload)
      _ensureHistoryLoaded(false);
    });
    root.querySelector('#a3-audit-back-to-suggestions')?.addEventListener('click', () => { _panelView = 'suggestions'; _renderBadge(); });
    root.querySelectorAll('.a3-audit-apply').forEach(btn => {
      btn.addEventListener('click', () => _applyFix(btn.dataset.id));
    });
    root.querySelectorAll('.a3-audit-skip').forEach(btn => {
      btn.addEventListener('click', () => _dismissFix(btn.dataset.id));
    });
    root.querySelectorAll('.a3-audit-undo').forEach(btn => {
      btn.addEventListener('click', () => _undoFix(btn.dataset.hid));
    });

    // Bộ lọc lịch sử
    root.querySelector('#a3-audit-filter-week')?.addEventListener('change', e => {
      _historyFilter.week = e.target.value;
      _renderBadge();
    });
    root.querySelector('#a3-audit-filter-student')?.addEventListener('change', e => {
      _historyFilter.studentId = e.target.value;
      _renderBadge();
    });

    // Nút reload lịch sử từ server
    root.querySelector('#a3-audit-reload-btn')?.addEventListener('click', () => {
      _historyLoaded = false;
      _ensureHistoryLoaded(true);
    });
  }

  function _injectCSS() {
    if (document.getElementById('a3-audit-css')) return;
    const st = document.createElement('style');
    st.id = 'a3-audit-css';
    st.textContent = `
#${ROOT_ID} { position: fixed; right: 16px; bottom: 16px; z-index: 9500; font-family: inherit; }
.a3-audit-badge {
  display: flex; align-items: center; gap: 8px;
  background: linear-gradient(135deg, #d97706, #b45309);
  color: #fff7ed; border: 0; border-radius: 999px;
  padding: 10px 16px; font-size: 13px; font-weight: 700;
  box-shadow: 0 6px 18px rgba(217,119,6,.35);
  cursor: pointer; animation: a3AuditPop .3s ease both;
}
.a3-audit-badge:hover { filter: brightness(1.08); }
.a3-audit-badge-icon { font-size: 15px; }
.a3-audit-badge-calm {
  background: linear-gradient(135deg, #334155, #1e293b);
  box-shadow: 0 6px 18px rgba(30,41,59,.35);
}
@keyframes a3AuditPop { 0% { transform: scale(.85); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }

/* Light mode: badge calm dùng màu accent mờ thay vì slate đen */
[data-theme="light"] .a3-audit-badge-calm {
  background: linear-gradient(135deg, #475569, #334155);
  box-shadow: 0 6px 18px rgba(51,65,85,.28);
  color: #f8fafc;
}

.a3-audit-panel {
  position: absolute; right: 0; bottom: 52px; width: 340px; max-height: 60vh;
  display: flex; flex-direction: column;
  background: var(--bg-deep, #0b1728); color: var(--text, #f8fafc);
  border: 1px solid rgba(148,163,184,.18); border-radius: 14px;
  box-shadow: 0 14px 36px rgba(0,0,0,.45); overflow: hidden;
  animation: a3AuditPop .18s ease both;
}

/* Light mode: panel nền sáng, chữ tối */
[data-theme="light"] .a3-audit-panel {
  background: var(--bg-card, #f8fafc);
  border-color: var(--border, #b8c5d4);
  box-shadow: 0 14px 36px rgba(0,0,0,.18);
  color: var(--text, #0a1220);
}
[data-theme="light"] .a3-audit-skip {
  background: rgba(71,85,105,.12); color: var(--text, #0a1220);
}
[data-theme="light"] .a3-audit-old { color: #b91c1c; }
[data-theme="light"] .a3-audit-new { color: #047857; }
[data-theme="light"] .a3-audit-tag.cat  { background: rgba(185,28,28,.12); color: #b91c1c; }
[data-theme="light"] .a3-audit-tag.abbr { background: rgba(29,78,216,.12); color: #1d4ed8; }
[data-theme="light"] .a3-audit-tag.points { background: rgba(180,83,9,.12); color: #b45309; }
[data-theme="light"] .a3-audit-tag.undone { background: rgba(71,85,105,.14); color: #475569; }
[data-theme="light"] .a3-audit-filter-sel {
  background: var(--bg-input, #e8eef5); color: var(--text, #0a1220);
  border-color: var(--border-input, #a0b0c3);
}
[data-theme="light"] .a3-audit-undo { background: rgba(217,119,6,.14); color: #92400e; }
.a3-audit-panel-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; font-size: 12.5px; font-weight: 700;
  border-bottom: 1px solid rgba(148,163,184,.14); flex-shrink: 0;
}
.a3-audit-close { background: transparent; border: 0; color: var(--text-dim,#94a3b8); cursor: pointer; font-size: 13px; padding: 2px 6px; }
.a3-audit-close:hover { color: var(--text,#f8fafc); }
.a3-audit-panel-body { overflow-y: auto; padding: 6px 10px; }
.a3-audit-empty { padding: 16px 4px; text-align: center; color: var(--text-dim,#94a3b8); font-size: 12.5px; }

.a3-audit-row { padding: 9px 4px; border-bottom: 1px solid rgba(148,163,184,.10); }
.a3-audit-row:last-child { border-bottom: 0; }
.a3-audit-row-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.a3-audit-student { font-size: 12.5px; font-weight: 700; }
.a3-audit-tag { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 999px; }
.a3-audit-tag.cat  { background: rgba(239,68,68,.16); color: #fca5a5; }
.a3-audit-tag.abbr { background: rgba(59,130,246,.16); color: #93c5fd; }
.a3-audit-tag.undone { background: rgba(148,163,184,.16); color: #cbd5e1; }
.a3-audit-tag.points { background: rgba(245,158,11,.18); color: #fcd34d; }

.a3-audit-diff { font-size: 11.5px; line-height: 1.45; }
.a3-audit-old { color: #fca5a5; text-decoration: line-through; opacity: .85; }
.a3-audit-arrow { color: var(--text-dim,#94a3b8); margin: 1px 0; }
.a3-audit-new { color: #6ee7b7; font-weight: 600; }
.a3-audit-reason { margin-top: 4px; font-size: 11px; color: var(--text-dim,#94a3b8); font-style: italic; }

.a3-audit-actions { display: flex; gap: 6px; margin-top: 6px; }
.a3-audit-apply, .a3-audit-skip, .a3-audit-undo {
  flex: 1; height: 28px; border-radius: 8px; border: 0; font-size: 11.5px; font-weight: 700; cursor: pointer;
}
.a3-audit-apply { background: var(--accent, #2563eb); color: #fff; }
.a3-audit-apply:disabled { opacity: .5; cursor: not-allowed; }
.a3-audit-apply:hover:not(:disabled) { filter: brightness(1.1); }
.a3-audit-skip { background: rgba(148,163,184,.14); color: var(--text,#f8fafc); }
.a3-audit-skip:hover:not(:disabled) { background: rgba(148,163,184,.24); }
.a3-audit-undo { background: rgba(217,119,6,.16); color: #fbbf24; }
.a3-audit-undo:disabled { opacity: .5; cursor: not-allowed; }
.a3-audit-undo:hover:not(:disabled) { background: rgba(217,119,6,.28); }

.a3-audit-panel-foot { padding: 8px 10px; border-top: 1px solid rgba(148,163,184,.14); flex-shrink: 0; }
.a3-audit-panel-foot button {
  width: 100%; height: 30px; border-radius: 8px; border: 1px solid rgba(148,163,184,.24);
  background: transparent; color: var(--text-dim,#94a3b8); font-size: 11.5px; cursor: pointer;
}
.a3-audit-panel-foot button:hover { color: var(--text,#f8fafc); border-color: rgba(148,163,184,.4); }

.a3-audit-week-tag {
  font-size: 10px; font-weight: 500; color: var(--text-dim,#94a3b8);
  background: rgba(148,163,184,.12); border-radius: 4px; padding: 1px 5px; margin-left: 4px;
}
.a3-audit-meta {
  font-size: 10.5px; color: var(--text-dim,#94a3b8); margin-top: 3px;
}
.a3-audit-meta.undone-by {
  color: #fbbf24; opacity: .75;
}
.a3-audit-panel-lg {
  width: 400px;
}
.a3-audit-history-filters {
  display: flex; gap: 6px; padding: 6px 10px 0;
  flex-shrink: 0;
}
.a3-audit-filter-sel {
  flex: 1; height: 28px; border-radius: 7px; border: 1px solid rgba(148,163,184,.2);
  background: rgba(255,255,255,.05); color: var(--text,#f8fafc); font-size: 11.5px; padding: 0 6px;
}
.a3-audit-filter-sel:focus { outline: none; border-color: var(--accent,#2563eb); }
.a3-audit-history-count {
  font-size: 10.5px; color: var(--text-dim,#94a3b8); padding: 4px 12px 2px;
  flex-shrink: 0;
}
.a3-audit-history-reload {
  background: transparent; border: 0; color: var(--text-dim,#94a3b8); cursor: pointer;
  font-size: 14px; padding: 2px 5px; border-radius: 5px;
  transition: color .15s, background .15s;
}
.a3-audit-history-reload:hover {
  color: var(--text,#f8fafc); background: rgba(148,163,184,.12);
}

@media (max-width: 480px) {
  #${ROOT_ID} { right: 10px; bottom: 10px; }
  .a3-audit-panel, .a3-audit-panel-lg { width: calc(100vw - 20px); }
}

/* ── Nút "Quét AI" trên toolbar ── */
.toolbar-button.ai-scan {
  background: color-mix(in srgb, #06b6d4 16%, var(--bg-mid));
  color: #0891b2;
  border-color: #06b6d433;
}
.toolbar-button.ai-scan:hover {
  background: color-mix(in srgb, #06b6d4 26%, var(--bg-mid));
  box-shadow: 0 8px 20px #06b6d422;
  transform: translateY(-2px);
}
.toolbar-button.ai-scan.scanning {
  opacity: .7;
  cursor: default;
  pointer-events: none;
}
[data-theme="light"] .toolbar-button.ai-scan { color: #0e7490; }
`;
    document.head.appendChild(st);
  }

  /* ----------------------------------------------------------
     QUÉT LẠI TOÀN BỘ DỮ LIỆU CŨ — 1 LẦN KHI MỞ BẢNG ĐIỂM
     ------------------------------------------------------------
     Khác với hook saveScoreChanges() (chỉ bắt mục MỚI lưu sau khi
     trang đã tải), đoạn này chủ động lấy TẤT CẢ các mục điểm đã
     có sẵn trong `state.events` (mọi tuần, mọi học sinh) ngay khi
     dữ liệu tải xong, rồi xếp vào cùng hàng đợi audit như bình
     thường. Nhờ `_checked` (lưu localStorage) nên mục nào đã được
     AI kiểm tra ở lần mở trước sẽ KHÔNG bị kiểm tra lại — càng mở
     lại nhiều lần, số mục cần quét mới càng ít đi (chỉ còn mục
     thực sự chưa từng được rà soát).
  ---------------------------------------------------------- */
  function _hasUsableData() {
    try {
      if (!Array.isArray(state.events) || !state.events.length) return false;
      if (state.dataSource === DATA_SOURCE.LOADING) return false;
      return true;
    } catch { return false; }
  }

  function _allScannableEvents() {
    try {
      return (state.events || []).filter(e =>
        e && e.id && !isSheetTotalEvent(e) && !String(e.id).startsWith('draft-') && _canEditStudentId(e.studentId, e.week)
      );
    } catch { return []; }
  }

  function _runInitialScan() {
    if (!_canUseAudit()) {
      console.log('[A3PostSaveAudit] _runInitialScan: không có quyền audit, role =', _currentUser().role);
      return;
    }
    const all = _allScannableEvents();
    const unchecked = all.filter(e => !_checked.has(e.id));
    console.log(`[A3PostSaveAudit] scan: tổng=${all.length}, chưa kiểm tra=${unchecked.length}, đã checked=${_checked.size}`);
    if (!unchecked.length) return;
    if (typeof _notify === 'function' && unchecked.length > 3) {
      _notify(`AI đang quét lại ${unchecked.length} mục điểm cũ ở nền…`, 'info');
    }
    _enqueue(unchecked);
  }

  function _waitForDataAndScan() {
    if (_initialScanDone) return;
    if (_hasUsableData()) {
      _initialScanDone = true;
      _runInitialScan();
      // Badge có thể hiện ngay (ví dụ: tất cả mục đã được kiểm tra rồi,
      // không còn gì để quét — nhưng badge lịch sử vẫn nên xuất hiện)
      _renderBadge();
      return;
    }
    _initialScanTries++;
    if (_initialScanTries > INITIAL_SCAN_MAX_TRIES) {
      // Hết giới hạn chờ — vẫn render badge (chế độ lịch sử vẫn dùng được)
      _initialScanDone = true;
      _renderBadge();
      return;
    }
    setTimeout(_waitForDataAndScan, 500);
  }

  /* ----------------------------------------------------------
     BOOT
  ---------------------------------------------------------- */

  /** Ẩn/hiện badge khi modal chấm điểm mở/đóng — tránh badge đè lên
   *  nút "Lưu thay đổi" của modal (z-index modal = 8000 < badge = 9500). */
  function _watchModal() {
    const modalRoot = document.getElementById('a3-score-modal-root');
    if (!modalRoot) { setTimeout(_watchModal, 300); return; }
    const badge = () => document.getElementById(ROOT_ID);
    const update = () => {
      const el = badge();
      if (!el) return;
      const open = !!modalRoot.querySelector('#v2-backdrop');
      el.style.visibility = open ? 'hidden' : '';
      el.style.pointerEvents = open ? 'none' : '';
    };
    new MutationObserver(update).observe(modalRoot, { childList: true, subtree: false });
    update();
  }

  /* ----------------------------------------------------------
     NÚT "QUÉT AI" TRÊN TOOLBAR
     Inject vào .toolbar-actions ngay sau nút "Tự tính điểm" (.auto).
     Khi bấm: xoá cache checked → quét lại toàn bộ → thông báo kết quả.
  ---------------------------------------------------------- */
  function _patchToolbarScanBtn() {
    const tryInject = () => {
      if (!_canUseAudit()) return; // chỉ hiện cho admin/gvcn
      const bars = document.querySelectorAll('.toolbar-actions');
      bars.forEach(bar => {
        if (bar.querySelector('.toolbar-button.ai-scan')) return; // đã có rồi
        const autoBtn = bar.querySelector('.toolbar-button.auto');
        if (!autoBtn) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'toolbar-button ai-scan';
        btn.title = 'Quét điểm bằng AI';
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          <path d="M11 8v3l2 2"/>
        </svg><span class="tb-label">Quét AI</span>`;

        btn.addEventListener('click', () => {
          if (btn.classList.contains('scanning')) return;
          btn.classList.add('scanning');
          btn.querySelector('.tb-label').textContent = 'Đang quét…';

          // Xoá cache checked để buộc scan lại toàn bộ
          _checked.clear();
          _saveSet(CHECKED_KEY, _checked);
          _initialScanDone = false;
          _initialScanTries = 0;

          if (typeof _notify === 'function') {
            const total = _allScannableEvents().length;
            _notify(`AI đang quét ${total} mục điểm…`, 'info');
          }

          _waitForDataAndScan();

          // Sau khi queue chạy xong thì phục hồi nút (tối đa 30s chờ)
          const MAX_WAIT = 30000;
          const POLL_MS = 800;
          let elapsed = 0;
          const poll = setInterval(() => {
            elapsed += POLL_MS;
            const done = _initialScanDone && !_busy && _queue.length === 0;
            if (done || elapsed >= MAX_WAIT) {
              clearInterval(poll);
              btn.classList.remove('scanning');
              btn.querySelector('.tb-label').textContent = 'Quét AI';
              if (done && typeof _notify === 'function') {
                const sugN = _suggestions.length;
                _notify(
                  sugN > 0
                    ? `AI tìm thấy ${sugN} mục có thể sai — xem badge góc phải.`
                    : 'AI đã quét xong — không phát hiện lỗi nào.',
                  sugN > 0 ? 'warn' : 'success'
                );
              }
            }
          }, POLL_MS);
        });

        autoBtn.insertAdjacentElement('afterend', btn);
      });
    };

    tryInject();
    const obs = new MutationObserver(tryInject);
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function _boot() {
    _installHook();
    _waitForDataAndScan();
    _watchModal();
    _patchToolbarScanBtn();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
  } else {
    _boot();
  }

  window.__a3PostAudit = {
    applyFix:    _applyFix,
    dismissFix:  _dismissFix,
    undoFix:     _undoFix,
    loadHistory: (forceReload) => _ensureHistoryLoaded(!!forceReload),
    suggestions: () => _suggestions.slice(),
    history:     () => _appliedHistory.slice(),
    // Debug helpers — chạy trong console khi cần
    debug: () => ({
      role:        _currentUser().role,
      canAudit:    _canUseAudit(),
      checkedSize: _checked.size,
      queueLen:    _queue.length,
      suggestions: _suggestions.length,
      initialDone: _initialScanDone,
      busy:        _busy,
      gasUrl:      _gasUrlForAudit(),
    }),
    /** Xoá cache "đã kiểm tra" rồi quét lại toàn bộ — dùng khi muốn
     *  test hoặc ép AI re-audit mọi dòng điểm hiện có. */
    forceRescan: () => {
      _checked.clear();
      _saveSet(CHECKED_KEY, _checked);
      _initialScanDone = false;
      _initialScanTries = 0;
      _waitForDataAndScan();
      console.log('[A3PostSaveAudit] forceRescan: đã xoá checked cache, bắt đầu quét lại.');
    },
  };

})();
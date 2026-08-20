/* ============================================================
   A3K64 — Nhận xét thi đua AI (scoreboard-review.js)
   Tạo nhận xét thi đua tuần cho lớp 12A3K64 bằng Gemini API.
   Đặt nút "Nhận xét" vào toolbar cạnh Xuất Excel / Chụp ảnh / Tự tính điểm.
   ------------------------------------------------------------
   Phụ thuộc (từ scoreboard.js / scoreboard-ai.js):
     state, getDerived(), summarizeStudents(),
     fetchRulesFromGas(), SafeStorage,
     AI_DEFAULT_KEY (hoặc localStorage a3k64-gemini-key)
   ============================================================ */

(function A3ReviewModule() {
  'use strict';

  /* ──────────────────────────────────────────────────────
     CONFIG
  ────────────────────────────────────────────────────── */
  const ROOT_ID        = 'a3-review-modal-root';
  const AI_KEY_STORE   = 'a3k64-gemini-key';
  const AI_BASE_URL    = 'https://generativelanguage.googleapis.com/v1beta/models';
  const CLASS_NAME     = '12A3';          // ← cập nhật từ 11A3 lên 12A3
  const ALLOWED_ROLES  = ['to_truong', 'gvcn', 'lop_truong', 'bi_thu'];

  /**
   * API Key mặc định dùng chung cho cả lớp (đồng bộ với scoreboard-ai.js).
   * Nếu người dùng lưu key riêng vào localStorage thì key đó được ưu tiên.
   * Đổi key ở đây là đủ, không cần sửa trong _apiKey().
   */
  // Không hardcode key ở đây nữa — khi user chưa lưu key riêng,
  // gọi Gemini qua GAS proxy (action 'aiCall'), key thật giữ ở server.
  const AI_DEFAULT_KEY = '';

  const AI_MODELS = [
    'gemini-3.1-flash-lite',       // 15 RPM, 500 RPD ★ ưu tiên 1
    'gemini-3.5-flash-lite',                // 15 RPM, 500 RPD ★ ưu tiên 2
    'gemini-2.5-flash-lite',  // 10 RPM, 20 RPD
    'gemini-2.5-flash',       // 5 RPM, 20 RPD
    'gemini-3.5-flash',                     // 5 RPM, 20 RPD
    'gemini-3.6-flash',                     // 5 RPM, 20 RPD
    'gemini-3.0-flash',                     // 5 RPM, 20 RPD
    'gemini-2.0-flash-lite',                // 0/0 — cuối bảng
    'gemini-2.0-flash',                     // 0/0
    'gemini-3.1-pro',                       // 0/0
    'gemini-2.5-pro',         // 0/0
  ];

  /* ──────────────────────────────────────────────────────
     STATE
  ────────────────────────────────────────────────────── */
  let _open    = false;
  let _loading = false;
  let _result  = '';   // văn bản nhận xét đã sinh
  let _error   = '';
  let _copied  = false;

  /* ──────────────────────────────────────────────────────
     HELPERS
  ────────────────────────────────────────────────────── */
  function _esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function _root() { return document.getElementById(ROOT_ID); }

  function _apiKey() {
    try {
      const stored = localStorage.getItem(AI_KEY_STORE);
      if (stored && stored.trim()) return stored.trim();
    } catch {}
    // Dùng chung key mặc định với scoreboard-ai.js
    try { return window.__a3ReviewDefaultKey || AI_DEFAULT_KEY; } catch {}
    return '';
  }

  /** true nếu người dùng CHƯA lưu key riêng → phải gọi qua proxy server */
  function _isUsingDefaultKey() {
    try {
      const stored = localStorage.getItem(AI_KEY_STORE);
      return !stored || !stored.trim();
    } catch { return true; }
  }

  /** Lấy gasUrl đang dùng chung với scoreboard.js (biến global cùng scope). */
  function _gasUrlForAI() {
    try { return (typeof gasUrl !== 'undefined' && gasUrl) ? gasUrl : null; } catch { return null; }
  }

  /** Gọi Gemini gián tiếp qua GAS proxy — dùng khi không có key riêng. */
  async function _callGeminiViaProxy(model, body) {
    const url = _gasUrlForAI();
    if (!url) throw new Error('Chưa cấu hình GAS URL nên không dùng được key mặc định. Vui lòng nhập Gemini API Key riêng.');
    // Không set Content-Type: application/json — tránh CORS preflight mà
    // Apps Script Web App không xử lý được (xem lý do trong scoreboard-ai.js).
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ action: 'aiCall', model, geminiBody: body }),
    });
    if (!res.ok) throw new Error(`Proxy lỗi: HTTP ${res.status}`);
    const wrapper = await res.json();
    if (!wrapper || !wrapper.ok) throw new Error((wrapper && wrapper.error) || 'Proxy trả về lỗi không xác định');
    return wrapper.data;
  }

  function _currentUser() {
    try {
      if (typeof userRole !== 'undefined' && userRole) return { role: String(userRole).toLowerCase() };
    } catch {}
    try {
      const raw = sessionStorage.getItem('a3k64-user');
      if (raw) { const u = JSON.parse(raw); return { role: String(u?.role || 'hoc_sinh').toLowerCase() }; }
    } catch {}
    return { role: 'hoc_sinh' };
  }

  function _canUse() { return ALLOWED_ROLES.includes(_currentUser().role); }

  function _currentWeek() {
    try { return state.week || 1; } catch { return 1; }
  }

  /**
   * Danh sách các Tuần thực tế đang có dữ liệu trong state (đã tải từ GAS),
   * dùng để kiểm tra "tuần trước" có dữ liệu hay không trước khi so sánh.
   */
  function _weekList() {
    try {
      const raw = Array.isArray(state.weeks) ? state.weeks : [];
      return [...new Set(raw.map(Number))].filter(w => Number.isFinite(w) && w > 0).sort((a, b) => a - b);
    } catch { return []; }
  }

  /**
   * Tính lại danh sách tổng kết học sinh cho MỘT TUẦN BẤT KỲ (không nhất
   * thiết là tuần đang hiển thị trên UI). `state.events`/`state.students`
   * đã có sẵn dữ liệu của TẤT CẢ các tuần (do api.gs trả về gộp), nên chỉ
   * cần gọi lại `summarizeStudents()` với `week` khác — không cần gọi thêm
   * API nào cả.
   */
  function _summariesForWeek(week) {
    try {
      return summarizeStudents(state.students || [], state.events || [], week) || [];
    } catch (err) {
      console.warn('[Review] Lỗi khi tính summary cho tuần', week, err);
      return [];
    }
  }

  /** Tóm tắt toàn bộ học sinh cho MỘT TUẦN (mặc định: tuần đang xem) */
  function _buildSummary(week) {
    const targetWeek = week || _currentWeek();
    try {
      const summaries = targetWeek === _currentWeek()
        ? (getDerived().rawSummaries || [])
        : _summariesForWeek(targetWeek);

      // Nhóm theo Tổ
      const groups = {};
      for (const s of summaries) {
        const g = s.group || s.to || s.nhom || 'Chưa phân';
        if (!groups[g]) groups[g] = [];
        groups[g].push(s);
      }

      const lines = [];
      for (const [g, members] of Object.entries(groups).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))) {
        lines.push(`--- Tổ ${g} ---`);
        for (const s of members) {
          const events = (s.events || []).map(ev => `  • ${ev.title || ev.reason || '?'} (${ev.points >= 0 ? '+' : ''}${ev.points}đ)`).join('\n');
          const statusLabel = s.status || '?';
          lines.push(`${s.name}: Tổng ${s.total >= 0 ? '+' : ''}${s.total}đ | ${statusLabel}${s.rank ? ` | #${s.rank}` : ''}`);
          if (events) lines.push(events);
        }
      }

      // Thống kê tổng quan
      const allTotal  = summaries.reduce((acc, s) => acc + (s.total || 0), 0);
      const goodList  = summaries.filter(s => s.status === 'Tốt' || s.status === 'Khá').map(s => `${s.name}(${s.total}đ)`).join(', ');
      const badList   = summaries.filter(s => s.status === 'CĐ').map(s => `${s.name}(${s.total}đ)`).join(', ');
      const improved  = summaries.filter(s => (s.total || 0) > 0 && (s.events||[]).some(ev => ev.points > 0)).map(s => s.name).slice(0, 5).join(', ');

      return {
        week: targetWeek,
        lines: lines.join('\n'),
        allTotal,
        goodList,
        badList,
        improved,
        count: summaries.length,
        byId: new Map(summaries.map(s => [s.id, s])),
      };
    } catch (err) {
      console.warn('[Review] Lỗi khi build summary:', err);
      return { week: targetWeek, lines: '', allTotal: 0, goodList: '', badList: '', improved: '', count: 0, byId: new Map() };
    }
  }

  /**
   * So sánh tuần hiện tại với tuần liền trước (không áp dụng cho Tuần 1).
   * Trả về `null` nếu là Tuần 1 hoặc tuần trước chưa có dữ liệu.
   */
  function _buildComparison(curSummary) {
    const curWeek = curSummary.week;
    if (curWeek <= 1) return null; // Tuần 1 không có tuần trước để so sánh

    const prevWeek = curWeek - 1;
    if (!_weekList().includes(prevWeek)) return null; // Tuần trước chưa có dữ liệu

    const prevSummary = _buildSummary(prevWeek);
    if (!prevSummary.byId.size) return null;

    const deltas = [];
    for (const [id, cur] of curSummary.byId) {
      const prev = prevSummary.byId.get(id);
      if (!prev) continue; // học sinh mới, không có dữ liệu tuần trước
      deltas.push({ name: cur.name, delta: (cur.total || 0) - (prev.total || 0), curTotal: cur.total, prevTotal: prev.total });
    }

    const risers  = [...deltas].filter(d => d.delta > 0).sort((a,b)=>b.delta-a.delta).slice(0,5);
    const fallers = [...deltas].filter(d => d.delta < 0).sort((a,b)=>a.delta-b.delta).slice(0,5);
    const totalDelta = curSummary.allTotal - prevSummary.allTotal;

    return {
      prevWeek,
      prevAllTotal: prevSummary.allTotal,
      totalDelta,
      risersText:  risers.length  ? risers.map(d => `${d.name}(+${d.delta}đ, ${d.prevTotal}→${d.curTotal})`).join(', ')  : '(không có)',
      fallersText: fallers.length ? fallers.map(d => `${d.name}(${d.delta}đ, ${d.prevTotal}→${d.curTotal})`).join(', ') : '(không có)',
    };
  }

  /* ──────────────────────────────────────────────────────
     GEMINI CALL
  ────────────────────────────────────────────────────── */
  async function _callGemini(prompt) {
    const usingOwnKey = !_isUsingDefaultKey();
    const key = usingOwnKey ? _apiKey() : null;

    const requestBody = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 1200 },
    };

    let lastError = null;
    for (const model of AI_MODELS) {
      try {
        let data;
        if (usingOwnKey) {
          const res = await fetch(`${AI_BASE_URL}/${model}:generateContent?key=${encodeURIComponent(key)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          });
          if (res.status === 429 || res.status === 503) {
            lastError = new Error(`[${model}] quota hết`);
            continue;
          }
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(`Gemini lỗi (${model}): ${errBody?.error?.message || res.status}`);
          }
          data = await res.json();
        } else {
          try {
            data = await _callGeminiViaProxy(model, requestBody);
          } catch (proxyErr) {
            const errMsg = proxyErr?.message || 'Lỗi proxy';
            if (/quota|rate.?limit|resource.?exhaust|429|503/i.test(errMsg)) {
              lastError = new Error(`[${model}] quota hết`);
              continue;
            }
            throw new Error(`Gemini lỗi (${model}): ${errMsg}`);
          }
        }

        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!text.trim()) throw new Error(`Model ${model} trả về nội dung rỗng.`);
        return text.trim();
      } catch (err) {
        if (err.message.startsWith(`[${model}] quota`)) { lastError = err; continue; }
        throw err;
      }
    }
    throw new Error(`Tất cả model đều hết quota. Thử lại sau.\n(${lastError?.message})`);
  }

  /* ──────────────────────────────────────────────────────
     PROMPT
  ────────────────────────────────────────────────────── */
  function _buildPrompt(summary, comparison) {
    const comparisonBlock = comparison ? `

SO SÁNH VỚI TUẦN TRƯỚC (Tuần ${comparison.prevWeek}):
Tổng điểm cả lớp tuần trước: ${comparison.prevAllTotal >= 0 ? '+' : ''}${comparison.prevAllTotal} → tuần này: ${summary.allTotal >= 0 ? '+' : ''}${summary.allTotal} (${comparison.totalDelta >= 0 ? 'tăng' : 'giảm'} ${Math.abs(comparison.totalDelta)}đ)
Học sinh tiến bộ nhiều nhất so với tuần trước: ${comparison.risersText}
Học sinh giảm điểm nhiều nhất so với tuần trước: ${comparison.fallersText}` : '';

    return `Bạn là giáo viên chủ nhiệm lớp ${CLASS_NAME} đang viết nhận xét thi đua tuần.

DỮ LIỆU TUẦN ${summary.week} — LỚP ${CLASS_NAME}:
Tổng điểm cả lớp: ${summary.allTotal >= 0 ? '+' : ''}${summary.allTotal}
Số học sinh: ${summary.count}
Học sinh xếp loại Tốt/Khá: ${summary.goodList || '(Không có)'}
Học sinh Chưa Đạt: ${summary.badList || '(Không có)'}
${comparisonBlock}

CHI TIẾT TỪNG HỌC SINH:
${summary.lines || '(Không có dữ liệu)'}

NHIỆM VỤ:
Viết nhận xét thi đua tuần cho lớp ${CLASS_NAME} theo đúng mẫu sau:

🏆Nhận xét thi đua lớp ${CLASS_NAME} – Tuần ${summary.week}:
  ✅.Nhận xét mặt TÍCH CỰC: khen ngợi các bạn điểm cao, tiến bộ, đạt thành tích, tham gia phong trào. Nêu tên cụ thể kèm điểm.${comparison ? ' Nếu có học sinh tiến bộ rõ so với tuần trước, có thể nhắc kèm mức tăng.' : ''}
 ❌Nhận xét mặt CẦN CẢI THIỆN: nhắc những bạn điểm thấp, bị trừ điểm nhiều, lặp lỗi. Nêu tên và lỗi cụ thể.${comparison ? ' Nếu có học sinh giảm điểm rõ so với tuần trước, có thể nhắc kèm mức giảm.' : ''}
${comparison ? '  📊.So với tuần trước: 1-2 câu ngắn gọn nêu xu hướng chung của cả lớp (tổng điểm tăng/giảm bao nhiêu, tiến bộ hay đi xuống).' : ''}

QUY TẮC:
- Người viết nhận xét là CÔ (giáo viên nữ). Nếu cần xưng hô/nhắc đến bản thân người viết, LUÔN dùng "Cô" — TUYỆT ĐỐI KHÔNG dùng "Thầy", "Thầy/Cô" hay "Thầy, Cô" dưới bất kỳ hình thức nào.
- Viết bằng tiếng Việt, giọng giáo viên chủ nhiệm, gần gũi, chân thành
- Phải nêu tên học sinh thật kèm điểm số cụ thể (như trong dữ liệu)
- Nếu cả tuần không ai bị trừ điểm thì khen cả lớp và bỏ phần ❌
- Nếu không có ai xuất sắc đặc biệt thì không thêm phần không có trong dữ liệu
- Độ dài vừa phải (khoảng 6–12 câu), không dài dòng
- KHÔNG thêm tiêu đề thừa, KHÔNG giải thích, chỉ viết phần nhận xét thôi`;
  }

  /* ──────────────────────────────────────────────────────
     OPEN / CLOSE
  ────────────────────────────────────────────────────── */
  function _openModal() {
    if (_open) return;
    _open    = true;
    _loading = false;
    _result  = '';
    _error   = '';
    _copied  = false;
    _mount();
  }

  function _close() {
    if (!_open) return;
    _open = false;
    const root = _root();
    if (root) root.innerHTML = '';
    document.removeEventListener('keydown', _onKey);
  }

  function _onKey(e) { if (e.key === 'Escape' && _open) _close(); }

  /* ──────────────────────────────────────────────────────
     RENDER
  ────────────────────────────────────────────────────── */
  function _mount() {
    const root = _root();
    if (!root) return;
    root.innerHTML = _buildHTML();
    _bindEvents();
    document.addEventListener('keydown', _onKey);
  }

  function _buildHTML() {
    const week = _currentWeek();
    const canUse = _canUse();

    return `
<div class="a3rv-backdrop" id="a3rv-backdrop">
  <div class="a3rv-modal" role="dialog" aria-modal="true" aria-label="Nhận xét thi đua AI">

    <!-- HEADER -->
    <header class="a3rv-header">
      <div class="a3rv-header-left">
        <div class="a3rv-header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="20" height="20">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
        </div>
        <div>
          <div class="a3rv-header-title">
            Nhận xét thi đua
            <span class="a3rv-ai-badge">AI</span>
          </div>
          <div class="a3rv-header-sub">Gemini tự tạo nhận xét tuần cho lớp ${CLASS_NAME} · Tuần ${week}</div>
        </div>
      </div>
      <button type="button" class="a3rv-close-btn" id="a3rv-close-btn" title="Đóng (Esc)">
        <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2.5" width="16" height="16">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </header>

    <!-- BODY -->
    <div class="a3rv-body">

      <!-- LEFT: Tuỳ chọn + nút tạo -->
      <div class="a3rv-left">

        <div class="a3rv-section">
          <div class="a3rv-section-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Tuần nhận xét
          </div>
          <div class="a3rv-week-badge">Tuần ${week}</div>
          <p class="a3rv-hint-text">Nhận xét dựa trên dữ liệu điểm đang hiển thị trên bảng (Tuần ${week}).</p>
        </div>

        <div class="a3rv-section">
          <div class="a3rv-section-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/>
            </svg>
            Tông giọng
          </div>
          <select id="a3rv-tone" class="a3rv-select">
            <option value="chan_thanh" selected>Chân thành, gần gũi</option>
            <option value="nghiem_tuc">Nghiêm túc, chuẩn mực</option>
            <option value="dong_vien">Khích lệ, động viên</option>
          </select>
        </div>

        <div class="a3rv-section">
          <div class="a3rv-section-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Thêm chú thích (tuỳ chọn)
          </div>
          <textarea id="a3rv-extra" class="a3rv-textarea-small"
            placeholder="VD: Tuần này có thi thử THPT, lớp đang ôn thi…"
            rows="3"></textarea>
        </div>

        ${!canUse ? `
        <div class="a3rv-no-perm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span>Chỉ Tổ trưởng, Lớp trưởng, Bí thư và GVCN mới được dùng tính năng này.</span>
        </div>` : ''}

        ${_error ? `
        <div class="a3rv-error">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          ${_esc(_error)}
        </div>` : ''}

        <button type="button" class="a3rv-generate-btn${_loading ? ' loading' : ''}${!canUse ? ' disabled' : ''}"
          id="a3rv-generate-btn" ${(_loading || !canUse) ? 'disabled' : ''}>
          ${_loading
            ? `<span class="a3rv-spinner"></span>Đang tạo nhận xét…`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="15" height="15">
                <path d="M9.94 2a.5.5 0 0 1 .49.4l.7 3.5 3.5.7a.5.5 0 0 1 0 .98l-3.5.7-.7 3.5a.5.5 0 0 1-.98 0l-.7-3.5-3.5-.7a.5.5 0 0 1 0-.98l3.5-.7.7-3.5A.5.5 0 0 1 9.94 2z"/>
                <path d="M19 12a.3.3 0 0 1 .29.24l.41 2.07 2.06.41a.3.3 0 0 1 0 .58l-2.06.41-.41 2.06a.3.3 0 0 1-.58 0l-.41-2.06-2.06-.41a.3.3 0 0 1 0-.58l2.06-.41.41-2.07A.3.3 0 0 1 19 12z"/>
              </svg>Tạo nhận xét bằng AI`
          }
        </button>

        <div class="a3rv-disclaimer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          Kiểm tra lại trước khi dùng. AI có thể mắc lỗi tên hoặc dữ liệu.
        </div>

      </div>

      <!-- RIGHT: Kết quả -->
      <div class="a3rv-right">
        <div class="a3rv-result-head">
          <span class="a3rv-section-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            Nhận xét
          </span>
          <div class="a3rv-result-actions" id="a3rv-result-actions" style="display:${_result ? 'flex' : 'none'}">
            <button type="button" class="a3rv-action-btn" id="a3rv-copy-btn" title="Sao chép">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              ${_copied ? 'Đã sao chép!' : 'Sao chép'}
            </button>
            <button type="button" class="a3rv-action-btn a3rv-regen-btn" id="a3rv-regen-btn" title="Tạo lại">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4"/>
              </svg>
              Tạo lại
            </button>
          </div>
        </div>

        <div class="a3rv-result-wrap" id="a3rv-result-wrap">
          ${_buildResultContent()}
        </div>
      </div>

    </div>

  </div>
</div>`;
  }

  function _buildResultContent() {
    if (_loading) {
      return `<div class="a3rv-loading">
        <div class="a3rv-spinner-big"></div>
        <span>Gemini đang viết nhận xét…</span>
        <small>Thường mất 5–15 giây</small>
      </div>`;
    }
    if (!_result) {
      return `<div class="a3rv-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" width="48" height="48" opacity=".2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        <span>Bấm <strong>Tạo nhận xét bằng AI</strong> để bắt đầu</span>
        <small>Gemini sẽ đọc dữ liệu điểm tuần ${_currentWeek()} và tự viết nhận xét cho lớp ${CLASS_NAME}</small>
      </div>`;
    }
    // Render kết quả với định dạng emoji
    const formatted = _esc(_result)
      .replace(/🏆/g, '<span class="a3rv-emoji">🏆</span>')
      .replace(/✅/g,  '<span class="a3rv-emoji-pos">✅</span>')
      .replace(/❌/g,  '<span class="a3rv-emoji-neg">❌</span>')
      .replace(/\n/g,  '<br>');

    return `<div class="a3rv-result-text" id="a3rv-result-text">${formatted}</div>`;
  }

  /* ──────────────────────────────────────────────────────
     EVENTS
  ────────────────────────────────────────────────────── */
  function _bindEvents() {
    const root = _root();
    if (!root) return;

    root.querySelector('#a3rv-close-btn')?.addEventListener('click', _close);
    root.querySelector('#a3rv-backdrop')?.addEventListener('click', e => {
      if (e.target.id === 'a3rv-backdrop') _close();
    });

    root.querySelector('#a3rv-generate-btn')?.addEventListener('click', _generate);
    root.querySelector('#a3rv-regen-btn')?.addEventListener('click', _generate);
    root.querySelector('#a3rv-copy-btn')?.addEventListener('click', _copy);
  }

  /**
   * Chốt chặn cuối: dù đã yêu cầu trong prompt, đôi khi AI vẫn lỡ viết
   * "Thầy/Cô" hoặc "Thầy". Hàm này ép mọi biến thể về "Cô" trước khi
   * hiển thị, đảm bảo LUÔN đúng xưng hô "Cô" trong mọi tình huống.
   */
  function _forceCoWording(text) {
    if (!text) return text;
    return String(text)
      .replace(/Thầy\s*\/\s*Cô/gi, 'Cô')
      .replace(/Thầy\s*,\s*Cô/gi, 'Cô')
      .replace(/Thầy\s+và\s+Cô/gi, 'Cô')
      .replace(/\bThầy\b/gi, 'Cô');
  }

  async function _generate() {
    if (_loading || !_canUse()) return;

    _loading = true;
    _result  = '';
    _error   = '';
    _copied  = false;
    _refreshBody();

    try {
      const summary    = _buildSummary();
      const comparison = _buildComparison(summary);
      const toneEl   = _root()?.querySelector('#a3rv-tone');
      const extraEl  = _root()?.querySelector('#a3rv-extra');
      const tone     = toneEl?.value || 'chan_thanh';
      const extra    = extraEl?.value?.trim() || '';

      const toneDesc = {
        chan_thanh:  'chân thành, gần gũi như người cô quan tâm học sinh',
        nghiem_tuc:  'nghiêm túc, chuẩn mực như một văn bản nhà trường',
        dong_vien:   'tích cực, khích lệ, tập trung vào tiến bộ và nỗ lực',
      }[tone] || 'chân thành, gần gũi';

      let prompt = _buildPrompt(summary, comparison);
      prompt += `\n\nTÔNG GIỌNG YÊU CẦU: ${toneDesc}`;
      if (extra) prompt += `\n\nBỐI CẢNH THÊM: ${extra}`;

      _result = _forceCoWording(await _callGemini(prompt));
    } catch (err) {
      _error = err.message || 'Lỗi không xác định.';
    } finally {
      _loading = false;
      _refreshBody();
    }
  }

  async function _copy() {
    if (!_result) return;
    try {
      await navigator.clipboard.writeText(_result);
      _copied = true;
      // Cập nhật nút
      const btn = _root()?.querySelector('#a3rv-copy-btn');
      if (btn) btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><polyline points="20 6 9 17 4 12"/></svg> Đã sao chép!`;
      setTimeout(() => {
        _copied = false;
        const b = _root()?.querySelector('#a3rv-copy-btn');
        if (b) b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Sao chép`;
      }, 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = _result;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      _copied = true;
    }
  }

  function _refreshBody() {
    const root = _root();
    if (!root) return;

    // Cập nhật nút generate
    const genBtn = root.querySelector('#a3rv-generate-btn');
    if (genBtn) {
      genBtn.disabled = _loading || !_canUse();
      genBtn.className = `a3rv-generate-btn${_loading ? ' loading' : ''}${!_canUse() ? ' disabled' : ''}`;
      genBtn.innerHTML = _loading
        ? `<span class="a3rv-spinner"></span>Đang tạo nhận xét…`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="15" height="15">
            <path d="M9.94 2a.5.5 0 0 1 .49.4l.7 3.5 3.5.7a.5.5 0 0 1 0 .98l-3.5.7-.7 3.5a.5.5 0 0 1-.98 0l-.7-3.5-3.5-.7a.5.5 0 0 1 0-.98l3.5-.7.7-3.5A.5.5 0 0 1 9.94 2z"/>
            <path d="M19 12a.3.3 0 0 1 .29.24l.41 2.07 2.06.41a.3.3 0 0 1 0 .58l-2.06.41-.41 2.07a.3.3 0 0 1-.58 0l-.41-2.07-2.06-.41a.3.3 0 0 1 0-.58l2.06-.41.41-2.07A.3.3 0 0 1 19 12z"/>
          </svg>Tạo nhận xét bằng AI`;
    }

    // Error
    let errEl = root.querySelector('.a3rv-error');
    if (_error) {
      if (!errEl) {
        errEl = document.createElement('div');
        errEl.className = 'a3rv-error';
        genBtn?.parentNode?.insertBefore(errEl, genBtn);
      }
      errEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${_esc(_error)}`;
    } else {
      errEl?.remove();
    }

    // Result wrap
    const wrap = root.querySelector('#a3rv-result-wrap');
    if (wrap) wrap.innerHTML = _buildResultContent();

    // Action buttons visibility
    const actBar = root.querySelector('#a3rv-result-actions');
    if (actBar) actBar.style.display = _result ? 'flex' : 'none';

    // Re-bind
    root.querySelector('#a3rv-regen-btn')?.addEventListener('click', _generate);
    root.querySelector('#a3rv-copy-btn')?.addEventListener('click', _copy);
  }

  /* ──────────────────────────────────────────────────────
     TOOLBAR BUTTON (delegation — scoreboard.js dùng innerHTML)
  ────────────────────────────────────────────────────── */
  function _bindToolbarButton() {
    document.addEventListener('click', e => {
      if (e.target.closest?.('.toolbar-button.review')) {
        e.preventDefault();
        e.stopPropagation();
        _openModal();
      }
    });
  }

  /* ──────────────────────────────────────────────────────
     INJECT TOOLBAR BUTTON vào scoreboard.js
     Bổ sung nút "Nhận xét" ngay sau nút "Chụp ảnh" (camera)
     bằng cách patch hàm render gốc.
  ────────────────────────────────────────────────────── */
  function _patchToolbar() {
    // Observe DOM: chờ .toolbar-actions xuất hiện rồi thêm nút
    const tryInject = () => {
      const bars = document.querySelectorAll('.toolbar-actions');
      bars.forEach(bar => {
        if (bar.querySelector('.toolbar-button.review')) return; // đã có
        const cameraBtn = bar.querySelector('.toolbar-button.camera');
        if (!cameraBtn) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'toolbar-button review';
        btn.title = 'Nhận xét';
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg><span class="tb-label">Nhận xét</span>`;
        cameraBtn.insertAdjacentElement('afterend', btn);
      });
    };

    // Chạy ngay + observe mutation (vì scoreboard.js re-render toàn bộ)
    tryInject();
    const obs = new MutationObserver(tryInject);
    obs.observe(document.body, { childList: true, subtree: true });
  }

  /* ──────────────────────────────────────────────────────
     CSS
  ────────────────────────────────────────────────────── */
  function _injectCSS() {
    if (document.getElementById('a3-review-css')) return;
    const st = document.createElement('style');
    st.id = 'a3-review-css';
    st.textContent = `
/* ── Review Modal Root ── */
#a3-review-modal-root {
  position: fixed; inset: 0; z-index: 9100; pointer-events: none;
}
#a3-review-modal-root:not(:empty) { pointer-events: auto; }

/* ── Backdrop ── */
.a3rv-backdrop {
  position: fixed; inset: 0; z-index: 9100;
  background: var(--bg-modal, #0b1422);
  display: flex; flex-direction: column;
  animation: a3rvFadeIn .18s ease both;
}
@keyframes a3rvFadeIn { from { opacity:0 } to { opacity:1 } }
@keyframes a3rvSlideUp { from { opacity:0; transform:translateY(12px) scale(.98) } to { opacity:1; transform:none } }
@keyframes a3rvSpin { to { transform: rotate(360deg) } }

/* ── Modal ── */
.a3rv-modal {
  width: 100%;
  height: 100%;
  max-height: 100%;
  border: none;
  border-top: 1px solid var(--border-subtle, rgba(148,163,184,.1));
  border-radius: 0;
  background: var(--bg-modal, #0b1422);
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
  box-shadow: none;
  animation: a3rvSlideUp .22s cubic-bezier(.2,.9,.2,1) both;
}

/* ── Header ── */
.a3rv-header {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 16px 22px;
  border-bottom: 1px solid var(--border-subtle, rgba(148,163,184,.1));
  background: var(--bg-modal-header, #060d1a);
  flex-shrink: 0;
}
.a3rv-header-left { display: flex; align-items: center; gap: 12px; }
.a3rv-header-icon {
  width: 40px; height: 40px; border-radius: 14px; flex-shrink: 0;
  background: rgba(168,85,247,.14);
  border: 1px solid rgba(168,85,247,.28);
  color: #c4b5fd;
  display: grid; place-items: center;
}
.a3rv-header-title {
  font-size: 17px; font-weight: 900; letter-spacing: -.02em;
  display: flex; align-items: center; gap: 8px;
  color: var(--text, #f1f5f9);
}
.a3rv-ai-badge {
  font-size: 9.5px; font-weight: 900; letter-spacing: .1em;
  padding: 2px 7px; border-radius: 999px;
  background: rgba(168,85,247,.2); border: 1px solid rgba(168,85,247,.4);
  color: #c4b5fd;
}
.a3rv-header-sub { font-size: 12px; color: var(--text-muted, #64748b); margin-top: 2px; }
.a3rv-close-btn {
  width: 36px; height: 36px; border-radius: 50%;
  border: 1px solid rgba(148,163,184,.18);
  background: transparent; color: var(--text-muted, #64748b);
  display: grid; place-items: center; cursor: pointer;
  transition: background .14s ease, color .14s ease;
  flex-shrink: 0;
}
.a3rv-close-btn:hover { background: rgba(239,68,68,.14); color: #f87171; border-color: rgba(239,68,68,.28); }

/* ── Body (2 cột) ── */
.a3rv-body {
  display: grid; grid-template-columns: 290px 1fr;
  overflow: hidden; min-height: 0;
}

/* ── Left ── */
.a3rv-left {
  overflow-y: auto;
  padding: 18px 16px;
  border-right: 1px solid var(--border-subtle, rgba(148,163,184,.1));
  display: flex; flex-direction: column; gap: 14px;
  background: var(--bg-modal-header, #060d1a);
}

.a3rv-section { display: flex; flex-direction: column; gap: 7px; }
.a3rv-section-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 10px; font-weight: 800; letter-spacing: .1em;
  text-transform: uppercase; color: var(--text-dim, #4e6680);
}
.a3rv-week-badge {
  display: inline-flex; align-items: center;
  padding: 5px 12px; border-radius: 999px;
  font-size: 13px; font-weight: 800;
  background: rgba(168,85,247,.12);
  border: 1px solid rgba(168,85,247,.3);
  color: #c4b5fd; width: fit-content;
}
.a3rv-hint-text { font-size: 11.5px; color: var(--text-muted, #64748b); line-height: 1.5; }

.a3rv-select {
  width: 100%; padding: 8px 10px;
  border: 1px solid var(--border-modal, rgba(148,163,184,.2));
  border-radius: 10px;
  background: var(--bg-input, #06101c);
  color: var(--text, #f1f5f9);
  font-size: 13px; font-weight: 600;
  cursor: pointer; outline: none;
  transition: border-color .14s ease;
}
.a3rv-select:focus { border-color: rgba(168,85,247,.5); }

.a3rv-textarea-small {
  width: 100%; padding: 9px 11px;
  border: 1px solid var(--border-modal, rgba(148,163,184,.2));
  border-radius: 10px; resize: vertical;
  background: var(--bg-input, #06101c);
  color: var(--text, #f1f5f9);
  font-size: 12.5px; line-height: 1.5;
  outline: none; font-family: inherit;
  transition: border-color .14s ease;
}
.a3rv-textarea-small:focus { border-color: rgba(168,85,247,.5); }
.a3rv-textarea-small::placeholder { color: var(--text-dim, #4e6680); }

.a3rv-no-perm {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 11px 13px; border-radius: 12px;
  background: rgba(239,68,68,.09); border: 1px solid rgba(239,68,68,.25);
  color: #f87171; font-size: 12.5px; line-height: 1.5;
}
.a3rv-error {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 10px 12px; border-radius: 10px;
  background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.3);
  color: #f87171; font-size: 12.5px; line-height: 1.5;
}

.a3rv-generate-btn {
  width: 100%; height: 44px; padding: 0 16px; border-radius: 12px;
  border: 0;
  background: linear-gradient(135deg, #7c3aed, #6d28d9);
  color: #fff; font-size: 14px; font-weight: 900;
  cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
  box-shadow: 0 4px 20px rgba(124,58,237,.35);
  transition: transform .14s ease, box-shadow .14s ease, background .14s ease;
  letter-spacing: .01em;
}
.a3rv-generate-btn:hover:not(:disabled):not(.disabled):not(.loading) {
  transform: translateY(-2px);
  box-shadow: 0 12px 32px rgba(124,58,237,.42);
}
.a3rv-generate-btn.disabled,
.a3rv-generate-btn:disabled:not(.loading) {
  background: rgba(148,163,184,.1); box-shadow: none;
  color: var(--text-dim, #4e6680); cursor: not-allowed;
}
.a3rv-generate-btn.loading { background: rgba(124,58,237,.5); cursor: not-allowed; box-shadow: none; }

.a3rv-disclaimer {
  display: flex; align-items: flex-start; gap: 5px;
  font-size: 11px; color: var(--text-dim, #4e6680); line-height: 1.45;
}

.a3rv-spinner {
  width: 14px; height: 14px; flex-shrink: 0;
  border: 2px solid rgba(255,255,255,.25);
  border-top-color: #fff;
  border-radius: 999px;
  animation: a3rvSpin .65s linear infinite;
  display: inline-block;
}

/* ── Right ── */
.a3rv-right {
  overflow: hidden;
  display: flex; flex-direction: column;
  min-height: 0;
}
.a3rv-result-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-subtle, rgba(148,163,184,.1));
  flex-shrink: 0;
}
.a3rv-result-actions { display: flex; align-items: center; gap: 7px; }
.a3rv-action-btn {
  height: 32px; padding: 0 12px; border-radius: 10px;
  border: 1px solid var(--border-modal, rgba(148,163,184,.2));
  background: var(--bg-mid, #0a1525);
  color: var(--text-muted, #64748b);
  font-size: 12px; font-weight: 700; cursor: pointer;
  display: flex; align-items: center; gap: 5px;
  transition: background .12s ease, border-color .12s ease, color .12s ease;
}
.a3rv-action-btn:hover { background: var(--bg-tab-active, #101d30); color: var(--text, #f1f5f9); border-color: var(--accent, #2563eb); }
.a3rv-regen-btn { color: #c4b5fd !important; border-color: rgba(168,85,247,.3) !important; background: rgba(124,58,237,.1) !important; }
.a3rv-regen-btn:hover { background: rgba(124,58,237,.2) !important; }

.a3rv-result-wrap { flex: 1; overflow-y: auto; padding: 20px 22px; }

/* Empty state */
.a3rv-empty {
  height: 100%; min-height: 260px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; text-align: center; color: var(--text-muted, #64748b);
}
.a3rv-empty span { font-size: 14px; font-weight: 600; }
.a3rv-empty strong { color: #c4b5fd; }
.a3rv-empty small { font-size: 12px; color: var(--text-dim, #4e6680); max-width: 280px; line-height: 1.5; }

/* Loading state */
.a3rv-loading {
  height: 100%; min-height: 260px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  color: var(--text-muted, #64748b); text-align: center;
}
.a3rv-spinner-big {
  width: 36px; height: 36px;
  border: 3px solid rgba(168,85,247,.2);
  border-top-color: #a855f7;
  border-radius: 999px;
  animation: a3rvSpin .7s linear infinite;
}
.a3rv-loading span { font-size: 14.5px; font-weight: 700; color: var(--text, #f1f5f9); }
.a3rv-loading small { font-size: 12px; color: var(--text-dim, #4e6680); }

/* Result text */
.a3rv-result-text {
  font-size: 14.5px; line-height: 1.75;
  color: var(--text, #f1f5f9);
  white-space: pre-wrap; word-break: break-word;
  background: var(--bg-mid, #0a1525);
  border: 1px solid var(--border-subtle, rgba(148,163,184,.1));
  border-radius: 14px; padding: 18px 20px;
}
.a3rv-emoji     { font-size: 16px; }
.a3rv-emoji-pos { color: #34d399; font-size: 15px; }
.a3rv-emoji-neg { color: #f87171; font-size: 15px; }

/* ── Toolbar button ── */
.toolbar-button.review {
  color: #c4b5fd !important;
  border-color: rgba(167,139,250,.35) !important;
  background: rgba(109,40,217,.18) !important;
}
.toolbar-button.review:hover {
  background: rgba(109,40,217,.3) !important;
  border-color: rgba(167,139,250,.55) !important;
  color: #ddd6fe !important;
}

/* Light theme adjustments */
[data-theme="light"] .a3rv-modal { background: var(--bg-modal, #fff); }
[data-theme="light"] .a3rv-header { background: var(--bg-modal-header, #f1f5f9); }
[data-theme="light"] .a3rv-left { background: var(--bg-modal-header, #f8fafc); }
[data-theme="light"] .a3rv-select,
[data-theme="light"] .a3rv-textarea-small { background: var(--bg-input, #fff); color: var(--text, #0f172a); }
[data-theme="light"] .a3rv-result-text { background: var(--bg-mid, #f8fafc); }

/* Responsive */
@media (max-width: 640px) {
  .a3rv-body { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .a3rv-left { border-right: 0; border-bottom: 1px solid var(--border-subtle, rgba(148,163,184,.1)); max-height: 220px; }
}
`;
    document.head.appendChild(st);
  }

  /* ──────────────────────────────────────────────────────
     INIT
  ────────────────────────────────────────────────────── */
  _injectCSS();

  // Mount point
  if (!document.getElementById(ROOT_ID)) {
    const div = document.createElement('div');
    div.id = ROOT_ID;
    document.body.appendChild(div);
  }

  _bindToolbarButton();
  _patchToolbar();

  // Expose
  window.openReviewModal = _openModal;
  window.__a3Review = { open: _openModal, close: _close };

})();
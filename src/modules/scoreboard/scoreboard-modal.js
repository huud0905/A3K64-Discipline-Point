/* ============================================================
   A3K64 — Score Edit Modal v2
   ------------------------------------------------------------
   THAY THẾ toàn bộ modal sửa điểm trong scoreboard.js.

   Điểm khác biệt so với v1:
   ─ Modal mount vào #a3-score-modal-root (ngoài #scoreboard-root)
     → không bao giờ bị rebuild khi app render() lại bảng điểm.
   ─ Mọi cập nhật UI trong modal dùng patch nhỏ (innerHTML patch
     từng vùng) thay vì rebuild toàn bộ innerHTML mỗi lần.
   ─ Input/textarea NOT managed by setState/render — giá trị được
     đọc thẳng từ DOM khi cần, tránh vòng lặp re-render khi gõ.
   ─ UI mới: layout dọc đơn giản, rule grid rộng hơn, review panel
     luôn hiển thị bên phải (không cần tab chuyển đổi trên desktop).
   ─ Phím tắt: Enter xác nhận thêm điểm từ rule search.

   HOW TO INTEGRATE:
     1. Thêm <div id="a3-score-modal-root"></div> vào body (sau
        #scoreboard-root).
     2. Xoá buildScoreEditModal() khỏi scoreboard.js và bỏ dòng
        render modal trong hàm render().
     3. <script src="scoreboard-modal-v2.js"></script> sau scoreboard.js.
     4. openStudent() / closeModal() được override ở cuối file này.
*/

(function A3ModalV2() {
  'use strict';

  /* ----------------------------------------------------------
     CONFIG
  ---------------------------------------------------------- */
  const MODAL_ROOT_ID = 'a3-score-modal-root';

  /* ----------------------------------------------------------
     INTERNAL STATE (chỉ cho modal, không liên quan state app)
  ---------------------------------------------------------- */
  let _open = false;
  let _student = null;       // summary object
  let _draftEvents = [];     // mảng event (existing + draft-)
  let _deletedIds = [];      // [{id, studentId, week, title, points}]
  let _activeDay = -1;       // key của ngày đang xem (2-7, 0=CN, -1=Tất cả)
  let _subject = null;       // môn học đang chọn (null = subjects[0])
  let _category = null;      // CATEGORY.* đang chọn
  let _spCategory = null;    // loại của mục "Lỗi / Thưởng đặc biệt" (mặc định Nề nếp)
  let _spSubject = null;     // môn của mục đặc biệt (chỉ dùng khi loại = Học tập)
  let _bulkScope = 'single'; // 'single'|'group'|'selected'
  let _bulkSelected = [];    // id[] học sinh được chọn bulk
  let _bulkNote = '';
  let _violationCount = 1;
  let _ruleSearch = '';
  let _selectedRule = null;
  let _ruleDropdownOpen = false;  let _rules = [];
  let _pinnedKeys = [];
  let _rulesLoaded = false;
  let _isSaving = false;
  let _activeDrawerTool = 'ai'; // 'ai'|'rule'|'special'|'bulk'
  let _cancelColumnResize = null;
  let _cancelGvnnDialog = null;
  /* ----------------------------------------------------------     HELPERS — dùng lại từ scoreboard.js (đã global)
  ---------------------------------------------------------- */
  function _sub() { return _subject || subjects[0]; }
  function _cat() { return _category || CATEGORY.STUDY; }
  function _spCat() { return _spCategory || CATEGORY.DISCIPLINE; }
  function _spSub() { return _spSubject || subjects[0]; }
  function _ruleKey(r) { return `${r.title}::${r.points}::${r.category}`; }
  function _esc(s) { return window.a3k64EscapeHtml(s); }   // dùng chung — xem shared/esc.js
  function _isDraft(id) { return String(id).startsWith('draft-'); }
  function _getRoot() {
    let root = document.getElementById(MODAL_ROOT_ID);
    if (!root && document.body) {
      root = document.createElement('div');
      root.id = MODAL_ROOT_ID;
      document.body.appendChild(root);
    }
    return root;
  }

  function _getTierClass(val) {
    if (typeof val === 'number' && Number.isFinite(val)) {
      if (val >= 50) return 'is-tier-tot';
      if (val >= 0) return 'is-tier-kha';
      if (val >= -50) return 'is-tier-dat';
      return 'is-tier-chuadat';
    }
    const status = String(val ?? '').trim().toLocaleLowerCase('vi');
    if (status.includes('chưa') || status.includes('cđ') || status.includes('kém')) return 'is-tier-chuadat';
    if (status.includes('tốt')) return 'is-tier-tot';
    if (status.includes('khá')) return 'is-tier-kha';
    if (status.includes('đạt')) return 'is-tier-dat';
    return '';
  }

  function _formatAiDayLabel(day) {    if (day === 0 || day === '0' || day === 'CN') return 'CN';
    const m = String(day || '').match(/[2-7]/);
    return m ? `T${m[0]}` : (day ? String(day) : '');
  }

  function _dayToNumericKey(day) {
    if (day === 0 || day === '0' || day === 'CN') return 0;
    const m = String(day || '').match(/[2-7]/);
    if (m) return Number(m[0]);
    if (_activeDay !== -1) return _activeDay;
    const d = new Date().getDay();
    return d === 0 ? 0 : d + 1;
  }

  function _toCategoryConstant(c) {
    if (!c) return _cat();
    const s = String(c).trim().toUpperCase();
    if (s.includes('HOC') || s === 'STUDY' || s === 'HOC_TAP') return CATEGORY.STUDY;
    if (s.includes('PHONG') || s === 'MOVEMENT' || s === 'PHONG_TRAO') return CATEGORY.MOVEMENT;
    if (s.includes('NE') || s === 'DISCIPLINE' || s === 'NE_NEP') return CATEGORY.DISCIPLINE;
    return CATEGORY.DISCIPLINE;
  }
  function _formatAiDayLabel(day) {
    if (day === 0 || day === '0' || day === 'CN') return 'CN';
    const m = String(day || '').match(/[2-7]/);
    return m ? `T${m[0]}` : (day ? String(day) : '');
  }

  function _dayToNumericKey(day) {
    if (day === 0 || day === '0' || day === 'CN') return 0;
    const m = String(day || '').match(/[2-7]/);
    if (m) return Number(m[0]);
    if (_activeDay !== -1) return _activeDay;
    const d = new Date().getDay();
    return d === 0 ? 0 : d + 1;
  }

  function _toCategoryConstant(c) {
    if (!c) return _cat();
    const s = String(c).trim().toUpperCase();
    if (s.includes('HOC') || s === 'STUDY' || s === 'HOC_TAP') return CATEGORY.STUDY;
    if (s.includes('PHONG') || s === 'MOVEMENT' || s === 'PHONG_TRAO') return CATEGORY.MOVEMENT;
    if (s.includes('NE') || s === 'DISCIPLINE' || s === 'NE_NEP') return CATEGORY.DISCIPLINE;
    return CATEGORY.DISCIPLINE;
  }


  function _weekEventsForStudent() {
    if (!_student) return [];
    // Loại trừ cả __SHEET_TOTAL__ lẫn các dòng "Nghỉ tập trung/Nghỉ ôn thi"
    // (__TT_ABSENCE__ / __ONTHI_ABSENCE__) — các dòng này do luật riêng tự
    // sinh (title/points tính theo số lần nghỉ luỹ kế), KHÔNG được để lẫn
    // vào danh sách điểm có thể xoá ở modal này. Xoá nhầm ở đây làm sai
    // chuỗi luỹ kế và không thể khôi phục đúng số lần đã nghỉ.
    // Muốn xoá 1 lần nghỉ ghi nhầm → dùng nút xoá riêng ở tab "Nghỉ tập
    // trung"/"Nghỉ ôn thi" (removeTTAbsence/removeOnThiAbsence).
    const curW = Number(state.week);
    return _draftEvents.filter(e =>
      e.studentId === _student.id &&
      Number(e.week) === curW &&
      !isSheetTotalEvent(e) &&
      !isTTAbsenceEvent(e) &&
      !isOnThiAbsenceEvent(e)
    );
  }
  function _getStudentWeekEvents() {
    return _weekEventsForStudent();
  }
  function _dayEvents(day) {
    return _weekEventsForStudent().filter(e => eventDay(e) === day);
  }
  function _totals() {
    const evs = _weekEventsForStudent();
    const plus = evs.filter(e => (Number(e.points) || 0) > 0).reduce((s, e) => s + (Number(e.points) || 0), 0);
    const minus = evs.filter(e => (Number(e.points) || 0) < 0).reduce((s, e) => s + (Number(e.points) || 0), 0);
    // include sheetTotal for grand total
    const curW = Number(state.week);
    const grand = _draftEvents
      .filter(e => e.studentId === _student?.id && Number(e.week) === curW)
      .reduce((s, e) => s + (Number(e.points) || 0), 0);
    return { plus, minus, grand };
  }

  function _orderedRules() {
    const pinned = new Set(_pinnedKeys);
    return [..._rules].sort((a, b) =>
      Number(pinned.has(_ruleKey(b))) - Number(pinned.has(_ruleKey(a))) ||
      Number(b.points) - Number(a.points)
    );
  }
  function _filteredRules() {
    const ordered = _orderedRules();
    const query = normalizeVi(_ruleSearch.trim());
    if (!query) return ordered.filter(r => r.category === _cat()).slice(0, 16);

    const terms = query.split(/\s+/).filter(Boolean);
    const rank = r => {
      const title = normalizeVi(r.title);
      return title === query ? 0 : title.startsWith(query) ? 1 : 2;
    };
    return ordered.filter(r => {
      const hay = normalizeVi(`${r.title} ${categoryLabel(r.category)} ${r.note || ''} ${Math.abs(r.points)}`);
      return terms.every(t => hay.includes(t));
    }).sort((a, b) =>
      rank(a) - rank(b) ||
      Number(b.category === _cat()) - Number(a.category === _cat())
    ).slice(0, 16);
  }
  /* ----------------------------------------------------------
     OPEN / CLOSE
  ---------------------------------------------------------- */
  function openModal(studentId) {
    if (_isSaving || _aiApplying) {
      console.warn('[ScoreboardModal] Cannot open modal while saving or applying AI changes.');
      return;
    }

    let derived;
    try {
      if (typeof getDerived !== 'function') {
        console.error('[ScoreboardModal] getDerived is not available.');
        return;
      }
      derived = getDerived();
    } catch (err) {
      console.error('[ScoreboardModal] Error getting scoreboard data:', err);
      return;
    }

    if (!Array.isArray(derived?.rawSummaries) || typeof derived.canEditStudent !== 'function') {
      console.error('[ScoreboardModal] Invalid scoreboard data or permission check:', derived);
      return;
    }

    const s = derived.rawSummaries.find(x => x.id === studentId);
    if (!s) {
      console.warn('[ScoreboardModal] Student not found:', studentId);
      return;
    }
    try {
      if (!derived.canEditStudent(s)) {
        console.warn('[ScoreboardModal] Permission denied for student:', studentId);
        return;
      }
    } catch (err) {
      console.error('[ScoreboardModal] Error checking student permission:', err);
      return;
    }

    _unbindEvents();
    _clearUndo();    _closeAiPreview();
    _aiRequest++;

    _clearUndo();
    _closeAiPreview();
    _aiRequest++;
    _student = s;
    const curW = Number(state.week);
    _draftEvents = state.events.filter(e => e.studentId === studentId && Number(e.week) === curW);
    _deletedIds = [];
    _activeDay = -1;
    _subject = subjects[0];
    _category = CATEGORY.STUDY;
    _spCategory = CATEGORY.DISCIPLINE;
    _spSubject = subjects[0];
    _bulkScope = 'single';
    _bulkSelected = [studentId];
    _bulkNote = '';
    _violationCount = 1;
    _ruleSearch = '';
    _selectedRule = null;
    _ruleDropdownOpen = false;    _isSaving = false;
    _activeDrawerTool = 'ai';
    // Sync pinned keys from localStorage
    _pinnedKeys = SafeStorage.readJSON(localStorage, PINNED_RULES_KEY, []);

    _open = true;
    // Tell the main app so polling is paused
    state.editingStudentId = studentId;

    try {
      if (!_mount()) {
        _open = false;
        state.editingStudentId = null;
        return;
      }
    } catch (err) {
      console.error('[ScoreboardModal] Error mounting modal:', err);
      _unbindEvents();
      const root = document.getElementById(MODAL_ROOT_ID);
      if (root) root.innerHTML = '';
      _open = false;
      state.editingStudentId = null;
      return;
    }

    // Load rules lazily
    if (!_rulesLoaded && !_rules.length) {
      fetchRulesFromGas().then(r => {
        _rules = r || [];
        _rulesLoaded = true;
        if (_open) _patchDropdown();        if (_open) {
          _patchDropdown();        }
      }).catch(() => {});    }
  }
  function closeModal() {
    if (!_open || _aiApplying) return;
    _clearUndo();
    _closeAiPreview();
    _aiRequest++;
    _unbindEvents();
    _open = false;    state.editingStudentId = null;
    const root = _getRoot();
    if (root) root.innerHTML = '';
  }

  /* ----------------------------------------------------------
     MOUNT — xây HTML một lần duy nhất khi mở modal
  ---------------------------------------------------------- */
  function _mount() {
    const root = _getRoot();
    if (!root) {
      console.warn('[ScoreboardModal] Cannot mount modal: root element is unavailable.');
      return false;
    }
    root.innerHTML = _buildModalHTML();
    _bindEvents();
    _patchDayTabs();
    _patchReviewPanel();
    _patchRightTitle();
    _patchFooter();
    _patchMatrix();
    _patchDropdown();
    _patchBulkStudents();
    const hint = root.querySelector('.v2-footer-hint');
    if (hint) hint.textContent = 'Esc hoặc ✕ để đóng';
    return true;
  }

  /* ----------------------------------------------------------
     BUILD HTML (skeleton — static parts)
  ---------------------------------------------------------- */
  function _buildModalHTML() {
    const s = _student;

    return `
<div class="v2-backdrop" id="v2-backdrop">
  <div class="v2-modal" role="dialog" aria-modal="true" aria-label="Chấm điểm: ${_esc(s.name)}">

    <!-- HEADER -->
    <header class="v2-header">
      <div class="v2-header-info">
        <div class="v2-avatar">${_esc(s.avatarInitial || lastNameInitial(s.name))}</div>
        <div>
          <div class="v2-header-name">${_esc(s.name)}</div>
          <div class="v2-header-meta">Tổ ${s.group}${s.role ? ' · ' + _esc(s.role) : ''} · Tuần ${state.week}</div>
        </div>
      </div>
      <div class="v2-header-right">
        <button type="button" class="v2-close-btn" id="v2-close-btn" title="Đóng (Esc)">          <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </header>

    <!-- MENUBAR -->
    <div class="v2-menubar" id="v2-menubar">
      <div class="v2-menubar-left">
        <div class="v2-day-strip" id="v2-day-strip"><!-- patched: Tất cả | T2 | T3 | T4 | T5 | T6 | T7 | CN --></div>
      </div>
      <div class="v2-footer-scores" id="v2-footer-scores"><!-- patched: +Cộng, -Trừ, Tổng, Xếp loại --></div>
    </div>

    <!-- BODY -->    <div class="v2-body" id="v2-body">
      <div class="v2-left" id="v2-col-left">        <div class="v2-tool-drawer" id="v2-tool-drawer">
          <div class="v2-tool-drawer-inner">          <!-- Panel 1: Trợ lý AI -->
          <div class="v2-tool-panel" id="v2-panel-ai">
            <div class="v2-ai-box" id="v2-ai-box">
              <div class="v2-ai-title">✨ Trợ lý AI sửa/chấm nhanh</div>
              <textarea id="v2-ai-input" class="v2-ai-textarea" rows="4"
                aria-label="Yêu cầu chấm điểm bằng AI"
                placeholder="Nhập yêu cầu thêm, sửa, xoá điểm (Ctrl+Enter để phân tích)…"></textarea>              <div class="v2-ai-examples" aria-label="Ví dụ điền nhanh">
                ${['+ Phát biểu Toán T4', 'GVNN T2 tiết 4 Anh', 'Xoá lỗi không đeo thẻ T2'].map(text => `
                  <button type="button" class="v2-example-chip" data-ai-example="${_esc(text)}">${_esc(text)}</button>
                `).join('')}
              </div>              <div class="v2-ai-actions">
                <button type="button" class="v2-ai-btn primary" id="v2-ai-submit-btn">Phân tích &amp; Đề xuất</button>              </div>
              <div id="v2-ai-error" class="v2-ai-error" style="display:none"></div>
              <div id="v2-ai-preview" class="v2-ai-preview" style="display:none"></div>            </div>          </div>

          <!-- Panel 2: Thêm từ nội quy -->
          <div class="v2-tool-panel v2-rule-section" id="v2-panel-rule">            <div class="v2-rule-search-wrap">
              <div class="v2-section-label">Chấm từ nội quy</div>
              <div class="v2-search-row">                <div class="v2-search-box">
                  <svg class="v2-search-icon" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" width="15" height="15"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input type="text" class="v2-rule-search-input" id="v2-rule-search"
                    placeholder="Tìm nội quy…"                    value="${_esc(_ruleSearch)}" autocomplete="off" spellcheck="false"/>
                  ${_ruleSearch ? `<button type="button" class="v2-search-clear" id="v2-search-clear" title="Xoá">×</button>` : ''}
                </div>
                <span id="v2-rule-pts-badge" class="v2-rule-pts-badge" style="display:none;" aria-live="polite"></span>
                <button type="button" class="v2-add-btn" id="v2-add-btn"                  title="Vui lòng chọn một nội quy từ danh sách hoặc nhập tên lỗi/thưởng trước" disabled>                  Thêm
                </button>
              </div>
              <div class="v2-rule-dropdown" id="v2-rule-dropdown" style="display:none"></div>
              <div class="v2-subject-row">                <select class="v2-select" id="v2-category">
                  <option value="HOC_TAP"${_cat() === CATEGORY.STUDY ? ' selected' : ''}>Học tập</option>
                  <option value="NE_NEP"${_cat() === CATEGORY.DISCIPLINE ? ' selected' : ''}>Nề nếp</option>
                  <option value="PHONG_TRAO"${_cat() === CATEGORY.MOVEMENT ? ' selected' : ''}>Phong trào</option>
                </select>
                <select class="v2-select" id="v2-subject"${_cat() === CATEGORY.STUDY ? '' : ' style="display:none"'}>${subjects.map(s => `<option value="${_esc(s)}"${s === _sub() ? ' selected' : ''}>${_esc(s)}</option>`).join('')}</select>
                <div class="v2-count-wrap"><span class="v2-count-label">Số lần</span><input type="number" class="v2-count-input" id="v2-count" min="1" step="1" value="${_violationCount}"/></div>
                <label class="v2-scope-label">Phạm vi
                  <select class="v2-select v2-bulk-select" id="v2-bulk-scope">
                    <option value="single"${_bulkScope === 'single' ? ' selected' : ''}>Chỉ học sinh này</option>
                    <option value="group"${_bulkScope === 'group' ? ' selected' : ''}>Cả tổ ${s.group}</option>
                    <option value="selected"${_bulkScope === 'selected' ? ' selected' : ''}>Chọn học sinh</option>
                  </select>
                </label>
              </div>
              <div class="v2-bulk-students" id="v2-bulk-students" style="display:none"></div>
              <div id="v2-note-field" style="display:none">
                <input type="text" class="v2-bulk-note" id="v2-bulk-note" placeholder="Ghi chú (tuỳ chọn)" value="${_esc(_bulkNote)}"/>
              </div>
              <div class="v2-manual-links">
                <button type="button" class="v2-link-btn" id="v2-toggle-note" aria-controls="v2-note-field" aria-expanded="false">+ Thêm ghi chú</button>
                <button type="button" class="v2-link-btn" id="v2-toggle-custom" aria-controls="v2-panel-special" aria-expanded="false">+ Nhập tùy chỉnh (ngoài nội quy)</button>
              </div>

          <!-- Panel 3: Lỗi/Thưởng đặc biệt -->          <div class="v2-tool-panel" id="v2-panel-special" style="display:none">            <div class="v2-subject-row v2-special-rule-row">
              <select class="v2-select" id="v2-special-category" title="Loại chấm điểm">
                <option value="HOC_TAP"${_spCat() === CATEGORY.STUDY ? ' selected' : ''}>Học tập</option>
                <option value="NE_NEP"${_spCat() === CATEGORY.DISCIPLINE ? ' selected' : ''}>Nề nếp</option>
                <option value="PHONG_TRAO"${_spCat() === CATEGORY.MOVEMENT ? ' selected' : ''}>Phong trào</option>
              </select>
              <select class="v2-select" id="v2-special-subject"${_spCat() === CATEGORY.STUDY ? '' : ' style="display:none"'}>${subjects.map(s => `<option value="${_esc(s)}"${s === _spSub() ? ' selected' : ''}>${_esc(s)}</option>`).join('')}</select>
            </div>
            <div class="v2-special-row">
              <input type="text" class="v2-special-title" id="v2-special-title" placeholder="Tên lỗi hoặc thưởng…"/>
              <input type="text" class="v2-special-pts" id="v2-special-pts" inputmode="numeric" placeholder="±điểm"/>
              <button type="button" class="v2-special-add-btn" id="v2-special-add-btn">Thêm</button>
            </div>
          </div>

          </div>
            </div><!-- /v2-rule-search-wrap -->
          </div><!-- /v2-panel-rule -->
        </div>
      </div><!-- /v2-left -->

      <div class="v2-col-resizer" id="v2-resizer-1" title="Kéo để đổi độ rộng cột">
        <span class="v2-col-resizer-grip"></span>
      </div>

      <div class="v2-middle" id="v2-col-right">
        <div class="v2-history-head">
          <span class="v2-history-title" id="v2-history-title"><!-- patched --></span>        </div>
        <div class="v2-review-list" id="v2-review-list"><!-- patched --></div>
        <div id="v2-day-summary-strip" class="v2-day-summary-strip" aria-label="Tổng điểm theo ngày"></div>
        <div id="v2-undo-banner" class="v2-undo-banner" role="status" aria-live="polite" hidden></div>
      </div><!-- /v2-middle -->    </div><!-- /v2-body -->
    <!-- FOOTER -->
    <footer class="v2-footer">
      <div class="v2-footer-left">
        <span class="v2-saved-indicator" id="v2-saved-indicator">
          <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          Đã lưu
        </span>
        <span class="v2-footer-hint">Esc hoặc ✕ để đóng</span>
      </div>
      <button type="button" class="v2-save-btn" id="v2-save-btn"><!-- patched --></button>
    </footer>

  </div>
</div>`;
  }

  /* ----------------------------------------------------------
     DRAWER MANAGEMENT
  ---------------------------------------------------------- */
  function _setDrawerTool(tool) {
    const root = _getRoot();
    const panel = root?.querySelector('#v2-panel-special');
    const button = root?.querySelector('#v2-toggle-custom');
    const expanded = tool === 'special';
    _activeDrawerTool = expanded ? 'special' : null;
    if (panel) panel.style.display = expanded ? 'block' : 'none';
    if (button) button.setAttribute('aria-expanded', String(expanded));
  }  function _bindColumnResizers() {    const root = _getRoot();
    const resizer = root?.querySelector('#v2-resizer-1');
    const left = root?.querySelector('#v2-col-left');
    const right = root?.querySelector('#v2-col-right');
    const body = root?.querySelector('#v2-body');
    if (!resizer || !left || !right || !body) return;

    let startX = 0;
    let startWidth = 0;
    const onMove = (event) => {
      const bounds = body.getBoundingClientRect();
      const width = Math.max(360, Math.min(bounds.width - 366, startWidth + event.clientX - startX));
      left.style.width = `${width}px`;
      left.style.flex = 'none';
      body.style.gridTemplateColumns = `${width}px 6px minmax(0, 1fr)`;
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      resizer.classList.remove('dragging');
    };
    resizer.addEventListener('pointerdown', (event) => {
      if (window.matchMedia('(max-width: 767px)').matches) return;
      event.preventDefault();
      startX = event.clientX;
      startWidth = left.getBoundingClientRect().width;
      resizer.classList.add('dragging');
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  }


  function _bindColumnResizers() {
    const root = _getRoot();
    const resizer = root?.querySelector('#v2-resizer-1');
    const left = root?.querySelector('#v2-col-left');
    const right = root?.querySelector('#v2-col-right');
    const body = root?.querySelector('#v2-body');
    if (!resizer || !left || !right || !body) return;

    let startX = 0;
    let startWidth = 0;
    const onMove = (event) => {
      const bounds = body.getBoundingClientRect();
      const width = Math.max(360, Math.min(bounds.width - 366, startWidth + event.clientX - startX));
      left.style.width = `${width}px`;
      left.style.flex = 'none';
      body.style.gridTemplateColumns = `${width}px 6px minmax(0, 1fr)`;
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      resizer.classList.remove('dragging');
      if (_cancelColumnResize === onUp) _cancelColumnResize = null;
    };
    resizer.addEventListener('pointerdown', (event) => {
      if (window.matchMedia('(max-width: 767px)').matches) return;
      _cancelColumnResize?.();
      event.preventDefault();
      startX = event.clientX;
      startWidth = left.getBoundingClientRect().width;
      resizer.classList.add('dragging');
      _cancelColumnResize = onUp;
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  }
  /* ----------------------------------------------------------
     BIND EVENTS (chỉ gọi 1 lần sau mount)  ---------------------------------------------------------- */
  function _bindEvents() {
    const root = _getRoot();
    if (!root) return;

    root.querySelector('#v2-toggle-note')?.addEventListener('click', e => {
      const field = root.querySelector('#v2-note-field');
      if (!field) return;
      const expanded = field.style.display === 'none';
      field.style.display = expanded ? 'block' : 'none';
      e.currentTarget.setAttribute('aria-expanded', String(expanded));
      if (expanded) root.querySelector('#v2-bulk-note')?.focus();
    });
    root.querySelector('#v2-toggle-custom')?.addEventListener('click', () => {
      const expanded = _activeDrawerTool !== 'special';
      _setDrawerTool(expanded ? 'special' : null);
      if (expanded) root.querySelector('#v2-special-title')?.focus();
    });    _setDrawerTool(null);    _bindColumnResizers();    // AI Assistant events
    const aiInput = root.querySelector('#v2-ai-input');
    const aiSubmitBtn = root.querySelector('#v2-ai-submit-btn');
    root.querySelectorAll('[data-ai-example]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!aiInput || aiInput.disabled || _isSaving || _aiApplying) return;
        _closeAiPreview();
        aiInput.value = btn.dataset.aiExample;
        aiInput.focus();
      });
    });

    if (aiInput) {
      aiInput.addEventListener('input', () => {
        if (!_aiApplying) _closeAiPreview();
      });      aiInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          _handleAiAnalyze();
        }
      });
    }
    if (aiSubmitBtn) {
      aiSubmitBtn.addEventListener('click', _handleAiAnalyze);
    }
    root.querySelector('#v2-ai-preview')?.addEventListener('click', (e) => {
      const applyBtn = e.target.closest('#v2-ai-apply-btn');
      const cancelBtn = e.target.closest('#v2-ai-cancel-btn');
      if (applyBtn) _handleAiApply();
      if (cancelBtn) _closeAiPreview();
    });

    // Backdrop click to close
    root.querySelector('#v2-backdrop')?.addEventListener('click', e => {
      if (e.target.id === 'v2-backdrop') _handleSaveAndClose();
    });
    root.querySelector('#v2-close-btn')?.addEventListener('click', _handleSaveAndClose);

    // Rule search input
    const searchInput = root.querySelector('#v2-rule-search');
    if (searchInput) {
      searchInput.addEventListener('input', e => {
        _ruleSearch = e.target.value;
        const val = _ruleSearch.trim();
        _selectedRule = val
          ? _orderedRules().find(r => r.category === _cat() && normalizeVi(r.title) === normalizeVi(val)) || null
          : null;
        _ruleDropdownOpen = true;        _patchSearchClear(root);
        _patchDropdown();      });      searchInput.addEventListener('focus', () => {
        _ruleDropdownOpen = true;
        _patchDropdown();
      });
      searchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); _handleAddFromSearch(); }
        if (e.key === 'Escape') { _ruleDropdownOpen = false; _patchDropdown(); }
      });
    }

    root.querySelector('#v2-search-clear')?.addEventListener('click', () => {
      _ruleSearch = '';
      _selectedRule = null;
      if (searchInput) searchInput.value = '';      _patchSearchClear(root);
      _patchDropdown();      root.querySelector('#v2-add-btn')?.setAttribute('disabled', '');
      searchInput?.focus();
    });

    root.querySelector('#v2-add-btn')?.addEventListener('click', _handleAddFromSearch);

    // Subject / Category selects
    root.querySelector('#v2-subject')?.addEventListener('change', e => { _subject = e.target.value; });
    root.querySelector('#v2-category')?.addEventListener('change', e => {
      _category = e.target.value;
      _selectedRule = null;
      const val = _ruleSearch.trim();
      if (val) {
        _selectedRule = _orderedRules().find(r =>
          r.category === _cat() && normalizeVi(r.title) === normalizeVi(val)
        ) || null;
      }
      _syncSubjectVisibility();
      _patchDropdown();    });    root.querySelector('#v2-special-subject')?.addEventListener('change', e => { _spSubject = e.target.value; });
    root.querySelector('#v2-special-category')?.addEventListener('change', e => {
      _spCategory = e.target.value;
      _syncSubjectVisibility();
    });

    // Count input
    root.querySelector('#v2-count')?.addEventListener('change', e => {
      _violationCount = Math.max(1, Math.trunc(Number(e.target.value) || 1));
      e.target.value = _violationCount;
    });

    // Special add
    root.querySelector('#v2-special-add-btn')?.addEventListener('click', _handleSpecialAdd);
    root.querySelector('#v2-special-pts')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') _handleSpecialAdd();
    });

    // Bulk scope
    root.querySelector('#v2-bulk-scope')?.addEventListener('change', e => {
      _bulkScope = e.target.value;
      _patchBulkStudents();    });
    root.querySelector('#v2-bulk-note')?.addEventListener('input', e => { _bulkNote = e.target.value; });

    // Save button
    root.querySelector('#v2-save-btn')?.addEventListener?.('click', _handleSave);

    // Close dropdown when clicking outside
    // Suggestions remain visible when focus leaves the search field.
    document.addEventListener('keydown', _onDocKey);
  }

  function _unbindEvents() {
    document.removeEventListener('click', _onDocClick, true);
    document.removeEventListener('keydown', _onDocKey);
    _cancelColumnResize?.();
    _cancelGvnnDialog?.();
  }
  function _onDocClick(e) {
    if (!_open) { _unbindEvents(); return; }
    const root = _getRoot();
    if (!root) return;
    const dd = root.querySelector('#v2-rule-dropdown');
    if (dd && !dd.contains(e.target) && !root.querySelector('#v2-rule-search')?.contains(e.target)) {
      _ruleDropdownOpen = false;
      _patchDropdown();    }
  }
  function _onDocKey(e) {
    if (!_open) { _unbindEvents(); return; }
    if (e.key === 'Escape') _handleSaveAndClose();
  }

  /* ----------------------------------------------------------
     PATCH FUNCTIONS — chỉ cập nhật 1 vùng DOM nhỏ
  ---------------------------------------------------------- */
  function _patchDayTabs() {
    const el = _getRoot()?.querySelector('#v2-day-strip');
    if (!el) return;
    // Badge điểm (+50, -20...) trên tab đã được chuyển lên header khung
    // "NỘI DUNG CHẤM" (xem _patchHistoryBadges) — tab giờ chỉ hiện tên thứ.
    const allTab = `<button type="button" class="v2-day-tab v2-day-tab--all${_activeDay === -1 ? ' active' : ''}" data-day="-1">
      <span class="v2-day-label">Tất cả</span>
    </button>`;
    const dayTabs = days.map(d => {
      const active = _activeDay === d.key;
      return `<button type="button" class="v2-day-tab${active ? ' active' : ''}" data-day="${d.key}">
        <span class="v2-day-label">${d.label}</span>
      </button>`;
    }).join('');
    el.innerHTML = allTab + dayTabs;
    el.querySelectorAll('.v2-day-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        _activeDay = Number(btn.dataset.day);
        _patchDayTabs();
        _patchReviewPanel();
        _patchRightTitle();
      });
    });
  }

  function _patchMatrix() {
    const el = _getRoot()?.querySelector('#v2-matrix-row');
    if (!el) return;
    const allEvs = _weekEventsForStudent();
    // Mini inline summary: one chip per day with events
    const chips = days.map(d => {
      const evs = allEvs.filter(e => eventDay(e) === d.key);
      if (!evs.length) return '';
      const plus = evs.filter(e => e.points > 0).reduce((s, e) => s + e.points, 0);
      const minus = evs.filter(e => e.points < 0).reduce((s, e) => s + e.points, 0);
      return `<div class="v2-matrix-chip${_activeDay === d.key ? ' active' : ''}" data-day="${d.key}">
        <span class="v2-mc-day">${d.label}</span>
        ${plus ? `<span class="v2-mc-plus">+${formatThousands(plus)}</span>` : ''}
        ${minus ? `<span class="v2-mc-minus">-${formatThousands(minus)}</span>` : ''}
      </div>`;
    }).filter(Boolean).join('');
    el.innerHTML = chips
      ? `<div class="v2-matrix-chips">${chips}</div>`
      : `<div class="v2-matrix-empty">Chưa có điểm trong tuần này</div>`;
    el.querySelectorAll('.v2-matrix-chip').forEach(c => {
      c.addEventListener('click', () => {
        _activeDay = Number(c.dataset.day);
        _patchDayTabs();
        _patchMatrix();
        _patchReviewPanel();
        _patchRightTitle();
      });
    });
  }

  function _patchDaySummaryStrip() {
    const el = _getRoot()?.querySelector('#v2-day-summary-strip');
    if (!el) return;
    const events = _weekEventsForStudent();
    el.innerHTML = days.map(day => {
      const entries = events.filter(event => eventDay(event) === day.key);
      const total = entries.reduce((sum, event) => sum + (Number(event.points) || 0), 0);
      return `<button type="button"
        class="v2-day-total ${_getTierClass(total)}${entries.length ? '' : ' v2-day-total-zero'}${_activeDay === day.key ? ' active' : ''}"        data-day="${day.key}" aria-pressed="${_activeDay === day.key}">        ${_esc(day.label)}: <strong>${_esc(formatScore(total))}</strong>
      </button>`;
    }).join('');
    el.hidden = false;
    el.querySelectorAll('[data-day]').forEach(btn => {
      btn.addEventListener('click', () => {
        const day = Number(btn.dataset.day);
        _activeDay = _activeDay === day ? -1 : day;        _patchDayTabs();
        _patchReviewPanel();
        _patchRightTitle();
        _patchDaySummaryStrip();
      });
    });
  }

  function _patchReviewPanel() {
    _patchDaySummaryStrip();
    const el = _getRoot()?.querySelector('#v2-review-list');    if (!el) return;
    const isAll = _activeDay === -1;
    const evs = isAll ? _weekEventsForStudent() : _dayEvents(_activeDay);
    if (!evs.length) {
      el.innerHTML = `<div class="v2-empty-day">${isAll ? 'Tuần này chưa có điểm nào.' : 'Chưa có nội dung cho ngày này.'}</div>`;
      return;
    }
    const dayColHead = isAll ? `<th class="v2-col-day">Ngày</th>` : '';
    const dayCell = (ev) => isAll
      ? `<td class="v2-ev-day">${days.find(x => x.key === eventDay(ev))?.label || ''}</td>`
      : '';
    el.innerHTML = `
      <table class="v2-history-table${isAll ? ' all-days' : ''}">
        <thead>
          <tr>${dayColHead}<th class="v2-col-title">Nội dung</th><th class="v2-col-pts">Điểm</th><th class="v2-col-actions"></th></tr>
        </thead>
        <tbody>
          ${evs.map(ev => `
          <tr class="v2-ev-item ${ev.points >= 0 ? 'plus' : 'minus'}${_isDraft(ev.id) ? ' draft' : ''}" data-id="${_esc(ev.id)}">
            ${dayCell(ev)}
            <td class="v2-ev-title" title="${_esc(ev.title)}">${_esc(cleanTitleFromEvent(ev.title))}</td>
            <td class="v2-ev-pts">${formatScore(ev.points)}</td>
            <td class="v2-ev-del-cell">
              <button type="button" class="v2-ev-del" data-id="${_esc(ev.id)}" title="Xoá" ${_isSaving ? 'disabled' : ''}>
                <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    el.querySelectorAll('.v2-ev-del').forEach(btn => {
      btn.addEventListener('click', () => _removeEvent(btn.dataset.id));
    });
  }

  function _patchRightTitle() {    const el = _getRoot()?.querySelector('#v2-history-title');
    if (el) {
      if (_activeDay === -1) {
        el.textContent = 'Nội dung chấm - Cả tuần';
      } else {
        const label = days.find(d => d.key === _activeDay)?.full || '';
        el.textContent = label ? `Nội dung chấm - ${label}` : 'Nội dung chấm';
      }
    }
    _patchHistoryBadges();
  }

  /**
   * Badge [+Cộng] [-Trừ] [Tổng] cho phạm vi đang xem (ngày đang chọn hoặc
   * cả tuần nếu đang ở tab "Tất cả") — hiển thị ở góc phải header khung
   * "NỘI DUNG CHẤM", thay cho badge điểm từng tab thứ đã bỏ.
   */
  function _patchHistoryBadges() {
    const el = _getRoot()?.querySelector('#v2-history-badges');
    if (!el) return;
    const isAll = _activeDay === -1;
    const evs = isAll ? _weekEventsForStudent() : _dayEvents(_activeDay);
    if (!evs.length) { el.innerHTML = ''; return; }
    const plus = evs.filter(e => e.points > 0).reduce((s, e) => s + e.points, 0);
    const minus = evs.filter(e => e.points < 0).reduce((s, e) => s + e.points, 0);
    const total = plus + minus;
    el.innerHTML = `
      ${plus > 0 ? `<span class="v2-history-badge pos">${formatScore(plus)}</span>` : ''}
      ${minus < 0 ? `<span class="v2-history-badge neg">${formatScore(minus)}</span>` : ''}
      <span class="v2-history-badge total ${total >= 0 ? 'pos' : 'neg'}">Tổng: ${formatScore(total)}</span>`;
  }
  function _patchFooter() {
    const { plus, minus, grand } = _totals();
    const draftCount = _draftEvents.filter(e => _isDraft(e.id)).length;    const hasChanges = draftCount > 0 || _deletedIds.length > 0;

    const scoresEl = _getRoot()?.querySelector('#v2-footer-scores');
    if (scoresEl) {
      const statusStr = _student?.status || '';
      scoresEl.innerHTML = `
        <span class="v2-score-chip pos">+Cộng: ${formatThousands(plus)}</span>
        <span class="v2-score-chip neg">−Trừ: ${formatThousands(Math.abs(minus))}</span>
        <span class="v2-score-chip total">Tổng: ${formatScore(grand)}</span>
        <span class="v2-score-status ${(typeof statusTone === 'function' ? statusTone(statusStr) : '')} ${_getTierClass(statusStr)}">Xếp loại: ${_esc(statusStr)}</span>`;    }
    const saveBtn = _getRoot()?.querySelector('#v2-save-btn');
    if (saveBtn) {
      saveBtn.hidden = false;
      saveBtn.disabled = !hasChanges || _isSaving || _aiApplying;
      saveBtn.className = `v2-save-btn${hasChanges ? ' has-changes' : ''}`;
      if (_isSaving) {
        saveBtn.textContent = 'Đang lưu…';
      } else {
        saveBtn.textContent = 'Lưu thay đổi';
      }
    }
  }

  function _patchDropdown() {
    const root = _getRoot();
    const el = root?.querySelector('#v2-rule-dropdown');
    if (!el) return;
    const filtered = _filteredRules();
    const badge = root.querySelector('#v2-rule-pts-badge');
    if (badge) {
      const points = Number(_selectedRule?.points);
      const visible = !!_selectedRule && Number.isFinite(points);
      badge.style.display = visible ? 'inline-flex' : 'none';
      badge.textContent = visible ? `${formatScore(points)}đ` : '';
      badge.className = `v2-rule-pts-badge ${points >= 0 ? 'plus' : 'minus'}`;
    }
    const addBtn = root.querySelector('#v2-add-btn');
    if (addBtn) {
      addBtn.disabled = !_ruleSearch.trim() || (!_selectedRule && !filtered.length);      addBtn.title = addBtn.disabled
        ? 'Vui lòng chọn một nội quy từ danh sách hoặc nhập tên lỗi/thưởng trước'
        : 'Thêm điểm (Enter)';
    }
    el.style.display = _ruleDropdownOpen ? 'block' : 'none';
    el.setAttribute('aria-label', 'Nội quy phù hợp — bấm để chọn');
    if (!_ruleDropdownOpen) return;    if (!filtered.length) {
      el.style.display = 'block';
      el.innerHTML = `<div class="v2-dd-empty">Không tìm thấy nội quy phù hợp.</div>`;
      return;
    }
    el.style.display = 'block';
    el.innerHTML = filtered.map(r => {
      const ruleJson = _esc(JSON.stringify(r));
      return `<button type="button" class="v2-dd-item ${r.points >= 0 ? 'plus' : 'minus'}" data-rule="${ruleJson}">
        <strong>${_esc(r.title)}</strong>
        <span>${r.points >= 0 ? 'Cộng' : 'Trừ'} ${Math.abs(r.points)}đ · ${_esc(categoryLabel(r.category))}</span>
      </button>`;
    }).join('');
    el.querySelectorAll('.v2-dd-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const rule = JSON.parse(btn.dataset.rule);
        if (_isSaving || _aiApplying) return;
        _chooseRule(rule);
        _ruleDropdownOpen = false;
        _patchDropdown();
      });    });
  }

  function _patchQuickRules() {
    const el = _getRoot()?.querySelector('#v2-quick-rules');
    if (!el) return;
    const rules = _orderedRules().slice(0, 6);
    el.innerHTML = rules.length
      ? `<div class="v2-quick-rules-title">Nội quy hay dùng / ghim</div>
         <div class="v2-quick-rules-list">${rules.map(rule =>
           `<button type="button" class="v2-quick-rule" data-rule="${_esc(JSON.stringify(rule))}">${_esc(rule.title)} · ${_esc(formatScore(Number(rule.points)))}</button>`
         ).join('')}</div>`
      : '';
    el.querySelectorAll('.v2-quick-rule').forEach(button => {
      button.addEventListener('click', () => {
        if (_isSaving || _aiApplying) return;
        _chooseRule(JSON.parse(button.dataset.rule));
        _ruleDropdownOpen = false;
        _patchDropdown();
      });
    });
  }

  function _patchSearchClear(root) {
    const container = root || _getRoot() || document.getElementById(MODAL_ROOT_ID) || document;
    const wrap = container.querySelector('.v2-search-row .v2-search-box');    if (!wrap) return;
    let clearBtn = wrap.querySelector('#v2-search-clear');
    if (_ruleSearch && !clearBtn) {
      clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.id = 'v2-search-clear';
      clearBtn.className = 'v2-search-clear';
      clearBtn.title = 'Xoá';
      clearBtn.textContent = '×';
      clearBtn.addEventListener('click', () => {
        _ruleSearch = '';
        _selectedRule = null;
        const inp = container.querySelector('#v2-rule-search');        if (inp) inp.value = '';
        _patchSearchClear(container);
        _patchDropdown();
        container.querySelector('#v2-add-btn')?.setAttribute('disabled', '');        inp?.focus();
      });
      wrap.appendChild(clearBtn);
    } else if (!_ruleSearch && clearBtn) {
      clearBtn.remove();
    }
  }

  function _patchBulkStudents(containerParam, studentsParam) {
    const el = containerParam || _getRoot()?.querySelector('#v2-bulk-students');
    if (!el) return;
    if (!containerParam && _bulkScope !== 'selected') { el.style.display = 'none'; return; }
    el.style.display = 'grid';
    const rawSummaries = studentsParam || (typeof getDerived === 'function' ? getDerived()?.rawSummaries : []);
    const members = (studentsParam || !containerParam)
      ? (rawSummaries || []).filter(s => studentsParam ? true : (s.group === _student?.group))
      : (rawSummaries || []).filter(s => s.group === _student?.group);
    el.innerHTML = members.map(m => `
      <label class="v2-bulk-member" title="${_esc(m.name)}">
        <input type="checkbox" class="v2-bulk-chk" data-id="${_esc(m.id)}"
          ${_bulkSelected.includes(m.id) ? 'checked' : ''}/>
        <span class="v2-bulk-name">${_esc(m.name)}</span>
      </label>`).join('');
    el.querySelectorAll?.('.v2-bulk-chk')?.forEach?.(chk => {
      chk.addEventListener?.('change', () => {
        const id = chk.dataset?.id;
        if (chk.checked) {
          if (!_bulkSelected.includes(id)) _bulkSelected.push(id);
        } else {
          _bulkSelected = _bulkSelected.filter(x => x !== id);
        }
      });
    });
  }

  /* ----------------------------------------------------------
     AI ASSISTANT HANDLERS
  ---------------------------------------------------------- */
  async function _handleAiAnalyze() {
    const root = _getRoot();
    const aiInput = root?.querySelector('#v2-ai-input');
    const aiSubmitBtn = root?.querySelector('#v2-ai-submit-btn');
    const aiPreview = root?.querySelector('#v2-ai-preview');
    const aiError = root?.querySelector('#v2-ai-error');

    if (!aiInput || !aiSubmitBtn || !aiPreview || aiInput.disabled || _isSaving || _aiApplying) return;
    const prompt = aiInput.value.trim();
    if (!prompt) return;
    _closeAiPreview();
    const request = ++_aiRequest;
    const snapshot = JSON.stringify(_getStudentWeekEvents());
    if (aiError) {
      aiError.style.display = 'none';
      aiError.textContent = '';
    }

    if (!window.A3ScoreboardModalAI?.analyze) {
      const errMsg = 'Module AI chưa sẵn sàng (window.A3ScoreboardModalAI.analyze không tồn tại)';
      if (aiError) {
        aiError.textContent = errMsg;
        aiError.style.display = 'block';
      } else {
        _notify(errMsg, 'error');
      }
      return;
    }

    // Loading state
    aiSubmitBtn.disabled = true;
    aiSubmitBtn.textContent = 'Đang phân tích…';
    aiInput.disabled = true;

    try {
      const currentEvents = _weekEventsForStudent().map(event => ({ ...event }));
      const result = await window.A3ScoreboardModalAI.analyze({
        student: _student,
        week: state.week,
        events: currentEvents,
        currentEvents,
        rules: _rules,
        subjects: window.SUBJECTS || subjects || [],
        CATEGORY: window.CATEGORY || CATEGORY || {},
        prompt
      });

      if (!_open || request !== _aiRequest || !root.contains(aiInput)) return;
      if (result?.ok === false) throw new Error(result.error || 'Không thể phân tích yêu cầu.');      if (snapshot !== JSON.stringify(_getStudentWeekEvents())) {
        _notify('Nội dung chấm đã thay đổi. Hãy phân tích lại để có đề xuất mới.', 'warning');
        return;
      }
      const operations = Array.isArray(result?.operations) ? result.operations : [];
      _aiPreviewSnapshot = snapshot;
      _lastAiOperations = operations;      _renderAiPreview(operations);
      aiPreview.style.display = 'block';    } catch (err) {      console.error('[AI] analyze error:', err);
      const errMsg = 'Phân tích thất bại: ' + (err?.message || err);
      if (aiError) {
        aiError.textContent = errMsg;
        aiError.style.display = 'block';
      }
      _notify(errMsg, 'error');
      aiPreview.style.display = 'none';    } finally {
      aiSubmitBtn.disabled = false;
      aiSubmitBtn.textContent = 'Phân tích & Đề xuất';
      aiInput.disabled = false;
    }
  }

  function _renderAiPreview(operations) {
    const root = _getRoot();
    const aiPreview = root?.querySelector('#v2-ai-preview');
    if (!aiPreview) return;

    if (!operations.length) {
      aiPreview.innerHTML = '<div class="v2-ai-empty">AI không tìm thấy thao tác phù hợp từ câu lệnh.</div>';
      return;
    }

    const badgeClass = { add: 'add', update: 'update', delete: 'delete' };
    const badgeLabel = { add: '[+ THÊM]', update: '[✎ SỬA]', delete: '[- XÓA]' };    aiPreview.innerHTML = `
      <div class="v2-ai-preview-title">Xem trước đề xuất AI (Preview Diff)</div>
      <p class="v2-ai-preview-note">Duyệt từng đề xuất trước khi áp dụng. Chưa có điểm nào được thay đổi.</p>      <div class="v2-ai-preview-list">        ${operations.map((op, idx) => {
          const type = String(op.type || op.action || 'add').toLowerCase();
          const bClass = badgeClass[type] || 'add';
          const bLabel = badgeLabel[type] || '[+ THÊM]';
          return `
          <label class="v2-ai-op-item ${type}" data-idx="${idx}">
            <input type="checkbox" class="v2-ai-op-chk" checked data-idx="${idx}" />
            <span class="v2-ai-badge ${bClass}">${bLabel}</span>
            <div class="v2-ai-op-detail">
              ${_renderAiDiff(op)}            </div>
          </label>
        `;
        }).join('')}
      </div>
      <div class="v2-ai-preview-actions">
        <button type="button" class="v2-ai-btn secondary" id="v2-ai-cancel-btn">Huỷ</button>
        <button type="button" class="v2-ai-btn primary" id="v2-ai-apply-btn">Áp dụng ngay</button>
      </div>
    `;
  }

  function _renderAiDiff(op) {
    const type = String(op.type || op.action || 'add').toLowerCase();
    const old = _draftEvents.find(event => event.id === op.targetEventId);
    const describe = (value, existing = false) => {
      const day = existing ? eventDay(value) : _dayToNumericKey(value.day);
      const dayLabel = day === 0 ? 'CN' : `T${day}`;
      const title = String(value.title || '');
      const tiet = value.tiet || title.match(/Tiết\s+(\d+)/i)?.[1];
      const subject = value.subject || (existing ? '' : op.subject);
      return [
        dayLabel,
        `Tiết: ${tiet || '—'}`,
        `Môn: ${subject || (existing ? 'xem nội dung' : '—')}`,
        `Nội quy: ${existing ? cleanTitleFromEvent(title) : title || '—'}`,
        `Điểm: ${value.points == null ? 'chưa xác định' : formatScore(Number(value.points))}`
      ].join(' · ');
    };
    const before = old ? describe(old, true) : 'Không tìm thấy dòng gốc';
    const after = describe(op);
    return `
      ${type !== 'add' ? `<div class="v2-ai-op-meta"><strong>Trước:</strong> ${_esc(before)}</div>` : ''}
      ${type !== 'delete' ? `<div class="v2-ai-op-main"><strong>${type === 'update' ? 'Sau:' : 'Thêm:'}</strong> ${_esc(after)}</div>` : ''}
      ${type === 'delete' ? '<div class="v2-ai-op-main">Sau: xoá dòng này</div>' : ''}
      ${op.reason ? `<div class="v2-ai-op-meta">${_esc(op.reason)}</div>` : ''}
    `;
  }

  function _formatAiOpMain(op) {    const dayLabel = op.day !== undefined && op.day !== null ? _formatAiDayLabel(op.day) : '';
    const tietPart = op.tiet ? `Tiết ${op.tiet}` : '';
    const timePrefix = [dayLabel, tietPart].filter(Boolean).join(' · ');
    const isGvnn = isGvnnTitle(op.title) || String(op.title || '').toLowerCase().includes('giáo viên nhắc nhở');
    if (isGvnn) {
      const occ = op.gvnn_occurrence ? ` - Lần ${op.gvnn_occurrence}` : '';
      const pts = op.points !== undefined ? (op.points >= 0 ? `+${op.points}` : `${op.points}`) : '-20';
      return `${timePrefix} [Nề nếp] Giáo Viên Nhắc Nhở${occ} (${pts})`.trim();
    }
    const subject = op.subject ? `[${op.subject}] ` : '';
    const title = op.title || '';
    const points = op.points !== undefined ? (op.points >= 0 ? `+${op.points}` : `${op.points}`) : '';
    return `${timePrefix} ${subject}${title} ${points}`.trim();
  }

  function _formatAiOpMeta(op) {
    const parts = [];
    if (op.reason) parts.push(`Lý do: ${op.reason}`);
    if (op.targetEventId) parts.push(`ID gốc: ${op.targetEventId}`);
    if (op.category) parts.push(`Loại: ${categoryLabel(op.category)}`);
    return parts.join(' · ');
  }

  async function _handleAiApply() {
    const root = _getRoot();
    const aiPreview = root?.querySelector('#v2-ai-preview');
    if (!aiPreview || _isSaving || _aiApplying) return;
    if (_aiPreviewSnapshot !== JSON.stringify(_getStudentWeekEvents())) {
      _closeAiPreview();
      _notify('Nội dung chấm đã thay đổi. Hãy phân tích lại trước khi áp dụng.', 'warning');
      return;
    }

    const checkedItems = aiPreview.querySelectorAll('.v2-ai-op-chk:checked');    if (!checkedItems.length) {
      _notify('Chưa chọn thao tác nào để áp dụng.', 'warning');
      return;
    }

    // Get operations from the rendered preview (stored in data attributes or re-parse)
    // We'll store operations in a temporary variable during render
    const operations = _lastAiOperations || [];
    const selectedOps = Array.from(checkedItems).map(chk => operations[Number(chk.dataset.idx)]).filter(Boolean);

    let applied = 0;
    _aiApplying = true;
    aiPreview.querySelectorAll('button, input').forEach(el => { el.disabled = true; });
    _patchFooter();
    try {
      for (const op of selectedOps) {
        if (await _applyAiOperation(op)) applied++;
      }
    } catch (error) {
      _notify(`Không thể áp dụng đề xuất: ${error?.message || error}`, 'error');
    } finally {
      _aiApplying = false;
      aiPreview.querySelectorAll('button, input').forEach(el => { el.disabled = false; });
      _patchFooter();
    }

    if (applied > 0) {      _patchDayTabs();
      _patchMatrix();
      _patchReviewPanel();
      _patchHistoryBadges();
      _patchFooter();
      _closeAiPreview();
      const aiInput = root?.querySelector('#v2-ai-input');
      if (aiInput) aiInput.value = '';
      _notify(`Đã áp dụng ${applied} thao tác.`, 'success');
    } else {
      _notify('Không có thao tác nào được áp dụng.', 'warning');
    }
  }

  function _closeAiPreview() {
    const root = _getRoot();
    const aiPreview = root?.querySelector('#v2-ai-preview');
    if (aiPreview) {
      aiPreview.style.display = 'none';
      aiPreview.innerHTML = '';
    }
    const aiError = root?.querySelector('#v2-ai-error');
    if (aiError) {
      aiError.style.display = 'none';
      aiError.textContent = '';
    }
    _lastAiOperations = [];  }

  let _lastAiOperations = [];  let _aiPreviewSnapshot = '';
  let _aiRequest = 0;
  let _aiApplying = false;
  let _undoRemoval = null;
  let _undoTimer = null;

  function _clearUndo() {
    clearTimeout(_undoTimer);
    _undoTimer = null;
    _undoRemoval = null;
    const banner = _getRoot()?.querySelector('#v2-undo-banner');
    if (banner) {
      banner.hidden = true;
      banner.innerHTML = '';
    }
  }

  function _showUndo(event, index) {
    _clearUndo();
    _undoRemoval = { event, index };
    const banner = _getRoot()?.querySelector('#v2-undo-banner');
    if (!banner) return;
    banner.hidden = false;
    banner.innerHTML = `
      <span>Đã xóa: ${_esc(cleanTitleFromEvent(event.title))}</span>
      <button type="button" class="v2-undo-btn">↩ Hoàn tác</button>`;
    banner.querySelector('button').addEventListener('click', () => {
      if (!_undoRemoval || _isSaving || _aiApplying) return;
      const removed = _undoRemoval;
      if (!_draftEvents.some(item => item.id === removed.event.id)) {
        _draftEvents.splice(Math.min(removed.index, _draftEvents.length), 0, removed.event);
      }
      _deletedIds = _deletedIds.filter(item => item.id !== removed.event.id);
      _clearUndo();
      _patchDayTabs();
      _patchReviewPanel();
      _patchRightTitle();
      _patchFooter();
    });
    _undoTimer = setTimeout(_clearUndo, 5000);
  }
  async function _applyAiOperation(op) {
    const curW = Number(state.week);
    const type = String(op.type || op.action || 'add').toLowerCase();
    const day = _dayToNumericKey(op.day);
    const cat = _toCategoryConstant(op.category);

    switch (type) {
      case 'delete': {
        const targetId = op.targetEventId;
        if (!targetId) return false;
        const ev = _draftEvents.find(e => e.id === targetId);
        if (_isDraft(targetId)) {
          _draftEvents = _draftEvents.filter(e => e.id !== targetId);
        } else if (ev) {
          _deletedIds = [..._deletedIds.filter(d => d.id !== targetId), { id: ev.id, studentId: ev.studentId, week: ev.week, title: ev.title, points: ev.points }];
          _draftEvents = _draftEvents.filter(e => e.id !== targetId);
        }
        return true;
      }
      case 'update': {
        const targetId = op.targetEventId;
        if (!targetId) return false;
        const idx = _draftEvents.findIndex(e => e.id === targetId);
        if (idx === -1) return false;
        const oldEv = _draftEvents[idx];
        // Remove old, add new draft
        if (!_isDraft(targetId)) {
          _deletedIds = [..._deletedIds.filter(d => d.id !== targetId), { id: oldEv.id, studentId: oldEv.studentId, week: oldEv.week, title: oldEv.title, points: oldEv.points }];
        }
        _draftEvents.splice(idx, 1);
        const opSubject = op.subject !== undefined ? op.subject : oldEv.subject;
        const newDraft = makeDraftEvent({
          studentId: oldEv.studentId, week: curW,
          title: formatSavedTitle(day, cat, opSubject, op.title, op.points),
          points: op.points, type: op.points >= 0 ? 'CONG' : 'TRU',
          category: cat, note: op.reason,
          createdBy: 'AI', createdAt: newEventDateForDay(day),
        });
        _draftEvents = [newDraft, ..._draftEvents];
        return true;
      }
      case 'add': {
        // GVNN ("Giáo Viên Nhắc Nhở") — cần hỏi Tiết nếu chưa có, tính điểm luỹ tiến
        const isGvnn = isGvnnTitle(op.title) || String(op.title || '').toLowerCase().includes('giáo viên nhắc nhở');
        if (isGvnn) {
          let tiet = op.tiet ? Number(op.tiet) : null;
          if (!tiet) {
            const input = await _showGvnnDialog();
            if (!input) return false;
            tiet = input.tiet;
          }
          const dayLabel = day === 0 ? 'CN' : `Thứ ${day}`;
          // Đếm số GVNN đang chờ lưu trong phiên này của học sinh cùng tiết để lũy tiến chính xác
          const queued = _draftEvents.filter(e => e._gvnn && e.studentId === _student.id && e.dayLabel === dayLabel && e.tiet === tiet).length;
          const occurrence = _gvnnCountFor(_student.id, dayLabel, tiet) + queued + 1;
          const previewPoints = -(occurrence * 20);
          // Tạo draft event gắn cờ _gvnn: true, dayLabel, tiet
          const newDraft = makeDraftEvent({
            studentId: _student.id, week: curW,
            title: `${dayLabel}: Tiết ${tiet}: [Nề nếp] ${GVNN_TITLE} — lần ${occurrence} (dự kiến ${previewPoints})`,
            points: previewPoints, type: 'TRU',
            category: CATEGORY.DISCIPLINE, note: op.reason || undefined,
            createdBy: 'AI', createdAt: newEventDateForDay(day),
            _gvnn: true, dayLabel, tiet,
          });
          _draftEvents = [newDraft, ..._draftEvents];
          return true;
        }
        // HOC_TAP có tiet → ghép title giữ Tiết
        if (cat === CATEGORY.STUDY && op.tiet) {
          const dayLabel = day === 0 ? 'CN' : `Thứ ${day}`;
          const tietPart = op.tiet ? `Tiết ${op.tiet}: ` : '';
          const subPart = (op.subject || _sub()) ? `[${op.subject || _sub()}] ` : '';
          const ptsStr = formatScore(op.points);
          const titleStr = `${dayLabel}: ${tietPart}[Học tập]: ${subPart}${op.title} (${ptsStr})`;
          const newDraft = makeDraftEvent({
            studentId: _student.id, week: curW,
            title: titleStr,
            points: op.points, type: op.points >= 0 ? 'CONG' : 'TRU',
            category: cat, note: op.reason,
            createdBy: 'AI', createdAt: newEventDateForDay(day),
          });
          _draftEvents = [newDraft, ..._draftEvents];
          return true;
        }
        // Các loại khác dùng formatSavedTitle mặc định
        const newDraft = makeDraftEvent({
          studentId: _student.id, week: curW,
          title: formatSavedTitle(day, cat, op.subject || _sub(), op.title, op.points),
          points: op.points, type: op.points >= 0 ? 'CONG' : 'TRU',
          category: cat, note: op.reason,
          createdBy: 'AI', createdAt: newEventDateForDay(day),
        });
        _draftEvents = [newDraft, ..._draftEvents];
        return true;
      }
      default:
        return false;
    }
  }

  /* ----------------------------------------------------------
     LEGACY AI HANDLERS
  ---------------------------------------------------------- */
  async function _handleAiAnalyzeLegacy() {
    const root = _getRoot();
    const aiInput = root?.querySelector('#v2-ai-input');
    const aiSubmitBtn = root?.querySelector('#v2-ai-submit-btn');
    const aiPreview = root?.querySelector('#v2-ai-preview');
    const aiError = root?.querySelector('#v2-ai-error');

    if (!aiInput || !aiPreview || aiInput.disabled || _isSaving || _aiApplying) return;
    const prompt = aiInput.value.trim();
    if (!prompt) return;
    _closeAiPreview();
    const request = ++_aiRequest;
    const snapshot = JSON.stringify(_getStudentWeekEvents());
    if (aiError) {
      aiError.style.display = 'none';
      aiError.textContent = '';
    }

    if (!window.A3ScoreboardModalAI?.analyze) {
      const errMsg = 'Module AI chưa sẵn sàng (window.A3ScoreboardModalAI.analyze không tồn tại)';
      if (aiError) {
        aiError.textContent = errMsg;
        aiError.style.display = 'block';
      } else {
        _notify(errMsg, 'error');
      }
      return;
    }

    // Loading state
    aiSubmitBtn.disabled = true;
    aiSubmitBtn.textContent = 'Đang phân tích…';
    aiInput.disabled = true;

    try {
      const currentEvents = _getStudentWeekEvents().map(event => ({ ...event }));      const derived = window.__scoreboard?.getDerived?.();
      const subjectsList = derived?.subjects || [];

      const result = await window.A3ScoreboardModalAI.analyze({
        student: _student,
        week: state.week,
        currentEvents,
        rules: _rules,
        subjects: subjectsList,
        prompt
      });

      if (!_open || request !== _aiRequest || !root.contains(aiInput)) return;
      if (snapshot !== JSON.stringify(_getStudentWeekEvents())) {
        _notify('Nội dung chấm đã thay đổi. Hãy phân tích lại để có đề xuất mới.', 'warning');
        return;
      }
      const operations = Array.isArray(result?.operations) ? result.operations : [];
      _aiPreviewSnapshot = snapshot;
      _lastAiOperations = operations;      _renderAiPreview(operations);
      aiPreview.style.display = 'block';
      const quickRules = root.querySelector('#v2-quick-rules');
      if (quickRules) quickRules.hidden = true;
    } catch (err) {      console.error('[AI] analyze error:', err);
      const errMsg = 'Phân tích thất bại: ' + (err?.message || err);
      if (aiError) {
        aiError.textContent = errMsg;
        aiError.style.display = 'block';
      } else {
        _notify(errMsg, 'error');
      }
      aiPreview.style.display = 'none';
    } finally {
      aiSubmitBtn.disabled = false;
      aiSubmitBtn.textContent = 'Phân tích & Đề xuất';
      aiInput.disabled = false;
    }
  }

  function _applyAiOperationLegacy(op) {    const curW = Number(state.week);    const day = op.day ?? (_activeDay === -1 ? (() => { const d = new Date().getDay(); return d === 0 ? 0 : d + 1; })() : _activeDay);

    switch (op.type) {
      case 'delete': {
        const targetId = op.targetEventId;
        if (!targetId) return false;
        const ev = _draftEvents.find(e => e.id === targetId);
        if (_isDraft(targetId)) {
          _draftEvents = _draftEvents.filter(e => e.id !== targetId);
        } else if (ev) {
          _deletedIds = [..._deletedIds.filter(d => d.id !== targetId), { id: ev.id, studentId: ev.studentId, week: ev.week, title: ev.title, points: ev.points }];
          _draftEvents = _draftEvents.filter(e => e.id !== targetId);
        }
        return true;
      }
      case 'update': {
        const targetId = op.targetEventId;
        if (!targetId) return false;
        const idx = _draftEvents.findIndex(e => e.id === targetId);
        if (idx === -1) return false;
        const oldEv = _draftEvents[idx];
        // Remove old, add new draft
        if (!_isDraft(targetId)) {
          _deletedIds = [..._deletedIds.filter(d => d.id !== targetId), { id: oldEv.id, studentId: oldEv.studentId, week: oldEv.week, title: oldEv.title, points: oldEv.points }];
        }
        _draftEvents.splice(idx, 1);
        const newDraft = makeDraftEvent({
          studentId: oldEv.studentId, week: curW,
          title: formatSavedTitle(day, op.category || oldEv.category, op.subject || oldEv.subject, op.title, op.points),
          points: op.points, type: op.points >= 0 ? 'CONG' : 'TRU',
          category: op.category || oldEv.category, note: op.reason,
          createdBy: 'AI', createdAt: newEventDateForDay(day),
        });
        _draftEvents = [newDraft, ..._draftEvents];
        return true;
      }
      case 'add': {
        const newDraft = makeDraftEvent({
          studentId: _student.id, week: curW,
          title: formatSavedTitle(day, op.category || _cat(), op.subject || _sub(), op.title, op.points),
          points: op.points, type: op.points >= 0 ? 'CONG' : 'TRU',
          category: op.category || _cat(), note: op.reason,
          createdBy: 'AI', createdAt: newEventDateForDay(day),
        });
        _draftEvents = [newDraft, ..._draftEvents];
        return true;
      }
      default:
        return false;
    }
  }

  /* ----------------------------------------------------------
     ACTIONS
  ---------------------------------------------------------- */
  /** Môn học chỉ có nghĩa khi loại = Học tập → ẩn ở Nề nếp / Phong trào.
   *  Áp dụng cho cả form nội quy (trên) và mục Lỗi / Thưởng đặc biệt. */
  function _syncSubjectVisibility() {
    const root = _getRoot();
    if (!root) return;
    const topSub = root.querySelector('#v2-subject');
    if (topSub) topSub.style.display = _cat() === CATEGORY.STUDY ? '' : 'none';
    const spSub = root.querySelector('#v2-special-subject');
    if (spSub) spSub.style.display = _spCat() === CATEGORY.STUDY ? '' : 'none';
  }

  function _chooseRule(rule) {
    _selectedRule = rule;
    _category = rule.category;
    _ruleSearch = rule.title;
    const root = _getRoot();
    const inp = root?.querySelector('#v2-rule-search');
    if (inp) inp.value = rule.title;
    const catSel = root?.querySelector('#v2-category');
    if (catSel) catSel.value = rule.category;
    _syncSubjectVisibility();
    _patchSearchClear(root);
    _patchDropdown();
  }
  function _stageScore(payload, day) {    if (_isSaving || _aiApplying) return;    const todayKey = (() => { const d = new Date().getDay(); return d === 0 ? 0 : d + 1; })();
    const activeDay = day ?? (_activeDay === -1 ? todayKey : _activeDay);
    const title = String(payload.title || '').trim();
    if (!title) return;

    // GVNN ("Giáo Viên Nhắc Nhở") KHÔNG dùng điểm cố định như các lỗi khác —
    // điểm trừ tăng luỹ tiến theo số lần vi phạm trong CÙNG 1 tiết, do
    // server tự đếm khi lưu (action 'addGvnn'). Tách sang luồng riêng vì cần
    // hỏi "Tiết" (chưa có khái niệm Tiết ở modal này) và không thể tính
    // điểm thật ngay tại đây. Dùng isGvnnTitle() (startsWith) thay vì so
    // khớp tuyệt đối vì tên rule thật trong DB có thể có hậu tố (VD:
    // "Giáo Viên Nhắc Nhở - Lần 1"). Xem _stageGvnn() bên dưới.
    if (isGvnnTitle(title)) {
      _stageGvnn(activeDay);
      return;
    }

    const count = Math.max(1, Math.trunc(_violationCount || 1));
    const points = payload.points * count;
    if (!points) return;

    const cat = payload.category || _cat();
    const subj = payload.subject || _sub();

    const targetIds = _getTargetIds();
    const newDrafts = targetIds.map(studentId => makeDraftEvent({
      studentId, week: state.week,
      // Nhiều lần (×N): ghi rõ "×N" vào nội dung để người đọc biết điểm là
      // tổng của N lần (VD "Phát biểu ×4 (+20)"), không bị hiểu nhầm là 1 lần.
      title: formatSavedTitle(activeDay, cat, subj, count > 1 ? `${title} ×${count}` : title, points),
      points, type: points >= 0 ? 'CONG' : 'TRU',
      category: cat, note: _bulkNote.trim() || undefined,
      createdBy: 'Web', createdAt: newEventDateForDay(activeDay),
    }));

    _draftEvents = [...newDrafts, ..._draftEvents];

    _patchDayTabs();
    _patchMatrix();
    _patchReviewPanel();
    _patchHistoryBadges();
    _patchFooter();

    _flashAddFeedback();
  }

  /** Khoá đếm "1 tiết" phía client — PHẢI khớp cách backend ghép
   *  (dayLabel, tiet) trong gvnnPeriodKey() (ok.js), gồm cả tiền tố
   *  GVNN_NOTE_PREFIX ('GVNN::') dùng để tách biệt với note của các lỗi
   *  khác (vì đếm chỉ dựa vào cột note, KHÔNG dựa vào title — title giờ
   *  hiển thị đầy đủ Thứ/Tiết/lần nên mỗi bản ghi có title khác nhau). */
  const GVNN_NOTE_PREFIX = 'GVNN::';
  function _gvnnPeriodKeyLocal(dayLabel, tiet) {
    return `${GVNN_NOTE_PREFIX}${dayLabel}__${tiet}`;
  }

  /** Đếm ước tính số lần GVNN đã có — gồm bản ghi ĐÃ LƯU trong DB (đọc từ
   *  state.events, nguồn dữ liệu chung của toàn app, không chỉ của modal
   *  này — cần thiết vì chấm hàng loạt/theo tổ có thể nhắm tới học sinh
   *  KHÁC học sinh đang mở modal) CỘNG bản ghi ĐANG CHỜ LƯU trong modal
   *  (_draftEvents, đánh dấu _gvnn:true). CHỈ dùng để hiển thị điểm DỰ KIẾN
   *  trên UI — điểm THẬT do server tính lại tại đúng thời điểm gọi action
   *  'addGvnn' (xem addGvnnEvent() trong scoreboard.js), có thể lệch nếu có
   *  người khác cũng vừa ghi GVNN cho học sinh này trong lúc modal đang mở. */
  function _gvnnCountFor(studentId, dayLabel, tiet) {
    // Backend (ok.js → gvnnPeriodKey) ghi note KHÔNG kèm tiền tố 'GVNN::',
    // nên chấp nhận CẢ HAI dạng khi đối chiếu — nếu chỉ so với dạng có tiền
    // tố thì các lần GVNN ĐÃ LƯU không được đếm và điểm dự kiến luôn hiện
    // "lần 1 (-20)" dù thực tế server sẽ trừ -40/-60.
    const periodKey    = _gvnnPeriodKeyLocal(dayLabel, tiet);
    const periodKeyRaw = `${dayLabel}__${tiet}`;
    const curW = Number(state.week);
    const savedCount = state.events.filter(e =>
      e.studentId === studentId && Number(e.week) === curW &&
      (e.note === periodKey || e.note === periodKeyRaw)
    ).length;
    const stagedCount = _draftEvents.filter(e =>
      e._gvnn && _isDraft(e.id) && e.studentId === studentId &&
      e.dayLabel === dayLabel && e.tiet === tiet
    ).length;
    return savedCount + stagedCount;
  }

  /** Thêm 1 hoặc nhiều lượt vi phạm GVNN cùng lúc. Hỏi "Tiết" + "Số lần"
   *  trong CÙNG 1 hộp thoại (xem _showGvnnDialog()) — không hỏi lại nhiều
   *  lần nếu cần ghi liên tiếp nhiều lượt trong cùng 1 tiết. Điểm hiển thị
   *  ở đây chỉ là DỰ KIẾN; điểm thật được tính lại khi bấm "Lưu thay đổi"
   *  (mỗi dòng GVNN gọi 1 request 'addGvnn' riêng, xem _handleSave()). */
  async function _stageGvnn(activeDay) {
    const dayLabel = activeDay === 0 ? 'CN' : `Thứ ${activeDay}`;
    const input = await _showGvnnDialog();
    if (!input) return; // người dùng huỷ
    const { tiet, count } = input;

    const targetIds = _getTargetIds();
    const newDrafts = [];

    targetIds.forEach(studentId => {
      for (let i = 0; i < count; i++) {
        const queuedForThisStudent = newDrafts.filter(d => d.studentId === studentId).length;
        const occurrence = _gvnnCountFor(studentId, dayLabel, tiet) + queuedForThisStudent + 1;
        const previewPoints = -(occurrence * 20);
        newDrafts.push(makeDraftEvent({
          studentId, week: state.week,
          title: `${dayLabel}: Tiết ${tiet}: [Nề nếp] ${GVNN_TITLE} — lần ${occurrence} (dự kiến ${previewPoints})`,
          points: previewPoints, type: 'TRU',
          category: CATEGORY.DISCIPLINE, note: _bulkNote.trim() || undefined,
          createdBy: 'Web', createdAt: newEventDateForDay(activeDay),
          _gvnn: true, dayLabel, tiet,
        }));
      }
    });

    _draftEvents = [...newDrafts, ..._draftEvents];

    _patchDayTabs();
    _patchMatrix();
    _patchReviewPanel();
    _patchHistoryBadges();
    _patchFooter();

    _flashAddFeedback();
  }

  /**
   * _showGvnnDialog() → Promise<{tiet, count} | null>
   * ------------------------------------------------------------
   * Hộp thoại riêng (KHÔNG dùng window.prompt() mặc định của trình duyệt)
   * hỏi 1 LẦN DUY NHẤT cả "Tiết mấy" lẫn "Số lần" — để ghi liên tiếp nhiều
   * lượt GVNN trong cùng 1 tiết chỉ cần nhập 1 lần, không phải lặp lại
   * thao tác nhập Tiết nhiều lần. Trả về null nếu người dùng bấm Huỷ/Esc/
   * bấm ra ngoài; trả về {tiet, count} (số nguyên dương) nếu xác nhận.
   */
  function _showGvnnDialog() {
    return new Promise(resolve => {
      // Đóng dialog cũ và giải phóng listener trước khi tạo dialog mới.
      _cancelGvnnDialog?.();
      const backdrop = document.createElement('div');
      backdrop.id = 'v2-gvnn-dialog-backdrop';
      backdrop.className = 'v2-gvnn-backdrop';
      backdrop.innerHTML = `
        <div class="v2-gvnn-card" role="dialog" aria-modal="true" aria-labelledby="v2-gvnn-title">
          <div class="v2-gvnn-header">
            <div class="v2-gvnn-icon">🔔</div>
            <div class="v2-gvnn-title" id="v2-gvnn-title">Ghi nhận Giáo Viên Nhắc Nhở</div>
          </div>
          <div class="v2-gvnn-sub">Điểm trừ tự tăng dần theo số lần trong CÙNG 1 tiết (lần 1 −20, lần 2 −40, lần 3 −60...).</div>
          <div class="v2-gvnn-field">
            <label for="v2-gvnn-tiet">Tiết mấy?</label>
            <input type="number" id="v2-gvnn-tiet" min="1" max="20" step="1" inputmode="numeric" autocomplete="off" />
          </div>
          <div class="v2-gvnn-field">
            <label for="v2-gvnn-count">Số lần</label>
            <input type="number" id="v2-gvnn-count" min="1" max="20" step="1" value="1" inputmode="numeric" autocomplete="off" />
          </div>
          <div class="v2-gvnn-error" id="v2-gvnn-error" hidden></div>
          <div class="v2-gvnn-divider"></div>
          <div class="v2-gvnn-actions">
            <button type="button" class="v2-gvnn-btn cancel" id="v2-gvnn-cancel">Huỷ</button>
            <button type="button" class="v2-gvnn-btn confirm" id="v2-gvnn-confirm">Xác nhận</button>
          </div>
        </div>`;
      document.body.appendChild(backdrop);

      const tietInput  = backdrop.querySelector('#v2-gvnn-tiet');
      const countInput = backdrop.querySelector('#v2-gvnn-count');
      const errorEl    = backdrop.querySelector('#v2-gvnn-error');
      const cancelBtn  = backdrop.querySelector('#v2-gvnn-cancel');
      const confirmBtn = backdrop.querySelector('#v2-gvnn-confirm');

      let settled = false;
      function cleanup() {
        document.removeEventListener('keydown', onKeydown);
        if (_cancelGvnnDialog === cancelDialog) _cancelGvnnDialog = null;
        backdrop.remove();
      }
      function finish(result) {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      }
      const cancelDialog = () => finish(null);
      _cancelGvnnDialog = cancelDialog;
      function showError(msg) {        errorEl.textContent = msg;
        errorEl.hidden = false;
      }
      function submit() {
        const tiet = Number(tietInput.value);
        const count = Number(countInput.value);
        if (!Number.isFinite(tiet) || tiet <= 0) {
          showError('Vui lòng nhập số Tiết hợp lệ (VD: 3).');
          tietInput.focus();
          return;
        }
        if (!Number.isFinite(count) || count <= 0) {
          showError('Số lần phải lớn hơn 0.');
          countInput.focus();
          return;
        }
        finish({ tiet: Math.trunc(tiet), count: Math.trunc(count) });
      }
      function onKeydown(e) {
        if (e.key === 'Escape') { e.preventDefault(); finish(null); }
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
      }

      cancelBtn.addEventListener('click', () => finish(null));
      confirmBtn.addEventListener('click', submit);
      backdrop.addEventListener('click', e => { if (e.target === backdrop) finish(null); });
      document.addEventListener('keydown', onKeydown);

      setTimeout(() => tietInput.focus(), 30);
    });
  }

  /** Hiệu ứng flash nút "Thêm" + dòng vừa thêm trong panel review — tách
   *  riêng vì dùng chung giữa _stageScore() (lỗi thường) và _stageGvnn(). */
  function _flashAddFeedback() {
    const addBtn = _getRoot()?.querySelector('#v2-add-btn');
    if (addBtn && addBtn.classList) {
      addBtn.classList.remove('flash');
      // reflow để reset animation
      void addBtn.offsetWidth;
      addBtn.classList.add('flash');
      addBtn.addEventListener?.('animationend', () => addBtn.classList?.remove?.('flash'), { once: true });
    }
    // Flash item mới nhất trong review list
    setTimeout(() => {
      const firstItem = _getRoot()?.querySelector('#v2-review-list .v2-ev-item');
      if (firstItem && firstItem.classList) {
        firstItem.classList.add('flash-added');
        firstItem.addEventListener?.('animationend', () => firstItem.classList?.remove?.('flash-added'), { once: true });
      }
    }, 20);
  }

  function _getTargetIds() {
    if (_bulkScope === 'group') {
      const { rawSummaries } = getDerived();
      return rawSummaries.filter(s => s.group === _student?.group).map(s => s.id);
    }
    if (_bulkScope === 'selected') {
      return _bulkSelected.length ? _bulkSelected : [_student?.id];
    }
    return [_student?.id];
  }

  function _handleAddFromSearch() {
    if (!_ruleSearch.trim() || _isSaving || _aiApplying) return;
    const query = normalizeVi(_ruleSearch.trim());
    const selected = _selectedRule &&
      normalizeVi(_selectedRule.title) === query
      ? _selectedRule : null;
    const filtered = _filteredRules();
    const rule = selected || filtered[0];
    if (!rule) {      _notify('Không tìm thấy nội quy. Dùng “Lỗi/Thưởng đặc biệt” để nhập tự do.', 'warning');
      return;
    }
    const root = _getRoot();
    _category = rule.category;
    const catSel = root?.querySelector('#v2-category');
    if (catSel) catSel.value = rule.category;
    _syncSubjectVisibility();
    _stageScore({      title: rule.title,
      points: Number(rule.points),
      category: rule.category,
      subject: _sub()
    });    // Clear after add
    _ruleSearch = '';
    _selectedRule = null;
    const inp = root?.querySelector('#v2-rule-search');    if (inp) inp.value = '';
    root?.querySelector('#v2-add-btn')?.setAttribute('disabled', '');
    _patchSearchClear(root);
    _patchDropdown();
  }

  function _handleSpecialAdd() {    const root = _getRoot();
    const title = root?.querySelector('#v2-special-title')?.value?.trim();
    const pts = Number(root?.querySelector('#v2-special-pts')?.value);
    if (!title || !isFinite(pts) || pts === 0) return;
    _stageScore({ title, points: pts, category: _spCat(), subject: _spSub() });
    const titleInput = root?.querySelector('#v2-special-title');
    const ptsInput = root?.querySelector('#v2-special-pts');
    if (titleInput) titleInput.value = '';
    if (ptsInput) ptsInput.value = '';
    _setDrawerTool(null);
  }

  function _removeEvent(eventId) {    if (_isSaving || _aiApplying) return;
    const index = _draftEvents.findIndex(event => event.id === eventId);
    if (index < 0) return;
    const removedEvent = _draftEvents[index];
    _showUndo(removedEvent, index);    if (_isDraft(eventId)) {
      _draftEvents = _draftEvents.filter(e => e.id !== eventId);
    } else {
      const ev = _draftEvents.find(e => e.id === eventId);
      const descriptor = ev
        ? { id: ev.id, studentId: ev.studentId, week: ev.week, title: ev.title, points: ev.points }
        : { id: eventId };
      _deletedIds = [..._deletedIds.filter(d => d.id !== eventId), descriptor];
      _draftEvents = _draftEvents.filter(e => e.id !== eventId);
    }
    _patchDayTabs();
    _patchMatrix();
    _patchReviewPanel();
    _patchHistoryBadges();
    _patchFooter();
  }

  function _togglePin(rule) {
    const k = _ruleKey(rule);
    _pinnedKeys = _pinnedKeys.includes(k)
      ? _pinnedKeys.filter(x => x !== k)
      : [k, ..._pinnedKeys];
    SafeStorage.writeJSON(localStorage, PINNED_RULES_KEY, _pinnedKeys);
  }
  async function _handleSave() {
    if (_aiApplying) return;
    const draftAdditions = _draftEvents.filter(e => _isDraft(e.id));    const hasChanges = draftAdditions.length > 0 || _deletedIds.length > 0;
    if (!hasChanges) { _doClose(); return; }
    if (_isSaving) return;

    _clearUndo();
    _clearUndo();
    _isSaving = true;
    _patchFooter();    // Tách các dòng GVNN ("Giáo Viên Nhắc Nhở") ra khỏi mảng additions gộp
    // thường — điểm của chúng phải do server tính lại (luỹ tiến theo tiết),
    // không thể gửi thẳng points đã ước tính ở _stageGvnn() lên saveScoreChanges.
    const normalAdditions = draftAdditions
      .filter(e => !e._gvnn)
      .map(({ id: _id, ...ev }) => ev);
    const gvnnAdditions = draftAdditions.filter(e => e._gvnn);

    try {
      if (normalAdditions.length || _deletedIds.length) {
        await saveScoreChanges({ additions: normalAdditions, deletions: _deletedIds });
      }

      // Mỗi dòng GVNN gọi 1 request 'addGvnn' RIÊNG, TUẦN TỰ (await từng
      // cái) — occurrence do server đếm tại đúng thời điểm ghi, KHÔNG được
      // gộp/song song (xem addGvnnEvent() trong scoreboard.js). Lỗi ở 1
      // dòng KHÔNG rollback các dòng GVNN khác đã lưu thành công.
      const failedGvnn = [];
      for (const draft of gvnnAdditions) {
        const res = await addGvnnEvent({
          studentId: draft.studentId, week: draft.week,
          dayLabel: draft.dayLabel, tiet: draft.tiet,
        });
        if (!res?.ok) failedGvnn.push({ draft, error: res?.error });
      }

      if (failedGvnn.length) {
        const { rawSummaries } = getDerived();
        const detail = failedGvnn.map(f => {
          const sName = rawSummaries.find(s => s.id === f.draft.studentId)?.name || f.draft.studentId;
          return `${sName}: ${f.error || 'lỗi không rõ'}`;
        }).join('; ');
        _notify(`Còn ${failedGvnn.length} dòng GVNN chưa lưu được: ${detail}`, 'error');
      }

      // Hiện indicator "Đã lưu" trước khi đóng
      const indicator = _getRoot()?.querySelector('#v2-saved-indicator');
      if (indicator) {
        indicator.classList.add('visible');
        await new Promise(r => setTimeout(r, 700));
      }
    } catch (err) {
      // saveScoreChanges handles setState syncMessage internally
    } finally {
      _isSaving = false;
      _doClose();
    }
  }

  function _handleSaveAndClose() {
    if (_aiApplying || _isSaving) return;    if (_aiApplying || _isSaving) return;    if (!_open) return;  // đã bị đóng bởi close guard → không làm gì thêm
    const draftAdditions = _draftEvents.filter(e => _isDraft(e.id));
    const hasChanges = draftAdditions.length > 0 || _deletedIds.length > 0;
    if (!hasChanges || _isSaving) { _doClose(); return; }
    _handleSave();
  }

  function _doClose() {
    closeModal();
  }

  /* ----------------------------------------------------------
     OVERRIDE openStudent / closeModal in global scope
  ---------------------------------------------------------- */
  window.openStudent = openModal;
  window.closeModal = closeModal;
  /* ----------------------------------------------------------
     INJECT CSS
  ---------------------------------------------------------- */
  (function injectCSS() {
    if (document.getElementById('a3-modal-v2-css')) return;
    const st = document.createElement('style');
    st.id = 'a3-modal-v2-css';
    st.textContent = `
/* ================================================================
   A3K64 — Score Edit Modal v2  |  CSS redesign
   Giữ nguyên 100% class names / IDs — chỉ thay đổi visual.
*/

/* ── Root & Backdrop ─────────────────────────────────────────── */
#a3-score-modal-root {
  position: fixed; inset: 0; z-index: 8000; pointer-events: none;
}
#a3-score-modal-root:not(:empty) { pointer-events: auto; }

/* Backdrop ẩn đi — modal chiếm full app */
.v2-backdrop {
  position: fixed; inset: 0;
  display: flex; flex-direction: column;
  animation: v2FadeIn .18s ease both;
}

@keyframes v2FadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes v2PopIn {
  from { opacity: 0; transform: scale(.96) translateY(12px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

/* ── Modal shell — full viewport ─────────────────────────────── */
.v2-modal {
  width: 100%;
  height: 100%;
  max-height: 100%;
  border-radius: 0;
  border: none;
  border-top: 1px solid rgba(148, 163, 184, .10);
  background: var(--bg-modal);
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  overflow: hidden;
  animation: v2PopIn .22s cubic-bezier(.2, .9, .2, 1) both;
}
/* ── Header ──────────────────────────────────────────────────── */
.v2-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; padding: 16px 20px;
  background: linear-gradient(135deg, var(--bg-form) 0%, var(--bg-modal) 100%);
  border-bottom: 1px solid rgba(148,163,184,.1);
  flex-shrink: 0;
}

.v2-header-info {
  display: flex; align-items: center; gap: 14px; min-width: 0;
}

.v2-avatar {
  width: 44px; height: 44px; border-radius: 14px; flex-shrink: 0;
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--accent) 30%, #0e1e32),
    color-mix(in srgb, var(--accent) 12%, var(--bg-form-input)));
  border: 1.5px solid color-mix(in srgb, var(--accent) 35%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 10%, transparent);
  display: grid; place-items: center;
  font-size: 16px; font-weight: 900; color: var(--accent);
  letter-spacing: -.01em;
}

.v2-header-name {
  font-size: 18px; font-weight: 900; color: var(--text);
  letter-spacing: -.02em; line-height: 1.15;
}
.v2-header-meta {
  font-size: 11.5px; color: var(--text-muted); margin-top: 3px; font-weight: 500;
}

.v2-header-right {
  display: flex; align-items: center; gap: 14px; flex-shrink: 0;
}

/* Score chips in header */
.v2-footer-scores {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}
.v2-score-chip {
  height: 32px; padding: 0 12px; border-radius: 10px;
  font-size: 14px; font-weight: 900;
  display: inline-flex; align-items: center;
  letter-spacing: -.01em;
}
.v2-score-chip.pos {
  color: #34d399;
  border: 1px solid rgba(52,211,153,.28);
  background: rgba(16,185,129,.10);
}
.v2-score-chip.neg {
  color: #f87171;
  border: 1px solid rgba(248,113,113,.28);
  background: rgba(239,68,68,.10);
}
.v2-score-chip.total {
  color: var(--text);
  border: 1px solid rgba(148,163,184,.16);
  background: rgba(148,163,184,.06);
}
.v2-score-status {
  font-size: 13.5px; font-weight: 900; padding: 0 10px;
  height: 32px; border-radius: 10px; display: inline-flex; align-items: center;
}
.v2-score-status.good    { color: #34d399; background: rgba(16,185,129,.10); border: 1px solid rgba(52,211,153,.22); }
.v2-score-status.warning { color: #facc15; background: rgba(234,179,8,.09);  border: 1px solid rgba(234,179,8,.22);  }
.v2-score-status.orange  { color: #fb923c; background: rgba(249,115,22,.09); border: 1px solid rgba(249,115,22,.22); }
.v2-score-status.danger  { color: #f87171; background: rgba(239,68,68,.09);  border: 1px solid rgba(248,113,113,.22);}

.v2-close-btn {
  width: 38px; height: 38px; border-radius: 12px;
  border: 1px solid rgba(148,163,184,.16);
  background: rgba(148,163,184,.05);
  color: var(--text-muted); display: grid; place-items: center;
  cursor: pointer; flex-shrink: 0;
  transition: background .14s ease, color .14s ease, border-color .14s ease, transform .14s ease;
}
.v2-close-btn:hover {
  background: rgba(239,68,68,.14); color: #f87171;
  border-color: rgba(239,68,68,.3); transform: scale(1.06);
}
.v2-close-btn svg { width: 16px; height: 16px; }

/* ── Body layout (2 cột đối xứng: Cột Trái Công cụ · Cột Phải Bảng điểm) ── */
.v2-body {
  display: grid;
  grid-template-columns: minmax(360px, 44%) 6px 1fr;
  width: 100%;
  height: 100%;
  margin: 0;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
  background: var(--bg-modal);
}
/* ── Menu Bar ────────────────────────────────────────────────── */
.v2-menubar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 44px;  padding: 6px 16px;
  background: var(--bg-form);
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  flex-shrink: 0;
}.v2-menubar-left {
  display: flex;
  align-items: center;
  min-width: 0;
}
.v2-menubar-right {
  display: none;
}.v2-menu-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(148, 163, 184, 0.06);
  color: var(--text-sub);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.14s ease;
}
#v2-menu-tool-ai,
.v2-menu-btn.primary-ai {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  border: 1.5px solid color-mix(in srgb, var(--accent) 45%, var(--border-input));
  color: var(--accent);
  font-weight: 800;
}
#v2-menu-tool-rule,
#v2-menu-tool-special {
  background: rgba(148, 163, 184, 0.05);
  border: 1px solid rgba(148, 163, 184, 0.16);
  color: var(--text-sub);
}
#v2-menu-tool-bulk {
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.08);
  border: 1px dashed rgba(148, 163, 184, 0.28);
  color: var(--text-muted);
  font-size: 12px;
}
.v2-tool-tabs .v2-menu-btn:hover {
  background: color-mix(in srgb, var(--accent) 12%, rgba(148, 163, 184, 0.06));
  border-color: var(--accent);
  color: var(--accent);
}
.v2-tool-tabs .v2-menu-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.v2-tool-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  flex-shrink: 0;
  margin-bottom: 4px;
}.v2-menu-icon {
  font-size: 14px;
}
/* ── Tool Drawer ─────────────────────────────────────────────── */
.v2-tool-drawer {
  display: block !important;
  background: transparent;
  border: none;
  padding: 0;
  box-shadow: none;
}

.v2-tool-drawer-inner {
  width: 100%;
  max-width: 100%;
}
.v2-tool-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* ── Left panel ──────────────────────────────────────────────── */
.v2-left {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  overflow-y: auto;
  background: var(--bg-form);
  border-right: 1px solid rgba(148,163,184,.08);
  min-width: 0;
}
.v2-col-resizer {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 6px;
  cursor: col-resize;
  touch-action: none;
  background: rgba(148,163,184,.08);
}
.v2-col-resizer:hover,
.v2-col-resizer.dragging {
  background: color-mix(in srgb, var(--accent) 32%, transparent);
}
.v2-col-resizer-grip {
  width: 3px;
  height: 42px;
  border-radius: 999px;
  background: rgba(148,163,184,.45);
  box-shadow: -3px 0 0 rgba(148,163,184,.22), 3px 0 0 rgba(148,163,184,.22);
}
.v2-col-resizer:hover .v2-col-resizer-grip,
.v2-col-resizer.dragging .v2-col-resizer-grip {
  background: var(--accent);
}
/* Day tabs */
.v2-day-strip-head {
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  margin-bottom: -6px;
}
.v2-day-strip-hint { font-size: 10.5px; color: var(--text-muted); }

.v2-day-strip {
  display: flex; gap: 6px; align-items: center;
  flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden;
  height: 32px; flex-shrink: 0;
}

.v2-day-tab {
  flex-shrink: 0;
  height: 28px; padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--border-input);
  background: var(--bg-form-input);
  color: var(--text-muted);
  font-size: 13px; font-weight: 700;
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  transition: border-color .15s ease, color .15s ease, background .15s ease, box-shadow .15s ease;
}
.v2-day-tab:hover:not(.active) {
  border-color: color-mix(in srgb, var(--accent) 60%, var(--border-input));
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 7%, var(--bg-form-input));
}
.v2-day-tab.active {
  color: #fff; border-color: var(--accent);
  background: var(--accent);
  box-shadow:
    0 4px 18px color-mix(in srgb, var(--accent) 45%, transparent),
    inset 0 1px 0 rgba(255,255,255,.15);
}
.v2-day-label { font-size: 14px; line-height: 1; }

/* Matrix chips */
.v2-matrix-row { min-height: 22px; }
.v2-matrix-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.v2-matrix-chip {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 11px; border-radius: 10px; cursor: pointer;
  border: 1px solid rgba(148,163,184,.1);
  background: color-mix(in srgb, var(--text) 2500.0%, transparent);
  font-size: 12.5px;
  transition: background .12s ease, border-color .12s ease, transform .12s ease;
}
.v2-matrix-chip:hover  { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, rgba(255,255,255,.02)); transform: translateY(-1px); }
.v2-matrix-chip.active { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, rgba(255,255,255,.02)); }
.v2-mc-day   { font-weight: 800; color: var(--text-muted); }
.v2-mc-plus  { color: #34d399; font-weight: 900; }
.v2-mc-minus { color: #f87171; font-weight: 900; }
.v2-matrix-empty { font-size: 12.5px; color: var(--text-dim); padding: 2px 0; }

/* Section structure */
.v2-section { display: flex; flex-direction: column; gap: 9px; }
.v2-section-label {
  font-size: 15px; font-weight: 900;
  text-transform: uppercase; letter-spacing: .05em;
  color: var(--text-dim);
  display: flex; align-items: center; gap: 8px;
}

/* ── Rule search ─────────────────────────────────────────────── */
.v2-rule-search-wrap {
  display: flex; flex-direction: column; gap: 8px;
  position: relative;
}
.v2-rule-section {
  background: var(--bg-form-input);
  border: 1px solid rgba(148,163,184,.09);
  border-radius: 16px;
  padding: 14px 16px;
}
.v2-rule-section .v2-section-label { color: var(--text-muted); margin-bottom: 2px; }

.v2-subject-row {
  display: flex; gap: 7px; align-items: center; flex-wrap: wrap;
}

.v2-special-rule-row { margin-bottom: 7px; }
.v2-special-rule-row .v2-select { flex: 1; min-width: 0; }

.v2-select {
  height: 36px; padding: 0 10px;
  border-radius: 10px;
  border: 1px solid var(--border-input);
  background: var(--bg-input); color: var(--text-sub);
  font-size: 14px; font-weight: 600;
  cursor: pointer;
  transition: border-color .14s ease;
}
.v2-select:focus { outline: none; border-color: var(--accent); }
.v2-select:hover { border-color: color-mix(in srgb, var(--accent) 40%, var(--border-input)); }

.v2-count-wrap {
  display: flex; align-items: center; gap: 5px;
  padding: 0 11px; height: 36px;
  border: 1px solid var(--border-input); border-radius: 10px;
  background: var(--bg-input); flex-shrink: 0;
}
.v2-count-wrap span { font-size: 13px; font-weight: 800; color: var(--text-dim); }
.v2-count-input {
  width: 38px; border: 0; background: transparent;
  color: var(--text); font-size: 14.5px; font-weight: 700;
  text-align: center;
}
.v2-count-input:focus { outline: none; }

/* Search row */
.v2-search-row {
  display: flex; gap: 7px; align-items: center;
}
.v2-search-box {
  flex: 1; position: relative;
  display: flex; align-items: center;
}
.v2-search-icon {
  position: absolute; left: 12px;
  width: 15px; height: 15px;
  stroke: color-mix(in srgb, var(--accent) 60%, var(--text-muted));
  pointer-events: none; flex-shrink: 0;
}

.v2-rule-search-input {
  width: 100%; height: 42px;
  padding: 0 36px 0 36px;
  border: 1px solid var(--border-input);
  border-radius: 12px;
  background: var(--bg-input);
  color: var(--text); font-size: 15px; font-weight: 600;
  box-shadow: none;  transition: border-color .14s ease, box-shadow .14s ease;
}
.v2-rule-search-input::placeholder {
  color: var(--text-muted);
  font-weight: 500;
}
.v2-rule-search-input:focus {
  outline: 2px solid var(--text-muted);
  outline-offset: 2px;
  box-shadow: none;}

.v2-search-clear {
  position: absolute; right: 9px;
  width: 22px; height: 22px; border-radius: 50%;
  border: 0; background: rgba(148,163,184,.13); color: var(--text-muted);
  font-size: 16px; line-height: 1; cursor: pointer;
  display: grid; place-items: center;
  transition: background .12s ease, color .12s ease;
}
.v2-search-clear:hover { background: rgba(239,68,68,.2); color: #f87171; }

.v2-rule-pts-badge {
  flex-shrink: 0;
  align-items: center;
  padding: 4px 8px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
}
.v2-rule-pts-badge.plus { color: #059669; background: rgba(16,185,129,.12); }
.v2-rule-pts-badge.minus { color: #dc2626; background: rgba(239,68,68,.12); }

.v2-add-btn {
  height: 42px; padding: 0 18px;  border: 0; border-radius: 12px; flex-shrink: 0;
  background: var(--accent);
  color: #fff; font-size: 14.5px; font-weight: 900;  cursor: pointer; letter-spacing: .01em;
  box-shadow:
    0 4px 20px color-mix(in srgb, var(--accent) 32%, transparent),
    inset 0 1px 0 rgba(255,255,255,.14);
  transition: transform .14s ease, box-shadow .14s ease;
}
.v2-add-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 12px 32px color-mix(in srgb, var(--accent) 32%, transparent);
}
.v2-add-btn:active   { transform: scale(.97); }
.v2-add-btn:disabled { opacity: .5; cursor: not-allowed; box-shadow: none; }
/* Dropdown */
.v2-rule-dropdown {
  position: absolute; left: 0; right: 0; top: calc(100% + 6px); z-index: 100;
  background: var(--bg-input);
  border: 1px solid rgba(148,163,184,.18);
  border-radius: 14px; overflow: hidden;
  max-height: 260px; overflow-y: auto;
  box-shadow: 0 20px 56px rgba(0,0,0,.52), 0 4px 12px rgba(0,0,0,.28);
}
.v2-dd-item {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px; padding: 11px 16px;
  width: 100%; text-align: left; border: 0;
  background: transparent; cursor: pointer;
  transition: background .12s ease;
  border-bottom: 1px solid rgba(148,163,184,.05);
}
.v2-dd-item:last-child { border-bottom: 0; }
.v2-dd-item:hover { background: color-mix(in srgb, var(--text) 400.0%, transparent); }
.v2-dd-item strong { font-size: 13px; font-weight: 700; color: var(--text); }
.v2-dd-item span   { font-size: 11.5px; color: var(--text-muted); white-space: nowrap; flex-shrink: 0; }
.v2-dd-item.plus:hover  strong { color: #34d399; }
.v2-dd-item.minus:hover strong { color: #f87171; }
.v2-dd-empty { padding: 16px; font-size: 12.5px; color: var(--text-muted); text-align: center; }

/* ── Special / Lỗi khác ──────────────────────────────────────── */
.v2-special-section {
  background: var(--bg-form-input);
  border: 1px solid rgba(148,163,184,.09);
  border-radius: 16px;
  padding: 14px 16px;
}
.v2-special-section .v2-section-label { color: var(--text-muted); margin-bottom: 2px; }

.v2-special-row {
  display: flex; gap: 7px; align-items: center;
}
.v2-special-title, .v2-special-pts {
  height: 38px; padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--border-input);
  background: var(--bg-input); color: var(--text);
  font-size: 14.5px;
  transition: border-color .14s ease, box-shadow .14s ease;
}
.v2-special-title { flex: 1; min-width: 0; }
.v2-special-pts   { width: 74px; }
.v2-special-title:focus,
.v2-special-pts:focus {
  outline: none; border-color: var(--accent);
  box-shadow: 0 0 0 2.5px color-mix(in srgb, var(--accent) 14%, transparent);
}

.v2-special-add-btn {
  height: 38px; padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border-input));
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-input));
  color: var(--accent);
  font-size: 14px; font-weight: 800;
  cursor: pointer; flex-shrink: 0;
  transition: background .14s ease, border-color .14s ease, transform .14s ease;
}
.v2-special-add-btn:hover {
  background: color-mix(in srgb, var(--accent) 18%, var(--bg-input));
  border-color: var(--accent);
  transform: translateY(-1px);
}

/* ── Bulk / Phạm vi ──────────────────────────────────────────── */
.v2-bulk-section {
  gap: 8px;
  background: var(--bg-form-input);
  border: 1px solid rgba(148,163,184,.09);
  border-radius: 16px;
  padding: 14px 16px;
}
.v2-bulk-section .v2-section-label { color: var(--text-muted); }
.v2-bulk-select { min-width: 180px; }

.v2-bulk-students {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 12px;
  align-content: start;
  max-height: 160px;
  overflow-y: auto;
  padding: 6px 8px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--text) 1800.0%, transparent);
  border: 1px solid rgba(148,163,184,.08);
}
.v2-bulk-member {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  cursor: pointer;
  padding: 5px 8px;
  border-radius: 6px;
  transition: background .12s ease;
}
.v2-bulk-member:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }
.v2-bulk-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}.v2-bulk-member input[type="checkbox"] {
  appearance: none; -webkit-appearance: none;
  width: 17px; height: 17px; border-radius: 5px; flex-shrink: 0;
  border: 1.5px solid rgba(148,163,184,.28);
  background: var(--bg-input); cursor: pointer; position: relative;
  transition: background .12s ease, border-color .12s ease;
}
.v2-bulk-member input[type="checkbox"]:checked {
  background: var(--accent); border-color: var(--accent);
}
.v2-bulk-member input[type="checkbox"]:checked::after {
  content: ''; position: absolute; left: 4px; top: 1px;
  width: 5px; height: 9px; border: solid #fff;
  border-width: 0 2px 2px 0; transform: rotate(40deg);
}
.v2-bulk-member span { color: var(--text-sub); }

.v2-bulk-note {
  height: 36px; padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--border-input);
  background: var(--bg-input); color: var(--text);
  font-size: 14px;
  transition: border-color .14s ease;
}
.v2-bulk-note:focus {
  outline: none; border-color: var(--accent);
}

/* ── Bảng điểm lịch sử — dạng bảng, scroll độc lập ── */

.v2-middle {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 20px;
  overflow: hidden;
  min-height: 0;
  background: var(--bg-modal);
}
.v2-history-head {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  flex-shrink: 0;
}
.v2-history-title {
  font-size: 15px; font-weight: 900; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: .06em;
  white-space: nowrap;
}
/* Badge [+Cộng] [-Trừ] [Tổng] của phạm vi đang xem — góc phải header,
   thay cho badge điểm từng tab thứ (đã bỏ). */
.v2-history-badges {
  display: flex; align-items: center; gap: 6px;
  flex-wrap: nowrap;
}
.v2-history-badge {
  font-size: 12px; font-weight: 900;
  padding: 3px 9px; border-radius: 999px;
  white-space: nowrap;
  border: 1px solid transparent;
}
.v2-history-badge.pos {
  color: #34d399;
  background: rgba(16,185,129,.12);
  border-color: rgba(52,211,153,.25);
}
.v2-history-badge.neg {
  color: #f87171;
  background: rgba(239,68,68,.12);
  border-color: rgba(248,113,113,.25);
}
.v2-history-badge.total {
  color: var(--text);
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
}
.v2-history-badge.total.neg {
  color: #fecaca;
  background: rgba(239,68,68,.16);
  border-color: rgba(248,113,113,.32);
}

.v2-review-list {
  flex: 1 1 0;
  min-height: 0;  overflow-y: auto;
  border-radius: 12px;
  border: 1px solid rgba(148,163,184,.08);
}
.v2-empty-day {
  font-size: 13.5px; color: var(--text-dim);
  text-align: center; padding: 32px 16px;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}
.v2-empty-day::before {
  content: ''; display: block;
  width: 36px; height: 36px; border-radius: 10px;
  background: rgba(148,163,184,.04);
  border: 1px dashed rgba(148,163,184,.16);
  margin: 0 auto;
}

.v2-history-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 14px;
}
.v2-history-table thead th {
  position: sticky; top: 0; z-index: 1;
  text-align: left;
  font-size: 10.5px; font-weight: 900;
  text-transform: uppercase; letter-spacing: .1em;
  color: var(--text-dim);
  background: var(--bg-input);
  padding: 8px 12px;
  border-bottom: 1px solid rgba(148,163,184,.1);
}
/* Cột NGÀY: bóp nhỏ vừa đủ chứa tên thứ, căn giữa */
.v2-history-table th.v2-col-day,
.v2-history-table td.v2-ev-day {
  width: 46px;
  text-align: center;
}
/* Cột NỘI DUNG: chiếm hết khoảng trống còn lại */
.v2-history-table th.v2-col-title,
.v2-history-table td.v2-ev-title {
  width: auto;
}
/* Cột ĐIỂM: căn phải, độ rộng cố định gọn gàng */
.v2-history-table th.v2-col-pts,
.v2-history-table td.v2-ev-pts {
  width: 64px;
  text-align: right;
}
/* Cột nút xoá: căn phải, độ rộng cố định gọn gàng */
.v2-history-table th.v2-col-actions,
.v2-history-table td.v2-ev-del-cell {
  width: 40px;
  text-align: right;
}

.v2-ev-item {
  border-bottom: 1px solid rgba(148,163,184,.07);
  transition: background .12s ease;
  animation: v2EvIn .16s ease both;
}
@keyframes v2EvIn {
  from { opacity: 0; transform: translateX(6px); }
  to   { opacity: 1; transform: none; }
}
.v2-ev-item:last-child { border-bottom: 0; }
.v2-ev-item:hover { background: color-mix(in srgb, var(--text) 5%, transparent); }
.v2-ev-item.plus  { background: rgba(5,150,105,.12);  border-left: 3px solid rgba(5,150,105,.45); }
.v2-ev-item.minus { background: rgba(225,40,81,.11);   border-left: 3px solid rgba(225,40,81,.40); }
.v2-ev-item.draft { box-shadow: inset 2px 0 0 var(--accent); }

.v2-ev-title {
  padding: 9px 12px;
  font-size: 14px; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  line-height: 1.4;
}
.v2-ev-item.plus  .v2-ev-title { color: #059669; font-weight: 500; }
.v2-ev-item.minus .v2-ev-title { color: #e12851; font-weight: 500; }
.v2-ev-pts {
  padding: 9px 12px;
  font-size: 15px; font-weight: 900; white-space: nowrap;
}
.v2-ev-item.plus  .v2-ev-pts { color: #059669; }
.v2-ev-item.minus .v2-ev-pts { color: #e12851; }
/* Cột ngày (tab Tất cả) */
.v2-ev-day {
  padding: 9px 4px;
  font-size: 12px; font-weight: 800; white-space: nowrap;
}
.v2-ev-item.plus  .v2-ev-day { color: rgba(5,150,105,.85); }
.v2-ev-item.minus .v2-ev-day { color: rgba(225,40,81,.85); }
/* Tab Tất cả */
.v2-day-tab--all { border-radius: 9px; min-width: 62px; }

.v2-ev-del-cell { padding: 6px 10px 6px 0; }
.v2-ev-del {
  width: 26px; height: 26px; border-radius: 7px;
  border: 0; flex-shrink: 0;
  background: color-mix(in srgb, var(--text) 300.0%, transparent); color: var(--text-dim);
  cursor: pointer; display: inline-grid; place-items: center;
  transition: background .12s ease, color .12s ease, transform .12s ease;
}
.v2-ev-del:hover    { background: rgba(239,68,68,.18); color: #f87171; transform: scale(1.1); }
.v2-ev-del:disabled { opacity: .28; cursor: not-allowed; }
.v2-ev-del svg      { width: 12px; height: 12px; }

/* ── Footer ──────────────────────────────────────────────────── */
.v2-footer {
  padding: 8px 16px;
  background: var(--bg-form);
  border-top: 1px solid rgba(148,163,184,.09);
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px;
  flex-shrink: 0;
}.v2-footer-left {
  display: flex; align-items: center; gap: 10px;
  font-size: 13px; color: var(--text-dim);
}
.v2-footer-hint {
  font-size: 12.5px; color: var(--text-dim);
}
/* Save indicator (auto-saved chip) */
.v2-saved-indicator {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 700;
  color: #34d399;
  opacity: 0; transform: translateY(4px);
  transition: opacity .3s ease, transform .3s ease;
  pointer-events: none;
}
.v2-saved-indicator:not(.visible) {
  display: none;
}
.v2-saved-indicator.visible {
  opacity: 1; transform: translateY(0);
}.v2-saved-indicator svg { width: 14px; height: 14px; flex-shrink: 0; }

.v2-save-btn {
  height: 38px; min-width: 130px; padding: 0 18px;
  border-radius: 10px;
  background: rgba(148,163,184,.05);
  border: 1px solid rgba(148,163,184,.12);
  color: var(--text-muted);
  font-size: 13.5px; font-weight: 900; letter-spacing: .01em;
  cursor: pointer;
  transition: background .15s ease, color .15s ease, box-shadow .15s ease, transform .15s ease;
}.v2-save-btn:hover:not(:disabled):not(.has-changes) {
  background: rgba(148,163,184,.1);
  color: var(--text-muted);
  border-color: rgba(148,163,184,.22);
}
.v2-save-btn.has-changes {
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 62%, #050d1c));
  color: #fff; border-color: transparent;
  box-shadow:
    0 4px 22px color-mix(in srgb, var(--accent) 38%, transparent),
    inset 0 1px 0 rgba(255,255,255,.16);
  animation: v2SavePulse 2.2s ease-in-out infinite;
}
@keyframes v2SavePulse {
  0%, 100% { box-shadow: 0 4px 22px color-mix(in srgb, var(--accent) 38%, transparent), inset 0 1px 0 rgba(255,255,255,.16); }
  50%       { box-shadow: 0 8px 36px color-mix(in srgb, var(--accent) 55%, transparent), inset 0 1px 0 rgba(255,255,255,.16); }
}
.v2-save-btn.has-changes:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 40px color-mix(in srgb, var(--accent) 32%, transparent);
  animation: none;
}
.v2-save-btn:active   { transform: scale(.98); animation: none; }
.v2-save-btn:disabled { opacity: .48; cursor: not-allowed; animation: none; }

/* ── Add feedback flash ──────────────────────────────────────── */
@keyframes v2AddFlash {
  0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 60%, transparent); }
  40%  { box-shadow: 0 0 0 8px color-mix(in srgb, var(--accent) 0%, transparent); }
  100% { box-shadow: 0 0 0 0 transparent; }
}
.v2-add-btn.flash {
  animation: v2AddFlash .45s ease both;
}
/* Review list entry flash khi add thành công */
@keyframes v2ItemFlash {
  0%   { background: color-mix(in srgb, var(--accent) 22%, transparent); }
  100% { background: transparent; }
}
.v2-ev-item.flash-added {
  animation: v2ItemFlash .55s ease both;
}

/* ═══════════════════════════════════════════════════════════════════
   MOBILE (<=767px) — layout 1 cột gọn gàng
   ═══════════════════════════════════════════════════════════════════ */
@media (max-width: 767px) {

  /* ── Modal shell ── */
  .v2-modal { grid-template-rows: auto auto 1fr auto; }
  /* ── Menu Bar on Mobile ── */
  .v2-menubar {
    flex-wrap: wrap;
    padding: 6px 10px;
    gap: 6px;
  }
  .v2-menubar-left {
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .v2-menubar-right {
    display: none;
  }
  .v2-tool-tabs {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .v2-menu-btn {    height: 28px;
    padding: 0 8px;
    font-size: 11.5px;
  }

  /* ── Header: rút gọn, tên xuống dòng nếu dài, chip điểm wrap ── */
  .v2-header { padding: 10px 12px; gap: 10px; }
  .v2-avatar { width: 38px; height: 38px; font-size: 14px; border-radius: 11px; }
  .v2-header-name { font-size: 15.5px; line-height: 1.2; }
  .v2-header-meta { font-size: 10.5px; }
  .v2-header-right { gap: 8px; }
  .v2-footer-scores { gap: 4px; }
  .v2-score-chip, .v2-score-status { height: 26px; padding: 0 8px; font-size: 11px; border-radius: 8px; }
  .v2-close-btn { width: 32px; height: 32px; border-radius: 10px; }
  .v2-close-btn svg { width: 14px; height: 14px; }

  /* ── Body, Tool drawer & Middle ── */
  .v2-body {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    height: 100%;
    padding: 8px 10px;
    gap: 8px;
  }
  .v2-col-resizer { display: none; }
  .v2-tool-drawer { padding: 10px 12px; border-radius: 10px; }
  .v2-middle { padding: 12px 12px; border-radius: 10px; }

  /* ── Section chung: bo nhỏ lại, đỡ tốn diện tích ── */
  .v2-section-label { font-size: 12.5px; }

  /* Input/select: font-size 16px để iOS không tự động zoom khi focus */
  .v2-select, .v2-rule-search-input, .v2-special-title, .v2-special-pts,
  .v2-bulk-note, .v2-count-input {
    font-size: 16px;
  }
  .v2-select { height: 40px; }
  .v2-rule-search-input { height: 44px; }
  .v2-add-btn { height: 44px; padding: 0 16px; }
  .v2-special-title, .v2-special-pts, .v2-special-add-btn { height: 42px; }
  .v2-subject-row { gap: 6px; }
  .v2-select { flex: 1; min-width: 0; }

  /* Ngày: strip cuộn ngang, chip to hơn cho ngón tay */
  .v2-day-strip { gap: 5px; }
  .v2-day-tab { height: 38px; min-width: 48px; padding: 0 11px; font-size: 13px; }

  /* Bulk students list: giới hạn chiều cao nhỏ hơn trên mobile */
  .v2-bulk-students { grid-template-columns: 1fr; max-height: 120px; }

  .v2-review-list { -webkit-overflow-scrolling: touch; }
  .v2-history-title { font-size: 12.5px; }
  .v2-history-table { font-size: 13px; }
  .v2-ev-title, .v2-ev-pts, .v2-ev-day { padding-top: 11px; padding-bottom: 11px; }
  .v2-ev-del { width: 30px; height: 30px; }

  /* ── Footer: nút Lưu chiếm hết bề ngang, dễ bấm bằng ngón cái ── */
  .v2-footer { padding: 10px 12px; gap: 8px; }
  .v2-footer-left { gap: 6px; }
  .v2-footer-hint { display: none; }
  .v2-saved-indicator { font-size: 12px; }
  .v2-save-btn { flex: 1; min-width: 0; height: 46px; font-size: 14.5px; }
}

/* Màn rất nhỏ (<=380px): thu gọn thêm chút nữa */
@media (max-width: 380px) {
  .v2-header-name { font-size: 14.5px; }
  .v2-score-chip, .v2-score-status { font-size: 10px; padding: 0 6px; }
}
/* ================================================================
   AI ASSISTANT — Trợ lý AI sửa/chấm nhanh
*/
.v2-ai-box {
  background: var(--bg-form-input);
  border: 1px solid rgba(148,163,184,.12);
  border-radius: 12px;
  padding: 8px 12px;
  margin-bottom: 0;
  flex-shrink: 0;
}
.v2-ai-title {
  font-size: 12px; font-weight: 800;
  text-transform: uppercase; letter-spacing: .05em;
  color: var(--text-muted); margin-bottom: 6px;
}
.v2-ai-textarea {
  width: 100%; min-height: 42px; height: 42px; max-height: 80px;
  padding: 6px 10px;
  border: 1.5px solid color-mix(in srgb, var(--accent) 35%, var(--border-input));
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 5%, var(--bg-input));
  color: var(--text); font-size: 12.5px; font-weight: 500;
  line-height: 1.5; resize: vertical;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 6%, transparent);
  transition: border-color .14s ease, box-shadow .14s ease;
  font-family: inherit;
}
.v2-ai-textarea::placeholder {
  color: color-mix(in srgb, var(--accent) 40%, var(--text-muted));
}
.v2-ai-textarea:focus {
  outline: none; border-color: var(--accent);
  box-shadow: 0 0 0 3.5px color-mix(in srgb, var(--accent) 16%, transparent);
}
.v2-ai-actions {
  display: flex; align-items: center; gap: 8px; margin-top: 6px;
}
.v2-ai-btn {
  height: 30px; padding: 0 12px;
  border-radius: 8px; font-size: 12px; font-weight: 800;
  cursor: pointer; border: 0; transition: transform .12s ease, box-shadow .12s ease;
}
.v2-ai-btn.primary {
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 60%, #050d1c));
  color: #fff;
  box-shadow: 0 3px 14px color-mix(in srgb, var(--accent) 30%, transparent);
}
.v2-ai-btn.primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px color-mix(in srgb, var(--accent) 35%, transparent);
}
.v2-ai-btn.primary:disabled { opacity: .4; cursor: not-allowed; }
.v2-ai-btn.secondary {
  background: rgba(148,163,184,.12); color: var(--text-sub);
  border: 1px solid rgba(148,163,184,.18);
}
.v2-ai-btn.secondary:hover { background: rgba(148,163,184,.18); }.v2-ai-error {
  margin-top: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.25);
  color: #ef4444;
  line-height: 1.35;
}
.v2-ai-preview {
  margin-top: 10px; padding-top: 10px;
  border-top: 1px solid rgba(148,163,184,.1);
  animation: v2FadeIn .15s ease both;
}
.v2-ai-preview-list { display: flex; flex-direction: column; gap: 6px; }
.v2-ai-op-item {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 8px 10px;
  background: rgba(148,163,184,.04);
  border: 1px solid rgba(148,163,184,.08);
  border-radius: 10px;
  cursor: pointer; transition: background .12s ease, border-color .12s ease;
}
.v2-ai-op-item:hover { background: rgba(148,163,184,.08); border-color: rgba(148,163,184,.16); }
.v2-ai-op-chk { width: 18px; height: 18px; flex-shrink: 0; margin-top: 2px; accent-color: var(--accent); }
.v2-ai-badge {
  font-size: 11px; font-weight: 900; padding: 2px 7px; border-radius: 5px;
  white-space: nowrap; flex-shrink: 0;
}
.v2-ai-badge.add { color: #34d399; background: rgba(16,185,129,.14); border: 1px solid rgba(52,211,153,.25); }
.v2-ai-badge.update { color: #fbbf24; background: rgba(251,191,36,.14); border: 1px solid rgba(251,191,36,.25); }
.v2-ai-badge.delete { color: #f87171; background: rgba(239,68,68,.14); border: 1px solid rgba(248,113,113,.25); }
.v2-ai-op-detail { flex: 1; min-width: 0; }
.v2-ai-op-main { font-size: 13px; font-weight: 600; color: var(--text); line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.v2-ai-op-meta { font-size: 11px; color: var(--text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.v2-ai-preview-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
.v2-ai-empty { font-size: 12.5px; color: var(--text-muted); text-align: center; padding: 16px; }

/* Mobile adjustments */
@media (max-width: 767px) {
  .v2-ai-box { padding: 10px 12px; border-radius: 12px; }
  .v2-ai-textarea { font-size: 16px; min-height: 60px; } /* prevent iOS zoom */
  .v2-ai-btn { height: 40px; padding: 0 14px; font-size: 13px; }
  .v2-ai-op-main { font-size: 12.5px; }
  .v2-ai-op-meta { font-size: 10.5px; }
}

/* ================================================================
   AI ASSISTANT — Trợ lý AI sửa/chấm nhanh
*/
.v2-ai-box {
  background: var(--bg-form-input);
  border: 1px solid rgba(148,163,184,.12);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 10px;
  flex-shrink: 0;
}
.v2-ai-title {
  font-size: 13px; font-weight: 800;
  text-transform: uppercase; letter-spacing: .05em;
  color: var(--text-muted); margin-bottom: 8px;
}
.v2-ai-textarea {
  width: 100%; min-height: 56px; max-height: 120px;
  padding: 10px 12px;
  border: 1.5px solid color-mix(in srgb, var(--accent) 35%, var(--border-input));
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 5%, var(--bg-input));
  color: var(--text); font-size: 14px; font-weight: 500;
  line-height: 1.5; resize: vertical;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 6%, transparent);
  transition: border-color .14s ease, box-shadow .14s ease;
  font-family: inherit;
}
.v2-ai-textarea::placeholder {
  color: color-mix(in srgb, var(--accent) 40%, var(--text-muted));
}
.v2-ai-textarea:focus {
  outline: none; border-color: var(--accent);
  box-shadow: 0 0 0 3.5px color-mix(in srgb, var(--accent) 16%, transparent);
}
.v2-ai-actions {
  display: flex; align-items: center; gap: 8px; margin-top: 8px;
}
.v2-ai-btn {
  height: 36px; padding: 0 16px;
  border-radius: 9px; font-size: 13.5px; font-weight: 800;
  cursor: pointer; border: 0; transition: transform .12s ease, box-shadow .12s ease;
}
.v2-ai-btn.primary {
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 60%, #050d1c));
  color: #fff;
  box-shadow: 0 3px 14px color-mix(in srgb, var(--accent) 30%, transparent);
}
.v2-ai-btn.primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px color-mix(in srgb, var(--accent) 35%, transparent);
}
.v2-ai-btn.primary:disabled { opacity: .4; cursor: not-allowed; }
.v2-ai-btn.secondary {
  background: rgba(148,163,184,.12); color: var(--text-sub);
  border: 1px solid rgba(148,163,184,.18);
}
.v2-ai-btn.secondary:hover { background: rgba(148,163,184,.18); }

.v2-ai-preview {
  margin-top: 10px; padding-top: 10px;
  border-top: 1px solid rgba(148,163,184,.1);
  animation: v2FadeIn .15s ease both;
}
.v2-ai-preview-list { display: flex; flex-direction: column; gap: 6px; }
.v2-ai-op-item {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 8px 10px;
  background: rgba(148,163,184,.04);
  border: 1px solid rgba(148,163,184,.08);
  border-radius: 10px;
  cursor: pointer; transition: background .12s ease, border-color .12s ease;
}
.v2-ai-op-item:hover { background: rgba(148,163,184,.08); border-color: rgba(148,163,184,.16); }
.v2-ai-op-chk { width: 18px; height: 18px; flex-shrink: 0; margin-top: 2px; accent-color: var(--accent); }
.v2-ai-badge {
  font-size: 11px; font-weight: 900; padding: 2px 7px; border-radius: 5px;
  white-space: nowrap; flex-shrink: 0;
}
.v2-ai-badge.add { color: #34d399; background: rgba(16,185,129,.14); border: 1px solid rgba(52,211,153,.25); }
.v2-ai-badge.update { color: #fbbf24; background: rgba(251,191,36,.14); border: 1px solid rgba(251,191,36,.25); }
.v2-ai-badge.delete { color: #f87171; background: rgba(239,68,68,.14); border: 1px solid rgba(248,113,113,.25); }
.v2-ai-op-detail { flex: 1; min-width: 0; }
.v2-ai-op-main { font-size: 13px; font-weight: 600; color: var(--text); line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.v2-ai-op-meta { font-size: 11px; color: var(--text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.v2-ai-preview-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
.v2-ai-empty { font-size: 12.5px; color: var(--text-muted); text-align: center; padding: 16px; }

/* Mobile adjustments */
@media (max-width: 767px) {
  .v2-ai-box { padding: 10px 12px; border-radius: 12px; }
  .v2-ai-textarea { font-size: 16px; min-height: 60px; } /* prevent iOS zoom */
  .v2-ai-btn { height: 40px; padding: 0 14px; font-size: 13px; }
  .v2-ai-op-main { font-size: 12.5px; }
  .v2-ai-op-meta { font-size: 10.5px; }
}

/* ================================================================
   GVNN PROMPT — hộp thoại riêng hỏi "Tiết mấy? / Mấy lần?" khi chọn
   lỗi "Giáo Viên Nhắc Nhở", thay cho window.prompt() mặc định của
   trình duyệt. Nổi TRÊN modal chấm điểm (z-index cao hơn #a3-score-
   modal-root) vì được mở trong lúc modal chấm điểm đang mở.
*/
.v2-gvnn-backdrop {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(2, 6, 14, .72);
  backdrop-filter: blur(8px) saturate(1.4);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  animation: v2FadeIn .18s ease both;
}
.v2-gvnn-card {
  width: 100%; max-width: 360px;
  background: linear-gradient(160deg, #111f33 0%, #0c1826 100%);
  border: 1px solid rgba(148,163,184,.14);
  border-top-color: rgba(148,163,184,.26);
  border-radius: 22px;
  padding: 24px 24px 20px;
  box-shadow:
    0 0 0 1px rgba(0,0,0,.5),
    0 24px 64px rgba(0,0,0,.6),
    0 4px 16px rgba(0,0,0,.35);
  animation: v2PopIn .22s cubic-bezier(.2, .9, .2, 1) both;
}

/* ── Header: icon + title ── */
.v2-gvnn-header {
  display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px;
}
.v2-gvnn-icon {
  flex-shrink: 0;
  width: 36px; height: 36px; border-radius: 10px;
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--accent) 32%, transparent),
    color-mix(in srgb, var(--accent) 14%, transparent));
  border: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
  display: flex; align-items: center; justify-content: center;
  font-size: 16px;
}
/* FIX typography: tiêu đề gọn, nhẹ hơn, letter-spacing rộng hơn chút */
.v2-gvnn-title {
  font-size: 14.5px; font-weight: 700; color: #e2e8f0;
  letter-spacing: -.01em; line-height: 1.4;
  padding-top: 2px;
}

/* FIX contrast: sub-text dùng màu sáng hơn (#94a3b8 → #a8b8cc) */
.v2-gvnn-sub {
  font-size: 12px; color: #a8b8cc;
  line-height: 1.65; margin-bottom: 20px;
  padding: 10px 13px;
  background: rgba(148,163,184,.07);
  border-left: 2px solid color-mix(in srgb, var(--accent) 60%, transparent);
  border-radius: 0 8px 8px 0;
  letter-spacing: .01em;
}

/* ── Fields ── */
.v2-gvnn-field {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; margin-bottom: 11px;
}
/* FIX typography: label nhẹ hơn, tracking rõ hơn */
.v2-gvnn-field label {
  font-size: 13px; font-weight: 500; color: #cbd5e1;
  letter-spacing: .005em; line-height: 1.5;
}
/* FIX input consistency: cả 2 ô dùng chung style, bỏ spinner mặc định */
.v2-gvnn-field input {
  width: 96px; height: 42px; text-align: center;
  border: 1.5px solid rgba(148,163,184,.22);
  border-radius: 12px;
  background: rgba(255,255,255,.05);
  color: #f1f5f9;
  font-size: 16px; font-weight: 700;
  letter-spacing: -.01em;
  transition: border-color .15s, box-shadow .15s, background .15s;
  /* Ẩn spinner để 2 input trông giống nhau trên mọi trình duyệt */
  -moz-appearance: textfield;
  appearance: textfield;
}
.v2-gvnn-field input::-webkit-outer-spin-button,
.v2-gvnn-field input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.v2-gvnn-field input:hover {
  border-color: rgba(148,163,184,.36);
  background: rgba(255,255,255,.07);
}
.v2-gvnn-field input:focus {
  outline: none;
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 7%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
}

.v2-gvnn-divider {
  height: 1px;
  background: rgba(148,163,184,.09);
  margin: 16px -24px 16px;
}

/* FIX error: dùng display:none khi hidden thay vì để box rỗng hiện ra */
.v2-gvnn-error {
  font-size: 12px; font-weight: 600; color: #fca5a5;
  display: none; align-items: center; gap: 6px;
  margin: -4px 0 12px;
  padding: 9px 13px;
  background: rgba(248,113,113,.1);
  border: 1px solid rgba(248,113,113,.25);
  border-radius: 10px;
  line-height: 1.5;
}
.v2-gvnn-error:not([hidden]) { display: flex; }

/* ── Actions ── */
.v2-gvnn-actions {
  display: flex; gap: 10px;
}
.v2-gvnn-btn {
  flex: 1; height: 44px; border-radius: 13px;
  font-size: 13.5px; font-weight: 600; cursor: pointer;
  border: 1.5px solid transparent;
  transition: transform .12s ease, filter .12s ease, background .15s, box-shadow .15s;
  letter-spacing: .01em;
}
.v2-gvnn-btn:active { transform: scale(.96); }

/* FIX contrast: nút Huỷ dùng màu chữ sáng hơn (#cbd5e1) đạt WCAG AA */
.v2-gvnn-btn.cancel {
  background: rgba(148,163,184,.1);
  border-color: rgba(148,163,184,.18);
  color: #cbd5e1;
}
.v2-gvnn-btn.cancel:hover {
  background: rgba(148,163,184,.18);
  border-color: rgba(148,163,184,.28);
  color: #e2e8f0;
}
.v2-gvnn-btn.confirm {
  background: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 75%, white);
  color: #fff;
  font-weight: 700;
  box-shadow: 0 4px 14px color-mix(in srgb, var(--accent) 38%, transparent);
}
.v2-gvnn-btn.confirm:hover {
  filter: brightness(1.1);
  box-shadow: 0 6px 20px color-mix(in srgb, var(--accent) 48%, transparent);
}
    `;
    st.textContent += `
/* Persistent tools and inline rule suggestions */
.v2-scope-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-dim);
  font-size: 13px;
  font-weight: 700;
}
.v2-bulk-select { min-width: 0; }
.v2-manual-links {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
}
.v2-link-btn {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.v2-link-btn:hover { text-decoration: underline; }
.v2-link-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
#v2-panel-special { margin-top: 10px; }
.v2-ai-preview-title {
  margin-bottom: 8px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 800;
}.v2-ai-preview {
  padding: 12px;
  border: 1px solid var(--border-input);
  border-radius: 12px;
  background: var(--bg-form-input);
}
.v2-tool-drawer-inner {  display: flex;
  flex-direction: column;
  gap: 12px;
}
.v2-tool-drawer,
.v2-tool-panel {
  min-width: 0;
}
.v2-secondary-tools,
.v2-ai-examples {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.v2-secondary-tools .v2-menu-btn {
  min-height: 36px;
  height: auto;
  padding: 8px 10px;
}
.v2-rule-section {
  padding: 12px;
}
#v2-rule-dropdown {
  position: static;
  width: 100%;
  max-height: none;
  overflow: visible;
  box-shadow: none;
}
#v2-rule-dropdown .v2-dd-item {
  width: 100%;
  min-height: 44px;
  text-align: left;
  white-space: normal;
}
#v2-rule-dropdown .v2-dd-item strong {
  white-space: normal;
  overflow-wrap: anywhere;
}
.v2-ai-textarea {
  min-height: 84px;
  height: 96px;
  max-height: 240px;
}
.v2-ai-textarea::placeholder {
  opacity: .55;
}
.v2-ai-examples {
  margin-top: 8px;
}
.v2-example-chip,
.v2-day-total,
.v2-undo-btn {
  border: 1px solid var(--border-input);
  border-radius: 8px;
  background: var(--bg-form-input);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  padding: 7px 10px;
}
.v2-example-chip:hover,
.v2-day-total:hover,
.v2-day-total.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--bg-form-input));
}
.v2-example-chip:focus-visible,
.v2-day-total:focus-visible,
.v2-undo-btn:focus-visible,
.v2-ev-del:focus-visible,
.v2-dd-item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.v2-ai-preview-note {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}
.v2-ai-op-main,
.v2-ai-op-meta {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  overflow-wrap: anywhere;
  line-height: 1.5;
}
.v2-ai-op-item {
  flex-wrap: wrap;
}
.v2-ai-op-detail {
  flex-basis: 180px;
}
#v2-col-right {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
#v2-review-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
.v2-day-summary-strip {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 0;
  border-top: 1px solid var(--border-input);
  background: var(--bg-form);
}
.v2-day-total.active {
  color: var(--accent);
}
.v2-day-total-zero {
  opacity: 0.55;
}
.v2-ev-del {
  width: 30px;
  height: 30px;
  background: transparent;
  color: var(--text-dim);
  border: none;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.v2-ev-del:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  transform: none;
}.v2-undo-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex: 0 0 auto;
  padding: 10px 12px;
  border: 1px solid rgba(239,68,68,.25);
  border-radius: 10px;
  background: var(--bg-form-input);
  color: var(--text);
  font-size: 13px;
}
.v2-undo-banner span {
  overflow-wrap: anywhere;
  min-width: 0;
}
.v2-undo-btn {
  flex-shrink: 0;
  font-weight: 700;
  color: var(--accent);
}
.v2-save-btn[hidden],
.v2-day-summary-strip[hidden],
.v2-undo-banner[hidden] {
  display: none;
}
@media (max-width: 767px) {
  .v2-left {
    flex: 0 0 auto;
    overflow: visible;
  }
  #v2-col-right {
    flex: 0 0 auto;
    min-height: 240px;
  }
  #v2-review-list {
    max-height: 50vh;
  }
  .v2-ai-textarea {
    min-height: 84px;
    font-size: 16px;
  }
  .v2-footer-hint {
    display: inline;
    font-size: 11px;
  }
  .v2-header {
    flex-wrap: wrap;
  }
  .v2-header-right {
    min-width: 0;
    max-width: 100%;
  }
  .v2-example-chip,
  .v2-day-total,
  .v2-undo-btn {
    min-height: 36px;
  }
}
`;

    st.textContent += `
/* Persistent tools and inline rule suggestions */
.v2-tool-drawer-inner {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.v2-tool-drawer,
.v2-tool-panel {
  min-width: 0;
}
.v2-secondary-tools,
.v2-ai-examples {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.v2-secondary-tools .v2-menu-btn {
  min-height: 36px;
  height: auto;
  padding: 8px 10px;
}
.v2-rule-section {
  padding: 12px;
}
#v2-rule-dropdown {
  position: static;
  width: 100%;
  max-height: none;
  overflow: visible;
  box-shadow: none;
}
#v2-rule-dropdown .v2-dd-item {
  width: 100%;
  min-height: 44px;
  text-align: left;
  white-space: normal;
}
#v2-rule-dropdown .v2-dd-item strong {
  white-space: normal;
  overflow-wrap: anywhere;
}
.v2-ai-textarea {
  min-height: 84px;
  height: 96px;
  max-height: 240px;
}
.v2-ai-textarea::placeholder {
  opacity: .55;
}
.v2-ai-examples {
  margin-top: 8px;
}
.v2-example-chip,
.v2-day-total,
.v2-undo-btn {
  border: 1px solid var(--border-input);
  border-radius: 8px;
  background: var(--bg-form-input);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  padding: 7px 10px;
}
.v2-example-chip:hover,
.v2-day-total:hover,
.v2-day-total.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--bg-form-input));
}
.v2-example-chip:focus-visible,
.v2-day-total:focus-visible,
.v2-undo-btn:focus-visible,
.v2-ev-del:focus-visible,
.v2-dd-item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.v2-ai-preview-note {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}
.v2-ai-op-main,
.v2-ai-op-meta {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  overflow-wrap: anywhere;
  line-height: 1.5;
}
.v2-ai-op-item {
  flex-wrap: wrap;
}
.v2-ai-op-detail {
  flex-basis: 180px;
}
#v2-col-right {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
#v2-review-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
.v2-day-summary-strip {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 0;
  border-top: 1px solid var(--border-input);
  background: var(--bg-form);
}
.v2-day-total.active {
  color: var(--accent);
}
.v2-ev-del {
  width: 32px;
  height: 32px;
  color: #ef4444;
  border: 1px solid rgba(239,68,68,.25);
  border-radius: 8px;
  background: rgba(239,68,68,.09);
  opacity: 1;
}
.v2-ev-del:hover:not(:disabled) {
  color: #fff;
  background: #dc2626;
  border-color: #dc2626;
}
.v2-undo-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex: 0 0 auto;
  padding: 10px 12px;
  border: 1px solid rgba(239,68,68,.25);
  border-radius: 10px;
  background: var(--bg-form-input);
  color: var(--text);
  font-size: 13px;
}
.v2-undo-banner span {
  overflow-wrap: anywhere;
  min-width: 0;
}
.v2-undo-btn {
  flex-shrink: 0;
  font-weight: 700;
  color: var(--accent);
}
.v2-save-btn[hidden],
.v2-day-summary-strip[hidden],
.v2-undo-banner[hidden] {
  display: none;
}
@media (max-width: 767px) {
  .v2-left {
    flex: 0 0 auto;
    overflow: visible;
  }
  #v2-col-right {
    flex: 0 0 auto;
    min-height: 240px;
  }
  #v2-review-list {
    max-height: 50vh;
  }
  .v2-ai-textarea {
    min-height: 84px;
    font-size: 16px;
  }
  .v2-footer-hint {
    display: inline;
    font-size: 11px;
  }
  .v2-header {
    flex-wrap: wrap;
  }
  .v2-header-right {
    min-width: 0;
    max-width: 100%;
  }
  .v2-example-chip,
  .v2-day-total,
  .v2-undo-btn {
    min-height: 36px;
  }
}
`;

    st.textContent += `
/* Tier colors also apply to active and hovered day buttons. */
.v2-day-total.is-tier-tot,
.v2-score-status.is-tier-tot {
  color: #4ADE80; background: rgba(34,197,94,0.18); border-color: rgba(74,222,128,0.5);
}
.v2-day-total.is-tier-kha,
.v2-score-status.is-tier-kha {
  color: #FACC15; background: rgba(234,179,8,0.18); border-color: rgba(250,204,21,0.5);
}
.v2-day-total.is-tier-dat,
.v2-score-status.is-tier-dat {
  color: #FB923C; background: rgba(249,115,22,0.18); border-color: rgba(251,146,60,0.5);
}
.v2-day-total.is-tier-chuadat,
.v2-score-status.is-tier-chuadat {
  color: #F87171; background: rgba(239,68,68,0.18); border-color: rgba(248,113,113,0.5);
}
[data-theme="light"] .v2-day-total.is-tier-tot,
[data-theme="light"] .v2-score-status.is-tier-tot {
  color: #166534; background: #DCFCE7; border-color: #86EFAC;
}
[data-theme="light"] .v2-day-total.is-tier-kha,
[data-theme="light"] .v2-score-status.is-tier-kha {
  color: #854D0E; background: #FEF9C3; border-color: #FDE047;
}
[data-theme="light"] .v2-day-total.is-tier-dat,
[data-theme="light"] .v2-score-status.is-tier-dat {
  color: #9A3412; background: #FFEDD5; border-color: #FDBA74;
}
[data-theme="light"] .v2-day-total.is-tier-chuadat,
[data-theme="light"] .v2-score-status.is-tier-chuadat {
  color: #991B1B; background: #FEE2E2; border-color: #FCA5A5;
}
.v2-day-total-zero { opacity: 1; }
.v2-day-total.active { box-shadow: 0 0 0 2px var(--accent); }
.v2-undo-banner:empty, .v2-undo-banner[hidden] { display: none !important; }
`;
    document.head.appendChild(st);
  })();

  /* ----------------------------------------------------------
     ENSURE MOUNT POINT EXISTS
  ---------------------------------------------------------- */
  function _ensureMountPoint() {
    if (document.body) {
      _getRoot();
    } else if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _ensureMountPoint, { once: true });
    } else {
      console.warn('[ScoreboardModal] Cannot create mount point: document.body is unavailable.');
    }
  }
  _ensureMountPoint();

  /* Expose public API and debugging helpers */
  window.openModal = openModal;
  window.openStudent = openModal;
  window.openStudentModal = openModal;
  window.A3ScoreboardModal = { open: openModal, close: closeModal, openModal, closeModal };
  window.closeModal = closeModal;
  window.__a3ModalV2 = { openModal, closeModal, _chooseRule, _handleAddFromSearch, _filteredRules, _cat, _getRoot, _ensureMountPoint, _patchBulkStudents };
  window._getRoot = _getRoot;
  window._ensureMountPoint = _ensureMountPoint;
  window._chooseRule = _chooseRule;
  window._handleAddFromSearch = _handleAddFromSearch;
  window._filteredRules = _filteredRules;
  window._cat = _cat;
  window._patchBulkStudents = _patchBulkStudents;
  try {
    Object.defineProperty(window, '_draftEvents', {
      get: () => _draftEvents,
      set: (v) => { _draftEvents = v; },
      configurable: true
    });
    Object.defineProperty(window, '_ruleSearch', {
      get: () => _ruleSearch,
      set: (v) => { _ruleSearch = v; },
      configurable: true
    });
    Object.defineProperty(window, '_category', {
      get: () => _category,
      set: (v) => { _category = v; },
      configurable: true
    });
  } catch {}

})();

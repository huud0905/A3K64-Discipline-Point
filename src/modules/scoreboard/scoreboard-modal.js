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
   ============================================================ */

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
  let _mobTab = 'score';     // 'score'|'history' — tab đang chọn trên mobile (<=767px)
  let _subject = null;       // môn học đang chọn (null = subjects[0])
  let _category = null;      // CATEGORY.* đang chọn
  let _bulkScope = 'single'; // 'single'|'group'|'selected'
  let _bulkSelected = [];    // id[] học sinh được chọn bulk
  let _bulkNote = '';
  let _violationCount = 1;
  let _ruleSearch = '';
  let _ruleDropdownOpen = false;
  let _rules = [];
  let _pinnedKeys = [];
  let _rulesLoaded = false;
  let _isSaving = false;

  /* ----------------------------------------------------------
     HELPERS — dùng lại từ scoreboard.js (đã global)
  ---------------------------------------------------------- */
  function _sub() { return _subject || subjects[0]; }
  function _cat() { return _category || CATEGORY.STUDY; }
  function _ruleKey(r) { return `${r.title}::${r.points}::${r.category}`; }
  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function _isDraft(id) { return String(id).startsWith('draft-'); }
  function _getRoot() { return document.getElementById(MODAL_ROOT_ID); }

  function _weekEventsForStudent() {
    if (!_student) return [];
    return _draftEvents.filter(e => e.studentId === _student.id && e.week === state.week && !isSheetTotalEvent(e));
  }
  function _dayEvents(day) {
    return _weekEventsForStudent().filter(e => eventDay(e) === day);
  }
  function _totals() {
    const evs = _weekEventsForStudent();
    const plus = evs.filter(e => e.points > 0).reduce((s, e) => s + e.points, 0);
    const minus = evs.filter(e => e.points < 0).reduce((s, e) => s + e.points, 0);
    // include sheetTotal for grand total
    const grand = _draftEvents
      .filter(e => e.studentId === _student?.id && e.week === state.week)
      .reduce((s, e) => s + e.points, 0);
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
    if (!_ruleSearch) return ordered.slice(0, 16);
    const terms = normalizeVi(_ruleSearch).split(/\s+/).filter(Boolean);
    return ordered.filter(r => {
      const hay = normalizeVi(`${r.title} ${categoryLabel(r.category)} ${r.note || ''} ${Math.abs(r.points)}`);
      return terms.every(t => hay.includes(t));
    }).slice(0, 16);
  }

  /* ----------------------------------------------------------
     OPEN / CLOSE
  ---------------------------------------------------------- */
  function openModal(studentId) {
    const { rawSummaries, canEditStudent } = getDerived();
    const s = rawSummaries.find(x => x.id === studentId);
    if (!s || !canEditStudent(s)) return;

    _student = s;
    _draftEvents = state.events.filter(e => e.studentId === studentId && e.week === state.week);
    _deletedIds = [];
    _activeDay = -1;
    _mobTab = 'score';
    _subject = subjects[0];
    _category = CATEGORY.STUDY;
    _bulkScope = 'single';
    _bulkSelected = [studentId];
    _bulkNote = '';
    _violationCount = 1;
    _ruleSearch = '';
    _ruleDropdownOpen = false;
    _isSaving = false;

    // Sync pinned keys from localStorage
    _pinnedKeys = SafeStorage.readJSON(localStorage, PINNED_RULES_KEY, []);

    _open = true;
    // Tell the main app so polling is paused
    state.editingStudentId = studentId;

    _mount();

    // Load rules lazily
    if (!_rulesLoaded && !_rules.length) {
      fetchRulesFromGas().then(r => {
        _rules = r || [];
        _rulesLoaded = true;
        if (_open) _patchRulesGrid();
      }).catch(() => {
        if (_open) {
          const status = _getRoot()?.querySelector('.v2-rules-status');
          if (status) status.textContent = 'Không đọc được sheet VI_PHAM.';
        }
      });
    }
  }

  function closeModal() {
    if (!_open) return;
    _open = false;
    state.editingStudentId = null;
    const root = _getRoot();
    if (root) root.innerHTML = '';
  }

  /* ----------------------------------------------------------
     MOUNT — xây HTML một lần duy nhất khi mở modal
  ---------------------------------------------------------- */
  function _mount() {
    const root = _getRoot();
    if (!root) return;
    root.innerHTML = _buildModalHTML();
    _bindEvents();
    _patchDayTabs();
    _patchReviewPanel();
    _patchRightTitle();
    _patchFooter();
    _patchRulesGrid();
    _patchMatrix();
    _applyMobTab();
    // Focus rule search
    setTimeout(() => root.querySelector('.v2-rule-search-input')?.focus({ preventScroll: true }), 60);
  }

  /* ----------------------------------------------------------
     BUILD HTML (skeleton — static parts)
  ---------------------------------------------------------- */
  function _buildModalHTML() {
    const s = _student;
    const canCreate = !getDerived().lockedForLeader;

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
        <div class="v2-footer-scores" id="v2-footer-scores"><!-- patched --></div>
        <button type="button" class="v2-close-btn" id="v2-close-btn" title="Đóng (Esc)">
          <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </header>

    <!-- MOBILE TABS: chỉ hiện khi <=767px, ẩn hoàn toàn trên desktop -->
    <div class="v2-mobtabs" id="v2-mobtabs">
      <button type="button" class="v2-mobtab${_mobTab === 'score' ? ' active' : ''}" data-mobtab="score">
        Chấm điểm
      </button>
      <button type="button" class="v2-mobtab${_mobTab === 'history' ? ' active' : ''}" data-mobtab="history">
        Lịch sử <span class="v2-mobtab-badge" id="v2-mobtab-badge"></span>
      </button>
    </div>

    <!-- BODY -->
    <div class="v2-body" id="v2-body">

      <!-- LEFT: input area -->
      <div class="v2-left v2-mobpanel-score">

        <!-- Day tabs -->
        <div class="v2-day-strip-head">
          <span class="v2-section-label">Chọn ngày</span>
          <span class="v2-day-strip-hint">Chọn ngày để xem lịch sử</span>
        </div>
        <div class="v2-day-strip" id="v2-day-strip"><!-- patched --></div>

        <!-- Rule search -->
        <div class="v2-section v2-rule-section">
          <label class="v2-section-label">Thêm từ nội quy</label>
          <div class="v2-rule-search-wrap">
            <!-- Subject + category -->
            <div class="v2-subject-row">
              <select class="v2-select" id="v2-subject">${subjects.map(s => `<option value="${_esc(s)}"${s === _sub() ? ' selected' : ''}>${_esc(s)}</option>`).join('')}</select>
              <select class="v2-select" id="v2-category">
                <option value="HOC_TAP"${_cat() === CATEGORY.STUDY ? ' selected' : ''}>Học tập</option>
                <option value="NE_NEP"${_cat() === CATEGORY.DISCIPLINE ? ' selected' : ''}>Nề nếp</option>
                <option value="PHONG_TRAO"${_cat() === CATEGORY.MOVEMENT ? ' selected' : ''}>Phong trào</option>
              </select>
              <div class="v2-count-wrap">
                <span>×</span>
                <input type="number" class="v2-count-input" id="v2-count" min="1" step="1" value="${_violationCount}" title="Số lần vi phạm"/>
              </div>
            </div>
            <!-- Search input -->
            <div class="v2-search-row">
              <div class="v2-search-box">
                <svg class="v2-search-icon" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" width="15" height="15"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input type="text" class="v2-rule-search-input" id="v2-rule-search"
                  placeholder="Tìm nội quy hoặc nhập tự do…"
                  value="${_esc(_ruleSearch)}" autocomplete="off" spellcheck="false"/>
                ${_ruleSearch ? `<button type="button" class="v2-search-clear" id="v2-search-clear" title="Xoá">×</button>` : ''}
              </div>
              <button type="button" class="v2-add-btn" id="v2-add-btn"
                title="Thêm điểm (Enter)" ${!_ruleSearch ? 'disabled' : ''}>
                Thêm
              </button>
            </div>
            <!-- Dropdown -->
            <div class="v2-rule-dropdown" id="v2-rule-dropdown" style="display:none"></div>
          </div>
        </div>

        <!-- Special / custom -->
        <div class="v2-section v2-special-section">
          <label class="v2-section-label">Lỗi / Thưởng đặc biệt</label>
          <div class="v2-special-row">
            <input type="text" class="v2-special-title" id="v2-special-title" placeholder="Tên lỗi hoặc thưởng…"/>
            <input type="text" class="v2-special-pts" id="v2-special-pts" inputmode="numeric" placeholder="±điểm"/>
            <button type="button" class="v2-special-add-btn" id="v2-special-add-btn">Thêm</button>
          </div>
        </div>

        <!-- Bulk -->
        <div class="v2-section v2-bulk-section">
          <label class="v2-section-label">
            Phạm vi
            <select class="v2-select v2-bulk-select" id="v2-bulk-scope">
              <option value="single"${_bulkScope === 'single' ? ' selected' : ''}>Chỉ học sinh này</option>
              <option value="group"${_bulkScope === 'group' ? ' selected' : ''}>Cả tổ ${s.group}</option>
              <option value="selected"${_bulkScope === 'selected' ? ' selected' : ''}>Chọn học sinh</option>
            </select>
          </label>
          <div class="v2-bulk-students" id="v2-bulk-students" style="display:none"></div>
          <input type="text" class="v2-bulk-note" id="v2-bulk-note" placeholder="Ghi chú (tuỳ chọn)" value="${_esc(_bulkNote)}"/>
        </div>

      </div><!-- /v2-left -->

      <!-- Resizer: kéo đổi độ rộng Cột 1 (Form) / Cột 2 (Bảng kết quả) -->
      <div class="v2-col-resizer" id="v2-resizer-1" title="Kéo để đổi độ rộng cột"></div>

      <!-- MIDDLE: Nội dung chấm trong ngày đang chọn — dạng bảng, scroll độc lập -->
      <div class="v2-middle v2-mobpanel-history">
        <div class="v2-history-head">
          <span class="v2-history-title" id="v2-history-title"><!-- patched --></span>
          <div class="v2-history-badges" id="v2-history-badges"><!-- patched --></div>
        </div>

        <div class="v2-review-list" id="v2-review-list"><!-- patched --></div>
      </div><!-- /v2-middle -->

      <!-- Resizer: kéo đổi độ rộng Cột 2 (Bảng kết quả) / Cột 3 (Nội quy nhanh) -->
      <div class="v2-col-resizer" id="v2-resizer-2" title="Kéo để đổi độ rộng cột"></div>

      <!-- RIGHT: Nội quy nhanh — chiếm trọn cột phải -->
      <div class="v2-right v2-mobpanel-score">
        <div class="v2-rules-sidebar">
          <div class="v2-rules-label">Nội quy nhanh</div>
          <div class="v2-rules-status"></div>
          <div class="v2-rules-grid" id="v2-rules-grid"><!-- patched --></div>
        </div>
      </div>

    </div><!-- /v2-body -->

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
     BIND EVENTS (chỉ gọi 1 lần sau mount)
  ---------------------------------------------------------- */
  /* ----------------------------------------------------------
     RESIZABLE COLUMNS — 2 thanh kéo đổi width Cột 1|2 và Cột 2|3
     Dùng mousedown/mousemove/mouseup thuần, đo width thực tế qua
     getBoundingClientRect() tại thời điểm bắt đầu kéo (không phụ
     thuộc % hay giá trị cũ), rồi ghi thẳng px vào grid-template-columns
     của .v2-body — mượt vì không đụng tới _patch*()/render nào khác.
  ---------------------------------------------------------- */
  const V2_COL_MIN = { left: 280, mid: 300, right: 220 };
  const V2_RESIZER_W = 5; // px, khớp với CSS .v2-col-resizer width 5px

  function _bindColumnResizers() {
    const root = _getRoot();
    if (!root) return;
    const body   = root.querySelector('#v2-body');
    const leftEl = root.querySelector('.v2-left');
    const midEl  = root.querySelector('.v2-middle');
    const rightEl= root.querySelector('.v2-right');
    const r1 = root.querySelector('#v2-resizer-1');
    const r2 = root.querySelector('#v2-resizer-2');
    if (!body || !leftEl || !midEl || !rightEl || !r1 || !r2) return;

    const modalEl = root.querySelector('.v2-modal');

    function beginDrag(resizerEl, onMove) {
      resizerEl.addEventListener('mousedown', (e) => {
        // Chỉ chuột trái
        if (e.button !== 0) return;
        e.preventDefault();

        const startX = e.clientX;
        const rect = {
          left:  leftEl.getBoundingClientRect().width,
          mid:   midEl.getBoundingClientRect().width,
          right: rightEl.getBoundingClientRect().width,
        };

        resizerEl.classList.add('dragging');
        modalEl?.classList.add('v2-resizing');

        let rafId = null;
        let pendingDx = 0;

        function apply() {
          rafId = null;
          onMove(pendingDx, rect);
        }

        function onMouseMove(ev) {
          pendingDx = ev.clientX - startX;
          // Dùng requestAnimationFrame để gộp các sự kiện mousemove dồn dập
          // lại thành 1 lần cập nhật DOM mỗi frame — mượt, không bị khựng
          // khi kéo nhanh.
          if (rafId == null) rafId = requestAnimationFrame(apply);
        }
        function onMouseUp() {
          if (rafId != null) { cancelAnimationFrame(rafId); apply(); }
          resizerEl.classList.remove('dragging');
          modalEl?.classList.remove('v2-resizing');
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        }
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    }

    // Resizer 1: đổi width giữa Cột 1 (form) và Cột 2 (bảng kết quả)
    beginDrag(r1, (dx, rect) => {
      const deltaMax = rect.mid - V2_COL_MIN.mid;   // cột 2 co được tối đa
      const deltaMin = -(rect.left - V2_COL_MIN.left); // cột 1 co được tối đa
      const clamped = Math.min(deltaMax, Math.max(deltaMin, dx));
      const newLeft = rect.left + clamped;
      const newMid  = rect.mid - clamped;
      body.style.gridTemplateColumns =
        `${newLeft}px ${V2_RESIZER_W}px ${newMid}px ${V2_RESIZER_W}px 1fr`;
    });

    // Resizer 2: đổi width giữa Cột 2 (bảng kết quả) và Cột 3 (nội quy nhanh)
    beginDrag(r2, (dx, rect) => {
      const deltaMax = rect.right - V2_COL_MIN.right; // cột 3 co được tối đa
      const deltaMin = -(rect.mid - V2_COL_MIN.mid);  // cột 2 co được tối đa
      const clamped = Math.min(deltaMax, Math.max(deltaMin, dx));
      const newMid = rect.mid + clamped;
      // Cột 1 giữ nguyên độ rộng hiện tại (đo lại phòng khi đã bị đổi
      // trước đó bởi resizer 1); cột 3 = 1fr tự co giãn theo phần còn lại.
      const curLeftW = leftEl.getBoundingClientRect().width;
      body.style.gridTemplateColumns =
        `${curLeftW}px ${V2_RESIZER_W}px ${newMid}px ${V2_RESIZER_W}px 1fr`;
    });
  }

  function _bindEvents() {
    const root = _getRoot();
    if (!root) return;

    _bindColumnResizers();

    // Mobile tab switcher (Chấm điểm | Lịch sử) — vô hại trên desktop vì
    // .v2-mobtabs bị ẩn qua CSS ngoài breakpoint mobile.
    root.querySelectorAll('.v2-mobtab').forEach(btn => {
      btn.addEventListener('click', () => {
        _mobTab = btn.dataset.mobtab;
        _applyMobTab();
      });
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
        _patchSearchClear();
        _patchDropdown();
        root.querySelector('#v2-add-btn')?.toggleAttribute('disabled', !_ruleSearch.trim());
      });
      searchInput.addEventListener('focus', () => {
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
      if (searchInput) searchInput.value = '';
      _patchSearchClear();
      _patchDropdown();
      root.querySelector('#v2-add-btn')?.setAttribute('disabled', '');
      searchInput?.focus();
    });

    root.querySelector('#v2-add-btn')?.addEventListener('click', _handleAddFromSearch);

    // Subject / Category selects
    root.querySelector('#v2-subject')?.addEventListener('change', e => { _subject = e.target.value; });
    root.querySelector('#v2-category')?.addEventListener('change', e => { _category = e.target.value; });

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
      _patchBulkStudents();
    });
    root.querySelector('#v2-bulk-note')?.addEventListener('input', e => { _bulkNote = e.target.value; });

    // Save button
    root.querySelector('#v2-save-btn')?.addEventListener('click', _handleSave);

    // Close dropdown when clicking outside
    document.addEventListener('click', _onDocClick, true);
    document.addEventListener('keydown', _onDocKey);
  }

  function _unbindEvents() {
    document.removeEventListener('click', _onDocClick, true);
    document.removeEventListener('keydown', _onDocKey);
  }

  function _onDocClick(e) {
    if (!_open) { _unbindEvents(); return; }
    const root = _getRoot();
    if (!root) return;
    const dd = root.querySelector('#v2-rule-dropdown');
    if (dd && !dd.contains(e.target) && !root.querySelector('#v2-rule-search')?.contains(e.target)) {
      _ruleDropdownOpen = false;
      if (dd) dd.style.display = 'none';
    }
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

  function _patchReviewPanel() {
    const el = _getRoot()?.querySelector('#v2-review-list');
    if (!el) return;
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

  /**
   * Áp dụng tab đang chọn trên mobile (Chấm điểm | Lịch sử): toggle class
   * active trên nút tab + ẩn/hiện panel tương ứng. Không ảnh hưởng desktop
   * vì .v2-mobtabs và trạng thái ẩn panel chỉ có hiệu lực trong
   * @media (max-width: 767px).
   */
  function _applyMobTab() {
    const root = _getRoot();
    if (!root) return;
    root.querySelectorAll('.v2-mobtab').forEach(b => {
      b.classList.toggle('active', b.dataset.mobtab === _mobTab);
    });
    root.querySelectorAll('.v2-mobpanel-score').forEach(el => {
      el.classList.toggle('v2-mob-hidden', _mobTab !== 'score');
    });
    root.querySelectorAll('.v2-mobpanel-history').forEach(el => {
      el.classList.toggle('v2-mob-hidden', _mobTab !== 'history');
    });
  }

  function _patchRightTitle() {
    const el = _getRoot()?.querySelector('#v2-history-title');
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

    // Badge số dòng trên tab "Lịch sử" (mobile)
    const mobBadge = _getRoot()?.querySelector('#v2-mobtab-badge');
    if (mobBadge) mobBadge.textContent = evs.length ? String(evs.length) : '';
  }

  function _patchFooter() {
    const { plus, minus, grand } = _totals();
    const draftCount = _draftEvents.filter(e => _isDraft(e.id) && e.studentId === _student?.id).length;
    const hasChanges = draftCount > 0 || _deletedIds.length > 0;

    const scoresEl = _getRoot()?.querySelector('#v2-footer-scores');
    if (scoresEl) {
      scoresEl.innerHTML = `
        <span class="v2-score-chip pos">+${formatThousands(plus)}</span>
        <span class="v2-score-chip neg">-${formatThousands(minus)}</span>
        <span class="v2-score-chip total">${formatScore(grand)}</span>
        <span class="v2-score-status ${statusTone(_student?.status || '')}">${_student?.status || ''}</span>`;
    }

    const saveBtn = _getRoot()?.querySelector('#v2-save-btn');
    if (saveBtn) {
      saveBtn.disabled = _isSaving;
      saveBtn.className = `v2-save-btn${hasChanges ? ' has-changes' : ''}`;
      if (_isSaving) {
        saveBtn.textContent = 'Đang lưu…';
      } else if (hasChanges) {
        saveBtn.textContent = 'Lưu thay đổi';
      } else {
        saveBtn.textContent = 'Đóng';
      }
    }
  }

  function _patchRulesGrid() {
    const el = _getRoot()?.querySelector('#v2-rules-grid');
    if (!el) return;
    const rules = _orderedRules();
    if (!rules.length) {
      el.innerHTML = '<div class="v2-rules-loading">Đang tải nội quy…</div>';
      return;
    }
    el.innerHTML = rules.map(rule => {
      const pinned = _pinnedKeys.includes(_ruleKey(rule));
      const ruleJson = _esc(JSON.stringify(rule));
      const tip = _esc(rule.title);
      return `<button type="button" class="v2-rule-card ${rule.points >= 0 ? 'plus' : 'minus'}${pinned ? ' pinned' : ''}"
        data-rule="${ruleJson}" data-tip="${tip}" aria-label="${tip}">
        <span>${pinned ? '📌 ' : ''}${_esc(rule.title)}</span>
        <strong>${formatScore(rule.points)}</strong>
      </button>`;
    }).join('');
    el.querySelectorAll('.v2-rule-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const rule = JSON.parse(btn.dataset.rule);
        _chooseRule(rule);
        _stageScore({ title: rule.title, points: rule.points, category: rule.category });
      });
      btn.addEventListener('contextmenu', e => {
        e.preventDefault();
        const rule = JSON.parse(btn.dataset.rule);
        _togglePin(rule);
      });
    });
  }

  function _patchDropdown() {
    const el = _getRoot()?.querySelector('#v2-rule-dropdown');
    if (!el) return;
    if (!_ruleDropdownOpen || !_ruleSearch) { el.style.display = 'none'; return; }
    const filtered = _filteredRules();
    if (!filtered.length) {
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
        _chooseRule(rule);
        _ruleDropdownOpen = false;
        el.style.display = 'none';
      });
    });
  }

  function _patchSearchClear() {
    const root = _getRoot();
    const wrap = root?.querySelector('.v2-search-row .v2-search-box');
    if (!wrap) return;
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
        const inp = root.querySelector('#v2-rule-search');
        if (inp) inp.value = '';
        _patchSearchClear();
        _patchDropdown();
        root.querySelector('#v2-add-btn')?.setAttribute('disabled', '');
        inp?.focus();
      });
      wrap.appendChild(clearBtn);
    } else if (!_ruleSearch && clearBtn) {
      clearBtn.remove();
    }
  }

  function _patchBulkStudents() {
    const el = _getRoot()?.querySelector('#v2-bulk-students');
    if (!el) return;
    if (_bulkScope !== 'selected') { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    const { rawSummaries } = getDerived();
    const members = rawSummaries.filter(s => s.group === _student?.group);
    el.innerHTML = members.map(m => `
      <label class="v2-bulk-member">
        <input type="checkbox" class="v2-bulk-chk" data-id="${_esc(m.id)}"
          ${_bulkSelected.includes(m.id) ? 'checked' : ''}/>
        <span>${_esc(m.name)}</span>
      </label>`).join('');
    el.querySelectorAll('.v2-bulk-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        const id = chk.dataset.id;
        if (chk.checked) {
          if (!_bulkSelected.includes(id)) _bulkSelected.push(id);
        } else {
          _bulkSelected = _bulkSelected.filter(x => x !== id);
        }
      });
    });
  }

  /* ----------------------------------------------------------
     ACTIONS
  ---------------------------------------------------------- */
  function _chooseRule(rule) {
    _subject = rule.category === CATEGORY.STUDY ? (_sub()) : _sub();
    _category = rule.category;
    _ruleSearch = rule.title;
    const root = _getRoot();
    const inp = root?.querySelector('#v2-rule-search');
    if (inp) inp.value = rule.title;
    const catSel = root?.querySelector('#v2-category');
    if (catSel) catSel.value = rule.category;
    root?.querySelector('#v2-add-btn')?.removeAttribute('disabled');
    _patchSearchClear();
  }

  function _stageScore(payload, day) {
    if (_isSaving) return;
    const todayKey = (() => { const d = new Date().getDay(); return d === 0 ? 0 : d + 1; })();
    const activeDay = day ?? (_activeDay === -1 ? todayKey : _activeDay);
    const title = String(payload.title || '').trim();
    const count = Math.max(1, Math.trunc(_violationCount || 1));
    const points = payload.points * count;
    if (!title || !points) return;

    const cat = payload.category || _cat();
    const subj = _sub();

    const targetIds = _getTargetIds();
    const newDrafts = targetIds.map(studentId => makeDraftEvent({
      studentId, week: state.week,
      title: formatSavedTitle(activeDay, cat, subj, title, points),
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

    // Visual feedback: flash nút Thêm
    const addBtn = _getRoot()?.querySelector('#v2-add-btn');
    if (addBtn) {
      addBtn.classList.remove('flash');
      // reflow để reset animation
      void addBtn.offsetWidth;
      addBtn.classList.add('flash');
      addBtn.addEventListener('animationend', () => addBtn.classList.remove('flash'), { once: true });
    }
    // Flash item mới nhất trong review list
    setTimeout(() => {
      const firstItem = _getRoot()?.querySelector('#v2-review-list .v2-ev-item');
      if (firstItem) {
        firstItem.classList.add('flash-added');
        firstItem.addEventListener('animationend', () => firstItem.classList.remove('flash-added'), { once: true });
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
    if (!_ruleSearch.trim()) return;
    const root = _getRoot();
    const pts = Number(root?.querySelector('#v2-special-pts')?.value) ||
      (_filteredRules()[0]?.points ?? 0);
    const category = _cat();
    _stageScore({ title: _ruleSearch.trim(), points: pts || -1, category });
    // Clear after add
    _ruleSearch = '';
    const inp = root?.querySelector('#v2-rule-search');
    if (inp) inp.value = '';
    root?.querySelector('#v2-add-btn')?.setAttribute('disabled', '');
    _patchSearchClear();
    _patchDropdown();
  }

  function _handleSpecialAdd() {
    const root = _getRoot();
    const title = root?.querySelector('#v2-special-title')?.value?.trim();
    const pts = Number(root?.querySelector('#v2-special-pts')?.value);
    if (!title || !isFinite(pts) || pts === 0) return;
    _stageScore({ title, points: pts, category: _cat() });
    const titleInput = root?.querySelector('#v2-special-title');
    const ptsInput = root?.querySelector('#v2-special-pts');
    if (titleInput) titleInput.value = '';
    if (ptsInput) ptsInput.value = '';
  }

  function _removeEvent(eventId) {
    if (_isSaving) return;
    if (_isDraft(eventId)) {
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
    _patchRulesGrid();
  }

  async function _handleSave() {
    const draftAdditions = _draftEvents.filter(e => _isDraft(e.id));
    const hasChanges = draftAdditions.length > 0 || _deletedIds.length > 0;
    if (!hasChanges) { _doClose(); return; }
    if (_isSaving) return;

    _isSaving = true;
    _patchFooter();

    const additions = draftAdditions.map(({ id: _id, ...ev }) => ev);
    try {
      await saveScoreChanges({ additions, deletions: _deletedIds });
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
    if (!_open) return;  // đã bị đóng bởi close guard → không làm gì thêm
    const draftAdditions = _draftEvents.filter(e => _isDraft(e.id));
    const hasChanges = draftAdditions.length > 0 || _deletedIds.length > 0;
    if (!hasChanges || _isSaving) { _doClose(); return; }
    _handleSave();
  }

  function _doClose() {
    _unbindEvents();
    closeModal();
  }

  /* ----------------------------------------------------------
     OVERRIDE openStudent / closeModal in global scope
  ---------------------------------------------------------- */
  window.openStudent = openModal;
  window.closeModal = () => {
    _unbindEvents();
    closeModal();
  };

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
   ================================================================ */

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
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: none; }
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
  grid-template-rows: auto 1fr auto;
  overflow: hidden;
  animation: v2PopIn .22s cubic-bezier(.2, .9, .2, 1) both;
}

/* Tab bar "Chấm điểm | Lịch sử" — chỉ hiện trên mobile (xem @media 767px) */
.v2-mobtabs { display: none; }

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

/* ── Body grid ───────────────────────────────────────────────── */
.v2-body {
  display: grid;
  grid-template-columns: 35% 5px 40% 5px 1fr;
  overflow: hidden; min-height: 0;
}

/* Thanh kéo đổi kích thước cột — nằm giữa Cột 1|2 và Cột 2|3 */
.v2-col-resizer {
  position: relative;
  width: 100%; height: 100%;
  cursor: col-resize;
  background: transparent;
  flex-shrink: 0;
  transition: background .12s ease;
  touch-action: none;
}
.v2-col-resizer::after {
  content: '';
  position: absolute; top: 0; bottom: 0; left: 50%;
  width: 1px; transform: translateX(-50%);
  background: rgba(148,163,184,.14);
  transition: background .12s ease;
}
.v2-col-resizer:hover,
.v2-col-resizer.dragging {
  background: color-mix(in srgb, var(--accent) 35%, transparent);
}
.v2-col-resizer:hover::after,
.v2-col-resizer.dragging::after {
  background: var(--accent);
}
/* Khi đang kéo, tắt transition mượt của con trỏ/scroll để tránh giật */
.v2-modal.v2-resizing { cursor: col-resize; user-select: none; }
.v2-modal.v2-resizing .v2-left,
.v2-modal.v2-resizing .v2-middle,
.v2-modal.v2-resizing .v2-right { pointer-events: none; }

/* ── Left panel ──────────────────────────────────────────────── */
.v2-left {
  overflow-y: auto;
  padding: 18px 20px 20px 22px;
  display: flex; flex-direction: column; gap: 16px;
  border-right: 1px solid rgba(148,163,184,.08);
  background: var(--bg-modal);
}

/* Day tabs */
.v2-day-strip-head {
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  margin-bottom: -6px;
}
.v2-day-strip-hint { font-size: 10.5px; color: var(--text-muted); }

.v2-day-strip {
  display: flex; gap: 6px;
  flex-wrap: nowrap; overflow-x: auto;
  padding-bottom: 2px;
}

.v2-day-tab {
  flex-shrink: 0; min-width: 56px;
  height: 40px; padding: 0 14px;
  border-radius: 999px;
  border: 1.5px solid var(--border-input);
  background: var(--bg-form-input);
  color: var(--text-muted);
  font-size: 14px; font-weight: 800;
  cursor: pointer;
  display: flex; align-items: center; gap: 6px;
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
  border: 1.5px solid color-mix(in srgb, var(--accent) 38%, var(--border-input));
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent) 6%, var(--bg-input));
  color: var(--text); font-size: 15px; font-weight: 600;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 7%, transparent);
  transition: border-color .14s ease, box-shadow .14s ease;
}
.v2-rule-search-input::placeholder {
  color: color-mix(in srgb, var(--accent) 40%, var(--text-muted));
  font-weight: 500;
}
.v2-rule-search-input:focus {
  outline: none; border-color: var(--accent);
  box-shadow: 0 0 0 3.5px color-mix(in srgb, var(--accent) 18%, transparent);
}

.v2-search-clear {
  position: absolute; right: 9px;
  width: 22px; height: 22px; border-radius: 50%;
  border: 0; background: rgba(148,163,184,.13); color: var(--text-muted);
  font-size: 16px; line-height: 1; cursor: pointer;
  display: grid; place-items: center;
  transition: background .12s ease, color .12s ease;
}
.v2-search-clear:hover { background: rgba(239,68,68,.2); color: #f87171; }

.v2-add-btn {
  height: 42px; padding: 0 18px;
  border: 0; border-radius: 12px; flex-shrink: 0;
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 60%, #050d1c));
  color: #fff; font-size: 14.5px; font-weight: 900;
  cursor: pointer; letter-spacing: .01em;
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
.v2-add-btn:disabled { opacity: .32; cursor: not-allowed; box-shadow: none; }

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
  display: flex; flex-direction: column; gap: 2px;
  max-height: 130px; overflow-y: auto;
  padding: 5px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--text) 1800.0%, transparent);
  border: 1px solid rgba(148,163,184,.08);
}
.v2-bulk-member {
  display: flex; align-items: center; gap: 9px;
  font-size: 12.5px; cursor: pointer;
  padding: 6px 9px; border-radius: 8px;
  transition: background .12s ease;
}
.v2-bulk-member:hover { background: color-mix(in srgb, var(--text) 400.0%, transparent); }
.v2-bulk-member input[type="checkbox"] {
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

/* ── Right panel ─────────────────────────────────────────────── */
.v2-right {
  display: flex; flex-direction: column; gap: 0;
  overflow: hidden;
  background: var(--bg-deep);
  border-left: 1px solid rgba(148,163,184,.07);
  /* Chiều rộng cố định — phần còn lại cho left */
  min-width: 0;
}

/* Rules sidebar — chiếm trọn cột phải (không còn chia sẻ với review list) */
.v2-rules-sidebar {
  padding: 14px 16px 14px;
  background: var(--bg-form);
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.v2-rules-label {
  font-size: 15px; font-weight: 900;
  text-transform: uppercase; letter-spacing: .05em;
  color: var(--text-muted); margin-bottom: 8px;
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0;
}
.v2-rules-label small {
  font-size: 9.5px; color: var(--text-muted);
  text-transform: none; letter-spacing: 0; font-weight: 600;
}
.v2-rules-status { font-size: 10.5px; color: var(--text-muted); flex-shrink: 0; }

.v2-rules-grid {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 4px;
  align-content: start;
}
.v2-rules-loading {
  font-size: 11px; color: var(--text-dim); padding: 8px 4px;
}

.v2-rule-card {
  border-radius: 10px; padding: 8px 10px; cursor: pointer;
  display: flex; align-items: center;
  justify-content: space-between; gap: 5px;
  text-align: left; border-width: 1px; border-style: solid;
  min-height: 42px; min-width: 0; width: 100%; box-sizing: border-box;
  position: relative;
  transition: transform .14s ease, box-shadow .14s ease, background .14s ease;
}
.v2-rule-card:hover  { transform: translateY(-2px); }
.v2-rule-card:active { transform: scale(.97); }
.v2-rule-card:disabled { opacity: .38; cursor: not-allowed; }

.v2-rule-card.plus {
  color: #059669;
  border-color: rgba(5,150,105,.35);
  background: rgba(5,150,105,.13);
}
.v2-rule-card.plus:hover {
  background: rgba(5,150,105,.22);
  box-shadow: 0 8px 22px rgba(5,150,105,.14);
}
.v2-rule-card.minus {
  color: #e12851;
  border-color: rgba(225,40,81,.35);
  background: rgba(225,40,81,.12);
}
.v2-rule-card.minus:hover {
  background: rgba(225,40,81,.22);
  box-shadow: 0 8px 22px rgba(225,40,81,.14);
}
.v2-rule-card.pinned {
  box-shadow: 0 0 0 1.5px var(--accent),
              0 4px 16px color-mix(in srgb, var(--accent) 18%, transparent);
}
.v2-rule-card span {
  flex: 1; min-width: 0; font-size: 14px; font-weight: 500;
  white-space: normal; word-break: break-word;
  line-height: 1.3; text-align: left;
}
.v2-rule-card strong {
  font-size: 14.5px; font-weight: 700;
  white-space: nowrap; flex-shrink: 0; margin-top: 1px;
}

/* Tooltip tuỳ biến cho nút nội quy nhanh — dùng chung 1 kiểu (nền tối,
   chữ sáng) cho cả dark/light mode để luôn rõ chữ, không phụ thuộc theme */
.v2-rule-card::after {
  content: attr(data-tip);
  position: absolute;
  left: 50%; bottom: calc(100% + 9px);
  transform: translateX(-50%) translateY(4px);
  background: #0f172a;
  color: #f8fafc;
  border: 1px solid rgba(148,163,184,.25);
  padding: 6px 11px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  white-space: normal;
  width: max-content;
  max-width: 220px;
  text-align: center;
  box-shadow: 0 10px 28px rgba(0,0,0,.4);
  opacity: 0;
  pointer-events: none;
  transition: opacity .15s ease, transform .15s ease;
  z-index: 50;
}
.v2-rule-card::before {
  content: '';
  position: absolute;
  left: 50%; bottom: calc(100% + 3px);
  transform: translateX(-50%) translateY(4px);
  border: 6px solid transparent;
  border-top-color: #0f172a;
  opacity: 0;
  pointer-events: none;
  transition: opacity .15s ease, transform .15s ease;
  z-index: 50;
}
.v2-rule-card:hover::after,
.v2-rule-card:hover::before {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* ── CỘT GIỮA: Nội dung chấm trong ngày — dạng bảng, scroll độc lập ── */
.v2-middle {
  display: flex; flex-direction: column; gap: 10px;
  padding: 18px 18px 20px 18px;
  border-right: 1px solid rgba(148,163,184,.08);
  background: var(--bg-form);
  overflow: hidden; min-height: 0;
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
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
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
  padding: 12px 20px;
  background: var(--bg-form);
  border-top: 1px solid rgba(148,163,184,.09);
  display: flex; align-items: center; justify-content: space-between;
  gap: 14px;
  flex-shrink: 0;
}
.v2-footer-left {
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
.v2-saved-indicator.visible {
  opacity: 1; transform: translateY(0);
}
.v2-saved-indicator svg { width: 14px; height: 14px; flex-shrink: 0; }

.v2-save-btn {
  height: 44px; min-width: 150px; padding: 0 22px;
  border-radius: 13px;
  background: rgba(148,163,184,.05);
  border: 1px solid rgba(148,163,184,.12);
  color: var(--text-muted);
  font-size: 15px; font-weight: 900; letter-spacing: .01em;
  cursor: pointer;
  transition: background .15s ease, color .15s ease, box-shadow .15s ease, transform .15s ease;
}
.v2-save-btn:hover:not(:disabled):not(.has-changes) {
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

/* ── Responsive: tablet (901px–1024px) — vẫn giữ layout 3 cột nhưng bớt
   độ rộng cột 1 để cột giữa/phải không bị bóp quá chật ─────────────── */
@media (min-width: 901px) and (max-width: 1100px) {
  .v2-body { grid-template-columns: 30% 5px 38% 5px 1fr; }
}

/* ═══════════════════════════════════════════════════════════════════
   MOBILE (<=767px) — layout 2 tab thay vì xếp chồng 3 cột:
   • Tab "Chấm điểm": chọn ngày + thêm từ nội quy + nội quy nhanh (dạng
     chip bấm nhanh) + lỗi/thưởng đặc biệt + phạm vi áp dụng.
   • Tab "Lịch sử": bảng nội dung đã chấm trong ngày đang chọn.
   Lý do gộp "Nội quy nhanh" vào cùng tab với "Thêm từ nội quy": cả 2 đều
   là cách để CỘNG ĐIỂM, còn "Lịch sử" là XEM LẠI — tách theo hành động
   của người dùng thay vì tách theo vị trí cột trên desktop.
   ═══════════════════════════════════════════════════════════════════ */
@media (max-width: 767px) {

  /* ── Modal shell ── */
  .v2-modal { grid-template-rows: auto auto 1fr auto; }

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

  /* ── Tab bar "Chấm điểm | Lịch sử" ── */
  .v2-mobtabs {
    display: flex;
    gap: 6px;
    padding: 8px 12px;
    background: var(--bg-form);
    border-bottom: 1px solid rgba(148,163,184,.08);
  }
  .v2-mobtab {
    flex: 1;
    height: 40px;
    border: 1.5px solid var(--border-input);
    border-radius: 11px;
    background: var(--bg-form-input);
    color: var(--text-muted);
    font-size: 13.5px; font-weight: 800;
    display: flex; align-items: center; justify-content: center; gap: 6px;
    cursor: pointer;
    transition: background .14s ease, border-color .14s ease, color .14s ease;
  }
  .v2-mobtab.active {
    color: #fff; border-color: var(--accent); background: var(--accent);
    box-shadow: 0 4px 14px color-mix(in srgb, var(--accent) 40%, transparent);
  }
  .v2-mobtab-badge {
    min-width: 18px; height: 18px; padding: 0 5px;
    border-radius: 999px; font-size: 10.5px; font-weight: 900;
    display: inline-flex; align-items: center; justify-content: center;
    background: rgba(255,255,255,.22); color: #fff;
  }
  .v2-mobtab:not(.active) .v2-mobtab-badge {
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    color: var(--accent);
  }
  .v2-mobtab-badge:empty { display: none; }

  /* ── Body: mỗi tab chiếm toàn bộ chiều cao còn lại.
     Tab "Chấm điểm" cuộn dọc ngay trên .v2-body (panel con để overflow:visible
     — tránh scroll lồng scroll). Tab "Lịch sử" tự quản lý scroll riêng bên
     trong .v2-middle nên .v2-body auto không ảnh hưởng gì tới nó. */
  .v2-body {
    display: block;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    min-height: 0;
    height: 100%;
  }
  .v2-col-resizer { display: none; }

  /* Panel ẩn/hiện theo tab đang chọn (toggle bằng JS) */
  .v2-mob-hidden { display: none !important; }

  .v2-left, .v2-middle, .v2-right {
    height: 100%;
    max-height: none;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    border: 0 !important;
  }

  /* Tab "Chấm điểm" = .v2-left rồi .v2-right nối tiếp nhau, cuộn chung
     trong 1 khối để không lồng 2 vùng scroll trong nhau (dễ vuốt hơn). */
  .v2-left.v2-mobpanel-score { padding: 14px 14px 4px; gap: 14px; height: auto; overflow: visible; }
  .v2-right.v2-mobpanel-score { height: auto; overflow: visible; padding-bottom: 18px; background: transparent; }

  /* ── Section chung: bo nhỏ lại, đỡ tốn diện tích ── */
  .v2-section-label { font-size: 12.5px; }
  .v2-rule-section, .v2-special-section, .v2-bulk-section { padding: 12px 12px; border-radius: 13px; }

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

  /* Nội quy nhanh: 2 cột thay vì 3 — chip đủ to để bấm chính xác */
  .v2-rules-sidebar { padding: 0 14px 4px; background: transparent; }
  .v2-rules-label { font-size: 12.5px; margin-bottom: 6px; }
  .v2-rules-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    overflow: visible;
  }
  .v2-rule-card { min-height: 48px; padding: 10px 12px; border-radius: 12px; }
  .v2-rule-card span { font-size: 13.5px; }
  .v2-rule-card strong { font-size: 14px; }

  /* Bulk students list: giới hạn chiều cao nhỏ hơn trên mobile */
  .v2-bulk-students { max-height: 110px; }

  /* Tab "Lịch sử" = .v2-middle, chiếm toàn bộ chiều cao body */
  .v2-middle.v2-mobpanel-history { padding: 12px 12px 8px; height: 100%; overflow: hidden; display: flex; }
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
  .v2-mobtab { font-size: 12.5px; height: 38px; }
  .v2-rules-grid { grid-template-columns: 1fr; }
  .v2-header-name { font-size: 14.5px; }
  .v2-score-chip, .v2-score-status { font-size: 10px; padding: 0 6px; }
}
    `;
    document.head.appendChild(st);
  })();

  /* ----------------------------------------------------------
     ENSURE MOUNT POINT EXISTS
  ---------------------------------------------------------- */
  if (!document.getElementById(MODAL_ROOT_ID)) {
    const div = document.createElement('div');
    div.id = MODAL_ROOT_ID;
    document.body.appendChild(div);
  }

  /* Expose for debugging */
  window.__a3ModalV2 = { openModal, closeModal };

})();
/* ============================================================
   A3K64 — Click-to-Edit Patch  v2.2
   ------------------------------------------------------------
   Khi click vào 1 dòng trong bảng "Nội dung chấm" (cột giữa),
   sẽ tự động điền ngược về form bên trái để chỉnh sửa nhanh:

   1. Parse title → lấy category, subject, tên nội dung, điểm
   2. Đặt đúng dropdown Môn + Loại bên trái (dùng luôn định dạng
      đã lưu của dòng đó)
   3. Kiểm tra tên nội dung có trong bảng VI_PHAM (rules) không:
      → Có:  điền vào ô "Tìm nội quy / nhập tự do"
      → Không: điền vào ô "Lỗi / Thưởng đặc biệt" (tên + điểm)
   4. Đổi chữ nút "Thêm" → "Sửa". Dòng cũ VẪN GIỮ NGUYÊN trong
      bảng cho tới khi người dùng thực sự bấm "Sửa" để xác nhận —
      lúc đó mới xoá dòng cũ và thêm dòng mới thay vào.
   5. Nếu đang sửa dòng A mà bấm sang dòng B để sửa tiếp, dòng A
      không bị mất — chỉ đơn giản chuyển sang sửa dòng B, dòng A
      vẫn còn nguyên trong bảng cho tới khi được xác nhận sửa.
   6. Bấm lại đúng dòng đang chọn để sửa → huỷ chế độ sửa (nút trở
      lại "Thêm").
   7. Highlight dòng đang được chọn để sửa.

   LOAD SAU scoreboard-modal.js:
     <script src="scoreboard-inline-edit.js"></script>
   ============================================================ */

(function A3ClickToEdit() {
  'use strict';

  /* ----------------------------------------------------------
     CSS
  ---------------------------------------------------------- */
  (function injectCSS() {
    if (document.getElementById('a3-cte-css')) return;
    const st = document.createElement('style');
    st.id = 'a3-cte-css';
    st.textContent = `
#v2-review-list .v2-ev-item {
  cursor: pointer;
  transition: background .12s ease;
}
#v2-review-list .v2-ev-item:hover {
  background: color-mix(in srgb, var(--accent, #2563eb) 8%, transparent);
}
#v2-review-list .v2-ev-item.cte-selected {
  background: color-mix(in srgb, var(--accent, #2563eb) 18%, transparent) !important;
  outline: 1.5px solid color-mix(in srgb, var(--accent, #2563eb) 50%, transparent);
  outline-offset: -1px;
}
#v2-review-list .v2-ev-title::after {
  content: ' ✎';
  opacity: 0;
  transition: opacity .15s;
  font-size: .8em;
  color: var(--accent, #2563eb);
}
#v2-review-list .v2-ev-item:hover .v2-ev-title::after {
  opacity: .55;
}
@keyframes cteFormFlash {
  0%   { box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent,#2563eb) 45%, transparent); }
  100% { box-shadow: none; }
}
.cte-flash {
  animation: cteFormFlash .5s ease both;
  border-radius: 8px;
}
`;
    document.head.appendChild(st);
  })();

  /* ----------------------------------------------------------
     Parse title ngược lại từ formatSavedTitle()
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

    let points = null;
    const ptsMatch = t.match(/\(([+-]?\d+)\)\s*$/);
    if (ptsMatch) {
      points = parseInt(ptsMatch[1], 10);
      t = t.slice(0, t.lastIndexOf(ptsMatch[0])).trim();
    }

    return { category, subject, contentTitle: t, points };
  }

  function normalizeStrSafe(s) {
    return String(s || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .toLowerCase().trim();
  }

  function findRuleByTitle(contentTitle, category, rules) {
    if (!rules || !rules.length) return null;
    const norm = normalizeStrSafe(contentTitle);
    if (!norm) return null;
    const sameCat = rules.find(r => normalizeStrSafe(r.title) === norm && r.category === category);
    if (sameCat) return sameCat;
    return rules.find(r => normalizeStrSafe(r.title) === norm) || null;
  }

  function flashEl(el) {
    if (!el) return;
    el.classList.remove('cte-flash');
    void el.offsetWidth;
    el.classList.add('cte-flash');
    el.addEventListener('animationend', () => el.classList.remove('cte-flash'), { once: true });
  }

  /* ----------------------------------------------------------
     Rules cache — chủ động preload
  ---------------------------------------------------------- */
  let _currentRules = [];
  let _rulesLoading = false;

  function syncRules() {
    try {
      if (typeof cachedRules !== 'undefined' && Array.isArray(cachedRules) && cachedRules.length) {
        _currentRules = cachedRules;
      }
    } catch (_) { /* noop */ }
  }

  function ensureRulesLoaded() {
    syncRules();
    if (_currentRules.length || _rulesLoading) return;
    if (typeof fetchRulesFromGas !== 'function') return;
    _rulesLoading = true;
    fetchRulesFromGas()
      .then(r => { if (Array.isArray(r) && r.length) _currentRules = r; })
      .catch(err => console.warn('[A3ClickToEdit] Không load được rules:', err))
      .finally(() => { _rulesLoading = false; });
  }

  /* ----------------------------------------------------------
     EDIT STATE — dòng đang được sửa (nếu có)
  ---------------------------------------------------------- */
  let _editingId = null;      // id của dòng đang sửa, null = không sửa gì
  let _knownIds = new Set();  // các id đã có trong bảng lúc bắt đầu sửa
  let _lastRoot = null;       // root element hiện tại, để biết modal có remount không

  function _addBtns(root) {
    return [root.querySelector('#v2-add-btn'), root.querySelector('#v2-special-add-btn')].filter(Boolean);
  }

  function _setEditingLabel(root, editing) {
    _addBtns(root).forEach(btn => { btn.textContent = editing ? 'Sửa' : 'Thêm'; });
  }

  function _resetEditing(root) {
    _editingId = null;
    _knownIds = new Set();
    if (root) {
      root.querySelectorAll('#v2-review-list .v2-ev-item.cte-selected')
        .forEach(r => r.classList.remove('cte-selected'));
      _setEditingLabel(root, false);
    }
  }

  function _currentRowIds(root) {
    return new Set(Array.from(root.querySelectorAll('#v2-review-list .v2-ev-item[data-id]'))
      .map(tr => tr.dataset.id));
  }

  /* ----------------------------------------------------------
     Điền form bên trái sau khi click (KHÔNG xoá dòng cũ ở đây)
  ---------------------------------------------------------- */
  function fillForm(root, parsed, matchedRule) {
    const catSel = root.querySelector('#v2-category');
    if (catSel) {
      catSel.value = parsed.category;
      catSel.dispatchEvent(new Event('change'));
    }

    if (parsed.category === 'HOC_TAP' && parsed.subject) {
      const subSel = root.querySelector('#v2-subject');
      if (subSel) {
        const opts = Array.from(subSel.options);
        const found = opts.find(o => o.value === parsed.subject)
          || opts.find(o => normalizeStrSafe(o.value) === normalizeStrSafe(parsed.subject));
        if (found) {
          subSel.value = found.value;
          subSel.dispatchEvent(new Event('change'));
        }
      }
    }

    const searchInp = root.querySelector('#v2-rule-search');
    const titleInp  = root.querySelector('#v2-special-title');
    const ptsInp    = root.querySelector('#v2-special-pts');

    if (matchedRule) {
      if (searchInp) { searchInp.value = matchedRule.title; searchInp.dispatchEvent(new Event('input')); searchInp.focus(); }
      if (titleInp) titleInp.value = '';
      if (ptsInp)   ptsInp.value   = '';
      flashEl(root.querySelector('.v2-rule-section'));
    } else {
      if (searchInp) { searchInp.value = ''; searchInp.dispatchEvent(new Event('input')); }
      if (titleInp) titleInp.value = parsed.contentTitle;
      if (ptsInp)   ptsInp.value   = String(parsed.points ?? '');
      setTimeout(() => titleInp?.focus(), 30);
      flashEl(root.querySelector('.v2-special-section'));
    }
  }

  /* ----------------------------------------------------------
     Bắt đầu sửa 1 dòng (click)
  ---------------------------------------------------------- */
  function startEdit(root, tr) {
    const eventId = tr.dataset.id;

    // Bấm lại đúng dòng đang sửa → huỷ chế độ sửa
    if (_editingId === eventId) {
      _resetEditing(root);
      return;
    }

    const rawTitle = tr.dataset.rawTitle
      || tr.querySelector('.v2-ev-title')?.title
      || tr.querySelector('.v2-ev-title')?.textContent?.trim()
      || '';
    const parsed = parseEventTitle(rawTitle);

    syncRules();
    const matched = findRuleByTitle(parsed.contentTitle, parsed.category, _currentRules);
    if (!matched && !_currentRules.length) ensureRulesLoaded();

    fillForm(root, parsed, matched);

    // Đánh dấu đang sửa dòng này — ghi nhớ tập id hiện có để phát hiện
    // khi nào có dòng MỚI xuất hiện (tức là người dùng đã bấm "Sửa")
    _editingId = eventId;
    _knownIds = _currentRowIds(root);
    _setEditingLabel(root, true);

    root.querySelectorAll('#v2-review-list .v2-ev-item.cte-selected')
      .forEach(r => r.classList.remove('cte-selected'));
    tr.classList.add('cte-selected');
  }

  /* ----------------------------------------------------------
     Gọi mỗi khi review-list được vẽ lại — phát hiện khi việc "Sửa"
     đã thực sự tạo ra dòng mới, lúc đó mới xoá dòng cũ đi.
  ---------------------------------------------------------- */
  function checkEditCommit(root) {
    if (!_editingId) return;

    const ids = _currentRowIds(root);

    // Dòng đang sửa đã bị xoá bằng cách khác (bấm ×) → thôi, huỷ chế độ sửa
    if (!ids.has(_editingId)) { _resetEditing(root); return; }

    // Có id mới xuất hiện mà lúc bắt đầu sửa chưa có → người dùng vừa bấm "Sửa"
    let newId = null;
    ids.forEach(id => { if (!_knownIds.has(id) && id !== _editingId) newId = id; });
    if (!newId) return;

    const doneEditingId = _editingId;
    _resetEditing(root);
    // Delay nhỏ để tránh đụng vào chính mutation đang xử lý
    setTimeout(() => {
      const stillThere = document.querySelector(`#v2-review-list .v2-ev-del[data-id="${CSS.escape(doneEditingId)}"]`);
      stillThere?.click();
    }, 30);
  }

  /* ----------------------------------------------------------
     Attach handler lên review list (event delegation)
  ---------------------------------------------------------- */
  function attach(listEl, root) {
    if (!listEl || listEl.dataset.cteAttached) return;
    listEl.dataset.cteAttached = '1';

    listEl.addEventListener('click', (e) => {
      try {
        if (e.target.closest('.v2-ev-del')) return;
        const tr = e.target.closest('tr.v2-ev-item[data-id]');
        if (!tr) return;
        const bridge = window.__a3ModalBridge;
        if (bridge?.isSaving?.()) return;
        startEdit(root, tr);
      } catch (err) {
        console.error('[A3ClickToEdit] Lỗi khi xử lý click dòng:', err);
      }
    });
  }

  /* ----------------------------------------------------------
     CHẶN AUTO-SAVE KHI ĐÓNG MODAL
     ------------------------------------------------------------
     scoreboard-modal.js gắn nút X / click ra ngoài backdrop / phím
     Esc đều gọi _handleSaveAndClose() — hàm này TỰ ĐỘNG LƯU lên
     server nếu đang có thay đổi chưa lưu. Đúng ra 3 cách đóng này
     chỉ nên ĐÓNG (huỷ thay đổi chưa lưu), chỉ nút "Lưu thay đổi"
     mới thực sự gọi lưu.

     Cách chặn: gắn listener ở giai đoạn CAPTURE trên document —
     giai đoạn capture luôn chạy trước listener gốc (được gắn ở
     giai đoạn bubble trên chính nút/backdrop), nên ta chặn được
     sự kiện lan tới trước khi _handleSaveAndClose() kịp chạy, rồi
     tự đóng bằng window.closeModal() (chỉ đóng, không lưu).
  ---------------------------------------------------------- */
  function _isModalOpen() {
    return !!document.querySelector('#a3-score-modal-root #v2-backdrop');
  }

  function _discardAndClose() {
    if (typeof window.closeModal === 'function') {
      window.closeModal();
    } else {
      const root = document.getElementById('a3-score-modal-root');
      if (root) root.innerHTML = '';
    }
  }

  function _installCloseGuard() {
    document.addEventListener('click', (e) => {
      if (!_isModalOpen()) return;
      const isCloseBtn = e.target.closest('#v2-close-btn');
      const isBackdrop = e.target.id === 'v2-backdrop';
      if (!isCloseBtn && !isBackdrop) return;
      e.stopImmediatePropagation();  // chặn cả listener bubble trên cùng element
      e.preventDefault();
      _discardAndClose();
    }, true /* capture */);

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!_isModalOpen()) return;
      e.stopImmediatePropagation();
      _discardAndClose();
    }, true /* capture */);
  }

  /* ----------------------------------------------------------
     MutationObserver
  ---------------------------------------------------------- */
  function startObserving() {
    const modalRoot = document.getElementById('a3-score-modal-root');
    if (!modalRoot) { setTimeout(startObserving, 200); return; }

    const mo = new MutationObserver(() => {
      try {
        const listEl = document.getElementById('v2-review-list');
        if (!listEl) { _lastRoot = null; return; }

        // Modal vừa remount (mở lại / mở học sinh khác) → reset trạng thái sửa
        if (modalRoot !== _lastRoot) {
          _lastRoot = modalRoot;
          _editingId = null;
          _knownIds = new Set();
        }

        attach(listEl, modalRoot);
        ensureRulesLoaded();
        checkEditCommit(modalRoot);
      } catch (err) {
        console.error('[A3ClickToEdit] Lỗi MutationObserver:', err);
      }
    });
    mo.observe(modalRoot, { childList: true, subtree: true });
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { _installCloseGuard(); startObserving(); });
  } else {
    _installCloseGuard();
    startObserving();
  }

})();
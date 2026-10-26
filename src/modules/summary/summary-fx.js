/* ============================================================
   A3K64 — Tổng kết: HIỆU ỨNG CHUYỂN ĐỘNG (summary-fx.js)
   Không đụng vào logic của summary.js / summary-charts.js — chỉ "quan sát" DOM rồi gắn class cho summary-fx.css:
     • .fx-go       : nội dung MỚI (dữ liệu thật sự đổi) → trượt lên, thanh mọc ra. Dữ liệu y hệt lần trước → bỏ qua cho khỏi chớp.
     • .fx-stagger  : các dòng bảng hiện nối đuôi (khi vào trang / chuyển Bảng↔Biểu đồ / đổi khoảng tuần)
     • .fx-sort     : dòng bảng nháy nhẹ khi sắp xếp / lọc (gõ tìm kiếm thì KHÔNG hiệu ứng)
     • .fx-a        : biểu đồ SVG — cột mọc lên, đường vẽ dần, vòng xếp loại nở ra
     • số liệu đếm tăng dần (điểm TB cả lớp, sĩ số, điểm học sinh…)
     • thanh trượt cho nút Bảng/Biểu đồ + các tab; gợn sóng khi bấm nút
   Tôn trọng prefers-reduced-motion.
   ============================================================ */
(function () {
  'use strict';
  var RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var each = function (list, fn) { Array.prototype.forEach.call(list || [], fn); };

  /* ---------- ý định của người dùng (bắt ở pha capture, trước khi summary.js dựng lại DOM) ---------- */
  var intent = '', intentT = 0;
  function mark(x) { intent = x; clearTimeout(intentT); intentT = setTimeout(function () { intent = ''; }, 0); }
  document.addEventListener('input', function (e) { if (e.target && e.target.id === 'sm-q') mark('type'); }, true);
  document.addEventListener('change', function (e) { if (e.target && e.target.id === 'sm-g') mark('filter'); }, true);
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('[data-act]'); if (!a) return;
    var k = a.getAttribute('data-act');
    if (k === 'sort' || k === 'climb') mark('sort'); else if (k === 'fgrade') mark('filter');
  }, true);

  /* ---------- tiện ích ---------- */
  var sigs = {};
  function sameSig(key, el) { var s = el.textContent; var same = sigs[key] === s; sigs[key] = s; return same; }
  function setCls(el, cls, on) { if (el.classList.contains(cls) !== !!on) el.classList.toggle(cls, !!on); }
  function addTimed(el, cls, ms) {
    if (!el) return;
    el.classList.add(cls);
    clearTimeout(el['_fx' + cls]);
    el['_fx' + cls] = setTimeout(function () { el.classList.remove(cls); }, ms);
  }

  /* ---------- chuẩn bị SVG + thanh: chỉ số thứ tự (để so le), hướng mọc của cột, độ dài đường ---------- */
  var RE_BAR = /(^|\s)fg?-[a-z]+(\s|$)/, RE_BAD = /(^|\s)f-bad(\s|$)/;
  function prepSvg(svg) {
    if (svg.__fxPrep) return; svg.__fxPrep = true;
    var axisY = null;
    each(svg.querySelectorAll('line.ch-axis'), function (l) {
      if (axisY == null && +l.getAttribute('y1') === +l.getAttribute('y2')) axisY = +l.getAttribute('y1');
    });
    var i = 0;
    each(svg.querySelectorAll('rect'), function (r) {
      var c = r.getAttribute('class') || '';
      if (!RE_BAR.test(c)) return;
      var w = +r.getAttribute('width'), h = +r.getAttribute('height'), o;
      if (Math.abs(w - h) < 1.5) o = 'c';                                              // ô vuông (chú thích): nảy lên
      else if (h > w) o = (axisY != null && +r.getAttribute('y') >= axisY - 0.6) ? 't' : 'b';   // cột đứng: mọc từ đáy (hoặc từ trục nếu cột âm)
      else o = RE_BAD.test(c) ? 'r' : 'l';                                             // thanh ngang: mọc từ trái (âm: từ phải)
      r.setAttribute('data-o', o); r.style.setProperty('--i', i++);
    });
    i = 0;
    each(svg.querySelectorAll('circle'), function (c) {
      if (/(^|\s)sg-/.test(c.getAttribute('class') || '')) { c.setAttribute('data-o', 'ring'); c.style.setProperty('--i', i++); }
    });
    i = 0;
    each(svg.querySelectorAll('.ch-dot, .dot'), function (c) { c.style.setProperty('--i', i++); });
    each(svg.querySelectorAll('polyline.ch-line, polyline.ln'), function (l) { l.setAttribute('pathLength', '1'); });
  }
  function annotate(root, animate) {
    each(root.querySelectorAll('svg.sm-ch, svg.sm-spark'), function (svg) {
      prepSvg(svg);
      if (animate) setCls(svg, 'fx-a', true);
    });
    each(root.querySelectorAll('.sm-bar-fill'), function (e, i) { e.style.setProperty('--i', i); });
    each(root.querySelectorAll('.sm-cat-fill'), function (e, i) { e.style.setProperty('--i', i); });
  }

  /* ---------- số đếm tăng dần ---------- */
  var nfCache = {}, counts = {};
  function nfOf(dec) {
    return nfCache[dec] || (nfCache[dec] = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: dec, maximumFractionDigits: dec }));
  }
  function countUp(container, key) {
    var els = container.querySelectorAll('.sm-ov-main strong, .sm-ov-meta b, .sm-d-stats strong');
    var prev = counts[key] || [], next = [];
    each(els, function (el, idx) {
      next[idx] = null;
      if (el.children.length) return;
      var txt = el.textContent.trim();
      var m = /^([+\-\u2212]?)(\d[\d.]*)(?:,(\d+))?$/.exec(txt); if (!m) return;
      var neg = m[1] === '-' || m[1] === '\u2212', dec = m[3] ? m[3].length : 0;
      var val = +(m[2].replace(/\./g, '') + (m[3] ? '.' + m[3] : '')) * (neg ? -1 : 1);
      if (!isFinite(val)) return;
      next[idx] = val;
      if (RM) return;
      var from = (prev.length === els.length && prev[idx] != null) ? prev[idx] : 0;
      if (from === val) return;
      var nf = nfOf(dec), plus = m[1] === '+' ? '+' : '', t0 = null, dur = 750;
      el.textContent = plus + nf.format(from);
      var tick = function (t) {
        if (!el.isConnected) return;
        if (t0 == null) t0 = t;
        var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        if (p >= 1) { el.textContent = txt; return; }
        el.textContent = plus + nf.format(from + (val - from) * e);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    counts[key] = next;
  }

  /* ---------- thanh trượt cho nút chuyển Bảng/Biểu đồ + tab ---------- */
  var INDS = [['.sm-seg', 'seg'], ['.sm-tabs', 'tabs'], ['.rb-tabs', 'rbtabs'], ['#cx-tabs', 'cxtabs']], lastPos = {};
  function scan() {
    INDS.forEach(function (p) {
      var c = $(p[0]); if (!c) return;
      var ind = c.querySelector(':scope > .fx-ind'), fresh = false;
      if (!ind) { ind = document.createElement('span'); ind.className = 'fx-ind'; ind.setAttribute('aria-hidden', 'true'); c.appendChild(ind); fresh = true; }
      var on = c.querySelector(':scope > .on');
      if (!on || c.hidden || !c.offsetWidth || !on.offsetWidth) { setCls(c, 'fx-on', false); return; }
      var x = on.offsetLeft, w = on.offsetWidth, last = lastPos[p[1]];
      if (fresh && last) {                                  // thanh mới (tab vừa bị dựng lại) → xuất phát từ vị trí cũ rồi trượt
        ind.style.setProperty('--x', last.x + 'px'); ind.style.setProperty('--w', last.w + 'px');
        setCls(c, 'fx-on', true); void ind.offsetWidth; setCls(c, 'fx-ready', true); void ind.offsetWidth;
      }
      ind.style.setProperty('--x', x + 'px'); ind.style.setProperty('--w', w + 'px');
      setCls(c, 'fx-on', true);
      lastPos[p[1]] = { x: x, w: w };
      if (!c.classList.contains('fx-ready')) requestAnimationFrame(function () { requestAnimationFrame(function () { setCls(c, 'fx-ready', true); }); });
    });
  }
  var scanQ = 0;
  function scheduleScan() { if (scanQ) return; scanQ = requestAnimationFrame(function () { scanQ = 0; scan(); }); }

  /* ---------- quan sát DOM ---------- */
  function doMain() {
    var main = $('#sm-main'); if (!main) return;
    var same = sameSig('main', main);
    if (!same) {
      each(main.children, function (k) { k.classList.add('fx-go'); });
      addTimed($('#sm-tw'), 'fx-stagger', 1500);
      each(main.querySelectorAll('.sm-detail'), function (d) { d.classList.add('fx-go'); });
      countUp(main, 'main');
    }
    annotate(main, !same);
  }
  function doTw() {
    if (intent === 'sort' || intent === 'filter') addTimed($('#sm-tw'), 'fx-sort', 500);
  }
  function doStats() {
    var st = $('#sm-stats'); if (!st) return;
    var same = sameSig('stats', st);
    if (!same) { each(st.children, function (k) { k.classList.add('fx-go'); }); countUp(st, 'stats'); }
    annotate(st, false);
  }
  function doDetail(el) {
    var same = sameSig('detail:' + el.id, el);
    if (!same) { each(el.querySelectorAll('.sm-detail'), function (d) { d.classList.add('fx-go'); }); countUp(el, 'detail'); }
    annotate(el, !same);
  }
  function doStage() {
    var st = $('#cx-stage'); if (!st) return;
    annotate(st, st.getAttribute('data-fx') === '1');   // summary-charts.js đặt data-fx=1 khi biểu đồ MỚI / đổi công cụ, =0 khi chỉ bấm chọn
  }

  var obs = new MutationObserver(function (recs) {
    var f = {};
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      if (r.type === 'attributes') { f.ind = 1; continue; }
      var t = r.target; if (!t || t.nodeType !== 1) continue;
      var id = t.id;
      if (id === 'sm-main') f.main = 1;
      else if (id === 'sm-tw') f.tw = 1;
      else if (id === 'sm-stats') f.stats = 1;
      else if (id === 'sm-pane-detail') f.pane = 1;
      else if (id === 'sm-drawer') f.drawer = 1;
      else if (id === 'cx-stage') f.stage = 1;
      if (id === 'sm-panel' || id === 'cx-tabs' || id === 'sm-seg' || id === 'sm-root' || id === 'cx' || id === 'sm-rtabs' || id === 'sm-rpanel') f.ind = 1;
    }
    if (f.stats) doStats();
    if (f.main) doMain(); else if (f.tw) doTw();
    if (f.pane) { var pn = $('#sm-pane-detail'); if (pn) doDetail(pn); }
    if (f.drawer) { var dr = $('#sm-drawer'); if (dr && dr.firstChild) doDetail(dr); }
    if (f.stage) doStage();
    if (f.ind) scheduleScan();
  });
  obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });

  window.addEventListener('resize', scheduleScan);
  window.addEventListener('load', scheduleScan);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleScan);
  scheduleScan();

  /* ---------- gợn sóng khi bấm nút ---------- */
  document.addEventListener('pointerdown', function (e) {
    if (RM || e.button) return;
    var b = e.target.closest && e.target.closest('.sm-btn:not(.sm-close), .sm-chip, .cx-ib, .sm-tab, .cx-seg button, .cx-tabs button');
    if (!b || b.disabled) return;
    var r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2;
    var sp = document.createElement('span');
    sp.className = 'fx-ripple';
    sp.style.cssText = 'width:' + s + 'px;height:' + s + 'px;left:' + (e.clientX - r.left - s / 2) + 'px;top:' + (e.clientY - r.top - s / 2) + 'px';
    b.appendChild(sp);
    setTimeout(function () { sp.remove(); }, 650);
  }, true);
})();
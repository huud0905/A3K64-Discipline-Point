/* ============================================================
   A3K64 — Profile: HIỆU ỨNG CHUYỂN ĐỘNG (profile-fx.js)
   Không đụng vào logic profile.js — chỉ quan sát DOM rồi gắn class:
     • Entrance stagger (.pf-enter) khi profile-page xuất hiện
     • Ripple khi bấm tab / filter-btn / week-sw button
     • Card glow (--mx/--my) khi rê chuột trên stat-card, p-hero
     • Chart SVG animation (.pf-chart-anim + --i index cho dots)
     • Count-up cho các số trong stat-card b
     • Tôn trọng prefers-reduced-motion
   ============================================================ */
(function () {
  'use strict';

  var RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ── Tiện ích ── */
  function $(s, root) { return (root || document).querySelector(s); }
  function $$(s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); }

  /* ── 1. Ripple ── */
  function makeRipple(e, el) {
    if (RM) return;
    var r = el.getBoundingClientRect();
    var s = Math.max(r.width, r.height) * 2;
    var sp = document.createElement('span');
    sp.className = 'pf-rip';
    sp.style.cssText = [
      'width:' + s + 'px', 'height:' + s + 'px',
      'left:' + (e.clientX - r.left - s / 2) + 'px',
      'top:'  + (e.clientY - r.top  - s / 2) + 'px'
    ].join(';');
    el.appendChild(sp);
    setTimeout(function () { sp.remove(); }, 650);
  }

  document.addEventListener('pointerdown', function (e) {
    var el = e.target && e.target.closest(
      '.tab-btn, .filter-btn, .week-sw button, .btn-new-tab, .result-btn, .ctx-menu button'
    );
    if (el) makeRipple(e, el);
  }, true);

  /* ── 2. Card glow (mousemove → --mx / --my) ── */
  function bindGlow(el) {
    if (el.__pfGlow) return;
    el.__pfGlow = true;
    el.addEventListener('mousemove', function (e) {
      var r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      el.style.setProperty('--my', (e.clientY - r.top)  + 'px');
    });
    el.addEventListener('mouseleave', function () {
      el.style.setProperty('--mx', '-200px');
      el.style.setProperty('--my', '-200px');
    });
  }

  function applyGlow(root) {
    $$('.stat-card, .p-hero, .p-card, .p-event-card', root).forEach(bindGlow);
  }

  /* ── 3. Count-up cho stat-card b ── */
  var nfCache = {};
  function nfOf(dec) {
    if (!nfCache[dec]) nfCache[dec] = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    return nfCache[dec];
  }
  var prevCounts = {};

  function countUp(root, key) {
    if (RM) return;
    var els = $$('.stat-card b', root);
    var prev = prevCounts[key] || [];
    var next = [];
    els.forEach(function (el, idx) {
      next[idx] = null;
      if (el.children.length) return;
      var txt = el.textContent.trim();
      var m = /^([+\-−]?)(\d[\d.]*)(?:,(\d+))?$/.exec(txt);
      if (!m) return;
      var neg = m[1] === '-' || m[1] === '−';
      var dec = m[3] ? m[3].length : 0;
      var val = +(m[2].replace(/\./g, '') + (m[3] ? '.' + m[3] : '')) * (neg ? -1 : 1);
      if (!isFinite(val)) return;
      next[idx] = val;
      var from = (prev.length === els.length && prev[idx] != null) ? prev[idx] : 0;
      if (from === val) return;
      var nf = nfOf(dec), plus = m[1] === '+' ? '+' : '';
      var t0 = null, dur = 700;
      el.textContent = plus + nf.format(from);
      (function tick(t) {
        if (!el.isConnected) return;
        if (t0 == null) t0 = t;
        var p = Math.min(1, (t - t0) / dur);
        var e2 = 1 - Math.pow(1 - p, 3);
        var cur = from + (val - from) * e2;
        el.textContent = plus + nf.format(cur);
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = plus + nf.format(val);
      })(performance.now());
    });
    prevCounts[key] = next;
  }

  /* ── 4. Chart SVG animation ── */
  function animateChart(root) {
    if (RM) return;
    var chart = $('svg.profile-chart', root);
    if (!chart || chart.__pfAnim) return;
    chart.__pfAnim = true;
    /* index cho dots */
    $$('circle.chart-dot', chart).forEach(function (c, i) {
      c.style.setProperty('--i', i);
    });
    /* kích hoạt class để CSS animation chạy */
    var scroll = chart.closest('.chart-scroll');
    if (scroll) scroll.classList.add('pf-chart-anim');
    else chart.parentElement.classList.add('pf-chart-anim');
  }

  /* ── 5. Table rows stagger ── */
  function staggerTable(root) {
    if (RM) return;
    var tbodies = $$('.p-table-wrap tbody', root);
    tbodies.forEach(function (tb) {
      /* reset để animation chạy lại */
      tb.classList.remove('pf-stag');
      void tb.offsetWidth; /* reflow */
      tb.classList.add('pf-stag');
    });
  }

  /* ── 6. Entrance: khi profile-page được mount ── */
  function onNewPage(page) {
    if (!page || page.__pfInit) return;
    page.__pfInit = true;

    /* entrance stagger cho các block lớn */
    if (!RM) {
      page.classList.remove('pf-enter');
      void page.offsetWidth;
      page.classList.add('pf-enter');
    }

    applyGlow(page);
    countUp(page, page.dataset.tabkey || 'default');
    animateChart(page);
    staggerTable(page);
  }

  /* ── 7. MutationObserver: theo dõi #main để bắt tab switch ── */
  var main = document.getElementById('main');
  if (main) {
    /* khởi tạo trang hiện tại nếu đã render */
    var existing = $('div.profile-page', main);
    if (existing) onNewPage(existing);

    new MutationObserver(function (recs) {
      recs.forEach(function (r) {
        r.addedNodes.forEach(function (n) {
          if (!n || n.nodeType !== 1) return;
          if (n.classList && n.classList.contains('profile-page')) {
            onNewPage(n);
          } else {
            /* tìm sâu hơn (ví dụ nếu wrapper được insert) */
            var p = n.querySelector && n.querySelector('.profile-page');
            if (p) onNewPage(p);
          }
        });
      });
    }).observe(main, { childList: true, subtree: true });
  }

  /* ── 8. Glow cho sidebar tab-btn khi hover ── */
  document.addEventListener('mousemove', function (e) {
    var btn = e.target && e.target.closest('.tab-btn');
    if (!btn) return;
    var r = btn.getBoundingClientRect();
    btn.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    btn.style.setProperty('--my', (e.clientY - r.top) + 'px');
  });

})();

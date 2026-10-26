/* ============================================================
   A3K64 — Scoreboard Design Upgrade (JS glue)
   Kích hoạt:
     1. Thanh trượt tab gradient (giống admin .ad-ind)
     2. Ripple effect trên tab + toolbar buttons
     3. Class .sc-enter khi app mount
     4. Scroll-shadow trên header
   Không phụ thuộc vào bất kỳ framework nào.
   ============================================================ */

(function initScDesignUpgrade() {
  'use strict';

  /* ─── helpers ─────────────────────────────────────────────── */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return [...(ctx || document).querySelectorAll(sel)]; }

  /* ─── 1. TAB SLIDE INDICATOR ──────────────────────────────── */
  function setupTabIndicator(tabsEl) {
    if (!tabsEl || tabsEl.dataset.scInd) return;
    tabsEl.dataset.scInd = '1';

    const ind = document.createElement('div');
    ind.className = 'sc-tab-ind';
    tabsEl.prepend(ind);

    function move(btn) {
      if (!btn) return;
      const tabsR = tabsEl.getBoundingClientRect();
      const btnR  = btn.getBoundingClientRect();
      ind.style.width  = `${btnR.width}px`;
      ind.style.transform = `translateX(${btnR.left - tabsR.left}px)`;
    }

    function activate() {
      const active = $('button.active', tabsEl);
      if (!active) return;
      move(active);
      if (!ind.classList.contains('ready')) {
        // Đặt vị trí xong mới add 'ready' → tránh thanh trượt nháy từ góc trái
        requestAnimationFrame(() => {
          ind.classList.add('ready');
          // Thêm class lên container để CSS không cần :has() (fallback WebView cũ)
          tabsEl.classList.add('sc-ind-ready');
        });
      }
    }

    /* Dùng MutationObserver để bắt khi JS scoreboard đổi active tab */
    const mo = new MutationObserver(activate);
    $$('button', tabsEl).forEach(btn => {
      mo.observe(btn, { attributes: true, attributeFilter: ['class'] });
    });

    activate();
    window.addEventListener('resize', activate, { passive: true });
  }

  /* ─── 2. RIPPLE EFFECT ─────────────────────────────────────── */
  function addRipple(el) {
    el.addEventListener('pointerdown', function(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const r  = el.getBoundingClientRect();
      const d  = Math.max(r.width, r.height) * 2.2;
      const rip = document.createElement('span');
      rip.className = 'sc-ripple';
      rip.style.cssText = `
        width:${d}px; height:${d}px;
        left:${e.clientX - r.left - d/2}px;
        top:${e.clientY - r.top  - d/2}px;
      `;
      el.appendChild(rip);
      rip.addEventListener('animationend', () => rip.remove(), { once: true });
    }, { passive: true });
  }

  /* ─── 3. SCROLL SHADOW TRÊN HEADER ────────────────────────── */
  function setupScrollShadow(contentEl, headerEl) {
    if (!contentEl || !headerEl) return;
    contentEl.addEventListener('scroll', function() {
      headerEl.classList.toggle('scrolled', this.scrollTop > 4);
    }, { passive: true });
  }

  /* ─── 4. PANEL STAGGER KHI NỘI DUNG ĐỔI ──────────────────── */
  function staggerPanels(root) {
    $$('.score-panel', root).forEach((p, i) => {
      p.style.setProperty('--panel-i', i);
    });
    root.classList.add('sc-content-enter');
    root.addEventListener('animationend', () => {
      root.classList.remove('sc-content-enter');
    }, { once: true });
  }

  /* ─── 5. MOUNT ─────────────────────────────────────────────── */
  function mount() {
    const app = $('.scoreboard-app');
    if (!app) return;

    /* Lớp enter tổng */
    requestAnimationFrame(() => {
      app.classList.add('sc-enter');
      app.addEventListener('animationend', () => {
        app.classList.remove('sc-enter');
      }, { once: true });
    });

    /* Tab indicators */
    $$('.scoreboard-tabs', app).forEach(setupTabIndicator);

    /* Ripple trên tabs + toolbar buttons */
    $$('.scoreboard-tabs button, .toolbar-button', app).forEach(addRipple);

    /* Scroll shadow */
    const header  = $('.scoreboard-header', app);
    const content = $('.scoreboard-content', app);
    setupScrollShadow(content, header);

    /* Stagger panels */
    if (content) staggerPanels(content);

    /* MutationObserver: bắt khi JS render lại nội dung mới */
    const contentObs = new MutationObserver(() => {
      /* Cài lại ripple cho nút mới inject */
      $$('.toolbar-button', app).forEach(btn => {
        if (!btn.dataset.scRip) {
          btn.dataset.scRip = '1';
          addRipple(btn);
        }
      });
      /* Cài lại tab indicator nếu tabs tái tạo */
      $$('.scoreboard-tabs', app).forEach(tabs => {
        if (!tabs.dataset.scInd) setupTabIndicator(tabs);
      });
      /* Stagger panels mới */
      if (content) staggerPanels(content);
    });

    contentObs.observe(app, { childList: true, subtree: true });
  }

  /* ─── Chạy khi DOM sẵn sàng ──────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  /* Export để scoreboard.js gọi lại khi re-render nếu cần */
  window.scDesignUpgrade = { mount, setupTabIndicator, addRipple };
})();

/* ============================================================
   touch-scroll-fix.js — WKWebView iOS iframe scroll polyfill
   v2 — preventDefault + axis-lock để lấy lại gesture từ WebKit
   ============================================================ */
(function () {
  'use strict';

  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /* Chạy cả Android WebView để an toàn */
  var isTouch = isIOS || ('ontouchstart' in window);
  if (!isTouch) return;

  function attach(el) {
    if (!el || el.__wkScrollFixed) return;
    el.__wkScrollFixed = true;

    var startX = 0, startY = 0;
    var startSL = 0, startST = 0;
    var axis = null;          /* 'x' | 'y' | null — lock sau khi xác định */
    var lastX = 0, lastY = 0, lastT = 0;
    var vx = 0, vy = 0;
    var rafId = null;
    var active = false;

    function canScrollX() { return el.scrollWidth  > el.clientWidth  + 1; }
    function canScrollY() { return el.scrollHeight > el.clientHeight + 1; }

    el.addEventListener('touchstart', function (e) {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      var t = e.touches[0];
      startX = lastX = t.clientX;
      startY = lastY = t.clientY;
      startSL = el.scrollLeft;
      startST = el.scrollTop;
      axis = null;
      vx = 0; vy = 0;
      lastT = Date.now();
      active = true;
    }, { passive: true });

    el.addEventListener('touchmove', function (e) {
      if (!active) return;
      var t = e.touches[0];
      var dx = startX - t.clientX;
      var dy = startY - t.clientY;
      var now = Date.now();
      var dt = now - lastT || 1;

      /* Xác định trục sau khi di chuyển > 5px */
      if (!axis) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }

      var willScroll = false;
      if (axis === 'x' && canScrollX()) {
        el.scrollLeft = startSL + dx;
        vx = (lastX - t.clientX) / dt;
        willScroll = true;
      }
      if (axis === 'y' && canScrollY()) {
        el.scrollTop = startST + dy;
        vy = (lastY - t.clientY) / dt;
        willScroll = true;
      }

      /* preventDefault phải gọi TRƯỚC khi WebKit quyết định nuốt gesture.
         Chỉ gọi khi element thực sự xử lý scroll — nếu không thì thả
         cho parent xử lý (vd vuốt dọc khi chỉ có scroll ngang). */
      if (willScroll) {
        e.preventDefault();
        e.stopPropagation();
      }

      lastX = t.clientX;
      lastY = t.clientY;
      lastT = now;
    }, { passive: false }); /* passive:false để có thể gọi preventDefault */

    el.addEventListener('touchend', function () {
      if (!active) return;
      active = false;

      var ax = axis;
      /* Momentum */
      (function momentum() {
        var going = false;
        if (ax === 'x' && Math.abs(vx) >= 0.01) {
          el.scrollLeft += vx * 16;
          vx *= 0.90;
          going = true;
        }
        if (ax === 'y' && Math.abs(vy) >= 0.01) {
          el.scrollTop += vy * 16;
          vy *= 0.90;
          going = true;
        }
        if (going) rafId = requestAnimationFrame(momentum);
      })();
    }, { passive: true });

    el.addEventListener('touchcancel', function () {
      active = false; vx = 0; vy = 0;
    }, { passive: true });
  }

  /* Scan và gắn — ưu tiên selector cụ thể, sau đó quét rộng */
  function scan() {
    var SELECTORS = [
      '.seat-board-wrap',
      '.scoreboard-content',
      '.scoreboard-left-tools',
      '.score-edit-body',
      '#main', '#sidebar',
      '.mob-home', '.mob-drawer',
      '.rule-list-wrap',
      '.score-custom-form',
      '.ai-preview-wrap',
    ];
    SELECTORS.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(attach);
    });
    /* Quét rộng */
    document.querySelectorAll('*').forEach(function (el) {
      if (el.__wkScrollFixed) return;
      var cs = window.getComputedStyle(el);
      if (cs.overflowY === 'auto' || cs.overflowY === 'scroll' ||
          cs.overflowX === 'auto' || cs.overflowX === 'scroll') {
        attach(el);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }

  /* Re-scan khi DOM thay đổi (render động) */
  var timer = null;
  new MutationObserver(function () {
    clearTimeout(timer);
    timer = setTimeout(scan, 120);
  }).observe(document.body, { childList: true, subtree: true });

})();
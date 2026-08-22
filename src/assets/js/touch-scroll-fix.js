/* ============================================================
   touch-scroll-fix.js — WKWebView iOS iframe scroll polyfill
   ------------------------------------------------------------
   VẤN ĐỀ:
   WKWebView (engine của Safari, Edge, Chrome trên iOS) có bug:
   khi <iframe> chứa trang mà html+body đều overflow:hidden,
   WKWebView quyết định ngay từ đầu rằng iframe không scroll
   được → nuốt toàn bộ gesture vuốt, không bao giờ truyền vào
   div con bên trong dù div đó có overflow-y:auto đúng.

   GIẢI PHÁP:
   Tự bắt touchstart/touchmove/touchend rồi set scrollTop/scrollLeft
   bằng tay → bypass hoàn toàn hệ thống scroll của WebKit.
   Hỗ trợ CẢ vuốt dọc (scrollTop) LẪN vuốt ngang (scrollLeft) —
   quan trọng cho các bảng cần cuộn ngang (vd: bảng xem trước AI).

   CÁCH DÙNG:
   Thêm vào cuối <body> của bất kỳ *-window.html nào:
     <script src="../../assets/js/touch-scroll-fix.js"></script>

   Script tự động tìm tất cả element có overflow-y và/hoặc overflow-x
   là auto/scroll rồi gắn polyfill. Cũng tự re-scan khi DOM thay đổi
   (MutationObserver) để bắt các element được tạo động (vd: scoreboard
   render lại).
   ============================================================ */

(function () {
  'use strict';

  /* Chỉ chạy trên iOS — desktop không cần, không muốn override
     hành vi scroll tự nhiên của desktop browser. */
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (!isIOS) return;

  /* ── Gắn polyfill vào 1 element ── */
  function attach(el) {
    if (!el || el.__wkScrollFixed) return;

    var cs = window.getComputedStyle(el);
    var oy = cs.overflowY;
    var ox = cs.overflowX;
    var canY = (oy === 'auto' || oy === 'scroll');
    var canX = (ox === 'auto' || ox === 'scroll');

    /* Chỉ xử lý element thực sự có thể cuộn theo ít nhất 1 trục */
    if (!canY && !canX) return;

    el.__wkScrollFixed = true;

    var startX = 0, startY = 0;
    var startScrollLeft = 0, startScrollTop = 0;
    var lastX = 0, lastY = 0;
    var lastTime = 0;
    var velocityX = 0, velocityY = 0;
    var rafId = null;
    var tracking = false;
    var trackY = false, trackX = false;

    el.addEventListener('touchstart', function (e) {
      var scrollableY = canY && el.scrollHeight > el.clientHeight;
      var scrollableX = canX && el.scrollWidth > el.clientWidth;
      /* Nếu element không thực sự cuộn được theo trục nào thì bỏ qua */
      if (!scrollableY && !scrollableX) return;

      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      var t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      lastX = t.clientX;
      lastY = t.clientY;
      startScrollLeft = el.scrollLeft;
      startScrollTop = el.scrollTop;
      velocityX = 0; velocityY = 0;
      lastTime = Date.now();
      trackY = scrollableY;
      trackX = scrollableX;
      tracking = true;
    }, { passive: true });

    el.addEventListener('touchmove', function (e) {
      if (!tracking) return;
      var t = e.touches[0];
      var now = Date.now();
      var dt = now - lastTime || 1;

      if (trackY) {
        var dy = lastY - t.clientY;
        velocityY = dy / dt;
        el.scrollTop = startScrollTop + (startY - t.clientY);
      }
      if (trackX) {
        var dx = lastX - t.clientX;
        velocityX = dx / dt;
        el.scrollLeft = startScrollLeft + (startX - t.clientX);
      }

      lastX = t.clientX;
      lastY = t.clientY;
      lastTime = now;

      /* stopPropagation để scroll của el không bị parent nuốt */
      e.stopPropagation();
    }, { passive: true });

    el.addEventListener('touchend', function () {
      if (!tracking) return;
      tracking = false;

      /* Momentum scrolling cho cả 2 trục */
      (function momentum() {
        var moving = false;
        if (trackY && Math.abs(velocityY) >= 0.02) {
          el.scrollTop += velocityY * 16;
          velocityY *= 0.88;
          moving = true;
        }
        if (trackX && Math.abs(velocityX) >= 0.02) {
          el.scrollLeft += velocityX * 16;
          velocityX *= 0.88;
          moving = true;
        }
        if (!moving) return;
        rafId = requestAnimationFrame(momentum);
      })();
    }, { passive: true });

    el.addEventListener('touchcancel', function () {
      tracking = false;
      velocityX = 0; velocityY = 0;
    }, { passive: true });
  }

  /* ── Scan toàn bộ DOM, gắn vào mọi scroll container ── */
  function scanAndAttach() {
    /* Các selector phổ biến trong project */
    var SELECTORS = [
      '.scoreboard-content',
      '.scoreboard-left-tools',
      '.score-edit-body',
      '#main',
      '#sidebar',
      '.mob-home',
      '.mob-drawer',
      '.rule-list-wrap',
      '.score-custom-form',
      '.ai-preview-wrap',
    ];

    /* Gắn theo selector cụ thể trước (nhanh) */
    SELECTORS.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(attach);
    });

    /* Sau đó quét rộng hơn: mọi element có overflow-y hoặc overflow-x auto/scroll */
    document.querySelectorAll('*').forEach(function (el) {
      if (el.__wkScrollFixed) return;
      var cs = window.getComputedStyle(el);
      if (cs.overflowY === 'auto' || cs.overflowY === 'scroll' ||
          cs.overflowX === 'auto' || cs.overflowX === 'scroll') {
        attach(el);
      }
    });
  }

  /* ── Chạy lần đầu sau khi DOM sẵn sàng ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanAndAttach);
  } else {
    scanAndAttach();
  }

  /* ── MutationObserver: re-scan khi DOM thay đổi ──
     Scoreboard và các app khác dùng innerHTML flush để render →
     mỗi lần render tạo ra element mới, cần gắn lại polyfill. */
  var scanTimer = null;
  var observer = new MutationObserver(function () {
    /* Debounce 120ms để không scan liên tục khi render hàng loạt */
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scanAndAttach, 120);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

})();
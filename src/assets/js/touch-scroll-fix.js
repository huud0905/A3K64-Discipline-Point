/* ============================================================
   touch-scroll-fix.js — Tối ưu cuộn cảm ứng trên thiết bị di động
   Đảm bảo cuộn mượt mà bằng { passive: true } và không chặn sự kiện.
*/
(function () {
  'use strict';

  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isTouch = isIOS || ('ontouchstart' in window);
  if (!isTouch) return;

  var SCROLL_SELECTOR = [
    '.seat-board-wrap',
    '.scoreboard-content',
    '.scoreboard-left-tools',
    '.score-edit-body',
    '#main',
    '#sidebar',
    '.mob-pages',
    '.mob-home',
    '.mob-drawer',
    '.mob-drawer-nav',
    '.rule-list-wrap',
    '.score-custom-form',
    '.ai-preview-wrap',
    '.win-content'
  ].join(', ');

  function applyNativeScrollHint(el) {
    if (!el || el.__wkScrollFixed) return;
    el.__wkScrollFixed = true;
    // Bổ sung cấu hình cuộn tự nhiên
    el.style.webkitOverflowScrolling = 'touch';
    el.style.touchAction = 'pan-y'; 
    if (!el.style.overscrollBehavior) {
      el.style.overscrollBehavior = 'contain';
    }
  }

  function initKnownContainers() {
    document.querySelectorAll(SCROLL_SELECTOR).forEach(applyNativeScrollHint);
  }

  function findScrollableAncestor(target) {
    var node = target && target.nodeType === 1 ? target : target && target.parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
      if (node.__wkScrollFixed) return node;
      if (node.matches && node.matches(SCROLL_SELECTOR)) {
        applyNativeScrollHint(node);
        return node;
      }
      if (!node.__wkScrollChecked) {
        node.__wkScrollChecked = true;
        var cs = window.getComputedStyle(node);
        if (cs.overflowY === 'auto' || cs.overflowY === 'scroll' ||
            cs.overflowX === 'auto' || cs.overflowX === 'scroll') {
          applyNativeScrollHint(node);
          return node;
        }
      }
      node = node.parentElement;
    }
    return null;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initKnownContainers, { once: true });
  } else {
    initKnownContainers();
  }

  // Luôn sử dụng { passive: true } và TUYỆT ĐỐI KHÔNG gọi preventDefault()
  document.addEventListener('touchstart', function (e) {
    findScrollableAncestor(e.target);
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    // Không gọi preventDefault() để giữ hành vi cuộn mặc định
  }, { passive: true });
})();

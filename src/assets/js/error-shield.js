/* ============================================================
   A3K64 — Error Shield (Bộ chắn lỗi extension & script ngoại lai)
   Chặn các unhandled rejection và lỗi runtime từ extension trình duyệt
   (như 200.js, content.js, adblockers, cashback trackers M_ID...)
   để đảm bảo không làm nghẽn hoặc gián đoạn vòng đời render của ứng dụng.
   ============================================================ */
(function (global) {
  'use strict';
  function isExtensionNoise(msg, src) {
    var str = String(msg || '') + ' ' + String(src || '');
    return /200\.js|content\.js|M_ID|chrome-extension|moz-extension|safari-web-extension|run-ad-auction|join-ad-interest|private-aggregation|attribution-reporting/i.test(str);
  }

  global.addEventListener('error', function (e) {
    var msg = (e && e.message) || '';
    var src = (e && e.filename) || '';
    if (isExtensionNoise(msg, src)) {
      if (e.preventDefault) e.preventDefault();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      return true;
    }
  }, true);

  global.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    var msg = (r && (r.message || r.stack || String(r))) || '';
    if (isExtensionNoise(msg, '')) {
      if (e.preventDefault) e.preventDefault();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    }
  }, true);
})(typeof window !== 'undefined' ? window : this);

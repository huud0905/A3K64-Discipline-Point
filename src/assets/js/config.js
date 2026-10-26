/* ============================================================
   A3K64 — Cấu hình dùng chung (GAS Web App URL, v.v.)
   Nạp file này TRƯỚC các script khác cần gọi API (login.html,
   scoreboard-window.html, classroom-window.html, ...).
   ============================================================ */
window.A3K64_CONFIG = {
  // Đổi từ Google Apps Script Web App URL sang Cloudflare Worker URL.
  // Format request/response giữ nguyên (?action=xxx&payload=...), nên
  // mọi chỗ khác gọi qua A3K64_CONFIG.gasUrl (preload.js, notify.js,
  // scoreboard.js, ...) KHÔNG cần sửa gì thêm.
  gasUrl: 'https://a3k64-api.huud09052009.workers.dev/',
};

/* ------------------------------------------------------------
   Tự gắn phiên đăng nhập vào MỌI request tới backend.
   Backend giờ bắt buộc đăng nhập cho mọi action (trừ login/OTP/getConfig),
   nên các module cũ (bảng điểm, sơ đồ, hồ sơ, tải trước…) không cần sửa từng chỗ:
   chỉ cần tải config.js là request tới gasUrl tự có "Authorization: Bearer <token>".
   Request nào đã tự gửi Authorization thì giữ nguyên.
   ------------------------------------------------------------ */
(function () {
  if (window.__a3AuthFetch || !window.fetch) return;
  window.__a3AuthFetch = true;
  var TOKEN_KEY = 'a3k64-session-token';
  function token() {
    try { var s = sessionStorage.getItem(TOKEN_KEY); if (s) return s; } catch (e) {}
    try {
      var t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
      if (t && t.token && !(t.expiresAt && Date.now() > t.expiresAt)) return t.token;
    } catch (e) {}
    try { if (window.parent && window.parent !== window) return window.parent.sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) {}
    return '';
  }
  var orig = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      var base = window.A3K64_CONFIG && window.A3K64_CONFIG.gasUrl;
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var tk = token();
      if (base && tk && url.indexOf(base) === 0) {
        var h = new Headers((init && init.headers) || (input && input.headers) || undefined);
        if (!h.has('Authorization')) {
          h.set('Authorization', 'Bearer ' + tk);
          init = Object.assign({}, init || {}, { headers: h });
        }
      }
    } catch (e) {}
    return orig(input, init);
  };
})();
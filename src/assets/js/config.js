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
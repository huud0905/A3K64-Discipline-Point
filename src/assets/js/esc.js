// shared/esc.js — hàm escape HTML DÙNG CHUNG cho mọi app con.
// Trước đây mỗi app tự định nghĩa 1 hàm escape riêng cùng 1 logic hệt nhau
// (esc ở admin.js, escH ở scoreboard.js/seating.js, pEsc ở profile.js,
// dutyEscape ở duty.js, escapeBill ở settings-ui.js) — nay gộp về 1 chỗ,
// các file kia chỉ còn giữ tên hàm cũ (để không phải sửa mọi nơi gọi) nhưng
// đều gọi vào đây.
//
// Nạp file này ở <head>/<body>, TRƯỚC script riêng của app (admin.js,
// profile.js, scoreboard.js, duty.js, settings-ui.js, seating.js).
(function (global) {
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  global.a3k64EscapeHtml = escapeHtml;
})(window);

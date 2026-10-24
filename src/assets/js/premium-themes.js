/* ============================================================
   A3K64 — Hình nền / theme cao cấp (gói premium_ui)
   Dùng chung bởi desktop.html (áp nền) và settings-window.html (chọn nền).
   Thêm theme mới: thêm 1 mục vào A3_PREMIUM_WALLPAPERS.
   Lưu ý: tên khoá lưu lên server là `premiumTheme` (xem PREMIUM_UI_KEYS trong ok.js).
   ============================================================ */
(function () {
  'use strict';
  const KEY = 'a3k64-premium-wallpaper';
  const WALLPAPERS = {
    aurora:   { label: 'Cực quang',  css: 'radial-gradient(circle at 20% 15%, rgba(56,189,248,.45), transparent 35%), radial-gradient(circle at 80% 30%, rgba(167,139,250,.40), transparent 35%), linear-gradient(135deg,#041428,#0b1b3a 50%,#020617)' },
    sunset:   { label: 'Hoàng hôn',  css: 'radial-gradient(circle at 80% 10%, rgba(251,146,60,.50), transparent 38%), radial-gradient(circle at 15% 80%, rgba(236,72,153,.35), transparent 40%), linear-gradient(135deg,#1e1033,#3b0f2e 55%,#12060f)' },
    forest:   { label: 'Rừng đêm',   css: 'radial-gradient(circle at 25% 20%, rgba(52,211,153,.35), transparent 38%), radial-gradient(circle at 85% 75%, rgba(20,184,166,.25), transparent 36%), linear-gradient(135deg,#04140f,#0a2a20 50%,#020a07)' },
    sakura:   { label: 'Anh đào',    css: 'radial-gradient(circle at 18% 18%, rgba(244,114,182,.42), transparent 36%), radial-gradient(circle at 88% 60%, rgba(192,132,252,.28), transparent 38%), linear-gradient(135deg,#1f0b1c,#341033 52%,#10050f)' },
    midnight: { label: 'Vàng đen',   css: 'radial-gradient(circle at 80% 15%, rgba(250,204,21,.28), transparent 34%), radial-gradient(circle at 10% 85%, rgba(245,158,11,.18), transparent 38%), linear-gradient(135deg,#0a0a0a,#18181b 50%,#000)' },
  };

  function get() { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } }
  function set(id) { try { id ? localStorage.setItem(KEY, id) : localStorage.removeItem(KEY); } catch {} }

  // Áp nền lên #desktop-root; id rỗng/không hợp lệ → trả về nền mặc định của CSS.
  function apply(root) {
    root = root || document.getElementById('desktop-root');
    if (!root) return;
    const w = WALLPAPERS[get()];
    root.style.background = w ? w.css : '';
  }

  window.A3Premium = { KEY, WALLPAPERS, get, set, apply };
})();

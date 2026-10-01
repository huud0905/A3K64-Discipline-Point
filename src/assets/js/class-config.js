/* class-config.js — lấy tên lớp từ backend (action getConfig) rồi điền vào trang.
 * Nạp NGAY SAU config.js (cần window.A3K64_CONFIG.gasUrl).
 *
 * Cách dùng trong HTML:
 *   <h1 data-class-name></h1>                                        -> "A3K64"
 *   <h1 data-class-tpl="Bảng điểm {class}">Bảng điểm</h1>            -> "Bảng điểm A3K64"
 *   <p  data-class-tpl="Quản lý thi đua lớp {label}">...</p>         -> "... lớp 12A3"
 *   <title data-class-tpl="{class} - Quản Lí Thi Đua">...</title>
 * Trong JS: window.CLASS_NAME, window.CLASS_LABEL (có sẵn ngay từ lần vào thứ 2).
 */
(function () {
  var KEY = 'class-config-v1';
  var cfg = {};
  try { cfg = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
  window.CLASS_NAME  = cfg.className  || '';
  window.CLASS_LABEL = cfg.classLabel || '';

  function apply() {
    var n = window.CLASS_NAME, l = window.CLASS_LABEL;
    if (!n && !l) return;
    document.querySelectorAll('[data-class-tpl]').forEach(function (el) {
      el.textContent = el.getAttribute('data-class-tpl')
        .replace(/\{class\}/g, n).replace(/\{label\}/g, l);
    });
    document.querySelectorAll('[data-class-name]').forEach(function (el) { el.textContent = n; });
  }
  window.applyClassConfig = apply;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();

  var base = window.A3K64_CONFIG && window.A3K64_CONFIG.gasUrl;
  if (!base) return;
  try {
    var u = new URL(base);
    u.searchParams.set('action', 'getConfig');
    fetch(u.toString())
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var d = j && j.data;
        if (!d || !d.className) return;
        try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {}
        window.CLASS_NAME  = d.className;
        window.CLASS_LABEL = d.classLabel || '';
        apply();
        window.dispatchEvent(new CustomEvent('class-config', { detail: d }));
      })
      .catch(function () {});
  } catch (e) {}
})();

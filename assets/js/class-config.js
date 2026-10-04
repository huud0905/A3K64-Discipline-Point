/* class-config.js — lấy tên lớp + logo từ backend (action getConfig) rồi điền vào trang.
 * Nạp NGAY SAU config.js (cần window.A3K64_CONFIG.gasUrl).
 *
 * Cách dùng trong HTML:
 *   <h1 data-class-name></h1>                                        -> "A3K64"
 *   <h1 data-class-tpl="Bảng điểm {class}">Bảng điểm</h1>            -> "Bảng điểm A3K64"
 *   <p  data-class-tpl="Quản lý thi đua lớp {label}">...</p>         -> "... lớp A3K64"
 *   <title data-class-tpl="{class} - Quản Lí Thi Đua">...</title>
 *   <div class="logo" data-class-logo>🛡</div>                        -> emoji hoặc <img> theo lớp
 * Trong JS: window.CLASS_NAME, window.CLASS_LABEL, window.CLASS_LOGO, window.classLogoHTML().
 * Favicon (thẻ <link rel="icon">) cũng tự đổi theo logo của lớp.
 */
(function () {
  var KEY = 'class-config-v1';
  var cfg = {};
  try { cfg = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
  window.CLASS_NAME  = cfg.className  || '';
  window.CLASS_LABEL = cfg.classLabel || '';
  window.CLASS_LOGO  = cfg.logo       || '';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Chỉ chấp nhận ảnh dạng /đường-dẫn hoặc http(s)://; còn lại coi là emoji/chữ.
  function logoUrl(l) {
    if (/^https?:\/\//i.test(l)) return l;
    if (l.charAt(0) === '/' && l.charAt(1) !== '/') return location.origin + l;
    return null;
  }
  window.classLogoHTML = function () {
    var l = window.CLASS_LOGO;
    if (!l) return '🛡';
    var u = logoUrl(l);
    return u
      ? '<img src="' + esc(u) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block">'
      : esc(l);
  };

  function applyFavicon() {
    var l = window.CLASS_LOGO;
    if (!l) return;
    var u = logoUrl(l);
    var href = u || ('data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">' + esc(l) + '</text></svg>'));
    var link = document.querySelector('link[rel~="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.removeAttribute('type');
    link.href = href;
  }

  function apply() {
    var n = window.CLASS_NAME, l = window.CLASS_LABEL;
    if (n || l) {
      document.querySelectorAll('[data-class-tpl]').forEach(function (el) {
        el.textContent = el.getAttribute('data-class-tpl')
          .replace(/\{class\}/g, n).replace(/\{label\}/g, l);
      });
      document.querySelectorAll('[data-class-name]').forEach(function (el) { el.textContent = n; });
    }
    if (window.CLASS_LOGO) {
      var html = window.classLogoHTML();
      document.querySelectorAll('[data-class-logo]').forEach(function (el) { el.innerHTML = html; });
      applyFavicon();
    }
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
        window.CLASS_LOGO  = d.logo || '';
        apply();
        window.dispatchEvent(new CustomEvent('class-config', { detail: d }));
      })
      .catch(function () {});
  } catch (e) {}
})();

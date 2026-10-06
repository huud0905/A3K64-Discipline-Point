/* ============================================================
   A3K64 — Quản lý phiên đăng nhập DÙNG CHUNG giữa các tab
   Nạp file này sau config.js, trước mọi script khác cần phiên
   (login.html, desktop.html, mobile.html).

   Quy tắc:
   • Tick "Ghi nhớ" → user + token lưu localStorage 7 ngày (sống qua
     việc đóng trình duyệt, mọi tab mới tự dùng lại).
   • Không tick → chỉ lưu sessionStorage (đóng hết tab là mất), NHƯNG
     tab mới mở sẽ "xin" phiên từ tab đang mở qua BroadcastChannel.
   • Đăng xuất ở 1 tab → mọi tab khác tự về trang đăng nhập; token bị
     thu hồi ở máy chủ.
   • Đăng nhập ở 1 tab → trang đăng nhập đang mở ở tab khác tự vào app.
   • watch(): hỏi máy chủ token còn hiệu lực không (vào app, mỗi 30 giây,
     khi quay lại tab, và khi API báo hết phiên). Nếu đã bị "đăng xuất khỏi
     thiết bị" từ máy khác → hiện thông báo rồi buộc về trang đăng nhập.
   Giữ nguyên định dạng key cũ nên các module khác không cần sửa.
   ============================================================ */
(function () {
  'use strict';
  if (window.A3K64Session) return;

  var USER_KEY  = 'a3k64-user';
  var TOKEN_KEY = 'a3k64-session-token';
  var ENT_KEY   = 'a3-ent-v1';
  var REMEMBER_MS = 7 * 24 * 60 * 60 * 1000;
  var WATCH_MIN_GAP_MS = 60 * 1000;

  var SCRIPT_URL = document.currentScript && document.currentScript.src;
  function urlOf(rel) { try { return new URL(rel, SCRIPT_URL).href; } catch (e) { return rel; } }
  var LOGIN_URL = urlOf('../../auth/login.html');
  function isMobileDevice() {
    return Math.min(window.innerWidth, window.innerHeight) < 768 ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  }
  function homeUrl() {
    return urlOf(isMobileDevice() ? '../../mobile/mobile.html' : '../../desktop/desktop.html');
  }
  function onAuthPage()  { return /\/auth\//i.test(location.pathname); }
  function onLoginPage() { return /\/auth\/login\.html/i.test(location.pathname); }

  function jget(store, key) {
    try { return JSON.parse(store.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function sget(key) { try { return sessionStorage.getItem(key); } catch (e) { return null; } }

  var channel = null;
  try { if (typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel('a3k64-auth'); } catch (e) {}
  function post(msg) { try { if (channel) channel.postMessage(msg); } catch (e) {} }

  // ── Đọc ───────────────────────────────────────────────────
  function currentToken() {
    var s = sget(TOKEN_KEY);
    if (s) return s;
    var t = jget(localStorage, TOKEN_KEY);
    if (t && t.token && !(t.expiresAt && Date.now() > t.expiresAt)) return t.token;
    return '';
  }

  function readRemembered() {
    var u = jget(localStorage, USER_KEY);
    if (!u) return null;
    if (u.expiresAt && Date.now() > u.expiresAt) {
      try { localStorage.removeItem(USER_KEY); localStorage.removeItem(TOKEN_KEY); } catch (e) {}
      return null;
    }
    var t = jget(localStorage, TOKEN_KEY);
    var token = (t && t.token && !(t.expiresAt && Date.now() > t.expiresAt)) ? t.token : '';
    return { user: u, token: token };
  }

  function mirror(user, token) {
    try { sessionStorage.setItem(USER_KEY, JSON.stringify(user)); } catch (e) {}
    try { if (token) sessionStorage.setItem(TOKEN_KEY, token); } catch (e) {}
  }

  // Có phiên ngay trong tab này / localStorage? (đồng bộ)
  function restoreSync() {
    var su = jget(sessionStorage, USER_KEY);
    if (su) return su;
    var r = readRemembered();
    if (r) { mirror(r.user, r.token); return r.user; }
    return null;
  }

  // Xin phiên từ tab khác đang mở (trường hợp không tick "Ghi nhớ")
  function askOtherTabs(timeoutMs) {
    return new Promise(function (resolve) {
      if (!channel) return resolve(null);
      var done = false;
      function finish(v) { if (done) return; done = true; channel.removeEventListener('message', onMsg); resolve(v); }
      function onMsg(ev) {
        var m = ev.data || {};
        if (m.type === 'res' && m.user) { mirror(m.user, m.token); finish(m.user); }
      }
      channel.addEventListener('message', onMsg);
      post({ type: 'req' });
      setTimeout(function () { finish(null); }, timeoutMs || 400);
    });
  }

  function restore() {
    var u = restoreSync();
    if (u) return Promise.resolve(u);
    return askOtherTabs(400);
  }

  // ── Ghi / xoá ─────────────────────────────────────────────
  function save(opts) {
    var user = opts.user, token = opts.token || '', remember = !!opts.remember;
    mirror(user, token);
    try {
      if (remember) {
        var exp = Date.now() + REMEMBER_MS;
        var withExp = {}; for (var k in user) withExp[k] = user[k];
        withExp.expiresAt = exp;
        localStorage.setItem(USER_KEY, JSON.stringify(withExp));
        if (token) localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: token, expiresAt: exp }));
      } else {
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch (e) {}
    post({ type: 'login', user: user, token: token });
  }

  function clear() {
    [sessionStorage, localStorage].forEach(function (st) {
      try { st.removeItem(USER_KEY); st.removeItem(TOKEN_KEY); st.removeItem(ENT_KEY); } catch (e) {}
    });
  }

  function gasUrl() { try { return window.A3K64_CONFIG && window.A3K64_CONFIG.gasUrl || ''; } catch (e) { return ''; } }

  function logout() {
    var token = currentToken();
    var gas = gasUrl();
    clear();
    post({ type: 'logout' });
    var revoke = Promise.resolve();
    if (token && gas) {
      revoke = Promise.race([
        fetch(gas, {
          method: 'POST', keepalive: true,
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ action: 'logout', payload: { sessionToken: token } }),
        }).catch(function () {}),
        new Promise(function (r) { setTimeout(r, 1500); }),
      ]);
    }
    return revoke.then(function () { location.replace(LOGIN_URL); });
  }

  // ── Kiểm tra token còn hiệu lực ở máy chủ ─────────────────
  // Lỗi mạng / máy chủ chưa hỗ trợ action → coi như còn hiệu lực (không
  // đá người dùng ra chỉ vì mất mạng).
  function validate() {
    var token = currentToken(), gas = gasUrl();
    if (!token || !gas) return Promise.resolve(true);
    return fetch(gas, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ action: 'validateSession', payload: { sessionToken: token } }),
    }).then(function (r) { return r.json(); })
      .then(function (j) { var d = j && j.data; return !(d && d.valid === false); })
      .catch(function () { return true; });
  }

  // ── Bị đăng xuất từ thiết bị khác → khoá màn hình, báo rõ rồi buộc về trang đăng nhập ──
  var kickedShown = false;
  function kicked() {
    if (kickedShown) return;
    kickedShown = true;
    clear();
    post({ type: 'logout' });   // các tab khác của máy này cũng tự về trang đăng nhập
    function go() { location.replace(LOGIN_URL); }
    if (!document.body) return go();
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(2,6,23,.82);backdrop-filter:blur(6px);font-family:system-ui,-apple-system,"Segoe UI",sans-serif';
    var box = document.createElement('div');
    box.style.cssText = 'width:100%;max-width:400px;padding:24px;border:1px solid #334155;border-radius:18px;background:#0b1220;color:#f8fafc;box-shadow:0 24px 60px rgba(0,0,0,.5)';
    var h = document.createElement('h3');
    h.textContent = 'Phiên đăng nhập đã kết thúc';
    h.style.cssText = 'margin:0 0 8px;font-size:17px;font-weight:800';
    var pEl = document.createElement('p');
    pEl.textContent = 'Tài khoản này đã được đăng xuất từ một thiết bị khác. Đang chuyển về trang đăng nhập…';
    pEl.style.cssText = 'margin:0 0 18px;font-size:13px;line-height:1.55;color:#cbd5e1';
    var btn = document.createElement('button');
    btn.textContent = 'Đăng nhập lại';
    btn.style.cssText = 'height:36px;padding:0 16px;border:0;border-radius:10px;background:#2563eb;color:#fff;font:600 13px inherit;cursor:pointer;float:right';
    btn.addEventListener('click', go);
    box.appendChild(h); box.appendChild(pEl); box.appendChild(btn);
    ov.appendChild(box);
    document.body.appendChild(ov);
    setTimeout(go, 2500);
  }

  // Mọi lệnh gọi API báo "phiên hết hạn" → hỏi lại máy chủ cho chắc rồi mới đá ra
  // (tránh đá nhầm khi 1 module nào đó quên gửi token).
  function hookFetch() {
    if (window.__a3FetchHooked || !window.fetch) return;
    window.__a3FetchHooked = true;
    var orig = window.fetch.bind(window);
    var verifying = false;
    window.fetch = function (input, init) {
      var p = orig(input, init);
      try {
        var gas = gasUrl();
        var url = typeof input === 'string' ? input : ((input && input.url) || '');
        if (gas && url.indexOf(gas) === 0 && currentToken()) {
          p.then(function (res) {
            var ct = (res.headers && res.headers.get('content-type')) || '';
            if (ct.indexOf('application/json') === -1) return;
            res.clone().json().then(function (j) {
              var d = j && j.data;
              if (d && d.ok === false && /Phiên đăng nhập đã hết hạn/.test(d.error || '') && !verifying) {
                verifying = true;
                validate().then(function (ok) { verifying = false; if (!ok) kicked(); });
              }
            }).catch(function () {});
          }).catch(function () {});
        }
      } catch (e) {}
      return p;
    };
  }

  // Kiểm tra ngay khi vào app, rồi mỗi 30 giây (tab đang hiển thị) và mỗi khi quay lại tab.
  var WATCH_INTERVAL_MS = 30 * 1000;
  var lastCheck = 0, watching = false;
  function watch() {
    if (watching) return;
    watching = true;
    function check() {
      if (document.hidden || Date.now() - lastCheck < 5000) return;
      lastCheck = Date.now();
      validate().then(function (ok) { if (!ok) kicked(); });
    }
    check();
    setInterval(check, WATCH_INTERVAL_MS);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    hookFetch();
  }

  // ── Đồng bộ giữa các tab ──────────────────────────────────
  if (channel) {
    channel.addEventListener('message', function (ev) {
      var m = ev.data || {};
      if (m.type === 'req') {
        var u = jget(sessionStorage, USER_KEY);
        if (u) post({ type: 'res', user: u, token: sget(TOKEN_KEY) || '' });
      } else if (m.type === 'logout') {
        clear();
        if (!onAuthPage()) location.replace(LOGIN_URL);
      } else if (m.type === 'login') {
        if (onLoginPage() && m.user) { mirror(m.user, m.token); location.replace(homeUrl()); }
      }
    });
  }

  window.A3K64Session = {
    restoreSync: restoreSync, restore: restore, save: save, clear: clear,
    logout: logout, validate: validate, watch: watch, kicked: kicked,
    currentToken: currentToken, homeUrl: homeUrl, loginUrl: function () { return LOGIN_URL; },
  };
})();
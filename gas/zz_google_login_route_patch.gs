/*
 * FINAL PATCH: Google Login -> kiểm tra Gmail trong ACCOUNTS
 * Dán file này xuống CUỐI Api.gs nếu đang dùng file gộp.
 *
 * Lý do cần patch này:
 * - Frontend gọi action=googleLogin.
 * - Một số bản Api.gs gộp cũ có helper loginWithGoogleEmail nhưng routeAction cuối cùng
 *   chưa expose action googleLogin, nên frontend luôn hiểu là Gmail chưa được cấp quyền.
 */

var __A3_GOOGLE_LOGIN_ROUTE_PATCH__ = __A3_GOOGLE_LOGIN_ROUTE_PATCH__ || {};

(function () {
  if (__A3_GOOGLE_LOGIN_ROUTE_PATCH__.installed) return;
  if (typeof routeAction !== 'function') return;
  __A3_GOOGLE_LOGIN_ROUTE_PATCH__.installed = true;

  var previousRouteAction = routeAction;

  routeAction = function (action, payload, params) {
    if (action === 'googleLogin' || action === 'loginWithGoogleEmail') {
      return { ok: true, data: A3K64_googleLoginByEmail_(payload || {}) };
    }
    return previousRouteAction(action, payload, params);
  };
})();

function A3K64_googleLoginByEmail_(payload) {
  payload = payload || {};
  var email = txt(payload.email || payload.googleEmail || payload.username).toLowerCase();
  if (!email) return { ok: false, error: 'Không nhận được Gmail từ Google.' };

  var account = A3K64_findAccountByGmail_(email);
  if (!account) return { ok: false, error: 'Gmail này chưa được cấp quyền trong ACCOUNTS.' };

  return {
    ok: true,
    user: {
      uid: txt(payload.uid) || ('google-' + studentId(account.username || email, 0)),
      displayName: account.name || account.fullname || account.hoten || txt(payload.displayName) || email,
      email: account.username || email,
      photoURL: txt(payload.photoURL) || null,
      provider: 'google',
      role: account.role || 'hoc_sinh',
      group: account.group || account.to || ''
    }
  };
}

function A3K64_findAccountByGmail_(email) {
  email = txt(email).toLowerCase();
  if (!email) return null;

  var list = [];
  try {
    if (typeof accounts === 'function') list = accounts() || [];
  } catch (err) {
    list = [];
  }

  for (var i = 0; i < list.length; i++) {
    var item = list[i] || {};
    var username = txt(item.username).toLowerCase();
    var accountEmail = txt(item.email || item.gmail).toLowerCase();
    if (username === email || accountEmail === email) return item;
  }

  // Fallback đọc trực tiếp sheet ACCOUNTS để tránh cache cũ hoặc accounts() thiếu cột.
  var sheet = sheetAny([ACCOUNTS_SHEET_NAME, 'ACCOUNTS']);
  var values = vals(sheet);
  if (!sheet || values.length < 2) return null;

  var headerRow = hrow(values, ['username', 'role']);
  if (headerRow < 0) headerRow = 0;
  var map = hmap(values, headerRow);
  var usernameCol = map.username !== undefined ? map.username : 0;
  var roleCol = map.role !== undefined ? map.role : 2;
  var groupCol = map.to !== undefined ? map.to : (map.group !== undefined ? map.group : 3);
  var nameCol = map.hoten !== undefined ? map.hoten : (map.name !== undefined ? map.name : (map.hovaten !== undefined ? map.hovaten : 4));
  var emailCol = map.email !== undefined ? map.email : (map.gmail !== undefined ? map.gmail : usernameCol);

  for (var row = headerRow + 1; row < values.length; row++) {
    var usernameValue = txt(values[row][usernameCol]);
    var emailValue = txt(values[row][emailCol]);
    if (usernameValue.toLowerCase() !== email && emailValue.toLowerCase() !== email) continue;
    return {
      username: usernameValue || emailValue || email,
      role: txt(values[row][roleCol]) || 'hoc_sinh',
      group: txt(values[row][groupCol]),
      to: txt(values[row][groupCol]),
      name: txt(values[row][nameCol]),
      fullname: txt(values[row][nameCol])
    };
  }

  return null;
}

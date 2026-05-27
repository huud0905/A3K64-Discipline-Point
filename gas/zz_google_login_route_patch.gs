/*
 * FINAL SELF-CONTAINED PATCH v2: Google Login -> kiểm tra Gmail trong ACCOUNTS
 *
 * Dán TOÀN BỘ file này xuống CUỐI Api.gs, Save, Deploy New version.
 * Bản v2 dùng flag riêng để không bị patch cũ chặn mất lượt cài đặt.
 * Nó chặn trực tiếp doGet/doPost khi action=googleLogin hoặc loginWithGoogleEmail.
 */

var __A3_GOOGLE_LOGIN_ROUTE_PATCH_V2__ = __A3_GOOGLE_LOGIN_ROUTE_PATCH_V2__ || {};

(function () {
  if (__A3_GOOGLE_LOGIN_ROUTE_PATCH_V2__.installed) return;
  __A3_GOOGLE_LOGIN_ROUTE_PATCH_V2__.installed = true;

  var previousRouteAction = typeof routeAction === 'function' ? routeAction : null;
  if (previousRouteAction) {
    routeAction = function (action, payload, params) {
      if (A3K64_isGoogleLoginActionV2_(action)) {
        return { ok: true, data: A3K64_googleLoginByEmailV2_(payload || params || {}) };
      }
      return previousRouteAction(action, payload, params);
    };
  }

  var previousDoGet = typeof doGet === 'function' ? doGet : null;
  if (previousDoGet) {
    doGet = function (e) {
      if (A3K64_isGoogleLoginActionV2_(e && e.parameter && e.parameter.action)) {
        return A3K64_googleLoginOutputV2_(e);
      }
      return previousDoGet(e);
    };
  }

  var previousDoPost = typeof doPost === 'function' ? doPost : null;
  if (previousDoPost) {
    doPost = function (e) {
      if (A3K64_isGoogleLoginActionV2_(e && e.parameter && e.parameter.action)) {
        return A3K64_googleLoginOutputV2_(e);
      }
      return previousDoPost(e);
    };
  }
})();

function A3K64_isGoogleLoginActionV2_(action) {
  action = A3K64_txtV2_(action);
  return action === 'googleLogin' || action === 'loginWithGoogleEmail';
}

function A3K64_googleLoginOutputV2_(e) {
  var params = (e && e.parameter) || {};
  var payload = A3K64_parseJsonV2_(params.payload) || params || {};
  var result;
  try {
    result = { ok: true, data: A3K64_googleLoginByEmailV2_(payload) };
  } catch (err) {
    result = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return A3K64_outputV2_(result, params.callback);
}

function A3K64_outputV2_(obj, callback) {
  var text = JSON.stringify(obj);
  if (callback) text = String(callback) + '(' + text + ')';
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function A3K64_googleLoginByEmailV2_(payload) {
  payload = payload || {};
  if (typeof payload === 'string') payload = { email: payload, googleEmail: payload, username: payload };
  var email = A3K64_txtV2_(payload.email || payload.googleEmail || payload.username).toLowerCase();
  if (!email) return { ok: false, error: 'Không nhận được Gmail từ Google.' };

  var account = A3K64_findAccountByGmailV2_(email);
  if (!account) return { ok: false, error: 'Gmail này chưa được cấp quyền trong ACCOUNTS: ' + email };

  return {
    ok: true,
    user: {
      uid: A3K64_txtV2_(payload.uid) || ('google-' + email.replace(/[^a-z0-9]/g, '_')),
      displayName: account.name || account.fullname || account.hoten || A3K64_txtV2_(payload.displayName) || email,
      email: account.username || account.email || account.gmail || email,
      photoURL: A3K64_txtV2_(payload.photoURL) || null,
      provider: 'google',
      role: account.role || 'hoc_sinh',
      group: account.group || account.to || account.group_num || ''
    }
  };
}

function A3K64_findAccountByGmailV2_(email) {
  email = A3K64_txtV2_(email).toLowerCase();
  if (!email) return null;

  // Xoá cache auth/account cũ trước khi đọc để tránh vừa sửa ACCOUNTS nhưng backend vẫn dùng cache cũ.
  try { CacheService.getScriptCache().removeAll(['AUTH_ACCOUNTS_V27', 'a3k64_accounts_main']); } catch (ignoredCache) {}

  // Ưu tiên hàm accounts() có sẵn nếu Api.gs đang dùng.
  try {
    if (typeof accounts === 'function') {
      var list = accounts() || [];
      for (var i = 0; i < list.length; i++) {
        var item = list[i] || {};
        var username = A3K64_txtV2_(item.username).toLowerCase();
        var accountEmail = A3K64_txtV2_(item.email || item.gmail).toLowerCase();
        if (username === email || accountEmail === email) return item;
      }
    }
  } catch (ignoredAccounts) {}

  // Fallback tự đọc sheet ACCOUNTS, không phụ thuộc helper cũ.
  var ss = SpreadsheetApp.openById(typeof SPREADSHEET_ID !== 'undefined' ? SPREADSHEET_ID : SpreadsheetApp.getActiveSpreadsheet().getId());
  var sheet = ss.getSheetByName('ACCOUNTS');
  if (!sheet) return null;
  var values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return null;

  var headerRow = A3K64_findHeaderRowV2_(values);
  var header = values[headerRow] || [];
  var map = A3K64_headerMapV2_(header);

  var usernameCol = A3K64_pickColV2_(map, ['username', 'user', 'gmail', 'email'], 0);
  var emailCol = A3K64_pickColV2_(map, ['email', 'gmail', 'username'], usernameCol);
  var roleCol = A3K64_pickColV2_(map, ['role', 'vai_tro', 'vaitro'], 2);
  var groupCol = A3K64_pickColV2_(map, ['to', 'group', 'group_num', 'nhom', 'tổ'], 3);
  var nameCol = A3K64_pickColV2_(map, ['hoten', 'ho_ten', 'hovaten', 'fullname', 'displayname', 'name'], 4);

  for (var row = headerRow + 1; row < values.length; row++) {
    var usernameValue = A3K64_txtV2_(values[row][usernameCol]);
    var emailValue = A3K64_txtV2_(values[row][emailCol]);
    if (usernameValue.toLowerCase() !== email && emailValue.toLowerCase() !== email) continue;
    return {
      username: usernameValue || emailValue || email,
      email: emailValue || usernameValue || email,
      role: A3K64_txtV2_(values[row][roleCol]) || 'hoc_sinh',
      group: A3K64_txtV2_(values[row][groupCol]),
      to: A3K64_txtV2_(values[row][groupCol]),
      name: A3K64_txtV2_(values[row][nameCol]),
      fullname: A3K64_txtV2_(values[row][nameCol])
    };
  }

  return null;
}

function A3K64_findHeaderRowV2_(values) {
  for (var r = 0; r < Math.min(values.length, 8); r++) {
    var joined = values[r].map(function (v) { return A3K64_keyV2_(v); }).join('|');
    if (joined.indexOf('username') >= 0 || joined.indexOf('email') >= 0 || joined.indexOf('gmail') >= 0) return r;
  }
  return 0;
}

function A3K64_headerMapV2_(header) {
  var map = {};
  for (var i = 0; i < header.length; i++) {
    var key = A3K64_keyV2_(header[i]);
    if (key) map[key] = i;
  }
  return map;
}

function A3K64_pickColV2_(map, names, fallback) {
  for (var i = 0; i < names.length; i++) {
    var key = A3K64_keyV2_(names[i]);
    if (map[key] !== undefined) return map[key];
  }
  return fallback;
}

function A3K64_parseJsonV2_(value) {
  try { return value ? JSON.parse(value) : null; } catch (err) { return null; }
}

function A3K64_txtV2_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function A3K64_keyV2_(value) {
  return A3K64_txtV2_(value)
    .toLowerCase()
    .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
    .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
    .replace(/[ìíịỉĩ]/g, 'i')
    .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
    .replace(/[ùúụủũưừứựửữ]/g, 'u')
    .replace(/[ỳýỵỷỹ]/g, 'y')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

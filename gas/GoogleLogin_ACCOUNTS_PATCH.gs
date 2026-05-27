/*
 * A3K64 Google Login -> ACCOUNTS patch
 *
 * Cách dùng nếu Api.gs trên Apps Script chưa có route googleLogin:
 * 1) Mở Apps Script.
 * 2) Dán toàn bộ file này xuống CUỐI Api.gs.
 * 3) Save -> Deploy -> Manage deployments -> Edit -> New version -> Deploy.
 *
 * Luồng hoạt động:
 * - Frontend đăng nhập Firebase Google để lấy email đã xác thực.
 * - GAS chỉ kiểm tra email đó có nằm trong sheet ACCOUNTS hay không.
 * - Nếu trùng ACCOUNTS cột username/email thì trả role, tổ, họ tên.
 */

function routeAction(action, payload, params) {
  payload = payload || {};
  params = params || {};

  if (action === 'getScoreboard') return { ok: true, data: getScoreboardData() };
  if (action === 'getRules') return { ok: true, data: { rules: readRules(), updatedAt: iso() } };
  if (action === 'getStudentChangeHistory') return { ok: true, data: readRows(HISTORY_SHEET_NAME, params || payload || {}) };
  if (action === 'getPermissionRequests') return { ok: true, data: readRows(PERMISSION_SHEET_NAME, params || payload || {}) };
  if (action === 'getNotifications') return { ok: true, data: readRows(NOTIFICATION_SHEET_NAME, params || payload || {}) };
  if (action === 'getPersonalization') return { ok: true, data: getPersonalization(payload) };

  if (action === 'login') return { ok: true, data: login(payload) };
  if (action === 'googleLogin') return { ok: true, data: googleLogin(payload) };
  if (action === 'verifyAccountRecovery') return { ok: true, data: verifyAccountRecovery(payload) };
  if (action === 'resetPassword') return { ok: true, data: resetPassword(payload) };

  if (action === 'addScoreEvent') {
    if (typeof A3K64_checkEditAllowedV2_ === 'function') A3K64_checkEditAllowedV2_(payload.week || DEFAULT_WEEK, payload);
    else if (typeof A3K64_assertWeekEditable_ === 'function') A3K64_assertWeekEditable_(payload.week || DEFAULT_WEEK);
    return { ok: true, data: { event: addScoreEvent(payload), scoreboard: getScoreboardData() } };
  }

  if (action === 'deleteScoreEvent') {
    var deleteWeek = typeof A3K64_weekFromEventIdV2_ === 'function' ? A3K64_weekFromEventIdV2_(payload.id) : A3K64_weekFromEventId_(payload.id);
    if (typeof A3K64_checkEditAllowedV2_ === 'function') A3K64_checkEditAllowedV2_(deleteWeek, payload);
    else if (typeof A3K64_assertWeekEditable_ === 'function') A3K64_assertWeekEditable_(deleteWeek);
    return { ok: true, data: { deleted: deleteScoreEvent(payload.id), scoreboard: getScoreboardData() } };
  }

  if (action === 'bulkScore') {
    if (typeof A3K64_checkEditAllowedV2_ === 'function') A3K64_checkEditAllowedV2_(payload.week || DEFAULT_WEEK, payload);
    else if (typeof A3K64_assertWeekEditable_ === 'function') A3K64_assertWeekEditable_(payload.week || DEFAULT_WEEK);
    return { ok: true, data: bulkScore(payload) };
  }

  if (action === 'createWeek') return { ok: true, data: createWeek(payload.week) };
  if (action === 'createEditPermissionRequest') return { ok: true, data: createRequest(payload) };
  if (action === 'resolveEditPermissionRequest') return { ok: true, data: resolveRequest(payload) };
  if (action === 'savePersonalization') return { ok: true, data: savePersonalization(payload) };

  return { ok: true, message: 'GAS API is running', updatedAt: iso() };
}

function googleLogin(payload) {
  payload = payload || {};
  var email = txt(payload.email).toLowerCase();
  if (!email) return { ok: false, error: 'Không nhận được Gmail từ Google.' };

  var account = findAccountByEmail_(email);
  if (!account) return { ok: false, error: 'Gmail này chưa được cấp quyền trong ACCOUNTS.' };

  log('googleLogin', email, 'Đăng nhập Google', { role: account.role, group: account.group });

  return {
    ok: true,
    user: {
      uid: txt(payload.uid) || ('google-' + studentId(email, 0)),
      displayName: account.name || txt(payload.displayName) || email,
      email: account.username || email,
      photoURL: txt(payload.photoURL) || null,
      provider: 'google',
      role: account.role || 'hoc_sinh',
      group: account.group || ''
    }
  };
}

function findAccountByEmail_(email) {
  email = txt(email).toLowerCase();
  if (!email) return null;
  var list = accounts();
  for (var i = 0; i < list.length; i++) {
    var username = txt(list[i].username).toLowerCase();
    var accountEmail = txt(list[i].email).toLowerCase();
    if (username === email || accountEmail === email) return list[i];
  }
  return null;
}

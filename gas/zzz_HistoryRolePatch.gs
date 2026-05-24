/*
 * _CHANGE_HISTORY role patch
 *
 * Quy ước dữ liệu lịch sử:
 * - row_idx: số hàng thật trong trang tính. Ví dụ học sinh ở hàng 35 thì ghi 35.
 * - group_num: số tổ dạng 1, 2, 3, 4.
 * - role: lấy trực tiếp từ sheet ACCOUNTS, cột C của người sửa điểm.
 *
 * File zzz_ để chạy sau Api.gs và zz_BulkHistoryPatch.gs.
 */

function A3K64_historyActorCandidates_(actor) {
  actor = actor || {};
  if (typeof actor !== 'object') actor = { username: actor };
  var list = [
    actor.username,
    actor.actorEmail,
    actor.email,
    actor.createdByEmail,
    actor.uid,
    actor.actorName,
    actor.name,
    actor.displayName,
    actor.createdBy
  ].map(txt).filter(Boolean);

  var seen = {};
  return list.filter(function (item) {
    var k = key(item);
    if (!k || seen[k]) return false;
    seen[k] = true;
    return true;
  });
}

function A3K64_roleFromAccountsColumnC_(actor) {
  var candidates = A3K64_historyActorCandidates_(actor);
  if (!candidates.length) return '';

  var sheet = sheetAny([ACCOUNTS_SHEET_NAME]);
  var values = vals(sheet);
  if (!sheet || values.length < 2) return '';

  var headerRow = hrow(values, ['username', 'password', 'role']);
  if (headerRow < 0) headerRow = 0;

  // Theo yêu cầu: role lấy trong ACCOUNTS, cột C.
  var usernameCol = 0;
  var roleCol = 2;
  var nameCol = 4;

  for (var row = headerRow + 1; row < values.length; row++) {
    var username = txt(values[row][usernameCol]);
    var displayName = txt(values[row][nameCol]);
    var role = txt(values[row][roleCol]);
    if (!role) continue;

    for (var i = 0; i < candidates.length; i++) {
      var target = candidates[i];
      if (username && txt(username).toLowerCase() === txt(target).toLowerCase()) return role;
      if (username && key(username) === key(target)) return role;
      if (displayName && key(displayName) === key(target)) return role;
    }
  }

  return '';
}

function historyActor(actor) {
  actor = actor || {};
  if (typeof actor !== 'object') actor = { username: actor };

  var username = txt(actor.username || actor.actorName || actor.actorEmail || actor.email || actor.uid || actor.createdBy) || 'Web';
  var roleFromSheet = A3K64_roleFromAccountsColumnC_(actor) || A3K64_roleFromAccountsColumnC_({ username: username });
  var fallbackRole = txt(actor.role || actor.actorRole);

  return {
    username: username,
    role: roleFromSheet || fallbackRole
  };
}

function A3K64_bulkActor_(payload) {
  payload = payload || {};
  var actor = {
    username: txt(payload.createdBy || payload.actorName || payload.username || payload.actorEmail || payload.email) || 'Web',
    actorEmail: payload.actorEmail || payload.email || payload.username,
    actorName: payload.actorName || payload.createdBy || payload.displayName,
    email: payload.email,
    uid: payload.uid || payload.actorUid,
    role: txt(payload.role || payload.actorRole)
  };

  var fixed = historyActor(actor);
  return {
    username: fixed.username,
    role: fixed.role
  };
}

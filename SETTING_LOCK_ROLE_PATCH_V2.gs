var A3K64_SETTING_SHEET_NAME_V2 = 'SETTING';
var A3K64_SETTING_HEADERS_V2 = ['tuần', 'start', 'end'];
var A3K64_TIMEZONE_V2 = 'Asia/Ho_Chi_Minh';
var A3K64_MANAGER_ROLES_V2 = ['gvcn', 'lop_truong', 'bi_thu'];

function iso() {
  var now = new Date();
  return Utilities.formatDate(now, A3K64_TIMEZONE_V2, "yyyy-MM-dd'T'HH:mm:ss.SSS") + '+07:00';
}

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
  if (action === 'verifyAccountRecovery') return { ok: true, data: verifyAccountRecovery(payload) };
  if (action === 'resetPassword') return { ok: true, data: resetPassword(payload) };
  if (action === 'addScoreEvent') { A3K64_checkEditAllowedV2_(payload.week || DEFAULT_WEEK, payload); return { ok: true, data: { event: addScoreEvent(payload), scoreboard: getScoreboardData() } }; }
  if (action === 'deleteScoreEvent') { A3K64_checkEditAllowedV2_(A3K64_weekFromEventIdV2_(payload.id), payload); return { ok: true, data: { deleted: deleteScoreEvent(payload.id), scoreboard: getScoreboardData() } }; }
  if (action === 'bulkScore') { A3K64_checkEditAllowedV2_(payload.week || DEFAULT_WEEK, payload); return { ok: true, data: bulkScore(payload) }; }
  if (action === 'createWeek') return { ok: true, data: createWeek(payload.week) };
  if (action === 'createEditPermissionRequest') return { ok: true, data: createRequest(payload) };
  if (action === 'resolveEditPermissionRequest') return { ok: true, data: resolveRequest(payload) };
  if (action === 'savePersonalization') return { ok: true, data: savePersonalization(payload) };
  return { ok: true, message: 'GAS API is running', updatedAt: iso() };
}

function getScoreboardData() {
  var studentList = students();
  var events = eventsFromWeeks(studentList);
  var weeks = Array.from(new Set(weekSheets().map(function (item) { return item.week; }).concat(events.map(function (event) { return event.week; })))).sort(function (a, b) { return a - b; });
  return { students: studentList, events: events, weeks: weeks.length ? weeks : [DEFAULT_WEEK], quickScoreReasons: readRules(), weekSettings: A3K64_readWeekSettingsV2_(), updatedAt: iso() };
}

function A3K64_settingSheetV2_() {
  var sheet = book().getSheetByName(A3K64_SETTING_SHEET_NAME_V2);
  if (!sheet) {
    sheet = book().insertSheet(A3K64_SETTING_SHEET_NAME_V2);
    sheet.getRange(1, 1, 1, A3K64_SETTING_HEADERS_V2.length).setValues([A3K64_SETTING_HEADERS_V2]);
    sheet.setFrozenRows(1);
    sheet.getRange('B:C').setNumberFormat('yyyy-mm-dd');
  }
  return sheet;
}

function A3K64_todayKeyV2_() { return Utilities.formatDate(new Date(), A3K64_TIMEZONE_V2, 'yyyy-MM-dd'); }
function A3K64_pad2V2_(value) { return String(value).padStart(2, '0'); }
function A3K64_weekNumberV2_(value) { var match = txt(value).match(/\d+/); return match ? Number(match[0]) : NaN; }

function A3K64_dateKeyV2_(value, displayValue) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return Utilities.formatDate(value, A3K64_TIMEZONE_V2, 'yyyy-MM-dd');
  var s = txt(value) || txt(displayValue);
  if (!s) return '';
  var ymd = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (ymd) return ymd[1] + '-' + A3K64_pad2V2_(ymd[2]) + '-' + A3K64_pad2V2_(ymd[3]);
  var dmy = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (dmy) return dmy[3] + '-' + A3K64_pad2V2_(dmy[2]) + '-' + A3K64_pad2V2_(dmy[1]);
  return '';
}

function A3K64_readWeekSettingsV2_() {
  var sheet = A3K64_settingSheetV2_();
  var range = sheet.getDataRange();
  var rawValues = range.getValues();
  var displayValues = range.getDisplayValues();
  if (displayValues.length < 2) return [];
  var headerRow = hrow(displayValues, ['tuan', 'start', 'end']);
  if (headerRow < 0) return [];
  var map = hmap(displayValues, headerRow);
  var today = A3K64_todayKeyV2_();
  var result = [];
  for (var row = headerRow + 1; row < displayValues.length; row++) {
    var week = A3K64_weekNumberV2_(displayValues[row][map.tuan]);
    if (!week) continue;
    var start = A3K64_dateKeyV2_(rawValues[row][map.start], displayValues[row][map.start]);
    var end = A3K64_dateKeyV2_(rawValues[row][map.end], displayValues[row][map.end]);
    var before = !!start && today < start;
    var after = !!end && today > end;
    var editable = !before && !after;
    result.push({ week: week, label: 'TUẦN ' + week, start: start, end: end, today: today, editable: editable, locked: !editable, reason: editable ? '' : (before ? 'Chưa đến thời gian chấm điểm.' : 'Đã hết hạn chấm điểm.') });
  }
  return result;
}

function A3K64_weekEditInfoV2_(week) {
  week = Number(week || DEFAULT_WEEK);
  var settings = A3K64_readWeekSettingsV2_();
  for (var i = 0; i < settings.length; i++) if (Number(settings[i].week) === week) return settings[i];
  return { week: week, label: 'TUẦN ' + week, start: '', end: '', today: A3K64_todayKeyV2_(), editable: true, locked: false, reason: '' };
}

function A3K64_actorV2_(payload) {
  payload = payload || {};
  var email = txt(payload.actorEmail || payload.email || payload.username || payload.createdByEmail).toLowerCase();
  var uid = txt(payload.actorUid || payload.uid).toLowerCase();
  var name = txt(payload.actorName || payload.createdBy || payload.displayName);
  var roleHint = txt(payload.actorRole || payload.role).toLowerCase();
  var groupHint = Number(txt(payload.actorGroup || payload.group || payload.to).replace(/[^0-9]/g, ''));
  var list = accounts();
  for (var i = 0; i < list.length; i++) {
    var account = list[i];
    var accountEmail = txt(account.username).toLowerCase();
    var accountUid = ('gas-' + studentId(account.username, 0)).toLowerCase();
    if ((email && accountEmail === email) || (uid && accountUid === uid) || (name && key(account.name) === key(name))) return { role: txt(account.role || roleHint || 'hoc_sinh').toLowerCase(), group: account.group || groupHint || '' };
  }
  return { role: roleHint || 'hoc_sinh', group: groupHint || '' };
}

function A3K64_checkEditAllowedV2_(week, payload) {
  var actor = A3K64_actorV2_(payload || {});
  var role = txt(actor.role).toLowerCase();
  if (role === 'hoc_sinh') throw new Error('Học sinh không có quyền sửa điểm.');
  if (A3K64_MANAGER_ROLES_V2.indexOf(role) >= 0) return true;
  var info = A3K64_weekEditInfoV2_(week);
  if (info.editable) return true;
  var rangeText = (info.start || '?') + ' đến ' + (info.end || '?');
  throw new Error(info.label + ' đã bị khoá sửa điểm. Tổ trưởng chỉ được sửa trong khoảng ' + rangeText + '. ' + (info.reason || ''));
}

function A3K64_weekFromEventIdV2_(eventId) {
  var match = txt(eventId).match(/^w(\d+)r/);
  if (!match) throw new Error('Không xác định được tuần của điểm cần xoá.');
  return Number(match[1]);
}

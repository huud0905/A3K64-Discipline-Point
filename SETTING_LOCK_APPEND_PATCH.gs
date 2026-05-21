/*
 * A3K64 SETTING week lock patch
 *
 * Cách dùng an toàn nhất:
 * 1) Mở Apps Script -> file Api.gs.
 * 2) Dán TOÀN BỘ nội dung file này xuống CUỐI file Api.gs.
 * 3) Save -> Deploy -> Manage deployments -> Edit -> New version -> Deploy.
 *
 * Sheet SETTING:
 * A: tuần   | B: start      | C: end
 * TUẦN 1   | 2026-05-18    | 2026-05-27
 *
 * Trong khoảng start-end: được sửa. Sau end hoặc trước start: khoá sửa.
 */

var A3K64_SETTING_SHEET_NAME = 'SETTING';
var A3K64_SETTING_HEADERS = ['tuần', 'start', 'end'];
var A3K64_HANOI_TIMEZONE = 'Asia/Ho_Chi_Minh';

function iso() {
  var now = new Date();
  return Utilities.formatDate(now, A3K64_HANOI_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss.SSS") + '+07:00';
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

  if (action === 'addScoreEvent') {
    A3K64_assertWeekEditable_(payload.week || DEFAULT_WEEK);
    return { ok: true, data: { event: addScoreEvent(payload), scoreboard: getScoreboardData() } };
  }

  if (action === 'deleteScoreEvent') {
    A3K64_assertWeekEditable_(A3K64_weekFromEventId_(payload.id));
    return { ok: true, data: { deleted: deleteScoreEvent(payload.id), scoreboard: getScoreboardData() } };
  }

  if (action === 'bulkScore') {
    A3K64_assertWeekEditable_(payload.week || DEFAULT_WEEK);
    return { ok: true, data: bulkScore(payload) };
  }

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

  return {
    students: studentList,
    events: events,
    weeks: weeks.length ? weeks : [DEFAULT_WEEK],
    quickScoreReasons: readRules(),
    weekSettings: A3K64_readWeekSettings_(),
    updatedAt: iso()
  };
}

function A3K64_settingSheet_() {
  var sheet = book().getSheetByName(A3K64_SETTING_SHEET_NAME);
  if (!sheet) {
    sheet = book().insertSheet(A3K64_SETTING_SHEET_NAME);
    sheet.getRange(1, 1, 1, A3K64_SETTING_HEADERS.length).setValues([A3K64_SETTING_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange('B:C').setNumberFormat('yyyy-mm-dd');
  }
  return sheet;
}

function A3K64_todayKey_() {
  return Utilities.formatDate(new Date(), A3K64_HANOI_TIMEZONE, 'yyyy-MM-dd');
}

function A3K64_dateKey_(value, displayValue) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, A3K64_HANOI_TIMEZONE, 'yyyy-MM-dd');
  }

  var s = txt(value) || txt(displayValue);
  if (!s) return '';

  var ymd = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (ymd) return ymd[1] + '-' + A3K64_pad2_(ymd[2]) + '-' + A3K64_pad2_(ymd[3]);

  var dmy = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (dmy) return dmy[3] + '-' + A3K64_pad2_(dmy[2]) + '-' + A3K64_pad2_(dmy[1]);

  return '';
}

function A3K64_pad2_(value) {
  return String(value).padStart(2, '0');
}

function A3K64_weekNumber_(value) {
  var match = txt(value).match(/\d+/);
  return match ? Number(match[0]) : NaN;
}

function A3K64_readWeekSettings_() {
  var sheet = A3K64_settingSheet_();
  var range = sheet.getDataRange();
  var rawValues = range.getValues();
  var displayValues = range.getDisplayValues();
  if (displayValues.length < 2) return [];

  var headerRow = hrow(displayValues, ['tuan', 'start', 'end']);
  if (headerRow < 0) return [];

  var map = hmap(displayValues, headerRow);
  var today = A3K64_todayKey_();
  var result = [];

  for (var row = headerRow + 1; row < displayValues.length; row++) {
    var week = A3K64_weekNumber_(displayValues[row][map.tuan]);
    if (!week) continue;

    var start = A3K64_dateKey_(rawValues[row][map.start], displayValues[row][map.start]);
    var end = A3K64_dateKey_(rawValues[row][map.end], displayValues[row][map.end]);
    var before = !!start && today < start;
    var after = !!end && today > end;
    var editable = !before && !after;

    result.push({
      week: week,
      label: 'TUẦN ' + week,
      start: start,
      end: end,
      today: today,
      editable: editable,
      locked: !editable,
      reason: editable ? '' : (before ? 'Chưa đến thời gian chấm điểm.' : 'Đã hết hạn chấm điểm.')
    });
  }

  return result;
}

function A3K64_weekEditWindow_(week) {
  week = Number(week || DEFAULT_WEEK);
  var settings = A3K64_readWeekSettings_();
  for (var i = 0; i < settings.length; i++) {
    if (Number(settings[i].week) === week) return settings[i];
  }

  return {
    week: week,
    label: 'TUẦN ' + week,
    start: '',
    end: '',
    today: A3K64_todayKey_(),
    editable: true,
    locked: false,
    reason: ''
  };
}

function A3K64_assertWeekEditable_(week) {
  var info = A3K64_weekEditWindow_(week);
  if (info.editable) return true;

  var rangeText = (info.start || '?') + ' đến ' + (info.end || '?');
  throw new Error(info.label + ' đã bị khoá sửa điểm. Chỉ được sửa trong khoảng ' + rangeText + '. ' + (info.reason || ''));
}

function A3K64_weekFromEventId_(eventId) {
  var match = txt(eventId).match(/^w(\d+)r/);
  if (!match) throw new Error('Không xác định được tuần của điểm cần xoá.');
  return Number(match[1]);
}

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
const SPREADSHEET_ID = "1GcmB64Tj2EPEpT9uhQ5IbIcO8Ysq-J5m12NDqSeiT0Y";
const HANOI_TIMEZONE = "Asia/Ho_Chi_Minh";
const ACCOUNTS_SHEET_NAME = "ACCOUNTS";
const RULES_SHEET_NAME = "VI_PHAM";
const HISTORY_SHEET_NAME = "_CHANGE_HISTORY";
const LOG_SHEET_NAME = "_ACTIVITY_LOG";
const PERMISSION_SHEET_NAME = "_EDIT_PERMISSION_REQUESTS";
const NOTIFICATION_SHEET_NAME = "_NOTIFICATIONS";
const PERSONALIZATION_SHEET_NAME = "PERSONALIZATION";

const DEFAULT_WEEK = 1;
const BASE_SCORE = 50;
const SHEET_TOTAL_NOTE = "__SHEET_TOTAL__";

const HISTORY_HEADERS = [
  "id",
  "timestamp",
  "week",
  "row_idx",
  "student_name",
  "group_num",
  "action",
  "username",
  "role",
  "before_total",
  "after_total",
  "before_json",
  "after_json",
  "restore_from_id",
  "reason",
  "payload_json"
];
const LOG_HEADERS = ["id", "type", "actor", "detail", "payload_json", "createdAt"];
const REQUEST_HEADERS = ["id", "week", "requester", "studentId", "studentName", "reason", "status", "resolvedBy", "resolvedAt", "createdAt"];
const NOTI_HEADERS = ["id", "to", "title", "message", "status", "payload_json", "createdAt"];
const PERSONALIZATION_HEADERS = ["username", "email", "uid", "displayName", "theme", "accentKey", "accentColor", "customAccent", "taskbarSettingsJson", "pinnedAppsJson", "recentAccentsJson", "desktopTransparency", "accentTaskbar", "accentBorders", "payloadJson", "updatedAt"];

var A3K64_SETTING_SHEET_NAME_V2 = 'SETTING';
var A3K64_SETTING_HEADERS_V2 = ['tuần', 'start', 'end'];
var A3K64_TIMEZONE_V2 = 'Asia/Ho_Chi_Minh';
var A3K64_MANAGER_ROLES_V2 = ['gvcn', 'lop_truong', 'bi_thu'];

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const action = params.action || "getScoreboard";
    const payload = params.payload ? (JSON.parse(params.payload) || {}) : params;
    const result = routeAction(action, payload, params);
    return out(result, params.callback);
  } catch (err) {
    return out({ ok: false, error: msg(err) }, e && e.parameter && e.parameter.callback);
  }
}

function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    const action = body.action;
    const payload = body.payload || {};
    return out(routeAction(action, payload, {}));
  } catch (err) {
    return out({ ok: false, error: msg(err) });
  }
}

function routeAction(action, payload, params) {
  if (action === "getScoreboard") return { ok: true, data: getScoreboardData() };
  if (action === "getRules") return { ok: true, data: { rules: readRules(), updatedAt: iso() } };
  if (action === "getStudentChangeHistory") return { ok: true, data: readRows(HISTORY_SHEET_NAME, params || payload || {}) };
  if (action === "getPermissionRequests") return { ok: true, data: readRows(PERMISSION_SHEET_NAME, params || payload || {}) };
  if (action === "getNotifications") return { ok: true, data: readRows(NOTIFICATION_SHEET_NAME, params || payload || {}) };
  if (action === "getPersonalization") return { ok: true, data: getPersonalization(payload) };

  if (action === "login") return { ok: true, data: login(payload) };
  if (action === "verifyAccountRecovery") return { ok: true, data: verifyAccountRecovery(payload) };
  if (action === "resetPassword") return { ok: true, data: resetPassword(payload) };
  if (action === "addScoreEvent") return { ok: true, data: { event: addScoreEvent(payload), scoreboard: getScoreboardData() } };
  if (action === "deleteScoreEvent") return { ok: true, data: { deleted: deleteScoreEvent(payload.id), scoreboard: getScoreboardData() } };
  if (action === "bulkScore") return { ok: true, data: bulkScore(payload) };
  if (action === "createWeek") return { ok: true, data: createWeek(payload.week) };
  if (action === "createEditPermissionRequest") return { ok: true, data: createRequest(payload) };
  if (action === "resolveEditPermissionRequest") return { ok: true, data: resolveRequest(payload) };
  if (action === "savePersonalization") return { ok: true, data: savePersonalization(payload) };

  return { ok: true, message: "GAS API is running", updatedAt: iso() };
}

function out(data, callback) {
  const json = JSON.stringify(data);
  const cb = safeCallback(callback);
  if (cb) return ContentService.createTextOutput(cb + "(" + json + ");").setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function safeCallback(name) {
  name = txt(name);
  return /^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(name) ? name : "";
}

function msg(e) {
  return String(e && e.message ? e.message : e);
}

function book() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}


function iso() {
  const now = new Date();
  return Utilities.formatDate(now, HANOI_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss.SSS") + "+07:00";
}

function txt(value) {
  return String(value == null ? "" : value).trim();
}

function key(value) {
  return txt(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/\s+/g, "");
}

function digits(value) {
  return txt(value).replace(/\D/g, "");
}

function phoneKey(value) {
  let s = digits(value);
  if (!s) return "";
  if (s.startsWith("0084")) s = "0" + s.slice(4);
  if (s.startsWith("84") && s.length >= 11) s = "0" + s.slice(2);
  return s;
}

function samePhone(a, b) {
  const x = phoneKey(a);
  const y = phoneKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return x.replace(/^0+/, "") === y.replace(/^0+/, "");
}

function num(value) {
  const n = Number(txt(value).replace(/\+/g, "").replace(/\s+/g, "").replace(",", "."));
  return isFinite(n) ? n : NaN;
}

function id(prefix) {
  return prefix + Date.now() + Math.floor(Math.random() * 9999);
}

function init(name, headers) {
  let sheet = book().getSheetByName(name);
  if (!sheet) {
    sheet = book().insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  // Đảm bảo các sheet hệ thống, đặc biệt _CHANGE_HISTORY, luôn đúng header hiện tại.
  // Nếu trước đó sheet dùng schema cũ thì dòng header sẽ được cập nhật lại giống project cũ.
  if (headers && headers.length) {
    const current = sheet.getLastColumn() >= headers.length
      ? sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0].map(txt)
      : [];
    const same = current.length === headers.length && current.every(function (value, index) {
      return value === headers[index];
    });
    if (!same) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  }

  return sheet;
}

function vals(sheet) {
  if (!sheet || sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) return [];
  return sheet.getDataRange().getDisplayValues();
}

function append(sheet, headers, row) {
  sheet.appendRow(headers.map(function (keyName) {
    return row[keyName] === undefined ? "" : row[keyName];
  }));
}

function hmap(values, row) {
  const map = {};
  (values[row] || []).forEach(function (value, index) {
    const k = key(value);
    if (k) map[k] = index;
  });
  return map;
}

function hrow(values, needed) {
  for (let row = 0; row < Math.min(values.length, 50); row++) {
    const map = hmap(values, row);
    if (needed.every(function (k) { return map[k] !== undefined; })) return row;
  }
  return -1;
}

function sheetAny(names) {
  for (const name of names) {
    const sheet = book().getSheetByName(name);
    if (sheet) return sheet;
  }

  const normalized = names.map(key);
  return book().getSheets().find(function (sheet) {
    return normalized.includes(key(sheet.getName()));
  }) || null;
}

function weekNo(name) {
  if (!key(name).includes("tuan")) return null;
  const match = txt(name).match(/\d+/);
  return match ? Number(match[0]) : DEFAULT_WEEK;
}

function weekSheets() {
  return book().getSheets()
    .map(function (sheet) { return { sheet: sheet, week: weekNo(sheet.getName()) }; })
    .filter(function (item) { return item.week && item.week !== 0; })
    .sort(function (a, b) { return a.week - b.week; });
}

function weekSheet(week) {
  return book().getSheetByName("TUẦN " + week) ||
    book().getSheetByName("TUAN " + week) ||
    (weekSheets().find(function (item) { return Number(item.week) === Number(week); }) || {}).sheet;
}

function first(array, list) {
  for (let index = 0; index < array.length; index++) {
    if (list.includes(array[index])) return index;
  }
  return undefined;
}

function lastBefore(array, target, before) {
  for (let index = Math.min(before - 1, array.length - 1); index >= 0; index--) {
    if (array[index] === target) return index;
  }
  return undefined;
}

function after(array, target, start) {
  for (let index = Math.max(start + 1, 0); index < array.length; index++) {
    if (array[index] === target) return index;
  }
  return undefined;
}

function scoreCfg(values) {
  for (let row = 0; row < Math.min(values.length, 50); row++) {
    const headers = (values[row] || []).map(key);
    const plusTextCol = first(headers, ["nddiemcong", "noidungdiemcong"]);
    const minusTextCol = first(headers, ["noidungdiemtru", "nddiemtru"]);

    if (plusTextCol === undefined || minusTextCol === undefined) continue;

    const nameCol = lastBefore(headers, "hovaten", plusTextCol);
    const sttCol = nameCol === undefined ? undefined : lastBefore(headers, "stt", nameCol + 1);
    const plusTotalCol = after(headers, "tongcong", plusTextCol);
    const minusTotalCol = after(headers, "tongtru", minusTextCol);
    const totalCol = after(headers, "tongdiem", minusTextCol);
    const statusCol = after(headers, "xeploai", totalCol === undefined ? minusTextCol : totalCol);
    const editorCol = after(headers, "nguoichinhsua", statusCol === undefined ? minusTextCol : statusCol);

    if (nameCol !== undefined && sttCol !== undefined && totalCol !== undefined && statusCol !== undefined) {
      return {
        headerIndex: row,
        sttCol: sttCol,
        nameCol: nameCol,
        plusTextCol: plusTextCol,
        plusTotalCol: plusTotalCol,
        minusTextCol: minusTextCol,
        minusTotalCol: minusTotalCol,
        totalCol: totalCol,
        statusCol: statusCol,
        editorCol: editorCol
      };
    }
  }
  return null;
}

function groupNo(name) {
  const match = txt(name).match(/^tổ\s*(\d+)/i) || txt(name).match(/^to\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

function isStudent(row, config) {
  return /^\d+$/.test(txt(row[config.sttCol])) && txt(row[config.nameCol]) && !groupNo(row[config.nameCol]);
}

function studentId(name, index) {
  return (txt(name) || ("s" + index))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function status(total) {
  if (total >= 50) return "Tốt";
  if (total >= 0) return "Khá";
  if (total >= -50) return "Đạt";
  return "Chưa đạt";
}

function cat(value) {
  const normalized = key(value);
  if (normalized.includes("nenep") || normalized.includes("nep")) return "NE_NEP";
  if (normalized.includes("phong")) return "PHONG_TRAO";
  return "HOC_TAP";
}

function typ(value, points) {
  const normalized = key(value);
  if (normalized === "tru") return "TRU";
  if (normalized === "cong") return "CONG";
  return points >= 0 ? "CONG" : "TRU";
}

function students() {
  const result = [];
  const seen = {};

  weekSheets().forEach(function (week) {
    const values = vals(week.sheet);
    const config = scoreCfg(values);
    if (!config) return;

    let group = 1;
    for (let row = config.headerIndex + 1; row < values.length; row++) {
      const name = txt(values[row][config.nameCol]);
      const groupValue = groupNo(name);

      if (groupValue) {
        group = groupValue;
        continue;
      }
      if (!isStudent(values[row], config)) continue;

      const k = key(name);
      if (seen[k]) continue;
      seen[k] = true;

      result.push({
        id: studentId(name, result.length),
        name: name,
        group: group,
        role: "",
        avatarInitial: (name.split(/\s+/).pop() || "?")[0].toUpperCase()
      });
    }
  });

  return result;
}

function findRow(sheet, config, studentIdValue) {
  const student = students().find(function (item) { return item.id === studentIdValue; });
  if (!student) return null;

  const values = vals(sheet);
  for (let row = config.headerIndex + 1; row < values.length; row++) {
    if (key(values[row][config.nameCol]) === key(student.name)) {
      return { row: row + 1, name: student.name, group: student.group };
    }
  }

  return null;
}

function makeEvent(idValue, studentIdValue, week, title, points, category, note) {
  return {
    id: idValue,
    studentId: studentIdValue,
    week: week,
    title: title,
    points: points,
    type: points >= 0 ? "CONG" : "TRU",
    category: category || "HOC_TAP",
    note: note || "",
    createdBy: "Google Sheets",
    createdAt: iso()
  };
}

function pointFromLine(line, fallback) {
  const match = txt(line).match(/\(([+-]?\d+)\)\s*$/);
  const n = match ? Number(match[1]) : NaN;
  return isFinite(n) ? n : fallback;
}

function splitLines(text) {
  return txt(text).split(/\r?\n/).map(txt).filter(Boolean);
}

function cellEvents(events, studentIdValue, week, rowNo, prefix, text, total, isPlus) {
  const lines = splitLines(text);
  const result = [];
  if (!lines.length) return 0;

  let used = 0;
  lines.forEach(function (line, index) {
    let points = pointFromLine(line, lines.length === 1 ? total : 0);
    points = isPlus ? Math.abs(points) : -Math.abs(points);
    used += points;
    result.push(makeEvent(prefix + rowNo + "_" + index, studentIdValue, week, line, points, cat(line), ""));
  });

  events.push.apply(events, result);
  return used;
}

function eventsFromWeeks(studentList) {
  const events = [];

  weekSheets().forEach(function (week) {
    const values = vals(week.sheet);
    const config = scoreCfg(values);
    if (!config) return;

    for (let row = config.headerIndex + 1; row < values.length; row++) {
      if (!isStudent(values[row], config)) continue;

      const student = studentList.find(function (item) {
        return key(item.name) === key(values[row][config.nameCol]);
      });
      if (!student) continue;

      const plusText = txt(values[row][config.plusTextCol]);
      const minusText = txt(values[row][config.minusTextCol]);
      const plusRaw = num(values[row][config.plusTotalCol]);
      const minusRaw = num(values[row][config.minusTotalCol]);
      let plusTotal = isFinite(plusRaw) ? Math.abs(plusRaw) : 0;
      let minusTotal = isFinite(minusRaw) ? Math.abs(minusRaw) : 0;
      let total = num(values[row][config.totalCol]);

      if (!isFinite(total)) total = BASE_SCORE + plusTotal - minusTotal;

      const studentStatus = status(total);
      let visibleScore = 0;
      visibleScore += cellEvents(events, student.id, week.week, row, "w" + week.week + "r" + row + "p", plusText, plusTotal, true);
      visibleScore += cellEvents(events, student.id, week.week, row, "w" + week.week + "r" + row + "m", minusText, minusTotal, false);
      events.push(makeEvent("w" + week.week + "r" + row + "t", student.id, week.week, "Tổng điểm từ trang tính", total - visibleScore, "HOC_TAP", SHEET_TOTAL_NOTE + ";status=" + studentStatus));
    }
  });

  return events;
}

function readRules() {
  const sheet = sheetAny([RULES_SHEET_NAME]);
  const values = vals(sheet);
  const headerRow = hrow(values, ["ten", "diem"]);
  if (headerRow < 0) return [];

  const map = hmap(values, headerRow);
  const result = [];

  for (let row = headerRow + 1; row < values.length; row++) {
    const title = txt(values[row][map.ten]);
    if (!title) continue;

    const rawPoint = num(values[row][map.diem]);
    const type = typ(values[row][map.tinh], rawPoint);
    const points = type === "TRU" ? -Math.abs(rawPoint) : Math.abs(rawPoint);

    result.push({
      title: title,
      points: isFinite(points) ? points : 0,
      type: type,
      category: cat(values[row][map.phanloai]),
      note: txt(values[row][map.ghichu])
    });
  }

  return result;
}

function getScoreboardData() {
  const studentList = students();
  const events = eventsFromWeeks(studentList);
  const weeks = Array.from(new Set(weekSheets().map(function (item) { return item.week; }).concat(events.map(function (event) { return event.week; })))).sort(function (a, b) { return a - b; });

  return {
    students: studentList,
    events: events,
    weeks: weeks.length ? weeks : [DEFAULT_WEEK],
    quickScoreReasons: readRules(),
    updatedAt: iso()
  };
}

function accounts() {
  const sheet = sheetAny([ACCOUNTS_SHEET_NAME]);
  const values = vals(sheet);
  const headerRow = hrow(values, ["username", "password", "role"]);
  if (headerRow < 0) return [];

  const map = hmap(values, headerRow);
  const result = [];

  for (let row = headerRow + 1; row < values.length; row++) {
    const username = txt(values[row][map.username]);
    if (!username) continue;

    result.push({
      username: username,
      password: txt(values[row][map.password]),
      role: txt(values[row][map.role]) || "hoc_sinh",
      group: num(values[row][map.to]),
      name: txt(values[row][map.hoten] || values[row][map.name] || values[row][map.hovaten])
    });
  }

  return result;
}

function login(payload) {
  const username = txt(payload.username).toLowerCase();
  const password = txt(payload.password);
  const account = accounts().find(function (item) {
    return txt(item.username).toLowerCase() === username && txt(item.password) === password;
  });

  if (!account) return { ok: false, error: "Tên đăng nhập hoặc mật khẩu không đúng." };

  log("login", account.username, "Đăng nhập", { role: account.role });

  return {
    ok: true,
    user: {
      uid: "gas-" + studentId(account.username, 0),
      displayName: account.name || account.username,
      email: account.username,
      photoURL: null,
      provider: "gas",
      role: account.role,
      group: account.group || ""
    }
  };
}

function accountIdentity(payload) {
  const username = txt(payload.username || payload.email || payload.uid).toLowerCase();
  return username;
}

function findPersonalizationRow(username) {
  const sheet = init(PERSONALIZATION_SHEET_NAME, PERSONALIZATION_HEADERS);
  const values = vals(sheet);
  if (values.length < 2) return { sheet: sheet, row: -1, values: values };

  for (let row = 1; row < values.length; row++) {
    const user = txt(values[row][0]).toLowerCase();
    const email = txt(values[row][1]).toLowerCase();
    const uid = txt(values[row][2]).toLowerCase();
    if (username && (user === username || email === username || uid === username)) {
      return { sheet: sheet, row: row + 1, values: values };
    }
  }

  return { sheet: sheet, row: -1, values: values };
}

function rowToPersonalization(row) {
  const payload = parseJson(row[14]);
  if (payload) return payload;
  return {
    version: 2,
    theme: txt(row[4]) || undefined,
    accentKey: txt(row[5]) || undefined,
    accentColor: txt(row[6]) || undefined,
    customAccent: txt(row[7]) || undefined,
    taskbarSettings: parseJson(row[8]) || {},
    pinnedApps: parseJson(row[9]) || [],
    recentAccents: parseJson(row[10]) || [],
    desktopTransparency: txt(row[11]) || undefined,
    accentTaskbar: txt(row[12]) || undefined,
    accentBorders: txt(row[13]) || undefined,
    updatedAt: txt(row[15]) || undefined
  };
}

function getPersonalization(payload) {
  const username = accountIdentity(payload || {});
  if (!username) return { ok: true, personalization: null };

  const found = findPersonalizationRow(username);
  if (found.row < 0) return { ok: true, personalization: null };

  const row = found.values[found.row - 1];
  return { ok: true, personalization: rowToPersonalization(row), updatedAt: txt(row[15]) };
}

function savePersonalization(payload) {
  payload = payload || {};
  const username = accountIdentity(payload);
  if (!username) return { ok: false, error: "Thiếu username/email để lưu cá nhân hoá." };

  const p = payload.personalization || {};
  const updatedAt = iso();
  const merged = Object.assign({}, p, { version: 2, updatedAt: updatedAt });
  const row = {
    username: username,
    email: txt(payload.email || username).toLowerCase(),
    uid: txt(payload.uid || username),
    displayName: txt(payload.displayName),
    theme: txt(merged.theme),
    accentKey: txt(merged.accentKey),
    accentColor: txt(merged.accentColor),
    customAccent: txt(merged.customAccent),
    taskbarSettingsJson: JSON.stringify(merged.taskbarSettings || {}),
    pinnedAppsJson: JSON.stringify(merged.pinnedApps || []),
    recentAccentsJson: JSON.stringify(merged.recentAccents || []),
    desktopTransparency: txt(merged.desktopTransparency),
    accentTaskbar: txt(merged.accentTaskbar),
    accentBorders: txt(merged.accentBorders),
    payloadJson: JSON.stringify(merged),
    updatedAt: updatedAt
  };

  const found = findPersonalizationRow(username);
  const values = PERSONALIZATION_HEADERS.map(function (header) { return row[header] === undefined ? "" : row[header]; });
  if (found.row > 0) found.sheet.getRange(found.row, 1, 1, PERSONALIZATION_HEADERS.length).setValues([values]);
  else found.sheet.appendRow(values);

  return { ok: true, personalization: merged, updatedAt: updatedAt };
}

function parseJson(value) {
  try {
    const text = txt(value);
    return text ? JSON.parse(text) : null;
  } catch (err) {
    return null;
  }
}

function verifyAccountRecovery(payload) {
  const fullName = txt(payload.fullName);
  const phone = phoneKey(payload.phone);

  if (!fullName) return { ok: false, error: "Vui lòng nhập họ và tên." };
  if (!phone) return { ok: false, error: "Vui lòng nhập số điện thoại cá nhân/bố/mẹ." };

  const person = findTtcnPerson(fullName, phone);
  if (!person) return { ok: false, error: "Không tìm thấy học sinh khớp họ tên và số điện thoại trong TTCN." };

  return {
    ok: true,
    message: "Thông tin hợp lệ. Có thể đổi Gmail và mật khẩu.",
    studentName: person.name
  };
}

function resetPassword(payload) {
  const fullName = txt(payload.fullName);
  const phone = phoneKey(payload.phone);
  const newEmail = txt(payload.newEmail).toLowerCase();
  const newPassword = txt(payload.newPassword);

  const verified = verifyAccountRecovery({ fullName, phone });
  if (!verified.ok) return verified;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return { ok: false, error: "Gmail mới không hợp lệ." };
  if (newPassword.length < 4) return { ok: false, error: "Mật khẩu mới tối thiểu 4 ký tự." };

  const updated = updateAccountByName(verified.studentName, newEmail, newPassword);
  if (!updated.ok) return updated;

  log("resetPassword", newEmail, "Đổi tài khoản cho " + verified.studentName, { name: verified.studentName, email: newEmail });

  return {
    ok: true,
    message: "Đã cập nhật Gmail và mật khẩu.",
    user: {
      uid: "gas-" + studentId(newEmail, 0),
      displayName: verified.studentName,
      email: newEmail,
      photoURL: null,
      provider: "gas",
      role: updated.role || "hoc_sinh",
      group: updated.group || ""
    }
  };
}

function findTtcnPerson(fullName, phone) {
  const sheet = sheetAny(["TTCN"]);
  const values = vals(sheet);
  if (!sheet || values.length < 2) return null;

  for (let row = 1; row < values.length; row++) {
    const name = txt(values[row][1]);
    const phone1 = values[row][2];
    const phone2 = values[row][3];
    const phone3 = values[row][4];

    if (name && key(name) === key(fullName) && (samePhone(phone, phone1) || samePhone(phone, phone2) || samePhone(phone, phone3))) {
      return { row: row + 1, name: name };
    }
  }

  return null;
}

function updateAccountByName(fullName, newEmail, newPassword) {
  const sheet = sheetAny([ACCOUNTS_SHEET_NAME]);
  const values = vals(sheet);
  if (!sheet || values.length < 2) return { ok: false, error: "Không tìm thấy sheet ACCOUNTS." };

  const usernameCol = 0;
  const passwordCol = 1;
  const roleCol = 2;
  const groupCol = 3;
  const nameCol = 4;

  for (let row = 1; row < values.length; row++) {
    const name = txt(values[row][nameCol]);
    if (name && key(name) === key(fullName)) {
      sheet.getRange(row + 1, usernameCol + 1).setValue(newEmail);
      sheet.getRange(row + 1, passwordCol + 1).setValue(newPassword);

      return {
        ok: true,
        row: row + 1,
        role: txt(values[row][roleCol]) || "hoc_sinh",
        group: txt(values[row][groupCol])
      };
    }
  }

  return { ok: false, error: "Tìm thấy TTCN nhưng không tìm thấy người này trong ACCOUNTS." };
}

function snap(sheet, row, config) {
  return {
    plusText: sheet.getRange(row, config.plusTextCol + 1).getDisplayValue(),
    plusTotal: sheet.getRange(row, config.plusTotalCol + 1).getDisplayValue(),
    minusText: sheet.getRange(row, config.minusTextCol + 1).getDisplayValue(),
    minusTotal: sheet.getRange(row, config.minusTotalCol + 1).getDisplayValue(),
    total: sheet.getRange(row, config.totalCol + 1).getDisplayValue(),
    status: sheet.getRange(row, config.statusCol + 1).getDisplayValue(),
    editor: config.editorCol !== undefined ? sheet.getRange(row, config.editorCol + 1).getDisplayValue() : ""
  };
}

function addLine(current, line) {
  current = txt(current);
  return current ? current + "\n" + line : line;
}

function addScoreEvent(payload) {
  const week = Number(payload.week || DEFAULT_WEEK);
  const sheet = weekSheet(week);
  if (!sheet) throw new Error("Không tìm thấy TUẦN " + week);

  const config = scoreCfg(vals(sheet));
  if (!config) throw new Error("Không tìm thấy bảng chấm");

  const info = findRow(sheet, config, txt(payload.studentId));
  if (!info) throw new Error("Không tìm thấy học sinh");

  const row = info.row;
  const before = snap(sheet, row, config);
  const points = Number(payload.points || 0);
  const title = txt(payload.title);
  const actor = txt(payload.createdBy) || "Web";

  const plusTextCell = sheet.getRange(row, config.plusTextCol + 1);
  const plusTotalCell = sheet.getRange(row, config.plusTotalCol + 1);
  const minusTextCell = sheet.getRange(row, config.minusTextCol + 1);
  const minusTotalCell = sheet.getRange(row, config.minusTotalCol + 1);
  const totalCell = sheet.getRange(row, config.totalCol + 1);
  const statusCell = sheet.getRange(row, config.statusCol + 1);
  const editorCell = config.editorCol !== undefined ? sheet.getRange(row, config.editorCol + 1) : null;

  let plus = num(plusTotalCell.getDisplayValue());
  if (!isFinite(plus)) plus = 0;

  let minus = num(minusTotalCell.getDisplayValue());
  if (!isFinite(minus)) minus = 0;

  if (points >= 0) {
    plusTextCell.setValue(addLine(plusTextCell.getDisplayValue(), title));
    plus += Math.abs(points);
    plusTotalCell.setValue(plus || "");
  } else {
    minusTextCell.setValue(addLine(minusTextCell.getDisplayValue(), title));
    minus += Math.abs(points);
    minusTotalCell.setValue(minus || "");
  }

  const total = BASE_SCORE + plus - minus;
  totalCell.setValue(total);
  statusCell.setValue(status(total));
  if (editorCell) editorCell.setValue(actor);

  const after = snap(sheet, row, config);
  const event = {
    id: id("e"),
    studentId: txt(payload.studentId),
    week: week,
    title: title,
    points: points,
    type: points >= 0 ? "CONG" : "TRU",
    category: txt(payload.category) || cat(title),
    note: "",
    createdBy: actor,
    createdAt: txt(payload.createdAt) || iso()
  };

  history(
    week,
    event.studentId,
    info.name,
    "save_score",
    before,
    after,
    { username: actor, role: txt(payload.role || payload.actorRole) },
    title,
    row,
    info.group,
    { source: "single_edit", event: event }
  );
  log("score", actor, "Chấm điểm " + info.name, event);

  return event;
}

function removeLine(text, target) {
  const targetText = txt(target);
  return splitLines(text).filter(function (line) { return line !== targetText; }).join("\n");
}

function sumCell(text) {
  return splitLines(text).reduce(function (sum, line) {
    return sum + Math.abs(pointFromLine(line, 0));
  }, 0);
}

function deleteScoreEvent(eventId) {
  const match = txt(eventId).match(/^w(\d+)r(\d+)([pm])(\d+)_/);
  if (!match) throw new Error("Không xác định được dòng điểm cần xoá.");

  const week = Number(match[1]);
  const sheetRow = Number(match[2]) + 1;
  const kind = match[3];
  const sheet = weekSheet(week);
  if (!sheet) throw new Error("Không tìm thấy TUẦN " + week);

  const config = scoreCfg(vals(sheet));
  if (!config) throw new Error("Không tìm thấy bảng chấm");

  const studentName = sheet.getRange(sheetRow, config.nameCol + 1).getDisplayValue();
  const before = snap(sheet, sheetRow, config);
  const textCol = kind === "p" ? config.plusTextCol : config.minusTextCol;
  const targetEvent = eventsFromWeeks(students()).find(function (event) { return event.id === eventId; });
  if (!targetEvent) throw new Error("Không tìm thấy nội dung điểm cần xoá.");

  sheet.getRange(sheetRow, textCol + 1).setValue(removeLine(sheet.getRange(sheetRow, textCol + 1).getDisplayValue(), targetEvent.title));

  const plus = sumCell(sheet.getRange(sheetRow, config.plusTextCol + 1).getDisplayValue());
  const minus = sumCell(sheet.getRange(sheetRow, config.minusTextCol + 1).getDisplayValue());
  const total = BASE_SCORE + plus - minus;

  sheet.getRange(sheetRow, config.plusTotalCol + 1).setValue(plus || "");
  sheet.getRange(sheetRow, config.minusTotalCol + 1).setValue(minus || "");
  sheet.getRange(sheetRow, config.totalCol + 1).setValue(total);
  sheet.getRange(sheetRow, config.statusCol + 1).setValue(status(total));

  const after = snap(sheet, sheetRow, config);
  const deletedStudent = students().find(function (item) {
    return item.id === targetEvent.studentId || key(item.name) === key(studentName);
  });
  history(
    week,
    targetEvent.studentId,
    studentName,
    "delete_score",
    before,
    after,
    { username: "Web", role: "" },
    targetEvent.title,
    sheetRow,
    deletedStudent ? deletedStudent.group : "",
    { source: "delete_score", eventId: eventId, event: targetEvent }
  );
  log("deleteScore", "Web", "Xoá điểm " + studentName, targetEvent);

  return true;
}

function bulkScore(payload) {
  const ids = Array.isArray(payload.studentIds) ? payload.studentIds : [];
  return {
    count: ids.length,
    events: ids.map(function (studentIdValue) {
      return addScoreEvent(Object.assign({}, payload, { studentId: studentIdValue }));
    })
  };
}

function historyUuid() {
  try {
    return Utilities.getUuid();
  } catch (err) {
    return id("h");
  }
}

function historyTimestamp() {
  try {
    return Utilities.formatDate(new Date(), HANOI_TIMEZONE || "Asia/Ho_Chi_Minh", "dd/MM/yyyy");
  } catch (err) {
    return iso();
  }
}

function historyWeekLabel(week) {
  const text = txt(week);
  if (!text) return "";
  return key(text).includes("tuan") ? text : "TUẦN " + text;
}

function historyActor(actor) {
  if (actor && typeof actor === "object") {
    return {
      username: txt(actor.username || actor.actorName || actor.actorEmail || actor.email || actor.uid) || "Web",
      role: txt(actor.role || actor.actorRole)
    };
  }

  return {
    username: txt(actor) || "Web",
    role: ""
  };
}

function historyTotal(snapshot) {
  if (!snapshot) return "";
  const direct = snapshot.tongDiem !== undefined ? num(snapshot.tongDiem) : num(snapshot.total);
  return isFinite(direct) ? direct : "";
}

function historySnapshot(raw, week, rowIdx, studentName, groupNum) {
  raw = raw || {};
  const plusTotal = raw.tongCong !== undefined ? num(raw.tongCong) : num(raw.plusTotal);
  const minusTotal = raw.tongTru !== undefined ? num(raw.tongTru) : num(raw.minusTotal);
  const totalRaw = raw.tongDiem !== undefined ? num(raw.tongDiem) : num(raw.total);
  const total = isFinite(totalRaw) ? totalRaw : BASE_SCORE + (isFinite(plusTotal) ? Math.abs(plusTotal) : 0) - (isFinite(minusTotal) ? Math.abs(minusTotal) : 0);

  return {
    week: historyWeekLabel(raw.week || week),
    rowIdx: Number(raw.rowIdx || rowIdx || 0),
    name: txt(raw.name || studentName),
    group: Number(raw.group || groupNum || 0),
    ndCong: txt(raw.ndCong !== undefined ? raw.ndCong : raw.plusText),
    tongCong: isFinite(plusTotal) ? Math.abs(plusTotal) : 0,
    ndTru: txt(raw.ndTru !== undefined ? raw.ndTru : raw.minusText),
    tongTru: isFinite(minusTotal) ? Math.abs(minusTotal) : 0,
    tongDiem: total,
    xepLoai: txt(raw.xepLoai || raw.status || status(total)),
    internalNote: txt(raw.internalNote),
    lastLog: txt(raw.lastLog || raw.editor)
  };
}

function history(week, studentIdValue, studentName, action, before, after, actor, reason, rowIdx, groupNum, payload) {
  const user = historyActor(actor);
  const beforeState = historySnapshot(before, week, rowIdx, studentName, groupNum);
  const afterState = historySnapshot(after, week, rowIdx, studentName, groupNum);
  const detailPayload = Object.assign({ studentId: studentIdValue }, payload || {});

  append(init(HISTORY_SHEET_NAME, HISTORY_HEADERS), HISTORY_HEADERS, {
    id: historyUuid(),
    timestamp: historyTimestamp(),
    week: historyWeekLabel(week),
    row_idx: rowIdx || beforeState.rowIdx || afterState.rowIdx || "",
    student_name: studentName,
    group_num: groupNum || beforeState.group || afterState.group || "",
    action: action,
    username: user.username,
    role: user.role,
    before_total: historyTotal(beforeState),
    after_total: historyTotal(afterState),
    before_json: JSON.stringify(beforeState || {}),
    after_json: JSON.stringify(afterState || {}),
    restore_from_id: "",
    reason: reason || "",
    payload_json: JSON.stringify(detailPayload)
  });
}

function log(type, actor, detail, payload) {
  append(init(LOG_SHEET_NAME, LOG_HEADERS), LOG_HEADERS, {
    id: id("log"),
    type: type,
    actor: actor || "Web",
    detail: detail || "",
    payload_json: JSON.stringify(payload || {}),
    createdAt: iso()
  });
}

function readRows(name, params) {
  params = params || {};
  const sheet = book().getSheetByName(name);
  const values = vals(sheet);
  if (values.length < 2) return [];

  const headers = values[0].map(key);
  const result = [];

  for (let row = 1; row < values.length; row++) {
    const item = {};
    headers.forEach(function (header, index) {
      item[header] = values[row][index];
    });

    const payloadText = txt(item.payload_json || item.payloadjson);
    if (params.studentId && item.studentid !== params.studentId && !payloadText.includes(params.studentId)) continue;
    if ((params.rowIdx || params.row_idx) && Number(item.row_idx || item.rowidx || 0) !== Number(params.rowIdx || params.row_idx || 0)) continue;
    if (params.week && String(item.week || "") !== String(params.week)) continue;
    if (params.studentName && key(item.student_name || item.studentname) !== key(params.studentName)) continue;
    if (params.status && item.status !== params.status) continue;
    if (params.to && item.to !== params.to) continue;

    result.push(item);
  }

  return result.reverse().slice(0, 100);
}

function createRequest(payload) {
  const row = {
    id: id("req"),
    week: payload.week || DEFAULT_WEEK,
    requester: txt(payload.requester),
    studentId: txt(payload.studentId),
    studentName: txt(payload.studentName),
    reason: txt(payload.reason),
    status: "pending",
    resolvedBy: "",
    resolvedAt: "",
    createdAt: iso()
  };

  append(init(PERMISSION_SHEET_NAME, REQUEST_HEADERS), REQUEST_HEADERS, row);
  notify("gvcn", "Yêu cầu quyền sửa", row.requester + " xin sửa " + row.studentName, row);
  return row;
}

function resolveRequest(payload) {
  return {
    ok: true,
    id: txt(payload.id),
    status: txt(payload.status) || "approved"
  };
}

function notify(to, title, message, payload) {
  const row = {
    id: id("noti"),
    to: to || "",
    title: title || "Thông báo",
    message: message || "",
    status: "unread",
    payload_json: JSON.stringify(payload || {}),
    createdAt: iso()
  };

  append(init(NOTIFICATION_SHEET_NAME, NOTI_HEADERS), NOTI_HEADERS, row);
  return row;
}

function createWeek(week) {
  const weekNumber = Number(week || DEFAULT_WEEK);
  const name = "TUẦN " + weekNumber;

  if (book().getSheetByName(name)) {
    return { created: false, existed: true, week: weekNumber, sheetName: name };
  }

  const template = book().getSheetByName("TUẦN 0") || book().getSheetByName("TUAN 0");
  if (!template) throw new Error("Không tìm thấy TUẦN 0");

  const copy = template.copyTo(book());
  copy.setName(name);
  book().setActiveSheet(copy);
  book().moveActiveSheet(book().getNumSheets());
  copy.getRange("B2").setValue("LỚP 11A3- TUẦN " + weekNumber);

  log("createWeek", "Web", "Tạo " + name, { week: weekNumber });

  return { created: true, week: weekNumber, sheetName: name };
}


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
const SPREADSHEET_ID = "1GcmB64Tj2EPEpT9uhQ5IbIcO8Ysq-J5m12NDqSeiT0Y";

const ACCOUNTS_SHEET_NAME = "ACCOUNTS";
const RULES_SHEET_NAME = "VI_PHAM";
const EXTRA_EVENTS_SHEET_NAME = "ScoreEvents";

const DEFAULT_WEEK = 1;
const IGNORED_WEEKS = [0];
const SHEET_TOTAL_NOTE = "__SHEET_TOTAL__";

const EXTRA_EVENT_HEADERS = ["id", "studentId", "week", "title", "points", "type", "category", "note", "createdBy", "createdAt"];

function doGet(e) {
  const action = e && e.parameter && e.parameter.action ? e.parameter.action : "getScoreboard";

  try {
    if (action === "getScoreboard") return jsonOutput({ ok: true, data: getScoreboardData() });
    if (action === "health") return jsonOutput({ ok: true, message: "GAS API is running", updatedAt: new Date().toISOString() });
    return jsonOutput({ ok: false, error: "Unknown action: " + action });
  } catch (err) {
    return jsonOutput({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    const action = body.action;
    const payload = body.payload || {};

    if (action === "login") return jsonOutput({ ok: true, data: validateLogin(payload) });
    if (action === "addScoreEvent") return jsonOutput({ ok: true, data: { event: addScoreEvent(payload) } });
    if (action === "deleteScoreEvent") return jsonOutput({ ok: true, data: deleteScoreEvent(payload.id) });
    if (action === "createWeek") return jsonOutput({ ok: true, data: createWeek(payload.week) });
    if (action === "getScoreboard") return jsonOutput({ ok: true, data: getScoreboardData() });

    return jsonOutput({ ok: false, error: "Unknown action: " + action });
  } catch (err) {
    return jsonOutput({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function jsonOutput(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/\s+/g, "");
}

function cleanText(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}

function parseNumber(value) {
  const text = cleanText(value).replace(/\+/g, "").replace(/\s+/g, "").replace(",", ".");
  if (!text) return NaN;
  const parsed = Number(text);
  return isFinite(parsed) ? parsed : NaN;
}

function getLastNameInitial(name) {
  const parts = cleanText(name).split(/\s+/);
  return (parts[parts.length - 1] || "?").charAt(0).toUpperCase();
}

function toCategory(value) {
  const key = normalizeKey(value);
  if (key.indexOf("nenep") >= 0 || key.indexOf("nep") >= 0) return "NE_NEP";
  if (key.indexOf("phongtrao") >= 0 || key.indexOf("phong") >= 0) return "PHONG_TRAO";
  return "HOC_TAP";
}

function toType(value, points) {
  const key = normalizeKey(value);
  if (key === "cong") return "CONG";
  if (key === "tru") return "TRU";
  return Number(points) >= 0 ? "CONG" : "TRU";
}

function getSheetByAnyName(names) {
  const ss = getSpreadsheet();

  for (let i = 0; i < names.length; i++) {
    const sheet = ss.getSheetByName(names[i]);
    if (sheet) return sheet;
  }

  const normalizedNames = names.map(normalizeKey);
  const sheets = ss.getSheets();

  for (let i = 0; i < sheets.length; i++) {
    if (normalizedNames.indexOf(normalizeKey(sheets[i].getName())) >= 0) return sheets[i];
  }

  return null;
}

function getDisplayValues(sheet) {
  if (!sheet || sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) return [];
  return sheet.getDataRange().getDisplayValues();
}

function makeStudentId(seed, index) {
  const source = cleanText(seed) || ("student-" + (index + 1));
  const slug = source
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || ("s" + String(index + 1).padStart(2, "0"));
}

function getWeekNumberFromSheetName(sheetName) {
  const name = cleanText(sheetName);
  const key = normalizeKey(name);

  if (key === "tuan") return DEFAULT_WEEK;
  if (key.indexOf("tuan") < 0) return null;

  const match = name.match(/\d+/);
  if (!match) return DEFAULT_WEEK;

  return Number(match[0]);
}

function getWeekSheets() {
  const ss = getSpreadsheet();
  const result = [];

  ss.getSheets().forEach(function (sheet) {
    const week = getWeekNumberFromSheetName(sheet.getName());
    if (week === null) return;
    if (IGNORED_WEEKS.indexOf(Number(week)) >= 0) return; // Bỏ qua TUẦN 0.

    result.push({ sheet: sheet, week: Number(week) || DEFAULT_WEEK, name: sheet.getName() });
  });

  return result.sort(function (a, b) { return a.week - b.week; });
}

function isGroupRow(name) {
  return cleanText(name).match(/^tổ\s*(\d+)/i) || cleanText(name).match(/^to\s*(\d+)/i);
}

function getGroupNumber(name) {
  const match = cleanText(name).match(/^tổ\s*(\d+)/i) || cleanText(name).match(/^to\s*(\d+)/i);
  if (!match) return null;
  const group = Number(match[1]);
  return group === 1 || group === 2 || group === 3 || group === 4 ? group : null;
}

function isStudentDataRow(row, sttCol, nameCol) {
  const name = cleanText(row[nameCol]);
  if (!name || isGroupRow(name)) return false;

  const stt = sttCol !== undefined ? cleanText(row[sttCol]) : "";
  if (sttCol !== undefined && (!stt || !/^\d+$/.test(stt))) return false;

  return true;
}

function findLastIndexBefore(keys, targetKey, beforeIndex) {
  for (let index = Math.min(beforeIndex - 1, keys.length - 1); index >= 0; index--) {
    if (keys[index] === targetKey) return index;
  }
  return undefined;
}

function findIndexAfter(keys, targetKey, afterIndex) {
  for (let index = Math.max(afterIndex + 1, 0); index < keys.length; index++) {
    if (keys[index] === targetKey) return index;
  }
  return undefined;
}

function findFirstIndex(keys, targetKeys) {
  for (let index = 0; index < keys.length; index++) {
    if (targetKeys.indexOf(keys[index]) >= 0) return index;
  }
  return undefined;
}

/**
 * Tìm đúng bảng chấm bên phải trong sheet TUẦN.
 * Không dùng bảng tổng hợp bên trái.
 *
 * Dấu hiệu bảng chấm bên phải:
 * STT | Họ và tên | ND điểm cộng | Tổng cộng | Nội dung điểm trừ | Tổng trừ | Tổng điểm | Xếp Loại | Người chỉnh sửa
 */
function getScoreTableConfig(values) {
  for (let r = 0; r < Math.min(values.length, 40); r++) {
    const keys = (values[r] || []).map(normalizeKey);

    const plusTextCol = findFirstIndex(keys, ["nddiemcong", "noidungdiemcong"]);
    const minusTextCol = findFirstIndex(keys, ["noidungdiemtru", "nddiemtru"]);

    if (plusTextCol === undefined || minusTextCol === undefined) continue;

    const nameCol = findLastIndexBefore(keys, "hovaten", plusTextCol);
    const sttCol = nameCol === undefined ? undefined : findLastIndexBefore(keys, "stt", nameCol + 1);
    const plusTotalCol = findIndexAfter(keys, "tongcong", plusTextCol);
    const minusTotalCol = findIndexAfter(keys, "tongtru", minusTextCol);
    const totalCol = findIndexAfter(keys, "tongdiem", minusTextCol);
    const statusCol = findIndexAfter(keys, "xeploai", totalCol === undefined ? minusTextCol : totalCol);
    const editorCol = findIndexAfter(keys, "nguoichinhsua", statusCol === undefined ? minusTextCol : statusCol);

    if (nameCol === undefined || sttCol === undefined || totalCol === undefined || statusCol === undefined) continue;

    return {
      headerIndex: r,
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

  return null;
}

function getHeaderMap(values, preferredRowIndex) {
  const row = values[preferredRowIndex] || [];
  const map = {};
  row.forEach(function (header, index) {
    const key = normalizeKey(header);
    if (key) map[key] = index;
  });
  return map;
}

function findHeaderRow(values, requiredKeys) {
  for (let r = 0; r < Math.min(values.length, 40); r++) {
    const map = getHeaderMap(values, r);
    const ok = requiredKeys.every(function (key) { return map[key] !== undefined; });
    if (ok) return r;
  }
  return -1;
}

function readAccounts() {
  const sheet = getSheetByAnyName([ACCOUNTS_SHEET_NAME]);
  const values = getDisplayValues(sheet);
  if (!values.length) return [];

  const headerIndex = findHeaderRow(values, ["username", "password", "role"]);
  if (headerIndex < 0) return [];

  const map = getHeaderMap(values, headerIndex);
  const accounts = [];

  for (let r = headerIndex + 1; r < values.length; r++) {
    const row = values[r];
    const username = cleanText(row[map.username]);
    const password = cleanText(row[map.password]);
    const role = cleanText(row[map.role]) || "hoc_sinh";
    const nameCol = map.hoten !== undefined ? map.hoten : (map.name !== undefined ? map.name : map.hovaten);
    const name = cleanText(nameCol !== undefined ? row[nameCol] : "");
    const group = parseNumber(map.to !== undefined ? row[map.to] : "");

    if (!username && !name) continue;

    accounts.push({
      username: username,
      password: password,
      role: role,
      group: isFinite(group) ? group : "",
      name: name,
    });
  }

  return accounts;
}

function readStudentsFromWeekSheets() {
  const weekSheets = getWeekSheets();
  const studentsByName = {};
  const result = [];

  weekSheets.forEach(function (item) {
    const values = getDisplayValues(item.sheet);
    const config = getScoreTableConfig(values);
    if (!config) return;

    let currentGroup = null;

    for (let r = config.headerIndex + 1; r < values.length; r++) {
      const row = values[r];
      const name = cleanText(row[config.nameCol]);

      const groupNumber = getGroupNumber(name);
      if (groupNumber) {
        currentGroup = groupNumber;
        continue;
      }

      if (!isStudentDataRow(row, config.sttCol, config.nameCol)) continue;
      if (!currentGroup) currentGroup = 1;

      const key = normalizeKey(name);
      if (studentsByName[key]) continue;

      const status = cleanText(row[config.statusCol]);

      const student = {
        id: makeStudentId(name, result.length),
        name: name,
        group: currentGroup,
        role: "",
        avatarInitial: getLastNameInitial(name),
        statusOverride: status || ""
      };

      studentsByName[key] = student;
      result.push(student);
    }
  });

  return result;
}

function findStudentIdByName(students, name) {
  const key = normalizeKey(name);
  const found = students.find(function (student) { return normalizeKey(student.name) === key; });
  return found ? found.id : "";
}

function makeEvent(id, studentId, week, title, points, category, note) {
  return {
    id: id,
    studentId: studentId,
    week: week,
    title: title,
    points: Number(points) || 0,
    type: Number(points) >= 0 ? "CONG" : "TRU",
    category: category || "HOC_TAP",
    note: note || "",
    createdBy: "Google Sheets",
    createdAt: new Date().toISOString()
  };
}

function readEventsFromWeekSheets(students) {
  const weekSheets = getWeekSheets();
  const events = [];

  weekSheets.forEach(function (item) {
    const values = getDisplayValues(item.sheet);
    const config = getScoreTableConfig(values);
    if (!config) return;

    let currentGroup = null;

    for (let r = config.headerIndex + 1; r < values.length; r++) {
      const row = values[r];
      const name = cleanText(row[config.nameCol]);

      const groupNumber = getGroupNumber(name);
      if (groupNumber) {
        currentGroup = groupNumber;
        continue;
      }

      if (!isStudentDataRow(row, config.sttCol, config.nameCol)) continue;
      if (!currentGroup) currentGroup = 1;

      const studentId = findStudentIdByName(students, name);
      if (!studentId) continue;

      const plusText = config.plusTextCol !== undefined ? cleanText(row[config.plusTextCol]) : "";
      const minusText = config.minusTextCol !== undefined ? cleanText(row[config.minusTextCol]) : "";
      const plusTotalRaw = config.plusTotalCol !== undefined ? parseNumber(row[config.plusTotalCol]) : NaN;
      const minusTotalRaw = config.minusTotalCol !== undefined ? parseNumber(row[config.minusTotalCol]) : NaN;
      const totalRaw = config.totalCol !== undefined ? parseNumber(row[config.totalCol]) : NaN;
      const status = config.statusCol !== undefined ? cleanText(row[config.statusCol]) : "";
      const editor = config.editorCol !== undefined ? cleanText(row[config.editorCol]) : "";

      let visibleSum = 0;

      // Chỉ đưa vào cột cộng/trừ khi có nội dung cộng/trừ thật.
      // Không dùng Tổng điểm mặc định 50 làm điểm cộng.
      if (plusText || isFinite(plusTotalRaw)) {
        const points = isFinite(plusTotalRaw) ? Math.abs(plusTotalRaw) : 0;
        const title = plusText || "Điểm cộng từ trang tính";
        visibleSum += points;
        events.push(makeEvent("week-" + item.week + "-r" + (r + 1) + "-plus", studentId, item.week, title, points, "HOC_TAP", editor));
      }

      if (minusText || isFinite(minusTotalRaw)) {
        const points = -(isFinite(minusTotalRaw) ? Math.abs(minusTotalRaw) : 0);
        const title = minusText || "Điểm trừ từ trang tính";
        visibleSum += points;
        events.push(makeEvent("week-" + item.week + "-r" + (r + 1) + "-minus", studentId, item.week, title, points, "NE_NEP", editor));
      }

      // Tổng điểm lấy từ cột N / cột "Tổng điểm".
      // Event này chỉ để tính tổng, không hiển thị ở cột Cộng/Trừ.
      if (isFinite(totalRaw)) {
        const hiddenDiff = totalRaw - visibleSum;
        events.push(makeEvent(
          "week-" + item.week + "-r" + (r + 1) + "-sheet-total",
          studentId,
          item.week,
          "Tổng điểm từ trang tính",
          hiddenDiff,
          hiddenDiff >= 0 ? "HOC_TAP" : "NE_NEP",
          SHEET_TOTAL_NOTE + ";status=" + status
        ));
      }
    }
  });

  return events;
}

function ensureExtraEventsSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(EXTRA_EVENTS_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(EXTRA_EVENTS_SHEET_NAME);
    sheet.getRange(1, 1, 1, EXTRA_EVENT_HEADERS.length).setValues([EXTRA_EVENT_HEADERS]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function readExtraEvents() {
  const sheet = getSpreadsheet().getSheetByName(EXTRA_EVENTS_SHEET_NAME);
  if (!sheet) return [];

  const values = getDisplayValues(sheet);
  if (values.length < 2) return [];

  const headerIndex = findHeaderRow(values, ["id", "studentid", "week"]);
  if (headerIndex < 0) return [];

  const map = getHeaderMap(values, headerIndex);
  const events = [];

  for (let r = headerIndex + 1; r < values.length; r++) {
    const row = values[r];
    const id = cleanText(row[map.id]);
    const studentId = cleanText(row[map.studentid]);
    const title = cleanText(row[map.title]);

    if (!id || !studentId || !title) continue;

    const points = parseNumber(row[map.points]);

    events.push({
      id: id,
      studentId: studentId,
      week: parseNumber(row[map.week]) || DEFAULT_WEEK,
      title: title,
      points: isFinite(points) ? points : 0,
      type: cleanText(row[map.type]) || (points >= 0 ? "CONG" : "TRU"),
      category: cleanText(row[map.category]) || "HOC_TAP",
      note: cleanText(row[map.note]),
      createdBy: cleanText(row[map.createdby]) || "Web",
      createdAt: cleanText(row[map.createdat]) || new Date().toISOString()
    });
  }

  return events;
}

function readRules() {
  const sheet = getSheetByAnyName([RULES_SHEET_NAME]);
  const values = getDisplayValues(sheet);
  if (!values.length) return [];

  const headerIndex = findHeaderRow(values, ["ten", "diem"]);
  if (headerIndex < 0) return [];

  const map = getHeaderMap(values, headerIndex);
  const result = [];

  for (let r = headerIndex + 1; r < values.length; r++) {
    const row = values[r];
    const title = cleanText(row[map.ten]);

    if (!title) continue;

    const rawPoints = parseNumber(row[map.diem]);
    const tinh = cleanText(map.tinh !== undefined ? row[map.tinh] : "");
    const points = isFinite(rawPoints) ? (normalizeKey(tinh) === "tru" ? -Math.abs(rawPoints) : Math.abs(rawPoints)) : 0;
    const category = toCategory(map.phanloai !== undefined ? row[map.phanloai] : "");
    const note = cleanText(map.ghichu !== undefined ? row[map.ghichu] : "");

    result.push({
      title: title,
      points: points,
      type: toType(tinh, points),
      category: category,
      note: note
    });
  }

  return result;
}

function getScoreboardData() {
  const students = readStudentsFromWeekSheets();
  const weekEvents = readEventsFromWeekSheets(students);
  const extraEvents = readExtraEvents();
  const events = weekEvents.concat(extraEvents);

  const weeks = Array.from(new Set(
    getWeekSheets()
      .map(function (item) { return item.week; })
      .concat(events.map(function (event) { return Number(event.week); }))
  ))
    .filter(function (week) { return isFinite(week) && IGNORED_WEEKS.indexOf(Number(week)) < 0; })
    .sort(function (a, b) { return a - b; });

  return {
    students: students,
    events: events,
    weeks: weeks.length ? weeks : [DEFAULT_WEEK],
    quickScoreReasons: readRules(),
    updatedAt: new Date().toISOString()
  };
}

function validateLogin(payload) {
  const username = cleanText(payload.username).toLowerCase();
  const password = cleanText(payload.password);

  if (!username || !password) return { ok: false, error: "Thiếu tên đăng nhập hoặc mật khẩu." };

  const accounts = readAccounts();
  const found = accounts.find(function (account) {
    return cleanText(account.username).toLowerCase() === username && cleanText(account.password) === password;
  });

  if (!found) return { ok: false, error: "Tên đăng nhập hoặc mật khẩu không đúng." };

  return {
    ok: true,
    user: {
      uid: "gas-" + makeStudentId(found.username || found.name, 0),
      displayName: found.name || found.username,
      email: found.username,
      photoURL: null,
      provider: "gas",
      role: found.role || "hoc_sinh",
      group: found.group || ""
    }
  };
}

function appendObject(sheet, headers, record) {
  const row = headers.map(function (header) {
    return record[header] === undefined ? "" : record[header];
  });

  sheet.appendRow(row);
}

function addScoreEvent(payload) {
  const points = Number(payload.points || 0);
  const event = {
    id: payload.id && String(payload.id).indexOf("local-") !== 0 ? payload.id : "e" + Date.now(),
    studentId: cleanText(payload.studentId),
    week: Number(payload.week || DEFAULT_WEEK),
    title: cleanText(payload.title),
    points: points,
    type: cleanText(payload.type) || (points >= 0 ? "CONG" : "TRU"),
    category: cleanText(payload.category) || "HOC_TAP",
    note: cleanText(payload.note),
    createdBy: cleanText(payload.createdBy) || "Web",
    createdAt: payload.createdAt || new Date().toISOString()
  };

  if (!event.studentId || !event.title) throw new Error("Thiếu studentId hoặc title.");

  const sheet = ensureExtraEventsSheet();
  appendObject(sheet, EXTRA_EVENT_HEADERS, event);
  return event;
}

function deleteScoreEvent(id) {
  const sheet = getSpreadsheet().getSheetByName(EXTRA_EVENTS_SHEET_NAME);
  if (!sheet) return { deleted: false };

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { deleted: false };

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();

  for (let index = 0; index < ids.length; index++) {
    if (String(ids[index][0]) === String(id)) {
      sheet.deleteRow(index + 2);
      return { deleted: true };
    }
  }

  return { deleted: false };
}

function createWeek(week) {
  return { created: true, week: Number(week || DEFAULT_WEEK) };
}

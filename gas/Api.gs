const SPREADSHEET_ID = "1GcmB64Tj2EPEpT9uhQ5IbIcO8Ysq-J5m12NDqSeiT0Y";

const STUDENTS_SHEET_NAME = "Students";
const EVENTS_SHEET_NAME = "ScoreEvents";
const WEEKS_SHEET_NAME = "Weeks";

const STUDENT_HEADERS = ["id", "name", "group", "role", "avatarInitial"];
const EVENT_HEADERS = ["id", "studentId", "week", "title", "points", "type", "category", "note", "createdBy", "createdAt"];
const WEEK_HEADERS = ["week"];

function doGet(e) {
  const action = e && e.parameter && e.parameter.action ? e.parameter.action : "getScoreboard";

  try {
    if (action === "getScoreboard") return jsonOutput({ ok: true, data: getScoreboardData() });
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
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function ensureSheet(name, headers) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  const current = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn())).getValues()[0];
  const hasAnyHeader = current.some(function (value) { return String(value || "").trim(); });

  if (!hasAnyHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function readObjects(sheetName, headers) {
  const sheet = ensureSheet(sheetName, headers);
  const lastRow = sheet.getLastRow();
  const lastColumn = Math.max(sheet.getLastColumn(), headers.length);
  if (lastRow < 2) return [];

  const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  const actualHeaders = values.shift().map(function (header) { return String(header || "").trim(); });

  return values
    .filter(function (row) { return row.some(function (cell) { return cell !== "" && cell !== null; }); })
    .map(function (row) {
      const record = {};
      actualHeaders.forEach(function (header, index) {
        if (!header) return;
        let value = row[index];
        if (value instanceof Date) value = value.toISOString();
        record[header] = value;
      });
      return record;
    });
}

function appendObject(sheetName, headers, record) {
  const sheet = ensureSheet(sheetName, headers);
  const row = headers.map(function (header) { return record[header] === undefined ? "" : record[header]; });
  sheet.appendRow(row);
}

function getScoreboardData() {
  const students = readObjects(STUDENTS_SHEET_NAME, STUDENT_HEADERS).map(normalizeStudent);
  const events = readObjects(EVENTS_SHEET_NAME, EVENT_HEADERS).map(normalizeEvent);
  const weekRows = readObjects(WEEKS_SHEET_NAME, WEEK_HEADERS);
  const weeks = Array.from(new Set(weekRows.map(function (row) { return Number(row.week); }).filter(isFinite).concat(events.map(function (event) { return Number(event.week); })))).sort(function (a, b) { return a - b; });

  return {
    students: students,
    events: events,
    weeks: weeks,
    updatedAt: new Date().toISOString()
  };
}

function normalizeStudent(row, index) {
  const name = String(row.name || row["Họ và tên"] || row["Học sinh"] || "").trim();
  return {
    id: String(row.id || row.studentId || ("s" + String(index + 1).padStart(2, "0"))).trim(),
    name: name,
    group: Number(row.group || row["Tổ"] || 1),
    role: String(row.role || row["Chức vụ"] || "").trim(),
    avatarInitial: String(row.avatarInitial || getLastNameInitial(name)).trim()
  };
}

function normalizeEvent(row, index) {
  const points = Number(row.points || row["Điểm"] || 0);
  return {
    id: String(row.id || ("e" + String(index + 1).padStart(4, "0"))).trim(),
    studentId: String(row.studentId || row["Mã học sinh"] || "").trim(),
    week: Number(row.week || row["Tuần"] || 37),
    title: String(row.title || row["Nội dung"] || row["Lý do"] || "").trim(),
    points: points,
    type: String(row.type || (points >= 0 ? "CONG" : "TRU")).trim(),
    category: String(row.category || row["Nhóm"] || "HOC_TAP").trim(),
    note: String(row.note || row["Ghi chú"] || "").trim(),
    createdBy: String(row.createdBy || row["Người nhập"] || "Google Sheets").trim(),
    createdAt: row.createdAt || row["Thời gian"] || new Date().toISOString()
  };
}

function addScoreEvent(payload) {
  const event = normalizeEvent(Object.assign({}, payload, {
    id: payload.id && String(payload.id).indexOf("local-") !== 0 ? payload.id : "e" + Date.now(),
    createdAt: payload.createdAt || new Date().toISOString()
  }), 0);

  appendObject(EVENTS_SHEET_NAME, EVENT_HEADERS, event);
  createWeek(event.week);
  return event;
}

function deleteScoreEvent(id) {
  const sheet = ensureSheet(EVENTS_SHEET_NAME, EVENT_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { deleted: false };

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let index = 0; index < ids.length; index++) {
    if (String(ids[index][0]) === String(id)) {
      sheet.deleteRow(index + 2);
      return { deleted: true };
    }
  }

  return { deleted: false };
}

function createWeek(week) {
  const numericWeek = Number(week);
  if (!isFinite(numericWeek)) return { created: false };

  const sheet = ensureSheet(WEEKS_SHEET_NAME, WEEK_HEADERS);
  const existing = readObjects(WEEKS_SHEET_NAME, WEEK_HEADERS).map(function (row) { return Number(row.week); });
  if (existing.indexOf(numericWeek) === -1) sheet.appendRow([numericWeek]);
  return { created: true, week: numericWeek };
}

function getLastNameInitial(name) {
  const parts = String(name || "").trim().split(/\s+/);
  return (parts[parts.length - 1] || "?").charAt(0).toUpperCase();
}

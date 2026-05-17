/**
 * A3K64 Discipline Point - Google Apps Script API
 *
 * 1. Tạo Google Sheet mới.
 * 2. Extensions → Apps Script.
 * 3. Copy file này vào Code.gs hoặc Api.gs.
 * 4. Sửa SPREADSHEET_ID.
 * 5. Deploy → New deployment → Web app.
 *    Execute as: Me
 *    Who has access: Anyone
 * 6. Copy Web app URL vào VITE_GAS_WEB_APP_URL.
 */

const SPREADSHEET_ID = "PASTE_SPREADSHEET_ID_HERE";

const SHEETS = {
  STUDENTS: "Students",
  EVENTS: "ScoreEvents",
  WEEKS: "Weeks",
};

const STUDENT_HEADERS = ["id", "name", "group", "role", "avatarInitial"];
const EVENT_HEADERS = ["id", "studentId", "week", "title", "points", "type", "category", "note", "createdBy", "createdAt"];
const WEEK_HEADERS = ["week"];

function doGet() {
  return json_({ ok: true, service: "a3k64-gas-api", at: new Date().toISOString() });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const action = body.action;
    const payload = body.payload || {};

    ensureSheets_();

    if (action === "ping") {
      return json_({ ok: true, service: "a3k64-gas-api", at: new Date().toISOString() });
    }

    if (action === "getScoreState") {
      return json_({
        ok: true,
        students: readStudents_(),
        events: readEvents_(),
        weeks: readWeeks_(),
      });
    }

    if (action === "appendScoreEvent") {
      const event = payload.event;
      if (!event || !event.id) throw new Error("Missing event");

      appendRowObject_(SHEETS.EVENTS, EVENT_HEADERS, event);
      return json_({ ok: true, event });
    }

    if (action === "deleteScoreEvent") {
      const eventId = String(payload.eventId || "");
      if (!eventId) throw new Error("Missing eventId");

      deleteEvent_(eventId);
      return json_({ ok: true, deleted: eventId });
    }

    return json_({ ok: false, error: "Unknown action: " + action });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function ss_() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === "PASTE_SPREADSHEET_ID_HERE") {
    throw new Error("Chưa cấu hình SPREADSHEET_ID trong Apps Script");
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function ensureSheets_() {
  const ss = ss_();
  ensureSheet_(ss, SHEETS.STUDENTS, STUDENT_HEADERS);
  ensureSheet_(ss, SHEETS.EVENTS, EVENT_HEADERS);
  ensureSheet_(ss, SHEETS.WEEKS, WEEK_HEADERS);
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const isEmpty = firstRow.every((value) => value === "");

  if (isEmpty) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function readStudents_() {
  return readObjects_(SHEETS.STUDENTS, STUDENT_HEADERS)
    .filter((row) => row.id && row.name)
    .map((row) => ({
      id: String(row.id),
      name: String(row.name),
      group: Number(row.group || 1),
      role: row.role ? String(row.role) : undefined,
      avatarInitial: row.avatarInitial ? String(row.avatarInitial) : undefined,
    }));
}

function readEvents_() {
  return readObjects_(SHEETS.EVENTS, EVENT_HEADERS)
    .filter((row) => row.id && row.studentId)
    .map((row) => ({
      id: String(row.id),
      studentId: String(row.studentId),
      week: Number(row.week || 0),
      title: String(row.title || ""),
      points: Number(row.points || 0),
      type: String(row.type || "CONG"),
      category: String(row.category || "HOC_TAP"),
      note: row.note ? String(row.note) : undefined,
      createdBy: String(row.createdBy || "GAS"),
      createdAt: String(row.createdAt || new Date().toISOString()),
    }));
}

function readWeeks_() {
  const weeks = readObjects_(SHEETS.WEEKS, WEEK_HEADERS)
    .map((row) => Number(row.week))
    .filter((week) => !isNaN(week));

  return weeks.length ? weeks : [37];
}

function readObjects_(sheetName, headers) {
  const sheet = ss_().getSheetByName(sheetName);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  return values.map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

function appendRowObject_(sheetName, headers, obj) {
  const sheet = ss_().getSheetByName(sheetName);
  const row = headers.map((header) => obj[header] === undefined ? "" : obj[header]);
  sheet.appendRow(row);
}

function deleteEvent_(eventId) {
  const sheet = ss_().getSheetByName(SHEETS.EVENTS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();

  for (let i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i]) === String(eventId)) {
      sheet.deleteRow(i + 2);
    }
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

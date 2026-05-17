const SPREADSHEET_ID = "1GcmB64Tj2EPEpT9uhQ5IbIcO8Ysq-J5m12NDqSeiT0Y";

const ACCOUNTS_SHEET_NAME = "ACCOUNTS";
const RULES_SHEET_NAME = "VI_PHAM";
const WEEK_SHEET_NAMES = ["TUẦN", "TUAN", "Tuần", "Tuan"];
const EXTRA_EVENTS_SHEET_NAME = "ScoreEvents";

const DEFAULT_WEEK = 37;

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
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
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

function getHeaderMap(values, preferredRowIndex) {
  const headerRow = values[preferredRowIndex] || [];
  const map = {};
  headerRow.forEach(function (header, index) {
    const key = normalizeKey(header);
    if (key) map[key] = index;
  });
  return map;
}

function findHeaderRow(values, requiredKeys) {
  for (let r = 0; r < Math.min(values.length, 30); r++) {
    const map = getHeaderMap(values, r);
    const ok = requiredKeys.every(function (key) { return map[key] !== undefined; });
    if (ok) return r;
  }
  return -1;
}

function firstDefined() {
  for (let i = 0; i < arguments.length; i++) {
    if (arguments[i] !== undefined && arguments[i] !== null && cleanText(arguments[i]) !== "") return arguments[i];
  }
  return "";
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
    const sheetNameKey = normalizeKey(sheets[i].getName());
    if (normalizedNames.indexOf(sheetNameKey) >= 0) return sheets[i];
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

function readAccounts() {
  const sheet = getSheetByAnyName([ACCOUNTS_SHEET_NAME]);
  const values = getDisplayValues(sheet);
  if (!values.length) return [];

  const headerIndex = findHeaderRow(values, ["username", "password", "role"]);
  if (headerIndex < 0) return [];

  const map = getHeaderMap(values, headerIndex);
  const usernameCol = map.username;
  const passwordCol = map.password;
  const roleCol = map.role;
  const groupCol = map.to !== undefined ? map.to : map["to"];
  const nameCol = map.hoten !== undefined ? map.hoten : (map.name !== undefined ? map.name : map["hovaten"]);

  const accounts = [];

  for (let r = headerIndex + 1; r < values.length; r++) {
    const row = values[r];
    const username = cleanText(row[usernameCol]);
    const password = cleanText(row[passwordCol]);
    const role = cleanText(row[roleCol]) || "hoc_sinh";
    const name = cleanText(nameCol !== undefined ? row[nameCol] : "");
    const group = parseNumber(groupCol !== undefined ? row[groupCol] : "");
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

function readStudentsFromAccounts() {
  const accounts = readAccounts();
  const students = [];

  accounts.forEach(function (account, index) {
    const roleKey = normalizeKey(account.role);
    const groupNumber = Number(account.group);
    const name = cleanText(account.name);

    if (!name) return;
    if (roleKey !== "hocsinh" && !isFinite(groupNumber)) return;

    students.push({
      id: makeStudentId(account.username || name, index),
      name: name,
      group: groupNumber === 1 || groupNumber === 2 || groupNumber === 3 || groupNumber === 4 ? groupNumber : 1,
      role: account.role || "hoc_sinh",
      avatarInitial: getLastNameInitial(name),
      username: account.username
    });
  });

  return students;
}

function readWeekSheetStudents() {
  const weekSheets = getWeekSheets();
  const studentsByName = {};
  const result = [];

  weekSheets.forEach(function (item) {
    const values = getDisplayValues(item.sheet);
    const headerIndex = findHeaderRow(values, ["hovaten"]);
    if (headerIndex < 0) return;

    const map = getHeaderMap(values, headerIndex);
    const nameCol = map["hovaten"];
    const sttCol = map.stt;
    let currentGroup = 1;

    for (let r = headerIndex + 1; r < values.length; r++) {
      const row = values[r];
      const name = cleanText(row[nameCol]);
      if (!name) continue;

      const groupMatch = name.match(/^tổ\s*(\d+)/i) || name.match(/^to\s*(\d+)/i);
      if (groupMatch) {
        currentGroup = Number(groupMatch[1]);
        continue;
      }

      const stt = sttCol !== undefined ? cleanText(row[sttCol]) : "";
      if (!stt || !/^\d+$/.test(stt)) continue;
      if (studentsByName[normalizeKey(name)]) continue;

      const student = {
        id: makeStudentId(name, result.length),
        name: name,
        group: currentGroup === 1 || currentGroup === 2 || currentGroup === 3 || currentGroup === 4 ? currentGroup : 1,
        role: "",
        avatarInitial: getLastNameInitial(name)
      };

      studentsByName[normalizeKey(name)] = student;
      result.push(student);
    }
  });

  return result;
}

function mergeStudents() {
  const fromAccounts = readStudentsFromAccounts();
  const fromWeek = readWeekSheetStudents();
  const byName = {};
  const result = [];

  fromAccounts.forEach(function (student) {
    byName[normalizeKey(student.name)] = student;
    result.push(student);
  });

  fromWeek.forEach(function (student) {
    const key = normalizeKey(student.name);
    if (byName[key]) {
      if (!byName[key].group && student.group) byName[key].group = student.group;
      return;
    }
    byName[key] = student;
    result.push(student);
  });

  return result;
}

function getWeekSheets() {
  const ss = getSpreadsheet();
  const sheets = ss.getSheets();
  const result = [];

  sheets.forEach(function (sheet) {
    const key = normalizeKey(sheet.getName());
    if (key === "tuan" || key.indexOf("tuan") >= 0) {
      const numberMatch = sheet.getName().match(/\d+/);
      result.push({
        sheet: sheet,
        week: numberMatch ? Number(numberMatch[0]) : DEFAULT_WEEK
      });
    }
  });

  const foundExact = getSheetByAnyName(WEEK_SHEET_NAMES);
  if (foundExact && !result.some(function (item) { return item.sheet.getSheetId() === foundExact.getSheetId(); })) {
    result.push({ sheet: foundExact, week: DEFAULT_WEEK });
  }

  return result;
}

function findStudentIdByName(students, name) {
  const key = normalizeKey(name);
  const found = students.find(function (student) { return normalizeKey(student.name) === key; });
  return found ? found.id : "";
}

function splitContent(text) {
  const value = cleanText(text);
  if (!value) return [];
  return value
    .split(/\n|;|,/)
    .map(function (item) { return cleanText(item); })
    .filter(Boolean);
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
    const headerIndex = findHeaderRow(values, ["hovaten"]);
    if (headerIndex < 0) return;

    const map = getHeaderMap(values, headerIndex);
    const nameCol = map["hovaten"];
    const sttCol = map.stt;

    const plusTextCol = map["nddiemcong"] !== undefined ? map["nddiemcong"] : map["noidungdiemcong"];
    const plusTotalCol = map["tongcong"];
    const minusTextCol = map["noidungdiemtru"] !== undefined ? map["noidungdiemtru"] : map["nddiemtru"];
    const minusTotalCol = map["tongtru"];
    const totalCol = map["tongdiem"];
    const editorCol = map["nguoichinhsua"];

    for (let r = headerIndex + 1; r < values.length; r++) {
      const row = values[r];
      const name = cleanText(row[nameCol]);
      if (!name) continue;
      if (/^tổ\s*\d+/i.test(name) || /^to\s*\d+/i.test(name)) continue;

      const stt = sttCol !== undefined ? cleanText(row[sttCol]) : "";
      if (sttCol !== undefined && (!stt || !/^\d+$/.test(stt))) continue;

      const studentId = findStudentIdByName(students, name);
      if (!studentId) continue;

      const plusText = plusTextCol !== undefined ? cleanText(row[plusTextCol]) : "";
      const minusText = minusTextCol !== undefined ? cleanText(row[minusTextCol]) : "";
      const plusTotalRaw = plusTotalCol !== undefined ? parseNumber(row[plusTotalCol]) : NaN;
      const minusTotalRaw = minusTotalCol !== undefined ? parseNumber(row[minusTotalCol]) : NaN;
      const totalRaw = totalCol !== undefined ? parseNumber(row[totalCol]) : NaN;
      const editor = editorCol !== undefined ? cleanText(row[editorCol]) : "";

      let detailSum = 0;

      if (plusText || isFinite(plusTotalRaw)) {
        const points = isFinite(plusTotalRaw) ? Math.abs(plusTotalRaw) : 0;
        const title = plusText || "Điểm cộng từ trang tính";
        detailSum += points;
        events.push(makeEvent("week-" + item.week + "-r" + (r + 1) + "-plus", studentId, item.week, title, points, "HOC_TAP", editor));
      }

      if (minusText || isFinite(minusTotalRaw)) {
        const points = -(isFinite(minusTotalRaw) ? Math.abs(minusTotalRaw) : 0);
        const title = minusText || "Điểm trừ từ trang tính";
        detailSum += points;
        events.push(makeEvent("week-" + item.week + "-r" + (r + 1) + "-minus", studentId, item.week, title, points, "NE_NEP", editor));
      }

      if (isFinite(totalRaw) && totalRaw !== detailSum) {
        const diff = totalRaw - detailSum;
        events.push(makeEvent(
          "week-" + item.week + "-r" + (r + 1) + "-total-adjust",
          studentId,
          item.week,
          diff >= 0 ? "Điểm nền từ trang tính" : "Điều chỉnh từ trang tính",
          diff,
          diff >= 0 ? "HOC_TAP" : "NE_NEP",
          editor
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
  const students = mergeStudents();
  const weekEvents = readEventsFromWeekSheets(students);
  const extraEvents = readExtraEvents();
  const events = weekEvents.concat(extraEvents);

  const weeks = Array.from(new Set(
    getWeekSheets().map(function (item) { return item.week; })
      .concat(events.map(function (event) { return Number(event.week); }))
  )).filter(isFinite).sort(function (a, b) { return a - b; });

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

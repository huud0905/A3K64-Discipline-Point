const SPREADSHEET_ID = "1GcmB64Tj2EPEpT9uhQ5IbIcO8Ysq-J5m12NDqSeiT0Y";

const ACCOUNTS_SHEET_NAME = "ACCOUNTS";
const RULES_SHEET_NAME = "VI_PHAM";
const HISTORY_SHEET_NAME = "_CHANGE_HISTORY";
const LOG_SHEET_NAME = "_ACTIVITY_LOG";
const PERMISSION_SHEET_NAME = "_EDIT_PERMISSION_REQUESTS";
const NOTIFICATION_SHEET_NAME = "_NOTIFICATIONS";

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
  "payload_json",
];
const LOG_HEADERS = ["id", "type", "actor", "detail", "payload_json", "createdAt"];
const REQUEST_HEADERS = ["id", "week", "requester", "studentId", "studentName", "reason", "status", "resolvedBy", "resolvedAt", "createdAt"];
const NOTI_HEADERS = ["id", "to", "title", "message", "status", "payload_json", "createdAt"];

function doGet(e) {
  const a = (e && e.parameter && e.parameter.action) || "getScoreboard";
  try {
    if (a === "getScoreboard") return out({ ok: true, data: getScoreboardData() });
    if (a === "getRules") return out({ ok: true, data: { rules: readRules(), updatedAt: iso() } });
    if (a === "getStudentChangeHistory") return out({ ok: true, data: getStudentChangeHistory(e.parameter || {}) });
    if (a === "getPermissionRequests") return out({ ok: true, data: readRows(PERMISSION_SHEET_NAME, e.parameter || {}) });
    if (a === "getNotifications") return out({ ok: true, data: readRows(NOTIFICATION_SHEET_NAME, e.parameter || {}) });
    return out({ ok: true, message: "GAS API is running", updatedAt: iso() });
  } catch (err) {
    return out({ ok: false, error: msg(err) });
  }
}

function doPost(e) {
  try {
    const b = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    const a = b.action;
    const p = b.payload || {};
    if (a === "login") return out({ ok: true, data: login(p) });
    if (a === "addScoreEvent") return out({ ok: true, data: { event: addScoreEvent(p), scoreboard: getScoreboardData() } });
    if (a === "deleteScoreEvent") return out({ ok: true, data: { deleted: deleteScoreEvent(p.id), scoreboard: getScoreboardData() } });
    if (a === "bulkScore") return out({ ok: true, data: bulkScore(p) });
    if (a === "createWeek") return out({ ok: true, data: createWeek(p.week) });
    if (a === "createEditPermissionRequest") return out({ ok: true, data: createRequest(p) });
    if (a === "resolveEditPermissionRequest") return out({ ok: true, data: resolveRequest(p) });
    if (a === "getStudentChangeHistory") return out({ ok: true, data: getStudentChangeHistory(p) });
    if (a === "getScoreboard") return out({ ok: true, data: getScoreboardData() });
    return out({ ok: false, error: "Unknown action: " + a });
  } catch (err) {
    return out({ ok: false, error: msg(err) });
  }
}

function out(x) {
  return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON);
}
function msg(e) { return String(e && e.message ? e.message : e); }
function book() { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function iso() { return new Date().toISOString(); }
function txt(v) { return String(v == null ? "" : v).trim(); }
function key(v) { return txt(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").replace(/\s+/g, ""); }
function num(v) { const n = Number(txt(v).replace(/\+/g, "").replace(/\s+/g, "").replace(",", ".")); return isFinite(n) ? n : NaN; }
function id(p) { return p + Date.now() + Math.floor(Math.random() * 9999); }

function init(name, heads) {
  let s = book().getSheetByName(name);
  if (!s) {
    s = book().insertSheet(name);
    s.getRange(1, 1, 1, heads.length).setValues([heads]);
    s.setFrozenRows(1);
    return s;
  }
  if (heads && heads.length) {
    const current = s.getLastColumn() >= heads.length ? s.getRange(1, 1, 1, heads.length).getDisplayValues()[0].map(txt) : [];
    const same = current.length === heads.length && current.every((x, i) => x === heads[i]);
    if (!same) {
      s.getRange(1, 1, 1, heads.length).setValues([heads]);
      s.setFrozenRows(1);
    }
  }
  return s;
}

function vals(s) { return !s || s.getLastRow() < 1 || s.getLastColumn() < 1 ? [] : s.getDataRange().getDisplayValues(); }
function append(s, h, r) { s.appendRow(h.map(k => r[k] === undefined ? "" : r[k])); }
function hmap(v, row) { const m = {}; (v[row] || []).forEach((x, i) => { const k = key(x); if (k) m[k] = i; }); return m; }
function hrow(v, need) { for (let r = 0; r < Math.min(v.length, 50); r++) { const m = hmap(v, r); if (need.every(k => m[k] !== undefined)) return r; } return -1; }
function sheetAny(names) { for (const n of names) { const s = book().getSheetByName(n); if (s) return s; } const ns = names.map(key); return book().getSheets().find(s => ns.includes(key(s.getName()))) || null; }
function weekNo(name) { if (!key(name).includes("tuan")) return null; const m = txt(name).match(/\d+/); return m ? Number(m[0]) : DEFAULT_WEEK; }
function weekSheets() { return book().getSheets().map(s => ({ sheet: s, week: weekNo(s.getName()) })).filter(x => x.week && x.week !== 0).sort((a, b) => a.week - b.week); }
function weekSheet(w) { return book().getSheetByName("TUẦN " + w) || book().getSheetByName("TUAN " + w) || (weekSheets().find(x => Number(x.week) === Number(w)) || {}).sheet; }
function first(a, list) { for (let i = 0; i < a.length; i++) if (list.includes(a[i])) return i; }
function lastBefore(a, t, b) { for (let i = Math.min(b - 1, a.length - 1); i >= 0; i--) if (a[i] === t) return i; }
function after(a, t, b) { for (let i = Math.max(b + 1, 0); i < a.length; i++) if (a[i] === t) return i; }

function scoreCfg(v) {
  for (let r = 0; r < Math.min(v.length, 50); r++) {
    const a = (v[r] || []).map(key), pt = first(a, ["nddiemcong", "noidungdiemcong"]), mt = first(a, ["noidungdiemtru", "nddiemtru"]);
    if (pt === undefined || mt === undefined) continue;
    const nc = lastBefore(a, "hovaten", pt), sc = nc === undefined ? undefined : lastBefore(a, "stt", nc + 1), pc = after(a, "tongcong", pt), mc = after(a, "tongtru", mt), tc = after(a, "tongdiem", mt), xc = after(a, "xeploai", tc === undefined ? mt : tc), ec = after(a, "nguoichinhsua", xc === undefined ? mt : xc);
    if (nc !== undefined && sc !== undefined && tc !== undefined && xc !== undefined) return { headerIndex: r, sttCol: sc, nameCol: nc, plusTextCol: pt, plusTotalCol: pc, minusTextCol: mt, minusTotalCol: mc, totalCol: tc, statusCol: xc, editorCol: ec };
  }
  return null;
}

function groupNo(n) { const m = txt(n).match(/^tổ\s*(\d+)/i) || txt(n).match(/^to\s*(\d+)/i); return m ? Number(m[1]) : null; }
function isStudent(row, c) { return /^\d+$/.test(txt(row[c.sttCol])) && txt(row[c.nameCol]) && !groupNo(row[c.nameCol]); }
function studentId(n, i) { return (txt(n) || ("s" + i)).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function status(t) { return t >= 50 ? "Tốt" : t >= 0 ? "Khá" : t >= -50 ? "Đạt" : "Chưa đạt"; }
function cat(v) { const k = key(v); return k.includes("nenep") || k.includes("nep") ? "NE_NEP" : k.includes("phong") ? "PHONG_TRAO" : "HOC_TAP"; }
function typ(v, p) { const k = key(v); return k === "tru" ? "TRU" : k === "cong" ? "CONG" : p >= 0 ? "CONG" : "TRU"; }

function students() {
  const out = [], seen = {};
  weekSheets().forEach(w => {
    const v = vals(w.sheet), c = scoreCfg(v);
    if (!c) return;
    let g = 1;
    for (let r = c.headerIndex + 1; r < v.length; r++) {
      const n = txt(v[r][c.nameCol]), gn = groupNo(n);
      if (gn) { g = gn; continue; }
      if (!isStudent(v[r], c)) continue;
      const k = key(n);
      if (seen[k]) continue;
      seen[k] = 1;
      out.push({ id: studentId(n, out.length), name: n, group: g, role: "", avatarInitial: (n.split(/\s+/).pop() || "?")[0].toUpperCase() });
    }
  });
  return out;
}

function findRow(s, c, sid) {
  const st = students().find(x => x.id === sid);
  if (!st) return null;
  const v = vals(s);
  for (let r = c.headerIndex + 1; r < v.length; r++) if (key(v[r][c.nameCol]) === key(st.name)) return { row: r + 1, name: st.name, group: st.group };
  return null;
}

function makeEvent(i, s, w, t, p, c, n) { return { id: i, studentId: s, week: w, title: t, points: p, type: p >= 0 ? "CONG" : "TRU", category: c || "HOC_TAP", note: n || "", createdBy: "Google Sheets", createdAt: iso() }; }
function pointFromLine(line, fallback) { const m = txt(line).match(/\(([+-]?\d+)\)\s*$/); const n = m ? Number(m[1]) : NaN; return isFinite(n) ? n : fallback; }
function splitLines(text) { return txt(text).split(/\r?\n/).map(txt).filter(Boolean); }
function cellEvents(ev, sid, w, rowNo, prefix, text, total, isPlus) { const lines = splitLines(text), out = []; if (!lines.length) return 0; let used = 0; lines.forEach((line, i) => { let p = pointFromLine(line, lines.length === 1 ? total : 0); p = isPlus ? Math.abs(p) : -Math.abs(p); used += p; out.push(makeEvent(`${prefix}${rowNo}_${i}`, sid, w, line, p, cat(line), "")); }); ev.push.apply(ev, out); return used; }

function eventsFromWeeks(st) {
  const ev = [];
  weekSheets().forEach(w => {
    const v = vals(w.sheet), c = scoreCfg(v);
    if (!c) return;
    for (let r = c.headerIndex + 1; r < v.length; r++) {
      if (!isStudent(v[r], c)) continue;
      const s = st.find(x => key(x.name) === key(v[r][c.nameCol]));
      if (!s) continue;
      const plus = txt(v[r][c.plusTextCol]), minus = txt(v[r][c.minusTextCol]), pt = num(v[r][c.plusTotalCol]), mt = num(v[r][c.minusTotalCol]);
      let plusTotal = isFinite(pt) ? Math.abs(pt) : 0, minusTotal = isFinite(mt) ? Math.abs(mt) : 0, total = num(v[r][c.totalCol]);
      if (!isFinite(total)) total = BASE_SCORE + plusTotal - minusTotal;
      const xl = status(total);
      let vis = 0;
      vis += cellEvents(ev, s.id, w.week, r, "w" + w.week + "r" + r + "p", plus, plusTotal, true);
      vis += cellEvents(ev, s.id, w.week, r, "w" + w.week + "r" + r + "m", minus, minusTotal, false);
      ev.push(makeEvent(`w${w.week}r${r}t`, s.id, w.week, "Tổng điểm từ trang tính", total - vis, "HOC_TAP", SHEET_TOTAL_NOTE + ";status=" + xl));
    }
  });
  return ev;
}

function readRules() {
  const s = sheetAny([RULES_SHEET_NAME]), v = vals(s), r = hrow(v, ["ten", "diem"]);
  if (r < 0) return [];
  const m = hmap(v, r), out = [];
  for (let i = r + 1; i < v.length; i++) {
    const title = txt(v[i][m.ten]);
    if (!title) continue;
    const raw = num(v[i][m.diem]), type = typ(v[i][m.tinh], raw), points = type === "TRU" ? -Math.abs(raw) : Math.abs(raw);
    out.push({ title, points: isFinite(points) ? points : 0, type, category: cat(v[i][m.phanloai]), note: txt(v[i][m.ghichu]) });
  }
  return out;
}
function getScoreboardData() { const st = students(), ev = eventsFromWeeks(st), weeks = [...new Set(weekSheets().map(x => x.week).concat(ev.map(e => e.week)))].sort((a, b) => a - b); return { students: st, events: ev, weeks: weeks.length ? weeks : [DEFAULT_WEEK], quickScoreReasons: readRules(), updatedAt: iso() }; }
function accounts() { const s = sheetAny([ACCOUNTS_SHEET_NAME]), v = vals(s), r = hrow(v, ["username", "password", "role"]); if (r < 0) return []; const m = hmap(v, r), out = []; for (let i = r + 1; i < v.length; i++) { const username = txt(v[i][m.username]); if (username) out.push({ username, password: txt(v[i][m.password]), role: txt(v[i][m.role]) || "hoc_sinh", group: num(v[i][m.to]), name: txt(v[i][m.hoten] || v[i][m.name] || v[i][m.hovaten]) }); } return out; }
function login(p) { const u = txt(p.username).toLowerCase(), pw = txt(p.password), a = accounts().find(x => txt(x.username).toLowerCase() === u && txt(x.password) === pw); if (!a) return { ok: false, error: "Tên đăng nhập hoặc mật khẩu không đúng." }; log("login", a.username, "Đăng nhập", { role: a.role }); return { ok: true, user: { uid: "gas-" + studentId(a.username, 0), displayName: a.name || a.username, email: a.username, photoURL: null, provider: "gas", role: a.role, group: a.group || "" } }; }
function snap(s, row, c) { return { plusText: s.getRange(row, c.plusTextCol + 1).getDisplayValue(), plusTotal: s.getRange(row, c.plusTotalCol + 1).getDisplayValue(), minusText: s.getRange(row, c.minusTextCol + 1).getDisplayValue(), minusTotal: s.getRange(row, c.minusTotalCol + 1).getDisplayValue(), total: s.getRange(row, c.totalCol + 1).getDisplayValue(), status: s.getRange(row, c.statusCol + 1).getDisplayValue(), editor: c.editorCol !== undefined ? s.getRange(row, c.editorCol + 1).getDisplayValue() : "" }; }
function addLine(a, b) { a = txt(a); return a ? a + "\n" + b : b; }

function addScoreEvent(p) {
  const w = Number(p.week || DEFAULT_WEEK), s = weekSheet(w);
  if (!s) throw new Error("Không tìm thấy TUẦN " + w);
  const c = scoreCfg(vals(s));
  if (!c) throw new Error("Không tìm thấy bảng chấm");
  const info = findRow(s, c, txt(p.studentId));
  if (!info) throw new Error("Không tìm thấy học sinh");
  const row = info.row, before = snap(s, row, c), points = Number(p.points || 0), title = txt(p.title), actor = txt(p.createdBy || p.actorName || p.username) || "Web", pc = s.getRange(row, c.plusTextCol + 1), pt = s.getRange(row, c.plusTotalCol + 1), mc = s.getRange(row, c.minusTextCol + 1), mt = s.getRange(row, c.minusTotalCol + 1), tc = s.getRange(row, c.totalCol + 1), xc = s.getRange(row, c.statusCol + 1), ec = c.editorCol !== undefined ? s.getRange(row, c.editorCol + 1) : null;
  let plus = num(pt.getDisplayValue()); if (!isFinite(plus)) plus = 0;
  let minus = num(mt.getDisplayValue()); if (!isFinite(minus)) minus = 0;
  if (points >= 0) { pc.setValue(addLine(pc.getDisplayValue(), title)); plus += Math.abs(points); pt.setValue(plus || ""); }
  else { mc.setValue(addLine(mc.getDisplayValue(), title)); minus += Math.abs(points); mt.setValue(minus || ""); }
  const total = BASE_SCORE + plus - minus;
  tc.setValue(total); xc.setValue(status(total)); if (ec) ec.setValue(actor);
  const after = snap(s, row, c), e = { id: id("e"), studentId: txt(p.studentId), week: w, title, points, type: points >= 0 ? "CONG" : "TRU", category: txt(p.category) || cat(title), note: "", createdBy: actor, createdAt: txt(p.createdAt) || iso() };
  history(w, e.studentId, info.name, "addScore", before, after, { username: actor, role: txt(p.role || p.actorRole) }, title, row, info.group, { event: e });
  log("score", actor, "Chấm điểm " + info.name, e);
  return e;
}

function removeLine(text, target) { const t = txt(target); return splitLines(text).filter(line => line !== t).join("\n"); }
function sumCell(text, isPlus) { return splitLines(text).reduce((sum, line) => sum + Math.abs(pointFromLine(line, 0)), 0); }
function deleteScoreEvent(eventId) {
  const m = txt(eventId).match(/^w(\d+)r(\d+)([pm])(\d+)_/);
  if (!m) throw new Error("Không xác định được dòng điểm cần xoá.");
  const week = Number(m[1]), sheetRow = Number(m[2]) + 1, kind = m[3], s = weekSheet(week);
  if (!s) throw new Error("Không tìm thấy TUẦN " + week);
  const c = scoreCfg(vals(s));
  if (!c) throw new Error("Không tìm thấy bảng chấm");
  const studentName = s.getRange(sheetRow, c.nameCol + 1).getDisplayValue(), before = snap(s, sheetRow, c), textCol = kind === "p" ? c.plusTextCol : c.minusTextCol, targetEvent = eventsFromWeeks(students()).find(e => e.id === eventId);
  if (!targetEvent) throw new Error("Không tìm thấy nội dung điểm cần xoá.");
  s.getRange(sheetRow, textCol + 1).setValue(removeLine(s.getRange(sheetRow, textCol + 1).getDisplayValue(), targetEvent.title));
  const plus = sumCell(s.getRange(sheetRow, c.plusTextCol + 1).getDisplayValue(), true), minus = sumCell(s.getRange(sheetRow, c.minusTextCol + 1).getDisplayValue(), false), total = BASE_SCORE + plus - minus;
  s.getRange(sheetRow, c.plusTotalCol + 1).setValue(plus || "");
  s.getRange(sheetRow, c.minusTotalCol + 1).setValue(minus || "");
  s.getRange(sheetRow, c.totalCol + 1).setValue(total);
  s.getRange(sheetRow, c.statusCol + 1).setValue(status(total));
  const after = snap(s, sheetRow, c), student = students().find(x => x.id === targetEvent.studentId || key(x.name) === key(studentName));
  history(week, targetEvent.studentId, studentName, "deleteScore", before, after, { username: "Web", role: "" }, targetEvent.title, sheetRow, student ? student.group : "", { eventId, event: targetEvent });
  log("deleteScore", "Web", "Xoá điểm " + studentName, targetEvent);
  return true;
}

function bulkScore(p) { const ids = Array.isArray(p.studentIds) ? p.studentIds : []; return { count: ids.length, events: ids.map(x => addScoreEvent(Object.assign({}, p, { studentId: x }))) }; }

function historyTotal(snapshot) {
  const total = snapshot && snapshot.total !== undefined ? num(snapshot.total) : NaN;
  return isFinite(total) ? total : "";
}
function actorInfo(actor) {
  if (actor && typeof actor === "object") return { username: txt(actor.username || actor.actorName || actor.actorEmail || actor.email) || "Web", role: txt(actor.role || actor.actorRole) };
  return { username: txt(actor) || "Web", role: "" };
}
function history(w, sid, name, act, b, a, actor, reason, rowIdx, groupNum, payload) {
  const u = actorInfo(actor);
  append(init(HISTORY_SHEET_NAME, HISTORY_HEADERS), HISTORY_HEADERS, {
    id: id("h"),
    timestamp: iso(),
    week: w,
    row_idx: rowIdx || "",
    student_name: name,
    group_num: groupNum || "",
    action: act,
    username: u.username,
    role: u.role,
    before_total: historyTotal(b),
    after_total: historyTotal(a),
    before_json: JSON.stringify(b || {}),
    after_json: JSON.stringify(a || {}),
    restore_from_id: "",
    reason: reason || "",
    payload_json: JSON.stringify(Object.assign({ studentId: sid }, payload || {})),
  });
}
function log(type, actor, detail, payload) { append(init(LOG_SHEET_NAME, LOG_HEADERS), LOG_HEADERS, { id: id("log"), type, actor: actor || "Web", detail: detail || "", payload_json: JSON.stringify(payload || {}), createdAt: iso() }); }

function readRows(name, params) {
  const s = book().getSheetByName(name), v = vals(s);
  if (v.length < 2) return [];
  const h = v[0].map(key), out = [];
  for (let r = 1; r < v.length; r++) {
    const o = {};
    h.forEach((k, i) => o[k] = v[r][i]);
    if (params.studentId && o.studentid !== params.studentId && !String(o.payloadjson || "").includes(params.studentId)) continue;
    if ((params.rowIdx || params.row_idx) && Number(o.rowidx || 0) !== Number(params.rowIdx || params.row_idx || 0)) continue;
    if (params.week && String(o.week || "") !== String(params.week)) continue;
    if (params.studentName && key(o.studentname) !== key(params.studentName)) continue;
    if (params.status && o.status !== params.status) continue;
    if (params.to && o.to !== params.to) continue;
    out.push(o);
  }
  return out.reverse().slice(0, 100);
}

function getStudentChangeHistory(params) {
  const limit = Math.max(1, Math.min(Number(params.limit || 30) || 30, 100));
  const rows = readRows(HISTORY_SHEET_NAME, params).slice(0, limit);
  return { rows, headers: HISTORY_HEADERS };
}

function createRequest(p) { const row = { id: id("req"), week: p.week || DEFAULT_WEEK, requester: txt(p.requester), studentId: txt(p.studentId), studentName: txt(p.studentName), reason: txt(p.reason), status: "pending", resolvedBy: "", resolvedAt: "", createdAt: iso() }; append(init(PERMISSION_SHEET_NAME, REQUEST_HEADERS), REQUEST_HEADERS, row); notify("gvcn", "Yêu cầu quyền sửa", row.requester + " xin sửa " + row.studentName, row); return row; }
function resolveRequest(p) { return { ok: true, id: txt(p.id), status: txt(p.status) || "approved" }; }
function notify(to, title, message, payload) { const row = { id: id("noti"), to: to || "", title: title || "Thông báo", message: message || "", status: "unread", payload_json: JSON.stringify(payload || {}), createdAt: iso() }; append(init(NOTIFICATION_SHEET_NAME, NOTI_HEADERS), NOTI_HEADERS, row); return row; }
function createWeek(week) { const w = Number(week || DEFAULT_WEEK), name = "TUẦN " + w; if (book().getSheetByName(name)) return { created: false, existed: true, week: w, sheetName: name }; const tpl = book().getSheetByName("TUẦN 0") || book().getSheetByName("TUAN 0"); if (!tpl) throw new Error("Không tìm thấy TUẦN 0"); const cp = tpl.copyTo(book()); cp.setName(name); book().setActiveSheet(cp); book().moveActiveSheet(book().getNumSheets()); cp.getRange("B2").setValue("LỚP 11A3- TUẦN " + w); log("createWeek", "Web", "Tạo " + name, { week: w }); return { created: true, week: w, sheetName: name }; }

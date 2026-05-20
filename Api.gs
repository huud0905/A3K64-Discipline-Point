/*
 * A3K64 Discipline Point - Google Apps Script API
 *
 * Deploy as Web App:
 * - Execute as: Me
 * - Who has access: Anyone
 *
 * Recommended: set Script Property SPREADSHEET_ID to your spreadsheet id.
 * If this script is bound to the spreadsheet, it can also use SpreadsheetApp.getActiveSpreadsheet().
 */

const SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '';
const DEFAULT_WEEK = 1;
const ACCOUNTS_SHEET = 'ACCOUNTS';
const TTCN_SHEET = 'TTCN';
const RULES_SHEET = 'VI_PHAM';
const HISTORY_SHEET = '_HISTORY';
const BASE_SCORE = 50;

const HISTORY_HEADERS = ['id', 'week', 'studentId', 'studentName', 'title', 'points', 'type', 'category', 'note', 'createdBy', 'createdAt'];

function doGet(e) {
  return route_(e, 'GET');
}

function doPost(e) {
  return route_(e, 'POST');
}

function route_(e, method) {
  try {
    const params = (e && e.parameter) || {};
    const callback = safeCallback_(params.callback || '');
    let body = {};

    if (method === 'POST' && e && e.postData && e.postData.contents) {
      body = parseJson_(e.postData.contents) || {};
    }

    const action = String(params.action || body.action || '').trim() || 'ping';
    const payload = params.payload ? parseJson_(params.payload) : (body.payload || {});
    const result = handleAction_(action, payload || {}, params);
    return output_(result, callback);
  } catch (err) {
    return output_({ ok: false, error: err && err.message ? err.message : String(err) }, safeCallback_((e && e.parameter && e.parameter.callback) || ''));
  }
}

function handleAction_(action, payload, params) {
  switch (action) {
    case 'ping':
      return { ok: true, message: 'GAS API is running', updatedAt: iso_() };
    case 'login':
      return login_(payload);
    case 'resetPassword':
      return resetPassword_(payload);
    case 'getScoreboard':
      return { ok: true, data: getScoreboardData_(), updatedAt: iso_() };
    case 'getRules':
      return { ok: true, data: { rules: readRules_(), updatedAt: iso_() } };
    case 'addScoreEvent':
      return addScoreEvent_(payload);
    case 'deleteScoreEvent':
      return deleteScoreEvent_(payload);
    case 'createWeek':
      return createWeek_(payload);
    default:
      return { ok: false, error: 'Unknown action: ' + action };
  }
}

function output_(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function safeCallback_(name) {
  name = String(name || '').trim();
  return /^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(name) ? name : '';
}

function parseJson_(text) {
  try { return JSON.parse(String(text || '')); } catch (_) { return null; }
}

function book_() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('Missing SPREADSHEET_ID. Set Script Property SPREADSHEET_ID or bind this script to the spreadsheet.');
  return active;
}

function sheet_(name) {
  return book_().getSheetByName(name);
}

function ensureSheet_(name, headers) {
  const ss = book_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (headers && sh.getLastRow() === 0) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (headers && sh.getLastRow() >= 1) {
    const existing = sh.getRange(1, 1, 1, Math.max(headers.length, sh.getLastColumn())).getValues()[0];
    const empty = existing.every(v => String(v || '').trim() === '');
    if (empty) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sh;
}

function rows_(sh) {
  if (!sh || sh.getLastRow() < 1 || sh.getLastColumn() < 1) return { headers: [], rows: [] };
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(h => String(h || '').trim());
  return { headers, rows: values.slice(1) };
}

function norm_(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function key_(s) {
  return norm_(s).replace(/[^a-z0-9]/g, '');
}

function findHeader_(headers, candidates) {
  const keys = headers.map(key_);
  for (const c of candidates) {
    const ck = key_(c);
    const exact = keys.indexOf(ck);
    if (exact >= 0) return exact;
  }
  for (let i = 0; i < keys.length; i++) {
    for (const c of candidates) if (keys[i].includes(key_(c))) return i;
  }
  return -1;
}

function text_(v) {
  return String(v == null ? '' : v).trim();
}

function number_(v, fallback) {
  const n = Number(String(v == null ? '' : v).replace(/^\+/, '').replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function iso_() {
  return new Date().toISOString();
}

function lastInitial_(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return (parts[parts.length - 1] || name || '?').charAt(0).toUpperCase();
}

function roleText_(role) {
  role = key_(role);
  if (role === 'gvcn') return 'gvcn';
  if (role === 'loptruong') return 'lop_truong';
  if (role === 'bithu') return 'bi_thu';
  if (role === 'totruong') return 'to_truong';
  if (role === 'hocsinh') return 'hoc_sinh';
  return role || 'hoc_sinh';
}

function groupNumber_(v) {
  const n = Number(String(v == null ? '' : v).replace(/[^0-9]/g, ''));
  return [1, 2, 3, 4].indexOf(n) >= 0 ? n : '';
}

function weekNo_(sheetName) {
  const m = String(sheetName || '').match(/TU[ẦA]N\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

function weekSheet_(week) {
  const ss = book_();
  const target = Number(week || DEFAULT_WEEK);
  return ss.getSheets().find(sh => weekNo_(sh.getName()) === target) || ss.getSheetByName('TUẦN ' + target) || ss.getSheetByName('TUAN ' + target);
}

function weekSheets_() {
  return book_().getSheets().filter(sh => weekNo_(sh.getName()) !== null);
}

function getScoreboardData_() {
  const weeks = weekSheets_().map(sh => weekNo_(sh.getName())).filter(n => n !== null).sort((a, b) => a - b);
  const currentWeek = weeks.length ? weeks[weeks.length - 1] : DEFAULT_WEEK;
  const students = readStudents_(currentWeek);
  const historyEvents = readHistoryEvents_();
  const baselineEvents = makeBaselineEvents_(students, historyEvents, weeks.length ? weeks : [currentWeek]);
  const rules = readRules_();
  return { students, events: baselineEvents.concat(historyEvents), weeks: weeks.length ? weeks : [currentWeek], quickScoreReasons: rules, updatedAt: iso_() };
}

function readStudents_(week) {
  const sh = weekSheet_(week) || weekSheets_()[0];
  if (!sh) return [];
  const data = rows_(sh);
  const headers = data.headers;
  const nameCol = findHeader_(headers, ['HỌC SINH', 'Họ và tên', 'Họ tên', 'hoten', 'name']);
  const groupCol = findHeader_(headers, ['TỔ', 'to', 'group']);
  const roleCol = findHeader_(headers, ['CHỨC VỤ', 'chucvu', 'role']);
  if (nameCol < 0) return [];

  const students = [];
  data.rows.forEach((row, idx) => {
    const name = text_(row[nameCol]);
    if (!name || key_(name) === 'hocsinh') return;
    const group = groupNumber_(groupCol >= 0 ? row[groupCol] : '') || inferGroupFromRow_(row) || 1;
    students.push({
      id: studentId_(name, group, idx),
      name,
      group,
      role: roleCol >= 0 ? text_(row[roleCol]) || undefined : undefined,
      avatarInitial: lastInitial_(name),
    });
  });
  return students;
}

function inferGroupFromRow_(row) {
  for (const cell of row) {
    const g = groupNumber_(cell);
    if (g) return g;
  }
  return 1;
}

function studentId_(name, group, idx) {
  return 's' + String(group || 1) + '_' + norm_(name).replace(/[^a-z0-9]/g, '') || ('s' + idx);
}

function readSheetTotals_(week) {
  const sh = weekSheet_(week);
  if (!sh) return new Map();
  const data = rows_(sh);
  const headers = data.headers;
  const nameCol = findHeader_(headers, ['HỌC SINH', 'Họ và tên', 'Họ tên', 'hoten', 'name']);
  const groupCol = findHeader_(headers, ['TỔ', 'to', 'group']);
  const totalCol = findHeader_(headers, ['TỔNG', 'Tổng điểm', 'tongdiem', 'Điểm', 'score']);
  if (nameCol < 0 || totalCol < 0) return new Map();
  const totals = new Map();
  data.rows.forEach((row, idx) => {
    const name = text_(row[nameCol]);
    if (!name) return;
    const group = groupNumber_(groupCol >= 0 ? row[groupCol] : '') || inferGroupFromRow_(row) || 1;
    const id = studentId_(name, group, idx);
    const total = number_(row[totalCol], NaN);
    if (Number.isFinite(total)) totals.set(id, total);
  });
  return totals;
}

function makeBaselineEvents_(students, historyEvents, weeks) {
  const result = [];
  weeks.forEach(week => {
    const totals = readSheetTotals_(week);
    students.forEach(st => {
      const visibleSum = historyEvents
        .filter(ev => ev.studentId === st.id && Number(ev.week) === Number(week))
        .reduce((sum, ev) => sum + Number(ev.points || 0), 0);
      const sheetTotal = totals.has(st.id) ? totals.get(st.id) : BASE_SCORE;
      const baseline = Number(sheetTotal) - visibleSum;
      result.push({
        id: 'base_' + week + '_' + st.id,
        studentId: st.id,
        week: Number(week),
        title: 'Điểm nền',
        points: baseline,
        type: baseline >= 0 ? 'CONG' : 'TRU',
        category: 'HOC_TAP',
        note: '__SHEET_TOTAL__',
        createdBy: 'Google Sheets',
        createdAt: iso_(),
      });
    });
  });
  return result;
}

function readHistoryEvents_() {
  const sh = ensureSheet_(HISTORY_SHEET, HISTORY_HEADERS);
  const data = rows_(sh);
  const h = data.headers;
  const idx = name => findHeader_(h, [name]);
  const idCol = idx('id');
  const weekCol = idx('week');
  const studentIdCol = idx('studentId');
  const studentNameCol = idx('studentName');
  const titleCol = idx('title');
  const pointsCol = idx('points');
  const typeCol = idx('type');
  const categoryCol = idx('category');
  const noteCol = idx('note');
  const createdByCol = idx('createdBy');
  const createdAtCol = idx('createdAt');

  return data.rows.map((row, i) => {
    const points = number_(row[pointsCol], 0);
    return {
      id: text_(row[idCol]) || ('h_' + (i + 2)),
      studentId: text_(row[studentIdCol]),
      week: number_(row[weekCol], DEFAULT_WEEK),
      title: text_(row[titleCol]),
      points,
      type: text_(row[typeCol]) || (points >= 0 ? 'CONG' : 'TRU'),
      category: text_(row[categoryCol]) || 'HOC_TAP',
      note: text_(row[noteCol]) || undefined,
      createdBy: text_(row[createdByCol]) || 'Google Sheets',
      createdAt: toIso_(row[createdAtCol]) || iso_(),
      studentName: text_(row[studentNameCol]),
    };
  }).filter(ev => ev.studentId && ev.title);
}

function toIso_(value) {
  if (value instanceof Date) return value.toISOString();
  const t = text_(value);
  if (!t) return '';
  const d = new Date(t);
  return isNaN(d.getTime()) ? t : d.toISOString();
}

function appendHistory_(event) {
  const sh = ensureSheet_(HISTORY_SHEET, HISTORY_HEADERS);
  sh.appendRow([
    event.id,
    event.week,
    event.studentId,
    event.studentName || '',
    event.title,
    event.points,
    event.type,
    event.category,
    event.note || '',
    event.createdBy || 'Google Sheets',
    event.createdAt || iso_(),
  ]);
}

function addScoreEvent_(payload) {
  const event = Object.assign({}, payload || {});
  if (!event.studentId) throw new Error('Thiếu studentId.');
  if (!event.title) throw new Error('Thiếu nội dung điểm.');
  const points = number_(event.points, 0);
  const students = readStudents_(event.week || DEFAULT_WEEK);
  const student = students.find(st => st.id === event.studentId);
  const saved = {
    id: text_(event.id) || ('ev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
    studentId: text_(event.studentId),
    studentName: student ? student.name : text_(event.studentName),
    week: number_(event.week, DEFAULT_WEEK),
    title: text_(event.title),
    points,
    type: text_(event.type) || (points >= 0 ? 'CONG' : 'TRU'),
    category: text_(event.category) || 'HOC_TAP',
    note: text_(event.note),
    createdBy: text_(event.createdBy) || 'Google Sheets',
    createdAt: text_(event.createdAt) || iso_(),
  };
  appendHistory_(saved);
  return { ok: true, data: { event: saved, scoreboard: getScoreboardData_() } };
}

function deleteScoreEvent_(payload) {
  const id = text_(payload && payload.id);
  if (!id) throw new Error('Thiếu id.');
  const sh = ensureSheet_(HISTORY_SHEET, HISTORY_HEADERS);
  const values = sh.getDataRange().getValues();
  const idCol = findHeader_(values[0], ['id']);
  for (let r = values.length - 1; r >= 1; r--) {
    if (text_(values[r][idCol]) === id) sh.deleteRow(r + 1);
  }
  return { ok: true, data: { deleted: id, scoreboard: getScoreboardData_() } };
}

function readRules_() {
  const sh = sheet_(RULES_SHEET);
  if (!sh) return [];
  const data = rows_(sh);
  const h = data.headers;
  const nameCol = findHeader_(h, ['Tên', 'Nội dung', 'Lỗi', 'title', 'ten']);
  const pointsCol = findHeader_(h, ['Điểm', 'points', 'diem']);
  const typeCol = findHeader_(h, ['Loại', 'Tính', 'type', 'tinh']);
  const categoryCol = findHeader_(h, ['Phân loại', 'Nhóm', 'category', 'phanloai']);
  if (nameCol < 0 || pointsCol < 0) return [];
  return data.rows.map(row => {
    const title = text_(row[nameCol]);
    const rawPoints = number_(row[pointsCol], NaN);
    if (!title || !Number.isFinite(rawPoints)) return null;
    const type = text_(typeCol >= 0 ? row[typeCol] : '') || (rawPoints >= 0 ? 'CONG' : 'TRU');
    const points = key_(type) === 'tru' ? -Math.abs(rawPoints) : Math.abs(rawPoints);
    return {
      title,
      points,
      type: points >= 0 ? 'CONG' : 'TRU',
      category: normalizeCategory_(categoryCol >= 0 ? row[categoryCol] : ''),
    };
  }).filter(Boolean);
}

function normalizeCategory_(v) {
  const k = key_(v);
  if (k.includes('nenep') || k.includes('nep')) return 'NE_NEP';
  if (k.includes('phong')) return 'PHONG_TRAO';
  return 'HOC_TAP';
}

function login_(payload) {
  const username = text_(payload.username).toLowerCase();
  const password = text_(payload.password);
  if (!username || !password) return { ok: false, error: 'Thiếu tài khoản hoặc mật khẩu.' };

  const sh = sheet_(ACCOUNTS_SHEET);
  if (!sh) return { ok: false, error: 'Không tìm thấy sheet ACCOUNTS.' };
  const data = rows_(sh);
  const h = data.headers;
  const userCol = findHeader_(h, ['username', 'email', 'gmail']);
  const passCol = findHeader_(h, ['password', 'matkhau', 'mật khẩu']);
  const roleCol = findHeader_(h, ['role']);
  const groupCol = findHeader_(h, ['to', 'tổ', 'group']);
  const nameCol = findHeader_(h, ['hoten', 'họ tên', 'họ và tên', 'name']);
  if (userCol < 0 || passCol < 0) return { ok: false, error: 'Sheet ACCOUNTS thiếu cột username/password.' };

  for (const row of data.rows) {
    const u = text_(row[userCol]).toLowerCase();
    const p = text_(row[passCol]);
    if (u === username && p === password) {
      const hoten = nameCol >= 0 ? text_(row[nameCol]) : username;
      const role = roleText_(roleCol >= 0 ? row[roleCol] : 'hoc_sinh');
      const group = groupNumber_(groupCol >= 0 ? row[groupCol] : '');
      return {
        ok: true,
        data: {
          ok: true,
          user: {
            uid: 'gas-' + username,
            displayName: hoten || username,
            hoten: hoten || username,
            email: username,
            provider: 'gas',
            role,
            group,
            to: group,
          },
        },
      };
    }
  }
  return { ok: true, data: { ok: false, error: 'Tên đăng nhập hoặc mật khẩu không đúng.' } };
}

function resetPassword_(payload) {
  const fullName = text_(payload.fullName);
  const phone = digits_(payload.phone);
  const newEmail = text_(payload.newEmail).toLowerCase();
  const newPassword = text_(payload.newPassword);
  if (!fullName || !phone || !newEmail || !newPassword) return { ok: false, error: 'Thiếu thông tin khôi phục.' };

  const ttcn = sheet_(TTCN_SHEET);
  const accounts = sheet_(ACCOUNTS_SHEET);
  if (!ttcn) return { ok: false, error: 'Không tìm thấy sheet TTCN.' };
  if (!accounts) return { ok: false, error: 'Không tìm thấy sheet ACCOUNTS.' };

  const tt = rows_(ttcn);
  const nameCol = findHeader_(tt.headers, ['Họ và tên học sinh', 'Họ và tên', 'hoten', 'name']);
  const phoneCols = [findHeader_(tt.headers, ['SDT Cá nhân']), findHeader_(tt.headers, ['SDT Bố']), findHeader_(tt.headers, ['SDT Mẹ'])].filter(i => i >= 0);
  if (nameCol < 0 || !phoneCols.length) return { ok: false, error: 'Sheet TTCN thiếu cột họ tên hoặc số điện thoại.' };

  const matched = tt.rows.find(row => norm_(row[nameCol]) === norm_(fullName) && phoneCols.some(c => digits_(row[c]) === phone));
  if (!matched) return { ok: true, data: { ok: false, error: 'Không tìm thấy học sinh khớp họ tên và số điện thoại trong TTCN.' } };

  const acc = rows_(accounts);
  const userCol = findHeader_(acc.headers, ['username', 'email', 'gmail']);
  const passCol = findHeader_(acc.headers, ['password', 'matkhau', 'mật khẩu']);
  const roleCol = findHeader_(acc.headers, ['role']);
  const groupCol = findHeader_(acc.headers, ['to', 'tổ', 'group']);
  const accNameCol = findHeader_(acc.headers, ['hoten', 'họ tên', 'họ và tên', 'name']);
  if (userCol < 0 || passCol < 0 || accNameCol < 0) return { ok: false, error: 'Sheet ACCOUNTS thiếu cột username/password/hoten.' };

  for (let i = 0; i < acc.rows.length; i++) {
    const row = acc.rows[i];
    if (norm_(row[accNameCol]) === norm_(fullName)) {
      accounts.getRange(i + 2, userCol + 1).setValue(newEmail);
      accounts.getRange(i + 2, passCol + 1).setValue(newPassword);
      const role = roleText_(roleCol >= 0 ? row[roleCol] : 'hoc_sinh');
      const group = groupNumber_(groupCol >= 0 ? row[groupCol] : '');
      return {
        ok: true,
        data: {
          ok: true,
          message: 'Đã cập nhật Gmail và mật khẩu.',
          user: {
            uid: 'gas-' + newEmail,
            displayName: fullName,
            hoten: fullName,
            email: newEmail,
            provider: 'gas',
            role,
            group,
            to: group,
          },
        },
      };
    }
  }
  return { ok: true, data: { ok: false, error: 'TTCN đúng nhưng không tìm thấy học sinh trong ACCOUNTS.' } };
}

function digits_(v) {
  return String(v == null ? '' : v).replace(/\D/g, '');
}

function createWeek_(payload) {
  const week = Number(payload.week || 0);
  if (!week) throw new Error('Thiếu số tuần.');
  const ss = book_();
  const newName = 'TUẦN ' + week;
  if (ss.getSheetByName(newName)) return { ok: true, data: { week, message: 'Tuần đã tồn tại.' } };
  const template = ss.getSheetByName('TUẦN 0') || ss.getSheetByName('TUAN 0') || weekSheets_()[0];
  if (!template) throw new Error('Không tìm thấy sheet TUẦN 0 để nhân bản.');
  const copy = template.copyTo(ss).setName(newName);
  ss.setActiveSheet(copy);
  ss.moveActiveSheet(ss.getNumSheets());
  return { ok: true, data: { week, message: 'Đã tạo ' + newName } };
}

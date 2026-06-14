// HOTFIX 2026-06-14 - SEATING PREVIEW PERMISSIONS BACKEND V2
// Dán toàn bộ block này xuống CUỐI Api.gs rồi Deploy lại Apps Script.
// Thêm 2 chế độ xem trước: chỉ xem / sửa theo checkbox.
// Cột mới tự thêm trong sheet SEATING CHART: preview_mode, preview_permissions.

var A3_SEAT_PERM_SHEET = 'SEATING CHART';

function A3SeatPerm_ss_() {
  if (typeof SPREADSHEET_ID !== 'undefined' && SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  return SpreadsheetApp.getActiveSpreadsheet();
}
function A3SeatPerm_sheet_() {
  var sh = A3SeatPerm_ss_().getSheetByName(A3_SEAT_PERM_SHEET);
  if (!sh) throw new Error('Không tìm thấy sheet ' + A3_SEAT_PERM_SHEET);
  return sh;
}
function A3SeatPerm_norm_(v) {
  return String(v || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[\s_-]+/g, '');
}
function A3SeatPerm_status_(v) {
  var raw = A3SeatPerm_norm_(v);
  if (raw === 'preview' || raw === 'xemtruoc') return 'preview';
  if (raw === 'published' || raw === 'publish' || raw === 'public' || raw === 'congbo' || raw === 'congkhai' || raw === 'scheduled' || raw === 'hengio' || raw === 'dahengio') return 'published';
  return 'private';
}
function A3SeatPerm_mode_(v) {
  var raw = A3SeatPerm_norm_(v);
  return raw === 'edit' || raw === 'sua' || raw === 'allowedit' ? 'edit' : 'view';
}
function A3SeatPerm_headers_() {
  return ['chart_id','chart_title','is_active','created_at','updated_at','access_status','preview_students','publish_at','preview_mode','preview_permissions','access_revision','access_updated_at','access_updated_by'];
}
function A3SeatPerm_map_(sh) {
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (x) { return String(x || '').trim(); });
  var map = {};
  for (var i = 0; i < header.length; i++) if (header[i]) map[A3SeatPerm_norm_(header[i])] = i + 1;
  A3SeatPerm_headers_().forEach(function (h) { var key = A3SeatPerm_norm_(h); if (!map[key]) { lastCol++; sh.getRange(1, lastCol).setValue(h); map[key] = lastCol; } });
  return map;
}
function A3SeatPerm_col_(map, names) { for (var i = 0; i < names.length; i++) { var c = map[A3SeatPerm_norm_(names[i])]; if (c) return c; } return 0; }
function A3SeatPerm_get_(sh, row, map, names) { var c = A3SeatPerm_col_(map, names); return c ? sh.getRange(row, c).getValue() : ''; }
function A3SeatPerm_set_(sh, row, map, names, value) { var c = A3SeatPerm_col_(map, names); if (c) sh.getRange(row, c).setValue(value); }
function A3SeatPerm_payload_(p) {
  if (!p) return {};
  if (typeof p === 'string') { try { return JSON.parse(p); } catch (e) { return {}; } }
  if (p.payload) {
    if (typeof p.payload === 'string') { try { return JSON.parse(p.payload); } catch (e2) {} }
    if (typeof p.payload === 'object') return p.payload;
  }
  return p;
}
function A3SeatPerm_isRealRow_(sh, row, map) {
  var idCol = A3SeatPerm_col_(map, ['chart_id','chartId','id']);
  var titleCol = A3SeatPerm_col_(map, ['chart_title','chartTitle','title','name']);
  var id = idCol ? String(sh.getRange(row, idCol).getValue() || '').trim() : '';
  var title = titleCol ? String(sh.getRange(row, titleCol).getValue() || '').trim() : '';
  if (id && id !== 'default') return true;
  if (title && A3SeatPerm_norm_(title) !== A3SeatPerm_norm_('Sơ đồ hiện tại')) return true;
  return false;
}
function A3SeatPerm_findActiveRow_(sh, map) {
  var last = sh.getLastRow();
  var activeCol = A3SeatPerm_col_(map, ['is_active','isActive','active']);
  var firstReal = 0;
  for (var r = 2; r <= last; r++) {
    if (!A3SeatPerm_isRealRow_(sh, r, map)) continue;
    if (!firstReal) firstReal = r;
    var active = activeCol ? sh.getRange(r, activeCol).getValue() : '';
    if (active === true || String(active).toLowerCase() === 'true') return r;
  }
  return firstReal;
}
function A3SeatPerm_sameTitle_(a, b) {
  var x = A3SeatPerm_norm_(a);
  var y = A3SeatPerm_norm_(b);
  if (!x || !y) return false;
  if (x === y) return true;
  var nx = String(a || '').match(/\d+/);
  var ny = String(b || '').match(/\d+/);
  return !!(nx && ny && nx[0] === ny[0] && x.indexOf('sodo') >= 0 && y.indexOf('sodo') >= 0);
}
function A3SeatPerm_findRow_(sh, map, payload) {
  payload = payload || {};
  var wantedId = String(payload.chartId || payload.chart_id || payload.id || '').trim();
  var wantedTitle = String(payload.chartTitle || payload.chart_title || payload.title || '').trim();
  var last = sh.getLastRow();
  var idCol = A3SeatPerm_col_(map, ['chart_id','chartId','id']);
  var titleCol = A3SeatPerm_col_(map, ['chart_title','chartTitle','title','name']);
  if (wantedId && wantedId !== 'default' && idCol) { for (var r = 2; r <= last; r++) { if (String(sh.getRange(r, idCol).getValue() || '').trim() === wantedId) return r; } }
  if (wantedTitle && titleCol) { for (var r2 = 2; r2 <= last; r2++) { var title = String(sh.getRange(r2, titleCol).getValue() || '').trim(); if (title && A3SeatPerm_sameTitle_(title, wantedTitle)) return r2; } }
  return A3SeatPerm_findActiveRow_(sh, map);
}
function A3SeatPerm_read_(sh, row, map) {
  if (!row) return { chartId:'', chart_id:'', chartTitle:'', chart_title:'', status:'private', previewStudents:'', preview_students:'', publishAt:'', publish_at:'', previewMode:'view', preview_mode:'view', previewPermissions:'{}', preview_permissions:'{}', noChart:true, virtual:true };
  var chartId = String(A3SeatPerm_get_(sh, row, map, ['chart_id','chartId','id']) || '').trim();
  var chartTitle = String(A3SeatPerm_get_(sh, row, map, ['chart_title','chartTitle','title','name']) || '').trim();
  var status = A3SeatPerm_status_(A3SeatPerm_get_(sh, row, map, ['access_status','status','publish_status']));
  var previewStudents = String(A3SeatPerm_get_(sh, row, map, ['preview_students','previewStudents']) || '');
  var publishAt = String(A3SeatPerm_get_(sh, row, map, ['publish_at','publishAt']) || '');
  var previewMode = A3SeatPerm_mode_(A3SeatPerm_get_(sh, row, map, ['preview_mode','previewMode']));
  var previewPermissions = String(A3SeatPerm_get_(sh, row, map, ['preview_permissions','previewPermissions']) || '{}');
  var revision = Number(A3SeatPerm_get_(sh, row, map, ['access_revision','revision']) || 0) || 0;
  var updatedAt = String(A3SeatPerm_get_(sh, row, map, ['access_updated_at','updated_at','updatedAt']) || '');
  var updatedBy = String(A3SeatPerm_get_(sh, row, map, ['access_updated_by','updated_by','updatedBy']) || '');
  return { chartId:chartId, chart_id:chartId, chartTitle:chartTitle, chart_title:chartTitle, status:status, previewStudents:previewStudents, preview_students:previewStudents, publishAt:publishAt, publish_at:publishAt, previewMode:previewMode, preview_mode:previewMode, previewPermissions:previewPermissions, preview_permissions:previewPermissions, revision:revision, access_revision:revision, updatedAt:updatedAt, updated_at:updatedAt, updatedBy:updatedBy, updated_by:updatedBy, noChart:false, virtual:false };
}
function getSeatingAccess(params) {
  var payload = A3SeatPerm_payload_(params), sh = A3SeatPerm_sheet_(), map = A3SeatPerm_map_(sh);
  var access = A3SeatPerm_read_(sh, A3SeatPerm_findRow_(sh, map, payload), map);
  return { ok:true, success:true, access:access, data:{ ok:true, access:access } };
}
function saveSeatingAccess(params) {
  var payload = A3SeatPerm_payload_(params), sh = A3SeatPerm_sheet_(), map = A3SeatPerm_map_(sh);
  var row = A3SeatPerm_findRow_(sh, map, payload);
  if (!row) throw new Error('Chưa tìm thấy sơ đồ thật trong SEATING CHART. Hãy bấm Lưu sơ đồ trước, rồi mở lại Công bố.');
  var status = A3SeatPerm_status_(payload.status);
  var previewStudents = status === 'private' ? '' : String(payload.previewStudents || payload.preview_students || '');
  var publishAt = status === 'published' ? String(payload.publishAt || payload.publish_at || '') : '';
  var previewMode = status === 'private' ? 'view' : A3SeatPerm_mode_(payload.previewMode || payload.preview_mode || 'view');
  var previewPermissions = previewMode === 'edit' ? String(payload.previewPermissions || payload.preview_permissions || '{}') : '{}';
  var actor = payload.actor || {}, updatedBy = String(actor.name || actor.email || payload.updatedBy || payload.updated_by || '');
  var now = new Date().toISOString(), currentRevision = Number(A3SeatPerm_get_(sh, row, map, ['access_revision','revision']) || 0) || 0;
  A3SeatPerm_set_(sh, row, map, ['access_status','status','publish_status'], status);
  A3SeatPerm_set_(sh, row, map, ['preview_students','previewStudents'], previewStudents);
  A3SeatPerm_set_(sh, row, map, ['publish_at','publishAt'], publishAt);
  A3SeatPerm_set_(sh, row, map, ['preview_mode','previewMode'], previewMode);
  A3SeatPerm_set_(sh, row, map, ['preview_permissions','previewPermissions'], previewPermissions);
  A3SeatPerm_set_(sh, row, map, ['access_revision','revision'], currentRevision + 1);
  A3SeatPerm_set_(sh, row, map, ['access_updated_at','updated_at','updatedAt'], now);
  A3SeatPerm_set_(sh, row, map, ['access_updated_by','updated_by','updatedBy'], updatedBy);
  A3SeatPerm_set_(sh, row, map, ['updated_at','updatedAt'], now);
  SpreadsheetApp.flush();
  var access = A3SeatPerm_read_(sh, row, map);
  return { ok:true, success:true, saved:true, access:access, data:{ ok:true, saved:true, access:access } };
}
if (typeof globalThis !== 'undefined') {
  var A3SeatPerm_oldRouteAction_ = typeof globalThis.routeAction === 'function' ? globalThis.routeAction : null;
  globalThis.routeAction = function (action, payload, ctx) {
    if (action === 'getSeatingAccess') return getSeatingAccess(payload);
    if (action === 'saveSeatingAccess') return saveSeatingAccess(payload);
    if (A3SeatPerm_oldRouteAction_) return A3SeatPerm_oldRouteAction_(action, payload, ctx);
    throw new Error('Unknown action: ' + action);
  };
}

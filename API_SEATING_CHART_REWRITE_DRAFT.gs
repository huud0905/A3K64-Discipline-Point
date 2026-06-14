/*
 * A3K64 Seating Chart backend rewrite draft
 * Dán block này xuống CUỐI Api.gs rồi Deploy Apps Script.
 * Block này ghi đè phần backend sơ đồ chỗ ngồi cũ nhưng không động vào các API điểm thi đua khác.
 */

var A3_SEATING_SHEET_FINAL = 'SEATING CHART';
var A3_SEATING_HISTORY_FINAL = 'SEATING HISTORY';

function A3SeatFinal_ss_() {
  if (typeof SPREADSHEET_ID !== 'undefined' && SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  return SpreadsheetApp.getActiveSpreadsheet();
}
function A3SeatFinal_txt_(v) { return String(v == null ? '' : v).trim(); }
function A3SeatFinal_norm_(v) {
  return A3SeatFinal_txt_(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '');
}
function A3SeatFinal_uuid_() { try { return Utilities.getUuid(); } catch (e) { return 'seat_' + Date.now() + '_' + Math.floor(Math.random() * 1000000); } }
function A3SeatFinal_now_() { return new Date().toISOString(); }
function A3SeatFinal_json_(v, fallback) { if (v == null || v === '') return fallback; if (typeof v === 'object') return v; try { return JSON.parse(String(v)); } catch (e) { return fallback; } }
function A3SeatFinal_stringify_(v) { try { return JSON.stringify(v || {}); } catch (e) { return '{}'; } }
function A3SeatFinal_iso_(v) { try { if (Object.prototype.toString.call(v) === '[object Date]') return v.toISOString(); var d = new Date(v); return isNaN(d.getTime()) ? '' : d.toISOString(); } catch (e) { return ''; } }
function A3SeatFinal_payload_(p) {
  var x = p || {};
  if (x.parameter) x = x.parameter;
  if (typeof x === 'string') return A3SeatFinal_json_(x, {});
  if (x.payload) return A3SeatFinal_json_(x.payload, {});
  if (x.data && typeof x.data !== 'function') return A3SeatFinal_json_(x.data, x.data || {});
  if (x.body) return A3SeatFinal_json_(x.body, {});
  return x || {};
}
function A3SeatFinal_status_(v) {
  var s = A3SeatFinal_norm_(v);
  if (s === 'preview' || s === 'xemtruoc') return 'preview';
  if (s === 'published' || s === 'publish' || s === 'public' || s === 'congbo' || s === 'congkhai' || s === 'scheduled' || s === 'hengio' || s === 'dahengio') return 'published';
  return 'private';
}
function A3SeatFinal_previewMode_(v) {
  var s = A3SeatFinal_norm_(v);
  return s === 'edit' || s === 'sua' || s === 'allowedit' ? 'edit' : 'view';
}
function A3SeatFinal_headers_() {
  return ['id','title','is_active','created_at','updated_at','created_by','version','seats_json','room_json','layout_json','status','preview_students','publish_at','preview_mode','preview_permissions','access_revision','access_updated_by','access_updated_at'];
}
function A3SeatFinal_historyHeaders_() { return ['id','timestamp','chart_id','chart_title','action','actor','role','before_json','after_json']; }
function A3SeatFinal_ensureSheet_(name, headers) {
  var ss = A3SeatFinal_ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    return sh;
  }
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var current = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(A3SeatFinal_txt_);
  var map = {};
  current.forEach(function(h, i) { if (h) map[A3SeatFinal_norm_(h)] = i + 1; });
  headers.forEach(function(h) {
    var key = A3SeatFinal_norm_(h);
    if (!map[key]) { lastCol++; sh.getRange(1, lastCol).setValue(h); map[key] = lastCol; }
  });
  return sh;
}
function A3SeatFinal_sheet_() { return A3SeatFinal_ensureSheet_(A3_SEATING_SHEET_FINAL, A3SeatFinal_headers_()); }
function A3SeatFinal_map_(sh) {
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var row = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var map = {};
  row.forEach(function(h, i) { h = A3SeatFinal_txt_(h); if (h) map[A3SeatFinal_norm_(h)] = i + 1; });
  A3SeatFinal_headers_().forEach(function(h) { var k = A3SeatFinal_norm_(h); if (!map[k]) { lastCol++; sh.getRange(1, lastCol).setValue(h); map[k] = lastCol; } });
  return map;
}
function A3SeatFinal_col_(map, names) { for (var i = 0; i < names.length; i++) { var c = map[A3SeatFinal_norm_(names[i])]; if (c) return c; } return 0; }
function A3SeatFinal_get_(sh, row, map, names) { var c = A3SeatFinal_col_(map, names); return c ? sh.getRange(row, c).getValue() : ''; }
function A3SeatFinal_set_(sh, row, map, names, value) { var c = A3SeatFinal_col_(map, names); if (c) sh.getRange(row, c).setValue(value); }
function A3SeatFinal_isReal_(item) {
  var id = A3SeatFinal_txt_(item && item.id);
  var title = A3SeatFinal_txt_(item && item.title);
  if (!id && !title) return false;
  if (id === 'default' && A3SeatFinal_norm_(title) === A3SeatFinal_norm_('Sơ đồ hiện tại')) return false;
  return true;
}
function A3SeatFinal_rowToObj_(sh, row, map) {
  return {
    rowNumber: row,
    id: A3SeatFinal_txt_(A3SeatFinal_get_(sh, row, map, ['id','chart_id','chartId'])),
    title: A3SeatFinal_txt_(A3SeatFinal_get_(sh, row, map, ['title','chart_title','chartTitle','name'])) || 'Sơ đồ chỗ ngồi',
    active: A3SeatFinal_get_(sh, row, map, ['is_active','active']) === true || String(A3SeatFinal_get_(sh, row, map, ['is_active','active'])).toLowerCase() === 'true',
    createdAt: A3SeatFinal_iso_(A3SeatFinal_get_(sh, row, map, ['created_at','createdAt'])),
    updatedAt: A3SeatFinal_iso_(A3SeatFinal_get_(sh, row, map, ['updated_at','updatedAt'])),
    createdBy: A3SeatFinal_txt_(A3SeatFinal_get_(sh, row, map, ['created_by','createdBy'])),
    version: Number(A3SeatFinal_get_(sh, row, map, ['version']) || 1) || 1,
    seatsJson: A3SeatFinal_txt_(A3SeatFinal_get_(sh, row, map, ['seats_json','seatsJson'])) || '{}',
    roomJson: A3SeatFinal_txt_(A3SeatFinal_get_(sh, row, map, ['room_json','roomJson'])) || '{}',
    layoutJson: A3SeatFinal_txt_(A3SeatFinal_get_(sh, row, map, ['layout_json','layoutJson'])) || '{}',
    status: A3SeatFinal_status_(A3SeatFinal_get_(sh, row, map, ['status','access_status','publish_status'])),
    previewStudents: A3SeatFinal_txt_(A3SeatFinal_get_(sh, row, map, ['preview_students','previewStudents'])),
    publishAt: A3SeatFinal_txt_(A3SeatFinal_get_(sh, row, map, ['publish_at','publishAt'])),
    previewMode: A3SeatFinal_previewMode_(A3SeatFinal_get_(sh, row, map, ['preview_mode','previewMode'])),
    previewPermissions: A3SeatFinal_txt_(A3SeatFinal_get_(sh, row, map, ['preview_permissions','previewPermissions'])) || '{}',
    revision: Number(A3SeatFinal_get_(sh, row, map, ['access_revision','revision']) || 0) || 0,
    accessUpdatedBy: A3SeatFinal_txt_(A3SeatFinal_get_(sh, row, map, ['access_updated_by','updated_by','updatedBy'])),
    accessUpdatedAt: A3SeatFinal_txt_(A3SeatFinal_get_(sh, row, map, ['access_updated_at','updated_at','updatedAt']))
  };
}
function A3SeatFinal_readRows_() {
  var sh = A3SeatFinal_sheet_();
  var map = A3SeatFinal_map_(sh);
  var out = [];
  for (var r = 2; r <= sh.getLastRow(); r++) {
    var item = A3SeatFinal_rowToObj_(sh, r, map);
    if (A3SeatFinal_isReal_(item)) out.push(item);
  }
  return out;
}
function A3SeatFinal_sameTitle_(a, b) {
  var x = A3SeatFinal_norm_(a), y = A3SeatFinal_norm_(b);
  if (!x || !y) return false;
  if (x === y) return true;
  var nx = String(a || '').match(/\d+/), ny = String(b || '').match(/\d+/);
  return !!(nx && ny && nx[0] === ny[0] && x.indexOf('sodo') >= 0 && y.indexOf('sodo') >= 0);
}
function A3SeatFinal_findRow_(sh, map, payload, allowFallback) {
  payload = payload || {};
  var id = A3SeatFinal_txt_(payload.id || payload.chartId || payload.chart_id);
  var title = A3SeatFinal_txt_(payload.title || payload.chartTitle || payload.chart_title);
  var first = 0, active = 0;
  for (var r = 2; r <= sh.getLastRow(); r++) {
    var item = A3SeatFinal_rowToObj_(sh, r, map);
    if (!A3SeatFinal_isReal_(item)) continue;
    if (!first) first = r;
    if (item.active) active = r;
    if (id && id !== 'default' && item.id === id) return r;
  }
  if (title) {
    for (var r2 = 2; r2 <= sh.getLastRow(); r2++) {
      var item2 = A3SeatFinal_rowToObj_(sh, r2, map);
      if (A3SeatFinal_isReal_(item2) && A3SeatFinal_sameTitle_(item2.title, title)) return r2;
    }
  }
  return allowFallback ? (active || first || 0) : 0;
}
function A3SeatFinal_chartFromRow_(item) {
  var layout = A3SeatFinal_json_(item.layoutJson, null);
  if (!layout || typeof layout !== 'object') layout = { version: item.version || 1, seats: A3SeatFinal_json_(item.seatsJson, {}), room: A3SeatFinal_json_(item.roomJson, {}), meta: {} };
  if (!layout.seats) layout.seats = A3SeatFinal_json_(item.seatsJson, {});
  if (!layout.room) layout.room = A3SeatFinal_json_(item.roomJson, {});
  if (!layout.version) layout.version = item.version || 1;
  return { id: item.id, title: item.title, active: !!item.active, createdAt: item.createdAt, updatedAt: item.updatedAt, createdBy: item.createdBy, version: item.version, layout: layout };
}
function A3SeatFinal_accessFromRow_(item) {
  var publishMs = item.publishAt ? new Date(item.publishAt).getTime() : 0;
  var effective = item.status === 'published' && publishMs && publishMs > Date.now() ? 'scheduled' : item.status;
  return { chartId: item.id, chart_id: item.id, chartTitle: item.title, chart_title: item.title, status: item.status, effectiveStatus: effective, effective_status: effective, previewStudents: item.previewStudents, preview_students: item.previewStudents, publishAt: item.publishAt, publish_at: item.publishAt, previewMode: item.previewMode || 'view', preview_mode: item.previewMode || 'view', previewPermissions: item.previewPermissions || '{}', preview_permissions: item.previewPermissions || '{}', revision: item.revision || 0, access_revision: item.revision || 0, updatedBy: item.accessUpdatedBy || item.createdBy || '', updated_by: item.accessUpdatedBy || item.createdBy || '', updatedAt: item.accessUpdatedAt || item.updatedAt || '', updated_at: item.accessUpdatedAt || item.updatedAt || '', noChart: false, virtual: false };
}
function A3SeatFinal_emptyAccess_(title) {
  title = A3SeatFinal_txt_(title) || '';
  return { chartId:'', chart_id:'', chartTitle:title, chart_title:title, status:'private', effectiveStatus:'private', effective_status:'private', previewStudents:'', preview_students:'', publishAt:'', publish_at:'', previewMode:'view', preview_mode:'view', previewPermissions:'{}', preview_permissions:'{}', revision:0, access_revision:0, updatedBy:'', updated_by:'', updatedAt:'', updated_at:'', noChart:true, virtual:false };
}
function A3SeatFinal_history_(action, beforeObj, afterObj, actor) { try { var sh = A3SeatFinal_ensureSheet_(A3_SEATING_HISTORY_FINAL, A3SeatFinal_historyHeaders_()); sh.appendRow([A3SeatFinal_uuid_(), A3SeatFinal_now_(), (afterObj && afterObj.chartId) || (beforeObj && beforeObj.chartId) || '', (afterObj && afterObj.chartTitle) || (beforeObj && beforeObj.chartTitle) || '', action || '', (actor && (actor.email || actor.name || actor.username)) || '', (actor && actor.role) || '', JSON.stringify(beforeObj || {}), JSON.stringify(afterObj || {})]); } catch (e) {} }
function listSeatingCharts(payload) { var rows = A3SeatFinal_readRows_(); return { success: true, charts: rows.map(function(item) { return { id: item.id, title: item.title, active: !!item.active, createdAt: item.createdAt, updatedAt: item.updatedAt, createdBy: item.createdBy, version: item.version }; }) }; }
function getSeatingChart(payload) { payload = A3SeatFinal_payload_(payload); var sh = A3SeatFinal_sheet_(), map = A3SeatFinal_map_(sh); var row = A3SeatFinal_findRow_(sh, map, payload, true); if (!row) return { success: false, error: 'Chưa có sơ đồ chỗ ngồi nào trong sheet SEATING CHART.', chart: null }; return { success: true, chart: A3SeatFinal_chartFromRow_(A3SeatFinal_rowToObj_(sh, row, map)) }; }
function saveSeatingChart(payload) { payload = A3SeatFinal_payload_(payload); var lock = LockService.getScriptLock(); lock.waitLock(30000); try { var sh = A3SeatFinal_sheet_(), map = A3SeatFinal_map_(sh); var now = new Date(); var actor = payload.actor && (payload.actor.name || payload.actor.email || payload.actor.username) || payload.createdBy || payload.updatedBy || 'Web'; var title = A3SeatFinal_txt_(payload.title || payload.chartTitle || payload.chart_title) || 'Sơ đồ chỗ ngồi'; var row = A3SeatFinal_findRow_(sh, map, payload, false); var id = A3SeatFinal_txt_(payload.id || payload.chartId || payload.chart_id); if (!id || id === 'default') id = row ? A3SeatFinal_txt_(A3SeatFinal_get_(sh, row, map, ['id'])) : A3SeatFinal_uuid_(); var layout = payload.layout && typeof payload.layout === 'object' ? payload.layout : {}; var version = Number(payload.version || layout.version || 1) || 1; var makeActive = payload.makeActive !== false; if (!layout.version) layout.version = version; if (!layout.meta) layout.meta = {}; layout.meta.savedAt = A3SeatFinal_iso_(now); layout.meta.savedBy = actor; if (makeActive) for (var r = 2; r <= sh.getLastRow(); r++) A3SeatFinal_set_(sh, r, map, ['is_active','active'], false); if (!row) { sh.appendRow(new Array(sh.getLastColumn()).fill('')); row = sh.getLastRow(); } var createdAt = A3SeatFinal_get_(sh, row, map, ['created_at','createdAt']) || now; A3SeatFinal_set_(sh, row, map, ['id'], id); A3SeatFinal_set_(sh, row, map, ['title','name'], title); A3SeatFinal_set_(sh, row, map, ['is_active','active'], !!makeActive); A3SeatFinal_set_(sh, row, map, ['created_at','createdAt'], createdAt); A3SeatFinal_set_(sh, row, map, ['updated_at','updatedAt'], now); A3SeatFinal_set_(sh, row, map, ['created_by','createdBy'], actor); A3SeatFinal_set_(sh, row, map, ['version'], version); A3SeatFinal_set_(sh, row, map, ['seats_json','seatsJson'], A3SeatFinal_stringify_(layout.seats || {})); A3SeatFinal_set_(sh, row, map, ['room_json','roomJson'], A3SeatFinal_stringify_(layout.room || {})); A3SeatFinal_set_(sh, row, map, ['layout_json','layoutJson'], A3SeatFinal_stringify_(layout)); if (!A3SeatFinal_get_(sh, row, map, ['status'])) A3SeatFinal_set_(sh, row, map, ['status'], 'private'); if (!A3SeatFinal_get_(sh, row, map, ['preview_mode','previewMode'])) A3SeatFinal_set_(sh, row, map, ['preview_mode','previewMode'], 'view'); if (!A3SeatFinal_get_(sh, row, map, ['preview_permissions','previewPermissions'])) A3SeatFinal_set_(sh, row, map, ['preview_permissions','previewPermissions'], '{}'); SpreadsheetApp.flush(); var item = A3SeatFinal_rowToObj_(sh, row, map); return { success: true, chart: A3SeatFinal_chartFromRow_(item), access: A3SeatFinal_accessFromRow_(item) }; } finally { try { lock.releaseLock(); } catch (e) {} } }
function getSeatingAccess(params) { var payload = A3SeatFinal_payload_(params); var sh = A3SeatFinal_sheet_(), map = A3SeatFinal_map_(sh); var row = A3SeatFinal_findRow_(sh, map, payload, true); if (!row) return { success: true, access: A3SeatFinal_emptyAccess_(payload.chartTitle || payload.chart_title || payload.title) }; return { success: true, access: A3SeatFinal_accessFromRow_(A3SeatFinal_rowToObj_(sh, row, map)) }; }
function saveSeatingAccess(params) { var payload = A3SeatFinal_payload_(params); var lock = LockService.getScriptLock(); lock.waitLock(30000); try { var sh = A3SeatFinal_sheet_(), map = A3SeatFinal_map_(sh); var row = A3SeatFinal_findRow_(sh, map, payload, false); if (!row) throw new Error('Chưa tìm thấy sơ đồ thật trong SEATING CHART. Hãy bấm Lưu sơ đồ trước rồi mở lại Công bố.'); var beforeObj = A3SeatFinal_accessFromRow_(A3SeatFinal_rowToObj_(sh, row, map)); var actor = payload.actor || {}; var status = A3SeatFinal_status_(payload.status); var previewMode = status === 'private' ? 'view' : A3SeatFinal_previewMode_(payload.previewMode || payload.preview_mode); var previewStudents = status === 'private' ? '' : A3SeatFinal_txt_(payload.previewStudents != null ? payload.previewStudents : payload.preview_students); var publishAt = status === 'published' ? A3SeatFinal_txt_(payload.publishAt != null ? payload.publishAt : payload.publish_at) : ''; var previewPermissions = previewMode === 'edit' && status !== 'private' ? A3SeatFinal_txt_(payload.previewPermissions != null ? payload.previewPermissions : payload.preview_permissions) || '{}' : '{}'; var now = A3SeatFinal_now_(); var by = A3SeatFinal_txt_(payload.updatedBy || payload.updated_by || actor.name || actor.email || actor.username || ''); var rev = Number(A3SeatFinal_get_(sh, row, map, ['access_revision','revision']) || 0) || 0; A3SeatFinal_set_(sh, row, map, ['status','access_status','publish_status'], status); A3SeatFinal_set_(sh, row, map, ['preview_students','previewStudents'], previewStudents); A3SeatFinal_set_(sh, row, map, ['publish_at','publishAt'], publishAt); A3SeatFinal_set_(sh, row, map, ['preview_mode','previewMode'], previewMode); A3SeatFinal_set_(sh, row, map, ['preview_permissions','previewPermissions'], previewPermissions); A3SeatFinal_set_(sh, row, map, ['access_revision','revision'], rev + 1); A3SeatFinal_set_(sh, row, map, ['access_updated_by','updated_by','updatedBy'], by); A3SeatFinal_set_(sh, row, map, ['access_updated_at','updated_at','updatedAt'], now); A3SeatFinal_set_(sh, row, map, ['updated_at','updatedAt'], now); SpreadsheetApp.flush(); var afterObj = A3SeatFinal_accessFromRow_(A3SeatFinal_rowToObj_(sh, row, map)); A3SeatFinal_history_('save_access', beforeObj, afterObj, actor); return { success: true, saved: true, access: afterObj }; } finally { try { lock.releaseLock(); } catch (e) {} } }
function watchSeatingChart(params) { var res = getSeatingAccess(params); var access = res.access || A3SeatFinal_emptyAccess_(''); return { success: true, revision: access.revision || 0, updatedAt: access.updatedAt || '', updated_at: access.updatedAt || '', updatedBy: access.updatedBy || '', updated_by: access.updatedBy || '', access: access }; }
var A3SeatFinal_oldRouteAction_ = typeof routeAction === 'function' ? routeAction : null;
routeAction = function(action, payload, params) { var act = A3SeatFinal_txt_(action || (payload && payload.action) || (params && params.action)); var data = payload || params || {}; if (act === 'listSeatingCharts') { var l = listSeatingCharts(data); return { ok: true, success: true, data: l, charts: l.charts }; } if (act === 'getSeatingChart') { var g = getSeatingChart(data); return { ok: true, success: !!g.success, data: g, chart: g.chart, error: g.error || '' }; } if (act === 'saveSeatingChart') { var s = saveSeatingChart(data); return { ok: true, success: true, data: s, chart: s.chart, access: s.access }; } if (act === 'getSeatingAccess') { var a = getSeatingAccess(data); return { ok: true, success: true, data: a, access: a.access }; } if (act === 'saveSeatingAccess') { var sa = saveSeatingAccess(data); return { ok: true, success: true, data: sa, access: sa.access, saved: true }; } if (act === 'watchSeatingChart') { var w = watchSeatingChart(data); return { ok: true, success: true, data: w, access: w.access, revision: w.revision }; } if (A3SeatFinal_oldRouteAction_) return A3SeatFinal_oldRouteAction_.apply(this, arguments); return { ok: false, success: false, error: 'Unknown action: ' + act }; };

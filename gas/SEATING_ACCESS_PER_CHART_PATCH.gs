/**
 * A3K64 - SEATING ACCESS PER CHART PATCH
 * Dán vào CUỐI Api.gs rồi Deploy version mới.
 *
 * Thêm/ghi đè:
 * - getSeatingAccess
 * - saveSeatingAccess
 * - watchSeatingChart
 *
 * Mỗi sơ đồ có trạng thái riêng theo cột id trong sheet SEATING CHART.
 */

var A3K64_SEAT_ACCESS_PER_CHART = true;

function A3Seat_json_(v, fallback) {
  if (v == null || v === '') return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(String(v)); } catch (e) { return fallback; }
}

function A3Seat_payload_(params) {
  var source = params || {};
  if (source.parameter) source = source.parameter;
  if (source.payload) return A3Seat_json_(source.payload, {});
  if (source.data) return A3Seat_json_(source.data, {});
  if (source.body) return A3Seat_json_(source.body, {});
  return source || {};
}

function A3Seat_uuid_() {
  try { return Utilities.getUuid(); }
  catch (e) { return 'seat_' + Date.now() + '_' + Math.floor(Math.random() * 1000000); }
}

function A3Seat_now_() {
  return new Date().toISOString();
}

function A3Seat_headers_() {
  return [
    'id', 'title', 'is_active', 'created_at', 'updated_at', 'created_by',
    'version', 'seats_json', 'room_json', 'layout_json',
    'status', 'preview_students', 'publish_at',
    'access_revision', 'access_updated_by', 'access_updated_at'
  ];
}

function A3Seat_historyHeaders_() {
  return [
    'history_id', 'timestamp', 'chart_id', 'chart_title',
    'action', 'username', 'role', 'before_json', 'after_json'
  ];
}

function A3Seat_ensureSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  if (sh.getLastRow() < 1) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }

  var lastCol = Math.max(sh.getLastColumn(), 1);
  var row = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  for (var i = 0; i < row.length; i++) {
    var key = String(row[i] || '').trim();
    if (key) map[key] = i + 1;
  }

  headers.forEach(function(h) {
    if (!map[h]) {
      var col = sh.getLastColumn() + 1;
      sh.getRange(1, col).setValue(h);
      map[h] = col;
    }
  });

  return sh;
}

function A3Seat_map_(sh) {
  var row = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  var map = {};
  for (var i = 0; i < row.length; i++) {
    var key = String(row[i] || '').trim();
    if (key) map[key] = i + 1;
  }
  return map;
}

function A3Seat_get_(sh, row, map, key) {
  return map[key] ? sh.getRange(row, map[key]).getValue() : '';
}

function A3Seat_set_(sh, row, map, key, value) {
  if (map[key]) sh.getRange(row, map[key]).setValue(value);
}

function A3Seat_status_(status) {
  status = String(status || '').trim();
  if (status === 'preview') return 'preview';
  if (status === 'published') return 'published';
  return 'private';
}

function A3Seat_findChartRow_(sh, map, chartId, chartTitle, createIfMissing) {
  chartId = String(chartId || '').trim() || 'default';
  chartTitle = String(chartTitle || '').trim() || 'Sơ đồ hiện tại';

  var last = sh.getLastRow();
  for (var r = 2; r <= last; r++) {
    if (String(A3Seat_get_(sh, r, map, 'id') || '').trim() === chartId) return r;
  }

  if (!createIfMissing) return 0;

  var row = sh.getLastRow() + 1;
  if (row < 2) row = 2;

  var width = Math.max(sh.getLastColumn(), A3Seat_headers_().length);
  var values = [];
  for (var i = 0; i < width; i++) values.push('');
  sh.getRange(row, 1, 1, width).setValues([values]);

  var now = A3Seat_now_();
  A3Seat_set_(sh, row, map, 'id', chartId);
  A3Seat_set_(sh, row, map, 'title', chartTitle);
  A3Seat_set_(sh, row, map, 'is_active', false);
  A3Seat_set_(sh, row, map, 'created_at', now);
  A3Seat_set_(sh, row, map, 'updated_at', now);
  A3Seat_set_(sh, row, map, 'status', 'private');
  A3Seat_set_(sh, row, map, 'preview_students', '');
  A3Seat_set_(sh, row, map, 'publish_at', '');
  A3Seat_set_(sh, row, map, 'access_revision', 0);
  A3Seat_set_(sh, row, map, 'access_updated_at', now);

  return row;
}

function A3Seat_readAccess_(sh, row, map) {
  var status = A3Seat_status_(A3Seat_get_(sh, row, map, 'status'));
  return {
    chartId: String(A3Seat_get_(sh, row, map, 'id') || 'default'),
    chart_id: String(A3Seat_get_(sh, row, map, 'id') || 'default'),
    chartTitle: String(A3Seat_get_(sh, row, map, 'title') || 'Sơ đồ hiện tại'),
    chart_title: String(A3Seat_get_(sh, row, map, 'title') || 'Sơ đồ hiện tại'),
    status: status,
    previewStudents: String(A3Seat_get_(sh, row, map, 'preview_students') || ''),
    preview_students: String(A3Seat_get_(sh, row, map, 'preview_students') || ''),
    publishAt: String(A3Seat_get_(sh, row, map, 'publish_at') || ''),
    publish_at: String(A3Seat_get_(sh, row, map, 'publish_at') || ''),
    revision: Number(A3Seat_get_(sh, row, map, 'access_revision') || 0),
    access_revision: Number(A3Seat_get_(sh, row, map, 'access_revision') || 0),
    updatedBy: String(A3Seat_get_(sh, row, map, 'access_updated_by') || ''),
    updated_by: String(A3Seat_get_(sh, row, map, 'access_updated_by') || ''),
    updatedAt: String(A3Seat_get_(sh, row, map, 'access_updated_at') || ''),
    updated_at: String(A3Seat_get_(sh, row, map, 'access_updated_at') || '')
  };
}

function A3Seat_history_(action, beforeObj, afterObj, actor) {
  try {
    var sh = A3Seat_ensureSheet_('SEATING HISTORY', A3Seat_historyHeaders_());
    sh.appendRow([
      A3Seat_uuid_(),
      A3Seat_now_(),
      (afterObj && afterObj.chartId) || (beforeObj && beforeObj.chartId) || 'default',
      (afterObj && afterObj.chartTitle) || (beforeObj && beforeObj.chartTitle) || '',
      action || 'save_access',
      (actor && (actor.email || actor.name || actor.username)) || '',
      (actor && actor.role) || '',
      JSON.stringify(beforeObj || {}),
      JSON.stringify(afterObj || {})
    ]);
  } catch (err) {}
}

function getSeatingAccess(params) {
  var payload = A3Seat_payload_(params);
  var chartId = payload.chartId || payload.chart_id || payload.id || 'default';
  var chartTitle = payload.chartTitle || payload.chart_title || payload.title || 'Sơ đồ hiện tại';

  var sh = A3Seat_ensureSheet_('SEATING CHART', A3Seat_headers_());
  var map = A3Seat_map_(sh);
  var row = A3Seat_findChartRow_(sh, map, chartId, chartTitle, true);
  return { ok: true, access: A3Seat_readAccess_(sh, row, map) };
}

function saveSeatingAccess(params) {
  var payload = A3Seat_payload_(params);
  var actor = payload.actor || {};
  var chartId = payload.chartId || payload.chart_id || payload.id || 'default';
  var chartTitle = payload.chartTitle || payload.chart_title || payload.title || 'Sơ đồ hiện tại';

  var sh = A3Seat_ensureSheet_('SEATING CHART', A3Seat_headers_());
  var map = A3Seat_map_(sh);
  var row = A3Seat_findChartRow_(sh, map, chartId, chartTitle, true);

  var beforeObj = A3Seat_readAccess_(sh, row, map);

  var status = A3Seat_status_(payload.status);
  var previewStudents = status === 'preview'
    ? String(payload.previewStudents != null ? payload.previewStudents : payload.preview_students || '')
    : '';
  var publishAt = status === 'published'
    ? String(payload.publishAt != null ? payload.publishAt : payload.publish_at || '')
    : '';

  var updatedBy = String(
    payload.updatedBy ||
    payload.updated_by ||
    actor.name ||
    actor.email ||
    actor.username ||
    ''
  );

  var nextRevision = Number(beforeObj.revision || 0) + 1;
  var now = A3Seat_now_();

  A3Seat_set_(sh, row, map, 'id', chartId);
  A3Seat_set_(sh, row, map, 'title', chartTitle);
  A3Seat_set_(sh, row, map, 'status', status);
  A3Seat_set_(sh, row, map, 'preview_students', previewStudents);
  A3Seat_set_(sh, row, map, 'publish_at', publishAt);
  A3Seat_set_(sh, row, map, 'access_revision', nextRevision);
  A3Seat_set_(sh, row, map, 'access_updated_by', updatedBy);
  A3Seat_set_(sh, row, map, 'access_updated_at', now);

  var afterObj = A3Seat_readAccess_(sh, row, map);
  A3Seat_history_('save_access', beforeObj, afterObj, actor);

  return { ok: true, access: afterObj };
}

function watchSeatingChart(params) {
  var access = getSeatingAccess(params).access;
  return {
    ok: true,
    revision: access.revision,
    updatedAt: access.updatedAt,
    updated_at: access.updatedAt,
    updatedBy: access.updatedBy,
    updated_by: access.updatedBy,
    access: access
  };
}

var A3Seat_oldRouteAction_ = (typeof routeAction === 'function') ? routeAction : null;

routeAction = function(action, params) {
  var act = String(action || (params && params.action) || '').trim();

  if (act === 'getSeatingAccess') return getSeatingAccess(params);
  if (act === 'saveSeatingAccess') return saveSeatingAccess(params);
  if (act === 'watchSeatingChart') return watchSeatingChart(params);

  if (A3Seat_oldRouteAction_) return A3Seat_oldRouteAction_.apply(this, arguments);
  return { ok: false, error: 'Unknown action: ' + act };
};

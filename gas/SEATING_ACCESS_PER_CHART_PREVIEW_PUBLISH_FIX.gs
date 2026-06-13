/**
 * A3K64 - SEATING ACCESS PREVIEW + PUBLISH FIX
 * Dán đoạn này SAU file SEATING_ACCESS_PER_CHART_PATCH trong Api.gs.
 * Mục đích: khi trạng thái là published/hẹn giờ, vẫn giữ danh sách preview_students
 * để học sinh trong danh sách xem trước có thể vào trước giờ công bố.
 */

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
  var previewStudents = (status === 'preview' || status === 'published')
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

/*
 * Bulk history compatibility patch.
 *
 * Mục đích: bulkScore không còn ghi từng dòng là save_score nữa.
 * Khi chấm nhiều học sinh, _CHANGE_HISTORY sẽ ghi action giống project cũ:
 * - selected_bulk_update
 * - group_bulk_update nếu payload/source cho biết là chấm theo tổ
 *
 * File đặt tên zz_... để khi copy toàn bộ vào Apps Script, patch này nằm sau Api.gs.
 */

function A3K64_bulkActor_(payload) {
  payload = payload || {};
  return {
    username: txt(payload.createdBy || payload.actorName || payload.username || payload.actorEmail || payload.email) || "Web",
    role: txt(payload.role || payload.actorRole)
  };
}

function A3K64_bulkMode_(payload) {
  payload = payload || {};
  var raw = key(payload.historyAction || payload.actionType || payload.bulkAction || payload.bulkMode || payload.mode || payload.source || payload.historySource || "");
  if (raw.indexOf("group") >= 0 || raw.indexOf("to") === 0 || raw.indexOf("tobulk") >= 0) {
    return { action: "group_bulk_update", source: "group_bulk" };
  }
  if (payload.groupNum || payload.group || payload.to) {
    return { action: "group_bulk_update", source: "group_bulk" };
  }
  return { action: "selected_bulk_update", source: "selected_bulk" };
}

function A3K64_bulkRowInfos_(sheet, config, ids) {
  var rows = [];
  ids.forEach(function(studentIdValue) {
    var info = findRow(sheet, config, txt(studentIdValue));
    if (info) rows.push({ studentId: txt(studentIdValue), info: info });
  });
  return rows;
}

function A3K64_applyScoreToRow_(sheet, config, row, title, points, actorName) {
  var plusTextCell = sheet.getRange(row, config.plusTextCol + 1);
  var plusTotalCell = sheet.getRange(row, config.plusTotalCol + 1);
  var minusTextCell = sheet.getRange(row, config.minusTextCol + 1);
  var minusTotalCell = sheet.getRange(row, config.minusTotalCol + 1);
  var totalCell = sheet.getRange(row, config.totalCol + 1);
  var statusCell = sheet.getRange(row, config.statusCol + 1);
  var editorCell = config.editorCol !== undefined ? sheet.getRange(row, config.editorCol + 1) : null;

  var plus = num(plusTotalCell.getDisplayValue());
  if (!isFinite(plus)) plus = 0;

  var minus = num(minusTotalCell.getDisplayValue());
  if (!isFinite(minus)) minus = 0;

  if (points >= 0) {
    plusTextCell.setValue(addLine(plusTextCell.getDisplayValue(), title));
    plus += Math.abs(points);
    plusTotalCell.setValue(plus || "");
  } else {
    minusTextCell.setValue(addLine(minusTextCell.getDisplayValue(), title));
    minus += Math.abs(points);
    minusTotalCell.setValue(minus || "");
  }

  var total = BASE_SCORE + plus - minus;
  totalCell.setValue(total);
  statusCell.setValue(status(total));
  if (editorCell) editorCell.setValue(actorName);

  return total;
}

function bulkScore(payload) {
  payload = payload || {};
  var ids = Array.isArray(payload.studentIds) ? payload.studentIds.map(txt).filter(Boolean) : [];
  var week = Number(payload.week || DEFAULT_WEEK);
  var sheet = weekSheet(week);
  if (!sheet) throw new Error("Không tìm thấy TUẦN " + week);

  var config = scoreCfg(vals(sheet));
  if (!config) throw new Error("Không tìm thấy bảng chấm");

  var rowsInfo = A3K64_bulkRowInfos_(sheet, config, ids);
  var rowIdxList = rowsInfo.map(function(item) { return item.info.row; });
  var mode = A3K64_bulkMode_(payload);
  var actor = A3K64_bulkActor_(payload);
  var title = txt(payload.title);
  var points = Number(payload.points || 0);
  var events = [];

  rowsInfo.forEach(function(item) {
    var row = item.info.row;
    var before = snap(sheet, row, config);
    A3K64_applyScoreToRow_(sheet, config, row, title, points, actor.username);
    var after = snap(sheet, row, config);

    var event = {
      id: id("e"),
      studentId: item.studentId,
      week: week,
      title: title,
      points: points,
      type: points >= 0 ? "CONG" : "TRU",
      category: txt(payload.category) || cat(title),
      note: "",
      createdBy: actor.username,
      createdAt: txt(payload.createdAt) || iso()
    };

    history(
      week,
      item.studentId,
      item.info.name,
      mode.action,
      before,
      after,
      actor,
      txt(payload.reason || title),
      row,
      item.info.group,
      {
        source: mode.source,
        updatedCount: rowsInfo.length,
        rows: rowIdxList,
        groupNum: item.info.group,
        event: event
      }
    );
    events.push(event);
  });

  log("bulkScore", actor.username, "Chấm điểm hàng loạt", {
    action: mode.action,
    source: mode.source,
    title: title,
    points: points,
    updatedCount: rowsInfo.length,
    rows: rowIdxList
  });

  return {
    count: events.length,
    updatedCount: events.length,
    rows: rowIdxList,
    action: mode.action,
    events: events
  };
}

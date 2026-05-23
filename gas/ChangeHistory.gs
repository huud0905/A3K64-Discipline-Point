/**
 * Change history module copied/adapted from the old project.
 *
 * Sheet name and columns are intentionally kept exactly the same:
 * _CHANGE_HISTORY
 * id, timestamp, week, row_idx, student_name, group_num, action, username, role,
 * before_total, after_total, before_json, after_json, restore_from_id, reason, payload_json
 */

const HISTORY_SHEET_NAME = "_CHANGE_HISTORY";
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

function _historyUuid_() {
  try {
    return Utilities.getUuid();
  } catch (e) {
    return "hist_" + Date.now() + "_" + Math.random().toString(36).slice(2);
  }
}

function _historySafeJsonParse_(raw, fallback) {
  try {
    if (raw === null || raw === undefined || raw === "") return fallback;
    return JSON.parse(String(raw));
  } catch (e) {
    return fallback;
  }
}

function _historyNumber_(value, fallback) {
  if (fallback === undefined) fallback = 0;
  if (value === null || value === undefined || value === "") return fallback;
  var parsed = Number(String(value).replace(/^\+/, "").replace(",", "."));
  return isFinite(parsed) ? parsed : fallback;
}

function _historyActor_(user) {
  user = user || {};
  return {
    username: String(user.username || user.actorName || user.actorEmail || user.email || user.uid || "system").trim() || "system",
    role: String(user.role || user.actorRole || "").trim(),
  };
}

function _ensureHistorySystemSheet_(name, headers) {
  if (typeof _ensureSystemSheet_ === "function") return _ensureSystemSheet_(name, headers);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (headers && headers.length) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    try { sh.hideSheet(); } catch (e) {}
  } else {
    var needHeader = sh.getLastRow() < 1;
    if (!needHeader && headers && headers.length) {
      var current = sh.getRange(1, 1, 1, headers.length).getValues()[0].map(function(v) { return String(v || "").trim(); });
      needHeader = current.join("|") !== headers.join("|");
    }
    if (needHeader && headers && headers.length) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.setFrozenRows(1);
    }
    try { sh.hideSheet(); } catch (e) {}
  }
  return sh;
}

function _ensureChangeHistorySheet_() {
  return _ensureHistorySystemSheet_(HISTORY_SHEET_NAME, HISTORY_HEADERS);
}

function _appendChangeHistoryRowsV33_(rows) {
  var safeRows = Array.isArray(rows)
    ? rows.filter(function(item) { return item && item.week && item.rowIdx; })
    : [];
  if (!safeRows.length) return { success: true, count: 0 };

  var sh = _ensureChangeHistorySheet_();
  var payload = safeRows.map(function(item) {
    return [
      String(item.id || _historyUuid_()),
      item.timestamp || new Date(),
      String(item.week || "").trim(),
      Number(item.rowIdx || 0),
      String(item.studentName || "").trim(),
      Number(item.groupNum || 0),
      String(item.action || "").trim(),
      String(item.username || "").trim(),
      String(item.role || "").trim(),
      item.beforeTotal === null || item.beforeTotal === undefined ? "" : Number(item.beforeTotal),
      item.afterTotal === null || item.afterTotal === undefined ? "" : Number(item.afterTotal),
      JSON.stringify(item.before || null),
      JSON.stringify(item.after || null),
      String(item.restoreFromId || "").trim(),
      String(item.reason || "").trim(),
      JSON.stringify(item.payload || {}),
    ];
  });

  sh.getRange(sh.getLastRow() + 1, 1, payload.length, HISTORY_HEADERS.length).setValues(payload);
  return { success: true, count: payload.length };
}

function _logStudentChangeV33_(action, weekName, beforeState, afterState, user, meta) {
  var before = beforeState || null;
  var after = afterState || null;
  var actor = _historyActor_(user || {});
  var week = String((after && after.week) || (before && before.week) || weekName || "").trim();
  var rowIdx = Number((after && after.rowIdx) || (before && before.rowIdx) || 0);
  if (!week || !rowIdx) return { success: false, error: "Thiếu dữ liệu lịch sử." };

  return _appendChangeHistoryRowsV33_([{
    id: _historyUuid_(),
    timestamp: new Date(),
    week: week,
    rowIdx: rowIdx,
    studentName: String((after && after.name) || (before && before.name) || "").trim(),
    groupNum: Number((after && after.group) || (before && before.group) || 0),
    action: String(action || "").trim(),
    username: actor.username,
    role: actor.role,
    beforeTotal: before && before.tongDiem !== undefined ? Number(before.tongDiem) : null,
    afterTotal: after && after.tongDiem !== undefined ? Number(after.tongDiem) : null,
    before: before,
    after: after,
    restoreFromId: meta && meta.restoreFromId ? String(meta.restoreFromId) : "",
    reason: meta && meta.reason ? String(meta.reason) : "",
    payload: meta || {},
  }]);
}

function _memberMapForWeekV33_(weekName, force) {
  var map = {};
  if (typeof getMembersAndStatus !== "function") return map;
  var res = getMembersAndStatus(String(weekName || "").trim(), "ALL", !!force);
  if (res && res.success && Array.isArray(res.members)) {
    res.members.forEach(function(member) {
      map[String(Number(member.rowIdx || 0))] = member;
    });
  }
  return map;
}

function _captureRowStateV33_(weekName, rowIdx, force) {
  var key = String(Number(rowIdx || 0));
  if (!key || key === "0") return null;
  var member = _memberMapForWeekV33_(weekName, !!force)[key] || null;
  if (!member) return null;
  return {
    week: String(weekName || "").trim(),
    rowIdx: Number(member.rowIdx || rowIdx || 0),
    name: String(member.name || "").trim(),
    group: Number(member.group || member.groupNum || 0),
    ndCong: String(member.ndCong || ""),
    tongCong: Number(member.tongCong || 0),
    ndTru: String(member.ndTru || ""),
    tongTru: Number(member.tongTru || 0),
    tongDiem: Number(member.tongDiem || member.total || 0),
    xepLoai: String(member.xepLoai || member.status || ""),
    internalNote: String(member.internalNote || ""),
    lastLog: String(member.lastLog || ""),
  };
}

function _summarizeChangeHistoryV33_(beforeState, afterState) {
  var beforeTotal = beforeState && beforeState.tongDiem !== undefined ? Number(beforeState.tongDiem || 0) : null;
  var afterTotal = afterState && afterState.tongDiem !== undefined ? Number(afterState.tongDiem || 0) : null;
  var delta = beforeTotal === null || afterTotal === null ? null : Number((afterTotal - beforeTotal).toFixed(1));
  var noteChanged = String((beforeState && beforeState.internalNote) || "") !== String((afterState && afterState.internalNote) || "");
  return { beforeTotal: beforeTotal, afterTotal: afterTotal, deltaTotal: delta, noteChanged: noteChanged };
}

function getStudentChangeHistory(weekName, rowIdx, limit, user) {
  try {
    var safeWeek = String(weekName || "").trim();
    var safeRow = Number(rowIdx || 0);
    var take = Math.max(1, Math.min(Number(limit || 10) || 10, 30));
    if (!safeWeek || !safeRow) return { success: false, error: "Thiếu tuần hoặc học sinh.", rows: [] };

    var sh = _ensureChangeHistorySheet_();
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return { success: true, rows: [] };

    var values = sh.getRange(2, 1, lastRow - 1, HISTORY_HEADERS.length).getValues();
    var rows = [];
    for (var i = values.length - 1; i >= 0 && rows.length < take; i--) {
      var row = values[i];
      if (String(row[2] || "").trim() !== safeWeek) continue;
      if (Number(row[3] || 0) !== safeRow) continue;
      var before = _historySafeJsonParse_(row[11], null);
      var after = _historySafeJsonParse_(row[12], null);
      rows.push({
        id: String(row[0] || "").trim(),
        timestamp: row[1] instanceof Date ? row[1].getTime() : Number(row[1] || 0),
        week: safeWeek,
        rowIdx: safeRow,
        studentName: String(row[4] || "").trim(),
        groupNum: Number(row[5] || 0),
        action: String(row[6] || "").trim(),
        username: String(row[7] || "").trim(),
        role: String(row[8] || "").trim(),
        before: before,
        after: after,
        restoreFromId: String(row[13] || "").trim(),
        reason: String(row[14] || "").trim(),
        payload: _historySafeJsonParse_(row[15], {}),
        summary: _summarizeChangeHistoryV33_(before, after),
        canRestore: true,
      });
    }
    return { success: true, rows: rows };
  } catch (e) {
    return { success: false, error: String(e), rows: [] };
  }
}

function restoreStudentChange(changeId, user, reason) {
  try {
    var safeId = String(changeId || "").trim();
    if (!safeId) return { success: false, error: "Thiếu mã lịch sử." };

    var sh = _ensureChangeHistorySheet_();
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return { success: false, error: "Chưa có lịch sử thay đổi." };

    var values = sh.getRange(2, 1, lastRow - 1, HISTORY_HEADERS.length).getValues();
    var found = null;
    for (var i = values.length - 1; i >= 0; i--) {
      if (String(values[i][0] || "").trim() === safeId) { found = values[i]; break; }
    }
    if (!found) return { success: false, error: "Không tìm thấy bản ghi lịch sử." };

    var safeWeek = String(found[2] || "").trim();
    var safeRow = Number(found[3] || 0);
    var beforeState = _historySafeJsonParse_(found[11], null);
    if (!beforeState) return { success: false, error: "Bản ghi này không có dữ liệu để khôi phục." };

    var currentBefore = _captureRowStateV33_(safeWeek, safeRow, true);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(safeWeek);
    if (!sheet) return { success: false, error: "Không tìm thấy sheet tuần!" };

    var total = 50 + Math.abs(_historyNumber_(beforeState.tongCong, 0)) - Math.abs(_historyNumber_(beforeState.tongTru, 0));
    var xepLoai = typeof _computeRankLabel_ === "function" ? _computeRankLabel_(total) : (total >= 50 ? "Tốt" : total >= 0 ? "Khá" : total >= -50 ? "Đạt" : "Chưa đạt");
    var timestamp = Utilities.formatDate(new Date(), "GMT+7", "HH:mm:ss dd/MM/yyyy");
    var actor = _historyActor_(user || {});
    var logStr = actor.username + " (Restore) - " + timestamp;

    // Old project sheet layout: J:P = ndCong, tongCong, ndTru, tongTru, tongDiem, xepLoai, lastLog.
    sheet.getRange(safeRow, 10, 1, 7).setValues([[
      String(beforeState.ndCong || ""),
      Math.abs(_historyNumber_(beforeState.tongCong, 0)),
      String(beforeState.ndTru || ""),
      Math.abs(_historyNumber_(beforeState.tongTru, 0)),
      total,
      xepLoai,
      logStr,
    ]]);

    if (typeof _saveInternalNote_ === "function") _saveInternalNote_(safeWeek, safeRow, beforeState.internalNote || "", user || {});
    if (typeof _invalidateAppCaches_ === "function") _invalidateAppCaches_(safeWeek, { user: user || {}, scope: "restore", rowIdx: safeRow });
    if (typeof _appendActivityLog_ === "function") _appendActivityLog_("restore_score", user || {}, { week: safeWeek, rowIdx: safeRow, changeId: safeId, reason: String(reason || "").trim() });

    var afterState = _captureRowStateV33_(safeWeek, safeRow, true);
    _logStudentChangeV33_("restore_score", safeWeek, currentBefore, afterState, user || {}, { restoreFromId: safeId, reason: String(reason || "").trim() });
    return { success: true, week: safeWeek, rowIdx: safeRow, member: afterState };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

function _getGroupRowsV33_(weekName, groupNum, excludeRowIdx, force) {
  var group = Number(groupNum || 0);
  if (!group) return [];
  var map = _memberMapForWeekV33_(weekName, !!force);
  return Object.keys(map).map(function(key) { return map[key]; }).filter(function(member) {
    return Number(member.group || 0) === group && Number(member.rowIdx || 0) !== Number(excludeRowIdx || 0);
  }).map(function(member) { return Number(member.rowIdx || 0); }).filter(function(v) { return v > 0; }).sort(function(a, b) { return a - b; });
}

function _getSelectedRowsV33_(rowIdxList) {
  var seen = {};
  return (rowIdxList || []).map(function(item) { return Number(item || 0); }).filter(function(item) {
    if (!(item > 0) || seen[item]) return false;
    seen[item] = true;
    return true;
  }).sort(function(a, b) { return a - b; });
}

// Drop-in wrappers for the old project API. These are guarded so this file can be added safely.
if (typeof updateFullScore === "function") {
  var __updateFullScoreChangeHistoryV33__ = updateFullScore;
  updateFullScore = function(tuan, rowIdx, dataUpdate, user) {
    var beforeState = _captureRowStateV33_(tuan, rowIdx, true);
    var res = __updateFullScoreChangeHistoryV33__.apply(this, arguments);
    if (res && res.success) {
      var afterState = _captureRowStateV33_(tuan, rowIdx, true);
      _logStudentChangeV33_("save_score", tuan, beforeState, afterState, user || {}, { source: "single_edit" });
    }
    return res;
  };
}

if (typeof updateGroupBulk === "function") {
  var __updateGroupBulkChangeHistoryV33__ = updateGroupBulk;
  updateGroupBulk = function(tuan, groupNum, entriesToAdd, user, excludeRowIdx) {
    var rows = _getGroupRowsV33_(tuan, groupNum, excludeRowIdx, true);
    var beforeMap = {};
    rows.forEach(function(rowIdx) { beforeMap[String(rowIdx)] = _captureRowStateV33_(tuan, rowIdx, true); });
    var res = __updateGroupBulkChangeHistoryV33__.apply(this, arguments);
    if (res && res.success) {
      var logs = [];
      rows.forEach(function(rowIdx) {
        var beforeState = beforeMap[String(rowIdx)] || null;
        var afterState = _captureRowStateV33_(tuan, rowIdx, true);
        if (!afterState) return;
        var actor = _historyActor_(user || {});
        logs.push({
          id: _historyUuid_(),
          timestamp: new Date(),
          week: String(tuan || "").trim(),
          rowIdx: Number(rowIdx || 0),
          studentName: String((afterState && afterState.name) || (beforeState && beforeState.name) || "").trim(),
          groupNum: Number((afterState && afterState.group) || (beforeState && beforeState.group) || groupNum || 0),
          action: "group_bulk_update",
          username: actor.username,
          role: actor.role,
          beforeTotal: beforeState && beforeState.tongDiem !== undefined ? Number(beforeState.tongDiem) : null,
          afterTotal: afterState && afterState.tongDiem !== undefined ? Number(afterState.tongDiem) : null,
          before: beforeState,
          after: afterState,
          payload: { source: "group_bulk", groupNum: Number(groupNum || 0), excludeRowIdx: Number(excludeRowIdx || 0), updatedCount: Number(res.updatedCount || 0) },
        });
      });
      _appendChangeHistoryRowsV33_(logs);
    }
    return res;
  };
}

if (typeof updateSelectedBulk === "function") {
  var __updateSelectedBulkChangeHistoryV33__ = updateSelectedBulk;
  updateSelectedBulk = function(tuan, rowIdxList, entriesToAdd, user) {
    var rows = _getSelectedRowsV33_(rowIdxList);
    var beforeMap = {};
    rows.forEach(function(rowIdx) { beforeMap[String(rowIdx)] = _captureRowStateV33_(tuan, rowIdx, true); });
    var res = __updateSelectedBulkChangeHistoryV33__.apply(this, arguments);
    if (res && res.success) {
      var logs = [];
      rows.forEach(function(rowIdx) {
        var beforeState = beforeMap[String(rowIdx)] || null;
        var afterState = _captureRowStateV33_(tuan, rowIdx, true);
        if (!afterState) return;
        var actor = _historyActor_(user || {});
        logs.push({
          id: _historyUuid_(),
          timestamp: new Date(),
          week: String(tuan || "").trim(),
          rowIdx: Number(rowIdx || 0),
          studentName: String((afterState && afterState.name) || (beforeState && beforeState.name) || "").trim(),
          groupNum: Number((afterState && afterState.group) || (beforeState && beforeState.group) || 0),
          action: "selected_bulk_update",
          username: actor.username,
          role: actor.role,
          beforeTotal: beforeState && beforeState.tongDiem !== undefined ? Number(beforeState.tongDiem) : null,
          afterTotal: afterState && afterState.tongDiem !== undefined ? Number(afterState.tongDiem) : null,
          before: beforeState,
          after: afterState,
          payload: { source: "selected_bulk", updatedCount: Number(res.updatedCount || 0), rows: rows },
        });
      });
      _appendChangeHistoryRowsV33_(logs);
    }
    return res;
  };
}

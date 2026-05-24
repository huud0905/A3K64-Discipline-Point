/**
 * A3K64 backend patch: giữ nguyên mọi lần chấm, kể cả khi nội dung giống nhau.
 *
 * Dán các hàm này vào Api.gs nếu backend Apps Script đang bị lưu thiếu dòng trùng.
 * Mục tiêu: KHÔNG dùng Set/includes/indexOf để gộp nội dung điểm.
 */

function A3K64_toLinesNoDedupe_(value) {
  if (Array.isArray(value)) return value.map(String).filter(function (s) { return s.trim(); });
  return String(value || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
}

function A3K64_appendLinesNoDedupe_(oldText, newText) {
  var oldLines = A3K64_toLinesNoDedupe_(oldText);
  var newLines = A3K64_toLinesNoDedupe_(newText);
  return oldLines.concat(newLines).join('\n');
}

function A3K64_sumNumber_(value) {
  var n = Number(value || 0);
  return isFinite(n) ? n : 0;
}

function A3K64_buildRepeatedEventLines_(events) {
  var cong = [];
  var tru = [];
  var tongCong = 0;
  var tongTru = 0;

  (events || []).forEach(function (event) {
    var title = String(event && event.title || '').trim();
    var points = Number(event && event.points || 0);
    if (!title || !isFinite(points) || points === 0) return;

    // Không kiểm tra trùng. Mỗi event là một lần chấm hợp lệ.
    if (points > 0) {
      cong.push(title);
      tongCong += points;
    } else {
      tru.push(title);
      tongTru += Math.abs(points);
    }
  });

  return {
    ndCong: cong.join('\n'),
    ndTru: tru.join('\n'),
    tongCong: tongCong,
    tongTru: tongTru
  };
}

/**
 * Dùng trong saveScoreChanges/updateFullScore/updateGroupBulk/updateSelectedBulk:
 * - Cột C/Nội dung cộng: append text mới vào text cũ, không xoá dòng giống nhau.
 * - Cột D/Tổng cộng: cộng số mới vào số cũ.
 * - Cột E/Nội dung trừ: append text mới vào text cũ, không xoá dòng giống nhau.
 * - Cột F/Tổng trừ: cộng số mới vào số cũ.
 *
 * Nếu hệ thống của bạn đang dùng cột khác, đổi 4 chỉ số cột bên dưới.
 */
function A3K64_applyScoreAppendNoDedupe_(sheet, rowIdx, scorePack) {
  var COL_ND_CONG = 3;
  var COL_TONG_CONG = 4;
  var COL_ND_TRU = 5;
  var COL_TONG_TRU = 6;

  var range = sheet.getRange(rowIdx, COL_ND_CONG, 1, 4);
  var values = range.getValues()[0];

  var oldNdCong = values[0];
  var oldTongCong = A3K64_sumNumber_(values[1]);
  var oldNdTru = values[2];
  var oldTongTru = A3K64_sumNumber_(values[3]);

  var nextNdCong = A3K64_appendLinesNoDedupe_(oldNdCong, scorePack.ndCong);
  var nextTongCong = oldTongCong + A3K64_sumNumber_(scorePack.tongCong);
  var nextNdTru = A3K64_appendLinesNoDedupe_(oldNdTru, scorePack.ndTru);
  var nextTongTru = oldTongTru + A3K64_sumNumber_(scorePack.tongTru);

  range.setValues([[nextNdCong, nextTongCong, nextNdTru, nextTongTru]]);
}

/**
 * Mẫu fix cho action saveScoreChanges:
 * Thay phần ghi điểm hiện tại bằng logic kiểu này.
 * Không dùng Array.from(new Set(...)), includes(), indexOf() để chống trùng nội dung.
 */
function A3K64_saveScoreChangesNoDedupeExample_(payload) {
  var additions = (payload && payload.additions) || [];
  var byRow = {};

  additions.forEach(function (event) {
    var rowIdx = Number(event.rowIdx || event.row_idx || event.row || 0);
    if (!rowIdx) return;
    if (!byRow[rowIdx]) byRow[rowIdx] = [];
    byRow[rowIdx].push(event);
  });

  Object.keys(byRow).forEach(function (rowIdxText) {
    var rowIdx = Number(rowIdxText);
    var pack = A3K64_buildRepeatedEventLines_(byRow[rowIdxText]);
    // var sheet = ... lấy sheet tuần hiện tại ở code chính của bạn
    // A3K64_applyScoreAppendNoDedupe_(sheet, rowIdx, pack);
  });
}

/*
Checklist cần sửa trong Api.gs chính:
1. Tìm và xoá mọi đoạn kiểu: Array.from(new Set(lines))
2. Tìm và xoá mọi đoạn kiểu: if (!arr.includes(line)) arr.push(line)
3. Tìm và xoá mọi đoạn kiểu: if (oldText.indexOf(line) === -1)
4. Khi thêm điểm, dùng concat/push thẳng để giữ đủ số lần chấm.
*/

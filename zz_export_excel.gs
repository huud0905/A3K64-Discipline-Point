var __A3_EXPORT_EXCEL = __A3_EXPORT_EXCEL || {};

(function () {
  if (__A3_EXPORT_EXCEL.installed) return;
  if (typeof routeAction !== "function" || typeof weekSheet !== "function" || typeof txt !== "function") return;
  __A3_EXPORT_EXCEL.installed = true;

  const originalRouteAction = routeAction;

  function exportStamp() {
    return Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "yyyyMMdd_HHmmss");
  }

  function exportDisplayStamp() {
    return Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "HH:mm:ss dd/MM/yyyy");
  }

  function exportActor(payload) {
    payload = payload || {};
    return txt(payload.actorEmail || payload.email || payload.username || payload.actorName || payload.createdBy || "Web");
  }

  function exportParentFolder() {
    const sourceFile = DriveApp.getFileById(SPREADSHEET_ID);
    const parents = sourceFile.getParents();
    return parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  }

  function exportFolder() {
    const parent = exportParentFolder();
    const folders = parent.getFoldersByName("export");
    return folders.hasNext() ? folders.next() : parent.createFolder("export");
  }

  function numberOrBlank(value) {
    if (typeof value === "number" && isFinite(value)) return value;
    const parsed = typeof num === "function" ? num(value) : Number(String(value || "").replace(/\+/g, "").replace(",", "."));
    return isFinite(parsed) ? parsed : "";
  }

  function copyBasicFormat(sourceRange, targetRange) {
    targetRange.setNumberFormats(sourceRange.getNumberFormats());
    targetRange.setBackgrounds(sourceRange.getBackgrounds());
    targetRange.setFontColors(sourceRange.getFontColors());
    targetRange.setFontWeights(sourceRange.getFontWeights());
    targetRange.setFontStyles(sourceRange.getFontStyles());
    targetRange.setFontSizes(sourceRange.getFontSizes());
    targetRange.setHorizontalAlignments(sourceRange.getHorizontalAlignments());
    targetRange.setVerticalAlignments(sourceRange.getVerticalAlignments());
    targetRange.setWraps(sourceRange.getWraps());
  }

  function copyWeekAtoF(source, target) {
    const rowCount = Math.max(1, source.getLastRow());
    const sourceRange = source.getRange(1, 1, rowCount, 6);
    const targetRange = target.getRange(1, 1, rowCount, 6);
    copyBasicFormat(sourceRange, targetRange);

    const textValues = source.getRange(1, 1, rowCount, 3).getDisplayValues();
    const totalValues = source.getRange(1, 4, rowCount, 1).getValues().map(function (row) {
      return [numberOrBlank(row[0])];
    });
    const formulaRange = source.getRange(1, 5, rowCount, 2);
    const formulas = formulaRange.getFormulas();
    const fallbackValues = formulaRange.getDisplayValues();
    const formulaOrValues = formulas.map(function (row, rowIndex) {
      return row.map(function (formula, columnIndex) {
        return formula || fallbackValues[rowIndex][columnIndex] || "";
      });
    });

    target.getRange(1, 1, rowCount, 3).setValues(textValues);
    target.getRange(1, 4, rowCount, 1).setValues(totalValues).setNumberFormat("0");
    target.getRange(1, 5, rowCount, 2).setValues(formulaOrValues);

    for (let column = 1; column <= 6; column++) {
      try { target.setColumnWidth(column, source.getColumnWidth(column)); } catch (err) {}
    }
    try { target.setFrozenRows(source.getFrozenRows()); } catch (err) {}
  }

  function exportWeeksToExcel(payload) {
    payload = payload || {};
    const weekSource = Array.isArray(payload.weeks) ? payload.weeks : [payload.week || DEFAULT_WEEK];
    const weeks = Array.from(new Set(weekSource.map(function (item) { return Number(item); }).filter(function (item) { return isFinite(item) && item > 0; }))).sort(function (a, b) { return a - b; });
    if (!weeks.length) throw new Error("Chưa chọn tuần để xuất Excel.");

    const label = weeks.length === 1 ? ("Tuan_" + weeks[0]) : ("Tuan_" + weeks[0] + "-" + weeks[weeks.length - 1]);
    const baseName = "A3K64_Export_" + label + "_" + exportStamp();
    const fileName = baseName + ".xlsx";
    const temp = SpreadsheetApp.create(baseName);
    const tempId = temp.getId();

    try {
      const defaultSheet = temp.getSheets()[0];
      weeks.forEach(function (weekNumber, index) {
        const source = weekSheet(weekNumber);
        if (!source) throw new Error("Không tìm thấy TUẦN " + weekNumber);
        const target = index === 0 ? defaultSheet : temp.insertSheet();
        target.setName(("TUAN " + weekNumber).slice(0, 100));
        copyWeekAtoF(source, target);
      });

      SpreadsheetApp.flush();
      const excelBlob = DriveApp.getFileById(tempId).getAs(MimeType.MICROSOFT_EXCEL).setName(fileName);
      const folder = exportFolder();
      const file = folder.createFile(excelBlob).setName(fileName);
      const result = {
        ok: true,
        fileId: file.getId(),
        fileName: fileName,
        fileUrl: file.getUrl(),
        downloadUrl: file.getUrl(),
        folderUrl: folder.getUrl(),
        weeks: weeks,
        createdAt: exportDisplayStamp()
      };
      if (typeof log === "function") log("exportExcel", exportActor(payload), "Xuất Excel " + weeks.map(function (week) { return "TUẦN " + week; }).join(", "), result);
      return result;
    } finally {
      try { DriveApp.getFileById(tempId).setTrashed(true); } catch (err) {}
    }
  }

  routeAction = function (action, payload, params) {
    if (action === "exportWeeksToExcel") return { ok: true, data: exportWeeksToExcel(payload || {}) };
    return originalRouteAction(action, payload, params);
  };
})();

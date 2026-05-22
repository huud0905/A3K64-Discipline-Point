var __A3_EXPORT_EXCEL = __A3_EXPORT_EXCEL || {};

(function () {
  if (__A3_EXPORT_EXCEL.installed) return;
  if (typeof routeAction !== "function" || typeof weekSheet !== "function" || typeof txt !== "function") return;
  __A3_EXPORT_EXCEL.installed = true;

  const originalRouteAction = routeAction;
  const EXPORT_FOLDER_NAME = "export";

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

  function makeUniqueSheetName(ss, desired) {
    const base = String(desired || "TUAN").trim() || "TUAN";
    const exists = {};
    ss.getSheets().forEach(function (sheet) { exists[sheet.getName()] = true; });
    if (!exists[base]) return base;
    let index = 2;
    while (exists[base + " (" + index + ")"]) index++;
    return base + " (" + index + ")";
  }

  function buildFilename(weeks) {
    const clean = weeks.map(function (week) { return ("Tuan_" + week).replace(/[\\/:*?"<>|]+/g, "_"); });
    const head = clean.slice(0, 3).join("_");
    const tail = clean.length > 3 ? ("_va_" + (clean.length - 3) + "_tuan") : "";
    return "A3K64_Export_" + (head || "TongHop") + tail + "_" + exportStamp() + ".xlsx";
  }

  function sourceSpreadsheet() {
    if (typeof book === "function") return book();
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }

  function findLastDataRowByName(sheet) {
    const lastRow = Math.max(sheet.getLastRow(), 1);
    const values = sheet.getRange(1, 2, lastRow, 1).getDisplayValues();
    for (let i = values.length - 1; i >= 0; i--) {
      if (String(values[i][0] || "").trim() !== "") return i + 1;
    }
    return 1;
  }

  function trimSheetForExportAF(sheet, lastDataRow) {
    try {
      const maxColumns = sheet.getMaxColumns();
      if (maxColumns > 6) sheet.deleteColumns(7, maxColumns - 6);
    } catch (err) {}
    try {
      const maxRows = sheet.getMaxRows();
      if (maxRows > lastDataRow) sheet.deleteRows(lastDataRow + 1, maxRows - lastDataRow);
    } catch (err) {}
  }

  function freezeColumnDValues(sourceSheet, copiedSheet, lastDataRow) {
    try {
      const safeRows = Math.max(Number(lastDataRow || 0), 1);
      const sourceRange = sourceSheet.getRange(1, 4, safeRows, 1);
      const targetRange = copiedSheet.getRange(1, 4, safeRows, 1);
      targetRange.setValues(sourceRange.getValues());
      targetRange.setNumberFormats(sourceRange.getNumberFormats());
    } catch (err) {}
  }

  function prepareCopiedWeek(sourceSheet, copiedSheet) {
    const lastDataRow = findLastDataRowByName(sourceSheet || copiedSheet);
    freezeColumnDValues(sourceSheet || copiedSheet, copiedSheet, lastDataRow);
    trimSheetForExportAF(copiedSheet, lastDataRow);
  }

  function parentFolderOfSpreadsheet() {
    const sourceFile = DriveApp.getFileById(SPREADSHEET_ID);
    const parents = sourceFile.getParents();
    return parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  }

  function exportFolderBesideSpreadsheet() {
    const parent = parentFolderOfSpreadsheet();
    const folders = parent.getFoldersByName(EXPORT_FOLDER_NAME);
    return folders.hasNext() ? folders.next() : parent.createFolder(EXPORT_FOLDER_NAME);
  }

  function moveFileToFolder(fileId, folder) {
    if (!fileId || !folder) return;
    try {
      DriveApp.getFileById(fileId).moveTo(folder);
    } catch (err) {}
  }

  function exportTempSpreadsheetXlsx(tempId, fileName) {
    const url = "https://docs.google.com/spreadsheets/d/" + tempId + "/export?format=xlsx";
    const response = UrlFetchApp.fetch(url, {
      headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      throw new Error("Không xuất được XLSX (HTTP " + response.getResponseCode() + "): " + response.getContentText());
    }
    return response.getBlob().setName(fileName);
  }

  function saveBlobToExportFolder(blob, fileName, folder) {
    const targetFolder = folder || exportFolderBesideSpreadsheet();
    const file = targetFolder.createFile(blob).setName(fileName);
    return {
      fileId: file.getId(),
      fileUrl: file.getUrl(),
      downloadUrl: file.getUrl(),
      folderId: targetFolder.getId(),
      folderName: targetFolder.getName(),
      folderUrl: targetFolder.getUrl(),
      savedToDrive: true
    };
  }

  function exportWeeksToExcel(payload) {
    payload = payload || {};
    const weekSource = Array.isArray(payload.weeks) ? payload.weeks : [payload.week || DEFAULT_WEEK];
    const weeks = Array.from(new Set(weekSource.map(function (item) { return Number(item); }).filter(function (item) { return isFinite(item) && item > 0; }))).sort(function (a, b) { return a - b; });
    if (!weeks.length) throw new Error("Chưa chọn tuần để xuất Excel.");

    const sourceBook = sourceSpreadsheet();
    const fileName = buildFilename(weeks);
    const exportFolder = exportFolderBesideSpreadsheet();
    const temp = SpreadsheetApp.create("TMP_MULTI_EXPORT_" + exportStamp());
    const tempId = temp.getId();
    moveFileToFolder(tempId, exportFolder);
    let saveInfo = { savedToDrive: false, fileId: "", fileUrl: "", downloadUrl: "", folderId: exportFolder.getId(), folderName: exportFolder.getName(), folderUrl: exportFolder.getUrl() };

    try {
      const placeholder = temp.getSheets()[0];
      const addedSheets = [];

      weeks.forEach(function (weekNumber) {
        const source = sourceBook.getSheetByName("TUẦN " + weekNumber) || sourceBook.getSheetByName("Tuan " + weekNumber) || weekSheet(weekNumber);
        if (!source) throw new Error("Không tìm thấy TUẦN " + weekNumber);
        const copied = source.copyTo(temp);
        copied.setName(makeUniqueSheetName(temp, "TUAN " + weekNumber));
        prepareCopiedWeek(source, copied);
        addedSheets.push(copied.getName());
      });

      if (placeholder && temp.getSheets().length > 1) {
        try { temp.deleteSheet(placeholder); } catch (err) {}
      }
      if (addedSheets.length) {
        const first = temp.getSheetByName(addedSheets[0]);
        if (first) temp.setActiveSheet(first);
      }

      SpreadsheetApp.flush();
      const blob = exportTempSpreadsheetXlsx(tempId, fileName);
      try {
        saveInfo = saveBlobToExportFolder(blob.copyBlob ? blob.copyBlob() : blob, fileName, exportFolder);
      } catch (err) {
        saveInfo = { savedToDrive: false, fileId: "", fileUrl: "", downloadUrl: "", folderId: exportFolder.getId(), folderName: exportFolder.getName(), folderUrl: exportFolder.getUrl(), saveError: String(err && err.message ? err.message : err) };
      }

      const result = {
        ok: true,
        fileId: saveInfo.fileId || "",
        fileName: fileName,
        fileUrl: saveInfo.fileUrl || "",
        downloadUrl: saveInfo.downloadUrl || "",
        folderId: saveInfo.folderId || exportFolder.getId(),
        folderName: saveInfo.folderName || exportFolder.getName(),
        folderUrl: saveInfo.folderUrl || exportFolder.getUrl(),
        savedToDrive: !!saveInfo.savedToDrive,
        saveError: saveInfo.saveError || "",
        base64: Utilities.base64Encode(blob.getBytes()),
        weeks: weeks,
        createdAt: exportDisplayStamp(),
        message: "Đã xuất " + weeks.length + " tuần từ cột A đến F."
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

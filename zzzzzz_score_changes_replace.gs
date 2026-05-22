var __A3_SCORE_CHANGES_REPLACE = __A3_SCORE_CHANGES_REPLACE || {};

(function () {
  if (__A3_SCORE_CHANGES_REPLACE.installed) return;
  if (typeof routeAction !== "function") return;
  __A3_SCORE_CHANGES_REPLACE.installed = true;

  const previousRouteAction = routeAction;

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function visibleScoreEvents(studentIdValue, weekValue) {
    return eventsFromWeeks(students()).filter(function (event) {
      return event.studentId === studentIdValue && Number(event.week) === Number(weekValue) && !txt(event.note).includes(SHEET_TOTAL_NOTE);
    });
  }

  function parseSheetEvent(eventId) {
    const match = txt(eventId).match(/^w(\d+)r(\d+)[pm]\d+_/);
    if (!match) return null;
    return { week: Number(match[1]), sheetRow: Number(match[2]) + 1 };
  }

  function rowStudentId(sheet, config, sheetRow) {
    const name = sheet.getRange(sheetRow, config.nameCol + 1).getDisplayValue();
    const found = students().find(function (student) { return key(student.name) === key(name); });
    return found ? found.id : "";
  }

  function targetKey(weekValue, studentIdValue) {
    return Number(weekValue) + "::" + txt(studentIdValue);
  }

  function scoreEventFromAdd(event, actor) {
    const points = Number(event.points || 0);
    return {
      id: txt(event.id) || id("tmp"),
      studentId: txt(event.studentId),
      week: Number(event.week || DEFAULT_WEEK),
      title: txt(event.title),
      points: points,
      type: points >= 0 ? "CONG" : "TRU",
      category: txt(event.category) || cat(event.title),
      note: txt(event.note),
      createdBy: actor || txt(event.createdBy) || "Web",
      createdAt: txt(event.createdAt) || iso()
    };
  }

  function writeWholeStudentRow(weekValue, studentIdValue, finalEvents, actor) {
    const sheet = weekSheet(weekValue);
    if (!sheet) throw new Error("Khong tim thay TUAN " + weekValue);

    const config = scoreCfg(vals(sheet));
    if (!config) throw new Error("Khong tim thay bang cham");

    const info = findRow(sheet, config, txt(studentIdValue));
    if (!info) throw new Error("Khong tim thay hoc sinh");

    const row = info.row;
    const before = snap(sheet, row, config);
    const plusLines = [];
    const minusLines = [];
    let plus = 0;
    let minus = 0;

    finalEvents.forEach(function (event) {
      const points = Number(event.points || 0);
      const title = txt(event.title);
      if (!title || !isFinite(points) || points === 0) return;
      if (points > 0) {
        plusLines.push(title);
        plus += Math.abs(points);
      } else {
        minusLines.push(title);
        minus += Math.abs(points);
      }
    });

    sheet.getRange(row, config.plusTextCol + 1).setValue(plusLines.join("\n"));
    sheet.getRange(row, config.minusTextCol + 1).setValue(minusLines.join("\n"));
    sheet.getRange(row, config.plusTotalCol + 1).setValue(plus || "");
    sheet.getRange(row, config.minusTotalCol + 1).setValue(minus || "");
    const total = BASE_SCORE + plus - minus;
    sheet.getRange(row, config.totalCol + 1).setValue(total);
    sheet.getRange(row, config.statusCol + 1).setValue(status(total));
    if (config.editorCol !== undefined) {
      sheet.getRange(row, config.editorCol + 1).setValue((actor || "Web") + " - " + Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "HH:mm:ss dd/MM/yyyy"));
    }

    const after = snap(sheet, row, config);
    history(weekValue, txt(studentIdValue), info.name, "replaceScoreRow", before, after, actor || "Web", "replace row score");
    log("replaceScoreRow", actor || "Web", "Replace score row " + info.name, { week: weekValue, studentId: txt(studentIdValue), plus: plus, minus: minus });
  }

  function replaceScoreChanges(payload) {
    payload = payload || {};
    const actor = txt(payload.actorEmail || payload.actorName || payload.createdBy || "Web");
    const additions = asArray(payload.additions).map(function (event) { return scoreEventFromAdd(event || {}, actor); }).filter(function (event) { return event.studentId && event.title && event.points; });
    const deletions = asArray(payload.deletions).map(txt).filter(Boolean);
    const deletionSet = {};
    deletions.forEach(function (eventId) { deletionSet[eventId] = true; });

    const targets = {};
    additions.forEach(function (event) { targets[targetKey(event.week, event.studentId)] = { week: event.week, studentId: event.studentId }; });

    deletions.forEach(function (eventId) {
      const meta = parseSheetEvent(eventId);
      if (!meta) return;
      const sheet = weekSheet(meta.week);
      if (!sheet) return;
      const config = scoreCfg(vals(sheet));
      if (!config) return;
      const studentIdValue = rowStudentId(sheet, config, meta.sheetRow);
      if (studentIdValue) targets[targetKey(meta.week, studentIdValue)] = { week: meta.week, studentId: studentIdValue };
    });

    Object.keys(targets).forEach(function (keyValue) {
      const target = targets[keyValue];
      const current = visibleScoreEvents(target.studentId, target.week).filter(function (event) { return !deletionSet[event.id]; });
      const added = additions.filter(function (event) { return Number(event.week) === Number(target.week) && event.studentId === target.studentId; });
      writeWholeStudentRow(target.week, target.studentId, current.concat(added), actor);
    });

    SpreadsheetApp.flush();
    const scoreboard = getScoreboardData();
    return { ok: true, replaced: Object.keys(targets).length, events: scoreboard.events, scoreboard: scoreboard };
  }

  routeAction = function (action, payload, params) {
    if (action === "saveScoreChanges") return { ok: true, data: replaceScoreChanges(payload || {}) };
    return previousRouteAction(action, payload, params);
  };
})();

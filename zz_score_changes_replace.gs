var __A3_SCORE_CHANGES_REPLACE_V2 = __A3_SCORE_CHANGES_REPLACE_V2 || {};

(function () {
  if (__A3_SCORE_CHANGES_REPLACE_V2.installed) return;
  if (typeof routeAction !== "function") return;
  __A3_SCORE_CHANGES_REPLACE_V2.installed = true;

  const previousRouteAction = routeAction;

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function targetKey(weekValue, studentIdValue) {
    return Number(weekValue || DEFAULT_WEEK) + "::" + txt(studentIdValue);
  }

  function parseSheetEventId(eventId) {
    const match = txt(eventId).match(/^w(\d+)r(\d+)[pm]\d+_/);
    if (!match) return null;
    return {
      week: Number(match[1]),
      sheetRow: Number(match[2]) + 1
    };
  }

  function studentIdFromSheetRow(sheet, config, sheetRow) {
    const name = sheet.getRange(sheetRow, config.nameCol + 1).getDisplayValue();
    const found = students().find(function (student) {
      return key(student.name) === key(name);
    });
    return found ? found.id : "";
  }

  function isVisibleScoreEvent(event) {
    return event && !txt(event.note).includes(SHEET_TOTAL_NOTE);
  }

  function sameEvent(a, b) {
    return txt(a.studentId) === txt(b.studentId)
      && Number(a.week) === Number(b.week)
      && txt(a.title) === txt(b.title)
      && Number(a.points) === Number(b.points)
      && txt(a.note) === txt(b.note);
  }

  function normalizeIncomingEvent(event, actor) {
    event = event || {};
    const points = Number(event.points || 0);
    return {
      id: txt(event.id) || id("local"),
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

  function currentEventsForStudent(studentIdValue, weekValue) {
    return eventsFromWeeks(students()).filter(function (event) {
      return txt(event.studentId) === txt(studentIdValue)
        && Number(event.week) === Number(weekValue)
        && isVisibleScoreEvent(event);
    });
  }

  function writeStudentScoreRow(weekValue, studentIdValue, finalEvents, actor) {
    const sheet = weekSheet(weekValue);
    if (!sheet) throw new Error("Không tìm thấy TUẦN " + weekValue);

    const config = scoreCfg(vals(sheet));
    if (!config) throw new Error("Không tìm thấy bảng chấm");

    const info = findRow(sheet, config, txt(studentIdValue));
    if (!info) throw new Error("Không tìm thấy học sinh");

    const row = info.row;
    const before = snap(sheet, row, config);
    const plusLines = [];
    const minusLines = [];
    let plus = 0;
    let minus = 0;

    finalEvents.forEach(function (event) {
      const title = txt(event.title);
      const points = Number(event.points || 0);
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
    history(weekValue, txt(studentIdValue), info.name, "replaceScoreRow", before, after, actor || "Web", "replace whole score row");
    log("replaceScoreRow", actor || "Web", "Replace score row " + info.name, { week: weekValue, studentId: txt(studentIdValue), plus: plus, minus: minus });
  }

  function saveScoreChanges(payload) {
    payload = payload || {};
    const actor = txt(payload.actorEmail || payload.actorName || payload.createdBy || "Web");
    const additions = asArray(payload.additions).map(function (event) {
      return normalizeIncomingEvent(event, actor);
    }).filter(function (event) {
      return event.studentId && event.title && isFinite(event.points) && event.points !== 0;
    });
    const deletions = asArray(payload.deletions).map(txt).filter(Boolean);
    const deletionSet = {};
    deletions.forEach(function (eventId) { deletionSet[eventId] = true; });

    const targets = {};

    additions.forEach(function (event) {
      targets[targetKey(event.week, event.studentId)] = { week: event.week, studentId: event.studentId };
    });

    deletions.forEach(function (eventId) {
      const meta = parseSheetEventId(eventId);
      if (!meta) return;
      const sheet = weekSheet(meta.week);
      if (!sheet) return;
      const config = scoreCfg(vals(sheet));
      if (!config) return;
      const studentIdValue = studentIdFromSheetRow(sheet, config, meta.sheetRow);
      if (studentIdValue) targets[targetKey(meta.week, studentIdValue)] = { week: meta.week, studentId: studentIdValue };
    });

    Object.keys(targets).forEach(function (targetId) {
      const target = targets[targetId];
      const current = currentEventsForStudent(target.studentId, target.week).filter(function (event) {
        return !deletionSet[event.id];
      });
      const addForTarget = additions.filter(function (event) {
        return Number(event.week) === Number(target.week) && txt(event.studentId) === txt(target.studentId);
      });
      const finalEvents = current.slice();
      addForTarget.forEach(function (event) {
        if (!finalEvents.some(function (existing) { return sameEvent(existing, event); })) finalEvents.push(event);
      });
      writeStudentScoreRow(target.week, target.studentId, finalEvents, actor);
    });

    SpreadsheetApp.flush();
    const scoreboard = getScoreboardData();
    return {
      ok: true,
      replaced: Object.keys(targets).length,
      events: scoreboard.events,
      scoreboard: scoreboard
    };
  }

  routeAction = function (action, payload, params) {
    if (action === "saveScoreChanges") {
      const lock = LockService.getScriptLock();
      try {
        lock.waitLock(30000);
        return { ok: true, data: saveScoreChanges(payload || {}) };
      } finally {
        try { lock.releaseLock(); } catch (err) {}
      }
    }
    return previousRouteAction(action, payload, params);
  };
})();

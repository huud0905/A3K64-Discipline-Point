var __A3_SCORE_CHANGES_BATCH = __A3_SCORE_CHANGES_BATCH || {};

(function () {
  if (__A3_SCORE_CHANGES_BATCH.installed) return;
  if (typeof routeAction !== "function") return;
  __A3_SCORE_CHANGES_BATCH.installed = true;

  const previousRouteAction = routeAction;

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function saveScoreChanges(payload) {
    payload = payload || {};
    const additions = asArray(payload.additions);
    const deletions = asArray(payload.deletions);
    const actor = txt(payload.actorEmail || payload.actorName || payload.createdBy || "Web");
    const lock = LockService.getScriptLock();

    try {
      lock.waitLock(30000);
    } catch (err) {
      throw new Error("Hệ thống đang lưu điểm, vui lòng thử lại sau vài giây.");
    }

    try {
      const deleted = [];
      deletions.forEach(function (eventId) {
        const idValue = txt(eventId);
        if (!idValue) return;
        deleted.push(deleteScoreEvent(idValue));
      });

      const groups = {};
      additions.forEach(function (event) {
        event = event || {};
        const week = Number(event.week || DEFAULT_WEEK);
        const studentIdValue = txt(event.studentId);
        const title = txt(event.title);
        const points = Number(event.points || 0);
        if (!studentIdValue || !title || !isFinite(points) || points === 0) return;
        const keyValue = week + "::" + studentIdValue;
        if (!groups[keyValue]) groups[keyValue] = { week: week, studentId: studentIdValue, events: [] };
        groups[keyValue].events.push(Object.assign({}, event, { week: week, studentId: studentIdValue, title: title, points: points }));
      });

      const savedEvents = [];
      Object.keys(groups).forEach(function (keyValue) {
        const group = groups[keyValue];
        savedEvents.push.apply(savedEvents, addScoreEventsGrouped(group.week, group.studentId, group.events, actor));
      });

      SpreadsheetApp.flush();
      return {
        ok: true,
        saved: savedEvents.length,
        deleted: deleted.length,
        events: savedEvents,
        scoreboard: getScoreboardData()
      };
    } finally {
      try { lock.releaseLock(); } catch (err) {}
    }
  }

  function addScoreEventsGrouped(week, studentIdValue, eventList, actor) {
    const sheet = weekSheet(week);
    if (!sheet) throw new Error("Không tìm thấy TUẦN " + week);

    const config = scoreCfg(vals(sheet));
    if (!config) throw new Error("Không tìm thấy bảng chấm");

    const info = findRow(sheet, config, txt(studentIdValue));
    if (!info) throw new Error("Không tìm thấy học sinh");

    const row = info.row;
    const before = snap(sheet, row, config);
    const plusTextCell = sheet.getRange(row, config.plusTextCol + 1);
    const plusTotalCell = sheet.getRange(row, config.plusTotalCol + 1);
    const minusTextCell = sheet.getRange(row, config.minusTextCol + 1);
    const minusTotalCell = sheet.getRange(row, config.minusTotalCol + 1);
    const totalCell = sheet.getRange(row, config.totalCol + 1);
    const statusCell = sheet.getRange(row, config.statusCol + 1);
    const editorCell = config.editorCol !== undefined ? sheet.getRange(row, config.editorCol + 1) : null;

    let plus = num(plusTotalCell.getDisplayValue());
    if (!isFinite(plus)) plus = 0;
    let minus = num(minusTotalCell.getDisplayValue());
    if (!isFinite(minus)) minus = 0;

    const plusLines = [];
    const minusLines = [];
    const savedEvents = [];

    eventList.forEach(function (event) {
      const points = Number(event.points || 0);
      const title = txt(event.title);
      if (!title || !isFinite(points) || points === 0) return;

      if (points >= 0) {
        plusLines.push(title);
        plus += Math.abs(points);
      } else {
        minusLines.push(title);
        minus += Math.abs(points);
      }

      savedEvents.push({
        id: id("e"),
        studentId: txt(studentIdValue),
        week: week,
        title: title,
        points: points,
        type: points >= 0 ? "CONG" : "TRU",
        category: txt(event.category) || cat(title),
        note: txt(event.note),
        createdBy: actor || "Web",
        createdAt: txt(event.createdAt) || iso()
      });
    });

    if (plusLines.length) plusTextCell.setValue(addLine(plusTextCell.getDisplayValue(), plusLines.join("\n")));
    if (minusLines.length) minusTextCell.setValue(addLine(minusTextCell.getDisplayValue(), minusLines.join("\n")));

    plusTotalCell.setValue(plus || "");
    minusTotalCell.setValue(minus || "");
    const total = BASE_SCORE + plus - minus;
    totalCell.setValue(total);
    statusCell.setValue(status(total));
    if (editorCell) editorCell.setValue((actor || "Web") + " - " + Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "HH:mm:ss dd/MM/yyyy"));

    const after = snap(sheet, row, config);
    history(week, txt(studentIdValue), info.name, "batchScore", before, after, actor || "Web", savedEvents.map(function (event) { return event.title; }).join(" | "));
    log("batchScore", actor || "Web", "Chấm " + savedEvents.length + " mục cho " + info.name, { studentId: txt(studentIdValue), week: week, count: savedEvents.length });

    return savedEvents;
  }

  routeAction = function (action, payload, params) {
    if (action === "saveScoreChanges") return { ok: true, data: saveScoreChanges(payload || {}) };
    return previousRouteAction(action, payload, params);
  };
})();

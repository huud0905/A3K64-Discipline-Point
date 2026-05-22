var __A3_SCORE_SAVE_LOCK = __A3_SCORE_SAVE_LOCK || {};

(function () {
  if (__A3_SCORE_SAVE_LOCK.installed) return;
  if (typeof routeAction !== "function") return;
  __A3_SCORE_SAVE_LOCK.installed = true;

  const originalRouteAction = routeAction;
  const LOCKED_ACTIONS = {
    addScoreEvent: true,
    deleteScoreEvent: true,
    bulkScore: true,
    createWeek: true
  };

  function runWithScoreLock(action, fn) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(30000);
    } catch (err) {
      throw new Error("Hệ thống đang lưu điểm, vui lòng thử lại sau vài giây.");
    }

    try {
      SpreadsheetApp.flush();
      const result = fn();
      SpreadsheetApp.flush();
      return result;
    } finally {
      try { lock.releaseLock(); } catch (err) {}
    }
  }

  routeAction = function (action, payload, params) {
    if (LOCKED_ACTIONS[action]) {
      return runWithScoreLock(action, function () {
        return originalRouteAction(action, payload, params);
      });
    }
    return originalRouteAction(action, payload, params);
  };
})();

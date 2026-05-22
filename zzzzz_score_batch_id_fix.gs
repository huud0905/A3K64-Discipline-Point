var __A3_SCORE_BATCH_ID_FIX = __A3_SCORE_BATCH_ID_FIX || {};

(function () {
  if (__A3_SCORE_BATCH_ID_FIX.installed) return;
  if (typeof routeAction !== "function") return;
  __A3_SCORE_BATCH_ID_FIX.installed = true;

  const prevRouteAction = routeAction;

  routeAction = function (action, payload, params) {
    const result = prevRouteAction(action, payload, params);
    if (action !== "saveScoreChanges") return result;

    try {
      const data = result && result.data ? result.data : result;
      if (data && data.scoreboard && data.scoreboard.events) {
        data.events = data.scoreboard.events;
      }
    } catch (err) {}

    return result;
  };
})();

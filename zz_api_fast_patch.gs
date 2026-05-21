var __A3_FAST = __A3_FAST || {};

(function () {
  if (__A3_FAST.installed) return;
  if (typeof book !== "function" || typeof vals !== "function" || typeof getScoreboardData !== "function") return;
  __A3_FAST.installed = true;
  __A3_FAST.ttlSeconds = 20;
  __A3_FAST.memory = {};

  function nowMs() {
    return Date.now ? Date.now() : new Date().getTime();
  }

  function cacheKey(prefix, value) {
    return "a3k64_" + prefix + "_" + String(value || "main");
  }

  function clearMemory() {
    __A3_FAST.memory = {};
  }

  function clearPersistent() {
    try {
      CacheService.getScriptCache().removeAll([
        cacheKey("scoreboard", "main"),
        cacheKey("rules", "main"),
        cacheKey("accounts", "main")
      ]);
    } catch (err) {}
  }

  function invalidateAll() {
    clearMemory();
    clearPersistent();
  }

  function getCachedJson(name) {
    try {
      const text = CacheService.getScriptCache().get(cacheKey(name, "main"));
      return text ? JSON.parse(text) : null;
    } catch (err) {
      return null;
    }
  }

  function putCachedJson(name, value, seconds) {
    try {
      const text = JSON.stringify(value);
      if (text.length < 90000) CacheService.getScriptCache().put(cacheKey(name, "main"), text, seconds || __A3_FAST.ttlSeconds);
    } catch (err) {}
  }

  const originalBook = book;
  const originalVals = vals;
  const originalWeekSheets = weekSheets;
  const originalWeekSheet = weekSheet;
  const originalStudents = students;
  const originalReadRules = readRules;
  const originalAccounts = accounts;
  const originalGetScoreboardData = getScoreboardData;
  const originalEventsFromWeeks = eventsFromWeeks;
  const originalAddScoreEvent = addScoreEvent;
  const originalDeleteScoreEvent = deleteScoreEvent;
  const originalBulkScore = bulkScore;
  const originalCreateWeek = createWeek;
  const originalResetPassword = resetPassword;
  const originalSavePersonalization = savePersonalization;
  const originalCreateRequest = createRequest;
  const originalResolveRequest = resolveRequest;

  book = function () {
    if (!__A3_FAST.memory.book) __A3_FAST.memory.book = originalBook();
    return __A3_FAST.memory.book;
  };

  vals = function (sheet) {
    if (!sheet) return [];
    const id = String(sheet.getSheetId ? sheet.getSheetId() : sheet.getName());
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    if (lastRow < 1 || lastColumn < 1) return [];

    const keyName = "vals_" + id + "_" + lastRow + "_" + lastColumn;
    if (!__A3_FAST.memory[keyName]) {
      __A3_FAST.memory[keyName] = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
    }
    return __A3_FAST.memory[keyName];
  };

  weekSheets = function () {
    if (!__A3_FAST.memory.weekSheets) __A3_FAST.memory.weekSheets = originalWeekSheets();
    return __A3_FAST.memory.weekSheets;
  };

  weekSheet = function (week) {
    const weekNumber = Number(week || DEFAULT_WEEK);
    const keyName = "weekSheet_" + weekNumber;
    if (!__A3_FAST.memory[keyName]) __A3_FAST.memory[keyName] = originalWeekSheet(weekNumber);
    return __A3_FAST.memory[keyName];
  };

  students = function () {
    if (!__A3_FAST.memory.students) __A3_FAST.memory.students = originalStudents();
    return __A3_FAST.memory.students;
  };

  readRules = function () {
    if (__A3_FAST.memory.rules) return __A3_FAST.memory.rules;
    const persistent = getCachedJson("rules");
    if (persistent) {
      __A3_FAST.memory.rules = persistent;
      return persistent;
    }
    const result = originalReadRules();
    __A3_FAST.memory.rules = result;
    putCachedJson("rules", result, 120);
    return result;
  };

  accounts = function () {
    if (__A3_FAST.memory.accounts) return __A3_FAST.memory.accounts;
    const persistent = getCachedJson("accounts");
    if (persistent) {
      __A3_FAST.memory.accounts = persistent;
      return persistent;
    }
    const result = originalAccounts();
    __A3_FAST.memory.accounts = result;
    putCachedJson("accounts", result, 60);
    return result;
  };

  eventsFromWeeks = function (studentList) {
    const events = [];
    const studentByName = {};
    (studentList || []).forEach(function (student) {
      studentByName[key(student.name)] = student;
    });

    weekSheets().forEach(function (week) {
      const values = vals(week.sheet);
      const config = scoreCfg(values);
      if (!config) return;

      for (let row = config.headerIndex + 1; row < values.length; row++) {
        if (!isStudent(values[row], config)) continue;
        const student = studentByName[key(values[row][config.nameCol])];
        if (!student) continue;

        const plusText = txt(values[row][config.plusTextCol]);
        const minusText = txt(values[row][config.minusTextCol]);
        const plusRaw = num(values[row][config.plusTotalCol]);
        const minusRaw = num(values[row][config.minusTotalCol]);
        let plusTotal = isFinite(plusRaw) ? Math.abs(plusRaw) : 0;
        let minusTotal = isFinite(minusRaw) ? Math.abs(minusRaw) : 0;
        let total = num(values[row][config.totalCol]);
        if (!isFinite(total)) total = BASE_SCORE + plusTotal - minusTotal;

        const studentStatus = status(total);
        let visibleScore = 0;
        visibleScore += cellEvents(events, student.id, week.week, row, "w" + week.week + "r" + row + "p", plusText, plusTotal, true);
        visibleScore += cellEvents(events, student.id, week.week, row, "w" + week.week + "r" + row + "m", minusText, minusTotal, false);
        events.push(makeEvent("w" + week.week + "r" + row + "t", student.id, week.week, "Tổng điểm từ trang tính", total - visibleScore, "HOC_TAP", SHEET_TOTAL_NOTE + ";status=" + studentStatus));
      }
    });

    return events;
  };

  getScoreboardData = function () {
    if (__A3_FAST.memory.scoreboard) return __A3_FAST.memory.scoreboard;
    const persistent = getCachedJson("scoreboard");
    if (persistent) {
      __A3_FAST.memory.scoreboard = persistent;
      return persistent;
    }

    const result = originalGetScoreboardData();
    __A3_FAST.memory.scoreboard = result;
    putCachedJson("scoreboard", result, __A3_FAST.ttlSeconds);
    return result;
  };

  function wrapMutation(original) {
    return function () {
      clearMemory();
      const result = original.apply(this, arguments);
      invalidateAll();
      return result;
    };
  }

  addScoreEvent = wrapMutation(originalAddScoreEvent);
  deleteScoreEvent = wrapMutation(originalDeleteScoreEvent);
  bulkScore = wrapMutation(originalBulkScore);
  createWeek = wrapMutation(originalCreateWeek);
  resetPassword = wrapMutation(originalResetPassword);
  savePersonalization = wrapMutation(originalSavePersonalization);
  createRequest = wrapMutation(originalCreateRequest);
  resolveRequest = wrapMutation(originalResolveRequest);
})();

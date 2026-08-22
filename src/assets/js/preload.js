/* ============================================================
   A3K64 — Preload toàn hệ thống ngay sau login
   ------------------------------------------------------------
   Mục tiêu: fetch song song TẤT CẢ dữ liệu cần thiết ngay khi
   người dùng đăng nhập xong, ghi vào đúng cache key mà từng
   module đang đọc. Khi các cửa sổ mở ra, chúng đọc cache ngay
   lập tức → không phải chờ fetch nữa.

   Cách dùng:
     1. Copy file này vào assets/js/preload.js
     2. Trong login.html, thêm <script src="../assets/js/preload.js"></script>
        (đặt TRƯỚC script inline login — hoặc bất cứ đâu trong <body>)
     3. Sau khi login thành công, thay dòng gọi prefetchScoreboardData()
        bằng: A3K64Preload.run(gasUrl, userObject);

   File này KHÔNG block việc chuyển trang — chạy nền hoàn toàn.
   Nếu một API fail thì chỉ module đó không có cache, không ảnh
   hưởng gì đến các module còn lại.
   ============================================================ */

(function (global) {
  'use strict';

  /* ──────────────────────────────────────────────────────────
     CACHE KEYS — phải khớp 100% với key mà từng module đang dùng
     ────────────────────────────────────────────────────────── */

  // login.html preview (panel trái trang đăng nhập)
  const KEY_LOGIN_PREVIEW   = 'a3k64-scoreboard-cache-v2';

  // scoreboard.js (cửa sổ bảng điểm chính)
  const KEY_SCOREBOARD_DATA = 'a3k64-scoreboard-data-cache-v1';

  // seating.js (cửa sổ sơ đồ chỗ ngồi)
  // seating dùng localStorage thuần (không có sessionStorage layer),
  // key DB chứa danh sách sơ đồ trả về từ listSeatingCharts
  const KEY_SEATING_DB      = 'a3k64-seating-sheet-local-db-v1';

  // scoreboard.js — fetchRulesFromGas() đọc raw rules (VI_PHAM) từ đây
  // trước khi tự gọi GAS. Lưu RAW (chưa normalize) vì logic normalize
  // (normalizeRuleType/normalizeRuleCategory) nằm trong scoreboard.js,
  // preload.js không có quyền truy cập các hàm đó.
  const KEY_RULES_RAW       = 'a3k64-rules-cache-v1';

  /* ──────────────────────────────────────────────────────────
     SAFE STORAGE — không crash dù storage bị chặn / đầy
     ────────────────────────────────────────────────────────── */
  function safeSet(storage, key, value) {
    try { storage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); }
    catch (e) { console.warn('[Preload] Không ghi được "' + key + '":', e); }
  }

  /* ──────────────────────────────────────────────────────────
     GAS FETCH HELPERS
     ────────────────────────────────────────────────────────── */

  /** GET request tới GAS với action param */
  function gasGet(gasUrl, params) {
    try {
      const url = new URL(gasUrl);
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
      return fetch(url.toString(), { method: 'GET', redirect: 'follow' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  /** Trích data từ envelope GAS { ok, data } hoặc trả về json trực tiếp */
  function unwrap(json) {
    if (!json) return null;
    return json?.data ?? json;
  }

  /* ──────────────────────────────────────────────────────────
     WRITERS — ghi đúng format mà từng module expect
     ────────────────────────────────────────────────────────── */

  /** Ghi scoreboard vào CẢ HAI cache key (login preview + app thật) */
  function writeScoreboardCache(remote) {
    if (!remote?.students?.length) return;

    // login preview format: { savedAt, remote }
    const loginPayload = { savedAt: Date.now(), remote };
    safeSet(sessionStorage, KEY_LOGIN_PREVIEW, loginPayload);
    safeSet(localStorage,   KEY_LOGIN_PREVIEW, loginPayload);

    // scoreboard.js format: { savedAt, remote }  (readDataCache expects same shape)
    const appPayload = { savedAt: Date.now(), remote };
    safeSet(sessionStorage, KEY_SCOREBOARD_DATA, appPayload);
    safeSet(localStorage,   KEY_SCOREBOARD_DATA, appPayload);   // chia sẻ sang cửa sổ khác
  }

  /** Ghi seating chart list vào DB key mà seating.js đọc (readDb / writeDb)
   *
   * QUAN TRỌNG: action `listSeatingCharts` ở backend CHỈ trả metadata
   * (id, title, active, createdAt, updatedAt, createdBy, version) — KHÔNG
   * có `layout.seats` / `layout.room` (chỉ `getSeatingChart` mới trả layout
   * đầy đủ — xem A3SeatFinal_chartFromRow_ vs. listSeatingCharts trong
   * api.gs). Nếu ghi đè thẳng { items } bằng list metadata-only này thì sẽ
   * XOÁ MẤT layout đầy đủ mà seating.js đã cache từ lần mở sơ đồ trước đó
   * (ensureDb/saveSheet/applySheet đều ghi kèm layout.seats+room) — đây
   * chính là lý do mỗi lần reload/login lại, sơ đồ hiện trắng vài giây
   * trước khi boot() gọi xong getSeatingChart() thật.
   *
   * Fix: đọc DB cũ ra, merge — giữ nguyên layout cũ cho item nào đã có,
   * chỉ cập nhật phần metadata (title/active/updatedAt/...) từ list mới.
   * Item hoàn toàn mới (chưa từng cache) thì vẫn không có layout — bình
   * thường, seating.js sẽ tự gasGetChart() khi cần (xem applySheet()).
   */
  function writeSeatingCache(items) {
    if (!Array.isArray(items) || !items.length) return;

    let oldItems = [];
    try {
      const raw = JSON.parse(localStorage.getItem(KEY_SEATING_DB) || '{}');
      oldItems = Array.isArray(raw.items) ? raw.items : [];
    } catch (e) { oldItems = []; }

    const oldById = {};
    oldItems.forEach(function (it) { if (it && it.id) oldById[it.id] = it; });

    const merged = items.map(function (meta) {
      const old = oldById[meta.id];
      return Object.assign({}, meta, (old && old.layout) ? { layout: old.layout } : {});
    });

    // writeDb() trong seating.js: localStorage.setItem(SEAT_DB_KEY, JSON.stringify({ items }))
    safeSet(localStorage, KEY_SEATING_DB, { items: merged });
  }

  /** Ghi rules raw vào cache mà fetchRulesFromGas() trong scoreboard.js đọc */
  function writeRulesCache(raw) {
    if (!Array.isArray(raw) || !raw.length) return;
    // format phải khớp readRulesRawCache() trong scoreboard.js: { savedAt, raw }
    const rulesPayload = { savedAt: Date.now(), raw };
    safeSet(sessionStorage, KEY_RULES_RAW, rulesPayload);
    safeSet(localStorage,   KEY_RULES_RAW, rulesPayload);       // chia sẻ sang cửa sổ khác
  }

  /* ──────────────────────────────────────────────────────────
     CORE: chạy toàn bộ prefetch song song
     ────────────────────────────────────────────────────────── */

  /**
   * Gọi hàm này ngay sau khi login thành công.
   *
   * @param {string} gasUrl  — URL GAS Web App (từ A3K64_CONFIG.gasUrl)
   * @param {object} user    — Object user từ sessionStorage a3k64-user
   */
  function run(gasUrl, user) {
    if (!gasUrl) {
      console.warn('[Preload] Không có gasUrl — bỏ qua prefetch.');
      return;
    }

    const role      = user?.role || 'hoc_sinh';
    const group     = user?.group ?? user?.to ?? '';
    const startTime = Date.now();

    console.log('[Preload] Bắt đầu prefetch song song…');

    // ── Task 1: Scoreboard data ──────────────────────────────
    const taskScoreboard = gasGet(gasUrl, { action: 'getScoreboard' })
      .then(function (json) {
        const remote = unwrap(json);
        if (remote?.students?.length) {
          writeScoreboardCache(remote);
          console.log('[Preload] ✓ Scoreboard (' + (Date.now() - startTime) + 'ms)');
        }
      })
      .catch(function (e) { console.warn('[Preload] Scoreboard fail:', e); });

    // ── Task 2: Seating chart list ───────────────────────────
    const taskSeating = gasGet(gasUrl, { action: 'listSeatingCharts', role })
      .then(function (json) {
        const data = unwrap(json);
        const items = Array.isArray(data) ? data : data?.items ?? data?.charts ?? [];
        if (items.length) {
          writeSeatingCache(items);
          console.log('[Preload] ✓ Seating list (' + (Date.now() - startTime) + 'ms)');
        }
      })
      .catch(function (e) { console.warn('[Preload] Seating fail:', e); });

    // ── Task 3: Rules (VI_PHAM) ───────────────────────────────
    const taskRules = gasGet(gasUrl, { action: 'getRules' })
      .then(function (json) {
        const data = unwrap(json);
        const raw = Array.isArray(data) ? data : data?.rules ?? data?.quickScoreReasons ?? [];
        if (Array.isArray(raw) && raw.length) {
          writeRulesCache(raw);
          console.log('[Preload] ✓ Rules (' + (Date.now() - startTime) + 'ms)');
        }
      })
      .catch(function (e) { console.warn('[Preload] Rules fail:', e); });

    // ── Tổng hợp: log khi xong hết, trả về Promise để caller có thể await ──
    return Promise.allSettled([taskScoreboard, taskSeating, taskRules]).then(function (results) {
      const ok  = results.filter(r => r.status === 'fulfilled').length;
      const all = results.length;
      console.log('[Preload] Hoàn thành ' + ok + '/' + all + ' tasks (' + (Date.now() - startTime) + 'ms tổng)');
    });
  }

  /* ──────────────────────────────────────────────────────────
     EXPORT
     ────────────────────────────────────────────────────────── */
  global.A3K64Preload = { run };

})(window);
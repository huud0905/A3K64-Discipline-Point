/* ============================================================
   A3K64 — Tổng kết (tuần a → b)
   - Dữ liệu 100% từ backend (action getSummaryReport / summaryAi), KHÔNG tính lại ở trình duyệt:
     điểm TB, xếp loại, vị thứ đều do server tính theo ngưỡng của từng lớp.
   - GVCN / lớp trưởng / bí thư / tổ trưởng: xem cả bảng. Học sinh: chỉ thấy kết quả của mình.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- tiện ích ---------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var nf = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
  var fmt = function (v) { return nf.format(v); };
  var sgn = function (v) { return (v > 0 ? '+' : '') + fmt(v); };
  var RANGE_KEY = 'a3k64-summary-range';
  // Ẩn/hiện: danh sách mục GVCN có thể tắt (lưu theo trình duyệt). [khóa, nhãn]
  var HIDE_KEY = 'a3k64-summary-hide';
  var HIDE_ITEMS = [
    ['total', 'Tổng'],
    ['weeks', 'Điểm từng tuần'],
    ['avg', 'TBC'],
    ['rank', 'Vị thứ'],
    ['grade', 'Xếp loại'],
  ];
  function loadHide() {
    var out = {};
    try {
      var h = JSON.parse(localStorage.getItem(HIDE_KEY) || '{}') || {};
      HIDE_ITEMS.forEach(function (it) { if (h[it[0]]) out[it[0]] = true; });   // bỏ các khóa cũ không còn trong danh sách
    } catch (e) {}
    return out;
  }
  function saveHide() { try { localStorage.setItem(HIDE_KEY, JSON.stringify(state.hide)); } catch (e) {} }
  // Chỉ áp dụng cho người xem được cả bảng (học sinh luôn thấy đủ phần của mình).
  function hid(k) { return !!(state.data && state.data.canViewAll && state.hide[k]); }
  // Ribbon (thanh công cụ gom theo tab, kiểu Excel): nhớ trạng thái thu gọn theo trình duyệt.
  var RIB_KEY = 'a3k64-summary-ribbon-fold';
  function loadFold() { try { return localStorage.getItem(RIB_KEY) === '1'; } catch (e) { return false; } }
  function saveFold() { try { localStorage.setItem(RIB_KEY, state.rcol ? '1' : '0'); } catch (e) {} }

  var state = {
    data: null,          // kết quả getSummaryReport
    from: 0, to: 0,      // khoảng tuần đang chọn
    grade: '',           // lọc theo xếp loại (chip)
    group: '',           // lọc theo tổ
    q: '',               // tìm theo tên
    sort: { key: 'rank', dir: 1 },
    cmp: { on: false, a: { from: 0, to: 0 }, b: { from: 0, to: 0 } },   // so sánh 2 kỳ: a = kỳ đầu, b = kỳ sau
    view: 'table',       // 'table' | 'charts' (chỉ người xem được cả bảng mới đổi được)
    hide: loadHide(),    // mục đang ẩn: { avg: true, ... }
    selected: '',        // id học sinh đang mở chi tiết
    tab: 'ai',           // tab đang mở ở cột phải (màn rộng): 'detail' | 'ai'
    loading: false,
    rtab: 'home',        // tab đang mở trên ribbon: 'home' | 'data' | 'view' | 'ai'
    rcol: loadFold(),    // ribbon đang thu gọn (chỉ còn hàng tab)
    ropen: false,        // đang thu gọn nhưng bấm tab để xem tạm
    aiBusy: false,
    tier: null,          // gói đang dùng: null (chưa biết → để server quyết định) | 'free' | 'plus' | 'max'
  };
  /* ---------- gói trả phí (khoá tính năng) ----------
     Miễn phí: chỉ xem Tổng kết dạng bảng (trang đầu).
     Plus: + xuất Excel, In, AI nhận xét học sinh / cả lớp / ai tiến bộ-sa sút (tính vào 100 lượt AI/tháng).
     Max: + biểu đồ (và mở rộng từng biểu đồ), hỏi AI tự do, so sánh 2 kỳ & Tăng hạng.
     Server kiểm tra lại các tính năng AI và So sánh 2 kỳ; Biểu đồ / Xuất Excel / In chạy ngay trên trình duyệt nên chỉ khoá ở giao diện. */
  var TIER_RANK = { free: 0, plus: 1, max: 2 };
  function allowed(need) { return state.tier == null || TIER_RANK[state.tier] >= TIER_RANK[need]; }
  var lockMark = function (need) { return allowed(need) ? '' : ' <span class="rb-lock" title="Cần gói ' + (need === 'max' ? 'Max' : 'Plus trở lên') + '">🔒</span>'; };
  // state.tier là bản CACHE lúc mở trang: mua gói xong (hoặc bạn khác trong lớp mua) mà chưa tải lại thì nó vẫn cũ.
  // Nên khi thấy "bị khoá" thì hỏi lại server trước, chỉ hiện bảng nâng cấp nếu server cũng xác nhận chưa đủ gói.
  var tierChecking = false, tierReplayEl = null, tierReplayAt = 0;
  function needTier(need, what) {
    if (allowed(need)) return true;
    var m = what + ' thuộc gói ' + (need === 'max' ? 'Max' : 'Plus trở lên') + '.';
    if (!window.A3AI || !window.A3AI.getEntitlements) { toast(m, true); return false; }
    if (tierChecking) return false;
    tierChecking = true;
    var replay = (Date.now() - tierReplayAt < 1000) ? tierReplayEl : null; tierReplayEl = null;   // chỉ chạy lại nếu vừa bấm nút xong
    loadTier().then(function () {
      tierChecking = false;
      if (allowed(need)) {                       // server xác nhận đã đủ gói → chạy lại đúng thao tác vừa bấm
        if (replay && replay.isConnected) replay.click(); else toast('Gói của lớp đã được cập nhật, hãy bấm lại.');
      } else if (window.A3AI.showUpgrade) window.A3AI.showUpgrade(m); else toast(m, true);
    });
    return false;
  }
  // Bậc gói từ getEntitlements. Ưu tiên cờ tier_* của backend; nếu backend (bản cũ) chưa trả cờ này thì suy từ tên gói của lớp.
  function tierFromEnt(e) {
    var f = e.features || {};
    if (f.tier_max) return 'max';
    if (f.tier_plus) return 'plus';
    var p = String((e.classPlan && e.classPlan.plan) || (e.aiFreeUsage && e.aiFreeUsage.plan) || '').toLowerCase().trim();
    if (p === 'max' || p === 'pro' || f.premium_ui) return 'max';
    if (p === 'plus') return 'plus';
    return 'free';
  }
  async function loadTier() {
    if (!window.A3AI || !window.A3AI.getEntitlements) return;
    var e = await window.A3AI.getEntitlements();
    if (!e || !e.ok || !e.features) return;
    var next = tierFromEnt(e);
    var changed = next !== state.tier;
    state.tier = next;
    if (changed && state.data) renderFilters(true);
    // gói hạ xuống thì bỏ chế độ so sánh đang bật từ phiên trước
    if (state.cmp.on && !allowed('max')) { state.cmp.on = false; saveRange(); if (state.data) load(state.from, state.to); }
    if (state.view === 'charts' && !allowed('max')) setView('table');
  }
  function openChart(key) { if (needTier('max', 'Mở rộng biểu đồ và công cụ riêng của từng biểu đồ') && window.SMCharts) window.SMCharts.open(key); }

  var wideMQ = window.matchMedia('(min-width:1100px)');
  var isWide = function () { return wideMQ.matches; };   // màn rộng: chi tiết nằm ở cột phải, màn hẹp: ngăn kéo
  var reqSeq = 0;        // chống kết quả cũ ghi đè kết quả mới khi đổi tuần liên tục
  var debounceT = null;

  /* ---------- gọi backend ---------- */
  function readToken() {
    try { var s = sessionStorage.getItem('a3k64-session-token'); if (s) return s; } catch (e) {}
    try {
      var l = JSON.parse(localStorage.getItem('a3k64-session-token') || 'null');
      if (l && l.token && !(l.expiresAt && Date.now() > l.expiresAt)) return l.token;
    } catch (e) {}
    return '';
  }
  // Trả về phần data. Lỗi (kể cả hết lượt AI) ném Error, có e.locked nếu là khoá lượt.
  async function api(action, payload, timeoutMs) {
    var url = window.A3K64_CONFIG && window.A3K64_CONFIG.gasUrl;
    if (!url) throw new Error('Chưa cấu hình URL máy chủ (config.js).');
    var token = readToken();
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || 30000);
    var res;
    try {
      res = await fetch(url, {
        method: 'POST', signal: ctrl.signal,
        headers: Object.assign({ 'Content-Type': 'text/plain;charset=utf-8' }, token ? { Authorization: 'Bearer ' + token } : {}),
        body: JSON.stringify(Object.assign({ action: action }, payload || {})),
      });
    } catch (e) {
      throw new Error(e && e.name === 'AbortError' ? 'Máy chủ phản hồi quá lâu, vui lòng thử lại.' : 'Không kết nối được máy chủ.');
    } finally { clearTimeout(timer); }
    var json;
    try { json = await res.json(); } catch (e) { throw new Error('Máy chủ trả về dữ liệu không hợp lệ (HTTP ' + res.status + ').'); }
    // Backend có 2 dạng báo lỗi: {ok:false,error} và {ok:true,data:{ok:false,error}} (authFail / hết lượt AI)
    var inner = json && json.data;
    if (json && json.ok === false) throw new Error(json.error || 'Máy chủ từ chối yêu cầu.');
    if (inner && inner.ok === false) { var er = new Error(inner.error || 'Máy chủ từ chối yêu cầu.'); er.locked = !!inner.locked; throw er; }
    return inner;
  }

  /* ---------- thông báo nhỏ ---------- */
  function toast(msg, isErr) {
    var old = $('.sm-toast'); if (old) old.remove();
    var el = document.createElement('div');
    el.className = 'sm-toast' + (isErr ? ' err' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 3500);
  }

  /* ---------- màu theo bậc xếp loại (bậc 0 = cao nhất) ---------- */
  function toneOf(kind, label) {
    var list = (state.data && state.data.thresholds && state.data.thresholds[kind]) || [];
    var i = -1;
    for (var k = 0; k < list.length; k++) if (list[k].label === label) { i = k; break; }
    return ['good', 'fair', 'warn'][i] || 'bad';
  }
  function pill(kind, label) { return '<span class="sm-pill tone-' + toneOf(kind, label) + '">' + esc(label) + '</span>'; }
  function trendHTML(r) {
    if (!state.data || state.data.nWeeks < 2) return '<span class="sm-flat">—</span>';
    if (r.trend > 0) return '<span class="sm-up">▲ ' + fmt(r.trend) + '</span>';
    if (r.trend < 0) return '<span class="sm-down">▼ ' + fmt(Math.abs(r.trend)) + '</span>';
    return '<span class="sm-flat">＝</span>';
  }
  function cmpLbl(c) { return c.fromWeek === c.toWeek ? 'tuần ' + c.fromWeek : 'tuần ' + c.fromWeek + '→' + c.toWeek; }
  function weekLabel(w) {
    var all = (state.data && state.data.allWeeks) || [];
    for (var i = 0; i < all.length; i++) if (all[i].week === w) return all[i].label;
    return 'TUẦN ' + w;
  }

  /* ---------- tải báo cáo ---------- */
  function saveRange() {
    try { sessionStorage.setItem(RANGE_KEY, JSON.stringify({ from: state.from, to: state.to, cmp: state.cmp })); } catch (e) {}
  }
  // Bật so sánh 2 kỳ với gợi ý mặc định (dùng cho chip "Tăng hạng nhiều nhất" và nút trong biểu đồ).
  function enableCmp(sortClimb) {
    if (!needTier('max', 'So sánh 2 kỳ và “Tăng hạng”')) return;
    var dc = defaultCmp();
    if (!dc) { toast('Khoảng tuần đang chọn quá ngắn để chia 2 kỳ. Hãy chọn nhiều tuần hơn (vd tuần 1→4).', true); return; }
    state.cmp = { on: true, a: dc.a, b: dc.b };
    if (sortClimb) state.sort = { key: 'climb', dir: -1 };
    load(state.from, state.to);
  }
  function weekNos() { return ((state.data && state.data.allWeeks) || []).map(function (w) { return w.week; }); }
  // Kỳ liền trước của một khoảng tuần: cùng số tuần, nằm ngay trước khoảng đó. null nếu khoảng đó bắt đầu từ tuần đầu tiên.
  function prevPeriod(from, to) {
    var nos = weekNos();
    var i = nos.indexOf(from), j = nos.indexOf(to);
    if (i <= 0 || j < i) return null;
    var len = j - i + 1;
    return { from: nos[Math.max(0, i - len)], to: nos[i - 1] };
  }
  // Gợi ý 2 kỳ khi vừa bật so sánh: kỳ sau = khoảng đang chọn, kỳ đầu = kỳ liền trước nó.
  // Nếu khoảng đang chọn bắt đầu từ tuần đầu tiên thì chia đôi nó (vd tuần 1→5: kỳ đầu 1→2, kỳ sau 3→4).
  function defaultCmp() {
    var nos = weekNos();
    var pp = prevPeriod(state.from, state.to);
    if (pp) return { a: pp, b: { from: state.from, to: state.to } };
    var i = nos.indexOf(state.from), j = nos.indexOf(state.to), h = Math.floor((j - i + 1) / 2);
    if (i < 0 || h < 1) return null;
    return { a: { from: nos[i], to: nos[i + h - 1] }, b: { from: nos[i + h], to: nos[i + 2 * h - 1] } };
  }
  async function load(from, to) {
    var my = ++reqSeq;
    state.loading = true; setLoading(true);
    try {
      var pl = from && to ? { fromWeek: from, toWeek: to } : {};
      if (state.view === 'charts') pl.use = 'charts';   // chế độ Biểu đồ: server kiểm tra gói Max rồi mới trả dữ liệu
      var reqs = [api('getSummaryReport', pl)];
      // 2 kỳ so sánh độc lập với khoảng tuần chính. Server tính sẵn: lấy kỳ sau làm "kỳ chính", kỳ đầu làm "kỳ so sánh"
      // → mỗi dòng có rank (= vị thứ kỳ sau), baseRank (= vị thứ kỳ đầu), climb (= vị thứ kỳ đầu − vị thứ kỳ sau).
      if (state.cmp.on && state.cmp.a.from && state.cmp.b.from) {
        reqs.push(api('getSummaryReport', { fromWeek: state.cmp.b.from, toWeek: state.cmp.b.to, compareFrom: state.cmp.a.from, compareTo: state.cmp.a.to }));
      }
      var res = await Promise.all(reqs);
      var d = res[0], c = res[1];
      if (my !== reqSeq) return;
      d.compare = null;
      if (c && c.compare && d.canViewAll) {
        var byId = {};
        c.rows.forEach(function (x) { byId[x.id] = x; });
        d.rows.forEach(function (r) {
          var x = byId[r.id];
          if (x) { r.rankA = x.baseRank; r.rankB = x.rank; r.climb = x.climb; }
        });
        d.compare = { a: { fromWeek: c.compare.fromWeek, toWeek: c.compare.toWeek }, b: { fromWeek: c.fromWeek, toWeek: c.toWeek } };
        state.cmp.a = { from: c.compare.fromWeek, to: c.compare.toWeek };
        state.cmp.b = { from: c.fromWeek, to: c.toWeek };
      }
      state.data = d; state.from = d.fromWeek; state.to = d.toWeek;
      if (!d.compare && ['climb', 'rankA', 'rankB'].indexOf(state.sort.key) >= 0) state.sort = { key: 'rank', dir: 1 };
      saveRange();
      if (!d.canViewAll && d.rows[0]) state.selected = d.rows[0].id;
    } catch (e) {
      if (my !== reqSeq) return;
      if (e.locked && state.view === 'charts') {   // gói không có Biểu đồ → quay về bảng
        state.view = 'table'; state.loading = false; setLoading(false);
        if (window.A3AI && window.A3AI.showUpgrade) window.A3AI.showUpgrade(e.message);
        setTimeout(function () { load(from, to); }, 0);
        return;
      }
      if (e.locked && state.cmp.on) {   // gói không còn So sánh 2 kỳ → tắt rồi tải lại bình thường
        state.cmp.on = false; saveRange();
        if (window.A3AI && window.A3AI.showUpgrade) window.A3AI.showUpgrade(e.message);
        setTimeout(function () { load(from, to); }, 0);
        return;
      }
      state.loading = false; setLoading(false);
      toast(e.message, true);
      if (!state.data) { $('#sm-main').innerHTML = '<div class="sm-card sm-empty">' + esc(e.message) + '<br><br><button class="sm-btn" data-act="reload">Thử lại</button></div>'; return; }
    }
    if (my !== reqSeq) return;
    state.loading = false; setLoading(false);
    renderAll();
  }

  /* ---------- khung chính ---------- */
  function renderAll() { renderHead(); renderFilters(); renderBody(); }

  // Dòng mô tả (hàng tab + bản in). Số học sinh hiển thị cập nhật riêng ở renderRows.
  function renderHead() {
    var d = state.data;
    var label = window.CLASS_LABEL || window.CLASS_NAME || '';
    var sub = d
      ? (label ? 'Lớp ' + label + ' • ' : '') + 'Tuần ' + d.fromWeek + ' → ' + d.toWeek + ' (' + d.nWeeks + ' tuần) • dữ liệu từ hệ thống'
      : 'Đang tải…';
    $('#sm-sub').textContent = sub; $('#sm-sub').title = sub;
    $('#sm-psub').textContent = sub;
  }

  /* ---------- RIBBON: gom mọi thanh công cụ thành các tab (Trang đầu / Dữ liệu / Xem / Trợ lý AI) ---------- */
  function ribTabs(d) {
    var t = [['home', 'Trang đầu']];
    if (d.canViewAll) t.push(['data', 'Dữ liệu'], ['view', 'Xem'], ['ai', 'Trợ lý AI']);
    return t;
  }
  function rbGroup(label, inner, cls) {
    return '<div class="rb-group' + (cls ? ' ' + cls : '') + '"><div class="rb-items">' + inner + '</div><div class="rb-label">' + label + '</div></div>';
  }
  function rbBig(act, icon, label, extra) {
    return '<button type="button" class="sm-btn rb-big" data-act="' + act + '"' + (extra || '') + '><span class="ic" aria-hidden="true">' + icon + '</span><span class="lb">' + label + '</span></button>';
  }
  function rbRow(label, inner) { return '<label class="rb-row"><span>' + label + '</span>' + inner + '</label>'; }

  // keepTabs: đổi tab / thu gọn thì giữ nguyên các nút tab (chỉ đổi dấu 'đang chọn') để nhấp đúp và hiệu ứng thanh trượt không bị đứt.
  function renderFilters(keepTabs) {
    var d = state.data; if (!d) return;
    var tabs = ribTabs(d);
    if (!tabs.some(function (t) { return t[0] === state.rtab; })) state.rtab = 'home';
    var charts = state.view === 'charts';
    var opts = function (sel) {
      return d.allWeeks.map(function (w) {
        return '<option value="' + w.week + '"' + (w.week === sel ? ' selected' : '') + '>' + esc(w.label) + '</option>';
      }).join('');
    };
    var sel = function (id, v) { return '<select id="' + id + '">' + opts(v) + '</select>'; };
    var hiddenN = HIDE_ITEMS.filter(function (it) { return state.hide[it[0]]; }).length;

    var tabsEl = $('#sm-rtabs');
    if (keepTabs === true && tabsEl.children.length === tabs.length) {
      Array.prototype.forEach.call(tabsEl.children, function (b) {
        var on = b.getAttribute('data-t') === state.rtab;
        b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    } else tabsEl.innerHTML = tabs.map(function (t) {
      var on = t[0] === state.rtab;
      return '<button type="button" class="rb-tab' + (on ? ' on' : '') + '" role="tab" aria-selected="' + on + '" data-act="rb-tab" data-t="' + t[0] + '" id="rb-t-' + t[0] + '">' + t[1] +
        (t[0] === 'view' && hiddenN ? ' <span class="bd" title="Số cột đang ẩn">' + hiddenN + '</span>' : '') + '</button>';
    }).join('');

    var html = '';
    if (state.rtab === 'home') {
      html += rbGroup('Khoảng tuần', rbRow('Từ tuần', sel('sm-from', state.from)) + rbRow('Đến tuần', sel('sm-to', state.to)), 'rb-stack');
      if (d.canViewAll) {
        html += rbGroup('Chế độ xem',
          '<div class="sm-seg" id="sm-seg" role="tablist" aria-label="Chế độ xem">' +
            '<button type="button" class="sm-btn rb-big' + (!charts ? ' on' : '') + '" role="tab" data-act="view" data-v="table"><span class="ic" aria-hidden="true">📋</span><span class="lb">Bảng</span></button>' +
            '<button type="button" class="sm-btn rb-big' + (charts ? ' on' : '') + '" role="tab" data-act="view" data-v="charts"><span class="ic" aria-hidden="true">📈</span><span class="lb">Biểu đồ' + lockMark('max') + '</span></button>' +
          '</div>');
        if (!charts) {
          var groups = d.stats.groups.filter(function (g) { return g.group; });
          html += rbGroup('Tìm học sinh',
            rbRow('Tên', '<input id="sm-q" type="search" placeholder="Nhập tên…" value="' + esc(state.q) + '">') +
            rbRow('Tổ', '<select id="sm-g"><option value="">Tất cả</option>' + groups.map(function (g) {
              return '<option value="' + g.group + '"' + (state.group === String(g.group) ? ' selected' : '') + '>Tổ ' + g.group + '</option>';
            }).join('') + '</select>'), 'rb-stack');
        }
        html += rbGroup('Xuất & in', rbBig('export', '📊', 'Xuất Excel' + lockMark('plus')) + rbBig('print', '🖨️', 'In' + lockMark('plus')));
      } else {
        html += rbGroup('In', rbBig('print', '🖨️', 'In' + lockMark('plus')));
      }
    } else if (state.rtab === 'data') {
      if (!charts) html += rbGroup('Lọc theo xếp loại', '<div class="rb-chips" id="sm-gchips">' + gradeChipsHTML(d) + '</div>');
      var climbOn = state.cmp.on && state.sort.key === 'climb';
      var cmpTip = 'Bảng thêm 3 cột: vị thứ kỳ đầu, vị thứ kỳ sau và tăng hạng (= vị thứ kỳ đầu − vị thứ kỳ sau; ▲ là lên hạng). Hai kỳ này chọn riêng, không phụ thuộc “Từ tuần / Đến tuần” ở tab Trang đầu.';
      html += rbGroup('So sánh 2 kỳ',
        '<div class="rb-col"><label class="sm-check rb-chk" title="' + esc(cmpTip) + '"><input type="checkbox" id="sm-cmp-on"' + (state.cmp.on ? ' checked' : '') + '> So sánh 2 kỳ' + lockMark('max') + '</label>' +
          '<button type="button" class="sm-chip' + (climbOn ? ' on' : '') + '" data-act="climb" title="Vị thứ kỳ đầu trừ vị thứ kỳ sau">🏆 Tăng hạng nhiều nhất' + lockMark('max') + (climbOn ? (state.sort.dir < 0 ? ' ▼' : ' ▲') : '') + '</button></div>' +
        (state.cmp.on
          ? '<div class="rb-col rb-stack">' + rbRow('Kỳ đầu', sel('sm-af', state.cmp.a.from) + '<i aria-hidden="true">→</i>' + sel('sm-at', state.cmp.a.to)) +
              rbRow('Kỳ sau', sel('sm-bf', state.cmp.b.from) + '<i aria-hidden="true">→</i>' + sel('sm-bt', state.cmp.b.to)) + '</div>' +
            '<div class="rb-col"><button type="button" class="sm-chip" data-act="cmp-prev" title="Đặt kỳ đầu là kỳ có cùng số tuần, nằm ngay trước kỳ sau">Kỳ liền trước</button></div>'
          : ''), 'rb-cmp');
    } else if (state.rtab === 'view') {
      html += rbGroup('Hiển thị cột',
        charts ? '<span class="rb-note">Chỉ áp dụng cho dạng Bảng — chuyển sang Bảng ở tab Trang đầu.</span>'
        : '<div class="rb-checks">' + HIDE_ITEMS.map(function (it) {
            return '<label class="sm-hide-item"><input type="checkbox" data-hide="' + it[0] + '"' + (state.hide[it[0]] ? '' : ' checked') + '> <span>' + esc(it[1]) + '</span></label>';
          }).join('') + '</div><div class="rb-col"><button type="button" class="sm-chip" data-act="hide-all" title="Bỏ ẩn mọi cột (cột ẩn cũng không được in / xuất Excel)">Hiện tất cả</button></div>');
      html += rbGroup('Thanh công cụ', rbBig('rb-fold', '⌃', 'Thu gọn'));
    } else if (state.rtab === 'ai') {
      html += rbGroup('Nhận xét nhanh (1 lượt AI)',
        rbBig('ai-class', '✨', 'Nhận xét cả lớp' + lockMark('plus'), state.aiBusy ? ' disabled' : '') +
        rbBig('ai-insight', '📈', 'Ai tiến bộ / sa sút?' + lockMark('plus'), state.aiBusy ? ' disabled' : ''));
      html += rbGroup('Hỏi về số liệu (1 lượt AI)',
        '<div class="rb-ask"><input id="sm-ask" maxlength="300" placeholder="vd: Tổ nào đều điểm nhất?" aria-label="Câu hỏi cho AI">' +
        '<button type="button" class="sm-btn primary" data-act="ai-ask"' + (state.aiBusy ? ' disabled' : '') + '>Hỏi' + lockMark('max') + '</button></div>');
    }

    var panel = $('#sm-rpanel');
    panel.innerHTML = html;
    panel.hidden = state.rcol && !state.ropen;
    panel.classList.toggle('pop', state.rcol && state.ropen);
    $('#sm-ribbon').classList.toggle('is-fold', state.rcol);
    var fb = $('[data-act="rb-fold"].rb-fold');
    if (fb) { fb.setAttribute('aria-expanded', state.rcol ? 'false' : 'true'); fb.title = state.rcol ? 'Mở rộng thanh công cụ' : 'Thu gọn thanh công cụ (hoặc nhấp đúp vào tab)'; }
  }
  function toggleFold() { state.rcol = !state.rcol; state.ropen = false; saveFold(); renderFilters(true); }

  /* ---------- thân trang ---------- */
  // Làm mờ nhẹ khi đang tải (không dựng lại DOM → bảng giữ nguyên vị trí cuộn).
  function setLoading(on) {
    var lay = $('#sm-layout'); if (lay) lay.classList.toggle('is-loading', !!on);
    var rb = $('#sm-ribbon'); if (rb) rb.classList.toggle('is-loading', !!on);
    if (on && !state.data) $('#sm-main').innerHTML = '<div class="sm-loading">Đang tải dữ liệu từ hệ thống…</div>';
  }
  function renderBody() {
    var d = state.data; if (!d) return;
    renderStats();
    if (d.canViewAll) {
      renderMainView(d);
      $('#sm-panel').hidden = false;
      $('#sm-panel').innerHTML = panelHTML();
    } else {
      $('#sm-main').innerHTML = '<div class="sm-card sm-self">' + detailHTML(d.rows[0]) + '</div>';
      $('#sm-panel').hidden = true; $('#sm-panel').innerHTML = '';
    }
    renderSelection();
    if (window.SMCharts) window.SMCharts.refresh();   // dữ liệu vừa tải lại → làm mới chế độ xem riêng đang mở (nếu có)
  }
  // Vùng chính: bảng hoặc biểu đồ. Cột phải (thống kê + AI) vẫn giữ nguyên, chỉ bị ẩn bằng CSS khi xem biểu đồ.
  function renderMainView(d) {
    var charts = !!(d.canViewAll && state.view === 'charts');
    $('#sm-layout').classList.toggle('v-charts', charts);
    if (charts) { $('#sm-main').innerHTML = chartsHTML(d); $('#sm-count').textContent = ''; }
    else { $('#sm-main').innerHTML = tableCardHTML(d); renderRows(); }
  }
  function setView(v) {
    var d = state.data; if (!d || !d.canViewAll || state.view === v) return;
    state.view = v;
    if (v === 'charts') { load(state.from, state.to); return; }   // tải lại với use:'charts' → server quyết định có cho xem biểu đồ không
    renderHead(); renderFilters(); renderMainView(d);
  }
  // Một thẻ tổng quan duy nhất: điểm TB cả lớp + số tuần + sĩ số, rồi phân bố xếp loại ngay bên dưới.
  function renderStats() {
    var d = state.data; if (!d) return;
    $('#sm-stats').innerHTML = hid('stats') ? '' : '<div class="sm-card sm-ov">' + kpiHTML(d) + distHTML(d) + '</div>';
  }
  function kpiHTML(d) {
    var s = d.stats;
    return '<div class="sm-ov-top"><div class="sm-ov-main"><span>Điểm TB cả lớp</span><strong>' + fmt(s.classAvg) + '</strong></div>' +
      '<div class="sm-ov-meta"><div><span>Số tuần</span><b>' + d.nWeeks + '</b></div><div><span>Sĩ số</span><b>' + s.count + '</b></div></div></div>';
  }

  function barsHTML(kind, list, total) {
    var max = Math.max.apply(null, list.map(function (x) { return x.count; }).concat([1]));
    var base = total || max;
    return list.map(function (x) {
      var on = kind === 'grade' && state.grade === x.label;
      var canFilter = kind === 'grade' && state.data.canViewAll;
      var pct = total ? Math.round(x.count / total * 100) : 0;
      return '<div class="sm-bar-row tone-' + toneOf(kind, x.label) + '" ' + (canFilter ? 'data-act="fgrade" data-v="' + esc(x.label) + '" title="Bấm để lọc bảng theo xếp loại này"' : '') + '>' +
        '<span class="sm-bar-lbl"' + (on ? ' style="color:var(--text)"' : '') + '>' + esc(x.label) + '</span>' +
        '<div class="sm-bar-track"><div class="sm-bar-fill" style="width:' + (x.count / base * 100) + '%;' + (x.count ? 'min-width:4px' : '') + '"></div></div>' +
        '<span class="sm-bar-num">' + x.count + '<small>' + pct + '%</small></span></div>';
    }).join('');
  }
  function distHTML(d) {
    var th = d.thresholds.grade;
    var rule = th.map(function (t, i) {
      return (t.min == null || i === th.length - 1 && t.min == null) ? ('dưới → ' + t.label) : ('TB ≥ ' + t.min + ' → ' + t.label);
    }).join(' • ');
    return '<div class="sm-dist"><div class="sm-dsec"><h3>Phân bố xếp loại (theo điểm TB)</h3>' + barsHTML('grade', d.stats.byGrade, d.stats.count) +
      '<div class="sm-cnt">' + esc(rule) + '</div></div></div>';
  }

  /* ---------- bảng (kiểu Excel: mỗi tuần 1 cột) ---------- */
  function visibleRows(d) {
    var q = state.q.trim().toLowerCase();
    var rows = d.rows.filter(function (r) {
      return (!state.grade || r.grade === state.grade) &&
             (!state.group || String(r.group) === state.group) &&
             (!q || String(r.name).toLowerCase().indexOf(q) >= 0);
    });
    var k = state.sort.key, dir = state.sort.dir, wm = /^w(\d+)$/.exec(k);
    var val = function (r) { return wm ? r.scores[+wm[1]] : r[k]; };
    rows.sort(function (a, b) {
      var x = val(a), y = val(b), c = 0;
      if (x == null || y == null) c = 0;
      else c = typeof x === 'string' ? x.localeCompare(y, 'vi') : (x - y);
      return (c * dir) || (a.rank - b.rank) || String(a.name).localeCompare(b.name, 'vi');
    });
    return rows;
  }
  // Ô tiêu đề có nút sắp xếp. attrs: rowspan/colspan.
  function thx(key, label, cls, attrs) {
    var arrow = state.sort.key === key ? (state.sort.dir > 0 ? ' ▲' : ' ▼') : '';
    return '<th class="' + (cls || '') + '"' + (attrs || '') + '><button data-act="sort" data-k="' + key + '">' + label + arrow + '</button></th>';
  }
  function climbHTML(v) {
    if (v == null) return '<span class="sm-flat">—</span>';
    if (v > 0) return '<span class="sm-up">▲ ' + v + '</span>';
    if (v < 0) return '<span class="sm-down">▼ ' + Math.abs(v) + '</span>';
    return '<span class="sm-flat">＝</span>';
  }
  // Khung bảng: chỉ còn vùng bảng (tìm / tổ / lọc xếp loại nằm trên ribbon). Chỉ dựng lại khi dữ liệu đổi.
  function tableCardHTML() {
    return '<div class="sm-card sm-tablecard"><div class="sm-tablewrap xl" id="sm-tw"></div></div>';
  }
  function gradeChipsHTML(d) {
    var all = '<button class="sm-chip' + (state.grade ? '' : ' on') + '" data-act="fgrade" data-v="">Tất cả</button>';
    return all + d.stats.byGrade.map(function (x) {
      return '<button class="sm-chip tone-' + toneOf('grade', x.label) + (state.grade === x.label ? ' on' : '') + '" data-act="fgrade" data-v="' + esc(x.label) + '">' +
        '<span class="dot"></span>' + esc(x.label) + ' <b>' + x.count + '</b></button>';
    }).join('');
  }
  // Dựng lại phần thân bảng (sắp xếp / tìm / lọc) nhưng giữ nguyên vị trí cuộn.
  function renderRows() {
    var d = state.data, tw = $('#sm-tw'); if (!d || !tw) return;
    var st = tw.scrollTop, sl = tw.scrollLeft;
    var rows = visibleRows(d);
    tw.innerHTML = tableInnerHTML(d, rows);
    tw.scrollTop = st; tw.scrollLeft = sl;
    $('#sm-count').innerHTML = '<b>' + rows.length + '/' + d.rows.length + '</b> học sinh';
    var gc = $('#sm-gchips'); if (gc) gc.innerHTML = gradeChipsHTML(d);   // chip lọc nằm ở tab Dữ liệu (có thể chưa mở)
    updateHideBtn();
    syncSelRows();
  }
  function tableInnerHTML(d, rows) {
    var cmp = d.compare && !hid('cmp') ? d.compare : null;
    var nW = d.weeks.length, showW = !hid('weeks');
    var sub = '';
    if (showW) d.weeks.forEach(function (w, i) { sub += thx('w' + i, 'Tuần ' + w, 'wk'); });
    if (cmp) sub += thx('rankA', 'Vị thứ kỳ đầu', 'cmp') + thx('rankB', 'Vị thứ kỳ sau', 'cmp') + thx('climb', 'Tăng hạng', 'cmp');
    var head =
      '<tr><th class="stk stk0" rowspan="2">STT</th>' + thx('name', 'Họ và tên', 'l stk stk1', ' rowspan="2"') +
      (hid('group') ? '' : '<th rowspan="2">Tổ</th>') +
      (showW ? '<th colspan="' + nW + '" class="grp">Tổng điểm</th>' : '') +
      (hid('total') ? '' : thx('total', 'Tổng', '', ' rowspan="2"')) +
      (hid('avg') ? '' : thx('avg', 'TBC', '', ' rowspan="2"')) +
      (hid('rank') ? '' : thx('rank', 'Vị thứ', '', ' rowspan="2"')) +
      (hid('grade') ? '' : '<th rowspan="2">Xếp loại</th>') +
      (cmp ? '<th colspan="3" class="grp cmp">So sánh: kỳ đầu (' + cmpLbl(cmp.a) + ') → kỳ sau (' + cmpLbl(cmp.b) + ')</th>' : '') +
      '</tr>' + (sub ? '<tr>' + sub + '</tr>' : '');
    var ncols = 2 + (hid('group') ? 0 : 1) + (showW ? nW : 0) + (cmp ? 3 : 0) +
      ['total', 'avg', 'rank', 'grade'].filter(function (k) { return !hid(k); }).length;
    var tbody = rows.length ? rows.map(function (r, i) {
      return '<tr data-act="open" data-id="' + esc(r.id) + '" tabindex="0">' +
        '<td class="stk stk0">' + (i + 1) + '</td>' +
        '<td class="l stk stk1"><b>' + esc(r.name) + '</b></td>' +
        (hid('group') ? '' : '<td>' + (r.group ? '<span class="sm-grp">' + r.group + '</span>' : '—') + '</td>') +
        (showW ? r.scores.map(function (v) { return '<td class="wk' + (v < 0 ? ' neg' : '') + '">' + fmt(v) + '</td>'; }).join('') : '') +
        (hid('total') ? '' : '<td' + (r.total < 0 ? ' class="neg"' : '') + '>' + fmt(r.total) + '</td>') +
        (hid('avg') ? '' : '<td' + (r.avg < 0 ? ' class="neg"' : '') + '><b>' + fmt(r.avg) + '</b></td>') +
        (hid('rank') ? '' : '<td><span class="sm-rank' + (r.rank <= 3 ? ' r' + r.rank : '') + '">' + r.rank + '</span></td>') +
        (hid('grade') ? '' : '<td>' + pill('grade', r.grade) + '</td>') +
        (cmp ? '<td class="cmp">' + (r.rankA == null ? '—' : r.rankA) + '</td><td class="cmp">' + (r.rankB == null ? '—' : r.rankB) + '</td><td class="cmp">' + climbHTML(r.climb) + '</td>' : '') +
        '</tr>';
    }).join('') : '<tr><td colspan="' + ncols + '" class="sm-empty">Không có học sinh nào khớp bộ lọc.</td></tr>';
    return '<table class="sm-table sm-xl"><thead>' + head + '</thead><tbody>' + tbody + '</tbody></table>';
  }

  /* ---------- chi tiết 1 học sinh ---------- */
  function sparkline(r) {
    var d = state.data, n = r.scores.length;
    var W = 640, H = 210, L = 38, R = 14, T = 20, B = 30;
    var lo = Math.min.apply(null, r.scores.concat([r.avg])), hi = Math.max.apply(null, r.scores.concat([r.avg]));
    if (hi === lo) { hi += 1; lo -= 1; }
    var pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
    var X = function (i) { return n === 1 ? (L + (W - L - R) / 2) : L + i * (W - L - R) / (n - 1); };
    var Y = function (v) { return T + (hi - v) / (hi - lo) * (H - T - B); };
    var pts = r.scores.map(function (v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' ');
    var step = Math.ceil(n / 12);
    var svg = '<svg class="sm-spark" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Điểm từng tuần">';
    if (!hid('avg')) svg += '<line class="avg" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(r.avg).toFixed(1) + '" y2="' + Y(r.avg).toFixed(1) + '" stroke-dasharray="5 4"/>';
    if (!hid('avg')) svg += '<text x="' + (L - 6) + '" y="' + (Y(r.avg) + 4).toFixed(1) + '" text-anchor="end">TB</text>';
    if (n > 1) svg += '<polyline class="ln" fill="none" stroke-width="2.4" stroke-linejoin="round" points="' + pts + '"/>';
    r.scores.forEach(function (v, i) {
      svg += '<circle class="dot" cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="4"><title>' + esc(weekLabel(d.weeks[i])) + ': ' + fmt(v) + ' điểm</title></circle>';
      if (n <= 14) svg += '<text x="' + X(i).toFixed(1) + '" y="' + (Y(v) - 9).toFixed(1) + '" text-anchor="middle">' + fmt(v) + '</text>';
      if (i % step === 0 || i === n - 1) svg += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle">T' + d.weeks[i] + '</text>';
    });
    return svg + '</svg>';
  }
  function catBars(r) {
    var items = [['Học tập', r.cat.study], ['Nề nếp', r.cat.discipline], ['Phong trào', r.cat.movement]];
    var max = Math.max.apply(null, items.map(function (x) { return Math.abs(x[1]); }).concat([1]));
    return items.map(function (x) {
      var w = Math.abs(x[1]) / max * 50;
      return '<div class="sm-cat"><span>' + x[0] + '</span><div class="sm-cat-track"><div class="sm-cat-fill ' + (x[1] >= 0 ? 'pos' : 'neg') + '" style="width:' + w + '%"></div></div><span class="sm-cat-val">' + sgn(x[1]) + '</span></div>';
    }).join('');
  }
  function detailHTML(r) {
    var d = state.data;
    if (!r) return '<div class="sm-empty">Không có dữ liệu.</div>';
    var stat = function (label, inner) { return '<div><span>' + label + '</span>' + inner + '</div>'; };
    var stats =
      (hid('avg') ? '' : stat('Điểm TB', '<strong>' + fmt(r.avg) + '</strong>')) +
      (hid('total') ? '' : stat('Tổng điểm', '<strong>' + fmt(r.total) + '</strong>')) +
      (hid('grade') ? '' : stat('Xếp loại', pill('grade', r.grade)));
    return '<div class="sm-detail">' +
      '<div class="sm-d-top">' + (hid('rank') ? '' : '<div class="sm-rankbadge"><div>#' + r.rank + '<small>/ ' + d.classSize + '</small></div></div>') +
        '<div><h2>' + esc(r.name) + '</h2><p>' + (r.group && !hid('group') ? 'Tổ ' + r.group + ' • ' : '') + 'Tuần ' + d.fromWeek + ' → ' + d.toWeek + '</p></div></div>' +
      (stats ? '<div class="sm-d-stats">' + stats + '</div>' : '') +
      (d.compare && r.climb !== undefined && !hid('cmp') ? '<div class="sm-cnt" style="margin:0 0 6px">Kỳ đầu (' + cmpLbl(d.compare.a) + '): hạng #' + r.rankA + ' → kỳ sau (' + cmpLbl(d.compare.b) + '): hạng #' + r.rankB + ' (' + climbHTML(r.climb) + ')</div>' : '') +
      (hid('weeks') ? '' : '<h3>Điểm từng tuần ' + (d.nWeeks >= 2 ? '<span style="font-weight:500">• xu hướng ' + trendHTML(r) + '</span>' : '') + '</h3>' + sparkline(r)) +
      '<h3>Cộng / trừ theo mảng</h3>' + catBars(r) +
      '<div class="sm-cnt">' + r.pos + ' lần được cộng • ' + r.neg + ' lần bị trừ trong khoảng tuần này</div>' +
      '<div class="sm-ai" style="margin-top:16px"><button class="sm-btn primary" data-act="ai-student" data-id="' + esc(r.id) + '">✨ AI nhận xét' + lockMark('plus') + '</button>' +
        '<div class="sm-ai-out" id="sm-ai-student"></div></div>' +
    '</div>';
  }
  /* ---------- chọn học sinh: ngăn kéo (màn hẹp) hoặc cột phải (màn rộng) ---------- */
  function selectedRow() {
    var d = state.data;
    return d && d.canViewAll && state.selected ? d.rows.filter(function (x) { return x.id === state.selected; })[0] || null : null;
  }
  function syncSelRows() {
    var trs = document.querySelectorAll('#sm-tw tbody tr[data-id]');
    for (var i = 0; i < trs.length; i++) trs[i].classList.toggle('sel', !!state.selected && trs[i].getAttribute('data-id') === state.selected);
  }
  function applyTab() {
    var p = $('#sm-panel'); if (!p) return;
    p.setAttribute('data-tab', state.tab);
    var tabs = p.querySelectorAll('.sm-tab');
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute('data-t') === state.tab;
      tabs[i].classList.toggle('on', on); tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }
  function renderSelection() {
    var d = state.data; if (!d || !d.canViewAll) return;
    var r = selectedRow(), wide = isWide();
    var host = $('#sm-drawer'), bg = $('#sm-drawer-bg');
    if (r && !wide) { host.innerHTML = '<button class="sm-btn ghost sm-close" data-act="close" aria-label="Đóng">✕</button>' + detailHTML(r); host.hidden = false; bg.hidden = false; }
    else { host.hidden = true; bg.hidden = true; host.innerHTML = ''; }
    var pane = $('#sm-pane-detail');
    if (pane) pane.innerHTML = !wide ? '' : (r
      ? '<button class="sm-btn ghost sm-close" data-act="close" aria-label="Bỏ chọn">✕</button>' + detailHTML(r)
      : '<div class="sm-empty">Chọn một học sinh trong bảng để xem chi tiết.<br><span class="sm-cnt">Dùng phím ↑ ↓ để lướt qua các dòng.</span></div>');
    applyTab(); syncSelRows();
  }
  // Cột phải có thể dài hơn khung nhìn: cuộn nó tới đầu phần chi tiết để thấy ngay học sinh vừa chọn.
  function revealPanel() {
    var side = $('.sm-side'), p = $('#sm-panel');
    if (!side || !p || !isWide() || side.scrollHeight <= side.clientHeight + 1) return;
    var top = side.scrollTop + p.getBoundingClientRect().top - side.getBoundingClientRect().top;
    side.scrollTo({ top: top, behavior: 'smooth' });
  }
  function openStudent(id) {
    var same = state.selected === id, wide = isWide();
    state.selected = id;
    if (wide) state.tab = 'detail';
    if (same && wide) { applyTab(); syncSelRows(); } else renderSelection();   // đã mở đúng bạn này → giữ nguyên nhận xét AI đang hiện
    if (wide && !same) revealPanel();
  }
  function closeSelection() {
    state.selected = '';
    if (isWide()) state.tab = 'ai';
    renderSelection();
  }

  /* ---------- AI ---------- */
  function panelHTML() {
    return '<div class="sm-tabs" role="tablist">' +
        '<button class="sm-tab" role="tab" data-act="tab" data-t="detail">👤 Học sinh</button>' +
        '<button class="sm-tab" role="tab" data-act="tab" data-t="ai">✨ Trợ lý AI</button></div>' +
      '<div class="sm-pane sm-pane-detail" id="sm-pane-detail"></div>' +
      '<div class="sm-pane sm-pane-ai sm-ai"><div class="sm-ai-head"><h2>✨ Trợ lý AI</h2></div>' +
      '<div class="sm-cnt">AI chỉ đọc số liệu trong hệ thống (tuần ' + state.data.fromWeek + ' → ' + state.data.toWeek + '); xếp loại, vị thứ do hệ thống tính. Mỗi lần hỏi tốn 1 lượt AI. Nhận xét cả lớp / đặt câu hỏi ở tab “Trợ lý AI” trên thanh công cụ.</div>' +
      '<div class="sm-ai-out" id="sm-ai-class"></div></div>';
  }
  function aiResultHTML(ai) {
    var sec = function (arr, title, cls) {
      return arr && arr.length ? '<h4 class="' + cls + '">' + title + '</h4><ul>' + arr.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '';
    };
    return '<div class="sm-ai-card">' + (ai.summary ? '<p>' + esc(ai.summary) + '</p>' : '') +
      sec(ai.highlights, 'Điểm sáng', 'good') + sec(ai.concerns, 'Cần lưu ý', 'warn') + sec(ai.suggestions, 'Gợi ý', 'blue') +
      '<small class="sm-ai-note">Do AI tạo từ số liệu hệ thống — hãy kiểm tra lại trước khi dùng chính thức.</small></div>';
  }
  async function runAi(mode, extra, outSel, btn) {
    var out = $(outSel); if (!out || !state.data) return;
    var setBusy = function (on) {
      state.aiBusy = on;   // ribbon có thể bị dựng lại giữa chừng (đổi tab) → đọc từ state
      document.querySelectorAll('[data-act^="ai-"]').forEach(function (b) { b.disabled = on; });
    };
    setBusy(true);
    out.innerHTML = '<div class="sm-ai-loading">AI đang đọc số liệu</div>';
    try {
      var r = await api('summaryAi', Object.assign({ mode: mode, fromWeek: state.data.fromWeek, toWeek: state.data.toWeek }, extra || {}), 90000);
      out = $(outSel) || out;
      out.innerHTML = aiResultHTML(r.ai);
    } catch (e) {
      out = $(outSel) || out;
      out.innerHTML = '<div class="sm-ai-err">' + (e.locked ? '🔒 ' : '⚠️ ') + esc(e.message) + '</div>';
      if (e.locked && window.A3AI && window.A3AI.showUpgrade) window.A3AI.showUpgrade(e.message);
    } finally { setBusy(false); }
  }
  // Kết quả AI nằm ở cột phải (màn rộng) hoặc dưới bảng (màn hẹp): đưa nó vào tầm nhìn khi bấm từ ribbon.
  function showAiOut() {
    var d = state.data; if (!d || !d.canViewAll) return;
    if (state.view === 'charts') setView('table');   // cột phải bị ẩn ở chế độ biểu đồ
    if (isWide()) { state.tab = 'ai'; applyTab(); revealPanel(); }
    else { var p = $('#sm-panel'); if (p && p.scrollIntoView) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }

  /* ---------- xuất Excel (client, xlsx-js-style — cùng thư viện với xuất bảng điểm) ---------- */
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
      s.onload = function () { window.XLSX ? resolve(window.XLSX) : reject(new Error('Không nạp được thư viện Excel.')); };
      s.onerror = function () { reject(new Error('Không tải được thư viện Excel (kiểm tra mạng).')); };
      document.head.appendChild(s);
    });
  }
  async function exportXlsx() {
    var d = state.data; if (!d || !d.canViewAll) return;
    var btn = $('[data-act="export"]') || {}; btn.disabled = true;   // nút nằm ở tab Trang đầu (có thể đã bị dựng lại)
    try {
      var X = await loadXLSX();
      // Dữ liệu xuất lấy qua server với use:'export' (khoá gói Plus ở backend); gộp lại cột so sánh 2 kỳ từ bảng đang xem.
      var g = await api('getSummaryReport', { fromWeek: d.fromWeek, toWeek: d.toWeek, use: 'export' });
      if (d.compare) {
        var byId = {}; d.rows.forEach(function (x) { byId[x.id] = x; });
        g.rows.forEach(function (r) { var x = byId[r.id]; if (x) { r.rankA = x.rankA; r.rankB = x.rankB; r.climb = x.climb; } });
        g.compare = d.compare;
      } else g.compare = null;
      d = g;
      var FONT = { name: 'Times New Roman', sz: 10 };
      var B = { style: 'thin', color: { rgb: '000000' } };
      var BORDER = { top: B, bottom: B, left: B, right: B };
      var cell = function (v, bold, align, fill) {
        var s = { font: Object.assign({}, FONT, bold ? { bold: true } : {}), border: BORDER, alignment: { horizontal: align || 'center', vertical: 'center' } };
        if (fill) s.fill = { patternType: 'solid', fgColor: { rgb: fill } };
        return { v: v, t: typeof v === 'number' ? 'n' : 's', s: s };
      };
      var blank = function () { return cell('', false); };
      // Cột xuất ra theo đúng các mục đang hiển thị (mục đã ẩn thì không xuất).
      var cmp = d.compare && !hid('cmp') ? d.compare : null;
      var wl = function (c) { return c.fromWeek === c.toWeek ? 'T' + c.fromWeek : 'T' + c.fromWeek + '-' + c.toWeek; };
      var cols = [
        { h: 'STT', w: 5, v: function (r, i) { return i + 1; } },
        { h: 'Họ và tên', w: 26, left: true, v: function (r) { return r.name; } },
        { h: 'Giới tính', w: 11, v: function (r) { return r.gender || ''; } }
      ];
      if (!hid('group')) cols.push({ h: 'Tổ', w: 8, v: function (r) { return r.group ? 'Tổ ' + r.group : ''; } });
      if (!hid('weeks')) d.weeks.forEach(function (w, k) { cols.push({ h: 'T' + w, w: 8, v: function (r) { return r.scores[k]; } }); });
      if (!hid('total')) cols.push({ h: 'Tổng điểm', w: 11, v: function (r) { return r.total; } });
      if (!hid('avg')) cols.push({ h: 'TBC', w: 8, v: function (r) { return r.avg; } });
      if (!hid('rank')) cols.push({ h: 'Vị thứ', w: 8, v: function (r) { return r.rank; } });
      if (!hid('grade')) cols.push({ h: 'Xếp loại', w: 11, v: function (r) { return r.grade; } });
      if (cmp) cols.push(
        { h: 'Vị thứ kỳ đầu (' + wl(cmp.a) + ')', w: 16, v: function (r) { return r.rankA; } },
        { h: 'Vị thứ kỳ sau (' + wl(cmp.b) + ')', w: 16, v: function (r) { return r.rankB; } },
        { h: 'Tăng hạng', w: 11, v: function (r) { return r.climb; } });
      var C = cols.length;
      var label = window.CLASS_LABEL || window.CLASS_NAME || '';
      var ruleTxt = d.thresholds.grade.map(function (t) { return t.min == null ? 'còn lại: ' + t.label : 'TB ≥ ' + t.min + ': ' + t.label; }).join(' | ');
      var rows = [];
      var pad = function (first) { var a = [cell(first, true)]; for (var i = 1; i < C; i++) a.push(blank()); return a; };
      rows.push(pad('LỚP ' + label + ' - TỔNG KẾT TUẦN ' + d.fromWeek + ' → ' + d.toWeek));
      rows.push(pad('Xếp loại theo điểm trung bình: ' + ruleTxt + (cmp ? ' | Tăng hạng = vị thứ kỳ đầu (' + wl(cmp.a) + ') trừ vị thứ kỳ sau (' + wl(cmp.b) + ')' : '')));
      rows.push(cols.map(function (c) { return cell(c.h, true, 'center', 'D9D9D9'); }));
      d.rows.forEach(function (r, i) {
        rows.push(cols.map(function (c) { var v = c.v(r, i); return cell(v == null ? '' : v, false, c.left ? 'left' : 'center'); }));
      });
      var ws = X.utils.aoa_to_sheet(rows);
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: C - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: C - 1 } }];
      ws['!cols'] = cols.map(function (c) { return { wch: c.w }; });
      var wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, ws, ('Tuan ' + d.fromWeek + '-' + d.toWeek).slice(0, 31));
      var vn = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
      var p = function (v) { return String(v).padStart(2, '0'); };
      var stamp = vn.getFullYear() + p(vn.getMonth() + 1) + p(vn.getDate()) + '_' + p(vn.getHours()) + p(vn.getMinutes());
      X.writeFile(wb, (window.CLASS_NAME || 'Lop') + '_TongKet_Tuan' + d.fromWeek + '-' + d.toWeek + '_' + stamp + '.xlsx');
      toast('Đã xuất file Excel.');
    } catch (e) {
      toast(e.message || 'Xuất Excel thất bại.', true);
      if (e.locked && window.A3AI && window.A3AI.showUpgrade) window.A3AI.showUpgrade(e.message);
    }
    finally { btn.disabled = false; }
  }

  /* ---------- BIỂU ĐỒ (SVG tự vẽ, không cần thư viện) ---------- */
  // Mọi số liệu lấy từ d.rows / d.stats mà server đã trả; ở đây chỉ cộng gộp & vẽ.
  function r2(v) { return Math.round(v * 100) / 100; }
  function rangeLbl(d) { return 'tuần ' + d.fromWeek + (d.toWeek !== d.fromWeek ? ' → ' + d.toWeek : ''); }
  // key: mã biểu đồ → bấm vào thẻ (hoặc nút ⤢) sẽ mở chế độ xem riêng có công cụ riêng (summary-charts.js).
  function chCard(title, sub, body, cls, key) {
    var open = key ? ' data-act="chart-open" data-c="' + key + '" tabindex="0" role="button" aria-label="Mở rộng biểu đồ: ' + esc(title) + '"' : '';
    return '<section class="sm-card sm-chcard' + (cls ? ' ' + cls : '') + '"' + open + '><div class="sm-chhead"><h3>' + esc(title) + '</h3>' +
      (sub ? '<p>' + esc(sub) + '</p>' : '') +
      (key ? '<button type="button" class="sm-chexp" data-act="chart-open" data-c="' + key + '" title="Mở rộng &amp; dùng công cụ riêng của biểu đồ này" aria-label="Mở rộng">⤢</button>' : '') +
      '</div>' + body + '</section>';
  }
  function chEmpty(msg, extra) { return '<div class="sm-ch-empty"><p>' + esc(msg) + '</p>' + (extra || '') + '</div>'; }
  function chText(x, y, cls, anchor, txt) {
    return '<text class="' + cls + '" x="' + (+x).toFixed(1) + '" y="' + (+y).toFixed(1) + '"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + esc(txt) + '</text>';
  }

  // 1) Biến động tổng điểm cả lớp theo tuần (đường)
  function chWeekly(d) {
    var n = d.nWeeks;
    var tot = d.weeks.map(function (w, i) { return r2(d.rows.reduce(function (s, r) { return s + r.scores[i]; }, 0)); });
    if (n < 2) return chEmpty('Đang chọn 1 tuần (tổng điểm cả lớp: ' + fmt(tot[0]) + '). Hãy chọn từ 2 tuần trở lên ở bộ lọc phía trên để xem biến động giữa các tuần.');
    var W = 640, H = 340, L = 62, R = 18, T = 42, B = 70;
    var lo = Math.min.apply(null, tot), hi = Math.max.apply(null, tot), span0 = hi - lo;
    if (hi === lo) { hi += 1; lo -= 1; span0 = 2; }
    var pad = (hi - lo) * 0.18; lo -= pad; hi += pad;
    var X = function (i) { return L + 30 + i * (W - L - R - 60) / (n - 1); };
    var Y = function (v) { return T + (hi - v) / (hi - lo) * (H - T - B); };
    var svg = '<svg class="sm-ch" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Tổng điểm cả lớp theo tuần">';
    for (var g = 0; g < 4; g++) {
      var gv = lo + (hi - lo) * g / 3, gy = Y(gv);
      svg += '<line class="ch-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + gy.toFixed(1) + '" y2="' + gy.toFixed(1) + '"/>' +
        chText(L - 10, gy + 5, 'ch-s', 'end', fmt(+gv.toFixed(span0 < 10 ? 1 : 0)));
    }
    var pts = tot.map(function (v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' ');
    svg += '<polygon class="ch-area" points="' + pts + ' ' + X(n - 1).toFixed(1) + ',' + (H - B) + ' ' + X(0).toFixed(1) + ',' + (H - B) + '"/>';
    svg += '<polyline class="ch-line" fill="none" points="' + pts + '"/>';
    var step = Math.ceil(n / 7);
    tot.forEach(function (v, i) {
      var x = X(i), y = Y(v);
      svg += '<circle class="ch-dot" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="6"><title>' + esc(weekLabel(d.weeks[i])) + ': ' + fmt(v) + '</title></circle>';
      if (i % step === 0 || i === n - 1) svg += chText(x, y - 14, 'ch-v', 'middle', fmt(v));
      if (i % step === 0 || i === n - 1) {
        svg += chText(x, H - B + 24, 'ch-l', 'middle', (n > 6 ? 'T' : 'Tuần ') + d.weeks[i]);
        if (i > 0) {
          var dl = r2(v - tot[i - 1]);
          svg += chText(x, H - B + 47, dl > 0 ? 'ch-d ch-up' : (dl < 0 ? 'ch-d ch-dn' : 'ch-d ch-flat'), 'middle', (dl > 0 ? '▲ ' : (dl < 0 ? '▼ ' : '＝ ')) + fmt(Math.abs(dl)));
        }
      }
    });
    return svg + '</svg>';
  }

  // 2) Phân bố xếp loại (bánh vòng)
  function chDonut(d) {
    var list = d.stats.byGrade, total = d.stats.count || 1;
    var cx = 150, cy = 160, R = 96, C = 2 * Math.PI * R, off = 0;
    var svg = '<svg class="sm-ch" viewBox="0 0 640 320" role="img" aria-label="Phân bố xếp loại">' +
      '<circle class="ch-track" cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="none" stroke-width="44"/>';
    list.forEach(function (x) {
      if (!x.count) return;
      var len = x.count / total * C;
      svg += '<circle class="sg-' + toneOf('grade', x.label) + '" cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="none" stroke-width="44" stroke-dasharray="' +
        len.toFixed(2) + ' ' + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"><title>' + esc(x.label) + ': ' + x.count + ' học sinh</title></circle>';
      off += len;
    });
    svg += chText(cx, cy + 4, 'ch-big', 'middle', String(d.stats.count)) + chText(cx, cy + 32, 'ch-s', 'middle', 'học sinh');
    var rowH = 56, y0 = cy - (list.length * rowH) / 2 + 8;
    list.forEach(function (x, i) {
      var y = y0 + i * rowH, pct = Math.round(x.count / total * 100);
      svg += '<rect class="fg-' + toneOf('grade', x.label) + '" x="320" y="' + (y - 18) + '" width="22" height="22" rx="6"/>' +
        chText(354, y, 'ch-v ch-vl', 'start', x.label) +
        chText(626, y, 'ch-v', 'end', x.count + ' HS · ' + pct + '%');
    });
    return svg + '</svg>';
  }

  // 3) Phổ điểm (cột) — số học sinh theo khoảng điểm TBC
  function chHist(d) {
    var vals = d.rows.map(function (r) { return r.avg; });
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), span = mx - mn, step = 1;
    if (span > 0) {
      var raw = span / 8, nice = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
      step = nice.filter(function (v) { return v >= raw; })[0] || raw;
    }
    var start = Math.floor(mn / step) * step;
    var nb = Math.floor((mx - start) / step + 1e-9) + 1;
    var cnt = []; for (var k = 0; k < nb; k++) cnt.push(0);
    vals.forEach(function (v) { cnt[Math.min(nb - 1, Math.floor((v - start) / step + 1e-9))]++; });
    var W = 640, H = 340, L = 20, R = 20, T = 56, B = 56, pw = W - L - R, bw = pw / nb;
    var maxC = Math.max.apply(null, cnt.concat([1]));
    var Yc = function (c) { return H - B - c / maxC * (H - T - B - 22); };
    var svg = '<svg class="sm-ch" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Phổ điểm">';
    cnt.forEach(function (c, i) {
      var x = L + i * bw + 4, w = bw - 8, a = start + i * step, b = a + step;
      svg += '<rect class="f-accent" x="' + x.toFixed(1) + '" y="' + Yc(c).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + (H - B - Yc(c)).toFixed(1) + '" rx="5"><title>' + fmt(a) + '–' + fmt(b) + ' điểm: ' + c + ' học sinh</title></rect>';
      if (c) svg += chText(x + w / 2, Yc(c) - 8, 'ch-v', 'middle', String(c));
      svg += chText(x + w / 2, H - B + 24, 'ch-s', 'middle', fmt(a) + '–' + fmt(b));
    });
    svg += '<line class="ch-axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '"/>';
    var lines = d.thresholds.grade.filter(function (t) { return t.min != null && t.min >= start && t.min <= start + step * nb; });
    lines.forEach(function (t, i) {
      var x = L + (t.min - start) / (step * nb) * pw;
      svg += '<line class="ch-thr" x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + (T - 14 + (i % 2) * 0) + '" y2="' + (H - B) + '"/>' +
        chText(x, 18 + (i % 2) * 20, 'ch-thl', 'middle', t.label + ' ≥ ' + fmt(t.min));
    });
    return svg + chText(W / 2, H - 6, 'ch-s', 'middle', 'Điểm trung bình (TBC) của học sinh') + '</svg>';
  }

  // Thanh hai chiều quanh một trục giữa (dùng cho "mảng cộng/trừ" và "so sánh các tổ").
  // items: [{label, sub, v, text}]  — v > 0 vẽ sang phải (xanh), v < 0 sang trái (đỏ).
  function divBars(items, o) {
    var W = 640, padX = 100, top = o.axisLabel ? 40 : 16, rowH = 64, barH = 26;
    var H = top + items.length * rowH + (o.foot ? 40 : 8);
    var P = 0, N = 0;
    items.forEach(function (it) { if (it.v > 0) P = Math.max(P, it.v); else if (it.v < 0) N = Math.max(N, -it.v); });
    var plotW = W - padX * 2, tot = P + N, unit = tot ? plotW / tot : 0;
    var x0 = tot ? padX + N * unit : padX + plotW / 2;
    var svg = '<svg class="sm-ch" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.aria || '') + '">';
    items.forEach(function (it, i) {
      var y = top + i * rowH, len = Math.abs(it.v) * unit;
      if (it.v !== 0 && len < 3) len = 3;
      svg += chText(8, y + 20, 'ch-v ch-vl', 'start', it.label);
      if (it.sub) svg += chText(W - 8, y + 20, 'ch-s', 'end', it.sub);
      if (it.v !== 0) svg += '<rect class="' + (it.v > 0 ? 'f-good' : 'f-bad') + '" x="' + (it.v > 0 ? x0 : x0 - len).toFixed(1) + '" y="' + (y + 30) + '" width="' + len.toFixed(1) + '" height="' + barH + '" rx="6"/>';
      var tx = it.v > 0 ? x0 + len + 10 : (it.v < 0 ? x0 - len - 10 : x0 + 10);
      svg += chText(tx, y + 30 + barH / 2 + 6, 'ch-v ' + (it.v > 0 ? 'ch-up' : (it.v < 0 ? 'ch-dn' : 'ch-flat')), it.v < 0 ? 'end' : 'start', it.text);
    });
    items.forEach(function (it, i) {
      var y = top + i * rowH;
      svg += '<line class="ch-axis" x1="' + x0.toFixed(1) + '" x2="' + x0.toFixed(1) + '" y1="' + (y + 26) + '" y2="' + (y + 30 + barH + 4) + '"/>';
    });
    if (o.axisLabel) svg += chText(x0, 22, 'ch-s', 'middle', o.axisLabel);
    if (o.foot) svg += chText(8, H - 12, 'ch-s', 'start', o.foot);
    return svg + '</svg>';
  }

  // 4) Cả lớp được cộng / bị trừ ở mảng nào
  function chCat(d) {
    var t = { study: 0, discipline: 0, movement: 0 }, pos = 0, neg = 0;
    d.rows.forEach(function (r) { t.study += r.cat.study; t.discipline += r.cat.discipline; t.movement += r.cat.movement; pos += r.pos; neg += r.neg; });
    var items = [['Học tập', t.study], ['Nề nếp', t.discipline], ['Phong trào', t.movement]].map(function (x) {
      var v = r2(x[1]); return { label: x[0], v: v, text: sgn(v) };
    });
    return divBars(items, { aria: 'Cộng trừ theo mảng', foot: pos + ' lần được cộng • ' + neg + ' lần bị trừ (cả lớp)' });
  }

  // 5) So sánh các tổ (so với điểm TB cả lớp)
  function chGroups(d) {
    var gs = d.stats.groups.filter(function (g) { return g.group !== '' && g.group != null; });
    if (!gs.length) return chEmpty('Lớp chưa chia tổ nên chưa có gì để so sánh.');
    var base = d.stats.classAvg;
    gs = gs.slice().sort(function (a, b) { return b.avg - a.avg; });
    var items = gs.map(function (g) {
      var v = r2(g.avg - base); return { label: 'Tổ ' + g.group, sub: 'TB ' + fmt(g.avg), v: v, text: v === 0 ? '＝' : sgn(v) };
    });
    return divBars(items, { aria: 'So sánh các tổ', axisLabel: 'TB cả lớp ' + fmt(base) });
  }

  // 6) Tăng / giảm hạng nhiều nhất (chỉ khi đang bật so sánh 2 kỳ)
  function chClimb(d) {
    if (!d.compare) return chEmpty('Bật “So sánh 2 kỳ” để xem những bạn lên hạng và tụt hạng nhiều nhất giữa hai kỳ.', '<button class="sm-btn primary" data-act="cmp-enable">Bật so sánh 2 kỳ</button>');
    var up = d.rows.filter(function (r) { return r.climb > 0; }).sort(function (a, b) { return (b.climb - a.climb) || (a.rankB - b.rankB); }).slice(0, 5);
    var down = d.rows.filter(function (r) { return r.climb < 0; }).sort(function (a, b) { return (a.climb - b.climb) || (a.rankB - b.rankB); }).slice(0, 5);
    if (!up.length && !down.length) return chEmpty('Giữa hai kỳ này không có bạn nào đổi hạng.');
    var W = 640, nameW = 190, rowH = 38, secH = 32, left = nameW + 10, half = (W - left - 8) / 2, x0 = left + half;
    var maxAbs = Math.max.apply(null, up.concat(down).map(function (r) { return Math.abs(r.climb); }).concat([1]));
    var unit = (half - 56) / maxAbs;
    var H = (up.length ? secH + up.length * rowH : 0) + (down.length ? secH + down.length * rowH : 0) + 6;
    var svg = '<svg class="sm-ch" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Tăng giảm hạng">';
    var y = 0;
    var section = function (title, cls, list) {
      if (!list.length) return;
      svg += chText(0, y + 22, 'ch-d ' + cls, 'start', title);
      y += secH;
      list.forEach(function (r) {
        var len = Math.max(3, Math.abs(r.climb) * unit), nm = String(r.name); if (nm.length > 21) nm = nm.slice(0, 20) + '…';
        svg += chText(0, y + 17, 'ch-nm', 'start', nm) + chText(0, y + 32, 'ch-s ch-s2', 'start', 'hạng ' + r.rankA + ' → ' + r.rankB) +
          '<rect class="' + (r.climb > 0 ? 'f-good' : 'f-bad') + '" x="' + (r.climb > 0 ? x0 : x0 - len).toFixed(1) + '" y="' + (y + 7) + '" width="' + len.toFixed(1) + '" height="24" rx="5"/>' +
          chText(r.climb > 0 ? x0 + len + 8 : x0 - len - 8, y + 25, 'ch-v ' + cls, r.climb > 0 ? 'start' : 'end', (r.climb > 0 ? '▲ ' : '▼ ') + Math.abs(r.climb));
        y += rowH;
      });
    };
    section('▲ TĂNG HẠNG NHIỀU NHẤT', 'ch-up', up);
    section('▼ GIẢM HẠNG NHIỀU NHẤT', 'ch-dn', down);
    svg += '<line class="ch-axis" x1="' + x0.toFixed(1) + '" x2="' + x0.toFixed(1) + '" y1="0" y2="' + (H - 4) + '"/>';
    return svg + '</svg>';
  }

  function chartsHTML(d) {
    var cmpSub = d.compare ? 'Kỳ đầu (' + cmpLbl(d.compare.a) + ') → kỳ sau (' + cmpLbl(d.compare.b) + '); tối đa 5 bạn mỗi nhóm.' : 'So sánh vị thứ giữa hai kỳ.';
    return '<div class="sm-ch-grid">' +
      chCard('Biến động tổng điểm cả lớp theo tuần', 'Tổng điểm của cả lớp (' + d.rows.length + ' học sinh) ở từng tuần; ▲ ▼ là chênh lệch so với tuần trước.', chWeekly(d), '', 'weekly') +
      chCard('Phân bố xếp loại', 'Số học sinh theo từng xếp loại, ' + rangeLbl(d) + '.', chDonut(d), '', 'donut') +
      chCard('Phổ điểm', 'Số học sinh theo khoảng điểm trung bình (TBC). Đường nét đứt là ngưỡng xếp loại.', chHist(d), '', 'hist') +
      chCard('Cả lớp được cộng / bị trừ ở mảng nào', 'Tổng điểm cộng/trừ của cả lớp theo từng mảng, ' + rangeLbl(d) + '.', chCat(d), '', 'cat') +
      chCard('So sánh các tổ', 'Điểm TB của từng tổ so với TB cả lớp. Thanh sang phải là cao hơn, sang trái là thấp hơn.', chGroups(d), '', 'groups') +
      chCard('Tăng / giảm hạng nhiều nhất', cmpSub, chClimb(d), '', 'climb') +
    '</div>';
  }

  /* ---------- ẨN / HIỆN (checkbox nằm ở tab Xem của ribbon) ---------- */
  // Huy hiệu số cột đang ẩn trên tab "Xem".
  function updateHideBtn() {
    var tab = $('#rb-t-view'); if (!tab) return;
    var n = HIDE_ITEMS.filter(function (it) { return state.hide[it[0]]; }).length;
    var bd = tab.querySelector('.bd');
    if (!n) { if (bd) bd.remove(); return; }
    if (!bd) { tab.appendChild(document.createTextNode(' ')); bd = document.createElement('span'); bd.className = 'bd'; bd.title = 'Số cột đang ẩn'; tab.appendChild(bd); }
    bd.textContent = n;
  }
  function applyHide() { renderRows(); renderSelection(); }

  /* ---------- sự kiện ---------- */
  function scheduleLoad() {
    clearTimeout(debounceT);
    debounceT = setTimeout(function () { load(state.from, state.to); }, 250);
  }
  document.addEventListener('click', function (ev) {
    // Ribbon đang thu gọn và mở tạm: bấm ra ngoài thì đóng lại
    if (state.rcol && state.ropen && !ev.target.closest('#sm-ribbon')) { state.ropen = false; renderFilters(true); }
    var el = ev.target.closest('[data-act]'); if (!el) { if (ev.target.id === 'sm-drawer-bg') closeSelection(); return; }
    var act = el.getAttribute('data-act');
    tierReplayEl = el; tierReplayAt = Date.now();
    if (act === 'reload') load(state.from, state.to);
    else if (act === 'cmp-prev') {
      var pp = prevPeriod(state.cmp.b.from, state.cmp.b.to);
      if (!pp) { toast('Kỳ sau đang bắt đầu từ tuần đầu tiên nên chưa có kỳ liền trước.', true); return; }
      state.cmp.a = pp; load(state.from, state.to);
    }
    else if (act === 'climb') {
      if (!needTier('max', 'So sánh 2 kỳ và “Tăng hạng”')) return;
      if (!state.cmp.on) enableCmp(true);
      else {
        state.sort = state.sort.key === 'climb' ? { key: 'climb', dir: -state.sort.dir } : { key: 'climb', dir: -1 };
        renderFilters(); renderRows();
      }
    }
    else if (act === 'view') { var vv = el.getAttribute('data-v'); if (vv === 'charts' && !needTier('max', 'Biểu đồ Tổng kết')) return; setView(vv); }
    else if (act === 'cmp-enable') enableCmp(false);
    else if (act === 'chart-open') openChart(el.getAttribute('data-c'));
    else if (act === 'rb-tab') {
      var t = el.getAttribute('data-t');
      if (state.rcol) { state.ropen = state.rtab === t && state.ropen ? false : true; state.rtab = t; }
      else state.rtab = t;
      renderFilters(true);
    }
    else if (act === 'rb-fold') toggleFold();
    else if (act === 'hide-all') { state.hide = {}; saveHide(); renderFilters(true); applyHide(); }
    else if (act === 'sort') {
      var k = el.getAttribute('data-k');
      state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: (k === 'name' || k === 'rank' || k === 'rankA' || k === 'rankB') ? 1 : -1 };
      renderFilters(); renderRows();
    }
    else if (act === 'fgrade') { var v = el.getAttribute('data-v'); state.grade = state.grade === v ? '' : v; renderStats(); renderRows(); }
    else if (act === 'open') openStudent(el.getAttribute('data-id'));
    else if (act === 'close') closeSelection();
    else if (act === 'tab') { state.tab = el.getAttribute('data-t'); applyTab(); revealPanel(); }
    else if (act === 'export') { if (needTier('plus', 'Xuất Excel Tổng kết')) exportXlsx(); }
    else if (act === 'print') {
      if (!needTier('plus', 'In Tổng kết')) return;
      api('getSummaryReport', { use: 'print' }).then(function () { window.print(); }).catch(function (e) {
        if (e.locked && window.A3AI && window.A3AI.showUpgrade) window.A3AI.showUpgrade(e.message); else toast(e.message || 'Không in được.', true);
      });
    }
    else if (act === 'ai-student') { if (needTier('plus', 'AI nhận xét học sinh')) runAi('student', { studentId: el.getAttribute('data-id') }, '#sm-ai-student'); }
    else if (act === 'ai-class') { if (!needTier('plus', 'AI nhận xét cả lớp')) return; showAiOut(); runAi('class', null, '#sm-ai-class'); }
    else if (act === 'ai-insight') { if (!needTier('plus', 'AI phân tích tiến bộ / sa sút')) return; showAiOut(); runAi('insight', null, '#sm-ai-class'); }
    else if (act === 'ai-ask') {
      var q = ($('#sm-ask').value || '').trim();
      if (!needTier('max', 'Hỏi AI tự do về số liệu')) return;
      if (!q) { toast('Hãy nhập câu hỏi.', true); return; }
      showAiOut(); runAi('ask', { question: q }, '#sm-ai-class');
    }
    // Như Excel: bấm một lệnh (nút lớn) xong thì ribbon đang mở tạm tự đóng lại
    if (state.rcol && state.ropen && el.classList.contains('rb-big') && act !== 'rb-tab') { state.ropen = false; renderFilters(true); }
  });
  document.addEventListener('dblclick', function (ev) {
    if (ev.target.closest && ev.target.closest('.rb-tab')) toggleFold();   // nhấp đúp vào tab = thu gọn / mở rộng
  });
  document.addEventListener('change', function (ev) {
    var hk = ev.target.getAttribute && ev.target.getAttribute('data-hide');
    if (hk) {
      if (ev.target.checked) delete state.hide[hk]; else state.hide[hk] = true;
      saveHide(); applyHide(); return;
    }
    var id = ev.target.id, a = state.cmp.a, b = state.cmp.b;
    if (id === 'sm-from') { state.from = +ev.target.value; if (state.from > state.to) state.to = state.from; scheduleLoad(); }
    else if (id === 'sm-to') { state.to = +ev.target.value; if (state.to < state.from) state.from = state.to; scheduleLoad(); }
    else if (id === 'sm-cmp-on') {
      if (ev.target.checked && !needTier('max', 'So sánh 2 kỳ và “Tăng hạng”')) { ev.target.checked = false; return; }
      state.cmp.on = ev.target.checked;
      if (state.cmp.on) {
        var dc = defaultCmp();
        if (dc) { state.cmp.a = dc.a; state.cmp.b = dc.b; }
        else {
          toast('Khoảng tuần đang chọn quá ngắn để tự chia 2 kỳ — hãy chọn kỳ đầu và kỳ sau thủ công.', true);
          var w0 = state.data.allWeeks[0].week; state.cmp.a = { from: w0, to: w0 }; state.cmp.b = { from: w0, to: w0 };
        }
      }
      load(state.from, state.to);
    }
    else if (id === 'sm-af') { a.from = +ev.target.value; if (a.from > a.to) a.to = a.from; scheduleLoad(); }
    else if (id === 'sm-at') { a.to = +ev.target.value; if (a.to < a.from) a.from = a.to; scheduleLoad(); }
    else if (id === 'sm-bf') { b.from = +ev.target.value; if (b.from > b.to) b.to = b.from; scheduleLoad(); }
    else if (id === 'sm-bt') { b.to = +ev.target.value; if (b.to < b.from) b.from = b.to; scheduleLoad(); }
    else if (id === 'sm-g') { state.group = ev.target.value; renderRows(); }
  });
  document.addEventListener('input', function (ev) {
    if (ev.target.id === 'sm-q') {
      state.q = ev.target.value; renderRows();   // ô tìm kiếm không bị dựng lại nên giữ nguyên con trỏ
    }
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && state.rcol && state.ropen) { state.ropen = false; renderFilters(true); return; }
    if (ev.key === 'Escape' && state.selected && state.data && state.data.canViewAll) closeSelection();
    var cc = ev.target.closest && ev.target.closest('.sm-chcard[data-act="chart-open"]');
    if (cc && ev.target === cc && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); openChart(cc.getAttribute('data-c')); return; }
    // Bảng: Enter/Space mở chi tiết, ↑ ↓ lướt dòng (màn rộng: chi tiết đổi theo dòng đang chọn)
    var tr = ev.target.closest && ev.target.closest('tr[data-act="open"]');
    if (tr && ev.target === tr) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openStudent(tr.getAttribute('data-id')); }
      else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        var sib = ev.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling;
        if (sib && sib.getAttribute('data-act') === 'open') { ev.preventDefault(); sib.focus(); if (isWide()) openStudent(sib.getAttribute('data-id')); }
      }
    }
    if (ev.key === 'Enter' && ev.target.id === 'sm-ask') { ev.preventDefault(); var b = $('[data-act="ai-ask"]'); if (b) b.click(); }
  });

  /* ---------- cầu nối cho summary-charts.js (chế độ xem riêng từng biểu đồ) ---------- */
  window.SMBridge = {
    state: state, api: api, toast: toast, esc: esc, fmt: fmt, sgn: sgn, r2: r2, chText: chText,
    toneOf: toneOf, weekLabel: weekLabel, cmpLbl: cmpLbl, weekNos: weekNos, prevPeriod: prevPeriod, defaultCmp: defaultCmp,
  };

  /* ---------- khởi động ---------- */
  function init() {
    $('#sm-root').innerHTML =
      // Ribbon: hàng tab (tiêu đề • tab • thông tin • nút thu gọn) + bảng lệnh của tab đang chọn
      '<header class="rb" id="sm-ribbon">' +
        '<div class="rb-top"><h1 class="rb-title">Tổng kết</h1>' +
          '<div class="rb-tabs" id="sm-rtabs" role="tablist" aria-label="Thanh công cụ"></div>' +
          '<div class="rb-info"><span class="rb-sub" id="sm-sub">Đang tải…</span><span class="rb-count" id="sm-count" title="Bấm tiêu đề cột để sắp xếp • bấm vào dòng để xem chi tiết"></span></div>' +
          '<button type="button" class="rb-fold" data-act="rb-fold" aria-label="Thu gọn thanh công cụ" aria-expanded="true" title="Thu gọn thanh công cụ (hoặc nhấp đúp vào tab)">⌃</button></div>' +
        '<div class="rb-panel" id="sm-rpanel" role="tabpanel" hidden></div>' +
      '</header>' +
      '<div class="sm-printhead"><h1>Tổng kết</h1><p id="sm-psub"></p></div>' +
      '<div class="sm-layout" id="sm-layout">' +
        '<div class="sm-side"><div id="sm-stats"></div><section class="sm-card sm-panel" id="sm-panel" data-tab="ai" hidden></section></div>' +
        '<div id="sm-main"></div>' +
      '</div>' +
      '<div class="sm-drawer-bg" id="sm-drawer-bg" hidden></div><aside class="sm-drawer" id="sm-drawer" hidden></aside>';
    // Đổi kích thước cửa sổ qua ngưỡng 1100px: chuyển chi tiết giữa ngăn kéo ↔ cột phải
    var onMQ = function () {
      if (!state.data || !state.data.canViewAll) return;
      if (isWide()) { if (state.selected) state.tab = 'detail'; } else state.selected = '';
      renderSelection();
    };
    if (wideMQ.addEventListener) wideMQ.addEventListener('change', onMQ); else if (wideMQ.addListener) wideMQ.addListener(onMQ);
    var saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(RANGE_KEY) || 'null'); } catch (e) {}
    if (saved && saved.cmp && saved.cmp.on && saved.cmp.a && saved.cmp.b && saved.cmp.a.from && saved.cmp.b.from) {
      state.cmp = { on: true, a: { from: +saved.cmp.a.from, to: +saved.cmp.a.to }, b: { from: +saved.cmp.b.from, to: +saved.cmp.b.to } };
    }
    load(saved && saved.from, saved && saved.to);
    loadTier();   // biết gói của lớp để hiện 🔒 (server vẫn kiểm tra lại)
    window.addEventListener('a3-plan-changed', function () { loadTier(); });   // vừa thanh toán xong → mở khoá ngay
    document.addEventListener('visibilitychange', function () { if (!document.hidden) loadTier(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
/* ============================================================
   A3K64 — Tổng kết: chế độ xem RIÊNG của từng biểu đồ
   Bấm vào một biểu đồ ở tab "Biểu đồ" → mở cửa sổ lớn của đúng biểu đồ đó, có công cụ riêng:
     • Biến động tuần : phạm vi tuần riêng, đường/cột/vùng, theo điểm tổng hay TB mỗi HS, lọc tổ / tách theo tổ,
                        đường xu hướng, đường TB, nhãn số, bấm vào tuần để xem top/đáy.
     • Phân bố xếp loại: vòng/cột, hiện số HS hoặc %, lọc tổ, bấm chú thích để ẩn/hiện, bấm xếp loại để xem danh sách.
     • Phổ điểm       : TBC hoặc tổng điểm, độ rộng khoảng, lọc tổ/giới tính, ngưỡng xếp loại, bấm cột xem danh sách.
     • Cộng/trừ mảng  : cả lớp hoặc theo tổ, tổng hoặc TB mỗi HS, bấm mảng xem ai cộng/trừ nhiều nhất.
     • So sánh các tổ : TB / tổng / chênh so với TB lớp, sắp xếp, bấm tổ xem thành viên.
     • Tăng/giảm hạng : chọn riêng 2 kỳ, số bạn hiển thị, chỉ tăng / chỉ giảm, lọc tổ.
   Chung: phóng to/thu nhỏ, tải PNG, tải CSV, in, đặt lại công cụ, chuyển nhanh giữa các biểu đồ (← →).
   Dữ liệu của cửa sổ này tải riêng theo phạm vi tuần riêng — KHÔNG đổi bộ lọc của trang chính.
   Phụ thuộc: summary.js (window.SMBridge). Điểm/xếp loại/vị thứ vẫn do server tính.
   ============================================================ */
(function () {
  'use strict';
  var B = window.SMBridge; if (!B) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = B.esc, fmt = B.fmt, sgn = B.sgn, r2 = B.r2, T = B.chText;

  var OPTS_KEY = 'a3k64-summary-cx';
  var ORDER = ['weekly', 'donut', 'hist', 'cat', 'groups', 'climb'];
  var META = {
    weekly: { t: 'Biến động tổng điểm theo tuần', i: '📈', s: 'Biến động' },
    donut:  { t: 'Phân bố xếp loại', i: '🍩', s: 'Xếp loại' },
    hist:   { t: 'Phổ điểm', i: '📊', s: 'Phổ điểm' },
    cat:    { t: 'Cộng / trừ theo mảng', i: '⚖️', s: 'Mảng' },
    groups: { t: 'So sánh các tổ', i: '👥', s: 'Các tổ' },
    climb:  { t: 'Tăng / giảm hạng', i: '🏆', s: 'Hạng' },
  };
  var DEF = {
    weekly: { metric: 'total', type: 'line', group: '', split: false, labels: true, delta: true, trend: false, avg: false },
    donut:  { type: 'donut', unit: 'count', group: '', hide: {} },
    hist:   { metric: 'avg', step: 'auto', group: '', gender: '', thr: true },
    cat:    { mode: 'all', unit: 'sum', group: '' },
    groups: { metric: 'avg', sort: 'desc' },
    climb:  { show: 'both', n: '5', group: '' },
  };
  var CATS = [['study', 'Học tập'], ['discipline', 'Nề nếp'], ['movement', 'Phong trào']];
  var PAL = ['var(--accent)', '#f59e0b', '#38bdf8', '#f472b6', '#34d399', '#fb7185', '#facc15', '#60a5fa'];

  /* ---------- trạng thái ---------- */
  var CX = { open: false, key: null, d: null, rng: {}, cmp: null, zoom: 1, sel: null };
  var cache = {}, seq = 0, lastFocus = null;
  var OPTS = loadOpts();

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function loadOpts() {
    var out = {}, saved = {};
    try { saved = JSON.parse(localStorage.getItem(OPTS_KEY) || '{}') || {}; } catch (e) {}
    ORDER.forEach(function (k) {
      out[k] = clone(DEF[k]);
      var sv = saved[k]; if (!sv || typeof sv !== 'object') return;
      Object.keys(DEF[k]).forEach(function (f) {
        if (sv[f] != null && typeof sv[f] === typeof DEF[k][f]) out[k][f] = sv[f];
      });
    });
    return out;
  }
  function saveOpts() { try { localStorage.setItem(OPTS_KEY, JSON.stringify(OPTS)); } catch (e) {} }
  function O() { return OPTS[CX.key]; }

  /* ---------- tiện ích dữ liệu ---------- */
  function rowsOf(d, o) { return o.group ? d.rows.filter(function (r) { return String(r.group) === String(o.group); }) : d.rows; }
  function groupsOf(d) {
    var m = {};
    d.rows.forEach(function (r) { if (r.group !== '' && r.group != null) m[r.group] = 1; });
    return Object.keys(m).sort(function (a, b) { return (+a - +b) || a.localeCompare(b); });
  }
  function sumBy(rs, f) { var s = 0; rs.forEach(function (r) { s += f(r); }); return s; }
  function mean(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : 0; }
  function median(a) {
    if (!a.length) return 0;
    var b = a.slice().sort(function (x, y) { return x - y; }), m = Math.floor(b.length / 2);
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  }
  function wk(d, i) { return 'Tuần ' + d.weeks[i]; }
  function gLbl(o) { return o.group ? 'Tổ ' + o.group : 'Cả lớp'; }
  function rangeTxt(d) { return 'tuần ' + d.fromWeek + (d.toWeek !== d.fromWeek ? ' → ' + d.toWeek : ''); }
  function pillH(label) { return '<span class="sm-pill tone-' + B.toneOf('grade', label) + '">' + esc(label) + '</span>'; }

  /* ---------- mẩu HTML dùng chung ---------- */
  function kv(list) {
    return '<dl class="cx-kv">' + list.map(function (x) { return '<div><dt>' + esc(x[0]) + '</dt><dd>' + x[1] + '</dd></div>'; }).join('') + '</dl>';
  }
  function miniList(title, items) {
    return '<h4 class="cx-h">' + esc(title) + '</h4>' + (items.length
      ? '<ol class="cx-list">' + items.map(function (it) {
          return '<li><span class="n">' + esc(it.name) + (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') + '</span><b class="' + (it.cls || '') + '">' + it.val + '</b></li>';
        }).join('') + '</ol>'
      : '<p class="cx-none">Không có dữ liệu.</p>');
  }
  function stuItem(r, val, cls) { return { name: r.name, sub: (r.group !== '' ? 'Tổ ' + r.group + ' · ' : '') + 'hạng ' + r.rank, val: val, cls: cls }; }
  function selHead(txt) { return '<div class="cx-selhead"><b>' + esc(txt) + '</b><button class="sm-chip" data-cx-clr>Bỏ chọn</button></div>'; }
  function hint(txt) { return '<p class="cx-hint">' + esc(txt) + '</p>'; }

  /* ---------- ô công cụ ---------- */
  function gSel(name, label, opts, val) {
    return '<div class="sm-field cx-f"><label>' + esc(label) + '</label><select data-cx-sel="' + name + '">' + opts.map(function (x) {
      return '<option value="' + esc(x[0]) + '"' + (String(x[0]) === String(val) ? ' selected' : '') + '>' + esc(x[1]) + '</option>';
    }).join('') + '</select></div>';
  }
  function gSeg(name, label, opts, val) {
    return '<div class="sm-field cx-f"><label>' + esc(label) + '</label><div class="cx-seg">' + opts.map(function (x) {
      return '<button type="button" data-cx-set="' + name + '" data-v="' + esc(x[0]) + '" class="' + (String(x[0]) === String(val) ? 'on' : '') + '">' + esc(x[1]) + '</button>';
    }).join('') + '</div></div>';
  }
  function gChk(label, items) {
    return '<div class="sm-field cx-f"><label>' + esc(label) + '</label><div class="cx-row">' + items.map(function (x) {
      return '<label class="cx-chk"><input type="checkbox" data-cx-chk="' + x[0] + '"' + (x[2] ? ' checked' : '') + (x[3] ? ' disabled' : '') + '> ' + esc(x[1]) + '</label>';
    }).join('') + '</div></div>';
  }
  function weekOpts() { return (B.state.data.allWeeks || []).map(function (w) { return [w.week, w.label]; }); }
  function groupOpts(d) { return [['', 'Cả lớp']].concat(groupsOf(d).map(function (g) { return [g, 'Tổ ' + g]; })); }
  function rangeTools() {
    var r = CX.rng[CX.key], wo = weekOpts();
    return gSel('from', 'Từ tuần', wo, r.from) + gSel('to', 'Đến tuần', wo, r.to);
  }

  function toolsHTML(d, o) {
    var k = CX.key, g = d ? groupOpts(d) : [['', 'Cả lớp']], noGroups = !d || groupsOf(d).length < 2;
    var h = '';
    if (k === 'climb') {
      var c = CX.cmp, wo = weekOpts();
      if (c) h += gSel('a.from', 'Kỳ đầu: từ tuần', wo, c.a.from) + gSel('a.to', 'Đến tuần', wo, c.a.to) +
        '<div class="cx-arrow" aria-hidden="true">→</div>' +
        gSel('b.from', 'Kỳ sau: từ tuần', wo, c.b.from) + gSel('b.to', 'Đến tuần', wo, c.b.to) +
        '<div class="sm-field cx-f"><label>Kỳ</label><div class="cx-row"><button class="sm-chip" data-cx-cmp="prev" title="Đặt kỳ đầu là kỳ liền trước kỳ sau">Kỳ liền trước</button><button class="sm-chip" data-cx-cmp="swap">⇄ Đổi chỗ</button></div></div>';
      h += gSeg('show', 'Hiển thị', [['both', 'Cả hai'], ['up', '▲ Tăng'], ['down', '▼ Giảm']], o.show) +
        gSel('n', 'Số bạn mỗi nhóm', [['5', '5'], ['10', '10'], ['15', '15'], ['0', 'Tất cả']], o.n) +
        (noGroups ? '' : gSel('group', 'Lọc theo tổ', g, o.group));
      return h;
    }
    h += rangeTools();
    if (k === 'weekly') {
      h += gSeg('type', 'Kiểu', [['line', 'Đường'], ['area', 'Vùng'], ['bar', 'Cột']], o.type) +
        gSeg('metric', 'Chỉ số', [['total', 'Tổng điểm'], ['avg', 'TB mỗi HS']], o.metric) +
        (noGroups ? '' : gSel('group', 'Đối tượng', g, o.group)) +
        gChk('Hiển thị', [['labels', 'Nhãn số', o.labels && !o.split, o.split], ['delta', '▲▼ chênh', o.delta && !o.split, o.split], ['trend', 'Xu hướng', o.trend, o.split], ['avg', 'Đường TB', o.avg, o.split]]) +
        (noGroups ? '' : gChk('Tách', [['split', 'Mỗi tổ một đường', o.split && !o.group, !!o.group]]));
    } else if (k === 'donut') {
      h += gSeg('type', 'Kiểu', [['donut', 'Vòng'], ['bar', 'Cột ngang']], o.type) +
        gSeg('unit', 'Hiện', [['count', 'Số HS'], ['pct', '%']], o.unit) +
        (noGroups ? '' : gSel('group', 'Đối tượng', g, o.group));
    } else if (k === 'hist') {
      var genders = {}; if (d) d.rows.forEach(function (r) { if (r.gender) genders[r.gender] = 1; });
      var go = [['', 'Tất cả']].concat(Object.keys(genders).map(function (x) { return [x, x]; }));
      h += gSeg('metric', 'Đo theo', [['avg', 'TBC'], ['total', 'Tổng điểm']], o.metric) +
        gSel('step', 'Độ rộng khoảng', [['auto', 'Tự động'], ['5', '5'], ['10', '10'], ['20', '20'], ['25', '25'], ['50', '50'], ['100', '100'], ['200', '200'], ['500', '500']], o.step) +
        (noGroups ? '' : gSel('group', 'Đối tượng', g, o.group)) +
        (go.length > 2 ? gSel('gender', 'Giới tính', go, o.gender) : '') +
        gChk('Hiển thị', [['thr', 'Ngưỡng xếp loại', o.thr]]);
    } else if (k === 'cat') {
      h += gSeg('unit', 'Đơn vị', [['sum', 'Tổng điểm'], ['per', 'TB mỗi HS']], o.unit) +
        (noGroups ? '' : gSel('group', 'Đối tượng', g, o.group)) +
        (noGroups ? '' : gSeg('mode', 'Cách xem', [['all', 'Gộp'], ['groups', 'Theo tổ']], o.group ? 'all' : o.mode));
    } else if (k === 'groups') {
      h += gSeg('metric', 'Chỉ số', [['avg', 'TB (TBC)'], ['diff', 'Chênh so với TB lớp'], ['total', 'Tổng điểm']], o.metric) +
        gSeg('sort', 'Sắp xếp', [['desc', 'Cao → thấp'], ['asc', 'Thấp → cao'], ['name', 'Theo tổ']], o.sort);
    }
    return h;
  }

  /* ---------- thanh hai chiều quanh trục 0 (mảng, tổ) ---------- */
  // items: [{id,label,sub,v,text,fill,tcls}]   o: {pick, axisLabel, ref:{v,label}, foot, rowH, barH, aria}
  function dbars(items, o) {
    var W = 1000, rowH = o.rowH || 62, barH = o.barH || 26, top = (o.axisLabel || o.ref) ? 46 : 18;
    var H = top + items.length * rowH + (o.foot ? 46 : 12);
    var P = 0, N = 0;
    items.forEach(function (it) { if (it.v > 0) P = Math.max(P, it.v); else if (it.v < 0) N = Math.max(N, -it.v); });
    if (o.ref) { if (o.ref.v > 0) P = Math.max(P, o.ref.v); else if (o.ref.v < 0) N = Math.max(N, -o.ref.v); }
    var padL = N > 0 ? 130 : 30, padR = 150, plotW = W - padL - padR, tot = P + N, unit = tot ? plotW / tot : 0;
    var x0 = tot ? padL + N * unit : padL + plotW / 2;
    var sel = CX.sel && CX.sel.t === o.pick ? CX.sel.id : null;
    var svg = '<svg class="sm-ch" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.aria || '') + '">';
    items.forEach(function (it, i) {
      var y = top + i * rowH, len = Math.abs(it.v) * unit;
      if (it.v !== 0 && len < 3) len = 3;
      if (sel === String(it.id)) svg += '<rect class="cx-band" x="0" y="' + (y - 2) + '" width="' + W + '" height="' + (rowH - 4) + '" rx="8"/>';
      svg += T(10, y + 20, 'ch-v ch-vl', 'start', it.label);
      if (it.sub) svg += T(W - 10, y + 20, 'ch-s', 'end', it.sub);
      if (it.v !== 0) svg += '<rect class="' + (it.fill || (it.v > 0 ? 'f-good' : 'f-bad')) + '" x="' + (it.v > 0 ? x0 : x0 - len).toFixed(1) + '" y="' + (y + 30) + '" width="' + len.toFixed(1) + '" height="' + barH + '" rx="6"/>';
      var tx = it.v > 0 ? x0 + len + 10 : (it.v < 0 ? x0 - len - 10 : x0 + 10);
      svg += T(tx, y + 30 + barH / 2 + 6, it.tcls || ('ch-v ' + (it.v > 0 ? 'ch-up' : (it.v < 0 ? 'ch-dn' : 'ch-flat'))), it.v < 0 ? 'end' : 'start', it.text);
    });
    items.forEach(function (it, i) {
      var y = top + i * rowH;
      svg += '<line class="ch-axis" x1="' + x0.toFixed(1) + '" x2="' + x0.toFixed(1) + '" y1="' + (y + 26) + '" y2="' + (y + 30 + barH + 4) + '"/>';
    });
    if (o.ref) {
      var xr = x0 + o.ref.v * unit;
      svg += '<line class="ch-thr" x1="' + xr.toFixed(1) + '" x2="' + xr.toFixed(1) + '" y1="34" y2="' + (H - (o.foot ? 40 : 8)) + '"/>' + T(xr, 22, 'ch-s', 'middle', o.ref.label);
    } else if (o.axisLabel) svg += T(x0, 24, 'ch-s', 'middle', o.axisLabel);
    if (o.foot) svg += T(10, H - 14, 'ch-s', 'start', o.foot);
    // vùng bấm (đặt trên cùng)
    items.forEach(function (it, i) {
      svg += '<rect class="cx-hit" data-cx-pick="' + o.pick + '" data-id="' + esc(it.id) + '" x="0" y="' + (top + i * rowH - 2) + '" width="' + W + '" height="' + (rowH - 4) + '" rx="8"><title>' + esc(it.label + (it.sub ? ' · ' + it.sub : '') + ': ' + it.text) + '</title></rect>';
    });
    return { W: W, H: H, svg: svg + '</svg>' };
  }

  /* ============================================================
     1) BIẾN ĐỘNG THEO TUẦN
     ============================================================ */
  function bWeekly(d, o) {
    var n = d.nWeeks;
    if (n < 2) return { empty: 'Đang chọn 1 tuần (không có gì để so sánh giữa các tuần). Hãy mở rộng “Từ tuần / Đến tuần” ở thanh công cụ.' };
    var gs = groupsOf(d), split = !!(o.split && !o.group && gs.length > 1), bar = o.type === 'bar', area = o.type === 'area' && !split;
    var avgM = o.metric === 'avg';
    var calc = function (rs, i) { var s = sumBy(rs, function (r) { return r.scores[i]; }); return r2(avgM ? (rs.length ? s / rs.length : 0) : s); };
    var series = [], rs0 = rowsOf(d, o);
    if (split) gs.forEach(function (g, k) {
      var rs = d.rows.filter(function (r) { return String(r.group) === g; });
      series.push({ name: 'Tổ ' + g, color: PAL[k % PAL.length], v: d.weeks.map(function (w, i) { return calc(rs, i); }) });
    });
    else series.push({ name: gLbl(o), color: PAL[0], v: d.weeks.map(function (w, i) { return calc(rs0, i); }) });
    var ns = series.length, v0 = series[0].v;

    var W = 1000, H = 540, L = 92, R = 30, Tp = split ? 76 : 54, Bt = (o.delta && !split) ? 106 : 80;
    var all = []; series.forEach(function (s) { all = all.concat(s.v); });
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    if (bar) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    if (hi === lo) { hi += 1; lo -= 1; }
    var pad = (hi - lo) * (bar ? 0.12 : 0.18);
    hi += pad; if (!bar || lo < 0) lo -= pad;
    var pw = W - L - R, sw = pw / n, ph = H - Tp - Bt;
    var X = function (i) { return L + (i + 0.5) * sw; };
    var Y = function (v) { return Tp + (hi - v) / (hi - lo) * ph; };
    var dec = (hi - lo) < 10 ? 1 : 0;
    var sel = CX.sel && CX.sel.t === 'week' ? CX.sel.i : -1;
    var svg = '<svg class="sm-ch" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(META.weekly.t) + '">';
    for (var g = 0; g < 5; g++) {
      var gv = lo + (hi - lo) * g / 4, gy = Y(gv);
      svg += '<line class="ch-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + gy.toFixed(1) + '" y2="' + gy.toFixed(1) + '"/>' + T(L - 12, gy + 5, 'ch-s', 'end', fmt(+gv.toFixed(dec)));
    }
    if (lo < 0 && hi > 0) svg += '<line class="ch-axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(0).toFixed(1) + '" y2="' + Y(0).toFixed(1) + '"/>';
    if (sel >= 0) svg += '<rect class="cx-band" x="' + (L + sel * sw).toFixed(1) + '" y="' + Tp + '" width="' + sw.toFixed(1) + '" height="' + ph + '"/>';

    series.forEach(function (s, k) {
      var st = ns > 1 ? ' style="stroke:' + s.color + '"' : '';
      if (bar) {
        var bw = Math.min(sw * 0.78 / ns, 70), y0 = Y(0);
        s.v.forEach(function (v, i) {
          var y = Y(v), x = X(i) - bw * ns / 2 + k * bw;
          svg += '<rect class="f-accent"' + (ns > 1 ? ' style="fill:' + s.color + '"' : '') + ' x="' + (x + 1).toFixed(1) + '" y="' + Math.min(y, y0).toFixed(1) + '" width="' + (bw - 2).toFixed(1) + '" height="' + Math.max(1, Math.abs(y0 - y)).toFixed(1) + '" rx="4"/>';
        });
      } else {
        var pts = s.v.map(function (v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' ');
        if (area) svg += '<polygon class="ch-area" points="' + pts + ' ' + X(n - 1).toFixed(1) + ',' + Y(lo).toFixed(1) + ' ' + X(0).toFixed(1) + ',' + Y(lo).toFixed(1) + '"/>';
        svg += '<polyline class="ch-line" fill="none"' + st + ' points="' + pts + '"/>';
        s.v.forEach(function (v, i) { svg += '<circle class="ch-dot"' + st + ' cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="' + (ns > 1 ? 4.5 : 6.5) + '"/>'; });
      }
    });

    // nhãn số, nhãn tuần, chênh lệch
    var ls = Math.ceil(n / 12), xs = Math.max(1, Math.ceil(n / (pw / 74)));
    if (o.labels && !split) v0.forEach(function (v, i) {
      if (i % ls === 0 || i === n - 1) svg += T(X(i), (bar && v < 0) ? Y(v) + 24 : Y(v) - 13, 'ch-v', 'middle', fmt(v));
    });
    for (var i = 0; i < n; i++) {
      if (i % xs !== 0 && i !== n - 1) continue;
      svg += T(X(i), H - Bt + 28, 'ch-l', 'middle', (n > 8 ? 'T' : 'Tuần ') + d.weeks[i]);
      if (o.delta && !split && i > 0) {
        var dl = r2(v0[i] - v0[i - 1]);
        svg += T(X(i), H - Bt + 54, dl > 0 ? 'ch-d ch-up' : (dl < 0 ? 'ch-d ch-dn' : 'ch-d ch-flat'), 'middle', (dl > 0 ? '▲ ' : (dl < 0 ? '▼ ' : '＝ ')) + fmt(Math.abs(dl)));
      }
    }

    // xu hướng + TB
    var slope = 0, m0 = mean(v0);
    if (!split) {
      var mx = (n - 1) / 2, num = 0, den = 0;
      v0.forEach(function (v, i) { num += (i - mx) * (v - m0); den += (i - mx) * (i - mx); });
      slope = den ? num / den : 0;
      var ic = m0 - slope * mx;
      if (o.trend) {
        svg += '<line class="ch-trend" x1="' + X(0).toFixed(1) + '" y1="' + Y(ic).toFixed(1) + '" x2="' + X(n - 1).toFixed(1) + '" y2="' + Y(ic + slope * (n - 1)).toFixed(1) + '"/>' +
          T(L, 28, 'ch-s ch-lw', 'start', '┄ Xu hướng: ' + sgn(r2(slope)) + ' điểm/tuần');
      }
      if (o.avg) {
        svg += '<line class="ch-avgl" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(m0).toFixed(1) + '" y2="' + Y(m0).toFixed(1) + '"/>' + T(W - R, Y(m0) - 8, 'ch-s ch-lf', 'end', 'TB kỳ: ' + fmt(r2(m0)));
      }
    }
    if (split) {
      var lx = L;
      series.forEach(function (s) {
        svg += '<rect x="' + lx + '" y="14" width="16" height="16" rx="4" style="fill:' + s.color + '"/>' + T(lx + 22, 28, 'ch-s ch-lg', 'start', s.name);
        lx += 22 + 14 + s.name.length * 9;
      });
    }
    // vùng bấm từng tuần
    for (var j = 0; j < n; j++) {
      var tip = split ? wk(d, j) + '\n' + series.map(function (s) { return s.name + ': ' + fmt(s.v[j]); }).join('\n')
        : wk(d, j) + ': ' + fmt(v0[j]) + (j > 0 ? ' (' + (v0[j] - v0[j - 1] >= 0 ? '▲ ' : '▼ ') + fmt(Math.abs(r2(v0[j] - v0[j - 1]))) + ')' : '');
      svg += '<rect class="cx-hit" data-cx-pick="week" data-i="' + j + '" x="' + (L + j * sw).toFixed(1) + '" y="' + Tp + '" width="' + sw.toFixed(1) + '" height="' + ph + '"><title>' + esc(tip) + '</title></rect>';
    }
    svg += '</svg>';

    // cột bên
    var side = '';
    if (sel >= 0) {
      var arr = (split ? d.rows : rs0).map(function (r) { return { r: r, v: r.scores[sel] }; }).sort(function (a, b) { return b.v - a.v; });
      side += selHead(wk(d, sel));
      if (split) side += miniList('Điểm từng tổ trong tuần', series.slice().sort(function (a, b) { return b.v[sel] - a.v[sel]; }).map(function (s) { return { name: s.name, val: fmt(s.v[sel]), cls: s.v[sel] < 0 ? 'neg' : '' }; }));
      else {
        var dv = sel > 0 ? r2(v0[sel] - v0[sel - 1]) : null;
        side += kv([[avgM ? 'TB mỗi HS' : 'Tổng điểm', '<b>' + fmt(v0[sel]) + '</b>']].concat(dv == null ? [] : [['So với tuần trước', '<span class="' + (dv > 0 ? 'up' : (dv < 0 ? 'dn' : '')) + '">' + (dv > 0 ? '▲ ' : (dv < 0 ? '▼ ' : '＝ ')) + fmt(Math.abs(dv)) + '</span>']]));
      }
      side += miniList('Điểm cao nhất tuần', arr.slice(0, 5).map(function (x) { return stuItem(x.r, fmt(x.v), x.v < 0 ? 'neg' : 'pos'); })) +
        miniList('Điểm thấp nhất tuần', arr.slice(-5).reverse().map(function (x) { return stuItem(x.r, fmt(x.v), x.v < 0 ? 'neg' : 'pos'); }));
    } else if (split) {
      side += hint('Bấm vào một tuần trên biểu đồ để xem điểm từng tổ và top học sinh của tuần đó.') +
        miniList('Trung bình qua các tuần', series.map(function (s) { return { name: s.name, val: fmt(r2(mean(s.v))) }; }));
    } else {
      var mxI = v0.indexOf(Math.max.apply(null, v0)), mnI = v0.indexOf(Math.min.apply(null, v0));
      var dls = v0.map(function (v, i) { return i ? r2(v - v0[i - 1]) : null; }), best = -1, worst = -1;
      dls.forEach(function (x, i) { if (x == null) return; if (best < 0 || x > dls[best]) best = i; if (worst < 0 || x < dls[worst]) worst = i; });
      var rows = [['Cao nhất', wk(d, mxI) + ' · <b>' + fmt(v0[mxI]) + '</b>'], ['Thấp nhất', wk(d, mnI) + ' · <b>' + fmt(v0[mnI]) + '</b>']];
      if (best >= 0 && dls[best] > 0) rows.push(['Tăng mạnh nhất', wk(d, best) + ' · <span class="up">▲ ' + fmt(dls[best]) + '</span>']);
      if (worst >= 0 && dls[worst] < 0) rows.push(['Giảm mạnh nhất', wk(d, worst) + ' · <span class="dn">▼ ' + fmt(Math.abs(dls[worst])) + '</span>']);
      rows.push(['Trung bình kỳ', '<b>' + fmt(r2(m0)) + '</b>'], ['Đầu → cuối kỳ', fmt(v0[0]) + ' → ' + fmt(v0[n - 1])], ['Xu hướng', '<span class="' + (slope > 0 ? 'up' : (slope < 0 ? 'dn' : '')) + '">' + sgn(r2(slope)) + ' / tuần</span>']);
      side += hint('Bấm vào một tuần trên biểu đồ để xem top / đáy học sinh của tuần đó.') + kv(rows);
    }
    var csv = [['Tuần'].concat(series.map(function (s) { return s.name + (avgM ? ' (TB mỗi HS)' : ' (tổng điểm)'); }))];
    d.weeks.forEach(function (w, i) { csv.push(['Tuần ' + w].concat(series.map(function (s) { return s.v[i]; }))); });
    return { W: W, H: H, svg: svg, side: side, csv: csv, sub: (avgM ? 'Điểm TB mỗi học sinh' : 'Tổng điểm') + ' · ' + (split ? 'từng tổ' : gLbl(o)) + ' · ' + rangeTxt(d) };
  }

  /* ============================================================
     2) PHÂN BỐ XẾP LOẠI
     ============================================================ */
  function bDonut(d, o) {
    var rs = rowsOf(d, o);
    if (!rs.length) return { empty: 'Không có học sinh nào trong phạm vi này.' };
    var labels = (d.thresholds.grade || []).map(function (t) { return t.label; });
    var items = labels.map(function (l) { return { label: l, count: rs.filter(function (r) { return r.grade === l; }).length, hid: !!o.hide[l] }; });
    var vis = items.filter(function (x) { return !x.hid; }), tot = sumBy(vis, function (x) { return x.count; });
    var sel = CX.sel && CX.sel.t === 'grade' ? CX.sel.id : null;
    var W = 1000, H = 480, svg = '<svg class="sm-ch" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(META.donut.t) + '">';
    var pct = function (c) { return tot ? Math.round(c / tot * 100) : 0; };
    var val = function (x) { return o.unit === 'pct' ? pct(x.count) + '%' : String(x.count); };
    var legX = o.type === 'donut' ? 590 : 60;
    if (o.type === 'donut') {
      var cx = 280, cy = 240, Rr = 150, C = 2 * Math.PI * Rr, off = 0;
      svg += '<circle class="ch-track" cx="' + cx + '" cy="' + cy + '" r="' + Rr + '" fill="none" stroke-width="76"/>';
      vis.forEach(function (x) {
        if (!x.count || !tot) return;
        var len = x.count / tot * C, mid = (off + len / 2) / C * 2 * Math.PI - Math.PI / 2;
        svg += '<circle class="sg-' + B.toneOf('grade', x.label) + '" cx="' + cx + '" cy="' + cy + '" r="' + Rr + '" fill="none" stroke-width="' + (sel === x.label ? 92 : 76) + '" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')" data-cx-pick="grade" data-id="' + esc(x.label) + '" style="cursor:pointer"><title>' + esc(x.label + ': ' + x.count + ' học sinh (' + pct(x.count) + '%)') + '</title></circle>';
        if (x.count / tot >= 0.06) svg += '<text class="ch-onring" x="' + (cx + Rr * Math.cos(mid)).toFixed(1) + '" y="' + (cy + Rr * Math.sin(mid) + 7).toFixed(1) + '" text-anchor="middle" pointer-events="none">' + esc(val(x)) + '</text>';
        off += len;
      });
      svg += T(cx, cy + 8, 'ch-big', 'middle', String(tot)) + T(cx, cy + 40, 'ch-s', 'middle', 'học sinh');
    } else {
      var mxc = Math.max.apply(null, vis.map(function (x) { return x.count; }).concat([1]));
      vis.forEach(function (x, i) {
        var y = 40 + i * 104, w = x.count / mxc * 560;
        if (sel === x.label) svg += '<rect class="cx-band" x="0" y="' + (y - 14) + '" width="' + W + '" height="90" rx="8"/>';
        svg += T(60, y + 18, 'ch-v ch-vl', 'start', x.label) +
          '<rect class="fg-' + B.toneOf('grade', x.label) + '" x="60" y="' + (y + 30) + '" width="' + Math.max(w, x.count ? 4 : 0).toFixed(1) + '" height="34" rx="7"/>' +
          T(60 + Math.max(w, 4) + 14, y + 55, 'ch-v', 'start', val(x) + (o.unit === 'pct' ? '  (' + x.count + ' HS)' : '  (' + pct(x.count) + '%)'));
        svg += '<rect class="cx-hit" data-cx-pick="grade" data-id="' + esc(x.label) + '" x="0" y="' + (y - 14) + '" width="' + W + '" height="90"/>';
      });
    }
    if (o.type === 'donut') {
      var y0 = 240 - items.length * 62 / 2 + 24;
      items.forEach(function (x, i) {
        var y = y0 + i * 62;
        svg += '<g data-cx-leg="' + esc(x.label) + '" style="cursor:pointer"' + (x.hid ? ' class="cx-dim"' : '') + '><title>Bấm để ' + (x.hid ? 'hiện' : 'ẩn') + ' “' + esc(x.label) + '”</title>' +
          '<rect x="' + (legX - 14) + '" y="' + (y - 30) + '" width="400" height="54" rx="10" fill="transparent"/>' +
          '<rect class="fg-' + B.toneOf('grade', x.label) + '" x="' + legX + '" y="' + (y - 18) + '" width="24" height="24" rx="6"/>' +
          T(legX + 38, y + 1, 'ch-v ch-vl', 'start', x.label) + T(W - 20, y + 1, 'ch-v', 'end', x.hid ? 'ẩn' : (o.unit === 'pct' ? pct(x.count) + '% · ' + x.count + ' HS' : x.count + ' HS · ' + pct(x.count) + '%')) + '</g>';
      });
      svg += T(W / 2, H - 10, 'ch-s', 'middle', 'Bấm tên xếp loại để ẩn / hiện  •  bấm miếng bánh để xem danh sách');
    }
    svg += '</svg>';
    var side = '';
    if (sel) {
      var mem = rs.filter(function (r) { return r.grade === sel; }).sort(function (a, b) { return a.rank - b.rank; });
      side += selHead('Xếp loại ' + sel + ' · ' + mem.length + ' HS') + miniList('Danh sách (theo vị thứ)', mem.map(function (r) { return stuItem(r, fmt(r.avg), r.avg < 0 ? 'neg' : 'pos'); }));
    } else {
      var up = items.slice(0, 2), upN = sumBy(up, function (x) { return x.count; });
      side += hint('Bấm vào một xếp loại để xem danh sách học sinh.') + kv([['Học sinh', '<b>' + rs.length + '</b>'], ['TBC của nhóm', '<b>' + fmt(r2(mean(rs.map(function (r) { return r.avg; })))) + '</b>']].concat(
        items.length > 1 ? [[up.map(function (x) { return x.label; }).join(' + '), '<b>' + upN + ' HS</b> · ' + (rs.length ? Math.round(upN / rs.length * 100) : 0) + '%']] : []));
    }
    var csv = [['Xếp loại', 'Số HS', 'Tỉ lệ %']].concat(items.map(function (x) { return [x.label, x.count, rs.length ? Math.round(x.count / rs.length * 1000) / 10 : 0]; }));
    return { W: W, H: H, svg: svg, side: side, csv: csv, sub: gLbl(o) + ' · ' + rs.length + ' học sinh · ' + rangeTxt(d) };
  }

  /* ============================================================
     3) PHỔ ĐIỂM
     ============================================================ */
  function bHist(d, o) {
    var rs = rowsOf(d, o).filter(function (r) { return !o.gender || r.gender === o.gender; });
    if (!rs.length) return { empty: 'Không có học sinh nào khớp bộ lọc.' };
    var key = o.metric === 'total' ? 'total' : 'avg';
    var vals = rs.map(function (r) { return r[key]; });
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), span = mx - mn, step = 1;
    var nice = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
    var pick = function (raw) { return nice.filter(function (v) { return v >= raw; })[0] || raw; };
    if (+o.step > 0) step = +o.step; else if (span > 0) step = pick(span / 8);
    if (span / step > 60) step = pick(span / 60);
    var start = Math.floor(mn / step) * step, nb = Math.floor((mx - start) / step + 1e-9) + 1;
    var bins = []; for (var k = 0; k < nb; k++) bins.push([]);
    rs.forEach(function (r) { bins[Math.min(nb - 1, Math.floor((r[key] - start) / step + 1e-9))].push(r); });
    var W = 1000, H = 540, L = 30, R = 30, Tp = 84, Bt = 74, pw = W - L - R, bw = pw / nb;
    var maxC = Math.max.apply(null, bins.map(function (b) { return b.length; }).concat([1]));
    var Yc = function (c) { return H - Bt - c / maxC * (H - Tp - Bt - 26); };
    var sel = CX.sel && CX.sel.t === 'bin' ? +CX.sel.i : -1, skip = Math.max(1, Math.ceil(nb / 10));
    var svg = '<svg class="sm-ch" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(META.hist.t) + '">';
    if (sel >= 0) svg += '<rect class="cx-band" x="' + (L + sel * bw).toFixed(1) + '" y="' + (Tp - 20) + '" width="' + bw.toFixed(1) + '" height="' + (H - Bt - Tp + 20) + '"/>';
    bins.forEach(function (b, i) {
      var c = b.length, x = L + i * bw + 4, w = bw - 8, a = start + i * step, e = a + step;
      svg += '<rect class="' + (sel === i ? 'f-sel' : 'f-accent') + '" x="' + x.toFixed(1) + '" y="' + Yc(c).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(c ? 2 : 0, H - Bt - Yc(c)).toFixed(1) + '" rx="5"/>';
      if (c) svg += T(x + w / 2, Yc(c) - 9, 'ch-v', 'middle', String(c));
      if (i % skip === 0) svg += T(x + w / 2, H - Bt + 26, 'ch-s', 'middle', fmt(a) + '–' + fmt(e));
    });
    svg += '<line class="ch-axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - Bt) + '" y2="' + (H - Bt) + '"/>';
    if (o.thr) {
      var kk = key === 'total' ? d.nWeeks : 1;
      d.thresholds.grade.filter(function (t) { return t.min != null; }).forEach(function (t, i) {
        var tv = t.min * kk; if (tv < start || tv > start + step * nb) return;
        var x = L + (tv - start) / (step * nb) * pw;
        svg += '<line class="ch-thr" x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + (Tp - 14) + '" y2="' + (H - Bt) + '"/>' + T(x, 24 + (i % 2) * 22, 'ch-thl', 'middle', t.label + ' ≥ ' + fmt(tv));
      });
    }
    svg += T(W / 2, H - 12, 'ch-s', 'middle', key === 'total' ? 'Tổng điểm của học sinh trong kỳ' : 'Điểm trung bình (TBC) của học sinh');
    bins.forEach(function (b, i) {
      var a = start + i * step, e = a + step;
      svg += '<rect class="cx-hit" data-cx-pick="bin" data-i="' + i + '" x="' + (L + i * bw).toFixed(1) + '" y="' + (Tp - 20) + '" width="' + bw.toFixed(1) + '" height="' + (H - Bt - Tp + 20) + '"><title>' + esc(fmt(a) + '–' + fmt(e) + ': ' + b.length + ' học sinh') + '</title></rect>';
    });
    svg += '</svg>';
    var side = '';
    if (sel >= 0) {
      var mem = bins[sel].slice().sort(function (a, b) { return b[key] - a[key]; });
      side += selHead(fmt(start + sel * step) + '–' + fmt(start + (sel + 1) * step) + ' · ' + mem.length + ' HS') + miniList('Danh sách', mem.map(function (r) { return stuItem(r, fmt(r[key]), r[key] < 0 ? 'neg' : 'pos'); }));
    } else {
      var mdn = median(vals);
      side += hint('Bấm vào một cột để xem những bạn nằm trong khoảng điểm đó.') + kv([['Số học sinh', '<b>' + rs.length + '</b>'], ['Trung bình', '<b>' + fmt(r2(mean(vals))) + '</b>'], ['Trung vị', '<b>' + fmt(r2(mdn)) + '</b>'], ['Thấp nhất', fmt(mn)], ['Cao nhất', fmt(mx)], ['Độ rộng khoảng', fmt(r2(step))]]);
    }
    var csv = [['Từ', 'Đến', 'Số HS']].concat(bins.map(function (b, i) { return [r2(start + i * step), r2(start + (i + 1) * step), b.length]; }));
    return { W: W, H: H, svg: svg, side: side, csv: csv, sub: (key === 'total' ? 'Tổng điểm' : 'TBC') + ' · ' + gLbl(o) + (o.gender ? ' · ' + o.gender : '') + ' · ' + rangeTxt(d) };
  }

  /* ============================================================
     4) CỘNG / TRỪ THEO MẢNG
     ============================================================ */
  function bCat(d, o) {
    var gs = groupsOf(d), per = o.unit === 'per', byG = o.mode === 'groups' && !o.group && gs.length > 1;
    var rs = rowsOf(d, o), items = [], pos = 0, neg = 0;
    var tot = function (list, c, kk) { return r2(sumBy(list, function (r) { return r.cat[c]; }) * kk); };
    if (byG) gs.forEach(function (g) {
      var gr = d.rows.filter(function (r) { return String(r.group) === g; }), kk = per && gr.length ? 1 / gr.length : 1;
      CATS.forEach(function (c) { var v = tot(gr, c[0], kk); items.push({ id: g + '|' + c[0], label: 'Tổ ' + g + ' · ' + c[1], v: v, text: sgn(v) }); });
    });
    else CATS.forEach(function (c) { var v = tot(rs, c[0], per && rs.length ? 1 / rs.length : 1); items.push({ id: c[0], label: c[1], v: v, text: sgn(v) }); });
    rs.forEach(function (r) { pos += r.pos; neg += r.neg; });
    var foot = byG ? '' : pos + ' lần được cộng • ' + neg + ' lần bị trừ (' + gLbl(o).toLowerCase() + ')';
    var bars = dbars(items, { pick: 'cat', aria: META.cat.t, foot: foot, rowH: byG ? 44 : 62, barH: byG ? 20 : 26 });
    var sel = CX.sel && CX.sel.t === 'cat' ? String(CX.sel.id) : null, side = '';
    if (sel) {
      var pr = sel.split('|'), cat = pr.length > 1 ? pr[1] : pr[0], gg = pr.length > 1 ? pr[0] : o.group, cn = CATS.filter(function (c) { return c[0] === cat; })[0][1];
      var mem = (gg ? d.rows.filter(function (r) { return String(r.group) === String(gg); }) : d.rows);
      var plus = mem.filter(function (r) { return r.cat[cat] > 0; }).sort(function (a, b) { return b.cat[cat] - a.cat[cat]; }).slice(0, 7);
      var minus = mem.filter(function (r) { return r.cat[cat] < 0; }).sort(function (a, b) { return a.cat[cat] - b.cat[cat]; }).slice(0, 7);
      side += selHead(cn + (gg ? ' · Tổ ' + gg : '')) +
        miniList('Được cộng nhiều nhất', plus.map(function (r) { return stuItem(r, sgn(r.cat[cat]), 'pos'); })) +
        miniList('Bị trừ nhiều nhất', minus.map(function (r) { return stuItem(r, sgn(r.cat[cat]), 'neg'); }));
    } else side += hint('Bấm vào một thanh để xem những bạn được cộng / bị trừ nhiều nhất ở mảng đó.') +
      kv([['Phạm vi', '<b>' + esc(byG ? 'Từng tổ' : gLbl(o)) + '</b>'], ['Lần được cộng', '<b class="up">' + pos + '</b>'], ['Lần bị trừ', '<b class="dn">' + neg + '</b>']]);
    var csv = [['Đối tượng', 'Mảng', per ? 'Điểm TB mỗi HS' : 'Tổng điểm']].concat(items.map(function (it) { var p = it.label.split(' · '); return [p[0], p[1] || p[0], it.v]; }));
    return { W: bars.W, H: bars.H, svg: bars.svg, side: side, csv: csv, sub: (per ? 'Điểm TB mỗi HS' : 'Tổng điểm') + ' · ' + (byG ? 'từng tổ' : gLbl(o)) + ' · ' + rangeTxt(d) };
  }

  /* ============================================================
     5) SO SÁNH CÁC TỔ
     ============================================================ */
  function bGroups(d, o) {
    var gs = groupsOf(d);
    if (!gs.length) return { empty: 'Lớp chưa chia tổ nên chưa có gì để so sánh.' };
    var base = d.stats.classAvg;
    var list = gs.map(function (g) {
      var rs = d.rows.filter(function (r) { return String(r.group) === g; });
      return { g: g, n: rs.length, avg: r2(mean(rs.map(function (r) { return r.avg; }))), total: r2(sumBy(rs, function (r) { return r.total; })) };
    });
    var m = o.metric, valOf = function (x) { return m === 'total' ? x.total : (m === 'diff' ? r2(x.avg - base) : x.avg); };
    list.sort(function (a, b) { return o.sort === 'name' ? (+a.g - +b.g) : (o.sort === 'asc' ? valOf(a) - valOf(b) : valOf(b) - valOf(a)); });
    var items = list.map(function (x) {
      var v = valOf(x);
      return { id: x.g, label: 'Tổ ' + x.g, sub: x.n + ' HS' + (m === 'avg' ? '' : ' · TB ' + fmt(x.avg)), v: v, text: m === 'diff' ? (v === 0 ? '＝' : sgn(v)) : fmt(v), fill: m === 'diff' ? null : 'f-accent', tcls: m === 'diff' ? null : 'ch-v' };
    });
    var bars = dbars(items, { pick: 'group', aria: META.groups.t, axisLabel: m === 'diff' ? 'TB cả lớp ' + fmt(base) : '', ref: m === 'avg' ? { v: base, label: 'TB cả lớp ' + fmt(base) } : null });
    var sel = CX.sel && CX.sel.t === 'group' ? String(CX.sel.id) : null, side = '';
    if (sel) {
      var mem = d.rows.filter(function (r) { return String(r.group) === sel; }).sort(function (a, b) { return a.rank - b.rank; });
      side += selHead('Tổ ' + sel + ' · ' + mem.length + ' HS') + miniList('Thành viên (theo vị thứ)', mem.map(function (r) { return { name: r.name, sub: 'hạng ' + r.rank, val: fmt(r.avg) + ' ' + pillH(r.grade), cls: r.avg < 0 ? 'neg' : '' }; }));
    } else side += hint('Bấm vào một tổ để xem thành viên và điểm của từng bạn.') + kv([['TB cả lớp', '<b>' + fmt(base) + '</b>'], ['Tổ cao nhất', 'Tổ ' + list.slice().sort(function (a, b) { return b.avg - a.avg; })[0].g], ['Tổ thấp nhất', 'Tổ ' + list.slice().sort(function (a, b) { return a.avg - b.avg; })[0].g]]);
    var csv = [['Tổ', 'Số HS', 'TB (TBC)', 'Chênh so với TB lớp', 'Tổng điểm']].concat(list.map(function (x) { return ['Tổ ' + x.g, x.n, x.avg, r2(x.avg - base), x.total]; }));
    return { W: bars.W, H: bars.H, svg: bars.svg, side: side, csv: csv, sub: 'So với TB cả lớp ' + fmt(base) + ' · ' + rangeTxt(d) };
  }

  /* ============================================================
     6) TĂNG / GIẢM HẠNG
     ============================================================ */
  function bClimb(d, o) {
    if (!d || !d.compare) return { empty: CX.cmp ? 'Không tải được dữ liệu so sánh.' : 'Cần ít nhất 2 tuần dữ liệu để so sánh hai kỳ.' };
    var rs = rowsOf(d, o).filter(function (r) { return r.climb != null; }), lim = +o.n || 9999;
    var up = o.show === 'down' ? [] : rs.filter(function (r) { return r.climb > 0; }).sort(function (a, b) { return (b.climb - a.climb) || (a.rankB - b.rankB); }).slice(0, lim);
    var down = o.show === 'up' ? [] : rs.filter(function (r) { return r.climb < 0; }).sort(function (a, b) { return (a.climb - b.climb) || (a.rankB - b.rankB); }).slice(0, lim);
    var cl = d.compare;
    var subTxt = 'Kỳ đầu (' + B.cmpLbl(cl.a) + ') → kỳ sau (' + B.cmpLbl(cl.b) + ')' + (o.group ? ' · Tổ ' + o.group : '');
    if (!up.length && !down.length) return { empty: 'Giữa hai kỳ này không có bạn nào đổi hạng (theo bộ lọc hiện tại).', sub: subTxt };
    var W = 1000, nameW = 300, rowH = 42, secH = 38, left = nameW + 14, half = (W - left - 14) / 2, x0 = left + half;
    var maxAbs = Math.max.apply(null, up.concat(down).map(function (r) { return Math.abs(r.climb); }).concat([1]));
    var unit = (half - 70) / maxAbs;
    var H = (up.length ? secH + up.length * rowH : 0) + (down.length ? secH + down.length * rowH : 0) + 10;
    var sel = CX.sel && CX.sel.t === 'stu' ? String(CX.sel.id) : null;
    var svg = '<svg class="sm-ch" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(META.climb.t) + '">', y = 0, rowsY = [];
    var section = function (title, cls, list) {
      if (!list.length) return;
      svg += T(0, y + 26, 'ch-d ' + cls, 'start', title); y += secH;
      list.forEach(function (r) {
        var len = Math.max(3, Math.abs(r.climb) * unit), nm = String(r.name); if (nm.length > 26) nm = nm.slice(0, 25) + '…';
        if (sel === r.id) svg += '<rect class="cx-band" x="0" y="' + (y - 1) + '" width="' + W + '" height="' + (rowH - 2) + '" rx="7"/>';
        svg += T(4, y + 19, 'ch-nm', 'start', nm) + T(4, y + 35, 'ch-s ch-s2', 'start', 'hạng ' + r.rankA + ' → ' + r.rankB) +
          '<rect class="' + (r.climb > 0 ? 'f-good' : 'f-bad') + '" x="' + (r.climb > 0 ? x0 : x0 - len).toFixed(1) + '" y="' + (y + 8) + '" width="' + len.toFixed(1) + '" height="26" rx="5"/>' +
          T(r.climb > 0 ? x0 + len + 9 : x0 - len - 9, y + 27, 'ch-v ' + cls, r.climb > 0 ? 'start' : 'end', (r.climb > 0 ? '▲ ' : '▼ ') + Math.abs(r.climb));
        rowsY.push([r, y]); y += rowH;
      });
    };
    section('▲ TĂNG HẠNG NHIỀU NHẤT', 'ch-up', up);
    section('▼ GIẢM HẠNG NHIỀU NHẤT', 'ch-dn', down);
    svg += '<line class="ch-axis" x1="' + x0.toFixed(1) + '" x2="' + x0.toFixed(1) + '" y1="0" y2="' + (H - 4) + '"/>';
    rowsY.forEach(function (p) {
      svg += '<rect class="cx-hit" data-cx-pick="stu" data-id="' + esc(p[0].id) + '" x="0" y="' + (p[1] - 1) + '" width="' + W + '" height="' + (rowH - 2) + '" rx="7"><title>' + esc(p[0].name + ': hạng ' + p[0].rankA + ' → ' + p[0].rankB) + '</title></rect>';
    });
    svg += '</svg>';
    var side = '', st = sel ? rs.filter(function (r) { return r.id === sel; })[0] : null;
    if (st) {
      side += selHead(st.name) + kv([
        ['Tổ', st.group !== '' ? 'Tổ ' + st.group : '—'],
        ['Hạng kỳ đầu → kỳ sau', '<b>' + st.rankA + ' → ' + st.rankB + '</b>'],
        ['Thay đổi', '<span class="' + (st.climb > 0 ? 'up' : (st.climb < 0 ? 'dn' : '')) + '">' + (st.climb > 0 ? '▲ ' : (st.climb < 0 ? '▼ ' : '＝ ')) + Math.abs(st.climb) + ' bậc</span>'],
        ['TBC kỳ đầu → kỳ sau', st.baseAvg != null ? fmt(st.baseAvg) + ' → ' + fmt(st.avg) : fmt(st.avg)],
        ['Xếp loại kỳ sau', pillH(st.grade)]]);
    } else {
      var nUp = rs.filter(function (r) { return r.climb > 0; }).length, nDn = rs.filter(function (r) { return r.climb < 0; }).length;
      side += hint('Bấm vào một bạn để xem chi tiết hạng và điểm hai kỳ.') + kv([['Lên hạng', '<b class="up">' + nUp + ' HS</b>'], ['Xuống hạng', '<b class="dn">' + nDn + ' HS</b>'], ['Giữ nguyên', '<b>' + (rs.length - nUp - nDn) + ' HS</b>']]);
    }
    var csv = [['Họ và tên', 'Tổ', 'Hạng kỳ đầu', 'Hạng kỳ sau', 'Tăng hạng']].concat(rs.slice().sort(function (a, b) { return b.climb - a.climb; }).map(function (r) { return [r.name, r.group, r.rankA, r.rankB, r.climb]; }));
    return { W: W, H: H, svg: svg, side: side, csv: csv, sub: subTxt };
  }

  var BUILD = { weekly: bWeekly, donut: bDonut, hist: bHist, cat: bCat, groups: bGroups, climb: bClimb };

  /* ---------- dữ liệu riêng của cửa sổ ---------- */
  function getReport(from, to) {
    var k = from + '-' + to;
    if (!cache[k]) cache[k] = B.api('getSummaryReport', { fromWeek: from, toWeek: to, use: 'charts' });   // use:'charts' → server khoá gói Max
    return cache[k].catch(function (e) { delete cache[k]; throw e; });
  }
  function getCmp(c) {
    var k = 'c' + c.a.from + '-' + c.a.to + '_' + c.b.from + '-' + c.b.to;
    if (!cache[k]) cache[k] = B.api('getSummaryReport', { fromWeek: c.b.from, toWeek: c.b.to, compareFrom: c.a.from, compareTo: c.a.to, use: 'charts' }).then(function (x) {
      (x.rows || []).forEach(function (r) { r.rankA = r.baseRank; r.rankB = r.rank; });
      // server trả compare = kỳ đầu, còn khoảng chính (fromWeek/toWeek) = kỳ sau → chuẩn hóa thành {a, b} như trang chính
      if (x.compare) x.compare = { a: { fromWeek: x.compare.fromWeek, toWeek: x.compare.toWeek }, b: { fromWeek: x.fromWeek, toWeek: x.toWeek } };
      return x;
    });
    return cache[k].catch(function (e) { delete cache[k]; throw e; });
  }
  function fetchData() {
    if (CX.key === 'climb') return CX.cmp ? getCmp(CX.cmp) : Promise.resolve(null);
    var r = CX.rng[CX.key];
    return getReport(r.from, r.to);   // luôn hỏi server (use:'charts'), không dùng lại dữ liệu bảng để server còn kiểm tra gói
  }
  function initRange(key) {
    var m = B.state.data;
    if (!CX.rng[key]) CX.rng[key] = { from: m.fromWeek, to: m.toWeek };
  }
  function defaultCmpAll() {
    var s = B.state;
    if (s.cmp.on && s.cmp.a.from && s.cmp.b.from) return { a: { from: s.cmp.a.from, to: s.cmp.a.to }, b: { from: s.cmp.b.from, to: s.cmp.b.to } };
    var dc = B.defaultCmp(); if (dc) return dc;
    var nos = B.weekNos(), h = Math.floor(nos.length / 2);
    return h >= 1 ? { a: { from: nos[0], to: nos[h - 1] }, b: { from: nos[h], to: nos[nos.length - 1] } } : null;
  }

  async function reload() {
    var my = ++seq; busy(true);
    var d = null;
    try { d = await fetchData(); } catch (e) { if (my !== seq) return; B.toast(e.message || 'Không tải được dữ liệu.', true); d = CX.key === 'climb' ? null : B.state.data; }
    if (my !== seq) return;
    CX.d = d; busy(false); paint();
  }
  function busy(on) { var w = $('.cx-win'); if (w) w.classList.toggle('is-busy', !!on); }

  /* ---------- vẽ cửa sổ ---------- */
  function paint() {
    if (!CX.open) return;
    var o = O(), d = CX.d, b;
    var focusSig = sigOf(document.activeElement);
    if (!d && CX.key !== 'climb') b = { empty: 'Không có dữ liệu.' };
    else b = BUILD[CX.key](d, o);
    $('#cx-h').textContent = META[CX.key].t;
    $('#cx-sub').textContent = b.sub || (d ? rangeTxt(d) : '');
    $('#cx-tabs').innerHTML = ORDER.map(function (k) {
      return '<button type="button" role="tab" data-cx-go="' + k + '" class="' + (k === CX.key ? 'on' : '') + '" aria-selected="' + (k === CX.key) + '">' + META[k].i + ' <span>' + META[k].s + '</span></button>';
    }).join('');
    $('#cx-tools').innerHTML = toolsHTML(d, o);
    var st = $('#cx-stage'), sd = $('#cx-side');
    // Hiệu ứng (summary-fx): chỉ chạy lại khi biểu đồ / công cụ / dữ liệu đổi; bấm chọn một cột thì không "mọc lại" từ đầu.
    var fxSig = CX.key + '|' + JSON.stringify(o) + '|' + JSON.stringify(CX.rng[CX.key] || null) + '|' + (CX.key === 'climb' ? JSON.stringify(CX.cmp) : '');
    var fxNow = Date.now(), fxNew = fxSig !== CX.fxSig || d !== CX.fxD;
    if (fxNew) CX.fxAt = fxNow;
    var fxGo = fxNew || fxNow - (CX.fxAt || 0) < 450;   // vẽ lại ngay sau lần "mới" (reload nạp xong) → giữ hiệu ứng, khỏi bị cắt ngang
    CX.fxSig = fxSig; CX.fxD = d;
    st.setAttribute('data-fx', fxGo ? '1' : '0'); sd.setAttribute('data-fx', fxGo ? '1' : '0');
    if (b.empty) {
      st.innerHTML = '<div class="cx-empty"><p>' + esc(b.empty) + '</p></div>'; sd.innerHTML = ''; CX.last = null;
    } else {
      st.innerHTML = b.svg; sd.innerHTML = b.side; CX.last = b;
      fit();
    }
    if (focusSig) { var f = $(focusSig); if (f) f.focus(); }
  }
  // Chữ ký (selector) của nút/ô đang focus trong cửa sổ, để focus lại đúng chỗ sau khi dựng lại công cụ.
  function sigOf(e) {
    if (!e || !e.getAttribute || !e.closest || !e.closest('#cx-tools, #cx-tabs')) return '';
    var n;
    if ((n = e.getAttribute('data-cx-sel'))) return '[data-cx-sel="' + n + '"]';
    if ((n = e.getAttribute('data-cx-chk'))) return '[data-cx-chk="' + n + '"]';
    if ((n = e.getAttribute('data-cx-go'))) return '[data-cx-go="' + n + '"]';
    if ((n = e.getAttribute('data-cx-set'))) return '[data-cx-set="' + n + '"][data-v="' + e.getAttribute('data-v') + '"]';
    return '';
  }
  function fit() {
    var st = $('#cx-stage'), svg = st && $('svg.sm-ch', st); if (!svg) return;
    var vb = svg.viewBox.baseVal, cw = st.clientWidth - 32, ch = st.clientHeight - 32;
    var sw = cw / vb.width, sh = ch / vb.height, s = sw;
    if (sh > 0 && sh < sw) s = Math.max(sh, sw * 0.72);
    if (!(s > 0)) s = 1;
    s = Math.min(s, 1.7) * CX.zoom;
    svg.style.width = (vb.width * s).toFixed(0) + 'px'; svg.style.height = (vb.height * s).toFixed(0) + 'px';
    var zv = $('.cx-zv'); if (zv) zv.textContent = Math.round(CX.zoom * 100) + '%';
  }

  /* ---------- mở / đóng ---------- */
  function ensureDom() {
    if ($('#cx')) return;
    var el = document.createElement('div'); el.id = 'cx'; el.className = 'cx-bg'; el.hidden = true;
    el.innerHTML =
      '<div class="cx-win" role="dialog" aria-modal="true" aria-labelledby="cx-h">' +
        '<header class="cx-head">' +
          '<div class="cx-title"><h2 id="cx-h"></h2><p id="cx-sub"></p></div>' +
          '<div class="cx-acts">' +
            '<div class="cx-zoom"><button class="cx-ib" data-cx-zoom="-1" title="Thu nhỏ" aria-label="Thu nhỏ">−</button><button class="cx-ib cx-zv" data-cx-zoom="0" title="Vừa khung">100%</button><button class="cx-ib" data-cx-zoom="1" title="Phóng to" aria-label="Phóng to">+</button></div>' +
            '<button class="cx-ib" data-cx-act="reset" title="Đặt lại công cụ của biểu đồ này">↺ Đặt lại</button>' +
            '<button class="cx-ib" data-cx-act="csv" title="Tải số liệu của biểu đồ (CSV)">⬇ CSV</button>' +
            '<button class="cx-ib" data-cx-act="png" title="Tải hình biểu đồ (PNG)">🖼 PNG</button>' +
            '<button class="cx-ib" data-cx-act="print" title="In biểu đồ này">🖨 In</button>' +
            '<button class="cx-ib cx-x" data-cx-act="close" aria-label="Đóng (Esc)" title="Đóng (Esc)">✕</button>' +
          '</div>' +
        '</header>' +
        '<nav class="cx-tabs" id="cx-tabs" role="tablist" aria-label="Chọn biểu đồ"></nav>' +
        '<div class="cx-tools" id="cx-tools"></div>' +
        '<div class="cx-body"><div class="cx-stage" id="cx-stage"></div><aside class="cx-side" id="cx-side" aria-live="polite"></aside></div>' +
      '</div>';
    document.body.appendChild(el);
    bind(el);
    window.addEventListener('resize', function () { if (CX.open) fit(); });
  }
  function open(key) {
    if (!BUILD[key] || !B.state.data || !B.state.data.canViewAll) return;
    ensureDom();
    if (!CX.open) { CX.rng = {}; CX.cmp = defaultCmpAll(); lastFocus = document.activeElement; }
    CX.open = true; CX.key = key; CX.zoom = 1; CX.sel = null; CX.fxSig = null;
    initRange(key);
    $('#cx').hidden = false; document.body.classList.add('cx-open');
    paint();            // khung + công cụ hiện ngay, dữ liệu nạp xong thì vẽ lại
    reload();
    var x = $('[data-cx-act="close"]'); if (x) x.focus();
  }
  function close() {
    if (!CX.open) return;
    CX.open = false; seq++; busy(false);
    $('#cx').hidden = true; document.body.classList.remove('cx-open');
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {}
  }
  function go(key) {
    if (!BUILD[key] || key === CX.key) return;
    CX.key = key; CX.sel = null; CX.zoom = 1; initRange(key);
    paint(); reload();
  }

  /* ---------- tải về ---------- */
  function download(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }
  function fileBase() {
    var d = CX.d, t = d ? (CX.key === 'climb' && d.compare ? 'ky' + d.compare.a.fromWeek + '-' + d.compare.a.toWeek + '_ky' + d.compare.b.fromWeek + '-' + d.compare.b.toWeek : 'tuan' + d.fromWeek + '-' + d.toWeek) : '';
    return 'a3k64-' + CX.key + (t ? '-' + t : '');
  }
  function exportCsv() {
    if (!CX.last || !CX.last.csv) { B.toast('Biểu đồ này chưa có số liệu để tải.', true); return; }
    var q = function (v) { v = v == null ? '' : String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var txt = '\ufeff' + CX.last.csv.map(function (r) { return r.map(q).join(','); }).join('\r\n');
    download(new Blob([txt], { type: 'text/csv;charset=utf-8' }), fileBase() + '.csv');
  }
  function exportPng() {
    var svg = $('#cx-stage svg.sm-ch'); if (!svg) { B.toast('Chưa có biểu đồ để tải.', true); return; }
    var clone = svg.cloneNode(true), a = svg.querySelectorAll('*'), c = clone.querySelectorAll('*');
    var props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'font-size', 'font-weight', 'font-family', 'text-anchor'];
    for (var i = 0; i < a.length; i++) {
      var cs = getComputedStyle(a[i]);
      props.forEach(function (p) { c[i].style.setProperty(p, cs.getPropertyValue(p)); });
    }
    [].forEach.call(clone.querySelectorAll('.cx-hit'), function (n) { n.remove(); });
    var vb = svg.viewBox.baseVal, W = vb.width, H = vb.height, bg = getComputedStyle($('.cx-win')).backgroundColor || '#fff';
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', W * 2); clone.setAttribute('height', H * 2);
    clone.style.width = ''; clone.style.height = '';
    var xml = new XMLSerializer().serializeToString(clone);
    var img = new Image();
    img.onload = function () {
      var cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2 + 70;
      var cx = cv.getContext('2d'); cx.fillStyle = bg; cx.fillRect(0, 0, cv.width, cv.height);
      cx.fillStyle = getComputedStyle($('.cx-win')).color || '#000'; cx.font = '700 30px Inter, Segoe UI, sans-serif'; cx.textBaseline = 'middle';
      cx.fillText(META[CX.key].t + ' — ' + ($('#cx-sub').textContent || ''), 24, 36);
      cx.drawImage(img, 0, 70, W * 2, H * 2);
      cv.toBlob(function (b) { if (b) download(b, fileBase() + '.png'); else B.toast('Không tạo được ảnh.', true); }, 'image/png');
    };
    img.onerror = function () { B.toast('Không tạo được ảnh PNG.', true); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  }

  /* ---------- sự kiện của cửa sổ ---------- */
  var RANGE_FIELDS = { 'from': 1, 'to': 1, 'a.from': 1, 'a.to': 1, 'b.from': 1, 'b.to': 1 };
  function setRange(name, v) {
    v = +v;
    if (name === 'from' || name === 'to') {
      var r = CX.rng[CX.key];
      if (name === 'from') { r.from = v; if (r.from > r.to) r.to = r.from; } else { r.to = v; if (r.to < r.from) r.from = r.to; }
    } else {
      var p = name.split('.'), c = CX.cmp; if (!c) return;
      c[p[0]][p[1]] = v;
      if (c[p[0]].from > c[p[0]].to) { if (p[1] === 'from') c[p[0]].to = v; else c[p[0]].from = v; }
    }
    CX.sel = null; reload();
  }
  function changed() { CX.sel = null; saveOpts(); paint(); }
  function bind(el) {
    el.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t === el) { close(); return; }
      var x;
      if ((x = t.closest('[data-cx-act]'))) {
        var a = x.getAttribute('data-cx-act');
        if (a === 'close') close();
        else if (a === 'csv') exportCsv();
        else if (a === 'png') exportPng();
        else if (a === 'print') window.print();
        else if (a === 'reset') { OPTS[CX.key] = clone(DEF[CX.key]); delete CX.rng[CX.key]; if (CX.key === 'climb') CX.cmp = defaultCmpAll(); initRange(CX.key); CX.zoom = 1; CX.sel = null; saveOpts(); paint(); reload(); }
        return;
      }
      if ((x = t.closest('[data-cx-go]'))) { go(x.getAttribute('data-cx-go')); return; }
      if ((x = t.closest('[data-cx-zoom]'))) {
        var z = +x.getAttribute('data-cx-zoom');
        CX.zoom = z === 0 ? 1 : Math.max(0.5, Math.min(3, Math.round((CX.zoom + z * 0.25) * 100) / 100));
        fit(); return;
      }
      if ((x = t.closest('[data-cx-set]'))) { O()[x.getAttribute('data-cx-set')] = x.getAttribute('data-v'); changed(); return; }
      if ((x = t.closest('[data-cx-cmp]'))) {
        var c = CX.cmp; if (!c) return;
        if (x.getAttribute('data-cx-cmp') === 'swap') CX.cmp = { a: c.b, b: c.a };
        else { var pp = B.prevPeriod(c.b.from, c.b.to); if (!pp) { B.toast('Kỳ sau đang bắt đầu từ tuần đầu tiên nên chưa có kỳ liền trước.', true); return; } c.a = pp; }
        CX.sel = null; reload(); return;
      }
      if ((x = t.closest('[data-cx-leg]'))) {
        var lb = x.getAttribute('data-cx-leg'), h = O().hide;
        if (h[lb]) delete h[lb]; else { var shown = Object.keys(h).length; if (shown >= (CX.d.thresholds.grade.length - 1)) { B.toast('Cần giữ lại ít nhất một xếp loại.', true); return; } h[lb] = true; }
        if (CX.sel && CX.sel.id === lb) CX.sel = null;
        saveOpts(); paint(); return;
      }
      if ((x = t.closest('[data-cx-pick]'))) {
        var ty = x.getAttribute('data-cx-pick'), id = x.getAttribute('data-id'), i = x.getAttribute('data-i');
        var same = CX.sel && CX.sel.t === ty && String(CX.sel.id) === String(id) && String(CX.sel.i) === String(i);
        CX.sel = same ? null : { t: ty, id: id, i: i == null ? null : +i };
        paint(); return;
      }
      if (t.closest('[data-cx-clr]')) { CX.sel = null; paint(); }
    });
    el.addEventListener('change', function (ev) {
      var t = ev.target, n;
      if ((n = t.getAttribute('data-cx-sel'))) {
        if (RANGE_FIELDS[n]) setRange(n, t.value); else { O()[n] = t.value; changed(); }
      } else if ((n = t.getAttribute('data-cx-chk'))) {
        O()[n] = !!t.checked;
        if (n === 'split' && t.checked) { O().group = ''; }
        changed();
      }
    });
    el.addEventListener('wheel', function (ev) {
      if (!ev.ctrlKey || !ev.target.closest('#cx-stage')) return;
      ev.preventDefault();
      CX.zoom = Math.max(0.5, Math.min(3, Math.round((CX.zoom + (ev.deltaY < 0 ? 0.15 : -0.15)) * 100) / 100)); fit();
    }, { passive: false });
  }
  // Phím tắt (bắt ở giai đoạn capture để Esc không đóng nhầm chi tiết học sinh của trang chính)
  document.addEventListener('keydown', function (ev) {
    if (!CX.open) return;
    if (ev.key === 'Escape') { ev.stopImmediatePropagation(); ev.preventDefault(); close(); return; }
    var tag = (ev.target && ev.target.tagName) || '';
    if ((ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') && tag !== 'SELECT' && tag !== 'INPUT') {
      ev.preventDefault();
      var i = ORDER.indexOf(CX.key) + (ev.key === 'ArrowRight' ? 1 : -1);
      go(ORDER[(i + ORDER.length) % ORDER.length]); return;
    }
    if (ev.key === 'Tab') {   // giữ Tab trong cửa sổ
      var f = [].filter.call($('#cx').querySelectorAll('button,select,input,[tabindex="0"]'), function (n) { return !n.disabled && n.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      else if (!$('#cx').contains(document.activeElement)) { ev.preventDefault(); first.focus(); }
    }
  }, true);

  window.SMCharts = {
    open: open, close: close,
    // Gọi khi trang chính vừa tải lại dữ liệu: bỏ cache và nạp lại cho cửa sổ đang mở.
    refresh: function () { cache = {}; if (CX.open) { initRange(CX.key); reload(); } },
    _build: BUILD, _cx: CX, _opts: OPTS,   // phục vụ kiểm thử
  };
})();

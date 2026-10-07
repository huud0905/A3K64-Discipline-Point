/* Quản trị — phân quyền theo vai trò (bảng PERMS ở a3k64_ndt.js). UI chỉ ẩn/hiện theo adminPerms cho gọn; việc kiểm quyền thật nằm ở server (adminList/adminSave/adminDelete/adminFeed). */
(function () {
  'use strict';
  var root = document.getElementById('ad-root');
  var ALL_TABS = [['feed', 'Nhật ký'], ['rules', 'Nội quy'], ['weeks', 'Tuần'], ['accounts', 'Tài khoản'], ['students', 'Học sinh']];
  var TABS = [], PERM = {}, MY_ROLE = '';
  function can(tab, flag) { return String(PERM[tab] || '').indexOf(flag) >= 0; }
  var ROLE = [['gvcn', 'GVCN'], ['lop_truong', 'Lớp trưởng'], ['to_truong', 'Tổ trưởng'], ['bi_thu', 'Bí thư'], ['hoc_sinh', 'Học sinh']];
  var CATS = [['HOC_TAP', 'Học tập'], ['NE_NEP', 'Nề nếp'], ['PHONG_TRAO', 'Phong trào']];
  var FIELDS = {
    rules: [{ k: 'title', l: 'Nội dung', req: 1 }, { k: 'points', l: 'Điểm', t: 'number' }, { k: 'type', l: 'Loại', o: [['CONG', 'Cộng'], ['TRU', 'Trừ']] }, { k: 'category', l: 'Nhóm', o: CATS }, { k: 'note', l: 'Ghi chú' }],
    weeks: [{ k: 'week_no', l: 'Tuần số', t: 'number', key: 1 }, { k: 'label', l: 'Tên tuần' }, { k: 'start_date', l: 'Bắt đầu', t: 'date' }, { k: 'end_date', l: 'Kết thúc', t: 'date' }],
    accounts: [{ k: 'username', l: 'Tài khoản (email)', key: 1 }, { k: 'password', l: 'Mật khẩu (để trống = giữ nguyên)', t: 'password', wo: 1 }, { k: 'role', l: 'Vai trò', o: ROLE }, { k: 'student_id', l: 'Mã học sinh' }, { k: 'group_no', l: 'Tổ', t: 'number' }, { k: 'full_name', l: 'Họ tên' }],
    students: [{ k: 'id', l: 'Mã học sinh', key: 1 }, { k: 'full_name', l: 'Họ tên', req: 1 }, { k: 'group_no', l: 'Tổ', t: 'number' }, { k: 'gender', l: 'Giới tính' }, { k: 'date_of_birth', l: 'Ngày sinh' }, { k: 'phone_self', l: 'SĐT học sinh' }, { k: 'phone_father', l: 'SĐT bố' }, { k: 'phone_mother', l: 'SĐT mẹ' }, { k: 'avatar_initial', l: 'Chữ avatar' }, { k: 'role_label', l: 'Chức vụ' }]
  };
  var COLS = { rules: ['id', 'title', 'points', 'type', 'category'], weeks: ['week_no', 'label', 'start_date', 'end_date'], accounts: ['username', 'full_name', 'role', 'group_no', 'student_id'], students: ['id', 'full_name', 'group_no', 'gender', 'role_label'] };
  var HEAD = { id: 'ID', title: 'Nội dung', points: 'Điểm', type: 'Loại', category: 'Nhóm', week_no: 'Tuần', label: 'Tên', start_date: 'Bắt đầu', end_date: 'Kết thúc', username: 'Tài khoản', full_name: 'Họ tên', role: 'Vai trò', group_no: 'Tổ', student_id: 'Mã HS', gender: 'Giới tính', role_label: 'Chức vụ' };
  var TITLE = { rules: 'nội quy', weeks: 'tuần', accounts: 'tài khoản', students: 'học sinh' };
  var P = {  // icon (lucide, 24x24)
    feed: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    rules: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    weeks: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    accounts: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    students: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
  };
  function ico(k) { return '<svg class="ad-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[k] + '</svg>'; }

  var user = {}; try { user = JSON.parse(sessionStorage.getItem('a3k64-user') || localStorage.getItem('a3k64-user') || 'null') || {}; } catch (e) {}
  var st = { tab: 'feed', rows: {}, q: '', live: true, seen: null, sig: '', timer: null, busy: false, flash: null };
  var body = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function token() {
    try { var s = sessionStorage.getItem('a3k64-session-token'); if (s) return s; } catch (e) {}
    try { var l = JSON.parse(localStorage.getItem('a3k64-session-token') || 'null'); if (l && l.token && !(l.expiresAt && Date.now() > l.expiresAt)) return l.token; } catch (e) {}
    return '';
  }
  function api(action, extra) {
    var t = token();
    return fetch((window.A3K64_CONFIG || {}).gasUrl, {
      method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, t ? { Authorization: 'Bearer ' + t } : {}),
      body: JSON.stringify(Object.assign({ action: action, sessionToken: t }, extra || {}))
    }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (w) {
      var d = w && w.data !== undefined ? w.data : w;
      if (w && w.ok === false) throw new Error(w.error || 'Lỗi không xác định');
      if (d && d.ok === false) throw new Error(d.error || 'Lỗi không xác định');
      return d;
    });
  }
  function when(s) {
    if (!s) return '';
    var v = String(s); if (v.indexOf('T') < 0 && v.indexOf('Z') < 0) v = v.replace(' ', 'T') + 'Z';
    var d = new Date(v); return isNaN(d) ? esc(s) : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  }
  var REDUCE = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Toast / hộp thoại / xác nhận ---------- */
  function toast(m, kind) {
    var c = $('ad-toasts'); if (!c) return;
    var t = document.createElement('div'); t.className = 'ad-toast ' + (kind || 'ok');
    t.innerHTML = '<span class="ad-ti">' + ico(kind === 'bad' ? 'alert' : 'check') + '</span><span>' + esc(m) + '</span>';
    c.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 260); }, kind === 'bad' ? 4200 : 2400);
  }
  function modal(html, onDismiss) {
    var m = document.createElement('div'); m.className = 'ad-modal';
    m.innerHTML = '<div class="ad-box">' + html + '</div>'; document.body.appendChild(m);
    m.close = function (silent) {
      if (m._c) return; m._c = 1; m.classList.add('out'); setTimeout(function () { m.remove(); }, 200);
      if (!silent && onDismiss) onDismiss();
    };
    m.addEventListener('mousedown', function (e) { if (e.target === m) m.close(); });
    return m;
  }
  function confirmBox(title, msg, okText) {
    return new Promise(function (res) {
      var m = modal('<div class="ad-warn-ic">' + ico('alert') + '</div><h3>' + esc(title) + '</h3><p class="ad-p">' + esc(msg) + '</p><div class="ad-foot"><button class="ad-btn ghost" data-x="1">Huỷ</button><button class="ad-btn danger" data-ok="1">' + esc(okText || 'Xoá') + '</button></div>', function () { res(false); });
      m.addEventListener('click', function (e) {
        if (e.target.closest('[data-x]')) m.close();
        else if (e.target.closest('[data-ok]')) { res(true); m.close(true); }
      });
      var ok = m.querySelector('[data-ok]'); if (ok) ok.focus();
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var ms = document.querySelectorAll('.ad-modal:not(.out)'); if (ms.length) ms[ms.length - 1].close();
  });

  /* ---------- Số đếm chạy ---------- */
  function fmtNum(el, n) { return (el.classList.contains('p') && n > 0 ? '+' : '') + n; }
  function countTo(el, from, to) {
    if (el._r) cancelAnimationFrame(el._r);
    if (REDUCE || from === to) { el.textContent = fmtNum(el, to); return; }
    var t0 = null, dur = 750;
    (function step(ts) {
      if (t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmtNum(el, Math.round(from + (to - from) * e));
      if (k < 1) el._r = requestAnimationFrame(step);
    })(performance.now());
  }
  function statsHtml(list) {
    return '<section class="ad-stats">' + list.map(function (s, i) {
      return '<div class="ad-stat" id="ad-s' + i + '"><span>' + esc(s[0]) + '</span><b class="ad-num ' + (s[2] || '') + '" data-to="' + s[1] + '">0</b></div>';
    }).join('') + '</section>';
  }
  function runCounts(scope) { scope.querySelectorAll('.ad-num').forEach(function (el) { countTo(el, 0, Number(el.dataset.to) || 0); }); }
  function updateStats(list) {
    list.forEach(function (s, i) {
      var box = $('ad-s' + i), el = box && box.querySelector('.ad-num'); if (!el) return;
      var cur = Number(el.dataset.to) || 0; if (cur === s[1]) return;
      el.dataset.to = s[1]; countTo(el, cur, s[1]);
      box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump');
    });
  }

  /* ---------- Khung chung (dựng 1 lần, chỉ đổi phần thân) ---------- */
  function roleLabel() { var r = ROLE.filter(function (x) { return x[0] === MY_ROLE; })[0]; return r ? r[1] : MY_ROLE; }
  function buildShell() {
    var name = user.fullName || user.full_name || user.displayName || user.username || user.email || 'GVCN';
    var ini = String(name).trim().split(/\s+/).pop().charAt(0).toUpperCase() || 'G';
    root.innerHTML = '<div class="ad-bg" aria-hidden="true"><i></i><i></i></div>' +
      '<header class="ad-top" id="ad-top"><div class="ad-brand"><span class="ad-logo">' + ico('shield') + '</span><h1>Quản trị</h1></div>' +
      '<nav class="ad-tabs" id="ad-tabs"><span class="ad-ind" id="ad-ind"></span>' +
      TABS.map(function (t) { return '<button class="ad-tab" data-tab="' + t[0] + '">' + ico(t[0]) + '<span>' + t[1] + '</span></button>'; }).join('') + '</nav>' +
      '<span class="ad-live" id="ad-live"><i class="ad-dot" id="ad-dot"></i><span id="ad-lt">Trực tiếp</span></span>' +
      '<span class="ad-user" title="' + esc(name) + '"><b>' + esc(ini) + '</b><span>' + esc(name) + '</span><em>' + esc(roleLabel()) + '</em></span></header>' +
      '<main class="ad-body" id="ad-body"></main><div class="ad-toasts" id="ad-toasts"></div>';
    body = $('ad-body');
    body.addEventListener('scroll', function () { $('ad-top').classList.toggle('scrolled', body.scrollTop > 4); });
    window.addEventListener('resize', markTab);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(markTab);
  }
  function markTab() {
    var tabs = root.querySelectorAll('.ad-tab'), ind = $('ad-ind'), on = null;
    tabs.forEach(function (b) { var is = b.dataset.tab === st.tab; b.classList.toggle('on', is); if (is) on = b; });
    if (on && ind) {
      ind.style.width = on.offsetWidth + 'px'; ind.style.transform = 'translateX(' + on.offsetLeft + 'px)';
      if (!ind.classList.contains('ready')) requestAnimationFrame(function () { ind.classList.add('ready'); });
      if (on.scrollIntoView && on.offsetParent) { var tb = $('ad-tabs'); if (tb.scrollWidth > tb.clientWidth) tb.scrollTo({ left: on.offsetLeft - 20, behavior: 'smooth' }); }
    }
    var lv = $('ad-live'); if (lv) lv.classList.toggle('away', st.tab !== 'feed');
  }
  function setBody(html) {
    body.innerHTML = html; body.scrollTop = 0;
    body.classList.remove('enter'); void body.offsetWidth; body.classList.add('enter');
  }
  function skeleton() {
    var s = '<div class="ad-stats">', i; for (i = 0; i < 4; i++) s += '<div class="ad-sk ad-sk-stat"></div>';
    s += '</div><div>'; for (i = 0; i < 6; i++) s += '<div class="ad-sk ad-sk-row" style="--i:' + i + '"></div>';
    return s + '</div>';
  }
  function emptyHtml(title, sub, icon, small) {
    return '<div class="ad-empty' + (small ? ' sm' : '') + '">' + (small ? '' : '<span class="ad-empty-ic">' + ico(icon || 'inbox') + '</span>') + '<b>' + esc(title) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div>';
  }
  function setTab(t) {
    st.tab = t; st.q = ''; st.sig = ''; st.seen = null; stopLive(); markTab();
    if (t === 'feed') loadFeed(); else loadTable(t, false);
  }

  /* ---------- Bảng dữ liệu ---------- */
  function loadTable(t, soft) {
    if (!soft) setBody(skeleton());
    api('adminList', { table: t }).then(function (d) {
      if (st.tab !== t) return; st.rows[t] = d.rows || []; drawTable(soft ? 'soft' : 'full');
    }).catch(function (e) {
      if (st.tab !== t) return;
      if (soft) toast(e.message, 'bad'); else setBody(emptyHtml('Không tải được dữ liệu', e.message, 'alert'));
    });
  }
  function cellHtml(c, v) {
    if (c === 'role') { var r = ROLE.filter(function (x) { return x[0] === v; })[0]; return '<span class="ad-pill r-' + esc(v) + '">' + esc(r ? r[1] : v) + '</span>'; }
    if (c === 'type') return '<span class="ad-pill t-' + (v === 'TRU' ? 'TRU' : 'CONG') + '">' + (v === 'TRU' ? 'Trừ' : 'Cộng') + '</span>';
    if (c === 'category') { var k = CATS.filter(function (x) { return x[0] === v; })[0]; return '<span class="ad-pill c">' + esc(k ? k[1] : v) + '</span>'; }
    if (c === 'points' || c === 'week_no') return '<span class="ad-strong">' + esc(v) + '</span>';
    return esc(v);
  }
  function keyCol(t) { var f = FIELDS[t].filter(function (x) { return x.key; })[0]; return f ? f.k : 'id'; }
  function tableStats(t) {
    var rows = st.rows[t] || [], n = function (fn) { return rows.filter(fn).length; };
    if (t === 'rules') return [['Tổng nội quy', rows.length], ['Điểm cộng', n(function (r) { return r.type !== 'TRU'; }), 'p'], ['Điểm trừ', n(function (r) { return r.type === 'TRU'; }), 'm']];
    if (t === 'accounts') return [['Tổng tài khoản', rows.length], ['GVCN', n(function (r) { return r.role === 'gvcn'; })], ['Cán sự', n(function (r) { return ['lop_truong', 'to_truong', 'bi_thu'].indexOf(r.role) >= 0; })], ['Học sinh', n(function (r) { return r.role === 'hoc_sinh'; })]];
    return [['Tổng ' + TITLE[t], rows.length]];
  }
  function tableHtml(t, rows, anim) {
    if (!rows.length) return emptyHtml(st.q ? 'Không tìm thấy kết quả' : 'Chưa có dữ liệu', st.q ? 'Thử từ khoá khác.' : 'Bấm “Thêm ' + TITLE[t] + '” để bắt đầu.', st.q ? 'search' : 'inbox');
    var cols = COLS[t], kc = keyCol(t), cw = can(t, 'w'), cd = can(t, 'd'), cp = t === 'accounts' && !cw && can(t, 'p'), act = cw || cd || cp;
    return '<div class="ad-tbl-wrap"><table class="ad-tbl' + (anim ? '' : ' still') + '"><thead><tr>' + cols.map(function (c) { return '<th>' + esc(HEAD[c] || c) + '</th>'; }).join('') + (act ? '<th></th>' : '') + '</tr></thead><tbody>' +
      rows.map(function (r, i) {
        var flash = st.flash != null && String(r[kc]) === String(st.flash);
        return '<tr' + (flash ? ' class="flash"' : '') + ' style="--i:' + Math.min(i, 14) + '">' + cols.map(function (c) { return '<td title="' + esc(r[c]) + '">' + cellHtml(c, r[c]) + '</td>'; }).join('') +
          (act ? '<td class="ad-act">' + (cw ? '<button class="ad-mini" data-edit="' + esc(r[kc]) + '">' + ico('edit') + 'Sửa</button>' : '') + (cp ? '<button class="ad-mini" data-reset="' + esc(r[kc]) + '">' + ico('lock') + 'Đặt lại MK</button>' : '') + (cd ? '<button class="ad-mini d" data-del="' + esc(r[kc]) + '">' + ico('trash') + 'Xoá</button>' : '') + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }
  function drawTable(mode) {
    var t = st.tab, q = st.q.toLowerCase();
    var rows = (st.rows[t] || []).filter(function (r) { return !q || JSON.stringify(r).toLowerCase().indexOf(q) >= 0; });
    if (mode === 'full' || !$('ad-wrap')) {
      setBody(statsHtml(tableStats(t)) +
        '<div class="ad-bar"><label class="ad-search">' + ico('search') + '<input class="ad-in" id="ad-q" placeholder="Tìm trong ' + TITLE[t] + '…" value="' + esc(st.q) + '" autocomplete="off"></label>' + (can(t, 'w') ? '<button class="ad-btn" data-new="1">' + ico('plus') + 'Thêm ' + TITLE[t] + '</button>' : '<span class="ad-ro">' + ico('lock') + (can(t, 'p') ? 'Chỉ đặt lại mật khẩu' : 'Chỉ xem') + '</span>') + '</div>' +
        '<div id="ad-wrap">' + tableHtml(t, rows, true) + '</div>');
      runCounts(body);
    } else {
      $('ad-wrap').innerHTML = tableHtml(t, rows, false); updateStats(tableStats(t));
    }
    st.flash = null;
  }
  function findRow(key) {
    var kc = keyCol(st.tab);
    return (st.rows[st.tab] || []).filter(function (r) { return String(r[kc]) === String(key); })[0];
  }

  /* ---------- Hộp thoại thêm / sửa ---------- */
  function openReset(row) {
    var t = st.tab;
    var m = modal('<h3>Đặt lại mật khẩu</h3><p class="ad-p">Tài khoản: <b>' + esc(row.username) + '</b>' + (row.full_name ? ' (' + esc(row.full_name) + ')' : '') + '. Mật khẩu mới có hiệu lực ngay.</p>' +
      '<div class="ad-f" style="--i:0"><label>Mật khẩu mới (tối thiểu 6 ký tự)</label><input class="ad-in" data-f="password" type="password" autocomplete="new-password"></div>' +
      '<div class="ad-err" id="ad-err"></div><div class="ad-foot"><button class="ad-btn ghost" data-x="1">Huỷ</button><button class="ad-btn" data-ok="1">Đặt lại</button></div>');
    setTimeout(function () { var i = m.querySelector('input'); if (i) i.focus(); }, 120);
    function fail(msg) { m.querySelector('#ad-err').textContent = msg; var b = m.querySelector('.ad-box'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); }
    function go() {
      var btn = m.querySelector('[data-ok]'); if (btn.disabled) return;
      var pw = m.querySelector('input').value; if (pw.length < 6) return fail('Mật khẩu tối thiểu 6 ký tự.');
      btn.disabled = true; btn.innerHTML = '<i class="ad-spin"></i>Đang lưu…'; m.querySelector('#ad-err').textContent = '';
      api('adminSave', { table: t, row: { username: row.username, password: pw }, isNew: false }).then(function () {
        st.flash = row.username; m.close(true); toast('Đã đặt lại mật khẩu'); if (st.tab === t) loadTable(t, true);
      }).catch(function (er) { btn.disabled = false; btn.textContent = 'Đặt lại'; fail(er.message); });
    }
    m.addEventListener('click', function (e) { if (e.target.closest('[data-x]')) m.close(); else if (e.target.closest('[data-ok]')) go(); });
    m.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  }
  function openForm(row) {
    var t = st.tab, isNew = !row, fs = FIELDS[t]; if (!can(t, 'w')) return;
    var m = modal('<h3>' + (isNew ? 'Thêm ' : 'Sửa ') + TITLE[t] + '</h3>' + fs.map(function (f, i) {
      var v = row ? row[f.k] : (f.k === 'type' ? 'CONG' : (f.k === 'role' ? 'hoc_sinh' : (f.k === 'category' ? 'HOC_TAP' : '')));
      var lock = f.key && !isNew && t !== 'rules';
      var inp = f.o ? '<select class="ad-sel" data-f="' + f.k + '">' + f.o.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>'
        : '<input class="ad-in" data-f="' + f.k + '" type="' + (f.t || 'text') + '" value="' + (f.wo ? '' : esc(v)) + '"' + (lock ? ' disabled' : '') + ' autocomplete="off">';
      return '<div class="ad-f" style="--i:' + i + '"><label>' + esc(f.l) + '</label>' + inp + '</div>';
    }).join('') + '<div class="ad-err" id="ad-err"></div><div class="ad-foot"><button class="ad-btn ghost" data-x="1">Huỷ</button><button class="ad-btn" data-ok="1">Lưu</button></div>');
    var first = m.querySelector('input:not([disabled]),select'); if (first) setTimeout(function () { first.focus(); }, 120);
    function fail(msg) {
      m.querySelector('#ad-err').textContent = msg;
      var box = m.querySelector('.ad-box'); box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
    }
    function save() {
      var btn = m.querySelector('[data-ok]'); if (btn.disabled) return;
      var out = {}; m.querySelectorAll('[data-f]').forEach(function (el) { out[el.dataset.f] = el.value; });
      var miss = fs.filter(function (f) { return f.req && !String(out[f.k] || '').trim(); })[0];
      if (miss) return fail('Thiếu: ' + miss.l);
      if (t === 'rules' && row) out.id = row.id;
      btn.disabled = true; btn.innerHTML = '<i class="ad-spin"></i>Đang lưu…'; m.querySelector('#ad-err').textContent = '';
      api('adminSave', { table: t, row: out, isNew: isNew }).then(function () {
        var kf = fs.filter(function (f) { return f.key; })[0]; st.flash = kf ? out[kf.k] : (row ? row.id : null);
        m.close(true); toast('Đã lưu'); if (st.tab === t) loadTable(t, true);
      }).catch(function (er) { btn.disabled = false; btn.textContent = 'Lưu'; fail(er.message); });
    }
    m.addEventListener('click', function (e) {
      if (e.target.closest('[data-x]')) m.close(); else if (e.target.closest('[data-ok]')) save();
    });
    m.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); save(); } });
  }

  /* ---------- Nhật ký trực tiếp ---------- */
  function sgn(e) { var pts = Number(e.points) || 0; if (e.type === 'TRU' && pts > 0) pts = -pts; return pts; }
  function feedItem(e, cls, i) {
    var del = !!e.deleted_at, pts = sgn(e);
    return '<div class="ad-item ' + (pts < 0 ? 'm' : 'p') + ' ' + cls + '" style="--i:' + Math.min(i, 12) + '"><span class="ad-pts ' + (pts < 0 ? 'm' : 'p') + '">' + (pts > 0 ? '+' : '') + pts + '</span>' +
      '<div class="ad-main"><b><span class="ad-tag' + (del ? ' del' : '') + '">' + (del ? 'Xoá' : 'Thêm') + '</span>' + esc(e.student_name || e.student_id) + ' — ' + esc(e.title) + '</b>' +
      '<small>Tuần ' + esc(e.week_no) + ' · ' + (del ? 'bản ghi bị xoá (hệ thống không lưu người xoá) · chấm bởi ' : 'chấm bởi ') + esc(e.created_by || e.created_by_email || 'không rõ') + '</small></div>' +
      '<span class="ad-time">' + when(del ? e.deleted_at : e.created_at) + '</span></div>';
  }
  function editItem(r, cls, i) {
    var p = {}; try { p = JSON.parse(r.payload_json || '{}'); } catch (e) {}
    var op = { create: 'Thêm', update: 'Sửa', delete: 'Xoá' }[p.op] || p.op, diff = '';
    if (p.op === 'update' && p.before && p.after) diff = Object.keys(p.after).filter(function (k) { return String(p.after[k] == null ? '' : p.after[k]) !== String(p.before[k] == null ? '' : p.before[k]); }).map(function (k) { return esc(k) + ': ' + esc(p.before[k]) + ' → ' + esc(p.after[k]); }).join(' · ');
    if (p.passwordChanged) diff += (diff ? ' · ' : '') + 'đổi mật khẩu';
    return '<div class="ad-item ' + (p.op === 'delete' ? 'm' : '') + ' ' + cls + '" style="--i:' + Math.min(i, 12) + '"><span class="ad-pts e">' + esc(TITLE[p.table] || p.table) + '</span>' +
      '<div class="ad-main"><b><span class="ad-tag' + (p.op === 'delete' ? ' del' : '') + '">' + esc(op) + '</span>' + esc(p.key) + '</b><small>' + esc(r.display_name || r.username || 'không rõ') + (diff ? ' · ' + diff : '') + '</small></div>' +
      '<span class="ad-time">' + when(r.ts) + '</span></div>';
  }
  function feedStats(evs, eds) {
    var live = evs.filter(function (e) { return !e.deleted_at; }), add = 0, sub = 0;
    live.forEach(function (e) { var p = sgn(e); if (p > 0) add += p; else sub += p; });
    return [['Lượt chấm gần đây', live.length], ['Điểm cộng', add, 'p'], ['Điểm trừ', sub, 'm'], ['Thay đổi quản trị', eds.length]];
  }
  function drawFeed(d) {
    var evs = d.events || [], eds = d.edits || [], first = st.seen === null || !$('ad-lists'), ids = {};
    var ek = function (e) { return 'e' + e.id + (e.deleted_at ? 'd' : ''); };
    evs.forEach(function (e) { ids[ek(e)] = 1; }); eds.forEach(function (r) { ids['a' + r.id] = 1; });
    var sig = Object.keys(ids).join(',');
    if (!first && sig === st.sig) return;                       // không có gì mới → không vẽ lại, tránh nháy
    var seen = st.seen || {};
    var cls = function (key) { return first ? 'enter' : (seen[key] ? 'still' : 'new'); };
    var lists = '<div class="ad-sub">Thay đổi từ app Quản trị</div><div class="ad-feed">' +
      (eds.length ? eds.map(function (r, i) { return editItem(r, cls('a' + r.id), i); }).join('') : emptyHtml('Chưa có thay đổi nào.', '', '', true)) +
      '</div><div class="ad-sub">Chấm điểm gần đây</div><div class="ad-feed">' +
      (evs.length ? evs.map(function (e, i) { return feedItem(e, cls(ek(e)), i); }).join('') : emptyHtml('Chưa có lần chấm điểm nào.', '', '', true)) + '</div>';
    st.seen = ids; st.sig = sig;
    if (first) { setBody(statsHtml(feedStats(evs, eds)) + '<div id="ad-lists">' + lists + '</div>'); runCounts(body); }
    else { $('ad-lists').innerHTML = lists; updateStats(feedStats(evs, eds)); }
  }
  function pollFeed() {
    if (st.tab !== 'feed' || document.hidden || st.busy) return;
    st.busy = true;
    api('adminFeed').then(function (d) { st.live = true; mark(); if (st.tab === 'feed') drawFeed(d); })
      .catch(function () { st.live = false; mark(); }).then(function () { st.busy = false; });
  }
  function mark() { var d = $('ad-dot'), l = $('ad-lt'); if (d) d.className = 'ad-dot' + (st.live ? '' : ' off'); if (l) l.textContent = st.live ? 'Trực tiếp' : 'Mất kết nối'; }
  function loadFeed() { setBody(skeleton()); st.busy = false; pollFeed(); startLive(); }
  function startLive() { stopLive(); st.timer = setInterval(pollFeed, 5000); }
  function stopLive() { if (st.timer) clearInterval(st.timer); st.timer = null; }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) pollFeed(); });

  /* ---------- Hiệu ứng tương tác: ripple + đèn rê chuột ---------- */
  document.addEventListener('pointerdown', function (e) {
    var b = e.target.closest && e.target.closest('.ad-btn,.ad-tab,.ad-mini'); if (!b || b.disabled || REDUCE) return;
    var r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2, i = document.createElement('i'); i.className = 'ad-rip';
    i.style.cssText = 'width:' + s + 'px;height:' + s + 'px;left:' + (e.clientX - r.left - s / 2) + 'px;top:' + (e.clientY - r.top - s / 2) + 'px';
    b.appendChild(i); setTimeout(function () { i.remove(); }, 650);
  });
  document.addEventListener('pointermove', function (e) {
    var c = e.target.closest && e.target.closest('.ad-item,.ad-stat'); if (!c) return;
    var r = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px');
  });

  /* ---------- Sự kiện ---------- */
  root.addEventListener('click', function (e) {
    var t;
    if ((t = e.target.closest('[data-tab]'))) return setTab(t.dataset.tab);
    if (e.target.closest('[data-new]')) return openForm(null);
    if ((t = e.target.closest('[data-edit]'))) { var r = findRow(t.dataset.edit); if (r) openForm(r); return; }
    if ((t = e.target.closest('[data-reset]'))) { var rr = findRow(t.dataset.reset); if (rr) openReset(rr); return; }
    if ((t = e.target.closest('[data-del]'))) {
      var k = t.dataset.del, tab = st.tab, tr = t.closest('tr'); if (!can(tab, 'd')) return;
      confirmBox('Xoá ' + TITLE[tab] + '?', '“' + k + '” sẽ bị xoá vĩnh viễn, thao tác này không hoàn tác được.', 'Xoá').then(function (yes) {
        if (!yes) return;
        api('adminDelete', { table: tab, key: k }).then(function () {
          toast('Đã xoá'); if (tr) tr.classList.add('gone');
          setTimeout(function () { if (st.tab === tab) loadTable(tab, true); }, 300);
        }).catch(function (er) { toast(er.message, 'bad'); });
      });
    }
  });
  root.addEventListener('input', function (e) { if (e.target.id === 'ad-q') { st.q = e.target.value; drawTable('soft'); } });

  /* ---------- Khởi động ---------- */
  function lockScreen(title, sub, icon) {
    root.innerHTML = '<div class="ad-bg" aria-hidden="true"><i></i><i></i></div><div class="ad-lock"><span class="ad-empty-ic">' + ico(icon || 'lock') + '</span><b>' + esc(title) + '</b>' + esc(sub) + '</div>';
  }
  lockScreen('Đang kiểm tra quyền…', '', 'shield');
  api('adminPerms').then(function (d) {
    PERM = d.perms || {}; MY_ROLE = d.role || '';
    TABS = ALL_TABS.filter(function (t) { return can(t[0], 'r'); });
    if (!TABS.length) return lockScreen('Bạn chưa có quyền vào mục Quản trị', 'Mục này dành cho GVCN, lớp trưởng và bí thư.');
    if (d.fullName && !user.fullName) user.fullName = d.fullName;
    buildShell(); setTab(TABS[0][0]);
  }).catch(function (e) { lockScreen('Không kiểm tra được quyền', e.message, 'alert'); });
})();
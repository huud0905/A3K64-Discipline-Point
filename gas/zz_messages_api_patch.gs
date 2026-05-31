/* =========================================================
 * A3K64 MESSAGES API PATCH - contacts/read/unread/delete/actions
 * - getMessageContacts: đọc danh bạ từ ACCOUNTS
 * - getMessages: đọc nhanh tin nhắn, hỗ trợ limit
 * - sendMessage: resolve Gmail <-> tên, bỏ placeholder rỗng khi trả UI
 * - markMessagesRead/markMessagesUnread/deleteMessageThread
 * - removeMessageForMe/unsendMessage/pinMessage/reactMessage
 * ========================================================= */
(function () {
  var MSG_API_SHEET = 'MESSAGES';
  var MSG_API_HEADERS = [
    'id', 'threadId', 'kind',
    'from', 'fromName', 'to', 'toName',
    'body', 'status', 'permissionStatus',
    'requesterGroup', 'targetGroup', 'week',
    'payloadJson', 'createdAt', 'readAt'
  ];

  function mTxt(v) { return String(v === null || v === undefined ? '' : v).trim(); }
  function mLower(v) { return mTxt(v).toLowerCase(); }
  function mIso() { return Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', "yyyy-MM-dd'T'HH:mm:ss.SSS") + '+07:00'; }
  function mId(prefix) { return String(prefix || 'msg') + '_' + Date.now() + '_' + Math.floor(Math.random() * 999999); }
  function mParseJson(raw, fallback) { try { var s = mTxt(raw); return s ? JSON.parse(s) : fallback; } catch (err) { return fallback; } }
  function mStringify(value) { try { return JSON.stringify(value || {}); } catch (err) { return '{}'; } }
  function mKey(value) {
    return mTxt(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').replace(/[^a-z0-9@.]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function mAlias(email) { email = mTxt(email); return email.indexOf('@') >= 0 ? email.split('@')[0] : email; }
  function mBook() { if (typeof book === 'function') return book(); return SpreadsheetApp.openById(SPREADSHEET_ID); }
  function mSheet(name, headers) {
    var ss = mBook();
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.setFrozenRows(1);
      return sh;
    }
    if (sh.getLastRow() < 1 || sh.getLastColumn() < 1) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.setFrozenRows(1);
    }
    return sh;
  }
  function mVals(sh) { if (!sh || sh.getLastRow() < 1 || sh.getLastColumn() < 1) return []; return sh.getDataRange().getDisplayValues(); }
  function mAppend(sh, headers, obj) { sh.appendRow(headers.map(function (h) { return obj[h] === undefined ? '' : obj[h]; })); }
  function mHeaderMap(row) { var map = {}; (row || []).forEach(function (v, i) { var k = mKey(v).replace(/\s+/g, ''); if (k) map[k] = i; }); return map; }
  function mPick(map, names, fallback) { for (var i = 0; i < names.length; i++) { var k = mKey(names[i]).replace(/\s+/g, ''); if (map[k] !== undefined) return map[k]; } return fallback; }
  function mThreadId(a, b) { a = mLower(a); b = mLower(b); if (!b) return 'self::' + a; return [a, b].sort().join('__'); }

  function mUniqueContacts(items) {
    var map = {};
    (items || []).forEach(function (c) {
      var email = mLower(c.email || c.username || c.gmail || c.user);
      if (!email || email === 'local-user') return;
      var name = mTxt(c.name || c.displayName || c.fullName || c.hoten || c.hoTen) || mAlias(email);
      map[email] = { email: email, username: email, name: name, displayName: name, fullName: name, role: mTxt(c.role || c.vaiTro || c.vaitro), group: mTxt(c.group || c.groupNum || c.to || c.tổ || c.toNum) };
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'vi', { sensitivity: 'base' }); });
  }

  function getMessageContactsPatch(payload) {
    payload = payload || {};
    var contacts = [];
    try {
      if (typeof accounts === 'function') {
        var accs = accounts(false) || accounts(true) || [];
        accs.forEach(function (a) {
          contacts.push({ email: a.email || a.username || a.gmail, name: a.name || a.displayName || a.fullName || a.hoten || a.hoTen || a.username || a.email, role: a.role, group: a.group || a.to || a.groupNum });
        });
      }
    } catch (ignored) {}
    if (!contacts.length) {
      var sh = mBook().getSheetByName('ACCOUNTS');
      var values = mVals(sh);
      if (values.length > 1) {
        var head = mHeaderMap(values[0]);
        var userCol = mPick(head, ['username', 'email', 'gmail', 'user'], 0);
        var nameCol = mPick(head, ['displayName', 'fullname', 'fullName', 'hoten', 'hoTen', 'họ tên', 'name', 'ten', 'tên'], -1);
        var roleCol = mPick(head, ['role', 'vai tro', 'vaitro', 'vai_tro'], 2);
        var groupCol = mPick(head, ['group', 'groupNum', 'group_num', 'to', 'tổ', 'nhom'], 3);
        for (var r = 1; r < values.length; r++) {
          var email = mLower(values[r][userCol]);
          if (!email) continue;
          contacts.push({ email: email, name: nameCol >= 0 ? mTxt(values[r][nameCol]) : mAlias(email), role: roleCol >= 0 ? mTxt(values[r][roleCol]) : '', group: groupCol >= 0 ? mTxt(values[r][groupCol]) : '' });
        }
      }
    }
    return { contacts: mUniqueContacts(contacts), updatedAt: mIso() };
  }

  function mContactsMap() {
    var list = getMessageContactsPatch({}).contacts || [];
    var byEmail = {}, byName = {};
    list.forEach(function (c) { byEmail[mLower(c.email)] = c; var nk = mKey(c.name); if (nk && byName[nk] === undefined) byName[nk] = c; });
    return { list: list, byEmail: byEmail, byName: byName };
  }
  function mResolveContact(input, maps) {
    maps = maps || mContactsMap();
    var raw = mTxt(input);
    if (!raw) return null;
    var lower = mLower(raw);
    if (lower.indexOf('@') >= 0) return maps.byEmail[lower] || { email: lower, name: mAlias(lower) };
    var q = mKey(raw);
    if (maps.byName[q]) return maps.byName[q];
    for (var i = 0; i < maps.list.length; i++) if (mKey(maps.list[i].name).indexOf(q) === 0) return maps.list[i];
    return { email: lower, name: raw };
  }

  function mMessageSheet() { return mSheet(MSG_API_SHEET, MSG_API_HEADERS); }
  function mRowToMessage(row, maps) {
    maps = maps || mContactsMap();
    var payload = mParseJson(row[13], {}) || {};
    var from = mLower(row[3]);
    var to = mLower(row[5]);
    var fromContact = maps.byEmail[from];
    var toContact = maps.byEmail[to];
    var fromName = mTxt(row[4]) || (fromContact && fromContact.name) || mAlias(from);
    var toName = mTxt(row[6]) || (toContact && toContact.name) || mAlias(to);
    return { id: mTxt(row[0]), threadId: mTxt(row[1]), thread_id: mTxt(row[1]), kind: mTxt(row[2]) || 'message', type: mTxt(row[2]) || 'message', from: from, fromEmail: from, fromName: fromName, to: to, toEmail: to, toName: toName, body: mTxt(row[7]), status: mTxt(row[8]) || 'sent', permissionStatus: mTxt(row[9]), requesterGroup: mTxt(row[10]), targetGroup: mTxt(row[11]), week: mTxt(row[12]), payload: payload, createdAt: mTxt(row[14]), readAt: mTxt(row[15]) };
  }
  function mIsHiddenFor(message, user) {
    if (!user) return false;
    var p = message.payload || {};
    var hiddenFor = Array.isArray(p.hiddenFor) ? p.hiddenFor.map(mLower) : [];
    var deletedFor = Array.isArray(p.deletedFor) ? p.deletedFor.map(mLower) : [];
    return hiddenFor.indexOf(user) >= 0 || deletedFor.indexOf(user) >= 0;
  }
  function mIsRemovedGlobally(message) {
    var p = message.payload || {};
    return p.unsent === true || p.removedForAll === true;
  }
  function mReadMessages(filters) {
    filters = filters || {};
    var user = mLower(filters.user || filters.email || filters.username);
    var limit = Number(filters.limit || 350);
    var sh = mMessageSheet();
    var values = mVals(sh);
    var maps = mContactsMap();
    var out = [];
    for (var r = 1; r < values.length; r++) {
      if (!mTxt(values[r][0])) continue;
      var m = mRowToMessage(values[r], maps);
      if (mIsRemovedGlobally(m)) continue;
      if (user && m.kind !== 'presence' && m.from !== user && m.to !== user) continue;
      if (mIsHiddenFor(m, user)) continue;
      out.push(m);
    }
    return out.slice(-limit);
  }

  function mAppendMessage(input) {
    input = input || {};
    var maps = mContactsMap();
    var fromInput = input.from || input.fromEmail || input.from_email || input.user;
    var toInput = input.to || input.toEmail || input.to_email;
    var fromContact = mResolveContact(fromInput, maps);
    var toContact = mResolveContact(toInput, maps);
    var from = mLower((fromContact && fromContact.email) || fromInput);
    var to = mLower((toContact && toContact.email) || toInput);
    var now = mIso();
    var body = mTxt(input.body || input.message);
    var payload = input.payload || {};
    if (!body && payload.threadOnly !== true) payload.threadOnly = true;
    var row = { id: mTxt(input.id) || mId(input.kind === 'presence' ? 'presence' : 'msg'), threadId: mTxt(input.threadId || input.thread_id) || mThreadId(from, to), kind: mTxt(input.kind || input.type || 'message'), from: from, fromName: mTxt(input.fromName || input.from_name) || (fromContact && fromContact.name) || mAlias(from), to: to, toName: mTxt(input.toName || input.to_name) || (toContact && toContact.name) || mAlias(to), body: body, status: mTxt(input.status || 'sent'), permissionStatus: mTxt(input.permissionStatus || input.permission_status), requesterGroup: mTxt(input.requesterGroup || input.requester_group), targetGroup: mTxt(input.targetGroup || input.target_group), week: mTxt(input.week), payloadJson: mStringify(payload), createdAt: mTxt(input.createdAt || input.created_at) || now, readAt: mTxt(input.readAt || input.read_at) };
    mAppend(mMessageSheet(), MSG_API_HEADERS, row);
    return mRowToMessage(MSG_API_HEADERS.map(function (h) { return row[h] === undefined ? '' : row[h]; }), maps);
  }

  function mUpdateMessages(payload, mutator) {
    payload = payload || {};
    var threadId = mTxt(payload.threadId || payload.thread_id);
    var messageId = mTxt(payload.messageId || payload.id || payload.message_id);
    var user = mLower(payload.user || payload.email || payload.username);
    var sh = mMessageSheet();
    var values = mVals(sh);
    var changed = 0;
    for (var r = 1; r < values.length; r++) {
      if (messageId && mTxt(values[r][0]) !== messageId) continue;
      if (threadId && mTxt(values[r][1]) !== threadId) continue;
      if (user && mLower(values[r][3]) !== user && mLower(values[r][5]) !== user) continue;
      var p = mParseJson(values[r][13], {}) || {};
      var result = mutator({ row: values[r], payload: p, rowIndex: r + 1, sheet: sh, user: user });
      if (result !== false) {
        sh.getRange(r + 1, 14).setValue(mStringify(p));
        changed++;
      }
    }
    return changed;
  }

  getMessageContacts = getMessageContactsPatch;
  getMessages = function (payload) {
    payload = payload || {};
    var contacts = getMessageContactsPatch(payload).contacts;
    var messages = mReadMessages(payload);
    var presence = mReadMessages({ limit: 150 }).filter(function (m) { return m.kind === 'presence'; }).slice(-80);
    return { messagesState: { messages: messages, presence: presence, contacts: contacts, updatedAt: mIso() }, contacts: contacts };
  };
  sendMessage = function (payload) {
    payload = payload || {};
    var m = payload.message || payload;
    var saved = mAppendMessage(Object.assign({}, m, { kind: m.kind || m.type || 'message' }));
    return Object.assign({ saved: saved }, getMessages({ user: saved.from, limit: 250 }));
  };
  setPresence = function (payload) {
    payload = payload || {};
    var user = mLower(payload.user || payload.email || payload.username);
    if (!user) return { ok: false, error: 'Thiếu user.' };
    var contact = mResolveContact(user) || {};
    mAppendMessage({ id: mId('presence'), threadId: 'presence::' + user, kind: 'presence', from: user, fromName: mTxt(payload.name || payload.displayName) || contact.name || mAlias(user), to: '', body: mTxt(payload.status || 'active'), status: 'active', payload: { activeAt: mIso() } });
    return { ok: true, presence: mReadMessages({ limit: 150 }).filter(function (m) { return m.kind === 'presence'; }).slice(-80) };
  };
  markMessagesRead = function (payload) {
    payload = payload || {};
    var now = mIso();
    mUpdateMessages(payload, function (ctx) {
      ctx.payload.unreadFor = (Array.isArray(ctx.payload.unreadFor) ? ctx.payload.unreadFor : []).filter(function (x) { return mLower(x) !== ctx.user; });
      if (!ctx.user || mLower(ctx.row[5]) === ctx.user) { ctx.sheet.getRange(ctx.rowIndex, 9).setValue('read'); ctx.sheet.getRange(ctx.rowIndex, 16).setValue(now); }
    });
    return getMessages(payload);
  };
  markMessagesUnread = function (payload) {
    payload = payload || {};
    var user = mLower(payload.user || payload.email || payload.username);
    if (!user) return { ok: false, error: 'Thiếu user.' };
    mUpdateMessages(payload, function (ctx) {
      ctx.payload.unreadFor = Array.isArray(ctx.payload.unreadFor) ? ctx.payload.unreadFor.map(mLower) : [];
      if (ctx.payload.unreadFor.indexOf(user) < 0) ctx.payload.unreadFor.push(user);
      if (mLower(ctx.row[5]) === user) { ctx.sheet.getRange(ctx.rowIndex, 9).setValue('sent'); ctx.sheet.getRange(ctx.rowIndex, 16).setValue(''); }
    });
    return getMessages(payload);
  };
  deleteMessageThread = function (payload) {
    payload = payload || {};
    var user = mLower(payload.user || payload.email || payload.username);
    if (!user) return { ok: false, error: 'Thiếu user.' };
    var changed = mUpdateMessages(payload, function (ctx) { ctx.payload.hiddenFor = Array.isArray(ctx.payload.hiddenFor) ? ctx.payload.hiddenFor.map(mLower) : []; if (ctx.payload.hiddenFor.indexOf(user) < 0) ctx.payload.hiddenFor.push(user); ctx.payload.hiddenAt = mIso(); });
    return Object.assign({ ok: true, hidden: changed }, getMessages(payload));
  };
  hideMessageThread = deleteMessageThread;
  removeMessageForMe = function (payload) {
    payload = payload || {};
    var user = mLower(payload.user || payload.email || payload.username);
    if (!user) return { ok: false, error: 'Thiếu user.' };
    var changed = mUpdateMessages(payload, function (ctx) { ctx.payload.deletedFor = Array.isArray(ctx.payload.deletedFor) ? ctx.payload.deletedFor.map(mLower) : []; if (ctx.payload.deletedFor.indexOf(user) < 0) ctx.payload.deletedFor.push(user); ctx.payload.deletedAt = mIso(); });
    return Object.assign({ ok: true, removed: changed }, getMessages(payload));
  };
  unsendMessage = function (payload) {
    payload = payload || {};
    var user = mLower(payload.user || payload.email || payload.username);
    var changed = mUpdateMessages(payload, function (ctx) { if (user && mLower(ctx.row[3]) !== user) return false; ctx.payload.unsent = true; ctx.payload.unsentAt = mIso(); ctx.sheet.getRange(ctx.rowIndex, 8).setValue(''); });
    return Object.assign({ ok: true, unsent: changed }, getMessages(payload));
  };
  pinMessage = function (payload) {
    payload = payload || {};
    var user = mLower(payload.user || payload.email || payload.username);
    var changed = mUpdateMessages(payload, function (ctx) { ctx.payload.pinnedBy = Array.isArray(ctx.payload.pinnedBy) ? ctx.payload.pinnedBy.map(mLower) : []; if (ctx.payload.pinnedBy.indexOf(user) < 0) ctx.payload.pinnedBy.push(user); ctx.payload.pinnedAt = mIso(); });
    return Object.assign({ ok: true, pinned: changed }, getMessages(payload));
  };
  reactMessage = function (payload) {
    payload = payload || {};
    var user = mLower(payload.user || payload.email || payload.username);
    var emoji = mTxt(payload.emoji || '❤️');
    var changed = mUpdateMessages(payload, function (ctx) { ctx.payload.reactions = ctx.payload.reactions || {}; ctx.payload.reactions[user] = emoji; });
    return Object.assign({ ok: true, reacted: changed }, getMessages(payload));
  };

  var previousMessageRouteAction = (typeof routeAction === 'function') ? routeAction : null;
  routeAction = function (action, payload, params) {
    action = mTxt(action || 'getScoreboard'); payload = payload || {}; params = params || {};
    try {
      if (action === 'getMessageContacts') return { ok: true, data: getMessageContactsPatch(payload || params) };
      if (action === 'getMessages') return { ok: true, data: getMessages(payload || params) };
      if (action === 'sendMessage') return { ok: true, data: sendMessage(payload) };
      if (action === 'setPresence') return { ok: true, data: setPresence(payload) };
      if (action === 'markMessagesRead') return { ok: true, data: markMessagesRead(payload || params) };
      if (action === 'markMessagesUnread') return { ok: true, data: markMessagesUnread(payload || params) };
      if (action === 'deleteMessageThread' || action === 'hideMessageThread') return { ok: true, data: deleteMessageThread(payload || params) };
      if (action === 'removeMessageForMe') return { ok: true, data: removeMessageForMe(payload || params) };
      if (action === 'unsendMessage') return { ok: true, data: unsendMessage(payload || params) };
      if (action === 'pinMessage') return { ok: true, data: pinMessage(payload || params) };
      if (action === 'reactMessage') return { ok: true, data: reactMessage(payload || params) };
      if (previousMessageRouteAction) return previousMessageRouteAction(action, payload, params);
      return { ok: true, message: 'GAS API is running', updatedAt: mIso() };
    } catch (err) { return { ok: false, error: String(err && err.message ? err.message : err) }; }
  };
})();

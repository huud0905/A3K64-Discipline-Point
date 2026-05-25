/*
 * A3K64 Messages backend patch
 *
 * Sheet dùng chung: MESSAGES
 * Header tự tạo:
 * id, threadId, kind, from, fromName, to, toName, body, status,
 * permissionStatus, requesterGroup, targetGroup, week, payloadJson, createdAt, readAt
 *
 * Cần thêm các route này vào routeAction(action, payload, params) trong Api.gs:
 * if (action === "getMessages") return { ok: true, data: getMessagesState(payload) };
 * if (action === "sendMessage") return { ok: true, data: appendMessage(payload.message) };
 * if (action === "markMessagesRead") return { ok: true, data: markMessagesRead(payload) };
 * if (action === "setPresence") return { ok: true, data: setMessagePresence(payload) };
 * if (action === "requestGroupAccess") return { ok: true, data: appendMessage(payload.message) };
 * if (action === "respondGroupAccess") return { ok: true, data: respondGroupAccess(payload) };
 */

const MESSAGES_SHEET_NAME = "MESSAGES";
const MESSAGES_HEADERS = [
  "id", "threadId", "kind", "from", "fromName", "to", "toName", "body", "status",
  "permissionStatus", "requesterGroup", "targetGroup", "week", "payloadJson", "createdAt", "readAt"
];
const PRESENCE_HEADERS = ["user", "name", "activeAt"];
const PRESENCE_SHEET_NAME = "_MESSAGE_PRESENCE";

function messagesSheet_() {
  return init(MESSAGES_SHEET_NAME, MESSAGES_HEADERS);
}

function presenceSheet_() {
  return init(PRESENCE_SHEET_NAME, PRESENCE_HEADERS);
}

function rowToMessage_(row) {
  return {
    id: txt(row[0]),
    threadId: txt(row[1]),
    kind: txt(row[2]) || "chat",
    from: txt(row[3]).toLowerCase(),
    fromName: txt(row[4]),
    to: txt(row[5]).toLowerCase(),
    toName: txt(row[6]),
    body: txt(row[7]),
    status: txt(row[8]) || "sent",
    permissionStatus: txt(row[9]) || undefined,
    requesterGroup: num(row[10]) || undefined,
    targetGroup: num(row[11]) || undefined,
    week: num(row[12]) || undefined,
    payload: parseJson(row[13]) || {},
    createdAt: txt(row[14]),
    readAt: txt(row[15]) || undefined
  };
}

function messageToRow_(message) {
  message = message || {};
  return [
    txt(message.id) || id("msg"),
    txt(message.threadId),
    txt(message.kind || "chat"),
    txt(message.from).toLowerCase(),
    txt(message.fromName),
    txt(message.to).toLowerCase(),
    txt(message.toName),
    txt(message.body),
    txt(message.status || "sent"),
    txt(message.permissionStatus),
    txt(message.requesterGroup),
    txt(message.targetGroup),
    txt(message.week),
    JSON.stringify(message.payload || {}),
    txt(message.createdAt) || iso(),
    txt(message.readAt)
  ];
}

function readMessages_() {
  const values = vals(messagesSheet_());
  const result = [];
  for (let row = 1; row < values.length; row++) {
    if (!txt(values[row][0])) continue;
    result.push(rowToMessage_(values[row]));
  }
  return result.sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); });
}

function readPresence_() {
  const values = vals(presenceSheet_());
  const result = [];
  for (let row = 1; row < values.length; row++) {
    const user = txt(values[row][0]).toLowerCase();
    if (!user) continue;
    result.push({ user: user, name: txt(values[row][1]), activeAt: txt(values[row][2]) });
  }
  return result;
}

function getMessagesState(payload) {
  return { ok: true, messages: readMessages_(), presence: readPresence_(), updatedAt: iso() };
}

function appendMessage(message) {
  const sheet = messagesSheet_();
  sheet.appendRow(messageToRow_(message));
  return getMessagesState({});
}

function markMessagesRead(payload) {
  payload = payload || {};
  const threadId = txt(payload.threadId);
  const user = txt(payload.user).toLowerCase();
  const sheet = messagesSheet_();
  const values = vals(sheet);
  for (let row = 1; row < values.length; row++) {
    const sameThread = txt(values[row][1]) === threadId;
    const isToUser = txt(values[row][5]).toLowerCase() === user;
    if (sameThread && isToUser && txt(values[row][8]) !== "read") {
      sheet.getRange(row + 1, 9).setValue("read");
      sheet.getRange(row + 1, 16).setValue(iso());
    }
  }
  return getMessagesState({});
}

function setMessagePresence(payload) {
  payload = payload || {};
  const user = txt(payload.user).toLowerCase();
  if (!user) return getMessagesState({});
  const sheet = presenceSheet_();
  const values = vals(sheet);
  for (let row = 1; row < values.length; row++) {
    if (txt(values[row][0]).toLowerCase() === user) {
      sheet.getRange(row + 1, 2).setValue(txt(payload.name));
      sheet.getRange(row + 1, 3).setValue(txt(payload.activeAt) || iso());
      return getMessagesState({});
    }
  }
  sheet.appendRow([user, txt(payload.name), txt(payload.activeAt) || iso()]);
  return getMessagesState({});
}

function respondGroupAccess(payload) {
  payload = payload || {};
  const messageId = txt(payload.messageId);
  const status = txt(payload.status) === "approved" ? "approved" : "rejected";
  const sheet = messagesSheet_();
  const values = vals(sheet);
  for (let row = 1; row < values.length; row++) {
    if (txt(values[row][0]) === messageId) {
      const payloadJson = parseJson(values[row][13]) || {};
      payloadJson.resolvedBy = txt(payload.user).toLowerCase();
      payloadJson.resolvedAt = iso();
      payloadJson.resolverName = txt(payload.resolverName);
      sheet.getRange(row + 1, 10).setValue(status);
      sheet.getRange(row + 1, 9).setValue("read");
      sheet.getRange(row + 1, 14).setValue(JSON.stringify(payloadJson));
      sheet.getRange(row + 1, 16).setValue(iso());
      break;
    }
  }
  return getMessagesState({});
}

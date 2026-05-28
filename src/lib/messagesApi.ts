export type ChatUser = {
  id: string;
  email: string;
  name: string;
  role?: string;
  group?: number | string;
};

export type ChatMessageKind = 'chat' | 'permission_request' | 'system';
export type ChatMessageStatus = 'sent' | 'read';
export type PermissionStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export type ChatMessage = {
  id: string;
  threadId: string;
  kind: ChatMessageKind;
  from: string;
  fromName: string;
  to: string;
  toName?: string;
  body: string;
  status: ChatMessageStatus;
  permissionStatus?: PermissionStatus;
  requesterGroup?: number;
  targetGroup?: number;
  week?: number;
  payload?: Record<string, unknown>;
  createdAt: string;
  readAt?: string;
};

export type PresenceRecord = {
  user: string;
  name: string;
  activeAt: string;
};

export type MessagesState = {
  messages: ChatMessage[];
  presence: PresenceRecord[];
  updatedAt: string;
};

const GAS_URL = import.meta.env.VITE_GAS_WEB_APP_URL?.trim();
const JSONP_TIMEOUT_MS = 22000;
const LOCAL_MESSAGES_KEY = 'a3k64-messages-local-v1';
const LOCAL_PRESENCE_KEY = 'a3k64-messages-presence-local-v1';
const EXTRA_PERMISSION_KEY = 'a3k64-extra-edit-permissions-v1';

function nowIso() {
  return new Date().toISOString();
}

function normalizeUser(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function safeJson<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

export function readSessionUser(): ChatUser {
  const session = safeJson<{ user?: Record<string, unknown> } | null>(localStorage.getItem('a3k64-login-session-v1'), null);
  const user = session?.user || {};
  const email = normalizeUser(user.email || user.username || user.uid || 'local-user');
  return {
    id: String(user.uid || email),
    email,
    name: String(user.displayName || user.hoten || user.name || email.split('@')[0] || 'Người dùng'),
    role: String(user.role || 'hoc_sinh'),
    group: user.group as number | string | undefined,
  };
}

function localMessages() {
  return safeJson<ChatMessage[]>(localStorage.getItem(LOCAL_MESSAGES_KEY), []);
}

function writeLocalMessages(messages: ChatMessage[]) {
  localStorage.setItem(LOCAL_MESSAGES_KEY, JSON.stringify(messages));
  window.dispatchEvent(new Event('a3k64-messages-local-change'));
}

function localPresence() {
  return safeJson<PresenceRecord[]>(localStorage.getItem(LOCAL_PRESENCE_KEY), []);
}

function writeLocalPresence(presence: PresenceRecord[]) {
  localStorage.setItem(LOCAL_PRESENCE_KEY, JSON.stringify(presence));
  window.dispatchEvent(new Event('a3k64-messages-local-change'));
}

function mergeMessages(local: ChatMessage[], remote: ChatMessage[]) {
  const map = new Map<string, ChatMessage>();
  [...remote, ...local].forEach((message) => {
    if (!message?.id) return;
    const previous = map.get(message.id);
    if (!previous) {
      map.set(message.id, message);
      return;
    }
    map.set(message.id, {
      ...previous,
      ...message,
      status: previous.status === 'read' || message.status === 'read' ? 'read' : message.status || previous.status,
      readAt: previous.readAt || message.readAt,
    });
  });
  return [...map.values()].sort((a, b) => Date.parse(a.createdAt || '') - Date.parse(b.createdAt || ''));
}

function mergePresence(local: PresenceRecord[], remote: PresenceRecord[]) {
  const map = new Map<string, PresenceRecord>();
  [...remote, ...local].forEach((item) => {
    const user = normalizeUser(item?.user);
    if (!user) return;
    const previous = map.get(user);
    if (!previous || Date.parse(item.activeAt || '') >= Date.parse(previous.activeAt || '')) map.set(user, { ...item, user });
  });
  return [...map.values()].sort((a, b) => Date.parse(b.activeAt || '') - Date.parse(a.activeAt || '')).slice(0, 100);
}

function gasJsonp(action: string, payload?: unknown): Promise<any | null> {
  if (!GAS_URL || typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const callbackName = `__a3k64Messages_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const url = new URL(GAS_URL);
    const callbacks = window as typeof window & Record<string, unknown>;
    let settled = false;
    let timeoutId = 0;

    const finish = (value: unknown) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      delete callbacks[callbackName];
      script.onerror = null;
      script.remove();
      resolve(value);
    };

    url.searchParams.set('action', action);
    url.searchParams.set('callback', callbackName);
    url.searchParams.set('t', String(Date.now()));
    if (payload !== undefined) url.searchParams.set('payload', JSON.stringify(payload));

    callbacks[callbackName] = (json: unknown) => finish(json);
    script.onerror = () => finish(null);
    timeoutId = window.setTimeout(() => finish(null), JSONP_TIMEOUT_MS);
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function unwrapMessagesState(response: any): MessagesState | null {
  const data = response?.data || response;
  const state = data?.messagesState || data;
  if (!state || !Array.isArray(state.messages)) return null;
  return {
    messages: state.messages,
    presence: Array.isArray(state.presence) ? state.presence : [],
    updatedAt: String(state.updatedAt || nowIso()),
  };
}

function syncRemoteMessages(action: string, payload?: unknown) {
  void gasJsonp(action, payload).then((response) => {
    const remote = unwrapMessagesState(response);
    if (!remote) return;
    writeLocalMessages(mergeMessages(localMessages(), remote.messages));
    writeLocalPresence(mergePresence(localPresence(), remote.presence));
  }).catch(() => undefined);
}

export async function fetchMessagesState(user = readSessionUser()): Promise<MessagesState> {
  const remote = unwrapMessagesState(await gasJsonp('getMessages', { user: user.email }));
  if (remote) {
    const mergedMessages = mergeMessages(localMessages(), remote.messages);
    const mergedPresence = mergePresence(localPresence(), remote.presence);
    writeLocalMessages(mergedMessages);
    writeLocalPresence(mergedPresence);
    return { messages: mergedMessages, presence: mergedPresence, updatedAt: remote.updatedAt };
  }
  return { messages: localMessages(), presence: localPresence(), updatedAt: nowIso() };
}

export async function sendChatMessage(to: string, body: string, toName = '', user = readSessionUser()) {
  const target = normalizeUser(to);
  const message: ChatMessage = {
    id: id('msg'),
    threadId: [user.email, target].sort().join('__'),
    kind: 'chat',
    from: user.email,
    fromName: user.name,
    to: target,
    toName,
    body: body.trim(),
    status: 'sent',
    createdAt: nowIso(),
  };
  writeLocalMessages([...localMessages(), message]);
  syncRemoteMessages('sendMessage', { message, user: user.email });
  return message;
}

export async function markThreadRead(threadId: string, user = readSessionUser()) {
  const local = localMessages().map((message) => message.threadId === threadId && message.to === user.email ? { ...message, status: 'read' as const, readAt: message.readAt || nowIso() } : message);
  writeLocalMessages(local);
  syncRemoteMessages('markMessagesRead', { threadId, user: user.email });
}

export async function updatePresence(user = readSessionUser()) {
  const next: PresenceRecord = { user: user.email, name: user.name, activeAt: nowIso() };
  const presence = [next, ...localPresence().filter((item) => normalizeUser(item.user) !== user.email)].slice(0, 80);
  writeLocalPresence(presence);
  syncRemoteMessages('setPresence', next);
  return next;
}

export async function requestGroupAccess(targetGroup: number, reason: string, week?: number, user = readSessionUser()) {
  const requesterGroup = Number(user.group || 0) || undefined;
  const targetOwner = `to${targetGroup}`;
  const message: ChatMessage = {
    id: id('perm'),
    threadId: `permission__g${requesterGroup || 'x'}__g${targetGroup}`,
    kind: 'permission_request',
    from: user.email,
    fromName: user.name,
    to: targetOwner,
    toName: `Tổ ${targetGroup}`,
    body: reason.trim() || `Xin quyền hỗ trợ chấm Tổ ${targetGroup}`,
    status: 'sent',
    permissionStatus: 'pending',
    requesterGroup,
    targetGroup,
    week,
    payload: { requesterRole: user.role },
    createdAt: nowIso(),
  };
  writeLocalMessages([...localMessages(), message]);
  syncRemoteMessages('requestGroupAccess', { message, user: user.email });
  return message;
}

function saveApprovedPermission(message: ChatMessage) {
  if (!message.requesterGroup || !message.targetGroup) return;
  const list = safeJson<Array<{ requesterGroup: number; targetGroup: number; week?: number; approvedAt: string; requestId: string }>>(localStorage.getItem(EXTRA_PERMISSION_KEY), []);
  const next = [{ requesterGroup: message.requesterGroup, targetGroup: message.targetGroup, week: message.week, approvedAt: nowIso(), requestId: message.id }, ...list.filter((item) => item.requestId !== message.id)].slice(0, 80);
  localStorage.setItem(EXTRA_PERMISSION_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event('a3k64-edit-permissions-change'));
}

export async function respondGroupAccess(messageId: string, status: Extract<PermissionStatus, 'approved' | 'rejected'>, user = readSessionUser()) {
  const updated = localMessages().map((message) => message.id === messageId ? { ...message, permissionStatus: status, status: 'read' as const, readAt: nowIso(), payload: { ...(message.payload || {}), resolvedBy: user.email, resolvedAt: nowIso() } } : message);
  const changed = updated.find((message) => message.id === messageId);
  if (changed && status === 'approved') saveApprovedPermission(changed);
  writeLocalMessages(updated);
  syncRemoteMessages('respondGroupAccess', { messageId, status, user: user.email, resolverName: user.name });
  return changed || null;
}

export function isOnline(activeAt?: string) {
  const time = Date.parse(activeAt || '');
  return Number.isFinite(time) && Date.now() - time < 90_000;
}

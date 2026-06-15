import { readSavedLoginSession } from '../core/auth';
import { requestJsonp } from '../core/network';
import { readJsonStorage, writeJsonStorage } from '../core/storage';

export type ChatUser = {
  id: string;
  email: string;
  name: string;
  role?: string;
  group?: number | string;
};

export type ChatContact = {
  email: string;
  name: string;
  role?: string;
  group?: number | string;
};

export type ChatMessageKind = 'chat' | 'message' | 'permission_request' | 'permission_response' | 'system' | 'presence';
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
  contacts?: ChatContact[];
  updatedAt: string;
};

export type FetchMessagesOptions = {
  force?: boolean;
};

const GAS_URL = import.meta.env.VITE_GAS_WEB_APP_URL?.trim();
const JSONP_TIMEOUT_MS = 12000;
const LOCAL_MESSAGES_KEY = 'a3k64-messages-local-v1';
const LOCAL_PRESENCE_KEY = 'a3k64-messages-presence-local-v1';
const LOCAL_CONTACTS_KEY = 'a3k64-messages-contacts-local-v1';
const EXTRA_PERMISSION_KEY = 'a3k64-extra-edit-permissions-v1';
const CACHE_MAX_AGE_MS = 5000;
let lastMessagesFetchAt = 0;
let inFlightState: Promise<MessagesState> | null = null;

function nowIso() {
  return new Date().toISOString();
}

function normalizeUser(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeContactText(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9@.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isThreadOnly(message: Partial<ChatMessage>) {
  return !String(message.body || '').trim() && Boolean((message.payload as Record<string, unknown> | undefined)?.threadOnly);
}

function localMessages() {
  return readJsonStorage<ChatMessage[]>(LOCAL_MESSAGES_KEY, []);
}

function localPresence() {
  return readJsonStorage<PresenceRecord[]>(LOCAL_PRESENCE_KEY, []);
}

function localContacts() {
  return readJsonStorage<ChatContact[]>(LOCAL_CONTACTS_KEY, []);
}

function emitLocalChange() {
  window.dispatchEvent(new Event('a3k64-messages-local-change'));
}

function writeLocalMessages(messages: ChatMessage[]) {
  writeJsonStorage(LOCAL_MESSAGES_KEY, messages);
  emitLocalChange();
}

function writeLocalPresence(presence: PresenceRecord[]) {
  writeJsonStorage(LOCAL_PRESENCE_KEY, presence);
  emitLocalChange();
}

function mergeContacts(contacts: ChatContact[]) {
  const map = new Map<string, ChatContact>();
  contacts.forEach((contact) => {
    const email = normalizeUser(contact?.email);
    if (!email || email === 'local-user') return;
    const name = String(contact.name || email).trim();
    map.set(email, { ...map.get(email), ...contact, email, name });
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }));
}

function writeLocalContacts(contacts: ChatContact[]) {
  writeJsonStorage(LOCAL_CONTACTS_KEY, mergeContacts(contacts));
  emitLocalChange();
}

function contactsFromMessages(messages: ChatMessage[], currentUser = readSessionUser()) {
  const contacts: ChatContact[] = [];
  messages.forEach((message) => {
    if (message.from && message.from !== currentUser.email) contacts.push({ email: message.from, name: message.fromName || message.from });
    if (message.to && message.to !== currentUser.email && !message.to.startsWith('to')) contacts.push({ email: message.to, name: message.toName || message.to });
  });
  return mergeContacts(contacts);
}

function mergeMessages(local: ChatMessage[], remote: ChatMessage[]) {
  const map = new Map<string, ChatMessage>();
  [...local, ...remote].forEach((message) => {
    if (!message?.id) return;
    const kind = message.kind === 'message' ? 'chat' : message.kind;
    const previous = map.get(message.id);
    map.set(message.id, {
      ...previous,
      ...message,
      kind,
      status: previous?.status === 'read' || message.status === 'read' ? 'read' : (message.status || previous?.status || 'sent'),
      readAt: previous?.readAt || message.readAt,
    });
  });
  return [...map.values()].sort((a, b) => Date.parse(a.createdAt || '') - Date.parse(b.createdAt || ''));
}

function mergePresence(local: PresenceRecord[], remote: PresenceRecord[]) {
  const map = new Map<string, PresenceRecord>();
  [...local, ...remote].forEach((item) => {
    const user = normalizeUser(item?.user);
    if (!user) return;
    const previous = map.get(user);
    if (!previous || Date.parse(item.activeAt || '') >= Date.parse(previous.activeAt || '')) map.set(user, { ...item, user });
  });
  return [...map.values()].sort((a, b) => Date.parse(b.activeAt || '') - Date.parse(a.activeAt || '')).slice(0, 100);
}

function gasJsonp(action: string, payload?: unknown): Promise<any | null> {
  return requestJsonp(GAS_URL, { action, payload }, { timeoutMs: JSONP_TIMEOUT_MS, callbackPrefix: '__a3k64Messages' });
}

function unwrapContacts(response: any): ChatContact[] {
  const data = response?.data || response;
  const raw = data?.contacts || data?.users || data?.items || data?.messageContacts || [];
  if (!Array.isArray(raw)) return [];
  return mergeContacts(raw.flatMap((item) => {
    const record = item as Record<string, unknown>;
    const email = normalizeUser(record.email || record.username || record.gmail || record.user);
    const name = String(record.name || record.displayName || record.fullName || record.hoten || record.hoTen || email).trim();
    if (!email) return [];
    return [{ email, name, role: String(record.role || ''), group: record.group as number | string | undefined }];
  }));
}

function unwrapMessagesState(response: any): MessagesState | null {
  const data = response?.data || response;
  const state = data?.messagesState || data;
  if (!state || !Array.isArray(state.messages)) return null;
  return {
    messages: state.messages.map((message: ChatMessage) => ({ ...message, kind: message.kind === 'message' ? 'chat' : message.kind })),
    presence: Array.isArray(state.presence) ? state.presence : [],
    contacts: unwrapContacts(state),
    updatedAt: String(state.updatedAt || nowIso()),
  };
}

function applyRemote(response: unknown, user = readSessionUser(), replaceLocal = false) {
  const remote = unwrapMessagesState(response);
  if (!remote) return null;
  const mergedMessages = replaceLocal ? remote.messages : mergeMessages(localMessages(), remote.messages);
  const mergedPresence = replaceLocal ? remote.presence : mergePresence(localPresence(), remote.presence);
  const contacts = mergeContacts([...(remote.contacts || []), ...contactsFromMessages(mergedMessages, user), ...(replaceLocal ? [] : localContacts())]);
  writeLocalMessages(mergedMessages);
  writeLocalPresence(mergedPresence);
  writeLocalContacts(contacts);
  lastMessagesFetchAt = Date.now();
  return { messages: mergedMessages, presence: mergedPresence, contacts, updatedAt: remote.updatedAt };
}

function syncRemoteMessages(action: string, payload?: unknown, user = readSessionUser()) {
  void gasJsonp(action, payload).then((response) => applyRemote(response, user)).catch(() => undefined);
}

export function readSessionUser(): ChatUser {
  const user = readSavedLoginSession<Record<string, unknown>>()?.user || {};
  const email = normalizeUser(user.email || user.username || user.uid || 'local-user');
  return {
    id: String(user.uid || email),
    email,
    name: String(user.displayName || user.hoten || user.name || email.split('@')[0] || 'Người dùng'),
    role: String(user.role || 'hoc_sinh'),
    group: user.group as number | string | undefined,
  };
}

function localState(user = readSessionUser()): MessagesState {
  const messages = localMessages();
  const contacts = mergeContacts([...localContacts(), ...contactsFromMessages(messages, user)]);
  return { messages, presence: localPresence(), contacts, updatedAt: nowIso() };
}

export async function fetchMessagesState(user = readSessionUser(), options: FetchMessagesOptions = {}): Promise<MessagesState> {
  const cached = localState(user);
  if (!options.force && Date.now() - lastMessagesFetchAt < CACHE_MAX_AGE_MS && cached.messages.length) return cached;
  if (!options.force && inFlightState) return inFlightState;
  const request = gasJsonp('getMessages', { user: user.email, limit: 250, force: options.force ? 1 : 0 }).then((response) => {
    const remote = applyRemote(response, user, Boolean(options.force));
    if (remote) return remote;
    return cached;
  });
  if (options.force) return request;
  inFlightState = request.finally(() => { inFlightState = null; });
  return inFlightState;
}

export async function fetchMessageContacts(user = readSessionUser()): Promise<ChatContact[]> {
  const local = mergeContacts([...localContacts(), ...contactsFromMessages(localMessages(), user)]);
  void gasJsonp('getMessageContacts', { user: user.email }).then((response) => {
    const remote = unwrapContacts(response);
    if (remote.length) writeLocalContacts(mergeContacts([...remote, ...localContacts()]));
  }).catch(() => undefined);
  return local;
}

export function resolveContactTarget(input: string, contacts: ChatContact[]) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (raw.includes('@')) {
    const email = normalizeUser(raw);
    const found = contacts.find((contact) => normalizeUser(contact.email) === email);
    return found || { email, name: email.split('@')[0] };
  }
  const query = normalizeContactText(raw);
  const exact = contacts.find((contact) => normalizeContactText(contact.name) === query || normalizeContactText(contact.email) === query);
  if (exact) return exact;
  const starts = contacts.find((contact) => normalizeContactText(contact.name).startsWith(query));
  if (starts) return starts;
  const contains = contacts.find((contact) => `${normalizeContactText(contact.name)} ${normalizeContactText(contact.email)}`.includes(query));
  if (contains) return contains;
  return { email: raw.toLowerCase(), name: raw };
}

export function filterContacts(input: string, contacts: ChatContact[], currentEmail?: string) {
  const query = normalizeContactText(input);
  const filtered = contacts.filter((contact) => contact.email !== currentEmail);
  if (!query) return filtered.slice(0, 10);
  return filtered
    .filter((contact) => `${normalizeContactText(contact.name)} ${normalizeContactText(contact.email)}`.includes(query))
    .slice(0, 10);
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
    toName: toName || target.split('@')[0] || target,
    body: body.trim(),
    status: 'sent',
    createdAt: nowIso(),
  };
  writeLocalContacts(mergeContacts([...localContacts(), { email: target, name: message.toName || target }]));
  writeLocalMessages([...localMessages(), message]);
  syncRemoteMessages('sendMessage', { message, user: user.email }, user);
  return message;
}

export async function markThreadRead(threadId: string, user = readSessionUser()) {
  const local = localMessages().map((message) => message.threadId === threadId && (message.to === user.email || message.from === user.email) ? { ...message, status: 'read' as const, readAt: message.readAt || nowIso() } : message);
  writeLocalMessages(local);
  syncRemoteMessages('markMessagesRead', { threadId, user: user.email }, user);
}

export async function markThreadUnread(threadId: string, user = readSessionUser()) {
  const local = localMessages().map((message) => message.threadId === threadId && (message.to === user.email || message.from === user.email) ? { ...message, status: 'sent' as const, readAt: undefined } : message);
  writeLocalMessages(local);
  syncRemoteMessages('markMessagesUnread', { threadId, user: user.email }, user);
}

export async function hideMessageThread(threadId: string, user = readSessionUser()) {
  const remaining = localMessages().filter((message) => message.threadId !== threadId);
  writeLocalMessages(remaining);
  syncRemoteMessages('deleteMessageThread', { threadId, user: user.email }, user);
}

export async function updatePresence(user = readSessionUser()) {
  const next: PresenceRecord = { user: user.email, name: user.name, activeAt: nowIso() };
  const presence = [next, ...localPresence().filter((item) => normalizeUser(item.user) !== user.email)].slice(0, 80);
  writeLocalPresence(presence);
  syncRemoteMessages('setPresence', next, user);
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
  syncRemoteMessages('requestGroupAccess', { message, user: user.email }, user);
  return message;
}

function saveApprovedPermission(message: ChatMessage) {
  if (!message.requesterGroup || !message.targetGroup) return;
  const list = readJsonStorage<Array<{ requesterGroup: number; targetGroup: number; week?: number; approvedAt: string; requestId: string }>>(EXTRA_PERMISSION_KEY, []);
  const next = [{ requesterGroup: message.requesterGroup, targetGroup: message.targetGroup, week: message.week, approvedAt: nowIso(), requestId: message.id }, ...list.filter((item) => item.requestId !== message.id)].slice(0, 80);
  writeJsonStorage(EXTRA_PERMISSION_KEY, next);
  window.dispatchEvent(new Event('a3k64-edit-permissions-change'));
}

export async function respondGroupAccess(messageId: string, status: Extract<PermissionStatus, 'approved' | 'rejected'>, user = readSessionUser()) {
  const updated = localMessages().map((message) => message.id === messageId ? { ...message, permissionStatus: status, status: 'read' as const, readAt: nowIso(), payload: { ...(message.payload || {}), resolvedBy: user.email, resolvedAt: nowIso() } } : message);
  const changed = updated.find((message) => message.id === messageId);
  if (changed && status === 'approved') saveApprovedPermission(changed);
  writeLocalMessages(updated);
  syncRemoteMessages('respondGroupAccess', { messageId, status, user: user.email, resolverName: user.name }, user);
  return changed || null;
}

export function isOnline(activeAt?: string) {
  const time = Date.parse(activeAt || '');
  return Number.isFinite(time) && Date.now() - time < 90_000;
}

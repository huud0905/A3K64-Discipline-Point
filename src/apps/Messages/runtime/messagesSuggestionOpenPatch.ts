import { readSavedLoginSession } from '../../../core/auth';
import { requestJsonp } from '../../../core/network';
import { readJsonStorage, writeJsonStorage } from '../../../core/storage';

const GAS_URL = import.meta.env.VITE_GAS_WEB_APP_URL?.trim();
const LOCAL_MESSAGES_KEY = 'a3k64-messages-local-v1';
const LOCAL_CONTACTS_KEY = 'a3k64-messages-contacts-local-v1';

type AnyRecord = Record<string, unknown>;

function normalizeUser(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function readSessionUser() {
  const session = readSavedLoginSession<AnyRecord>();
  const user = session?.user || {};
  const email = normalizeUser(user.email || user.username || user.uid || 'local-user');
  return {
    email,
    name: String(user.displayName || user.hoten || user.name || email.split('@')[0] || 'Người dùng'),
    role: String(user.role || 'hoc_sinh'),
    group: user.group as number | string | undefined,
  };
}

function setReactInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function makeMessageId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeNameKey(value: unknown) {
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

function resolveTarget(rawInput: string) {
  const raw = rawInput.trim();
  if (!raw) return null;
  const contacts = readJsonStorage<Array<Record<string, unknown>>>(LOCAL_CONTACTS_KEY, []);
  if (raw.includes('@')) {
    const email = normalizeUser(raw);
    const found = contacts.find((c) => normalizeUser(c.email || c.username || c.gmail) === email);
    return { email, name: String(found?.name || found?.displayName || email.split('@')[0]) };
  }
  const key = normalizeNameKey(raw);
  const found = contacts.find((contact) => {
    const name = normalizeNameKey(contact.name || contact.displayName || contact.fullName || contact.hoten);
    const email = normalizeNameKey(contact.email || contact.username || contact.gmail);
    return name === key || name.startsWith(key) || `${name} ${email}`.includes(key);
  });
  if (found) return { email: normalizeUser(found.email || found.username || found.gmail || raw), name: String(found.name || found.displayName || raw) };
  return { email: raw.toLowerCase(), name: raw };
}

function gasJsonp(action: string, payload?: unknown): Promise<any | null> {
  return requestJsonp(GAS_URL, { action, payload }, { timeoutMs: 8000, callbackPrefix: '__a3k64TypedMessage' });
}

function upsertLocalContact(targetId: string, targetName: string) {
  const contacts = readJsonStorage<Array<Record<string, unknown>>>(LOCAL_CONTACTS_KEY, []);
  const next = [
    { email: targetId, name: targetName, displayName: targetName },
    ...contacts.filter((item) => normalizeUser(item.email || item.username || item.gmail) !== targetId),
  ].slice(0, 300);
  writeJsonStorage(LOCAL_CONTACTS_KEY, next);
}

function mergeServerMessages(response: any) {
  const data = response?.data || response;
  const state = data?.messagesState || data;
  if (!state || !Array.isArray(state.messages)) return false;

  const currentMessages = readJsonStorage<Array<Record<string, unknown>>>(LOCAL_MESSAGES_KEY, []);
  const map = new Map<string, Record<string, unknown>>();
  [...currentMessages, ...state.messages].forEach((message) => {
    const id = String(message?.id || '');
    if (!id) return;
    map.set(id, { ...map.get(id), ...message, pendingServer: false });
  });
  writeJsonStorage(LOCAL_MESSAGES_KEY, [...map.values()]);

  if (Array.isArray(state.contacts)) {
    const currentContacts = readJsonStorage<Array<Record<string, unknown>>>(LOCAL_CONTACTS_KEY, []);
    const contactMap = new Map<string, Record<string, unknown>>();
    [...currentContacts, ...state.contacts].forEach((contact) => {
      const email = normalizeUser(contact?.email || contact?.username || contact?.gmail);
      if (!email) return;
      contactMap.set(email, { ...contactMap.get(email), ...contact, email });
    });
    writeJsonStorage(LOCAL_CONTACTS_KEY, [...contactMap.values()]);
  }

  window.dispatchEvent(new Event('a3k64-messages-local-change'));
  return true;
}

function createLocalThread(targetName: string) {
  const user = readSessionUser();
  const target = resolveTarget(targetName);
  if (!target) return null;
  const now = new Date().toISOString();
  const message = {
    id: makeMessageId(),
    threadId: [user.email, target.email].sort().join('__'),
    kind: 'chat',
    type: 'message',
    from: user.email,
    fromName: user.name,
    to: target.email,
    toName: target.name,
    body: '',
    status: 'read',
    createdAt: now,
    payload: { threadOnly: true },
    pendingServer: true,
  };
  const messages = readJsonStorage<Array<Record<string, unknown>>>(LOCAL_MESSAGES_KEY, []);
  const exists = messages.some((item) => item.threadId === message.threadId);
  writeJsonStorage(LOCAL_MESSAGES_KEY, exists ? messages : [...messages, message]);
  upsertLocalContact(target.email, target.name);
  window.dispatchEvent(new Event('a3k64-messages-local-change'));
  return message;
}

function syncThreadToServer(message: Record<string, unknown>) {
  const user = readSessionUser();
  void gasJsonp('sendMessage', { message, user: user.email }).then((response) => {
    if (response?.ok !== false) mergeServerMessages(response);
  }).catch(() => undefined);
}

function createThreadFromInput(input: HTMLInputElement) {
  const name = input.value.trim();
  if (!name) return false;
  setReactInputValue(input, '');
  const message = createLocalThread(name);
  if (!message) return false;
  syncThreadToServer(message);
  return true;
}

function openSelectedContact(button: HTMLButtonElement) {
  const box = button.closest('.messages-new-thread,.messages-new-box');
  const input = box?.querySelector<HTMLInputElement>('.messages-contact-box input');
  const name = (button.querySelector('strong')?.textContent || button.textContent || '').trim();
  if (!input || !name) return;
  setReactInputValue(input, name);
  window.setTimeout(() => createThreadFromInput(input), 0);
}

function initMessageSuggestionOpenPatch() {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const suggestion = target?.closest('.messages-contact-suggestions button') as HTMLButtonElement | null;
    if (suggestion) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openSelectedContact(suggestion);
      return;
    }

    const createButton = target?.closest('.messages-new-thread > button,.messages-new-box > button') as HTMLButtonElement | null;
    if (createButton) {
      const box = createButton.closest('.messages-new-thread,.messages-new-box');
      const input = box?.querySelector<HTMLInputElement>('.messages-contact-box input');
      if (input && input.value.trim()) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        createThreadFromInput(input);
      }
    }
  }, true);
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMessageSuggestionOpenPatch, { once: true });
  else initMessageSuggestionOpenPatch();
}

export {};

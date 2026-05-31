const GAS_URL = import.meta.env.VITE_GAS_WEB_APP_URL?.trim();
const LOCAL_MESSAGES_KEY = 'a3k64-messages-local-v1';
const LOCAL_CONTACTS_KEY = 'a3k64-messages-contacts-local-v1';

function safeJson<T>(raw: string | null, fallback: T): T {
  try { return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}

function normalizeUser(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function readSessionUser() {
  const session = safeJson<{ user?: Record<string, unknown> } | null>(localStorage.getItem('a3k64-login-session-v1'), null);
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
  const contacts = safeJson<Array<Record<string, unknown>>>(localStorage.getItem(LOCAL_CONTACTS_KEY), []);
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
  if (!GAS_URL || typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const callbackName = `__a3k64TypedMessage_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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
    timeoutId = window.setTimeout(() => finish(null), 16000);
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function upsertLocalContact(targetId: string, targetName: string) {
  const contacts = safeJson<Array<Record<string, unknown>>>(localStorage.getItem(LOCAL_CONTACTS_KEY), []);
  const next = [
    { email: targetId, name: targetName, displayName: targetName },
    ...contacts.filter((item) => normalizeUser(item.email || item.username || item.gmail) !== targetId),
  ].slice(0, 300);
  localStorage.setItem(LOCAL_CONTACTS_KEY, JSON.stringify(next));
}

function mergeServerMessages(response: any) {
  const data = response?.data || response;
  const state = data?.messagesState || data;
  if (!state || !Array.isArray(state.messages)) return false;

  const currentMessages = safeJson<Array<Record<string, unknown>>>(localStorage.getItem(LOCAL_MESSAGES_KEY), []);
  const map = new Map<string, Record<string, unknown>>();
  [...currentMessages, ...state.messages].forEach((message) => {
    const id = String(message?.id || '');
    if (!id) return;
    map.set(id, { ...map.get(id), ...message, pendingServer: false });
  });
  localStorage.setItem(LOCAL_MESSAGES_KEY, JSON.stringify([...map.values()]));

  if (Array.isArray(state.contacts)) {
    const currentContacts = safeJson<Array<Record<string, unknown>>>(localStorage.getItem(LOCAL_CONTACTS_KEY), []);
    const contactMap = new Map<string, Record<string, unknown>>();
    [...currentContacts, ...state.contacts].forEach((contact) => {
      const email = normalizeUser(contact?.email || contact?.username || contact?.gmail);
      if (!email) return;
      contactMap.set(email, { ...contactMap.get(email), ...contact, email });
    });
    localStorage.setItem(LOCAL_CONTACTS_KEY, JSON.stringify([...contactMap.values()]));
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
    body: 'Đã tạo cuộc trò chuyện.',
    status: 'sent',
    createdAt: now,
    pendingServer: true,
  };
  const messages = safeJson<Array<Record<string, unknown>>>(localStorage.getItem(LOCAL_MESSAGES_KEY), []);
  const exists = messages.some((item) => item.threadId === message.threadId);
  localStorage.setItem(LOCAL_MESSAGES_KEY, JSON.stringify(exists ? messages : [...messages, message]));
  upsertLocalContact(target.email, target.name);
  window.dispatchEvent(new Event('a3k64-messages-local-change'));
  return message;
}

function clickSync() {
  const syncButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.messages-profile-card button,.messages-soft'))
    .find((button) => (button.title || button.textContent || '').toLowerCase().includes('đồng bộ'));
  window.setTimeout(() => syncButton?.click(), 80);
}

function syncThreadToServer(message: Record<string, unknown>) {
  const user = readSessionUser();
  void gasJsonp('sendMessage', { message, user: user.email }).then((response) => {
    const ok = Boolean(response?.ok !== false && mergeServerMessages(response));
    if (ok) clickSync();
  }).catch(() => undefined);
}

function toast(text: string) {
  const old = document.querySelector('.a3-message-server-toast');
  old?.remove();
  const node = document.createElement('div');
  node.className = 'messages-toast a3-message-server-toast';
  node.textContent = text;
  document.querySelector('.messages-native-app')?.appendChild(node);
  window.setTimeout(() => node.remove(), 2200);
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
  window.setTimeout(() => createThreadFromInput(input), 20);
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
        toast('Đang đồng bộ máy chủ...');
      }
    }
  }, true);
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMessageSuggestionOpenPatch, { once: true });
  else initMessageSuggestionOpenPatch();
}

export {};
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

function toLocalTargetId(raw: string) {
  const value = raw.trim();
  if (value.includes('@')) return normalizeUser(value);
  return value.toLowerCase();
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
    ...contacts.filter((item) => normalizeUser(item.email) !== targetId),
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
    map.set(id, { ...map.get(id), ...message });
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

function appendLocalFallback(targetName: string, serverId?: string) {
  const user = readSessionUser();
  const targetId = toLocalTargetId(targetName);
  const now = new Date().toISOString();
  const message = {
    id: serverId || makeMessageId(),
    threadId: [user.email, targetId].sort().join('__'),
    kind: 'chat',
    from: user.email,
    fromName: user.name,
    to: targetId,
    toName: targetName,
    body: 'Đã tạo cuộc trò chuyện.',
    status: 'sent',
    createdAt: now,
    pendingServer: !serverId,
  };
  const messages = safeJson<Array<Record<string, unknown>>>(localStorage.getItem(LOCAL_MESSAGES_KEY), []);
  const exists = messages.some((item) => item.threadId === message.threadId);
  localStorage.setItem(LOCAL_MESSAGES_KEY, JSON.stringify(exists ? messages : [...messages, message]));
  upsertLocalContact(targetId, targetName);
  window.dispatchEvent(new Event('a3k64-messages-local-change'));
}

function clickSync() {
  const syncButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.messages-soft'))
    .find((button) => (button.textContent || '').toLowerCase().includes('đồng bộ'));
  window.setTimeout(() => syncButton?.click(), 80);
}

async function createThreadOnServer(targetName: string) {
  const user = readSessionUser();
  const targetRaw = targetName.trim();
  const now = new Date().toISOString();
  const message = {
    id: makeMessageId(),
    threadId: [user.email, toLocalTargetId(targetRaw)].sort().join('__'),
    kind: 'chat',
    type: 'message',
    from: user.email,
    fromName: user.name,
    to: targetRaw,
    toName: targetRaw,
    body: 'Đã tạo cuộc trò chuyện.',
    status: 'sent',
    createdAt: now,
  };

  const response = await gasJsonp('sendMessage', { message, user: user.email });
  const ok = Boolean(response?.ok !== false && mergeServerMessages(response));
  if (!ok) {
    appendLocalFallback(targetRaw);
    return false;
  }
  clickSync();
  return true;
}

function toast(text: string) {
  const old = document.querySelector('.a3-message-server-toast');
  old?.remove();
  const node = document.createElement('div');
  node.className = 'messages-toast a3-message-server-toast';
  node.textContent = text;
  document.querySelector('.messages-native-app')?.appendChild(node);
  window.setTimeout(() => node.remove(), 2600);
}

async function createThreadFromInput(input: HTMLInputElement) {
  const name = input.value.trim();
  if (!name) return false;
  setReactInputValue(input, '');
  const ok = await createThreadOnServer(name);
  if (!ok) toast('Máy chủ chưa phản hồi, đã tạm hiển thị và sẽ đồng bộ lại sau.');
  return true;
}

function openSelectedContact(button: HTMLButtonElement) {
  const box = button.closest('.messages-new-thread');
  const input = box?.querySelector<HTMLInputElement>('.messages-contact-box input');
  const name = (button.querySelector('strong')?.textContent || button.textContent || '').trim();
  if (!input || !name) return;
  setReactInputValue(input, name);
  window.setTimeout(() => void createThreadFromInput(input), 50);
}

function initMessageSuggestionOpenPatch() {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const suggestion = target?.closest('.messages-contact-suggestions button') as HTMLButtonElement | null;
    if (suggestion) {
      event.preventDefault();
      event.stopPropagation();
      openSelectedContact(suggestion);
      return;
    }

    const createButton = target?.closest('.messages-new-thread > button') as HTMLButtonElement | null;
    if (createButton) {
      const box = createButton.closest('.messages-new-thread');
      const input = box?.querySelector<HTMLInputElement>('.messages-contact-box input');
      if (input && input.value.trim()) {
        event.preventDefault();
        event.stopPropagation();
        void createThreadFromInput(input);
      }
    }
  }, true);
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMessageSuggestionOpenPatch, { once: true });
  else initMessageSuggestionOpenPatch();
}

export {};

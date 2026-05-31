const GAS_URL = import.meta.env.VITE_GAS_WEB_APP_URL?.trim();
const LOCAL_MESSAGES_KEY = 'a3k64-messages-local-v1';
const LOCAL_PRESENCE_KEY = 'a3k64-messages-presence-local-v1';
const LOCAL_CONTACTS_KEY = 'a3k64-messages-contacts-local-v1';

type AnyRecord = Record<string, unknown>;

function safeJson<T>(raw: string | null, fallback: T): T {
  try { return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}

function sessionEmail() {
  const session = safeJson<{ user?: AnyRecord } | null>(localStorage.getItem('a3k64-login-session-v1'), null);
  return String(session?.user?.email || session?.user?.username || session?.user?.uid || '').trim().toLowerCase();
}

function emitMessagesChange() {
  window.dispatchEvent(new Event('a3k64-messages-local-change'));
}

function clearMessagesCache(clearContacts = false) {
  localStorage.setItem(LOCAL_MESSAGES_KEY, '[]');
  localStorage.setItem(LOCAL_PRESENCE_KEY, '[]');
  if (clearContacts) localStorage.setItem(LOCAL_CONTACTS_KEY, '[]');
  emitMessagesChange();
}

function gasJsonp(action: string, payload?: unknown): Promise<any | null> {
  if (!GAS_URL || typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const callbackName = `__a3k64MessagesReload_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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
    timeoutId = window.setTimeout(() => finish(null), 10000);
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function unwrapState(response: any) {
  const data = response?.data || response;
  return data?.messagesState || data;
}

function normalizeMessages(messages: any[]) {
  return messages
    .filter((message) => message && message.id && (message.kind === 'chat' || message.kind === 'message' || message.kind === 'permission_request'))
    .map((message) => ({ ...message, kind: message.kind === 'message' ? 'chat' : message.kind }));
}

async function hardReloadMessagesFromServer(showToast = true) {
  const app = document.querySelector('.messages-native-app');
  if (!app) return;
  app.classList.add('a3-messages-reloading');

  clearMessagesCache(false);
  const user = sessionEmail();
  const response = await gasJsonp('getMessages', { user, limit: 250, force: 1, noCache: 1 });
  const state = unwrapState(response);
  const messages = Array.isArray(state?.messages) ? normalizeMessages(state.messages) : [];
  const presence = Array.isArray(state?.presence) ? state.presence : [];
  const contacts = Array.isArray(state?.contacts) ? state.contacts : [];

  localStorage.setItem(LOCAL_MESSAGES_KEY, JSON.stringify(messages));
  localStorage.setItem(LOCAL_PRESENCE_KEY, JSON.stringify(presence));
  if (contacts.length) localStorage.setItem(LOCAL_CONTACTS_KEY, JSON.stringify(contacts));
  emitMessagesChange();

  app.classList.remove('a3-messages-reloading');
  if (showToast && messages.length === 0) showMessageToast('Sheet MESSAGES không có dữ liệu, đã xoá cache hiển thị.');
}

function showMessageToast(text: string) {
  const old = document.querySelector('.a3-message-server-reload-toast');
  old?.remove();
  const node = document.createElement('div');
  node.className = 'messages-toast a3-message-server-reload-toast';
  node.textContent = text;
  document.querySelector('.messages-native-app')?.appendChild(node);
  window.setTimeout(() => node.remove(), 2400);
}

function isReloadButton(button: HTMLButtonElement) {
  const title = (button.getAttribute('title') || '').toLowerCase();
  const text = (button.textContent || '').toLowerCase();
  const inProfile = Boolean(button.closest('.messages-profile-card'));
  return inProfile || title.includes('đồng bộ') || text.includes('đồng bộ');
}

function initMessagesServerReloadHardFix() {
  document.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement | null)?.closest('button') as HTMLButtonElement | null;
    if (!button || !button.closest('.messages-native-app') || !isReloadButton(button)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void hardReloadMessagesFromServer(true);
  }, true);

  const once = () => {
    if (document.querySelector('.messages-native-app')) void hardReloadMessagesFromServer(false);
  };
  window.setTimeout(once, 300);
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMessagesServerReloadHardFix, { once: true });
  else initMessagesServerReloadHardFix();
}

export {};

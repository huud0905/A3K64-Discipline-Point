import { SESSION_KEY } from '../../../core/auth';
import { requestJsonp } from '../../../core/network';
import { safeJsonParse, writeJsonStorage } from '../../../core/storage';

const GAS_URL = import.meta.env.VITE_GAS_WEB_APP_URL?.trim();
const LOCAL_MESSAGES_KEY = 'a3k64-messages-local-v1';
const LOCAL_PRESENCE_KEY = 'a3k64-messages-presence-local-v1';
const LOCAL_CONTACTS_KEY = 'a3k64-messages-contacts-local-v1';

type AnyRecord = Record<string, unknown>;

function sessionEmail() {
  const session = safeJsonParse<{ user?: AnyRecord } | null>(localStorage.getItem(SESSION_KEY), null);
  return String(session?.user?.email || session?.user?.username || session?.user?.uid || '').trim().toLowerCase();
}

function emitMessagesChange() {
  window.dispatchEvent(new Event('a3k64-messages-local-change'));
}

function clearMessagesCache(clearContacts = false) {
  writeJsonStorage(LOCAL_MESSAGES_KEY, []);
  writeJsonStorage(LOCAL_PRESENCE_KEY, []);
  if (clearContacts) writeJsonStorage(LOCAL_CONTACTS_KEY, []);
  emitMessagesChange();
}

function gasJsonp(action: string, payload?: unknown): Promise<any | null> {
  return requestJsonp(GAS_URL, { action, payload }, { timeoutMs: 10000, callbackPrefix: '__a3k64MessagesReload' });
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

  writeJsonStorage(LOCAL_MESSAGES_KEY, messages);
  writeJsonStorage(LOCAL_PRESENCE_KEY, presence);
  if (contacts.length) writeJsonStorage(LOCAL_CONTACTS_KEY, contacts);
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

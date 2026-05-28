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

function toTargetId(raw: string) {
  const value = raw.trim();
  if (value.includes('@')) return normalizeUser(value);
  return value.toLowerCase();
}

function upsertLocalContact(targetId: string, targetName: string) {
  const contacts = safeJson<Array<Record<string, unknown>>>(localStorage.getItem(LOCAL_CONTACTS_KEY), []);
  const next = [
    { email: targetId, name: targetName, displayName: targetName },
    ...contacts.filter((item) => normalizeUser(item.email) !== targetId),
  ].slice(0, 300);
  localStorage.setItem(LOCAL_CONTACTS_KEY, JSON.stringify(next));
}

function appendLocalThread(targetName: string) {
  const user = readSessionUser();
  const targetId = toTargetId(targetName);
  const now = new Date().toISOString();
  const message = {
    id: makeMessageId(),
    threadId: [user.email, targetId].sort().join('__'),
    kind: 'chat',
    from: user.email,
    fromName: user.name,
    to: targetId,
    toName: targetName,
    body: 'Đã tạo cuộc trò chuyện.',
    status: 'sent',
    createdAt: now,
  };
  const messages = safeJson<Array<Record<string, unknown>>>(localStorage.getItem(LOCAL_MESSAGES_KEY), []);
  const exists = messages.some((item) => item.threadId === message.threadId);
  localStorage.setItem(LOCAL_MESSAGES_KEY, JSON.stringify(exists ? messages : [...messages, message]));
  upsertLocalContact(targetId, targetName);

  window.dispatchEvent(new Event('a3k64-messages-local-change'));

  const syncButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.messages-soft'))
    .find((button) => (button.textContent || '').toLowerCase().includes('đồng bộ'));
  window.setTimeout(() => syncButton?.click(), 80);
}

function createThreadFromInput(input: HTMLInputElement) {
  const name = input.value.trim();
  if (!name) return false;
  appendLocalThread(name);
  setReactInputValue(input, '');
  return true;
}

function openSelectedContact(button: HTMLButtonElement) {
  const box = button.closest('.messages-new-thread');
  const input = box?.querySelector<HTMLInputElement>('.messages-contact-box input');
  const name = (button.querySelector('strong')?.textContent || button.textContent || '').trim();
  if (!input || !name) return;
  setReactInputValue(input, name);
  window.setTimeout(() => createThreadFromInput(input), 50);
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

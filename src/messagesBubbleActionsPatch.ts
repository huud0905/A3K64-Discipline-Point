const LOCAL_MESSAGES_KEY = 'a3k64-messages-local-v1';

function safeJson<T>(raw: string | null, fallback: T): T {
  try { return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}

function getBubbleText(bubble: Element) {
  return (bubble.querySelector('p')?.textContent || '').trim();
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(textarea, value);
  else textarea.value = value;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

function readSessionEmail() {
  const session = safeJson<{ user?: Record<string, unknown> } | null>(localStorage.getItem('a3k64-login-session-v1'), null);
  return String(session?.user?.email || session?.user?.username || session?.user?.uid || '').trim().toLowerCase();
}

function initialsFromName(name: string) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function bubbleSenderName(bubble: HTMLElement) {
  const meta = bubble.querySelector('span')?.textContent || '';
  return meta.split('·')[0]?.trim() || '';
}

function activeThreadName() {
  return (document.querySelector('.messages-chat-title strong')?.textContent || '').trim();
}

function activeThreadIdFromDom() {
  const activeCard = document.querySelector('.messages-thread-card.active');
  const name = (activeCard?.querySelector('.messages-thread-info strong')?.textContent || activeThreadName()).trim();
  const lastText = (activeCard?.querySelector('.messages-thread-info p')?.textContent || '').trim();
  return { name, lastText };
}

function markActiveThreadReadLocal() {
  const me = readSessionEmail();
  if (!me) return;
  const active = activeThreadIdFromDom();
  if (!active.name) return;
  const messages = safeJson<Array<Record<string, unknown>>>(localStorage.getItem(LOCAL_MESSAGES_KEY), []);
  let changed = false;
  const next = messages.map((message) => {
    const to = String(message.to || '').toLowerCase();
    const fromName = String(message.fromName || '');
    const toName = String(message.toName || '');
    const body = String(message.body || '');
    const belongs = fromName === active.name || toName === active.name || body === active.lastText;
    if (belongs && to === me && message.status !== 'read') {
      changed = true;
      return { ...message, status: 'read', readAt: new Date().toISOString() };
    }
    return message;
  });
  if (changed) {
    localStorage.setItem(LOCAL_MESSAGES_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('a3k64-messages-local-change'));
  }
}

function toast(text: string) {
  const old = document.querySelector('.a3-message-action-toast');
  old?.remove();
  const node = document.createElement('div');
  node.className = 'messages-toast a3-message-action-toast';
  node.textContent = text;
  document.querySelector('.messages-native-app')?.appendChild(node);
  window.setTimeout(() => node.remove(), 2200);
}

function addAvatarToBubble(bubble: HTMLElement) {
  if (bubble.classList.contains('mine')) return;
  if (bubble.querySelector('.a3-bubble-avatar')) return;
  const name = bubbleSenderName(bubble) || activeThreadName();
  const avatar = document.createElement('span');
  avatar.className = 'a3-bubble-avatar';
  avatar.textContent = initialsFromName(name);
  bubble.appendChild(avatar);
}

function patchBubble(bubble: HTMLElement) {
  if (bubble.dataset.a3BubbleActions === '1') {
    addAvatarToBubble(bubble);
    return;
  }
  bubble.dataset.a3BubbleActions = '1';
  const meta = bubble.querySelector('span')?.textContent || '';
  if (meta) bubble.title = meta;
  addAvatarToBubble(bubble);

  const isMine = bubble.classList.contains('mine');
  const actions = document.createElement('div');
  actions.className = 'a3-message-hover-actions';
  actions.innerHTML = `
    <button type="button" data-action="react" title="React">😊</button>
    <button type="button" data-action="reply" title="Trả lời">↩</button>
    <button type="button" data-action="more" title="Thêm">⋮</button>
    <div class="a3-message-more-menu">
      <button type="button" data-action="forward">Chuyển tiếp</button>
      <button type="button" data-action="remove-me">Gỡ bên phía bạn</button>
      ${isMine ? '<button type="button" data-action="unsend">Thu hồi cả 2 phía</button>' : ''}
      <button type="button" data-action="pin">Ghim</button>
    </div>
  `;
  actions.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.target as HTMLElement;
    const action = target.closest('[data-action]')?.getAttribute('data-action');
    if (!action) return;
    if (action === 'react') {
      const existing = bubble.querySelector('.a3-message-reaction');
      if (existing) existing.remove();
      else {
        const reaction = document.createElement('span');
        reaction.className = 'a3-message-reaction';
        reaction.textContent = '❤️';
        bubble.appendChild(reaction);
      }
    }
    if (action === 'reply') {
      const textarea = document.querySelector<HTMLTextAreaElement>('.messages-composer textarea');
      const text = getBubbleText(bubble);
      if (textarea && text) {
        setTextareaValue(textarea, 'Trả lời: "' + text.slice(0, 80) + '"\n');
        textarea.focus();
      }
    }
    if (action === 'more') bubble.classList.toggle('a3-more-open');
    if (action === 'forward') toast('Chuyển tiếp sẽ thêm ở bước tiếp theo.');
    if (action === 'remove-me' || action === 'unsend') {
      bubble.remove();
      toast(action === 'unsend' ? 'Đã thu hồi tin nhắn.' : 'Đã gỡ bên phía bạn.');
    }
    if (action === 'pin') {
      bubble.classList.toggle('a3-pinned-message');
      toast(bubble.classList.contains('a3-pinned-message') ? 'Đã ghim tin nhắn.' : 'Đã bỏ ghim.');
    }
  });
  bubble.appendChild(actions);
}

function patchAll() {
  document.querySelectorAll<HTMLElement>('.messages-bubble').forEach(patchBubble);
  markActiveThreadReadLocal();
}

function init() {
  patchAll();
  const observer = new MutationObserver(patchAll);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.messages-thread-card,.messages-thread-main,.messages-chat-main,.messages-main-panel')) {
      window.setTimeout(markActiveThreadReadLocal, 100);
    }
  }, true);
  window.setInterval(markActiveThreadReadLocal, 2500);
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}

export {};
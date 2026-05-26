import {
  ChatMessage,
  fetchMessagesState,
  isOnline,
  markThreadRead,
  readSessionUser,
  requestGroupAccess,
  respondGroupAccess,
  sendChatMessage,
  updatePresence,
} from '../lib/messagesApi';

const STYLE_ID = 'a3k64-messages-runtime-style';
const WINDOW_ID = 'a3k64-messages-window';
const SHORTCUT_ID = 'a3k64-messages-shortcut';
const TASK_ID = 'a3k64-messages-task';
const MESSAGE_ICON_SVG = `
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M7 10h10" />
    <path d="M7 14h6" />
    <path d="M21 11.5c0 4.142-4.03 7.5-9 7.5a10.5 10.5 0 0 1-3.2-.49L4 20l1.42-3.32C4.52 15.34 4 13.47 4 11.5 4 7.36 8.03 4 13 4s8 3.36 8 7.5Z" />
  </svg>
`;

let open = false;
let minimized = false;
let activeThread = '';
let stateMessages: ChatMessage[] = [];
let statePresence: { user: string; name: string; activeAt: string }[] = [];
let pollTimer = 0;
let presenceTimer = 0;

const css = `
  .a3-messages-shortcut .desktop-shortcut-icon{color:var(--desktop-accent,#2563eb)}
  .a3-message-symbol{display:grid;place-items:center}.a3-message-symbol svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.desktop-shortcut-icon.a3-message-symbol svg{width:30px;height:30px}.a3-msg-icon.a3-message-symbol svg{width:18px;height:18px;color:#fff}.task-icon .a3-message-symbol svg{width:18px;height:18px}
  .a3-msg-window{position:absolute;left:calc(50% - 520px);top:34px;width:min(1040px,calc(100vw - 180px));height:min(670px,calc(100vh - 110px));min-height:540px;border:1px solid #273244;border-radius:22px;overflow:hidden;background:#0b1220;color:#f8fafc;box-shadow:0 34px 100px rgba(0,0,0,.46);z-index:90;font-family:"Segoe UI",system-ui,-apple-system,BlinkMacSystemFont,Arial,sans-serif}
  .a3-msg-window.minimized{display:none}.a3-msg-titlebar{height:46px;display:grid;grid-template-columns:1fr auto;align-items:center;border-bottom:1px solid #273244;background:#0b1220}.a3-msg-title-left{display:flex;align-items:center;gap:10px;padding-left:14px;font-weight:900}.a3-msg-icon{width:28px;height:28px;border-radius:9px;display:grid;place-items:center;color:#fff;background:var(--desktop-accent,#2563eb)}.a3-msg-actions{height:100%;display:flex}.a3-msg-actions button{width:46px;border:0;background:transparent;color:#e2e8f0;display:grid;place-items:center;font:inherit;cursor:pointer}.a3-msg-actions button:hover{background:#172033}.a3-msg-actions .close{margin:7px 8px 7px 0;width:32px;height:32px;border-radius:9px;background:rgba(239,68,68,.92)}
  .a3-msg-body{height:calc(100% - 46px);display:grid;grid-template-columns:300px minmax(0,1fr);min-height:0}.a3-msg-sidebar{border-right:1px solid #273244;background:#050914;display:flex;flex-direction:column;min-height:0}.a3-msg-user{padding:14px;border-bottom:1px solid #273244}.a3-msg-user strong{display:block}.a3-msg-user span{display:block;color:#94a3b8;font-size:12px;margin-top:3px}.a3-msg-compose-top{display:grid;gap:8px;padding:12px;border-bottom:1px solid #273244}.a3-msg-input{height:36px;border:1px solid #273244;border-radius:11px;color:#f8fafc;background:#0b1220;padding:0 11px;font:inherit;min-width:0}.a3-msg-button{height:36px;border:0;border-radius:11px;color:#fff;background:var(--desktop-accent,#2563eb);font:inherit;font-weight:850;cursor:pointer}.a3-msg-button.ghost{border:1px solid #273244;color:#f8fafc;background:#111827}.a3-msg-thread-list{overflow:auto;padding:10px;display:grid;gap:8px}.a3-msg-thread{border:1px solid #1f2937;border-radius:14px;padding:10px;color:#f8fafc;background:#0b1220;text-align:left;font:inherit;cursor:pointer}.a3-msg-thread.active,.a3-msg-thread:hover{border-color:color-mix(in srgb,var(--desktop-accent,#2563eb) 55%,#273244);background:#111827}.a3-msg-thread-top{display:flex;align-items:center;justify-content:space-between;gap:8px}.a3-msg-thread strong{font-size:13px}.a3-msg-thread p{margin:5px 0 0;color:#94a3b8;font-size:12px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.a3-msg-dot{width:9px;height:9px;border-radius:999px;background:#64748b}.a3-msg-dot.online{background:#22c55e}.a3-unread{min-width:18px;height:18px;border-radius:999px;display:grid;place-items:center;color:#fff;background:#ef4444;font-size:11px;font-weight:900}
  .a3-msg-main{min-width:0;min-height:0;display:flex;flex-direction:column;background:#07111f}.a3-msg-chat-head{min-height:62px;border-bottom:1px solid #273244;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;background:#0b1220}.a3-msg-chat-head strong{display:block}.a3-msg-chat-head span{display:block;color:#94a3b8;font-size:12px;margin-top:3px}.a3-msg-permission{border-bottom:1px solid #273244;padding:10px 14px;background:#050914;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end}.a3-msg-permission-fields{display:grid;grid-template-columns:100px 1fr;gap:8px}.a3-msg-feed{flex:1;overflow:auto;padding:18px;display:flex;flex-direction:column;gap:10px}.a3-msg-bubble{max-width:min(520px,82%);border:1px solid #273244;border-radius:18px;padding:10px 12px;background:#0b1220}.a3-msg-bubble.mine{align-self:flex-end;border-color:color-mix(in srgb,var(--desktop-accent,#2563eb) 55%,#273244);background:color-mix(in srgb,var(--desktop-accent,#2563eb) 20%,#0b1220)}.a3-msg-bubble.system{align-self:center;max-width:90%;background:#111827}.a3-msg-bubble p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.a3-msg-meta{display:flex;gap:8px;margin-top:6px;color:#94a3b8;font-size:11px}.a3-msg-perm-card{border-color:#f59e0b;background:#281c07}.a3-msg-perm-actions{display:flex;gap:8px;margin-top:9px}.a3-msg-composer{min-height:62px;border-top:1px solid #273244;display:grid;grid-template-columns:1fr auto;gap:10px;padding:10px 12px;background:#0b1220}.a3-msg-textarea{min-height:42px;max-height:96px;border:1px solid #273244;border-radius:14px;color:#f8fafc;background:#050914;padding:10px 12px;font:inherit;resize:none}.a3-msg-empty{height:100%;display:grid;place-items:center;color:#94a3b8;text-align:center;padding:20px}.a3-msg-toast{position:fixed;right:20px;bottom:88px;z-index:4000;border:1px solid #273244;border-radius:16px;padding:12px 14px;color:#f8fafc;background:#0b1220;box-shadow:0 22px 60px rgba(0,0,0,.42)}
  .win-root.theme-light .a3-msg-window,.win-root.theme-light .a3-msg-titlebar,.win-root.theme-light .a3-msg-chat-head,.win-root.theme-light .a3-msg-composer{color:#0f172a;border-color:#d7dee8;background:#fff}.win-root.theme-light .a3-msg-sidebar{border-color:#d7dee8;background:#f8fafc}.win-root.theme-light .a3-msg-main{background:#f1f5f9}.win-root.theme-light .a3-msg-thread,.win-root.theme-light .a3-msg-bubble,.win-root.theme-light .a3-msg-input,.win-root.theme-light .a3-msg-textarea,.win-root.theme-light .a3-msg-button.ghost{color:#0f172a;border-color:#d7dee8;background:#fff}.win-root.theme-light .a3-msg-thread.active,.win-root.theme-light .a3-msg-thread:hover{background:#e2e8f0}.win-root.theme-light .a3-msg-user span,.win-root.theme-light .a3-msg-thread p,.win-root.theme-light .a3-msg-chat-head span,.win-root.theme-light .a3-msg-meta{color:#64748b}.win-root.theme-light .a3-msg-permission{border-color:#d7dee8;background:#f8fafc}
  @media(max-width:760px){.a3-msg-window{position:fixed;inset:0 0 70px 0;width:100vw;height:calc(100svh - 70px);min-height:0;border-radius:0;border:0;z-index:65}.a3-msg-body{grid-template-columns:1fr}.a3-msg-sidebar{display:none}.a3-msg-permission-fields{grid-template-columns:1fr}.a3-msg-permission{grid-template-columns:1fr}.a3-msg-feed{padding:12px}.a3-msg-bubble{max-width:92%}}
`;

function htmlEscape(value: unknown) {
  return String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] || ch));
}

function user() {
  return readSessionUser();
}

function installStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

function ensureShortcut() {
  const icons = document.querySelector<HTMLElement>('.desktop-icons');
  if (!icons || document.getElementById(SHORTCUT_ID)) return;
  const button = document.createElement('button');
  button.id = SHORTCUT_ID;
  button.type = 'button';
  button.className = 'desktop-shortcut a3-messages-shortcut';
  button.title = 'Messages - bấm đúp để mở';
  button.innerHTML = `<div class="desktop-shortcut-icon a3-message-symbol">${MESSAGE_ICON_SVG}</div><span>Messages</span>`;
  button.addEventListener('dblclick', () => openMessagesWindow());
  button.addEventListener('click', () => {
    if (document.querySelector('.win-root.a3-real-mobile')) openMessagesWindow();
  });
  icons.appendChild(button);
}

function ensureTaskButton() {
  const taskCenter = document.querySelector<HTMLElement>('.taskbar .task-center');
  if (!taskCenter) return;
  const old = document.getElementById(TASK_ID);
  if (!open) {
    old?.remove();
    return;
  }
  if (old) return;
  const button = document.createElement('button');
  button.id = TASK_ID;
  button.type = 'button';
  button.className = 'task-icon running-app show-badge';
  button.title = 'Messages';
  button.innerHTML = `<span class="a3-message-symbol">${MESSAGE_ICON_SVG}</span>`;
  button.addEventListener('click', () => {
    minimized = false;
    document.getElementById(WINDOW_ID)?.classList.remove('minimized');
  });
  taskCenter.appendChild(button);
}

function threadOther(threadId: string) {
  const me = user().email;
  const msg = stateMessages.find((item) => item.threadId === threadId);
  if (!msg) return { id: '', name: 'Cuộc trò chuyện' };
  if (msg.from === me) return { id: msg.to, name: msg.toName || msg.to };
  return { id: msg.from, name: msg.fromName || msg.from };
}

function threads() {
  const me = user().email;
  const relevant = stateMessages.filter((msg) => msg.from === me || msg.to === me || msg.to.startsWith('to'));
  const map = new Map<string, ChatMessage[]>();
  relevant.forEach((msg) => map.set(msg.threadId, [...(map.get(msg.threadId) || []), msg]));
  return [...map.entries()].map(([threadId, messages]) => ({ threadId, messages: messages.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)) })).sort((a, b) => Date.parse(b.messages[b.messages.length - 1]?.createdAt || '') - Date.parse(a.messages[a.messages.length - 1]?.createdAt || ''));
}

function unreadCount(threadMessages: ChatMessage[]) {
  const me = user().email;
  return threadMessages.filter((msg) => msg.to === me && msg.status !== 'read').length;
}

function onlineLine(target: string) {
  const p = statePresence.find((item) => item.user === target);
  if (!p) return 'Chưa có trạng thái';
  return isOnline(p.activeAt) ? 'Đang hoạt động' : 'Hoạt động gần đây';
}

function renderWindow() {
  const win = document.getElementById(WINDOW_ID);
  if (!win) return;
  const me = user();
  const allThreads = threads();
  if (!activeThread && allThreads[0]) activeThread = allThreads[0].threadId;
  const active = allThreads.find((item) => item.threadId === activeThread);
  const other = active ? threadOther(active.threadId) : { id: '', name: 'Chưa chọn cuộc trò chuyện' };
  const activeMessages = active?.messages || [];

  win.innerHTML = `
    <header class="a3-msg-titlebar">
      <div class="a3-msg-title-left"><div class="a3-msg-icon a3-message-symbol">${MESSAGE_ICON_SVG}</div><strong>Messages</strong></div>
      <div class="a3-msg-actions"><button data-msg-min>–</button><button class="close" data-msg-close>×</button></div>
    </header>
    <div class="a3-msg-body">
      <aside class="a3-msg-sidebar">
        <div class="a3-msg-user"><strong>${htmlEscape(me.name)}</strong><span>${htmlEscape(me.email)} · ${htmlEscape(me.role || '')}${me.group ? ` · Tổ ${htmlEscape(me.group)}` : ''}</span></div>
        <div class="a3-msg-compose-top">
          <input class="a3-msg-input" data-new-to placeholder="Email người nhận hoặc to1/to2..." />
          <button class="a3-msg-button ghost" data-new-thread>Cuộc trò chuyện mới</button>
        </div>
        <div class="a3-msg-thread-list">
          ${allThreads.length ? allThreads.map((thread) => {
            const last = thread.messages[thread.messages.length - 1];
            const target = threadOther(thread.threadId);
            const presence = statePresence.find((item) => item.user === target.id);
            const unread = unreadCount(thread.messages);
            return `<button class="a3-msg-thread ${thread.threadId === activeThread ? 'active' : ''}" data-thread="${htmlEscape(thread.threadId)}"><div class="a3-msg-thread-top"><strong>${htmlEscape(target.name)}</strong><span class="a3-msg-dot ${presence && isOnline(presence.activeAt) ? 'online' : ''}"></span>${unread ? `<span class="a3-unread">${unread}</span>` : ''}</div><p>${htmlEscape(last?.body || '')}</p></button>`;
          }).join('') : '<div class="a3-msg-empty">Chưa có tin nhắn.</div>'}
        </div>
      </aside>
      <main class="a3-msg-main">
        <div class="a3-msg-chat-head"><div><strong>${htmlEscape(other.name)}</strong><span>${htmlEscape(other.id ? onlineLine(other.id) : 'Tạo cuộc trò chuyện mới ở bên trái')}</span></div><button class="a3-msg-button ghost" data-refresh>Đồng bộ</button></div>
        <div class="a3-msg-permission">
          <div class="a3-msg-permission-fields"><input class="a3-msg-input" data-perm-group placeholder="Tổ cần xin quyền, VD: 2" /><input class="a3-msg-input" data-perm-reason placeholder="Lý do xin quyền hỗ trợ chấm" /></div>
          <button class="a3-msg-button" data-perm-send>Xin quyền chấm tổ khác</button>
        </div>
        <div class="a3-msg-feed">
          ${activeMessages.length ? activeMessages.map((msg) => renderMessage(msg)).join('') : '<div class="a3-msg-empty"><div><strong>Messages 12A3</strong><br/>Chọn hoặc tạo cuộc trò chuyện để bắt đầu.</div></div>'}
        </div>
        <div class="a3-msg-composer"><textarea class="a3-msg-textarea" data-body placeholder="Nhập tin nhắn..."></textarea><button class="a3-msg-button" data-send>Gửi</button></div>
      </main>
    </div>`;
}

function renderMessage(msg: ChatMessage) {
  const me = user().email;
  const mine = msg.from === me;
  const time = new Date(msg.createdAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  if (msg.kind === 'permission_request') {
    const pending = msg.permissionStatus === 'pending';
    const canResolve = !mine && pending;
    return `<article class="a3-msg-bubble a3-msg-perm-card ${mine ? 'mine' : ''}"><p><strong>Yêu cầu cấp quyền chấm điểm</strong><br/>${htmlEscape(msg.fromName)} xin hỗ trợ chấm Tổ ${htmlEscape(msg.targetGroup || '')}${msg.week ? ` · Tuần ${htmlEscape(msg.week)}` : ''}<br/>${htmlEscape(msg.body)}</p><div class="a3-msg-meta"><span>${time}</span><span>${htmlEscape(msg.permissionStatus || 'pending')}</span></div>${canResolve ? `<div class="a3-msg-perm-actions"><button class="a3-msg-button" data-approve="${htmlEscape(msg.id)}">Đồng ý</button><button class="a3-msg-button ghost" data-reject="${htmlEscape(msg.id)}">Từ chối</button></div>` : ''}</article>`;
  }
  return `<article class="a3-msg-bubble ${mine ? 'mine' : ''}"><p>${htmlEscape(msg.body)}</p><div class="a3-msg-meta"><span>${htmlEscape(msg.fromName)}</span><span>${time}</span>${mine ? `<span>${msg.status === 'read' ? 'Đã đọc' : 'Đã gửi'}</span>` : ''}</div></article>`;
}

async function syncMessages() {
  const state = await fetchMessagesState();
  stateMessages = state.messages;
  statePresence = state.presence;
  renderWindow();
}

function openMessagesWindow() {
  installStyle();
  open = true;
  minimized = false;
  let win = document.getElementById(WINDOW_ID);
  if (!win) {
    win = document.createElement('section');
    win.id = WINDOW_ID;
    win.className = 'a3-msg-window';
    const desktop = document.querySelector('.win-desktop') || document.body;
    desktop.appendChild(win);
    win.addEventListener('click', handleClick);
    win.addEventListener('keydown', handleKeydown);
  }
  win.classList.remove('minimized');
  ensureTaskButton();
  void updatePresence();
  void syncMessages();
  window.clearInterval(pollTimer);
  window.clearInterval(presenceTimer);
  pollTimer = window.setInterval(syncMessages, 5000);
  presenceTimer = window.setInterval(() => void updatePresence(), 30000);
  renderWindow();
}

async function handleClick(event: Event) {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  if (target.closest('[data-msg-close]')) {
    open = false;
    document.getElementById(WINDOW_ID)?.remove();
    window.clearInterval(pollTimer);
    window.clearInterval(presenceTimer);
    ensureTaskButton();
    return;
  }
  if (target.closest('[data-msg-min]')) {
    minimized = true;
    document.getElementById(WINDOW_ID)?.classList.add('minimized');
    return;
  }
  const threadButton = target.closest<HTMLElement>('[data-thread]');
  if (threadButton) {
    activeThread = threadButton.dataset.thread || '';
    await markThreadRead(activeThread);
    await syncMessages();
    return;
  }
  if (target.closest('[data-new-thread]')) {
    const input = document.querySelector<HTMLInputElement>('#a3k64-messages-window [data-new-to]');
    const to = input?.value.trim().toLowerCase() || '';
    if (!to) return toast('Nhập email hoặc to1/to2/to3/to4 để tạo cuộc trò chuyện.');
    activeThread = [user().email, to].sort().join('__');
    await sendChatMessage(to, 'Đã tạo cuộc trò chuyện.', to.startsWith('to') ? `Tổ ${to.replace(/\D/g, '')}` : to);
    await syncMessages();
    return;
  }
  if (target.closest('[data-send]')) {
    const body = document.querySelector<HTMLTextAreaElement>('#a3k64-messages-window [data-body]')?.value.trim() || '';
    if (!body) return;
    const other = threadOther(activeThread);
    if (!other.id) return toast('Chưa chọn người nhận.');
    await sendChatMessage(other.id, body, other.name);
    await syncMessages();
    return;
  }
  if (target.closest('[data-perm-send]')) {
    const group = Number(document.querySelector<HTMLInputElement>('#a3k64-messages-window [data-perm-group]')?.value || 0);
    const reason = document.querySelector<HTMLInputElement>('#a3k64-messages-window [data-perm-reason]')?.value || '';
    if (![1, 2, 3, 4].includes(group)) return toast('Nhập tổ cần xin quyền từ 1 đến 4.');
    await requestGroupAccess(group, reason);
    await syncMessages();
    return;
  }
  const approve = target.closest<HTMLElement>('[data-approve]');
  const reject = target.closest<HTMLElement>('[data-reject]');
  if (approve || reject) {
    await respondGroupAccess((approve || reject)?.dataset.approve || (approve || reject)?.dataset.reject || '', approve ? 'approved' : 'rejected');
    await syncMessages();
    return;
  }
  if (target.closest('[data-refresh]')) await syncMessages();
}

function handleKeydown(event: Event) {
  const keyboard = event as KeyboardEvent;
  const target = keyboard.target as HTMLElement | null;
  if (keyboard.key === 'Enter' && !keyboard.shiftKey && target?.matches('[data-body]')) {
    keyboard.preventDefault();
    document.querySelector<HTMLElement>('#a3k64-messages-window [data-send]')?.click();
  }
}

function toast(message: string) {
  const div = document.createElement('div');
  div.className = 'a3-msg-toast';
  div.textContent = message;
  document.body.appendChild(div);
  window.setTimeout(() => div.remove(), 2600);
}

function boot() {
  installStyle();
  ensureShortcut();
  ensureTaskButton();
}

const observer = new MutationObserver(() => boot());
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('load', boot);
window.addEventListener('a3k64-messages-local-change', () => {
  if (!open || minimized) return;
  stateMessages = JSON.parse(localStorage.getItem('a3k64-messages-local-v1') || '[]');
  renderWindow();
});
boot();

export {};

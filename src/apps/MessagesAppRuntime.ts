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
const APP_PATH = '/desktop/messages';
const MESSAGE_ICON_SVG = `
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M7 10h10" />
    <path d="M7 14h6" />
    <path d="M21 11.5c0 4.142-4.03 7.5-9 7.5a10.5 10.5 0 0 1-3.2-.49L4 20l1.42-3.32C4.52 15.34 4 13.47 4 11.5 4 7.36 8.03 4 13 4s8 3.36 8 7.5Z" />
  </svg>
`;

let open = false;
let minimized = false;
let activePanel: 'chats' | 'requests' = 'chats';
let activeThread = '';
let stateMessages: ChatMessage[] = [];
let statePresence: { user: string; name: string; activeAt: string }[] = [];
let pollTimer = 0;
let presenceTimer = 0;
let zIndex = 160;

const css = `
  .a3-message-symbol{display:grid;place-items:center}.a3-message-symbol svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.desktop-shortcut-icon.a3-message-symbol svg{width:30px;height:30px}.title-icon.a3-message-symbol svg{width:18px;height:18px;color:#fff}.task-icon .a3-message-symbol svg{width:18px;height:18px}.a3-messages-shortcut .desktop-shortcut-icon{color:var(--desktop-accent,#f97316)}
  .a3-msg-native-window{left:calc(50% - min(560px,calc((100vw - 176px)/2)))!important;top:26px!important;width:min(1120px,calc(100vw - 176px))!important;height:min(720px,calc(100vh - 104px))!important;min-height:560px!important;transform:translate(var(--win-x,0px),var(--win-y,0px))!important}.a3-msg-native-window.maximized{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:calc(100vh - 58px)!important;transform:none!important;border-radius:0!important}.a3-msg-native-window.minimized{display:none!important}.a3-msg-native-window .win-body{display:block!important;height:calc(100% - 46px)!important;min-height:0!important;overflow:hidden!important;background:#07111f!important}.a3-msg-app{height:100%;display:grid;grid-template-columns:320px minmax(0,1fr);min-height:0;color:#f8fafc;background:#07111f;font-family:"Segoe UI",system-ui,-apple-system,BlinkMacSystemFont,Arial,sans-serif}.a3-msg-sidebar{border-right:1px solid #273244;background:#050914;display:flex;flex-direction:column;min-height:0}.a3-msg-user{padding:14px;border-bottom:1px solid #273244}.a3-msg-user strong{display:block;font-size:15px}.a3-msg-user span{display:block;color:#94a3b8;font-size:12px;margin-top:3px}.a3-msg-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px 12px;border-bottom:1px solid #273244}.a3-msg-tab{height:36px;border:1px solid #273244;border-radius:12px;color:#94a3b8;background:#0b1220;font:inherit;font-weight:850;cursor:pointer}.a3-msg-tab.active{color:#fff;border-color:color-mix(in srgb,var(--desktop-accent,#f97316) 60%,#273244);background:color-mix(in srgb,var(--desktop-accent,#f97316) 18%,#0b1220)}.a3-msg-compose-top{display:grid;gap:8px;padding:12px;border-bottom:1px solid #273244}.a3-msg-input{height:38px;border:1px solid #273244;border-radius:12px;color:#f8fafc;background:#0b1220;padding:0 12px;font:inherit;min-width:0}.a3-msg-input:focus,.a3-msg-textarea:focus{outline:2px solid color-mix(in srgb,var(--desktop-accent,#f97316) 42%,transparent);border-color:var(--desktop-accent,#f97316)}.a3-msg-button{height:38px;border:0;border-radius:12px;color:#fff;background:var(--desktop-accent,#f97316);font:inherit;font-weight:900;cursor:pointer}.a3-msg-button.ghost{border:1px solid #273244;color:#f8fafc;background:#111827}.a3-msg-button.danger{background:#ef4444}.a3-msg-thread-list,.a3-msg-request-list{overflow:auto;padding:10px;display:grid;gap:8px;align-content:start}.a3-msg-thread,.a3-msg-request-card{border:1px solid #1f2937;border-radius:15px;padding:11px;color:#f8fafc;background:#0b1220;text-align:left;font:inherit}.a3-msg-thread{cursor:pointer}.a3-msg-thread.active,.a3-msg-thread:hover,.a3-msg-request-card:hover{border-color:color-mix(in srgb,var(--desktop-accent,#f97316) 55%,#273244);background:#111827}.a3-msg-thread-top,.a3-msg-request-top{display:flex;align-items:center;justify-content:space-between;gap:8px}.a3-msg-thread strong,.a3-msg-request-card strong{font-size:13px}.a3-msg-thread p,.a3-msg-request-card p{margin:5px 0 0;color:#94a3b8;font-size:12px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.a3-msg-dot{width:9px;height:9px;border-radius:999px;background:#64748b}.a3-msg-dot.online{background:#22c55e}.a3-unread{min-width:18px;height:18px;border-radius:999px;display:grid;place-items:center;color:#fff;background:#ef4444;font-size:11px;font-weight:900}.a3-status-pill{height:22px;border-radius:999px;padding:0 9px;display:inline-grid;place-items:center;font-size:11px;font-weight:900;background:#1f2937;color:#cbd5e1}.a3-status-pill.pending{background:#422006;color:#fbbf24}.a3-status-pill.approved{background:#052e16;color:#22c55e}.a3-status-pill.rejected{background:#450a0a;color:#f87171}.a3-msg-main{min-width:0;min-height:0;display:flex;flex-direction:column;background:#07111f}.a3-msg-chat-head{min-height:66px;border-bottom:1px solid #273244;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;background:#0b1220}.a3-msg-chat-head strong{display:block;font-size:16px}.a3-msg-chat-head span{display:block;color:#94a3b8;font-size:12px;margin-top:3px}.a3-msg-head-actions{display:flex;align-items:center;gap:8px}.a3-msg-feed{flex:1;overflow:auto;padding:18px;display:flex;flex-direction:column;gap:10px}.a3-msg-bubble{max-width:min(560px,82%);border:1px solid #273244;border-radius:18px;padding:10px 12px;background:#0b1220}.a3-msg-bubble.mine{align-self:flex-end;border-color:color-mix(in srgb,var(--desktop-accent,#f97316) 56%,#273244);background:color-mix(in srgb,var(--desktop-accent,#f97316) 22%,#0b1220)}.a3-msg-bubble p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.35}.a3-msg-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;color:#94a3b8;font-size:11px}.a3-msg-composer{min-height:66px;border-top:1px solid #273244;display:grid;grid-template-columns:1fr auto;gap:10px;padding:10px 12px;background:#0b1220}.a3-msg-textarea{min-height:44px;max-height:100px;border:1px solid #273244;border-radius:15px;color:#f8fafc;background:#050914;padding:11px 13px;font:inherit;resize:none}.a3-msg-empty{height:100%;display:grid;place-items:center;color:#94a3b8;text-align:center;padding:20px}.a3-msg-empty strong{color:#f8fafc;font-size:18px}.a3-msg-requests-main{height:100%;display:grid;grid-template-rows:auto minmax(0,1fr);background:#07111f}.a3-msg-permission-form{border-bottom:1px solid #273244;padding:14px 16px;background:#0b1220;display:grid;gap:12px}.a3-msg-permission-form h3{margin:0;font-size:17px}.a3-msg-permission-form p{margin:3px 0 0;color:#94a3b8;font-size:12px}.a3-msg-permission-fields{display:grid;grid-template-columns:120px 1fr auto;gap:10px}.a3-msg-request-grid{overflow:auto;padding:16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;align-content:start}.a3-msg-request-actions{display:flex;gap:8px;margin-top:10px}.a3-msg-toast{position:fixed;right:20px;bottom:88px;z-index:4000;border:1px solid #273244;border-radius:16px;padding:12px 14px;color:#f8fafc;background:#0b1220;box-shadow:0 22px 60px rgba(0,0,0,.42)}
  .win-root.theme-light .a3-msg-native-window .win-body,.win-root.theme-light .a3-msg-app,.win-root.theme-light .a3-msg-main,.win-root.theme-light .a3-msg-requests-main{color:#0f172a;background:#f1f5f9!important}.win-root.theme-light .a3-msg-sidebar{border-color:#d7dee8;background:#f8fafc}.win-root.theme-light .a3-msg-chat-head,.win-root.theme-light .a3-msg-composer,.win-root.theme-light .a3-msg-permission-form{color:#0f172a;border-color:#d7dee8;background:#fff}.win-root.theme-light .a3-msg-thread,.win-root.theme-light .a3-msg-request-card,.win-root.theme-light .a3-msg-bubble,.win-root.theme-light .a3-msg-input,.win-root.theme-light .a3-msg-textarea,.win-root.theme-light .a3-msg-button.ghost,.win-root.theme-light .a3-msg-tab{color:#0f172a;border-color:#d7dee8;background:#fff}.win-root.theme-light .a3-msg-thread.active,.win-root.theme-light .a3-msg-thread:hover,.win-root.theme-light .a3-msg-request-card:hover,.win-root.theme-light .a3-msg-tab.active{background:#e2e8f0}.win-root.theme-light .a3-msg-user,.win-root.theme-light .a3-msg-tabs,.win-root.theme-light .a3-msg-compose-top{border-color:#d7dee8}.win-root.theme-light .a3-msg-user span,.win-root.theme-light .a3-msg-thread p,.win-root.theme-light .a3-msg-request-card p,.win-root.theme-light .a3-msg-chat-head span,.win-root.theme-light .a3-msg-meta,.win-root.theme-light .a3-msg-permission-form p{color:#64748b}.win-root.theme-light .a3-msg-empty strong{color:#0f172a}
  @media(max-width:760px){.a3-msg-native-window{position:fixed!important;inset:0 0 70px 0!important;width:100vw!important;height:calc(100svh - 70px)!important;min-height:0!important;border-radius:0!important;border:0!important;transform:none!important;left:0!important;top:0!important;z-index:65!important}.a3-msg-app{grid-template-columns:1fr}.a3-msg-sidebar{display:none}.a3-msg-permission-fields{grid-template-columns:1fr}.a3-msg-permission-form{padding:12px}.a3-msg-request-grid{grid-template-columns:1fr;padding:12px}.a3-msg-feed{padding:12px}.a3-msg-bubble{max-width:92%}}
`;

function htmlEscape(value: unknown) {
  return String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] || ch));
}

function currentUser() {
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
    window.history.pushState({}, '', APP_PATH);
  });
  taskCenter.appendChild(button);
}

function targetForCurrentUser(message: ChatMessage) {
  const me = currentUser();
  const myGroup = Number(me.group || 0);
  return message.from === me.email || message.to === me.email || message.to === `to${myGroup}` || message.to.startsWith('to');
}

function threadOther(threadId: string) {
  const me = currentUser().email;
  const msg = stateMessages.find((item) => item.threadId === threadId);
  if (!msg) return { id: '', name: 'Cuộc trò chuyện' };
  if (msg.from === me) return { id: msg.to, name: msg.toName || msg.to };
  return { id: msg.from, name: msg.fromName || msg.from };
}

function threads() {
  const me = currentUser().email;
  const relevant = stateMessages.filter((msg) => msg.kind === 'chat' && (msg.from === me || msg.to === me));
  const map = new Map<string, ChatMessage[]>();
  relevant.forEach((msg) => map.set(msg.threadId, [...(map.get(msg.threadId) || []), msg]));
  return [...map.entries()].map(([threadId, messages]) => ({ threadId, messages: messages.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)) })).sort((a, b) => Date.parse(b.messages[b.messages.length - 1]?.createdAt || '') - Date.parse(a.messages[a.messages.length - 1]?.createdAt || ''));
}

function permissionRequests() {
  return stateMessages.filter((msg) => msg.kind === 'permission_request' && targetForCurrentUser(msg)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function unreadCount(threadMessages: ChatMessage[]) {
  const me = currentUser().email;
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
  const me = currentUser();
  const allThreads = threads();
  const requests = permissionRequests();
  if (!activeThread && allThreads[0]) activeThread = allThreads[0].threadId;
  const active = allThreads.find((item) => item.threadId === activeThread);
  const other = active ? threadOther(active.threadId) : { id: '', name: 'Chưa chọn cuộc trò chuyện' };
  const activeMessages = active?.messages || [];

  win.innerHTML = `
    <header class="win-titlebar" data-msg-titlebar>
      <div class="title-left"><div class="title-icon a3-message-symbol">${MESSAGE_ICON_SVG}</div><strong>Messages</strong></div>
      <div class="window-actions"><button type="button" title="Thu nhỏ" data-msg-min>–</button><button type="button" title="Phóng to" data-msg-max>↗</button><button class="close" type="button" title="Đóng" data-msg-close>×</button></div>
    </header>
    <div class="win-body settings-mode">
      <div class="a3-msg-app">
        <aside class="a3-msg-sidebar">
          <div class="a3-msg-user"><strong>${htmlEscape(me.name)}</strong><span>${htmlEscape(me.email)} · ${htmlEscape(me.role || '')}${me.group ? ` · Tổ ${htmlEscape(me.group)}` : ''}</span></div>
          <div class="a3-msg-tabs"><button class="a3-msg-tab ${activePanel === 'chats' ? 'active' : ''}" data-panel="chats">Tin nhắn</button><button class="a3-msg-tab ${activePanel === 'requests' ? 'active' : ''}" data-panel="requests">Yêu cầu ${requests.filter((r) => r.permissionStatus === 'pending').length ? `(${requests.filter((r) => r.permissionStatus === 'pending').length})` : ''}</button></div>
          ${activePanel === 'chats' ? renderSidebarChats(allThreads) : renderSidebarRequests(requests)}
        </aside>
        ${activePanel === 'chats' ? renderChatMain(other, activeMessages) : renderRequestsMain(requests)}
      </div>
    </div>`;
}

function renderSidebarChats(allThreads: ReturnType<typeof threads>) {
  return `<div class="a3-msg-compose-top"><input class="a3-msg-input" data-new-to placeholder="Email người nhận..." /><button class="a3-msg-button ghost" data-new-thread>Cuộc trò chuyện mới</button></div><div class="a3-msg-thread-list">${allThreads.length ? allThreads.map((thread) => { const last = thread.messages[thread.messages.length - 1]; const target = threadOther(thread.threadId); const presence = statePresence.find((item) => item.user === target.id); const unread = unreadCount(thread.messages); return `<button class="a3-msg-thread ${thread.threadId === activeThread ? 'active' : ''}" data-thread="${htmlEscape(thread.threadId)}"><div class="a3-msg-thread-top"><strong>${htmlEscape(target.name)}</strong><span class="a3-msg-dot ${presence && isOnline(presence.activeAt) ? 'online' : ''}"></span>${unread ? `<span class="a3-unread">${unread}</span>` : ''}</div><p>${htmlEscape(last?.body || '')}</p></button>`; }).join('') : '<div class="a3-msg-empty">Chưa có cuộc trò chuyện.</div>'}</div>`;
}

function renderSidebarRequests(requests: ChatMessage[]) {
  return `<div class="a3-msg-request-list">${requests.length ? requests.slice(0, 20).map((msg) => `<button class="a3-msg-request-card" data-request-focus="${htmlEscape(msg.id)}"><div class="a3-msg-request-top"><strong>Tổ ${htmlEscape(msg.requesterGroup || '?')} → Tổ ${htmlEscape(msg.targetGroup || '?')}</strong><span class="a3-status-pill ${htmlEscape(msg.permissionStatus || 'pending')}">${htmlEscape(msg.permissionStatus || 'pending')}</span></div><p>${htmlEscape(msg.body)}</p></button>`).join('') : '<div class="a3-msg-empty">Chưa có yêu cầu quyền.</div>'}</div>`;
}

function renderChatMain(other: { id: string; name: string }, activeMessages: ChatMessage[]) {
  return `<main class="a3-msg-main"><div class="a3-msg-chat-head"><div><strong>${htmlEscape(other.name)}</strong><span>${htmlEscape(other.id ? onlineLine(other.id) : 'Tạo cuộc trò chuyện mới ở bên trái')}</span></div><div class="a3-msg-head-actions"><button class="a3-msg-button ghost" data-panel="requests">Yêu cầu quyền</button><button class="a3-msg-button ghost" data-refresh>Đồng bộ</button></div></div><div class="a3-msg-feed">${activeMessages.length ? activeMessages.map((msg) => renderChatMessage(msg)).join('') : '<div class="a3-msg-empty"><div><strong>Messages 12A3</strong><br/>Chọn hoặc tạo cuộc trò chuyện để bắt đầu.</div></div>'}</div><div class="a3-msg-composer"><textarea class="a3-msg-textarea" data-body placeholder="Nhập tin nhắn..."></textarea><button class="a3-msg-button" data-send>Gửi</button></div></main>`;
}

function renderRequestsMain(requests: ChatMessage[]) {
  return `<main class="a3-msg-requests-main"><section class="a3-msg-permission-form"><div><h3>Xin quyền hỗ trợ chấm điểm</h3><p>Dùng khi tổ khác cần hỗ trợ. Người nhận có thể đồng ý hoặc từ chối trong Messages.</p></div><div class="a3-msg-permission-fields"><input class="a3-msg-input" data-perm-group placeholder="Tổ cần xin, VD: 2" /><input class="a3-msg-input" data-perm-reason placeholder="Lý do xin quyền hỗ trợ chấm" /><button class="a3-msg-button" data-perm-send>Gửi yêu cầu</button></div></section><section class="a3-msg-request-grid">${requests.length ? requests.map(renderRequestCard).join('') : '<div class="a3-msg-empty"><div><strong>Chưa có yêu cầu quyền</strong><br/>Các yêu cầu xin hỗ trợ chấm tổ khác sẽ nằm ở đây.</div></div>'}</section></main>`;
}

function renderRequestCard(msg: ChatMessage) {
  const me = currentUser();
  const mine = msg.from === me.email;
  const myGroup = Number(me.group || 0);
  const canResolve = !mine && msg.permissionStatus === 'pending' && (!msg.targetGroup || msg.targetGroup === myGroup || ['lop_truong', 'gvcn'].includes(String(me.role || '')));
  const time = new Date(msg.createdAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  return `<article class="a3-msg-request-card"><div class="a3-msg-request-top"><strong>${htmlEscape(msg.fromName)} xin chấm Tổ ${htmlEscape(msg.targetGroup || '')}</strong><span class="a3-status-pill ${htmlEscape(msg.permissionStatus || 'pending')}">${htmlEscape(msg.permissionStatus || 'pending')}</span></div><p>${htmlEscape(msg.body)}</p><div class="a3-msg-meta"><span>Từ Tổ ${htmlEscape(msg.requesterGroup || '?')}</span><span>${time}</span>${msg.week ? `<span>Tuần ${htmlEscape(msg.week)}</span>` : ''}</div>${canResolve ? `<div class="a3-msg-request-actions"><button class="a3-msg-button" data-approve="${htmlEscape(msg.id)}">Đồng ý</button><button class="a3-msg-button danger" data-reject="${htmlEscape(msg.id)}">Từ chối</button></div>` : ''}</article>`;
}

function renderChatMessage(msg: ChatMessage) {
  const me = currentUser().email;
  const mine = msg.from === me;
  const time = new Date(msg.createdAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
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
  zIndex += 1;
  let win = document.getElementById(WINDOW_ID);
  if (!win) {
    win = document.createElement('section');
    win.id = WINDOW_ID;
    win.className = 'win-window a3-msg-native-window focused';
    win.style.setProperty('--win-x', '0px');
    win.style.setProperty('--win-y', '0px');
    const desktop = document.querySelector('.win-desktop') || document.body;
    desktop.appendChild(win);
    win.addEventListener('click', handleClick);
    win.addEventListener('keydown', handleKeydown);
    win.addEventListener('mousedown', () => { zIndex += 1; win!.style.zIndex = String(zIndex); });
  }
  win.style.zIndex = String(zIndex);
  win.classList.remove('minimized');
  window.history.pushState({}, '', APP_PATH);
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
    window.history.pushState({}, '', '/desktop');
    ensureTaskButton();
    return;
  }
  if (target.closest('[data-msg-min]')) {
    minimized = true;
    document.getElementById(WINDOW_ID)?.classList.add('minimized');
    window.history.pushState({}, '', '/desktop');
    return;
  }
  if (target.closest('[data-msg-max]')) {
    document.getElementById(WINDOW_ID)?.classList.toggle('maximized');
    return;
  }
  const panel = target.closest<HTMLElement>('[data-panel]');
  if (panel?.dataset.panel === 'chats' || panel?.dataset.panel === 'requests') {
    activePanel = panel.dataset.panel;
    renderWindow();
    return;
  }
  const threadButton = target.closest<HTMLElement>('[data-thread]');
  if (threadButton) {
    activePanel = 'chats';
    activeThread = threadButton.dataset.thread || '';
    await markThreadRead(activeThread);
    await syncMessages();
    return;
  }
  if (target.closest('[data-new-thread]')) {
    const input = document.querySelector<HTMLInputElement>('#a3k64-messages-window [data-new-to]');
    const to = input?.value.trim().toLowerCase() || '';
    if (!to) return toast('Nhập email người nhận để tạo cuộc trò chuyện.');
    activePanel = 'chats';
    activeThread = [currentUser().email, to].sort().join('__');
    await sendChatMessage(to, 'Đã tạo cuộc trò chuyện.', to);
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
    activePanel = 'requests';
    await syncMessages();
    return;
  }
  const approve = target.closest<HTMLElement>('[data-approve]');
  const reject = target.closest<HTMLElement>('[data-reject]');
  if (approve || reject) {
    await respondGroupAccess((approve || reject)?.dataset.approve || (approve || reject)?.dataset.reject || '', approve ? 'approved' : 'rejected');
    activePanel = 'requests';
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
  if (window.location.pathname === APP_PATH) window.setTimeout(openMessagesWindow, 100);
}

const observer = new MutationObserver(() => boot());
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('load', boot);
window.addEventListener('popstate', () => {
  if (window.location.pathname === APP_PATH) openMessagesWindow();
});
window.addEventListener('a3k64-messages-local-change', () => {
  if (!open || minimized) return;
  stateMessages = JSON.parse(localStorage.getItem('a3k64-messages-local-v1') || '[]');
  renderWindow();
});
boot();

export {};

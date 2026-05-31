import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Mail,
  MailOpen,
  MessageCircle,
  MoreHorizontal,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import {
  ChatContact,
  ChatMessage,
  fetchMessageContacts,
  fetchMessagesState,
  filterContacts,
  hideMessageThread,
  isOnline,
  markThreadRead,
  markThreadUnread,
  readSessionUser,
  requestGroupAccess,
  resolveContactTarget,
  respondGroupAccess,
  sendChatMessage,
  updatePresence,
} from '../../lib/messagesApi';
import './MessagesApp.css';

type Panel = 'chats' | 'requests';

type Props = {
  userEmail?: string | null;
  userName?: string | null;
  userRole?: string | null;
  userGroup?: string | number | null;
};

function fmt(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time)
    ? new Date(time).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
    : '';
}

function normalizeText(value: unknown) {
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

function isEmail(value?: string) {
  return Boolean(String(value || '').includes('@'));
}

function emailAlias(value?: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.includes('@') ? raw.split('@')[0] : raw;
}

function initials(name: string) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function MessagesApp({ userEmail, userName, userRole, userGroup }: Props) {
  const sessionUser = readSessionUser();
  const me = {
    ...sessionUser,
    email: String(userEmail || sessionUser.email).trim().toLowerCase(),
    name: userName || sessionUser.name,
    role: userRole || sessionUser.role,
    group: userGroup ?? sessionUser.group,
  };

  const [panel, setPanel] = useState<Panel>('chats');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [presence, setPresence] = useState<{ user: string; name: string; activeAt: string }[]>([]);
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [activeThread, setActiveThread] = useState('');
  const [query, setQuery] = useState('');
  const [newTo, setNewTo] = useState('');
  const [draft, setDraft] = useState('');
  const [targetGroup, setTargetGroup] = useState('');
  const [reason, setReason] = useState('');
  const [toast, setToast] = useState('');
  const [menuThreadId, setMenuThreadId] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2600);
  };

  const sync = async () => {
    const state = await fetchMessagesState(me);
    setMessages(state.messages || []);
    setPresence(state.presence || []);
    if (state.contacts?.length) setContacts(state.contacts);
  };

  useEffect(() => {
    void sync();
    void updatePresence(me);
    void fetchMessageContacts(me).then(setContacts).catch(() => undefined);
    const poll = window.setInterval(sync, 5000);
    const pulse = window.setInterval(() => void updatePresence(me), 30000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(pulse);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.email]);

  useEffect(() => {
    const close = () => setMenuThreadId('');
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const allContacts = useMemo(() => {
    const map = new Map<string, ChatContact>();
    map.set(me.email, { email: me.email, name: me.name || emailAlias(me.email), role: me.role, group: me.group });
    messages.forEach((m) => {
      if (m.kind !== 'chat' && m.kind !== 'message') return;
      if (m.from) map.set(m.from, { email: m.from, name: m.fromName || emailAlias(m.from) });
      if (m.to && !m.to.startsWith('to')) map.set(m.to, { email: m.to, name: m.toName || emailAlias(m.to) });
    });
    contacts.forEach((contact) => {
      if (contact.email) map.set(contact.email, contact);
    });
    return [...map.values()];
  }, [contacts, me.email, me.group, me.name, me.role, messages]);

  const nameByEmail = useMemo(() => {
    const map = new Map<string, string>();
    allContacts.forEach((contact) => {
      if (contact.email && contact.name && !isEmail(contact.name)) map.set(contact.email, contact.name);
    });
    map.set(me.email, me.name || emailAlias(me.email));
    messages.forEach((m) => {
      if (m.from && m.fromName && !isEmail(m.fromName)) map.set(m.from, m.fromName);
      if (m.to && m.toName && !isEmail(m.toName)) map.set(m.to, m.toName);
    });
    return map;
  }, [allContacts, me.email, me.name, messages]);

  const displayNameFor = (email: string, fallback?: string) => {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanFallback = String(fallback || '').trim();
    if (cleanEmail === me.email) return me.name || emailAlias(cleanEmail);
    const mapped = nameByEmail.get(cleanEmail);
    if (mapped && !isEmail(mapped)) return mapped;
    if (cleanFallback && !isEmail(cleanFallback)) return cleanFallback;
    return emailAlias(cleanEmail || cleanFallback);
  };

  const threads = useMemo(() => {
    const map = new Map<string, ChatMessage[]>();
    messages
      .filter((m) => (m.kind === 'chat' || m.kind === 'message') && (m.from === me.email || m.to === me.email))
      .forEach((m) => map.set(m.threadId, [...(map.get(m.threadId) || []), m]));

    const list = [...map.entries()]
      .map(([threadId, items]) => ({
        threadId,
        messages: items.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
      }))
      .sort((a, b) => Date.parse(b.messages.at(-1)?.createdAt || '') - Date.parse(a.messages.at(-1)?.createdAt || ''));

    const q = normalizeText(query);
    if (!q) return list;
    return list.filter((thread) => {
      const last = thread.messages[thread.messages.length - 1];
      const otherEmail = last.from === me.email ? last.to : last.from;
      const otherName = last.from === me.email ? displayNameFor(last.to, last.toName) : displayNameFor(last.from, last.fromName);
      return `${normalizeText(otherName)} ${normalizeText(otherEmail)} ${normalizeText(last.body)}`.includes(q);
    });
  }, [messages, me.email, query, nameByEmail]);

  const requests = useMemo(() => {
    const myGroup = Number(me.group || 0);
    return messages
      .filter((m) => m.kind === 'permission_request' && (m.from === me.email || m.to === me.email || m.to === `to${myGroup}` || ['lop_truong', 'gvcn'].includes(String(me.role || ''))))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [messages, me.email, me.group, me.role]);

  useEffect(() => {
    if (!activeThread && threads[0]) setActiveThread(threads[0].threadId);
    if (activeThread && !threads.some((t) => t.threadId === activeThread) && threads[0]) setActiveThread(threads[0].threadId);
  }, [activeThread, threads]);

  const active = threads.find((t) => t.threadId === activeThread);
  const activeMessages = active?.messages || [];
  const first = activeMessages[0];
  const other = first
    ? first.from === me.email
      ? { id: first.to, name: displayNameFor(first.to, first.toName) }
      : { id: first.from, name: displayNameFor(first.from, first.fromName) }
    : { id: '', name: 'Chưa chọn cuộc trò chuyện' };
  const otherPresence = presence.find((p) => p.user === other.id);
  const pendingCount = requests.filter((r) => r.permissionStatus === 'pending').length;
  const contactSuggestions = useMemo(() => filterContacts(newTo, allContacts, me.email), [newTo, allContacts, me.email]);

  const createThread = async () => {
    const latest = await fetchMessageContacts(me).catch(() => [] as ChatContact[]);
    if (latest.length) setContacts(latest);
    const target = resolveContactTarget(newTo, latest.length ? [...latest, ...allContacts] : allContacts);
    if (!target) return showToast('Nhập tên hoặc Gmail người nhận.');
    await sendChatMessage(target.email, 'Đã tạo cuộc trò chuyện.', target.name, me);
    setActiveThread([me.email, target.email].sort().join('__'));
    setNewTo('');
    setPanel('chats');
    await sync();
  };

  const openThread = async (threadId: string) => {
    setPanel('chats');
    setActiveThread(threadId);
    setMenuThreadId('');
    await markThreadRead(threadId, me);
    await sync();
  };

  const sendNow = async () => {
    const body = draft.trim();
    if (!body) return;
    if (!other.id) return showToast('Chưa chọn người nhận.');
    await sendChatMessage(other.id, body, other.name, me);
    setDraft('');
    await sync();
  };

  const markRead = async (threadId: string) => {
    setMenuThreadId('');
    await markThreadRead(threadId, me);
    await sync();
  };

  const markUnread = async (threadId: string) => {
    setMenuThreadId('');
    await markThreadUnread(threadId, me);
    await sync();
  };

  const deleteThread = async (threadId: string) => {
    setMenuThreadId('');
    await hideMessageThread(threadId, me);
    if (activeThread === threadId) setActiveThread('');
    await sync();
  };

  const sendRequest = async () => {
    const group = Number(targetGroup);
    if (![1, 2, 3, 4].includes(group)) return showToast('Nhập tổ cần xin quyền từ 1 đến 4.');
    await requestGroupAccess(group, reason, undefined, me);
    setTargetGroup('');
    setReason('');
    setPanel('requests');
    await sync();
  };

  const respond = async (id: string, status: 'approved' | 'rejected') => {
    await respondGroupAccess(id, status, me);
    await sync();
  };

  return (
    <section className="messages-native-app messages-redesign">
      <aside className="messages-left-panel">
        <header className="messages-profile-card">
          <div className="messages-profile-avatar"><MessageCircle size={23} /></div>
          <div>
            <strong>{me.name}</strong>
            <span>{me.role || 'hoc_sinh'}{me.group ? ` · Tổ ${me.group}` : ''}</span>
          </div>
          <button type="button" onClick={() => void sync()} title="Đồng bộ"><RefreshCw size={17} /></button>
        </header>

        <div className="messages-segment">
          <button type="button" className={panel === 'chats' ? 'active' : ''} onClick={() => setPanel('chats')}>Tin nhắn</button>
          <button type="button" className={panel === 'requests' ? 'active' : ''} onClick={() => setPanel('requests')}>Yêu cầu{pendingCount ? ` ${pendingCount}` : ''}</button>
        </div>

        {panel === 'chats' ? (
          <>
            <div className="messages-search-box"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm cuộc trò chuyện" /></div>
            <div className="messages-new-box">
              <div className="messages-contact-box">
                <input
                  value={newTo}
                  onChange={(e) => setNewTo(e.target.value)}
                  placeholder="Nhập tên hoặc Gmail"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void createThread();
                    }
                  }}
                />
                {newTo && contactSuggestions.length > 0 && (
                  <div className="messages-contact-suggestions">
                    {contactSuggestions.map((contact) => (
                      <button key={contact.email} type="button" onClick={() => setNewTo(contact.name)}>
                        <strong>{displayNameFor(contact.email, contact.name)}</strong>
                        <span>{contact.group ? `Tổ ${contact.group}` : contact.role || 'Tài khoản'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" onClick={createThread}>Tạo chat</button>
            </div>

            <div className="messages-thread-list">
              {threads.length ? threads.map((thread) => {
                const last = thread.messages[thread.messages.length - 1];
                const target = last.from === me.email
                  ? { id: last.to, name: displayNameFor(last.to, last.toName) }
                  : { id: last.from, name: displayNameFor(last.from, last.fromName) };
                const targetPresence = presence.find((p) => p.user === target.id);
                const unread = thread.messages.filter((m) => m.to === me.email && m.status !== 'read').length;
                return (
                  <article key={thread.threadId} className={`messages-thread-card ${thread.threadId === activeThread ? 'active' : ''}`}>
                    <button type="button" className="messages-thread-main" onClick={() => void openThread(thread.threadId)}>
                      <div className="messages-thread-avatar">{initials(target.name)}</div>
                      <div className="messages-thread-info">
                        <strong>{target.name}</strong>
                        <p>{last.body}</p>
                      </div>
                      <div className="messages-thread-meta">
                        <span className={`messages-dot ${targetPresence && isOnline(targetPresence.activeAt) ? 'online' : ''}`} />
                        {unread > 0 && <b>{unread}</b>}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="messages-more-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setMenuThreadId(menuThreadId === thread.threadId ? '' : thread.threadId);
                      }}
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    {menuThreadId === thread.threadId && (
                      <div className="messages-thread-menu" onClick={(event) => event.stopPropagation()}>
                        <button type="button" onClick={() => void markRead(thread.threadId)}><MailOpen size={15} /> Đánh dấu đã đọc</button>
                        <button type="button" onClick={() => void markUnread(thread.threadId)}><Mail size={15} /> Đánh dấu chưa đọc</button>
                        <button type="button" className="danger" onClick={() => void deleteThread(thread.threadId)}><Trash2 size={15} /> Xoá khỏi danh sách</button>
                      </div>
                    )}
                  </article>
                );
              }) : <div className="messages-empty-state">Chưa có cuộc trò chuyện.</div>}
            </div>
          </>
        ) : (
          <div className="messages-request-list">
            {requests.length ? requests.map((request) => (
              <button key={request.id} type="button" className="messages-request-row">
                <strong>Tổ {request.requesterGroup || '?'} → Tổ {request.targetGroup || '?'}</strong>
                <span className={request.permissionStatus || 'pending'}>{request.permissionStatus || 'pending'}</span>
                <p>{request.body}</p>
              </button>
            )) : <div className="messages-empty-state">Chưa có yêu cầu quyền.</div>}
          </div>
        )}
      </aside>

      {panel === 'chats' ? (
        <main className="messages-main-panel">
          <header className="messages-chat-header">
            <div className="messages-chat-title">
              <div className="messages-large-avatar">{other.id ? initials(other.name) : <UserRound size={22} />}</div>
              <div>
                <strong>{other.name}</strong>
                <span>{other.id ? (otherPresence && isOnline(otherPresence.activeAt) ? 'Đang hoạt động' : 'Hoạt động gần đây') : 'Tạo hoặc chọn cuộc trò chuyện'}</span>
              </div>
            </div>
            <button type="button" onClick={() => setPanel('requests')}><ShieldCheck size={16} /> Yêu cầu quyền</button>
          </header>

          <div className="messages-feed">
            {activeMessages.length ? activeMessages.map((m) => (
              <article key={m.id} className={`messages-bubble ${m.from === me.email ? 'mine' : ''}`}>
                <p>{m.body}</p>
                <span>{displayNameFor(m.from, m.fromName)} · {fmt(m.createdAt)}{m.from === me.email ? ` · ${m.status === 'read' ? 'Đã đọc' : 'Đã gửi'}` : ''}</span>
              </article>
            )) : <div className="messages-center-empty"><strong>Messages 12A3</strong><span>Chọn hoặc tạo cuộc trò chuyện để bắt đầu.</span></div>}
          </div>

          <footer className="messages-composer">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Nhập tin nhắn..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendNow();
                }
              }}
            />
            <button type="button" onClick={sendNow}><Send size={17} /> Gửi</button>
          </footer>
        </main>
      ) : (
        <main className="messages-main-panel messages-permission-panel">
          <section className="messages-permission-form">
            <div>
              <h2>Xin quyền hỗ trợ chấm điểm</h2>
              <p>Dùng khi tổ khác cần hỗ trợ. Người nhận có thể đồng ý hoặc từ chối trong Messages.</p>
            </div>
            <div className="messages-request-fields">
              <input value={targetGroup} onChange={(e) => setTargetGroup(e.target.value)} placeholder="Tổ cần xin, VD: 2" />
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do xin quyền hỗ trợ chấm" />
              <button type="button" onClick={sendRequest}>Gửi yêu cầu</button>
            </div>
          </section>

          <section className="messages-request-grid">
            {requests.length ? requests.map((r) => {
              const mine = r.from === me.email;
              const myGroup = Number(me.group || 0);
              const canResolve = !mine && r.permissionStatus === 'pending' && (!r.targetGroup || r.targetGroup === myGroup || ['lop_truong', 'gvcn'].includes(String(me.role || '')));
              return (
                <article key={r.id} className="messages-request-card">
                  <header>
                    <strong>{displayNameFor(r.from, r.fromName)} xin chấm Tổ {r.targetGroup}</strong>
                    <span className={r.permissionStatus || 'pending'}>{r.permissionStatus || 'pending'}</span>
                  </header>
                  <p>{r.body}</p>
                  <small>Từ Tổ {r.requesterGroup || '?'} · {fmt(r.createdAt)}</small>
                  {canResolve && (
                    <div>
                      <button type="button" onClick={() => void respond(r.id, 'approved')}><Check size={16} /> Đồng ý</button>
                      <button type="button" className="danger" onClick={() => void respond(r.id, 'rejected')}><X size={16} /> Từ chối</button>
                    </div>
                  )}
                </article>
              );
            }) : <div className="messages-center-empty"><strong>Chưa có yêu cầu quyền</strong><span>Các yêu cầu xin hỗ trợ chấm tổ khác sẽ nằm ở đây.</span></div>}
          </section>
        </main>
      )}

      {toast && <div className="messages-toast">{toast}</div>}
    </section>
  );
}

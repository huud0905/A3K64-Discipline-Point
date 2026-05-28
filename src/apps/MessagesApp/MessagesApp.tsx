import React, { useEffect, useMemo, useState } from 'react';
import { Check, MessageCircle, RefreshCw, Send, ShieldCheck, X } from 'lucide-react';
import {
  ChatContact,
  ChatMessage,
  fetchMessageContacts,
  fetchMessagesState,
  filterContacts,
  isOnline,
  markThreadRead,
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
  return Number.isFinite(time) ? new Date(time).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '';
}

function isEmail(value?: string) {
  return Boolean(String(value || '').includes('@'));
}

function emailAlias(value?: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.includes('@') ? raw.split('@')[0] : raw;
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
  const [newTo, setNewTo] = useState('');
  const [draft, setDraft] = useState('');
  const [targetGroup, setTargetGroup] = useState('');
  const [reason, setReason] = useState('');
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2400);
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
    return () => { window.clearInterval(poll); window.clearInterval(pulse); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.email]);

  const threadContacts = useMemo(() => {
    const map = new Map<string, ChatContact>();
    messages.forEach((m) => {
      if (m.kind !== 'chat') return;
      if (m.from && m.from !== me.email) map.set(m.from, { email: m.from, name: m.fromName || emailAlias(m.from) });
      if (m.to && m.to !== me.email && !m.to.startsWith('to')) map.set(m.to, { email: m.to, name: m.toName || emailAlias(m.to) });
    });
    contacts.forEach((contact) => map.set(contact.email, contact));
    return [...map.values()].filter((contact) => contact.email !== me.email);
  }, [contacts, messages, me.email]);

  const contactNameByEmail = useMemo(() => {
    const map = new Map<string, string>();
    threadContacts.forEach((contact) => {
      if (contact.email && contact.name && !isEmail(contact.name)) map.set(contact.email, contact.name);
    });
    map.set(me.email, me.name || emailAlias(me.email));
    messages.forEach((message) => {
      if (message.from && message.fromName && !isEmail(message.fromName)) map.set(message.from, message.fromName);
      if (message.to && message.toName && !isEmail(message.toName)) map.set(message.to, message.toName);
    });
    return map;
  }, [me.email, me.name, messages, threadContacts]);

  const displayNameFor = (email: string, fallback?: string) => {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanFallback = String(fallback || '').trim();
    if (cleanEmail === me.email) return me.name || emailAlias(cleanEmail);
    const mapped = contactNameByEmail.get(cleanEmail);
    if (mapped && !isEmail(mapped)) return mapped;
    if (cleanFallback && !isEmail(cleanFallback)) return cleanFallback;
    return emailAlias(cleanEmail || cleanFallback);
  };

  const contactSuggestions = useMemo(() => filterContacts(newTo, threadContacts, me.email), [newTo, threadContacts, me.email]);

  const threads = useMemo(() => {
    const map = new Map<string, ChatMessage[]>();
    messages.filter((m) => m.kind === 'chat' && (m.from === me.email || m.to === me.email)).forEach((m) => map.set(m.threadId, [...(map.get(m.threadId) || []), m]));
    return [...map.entries()].map(([threadId, items]) => ({ threadId, messages: items.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)) })).sort((a, b) => Date.parse(b.messages.at(-1)?.createdAt || '') - Date.parse(a.messages.at(-1)?.createdAt || ''));
  }, [messages, me.email]);

  const requests = useMemo(() => {
    const myGroup = Number(me.group || 0);
    return messages.filter((m) => m.kind === 'permission_request' && (m.from === me.email || m.to === me.email || m.to === `to${myGroup}` || ['lop_truong', 'gvcn'].includes(String(me.role || '')))).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [messages, me.email, me.group, me.role]);

  useEffect(() => { if (!activeThread && threads[0]) setActiveThread(threads[0].threadId); }, [activeThread, threads]);

  const active = threads.find((t) => t.threadId === activeThread);
  const activeMessages = active?.messages || [];
  const first = activeMessages[0];
  const other = first ? (first.from === me.email ? { id: first.to, name: displayNameFor(first.to, first.toName) } : { id: first.from, name: displayNameFor(first.from, first.fromName) }) : { id: '', name: 'Chưa chọn cuộc trò chuyện' };
  const otherPresence = presence.find((p) => p.user === other.id);
  const pendingCount = requests.filter((r) => r.permissionStatus === 'pending').length;

  const selectContact = (contact: ChatContact) => {
    setNewTo(contact.name);
  };

  const createThread = async () => {
    const target = resolveContactTarget(newTo, threadContacts);
    if (!target) return showToast('Nhập tên người nhận hoặc chọn từ gợi ý.');
    await sendChatMessage(target.email, 'Đã tạo cuộc trò chuyện.', target.name, me);
    setActiveThread([me.email, target.email].sort().join('__'));
    setNewTo('');
    setPanel('chats');
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

  const openThread = async (threadId: string) => {
    setPanel('chats');
    setActiveThread(threadId);
    await markThreadRead(threadId, me);
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

  return <section className="messages-native-app">
    <aside className="messages-sidebar">
      <div className="messages-user-card"><div className="messages-avatar"><MessageCircle size={22} /></div><div><strong>{me.name}</strong><span>{me.email} · {me.role || 'hoc_sinh'}{me.group ? ` · Tổ ${me.group}` : ''}</span></div></div>
      <div className="messages-tabs"><button type="button" className={panel === 'chats' ? 'active' : ''} onClick={() => setPanel('chats')}>Tin nhắn</button><button type="button" className={panel === 'requests' ? 'active' : ''} onClick={() => setPanel('requests')}>Yêu cầu{pendingCount ? ` (${pendingCount})` : ''}</button></div>
      {panel === 'chats' ? <><div className="messages-new-thread"><div className="messages-contact-box"><input value={newTo} onChange={(e) => setNewTo(e.target.value)} placeholder="Nhập tên người nhận..." onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void createThread(); } }} />{newTo && contactSuggestions.length > 0 && <div className="messages-contact-suggestions">{contactSuggestions.map((contact) => <button key={contact.email} type="button" onClick={() => selectContact(contact)}><strong>{contact.name}</strong><span>{contact.email}{contact.group ? ` · Tổ ${contact.group}` : ''}</span></button>)}</div>}</div><button type="button" onClick={createThread}>Cuộc trò chuyện mới</button></div><div className="messages-list">{threads.length ? threads.map((thread) => {
        const last = thread.messages[thread.messages.length - 1];
        const target = last.from === me.email ? { id: last.to, name: displayNameFor(last.to, last.toName) } : { id: last.from, name: displayNameFor(last.from, last.fromName) };
        const targetPresence = presence.find((p) => p.user === target.id);
        const unread = thread.messages.filter((m) => m.to === me.email && m.status !== 'read').length;
        return <button key={thread.threadId} type="button" className={`messages-thread ${thread.threadId === activeThread ? 'active' : ''}`} onClick={() => void openThread(thread.threadId)}><div><strong>{target.name}</strong>{unread > 0 && <b>{unread}</b>}<span className={`messages-dot ${targetPresence && isOnline(targetPresence.activeAt) ? 'online' : ''}`} /></div><p>{last.body}</p></button>;
      }) : <div className="messages-empty">Chưa có cuộc trò chuyện.</div>}</div></> : <div className="messages-list">{requests.length ? requests.map((request) => <button key={request.id} type="button" className="messages-request-mini"><div><strong>Tổ {request.requesterGroup || '?'} → Tổ {request.targetGroup || '?'}</strong><span className={request.permissionStatus || 'pending'}>{request.permissionStatus || 'pending'}</span></div><p>{request.body}</p></button>) : <div className="messages-empty">Chưa có yêu cầu quyền.</div>}</div>}
    </aside>

    {panel === 'chats' ? <main className="messages-chat-main"><header className="messages-main-head"><div><strong>{other.name}</strong><span>{other.id ? (otherPresence && isOnline(otherPresence.activeAt) ? 'Đang hoạt động' : 'Hoạt động gần đây') : 'Tạo hoặc chọn cuộc trò chuyện'}</span></div><div><button type="button" className="messages-soft" onClick={() => setPanel('requests')}><ShieldCheck size={16} /> Yêu cầu quyền</button><button type="button" className="messages-soft" onClick={() => void sync()}><RefreshCw size={16} /> Đồng bộ</button></div></header><div className="messages-feed">{activeMessages.length ? activeMessages.map((m) => <article key={m.id} className={`messages-bubble ${m.from === me.email ? 'mine' : ''}`}><p>{m.body}</p><span>{displayNameFor(m.from, m.fromName)} · {fmt(m.createdAt)}{m.from === me.email ? ` · ${m.status === 'read' ? 'Đã đọc' : 'Đã gửi'}` : ''}</span></article>) : <div className="messages-center-empty"><strong>Messages 12A3</strong><span>Chọn hoặc tạo cuộc trò chuyện để bắt đầu.</span></div>}</div><footer className="messages-composer"><textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Nhập tin nhắn..." onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendNow(); } }} /><button type="button" onClick={sendNow}><Send size={17} /> Gửi</button></footer></main> : <main className="messages-requests-main"><section className="messages-request-form"><div><h2>Xin quyền hỗ trợ chấm điểm</h2><p>Dùng khi tổ khác cần hỗ trợ. Người nhận có thể đồng ý hoặc từ chối trong Messages.</p></div><div className="messages-request-fields"><input value={targetGroup} onChange={(e) => setTargetGroup(e.target.value)} placeholder="Tổ cần xin, VD: 2" /><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do xin quyền hỗ trợ chấm" /><button type="button" onClick={sendRequest}>Gửi yêu cầu</button></div></section><section className="messages-request-grid">{requests.length ? requests.map((r) => { const mine = r.from === me.email; const myGroup = Number(me.group || 0); const canResolve = !mine && r.permissionStatus === 'pending' && (!r.targetGroup || r.targetGroup === myGroup || ['lop_truong', 'gvcn'].includes(String(me.role || ''))); return <article key={r.id} className="messages-request-card"><header><strong>{displayNameFor(r.from, r.fromName)} xin chấm Tổ {r.targetGroup}</strong><span className={r.permissionStatus || 'pending'}>{r.permissionStatus || 'pending'}</span></header><p>{r.body}</p><small>Từ Tổ {r.requesterGroup || '?'} · {fmt(r.createdAt)}</small>{canResolve && <div><button type="button" onClick={() => void respond(r.id, 'approved')}><Check size={16} /> Đồng ý</button><button type="button" className="danger" onClick={() => void respond(r.id, 'rejected')}><X size={16} /> Từ chối</button></div>}</article>; }) : <div className="messages-center-empty"><strong>Chưa có yêu cầu quyền</strong><span>Các yêu cầu xin hỗ trợ chấm tổ khác sẽ nằm ở đây.</span></div>}</section></main>}
    {toast && <div className="messages-toast">{toast}</div>}
  </section>;
}

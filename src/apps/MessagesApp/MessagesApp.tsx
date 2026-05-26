import React, { useEffect, useMemo, useState } from 'react';
import { Check, MessageCircle, RefreshCw, Send, ShieldCheck, X } from 'lucide-react';
import { ChatMessage, fetchMessagesState, isOnline, markThreadRead, readSessionUser, requestGroupAccess, respondGroupAccess, sendChatMessage, updatePresence } from '../../lib/messagesApi';
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
  };

  useEffect(() => {
    void sync();
    void updatePresence(me);
    const poll = window.setInterval(sync, 5000);
    const pulse = window.setInterval(() => void updatePresence(me), 30000);
    return () => { window.clearInterval(poll); window.clearInterval(pulse); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.email]);

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
  const other = first ? (first.from === me.email ? { id: first.to, name: first.toName || first.to } : { id: first.from, name: first.fromName || first.from }) : { id: '', name: 'Chưa chọn cuộc trò chuyện' };
  const otherPresence = presence.find((p) => p.user === other.id);
  const pendingCount = requests.filter((r) => r.permissionStatus === 'pending').length;

  const createThread = async () => {
    const to = newTo.trim().toLowerCase();
    if (!to) return showToast('Nhập email người nhận trước.');
    await sendChatMessage(to, 'Đã tạo cuộc trò chuyện.', to, me);
    setActiveThread([me.email, to].sort().join('__'));
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
      {panel === 'chats' ? <><div className="messages-new-thread"><input value={newTo} onChange={(e) => setNewTo(e.target.value)} placeholder="Email người nhận..." /><button type="button" onClick={createThread}>Cuộc trò chuyện mới</button></div><div className="messages-list">{threads.length ? threads.map((thread) => {
        const last = thread.messages[thread.messages.length - 1];
        const target = last.from === me.email ? { id: last.to, name: last.toName || last.to } : { id: last.from, name: last.fromName || last.from };
        const targetPresence = presence.find((p) => p.user === target.id);
        const unread = thread.messages.filter((m) => m.to === me.email && m.status !== 'read').length;
        return <button key={thread.threadId} type="button" className={`messages-thread ${thread.threadId === activeThread ? 'active' : ''}`} onClick={() => void openThread(thread.threadId)}><div><strong>{target.name}</strong>{unread > 0 && <b>{unread}</b>}<span className={`messages-dot ${targetPresence && isOnline(targetPresence.activeAt) ? 'online' : ''}`} /></div><p>{last.body}</p></button>;
      }) : <div className="messages-empty">Chưa có cuộc trò chuyện.</div>}</div></> : <div className="messages-list">{requests.length ? requests.map((request) => <button key={request.id} type="button" className="messages-request-mini"><div><strong>Tổ {request.requesterGroup || '?'} → Tổ {request.targetGroup || '?'}</strong><span className={request.permissionStatus || 'pending'}>{request.permissionStatus || 'pending'}</span></div><p>{request.body}</p></button>) : <div className="messages-empty">Chưa có yêu cầu quyền.</div>}</div>}
    </aside>

    {panel === 'chats' ? <main className="messages-chat-main"><header className="messages-main-head"><div><strong>{other.name}</strong><span>{other.id ? (otherPresence && isOnline(otherPresence.activeAt) ? 'Đang hoạt động' : 'Hoạt động gần đây') : 'Tạo hoặc chọn cuộc trò chuyện'}</span></div><div><button type="button" className="messages-soft" onClick={() => setPanel('requests')}><ShieldCheck size={16} /> Yêu cầu quyền</button><button type="button" className="messages-soft" onClick={() => void sync()}><RefreshCw size={16} /> Đồng bộ</button></div></header><div className="messages-feed">{activeMessages.length ? activeMessages.map((m) => <article key={m.id} className={`messages-bubble ${m.from === me.email ? 'mine' : ''}`}><p>{m.body}</p><span>{m.fromName} · {fmt(m.createdAt)}{m.from === me.email ? ` · ${m.status === 'read' ? 'Đã đọc' : 'Đã gửi'}` : ''}</span></article>) : <div className="messages-center-empty"><strong>Messages 12A3</strong><span>Chọn hoặc tạo cuộc trò chuyện để bắt đầu.</span></div>}</div><footer className="messages-composer"><textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Nhập tin nhắn..." onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendNow(); } }} /><button type="button" onClick={sendNow}><Send size={17} /> Gửi</button></footer></main> : <main className="messages-requests-main"><section className="messages-request-form"><div><h2>Xin quyền hỗ trợ chấm điểm</h2><p>Dùng khi tổ khác cần hỗ trợ. Người nhận có thể đồng ý hoặc từ chối trong Messages.</p></div><div className="messages-request-fields"><input value={targetGroup} onChange={(e) => setTargetGroup(e.target.value)} placeholder="Tổ cần xin, VD: 2" /><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do xin quyền hỗ trợ chấm" /><button type="button" onClick={sendRequest}>Gửi yêu cầu</button></div></section><section className="messages-request-grid">{requests.length ? requests.map((r) => { const mine = r.from === me.email; const myGroup = Number(me.group || 0); const canResolve = !mine && r.permissionStatus === 'pending' && (!r.targetGroup || r.targetGroup === myGroup || ['lop_truong', 'gvcn'].includes(String(me.role || ''))); return <article key={r.id} className="messages-request-card"><header><strong>{r.fromName} xin chấm Tổ {r.targetGroup}</strong><span className={r.permissionStatus || 'pending'}>{r.permissionStatus || 'pending'}</span></header><p>{r.body}</p><small>Từ Tổ {r.requesterGroup || '?'} · {fmt(r.createdAt)}</small>{canResolve && <div><button type="button" onClick={() => void respond(r.id, 'approved')}><Check size={16} /> Đồng ý</button><button type="button" className="danger" onClick={() => void respond(r.id, 'rejected')}><X size={16} /> Từ chối</button></div>}</article>; }) : <div className="messages-center-empty"><strong>Chưa có yêu cầu quyền</strong><span>Các yêu cầu xin hỗ trợ chấm tổ khác sẽ nằm ở đây.</span></div>}</section></main>}
    {toast && <div className="messages-toast">{toast}</div>}
  </section>;
}

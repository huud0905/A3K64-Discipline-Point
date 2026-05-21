import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BarChart3, Maximize2, Minimize2, RefreshCcw, Search, UserRound, X } from 'lucide-react';
import { fetchScoreboardFromGas } from './lib/gasApi';
import { categoryLabel, formatScore, getGroupStats, mockScoreEvents, mockStudents, ScoreEvent, SCORE_WEEKS, Student, summarizeStudents } from './apps/ScoreboardApp/data/mockScoreData';

type DataState = { students: Student[]; events: ScoreEvent[]; weeks: number[]; source: 'loading' | 'gas' | 'local' };
type TabState = { id: string; title: string };
type Detail = { studentId?: string; week?: number };
type WinPos = { x: number; y: number; w: number; h: number };

const EVENT_NAME = 'a3k64-open-profile';
const SESSION_KEY = 'a3k64-login-session-v1';
const DEFAULT_DATA: DataState = { students: mockStudents, events: mockScoreEvents, weeks: SCORE_WEEKS, source: 'local' };

function strip(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
function pad(value: number) { return String(value).padStart(2, '0'); }
function eventVisible(event: ScoreEvent) { return !String(event.note || '').includes('__SHEET_TOTAL__'); }
function titleOf(students: Student[], id: string) {
  const index = Math.max(0, students.findIndex((item) => item.id === id)) + 1;
  return `${pad(index)} - ${students.find((item) => item.id === id)?.name || 'Học sinh'}`;
}
function selfStudent(students: Student[]) {
  try {
    const user = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')?.user || {};
    const keys = [user.displayName, user.hoten, user.name, String(user.email || '').split('@')[0]].map(strip).filter(Boolean);
    return students.find((student) => keys.some((key) => strip(student.name) === key || strip(student.name).includes(key) || key.includes(strip(student.name)))) || students[0];
  } catch { return students[0]; }
}
async function loadData(): Promise<DataState> {
  const remote = await fetchScoreboardFromGas().catch(() => null);
  if (remote?.students?.length) return { students: remote.students, events: remote.events, weeks: remote.weeks.length ? remote.weeks : SCORE_WEEKS, source: 'gas' };
  try {
    const events = JSON.parse(localStorage.getItem('scoreboard-local-events-v1') || 'null') as ScoreEvent[] | null;
    const weeks = JSON.parse(localStorage.getItem('scoreboard-local-weeks-v1') || 'null') as number[] | null;
    return { students: mockStudents, events: events?.length ? events : mockScoreEvents, weeks: weeks?.length ? weeks : SCORE_WEEKS, source: 'local' };
  } catch { return DEFAULT_DATA; }
}
function categoryTotal(events: ScoreEvent[], category: ScoreEvent['category']) { return events.filter((event) => event.category === category).reduce((sum, event) => sum + event.points, 0); }
function compareName(a: { name: string }, b: { name: string }) { return a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }); }

function TrendChart({ rows }: { rows: { week: number; me: number; group: number; cls: number }[] }) {
  const w = 680, h = 210, p = 30;
  const values = rows.flatMap((row) => [row.me, row.group, row.cls]);
  const min = Math.min(0, ...values) - 10;
  const max = Math.max(60, ...values) + 10;
  const range = Math.max(1, max - min);
  const x = (i: number) => p + (rows.length < 2 ? 0 : i * (w - p * 2) / (rows.length - 1));
  const y = (v: number) => h - p - ((v - min) * (h - p * 2)) / range;
  const points = (key: 'me' | 'group' | 'cls') => rows.map((row, i) => `${x(i)},${y(row[key])}`).join(' ');
  return <svg className="profile-super-chart" viewBox={`0 0 ${w} ${h}`}><polyline className="cls" points={points('cls')} /><polyline className="group" points={points('group')} /><polyline className="me" points={points('me')} />{rows.map((row, i) => <g key={row.week}><circle cx={x(i)} cy={y(row.me)} r="4" /><text x={x(i)} y={h - 8} textAnchor="middle">T{row.week}</text></g>)}</svg>;
}

function ProfilePage({ data, studentId, week }: { data: DataState; studentId: string; week: number }) {
  const [filter, setFilter] = useState('all');
  const currentWeek = data.weeks.includes(week) ? week : data.weeks[0] || 1;
  const summaries = useMemo(() => summarizeStudents(data.students, data.events, currentWeek), [data.students, data.events, currentWeek]);
  const student = summaries.find((item) => item.id === studentId) || summaries[0];
  if (!student) return <div className="profile-super-empty">Chưa có dữ liệu học sinh.</div>;
  const allEvents = data.events.filter((event) => event.studentId === student.id && eventVisible(event));
  const weekEvents = allEvents.filter((event) => event.week === currentWeek);
  const groupMembers = summaries.filter((item) => item.group === student.group).sort((a, b) => b.total - a.total || compareName(a, b));
  const groupRank = Math.max(1, groupMembers.findIndex((item) => item.id === student.id) + 1);
  const groupAverage = getGroupStats(summaries).find((item) => item.group === student.group)?.average || 0;
  const above = groupMembers[groupRank - 2];
  const below = groupMembers[groupRank];
  const chartRows = data.weeks.map((itemWeek) => {
    const weekSummaries = summarizeStudents(data.students, data.events, itemWeek);
    const me = weekSummaries.find((item) => item.id === student.id)?.total || 0;
    const group = weekSummaries.filter((item) => item.group === student.group);
    return {
      week: itemWeek,
      me,
      group: group.length ? Math.round(group.reduce((sum, item) => sum + item.total, 0) / group.length) : 0,
      cls: weekSummaries.length ? Math.round(weekSummaries.reduce((sum, item) => sum + item.total, 0) / weekSummaries.length) : 0,
    };
  });
  const history = allEvents.filter((event) => {
    if (filter === 'plus') return event.points > 0;
    if (filter === 'minus') return event.points < 0;
    if (['HOC_TAP', 'NE_NEP', 'PHONG_TRAO'].includes(filter)) return event.category === filter;
    return true;
  }).sort((a, b) => b.week - a.week || Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''));
  const notes = [
    student.total >= 50 ? 'Đang ở mức Tốt, nên duy trì phong độ hiện tại.' : student.total >= 0 ? 'Kết quả đang ổn, có thể bứt lên nhóm Tốt.' : 'Điểm đang thấp, cần ưu tiên giảm lỗi trừ điểm.',
    weekEvents.some((event) => event.points < 0) ? 'Tuần này có điểm trừ, nên kiểm tra lịch sử để biết nguyên nhân.' : 'Tuần này chưa có lỗi trừ điểm rõ ràng.',
    student.total >= groupAverage ? 'Điểm đang bằng hoặc cao hơn trung bình tổ.' : 'Điểm đang thấp hơn trung bình tổ, cần cố gắng thêm.',
  ];
  return <div className="profile-super-page"><section className="profile-super-hero"><div className="profile-super-avatar">{student.avatarInitial || student.name[0]}</div><div><span>Hồ sơ học sinh · Tuần {currentWeek}</span><h1>{student.name}</h1><p>Tổ {student.group} · {student.role || 'Học sinh'} · {student.status}</p></div><strong>#{student.rank}<small>Hạng lớp</small></strong></section><section className="profile-super-stats">{[['Tổng điểm', formatScore(student.total)], ['Điểm cộng', formatScore(student.positive)], ['Điểm trừ', String(student.negative)], ['Hạng tổ', `#${groupRank}/${groupMembers.length}`], ['Học tập', formatScore(categoryTotal(weekEvents, 'HOC_TAP'))], ['Nề nếp', formatScore(categoryTotal(weekEvents, 'NE_NEP'))], ['Phong trào', formatScore(categoryTotal(weekEvents, 'PHONG_TRAO'))], ['TB tổ', String(groupAverage)]].map(([label, value]) => <article key={label}><span>{label}</span><b className={String(value).startsWith('-') ? 'negative' : 'positive'}>{value}</b></article>)}</section><section className="profile-super-grid"><article className="profile-super-card chart-card"><h2><BarChart3 size={18} /> Biểu đồ tiến bộ</h2><TrendChart rows={chartRows} /><p className="legend">Xanh: học sinh · Tím: trung bình tổ · Xám: trung bình lớp</p></article><article className="profile-super-card"><h2>Nhận xét tự động</h2><ul>{notes.map((note) => <li key={note}>{note}</li>)}</ul><h2>So sánh trong tổ</h2><p>Cách người trên: {above ? `${Math.max(0, above.total - student.total)} điểm` : 'Đang dẫn đầu'}</p><p>Cách người dưới: {below ? `${Math.max(0, student.total - below.total)} điểm` : 'Cuối nhóm'}</p><p>So với TB tổ: {formatScore(student.total - groupAverage)}</p></article></section><section className="profile-super-card"><div className="profile-super-card-title"><h2>Lịch sử điểm</h2><div>{[['all', 'Tất cả'], ['plus', 'Cộng'], ['minus', 'Trừ'], ['HOC_TAP', 'Học tập'], ['NE_NEP', 'Nề nếp'], ['PHONG_TRAO', 'Phong trào']].map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div></div><div className="profile-super-table-wrap"><table><thead><tr><th>Tuần</th><th>Nội dung</th><th>Điểm</th><th>Loại</th><th>Người nhập</th><th>Thời gian</th></tr></thead><tbody>{history.length ? history.map((event) => <tr key={event.id}><td>T{event.week}</td><td>{event.title}</td><td className={event.points >= 0 ? 'positive' : 'negative'}>{formatScore(event.points)}</td><td>{categoryLabel(event.category)}</td><td>{event.createdBy || 'Google Sheets'}</td><td>{event.createdAt ? new Date(event.createdAt).toLocaleString('vi-VN') : 'Chưa rõ'}</td></tr>) : <tr><td colSpan={6}>Chưa có dữ liệu phù hợp.</td></tr>}</tbody></table></div></section></div>;
}

function ProfileSuperApp() {
  const [desktopReady, setDesktopReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [position, setPosition] = useState<WinPos>({ x: 110, y: 72, w: 1160, h: 760 });
  const [data, setData] = useState<DataState>({ ...DEFAULT_DATA, source: 'loading' });
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeId, setActiveId] = useState('');
  const [week, setWeek] = useState(1);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const drag = useRef<{ sx: number; sy: number; x: number; y: number } | null>(null);

  const refresh = async () => { setLoading(true); try { setData(await loadData()); } finally { setLoading(false); } };
  const openStudent = (id?: string, targetWeek?: number) => {
    const target = id || selfStudent(data.students)?.id;
    if (!target) return;
    setTabs((current) => current.some((tab) => tab.id === target) ? current.map((tab) => tab.id === target ? { ...tab, title: titleOf(data.students, target) } : tab) : [...current, { id: target, title: titleOf(data.students, target) }]);
    setActiveId(target);
    setWeek(targetWeek || week || 1);
    setOpen(true);
    setMinimized(false);
  };

  useEffect(() => { void refresh(); }, []);
  useEffect(() => { const timer = window.setInterval(() => setDesktopReady(Boolean(document.querySelector('.win-root'))), 500); return () => window.clearInterval(timer); }, []);
  useEffect(() => { const handler = (event: Event) => { const detail = (event as CustomEvent<Detail>).detail || {}; openStudent(detail.studentId, detail.week); if (data.source === 'loading') void refresh(); }; window.addEventListener(EVENT_NAME, handler); return () => window.removeEventListener(EVENT_NAME, handler); }, [data.students, data.source, week]);
  useEffect(() => { const move = (event: MouseEvent) => { if (!drag.current || maximized) return; setPosition((current) => ({ ...current, x: Math.max(0, drag.current!.x + event.clientX - drag.current!.sx), y: Math.max(0, drag.current!.y + event.clientY - drag.current!.sy) })); }; const up = () => { drag.current = null; }; window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }; }, [maximized]);

  const active = activeId || tabs[0]?.id || '';
  const results = data.students.filter((student) => strip(student.name).includes(strip(query)) || String(student.group).includes(query.trim())).slice(0, 10);
  const closeTab = (id: string) => setTabs((current) => { const next = current.filter((tab) => tab.id !== id); if (activeId === id) setActiveId(next[next.length - 1]?.id || ''); if (!next.length) setOpen(false); return next; });

  return <>{desktopReady && <button type="button" className="profile-super-shortcut desktop-shortcut" onDoubleClick={() => openStudent()} title="Profile - bấm đúp để mở"><div className="desktop-shortcut-icon"><UserRound /></div><span>Profile</span></button>}<style>{css}</style>{open && !minimized && <section className={`profile-super-window ${maximized ? 'maximized' : ''}`} style={maximized ? undefined : { left: position.x, top: position.y, width: position.w, height: position.h }} onContextMenu={(event) => event.preventDefault()}><header className="profile-super-titlebar" onMouseDown={(event) => { if (event.button !== 0 || maximized) return; drag.current = { sx: event.clientX, sy: event.clientY, x: position.x, y: position.y }; }} onDoubleClick={() => setMaximized((value) => !value)}><div><UserRound size={18} /><b>Profile</b><span>Hồ sơ học sinh</span></div><nav onMouseDown={(event) => event.stopPropagation()}><button onClick={() => void refresh()} disabled={loading}><RefreshCcw size={15} /></button><button onClick={() => setMinimized(true)}><Minimize2 size={15} /></button><button onClick={() => setMaximized((value) => !value)}><Maximize2 size={15} /></button><button className="close" onClick={() => setOpen(false)}><X size={16} /></button></nav></header><main><aside><label className="profile-super-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm học sinh..." /></label>{query && <div className="profile-super-results">{results.map((student) => <button key={student.id} onClick={() => { openStudent(student.id); setQuery(''); }}>{titleOf(data.students, student.id)}<small>Tổ {student.group}</small></button>)}</div>}<p>Tab học sinh</p>{tabs.map((tab) => <button key={tab.id} className={tab.id === active ? 'active' : ''} onClick={() => setActiveId(tab.id)}><span>{tab.title}</span><X size={13} onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }} /></button>)}</aside><section className="profile-super-main">{active ? <ProfilePage data={data} studentId={active} week={week} /> : <div className="profile-super-empty">Tìm hoặc chọn học sinh để xem hồ sơ.</div>}</section></main></section>}{open && minimized && <button type="button" className="profile-super-pill" onClick={() => setMinimized(false)}><UserRound size={16} />Profile</button>}</>;
}

const css = `.profile-super-shortcut{position:fixed;left:18px;top:286px;z-index:80;width:76px;border:0;background:transparent;color:inherit;display:grid;justify-items:center;gap:6px;text-shadow:0 1px 4px rgba(0,0,0,.45);font:inherit;font-weight:800;cursor:pointer}.profile-super-shortcut .desktop-shortcut-icon{width:52px;height:52px;border-radius:18px;display:grid;place-items:center;background:linear-gradient(135deg,var(--desktop-accent,#2563eb),#7c3aed);box-shadow:0 14px 34px rgba(0,0,0,.28)}.profile-super-shortcut svg{width:28px;height:28px}.profile-super-shortcut span{font-size:12px}.profile-super-window{position:fixed;z-index:4200;min-width:760px;min-height:520px;resize:both;overflow:hidden;border:1px solid rgba(148,163,184,.28);border-radius:22px;background:var(--profile-bg,#07111f);color:var(--profile-text,#f8fafc);box-shadow:0 30px 110px rgba(0,0,0,.5);font-family:'Segoe UI',system-ui,Arial}.profile-super-window.maximized{inset:10px 10px 62px 10px!important;width:auto!important;height:auto!important;resize:none}.theme-light .profile-super-window{--profile-bg:#f8fbff;--profile-panel:#ffffff;--profile-soft:#eef4fb;--profile-text:#0f172a;--profile-muted:#64748b;--profile-border:#dbe7f3}.theme-dark .profile-super-window{--profile-bg:#07111f;--profile-panel:#0f172a;--profile-soft:#111827;--profile-text:#f8fafc;--profile-muted:#94a3b8;--profile-border:#233047}.profile-super-titlebar{height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 12px 0 16px;background:var(--profile-panel);border-bottom:1px solid var(--profile-border);cursor:grab;user-select:none}.profile-super-titlebar>div,.profile-super-titlebar nav{display:flex;align-items:center;gap:9px}.profile-super-titlebar span{color:var(--profile-muted);font-size:12px}.profile-super-titlebar button{width:34px;height:34px;border:1px solid var(--profile-border);border-radius:11px;background:var(--profile-soft);color:var(--profile-text);display:grid;place-items:center}.profile-super-titlebar .close{color:#ef4444}.profile-super-window>main{height:calc(100% - 48px);display:grid;grid-template-columns:252px 1fr}.profile-super-window aside{background:var(--profile-soft);border-right:1px solid var(--profile-border);padding:12px;overflow:auto}.profile-super-search{height:40px;border:1px solid var(--profile-border);border-radius:13px;display:grid;grid-template-columns:28px 1fr;align-items:center;padding:0 8px;background:var(--profile-panel);color:var(--profile-muted)}.profile-super-search input{border:0;outline:0;background:transparent;color:var(--profile-text);font:inherit;font-weight:800;min-width:0}.profile-super-window aside p{margin:12px 0 8px;color:var(--profile-muted);font-size:12px;text-transform:uppercase;font-weight:900}.profile-super-window aside>button{width:100%;min-height:42px;border:0;border-radius:13px;margin-bottom:7px;padding:0 9px;display:grid;grid-template-columns:1fr 20px;align-items:center;background:transparent;color:var(--profile-text);text-align:left;font-weight:850}.profile-super-window aside>button:hover,.profile-super-window aside>button.active{background:var(--profile-panel);box-shadow:inset 3px 0 0 var(--desktop-accent,#2563eb)}.profile-super-results{margin:8px 0;padding:7px;border:1px solid var(--profile-border);border-radius:14px;background:var(--profile-panel)}.profile-super-results button{width:100%;border:0;border-radius:10px;margin-bottom:5px;padding:8px;text-align:left;background:transparent;color:var(--profile-text);display:grid;font-weight:850}.profile-super-results button:hover{background:var(--profile-soft)}.profile-super-results small{color:var(--profile-muted)}.profile-super-main{overflow:auto}.profile-super-page{padding:18px;display:grid;gap:14px}.profile-super-hero{display:grid;grid-template-columns:auto 1fr auto;gap:15px;align-items:center;border:1px solid var(--profile-border);border-radius:22px;padding:16px;background:linear-gradient(135deg,color-mix(in srgb,var(--desktop-accent,#2563eb) 22%,transparent),var(--profile-panel))}.profile-super-avatar{width:74px;height:74px;border-radius:24px;display:grid;place-items:center;background:linear-gradient(135deg,var(--desktop-accent,#2563eb),#7c3aed);color:white;font-size:28px;font-weight:950}.profile-super-hero span,.profile-super-hero p,.profile-super-hero small{color:var(--profile-muted)}.profile-super-hero h1{margin:4px 0;font-size:30px}.profile-super-hero strong{font-size:30px;text-align:center}.profile-super-hero small{display:block;font-size:12px}.profile-super-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.profile-super-stats article,.profile-super-card{border:1px solid var(--profile-border);border-radius:18px;background:var(--profile-panel);padding:14px}.profile-super-stats span{color:var(--profile-muted);font-size:12px;font-weight:800}.profile-super-stats b{display:block;margin-top:5px;font-size:21px}.positive{color:#00b981}.negative{color:#ef4444}.profile-super-grid{display:grid;grid-template-columns:1.45fr .9fr;gap:14px}.profile-super-card h2{margin:0 0 10px;display:flex;align-items:center;gap:8px;font-size:17px}.profile-super-chart{width:100%;height:210px}.profile-super-chart polyline{fill:none;stroke-width:3;stroke-linecap:round}.profile-super-chart .me{stroke:#38bdf8}.profile-super-chart .group{stroke:#a78bfa}.profile-super-chart .cls{stroke:#64748b}.profile-super-chart circle{fill:#38bdf8}.profile-super-chart text{fill:var(--profile-muted);font-size:12px}.legend{color:var(--profile-muted);font-size:12px}.profile-super-card-title{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.profile-super-card-title div{display:flex;gap:7px;flex-wrap:wrap}.profile-super-card-title button{border:1px solid var(--profile-border);border-radius:999px;padding:7px 10px;background:var(--profile-soft);color:var(--profile-text);font-weight:850}.profile-super-card-title button.active{background:var(--desktop-accent,#2563eb);color:white}.profile-super-table-wrap{overflow:auto}.profile-super-card table{width:100%;border-collapse:collapse;min-width:760px}.profile-super-card th,.profile-super-card td{padding:10px 12px;border-bottom:1px solid var(--profile-border);text-align:left;font-size:13px}.profile-super-card th{color:var(--profile-muted);background:var(--profile-soft);font-size:11px;text-transform:uppercase}.profile-super-empty{text-align:center;color:var(--profile-muted);padding:32px}.profile-super-pill{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:4300;height:38px;padding:0 15px;border:1px solid rgba(148,163,184,.35);border-radius:999px;display:flex;align-items:center;gap:8px;color:white;background:#111827;box-shadow:0 16px 42px rgba(0,0,0,.4);font-weight:900}@media(max-width:860px){.profile-super-shortcut{top:250px}.profile-super-window{left:8px!important;top:8px!important;width:calc(100vw - 16px)!important;height:calc(100vh - 78px)!important;min-width:0;min-height:0}.profile-super-window>main{grid-template-columns:1fr}.profile-super-window aside{display:flex;gap:8px;overflow:auto;border-right:0;border-bottom:1px solid var(--profile-border)}.profile-super-search{min-width:190px}.profile-super-window aside p{display:none}.profile-super-window aside>button{min-width:190px}.profile-super-hero,.profile-super-stats,.profile-super-grid{grid-template-columns:1fr}}`;

const root = document.createElement('div');
root.id = 'a3k64-profile-super-root';
document.body.appendChild(root);
ReactDOM.createRoot(root).render(<ProfileSuperApp />);

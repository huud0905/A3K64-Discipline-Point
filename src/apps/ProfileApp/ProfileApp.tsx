import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCcw, Search, UserRound, X } from 'lucide-react';
import { fetchScoreboardFromGas } from '../../lib/gasApi';
import { categoryLabel, formatScore, getGroupStats, mockScoreEvents, mockStudents, ScoreEvent, SCORE_WEEKS, Student, summarizeStudents } from '../ScoreboardApp/data/mockScoreData';
import './ProfileApp.css';

type DataState = { students: Student[]; events: ScoreEvent[]; weeks: number[]; source: 'loading' | 'gas' | 'local' };
type ProfileTab = { id: string; title: string };
type ProfileAppProps = { userName?: string | null; userEmail?: string | null; requestedStudentId?: string; requestedWeek?: number };

const SESSION_KEY = 'a3k64-login-session-v1';
const DEFAULT_DATA: DataState = { students: mockStudents, events: mockScoreEvents, weeks: SCORE_WEEKS, source: 'local' };

function normalize(value?: string | null) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').replace(/\s+/g, ' ').trim().toLowerCase();
}
function pad(value: number) { return String(value).padStart(2, '0'); }
function hiddenTotal(event: ScoreEvent) { return String(event.note || '').includes('__SHEET_TOTAL__'); }
function studentTitle(students: Student[], id: string) {
  const index = Math.max(0, students.findIndex((item) => item.id === id)) + 1;
  return `${pad(index)} - ${students.find((item) => item.id === id)?.name || 'Học sinh'}`;
}
function currentUserStudent(students: Student[], fallbackName?: string | null, fallbackEmail?: string | null) {
  try {
    const sessionUser = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')?.user || {};
    const names = [fallbackName, fallbackEmail?.split('@')[0], sessionUser.displayName, sessionUser.hoten, sessionUser.name, String(sessionUser.email || '').split('@')[0]].map(normalize).filter(Boolean);
    return students.find((student) => names.some((name) => normalize(student.name) === name || normalize(student.name).includes(name) || name.includes(normalize(student.name)))) || students[0];
  } catch {
    return students[0];
  }
}
async function loadProfileData(): Promise<DataState> {
  const remote = await fetchScoreboardFromGas().catch(() => null);
  if (remote?.students?.length) return { students: remote.students, events: remote.events, weeks: remote.weeks.length ? remote.weeks : SCORE_WEEKS, source: 'gas' };
  try {
    const events = JSON.parse(localStorage.getItem('scoreboard-local-events-v1') || 'null') as ScoreEvent[] | null;
    const weeks = JSON.parse(localStorage.getItem('scoreboard-local-weeks-v1') || 'null') as number[] | null;
    return { students: mockStudents, events: events?.length ? events : mockScoreEvents, weeks: weeks?.length ? weeks : SCORE_WEEKS, source: 'local' };
  } catch { return DEFAULT_DATA; }
}
function categoryTotal(events: ScoreEvent[], category: ScoreEvent['category']) {
  return events.filter((event) => event.category === category).reduce((sum, event) => sum + event.points, 0);
}

function ProfileChart({ rows }: { rows: { week: number; me: number; group: number; cls: number }[] }) {
  const w = 720, h = 220, p = 32;
  const values = rows.flatMap((row) => [row.me, row.group, row.cls]);
  const min = Math.min(0, ...values) - 10, max = Math.max(60, ...values) + 10, range = Math.max(1, max - min);
  const x = (i: number) => p + (rows.length < 2 ? 0 : i * (w - p * 2) / (rows.length - 1));
  const y = (v: number) => h - p - ((v - min) * (h - p * 2)) / range;
  const points = (key: 'me' | 'group' | 'cls') => rows.map((row, i) => `${x(i)},${y(row[key])}`).join(' ');
  return <svg className="profile-chart" viewBox={`0 0 ${w} ${h}`}><line x1={p} y1={h - p} x2={w - p} y2={h - p} className="axis" /><line x1={p} y1={p} x2={p} y2={h - p} className="axis" /><polyline className="cls" points={points('cls')} /><polyline className="group" points={points('group')} /><polyline className="me" points={points('me')} />{rows.map((row, i) => <g key={row.week}><circle cx={x(i)} cy={y(row.me)} r="4.5" /><text x={x(i)} y={h - 8} textAnchor="middle">T{row.week}</text></g>)}</svg>;
}

function StudentProfile({ data, studentId, week }: { data: DataState; studentId: string; week: number }) {
  const [filter, setFilter] = useState('all');
  const activeWeek = data.weeks.includes(week) ? week : data.weeks[0] || 1;
  const summaries = useMemo(() => summarizeStudents(data.students, data.events, activeWeek), [data.students, data.events, activeWeek]);
  const student = summaries.find((item) => item.id === studentId) || summaries[0];
  if (!student) return <div className="profile-empty">Chưa có dữ liệu học sinh.</div>;
  const allEvents = data.events.filter((event) => event.studentId === student.id && !hiddenTotal(event));
  const weekEvents = allEvents.filter((event) => event.week === activeWeek);
  const groupMembers = summaries.filter((item) => item.group === student.group).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'vi'));
  const groupRank = Math.max(1, groupMembers.findIndex((item) => item.id === student.id) + 1);
  const groupAverage = getGroupStats(summaries).find((item) => item.group === student.group)?.average || 0;
  const above = groupMembers[groupRank - 2];
  const below = groupMembers[groupRank];
  const chartRows = data.weeks.map((itemWeek) => {
    const weekSummaries = summarizeStudents(data.students, data.events, itemWeek);
    const me = weekSummaries.find((item) => item.id === student.id)?.total || 0;
    const group = weekSummaries.filter((item) => item.group === student.group);
    return { week: itemWeek, me, group: group.length ? Math.round(group.reduce((sum, item) => sum + item.total, 0) / group.length) : 0, cls: weekSummaries.length ? Math.round(weekSummaries.reduce((sum, item) => sum + item.total, 0) / weekSummaries.length) : 0 };
  });
  const history = allEvents.filter((event) => filter === 'all' || (filter === 'plus' ? event.points > 0 : filter === 'minus' ? event.points < 0 : event.category === filter)).sort((a, b) => b.week - a.week || Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''));
  const notes = [student.total >= 50 ? 'Đang ở mức Tốt, nên duy trì phong độ hiện tại.' : student.total >= 0 ? 'Kết quả đang ổn, có thể bứt lên nhóm Tốt.' : 'Điểm đang thấp, cần ưu tiên giảm lỗi trừ điểm.', weekEvents.some((event) => event.points < 0) ? 'Tuần này có điểm trừ, nên kiểm tra lịch sử để biết nguyên nhân.' : 'Tuần này chưa có lỗi trừ điểm rõ ràng.', student.total >= groupAverage ? 'Điểm đang bằng hoặc cao hơn trung bình tổ.' : 'Điểm đang thấp hơn trung bình tổ, cần cố gắng thêm.'];
  return <div className="profile-page"><section className="profile-hero"><div className="profile-avatar-big">{student.avatarInitial || student.name[0]}</div><div><span>Hồ sơ học sinh · Tuần {activeWeek}</span><h1>{student.name}</h1><p>Tổ {student.group} · {student.role || 'Học sinh'} · {student.status}</p></div><strong>#{student.rank}<small>Hạng lớp</small></strong></section><section className="profile-stat-grid">{[['Tổng điểm', formatScore(student.total)], ['Điểm cộng', formatScore(student.positive)], ['Điểm trừ', String(student.negative)], ['Hạng tổ', `#${groupRank}/${groupMembers.length}`], ['Học tập', formatScore(categoryTotal(weekEvents, 'HOC_TAP'))], ['Nề nếp', formatScore(categoryTotal(weekEvents, 'NE_NEP'))], ['Phong trào', formatScore(categoryTotal(weekEvents, 'PHONG_TRAO'))], ['TB tổ', String(groupAverage)]].map(([label, value]) => <article key={label}><span>{label}</span><b className={String(value).startsWith('-') ? 'negative' : 'positive'}>{value}</b></article>)}</section><section className="profile-grid"><article className="profile-card wide"><h2><BarChart3 size={18} /> Biểu đồ tiến bộ</h2><ProfileChart rows={chartRows} /><p className="profile-legend">Xanh: học sinh · Tím: trung bình tổ · Xám: trung bình lớp</p></article><article className="profile-card"><h2>Nhận xét tự động</h2><ul>{notes.map((note) => <li key={note}>{note}</li>)}</ul><h2>So sánh trong tổ</h2><p>Cách người trên: {above ? `${Math.max(0, above.total - student.total)} điểm` : 'Đang dẫn đầu'}</p><p>Cách người dưới: {below ? `${Math.max(0, student.total - below.total)} điểm` : 'Cuối nhóm'}</p><p>So với TB tổ: {formatScore(student.total - groupAverage)}</p></article></section><section className="profile-card"><div className="profile-history-head"><h2>Lịch sử điểm</h2><div>{[['all', 'Tất cả'], ['plus', 'Cộng'], ['minus', 'Trừ'], ['HOC_TAP', 'Học tập'], ['NE_NEP', 'Nề nếp'], ['PHONG_TRAO', 'Phong trào']].map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div></div><div className="profile-table-wrap"><table><thead><tr><th>Tuần</th><th>Nội dung</th><th>Điểm</th><th>Loại</th><th>Người nhập</th><th>Thời gian</th></tr></thead><tbody>{history.length ? history.map((event) => <tr key={event.id}><td>T{event.week}</td><td>{event.title}</td><td className={event.points >= 0 ? 'positive' : 'negative'}>{formatScore(event.points)}</td><td>{categoryLabel(event.category)}</td><td>{event.createdBy || 'Google Sheets'}</td><td>{event.createdAt ? new Date(event.createdAt).toLocaleString('vi-VN') : 'Chưa rõ'}</td></tr>) : <tr><td colSpan={6}>Chưa có dữ liệu phù hợp.</td></tr>}</tbody></table></div></section></div>;
}

export default function ProfileApp({ userName, userEmail, requestedStudentId, requestedWeek }: ProfileAppProps) {
  const [data, setData] = useState<DataState>({ ...DEFAULT_DATA, source: 'loading' });
  const [tabs, setTabs] = useState<ProfileTab[]>([]);
  const [activeId, setActiveId] = useState('');
  const [week, setWeek] = useState(requestedWeek || 1);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const refresh = async () => { setLoading(true); try { setData(await loadProfileData()); } finally { setLoading(false); } };
  const openStudent = (id?: string, targetWeek?: number) => {
    const target = id || currentUserStudent(data.students, userName, userEmail)?.id;
    if (!target) return;
    setTabs((current) => current.some((tab) => tab.id === target) ? current.map((tab) => tab.id === target ? { ...tab, title: studentTitle(data.students, target) } : tab) : [...current, { id: target, title: studentTitle(data.students, target) }]);
    setActiveId(target);
    setWeek(targetWeek || week || 1);
  };
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { if (data.students.length && !tabs.length) openStudent(requestedStudentId); }, [data.students.length]);
  useEffect(() => { if (requestedStudentId) openStudent(requestedStudentId, requestedWeek); }, [requestedStudentId, requestedWeek]);
  const active = activeId || tabs[0]?.id || '';
  const results = data.students.filter((student) => normalize(student.name).includes(normalize(query)) || String(student.group).includes(query.trim())).slice(0, 10);
  const closeTab = (id: string) => setTabs((current) => { const next = current.filter((tab) => tab.id !== id); if (activeId === id) setActiveId(next[next.length - 1]?.id || ''); return next; });
  return <div className="profile-app-shell" onContextMenu={(event) => event.preventDefault()}><aside className="profile-sidebar"><div className="profile-brand"><UserRound size={20} /><div><strong>Profile</strong><span>{data.source === 'gas' ? 'Google Sheets' : data.source === 'loading' ? 'Đang tải' : 'Dữ liệu cục bộ'}</span></div><button type="button" onClick={() => void refresh()} disabled={loading} title="Làm mới"><RefreshCcw size={15} /></button></div><label className="profile-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm học sinh..." /></label>{query && <div className="profile-results">{results.map((student) => <button key={student.id} type="button" onClick={() => { openStudent(student.id); setQuery(''); }}>{studentTitle(data.students, student.id)}<small>Tổ {student.group}</small></button>)}</div>}<p className="profile-side-title">Tab học sinh</p><div className="profile-tabs">{tabs.map((tab) => <button key={tab.id} type="button" className={tab.id === active ? 'active' : ''} onClick={() => setActiveId(tab.id)}><span>{tab.title}</span><X size={13} onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }} /></button>)}</div></aside><main className="profile-main">{active ? <StudentProfile data={data} studentId={active} week={week} /> : <div className="profile-empty">Tìm hoặc chọn học sinh để xem hồ sơ.</div>}</main></div>;
}

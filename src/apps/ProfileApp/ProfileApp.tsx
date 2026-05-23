import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BarChart3, Plus, RotateCw, Search, X } from 'lucide-react';
import { fetchScoreboardFromGas } from '../../lib/gasApi';
import {
  categoryLabel,
  formatScore,
  getGroupStats,
  mockScoreEvents,
  mockStudents,
  ScoreEvent,
  SCORE_WEEKS,
  Student,
  summarizeStudents,
} from '../ScoreboardApp/data/mockScoreData';
import './ProfileApp.css';
import './ProfileTabsEdge.css';

type DataState = {
  students: Student[];
  events: ScoreEvent[];
  weeks: number[];
  source: 'loading' | 'gas' | 'local';
};

type ProfileTab = {
  key: string;
  kind: 'student' | 'new';
  id?: string;
  name?: string;
  title: string;
};

type ProfileAppProps = {
  userName?: string | null;
  userEmail?: string | null;
  requestedStudentId?: string;
  requestedWeek?: number;
};

type TabContextMenu = { x: number; y: number; key: string } | null;

type WeekRow = {
  week: number;
  total: number;
  positive: number;
  negative: number;
  hocTap: number;
  neNep: number;
  phongTrao: number;
  rank: number;
  status: string;
  groupAverage: number;
  classAverage: number;
};

const SESSION_KEY = 'a3k64-login-session-v1';
const VERTICAL_TABS_KEY = 'profile-vertical-tabs-v1';
const DEFAULT_DATA: DataState = {
  students: mockStudents,
  events: mockScoreEvents,
  weeks: SCORE_WEEKS,
  source: 'local',
};

function normalize(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function hiddenTotal(event: ScoreEvent) {
  return String(event.note || '').includes('__SHEET_TOTAL__');
}

function givenNameOf(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] || fullName;
}

function compareByGivenName(a: { name: string }, b: { name: string }) {
  const given = givenNameOf(a.name).localeCompare(givenNameOf(b.name), 'vi', { sensitivity: 'base' });
  return given || a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' });
}

function alphabetStudents(students: Student[]) {
  return [...students].sort(compareByGivenName);
}

function studentTitle(students: Student[], id: string) {
  const sorted = alphabetStudents(students);
  const student = students.find((item) => item.id === id) || sorted.find((item) => item.id === id);
  const index = Math.max(0, sorted.findIndex((item) => item.id === id)) + 1;
  return `${pad(index)} - ${student?.name || 'Học sinh'}`;
}

function findStudentByIdOrName(students: Student[], id?: string, name?: string) {
  return students.find((student) => student.id === id) || students.find((student) => normalize(student.name) === normalize(name));
}

function currentUserStudent(students: Student[], fallbackName?: string | null, fallbackEmail?: string | null) {
  try {
    const sessionUser = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')?.user || {};
    const names = [fallbackName, fallbackEmail?.split('@')[0], sessionUser.displayName, sessionUser.hoten, sessionUser.name, String(sessionUser.email || '').split('@')[0]]
      .map(normalize)
      .filter(Boolean);
    return students.find((student) => names.some((name) => normalize(student.name) === name || normalize(student.name).includes(name) || name.includes(normalize(student.name)))) || students[0];
  } catch {
    return students[0];
  }
}

function newTabKey() {
  return `new-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function realWeeks(data: DataState) {
  const fromSettings = data.weeks.filter((week) => Number.isFinite(week) && week > 0);
  const fromEvents = data.events.map((event) => Number(event.week)).filter((week) => Number.isFinite(week) && week > 0);
  return Array.from(new Set([...fromSettings, ...fromEvents])).sort((a, b) => a - b);
}

function latestWeek(data: DataState) {
  const weeks = realWeeks(data);
  return weeks[weeks.length - 1] || 1;
}

function defaultCompareWeeks(weeks: number[], activeWeek: number) {
  if (!weeks.length) return [Math.max(1, activeWeek || 1)];
  return weeks.slice(-9);
}

async function loadProfileData(): Promise<DataState> {
  const remote = await fetchScoreboardFromGas().catch(() => null);
  if (remote?.students?.length) return { students: remote.students, events: remote.events, weeks: remote.weeks.length ? remote.weeks : SCORE_WEEKS, source: 'gas' };
  try {
    const events = JSON.parse(localStorage.getItem('scoreboard-local-events-v1') || 'null') as ScoreEvent[] | null;
    const weeks = JSON.parse(localStorage.getItem('scoreboard-local-weeks-v1') || 'null') as number[] | null;
    return { students: mockStudents, events: events?.length ? events : mockScoreEvents, weeks: weeks?.length ? weeks : SCORE_WEEKS, source: 'local' };
  } catch {
    return DEFAULT_DATA;
  }
}

function categoryTotal(events: ScoreEvent[], category: ScoreEvent['category']) {
  return events.filter((event) => event.category === category).reduce((sum, event) => sum + event.points, 0);
}

function ProfileChart({ rows }: { rows: { week: number; me: number; group: number; cls: number }[] }) {
  const w = 900;
  const h = 240;
  const p = 34;
  const values = rows.flatMap((row) => [row.me, row.group, row.cls]);
  const min = Math.min(0, ...values) - 10;
  const max = Math.max(60, ...values) + 10;
  const range = Math.max(1, max - min);
  const x = (i: number) => p + (rows.length < 2 ? 0 : (i * (w - p * 2)) / (rows.length - 1));
  const y = (v: number) => h - p - ((v - min) * (h - p * 2)) / range;
  const points = (key: 'me' | 'group' | 'cls') => rows.map((row, i) => `${x(i)},${y(row[key])}`).join(' ');
  return (
    <svg className="profile-chart profile-chart-nine" viewBox={`0 0 ${w} ${h}`}>
      <line x1={p} y1={h - p} x2={w - p} y2={h - p} className="axis" />
      <line x1={p} y1={p} x2={p} y2={h - p} className="axis" />
      <polyline className="cls" points={points('cls')} />
      <polyline className="group" points={points('group')} />
      <polyline className="me" points={points('me')} />
      {rows.map((row, i) => (
        <g key={row.week}>
          <circle cx={x(i)} cy={y(row.me)} r="4.5" />
          <text x={x(i)} y={h - 8} textAnchor="middle">T{row.week}</text>
        </g>
      ))}
    </svg>
  );
}

function StudentProfile({ data, studentId, week, onWeekChange }: { data: DataState; studentId: string; week: number; onWeekChange: (week: number) => void }) {
  const [filter, setFilter] = useState('all');
  const [compareWeeks, setCompareWeeks] = useState<number[]>([]);
  const [historyWeeks, setHistoryWeeks] = useState<number[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const availableWeeks = useMemo(() => realWeeks(data), [data.weeks, data.events]);
  const activeWeek = availableWeeks.includes(week) ? week : availableWeeks[availableWeeks.length - 1] || Math.max(1, week || 1);
  const activeWeekIndex = Math.max(0, availableWeeks.indexOf(activeWeek));
  const previousWeek = activeWeekIndex > 0 ? availableWeeks[activeWeekIndex - 1] : null;
  const nextWeek = activeWeekIndex >= 0 && activeWeekIndex < availableWeeks.length - 1 ? availableWeeks[activeWeekIndex + 1] : null;
  const defaultWeeks = useMemo(() => defaultCompareWeeks(availableWeeks, activeWeek), [availableWeeks, activeWeek]);
  const selectedWeeks = compareWeeks.filter((item) => availableWeeks.includes(item)).sort((a, b) => a - b);
  const tableWeeks = selectedWeeks.length ? selectedWeeks : defaultWeeks;
  const tableWeekKey = tableWeeks.join('|');
  const tableWeekSet = useMemo(() => new Set(tableWeeks), [tableWeekKey]);
  const fallbackHistoryWeek = tableWeekSet.has(activeWeek) ? activeWeek : tableWeeks[tableWeeks.length - 1] || activeWeek;

  useEffect(() => {
    if (availableWeeks.length && (!week || !availableWeeks.includes(week))) onWeekChange(activeWeek);
  }, [availableWeeks.join('|'), activeWeek, week, onWeekChange]);

  useEffect(() => {
    setCompareWeeks((current) => current.filter((item) => availableWeeks.includes(item)).sort((a, b) => a - b));
  }, [availableWeeks.join('|')]);

  useEffect(() => {
    setHistoryWeeks((current) => {
      const cleaned = current.filter((item) => tableWeekSet.has(item)).sort((a, b) => a - b);
      return cleaned.length ? cleaned : [fallbackHistoryWeek].filter(Boolean);
    });
  }, [tableWeekKey, fallbackHistoryWeek, tableWeekSet]);

  const historyWeeksToShow = useMemo(() => {
    const cleaned = historyWeeks.filter((item) => tableWeekSet.has(item)).sort((a, b) => a - b);
    return cleaned.length ? cleaned : [fallbackHistoryWeek].filter(Boolean);
  }, [historyWeeks, tableWeekKey, fallbackHistoryWeek, tableWeekSet]);

  const summaries = useMemo(() => summarizeStudents(data.students, data.events, activeWeek), [data.students, data.events, activeWeek]);
  const student = summaries.find((item) => item.id === studentId);
  if (!student) return <div className="profile-empty">Không tìm thấy học sinh này trong dữ liệu hiện tại. Hãy chọn lại từ tab mới.</div>;

  const allEvents = data.events.filter((event) => event.studentId === student.id && !hiddenTotal(event));
  const weekEvents = allEvents.filter((event) => event.week === activeWeek);
  const groupMembers = summaries.filter((item) => item.group === student.group).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'vi'));
  const groupRank = Math.max(1, groupMembers.findIndex((item) => item.id === student.id) + 1);
  const groupAverage = getGroupStats(summaries).find((item) => item.group === student.group)?.average || 0;
  const above = groupMembers[groupRank - 2];
  const below = groupMembers[groupRank];

  const buildWeekRows = (sourceWeeks: number[]): WeekRow[] => sourceWeeks.map((itemWeek) => {
    const weekSummaries = summarizeStudents(data.students, data.events, itemWeek);
    const current = weekSummaries.find((item) => item.id === student.id);
    const group = weekSummaries.filter((item) => item.group === student.group);
    const events = allEvents.filter((event) => event.week === itemWeek);
    return {
      week: itemWeek,
      total: current?.total || 0,
      positive: current?.positive || 0,
      negative: current?.negative || 0,
      hocTap: categoryTotal(events, 'HOC_TAP'),
      neNep: categoryTotal(events, 'NE_NEP'),
      phongTrao: categoryTotal(events, 'PHONG_TRAO'),
      rank: current?.rank || 0,
      status: current?.status || 'Chưa có',
      groupAverage: group.length ? Math.round(group.reduce((sum, item) => sum + item.total, 0) / group.length) : 0,
      classAverage: weekSummaries.length ? Math.round(weekSummaries.reduce((sum, item) => sum + item.total, 0) / weekSummaries.length) : 0,
    };
  });

  const weeklyRows = buildWeekRows(tableWeeks);
  const chartRows = buildWeekRows(defaultWeeks).map((row) => ({ week: row.week, me: row.total, group: row.groupAverage, cls: row.classAverage }));
  const history = allEvents
    .filter((event) => historyWeeksToShow.includes(event.week))
    .filter((event) => filter === 'all' || (filter === 'plus' ? event.points > 0 : filter === 'minus' ? event.points < 0 : event.category === filter))
    .sort((a, b) => b.week - a.week || Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''));
  const historyTitle = historyWeeksToShow.length > 1 ? `Lịch sử điểm các tuần ${historyWeeksToShow.map((item) => `T${item}`).join(', ')}` : `Lịch sử điểm tuần ${historyWeeksToShow[0] || activeWeek}`;
  const notes = [
    student.total >= 50 ? 'Đang ở mức Tốt, nên duy trì phong độ hiện tại.' : student.total >= 0 ? 'Kết quả đang ổn, có thể bứt lên nhóm Tốt.' : 'Điểm đang thấp, cần ưu tiên giảm lỗi trừ điểm.',
    weekEvents.some((event) => event.points < 0) ? 'Tuần này có điểm trừ, nên kiểm tra lịch sử để biết nguyên nhân.' : 'Tuần này chưa có lỗi trừ điểm rõ ràng.',
    student.total >= groupAverage ? 'Điểm đang bằng hoặc cao hơn trung bình tổ.' : 'Điểm đang thấp hơn trung bình tổ, cần cố gắng thêm.',
  ];

  const toggleWeek = (targetWeek: number) => {
    setCompareWeeks((current) => {
      const base = current.length ? current : defaultWeeks;
      const next = base.includes(targetWeek) ? base.filter((item) => item !== targetWeek) : [...base, targetWeek];
      return Array.from(new Set(next)).filter((item) => availableWeeks.includes(item)).sort((a, b) => a - b);
    });
  };

  const toggleHistoryWeek = (targetWeek: number) => {
    setHistoryWeeks((current) => {
      const base = current.filter((item) => tableWeekSet.has(item));
      const next = base.includes(targetWeek) ? base.filter((item) => item !== targetWeek) : [...base, targetWeek];
      const unique = Array.from(new Set(next)).filter((item) => tableWeekSet.has(item)).sort((a, b) => a - b);
      return unique.length ? unique : [targetWeek];
    });
  };

  return (
    <div className="profile-page">
      <section className="profile-hero">
        <div className="profile-avatar-big">{student.avatarInitial || student.name[0]}</div>
        <div className="profile-hero-info">
          <div className="profile-hero-meta-row">
            <span>Hồ sơ học sinh · Tuần {activeWeek}</span>
            <div className="profile-week-switcher" aria-label="Chọn tuần hồ sơ">
              <button type="button" title="Tuần trước" disabled={!previousWeek} onClick={() => previousWeek && onWeekChange(previousWeek)}><ArrowLeft size={14} /></button>
              <label>
                <span>Tuần</span>
                <select value={activeWeek} onChange={(event) => onWeekChange(Number(event.target.value))}>
                  {availableWeeks.length ? availableWeeks.map((itemWeek) => <option key={itemWeek} value={itemWeek}>Tuần {itemWeek}</option>) : <option value={activeWeek}>Tuần {activeWeek}</option>}
                </select>
              </label>
              <button type="button" title="Tuần sau" disabled={!nextWeek} onClick={() => nextWeek && onWeekChange(nextWeek)}><ArrowRight size={14} /></button>
            </div>
          </div>
          <h1>{student.name}</h1>
          <p>Tổ {student.group} · {student.role || 'Học sinh'} · {student.status}</p>
        </div>
        <strong>#{student.rank}<small>Hạng lớp</small></strong>
      </section>
      <section className="profile-stat-grid">
        {[
          ['Tổng điểm', formatScore(student.total)], ['Điểm cộng', formatScore(student.positive)], ['Điểm trừ', String(student.negative)], ['Hạng tổ', `#${groupRank}/${groupMembers.length}`],
          ['Học tập', formatScore(categoryTotal(weekEvents, 'HOC_TAP'))], ['Nề nếp', formatScore(categoryTotal(weekEvents, 'NE_NEP'))], ['Phong trào', formatScore(categoryTotal(weekEvents, 'PHONG_TRAO'))], ['TB tổ', String(groupAverage)],
        ].map(([label, value]) => <article key={label}><span>{label}</span><b className={String(value).startsWith('-') ? 'negative' : 'positive'}>{value}</b></article>)}
      </section>
      <section className="profile-grid">
        <article className="profile-card wide"><h2><BarChart3 size={18} /> Biểu đồ so sánh tuần</h2><ProfileChart rows={chartRows} /></article>
        <article className="profile-card"><h2>Nhận xét tự động</h2><ul>{notes.map((note) => <li key={note}>{note}</li>)}</ul><h2>So sánh trong tổ</h2><p>Cách người trên: {above ? `${Math.max(0, above.total - student.total)} điểm` : 'Đang dẫn đầu'}</p><p>Cách người dưới: {below ? `${Math.max(0, student.total - below.total)} điểm` : 'Cuối nhóm'}</p><p>So với TB tổ: {formatScore(student.total - groupAverage)}</p></article>
      </section>
      <section className="profile-card profile-week-overview-card">
        <div className="profile-history-head profile-compare-head"><h2>Tổng quan tuần so sánh</h2><div className="profile-week-tabs"><div className="profile-week-picker-anchor"><button type="button" onClick={() => setPickerOpen((open) => !open)} className={pickerOpen ? 'active' : ''}>Chọn tuần so sánh</button>{pickerOpen && <div className="profile-week-picker"><div>{availableWeeks.map((itemWeek) => <button key={itemWeek} type="button" className={tableWeeks.includes(itemWeek) ? 'selected' : ''} onClick={() => toggleWeek(itemWeek)}>Tuần {itemWeek}</button>)}</div></div>}</div></div></div>
        <div className="profile-table-wrap"><table className="profile-week-table"><thead><tr><th>Tuần</th><th>Tổng</th><th>Cộng</th><th>Trừ</th><th>Học tập</th><th>Nề nếp</th><th>Phong trào</th><th>Hạng lớp</th><th>Xếp loại</th></tr></thead><tbody>{weeklyRows.map((row) => <tr key={row.week} className={row.week === activeWeek ? 'active-week-row' : ''} onClick={() => onWeekChange(row.week)}><td>T{row.week}</td><td className={row.total >= 0 ? 'positive' : 'negative'}>{formatScore(row.total)}</td><td className="positive">{formatScore(row.positive)}</td><td className={row.negative < 0 ? 'negative' : ''}>{row.negative}</td><td>{formatScore(row.hocTap)}</td><td>{formatScore(row.neNep)}</td><td>{formatScore(row.phongTrao)}</td><td>{row.rank ? `#${row.rank}` : '-'}</td><td>{row.status}</td></tr>)}</tbody></table></div>
      </section>
      <section className="profile-card profile-history-card">
        <div className="profile-history-head"><h2>{historyTitle}</h2><div>{[['all', 'Tất cả'], ['plus', 'Cộng'], ['minus', 'Trừ'], ['HOC_TAP', 'Học tập'], ['NE_NEP', 'Nề nếp'], ['PHONG_TRAO', 'Phong trào']].map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
        <div className="profile-history-week-chips" aria-label="Chọn nhiều tuần để xem lịch sử điểm"><span>Xem lịch sử:</span>{tableWeeks.map((itemWeek) => { const selected = historyWeeksToShow.includes(itemWeek); return <button key={itemWeek} type="button" className={selected ? 'selected' : ''} aria-pressed={selected} onClick={() => toggleHistoryWeek(itemWeek)}>Tuần {itemWeek}</button>; })}</div>
        <div className="profile-table-wrap"><table><thead><tr><th>Tuần</th><th>Nội dung</th><th>Điểm</th><th>Loại</th><th>Người nhập</th><th>Thời gian</th></tr></thead><tbody>{history.length ? history.map((event) => <tr key={event.id}><td>T{event.week}</td><td>{event.title}</td><td className={event.points >= 0 ? 'positive' : 'negative'}>{formatScore(event.points)}</td><td>{categoryLabel(event.category)}</td><td>{event.createdBy || 'Google Sheets'}</td><td>{event.createdAt ? new Date(event.createdAt).toLocaleString('vi-VN') : 'Chưa rõ'}</td></tr>) : <tr><td colSpan={6}>{historyTitle} chưa có dữ liệu phù hợp.</td></tr>}</tbody></table></div>
      </section>
    </div>
  );
}

function NewProfileTab({ query, setQuery, results, onOpenStudent, onRefresh }: { query: string; setQuery: (value: string) => void; results: Student[]; onOpenStudent: (id: string) => void; onRefresh: () => void }) {
  return <div className="profile-new-page"><div className="profile-browser-bar"><button type="button" className="profile-browser-nav" title="Quay lại" disabled><ArrowLeft size={17} /></button><button type="button" className="profile-browser-nav" title="Tiến lên" disabled><ArrowRight size={17} /></button><button type="button" className="profile-browser-nav" title="Làm mới dữ liệu" onClick={onRefresh}><RotateCw size={16} /></button><label className="profile-address-bar"><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm học sinh..." /></label></div><div className="profile-new-content">{query && <div className="profile-new-results">{results.length ? results.map((student) => <button key={student.id} type="button" onClick={() => { onOpenStudent(student.id); setQuery(''); }}><span>{student.name}</span><small>Tổ {student.group}</small></button>) : <div className="profile-new-empty-result">Không tìm thấy học sinh phù hợp.</div>}</div>}</div></div>;
}

export default function ProfileApp({ userName, userEmail, requestedStudentId, requestedWeek }: ProfileAppProps) {
  const [data, setData] = useState<DataState>({ ...DEFAULT_DATA, source: 'loading' });
  const [tabs, setTabs] = useState<ProfileTab[]>([]);
  const [activeKey, setActiveKey] = useState('');
  const [week, setWeek] = useState(requestedWeek || 0);
  const [query, setQuery] = useState('');
  const [tabMenu, setTabMenu] = useState<TabContextMenu>(null);
  const [verticalTabs, setVerticalTabs] = useState(() => localStorage.getItem(VERTICAL_TABS_KEY) !== 'off');
  const refresh = async () => { setData(await loadProfileData()); };
  const closeMenu = () => setTabMenu(null);
  const openNewTab = (afterKey?: string) => { const tab: ProfileTab = { key: newTabKey(), kind: 'new', title: 'Tab mới' }; setTabs((current) => { if (!afterKey) return [...current, tab]; const index = current.findIndex((item) => item.key === afterKey); if (index < 0) return [...current, tab]; return [...current.slice(0, index + 1), tab, ...current.slice(index + 1)]; }); setActiveKey(tab.key); setQuery(''); };
  const openStudent = (id?: string, targetWeek?: number) => { if (data.source === 'loading' || !data.students.length) return; const student = id ? findStudentByIdOrName(data.students, id) : currentUserStudent(data.students, userName, userEmail); if (!student) return; const nextWeekValue = targetWeek || latestWeek(data); let nextActive = ''; setTabs((current) => { const existing = current.find((tab) => tab.kind === 'student' && normalize(tab.name) === normalize(student.name)); if (existing) { nextActive = existing.key; return current.map((tab) => tab.key === existing.key ? { ...tab, id: student.id, name: student.name, title: studentTitle(data.students, student.id) } : tab); } const activeTab = current.find((tab) => tab.key === activeKey); const nextStudentTab: ProfileTab = { key: activeTab?.kind === 'new' ? activeTab.key : `student-${student.id}-${Date.now()}`, kind: 'student', id: student.id, name: student.name, title: studentTitle(data.students, student.id) }; nextActive = nextStudentTab.key; return activeTab?.kind === 'new' ? current.map((tab) => tab.key === activeTab.key ? nextStudentTab : tab) : [...current, nextStudentTab]; }); setActiveKey(nextActive); setWeek(nextWeekValue); };
  const closeTab = (key: string) => setTabs((current) => { const index = current.findIndex((tab) => tab.key === key); const next = current.filter((tab) => tab.key !== key); if (activeKey === key) setActiveKey(next[Math.max(0, index - 1)]?.key || next[0]?.key || ''); return next; });
  const pinTab = (key: string) => setTabs((current) => { const target = current.find((tab) => tab.key === key); if (!target) return current; setActiveKey(key); return [target, ...current.filter((tab) => tab.key !== key)]; });
  const closeOtherTabs = (key: string) => { setTabs((current) => current.filter((tab) => tab.key === key)); setActiveKey(key); };
  const closeTabsBelow = (key: string) => setTabs((current) => { const index = current.findIndex((tab) => tab.key === key); return index < 0 ? current : current.slice(0, index + 1); });
  const toggleVerticalTabs = () => setVerticalTabs((current) => { const next = !current; localStorage.setItem(VERTICAL_TABS_KEY, next ? 'on' : 'off'); return next; });
  const runMenuAction = (action: () => void) => { action(); closeMenu(); };
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { if (data.source === 'loading' || !data.students.length) return; setTabs((current) => current.map((tab) => { if (tab.kind === 'new') return tab; const student = findStudentByIdOrName(data.students, tab.id, tab.name); return student ? { ...tab, id: student.id, name: student.name, title: studentTitle(data.students, student.id) } : tab; })); }, [data.source, data.students]);
  useEffect(() => { if (data.source !== 'loading' && data.students.length && !tabs.length) openStudent(requestedStudentId, requestedWeek || latestWeek(data)); }, [data.source, data.students.length]);
  useEffect(() => { if (data.source !== 'loading' && requestedStudentId) openStudent(requestedStudentId, requestedWeek || latestWeek(data)); }, [requestedStudentId, requestedWeek, data.source]);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 't') { event.preventDefault(); openNewTab(activeKey); } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r') { event.preventDefault(); void refresh(); } if (event.key === 'Escape') closeMenu(); }; const hideMenu = () => closeMenu(); window.addEventListener('keydown', handler); window.addEventListener('click', hideMenu); window.addEventListener('resize', hideMenu); return () => { window.removeEventListener('keydown', handler); window.removeEventListener('click', hideMenu); window.removeEventListener('resize', hideMenu); }; }, [data.source, data.students, activeKey]);
  const activeTab = tabs.find((tab) => tab.key === activeKey) || tabs[0];
  const activeStudent = activeTab?.kind === 'student' ? findStudentByIdOrName(data.students, activeTab.id, activeTab.name)?.id || '' : '';
  const results = alphabetStudents(data.students).filter((student) => normalize(student.name).includes(normalize(query)) || String(student.group).includes(query.trim())).slice(0, 10);
  const menuTab = tabMenu ? tabs.find((tab) => tab.key === tabMenu.key) : null;
  const menuIndex = menuTab ? tabs.findIndex((tab) => tab.key === menuTab.key) : -1;
  const hasTabsBelow = menuIndex >= 0 && menuIndex < tabs.length - 1;
  return <div className={`profile-app-shell ${verticalTabs ? 'vertical-tabs' : 'horizontal-tabs'}`} onContextMenu={(event) => event.preventDefault()}><aside className="profile-sidebar"><div className="profile-sidebar-top"><p className="profile-side-title">Tab học sinh</p><button type="button" className="profile-mini-new-tab" onClick={() => openNewTab(activeKey)} title="Mở tab mới"><Plus size={15} /></button></div><div className="profile-tabs">{tabs.map((tab) => <button key={tab.key} type="button" className={`${tab.key === activeTab?.key ? 'active' : ''} ${tab.kind === 'new' ? 'new-tab' : ''}`} onClick={() => setActiveKey(tab.key)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setActiveKey(tab.key); setTabMenu({ x: event.clientX, y: event.clientY, key: tab.key }); }}><span>{tab.title}</span><X size={13} onClick={(event) => { event.stopPropagation(); closeTab(tab.key); }} /></button>)}</div><button type="button" className="profile-new-tab-button" onClick={() => openNewTab(activeKey)}><Plus size={16} /><span>Tab mới</span><kbd>Ctrl+T</kbd></button></aside><main className="profile-main">{activeTab?.kind === 'new' ? <NewProfileTab query={query} setQuery={setQuery} results={results} onOpenStudent={openStudent} onRefresh={() => void refresh()} /> : activeStudent ? <StudentProfile data={data} studentId={activeStudent} week={week} onWeekChange={setWeek} /> : <div className="profile-empty">Bấm “Tab mới” để tìm và mở hồ sơ học sinh.</div>}</main>{tabMenu && menuTab && <div className="profile-tab-context-menu" style={{ left: tabMenu.x, top: tabMenu.y }} onClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}><button type="button" onClick={() => runMenuAction(() => openNewTab(menuTab.key))}><span>Mở tab mới</span><kbd>Ctrl+T</kbd></button><button type="button" onClick={() => runMenuAction(() => void refresh())}><span>Làm mới</span><kbd>Ctrl+R</kbd></button><button type="button" onClick={() => runMenuAction(() => pinTab(menuTab.key))}><span>Ghim tab</span></button><div className="profile-context-separator" /><button type="button" onClick={() => runMenuAction(() => closeTab(menuTab.key))}><span>Đóng tab</span></button><button type="button" disabled={tabs.length <= 1} onClick={() => runMenuAction(() => closeOtherTabs(menuTab.key))}><span>Đóng tất cả trừ tab này</span></button><button type="button" disabled={!hasTabsBelow} onClick={() => runMenuAction(() => closeTabsBelow(menuTab.key))}><span>Đóng các tab dưới tab này</span></button><div className="profile-context-separator" /><button type="button" onClick={() => runMenuAction(toggleVerticalTabs)}><span>{verticalTabs ? 'Tắt thanh tab dọc' : 'Bật thanh tab dọc'}</span></button></div>}</div>;
}

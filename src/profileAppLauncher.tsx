import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { BarChart3, BookOpen, ChevronLeft, CircleX, RefreshCcw, TrendingUp, UserRound, Users } from "lucide-react";
import { fetchScoreboardFromGas } from "./lib/gasApi";
import { categoryLabel, formatScore, getGroupStats, mockScoreEvents, mockStudents, ScoreEvent, SCORE_WEEKS, Student, summarizeStudents } from "./apps/ScoreboardApp/data/mockScoreData";

type ProfileTab = { studentId: string; title: string };
type OpenProfileDetail = { studentId?: string; week?: number };
type HistoryFilter = "all" | "plus" | "minus" | "HOC_TAP" | "NE_NEP" | "PHONG_TRAO";
type ProfileData = { students: Student[]; events: ScoreEvent[]; weeks: number[]; source: "gas" | "local" | "loading" };

const EVENT_NAME = "a3k64-open-profile";
const DEFAULT_DATA: ProfileData = { students: mockStudents, events: mockScoreEvents, weeks: SCORE_WEEKS, source: "local" };

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function isHiddenSheetTotal(event: ScoreEvent) {
  return String(event.note || "").includes("__SHEET_TOTAL__");
}

function safeTime(value: string) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
}

function dateLabel(value: string) {
  const time = safeTime(value);
  if (!time) return "Chưa rõ";
  return new Date(time).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function statusClass(status: string) {
  return status.toLowerCase().replace(/\s+/g, "-");
}

function studentIndex(students: Student[], studentId: string) {
  return Math.max(0, students.findIndex((student) => student.id === studentId));
}

function tabTitle(students: Student[], studentId: string) {
  const student = students.find((item) => item.id === studentId);
  const index = studentIndex(students, studentId) + 1;
  return `${pad2(index)} - ${student?.name || "Học sinh"}`;
}

function loadLocalData(): ProfileData {
  try {
    const events = JSON.parse(localStorage.getItem("scoreboard-local-events-v1") || "null") as ScoreEvent[] | null;
    const weeks = JSON.parse(localStorage.getItem("scoreboard-local-weeks-v1") || "null") as number[] | null;
    return { students: mockStudents, events: events?.length ? events : mockScoreEvents, weeks: weeks?.length ? weeks : SCORE_WEEKS, source: "local" };
  } catch {
    return DEFAULT_DATA;
  }
}

async function loadData(): Promise<ProfileData> {
  const remote = await fetchScoreboardFromGas();
  if (remote?.students?.length) {
    return { students: remote.students, events: remote.events, weeks: remote.weeks.length ? remote.weeks : SCORE_WEEKS, source: "gas" };
  }
  return loadLocalData();
}

function sumEvents(events: ScoreEvent[]) {
  return events.reduce((sum, event) => sum + event.points, 0);
}

function categoryScore(events: ScoreEvent[], category: ScoreEvent["category"]) {
  return sumEvents(events.filter((event) => event.category === category));
}

function buildAdvice(summary: ReturnType<typeof summarizeStudents>[number], allEvents: ScoreEvent[], groupRank: number) {
  const visibleEvents = allEvents.filter((event) => !isHiddenSheetTotal(event));
  const minusCount = visibleEvents.filter((event) => event.points < 0).length;
  const plusCount = visibleEvents.filter((event) => event.points > 0).length;
  const hocTap = categoryScore(visibleEvents, "HOC_TAP");
  const neNep = categoryScore(visibleEvents, "NE_NEP");
  const phongTrao = categoryScore(visibleEvents, "PHONG_TRAO");
  const advice = [];

  if (summary.total >= 50) advice.push("Điểm tuần đang ở mức tốt, nên duy trì nhịp học tập và nề nếp hiện tại.");
  else if (summary.total >= 0) advice.push("Kết quả đang ổn nhưng vẫn còn khoảng trống để bứt lên nhóm Tốt.");
  else advice.push("Điểm đang thấp, cần ưu tiên giảm lỗi trừ điểm trong các buổi tới.");

  if (minusCount > 0) advice.push(`Có ${minusCount} lần bị trừ điểm, nên xem lại lịch sử để xử lý đúng nguyên nhân.`);
  if (plusCount >= 3) advice.push(`Có ${plusCount} lần được cộng điểm, đây là tín hiệu tích cực cần phát huy.`);
  if (hocTap >= neNep && hocTap >= phongTrao && hocTap > 0) advice.push("Mảng học tập nổi bật hơn các nhóm điểm khác.");
  if (neNep < 0) advice.push("Nề nếp đang kéo điểm xuống, cần chú ý đồng phục, đi học đúng giờ và ý thức lớp.");
  if (phongTrao > 0) advice.push("Có đóng góp phong trào, phù hợp để tiếp tục tham gia hoạt động tập thể.");
  if (groupRank <= 3) advice.push(`Đang nằm trong top ${groupRank} của tổ, có lợi thế cạnh tranh xếp hạng.`);

  return advice.slice(0, 5);
}

function LineChart({ data }: { data: { week: number; student: number; groupAverage: number; classAverage: number }[] }) {
  const width = 760;
  const height = 230;
  const pad = 34;
  const values = data.flatMap((item) => [item.student, item.groupAverage, item.classAverage]);
  const min = Math.min(0, ...values) - 10;
  const max = Math.max(60, ...values) + 10;
  const range = Math.max(1, max - min);
  const x = (index: number) => pad + (data.length <= 1 ? 0 : (index * (width - pad * 2)) / (data.length - 1));
  const y = (value: number) => height - pad - ((value - min) * (height - pad * 2)) / range;
  const points = (key: "student" | "groupAverage" | "classAverage") => data.map((item, index) => `${x(index)},${y(item[key])}`).join(" ");

  return (
    <div className="profile-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Biểu đồ điểm theo tuần">
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="axis" />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} className="axis" />
        <polyline points={points("classAverage")} className="chart-line class-line" />
        <polyline points={points("groupAverage")} className="chart-line group-line" />
        <polyline points={points("student")} className="chart-line student-line" />
        {data.map((item, index) => (
          <g key={item.week}>
            <circle cx={x(index)} cy={y(item.student)} r="4.5" className="chart-dot" />
            <text x={x(index)} y={height - 11} textAnchor="middle" className="chart-label">T{item.week}</text>
          </g>
        ))}
      </svg>
      <div className="chart-legend"><span className="student-line" />Học sinh <span className="group-line" />TB tổ <span className="class-line" />TB lớp</div>
    </div>
  );
}

function ProfileContent({ studentId, data, week }: { studentId: string; data: ProfileData; week: number }) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const student = data.students.find((item) => item.id === studentId) || data.students[0];
  const activeWeek = data.weeks.includes(week) ? week : data.weeks[0] || 1;

  const summaries = useMemo(() => summarizeStudents(data.students, data.events, activeWeek), [data.events, data.students, activeWeek]);
  const summary = summaries.find((item) => item.id === student?.id) || summarizeStudents([student], data.events, activeWeek)[0];
  const groupMembers = summaries.filter((item) => item.group === summary.group).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "vi"));
  const groupRank = groupMembers.findIndex((item) => item.id === summary.id) + 1 || 1;
  const groupStats = getGroupStats(summaries).find((item) => item.group === summary.group);
  const allStudentEvents = data.events.filter((event) => event.studentId === summary.id && !isHiddenSheetTotal(event));
  const weekEvents = allStudentEvents.filter((event) => event.week === activeWeek);
  const history = allStudentEvents
    .filter((event) => {
      if (filter === "plus") return event.points > 0;
      if (filter === "minus") return event.points < 0;
      if (filter === "HOC_TAP" || filter === "NE_NEP" || filter === "PHONG_TRAO") return event.category === filter;
      return true;
    })
    .sort((a, b) => b.week - a.week || safeTime(b.createdAt) - safeTime(a.createdAt));
  const chartData = data.weeks.map((itemWeek) => {
    const weekSummaries = summarizeStudents(data.students, data.events, itemWeek);
    const current = weekSummaries.find((item) => item.id === summary.id);
    const group = weekSummaries.filter((item) => item.group === summary.group);
    return {
      week: itemWeek,
      student: current?.total || 0,
      groupAverage: group.length ? Math.round(group.reduce((sum, item) => sum + item.total, 0) / group.length) : 0,
      classAverage: weekSummaries.length ? Math.round(weekSummaries.reduce((sum, item) => sum + item.total, 0) / weekSummaries.length) : 0,
    };
  });
  const above = groupMembers[groupRank - 2];
  const below = groupMembers[groupRank];
  const advice = buildAdvice(summary, weekEvents, groupRank);

  return (
    <div className="profile-content">
      <section className="profile-hero">
        <div className="profile-avatar-big">{summary.avatarInitial || summary.name[0]}</div>
        <div>
          <span className="profile-eyebrow">Hồ sơ học sinh · Tuần {activeWeek}</span>
          <h1>{summary.name}</h1>
          <div className="profile-tags"><span>Tổ {summary.group}</span><span>{summary.role || "Học sinh"}</span><span className={`status-${statusClass(summary.status)}`}>{summary.status}</span></div>
        </div>
        <div className="profile-rank-card"><span>Hạng lớp</span><strong>#{summary.rank}</strong><small>Hạng tổ #{groupRank}</small></div>
      </section>

      <section className="profile-stat-grid">
        <article><span>Tổng điểm</span><strong className={summary.total >= 0 ? "score-positive" : "score-negative"}>{formatScore(summary.total)}</strong></article>
        <article><span>Điểm cộng</span><strong className="score-positive">{formatScore(summary.positive)}</strong></article>
        <article><span>Điểm trừ</span><strong className="score-negative">{summary.negative}</strong></article>
        <article><span>Số lần cộng/trừ</span><strong>{weekEvents.filter((event) => event.points > 0).length}/{weekEvents.filter((event) => event.points < 0).length}</strong></article>
        <article><span>Học tập</span><strong>{formatScore(categoryScore(weekEvents, "HOC_TAP"))}</strong></article>
        <article><span>Nề nếp</span><strong>{formatScore(categoryScore(weekEvents, "NE_NEP"))}</strong></article>
        <article><span>Phong trào</span><strong>{formatScore(categoryScore(weekEvents, "PHONG_TRAO"))}</strong></article>
        <article><span>TB tổ</span><strong>{groupStats?.average ?? 0}</strong></article>
      </section>

      <section className="profile-grid-two">
        <div className="profile-card wide">
          <div className="profile-card-head"><BarChart3 size={18} /><div><h2>Biểu đồ tiến bộ</h2><p>So sánh điểm cá nhân với trung bình tổ và lớp.</p></div></div>
          <LineChart data={chartData} />
        </div>
        <div className="profile-card">
          <div className="profile-card-head"><TrendingUp size={18} /><div><h2>So sánh trong tổ</h2><p>Khoảng cách với các vị trí lân cận.</p></div></div>
          <div className="compare-stack">
            <div><span>Xếp hạng tổ</span><strong>#{groupRank}/{groupMembers.length || 1}</strong></div>
            <div><span>Cách người trên</span><strong>{above ? `${Math.max(0, above.total - summary.total)} điểm` : "Đang dẫn đầu"}</strong></div>
            <div><span>Cách người dưới</span><strong>{below ? `${Math.max(0, summary.total - below.total)} điểm` : "Cuối nhóm"}</strong></div>
            <div><span>So với TB tổ</span><strong>{formatScore(summary.total - (groupStats?.average || 0))}</strong></div>
          </div>
        </div>
      </section>

      <section className="profile-grid-two">
        <div className="profile-card">
          <div className="profile-card-head"><BookOpen size={18} /><div><h2>Nhận xét tự động</h2><p>Tổng hợp theo điểm tuần hiện tại.</p></div></div>
          <ul className="advice-list">{advice.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
        <div className="profile-card">
          <div className="profile-card-head"><Users size={18} /><div><h2>Thông tin nhanh</h2><p>Dữ liệu nhận diện trong hệ thống.</p></div></div>
          <div className="info-list"><span>STT</span><strong>{pad2(studentIndex(data.students, summary.id) + 1)}</strong><span>Mã học sinh</span><strong>{summary.id}</strong><span>Chức vụ</span><strong>{summary.role || "Học sinh"}</strong><span>Nguồn dữ liệu</span><strong>{data.source === "gas" ? "Google Sheets" : "Cục bộ"}</strong></div>
        </div>
      </section>

      <section className="profile-card history-card">
        <div className="profile-card-head"><BookOpen size={18} /><div><h2>Lịch sử điểm</h2><p>Toàn bộ điểm cộng/trừ đã ghi nhận của học sinh.</p></div></div>
        <div className="history-filter">
          {[
            ["all", "Tất cả"], ["plus", "Điểm cộng"], ["minus", "Điểm trừ"], ["HOC_TAP", "Học tập"], ["NE_NEP", "Nề nếp"], ["PHONG_TRAO", "Phong trào"],
          ].map(([value, label]) => <button key={value} type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value as HistoryFilter)}>{label}</button>)}
        </div>
        <div className="history-table-wrap">
          <table className="history-table"><thead><tr><th>Tuần</th><th>Nội dung</th><th>Điểm</th><th>Loại</th><th>Người nhập</th><th>Thời gian</th></tr></thead><tbody>{history.length ? history.map((event) => <tr key={event.id}><td>T{event.week}</td><td>{event.title}</td><td className={event.points >= 0 ? "score-positive" : "score-negative"}>{formatScore(event.points)}</td><td>{categoryLabel(event.category)}</td><td>{event.createdBy || "Google Sheets"}</td><td>{dateLabel(event.createdAt)}</td></tr>) : <tr><td colSpan={6} className="empty-history">Chưa có dữ liệu điểm phù hợp bộ lọc.</td></tr>}</tbody></table>
        </div>
      </section>
    </div>
  );
}

function ProfileLauncher() {
  const [open, setOpen] = useState(false);
  const [tabs, setTabs] = useState<ProfileTab[]>([]);
  const [activeId, setActiveId] = useState("");
  const [week, setWeek] = useState(1);
  const [data, setData] = useState<ProfileData>({ ...DEFAULT_DATA, source: "loading" });
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try { setData(await loadData()); } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<OpenProfileDetail>).detail || {};
      if (!detail.studentId) return;
      const studentId = detail.studentId;
      const nextTitle = tabTitle(data.students, studentId);
      setTabs((current) => {
        const exists = current.some((item) => item.studentId === studentId);
        return exists ? current.map((item) => item.studentId === studentId ? { ...item, title: nextTitle } : item) : [...current, { studentId, title: nextTitle }];
      });
      setActiveId(studentId);
      setWeek(detail.week || week || 1);
      setOpen(true);
      if (data.source === "loading" || !data.students.length) void refresh();
    };
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, [data.source, data.students, week]);

  useEffect(() => {
    setTabs((current) => current.map((item) => ({ ...item, title: tabTitle(data.students, item.studentId) })));
  }, [data.students]);

  const activeStudent = activeId && data.students.some((item) => item.id === activeId) ? activeId : tabs[0]?.studentId || "";
  const closeTab = (studentId: string) => {
    setTabs((current) => {
      const next = current.filter((item) => item.studentId !== studentId);
      if (activeId === studentId) setActiveId(next[next.length - 1]?.studentId || "");
      if (!next.length) setOpen(false);
      return next;
    });
  };

  if (!open || !tabs.length) return null;

  return (
    <div className="profile-overlay-root">
      <style>{profileCss}</style>
      <section className="profile-window" style={{ "--profile-accent": getComputedStyle(document.documentElement).getPropertyValue("--desktop-accent") || "#2563eb" } as React.CSSProperties}>
        <header className="profile-window-titlebar">
          <div className="profile-title"><UserRound size={18} /><strong>Profile</strong><span>Hồ sơ học sinh</span></div>
          <div className="profile-window-actions"><button type="button" onClick={() => void refresh()} disabled={loading} title="Làm mới"><RefreshCcw size={16} /></button><button type="button" className="close" onClick={() => setOpen(false)} title="Đóng"><CircleX size={17} /></button></div>
        </header>
        <div className="profile-body">
          <aside className="profile-tabs">
            <div className="profile-tabs-head"><ChevronLeft size={16} /><span>Tab học sinh</span></div>
            {tabs.map((tab) => <button key={tab.studentId} type="button" className={tab.studentId === activeStudent ? "active" : ""} onClick={() => setActiveId(tab.studentId)}><span>{tab.title}</span><em onClick={(event) => { event.stopPropagation(); closeTab(tab.studentId); }}>×</em></button>)}
          </aside>
          <main className="profile-main">{activeStudent ? <ProfileContent studentId={activeStudent} data={data} week={week} /> : <div className="profile-empty">Chọn một học sinh để xem hồ sơ.</div>}</main>
        </div>
      </section>
    </div>
  );
}

const profileCss = `
.profile-overlay-root{position:fixed;inset:0;z-index:4200;pointer-events:none}.profile-window{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(1180px,calc(100vw - 40px));height:min(760px,calc(100vh - 92px));border:1px solid rgba(148,163,184,.26);border-radius:24px;overflow:hidden;background:#0b1220;color:#f8fafc;box-shadow:0 34px 120px rgba(0,0,0,.55);pointer-events:auto;font-family:"Segoe UI",system-ui,Arial,sans-serif}.profile-window-titlebar{height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 12px 0 16px;border-bottom:1px solid rgba(148,163,184,.18);background:#0f172a}.profile-title{display:flex;align-items:center;gap:10px}.profile-title span{color:#94a3b8;font-size:12px}.profile-window-actions{display:flex;gap:8px}.profile-window-actions button{width:34px;height:34px;border:1px solid rgba(148,163,184,.2);border-radius:11px;display:grid;place-items:center;color:#e2e8f0;background:#111827;cursor:pointer}.profile-window-actions .close{color:#fecaca;background:#351217}.profile-body{height:calc(100% - 48px);display:grid;grid-template-columns:235px 1fr;min-height:0}.profile-tabs{border-right:1px solid rgba(148,163,184,.18);background:#050914;padding:12px;overflow:auto}.profile-tabs-head{display:flex;align-items:center;gap:8px;color:#94a3b8;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px}.profile-tabs button{width:100%;min-height:42px;border:0;border-radius:13px;margin-bottom:7px;display:grid;grid-template-columns:1fr 22px;align-items:center;gap:8px;color:#cbd5e1;background:transparent;text-align:left;cursor:pointer}.profile-tabs button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:800}.profile-tabs button em{font-style:normal;text-align:center;color:#94a3b8}.profile-tabs button.active,.profile-tabs button:hover{background:#111827;color:#fff}.profile-tabs button.active{box-shadow:inset 3px 0 0 var(--profile-accent,#2563eb)}.profile-main{min-width:0;overflow:auto;background:#07111f}.profile-content{padding:18px;display:grid;gap:14px}.profile-hero{display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:center;border:1px solid rgba(148,163,184,.18);border-radius:22px;padding:16px;background:linear-gradient(135deg,rgba(37,99,235,.18),rgba(15,23,42,.96))}.profile-avatar-big{width:74px;height:74px;border-radius:24px;display:grid;place-items:center;background:linear-gradient(135deg,var(--profile-accent,#2563eb),#7c3aed);font-size:28px;font-weight:950}.profile-eyebrow{color:#93c5fd;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.profile-hero h1{margin:5px 0 8px;font-size:30px;letter-spacing:-.04em}.profile-tags{display:flex;gap:8px;flex-wrap:wrap}.profile-tags span,.profile-rank-card{border:1px solid rgba(148,163,184,.2);border-radius:999px;padding:6px 10px;background:#111827;font-size:12px;font-weight:900}.profile-rank-card{border-radius:18px;display:grid;text-align:center;min-width:110px}.profile-rank-card strong{font-size:28px}.profile-rank-card span,.profile-rank-card small{color:#94a3b8}.profile-stat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.profile-stat-grid article,.profile-card{border:1px solid rgba(148,163,184,.18);border-radius:18px;background:#0f172a;padding:14px}.profile-stat-grid span{display:block;color:#94a3b8;font-size:12px;font-weight:800}.profile-stat-grid strong{display:block;margin-top:5px;font-size:22px}.score-positive{color:#00d69b}.score-negative{color:#fb7185}.profile-grid-two{display:grid;grid-template-columns:1.45fr .9fr;gap:14px}.profile-card-head{display:flex;gap:10px;align-items:flex-start;margin-bottom:12px}.profile-card-head h2{margin:0;font-size:17px}.profile-card-head p{margin:3px 0 0;color:#94a3b8;font-size:12px}.profile-chart-wrap{overflow:hidden}.profile-chart-wrap svg{width:100%;height:230px}.axis{stroke:#334155;stroke-width:1}.chart-line{fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.student-line{stroke:#38bdf8;background:#38bdf8}.group-line{stroke:#a78bfa;background:#a78bfa}.class-line{stroke:#64748b;background:#64748b}.chart-dot{fill:#38bdf8;stroke:#0f172a;stroke-width:2}.chart-label{fill:#94a3b8;font-size:12px;font-weight:800}.chart-legend{display:flex;align-items:center;gap:8px;color:#94a3b8;font-size:12px;font-weight:800}.chart-legend span{width:18px;height:3px;border-radius:999px;display:inline-block}.compare-stack,.info-list{display:grid;gap:8px}.compare-stack div,.info-list{grid-template-columns:1fr auto}.compare-stack div,.info-list{display:grid}.compare-stack div{padding:10px;border-radius:13px;background:#111827}.compare-stack span,.info-list span{color:#94a3b8;font-size:12px}.compare-stack strong,.info-list strong{text-align:right}.advice-list{margin:0;padding-left:18px;color:#dbeafe;line-height:1.6}.history-card{min-width:0}.history-filter{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.history-filter button{border:1px solid rgba(148,163,184,.22);border-radius:999px;padding:7px 11px;color:#cbd5e1;background:#111827;cursor:pointer;font-weight:800}.history-filter button.active{color:#fff;background:var(--profile-accent,#2563eb);border-color:transparent}.history-table-wrap{overflow:auto;border-radius:14px;border:1px solid rgba(148,163,184,.14)}.history-table{width:100%;border-collapse:collapse;min-width:760px}.history-table th,.history-table td{padding:10px 12px;border-bottom:1px solid rgba(148,163,184,.12);text-align:left;font-size:13px}.history-table th{color:#94a3b8;background:#111827;text-transform:uppercase;font-size:11px;letter-spacing:.06em}.empty-history{text-align:center!important;color:#94a3b8;padding:22px!important}.status-tốt{color:#bbf7d0!important}.status-khá{color:#fde68a!important}.status-đạt{color:#fed7aa!important}.status-chưa-đạt{color:#fecaca!important}@media(max-width:860px){.profile-window{width:calc(100vw - 16px);height:calc(100vh - 72px)}.profile-body{grid-template-columns:1fr}.profile-tabs{display:flex;gap:8px;overflow:auto;border-right:0;border-bottom:1px solid rgba(148,163,184,.18)}.profile-tabs-head{display:none}.profile-tabs button{min-width:190px}.profile-hero{grid-template-columns:1fr}.profile-stat-grid,.profile-grid-two{grid-template-columns:1fr}}`;

const mount = document.createElement("div");
mount.id = "a3k64-profile-root";
document.body.appendChild(mount);
ReactDOM.createRoot(mount).render(<ProfileLauncher />);

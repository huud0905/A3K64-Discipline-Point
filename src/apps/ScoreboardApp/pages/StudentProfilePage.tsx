import { CalendarClock, UserRound } from "lucide-react";
import { categoryLabel, formatScore, ScoreEvent, SCORE_WEEKS, Student, StudentScoreSummary, summarizeStudents } from "../data/mockScoreData";

function getStudentInitial(name: string, avatarInitial?: string) {
  if (avatarInitial) return avatarInitial;
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1]?.[0] || name[0] || "?").toUpperCase();
}

type StudentProfilePageProps = {
  students: Student[];
  events: ScoreEvent[];
  summaries: StudentScoreSummary[];
  selectedStudentId: string;
  onSelectStudent: (studentId: string) => void;
};

export function StudentProfilePage({ students, events, summaries, selectedStudentId, onSelectStudent }: StudentProfilePageProps) {
  const current = summaries.find((student) => student.id === selectedStudentId) || summaries[0];
  const student = students.find((item) => item.id === current?.id);
  const history = events.filter((event) => event.studentId === current?.id && !String(event.note || "").includes("__SHEET_TOTAL__")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const weeklyTrend = SCORE_WEEKS.map((week) => {
    const weekSummary = summarizeStudents(students, events, week).find((item) => item.id === current?.id);
    return { week, total: weekSummary?.total || 0 };
  });

  const maxAbs = Math.max(50, ...weeklyTrend.map((item) => Math.abs(item.total)));

  if (!current || !student) return <div className="score-empty">Chưa có học sinh để hiển thị.</div>;

  return (
    <div className="score-page">
      <div className="profile-layout">
        <section className="score-panel profile-card-score">
          <label className="profile-select">
            <span>Chọn học sinh</span>
            <select value={current.id} onChange={(event) => onSelectStudent(event.target.value)}>
              {students.map((item) => <option key={item.id} value={item.id}>{item.name} · Tổ {item.group}</option>)}
            </select>
          </label>

          <div className="profile-main">
            <div className="profile-avatar-score">{getStudentInitial(student.name, student.avatarInitial)}</div>
            <div>
              <h2>{student.name}</h2>
              <p>Tổ {student.group}{student.role ? ` · ${student.role}` : ""}</p>
            </div>
          </div>

          <div className="profile-stats">
            <div><span>Tổng điểm</span><strong className={current.total >= 0 ? "score-positive" : "score-negative"}>{formatScore(current.total)}</strong></div>
            <div><span>Xếp hạng</span><strong>#{current.rank}</strong></div>
            <div><span>Xếp loại</span><strong>{current.status}</strong></div>
            <div><span>Số lần chấm</span><strong>{current.events.length}</strong></div>
          </div>
        </section>

        <section className="score-panel">
          <div className="section-heading"><CalendarClock size={18} /><strong>Biểu đồ điểm theo tuần</strong></div>
          <div className="trend-chart">
            {weeklyTrend.map((item) => {
              const height = Math.max(8, Math.round((Math.abs(item.total) / maxAbs) * 120));
              return (
                <div className="trend-column" key={item.week}>
                  <div className="trend-track">
                    <div className={item.total >= 0 ? "trend-bar positive" : "trend-bar negative"} style={{ height, transform: item.total >= 0 ? "translateY(-100%)" : "translateY(0)" }} />
                  </div>
                  <strong>W{item.week}</strong>
                  <span>{item.total}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="score-panel">
        <div className="section-heading"><UserRound size={18} /><strong>Lịch sử cộng/trừ điểm</strong></div>
        <div className="event-list full">
          {history.length === 0 ? <div className="score-empty">Học sinh này chưa có lịch sử điểm.</div> : history.map((event) => (
            <div key={event.id} className="history-row">
              <div><strong>{event.title}</strong><span>Tuần {event.week} · {categoryLabel(event.category)} · {new Date(event.createdAt).toLocaleString("vi-VN")}</span></div>
              <span className={event.points >= 0 ? "score-positive" : "score-negative"}>{formatScore(event.points)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

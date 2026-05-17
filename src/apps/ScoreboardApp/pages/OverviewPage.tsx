import { AlertTriangle, ArrowUp } from "lucide-react";
import { GroupStatsChart } from "../components/GroupStatsChart";
import { RankingPodium } from "../components/RankingPodium";
import { StudentTable } from "../components/StudentTable";
import { getGroupStats, StudentScoreSummary } from "../data/mockScoreData";

type OverviewPageProps = {
  summaries: StudentScoreSummary[];
  week: number;
  onOpenStudent: (studentId: string) => void;
};

export function OverviewPage({ summaries, week, onOpenStudent }: OverviewPageProps) {
  const groupStats = getGroupStats(summaries);
  const totalScore = summaries.reduce((sum, student) => sum + student.total, 0);
  const goodCount = summaries.filter((student) => student.status === "Tốt" || student.status === "Khá").length;
  const warningStudents = summaries.filter((student) => student.status === "Chưa đạt");
  const topGroup = [...groupStats].sort((a, b) => b.total - a.total)[0];
  const topStudents = summaries.slice(0, 8);
  const bottomStudents = [...summaries].sort((a, b) => a.total - b.total).slice(0, 5);

  return (
    <div className="score-page">
      <div className="score-kpi-grid">
        <article className="score-kpi">
          <span>Tổng điểm tuần {week}</span>
          <strong className={totalScore >= 0 ? "score-positive" : "score-negative"}>{totalScore > 0 ? `+${totalScore}` : totalScore}</strong>
          <small>Toàn lớp 11A3</small>
        </article>
        <article className="score-kpi">
          <span>Học sinh ổn định</span>
          <strong>{goodCount}/{summaries.length}</strong>
          <small>Tốt hoặc khá</small>
        </article>
        <article className="score-kpi">
          <span>Tổ dẫn đầu</span>
          <strong>{topGroup?.label || "Chưa có"}</strong>
          <small>{topGroup?.total || 0} điểm</small>
        </article>
        <article className="score-kpi warning">
          <span>Cần chú ý</span>
          <strong>{warningStudents.length}</strong>
          <small>Học sinh chưa đạt</small>
        </article>
      </div>

      <div className="score-grid-2">
        <RankingPodium students={summaries} onOpenStudent={onOpenStudent} />
        <GroupStatsChart summaries={summaries} />
      </div>

      <div className="score-grid-2">
        <section className="score-panel">
          <div className="section-heading">
            <ArrowUp size={18} />
            <strong>Top cá nhân</strong>
          </div>
          <StudentTable students={topStudents} compact onOpenStudent={onOpenStudent} />
        </section>

        <section className="score-panel">
          <div className="section-heading">
            <AlertTriangle size={18} />
            <strong>Cảnh báo cần xử lý</strong>
          </div>
          <div className="warning-list">
            {bottomStudents.map((student) => (
              <button key={student.id} type="button" onClick={() => onOpenStudent(student.id)}>
                <div>
                  <strong>{student.name}</strong>
                  <span>Tổ {student.group} · {student.status}</span>
                </div>
                <span className={student.total >= 0 ? "score-positive" : "score-negative"}>{student.total}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

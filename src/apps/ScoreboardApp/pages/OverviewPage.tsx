import { GroupStatsChart } from "../components/GroupStatsChart";
import { StudentTable } from "../components/StudentTable";
import { getGroupStats, StudentScoreSummary } from "../data/mockScoreData";

type OverviewPageProps = {
  summaries: StudentScoreSummary[];
  week: number;
  onOpenStudent: (studentId: string) => void;
};

export function OverviewPage({ summaries, week, onOpenStudent }: OverviewPageProps) {
  const groupStats = getGroupStats(summaries);

  return (
    <div className="score-page overview-compact-page">
      <GroupStatsChart summaries={summaries} />

      <section className="group-overview-grid" aria-label={`Bảng tổng quan tuần ${week}`}>
        {groupStats.map((group) => (
          <div className="group-overview-card" key={group.group}>
            <div className="group-overview-title">Tổ {group.group}</div>
            <StudentTable students={group.members} compact onOpenStudent={onOpenStudent} />
          </div>
        ))}
      </section>
    </div>
  );
}

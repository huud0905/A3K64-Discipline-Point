import { useMemo, useState } from "react";
import { GroupStatsChart } from "../components/GroupStatsChart";
import { StudentTable } from "../components/StudentTable";
import { getGroupStats, StudentScoreSummary } from "../data/mockScoreData";

type OverviewGroupsPageProps = {
  summaries: StudentScoreSummary[];
  week: number;
  onOpenStudent: (studentId: string) => void;
};

const DEFAULT_ORDER = [1, 2, 3, 4];

export function OverviewGroupsPage({ summaries, week, onOpenStudent }: OverviewGroupsPageProps) {
  const groupStats = getGroupStats(summaries);
  const [order, setOrder] = useState(DEFAULT_ORDER);

  const orderedGroups = useMemo(() => order.map((groupNumber) => groupStats.find((item) => item.group === groupNumber)).filter(Boolean), [groupStats, order]);

  const shift = (groupNumber: number, delta: number) => {
    setOrder((current) => {
      const next = [...current];
      const from = next.indexOf(groupNumber);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= next.length) return current;
      const temp = next[from];
      next[from] = next[to];
      next[to] = temp;
      return next;
    });
  };

  return (
    <div className="score-page overview-compact-page">
      <GroupStatsChart summaries={summaries} />

      <section className="group-overview-grid ordered-groups" aria-label={`Bảng tổng quan tuần ${week}`}>
        {orderedGroups.map((group: any, index) => (
          <div className="group-overview-card ordered-group-card" key={group.group}>
            <div className="group-overview-title movable-group-title">
              <button type="button" className="group-move-button" disabled={index === 0} onClick={() => shift(group.group, -1)}>‹</button>
              <span>Tổ {group.group}</span>
              <button type="button" className="group-move-button" disabled={index === orderedGroups.length - 1} onClick={() => shift(group.group, 1)}>›</button>
            </div>
            <StudentTable students={group.members} compact onOpenStudent={onOpenStudent} />
          </div>
        ))}
      </section>
    </div>
  );
}

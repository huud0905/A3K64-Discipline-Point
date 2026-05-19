import { Crown, Medal, Trophy } from "lucide-react";
import { formatScore, StudentScoreSummary } from "../data/mockScoreData";

type RankingPodiumProps = {
  students: StudentScoreSummary[];
  onOpenStudent?: (studentId: string) => void;
};

function getStudentInitial(name: string, avatarInitial?: string) {
  if (avatarInitial) return avatarInitial;
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1]?.[0] || name[0] || "?").toUpperCase();
}

function givenNameOf(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] || fullName;
}

function compareByScoreThenName(a: StudentScoreSummary, b: StudentScoreSummary) {
  const scoreCompare = b.total - a.total;
  if (scoreCompare) return scoreCompare;
  const givenCompare = givenNameOf(a.name).localeCompare(givenNameOf(b.name), "vi", { sensitivity: "base" });
  return givenCompare || a.name.localeCompare(b.name, "vi", { sensitivity: "base" });
}

function displayRank(index: number) {
  return index + 1;
}

export function RankingPodium({ students, onOpenStudent }: RankingPodiumProps) {
  const top = [...students].sort(compareByScoreThenName).slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);

  return (
    <section className="score-panel ranking-panel">
      <div className="section-heading">
        <span>🏆</span>
        <strong>Bảng vinh danh</strong>
      </div>

      <div className="podium-grid">
        {order.map((student) => {
          const rank = displayRank(top.findIndex((item) => item.id === student.id));
          const isFirst = rank === 1;
          const Icon = isFirst ? Crown : rank === 2 ? Medal : Trophy;

          return (
            <button
              type="button"
              key={student.id}
              className={`podium-card rank-${rank}`}
              onClick={() => onOpenStudent?.(student.id)}
              title="Mở hồ sơ học sinh"
            >
              <div className="podium-rank">
                <Icon size={18} />
                <span>#{rank}</span>
              </div>

              <div className="podium-avatar" aria-label={student.name}>
                <span>{getStudentInitial(student.name, student.avatarInitial)}</span>
              </div>

              <strong>{student.name}</strong>
              <span className={student.total >= 0 ? "score-positive" : "score-negative"}>{formatScore(student.total)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

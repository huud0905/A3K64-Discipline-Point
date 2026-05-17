import {
  ScoreEvent,
  Student,
  StudentScoreSummary,
} from "../data/mockScoreData";
import { StudentTable } from "../components/StudentTable";

type ScoringPageProps = {
  students: Student[];
  summaries: StudentScoreSummary[];
  events: ScoreEvent[];
  week: number;
  onAddScore: (event: Omit<ScoreEvent, "id" | "createdAt">) => void;
  onOpenStudent: (studentId: string) => void;
  onEditStudent: (studentId: string) => void;
};

export function ScoringPage({ summaries, week, onOpenStudent, onEditStudent }: ScoringPageProps) {
  return (
    <div className="score-page">
      <section className="score-panel">
        <div className="table-toolbar">
          <div className="section-heading">
            <strong>Bảng chấm tuần {week}</strong>
          </div>
        </div>

        <StudentTable students={summaries} onOpenStudent={onOpenStudent} onEditStudent={onEditStudent} />
      </section>
    </div>
  );
}

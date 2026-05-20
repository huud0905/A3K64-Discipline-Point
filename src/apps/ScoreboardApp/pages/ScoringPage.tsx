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
  canEditStudent?: (student: StudentScoreSummary) => boolean;
  readOnlyReason?: string;
};

export function ScoringPage({ summaries, week, onOpenStudent, onEditStudent, canEditStudent, readOnlyReason }: ScoringPageProps) {
  return (
    <div className="score-page">
      <section className="score-panel">
        <div className="table-toolbar">
          <div className="section-heading">
            <strong>Bảng chấm tuần {week}</strong>
            {readOnlyReason && <span className="score-permission-note">{readOnlyReason}</span>}
          </div>
        </div>

        <StudentTable students={summaries} onOpenStudent={onOpenStudent} onEditStudent={onEditStudent} canEditStudent={canEditStudent} />
      </section>
    </div>
  );
}

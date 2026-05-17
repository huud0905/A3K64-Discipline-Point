import { Pencil } from "lucide-react";
import { categoryLabel, formatScore, ScoreEvent, StudentScoreSummary } from "../data/mockScoreData";

type StudentTableProps = {
  title?: string;
  students: StudentScoreSummary[];
  compact?: boolean;
  onOpenStudent?: (studentId: string) => void;
  onEditStudent?: (studentId: string) => void;
};

function weekdayLabel(value: string) {
  const day = new Date(value).getDay();
  if (day === 0) return "Chủ nhật";
  return `Thứ ${day + 1}`;
}

function isHiddenSheetTotal(event: ScoreEvent) {
  return String(event.note || "").includes("__SHEET_TOTAL__");
}

function eventLine(event: ScoreEvent) {
  return `${weekdayLabel(event.createdAt)}: [${categoryLabel(event.category)}] ${event.title} (${formatScore(event.points)})`;
}

function statusClass(status: string) {
  return status.toLowerCase().replace(/\s+/g, "-");
}

export function StudentTable({ title, students, compact = false, onOpenStudent, onEditStudent }: StudentTableProps) {
  if (compact) {
    return (
      <section className="score-panel student-table-panel">
        {title && <div className="table-title">{title}</div>}
        <div className="score-table-wrap">
          <table className="score-table">
            <thead>
              <tr>
                <th>STT</th>
                <th>Học sinh</th>
                <th>Điểm</th>
                <th>Thứ</th>
                <th>XL</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student, index) => (
                <tr key={student.id}>
                  <td>{index + 1}</td>
                  <td>
                    <button type="button" className="student-name-button" onClick={() => onOpenStudent?.(student.id)}>
                      {student.name}
                    </button>
                    {student.role && <span className="student-role">{student.role}</span>}
                  </td>
                  <td className={student.total >= 0 ? "score-positive" : "score-negative"}>{formatScore(student.total)}</td>
                  <td className="rank-text">#{student.rank}</td>
                  <td>
                    <span className={`status-pill status-${statusClass(student.status)}`}>{student.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <section className="score-panel student-table-panel">
      {title && <div className="table-title">{title}</div>}
      <div className="score-table-wrap">
        <table className="score-table score-detail-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Học sinh</th>
              <th>Cộng (+)</th>
              <th>Điểm +</th>
              <th>Trừ (-)</th>
              <th>Điểm -</th>
              <th>Tổng</th>
              <th>Xếp loại</th>
              <th>Sửa</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student, index) => {
              const visibleEvents = student.events.filter((event) => !isHiddenSheetTotal(event));
              const plusEvents = visibleEvents.filter((event) => event.points > 0);
              const minusEvents = visibleEvents.filter((event) => event.points < 0);
              const visiblePositive = plusEvents.reduce((sum, event) => sum + event.points, 0);
              const visibleNegative = minusEvents.reduce((sum, event) => sum + event.points, 0);

              return (
                <tr key={student.id}>
                  <td className="table-index">{index + 1}</td>
                  <td className="student-cell">
                    <button type="button" className="student-name-button detail-name" onClick={() => onOpenStudent?.(student.id)}>
                      {student.name}
                    </button>
                    <span className="student-role">Tổ {student.group}{student.role ? ` · ${student.role}` : ""}</span>
                  </td>

                  <td>
                    <div className="event-stack">
                      {plusEvents.length ? (
                        plusEvents.map((event) => (
                          <span key={event.id} className="event-line event-plus">
                            {eventLine(event)}
                          </span>
                        ))
                      ) : (
                        <span className="muted-dash">-</span>
                      )}
                    </div>
                  </td>

                  <td className="point-cell score-positive">{visiblePositive > 0 ? formatScore(visiblePositive) : "0"}</td>

                  <td>
                    <div className="event-stack">
                      {minusEvents.length ? (
                        minusEvents.map((event) => (
                          <span key={event.id} className="event-line event-minus">
                            {eventLine(event)}
                          </span>
                        ))
                      ) : (
                        <span className="muted-dash">-</span>
                      )}
                    </div>
                  </td>

                  <td className="point-cell score-negative">{visibleNegative < 0 ? visibleNegative : "0"}</td>
                  <td className={`total-cell ${student.total >= 0 ? "score-positive" : "score-negative"}`}>{formatScore(student.total)}</td>
                  <td>
                    <span className={`status-pill status-${statusClass(student.status)}`}>{student.status}</span>
                  </td>
                  <td>
                    <button className="edit-score-button" type="button" onClick={() => onEditStudent?.(student.id)} title="Sửa điểm học sinh">
                      <Pencil size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

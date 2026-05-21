import { Pencil } from "lucide-react";
import { formatScore, ScoreEvent, StudentScoreSummary } from "../data/mockScoreData";

type StudentTableProps = {
  title?: string;
  students: StudentScoreSummary[];
  compact?: boolean;
  splitCompact?: boolean;
  onOpenStudent?: (studentId: string) => void;
  onEditStudent?: (studentId: string) => void;
  canEditStudent?: (student: StudentScoreSummary) => boolean;
  highlightStudentName?: string;
  openReadonlyStudents?: boolean;
};

function normalizeVietnameseName(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isCurrentStudent(student: StudentScoreSummary, highlightStudentName?: string) {
  if (!highlightStudentName) return false;
  return normalizeVietnameseName(student.name) === normalizeVietnameseName(highlightStudentName);
}

function rowClass(student: StudentScoreSummary, editable: boolean, highlightStudentName?: string) {
  return [!editable ? "readonly-student-row" : "", isCurrentStudent(student, highlightStudentName) ? "current-user-row" : ""]
    .filter(Boolean)
    .join(" ") || undefined;
}

function isHiddenSheetTotal(event: ScoreEvent) {
  return String(event.note || "").includes("__SHEET_TOTAL__");
}

function eventLine(event: ScoreEvent) {
  return event.title;
}

function statusClass(status: string) {
  return status.toLowerCase().replace(/\s+/g, "-");
}

function CompactTable({
  students,
  startIndex,
  onOpenStudent,
  canEditStudent,
  highlightStudentName,
  openReadonlyStudents,
}: {
  students: StudentScoreSummary[];
  startIndex: number;
  onOpenStudent?: (studentId: string) => void;
  canEditStudent?: (student: StudentScoreSummary) => boolean;
  highlightStudentName?: string;
  openReadonlyStudents?: boolean;
}) {
  return (
    <div className="score-table-wrap compact-table-wrap">
      <table className="score-table compact-score-table">
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
          {students.map((student, index) => {
            const editable = canEditStudent ? canEditStudent(student) : true;
            const canOpen = Boolean(onOpenStudent) && (openReadonlyStudents || editable);
            return (
              <tr key={student.id} className={rowClass(student, editable, highlightStudentName)}>
                <td>{startIndex + index + 1}</td>
                <td>
                  <button
                    type="button"
                    className="student-name-button"
                    onClick={() => canOpen && onOpenStudent?.(student.id)}
                    disabled={!canOpen}
                    title={canOpen ? "Mở hồ sơ học sinh" : "Bạn chỉ được xem, không có quyền sửa học sinh này"}
                  >
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function StudentTable({ title, students, compact = false, splitCompact = false, onOpenStudent, onEditStudent, canEditStudent, highlightStudentName, openReadonlyStudents = false }: StudentTableProps) {
  if (compact) {
    const shouldSplit = splitCompact || title === "Danh sách cá nhân";

    if (shouldSplit && students.length > 12) {
      const midpoint = Math.ceil(students.length / 2);
      const leftStudents = students.slice(0, midpoint);
      const rightStudents = students.slice(midpoint);

      return (
        <section className="score-panel student-table-panel compact-split-panel">
          {title && <div className="table-title">{title}</div>}
          <div className="compact-split-grid">
            <CompactTable students={leftStudents} startIndex={0} onOpenStudent={onOpenStudent} canEditStudent={canEditStudent} highlightStudentName={highlightStudentName} openReadonlyStudents={openReadonlyStudents} />
            <CompactTable students={rightStudents} startIndex={midpoint} onOpenStudent={onOpenStudent} canEditStudent={canEditStudent} highlightStudentName={highlightStudentName} openReadonlyStudents={openReadonlyStudents} />
          </div>
        </section>
      );
    }

    return (
      <section className="score-panel student-table-panel">
        {title && <div className="table-title">{title}</div>}
        <CompactTable students={students} startIndex={0} onOpenStudent={onOpenStudent} canEditStudent={canEditStudent} highlightStudentName={highlightStudentName} openReadonlyStudents={openReadonlyStudents} />
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
              const editable = canEditStudent ? canEditStudent(student) : true;
              const canOpen = Boolean(onOpenStudent) && (openReadonlyStudents || editable);
              const visibleEvents = student.events.filter((event) => !isHiddenSheetTotal(event));
              const plusEvents = visibleEvents.filter((event) => event.points > 0);
              const minusEvents = visibleEvents.filter((event) => event.points < 0);
              const visiblePositive = plusEvents.reduce((sum, event) => sum + event.points, 0);
              const visibleNegative = minusEvents.reduce((sum, event) => sum + event.points, 0);

              return (
                <tr key={student.id} className={rowClass(student, editable, highlightStudentName)}>
                  <td className="table-index">{index + 1}</td>
                  <td className="student-cell">
                    <button
                      type="button"
                      className="student-name-button detail-name"
                      onClick={() => canOpen && onOpenStudent?.(student.id)}
                      disabled={!canOpen}
                      title={canOpen ? (openReadonlyStudents ? "Mở hồ sơ học sinh" : "Mở bảng chấm học sinh") : "Bạn không có quyền sửa học sinh này"}
                    >
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
                    <button
                      className="edit-score-button"
                      type="button"
                      onClick={() => editable && onEditStudent?.(student.id)}
                      disabled={!editable || !onEditStudent}
                      title={editable ? "Sửa điểm học sinh" : "Bạn không có quyền sửa học sinh này"}
                    >
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
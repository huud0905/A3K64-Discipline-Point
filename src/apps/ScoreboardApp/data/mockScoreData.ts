export type ScoreType = "CONG" | "TRU";
export type ScoreCategory = "NE_NEP" | "HOC_TAP" | "PHONG_TRAO";

export type Student = {
  id: string;
  name: string;
  group: 1 | 2 | 3 | 4;
  role?: string;
  avatarInitial?: string;
};

export type ScoreEvent = {
  id: string;
  studentId: string;
  week: number;
  title: string;
  points: number;
  type: ScoreType;
  category: ScoreCategory;
  note?: string;
  createdBy: string;
  createdAt: string;
};

export type StudentScoreSummary = Student & {
  total: number;
  positive: number;
  negative: number;
  rank: number;
  status: "Tốt" | "Khá" | "Đạt" | "Chưa đạt";
  events: ScoreEvent[];
};

export const SCORE_WEEKS = [1];

function isSheetTotalEvent(event: ScoreEvent) {
  return String(event.note || "").includes("__SHEET_TOTAL__");
}

function getLastNameInitial(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1]?.[0] || name[0] || "?").toUpperCase();
}

export const mockStudents: Student[] = [
  { id: "s01", name: "Nguyễn Thị Hằng", group: 1 },
  { id: "s02", name: "Nguyễn Minh Thiện", group: 1 },
  { id: "s03", name: "Nguyễn Ngọc Hiếu", group: 3 },
  { id: "s04", name: "Đinh Mạnh Hữu", group: 3, role: "Lớp trưởng" },
].map((student) => ({ ...student, avatarInitial: getLastNameInitial(student.name) }));

export const mockScoreEvents: ScoreEvent[] = [];

export const quickScoreReasons = [
  { title: "Phát biểu xây dựng bài", points: 5, type: "CONG" as const, category: "HOC_TAP" as const },
  { title: "Kiểm tra bài cũ đạt 10", points: 10, type: "CONG" as const, category: "HOC_TAP" as const },
  { title: "Tổ trưởng", points: 20, type: "CONG" as const, category: "NE_NEP" as const },
  { title: "Đi học muộn", points: -50, type: "TRU" as const, category: "NE_NEP" as const },
  { title: "Không học bài cũ", points: -100, type: "TRU" as const, category: "HOC_TAP" as const },
];

export function getScoreStatus(total: number): StudentScoreSummary["status"] {
  if (total >= 50) return "Tốt";
  if (total >= 0) return "Khá";
  if (total >= -50) return "Đạt";
  return "Chưa đạt";
}

export function summarizeStudents(students: Student[], events: ScoreEvent[], week: number) {
  const summaries = students.map((student) => {
    const studentEvents = events.filter((event) => event.studentId === student.id && event.week === week);
    const visibleEvents = studentEvents.filter((event) => !isSheetTotalEvent(event));
    const total = studentEvents.reduce((sum, event) => sum + event.points, 0);
    const positive = visibleEvents.filter((event) => event.points > 0).reduce((sum, event) => sum + event.points, 0);
    const negative = visibleEvents.filter((event) => event.points < 0).reduce((sum, event) => sum + event.points, 0);

    return {
      ...student,
      total,
      positive,
      negative,
      rank: 0,
      status: getScoreStatus(total),
      events: visibleEvents,
    };
  });

  return summaries
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "vi"))
    .map((student, index) => ({ ...student, rank: index + 1 }));
}

export function getGroupStats(summaries: StudentScoreSummary[]) {
  return [1, 2, 3, 4].map((group) => {
    const members = summaries.filter((student) => student.group === group);
    const total = members.reduce((sum, student) => sum + student.total, 0);
    const average = members.length ? Math.round(total / members.length) : 0;
    const good = members.filter((student) => student.status === "Tốt" || student.status === "Khá").length;
    const warning = members.filter((student) => student.status === "Chưa đạt").length;
    return { group, label: `Tổ ${group}`, total, average, good, warning, members };
  });
}

export function formatScore(points: number) {
  return points > 0 ? `+${points}` : `${points}`;
}

export function categoryLabel(category: ScoreCategory) {
  if (category === "HOC_TAP") return "Học tập";
  if (category === "NE_NEP") return "Nề nếp";
  return "Phong trào";
}

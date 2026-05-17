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

export const SCORE_WEEKS = [37, 38, 39, 40];

function isSheetTotalEvent(event: ScoreEvent) {
  return String(event.note || "").includes("__SHEET_TOTAL__");
}

function getSheetStatusOverride(events: ScoreEvent[]) {
  const marker = events.find((event) => String(event.note || "").includes("__SHEET_TOTAL__") && String(event.note || "").includes("status="));
  const status = String(marker?.note || "").split("status=")[1]?.split(";")[0]?.trim();
  if (status === "Tốt" || status === "Khá" || status === "Đạt" || status === "Chưa đạt") return status;
  return null;
}

function getLastNameInitial(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1]?.[0] || name[0] || "?").toUpperCase();
}


const mockStudentsRaw: Student[] = [
  { id: "s01", name: "Nguyễn Thị Hằng", group: 1, avatarInitial: "H" },
  { id: "s02", name: "Nguyễn Minh Thiện", group: 1, avatarInitial: "T" },
  { id: "s03", name: "Hoàng Nguyễn Nhật Minh", group: 1, avatarInitial: "M" },
  { id: "s04", name: "Hà Minh Tâm", group: 1, avatarInitial: "T" },
  { id: "s05", name: "Lê Hoàng Đức Bảo", group: 1, avatarInitial: "B" },
  { id: "s06", name: "Trần Vân Thành", group: 1, avatarInitial: "T" },
  { id: "s07", name: "Phan Anh Đạt", group: 1, avatarInitial: "Đ" },
  { id: "s08", name: "Võ Văn Trường", group: 1, avatarInitial: "T" },
  { id: "s09", name: "Dương Trung Hiếu", group: 1, avatarInitial: "H" },
  { id: "s10", name: "Lê Văn Tấn Tài", group: 1, avatarInitial: "T" },
  { id: "s11", name: "Nguyễn Quỳnh Nhi", group: 2, role: "Lớp phó học tập", avatarInitial: "N" },
  { id: "s12", name: "Trần Gia Bảo", group: 2, avatarInitial: "B" },
  { id: "s13", name: "Lê Thảo Vy", group: 2, avatarInitial: "V" },
  { id: "s14", name: "Phạm Quốc Huy", group: 2, avatarInitial: "H" },
  { id: "s15", name: "Nguyễn Bảo Ngọc", group: 2, avatarInitial: "N" },
  { id: "s16", name: "Hoàng Anh Thư", group: 2, avatarInitial: "T" },
  { id: "s17", name: "Trần Khánh Linh", group: 2, avatarInitial: "L" },
  { id: "s18", name: "Nguyễn Minh Châu", group: 2, avatarInitial: "C" },
  { id: "s19", name: "Nguyễn Ngọc Hiếu", group: 3, avatarInitial: "H" },
  { id: "s20", name: "Đinh Mạnh Hữu", group: 3, role: "Lớp trưởng", avatarInitial: "Đ" },
  { id: "s21", name: "Phạm Thanh Tâm", group: 3, avatarInitial: "T" },
  { id: "s22", name: "Nguyễn Thị Hồng Thắm", group: 3, avatarInitial: "T" },
  { id: "s23", name: "Lê Hiền Linh", group: 3, avatarInitial: "L" },
  { id: "s24", name: "Nguyễn Hữu Trung", group: 3, avatarInitial: "T" },
  { id: "s25", name: "Phạm Tiến Sang", group: 3, avatarInitial: "S" },
  { id: "s26", name: "Ngô Việt An", group: 3, avatarInitial: "A" },
  { id: "s27", name: "Vi Kim Na", group: 3, avatarInitial: "N" },
  { id: "s28", name: "Nguyễn Thị Yến Nhi", group: 3, avatarInitial: "N" },
  { id: "s29", name: "Nguyễn Lê Công Trường", group: 4, role: "Bí thư", avatarInitial: "T" },
  { id: "s30", name: "Võ Minh Quân", group: 4, avatarInitial: "Q" },
  { id: "s31", name: "Trần Nhật Nam", group: 4, avatarInitial: "N" },
  { id: "s32", name: "Lê Quang Hưng", group: 4, avatarInitial: "H" },
];

export const mockStudents: Student[] = mockStudentsRaw.map((student) => ({
  ...student,
  avatarInitial: getLastNameInitial(student.name),
}));

export const mockScoreEvents: ScoreEvent[] = [
  { id: "e01", studentId: "s20", week: 37, title: "Tổ chức lớp ổn định", points: 30, type: "CONG", category: "NE_NEP", createdBy: "GVCN", createdAt: "2026-05-13T08:00:00" },
  { id: "e02", studentId: "s20", week: 37, title: "Phát biểu xây dựng bài", points: 50, type: "CONG", category: "HOC_TAP", createdBy: "GVCN", createdAt: "2026-05-13T09:20:00" },
  { id: "e03", studentId: "s11", week: 37, title: "Kiểm tra bài cũ đạt 10", points: 50, type: "CONG", category: "HOC_TAP", createdBy: "GVCN", createdAt: "2026-05-13T10:00:00" },
  { id: "e04", studentId: "s11", week: 37, title: "Hỗ trợ bạn học tập", points: 40, type: "CONG", category: "HOC_TAP", createdBy: "Lớp trưởng", createdAt: "2026-05-14T08:35:00" },
  { id: "e05", studentId: "s29", week: 37, title: "Tham gia phong trào", points: 80, type: "CONG", category: "PHONG_TRAO", createdBy: "Bí thư", createdAt: "2026-05-14T15:00:00" },
  { id: "e06", studentId: "s01", week: 37, title: "Không học bài cũ", points: -120, type: "TRU", category: "HOC_TAP", createdBy: "GVCN", createdAt: "2026-05-15T07:10:00" },
  { id: "e07", studentId: "s02", week: 37, title: "Đi học muộn", points: -150, type: "TRU", category: "NE_NEP", createdBy: "Lớp trưởng", createdAt: "2026-05-15T07:15:00" },
  { id: "e08", studentId: "s03", week: 37, title: "Thiếu đồng phục", points: -130, type: "TRU", category: "NE_NEP", createdBy: "Lớp trưởng", createdAt: "2026-05-15T07:20:00" },
  { id: "e09", studentId: "s06", week: 37, title: "Không làm bài tập", points: -130, type: "TRU", category: "HOC_TAP", createdBy: "GVCN", createdAt: "2026-05-15T08:45:00" },
  { id: "e10", studentId: "s07", week: 37, title: "Mất trật tự trong giờ học", points: -150, type: "TRU", category: "NE_NEP", createdBy: "GVCN", createdAt: "2026-05-15T09:00:00" },
  { id: "e11", studentId: "s08", week: 37, title: "Vi phạm nội quy lớp", points: -550, type: "TRU", category: "NE_NEP", createdBy: "GVCN", createdAt: "2026-05-15T09:10:00" },
  { id: "e12", studentId: "s19", week: 37, title: "Phát biểu xây dựng bài", points: 50, type: "CONG", category: "HOC_TAP", createdBy: "GVCN", createdAt: "2026-05-15T10:10:00" },
  { id: "e13", studentId: "s21", week: 37, title: "Không học bài cũ", points: -150, type: "TRU", category: "HOC_TAP", createdBy: "GVCN", createdAt: "2026-05-15T10:35:00" },
  { id: "e14", studentId: "s23", week: 37, title: "Không làm bài tập", points: -130, type: "TRU", category: "HOC_TAP", createdBy: "GVCN", createdAt: "2026-05-16T07:35:00" },
  { id: "e15", studentId: "s24", week: 37, title: "Đi học muộn", points: -150, type: "TRU", category: "NE_NEP", createdBy: "Lớp trưởng", createdAt: "2026-05-16T07:40:00" },
  { id: "e16", studentId: "s25", week: 37, title: "Vi phạm nội quy lớp", points: -350, type: "TRU", category: "NE_NEP", createdBy: "GVCN", createdAt: "2026-05-16T08:20:00" },
  { id: "e17", studentId: "s26", week: 37, title: "Phát biểu xây dựng bài", points: 50, type: "CONG", category: "HOC_TAP", createdBy: "GVCN", createdAt: "2026-05-16T09:00:00" },
  { id: "e18", studentId: "s27", week: 37, title: "Kiểm tra bài cũ đạt 10", points: 50, type: "CONG", category: "HOC_TAP", createdBy: "GVCN", createdAt: "2026-05-16T09:10:00" },
  { id: "e19", studentId: "s28", week: 37, title: "Phát biểu xây dựng bài", points: 50, type: "CONG", category: "HOC_TAP", createdBy: "GVCN", createdAt: "2026-05-16T09:20:00" },
  { id: "e20", studentId: "s29", week: 38, title: "Tham gia phong trào", points: 100, type: "CONG", category: "PHONG_TRAO", createdBy: "Bí thư", createdAt: "2026-05-20T15:00:00" },
];

export const quickScoreReasons = [
  { title: "Phát biểu xây dựng bài", points: 50, type: "CONG" as const, category: "HOC_TAP" as const },
  { title: "Kiểm tra bài cũ đạt 10", points: 50, type: "CONG" as const, category: "HOC_TAP" as const },
  { title: "Việc làm tốt cho tập thể", points: 100, type: "CONG" as const, category: "NE_NEP" as const },
  { title: "Tham gia phong trào", points: 100, type: "CONG" as const, category: "PHONG_TRAO" as const },
  { title: "Không học bài cũ", points: -100, type: "TRU" as const, category: "HOC_TAP" as const },
  { title: "Không làm bài tập", points: -100, type: "TRU" as const, category: "HOC_TAP" as const },
  { title: "Đi học muộn", points: -50, type: "TRU" as const, category: "NE_NEP" as const },
  { title: "Thiếu đồng phục", points: -50, type: "TRU" as const, category: "NE_NEP" as const },
  { title: "Mất trật tự trong giờ học", points: -100, type: "TRU" as const, category: "NE_NEP" as const },
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
    const sheetStatus = getSheetStatusOverride(studentEvents);

    return { ...student, total, positive, negative, rank: 0, status: sheetStatus || getScoreStatus(total), events: visibleEvents };
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

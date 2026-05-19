import { Camera, Download, RefreshCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WeekSelector } from "./components/WeekSelector";
import { FilterSelect } from "./components/FilterSelect";
import { GroupId, GroupMultiSelect } from "./components/GroupMultiSelect";
import { ScoreEditModal } from "./components/ScoreEditModal";
import { StudentTable } from "./components/StudentTable";
import { OverviewGroupsPage } from "./pages/OverviewGroupsPage";
import { ScoringPage } from "./pages/ScoringPage";
import { getGroupStats, mockScoreEvents, mockStudents, ScoreEvent, Student, SCORE_WEEKS, summarizeStudents } from "./data/mockScoreData";
import { createScoreEventInGas, createWeekInGas, deleteScoreEventInGas, fetchScoreboardFromGas } from "../../lib/gasApi";

type ScoreboardTab = "overview" | "scoring";
type ViewMode = "overview" | "students";
type StatusFilter = "all" | "Tốt" | "Khá" | "Đạt" | "Chưa đạt";
type SortMode = "score-desc" | "name-az";
type DataSource = "loading" | "gas" | "local" | "error";

type ScoreboardAppProps = { userRole?: string | null };

const STORAGE_KEY = "scoreboard-local-events-v1";
const WEEK_STORAGE_KEY = "scoreboard-local-weeks-v1";
const WEEK_CREATORS = ["to_truong", "lop_truong", "bi_thu", "gvcn"];

function readLocalEvents() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as ScoreEvent[]) : mockScoreEvents;
  } catch {
    return mockScoreEvents;
  }
}

function readLocalWeeks() {
  try {
    const saved = localStorage.getItem(WEEK_STORAGE_KEY);
    const weeks = saved ? (JSON.parse(saved) as number[]) : SCORE_WEEKS;
    return weeks.length ? weeks : SCORE_WEEKS;
  } catch {
    return SCORE_WEEKS;
  }
}

function givenNameOf(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] || fullName;
}

function compareByGivenName(a: { name: string }, b: { name: string }) {
  const given = givenNameOf(a.name).localeCompare(givenNameOf(b.name), "vi", { sensitivity: "base" });
  return given || a.name.localeCompare(b.name, "vi", { sensitivity: "base" });
}

function matchesGroups(group: number, selectedGroups: GroupId[]) {
  return selectedGroups.length === 0 || selectedGroups.includes(String(group) as GroupId);
}

export default function ScoreboardApp({ userRole }: ScoreboardAppProps) {
  const [activeTab, setActiveTab] = useState<ScoreboardTab>("overview");
  const [weeks, setWeeks] = useState<number[]>(readLocalWeeks);
  const [week, setWeek] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [groupFilter, setGroupFilter] = useState<GroupId[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("score-desc");
  const [students, setStudents] = useState<Student[]>([]);
  const [events, setEvents] = useState<ScoreEvent[]>([]);
  const [dataSource, setDataSource] = useState<DataSource>("loading");
  const [syncMessage, setSyncMessage] = useState("");
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [isCreatingWeek, setIsCreatingWeek] = useState(false);

  const loadScoreboardData = useCallback(async () => {
    setDataSource("loading");
    setSyncMessage("");
    const remoteData = await fetchScoreboardFromGas();

    if (!remoteData) {
      setStudents(mockStudents);
      setEvents(readLocalEvents());
      setWeeks(readLocalWeeks());
      setDataSource("local");
      setSyncMessage("Đang dùng dữ liệu cục bộ. Chưa cấu hình hoặc chưa đọc được Google Apps Script.");
      return;
    }

    const nextStudents = remoteData.students;
    const nextEvents = remoteData.events;
    const nextWeeks = remoteData.weeks.length ? remoteData.weeks : [week || 1];
    const nextWeek = nextWeeks.includes(week) ? week : nextWeeks[0] || 1;

    setStudents(nextStudents);
    setEvents(nextEvents);
    setWeeks(nextWeeks);
    setWeek(nextWeek);
    setDataSource("gas");
    setSyncMessage(!nextStudents.length ? "Không đọc được học sinh trong sheet TUẦN hiện tại." : "");
  }, [week]);

  const canCreateWeek = WEEK_CREATORS.includes(String(userRole || "lop_truong"));

  useEffect(() => { void loadScoreboardData(); }, []);
  useEffect(() => { if (dataSource !== "loading") localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); }, [dataSource, events]);
  useEffect(() => { if (dataSource !== "loading") localStorage.setItem(WEEK_STORAGE_KEY, JSON.stringify(weeks)); }, [dataSource, weeks]);

  const isOverviewMode = viewMode === "overview";
  const isScoringTab = activeTab === "scoring";
  const shownStatusFilter = isOverviewMode || isScoringTab ? "all" : statusFilter;
  const shownSortMode = isOverviewMode || isScoringTab ? "score-desc" : sortMode;

  const rawSummaries = useMemo(() => summarizeStudents(students, events, week), [events, students, week]);
  const groupFilteredRawSummaries = useMemo(() => rawSummaries.filter((student) => matchesGroups(student.group, groupFilter)), [groupFilter, rawSummaries]);

  const filteredSummaries = useMemo(() => groupFilteredRawSummaries.filter((student) => {
    const matchStatus = shownStatusFilter === "all" || student.status === shownStatusFilter;
    return matchStatus;
  }), [groupFilteredRawSummaries, shownStatusFilter]);

  const summaries = useMemo(() => {
    return [...filteredSummaries].sort((a, b) => {
      if (shownSortMode === "name-az") return compareByGivenName(a, b);
      return b.total - a.total || compareByGivenName(a, b);
    });
  }, [filteredSummaries, shownSortMode]);

  const scoringSummaries = useMemo(() => {
    const byId = new Map(groupFilteredRawSummaries.map((student) => [student.id, student]));
    return students
      .map((student) => byId.get(student.id))
      .filter((student): student is NonNullable<typeof student> => Boolean(student));
  }, [groupFilteredRawSummaries, students]);

  const groupStats = useMemo(() => getGroupStats(groupFilteredRawSummaries), [groupFilteredRawSummaries]);
  const totalScore = groupFilteredRawSummaries.reduce((sum, student) => sum + student.total, 0);
  const goodCount = groupFilteredRawSummaries.filter((student) => student.status === "Tốt" || student.status === "Khá").length;
  const warningCount = groupFilteredRawSummaries.filter((student) => student.status === "Chưa đạt").length;
  const topGroup = [...groupStats].sort((a, b) => b.average - a.average || b.total - a.total)[0];
  const editingStudent = rawSummaries.find((student) => student.id === editingStudentId) || null;

  const openStudent = (studentId: string) => setEditingStudentId(studentId);

  const deleteScore = (eventId: string) => {
    setEvents((current) => current.filter((event) => event.id !== eventId));
    if (dataSource === "gas") {
      void deleteScoreEventInGas(eventId).catch(() => {
        setSyncMessage("Không xoá được trên Google Sheets. Hãy bấm làm mới để kiểm tra lại.");
        void loadScoreboardData();
      });
    }
  };

  const addScore = (event: Omit<ScoreEvent, "id"> | Omit<ScoreEvent, "id" | "createdAt">) => {
    const eventData = event as Omit<ScoreEvent, "id"> & { createdAt?: string };
    const temporaryEvent: ScoreEvent = { ...eventData, id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`, createdAt: eventData.createdAt || new Date().toISOString() };
    setEvents((current) => [temporaryEvent, ...current]);

    if (dataSource === "gas") {
      void createScoreEventInGas(temporaryEvent)
        .then((savedEvent) => setEvents((current) => current.map((item) => (item.id === temporaryEvent.id ? savedEvent : item))))
        .catch(() => setSyncMessage("Không lưu được lên Google Sheets. Dữ liệu đang tạm nằm trên trình duyệt."));
    }
  };

  const createNewWeek = async () => {
    if (!canCreateWeek || isCreatingWeek) return;
    const nextWeek = Math.max(0, ...weeks) + 1;
    setIsCreatingWeek(true);
    try {
      if (dataSource === "gas") {
        await createWeekInGas(nextWeek);
        await loadScoreboardData();
      } else {
        setWeeks((current) => Array.from(new Set([...current, nextWeek])).sort((a, b) => a - b));
      }
      setWeek(nextWeek);
      setActiveTab("scoring");
      setSyncMessage("");
    } catch {
      setSyncMessage(`Không tạo được tuần ${nextWeek} trên Google Sheets.`);
    } finally {
      setIsCreatingWeek(false);
    }
  };

  const resetLocalData = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(WEEK_STORAGE_KEY);
    if (dataSource === "gas") { void loadScoreboardData(); return; }
    setStudents(mockStudents);
    setEvents(mockScoreEvents);
    setWeeks(SCORE_WEEKS);
    setWeek(1);
  };

  const renderOverviewContent = () => {
    if (viewMode === "students") {
      return <StudentTable title="Danh sách cá nhân" students={summaries} compact onOpenStudent={openStudent} />;
    }
    return <OverviewGroupsPage summaries={groupFilteredRawSummaries} week={week} onOpenStudent={openStudent} />;
  };

  return (
    <div className="scoreboard-app">
      <aside className="scoreboard-left-tools">
        <div className="left-tools-title"><span>Bảng điểm A3K64</span><strong>Bộ lọc</strong><small>Điều khiển bảng điểm</small></div>
        <WeekSelector week={week} weeks={weeks} onWeekChange={setWeek} viewMode={viewMode} onViewModeChange={setViewMode} viewModeDisabled={isScoringTab} canCreateWeek={canCreateWeek && !isCreatingWeek} onCreateWeek={createNewWeek} />
        {syncMessage && <div className="score-sync-warning">{syncMessage}</div>}

        <label className="score-filter"><span>Tổ</span><GroupMultiSelect value={groupFilter} onChange={setGroupFilter} /></label>
        <label className="score-filter"><span>Xếp loại</span><FilterSelect<StatusFilter> value={shownStatusFilter} options={[{ value: "all", label: "Tất cả xếp loại" }, { value: "Tốt", label: "Tốt" }, { value: "Khá", label: "Khá" }, { value: "Đạt", label: "Đạt" }, { value: "Chưa đạt", label: "Chưa đạt" }]} onChange={setStatusFilter} disabled={isOverviewMode || isScoringTab} title={isOverviewMode ? "Chỉ mở khi xem Cá nhân" : isScoringTab ? "Bảng chấm không dùng lọc xếp loại" : undefined} /></label>
        <label className="score-filter"><span>Sắp xếp</span><FilterSelect<SortMode> value={shownSortMode} options={[{ value: "score-desc", label: "Điểm cao đến thấp" }, { value: "name-az", label: "Theo tên học sinh A-Z" }]} onChange={setSortMode} disabled={isOverviewMode || isScoringTab} title={isOverviewMode ? "Chỉ mở khi xem Cá nhân" : isScoringTab ? "Bảng chấm giữ thứ tự danh sách" : undefined} /></label>

        <div className="left-mini-section"><div className="left-mini-title">Tóm tắt tuần</div><div className="mini-stat"><span>Tổng điểm</span><strong className={totalScore >= 0 ? "score-positive" : "score-negative"}>{totalScore > 0 ? `+${totalScore}` : totalScore}</strong></div><div className="mini-stat"><span>Ổn định</span><strong>{goodCount}/{groupFilteredRawSummaries.length}</strong></div><div className="mini-stat"><span>Cần chú ý</span><strong>{warningCount}</strong></div><div className="mini-stat"><span>Tổ dẫn đầu</span><strong>{topGroup?.label || "Chưa có"}</strong></div></div>
      </aside>

      <section className="scoreboard-main">
        <header className="scoreboard-header"><div><span className="app-eyebrow">Bảng chấm điểm</span><h1>System <b>A3K64</b></h1><p>Quản lý điểm thi đua, xếp hạng học tập và nề nếp theo tuần.</p></div><nav className="scoreboard-tabs two-tabs"><button className={activeTab === "overview" ? "active" : ""} type="button" onClick={() => setActiveTab("overview")}>Tổng quan</button><button className={activeTab === "scoring" ? "active" : ""} type="button" onClick={() => setActiveTab("scoring")}>Bảng chấm</button></nav></header>
        <div className="scoreboard-actionbar"><div className="toolbar-actions"><button type="button" className="toolbar-button export"><Download size={15} />Xuất Excel</button><button type="button" className="toolbar-button camera"><Camera size={15} />Chụp ảnh</button><button type="button" className="toolbar-button auto"><Sparkles size={15} />Tự tính điểm</button><button type="button" className="toolbar-button" onClick={resetLocalData}><RefreshCcw size={15} />Làm mới dữ liệu</button></div></div>
        <main className="scoreboard-content">{activeTab === "overview" && renderOverviewContent()}{activeTab === "scoring" && <ScoringPage students={students} summaries={scoringSummaries} events={events} week={week} onAddScore={addScore} onOpenStudent={openStudent} onEditStudent={setEditingStudentId} />}</main>
      </section>

      {editingStudent && <ScoreEditModal student={editingStudent} allStudents={rawSummaries} week={week} events={events} onAddScore={addScore} onDeleteScore={deleteScore} onClose={() => setEditingStudentId(null)} />}
    </div>
  );
}

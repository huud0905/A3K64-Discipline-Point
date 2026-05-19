import { Camera, Download, RefreshCcw, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
type SortMode = "score-desc" | "score-asc" | "name-az" | "name-za";
type DataSource = "loading" | "gas" | "local" | "error";
type LiveToastKind = "foreground" | "background";

type LiveToast = {
  id: string;
  kind: LiveToastKind;
  title: string;
  message: string;
  points?: number;
};

type ScoreboardAppProps = { userRole?: string | null };

const STORAGE_KEY = "scoreboard-local-events-v1";
const WEEK_STORAGE_KEY = "scoreboard-local-weeks-v1";
const WEEK_CREATORS = ["to_truong", "lop_truong", "bi_thu", "gvcn"];
const LIVE_REFRESH_MS = 7000;

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

function eventSignature(event: ScoreEvent) {
  return `${event.id}|${event.studentId}|${event.week}|${event.title}|${event.points}|${event.createdAt || ""}`;
}

function eventTime(event: ScoreEvent) {
  const time = Date.parse(event.createdAt || "");
  return Number.isFinite(time) ? time : 0;
}

function isScoreboardForeground(root: HTMLDivElement | null) {
  if (!root || typeof window === "undefined") return false;
  const win = root.closest<HTMLElement>(".win-window");
  if (!win) return document.visibilityState === "visible";
  const minimized = win.classList.contains("minimized");
  const focused = win.classList.contains("focused");
  const hidden = win.offsetParent === null;
  return document.visibilityState === "visible" && !minimized && !hidden && focused;
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
  const [createWeekConfirmOpen, setCreateWeekConfirmOpen] = useState(false);
  const [liveToasts, setLiveToasts] = useState<LiveToast[]>([]);
  const scoreboardRootRef = useRef<HTMLDivElement | null>(null);
  const eventsRef = useRef<ScoreEvent[]>([]);
  const studentsRef = useRef<Student[]>([]);
  const weeksRef = useRef<number[]>(weeks);
  const weekRef = useRef(week);
  const initializedLiveRef = useRef(false);
  const pollingRef = useRef(false);

  const showLiveToast = useCallback((toast: Omit<LiveToast, "id">) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setLiveToasts((current) => [{ ...toast, id }, ...current].slice(0, 4));
    window.setTimeout(() => {
      setLiveToasts((current) => current.filter((item) => item.id !== id));
    }, toast.kind === "foreground" ? 3600 : 5200);
  }, []);

  const applyRemoteData = useCallback((remoteData: NonNullable<Awaited<ReturnType<typeof fetchScoreboardFromGas>>>, options?: { silent?: boolean; notify?: boolean }) => {
    const nextStudents = remoteData.students;
    const nextEvents = remoteData.events;
    const previousEvents = eventsRef.current;
    const nextWeeks = remoteData.weeks.length ? remoteData.weeks : [weekRef.current || 1];
    const previousSignatures = new Set(previousEvents.map(eventSignature));
    const newEvents = nextEvents
      .filter((event) => !previousSignatures.has(eventSignature(event)))
      .sort((a, b) => eventTime(b) - eventTime(a));
    const studentMap = new Map(nextStudents.map((student) => [student.id, student.name]));
    const nextWeekValue = nextWeeks.includes(weekRef.current) ? weekRef.current : nextWeeks[0] || 1;

    setStudents(nextStudents);
    setEvents(nextEvents);
    setWeeks(nextWeeks);
    setWeek(nextWeekValue);
    setDataSource("gas");
    if (!options?.silent) setSyncMessage(!nextStudents.length ? "Không đọc được học sinh trong sheet TUẦN hiện tại." : "");

    if (options?.notify && initializedLiveRef.current && newEvents.length) {
      const event = newEvents[0];
      const studentName = studentMap.get(event.studentId) || "học sinh";
      const actor = event.createdBy || "Có người";
      const points = event.points || 0;
      const kind: LiveToastKind = isScoreboardForeground(scoreboardRootRef.current) ? "foreground" : "background";
      const pointsText = points > 0 ? `+${points}` : String(points);
      showLiveToast({
        kind,
        title: kind === "foreground" ? "Điểm vừa được cập nhật" : "Bảng điểm A3 vừa cập nhật",
        message: `${actor} vừa sửa điểm của ${studentName}: ${event.title} (${pointsText})`,
        points,
      });
    }

    initializedLiveRef.current = true;
  }, [showLiveToast]);

  const loadScoreboardData = useCallback(async () => {
    setDataSource("loading");
    setSyncMessage("");
    const remoteData = await fetchScoreboardFromGas();

    if (!remoteData) {
      const localStudents = mockStudents;
      const localEvents = readLocalEvents();
      const localWeeks = readLocalWeeks();
      setStudents(localStudents);
      setEvents(localEvents);
      setWeeks(localWeeks);
      setDataSource("local");
      setSyncMessage("Đang dùng dữ liệu cục bộ. Chưa cấu hình hoặc chưa đọc được Google Apps Script.");
      initializedLiveRef.current = true;
      return;
    }

    applyRemoteData(remoteData, { silent: false, notify: false });
  }, [applyRemoteData]);

  const canCreateWeek = WEEK_CREATORS.includes(String(userRole || "lop_truong"));
  const nextWeek = Math.max(0, ...weeks) + 1;

  useEffect(() => { void loadScoreboardData(); }, []);
  useEffect(() => { eventsRef.current = events; }, [events]);
  useEffect(() => { studentsRef.current = students; }, [students]);
  useEffect(() => { weeksRef.current = weeks; }, [weeks]);
  useEffect(() => { weekRef.current = week; }, [week]);
  useEffect(() => { if (dataSource !== "loading") localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); }, [dataSource, events]);
  useEffect(() => { if (dataSource !== "loading") localStorage.setItem(WEEK_STORAGE_KEY, JSON.stringify(weeks)); }, [dataSource, weeks]);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (pollingRef.current || dataSource !== "gas") return;
      pollingRef.current = true;
      try {
        const remoteData = await fetchScoreboardFromGas();
        if (remoteData) applyRemoteData(remoteData, { silent: true, notify: true });
      } finally {
        pollingRef.current = false;
      }
    }, LIVE_REFRESH_MS);

    return () => window.clearInterval(timer);
  }, [applyRemoteData, dataSource]);

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
      const nameCompare = compareByGivenName(a, b);
      if (shownSortMode === "name-az") return nameCompare;
      if (shownSortMode === "name-za") return -nameCompare;
      if (shownSortMode === "score-asc") return a.total - b.total || nameCompare;
      return b.total - a.total || nameCompare;
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
    setCreateWeekConfirmOpen(false);
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

  const requestCreateWeek = () => {
    if (!canCreateWeek || isCreatingWeek) return;
    setCreateWeekConfirmOpen(true);
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
    return <OverviewGroupsPage summaries={groupFilteredRawSummaries} podiumSummaries={rawSummaries} week={week} onOpenStudent={openStudent} />;
  };

  return (
    <div className="scoreboard-app" ref={scoreboardRootRef}>
      <aside className="scoreboard-left-tools">
        <div className="left-tools-title"><span>Bảng điểm A3K64</span><strong>Bộ lọc</strong><small>Điều khiển bảng điểm</small></div>
        <WeekSelector week={week} weeks={weeks} onWeekChange={setWeek} viewMode={viewMode} onViewModeChange={setViewMode} viewModeDisabled={isScoringTab} canCreateWeek={canCreateWeek && !isCreatingWeek} onCreateWeek={requestCreateWeek} />
        {syncMessage && <div className="score-sync-warning">{syncMessage}</div>}

        <label className="score-filter"><span>Tổ</span><GroupMultiSelect value={groupFilter} onChange={setGroupFilter} /></label>
        <label className="score-filter"><span>Xếp loại</span><FilterSelect<StatusFilter> value={shownStatusFilter} options={[{ value: "all", label: "Tất cả xếp loại" }, { value: "Tốt", label: "Tốt" }, { value: "Khá", label: "Khá" }, { value: "Đạt", label: "Đạt" }, { value: "Chưa đạt", label: "Chưa đạt" }]} onChange={setStatusFilter} disabled={isOverviewMode || isScoringTab} title={isOverviewMode ? "Chỉ mở khi xem Cá nhân" : isScoringTab ? "Bảng chấm không dùng lọc xếp loại" : undefined} /></label>
        <label className="score-filter"><span>Sắp xếp</span><FilterSelect<SortMode> value={shownSortMode} options={[{ value: "score-desc", label: "Điểm cao đến thấp" }, { value: "score-asc", label: "Điểm thấp đến cao" }, { value: "name-az", label: "Theo tên học sinh A-Z" }, { value: "name-za", label: "Theo tên học sinh Z-A" }]} onChange={setSortMode} disabled={isOverviewMode || isScoringTab} title={isOverviewMode ? "Chỉ mở khi xem Cá nhân" : isScoringTab ? "Bảng chấm giữ thứ tự danh sách" : undefined} /></label>

        <div className="left-mini-section"><div className="left-mini-title">Tóm tắt tuần</div><div className="mini-stat"><span>Tổng điểm</span><strong className={totalScore >= 0 ? "score-positive" : "score-negative"}>{totalScore > 0 ? `+${totalScore}` : totalScore}</strong></div><div className="mini-stat"><span>Ổn định</span><strong>{goodCount}/{groupFilteredRawSummaries.length}</strong></div><div className="mini-stat"><span>Cần chú ý</span><strong>{warningCount}</strong></div><div className="mini-stat"><span>Tổ dẫn đầu</span><strong>{topGroup?.label || "Chưa có"}</strong></div></div>
      </aside>

      <section className="scoreboard-main">
        <header className="scoreboard-header"><div><span className="app-eyebrow">Bảng chấm điểm</span><h1>System <b>A3K64</b></h1><p>Quản lý điểm thi đua, xếp hạng học tập và nề nếp theo tuần.</p></div><nav className="scoreboard-tabs two-tabs"><button className={activeTab === "overview" ? "active" : ""} type="button" onClick={() => setActiveTab("overview")}>Tổng quan</button><button className={activeTab === "scoring" ? "active" : ""} type="button" onClick={() => setActiveTab("scoring")}>Bảng chấm</button></nav></header>
        <div className="scoreboard-actionbar"><div className="toolbar-actions"><button type="button" className="toolbar-button export"><Download size={15} />Xuất Excel</button><button type="button" className="toolbar-button camera"><Camera size={15} />Chụp ảnh</button><button type="button" className="toolbar-button auto"><Sparkles size={15} />Tự tính điểm</button><button type="button" className="toolbar-button" onClick={resetLocalData}><RefreshCcw size={15} />Làm mới dữ liệu</button></div></div>
        <main className="scoreboard-content">{activeTab === "overview" && renderOverviewContent()}{activeTab === "scoring" && <ScoringPage students={students} summaries={scoringSummaries} events={events} week={week} onAddScore={addScore} onOpenStudent={openStudent} onEditStudent={setEditingStudentId} />}</main>
      </section>

      {editingStudent && <ScoreEditModal student={editingStudent} allStudents={rawSummaries} week={week} events={events} onAddScore={addScore} onDeleteScore={deleteScore} onClose={() => setEditingStudentId(null)} />}

      {createWeekConfirmOpen && (
        <div className="create-week-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="create-week-modal-title">
          <div className="create-week-modal-card">
            <button type="button" className="create-week-modal-close" onClick={() => setCreateWeekConfirmOpen(false)} disabled={isCreatingWeek} title="Đóng"><X size={18} /></button>
            <div className="create-week-modal-icon">+</div>
            <h2 id="create-week-modal-title">Tạo tuần {nextWeek}?</h2>
            <p>Hệ thống sẽ nhân bản sheet <b>TUẦN 0</b> và đổi tiêu đề thành <b>LỚP 11A3 - TUẦN {nextWeek}</b>.</p>
            <div className="create-week-modal-actions">
              <button type="button" className="create-week-cancel" onClick={() => setCreateWeekConfirmOpen(false)} disabled={isCreatingWeek}>Huỷ</button>
              <button type="button" className="create-week-confirm" onClick={() => void createNewWeek()} disabled={isCreatingWeek}>{isCreatingWeek ? "Đang tạo..." : "Tạo tuần"}</button>
            </div>
          </div>
        </div>
      )}

      {liveToasts.length > 0 && (
        <div className="score-live-toast-layer" aria-live="polite">
          {liveToasts.map((toast) => (
            <div key={toast.id} className={`score-live-toast ${toast.kind} ${toast.points !== undefined && toast.points < 0 ? "minus" : "plus"}`}>
              <div className="score-live-dot">{toast.points !== undefined && toast.points < 0 ? "−" : "+"}</div>
              <div>
                <strong>{toast.title}</strong>
                <span>{toast.message}</span>
              </div>
              <button type="button" onClick={() => setLiveToasts((current) => current.filter((item) => item.id !== toast.id))} aria-label="Đóng thông báo">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
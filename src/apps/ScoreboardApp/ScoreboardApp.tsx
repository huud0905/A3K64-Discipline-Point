import { Camera, Download, RefreshCcw, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WeekSelector } from "./components/WeekSelector";
import { FilterSelect } from "./components/FilterSelect";
import { GroupId, GroupMultiSelect } from "./components/GroupMultiSelect";
import { ScoreEditModal } from "./components/ScoreEditModal";
import { StudentTable } from "./components/StudentTable";
import { OverviewGroupsPage } from "./pages/OverviewGroupsPage";
import { ScoringPage } from "./pages/ScoringPage";
import { getGroupStats, mockScoreEvents, mockStudents, ScoreEvent, Student, SCORE_WEEKS, summarizeStudents, StudentScoreSummary } from "./data/mockScoreData";
import { createWeekInGas, fetchScoreboardFromGas, saveScoreChangesInGas, WeekSetting } from "../../lib/gasApi";

type ScoreboardTab = "overview" | "scoring";
type ViewMode = "overview" | "students";
type StatusFilter = "all" | "Tốt" | "Khá" | "Đạt" | "Chưa đạt";
type SortMode = "score-desc" | "score-asc" | "name-az" | "name-za";
type DataSource = "loading" | "gas" | "local" | "error";
type LiveToastKind = "foreground" | "background";
type LiveToast = { id: string; kind: LiveToastKind; title: string; message: string; points?: number };
type ScoreboardAppProps = { userRole?: string | null; userGroup?: number | string | null };
type ScoreChanges = { additions: Omit<ScoreEvent, "id">[]; deletions: string[] };
type ScoreSaveGuard = { additions: ScoreEvent[]; deletions: Set<string>; expiresAt: number };

const STORAGE_KEY = "scoreboard-local-events-v1";
const WEEK_STORAGE_KEY = "scoreboard-local-weeks-v1";
const SESSION_KEY = "a3k64-login-session-v1";
const FULL_ACCESS_ROLES = ["gvcn", "lop_truong", "bi_thu"];
const WEEK_CREATORS = ["to_truong", ...FULL_ACCESS_ROLES];
const LIVE_REFRESH_MS = 7000;
const FRESH_EVENT_MARGIN_MS = 2500;
const SAVE_GUARD_MS = 45000;

function readLocalEvents() { try { const saved = localStorage.getItem(STORAGE_KEY); return saved ? (JSON.parse(saved) as ScoreEvent[]) : mockScoreEvents; } catch { return mockScoreEvents; } }
function readLocalWeeks() { try { const saved = localStorage.getItem(WEEK_STORAGE_KEY); const weeks = saved ? (JSON.parse(saved) as number[]) : SCORE_WEEKS; return weeks.length ? weeks : SCORE_WEEKS; } catch { return SCORE_WEEKS; } }
function givenNameOf(fullName: string) { const parts = fullName.trim().split(/\s+/); return parts[parts.length - 1] || fullName; }
function compareByGivenName(a: { name: string }, b: { name: string }) { const given = givenNameOf(a.name).localeCompare(givenNameOf(b.name), "vi", { sensitivity: "base" }); return given || a.name.localeCompare(b.name, "vi", { sensitivity: "base" }); }
function matchesGroups(group: number, selectedGroups: GroupId[]) { return selectedGroups.length === 0 || selectedGroups.includes(String(group) as GroupId); }
function eventSignature(event: ScoreEvent) { return [event.studentId, event.week, event.title, event.points, event.type, event.category, event.note || "", event.createdBy || ""].join("|"); }
function scoreContentSignature(event: Pick<ScoreEvent, "studentId" | "week" | "title" | "points" | "type" | "category" | "note">) { return [event.studentId, event.week, event.title, event.points, event.type, event.category, event.note || ""].join("|"); }
function eventTime(event: ScoreEvent) { const time = Date.parse(event.createdAt || ""); return Number.isFinite(time) ? time : 0; }
function normalizeRole(role?: string | null) { return String(role || "hoc_sinh").trim().toLowerCase(); }
function parseGroup(value?: number | string | null) { const parsed = Number(String(value ?? "").replace(/[^0-9]/g, "")); return parsed === 1 || parsed === 2 || parsed === 3 || parsed === 4 ? parsed : null; }
function readSavedSessionUser() { try { const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null") as { user?: { group?: unknown; to?: unknown; displayName?: unknown; hoten?: unknown; name?: unknown } } | null; return session?.user || null; } catch { return null; } }
function readSavedUserGroup() { const user = readSavedSessionUser(); return parseGroup(user?.group as string | number | null) || parseGroup(user?.to as string | number | null); }
function readSavedUserName() { const user = readSavedSessionUser(); return String(user?.displayName || user?.hoten || user?.name || "").trim(); }
function isScoreboardForeground(root: HTMLDivElement | null) { if (!root || typeof window === "undefined") return false; const win = root.closest<HTMLElement>(".win-window"); if (!win) return document.visibilityState === "visible"; const minimized = win.classList.contains("minimized"); const hidden = win.offsetParent === null || getComputedStyle(win).display === "none" || getComputedStyle(win).visibility === "hidden"; return document.visibilityState === "visible" && !minimized && !hidden; }
function remoteContainsSavedChanges(remoteEvents: ScoreEvent[], guard: ScoreSaveGuard) { const signatures = new Set(remoteEvents.map(scoreContentSignature)); const addedOk = guard.additions.every((event) => signatures.has(scoreContentSignature(event))); const deletedOk = [...guard.deletions].every((id) => !remoteEvents.some((event) => event.id === id)); return addedOk && deletedOk; }
function mergeGuardedEvents(remoteEvents: ScoreEvent[], guard: ScoreSaveGuard) { const signatures = new Set(remoteEvents.map(scoreContentSignature)); const guarded = remoteEvents.filter((event) => !guard.deletions.has(event.id)); guard.additions.forEach((event) => { const signature = scoreContentSignature(event); if (!signatures.has(signature)) { guarded.unshift(event); signatures.add(signature); } }); return guarded; }

export default function ScoreboardApp({ userRole, userGroup }: ScoreboardAppProps) {
  const [activeTab, setActiveTab] = useState<ScoreboardTab>("overview");
  const [weeks, setWeeks] = useState<number[]>(readLocalWeeks);
  const [week, setWeek] = useState(1);
  const [weekSettings, setWeekSettings] = useState<WeekSetting[]>([]);
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
  const weeksRef = useRef<number[]>(weeks);
  const weekRef = useRef(week);
  const initializedLiveRef = useRef(false);
  const pollingRef = useRef(false);
  const savingRef = useRef(false);
  const seenSignaturesRef = useRef<Set<string>>(new Set());
  const liveStartedAtRef = useRef(Date.now());
  const pendingSaveGuardRef = useRef<ScoreSaveGuard | null>(null);

  const normalizedRole = normalizeRole(userRole);
  const userGroupNumber = parseGroup(userGroup) || readSavedUserGroup();
  const hasFullAccess = FULL_ACCESS_ROLES.includes(normalizedRole);
  const isGroupLeader = normalizedRole === "to_truong";
  const isStudentOnly = normalizedRole === "hoc_sinh";
  const currentWeekSetting = weekSettings.find((item) => Number(item.week) === Number(week));
  const isCurrentWeekLockedForGroupLeader = isGroupLeader && Boolean(currentWeekSetting?.locked);
  const weekLockMessage = isCurrentWeekLockedForGroupLeader ? `Tuần ${week} đã quá hạn chấm điểm${currentWeekSetting?.start || currentWeekSetting?.end ? ` (${currentWeekSetting?.start || "?"} → ${currentWeekSetting?.end || "?"})` : ""}. Chỉ khóa nút Sửa, vẫn có thể xem bảng chấm.` : "";
  const canUseScoringTab = hasFullAccess || isGroupLeader;
  const permissionNote = weekLockMessage;
  const highlightStudentName = normalizedRole === "gvcn" ? "" : readSavedUserName();
  const canCreateWeek = WEEK_CREATORS.includes(normalizedRole) && !isStudentOnly;
  const nextWeek = Math.max(0, ...weeks) + 1;

  const canEditStudent = useCallback((student: StudentScoreSummary) => {
    if (hasFullAccess) return true;
    if (isGroupLeader) return !isCurrentWeekLockedForGroupLeader && Boolean(userGroupNumber && Number(student.group) === userGroupNumber);
    return false;
  }, [hasFullAccess, isGroupLeader, isCurrentWeekLockedForGroupLeader, userGroupNumber]);

  const showLiveToast = useCallback((toast: Omit<LiveToast, "id">) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setLiveToasts((current) => [{ ...toast, id }, ...current].slice(0, 4));
    window.setTimeout(() => setLiveToasts((current) => current.filter((item) => item.id !== id)), toast.kind === "foreground" ? 3600 : 5200);
  }, []);

  const applyRemoteData = useCallback((remoteData: NonNullable<Awaited<ReturnType<typeof fetchScoreboardFromGas>>>, options?: { silent?: boolean; notify?: boolean }) => {
    const nextStudents = remoteData.students;
    const guard = pendingSaveGuardRef.current;
    let nextEvents = remoteData.events;
    if (guard) {
      if (guard.expiresAt < Date.now()) pendingSaveGuardRef.current = null;
      else if (remoteContainsSavedChanges(remoteData.events, guard)) pendingSaveGuardRef.current = null;
      else nextEvents = mergeGuardedEvents(remoteData.events, guard);
    }
    const nextWeeks = remoteData.weeks.length ? remoteData.weeks : [weekRef.current || 1];
    const seenBefore = seenSignaturesRef.current;
    const remoteSignatures = new Set(nextEvents.map(eventSignature));
    const now = Date.now();
    const newEvents = nextEvents.filter((event) => {
      const signature = eventSignature(event);
      if (seenBefore.has(signature)) return false;
      const time = eventTime(event);
      if (!time) return false;
      return time >= liveStartedAtRef.current - FRESH_EVENT_MARGIN_MS && time <= now + FRESH_EVENT_MARGIN_MS;
    }).sort((a, b) => eventTime(b) - eventTime(a));
    const studentMap = new Map(nextStudents.map((student) => [student.id, student.name]));
    const nextWeekValue = nextWeeks.includes(weekRef.current) ? weekRef.current : nextWeeks[0] || 1;
    setStudents(nextStudents);
    setEvents(nextEvents);
    setWeeks(nextWeeks);
    setWeekSettings(remoteData.weekSettings || []);
    setWeek(nextWeekValue);
    setDataSource("gas");
    if (!options?.silent) setSyncMessage(!nextStudents.length ? "Không đọc được học sinh trong sheet TUẦN hiện tại." : "");
    if (options?.notify && initializedLiveRef.current && newEvents.length && !savingRef.current) {
      const event = newEvents[0];
      const studentName = studentMap.get(event.studentId) || "học sinh";
      const actor = event.createdBy || "Có người";
      const points = event.points || 0;
      const kind: LiveToastKind = isScoreboardForeground(scoreboardRootRef.current) ? "foreground" : "background";
      const pointsText = points > 0 ? `+${points}` : String(points);
      showLiveToast({ kind, title: kind === "foreground" ? "Điểm vừa được cập nhật" : "Bảng điểm A3 vừa cập nhật", message: `${actor} vừa sửa điểm của ${studentName}: ${event.title} (${pointsText})`, points });
    }
    seenSignaturesRef.current = remoteSignatures;
    initializedLiveRef.current = true;
  }, [showLiveToast]);

  const loadScoreboardData = useCallback(async (force = false) => {
    setDataSource("loading");
    setSyncMessage("");
    const remoteData = await fetchScoreboardFromGas({ force });
    if (!remoteData) {
      const localStudents = mockStudents;
      const localEvents = readLocalEvents();
      const localWeeks = readLocalWeeks();
      setStudents(localStudents);
      setEvents(localEvents);
      setWeeks(localWeeks);
      setWeekSettings([]);
      setDataSource("local");
      setSyncMessage("Đang dùng dữ liệu cục bộ. Chưa cấu hình hoặc chưa đọc được Google Apps Script.");
      seenSignaturesRef.current = new Set(localEvents.map(eventSignature));
      liveStartedAtRef.current = Date.now();
      initializedLiveRef.current = true;
      return;
    }
    applyRemoteData(remoteData, { silent: false, notify: false });
    liveStartedAtRef.current = Date.now();
  }, [applyRemoteData]);

  useEffect(() => { void loadScoreboardData(); }, []);
  useEffect(() => { if (!canUseScoringTab && activeTab === "scoring") setActiveTab("overview"); }, [activeTab, canUseScoringTab]);
  useEffect(() => { weeksRef.current = weeks; }, [weeks]);
  useEffect(() => { weekRef.current = week; }, [week]);
  useEffect(() => { if (dataSource !== "loading") localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); }, [dataSource, events]);
  useEffect(() => { if (dataSource !== "loading") localStorage.setItem(WEEK_STORAGE_KEY, JSON.stringify(weeks)); }, [dataSource, weeks]);
  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (pollingRef.current || savingRef.current || editingStudentId || dataSource !== "gas") return;
      pollingRef.current = true;
      try {
        const remoteData = await fetchScoreboardFromGas({ force: true });
        if (remoteData) applyRemoteData(remoteData, { silent: true, notify: true });
      } finally {
        pollingRef.current = false;
      }
    }, LIVE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [applyRemoteData, dataSource, editingStudentId]);

  const isOverviewMode = viewMode === "overview";
  const isScoringTab = activeTab === "scoring";
  const shownStatusFilter = isOverviewMode || isScoringTab ? "all" : statusFilter;
  const shownSortMode = isOverviewMode || isScoringTab ? "score-desc" : sortMode;
  const rawSummaries = useMemo(() => summarizeStudents(students, events, week), [events, students, week]);
  const groupFilteredRawSummaries = useMemo(() => rawSummaries.filter((student) => matchesGroups(student.group, groupFilter)), [groupFilter, rawSummaries]);
  const filteredSummaries = useMemo(() => groupFilteredRawSummaries.filter((student) => shownStatusFilter === "all" || student.status === shownStatusFilter), [groupFilteredRawSummaries, shownStatusFilter]);
  const summaries = useMemo(() => [...filteredSummaries].sort((a, b) => {
    const nameCompare = compareByGivenName(a, b);
    if (shownSortMode === "name-az") return nameCompare;
    if (shownSortMode === "name-za") return -nameCompare;
    if (shownSortMode === "score-asc") return a.total - b.total || nameCompare;
    return b.total - a.total || nameCompare;
  }), [filteredSummaries, shownSortMode]);
  const scoringSummaries = useMemo(() => {
    const byId = new Map(groupFilteredRawSummaries.map((student) => [student.id, student]));
    return students.map((student) => byId.get(student.id)).filter((student): student is NonNullable<typeof student> => Boolean(student));
  }, [groupFilteredRawSummaries, students]);
  const groupStats = useMemo(() => getGroupStats(groupFilteredRawSummaries), [groupFilteredRawSummaries]);
  const totalScore = groupFilteredRawSummaries.reduce((sum, student) => sum + student.total, 0);
  const goodCount = groupFilteredRawSummaries.filter((student) => student.status === "Tốt" || student.status === "Khá").length;
  const warningCount = groupFilteredRawSummaries.filter((student) => student.status === "Chưa đạt").length;
  const topGroup = [...groupStats].sort((a, b) => b.average - a.average || b.total - a.total)[0];
  const editingStudent = rawSummaries.find((student) => student.id === editingStudentId) || null;
  const canEditCurrentStudent = editingStudent ? canEditStudent(editingStudent) : false;

  const openStudent = (studentId: string) => { const student = rawSummaries.find((item) => item.id === studentId); if (student && canEditStudent(student)) setEditingStudentId(studentId); };
  const editStudent = (studentId: string) => openStudent(studentId);

  const saveScoreChanges = useCallback((changes: ScoreChanges) => {
    const deletionSet = new Set(changes.deletions);
    const allowedAdditions = changes.additions.filter((event) => {
      const targetStudent = rawSummaries.find((student) => student.id === event.studentId);
      return targetStudent && canEditStudent(targetStudent);
    });
    const optimisticAdditions: ScoreEvent[] = allowedAdditions.map((event, index) => ({
      ...event,
      id: `local-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
      createdAt: event.createdAt || new Date().toISOString(),
    }));
    if (!optimisticAdditions.length && !deletionSet.size) return;
    const previousEvents = events;
    const nextEvents = [...optimisticAdditions, ...events.filter((event) => !deletionSet.has(event.id))];
    pendingSaveGuardRef.current = { additions: optimisticAdditions, deletions: deletionSet, expiresAt: Date.now() + SAVE_GUARD_MS };
    setEvents(nextEvents);
    setSyncMessage("");
    if (dataSource !== "gas") return;
    savingRef.current = true;
    void saveScoreChangesInGas({ additions: optimisticAdditions, deletions: changes.deletions }).then((remoteData) => {
      if (remoteData) applyRemoteData(remoteData, { silent: true, notify: false });
      setSyncMessage("");
      window.setTimeout(async () => {
        const fresh = await fetchScoreboardFromGas({ force: true });
        if (fresh) applyRemoteData(fresh, { silent: true, notify: false });
      }, 9500);
    }).catch((error) => {
      pendingSaveGuardRef.current = null;
      setEvents(previousEvents);
      setSyncMessage(error instanceof Error ? error.message : "Không lưu được lên Google Sheets. Đã hoàn tác thay đổi tạm.");
    }).finally(() => {
      savingRef.current = false;
    });
  }, [applyRemoteData, canEditStudent, dataSource, events, rawSummaries]);

  const addScore = (event: Omit<ScoreEvent, "id"> | Omit<ScoreEvent, "id" | "createdAt">) => saveScoreChanges({ additions: [event as Omit<ScoreEvent, "id">], deletions: [] });
  const deleteScore = (eventId: string) => saveScoreChanges({ additions: [], deletions: [eventId] });

  const createNewWeek = async () => {
    if (!canCreateWeek || isCreatingWeek) return;
    setCreateWeekConfirmOpen(false);
    setIsCreatingWeek(true);
    try {
      if (dataSource === "gas") {
        await createWeekInGas(nextWeek);
        await loadScoreboardData(true);
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
  const requestCreateWeek = () => { if (!canCreateWeek || isCreatingWeek) return; setCreateWeekConfirmOpen(true); };
  const resetLocalData = () => { pendingSaveGuardRef.current = null; localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(WEEK_STORAGE_KEY); if (dataSource === "gas") { void loadScoreboardData(true); return; } setStudents(mockStudents); setEvents(mockScoreEvents); setWeeks(SCORE_WEEKS); setWeek(1); setWeekSettings([]); seenSignaturesRef.current = new Set(mockScoreEvents.map(eventSignature)); liveStartedAtRef.current = Date.now(); };
  const overviewPermissionCheck = canUseScoringTab ? canEditStudent : undefined;
  const renderOverviewContent = () => viewMode === "students"
    ? <StudentTable title="Danh sách cá nhân" students={summaries} compact onOpenStudent={canUseScoringTab ? openStudent : undefined} canEditStudent={overviewPermissionCheck} highlightStudentName={highlightStudentName} />
    : <OverviewGroupsPage summaries={groupFilteredRawSummaries} podiumSummaries={rawSummaries} week={week} onOpenStudent={canUseScoringTab ? openStudent : () => undefined} canEditStudent={overviewPermissionCheck} highlightStudentName={highlightStudentName} />;

  return (
    <div className={`scoreboard-app role-${normalizedRole} ${isStudentOnly ? "student-readonly-mode" : ""} ${isCurrentWeekLockedForGroupLeader ? "week-locked-for-leader" : ""}`} ref={scoreboardRootRef}>
      <aside className="scoreboard-left-tools"><div className="left-tools-title"><span>Bảng điểm A3K64</span><strong>Bộ lọc</strong><small>Điều khiển bảng điểm</small></div><WeekSelector week={week} weeks={weeks} onWeekChange={setWeek} viewMode={viewMode} onViewModeChange={setViewMode} viewModeDisabled={isScoringTab} canCreateWeek={canCreateWeek && !isCreatingWeek} onCreateWeek={requestCreateWeek} />{(syncMessage || permissionNote) && <div className="score-sync-warning">{syncMessage || permissionNote}</div>}<label className="score-filter"><span>Tổ</span><GroupMultiSelect value={groupFilter} onChange={setGroupFilter} /></label><label className="score-filter"><span>Xếp loại</span><FilterSelect<StatusFilter> value={shownStatusFilter} options={[{ value: "all", label: "Tất cả xếp loại" }, { value: "Tốt", label: "Tốt" }, { value: "Khá", label: "Khá" }, { value: "Đạt", label: "Đạt" }, { value: "Chưa đạt", label: "Chưa đạt" }]} onChange={setStatusFilter} disabled={isOverviewMode || isScoringTab} title={isOverviewMode ? "Chỉ mở khi xem Cá nhân" : isScoringTab ? "Bảng chấm không dùng lọc xếp loại" : undefined} /></label><label className="score-filter"><span>Sắp xếp</span><FilterSelect<SortMode> value={shownSortMode} options={[{ value: "score-desc", label: "Điểm cao đến thấp" }, { value: "score-asc", label: "Điểm thấp đến cao" }, { value: "name-az", label: "Theo tên học sinh A-Z" }, { value: "name-za", label: "Theo tên học sinh Z-A" }]} onChange={setSortMode} disabled={isOverviewMode || isScoringTab} title={isOverviewMode ? "Chỉ mở khi xem Cá nhân" : isScoringTab ? "Bảng chấm giữ thứ tự danh sách" : undefined} /></label><div className="left-mini-section"><div className="left-mini-title">Tóm tắt tuần</div><div className="mini-stat"><span>Tổng điểm</span><strong className={totalScore >= 0 ? "score-positive" : "score-negative"}>{totalScore > 0 ? `+${totalScore}` : totalScore}</strong></div><div className="mini-stat"><span>Ổn định</span><strong>{goodCount}/{groupFilteredRawSummaries.length}</strong></div><div className="mini-stat"><span>Cần chú ý</span><strong>{warningCount}</strong></div><div className="mini-stat"><span>Tổ dẫn đầu</span><strong>{topGroup?.label || "Chưa có"}</strong></div></div></aside>
      <section className="scoreboard-main"><header className="scoreboard-header"><div><span className="app-eyebrow">Bảng chấm điểm</span><h1>System <b>A3K64</b></h1><p>Quản lý điểm thi đua, xếp hạng học tập và nề nếp theo tuần.</p></div><nav className="scoreboard-tabs two-tabs"><button className={activeTab === "overview" ? "active" : ""} type="button" onClick={() => setActiveTab("overview")}>Tổng quan</button><button className={activeTab === "scoring" ? "active" : ""} type="button" onClick={() => canUseScoringTab && setActiveTab("scoring")} disabled={!canUseScoringTab} title={!canUseScoringTab ? "Học sinh chỉ được xem tổng quan" : undefined}>Bảng chấm</button></nav></header>{!isStudentOnly && <div className="scoreboard-actionbar"><div className="toolbar-actions"><button type="button" className="toolbar-button export"><Download size={15} />Xuất Excel</button><button type="button" className="toolbar-button camera"><Camera size={15} />Chụp ảnh</button><button type="button" className="toolbar-button auto"><Sparkles size={15} />Tự tính điểm</button><button type="button" className="toolbar-button" onClick={resetLocalData}><RefreshCcw size={15} />Làm mới dữ liệu</button></div></div>}<main className="scoreboard-content">{activeTab === "overview" && renderOverviewContent()}{activeTab === "scoring" && canUseScoringTab && <ScoringPage students={students} summaries={scoringSummaries} events={events} week={week} onAddScore={addScore} onOpenStudent={openStudent} onEditStudent={editStudent} canEditStudent={canEditStudent} readOnlyReason={permissionNote} />}</main></section>
      {editingStudent && canEditCurrentStudent && <ScoreEditModal student={editingStudent} allStudents={rawSummaries} week={week} events={events} onSaveChanges={saveScoreChanges} onAddScore={addScore} onDeleteScore={deleteScore} onClose={() => setEditingStudentId(null)} />}
      {createWeekConfirmOpen && <div className="create-week-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="create-week-modal-title"><div className="create-week-modal-card"><button type="button" className="create-week-modal-close" onClick={() => setCreateWeekConfirmOpen(false)} disabled={isCreatingWeek} title="Đóng"><X size={18} /></button><div className="create-week-modal-icon">+</div><h2 id="create-week-modal-title">Tạo tuần {nextWeek}?</h2><p>Hệ thống sẽ nhân bản sheet <b>TUẦN 0</b> và đổi tiêu đề thành <b>LỚP 11A3 - TUẦN {nextWeek}</b>.</p><div className="create-week-modal-actions"><button type="button" className="create-week-cancel" onClick={() => setCreateWeekConfirmOpen(false)} disabled={isCreatingWeek}>Huỷ</button><button type="button" className="create-week-confirm" onClick={() => void createNewWeek()} disabled={isCreatingWeek}>{isCreatingWeek ? "Đang tạo..." : "Tạo tuần"}</button></div></div></div>}
      {liveToasts.length > 0 && <div className="score-live-toast-layer" aria-live="polite">{liveToasts.map((toast) => <div key={toast.id} className={`score-live-toast ${toast.kind} ${toast.points !== undefined && toast.points < 0 ? "minus" : "plus"}`}><div className="score-live-dot">{toast.points !== undefined && toast.points < 0 ? "−" : "+"}</div><div><strong>{toast.title}</strong><span>{toast.message}</span></div><button type="button" onClick={() => setLiveToasts((current) => current.filter((item) => item.id !== toast.id))} aria-label="Đóng thông báo">×</button></div>)}</div>}
    </div>
  );
}

import { Camera, Download, RefreshCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WeekSelector } from "./components/WeekSelector";
import { FilterSelect } from "./components/FilterSelect";
import { ScoreEditModal } from "./components/ScoreEditModal";
import { OverviewPage } from "./pages/OverviewPage";
import { ScoringPage } from "./pages/ScoringPage";
import { StudentProfilePage } from "./pages/StudentProfilePage";
import {
  getGroupStats,
  mockScoreEvents,
  mockStudents,
  ScoreEvent,
  Student,
  SCORE_WEEKS,
  summarizeStudents,
} from "./data/mockScoreData";
import { createScoreEventInGas, createWeekInGas, deleteScoreEventInGas, fetchScoreboardFromGas } from "../../lib/gasApi";

type ScoreboardTab = "overview" | "scoring" | "profile";
type GroupFilter = "all" | "1" | "2" | "3" | "4";
type StatusFilter = "all" | "Tốt" | "Khá" | "Đạt" | "Chưa đạt";
type SortMode = "score-desc" | "name-az";

type ScoreboardAppProps = {
  userRole?: string | null;
};

const STORAGE_KEY = "scoreboard-local-events-v1";
const WEEK_STORAGE_KEY = "scoreboard-local-weeks-v1";
const WEEK_CREATORS = ["to_truong", "lop_truong", "bi_thu", "gvcn"];
type DataSource = "loading" | "gas" | "local" | "error";

function readLocalEvents() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return mockScoreEvents;
    return JSON.parse(saved) as ScoreEvent[];
  } catch {
    return mockScoreEvents;
  }
}

function readLocalWeeks() {
  try {
    const saved = localStorage.getItem(WEEK_STORAGE_KEY);
    if (!saved) return SCORE_WEEKS;
    const weeks = JSON.parse(saved) as number[];
    return weeks.length ? weeks : SCORE_WEEKS;
  } catch {
    return SCORE_WEEKS;
  }
}

export default function ScoreboardApp({ userRole }: ScoreboardAppProps) {
  const [activeTab, setActiveTab] = useState<ScoreboardTab>("overview");
  const [weeks, setWeeks] = useState<number[]>(readLocalWeeks);
  const [week, setWeek] = useState(1);
  const [viewMode, setViewMode] = useState<"overview" | "groups" | "students">("overview");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("score-desc");
  const [students, setStudents] = useState<Student[]>([]);
  const [events, setEvents] = useState<ScoreEvent[]>([]);
  const [dataSource, setDataSource] = useState<DataSource>("loading");
  const [syncMessage, setSyncMessage] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
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
    setSelectedStudentId((current) => (nextStudents.some((student) => student.id === current) ? current : nextStudents[0]?.id || ""));
    setDataSource("gas");
    setSyncMessage(!nextStudents.length ? "Không đọc được học sinh trong sheet TUẦN hiện tại." : "");
  }, [week]);

  const canCreateWeek = WEEK_CREATORS.includes(String(userRole || "lop_truong"));

  useEffect(() => {
    void loadScoreboardData();
  }, []);

  useEffect(() => {
    if (dataSource !== "loading") localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }, [dataSource, events]);

  useEffect(() => {
    if (dataSource !== "loading") localStorage.setItem(WEEK_STORAGE_KEY, JSON.stringify(weeks));
  }, [dataSource, weeks]);

  const rawSummaries = useMemo(() => summarizeStudents(students, events, week), [events, students, week]);

  const summaries = useMemo(() => {
    const filtered = rawSummaries.filter((student) => {
      const matchGroup = groupFilter === "all" || String(student.group) === groupFilter;
      const matchStatus = statusFilter === "all" || student.status === statusFilter;
      return matchGroup && matchStatus;
    });

    return [...filtered].sort((a, b) => {
      if (sortMode === "name-az") return a.name.localeCompare(b.name, "vi");
      return b.total - a.total || a.name.localeCompare(b.name, "vi");
    });
  }, [groupFilter, rawSummaries, sortMode, statusFilter]);

  const scoringSummaries = useMemo(() => {
    const byId = new Map(rawSummaries.map((student) => [student.id, student]));
    return students
      .map((student) => byId.get(student.id))
      .filter((student): student is NonNullable<typeof student> => Boolean(student))
      .filter((student) => {
        const matchGroup = groupFilter === "all" || String(student.group) === groupFilter;
        const matchStatus = statusFilter === "all" || student.status === statusFilter;
        return matchGroup && matchStatus;
      });
  }, [groupFilter, rawSummaries, statusFilter, students]);

  const groupStats = useMemo(() => getGroupStats(rawSummaries), [rawSummaries]);
  const totalScore = rawSummaries.reduce((sum, student) => sum + student.total, 0);
  const goodCount = rawSummaries.filter((student) => student.status === "Tốt" || student.status === "Khá").length;
  const warningCount = rawSummaries.filter((student) => student.status === "Chưa đạt").length;
  const topGroup = [...groupStats].sort((a, b) => b.total - a.total)[0];
  const editingStudent = rawSummaries.find((student) => student.id === editingStudentId) || null;

  const openStudent = (studentId: string) => {
    setSelectedStudentId(studentId);
    setActiveTab("profile");
  };

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
    const temporaryEvent: ScoreEvent = {
      ...eventData,
      id: `local-${Date.now()}`,
      createdAt: eventData.createdAt || new Date().toISOString(),
    };

    setEvents((current) => [temporaryEvent, ...current]);
    setSelectedStudentId(eventData.studentId);

    if (dataSource === "gas") {
      void createScoreEventInGas(temporaryEvent)
        .then((savedEvent) => {
          setEvents((current) => current.map((item) => (item.id === temporaryEvent.id ? savedEvent : item)));
        })
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
    if (dataSource === "gas") {
      void loadScoreboardData();
      return;
    }
    setStudents(mockStudents);
    setEvents(mockScoreEvents);
    setWeeks(SCORE_WEEKS);
    setWeek(1);
  };

  return (
    <div className="scoreboard-app">
      <style>{scoreboardCss}</style>

      <aside className="scoreboard-left-tools">
        <div className="left-tools-title">
          <span>Bảng điểm A3K64</span>
          <strong>Bộ lọc</strong>
          <small>Điều khiển bảng điểm</small>
        </div>

        <WeekSelector
          week={week}
          weeks={weeks}
          onWeekChange={setWeek}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          canCreateWeek={canCreateWeek && !isCreatingWeek}
          onCreateWeek={createNewWeek}
        />

        {syncMessage && <div className="score-sync-warning">{syncMessage}</div>}

        <label className="score-filter">
          <span>Tổ</span>
          <FilterSelect<GroupFilter>
            value={groupFilter}
            options={[
              { value: "all", label: "Tất cả tổ" },
              { value: "1", label: "Tổ 1" },
              { value: "2", label: "Tổ 2" },
              { value: "3", label: "Tổ 3" },
              { value: "4", label: "Tổ 4" },
            ]}
            onChange={setGroupFilter}
          />
        </label>

        <label className="score-filter">
          <span>Xếp loại</span>
          <FilterSelect<StatusFilter>
            value={statusFilter}
            options={[
              { value: "all", label: "Tất cả xếp loại" },
              { value: "Tốt", label: "Tốt" },
              { value: "Khá", label: "Khá" },
              { value: "Đạt", label: "Đạt" },
              { value: "Chưa đạt", label: "Chưa đạt" },
            ]}
            onChange={setStatusFilter}
          />
        </label>

        <label className="score-filter">
          <span>Sắp xếp</span>
          <FilterSelect<SortMode>
            value={sortMode}
            options={[
              { value: "score-desc", label: "Điểm cao đến thấp" },
              { value: "name-az", label: "Theo tên học sinh A-Z" },
            ]}
            onChange={setSortMode}
          />
        </label>

        <div className="left-mini-section">
          <div className="left-mini-title">Tóm tắt tuần</div>
          <div className="mini-stat"><span>Tổng điểm</span><strong className={totalScore >= 0 ? "score-positive" : "score-negative"}>{totalScore > 0 ? `+${totalScore}` : totalScore}</strong></div>
          <div className="mini-stat"><span>Ổn định</span><strong>{goodCount}/{rawSummaries.length}</strong></div>
          <div className="mini-stat"><span>Cần chú ý</span><strong>{warningCount}</strong></div>
          <div className="mini-stat"><span>Tổ dẫn đầu</span><strong>{topGroup?.label || "Chưa có"}</strong></div>
        </div>
      </aside>

      <section className="scoreboard-main">
        <header className="scoreboard-header">
          <div>
            <span className="app-eyebrow">Bảng chấm điểm</span>
            <h1>System <b>A3K64</b></h1>
            <p>Quản lý điểm thi đua, xếp hạng học tập và nề nếp theo tuần.</p>
          </div>

          <nav className="scoreboard-tabs">
            <button className={activeTab === "overview" ? "active" : ""} type="button" onClick={() => setActiveTab("overview")}>Tổng quan</button>
            <button className={activeTab === "scoring" ? "active" : ""} type="button" onClick={() => setActiveTab("scoring")}>Bảng chấm</button>
            <button className={activeTab === "profile" ? "active" : ""} type="button" onClick={() => setActiveTab("profile")}>Hồ sơ học sinh</button>
          </nav>
        </header>

        <div className="scoreboard-actionbar">
          <div className="toolbar-actions">
            <button type="button" className="toolbar-button export"><Download size={16} />Xuất Excel</button>
            <button type="button" className="toolbar-button camera"><Camera size={16} />Chụp ảnh</button>
            <button type="button" className="toolbar-button auto"><Sparkles size={16} />Tự tính điểm</button>
            <button type="button" className="toolbar-button" onClick={resetLocalData}><RefreshCcw size={16} />Làm mới dữ liệu</button>
          </div>
        </div>

        <main className="scoreboard-content">
          {activeTab === "overview" && <OverviewPage summaries={summaries} week={week} onOpenStudent={openStudent} />}
          {activeTab === "scoring" && <ScoringPage students={students} summaries={scoringSummaries} events={events} week={week} onAddScore={addScore} onOpenStudent={openStudent} onEditStudent={setEditingStudentId} />}
          {activeTab === "profile" && <StudentProfilePage students={students} events={events} summaries={rawSummaries} selectedStudentId={selectedStudentId} onSelectStudent={setSelectedStudentId} />}
        </main>
      </section>

      {editingStudent && <ScoreEditModal student={editingStudent} week={week} events={events} onAddScore={addScore} onDeleteScore={deleteScore} onClose={() => setEditingStudentId(null)} />}
    </div>
  );
}

const scoreboardCss = `
  .scoreboard-app,.scoreboard-app *{-webkit-user-select:none;user-select:none;box-sizing:border-box}.scoreboard-app input,.scoreboard-app textarea{-webkit-user-select:text;user-select:text}.scoreboard-app{height:100%;min-height:0;display:grid;grid-template-columns:240px 1fr;color:#f8fafc;background:#050914;overflow:hidden}.scoreboard-left-tools{min-width:0;min-height:0;display:flex;flex-direction:column;gap:14px;padding:18px 14px;border-right:1px solid #1f2937;background:#050914;overflow:auto}.left-tools-title{display:grid;gap:4px;padding:4px 2px 6px}.left-tools-title span{color:var(--desktop-accent,#10b981);font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.left-tools-title strong{font-size:20px;font-weight:950;letter-spacing:-.04em}.left-tools-title small{color:#94a3b8;font-size:12px;line-height:1.45}.score-sync-warning{border:1px solid rgba(245,158,11,.36);border-radius:14px;padding:10px 12px;color:#fde68a;background:rgba(120,53,15,.18);font-size:12px;line-height:1.45;font-weight:750}.scoreboard-app,.scoreboard-left-tools,.scoreboard-content,.score-table-wrap{scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--desktop-accent,#10b981) 70%,#334155) #050914}.scoreboard-main{min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}.scoreboard-header{display:grid;grid-template-columns:1fr auto;align-items:end;gap:20px;padding:22px 22px 16px;border-bottom:1px solid #1f2937;background:#050914}.app-eyebrow{display:block;color:#94a3b8;font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.scoreboard-header h1{margin:22px 0 4px;font-size:30px;line-height:1;letter-spacing:-.05em}.scoreboard-header h1 b{color:var(--desktop-accent,#3b82f6)}.scoreboard-header p{margin:0;color:#94a3b8;font-size:13px}.scoreboard-tabs{display:inline-flex;gap:8px;padding:5px;border:1px solid #1f2937;border-radius:18px;background:#0b1220}.scoreboard-tabs button{height:38px;border:0;border-radius:13px;padding:0 16px;color:#94a3b8;background:transparent;font:inherit;font-weight:800;cursor:pointer}.scoreboard-tabs button.active{color:#0f172a;background:#f8fafc}.scoreboard-actionbar{display:flex;justify-content:flex-end;align-items:center;gap:10px;padding:14px 22px;border-bottom:1px solid #1f2937;background:#0b1220}.score-filter-bar,.toolbar-actions{display:grid;gap:10px}.toolbar-actions{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap}.score-filter{display:grid;gap:7px}.score-filter span{display:inline-flex;align-items:center;gap:6px;color:#cbd5e1;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.week-select-row{display:grid;grid-template-columns:1fr 38px;gap:8px}.filter-select{position:relative;width:100%}.filter-select-button{width:100%;height:38px;border:1px solid #273244;border-radius:13px;display:grid;grid-template-columns:1fr auto;align-items:center;gap:10px;padding:0 12px;color:#f8fafc;background:#111827;font:inherit;text-align:left;cursor:pointer;font-weight:900}.filter-select-button span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.filter-select-menu{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:80;overflow:hidden;border:1px solid #273244;border-radius:16px;background:#1f2937;box-shadow:0 18px 55px rgba(0,0,0,.38);padding:6px}.filter-select-option{width:100%;min-height:38px;border:0;border-radius:10px;padding:0 12px;color:#f8fafc;background:transparent;font:inherit;text-align:left;cursor:pointer;font-weight:750}.filter-select-option:hover,.filter-select-option.active{background:#374151}.create-week-button{height:38px;border:1px solid #273244;border-radius:13px;display:grid;place-items:center;color:#f8fafc;background:var(--desktop-accent,#10b981);cursor:pointer}.create-week-button:disabled{opacity:.45;cursor:not-allowed;filter:grayscale(.55)}.toolbar-button{height:38px;width:auto;min-width:118px;border:1px solid #273244;border-radius:13px;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:0 14px;color:#f8fafc;background:#111827;font:inherit;font-weight:800;cursor:pointer}.toolbar-button.export{color:#6ee7b7;border-color:#064e3b;background:#052e2b}.toolbar-button.camera{color:#93c5fd;border-color:#1d4ed8;background:#0b1e40}.toolbar-button.auto{color:#d8b4fe;border-color:#7e22ce;background:#29113f}.left-mini-section{display:grid;gap:8px;padding:12px;border:1px solid #273244;border-radius:16px;background:#0b1220}.left-mini-title{color:#f8fafc;font-size:13px;font-weight:900;letter-spacing:.02em}.mini-stat{min-height:34px;display:grid;grid-template-columns:1fr auto;align-items:center;gap:10px;padding:8px 10px;border-radius:12px;background:#111827}.mini-stat span{color:#cbd5e1;font-size:12px}.mini-stat strong{color:#f8fafc;font-size:13px;font-weight:900}.scoreboard-content{min-width:0;min-height:0;flex:1;padding:18px 22px 30px;overflow:auto}.score-page{display:grid;gap:16px}.score-kpi-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.score-kpi,.score-panel{border:1px solid #273244;border-radius:22px;background:#0b1220}.score-kpi{padding:16px}.score-kpi span,.score-kpi small{display:block;color:#94a3b8}.score-kpi strong{display:block;margin:10px 0 3px;font-size:28px;letter-spacing:-.04em}.score-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px}.section-heading,.table-title{display:flex;align-items:center;gap:9px;padding:16px 18px 10px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}.score-table-wrap{width:100%;overflow:auto}.score-table{width:100%;border-collapse:collapse;min-width:720px}.score-table th,.score-table td{border-top:1px solid #1f2937;padding:12px 14px;text-align:left;vertical-align:middle}.score-table th{color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.student-name-button{border:0;background:transparent;color:#f8fafc;font:inherit;font-weight:900;padding:0;cursor:pointer}.student-role{display:block;margin-top:3px;color:#94a3b8;font-size:12px}.event-stack{display:grid;gap:5px}.event-line{font-size:12px}.event-plus,.score-positive{color:#10b981}.event-minus,.score-negative{color:#fb7185}.muted-dash{color:#64748b}.point-cell,.total-cell{font-weight:950}.status-pill{display:inline-flex;align-items:center;justify-content:center;min-width:58px;height:24px;border-radius:999px;font-size:11px;font-weight:950;text-transform:uppercase}.status-tốt{color:#d1fae5;background:#065f46}.status-khá{color:#ffedd5;background:#9a3412}.status-đạt{color:#fffbeb;background:#b45309}.status-chưa-đạt{color:#fecdd3;background:#881337}.edit-score-button{width:38px;height:38px;border:0;border-radius:13px;color:#fff;background:#3b82f6;display:grid;place-items:center;cursor:pointer}.score-empty{padding:22px;color:#94a3b8}.profile-layout{display:grid;grid-template-columns:380px 1fr;gap:16px}.profile-card-score{padding:18px}.profile-select{display:grid;gap:8px}.profile-select span{color:#94a3b8;font-size:12px;font-weight:800}.profile-select select{height:38px;border:1px solid #273244;border-radius:13px;color:#f8fafc;background:#111827;padding:0 12px}.profile-main{display:flex;align-items:center;gap:16px;margin-top:18px}.profile-avatar-score{width:72px;height:72px;border-radius:22px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,var(--desktop-accent,#10b981),#7c3aed);font-size:30px;font-weight:950}.profile-main h2{margin:0}.profile-main p{margin:5px 0 0;color:#94a3b8}.profile-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}.profile-stats div{display:grid;gap:6px;padding:12px;border:1px solid #273244;border-radius:14px;background:#111827}.profile-stats span{color:#94a3b8;font-size:12px}.profile-stats strong{font-size:18px}.trend-chart{height:210px;display:flex;align-items:center;justify-content:space-around;padding:20px}.trend-column{height:170px;display:grid;grid-template-rows:1fr auto auto;gap:5px;text-align:center;color:#94a3b8}.trend-track{position:relative;width:42px;border-top:1px solid #334155;border-bottom:1px solid #334155}.trend-bar{position:absolute;left:0;right:0;bottom:50%;border-radius:8px 8px 0 0}.trend-bar.positive{background:#10b981}.trend-bar.negative{top:50%;bottom:auto;background:#ef4444}.event-list.full{display:grid;gap:10px;padding:0 14px 16px}.history-item{display:grid;grid-template-columns:1fr auto;gap:10px;padding:12px;border:1px solid #273244;border-radius:14px;background:#111827}.hist-title{font-weight:900}.hist-meta{color:#94a3b8;font-size:12px}.score-edit-backdrop{position:absolute;inset:0;z-index:120;display:grid;place-items:center;padding:16px;background:rgba(2,6,23,.72);backdrop-filter:blur(12px)}.score-edit-modal{width:min(1480px,calc(100vw - 80px));max-height:calc(100vh - 120px);overflow:auto;border:1px solid #273244;border-radius:22px;background:#050914;color:#f8fafc}.score-edit-header{display:flex;justify-content:space-between;align-items:center;padding:18px 22px;border-bottom:1px solid #1f2937}.score-edit-header span{color:#94a3b8;text-transform:uppercase;letter-spacing:.1em;font-weight:900;font-size:12px}.score-edit-header h2{margin:3px 0 0}.score-edit-header b{color:#ef4444}.score-edit-close{width:42px;height:42px;border:1px solid #273244;border-radius:14px;color:#f8fafc;background:#111827;display:grid;place-items:center;cursor:pointer}.score-edit-body{display:grid;grid-template-columns:1fr 380px;min-height:580px}.score-edit-left{padding:18px;display:grid;gap:14px}.rules-panel{padding:18px;border-left:1px solid #1f2937}.rules-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.rule-chip{height:42px;border-radius:12px;padding:0 10px;display:flex;align-items:center;justify-content:space-between;font-weight:900;cursor:grab}.rule-chip.plus{color:#10b981;border:1px solid #047857;background:#052e2b}.rule-chip.minus{color:#fb7185;border:1px solid #be123c;background:#3f0d1c}.week-matrix{display:grid;grid-template-columns:120px repeat(7,1fr);border:1px solid #273244;border-radius:18px;overflow:hidden}.matrix-cell{min-height:40px;padding:10px;border-right:1px solid #1f2937;border-bottom:1px solid #1f2937;color:#cbd5e1;font-size:12px}.matrix-head,.matrix-label{font-weight:950;color:#f8fafc;text-transform:uppercase}.day-tabs{display:flex;gap:8px}.day-tabs button{height:38px;min-width:58px;border:1px solid #273244;border-radius:12px;color:#cbd5e1;background:#111827;font-weight:900;cursor:pointer}.day-tabs button.active{color:#fff;background:#ef4444}.score-edit-columns{display:grid;grid-template-columns:1fr 1fr;gap:14px}.score-add-panel,.day-record-panel{border:1px solid #273244;border-radius:18px;background:#0b1220;overflow:hidden}.score-inline-actions{display:flex;gap:8px;flex-wrap:wrap;padding:14px}.small-action{height:36px;border:1px solid #273244;border-radius:12px;color:#f8fafc;background:#111827;font-weight:850}.small-action.disabled{opacity:.5}.score-custom-form{margin:0 14px 14px;padding:14px;border:1px solid #273244;border-radius:16px}.form-row{display:grid;grid-template-columns:120px 1fr 110px;gap:10px}.form-row input{height:42px;border:1px solid #273244;border-radius:13px;color:#f8fafc;background:#050914;padding:0 12px}.count-box{height:42px;display:grid;grid-template-columns:auto 1fr;align-items:center;border:1px solid #273244;border-radius:13px;overflow:hidden}.count-box span{padding-left:12px;color:#94a3b8;font-weight:900;text-transform:uppercase;font-size:11px}.count-box input{border:0;border-radius:0}.score-add-button{width:100%;height:42px;margin-top:10px;border:0;border-radius:13px;color:#fff;background:#ef4444;font-weight:950;cursor:pointer}.day-record-head{padding:14px;border-bottom:1px solid #1f2937}.day-record-head span{display:block;margin-top:4px;color:#94a3b8;font-size:12px}.day-event-list{max-height:250px;overflow:auto;padding:14px;display:grid;gap:8px}.day-event-item{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;padding:10px;border-radius:13px;border:1px solid #273244;background:#111827}.day-event-item.plus{border-color:#047857;background:#052e2b}.day-event-item.minus{border-color:#be123c;background:#3f0d1c}.day-event-remove{width:28px;height:28px;border:0;border-radius:10px;color:#cbd5e1;background:rgba(255,255,255,.08)}.score-edit-footer{display:grid;grid-template-columns:110px 110px 140px 80px 1fr;gap:10px;padding:14px;border-top:1px solid #1f2937}.footer-total,.footer-status{height:46px;border:1px solid #273244;border-radius:13px;display:grid;place-items:center;font-weight:950;background:#111827}.save-score-button{height:46px;border:0;border-radius:13px;color:#fff;background:#ef4444;font-weight:950}.group-chart{height:210px;display:flex;align-items:end;gap:18px;padding:20px 24px}.group-bar{flex:1;display:grid;gap:8px;text-align:center;color:#cbd5e1}.bar-track{height:150px;display:flex;align-items:end;justify-content:center;border-bottom:1px solid #334155}.bar-fill{width:70px;border-radius:10px 10px 4px 4px;background:linear-gradient(180deg,var(--desktop-accent,#3b82f6),#1d4ed8);display:grid;place-items:start center;padding-top:6px;font-size:12px;font-weight:950;color:#fff}.podium-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;padding:30px 22px 20px;align-items:end}.podium-card{text-align:center}.podium-avatar{width:48px;height:48px;margin:0 auto 10px;border-radius:14px;display:grid;place-items:center;border:3px solid var(--desktop-accent,#10b981);font-weight:950}.podium-name{font-weight:950}.podium-score{margin-top:6px;color:#10b981;font-weight:950}.warning-list{display:grid;gap:10px;padding:0 14px 16px}.warning-item{display:grid;grid-template-columns:1fr auto;gap:10px;padding:12px;border:1px solid #273244;border-radius:14px;background:#111827}.warning-item strong{display:block}.warning-item span{color:#94a3b8;font-size:12px}
  :root.light .scoreboard-app{color:#0f172a;background:#f8fafc}.light .scoreboard-left-tools,.light .scoreboard-main,.light .scoreboard-header{background:#f8fafc}.light .score-panel,.light .score-kpi,.light .left-mini-section,.light .mini-stat,.light .scoreboard-tabs,.light .scoreboard-actionbar,.light .filter-select-button,.light .toolbar-button,.light .score-table td,.light .score-table th{background:#fff;color:#0f172a;border-color:#d6e0ef}.light .scoreboard-header p,.light .left-tools-title small,.light .score-filter span,.light .student-role{color:#475569}.light .student-name-button{color:#0f172a}@media(max-width:900px){.scoreboard-app{grid-template-columns:1fr}.scoreboard-left-tools{display:none}.scoreboard-header{grid-template-columns:1fr}.score-grid-2,.score-kpi-grid,.profile-layout,.score-edit-body,.score-edit-columns{grid-template-columns:1fr}.score-edit-modal{width:calc(100vw - 24px)}.score-edit-footer{grid-template-columns:1fr 1fr}.save-score-button{grid-column:1/-1}}
`;

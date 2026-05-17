import { Camera, Download, RefreshCcw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { WeekSelector } from "./components/WeekSelector";
import { FilterSelect } from "./components/FilterSelect";
import { ScoreEditModal } from "./components/ScoreEditModal";
import { gasApi, isGasConfigured } from "../../lib/gasApi";
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
  const [week, setWeek] = useState(37);
  const [viewMode, setViewMode] = useState<"overview" | "groups" | "students">("overview");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("score-desc");
  const [students, setStudents] = useState<Student[]>(mockStudents);
  const [events, setEvents] = useState<ScoreEvent[]>(readLocalEvents);
  const [syncStatus, setSyncStatus] = useState<"local" | "connecting" | "online" | "error">(isGasConfigured ? "connecting" : "local");
  const [selectedStudentId, setSelectedStudentId] = useState(mockStudents[0]?.id || "");
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);

  const canCreateWeek = WEEK_CREATORS.includes(String(userRole || "lop_truong"));

  useEffect(() => {
    if (!isGasConfigured) return;

    let mounted = true;
    setSyncStatus("connecting");

    gasApi
      .getScoreState()
      .then((data) => {
        if (!mounted) return;

        if (data.students?.length) setStudents(data.students);
        if (data.events) setEvents(data.events);
        if (data.weeks?.length) {
          const nextWeeks = Array.from(new Set(data.weeks)).sort((a, b) => a - b);
          setWeeks(nextWeeks);
          if (!nextWeeks.includes(week)) setWeek(nextWeeks[0]);
        }

        setSyncStatus("online");
      })
      .catch((error) => {
        console.warn("Không thể tải dữ liệu từ Google Apps Script:", error);
        if (mounted) setSyncStatus("error");
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }, [events]);

  useEffect(() => {
    localStorage.setItem(WEEK_STORAGE_KEY, JSON.stringify(weeks));
  }, [weeks]);

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

  const openScoreEditor = (studentId: string) => {
    setEditingStudentId(studentId);
  };

  const deleteScore = (eventId: string) => {
    setEvents((current) => current.filter((event) => event.id !== eventId));

    if (isGasConfigured) {
      gasApi.deleteScoreEvent(eventId).catch((error) => {
        console.warn("Không thể xoá điểm trên Google Apps Script:", error);
        setSyncStatus("error");
      });
    }
  };

  const addScore = (event: Omit<ScoreEvent, "id"> | Omit<ScoreEvent, "id" | "createdAt">) => {
    const eventData = event as Omit<ScoreEvent, "id"> & { createdAt?: string };

    const nextEvent: ScoreEvent = {
      ...eventData,
      id: `local-${Date.now()}`,
      createdAt: eventData.createdAt || new Date().toISOString(),
    };

    setEvents((current) => [nextEvent, ...current]);
    setSelectedStudentId(eventData.studentId);

    if (isGasConfigured) {
      gasApi.appendScoreEvent(nextEvent).catch((error) => {
        console.warn("Không thể lưu điểm lên Google Apps Script:", error);
        setSyncStatus("error");
      });
    }
  };

  const createNewWeek = () => {
    if (!canCreateWeek) return;

    const nextWeek = Math.max(...weeks) + 1;
    setWeeks((current) => Array.from(new Set([...current, nextWeek])).sort((a, b) => a - b));
    setWeek(nextWeek);
    setActiveTab("scoring");
  };

  const resetLocalData = () => {
    setEvents(mockScoreEvents);
    setWeeks(SCORE_WEEKS);
    setWeek(37);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(WEEK_STORAGE_KEY);
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
          canCreateWeek={canCreateWeek}
          onCreateWeek={createNewWeek}
        />

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
          <div className="mini-stat">
            <span>Tổng điểm</span>
            <strong className={totalScore >= 0 ? "score-positive" : "score-negative"}>{totalScore > 0 ? `+${totalScore}` : totalScore}</strong>
          </div>
          <div className="mini-stat">
            <span>Ổn định</span>
            <strong>{goodCount}/{rawSummaries.length}</strong>
          </div>
          <div className="mini-stat">
            <span>Cần chú ý</span>
            <strong>{warningCount}</strong>
          </div>
          <div className="mini-stat">
            <span>Tổ dẫn đầu</span>
            <strong>{topGroup?.label || "Chưa có"}</strong>
          </div>
          <div className="mini-stat">
            <span>Dữ liệu</span>
            <strong>{syncStatus === "online" ? "Google Sheets" : syncStatus === "connecting" ? "Đang nối" : syncStatus === "error" ? "Lỗi GAS" : "Local"}</strong>
          </div>
        </div>
      </aside>

      <section className="scoreboard-main">
        <header className="scoreboard-header">
          <div>
            <span className="app-eyebrow">Bảng chấm điểm</span>
            <h1>
              System <b>A3K64</b>
            </h1>
            <p>Quản lý điểm thi đua, xếp hạng học tập và nề nếp theo tuần.</p>
          </div>

          <nav className="scoreboard-tabs">
            <button className={activeTab === "overview" ? "active" : ""} type="button" onClick={() => setActiveTab("overview")}>
              Tổng quan
            </button>
            <button className={activeTab === "scoring" ? "active" : ""} type="button" onClick={() => setActiveTab("scoring")}>
              Bảng chấm
            </button>
            <button className={activeTab === "profile" ? "active" : ""} type="button" onClick={() => setActiveTab("profile")}>
              Hồ sơ học sinh
            </button>
          </nav>
        </header>

        <div className="scoreboard-actionbar">
          <div className="toolbar-actions">
            <button type="button" className="toolbar-button export">
              <Download size={16} />
              Xuất Excel
            </button>
            <button type="button" className="toolbar-button camera">
              <Camera size={16} />
              Chụp ảnh
            </button>
            <button type="button" className="toolbar-button auto">
              <Sparkles size={16} />
              Tự tính điểm
            </button>
            <button type="button" className="toolbar-button" onClick={resetLocalData}>
              <RefreshCcw size={16} />
              Reset local
            </button>
          </div>
        </div>

        <main className="scoreboard-content">
          {activeTab === "overview" && <OverviewPage summaries={summaries} week={week} onOpenStudent={openStudent} />}
          {activeTab === "scoring" && (
            <ScoringPage
              students={mockStudents}
              summaries={summaries}
              events={events}
              week={week}
              onAddScore={addScore}
              onOpenStudent={openStudent}
              onEditStudent={openScoreEditor}
            />
          )}
          {activeTab === "profile" && (
            <StudentProfilePage
              students={mockStudents}
              events={events}
              summaries={rawSummaries}
              selectedStudentId={selectedStudentId}
              onSelectStudent={setSelectedStudentId}
            />
          )}
        </main>
      </section>

      {editingStudent && (
        <ScoreEditModal
          student={editingStudent}
          week={week}
          events={events}
          onAddScore={addScore}
          onDeleteScore={deleteScore}
          onClose={() => setEditingStudentId(null)}
        />
      )}
    </div>
  );
}

const scoreboardCss = `

  .scoreboard-app,
  .scoreboard-app * {
    -webkit-user-select: none;
    user-select: none;
  }

  .scoreboard-app input,
  .scoreboard-app textarea {
    -webkit-user-select: text;
    user-select: text;
  }

  .scoreboard-app {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-columns: 240px 1fr;
    color: #f8fafc;
    background: #050914;
    overflow: hidden;
  }

  .scoreboard-left-tools {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px 14px;
    border-right: 1px solid #1f2937;
    background: #050914;
    overflow: auto;
  }

  .left-tools-title {
    display: grid;
    gap: 4px;
    padding: 4px 2px 6px;
  }

  .left-tools-title span {
    color: var(--desktop-accent, #10b981);
    font-size: 11px;
    font-weight: 900;
    letter-spacing: .08em;
    text-transform: uppercase;
  }

  .left-tools-title strong {
    font-size: 20px;
    font-weight: 950;
    letter-spacing: -.04em;
  }

  .left-tools-title small {
    color: #94a3b8;
    font-size: 12px;
    line-height: 1.45;
  }


  .scoreboard-app,
  .scoreboard-left-tools,
  .scoreboard-content,
  .score-table-wrap {
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--desktop-accent, #10b981) 70%, #334155) #050914;
  }

  .scoreboard-app::-webkit-scrollbar,
  .scoreboard-left-tools::-webkit-scrollbar,
  .scoreboard-content::-webkit-scrollbar,
  .score-table-wrap::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  .scoreboard-app::-webkit-scrollbar-track,
  .scoreboard-left-tools::-webkit-scrollbar-track,
  .scoreboard-content::-webkit-scrollbar-track,
  .score-table-wrap::-webkit-scrollbar-track {
    background: #050914;
    border-radius: 999px;
  }

  .scoreboard-app::-webkit-scrollbar-thumb,
  .scoreboard-left-tools::-webkit-scrollbar-thumb,
  .scoreboard-content::-webkit-scrollbar-thumb,
  .score-table-wrap::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--desktop-accent, #10b981) 70%, #334155);
    border: 2px solid #050914;
    border-radius: 999px;
  }

  .scoreboard-app::-webkit-scrollbar-thumb:hover,
  .scoreboard-left-tools::-webkit-scrollbar-thumb:hover,
  .scoreboard-content::-webkit-scrollbar-thumb:hover,
  .score-table-wrap::-webkit-scrollbar-thumb:hover {
    background: var(--desktop-accent, #10b981);
  }


  .scoreboard-left-tools .left-tools-title strong,
  .scoreboard-left-tools .left-mini-title {
    color: #f8fafc;
  }

  .scoreboard-left-tools .left-tools-title small,
  .scoreboard-left-tools .score-filter span,
  .scoreboard-left-tools .mini-stat span {
    color: #cbd5e1;
  }

  .scoreboard-left-tools .filter-select-button {
    color: #f8fafc;
    font-weight: 900;
  }

  .scoreboard-left-tools .filter-select-option {
    color: #f8fafc;
    font-weight: 750;
  }

  .scoreboard-left-tools .mini-stat strong {
    color: #f8fafc;
  }

  .scoreboard-main {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .scoreboard-header {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: end;
    gap: 20px;
    padding: 22px 22px 16px;
    border-bottom: 1px solid #1f2937;
    background: #050914;
  }

  .app-eyebrow {
    display: block;
    color: #94a3b8;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: .08em;
    text-transform: uppercase;
  }

  .scoreboard-header h1 {
    margin: 22px 0 4px;
    font-size: 30px;
    line-height: 1;
    letter-spacing: -.05em;
  }

  .scoreboard-header h1 b {
    color: var(--desktop-accent, #3b82f6);
  }

  .scoreboard-header p {
    margin: 0;
    color: #94a3b8;
    font-size: 13px;
  }

  .scoreboard-tabs {
    display: inline-flex;
    gap: 8px;
    padding: 5px;
    border: 1px solid #1f2937;
    border-radius: 18px;
    background: #0b1220;
  }

  .scoreboard-tabs button {
    height: 38px;
    border: 0;
    border-radius: 13px;
    padding: 0 16px;
    color: #94a3b8;
    background: transparent;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }

  .scoreboard-tabs button.active {
    color: #0f172a;
    background: #f8fafc;
  }

  .scoreboard-actionbar {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 10px;
    padding: 14px 22px;
    border-bottom: 1px solid #1f2937;
    background: #0b1220;
  }

  .score-filter-bar,
  .toolbar-actions {
    display: grid;
    gap: 10px;
  }

  .toolbar-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  .score-filter {
    display: grid;
    gap: 7px;
  }

  .score-filter span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #94a3b8;
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: .06em;
  }

  .week-select-row {
    display: grid;
    grid-template-columns: 1fr 38px;
    gap: 8px;
  }


  .filter-select {
    position: relative;
    width: 100%;
  }

  .filter-select-button {
    width: 100%;
    height: 38px;
    border: 1px solid #273244;
    border-radius: 13px;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    color: #f8fafc;
    background: #111827;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .filter-select-button span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .filter-select-button svg {
    transition: transform .16s ease;
  }

  .filter-select.open .filter-select-button svg {
    transform: rotate(180deg);
  }

  .filter-select-menu {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(100% + 6px);
    z-index: 80;
    overflow: hidden;
    border: 1px solid #273244;
    border-radius: 16px;
    background: #1f2937;
    box-shadow: 0 18px 55px rgba(0,0,0,.38);
    padding: 6px;
  }

  .filter-select-option {
    width: 100%;
    min-height: 38px;
    border: 0;
    border-radius: 10px;
    padding: 0 12px;
    color: #f8fafc;
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .filter-select-option:hover,
  .filter-select-option.active {
    background: #374151;
  }

  .create-week-button {
    height: 38px;
    border: 1px solid #273244;
    border-radius: 13px;
    display: grid;
    place-items: center;
    color: #f8fafc;
    background: var(--desktop-accent, #10b981);
    cursor: pointer;
  }

  .create-week-button:disabled {
    opacity: .45;
    cursor: not-allowed;
    filter: grayscale(.55);
  }

  .score-filter select,
  .table-toolbar select,
  .form-grid select,
  .form-grid input,
  .profile-select select {
    height: 38px;
    width: 100%;
    min-width: 0;
    border: 1px solid #273244;
    border-radius: 13px;
    padding: 0 12px;
    color: #f8fafc;
    background: #111827;
    outline: 0;
    font: inherit;
  }

  .toolbar-button {
    height: 38px;
    width: auto;
    min-width: 118px;
    border: 1px solid #273244;
    border-radius: 13px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 14px;
    color: #f8fafc;
    background: #111827;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }

  .toolbar-button.export {
    color: #6ee7b7;
    border-color: #064e3b;
    background: #052e2b;
  }

  .toolbar-button.camera {
    color: #93c5fd;
    border-color: #1d4ed8;
    background: #0b1e40;
  }

  .toolbar-button.auto {
    color: #d8b4fe;
    border-color: #7e22ce;
    background: #29113f;
  }

  .left-mini-section {
    display: grid;
    gap: 8px;
    padding: 12px;
    border: 1px solid #273244;
    border-radius: 16px;
    background: #0b1220;
  }

  .left-mini-title {
    color: #cbd5e1;
    font-size: 13px;
    font-weight: 900;
    letter-spacing: .02em;
  }

  .mini-stat {
    min-height: 34px;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 12px;
    background: #111827;
  }

  .mini-stat span {
    color: #94a3b8;
    font-size: 12px;
  }

  .mini-stat strong {
    color: #f8fafc;
    font-size: 13px;
    font-weight: 900;
  }

  .scoreboard-content {
    min-width: 0;
    min-height: 0;
    flex: 1;
    padding: 18px 22px 30px;
    overflow: auto;
  }

  .score-page {
    display: grid;
    gap: 16px;
  }

  .score-kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .score-kpi,
  .score-panel {
    border: 1px solid #273244;
    border-radius: 22px;
    background: #0b1220;
  }

  .score-kpi {
    padding: 16px;
  }

  .score-kpi span,
  .score-kpi small {
    display: block;
    color: #94a3b8;
  }

  .score-kpi strong {
    display: block;
    margin: 10px 0 3px;
    font-size: 28px;
    letter-spacing: -.04em;
  }

  .score-kpi.warning strong {
    color: #fbbf24;
  }

  .score-grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .section-heading {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 16px 18px 10px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: .04em;
  }

  .ranking-panel,
  .chart-panel {
    min-height: 230px;
  }

  .podium-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    align-items: end;
    padding: 10px 20px 24px;
  }

  .podium-card {
    min-height: 138px;
    border: 0;
    border-bottom: 4px solid var(--desktop-accent, #3b82f6);
    border-radius: 18px 18px 0 0;
    display: grid;
    place-items: center;
    gap: 6px;
    color: #f8fafc;
    background: linear-gradient(180deg, #111827, #0b1220);
    cursor: pointer;
  }

  .podium-card.rank-1 {
    min-height: 164px;
    border-bottom-color: #fbbf24;
  }

  .podium-card.rank-2 {
    border-bottom-color: #94a3b8;
  }

  .podium-card.rank-3 {
    border-bottom-color: #f97316;
  }

  .podium-rank {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #fbbf24;
    font-size: 12px;
    font-weight: 900;
  }

  .podium-avatar {
    width: 46px;
    height: 46px;
    border: 3px solid var(--desktop-accent, #10b981);
    border-radius: 15px;
    display: grid;
    place-items: center;
    color: #ffffff;
    background: linear-gradient(135deg, #0f172a, #111827);
    font-size: 20px;
    font-weight: 950;
    line-height: 1;
    box-shadow: 0 12px 26px rgba(0,0,0,.28);
  }

  .podium-avatar span {
    display: block;
    color: #ffffff;
    text-shadow: 0 1px 2px rgba(0,0,0,.45);
  }

  .podium-card.rank-1 .podium-avatar {
    border-color: #fbbf24;
  }

  .podium-card.rank-2 .podium-avatar {
    border-color: #94a3b8;
  }

  .podium-card.rank-3 .podium-avatar {
    border-color: #f97316;
  }

  .podium-card strong {
    font-size: 13px;
    text-align: center;
  }


  .group-chart-modern {
    min-height: 260px;
    display: grid;
    grid-template-columns: 54px 1fr;
    gap: 14px;
    padding: 6px 26px 24px 14px;
    position: relative;
  }

  .chart-axis-labels {
    position: relative;
    height: 190px;
    margin-top: 6px;
  }

  .chart-axis-labels span {
    position: absolute;
    right: 4px;
    transform: translateY(-50%);
    color: #cbd5e1;
    font-size: 11px;
    font-weight: 800;
    line-height: 1;
    white-space: nowrap;
  }

  .chart-grid-lines {
    position: absolute;
    left: 68px;
    right: 26px;
    top: 12px;
    height: 190px;
    pointer-events: none;
  }

  .chart-grid-lines i {
    position: absolute;
    left: 0;
    right: 0;
    height: 1px;
    background: rgba(148, 163, 184, .18);
  }

  .chart-grid-lines i.zero {
    height: 2px;
    background: rgba(203, 213, 225, .58);
  }

  .chart-columns-area {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 24px;
    align-items: end;
    position: relative;
    z-index: 1;
  }

  .chart-modern-column {
    min-width: 0;
    display: grid;
    gap: 8px;
    text-align: center;
    position: relative;
  }

  .chart-modern-track {
    height: 190px;
    position: relative;
    overflow: visible;
  }

  .chart-modern-bar {
    position: absolute;
    left: 18%;
    right: 18%;
    min-height: 8px;
    border-radius: 0 0 9px 9px;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    color: #ffffff;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.12);
  }

  .chart-modern-bar.positive {
    border-radius: 9px 9px 0 0;
    align-items: flex-end;
  }

  .chart-modern-bar.group-1 {
    background: linear-gradient(180deg, #3b82f6, #1d4ed8);
  }

  .chart-modern-bar.group-2 {
    background: linear-gradient(180deg, #10b981, #047857);
  }

  .chart-modern-bar.group-3 {
    background: linear-gradient(180deg, #f59e0b, #b45309);
  }

  .chart-modern-bar.group-4 {
    background: linear-gradient(180deg, #f43f5e, #be123c);
  }

  .chart-value {
    position: relative;
    z-index: 2;
    margin: 6px 0;
    padding: 2px 7px;
    border-radius: 999px;
    color: #ffffff;
    background: rgba(0,0,0,.34);
    font-size: 12px;
    font-weight: 950;
    line-height: 1.2;
    white-space: nowrap;
  }

  .chart-modern-bar.positive .chart-value {
    margin-bottom: 6px;
  }

  .chart-modern-column strong {
    color: #f8fafc;
    font-size: 13px;
    font-weight: 900;
  }

  .chart-modern-column small {
    min-height: 28px;
    color: #cbd5e1;
    font-size: 11px;
    line-height: 1.35;
  }

  .student-table-panel {
    overflow: hidden;
  }

  .score-detail-table {
    min-width: 1180px;
  }

  .score-detail-table th:nth-child(1),
  .score-detail-table td:nth-child(1) {
    width: 46px;
    text-align: center;
  }

  .score-detail-table th:nth-child(2),
  .score-detail-table td:nth-child(2) {
    width: 190px;
  }

  .score-detail-table th:nth-child(3),
  .score-detail-table td:nth-child(3),
  .score-detail-table th:nth-child(5),
  .score-detail-table td:nth-child(5) {
    min-width: 310px;
  }

  .score-detail-table th:nth-child(4),
  .score-detail-table td:nth-child(4),
  .score-detail-table th:nth-child(6),
  .score-detail-table td:nth-child(6),
  .score-detail-table th:nth-child(7),
  .score-detail-table td:nth-child(7) {
    width: 92px;
    text-align: center;
  }

  .score-detail-table th:nth-child(8),
  .score-detail-table td:nth-child(8),
  .score-detail-table th:nth-child(9),
  .score-detail-table td:nth-child(9) {
    width: 92px;
    text-align: center;
  }

  .score-detail-table td {
    vertical-align: middle;
    padding-top: 13px;
    padding-bottom: 13px;
  }

  .table-index {
    color: #64748b !important;
    font-weight: 900;
  }

  .student-cell {
    line-height: 1.3;
  }

  .detail-name {
    font-size: 13px;
    line-height: 1.25;
  }

  .event-stack {
    display: grid;
    gap: 5px;
  }

  .event-line {
    display: block;
    line-height: 1.45;
    font-size: 12px;
  }

  .event-plus {
    color: #00d09c;
  }

  .event-minus {
    color: #ff3b6b;
  }

  .muted-dash {
    color: #64748b;
  }

  .point-cell,
  .total-cell {
    font-size: 13px;
    font-weight: 950;
  }

  .total-cell {
    font-size: 18px;
    letter-spacing: -.03em;
  }

  .edit-score-button {
    width: 38px;
    height: 38px;
    border: 0;
    border-radius: 13px;
    display: inline-grid;
    place-items: center;
    color: #ffffff;
    background: #3b82f6;
    cursor: pointer;
    box-shadow: 0 10px 24px rgba(59,130,246,.28);
  }

  .edit-score-button:hover {
    filter: brightness(1.08);
  }


  .table-title {
    padding: 12px 16px;
    color: #60a5fa;
    background: #102044;
    font-weight: 900;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: .12em;
  }

  .score-table-wrap {
    overflow: auto;
  }

  .score-table {
    width: 100%;
    min-width: 620px;
    border-collapse: collapse;
  }

  .score-table th,
  .score-table td {
    border-top: 1px solid #1f2937;
    padding: 10px 12px;
    color: #cbd5e1;
    font-size: 12px;
    text-align: left;
  }

  .score-table th {
    color: #94a3b8;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .08em;
    background: #0b1220;
  }

  .student-name-button {
    border: 0;
    padding: 0;
    color: #f8fafc;
    background: transparent;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }

  .student-role {
    display: block;
    margin-top: 3px;
    color: #64748b;
    font-size: 11px;
  }

  .score-positive {
    color: #34d399 !important;
    font-weight: 900;
  }

  .score-negative {
    color: #fb7185 !important;
    font-weight: 900;
  }

  .rank-text {
    color: #60a5fa !important;
    font-weight: 900;
  }

  .status-pill {
    display: inline-flex;
    min-width: 58px;
    justify-content: center;
    border-radius: 999px;
    padding: 4px 8px;
    color: #dcfce7;
    background: #064e3b;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .status-chưa-đạt {
    color: #fecaca;
    background: #7f1d1d;
  }

  .status-đạt {
    color: #fed7aa;
    background: #7c2d12;
  }

  .status-khá {
    color: #fef3c7;
    background: #78350f;
  }

  .icon-button {
    width: 30px;
    height: 30px;
    border: 1px solid #273244;
    border-radius: 10px;
    display: grid;
    place-items: center;
    color: #cbd5e1;
    background: #111827;
    cursor: pointer;
  }

  .warning-list,
  .event-list {
    display: grid;
    gap: 8px;
    padding: 12px;
  }

  .warning-list button,
  .event-list button,
  .history-row {
    border: 1px solid #1f2937;
    border-radius: 15px;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 12px;
    color: #f8fafc;
    background: #111827;
    text-align: left;
  }

  .warning-list button,
  .event-list button {
    cursor: pointer;
  }

  .warning-list strong,
  .warning-list span,
  .event-list strong,
  .event-list span,
  .history-row strong,
  .history-row span {
    display: block;
  }

  .warning-list span,
  .event-list span,
  .history-row span {
    color: #94a3b8;
    font-size: 12px;
    margin-top: 3px;
  }

  .scoring-grid {
    align-items: start;
  }

  .scoring-card {
    padding-bottom: 16px;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    padding: 12px 16px;
  }

  .form-grid label,
  .profile-select {
    display: grid;
    gap: 7px;
  }

  .form-grid label span,
  .profile-select span {
    color: #94a3b8;
    font-size: 12px;
    font-weight: 800;
  }

  .score-primary-button,
  .score-secondary-button {
    height: 40px;
    border: 0;
    border-radius: 13px;
    margin: 0 16px;
    padding: 0 14px;
    color: #fff;
    background: var(--desktop-accent, #3b82f6);
    font: inherit;
    font-weight: 900;
    cursor: pointer;
  }

  .score-secondary-button {
    margin-top: 12px;
    background: #111827;
    border: 1px solid #273244;
  }

  .custom-score-box {
    margin: 16px;
    padding: 14px;
    border: 1px solid #273244;
    border-radius: 18px;
    background: #050914;
  }

  .custom-score-box > strong {
    display: block;
    margin-bottom: 4px;
  }

  .table-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding-right: 16px;
  }

  .profile-layout {
    display: grid;
    grid-template-columns: .85fr 1.15fr;
    gap: 16px;
  }

  .profile-card-score {
    padding: 16px;
  }

  .profile-select {
    margin-bottom: 18px;
  }

  .profile-main {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .profile-avatar-score {
    width: 72px;
    height: 72px;
    border-radius: 24px;
    display: grid;
    place-items: center;
    color: #fff;
    background: linear-gradient(135deg, var(--desktop-accent, #3b82f6), #7c3aed);
    font-size: 30px;
    font-weight: 900;
  }

  .profile-main h2 {
    margin: 0;
    font-size: 26px;
    letter-spacing: -.04em;
  }

  .profile-main p {
    margin: 5px 0 0;
    color: #94a3b8;
  }

  .profile-stats {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin-top: 20px;
  }

  .profile-stats div {
    border: 1px solid #273244;
    border-radius: 16px;
    padding: 12px;
    background: #111827;
  }

  .profile-stats span,
  .profile-stats strong {
    display: block;
  }

  .profile-stats span {
    color: #94a3b8;
    font-size: 12px;
  }

  .profile-stats strong {
    margin-top: 5px;
    font-size: 22px;
  }

  .trend-chart {
    height: 240px;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    align-items: end;
    gap: 20px;
    padding: 20px;
  }

  .trend-column {
    display: grid;
    gap: 8px;
    text-align: center;
  }

  .trend-track {
    height: 150px;
    position: relative;
    border-bottom: 1px solid #334155;
  }

  .trend-bar {
    position: absolute;
    left: 22%;
    right: 22%;
    top: 76px;
    border-radius: 8px;
  }

  .trend-bar.positive {
    background: #059669;
  }

  .trend-bar.negative {
    background: #dc2626;
  }

  .trend-column span {
    color: #94a3b8;
    font-size: 12px;
  }

  .score-empty {
    padding: 20px;
    color: #94a3b8;
  }


  .win-root.theme-light .scoreboard-app,
  .win-root.theme-light .scoreboard-left-tools,
  .win-root.theme-light .scoreboard-content,
  .win-root.theme-light .score-table-wrap {
    scrollbar-color: color-mix(in srgb, var(--desktop-accent, #2563eb) 65%, #94a3b8) #e2e8f0;
  }

  .win-root.theme-light .scoreboard-app::-webkit-scrollbar-track,
  .win-root.theme-light .scoreboard-left-tools::-webkit-scrollbar-track,
  .win-root.theme-light .scoreboard-content::-webkit-scrollbar-track,
  .win-root.theme-light .score-table-wrap::-webkit-scrollbar-track {
    background: #e2e8f0;
  }

  .win-root.theme-light .scoreboard-app::-webkit-scrollbar-thumb,
  .win-root.theme-light .scoreboard-left-tools::-webkit-scrollbar-thumb,
  .win-root.theme-light .scoreboard-content::-webkit-scrollbar-thumb,
  .win-root.theme-light .score-table-wrap::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--desktop-accent, #2563eb) 65%, #94a3b8);
    border-color: #e2e8f0;
  }

  .win-root.theme-light .scoreboard-app,
  .win-root.theme-light .scoreboard-header,
  .win-root.theme-light .scoreboard-content,
  .win-root.theme-light .scoreboard-left-tools {
    color: #0f172a;
    background: #f8fafc;
  }


  .win-root.theme-light .toolbar-button {
    color: #0f172a;
    border-color: #cbd5e1;
    background: #f8fafc;
  }

  .win-root.theme-light .toolbar-button:hover {
    background: #e2e8f0;
  }

  .win-root.theme-light .toolbar-button.export {
    color: #047857;
    border-color: #a7f3d0;
    background: #ecfdf5;
  }

  .win-root.theme-light .toolbar-button.camera {
    color: #1d4ed8;
    border-color: #bfdbfe;
    background: #eff6ff;
  }

  .win-root.theme-light .toolbar-button.auto {
    color: #7e22ce;
    border-color: #e9d5ff;
    background: #faf5ff;
  }

  .win-root.theme-light .toolbar-button:not(.export):not(.camera):not(.auto) {
    color: #334155;
    border-color: #cbd5e1;
    background: #f1f5f9;
  }

  .win-root.theme-light .toolbar-button.export:hover,
  .win-root.theme-light .toolbar-button.camera:hover,
  .win-root.theme-light .toolbar-button.auto:hover,
  .win-root.theme-light .toolbar-button:not(.export):not(.camera):not(.auto):hover {
    filter: brightness(.98);
  }

  .win-root.theme-light .scoreboard-actionbar {
    color: #0f172a;
    border-color: #d7dee8;
    background: #ffffff;
  }

  .win-root.theme-light .left-mini-section,
  .win-root.theme-light .mini-stat,
  .win-root.theme-light .score-filter select,
  .win-root.theme-light .table-toolbar select,
  .win-root.theme-light .form-grid select,
  .win-root.theme-light .form-grid input,
  .win-root.theme-light .profile-select select,
  .win-root.theme-light .score-kpi,
  .win-root.theme-light .score-panel,
  .win-root.theme-light .scoreboard-tabs,
  .win-root.theme-light .podium-card,
  .win-root.theme-light .score-table th,
  .win-root.theme-light .warning-list button,
  .win-root.theme-light .event-list button,
  .win-root.theme-light .history-row,
  .win-root.theme-light .custom-score-box,
  .win-root.theme-light .profile-stats div,
  .win-root.theme-light .icon-button,
  .win-root.theme-light .score-secondary-button {
    color: #0f172a;
    border-color: #d7dee8;
    background: #ffffff;
  }


  .win-root.theme-light .filter-select-button,
  .win-root.theme-light .filter-select-menu,
  .win-root.theme-light .filter-select-option {
    color: #0f172a;
    border-color: #d7dee8;
    background: #ffffff;
  }

  .win-root.theme-light .filter-select-option:hover,
  .win-root.theme-light .filter-select-option.active {
    background: #e2e8f0;
  }




  .win-root.theme-light .scoreboard-left-tools .left-mini-title,
  .win-root.theme-light .scoreboard-left-tools .mini-stat strong {
    color: #0f172a;
  }

  .win-root.theme-light .scoreboard-left-tools .mini-stat span,
  .win-root.theme-light .scoreboard-left-tools .left-tools-title small,
  .win-root.theme-light .scoreboard-left-tools .score-filter span {
    color: #475569;
  }

  .win-root.theme-light .scoreboard-left-tools .filter-select-button,
  .win-root.theme-light .scoreboard-left-tools .filter-select-option {
    color: #0f172a;
    font-weight: 850;
  }

  .win-root.theme-light .scoreboard-left-tools .mini-stat {
    background: #f8fafc;
  }

  .win-root.theme-light .podium-avatar {
    color: #ffffff;
    background: linear-gradient(135deg, #0f172a, #1e293b);
  }

  .win-root.theme-light .podium-avatar span {
    color: #ffffff;
  }


  .win-root.theme-light .chart-axis-labels span {
    color: #475569;
  }

  .win-root.theme-light .chart-grid-lines i {
    background: rgba(100, 116, 139, .18);
  }

  .win-root.theme-light .chart-grid-lines i.zero {
    background: rgba(71, 85, 105, .52);
  }

  .win-root.theme-light .chart-modern-column strong {
    color: #334155;
  }

  .win-root.theme-light .chart-modern-column small {
    color: #64748b;
  }

  .win-root.theme-light .chart-zero-line,
  .win-root.theme-light .chart-modern-track {
    border-color: #cbd5e1;
  }

  .win-root.theme-light .chart-zero-line {
    background: #cbd5e1;
  }

  .win-root.theme-light .chart-zero-line span,
  .win-root.theme-light .chart-modern-column strong {
    color: #334155;
  }

  .win-root.theme-light .chart-modern-column small {
    color: #64748b;
  }

  .win-root.theme-light .event-plus {
    color: #047857;
  }

  .win-root.theme-light .event-minus {
    color: #e11d48;
  }

  .win-root.theme-light .muted-dash,
  .win-root.theme-light .table-index {
    color: #64748b !important;
  }

  .win-root.theme-light .create-week-button {
    color: #ffffff;
    border-color: var(--desktop-accent, #2563eb);
  }

  .win-root.theme-light .student-name-button,
  .win-root.theme-light .scoreboard-tabs button {
    color: #0f172a;
  }

  .win-root.theme-light .scoreboard-tabs button.active {
    color: #ffffff;
    background: var(--desktop-accent, #2563eb);
  }

  .win-root.theme-light .app-eyebrow,
  .win-root.theme-light .scoreboard-header p,
  .win-root.theme-light .score-kpi span,
  .win-root.theme-light .score-kpi small,
  .win-root.theme-light .score-filter span,
  .win-root.theme-light .form-grid label span,
  .win-root.theme-light .profile-select span,
  .win-root.theme-light .warning-list span,
  .win-root.theme-light .event-list span,
  .win-root.theme-light .history-row span,
  .win-root.theme-light .profile-main p,
  .win-root.theme-light .profile-stats span,
  .win-root.theme-light .score-table th,
  .win-root.theme-light .score-table td,
  .win-root.theme-light .left-tools-title small,
  .win-root.theme-light .mini-stat span {
    color: #475569;
  }

  .win-root.theme-light .scoreboard-header,
  .win-root.theme-light .scoreboard-left-tools,
  .win-root.theme-light .score-table td {
    border-color: #d7dee8;
  }

  .win-root.theme-light .score-table td {
    border-top-color: #e2e8f0;
  }


  .score-edit-backdrop {
    position: absolute;
    inset: 0;
    z-index: 500;
    display: grid;
    place-items: center;
    padding: 18px;
    background: rgba(2, 6, 23, .70);
    backdrop-filter: blur(10px);
  }

  .score-edit-modal {
    width: min(1320px, calc(100vw - 46px));
    height: min(820px, calc(100vh - 92px));
    border: 1px solid #273244;
    border-radius: 22px;
    display: grid;
    grid-template-rows: auto 1fr auto;
    color: #f8fafc;
    background: #070d1a;
    box-shadow: 0 28px 90px rgba(0,0,0,.58);
    overflow: hidden;
  }

  .score-edit-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 16px 18px;
    border-bottom: 1px solid #1f2937;
    background: #0b1220;
  }

  .score-edit-header span,
  .score-edit-section-title {
    color: #94a3b8;
    font-size: 12px;
    font-weight: 950;
    letter-spacing: .12em;
    text-transform: uppercase;
  }

  .score-edit-header h2 {
    margin: 4px 0 0;
    font-size: 20px;
    line-height: 1;
    letter-spacing: -.03em;
  }

  .score-edit-header h2 b {
    color: var(--desktop-accent, #3b82f6);
  }

  .score-edit-close {
    width: 42px;
    height: 42px;
    border: 1px solid #273244;
    border-radius: 14px;
    display: grid;
    place-items: center;
    color: #f8fafc;
    background: #111827;
    cursor: pointer;
  }

  .score-edit-body {
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 390px;
    overflow: hidden;
  }

  .score-edit-left {
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: auto auto 1fr;
    gap: 14px;
    padding: 16px;
    overflow: auto;
  }

  .score-week-table {
    display: grid;
    gap: 10px;
  }

  .week-matrix {
    display: grid;
    grid-template-columns: 120px repeat(7, minmax(86px, 1fr));
    border: 1px solid #273244;
    border-radius: 18px;
    overflow: hidden;
    background: #0b1220;
  }

  .matrix-cell {
    min-height: 42px;
    border-right: 1px solid #1f2937;
    border-bottom: 1px solid #1f2937;
    display: grid;
    align-content: center;
    gap: 3px;
    padding: 8px 10px;
    color: #94a3b8;
    font-size: 12px;
    line-height: 1.35;
  }

  .matrix-cell:nth-child(8n) {
    border-right: 0;
  }

  .matrix-cell:nth-last-child(-n + 8) {
    border-bottom: 0;
  }

  .matrix-head,
  .matrix-label {
    color: #f8fafc;
    font-weight: 950;
    text-transform: uppercase;
    letter-spacing: .06em;
  }

  .day-head {
    color: var(--desktop-accent, #3b82f6);
    text-align: center;
  }

  .matrix-content span {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .day-tabs {
    display: flex;
    gap: 8px;
    overflow: auto;
  }

  .day-tabs button,
  .small-action {
    height: 40px;
    min-width: 68px;
    border: 1px solid #273244;
    border-radius: 13px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: #cbd5e1;
    background: #111827;
    font: inherit;
    font-weight: 900;
    cursor: pointer;
  }

  .day-tabs button.active {
    color: #ffffff;
    border-color: transparent;
    background: var(--desktop-accent, #3b82f6);
  }

  .score-edit-columns {
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .score-add-panel,
  .day-record-panel {
    min-height: 0;
    border: 1px solid #273244;
    border-radius: 20px;
    background: #0b1220;
    overflow: hidden;
  }

  .score-add-panel {
    padding: 16px;
  }

  .score-inline-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 14px;
  }

  .small-action.disabled {
    opacity: .55;
    cursor: default;
  }

  .score-custom-form {
    border: 1px solid #273244;
    border-radius: 18px;
    padding: 14px;
    background: #111827;
  }

  .form-row {
    display: grid;
    grid-template-columns: 110px 1fr 90px;
    gap: 10px;
  }

  .form-row select,
  .form-row input {
    height: 44px;
    min-width: 0;
    border: 1px solid #273244;
    border-radius: 14px;
    padding: 0 14px;
    color: #f8fafc;
    background: #0b1220;
    font: inherit;
    outline: 0;
  }

  .score-add-button {
    width: 100%;
    height: 44px;
    margin-top: 12px;
    border: 0;
    border-radius: 14px;
    color: #ffffff;
    background: var(--desktop-accent, #3b82f6);
    font: inherit;
    font-weight: 950;
    cursor: pointer;
  }

  .day-record-head {
    display: grid;
    gap: 5px;
    padding: 16px;
    border-bottom: 1px solid #1f2937;
  }

  .day-record-head strong {
    font-size: 15px;
  }

  .day-record-head span,
  .empty-day-record {
    color: #94a3b8;
    font-size: 12px;
    line-height: 1.45;
  }

  .day-event-list {
    display: grid;
    gap: 8px;
    padding: 14px;
  }

  .day-event {
    min-height: 42px;
    border: 1px solid #273244;
    border-radius: 14px;
    display: grid;
    grid-template-columns: 1fr auto 26px;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: #111827;
  }

  .day-event.plus {
    border-color: rgba(16,185,129,.35);
    background: rgba(6,78,59,.25);
  }

  .day-event.minus {
    border-color: rgba(244,63,94,.35);
    background: rgba(127,29,29,.24);
  }

  .day-event span {
    color: #cbd5e1;
    font-size: 12px;
    line-height: 1.35;
  }

  .day-event button {
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: 9px;
    display: grid;
    place-items: center;
    color: #94a3b8;
    background: rgba(255,255,255,.06);
    cursor: pointer;
  }

  .rules-directory {
    min-width: 0;
    min-height: 0;
    border-left: 1px solid #1f2937;
    padding: 18px 14px;
    background: #070d1a;
    overflow: auto;
  }

  .rules-directory h3 {
    margin: 0 0 16px;
    color: #94a3b8;
    font-size: 22px;
    letter-spacing: .12em;
    text-transform: uppercase;
  }

  .rules-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .rule-card {
    min-height: 42px;
    border: 1px solid #273244;
    border-radius: 13px;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    background: #111827;
    font: inherit;
    font-weight: 850;
    cursor: pointer;
    text-align: left;
  }

  .rule-card span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rule-card.plus {
    color: #10b981;
    border-color: rgba(16,185,129,.45);
    background: rgba(6,78,59,.34);
  }

  .rule-card.minus {
    color: #fb7185;
    border-color: rgba(244,63,94,.45);
    background: rgba(127,29,29,.32);
  }

  .score-edit-footer {
    min-height: 76px;
    border-top: 1px solid #1f2937;
    display: grid;
    grid-template-columns: 110px 90px 130px auto 1.4fr;
    align-items: center;
    gap: 16px;
    padding: 12px 16px;
    background: #050914;
  }

  .score-edit-footer strong {
    font-size: 18px;
    font-weight: 950;
  }

  .footer-status {
    color: #fb7185;
  }

  .score-edit-footer button {
    height: 46px;
    border: 0;
    border-radius: 14px;
    color: #ffffff;
    background: var(--desktop-accent, #3b82f6);
    font: inherit;
    font-weight: 950;
    text-transform: uppercase;
    cursor: pointer;
  }


  .score-add-panel,
  .day-record-panel {
    height: 100%;
    min-height: 326px;
  }

  .day-record-panel {
    display: grid;
    grid-template-rows: auto 1fr;
  }

  .score-custom-form.drop-ready,
  .matrix-cell.drop-ready {
    outline: 2px solid var(--desktop-accent, #3b82f6);
    outline-offset: -2px;
    background: color-mix(in srgb, var(--desktop-accent, #3b82f6) 15%, #111827);
  }

  .matrix-content {
    position: relative;
    overflow: visible;
    z-index: 10;
  }

  .matrix-content span {
    position: relative;
    width: max-content;
    max-width: 100%;
    cursor: help;
  }

  .matrix-content span:hover::after {
    content: attr(data-tooltip);
    position: absolute;
    left: 0;
    bottom: calc(100% + 8px);
    z-index: 999;
    width: max-content;
    max-width: 320px;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 9px 11px;
    color: #f8fafc;
    background: #020617;
    box-shadow: 0 16px 42px rgba(0,0,0,.42);
    font-size: 12px;
    font-weight: 800;
    line-height: 1.4;
    white-space: normal;
    text-align: left;
  }

  .score-edit-footer .footer-plus,
  .score-edit-footer .footer-minus,
  .score-edit-footer .footer-final-total,
  .score-edit-footer .footer-status {
    min-height: 52px;
    border: 1px solid #273244;
    border-radius: 14px;
    display: grid;
    place-items: center;
    padding: 0 12px;
    background: #0b1220;
  }

  .score-edit-footer .footer-plus {
    color: #10b981;
  }

  .score-edit-footer .footer-minus {
    color: #fb7185;
  }

  .score-edit-footer .footer-final-total {
    color: #ffffff;
  }

  .footer-status {
    min-width: 74px;
    color: #ffffff;
  }

  .footer-status.good {
    border-color: rgba(16,185,129,.45);
    background: rgba(6,78,59,.55);
  }

  .footer-status.warning {
    color: #fef3c7;
    border-color: rgba(245,158,11,.55);
    background: rgba(120,53,15,.72);
  }

  .footer-status.orange {
    color: #ffedd5;
    border-color: rgba(249,115,22,.55);
    background: rgba(124,45,18,.72);
  }

  .footer-status.danger {
    color: #fecaca;
    border-color: rgba(244,63,94,.58);
    background: rgba(127,29,29,.72);
  }

  .rule-card {
    user-select: none;
  }

  .rule-card:active {
    cursor: grabbing;
  }


  .win-root.theme-light .score-edit-backdrop {
    background: rgba(15, 23, 42, .32);
  }

  .win-root.theme-light .score-edit-modal,
  .win-root.theme-light .score-edit-header,
  .win-root.theme-light .score-edit-left,
  .win-root.theme-light .rules-directory,
  .win-root.theme-light .score-edit-footer {
    color: #0f172a;
    border-color: #d7dee8;
    background: #f8fafc;
  }

  .win-root.theme-light .week-matrix,
  .win-root.theme-light .score-add-panel,
  .win-root.theme-light .day-record-panel,
  .win-root.theme-light .score-custom-form,
  .win-root.theme-light .day-event,
  .win-root.theme-light .small-action,
  .win-root.theme-light .day-tabs button,
  .win-root.theme-light .form-row select,
  .win-root.theme-light .form-row input,
  .win-root.theme-light .score-edit-close {
    color: #0f172a;
    border-color: #d7dee8;
    background: #ffffff;
  }

  .win-root.theme-light .matrix-cell,
  .win-root.theme-light .day-record-head {
    border-color: #d7dee8;
  }

  .win-root.theme-light .matrix-head,
  .win-root.theme-light .matrix-label,
  .win-root.theme-light .day-record-head strong {
    color: #0f172a;
  }

  .win-root.theme-light .matrix-cell,
  .win-root.theme-light .day-record-head span,
  .win-root.theme-light .empty-day-record,
  .win-root.theme-light .score-edit-header span,
  .win-root.theme-light .score-edit-section-title,
  .win-root.theme-light .rules-directory h3 {
    color: #475569;
  }

  .win-root.theme-light .day-event.plus,
  .win-root.theme-light .rule-card.plus {
    color: #047857;
    border-color: #a7f3d0;
    background: #ecfdf5;
  }

  .win-root.theme-light .day-event.minus,
  .win-root.theme-light .rule-card.minus {
    color: #e11d48;
    border-color: #fecdd3;
    background: #fff1f2;
  }


  .win-root.theme-light .score-edit-footer .footer-plus,
  .win-root.theme-light .score-edit-footer .footer-minus,
  .win-root.theme-light .score-edit-footer .footer-final-total,
  .win-root.theme-light .score-edit-footer .footer-status {
    border-color: #d7dee8;
    background: #ffffff;
  }

  .win-root.theme-light .score-edit-footer .footer-plus {
    color: #047857;
  }

  .win-root.theme-light .score-edit-footer .footer-minus {
    color: #e11d48;
  }

  .win-root.theme-light .score-edit-footer .footer-final-total {
    color: #0f172a;
  }

  .win-root.theme-light .footer-status.good {
    color: #047857;
    border-color: #a7f3d0;
    background: #ecfdf5;
  }

  .win-root.theme-light .footer-status.warning {
    color: #a16207;
    border-color: #fde68a;
    background: #fffbeb;
  }

  .win-root.theme-light .footer-status.orange {
    color: #c2410c;
    border-color: #fed7aa;
    background: #fff7ed;
  }

  .win-root.theme-light .footer-status.danger {
    color: #e11d48;
    border-color: #fecdd3;
    background: #fff1f2;
  }

  .win-root.theme-light .matrix-content span:hover::after {
    color: #0f172a;
    border-color: #cbd5e1;
    background: #ffffff;
  }

  .win-root.theme-light .score-custom-form.drop-ready,
  .win-root.theme-light .matrix-cell.drop-ready {
    background: color-mix(in srgb, var(--desktop-accent, #2563eb) 12%, #ffffff);
  }


  @media (max-width: 1100px) {
    .score-edit-body,
    .score-edit-columns {
      grid-template-columns: 1fr;
    }

    .score-edit-footer {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .score-edit-footer button {
      grid-column: 1 / -1;
    }

    .rules-directory {
      border-left: 0;
      border-top: 1px solid #1f2937;
    }

    .score-edit-modal {
      height: calc(100vh - 50px);
    }
  }



  /* Score edit modal polish v2 */
  .score-edit-backdrop {
    padding: 8px;
  }

  .score-edit-modal {
    width: calc(100vw - 20px);
    height: calc(100vh - 28px);
    max-width: none;
    max-height: none;
    border-radius: 24px;
  }

  .score-edit-body {
    grid-template-columns: minmax(0, 1fr) 370px;
  }

  .score-edit-left {
    gap: 12px;
    padding: 14px 16px 12px;
  }

  .week-matrix {
    overflow: visible;
    border-radius: 18px;
  }

  .matrix-cell {
    position: relative;
  }

  .matrix-content {
    overflow: visible;
    z-index: 30;
  }

  .matrix-content span {
    display: block;
    position: relative;
    width: 100%;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: help;
  }

  .matrix-content span:hover::after {
    content: attr(data-tooltip);
    position: absolute;
    left: 0;
    bottom: calc(100% + 9px);
    z-index: 9999;
    width: max-content;
    max-width: 360px;
    border: 1px solid #334155;
    border-radius: 14px;
    padding: 10px 12px;
    color: #f8fafc;
    background: #020617;
    box-shadow: 0 18px 52px rgba(0,0,0,.48);
    font-size: 12px;
    font-weight: 800;
    line-height: 1.45;
    white-space: normal;
    text-align: left;
    pointer-events: none;
  }

  .score-edit-columns {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;
  }

  .score-add-panel,
  .day-record-panel {
    height: 100%;
    min-height: 318px;
    border-radius: 22px;
  }

  .day-record-panel {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .day-event-list {
    min-height: 0;
    max-height: 100%;
    overflow-y: auto;
    align-content: start;
    align-items: start;
    grid-auto-rows: max-content;
    padding: 12px 14px 14px;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--desktop-accent, #3b82f6) 70%, #334155) #0b1220;
  }

  .day-event-list::-webkit-scrollbar {
    width: 9px;
  }

  .day-event-list::-webkit-scrollbar-track {
    background: #0b1220;
    border-radius: 999px;
  }

  .day-event-list::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--desktop-accent, #3b82f6) 70%, #334155);
    border: 2px solid #0b1220;
    border-radius: 999px;
  }

  .day-event {
    min-height: 42px;
    height: auto;
    border-radius: 15px;
    padding: 9px 11px;
  }

  .day-event.plus,
  .day-event.minus {
    min-height: 42px;
  }

  .score-edit-footer {
    grid-template-columns: 112px 92px 142px auto 1fr;
    gap: 12px;
  }

  .score-edit-footer .footer-plus,
  .score-edit-footer .footer-minus,
  .score-edit-footer .footer-final-total,
  .score-edit-footer .footer-status {
    min-height: 50px;
    border: 1px solid #273244;
    border-radius: 15px;
    display: grid;
    place-items: center;
    padding: 0 12px;
    background: #0b1220;
  }

  .score-edit-footer .footer-plus {
    color: #10b981;
  }

  .score-edit-footer .footer-minus {
    color: #fb7185;
  }

  .score-edit-footer .footer-final-total {
    min-width: 132px;
    color: #ffffff;
    font-size: 16px;
    letter-spacing: .01em;
  }

  .score-edit-footer .footer-status {
    min-width: 76px;
    color: #ffffff;
  }

  .footer-status.good {
    border-color: rgba(16,185,129,.45);
    background: rgba(6,78,59,.68);
  }

  .footer-status.warning {
    color: #fef3c7;
    border-color: rgba(245,158,11,.58);
    background: rgba(120,53,15,.78);
  }

  .footer-status.orange {
    color: #ffedd5;
    border-color: rgba(249,115,22,.58);
    background: rgba(124,45,18,.78);
  }

  .footer-status.danger {
    color: #fecaca;
    border-color: rgba(244,63,94,.62);
    background: rgba(127,29,29,.78);
  }

  .win-root.theme-light .matrix-content span:hover::after {
    color: #0f172a;
    border-color: #cbd5e1;
    background: #ffffff;
    box-shadow: 0 18px 52px rgba(15,23,42,.18);
  }

  .win-root.theme-light .day-event-list {
    scrollbar-color: color-mix(in srgb, var(--desktop-accent, #2563eb) 65%, #94a3b8) #f1f5f9;
  }

  .win-root.theme-light .day-event-list::-webkit-scrollbar-track {
    background: #f1f5f9;
  }

  .win-root.theme-light .day-event-list::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--desktop-accent, #2563eb) 65%, #94a3b8);
    border-color: #f1f5f9;
  }

  .win-root.theme-light .score-edit-footer .footer-plus,
  .win-root.theme-light .score-edit-footer .footer-minus,
  .win-root.theme-light .score-edit-footer .footer-final-total,
  .win-root.theme-light .score-edit-footer .footer-status {
    border-color: #d7dee8;
    background: #ffffff;
  }

  .win-root.theme-light .score-edit-footer .footer-plus {
    color: #047857;
  }

  .win-root.theme-light .score-edit-footer .footer-minus {
    color: #e11d48;
  }

  .win-root.theme-light .score-edit-footer .footer-final-total {
    color: #0f172a;
  }

  .win-root.theme-light .footer-status.good {
    color: #047857;
    border-color: #a7f3d0;
    background: #ecfdf5;
  }

  .win-root.theme-light .footer-status.warning {
    color: #a16207;
    border-color: #fde68a;
    background: #fffbeb;
  }

  .win-root.theme-light .footer-status.orange {
    color: #c2410c;
    border-color: #fed7aa;
    background: #fff7ed;
  }

  .win-root.theme-light .footer-status.danger {
    color: #e11d48;
    border-color: #fecdd3;
    background: #fff1f2;
  }

  @media (max-width: 1100px) {
    .score-edit-modal {
      width: calc(100vw - 16px);
      height: calc(100vh - 16px);
    }

    .score-edit-body,
    .score-edit-columns {
      grid-template-columns: 1fr;
    }

    .score-edit-footer {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .score-edit-footer button {
      grid-column: 1 / -1;
    }
  }


  /* Score edit compact + side tooltip v3 */
  .score-edit-backdrop {
    padding: 10px 14px 18px;
    align-items: start;
    overflow: hidden;
  }

  .score-edit-modal {
    width: min(1480px, calc(100vw - 32px));
    height: min(760px, calc(100vh - 72px));
    max-width: none;
    max-height: none;
    border-radius: 22px;
  }

  .score-edit-header {
    padding: 12px 16px;
  }

  .score-edit-header h2 {
    font-size: 18px;
  }

  .score-edit-body {
    min-height: 0;
    grid-template-columns: minmax(0, 1fr) 360px;
  }

  .score-edit-left {
    min-height: 0;
    gap: 10px;
    padding: 12px 14px;
    overflow: auto;
  }

  .score-week-table {
    gap: 8px;
  }

  .week-matrix {
    border-radius: 16px;
    overflow: visible;
  }

  .matrix-cell {
    min-height: 36px;
    padding: 7px 9px;
    position: relative;
  }

  .day-tabs button,
  .small-action {
    height: 36px;
    min-width: 62px;
  }

  .score-edit-columns {
    min-height: 0;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;
  }

  .score-add-panel,
  .day-record-panel {
    height: 100%;
    min-height: 260px;
    max-height: 306px;
    border-radius: 20px;
  }

  .day-record-panel {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .score-add-panel {
    padding: 14px;
  }

  .score-custom-form {
    padding: 12px;
  }

  .form-row {
    grid-template-columns: 106px 1fr 84px;
  }

  .form-row select,
  .form-row input {
    height: 40px;
  }

  .score-add-button {
    height: 42px;
  }

  .day-record-head {
    padding: 13px 15px;
  }

  .day-event-list {
    min-height: 0;
    max-height: 100%;
    overflow-y: auto;
    align-content: start;
    align-items: start;
    grid-auto-rows: max-content;
    padding: 10px 12px 12px;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--desktop-accent, #3b82f6) 70%, #334155) #0b1220;
  }

  .day-event-list::-webkit-scrollbar {
    width: 8px;
  }

  .day-event-list::-webkit-scrollbar-track {
    background: #0b1220;
    border-radius: 999px;
  }

  .day-event-list::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--desktop-accent, #3b82f6) 70%, #334155);
    border: 2px solid #0b1220;
    border-radius: 999px;
  }

  .day-event {
    min-height: 40px;
    height: auto;
    border-radius: 14px;
    padding: 8px 10px;
  }

  .rules-directory {
    padding: 14px 12px;
  }

  .rules-directory h3 {
    margin-bottom: 12px;
    font-size: 20px;
  }

  .rules-grid {
    gap: 8px;
  }

  .rule-card {
    min-height: 38px;
    border-radius: 12px;
  }

  .score-edit-footer {
    min-height: 64px;
    grid-template-columns: 108px 86px 132px auto 1fr;
    gap: 10px;
    padding: 10px 14px;
  }

  .score-edit-footer .footer-plus,
  .score-edit-footer .footer-minus,
  .score-edit-footer .footer-final-total,
  .score-edit-footer .footer-status {
    min-height: 44px;
    border: 1px solid #273244;
    border-radius: 14px;
    display: grid;
    place-items: center;
    padding: 0 10px;
    background: #0b1220;
  }

  .score-edit-footer .footer-plus {
    color: #10b981;
  }

  .score-edit-footer .footer-minus {
    color: #fb7185;
  }

  .score-edit-footer .footer-final-total {
    color: #ffffff;
    font-size: 15px;
    letter-spacing: .01em;
  }

  .score-edit-footer .footer-status {
    min-width: 72px;
    color: #ffffff;
  }

  .footer-status.good {
    border-color: rgba(16,185,129,.45);
    background: rgba(6,78,59,.68);
  }

  .footer-status.warning {
    color: #fef3c7;
    border-color: rgba(245,158,11,.58);
    background: rgba(120,53,15,.78);
  }

  .footer-status.orange {
    color: #ffedd5;
    border-color: rgba(249,115,22,.58);
    background: rgba(124,45,18,.78);
  }

  .footer-status.danger {
    color: #fecaca;
    border-color: rgba(244,63,94,.62);
    background: rgba(127,29,29,.78);
  }

  .matrix-content {
    position: relative;
    overflow: visible;
    z-index: 20;
  }

  .matrix-content span {
    display: block;
    position: relative;
    width: 100%;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: help;
  }

  .matrix-content span:hover {
    overflow: visible;
    z-index: 999;
  }

  .matrix-content span:hover::after {
    content: attr(data-tooltip);
    position: absolute;
    left: calc(100% + 12px);
    top: 50%;
    transform: translateY(-50%);
    z-index: 9999;
    width: max-content;
    max-width: 360px;
    border: 1px solid #334155;
    border-radius: 14px;
    padding: 10px 12px;
    color: #f8fafc;
    background: #020617;
    box-shadow: 0 18px 52px rgba(0,0,0,.48);
    font-size: 12px;
    font-weight: 850;
    line-height: 1.45;
    white-space: normal;
    text-align: left;
    pointer-events: none;
  }

  .matrix-content span:hover::before {
    content: "";
    position: absolute;
    left: calc(100% + 6px);
    top: 50%;
    transform: translateY(-50%);
    z-index: 10000;
    border-top: 6px solid transparent;
    border-bottom: 6px solid transparent;
    border-right: 6px solid #020617;
    pointer-events: none;
  }

  .scoreboard-actionbar {
    margin: 14px 22px 0;
    border: 1px solid #273244;
    border-radius: 22px;
    padding: 12px 14px;
    background: #0b1220;
  }

  .scoreboard-actionbar + .scoreboard-content {
    padding-top: 18px;
  }

  .win-root.theme-light .scoreboard-actionbar {
    border-color: #d7dee8;
    background: #ffffff;
  }

  .win-root.theme-light .day-event-list {
    scrollbar-color: color-mix(in srgb, var(--desktop-accent, #2563eb) 65%, #94a3b8) #f1f5f9;
  }

  .win-root.theme-light .day-event-list::-webkit-scrollbar-track {
    background: #f1f5f9;
  }

  .win-root.theme-light .day-event-list::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--desktop-accent, #2563eb) 65%, #94a3b8);
    border-color: #f1f5f9;
  }

  .win-root.theme-light .matrix-content span:hover::after {
    color: #0f172a;
    border-color: #cbd5e1;
    background: #ffffff;
    box-shadow: 0 18px 52px rgba(15,23,42,.18);
  }

  .win-root.theme-light .matrix-content span:hover::before {
    border-right-color: #ffffff;
  }

  .win-root.theme-light .score-edit-footer .footer-plus,
  .win-root.theme-light .score-edit-footer .footer-minus,
  .win-root.theme-light .score-edit-footer .footer-final-total,
  .win-root.theme-light .score-edit-footer .footer-status {
    border-color: #d7dee8;
    background: #ffffff;
  }

  .win-root.theme-light .score-edit-footer .footer-plus {
    color: #047857;
  }

  .win-root.theme-light .score-edit-footer .footer-minus {
    color: #e11d48;
  }

  .win-root.theme-light .score-edit-footer .footer-final-total {
    color: #0f172a;
  }

  .win-root.theme-light .footer-status.good {
    color: #047857;
    border-color: #a7f3d0;
    background: #ecfdf5;
  }

  .win-root.theme-light .footer-status.warning {
    color: #a16207;
    border-color: #fde68a;
    background: #fffbeb;
  }

  .win-root.theme-light .footer-status.orange {
    color: #c2410c;
    border-color: #fed7aa;
    background: #fff7ed;
  }

  .win-root.theme-light .footer-status.danger {
    color: #e11d48;
    border-color: #fecdd3;
    background: #fff1f2;
  }

  @media (max-width: 1100px) {
    .score-edit-modal {
      width: calc(100vw - 16px);
      height: calc(100vh - 16px);
    }

    .score-edit-body,
    .score-edit-columns {
      grid-template-columns: 1fr;
    }

    .score-edit-footer {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .score-edit-footer button {
      grid-column: 1 / -1;
    }

    .matrix-content span:hover::after {
      left: 0;
      top: calc(100% + 10px);
      transform: none;
    }

    .matrix-content span:hover::before {
      display: none;
    }
  }



  .score-edit-modal .form-row {
    grid-template-columns: 116px minmax(0, 1fr) 96px;
  }

  /* Modal form dropdown + violation count v4 */
  .score-edit-modal .score-add-panel,
  .score-edit-modal .score-custom-form,
  .score-edit-modal .form-row {
    overflow: visible;
  }

  .score-edit-modal .category-picker {
    position: relative;
    min-width: 0;
    z-index: 80;
  }

  .score-edit-modal .category-picker .filter-select-button {
    height: 40px;
    border-radius: 14px;
    color: #f8fafc;
    background: #0b1220;
  }

  .score-edit-modal .category-picker .filter-select-menu {
    top: calc(100% + 8px);
    border-radius: 16px;
    background: #1f2937;
    box-shadow: 0 20px 58px rgba(0,0,0,.42);
    z-index: 9999;
  }

  .score-edit-modal .category-picker .filter-select-option {
    min-height: 38px;
    color: #f8fafc;
    font-weight: 500;
  }

  .score-edit-modal .category-picker .filter-select-option.active,
  .score-edit-modal .category-picker .filter-select-option:hover {
    background: #374151;
  }

  .count-box {
    min-width: 0;
    height: 40px;
    border: 1px solid #273244;
    border-radius: 14px;
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    color: #94a3b8;
    background: #0b1220;
  }

  .count-box span {
    font-size: 11px;
    font-weight: 950;
    text-transform: uppercase;
    letter-spacing: .06em;
  }

  .count-box input {
    height: 100% !important;
    border: 0 !important;
    border-radius: 0 !important;
    padding: 0 !important;
    color: #f8fafc !important;
    background: transparent !important;
    text-align: right;
    font-weight: 950;
  }

  .count-box input::-webkit-outer-spin-button,
  .count-box input::-webkit-inner-spin-button {
    margin: 0;
  }

  .score-form-hint {
    min-height: 28px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-top: 8px;
    padding: 0 4px;
    color: #94a3b8;
    font-size: 12px;
    font-weight: 800;
  }

  .score-form-hint strong {
    color: #f8fafc;
    font-weight: 950;
  }

  .win-root.theme-light .score-edit-modal .category-picker .filter-select-button,
  .win-root.theme-light .count-box {
    color: #0f172a;
    border-color: #d7dee8;
    background: #ffffff;
  }

  .win-root.theme-light .score-edit-modal .category-picker .filter-select-menu,
  .win-root.theme-light .score-edit-modal .category-picker .filter-select-option {
    color: #0f172a;
    border-color: #d7dee8;
    background: #ffffff;
  }

  .win-root.theme-light .score-edit-modal .category-picker .filter-select-option.active,
  .win-root.theme-light .score-edit-modal .category-picker .filter-select-option:hover {
    background: #e2e8f0;
  }

  .win-root.theme-light .count-box span,
  .win-root.theme-light .score-form-hint {
    color: #475569;
  }

  .win-root.theme-light .count-box input,
  .win-root.theme-light .score-form-hint strong {
    color: #0f172a !important;
  }


  /* Modal form spacing v5 */
  .score-edit-modal .score-custom-form {
    display: grid;
    gap: 12px;
  }

  .score-edit-modal .form-row {
    grid-template-columns: minmax(118px, .75fr) minmax(240px, 1.7fr) minmax(104px, .65fr);
    gap: 12px;
    align-items: center;
  }

  .score-edit-modal .category-picker,
  .score-edit-modal .form-row > input,
  .score-edit-modal .count-box {
    width: 100%;
  }

  .score-edit-modal .category-picker .filter-select-button,
  .score-edit-modal .form-row > input,
  .score-edit-modal .count-box {
    height: 42px;
  }

  .score-edit-modal .form-row > input {
    min-width: 0;
  }

  .count-box {
    justify-content: stretch;
  }

  .count-box input {
    width: 100%;
  }

  .score-form-hint {
    display: none !important;
  }

  @media (max-width: 720px) {
    .score-edit-modal .form-row {
      grid-template-columns: 1fr;
    }
  }


  /* Score edit full-fit + lighter dropdown v6 */
  .score-edit-backdrop {
    padding: 8px;
    align-items: stretch;
    justify-items: stretch;
    overflow: hidden;
  }

  .score-edit-modal {
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    border-radius: 22px;
  }

  .score-edit-body {
    min-height: 0;
    grid-template-columns: minmax(0, 1fr) 360px;
  }

  .score-edit-left {
    min-height: 0;
    overflow: auto;
  }

  .score-week-table {
    min-height: 0;
  }

  .score-edit-columns {
    min-height: 0;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;
  }

  .score-add-panel,
  .day-record-panel {
    height: 100%;
    min-height: 0;
    max-height: none;
  }

  .day-record-panel {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .day-event-list {
    min-height: 0;
    max-height: none;
    overflow-y: auto;
  }

  .score-edit-footer {
    min-height: 66px;
    flex-shrink: 0;
  }

  .score-edit-modal .category-picker .filter-select-button {
    font-weight: 500;
  }

  .score-edit-modal .category-picker .filter-select-option {
    font-weight: 500;
  }

  .score-edit-modal .category-picker .filter-select-option.active {
    font-weight: 600;
  }

  .score-edit-modal .category-picker .filter-select-option:hover {
    font-weight: 500;
  }

  @media (max-height: 760px) {
    .score-edit-header {
      padding-top: 10px;
      padding-bottom: 10px;
    }

    .score-edit-left {
      gap: 8px;
      padding-top: 10px;
      padding-bottom: 10px;
    }

    .matrix-cell {
      min-height: 34px;
      padding-top: 6px;
      padding-bottom: 6px;
    }

    .day-tabs button,
    .small-action {
      height: 34px;
    }

    .score-edit-footer {
      min-height: 58px;
      padding-top: 8px;
      padding-bottom: 8px;
    }
  }

  @media (max-width: 980px) {
    .scoreboard-app,
    .scoreboard-header,
    .score-grid-2,
    .profile-layout,
    .score-kpi-grid {
      grid-template-columns: 1fr;
    }

    .scoreboard-left-tools {
      border-right: 0;
      border-bottom: 1px solid #1f2937;
    }

    .scoreboard-actionbar {
      justify-content: flex-start;
    }

    .scoreboard-tabs,
    .toolbar-actions {
      width: 100%;
      overflow: auto;
    }

    .toolbar-button {
      min-width: max-content;
    }

    .form-grid {
      grid-template-columns: 1fr;
    }
  }
`;

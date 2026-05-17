import { X, Zap, RotateCcw } from "lucide-react";
import { FilterSelect } from "./FilterSelect";
import { DragEvent, useMemo, useState } from "react";
import {
  categoryLabel,
  formatScore,
  quickScoreReasons,
  ScoreCategory,
  ScoreEvent,
  StudentScoreSummary,
} from "../data/mockScoreData";

type ScoreEditModalProps = {
  student: StudentScoreSummary;
  week: number;
  events: ScoreEvent[];
  onAddScore: (event: Omit<ScoreEvent, "id">) => void;
  onDeleteScore: (eventId: string) => void;
  onClose: () => void;
};

type QuickRule = (typeof quickScoreReasons)[number];

const RULE_DRAG_TYPE = "application/x-score-rule";

const categoryOptions: Array<{ value: ScoreCategory; label: string }> = [
  { value: "HOC_TAP", label: "Học tập" },
  { value: "NE_NEP", label: "Nề nếp" },
  { value: "PHONG_TRAO", label: "Phong trào" },
];

function defaultPointByCategory(category: ScoreCategory) {
  if (category === "NE_NEP") return -50;
  if (category === "PHONG_TRAO") return 50;
  return 5;
}

const days = [
  { key: 2, label: "T2", full: "Thứ 2" },
  { key: 3, label: "T3", full: "Thứ 3" },
  { key: 4, label: "T4", full: "Thứ 4" },
  { key: 5, label: "T5", full: "Thứ 5" },
  { key: 6, label: "T6", full: "Thứ 6" },
  { key: 7, label: "T7", full: "Thứ 7" },
  { key: 0, label: "CN", full: "Chủ nhật" },
];

function isHiddenSheetTotal(event: ScoreEvent) {
  return String(event.note || "").includes("__SHEET_TOTAL__");
}

function weekdayNumber(value: string) {
  return new Date(value).getDay();
}

function newEventDateForDay(day: number) {
  const now = new Date();
  const current = now.getDay();
  const diff = day - current;
  now.setDate(now.getDate() + diff);
  now.setHours(7, 15, 0, 0);
  return now.toISOString();
}

function summarizeDay(events: ScoreEvent[], day: number) {
  const dayEvents = events.filter((event) => weekdayNumber(event.createdAt) === day && !isHiddenSheetTotal(event));
  const plus = dayEvents.filter((event) => event.points > 0);
  const minus = dayEvents.filter((event) => event.points < 0);

  return {
    plus,
    minus,
    plusTotal: plus.reduce((sum, event) => sum + event.points, 0),
    minusTotal: minus.reduce((sum, event) => sum + event.points, 0),
  };
}

function shortTitle(title: string) {
  return title.length > 18 ? `${title.slice(0, 18)}...` : title;
}

function tooltipText(event: ScoreEvent) {
  const day = days.find((item) => item.key === weekdayNumber(event.createdAt))?.full || "Không rõ ngày";
  return `${day} • ${categoryLabel(event.category)} • ${event.title} • ${formatScore(event.points)}`;
}

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("tốt")) return "good";
  if (normalized.includes("khá")) return "warning";
  if (normalized.includes("đạt") && !normalized.includes("chưa")) return "orange";
  return "danger";
}

function encodeRule(rule: QuickRule) {
  return JSON.stringify(rule);
}

function readDraggedRule(event: DragEvent) {
  const raw = event.dataTransfer.getData(RULE_DRAG_TYPE) || event.dataTransfer.getData("text/plain");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as QuickRule;
    if (!parsed?.title || typeof parsed.points !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function ScoreEditModal({
  student,
  week,
  events,
  onAddScore,
  onDeleteScore,
  onClose,
}: ScoreEditModalProps) {
  const [activeDay, setActiveDay] = useState(2);
  const [category, setCategory] = useState<ScoreCategory>("HOC_TAP");
  const [title, setTitle] = useState("");
  const [violationCount, setViolationCount] = useState(1);
  const [pointPerCount, setPointPerCount] = useState(defaultPointByCategory("HOC_TAP"));
  const [dropHintDay, setDropHintDay] = useState<number | null>(null);
  const [inputDropActive, setInputDropActive] = useState(false);

  const weekEvents = useMemo(
    () => events.filter((event) => event.studentId === student.id && event.week === week),
    [events, student.id, week]
  );

  const activeDayEvents = useMemo(
    () => weekEvents.filter((event) => weekdayNumber(event.createdAt) === activeDay && !isHiddenSheetTotal(event)),
    [activeDay, weekEvents]
  );

  const visibleWeekEvents = weekEvents.filter((event) => !isHiddenSheetTotal(event));
  const plusTotal = visibleWeekEvents.filter((event) => event.points > 0).reduce((sum, event) => sum + event.points, 0);
  const minusTotal = visibleWeekEvents.filter((event) => event.points < 0).reduce((sum, event) => sum + event.points, 0);
  const total = weekEvents.reduce((sum, event) => sum + event.points, 0);

  const changeCategory = (nextCategory: ScoreCategory) => {
    setCategory(nextCategory);
    setPointPerCount(defaultPointByCategory(nextCategory));
  };

  const addScoreToDay = (
    payload: {
      title: string;
      points: number;
      category: ScoreCategory;
    },
    day = activeDay
  ) => {
    const cleanTitle = payload.title.trim();
    if (!cleanTitle || !payload.points) return;

    onAddScore({
      studentId: student.id,
      week,
      title: cleanTitle,
      points: payload.points,
      type: payload.points >= 0 ? "CONG" : "TRU",
      category: payload.category,
      createdBy: "Local",
      createdAt: newEventDateForDay(day),
    });
  };

  const handleCustomAdd = () => {
    const count = Math.max(1, Math.trunc(Number(violationCount) || 1));
    addScoreToDay({ title, points: pointPerCount * count, category });
    setTitle("");
    setViolationCount(1);
  };

  const handleQuickRule = (rule: QuickRule) => {
    addScoreToDay({
      title: rule.title,
      points: rule.points,
      category: rule.category,
    });
  };

  const handleRuleDragStart = (event: DragEvent<HTMLButtonElement>, rule: QuickRule) => {
    const raw = encodeRule(rule);
    event.dataTransfer.setData(RULE_DRAG_TYPE, raw);
    event.dataTransfer.setData("text/plain", raw);
    event.dataTransfer.effectAllowed = "copy";
  };

  const dropRuleIntoForm = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rule = readDraggedRule(event);
    setInputDropActive(false);
    if (!rule) return;

    setTitle(rule.title);
    setPointPerCount(rule.points);
    setViolationCount(1);
    setCategory(rule.category);
  };

  const dropRuleIntoDay = (event: DragEvent<HTMLDivElement>, day: number) => {
    event.preventDefault();
    const rule = readDraggedRule(event);
    setDropHintDay(null);
    if (!rule) return;

    setActiveDay(day);
    addScoreToDay(
      {
        title: rule.title,
        points: rule.points,
        category: rule.category,
      },
      day
    );
  };

  return (
    <div className="score-edit-backdrop" role="dialog" aria-modal="true">
      <div className="score-edit-modal">
        <header className="score-edit-header">
          <div>
            <span>Data records</span>
            <h2>
              Chấm điểm: <b>{student.name}</b>
            </h2>
          </div>

          <button type="button" className="score-edit-close" onClick={onClose} title="Đóng">
            <X size={20} />
          </button>
        </header>

        <section className="score-edit-body">
          <div className="score-edit-left">
            <div className="score-week-table">
              <div className="score-edit-section-title">Bảng tổng quan tuần</div>
              <div className="week-matrix">
                <div className="matrix-cell matrix-head">Nội dung</div>
                {days.map((day) => (
                  <div
                    className={`matrix-cell matrix-head day-head ${dropHintDay === day.key ? "drop-ready" : ""}`}
                    key={day.key}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDropHintDay(day.key);
                    }}
                    onDragLeave={() => setDropHintDay(null)}
                    onDrop={(event) => dropRuleIntoDay(event, day.key)}
                  >
                    {day.label}
                  </div>
                ))}

                <div className="matrix-cell matrix-label">Điểm (+)</div>
                {days.map((day) => {
                  const data = summarizeDay(weekEvents, day.key);
                  return (
                    <div
                      className={`matrix-cell matrix-drop-cell ${dropHintDay === day.key ? "drop-ready" : ""}`}
                      key={`plus-${day.key}`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDropHintDay(day.key);
                      }}
                      onDragLeave={() => setDropHintDay(null)}
                      onDrop={(event) => dropRuleIntoDay(event, day.key)}
                    >
                      {data.plusTotal ? formatScore(data.plusTotal) : "-"}
                    </div>
                  );
                })}

                <div className="matrix-cell matrix-label">Điểm (-)</div>
                {days.map((day) => {
                  const data = summarizeDay(weekEvents, day.key);
                  return (
                    <div
                      className={`matrix-cell matrix-drop-cell ${dropHintDay === day.key ? "drop-ready" : ""}`}
                      key={`minus-${day.key}`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDropHintDay(day.key);
                      }}
                      onDragLeave={() => setDropHintDay(null)}
                      onDrop={(event) => dropRuleIntoDay(event, day.key)}
                    >
                      {data.minusTotal ? data.minusTotal : "-"}
                    </div>
                  );
                })}

                <div className="matrix-cell matrix-label">Nội dung (+)</div>
                {days.map((day) => {
                  const data = summarizeDay(weekEvents, day.key);
                  return (
                    <div
                      className={`matrix-cell matrix-content matrix-drop-cell ${dropHintDay === day.key ? "drop-ready" : ""}`}
                      key={`plus-title-${day.key}`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDropHintDay(day.key);
                      }}
                      onDragLeave={() => setDropHintDay(null)}
                      onDrop={(event) => dropRuleIntoDay(event, day.key)}
                    >
                      {data.plus.length
                        ? data.plus.map((event) => (
                            <span key={event.id} data-tooltip={tooltipText(event)}>
                              • {shortTitle(event.title)}
                            </span>
                          ))
                        : "-"}
                    </div>
                  );
                })}

                <div className="matrix-cell matrix-label">Nội dung (-)</div>
                {days.map((day) => {
                  const data = summarizeDay(weekEvents, day.key);
                  return (
                    <div
                      className={`matrix-cell matrix-content matrix-drop-cell ${dropHintDay === day.key ? "drop-ready" : ""}`}
                      key={`minus-title-${day.key}`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDropHintDay(day.key);
                      }}
                      onDragLeave={() => setDropHintDay(null)}
                      onDrop={(event) => dropRuleIntoDay(event, day.key)}
                    >
                      {data.minus.length
                        ? data.minus.map((event) => (
                            <span key={event.id} data-tooltip={tooltipText(event)}>
                              • {shortTitle(event.title)}
                            </span>
                          ))
                        : "-"}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="day-tabs">
              {days.map((day) => (
                <button
                  type="button"
                  key={day.key}
                  className={activeDay === day.key ? "active" : ""}
                  onClick={() => setActiveDay(day.key)}
                >
                  {day.label}
                </button>
              ))}
            </div>

            <div className="score-edit-columns">
              <div className="score-add-panel">
                <div className="score-inline-actions">
                  <button type="button" className="small-action disabled">
                    Nháp: tắt khôi phục tạm thời
                  </button>
                  <button type="button" className="small-action disabled">
                    <RotateCcw size={14} />
                    Hoàn tác
                  </button>
                  <button type="button" className="small-action">
                    <Zap size={14} />
                    Mẫu nhanh
                  </button>
                </div>

                <div
                  className={`score-custom-form ${inputDropActive ? "drop-ready" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setInputDropActive(true);
                  }}
                  onDragLeave={() => setInputDropActive(false)}
                  onDrop={dropRuleIntoForm}
                >
                  <div className="form-row">
                    <div className="category-picker">
                      <FilterSelect<ScoreCategory>
                        value={category}
                        options={categoryOptions}
                        onChange={changeCategory}
                      />
                    </div>
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Kéo rule vào đây / nhập nội quy..."
                      onKeyDown={(event) => {
                        if (event.key === "Enter") handleCustomAdd();
                      }}
                    />
                    <div className="count-box" title={`Số lần. Điểm mỗi lần: ${formatScore(pointPerCount)}`}>
                      <span>Lần</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={violationCount}
                        onChange={(event) => setViolationCount(Math.max(1, Math.trunc(Number(event.target.value) || 1)))}
                        placeholder="Số lần"
                      />
                    </div>
                  </div>

                  <button type="button" className="score-add-button" onClick={handleCustomAdd}>
                    Thêm mới (Enter)
                  </button>
                </div>
              </div>

              <div className="day-record-panel">
                <div className="day-record-head">
                  <strong>Ngày {days.find((day) => day.key === activeDay)?.label}</strong>
                  <span>Kéo rule sang bảng tổng quan tuần hoặc ô nhập nội quy để thao tác nhanh.</span>
                </div>

                <div className="day-event-list">
                  {activeDayEvents.length === 0 ? (
                    <div className="empty-day-record">Chưa có nội dung cho ngày này.</div>
                  ) : (
                    activeDayEvents.map((event) => (
                      <div key={event.id} className={`day-event ${event.points >= 0 ? "plus" : "minus"}`}>
                        <span>
                          [{categoryLabel(event.category)}] {event.title}
                        </span>
                        <strong>{formatScore(event.points)}</strong>
                        <button type="button" onClick={() => onDeleteScore(event.id)} title="Xoá dòng này">
                          <X size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <aside className="rules-directory">
            <h3>Rules directory</h3>
            <div className="rules-grid">
              {quickScoreReasons.map((rule, index) => (
                <button
                  key={`${rule.title}-${index}`}
                  type="button"
                  draggable
                  className={rule.points >= 0 ? "rule-card plus" : "rule-card minus"}
                  onClick={() => handleQuickRule(rule)}
                  onDragStart={(event) => handleRuleDragStart(event, rule)}
                  title={`${rule.title} ${formatScore(rule.points)} • kéo vào ô nhập hoặc bảng tuần`}
                >
                  <span>{rule.title}</span>
                  <strong>{formatScore(rule.points)}</strong>
                </button>
              ))}
            </div>
          </aside>
        </section>

        <footer className="score-edit-footer">
          <strong className="footer-plus">{formatScore(plusTotal)}</strong>
          <strong className="footer-minus">{minusTotal}</strong>
          <strong className="footer-final-total">TỔNG {formatScore(total)}</strong>
          <strong className={`footer-status ${statusTone(student.status)}`}>{student.status}</strong>
          <button type="button" onClick={onClose}>Save all changes</button>
        </footer>
      </div>
    </div>
  );
}

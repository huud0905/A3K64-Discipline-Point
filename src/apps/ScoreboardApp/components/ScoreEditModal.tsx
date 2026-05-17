import { X, Zap, RotateCcw } from "lucide-react";
import { FilterSelect } from "./FilterSelect";
import { DragEvent, useEffect, useMemo, useState } from "react";
import {
  categoryLabel,
  formatScore,
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

type QuickRule = {
  title: string;
  points: number;
  type: "CONG" | "TRU";
  category: ScoreCategory;
  note?: string;
};

const RULE_DRAG_TYPE = "application/x-score-rule";

const subjects = [
  "Toán",
  "Vật Lí",
  "Hoá Học",
  "Sinh Học",
  "Tin Học",
  "Ngữ Văn",
  "Lịch Sử",
  "Tiếng Anh",
  "Quốc Phòng",
  "Thể Dục",
  "GDĐP",
  "TNHN",
  "Chào Cờ",
  "SHL",
];

function normalizeCategory(value: unknown): ScoreCategory {
  const raw = String(value || "").toUpperCase();
  if (raw.includes("NỀ") || raw.includes("NE")) return "NE_NEP";
  if (raw.includes("PHONG")) return "PHONG_TRAO";
  return "HOC_TAP";
}

function normalizeType(value: unknown, points: number): "CONG" | "TRU" {
  const raw = String(value || "").toUpperCase();
  if (raw === "CONG" || raw === "TRU") return raw;
  return points >= 0 ? "CONG" : "TRU";
}

function normalizeRules(raw: unknown): QuickRule[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      const record = item as Record<string, unknown>;
      const title = String(record.title ?? record["Tên"] ?? record["ten"] ?? "").trim();
      const points = Number(record.points ?? record["Điểm"] ?? record["diem"] ?? 0);
      if (!title || !Number.isFinite(points)) return null;

      return {
        title,
        points,
        type: normalizeType(record.type ?? record["Tính"] ?? record["tinh"], points),
        category: normalizeCategory(record.category ?? record["Phân loại"] ?? record["phanloai"]),
        note: String(record.note ?? record["Ghi chú"] ?? record["ghichu"] ?? "").trim() || undefined,
      } satisfies QuickRule;
    })
    .filter((item): item is QuickRule => Boolean(item));
}

async function fetchRulesFromGas() {
  const gasUrl = import.meta.env.VITE_GAS_WEB_APP_URL?.trim();
  if (!gasUrl) return [];

  const url = new URL(gasUrl);
  url.searchParams.set("action", "getScoreboard");
  url.searchParams.set("t", String(Date.now()));

  const response = await fetch(url.toString(), { method: "GET", redirect: "follow" });
  if (!response.ok) throw new Error(`Không đọc được VI_PHAM: ${response.status}`);

  const json = await response.json();
  const data = json?.data || json;
  return normalizeRules(data?.quickScoreReasons);
}

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
  return event.title;
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

function formatSavedTitle(day: number, category: ScoreCategory, subject: string, title: string, points: number) {
  const dayLabel = days.find((item) => item.key === day)?.full || "Không rõ ngày";
  return `${dayLabel}: [${categoryLabel(category)}]: [${subject}] ${title} (${formatScore(points)})`;
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
  const [subject, setSubject] = useState(subjects[0]);
  const [category, setCategory] = useState<ScoreCategory>("HOC_TAP");
  const [title, setTitle] = useState("");
  const [violationCount, setViolationCount] = useState(1);
  const [pointPerCount, setPointPerCount] = useState(defaultPointByCategory("HOC_TAP"));
  const [rules, setRules] = useState<QuickRule[]>([]);
  const [rulesStatus, setRulesStatus] = useState("Đang đọc VI_PHAM...");
  const [dropHintDay, setDropHintDay] = useState<number | null>(null);
  const [inputDropActive, setInputDropActive] = useState(false);

  useEffect(() => {
    let mounted = true;

    fetchRulesFromGas()
      .then((nextRules) => {
        if (!mounted) return;
        setRules(nextRules);
        setRulesStatus(nextRules.length ? "" : "Sheet VI_PHAM chưa có dữ liệu hoặc chưa đúng cột.");
      })
      .catch(() => {
        if (!mounted) return;
        setRules([]);
        setRulesStatus("Không đọc được sheet VI_PHAM.");
      });

    return () => {
      mounted = false;
    };
  }, []);

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

    const savedTitle = formatSavedTitle(day, payload.category, subject, cleanTitle, payload.points);

    onAddScore({
      studentId: student.id,
      week,
      title: savedTitle,
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
                    <div className="category-picker subject-picker">
                      <FilterSelect<string>
                        value={subject}
                        options={subjects.map((item) => ({ value: item, label: item }))}
                        onChange={setSubject}
                      />
                    </div>
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Kéo rule từ VI_PHAM vào đây / nhập nội quy..."
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
                        <span>{event.title}</span>
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
            <h3>VI_PHAM</h3>
            {rulesStatus && <p className="rules-status">{rulesStatus}</p>}
            <div className="rules-grid">
              {rules.map((rule, index) => (
                <button
                  key={`${rule.title}-${index}`}
                  type="button"
                  draggable
                  className={rule.points >= 0 ? "rule-card plus" : "rule-card minus"}
                  onClick={() => handleQuickRule(rule)}
                  onDragStart={(event) => handleRuleDragStart(event, rule)}
                  title={`${rule.title} ${formatScore(rule.points)} • ${categoryLabel(rule.category)} • kéo vào ô nhập hoặc bảng tuần`}
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

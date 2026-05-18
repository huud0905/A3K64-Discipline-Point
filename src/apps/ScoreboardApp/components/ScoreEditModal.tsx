import { DragEvent, useEffect, useMemo, useState } from "react";
import { RotateCcw, X, Zap } from "lucide-react";
import { FilterSelect } from "./FilterSelect";
import { categoryLabel, formatScore, ScoreCategory, ScoreEvent, StudentScoreSummary } from "../data/mockScoreData";

type QuickRule = { title: string; points: number; type: "CONG" | "TRU"; category: ScoreCategory; note?: string };
type RuleCacheGlobal = typeof globalThis & { __A3K64_SCORE_RULES?: QuickRule[] };

type ScoreEditModalProps = {
  student: StudentScoreSummary;
  week: number;
  events: ScoreEvent[];
  onClose: () => void;
  onSaveChanges?: (changes: { additions: Omit<ScoreEvent, "id">[]; deletions: string[] }) => Promise<void> | void;
  onAddScore?: (event: Omit<ScoreEvent, "id">) => void;
  onDeleteScore?: (eventId: string) => void;
};

const RULE_DRAG_TYPE = "application/x-score-rule";
const PINNED_RULES_KEY = "a3k64-pinned-vi-pham-rules";
const subjects = ["Toán", "Vật Lí", "Hoá Học", "Sinh Học", "Tin Học", "Ngữ Văn", "Lịch Sử", "Tiếng Anh", "Quốc Phòng", "Thể Dục", "GDĐP", "TNHN", "Chào Cờ", "SHL"];
const days = [
  { key: 2, label: "T2", full: "Thứ 2" },
  { key: 3, label: "T3", full: "Thứ 3" },
  { key: 4, label: "T4", full: "Thứ 4" },
  { key: 5, label: "T5", full: "Thứ 5" },
  { key: 6, label: "T6", full: "Thứ 6" },
  { key: 7, label: "T7", full: "Thứ 7" },
  { key: 0, label: "CN", full: "Chủ nhật" },
];

let cachedRules: QuickRule[] | null = (globalThis as RuleCacheGlobal).__A3K64_SCORE_RULES || null;
let cachedRulesPromise: Promise<QuickRule[]> | null = null;

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
  return raw.map((item) => {
    const record = item as Record<string, unknown>;
    const title = String(record.title ?? record["Tên"] ?? record.ten ?? "").trim();
    const rawPoint = Number(record.points ?? record["Điểm"] ?? record.diem ?? 0);
    const type = normalizeType(record.type ?? record["Tính"] ?? record.tinh, rawPoint);
    return title && Number.isFinite(rawPoint)
      ? { title, points: type === "TRU" ? -Math.abs(rawPoint) : Math.abs(rawPoint), type, category: normalizeCategory(record.category ?? record["Phân loại"] ?? record.phanloai), note: String(record.note ?? record["Ghi chú"] ?? record.ghichu ?? "").trim() || undefined }
      : null;
  }).filter((rule): rule is QuickRule => Boolean(rule));
}

async function fetchRulesFromGas() {
  const globalRules = (globalThis as RuleCacheGlobal).__A3K64_SCORE_RULES;
  if (globalRules?.length) return globalRules;
  if (cachedRules) return cachedRules;
  if (cachedRulesPromise) return cachedRulesPromise;
  const gasUrl = import.meta.env.VITE_GAS_WEB_APP_URL?.trim();
  if (!gasUrl) return [];
  cachedRulesPromise = (async () => {
    const url = new URL(gasUrl);
    url.searchParams.set("action", "getRules");
    url.searchParams.set("t", String(Date.now()));
    const response = await fetch(url.toString(), { method: "GET", redirect: "follow" });
    const json = await response.json();
    const data = json?.data || json;
    cachedRules = normalizeRules(data?.rules || data?.quickScoreReasons || data);
    (globalThis as RuleCacheGlobal).__A3K64_SCORE_RULES = cachedRules;
    return cachedRules;
  })();
  return cachedRulesPromise;
}

function isSheetTotal(event: ScoreEvent) { return String(event.note || "").includes("__SHEET_TOTAL__"); }
function parseDay(title: string) { const text = title.toLowerCase(); const match = text.match(/thứ\s*([2-7])/i); if (match) return Number(match[1]); return text.includes("chủ nhật") ? 0 : null; }
function eventDay(event: ScoreEvent) { return parseDay(event.title) ?? new Date(event.createdAt).getDay(); }
function shortTitle(title: string) { return title.length > 22 ? `${title.slice(0, 22)}...` : title; }
function statusTone(status: string) { const s = status.toLowerCase(); return s.includes("tốt") ? "good" : s.includes("khá") ? "warning" : s.includes("đạt") && !s.includes("chưa") ? "orange" : "danger"; }
function newEventDateForDay(day: number) { const now = new Date(); now.setDate(now.getDate() + (day - now.getDay())); now.setHours(12, 0, 0, 0); return now.toISOString(); }
function formatSavedTitle(day: number, category: ScoreCategory, subject: string, title: string, points: number) {
  const dayLabel = days.find((item) => item.key === day)?.full || "Không rõ ngày";
  const categoryText = categoryLabel(category);
  const subjectPart = category === "HOC_TAP" ? `: [${subject}]` : "";
  return `${dayLabel}: [${categoryText}]${subjectPart} ${title} (${formatScore(points)})`;
}
function makeDraft(event: Omit<ScoreEvent, "id">): ScoreEvent { return { ...event, id: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}` }; }
function readDraggedRule(event: DragEvent) { try { const raw = event.dataTransfer.getData(RULE_DRAG_TYPE) || event.dataTransfer.getData("text/plain"); const rule = JSON.parse(raw) as QuickRule; return rule?.title && typeof rule.points === "number" ? rule : null; } catch { return null; } }
function ruleKey(rule: QuickRule) { return `${rule.title}::${rule.points}::${rule.category}`; }
function readPinnedRuleKeys() { try { const saved = JSON.parse(localStorage.getItem(PINNED_RULES_KEY) || "[]"); return Array.isArray(saved) ? saved.filter((item) => typeof item === "string") : []; } catch { return []; } }
function ruleTooltip(rule: QuickRule) { return `${rule.title} ${formatScore(rule.points)} · ${categoryLabel(rule.category)}${rule.note ? ` · ${rule.note}` : ""}`; }
function createDragPreview(rule: QuickRule) {
  const preview = document.createElement("div");
  preview.className = `rule-drag-preview ${rule.points >= 0 ? "plus" : "minus"}`;
  preview.innerHTML = `<div class="rule-drag-icon">${rule.points >= 0 ? "+" : "−"}</div><div><strong>${rule.title}</strong><span>${formatScore(rule.points)} · ${categoryLabel(rule.category)}</span></div>`;
  document.body.appendChild(preview);
  return preview;
}

export function ScoreEditModal({ student, week, events, onSaveChanges, onAddScore, onDeleteScore, onClose }: ScoreEditModalProps) {
  const [activeDay, setActiveDay] = useState(2);
  const [subject, setSubject] = useState(subjects[0]);
  const [category, setCategory] = useState<ScoreCategory>("HOC_TAP");
  const [title, setTitle] = useState("");
  const [violationCount, setViolationCount] = useState(1);
  const [pointPerCount, setPointPerCount] = useState(5);
  const [rules, setRules] = useState<QuickRule[]>(cachedRules || (globalThis as RuleCacheGlobal).__A3K64_SCORE_RULES || []);
  const [pinnedRuleKeys, setPinnedRuleKeys] = useState<string[]>(readPinnedRuleKeys);
  const [rulesStatus, setRulesStatus] = useState(rules.length ? "" : "Đang đọc VI_PHAM...");
  const [draftEvents, setDraftEvents] = useState<ScoreEvent[]>(events.filter((event) => event.studentId === student.id && event.week === week));
  const [deletedEventIds, setDeletedEventIds] = useState<string[]>([]);
  const [dropHintDay, setDropHintDay] = useState<number | null>(null);
  const [inputDropActive, setInputDropActive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraftEvents(events.filter((event) => event.studentId === student.id && event.week === week));
    setDeletedEventIds([]);
  }, [events, student.id, week]);

  useEffect(() => {
    localStorage.setItem(PINNED_RULES_KEY, JSON.stringify(pinnedRuleKeys));
  }, [pinnedRuleKeys]);

  useEffect(() => {
    const globalRules = (globalThis as RuleCacheGlobal).__A3K64_SCORE_RULES;
    if (globalRules?.length) { setRules(globalRules); setRulesStatus(""); return; }
    let mounted = true;
    fetchRulesFromGas().then((nextRules) => { if (!mounted) return; setRules(nextRules); setRulesStatus(nextRules.length ? "" : "Sheet VI_PHAM chưa có dữ liệu hoặc chưa đúng cột."); }).catch(() => { if (!mounted) return; setRules([]); setRulesStatus("Không đọc được sheet VI_PHAM."); });
    return () => { mounted = false; };
  }, []);

  const weekEvents = useMemo(() => draftEvents.filter((event) => event.studentId === student.id && event.week === week), [draftEvents, student.id, week]);
  const activeDayEvents = useMemo(() => weekEvents.filter((event) => eventDay(event) === activeDay && !isSheetTotal(event)), [activeDay, weekEvents]);
  const visibleWeekEvents = weekEvents.filter((event) => !isSheetTotal(event));
  const plusTotal = visibleWeekEvents.filter((event) => event.points > 0).reduce((sum, event) => sum + event.points, 0);
  const minusTotal = visibleWeekEvents.filter((event) => event.points < 0).reduce((sum, event) => sum + event.points, 0);
  const total = weekEvents.reduce((sum, event) => sum + event.points, 0);
  const draftAdditions = draftEvents.filter((event) => event.id.startsWith("draft-"));
  const hasChanges = draftAdditions.length > 0 || deletedEventIds.length > 0;
  const orderedRules = useMemo(() => {
    const pinned = new Set(pinnedRuleKeys);
    return [...rules].sort((a, b) => Number(pinned.has(ruleKey(b))) - Number(pinned.has(ruleKey(a))));
  }, [pinnedRuleKeys, rules]);

  const stageScore = (payload: { title: string; points: number; category: ScoreCategory }, day = activeDay) => {
    const cleanTitle = payload.title.trim();
    if (!cleanTitle || !payload.points || isSaving) return;
    setDraftEvents((current) => [makeDraft({ studentId: student.id, week, title: formatSavedTitle(day, payload.category, subject, cleanTitle, payload.points), points: payload.points, type: payload.points >= 0 ? "CONG" : "TRU", category: payload.category, createdBy: "Web", createdAt: newEventDateForDay(day) }), ...current]);
  };

  const handleCustomAdd = () => { const count = Math.max(1, Math.trunc(Number(violationCount) || 1)); stageScore({ title, points: pointPerCount * count, category }); setTitle(""); setViolationCount(1); };
  const handleQuickRule = (rule: QuickRule) => { setCategory(rule.category); setPointPerCount(rule.points); stageScore({ title: rule.title, points: rule.points, category: rule.category }); };
  const removeEvent = (eventId: string) => { setDraftEvents((current) => current.filter((event) => event.id !== eventId)); if (!eventId.startsWith("draft-")) setDeletedEventIds((current) => current.includes(eventId) ? current : [...current, eventId]); };
  const togglePinnedRule = (rule: QuickRule) => { const key = ruleKey(rule); setPinnedRuleKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [key, ...current]); };

  const handleSave = async () => {
    if (!hasChanges || isSaving) { onClose(); return; }
    setIsSaving(true);
    try {
      const additions = draftAdditions.map(({ id: _id, ...event }) => event);
      if (onSaveChanges) await onSaveChanges({ additions, deletions: deletedEventIds });
      else {
        deletedEventIds.forEach((eventId) => onDeleteScore?.(eventId));
        additions.forEach((event) => onAddScore?.(event));
      }
      onClose();
    } finally { setIsSaving(false); }
  };

  const dragStart = (event: DragEvent<HTMLButtonElement>, rule: QuickRule) => {
    const raw = JSON.stringify(rule);
    event.dataTransfer.setData(RULE_DRAG_TYPE, raw);
    event.dataTransfer.setData("text/plain", raw);
    event.dataTransfer.effectAllowed = "copy";
    const preview = createDragPreview(rule);
    event.dataTransfer.setDragImage(preview, 18, 18);
    window.setTimeout(() => preview.remove(), 0);
  };
  const dropRuleIntoForm = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); const rule = readDraggedRule(event); setInputDropActive(false); if (!rule) return; setTitle(rule.title); setPointPerCount(rule.points); setViolationCount(1); setCategory(rule.category); };
  const dropRuleIntoDay = (event: DragEvent<HTMLDivElement>, day: number) => { event.preventDefault(); const rule = readDraggedRule(event); setDropHintDay(null); if (!rule) return; setActiveDay(day); setCategory(rule.category); setPointPerCount(rule.points); stageScore({ title: rule.title, points: rule.points, category: rule.category }, day); };
  const summaryForDay = (day: number) => { const list = weekEvents.filter((event) => eventDay(event) === day && !isSheetTotal(event)); const plus = list.filter((event) => event.points > 0); const minus = list.filter((event) => event.points < 0); return { plus, minus, plusTotal: plus.reduce((sum, event) => sum + event.points, 0), minusTotal: minus.reduce((sum, event) => sum + event.points, 0) }; };

  return (
    <div className="score-edit-backdrop" role="dialog" aria-modal="true">
      <div className="score-edit-modal">
        <header className="score-edit-header"><div><span>Data records</span><h2>Chấm điểm: <b>{student.name}</b></h2></div><button type="button" className="score-edit-close" onClick={onClose} disabled={isSaving} title="Đóng"><X size={20} /></button></header>
        <section className="score-edit-body">
          <div className="score-edit-left">
            <div className="score-week-table"><div className="score-edit-section-title">Bảng tổng quan tuần</div><div className="week-matrix">
              <div className="matrix-cell matrix-head">Nội dung</div>{days.map((day) => <div className={`matrix-cell matrix-head day-head ${dropHintDay === day.key ? "drop-ready" : ""}`} key={day.key} onDragOver={(e) => { e.preventDefault(); setDropHintDay(day.key); }} onDragLeave={() => setDropHintDay(null)} onDrop={(e) => dropRuleIntoDay(e, day.key)}>{day.label}</div>)}
              <div className="matrix-cell matrix-label">Điểm (+)</div>{days.map((day) => { const data = summaryForDay(day.key); return <div className="matrix-cell" key={`plus-${day.key}`}>{data.plusTotal ? formatScore(data.plusTotal) : "-"}</div>; })}
              <div className="matrix-cell matrix-label">Điểm (-)</div>{days.map((day) => { const data = summaryForDay(day.key); return <div className="matrix-cell" key={`minus-${day.key}`}>{data.minusTotal ? data.minusTotal : "-"}</div>; })}
              <div className="matrix-cell matrix-label">Nội dung (+)</div>{days.map((day) => { const data = summaryForDay(day.key); return <div className="matrix-cell matrix-content" key={`plus-title-${day.key}`}>{data.plus.length ? data.plus.map((event) => <span key={event.id} data-tooltip={event.title}>• {shortTitle(event.title)}</span>) : "-"}</div>; })}
              <div className="matrix-cell matrix-label">Nội dung (-)</div>{days.map((day) => { const data = summaryForDay(day.key); return <div className="matrix-cell matrix-content" key={`minus-title-${day.key}`}>{data.minus.length ? data.minus.map((event) => <span key={event.id} data-tooltip={event.title}>• {shortTitle(event.title)}</span>) : "-"}</div>; })}
            </div></div>
            <div className="day-tabs">{days.map((day) => <button type="button" key={day.key} className={activeDay === day.key ? "active" : ""} onClick={() => setActiveDay(day.key)} disabled={isSaving}>{day.label}</button>)}</div>
            <div className="score-edit-columns"><div className="score-add-panel"><div className="score-inline-actions"><button type="button" className="small-action disabled">Nháp: {hasChanges ? `${draftAdditions.length} thêm · ${deletedEventIds.length} xoá` : "chưa có thay đổi"}</button><button type="button" className="small-action disabled"><RotateCcw size={14} /> Hoàn tác</button><button type="button" className="small-action"><Zap size={14} /> Mẫu nhanh</button></div><div className={`score-custom-form ${inputDropActive ? "drop-ready" : ""}`} onDragOver={(e) => { e.preventDefault(); setInputDropActive(true); }} onDragLeave={() => setInputDropActive(false)} onDrop={dropRuleIntoForm}><div className="form-row"><div className="category-picker subject-picker"><FilterSelect<string> value={subject} options={subjects.map((item) => ({ value: item, label: item }))} onChange={setSubject} /></div><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Kéo rule từ VI_PHAM vào đây / nhập nội quy..." onKeyDown={(e) => { if (e.key === "Enter") handleCustomAdd(); }} disabled={isSaving} /><div className="count-box"><span>Lần</span><input type="number" min={1} step={1} value={violationCount} onChange={(e) => setViolationCount(Math.max(1, Math.trunc(Number(e.target.value) || 1)))} disabled={isSaving} /></div></div><button type="button" className="score-add-button" onClick={handleCustomAdd} disabled={isSaving}>Thêm mới (chưa lưu)</button></div></div><div className="day-record-panel"><div className="day-record-head"><strong>Ngày {days.find((day) => day.key === activeDay)?.label}</strong><span>Chỉ ghi vào Google Sheets khi bấm Save all changes.</span></div><div className="day-event-list">{activeDayEvents.length === 0 ? <div className="empty-day-record">Chưa có nội dung cho ngày này.</div> : activeDayEvents.map((event) => <div key={event.id} className={`day-event ${event.points >= 0 ? "plus" : "minus"} ${event.id.startsWith("draft-") ? "draft" : ""}`}><span>{event.title}</span><strong>{formatScore(event.points)}</strong><button type="button" onClick={() => removeEvent(event.id)} disabled={isSaving} title="Xoá dòng này"><X size={14} /></button></div>)}</div></div></div>
          </div>
          <aside className="rules-directory"><h3>VI_PHAM</h3>{rulesStatus && <p className="rules-status">{rulesStatus}</p>}<div className="rules-grid">{orderedRules.map((rule, index) => { const pinned = pinnedRuleKeys.includes(ruleKey(rule)); return <button key={`${rule.title}-${index}`} type="button" draggable={!isSaving} className={`${rule.points >= 0 ? "rule-card plus" : "rule-card minus"} ${pinned ? "pinned" : ""}`} onClick={() => handleQuickRule(rule)} onDragStart={(e) => dragStart(e, rule)} onContextMenu={(e) => { e.preventDefault(); togglePinnedRule(rule); }} data-tooltip={ruleTooltip(rule)} title="Chuột phải để ghim/bỏ ghim lên đầu" disabled={isSaving}><span>{pinned ? "📌 " : ""}{rule.title}</span><strong>{formatScore(rule.points)}</strong></button>; })}</div></aside>
        </section>
        <footer className="score-edit-footer"><strong className="footer-plus">{formatScore(plusTotal)}</strong><strong className="footer-minus">{minusTotal}</strong><strong className="footer-final-total">TỔNG {formatScore(total)}</strong><strong className={`footer-status ${statusTone(student.status)}`}>{student.status}</strong><button type="button" onClick={handleSave} disabled={isSaving}>{isSaving ? "Đang lưu..." : hasChanges ? "Save all changes" : "Đóng"}</button></footer>
      </div>
    </div>
  );
}
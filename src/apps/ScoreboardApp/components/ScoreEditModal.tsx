import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { FilterSelect } from "./FilterSelect";
import { categoryLabel, formatScore, ScoreCategory, ScoreEvent, StudentScoreSummary } from "../data/mockScoreData";

type QuickRule = { title: string; points: number; type: "CONG" | "TRU"; category: ScoreCategory; note?: string };
type RuleCacheGlobal = typeof globalThis & { __A3K64_SCORE_RULES?: QuickRule[] };
type BulkScope = "single" | "group" | "selected";

type ScoreEditModalProps = {
  student: StudentScoreSummary;
  allStudents?: StudentScoreSummary[];
  week: number;
  events: ScoreEvent[];
  onClose: () => void;
  onSaveChanges?: (changes: { additions: Omit<ScoreEvent, "id">[]; deletions: string[] }) => Promise<void> | void;
  onAddScore?: (event: Omit<ScoreEvent, "id">) => void;
  onDeleteScore?: (eventId: string) => void;
};

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
  return raw
    .map((item) => {
      const record = item as Record<string, unknown>;
      const title = String(record.title ?? record["Tên"] ?? record.ten ?? "").trim();
      const rawPoint = Number(record.points ?? record["Điểm"] ?? record.diem ?? 0);
      const type = normalizeType(record.type ?? record["Tính"] ?? record.tinh, rawPoint);
      return title && Number.isFinite(rawPoint)
        ? { title, points: type === "TRU" ? -Math.abs(rawPoint) : Math.abs(rawPoint), type, category: normalizeCategory(record.category ?? record["Phân loại"] ?? record.phanloai), note: String(record.note ?? record["Ghi chú"] ?? record.ghichu ?? "").trim() || undefined }
        : null;
    })
    .filter((rule): rule is QuickRule => Boolean(rule));
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
function shortTitle(title: string) { return title.length > 30 ? `${title.slice(0, 30)}...` : title; }
function statusTone(status: string) { const s = status.toLowerCase(); return s.includes("tốt") ? "good" : s.includes("khá") ? "warning" : s.includes("đạt") && !s.includes("chưa") ? "orange" : "danger"; }
function newEventDateForDay(day: number) { const now = new Date(); now.setDate(now.getDate() + (day - now.getDay())); now.setHours(12, 0, 0, 0); return now.toISOString(); }
function formatSavedTitle(day: number, category: ScoreCategory, subject: string, title: string, points: number) { const dayLabel = days.find((item) => item.key === day)?.full || "Không rõ ngày"; const categoryText = categoryLabel(category); const subjectPart = category === "HOC_TAP" ? `: [${subject}]` : ""; return `${dayLabel}: [${categoryText}]${subjectPart} ${title} (${formatScore(points)})`; }
function makeDraft(event: Omit<ScoreEvent, "id">): ScoreEvent { return { ...event, id: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}` }; }
function ruleKey(rule: QuickRule) { return `${rule.title}::${rule.points}::${rule.category}`; }
function readPinnedRuleKeys() { try { const saved = JSON.parse(localStorage.getItem(PINNED_RULES_KEY) || "[]"); return Array.isArray(saved) ? saved.filter((item) => typeof item === "string") : []; } catch { return []; } }
function ruleTooltip(rule: QuickRule) { return `${rule.title} ${formatScore(rule.points)} · ${categoryLabel(rule.category)}${rule.note ? ` · ${rule.note}` : ""}`; }
function cleanTitleFromEvent(title: string) { return title.replace(/^Thứ\s*[2-7]:\s*/i, "").replace(/^Chủ nhật:\s*/i, ""); }
function normalizeSearchText(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d").trim(); }
function ruleMatchesSearch(rule: QuickRule, search: string) { const tokens = normalizeSearchText(search).split(/\s+/).filter(Boolean); if (!tokens.length) return true; const haystack = normalizeSearchText(`${rule.title} ${categoryLabel(rule.category)} ${rule.note || ""} ${rule.type} ${Math.abs(rule.points)}`); return tokens.every((token) => haystack.includes(token)); }
function summarizeTitles(list: ScoreEvent[]) { if (!list.length) return "-"; return list.map((event) => shortTitle(cleanTitleFromEvent(event.title))).join(" • "); }

export function ScoreEditModal({ student, allStudents = [], week, events, onSaveChanges, onAddScore, onDeleteScore, onClose }: ScoreEditModalProps) {
  const [activeDay, setActiveDay] = useState(2);
  const [section, setSection] = useState<"add" | "review">("add");
  const [subject, setSubject] = useState(subjects[0]);
  const [category, setCategory] = useState<ScoreCategory>("HOC_TAP");
  const [specialTitle, setSpecialTitle] = useState("");
  const [specialPoint, setSpecialPoint] = useState(0);
  const [violationCount, setViolationCount] = useState(1);
  const [selectedRuleKey, setSelectedRuleKey] = useState("");
  const [ruleSearch, setRuleSearch] = useState("");
  const [ruleDropdownOpen, setRuleDropdownOpen] = useState(false);
  const ruleSearchRef = useRef<HTMLDivElement | null>(null);
  const [rules, setRules] = useState<QuickRule[]>(cachedRules || (globalThis as RuleCacheGlobal).__A3K64_SCORE_RULES || []);
  const [pinnedRuleKeys, setPinnedRuleKeys] = useState<string[]>(readPinnedRuleKeys);
  const [rulesStatus, setRulesStatus] = useState(rules.length ? "" : "Đang đọc VI_PHAM...");
  const [draftEvents, setDraftEvents] = useState<ScoreEvent[]>(events.filter((event) => event.studentId === student.id && event.week === week));
  const [deletedEventIds, setDeletedEventIds] = useState<string[]>([]);
  const [bulkScope, setBulkScope] = useState<BulkScope>("single");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([student.id]);
  const [bulkNote, setBulkNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const groupMembers = useMemo(() => { const source = allStudents.length ? allStudents : [student]; return source.filter((item) => item.group === student.group); }, [allStudents, student]);
  useEffect(() => { setDraftEvents(events.filter((event) => event.studentId === student.id && event.week === week)); setDeletedEventIds([]); setSelectedStudentIds([student.id]); }, [events, student.id, week]);
  useEffect(() => { localStorage.setItem(PINNED_RULES_KEY, JSON.stringify(pinnedRuleKeys)); }, [pinnedRuleKeys]);
  useEffect(() => { const closeRuleSearch = (event: MouseEvent) => { if (!ruleSearchRef.current?.contains(event.target as Node)) setRuleDropdownOpen(false); }; window.addEventListener("mousedown", closeRuleSearch); return () => window.removeEventListener("mousedown", closeRuleSearch); }, []);
  useEffect(() => { const globalRules = (globalThis as RuleCacheGlobal).__A3K64_SCORE_RULES; if (globalRules?.length) { setRules(globalRules); setRulesStatus(""); return; } let mounted = true; fetchRulesFromGas().then((nextRules) => { if (!mounted) return; setRules(nextRules); setRulesStatus(nextRules.length ? "" : "Sheet VI_PHAM chưa có dữ liệu hoặc chưa đúng cột."); }).catch(() => { if (!mounted) return; setRules([]); setRulesStatus("Không đọc được sheet VI_PHAM."); }); return () => { mounted = false; }; }, []);

  const weekEvents = useMemo(() => draftEvents.filter((event) => event.studentId === student.id && event.week === week), [draftEvents, student.id, week]);
  const visibleWeekEvents = weekEvents.filter((event) => !isSheetTotal(event));
  const activeDayEvents = useMemo(() => visibleWeekEvents.filter((event) => eventDay(event) === activeDay), [activeDay, visibleWeekEvents]);
  const plusTotal = visibleWeekEvents.filter((event) => event.points > 0).reduce((sum, event) => sum + event.points, 0);
  const minusTotal = visibleWeekEvents.filter((event) => event.points < 0).reduce((sum, event) => sum + event.points, 0);
  const total = weekEvents.reduce((sum, event) => sum + event.points, 0);
  const draftAdditions = draftEvents.filter((event) => event.id.startsWith("draft-"));
  const hasChanges = draftAdditions.length > 0 || deletedEventIds.length > 0;
  const orderedRules = useMemo(() => { const pinned = new Set(pinnedRuleKeys); return [...rules].sort((a, b) => Number(pinned.has(ruleKey(b))) - Number(pinned.has(ruleKey(a))) || Number(b.points) - Number(a.points)); }, [pinnedRuleKeys, rules]);
  const filteredRuleSuggestions = useMemo(() => orderedRules.filter((rule) => ruleMatchesSearch(rule, ruleSearch)).slice(0, 12), [orderedRules, ruleSearch]);
  const selectedRule = orderedRules.find((rule) => ruleKey(rule) === selectedRuleKey) || null;

  const jumpToDay = (day: number) => { setActiveDay(day); setSection("review"); };
  const dayCellProps = (day: number) => ({ role: "button", tabIndex: 0, onClick: () => jumpToDay(day), onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); jumpToDay(day); } } });
  const resolveTargetIds = () => { if (bulkScope === "group") return groupMembers.map((item) => item.id); if (bulkScope === "selected") return selectedStudentIds.length ? selectedStudentIds : [student.id]; return [student.id]; };
  const targetText = () => { const count = resolveTargetIds().length; if (bulkScope === "group") return `Cả tổ ${student.group} · ${count} HS`; if (bulkScope === "selected") return `Đã chọn ${count} HS`; return "Chỉ học sinh này"; };
  const stageScore = (payload: { title: string; points: number; category: ScoreCategory }, day = activeDay) => { const cleanTitle = payload.title.trim(); const count = Math.max(1, Math.trunc(Number(violationCount) || 1)); const points = payload.points * count; if (!cleanTitle || !points || isSaving) return; const targetIds = resolveTargetIds(); setDraftEvents((current) => [...targetIds.map((studentId) => makeDraft({ studentId, week, title: formatSavedTitle(day, payload.category, subject, cleanTitle, points), points, type: points >= 0 ? "CONG" : "TRU", category: payload.category, note: bulkNote.trim() || undefined, createdBy: "Web", createdAt: newEventDateForDay(day) })), ...current]); setSection("review"); };
  const chooseRule = (rule: QuickRule) => { setSelectedRuleKey(ruleKey(rule)); setRuleSearch(rule.title); setRuleDropdownOpen(false); setCategory(rule.category); setSpecialTitle(rule.title); setSpecialPoint(rule.points); };
  const handleRuleSearchChange = (value: string) => { setRuleSearch(value); setRuleDropdownOpen(true); const exact = orderedRules.find((rule) => normalizeSearchText(rule.title) === normalizeSearchText(value)); setSelectedRuleKey(exact ? ruleKey(exact) : ""); };
  const handleRuleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter" && filteredRuleSuggestions[0]) { event.preventDefault(); chooseRule(filteredRuleSuggestions[0]); } if (event.key === "Escape") setRuleDropdownOpen(false); };
  const handleSelectedRuleAdd = () => { if (!selectedRule) return; stageScore({ title: selectedRule.title, points: selectedRule.points, category: selectedRule.category }); };
  const handleSpecialAdd = () => { const points = Number(specialPoint || 0); if (!specialTitle.trim() || !Number.isFinite(points) || points === 0) return; stageScore({ title: specialTitle, points, category }); };
  const handleQuickRule = (rule: QuickRule) => { chooseRule(rule); stageScore({ title: rule.title, points: rule.points, category: rule.category }); };
  const removeEvent = (eventId: string) => { setDraftEvents((current) => current.filter((event) => event.id !== eventId)); if (!eventId.startsWith("draft-")) setDeletedEventIds((current) => (current.includes(eventId) ? current : [...current, eventId])); };
  const togglePinnedRule = (rule: QuickRule) => { const key = ruleKey(rule); setPinnedRuleKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [key, ...current])); };
  const toggleStudent = (studentId: string) => { setSelectedStudentIds((current) => (current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId])); };
  const handleSave = async () => { if (!hasChanges || isSaving) { onClose(); return; } setIsSaving(true); try { const additions = draftAdditions.map(({ id: _id, ...event }) => event); if (onSaveChanges) await onSaveChanges({ additions, deletions: deletedEventIds }); else { deletedEventIds.forEach((eventId) => onDeleteScore?.(eventId)); additions.forEach((event) => onAddScore?.(event)); } onClose(); } finally { setIsSaving(false); } };
  const summaryForDay = (day: number) => { const list = visibleWeekEvents.filter((event) => eventDay(event) === day); const plus = list.filter((event) => event.points > 0); const minus = list.filter((event) => event.points < 0); return { plus, minus, plusTotal: plus.reduce((sum, event) => sum + event.points, 0), minusTotal: minus.reduce((sum, event) => sum + event.points, 0) }; };

  return (
    <div className="score-edit-backdrop" role="dialog" aria-modal="true">
      <div className="score-edit-modal modern-score-editor">
        <header className="score-edit-header">
          <div>
            <h2>Chấm điểm: <b>{student.name}</b></h2>
          </div>
          <button type="button" className="score-edit-close" onClick={onClose} disabled={isSaving} title="Đóng"><X size={20} /></button>
        </header>
        <section className="score-edit-body">
          <div className="score-edit-left">
            <div className="score-week-table">
              <div className="score-edit-section-title">Bảng tổng quan tuần</div>
              <div className="week-matrix">
                <div className="matrix-cell matrix-head">Nội dung</div>{days.map((day) => <div className="matrix-cell matrix-head day-head matrix-day-jump" key={day.key} {...dayCellProps(day.key)}>{day.label}</div>)}
                <div className="matrix-cell matrix-label">Điểm (+)</div>{days.map((day) => { const data = summaryForDay(day.key); return <div className="matrix-cell matrix-day-jump" key={`plus-${day.key}`} {...dayCellProps(day.key)}>{data.plusTotal ? formatScore(data.plusTotal) : "-"}</div>; })}
                <div className="matrix-cell matrix-label">Điểm (-)</div>{days.map((day) => { const data = summaryForDay(day.key); return <div className="matrix-cell matrix-day-jump" key={`minus-${day.key}`} {...dayCellProps(day.key)}>{data.minusTotal ? data.minusTotal : "-"}</div>; })}
                <div className="matrix-cell matrix-label">Nội dung (+)</div>{days.map((day) => { const data = summaryForDay(day.key); const title = summarizeTitles(data.plus); return <div className="matrix-cell matrix-content matrix-day-jump" key={`plus-title-${day.key}`} title={title} {...dayCellProps(day.key)}><span>{title}</span></div>; })}
                <div className="matrix-cell matrix-label">Nội dung (-)</div>{days.map((day) => { const data = summaryForDay(day.key); const title = summarizeTitles(data.minus); return <div className="matrix-cell matrix-content matrix-day-jump" key={`minus-title-${day.key}`} title={title} {...dayCellProps(day.key)}><span>{title}</span></div>; })}
              </div>
            </div>
            <div className="score-day-switch-row"><div className="day-tabs">{days.map((day) => <button type="button" key={day.key} className={activeDay === day.key ? "active" : ""} onClick={() => jumpToDay(day.key)} disabled={isSaving}>{day.label}</button>)}</div><div className="day-record-head inline-day-head"><strong>Ngày {days.find((day) => day.key === activeDay)?.label}</strong><span>Chỉ ghi vào Google Sheets khi bấm Save all changes.</span></div></div>
            <div className="score-mobile-mode-tabs"><button type="button" className={section === "add" ? "active" : ""} onClick={() => setSection("add")}>Chấm điểm</button><button type="button" className={section === "review" ? "active" : ""} onClick={() => setSection("review")}>Xem lại / xoá</button></div>
            <div className="score-edit-columns">
              <div className={`score-add-panel ${section !== "add" ? "mobile-hidden-section" : ""}`}>
                <div className="score-custom-form rule-select-form"><div className="form-row rule-pick-row"><div className="category-picker subject-picker"><FilterSelect<string> value={subject} options={subjects.map((item) => ({ value: item, label: item }))} onChange={setSubject} placement="top" portal menuClassName="subject-floating-menu" menuMaxHeight={280} /></div><div className="rule-search-box" ref={ruleSearchRef}><input className="rule-search-input" value={ruleSearch} onChange={(event) => handleRuleSearchChange(event.target.value)} onFocus={() => setRuleDropdownOpen(true)} onKeyDown={handleRuleSearchKeyDown} placeholder="Tìm nội quy" disabled={isSaving} /><span className="rule-search-arrow">▾</span>{ruleDropdownOpen && !isSaving && <div className="rule-suggestion-menu">{filteredRuleSuggestions.length ? filteredRuleSuggestions.map((rule, index) => <button type="button" key={`${ruleKey(rule)}-${index}`} className={rule.points >= 0 ? "plus" : "minus"} onClick={() => chooseRule(rule)}><strong>{rule.title}</strong><span>{rule.points >= 0 ? "Cộng" : "Trừ"}: {Math.abs(rule.points)}đ</span></button>) : <div className="rule-suggestion-empty">Không tìm thấy nội quy phù hợp.</div>}</div>}</div><div className="count-box"><span>Lần</span><input type="number" min={1} step={1} value={violationCount} onChange={(e) => setViolationCount(Math.max(1, Math.trunc(Number(e.target.value) || 1)))} disabled={isSaving} /></div></div><button type="button" className="score-add-button" onClick={handleSelectedRuleAdd} disabled={isSaving || !selectedRule}>Thêm mới (Enter)</button></div>
                <div className="score-custom-form special-score-form"><strong>Lỗi / Thưởng đặc biệt khác</strong><div className="form-row special-row"><input value={specialTitle} onChange={(e) => setSpecialTitle(e.target.value)} placeholder="Nhập lỗi khác..." disabled={isSaving} /><input type="number" value={specialPoint} onChange={(e) => setSpecialPoint(Number(e.target.value || 0))} placeholder="Điểm" disabled={isSaving} /></div><div className="form-row special-row second"><div className="category-picker"><FilterSelect<ScoreCategory> value={category} options={[{ value: "HOC_TAP", label: "Học tập" }, { value: "NE_NEP", label: "Nề nếp" }, { value: "PHONG_TRAO", label: "Phong trào" }]} onChange={setCategory} /></div><button type="button" className="score-add-button secondary" onClick={handleSpecialAdd} disabled={isSaving}>Thêm lỗi/thưởng khác</button></div></div>
                <div className="bulk-score-box"><strong>Chấm hàng loạt</strong><span>Bao gồm học sinh đang chấm</span><select value={bulkScope} onChange={(event) => setBulkScope(event.target.value as BulkScope)} disabled={isSaving}><option value="single">Chỉ học sinh này</option><option value="group">Cả tổ</option><option value="selected">Chọn học sinh trong tổ</option></select>{bulkScope === "selected" && <div className="bulk-student-list">{groupMembers.map((item) => <label key={item.id}><input type="checkbox" checked={selectedStudentIds.includes(item.id)} onChange={() => toggleStudent(item.id)} /> <span>{item.name}</span></label>)}</div>}<textarea value={bulkNote} onChange={(event) => setBulkNote(event.target.value)} placeholder="Nhập ghi chú riêng..." /><small>Đối tượng: {targetText()}</small></div>
              </div>
              <div className={`day-record-panel ${section !== "review" ? "mobile-hidden-section" : ""}`}><div className="day-event-list">{activeDayEvents.length === 0 ? <div className="empty-day-record">Chưa có nội dung cho ngày này.</div> : activeDayEvents.map((event) => <div key={event.id} className={`day-event ${event.points >= 0 ? "plus" : "minus"} ${event.id.startsWith("draft-") ? "draft" : ""}`}><span>{cleanTitleFromEvent(event.title)}</span><strong>{formatScore(event.points)}</strong><button type="button" onClick={() => removeEvent(event.id)} disabled={isSaving} title="Xoá dòng này"><X size={14} /></button></div>)}</div></div>
            </div>
          </div>
          <aside className="rules-directory"><h3>VI_PHAM</h3>{rulesStatus && <p className="rules-status">{rulesStatus}</p>}<div className="rules-grid">{orderedRules.map((rule, index) => { const pinned = pinnedRuleKeys.includes(ruleKey(rule)); return <button key={`${rule.title}-${index}`} type="button" className={`${rule.points >= 0 ? "rule-card plus" : "rule-card minus"} ${pinned ? "pinned" : ""}`} onClick={() => handleQuickRule(rule)} onContextMenu={(e) => { e.preventDefault(); togglePinnedRule(rule); }} data-tooltip={ruleTooltip(rule)} title="Chuột phải để ghim/bỏ ghim lên đầu" disabled={isSaving}><span>{pinned ? "📌 " : ""}{rule.title}</span><strong>{formatScore(rule.points)}</strong></button>; })}</div></aside>
        </section>
        <footer className="score-edit-footer"><strong className="footer-plus">{formatScore(plusTotal)}</strong><strong className="footer-minus">{minusTotal}</strong><strong className="footer-final-total">TỔNG {formatScore(total)}</strong><strong className={`footer-status ${statusTone(student.status)}`}>{student.status}</strong><button type="button" onClick={handleSave} disabled={isSaving}>{isSaving ? "Đang lưu..." : hasChanges ? "Save all changes" : "Đóng"}</button></footer>
      </div>
    </div>
  );
}

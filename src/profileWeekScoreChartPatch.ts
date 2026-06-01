/* Nâng cấp biểu đồ tuần trong Profile:
   - Trục dọc hiển thị điểm.
   - Trục ngang hiển thị tối đa 9 tuần.
   - Hiện số điểm tại từng điểm dữ liệu để dễ theo dõi.
   Patch này đọc dữ liệu từ bảng Tổng quan tuần so sánh ngay trong tab Profile nên không cần đổi backend. */

type ChartWeekPoint = {
  week: number;
  score: number;
};

const SVG_NS = "http://www.w3.org/2000/svg";

function parseNumber(text: string) {
  const normalized = String(text || "")
    .replace(/[−–—]/g, "-")
    .replace(/[^0-9+\-.]/g, "")
    .replace(/^\+/, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

function niceTicks(min: number, max: number) {
  const range = Math.max(10, max - min);
  const roughStep = range / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const scaled = roughStep / pow;
  const step = (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * pow;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= end + step * 0.5; value += step) ticks.push(Math.round(value));
  return ticks.length >= 2 ? ticks : [Math.floor(min), Math.ceil(max)];
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, text?: string) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  if (text !== undefined) node.textContent = text;
  return node;
}

function readWeekRows(page: Element): ChartWeekPoint[] {
  const rows = Array.from(page.querySelectorAll<HTMLTableRowElement>(".profile-week-table tbody tr"));
  return rows
    .map((row) => {
      const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("td"));
      if (cells.length < 2) return null;
      const week = parseNumber(cells[0].textContent || "");
      const score = parseNumber(cells[1].textContent || "");
      if (!Number.isFinite(week) || week <= 0) return null;
      return { week, score };
    })
    .filter((item): item is ChartWeekPoint => !!item)
    .slice(-9);
}

function renderScoreChart(svg: SVGSVGElement, rows: ChartWeekPoint[]) {
  const key = rows.map((row) => `${row.week}:${row.score}`).join("|");
  if (svg.dataset.scoreChartKey === key) return;
  svg.dataset.scoreChartKey = key;
  svg.classList.add("profile-chart-score-mode");
  svg.setAttribute("viewBox", "0 0 920 280");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Biểu đồ điểm theo tuần");
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  if (!rows.length) {
    svg.appendChild(el("text", { x: 460, y: 140, "text-anchor": "middle", fill: "#94a3b8", "font-size": 16, "font-weight": 700 }, "Chưa có dữ liệu điểm tuần"));
    return;
  }

  const w = 920;
  const h = 280;
  const left = 64;
  const right = 28;
  const top = 30;
  const bottom = 50;
  const plotW = w - left - right;
  const plotH = h - top - bottom;
  const scores = rows.map((row) => row.score);
  const minRaw = Math.min(...scores, 0);
  const maxRaw = Math.max(...scores, 60);
  const pad = Math.max(5, Math.round((maxRaw - minRaw) * 0.12));
  const ticks = niceTicks(minRaw - pad, maxRaw + pad);
  const min = ticks[0];
  const max = ticks[ticks.length - 1];
  const range = Math.max(1, max - min);
  const x = (i: number) => left + (rows.length === 1 ? plotW / 2 : (i * plotW) / (rows.length - 1));
  const y = (value: number) => top + ((max - value) * plotH) / range;

  const defs = el("defs");
  const gradient = el("linearGradient", { id: "profileScoreLineGradient", x1: "0%", y1: "0%", x2: "100%", y2: "0%" });
  gradient.appendChild(el("stop", { offset: "0%", "stop-color": "#38bdf8" }));
  gradient.appendChild(el("stop", { offset: "100%", "stop-color": "#22d3ee" }));
  defs.appendChild(gradient);
  svg.appendChild(defs);

  ticks.forEach((tick) => {
    const yy = y(tick);
    svg.appendChild(el("line", { x1: left, y1: yy, x2: w - right, y2: yy, stroke: "rgba(148,163,184,.18)", "stroke-width": 1 }));
    svg.appendChild(el("text", { x: left - 12, y: yy + 4, "text-anchor": "end", fill: "#94a3b8", "font-size": 12, "font-weight": 700 }, String(tick)));
  });

  svg.appendChild(el("line", { x1: left, y1: top, x2: left, y2: h - bottom, stroke: "rgba(148,163,184,.36)", "stroke-width": 1.2 }));
  svg.appendChild(el("line", { x1: left, y1: h - bottom, x2: w - right, y2: h - bottom, stroke: "rgba(148,163,184,.36)", "stroke-width": 1.2 }));
  svg.appendChild(el("text", { x: 18, y: top + plotH / 2, "text-anchor": "middle", fill: "#cbd5e1", "font-size": 12, "font-weight": 800, transform: `rotate(-90 18 ${top + plotH / 2})` }, "Điểm"));
  svg.appendChild(el("text", { x: left + plotW / 2, y: h - 8, "text-anchor": "middle", fill: "#cbd5e1", "font-size": 12, "font-weight": 800 }, "Tuần"));

  const pointList = rows.map((row, i) => `${x(i)},${y(row.score)}`).join(" ");
  svg.appendChild(el("polyline", { points: pointList, fill: "none", stroke: "url(#profileScoreLineGradient)", "stroke-width": 4, "stroke-linecap": "round", "stroke-linejoin": "round" }));

  rows.forEach((row, i) => {
    const cx = x(i);
    const cy = y(row.score);
    svg.appendChild(el("line", { x1: cx, y1: top, x2: cx, y2: h - bottom, stroke: "rgba(148,163,184,.08)", "stroke-width": 1 }));
    svg.appendChild(el("circle", { cx, cy, r: 5.5, fill: "#38bdf8", stroke: "#0f172a", "stroke-width": 3 }));
    svg.appendChild(el("text", { x: cx, y: Math.max(top + 14, cy - 13), "text-anchor": "middle", fill: "#f8fafc", "font-size": 13, "font-weight": 900 }, String(row.score)));
    svg.appendChild(el("text", { x: cx, y: h - bottom + 24, "text-anchor": "middle", fill: "#cbd5e1", "font-size": 12, "font-weight": 800 }, `Tuần ${row.week}`));
  });
}

function patchProfileCharts() {
  document.querySelectorAll<HTMLElement>(".profile-page").forEach((page) => {
    const svg = page.querySelector<SVGSVGElement>("svg.profile-chart-nine");
    if (!svg) return;
    const rows = readWeekRows(page);
    renderScoreChart(svg, rows);
  });
}

function bootProfileWeekScoreChartPatch() {
  patchProfileCharts();
  window.setInterval(patchProfileCharts, 900);
  const observer = new MutationObserver(() => patchProfileCharts());
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootProfileWeekScoreChartPatch, { once: true });
  else bootProfileWeekScoreChartPatch();
}

export {};

/* ============================================================
   A3K64 — Scoreboard Animations & Micro-interactions
   ------------------------------------------------------------
   File này bổ sung hoàn toàn các hiệu ứng động cho bảng điểm.
   Không sửa đổi scoreboard.js — chỉ hook vào DOM sau mỗi render().

   Danh sách hiệu ứng:
   1. Shimmer & nhịp thở Badge #1 (Podium cards)
   2. Bar chart grow animation (height 0 → thực tế) + tooltip hover
   3. Count-up numbers (requestAnimationFrame)
   4. Table row stagger slide-up fade-in
   5. Skeleton loading khi fetch dữ liệu

   Quy ước: mọi function đều có prefix a3Anim_ để tránh xung đột
   ============================================================ */

/* ============================================================
   INJECT CSS ANIMATIONS
   (Injected programmatically để giữ scoreboard.css sạch)
   ============================================================ */
(function a3AnimInjectCSS() {
  if (document.getElementById('a3-animations-style')) return;
  const style = document.createElement('style');
  style.id = 'a3-animations-style';
  style.textContent = `

/* ─── 1. PODIUM SHIMMER & BADGE PULSE ────────────────────── */

@keyframes a3Shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}

@keyframes a3BadgePulse {
  0%, 100% { transform: scale(1.0); }
  50%       { transform: scale(1.08); }
}

@keyframes a3PodiumFloat {
  0%, 100% { transform: translateY(0); }
  50%       { transform: translateY(-3px); }
}

/* Shimmer vệt sáng chạy qua viền card hạng 1 */
.podium-card.rank-1::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  z-index: -1;
  background: linear-gradient(
    105deg,
    transparent 30%,
    rgba(251,191,36,.18) 48%,
    rgba(255,255,255,.28) 52%,
    rgba(251,191,36,.14) 56%,
    transparent 70%
  );
  background-size: 200% 100%;
  animation: a3Shimmer 2.6s ease-in-out infinite;
  pointer-events: none;
}

/* Badge #1 nhịp thở */
.podium-card.rank-1 .podium-rank {
  animation: a3BadgePulse 2s ease-in-out infinite;
  display: inline-flex;
  transform-origin: center;
}

/* Float nhẹ cho card #1 */
.podium-card.rank-1 {
  animation: a3PodiumFloat 3.5s ease-in-out infinite;
}

/* Hover effect — override float khi hover */
.podium-card:hover {
  animation: none !important;
  transform: translateY(-6px) scale(1.015) !important;
  box-shadow: 0 12px 24px rgba(0,0,0,.12) !important;
  transition: transform 0.25s ease, box-shadow 0.25s ease !important;
}

/* ─── 2. BAR CHART GROW ANIMATION ────────────────────────── */

@keyframes a3BarGrowHeight {
  from { height: 0 !important; opacity: 0.2; }
  to   { opacity: 1; }
}

.a3-bar-animated {
  animation: a3BarGrowHeight 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
}

/* Tooltip */
.a3-chart-tooltip {
  position: fixed;
  z-index: 8888;
  pointer-events: none;
  background: var(--bg-card, #08111e);
  border: 1px solid var(--border, #1a2535);
  border-radius: 12px;
  padding: 9px 13px;
  box-shadow: 0 12px 32px rgba(0,0,0,.4);
  font-size: 12.5px;
  font-family: inherit;
  color: var(--text, #f1f5f9);
  min-width: 130px;
  backdrop-filter: blur(8px);
  opacity: 0;
  transform: translateY(4px) scale(.97);
  transition: opacity .14s ease, transform .14s ease;
}
.a3-chart-tooltip.visible {
  opacity: 1;
  transform: translateY(0) scale(1);
}
.a3-chart-tooltip strong {
  display: block;
  font-size: 13.5px;
  font-weight: 900;
  margin-bottom: 4px;
}
.a3-chart-tooltip span {
  display: block;
  color: var(--text-muted, #4e6680);
  font-size: 11.5px;
  margin-top: 2px;
}
.a3-chart-tooltip .tt-score {
  font-size: 16px;
  font-weight: 900;
  margin-bottom: 2px;
}

/* Dimmed bars on hover */
.group-stats-v2-bar.a3-bar-dimmed {
  opacity: 0.38;
  transition: opacity .18s ease;
}
.group-stats-v2-bar.a3-bar-highlighted {
  opacity: 1 !important;
  filter: brightness(1.12);
  transition: opacity .18s ease, filter .18s ease;
}

/* ─── 3. COUNT-UP NUMBERS ─────────────────────────────────── */

/* Số đang đếm — highlight nhẹ khi bắt đầu */
.a3-counting {
  display: inline-block;
  transition: color .1s ease;
}

/* ─── 4. TABLE ROW STAGGER ────────────────────────────────── */

@keyframes a3FadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

.score-table tbody tr.a3-row-enter {
  animation: a3FadeInUp 0.32s cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: calc(var(--row-index, 0) * 0.03s);
}

.score-table tbody tr {
  transition: background-color 0.14s ease;
  cursor: pointer;
}
.score-table tbody tr:hover {
  background-color: rgba(255,255,255,.035) !important;
}

/* ─── 5. SKELETON LOADING ─────────────────────────────────── */

@keyframes a3SkeletonShimmer {
  0%   { background-position: -400px 0; }
  100% { background-position:  400px 0; }
}

.a3-skeleton {
  border-radius: 8px;
  background: linear-gradient(
    90deg,
    var(--bg-mid, #0a1525) 25%,
    color-mix(in srgb, var(--accent, #2563eb) 8%, var(--bg-mid, #0a1525)) 50%,
    var(--bg-mid, #0a1525) 75%
  );
  background-size: 800px 100%;
  animation: a3SkeletonShimmer 1.5s ease-in-out infinite;
}

.a3-skeleton-podium-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 24px 20px 28px;
  min-height: 200px;
  align-items: end;
}

.a3-skeleton-card {
  border-radius: 24px 24px 4px 4px;
  border: 1px solid var(--border, #1a2535);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 14px 16px;
  gap: 12px;
}
.a3-skeleton-card:nth-child(1) { min-height: 170px; }
.a3-skeleton-card:nth-child(2) { min-height: 190px; }
.a3-skeleton-card:nth-child(3) { min-height: 154px; }
.a3-skeleton-avatar { width: 54px; height: 54px; border-radius: 999px; }
.a3-skeleton-line   { height: 14px; width: 80%; }
.a3-skeleton-line.short { width: 50%; height: 12px; }
.a3-skeleton-line.score { width: 40%; height: 18px; }

.a3-skeleton-bar-grid {
  display: grid;
  grid-template-columns: 42px minmax(0,1fr);
  gap: 10px;
  padding: 10px 16px 16px 8px;
  min-height: 242px;
}
.a3-skeleton-axis  { display: flex; flex-direction: column; gap: 24px; padding-top: 8px; }
.a3-skeleton-axis-line { height: 10px; width: 28px; border-radius: 4px; }
.a3-skeleton-bars  {
  display: grid;
  grid-template-columns: repeat(4, minmax(0,1fr));
  gap: 24px;
  align-items: end;
  min-height: 184px;
  padding-bottom: 30px;
}
.a3-skeleton-bar   { border-radius: 12px 12px 4px 4px; width: 60%; margin: 0 auto; }

.a3-skeleton-table-wrap { padding: 0; }
.a3-skeleton-table-row  {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 11px 12px;
  border-bottom: 1px solid var(--border, #1a2535);
}
.a3-skeleton-table-row .a3-skeleton { flex: 1; height: 12px; }
.a3-skeleton-table-row .a3-skeleton:first-child { max-width: 30px; }
.a3-skeleton-table-row .a3-skeleton:last-child  { max-width: 60px; }

/* ─── Light theme overrides ──────────────────────────────── */
[data-theme="light"] .a3-skeleton {
  background: linear-gradient(
    90deg,
    #e2e8f0 25%,
    #f1f5f9 50%,
    #e2e8f0 75%
  );
  background-size: 800px 100%;
  animation: a3SkeletonShimmer 1.5s ease-in-out infinite;
}

[data-theme="light"] .score-table tbody tr:hover {
  background-color: rgba(0,0,0,.025) !important;
}
`;
  document.head.appendChild(style);
})();

/* ============================================================
   GLOBAL TOOLTIP (dùng chung cho bar chart hover)
   ============================================================ */
/** Escape HTML cho tooltip — phòng XSS khi label/detail từ backend có ký tự đặc biệt. */
function a3AnimEsc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

const a3AnimTooltip = (() => {
  let el = null;
  function ensure() {
    if (!el || !document.body.contains(el)) {
      el = document.createElement('div');
      el.className = 'a3-chart-tooltip';
      document.body.appendChild(el);
    }
    return el;
  }
  return {
    show(html, x, y) {
      const t = ensure();
      t.innerHTML = html;
      // Position: prefer right of cursor, flip left if near edge
      const vpW = window.innerWidth;
      const left = (x + 160 > vpW) ? (x - 160) : (x + 14);
      t.style.left = `${left}px`;
      t.style.top  = `${y - 60}px`;
      requestAnimationFrame(() => t.classList.add('visible'));
    },
    hide() {
      ensure().classList.remove('visible');
    },
  };
})();

/* ============================================================
   1. COUNT-UP HELPER
   ============================================================ */
/**
 * Animates an element's textContent from 0 to `target`.
 * @param {HTMLElement} el   - target element
 * @param {number} target    - final value
 * @param {number} duration  - ms (default 700)
 * @param {Function} fmt     - formatter (default identity)
 */
function a3AnimCountUp(el, target, duration = 700, fmt = (n) => n) {
  if (!el) return;
  const sign   = target >= 0 ? 1 : -1;
  const abs    = Math.abs(target);
  const start  = performance.now();

  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // easeOutExpo
    const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
    const current = Math.round(abs * ease) * sign;
    el.textContent = fmt(current);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* Format helpers used in count-up */
function a3AnimFmtScore(n) {
  const abs = Math.abs(Math.trunc(n || 0)).toLocaleString('vi-VN');
  if (n > 0) return `+${abs}`;
  if (n < 0) return `-${abs}`;
  return '0';
}
function a3AnimFmtPlain(n) {
  return Math.trunc(n).toLocaleString('vi-VN');
}

/* ============================================================
   2. SKELETON BUILDERS
   Returns HTML strings injected before real data arrives.
   ============================================================ */
function a3AnimSkeletonPodium() {
  const skRow = (w) => `<div class="a3-skeleton-line a3-skeleton" style="width:${w}%"></div>`;
  const card = (h) => `
    <div class="a3-skeleton-card" style="min-height:${h}px">
      <div class="a3-skeleton-line a3-skeleton short" style="width:40%"></div>
      <div class="a3-skeleton-avatar a3-skeleton"></div>
      ${skRow(70)}
      ${skRow(38)}
    </div>`;
  return `
    <section class="score-panel ranking-panel">
      <div class="section-heading"><span>🏆</span><strong>Bảng vinh danh</strong></div>
      <div class="a3-skeleton-podium-grid">
        ${card(170)}
        ${card(190)}
        ${card(154)}
      </div>
    </section>`;
}

function a3AnimSkeletonChart() {
  const heights = [55, 80, 40, 70];
  return `
    <section class="score-panel chart-panel group-stats-v2-panel">
      <div class="section-heading"><span>📈</span><strong>Thống kê tổ</strong></div>
      <div class="a3-skeleton-bar-grid">
        <div class="a3-skeleton-axis">
          ${[1,2,3,4,5].map(() => `<div class="a3-skeleton-axis-line a3-skeleton"></div>`).join('')}
        </div>
        <div class="a3-skeleton-bars">
          ${heights.map(h => `<div class="a3-skeleton-bar a3-skeleton" style="height:${h}%"></div>`).join('')}
        </div>
      </div>
    </section>`;
}

function a3AnimSkeletonTableRows(count = 8) {
  const row = () => `
    <div class="a3-skeleton-table-row">
      <div class="a3-skeleton" style="max-width:28px;height:11px;flex:0 0 28px"></div>
      <div class="a3-skeleton" style="flex:1;height:12px"></div>
      <div class="a3-skeleton" style="max-width:48px;height:12px;flex:0 0 48px"></div>
      <div class="a3-skeleton" style="max-width:36px;height:12px;flex:0 0 36px"></div>
      <div class="a3-skeleton" style="max-width:56px;height:20px;flex:0 0 56px;border-radius:999px"></div>
    </div>`;
  return `
    <section class="score-panel student-table-panel a3-skeleton-table-wrap">
      <div class="table-title a3-skeleton" style="height:40px;margin:0"></div>
      ${Array.from({ length: count }, row).join('')}
    </section>`;
}

/* ============================================================
   3. MAIN HOOK — called after every render()
   ============================================================ */

/** Track which render cycle we're on to cancel stale animations */
let a3AnimRenderGen = 0;

function a3AnimAfterRender() {
  const gen = ++a3AnimRenderGen;
  // rAF so DOM has settled
  requestAnimationFrame(() => {
    if (gen !== a3AnimRenderGen) return;
    a3AnimApplyRowStagger();
    a3AnimApplyBarChart();
    a3AnimApplyCountUp();
  });
}

/* ============================================================
   4. TABLE ROW STAGGER
   ============================================================ */
function a3AnimApplyRowStagger() {
  // Apply to every tbody row that hasn't been stamped yet
  document.querySelectorAll('.score-table tbody tr:not([data-a3-row-stamped])').forEach((tr, i) => {
    tr.setAttribute('data-a3-row-stamped', '1');
    tr.style.setProperty('--row-index', String(i));
    tr.classList.add('a3-row-enter');
    // Clean up class after animation so re-renders don't re-trigger if node is reused
    tr.addEventListener('animationend', () => tr.classList.remove('a3-row-enter'), { once: true });
  });
}

/* ============================================================
   5. BAR CHART GROW + TOOLTIP
   ============================================================ */
function a3AnimApplyBarChart() {
  const bars = document.querySelectorAll('.group-stats-v2-bar:not([data-a3-bar-stamped])');
  if (!bars.length) return;

  bars.forEach((bar, idx) => {
    bar.setAttribute('data-a3-bar-stamped', '1');
    // Stagger each bar slightly
    bar.style.animationDelay = `${idx * 0.07}s`;
    bar.classList.add('a3-bar-animated');

    // Build tooltip content from bar's label/value text
    const col      = bar.closest('.group-stats-v2-column');
    const label    = col?.querySelector('strong')?.textContent?.trim() || '';
    const detail   = col?.querySelector('small')?.textContent?.trim() || '';
    const scoreEl  = bar.querySelector('span');
    const score    = scoreEl?.textContent?.trim() || '';

    // Hover: dim siblings, show tooltip
    bar.addEventListener('mouseenter', (e) => {
      // Dim all other bars
      document.querySelectorAll('.group-stats-v2-bar').forEach(b => {
        if (b !== bar) {
          b.classList.add('a3-bar-dimmed');
          b.classList.remove('a3-bar-highlighted');
        } else {
          b.classList.remove('a3-bar-dimmed');
          b.classList.add('a3-bar-highlighted');
        }
      });
      const html = `
        <strong>${a3AnimEsc(label)}</strong>
        <span class="tt-score" style="color:${score.startsWith('-') ? 'var(--color-minus,#f87171)' : 'var(--color-plus,#34d399)'}">${a3AnimEsc(score)}</span>
        <span>${a3AnimEsc(detail)}</span>`;
      a3AnimTooltip.show(html, e.clientX, e.clientY);
    });

    bar.addEventListener('mousemove', (e) => {
      a3AnimTooltip.show(
        document.querySelector('.a3-chart-tooltip')?.innerHTML || '',
        e.clientX,
        e.clientY
      );
    });

    bar.addEventListener('mouseleave', () => {
      document.querySelectorAll('.group-stats-v2-bar').forEach(b => {
        b.classList.remove('a3-bar-dimmed', 'a3-bar-highlighted');
      });
      a3AnimTooltip.hide();
    });
  });
}

/* ============================================================
   6. COUNT-UP NUMBERS
   ============================================================ */
function a3AnimApplyCountUp() {
  // ── Sidebar mini-stats ─────────────────────────────────────
  document.querySelectorAll('.mini-stat strong:not([data-a3-counted])').forEach(el => {
    const raw = el.textContent.trim();
    el.setAttribute('data-a3-counted', '1');

    // Pattern: "+1234" / "-567" / plain number / "N/M"
    const fracMatch = raw.match(/^(\d+)\/(\d+)$/);
    if (fracMatch) {
      // "good/total" format — animate numerator only
      const num = parseInt(fracMatch[1], 10);
      const den = fracMatch[2];
      a3AnimCountUp(el, num, 650, (v) => `${v}/${den}`);
      return;
    }
    const numMatch = raw.match(/^([+-]?)(\d[\d.,]*)$/);
    if (numMatch) {
      const sign = numMatch[1] === '-' ? -1 : 1;
      const val  = parseInt(numMatch[2].replace(/[.,]/g, ''), 10) * sign;
      if (!isNaN(val)) {
        a3AnimCountUp(el, val, 650, (v) => {
          if (v > 0 && numMatch[1] === '+') return `+${Math.abs(v).toLocaleString('vi-VN')}`;
          if (v < 0) return `-${Math.abs(v).toLocaleString('vi-VN')}`;
          return `${Math.abs(v).toLocaleString('vi-VN')}`;
        });
      }
    }
  });

  // ── Podium scores ──────────────────────────────────────────
  document.querySelectorAll('.podium-card > span.score-positive, .podium-card > span.score-negative').forEach(el => {
    if (el.hasAttribute('data-a3-counted')) return;
    el.setAttribute('data-a3-counted', '1');
    const raw = el.textContent.trim();
    const m   = raw.match(/^([+-]?\d[\d.,]*)$/);
    if (!m) return;
    const val = parseInt(m[1].replace(/[+.,]/g, ''), 10) * (raw.startsWith('-') ? -1 : 1);
    if (!isNaN(val)) {
      a3AnimCountUp(el, val, 800, a3AnimFmtScore);
    }
  });

  // ── Student table: total-cell / point-cell ─────────────────
  document.querySelectorAll('.total-cell:not([data-a3-counted]), .point-cell:not([data-a3-counted])').forEach(el => {
    el.setAttribute('data-a3-counted', '1');
    const raw = el.textContent.trim();
    if (!raw || raw === '0') return;
    const m = raw.match(/^([+-]?)(\d[\d.,]*)$/);
    if (!m) return;
    const sign = m[1] === '-' ? -1 : 1;
    const val  = parseInt(m[2].replace(/[.,]/g, ''), 10) * sign;
    if (!isNaN(val) && val !== 0) {
      a3AnimCountUp(el, val, 600, a3AnimFmtScore);
    }
  });

  // ── Compact table scores ───────────────────────────────────
  document.querySelectorAll('.compact-score-table .score-positive:not([data-a3-counted]), .compact-score-table .score-negative:not([data-a3-counted])').forEach(el => {
    el.setAttribute('data-a3-counted', '1');
    const raw = el.textContent.trim();
    if (!raw || raw === '0') return;
    const m = raw.match(/^([+-]?)(\d[\d.,]*)$/);
    if (!m) return;
    const sign = m[1] === '-' ? -1 : 1;
    const val  = parseInt(m[2].replace(/[.,]/g, ''), 10) * sign;
    if (!isNaN(val) && val !== 0) {
      a3AnimCountUp(el, val, 600, a3AnimFmtScore);
    }
  });
}

/* ============================================================
   7. SKELETON LOADING — replace content areas during fetch
   ============================================================ */

/** Show skeleton in the main overview area */
function a3AnimShowSkeleton() {
  const content = document.querySelector('.scoreboard-content');
  if (!content) return;

  // Only replace if we're in loading state (avoid overwriting real data)
  if (document.querySelector('.a3-skeleton-podium-grid')) return;

  // Store scroll position
  const scrollTop = content.scrollTop;

  // Build skeleton for overview page
  const skeletonHTML = `
    <div class="score-page overview-compact-page" id="a3-skeleton-overlay">
      <section class="overview-feature-grid">
        ${a3AnimSkeletonPodium()}
        ${a3AnimSkeletonChart()}
      </section>
      <div class="group-overview-grid">
        ${[1,2,3,4].map(g => `
          <div class="score-panel group-overview-card">
            <div class="group-overview-title" style="opacity:.5">Tổ ${g}</div>
            ${a3AnimSkeletonTableRows(6)}
          </div>`).join('')}
      </div>
    </div>`;

  content.innerHTML = skeletonHTML;
  content.scrollTop = scrollTop;
}

/** Remove skeleton (called when real render completes) */
function a3AnimHideSkeleton() {
  document.getElementById('a3-skeleton-overlay')?.remove();
}

/* ============================================================
   8. PATCH render() — hook into scoreboard.js lifecycle
   ============================================================ */
(function a3AnimPatchRender() {
  // Wait for scoreboard.js to define render() before patching
  function tryPatch() {
    if (typeof render !== 'function' || typeof setState !== 'function') {
      setTimeout(tryPatch, 50);
      return;
    }

    const _origRender = render;
    window.render = function a3AnimRenderWrapper() {
      _origRender.apply(this, arguments);
      // After real DOM render, trigger all animations
      a3AnimAfterRender();
    };

    // Also patch setState so we can detect LOADING transitions
    const _origSetState = setState;
    window.setState = function a3AnimSetStateWrapper(partial, tag) {
      // If transitioning into LOADING, show skeleton immediately
      if (partial && partial.dataSource === 'loading') {
        _origSetState.apply(this, arguments);
        // Brief delay so render() rebuilds the shell first
        requestAnimationFrame(() => {
          if (typeof DATA_SOURCE !== 'undefined' && state.dataSource === DATA_SOURCE.LOADING) {
            a3AnimShowSkeleton();
          }
        });
        return;
      }
      _origSetState.apply(this, arguments);
    };

    // Patch resetData to show skeleton immediately on refresh
    if (typeof resetData === 'function') {
      const _origResetData = resetData;
      window.resetData = function a3AnimResetDataWrapper() {
        a3AnimShowSkeleton();
        _origResetData.apply(this, arguments);
      };
    }

    console.log('[A3 Animations] Đã kích hoạt toàn bộ hiệu ứng bảng điểm.');
  }

  // Start patching after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryPatch);
  } else {
    tryPatch();
  }
})();
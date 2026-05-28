const A3_SCALE_OPTIONS = [75];

const SCALE_STORAGE_KEY = "a3k64-display-scale";
const PATCH_FLAG = "data-a3-display-settings-patched";

function getSavedScale() {
  return 75;
}

function applyScale(scale: number) {
  const safeScale = 75;
  localStorage.setItem(SCALE_STORAGE_KEY, String(safeScale));
  document.documentElement.style.setProperty("--a3-display-scale", String(safeScale / 100));
  document.documentElement.style.setProperty("zoom", `${safeScale}%`);
  (document.body.style as CSSStyleDeclaration & { zoom?: string }).zoom = `${safeScale}%`;
  window.dispatchEvent(new CustomEvent("a3k64-display-scale-change", { detail: { scale: safeScale } }));
}

function injectStyle() {
  if (document.getElementById("a3-display-options-style")) return;
  const style = document.createElement("style");
  style.id = "a3-display-options-style";
  style.textContent = `
    .a3-display-settings-card{max-width:960px;border:1px solid #243044;border-radius:18px;background:#0b1220;overflow:hidden;color:#f8fafc}
    .a3-display-settings-title{display:grid;grid-template-columns:auto minmax(0,1fr);gap:14px;align-items:center;padding:18px;border-bottom:1px solid #243044}
    .a3-display-settings-icon{width:22px;height:22px;color:var(--desktop-accent,#f97316)}
    .a3-display-settings-title h2{margin:0;font-size:24px;line-height:1.2}.a3-display-settings-title p{margin:4px 0 0;color:#94a3b8}
    .a3-display-row{min-height:78px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 18px}.a3-display-row:last-child{border-bottom:0}
    .a3-display-row-left{min-width:0}.a3-display-row-left strong{display:block;font-size:15px}.a3-display-row-left span{display:block;margin-top:5px;color:#94a3b8;font-size:12px;line-height:1.35}
    .a3-display-select{appearance:none;-webkit-appearance:none;min-width:280px;height:40px;border:1px solid #334155;border-radius:10px;padding:0 42px 0 14px;color:#f8fafc;background-color:#020617;background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);background-position:calc(100% - 18px) 17px,calc(100% - 12px) 17px;background-size:6px 6px,6px 6px;background-repeat:no-repeat;font:inherit;font-size:13px;font-weight:800;outline:none;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(255,255,255,.03)}
    .a3-display-select option{color:#f8fafc;background:#020617;font-weight:800;padding:10px}
    .a3-display-select:focus{border-color:var(--desktop-accent,#f97316);box-shadow:0 0 0 3px color-mix(in srgb,var(--desktop-accent,#f97316) 20%,transparent),inset 0 0 0 1px rgba(255,255,255,.04)}
    .theme-light .a3-display-settings-card,.win-root.theme-light .a3-display-settings-card{background:#fff;color:#0f172a;border-color:#d7dee8}
    .theme-light .a3-display-settings-title,.theme-light .a3-display-row,.win-root.theme-light .a3-display-settings-title,.win-root.theme-light .a3-display-row{border-color:#d7dee8}
    .theme-light .a3-display-settings-title p,.theme-light .a3-display-row-left span,.win-root.theme-light .a3-display-settings-title p,.win-root.theme-light .a3-display-row-left span{color:#64748b}
    .theme-light .a3-display-select,.win-root.theme-light .a3-display-select{color:#0f172a;background-color:#fff;border-color:#94a3b8}
    .theme-light .a3-display-select option,.win-root.theme-light .a3-display-select option{color:#0f172a;background:#fff}
    @media(max-width:760px){.a3-display-row{display:grid;gap:10px;align-items:start}.a3-display-select{width:100%;min-width:0}.a3-display-settings-title h2{font-size:22px}}
  `;
  document.head.appendChild(style);
}

function isDisplayPage(container: Element) {
  const text = (container.textContent || "").toLowerCase();
  return text.includes("màn hình") && (text.includes("kích thước hiển thị") || text.includes("các tuỳ chỉnh hiển thị") || text.includes("các tùy chỉnh hiển thị"));
}

function buildDisplayCard() {
  const scale = getSavedScale();
  const wrapper = document.createElement("section");
  wrapper.className = "a3-display-settings-card";
  wrapper.setAttribute(PATCH_FLAG, "1");
  wrapper.innerHTML = `
    <div class="a3-display-settings-title">
      <svg class="a3-display-settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="3" rx="2"></rect><line x1="8" x2="16" y1="21" y2="21"></line><line x1="12" x2="12" y1="17" y2="21"></line></svg>
      <div><h2>Màn hình</h2><p>Tùy chỉnh tỷ lệ hiển thị giao diện.</p></div>
    </div>
    <div class="a3-display-row">
      <div class="a3-display-row-left"><strong>Tỷ lệ và bố cục</strong><span>Thay đổi kích thước chữ, ứng dụng và các thành phần khác.</span></div>
      <select class="a3-display-select" data-a3-display-scale>${A3_SCALE_OPTIONS.map((item) => `<option value="${item}" ${item === scale ? "selected" : ""}>${item}%</option>`).join("")}</select>
    </div>
  `;

  wrapper.querySelector<HTMLSelectElement>("[data-a3-display-scale]")?.addEventListener("change", () => {
    applyScale(75);
  });
  return wrapper;
}

function patchDisplayPage() {
  injectStyle();
  const apps = Array.from(document.querySelectorAll(".settings-app"));
  for (const app of apps) {
    if (!isDisplayPage(app)) continue;
    if (app.querySelector(`[${PATCH_FLAG}="1"]`)) continue;
    const card = app.querySelector(".settings-card");
    if (!card || !card.parentElement) continue;
    card.replaceWith(buildDisplayCard());
  }
}

function initDisplayOptionsPatch() {
  applyScale(75);
  patchDisplayPage();
  const observer = new MutationObserver(() => patchDisplayPage());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("storage", () => {
    applyScale(75);
    patchDisplayPage();
  });
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initDisplayOptionsPatch, { once: true });
  else initDisplayOptionsPatch();
}

export {};

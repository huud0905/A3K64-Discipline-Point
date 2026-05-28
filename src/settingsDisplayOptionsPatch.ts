const A3_SCALE_OPTIONS = [25, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500];

const A3_RESOLUTION_OPTIONS = [
  { value: "1280x720", label: "1280 × 720" },
  { value: "1366x768", label: "1366 × 768" },
  { value: "1600x900", label: "1600 × 900" },
  { value: "1920x1080", label: "1920 × 1080 (Khuyến nghị)" },
  { value: "2560x1440", label: "2560 × 1440" },
  { value: "3840x2160", label: "3840 × 2160" },
];

const SCALE_STORAGE_KEY = "a3k64-display-scale";
const RESOLUTION_STORAGE_KEY = "a3k64-display-resolution";
const PATCH_FLAG = "data-a3-display-settings-patched";

function getSavedScale() {
  const raw = Number(localStorage.getItem(SCALE_STORAGE_KEY) || "100");
  return A3_SCALE_OPTIONS.includes(raw) ? raw : 100;
}

function getSavedResolution() {
  return localStorage.getItem(RESOLUTION_STORAGE_KEY) || "1920x1080";
}

function applyScale(scale: number) {
  const safeScale = A3_SCALE_OPTIONS.includes(scale) ? scale : 100;
  localStorage.setItem(SCALE_STORAGE_KEY, String(safeScale));
  document.documentElement.style.setProperty("--a3-display-scale", String(safeScale / 100));
  document.documentElement.style.setProperty("zoom", `${safeScale}%`);
  (document.body.style as CSSStyleDeclaration & { zoom?: string }).zoom = `${safeScale}%`;
  window.dispatchEvent(new CustomEvent("a3k64-display-scale-change", { detail: { scale: safeScale } }));
}

function applyResolution(value: string) {
  const option = A3_RESOLUTION_OPTIONS.find((item) => item.value === value) || A3_RESOLUTION_OPTIONS[3];
  localStorage.setItem(RESOLUTION_STORAGE_KEY, option.value);
  document.documentElement.dataset.a3DisplayResolution = option.value;
  document.documentElement.style.setProperty("--a3-display-resolution", option.value);
  window.dispatchEvent(new CustomEvent("a3k64-display-resolution-change", { detail: option }));
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
    .a3-display-row{min-height:78px;border-bottom:1px solid #243044;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 18px}.a3-display-row:last-child{border-bottom:0}
    .a3-display-row-left{min-width:0}.a3-display-row-left strong{display:block;font-size:15px}.a3-display-row-left span{display:block;margin-top:5px;color:#94a3b8;font-size:12px;line-height:1.35}
    .a3-display-select{min-width:280px;height:38px;border:1px solid #334155;border-radius:4px;padding:0 34px 0 12px;color:#f8fafc;background:#020617;font:inherit;font-size:13px;font-weight:700;outline:none;cursor:pointer}
    .a3-display-select:focus{border-color:var(--desktop-accent,#f97316);box-shadow:0 0 0 3px color-mix(in srgb,var(--desktop-accent,#f97316) 20%,transparent)}
    .a3-display-note{padding:12px 18px;color:#94a3b8;font-size:12px;line-height:1.5;background:rgba(15,23,42,.45)}
    .theme-light .a3-display-settings-card,.win-root.theme-light .a3-display-settings-card{background:#fff;color:#0f172a;border-color:#d7dee8}
    .theme-light .a3-display-settings-title,.theme-light .a3-display-row,.win-root.theme-light .a3-display-settings-title,.win-root.theme-light .a3-display-row{border-color:#d7dee8}
    .theme-light .a3-display-settings-title p,.theme-light .a3-display-row-left span,.theme-light .a3-display-note,.win-root.theme-light .a3-display-settings-title p,.win-root.theme-light .a3-display-row-left span,.win-root.theme-light .a3-display-note{color:#64748b}
    .theme-light .a3-display-select,.win-root.theme-light .a3-display-select{color:#0f172a;background:#fff;border-color:#94a3b8}
    .theme-light .a3-display-note,.win-root.theme-light .a3-display-note{background:#f8fafc}
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
  const resolution = getSavedResolution();
  const wrapper = document.createElement("section");
  wrapper.className = "a3-display-settings-card";
  wrapper.setAttribute(PATCH_FLAG, "1");
  wrapper.innerHTML = `
    <div class="a3-display-settings-title">
      <svg class="a3-display-settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="3" rx="2"></rect><line x1="8" x2="16" y1="21" y2="21"></line><line x1="12" x2="12" y1="17" y2="21"></line></svg>
      <div><h2>Màn hình</h2><p>Tùy chỉnh tỷ lệ hiển thị và độ phân giải giao diện.</p></div>
    </div>
    <div class="a3-display-row">
      <div class="a3-display-row-left"><strong>Tỷ lệ và bố cục</strong><span>Thay đổi kích thước chữ, ứng dụng và các thành phần khác.</span></div>
      <select class="a3-display-select" data-a3-display-scale>${A3_SCALE_OPTIONS.map((item) => `<option value="${item}" ${item === scale ? "selected" : ""}>${item}%${item === 100 ? " (Khuyến nghị)" : ""}</option>`).join("")}</select>
    </div>
    <div class="a3-display-row">
      <div class="a3-display-row-left"><strong>Độ phân giải màn hình</strong><span>Chọn độ phân giải hiển thị cho giao diện ứng dụng.</span></div>
      <select class="a3-display-select" data-a3-display-resolution>${A3_RESOLUTION_OPTIONS.map((item) => `<option value="${item.value}" ${item.value === resolution ? "selected" : ""}>${item.label}</option>`).join("")}</select>
    </div>
    <div class="a3-display-note">Lưu ý: Trình duyệt không cho web đổi trực tiếp độ phân giải vật lý của màn hình. Tỷ lệ sẽ được áp dụng bằng zoom giao diện và lưu lại cho lần mở sau.</div>
  `;

  wrapper.querySelector<HTMLSelectElement>("[data-a3-display-scale]")?.addEventListener("change", (event) => {
    applyScale(Number((event.currentTarget as HTMLSelectElement).value));
  });
  wrapper.querySelector<HTMLSelectElement>("[data-a3-display-resolution]")?.addEventListener("change", (event) => {
    applyResolution((event.currentTarget as HTMLSelectElement).value);
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
  applyScale(getSavedScale());
  applyResolution(getSavedResolution());
  patchDisplayPage();
  const observer = new MutationObserver(() => patchDisplayPage());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("storage", () => {
    applyScale(getSavedScale());
    applyResolution(getSavedResolution());
    patchDisplayPage();
  });
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initDisplayOptionsPatch, { once: true });
  else initDisplayOptionsPatch();
}

export {};

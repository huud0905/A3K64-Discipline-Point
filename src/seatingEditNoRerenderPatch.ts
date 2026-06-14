const SENR_WIN = "#a3k64-seating-window";
let senrBound = false;
let senrTimer = 0;

function senrIsEditOn() {
  const btn = document.querySelector<HTMLElement>(`${SENR_WIN} [data-tool='edit']`);
  return Boolean(btn?.classList.contains("primary") || /đang\s*sửa/i.test(btn?.textContent || ""));
}

function senrSetEdit(on: boolean) {
  const win = document.querySelector<HTMLElement>(SENR_WIN);
  const btn = document.querySelector<HTMLButtonElement>(`${SENR_WIN} [data-tool='edit']`);
  if (!win || !btn) return;
  btn.classList.toggle("primary", on);
  btn.textContent = on ? "Đang sửa" : "Bật sửa";
  btn.dataset.editState = on ? "on" : "off";
  win.classList.toggle("seat-edit-locked", !on);
  win.querySelectorAll<HTMLElement>(".stable-seat-cell").forEach((cell) => {
    const name = (cell.textContent || "").trim();
    const canDrag = on && name && name !== "Trống" && !cell.classList.contains("empty");
    cell.draggable = Boolean(canDrag);
    if (!on) cell.classList.remove("drag-over");
  });
  win.querySelectorAll<HTMLElement>(".stable-seat-student-card").forEach((card) => {
    const visible = card.style.display !== "none";
    card.draggable = Boolean(on && visible);
  });
  window.dispatchEvent(new CustomEvent("a3k64:seating-edit-mode", { detail: { on } }));
}

function senrInjectStyle() {
  if (document.getElementById("a3-seat-edit-no-rerender-style")) return;
  const style = document.createElement("style");
  style.id = "a3-seat-edit-no-rerender-style";
  style.textContent = `
    ${SENR_WIN} .stable-seat-tools > *{
      flex:0 0 auto!important;
      align-self:center!important;
      position:relative!important;
      z-index:auto!important;
    }
    ${SENR_WIN} .stable-seat-tools [data-tool='edit']{
      min-width:86px!important;
      display:inline-flex!important;
      align-items:center!important;
      justify-content:center!important;
    }
  `;
  document.head.appendChild(style);
}

function senrBind() {
  if (senrBound) return;
  senrBound = true;
  senrInjectStyle();
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const btn = target?.closest?.(`${SENR_WIN} [data-tool='edit']`) as HTMLButtonElement | null;
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
    senrSetEdit(!senrIsEditOn());
  }, true);
}

function senrTick() {
  senrInjectStyle();
  if (!document.querySelector(SENR_WIN)) return;
  senrSetEdit(senrIsEditOn());
}

function senrBoot() {
  senrBind();
  senrTick();
  senrTimer = window.setInterval(senrTick, 600);
  window.addEventListener("a3k64:seating-changed", () => setTimeout(senrTick, 80));
  window.addEventListener("a3k64:seating-backend-synced", () => setTimeout(senrTick, 80));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", senrBoot);
else senrBoot();

export {};

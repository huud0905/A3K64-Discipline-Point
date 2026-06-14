const SPCU_MODAL = ".seat-pub-lite-backdrop .seat-pub-lite-modal";
let spcuReady = false;

function spcuInjectStyle() {
  if (document.getElementById("a3-spcu-style")) return;
  const style = document.createElement("style");
  style.id = "a3-spcu-style";
  style.textContent = `${SPCU_MODAL} .spp-panel{margin-top:0!important;padding:14px!important;border-radius:20px!important;align-self:stretch!important}${SPCU_MODAL} .spp-row{align-items:center!important}${SPCU_MODAL} .spp-choice,${SPCU_MODAL} .spp-check{height:38px!important;min-height:38px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:9px!important;line-height:1!important;padding:0 14px!important;box-sizing:border-box!important;white-space:nowrap!important}${SPCU_MODAL} .spp-choice input,${SPCU_MODAL} .spp-check input{width:16px!important;height:16px!important;margin:0!important;flex:0 0 auto!important;transform:none!important;vertical-align:middle!important}`;
  document.head.appendChild(style);
}

function spcuSyncOne() {
  spcuInjectStyle();
  const modal = document.querySelector<HTMLElement>(SPCU_MODAL);
  if (!modal) return;
  const text = modal.querySelector<HTMLElement>(".seat-pub-lite-trigger span")?.textContent || "";
  const show = text.includes("Xem trước");
  const previewWrap = modal.querySelector<HTMLElement>("[data-preview-wrap]");
  const publishWrap = modal.querySelector<HTMLElement>("[data-publish-wrap]");
  const permPanel = modal.querySelector<HTMLElement>("[data-spp-panel]");
  if (previewWrap) previewWrap.style.display = show ? "grid" : "none";
  if (publishWrap) publishWrap.style.display = show ? "grid" : "none";
  if (permPanel) permPanel.style.display = show ? "grid" : "none";
  const edit = modal.querySelector<HTMLInputElement>("[data-spp-mode='edit']")?.checked;
  const editOptions = modal.querySelector<HTMLElement>("[data-spp-edit-options]");
  if (editOptions) editOptions.style.display = show && edit ? "grid" : "none";
}

function spcuBoot() {
  if (spcuReady) return;
  spcuReady = true;
  spcuInjectStyle();
  spcuSyncOne();
  window.setInterval(spcuSyncOne, 200);
  document.addEventListener("click", () => setTimeout(spcuSyncOne, 0), true);
  document.addEventListener("change", () => setTimeout(spcuSyncOne, 0), true);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", spcuBoot);
else spcuBoot();

export {};

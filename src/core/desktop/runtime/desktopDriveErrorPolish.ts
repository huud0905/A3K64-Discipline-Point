import { normalizedText } from '../../dom';

const DRIVE_STATUS_ID = "a3k64-wallpaper-status";

function extractActivationUrl(raw: string) {
  const match = raw.match(/https:\/\/console\.developers\.google\.com\/apis\/api\/drive\.googleapis\.com\/overview\?project=\d+/);
  return match?.[0] || "https://console.cloud.google.com/apis/library/drive.googleapis.com";
}

function makeDriveErrorFriendly(raw: string) {
  if (!raw) return "";
  const text = normalizedText(raw);
  const lower = text.toLowerCase();
  const isDriveApiDisabled = lower.includes("drive api has not been used") || lower.includes("accessnotconfigured") || lower.includes("service_disabled");
  if (!isDriveApiDisabled) return "";
  const url = extractActivationUrl(text);
  return [
    "Google Drive API chưa được bật trong Google Cloud project của web.",
    "Cách sửa: mở Google Cloud Console → bật Google Drive API → đợi khoảng 2-5 phút → quay lại bấm tải lên Drive lần nữa.",
    `Link bật nhanh: ${url}`,
  ].join("\n");
}

function polishStatusElement(el: HTMLElement) {
  const raw = el.textContent || "";
  const friendly = makeDriveErrorFriendly(raw);
  if (!friendly || raw === friendly) return;
  el.textContent = friendly;
  el.dataset.kind = "error";
  el.style.whiteSpace = "pre-line";
  el.style.wordBreak = "break-word";
}

function installDriveErrorPolish() {
  const scan = () => {
    const el = document.getElementById(DRIVE_STATUS_ID) as HTMLElement | null;
    if (el) polishStatusElement(el);
  };
  scan();
  window.setInterval(scan, 500);
  const observer = new MutationObserver((mutations) => {
    for (const item of mutations) {
      const target = item.target instanceof HTMLElement ? item.target : item.target.parentElement;
      const status = target?.id === DRIVE_STATUS_ID ? target : target?.querySelector?.(`#${DRIVE_STATUS_ID}`);
      if (status instanceof HTMLElement) polishStatusElement(status);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installDriveErrorPolish, { once: true });
  else installDriveErrorPolish();
}

export {};

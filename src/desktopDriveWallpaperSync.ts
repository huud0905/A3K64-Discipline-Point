import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth, isFirebaseAuthEnabled } from "./lib/firebase";

const MAX_WALLPAPER_BYTES = 10 * 1024 * 1024;
const DB_NAME = "a3k64-wallpaper-db";
const STORE_NAME = "wallpapers";
const LOCAL_KEY = "current";
const META_KEY = "a3k64-desktop-wallpaper-meta-v1";
const TOKEN_KEY = "a3k64-google-drive-access-token-v1";
const TOKEN_TIME_KEY = "a3k64-google-drive-token-time-v1";
const DRIVE_APP_PROP_KEY = "a3k64Type";
const DRIVE_APP_PROP_VALUE = "desktop-wallpaper";
const DRIVE_FILE_NAME = "A3K64 Desktop Wallpaper";

let objectUrl = "";
let lastDesktopBackground = "";
let uiTimer = 0;
let wallpaperLoaded = false;
let pendingDriveRestore = false;

type WallpaperMeta = {
  name: string;
  type: string;
  size: number;
  updatedAt: number;
  driveFileId?: string;
};

function readSessionUser() {
  try {
    const session = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null");
    return session?.user || {};
  } catch {
    return {};
  }
}

function setStatus(message: string, kind: "info" | "ok" | "error" = "info") {
  const el = document.getElementById("a3k64-wallpaper-status");
  if (!el) return;
  el.textContent = message;
  el.dataset.kind = kind;
}

function readMeta(): WallpaperMeta | null {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || "null");
  } catch {
    return null;
  }
}

function writeMeta(meta: WallpaperMeta) {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Không mở được IndexedDB."));
  });
}

async function setLocalWallpaperBlob(blob: Blob, meta: WallpaperMeta) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(blob, LOCAL_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Không lưu được hình nền."));
  });
  db.close();
  writeMeta(meta);
  await applyBlob(blob);
  refreshControls();
}

async function getLocalWallpaperBlob(): Promise<Blob | null> {
  const db = await openDb();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(LOCAL_KEY);
    request.onsuccess = () => resolve((request.result as Blob) || null);
    request.onerror = () => reject(request.error || new Error("Không đọc được hình nền."));
  });
  db.close();
  return blob;
}

async function clearLocalWallpaper() {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(LOCAL_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Không xoá được hình nền."));
  });
  db.close();
  localStorage.removeItem(META_KEY);
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = "";
  lastDesktopBackground = "";
  applyWallpaperToDom("");
  refreshControls();
}

function applyWallpaperToDom(url: string) {
  const desktops = Array.from(document.querySelectorAll<HTMLElement>(".win-root .win-desktop"));
  const previews = Array.from(document.querySelectorAll<HTMLElement>(".background-preview"));
  const background = url
    ? `linear-gradient(rgba(2, 6, 23, .18), rgba(2, 6, 23, .18)), url(${url})`
    : "";

  [...desktops, ...previews].forEach((el) => {
    if (!el) return;
    if (!url) {
      el.style.removeProperty("background-image");
      el.style.removeProperty("background-size");
      el.style.removeProperty("background-position");
      el.style.removeProperty("background-repeat");
      return;
    }
    el.style.setProperty("background-image", background, "important");
    el.style.setProperty("background-size", "cover", "important");
    el.style.setProperty("background-position", "center", "important");
    el.style.setProperty("background-repeat", "no-repeat", "important");
  });
}

async function applyBlob(blob: Blob) {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(blob);
  lastDesktopBackground = objectUrl;
  applyWallpaperToDom(objectUrl);
}

async function loadLocalWallpaper() {
  if (wallpaperLoaded) return;
  wallpaperLoaded = true;
  try {
    const blob = await getLocalWallpaperBlob();
    if (blob) await applyBlob(blob);
  } catch {
    // Ignore local cache errors.
  }
}

function getStoredDriveToken() {
  const token = localStorage.getItem(TOKEN_KEY) || "";
  const time = Number(localStorage.getItem(TOKEN_TIME_KEY) || "0");
  if (!token || !time || Date.now() - time > 45 * 60 * 1000) return "";
  return token;
}

async function getDriveToken() {
  const stored = getStoredDriveToken();
  if (stored) return stored;
  if (!isFirebaseAuthEnabled || !auth) throw new Error("Cần đăng nhập Google để đồng bộ Google Drive.");
  const provider = new GoogleAuthProvider();
  provider.addScope("https://www.googleapis.com/auth/drive.file");
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(auth as any, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken || "";
  if (!token) throw new Error("Không lấy được quyền Google Drive.");
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(TOKEN_TIME_KEY, String(Date.now()));
  return token;
}

async function driveRequest(token: string, url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Google Drive lỗi ${response.status}`);
  }
  return response;
}

async function findDriveWallpaper(token: string) {
  const query = `appProperties has { key='${DRIVE_APP_PROP_KEY}' and value='${DRIVE_APP_PROP_VALUE}' } and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,modifiedTime,appProperties)&pageSize=10`;
  const response = await driveRequest(token, url);
  const json = await response.json();
  return (json.files || [])[0] as { id: string; name: string; mimeType?: string; size?: string; modifiedTime?: string } | undefined;
}

function multipartBody(metadata: Record<string, unknown>, blob: Blob) {
  const boundary = `a3k64_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return blob.arrayBuffer().then((buffer) => {
    const head =
      `--${boundary}\r\n` +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${blob.type || "application/octet-stream"}\r\n\r\n`;
    const tail = `\r\n--${boundary}--`;
    return {
      body: new Blob([head, buffer, tail], { type: `multipart/related; boundary=${boundary}` }),
      contentType: `multipart/related; boundary=${boundary}`,
    };
  });
}

async function uploadCurrentWallpaperToDrive() {
  const blob = await getLocalWallpaperBlob();
  const meta = readMeta();
  if (!blob || !meta) throw new Error("Chưa có hình nền để tải lên Drive.");
  const token = await getDriveToken();
  const found = await findDriveWallpaper(token);
  const metadata = {
    name: DRIVE_FILE_NAME,
    mimeType: blob.type || meta.type || "image/jpeg",
    appProperties: {
      [DRIVE_APP_PROP_KEY]: DRIVE_APP_PROP_VALUE,
      ownerEmail: String(readSessionUser().email || ""),
      originalName: meta.name,
    },
  };
  const { body, contentType } = await multipartBody(metadata, blob);
  const url = found?.id
    ? `https://www.googleapis.com/upload/drive/v3/files/${found.id}?uploadType=multipart&fields=id,name,webViewLink`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink";
  const response = await driveRequest(token, url, {
    method: found?.id ? "PATCH" : "POST",
    headers: { "Content-Type": contentType },
    body,
  });
  const json = await response.json();
  writeMeta({ ...meta, driveFileId: json.id || found?.id });
  return json;
}

async function restoreWallpaperFromDrive() {
  const token = await getDriveToken();
  const found = await findDriveWallpaper(token);
  if (!found?.id) throw new Error("Chưa tìm thấy hình nền A3K64 trên Google Drive.");
  const response = await driveRequest(token, `https://www.googleapis.com/drive/v3/files/${found.id}?alt=media`);
  const blob = await response.blob();
  const meta: WallpaperMeta = {
    name: found.name || DRIVE_FILE_NAME,
    type: blob.type || found.mimeType || "image/jpeg",
    size: blob.size || Number(found.size || 0),
    updatedAt: Date.now(),
    driveFileId: found.id,
  };
  await setLocalWallpaperBlob(blob, meta);
}

async function handlePickFile(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Chỉ chấp nhận file ảnh.");
  if (file.size > MAX_WALLPAPER_BYTES) throw new Error("Ảnh vượt quá 10MB.");
  const meta: WallpaperMeta = { name: file.name, type: file.type, size: file.size, updatedAt: Date.now() };
  await setLocalWallpaperBlob(file, meta);
  setStatus("Đã đặt hình nền. Đang tải lên Google Drive...", "info");
  await uploadCurrentWallpaperToDrive();
  setStatus("Đã tải hình nền lên Google Drive.", "ok");
}

function ensureStyle() {
  if (document.getElementById("a3k64-wallpaper-drive-style")) return;
  const style = document.createElement("style");
  style.id = "a3k64-wallpaper-drive-style";
  style.textContent = `
    .a3k64-wallpaper-drive-box{margin:0 18px 18px;padding:14px;border:1px solid #243044;border-radius:16px;background:rgba(15,23,42,.34);display:grid;gap:10px}
    .a3k64-wallpaper-drive-title{display:flex;align-items:center;justify-content:space-between;gap:12px;font-weight:900;color:inherit}
    .a3k64-wallpaper-drive-title span{font-size:12px;color:#94a3b8;font-weight:800}
    .a3k64-wallpaper-actions{display:flex;flex-wrap:wrap;gap:8px}
    .a3k64-wallpaper-actions button{min-height:36px;border:1px solid #334155;border-radius:10px;padding:0 12px;color:inherit;background:#0f172a;font:inherit;font-weight:800;cursor:pointer}
    .a3k64-wallpaper-actions button:hover{filter:brightness(1.12)}
    #a3k64-wallpaper-status{font-size:12px;color:#94a3b8;font-weight:700;line-height:1.45}
    #a3k64-wallpaper-status[data-kind=ok]{color:#16a34a}
    #a3k64-wallpaper-status[data-kind=error]{color:#ef4444}
    .win-root.theme-light .a3k64-wallpaper-drive-box{background:#fff;border-color:#d7dee8;color:#0f172a}
    .win-root.theme-light .a3k64-wallpaper-actions button{background:#fff;border-color:#cbd5e1;color:#0f172a}
    .win-root.theme-light .a3k64-wallpaper-drive-title span{color:#64748b}
  `;
  document.head.appendChild(style);
}

function refreshControls() {
  const meta = readMeta();
  const info = document.getElementById("a3k64-wallpaper-info");
  if (info) info.textContent = meta ? `${meta.name} · ${(meta.size / 1024 / 1024).toFixed(2)}MB` : "Chưa chọn ảnh · tối đa 10MB";
  applyWallpaperToDom(lastDesktopBackground || objectUrl);
}

function ensureControls() {
  ensureStyle();
  const preview = document.querySelector<HTMLElement>(".background-preview");
  if (!preview) return;
  const card = preview.closest<HTMLElement>(".settings-card");
  if (!card || card.querySelector("#a3k64-wallpaper-drive-controls")) {
    refreshControls();
    return;
  }

  const box = document.createElement("div");
  box.id = "a3k64-wallpaper-drive-controls";
  box.className = "a3k64-wallpaper-drive-box";
  box.innerHTML = `
    <div class="a3k64-wallpaper-drive-title">Đồng bộ hình nền Google Drive <span id="a3k64-wallpaper-info">Chưa chọn ảnh · tối đa 10MB</span></div>
    <input id="a3k64-wallpaper-file" type="file" accept="image/*" hidden />
    <div class="a3k64-wallpaper-actions">
      <button type="button" id="a3k64-wallpaper-pick">Chọn ảnh & tải lên Drive</button>
      <button type="button" id="a3k64-wallpaper-upload">Tải lại lên Drive</button>
      <button type="button" id="a3k64-wallpaper-restore">Tải xuống từ Drive</button>
      <button type="button" id="a3k64-wallpaper-clear">Xóa nền máy này</button>
    </div>
    <div id="a3k64-wallpaper-status">Đăng nhập Google khi đồng bộ để cấp quyền Drive. Ảnh lưu tối đa 10MB.</div>
  `;
  preview.insertAdjacentElement("afterend", box);

  const input = box.querySelector<HTMLInputElement>("#a3k64-wallpaper-file");
  box.querySelector<HTMLButtonElement>("#a3k64-wallpaper-pick")?.addEventListener("click", () => input?.click());
  input?.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      setStatus("Đang xử lý hình nền...", "info");
      await handlePickFile(file);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Không xử lý được hình nền.", "error");
    }
  });
  box.querySelector<HTMLButtonElement>("#a3k64-wallpaper-upload")?.addEventListener("click", async () => {
    try {
      setStatus("Đang tải lên Google Drive...", "info");
      await uploadCurrentWallpaperToDrive();
      setStatus("Đã tải hình nền lên Google Drive.", "ok");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Không tải lên được Drive.", "error");
    }
  });
  box.querySelector<HTMLButtonElement>("#a3k64-wallpaper-restore")?.addEventListener("click", async () => {
    try {
      setStatus("Đang tải hình nền từ Google Drive...", "info");
      await restoreWallpaperFromDrive();
      setStatus("Đã tải xuống và áp dụng hình nền từ Drive.", "ok");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Không tải xuống được từ Drive.", "error");
    }
  });
  box.querySelector<HTMLButtonElement>("#a3k64-wallpaper-clear")?.addEventListener("click", async () => {
    await clearLocalWallpaper();
    setStatus("Đã xóa hình nền trên máy này. File trên Drive vẫn được giữ.", "ok");
  });
  refreshControls();
}

async function autoRestoreOnce() {
  if (pendingDriveRestore) return;
  pendingDriveRestore = true;
  try {
    await loadLocalWallpaper();
    const local = await getLocalWallpaperBlob();
    if (!local && getStoredDriveToken()) await restoreWallpaperFromDrive();
  } catch {
    // Silent auto restore failure. User can click restore manually.
  } finally {
    pendingDriveRestore = false;
  }
}

function bootWallpaperSync() {
  ensureControls();
  loadLocalWallpaper().then(refreshControls).catch(() => undefined);
  autoRestoreOnce();
  window.addEventListener("storage", () => {
    wallpaperLoaded = false;
    loadLocalWallpaper().then(refreshControls).catch(() => undefined);
  });
  window.addEventListener("desktop-wallpaper-change", refreshControls);
  window.clearInterval(uiTimer);
  uiTimer = window.setInterval(() => {
    ensureControls();
    if (lastDesktopBackground || objectUrl) applyWallpaperToDom(lastDesktopBackground || objectUrl);
  }, 900);
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootWallpaperSync, { once: true });
  else bootWallpaperSync();
}

export {};

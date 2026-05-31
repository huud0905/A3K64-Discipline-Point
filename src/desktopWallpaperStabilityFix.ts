/* Ổn định patch hình nền:
   - Tránh React crash NotFoundError khi DOM phụ trợ bị thay đổi ngoài React.
   - Xoá token Drive cũ trước khi bấm các nút Drive để lấy scope/quyền mới sau khi bật Google Drive API. */

const DRIVE_TOKEN_KEY = "a3k64-google-drive-access-token-v1";
const DRIVE_TOKEN_TIME_KEY = "a3k64-google-drive-token-time-v1";

function installSafeDomRemoveGuard() {
  const proto = Node.prototype as Node & {
    __a3k64RemoveGuardInstalled?: boolean;
    removeChild<T extends Node>(child: T): T;
    insertBefore<T extends Node>(node: T, child: Node | null): T;
  };
  if (proto.__a3k64RemoveGuardInstalled) return;
  proto.__a3k64RemoveGuardInstalled = true;

  const nativeRemoveChild = proto.removeChild;
  const nativeInsertBefore = proto.insertBefore;

  proto.removeChild = function <T extends Node>(child: T): T {
    try {
      if (child.parentNode === this) return nativeRemoveChild.call(this, child) as T;
      // Nếu node đã bị di chuyển/xoá bởi patch DOM phụ trợ thì coi như đã xoá xong,
      // tránh làm React crash toàn trang.
      if (child.parentNode) return nativeRemoveChild.call(child.parentNode, child) as T;
      return child;
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") return child;
      throw error;
    }
  };

  proto.insertBefore = function <T extends Node>(node: T, child: Node | null): T {
    try {
      if (child && child.parentNode !== this) return nativeInsertBefore.call(this, node, null) as T;
      return nativeInsertBefore.call(this, node, child) as T;
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") return nativeInsertBefore.call(this, node, null) as T;
      throw error;
    }
  };
}

function clearDriveTokenBeforeDriveAction(event: Event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest?.("#a3k64-wallpaper-pick,#a3k64-wallpaper-upload,#a3k64-wallpaper-restore")) return;
  localStorage.removeItem(DRIVE_TOKEN_KEY);
  localStorage.removeItem(DRIVE_TOKEN_TIME_KEY);
}

function installWallpaperStabilityFix() {
  installSafeDomRemoveGuard();
  document.addEventListener("click", clearDriveTokenBeforeDriveAction, true);
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installWallpaperStabilityFix, { once: true });
  else installWallpaperStabilityFix();
}

export {};

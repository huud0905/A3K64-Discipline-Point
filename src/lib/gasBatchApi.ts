import type { ScoreEvent } from "../apps/ScoreboardApp/data/mockScoreData";

const GAS_URL = import.meta.env.VITE_GAS_WEB_APP_URL?.trim();
const JSONP_TIMEOUT_MS = 45000;

type SaveScoreChangesPayload = {
  additions: ScoreEvent[];
  deletions: string[];
};

function asText(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function actorPayload() {
  try {
    const session = JSON.parse(localStorage.getItem("a3k64-login-session-v1") || "null") as { user?: Record<string, unknown> } | null;
    const user = session?.user || {};
    return {
      actorEmail: asText(user.email),
      actorUid: asText(user.uid),
      actorName: asText(user.displayName ?? user.name ?? user.hoten),
      actorRole: asText(user.role),
      actorGroup: asText(user.group ?? user.to),
    };
  } catch {
    return {};
  }
}

function gasJsonp(action: string, payload?: unknown): Promise<unknown> {
  if (!GAS_URL || typeof document === "undefined") return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const callbackName = `__a3k64BatchCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const url = new URL(GAS_URL);
    const globalCallbacks = window as typeof window & Record<string, unknown>;
    let timeoutId = 0;
    let settled = false;

    url.searchParams.set("action", action);
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("t", String(Date.now()));
    if (payload !== undefined) url.searchParams.set("payload", JSON.stringify(payload));

    const cleanup = (lateNoop = false) => {
      window.clearTimeout(timeoutId);
      script.onerror = null;
      if (lateNoop) {
        globalCallbacks[callbackName] = () => undefined;
        window.setTimeout(() => delete globalCallbacks[callbackName], 60000);
      } else {
        delete globalCallbacks[callbackName];
      }
      script.remove();
    };

    globalCallbacks[callbackName] = (json: { ok?: boolean; error?: string; data?: { ok?: boolean; error?: string } }) => {
      if (settled) return;
      settled = true;
      cleanup(false);
      if (json?.ok === false) reject(new Error(asText(json.error, "Google Apps Script trả về lỗi.")));
      else if (json?.data?.ok === false) reject(new Error(asText(json.data.error, "Google Apps Script trả về lỗi.")));
      else resolve(json);
    };

    script.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup(true);
      reject(new Error("Không tải được JSONP từ Google Apps Script."));
    };

    timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup(true);
      reject(new Error("Google Apps Script phản hồi quá lâu."));
    }, JSONP_TIMEOUT_MS);

    script.src = url.toString();
    document.head.appendChild(script);
  });
}

export async function saveScoreChangesInGas(payload: SaveScoreChangesPayload) {
  if (!GAS_URL) return null;
  const additions = payload.additions.map((event) => ({
    ...event,
    createdAt: event.createdAt || new Date().toISOString(),
  }));
  return gasJsonp("saveScoreChanges", {
    additions,
    deletions: payload.deletions,
    ...actorPayload(),
  });
}

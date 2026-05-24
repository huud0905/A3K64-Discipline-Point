type JsonRecord = Record<string, unknown>;
type SavePayload = JsonRecord & {
  additions?: unknown[];
  deletions?: unknown[];
};

declare global {
  interface Window {
    __A3K64_GAS_SAVE_JSONP_CHUNK_PATCH__?: boolean;
  }
}

const MAX_ITEMS_PER_CHUNK = 6;
const URL_SOFT_LIMIT = 10500;

function isScriptNode(node: Node): node is HTMLScriptElement {
  return node instanceof HTMLScriptElement;
}

function safeParsePayload(raw: string | null): SavePayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavePayload;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function itemCount(payload: SavePayload) {
  return (payload.additions?.length || 0) + (payload.deletions?.length || 0);
}

function actorFields(payload: SavePayload): JsonRecord {
  const { additions: _additions, deletions: _deletions, ...actor } = payload;
  return actor;
}

function buildJsonpUrl(base: URL, action: string, callback: string, payload?: unknown) {
  const url = new URL(base.toString());
  url.searchParams.set("action", action);
  url.searchParams.set("callback", callback);
  url.searchParams.set("t", String(Date.now()));
  if (payload !== undefined) url.searchParams.set("payload", JSON.stringify(payload));
  return url.toString();
}

function splitPayload(base: URL, payload: SavePayload) {
  const actor = actorFields(payload);
  const chunks: SavePayload[] = [];
  let current: SavePayload = { ...actor, additions: [], deletions: [] };

  const pushCurrent = () => {
    if ((current.additions?.length || 0) || (current.deletions?.length || 0)) {
      chunks.push(current);
    }
    current = { ...actor, additions: [], deletions: [] };
  };

  const tryPush = (kind: "additions" | "deletions", item: unknown) => {
    if (itemCount(current) >= MAX_ITEMS_PER_CHUNK) pushCurrent();
    const list = current[kind] || [];
    list.push(item);
    current[kind] = list;

    const probe = buildJsonpUrl(base, "saveScoreChanges", "__a3k64_probe__", current);
    if (probe.length <= URL_SOFT_LIMIT) return;

    list.pop();
    pushCurrent();
    current[kind] = [item];
  };

  (payload.deletions || []).forEach((item) => tryPush("deletions", item));
  (payload.additions || []).forEach((item) => tryPush("additions", item));
  pushCurrent();
  return chunks.length ? chunks : [payload];
}

function runJsonp(base: URL, action: string, payload?: unknown) {
  return new Promise<unknown>((resolve, reject) => {
    const callback = `__a3k64Chunk_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Google Apps Script phản hồi quá lâu."));
    }, 45000);

    function cleanup() {
      window.clearTimeout(timeout);
      delete (window as unknown as Record<string, unknown>)[callback];
      script.remove();
    }

    (window as unknown as Record<string, unknown>)[callback] = (json: unknown) => {
      cleanup();
      const record = json as { ok?: boolean; data?: { ok?: boolean; error?: unknown }; error?: unknown };
      if (record?.ok === false || record?.data?.ok === false) {
        reject(new Error(String(record.error || record.data?.error || "Google Apps Script trả về lỗi.")));
        return;
      }
      resolve(json);
    };

    script.dataset.a3k64ChunkBypass = "1";
    script.onerror = () => {
      cleanup();
      reject(new Error("Không tải được JSONP từ Google Apps Script."));
    };
    script.src = buildJsonpUrl(base, action, callback, payload);
    document.head.appendChild(script);
  });
}

async function saveByConfirmedChunks(originalUrl: URL, originalCallback: string, payload: SavePayload) {
  const base = new URL(originalUrl.toString());
  base.searchParams.delete("payload");
  base.searchParams.delete("callback");
  base.searchParams.delete("t");

  const chunks = splitPayload(base, payload);
  for (const chunk of chunks) {
    await runJsonp(base, "saveScoreChanges", chunk);
  }
  const finalScoreboard = await runJsonp(base, "getScoreboard");
  const callback = (window as unknown as Record<string, unknown>)[originalCallback];
  if (typeof callback === "function") {
    (callback as (json: unknown) => void)(finalScoreboard);
  }
}

function shouldChunkSave(url: URL, payload: SavePayload) {
  return itemCount(payload) > MAX_ITEMS_PER_CHUNK || url.toString().length > URL_SOFT_LIMIT;
}

if (typeof window !== "undefined" && !window.__A3K64_GAS_SAVE_JSONP_CHUNK_PATCH__) {
  window.__A3K64_GAS_SAVE_JSONP_CHUNK_PATCH__ = true;
  const nativeHeadAppendChild = HTMLHeadElement.prototype.appendChild;

  HTMLHeadElement.prototype.appendChild = function patchedAppendChild<T extends Node>(node: T): T {
    if (!isScriptNode(node) || node.dataset.a3k64ChunkBypass === "1") {
      return nativeHeadAppendChild.call(this, node) as T;
    }

    try {
      const url = new URL(node.src);
      const action = url.searchParams.get("action");
      const callback = url.searchParams.get("callback") || "";
      const payload = safeParsePayload(url.searchParams.get("payload"));

      if (action === "saveScoreChanges" && callback && payload && shouldChunkSave(url, payload)) {
        void saveByConfirmedChunks(url, callback, payload).catch((error) => {
          const originalCallback = (window as unknown as Record<string, unknown>)[callback];
          if (typeof originalCallback === "function") {
            (originalCallback as (json: unknown) => void)({ ok: false, error: error instanceof Error ? error.message : "Không lưu được điểm." });
          }
        });
        return node;
      }
    } catch {
      return nativeHeadAppendChild.call(this, node) as T;
    }

    return nativeHeadAppendChild.call(this, node) as T;
  };
}

export {};
type AnyEvent = {
  id?: string;
  studentId?: string;
  week?: number;
  title?: string;
  points?: number;
  type?: string;
  category?: string;
  note?: string;
  createdBy?: string;
  createdAt?: string;
};

type AnyScoreboard = {
  events?: AnyEvent[];
  [key: string]: unknown;
};

type AnyWindow = typeof window & Record<string, unknown>;

const DELETE_TTL_MS = 3 * 60 * 1000;
const deletedIds = new Map<string, number>();
const pendingAdds = new Map<string, AnyEvent>();

function now() {
  return Date.now();
}

function prune() {
  const time = now();
  deletedIds.forEach((expiresAt, id) => {
    if (expiresAt <= time) deletedIds.delete(id);
  });
}

function eventKey(event: AnyEvent) {
  return [event.studentId || "", event.week || "", event.title || "", event.points || 0, event.type || "", event.category || "", event.note || ""].join("|");
}

function patchEvents(events: AnyEvent[]) {
  prune();
  const result = events.filter((event) => !event.id || !deletedIds.has(event.id));
  const keys = new Set(result.map(eventKey));
  pendingAdds.forEach((event) => {
    if (!event.id || deletedIds.has(event.id)) return;
    const key = eventKey(event);
    if (keys.has(key)) return;
    result.unshift(event);
    keys.add(key);
  });
  return result;
}

function patchScoreboard(scoreboard: AnyScoreboard | null | undefined) {
  if (!scoreboard || !Array.isArray(scoreboard.events)) return scoreboard;
  return { ...scoreboard, events: patchEvents(scoreboard.events) };
}

function writeCache(scoreboard: AnyScoreboard | null | undefined) {
  if (!scoreboard) return;
  const win = window as AnyWindow;
  const patched = patchScoreboard(scoreboard);
  win.__A3K64_SCOREBOARD_CACHE = patched;
  win.__A3K64_SCOREBOARD_CACHE_AT = now();
  window.dispatchEvent(new CustomEvent("a3k64-scoreboard-cache-updated", { detail: { payload: patched } }));
}

function patchExistingCache() {
  const win = window as AnyWindow;
  const current = win.__A3K64_SCOREBOARD_CACHE as AnyScoreboard | null | undefined;
  if (!current?.events) return;
  writeCache(current);
}

function applyOutgoingPayload(payload: unknown) {
  const data = payload as { additions?: AnyEvent[]; deletions?: string[] } | null;
  if (!data) return;

  if (Array.isArray(data.deletions)) {
    data.deletions.forEach((id) => {
      const text = String(id || "").trim();
      if (text) deletedIds.set(text, now() + DELETE_TTL_MS);
    });
  }

  if (Array.isArray(data.additions)) {
    data.additions.forEach((event, index) => {
      const id = String(event.id || `pending-${now()}-${index}`);
      pendingAdds.set(id, { ...event, id });
    });
  }

  patchExistingCache();
}

function applyIncomingResponse(json: unknown) {
  const response = json as { data?: { scoreboard?: AnyScoreboard; events?: AnyEvent[] }; scoreboard?: AnyScoreboard; events?: AnyEvent[] } | null;
  const data = response?.data || response;
  const scoreboard = data?.scoreboard;
  if (scoreboard?.events) {
    const remoteKeys = new Set(scoreboard.events.map(eventKey));
    pendingAdds.forEach((event, id) => {
      if (remoteKeys.has(eventKey(event))) pendingAdds.delete(id);
    });
    writeCache(scoreboard);
    return;
  }

  if (Array.isArray(data?.events)) {
    writeCache({ ...((window as AnyWindow).__A3K64_SCOREBOARD_CACHE as AnyScoreboard | undefined), events: data.events });
  }
}

function parseSaveScorePayload(script: HTMLScriptElement) {
  try {
    const src = script.src || "";
    if (!src || !src.includes("action=saveScoreChanges")) return null;
    const url = new URL(src);
    const payloadText = url.searchParams.get("payload");
    const callbackName = url.searchParams.get("callback") || "";
    return {
      payload: payloadText ? JSON.parse(payloadText) : null,
      callbackName,
    };
  } catch {
    return null;
  }
}

function wrapCallback(callbackName: string) {
  if (!callbackName) return;
  const win = window as AnyWindow;
  const original = win[callbackName];
  if (typeof original !== "function") return;
  win[callbackName] = function wrappedScoreSaveCallback(json: unknown) {
    applyIncomingResponse(json);
    return (original as (json: unknown) => unknown)(json);
  };
}

const originalAppendChild = Element.prototype.appendChild;
Element.prototype.appendChild = function patchedAppendChild<T extends Node>(this: Element, child: T): T {
  if (child instanceof HTMLScriptElement) {
    const parsed = parseSaveScorePayload(child);
    if (parsed) {
      applyOutgoingPayload(parsed.payload);
      wrapCallback(parsed.callbackName);
      window.setTimeout(() => wrapCallback(parsed.callbackName), 0);
    }
  }
  return originalAppendChild.call(this, child) as T;
};

window.setInterval(patchExistingCache, 800);

export {};
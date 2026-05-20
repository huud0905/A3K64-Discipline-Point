type JsonRecord = Record<string, unknown>;

const GAS_URL = import.meta.env.VITE_GAS_WEB_APP_URL?.trim();
const JSONP_TIMEOUT_MS = 20000;
const PATCH_FLAG = "__A3K64_GAS_FETCH_COMPAT_INSTALLED__";

declare global {
  interface Window {
    [PATCH_FLAG]?: boolean;
  }
}

function rawUrl(input: RequestInfo | URL) {
  return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
}

function isGasRequest(input: RequestInfo | URL) {
  const raw = rawUrl(input);
  if (!raw) return false;
  if (GAS_URL && raw.startsWith(GAS_URL)) return true;
  return /^https:\/\/script\.google\.com\/macros\/s\//.test(raw);
}

function parseBody(body: BodyInit | null | undefined): JsonRecord {
  if (!body || typeof body !== "string") return {};
  try {
    const parsed = JSON.parse(body) as JsonRecord;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getActionAndPayload(input: RequestInfo | URL, init?: RequestInit): { action: string; payload?: unknown } {
  const url = new URL(rawUrl(input));
  const body = parseBody(init?.body || null);
  const action = String(url.searchParams.get("action") || body.action || "getScoreboard");
  const payloadFromQuery = url.searchParams.get("payload");
  let payload: unknown = body.payload;

  if (payload === undefined && payloadFromQuery) {
    try {
      payload = JSON.parse(payloadFromQuery);
    } catch {
      payload = payloadFromQuery;
    }
  }

  return { action, payload };
}

function jsonp(action: string, payload?: unknown): Promise<JsonRecord> {
  if (!GAS_URL || typeof document === "undefined") {
    return Promise.reject(new Error("Chưa cấu hình VITE_GAS_WEB_APP_URL."));
  }

  return new Promise((resolve, reject) => {
    const callbackName = `__a3k64GasCompat_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const url = new URL(GAS_URL);
    let timeoutId = 0;
    let done = false;

    const cleanup = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timeoutId);
      delete (window as typeof window & Record<string, unknown>)[callbackName];
      script.remove();
    };

    url.searchParams.set("action", action);
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("t", String(Date.now()));
    if (payload !== undefined) url.searchParams.set("payload", JSON.stringify(payload));

    (window as typeof window & Record<string, unknown>)[callbackName] = (data: JsonRecord) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Google Apps Script chưa trả JSONP. Hãy dùng api.gs mới và deploy Web App quyền Anyone."));
    };

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Google Apps Script phản hồi quá lâu. Kiểm tra deploy Web App hoặc api.gs."));
    }, JSONP_TIMEOUT_MS);

    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function responseFrom(data: JsonRecord, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json;charset=utf-8" },
  });
}

function installGasFetchCompat() {
  if (typeof window === "undefined" || window[PATCH_FLAG]) return;
  window[PATCH_FLAG] = true;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isGasRequest(input)) return nativeFetch(input, init);

    try {
      const { action, payload } = getActionAndPayload(input, init);
      const data = await jsonp(action, payload);
      return responseFrom(data);
    } catch (error) {
      return responseFrom(
        {
          ok: false,
          error: error instanceof Error ? error.message : "Không kết nối được Google Apps Script.",
        },
        502
      );
    }
  };
}

installGasFetchCompat();

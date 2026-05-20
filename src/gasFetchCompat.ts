type JsonRecord = Record<string, unknown>;

const GAS_URL = import.meta.env.VITE_GAS_WEB_APP_URL?.trim();
const TIMEOUT_MS = 20000;
const PATCH_FLAG = "__A3K64_GAS_FETCH_COMPAT_INSTALLED__";
const FRAME_MESSAGE_FLAG = "__A3K64_GAS_FRAME__";

function rawUrl(input: RequestInfo | URL) {
  return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
}

function isGasUrl(value: string) {
  if (!value) return false;
  if (GAS_URL && value.startsWith(GAS_URL)) return true;
  return /^https:\/\/script\.google\.com\/macros\/s\//.test(value);
}

function isGasRequest(input: RequestInfo | URL) {
  return isGasUrl(rawUrl(input));
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

function actionAndPayloadFromRequest(input: RequestInfo | URL, init?: RequestInit) {
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

function responseFrom(data: JsonRecord, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json;charset=utf-8" },
  });
}

function frameRequest(action: string, payload?: unknown): Promise<JsonRecord> {
  if (!GAS_URL || typeof document === "undefined") {
    return Promise.reject(new Error("Chưa cấu hình VITE_GAS_WEB_APP_URL."));
  }

  return new Promise((resolve, reject) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const iframe = document.createElement("iframe");
    const url = new URL(GAS_URL);
    let timer = 0;
    let done = false;

    const cleanup = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      iframe.remove();
    };

    const onMessage = (event: MessageEvent) => {
      const data = event.data as JsonRecord | undefined;
      if (!data || data[FRAME_MESSAGE_FLAG] !== true || data.requestId !== requestId) return;
      cleanup();
      const response = (data.response || data.data || {}) as JsonRecord;
      if (response.ok === false) reject(new Error(String(response.error || "Google Apps Script trả về lỗi.")));
      else resolve(response);
    };

    window.addEventListener("message", onMessage);

    url.searchParams.set("action", action);
    url.searchParams.set("callback", `__frame__${requestId}`);
    url.searchParams.set("t", String(Date.now()));
    if (payload !== undefined) url.searchParams.set("payload", JSON.stringify(payload));

    iframe.style.cssText = "position:fixed;width:1px;height:1px;left:-9999px;top:-9999px;border:0;opacity:0;pointer-events:none;";
    iframe.src = url.toString();
    document.body.appendChild(iframe);

    timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Google Apps Script không phản hồi qua iframe. Hãy cập nhật FrameTransportPatch.gs và deploy lại."));
    }, TIMEOUT_MS);
  });
}

function installFetchPatch() {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isGasRequest(input)) return nativeFetch(input, init);

    try {
      const { action, payload } = actionAndPayloadFromRequest(input, init);
      const data = await frameRequest(action, payload);
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

function installScriptSrcPatch() {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, "src");
  if (!descriptor?.set || !descriptor?.get) return;

  const nativeSet = descriptor.set;
  const nativeGet = descriptor.get;

  Object.defineProperty(HTMLScriptElement.prototype, "src", {
    configurable: true,
    enumerable: descriptor.enumerable,
    get() {
      return nativeGet.call(this);
    },
    set(value: string) {
      if (!isGasUrl(String(value))) {
        nativeSet.call(this, value);
        return;
      }

      const url = new URL(String(value));
      const callbackName = url.searchParams.get("callback") || "";
      if (!callbackName) {
        nativeSet.call(this, value);
        return;
      }

      const action = url.searchParams.get("action") || "getScoreboard";
      const payloadText = url.searchParams.get("payload");
      let payload: unknown = undefined;
      if (payloadText) {
        try {
          payload = JSON.parse(payloadText);
        } catch {
          payload = payloadText;
        }
      }

      frameRequest(action, payload)
        .then((data) => {
          const callback = (window as typeof window & Record<string, unknown>)[callbackName];
          if (typeof callback === "function") callback(data);
          this.dispatchEvent(new Event("load"));
        })
        .catch(() => {
          this.dispatchEvent(new Event("error"));
        });
    },
  });
}

function installGasFetchCompat() {
  const w = window as typeof window & Record<string, unknown>;
  if (typeof window === "undefined" || w[PATCH_FLAG]) return;
  w[PATCH_FLAG] = true;
  installFetchPatch();
  installScriptSrcPatch();
}

installGasFetchCompat();

export {};

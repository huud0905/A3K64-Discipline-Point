import { requestJsonp } from './core/network';

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

async function jsonp(action: string, payload?: unknown): Promise<JsonRecord> {
  if (!GAS_URL || typeof document === "undefined") {
    throw new Error("Chưa cấu hình VITE_GAS_WEB_APP_URL.");
  }

  const data = await requestJsonp<JsonRecord>(
    GAS_URL,
    { action, payload },
    { timeoutMs: JSONP_TIMEOUT_MS, callbackPrefix: "__a3k64GasCompat" }
  );

  if (!data) {
    throw new Error("Google Apps Script chưa trả JSONP. Hãy dùng api.gs mới và deploy Web App quyền Anyone.");
  }

  return data;
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

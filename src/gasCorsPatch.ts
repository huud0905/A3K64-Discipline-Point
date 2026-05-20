const GAS_HOST_RE = /^https:\/\/script\.google\.com\/macros\/s\//;
const nativeFetch = window.fetch.bind(window);
let jsonpSeq = 0;

type GasBody = {
  action?: string;
  payload?: unknown;
};

function parseBody(body: BodyInit | null | undefined): GasBody | null {
  if (typeof body !== "string") return null;
  try {
    return JSON.parse(body) as GasBody;
  } catch {
    return null;
  }
}

function jsonp(url: string, action: string, payload: unknown): Promise<Response> {
  return new Promise((resolve, reject) => {
    const callback = `__a3k64GasJsonp_${Date.now()}_${jsonpSeq++}`;
    const target = new URL(url);
    target.searchParams.set("action", action);
    target.searchParams.set("payload", JSON.stringify(payload ?? {}));
    target.searchParams.set("callback", callback);
    target.searchParams.set("t", String(Date.now()));

    const script = document.createElement("script");
    let done = false;
    const cleanup = () => {
      delete (window as any)[callback];
      script.remove();
    };

    const timeout = window.setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new TypeError("GAS JSONP timeout"));
    }, 20000);

    (window as any)[callback] = (data: unknown) => {
      if (done) return;
      done = true;
      window.clearTimeout(timeout);
      cleanup();
      resolve(
        new Response(JSON.stringify(data ?? null), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    };

    script.onerror = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timeout);
      cleanup();
      reject(new TypeError("GAS JSONP failed"));
    };

    script.src = target.toString();
    document.head.appendChild(script);
  });
}

window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const method = String(init?.method || "GET").toUpperCase();
  const body = parseBody(init?.body);

  if (url && GAS_HOST_RE.test(url) && method === "POST" && body?.action) {
    return jsonp(url, body.action, body.payload);
  }

  return nativeFetch(input as RequestInfo, init);
}) as typeof window.fetch;

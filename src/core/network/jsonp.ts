export type JsonpOptions = {
  timeoutMs?: number;
  callbackParam?: string;
  callbackPrefix?: string;
  payloadParam?: string;
  timestampParam?: string;
};

export function requestJsonp<T = unknown>(baseUrl: string | undefined | null, params: Record<string, unknown> = {}, options: JsonpOptions = {}): Promise<T | null> {
  if (!baseUrl || typeof document === 'undefined') return Promise.resolve(null);
  const timeoutMs = options.timeoutMs ?? 12000;
  const callbackParam = options.callbackParam || 'callback';
  const payloadParam = options.payloadParam || 'payload';
  const timestampParam = options.timestampParam || 't';
  const callbackPrefix = options.callbackPrefix || '__a3k64Jsonp';

  return new Promise((resolve) => {
    const callbackName = `${callbackPrefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const url = new URL(baseUrl);
    const callbacks = window as typeof window & Record<string, unknown>;
    let settled = false;
    let timeoutId = 0;

    const finish = (value: unknown) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      delete callbacks[callbackName];
      script.onerror = null;
      script.remove();
      resolve((value ?? null) as T | null);
    };

    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined) return;
      if (key === payloadParam && typeof value !== 'string') url.searchParams.set(key, JSON.stringify(value));
      else url.searchParams.set(key, String(value));
    });
    url.searchParams.set(callbackParam, callbackName);
    url.searchParams.set(timestampParam, String(Date.now()));

    callbacks[callbackName] = (json: unknown) => finish(json);
    script.onerror = () => finish(null);
    timeoutId = window.setTimeout(() => finish(null), timeoutMs);
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

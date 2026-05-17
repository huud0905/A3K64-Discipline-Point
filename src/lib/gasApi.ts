import type { ScoreEvent, Student } from "../apps/ScoreboardApp/data/mockScoreData";

type GasResponse<T> = T & {
  ok?: boolean;
  error?: string;
};

export type GasScoreState = {
  ok?: boolean;
  students?: Student[];
  events?: ScoreEvent[];
  weeks?: number[];
};

const GAS_WEB_APP_URL = import.meta.env.VITE_GAS_WEB_APP_URL || "";

export const isGasConfigured = Boolean(GAS_WEB_APP_URL);

async function gasRun<T>(action: string, payload: Record<string, unknown> = {}) {
  if (!GAS_WEB_APP_URL) {
    throw new Error("Chưa cấu hình VITE_GAS_WEB_APP_URL");
  }

  const response = await fetch(GAS_WEB_APP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, payload }),
  });

  const data = (await response.json()) as GasResponse<T>;

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `GAS request failed: ${action}`);
  }

  return data as T;
}

export const gasApi = {
  ping() {
    return gasRun<{ ok: boolean; service: string; at: string }>("ping");
  },

  getScoreState() {
    return gasRun<GasScoreState>("getScoreState");
  },

  appendScoreEvent(event: ScoreEvent) {
    return gasRun<{ ok: boolean; event: ScoreEvent }>("appendScoreEvent", { event });
  },

  deleteScoreEvent(eventId: string) {
    return gasRun<{ ok: boolean; deleted: string }>("deleteScoreEvent", { eventId });
  },
};

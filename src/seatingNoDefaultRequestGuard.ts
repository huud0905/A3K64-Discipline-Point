const SEAT_NO_DEFAULT_ACTIONS = new Set(["getSeatingAccess", "watchSeatingChart", "saveSeatingAccess"]);
const SEAT_NO_DEFAULT_PATCH_KEY = "__a3k64SeatNoDefaultRequestGuard";

type PatchedSearchParams = URLSearchParams & Record<string, unknown>;

function bootSeatNoDefaultRequestGuard() {
  const proto = URLSearchParams.prototype as PatchedSearchParams;
  if (proto[SEAT_NO_DEFAULT_PATCH_KEY]) return;
  proto[SEAT_NO_DEFAULT_PATCH_KEY] = true;

  const originalSet = URLSearchParams.prototype.set;
  URLSearchParams.prototype.set = function setNoDefaultSeatingPayload(name: string, value: string) {
    const action = this.get("action") || "";
    const text = String(value || "");
    const isDefaultSeatingAccess =
      name === "payload" &&
      SEAT_NO_DEFAULT_ACTIONS.has(action) &&
      /"chartId"\s*:\s*"default"/.test(text);

    if (isDefaultSeatingAccess) {
      throw new Error("Blocked seating access request with virtual default chartId.");
    }

    return originalSet.call(this, name, value);
  };
}

bootSeatNoDefaultRequestGuard();

export {};

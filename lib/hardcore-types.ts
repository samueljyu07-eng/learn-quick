export type HardcoreStatus = "none" | "open" | "passed" | "failed";

// What the browser is allowed to see. The deadline is chosen on the server.
export type HardcoreSnapshot = {
  locked: boolean;
  status: HardcoreStatus;
  deadlineAt: number | null;
  serverNow: number;
  average: number | null;
  done: number;
  total: number;
  minutes: number | null;
  problemsReady: boolean;
};

export function isHardcoreSnapshot(value: unknown): value is HardcoreSnapshot {
  if (!value || typeof value !== "object") return false;
  const item = value as HardcoreSnapshot;
  return (
    typeof item.locked === "boolean" &&
    (item.status === "none" || item.status === "open" || item.status === "passed" || item.status === "failed") &&
    (item.deadlineAt === null || typeof item.deadlineAt === "number") &&
    typeof item.serverNow === "number" &&
    (item.average === null || typeof item.average === "number") &&
    typeof item.done === "number" &&
    typeof item.total === "number" &&
    (item.minutes === null || typeof item.minutes === "number") &&
    typeof item.problemsReady === "boolean"
  );
}

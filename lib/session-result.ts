export type SessionResult = {
  savedAt: string;
  average: number;
  passed: boolean;
  hardcore: "off" | "passed" | "failed";
  problems: { prompt: string; score: number; feedback: string }[];
};

const STORAGE_KEY = "learn-quick-results";

let loaded = false;
let cached: SessionResult | null = null;

export function saveSessionResult(result: SessionResult) {
  cached = result;
  loaded = true;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  } catch {
    // The results page still receives this copy for the current visit.
  }
}

export function readSessionResult(): SessionResult | null {
  if (loaded) return cached;
  loaded = true;
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    cached = isSessionResult(parsed) ? parsed : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function clearSessionResult() {
  cached = null;
  loaded = true;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Starting over still clears the session itself.
  }
}

function isSessionResult(value: unknown): value is SessionResult {
  if (!value || typeof value !== "object") return false;
  const item = value as SessionResult;
  return (
    typeof item.savedAt === "string" &&
    item.savedAt.length > 0 &&
    typeof item.average === "number" &&
    typeof item.passed === "boolean" &&
    (item.hardcore === "off" || item.hardcore === "passed" || item.hardcore === "failed") &&
    Array.isArray(item.problems) &&
    item.problems.every(
      (problem) =>
        problem &&
        typeof problem.prompt === "string" &&
        typeof problem.score === "number" &&
        typeof problem.feedback === "string",
    )
  );
}

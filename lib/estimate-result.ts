export type StudyEstimate = {
  estimated_minutes: number;
  reasoning: string;
};

const MIN_MINUTES = 5;
const MAX_MINUTES = 120;

export function parseEstimate(value: unknown): StudyEstimate | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { estimated_minutes?: unknown; reasoning?: unknown };
  const minutes = typeof raw.estimated_minutes === "number" ? raw.estimated_minutes : Number.NaN;
  if (!Number.isFinite(minutes)) return null;

  const reasoning = typeof raw.reasoning === "string" ? raw.reasoning.replace(/\s+/g, " ").trim() : "";
  if (!reasoning) return null;

  return {
    estimated_minutes: Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(minutes))),
    reasoning: reasoning.slice(0, 200),
  };
}

export function wordCount(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

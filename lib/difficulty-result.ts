import { asDifficulty, type DifficultyRating } from "@/lib/study-time";

export type DifficultyResult = {
  difficulty: DifficultyRating;
  reasoning: string;
};

export function parseDifficulty(value: unknown): DifficultyResult | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { difficulty?: unknown; reasoning?: unknown };
  const difficulty = typeof raw.difficulty === "number" ? raw.difficulty : Number.NaN;
  if (!Number.isFinite(difficulty)) return null;
  const reasoning = typeof raw.reasoning === "string" ? raw.reasoning.replace(/\s+/g, " ").trim() : "";
  if (!reasoning) return null;
  return {
    difficulty: asDifficulty(difficulty),
    reasoning: reasoning.slice(0, 200),
  };
}

import { PROBLEM_TYPES, type Problem, type ProblemSet, type ProblemType } from "@/lib/problems/types";

export function parseProblemSet(value: unknown): ProblemSet | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { coding?: unknown; problems?: unknown };
  if (!Array.isArray(record.problems)) return null;
  const problems = record.problems
    .map((item, index) => parseProblem(item, index))
    .filter((item): item is Problem => item !== null);
  if (problems.length === 0) return null;
  return {
    coding: record.coding === true,
    problems,
  };
}

function parseProblem(value: unknown, index: number): Problem | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const type = raw.type;
  if (!isProblemType(type)) return null;
  const prompt = text(raw.prompt, 1000);
  if (!prompt) return null;
  const choices = Array.isArray(raw.choices)
    ? raw.choices.map((choice) => text(choice, 300)).filter(Boolean).slice(0, 6)
    : [];
  return {
    id: `p${index + 1}`,
    type,
    prompt,
    choices,
    answer: text(raw.answer, 300),
    starterCode: text(raw.starter_code, 4000),
    language: text(raw.language, 40).toLowerCase() || "python",
    rubric: text(raw.rubric, 800),
  };
}

function isProblemType(value: unknown): value is ProblemType {
  return typeof value === "string" && PROBLEM_TYPES.includes(value as ProblemType);
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

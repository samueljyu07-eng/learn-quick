import type { ObjectiveKind } from "@/lib/types";

export type LearningOutcome = "pass_a_test" | "learn_a_skill" | "understand" | "apply_to_outcome";

export type LearningResult = {
  three_sentence_explanation: string;
  summary: string;
  main_point_citations: string[];
  needs_clarification: string | null;
};

export const OUTCOME_LABEL: Record<LearningOutcome, string> = {
  pass_a_test: "Styled for passing a test",
  learn_a_skill: "Styled for learning a skill",
  understand: "Styled for understanding the ideas",
  apply_to_outcome: "Styled for the task you are working on",
};

export function outcomeFor(kind: ObjectiveKind): LearningOutcome {
  if (kind === "test") return "pass_a_test";
  if (kind === "skill") return "learn_a_skill";
  if (kind === "apply") return "apply_to_outcome";
  return "understand";
}

export function buildContext(
  objective: { kind: ObjectiveKind; testTopic: string; testFormat: string; taskDescription: string },
  extra: string,
) {
  const lines: string[] = [];
  if (objective.kind === "test") {
    if (objective.testTopic.trim()) lines.push(`Test topic: ${objective.testTopic.trim()}`);
    if (objective.testFormat.trim()) lines.push(`Test format: ${objective.testFormat.trim()}`);
  }
  if (objective.kind === "apply" && objective.taskDescription.trim()) {
    lines.push(objective.taskDescription.trim());
  }
  if (extra.trim()) lines.push(extra.trim());
  return lines.join("\n\n");
}

export function addContextAnswer(previous: string, answer: string) {
  const next = answer.trim();
  if (!next) return previous.trim();
  const joined = previous.trim() ? `${previous.trim()}\n\n${next}` : next;
  if (joined.length <= 2_000) return joined;
  return joined.slice(joined.length - 2_000);
}

export function parseLearningResult(value: unknown): LearningResult | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const explanation =
    typeof record.three_sentence_explanation === "string" ? record.three_sentence_explanation.trim() : "";
  const summary = typeof record.summary === "string" ? record.summary.trim() : "";
  if (!explanation || !summary) return null;

  const citations = Array.isArray(record.main_point_citations)
    ? record.main_point_citations
        .map((item) => (typeof item === "string" ? item.trim().replace(/^\[|\]$/g, "") : ""))
        .filter((item) => /^P\d+$/.test(item))
        .slice(0, 12)
    : [];

  let needs: string | null = null;
  if (typeof record.needs_clarification === "string" && record.needs_clarification.trim()) {
    needs = record.needs_clarification.trim().slice(0, 400);
  }

  return {
    three_sentence_explanation: explanation.slice(0, 2_000),
    summary: summary.slice(0, 12_000),
    main_point_citations: citations,
    needs_clarification: needs,
  };
}

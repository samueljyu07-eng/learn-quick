import type { ObjectiveKind } from "@/lib/types";

export const OBJECTIVES: {
  id: ObjectiveKind;
  title: string;
  description: string;
}[] = [
  {
    id: "test",
    title: "Pass a test",
    description: "Focus on facts, formulas, and distinctions a test is likely to ask.",
  },
  {
    id: "skill",
    title: "Learn a skill",
    description: "Turn the material into actions you can practice.",
  },
  {
    id: "understand",
    title: "Get knowledge and understand",
    description: "Explain the ideas, how they connect, and a few examples.",
  },
  {
    id: "apply",
    title: "Connect principles and context to what I'm doing now",
    description: "Use the material on a task you have now, and finish with a written answer.",
  },
];

export function objectiveTitle(kind: ObjectiveKind): string {
  return OBJECTIVES.find((item) => item.id === kind)?.title ?? kind;
}

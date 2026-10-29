export const PROBLEM_TYPES = [
  "multiple_choice",
  "short_answer",
  "code",
  "describe",
  "explain_back",
  "deliverable",
] as const;

export type ProblemType = (typeof PROBLEM_TYPES)[number];

export type Problem = {
  id: string;
  type: ProblemType;
  prompt: string;
  choices: string[];
  answer: string;
  starterCode: string;
  language: string;
  rubric: string;
};

export type ProblemSet = {
  problems: Problem[];
  coding: boolean;
};

export type ProblemGrade = {
  score: number;
  feedback: string;
};

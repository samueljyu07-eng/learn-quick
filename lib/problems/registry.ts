import type { LearningOutcome } from "@/lib/learning-result";
import type { Problem, ProblemSet } from "@/lib/problems/types";
import { practiceShape, type PracticeShape, type SampleTest } from "@/lib/sample-test";

export type ProblemModule = {
  outcome: LearningOutcome;
  title: string;
  instructions: string;
  accept: (set: ProblemSet) => boolean;
};

// Add a new outcome by adding one entry here. The practice page and the
// generator both read this list.
export const PROBLEM_MODULES: Record<LearningOutcome, ProblemModule> = {
  pass_a_test: {
    outcome: "pass_a_test",
    title: "Practice test",
    instructions: [
      "Write an exam-style practice set from the summary.",
      "Include 5 to 10 multiple_choice questions and exactly 2 short_answer questions. No other types.",
      "Each multiple_choice question has exactly 4 choices. answer is the full text of the correct choice, copied from choices.",
      "If CONTEXT gives a test format or topic, follow it.",
      "Skip trivia that is not in the summary.",
    ].join("\n"),
    accept: (set) => {
      const multiple = set.problems.filter(isReadyMultipleChoice);
      const written = set.problems.filter((problem) => problem.type === "short_answer" && problem.prompt);
      return (
        multiple.length >= 5 &&
        multiple.length <= 10 &&
        written.length === 2 &&
        multiple.length + written.length === set.problems.length
      );
    },
  },
  learn_a_skill: {
    outcome: "learn_a_skill",
    title: "Practice exercises",
    instructions: [
      "Write 2 or 3 exercises the learner can try right away. No other count.",
      "If the skill is writing or changing code, set coding to true. Every problem type is code.",
      "For code, language is the language in the summary, or python when the summary does not name one.",
      "starter_code is a short starting point, not the finished answer. rubric says what the finished code must do.",
      "If the skill is not code, set coding to false. Every problem type is describe.",
      "A describe prompt tells the learner to do the action, then write what they did.",
    ].join("\n"),
    accept: (set) => {
      if (set.problems.length < 2 || set.problems.length > 3) return false;
      if (set.coding) return set.problems.every((problem) => problem.type === "code" && problem.prompt && problem.rubric);
      return set.problems.every((problem) => problem.type === "describe" && problem.prompt);
    },
  },
  understand: {
    outcome: "understand",
    title: "Explain it back",
    instructions: [
      "Write exactly 3 explain_back prompts. No other types.",
      "Each prompt asks the learner to explain one idea in their own words.",
      "Start with the foundation and end with how the ideas connect.",
      "rubric lists the points a complete explanation must include.",
    ].join("\n"),
    accept: (set) =>
      set.problems.length === 3 &&
      set.problems.every((problem) => problem.type === "explain_back" && problem.prompt && problem.rubric),
  },
  apply_to_outcome: {
    outcome: "apply_to_outcome",
    title: "Draft for your task",
    instructions: [
      "Write exactly 1 deliverable problem. No other types.",
      "The prompt asks the learner to draft the real written result described in CONTEXT.",
      "rubric has 3 to 5 checks based on that task. Do not invent a different task.",
    ].join("\n"),
    accept: (set) =>
      set.problems.length === 1 && set.problems[0]?.type === "deliverable" && Boolean(set.problems[0].prompt && set.problems[0].rubric),
  },
};

export function problemModule(outcome: LearningOutcome) {
  return PROBLEM_MODULES[outcome];
}

export function problemInstructions(outcome: LearningOutcome, sample: SampleTest | null, testFormat: string) {
  if (outcome !== "pass_a_test") return PROBLEM_MODULES[outcome].instructions;
  const shape = practiceShape(sample);
  if (!shape) return PROBLEM_MODULES.pass_a_test.instructions;
  return sampledTestInstructions(shape, testFormat);
}

export function showableTestSet(set: ProblemSet) {
  return (
    set.problems.length > 0 &&
    set.problems.every((problem) => {
      if (problem.type === "short_answer") return Boolean(problem.prompt);
      if (problem.type !== "multiple_choice") return false;
      return problem.choices.length >= 2 && problem.choices.includes(problem.answer);
    })
  );
}

export function acceptProblems(outcome: LearningOutcome, set: ProblemSet, sample: SampleTest | null) {
  if (outcome !== "pass_a_test") return PROBLEM_MODULES[outcome].accept(set);
  const shape = practiceShape(sample);
  if (!shape) return PROBLEM_MODULES.pass_a_test.accept(set);
  return acceptSampledTest(set, shape);
}

function sampledTestInstructions(shape: PracticeShape, testFormat: string) {
  const counts = [
    shape.multipleChoice > 0 ? `exactly ${shape.multipleChoice} multiple_choice` : "",
    shape.shortAnswer > 0 ? `exactly ${shape.shortAnswer} short_answer` : "",
  ].filter(Boolean);
  const structure = testFormat.trim();
  const wording = structure
    ? `Write each question in this structure: ${structure}\nThat structure describes wording only. It does not change the question counts above.`
    : shape.wordingNote.trim()
      ? `Write each question with this wording: ${shape.wordingNote.trim()}`
      : "Write clear exam questions.";
  return [
    "Write an exam-style practice set from the summary.",
    `Include ${counts.join(" and ")} questions. No other types.`,
    "Each multiple_choice question has exactly 4 choices, unless the structure says true/false. True/false uses the choices True and False.",
    "answer is the full text of the correct choice, copied from choices.",
    `Match this difficulty: ${shape.difficultyNote.trim() || "Match a typical classroom test on this material."}`,
    wording,
    "Do not copy questions from a sample test. Write new questions from the summary.",
    "Skip trivia that is not in the summary.",
  ].join("\n");
}

function acceptSampledTest(set: ProblemSet, shape: PracticeShape) {
  const multiple = set.problems.filter(isSampleMultipleChoice);
  const written = set.problems.filter((problem) => problem.type === "short_answer" && problem.prompt);
  return (
    multiple.length === shape.multipleChoice &&
    written.length === shape.shortAnswer &&
    multiple.length + written.length === set.problems.length
  );
}

function isSampleMultipleChoice(problem: Problem) {
  const count = problem.choices.length;
  return (
    problem.type === "multiple_choice" &&
    (count === 2 || count === 4) &&
    problem.choices.includes(problem.answer)
  );
}

function isReadyMultipleChoice(problem: Problem) {
  return (
    problem.type === "multiple_choice" &&
    problem.choices.length === 4 &&
    problem.choices.includes(problem.answer)
  );
}

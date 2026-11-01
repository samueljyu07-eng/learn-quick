import { STUDY } from "@/config/study";
import { MAX_SAMPLE_QUESTIONS, MIN_SLIDER_QUESTIONS } from "@/lib/sample-test";

export type DifficultyRating = 1 | 2 | 3 | 4 | 5;

export const MAX_STUDY_MINUTES = STUDY.maxMinutes * (MAX_SAMPLE_QUESTIONS / MIN_SLIDER_QUESTIONS);

export type StudyTimeParts = {
  summaryWords: number;
  unfamiliarCount: number;
  difficulty: DifficultyRating;
  readingMinutes: number;
  termMinutes: number;
  difficultyBonus: number;
  rawMinutes: number;
  baseMinutes: number;
  practiceCount: number;
  minutes: number;
  clamped: boolean;
};

export function calculateStudyTime(input: {
  summaryWords: number;
  unfamiliarCount: number;
  difficulty: DifficultyRating;
  practiceCount?: number;
}): StudyTimeParts {
  const readingMinutes =
    (Math.max(0, input.summaryWords) / STUDY.readingWordsPerMinute) * STUDY.readingPasses;
  const termMinutes = Math.max(0, input.unfamiliarCount) * STUDY.minutesPerUnfamiliarTerm;
  const difficultyBonus = STUDY.difficultyBonusMinutes[input.difficulty] ?? 0;
  const rawMinutes = readingMinutes + termMinutes + difficultyBonus;
  const rounded = Math.round(rawMinutes);
  const baseMinutes = Math.min(STUDY.maxMinutes, Math.max(STUDY.minMinutes, rounded));
  const practiceCount =
    typeof input.practiceCount === "number" && input.practiceCount >= MIN_SLIDER_QUESTIONS
      ? Math.round(input.practiceCount)
      : 0;
  const minutes =
    practiceCount >= MIN_SLIDER_QUESTIONS
      ? Math.max(STUDY.minMinutes, Math.round(baseMinutes * (practiceCount / MIN_SLIDER_QUESTIONS)))
      : baseMinutes;

  return {
    summaryWords: Math.max(0, input.summaryWords),
    unfamiliarCount: Math.max(0, input.unfamiliarCount),
    difficulty: input.difficulty,
    readingMinutes,
    termMinutes,
    difficultyBonus,
    rawMinutes,
    baseMinutes,
    practiceCount,
    minutes,
    clamped: baseMinutes !== rounded,
  };
}

export function explainStudyTime(parts: StudyTimeParts, reason: string) {
  const lines = [
    `Reading and processing: ${parts.readingMinutes.toFixed(1)} min (${parts.summaryWords} words, read twice).`,
    `New terms: ${parts.termMinutes.toFixed(1)} min (${parts.unfamiliarCount} unfamiliar).`,
    `Difficulty: +${parts.difficultyBonus} min (rated ${parts.difficulty} of 5). ${reason}`,
  ];
  if (parts.practiceCount > MIN_SLIDER_QUESTIONS) {
    const factor = parts.practiceCount / MIN_SLIDER_QUESTIONS;
    const factorLabel = Number.isInteger(factor) ? String(factor) : factor.toFixed(1);
    lines.push(
      parts.clamped
        ? `Study time before practice length: ${parts.baseMinutes} min, held between ${STUDY.minMinutes} and ${STUDY.maxMinutes}.`
        : `Study time before practice length: ${parts.baseMinutes} min.`,
    );
    lines.push(`Practice length: ${parts.practiceCount} questions, so that time is multiplied by ${factorLabel}.`);
    lines.push(`Total: ${parts.minutes} min.`);
  } else {
    lines.push(
      parts.clamped
        ? `Total set to ${parts.minutes} min so it stays between ${STUDY.minMinutes} and ${STUDY.maxMinutes}.`
        : `Total: ${parts.minutes} min.`,
    );
  }
  return lines.join("\n");
}

export function asDifficulty(value: number): DifficultyRating {
  const rounded = Math.round(value);
  if (rounded <= 1) return 1;
  if (rounded >= 5) return 5;
  return rounded as DifficultyRating;
}

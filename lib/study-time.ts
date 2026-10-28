import { STUDY } from "@/config/study";

export type DifficultyRating = 1 | 2 | 3 | 4 | 5;

export type StudyTimeParts = {
  summaryWords: number;
  unfamiliarCount: number;
  difficulty: DifficultyRating;
  readingMinutes: number;
  termMinutes: number;
  difficultyBonus: number;
  rawMinutes: number;
  minutes: number;
  clamped: boolean;
};

export function calculateStudyTime(input: {
  summaryWords: number;
  unfamiliarCount: number;
  difficulty: DifficultyRating;
}): StudyTimeParts {
  const readingMinutes =
    (Math.max(0, input.summaryWords) / STUDY.readingWordsPerMinute) * STUDY.readingPasses;
  const termMinutes = Math.max(0, input.unfamiliarCount) * STUDY.minutesPerUnfamiliarTerm;
  const difficultyBonus = STUDY.difficultyBonusMinutes[input.difficulty] ?? 0;
  const rawMinutes = readingMinutes + termMinutes + difficultyBonus;
  const rounded = Math.round(rawMinutes);
  const minutes = Math.min(STUDY.maxMinutes, Math.max(STUDY.minMinutes, rounded));

  return {
    summaryWords: Math.max(0, input.summaryWords),
    unfamiliarCount: Math.max(0, input.unfamiliarCount),
    difficulty: input.difficulty,
    readingMinutes,
    termMinutes,
    difficultyBonus,
    rawMinutes,
    minutes,
    clamped: minutes !== rounded,
  };
}

export function explainStudyTime(parts: StudyTimeParts, reason: string) {
  const lines = [
    `Reading and processing: ${parts.readingMinutes.toFixed(1)} min (${parts.summaryWords} words, read twice).`,
    `New terms: ${parts.termMinutes.toFixed(1)} min (${parts.unfamiliarCount} unfamiliar).`,
    `Difficulty: +${parts.difficultyBonus} min (rated ${parts.difficulty} of 5). ${reason}`,
  ];
  lines.push(
    parts.clamped
      ? `Total set to ${parts.minutes} min so it stays between ${STUDY.minMinutes} and ${STUDY.maxMinutes}.`
      : `Total: ${parts.minutes} min.`,
  );
  return lines.join("\n");
}

export function asDifficulty(value: number): DifficultyRating {
  const rounded = Math.round(value);
  if (rounded <= 1) return 1;
  if (rounded >= 5) return 5;
  return rounded as DifficultyRating;
}

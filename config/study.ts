// Tune the study timer and practice scores here.
// A later phase will add the points numbers to this same file.

export const STUDY = {
  readingWordsPerMinute: 200,
  readingPasses: 2,
  minutesPerUnfamiliarTerm: 1.5,
  // Index 1 through 5. Rating 1 adds nothing. Rating 5 adds 15 minutes.
  difficultyBonusMinutes: [0, 0, 3, 6, 10, 15],
  minMinutes: 5,
  maxMinutes: 120,
  passingScore: 70,
  // A rewritten upload at or above this overlap is treated as the same material.
  nearDuplicateSimilarity: 0.9,
} as const;

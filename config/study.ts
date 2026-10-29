// Tune the study timer, practice scores, and points here.

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
  // A passing session earns basePoints. Unfamiliar material can raise that as high as
  // basePoints * (1 + unfamiliarBonus). A later pass of the same material is multiplied
  // by repeatFactor. The calendar day cannot go past dailyPointCap.
  basePoints: 10,
  unfamiliarBonus: 1,
  repeatFactor: 0.5,
  dailyPointCap: 100,
} as const;

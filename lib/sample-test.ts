// A sample test is a pattern for practice questions. The text of the exam is not stored.

export const MIN_SLIDER_QUESTIONS = 10;
export const MAX_SAMPLE_QUESTIONS = 200;
const MAX_DETECTED_QUESTIONS = 5_000;
const MAX_NOTE_CHARS = 500;
const MAX_FILE_NAMES = 5;

export type SampleTest = {
  fileNames: string[];
  truncated: boolean;
  detectedCount: number;
  questionCount: number;
  multipleChoice: number;
  shortAnswer: number;
  difficultyNote: string;
  wordingNote: string;
  practiceCount: number;
};

export type PracticeShape = {
  total: number;
  multipleChoice: number;
  shortAnswer: number;
  difficultyNote: string;
  wordingNote: string;
};

export function isSampleTest(value: unknown): value is SampleTest {
  if (!value || typeof value !== "object") return false;
  const item = value as SampleTest;
  return (
    Array.isArray(item.fileNames) &&
    item.fileNames.length <= MAX_FILE_NAMES &&
    item.fileNames.every((name) => typeof name === "string" && name.length > 0 && name.length <= 80) &&
    typeof item.truncated === "boolean" &&
    isWhole(item.detectedCount, 0, MAX_DETECTED_QUESTIONS) &&
    isWhole(item.questionCount, 0, MAX_SAMPLE_QUESTIONS) &&
    isWhole(item.multipleChoice, 0, MAX_DETECTED_QUESTIONS) &&
    isWhole(item.shortAnswer, 0, MAX_DETECTED_QUESTIONS) &&
    item.multipleChoice + item.shortAnswer === item.detectedCount &&
    typeof item.difficultyNote === "string" &&
    item.difficultyNote.length <= MAX_NOTE_CHARS &&
    typeof item.wordingNote === "string" &&
    item.wordingNote.length <= MAX_NOTE_CHARS &&
    practiceCountFits(item.questionCount, item.practiceCount)
  );
}

export function buildSampleTest(input: {
  fileNames: string[];
  truncated: boolean;
  questionCount: unknown;
  multipleChoice: unknown;
  shortAnswer: unknown;
  difficultyNote: unknown;
  wordingNote: unknown;
}): SampleTest | null {
  const reported = whole(input.questionCount);
  const multipleChoice = whole(input.multipleChoice);
  const shortAnswer = whole(input.shortAnswer);
  if (reported == null || multipleChoice == null || shortAnswer == null) return null;

  const fromTypes = multipleChoice + shortAnswer;
  const detectedCount = Math.min(MAX_DETECTED_QUESTIONS, reported > 0 ? reported : fromTypes);
  const fitted = allocateQuestionTypes(multipleChoice, shortAnswer, detectedCount);
  const questionCount = Math.min(MAX_SAMPLE_QUESTIONS, detectedCount);
  return {
    fileNames: cleanNames(input.fileNames),
    truncated: input.truncated,
    detectedCount,
    questionCount,
    multipleChoice: fitted.multipleChoice,
    shortAnswer: fitted.shortAnswer,
    difficultyNote: note(input.difficultyNote),
    wordingNote: note(input.wordingNote),
    practiceCount: questionCount >= MIN_SLIDER_QUESTIONS ? questionCount : 0,
  };
}

export function applyQuestionCount(sample: SampleTest, raw: number): SampleTest | null {
  if (!Number.isFinite(raw)) return null;
  const questionCount = Math.round(raw);
  if (!isWhole(questionCount, 0, MAX_SAMPLE_QUESTIONS)) return null;
  if (questionCount === sample.questionCount) return sample;
  return {
    ...sample,
    questionCount,
    practiceCount: questionCount >= MIN_SLIDER_QUESTIONS ? questionCount : 0,
  };
}

export function setPracticeCount(sample: SampleTest, raw: number): SampleTest {
  if (sample.questionCount < MIN_SLIDER_QUESTIONS || !Number.isFinite(raw)) {
    return { ...sample, practiceCount: 0 };
  }
  const practiceCount = Math.min(sample.questionCount, Math.max(MIN_SLIDER_QUESTIONS, Math.round(raw)));
  return { ...sample, practiceCount };
}

export function allocateQuestionTypes(multipleChoice: number, shortAnswer: number, total: number) {
  const totalCount = Math.max(0, Math.round(total));
  const multiple = Math.max(0, Math.round(multipleChoice));
  const written = Math.max(0, Math.round(shortAnswer));
  if (totalCount === 0) return { multipleChoice: 0, shortAnswer: 0 };
  const detected = multiple + written;
  if (detected === 0) return { multipleChoice: totalCount, shortAnswer: 0 };

  const multipleExact = (multiple / detected) * totalCount;
  const writtenExact = (written / detected) * totalCount;
  let multipleCount = Math.floor(multipleExact);
  let writtenCount = Math.floor(writtenExact);
  let leftover = totalCount - multipleCount - writtenCount;
  const order = [
    { key: "multiple" as const, remainder: multipleExact - multipleCount, weight: multiple },
    { key: "written" as const, remainder: writtenExact - writtenCount, weight: written },
  ].sort((left, right) => right.remainder - left.remainder || right.weight - left.weight);

  for (const item of order) {
    if (leftover <= 0) break;
    if (item.key === "multiple") multipleCount += 1;
    else writtenCount += 1;
    leftover -= 1;
  }

  return { multipleChoice: multipleCount, shortAnswer: writtenCount };
}

export function practiceShape(sample: SampleTest | null | undefined): PracticeShape | null {
  if (!isSampleTest(sample)) return null;
  if (sample.questionCount < MIN_SLIDER_QUESTIONS || sample.practiceCount < MIN_SLIDER_QUESTIONS) return null;
  const allocated = allocateQuestionTypes(sample.multipleChoice, sample.shortAnswer, sample.practiceCount);
  if (allocated.multipleChoice + allocated.shortAnswer !== sample.practiceCount) return null;
  return {
    total: sample.practiceCount,
    multipleChoice: allocated.multipleChoice,
    shortAnswer: allocated.shortAnswer,
    difficultyNote: sample.difficultyNote,
    wordingNote: sample.wordingNote,
  };
}

export function scaledPracticeCount(sample: unknown): number {
  return practiceShape(isSampleTest(sample) ? sample : null)?.total ?? 0;
}

function practiceCountFits(questionCount: number, practiceCount: number) {
  if (!isWhole(practiceCount, 0, MAX_SAMPLE_QUESTIONS)) return false;
  if (questionCount < MIN_SLIDER_QUESTIONS) return practiceCount === 0;
  return practiceCount >= MIN_SLIDER_QUESTIONS && practiceCount <= questionCount;
}

function isWhole(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function whole(value: unknown) {
  const number = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.round(number));
}

function note(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_NOTE_CHARS);
}

function cleanNames(names: string[]) {
  return names
    .map((name) => name.replace(/\s+/g, " ").trim().slice(0, 80))
    .filter((name) => name.length > 0)
    .slice(0, MAX_FILE_NAMES);
}

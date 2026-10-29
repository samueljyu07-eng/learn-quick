import { isLearnSession, type LearnSession, type ObjectiveKind } from "@/lib/types";

export const MAX_SAVED_LESSONS = 30;
export const MAX_LESSON_TITLE = 120;

const KINDS: ObjectiveKind[] = ["test", "skill", "understand", "apply"];
const SOURCES = ["text", "file", "url"] as const;

export type LessonTerm = {
  term: string;
  definition: string;
  understood: boolean;
};

export type LessonProblem = {
  prompt: string;
  score: number;
  feedback: string;
};

export type LessonScore = {
  average: number;
  passed: boolean;
  hardcore: "off" | "passed" | "failed";
};

export type SavedLesson = {
  id: string;
  title: string;
  addedAt: string;
  sessionSavedAt: string;
  objective: LearnSession["objective"];
  material: LearnSession["material"];
  explanation: string;
  summary: string;
  terms: LessonTerm[];
  score: LessonScore | null;
  problems: LessonProblem[];
  workOn: string;
  revisit: string[];
};

export function parseSavedLesson(value: unknown): SavedLesson | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<SavedLesson>;
  const id = typeof item.id === "string" && /^[0-9a-f-]{36}$/i.test(item.id) ? item.id : "";
  const title = cleanLine(item.title, MAX_LESSON_TITLE);
  const addedAt = iso(item.addedAt);
  const sessionSavedAt = iso(item.sessionSavedAt);
  if (!id || !title || !addedAt || !sessionSavedAt) return null;

  const objective = parseObjective(item.objective);
  const material = parseMaterial(item.material);
  if (!objective || !material) return null;
  if (!isLearnSession({ objective, material, savedAt: sessionSavedAt })) return null;

  const score = parseScore(item.score);
  return {
    id,
    title,
    addedAt,
    sessionSavedAt,
    objective,
    material,
    explanation: cleanBlock(item.explanation, 2_000),
    summary: cleanBlock(item.summary, 12_000),
    terms: parseTerms(item.terms),
    score,
    problems: parseProblems(item.problems),
    workOn: cleanBlock(item.workOn, 600),
    revisit: parseRevisit(item.revisit),
  };
}

export function mergeLessons(local: SavedLesson[], remote: SavedLesson[]) {
  const map = new Map<string, SavedLesson>();
  for (const item of [...remote, ...local]) {
    const key = item.sessionSavedAt || item.id;
    const existing = map.get(key);
    if (!existing || item.addedAt > existing.addedAt) map.set(key, item);
  }
  return [...map.values()]
    .sort((left, right) => (left.addedAt < right.addedAt ? 1 : -1))
    .slice(0, MAX_SAVED_LESSONS);
}

function parseObjective(value: unknown): LearnSession["objective"] | null {
  if (!value || typeof value !== "object") return null;
  const item = value as LearnSession["objective"];
  if (!KINDS.includes(item.kind)) return null;
  return {
    kind: item.kind,
    testTopic: cleanLine(item.testTopic, 200),
    testFormat: cleanLine(item.testFormat, 200),
    taskDescription: cleanBlock(item.taskDescription, 2_000),
  };
}

function parseMaterial(value: unknown): LearnSession["material"] | null {
  if (!value || typeof value !== "object") return null;
  const item = value as LearnSession["material"];
  if (!SOURCES.includes(item.source)) return null;
  const text = cleanBlock(item.text, 80_000);
  if (!text) return null;
  const originalLength = typeof item.originalLength === "number" && item.originalLength > 0 ? item.originalLength : text.length;
  return {
    source: item.source,
    text,
    truncated: item.truncated === true,
    originalLength,
    title: cleanLine(item.title, 200),
    fileName: cleanLine(item.fileName, 200),
    url: cleanLine(item.url, 2_000),
  };
}

function parseScore(value: unknown): LessonScore | null {
  if (!value || typeof value !== "object") return null;
  const item = value as LessonScore;
  if (typeof item.average !== "number" || typeof item.passed !== "boolean") return null;
  if (item.hardcore !== "off" && item.hardcore !== "passed" && item.hardcore !== "failed") return null;
  return {
    average: Math.max(0, Math.min(100, Math.round(item.average))),
    passed: item.passed,
    hardcore: item.hardcore,
  };
}

function parseTerms(value: unknown): LessonTerm[] {
  if (!Array.isArray(value)) return [];
  const terms: LessonTerm[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as LessonTerm;
    const term = cleanLine(record.term, 80);
    const definition = cleanBlock(record.definition, 400);
    if (!term || !definition) continue;
    terms.push({ term, definition, understood: record.understood === true });
    if (terms.length === 12) break;
  }
  return terms;
}

function parseProblems(value: unknown): LessonProblem[] {
  if (!Array.isArray(value)) return [];
  const problems: LessonProblem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as LessonProblem;
    const prompt = cleanBlock(record.prompt, 500);
    if (!prompt || typeof record.score !== "number") continue;
    problems.push({
      prompt,
      score: Math.max(0, Math.min(100, Math.round(record.score))),
      feedback: cleanBlock(record.feedback, 400),
    });
    if (problems.length === 12) break;
  }
  return problems;
}

function parseRevisit(value: unknown) {
  if (!Array.isArray(value)) return [];
  const items: string[] = [];
  for (const item of value) {
    const line = cleanLine(item, 80);
    if (!line) continue;
    items.push(line);
    if (items.length === 6) break;
  }
  return items;
}

function iso(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : "";
}

function cleanLine(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanBlock(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, max) : "";
}

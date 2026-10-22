export type ObjectiveKind = "test" | "skill" | "understand" | "apply";

export type MaterialSource = "text" | "file" | "url";

export type ExtractedMaterial = {
  text: string;
  truncated: boolean;
  originalLength: number;
  title: string;
  fileName: string;
  url: string;
};

export type LearnSession = {
  objective: {
    kind: ObjectiveKind;
    testTopic: string;
    testFormat: string;
    taskDescription: string;
  };
  material: ExtractedMaterial & {
    source: MaterialSource;
  };
  savedAt: string;
};

const OBJECTIVE_KINDS: ObjectiveKind[] = ["test", "skill", "understand", "apply"];
const MATERIAL_SOURCES: MaterialSource[] = ["text", "file", "url"];

export function isLearnSession(value: unknown): value is LearnSession {
  if (!value || typeof value !== "object") return false;
  const session = value as LearnSession;
  return (
    OBJECTIVE_KINDS.includes(session.objective?.kind) &&
    typeof session.objective?.testTopic === "string" &&
    typeof session.objective?.testFormat === "string" &&
    typeof session.objective?.taskDescription === "string" &&
    MATERIAL_SOURCES.includes(session.material?.source) &&
    typeof session.material?.text === "string" &&
    session.material.text.trim().length > 0 &&
    typeof session.savedAt === "string"
  );
}

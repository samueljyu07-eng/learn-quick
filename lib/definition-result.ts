export type KeyTerm = {
  term: string;
  definition: string;
};

export function parseDefinitionResult(value: unknown): KeyTerm[] {
  if (!value || typeof value !== "object") return [];
  const terms = (value as { terms?: unknown }).terms;
  if (!Array.isArray(terms)) return [];

  const cleaned: KeyTerm[] = [];
  const seen = new Set<string>();
  for (const item of terms) {
    if (!item || typeof item !== "object") continue;
    const term = typeof (item as KeyTerm).term === "string" ? (item as KeyTerm).term.trim() : "";
    const definition =
      typeof (item as KeyTerm).definition === "string" ? (item as KeyTerm).definition.trim() : "";
    if (!term || !definition) continue;
    const key = term.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push({
      term: term.slice(0, 80),
      definition: definition.slice(0, 400),
    });
    if (cleaned.length === 10) break;
  }
  return cleaned;
}

export function isKeyTerm(value: unknown): value is KeyTerm {
  if (!value || typeof value !== "object") return false;
  const term = value as KeyTerm;
  return typeof term.term === "string" && term.term.trim().length > 0 && typeof term.definition === "string" && term.definition.trim().length > 0;
}

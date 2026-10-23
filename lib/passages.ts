export type Passage = {
  id: string;
  text: string;
};

// Break the source into numbered passages. Blank lines mark paragraphs.
// If the text has no blank lines, each line becomes its own passage so a
// citation can still point at a specific spot.
export function splitPassages(text: string): Passage[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  let chunks = normalized
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (chunks.length === 1 && chunks[0].includes("\n")) {
    const lines = chunks[0]
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length > 1) chunks = lines;
  }

  return chunks.map((part, index) => ({
    id: `P${index + 1}`,
    text: part,
  }));
}

export function formatMaterial(passages: Passage[]) {
  return passages.map((passage) => `[${passage.id}]\n${passage.text}`).join("\n\n");
}

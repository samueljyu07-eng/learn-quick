export type SummaryBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

export type SummarySection = {
  title: string | null;
  kind: "answer" | "practice" | "mistakes" | "plain";
  blocks: SummaryBlock[];
};

export function parseSummary(markdown: string): SummarySection[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const sections: { title: string | null; blocks: SummaryBlock[] }[] = [{ title: null, blocks: [] }];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;

  const current = () => sections[sections.length - 1];
  const flush = () => {
    if (!list) return;
    current().blocks.push(list);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const boldTitle = /^\*\*(.+?)\*\*:?$/.exec(line);
    if (heading || boldTitle) {
      flush();
      const title = (heading?.[2] || boldTitle?.[1] || "").trim();
      sections.push({ title, blocks: [] });
      continue;
    }

    const bullet = /^[-*]\s+(.+)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (bullet || numbered) {
      const type = bullet ? "ul" : "ol";
      const item = (bullet || numbered)![1];
      if (!list || list.type !== type) {
        flush();
        list = { type, items: [] };
      }
      list.items.push(item);
      continue;
    }

    if (!line) {
      flush();
      continue;
    }

    flush();
    const blocks = current().blocks;
    const last = blocks[blocks.length - 1];
    if (last && last.type === "p") last.text = `${last.text} ${line}`;
    else blocks.push({ type: "p", text: line });
  }

  flush();

  return sections
    .filter((section) => section.title || section.blocks.length > 0)
    .map((section) => ({ ...section, kind: sectionKind(section.title) }));
}

export function sectionPlainText(section: SummarySection) {
  const lines: string[] = [];
  if (section.title) lines.push(section.title);
  for (const block of section.blocks) {
    if (block.type === "p") lines.push(block.text.replace(/\*\*/g, ""));
    else lines.push(...block.items.map((item) => item.replace(/\*\*/g, "")));
  }
  return lines.join("\n\n");
}

function sectionKind(title: string | null): SummarySection["kind"] {
  const name = (title || "").toLowerCase().replace(/[:.]$/, "").trim();
  if (name.includes("written answer")) return "answer";
  if (name.startsWith("practice this")) return "practice";
  if (name.includes("common mistakes")) return "mistakes";
  return "plain";
}

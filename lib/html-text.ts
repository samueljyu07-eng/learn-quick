function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, digits: string) => codePointToChar(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => codePointToChar(parseInt(hex, 16)));
}

function codePointToChar(code: number): string {
  if (!Number.isFinite(code) || code < 1 || code > 0x10ffff) return "";
  return String.fromCodePoint(code);
}

export function extractHtmlTitle(html: string): string {
  const raw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  return decodeEntities(raw).replace(/\s+/g, " ").trim().slice(0, 180);
}

export function htmlToText(html: string): string {
  const prepared = html
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const region = removeById(removeByClassToken(pickContentRegion(prepared), "navbox"), "catlinks");

  const stripped = region
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, " ")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, " ")
    .replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer|blockquote)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ");

  return decodeEntities(stripped)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pickContentRegion(html: string): string {
  const wiki = sliceById(html, "mw-content-text");
  if (wiki && roughTextLength(wiki) >= 80) return wiki;

  const article = sliceByTag(html, "article");
  if (article && roughTextLength(article) >= 80) return article;

  const main = sliceByTag(html, "main");
  if (main && roughTextLength(main) >= 80) return main;

  return html;
}

function roughTextLength(html: string): number {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

function removeById(html: string, id: string): string {
  const slice = sliceById(html, id);
  if (!slice) return html;
  return html.replace(slice, " ");
}

function removeByClassToken(html: string, token: string): string {
  const re = new RegExp(
    `<[a-zA-Z][\\w:-]*\\b[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${token}\\b[^"']*["'][^>]*>`,
    "gi",
  );
  let result = html;
  for (let guard = 0; guard < 30; guard += 1) {
    re.lastIndex = 0;
    const match = re.exec(result);
    if (!match) return result;
    const slice = sliceElement(result, match.index);
    if (!slice) return result;
    result = `${result.slice(0, match.index)} ${result.slice(match.index + slice.length)}`;
  }
  return result;
}

function sliceById(html: string, id: string): string | null {
  const re = new RegExp(`<[a-zA-Z][\\w:-]*\\b[^>]*\\bid\\s*=\\s*["']${id}["'][^>]*>`, "i");
  const match = re.exec(html);
  if (!match) return null;
  return sliceElement(html, match.index);
}

function sliceByTag(html: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>`, "i");
  const match = re.exec(html);
  if (!match) return null;
  return sliceElement(html, match.index);
}

function sliceElement(html: string, openAt: number): string | null {
  const openMatch = /^<([a-zA-Z][\w:-]*)\b[^>]*>/.exec(html.slice(openAt));
  if (!openMatch) return null;
  const opening = openMatch[0];
  if (opening.endsWith("/>")) return opening;

  const tag = openMatch[1];
  const token = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
  token.lastIndex = openAt + opening.length;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = token.exec(html))) {
    if (match[0].startsWith("</")) depth -= 1;
    else if (!match[0].endsWith("/>")) depth += 1;
    if (depth === 0) return html.slice(openAt, match.index + match[0].length);
  }
  return null;
}

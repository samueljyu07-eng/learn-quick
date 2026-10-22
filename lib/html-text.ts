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
  const withoutHead = html.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, " ");
  const main =
    withoutHead.match(/<article\b[^>]*>[\s\S]*?<\/article>/i)?.[0] ??
    withoutHead.match(/<main\b[^>]*>[\s\S]*?<\/main>/i)?.[0] ??
    withoutHead;

  const stripped = main
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
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

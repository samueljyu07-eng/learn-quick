import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { extractText } from "unpdf";

import { extractHtmlTitle, htmlToText } from "@/lib/html-text";
import { MAX_FETCH_BYTES, MAX_UPLOAD_BYTES, limitMaterial } from "@/lib/limits";
import type { ExtractedMaterial } from "@/lib/types";

export class MaterialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaterialError";
  }
}

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.internal",
]);

export async function extractUploadedFile(file: File): Promise<ExtractedMaterial> {
  if (file.size === 0) {
    throw new MaterialError("That file is empty. Choose a file that has some text in it.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new MaterialError("That file is over 10 MB. Try a smaller file, or paste the part you need.");
  }

  const fileName = file.name || "upload";
  const lower = fileName.toLowerCase();
  const isPdf = lower.endsWith(".pdf") || file.type === "application/pdf";
  const isTxt = lower.endsWith(".txt") || file.type === "text/plain";

  if (!isPdf && !isTxt) {
    throw new MaterialError("Please upload a .pdf or .txt file.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = isPdf ? await pdfToText(bytes) : decodeText(bytes);
  return finish(text, "file", { fileName, url: "", title: "" });
}

export async function extractFromUrl(rawUrl: string): Promise<ExtractedMaterial> {
  const start = parsePublicUrl(rawUrl);
  const { response, finalUrl } = await fetchPublic(start);
  if (!response.ok) {
    throw new MaterialError("That page returned an error. Check the link, or paste the text instead.");
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const bytes = await readLimited(response, MAX_FETCH_BYTES);
  const pathLooksPdf = finalUrl.pathname.toLowerCase().endsWith(".pdf");
  const isPdf = contentType.includes("application/pdf") || pathLooksPdf;

  if (isPdf) {
    const text = await pdfToText(bytes);
    const fileName = decodeURIComponent(finalUrl.pathname.split("/").pop() || "document.pdf");
    return finish(text, "url", { fileName: "", url: finalUrl.toString(), title: fileName });
  }

  const readableType =
    contentType.includes("text/") ||
    contentType.includes("html") ||
    contentType.includes("xml") ||
    contentType.includes("json") ||
    contentType === "";

  if (!readableType) {
    throw new MaterialError("That link isn't a web page or PDF we can read. Paste the text instead.");
  }

  const raw = decodeText(bytes);
  const looksHtml = contentType.includes("html") || /<html[\s>]/i.test(raw.slice(0, 4000));
  const text = looksHtml ? htmlToText(raw) : raw.trim();
  const title = looksHtml ? extractHtmlTitle(raw) : "";
  return finish(text, "url", { fileName: "", url: finalUrl.toString(), title });
}

function finish(
  text: string,
  kind: "file" | "url",
  extra: Pick<ExtractedMaterial, "fileName" | "url" | "title">,
): ExtractedMaterial {
  const limited = limitMaterial(text);
  if (!limited.text || looksBinary(limited.text)) {
    throw new MaterialError(
      kind === "file"
        ? "We couldn't find readable text in that file. If it's a scanned PDF (a picture of pages), paste the text instead."
        : "That page didn't include readable text. Try a different link, or paste the text yourself.",
    );
  }
  return { ...extra, ...limited };
}

async function pdfToText(bytes: Uint8Array): Promise<string> {
  try {
    const { text } = await extractText(bytes, { mergePages: true });
    return text;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("password")) {
      throw new MaterialError(
        "This PDF is password-protected. Remove the password, or paste the text.",
      );
    }
    throw new MaterialError(
      "We couldn't read that PDF. It may be damaged or scanned. Try another file, or paste the text.",
    );
  }
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function looksBinary(text: string): boolean {
  const sample = text.slice(0, 2000);
  if (!sample) return true;
  let bad = 0;
  for (const char of sample) {
    const code = char.charCodeAt(0);
    if (code === 0xfffd || code < 9 || (code > 13 && code < 32)) bad += 1;
  }
  return bad / sample.length > 0.08;
}

function parsePublicUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new MaterialError(
      "That doesn't look like a web address. Try something like https://example.com/article.",
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new MaterialError("Use a link that starts with http:// or https://.");
  }
  if (url.username || url.password) {
    throw new MaterialError("Remove the username and password from the link, or paste the text.");
  }
  return url;
}

async function fetchPublic(start: URL): Promise<{ response: Response; finalUrl: URL }> {
  let current = start;
  for (let hop = 0; hop < 4; hop += 1) {
    await assertPublicHttpUrl(current);
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Accept: "text/html,application/pdf,text/plain;q=0.9,*/*;q=0.1",
          "User-Agent": "LearnQuick/0.1 (local study tool)",
        },
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new MaterialError("That link took too long to open. Try again, or paste the text.");
      }
      throw new MaterialError("We couldn't open that link. Check the address, or paste the text instead.");
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new MaterialError("That link redirected somewhere we couldn't follow. Paste the text instead.");
      }
      current = new URL(location, current);
      continue;
    }

    return { response, finalUrl: current };
  }

  throw new MaterialError("That link redirected too many times. Paste the text instead.");
}

async function assertPublicHttpUrl(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (
    !host ||
    BLOCKED_HOSTS.has(host) ||
    host.endsWith(".local") ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal")
  ) {
    throw new MaterialError(
      "That address points to a private network. Use a public https link, or paste the text.",
    );
  }

  const decimalIp = decimalHostnameToIpv4(host);
  const addresses = decimalIp ? [decimalIp] : isIP(host) ? [host] : await resolveHost(host);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new MaterialError(
      "That address points to a private network. Use a public https link, or paste the text.",
    );
  }
}

async function resolveHost(host: string): Promise<string[]> {
  try {
    const records = await lookup(host, { all: true });
    return records.map((record) => record.address);
  } catch {
    throw new MaterialError("We couldn't open that link. Check the address, or paste the text instead.");
  }
}

function decimalHostnameToIpv4(host: string): string | null {
  if (!/^\d+$/.test(host)) return null;
  const value = Number(host);
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) return null;
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
}

function isPrivateAddress(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^::ffff:/, "");
  if (isIP(normalized) === 4) {
    const [a, b] = normalized.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80")) return true;
  return false;
}

async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new MaterialError("That page is larger than we can read here. Paste the part you need.");
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new MaterialError("That page didn't include anything we could read. Paste the text instead.");
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new MaterialError("That page is larger than we can read here. Paste the part you need.");
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

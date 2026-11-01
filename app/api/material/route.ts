import { NextResponse } from "next/server";

import { inspectMaterial } from "@/lib/hardcore-store";
import { currentLearner } from "@/lib/learner";
import { MAX_UPLOAD_TOTAL_BYTES } from "@/lib/limits";
import { MaterialError, extractFromUrl, extractUploadedFiles } from "@/lib/read-material";

const BODY_SLACK_BYTES = 1024 * 1024;

export async function POST(request: Request) {
  let form: FormData;
  try {
    const limited = await bodyWithinLimit(request, MAX_UPLOAD_TOTAL_BYTES + BODY_SLACK_BYTES);
    form = await limited.formData();
  } catch (error) {
    const message =
      error instanceof MaterialError
        ? error.message
        : "We couldn't read that upload. Try a smaller file, or paste the text.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const kind = form.get("kind");

  try {
    if (kind === "file") {
      const files = form.getAll("file").filter((item): item is File => item instanceof File);
      if (files.length === 0) {
        throw new MaterialError("Choose a .pdf, .txt, .md, or .html file to upload.");
      }
      return await respondWithMaterial(await extractUploadedFiles(files));
    }

    if (kind === "url") {
      const url = form.get("url");
      if (typeof url !== "string" || !url.trim()) {
        throw new MaterialError("Paste a web address, starting with https://.");
      }
      return await respondWithMaterial(await extractFromUrl(url));
    }

    throw new MaterialError("Choose pasted text, a file, or a link.");
  } catch (error) {
    if (error instanceof MaterialError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Material read failed", error);
    return NextResponse.json(
      { error: "Something went wrong while reading that material. Please try again." },
      { status: 500 },
    );
  }
}

async function bodyWithinLimit(request: Request, maxBytes: number): Promise<Request> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new MaterialError("Those files are over 20 MB together. Remove one, or paste a shorter excerpt.");
  }
  if (!request.body) return request;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let locked = true;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        locked = false;
        throw new MaterialError("Those files are over 20 MB together. Remove one, or paste a shorter excerpt.");
      }
      chunks.push(value);
    }
  } finally {
    if (locked) reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  return new Request(request.url, { method: "POST", headers, body: bytes });
}

async function respondWithMaterial(material: { text: string }) {
  const gate = await inspectMaterial(await currentLearner(), material.text);
  if (gate.locked) {
    return NextResponse.json({ error: "This material is locked." }, { status: 403 });
  }
  return NextResponse.json(material);
}

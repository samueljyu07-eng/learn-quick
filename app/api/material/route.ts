import { NextResponse } from "next/server";

import { inspectMaterial } from "@/lib/hardcore-store";
import { learnerId } from "@/lib/learner-id";
import { MaterialError, extractFromUrl, extractUploadedFile } from "@/lib/read-material";

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "We couldn't read that upload. Try a smaller file, or paste the text." },
      { status: 400 },
    );
  }

  const kind = form.get("kind");

  try {
    if (kind === "file") {
      const file = form.get("file");
      if (!(file instanceof File)) {
        throw new MaterialError("Choose a PDF or TXT file to upload.");
      }
      return await respondWithMaterial(await extractUploadedFile(file));
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

async function respondWithMaterial(material: { text: string }) {
  const gate = await inspectMaterial(await learnerId(), material.text);
  if (gate.locked) {
    return NextResponse.json({ error: "This material is locked." }, { status: 403 });
  }
  return NextResponse.json(material);
}

import { NextResponse } from "next/server";

import { MAX_MATERIAL_CHARS } from "@/lib/limits";
import { currentLearner } from "@/lib/learner";
import { finishAttempt, inspectMaterial, listLockTitles, scoreChoice } from "@/lib/hardcore-store";

export async function GET() {
  const learner = await currentLearner();
  const titles = await listLockTitles(learner);
  return NextResponse.json({ titles });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "We couldn't read that request. Try again." }, { status: 400 });
  }

  const record = body as {
    action?: unknown;
    text?: unknown;
    problemId?: unknown;
    choice?: unknown;
  } | null;
  const action = record?.action;
  const text = typeof record?.text === "string" ? record.text.slice(0, MAX_MATERIAL_CHARS) : "";
  if (!text) {
    return NextResponse.json({ error: "Paste or upload the material first." }, { status: 400 });
  }

  const learner = await currentLearner();

  if (action === "check" || action === "status") {
    const gate = await inspectMaterial(learner, text);
    return NextResponse.json(gate);
  }

  if (action === "finish") {
    const result = await finishAttempt(learner, text);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, hardcore: result.hardcore }, { status: result.status });
    }
    return NextResponse.json({ hardcore: result.hardcore });
  }

  if (action === "answer") {
    const problemId = typeof record?.problemId === "string" ? record.problemId : "";
    const choice = typeof record?.choice === "string" ? record.choice.trim() : "";
    if (!problemId || !choice) {
      return NextResponse.json({ error: "Choose an answer first." }, { status: 400 });
    }
    const result = await scoreChoice(learner, text, problemId, choice);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, hardcore: result.hardcore }, { status: result.status });
    }
    return NextResponse.json({ score: result.score, feedback: result.feedback, hardcore: result.hardcore });
  }

  return NextResponse.json({ error: "We couldn't read that request. Try again." }, { status: 400 });
}

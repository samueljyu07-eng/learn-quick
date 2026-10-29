import { NextResponse } from "next/server";

import { rememberProblems, storedProblems } from "@/lib/hardcore-store";
import { currentLearner } from "@/lib/learner";
import { buildContext, outcomeFor } from "@/lib/learning-result";
import { MAX_MATERIAL_CHARS } from "@/lib/limits";
import { parseProblemSet } from "@/lib/problems/parse";
import { problemModule } from "@/lib/problems/registry";
import type { ProblemSet } from "@/lib/problems/types";
import type { LearnSession, ObjectiveKind } from "@/lib/types";

const MODEL = "claude-sonnet-5-5";
const KINDS: ObjectiveKind[] = ["test", "skill", "understand", "apply"];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["coding", "problems"],
  properties: {
    coding: { type: "boolean" },
    problems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "prompt", "choices", "answer", "starter_code", "language", "rubric"],
        properties: {
          type: {
            type: "string",
            enum: ["multiple_choice", "short_answer", "code", "describe", "explain_back", "deliverable"],
          },
          prompt: { type: "string" },
          choices: { type: "array", items: { type: "string" } },
          answer: { type: "string" },
          starter_code: { type: "string" },
          language: { type: "string" },
          rubric: { type: "string" },
        },
      },
    },
  },
} as const;

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Add your Anthropic API key to .env.local, save the file, and restart the app. Then try again." },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "We couldn't read that request. Save step 1 again, then try again." }, { status: 400 });
  }

  const record = body as {
    summary?: unknown;
    objective?: LearnSession["objective"];
    contextExtra?: unknown;
    hardcoreText?: unknown;
  } | null;
  const kind = record?.objective?.kind;
  const summary = typeof record?.summary === "string" ? record.summary.trim().slice(0, 12_000) : "";
  if (!kind || !KINDS.includes(kind) || !summary) {
    return NextResponse.json(
      { error: "The summary is not ready yet. Open the summary, then try the problems again." },
      { status: 400 },
    );
  }

  const objective = {
    kind,
    testTopic: text(record?.objective?.testTopic).slice(0, 200),
    testFormat: text(record?.objective?.testFormat).slice(0, 200),
    taskDescription: text(record?.objective?.taskDescription).slice(0, 2_000),
  };
  const outcome = outcomeFor(kind);
  const plan = problemModule(outcome);
  const hardcoreText = typeof record?.hardcoreText === "string" ? record.hardcoreText.slice(0, MAX_MATERIAL_CHARS) : "";
  if (hardcoreText.trim()) {
    const existing = await storedProblems(await currentLearner(), hardcoreText);
    if (existing) return NextResponse.json(existing);
  }
  const prompt = [
    "Write practice problems for Learn Quick.",
    "Use only the summary and context below. Do not add outside facts.",
    "Unused text fields must be empty strings. Unused choice lists must be empty arrays.",
    "",
    plan.instructions,
    "",
    `OUTCOME: ${outcome}`,
    "",
    "CONTEXT:",
    buildContext(objective, text(record?.contextExtra).slice(0, 2_000)) || "(none)",
    "",
    "SUMMARY:",
    summary,
  ].join("\n");

  let set: ProblemSet | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const asked = await askClaude(apiKey, prompt);
    if (!asked.ok) return NextResponse.json({ error: asked.error }, { status: asked.status });
    const parsed = parseProblemSet(asked.value);
    if (parsed && plan.accept(parsed)) {
      set = parsed;
      break;
    }
  }

  if (!set) {
    return NextResponse.json(
      { error: "Claude's practice problems didn't match this goal. Try again." },
      { status: 502 },
    );
  }

  if (!hardcoreText.trim()) return NextResponse.json(set);
  const official = await rememberProblems(await currentLearner(), hardcoreText, set);
  return NextResponse.json(official);
}

async function askClaude(apiKey: string, prompt: string) {
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4_000,
        messages: [{ role: "user", content: prompt }],
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
      }),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return { ok: false as const, status: 504, error: "Claude took too long to write the problems. Try again." };
    }
    return { ok: false as const, status: 502, error: "We couldn't reach Claude. Check your connection, then try again." };
  }

  const payload = (await response.json().catch(() => null)) as {
    content?: { type?: string; text?: string }[];
    stop_reason?: string;
  } | null;
  if (!response.ok || !payload) {
    console.error("Problem request failed", response.status);
    return { ok: false as const, status: 502, error: friendly(response.status) };
  }
  if (payload.stop_reason === "max_tokens") {
    return { ok: false as const, status: 502, error: "The problems were cut off. Try again." };
  }
  const raw = payload.content?.find((block) => block.type === "text" && typeof block.text === "string")?.text ?? "";
  try {
    return { ok: true as const, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: true as const, value: null };
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function friendly(status: number) {
  if (status === 401) return "That API key was rejected. Open .env.local, check the key, save the file, and restart the app.";
  if (status === 429 || status === 529) return "Claude is busy right now. Wait a moment, then try again.";
  return "Claude couldn't write the problems just now. Try again.";
}

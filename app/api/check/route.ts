import { NextResponse } from "next/server";

import { limitMaterial } from "@/lib/limits";
import type { ObjectiveKind } from "@/lib/types";

const MODEL = "claude-sonnet-5-5";
const KINDS: ObjectiveKind[] = ["test", "skill", "understand", "apply"];

const TITLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title"],
  properties: {
    title: { type: "string" },
  },
} as const;

const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["workOn", "revisit"],
  properties: {
    workOn: { type: "string" },
    revisit: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

type Miss = { prompt: string; score: number; feedback: string };

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
    return NextResponse.json({ error: "We couldn't read that request." }, { status: 400 });
  }

  const record = body as {
    mode?: unknown;
    material?: unknown;
    summary?: unknown;
    objective?: { kind?: unknown; testTopic?: unknown; testFormat?: unknown; taskDescription?: unknown };
    problems?: unknown;
  };
  const mode = record.mode === "title" || record.mode === "review" ? record.mode : null;
  const limited = limitMaterial(typeof record.material === "string" ? record.material : "");
  const kind = record.objective?.kind;
  if (!mode || !limited.text || typeof kind !== "string" || !KINDS.includes(kind as ObjectiveKind)) {
    return NextResponse.json({ error: "Save an objective and some material in step 1, then try again." }, { status: 400 });
  }

  const summary = typeof record.summary === "string" ? record.summary.trim().slice(0, 4_000) : "";
  const objective = {
    kind: kind as ObjectiveKind,
    testTopic: text(record.objective?.testTopic).slice(0, 200),
    testFormat: text(record.objective?.testFormat).slice(0, 200),
    taskDescription: text(record.objective?.taskDescription).slice(0, 2_000),
  };

  if (mode === "title") {
    const parsed = await ask(apiKey, titlePrompt(objective, summary, limited.text), TITLE_SCHEMA, 200);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    const title = text((parsed.value as { title?: unknown }).title)
      .replace(/^["“]+|["”]+$/g, "")
      .slice(0, 120);
    if (!title) return NextResponse.json({ error: "Claude didn't name this lesson. Try again." }, { status: 502 });
    return NextResponse.json({ title });
  }

  const missed = misses(record.problems);
  if (missed.length === 0) {
    return NextResponse.json({ error: "There are no missed problems to review." }, { status: 400 });
  }
  const parsed = await ask(apiKey, reviewPrompt(objective, summary, limited.text, missed), REVIEW_SCHEMA, 700);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const value = parsed.value as { workOn?: unknown; revisit?: unknown };
  const workOn = text(value.workOn).slice(0, 600);
  const revisit = Array.isArray(value.revisit)
    ? value.revisit
        .map((item) => text(item).slice(0, 80))
        .filter((item) => item.length > 0)
        .slice(0, 6)
    : [];
  if (!workOn) return NextResponse.json({ error: "Claude didn't say what to work on. Try again." }, { status: 502 });
  return NextResponse.json({ workOn, revisit });
}

async function ask(
  apiKey: string,
  prompt: string,
  schema: typeof TITLE_SCHEMA | typeof REVIEW_SCHEMA,
  maxTokens: number,
): Promise<{ ok: true; value: unknown } | { ok: false; status: number; error: string }> {
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
        output_config: { format: { type: "json_schema", schema } },
      }),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return { ok: false, status: 504, error: "Claude took too long to answer. Wait a moment, then try again." };
    }
    return { ok: false, status: 502, error: "We couldn't reach Claude. Check your connection, then try again." };
  }

  const payload = (await response.json().catch(() => null)) as {
    content?: { type?: string; text?: string }[];
    stop_reason?: string;
  } | null;
  if (!response.ok || !payload) return { ok: false, status: 502, error: friendlyApiError(response.status) };
  if (payload.stop_reason === "max_tokens") {
    return { ok: false, status: 502, error: "Claude's answer was cut off. Try again." };
  }
  const block = payload.content?.find((item) => item.type === "text" && typeof item.text === "string");
  try {
    return { ok: true, value: JSON.parse(block?.text ?? "") };
  } catch {
    return { ok: false, status: 502, error: "Claude sent something we couldn't read. Try again." };
  }
}

function misses(value: unknown): Miss[] {
  if (!Array.isArray(value)) return [];
  const items: Miss[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Miss;
    const prompt = text(record.prompt).slice(0, 500);
    const feedback = text(record.feedback).slice(0, 300);
    if (!prompt || typeof record.score !== "number" || record.score >= 70) continue;
    items.push({ prompt, feedback, score: Math.max(0, Math.min(100, Math.round(record.score))) });
    if (items.length === 8) break;
  }
  return items;
}

function titlePrompt(
  objective: { kind: ObjectiveKind; testTopic: string; taskDescription: string },
  summary: string,
  material: string,
) {
  return [
    "Name this study material in one short line of no more than 8 words.",
    "The line should capture the idea of the contents. Plain words. No quotation marks. No hashtags.",
    objectiveLine(objective),
    summary ? `Summary:\n${summary}` : "",
    "Source material:",
    material,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function reviewPrompt(
  objective: { kind: ObjectiveKind; testTopic: string; taskDescription: string },
  summary: string,
  material: string,
  missed: Miss[],
) {
  const problems = missed
    .map((item, index) => `${index + 1}. Score ${item.score}. ${item.prompt}${item.feedback ? ` Note: ${item.feedback}` : ""}`)
    .join("\n");
  return [
    "A student missed the practice problems below.",
    "workOn: one or two sentences on what they should practice next, based on those misses.",
    "revisit: up to 6 short names of the chapters or parts of THIS material they should reread. Use the material's own headings when they exist. If it has no headings, name the idea in a few words. Do not invent parts that are not in the material.",
    objectiveLine(objective),
    summary ? `Summary:\n${summary}` : "",
    "Missed problems:",
    problems,
    "Source material:",
    material,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function objectiveLine(objective: { kind: ObjectiveKind; testTopic: string; taskDescription: string }) {
  if (objective.kind === "test" && objective.testTopic) return `Their goal is to pass a test on ${objective.testTopic}.`;
  if (objective.kind === "apply" && objective.taskDescription) return `They are using this for: ${objective.taskDescription}`;
  if (objective.kind === "skill") return "Their goal is to learn a skill from this material.";
  if (objective.kind === "understand") return "Their goal is to understand the ideas.";
  return "";
}

function text(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function friendlyApiError(status: number) {
  if (status === 401) return "That API key was rejected. Open .env.local, check the key, save the file, and restart the app.";
  if (status === 429 || status === 529) return "Claude is busy right now. Wait a moment, then try again.";
  if (status === 400) return "Claude couldn't read that material. Try a shorter excerpt in step 1, then come back.";
  return "Claude couldn't finish that just now. Check your connection, then try again.";
}

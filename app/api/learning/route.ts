import { NextResponse } from "next/server";

import { buildContext, outcomeFor, parseLearningResult, type LearningResult } from "@/lib/learning-result";
import { limitMaterial } from "@/lib/limits";
import { formatMaterial, splitPassages } from "@/lib/passages";
import type { LearnSession, ObjectiveKind } from "@/lib/types";
import { buildLearningEngineMessage } from "@/prompts/learningEngine";

const MODEL = "claude-sonnet-5-5";
const KINDS: ObjectiveKind[] = ["test", "skill", "understand", "apply"];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["three_sentence_explanation", "summary", "main_point_citations", "needs_clarification"],
  properties: {
    three_sentence_explanation: { type: "string" },
    summary: { type: "string" },
    main_point_citations: {
      type: "array",
      items: { type: "string" },
    },
    needs_clarification: { type: ["string", "null"] },
  },
} as const;

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Add your Anthropic API key to .env.local, save the file, and restart the app. Then try again.",
      },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "We couldn't read that request. Go back to step 1 and save the material again." },
      { status: 400 },
    );
  }

  const record = body as (Partial<LearnSession> & { contextExtra?: unknown }) | null;
  const kind = record?.objective?.kind;
  const text = typeof record?.material?.text === "string" ? record.material.text : "";
  const limited = limitMaterial(text);
  if (!kind || !KINDS.includes(kind) || !limited.text) {
    return NextResponse.json(
      { error: "Save an objective and some material in step 1 before asking for a summary." },
      { status: 400 },
    );
  }

  const objective = {
    kind,
    testTopic: stringField(record?.objective?.testTopic).slice(0, 200),
    testFormat: stringField(record?.objective?.testFormat).slice(0, 200),
    taskDescription: stringField(record?.objective?.taskDescription).slice(0, 2_000),
  };
  const passages = splitPassages(limited.text);
  if (passages.length === 0) {
    return NextResponse.json(
      { error: "Save an objective and some material in step 1 before asking for a summary." },
      { status: 400 },
    );
  }

  const prompt = buildLearningEngineMessage({
    material: formatMaterial(passages),
    outcome: outcomeFor(kind),
    context: buildContext(objective, stringField(record?.contextExtra).slice(0, 2_000)),
  });

  let result: LearningResult | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const asked = await askClaude(apiKey, prompt);
    if (asked.kind === "failure") {
      return NextResponse.json({ error: asked.error }, { status: asked.status });
    }
    result = parseLearningResult(asked.value);
    if (result) break;
  }

  if (!result) {
    return NextResponse.json(
      { error: "Claude sent something we couldn't read. Try again." },
      { status: 502 },
    );
  }

  return NextResponse.json(result);
}

async function askClaude(
  apiKey: string,
  prompt: string,
): Promise<{ kind: "ok"; value: unknown } | { kind: "failure"; status: number; error: string }> {
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
        output_config: {
          format: {
            type: "json_schema",
            schema: SCHEMA,
          },
        },
      }),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return { kind: "failure", status: 504, error: "Claude took too long to answer. Wait a moment, then try again." };
    }
    return { kind: "failure", status: 502, error: "We couldn't reach Claude. Check your connection, then try again." };
  }

  const payload = (await response.json().catch(() => null)) as {
    content?: { type?: string; text?: string }[];
    stop_reason?: string;
  } | null;

  if (!response.ok || !payload) {
    console.error("Learning request failed", response.status);
    return { kind: "failure", status: 502, error: friendlyApiError(response.status) };
  }

  if (payload.stop_reason === "max_tokens") {
    return {
      kind: "failure",
      status: 502,
      error: "The summary was cut off. Try again, or use a shorter excerpt in step 1.",
    };
  }

  const textBlock = payload.content?.find((block) => block.type === "text" && typeof block.text === "string");
  try {
    return { kind: "ok", value: parseJsonText(textBlock?.text ?? "") };
  } catch {
    return { kind: "ok", value: null };
  }
}

function parseJsonText(text: string) {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

function stringField(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function friendlyApiError(status: number) {
  if (status === 401) {
    return "That API key was rejected. Open .env.local, check the key, save the file, and restart the app.";
  }
  if (status === 429 || status === 529) {
    return "Claude is busy right now. Wait a moment, then try again.";
  }
  if (status === 400) {
    return "Claude couldn't read that material. Try a shorter excerpt in step 1, then come back.";
  }
  return "Claude couldn't write the summary just now. Check your connection, then try again.";
}

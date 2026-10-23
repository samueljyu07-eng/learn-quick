import { NextResponse } from "next/server";

import { parseEstimate, wordCount } from "@/lib/estimate-result";
import { objectiveTitle } from "@/lib/objectives";
import type { LearnSession, ObjectiveKind } from "@/lib/types";

const MODEL = "claude-sonnet-5-5";
const KINDS: ObjectiveKind[] = ["test", "skill", "understand", "apply"];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["estimated_minutes", "reasoning"],
  properties: {
    estimated_minutes: { type: "number" },
    reasoning: { type: "string" },
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
      { error: "We couldn't read that request. Save step 1 again, then try the timer." },
      { status: 400 },
    );
  }

  const record = body as { summary?: unknown; objective?: LearnSession["objective"] } | null;
  const kind = record?.objective?.kind;
  const summary = typeof record?.summary === "string" ? record.summary.trim().slice(0, 20_000) : "";
  if (!kind || !KINDS.includes(kind) || !summary) {
    return NextResponse.json(
      { error: "The summary is not ready yet. Wait for it, then try the timer again." },
      { status: 400 },
    );
  }

  const objective = {
    kind,
    testTopic: stringField(record?.objective?.testTopic),
    testFormat: stringField(record?.objective?.testFormat),
    taskDescription: stringField(record?.objective?.taskDescription).slice(0, 2_000),
  };

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: buildPrompt(objective, summary),
          },
        ],
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
      return NextResponse.json(
        { error: "Claude took too long to estimate a study time. Wait a moment, then try again." },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { error: "We couldn't reach Claude. Check your connection, then try again." },
      { status: 502 },
    );
  }

  const payload = (await response.json().catch(() => null)) as {
    content?: { type?: string; text?: string }[];
    stop_reason?: string;
  } | null;

  if (!response.ok || !payload) {
    console.error("Estimate request failed", response.status);
    return NextResponse.json({ error: friendlyApiError(response.status) }, { status: 502 });
  }

  if (payload.stop_reason === "max_tokens") {
    return NextResponse.json(
      { error: "The time estimate was cut off. Try again." },
      { status: 502 },
    );
  }

  const textBlock = payload.content?.find((block) => block.type === "text" && typeof block.text === "string");
  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock?.text ?? "");
  } catch {
    return NextResponse.json(
      { error: "Claude sent something we couldn't read. Try again." },
      { status: 502 },
    );
  }

  const estimate = parseEstimate(parsed);
  if (!estimate) {
    return NextResponse.json(
      { error: "Claude didn't return a study time. Try again." },
      { status: 502 },
    );
  }

  return NextResponse.json(estimate);
}

function stringField(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildPrompt(
  objective: { kind: ObjectiveKind; testTopic: string; testFormat: string; taskDescription: string },
  summary: string,
) {
  const words = wordCount(summary);
  const details = [`Summary word count: ${words}.`, `Objective: ${objectiveTitle(objective.kind)}.`];
  if (objective.kind === "test" && objective.testTopic) details.push(`Test topic: ${objective.testTopic}.`);
  if (objective.kind === "test" && objective.testFormat) details.push(`Test format: ${objective.testFormat}.`);
  if (objective.kind === "apply" && objective.taskDescription) {
    details.push(`What the learner is working on: ${objective.taskDescription}`);
  }

  return [
    "Estimate how many minutes a learner should spend on this summary in one sitting.",
    "This is already a shortened summary, not the original upload. Base the guess on the summary.",
    "The guess does not need to be precise. Keep estimated_minutes as a whole number from 5 to 120.",
    "Write reasoning as one short sentence in plain language.",
    "Base the estimate on the summary's word count, how complex the concepts look, and the selected outcome.",
    "Complexity means technical vocabulary, abstract ideas, and how many new terms a newcomer would meet.",
    "Passing a test needs more review time than a general overview. Learning a skill needs time to practice. Applying the material needs time to write an answer.",
    "Use only the summary below. Do not add outside facts.",
    "",
    details.join("\n"),
    "",
    "Summary:",
    summary,
  ].join("\n");
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
  return "Claude couldn't estimate a study time. Check your connection, then try again.";
}

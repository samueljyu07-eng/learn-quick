import { NextResponse } from "next/server";

import { parseDefinitionResult } from "@/lib/definition-result";
import { limitMaterial } from "@/lib/limits";
import type { LearnSession, ObjectiveKind } from "@/lib/types";

const MODEL = "claude-sonnet-5-5";
const KINDS: ObjectiveKind[] = ["test", "skill", "understand", "apply"];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["terms"],
  properties: {
    terms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["term", "definition"],
        properties: {
          term: { type: "string" },
          definition: { type: "string" },
        },
      },
    },
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

  const session = body as Partial<LearnSession> | null;
  const kind = session?.objective?.kind;
  const text = typeof session?.material?.text === "string" ? session.material.text : "";
  const limited = limitMaterial(text);
  if (!kind || !KINDS.includes(kind) || !limited.text) {
    return NextResponse.json(
      { error: "Save an objective and some material in step 1 before asking for definitions." },
      { status: 400 },
    );
  }

  const objective = {
    kind,
    testTopic: stringField(session?.objective?.testTopic),
    testFormat: stringField(session?.objective?.testFormat),
    taskDescription: stringField(session?.objective?.taskDescription).slice(0, 2_000),
  };

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
        max_tokens: 2_000,
        messages: [
          {
            role: "user",
            content: buildPrompt(objective, limited.text),
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
        { error: "Claude took too long to answer. Wait a moment, then try again." },
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
    console.error("Definition request failed", response.status);
    return NextResponse.json({ error: friendlyApiError(response.status) }, { status: 502 });
  }

  if (payload.stop_reason === "max_tokens") {
    return NextResponse.json(
      { error: "The definitions were cut off. Try again, or use a shorter excerpt in step 1." },
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

  const terms = parseDefinitionResult(parsed);
  if (terms.length === 0) {
    return NextResponse.json(
      { error: "Claude didn't find key terms in that material. Try a longer excerpt in step 1." },
      { status: 502 },
    );
  }

  return NextResponse.json({ terms });
}

function stringField(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildPrompt(
  objective: { kind: ObjectiveKind; testTopic: string; testFormat: string; taskDescription: string },
  material: string,
) {
  return [
    "Extract the key terms from the source material below.",
    "Write each definition in one or two short sentences of plain language, for someone new to the subject.",
    "Use only ideas that are in the material. Do not add outside facts, and do not invent links.",
    "Return between 4 and 8 terms. Use fewer when the material is short. Skip trivia.",
    "",
    focusFor(objective),
    "",
    "Source material:",
    material,
  ].join("\n");
}

function focusFor(objective: {
  kind: ObjectiveKind;
  testTopic: string;
  testFormat: string;
  taskDescription: string;
}) {
  if (objective.kind === "test") {
    const topic = objective.testTopic ? ` The test topic is: ${objective.testTopic}.` : "";
    const format = objective.testFormat ? ` The format is: ${objective.testFormat}.` : "";
    return `The learner wants to pass a test.${topic}${format} Choose terms, formulas, and distinctions a test is likely to ask them to define. Skip the rest.`;
  }
  if (objective.kind === "skill") {
    return "The learner wants to learn a skill. Choose the terms they need in order to carry out the actions in the material.";
  }
  if (objective.kind === "apply") {
    return `The learner is working on this task: ${objective.taskDescription || "a task based on this material"}. Choose the terms they need in order to use the material for that task.`;
  }
  return "The learner wants to understand the ideas. Choose the core concepts and the words that connect them.";
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
  return "Claude couldn't make the definitions just now. Check your connection, then try again.";
}

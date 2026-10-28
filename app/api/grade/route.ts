import { NextResponse } from "next/server";

import { STUDY } from "@/config/study";
import { scoreWritten } from "@/lib/hardcore-store";
import { learnerId } from "@/lib/learner-id";
import { MAX_MATERIAL_CHARS } from "@/lib/limits";
import { PROBLEM_TYPES, type ProblemType } from "@/lib/problems/types";

const MODEL = "claude-sonnet-5-5";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["score", "feedback"],
  properties: {
    score: { type: "number" },
    feedback: { type: "string" },
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
    return NextResponse.json({ error: "We couldn't read that answer. Try again." }, { status: 400 });
  }

  const record = body as {
    prompt?: unknown;
    rubric?: unknown;
    response?: unknown;
    summary?: unknown;
    type?: unknown;
    runOutput?: unknown;
    hardcoreText?: unknown;
    problemId?: unknown;
  } | null;
  const prompt = text(record?.prompt).slice(0, 1_000);
  const responseText = text(record?.response).slice(0, 8_000);
  const summary = text(record?.summary).slice(0, 8_000);
  const type = record?.type;
  if (!prompt || !responseText || !summary || !isType(type)) {
    return NextResponse.json({ error: "Write an answer before asking for a score." }, { status: 400 });
  }

  let claude: Response;
  try {
    claude = await fetch("https://api.anthropic.com/v1/messages", {
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
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: [
              "Score the learner's answer from 0 to 100.",
              `A score of ${STUDY.passingScore} or more means it passes.`,
              "Use only the summary, the rubric, and the answer. Do not add outside facts.",
              "feedback is 1 to 3 short sentences: what was right, and the most important gap.",
              "Be strict about missing required points. Do not praise fluff.",
              "",
              `Problem type: ${type}`,
              "",
              "Prompt:",
              prompt,
              "",
              "Rubric:",
              text(record?.rubric).slice(0, 800) || "(none)",
              "",
              "Program output, if any:",
              text(record?.runOutput).slice(0, 2_000) || "(none)",
              "",
              "Summary:",
              summary,
              "",
              "Learner's answer:",
              responseText,
            ].join("\n"),
          },
        ],
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
      }),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return NextResponse.json({ error: "Claude took too long to score that. Try again." }, { status: 504 });
    }
    return NextResponse.json({ error: "We couldn't reach Claude. Check your connection, then try again." }, { status: 502 });
  }

  const payload = (await claude.json().catch(() => null)) as {
    content?: { type?: string; text?: string }[];
  } | null;
  if (!claude.ok || !payload) {
    console.error("Grade request failed", claude.status);
    return NextResponse.json({ error: "Claude couldn't score that answer. Try again." }, { status: 502 });
  }

  const raw = payload.content?.find((block) => block.type === "text" && typeof block.text === "string")?.text ?? "";
  let parsed: { score?: unknown; feedback?: unknown } | null = null;
  try {
    parsed = JSON.parse(raw) as { score?: unknown; feedback?: unknown };
  } catch {
    return NextResponse.json({ error: "Claude sent something we couldn't read. Try again." }, { status: 502 });
  }
  const score = typeof parsed.score === "number" ? Math.round(parsed.score) : Number.NaN;
  const feedback = text(parsed.feedback);
  if (!Number.isFinite(score) || !feedback) {
    return NextResponse.json({ error: "Claude didn't return a score. Try again." }, { status: 502 });
  }
  const savedScore = Math.min(100, Math.max(0, score));
  const savedFeedback = feedback.slice(0, 500);
  const hardcoreText = text(record?.hardcoreText).slice(0, MAX_MATERIAL_CHARS);
  const problemId = text(record?.problemId);
  if (!hardcoreText || !problemId) {
    return NextResponse.json({ score: savedScore, feedback: savedFeedback });
  }
  const recorded = await scoreWritten(await learnerId(), hardcoreText, problemId, savedScore);
  if (!recorded.ok) {
    return NextResponse.json({
      score: savedScore,
      feedback: savedFeedback,
      hardcore: recorded.hardcore,
      hardcoreError: recorded.error,
    });
  }
  return NextResponse.json({ score: savedScore, feedback: savedFeedback, hardcore: recorded.hardcore });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isType(value: unknown): value is ProblemType {
  return typeof value === "string" && PROBLEM_TYPES.includes(value as ProblemType);
}

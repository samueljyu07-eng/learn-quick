import { NextResponse } from "next/server";

const MODEL = "claude-sonnet-5-5";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["known_terms"],
  properties: {
    known_terms: {
      type: "array",
      items: { type: "string" },
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
    return NextResponse.json({ error: "We couldn't read that request. Try again." }, { status: 400 });
  }

  const record = body as { candidates?: unknown; libraryTerms?: unknown } | null;
  const candidates = stringList(record?.candidates).slice(0, 12);
  const libraryTerms = stringList(record?.libraryTerms).slice(0, 80);
  if (candidates.length === 0 || libraryTerms.length === 0) {
    return NextResponse.json({ known_terms: [] });
  }

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
        max_tokens: 500,
        messages: [{ role: "user", content: buildPrompt(candidates, libraryTerms) }],
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
      }),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return NextResponse.json({ error: "Claude took too long to compare terms. Try again." }, { status: 504 });
    }
    return NextResponse.json({ error: "We couldn't reach Claude. Check your connection, then try again." }, { status: 502 });
  }

  const payload = (await response.json().catch(() => null)) as {
    content?: { type?: string; text?: string }[];
  } | null;
  if (!response.ok || !payload) {
    console.error("Familiarity request failed", response.status);
    return NextResponse.json({ error: "Claude couldn't compare those terms. Try again." }, { status: 502 });
  }

  const text = payload.content?.find((block) => block.type === "text" && typeof block.text === "string")?.text ?? "";
  let parsed: { known_terms?: unknown } | null = null;
  try {
    parsed = JSON.parse(text) as { known_terms?: unknown };
  } catch {
    return NextResponse.json({ known_terms: [] });
  }
  const allowed = new Set(candidates);
  const known = Array.isArray(parsed.known_terms)
    ? parsed.known_terms.filter((item): item is string => typeof item === "string" && allowed.has(item))
    : [];
  return NextResponse.json({ known_terms: known });
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function buildPrompt(candidates: string[], libraryTerms: string[]) {
  return [
    "Decide which NEW TERMS mean the same thing as a term the learner already saved.",
    "Count a new term only when it is a synonym, abbreviation, or obvious rephrasing of a saved term.",
    "Do not count terms that are merely related.",
    "Return only strings copied exactly from NEW TERMS. Return an empty list if none match.",
    "",
    "NEW TERMS:",
    candidates.map((term) => `- ${term}`).join("\n"),
    "",
    "SAVED TERMS:",
    libraryTerms.map((term) => `- ${term}`).join("\n"),
  ].join("\n");
}

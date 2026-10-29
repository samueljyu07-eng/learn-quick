import { NextResponse } from "next/server";

import { sessionUser } from "@/lib/learner";
import { supabaseServer } from "@/lib/supabase/server";

const MAX_ITEMS = 500;
const MAX_TERM = 200;
const MAX_DEFINITION = 2_000;
const MAX_SOURCE = 200;

type Row = {
  id: string;
  term: string;
  definition: string;
  source: string;
  added_at: string;
};

export async function GET() {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to use My definitions on your account." }, { status: 401 });
  const supabase = await supabaseServer();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured yet." }, { status: 503 });
  const { data, error } = await supabase
    .from("definitions")
    .select("id, term, definition, source, added_at")
    .eq("user_id", user.id)
    .order("added_at", { ascending: false })
    .limit(MAX_ITEMS);
  if (error) {
    return NextResponse.json(
      { error: "My definitions couldn't be read. Run supabase/schema.sql in the Supabase SQL editor, then try again." },
      { status: 500 },
    );
  }
  return NextResponse.json({
    items: ((data ?? []) as Row[]).map((item) => ({
      id: item.id,
      term: item.term,
      definition: item.definition,
      source: item.source,
      addedAt: item.added_at,
    })),
  });
}

export async function PUT(request: Request) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to use My definitions on your account." }, { status: 401 });
  const supabase = await supabaseServer();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured yet." }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "We couldn't read that list." }, { status: 400 });
  }
  const items = Array.isArray((body as { items?: unknown } | null)?.items)
    ? (body as { items: unknown[] }).items
    : null;
  if (!items) return NextResponse.json({ error: "We couldn't read that list." }, { status: 400 });
  if (items.length > MAX_ITEMS) {
    return NextResponse.json({ error: "My definitions can hold up to 500 terms." }, { status: 400 });
  }

  const rows = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const record = item as { id?: unknown; term?: unknown; definition?: unknown; source?: unknown; addedAt?: unknown };
    const term = typeof record.term === "string" ? record.term.trim().slice(0, MAX_TERM) : "";
    const definition = typeof record.definition === "string" ? record.definition.trim().slice(0, MAX_DEFINITION) : "";
    if (!term || !definition) continue;
    const source = typeof record.source === "string" ? record.source.trim().slice(0, MAX_SOURCE) : "";
    const addedAt = typeof record.addedAt === "string" && !Number.isNaN(Date.parse(record.addedAt)) ? record.addedAt : new Date().toISOString();
    const id = typeof record.id === "string" && /^[0-9a-f-]{36}$/i.test(record.id) ? record.id : crypto.randomUUID();
    rows.push({ id, user_id: user.id, term, definition, source, added_at: addedAt });
  }

  const { error: deleteError } = await supabase.from("definitions").delete().eq("user_id", user.id);
  if (deleteError) {
    return NextResponse.json(
      { error: "My definitions couldn't be saved. Run supabase/schema.sql in the Supabase SQL editor, then try again." },
      { status: 500 },
    );
  }
  if (rows.length > 0) {
    const { error } = await supabase.from("definitions").insert(rows);
    if (error) {
      return NextResponse.json({ error: "My definitions couldn't be saved. Try again." }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}

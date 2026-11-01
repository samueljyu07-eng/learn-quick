import { NextResponse } from "next/server";

import { sessionUser } from "@/lib/learner";
import { MAX_SAVED_LESSONS, parseSavedLesson, type SavedLesson } from "@/lib/saved-lesson";
import { supabaseServer } from "@/lib/supabase/server";

type Row = {
  id: string;
  title: string;
  added_at: string;
  payload: unknown;
};

export async function GET() {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to keep saved lessons on your account." }, { status: 401 });
  const supabase = await supabaseServer();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured yet." }, { status: 503 });
  const { data, error } = await supabase
    .from("saved_lessons")
    .select("id, title, added_at, payload")
    .eq("user_id", user.id)
    .order("added_at", { ascending: false })
    .limit(MAX_SAVED_LESSONS);
  if (error) {
    return NextResponse.json(
      { error: "Saved lessons couldn't be read. Run supabase/schema.sql in the Supabase SQL editor, then try again." },
      { status: 500 },
    );
  }
  const items = ((data ?? []) as Row[])
    .map((row) => {
      const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
      return parseSavedLesson({ ...payload, id: row.id, title: row.title, addedAt: row.added_at });
    })
    .filter((item): item is SavedLesson => item !== null);
  return NextResponse.json({ items });
}

export async function PUT(request: Request) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to keep saved lessons on your account." }, { status: 401 });
  const supabase = await supabaseServer();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured yet." }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "We couldn't read that list." }, { status: 400 });
  }
  const incoming = Array.isArray((body as { items?: unknown } | null)?.items)
    ? (body as { items: unknown[] }).items
    : null;
  if (!incoming) return NextResponse.json({ error: "We couldn't read that list." }, { status: 400 });
  if (incoming.length > MAX_SAVED_LESSONS) {
    return NextResponse.json({ error: `Saved lessons can hold up to ${MAX_SAVED_LESSONS} lessons.` }, { status: 400 });
  }

  const lessons = incoming
    .map(parseSavedLesson)
    .filter((item): item is SavedLesson => item !== null)
    .slice(0, MAX_SAVED_LESSONS);
  const rows = lessons.map((lesson) => ({
    id: lesson.id,
    user_id: user.id,
    title: lesson.title,
    added_at: lesson.addedAt,
    payload: lesson,
  }));

  const { error: deleteError } = await supabase.from("saved_lessons").delete().eq("user_id", user.id);
  if (deleteError) {
    return NextResponse.json(
      { error: "Saved lessons couldn't be saved. Run supabase/schema.sql in the Supabase SQL editor, then try again." },
      { status: 500 },
    );
  }
  if (rows.length > 0) {
    const { error } = await supabase.from("saved_lessons").insert(rows);
    if (error) {
      return NextResponse.json({ error: "Saved lessons couldn't be saved. Try again." }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}

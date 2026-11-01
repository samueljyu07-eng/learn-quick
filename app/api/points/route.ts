import { NextResponse } from "next/server";

import { STUDY } from "@/config/study";
import { hashMaterial } from "@/lib/material-hash";
import { inspectMaterial } from "@/lib/hardcore-store";
import { currentLearner, sessionUser } from "@/lib/learner";
import { MAX_MATERIAL_CHARS } from "@/lib/limits";
import { calendarDay, pointsForPass, streakEnding } from "@/lib/points";
import { supabaseService } from "@/lib/supabase/server";

type AwardRow = {
  material_hash: string;
  session_saved_at: string;
  day: string;
  points: number;
};

export async function GET(request: Request) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to see your points." }, { status: 401 });
  const supabase = supabaseService();
  if (!supabase) return NextResponse.json({ error: "Add the Supabase service role key to save points." }, { status: 503 });

  const today = calendarDay(new URL(request.url).searchParams.get("today") ?? "", new Date());
  const { data, error } = await supabase
    .from("point_awards")
    .select("material_hash, session_saved_at, day, points")
    .eq("user_id", user.id);
  if (error) {
    return NextResponse.json(
      { error: "Points couldn't be read. Run supabase/schema.sql in the Supabase SQL editor, then try again." },
      { status: 500 },
    );
  }
  const rows = (data ?? []) as AwardRow[];
  const days: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    const day = String(row.day).slice(0, 10);
    days[day] = (days[day] ?? 0) + row.points;
    total += row.points;
  }
  const streak = today ? streakEnding(new Map(Object.entries(days)), today) : 0;
  return NextResponse.json({ total, streak, days, cap: STUDY.dailyPointCap });
}

export async function POST(request: Request) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to keep points for this pass." }, { status: 401 });
  const supabase = supabaseService();
  if (!supabase) return NextResponse.json({ error: "Add the Supabase service role key to save points." }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "We couldn't read that score." }, { status: 400 });
  }
  const record = body as {
    text?: unknown;
    savedAt?: unknown;
    passed?: unknown;
    familiarity?: unknown;
    day?: unknown;
  } | null;
  if (record?.passed !== true) return NextResponse.json({ points: 0, capped: false, repeat: false });
  const text = typeof record.text === "string" ? record.text.slice(0, MAX_MATERIAL_CHARS) : "";
  const savedAt = typeof record.savedAt === "string" ? record.savedAt : "";
  const day = calendarDay(typeof record.day === "string" ? record.day : "");
  if (!text.trim() || Number.isNaN(Date.parse(savedAt)) || !day) {
    return NextResponse.json({ error: "That score is missing a date or the material." }, { status: 400 });
  }

  const learner = await currentLearner();
  if (learner.account) {
    const gate = await inspectMaterial(learner, text);
    if (gate.hardcore.status === "failed" || (gate.locked && gate.hardcore.status !== "passed")) {
      return NextResponse.json({ error: "This material is locked, so it can't earn points." }, { status: 403 });
    }
  }

  const materialHash = await hashMaterial(text);
  const { data: existingRows, error: readError } = await supabase
    .from("point_awards")
    .select("material_hash, session_saved_at, day, points")
    .eq("user_id", user.id);
  if (readError) {
    return NextResponse.json(
      { error: "Points couldn't be saved. Run supabase/schema.sql in the Supabase SQL editor, then try again." },
      { status: 500 },
    );
  }
  const rows = (existingRows ?? []) as AwardRow[];
  const savedTime = new Date(savedAt).toISOString();
  const already = rows.find((row) => new Date(row.session_saved_at).toISOString() === savedTime);
  if (already) {
    return NextResponse.json({ points: already.points, capped: false, repeat: false, already: true });
  }

  const familiarity = typeof record.familiarity === "number" && Number.isFinite(record.familiarity) ? record.familiarity : 1;
  const repeat = rows.some((row) => row.material_hash === materialHash);
  const earnedToday = rows.reduce((sum, row) => sum + (String(row.day).slice(0, 10) === day ? row.points : 0), 0);
  const points = pointsForPass({ familiarity, repeat, earnedToday });
  const { error } = await supabase.from("point_awards").insert({
    user_id: user.id,
    material_hash: materialHash,
    session_saved_at: savedTime,
    day,
    points,
  });
  if (error) {
    return NextResponse.json({ error: "Points couldn't be saved. Try again." }, { status: 500 });
  }
  return NextResponse.json({
    points,
    capped: earnedToday + points >= STUDY.dailyPointCap,
    repeat,
  });
}

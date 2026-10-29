import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { STUDY } from "@/config/study";
import type { HardcoreSnapshot } from "@/lib/hardcore-types";
import type { Learner } from "@/lib/learner";
import { learnerId } from "@/lib/learner-id";
import { isNearDuplicate, lockHashSource, normalizeForLock } from "@/lib/lock-text";
import type { ProblemSet } from "@/lib/problems/types";
import { supabaseService } from "@/lib/supabase/server";

// Signed-out runs stay in data/hardcore.json. Signed-in runs are stored in Supabase.

type Run = {
  learnerId: string;
  hash: string;
  title: string;
  normalized: string;
  deadlineAt: number;
  minutes: number;
  status: "open" | "passed" | "failed";
  problems: ProblemSet | null;
  scores: Record<string, number>;
  finishedAt: number | null;
};

type Lock = {
  learnerId: string;
  hash: string;
  title: string;
  normalized: string;
  lockedAt: number;
};

type Pending = {
  learnerId: string;
  hash: string;
  normalized: string;
  problems: ProblemSet;
};

type Store = {
  runs: Run[];
  locks: Lock[];
  pending: Pending[];
};

const FILE = path.join(process.cwd(), "data", "hardcore.json");

let chain: Promise<void> = Promise.resolve();

function change<T>(learner: Learner, mutate: (store: Store) => T): Promise<T> {
  const run = chain.then(async () => {
    const store = learner.account ? await readAccountStore(learner.id) : await readStore();
    const result = mutate(store);
    if (learner.account) await writeAccountStore(learner.id, store);
    else await writeStore(store);
    return result;
  });
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function adoptAccountHardcore(userId: string) {
  const supabase = supabaseService();
  if (!supabase) return;
  const { data, error } = await supabase.from("hardcore_state").select("user_id").eq("user_id", userId).maybeSingle();
  if (error || data) return;
  await change({ id: userId, account: true }, () => undefined);
}

export function inspectMaterial(learner: Learner, text: string) {
  const learnerId = learner.id;
  return change(learner, (store) => {
    const now = Date.now();
    expire(store, learnerId, now);
    const normalized = normalizeForLock(text);
    const lock = findLock(store, learnerId, normalized);
    const run = findRun(store, learnerId, normalized);
    if (run?.status === "failed") ensureLock(store, run, now);
    return {
      locked: Boolean(lock) || run?.status === "failed",
      active: run?.status === "open",
      hardcore: viewOf(store, learnerId, normalized, now),
    };
  });
}

export function listLockTitles(learner: Learner) {
  const learnerId = learner.id;
  return change(learner, (store) => {
    expire(store, learnerId, Date.now());
    return store.locks.filter((lock) => lock.learnerId === learnerId).map((lock) => lock.title);
  });
}

export function beginRun(input: { learner: Learner; text: string; title: string; minutes: number }) {
  return change(input.learner, (store) => {
    const learnerId = input.learner.id;
    const now = Date.now();
    expire(store, learnerId, now);
    const normalized = normalizeForLock(input.text);
    const hash = hashNormalized(normalized);
    const existing = findRun(store, learnerId, normalized);
    if (existing) {
      if (existing.status === "failed") ensureLock(store, existing, now);
      adoptPending(store, existing);
      return viewRun(existing, findLock(store, learnerId, normalized) != null || existing.status === "failed", now);
    }
    if (findLock(store, learnerId, normalized)) {
      return failedView(now);
    }
    const run: Run = {
      learnerId: learnerId,
      hash,
      title: deriveTitle(input.title, input.text),
      normalized,
      deadlineAt: now + input.minutes * 60_000,
      minutes: input.minutes,
      status: "open",
      problems: null,
      scores: {},
      finishedAt: null,
    };
    adoptPending(store, run);
    store.runs.push(run);
    return viewRun(run, false, now);
  });
}

export function storedProblems(learner: Learner, text: string) {
  const learnerId = learner.id;
  return change(learner, (store) => {
    const now = Date.now();
    expire(store, learnerId, now);
    const normalized = normalizeForLock(text);
    return findRun(store, learnerId, normalized)?.problems ?? findPending(store, learnerId, normalized)?.problems ?? null;
  });
}

export function rememberProblems(learner: Learner, text: string, problems: ProblemSet) {
  const learnerId = learner.id;
  return change(learner, (store) => {
    const now = Date.now();
    expire(store, learnerId, now);
    const normalized = normalizeForLock(text);
    const run = findRun(store, learnerId, normalized);
    if (run) {
      if (run.status === "open" && !run.problems) run.problems = problems;
      return run.problems ?? problems;
    }
    const pending = findPending(store, learnerId, normalized);
    if (!pending) {
      store.pending.push({ learnerId, hash: hashNormalized(normalized), normalized, problems });
    }
    return pending?.problems ?? problems;
  });
}

export function scoreChoice(learner: Learner, text: string, problemId: string, choice: string) {
  const learnerId = learner.id;
  return change(learner, (store) => {
    const now = Date.now();
    expire(store, learnerId, now);
    const run = openRun(store, learnerId, text, now);
    if (!run.ok) return { ...run, status: 409 };
    const problem = run.run.problems?.problems.find((item) => item.id === problemId);
    if (!problem || problem.type !== "multiple_choice") {
      return {
        ok: false as const,
        error: "That question is not part of this hardcore attempt.",
        status: 400,
        hardcore: viewRun(run.run, false, now),
      };
    }
    const correct = choice === problem.answer;
    run.run.scores[problemId] = correct ? 100 : 0;
    considerPass(run.run, now);
    if (run.run.status === "failed") ensureLock(store, run.run, now);
    return {
      ok: true as const,
      score: run.run.scores[problemId],
      feedback: correct
        ? "That's the choice supported by the summary."
        : `Not quite. The summary points to: ${problem.answer}`,
      hardcore: viewRun(run.run, run.run.status === "failed", now),
    };
  });
}

export function scoreWritten(learner: Learner, text: string, problemId: string, score: number) {
  const learnerId = learner.id;
  return change(learner, (store) => {
    const now = Date.now();
    expire(store, learnerId, now);
    const run = openRun(store, learnerId, text, now);
    if (!run.ok) return { ok: false as const, error: run.error, hardcore: run.hardcore, status: 409 };
    const problem = run.run.problems?.problems.find((item) => item.id === problemId);
    if (!problem || problem.type === "multiple_choice") {
      return {
        ok: false as const,
        error: "That answer is not part of this hardcore attempt.",
        status: 400,
        hardcore: viewRun(run.run, false, now),
      };
    }
    run.run.scores[problemId] = Math.min(100, Math.max(0, Math.round(score)));
    considerPass(run.run, now);
    if (run.run.status === "failed") ensureLock(store, run.run, now);
    return { ok: true as const, hardcore: viewRun(run.run, run.run.status === "failed", now) };
  });
}

export function finishAttempt(learner: Learner, text: string) {
  const learnerId = learner.id;
  return change(learner, (store) => {
    const now = Date.now();
    expire(store, learnerId, now);
    const normalized = normalizeForLock(text);
    const run = findRun(store, learnerId, normalized);
    if (!run) {
      return {
        ok: false as const,
        error: "The hardcore timer has not started yet. Wait for the study time, then submit again.",
        status: 409,
        hardcore: viewOf(store, learnerId, normalized, now),
      };
    }
    if (run.status !== "open") {
      return { ok: true as const, hardcore: viewRun(run, run.status === "failed", now) };
    }
    if (!run.problems) {
      return {
        ok: false as const,
        error: "The practice problems are not ready yet. Wait a moment, then submit again.",
        status: 409,
        hardcore: viewRun(run, false, now),
      };
    }
    for (const problem of run.problems.problems) {
      if (typeof run.scores[problem.id] !== "number") run.scores[problem.id] = 0;
    }
    const ids = run.problems.problems.map((problem) => problem.id);
    const average = ids.length ? Math.round(ids.reduce((sum, id) => sum + run.scores[id], 0) / ids.length) : 0;
    if (average >= STUDY.passingScore) {
      run.status = "passed";
      run.finishedAt = now;
    } else {
      run.status = "failed";
      run.finishedAt = now;
      ensureLock(store, run, now);
    }
    return { ok: true as const, hardcore: viewRun(run, run.status === "failed", now) };
  });
}

function openRun(store: Store, learnerId: string, text: string, now: number) {
  const normalized = normalizeForLock(text);
  const run = findRun(store, learnerId, normalized);
  if (!run) {
    return {
      ok: false as const,
      error: "The hardcore timer has not started yet. Wait for the study time, then score this again.",
      hardcore: viewOf(store, learnerId, normalized, now),
    };
  }
  if (run.status !== "open") {
    return {
      ok: false as const,
      error: run.status === "passed" ? "You already passed this material." : "This material is locked.",
      hardcore: viewRun(run, run.status === "failed", now),
    };
  }
  if (!run.problems) {
    return {
      ok: false as const,
      error: "The practice problems are not ready yet. Wait a moment, then score this again.",
      hardcore: viewRun(run, false, now),
    };
  }
  return { ok: true as const, run };
}

function expire(store: Store, learnerId: string, now: number) {
  for (const run of store.runs) {
    if (run.learnerId !== learnerId || run.status !== "open" || now < run.deadlineAt) continue;
    run.status = "failed";
    run.finishedAt = run.deadlineAt;
    ensureLock(store, run, run.deadlineAt);
  }
}

function considerPass(run: Run, now: number) {
  if (run.status !== "open") return;
  if (now >= run.deadlineAt) {
    run.status = "failed";
    run.finishedAt = run.deadlineAt;
    return;
  }
  const ids = run.problems?.problems.map((problem) => problem.id) ?? [];
  if (ids.length === 0 || ids.some((id) => typeof run.scores[id] !== "number")) return;
  const average = Math.round(ids.reduce((sum, id) => sum + run.scores[id], 0) / ids.length);
  if (average >= STUDY.passingScore) {
    run.status = "passed";
    run.finishedAt = now;
  }
}

function findPending(store: Store, learnerId: string, normalized: string) {
  const hash = hashNormalized(normalized);
  return (
    store.pending.find(
      (item) =>
        item.learnerId === learnerId &&
        (item.hash === hash || isNearDuplicate(item.normalized, normalized, STUDY.nearDuplicateSimilarity)),
    ) ?? null
  );
}

function adoptPending(store: Store, run: Run) {
  if (run.problems) return;
  const pending = store.pending.find(
    (item) =>
      item.learnerId === run.learnerId &&
      (item.hash === run.hash || isNearDuplicate(item.normalized, run.normalized, STUDY.nearDuplicateSimilarity)),
  );
  if (!pending) return;
  run.problems = pending.problems;
  store.pending = store.pending.filter((item) => item !== pending);
}

function ensureLock(store: Store, run: Run, lockedAt: number) {
  if (store.locks.some((lock) => lock.learnerId === run.learnerId && lock.hash === run.hash)) return;
  store.locks.push({
    learnerId: run.learnerId,
    hash: run.hash,
    title: run.title,
    normalized: run.normalized,
    lockedAt,
  });
}

function findLock(store: Store, learnerId: string, normalized: string) {
  return (
    store.locks.find(
      (lock) =>
        lock.learnerId === learnerId &&
        (lock.normalized === normalized ||
          isNearDuplicate(lock.normalized, normalized, STUDY.nearDuplicateSimilarity)),
    ) ?? null
  );
}

function findRun(store: Store, learnerId: string, normalized: string) {
  let best: Run | null = null;
  for (const run of store.runs) {
    if (run.learnerId !== learnerId) continue;
    if (run.normalized !== normalized && !isNearDuplicate(run.normalized, normalized, STUDY.nearDuplicateSimilarity)) {
      continue;
    }
    if (!best || run.deadlineAt < best.deadlineAt) best = run;
  }
  return best;
}

function viewOf(store: Store, learnerId: string, normalized: string, now: number): HardcoreSnapshot {
  const run = findRun(store, learnerId, normalized);
  const locked = findLock(store, learnerId, normalized) != null || run?.status === "failed";
  if (!run) return locked ? failedView(now) : emptyView(now, learnerId, store, normalized);
  return viewRun(run, locked, now);
}

function viewRun(run: Run, locked: boolean, now: number): HardcoreSnapshot {
  const ids = run.problems?.problems.map((problem) => problem.id) ?? [];
  const doneIds = ids.filter((id) => typeof run.scores[id] === "number");
  const average = doneIds.length
    ? Math.round(doneIds.reduce((sum, id) => sum + run.scores[id], 0) / doneIds.length)
    : null;
  return {
    locked: locked || run.status === "failed",
    status: run.status,
    deadlineAt: run.deadlineAt,
    serverNow: now,
    average,
    done: doneIds.length,
    total: ids.length,
    minutes: run.minutes,
    problemsReady: Boolean(run.problems),
  };
}

function emptyView(now: number, learnerId: string, store: Store, normalized: string): HardcoreSnapshot {
  const pending = findPending(store, learnerId, normalized) != null;
  return {
    locked: false,
    status: "none",
    deadlineAt: null,
    serverNow: now,
    average: null,
    done: 0,
    total: 0,
    minutes: null,
    problemsReady: pending,
  };
}

function failedView(now: number): HardcoreSnapshot {
  return {
    locked: true,
    status: "failed",
    deadlineAt: null,
    serverNow: now,
    average: null,
    done: 0,
    total: 0,
    minutes: null,
    problemsReady: false,
  };
}

function deriveTitle(title: string, text: string) {
  const given = title.replace(/\s+/g, " ").trim().slice(0, 120);
  if (given) return given;
  const line = text
    .split("\n")
    .map((part) => part.trim())
    .find(Boolean);
  return (line || "Untitled material").slice(0, 80);
}

function hashNormalized(normalized: string) {
  return createHash("sha256").update(lockHashSource(normalized)).digest("hex");
}

async function readAccountStore(userId: string): Promise<Store> {
  const supabase = supabaseService();
  if (!supabase) return { runs: [], locks: [], pending: [] };
  const { data, error } = await supabase
    .from("hardcore_state")
    .select("runs, locks, pending")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error("Hardcore mode couldn't read your account. Run supabase/schema.sql in the Supabase SQL editor, then try again.");
  }
  if (data) return sanitizeStore(data);
  return importCookieStore(userId);
}

async function writeAccountStore(userId: string, store: Store) {
  const supabase = supabaseService();
  if (!supabase) return;
  const { error } = await supabase.from("hardcore_state").upsert({
    user_id: userId,
    runs: store.runs,
    locks: store.locks,
    pending: store.pending,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    throw new Error("Hardcore mode couldn't save your account. Run supabase/schema.sql in the Supabase SQL editor, then try again.");
  }
}

async function importCookieStore(userId: string): Promise<Store> {
  const cookieId = await learnerId();
  const file = await readStore();
  const take = <T extends { learnerId: string }>(items: T[]) =>
    items.filter((item) => item.learnerId === cookieId).map((item) => ({ ...item, learnerId: userId }));
  return {
    runs: take(file.runs),
    locks: take(file.locks),
    pending: take(file.pending),
  };
}

function sanitizeStore(value: { runs?: unknown; locks?: unknown; pending?: unknown }): Store {
  return {
    runs: Array.isArray(value.runs) ? (value.runs as Run[]) : [],
    locks: Array.isArray(value.locks) ? (value.locks as Lock[]) : [],
    pending: Array.isArray(value.pending) ? (value.pending as Pending[]) : [],
  };
}

async function readStore(): Promise<Store> {
  try {
    const raw = await readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<Store>;
    return {
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      locks: Array.isArray(parsed.locks) ? parsed.locks : [],
      pending: Array.isArray(parsed.pending) ? parsed.pending : [],
    };
  } catch {
    return { runs: [], locks: [], pending: [] };
  }
}

async function writeStore(store: Store) {
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(store));
}

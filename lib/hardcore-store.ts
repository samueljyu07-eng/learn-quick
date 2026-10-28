import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { STUDY } from "@/config/study";
import type { HardcoreSnapshot } from "@/lib/hardcore-types";
import { isNearDuplicate, lockHashSource, normalizeForLock } from "@/lib/lock-text";
import type { ProblemSet } from "@/lib/problems/types";

// Local stand-in for the Phase C tables. The deadline and the lock live here,
// not in the browser. A later phase can swap this file for Postgres.

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

function change<T>(mutate: (store: Store) => T): Promise<T> {
  const run = chain.then(async () => {
    const store = await readStore();
    const result = mutate(store);
    await writeStore(store);
    return result;
  });
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function inspectMaterial(learnerId: string, text: string) {
  return change((store) => {
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

export function listLockTitles(learnerId: string) {
  return change((store) => {
    expire(store, learnerId, Date.now());
    return store.locks.filter((lock) => lock.learnerId === learnerId).map((lock) => lock.title);
  });
}

export function beginRun(input: { learnerId: string; text: string; title: string; minutes: number }) {
  return change((store) => {
    const now = Date.now();
    expire(store, input.learnerId, now);
    const normalized = normalizeForLock(input.text);
    const hash = hashNormalized(normalized);
    const existing = findRun(store, input.learnerId, normalized);
    if (existing) {
      if (existing.status === "failed") ensureLock(store, existing, now);
      adoptPending(store, existing);
      return viewRun(existing, findLock(store, input.learnerId, normalized) != null || existing.status === "failed", now);
    }
    if (findLock(store, input.learnerId, normalized)) {
      return failedView(now);
    }
    const run: Run = {
      learnerId: input.learnerId,
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

export function storedProblems(learnerId: string, text: string) {
  return change((store) => {
    const now = Date.now();
    expire(store, learnerId, now);
    const normalized = normalizeForLock(text);
    return findRun(store, learnerId, normalized)?.problems ?? findPending(store, learnerId, normalized)?.problems ?? null;
  });
}

export function rememberProblems(learnerId: string, text: string, problems: ProblemSet) {
  return change((store) => {
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

export function scoreChoice(learnerId: string, text: string, problemId: string, choice: string) {
  return change((store) => {
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

export function scoreWritten(learnerId: string, text: string, problemId: string, score: number) {
  return change((store) => {
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

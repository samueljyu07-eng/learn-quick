"use client";

import { useSyncExternalStore } from "react";

import { parseDifficulty } from "@/lib/difficulty-result";
import { noteHardcoreResult } from "@/lib/hardcore-clock";
import { isHardcoreSnapshot } from "@/lib/hardcore-types";
import { wordCount } from "@/lib/estimate-result";
import { calculateStudyTime, explainStudyTime } from "@/lib/study-time";
import type { LearnSession } from "@/lib/types";

const STORAGE_KEY = "learn-quick-timer";
const LOCK_KEY = "learn-quick-estimate-lock";
const LOCK_MS = 15_000;
const MAX_SECONDS = 240 * 60;

export type TimerView = {
  status: "hidden" | "loading" | "error" | "ready";
  error: string;
  savedAt: string;
  estimatedMinutes: number;
  reasoning: string;
  plannedSeconds: number;
  remainingSeconds: number;
  running: boolean;
  endsAt: number | null;
  timeUp: boolean;
  stopped: boolean;
  storageWarning: string;
  controlled?: boolean;
};

const HIDDEN: TimerView = {
  status: "hidden",
  error: "",
  savedAt: "",
  estimatedMinutes: 0,
  reasoning: "",
  plannedSeconds: 0,
  remainingSeconds: 0,
  running: false,
  endsAt: null,
  timeUp: false,
  stopped: false,
  storageWarning: "",
};

const listeners = new Set<() => void>();
let snapshot: TimerView = HIDDEN;
let loaded = false;
let generation = 0;
let inFlightFor = "";
let clockId = 0;
let waitId = 0;

function notify() {
  for (const listener of listeners) listener();
}

function publish(next: TimerView) {
  snapshot = next;
  notify();
  syncClock();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  loadFromStorage();
  syncClock();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      unwatchClock();
      stopClock();
    }
  };
}

function liveRemaining(state: TimerView) {
  if (state.running && state.endsAt != null) {
    return Math.max(0, Math.round((state.endsAt - Date.now()) / 1000));
  }
  return state.remainingSeconds;
}

function toStored(state: TimerView) {
  return {
    savedAt: state.savedAt,
    estimatedMinutes: state.estimatedMinutes,
    reasoning: state.reasoning,
    plannedSeconds: state.plannedSeconds,
    remainingSeconds: state.remainingSeconds,
    running: state.running,
    endsAt: state.endsAt,
    timeUp: state.timeUp,
    stopped: state.stopped,
  };
}

function remember(next: TimerView) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStored(next)));
    next.storageWarning = "";
  } catch {
    next.storageWarning =
      "Saved for this visit. A refresh may clear the timer because the browser blocked extra storage.";
  }
  publish(next);
}

function isStoredTimer(value: unknown): value is ReturnType<typeof toStored> {
  if (!value || typeof value !== "object") return false;
  const item = value as ReturnType<typeof toStored>;
  return (
    typeof item.savedAt === "string" &&
    item.savedAt.length > 0 &&
    typeof item.estimatedMinutes === "number" &&
    item.estimatedMinutes >= 5 &&
    item.estimatedMinutes <= 120 &&
    typeof item.reasoning === "string" &&
    item.reasoning.length > 0 &&
    typeof item.plannedSeconds === "number" &&
    Number.isFinite(item.plannedSeconds) &&
    typeof item.remainingSeconds === "number" &&
    Number.isFinite(item.remainingSeconds) &&
    typeof item.running === "boolean" &&
    (item.endsAt === null || typeof item.endsAt === "number") &&
    typeof item.timeUp === "boolean" &&
    (item.stopped === undefined || typeof item.stopped === "boolean")
  );
}

function loadFromStorage() {
  if (loaded) return;
  loaded = true;
  if (typeof window === "undefined") return;

  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  if (!raw) return;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredTimer(parsed)) return;
    const next: TimerView = {
      status: "ready",
      error: "",
      savedAt: parsed.savedAt,
      estimatedMinutes: parsed.estimatedMinutes,
      reasoning: parsed.reasoning,
      plannedSeconds: Math.max(0, Math.round(parsed.plannedSeconds)),
      remainingSeconds: Math.max(0, Math.round(parsed.remainingSeconds)),
      running: parsed.running,
      endsAt: parsed.endsAt,
      timeUp: parsed.timeUp,
      stopped: parsed.stopped === true,
      storageWarning: "",
    };
    if (next.stopped) {
      next.running = false;
      next.endsAt = null;
      next.timeUp = false;
    } else if (next.running && next.endsAt != null) {
      const remaining = Math.round((next.endsAt - Date.now()) / 1000);
      if (remaining <= 0) {
        next.running = false;
        next.endsAt = null;
        next.remainingSeconds = 0;
        next.timeUp = true;
      } else {
        next.remainingSeconds = remaining;
      }
    }
    snapshot = next;
    if (next.timeUp && !parsed.timeUp) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toStored(next)));
      } catch {
        next.storageWarning =
          "Saved for this visit. A refresh may clear the timer because the browser blocked extra storage.";
      }
    }
  } catch {
    snapshot = HIDDEN;
  }
}

function onTick() {
  if (snapshot.status !== "ready" || !snapshot.running || snapshot.endsAt == null) return;
  const remaining = Math.max(0, Math.round((snapshot.endsAt - Date.now()) / 1000));
  if (remaining <= 0) {
    remember({
      ...snapshot,
      running: false,
      endsAt: null,
      remainingSeconds: 0,
      timeUp: true,
    });
    return;
  }
  if (remaining === snapshot.remainingSeconds) return;
  snapshot = { ...snapshot, remainingSeconds: remaining };
  notify();
}

function stopClock() {
  if (!clockId) return;
  window.clearInterval(clockId);
  clockId = 0;
}

function watchClock() {
  document.addEventListener("visibilitychange", onTick);
  window.addEventListener("focus", onTick);
}

function unwatchClock() {
  document.removeEventListener("visibilitychange", onTick);
  window.removeEventListener("focus", onTick);
}

function syncClock() {
  if (typeof window === "undefined") return;
  const shouldRun = snapshot.status === "ready" && snapshot.running;
  if (shouldRun && !clockId) {
    watchClock();
    clockId = window.setInterval(onTick, 250);
  }
  if (!shouldRun) {
    unwatchClock();
    stopClock();
  }
}

function getClientSnapshot() {
  loadFromStorage();
  return snapshot;
}

export function useStudyTimer() {
  return useSyncExternalStore(subscribe, getClientSnapshot, () => HIDDEN);
}

export function clearTimer() {
  if (snapshot.status === "hidden") return;
  generation += 1;
  inFlightFor = "";
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(LOCK_KEY);
  } catch {
    // The in-memory timer is already going away.
  }
  window.clearTimeout(waitId);
  publish(HIDDEN);
}

function lockAge(savedAt: string) {
  try {
    const raw = sessionStorage.getItem(LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: string; at?: number };
    if (parsed.savedAt !== savedAt || typeof parsed.at !== "number") return null;
    return Date.now() - parsed.at;
  } catch {
    return null;
  }
}

function writeLock(savedAt: string) {
  try {
    sessionStorage.setItem(LOCK_KEY, JSON.stringify({ savedAt, at: Date.now() }));
  } catch {
    // A missing lock only means a refresh may ask again.
  }
}

function clearLock(savedAt: string) {
  try {
    const age = lockAge(savedAt);
    if (age != null) sessionStorage.removeItem(LOCK_KEY);
  } catch {
    // The next save can ask again.
  }
}

export function summaryTimerKey(savedAt: string, summary: string) {
  let hash = 0;
  for (let index = 0; index < summary.length; index += 1) {
    hash = (Math.imul(hash, 31) + summary.charCodeAt(index)) >>> 0;
  }
  return `${savedAt}|${hash}|formula2`;
}

export function requestEstimate(
  session: LearnSession,
  summary: string,
  unfamiliarCount: number,
  key: string,
  force = false,
) {
  if (!force && inFlightFor === key) return;
  if (!force && snapshot.savedAt === key && snapshot.status !== "hidden") return;

  const age = force ? null : lockAge(key);
  if (age != null && age < LOCK_MS) {
    publish({
      ...HIDDEN,
      status: "loading",
      savedAt: key,
    });
    window.clearTimeout(waitId);
    waitId = window.setTimeout(() => {
      if (snapshot.status === "loading" && snapshot.savedAt === key) {
        requestEstimate(session, summary, unfamiliarCount, key, true);
      }
    }, LOCK_MS - age);
    return;
  }

  writeLock(key);
  inFlightFor = key;
  const id = ++generation;
  publish({
    ...HIDDEN,
    status: "loading",
    savedAt: key,
  });

  void (async () => {
    try {
      const estimate = await fetchEstimate(session, summary, unfamiliarCount);
      if (id !== generation) return;
      clearLock(key);
      const seconds = estimate.estimated_minutes * 60;
      remember({
        status: "ready",
        error: "",
        savedAt: key,
        estimatedMinutes: estimate.estimated_minutes,
        reasoning: estimate.reasoning,
        plannedSeconds: seconds,
        remainingSeconds: seconds,
        running: false,
        endsAt: null,
        timeUp: false,
        stopped: false,
        storageWarning: "",
        controlled: session.hardcore === true,
      });
    } catch (error) {
      if (id !== generation) return;
      writeLock(key);
      publish({
        ...HIDDEN,
        status: "error",
        savedAt: key,
        error:
          error instanceof Error
            ? error.message
            : "Claude couldn't estimate a study time. Try again.",
      });
    } finally {
      if (inFlightFor === key) inFlightFor = "";
    }
  })();
}

async function fetchEstimate(
  session: LearnSession,
  summary: string,
  unfamiliarCount: number,
): Promise<{ estimated_minutes: number; reasoning: string }> {
  let response: Response;
  try {
    response = await fetch("/api/estimate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        objective: session.objective,
        summary,
        hardcore: session.hardcore === true,
        materialText: session.hardcore ? session.material.text : "",
        materialTitle: session.material.title || session.material.fileName,
        unfamiliarCount,
      }),
    });
  } catch {
    throw new Error("We couldn't reach Learn Quick. Make sure the app is running, then try again.");
  }

  const payload = (await response.json().catch(() => null)) as { error?: string; hardcore?: unknown } | null;
  const difficulty = parseDifficulty(payload);
  if (!response.ok || !difficulty) {
    throw new Error(payload?.error || "Claude couldn't rate how hard this summary is. Try again.");
  }
  if (session.hardcore === true) {
    if (!isHardcoreSnapshot(payload?.hardcore)) {
      throw new Error("The hardcore timer didn't start. Try again.");
    }
    noteHardcoreResult(payload.hardcore);
  }
  const parts = calculateStudyTime({
    summaryWords: wordCount(summary),
    unfamiliarCount,
    difficulty: difficulty.difficulty,
  });
  return {
    estimated_minutes: parts.minutes,
    reasoning: explainStudyTime(parts, difficulty.reasoning),
  };
}

export function startTimer() {
  if (snapshot.stopped || snapshot.controlled || snapshot.status !== "ready" || snapshot.running) return;
  const remaining = liveRemaining(snapshot);
  if (remaining <= 0) return;
  remember({
    ...snapshot,
    remainingSeconds: remaining,
    running: true,
    endsAt: Date.now() + remaining * 1000,
    timeUp: false,
  });
}

export function pauseTimer() {
  if (snapshot.stopped || snapshot.controlled || snapshot.status !== "ready" || !snapshot.running) return;
  const remaining = liveRemaining(snapshot);
  remember({
    ...snapshot,
    remainingSeconds: remaining,
    running: false,
    endsAt: null,
    timeUp: remaining <= 0,
  });
}

export function resetTimer() {
  if (snapshot.stopped || snapshot.controlled || snapshot.status !== "ready") return;
  const seconds = snapshot.estimatedMinutes * 60;
  remember({
    ...snapshot,
    plannedSeconds: seconds,
    remainingSeconds: seconds,
    running: false,
    endsAt: null,
    timeUp: false,
  });
}

export function adjustTimer(deltaMinutes: number) {
  if (snapshot.stopped || snapshot.controlled || snapshot.status !== "ready") return;
  const remaining = liveRemaining(snapshot);
  const nextRemaining = Math.min(MAX_SECONDS, Math.max(0, remaining + deltaMinutes * 60));
  const planned = Math.max(nextRemaining, snapshot.plannedSeconds + deltaMinutes * 60);
  const running = snapshot.running && nextRemaining > 0;
  remember({
    ...snapshot,
    remainingSeconds: nextRemaining,
    plannedSeconds: planned,
    running,
    endsAt: running ? Date.now() + nextRemaining * 1000 : null,
    timeUp: nextRemaining <= 0,
  });
}

export function addTenMinutes() {
  if (snapshot.stopped || snapshot.controlled || snapshot.status !== "ready") return;
  const remaining = Math.min(MAX_SECONDS, liveRemaining(snapshot) + 10 * 60);
  remember({
    ...snapshot,
    remainingSeconds: remaining,
    plannedSeconds: remaining,
    running: true,
    endsAt: Date.now() + remaining * 1000,
    timeUp: false,
  });
}

export function stopTimer() {
  if (snapshot.status !== "ready" || snapshot.stopped) return;
  const remaining = liveRemaining(snapshot);
  remember({
    ...snapshot,
    remainingSeconds: remaining,
    running: false,
    endsAt: null,
    timeUp: false,
    stopped: true,
  });
}

export function finishUp() {
  if (snapshot.stopped || snapshot.status !== "ready") return;
  remember({
    ...snapshot,
    remainingSeconds: 0,
    running: false,
    endsAt: null,
    timeUp: false,
  });
}

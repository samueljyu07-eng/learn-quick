"use client";

import { useSyncExternalStore } from "react";

import { parseLearningResult, type LearningResult } from "@/lib/learning-result";
import type { LearnSession } from "@/lib/types";

const STORAGE_KEY = "learn-quick-learning";
const LOCK_KEY = "learn-quick-learning-lock";
const LOCK_MS = 15_000;

export type LearningView = {
  status: "hidden" | "loading" | "error" | "ready";
  error: string;
  savedAt: string;
  contextExtra: string;
  result: LearningResult | null;
};

const HIDDEN: LearningView = {
  status: "hidden",
  error: "",
  savedAt: "",
  contextExtra: "",
  result: null,
};

const listeners = new Set<() => void>();
let snapshot: LearningView = HIDDEN;
let loaded = false;
let generation = 0;
let inFlightFor = "";
let waitId = 0;

function notify() {
  for (const listener of listeners) listener();
}

function publish(next: LearningView) {
  snapshot = next;
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  loadFromStorage();
  return () => {
    listeners.delete(listener);
  };
}

function getClientSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return HIDDEN;
}

export function useLearning() {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}

function flightKey(savedAt: string, contextExtra: string) {
  return `${savedAt}|${contextExtra}`;
}

function readCache(): { savedAt: string; contextExtra: string; result: LearningResult } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as { savedAt?: unknown; contextExtra?: unknown; result?: unknown };
    const result = parseLearningResult(record.result);
    if (typeof record.savedAt !== "string" || !record.savedAt || !result) return null;
    return {
      savedAt: record.savedAt,
      contextExtra: typeof record.contextExtra === "string" ? record.contextExtra : "",
      result,
    };
  } catch {
    return null;
  }
}

function writeCache(savedAt: string, contextExtra: string, result: LearningResult) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ savedAt, contextExtra, result }));
  } catch {
    // The summary still shows for this visit.
  }
}

function loadFromStorage() {
  if (loaded) return;
  loaded = true;
  const cached = readCache();
  if (!cached) return;
  snapshot = {
    status: "ready",
    error: "",
    savedAt: cached.savedAt,
    contextExtra: cached.contextExtra,
    result: cached.result,
  };
}

function lockAge(key: string) {
  try {
    const raw = sessionStorage.getItem(LOCK_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as { key?: unknown; at?: unknown };
    if (record.key !== key || typeof record.at !== "number") return null;
    return Date.now() - record.at;
  } catch {
    return null;
  }
}

function writeLock(key: string) {
  try {
    sessionStorage.setItem(LOCK_KEY, JSON.stringify({ key, at: Date.now() }));
  } catch {
    // A missing lock only means a refresh could ask twice.
  }
}

function clearLock(key: string) {
  try {
    const age = lockAge(key);
    if (age != null) sessionStorage.removeItem(LOCK_KEY);
  } catch {
    // The next save can ask again.
  }
}

export function clearLearning() {
  generation += 1;
  inFlightFor = "";
  window.clearTimeout(waitId);
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(LOCK_KEY);
  } catch {
    // Memory is already cleared below.
  }
  publish(HIDDEN);
}

export function requestLearning(session: LearnSession, contextExtra: string, force = false) {
  const extra = contextExtra.trim().slice(0, 2_000);
  const key = flightKey(session.savedAt, extra);

  if (!force) {
    const cached = readCache();
    if (cached && cached.savedAt === session.savedAt && cached.contextExtra === extra) {
      publish({
        status: "ready",
        error: "",
        savedAt: session.savedAt,
        contextExtra: extra,
        result: cached.result,
      });
      return;
    }
  }

  if (!force && inFlightFor === key) return;
  if (
    !force &&
    snapshot.savedAt === session.savedAt &&
    snapshot.contextExtra === extra &&
    snapshot.status !== "hidden"
  ) {
    return;
  }

  const age = force ? null : lockAge(key);
  if (age != null && age < LOCK_MS) {
    publish({
      ...snapshot,
      status: "loading",
      error: "",
      savedAt: session.savedAt,
      contextExtra: extra,
      result: snapshot.savedAt === session.savedAt ? snapshot.result : null,
    });
    window.clearTimeout(waitId);
    waitId = window.setTimeout(() => {
      if (snapshot.status === "loading" && flightKey(snapshot.savedAt, snapshot.contextExtra) === key) {
        requestLearning(session, extra, true);
      }
    }, LOCK_MS - age);
    return;
  }

  writeLock(key);
  inFlightFor = key;
  const id = ++generation;
  publish({
    ...snapshot,
    status: "loading",
    error: "",
    savedAt: session.savedAt,
    contextExtra: extra,
    result: snapshot.savedAt === session.savedAt ? snapshot.result : null,
  });

  void (async () => {
    try {
      const result = await fetchLearning(session, extra);
      if (id !== generation) return;
      clearLock(key);
      writeCache(session.savedAt, extra, result);
      publish({
        status: "ready",
        error: "",
        savedAt: session.savedAt,
        contextExtra: extra,
        result,
      });
    } catch (error) {
      if (id !== generation) return;
      writeLock(key);
      publish({
        ...snapshot,
        status: "error",
        savedAt: session.savedAt,
        contextExtra: extra,
        result: snapshot.savedAt === session.savedAt ? snapshot.result : null,
        error: error instanceof Error ? error.message : "Claude couldn't write the summary. Try again.",
      });
    } finally {
      if (inFlightFor === key) inFlightFor = "";
    }
  })();
}

async function fetchLearning(session: LearnSession, contextExtra: string): Promise<LearningResult> {
  let response: Response;
  try {
    response = await fetch("/api/learning", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        objective: session.objective,
        material: { text: session.material.text },
        contextExtra,
      }),
    });
  } catch {
    throw new Error("We couldn't reach Learn Quick. Make sure the app is running, then try again.");
  }

  const payload = (await response.json().catch(() => null)) as (LearningResult & { error?: string }) | null;
  const result = parseLearningResult(payload);
  if (!response.ok || !result) {
    throw new Error(payload?.error || "Claude couldn't write the summary. Try again.");
  }
  return result;
}

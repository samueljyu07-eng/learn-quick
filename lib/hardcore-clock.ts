"use client";

import { useSyncExternalStore } from "react";

import { isHardcoreSnapshot, type HardcoreSnapshot } from "@/lib/hardcore-types";

export type HardcoreClock = {
  phase: "idle" | "loading" | "ready" | "error";
  error: string;
  snapshot: HardcoreSnapshot | null;
  remainingSeconds: number | null;
};

const IDLE: HardcoreClock = {
  phase: "idle",
  error: "",
  snapshot: null,
  remainingSeconds: null,
};

const listeners = new Set<() => void>();
let snapshot: HardcoreClock = IDLE;
let offset = 0;
let watching = "";
let pollId = 0;
let tickId = 0;
let requestId = 0;

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function remainingFrom(deadlineAt: number, offset: number) {
  return Math.max(0, Math.round((deadlineAt - (Date.now() + offset)) / 1000));
}

export function useHardcoreClock() {
  return useSyncExternalStore(subscribe, () => snapshot, () => IDLE);
}

export function noteHardcoreResult(value: HardcoreSnapshot | null) {
  if (!value) return;
  offset = value.serverNow - Date.now();
  snapshot = {
    phase: "ready",
    error: "",
    snapshot: value,
    remainingSeconds: value.deadlineAt == null ? null : remainingFrom(value.deadlineAt, offset),
  };
  notify();
}

export function watchHardcore(text: string | null) {
  const next = text?.trim() ?? "";
  if (next === watching) return;
  watching = next;
  if (!next) {
    stop();
    snapshot = IDLE;
    notify();
    return;
  }
  if (snapshot.phase === "idle") {
    snapshot = { ...IDLE, phase: "loading" };
    notify();
  }
  void refresh();
  if (!pollId) pollId = window.setInterval(() => void refresh(), 10_000);
  if (!tickId) tickId = window.setInterval(tick, 250);
}

async function refresh() {
  const text = watching;
  if (!text) return;
  const id = ++requestId;
  try {
    const response = await fetch("/api/hardcore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "status", text }),
    });
    const payload = (await response.json().catch(() => null)) as { hardcore?: unknown; error?: string } | null;
    if (id !== requestId || text !== watching) return;
    if (!response.ok || !isHardcoreSnapshot(payload?.hardcore)) {
      throw new Error(payload?.error || "The hardcore timer couldn't be checked. Try again.");
    }
    if (payload.hardcore.status === "none" && snapshot.snapshot && snapshot.snapshot.status !== "none") return;
    noteHardcoreResult(payload.hardcore);
  } catch (error) {
    if (id !== requestId || text !== watching) return;
    snapshot = {
      ...snapshot,
      phase: "error",
      error: error instanceof Error ? error.message : "The hardcore timer couldn't be checked. Try again.",
    };
    notify();
  }
}

function tick() {
  const current = snapshot.snapshot;
  if (!current || current.status !== "open" || current.deadlineAt == null) return;
  const remaining = remainingFrom(current.deadlineAt, offset);
  if (remaining === snapshot.remainingSeconds) return;
  snapshot = { ...snapshot, remainingSeconds: remaining };
  notify();
  if (remaining === 0) void refresh();
}

function stop() {
  window.clearInterval(pollId);
  window.clearInterval(tickId);
  pollId = 0;
  tickId = 0;
  requestId += 1;
}

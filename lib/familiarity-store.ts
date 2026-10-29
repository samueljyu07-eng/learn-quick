"use client";

import { useSyncExternalStore } from "react";

import { currentLibraryTerms } from "@/lib/library-store";
import { loadDefinitions } from "@/lib/load-definitions";
import { hashMaterial } from "@/lib/material-hash";
import { knownTermNames } from "@/lib/term-match";
import type { LearnSession } from "@/lib/types";

const STORAGE_KEY = "learn-quick-familiarity";

export type FamiliarityRecord = {
  materialHash: string;
  familiarity: number;
  unfamiliarCount: number;
  total: number;
  knownTerms: string[];
};

type Snapshot = {
  records: Record<string, FamiliarityRecord>;
  pendingHash: string;
  errorHash: string;
  error: string;
};

const EMPTY: Snapshot = { records: {}, pendingHash: "", errorHash: "", error: "" };
const listeners = new Set<() => void>();
let snapshot: Snapshot = EMPTY;
let loaded = false;
const inflight = new Map<string, Promise<FamiliarityRecord>>();
const sessionInflight = new Map<string, Promise<FamiliarityRecord>>();

function notify() {
  for (const listener of listeners) listener();
}

function publish(next: Snapshot) {
  snapshot = next;
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  load();
  return () => listeners.delete(listener);
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    const records: Record<string, FamiliarityRecord> = {};
    for (const [hash, value] of Object.entries(parsed)) {
      if (isRecord(value) && value.materialHash === hash) records[hash] = value;
    }
    snapshot = { ...snapshot, records };
  } catch {
    // A bad cache just means we compare the terms again.
  }
}

function isRecord(value: unknown): value is FamiliarityRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as FamiliarityRecord;
  return (
    typeof record.materialHash === "string" &&
    typeof record.familiarity === "number" &&
    typeof record.unfamiliarCount === "number" &&
    typeof record.total === "number" &&
    Array.isArray(record.knownTerms)
  );
}

function remember(record: FamiliarityRecord) {
  const records = { ...snapshot.records, [record.materialHash]: record };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // The score still applies for this visit.
  }
  publish({ records, pendingHash: "", errorHash: "", error: "" });
}

export function useFamiliarity(materialHash: string) {
  const current = useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
  return {
    record: materialHash ? (current.records[materialHash] ?? null) : null,
    loading: Boolean(materialHash) && current.pendingHash === materialHash,
    error: current.errorHash === materialHash ? current.error : "",
  };
}

export function ensureFamiliarity(session: LearnSession) {
  const current = sessionInflight.get(session.savedAt);
  if (current) return current;
  const job = hashMaterial(session.material.text)
    .then((hash) => {
      load();
      const existing = snapshot.records[hash];
      if (existing) return existing;
      const pending = inflight.get(hash);
      if (pending) return pending;
      const next = scoreMaterial(session, hash).finally(() => inflight.delete(hash));
      inflight.set(hash, next);
      return next;
    })
    .finally(() => {
      sessionInflight.delete(session.savedAt);
    });
  sessionInflight.set(session.savedAt, job);
  return job;
}

async function scoreMaterial(session: LearnSession, hash: string): Promise<FamiliarityRecord> {
  publish({ ...snapshot, pendingHash: hash, errorHash: "", error: "" });
  try {
    const terms = await loadDefinitions(session);
    const names = terms.map((item) => item.term);
    const library = currentLibraryTerms();
    const known = knownTermNames(names, library);
    const unmatched = names.filter((name) => !known.has(name));
    if (unmatched.length > 0 && library.length > 0) {
      const near = await nearMatches(unmatched, library);
      for (const name of near) known.add(name);
    }
    const total = names.length;
    const unfamiliarCount = Math.max(0, total - known.size);
    const record: FamiliarityRecord = {
      materialHash: hash,
      familiarity: total === 0 ? 1 : known.size / total,
      unfamiliarCount,
      total,
      knownTerms: [...known],
    };
    remember(record);
    return record;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Learn Quick couldn't compare your saved terms. Try again.";
    publish({ ...snapshot, pendingHash: "", errorHash: hash, error: message });
    throw error;
  }
}

async function nearMatches(candidates: string[], libraryTerms: string[]) {
  let response: Response;
  try {
    response = await fetch("/api/familiarity", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        candidates,
        libraryTerms: libraryTerms.slice(0, 80),
      }),
    });
  } catch {
    return [];
  }
  const payload = (await response.json().catch(() => null)) as { known_terms?: unknown } | null;
  if (!response.ok || !payload || !Array.isArray(payload.known_terms)) return [];
  const allowed = new Set(candidates);
  return payload.known_terms.filter((item): item is string => typeof item === "string" && allowed.has(item));
}

"use client";

import { useSyncExternalStore } from "react";

import { isKeyTerm, type KeyTerm } from "@/lib/definition-result";

const STORAGE_KEY = "learn-quick-definition-cache";

const listeners = new Set<() => void>();
const memory = new Map<string, KeyTerm[]>();
let loaded = false;
let snapshotKey = "";
let snapshotTerms: KeyTerm[] | null = null;

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function loadAll() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    for (const [key, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue;
      const terms = value.filter(isKeyTerm);
      if (terms.length > 0) memory.set(key, terms);
    }
  } catch {
    // A bad cache just means we ask Claude again.
  }
}

function persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(memory)));
  } catch {
    // The list still shows for this visit.
  }
}

export function readCachedTerms(key: string): KeyTerm[] | null {
  if (!key || typeof window === "undefined") return null;
  loadAll();
  const terms = memory.get(key) ?? null;
  if (key === snapshotKey && terms === snapshotTerms) return snapshotTerms;
  snapshotKey = key;
  snapshotTerms = terms;
  return snapshotTerms;
}

export function saveCachedTerms(key: string, terms: KeyTerm[]) {
  loadAll();
  memory.set(key, terms);
  if (key === snapshotKey) snapshotTerms = terms;
  persist();
  notify();
}

export function clearCachedTerms(key: string) {
  loadAll();
  memory.delete(key);
  if (key === snapshotKey) snapshotTerms = null;
  persist();
  notify();
}

export function useCachedTerms(key: string): KeyTerm[] | null {
  return useSyncExternalStore(subscribe, () => readCachedTerms(key), () => null);
}

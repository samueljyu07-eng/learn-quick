"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "learn-quick-library";

export type SavedDefinition = {
  id: string;
  term: string;
  definition: string;
  source: string;
  addedAt: string;
};

const listeners = new Set<() => void>();
const EMPTY: SavedDefinition[] = [];
let cachedRaw: string | null | undefined;
let cachedItems: SavedDefinition[] = [];
let memoryOnly: SavedDefinition[] | null = null;
let warningSnapshot = "";

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isSavedDefinition(value: unknown): value is SavedDefinition {
  if (!value || typeof value !== "object") return false;
  const item = value as SavedDefinition;
  return (
    typeof item.id === "string" &&
    typeof item.term === "string" &&
    item.term.trim().length > 0 &&
    typeof item.definition === "string" &&
    item.definition.trim().length > 0 &&
    typeof item.source === "string" &&
    typeof item.addedAt === "string"
  );
}

function readItems(): SavedDefinition[] {
  if (memoryOnly) return memoryOnly;
  if (typeof window === "undefined") return EMPTY;

  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return cachedItems;
  }

  if (raw === cachedRaw) return cachedItems;
  cachedRaw = raw;
  if (!raw) {
    cachedItems = [];
    return cachedItems;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    cachedItems = Array.isArray(parsed) ? parsed.filter(isSavedDefinition) : [];
  } catch {
    cachedItems = [];
  }
  return cachedItems;
}

function readWarning() {
  return warningSnapshot;
}

function writeItems(next: SavedDefinition[]) {
  cachedItems = next;
  memoryOnly = null;
  try {
    const raw = JSON.stringify(next);
    localStorage.setItem(STORAGE_KEY, raw);
    cachedRaw = raw;
    warningSnapshot = "";
  } catch {
    memoryOnly = next;
    warningSnapshot = "Saved for this visit. This browser blocked longer storage, so a refresh may clear My definitions.";
  }
  notify();
}

function sameTerm(item: SavedDefinition, term: string, source: string) {
  return item.term.trim().toLocaleLowerCase() === term.trim().toLocaleLowerCase() && item.source === source;
}

export function librarySnapshot() {
  return readItems();
}

export function replaceLibrary(next: SavedDefinition[]) {
  writeItems(next.filter(isSavedDefinition));
}

export function subscribeLibrary(listener: () => void) {
  return subscribe(listener);
}

export function currentLibraryTerms() {
  return readItems().map((item) => item.term);
}

export function useLibrary() {
  const items = useSyncExternalStore(subscribe, readItems, () => EMPTY);
  const storageWarning = useSyncExternalStore(subscribe, readWarning, () => "");

  return {
    items,
    storageWarning,
    isUnderstood(term: string, source: string) {
      return items.some((item) => sameTerm(item, term, source));
    },
    toggle(term: string, definition: string, source: string) {
      const current = readItems();
      const existing = current.find((item) => sameTerm(item, term, source));
      if (existing) {
        writeItems(current.filter((item) => item.id !== existing.id));
        return;
      }
      writeItems([
        {
          id: crypto.randomUUID(),
          term: term.trim(),
          definition: definition.trim(),
          source,
          addedAt: new Date().toISOString(),
        },
        ...current,
      ]);
    },
    remove(id: string) {
      writeItems(readItems().filter((item) => item.id !== id));
    },
  };
}

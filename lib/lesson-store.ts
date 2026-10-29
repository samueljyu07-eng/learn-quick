"use client";

import { useSyncExternalStore } from "react";

import { MAX_SAVED_LESSONS, parseSavedLesson, type SavedLesson } from "@/lib/saved-lesson";

const STORAGE_KEY = "learn-quick-lessons";

const listeners = new Set<() => void>();
const EMPTY: SavedLesson[] = [];
let cachedRaw: string | null | undefined;
let cachedItems: SavedLesson[] = [];
let memoryOnly: SavedLesson[] | null = null;
let warningSnapshot = "";

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readItems(): SavedLesson[] {
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
    cachedItems = Array.isArray(parsed)
      ? parsed.map(parseSavedLesson).filter((item): item is SavedLesson => item !== null).slice(0, MAX_SAVED_LESSONS)
      : [];
  } catch {
    cachedItems = [];
  }
  return cachedItems;
}

function readWarning() {
  return warningSnapshot;
}

function writeItems(next: SavedLesson[]) {
  cachedItems = next.slice(0, MAX_SAVED_LESSONS);
  memoryOnly = null;
  try {
    const raw = JSON.stringify(cachedItems);
    localStorage.setItem(STORAGE_KEY, raw);
    cachedRaw = raw;
    warningSnapshot = "";
  } catch {
    memoryOnly = cachedItems;
    warningSnapshot = "Saved for this visit. This browser blocked longer storage, so a refresh may clear saved lessons.";
  }
  notify();
}

export function lessonSnapshot() {
  return readItems();
}

export function replaceLessons(next: SavedLesson[]) {
  writeItems(next.map(parseSavedLesson).filter((item): item is SavedLesson => item !== null));
}

export function subscribeLessons(listener: () => void) {
  return subscribe(listener);
}

export function saveLesson(input: Omit<SavedLesson, "id" | "addedAt">) {
  const current = readItems();
  const existing = current.find((item) => item.sessionSavedAt === input.sessionSavedAt);
  const draft = parseSavedLesson({
    ...input,
    id: existing?.id ?? crypto.randomUUID(),
    addedAt: new Date().toISOString(),
  });
  if (!draft) return null;
  const rest = current.filter((item) => item.id !== draft.id && item.sessionSavedAt !== draft.sessionSavedAt);
  writeItems([draft, ...rest]);
  return draft;
}

export function useLessons() {
  const items = useSyncExternalStore(subscribe, readItems, () => EMPTY);
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const storageWarning = useSyncExternalStore(subscribe, readWarning, () => "");

  return {
    items,
    ready,
    storageWarning,
    forSession(savedAt: string) {
      return items.find((item) => item.sessionSavedAt === savedAt) ?? null;
    },
    remove(id: string) {
      writeItems(readItems().filter((item) => item.id !== id));
    },
  };
}

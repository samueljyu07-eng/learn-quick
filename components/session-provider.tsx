"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";

import { isLearnSession, type LearnSession } from "@/lib/types";

const STORAGE_KEY = "learn-quick-session";

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedSession: LearnSession | null = null;
let memoryOnly: LearnSession | null = null;
let usingMemoryOnly = false;
let warningSnapshot = "";

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readSession(): LearnSession | null {
  if (usingMemoryOnly) return memoryOnly;
  if (typeof window === "undefined") return null;

  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return memoryOnly;
  }

  if (raw === cachedRaw) return cachedSession;
  cachedRaw = raw;
  if (!raw) {
    cachedSession = null;
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    cachedSession = isLearnSession(parsed) ? parsed : null;
  } catch {
    cachedSession = null;
  }
  return cachedSession;
}

function readWarning() {
  return warningSnapshot;
}

function saveSession(next: LearnSession) {
  const raw = JSON.stringify(next);
  try {
    sessionStorage.setItem(STORAGE_KEY, raw);
    usingMemoryOnly = false;
    memoryOnly = null;
    warningSnapshot = "";
    cachedRaw = raw;
    cachedSession = next;
  } catch {
    usingMemoryOnly = true;
    memoryOnly = next;
    warningSnapshot =
      "Saved for this visit. A refresh may clear it because the browser blocked extra storage.";
  }
  notify();
}

function clearSession() {
  usingMemoryOnly = false;
  memoryOnly = null;
  warningSnapshot = "";
  cachedRaw = null;
  cachedSession = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // The copy in memory is already cleared.
  }
  notify();
}

type SessionContextValue = {
  session: LearnSession | null;
  hydrated: boolean;
  storageWarning: string;
  saveSession: (session: LearnSession) => void;
  clearSession: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const session = useSyncExternalStore(subscribe, readSession, () => null);
  const storageWarning = useSyncExternalStore(subscribe, readWarning, () => "");

  const value = useMemo(
    () => ({ session, hydrated, storageWarning, saveSession, clearSession }),
    [session, hydrated, storageWarning],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return value;
}

"use client";

import { useEffect, useSyncExternalStore } from "react";

import { useSession } from "@/components/session-provider";

let draft: boolean | null = null;
const listeners = new Set<() => void>();

export function setHardcoreDraft(next: boolean | null) {
  if (draft === next) return;
  draft = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readDraft() {
  return draft;
}

export function HardcoreTheme() {
  const { session } = useSession();
  const checkbox = useSyncExternalStore(subscribe, readDraft, () => null);
  const hardcore = checkbox === null ? session?.hardcore === true : checkbox;

  useEffect(() => {
    document.documentElement.classList.toggle("hardcore", hardcore);
    return () => document.documentElement.classList.remove("hardcore");
  }, [hardcore]);

  return null;
}

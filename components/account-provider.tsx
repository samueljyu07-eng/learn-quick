"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { lessonSnapshot, replaceLessons, subscribeLessons } from "@/lib/lesson-store";
import { librarySnapshot, replaceLibrary, subscribeLibrary, type SavedDefinition } from "@/lib/library-store";
import { mergeLessons, type SavedLesson } from "@/lib/saved-lesson";

type AccountState = {
  ready: boolean;
  configured: boolean;
  trusted: boolean;
  email: string | null;
  userId: string | null;
  refresh: () => Promise<void>;
};

const EMPTY: AccountState = {
  ready: false,
  configured: false,
  trusted: false,
  email: null,
  userId: null,
  refresh: async () => undefined,
};

const AccountContext = createContext<AccountState>(EMPTY);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(EMPTY);

  async function refresh() {
    try {
      const response = await fetch("/api/account");
      const payload = (await response.json()) as Partial<AccountState>;
      setState((current) => ({
        ...current,
        ready: true,
        configured: payload.configured === true,
        trusted: payload.trusted === true,
        email: typeof payload.email === "string" ? payload.email : null,
        userId: typeof payload.userId === "string" ? payload.userId : null,
        refresh,
      }));
    } catch {
      setState((current) => ({ ...current, ready: true, refresh }));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!state.userId) return;
    let cancel = false;
    let hydrating = true;

    async function pull() {
      const response = await fetch("/api/library");
      const payload = (await response.json().catch(() => null)) as { items?: SavedDefinition[] } | null;
      if (cancel || !response.ok || !payload || !Array.isArray(payload.items)) return;
      const merged = mergeDefinitions(librarySnapshot(), payload.items);
      hydrating = true;
      replaceLibrary(merged);
      await fetch("/api/library", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: merged }),
      });
      hydrating = false;
    }

    void pull();
    const unsubscribe = subscribeLibrary(() => {
      if (hydrating || cancel) return;
      const items = librarySnapshot();
      void fetch("/api/library", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }),
      });
    });
    return () => {
      cancel = true;
      unsubscribe();
    };
  }, [state.userId]);

  useEffect(() => {
    if (!state.userId) return;
    let cancel = false;
    let hydrating = true;

    async function pull() {
      const response = await fetch("/api/lessons");
      const payload = (await response.json().catch(() => null)) as { items?: SavedLesson[] } | null;
      if (cancel || !response.ok || !payload || !Array.isArray(payload.items)) return;
      const merged = mergeLessons(lessonSnapshot(), payload.items);
      hydrating = true;
      replaceLessons(merged);
      await fetch("/api/lessons", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: merged }),
      });
      hydrating = false;
    }

    void pull();
    const unsubscribe = subscribeLessons(() => {
      if (hydrating || cancel) return;
      const items = lessonSnapshot();
      void fetch("/api/lessons", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }),
      });
    });
    return () => {
      cancel = true;
      unsubscribe();
    };
  }, [state.userId]);

  return <AccountContext.Provider value={{ ...state, refresh }}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  return useContext(AccountContext);
}

function mergeDefinitions(local: SavedDefinition[], remote: SavedDefinition[]) {
  const map = new Map<string, SavedDefinition>();
  for (const item of [...remote, ...local]) {
    const key = `${item.term.trim().toLocaleLowerCase()}\n${item.source}`;
    const existing = map.get(key);
    if (!existing || item.addedAt > existing.addedAt) map.set(key, item);
  }
  return [...map.values()].sort((left, right) => (left.addedAt < right.addedAt ? 1 : -1));
}

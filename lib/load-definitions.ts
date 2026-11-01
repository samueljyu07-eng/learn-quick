"use client";

import { definitionCacheKey, readCachedTerms, saveCachedTerms } from "@/lib/definition-cache";
import { parseDefinitionResult, type KeyTerm } from "@/lib/definition-result";
import type { LearnSession } from "@/lib/types";

const inflight = new Map<string, Promise<KeyTerm[]>>();

export function loadDefinitions(session: LearnSession) {
  const key = definitionCacheKey(session);
  const cached = readCachedTerms(key);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(key);
  if (pending) return pending;

  const job = fetchDefinitions(session)
    .then((terms) => {
      saveCachedTerms(key, terms);
      return terms;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, job);
  return job;
}

async function fetchDefinitions(session: LearnSession): Promise<KeyTerm[]> {
  let response: Response;
  try {
    response = await fetch("/api/definitions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        objective: session.objective,
        material: { text: session.material.text },
      }),
    });
  } catch {
    throw new Error("We couldn't reach Learn Quick. Make sure the app is running, then try again.");
  }

  const payload = (await response.json().catch(() => null)) as { terms?: unknown; error?: string } | null;
  const terms = parseDefinitionResult(payload);
  if (!response.ok || terms.length === 0) {
    throw new Error(payload?.error || "Claude couldn't make the definitions just now. Try again.");
  }
  return terms;
}

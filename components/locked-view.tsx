"use client";

import { useEffect, useState } from "react";

import { SiteHeader } from "@/components/site-header";

export function LockedView() {
  const [titles, setTitles] = useState<string[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;
    void fetch("/api/hardcore")
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { titles?: unknown; error?: string } | null;
        if (!response.ok || !payload || !Array.isArray(payload.titles)) {
          throw new Error(payload?.error || "The locked list couldn't be loaded. Try again.");
        }
        if (!ignore) setTitles(payload.titles.filter((title) => typeof title === "string"));
      })
      .catch((caught: unknown) => {
        if (ignore) return;
        setError(caught instanceof Error ? caught.message : "The locked list couldn't be loaded. Try again.");
      });
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div>
      <SiteHeader current="locked" />
      <header className="mb-8">
        <h1 className="font-serif text-3xl tracking-tight text-ink sm:text-4xl">Locked materials</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
          These are materials that were not passed in hardcore mode before the timer ended.
        </p>
      </header>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : titles === null ? (
        <p className="text-muted">Loading locked materials…</p>
      ) : titles.length === 0 ? (
        <p className="text-muted">No locked materials.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {titles.map((title, index) => (
            <li key={`${index}-${title}`} className="rounded-2xl border border-line bg-card px-4 py-3 text-ink">
              {title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

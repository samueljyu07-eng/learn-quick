"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { SiteHeader } from "@/components/site-header";
import { useLibrary } from "@/lib/library-store";

export function LibraryView() {
  const library = useLibrary();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const visible = useMemo(() => {
    if (!needle) return library.items;
    return library.items.filter((item) => {
      const haystack = `${item.term} ${item.definition} ${item.source}`.toLocaleLowerCase();
      return haystack.includes(needle);
    });
  }, [library.items, needle]);

  return (
    <div>
      <SiteHeader current="library" />
      <header className="mb-8">
        <h1 className="font-serif text-3xl tracking-tight text-ink sm:text-4xl">My definitions</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
          Terms you mark as understood are kept in this browser, so you can search them later.
        </p>
      </header>

      {library.storageWarning ? (
        <p className="mb-4 rounded-lg bg-warn-bg px-3 py-2 text-sm leading-relaxed text-warn">
          {library.storageWarning}
        </p>
      ) : null}

      <label className="block text-sm font-semibold text-ink">
        Search
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by term, definition, or source"
          className="mt-1.5 w-full rounded-lg border border-line bg-card px-3 py-2 text-base text-ink placeholder:text-muted/80"
        />
      </label>

      {library.items.length === 0 ? (
        <section className="mt-6 rounded-2xl border border-line bg-card p-4 sm:p-6">
          <h2 className="font-serif text-2xl text-ink">Nothing saved yet</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Open the definitions step and check “I understand this” on a term. It will show up here.
          </p>
          <Link
            href="/definitions"
            className="mt-5 inline-block rounded-xl bg-accent px-5 py-3 font-semibold text-white"
          >
            Go to definitions
          </Link>
        </section>
      ) : visible.length === 0 ? (
        <p className="mt-6 text-sm leading-relaxed text-muted" role="status">
          No definitions match that search.
        </p>
      ) : (
        <>
        <p className="mt-6 text-sm text-muted">
          {visible.length} {visible.length === 1 ? "definition" : "definitions"}
        </p>
        <ul className="mt-4 flex flex-col gap-4">
          {visible.map((item) => (
            <li key={item.id} className="rounded-2xl border border-line bg-card p-4 sm:p-5">
              <h2 className="font-serif text-2xl text-ink">{item.term}</h2>
              <p className="mt-2 text-base leading-relaxed text-ink">{item.definition}</p>
              <p className="mt-3 text-sm text-muted">
                {item.source}
                {formatAdded(item.addedAt) ? ` · Added ${formatAdded(item.addedAt)}` : ""}
              </p>
              <button
                type="button"
                onClick={() => library.remove(item.id)}
                className="mt-4 text-sm font-semibold text-accent underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        </>
      )}
    </div>
  );
}

function formatAdded(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

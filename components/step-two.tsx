"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ProgressBar } from "@/components/progress-bar";
import { SiteHeader } from "@/components/site-header";
import { useSession } from "@/components/session-provider";
import { clearCachedTerms, definitionCacheKey, useCachedTerms } from "@/lib/definition-cache";
import type { KeyTerm } from "@/lib/definition-result";
import { useFamiliarity } from "@/lib/familiarity-store";
import { useLibrary } from "@/lib/library-store";
import { loadDefinitions } from "@/lib/load-definitions";
import { hashMaterial } from "@/lib/material-hash";
import { materialSourceLabel } from "@/lib/source-label";
import type { LearnSession } from "@/lib/types";

export function StepTwo() {
  const { session, hydrated } = useSession();
  const key = session ? definitionCacheKey(session) : "";
  const cached = useCachedTerms(key);
  const [materialHash, setMaterialHash] = useState("");
  const familiarity = useFamiliarity(materialHash);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const failed = error?.key === key ? error.message : "";
  const loading = Boolean(hydrated && session && !cached && !failed);

  useEffect(() => {
    if (!session || cached || failed) return;
    let ignore = false;
    const cacheKey = key;

    void (async () => {
      try {
        await loadDefinitions(session);
        if (ignore) return;
        setError(null);
      } catch (caught) {
        if (ignore) return;
        setError({
          key: cacheKey,
          message:
            caught instanceof Error
              ? caught.message
              : "Claude couldn't make the definitions just now. Try again.",
        });
      }
    })();

    return () => {
      ignore = true;
    };
  }, [session, cached, failed, key, attempt]);

  useEffect(() => {
    if (!session) return;
    let ignore = false;
    void hashMaterial(session.material.text).then((hash) => {
      if (!ignore) setMaterialHash(hash);
    });
    return () => {
      ignore = true;
    };
  }, [session]);

  function tryAgain() {
    if (!key) return;
    clearCachedTerms(key);
    setError(null);
    setAttempt((value) => value + 1);
  }

  return (
    <div>
      <SiteHeader />
      <header className="mb-8">
        <p className="text-sm font-semibold text-muted">Step 2 of 5</p>
        <h1 className="mt-1 font-serif text-3xl tracking-tight text-ink sm:text-4xl">
          Key terms, in plain language
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
          These definitions follow the objective you saved. Check the ones you understand. They stay
          in My definitions on this computer.
        </p>
      </header>
      <ProgressBar activeStep={2} completedThrough={session ? 1 : 0} stepTwoEnabled={Boolean(session)} />

      {!hydrated ? (
        <p className="text-muted">Loading your saved step…</p>
      ) : !session ? (
        <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
          <h2 className="font-serif text-2xl text-ink">Save step 1 first</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Definitions are written from your objective and your material. Add those, then come back.
          </p>
          <Link href="/" className="mt-5 inline-block rounded-xl bg-accent px-5 py-3 font-semibold text-white">
            Go to step 1
          </Link>
        </section>
      ) : (
        <DefinitionList
          session={session}
          terms={cached}
          loading={loading}
          error={failed}
          familiarityNote={familiarityNote(familiarity.record, familiarity.loading)}
          onTryAgain={tryAgain}
        />
      )}
    </div>
  );
}

function DefinitionList({
  session,
  terms,
  loading,
  error,
  familiarityNote,
  onTryAgain,
}: {
  session: LearnSession;
  terms: KeyTerm[] | null;
  loading: boolean;
  error: string;
  familiarityNote: string;
  onTryAgain: () => void;
}) {
  const library = useLibrary();
  const source = materialSourceLabel(session.material);
  const understoodCount = terms?.filter((item) => library.isUnderstood(item.term, source)).length ?? 0;

  return (
    <section aria-busy={loading}>
      <p className="text-sm text-muted">From {source}</p>
      {familiarityNote ? <p className="mt-2 text-sm leading-relaxed text-ink">{familiarityNote}</p> : null}
      {library.storageWarning ? (
        <p className="mt-3 rounded-lg bg-warn-bg px-3 py-2 text-sm leading-relaxed text-warn">
          {library.storageWarning}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-6 text-base text-muted" role="status">
          Finding the key terms…
        </p>
      ) : null}

      {error ? (
        <div className="mt-6 rounded-xl bg-danger-bg px-4 py-3 text-sm leading-relaxed text-danger" role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={onTryAgain}
            className="mt-3 rounded-xl bg-accent px-4 py-2 font-semibold text-white"
          >
            Try again
          </button>
        </div>
      ) : null}

      {terms ? (
        <>
          <p className="mt-4 text-sm text-muted">
            {understoodCount} of {terms.length} marked as understood
          </p>
          <ul className="mt-4 flex flex-col gap-4">
            {terms.map((item) => {
              const checked = library.isUnderstood(item.term, source);
              return (
                <li key={item.term} className="rounded-2xl border border-line bg-card p-4 sm:p-5">
                  <h2 className="font-serif text-2xl text-ink">{item.term}</h2>
                  <p className="mt-2 text-base leading-relaxed text-ink">{item.definition}</p>
                  <label className="mt-4 flex cursor-pointer items-center gap-3 text-sm font-semibold text-ink">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => library.toggle(item.term, item.definition, source)}
                    />
                    I understand this
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/explain" className="rounded-xl bg-accent px-5 py-3 text-center font-semibold text-white">
              Continue to the explanation
            </Link>
            <Link href="/library" className="rounded-xl border border-line bg-card px-5 py-3 text-center font-semibold text-ink">
              Review My definitions
            </Link>
            <button
              type="button"
              onClick={onTryAgain}
              className="rounded-xl border border-line bg-card px-5 py-3 font-semibold text-ink"
            >
              Find them again
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function familiarityNote(
  record: { total: number; unfamiliarCount: number } | null,
  loading: boolean,
) {
  if (record) {
    const known = record.total - record.unfamiliarCount;
    return `You already know ${known} of ${record.total} key terms. That includes close matches from My definitions.`;
  }
  if (loading) return "Comparing these terms with My definitions…";
  return "";
}

"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

import { useAccount } from "@/components/account-provider";
import { FloppyIcon } from "@/components/aero-icons";
import { LoadingProgress } from "@/components/loading-progress";
import { ProgressBar } from "@/components/progress-bar";
import { useSession } from "@/components/session-provider";
import { SiteHeader } from "@/components/site-header";
import { STUDY } from "@/config/study";
import { definitionCacheKey, useCachedTerms } from "@/lib/definition-cache";
import { saveLesson, useLessons } from "@/lib/lesson-store";
import { useLearning } from "@/lib/learning-store";
import { useLibrary } from "@/lib/library-store";
import { objectiveTitle } from "@/lib/objectives";
import { readSessionResult } from "@/lib/session-result";
import { materialSourceLabel } from "@/lib/source-label";

const REVIEW_KEY = "learn-quick-check-review";

type Review = { workOn: string; revisit: string[] };

export function CheckView() {
  const { session, hydrated } = useSession();
  const learning = useLearning();
  const library = useLibrary();
  const lessons = useLessons();
  const account = useAccount();
  const result = useSyncExternalStore(subscribeResults, readSessionResult, () => null);
  const scored = Boolean(session && result && result.savedAt === session.savedAt);
  const summary =
    session && learning.status === "ready" && learning.savedAt === session.savedAt ? learning.result?.summary ?? "" : "";
  const explanation =
    session && learning.status === "ready" && learning.savedAt === session.savedAt
      ? learning.result?.three_sentence_explanation ?? ""
      : "";
  const terms = useCachedTerms(session ? definitionCacheKey(session) : "");
  const saved = session ? lessons.forSession(session.savedAt) : null;
  const missed = scored && result ? result.problems.filter((problem) => problem.score < STUDY.passingScore) : [];
  const signature = scored && result ? result.problems.map((problem) => problem.score).join(",") : "";
  const [review, setReview] = useState<Review | null>(null);
  const [reviewFor, setReviewFor] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedTitle, setSavedTitle] = useState("");
  const reviewKey = `${session?.savedAt ?? ""}|${signature}|${summary.length}`;
  const readyReview = review && reviewFor === reviewKey ? review : null;
  const reviewLoading = Boolean(scored && missed.length > 0 && !readyReview && !reviewError);

  useEffect(() => {
    if (!session || !result || result.savedAt !== session.savedAt || !signature) return;
    const missedProblems = result.problems.filter((problem) => problem.score < STUDY.passingScore);
    if (missedProblems.length === 0) return;
    const key = `${session.savedAt}|${signature}|${summary.length}`;
    const cached = readReview(key);
    if (cached) {
      setReview(cached);
      setReviewFor(key);
      setReviewError("");
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/check", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            mode: "review",
            material: session.material.text,
            summary,
            objective: session.objective,
            problems: missedProblems,
          }),
        });
        const payload = (await response.json().catch(() => null)) as { workOn?: string; revisit?: string[]; error?: string } | null;
        if (!response.ok || !payload?.workOn) {
          throw new Error(payload?.error || "Claude couldn't review those problems. Try again.");
        }
        const next = {
          workOn: payload.workOn,
          revisit: Array.isArray(payload.revisit) ? payload.revisit.filter((item) => typeof item === "string") : [],
        };
        writeReview(key, next);
        setReview(next);
        setReviewFor(key);
        setReviewError("");
      } catch (caught) {
        if (controller.signal.aborted) return;
        setReviewError(caught instanceof Error ? caught.message : "Claude couldn't review those problems. Try again.");
      }
    })();
    return () => controller.abort();
  }, [session, result, signature, summary]);

  async function onSave() {
    if (!session || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "title",
          material: session.material.text,
          summary,
          objective: session.objective,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { title?: string; error?: string } | null;
      if (!response.ok || !payload?.title) {
        throw new Error(payload?.error || "Claude couldn't name this lesson. Try again.");
      }
      const source = materialSourceLabel(session.material);
      const lesson = saveLesson({
        title: payload.title,
        sessionSavedAt: session.savedAt,
        objective: session.objective,
        material: session.material,
        explanation,
        summary,
        terms: (terms ?? []).map((item) => ({
          term: item.term,
          definition: item.definition,
          understood: library.isUnderstood(item.term, source),
        })),
        score: scored && result ? { average: result.average, passed: result.passed, hardcore: result.hardcore } : null,
        problems: scored && result ? result.problems : [],
        workOn: readyReview?.workOn ?? "",
        revisit: readyReview?.revisit ?? [],
      });
      if (!lesson) throw new Error("This lesson couldn't be saved. Try again.");
      setSavedTitle(lesson.title);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "This lesson couldn't be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const shownTitle = savedTitle || saved?.title || "";

  return (
    <div>
      <SiteHeader />
      <header className="mb-8">
        <p className="text-sm font-semibold text-muted">Step 5 of 5</p>
        <h1 className="mt-1 font-serif text-3xl tracking-tight text-ink sm:text-4xl">Check</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
          A short recap of this session, what to practice from the questions you missed, and a place to save the lesson.
        </p>
      </header>
      <ProgressBar
        activeStep={5}
        completedThrough={session && saved ? 5 : scored ? 4 : session ? 1 : 0}
        stepTwoEnabled={Boolean(session)}
      />

      {!hydrated ? (
        <p className="text-muted">Loading your saved step…</p>
      ) : !session ? (
        <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
          <h2 className="font-serif text-2xl text-ink">Save step 1 first</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">Check uses the material from this study session.</p>
          <Link href="/" className="mt-5 inline-block rounded-xl bg-accent px-5 py-3 font-semibold text-white">
            Go to step 1
          </Link>
        </section>
      ) : (
        <div className="flex flex-col gap-6">
          <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
            <h2 className="font-serif text-2xl text-ink">This session</h2>
            <p className="mt-3 text-base leading-relaxed text-ink">{objectiveTitle(session.objective.kind)}</p>
            {session.objective.kind === "test" && session.objective.testTopic ? (
              <p className="mt-2 text-sm leading-relaxed text-muted">{session.objective.testTopic}</p>
            ) : null}
            {session.objective.kind === "apply" && session.objective.taskDescription ? (
              <p className="mt-2 text-sm leading-relaxed text-muted">{session.objective.taskDescription}</p>
            ) : null}
            <p className="mt-3 text-sm text-muted">{materialSourceLabel(session.material)}</p>
            {summary ? <p className="mt-4 text-base leading-relaxed text-ink">{summary}</p> : null}
            {scored && result ? (
              <p className="mt-4 text-base font-semibold text-ink">
                Score {result.average}. {result.passed ? "Passed." : "Not yet."}
              </p>
            ) : (
              <p className="mt-4 text-sm leading-relaxed text-muted">
                Submit the practice problems to see a score and what to revisit.{" "}
                <Link href="/practice" className="font-semibold text-accent underline">
                  Go to practice
                </Link>
              </p>
            )}
          </section>

          {scored && missed.length === 0 ? (
            <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
              <h2 className="font-serif text-2xl text-ink">What to work on</h2>
              <p className="mt-3 text-base leading-relaxed text-ink">You passed the practice problems. Nothing here needs another pass.</p>
            </section>
          ) : null}

          {missed.length > 0 ? (
            <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
              <h2 className="font-serif text-2xl text-ink">What to work on</h2>
              <ul className="mt-4 flex flex-col gap-3">
                {missed.map((problem) => (
                  <li key={problem.prompt} className="text-sm leading-relaxed text-ink">
                    <span className="font-semibold text-warn">{problem.score} / 100.</span> {problem.prompt}
                  </li>
                ))}
              </ul>
              {reviewLoading ? <LoadingProgress className="mt-5" label="Looking at the questions you missed…" /> : null}
              {reviewError ? <p className="mt-4 text-sm leading-relaxed text-warn">{reviewError}</p> : null}
              {readyReview ? (
                <>
                  <p className="mt-4 text-base leading-relaxed text-ink">{readyReview.workOn}</p>
                  {readyReview.revisit.length > 0 ? (
                    <>
                      <h3 className="mt-5 font-serif text-xl text-ink">Revisit</h3>
                      <ul className="mt-2 list-disc pl-5 text-sm leading-relaxed text-ink">
                        {readyReview.revisit.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
            <h2 className="font-serif text-2xl text-ink">Save lesson</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Claude names it with one short line for the idea of this material. The save keeps the objective, source,
              definitions, summary, and practice scores.
            </p>
            {saving ? <LoadingProgress className="mt-5" label="Naming this lesson…" /> : null}
            {saveError ? <p className="mt-4 text-sm leading-relaxed text-warn">{saveError}</p> : null}
            {shownTitle ? (
              <p className="mt-4 text-base leading-relaxed text-ink">
                Saved as “{shownTitle}”.{" "}
                {saved ? (
                  <Link href={`/lessons/${saved.id}`} className="font-semibold text-accent underline">
                    Open saved lesson
                  </Link>
                ) : null}
              </p>
            ) : null}
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 font-semibold text-white disabled:opacity-60"
            >
              <FloppyIcon />
              {saved ? "Save again" : "Save lesson"}
            </button>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {account.ready && account.userId
                ? "Kept in this browser and copied to your account."
                : "Kept in this browser. Sign in to copy it to your account."}
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

function subscribeResults(listener: () => void) {
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}

function readReview(key: string): Review | null {
  try {
    const raw = sessionStorage.getItem(REVIEW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key?: string; workOn?: string; revisit?: unknown };
    if (parsed.key !== key || typeof parsed.workOn !== "string" || !parsed.workOn) return null;
    return {
      workOn: parsed.workOn,
      revisit: Array.isArray(parsed.revisit) ? parsed.revisit.filter((item): item is string => typeof item === "string") : [],
    };
  } catch {
    return null;
  }
}

function writeReview(key: string, review: Review) {
  try {
    sessionStorage.setItem(REVIEW_KEY, JSON.stringify({ key, ...review }));
  } catch {
    // The check page still shows this copy for the current visit.
  }
}

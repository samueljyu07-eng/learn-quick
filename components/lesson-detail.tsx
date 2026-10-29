"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { SiteHeader } from "@/components/site-header";
import { useSession } from "@/components/session-provider";
import { useLessons } from "@/lib/lesson-store";
import { objectiveTitle } from "@/lib/objectives";
import type { SavedLesson } from "@/lib/saved-lesson";

export function LessonDetail({ id }: { id: string }) {
  const lessons = useLessons();
  const lesson = lessons.ready ? lessons.items.find((item) => item.id === id) ?? null : null;
  const { saveSession } = useSession();
  const router = useRouter();
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  async function studyAgain(item: SavedLesson) {
    if (starting) return;
    setStarting(true);
    setError("");
    try {
      const gate = await checkLock(item.material.text);
      if (gate.locked) throw new Error("This material is locked.");
      if (gate.active) throw new Error("Hardcore mode is already running for this material.");
      saveSession({
        objective: item.objective,
        material: item.material,
        savedAt: new Date().toISOString(),
        hardcore: false,
      });
      router.push("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This lesson couldn't be opened. Try again.");
      setStarting(false);
    }
  }

  return (
    <div>
      <SiteHeader />
      {!lessons.ready ? (
        <p className="text-muted">Loading this lesson…</p>
      ) : !lesson ? (
        <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
          <h1 className="font-serif text-2xl text-ink">That lesson isn’t here</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">It may have been removed from this browser.</p>
          <Link href="/lessons" className="mt-5 inline-block rounded-xl bg-accent px-5 py-3 font-semibold text-white">
            Saved lessons
          </Link>
        </section>
      ) : (
        <div className="flex flex-col gap-6">
          <header>
            <p className="text-sm font-semibold text-muted">Saved lesson</p>
            <h1 className="mt-1 font-serif text-3xl tracking-tight text-ink sm:text-4xl">{lesson.title}</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {objectiveTitle(lesson.objective.kind)}
              {lesson.score ? ` · Score ${lesson.score.average}. ${lesson.score.passed ? "Passed." : "Not yet."}` : ""}
            </p>
          </header>

          {lesson.workOn ? (
            <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
              <h2 className="font-serif text-2xl text-ink">What to work on</h2>
              <p className="mt-3 text-base leading-relaxed text-ink">{lesson.workOn}</p>
              {lesson.revisit.length > 0 ? (
                <>
                  <h3 className="mt-5 font-serif text-xl text-ink">Revisit</h3>
                  <ul className="mt-2 list-disc pl-5 text-sm leading-relaxed text-ink">
                    {lesson.revisit.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          ) : null}

          {lesson.summary ? (
            <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
              <h2 className="font-serif text-2xl text-ink">Summary</h2>
              <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-ink">{lesson.summary}</p>
            </section>
          ) : null}

          {lesson.explanation ? (
            <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
              <h2 className="font-serif text-2xl text-ink">Explanation</h2>
              <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-ink">{lesson.explanation}</p>
            </section>
          ) : null}

          {lesson.terms.length > 0 ? (
            <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
              <h2 className="font-serif text-2xl text-ink">Definitions</h2>
              <ul className="mt-4 flex flex-col gap-4">
                {lesson.terms.map((item) => (
                  <li key={item.term}>
                    <p className="font-semibold text-ink">
                      {item.term}
                      {item.understood ? <span className="ml-2 text-sm font-semibold text-accent">Understood</span> : null}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-ink">{item.definition}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {lesson.problems.length > 0 ? (
            <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
              <h2 className="font-serif text-2xl text-ink">Practice</h2>
              <ol className="mt-4 flex flex-col gap-4">
                {lesson.problems.map((problem, index) => (
                  <li key={`${index}-${problem.prompt}`}>
                    <p className="font-semibold text-ink">
                      {index + 1}. {problem.prompt}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-muted">
                      {problem.score} / 100. {problem.feedback}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <details className="rounded-2xl border border-line bg-card p-4 sm:p-6">
            <summary className="cursor-pointer font-serif text-2xl text-ink">Source</summary>
            <p className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-ink">
              {lesson.material.text}
            </p>
          </details>

          {error ? <p className="text-sm leading-relaxed text-warn">{error}</p> : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => studyAgain(lesson)}
              disabled={starting}
              className="rounded-xl bg-accent px-5 py-3 font-semibold text-white disabled:opacity-60"
            >
              Study again
            </button>
            <button
              type="button"
              onClick={() => {
                lessons.remove(lesson.id);
                router.push("/lessons");
              }}
              className="rounded-xl border border-line bg-card px-5 py-3 font-semibold text-ink"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

async function checkLock(text: string) {
  let response: Response;
  try {
    response = await fetch("/api/hardcore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "check", text }),
    });
  } catch {
    throw new Error("We couldn't check whether this material is locked. Make sure the app is running, then try again.");
  }
  const payload = (await response.json().catch(() => null)) as { locked?: boolean; active?: boolean; error?: string } | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.error || "We couldn't check whether this material is locked. Try again.");
  }
  return { locked: payload.locked === true, active: payload.active === true };
}

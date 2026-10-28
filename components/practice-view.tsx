"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

import { CodePad } from "@/components/code-pad";
import { ProgressBar } from "@/components/progress-bar";
import { useSession } from "@/components/session-provider";
import { SiteHeader } from "@/components/site-header";
import { STUDY } from "@/config/study";
import { noteHardcoreResult, useHardcoreClock } from "@/lib/hardcore-clock";
import { isHardcoreSnapshot } from "@/lib/hardcore-types";
import { outcomeFor, type LearningOutcome } from "@/lib/learning-result";
import { useLearning } from "@/lib/learning-store";
import { problemModule } from "@/lib/problems/registry";
import { parseProblemSet } from "@/lib/problems/parse";
import type { Problem, ProblemGrade, ProblemSet } from "@/lib/problems/types";

const CACHE_KEY = "learn-quick-problems";
const problemListeners = new Set<() => void>();
let problemMemory: { key: string; set: ProblemSet } | null = null;

function notifyProblems() {
  for (const listener of problemListeners) listener();
}

function useProblemSet(key: string) {
  return useSyncExternalStore(subscribeProblems, () => readStableSet(key), () => null);
}

function subscribeProblems(listener: () => void) {
  problemListeners.add(listener);
  return () => problemListeners.delete(listener);
}

function readStableSet(key: string) {
  if (!key) return null;
  if (problemMemory?.key === key) return problemMemory.set;
  const saved = readCache(key);
  if (!saved) return null;
  problemMemory = { key, set: saved };
  return problemMemory.set;
}

export function PracticeView() {
  const { session, hydrated } = useSession();
  const learning = useLearning();
  const summary =
    session && learning.status === "ready" && learning.savedAt === session.savedAt ? learning.result?.summary ?? "" : "";
  const outcome = session ? outcomeFor(session.objective.kind) : null;
  const cacheKey = session && outcome && summary ? `${session.savedAt}|${outcome}|${summary.length}` : "";
  const set = useProblemSet(cacheKey);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const loading = Boolean(cacheKey && !set && !error);

  useEffect(() => {
    if (!session || !cacheKey || !summary || !outcome || set) return;
    if (recentProblemLock(cacheKey)) {
      const timer = window.setTimeout(() => setAttempt((value) => value + 1), 5_000);
      return () => window.clearTimeout(timer);
    }
    writeProblemLock(cacheKey);
    const controller = new AbortController();
    let ignore = false;
    void fetch("/api/problems", {
      method: "POST",
      headers: { "content-type": "application/json" },
        body: JSON.stringify({
        objective: session.objective,
        summary,
        contextExtra: learning.contextExtra,
        hardcoreText: session.hardcore ? session.material.text : "",
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        const parsed = parseProblemSet(payload);
        if (!response.ok || !parsed || !problemModule(outcome).accept(parsed)) {
          throw new Error(payload?.error || "Claude's practice problems didn't match this goal. Try again.");
        }
        if (ignore) return;
        writeCache(cacheKey, parsed);
        clearProblemLock(cacheKey);
      })
      .catch((caught: unknown) => {
        if (ignore || (caught instanceof DOMException && caught.name === "AbortError")) return;
        setError(caught instanceof Error ? caught.message : "Claude couldn't write the problems. Try again.");
      });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [session, cacheKey, summary, outcome, learning.contextExtra, attempt, set]);

  useEffect(() => {
    if (!session?.hardcore || !set || !cacheKey) return;
    let ignore = false;
    void fetch("/api/hardcore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "status", text: session.material.text }),
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { hardcore?: unknown } | null;
        if (ignore || !response.ok || !isHardcoreSnapshot(payload?.hardcore)) return;
        if (payload.hardcore.problemsReady || payload.hardcore.status === "failed" || payload.hardcore.status === "passed") {
          return;
        }
        clearCache(cacheKey);
        setAttempt((value) => value + 1);
      })
      .catch(() => {
        // The practice set still shows. Scoring will say if it was not saved.
      });
    return () => {
      ignore = true;
    };
  }, [session, set, cacheKey]);

  const plan = outcome ? problemModule(outcome) : null;

  return (
    <div>
      <SiteHeader />
      <header className="mb-8">
        <p className="text-sm font-semibold text-muted">Practice</p>
        <h1 className="mt-1 font-serif text-3xl tracking-tight text-ink sm:text-4xl">
          {plan?.title ?? "Practice problems"}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
          A score of {STUDY.passingScore} or higher passes. The problems follow the goal you picked in step 1.
        </p>
        {session?.hardcore ? <HardcorePracticeNote /> : null}
      </header>
      <ProgressBar activeStep={4} completedThrough={session ? 3 : 0} stepTwoEnabled={Boolean(session)} />

      {!hydrated ? (
        <p className="text-muted">Loading your saved step…</p>
      ) : !session ? (
        <EmptyPractice />
      ) : !summary ? (
        <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
          <h2 className="font-serif text-2xl text-ink">The summary comes first</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Practice problems are written from your summary. Wait for it, then come back.
          </p>
          <Link href="/summary" className="mt-5 inline-block rounded-xl bg-accent px-5 py-3 font-semibold text-white">
            Go to the summary
          </Link>
        </section>
      ) : error ? (
        <section className="rounded-2xl border border-danger bg-danger-bg p-4" role="alert">
          <p className="text-sm leading-relaxed text-danger">{error}</p>
          <button
            type="button"
            onClick={() => {
              clearCache(cacheKey);
              setError("");
              setAttempt((value) => value + 1);
            }}
            className="mt-3 rounded-xl bg-accent px-5 py-3 font-semibold text-white"
          >
            Try again
          </button>
        </section>
      ) : loading || !set ? (
        <p className="text-muted" aria-live="polite">
          Writing practice problems…
        </p>
      ) : (
        <ProblemList
          set={set}
          summary={summary}
          outcome={outcome ?? "understand"}
          hardcoreText={session.hardcore ? session.material.text : ""}
        />
      )}
    </div>
  );
}

function HardcorePracticeNote() {
  const clock = useHardcoreClock();
  const state = clock.snapshot;
  if (state?.locked || state?.status === "failed") {
    return (
      <p className="mt-4 rounded-xl bg-danger-bg px-4 py-3 text-sm leading-relaxed text-danger" role="status">
        FAILED. This material is locked.
      </p>
    );
  }
  if (state?.status === "passed") {
    return (
      <p className="mt-4 rounded-xl bg-accent-soft px-4 py-3 text-sm leading-relaxed text-accent" role="status">
        Passed{state.average != null ? ` with an average of ${state.average}` : ""} before the timer ended.
      </p>
    );
  }
  return (
    <p className="mt-4 rounded-xl bg-warn-bg px-4 py-3 text-sm leading-relaxed text-warn">
      Hardcore mode. Finish every problem with an average of {STUDY.passingScore} or higher before the timer ends.
      {state && state.total > 0 ? ` ${state.done} of ${state.total} scored${state.average != null ? `, average ${state.average}` : ""}.` : ""}
    </p>
  );
}

function ProblemList({
  set,
  summary,
  outcome,
  hardcoreText,
}: {
  set: ProblemSet;
  summary: string;
  outcome: LearningOutcome;
  hardcoreText: string;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(set.problems.map((problem) => [problem.id, problem.starterCode])),
  );
  const [runs, setRuns] = useState<Record<string, string>>({});
  const [grades, setGrades] = useState<Record<string, ProblemGrade>>({});
  const [pendingId, setPendingId] = useState("");
  const [gradeError, setGradeError] = useState("");
  const clock = useHardcoreClock();
  const locked = Boolean(hardcoreText) && (clock.snapshot?.locked || clock.snapshot?.status === "failed");
  const scored = Object.values(grades);
  const average = scored.length ? Math.round(scored.reduce((sum, grade) => sum + grade.score, 0) / scored.length) : null;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm font-semibold text-accent">{problemModule(outcome).title}</p>
      {average !== null && !hardcoreText ? (
        <p className="text-sm text-muted">
          Average so far: {average}. {average >= STUDY.passingScore ? "That passes." : `${STUDY.passingScore} passes.`}
        </p>
      ) : null}
      {set.problems.map((problem, index) => (
        <ProblemCard
          key={problem.id}
          index={index}
          problem={problem}
          answer={answers[problem.id] ?? ""}
          grade={grades[problem.id] ?? null}
          pending={pendingId === problem.id}
          onAnswer={(value) => setAnswers((current) => ({ ...current, [problem.id]: value }))}
          onRunOutput={(output) => setRuns((current) => ({ ...current, [problem.id]: output }))}
          disabled={locked}
          onSubmit={() => {
            const answer = (answers[problem.id] ?? "").trim();
            if (!answer) {
              setGradeError("Write an answer before asking for a score.");
              return;
            }
            if (locked) {
              setGradeError("This material is locked.");
              return;
            }
            setGradeError("");
            if (problem.type === "multiple_choice" && !hardcoreText) {
              const correct = answer === problem.answer;
              setGrades((current) => ({
                ...current,
                [problem.id]: {
                  score: correct ? 100 : 0,
                  feedback: correct
                    ? "That's the choice supported by the summary."
                    : `Not quite. The summary points to: ${problem.answer}`,
                },
              }));
              return;
            }
            setPendingId(problem.id);
            const endpoint = problem.type === "multiple_choice" ? "/api/hardcore" : "/api/grade";
            const body =
              problem.type === "multiple_choice"
                ? { action: "answer", text: hardcoreText, problemId: problem.id, choice: answer }
                : {
                    type: problem.type,
                    prompt: problem.prompt,
                    rubric: problem.rubric,
                    response: answer,
                    summary,
                    runOutput: runs[problem.id] ?? "",
                    hardcoreText,
                    problemId: hardcoreText ? problem.id : "",
                  };
            void fetch(endpoint, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            })
              .then(async (response) => {
                const payload = (await response.json().catch(() => null)) as
                  | (ProblemGrade & { error?: string; hardcore?: unknown; hardcoreError?: string })
                  | null;
                if (!response.ok || !payload || typeof payload.score !== "number" || !payload.feedback) {
                  throw new Error(payload?.error || "That answer couldn't be scored. Try again.");
                }
                if (isHardcoreSnapshot(payload.hardcore)) noteHardcoreResult(payload.hardcore);
                if (payload.hardcoreError) setGradeError(payload.hardcoreError);
                setGrades((current) => ({
                  ...current,
                  [problem.id]: { score: payload.score, feedback: payload.feedback },
                }));
              })
              .catch((caught: unknown) => {
                setGradeError(caught instanceof Error ? caught.message : "Claude couldn't score that answer. Try again.");
              })
              .finally(() => setPendingId(""));
          }}
        />
      ))}
      {gradeError ? (
        <p className="text-sm text-danger" role="alert">
          {gradeError}
        </p>
      ) : null}
    </div>
  );
}

function ProblemCard({
  index,
  problem,
  answer,
  grade,
  pending,
  onAnswer,
  onRunOutput,
  onSubmit,
  disabled,
}: {
  index: number;
  problem: Problem;
  answer: string;
  grade: ProblemGrade | null;
  pending: boolean;
  onAnswer: (value: string) => void;
  onRunOutput: (output: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  const passed = grade ? grade.score >= STUDY.passingScore : false;

  return (
    <article className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <h2 className="font-serif text-2xl text-ink">
        {index + 1}. {problem.prompt}
      </h2>
      <div className="mt-4">
        {problem.type === "multiple_choice" ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Choices</legend>
            {problem.choices.map((choice, choiceIndex) => (
              <label key={`${choiceIndex}-${choice}`} className="flex items-start gap-2 text-sm leading-relaxed">
                <input
                  type="radio"
                  name={problem.id}
                  checked={answer === choice}
                  onChange={() => onAnswer(choice)}
                  className="mt-1"
                />
                <span>{choice}</span>
              </label>
            ))}
          </fieldset>
        ) : null}
        {problem.type === "code" ? (
          <CodePad language={problem.language} value={answer} onChange={onAnswer} onRunOutput={onRunOutput} />
        ) : null}
        {problem.type !== "multiple_choice" && problem.type !== "code" ? (
          <textarea
            value={answer}
            onChange={(event) => onAnswer(event.target.value)}
            rows={problem.type === "deliverable" ? 10 : 5}
            className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-ink"
            placeholder={placeholderFor(problem.type)}
          />
        ) : null}
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={pending || disabled}
        className="mt-4 rounded-xl bg-accent px-5 py-3 font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Scoring…" : "Score this answer"}
      </button>
      {grade ? (
        <p className={`mt-3 text-sm leading-relaxed ${passed ? "text-accent" : "text-warn"}`} role="status">
          {grade.score} / 100. {passed ? "Passed." : "Not yet."} {grade.feedback}
        </p>
      ) : null}
    </article>
  );
}

function placeholderFor(type: Problem["type"]) {
  if (type === "describe") return "Do the exercise, then describe what you did.";
  if (type === "explain_back") return "Explain it in your own words.";
  if (type === "deliverable") return "Write the draft for your task.";
  return "Write a short answer.";
}

function EmptyPractice() {
  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
      <h2 className="font-serif text-2xl text-ink">Save step 1 first</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">Problems are written from your material and your goal.</p>
      <Link href="/" className="mt-5 inline-block rounded-xl bg-accent px-5 py-3 font-semibold text-white">
        Go to step 1
      </Link>
    </section>
  );
}

function recentProblemLock(key: string) {
  try {
    const raw = sessionStorage.getItem("learn-quick-problems-lock");
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { key?: string; at?: number };
    return parsed.key === key && typeof parsed.at === "number" && Date.now() - parsed.at < 20_000;
  } catch {
    return false;
  }
}

function writeProblemLock(key: string) {
  try {
    sessionStorage.setItem("learn-quick-problems-lock", JSON.stringify({ key, at: Date.now() }));
  } catch {
    // A missing lock only means a refresh could ask twice.
  }
}

function clearProblemLock(key: string) {
  try {
    const raw = sessionStorage.getItem("learn-quick-problems-lock");
    const parsed = raw ? (JSON.parse(raw) as { key?: string }) : null;
    if (!parsed || parsed.key === key) sessionStorage.removeItem("learn-quick-problems-lock");
  } catch {
    // The saved problems are what matter.
  }
}

function readCache(key: string): ProblemSet | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as { key?: unknown; set?: unknown };
    if (record.key !== key) return null;
    return parseProblemSet(record.set);
  } catch {
    return null;
  }
}

function writeCache(key: string, set: ProblemSet) {
  problemMemory = { key, set };
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ key, set }));
  } catch {
    // The problems still show for this visit.
  }
  notifyProblems();
}

function clearCache(key: string) {
  if (problemMemory?.key === key) problemMemory = null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as { key?: string }) : null;
    if (!parsed || parsed.key === key) sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // The next try can ask again.
  }
  notifyProblems();
}

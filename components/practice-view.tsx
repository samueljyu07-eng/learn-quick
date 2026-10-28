"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { CodePad } from "@/components/code-pad";
import { LoadingProgress } from "@/components/loading-progress";
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
import { saveSessionResult } from "@/lib/session-result";
import { stopTimer } from "@/lib/timer-store";

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
        <LoadingProgress label="Writing practice problems…" />
      ) : (
        <ProblemList
          set={set}
          summary={summary}
          outcome={outcome ?? "understand"}
          hardcoreText={session.hardcore ? session.material.text : ""}
          savedAt={session.savedAt}
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
  savedAt,
}: {
  set: ProblemSet;
  summary: string;
  outcome: LearningOutcome;
  hardcoreText: string;
  savedAt: string;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(set.problems.map((problem) => [problem.id, problem.starterCode])),
  );
  const [runs, setRuns] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [gradeError, setGradeError] = useState("");
  const clock = useHardcoreClock();
  const locked = Boolean(hardcoreText) && (clock.snapshot?.locked || clock.snapshot?.status === "failed");

  async function submitAll() {
    if (locked) {
      setGradeError("This material is locked.");
      return;
    }
    setSubmitting(true);
    setGradeError("");
    try {
      const graded: { prompt: string; score: number; feedback: string }[] = [];
      for (const problem of set.problems) {
        const grade = await scoreProblem(problem, {
          answer: (answers[problem.id] ?? "").trim(),
          summary,
          runOutput: runs[problem.id] ?? "",
          hardcoreText,
        });
        graded.push({ prompt: problem.prompt, score: grade.score, feedback: grade.feedback });
      }
      let hardcore: "off" | "passed" | "failed" = "off";
      if (hardcoreText) {
        hardcore = await finishHardcore(hardcoreText);
      }
      const average = graded.length
        ? Math.round(graded.reduce((sum, item) => sum + item.score, 0) / graded.length)
        : 0;
      saveSessionResult({
        savedAt,
        average,
        passed: average >= STUDY.passingScore,
        hardcore,
        problems: graded,
      });
      stopTimer();
      router.push("/results");
    } catch (caught) {
      setGradeError(caught instanceof Error ? caught.message : "Claude couldn't score those answers. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm font-semibold text-accent">{problemModule(outcome).title}</p>
      {set.problems.map((problem, index) => (
        <ProblemCard
          key={problem.id}
          index={index}
          problem={problem}
          answer={answers[problem.id] ?? ""}
          onAnswer={(value) => setAnswers((current) => ({ ...current, [problem.id]: value }))}
          onRunOutput={(output) => setRuns((current) => ({ ...current, [problem.id]: output }))}
          disabled={locked || submitting}
        />
      ))}
      {submitting ? <LoadingProgress label="Scoring your answers…" /> : null}
      {gradeError ? (
        <p className="text-sm text-danger" role="alert">
          {gradeError}
        </p>
      ) : null}
      <div>
        <button
          type="button"
          onClick={() => void submitAll()}
          disabled={submitting || locked}
          className="rounded-xl bg-accent px-5 py-3 font-semibold text-white disabled:opacity-60"
        >
          {submitting ? "Scoring…" : "Submit"}
        </button>
        <p className="mt-2 text-sm leading-relaxed text-muted">Blank answers score 0. Submit stops the timer.</p>
      </div>
    </div>
  );
}

function ProblemCard({
  index,
  problem,
  answer,
  onAnswer,
  onRunOutput,
  disabled,
}: {
  index: number;
  problem: Problem;
  answer: string;
  onAnswer: (value: string) => void;
  onRunOutput: (output: string) => void;
  disabled: boolean;
}) {
  return (
    <article className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <h2 className="font-serif text-2xl text-ink">
        {index + 1}. {problem.prompt}
      </h2>
      <div className="mt-4">
        {problem.type === "multiple_choice" ? (
          <fieldset className="flex flex-col gap-2" disabled={disabled}>
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
          <CodePad
            language={problem.language}
            value={answer}
            onChange={onAnswer}
            onRunOutput={onRunOutput}
            disabled={disabled}
          />
        ) : null}
        {problem.type !== "multiple_choice" && problem.type !== "code" ? (
          <textarea
            value={answer}
            onChange={(event) => onAnswer(event.target.value)}
            rows={problem.type === "deliverable" ? 10 : 5}
            disabled={disabled}
            className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-ink disabled:opacity-60"
            placeholder={placeholderFor(problem.type)}
          />
        ) : null}
      </div>
    </article>
  );
}

async function scoreProblem(
  problem: Problem,
  input: { answer: string; summary: string; runOutput: string; hardcoreText: string },
): Promise<ProblemGrade> {
  if (!input.answer) return { score: 0, feedback: "No answer." };
  if (problem.type === "multiple_choice" && !input.hardcoreText) {
    const correct = input.answer === problem.answer;
    return {
      score: correct ? 100 : 0,
      feedback: correct
        ? "That's the choice supported by the summary."
        : `Not quite. The summary points to: ${problem.answer}`,
    };
  }

  const endpoint = problem.type === "multiple_choice" ? "/api/hardcore" : "/api/grade";
  const body =
    problem.type === "multiple_choice"
      ? { action: "answer", text: input.hardcoreText, problemId: problem.id, choice: input.answer }
      : {
          type: problem.type,
          prompt: problem.prompt,
          rubric: problem.rubric,
          response: input.answer,
          summary: input.summary,
          runOutput: input.runOutput,
          hardcoreText: input.hardcoreText,
          problemId: input.hardcoreText ? problem.id : "",
        };
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("We couldn't reach Learn Quick. Make sure the app is running, then try again.");
  }
  const payload = (await response.json().catch(() => null)) as
    | (ProblemGrade & { error?: string; hardcore?: unknown; hardcoreError?: string })
    | null;
  if (!response.ok || !payload || typeof payload.score !== "number" || !payload.feedback) {
    throw new Error(payload?.error || "That answer couldn't be scored. Try again.");
  }
  if (isHardcoreSnapshot(payload.hardcore)) noteHardcoreResult(payload.hardcore);
  if (payload.hardcoreError) throw new Error(payload.hardcoreError);
  return { score: payload.score, feedback: payload.feedback };
}

async function finishHardcore(text: string): Promise<"passed" | "failed"> {
  let response: Response;
  try {
    response = await fetch("/api/hardcore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "finish", text }),
    });
  } catch {
    throw new Error("We couldn't finish hardcore mode. Make sure the app is running, then try again.");
  }
  const payload = (await response.json().catch(() => null)) as { error?: string; hardcore?: unknown } | null;
  if (isHardcoreSnapshot(payload?.hardcore)) noteHardcoreResult(payload.hardcore);
  if (!response.ok || !isHardcoreSnapshot(payload?.hardcore)) {
    throw new Error(payload?.error || "Hardcore mode couldn't be finished. Try again.");
  }
  return payload.hardcore.status === "passed" ? "passed" : "failed";
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

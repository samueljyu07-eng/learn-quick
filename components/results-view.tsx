"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { useAccount } from "@/components/account-provider";
import { ProgressBar } from "@/components/progress-bar";
import { useSession } from "@/components/session-provider";
import { SiteHeader } from "@/components/site-header";
import { STUDY } from "@/config/study";
import { ensureFamiliarity } from "@/lib/familiarity-store";
import { clearSessionResult, readSessionResult } from "@/lib/session-result";

export function ResultsView() {
  const { session, hydrated, clearSession } = useSession();
  const router = useRouter();
  const result = useSyncExternalStore(subscribeResults, readSessionResult, () => null);
  const matches = Boolean(session && result && result.savedAt === session.savedAt);

  function startOver() {
    clearSessionResult();
    clearSession();
    router.push("/");
  }

  return (
    <div>
      <SiteHeader />
      <header className="mb-8">
        <p className="text-sm font-semibold text-muted">End of session</p>
        <h1 className="mt-1 font-serif text-3xl tracking-tight text-ink sm:text-4xl">Your score</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
          {STUDY.passingScore} or higher passes. This is the end of this study session.
        </p>
      </header>
      <ProgressBar activeStep={0} completedThrough={matches ? 4 : session ? 3 : 0} stepTwoEnabled={Boolean(session)} />

      {!hydrated ? (
        <p className="text-muted">Loading your saved step…</p>
      ) : !matches || !result ? (
        <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
          <h2 className="font-serif text-2xl text-ink">No score yet</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Submit the practice problems to finish this session.
          </p>
          <Link href="/practice" className="mt-5 inline-block rounded-xl bg-accent px-5 py-3 font-semibold text-white">
            Go to practice
          </Link>
        </section>
      ) : (
        <div className="flex flex-col gap-6">
          <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
            <p className="text-sm font-semibold text-muted">Average</p>
            <p className="mt-1 font-serif text-5xl text-ink">{result.average}</p>
            <p className={`mt-2 text-base font-semibold ${result.passed ? "text-accent" : "text-warn"}`}>
              {result.passed ? "Passed." : "Not yet."}
            </p>
            {result.hardcore === "passed" ? (
              <p className="mt-3 text-sm leading-relaxed text-accent">Hardcore mode: you passed before the timer ended.</p>
            ) : null}
            {result.hardcore === "failed" ? (
              <p className="mt-3 text-sm leading-relaxed text-danger">Hardcore mode: this material is locked.</p>
            ) : null}
            <PointsLine passed={result.passed} savedAt={result.savedAt} />
          </section>
          <ol className="flex flex-col gap-4">
            {result.problems.map((problem, index) => {
              const passed = problem.score >= STUDY.passingScore;
              return (
                <li key={`${index}-${problem.prompt}`} className="rounded-2xl border border-line bg-card p-4 sm:p-5">
                  <h2 className="font-serif text-2xl text-ink">
                    {index + 1}. {problem.prompt}
                  </h2>
                  <p className={`mt-3 text-sm leading-relaxed ${passed ? "text-accent" : "text-warn"}`}>
                    {problem.score} / 100. {passed ? "Passed." : "Not yet."} {problem.feedback}
                  </p>
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap gap-3">
            <Link href="/check" className="rounded-xl bg-accent px-5 py-3 font-semibold text-white">
              Go to check
            </Link>
            <button
              type="button"
              onClick={startOver}
              className="rounded-xl border border-line bg-card px-5 py-3 font-semibold text-ink"
            >
              Start over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PointsLine({ passed, savedAt }: { passed: boolean; savedAt: string }) {
  const account = useAccount();
  const { session } = useSession();
  const [line, setLine] = useState("");

  useEffect(() => {
    if (!passed || !account.ready || !session || session.savedAt !== savedAt) return;
    if (!account.userId) {
      setLine("Sign in to keep points for this pass.");
      return;
    }
    let cancel = false;
    void (async () => {
      let familiarity = 1;
      try {
        familiarity = (await ensureFamiliarity(session)).familiarity;
      } catch {
        familiarity = 1;
      }
      let response: Response;
      try {
        response = await fetch("/api/points", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text: session.material.text,
            savedAt,
            passed: true,
            familiarity,
            day: new Date().toLocaleDateString("en-CA"),
          }),
        });
      } catch {
        if (!cancel) setLine("Points couldn't be saved. Try again.");
        return;
      }
      const payload = (await response.json().catch(() => null)) as {
        points?: number;
        error?: string;
        repeat?: boolean;
        capped?: boolean;
      } | null;
      if (cancel) return;
      if (!response.ok || !payload || typeof payload.points !== "number") {
        setLine(payload?.error || "Points couldn't be saved.");
        return;
      }
      if (payload.points === 0 && payload.capped) {
        setLine(`You reached today's ${STUDY.dailyPointCap} point cap.`);
        return;
      }
      setLine(payload.repeat ? `Repeat pass. You earned ${payload.points} points.` : `You earned ${payload.points} points.`);
    })();
    return () => {
      cancel = true;
    };
  }, [account.ready, account.userId, passed, savedAt, session]);

  if (!passed || !line) return null;
  return <p className="mt-3 text-sm leading-relaxed text-ink">{line}</p>;
}

function subscribeResults(listener: () => void) {
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}

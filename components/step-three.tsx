"use client";

import Link from "next/link";

import { ClarificationBox } from "@/components/clarification-box";
import { ProgressBar } from "@/components/progress-bar";
import { useSession } from "@/components/session-provider";
import { SiteHeader } from "@/components/site-header";
import { requestLearning, useLearning } from "@/lib/learning-store";

export function StepThree() {
  const { session, hydrated } = useSession();
  const learning = useLearning();
  const matches = Boolean(session && learning.savedAt === session.savedAt);
  const result = matches ? learning.result : null;
  const pending = matches && learning.status === "loading";

  return (
    <div>
      <SiteHeader />
      <header className="mb-8">
        <p className="text-sm font-semibold text-muted">Step 3 of 5</p>
        <h1 className="mt-1 font-serif text-3xl tracking-tight text-ink sm:text-4xl">The point, in three sentences</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
          This is a short explanation of your material, written for a beginner.
        </p>
      </header>
      <ProgressBar activeStep={3} completedThrough={session ? 2 : 0} stepTwoEnabled={Boolean(session)} />

      {!hydrated ? (
        <p className="text-muted">Loading your saved step…</p>
      ) : !session ? (
        <EmptyStep />
      ) : !result && learning.status === "error" ? (
        <ErrorNote
          message={learning.error}
          onRetry={() => requestLearning(session, learning.contextExtra, true)}
        />
      ) : !result ? (
        <p className="text-muted" aria-live="polite">
          Writing a short explanation and a summary…
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {pending ? (
            <p className="text-sm text-muted" aria-live="polite">
              Updating this with your answer…
            </p>
          ) : null}
          <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
            <h2 className="font-serif text-2xl text-ink">In three sentences</h2>
            <p className="mt-3 text-lg leading-relaxed text-ink">{result.three_sentence_explanation}</p>
          </section>
          {result.needs_clarification ? (
            <ClarificationBox
              session={session}
              question={result.needs_clarification}
              previous={learning.contextExtra}
              pending={pending}
            />
          ) : null}
          {matches && learning.status === "error" ? (
            <ErrorNote
              message={learning.error}
              onRetry={() => requestLearning(session, learning.contextExtra, true)}
            />
          ) : null}
          <Link href="/summary" className="inline-block w-fit rounded-xl bg-accent px-5 py-3 font-semibold text-white">
            Continue to the summary
          </Link>
        </div>
      )}
    </div>
  );
}

function EmptyStep() {
  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
      <h2 className="font-serif text-2xl text-ink">Save step 1 first</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        The explanation is written from your objective and your material. Add those, then come back.
      </p>
      <Link href="/" className="mt-5 inline-block rounded-xl bg-accent px-5 py-3 font-semibold text-white">
        Go to step 1
      </Link>
    </section>
  );
}

function ErrorNote({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="rounded-2xl border border-danger bg-danger-bg p-4" role="alert">
      <p className="text-sm leading-relaxed text-danger">{message}</p>
      <button type="button" onClick={onRetry} className="mt-3 rounded-xl bg-accent px-5 py-3 font-semibold text-white">
        Try again
      </button>
    </section>
  );
}

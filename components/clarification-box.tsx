"use client";

import { useState } from "react";

import { addContextAnswer } from "@/lib/learning-result";
import { requestLearning } from "@/lib/learning-store";
import type { LearnSession } from "@/lib/types";

export function ClarificationBox({
  session,
  question,
  previous,
  pending,
}: {
  session: LearnSession;
  question: string;
  previous: string;
  pending: boolean;
}) {
  const [answer, setAnswer] = useState("");
  const [localError, setLocalError] = useState("");

  return (
    <form
      className="rounded-2xl border border-warn bg-warn-bg p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = answer.trim();
        if (!trimmed) {
          setLocalError("Type an answer so Learn Quick knows what to focus on.");
          return;
        }
        setLocalError("");
        requestLearning(session, addContextAnswer(previous, trimmed), true);
        setAnswer("");
      }}
    >
      <label htmlFor="clarification" className="block font-semibold text-ink">
        {question}
      </label>
      <textarea
        id="clarification"
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        rows={4}
        maxLength={2_000}
        className="mt-3 w-full rounded-xl border border-line bg-card px-3 py-2 text-ink"
        placeholder="Your answer"
      />
      {localError ? (
        <p className="mt-2 text-sm text-danger" role="alert">
          {localError}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-3 rounded-xl bg-accent px-5 py-3 font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Updating…" : "Send this detail"}
      </button>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { useSession } from "@/components/session-provider";
import { useLearning } from "@/lib/learning-store";
import {
  addTenMinutes,
  adjustTimer,
  clearTimer,
  finishUp,
  pauseTimer,
  requestEstimate,
  resetTimer,
  startTimer,
  summaryTimerKey,
  useStudyTimer,
} from "@/lib/timer-store";

export function StudyTimer() {
  const { session, hydrated } = useSession();
  const timer = useStudyTimer();
  const learning = useLearning();
  const summary =
    session && learning.status === "ready" && learning.savedAt === session.savedAt
      ? (learning.result?.summary ?? "")
      : "";
  const key = session && summary ? summaryTimerKey(session.savedAt, summary) : "";

  useEffect(() => {
    if (!hydrated) return;
    if (!session) {
      clearTimer();
      return;
    }
    if (!summary || !key) return;
    if (timer.savedAt === key && timer.status !== "hidden") return;
    requestEstimate(session, summary, key);
  }, [hydrated, session, summary, key, timer.savedAt, timer.status]);

  if (!hydrated || !session) return null;

  if (!summary || timer.savedAt !== key || timer.status === "hidden") {
    return (
      <TimerShell>
        {summary ? (
          <LoadingCard />
        ) : learning.status === "error" && learning.savedAt === session.savedAt ? (
          <section className="w-56 rounded-2xl border border-line bg-card p-3 shadow-sm">
            <p className="text-sm leading-relaxed text-muted">Study time starts after your summary is ready.</p>
            <Link href="/explain" className="mt-2 inline-block text-sm font-semibold text-accent underline">
              Open the explanation
            </Link>
          </section>
        ) : (
          <LoadingCard message="Writing your summary before setting a study time…" />
        )}
      </TimerShell>
    );
  }

  return (
    <TimerShell>
      {timer.status === "loading" ? <LoadingCard /> : null}
      {timer.status === "error" ? (
        <ErrorCard
          message={timer.error}
          onRetry={() => {
            if (summary && key) requestEstimate(session, summary, key, true);
          }}
        />
      ) : null}
      {timer.status === "ready" ? <TimerCard /> : null}
    </TimerShell>
  );
}

function TimerShell({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="h-48 xl:hidden" aria-hidden="true" />
      <div className="fixed top-3 right-3 z-40 flex w-56 flex-col items-end gap-2">{children}</div>
    </>
  );
}

function LoadingCard({ message = "Estimating a study time…" }: { message?: string }) {
  return (
    <section className="w-44 rounded-2xl border border-line bg-card p-3 shadow-sm" aria-live="polite">
      <p className="text-sm leading-relaxed text-muted">{message}</p>
    </section>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="w-56 rounded-2xl border border-line bg-card p-3 shadow-sm" role="alert">
      <p className="text-sm leading-relaxed text-danger">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white"
      >
        Try again
      </button>
    </section>
  );
}

function TimerCard() {
  const timer = useStudyTimer();
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reasonHover, setReasonHover] = useState(false);
  const remaining = timer.remainingSeconds;
  const showReason = reasonOpen || reasonHover;
  const ratio = timer.plannedSeconds > 0 ? remaining / timer.plannedSeconds : 0;

  return (
    <>
      <section className="relative w-44 rounded-2xl border border-line bg-card p-3 shadow-sm">
        <div className="flex items-center gap-2" role="timer" aria-label={timerLabel(remaining, timer.running)}>
          <ProgressRing ratio={ratio} />
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">Study time</p>
            <p className="font-semibold text-xl tabular-nums text-ink">{formatTime(remaining)}</p>
          </div>
        </div>

        {timer.storageWarning ? (
          <p className="mt-2 text-xs leading-relaxed text-warn">{timer.storageWarning}</p>
        ) : null}

        <div className="mt-3 grid grid-cols-3 gap-1">
          <button
            type="button"
            onClick={startTimer}
            disabled={timer.running || remaining <= 0}
            className="rounded-lg bg-accent px-1 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            Start
          </button>
          <button
            type="button"
            onClick={pauseTimer}
            disabled={!timer.running}
            className="rounded-lg border border-line bg-card px-1 py-1.5 text-xs font-semibold text-ink disabled:opacity-40"
          >
            Pause
          </button>
          <button
            type="button"
            onClick={resetTimer}
            className="rounded-lg border border-line bg-card px-1 py-1.5 text-xs font-semibold text-ink"
          >
            Reset
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between gap-1">
          <span className="text-xs font-semibold text-muted">Adjust</span>
          <button
            type="button"
            onClick={() => adjustTimer(-5)}
            disabled={remaining <= 0}
            aria-label="Remove 5 minutes"
            className="rounded-lg border border-line bg-card px-2 py-1 text-xs font-semibold text-ink disabled:opacity-40"
          >
            −5
          </button>
          <button
            type="button"
            onClick={() => adjustTimer(5)}
            disabled={remaining >= 240 * 60}
            aria-label="Add 5 minutes"
            className="rounded-lg border border-line bg-card px-2 py-1 text-xs font-semibold text-ink disabled:opacity-40"
          >
            +5
          </button>
        </div>

        <div
          className="relative mt-2"
          onMouseEnter={() => setReasonHover(true)}
          onMouseLeave={() => setReasonHover(false)}
        >
          <button
            type="button"
            aria-expanded={showReason}
            onClick={() => setReasonOpen((open) => !open)}
            className="text-xs font-semibold text-accent underline"
          >
            Why this time?
          </button>
          {showReason ? (
            <p
              role="tooltip"
              className="absolute top-full right-0 z-50 mt-1 w-52 rounded-xl border border-line bg-card p-3 text-sm leading-relaxed text-ink shadow-sm"
            >
              {timer.reasoning}
            </p>
          ) : null}
        </div>
      </section>

      {timer.timeUp ? (
        <div role="status" className="w-56 rounded-2xl border border-line bg-warn-bg p-3 text-warn shadow-sm">
          <p className="text-sm leading-relaxed">Time’s up. You can keep going, or stop here.</p>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={addTenMinutes}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white"
            >
              Add 10 minutes
            </button>
            <button
              type="button"
              onClick={finishUp}
              className="rounded-lg border border-line bg-card px-3 py-2 text-sm font-semibold text-ink"
            >
              Finish up
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ProgressRing({ ratio }: { ratio: number }) {
  const size = 40;
  const stroke = 3.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, ratio));
  const offset = circumference * (1 - clamped);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-line"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="text-accent"
      />
    </svg>
  );
}

function formatTime(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function timerLabel(remaining: number, running: boolean) {
  const state = running ? "running" : "paused";
  return `Study timer ${formatTime(remaining)} remaining, ${state}`;
}

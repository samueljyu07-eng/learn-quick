"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { useSession } from "@/components/session-provider";
import { ensureFamiliarity, useFamiliarity } from "@/lib/familiarity-store";
import { useHardcoreClock, watchHardcore } from "@/lib/hardcore-clock";
import { useLearning } from "@/lib/learning-store";
import { hashMaterial } from "@/lib/material-hash";
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
  const [hashed, setHashed] = useState<{ savedAt: string; hash: string } | null>(null);
  const materialHash = session && hashed?.savedAt === session.savedAt ? hashed.hash : "";
  const summary =
    session && learning.status === "ready" && learning.savedAt === session.savedAt
      ? (learning.result?.summary ?? "")
      : "";
  const familiarity = useFamiliarity(materialHash);
  const key = session && summary && familiarity.record ? summaryTimerKey(session.savedAt, summary) : "";

  useEffect(() => {
    if (!session) return;
    let ignore = false;
    const savedAt = session.savedAt;
    void hashMaterial(session.material.text).then((hash) => {
      if (!ignore) setHashed({ savedAt, hash });
    });
    return () => {
      ignore = true;
    };
  }, [session]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.hardcore) {
      watchHardcore(null);
      return;
    }
    watchHardcore(session.material.text);
  }, [hydrated, session]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session) {
      clearTimer();
      return;
    }
    if (!summary || !key || !familiarity.record) return;
    if (timer.savedAt === key && timer.status !== "hidden") return;
    requestEstimate(session, summary, familiarity.record.unfamiliarCount, key);
  }, [hydrated, session, summary, key, familiarity.record, timer.savedAt, timer.status]);

  if (!hydrated || !session) return null;

  if (!summary || timer.savedAt !== key || timer.status === "hidden") {
    return (
      <TimerShell>
        {!summary && learning.status === "error" && learning.savedAt === session.savedAt ? (
          <section className="w-56 rounded-2xl border border-line bg-card p-3 shadow-sm">
            <p className="text-sm leading-relaxed text-muted">Study time starts after your summary is ready.</p>
            <Link href="/explain" className="mt-2 inline-block text-sm font-semibold text-accent underline">
              Open the explanation
            </Link>
          </section>
        ) : !summary ? (
          <LoadingCard message="Writing your summary before setting a study time…" />
        ) : familiarity.error ? (
          <ErrorCard message={familiarity.error} onRetry={() => void ensureFamiliarity(session)} />
        ) : !familiarity.record ? (
          <LoadingCard message="Checking which terms you already know…" />
        ) : (
          <LoadingCard message="Rating how hard this summary is…" />
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
            if (summary && key && familiarity.record) {
              requestEstimate(session, summary, familiarity.record.unfamiliarCount, key, true);
            }
          }}
        />
      ) : null}
      {timer.status === "ready" && session.hardcore ? (
        <HardcoreCard
          reasoning={timer.reasoning}
          onRetry={() => {
            if (summary && key && familiarity.record) {
              requestEstimate(session, summary, familiarity.record.unfamiliarCount, key, true);
            }
          }}
        />
      ) : null}
      {timer.status === "ready" && !session.hardcore ? <TimerCard /> : null}
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

function LoadingCard({ message = "Rating how hard this summary is…" }: { message?: string }) {
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

function HardcoreCard({ reasoning, onRetry }: { reasoning: string; onRetry: () => void }) {
  const clock = useHardcoreClock();
  const state = clock.snapshot;
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reasonHover, setReasonHover] = useState(false);
  const showReason = reasonOpen || reasonHover;

  if (clock.phase === "error") return <ErrorCard message={clock.error} onRetry={onRetry} />;
  if (!state || state.status === "none") return <LoadingCard message="Starting the hardcore timer…" />;

  const remaining = clock.remainingSeconds ?? 0;
  const failed = state.status === "failed" || state.locked;
  const waiting = state.status === "open" && remaining <= 0;
  const armed = state.status === "open" && remaining > 0;

  return (
    <>
      <section className="relative w-56 rounded-2xl border border-line bg-card p-3 shadow-sm">
        <p className="text-center text-[11px] font-semibold tracking-[0.22em] text-accent uppercase">Hardcore</p>
        <div role="timer" aria-label={hardcoreLabel(state.status, remaining)}>
          <BombClock
            seconds={failed ? 0 : remaining}
            blink={armed}
            label={failed ? "FAILED" : state.status === "passed" ? "PASSED" : null}
          />
        </div>
        <ReasonTip
          reasoning={reasoning}
          show={showReason}
          onToggle={() => setReasonOpen((open) => !open)}
          onHover={setReasonHover}
        />
      </section>
      {waiting ? (
        <p className="w-56 rounded-2xl border border-line bg-warn-bg p-3 text-sm leading-relaxed text-warn" role="status">
          Time’s up. Checking whether this material locks…
        </p>
      ) : null}
      {failed ? (
        <p className="w-56 rounded-2xl border border-danger bg-danger-bg p-3 text-sm leading-relaxed text-danger" role="status">
          FAILED. This material is locked.
        </p>
      ) : null}
      {state.status === "passed" ? (
        <p className="w-56 rounded-2xl border border-line bg-accent-soft p-3 text-sm leading-relaxed text-accent" role="status">
          Passed{state.average != null ? ` with an average of ${state.average}` : ""} before the timer ended.
        </p>
      ) : null}
    </>
  );
}

function ReasonTip({
  reasoning,
  show,
  onToggle,
  onHover,
}: {
  reasoning: string;
  show: boolean;
  onToggle: () => void;
  onHover: (hover: boolean) => void;
}) {
  return (
    <div className="relative mt-2" onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      <button type="button" aria-expanded={show} onClick={onToggle} className="text-xs font-semibold text-accent underline">
        Why this time?
      </button>
      {show ? (
        <p
          role="tooltip"
          className="absolute top-full right-0 z-50 mt-1 w-64 rounded-xl border border-line bg-card p-3 text-sm leading-relaxed whitespace-pre-line text-ink shadow-sm"
        >
          {reasoning}
        </p>
      ) : null}
    </div>
  );
}

function hardcoreLabel(status: string, remaining: number) {
  if (status === "failed") return "Hardcore timer failed. This material is locked.";
  if (status === "passed") return "Hardcore timer passed.";
  return `Hardcore timer ${formatTime(remaining)} remaining, running`;
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
        <div className="flex items-center gap-2" role="timer" aria-label={timerLabel(remaining, timer.running, timer.stopped)}>
          <ProgressRing ratio={ratio} />
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">Study time</p>
            <p className="font-semibold text-xl tabular-nums text-ink">{formatTime(remaining)}</p>
            {timer.stopped ? <p className="text-[11px] font-semibold text-muted">Stopped</p> : null}
          </div>
        </div>

        {timer.storageWarning ? (
          <p className="mt-2 text-xs leading-relaxed text-warn">{timer.storageWarning}</p>
        ) : null}

        <div className="mt-3 grid grid-cols-3 gap-1">
          <button
            type="button"
            onClick={startTimer}
            disabled={timer.stopped || timer.running || remaining <= 0}
            className="rounded-lg bg-accent px-1 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            Start
          </button>
          <button
            type="button"
            onClick={pauseTimer}
            disabled={timer.stopped || !timer.running}
            className="rounded-lg border border-line bg-card px-1 py-1.5 text-xs font-semibold text-ink disabled:opacity-40"
          >
            Pause
          </button>
          <button
            type="button"
            onClick={resetTimer}
            disabled={timer.stopped}
            className="rounded-lg border border-line bg-card px-1 py-1.5 text-xs font-semibold text-ink disabled:opacity-40"
          >
            Reset
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between gap-1">
          <span className="text-xs font-semibold text-muted">Adjust</span>
          <button
            type="button"
            onClick={() => adjustTimer(-5)}
            disabled={timer.stopped || remaining <= 0}
            aria-label="Remove 5 minutes"
            className="rounded-lg border border-line bg-card px-2 py-1 text-xs font-semibold text-ink disabled:opacity-40"
          >
            −5
          </button>
          <button
            type="button"
            onClick={() => adjustTimer(5)}
            disabled={timer.stopped || remaining >= 240 * 60}
            aria-label="Add 5 minutes"
            className="rounded-lg border border-line bg-card px-2 py-1 text-xs font-semibold text-ink disabled:opacity-40"
          >
            +5
          </button>
        </div>

        <ReasonTip
          reasoning={timer.reasoning}
          show={showReason}
          onToggle={() => setReasonOpen((open) => !open)}
          onHover={setReasonHover}
        />
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

function BombClock({ seconds, blink, label }: { seconds: number; blink: boolean; label: string | null }) {
  const [minutes, secs] = formatTime(seconds).split(":");
  return (
    <div className="bomb-clock" aria-hidden="true">
      {label ? (
        <span className="bomb-digits bomb-word">{label}</span>
      ) : (
        <>
          <span className="bomb-digits">{minutes}</span>
          <span className={`bomb-digits ${blink ? "bomb-colon" : ""}`}>:</span>
          <span className="bomb-digits">{secs}</span>
        </>
      )}
    </div>
  );
}

function formatTime(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function timerLabel(remaining: number, running: boolean, stopped: boolean) {
  const state = stopped ? "stopped" : running ? "running" : "paused";
  return `Study timer ${formatTime(remaining)} remaining, ${state}`;
}

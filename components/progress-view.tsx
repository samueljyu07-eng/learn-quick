"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAccount } from "@/components/account-provider";
import { SiteHeader } from "@/components/site-header";
import { STUDY } from "@/config/study";

type PointsPayload = {
  total: number;
  streak: number;
  days: Record<string, number>;
  error?: string;
};

export function ProgressView() {
  const account = useAccount();
  const [points, setPoints] = useState<PointsPayload | null>(null);
  const [error, setError] = useState("");
  const [today, setToday] = useState<string | null>(null);

  useEffect(() => {
    setToday(new Date().toLocaleDateString("en-CA"));
  }, []);

  useEffect(() => {
    if (!account.ready || !account.userId || !today) return;
    let cancel = false;
    void fetch(`/api/points?today=${today}`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as PointsPayload | null;
        if (cancel) return;
        if (!response.ok || !payload) {
          setError(payload?.error || "Points couldn't be loaded.");
          return;
        }
        setPoints(payload);
      })
      .catch(() => {
        if (!cancel) setError("Points couldn't be loaded.");
      });
    return () => {
      cancel = true;
    };
  }, [account.ready, account.userId, today]);

  const year = today ? Number(today.slice(0, 4)) : 0;

  return (
    <div>
      <SiteHeader current="progress" />
      <header className="mb-8">
        <p className="text-sm font-semibold text-muted">Contribution</p>
        <h1 className="mt-1 font-serif text-3xl tracking-tight text-ink sm:text-4xl">Your points</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
          A passing session earns {STUDY.basePoints} points, up to {STUDY.basePoints * (1 + STUDY.unfamiliarBonus)} when
          the material is new. A repeat earns half. A day stops at {STUDY.dailyPointCap}.
        </p>
      </header>

      {!account.ready ? (
        <p className="text-muted">Loading your points…</p>
      ) : !account.userId ? (
        <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
          <h2 className="font-serif text-2xl text-ink">Sign in to keep a streak</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Study still works in this browser. Points are saved on your account.
          </p>
          <Link href="/account" className="mt-5 inline-block rounded-xl bg-accent px-5 py-3 font-semibold text-white">
            Sign in
          </Link>
        </section>
      ) : error ? (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm leading-relaxed text-danger">{error}</p>
      ) : !points ? (
        <p className="text-muted">Loading your points…</p>
      ) : (
        <div className="flex flex-col gap-6">
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-line bg-card p-4">
              <p className="text-sm font-semibold text-muted">Total</p>
              <p className="mt-1 font-serif text-5xl text-ink">{points.total}</p>
            </div>
            <div className="rounded-2xl border border-line bg-card p-4">
              <p className="text-sm font-semibold text-muted">Streak</p>
              <p className="mt-1 font-serif text-5xl text-ink">{points.streak}</p>
              <p className="mt-1 text-sm text-muted">{points.streak === 1 ? "day" : "days"}</p>
            </div>
          </section>
          {today ? <YearCalendar year={year} days={points.days} today={today} /> : null}
        </div>
      )}
    </div>
  );
}

function YearCalendar({ year, days, today }: { year: number; days: Record<string, number>; today: string }) {
  const start = new Date(year, 0, 1);
  const cells: { day: string; points: number }[] = [];
  for (let pad = 0; pad < start.getDay(); pad += 1) cells.push({ day: "", points: 0 });
  for (let month = 0; month < 12; month += 1) {
    const count = new Date(year, month + 1, 0).getDate();
    for (let date = 1; date < count + 1; date += 1) {
      const day = `${year}-${String(month + 1).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
      cells.push({ day, points: days[day] ?? 0 });
    }
  }
  const max = Math.max(1, ...Object.values(days));

  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
      <h2 className="font-serif text-2xl text-ink">{year}</h2>
      <div className="mt-4 grid grid-cols-7 gap-1" aria-label={`${year} points`}>
        {cells.map((cell, index) =>
          cell.day ? (
            <span
              key={cell.day}
              title={`${cell.day}: ${cell.points} points`}
              aria-label={`${cell.day}, ${cell.points} points`}
              className="aspect-square rounded-sm"
              style={{
                background: cell.points > 0 ? `color-mix(in srgb, var(--lq-accent) ${Math.max(28, Math.round((cell.points / max) * 100))}%, var(--lq-line))` : "var(--lq-line)",
                outline: cell.day === today ? "2px solid var(--lq-ink)" : undefined,
              }}
            />
          ) : (
            <span key={`pad-${index}`} />
          ),
        )}
      </div>
      <p className="mt-3 text-sm text-muted">Each square is a day. Darker days earned more points.</p>
    </section>
  );
}

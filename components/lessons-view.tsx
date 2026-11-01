"use client";

import Link from "next/link";

import { useAccount } from "@/components/account-provider";
import { SiteHeader } from "@/components/site-header";
import { useLessons } from "@/lib/lesson-store";
import { objectiveTitle } from "@/lib/objectives";

export function LessonsView() {
  const lessons = useLessons();
  const account = useAccount();

  return (
    <div>
      <SiteHeader />
      <header className="mb-8">
        <h1 className="font-serif text-3xl tracking-tight text-ink sm:text-4xl">Saved lessons</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
          {account.ready && account.userId
            ? "Kept on your account, and in this browser."
            : "Kept in this browser. Sign in to copy them to your account."}
        </p>
      </header>

      {lessons.storageWarning ? (
        <p className="mb-4 rounded-lg bg-warn-bg px-3 py-2 text-sm leading-relaxed text-warn">{lessons.storageWarning}</p>
      ) : null}

      {lessons.items.length === 0 ? (
        <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
          <h2 className="font-serif text-2xl text-ink">Nothing saved yet</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Open Check and save the lesson. Claude writes a short line for the idea of the material.
          </p>
          <Link href="/check" className="mt-5 inline-block rounded-xl bg-accent px-5 py-3 font-semibold text-white">
            Go to check
          </Link>
        </section>
      ) : (
        <ul className="flex flex-col gap-4">
          {lessons.items.map((lesson) => (
            <li key={lesson.id} className="rounded-2xl border border-line bg-card p-4 sm:p-5">
              <h2 className="font-serif text-2xl text-ink">
                <Link href={`/lessons/${lesson.id}`} className="underline">
                  {lesson.title}
                </Link>
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {objectiveTitle(lesson.objective.kind)}
                {lesson.score ? ` · Score ${lesson.score.average}` : ""}
                {formatAdded(lesson.addedAt) ? ` · Saved ${formatAdded(lesson.addedAt)}` : ""}
              </p>
              <button
                type="button"
                onClick={() => lessons.remove(lesson.id)}
                className="mt-4 text-sm font-semibold text-accent underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatAdded(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

import { ClarificationBox } from "@/components/clarification-box";
import { ProgressBar } from "@/components/progress-bar";
import { renderRichText, focusPassage } from "@/components/rich-text";
import { useSession } from "@/components/session-provider";
import { SiteHeader } from "@/components/site-header";
import { OUTCOME_LABEL, outcomeFor } from "@/lib/learning-result";
import { requestLearning, useLearning } from "@/lib/learning-store";
import { splitPassages } from "@/lib/passages";
import { parseSummary, sectionPlainText, type SummarySection } from "@/lib/summary-format";

export function StepFour() {
  const { session, hydrated } = useSession();
  const learning = useLearning();
  const matches = Boolean(session && learning.savedAt === session.savedAt);
  const result = matches ? learning.result : null;
  const pending = matches && learning.status === "loading";
  const passages = session ? splitPassages(session.material.text) : [];
  const validIds = new Set(passages.map((passage) => passage.id));
  const passageIds = passages.map((passage) => passage.id).join(" ");
  const hashId = useSyncExternalStore(subscribeToHash, readHash, () => "");
  const [chosenPassage, setChosenPassage] = useState("");
  const activePassage = passageIds.split(" ").includes(chosenPassage)
    ? chosenPassage
    : passageIds.split(" ").includes(hashId)
      ? hashId
      : "";

  useEffect(() => {
    if (!activePassage) return;
    const id = activePassage;
    const scroll = () => {
      document.getElementById(id)?.scrollIntoView({ behavior: "auto", block: "center" });
    };
    scroll();
    const early = window.setTimeout(scroll, 50);
    const later = window.setTimeout(scroll, 300);
    return () => {
      window.clearTimeout(early);
      window.clearTimeout(later);
    };
  }, [activePassage]);

  function openPassage(id: string) {
    setChosenPassage(id);
    focusPassage(id);
  }

  return (
    <div>
      <SiteHeader />
      <header className="mb-8">
        <p className="text-sm font-semibold text-muted">Step 4 of 5</p>
        <h1 className="mt-1 font-serif text-3xl tracking-tight text-ink sm:text-4xl">A summary for your goal</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
          Extra detail is left out on purpose. The links jump back to the original passage.
        </p>
      </header>
      <ProgressBar activeStep={4} completedThrough={session ? 3 : 0} stepTwoEnabled={Boolean(session)} />

      {!hydrated ? (
        <p className="text-muted">Loading your saved step…</p>
      ) : !session ? (
        <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
          <h2 className="font-serif text-2xl text-ink">Save step 1 first</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            The summary is written from your objective and your material. Add those, then come back.
          </p>
          <Link href="/" className="mt-5 inline-block rounded-xl bg-accent px-5 py-3 font-semibold text-white">
            Go to step 1
          </Link>
        </section>
      ) : !result && learning.status === "error" ? (
        <ErrorNote message={learning.error} onRetry={() => requestLearning(session, learning.contextExtra, true)} />
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
          <p className="text-sm font-semibold text-accent">{OUTCOME_LABEL[outcomeFor(session.objective.kind)]}</p>
          <SummaryBody summary={result.summary} validIds={validIds} onCite={openPassage} />
          {result.needs_clarification ? (
            <ClarificationBox
              session={session}
              question={result.needs_clarification}
              previous={learning.contextExtra}
              pending={pending}
            />
          ) : null}
          {matches && learning.status === "error" ? (
            <ErrorNote message={learning.error} onRetry={() => requestLearning(session, learning.contextExtra, true)} />
          ) : null}
          <section className="flex flex-col gap-3">
            <h2 className="font-serif text-2xl text-ink">Original material</h2>
            <p className="text-sm leading-relaxed text-muted">
              A citation such as [P1] scrolls to that passage and highlights it.
            </p>
            {passages.map((passage) => (
              <article
                key={passage.id}
                id={passage.id}
                className={`scroll-mt-36 rounded-2xl border border-line bg-card p-4 ${
                  activePassage === passage.id ? "passage-highlight" : ""
                }`}
              >
                <p className="text-sm font-semibold text-accent">{passage.id}</p>
                <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed text-ink">{passage.text}</p>
              </article>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

function subscribeToHash(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

function readHash() {
  const id = window.location.hash.replace("#", "");
  return /^P\d+$/.test(id) ? id : "";
}

function SummaryBody({
  summary,
  validIds,
  onCite,
}: {
  summary: string;
  validIds: Set<string>;
  onCite: (id: string) => void;
}) {
  const sections = parseSummary(summary);
  return (
    <div className="flex flex-col gap-4">
      {sections.map((section, index) => (
        <SummarySectionView
          key={`${section.title ?? "intro"}-${index}`}
          section={section}
          validIds={validIds}
          index={index}
          onCite={onCite}
        />
      ))}
    </div>
  );
}

function SummarySectionView({
  section,
  validIds,
  index,
  onCite,
}: {
  section: SummarySection;
  validIds: Set<string>;
  index: number;
  onCite: (id: string) => void;
}) {
  const box =
    section.kind === "answer"
      ? "rounded-2xl border border-accent bg-accent-soft p-4 sm:p-5"
      : section.kind === "practice"
        ? "rounded-2xl border border-accent bg-card p-4 sm:p-5"
        : section.kind === "mistakes"
          ? "rounded-2xl border border-warn bg-warn-bg p-4 sm:p-5"
          : "";

  return (
    <section className={box}>
      <div className="flex items-start justify-between gap-3">
        {section.title ? <h2 className="font-serif text-2xl text-ink">{section.title}</h2> : <span />}
        {section.kind === "answer" ? <CopyButton text={sectionPlainText(section)} /> : null}
      </div>
      <div className={`flex flex-col gap-3 break-words leading-relaxed text-ink ${section.title ? "mt-3" : ""}`}>
        {section.blocks.map((block, blockIndex) => {
          const key = `${index}-${blockIndex}`;
          if (block.type === "p") {
            return <p key={key}>{renderRichText(block.text, validIds, key, onCite)}</p>;
          }
          const ListTag = block.type === "ol" ? "ol" : "ul";
          return (
            <ListTag key={key} className={block.type === "ol" ? "list-decimal space-y-2 pl-5" : "list-disc space-y-2 pl-5"}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{renderRichText(item, validIds, `${key}-${itemIndex}`, onCite)}</li>
              ))}
            </ListTag>
          );
        })}
      </div>
    </section>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="shrink-0 rounded-xl border border-line bg-card px-3 py-2 text-sm font-semibold text-ink"
      onClick={() => {
        const done = () => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        };
        if (navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
          return;
        }
        fallbackCopy(text, done);
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function fallbackCopy(text: string, done: () => void) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "true");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
  done();
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

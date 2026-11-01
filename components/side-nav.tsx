"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { CdIcon, FolderIcon, PadlockIcon } from "@/components/aero-icons";
import { setHardcoreDraft, useHardcoreDraft } from "@/components/hardcore-theme";
import { useSession } from "@/components/session-provider";
import { StudyTimer } from "@/components/study-timer";
import { STUDY } from "@/config/study";

const RECORDS = [
  { href: "/locked", label: "Locked materials" },
  { href: "/progress", label: "Points" },
  { href: "/library", label: "My definitions" },
  { href: "/lessons", label: "Saved lessons" },
];

const STEPS = [
  { href: "/", label: "1 Objective" },
  { href: "/definitions", label: "2 Definitions" },
  { href: "/explain", label: "3 Explain" },
  { href: "/summary", label: "4 Summary" },
  { href: "/check", label: "5 Check" },
];

export function StudyShell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="arxiv-bar">
        <Link href="/" className="arxiv-brand">
          <img src="/learn-quick-banner.png" alt="Learn Quick" width={828} height={382} />
        </Link>
        <Suspense fallback={<Link href="/account">Account</Link>}>
          <AccountLink />
        </Suspense>
      </header>
      <div className="arxiv-frame">
        <div className="arxiv-main">{children}</div>
        <aside className="arxiv-side" aria-label="Study tools">
          <Suspense fallback={null}>
            <AccessStudyPath />
            <AdditionalFeatures />
          </Suspense>
          <section className="arxiv-box">
            <h2>Study Timer</h2>
            <StudyTimer />
          </section>
          <HardcoreToggle />
        </aside>
      </div>
    </>
  );
}

function AccountLink() {
  const pathname = usePathname();
  const current = pathname === "/account";
  return (
    <Link href="/account" aria-current={current ? "page" : undefined}>
      Account
    </Link>
  );
}

function AccessStudyPath() {
  const pathname = usePathname();
  const { session } = useSession();
  const open = Boolean(session);

  return (
    <section className="arxiv-box">
      <h2>Access Study Path</h2>
      <ul>
        {STEPS.map((step, index) => {
          const enabled = index === 0 || open;
          const current = pathname === step.href;
          return (
            <li key={step.href}>
              {enabled ? (
                <Link href={step.href} aria-current={current ? "page" : undefined}>
                  {step.label}
                </Link>
              ) : (
                <span className="arxiv-disabled">{step.label}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AdditionalFeatures() {
  const pathname = usePathname();

  return (
    <section className="arxiv-box">
      <h2>Additional Features</h2>
      <ul>
        {RECORDS.map((link) => {
          const current = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <li key={link.href}>
              <Link href={link.href} aria-current={current ? "page" : undefined}>
                {link.href === "/lessons" ? <FolderIcon /> : null}
                {link.label}
              </Link>
            </li>
          );
        })}
        <li>
          <button type="button" disabled className="arxiv-listen">
            <CdIcon />
            Listen
          </button>
          <span className="arxiv-note">Not available yet</span>
        </li>
      </ul>
    </section>
  );
}

function HardcoreToggle() {
  const { session, hydrated } = useSession();
  const draft = useHardcoreDraft();
  const editable = hydrated && draft !== null;
  const checked = editable ? draft : session?.hardcore === true;

  return (
    <section className="arxiv-box">
      <h2>Hardcore mode</h2>
      <label className="arxiv-check">
        <input
          type="checkbox"
          checked={checked}
          disabled={!editable}
          onChange={(event) => setHardcoreDraft(event.target.checked)}
        />
        <PadlockIcon />
        <span>Lock this material if I don&apos;t pass in time</span>
      </label>
      <p>
        {editable
          ? `Optional. The timer starts when your study time is ready, and it cannot be paused. Passing means every practice problem is done and the average is ${STUDY.passingScore} or higher.`
          : "Set this on step 1, while the form is open, before the material is saved."}
      </p>
    </section>
  );
}

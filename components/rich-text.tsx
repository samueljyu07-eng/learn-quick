"use client";

import type { ReactNode } from "react";

export function renderRichText(
  text: string,
  validIds: Set<string>,
  keyPrefix: string,
  onCite: (id: string) => void,
): ReactNode[] {
  return text.split(/(\[P\d+\])/g).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    const cite = /^\[(P\d+)\]$/.exec(part);
    if (cite) {
      const id = cite[1];
      if (!validIds.has(id)) return <span key={key}>{part}</span>;
      return (
        <a
          key={key}
          href={`#${id}`}
          className="font-semibold text-accent underline"
          onClick={() => {
            onCite(id);
          }}
        >
          {part}
        </a>
      );
    }
    return <span key={key}>{emphasize(part, key)}</span>;
  });
}

export function focusPassage(id: string) {
  window.history.replaceState(null, "", `#${id}`);
  window.requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: "auto", block: "center" });
  });
}

function emphasize(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|Likely tested:)/g).map((part, index) => {
    const key = `${keyPrefix}-e-${index}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part === "Likely tested:") {
      return (
        <strong key={key} className="rounded bg-accent-soft px-1 text-accent">
          Likely tested:
        </strong>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

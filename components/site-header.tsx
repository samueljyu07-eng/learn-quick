import Link from "next/link";

export function SiteHeader({ current }: { current?: "library" | "locked" }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <Link href="/" className="text-sm font-semibold tracking-wide text-accent">
        Learn Quick
      </Link>
      <nav className="flex items-center gap-4">
        <Link
          href="/locked"
          className={`text-sm font-semibold underline ${current === "locked" ? "text-accent" : "text-ink"}`}
          aria-current={current === "locked" ? "page" : undefined}
        >
          Locked materials
        </Link>
        <Link
          href="/library"
          className={`text-sm font-semibold underline ${current === "library" ? "text-accent" : "text-ink"}`}
          aria-current={current === "library" ? "page" : undefined}
        >
          My definitions
        </Link>
      </nav>
    </div>
  );
}

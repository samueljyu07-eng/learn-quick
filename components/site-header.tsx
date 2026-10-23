import Link from "next/link";

export function SiteHeader({ current }: { current?: "library" }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <Link href="/" className="text-sm font-semibold tracking-wide text-accent">
        Learn Quick
      </Link>
      <Link
        href="/library"
        className={`text-sm font-semibold underline ${current === "library" ? "text-accent" : "text-ink"}`}
        aria-current={current === "library" ? "page" : undefined}
      >
        My definitions
      </Link>
    </div>
  );
}

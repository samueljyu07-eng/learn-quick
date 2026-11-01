export function LoadingProgress({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div className={className} role="status" aria-live="polite">
      <p className="text-base text-muted">{label}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-label={label}>
        <div className="loading-progress-bar h-full rounded-full bg-accent" />
      </div>
    </div>
  );
}

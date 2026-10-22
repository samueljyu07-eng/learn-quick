const STEPS = [
  { id: 1, label: "Objective" },
  { id: 2, label: "Definitions" },
  { id: 3, label: "Explain" },
  { id: 4, label: "Summary" },
  { id: 5, label: "Check" },
];

export function ProgressBar({
  activeStep,
  completedThrough,
}: {
  activeStep: number;
  completedThrough: number;
}) {
  return (
    <nav aria-label="Progress" className="relative mb-8">
      <span className="absolute top-4 right-[10%] left-[10%] h-px bg-line" aria-hidden="true" />
      <ol className="relative grid grid-cols-5">
        {STEPS.map((step) => {
          const complete = step.id <= completedThrough;
          const current = step.id === activeStep;
          return (
            <li
              key={step.id}
              className="relative flex flex-col items-center text-center"
              aria-current={current ? "step" : undefined}
            >
              <span
                className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                  complete || current
                    ? "bg-accent text-white"
                    : "border border-line bg-card text-muted"
                }`}
              >
                {complete ? <CheckIcon /> : step.id}
                {complete ? <span className="sr-only"> completed</span> : null}
              </span>
              <span
                className={`mt-2 text-[11px] leading-tight sm:text-xs ${
                  current ? "font-semibold text-ink" : "text-muted"
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
      <path fill="currentColor" d="M7.8 13.4 4.6 10.2 3.4 11.4 7.8 15.8 16.6 7l-1.2-1.2z" />
    </svg>
  );
}

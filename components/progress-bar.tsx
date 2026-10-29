import Link from "next/link";

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
  stepTwoEnabled = false,
}: {
  activeStep: number;
  completedThrough: number;
  stepTwoEnabled?: boolean;
}) {
  return (
    <nav aria-label="Progress" className="mb-8">
      <ol className="grid grid-cols-5">
        {STEPS.map((step) => {
          const complete = step.id <= completedThrough;
          const current = step.id === activeStep;
          const marked = complete || current;
          const href =
            step.id === 1
              ? "/"
              : step.id === 2 && stepTwoEnabled
                ? "/definitions"
                : step.id === 3 && stepTwoEnabled
                  ? "/explain"
                  : step.id === 4 && stepTwoEnabled
                    ? "/summary"
                    : step.id === 5 && stepTwoEnabled
                      ? "/check"
                      : null;
          const body = (
            <>
              <span className={`step-num${current ? " step-num-current" : ""}`}>
                {step.id}
                {current ? <span className="sr-only"> current</span> : null}
                {complete ? <span className="sr-only"> completed</span> : null}
              </span>
              <span className="step-check" aria-hidden="true">
                {marked ? <CheckIcon /> : null}
              </span>
              <span className={`step-label${current ? " step-label-current" : ""}`}>{step.label}</span>
            </>
          );
          return (
            <li key={step.id} className="relative flex flex-col items-center text-center" aria-current={current ? "step" : undefined}>
              {href ? (
                <Link href={href} className="flex flex-col items-center text-center no-underline">
                  {body}
                </Link>
              ) : (
                body
              )}
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

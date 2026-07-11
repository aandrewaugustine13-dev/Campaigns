import { Check } from "lucide-react";
import { motion } from "framer-motion";

export interface StepDef {
  id: string;
  label: string;
  shortLabel?: string;
}

interface StepperProps {
  steps: StepDef[];
  /** Index of the current step (0-based). Steps before are complete. */
  currentIndex: number;
  className?: string;
}

/**
 * Horizontal progress indicator for multi-step teacher wizards.
 * Accessible: each step is a list item; current step is announced via aria-current.
 */
export function Stepper({ steps, currentIndex, className = "" }: StepperProps) {
  return (
    <nav aria-label="Setup progress" className={className}>
      <ol className="flex items-center w-full">
        {steps.map((step, i) => {
          const complete = i < currentIndex;
          const current = i === currentIndex;
          const upcoming = i > currentIndex;

          return (
            <li
              key={step.id}
              className={`flex items-center ${i < steps.length - 1 ? "flex-1" : ""}`}
              aria-current={current ? "step" : undefined}
            >
              <div className="flex flex-col items-center gap-1.5 min-w-0">
                <div className="relative flex items-center justify-center">
                  <motion.div
                    layout
                    className={[
                      "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors",
                      complete
                        ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                        : current
                          ? "bg-white text-indigo-700 ring-2 ring-indigo-600 shadow-sm"
                          : "bg-stone-100 text-stone-500 ring-1 ring-stone-200",
                    ].join(" ")}
                    initial={false}
                    animate={current ? { scale: 1.05 } : { scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 28 }}
                  >
                    {complete ? (
                      <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                    ) : (
                      <span>{i + 1}</span>
                    )}
                  </motion.div>
                </div>
                <span
                  className={[
                    "hidden sm:block text-xs font-bold tracking-wide truncate max-w-[5.5rem] text-center",
                    complete || current ? "text-stone-900" : "text-stone-500",
                    current ? "font-extrabold" : "",
                  ].join(" ")}
                >
                  {step.shortLabel ?? step.label}
                </span>
              </div>

              {i < steps.length - 1 && (
                <div
                  className="mx-2 sm:mx-3 h-0.5 flex-1 rounded-full bg-stone-200 overflow-hidden min-w-[1.25rem]"
                  aria-hidden
                >
                  <motion.div
                    className="h-full bg-indigo-500 origin-left"
                    initial={false}
                    animate={{ scaleX: complete ? 1 : 0 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    style={{ width: "100%" }}
                  />
                </div>
              )}

              {/* Screen-reader-only upcoming status */}
              {upcoming && <span className="sr-only">Upcoming: {step.label}</span>}
              {complete && <span className="sr-only">Completed: {step.label}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

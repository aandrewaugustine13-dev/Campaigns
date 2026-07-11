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
 * Warm, inviting progress indicator for multi-step teacher wizards.
 * Active step feels alive; upcoming steps stay calm (not bureaucratic gray).
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
                  {current && (
                    <motion.span
                      className="absolute inset-0 rounded-full bg-violet-400/25"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1.45, opacity: 1 }}
                      transition={{ duration: 0.4 }}
                      aria-hidden
                    />
                  )}
                  <motion.div
                    layout
                    className={[
                      "relative flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-colors",
                      complete
                        ? "bg-violet-700 text-white shadow-md shadow-violet-900/20"
                        : current
                          ? "bg-gradient-to-br from-violet-600 to-violet-800 text-white shadow-lg shadow-violet-900/25"
                          : "bg-white text-stone-400 shadow-sm shadow-stone-900/5 ring-1 ring-stone-900/[0.06]",
                    ].join(" ")}
                    initial={false}
                    animate={current ? { scale: 1.06 } : { scale: 1 }}
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
                    "hidden sm:block text-xs tracking-wide truncate max-w-[5.5rem] text-center",
                    current
                      ? "font-extrabold text-violet-900"
                      : complete
                        ? "font-bold text-stone-700"
                        : "font-semibold text-stone-400",
                  ].join(" ")}
                >
                  {step.shortLabel ?? step.label}
                </span>
              </div>

              {i < steps.length - 1 && (
                <div
                  className="mx-2 sm:mx-3 h-1 flex-1 rounded-full bg-stone-200/70 overflow-hidden min-w-[1.25rem]"
                  aria-hidden
                >
                  <motion.div
                    className="h-full bg-gradient-to-r from-violet-500 to-violet-600 origin-left rounded-full"
                    initial={false}
                    animate={{ scaleX: complete ? 1 : 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    style={{ width: "100%" }}
                  />
                </div>
              )}

              {upcoming && <span className="sr-only">Upcoming: {step.label}</span>}
              {complete && <span className="sr-only">Completed: {step.label}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

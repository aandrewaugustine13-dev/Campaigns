/**
 * Lightweight studio UI primitives for teacher setup flows.
 * Warm, approachable SaaS look (Linear/Notion-adjacent) without pulling in a full design system.
 */
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";

// ── Shared class tokens ──────────────────────────────────────────
// Warm educational studio: cream surfaces, soft elevation (not thin borders),
// readable weight, and a living indigo-violet accent. `.studio-ui` bumps type.
export const studio = {
  // Warm cream undertone — not cool gray enterprise
  page: "studio-ui min-h-screen bg-[#FBF7F2] text-stone-900 antialiased",
  font: "font-sans font-medium",
  // Soft elevation over outlines — premium, not bureaucratic
  card:
    "bg-white/95 rounded-2xl shadow-[0_4px_24px_-4px_rgba(62,44,28,0.08),0_1px_3px_rgba(62,44,28,0.04)] " +
    "ring-1 ring-stone-900/[0.04]",
  cardHover:
    "hover:shadow-[0_8px_32px_-6px_rgba(62,44,28,0.12),0_2px_6px_rgba(62,44,28,0.05)] " +
    "hover:-translate-y-px transition-all duration-200",
  input:
    "w-full rounded-xl border-0 bg-[#F8F4EE] px-4 py-3.5 text-base font-semibold text-stone-900 " +
    "placeholder:text-stone-400/90 placeholder:font-medium " +
    "shadow-inner shadow-stone-900/[0.03] transition-all duration-150 " +
    "hover:bg-[#F3EDE5] " +
    "focus:outline-none focus:bg-white focus:ring-4 focus:ring-violet-500/15 focus:shadow-[0_0_0_1.5px_rgba(109,40,217,0.35)]",
  // Sentence case feel — not ALL-CAPS compliance labels
  label: "block text-sm font-bold text-stone-700 mb-1.5 tracking-tight",
  help: "mt-1.5 text-sm font-medium leading-relaxed text-stone-500",
  title: "text-2xl sm:text-3xl font-bold tracking-tight text-stone-900",
  subtitle: "text-base font-medium text-stone-600 leading-relaxed",
} as const;

// ── Shell ────────────────────────────────────────────────────────
export function StudioShell({
  children,
  header,
  footer,
}: {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className={`${studio.page} ${studio.font} flex flex-col h-screen overflow-hidden`}>
      {header && (
        <header className="shrink-0 border-b border-amber-900/[0.06] bg-[#FBF7F2]/90 backdrop-blur-md sticky top-0 z-20">
          <div className="max-w-2xl mx-auto px-5 sm:px-6 py-4">{header}</div>
        </header>
      )}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-5 sm:px-6 py-8 sm:py-10 pb-20">{children}</div>
      </div>
      {footer}
    </div>
  );
}

// ── Step panel motion ────────────────────────────────────────────
const panelVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export function StudioPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      key="panel"
      variants={panelVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={`space-y-6 ${className}`}
    >
      {children}
    </motion.div>
  );
}

// ── Card ─────────────────────────────────────────────────────────
export function StudioCard({
  children,
  className = "",
  accent = false,
  ...props
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
} & HTMLMotionProps<"div">) {
  return (
    <motion.div
      layout
      className={[
        studio.card,
        "p-4 sm:p-5",
        accent ? "bg-gradient-to-br from-white via-violet-50/40 to-amber-50/30" : "",
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function StudioCardTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`text-sm font-bold tracking-tight text-violet-800 mb-1.5 ${className}`}>
      {children}
    </h2>
  );
}

// ── Field + controls ─────────────────────────────────────────────
export function Field({
  label,
  htmlFor,
  hint,
  children,
  required,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={studio.label}>
        {label}
        {required && <span className="text-rose-500 ml-0.5" aria-hidden>*</span>}
      </label>
      {children}
      {hint && <p className={studio.help}>{hint}</p>}
    </div>
  );
}

export const StudioInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function StudioInput({ className = "", ...props }, ref) {
    return <input ref={ref} className={`${studio.input} ${className}`} {...props} />;
  },
);

export const StudioTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function StudioTextarea({ className = "", ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={`${studio.input} resize-none min-h-[4.5rem] ${className}`}
        {...props}
      />
    );
  },
);

export const StudioSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function StudioSelect({ className = "", children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={`${studio.input} appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 20 20%27%3E%3Cpath stroke=%27%2378716c%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%271.5%27 d=%27m6 8 4 4 4-4%27/%3E%3C/svg%3E')] bg-[length:1.25rem] bg-[right_0.6rem_center] bg-no-repeat pr-9 ${className}`}
        {...props}
      >
        {children}
      </select>
    );
  },
);

// ── Buttons ──────────────────────────────────────────────────────
type BtnVariant = "primary" | "secondary" | "ghost" | "danger";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-bold " +
  "transition-all duration-150 focus:outline-none focus-visible:ring-4 " +
  "disabled:opacity-45 disabled:cursor-not-allowed disabled:pointer-events-none " +
  "active:scale-[0.98]";

const btnVariants: Record<BtnVariant, string> = {
  primary:
    "bg-violet-700 text-white shadow-md shadow-violet-900/15 hover:bg-violet-600 " +
    "focus-visible:ring-violet-500/30",
  secondary:
    "bg-white text-stone-800 shadow-sm shadow-stone-900/5 ring-1 ring-stone-900/[0.06] " +
    "hover:bg-[#FBF7F2] hover:shadow-md focus-visible:ring-violet-500/20",
  ghost:
    "bg-transparent text-stone-600 hover:text-stone-900 hover:bg-amber-900/[0.04] " +
    "focus-visible:ring-stone-400/15",
  danger:
    "bg-rose-600 text-white shadow-sm hover:bg-rose-500 focus-visible:ring-rose-500/25",
};

const btnSizes = {
  md: "px-4 py-2.5",
  lg: "px-5 py-3.5 text-base",
  sm: "px-3 py-1.5 text-xs font-bold",
};

export function StudioButton({
  variant = "primary",
  size = "md",
  fullWidth,
  loading,
  children,
  className = "",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: keyof typeof btnSizes;
  fullWidth?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      className={[
        btnBase,
        btnVariants[variant],
        btnSizes[size],
        fullWidth ? "w-full" : "",
        className,
      ].join(" ")}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

// ── Selectable option card (radio-like) ──────────────────────────
export function SelectableCard({
  selected,
  disabled,
  onClick,
  children,
  className = "",
  "aria-label": ariaLabel,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={ariaLabel}
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.995 }}
      className={[
        "w-full text-left rounded-2xl p-4 sm:p-4.5 transition-all duration-200",
        "focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/20",
        selected
          ? "bg-gradient-to-br from-violet-50 to-amber-50/40 shadow-md shadow-violet-900/10 ring-2 ring-violet-500/50"
          : "bg-white/80 shadow-sm shadow-stone-900/[0.04] ring-1 ring-stone-900/[0.05] hover:shadow-md hover:ring-stone-900/[0.08]",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        className,
      ].join(" ")}
    >
      {children}
    </motion.button>
  );
}

export function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      className={[
        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
        selected ? "border-violet-600 bg-violet-600" : "border-stone-300 bg-white",
      ].join(" ")}
      aria-hidden
    >
      {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
    </span>
  );
}

// ── Badge ────────────────────────────────────────────────────────
export function StudioBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "indigo" | "emerald" | "amber" | "rose";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-stone-100/90 text-stone-700 ring-stone-200/60",
    indigo: "bg-violet-100 text-violet-800 ring-violet-200/70",
    emerald: "bg-emerald-50 text-emerald-800 ring-emerald-100",
    amber: "bg-amber-50 text-amber-900 ring-amber-100",
    rose: "bg-rose-50 text-rose-700 ring-rose-100",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ring-1 ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

// ── Loading ──────────────────────────────────────────────────────
export function StudioSpinner({ label, sublabel }: { label: string; sublabel?: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10" role="status" aria-live="polite">
      <div className="relative">
        <div className="h-12 w-12 rounded-full border-[3px] border-stone-200" />
        <div className="absolute inset-0 h-12 w-12 rounded-full border-[3px] border-transparent border-t-violet-600 animate-spin" />
      </div>
      <div className="text-center space-y-1 max-w-sm">
        <p className="text-base font-bold text-stone-900">{label}</p>
        {sublabel && <p className="text-sm font-medium text-stone-600 leading-relaxed">{sublabel}</p>}
      </div>
    </div>
  );
}

// ── Page header block ────────────────────────────────────────────
export function StudioHeader({
  title,
  description,
  eyebrow,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
}) {
  return (
    <div className="space-y-2 text-center sm:text-left">
      {eyebrow && (
        <p className="text-xs font-bold tracking-wide text-violet-700">{eyebrow}</p>
      )}
      <h1 className={studio.title}>{title}</h1>
      {description && <p className={studio.subtitle}>{description}</p>}
    </div>
  );
}

// ── Segmented control ────────────────────────────────────────────
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  "aria-label"?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex rounded-lg border border-stone-200 bg-stone-100/80 p-1 gap-0.5"
    >
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={[
              "relative flex-1 rounded-md px-3 py-2 text-sm font-bold capitalize transition-all duration-150",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30",
              selected
                ? "bg-white text-stone-900 shadow-sm ring-1 ring-stone-200/80"
                : "text-stone-600 hover:text-stone-800",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Nested list row (economy resource, cast member, etc.) ────────
export function DetailRow({
  title,
  meta,
  description,
  badge,
}: {
  title: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-stone-100 bg-stone-50/60 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-sm font-bold text-stone-900">{title}</span>
          {badge}
        </div>
        {meta && <span className="text-[11px] font-bold uppercase tracking-wide text-stone-500 shrink-0">{meta}</span>}
      </div>
      {description && <p className="text-sm font-medium text-stone-600 mt-1 leading-relaxed">{description}</p>}
    </div>
  );
}

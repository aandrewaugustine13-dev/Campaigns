import React from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "warm"
  | "alternative"
  | "danger";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  label: string;
  description?: string;
  className?: string;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-br from-[#1f2a45] to-[#121a33] border-white/5",
  secondary:
    "bg-gradient-to-br from-[#2c2a27] to-[#211f1c] border-white/5",
  warm:
    "bg-gradient-to-br from-[#463426] to-[#32251b] border-white/5",
  alternative:
    "bg-gradient-to-br from-[#1c263f] to-[#131d32] border-white/5",
  danger:
    "bg-gradient-to-br from-[#3f2525] to-[#2a1919] border-white/5",
};

/**
 * Premium rounded button with subtle gradient texture, shadow for depth,
 * and consistent hover/active behavior.
 *
 * - label: Main bold text
 * - description: Smaller supporting text underneath (optional)
 */
export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  label,
  description,
  className = "",
  disabled,
  ...props
}) => {
  const baseClasses =
    "w-full rounded-2xl px-6 py-[19px] text-left shadow-[0_8px_24px_-6px_rgb(0,0,0,0.5)] transition-all active:scale-[0.985] hover:brightness-[1.08] border disabled:opacity-60 disabled:cursor-not-allowed";

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      <div className="text-[15px] font-semibold text-white tracking-[-0.1px] leading-tight">
        {label}
      </div>
      {description && (
        <div className="mt-[3px] text-[12.5px] text-[#a69a80] leading-tight">
          {description}
        </div>
      )}
    </button>
  );
};

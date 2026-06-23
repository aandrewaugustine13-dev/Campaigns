import React from "react";

interface BackButtonProps {
  onClick: () => void;
  label?: string;
  className?: string;
}

/**
 * Consistent subtle back navigation link following the premium muted style.
 */
export const BackButton: React.FC<BackButtonProps> = ({
  onClick,
  label = "← Back to Campaigns",
  className = "",
}) => {
  return (
    <button
      onClick={onClick}
      className={`text-[#a69a80] hover:text-[#c5b8a0] text-xs tracking-wide transition-colors ${className}`}
    >
      {label}
    </button>
  );
};

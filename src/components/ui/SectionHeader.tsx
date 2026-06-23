import React from "react";

interface SectionHeaderProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Small gold uppercase section header with generous letter spacing.
 * Use sparingly for visual hierarchy.
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
  children,
  className = "",
}) => {
  return (
    <div
      className={`text-[#b89d6e] text-[10px] font-medium tracking-[4px] uppercase text-center ${className}`}
    >
      {children}
    </div>
  );
};

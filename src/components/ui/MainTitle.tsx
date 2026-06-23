import React from "react";

interface MainTitleProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Large elegant gold serif title. Use for main screen titles (e.g. "CAMPAIGNS").
 */
export const MainTitle: React.FC<MainTitleProps> = ({
  children,
  className = "",
}) => {
  return (
    <h1
      className={`text-[#c9a36b] text-5xl font-serif tracking-[1.5px] mb-10 text-center select-none ${className}`}
    >
      {children}
    </h1>
  );
};

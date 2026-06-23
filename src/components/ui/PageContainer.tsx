import React from "react";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: string;
}

/**
 * Consistent wrapper providing the premium dark historical background
 * with subtle depth, radial vignette, and centered content area.
 */
export const PageContainer: React.FC<PageContainerProps> = ({
  children,
  className = "",
  maxWidth = "max-w-[320px]",
}) => {
  return (
    <div
      className={`min-h-screen bg-[#18140f] bg-[radial-gradient(at_50%_15%,#221f1a_0%,transparent_55%)] flex flex-col items-center justify-center px-6 py-12 ${className}`}
    >
      <div className={`w-full ${maxWidth} flex flex-col`}>
        {children}
      </div>
    </div>
  );
};

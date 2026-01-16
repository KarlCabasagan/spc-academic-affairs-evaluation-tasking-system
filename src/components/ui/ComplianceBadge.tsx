import type { ReactNode } from "react";

interface ComplianceBadgeProps {
  value: number | null;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  showLabel?: boolean;
}

/**
 * Displays a compliance percentage with color coding.
 * - null or undefined: gray (no data)
 * - >= 80%: green (good)
 * - >= 50%: amber (needs attention)
 * - < 50%: red (critical)
 */
export default function ComplianceBadge({
  value,
  size = "md",
  showIcon = false,
  showLabel = false,
}: ComplianceBadgeProps) {
  const getColor = (): { bg: string; text: string; icon: ReactNode } => {
    if (value === null || value === undefined) {
      return {
        bg: "bg-gray-100",
        text: "text-gray-500",
        icon: (
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        ),
      };
    }
    if (value >= 80) {
      return {
        bg: "bg-emerald-100",
        text: "text-emerald-700",
        icon: (
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        ),
      };
    }
    if (value >= 50) {
      return {
        bg: "bg-amber-100",
        text: "text-amber-700",
        icon: (
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        ),
      };
    }
    return {
      bg: "bg-red-100",
      text: "text-red-700",
      icon: (
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
      ),
    };
  };

  const getSizeClasses = () => {
    switch (size) {
      case "sm":
        return "px-1.5 py-0.5 text-xs";
      case "lg":
        return "px-3 py-1.5 text-base";
      default:
        return "px-2 py-1 text-sm";
    }
  };

  const color = getColor();

  return (
    <span
      className={`
        inline-flex items-center gap-1 font-medium rounded-full
        ${color.bg} ${color.text} ${getSizeClasses()}
      `}
    >
      {showIcon && color.icon}
      {value !== null && value !== undefined ? (
        <>
          {value.toFixed(1)}%
          {showLabel && <span className="opacity-75 ml-0.5">compliant</span>}
        </>
      ) : (
        "No data"
      )}
    </span>
  );
}

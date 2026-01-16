import { useState, type ReactNode } from "react";

interface ComplianceAccordionProps {
  title: string;
  subtitle?: string;
  compliance: number | null;
  displayState?: "no_questions" | "all_na" | "normal"; // Conditional display
  icon?: ReactNode;
  children: ReactNode;
  defaultExpanded?: boolean;
  level?: "college" | "area" | "question";
}

/**
 * Expandable accordion component with compliance percentage display.
 * Used for the nested hierarchy: College > Area > Questions
 */
export default function ComplianceAccordion({
  title,
  subtitle,
  compliance,
  displayState = "normal",
  icon,
  children,
  defaultExpanded = false,
  level = "college",
}: ComplianceAccordionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const getComplianceColor = () => {
    if (compliance === null || compliance === undefined) {
      return { bg: "bg-gray-100", text: "text-gray-500", bar: "bg-gray-300" };
    }
    if (compliance >= 80) {
      return {
        bg: "bg-emerald-100",
        text: "text-emerald-700",
        bar: "bg-emerald-500",
      };
    }
    if (compliance >= 50) {
      return {
        bg: "bg-amber-100",
        text: "text-amber-700",
        bar: "bg-amber-500",
      };
    }
    return { bg: "bg-red-100", text: "text-red-700", bar: "bg-red-500" };
  };

  const getLevelStyles = () => {
    switch (level) {
      case "college":
        return "bg-white border border-gray-200 rounded-xl shadow-sm";
      case "area":
        return "bg-gray-50 border border-gray-100 rounded-lg";
      case "question":
        return "bg-white border-l-2 border-gray-200 ml-4";
      default:
        return "";
    }
  };

  const color = getComplianceColor();

  return (
    <div className={getLevelStyles()}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`
          w-full flex items-center gap-3 p-4 text-left transition-colors
          hover:bg-gray-50/50 focus:outline-none focus:ring-2 focus:ring-maroon-500 focus:ring-inset
          ${
            level === "college"
              ? "rounded-xl"
              : level === "area"
              ? "rounded-lg"
              : ""
          }
        `}
      >
        {/* Expand/Collapse Icon */}
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform duration-200 shrink-0 ${
            isExpanded ? "rotate-90" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>

        {/* Icon */}
        {icon && <div className="shrink-0">{icon}</div>}

        {/* Title & Subtitle */}
        <div className="flex-1 min-w-0">
          <h3
            className={`font-semibold text-gray-900 truncate ${
              level === "college"
                ? "text-lg"
                : level === "area"
                ? "text-base"
                : "text-sm"
            }`}
          >
            {title}
          </h3>
          {subtitle && (
            <p className="text-sm text-gray-500 truncate">{subtitle}</p>
          )}
        </div>

        {/* Compliance Badge & Progress */}
        <div className="flex items-center gap-3 shrink-0">
          {compliance !== null &&
            compliance !== undefined &&
            displayState === "normal" && (
              <>
                {/* Progress bar (only for college and area levels) */}
                {(level === "college" || level === "area") && (
                  <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden hidden sm:block">
                    <div
                      className={`h-full ${color.bar} transition-all duration-300`}
                      style={{ width: `${Math.min(compliance, 100)}%` }}
                    />
                  </div>
                )}
                {/* Percentage */}
                <span
                  className={`px-2 py-1 text-sm font-medium rounded-full ${color.bg} ${color.text}`}
                >
                  {compliance.toFixed(1)}%
                </span>
              </>
            )}
          {displayState === "all_na" && (
            <span className="px-2 py-1 text-sm font-medium rounded-full bg-gray-100 text-gray-500">
              Not Applicable
            </span>
          )}
          {displayState === "no_questions" && (
            <span className="px-2 py-1 text-sm font-medium rounded-full bg-gray-100 text-gray-400">
              No Questions
            </span>
          )}
          {compliance === null && displayState === "normal" && (
            <span className="px-2 py-1 text-sm font-medium rounded-full bg-gray-100 text-gray-500">
              No Data
            </span>
          )}
        </div>
      </button>

      {/* Content */}
      <div
        className={`
          overflow-hidden transition-all duration-300 ease-in-out
          ${isExpanded ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"}
        `}
      >
        <div className={`p-4 pt-0 ${level === "question" ? "pl-6" : ""}`}>
          {children}
        </div>
      </div>
    </div>
  );
}

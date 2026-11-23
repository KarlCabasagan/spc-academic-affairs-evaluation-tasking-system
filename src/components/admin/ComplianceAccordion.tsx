import { useState, type ReactNode } from "react";
import {
  COMPLIANCE_TONE_CLASSES,
  getComplianceTone,
  type ComplianceDisplayState,
} from "../../lib/compliance";
import { ChevronRightIcon } from "../ui";

interface ComplianceAccordionProps {
  title: string;
  subtitle?: string;
  compliance: number | null;
  displayState?: ComplianceDisplayState;
  icon?: ReactNode;
  children: ReactNode;
  level?: "college" | "area";
}

/**
 * Expandable accordion component with compliance percentage display.
 * Renders children only when expanded to avoid clipping tall trees and
 * keeping collapsed nodes out of keyboard focus order.
 */
export default function ComplianceAccordion({
  title,
  subtitle,
  compliance,
  displayState = "percentage",
  icon,
  children,
  level = "college",
}: ComplianceAccordionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const tone = getComplianceTone(compliance);
  const toneClasses = COMPLIANCE_TONE_CLASSES[tone];
  const isPercentageState = displayState === "percentage";

  const containerClass =
    level === "college"
      ? "bg-white border border-gray-200 rounded-xl shadow-sm"
      : "bg-gray-50 border border-gray-200 rounded-lg";

  const buttonRadiusClass = level === "college" ? "rounded-xl" : "rounded-lg";
  const titleSizeClass = level === "college" ? "text-lg" : "text-base";

  const scaleRatio =
    compliance !== null
      ? Math.min(Math.max(compliance, 0), 100) / 100
      : 0;

  return (
    <div className={containerClass}>
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((prev) => !prev)}
        className={`w-full flex items-center gap-3 p-4 text-left transition-colors hover:bg-gray-50/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-800 focus-visible:ring-inset ${buttonRadiusClass}`}
      >
        <ChevronRightIcon
          className={`w-5 h-5 text-gray-500 transition-transform duration-150 ease-out shrink-0 ${
            isExpanded ? "rotate-90" : ""
          }`}
        />

        {icon && <div className="shrink-0">{icon}</div>}

        <div className="flex-1 min-w-0">
          <h3 className={`font-semibold text-gray-900 truncate ${titleSizeClass}`}>
            {title}
          </h3>
          {subtitle && (
            <p className="text-sm text-gray-600 truncate">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0 tabular-nums">
          {compliance !== null && isPercentageState ? (
            <>
              <div
                className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden hidden sm:block"
                aria-hidden="true"
              >
                <div
                  className={`w-full h-full origin-left transition-transform duration-200 ease-out ${toneClasses.bar}`}
                  style={{ transform: `scaleX(${scaleRatio})` }}
                />
              </div>
              <span
                className={`px-2.5 py-1 text-sm font-medium rounded-full ${toneClasses.badgeBg} ${toneClasses.text}`}
              >
                {compliance.toFixed(1)}%
              </span>
            </>
          ) : displayState === "all_na" ? (
            <span className="px-2.5 py-1 text-sm font-medium rounded-full bg-gray-100 text-gray-700">
              Not Applicable
            </span>
          ) : displayState === "no_questions" ? (
            <span className="px-2.5 py-1 text-sm font-medium rounded-full bg-gray-100 text-gray-600">
              No Questions
            </span>
          ) : (
            <span className="px-2.5 py-1 text-sm font-medium rounded-full bg-gray-100 text-gray-700">
              No Data
            </span>
          )}
        </div>
      </button>

      {isExpanded && <div className="p-4 pt-0">{children}</div>}
    </div>
  );
}

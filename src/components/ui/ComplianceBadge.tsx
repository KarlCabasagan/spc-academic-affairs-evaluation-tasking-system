import {
  COMPLIANCE_TONE_CLASSES,
  getComplianceTone,
} from "../../lib/compliance";
import { AlertTriangleIcon, CheckIcon, CloseIcon } from "./Icons";

interface ComplianceBadgeProps {
  value: number | null;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  showLabel?: boolean;
}

/**
 * Displays a compliance percentage with WCAG AA color coding.
 */
export default function ComplianceBadge({
  value,
  size = "md",
  showIcon = false,
  showLabel = false,
}: ComplianceBadgeProps) {
  const tone = getComplianceTone(value);
  const styles = COMPLIANCE_TONE_CLASSES[tone];

  const sizeClass =
    size === "sm"
      ? "px-2 py-0.5 text-xs"
      : size === "lg"
        ? "px-3 py-1.5 text-base"
        : "px-2.5 py-1 text-sm";

  const renderIcon = () => {
    if (!showIcon) return null;
    if (tone === "good") return <CheckIcon className="w-3.5 h-3.5 shrink-0" />;
    if (tone === "warning")
      return <AlertTriangleIcon className="w-3.5 h-3.5 shrink-0" />;
    return <CloseIcon className="w-3.5 h-3.5 shrink-0" />;
  };

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-full tabular-nums ${styles.badgeBg} ${styles.text} ${sizeClass}`}
    >
      {renderIcon()}
      {value !== null && value !== undefined ? (
        <>
          {value.toFixed(1)}%
          {showLabel && <span className="opacity-80 ml-0.5">compliant</span>}
        </>
      ) : (
        "No data"
      )}
    </span>
  );
}

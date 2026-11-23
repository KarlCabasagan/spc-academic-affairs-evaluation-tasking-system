import { useState } from "react";
import {
  COMPLIANCE_TONE_CLASSES,
  getComplianceTone,
  type QuestionComplianceNode,
} from "../../lib/compliance";
import { CheckIcon, ChevronRightIcon, CloseIcon } from "../ui";

interface QuestionComplianceTreeProps {
  node: QuestionComplianceNode;
  depth?: number;
  index?: number;
}

/**
 * Recursive component to render hierarchical question tree with compliance status.
 */
export default function QuestionComplianceTree({
  node,
  depth = 0,
  index = 0,
}: QuestionComplianceTreeProps) {
  const [isExpanded, setIsExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const isLeaf = !hasChildren;

  const getStatusIndicator = () => {
    if (!node.response) {
      return (
        <span className="px-2.5 py-0.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
          No response
        </span>
      );
    }

    switch (node.response.status) {
      case "complied":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
            <CheckIcon className="w-3 h-3" />
            Complied
          </span>
        );
      case "not_complied":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
            <CloseIcon className="w-3 h-3" />
            Not Complied
          </span>
        );
      case "not_applicable":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
            N/A
          </span>
        );
    }
  };

  const getComplianceBadge = () => {
    if (node.displayState === "all_na" || node.compliance === null) {
      if (node.displayState === "no_response") {
        return (
          <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
            No Response
          </span>
        );
      }
      return (
        <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
          N/A
        </span>
      );
    }

    const tone = getComplianceTone(node.compliance);
    const classes = COMPLIANCE_TONE_CLASSES[tone];

    return (
      <span
        className={`px-2.5 py-0.5 text-xs font-medium rounded-full tabular-nums ${classes.badgeBg} ${classes.text}`}
      >
        {node.compliance!.toFixed(1)}%
      </span>
    );
  };

  const zebraClass = depth === 0 && index % 2 === 1 ? "bg-gray-50/70" : "";
  const borderClass = depth > 0 ? "border-l-2 border-gray-200" : "";

  const rowInner = (
    <>
      <div className="shrink-0 w-5 h-5 flex items-center justify-center mt-0.5">
        {hasChildren ? (
          <ChevronRightIcon
            className={`w-4 h-4 text-gray-500 transition-transform duration-150 ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
        ) : (
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
        )}
      </div>

      <span className="shrink-0 font-mono tabular-nums text-sm text-gray-600 min-w-8">
        {node.hierarchicalNumber}
      </span>

      <div className="flex-1 min-w-0 max-w-prose">
        <p className="text-sm text-gray-900">{node.questionText}</p>
        {node.response?.comment && (
          <p className="text-xs text-gray-600 mt-1">
            &ldquo;{node.response.comment}&rdquo;
          </p>
        )}
      </div>

      <div className="hidden lg:block shrink-0 mx-2 border-b border-dotted border-gray-300 grow min-w-[20px] max-w-[100px] self-center" />

      <div className="shrink-0">
        {isLeaf ? getStatusIndicator() : getComplianceBadge()}
      </div>
    </>
  );

  return (
    <div className={depth === 0 && hasChildren && isExpanded ? "mb-4" : ""}>
      {hasChildren ? (
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((prev) => !prev)}
          className={`w-full text-left flex items-center gap-2 py-2.5 px-3 rounded-lg transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-800 ${borderClass} ${zebraClass}`}
        >
          {rowInner}
        </button>
      ) : (
        <div
          className={`flex items-center gap-2 py-2.5 px-3 rounded-lg hover:bg-gray-50 transition-colors ${borderClass} ${zebraClass}`}
        >
          {rowInner}
        </div>
      )}

      {hasChildren && isExpanded && (
        <div className="mt-1 space-y-1 ml-3 sm:ml-5">
          {node.children.map((child, childIndex) => (
            <QuestionComplianceTree
              key={child.id}
              node={child}
              depth={depth + 1}
              index={childIndex}
            />
          ))}

          {depth === 0 && (
            <div className="flex items-center gap-2 py-1.5 px-3">
              <div className="flex-1 border-t border-dashed border-gray-300" />
              <span className="text-xs text-gray-600 tabular-nums">
                End of {node.hierarchicalNumber}
              </span>
              <div className="flex-1 border-t border-dashed border-gray-300" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

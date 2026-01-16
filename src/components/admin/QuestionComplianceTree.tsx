import { useState } from "react";
import type { ComplianceStatus } from "../../lib/types";

export interface QuestionComplianceNode {
  id: string;
  questionText: string;
  hierarchicalNumber: string;
  response: {
    status: ComplianceStatus;
    comment: string | null;
  } | null;
  compliance: number; // Zero-baseline: always a number
  children: QuestionComplianceNode[];
}

interface QuestionComplianceTreeProps {
  node: QuestionComplianceNode;
  depth?: number;
  index?: number; // For zebra-striping
}

/**
 * Recursive component to render hierarchical question tree with compliance status.
 * - Leaf nodes show direct compliance status (Complied/Not Complied/N/A)
 * - Parent nodes show averaged compliance percentage of their children
 * - Zebra-striping for visual tracking on wide displays
 */
export default function QuestionComplianceTree({
  node,
  depth = 0,
  index = 0,
}: QuestionComplianceTreeProps) {
  const [isExpanded, setIsExpanded] = useState(depth < 2); // Expand first 2 levels by default
  const hasChildren = node.children && node.children.length > 0;
  const isLeaf = !hasChildren;

  const getStatusIndicator = () => {
    if (!node.response) {
      return (
        <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-medium rounded-full">
          No response
        </span>
      );
    }

    switch (node.response.status) {
      case "complied":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            Complied
          </span>
        );
      case "not_complied":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
            Not Complied
          </span>
        );
      case "not_applicable":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-medium rounded-full">
            N/A
          </span>
        );
    }
  };

  const getComplianceBadge = () => {
    // Handle N/A sentinel (-1) - all children were N/A
    if (node.compliance === -1) {
      return (
        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500">
          N/A
        </span>
      );
    }

    let colorClasses = "";
    if (node.compliance >= 80) {
      colorClasses = "bg-emerald-100 text-emerald-700";
    } else if (node.compliance >= 50) {
      colorClasses = "bg-amber-100 text-amber-700";
    } else {
      colorClasses = "bg-red-100 text-red-700";
    }

    return (
      <span
        className={`px-2 py-0.5 text-xs font-medium rounded-full ${colorClasses}`}
      >
        {node.compliance.toFixed(1)}%
      </span>
    );
  };

  // Calculate indentation
  const indentClass =
    depth === 0 ? "" : depth === 1 ? "ml-6" : depth === 2 ? "ml-12" : "ml-16";

  // Zebra-striping for root level items
  const zebraClass = depth === 0 && index % 2 === 1 ? "bg-gray-50/50" : "";

  return (
    <div className={indentClass}>
      {/* Question Row with visual tracking guide */}
      <div
        className={`
          flex items-center gap-2 py-2.5 px-3 rounded-lg transition-colors group
          ${
            hasChildren
              ? "hover:bg-gray-100 cursor-pointer"
              : "hover:bg-gray-50"
          }
          ${depth > 0 ? "border-l-2 border-gray-200" : ""}
          ${zebraClass}
        `}
        onClick={hasChildren ? () => setIsExpanded(!isExpanded) : undefined}
      >
        {/* Expand/Collapse or Bullet */}
        <div className="shrink-0 w-5 h-5 flex items-center justify-center mt-0.5">
          {hasChildren ? (
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
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
          ) : (
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
          )}
        </div>

        {/* Hierarchical Number */}
        <span className="shrink-0 font-mono text-sm text-gray-500 min-w-8">
          {node.hierarchicalNumber}
        </span>

        {/* Question Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-900">{node.questionText}</p>
          {/* Comment tooltip */}
          {node.response?.comment && (
            <p className="text-xs text-gray-500 italic mt-1">
              "{node.response.comment}"
            </p>
          )}
        </div>

        {/* Dotted line guide for visual tracking on wide displays */}
        <div className="hidden lg:block shrink-0 mx-2 border-b border-dotted border-gray-300 grow min-w-[20px] max-w-[100px] self-center" />

        {/* Status/Compliance */}
        <div className="shrink-0">
          {isLeaf ? getStatusIndicator() : getComplianceBadge()}
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="mt-1 space-y-1">
          {node.children.map((child, childIndex) => (
            <QuestionComplianceTree
              key={child.id}
              node={child}
              depth={depth + 1}
              index={childIndex}
            />
          ))}
        </div>
      )}
    </div>
  );
}

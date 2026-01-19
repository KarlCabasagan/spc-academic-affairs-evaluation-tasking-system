import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  useOfflineEvaluation,
  type AllResponses,
  type AreaResponses,
} from "../../hooks/useOfflineEvaluation";
import type { Area, Question } from "../../lib/types";
import {
  Button,
  Card,
  Loading,
  ConfirmDialog,
  showToast,
} from "../../components/ui";

interface AreaWithCompliance {
  area: Area;
  compliance: number | null;
  totalQuestions: number;
  answeredQuestions: number;
  complied: number;
  notComplied: number;
  notApplicable: number;
  questionTree: Question[];
}

// Build hierarchical tree from flat question array
function buildQuestionTree(questions: Question[]): Question[] {
  const questionMap = new Map<string, Question>();
  const roots: Question[] = [];

  questions.forEach((q) => {
    questionMap.set(q.id, { ...q, children: [] });
  });

  questions.forEach((q) => {
    const question = questionMap.get(q.id)!;
    if (q.parent_id && questionMap.has(q.parent_id)) {
      const parent = questionMap.get(q.parent_id)!;
      parent.children = parent.children || [];
      parent.children.push(question);
    } else {
      roots.push(question);
    }
  });

  const sortChildren = (items: Question[]) => {
    items.sort((a, b) => a.question_order - b.question_order);
    items.forEach((item) => {
      if (item.children && item.children.length > 0) {
        sortChildren(item.children);
      }
    });
  };
  sortChildren(roots);

  const assignNumbers = (items: Question[], prefix: string = "") => {
    items.forEach((item, index) => {
      const num = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
      item.hierarchical_number = num;
      if (item.children && item.children.length > 0) {
        assignNumbers(item.children, num);
      }
    });
  };
  assignNumbers(roots);

  return roots;
}

// Get all leaf questions
function getLeafQuestions(questions: Question[]): Question[] {
  const leaves: Question[] = [];
  const traverse = (items: Question[]) => {
    items.forEach((item) => {
      if (!item.children || item.children.length === 0) {
        leaves.push(item);
      } else {
        traverse(item.children);
      }
    });
  };
  traverse(questions);
  return leaves;
}

// Question tree display component
interface QuestionTreeProps {
  questions: Question[];
  responses: AreaResponses;
  depth?: number;
}

function QuestionTree({ questions, responses, depth = 0 }: QuestionTreeProps) {
  const getStatusBadge = (questionId: string) => {
    const response = responses[questionId];
    if (!response?.answered) {
      return (
        <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
          No Response
        </span>
      );
    }
    if (response.status === "complied") {
      return (
        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">
          Complied
        </span>
      );
    }
    if (response.status === "not_complied") {
      return (
        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">
          Not Complied
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
        N/A
      </span>
    );
  };

  return (
    <div className="space-y-2">
      {questions.map((question, index) => {
        const hasChildren = question.children && question.children.length > 0;
        const isLastChild = index === questions.length - 1;
        const response = responses[question.id];

        return (
          <div key={question.id} className="relative">
            {/* Connector lines */}
            {depth > 0 && (
              <>
                {/* Horizontal line */}
                <div
                  className="absolute w-4 border-t border-gray-300"
                  style={{ left: -16, top: hasChildren ? 20 : 14 }}
                />
                {/* Vertical line (continues down if not last) */}
                {!isLastChild && (
                  <div
                    className="absolute border-l border-gray-300"
                    style={{ left: -16, top: 0, bottom: 0 }}
                  />
                )}
              </>
            )}

            {hasChildren ? (
              /* Parent section header */
              <div className="ml-0">
                <div className="flex items-start gap-2 py-2 px-3 bg-maroon-50/50 rounded-lg border border-maroon-100">
                  <span className="shrink-0 px-2 py-0.5 bg-maroon-600 text-white rounded text-xs font-bold">
                    {question.hierarchical_number}
                  </span>
                  <span className="font-medium text-gray-800 text-sm">
                    {question.question_text}
                  </span>
                </div>
                {/* Render children */}
                <div className="ml-6 mt-2 relative">
                  {/* Vertical line for children group */}
                  <div
                    className="absolute border-l border-gray-300"
                    style={{ left: -16, top: 0, bottom: 20 }}
                  />
                  <QuestionTree
                    questions={question.children!}
                    responses={responses}
                    depth={depth + 1}
                  />
                </div>
              </div>
            ) : (
              /* Leaf question with response */
              <div className="py-2 px-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-start gap-3">
                  <span className="shrink-0 px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                    {question.hierarchical_number}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="text-sm text-gray-700 flex-1">
                        {question.question_text}
                      </span>
                      {getStatusBadge(question.id)}
                    </div>
                    {response?.comment && (
                      <p className="mt-1 text-xs text-gray-500 italic">
                        "{response.comment}"
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ExportPage() {
  const {
    isOnline,
    isLoading,
    areas,
    completedAreas,
    fetchAreas,
    fetchQuestions,
    getAllResponses,
    calculateOverallCompliance,
    clearAreaResponses,
    clearAllData,
  } = useOfflineEvaluation();

  const [areasWithCompliance, setAreasWithCompliance] = useState<
    AreaWithCompliance[]
  >([]);
  const [allResponses, setAllResponses] = useState<AllResponses>({});
  const [questionsCache, setQuestionsCache] = useState<{
    [areaId: string]: Question[];
  }>({});
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [showClearAreaConfirm, setShowClearAreaConfirm] = useState<
    string | null
  >(null);

  useEffect(() => {
    fetchAreas();
  }, [fetchAreas]);

  useEffect(() => {
    if (areas.length > 0 && completedAreas.length > 0) {
      loadComplianceData();
    } else {
      setIsLoadingData(false);
    }
  }, [areas, completedAreas]);

  const loadComplianceData = async () => {
    setIsLoadingData(true);
    try {
      const responses = getAllResponses();
      setAllResponses(responses);

      const questionsMap: { [areaId: string]: Question[] } = {};
      const areasData: AreaWithCompliance[] = [];

      for (const area of areas) {
        if (completedAreas.includes(area.id)) {
          const questions = await fetchQuestions(area.id);
          questionsMap[area.id] = questions;

          const areaResponses = responses[area.id] || {};
          const tree = buildQuestionTree(questions);
          const leaves = getLeafQuestions(tree);

          let complied = 0;
          let notComplied = 0;
          let notApplicable = 0;
          let answered = 0;

          leaves.forEach((q) => {
            const r = areaResponses[q.id];
            if (r?.answered) {
              answered++;
              if (r.status === "complied") complied++;
              else if (r.status === "not_complied") notComplied++;
              else if (r.status === "not_applicable") notApplicable++;
            }
          });

          const validResponses = complied + notComplied;
          const compliance =
            validResponses > 0 ? (complied / validResponses) * 100 : null;

          areasData.push({
            area,
            compliance,
            totalQuestions: leaves.length,
            answeredQuestions: answered,
            complied,
            notComplied,
            notApplicable,
            questionTree: tree,
          });
        }
      }

      setQuestionsCache(questionsMap);
      setAreasWithCompliance(areasData);
    } catch (err) {
      console.error("Error loading compliance data:", err);
    } finally {
      setIsLoadingData(false);
    }
  };

  const toggleAreaExpand = (areaId: string) => {
    setExpandedAreas((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(areaId)) {
        newSet.delete(areaId);
      } else {
        newSet.add(areaId);
      }
      return newSet;
    });
  };

  const getComplianceColor = (compliance: number | null): string => {
    if (compliance === null) return "text-gray-400";
    if (compliance >= 80) return "text-emerald-600";
    if (compliance >= 50) return "text-amber-600";
    return "text-red-600";
  };

  const getComplianceBg = (compliance: number | null): string => {
    if (compliance === null) return "bg-gray-100";
    if (compliance >= 80) return "bg-emerald-100";
    if (compliance >= 50) return "bg-amber-100";
    return "bg-red-100";
  };

  const handleExportExcel = useCallback(() => {
    if (areasWithCompliance.length === 0) {
      showToast("No completed areas to export", "error");
      return;
    }

    // Build data rows per the user's format requirements
    const rows: (string | number)[][] = [];

    areasWithCompliance.forEach((areaData, areaIndex) => {
      const questions = questionsCache[areaData.area.id] || [];
      const tree = buildQuestionTree(questions);
      const leaves = getLeafQuestions(tree);
      const areaResponses = allResponses[areaData.area.id] || {};

      leaves.forEach((question, qIndex) => {
        const response = areaResponses[question.id];
        const statusText = response?.answered
          ? response.status === "complied"
            ? "Complied"
            : response.status === "not_complied"
            ? "Not Complied"
            : "N/A"
          : "No Response";

        // Area name only on first question
        const areaName =
          qIndex === 0
            ? `Area ${areaData.area.area_number}: ${areaData.area.name}`
            : "";

        rows.push([
          areaName,
          `${question.hierarchical_number} ${question.question_text}`,
          statusText,
          response?.comment || "",
        ]);
      });

      // Add compliance percentage row
      rows.push([
        `Area ${areaData.area.area_number} Compliance`,
        "",
        areaData.compliance !== null
          ? `${areaData.compliance.toFixed(1)}%`
          : "N/A",
        "",
      ]);

      // Add blank row between areas (except after last)
      if (areaIndex < areasWithCompliance.length - 1) {
        rows.push(["", "", "", ""]);
      }
    });

    // Add overall compliance at bottom
    const overallCompliance = calculateOverallCompliance();
    rows.push(["", "", "", ""]);
    rows.push([
      "Overall Compliance",
      "",
      overallCompliance !== null ? `${overallCompliance.toFixed(1)}%` : "N/A",
      "",
    ]);

    // Create workbook
    const headers = ["Area", "Question", "Response", "Comment"];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Set column widths
    ws["!cols"] = [{ wch: 35 }, { wch: 60 }, { wch: 15 }, { wch: 40 }];

    XLSX.utils.book_append_sheet(wb, ws, "Evaluation Results");
    XLSX.writeFile(
      wb,
      `evaluation_results_${new Date().toISOString().split("T")[0]}.xlsx`
    );

    showToast("Results exported successfully", "success");
  }, [
    areasWithCompliance,
    questionsCache,
    allResponses,
    calculateOverallCompliance,
  ]);

  const handleClearArea = (areaId: string) => {
    clearAreaResponses(areaId);
    setAreasWithCompliance((prev) => prev.filter((a) => a.area.id !== areaId));
    setShowClearAreaConfirm(null);
    showToast("Area data cleared", "success");
  };

  const handleClearAll = () => {
    clearAllData();
    setAreasWithCompliance([]);
    setAllResponses({});
    setShowClearAllConfirm(false);
    showToast("All data cleared", "success");
  };

  if (isLoading || isLoadingData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loading size="lg" text="Loading results..." />
      </div>
    );
  }

  const overallCompliance = calculateOverallCompliance();

  return (
    <div className="animate-fade-in">
      {/* Offline Indicator */}
      {!isOnline && (
        <div className="bg-amber-100 border-b border-amber-200 px-4 py-2 text-center">
          <p className="text-sm text-amber-800">
            <span className="font-medium">Offline Mode:</span> Working with
            locally saved data.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="bg-linear-to-r from-maroon-800 to-maroon-900 text-white py-8 sm:py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            to="/public"
            className="inline-flex items-center gap-2 text-maroon-200 hover:text-white transition-colors mb-4"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Areas
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">
            Export Your Results
          </h1>
          <p className="text-maroon-100">
            Review your completed evaluations and export to Excel
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {areasWithCompliance.length === 0 ? (
          <Card className="text-center py-12">
            <svg
              className="w-16 h-16 text-gray-300 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              No Completed Evaluations
            </h2>
            <p className="text-gray-500 mb-6">
              Complete at least one area evaluation to export results.
            </p>
            <Link to="/public">
              <Button>Start Evaluating</Button>
            </Link>
          </Card>
        ) : (
          <>
            {/* Overall Summary */}
            <Card className="mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Overall Summary
                  </h2>
                  <p className="text-sm text-gray-500">
                    {areasWithCompliance.length} area
                    {areasWithCompliance.length > 1 ? "s" : ""} completed
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Overall Compliance</p>
                    <p
                      className={`text-2xl font-bold ${getComplianceColor(
                        overallCompliance
                      )}`}
                    >
                      {overallCompliance !== null
                        ? `${overallCompliance.toFixed(1)}%`
                        : "N/A"}
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 mb-6">
              <Button onClick={handleExportExcel}>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Export to Excel
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowClearAllConfirm(true)}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                Clear All Data
              </Button>
            </div>

            {/* Areas List */}
            <div className="space-y-4">
              {areasWithCompliance.map((areaData) => {
                const isExpanded = expandedAreas.has(areaData.area.id);
                return (
                  <Card key={areaData.area.id} className="overflow-hidden">
                    {/* Area Header - Clickable to expand */}
                    <div
                      className="flex flex-col sm:flex-row sm:items-center gap-4 cursor-pointer"
                      onClick={() => toggleAreaExpand(areaData.area.id)}
                    >
                      {/* Expand/Collapse chevron */}
                      <div className="flex items-center gap-3">
                        <button
                          className="shrink-0 p-1 hover:bg-gray-100 rounded transition-colors"
                          aria-label={isExpanded ? "Collapse" : "Expand"}
                        >
                          <svg
                            className={`w-5 h-5 text-gray-500 transition-transform ${
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
                        </button>
                        <div
                          className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${getComplianceBg(
                            areaData.compliance
                          )} ${getComplianceColor(areaData.compliance)}`}
                        >
                          {areaData.area.area_number}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900">
                          {areaData.area.name}
                        </h3>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
                          <span>
                            {areaData.answeredQuestions} questions answered
                          </span>
                          <span>•</span>
                          <span className="text-green-600">
                            {areaData.complied} complied
                          </span>
                          <span>•</span>
                          <span className="text-red-600">
                            {areaData.notComplied} not complied
                          </span>
                          {areaData.notApplicable > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-gray-400">
                                {areaData.notApplicable} N/A
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div
                        className="flex items-center gap-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div
                          className={`px-3 py-1.5 rounded-lg font-semibold ${getComplianceBg(
                            areaData.compliance
                          )} ${getComplianceColor(areaData.compliance)}`}
                        >
                          {areaData.compliance !== null
                            ? `${areaData.compliance.toFixed(1)}%`
                            : "N/A"}
                        </div>
                        <div className="flex items-center gap-1">
                          <Link to={`/public/evaluate/${areaData.area.id}`}>
                            <Button variant="ghost" size="sm">
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setShowClearAreaConfirm(areaData.area.id)
                            }
                          >
                            <svg
                              className="w-4 h-4 text-red-500"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Question Tree */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <QuestionTree
                          questions={areaData.questionTree}
                          responses={allResponses[areaData.area.id] || {}}
                        />
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-8 flex flex-wrap gap-4 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500" />
                <span>≥80% Compliant</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500" />
                <span>50-79% Compliant</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500" />
                <span>&lt;50% Compliant</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Clear All Confirmation */}
      <ConfirmDialog
        isOpen={showClearAllConfirm}
        onClose={() => setShowClearAllConfirm(false)}
        onConfirm={handleClearAll}
        title="Clear All Data?"
        message="This will permanently delete all your saved responses and completion status. This action cannot be undone."
        confirmText="Clear All"
        confirmVariant="danger"
      />

      {/* Clear Area Confirmation */}
      <ConfirmDialog
        isOpen={!!showClearAreaConfirm}
        onClose={() => setShowClearAreaConfirm(null)}
        onConfirm={() =>
          showClearAreaConfirm && handleClearArea(showClearAreaConfirm)
        }
        title="Clear Area Data?"
        message="This will delete your responses for this area. This action cannot be undone."
        confirmText="Clear"
        confirmVariant="danger"
      />
    </div>
  );
}

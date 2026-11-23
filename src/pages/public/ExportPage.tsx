import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import QuestionComplianceTree from "../../components/admin/QuestionComplianceTree";
import {
  ArrowLeftIcon,
  Button,
  buttonVariants,
  Card,
  ChevronRightIcon,
  ConfirmDialog,
  DownloadIcon,
  EditIcon,
  InfoCircleIcon,
  Loading,
  showToast,
  TrashIcon,
  WifiOffIcon,
} from "../../components/ui";
import { useOfflineEvaluation } from "../../hooks/useOfflineEvaluation";
import {
  type AreaComplianceResult,
  buildQuestionComplianceTree,
  calculateAreaCompliance,
  calculateOverallCompliance,
  COMPLIANCE_TONE_CLASSES,
  getComplianceTone,
  type QuestionComplianceNode,
  type ResponseRecord,
} from "../../lib/compliance";
import {
  exportPublicEvaluationWorkbook,
  formatMatrixCellValue,
  type PublicExportArea,
} from "../../lib/excelExport";
import { buildQuestionTree, getLeafQuestions } from "../../lib/questionTree";
import type { Area, ComplianceStatus } from "../../lib/types";

interface AreaWithCompliance {
  area: Area;
  stats: AreaComplianceResult;
  complianceNodes: QuestionComplianceNode[];
}

function formatStatusText(status: ComplianceStatus | undefined): string {
  switch (status) {
    case "complied":
      return "Complied";
    case "not_complied":
      return "Not Complied";
    case "not_applicable":
      return "Not Applicable";
    default:
      return "Not Answered";
  }
}

function collectLeafExports(
  nodes: readonly QuestionComplianceNode[],
): PublicExportArea["leaves"] {
  const result: PublicExportArea["leaves"] = [];
  const walk = (items: readonly QuestionComplianceNode[]) => {
    for (const node of items) {
      if (node.children.length === 0) {
        result.push({
          hierarchicalNumber: node.hierarchicalNumber,
          questionText: node.questionText,
          statusText: formatStatusText(node.response?.status),
          comment: node.response?.comment ?? null,
        });
      } else {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return result;
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
    clearAreaResponses,
    clearAllData,
  } = useOfflineEvaluation();

  const [areasWithCompliance, setAreasWithCompliance] = useState<
    AreaWithCompliance[]
  >([]);
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(
    () => new Set(),
  );
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [showClearAreaConfirm, setShowClearAreaConfirm] = useState<
    string | null
  >(null);

  const helpersRef = useRef({ fetchQuestions, getAllResponses });
  useEffect(() => {
    helpersRef.current = { fetchQuestions, getAllResponses };
  }, [fetchQuestions, getAllResponses]);

  useEffect(() => {
    void fetchAreas();
  }, [fetchAreas]);

  useEffect(() => {
    if (isLoading) return;
    let cancelled = false;

    const loadComplianceData = async () => {
      try {
        const completedSet = new Set(completedAreas);
        const completedList = areas.filter((a) => completedSet.has(a.id));

        const fetched = await Promise.all(
          completedList.map(async (area) => ({
            area,
            questions: await helpersRef.current.fetchQuestions(area.id),
          })),
        );

        if (cancelled) return;

        const allResponses = helpersRef.current.getAllResponses();
        const computed: AreaWithCompliance[] = fetched.map(
          ({ area, questions }) => {
            const areaRespObj = allResponses[area.id] || {};
            const responseMap = new Map<string, ResponseRecord>();

            Object.entries(areaRespObj).forEach(([qId, entry]) => {
              if (entry?.answered) {
                responseMap.set(entry.questionId || qId, {
                  question_id: entry.questionId || qId,
                  status: entry.status,
                  comment: entry.comment || null,
                });
              }
            });

            const tree = buildQuestionTree(questions);
            const leaves = getLeafQuestions(tree);
            const stats = calculateAreaCompliance(leaves, responseMap);
            const complianceNodes = buildQuestionComplianceTree(
              questions,
              responseMap,
            );

            return { area, stats, complianceNodes };
          },
        );

        setAreasWithCompliance(computed);
      } catch {
        if (!cancelled) {
          showToast("Failed to load evaluation summary.", "error");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingData(false);
        }
      }
    };

    void loadComplianceData();

    return () => {
      cancelled = true;
    };
  }, [isLoading, areas, completedAreas]);

  const toggleAreaExpand = (areaId: string) => {
    setExpandedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(areaId)) {
        next.delete(areaId);
      } else {
        next.add(areaId);
      }
      return next;
    });
  };

  const handleExportExcel = async () => {
    if (areasWithCompliance.length === 0) {
      showToast("No completed evaluations to export.", "error");
      return;
    }

    setIsExporting(true);
    try {
      const exportAreas: PublicExportArea[] = areasWithCompliance.map(
        (item) => ({
          areaNumber: item.area.area_number,
          areaName: item.area.name,
          compliance: item.stats.compliance,
          leaves: collectLeafExports(item.complianceNodes),
        }),
      );

      await exportPublicEvaluationWorkbook({ areas: exportAreas });
      showToast("Excel file exported successfully.", "success");
    } catch {
      showToast("Failed to export Excel workbook.", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearArea = (areaId: string) => {
    const ok = clearAreaResponses(areaId);
    setShowClearAreaConfirm(null);
    if (ok) {
      showToast("Area data cleared.", "success");
    } else {
      showToast("Could not update local browser storage.", "error");
    }
  };

  const handleClearAll = () => {
    const ok = clearAllData();
    setShowClearAllConfirm(false);
    if (ok) {
      showToast("All evaluation data cleared.", "success");
    } else {
      showToast("Could not clear local browser storage.", "error");
    }
  };

  if (isLoading || isLoadingData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loading size="lg" text="Loading results…" />
      </div>
    );
  }

  const overallCompliance = calculateOverallCompliance(
    areasWithCompliance.map((item) => item.stats.compliance),
  );
  const overallTone = getComplianceTone(overallCompliance);
  const overallStyles = COMPLIANCE_TONE_CLASSES[overallTone];

  return (
    <div className="animate-fade-in">
      {!isOnline && (
        <div
          role="status"
          className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-center"
        >
          <p className="text-sm text-amber-900 inline-flex items-center justify-center gap-2">
            <WifiOffIcon className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              <span className="font-medium">Offline Mode:</span> Working with
              locally saved data.
            </span>
          </p>
        </div>
      )}

      {/* Header */}
      <div className="bg-linear-to-r from-maroon-800 to-maroon-900 text-white py-8 sm:py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            to="/public"
            className="inline-flex items-center gap-2 min-h-11 -ml-2 px-2 rounded-lg text-maroon-100 hover:text-white transition-colors duration-150 mb-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Areas
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">
            Export Your Results
          </h1>
          <p className="text-maroon-100 max-w-prose">
            Review your completed evaluations and download them as an Excel
            workbook for your records.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {areasWithCompliance.length === 0 ? (
          <Card className="text-center py-12">
            <InfoCircleIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              No Completed Evaluations
            </h2>
            <p className="text-gray-600 max-w-prose mx-auto mb-6">
              Complete at least one area evaluation to review compliance and
              export results.
            </p>
            <Link to="/public" className={buttonVariants({ variant: "primary" })}>
              Start Evaluating
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
                  <p className="text-sm text-gray-600 tabular-nums mt-0.5">
                    {areasWithCompliance.length} area
                    {areasWithCompliance.length > 1 ? "s" : ""} completed
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-sm text-gray-600">Overall Compliance</p>
                  <p
                    className={`text-2xl font-bold tabular-nums mt-0.5 ${overallStyles.text}`}
                  >
                    {overallCompliance !== null
                      ? `${overallCompliance.toFixed(1)}%`
                      : "N/A"}
                  </p>
                </div>
              </div>
            </Card>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 mb-6">
              <Button
                type="button"
                onClick={handleExportExcel}
                isLoading={isExporting}
              >
                <DownloadIcon className="w-4 h-4" />
                {isExporting ? "Exporting…" : "Export to Excel"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowClearAllConfirm(true)}
              >
                <TrashIcon className="w-4 h-4" />
                Clear All Data
              </Button>
            </div>

            {/* Areas List */}
            <div className="space-y-4">
              {areasWithCompliance.map((areaData) => {
                const { area, stats, complianceNodes } = areaData;
                const isExpanded = expandedAreas.has(area.id);
                const tone = getComplianceTone(stats.compliance);
                const styles = COMPLIANCE_TONE_CLASSES[tone];
                const complianceText = formatMatrixCellValue(
                  stats.displayState,
                  stats.compliance,
                );

                return (
                  <Card key={area.id} className="overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <button
                        type="button"
                        onClick={() => toggleAreaExpand(area.id)}
                        aria-expanded={isExpanded}
                        aria-controls={`export-area-details-${area.id}`}
                        className="flex-1 min-w-0 flex items-start sm:items-center gap-3.5 text-left rounded-lg p-1 -m-1 hover:bg-gray-50 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-800"
                      >
                        <ChevronRightIcon
                          className={`w-5 h-5 text-gray-500 shrink-0 mt-1 sm:mt-0 transition-transform duration-150 ease-out ${
                            isExpanded ? "rotate-90" : ""
                          }`}
                        />
                        <div
                          className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg tabular-nums ${styles.badgeBg} ${styles.text}`}
                        >
                          {area.area_number}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900">
                            {area.name}
                          </h3>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-gray-600 tabular-nums">
                            <span>
                              {stats.answeredCount} / {stats.totalLeaves}{" "}
                              answered
                            </span>
                            <span className="text-emerald-700 font-medium">
                              {stats.compliedCount} complied
                            </span>
                            <span className="text-red-700 font-medium">
                              {stats.notCompliedCount} not complied
                            </span>
                            {stats.notApplicableCount > 0 && (
                              <span className="text-gray-600">
                                {stats.notApplicableCount} N/A
                              </span>
                            )}
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pl-8 sm:pl-0">
                        <span
                          className={`px-3 py-1.5 rounded-lg text-sm font-semibold tabular-nums ${
                            stats.displayState === "percentage"
                              ? `${styles.badgeBg} ${styles.text}`
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {complianceText}
                        </span>
                        <div className="flex items-center gap-1">
                          <Link
                            to={`/public/evaluate/${area.id}`}
                            aria-label={`Edit Area ${area.area_number}: ${area.name}`}
                            className={buttonVariants({
                              variant: "ghost",
                              size: "sm",
                              className: "w-11 h-11 p-0",
                            })}
                          >
                            <EditIcon className="w-4 h-4" />
                          </Link>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Clear Area ${area.area_number}: ${area.name}`}
                            onClick={() => setShowClearAreaConfirm(area.id)}
                            className="w-11 h-11 p-0 text-red-700 hover:bg-red-50"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div
                        id={`export-area-details-${area.id}`}
                        className="mt-4 pt-4 border-t border-gray-200 space-y-2"
                      >
                        {complianceNodes.map((node) => (
                          <QuestionComplianceTree key={node.id} node={node} />
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-700">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full bg-emerald-600"
                  aria-hidden="true"
                />
                <span className="tabular-nums">≥ 80% Compliant</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full bg-amber-600"
                  aria-hidden="true"
                />
                <span className="tabular-nums">50% – 79.9% Moderate</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full bg-red-600"
                  aria-hidden="true"
                />
                <span className="tabular-nums">&lt; 50% Needs Attention</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full bg-gray-500"
                  aria-hidden="true"
                />
                <span>N/A All Items Not Applicable</span>
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

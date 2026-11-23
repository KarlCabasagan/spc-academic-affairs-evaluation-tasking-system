import { useEffect, useMemo, useState, type FormEvent } from "react";
import ComplianceAccordion from "../../components/admin/ComplianceAccordion";
import QuestionComplianceTree from "../../components/admin/QuestionComplianceTree";
import {
  AlertTriangleIcon,
  Button,
  Card,
  ChevronRightIcon,
  ClockIcon,
  DownloadIcon,
  EditIcon,
  Input,
  Loading,
  Modal,
  showToast,
  TrashIcon,
} from "../../components/ui";
import {
  type AreaComplianceResult,
  buildQuestionComplianceTree,
  calculateAreaCompliance,
  calculateOverallCompliance,
  type QuestionComplianceInput,
  type QuestionComplianceNode,
  selectLatestSessionsByArea,
  type SessionWithResponses,
} from "../../lib/compliance";
import {
  type ComplianceWorkbookColumn,
  type ComplianceWorkbookDetailSheet,
  type ComplianceWorkbookRow,
  exportComplianceWorkbook,
} from "../../lib/excelExport";
import { buildQuestionTree, getLeafQuestions } from "../../lib/questionTree";
import { supabase } from "../../lib/supabase";
import type { ComplianceStatus } from "../../lib/types";

interface HistoryRecord {
  id: string;
  name: string;
  archived_at: string;
  total_sessions: number;
  total_responses: number;
}

interface HistorySession {
  id: string;
  college_id: string | null;
  college_name: string | null;
  college_code: string | null;
  completed_at: string | null;
}

interface HistoryResponse {
  id: string;
  history_session_id: string;
  question_id: string | null;
  question_text: string | null;
  question_parent_id: string | null;
  question_order: number | null;
  area_id: string | null;
  area_number: number | null;
  area_name: string | null;
  status: ComplianceStatus;
  comment: string | null;
}

interface ArchivedAreaCompliance {
  areaKey: string;
  areaNumber: number;
  areaName: string;
  stats: AreaComplianceResult;
  questions: QuestionComplianceNode[];
}

interface ArchivedCollegeCompliance {
  collegeKey: string;
  collegeName: string;
  collegeCode: string | null;
  overallCompliance: number | null;
  areas: ArchivedAreaCompliance[];
}

interface ExpandedHistoryData {
  historyId: string;
  colleges: ArchivedCollegeCompliance[];
}

function formatArchiveDate(dateString: string): string {
  return new Date(dateString).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function buildExpandedHistory(
  historyId: string,
  sessions: readonly HistorySession[],
  responses: readonly HistoryResponse[],
): ExpandedHistoryData {
  const responsesBySession = new Map<string, HistoryResponse[]>();
  responses.forEach((r) => {
    const list = responsesBySession.get(r.history_session_id) || [];
    list.push(r);
    responsesBySession.set(r.history_session_id, list);
  });

  // Sort sessions newest-first so selectLatestSessionsByArea keeps latest submission per (college, area)
  const sortedSessions = [...sessions].sort((a, b) => {
    const tA = a.completed_at ? new Date(a.completed_at).getTime() : 0;
    const tB = b.completed_at ? new Date(b.completed_at).getTime() : 0;
    return tB - tA;
  });

  const collegeMeta = new Map<
    string,
    { collegeName: string; collegeCode: string | null }
  >();
  sortedSessions.forEach((s) => {
    const collegeKey = s.college_id || `name:${s.college_name || "unknown"}`;
    if (!collegeMeta.has(collegeKey)) {
      collegeMeta.set(collegeKey, {
        collegeName: s.college_name || "Unknown College",
        collegeCode: s.college_code,
      });
    }
  });

  const questionAreaMap = new Map<string, string>();
  const areaMeta = new Map<string, { areaNumber: number; areaName: string }>();
  const areaQuestionsByKey = new Map<
    string,
    Map<string, QuestionComplianceInput>
  >();

  responses.forEach((r) => {
    const areaKey =
      r.area_id ||
      `num:${r.area_number ?? 0}:${(r.area_name || "Unknown Area").toLowerCase()}`;
    const qKey = r.question_id || r.id;

    questionAreaMap.set(qKey, areaKey);
    if (!areaMeta.has(areaKey)) {
      areaMeta.set(areaKey, {
        areaNumber: r.area_number ?? 0,
        areaName: r.area_name || "Unknown Area",
      });
    }

    let qMap = areaQuestionsByKey.get(areaKey);
    if (!qMap) {
      qMap = new Map();
      areaQuestionsByKey.set(areaKey, qMap);
    }
    if (!qMap.has(qKey)) {
      qMap.set(qKey, {
        id: qKey,
        parent_id: r.question_parent_id,
        question_order: r.question_order ?? 0,
        question_text: r.question_text || "Archived Question",
      });
    }
  });

  const ssotSessions: SessionWithResponses[] = sortedSessions.map((s) => {
    const collegeKey = s.college_id || `name:${s.college_name || "unknown"}`;
    const sessionRows = responsesBySession.get(s.id) || [];
    return {
      id: s.id,
      college_id: collegeKey,
      completed_at: s.completed_at,
      is_complete: true,
      responses: sessionRows.map((r) => ({
        question_id: r.question_id || r.id,
        status: r.status,
        comment: r.comment,
      })),
    };
  });

  const latestByCollege = selectLatestSessionsByArea(
    ssotSessions,
    questionAreaMap,
  );

  const sortedAreas = Array.from(areaMeta.entries()).sort(
    ([, a], [, b]) => a.areaNumber - b.areaNumber,
  );

  const colleges: ArchivedCollegeCompliance[] = Array.from(
    collegeMeta.entries(),
  )
    .map(([collegeKey, meta]) => {
      const collegeAreasMap = latestByCollege.get(collegeKey);

      const areas: ArchivedAreaCompliance[] = [];
      sortedAreas.forEach(([areaKey, info]) => {
        const respMap = collegeAreasMap?.get(areaKey);
        if (!respMap || respMap.size === 0) return;

        // Only include questions actually answered in this college's archive snapshot
        const rawQuestions = Array.from(
          areaQuestionsByKey.get(areaKey)?.values() || [],
        ).filter((q) => respMap.has(q.id));

        const leaves = getLeafQuestions(buildQuestionTree(rawQuestions));
        const stats = calculateAreaCompliance(leaves, respMap);
        const questions = buildQuestionComplianceTree(rawQuestions, respMap);

        areas.push({
          areaKey,
          areaNumber: info.areaNumber,
          areaName: info.areaName,
          stats,
          questions,
        });
      });

      const overallCompliance = calculateOverallCompliance(
        areas.map((a) => a.stats.compliance),
      );

      return {
        collegeKey,
        collegeName: meta.collegeName,
        collegeCode: meta.collegeCode,
        overallCompliance,
        areas,
      };
    })
    .sort((a, b) => a.collegeName.localeCompare(b.collegeName));

  return { historyId, colleges };
}

export default function History() {
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);
  const [expandedData, setExpandedData] = useState<
    Map<string, ExpandedHistoryData>
  >(() => new Map());
  const [loadingHistory, setLoadingHistory] = useState<Set<string>>(
    () => new Set(),
  );
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<HistoryRecord | null>(
    null,
  );
  const [editName, setEditName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingRecord, setDeletingRecord] = useState<HistoryRecord | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchHistoryRecords = async () => {
      try {
        const { data, error } = await supabase
          .from("evaluation_history")
          .select("*")
          .order("archived_at", { ascending: false });

        if (error) throw error;
        if (!cancelled) {
          setHistoryRecords((data || []) as HistoryRecord[]);
        }
      } catch {
        if (!cancelled) {
          showToast("Failed to load history records.", "error");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void fetchHistoryRecords();

    return () => {
      cancelled = true;
    };
  }, []);

  const loadHistoryDetails = async (
    historyId: string,
  ): Promise<ExpandedHistoryData | null> => {
    const cached = expandedData.get(historyId);
    if (cached) return cached;
    if (loadingHistory.has(historyId)) return null;

    setLoadingHistory((prev) => new Set(prev).add(historyId));

    try {
      const { data: sessionsData, error: sessionsError } = await supabase
        .from("history_sessions")
        .select("*")
        .eq("history_id", historyId);

      if (sessionsError) throw sessionsError;

      const sessions = (sessionsData || []) as HistorySession[];
      const sessionIds = sessions.map((s) => s.id);
      const responses: HistoryResponse[] = [];

      for (let i = 0; i < sessionIds.length; i += 50) {
        const { data: chunkData, error: responsesError } = await supabase
          .from("history_responses")
          .select("*")
          .in("history_session_id", sessionIds.slice(i, i + 50));

        if (responsesError) throw responsesError;
        if (chunkData) {
          responses.push(...(chunkData as HistoryResponse[]));
        }
      }

      const built = buildExpandedHistory(historyId, sessions, responses);
      setExpandedData((prev) => {
        const next = new Map(prev);
        next.set(historyId, built);
        return next;
      });
      return built;
    } catch {
      showToast("Failed to load archived evaluation details.", "error");
      return null;
    } finally {
      setLoadingHistory((prev) => {
        const next = new Set(prev);
        next.delete(historyId);
        return next;
      });
    }
  };

  const openEditModal = (record: HistoryRecord) => {
    setEditingRecord(record);
    setEditName(record.name);
    setShowEditModal(true);
  };

  const handleSaveName = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingRecord || !editName.trim() || isSavingName) return;

    setIsSavingName(true);
    try {
      const nextName = editName.trim();
      const { error } = await supabase
        .from("evaluation_history")
        .update({ name: nextName })
        .eq("id", editingRecord.id);

      if (error) throw error;

      setHistoryRecords((prev) =>
        prev.map((r) =>
          r.id === editingRecord.id ? { ...r, name: nextName } : r,
        ),
      );
      showToast("Archive name updated.", "success");
      setShowEditModal(false);
      setEditingRecord(null);
    } catch {
      showToast("Failed to update archive name.", "error");
    } finally {
      setIsSavingName(false);
    }
  };

  const openDeleteModal = (record: HistoryRecord) => {
    setDeletingRecord(record);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!deletingRecord || isDeleting) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("evaluation_history")
        .delete()
        .eq("id", deletingRecord.id);

      if (error) throw error;

      setHistoryRecords((prev) =>
        prev.filter((r) => r.id !== deletingRecord.id),
      );
      setExpandedData((prev) => {
        const next = new Map(prev);
        next.delete(deletingRecord.id);
        return next;
      });

      showToast("History record deleted.", "success");
      setShowDeleteModal(false);
      setDeletingRecord(null);
    } catch {
      showToast("Failed to delete history record.", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const exportHistoryToExcel = async (record: HistoryRecord) => {
    if (exportingId) return;
    setExportingId(record.id);

    try {
      const data =
        expandedData.get(record.id) ?? (await loadHistoryDetails(record.id));
      if (!data || data.colleges.length === 0) {
        showToast("No archived evaluation data to export.", "error");
        return;
      }

      const allAreas = new Map<
        string,
        { areaNumber: number; areaName: string }
      >();
      data.colleges.forEach((college) => {
        college.areas.forEach((area) => {
          if (!allAreas.has(area.areaKey)) {
            allAreas.set(area.areaKey, {
              areaNumber: area.areaNumber,
              areaName: area.areaName,
            });
          }
        });
      });

      const sortedAreas = Array.from(allAreas.entries()).sort(
        ([, a], [, b]) => a.areaNumber - b.areaNumber,
      );

      const matrixColumns: ComplianceWorkbookColumn[] = data.colleges.map(
        (college) => ({
          id: college.collegeKey,
          label: college.collegeCode || college.collegeName,
          overallCompliance: college.overallCompliance,
        }),
      );

      const matrixRows: ComplianceWorkbookRow[] = sortedAreas.map(
        ([areaKey, info]) => {
          const cells: ComplianceWorkbookRow["cells"] = {};
          data.colleges.forEach((college) => {
            const matched = college.areas.find((a) => a.areaKey === areaKey);
            cells[college.collegeKey] = matched
              ? {
                  displayState: matched.stats.displayState,
                  compliance: matched.stats.compliance,
                }
              : {
                  displayState: "no_response",
                  compliance: null,
                };
          });
          return {
            areaLabel: `Area ${info.areaNumber}: ${info.areaName}`,
            cells,
          };
        },
      );

      const detailSheets: ComplianceWorkbookDetailSheet[] = data.colleges.map(
        (college) => ({
          sheetLabel: college.collegeCode || college.collegeName,
          areas: college.areas.map((area) => ({
            areaNumber: area.areaNumber,
            areaName: area.areaName,
            compliance: area.stats.compliance,
            displayState: area.stats.displayState,
            questions: area.questions,
          })),
        }),
      );

      await exportComplianceWorkbook({
        filenameBase: record.name,
        matrixColumns,
        matrixRows,
        detailSheets,
      });
      showToast("Archived evaluation exported successfully.", "success");
    } catch {
      showToast("Failed to export archived evaluation.", "error");
    } finally {
      setExportingId(null);
    }
  };

  const filteredRecords = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return historyRecords;
    return historyRecords.filter((r) => r.name.toLowerCase().includes(query));
  }, [historyRecords, searchTerm]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loading size="lg" text="Loading history records…" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Evaluation History
        </h1>
        <p className="text-gray-600 max-w-prose mt-1">
          Inspect and export archived evaluation snapshots from previous reset
          cycles.
        </p>
      </div>

      {/* Search */}
      <Card className="mb-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div className="flex-1 w-full">
            <Input
              label="Search History"
              placeholder="Search by archive name…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <p className="text-sm text-gray-600 tabular-nums">
            Showing {filteredRecords.length} of {historyRecords.length} record
            {historyRecords.length === 1 ? "" : "s"}
          </p>
        </div>
      </Card>

      {/* History Records */}
      {filteredRecords.length === 0 ? (
        <Card className="text-center py-12">
          <ClockIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h2 className="text-lg font-medium text-gray-900 mb-2">
            {searchTerm ? "No matching archives" : "No history records yet"}
          </h2>
          <p className="text-gray-600 max-w-prose mx-auto">
            {searchTerm
              ? "Try adjusting your search term."
              : "Archived snapshots are automatically created when evaluation data is reset."}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredRecords.map((record) => (
            <HistoryRecordAccordion
              key={record.id}
              record={record}
              expandedData={expandedData.get(record.id)}
              isLoading={loadingHistory.has(record.id)}
              isExporting={exportingId === record.id}
              onExpand={() => void loadHistoryDetails(record.id)}
              onEdit={() => openEditModal(record)}
              onDelete={() => openDeleteModal(record)}
              onExport={() => void exportHistoryToExcel(record)}
            />
          ))}
        </div>
      )}

      {/* Edit Name Modal */}
      <Modal
        isOpen={showEditModal}
        preventClose={isSavingName}
        onClose={() => {
          setShowEditModal(false);
          setEditingRecord(null);
        }}
        title="Edit History Name"
        size="sm"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={isSavingName}
              onClick={() => {
                setShowEditModal(false);
                setEditingRecord(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="edit-history-name-form"
              isLoading={isSavingName}
              disabled={!editName.trim()}
            >
              {isSavingName ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <form id="edit-history-name-form" onSubmit={handleSaveName}>
          <Input
            label="Archive Name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Enter a name for this archive…"
            required
            disabled={isSavingName}
          />
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        preventClose={isDeleting}
        onClose={() => {
          setShowDeleteModal(false);
          setDeletingRecord(null);
        }}
        title="Delete History Record?"
        size="sm"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={isDeleting}
              onClick={() => {
                setShowDeleteModal(false);
                setDeletingRecord(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => void handleDelete()}
              isLoading={isDeleting}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </Button>
          </>
        }
      >
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangleIcon className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
            <p className="text-sm text-red-800 max-w-prose">
              This will permanently delete{" "}
              <strong>"{deletingRecord?.name}"</strong> and all its archived
              sessions and responses. This action cannot be undone.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

interface HistoryRecordAccordionProps {
  record: HistoryRecord;
  expandedData?: ExpandedHistoryData;
  isLoading: boolean;
  isExporting: boolean;
  onExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onExport: () => void;
}

function HistoryRecordAccordion({
  record,
  expandedData,
  isLoading,
  isExporting,
  onExpand,
  onEdit,
  onDelete,
  onExport,
}: HistoryRecordAccordionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggle = () => {
    if (!isExpanded) {
      onExpand();
    }
    setIsExpanded((prev) => !prev);
  };

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={handleToggle}
          className="flex-1 min-w-0 flex items-center gap-3 text-left rounded-lg p-1.5 -m-1.5 hover:bg-gray-50 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-800"
        >
          <ChevronRightIcon
            className={`w-5 h-5 text-gray-500 transition-transform duration-150 ease-out shrink-0 ${
              isExpanded ? "rotate-90" : ""
            }`}
          />

          <div className="w-10 h-10 rounded-lg bg-maroon-100 text-maroon-800 flex items-center justify-center shrink-0">
            <ClockIcon className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 truncate">
              {record.name}
            </h2>
            <p className="text-sm text-gray-600 tabular-nums mt-0.5">
              {formatArchiveDate(record.archived_at)} • {record.total_sessions}{" "}
              sessions • {record.total_responses} responses
            </p>
          </div>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onExport}
            isLoading={isExporting}
            disabled={isExporting}
            aria-label={`Export ${record.name} to Excel`}
            className="w-11 h-11 p-0 text-emerald-700 hover:bg-emerald-50"
          >
            <DownloadIcon className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onEdit}
            aria-label={`Edit name for ${record.name}`}
            className="w-11 h-11 p-0 text-gray-700"
          >
            <EditIcon className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDelete}
            aria-label={`Delete ${record.name}`}
            className="w-11 h-11 p-0 text-red-700 hover:bg-red-50"
          >
            <TrashIcon className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-200 p-4 bg-gray-50/50">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loading size="md" text="Loading archived details…" />
            </div>
          ) : expandedData && expandedData.colleges.length > 0 ? (
            <div className="space-y-3">
              {expandedData.colleges.map((collegeData) => (
                <ComplianceAccordion
                  key={collegeData.collegeKey}
                  title={collegeData.collegeName}
                  subtitle={collegeData.collegeCode || undefined}
                  compliance={collegeData.overallCompliance}
                  displayState={
                    collegeData.overallCompliance !== null
                      ? "percentage"
                      : "no_response"
                  }
                  level="college"
                  icon={
                    <div className="w-10 h-10 rounded-lg bg-maroon-100 text-maroon-800 flex items-center justify-center font-bold text-lg">
                      {collegeData.collegeCode?.[0] ||
                        collegeData.collegeName[0]}
                    </div>
                  }
                >
                  {collegeData.areas.length === 0 ? (
                    <p className="text-gray-600 text-sm py-4">
                      No evaluation data archived for this college.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {collegeData.areas.map((areaData) => (
                        <ComplianceAccordion
                          key={areaData.areaKey}
                          title={`Area ${areaData.areaNumber}: ${areaData.areaName}`}
                          compliance={areaData.stats.compliance}
                          displayState={areaData.stats.displayState}
                          level="area"
                        >
                          {areaData.questions.length === 0 ? (
                            <p className="text-gray-600 text-sm py-4">
                              No questions archived in this area.
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {areaData.questions.map(
                                (questionNode, qIndex) => (
                                  <QuestionComplianceTree
                                    key={questionNode.id}
                                    node={questionNode}
                                    depth={0}
                                    index={qIndex}
                                  />
                                ),
                              )}
                            </div>
                          )}
                        </ComplianceAccordion>
                      ))}
                    </div>
                  )}
                </ComplianceAccordion>
              ))}
            </div>
          ) : (
            <p className="text-gray-600 text-sm text-center py-8">
              No archived evaluation data found for this record.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

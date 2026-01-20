import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { ComplianceStatus } from "../../lib/types";
import {
  Button,
  Card,
  Input,
  Loading,
  Modal,
  showToast,
} from "../../components/ui";
import ComplianceAccordion from "../../components/admin/ComplianceAccordion";
import QuestionComplianceTree from "../../components/admin/QuestionComplianceTree";
import type { QuestionComplianceNode } from "../../components/admin/QuestionComplianceTree";

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

interface AreaComplianceData {
  areaId: string;
  areaNumber: number;
  areaName: string;
  compliance: number | null;
  displayState: "no_questions" | "all_na" | "normal";
  questions: QuestionComplianceNode[];
}

interface CollegeComplianceData {
  collegeId: string | null;
  collegeName: string;
  collegeCode: string | null;
  overallCompliance: number | null;
  areas: AreaComplianceData[];
}

interface ExpandedHistoryData {
  historyId: string;
  colleges: CollegeComplianceData[];
}

export default function History() {
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);
  const [expandedData, setExpandedData] = useState<
    Map<string, ExpandedHistoryData>
  >(new Map());
  const [loadingHistory, setLoadingHistory] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Edit name modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<HistoryRecord | null>(
    null,
  );
  const [editName, setEditName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingRecord, setDeletingRecord] = useState<HistoryRecord | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchHistoryRecords();
  }, []);

  const fetchHistoryRecords = async () => {
    try {
      const { data, error } = await supabase
        .from("evaluation_history")
        .select("*")
        .order("archived_at", { ascending: false });

      if (error) throw error;
      setHistoryRecords(data || []);
    } catch (error) {
      console.error("Error fetching history:", error);
      showToast("Failed to load history records", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Load detailed data for a history record when expanded
  const loadHistoryDetails = async (historyId: string) => {
    if (expandedData.has(historyId)) return; // Already loaded
    if (loadingHistory.has(historyId)) return; // Already loading

    setLoadingHistory((prev) => new Set(prev).add(historyId));

    try {
      // Fetch sessions for this history
      const { data: sessions, error: sessionsError } = await supabase
        .from("history_sessions")
        .select("*")
        .eq("history_id", historyId);

      if (sessionsError) throw sessionsError;

      // Fetch responses for all sessions
      const sessionIds = (sessions || []).map((s: HistorySession) => s.id);
      let responses: HistoryResponse[] = [];

      if (sessionIds.length > 0) {
        const { data: responsesData, error: responsesError } = await supabase
          .from("history_responses")
          .select("*")
          .in("history_session_id", sessionIds);

        if (responsesError) throw responsesError;
        responses = responsesData || [];
      }

      // Process data into college -> area -> question structure
      const collegesMap = new Map<string, CollegeComplianceData>();

      // Group sessions by college
      (sessions || []).forEach((session: HistorySession) => {
        const collegeKey = session.college_id || "unknown";
        if (!collegesMap.has(collegeKey)) {
          collegesMap.set(collegeKey, {
            collegeId: session.college_id,
            collegeName: session.college_name || "Unknown College",
            collegeCode: session.college_code,
            overallCompliance: null,
            areas: [],
          });
        }
      });

      // Group responses by session -> area
      const sessionResponsesMap = new Map<string, HistoryResponse[]>();
      responses.forEach((r) => {
        const existing = sessionResponsesMap.get(r.history_session_id) || [];
        existing.push(r);
        sessionResponsesMap.set(r.history_session_id, existing);
      });

      // Process each college
      collegesMap.forEach((collegeData, collegeKey) => {
        // Get sessions for this college
        const collegeSessions = (sessions || []).filter(
          (s: HistorySession) => (s.college_id || "unknown") === collegeKey,
        );

        // Get all responses for this college's sessions
        const collegeResponses: HistoryResponse[] = [];
        collegeSessions.forEach((session: HistorySession) => {
          const sessionResponses = sessionResponsesMap.get(session.id) || [];
          collegeResponses.push(...sessionResponses);
        });

        // Group responses by area
        const areasMap = new Map<string, HistoryResponse[]>();
        collegeResponses.forEach((r) => {
          const areaKey = r.area_id || "unknown";
          const existing = areasMap.get(areaKey) || [];
          existing.push(r);
          areasMap.set(areaKey, existing);
        });

        // Build area compliance data
        const areasData: AreaComplianceData[] = [];
        areasMap.forEach((areaResponses, areaKey) => {
          const firstResponse = areaResponses[0];
          const questionTree = buildQuestionTree(areaResponses);
          const areaCompliance = calculateTreeCompliance(questionTree);

          // Determine display state
          let displayState: "no_questions" | "all_na" | "normal" = "normal";
          if (questionTree.length === 0) {
            displayState = "no_questions";
          } else if (questionTree.every((q) => q.compliance === -1)) {
            displayState = "all_na";
          }

          areasData.push({
            areaId: areaKey,
            areaNumber: firstResponse?.area_number || 0,
            areaName: firstResponse?.area_name || "Unknown Area",
            compliance: areaCompliance,
            displayState,
            questions: questionTree,
          });
        });

        // Sort areas by area_number
        areasData.sort((a, b) => a.areaNumber - b.areaNumber);

        // Calculate overall compliance
        const validAreas = areasData.filter(
          (a) => a.displayState === "normal" && a.compliance !== null,
        );
        collegeData.overallCompliance =
          validAreas.length > 0
            ? validAreas.reduce((sum, a) => sum + (a.compliance ?? 0), 0) /
              validAreas.length
            : null;
        collegeData.areas = areasData;
      });

      setExpandedData((prev) => {
        const newMap = new Map(prev);
        newMap.set(historyId, {
          historyId,
          colleges: Array.from(collegesMap.values()),
        });
        return newMap;
      });
    } catch (error) {
      console.error("Error loading history details:", error);
      showToast("Failed to load history details", "error");
    } finally {
      setLoadingHistory((prev) => {
        const newSet = new Set(prev);
        newSet.delete(historyId);
        return newSet;
      });
    }
  };

  // Build hierarchical question tree from flat responses
  const buildQuestionTree = (
    responses: HistoryResponse[],
  ): QuestionComplianceNode[] => {
    // Create map of question_id -> response
    const responseMap = new Map<string, HistoryResponse>();
    responses.forEach((r) => {
      if (r.question_id) {
        responseMap.set(r.question_id, r);
      }
    });

    // Find root questions (no parent)
    const roots = responses.filter((r) => !r.question_parent_id);

    // Recursive function to build tree
    const buildNode = (
      response: HistoryResponse,
      prefix: string,
      index: number,
    ): QuestionComplianceNode => {
      const hierarchicalNumber = prefix
        ? `${prefix}.${index + 1}`
        : `${index + 1}`;

      // Find children
      const children = responses
        .filter((r) => r.question_parent_id === response.question_id)
        .sort((a, b) => (a.question_order || 0) - (b.question_order || 0))
        .map((child, childIndex) =>
          buildNode(child, hierarchicalNumber, childIndex),
        );

      const isLeaf = children.length === 0;

      // Calculate compliance
      let compliance: number;
      if (isLeaf) {
        if (response.status === "not_applicable") {
          compliance = -1; // Sentinel for N/A
        } else {
          compliance = response.status === "complied" ? 100 : 0;
        }
      } else {
        const validChildren = children.filter((c) => c.compliance !== -1);
        if (validChildren.length > 0) {
          compliance =
            validChildren.reduce((sum, c) => sum + c.compliance, 0) /
            validChildren.length;
        } else {
          compliance = -1;
        }
      }

      return {
        id: response.question_id || response.id,
        questionText: response.question_text || "Unknown Question",
        hierarchicalNumber,
        response: {
          status: response.status,
          comment: response.comment,
        },
        compliance,
        children,
      };
    };

    // Sort roots and build tree
    return roots
      .sort((a, b) => (a.question_order || 0) - (b.question_order || 0))
      .map((root, index) => buildNode(root, "", index));
  };

  // Calculate overall compliance for a question tree
  const calculateTreeCompliance = (
    nodes: QuestionComplianceNode[],
  ): number | null => {
    if (nodes.length === 0) return null;
    const validNodes = nodes.filter((n) => n.compliance !== -1);
    if (validNodes.length === 0) return null;
    return (
      validNodes.reduce((sum, n) => sum + n.compliance, 0) / validNodes.length
    );
  };

  // Open edit modal
  const openEditModal = (record: HistoryRecord) => {
    setEditingRecord(record);
    setEditName(record.name);
    setShowEditModal(true);
  };

  // Save edited name
  const handleSaveName = async () => {
    if (!editingRecord || !editName.trim()) return;

    setIsSavingName(true);
    try {
      const { error } = await supabase
        .from("evaluation_history")
        .update({ name: editName.trim() })
        .eq("id", editingRecord.id);

      if (error) throw error;

      // Update local state
      setHistoryRecords((prev) =>
        prev.map((r) =>
          r.id === editingRecord.id ? { ...r, name: editName.trim() } : r,
        ),
      );

      showToast("History name updated", "success");
      setShowEditModal(false);
      setEditingRecord(null);
    } catch (error) {
      console.error("Error updating name:", error);
      showToast("Failed to update name", "error");
    } finally {
      setIsSavingName(false);
    }
  };

  // Open delete modal
  const openDeleteModal = (record: HistoryRecord) => {
    setDeletingRecord(record);
    setShowDeleteModal(true);
  };

  // Delete history record
  const handleDelete = async () => {
    if (!deletingRecord) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("evaluation_history")
        .delete()
        .eq("id", deletingRecord.id);

      if (error) throw error;

      // Update local state
      setHistoryRecords((prev) =>
        prev.filter((r) => r.id !== deletingRecord.id),
      );
      setExpandedData((prev) => {
        const newMap = new Map(prev);
        newMap.delete(deletingRecord.id);
        return newMap;
      });

      showToast("History record deleted", "success");
      setShowDeleteModal(false);
      setDeletingRecord(null);
    } catch (error) {
      console.error("Error deleting history:", error);
      showToast("Failed to delete history record", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  // Filter records by search term
  const filteredRecords = historyRecords.filter((r) =>
    r.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loading size="lg" text="Loading history records..." />
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
        <p className="text-gray-600 mt-1">
          View archived evaluation data from previous reset cycles
        </p>
      </div>

      {/* Search */}
      <Card className="mb-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div className="flex-1 w-full">
            <Input
              label="Search History"
              placeholder="Search by archive name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="text-sm text-gray-500">
            Showing {filteredRecords.length} of {historyRecords.length} records
          </div>
        </div>
      </Card>

      {/* History Records */}
      {filteredRecords.length === 0 ? (
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
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {searchTerm ? "No matching records" : "No history records yet"}
          </h3>
          <p className="text-gray-500">
            {searchTerm
              ? "Try adjusting your search term"
              : "History records are created when you reset evaluation data"}
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
              onExpand={() => loadHistoryDetails(record.id)}
              onEdit={() => openEditModal(record)}
              onDelete={() => openDeleteModal(record)}
              formatDate={formatDate}
            />
          ))}
        </div>
      )}

      {/* Edit Name Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingRecord(null);
        }}
        title="Edit History Name"
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="Archive Name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Enter a name for this archive..."
          />
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setShowEditModal(false);
                setEditingRecord(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveName}
              isLoading={isSavingName}
              disabled={!editName.trim()}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeletingRecord(null);
        }}
        title="Delete History Record?"
        size="sm"
      >
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-red-600 shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <p className="text-sm text-red-700">
                  This will permanently delete{" "}
                  <strong>"{deletingRecord?.name}"</strong> and all its archived
                  data. This action cannot be undone.
                </p>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setShowDeleteModal(false);
                setDeletingRecord(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              isLoading={isDeleting}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// Sub-component for history record accordion
interface HistoryRecordAccordionProps {
  record: HistoryRecord;
  expandedData?: ExpandedHistoryData;
  isLoading: boolean;
  onExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  formatDate: (date: string) => string;
}

function HistoryRecordAccordion({
  record,
  expandedData,
  isLoading,
  onExpand,
  onEdit,
  onDelete,
  formatDate,
}: HistoryRecordAccordionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggle = () => {
    if (!isExpanded) {
      onExpand();
    }
    setIsExpanded(!isExpanded);
  };

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <button
          onClick={handleToggle}
          className="flex-1 flex items-center gap-3 text-left hover:bg-gray-50 -m-4 p-4 transition-colors"
        >
          {/* Expand Icon */}
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

          {/* Clock Icon */}
          <div className="w-10 h-10 rounded-lg bg-maroon-100 text-maroon-800 flex items-center justify-center shrink-0">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          {/* Title & Meta */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">
              {record.name}
            </h3>
            <p className="text-sm text-gray-500">
              {formatDate(record.archived_at)} • {record.total_sessions}{" "}
              sessions • {record.total_responses} responses
            </p>
          </div>
        </button>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onEdit}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Edit name"
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
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete"
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
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-gray-200 p-4 bg-gray-50/50">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loading size="md" text="Loading details..." />
            </div>
          ) : expandedData && expandedData.colleges.length > 0 ? (
            <div className="space-y-3">
              {expandedData.colleges.map((collegeData) => (
                <ComplianceAccordion
                  key={collegeData.collegeId || "unknown"}
                  title={collegeData.collegeName}
                  subtitle={collegeData.collegeCode || undefined}
                  compliance={collegeData.overallCompliance}
                  level="college"
                  icon={
                    <div className="w-10 h-10 rounded-lg bg-maroon-100 text-maroon-800 flex items-center justify-center font-bold text-lg">
                      {collegeData.collegeCode?.[0] ||
                        collegeData.collegeName[0]}
                    </div>
                  }
                >
                  {collegeData.areas.length === 0 ? (
                    <p className="text-gray-500 text-sm py-4">
                      No evaluation data
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {collegeData.areas.map((areaData) => (
                        <ComplianceAccordion
                          key={areaData.areaId}
                          title={`Area ${areaData.areaNumber}: ${areaData.areaName}`}
                          compliance={areaData.compliance}
                          displayState={areaData.displayState}
                          level="area"
                        >
                          {areaData.questions.length === 0 ? (
                            <p className="text-gray-500 text-sm py-4">
                              No questions in this area
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
            <p className="text-gray-500 text-sm text-center py-8">
              No archived data found for this record
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

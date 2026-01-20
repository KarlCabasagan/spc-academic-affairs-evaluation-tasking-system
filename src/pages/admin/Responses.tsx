import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import type {
  College,
  Area,
  Question,
  ComplianceStatus,
} from "../../lib/types";
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

interface ResponseData {
  id: string;
  question_id: string;
  status: ComplianceStatus;
  comment: string | null;
}

interface SessionData {
  id: string;
  college_id: string;
  completed_at: string | null; // For SSOT ordering
  responses: ResponseData[];
}

interface AreaComplianceData {
  area: Area;
  compliance: number | null; // null = no questions in area (exclude from overall)
  hasQuestions: boolean; // Track if area has any questions
  displayState: "no_questions" | "all_na" | "normal"; // For UI display
  questions: QuestionComplianceNode[];
}

interface CollegeComplianceData {
  college: College;
  overallCompliance: number | null; // null only if ALL areas have no questions
  areas: AreaComplianceData[];
}

export default function Responses() {
  const { user } = useAuth();
  const [collegesData, setCollegesData] = useState<CollegeComplianceData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Reset data modal state
  const [showResetModal, setShowResetModal] = useState(false);

  useEffect(() => {
    fetchComplianceData();

    // Set up real-time subscriptions
    const sessionsChannel = supabase
      .channel("responses-sessions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "evaluation_sessions" },
        () => {
          fetchComplianceData();
        },
      )
      .subscribe();

    const responsesChannel = supabase
      .channel("responses-responses")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "responses" },
        () => {
          fetchComplianceData();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sessionsChannel);
      supabase.removeChannel(responsesChannel);
    };
  }, []);

  // Handle data reset with password verification
  const handleResetData = async (password: string): Promise<boolean> => {
    if (!user?.email) {
      showToast("User not authenticated", "error");
      return false;
    }
    try {
      // Verify admin password using sign in
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: password,
      });

      if (authError) {
        showToast("Invalid password. Please try again.", "error");
        return false;
      }

      // ====================================
      // STEP 1: Archive data before deletion
      // ====================================

      // Fetch all sessions with college info
      const { data: sessions, error: fetchSessionsError } = await supabase
        .from("evaluation_sessions")
        .select(
          `
          id,
          session_token,
          college_id,
          started_at,
          completed_at,
          colleges (
            id,
            name,
            code
          )
        `,
        )
        .eq("is_complete", true);

      if (fetchSessionsError) throw fetchSessionsError;

      // Fetch all responses with question and area info
      const { data: responses, error: fetchResponsesError } =
        await supabase.from("responses").select(`
          id,
          session_id,
          question_id,
          status,
          comment,
          questions (
            id,
            question_text,
            parent_id,
            question_order,
            area_id,
            areas (
              id,
              area_number,
              name
            )
          )
        `);

      if (fetchResponsesError) throw fetchResponsesError;

      // Only create history if there's data to archive
      if (sessions && sessions.length > 0) {
        // Auto-generate history name with timestamp
        const now = new Date();
        const historyName = `Evaluation Archive - ${now.toLocaleString(
          "en-US",
          {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          },
        )}`;

        // Create history record
        const { data: historyRecord, error: historyError } = await supabase
          .from("evaluation_history")
          .insert({
            name: historyName,
            archived_by: user.id,
            total_sessions: sessions.length,
            total_responses: responses?.length || 0,
          })
          .select()
          .single();

        if (historyError) throw historyError;

        // Archive sessions with denormalized college info
        const sessionInserts = sessions.map((session: any) => ({
          history_id: historyRecord.id,
          original_session_id: session.id,
          college_id: session.college_id,
          college_name: session.colleges?.name || null,
          college_code: session.colleges?.code || null,
          session_token: session.session_token,
          started_at: session.started_at,
          completed_at: session.completed_at,
        }));

        const { data: insertedSessions, error: sessionsInsertError } =
          await supabase
            .from("history_sessions")
            .insert(sessionInserts)
            .select();

        if (sessionsInsertError) throw sessionsInsertError;

        // Create a map of original session ID to new history session ID
        const sessionIdMap = new Map<string, string>();
        insertedSessions?.forEach((hs: any, index: number) => {
          sessionIdMap.set(sessions[index].id, hs.id);
        });

        // Archive responses with denormalized question/area info
        if (responses && responses.length > 0) {
          const responseInserts = responses
            .filter((r: any) => sessionIdMap.has(r.session_id))
            .map((response: any) => ({
              history_session_id: sessionIdMap.get(response.session_id),
              original_response_id: response.id,
              question_id: response.question_id,
              question_text: response.questions?.question_text || null,
              question_parent_id: response.questions?.parent_id || null,
              question_order: response.questions?.question_order || null,
              area_id: response.questions?.area_id || null,
              area_number: response.questions?.areas?.area_number || null,
              area_name: response.questions?.areas?.name || null,
              status: response.status,
              comment: response.comment,
            }));

          if (responseInserts.length > 0) {
            const { error: responsesInsertError } = await supabase
              .from("history_responses")
              .insert(responseInserts);

            if (responsesInsertError) throw responsesInsertError;
          }
        }
      }

      // ====================================
      // STEP 2: Delete original data
      // ====================================

      // Delete all responses first (foreign key constraint)
      const { error: responsesError } = await supabase
        .from("responses")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all

      if (responsesError) throw responsesError;

      // Delete all evaluation sessions
      const { error: sessionsError } = await supabase
        .from("evaluation_sessions")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all

      if (sessionsError) throw sessionsError;

      showToast(
        sessions && sessions.length > 0
          ? "Data archived to history and reset successfully"
          : "All evaluation data has been reset",
        "success",
      );
      setShowResetModal(false);
      fetchComplianceData(); // Refresh data
      return true;
    } catch (error) {
      console.error("Error resetting data:", error);
      showToast("Failed to reset data. Please try again.", "error");
      return false;
    }
  };

  const fetchComplianceData = async () => {
    try {
      // Fetch all active colleges
      const { data: colleges, error: collegesError } = await supabase
        .from("colleges")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (collegesError) throw collegesError;

      // Fetch all active areas
      const { data: areas, error: areasError } = await supabase
        .from("areas")
        .select("*")
        .eq("is_active", true)
        .order("area_number", { ascending: true });

      if (areasError) throw areasError;

      // Fetch all questions (for building hierarchy)
      const { data: questions, error: questionsError } = await supabase
        .from("questions")
        .select("*")
        .eq("is_active", true)
        .order("question_order", { ascending: true });

      if (questionsError) throw questionsError;

      // Fetch all completed sessions with responses and completed_at for SSOT
      const { data: sessions, error: sessionsError } = await supabase
        .from("evaluation_sessions")
        .select(
          `
          id,
          college_id,
          completed_at,
          responses (
            id,
            question_id,
            status,
            comment
          )
        `,
        )
        .eq("is_complete", true)
        .order("completed_at", { ascending: false }); // Most recent first

      if (sessionsError) throw sessionsError;

      // Process data for each college
      const processedData: CollegeComplianceData[] = (colleges || []).map(
        (college) => {
          // Get all sessions for this college (ordered by most recent first)
          const collegeSessions = (sessions || []).filter(
            (s: SessionData) => s.college_id === college.id,
          );

          // SSOT: For each area, use ONLY the most recent session's responses
          // Create a map: area_id -> Map<question_id, response>
          const areaResponseMaps = new Map<string, Map<string, ResponseData>>();

          // Initialize areas
          (areas || []).forEach((area) => {
            areaResponseMaps.set(area.id, new Map());
          });

          // Process sessions (most recent first due to ordering)
          // For each area, track which sessions we've already seen
          const processedAreaSessions = new Map<string, boolean>();

          collegeSessions.forEach((session: SessionData) => {
            if (!session.responses) return;

            // Group this session's responses by area
            const sessionResponsesByArea = new Map<string, ResponseData[]>();
            session.responses.forEach((r) => {
              // Find which area this question belongs to
              const question = (questions || []).find(
                (q: Question) => q.id === r.question_id,
              );
              if (question) {
                const areaResponses =
                  sessionResponsesByArea.get(question.area_id) || [];
                areaResponses.push(r);
                sessionResponsesByArea.set(question.area_id, areaResponses);
              }
            });

            // For each area in this session, if we haven't processed that area yet,
            // use these responses (they're from the most recent session for this area)
            sessionResponsesByArea.forEach((responses, areaId) => {
              if (!processedAreaSessions.has(areaId)) {
                processedAreaSessions.set(areaId, true);
                const areaMap = areaResponseMaps.get(areaId) || new Map();
                responses.forEach((r) => {
                  areaMap.set(r.question_id, r);
                });
                areaResponseMaps.set(areaId, areaMap);
              }
            });
          });

          // Process each area using SSOT per-area response maps
          const areasData: AreaComplianceData[] = (areas || []).map((area) => {
            // Get questions for this area
            const areaQuestions = (questions || []).filter(
              (q: Question) => q.area_id === area.id,
            );

            // Track if area has questions
            const hasQuestions = areaQuestions.length > 0;

            // Get the SSOT response map for this area (most recent session only)
            const areaResponseMap = areaResponseMaps.get(area.id) || new Map();

            // Build hierarchical question tree with compliance
            const questionTree = buildQuestionTree(
              areaQuestions,
              areaResponseMap,
            );

            // Determine displayState:
            // - 'no_questions': area has no questions
            // - 'all_na': all root questions are N/A (-1)
            // - 'normal': has valid compliance data
            let displayState: "no_questions" | "all_na" | "normal" = "normal";
            if (!hasQuestions) {
              displayState = "no_questions";
            } else if (questionTree.length > 0) {
              const allRootNA = questionTree.every((q) => q.compliance === -1);
              if (allRootNA) {
                displayState = "all_na";
              }
            }

            // Calculate area compliance
            // If no questions, compliance is null (exclude from overall)
            // If all N/A, compliance is null but displayState shows 'all_na'
            const areaCompliance = hasQuestions
              ? calculateTreeCompliance(questionTree)
              : null;

            return {
              area,
              compliance: areaCompliance,
              hasQuestions,
              displayState,
              questions: questionTree,
            };
          });

          // Calculate overall college compliance
          // Exclude: areas with NO questions AND areas where ALL questions are N/A
          // This ensures N/A areas don't penalize the overall percentage
          const areasWithValidCompliance = areasData.filter(
            (a) => a.hasQuestions && a.displayState !== "all_na",
          );
          const overallCompliance =
            areasWithValidCompliance.length > 0
              ? areasWithValidCompliance.reduce(
                  (sum, a) => sum + (a.compliance ?? 0),
                  0,
                ) / areasWithValidCompliance.length
              : null; // null if ALL areas have no questions or are all N/A

          return {
            college,
            overallCompliance,
            areas: areasData,
          };
        },
      );

      setCollegesData(processedData);
    } catch (error) {
      console.error("Error fetching compliance data:", error);
      showToast("Failed to load compliance data", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Build hierarchical question tree with compliance data
  const buildQuestionTree = (
    questions: Question[],
    responseMap: Map<string, ResponseData>,
  ): QuestionComplianceNode[] => {
    // Create map for quick lookup
    const questionMap = new Map<string, Question>();
    questions.forEach((q) => questionMap.set(q.id, q));

    // Find root questions (no parent)
    const roots = questions.filter((q) => !q.parent_id);

    // Recursive function to build tree
    const buildNode = (
      question: Question,
      prefix: string,
      index: number,
    ): QuestionComplianceNode => {
      const hierarchicalNumber = prefix
        ? `${prefix}.${index + 1}`
        : `${index + 1}`;
      const children = questions
        .filter((q) => q.parent_id === question.id)
        .sort((a, b) => a.question_order - b.question_order)
        .map((child, childIndex) =>
          buildNode(child, hierarchicalNumber, childIndex),
        );

      const response = responseMap.get(question.id);
      const isLeaf = children.length === 0;

      // Calculate compliance
      let compliance: number;
      if (isLeaf) {
        // Leaf node: use direct response
        if (response) {
          if (response.status === "not_applicable") {
            // N/A: mark specially for exclusion from parent calculations
            // We use -1 as a sentinel value to indicate N/A for filtering
            compliance = -1; // Sentinel for N/A
          } else {
            compliance = response.status === "complied" ? 100 : 0;
          }
        } else {
          // No response = 0% (zero-baseline requirement)
          compliance = 0;
        }
      } else {
        // Parent node: exclude N/A children from denominator
        // Only average children that have actual compliance data
        const validChildren = children.filter((c) => c.compliance !== -1);

        if (validChildren.length > 0) {
          compliance =
            validChildren.reduce((sum, c) => sum + c.compliance, 0) /
            validChildren.length;
        } else {
          // All children are N/A - parent becomes N/A too
          compliance = -1;
        }
      }

      return {
        id: question.id,
        questionText: question.question_text,
        hierarchicalNumber,
        response: response
          ? { status: response.status, comment: response.comment }
          : null,
        compliance,
        children,
      };
    };

    // Sort roots and build tree
    return roots
      .sort((a, b) => a.question_order - b.question_order)
      .map((root, index) => buildNode(root, "", index));
  };

  // Calculate overall compliance for a question tree
  // Excludes N/A (-1) from the calculation for consistency with parent logic
  const calculateTreeCompliance = (nodes: QuestionComplianceNode[]): number => {
    if (nodes.length === 0) return 0;
    // Filter out N/A nodes (-1)
    const validNodes = nodes.filter((n) => n.compliance !== -1);
    if (validNodes.length === 0) return 0; // All N/A = 0% for area level
    return (
      validNodes.reduce((sum, n) => sum + n.compliance, 0) / validNodes.length
    );
  };

  // Filter colleges by search term
  const filteredColleges = collegesData.filter(
    (cd) =>
      cd.college.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cd.college.code?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loading size="lg" text="Loading compliance data..." />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Compliance Analytics
          </h1>
          <p className="text-gray-600 mt-1">
            View evaluation compliance by college, area, and question
          </p>
        </div>
        <Button
          variant="danger"
          onClick={() => setShowResetModal(true)}
          className="shrink-0 self-start sm:self-auto"
        >
          <svg
            className="w-4 h-4 mr-2"
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
          Reset All Data
        </Button>
      </div>

      {/* Search & Actions */}
      <Card className="mb-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div className="flex-1 w-full">
            <Input
              label="Search Colleges"
              placeholder="Search by name or code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="text-sm text-gray-500">
            Showing {filteredColleges.length} of {collegesData.length} colleges
          </div>
        </div>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-6 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-emerald-500" />
          <span className="text-gray-600">≥80% Compliant</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-amber-500" />
          <span className="text-gray-600">50-79% Compliant</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-gray-600">&lt;50% Compliant</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-gray-300" />
          <span className="text-gray-600">No Data</span>
        </div>
      </div>

      {/* College Accordions */}
      {filteredColleges.length === 0 ? (
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
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {searchTerm ? "No colleges found" : "No college accounts yet"}
          </h3>
          <p className="text-gray-500">
            {searchTerm
              ? "Try adjusting your search term"
              : "Create college accounts to track compliance"}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredColleges.map((collegeData) => (
            <ComplianceAccordion
              key={collegeData.college.id}
              title={collegeData.college.name}
              subtitle={collegeData.college.code || undefined}
              compliance={collegeData.overallCompliance}
              level="college"
              icon={
                collegeData.college.avatar_url ? (
                  <img
                    src={collegeData.college.avatar_url}
                    alt={collegeData.college.name}
                    className="w-10 h-10 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-maroon-100 text-maroon-800 flex items-center justify-center font-bold text-lg">
                    {collegeData.college.code?.[0] ||
                      collegeData.college.name[0]}
                  </div>
                )
              }
            >
              {/* Area Accordions */}
              {collegeData.areas.length === 0 ? (
                <p className="text-gray-500 text-sm py-4">
                  No evaluation areas configured
                </p>
              ) : (
                <div className="space-y-3">
                  {collegeData.areas.map((areaData) => (
                    <ComplianceAccordion
                      key={areaData.area.id}
                      title={`Area ${areaData.area.area_number}: ${areaData.area.name}`}
                      subtitle={areaData.area.description || undefined}
                      compliance={areaData.compliance}
                      displayState={areaData.displayState}
                      level="area"
                    >
                      {/* Question Tree */}
                      {areaData.questions.length === 0 ? (
                        <p className="text-gray-500 text-sm py-4">
                          No questions in this area
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {areaData.questions.map((questionNode, qIndex) => (
                            <QuestionComplianceTree
                              key={questionNode.id}
                              node={questionNode}
                              depth={0}
                              index={qIndex}
                            />
                          ))}
                        </div>
                      )}
                    </ComplianceAccordion>
                  ))}
                </div>
              )}
            </ComplianceAccordion>
          ))}
        </div>
      )}

      {/* Reset Data Confirmation Modal */}
      <ResetDataModal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        onReset={handleResetData}
      />
    </div>
  );
}

// Extracted modal component to prevent re-renders when typing password
interface ResetDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReset: (password: string) => Promise<boolean>;
}

function ResetDataModal({ isOpen, onClose, onReset }: ResetDataModalProps) {
  const [password, setPassword] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  const handleSubmit = async () => {
    if (!password.trim()) {
      showToast("Please enter your password", "error");
      return;
    }

    setIsResetting(true);
    const success = await onReset(password);
    setIsResetting(false);

    if (success) {
      setPassword("");
    }
  };

  const handleClose = () => {
    setPassword("");
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Reset All Evaluation Data?"
      size="md"
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
              <h4 className="font-semibold text-red-800">Danger Zone</h4>
              <p className="text-sm text-red-700 mt-1">
                This will <strong>permanently delete</strong>:
              </p>
              <ul className="text-sm text-red-700 mt-2 list-disc list-inside">
                <li>All evaluation sessions</li>
                <li>All responses from all colleges</li>
              </ul>
              <p className="text-sm text-red-700 mt-2 font-medium">
                This action CANNOT be undone.
              </p>
            </div>
          </div>
        </div>

        {/* Export Reminder */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-amber-600 shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <h4 className="font-semibold text-amber-800">
                Before You Continue
              </h4>
              <p className="text-sm text-amber-700 mt-1">
                Make sure to <strong>export the compliance reports</strong> from
                the <span className="underline">Reports page</span> before
                resetting all data.
              </p>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Enter your password to confirm
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
            placeholder="Your admin password"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleSubmit}
            isLoading={isResetting}
            disabled={!password.trim()}
          >
            Reset All Data
          </Button>
        </div>
      </div>
    </Modal>
  );
}

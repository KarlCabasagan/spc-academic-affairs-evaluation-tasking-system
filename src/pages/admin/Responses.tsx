import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import ComplianceAccordion from "../../components/admin/ComplianceAccordion";
import QuestionComplianceTree from "../../components/admin/QuestionComplianceTree";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  Button,
  Card,
  InfoCircleIcon,
  Input,
  Loading,
  Modal,
  showToast,
  TrashIcon,
} from "../../components/ui";
import { useAuth } from "../../context/useAuth";
import {
  type AreaComplianceResult,
  buildQuestionComplianceTree,
  calculateAreaCompliance,
  calculateOverallCompliance,
  type QuestionComplianceNode,
  selectLatestSessionsByArea,
  type SessionWithResponses,
} from "../../lib/compliance";
import { buildQuestionTree, getLeafQuestions } from "../../lib/questionTree";
import { supabase, supabaseNoPersist } from "../../lib/supabase";
import type { Area, College, ComplianceStatus, Question } from "../../lib/types";

interface AreaComplianceData {
  area: Area;
  stats: AreaComplianceResult;
  questions: QuestionComplianceNode[];
}

interface CollegeComplianceData {
  college: College;
  overallCompliance: number | null;
  areas: AreaComplianceData[];
}

interface ArchiveSessionRow {
  id: string;
  session_token: string;
  college_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  colleges: {
    id: string;
    name: string;
    code: string | null;
  } | null;
}

interface ArchiveResponseRow {
  id: string;
  session_id: string;
  question_id: string;
  status: ComplianceStatus;
  comment: string | null;
  questions: {
    id: string;
    question_text: string;
    parent_id: string | null;
    question_order: number | null;
    area_id: string;
    areas: {
      id: string;
      area_number: number;
      name: string;
    } | null;
  } | null;
}

async function fetchAllPaginated<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function archiveAndResetFallback(
  userId: string,
  customArchiveName: string,
): Promise<boolean> {
  const sessions = await fetchAllPaginated<ArchiveSessionRow>(
    async (from, to) => {
      const { data, error } = await supabase
        .from("evaluation_sessions")
        .select(
          `
          id,
          session_token,
          college_id,
          started_at,
          completed_at,
          colleges (id, name, code)
        `,
        )
        .eq("is_complete", true)
        .order("id", { ascending: true })
        .range(from, to);

      return {
        data: (data as unknown as ArchiveSessionRow[] | null) ?? null,
        error,
      };
    },
  );

  const responses = await fetchAllPaginated<ArchiveResponseRow>(
    async (from, to) => {
      const { data, error } = await supabase
        .from("responses")
        .select(
          `
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
            areas (id, area_number, name)
          )
        `,
        )
        .order("id", { ascending: true })
        .range(from, to);

      return {
        data: (data as unknown as ArchiveResponseRow[] | null) ?? null,
        error,
      };
    },
  );

  const hasSessions = sessions.length > 0;
  if (hasSessions) {
    const defaultName = `Evaluation Archive - ${new Date().toLocaleString(
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

    const { data: historyRecord, error: historyError } = await supabase
      .from("evaluation_history")
      .insert({
        name: customArchiveName.trim() || defaultName,
        archived_by: userId,
        total_sessions: sessions.length,
        total_responses: responses.length,
      })
      .select("id")
      .single();

    if (historyError || !historyRecord) throw historyError;

    const sessionIdMap = new Map<string, string>();
    for (let i = 0; i < sessions.length; i += 500) {
      const batch = sessions.slice(i, i + 500).map((session) => ({
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
          .insert(batch)
          .select("id, original_session_id");

      if (sessionsInsertError) throw sessionsInsertError;

      (
        insertedSessions as
          | { id: string; original_session_id: string }[]
          | null
      )?.forEach((hs) => {
        sessionIdMap.set(hs.original_session_id, hs.id);
      });
    }

    const responseInserts = responses
      .filter((r) => sessionIdMap.has(r.session_id))
      .map((r) => ({
        history_session_id: sessionIdMap.get(r.session_id),
        original_response_id: r.id,
        question_id: r.question_id,
        question_text: r.questions?.question_text || null,
        question_parent_id: r.questions?.parent_id || null,
        question_order: r.questions?.question_order ?? null,
        area_id: r.questions?.area_id || null,
        area_number: r.questions?.areas?.area_number ?? null,
        area_name: r.questions?.areas?.name || null,
        status: r.status,
        comment: r.comment,
      }));

    for (let i = 0; i < responseInserts.length; i += 500) {
      const { error: responsesInsertError } = await supabase
        .from("history_responses")
        .insert(responseInserts.slice(i, i + 500));

      if (responsesInsertError) throw responsesInsertError;
    }
  }

  const sentinelId = "00000000-0000-0000-0000-000000000000";
  const { error: deleteResponsesError } = await supabase
    .from("responses")
    .delete()
    .neq("id", sentinelId);
  if (deleteResponsesError) throw deleteResponsesError;

  const { error: deleteSessionsError } = await supabase
    .from("evaluation_sessions")
    .delete()
    .neq("id", sentinelId);
  if (deleteSessionsError) throw deleteSessionsError;

  return hasSessions;
}

export default function Responses() {
  const { user } = useAuth();
  const [collegesData, setCollegesData] = useState<CollegeComplianceData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showResetModal, setShowResetModal] = useState(false);

  const fetchIdRef = useRef(0);

  const fetchComplianceData = useCallback(async () => {
    const currentFetchId = ++fetchIdRef.current;

    try {
      const [collegesRes, areasRes, questionsRes, sessionsRes] =
        await Promise.all([
          supabase
            .from("colleges")
            .select("*")
            .eq("is_active", true)
            .order("name", { ascending: true }),
          supabase
            .from("areas")
            .select("*")
            .eq("is_active", true)
            .order("area_number", { ascending: true }),
          supabase
            .from("questions")
            .select("*")
            .eq("is_active", true)
            .order("question_order", { ascending: true }),
          supabase
            .from("evaluation_sessions")
            .select(
              "id, college_id, completed_at, is_complete, responses(id, question_id, status, comment)",
            )
            .eq("is_complete", true)
            .order("completed_at", { ascending: false }),
        ]);

      if (collegesRes.error) throw collegesRes.error;
      if (areasRes.error) throw areasRes.error;
      if (questionsRes.error) throw questionsRes.error;
      if (sessionsRes.error) throw sessionsRes.error;

      if (currentFetchId !== fetchIdRef.current) return;

      const collegesList = (collegesRes.data || []) as College[];
      const areasList = (areasRes.data || []) as Area[];
      const questionsList = (questionsRes.data || []) as Question[];
      const sessionsList = (sessionsRes.data || []) as SessionWithResponses[];

      const activeAreaIds = new Set(areasList.map((a) => a.id));
      const questionsByArea = new Map<string, Question[]>();
      const questionAreaMap = new Map<string, string>();

      questionsList.forEach((q) => {
        if (!activeAreaIds.has(q.area_id)) return;
        questionAreaMap.set(q.id, q.area_id);
        const list = questionsByArea.get(q.area_id) || [];
        list.push(q);
        questionsByArea.set(q.area_id, list);
      });

      const leavesByArea = new Map<
        string,
        ReturnType<typeof getLeafQuestions<Question>>
      >();
      areasList.forEach((area) => {
        const areaQs = questionsByArea.get(area.id) || [];
        leavesByArea.set(area.id, getLeafQuestions(buildQuestionTree(areaQs)));
      });

      const latestByCollege = selectLatestSessionsByArea(
        sessionsList,
        questionAreaMap,
      );

      const processedData: CollegeComplianceData[] = collegesList.map(
        (college) => {
          const collegeAreaMaps = latestByCollege.get(college.id);

          const areasData: AreaComplianceData[] = areasList.map((area) => {
            const areaQuestions = questionsByArea.get(area.id) || [];
            const areaLeaves = leavesByArea.get(area.id) || [];
            const areaRespMap = collegeAreaMaps?.get(area.id) ?? new Map();
            const stats = calculateAreaCompliance(areaLeaves, areaRespMap);
            const questionTree = buildQuestionComplianceTree(
              areaQuestions,
              areaRespMap,
            );

            return {
              area,
              stats,
              questions: questionTree,
            };
          });

          const overallCompliance = calculateOverallCompliance(
            areasData.map((a) => a.stats.compliance),
          );

          return {
            college,
            overallCompliance,
            areas: areasData,
          };
        },
      );

      setCollegesData(processedData);
      setError(null);
    } catch {
      if (currentFetchId === fetchIdRef.current) {
        setError("Failed to load compliance analytics.");
        showToast("Failed to load compliance data.", "error");
      }
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchComplianceData();

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void fetchComplianceData();
      }, 500);
    };

    const channel = supabase
      .channel("admin-responses-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "evaluation_sessions" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "responses" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "colleges" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "areas" },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [fetchComplianceData]);

  const handleResetData = async (
    password: string,
    archiveName: string,
  ): Promise<boolean> => {
    if (!user?.email) {
      showToast("User not authenticated.", "error");
      return false;
    }

    try {
      const { error: authError } =
        await supabaseNoPersist.auth.signInWithPassword({
          email: user.email,
          password,
        });

      if (authError) {
        showToast("Invalid password. Please try again.", "error");
        return false;
      }

      let archivedSessions = false;

      const { data: rpcHistoryId, error: rpcError } = await supabase.rpc(
        "archive_and_reset_evaluations",
        { p_archive_name: archiveName.trim() || null },
      );

      if (rpcError) {
        if (rpcError.code !== "PGRST202") {
          throw rpcError;
        }
        archivedSessions = await archiveAndResetFallback(user.id, archiveName);
      } else {
        archivedSessions = Boolean(rpcHistoryId);
      }

      showToast(
        archivedSessions
          ? "Evaluations archived to history and reset successfully."
          : "All evaluation data has been cleared.",
        "success",
      );
      setShowResetModal(false);
      await fetchComplianceData();
      return true;
    } catch {
      showToast("Failed to archive and reset evaluations.", "error");
      return false;
    }
  };

  const filteredColleges = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return collegesData;
    return collegesData.filter(
      (cd) =>
        cd.college.name.toLowerCase().includes(query) ||
        cd.college.code?.toLowerCase().includes(query),
    );
  }, [collegesData, searchTerm]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loading size="lg" text="Loading compliance data…" />
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
          <p className="text-gray-600 max-w-prose mt-1">
            Inspect detailed evaluation compliance by college, area, and
            question.
          </p>
        </div>
        <Button
          type="button"
          variant="danger"
          onClick={() => setShowResetModal(true)}
          className="shrink-0 self-start sm:self-auto"
        >
          <TrashIcon className="w-4 h-4" />
          Reset All Data
        </Button>
      </div>

      {error && (
        <Card className="p-4 mb-6 border border-red-200 bg-red-50/70">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-sm text-red-800">
              <AlertCircleIcon className="w-5 h-5 text-red-600 shrink-0" />
              <span role="alert">{error}</span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setIsLoading(true);
                void fetchComplianceData();
              }}
            >
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* Search */}
      <Card className="mb-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div className="flex-1 w-full">
            <Input
              label="Search Colleges"
              placeholder="Search by college name or code…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <p className="text-sm text-gray-600 tabular-nums">
            Showing {filteredColleges.length} of {collegesData.length} college
            {collegesData.length === 1 ? "" : "s"}
          </p>
        </div>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 mb-6 text-xs text-gray-700">
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
          <span>N/A / No Response</span>
        </div>
      </div>

      {/* College Accordions */}
      {filteredColleges.length === 0 ? (
        <Card className="text-center py-12">
          <InfoCircleIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h2 className="text-lg font-medium text-gray-900 mb-2">
            {searchTerm ? "No matching colleges" : "No college accounts yet"}
          </h2>
          <p className="text-gray-600 max-w-prose mx-auto">
            {searchTerm
              ? "Try adjusting your search term."
              : "Create college accounts to start collecting compliance evaluations."}
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
              displayState={
                collegeData.overallCompliance !== null
                  ? "percentage"
                  : "no_response"
              }
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
              {collegeData.areas.length === 0 ? (
                <p className="text-gray-600 text-sm py-4">
                  No active evaluation areas configured.
                </p>
              ) : (
                <div className="space-y-3">
                  {collegeData.areas.map((areaData) => (
                    <ComplianceAccordion
                      key={areaData.area.id}
                      title={`Area ${areaData.area.area_number}: ${areaData.area.name}`}
                      subtitle={areaData.area.description || undefined}
                      compliance={areaData.stats.compliance}
                      displayState={areaData.stats.displayState}
                      level="area"
                    >
                      {areaData.questions.length === 0 ? (
                        <p className="text-gray-600 text-sm py-4">
                          No questions in this area.
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

      <ResetDataModal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        onReset={handleResetData}
      />
    </div>
  );
}

interface ResetDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReset: (password: string, archiveName: string) => Promise<boolean>;
}

function ResetDataModal({ isOpen, onClose, onReset }: ResetDataModalProps) {
  const [archiveName, setArchiveName] = useState("");
  const [password, setPassword] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  const handleClose = () => {
    if (isResetting) return;
    setArchiveName("");
    setPassword("");
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password.trim() || isResetting) {
      showToast("Please enter your password.", "error");
      return;
    }

    setIsResetting(true);
    const success = await onReset(password, archiveName);
    setIsResetting(false);

    if (success) {
      setArchiveName("");
      setPassword("");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      preventClose={isResetting}
      onClose={handleClose}
      title="Archive & Reset All Evaluations?"
      size="md"
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            disabled={isResetting}
            onClick={handleClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="reset-evaluations-form"
            variant="danger"
            isLoading={isResetting}
            disabled={!password.trim()}
          >
            {isResetting ? "Archiving & Resetting…" : "Reset All Data"}
          </Button>
        </>
      }
    >
      <form
        id="reset-evaluations-form"
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangleIcon className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Danger Zone</h3>
              <p className="text-sm text-red-800 max-w-prose mt-1">
                Completed evaluations will be archived into History, then all
                live sessions and responses will be <strong>permanently cleared</strong>:
              </p>
              <ul className="text-sm text-red-800 mt-2 list-disc list-inside space-y-0.5">
                <li>All active evaluation sessions</li>
                <li>All live college responses</li>
              </ul>
              <p className="text-sm text-red-800 mt-2 font-medium">
                Live data cannot be restored once reset.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <InfoCircleIcon className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-900">
                Before You Continue
              </h3>
              <p className="text-sm text-amber-800 max-w-prose mt-1">
                Make sure to export current compliance reports from the{" "}
                <Link
                  to="/admin/reports"
                  onClick={handleClose}
                  className="underline text-maroon-800 hover:text-maroon-900 font-medium"
                >
                  Reports page
                </Link>{" "}
                if you need an offline Excel snapshot right away.
              </p>
            </div>
          </div>
        </div>

        <Input
          label="Archive Name (Optional)"
          placeholder="e.g., AY 2025–2026 Midyear"
          value={archiveName}
          onChange={(e) => setArchiveName(e.target.value)}
          disabled={isResetting}
        />

        <Input
          label="Enter your password to confirm"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Your admin password"
          autoComplete="current-password"
          showPasswordToggle
          required
          disabled={isResetting}
        />
      </form>
    </Modal>
  );
}

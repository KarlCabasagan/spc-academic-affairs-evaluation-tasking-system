import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import QuestionItem, {
  type QuestionResponseValue,
} from "../../components/evaluation/QuestionItem";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  Button,
  buttonVariants,
  Card,
  CheckIcon,
  InfoCircleIcon,
  Loading,
  Modal,
  showToast,
} from "../../components/ui";
import { useAuth } from "../../context/useAuth";
import {
  buildQuestionTree,
  getLeafQuestions,
  type TreeQuestionNode,
} from "../../lib/questionTree";
import { supabase } from "../../lib/supabase";
import type { Area, ComplianceStatus, Question } from "../../lib/types";

interface ExistingSessionInfo {
  sessionId: string;
  completedAt: string | null;
}

interface ExistingResponseRow {
  question_id: string;
  status: ComplianceStatus;
  comment: string | null;
}

interface ExistingSessionRow {
  id: string;
  completed_at: string | null;
  responses: ExistingResponseRow[] | null;
}

async function submitFallbackInsertFirst(
  collegeId: string,
  areaQuestionIds: readonly string[],
  answeredEntries: readonly [string, QuestionResponseValue][],
): Promise<void> {
  const { data: existingSessions } = await supabase
    .from("evaluation_sessions")
    .select("id")
    .eq("college_id", collegeId);

  const previousSessionIds = (existingSessions || []).map((s) => s.id);

  const sessionToken = crypto.randomUUID();
  const { data: sessionData, error: sessionError } = await supabase
    .from("evaluation_sessions")
    .insert({
      session_token: sessionToken,
      college_id: collegeId,
    })
    .select("id")
    .single();

  if (sessionError || !sessionData) {
    throw sessionError || new Error("Failed to create evaluation session");
  }

  const responsesToInsert = answeredEntries.map(([questionId, entry]) => ({
    session_id: sessionData.id,
    question_id: questionId,
    status: entry.status,
    comment: entry.comment.trim() || null,
  }));

  const { error: responsesError } = await supabase
    .from("responses")
    .insert(responsesToInsert);

  if (responsesError) {
    // Roll back the orphaned session if inserting responses failed
    await supabase
      .from("evaluation_sessions")
      .delete()
      .eq("id", sessionData.id);
    throw responsesError;
  }

  const { error: completeError } = await supabase
    .from("evaluation_sessions")
    .update({ is_complete: true, completed_at: new Date().toISOString() })
    .eq("id", sessionData.id);

  if (completeError) {
    throw completeError;
  }

  // Delete older responses for this area only after the new session is safely saved
  if (previousSessionIds.length > 0 && areaQuestionIds.length > 0) {
    await supabase
      .from("responses")
      .delete()
      .in("session_id", previousSessionIds)
      .in("question_id", [...areaQuestionIds]);

    for (const oldSessionId of previousSessionIds) {
      const { count } = await supabase
        .from("responses")
        .select("id", { count: "exact", head: true })
        .eq("session_id", oldSessionId);

      if (count === 0) {
        await supabase
          .from("evaluation_sessions")
          .delete()
          .eq("id", oldSessionId);
      }
    }
  }
}

function CollegeEvaluateInner({ areaId }: { areaId: string | undefined }) {
  const navigate = useNavigate();
  const { college, isOnline } = useAuth();
  const collegeId = college?.id;

  const [area, setArea] = useState<Area | null>(null);
  const [questionTree, setQuestionTree] = useState<
    TreeQuestionNode<Question>[]
  >([]);
  const [leafQuestions, setLeafQuestions] = useState<
    TreeQuestionNode<Question>[]
  >([]);
  const [responses, setResponses] = useState<
    Map<string, QuestionResponseValue>
  >(() => new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingSession, setExistingSession] =
    useState<ExistingSessionInfo | null>(null);
  const [showOverwriteModal, setShowOverwriteModal] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadAreaAndQuestions = async () => {
      if (!areaId) {
        await Promise.resolve();
        if (!cancelled) {
          setError("No evaluation area was specified.");
          setIsLoading(false);
        }
        return;
      }

      if (!collegeId) {
        return;
      }

      try {
        const [areaRes, questionsRes] = await Promise.all([
          supabase
            .from("areas")
            .select("*")
            .eq("id", areaId)
            .eq("is_active", true)
            .single(),
          supabase
            .from("questions")
            .select("*")
            .eq("area_id", areaId)
            .eq("is_active", true)
            .order("question_order", { ascending: true }),
        ]);

        if (areaRes.error) throw areaRes.error;
        if (!areaRes.data) throw new Error("Area not found");
        if (questionsRes.error) throw questionsRes.error;

        const tree = buildQuestionTree((questionsRes.data || []) as Question[]);
        const leaves = getLeafQuestions(tree);
        const questionIds = leaves.map((q) => q.id);

        const existingMap = new Map<
          string,
          { status: ComplianceStatus; comment: string }
        >();
        let matchedSession: ExistingSessionInfo | null = null;

        if (questionIds.length > 0) {
          const { data: sessionsData, error: sessionsError } = await supabase
            .from("evaluation_sessions")
            .select(
              "id, completed_at, responses!inner(question_id, status, comment)",
            )
            .eq("college_id", collegeId)
            .eq("is_complete", true)
            .in("responses.question_id", questionIds)
            .order("completed_at", { ascending: false });

          if (sessionsError) throw sessionsError;

          const typedSessions = (sessionsData || []) as ExistingSessionRow[];
          const leafIdSet = new Set(questionIds);
          const newestSession = typedSessions.find((session) =>
            session.responses?.some((r) => leafIdSet.has(r.question_id)),
          );

          if (newestSession) {
            matchedSession = {
              sessionId: newestSession.id,
              completedAt: newestSession.completed_at,
            };
            newestSession.responses?.forEach((r) => {
              if (leafIdSet.has(r.question_id)) {
                existingMap.set(r.question_id, {
                  status: r.status,
                  comment: r.comment || "",
                });
              }
            });
          }
        }

        if (cancelled) return;

        const initialResponses = new Map<string, QuestionResponseValue>();
        leaves.forEach((q) => {
          const existing = existingMap.get(q.id);
          initialResponses.set(q.id, {
            status: existing?.status || "not_applicable",
            comment: existing?.comment || "",
            answered: Boolean(existing),
          });
        });

        setArea(areaRes.data as Area);
        setQuestionTree(tree);
        setLeafQuestions(leaves);
        setExistingSession(matchedSession);
        setResponses(initialResponses);
        setError(null);
      } catch {
        if (!cancelled) {
          setArea(null);
          setError(
            "Failed to load evaluation. The area may not exist or is unavailable.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadAreaAndQuestions();

    return () => {
      cancelled = true;
    };
  }, [areaId, collegeId]);

  const handleStatusChange = (questionId: string, status: ComplianceStatus) => {
    setResponses((prev) => {
      const next = new Map(prev);
      const current = next.get(questionId);
      next.set(questionId, {
        status,
        comment: current?.comment || "",
        answered: true,
      });
      return next;
    });
  };

  const handleCommentChange = (questionId: string, comment: string) => {
    setResponses((prev) => {
      const next = new Map(prev);
      const current = next.get(questionId);
      next.set(questionId, {
        status: current?.status || "not_applicable",
        comment,
        answered: current?.answered ?? false,
      });
      return next;
    });
  };

  const answeredCount = Array.from(responses.values()).filter(
    (r) => r.answered,
  ).length;
  const requiredUnanswered = leafQuestions.filter(
    (q) => q.is_required && !responses.get(q.id)?.answered,
  );
  const progressRatio =
    leafQuestions.length > 0 ? answeredCount / leafQuestions.length : 0;
  const progressPercent = Math.round(progressRatio * 100);

  const handleSubmit = async () => {
    if (!collegeId || !areaId || isSubmitting) return;

    const answeredEntries = Array.from(responses.entries()).filter(
      ([, r]) => r.answered,
    );

    if (answeredEntries.length === 0) {
      showToast(
        "Please answer at least one question before submitting.",
        "error",
      );
      return;
    }

    setShowOverwriteModal(false);
    setIsSubmitting(true);

    try {
      const rpcPayload = answeredEntries.map(([questionId, entry]) => ({
        question_id: questionId,
        status: entry.status,
        comment: entry.comment.trim() || null,
      }));

      const { error: rpcError } = await supabase.rpc("submit_area_evaluation", {
        p_area_id: areaId,
        p_responses: rpcPayload,
      });

      if (rpcError) {
        if (rpcError.code !== "PGRST202") {
          throw rpcError;
        }
        await submitFallbackInsertFirst(
          collegeId,
          leafQuestions.map((q) => q.id),
          answeredEntries,
        );
      }

      showToast(
        existingSession
          ? "Evaluation updated successfully."
          : "Evaluation submitted successfully.",
        "success",
      );
      navigate("/college");
    } catch {
      showToast("Failed to submit evaluation. Please try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitClick = () => {
    if (isSubmitting) return;

    if (!collegeId) {
      showToast("You must be signed in as a college to submit.", "error");
      return;
    }

    if (!isOnline) {
      showToast(
        "You are currently offline. Reconnect before submitting.",
        "error",
      );
      return;
    }

    if (answeredCount === 0) {
      showToast(
        "Please answer at least one question before submitting.",
        "error",
      );
      return;
    }

    if (requiredUnanswered.length > 0) {
      showToast(
        `Please answer all required questions (${requiredUnanswered.length} remaining).`,
        "error",
      );
      return;
    }

    if (existingSession) {
      setShowOverwriteModal(true);
    } else {
      void handleSubmit();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loading size="lg" text="Loading evaluation questions…" />
      </div>
    );
  }

  if (error || !area) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <AlertTriangleIcon className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-red-900 mb-2">
            Evaluation Not Found
          </h1>
          <p className="text-red-800 max-w-prose mx-auto mb-6">
            {error || "This area could not be loaded."}
          </p>
          <Link to="/college" className={buttonVariants({ variant: "primary" })}>
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-4xl mx-auto pb-28 sm:pb-24">
      {/* Area Header */}
      <div className="bg-linear-to-r from-maroon-800 to-maroon-900 text-white rounded-xl p-6 sm:p-8 mb-6 shadow-sm">
        <Link
          to="/college"
          className="inline-flex items-center gap-2 min-h-11 -ml-2 px-2 rounded-lg text-maroon-100 hover:text-white transition-colors duration-150 mb-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Dashboard
        </Link>
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-14 h-14 bg-white/10 rounded-xl flex items-center justify-center font-bold text-2xl tabular-nums">
            {area.area_number}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold mb-2 tabular-nums">
              Area {area.area_number}: {area.name}
            </h1>
            {area.description && (
              <p className="text-maroon-100 max-w-prose">{area.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Progress Bar (offset below CollegeLayout sticky h-16 navbar) */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 sticky top-16 z-20 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 tabular-nums">
            Progress: {answeredCount} of {leafQuestions.length} answered
          </span>
          <span className="text-sm font-medium text-gray-700 tabular-nums">
            {progressPercent}%
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Evaluation completion progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
          className="h-2 bg-gray-200 rounded-full overflow-hidden"
        >
          <div
            className="h-full w-full bg-maroon-800 origin-left transition-transform duration-200 ease-out rounded-full"
            style={{ transform: `scaleX(${progressRatio})` }}
          />
        </div>
      </div>

      {/* Questions */}
      <div>
        {questionTree.length === 0 ? (
          <Card className="text-center py-12">
            <InfoCircleIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 max-w-prose mx-auto mb-5">
              No evaluation questions have been added for this area yet.
            </p>
            <Link
              to="/college"
              className={buttonVariants({ variant: "secondary" })}
            >
              Back to Dashboard
            </Link>
          </Card>
        ) : (
          <div className="space-y-4">
            {questionTree.map((question) => (
              <QuestionItem
                key={question.id}
                question={question}
                responses={responses}
                onStatusChange={handleStatusChange}
                onCommentChange={handleCommentChange}
                disabled={isSubmitting}
              />
            ))}
          </div>
        )}
      </div>

      {/* Submit Footer */}
      {leafQuestions.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-30">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm tabular-nums">
                {answeredCount === 0 ? (
                  <span className="text-gray-600">
                    Answer questions above to submit
                  </span>
                ) : requiredUnanswered.length > 0 ? (
                  <span className="text-amber-800 font-medium">
                    {requiredUnanswered.length} required question
                    {requiredUnanswered.length === 1 ? "" : "s"} remaining
                  </span>
                ) : (
                  <span className="text-emerald-700 font-medium inline-flex items-center gap-1.5">
                    <CheckIcon className="w-4 h-4" />
                    All required questions answered
                  </span>
                )}
              </div>
              <Button
                type="button"
                size="md"
                onClick={handleSubmitClick}
                isLoading={isSubmitting}
                disabled={
                  isSubmitting ||
                  answeredCount === 0 ||
                  requiredUnanswered.length > 0
                }
                className="ml-auto"
              >
                {isSubmitting
                  ? "Submitting…"
                  : existingSession
                    ? "Update Evaluation"
                    : "Submit Evaluation"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Overwrite Warning Modal */}
      <Modal
        isOpen={showOverwriteModal}
        preventClose={isSubmitting}
        onClose={() => setShowOverwriteModal(false)}
        title="Update Existing Evaluation?"
        size="md"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={() => setShowOverwriteModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              isLoading={isSubmitting}
            >
              {isSubmitting ? "Updating…" : "Confirm & Update"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangleIcon className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-900">
                  Data Override Warning
                </h3>
                <p className="text-sm text-amber-800 max-w-prose mt-1">
                  You have already submitted an evaluation for{" "}
                  <strong>
                    Area {area.area_number}: {area.name}
                  </strong>
                  .
                </p>
                <p className="text-sm text-amber-800 max-w-prose mt-2">
                  Submitting now will <strong>permanently replace</strong> all
                  previous responses for this area. This action cannot be
                  undone.
                </p>
              </div>
            </div>
          </div>

          {existingSession?.completedAt && (
            <p className="text-sm text-gray-600 tabular-nums">
              Previous submission:{" "}
              {new Date(existingSession.completedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

export default function CollegeEvaluate() {
  const { areaId } = useParams<{ areaId: string }>();
  return <CollegeEvaluateInner key={areaId ?? "missing"} areaId={areaId} />;
}

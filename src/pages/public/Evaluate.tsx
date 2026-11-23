import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import QuestionItem from "../../components/evaluation/QuestionItem";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  Button,
  buttonVariants,
  Card,
  CheckIcon,
  ConfirmDialog,
  DownloadIcon,
  InfoCircleIcon,
  Loading,
  showToast,
  TrashIcon,
  WifiOffIcon,
} from "../../components/ui";
import {
  type StoredResponse,
  useOfflineEvaluation,
} from "../../hooks/useOfflineEvaluation";
import {
  buildQuestionTree,
  getLeafQuestions,
  type TreeQuestionNode,
} from "../../lib/questionTree";
import { supabase } from "../../lib/supabase";
import type { Area, ComplianceStatus, Question } from "../../lib/types";

export default function PublicEvaluate() {
  const { areaId } = useParams<{ areaId: string }>();
  const navigate = useNavigate();
  const {
    isOnline,
    isLoading: isAreasLoading,
    areas,
    fetchAreas,
    fetchQuestions,
    getResponses,
    saveResponses,
    markAreaComplete,
    isAreaCompleted,
    clearAreaResponses,
  } = useOfflineEvaluation();

  const [area, setArea] = useState<Area | null>(null);
  const [questionTree, setQuestionTree] = useState<
    TreeQuestionNode<Question>[]
  >([]);
  const [leafQuestions, setLeafQuestions] = useState<
    TreeQuestionNode<Question>[]
  >([]);
  const [responses, setResponses] = useState<Map<string, StoredResponse>>(
    () => new Map(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const loadedAreaIdRef = useRef<string | null>(null);
  const responsesRef = useRef<Map<string, StoredResponse>>(new Map());
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep latest callbacks/context accessible inside unmount & area-load effects
  // without re-triggering data loads when connectivity fluctuates.
  const latestRef = useRef({
    areas,
    isOnline,
    fetchQuestions,
    getResponses,
    saveResponses,
    isAreaCompleted,
    areaId,
  });

  useEffect(() => {
    latestRef.current = {
      areas,
      isOnline,
      fetchQuestions,
      getResponses,
      saveResponses,
      isAreaCompleted,
      areaId,
    };
  }, [
    areas,
    isOnline,
    fetchQuestions,
    getResponses,
    saveResponses,
    isAreaCompleted,
    areaId,
  ]);

  const persistResponsesMap = useCallback(
    (targetAreaId: string, map: Map<string, StoredResponse>) => {
      const responsesObj: Record<string, StoredResponse> = {};
      map.forEach((value, key) => {
        responsesObj[key] = value;
      });
      const ok = latestRef.current.saveResponses(targetAreaId, responsesObj);
      if (!ok) {
        showToast(
          "Browser storage is full — could not save responses locally.",
          "error",
        );
      }
    },
    [],
  );

  const flushPendingSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const currentAreaId = latestRef.current.areaId;
    if (dirtyRef.current && currentAreaId) {
      dirtyRef.current = false;
      persistResponsesMap(currentAreaId, responsesRef.current);
    }
  }, [persistResponsesMap]);

  useEffect(() => {
    return () => {
      flushPendingSave();
    };
  }, [flushPendingSave]);

  useEffect(() => {
    void fetchAreas();
  }, [fetchAreas]);

  useEffect(() => {
    if (!areaId || isAreasLoading) return;
    if (loadedAreaIdRef.current === areaId) return;

    let cancelled = false;
    loadedAreaIdRef.current = areaId;

    const loadAreaData = async () => {
      try {
        let areaData = latestRef.current.areas.find((a) => a.id === areaId);

        if (!areaData && latestRef.current.isOnline) {
          const { data, error: areaError } = await supabase
            .from("areas")
            .select("*")
            .eq("id", areaId)
            .eq("is_active", true)
            .single();
          if (areaError) throw areaError;
          areaData = data;
        }

        if (!areaData) {
          throw new Error("Area not found");
        }

        const questionsData = await latestRef.current.fetchQuestions(areaId);
        if (cancelled) return;

        const tree = buildQuestionTree(questionsData);
        const leaves = getLeafQuestions(tree);
        const savedResponses = latestRef.current.getResponses(areaId);
        const responsesMap = new Map<string, StoredResponse>();

        leaves.forEach((q) => {
          const saved = savedResponses[q.id];
          if (saved) {
            responsesMap.set(q.id, saved);
          } else {
            responsesMap.set(q.id, {
              questionId: q.id,
              status: "not_applicable",
              comment: "",
              answered: false,
            });
          }
        });

        responsesRef.current = responsesMap;
        dirtyRef.current = false;
        setArea(areaData);
        setQuestionTree(tree);
        setLeafQuestions(leaves);
        setResponses(responsesMap);
        setIsCompleted(latestRef.current.isAreaCompleted(areaId));
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

    void loadAreaData();

    return () => {
      cancelled = true;
    };
  }, [areaId, isAreasLoading]);

  const handleStatusChange = (questionId: string, status: ComplianceStatus) => {
    if (!areaId) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const nextMap = new Map(responsesRef.current);
    const current = nextMap.get(questionId);
    nextMap.set(questionId, {
      questionId,
      status,
      comment: current?.comment ?? "",
      answered: true,
    });

    responsesRef.current = nextMap;
    dirtyRef.current = false;
    setResponses(nextMap);
    persistResponsesMap(areaId, nextMap);
  };

  const handleCommentChange = (questionId: string, comment: string) => {
    const nextMap = new Map(responsesRef.current);
    const current = nextMap.get(questionId);
    nextMap.set(questionId, {
      questionId,
      status: current?.status ?? "not_applicable",
      comment,
      answered: current?.answered ?? false,
    });

    responsesRef.current = nextMap;
    dirtyRef.current = true;
    setResponses(nextMap);

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      flushPendingSave();
    }, 400);
  };

  const handleCommentBlur = () => {
    flushPendingSave();
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

  const handleMarkComplete = () => {
    if (!areaId) return;

    if (leafQuestions.length > 0 && answeredCount === 0) {
      showToast(
        "Please answer at least one question before marking this area complete.",
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

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    dirtyRef.current = false;
    persistResponsesMap(areaId, responsesRef.current);

    const marked = markAreaComplete(areaId);
    if (!marked) {
      showToast(
        "Browser storage is full — could not mark area complete.",
        "error",
      );
      return;
    }

    const wasCompleted = isCompleted;
    setIsCompleted(true);
    showToast(
      wasCompleted
        ? "Responses updated successfully."
        : "Area marked as complete.",
      "success",
    );
    navigate("/public");
  };

  const handleClearResponses = () => {
    if (!areaId) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    dirtyRef.current = false;

    const ok = clearAreaResponses(areaId);
    const resetMap = new Map<string, StoredResponse>();
    leafQuestions.forEach((q) => {
      resetMap.set(q.id, {
        questionId: q.id,
        status: "not_applicable",
        comment: "",
        answered: false,
      });
    });

    responsesRef.current = resetMap;
    setResponses(resetMap);
    setIsCompleted(false);
    setShowClearConfirm(false);

    if (ok) {
      showToast("Responses cleared for this area.", "success");
    } else {
      showToast("Could not clear local browser storage.", "error");
    }
  };

  if (isLoading || (isAreasLoading && !area)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loading size="lg" text="Loading evaluation questions…" />
      </div>
    );
  }

  if (error || !area) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <AlertTriangleIcon className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-red-900 mb-2">
            Evaluation Not Found
          </h1>
          <p className="text-red-800 max-w-prose mx-auto mb-6">
            {error || "This evaluation area could not be loaded."}
          </p>
          <Link to="/public" className={buttonVariants({ variant: "primary" })}>
            Return to Areas
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-32 sm:pb-24">
      {/* Offline Indicator */}
      {!isOnline && (
        <div
          role="status"
          className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-center"
        >
          <p className="text-sm text-amber-900 inline-flex items-center justify-center gap-2">
            <WifiOffIcon className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              <span className="font-medium">Offline Mode:</span> Your responses
              are saved locally.
            </span>
          </p>
        </div>
      )}

      {/* Area Header */}
      <div className="bg-linear-to-r from-maroon-800 to-maroon-900 text-white py-8 sm:py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            to="/public"
            className="inline-flex items-center gap-2 min-h-11 -ml-2 px-2 rounded-lg text-maroon-100 hover:text-white transition-colors duration-150 mb-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Areas
          </Link>
          <div className="flex items-start gap-4">
            <div
              className={`shrink-0 w-14 h-14 rounded-xl flex items-center justify-center font-bold text-2xl tabular-nums ${
                isCompleted ? "bg-emerald-500/25" : "bg-white/10"
              }`}
            >
              {isCompleted ? (
                <CheckIcon className="w-8 h-8" />
              ) : (
                area.area_number
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-bold tabular-nums">
                  Area {area.area_number}: {area.name}
                </h1>
                {isCompleted && (
                  <span className="px-2.5 py-0.5 bg-emerald-500/25 text-emerald-100 text-sm font-medium rounded-full">
                    Completed
                  </span>
                )}
              </div>
              {area.description && (
                <p className="text-maroon-100 mt-2 max-w-prose">
                  {area.description}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
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
      </div>

      {/* Questions */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {questionTree.length === 0 ? (
          <Card className="text-center py-12">
            <InfoCircleIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 max-w-prose mx-auto mb-5">
              No evaluation questions have been added for this area yet.
            </p>
            <Link
              to="/public"
              className={buttonVariants({ variant: "secondary" })}
            >
              Choose Another Area
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
                onCommentBlur={handleCommentBlur}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      {leafQuestions.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-30">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowClearConfirm(true)}
                >
                  <TrashIcon className="w-4 h-4" />
                  Clear
                </Button>
                <div className="text-sm tabular-nums">
                  {requiredUnanswered.length > 0 ? (
                    <span className="text-amber-800 font-medium">
                      {requiredUnanswered.length} required remaining
                    </span>
                  ) : (
                    <span className="text-emerald-700 font-medium inline-flex items-center gap-1">
                      <CheckIcon className="w-4 h-4" />
                      All required answered
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 ml-auto">
                {isCompleted && (
                  <Link
                    to="/public/export"
                    className={buttonVariants({
                      variant: "secondary",
                      size: "md",
                    })}
                  >
                    <DownloadIcon className="w-4 h-4" />
                    Export
                  </Link>
                )}
                <Button
                  type="button"
                  size="md"
                  onClick={handleMarkComplete}
                >
                  {isCompleted ? "Update Response" : "Mark Complete"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleClearResponses}
        title="Clear Area Responses?"
        message="This will clear all answers and comments recorded for this area. This action cannot be undone."
        confirmText="Clear Responses"
        confirmVariant="danger"
      />
    </div>
  );
}

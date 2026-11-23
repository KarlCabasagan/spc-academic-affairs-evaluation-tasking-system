import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircleIcon,
  Button,
  Card,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
  InfoCircleIcon,
  Loading,
} from "../../components/ui";
import { useAuth } from "../../context/useAuth";
import {
  type AreaComplianceResult,
  calculateAreaCompliance,
  calculateOverallCompliance,
  COMPLIANCE_TONE_CLASSES,
  getComplianceTone,
  selectLatestSessionsByArea,
  type SessionWithResponses,
} from "../../lib/compliance";
import { buildQuestionTree, getLeafQuestions } from "../../lib/questionTree";
import { supabase } from "../../lib/supabase";
import type { Area } from "../../lib/types";

interface QuestionRow {
  id: string;
  area_id: string;
  parent_id: string | null;
  question_order: number;
}

export default function CollegeDashboard() {
  const { college } = useAuth();
  const collegeId = college?.id;

  const [areas, setAreas] = useState<Area[]>([]);
  const [completedAreaIds, setCompletedAreaIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [areaStats, setAreaStats] = useState<
    Map<string, AreaComplianceResult>
  >(() => new Map());
  const [overallCompliance, setOverallCompliance] = useState<number | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(
    async (isCancelled: () => boolean) => {
      if (!collegeId) return;

      try {
        const [areasRes, questionsRes, sessionsRes] = await Promise.all([
          supabase
            .from("areas")
            .select("*")
            .eq("is_active", true)
            .order("area_number", { ascending: true }),
          supabase
            .from("questions")
            .select("id, area_id, parent_id, question_order")
            .eq("is_active", true),
          supabase
            .from("evaluation_sessions")
            .select(
              "id, college_id, completed_at, is_complete, responses(question_id, status, comment)",
            )
            .eq("college_id", collegeId)
            .eq("is_complete", true)
            .order("completed_at", { ascending: false }),
        ]);

        if (areasRes.error) throw areasRes.error;
        if (questionsRes.error) throw questionsRes.error;
        if (sessionsRes.error) throw sessionsRes.error;
        if (isCancelled()) return;

        const areasData = (areasRes.data || []) as Area[];
        const questionsData = (questionsRes.data || []) as QuestionRow[];
        const sessionsData = (sessionsRes.data || []) as SessionWithResponses[];

        const activeAreaIdSet = new Set(areasData.map((a) => a.id));
        const questionsByArea = new Map<string, QuestionRow[]>();
        const questionAreaMap = new Map<string, string>();

        questionsData.forEach((q) => {
          if (!activeAreaIdSet.has(q.area_id)) return;
          questionAreaMap.set(q.id, q.area_id);
          const list = questionsByArea.get(q.area_id) || [];
          list.push(q);
          questionsByArea.set(q.area_id, list);
        });

        const latestByCollege = selectLatestSessionsByArea(
          sessionsData,
          questionAreaMap,
        );
        const collegeSessions = latestByCollege.get(collegeId);

        const nextCompleted = new Set<string>();
        const nextStats = new Map<string, AreaComplianceResult>();

        areasData.forEach((area) => {
          const areaQuestions = questionsByArea.get(area.id) || [];
          const leaves = getLeafQuestions(buildQuestionTree(areaQuestions));
          const responseMap = collegeSessions?.get(area.id);

          if (responseMap && responseMap.size > 0) {
            nextCompleted.add(area.id);
            nextStats.set(
              area.id,
              calculateAreaCompliance(leaves, responseMap),
            );
          }
        });

        const overall = calculateOverallCompliance(
          areasData.map((a) => nextStats.get(a.id)?.compliance ?? null),
        );

        setAreas(areasData);
        setCompletedAreaIds(nextCompleted);
        setAreaStats(nextStats);
        setOverallCompliance(overall);
        setError(null);
      } catch {
        if (!isCancelled()) {
          setError(
            "Unable to load evaluation areas and compliance metrics. Please check your connection and try again.",
          );
        }
      } finally {
        if (!isCancelled()) {
          setIsLoading(false);
        }
      }
    },
    [collegeId],
  );

  useEffect(() => {
    if (!collegeId) return;
    let cancelled = false;
    void loadDashboard(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [collegeId, loadDashboard]);

  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
    void loadDashboard(() => false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loading size="lg" text="Loading evaluation areas…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <Card className="p-6 text-center border border-red-200 bg-red-50/50">
          <AlertCircleIcon className="w-10 h-10 text-red-600 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-gray-900">
            Dashboard Unavailable
          </h1>
          <p
            role="alert"
            className="text-sm text-gray-700 max-w-prose mx-auto mt-2 mb-5"
          >
            {error}
          </p>
          <Button type="button" onClick={handleRetry}>
            Try Again
          </Button>
        </Card>
      </div>
    );
  }

  const completedCount = areas.filter((a) => completedAreaIds.has(a.id)).length;
  const pendingCount = Math.max(0, areas.length - completedCount);
  const completionRate =
    areas.length > 0
      ? Math.min(100, Math.round((completedCount / areas.length) * 100))
      : 0;

  const overallTone = getComplianceTone(overallCompliance);
  const overallStyles = COMPLIANCE_TONE_CLASSES[overallTone];

  return (
    <div className="animate-fade-in">
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Welcome, {college?.name || "College"}
        </h1>
        <p className="text-gray-600 max-w-prose mt-1">
          Select an evaluation area below to complete or update your
          self-assessment.
        </p>
      </div>

      {/* Summary Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Overall Compliance
              </p>
              <p
                className={`text-3xl font-bold tabular-nums mt-1 ${overallStyles.text}`}
              >
                {overallCompliance !== null
                  ? `${overallCompliance.toFixed(1)}%`
                  : "—"}
              </p>
              <p className="text-sm text-gray-600 tabular-nums mt-1">
                across {completedCount} area{completedCount === 1 ? "" : "s"}
              </p>
            </div>
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${overallStyles.badgeBg}`}
            >
              <CheckCircleIcon className={`w-6 h-6 ${overallStyles.text}`} />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Completion Rate
              </p>
              <p className="text-3xl font-bold text-maroon-800 tabular-nums mt-1">
                {completionRate}%
              </p>
              <p className="text-sm text-gray-600 tabular-nums mt-1">
                {completedCount} of {areas.length} areas
              </p>
            </div>
            <div className="w-12 h-12 bg-maroon-100 rounded-xl flex items-center justify-center shrink-0">
              <CheckCircleIcon className="w-6 h-6 text-maroon-800" />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-600">Completed</p>
              <p className="text-3xl font-bold text-emerald-700 tabular-nums mt-1">
                {completedCount}
              </p>
              <p className="text-sm text-gray-600 mt-1">areas evaluated</p>
            </div>
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
              <CheckIcon className="w-6 h-6 text-emerald-700" />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-600">Remaining</p>
              <p className="text-3xl font-bold text-amber-800 tabular-nums mt-1">
                {pendingCount}
              </p>
              <p className="text-sm text-gray-600 mt-1">areas pending</p>
            </div>
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
              <ClockIcon className="w-6 h-6 text-amber-800" />
            </div>
          </div>
        </Card>
      </div>

      {/* Areas Grid */}
      {areas.length === 0 ? (
        <Card className="text-center py-12">
          <InfoCircleIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h2 className="text-lg font-medium text-gray-900 mb-2">
            No evaluation areas available
          </h2>
          <p className="text-gray-600 max-w-prose mx-auto">
            Please contact the administrator to set up evaluation areas.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {areas.map((area) => {
            const isComplete = completedAreaIds.has(area.id);
            const stats = areaStats.get(area.id);
            const compliance = stats?.compliance ?? null;
            const tone = getComplianceTone(compliance);
            const styles = COMPLIANCE_TONE_CLASSES[tone];

            return (
              <Link
                key={area.id}
                to={`/college/evaluate/${area.id}`}
                className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-800"
              >
                <Card hover className="h-full active:scale-[0.98]">
                  <div className="flex items-start gap-4">
                    <div
                      className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg tabular-nums relative ${
                        isComplete
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-maroon-100 text-maroon-800"
                      }`}
                    >
                      {area.area_number}
                      {isComplete && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-600 rounded-full flex items-center justify-center">
                          <CheckIcon className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-semibold text-gray-900 group-hover:text-maroon-800 transition-colors duration-150 tabular-nums">
                        Area {area.area_number}: {area.name}
                      </h2>
                      {area.description && (
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2 max-w-prose">
                          {area.description}
                        </p>
                      )}
                      <div className="mt-3 flex items-center gap-2">
                        {isComplete ? (
                          <span
                            className={`text-sm font-medium inline-flex items-center gap-1 tabular-nums ${
                              stats?.displayState === "percentage"
                                ? styles.text
                                : "text-emerald-700"
                            }`}
                          >
                            <CheckIcon className="w-4 h-4 shrink-0" />
                            {stats?.displayState === "percentage" &&
                            compliance !== null
                              ? `${compliance.toFixed(1)}% Compliant`
                              : stats?.displayState === "all_na"
                                ? "Completed (N/A)"
                                : "Completed"}
                          </span>
                        ) : (
                          <span className="text-sm text-maroon-800 font-medium group-hover:text-maroon-900 transition-colors duration-150">
                            Start Evaluation →
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

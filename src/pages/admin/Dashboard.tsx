import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircleIcon,
  Button,
  buttonVariants,
  Card,
  CheckCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  DownloadIcon,
  InfoCircleIcon,
  Loading,
  WifiOffIcon,
} from "../../components/ui";
import { useAuth } from "../../context/useAuth";
import {
  calculateAreaCompliance,
  calculateOverallCompliance,
  COMPLIANCE_TONE_CLASSES,
  getComplianceTone,
  selectLatestSessionsByArea,
  type SessionWithResponses,
} from "../../lib/compliance";
import { buildQuestionTree, getLeafQuestions } from "../../lib/questionTree";
import { supabase } from "../../lib/supabase";

interface AreaRow {
  id: string;
  area_number: number;
  name: string;
  is_active: boolean;
}

interface CollegeRow {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
}

interface QuestionRow {
  id: string;
  area_id: string;
  parent_id: string | null;
  question_order: number;
}

interface DashboardStats {
  totalAreas: number;
  activeAreas: number;
  totalQuestions: number;
  totalColleges: number;
  activeColleges: number;
  completedEvaluations: number;
  averageCompliance: number | null;
  totalResponses: number;
}

interface RecentActivity {
  id: string;
  collegeName: string;
  collegeCode: string | null;
  completedAt: string;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export default function Dashboard() {
  const { isOnline } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const fetchIdRef = useRef(0);

  const fetchDashboardData = useCallback(async () => {
    const currentFetchId = ++fetchIdRef.current;

    try {
      const [areasRes, collegesRes, questionsRes, sessionsRes] =
        await Promise.all([
          supabase
            .from("areas")
            .select("id, area_number, name, is_active")
            .order("area_number", { ascending: true }),
          supabase.from("colleges").select("id, name, code, is_active"),
          supabase
            .from("questions")
            .select("id, area_id, parent_id, question_order")
            .eq("is_active", true),
          supabase
            .from("evaluation_sessions")
            .select(
              "id, college_id, completed_at, is_complete, responses(question_id, status)",
            )
            .eq("is_complete", true)
            .order("completed_at", { ascending: false }),
        ]);

      if (areasRes.error) throw areasRes.error;
      if (collegesRes.error) throw collegesRes.error;
      if (questionsRes.error) throw questionsRes.error;
      if (sessionsRes.error) throw sessionsRes.error;

      if (currentFetchId !== fetchIdRef.current) return;

      const areasData = (areasRes.data || []) as AreaRow[];
      const collegesData = (collegesRes.data || []) as CollegeRow[];
      const questionsData = (questionsRes.data || []) as QuestionRow[];
      const sessionsData = (sessionsRes.data || []) as SessionWithResponses[];

      const activeAreas = areasData.filter((a) => a.is_active);
      const activeColleges = collegesData.filter((c) => c.is_active);
      const activeAreaIds = new Set(activeAreas.map((a) => a.id));

      const questionsByArea = new Map<string, QuestionRow[]>();
      const questionAreaMap = new Map<string, string>();
      questionsData.forEach((q) => {
        if (!activeAreaIds.has(q.area_id)) return;
        questionAreaMap.set(q.id, q.area_id);
        const list = questionsByArea.get(q.area_id) || [];
        list.push(q);
        questionsByArea.set(q.area_id, list);
      });

      const leavesByArea = new Map<
        string,
        ReturnType<typeof getLeafQuestions<QuestionRow>>
      >();
      let totalQuestions = 0;
      activeAreas.forEach((area) => {
        const leaves = getLeafQuestions(
          buildQuestionTree(questionsByArea.get(area.id) || []),
        );
        leavesByArea.set(area.id, leaves);
        totalQuestions += leaves.length;
      });

      const latestByCollege = selectLatestSessionsByArea(
        sessionsData,
        questionAreaMap,
      );

      let totalResponses = 0;
      const collegeOverallCompliances = activeColleges.map((col) => {
        const collegeAreas = latestByCollege.get(col.id);
        const areaCompliances = activeAreas.map((area) => {
          const respMap = collegeAreas?.get(area.id);
          if (!respMap || respMap.size === 0) return null;
          totalResponses += respMap.size;
          const result = calculateAreaCompliance(
            leavesByArea.get(area.id) || [],
            respMap,
          );
          return result.displayState === "percentage"
            ? result.compliance
            : null;
        });
        return calculateOverallCompliance(areaCompliances);
      });

      const averageCompliance = calculateOverallCompliance(
        collegeOverallCompliances,
      );

      const collegeById = new Map(collegesData.map((c) => [c.id, c]));
      const recent: RecentActivity[] = [];
      for (const session of sessionsData) {
        if (!session.college_id || !session.completed_at) continue;
        const college = collegeById.get(session.college_id);
        if (!college) continue;
        recent.push({
          id: session.id,
          collegeName: college.name,
          collegeCode: college.code,
          completedAt: session.completed_at,
        });
        if (recent.length >= 5) break;
      }

      setStats({
        totalAreas: areasData.length,
        activeAreas: activeAreas.length,
        totalQuestions,
        totalColleges: collegesData.length,
        activeColleges: activeColleges.length,
        completedEvaluations: sessionsData.length,
        averageCompliance,
        totalResponses,
      });
      setRecentActivity(recent);
      setLastSyncedAt(new Date().toLocaleTimeString());
      setError(null);
    } catch {
      if (currentFetchId === fetchIdRef.current) {
        setError("Failed to refresh dashboard metrics.");
      }
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchDashboardData();

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void fetchDashboardData();
      }, 500);
    };

    const channel = supabase
      .channel("admin-dashboard-updates")
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
  }, [fetchDashboardData]);

  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
    void fetchDashboardData();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loading size="lg" text="Loading dashboard…" />
      </div>
    );
  }

  const avgCompliance = stats?.averageCompliance ?? null;
  const avgTone = getComplianceTone(avgCompliance);
  const avgStyles = COMPLIANCE_TONE_CLASSES[avgTone];

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Admin Dashboard
        </h1>
        <p className="text-gray-600 max-w-prose mt-1">
          Overview of the SPC Academic Affairs PACUCOA Evaluation Tasking System.
        </p>
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
              onClick={handleRetry}
            >
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* Key Metrics Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-600">Colleges</p>
              <p className="text-3xl font-bold text-gray-900 tabular-nums mt-1">
                {stats?.activeColleges ?? 0}
              </p>
              <p className="text-sm text-gray-600 tabular-nums mt-1">
                {stats?.totalColleges ?? 0} total enrolled
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
              <p className="text-sm font-medium text-gray-600">
                Avg. Compliance
              </p>
              <p
                className={`text-3xl font-bold tabular-nums mt-1 ${avgStyles.text}`}
              >
                {avgCompliance !== null ? `${avgCompliance.toFixed(1)}%` : "—"}
              </p>
              <p className="text-sm text-gray-600 tabular-nums mt-1">
                {stats?.completedEvaluations ?? 0} submissions
              </p>
            </div>
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${avgStyles.badgeBg}`}
            >
              <CheckIcon className={`w-6 h-6 ${avgStyles.text}`} />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-600">Areas</p>
              <p className="text-3xl font-bold text-gray-900 tabular-nums mt-1">
                {stats?.activeAreas ?? 0}
              </p>
              <p className="text-sm text-gray-600 tabular-nums mt-1">
                {stats?.totalQuestions ?? 0} active criteria
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
              <InfoCircleIcon className="w-6 h-6 text-blue-700" />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Active Responses
              </p>
              <p className="text-3xl font-bold text-gray-900 tabular-nums mt-1">
                {(stats?.totalResponses ?? 0).toLocaleString()}
              </p>
              <p className="text-sm text-gray-600 tabular-nums mt-1">
                across latest submissions
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center shrink-0">
              <ClockIcon className="w-6 h-6 text-purple-700" />
            </div>
          </div>
        </Card>
      </div>

      {/* Two Column Layout */}
      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        {/* Quick Actions */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Quick Actions
          </h2>
          <div className="grid gap-3">
            <Link
              to="/admin/colleges"
              className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-800"
            >
              <Card hover className="flex items-center gap-4 active:scale-[0.98]">
                <div className="w-10 h-10 bg-maroon-100 text-maroon-800 rounded-lg flex items-center justify-center shrink-0">
                  <CheckCircleIcon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 group-hover:text-maroon-800 transition-colors duration-150">
                    Manage Colleges
                  </h3>
                  <p className="text-sm text-gray-600">
                    Add or edit participating college accounts
                  </p>
                </div>
                <ChevronRightIcon className="w-5 h-5 text-gray-500 group-hover:text-maroon-800 transition-colors duration-150 shrink-0" />
              </Card>
            </Link>

            <Link
              to="/admin/areas"
              className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-800"
            >
              <Card hover className="flex items-center gap-4 active:scale-[0.98]">
                <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center shrink-0">
                  <InfoCircleIcon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 group-hover:text-maroon-800 transition-colors duration-150">
                    Manage Areas &amp; Questions
                  </h3>
                  <p className="text-sm text-gray-600">
                    Edit evaluation areas and accreditation criteria
                  </p>
                </div>
                <ChevronRightIcon className="w-5 h-5 text-gray-500 group-hover:text-maroon-800 transition-colors duration-150 shrink-0" />
              </Card>
            </Link>

            <Link
              to="/admin/responses"
              className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-800"
            >
              <Card hover className="flex items-center gap-4 active:scale-[0.98]">
                <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center shrink-0">
                  <CheckIcon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 group-hover:text-maroon-800 transition-colors duration-150">
                    View Responses &amp; Analytics
                  </h3>
                  <p className="text-sm text-gray-600">
                    Inspect itemized compliance by college and area
                  </p>
                </div>
                <ChevronRightIcon className="w-5 h-5 text-gray-500 group-hover:text-maroon-800 transition-colors duration-150 shrink-0" />
              </Card>
            </Link>

            <Link
              to="/admin/reports"
              className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-800"
            >
              <Card hover className="flex items-center gap-4 active:scale-[0.98]">
                <div className="w-10 h-10 bg-amber-100 text-amber-800 rounded-lg flex items-center justify-center shrink-0">
                  <DownloadIcon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 group-hover:text-maroon-800 transition-colors duration-150">
                    Export Compliance Matrix
                  </h3>
                  <p className="text-sm text-gray-600">
                    Download summary and per-college Excel workbooks
                  </p>
                </div>
                <ChevronRightIcon className="w-5 h-5 text-gray-500 group-hover:text-maroon-800 transition-colors duration-150 shrink-0" />
              </Card>
            </Link>
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Recent Submissions
          </h2>
          <Card>
            {recentActivity.length === 0 ? (
              <div className="text-center py-8">
                <InfoCircleIcon className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-700 font-medium">No submissions yet</p>
                <p className="text-sm text-gray-600 mt-1 max-w-prose mx-auto">
                  Completed college evaluations will appear here as they are
                  submitted.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {recentActivity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center shrink-0">
                      <CheckIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {activity.collegeName}
                      </p>
                      <p className="text-sm text-gray-600">
                        {activity.collegeCode || "Completed evaluation"}
                      </p>
                    </div>
                    <span className="text-sm text-gray-600 tabular-nums shrink-0">
                      {formatTimeAgo(activity.completedAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {recentActivity.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <Link
                  to="/admin/responses"
                  className={buttonVariants({
                    variant: "secondary",
                    size: "sm",
                    className: "w-full",
                  })}
                >
                  View All Submissions
                </Link>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Real Connection & System Status */}
      <Card variant="bordered" className="bg-gray-50 border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {error ? (
              <>
                <span
                  className="w-2.5 h-2.5 bg-red-600 rounded-full shrink-0"
                  aria-hidden="true"
                />
                <span className="text-sm font-medium text-red-800">
                  Sync Issue: Metrics could not be refreshed
                </span>
              </>
            ) : !isOnline ? (
              <>
                <WifiOffIcon className="w-4 h-4 text-amber-700 shrink-0" />
                <span className="text-sm font-medium text-amber-900">
                  Offline: Showing last synced data
                </span>
              </>
            ) : (
              <>
                <span
                  className="w-2.5 h-2.5 bg-emerald-600 rounded-full shrink-0"
                  aria-hidden="true"
                />
                <span className="text-sm font-medium text-gray-800">
                  Connected
                  {lastSyncedAt && (
                    <span className="font-normal text-gray-600 tabular-nums">
                      {" "}
                      • Last synced {lastSyncedAt}
                    </span>
                  )}
                </span>
              </>
            )}
          </div>
          <span className="text-sm text-gray-600 tabular-nums">
            {stats?.activeColleges ?? 0} colleges enrolled •{" "}
            {stats?.activeAreas ?? 0} areas active
          </span>
        </div>
      </Card>
    </div>
  );
}

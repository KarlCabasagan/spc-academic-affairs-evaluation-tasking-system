import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Button, Card, Loading } from "../../components/ui";

interface Stats {
  totalAreas: number;
  activeAreas: number;
  totalQuestions: number;
  totalColleges: number;
  activeColleges: number;
  totalEvaluations: number;
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

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();

    // Set up real-time subscriptions
    const sessionsChannel = supabase
      .channel("dashboard-sessions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "evaluation_sessions" },
        () => {
          fetchDashboardData();
        }
      )
      .subscribe();

    const responsesChannel = supabase
      .channel("dashboard-responses")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "responses" },
        () => {
          fetchDashboardData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sessionsChannel);
      supabase.removeChannel(responsesChannel);
    };
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch areas count
      const { count: totalAreas } = await supabase
        .from("areas")
        .select("*", { count: "exact", head: true });

      const { count: activeAreas } = await supabase
        .from("areas")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      // Fetch colleges count
      const { count: totalColleges } = await supabase
        .from("colleges")
        .select("*", { count: "exact", head: true });

      const { count: activeColleges } = await supabase
        .from("colleges")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      // Fetch leaf questions count
      const { data: allQuestions } = await supabase
        .from("questions")
        .select("id, parent_id")
        .eq("is_active", true);

      const parentIds = new Set(
        (allQuestions || []).filter((q) => q.parent_id).map((q) => q.parent_id)
      );
      const leafQuestions = (allQuestions || []).filter(
        (q) => !parentIds.has(q.id)
      );
      const totalQuestions = leafQuestions.length;

      // Fetch evaluations count
      const { count: totalEvaluations } = await supabase
        .from("evaluation_sessions")
        .select("*", { count: "exact", head: true });

      const { count: completedEvaluations } = await supabase
        .from("evaluation_sessions")
        .select("*", { count: "exact", head: true })
        .eq("is_complete", true);

      // Fetch responses for average compliance and total count
      const { data: responses, count: totalResponses } = await supabase
        .from("responses")
        .select("status", { count: "exact" });

      let averageCompliance: number | null = null;
      if (responses && responses.length > 0) {
        const validResponses = responses.filter(
          (r) => r.status === "complied" || r.status === "not_complied"
        );
        if (validResponses.length > 0) {
          const compliedCount = validResponses.filter(
            (r) => r.status === "complied"
          ).length;
          averageCompliance = (compliedCount / validResponses.length) * 100;
        }
      }

      // Fetch recent activity
      const { data: recentSessions } = await supabase
        .from("evaluation_sessions")
        .select(
          `
          id,
          completed_at,
          colleges (name, code)
        `
        )
        .eq("is_complete", true)
        .order("completed_at", { ascending: false })
        .limit(5);

      const recent: RecentActivity[] = (recentSessions || [])
        .filter((s) => s.colleges && s.completed_at)
        .map((s) => {
          const college = s.colleges as unknown as {
            name: string;
            code: string | null;
          };
          return {
            id: s.id,
            collegeName: college.name,
            collegeCode: college.code,
            completedAt: s.completed_at!,
          };
        });

      setStats({
        totalAreas: totalAreas || 0,
        activeAreas: activeAreas || 0,
        totalQuestions,
        totalColleges: totalColleges || 0,
        activeColleges: activeColleges || 0,
        totalEvaluations: totalEvaluations || 0,
        completedEvaluations: completedEvaluations || 0,
        averageCompliance,
        totalResponses: totalResponses || 0,
      });

      setRecentActivity(recent);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loading size="lg" text="Loading dashboard..." />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Admin Dashboard
        </h1>
        <p className="text-gray-600 mt-1">
          Overview of the PACUCOA Evaluation Tasking System
        </p>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {/* Colleges */}
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Colleges</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {stats?.activeColleges || 0}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {stats?.totalColleges || 0} total
              </p>
            </div>
            <div className="w-12 h-12 bg-maroon-100 rounded-xl flex items-center justify-center">
              <svg
                className="w-6 h-6 text-maroon-600"
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
            </div>
          </div>
        </Card>

        {/* Average Compliance */}
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Avg. Compliance
              </p>
              <p
                className={`text-3xl font-bold mt-1 ${
                  stats && stats.averageCompliance !== null
                    ? stats.averageCompliance >= 80
                      ? "text-emerald-600"
                      : stats.averageCompliance >= 50
                      ? "text-amber-600"
                      : "text-red-600"
                    : "text-gray-400"
                }`}
              >
                {stats && stats.averageCompliance !== null
                  ? `${stats.averageCompliance.toFixed(1)}%`
                  : "—"}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {stats?.completedEvaluations || 0} submissions
              </p>
            </div>
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
              <svg
                className="w-6 h-6 text-emerald-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
        </Card>

        {/* Areas */}
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Areas</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {stats?.activeAreas || 0}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {stats?.totalQuestions || 0} questions
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <svg
                className="w-6 h-6 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
          </div>
        </Card>

        {/* Total Responses */}
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Total Responses
              </p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {stats?.totalResponses.toLocaleString() || 0}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                from {stats?.completedEvaluations || 0} submissions
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <svg
                className="w-6 h-6 text-purple-600"
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
            <Link to="/admin/colleges">
              <Card hover className="flex items-center gap-4">
                <div className="w-10 h-10 bg-maroon-100 text-maroon-800 rounded-lg flex items-center justify-center">
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
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">Manage Colleges</h3>
                  <p className="text-sm text-gray-500">
                    Add or edit college accounts
                  </p>
                </div>
                <svg
                  className="w-5 h-5 text-gray-400"
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
              </Card>
            </Link>

            <Link to="/admin/questions">
              <Card hover className="flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
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
                      d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">
                    Manage Questions
                  </h3>
                  <p className="text-sm text-gray-500">
                    Edit evaluation criteria
                  </p>
                </div>
                <svg
                  className="w-5 h-5 text-gray-400"
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
              </Card>
            </Link>

            <Link to="/admin/responses">
              <Card hover className="flex items-center gap-4">
                <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
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
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">View Analytics</h3>
                  <p className="text-sm text-gray-500">
                    Compliance by college & area
                  </p>
                </div>
                <svg
                  className="w-5 h-5 text-gray-400"
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
              </Card>
            </Link>

            <Link to="/admin/reports">
              <Card hover className="flex items-center gap-4">
                <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center">
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
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">Export Reports</h3>
                  <p className="text-sm text-gray-500">
                    Download compliance matrix
                  </p>
                </div>
                <svg
                  className="w-5 h-5 text-gray-400"
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
                <svg
                  className="w-12 h-12 text-gray-300 mx-auto mb-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
                <p className="text-gray-500">No submissions yet</p>
                <p className="text-sm text-gray-400 mt-1">
                  Recent evaluations will appear here
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {recentActivity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shrink-0">
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
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {activity.collegeName}
                      </p>
                      <p className="text-sm text-gray-500">
                        {activity.collegeCode || "Completed evaluation"}
                      </p>
                    </div>
                    <span className="text-sm text-gray-400 shrink-0">
                      {formatTimeAgo(activity.completedAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {recentActivity.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <Link to="/admin/responses">
                  <Button variant="secondary" size="sm" className="w-full">
                    View All Submissions
                  </Button>
                </Link>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* System Status */}
      <Card variant="bordered" className="bg-gray-50 border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium text-gray-700">
              System Status: Active
            </span>
          </div>
          <span className="text-sm text-gray-500">
            {stats?.activeColleges || 0} colleges enrolled •{" "}
            {stats?.activeAreas || 0} areas active
          </span>
        </div>
      </Card>
    </div>
  );
}

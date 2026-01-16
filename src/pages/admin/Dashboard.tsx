import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Card, Loading } from "../../components/ui";

interface Stats {
  totalAreas: number;
  activeAreas: number;
  totalQuestions: number;
  totalEvaluations: number;
  completedEvaluations: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // Fetch areas count
      const { count: totalAreas } = await supabase
        .from("areas")
        .select("*", { count: "exact", head: true });

      const { count: activeAreas } = await supabase
        .from("areas")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      // Fetch leaf questions count (questions that are not parents of other questions)
      const { data: allQuestions } = await supabase
        .from("questions")
        .select("id, parent_id")
        .eq("is_active", true);

      // Count questions that don't have any children (leaf nodes)
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

      setStats({
        totalAreas: totalAreas || 0,
        activeAreas: activeAreas || 0,
        totalQuestions: totalQuestions || 0,
        totalEvaluations: totalEvaluations || 0,
        completedEvaluations: completedEvaluations || 0,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loading size="lg" text="Loading dashboard..." />
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Areas",
      value: stats?.totalAreas || 0,
      subLabel: `${stats?.activeAreas || 0} active`,
      icon: (
        <svg
          className="w-6 h-6"
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
      ),
      bgLight: "bg-blue-100",
      textColor: "text-blue-600",
    },
    {
      label: "Total Questions",
      value: stats?.totalQuestions || 0,
      subLabel: "across all areas",
      icon: (
        <svg
          className="w-6 h-6"
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
      ),
      bgLight: "bg-purple-100",
      textColor: "text-purple-600",
    },
    {
      label: "Evaluations",
      value: stats?.completedEvaluations || 0,
      subLabel: `${stats?.totalEvaluations || 0} total started`,
      icon: (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
          />
        </svg>
      ),
      bgLight: "bg-green-100",
      textColor: "text-green-600",
    },
  ];

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Dashboard
        </h1>
        <p className="text-gray-600 mt-1">
          Welcome to the PACUCOA Evaluation Admin Panel
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        {statCards.map((stat, index) => (
          <Card key={index}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  {stat.label}
                </p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {stat.value}
                </p>
                <p className="text-sm text-gray-500 mt-1">{stat.subLabel}</p>
              </div>
              <div
                className={`w-12 h-12 ${stat.bgLight} rounded-xl flex items-center justify-center`}
              >
                <span className={stat.textColor}>{stat.icon}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Quick Actions
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link to="/admin/areas">
            <Card hover className="flex items-center gap-4">
              <div className="w-12 h-12 bg-maroon-100 text-maroon-800 rounded-xl flex items-center justify-center">
                <svg
                  className="w-6 h-6"
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
              <div>
                <h3 className="font-medium text-gray-900">Manage Areas</h3>
                <p className="text-sm text-gray-500">
                  Add, edit, or remove evaluation areas
                </p>
              </div>
            </Card>
          </Link>

          <a href="/" target="_blank" rel="noopener noreferrer">
            <Card hover className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-xl flex items-center justify-center">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="font-medium text-gray-900">View Public Site</h3>
                <p className="text-sm text-gray-500">
                  See the evaluation portal as users see it
                </p>
              </div>
            </Card>
          </a>
        </div>
      </div>

      {/* Info Section */}
      <Card variant="bordered" className="bg-maroon-50 border-maroon-200">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-maroon-800 text-white rounded-lg flex items-center justify-center shrink-0">
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
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-maroon-900 mb-1">
              Getting Started
            </h3>
            <p className="text-sm text-maroon-700">
              Start by managing your{" "}
              <Link
                to="/admin/areas"
                className="underline font-medium hover:text-maroon-900"
              >
                evaluation areas
              </Link>
              . For each area, you can add questions that users will evaluate.
              The system includes {stats?.totalAreas || 0} PACUCOA areas seeded
              by default.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

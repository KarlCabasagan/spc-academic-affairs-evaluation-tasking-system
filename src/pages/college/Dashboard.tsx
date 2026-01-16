import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import type { Area } from "../../lib/types";
import { Card, Loading, showToast } from "../../components/ui";

export default function CollegeDashboard() {
  const { college } = useAuth();
  const [areas, setAreas] = useState<Area[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [completedAreas, setCompletedAreas] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchData();
  }, [college]);

  const fetchData = async () => {
    try {
      // Fetch active areas
      const { data: areasData, error: areasError } = await supabase
        .from("areas")
        .select("*")
        .eq("is_active", true)
        .order("area_number", { ascending: true });

      if (areasError) throw areasError;
      setAreas(areasData || []);

      // Check which areas have been completed by this college
      if (college) {
        const { data: sessionsData } = await supabase
          .from("evaluation_sessions")
          .select("id, responses(question_id, questions(area_id))")
          .eq("college_id", college.id)
          .eq("is_complete", true);

        if (sessionsData) {
          const completedAreaIds = new Set<string>();
          sessionsData.forEach((session: any) => {
            session.responses?.forEach((response: any) => {
              if (response.questions?.area_id) {
                completedAreaIds.add(response.questions.area_id);
              }
            });
          });
          setCompletedAreas(completedAreaIds);
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      showToast("Failed to load evaluation areas", "error");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loading size="lg" text="Loading evaluation areas..." />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Welcome, {college?.name || "College"}
        </h1>
        <p className="text-gray-600 mt-1">
          Select an evaluation area to begin your assessment
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <Card>
          <div className="text-center">
            <p className="text-3xl font-bold text-maroon-800">{areas.length}</p>
            <p className="text-sm text-gray-500">Total Areas</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-3xl font-bold text-green-600">
              {completedAreas.size}
            </p>
            <p className="text-sm text-gray-500">Completed</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-3xl font-bold text-amber-600">
              {areas.length - completedAreas.size}
            </p>
            <p className="text-sm text-gray-500">Remaining</p>
          </div>
        </Card>
      </div>

      {/* Areas Grid */}
      {areas.length === 0 ? (
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
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No evaluation areas available
          </h3>
          <p className="text-gray-500">
            Please contact the administrator to set up evaluation areas.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {areas.map((area) => {
            const isComplete = completedAreas.has(area.id);

            return (
              <Link
                key={area.id}
                to={`/college/evaluate/${area.id}`}
                className="group"
              >
                <Card className="h-full transition-all duration-200 hover:shadow-lg hover:border-maroon-300 group-hover:-translate-y-1">
                  <div className="flex items-start gap-4">
                    <div
                      className={`
                      shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg
                      ${
                        isComplete
                          ? "bg-green-100 text-green-700"
                          : "bg-maroon-100 text-maroon-800"
                      }
                    `}
                    >
                      {isComplete ? (
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
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      ) : (
                        area.area_number
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 group-hover:text-maroon-800 transition-colors">
                        Area {area.area_number}: {area.name}
                      </h3>
                      {area.description && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                          {area.description}
                        </p>
                      )}
                      <div className="mt-3">
                        {isComplete ? (
                          <span className="text-sm text-green-600 font-medium">
                            ✓ Completed
                          </span>
                        ) : (
                          <span className="text-sm text-maroon-600 font-medium group-hover:underline">
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

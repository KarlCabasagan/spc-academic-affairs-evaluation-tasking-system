import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import type { Area, ComplianceStatus } from "../../lib/types";
import { Card, Loading, showToast } from "../../components/ui";

interface AreaComplianceData {
  areaId: string;
  complied: number;
  notComplied: number;
  notApplicable: number;
  compliance: number | null;
  hasResponses: boolean;
}

export default function CollegeDashboard() {
  const { college } = useAuth();
  const [areas, setAreas] = useState<Area[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [completedAreas, setCompletedAreas] = useState<Set<string>>(new Set());
  const [areaCompliance, setAreaCompliance] = useState<
    Map<string, AreaComplianceData>
  >(new Map());
  const [overallCompliance, setOverallCompliance] = useState<number | null>(
    null,
  );

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

      // Fetch all questions to identify leaf questions
      const { data: questionsData } = await supabase
        .from("questions")
        .select("id, area_id, parent_id")
        .eq("is_active", true);

      // Identify leaf questions (no children)
      const parentIds = new Set(
        (questionsData || [])
          .filter((q) => q.parent_id)
          .map((q) => q.parent_id),
      );
      const leafQuestions = (questionsData || []).filter(
        (q) => !parentIds.has(q.id),
      );
      const leafQuestionIds = new Set(leafQuestions.map((q) => q.id));
      const questionAreaMap = new Map<string, string>();
      leafQuestions.forEach((q) => {
        questionAreaMap.set(q.id, q.area_id);
      });

      // Check which areas have been completed by this college and calculate compliance
      if (college) {
        const { data: sessionsData } = await supabase
          .from("evaluation_sessions")
          .select(
            `
            id,
            responses (
              question_id,
              status,
              questions (area_id)
            )
          `,
          )
          .eq("college_id", college.id)
          .eq("is_complete", true)
          .order("completed_at", { ascending: false });

        if (sessionsData) {
          const completedAreaIds = new Set<string>();
          const areaResponses = new Map<
            string,
            { complied: number; notComplied: number; notApplicable: number }
          >();

          // SSOT: track which areas we've already processed (most recent first)
          const processedAreas = new Set<string>();

          sessionsData.forEach((session: any) => {
            // Group responses by area
            const sessionAreaResponses = new Map<string, any[]>();

            session.responses?.forEach((response: any) => {
              // Only count leaf questions
              if (!leafQuestionIds.has(response.question_id)) return;

              const areaId = response.questions?.area_id;
              if (areaId) {
                completedAreaIds.add(areaId);
                if (!sessionAreaResponses.has(areaId)) {
                  sessionAreaResponses.set(areaId, []);
                }
                sessionAreaResponses.get(areaId)!.push(response);
              }
            });

            // For each area in this session, if not yet processed, use these responses
            sessionAreaResponses.forEach((responses, areaId) => {
              if (!processedAreas.has(areaId)) {
                processedAreas.add(areaId);

                let complied = 0;
                let notComplied = 0;
                let notApplicable = 0;

                responses.forEach((r) => {
                  const status = r.status as ComplianceStatus;
                  if (status === "complied") complied++;
                  else if (status === "not_complied") notComplied++;
                  else if (status === "not_applicable") notApplicable++;
                });

                areaResponses.set(areaId, {
                  complied,
                  notComplied,
                  notApplicable,
                });
              }
            });
          });

          setCompletedAreas(completedAreaIds);

          // Calculate compliance per area
          const complianceMap = new Map<string, AreaComplianceData>();
          let totalComplianceSum = 0;
          let areaCount = 0;

          areaResponses.forEach((data, areaId) => {
            const denominator = data.complied + data.notComplied;
            let compliance: number | null = null;

            if (denominator > 0) {
              compliance = (data.complied / denominator) * 100;
              totalComplianceSum += compliance;
              areaCount++;
            }

            complianceMap.set(areaId, {
              areaId,
              complied: data.complied,
              notComplied: data.notComplied,
              notApplicable: data.notApplicable,
              compliance,
              hasResponses: true,
            });
          });

          setAreaCompliance(complianceMap);
          setOverallCompliance(
            areaCount > 0 ? totalComplianceSum / areaCount : null,
          );
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      showToast("Failed to load evaluation areas", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const getComplianceColor = (compliance: number | null): string => {
    if (compliance === null) return "text-gray-400";
    if (compliance >= 80) return "text-emerald-600";
    if (compliance >= 50) return "text-amber-600";
    return "text-red-600";
  };

  const getComplianceBg = (compliance: number | null): string => {
    if (compliance === null) return "bg-gray-100";
    if (compliance >= 80) return "bg-emerald-100";
    if (compliance >= 50) return "bg-amber-100";
    return "bg-red-100";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loading size="lg" text="Loading evaluation areas..." />
      </div>
    );
  }

  const completionRate =
    areas.length > 0
      ? ((completedAreas.size / areas.length) * 100).toFixed(0)
      : "0";

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

      {/* Summary Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {/* Overall Compliance */}
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Overall Compliance
              </p>
              <p
                className={`text-3xl font-bold mt-1 ${getComplianceColor(overallCompliance)}`}
              >
                {overallCompliance !== null
                  ? `${overallCompliance.toFixed(1)}%`
                  : "—"}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                across {completedAreas.size} areas
              </p>
            </div>
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center ${getComplianceBg(overallCompliance)}`}
            >
              <svg
                className={`w-6 h-6 ${getComplianceColor(overallCompliance)}`}
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

        {/* Completion Rate */}
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Completion Rate
              </p>
              <p className="text-3xl font-bold text-maroon-800 mt-1">
                {completionRate}%
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {completedAreas.size} of {areas.length} areas
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
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
          </div>
        </Card>

        {/* Completed Areas */}
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Completed</p>
              <p className="text-3xl font-bold text-green-600 mt-1">
                {completedAreas.size}
              </p>
              <p className="text-sm text-gray-500 mt-1">areas evaluated</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <svg
                className="w-6 h-6 text-green-600"
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
          </div>
        </Card>

        {/* Remaining Areas */}
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Remaining</p>
              <p className="text-3xl font-bold text-amber-600 mt-1">
                {areas.length - completedAreas.size}
              </p>
              <p className="text-sm text-gray-500 mt-1">areas pending</p>
            </div>
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
              <svg
                className="w-6 h-6 text-amber-600"
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
            const areaData = areaCompliance.get(area.id);
            const compliance = areaData?.compliance ?? null;

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
                      shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg relative
                      ${
                        isComplete
                          ? "bg-green-100 text-green-700"
                          : "bg-maroon-100 text-maroon-800"
                      }
                    `}
                    >
                      {area.area_number}
                      {isComplete && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                          <svg
                            className="w-3 h-3 text-white"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </div>
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
                      <div className="mt-3 flex items-center gap-2">
                        {isComplete ? (
                          <>
                            <span
                              className={`text-sm font-medium ${getComplianceColor(compliance)}`}
                            >
                              ✓{" "}
                              {compliance !== null
                                ? `${compliance.toFixed(1)}% Compliant`
                                : "Completed"}
                            </span>
                          </>
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

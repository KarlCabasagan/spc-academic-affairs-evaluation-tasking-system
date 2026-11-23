import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  buttonVariants,
  Card,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  EyeIcon,
  InfoCircleIcon,
  Loading,
  showToast,
} from "../../components/ui";
import { supabase } from "../../lib/supabase";
import type { Area } from "../../lib/types";

/**
 * Admin Preview College Dashboard.
 * Shows a generic read-only simulation matching CollegeDashboard layout and cards.
 */
export default function PreviewCollege() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchAreas = async () => {
      try {
        const { data, error } = await supabase
          .from("areas")
          .select("*")
          .eq("is_active", true)
          .order("area_number", { ascending: true });

        if (error) throw error;
        if (!cancelled) {
          setAreas((data || []) as Area[]);
        }
      } catch {
        if (!cancelled) {
          showToast("Failed to load evaluation areas.", "error");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void fetchAreas();

    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loading size="lg" text="Loading preview…" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Preview Mode Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
              <EyeIcon className="w-5 h-5 text-amber-800" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-amber-900">
                Preview Mode — College Dashboard View
              </p>
              <p className="text-sm text-amber-800 max-w-prose">
                You are viewing how the dashboard appears to signed-in college
                accounts.
              </p>
            </div>
          </div>
          <Link
            to="/admin/dashboard"
            className={buttonVariants({
              variant: "secondary",
              size: "sm",
              className: "shrink-0",
            })}
          >
            <CloseIcon className="w-4 h-4" />
            Exit Preview
          </Link>
        </div>
      </div>

      {/* Simulated College Dashboard */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Welcome, [College Name]
          </h1>
          <p className="text-gray-600 max-w-prose mt-1">
            Select an evaluation area below to complete or update your
            self-assessment.
          </p>
        </div>

        {/* 4 Summary Cards matching CollegeDashboard */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Overall Compliance
                </p>
                <p className="text-3xl font-bold text-gray-700 tabular-nums mt-1">
                  —
                </p>
                <p className="text-sm text-gray-600 tabular-nums mt-1">
                  across 0 areas
                </p>
              </div>
              <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
                <CheckCircleIcon className="w-6 h-6 text-gray-600" />
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
                  0%
                </p>
                <p className="text-sm text-gray-600 tabular-nums mt-1">
                  0 of {areas.length} areas
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
                  0
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
                  {areas.length}
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
            {areas.map((area) => (
              <div key={area.id} className="cursor-not-allowed">
                <Card className="h-full opacity-90">
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg tabular-nums bg-maroon-100 text-maroon-800">
                      {area.area_number}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-semibold text-gray-900 tabular-nums">
                        Area {area.area_number}: {area.name}
                      </h2>
                      {area.description && (
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2 max-w-prose">
                          {area.description}
                        </p>
                      )}
                      <div className="mt-3">
                        <span className="text-sm text-maroon-800 font-medium">
                          Start Evaluation →
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            ))}
          </div>
        )}

        {/* Preview Note */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600 max-w-prose mx-auto">
            This is a simulated preview. Signed-in college accounts see their
            live compliance scores and can open areas to submit evaluations.
          </p>
        </div>
      </div>
    </div>
  );
}

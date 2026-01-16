import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import type { Area } from "../../lib/types";
import { Button, Card, Loading, showToast } from "../../components/ui";

/**
 * Admin Preview College Dashboard
 * Shows a generic view of how the College Dashboard appears to college users.
 * This is a read-only simulation without specific college data.
 */
export default function PreviewCollege() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAreas();
  }, []);

  const fetchAreas = async () => {
    try {
      const { data, error } = await supabase
        .from("areas")
        .select("*")
        .eq("is_active", true)
        .order("area_number", { ascending: true });

      if (error) throw error;
      setAreas(data || []);
    } catch (error) {
      console.error("Error fetching areas:", error);
      showToast("Failed to load evaluation areas", "error");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loading size="lg" text="Loading preview..." />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Preview Mode Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5 text-amber-600"
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
              <h3 className="font-semibold text-amber-900">
                Preview Mode — College Dashboard View
              </h3>
              <p className="text-sm text-amber-700">
                You're viewing how the dashboard appears to college users
              </p>
            </div>
          </div>
          <Link to="/admin/dashboard">
            <Button variant="secondary" size="sm">
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              Exit Preview
            </Button>
          </Link>
        </div>
      </div>

      {/* Simulated College Dashboard */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {/* Welcome Header (Generic) */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Welcome, [College Name]
          </h1>
          <p className="text-gray-600 mt-1">
            Select an evaluation area to begin your assessment
          </p>
        </div>

        {/* Stats (Simulated) */}
        <div className="grid gap-4 sm:grid-cols-3 mb-8">
          <Card>
            <div className="text-center">
              <p className="text-3xl font-bold text-maroon-800">
                {areas.length}
              </p>
              <p className="text-sm text-gray-500">Total Areas</p>
            </div>
          </Card>
          <Card>
            <div className="text-center">
              <p className="text-3xl font-bold text-green-600">—</p>
              <p className="text-sm text-gray-500">Completed</p>
            </div>
          </Card>
          <Card>
            <div className="text-center">
              <p className="text-3xl font-bold text-amber-600">—</p>
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
            {areas.map((area) => (
              <div key={area.id} className="group cursor-not-allowed">
                <Card className="h-full transition-all duration-200 opacity-90">
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg bg-maroon-100 text-maroon-800">
                      {area.area_number}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900">
                        Area {area.area_number}: {area.name}
                      </h3>
                      {area.description && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                          {area.description}
                        </p>
                      )}
                      <div className="mt-3">
                        <span className="text-sm text-maroon-600 font-medium">
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
          <p className="text-sm text-gray-500 italic">
            This is a preview. College users would see their actual completion
            status and be able to click areas to start evaluations.
          </p>
        </div>
      </div>
    </div>
  );
}

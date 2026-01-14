import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import type { Area } from "../../lib/types";
import { Card, Loading } from "../../components/ui";
import heroImage from "../../assets/gorosei.jpg";

export default function Landing() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isImageLoaded, setIsImageLoaded] = useState(false);

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
    } catch (err) {
      setError("Failed to load areas. Please try again later.");
      console.error("Error fetching areas:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loading size="lg" text="Loading evaluation areas..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <svg
            className="w-12 h-12 text-red-500 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h2 className="text-lg font-semibold text-red-800 mb-2">
            Something went wrong
          </h2>
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Hero Section */}
      <section className="relative overflow-hidden text-white py-16 sm:py-24">
        {/* Preload Image */}
        <img
          src={heroImage}
          className="hidden"
          onLoad={() => setIsImageLoaded(true)}
          alt=""
        />
        {/* Background Image */}
        <div
          className={`absolute inset-0 bg-cover bg-position-[50%_60%] transition-opacity duration-1000 ${
            isImageLoaded ? "opacity-100" : "opacity-0"
          }`}
          style={{ backgroundImage: `url(${heroImage})` }}
        />
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-linear-to-br from-maroon-800/90 via-maroon-900/95 to-maroon-950/98" />

        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6">
              PACUCOA Accreditation
              <span className="block text-maroon-200 mt-2">
                Self-Evaluation Survey
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-maroon-100 mb-8 leading-relaxed">
              Help us improve by evaluating specific areas of our academic
              program. Your anonymous feedback is valuable for our continuous
              improvement.
            </p>
            <div className="flex flex-wrap justify-center gap-4 text-sm">
              <div className="flex items-center gap-2 bg-white/10 rounded-full px-4 py-2">
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
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                Anonymous
              </div>
              <div className="flex items-center gap-2 bg-white/10 rounded-full px-4 py-2">
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
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Quick & Easy
              </div>
              <div className="flex items-center gap-2 bg-white/10 rounded-full px-4 py-2">
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
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {areas.length} Areas Available
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Areas Grid */}
      <section className="py-12 sm:py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
              Select an Area to Evaluate
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Choose any area below to begin your evaluation. You can evaluate
              multiple areas independently at your own pace.
            </p>
          </div>

          {areas.length === 0 ? (
            <div className="text-center py-12">
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
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                />
              </svg>
              <p className="text-gray-500">
                No evaluation areas are currently available.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {areas.map((area, index) => (
                <Link
                  key={area.id}
                  to={`/evaluate/${area.id}`}
                  className="group block animate-slide-up"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <Card hover className="h-full">
                    <div className="flex items-start gap-4">
                      <div className="shrink-0 w-12 h-12 bg-maroon-100 text-maroon-800 rounded-xl flex items-center justify-center font-bold text-lg group-hover:bg-maroon-800 group-hover:text-white transition-colors">
                        {area.area_number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 group-hover:text-maroon-800 transition-colors mb-1">
                          {area.name}
                        </h3>
                        {area.description && (
                          <p className="text-sm text-gray-500 line-clamp-2">
                            {area.description}
                          </p>
                        )}
                      </div>
                      <svg
                        className="w-5 h-5 text-gray-400 group-hover:text-maroon-800 group-hover:translate-x-1 transition-all shrink-0"
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
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Instructions */}
      <section className="bg-gray-100 py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h3 className="text-xl font-semibold text-gray-900 mb-6 text-center">
              How It Works
            </h3>
            <div className="grid sm:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-maroon-800 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold">
                  1
                </div>
                <h4 className="font-medium text-gray-900 mb-2">
                  Select an Area
                </h4>
                <p className="text-sm text-gray-600">
                  Choose any area you want to evaluate from the list above.
                </p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-maroon-800 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold">
                  2
                </div>
                <h4 className="font-medium text-gray-900 mb-2">
                  Answer Questions
                </h4>
                <p className="text-sm text-gray-600">
                  Rate each item as Complied, Not Complied, or Not Applicable.
                </p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-maroon-800 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold">
                  3
                </div>
                <h4 className="font-medium text-gray-900 mb-2">
                  Submit Anonymously
                </h4>
                <p className="text-sm text-gray-600">
                  Your responses are submitted without any personal
                  identification.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useOfflineEvaluation } from "../../hooks/useOfflineEvaluation";
import type { Area } from "../../lib/types";
import {
  Button,
  Card,
  Loading,
  ConfirmDialog,
  showToast,
} from "../../components/ui";
import heroImage from "../../assets/gorosei.jpg";

export default function Landing() {
  const {
    isOnline,
    isLoading,
    areas,
    completedAreas,
    fetchAreas,
    isAreaCompleted,
    clearAllData,
  } = useOfflineEvaluation();

  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    fetchAreas();
  }, [fetchAreas]);

  const handleClearAllData = () => {
    clearAllData();
    showToast("All evaluation data has been cleared", "success");
    setShowClearConfirm(false);
  };

  const hasCompletedAreas = completedAreas.length > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loading size="lg" text="Loading evaluation areas..." />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Offline Indicator */}
      {!isOnline && (
        <div className="bg-amber-100 border-b border-amber-200 px-4 py-2 text-center">
          <p className="text-sm text-amber-800">
            <span className="font-medium">Offline Mode:</span> Working with
            cached data. Your responses are saved locally.
          </p>
        </div>
      )}

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
              Evaluate specific areas of our academic program. Your responses
              are saved locally and can be exported to Excel for your records.
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
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
                Export to Excel
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
                Works Offline
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

      {/* Action Buttons */}
      {hasCompletedAreas && (
        <section className="bg-maroon-50 border-b border-maroon-100 py-4">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-maroon-800">
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
                <span className="font-medium">
                  {completedAreas.length} area
                  {completedAreas.length > 1 ? "s" : ""} completed
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowClearConfirm(true)}
                >
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
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                  Clear All Data
                </Button>
                <Link to="/public/export">
                  <Button size="sm">
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
                        d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    Export Results
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Areas Grid */}
      <section className="py-12 sm:py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
              Select an Area to Evaluate
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Choose any area below to begin your evaluation. Your responses are
              saved automatically and you can return to edit them anytime.
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
                {isOnline
                  ? "No evaluation areas are currently available."
                  : "No cached areas available. Please connect to the internet to load areas."}
              </p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {areas.map((area: Area, index: number) => {
                const isCompleted = isAreaCompleted(area.id);
                return (
                  <Link
                    key={area.id}
                    to={`/public/evaluate/${area.id}`}
                    className="group block animate-slide-up"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <Card
                      hover
                      className={`h-full ${
                        isCompleted ? "ring-2 ring-green-500" : ""
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg transition-colors ${
                            isCompleted
                              ? "bg-green-100 text-green-700 group-hover:bg-green-700 group-hover:text-white"
                              : "bg-maroon-100 text-maroon-800 group-hover:bg-maroon-800 group-hover:text-white"
                          }`}
                        >
                          {isCompleted ? (
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
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-gray-900 group-hover:text-maroon-800 transition-colors">
                              {area.name}
                            </h3>
                            {isCompleted && (
                              <span className="shrink-0 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                                Completed
                              </span>
                            )}
                          </div>
                          {area.description && (
                            <p className="text-sm text-gray-500 line-clamp-2 mt-1">
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
                );
              })}
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
                  Rate each item and mark the area complete when done.
                </p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-maroon-800 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold">
                  3
                </div>
                <h4 className="font-medium text-gray-900 mb-2">
                  Export Results
                </h4>
                <p className="text-sm text-gray-600">
                  Download your responses as an Excel file for your records.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Clear All Confirmation */}
      <ConfirmDialog
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleClearAllData}
        title="Clear All Data?"
        message="This will permanently delete all your saved responses and completion status. This action cannot be undone."
        confirmText="Clear All"
        confirmVariant="danger"
      />
    </div>
  );
}

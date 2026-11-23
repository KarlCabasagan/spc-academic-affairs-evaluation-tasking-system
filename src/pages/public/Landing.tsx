import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import heroImage from "../../assets/gorosei.jpg";
import {
  Button,
  buttonVariants,
  Card,
  CheckCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  ConfirmDialog,
  DownloadIcon,
  InfoCircleIcon,
  Loading,
  showToast,
  TrashIcon,
  WifiOffIcon,
} from "../../components/ui";
import { useOfflineEvaluation } from "../../hooks/useOfflineEvaluation";
import type { Area } from "../../lib/types";

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
    void fetchAreas();
  }, [fetchAreas]);

  const handleClearAllData = () => {
    const ok = clearAllData();
    if (ok) {
      showToast("All evaluation data has been cleared.", "success");
    } else {
      showToast("Could not clear local browser storage.", "error");
    }
    setShowClearConfirm(false);
  };

  const hasCompletedAreas = completedAreas.length > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loading size="lg" text="Loading evaluation areas…" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Offline Indicator */}
      {!isOnline && (
        <div
          role="status"
          className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-center"
        >
          <p className="text-sm text-amber-900 inline-flex items-center justify-center gap-2">
            <WifiOffIcon className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              <span className="font-medium">Offline Mode:</span> Working with
              cached data. Your responses are saved locally.
            </span>
          </p>
        </div>
      )}

      {/* Hero Section */}
      <section className="relative overflow-hidden text-white py-16 sm:py-24">
        <img
          src={heroImage}
          alt=""
          aria-hidden="true"
          onLoad={() => setIsImageLoaded(true)}
          className={`absolute inset-0 w-full h-full object-cover object-[50%_60%] transition-opacity duration-200 ease-out ${
            isImageLoaded ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-linear-to-br from-maroon-800/90 via-maroon-900/95 to-maroon-950/98"
        />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6">
              PACUCOA Accreditation
              <span className="block text-maroon-200 mt-2">
                Self-Evaluation Survey
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-maroon-100 mb-8 leading-relaxed max-w-prose mx-auto">
              Evaluate specific areas of our academic program. Your responses
              are saved locally and can be exported to Excel for your records.
            </p>
            <div className="flex flex-wrap justify-center gap-4 text-sm">
              <div className="flex items-center gap-2 bg-white/10 rounded-full px-4 py-2">
                <DownloadIcon className="w-5 h-5 shrink-0" />
                <span>Export to Excel</span>
              </div>
              <div className="flex items-center gap-2 bg-white/10 rounded-full px-4 py-2">
                <ClockIcon className="w-5 h-5 shrink-0" />
                <span>Works Offline</span>
              </div>
              <div className="flex items-center gap-2 bg-white/10 rounded-full px-4 py-2 tabular-nums">
                <CheckCircleIcon className="w-5 h-5 shrink-0" />
                <span>{areas.length} Areas Available</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Action Bar */}
      {hasCompletedAreas && (
        <section className="bg-maroon-50 border-b border-maroon-100 py-4">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-maroon-900">
                <CheckCircleIcon className="w-5 h-5 text-maroon-800 shrink-0" />
                <span className="font-medium tabular-nums">
                  {completedAreas.length} area
                  {completedAreas.length > 1 ? "s" : ""} completed
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowClearConfirm(true)}
                >
                  <TrashIcon className="w-4 h-4" />
                  Clear All Data
                </Button>
                <Link
                  to="/public/export"
                  className={buttonVariants({
                    variant: "primary",
                    size: "sm",
                  })}
                >
                  <DownloadIcon className="w-4 h-4" />
                  Export Results
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
            <p className="text-gray-600 max-w-prose mx-auto">
              Choose any area below to begin your evaluation. Your responses are
              saved automatically and you can return to edit them anytime.
            </p>
          </div>

          {areas.length === 0 ? (
            <div className="text-center py-12">
              <InfoCircleIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 max-w-prose mx-auto">
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
                    className="group block animate-slide-up rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-800"
                    style={{
                      animationDelay: `${Math.min(index * 30, 150)}ms`,
                    }}
                  >
                    <Card
                      hover
                      className={`h-full active:scale-[0.98] ${
                        isCompleted ? "ring-2 ring-emerald-600" : ""
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg tabular-nums transition-colors duration-150 ${
                            isCompleted
                              ? "bg-emerald-100 text-emerald-800 group-hover:bg-emerald-700 group-hover:text-white"
                              : "bg-maroon-100 text-maroon-800 group-hover:bg-maroon-800 group-hover:text-white"
                          }`}
                        >
                          {isCompleted ? (
                            <CheckIcon className="w-6 h-6" />
                          ) : (
                            area.area_number
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-gray-900 group-hover:text-maroon-800 transition-colors duration-150">
                              {area.name}
                            </h3>
                            {isCompleted && (
                              <span className="shrink-0 px-2 py-0.5 bg-emerald-100 text-emerald-800 text-xs font-medium rounded-full">
                                Completed
                              </span>
                            )}
                          </div>
                          {area.description && (
                            <p className="text-sm text-gray-600 line-clamp-2 mt-1 max-w-prose">
                              {area.description}
                            </p>
                          )}
                        </div>
                        <ChevronRightIcon className="w-5 h-5 text-gray-500 group-hover:text-maroon-800 group-hover:translate-x-1 transition-[color,transform] duration-150 shrink-0" />
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
            <h2 className="text-xl font-semibold text-gray-900 mb-6 text-center">
              How It Works
            </h2>
            <div className="grid sm:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-maroon-800 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold tabular-nums">
                  1
                </div>
                <h3 className="font-medium text-gray-900 mb-2">
                  Select an Area
                </h3>
                <p className="text-sm text-gray-600 max-w-prose mx-auto">
                  Choose any area you want to evaluate from the list above.
                </p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-maroon-800 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold tabular-nums">
                  2
                </div>
                <h3 className="font-medium text-gray-900 mb-2">
                  Answer Questions
                </h3>
                <p className="text-sm text-gray-600 max-w-prose mx-auto">
                  Rate each item and mark the area complete when done.
                </p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-maroon-800 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold tabular-nums">
                  3
                </div>
                <h3 className="font-medium text-gray-900 mb-2">
                  Export Results
                </h3>
                <p className="text-sm text-gray-600 max-w-prose mx-auto">
                  Download your responses as an Excel file for your records.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Attribution */}
      <div className="py-6 text-center border-t border-gray-200/70">
        <p className="text-sm text-gray-600">
          Made with{" "}
          <span className="text-red-600" aria-hidden="true">
            ❤
          </span>{" "}
          by John Karl Harley Cabasagan &amp; Jeoff Montebon
        </p>
      </div>

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

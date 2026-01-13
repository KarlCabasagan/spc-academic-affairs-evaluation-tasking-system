import { Link, useLocation } from "react-router-dom";
import { Button, Card } from "../../components/ui";

interface LocationState {
  areaName?: string;
}

export default function Complete() {
  const location = useLocation();
  const state = location.state as LocationState | null;
  const areaName = state?.areaName;

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16 animate-fade-in">
      <Card className="max-w-lg w-full text-center" padding="lg">
        {/* Success Icon */}
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-10 h-10 text-green-600"
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

        {/* Message */}
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
          Thank You!
        </h1>
        <p className="text-gray-600 mb-2">
          Your evaluation has been submitted successfully.
        </p>
        {areaName && (
          <p className="text-sm text-maroon-800 font-medium mb-6">
            Area: {areaName}
          </p>
        )}

        {/* Info Card */}
        <div className="bg-maroon-50 border border-maroon-100 rounded-xl p-4 mb-8 text-left">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-maroon-600 mt-0.5 shrink-0"
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
            <div>
              <p className="text-sm text-maroon-800 font-medium mb-1">
                What happens next?
              </p>
              <p className="text-sm text-maroon-700">
                Your anonymous feedback will be reviewed by the Academic Affairs
                Office to help improve our programs and services.
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/">
            <Button size="lg">Evaluate Another Area</Button>
          </Link>
          <Link to="/">
            <Button variant="secondary" size="lg">
              Return Home
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}

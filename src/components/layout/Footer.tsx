import { CheckCircleIcon } from "../ui";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-900 text-gray-300 py-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-maroon-800 rounded-lg flex items-center justify-center shrink-0">
              <CheckCircleIcon className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-medium text-white">
              SPC Academic Affairs Evaluation System
            </span>
          </div>

          <p className="text-sm text-gray-300 tabular-nums text-center sm:text-right">
            © {currentYear} SPC Office of the Vice President for Academic
            Affairs. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

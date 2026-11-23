import { useState } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { CloseIcon, Loading, MenuIcon, WifiOffIcon } from "../ui";

export default function CollegeLayout() {
  const { user, userRole, college, isLoading, isOnline, signOut } = useAuth();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  if (isLoading) {
    return <Loading fullScreen text="Loading…" />;
  }

  if (!user || !userRole) {
    return <Navigate to="/login" replace />;
  }

  if (userRole !== "college" || !college) {
    return (
      <Navigate
        to={userRole === "admin" ? "/admin/dashboard" : "/login"}
        replace
      />
    );
  }

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-maroon-800 focus:rounded-lg focus:shadow-lg focus:ring-2 focus:ring-maroon-800 font-medium text-sm"
      >
        Skip to main content
      </a>

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-3">
            {/* Logo / College Name */}
            <div className="flex items-center gap-3 min-w-0">
              {college.avatar_url ? (
                <img
                  src={college.avatar_url}
                  alt={college.name}
                  className="w-10 h-10 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-10 h-10 bg-maroon-100 text-maroon-800 rounded-full flex items-center justify-center font-bold shrink-0">
                  {college.code?.[0] || "C"}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate">
                  {college.name || "College Portal"}
                </p>
                {college.code && (
                  <p className="text-xs text-gray-600 truncate">{college.code}</p>
                )}
              </div>
            </div>

            {/* Desktop Navigation */}
            <nav
              aria-label="College navigation"
              className="hidden md:flex items-center gap-4 shrink-0"
            >
              <Link
                to="/college"
                className={`min-h-11 px-2.5 inline-flex items-center rounded-lg text-sm font-medium transition-[color,background-color,transform] duration-150 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-800 ${
                  location.pathname === "/college"
                    ? "text-maroon-800 bg-maroon-50"
                    : "text-gray-600 hover:text-maroon-800 hover:bg-gray-50"
                }`}
              >
                Dashboard
              </Link>
              <Link
                to="/college/compare"
                className={`min-h-11 px-2.5 inline-flex items-center rounded-lg text-sm font-medium transition-[color,background-color,transform] duration-150 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-800 ${
                  location.pathname === "/college/compare"
                    ? "text-maroon-800 bg-maroon-50"
                    : "text-gray-600 hover:text-maroon-800 hover:bg-gray-50"
                }`}
              >
                Compare
              </Link>
              <Link
                to="/college/change-password"
                className={`min-h-11 px-2.5 inline-flex items-center rounded-lg text-sm font-medium transition-[color,background-color,transform] duration-150 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-800 ${
                  location.pathname === "/college/change-password"
                    ? "text-maroon-800 bg-maroon-50"
                    : "text-gray-600 hover:text-maroon-800 hover:bg-gray-50"
                }`}
              >
                Change Password
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="min-h-11 px-2.5 inline-flex items-center rounded-lg text-sm font-medium text-gray-600 hover:text-red-700 hover:bg-red-50 transition-[color,background-color,transform] duration-150 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
              >
                Sign Out
              </button>
            </nav>

            {/* Mobile menu button */}
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              aria-label={
                isMenuOpen ? "Close navigation menu" : "Open navigation menu"
              }
              aria-expanded={isMenuOpen}
              aria-controls="college-mobile-nav"
              className="md:hidden w-11 h-11 inline-flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 active:scale-[0.97] transition-[background-color,color,transform] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-800 shrink-0"
            >
              {isMenuOpen ? (
                <CloseIcon className="w-6 h-6" />
              ) : (
                <MenuIcon className="w-6 h-6" />
              )}
            </button>
          </div>

          {/* Mobile Navigation */}
          {isMenuOpen && (
            <nav
              id="college-mobile-nav"
              aria-label="College mobile navigation"
              className="md:hidden border-t border-gray-200 py-3 space-y-1"
            >
              <Link
                to="/college"
                onClick={() => setIsMenuOpen(false)}
                className={`min-h-11 flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-150 ${
                  location.pathname === "/college"
                    ? "bg-maroon-50 text-maroon-800"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                Dashboard
              </Link>
              <Link
                to="/college/compare"
                onClick={() => setIsMenuOpen(false)}
                className={`min-h-11 flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-150 ${
                  location.pathname === "/college/compare"
                    ? "bg-maroon-50 text-maroon-800"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                Compare
              </Link>
              <Link
                to="/college/change-password"
                onClick={() => setIsMenuOpen(false)}
                className={`min-h-11 flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-150 ${
                  location.pathname === "/college/change-password"
                    ? "bg-maroon-50 text-maroon-800"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                Change Password
              </Link>
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  void handleSignOut();
                }}
                className="w-full min-h-11 flex items-center text-left px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 rounded-lg transition-colors duration-150"
              >
                Sign Out
              </button>
            </nav>
          )}
        </div>
      </header>

      {/* Non-destructive offline notice */}
      {!isOnline && (
        <div
          role="status"
          className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 lg:px-8 py-2.5"
        >
          <div className="max-w-7xl mx-auto flex items-center gap-2.5 text-sm text-amber-900">
            <WifiOffIcon className="w-4 h-4 shrink-0 text-amber-700" />
            <span>
              You are currently offline. Your unsaved responses remain intact on
              this screen — reconnect before submitting.
            </span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main
        id="main-content"
        tabIndex={-1}
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1 focus:outline-none"
      >
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-600 tabular-nums">
          SPC Academic Affairs Evaluation System © {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  );
}

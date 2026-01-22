import { useState, useEffect, useRef } from "react";
import {
  Outlet,
  Navigate,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Loading } from "../ui";

export default function CollegeLayout() {
  const { user, userRole, college, isLoading, isOnline, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const wasAuthenticatedRef = useRef(false);

  // Track if user was authenticated before going offline
  useEffect(() => {
    if (user && userRole === "college") {
      wasAuthenticatedRef.current = true;
    }
  }, [user, userRole]);

  // Handle offline/online transitions
  useEffect(() => {
    if (!isOnline && user && userRole === "college") {
      // Going offline - redirect to public view
      navigate("/public", { replace: true });
    } else if (
      isOnline &&
      wasAuthenticatedRef.current &&
      user &&
      userRole === "college"
    ) {
      // Coming back online with valid authentication - return to college
      if (location.pathname.startsWith("/public")) {
        navigate("/college", { replace: true });
      }
    }
  }, [isOnline, user, userRole, navigate, location.pathname]);

  // If currently offline, redirect to public
  if (!isOnline) {
    return <Navigate to="/public" replace />;
  }

  if (isLoading) {
    return <Loading fullScreen text="Loading..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (userRole !== "college") {
    return <Navigate to="/admin/dashboard" replace />;
  }

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo / College Name */}
            <div className="flex items-center gap-3">
              {college?.avatar_url ? (
                <img
                  src={college.avatar_url}
                  alt={college.name}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 bg-maroon-100 text-maroon-800 rounded-full flex items-center justify-center font-bold">
                  {college?.code?.[0] || "C"}
                </div>
              )}
              <div>
                <h1 className="font-semibold text-gray-900">
                  {college?.name || "College Portal"}
                </h1>
                {college?.code && (
                  <p className="text-xs text-gray-500">{college.code}</p>
                )}
              </div>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-6">
              <Link
                to="/college"
                className={`text-sm font-medium transition-colors ${
                  location.pathname === "/college"
                    ? "text-maroon-800"
                    : "text-gray-600 hover:text-maroon-800"
                }`}
              >
                Dashboard
              </Link>
              <Link
                to="/college/compare"
                className={`text-sm font-medium transition-colors ${
                  location.pathname === "/college/compare"
                    ? "text-maroon-800"
                    : "text-gray-600 hover:text-maroon-800"
                }`}
              >
                Compare
              </Link>
              <Link
                to="/college/change-password"
                className={`text-sm font-medium transition-colors ${
                  location.pathname === "/college/change-password"
                    ? "text-maroon-800"
                    : "text-gray-600 hover:text-maroon-800"
                }`}
              >
                Change Password
              </Link>
              <button
                onClick={handleSignOut}
                className="text-sm font-medium text-gray-600 hover:text-red-600 transition-colors"
              >
                Sign Out
              </button>
            </nav>

            {/* Mobile menu button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {isMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>

          {/* Mobile Navigation */}
          {isMenuOpen && (
            <div className="md:hidden border-t border-gray-200 py-4 space-y-2">
              <Link
                to="/college"
                onClick={() => setIsMenuOpen(false)}
                className={`block px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  location.pathname === "/college"
                    ? "bg-maroon-50 text-maroon-800"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                Dashboard
              </Link>
              <Link
                to="/college/compare"
                onClick={() => setIsMenuOpen(false)}
                className={`block px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  location.pathname === "/college/compare"
                    ? "bg-maroon-50 text-maroon-800"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                Compare
              </Link>
              <Link
                to="/college/change-password"
                onClick={() => setIsMenuOpen(false)}
                className={`block px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  location.pathname === "/college/change-password"
                    ? "bg-maroon-50 text-maroon-800"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                Change Password
              </Link>
              <button
                onClick={handleSignOut}
                className="w-full text-left px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500">
          PACUCOA Evaluation System © {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  );
}

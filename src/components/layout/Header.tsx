import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { checkHasAdmin } from "../../lib/adminSetup";

export default function Header() {
  const location = useLocation();
  const { user, userRole } = useAuth();
  const isAdminRoute = location.pathname.startsWith("/admin");
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!isOnline || user) return;

    let cancelled = false;
    checkHasAdmin()
      .then((exists) => {
        if (!cancelled) setHasAdmin(exists);
      })
      .catch(() => {
        // Fail closed: default to Login if admin status cannot be verified
        if (!cancelled) setHasAdmin(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isOnline, user]);

  const getAuthAction = () => {
    if (user && userRole === "college") {
      return { to: "/college", text: "Dashboard" };
    }
    if (user && userRole === "admin") {
      return { to: "/admin/dashboard", text: "Dashboard" };
    }
    if (hasAdmin === false) {
      return { to: "/admin/register", text: "Setup Admin" };
    }
    return { to: "/login", text: "Login" };
  };

  const authAction = getAuthAction();

  return (
    <header className="bg-maroon-800 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          <Link
            to="/"
            aria-label="SPC Academic Affairs Evaluation Portal — Home"
            className="flex items-center gap-3 min-w-0 hover:opacity-90 transition-opacity duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-lg py-1"
          >
            <img
              src="/spc-logo.png"
              alt="SPC Logo"
              className="w-10 h-10 object-contain bg-white/10 rounded-lg p-0.5 shrink-0"
            />
            <div className="hidden sm:block min-w-0">
              <span className="text-lg font-semibold leading-tight block truncate">
                Office of the Vice President for Academic Affairs
              </span>
              <p className="text-xs text-maroon-100 truncate">
                Unit: Accreditation and Quality Assurance Department
              </p>
            </div>
          </Link>

          <nav aria-label="Header navigation" className="flex items-center gap-2 shrink-0">
            {!isAdminRoute && isOnline ? (
              <Link
                to={authAction.to}
                className="min-h-11 px-4 py-2 inline-flex items-center text-sm font-medium rounded-lg bg-white/10 hover:bg-white/20 active:scale-[0.97] transition-[background-color,transform] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {authAction.text}
              </Link>
            ) : isAdminRoute ? (
              <Link
                to="/"
                className="min-h-11 px-4 py-2 inline-flex items-center text-sm font-medium rounded-lg bg-white/10 hover:bg-white/20 active:scale-[0.97] transition-[background-color,transform] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Back to Home
              </Link>
            ) : null}
          </nav>
        </div>
      </div>
    </header>
  );
}

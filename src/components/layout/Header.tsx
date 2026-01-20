import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";

export default function Header() {
  const location = useLocation();
  const { user } = useAuth();
  const isAdmin = location.pathname.startsWith("/admin");
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Monitor online status
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
    if (isOnline) {
      checkAdminExists();
    }
  }, [isOnline]);

  const checkAdminExists = async () => {
    try {
      const { data, error } = await supabase.rpc("get_user_count");

      if (error) throw error;
      setHasAdmin((data || 0) > 0);
    } catch (err) {
      console.error("Error checking admin:", err);
      // If function doesn't exist, assume no admin
      setHasAdmin(false);
    }
  };

  const getAdminButtonProps = () => {
    // If user is authenticated, show dashboard link
    if (user) {
      return { to: "/admin/dashboard", text: "Dashboard" };
    }
    // Loading state
    if (hasAdmin === null) {
      return { to: "/login", text: "Login" };
    }
    // Show login or register based on admin existence
    if (hasAdmin) {
      return { to: "/login", text: "Login" };
    }
    return { to: "/admin/register", text: "Setup Admin" };
  };

  const adminButton = getAdminButtonProps();

  return (
    <header className="bg-maroon-800 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            to="/"
            className="flex items-center gap-3 hover:opacity-90 transition-opacity"
          >
            <img
              src="/spc-logo.png"
              alt="SPC Logo"
              className="w-10 h-10 object-contain bg-white/10 rounded-lg p-0.5"
            />
            <div className="hidden sm:block">
              <h1 className="text-lg font-semibold leading-tight">
                Office of the Vice President for Academic Affairs
              </h1>
              <p className="text-xs text-maroon-200">
                Unit: Accreditation and Quality Assurance Department
              </p>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-2">
            {!isAdmin && isOnline ? (
              <Link
                to={adminButton.to}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              >
                {adminButton.text}
              </Link>
            ) : isAdmin ? (
              <Link
                to="/"
                className="px-4 py-2 text-sm font-medium rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
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

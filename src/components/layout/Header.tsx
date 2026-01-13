import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";

export default function Header() {
  const location = useLocation();
  const { user } = useAuth();
  const isAdmin = location.pathname.startsWith("/admin");
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    checkAdminExists();
  }, []);

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
      return { to: "/admin/login", text: "Admin" };
    }
    // Show login or register based on admin existence
    if (hasAdmin) {
      return { to: "/admin/login", text: "Admin Login" };
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
            <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
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
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-semibold leading-tight">
                Academic Affairs
              </h1>
              <p className="text-xs text-maroon-200">
                Evaluation Tasking System
              </p>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-2">
            {!isAdmin ? (
              <Link
                to={adminButton.to}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              >
                {adminButton.text}
              </Link>
            ) : (
              <Link
                to="/"
                className="px-4 py-2 text-sm font-medium rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              >
                Back to Home
              </Link>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}

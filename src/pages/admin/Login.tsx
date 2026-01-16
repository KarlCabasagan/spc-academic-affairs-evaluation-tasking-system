import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { useNavigate, Navigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import { Button, Input, Card, Loading } from "../../components/ui";

export default function Login() {
  const navigate = useNavigate();
  const { user, userRole, isLoading, signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
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
      setHasAdmin(false);
    }
  };

  // Redirect based on role if already logged in
  if (!isLoading && user && userRole) {
    if (userRole === "college") {
      return <Navigate to="/college" replace />;
    }
    return <Navigate to="/admin/dashboard" replace />;
  }

  // Redirect to register if no admin exists
  if (hasAdmin === false) {
    return <Navigate to="/admin/register" replace />;
  }

  // Loading state while checking
  if (hasAdmin === null || isLoading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-maroon-800 via-maroon-900 to-maroon-950 flex items-center justify-center">
        <Loading size="lg" text="Loading..." />
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please enter both email and password");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await signIn(email, password);
      if (error) {
        if (error.message.includes("Email not confirmed")) {
          setError(
            "Please verify your email address. Check your inbox for the confirmation link."
          );
        } else {
          setError(error.message || "Invalid email or password");
        }
      }
      // Navigation is handled by AuthContext role detection
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-maroon-800 via-maroon-900 to-maroon-950 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Sign In</h1>
          <p className="text-maroon-200 mt-2">
            Academic Affairs Evaluation System
          </p>
        </div>

        {/* Login Form */}
        <Card padding="lg">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-red-500 shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <Input
              label="Email Address"
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />

            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />

            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-sm text-maroon-600 hover:text-maroon-800 transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              isLoading={isSubmitting}
            >
              Sign In
            </Button>
          </form>
        </Card>

        {/* Info text */}
        <div className="text-center mt-6">
          <p className="text-sm text-maroon-200">
            Admin and College accounts can sign in here
          </p>
        </div>
      </div>
    </div>
  );
}

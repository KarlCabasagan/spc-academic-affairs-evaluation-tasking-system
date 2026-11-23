import { useState, useEffect, useId } from "react";
import type { FormEvent } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { checkHasAdmin } from "../../lib/adminSetup";
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  EyeIcon,
  EyeOffIcon,
  Loading,
  SpinnerIcon,
} from "../../components/ui";

export default function Login() {
  const { user, userRole, isLoading, signIn } = useAuth();
  const emailId = useId();
  const passwordId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [adminCheckError, setAdminCheckError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);

  const loadAdminStatus = async () => {
    setAdminCheckError(false);
    try {
      const exists = await checkHasAdmin();
      setHasAdmin(exists);
    } catch (err) {
      console.error("Error checking admin:", err);
      // Fail closed: never redirect to admin registration on error
      setAdminCheckError(true);
      setHasAdmin(true);
    }
  };

  useEffect(() => {
    void loadAdminStatus();
  }, []);

  if (!isLoading && user && userRole) {
    if (userRole === "college") {
      return <Navigate to="/college" replace />;
    }
    return <Navigate to="/admin/dashboard" replace />;
  }

  if (hasAdmin === false) {
    return <Navigate to="/admin/register" replace />;
  }

  if (hasAdmin === null || isLoading) {
    return (
      <main className="min-h-screen bg-linear-to-br from-maroon-800 via-maroon-900 to-maroon-950 flex items-center justify-center">
        <Loading size="lg" variant="light" text="Loading…" />
      </main>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: signInError } = await signIn(email.trim(), password);
      if (signInError) {
        setError("Invalid email or password.");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-linear-to-br from-maroon-800 via-maroon-900 to-maroon-950 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white/10 backdrop-blur-sm rounded-2xl mb-4 border border-white/20 shadow-xl">
            <img
              src="/spc-logo.png"
              alt="SPC Logo"
              className="w-14 h-14 object-contain"
            />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome Back</h1>
          <p className="text-maroon-100">
            Sign in to the Academic Affairs Evaluation System
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl p-8">
          {adminCheckError && (
            <div
              role="alert"
              className="bg-amber-500/20 border border-amber-300/40 rounded-lg p-3 mb-5 text-sm text-amber-100 flex items-center justify-between gap-2"
            >
              <span>Could not verify server status. Check connection.</span>
              <button
                type="button"
                onClick={() => void loadAdminStatus()}
                className="underline font-medium shrink-0 text-white hover:text-maroon-100"
              >
                Retry
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div
                role="alert"
                className="bg-red-500/20 backdrop-blur-sm border border-red-300/40 rounded-lg p-4 flex items-start gap-3"
              >
                <AlertCircleIcon className="w-5 h-5 text-red-200 shrink-0 mt-0.5" />
                <p className="text-sm text-red-100">{error}</p>
              </div>
            )}

            <div>
              <label
                htmlFor={emailId}
                className="block text-sm font-medium text-white/95 mb-1.5"
              >
                Email Address
              </label>
              <input
                id={emailId}
                type="email"
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="w-full px-4 py-3 bg-white/10 border border-white/25 rounded-lg text-white placeholder-white/65 focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-transparent transition-colors duration-150"
              />
            </div>

            <div>
              <label
                htmlFor={passwordId}
                className="block text-sm font-medium text-white/95 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id={passwordId}
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full px-4 py-3 pr-12 bg-white/10 border border-white/25 rounded-lg text-white placeholder-white/65 focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-transparent transition-colors duration-150"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-md text-white/80 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="min-h-11 inline-flex items-center text-sm text-maroon-100 hover:text-white hover:underline px-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting || undefined}
              className="w-full min-h-11 py-3 px-4 bg-white text-maroon-900 font-semibold rounded-lg hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-maroon-900 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <SpinnerIcon className="h-5 w-5" />
                  Signing in…
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-white/80 mt-6">
          Admin and College accounts can sign in here
        </p>

        <div className="text-center mt-2">
          <Link
            to="/public"
            className="text-sm text-white/85 hover:text-white hover:underline py-2.5 px-3 transition-colors inline-flex items-center gap-2"
          >
            <ArrowLeftIcon />
            Back to Evaluation Portal
          </Link>
        </div>
      </div>
    </main>
  );
}

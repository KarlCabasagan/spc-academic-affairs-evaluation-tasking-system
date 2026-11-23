import { useState, useEffect, useId } from "react";
import type { FormEvent } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { supabase } from "../../lib/supabase";
import { checkHasAdmin } from "../../lib/adminSetup";
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  Loading,
  SpinnerIcon,
} from "../../components/ui";

export default function Register() {
  const { user, userRole, isLoading } = useAuth();
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [adminCheckFailed, setAdminCheckFailed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);

  const loadAdminStatus = async () => {
    setAdminCheckFailed(false);
    try {
      const exists = await checkHasAdmin();
      setHasAdmin(exists);
    } catch (err) {
      console.error("Error checking admin:", err);
      // Fail closed on network/RPC error
      setAdminCheckFailed(true);
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

  if (hasAdmin === true && !adminCheckFailed) {
    return <Navigate to="/login" replace />;
  }

  if (hasAdmin === null || isLoading) {
    return (
      <main className="min-h-screen bg-linear-to-br from-maroon-800 via-maroon-900 to-maroon-950 flex items-center justify-center">
        <Loading size="lg" variant="light" text="Loading…" />
      </main>
    );
  }

  if (adminCheckFailed) {
    return (
      <main className="min-h-screen bg-linear-to-br from-maroon-800 via-maroon-900 to-maroon-950 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl p-8 text-center">
          <h1 className="text-xl font-bold text-white mb-2">
            Unable to Verify Setup Status
          </h1>
          <p className="text-white/80 text-sm mb-6">
            Registration cannot proceed while the server status cannot be
            verified.
          </p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => void loadAdminStatus()}
              className="w-full min-h-11 py-3 px-4 bg-white text-maroon-900 font-semibold rounded-lg hover:bg-white/90 transition-colors active:scale-[0.97]"
            >
              Try Again
            </button>
            <Link
              to="/login"
              className="w-full min-h-11 py-3 px-4 bg-white/15 text-white font-semibold rounded-lg hover:bg-white/25 border border-white/25 flex items-center justify-center transition-colors"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Please fill in all fields.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/admin/dashboard`,
        },
      });

      if (signUpError) throw signUpError;

      setIsSuccess(true);
    } catch (err) {
      console.error("Registration error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Registration failed. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <main className="min-h-screen bg-linear-to-br from-maroon-800 via-maroon-900 to-maroon-950 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md animate-fade-in">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl p-8 text-center">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-300/30">
              <CheckIcon className="w-8 h-8 text-emerald-200" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">
              Verify Your Email
            </h1>
            <p className="text-white/85 text-sm mb-6">
              We&apos;ve sent a verification link to{" "}
              <span className="font-semibold text-white">{email}</span>. Check
              your inbox to activate your administrator account.
            </p>
            <div className="bg-amber-500/20 border border-amber-300/30 rounded-lg p-4 text-sm text-amber-100 mb-6 text-left">
              <strong>Note:</strong> Check your spam folder if the message does
              not arrive within a few minutes.
            </div>
            <Link
              to="/login"
              className="w-full min-h-11 py-3 px-4 bg-white text-maroon-900 font-semibold rounded-lg hover:bg-white/90 transition-[background-color,transform] duration-150 active:scale-[0.97] inline-flex items-center justify-center"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </main>
    );
  }

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
          <h1 className="text-3xl font-bold text-white mb-2">
            Create Admin Account
          </h1>
          <p className="text-maroon-100">
            Set up the first administrator for this system
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl p-8">
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
                placeholder="admin@example.com"
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
                  autoComplete="new-password"
                  minLength={8}
                  required
                  className="w-full px-4 py-3 pr-12 bg-white/10 border border-white/25 rounded-lg text-white placeholder-white/65 focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-transparent transition-colors duration-150"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-md text-white/80 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-white/80">
                At least 8 characters
              </p>
            </div>

            <div>
              <label
                htmlFor={confirmId}
                className="block text-sm font-medium text-white/95 mb-1.5"
              >
                Confirm Password
              </label>
              <input
                id={confirmId}
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                className="w-full px-4 py-3 bg-white/10 border border-white/25 rounded-lg text-white placeholder-white/65 focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-transparent transition-colors duration-150"
              />
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
                  Creating Account…
                </>
              ) : (
                "Create Admin Account"
              )}
            </button>
          </form>
        </div>

        <div className="text-center mt-6">
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

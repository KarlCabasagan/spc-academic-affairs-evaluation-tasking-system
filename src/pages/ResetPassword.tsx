import { useState, useEffect, useId, useRef } from "react";
import type { FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { updatePassword } from "../lib/auth";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  Loading,
  LockIcon,
  SpinnerIcon,
} from "../components/ui";

export default function ResetPassword() {
  const navigate = useNavigate();
  const passwordId = useId();
  const confirmId = useId();
  const redirectTimerRef = useRef<number | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null);

  useEffect(() => {
    let settled = false;
    const hasRecoveryParams =
      window.location.hash.includes("type=recovery") ||
      window.location.hash.includes("access_token") ||
      window.location.search.includes("code=");

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        settled = true;
        setIsValidSession(true);
      }
    });

    // Allow time for Supabase asynchronous PKCE/hash exchange; reject non-recovery links
    const fallbackTimer = window.setTimeout(
      () => {
        if (!settled) {
          setIsValidSession(false);
        }
      },
      hasRecoveryParams ? 2500 : 300,
    );

    return () => {
      window.clearTimeout(fallbackTimer);
      if (redirectTimerRef.current !== null) {
        window.clearTimeout(redirectTimerRef.current);
      }
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!password || !confirmPassword) {
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
      const success = await updatePassword(password);
      if (success) {
        try {
          await supabase.auth.signOut();
        } catch {
          // Ignore signOut failure; still prompt login
        }
        setIsSuccess(true);
        redirectTimerRef.current = window.setTimeout(() => {
          navigate("/login", { replace: true });
        }, 3000);
      } else {
        setError("Failed to update password. Please try again.");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isValidSession === null) {
    return (
      <main className="min-h-screen bg-linear-to-br from-maroon-800 via-maroon-900 to-maroon-950 flex items-center justify-center">
        <Loading size="lg" variant="light" text="Verifying recovery link…" />
      </main>
    );
  }

  if (isValidSession === false) {
    return (
      <main className="min-h-screen bg-linear-to-br from-maroon-800 via-maroon-900 to-maroon-950 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md animate-fade-in">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl p-8 text-center">
            <div className="w-16 h-16 bg-red-500/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-4 border border-red-300/40">
              <AlertTriangleIcon className="w-8 h-8 text-red-200" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">
              Invalid or Expired Link
            </h1>
            <p className="text-white/85 text-sm mb-6">
              This password reset link is invalid or has expired. Please request
              a new one.
            </p>
            <Link
              to="/forgot-password"
              className="w-full min-h-11 py-3 px-4 bg-white text-maroon-900 font-semibold rounded-lg hover:bg-white/90 transition-[background-color,transform] duration-150 active:scale-[0.97] inline-flex items-center justify-center"
            >
              Request New Link
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (isSuccess) {
    return (
      <main className="min-h-screen bg-linear-to-br from-maroon-800 via-maroon-900 to-maroon-950 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md animate-fade-in">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl p-8 text-center">
            <div className="w-16 h-16 bg-emerald-500/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-300/40">
              <CheckIcon className="w-8 h-8 text-emerald-200" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">
              Password Updated!
            </h1>
            <p className="text-white/85 text-sm mb-6">
              Your password has been updated. Redirecting to login…
            </p>
            <Link
              to="/login"
              className="w-full min-h-11 py-3 px-4 bg-white/20 text-white font-semibold rounded-lg hover:bg-white/30 border border-white/25 transition-[background-color,transform] duration-150 active:scale-[0.97] inline-flex items-center justify-center"
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
            <LockIcon className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">New Password</h1>
          <p className="text-maroon-100">Enter your new password below</p>
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
                htmlFor={passwordId}
                className="block text-sm font-medium text-white/95 mb-1.5"
              >
                New Password
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
                  Updating…
                </>
              ) : (
                "Update Password"
              )}
            </button>
          </form>
        </div>

        <div className="text-center mt-6">
          <Link
            to="/login"
            className="text-sm text-white/85 hover:text-white hover:underline py-2.5 px-3 transition-colors inline-flex items-center gap-2"
          >
            <ArrowLeftIcon />
            Back to Login
          </Link>
        </div>
      </div>
    </main>
  );
}

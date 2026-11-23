import { useState, useId } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { sendPasswordReset } from "../lib/auth";
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  CheckIcon,
  KeyIcon,
  SpinnerIcon,
} from "../components/ui";

export default function ForgotPassword() {
  const emailId = useId();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      await sendPasswordReset(email.trim());
      // Always present uniform message regardless of account existence
      setIsSuccess(true);
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <main className="min-h-screen bg-linear-to-br from-maroon-800 via-maroon-900 to-maroon-950 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md animate-fade-in">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl p-8 text-center">
            <div className="w-16 h-16 bg-emerald-500/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-300/40">
              <CheckIcon className="w-8 h-8 text-emerald-200" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">
              Check your email
            </h1>
            <p className="text-white/85 text-sm mb-6">
              If an account exists for{" "}
              <span className="font-medium text-white">{email}</span>, a
              password reset link has been sent.
            </p>
            <Link
              to="/login"
              className="w-full min-h-11 py-3 px-4 bg-white text-maroon-900 font-semibold rounded-lg hover:bg-white/90 transition-[background-color,transform] duration-150 active:scale-[0.97] inline-flex items-center justify-center"
            >
              Back to Login
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
            <KeyIcon className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Reset Password</h1>
          <p className="text-maroon-100">
            Enter your email to receive a reset link
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
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
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
                  Sending…
                </>
              ) : (
                "Send Reset Link"
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

import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { supabase, supabaseNoPersist } from "../../lib/supabase";
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  Button,
  buttonVariants,
  Card,
  CheckCircleIcon,
  Input,
  KeyIcon,
  LockIcon,
  showToast,
} from "../../components/ui";

export function ChangePassword() {
  const { user, college } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword) {
      setError("Please enter your current password.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Your new password must be at least 8 characters long.");
      return;
    }

    if (newPassword === currentPassword) {
      setError("Your new password must be different from your current password.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    if (!user?.email) {
      setError("Unable to verify your account email. Please sign in again.");
      return;
    }

    setIsLoading(true);
    try {
      const { error: verifyError } = await supabaseNoPersist.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (verifyError) {
        setError("Current password is incorrect.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setError(updateError.message || "Failed to update password. Please try again.");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setIsSuccess(true);
      showToast("Password updated successfully!", "success");
    } catch {
      setError("An unexpected error occurred while updating your password.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="max-w-lg mx-auto py-4 sm:py-8">
        <Card className="p-6 sm:p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto mb-4">
            <CheckCircleIcon className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Password Updated</h1>
          <p className="text-sm text-gray-600 max-w-prose mx-auto mt-2">
            Your account password has been changed cleanly. Use your new password the next time
            you sign in.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Link
              to="/college"
              className={buttonVariants({ variant: "primary", size: "md", className: "w-full" })}
            >
              Back to Dashboard
            </Link>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsSuccess(false)}
              className="w-full"
            >
              Change Password Again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto py-2 sm:py-6">
      <div className="mb-4">
        <Link
          to="/college"
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "gap-2 -ml-2",
          })}
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Dashboard
        </Link>
      </div>

      <Card className="p-6 sm:p-8">
        <div className="flex items-start gap-3.5 mb-6">
          <div className="w-11 h-11 rounded-lg bg-maroon-50 text-maroon-800 flex items-center justify-center shrink-0">
            <KeyIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900">Change Password</h1>
            <p className="text-sm text-gray-600 max-w-prose mt-1">
              {college?.name
                ? `Update the login password for ${college.name}.`
                : "Update your college account password."}
            </p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-2.5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm"
          >
            <AlertCircleIcon className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Current Password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter your current password"
            autoComplete="current-password"
            showPasswordToggle
            required
            disabled={isLoading}
          />

          <Input
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter a strong new password"
            autoComplete="new-password"
            showPasswordToggle
            minLength={8}
            helperText="Your new password must be at least 8 characters long and different from your current password."
            required
            disabled={isLoading}
          />

          <Input
            label="Confirm New Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your new password"
            autoComplete="new-password"
            showPasswordToggle
            minLength={8}
            required
            disabled={isLoading}
          />

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isLoading}
              className="w-full"
            >
              <LockIcon className="w-4 h-4" />
              {isLoading ? "Updating Password…" : "Update Password"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default ChangePassword;

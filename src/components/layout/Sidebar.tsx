import { useEffect, useRef, useState, type FormEvent } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { supabase, supabaseNoPersist } from "../../lib/supabase";
import {
  AlertCircleIcon,
  Button,
  ClockIcon,
  CloseIcon,
  EyeIcon,
  Input,
  KeyIcon,
  LogoutIcon,
  Modal,
  showToast,
} from "../ui";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const asideRef = useRef<HTMLElement>(null);

  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(min-width: 1024px)").matches
      : true,
  );

  // Change password modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handleChange = () => setIsDesktop(mq.matches);
    handleChange();
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (asideRef.current) {
      asideRef.current.inert = !isDesktop && !isOpen;
    }
  }, [isDesktop, isOpen]);

  useEffect(() => {
    if (!isOpen || isDesktop) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isDesktop, onClose]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/admin/login");
  };

  const resetPasswordForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setPasswordError("");
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError("");

    if (!currentPassword.trim()) {
      setPasswordError("Please enter your current password.");
      return;
    }

    if (!newPassword.trim()) {
      setPasswordError("Please enter a new password.");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordError(
        "New password must be different from your current password.",
      );
      return;
    }

    if (!user?.email) {
      setPasswordError("Unable to verify account email. Please sign in again.");
      return;
    }

    setIsChangingPassword(true);

    try {
      const { error: authError } =
        await supabaseNoPersist.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        });

      if (authError) {
        setPasswordError("Current password is incorrect.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setPasswordError(updateError.message || "Failed to update password.");
        return;
      }

      showToast("Password changed successfully.", "success");
      setShowPasswordModal(false);
      resetPasswordForm();
    } catch {
      setPasswordError("An unexpected error occurred. Please try again.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const navItems = [
    {
      label: "Dashboard",
      path: "/admin/dashboard",
      icon: (
        <svg
          className="w-5 h-5 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
          />
        </svg>
      ),
    },
    {
      label: "Areas",
      path: "/admin/areas",
      icon: (
        <svg
          className="w-5 h-5 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
      ),
    },
    {
      label: "Colleges",
      path: "/admin/colleges",
      icon: (
        <svg
          className="w-5 h-5 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          />
        </svg>
      ),
    },
    {
      label: "Responses",
      path: "/admin/responses",
      icon: (
        <svg
          className="w-5 h-5 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      ),
    },
    {
      label: "Reports",
      path: "/admin/reports",
      icon: (
        <svg
          className="w-5 h-5 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      ),
    },
    {
      label: "History",
      path: "/admin/history",
      icon: <ClockIcon className="w-5 h-5 shrink-0" />,
    },
    {
      label: "Preview as College",
      path: "/admin/preview-college",
      icon: <EyeIcon className="w-5 h-5 shrink-0" />,
    },
  ];

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        id="admin-sidebar"
        ref={asideRef}
        aria-label="Admin sidebar"
        className={`fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-200 z-50 transform transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] lg:translate-x-0 lg:static lg:z-auto ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="px-5 py-5 border-b border-gray-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src="/spc-logo.png"
                alt="SPC Logo"
                className="w-10 h-10 object-contain shrink-0"
              />
              <div className="min-w-0">
                <span className="font-semibold text-gray-900 block truncate">
                  Admin Panel
                </span>
                <p className="text-xs text-gray-500 truncate">
                  PACUCOA Evaluation
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation menu"
              className="lg:hidden w-11 h-11 inline-flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 active:scale-[0.97] transition-[background-color,color,transform] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-800 shrink-0"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav
            aria-label="Admin navigation"
            className="flex-1 px-4 py-6 space-y-1 overflow-y-auto"
          >
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 min-h-11 rounded-lg font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-800 ${
                    isActive
                      ? "bg-maroon-50 text-maroon-800"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* User section */}
          <div className="px-4 py-4 border-t border-gray-100">
            <div className="flex items-center gap-3 px-4 py-2 mb-3">
              <div className="w-8 h-8 bg-maroon-100 text-maroon-800 rounded-full flex items-center justify-center text-sm font-medium shrink-0">
                {user?.email?.[0]?.toUpperCase() || "A"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user?.email || "Admin"}
                </p>
                <p className="text-xs text-gray-500">Administrator</p>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start mb-1"
              onClick={() => setShowPasswordModal(true)}
            >
              <KeyIcon className="w-5 h-5" />
              Change Password
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start"
              onClick={handleSignOut}
            >
              <LogoutIcon className="w-5 h-5" />
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Change Password Modal */}
      <Modal
        isOpen={showPasswordModal}
        preventClose={isChangingPassword}
        onClose={() => {
          setShowPasswordModal(false);
          resetPasswordForm();
        }}
        title="Change Password"
        size="md"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={isChangingPassword}
              onClick={() => {
                setShowPasswordModal(false);
                resetPasswordForm();
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="admin-change-password-form"
              isLoading={isChangingPassword}
              disabled={!currentPassword || !newPassword || !confirmNewPassword}
            >
              {isChangingPassword ? "Updating…" : "Change Password"}
            </Button>
          </>
        }
      >
        <form
          id="admin-change-password-form"
          onSubmit={handleChangePassword}
          className="space-y-4"
        >
          {passwordError && (
            <div
              role="alert"
              className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2"
            >
              <AlertCircleIcon className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{passwordError}</p>
            </div>
          )}

          <Input
            label="Current Password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter current password"
            autoComplete="current-password"
            showPasswordToggle
            required
            disabled={isChangingPassword}
          />

          <Input
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter new password"
            autoComplete="new-password"
            showPasswordToggle
            minLength={8}
            helperText="At least 8 characters and different from your current password."
            required
            disabled={isChangingPassword}
          />

          <Input
            label="Confirm New Password"
            type="password"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            placeholder="Confirm new password"
            autoComplete="new-password"
            showPasswordToggle
            minLength={8}
            required
            disabled={isChangingPassword}
          />
        </form>
      </Modal>
    </>
  );
}

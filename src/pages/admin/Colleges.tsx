import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase, supabaseNoPersist } from "../../lib/supabase";
import type { College } from "../../lib/types";
import {
  Button,
  Card,
  Input,
  Modal,
  ConfirmDialog,
  Loading,
  showToast,
} from "../../components/ui";

interface CollegeFormData {
  name: string;
  code: string;
  email: string;
  password: string;
  avatar_url: string;
}

interface CollegeWithEmail extends College {
  email?: string;
}

export default function Colleges() {
  const [colleges, setColleges] = useState<CollegeWithEmail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedCollege, setSelectedCollege] =
    useState<CollegeWithEmail | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState<CollegeFormData>({
    name: "",
    code: "",
    email: "",
    password: "",
    avatar_url: "",
  });

  useEffect(() => {
    fetchColleges();
  }, []);

  const fetchColleges = async () => {
    try {
      const { data, error } = await supabase
        .from("colleges")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      setColleges(data || []);
    } catch (error) {
      console.error("Error fetching colleges:", error);
      showToast("Failed to load colleges", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateModal = () => {
    setSelectedCollege(null);
    setFormData({
      name: "",
      code: "",
      email: "",
      password: "",
      avatar_url: "",
    });
    setIsModalOpen(true);
  };

  const openEditModal = (college: CollegeWithEmail) => {
    setSelectedCollege(college);
    setFormData({
      name: college.name,
      code: college.code || "",
      email: "", // Can't display existing email
      password: "", // Never show password
      avatar_url: college.avatar_url || "",
    });
    setIsModalOpen(true);
  };

  const openDeleteDialog = (college: CollegeWithEmail) => {
    setSelectedCollege(college);
    setIsDeleteOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      showToast("Please enter a college name", "error");
      return;
    }

    if (!formData.code.trim()) {
      showToast("Please enter a department code", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      if (selectedCollege) {
        // Update existing college (name, code, avatar only)
        const { error } = await supabase
          .from("colleges")
          .update({
            name: formData.name.trim(),
            code: formData.code.trim().toUpperCase(),
            avatar_url: formData.avatar_url.trim() || null,
          })
          .eq("id", selectedCollege.id);

        if (error) throw error;
        showToast("College updated successfully", "success");
      } else {
        // Creating new college with account
        if (!formData.email.trim()) {
          showToast("Please enter an email for the college account", "error");
          setIsSubmitting(false);
          return;
        }

        if (!formData.password || formData.password.length < 6) {
          showToast("Password must be at least 6 characters", "error");
          setIsSubmitting(false);
          return;
        }

        // Sign up the new user using the non-persistent client to avoid affecting admin session
        const { data: authData, error: authError } =
          await supabaseNoPersist.auth.signUp({
            email: formData.email.trim(),
            password: formData.password,
          });

        if (authError) {
          console.error("Auth Error:", authError);
          if (authError.message?.includes("already registered")) {
            showToast("This email is already registered", "error");
          } else {
            showToast(authError.message || "Failed to create account", "error");
          }
          setIsSubmitting(false);
          return;
        }

        if (!authData.user) {
          showToast("Failed to create user account", "error");
          setIsSubmitting(false);
          return;
        }

        // Assign the college role via RPC (sets app_metadata.role = 'college')
        const { error: roleError } = await supabase.rpc("assign_college_role", {
          user_uuid: authData.user.id,
        });

        if (roleError) {
          console.error("Role Assignment Error:", roleError);
          // Continue anyway - the user was created, role can be fixed later
        }

        // Insert into public.colleges using the main client (as admin)
        const { error: dbError } = await supabase.from("colleges").insert({
          user_id: authData.user.id,
          name: formData.name.trim(),
          code: formData.code.trim().toUpperCase(),
          avatar_url: formData.avatar_url.trim() || null,
        });

        if (dbError) {
          console.error("Database Error:", dbError);
          // Try to clean up the auth user if database insert fails
          // Note: This might fail if we don't have service role, but worth a try or just log it
          showToast(
            "Account created but failed to link college profile",
            "error"
          );
          setIsSubmitting(false);
          return;
        }

        showToast("College account created successfully", "success");
      }

      setIsModalOpen(false);
      fetchColleges();
    } catch (error) {
      console.error("Error saving college:", error);
      showToast("Failed to save college", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCollege) return;

    setIsSubmitting(true);
    try {
      // Delete college record (user account remains but unlinked)
      const { error } = await supabase
        .from("colleges")
        .delete()
        .eq("id", selectedCollege.id);

      if (error) throw error;
      showToast("College deleted successfully", "success");
      setIsDeleteOpen(false);
      fetchColleges();
    } catch (error) {
      console.error("Error deleting college:", error);
      showToast("Failed to delete college", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleActive = async (college: CollegeWithEmail) => {
    try {
      const { error } = await supabase
        .from("colleges")
        .update({ is_active: !college.is_active })
        .eq("id", college.id);

      if (error) throw error;
      showToast(
        `College ${college.is_active ? "deactivated" : "activated"}`,
        "success"
      );
      fetchColleges();
    } catch (error) {
      console.error("Error toggling college:", error);
      showToast("Failed to update college status", "error");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loading size="lg" text="Loading college accounts..." />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            College Accounts
          </h1>
          <p className="text-gray-600 mt-1">
            Manage college accounts for authenticated evaluation access
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Create Account
        </Button>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 text-blue-600 shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <p className="text-sm text-blue-800">
              College accounts can log in to submit evaluations. Each college
              has a unique email and password for authentication.
            </p>
          </div>
        </div>
      </div>

      {/* Colleges List */}
      {colleges.length === 0 ? (
        <Card className="text-center py-12">
          <svg
            className="w-16 h-16 text-gray-300 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No college accounts yet
          </h3>
          <p className="text-gray-500 mb-6">
            Create college accounts to enable authenticated evaluations.
          </p>
          <Button onClick={openCreateModal}>Create First Account</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {colleges.map((college) => (
            <Card
              key={college.id}
              className="flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                {/* Avatar */}
                {college.avatar_url ? (
                  <img
                    src={college.avatar_url}
                    alt={college.name}
                    className="w-12 h-12 rounded-xl object-cover shrink-0"
                  />
                ) : (
                  <div
                    className={`
                    w-12 h-12 rounded-xl flex items-center justify-center shrink-0 font-bold text-lg
                    ${
                      college.is_active
                        ? "bg-maroon-100 text-maroon-800"
                        : "bg-gray-100 text-gray-400"
                    }
                  `}
                  >
                    {college.code?.[0] || college.name[0]}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3
                      className={`font-semibold ${
                        college.is_active ? "text-gray-900" : "text-gray-400"
                      }`}
                    >
                      {college.name}
                    </h3>
                    {college.code && (
                      <span className="px-2 py-0.5 bg-maroon-50 text-maroon-700 text-xs font-medium rounded">
                        {college.code}
                      </span>
                    )}
                    {!college.is_active && (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {college.user_id ? (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        <svg
                          className="w-3 h-3"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Account linked
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">
                        No account linked
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleActive(college)}
                  title={college.is_active ? "Deactivate" : "Activate"}
                >
                  {college.is_active ? (
                    <svg
                      className="w-4 h-4 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.879 6.879L21 21"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-4 h-4 text-green-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEditModal(college)}
                  title="Edit"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openDeleteDialog(college)}
                  title="Delete"
                >
                  <svg
                    className="w-4 h-4 text-red-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedCollege ? "Edit College" : "Create College Account"}
        size="lg"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setIsModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} isLoading={isSubmitting}>
              {selectedCollege ? "Save Changes" : "Create Account"}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="College Name"
              placeholder="e.g., College of Computer Studies"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              required
            />
            <Input
              label="Department Code"
              placeholder="e.g., CCS"
              value={formData.code}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  code: e.target.value.toUpperCase(),
                }))
              }
              required
            />
          </div>

          {!selectedCollege && (
            <>
              <div className="border-t border-gray-200 pt-4 mt-4">
                <h4 className="font-medium text-gray-900 mb-3">
                  Account Credentials
                </h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Email Address"
                    type="email"
                    placeholder="college@example.com"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                    required
                  />
                  <Input
                    label="Password"
                    type="password"
                    placeholder="Min. 6 characters"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        password: e.target.value,
                      }))
                    }
                    showPasswordToggle
                    required
                  />
                </div>
              </div>
            </>
          )}

          <Input
            label="Avatar URL (Optional)"
            type="url"
            placeholder="https://example.com/logo.png"
            value={formData.avatar_url}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, avatar_url: e.target.value }))
            }
          />
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete College"
        message={`Are you sure you want to delete "${selectedCollege?.name}"? The user account will remain but will no longer be linked to this college. This action cannot be undone.`}
        confirmText="Delete"
        confirmVariant="danger"
        isLoading={isSubmitting}
      />
    </div>
  );
}

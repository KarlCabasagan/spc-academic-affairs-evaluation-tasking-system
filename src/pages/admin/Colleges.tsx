import { useEffect, useState, type FormEvent } from "react";
import {
  Button,
  Card,
  CheckCircleIcon,
  ConfirmDialog,
  EditIcon,
  EyeIcon,
  EyeOffIcon,
  InfoCircleIcon,
  Input,
  Loading,
  Modal,
  PlusIcon,
  showToast,
  TrashIcon,
} from "../../components/ui";
import { supabase, supabaseNoPersist } from "../../lib/supabase";
import type { College } from "../../lib/types";

interface CollegeFormData {
  name: string;
  code: string;
  email: string;
  password: string;
  avatar_url: string;
}

function isValidHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export default function Colleges() {
  const [colleges, setColleges] = useState<College[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedCollege, setSelectedCollege] = useState<College | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(() => new Set());

  const [formData, setFormData] = useState<CollegeFormData>({
    name: "",
    code: "",
    email: "",
    password: "",
    avatar_url: "",
  });

  const fetchColleges = async () => {
    try {
      const { data, error } = await supabase
        .from("colleges")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      setColleges((data || []) as College[]);
    } catch {
      showToast("Failed to load colleges.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchColleges();
  }, []);

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

  const openEditModal = (college: College) => {
    setSelectedCollege(college);
    setFormData({
      name: college.name,
      code: college.code || "",
      email: "",
      password: "",
      avatar_url: college.avatar_url || "",
    });
    setIsModalOpen(true);
  };

  const openDeleteDialog = (college: College) => {
    setSelectedCollege(college);
    setIsDeleteOpen(true);
  };

  const createAccountFallback = async (params: {
    email: string;
    password: string;
    name: string;
    code: string;
    avatarUrl: string | null;
  }) => {
    const { data: authData, error: authError } =
      await supabaseNoPersist.auth.signUp({
        email: params.email,
        password: params.password,
      });

    if (authError) {
      if (authError.message?.toLowerCase().includes("already registered")) {
        throw new Error("This email is already registered.");
      }
      throw new Error(authError.message || "Failed to create account.");
    }

    if (!authData.user) {
      throw new Error("Failed to create user account.");
    }

    const { error: roleError } = await supabase.rpc("assign_college_role", {
      user_uuid: authData.user.id,
    });

    if (roleError) {
      throw new Error(
        "Auth user created, but role assignment failed. Remove the orphaned user in Supabase Auth before retrying.",
      );
    }

    const { error: dbError } = await supabase.from("colleges").insert({
      user_id: authData.user.id,
      name: params.name,
      code: params.code,
      avatar_url: params.avatarUrl,
    });

    if (dbError) {
      throw new Error(
        "Auth account created, but linking the college profile failed.",
      );
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const trimmedName = formData.name.trim();
    const normalizedCode = formData.code.trim().toUpperCase();
    const trimmedEmail = formData.email.trim();
    const trimmedAvatar = formData.avatar_url.trim();

    if (!trimmedName) {
      showToast("Please enter a college name.", "error");
      return;
    }

    if (!normalizedCode) {
      showToast("Please enter a department code.", "error");
      return;
    }

    if (trimmedAvatar && !isValidHttpsUrl(trimmedAvatar)) {
      showToast("Avatar URL must start with https://", "error");
      return;
    }

    const duplicate = colleges.find(
      (c) =>
        c.id !== selectedCollege?.id &&
        (c.name.trim().toLowerCase() === trimmedName.toLowerCase() ||
          (c.code || "").trim().toUpperCase() === normalizedCode),
    );
    if (duplicate) {
      showToast(
        duplicate.name.trim().toLowerCase() === trimmedName.toLowerCase()
          ? "A college with this name already exists."
          : `Department code "${normalizedCode}" is already assigned.`,
        "error",
      );
      return;
    }

    setIsSubmitting(true);
    try {
      if (selectedCollege) {
        const { error } = await supabase
          .from("colleges")
          .update({
            name: trimmedName,
            code: normalizedCode,
            avatar_url: trimmedAvatar || null,
          })
          .eq("id", selectedCollege.id);

        if (error) throw error;
        showToast("College updated successfully.", "success");
      } else {
        if (!trimmedEmail) {
          showToast("Please enter an email for the college account.", "error");
          return;
        }

        if (!formData.password || formData.password.length < 8) {
          showToast("Password must be at least 8 characters long.", "error");
          return;
        }

        const { data: fnData, error: fnError } =
          await supabase.functions.invoke<{
            success?: boolean;
            error?: string;
          }>("create-college-user", {
            body: {
              email: trimmedEmail,
              password: formData.password,
              role: "college",
              collegeName: trimmedName,
              collegeCode: normalizedCode,
              avatarUrl: trimmedAvatar || undefined,
            },
          });

        if (fnError) {
          const context = (fnError as { context?: Response }).context;
          const status = context?.status;
          const isFunctionUnavailable =
            fnError.name === "FunctionsFetchError" ||
            fnError.name === "FunctionsRelayError" ||
            status === 404;

          if (!isFunctionUnavailable) {
            let serverMessage = fnError.message;
            if (context) {
              try {
                const payload = (await context.json()) as { error?: string };
                if (payload?.error) serverMessage = payload.error;
              } catch {
                // Keep fnError.message when body isn't JSON
              }
            }
            throw new Error(serverMessage || "Failed to create college account.");
          }

          await createAccountFallback({
            email: trimmedEmail,
            password: formData.password,
            name: trimmedName,
            code: normalizedCode,
            avatarUrl: trimmedAvatar || null,
          });
        } else if (fnData?.error) {
          throw new Error(fnData.error);
        }

        showToast("College account created successfully.", "success");
      }

      setIsModalOpen(false);
      await fetchColleges();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save college.";
      showToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCollege || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("colleges")
        .delete()
        .eq("id", selectedCollege.id);

      if (error) throw error;
      showToast("College deleted successfully.", "success");
      setIsDeleteOpen(false);
      await fetchColleges();
    } catch {
      showToast("Failed to delete college.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleActive = async (college: College) => {
    if (togglingIds.has(college.id)) return;
    setTogglingIds((prev) => new Set(prev).add(college.id));

    try {
      const { error } = await supabase
        .from("colleges")
        .update({ is_active: !college.is_active })
        .eq("id", college.id);

      if (error) throw error;
      showToast(
        `College ${college.is_active ? "deactivated" : "activated"}.`,
        "success",
      );
      await fetchColleges();
    } catch {
      showToast("Failed to update college status.", "error");
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(college.id);
        return next;
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loading size="lg" text="Loading college accounts…" />
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
          <p className="text-gray-600 max-w-prose mt-1">
            Manage college accounts for authenticated evaluation submissions.
          </p>
        </div>
        <Button type="button" onClick={openCreateModal}>
          <PlusIcon className="w-5 h-5" />
          Create Account
        </Button>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <InfoCircleIcon className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-900 max-w-prose">
            College accounts can log in to submit area evaluations. Each college
            has a unique email and password managed by administrators.
          </p>
        </div>
      </div>

      {/* Colleges List */}
      {colleges.length === 0 ? (
        <Card className="text-center py-12">
          <InfoCircleIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h2 className="text-lg font-medium text-gray-900 mb-2">
            No college accounts yet
          </h2>
          <p className="text-gray-600 max-w-prose mx-auto mb-6">
            Create college accounts to enable authenticated evaluations.
          </p>
          <Button type="button" onClick={openCreateModal}>
            Create First Account
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {colleges.map((college) => {
            const isToggling = togglingIds.has(college.id);

            return (
              <Card
                key={college.id}
                className="flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  {college.avatar_url ? (
                    <img
                      src={college.avatar_url}
                      alt={college.name}
                      className="w-12 h-12 rounded-xl object-cover shrink-0"
                    />
                  ) : (
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 font-bold text-lg ${
                        college.is_active
                          ? "bg-maroon-100 text-maroon-800"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {college.code?.[0] || college.name[0]}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2
                        className={`text-base font-semibold truncate ${
                          college.is_active ? "text-gray-900" : "text-gray-600"
                        }`}
                      >
                        {college.name}
                      </h2>
                      {college.code && (
                        <span className="px-2 py-0.5 bg-maroon-50 text-maroon-800 text-xs font-semibold tracking-wider uppercase rounded">
                          {college.code}
                        </span>
                      )}
                      {!college.is_active && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {college.user_id ? (
                        <span className="text-xs text-emerald-700 font-medium inline-flex items-center gap-1">
                          <CheckCircleIcon className="w-3.5 h-3.5 shrink-0" />
                          Account linked
                        </span>
                      ) : (
                        <span className="text-xs text-gray-600">
                          No account linked
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void toggleActive(college)}
                    isLoading={isToggling}
                    disabled={isToggling}
                    aria-pressed={college.is_active}
                    aria-label={
                      college.is_active
                        ? `Deactivate ${college.name}`
                        : `Activate ${college.name}`
                    }
                    className="w-11 h-11 p-0"
                  >
                    {college.is_active ? (
                      <EyeOffIcon className="w-4 h-4 text-gray-600" />
                    ) : (
                      <EyeIcon className="w-4 h-4 text-emerald-700" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditModal(college)}
                    aria-label={`Edit ${college.name}`}
                    className="w-11 h-11 p-0"
                  >
                    <EditIcon className="w-4 h-4 text-gray-700" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openDeleteDialog(college)}
                    aria-label={`Delete ${college.name}`}
                    className="w-11 h-11 p-0 text-red-700 hover:bg-red-50"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        preventClose={isSubmitting}
        onClose={() => setIsModalOpen(false)}
        title={selectedCollege ? "Edit College" : "Create College Account"}
        size="lg"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" form="college-form" isLoading={isSubmitting}>
              {isSubmitting
                ? "Saving…"
                : selectedCollege
                  ? "Save Changes"
                  : "Create Account"}
            </Button>
          </>
        }
      >
        <form id="college-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="College Name"
              placeholder="e.g., College of Computer Studies"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              required
              disabled={isSubmitting}
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
              disabled={isSubmitting}
            />
          </div>

          {!selectedCollege && (
            <div className="border-t border-gray-200 pt-4 mt-4">
              <h3 className="font-medium text-gray-900 mb-3">
                Account Credentials
              </h3>
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
                  autoComplete="email"
                  required
                  disabled={isSubmitting}
                />
                <Input
                  label="Password"
                  type="password"
                  placeholder="Min. 8 characters"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      password: e.target.value,
                    }))
                  }
                  autoComplete="new-password"
                  minLength={8}
                  showPasswordToggle
                  required
                  disabled={isSubmitting}
                />
              </div>
            </div>
          )}

          <Input
            label="Avatar URL (Optional)"
            type="url"
            placeholder="https://example.com/logo.png"
            helperText="Leave empty or enter an https:// image URL."
            value={formData.avatar_url}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, avatar_url: e.target.value }))
            }
            disabled={isSubmitting}
          />
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={() => void handleDelete()}
        title="Delete College"
        message={`Are you sure you want to delete "${selectedCollege?.name}"? This will permanently remove the college profile, its login account, and all recorded evaluation responses. This action cannot be undone.`}
        confirmText="Delete"
        confirmVariant="danger"
        isLoading={isSubmitting}
      />
    </div>
  );
}

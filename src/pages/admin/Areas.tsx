import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangleIcon,
  Button,
  buttonVariants,
  Card,
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
  Textarea,
  TrashIcon,
} from "../../components/ui";
import { useAuth } from "../../context/useAuth";
import { supabase, supabaseNoPersist } from "../../lib/supabase";
import type { Area, AreaFormData } from "../../lib/types";

interface CollegeWithResponses {
  id: string;
  name: string;
  code: string | null;
}

interface JoinedResponseCollegeRow {
  evaluation_sessions: {
    colleges: CollegeWithResponses | null;
  } | null;
}

export default function Areas() {
  const { user } = useAuth();
  const [areas, setAreas] = useState<Area[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkingDeleteId, setCheckingDeleteId] = useState<string | null>(null);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(() => new Set());

  // Clear all areas modal state
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [clearAllPassword, setClearAllPassword] = useState("");
  const [isClearingAll, setIsClearingAll] = useState(false);

  // Response warning state
  const [collegesWithResponses, setCollegesWithResponses] = useState<
    CollegeWithResponses[]
  >([]);
  const [showResponseWarning, setShowResponseWarning] = useState(false);

  // Form state
  const [formData, setFormData] = useState<AreaFormData>({
    area_number: 1,
    name: "",
    description: "",
  });

  const fetchAreas = async () => {
    try {
      const { data, error } = await supabase
        .from("areas")
        .select("*")
        .order("area_number", { ascending: true });

      if (error) throw error;
      setAreas((data || []) as Area[]);
    } catch {
      showToast("Failed to load evaluation areas.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchAreas();
  }, []);

  const checkAreaResponses = async (
    areaId: string,
  ): Promise<CollegeWithResponses[]> => {
    const { data, error } = await supabase
      .from("responses")
      .select(
        `
          id,
          questions!inner(area_id),
          evaluation_sessions!inner(
            colleges!inner(id, name, code)
          )
        `,
      )
      .eq("questions.area_id", areaId);

    if (error) throw error;
    if (!data || data.length === 0) return [];

    const collegeMap = new Map<string, CollegeWithResponses>();
    (data as unknown as JoinedResponseCollegeRow[]).forEach((row) => {
      const college = row.evaluation_sessions?.colleges;
      if (college && !collegeMap.has(college.id)) {
        collegeMap.set(college.id, {
          id: college.id,
          name: college.name,
          code: college.code,
        });
      }
    });

    return Array.from(collegeMap.values());
  };

  const openCreateModal = () => {
    setSelectedArea(null);
    setFormData({
      area_number:
        areas.length > 0 ? Math.max(...areas.map((a) => a.area_number)) + 1 : 1,
      name: "",
      description: "",
    });
    setIsModalOpen(true);
  };

  const openEditModal = (area: Area) => {
    setSelectedArea(area);
    setFormData({
      area_number: area.area_number,
      name: area.name,
      description: area.description || "",
    });
    setIsModalOpen(true);
  };

  const openDeleteDialog = async (area: Area) => {
    if (checkingDeleteId) return;
    setCheckingDeleteId(area.id);
    setSelectedArea(area);

    try {
      const colleges = await checkAreaResponses(area.id);
      setCollegesWithResponses(colleges);

      if (colleges.length > 0) {
        setShowResponseWarning(true);
      } else {
        setIsDeleteOpen(true);
      }
    } catch {
      showToast(
        "Failed to check existing responses for this area. Deletion was cancelled.",
        "error",
      );
      setSelectedArea(null);
    } finally {
      setCheckingDeleteId(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!Number.isInteger(formData.area_number) || formData.area_number < 1) {
      showToast("Area number must be at least 1.", "error");
      return;
    }

    if (!formData.name.trim()) {
      showToast("Please enter an area name.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      if (selectedArea) {
        const { error } = await supabase
          .from("areas")
          .update({
            area_number: formData.area_number,
            name: formData.name.trim(),
            description: formData.description?.trim() || null,
          })
          .eq("id", selectedArea.id);

        if (error) throw error;
        showToast("Area updated successfully.", "success");
      } else {
        const { error } = await supabase.from("areas").insert({
          area_number: formData.area_number,
          name: formData.name.trim(),
          description: formData.description?.trim() || null,
        });

        if (error) throw error;
        showToast("Area created successfully.", "success");
      }

      setIsModalOpen(false);
      await fetchAreas();
    } catch {
      showToast("Failed to save area.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedArea || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("areas")
        .delete()
        .eq("id", selectedArea.id);

      if (error) throw error;
      showToast("Area deleted successfully.", "success");
      setIsDeleteOpen(false);
      setShowResponseWarning(false);
      setCollegesWithResponses([]);
      await fetchAreas();
    } catch {
      showToast("Failed to delete area.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearAllAreas = async (e: FormEvent) => {
    e.preventDefault();
    if (!user?.email) {
      showToast("User not authenticated.", "error");
      return;
    }

    if (!clearAllPassword.trim()) {
      showToast("Please enter your password.", "error");
      return;
    }

    setIsClearingAll(true);
    try {
      const { error: authError } =
        await supabaseNoPersist.auth.signInWithPassword({
          email: user.email,
          password: clearAllPassword,
        });

      if (authError) {
        showToast("Invalid password. Please try again.", "error");
        return;
      }

      const { error: rpcError } = await supabase.rpc("clear_all_areas_data");
      if (rpcError) {
        if (rpcError.code !== "PGRST202") {
          throw rpcError;
        }

        // Pre-migration fallback: delete leaf-to-root strictly checking every error
        const sentinelId = "00000000-0000-0000-0000-000000000000";
        const { error: responsesError } = await supabase
          .from("responses")
          .delete()
          .neq("id", sentinelId);
        if (responsesError) throw responsesError;

        const { error: sessionsError } = await supabase
          .from("evaluation_sessions")
          .delete()
          .neq("id", sentinelId);
        if (sessionsError) throw sessionsError;

        const { error: questionsError } = await supabase
          .from("questions")
          .delete()
          .neq("id", sentinelId);
        if (questionsError) throw questionsError;

        const { error: areasError } = await supabase
          .from("areas")
          .delete()
          .neq("id", sentinelId);
        if (areasError) throw areasError;
      }

      showToast("All areas and questions have been cleared.", "success");
      setShowClearAllModal(false);
      setClearAllPassword("");
      await fetchAreas();
    } catch {
      showToast("Failed to clear areas. Please try again.", "error");
    } finally {
      setIsClearingAll(false);
    }
  };

  const toggleActive = async (area: Area) => {
    if (togglingIds.has(area.id)) return;
    setTogglingIds((prev) => new Set(prev).add(area.id));

    try {
      const { error } = await supabase
        .from("areas")
        .update({ is_active: !area.is_active })
        .eq("id", area.id);

      if (error) throw error;
      showToast(
        `Area ${area.is_active ? "deactivated" : "activated"}.`,
        "success",
      );
      await fetchAreas();
    } catch {
      showToast("Failed to update area status.", "error");
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(area.id);
        return next;
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loading size="lg" text="Loading areas…" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Evaluation Areas
          </h1>
          <p className="text-gray-600 max-w-prose mt-1">
            Manage PACUCOA evaluation areas and configure their criteria.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {areas.length > 0 && (
            <Button
              type="button"
              variant="danger"
              onClick={() => setShowClearAllModal(true)}
            >
              <TrashIcon className="w-4 h-4" />
              Clear All
            </Button>
          )}
          <Button type="button" onClick={openCreateModal}>
            <PlusIcon className="w-5 h-5" />
            Add Area
          </Button>
        </div>
      </div>

      {/* Areas List */}
      {areas.length === 0 ? (
        <Card className="text-center py-12">
          <InfoCircleIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h2 className="text-lg font-medium text-gray-900 mb-2">
            No areas yet
          </h2>
          <p className="text-gray-600 max-w-prose mx-auto mb-6">
            Create your first evaluation area to get started.
          </p>
          <Button type="button" onClick={openCreateModal}>
            Create Area
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {areas.map((area) => {
            const isToggling = togglingIds.has(area.id);
            const isChecking = checkingDeleteId === area.id;

            return (
              <Card
                key={area.id}
                className="flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg tabular-nums shrink-0 ${
                      area.is_active
                        ? "bg-maroon-100 text-maroon-800"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {area.area_number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2
                        className={`text-base font-semibold truncate ${
                          area.is_active ? "text-gray-900" : "text-gray-600"
                        }`}
                      >
                        {area.name}
                      </h2>
                      {!area.is_active && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-full shrink-0">
                          Inactive
                        </span>
                      )}
                    </div>
                    {area.description && (
                      <p
                        className={`text-sm truncate mt-0.5 ${
                          area.is_active ? "text-gray-600" : "text-gray-500"
                        }`}
                      >
                        {area.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <Link
                    to={`/admin/areas/${area.id}`}
                    className={buttonVariants({
                      variant: "secondary",
                      size: "sm",
                      className: "min-h-11 mr-1",
                    })}
                  >
                    <InfoCircleIcon className="w-4 h-4" />
                    Questions
                  </Link>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void toggleActive(area)}
                    isLoading={isToggling}
                    disabled={isToggling}
                    aria-label={
                      area.is_active
                        ? `Deactivate ${area.name}`
                        : `Activate ${area.name}`
                    }
                    aria-pressed={area.is_active}
                    className="w-11 h-11 p-0"
                  >
                    {area.is_active ? (
                      <EyeOffIcon className="w-4 h-4 text-gray-600" />
                    ) : (
                      <EyeIcon className="w-4 h-4 text-emerald-700" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditModal(area)}
                    aria-label={`Edit ${area.name}`}
                    className="w-11 h-11 p-0"
                  >
                    <EditIcon className="w-4 h-4 text-gray-700" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void openDeleteDialog(area)}
                    isLoading={isChecking}
                    disabled={checkingDeleteId !== null}
                    aria-label={`Delete ${area.name}`}
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
        title={selectedArea ? "Edit Area" : "Create Area"}
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
            <Button
              type="submit"
              form="area-form"
              isLoading={isSubmitting}
            >
              {isSubmitting
                ? "Saving…"
                : selectedArea
                  ? "Save Changes"
                  : "Create Area"}
            </Button>
          </>
        }
      >
        <form id="area-form" onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Area Number"
            type="number"
            min={1}
            value={formData.area_number || ""}
            onChange={(e) => {
              const parsed = Number.parseInt(e.target.value, 10);
              setFormData((prev) => ({
                ...prev,
                area_number: Number.isNaN(parsed) ? 0 : parsed,
              }));
            }}
            required
            disabled={isSubmitting}
          />
          <Input
            label="Area Name"
            placeholder="e.g., Philosophy and Objectives"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            required
            disabled={isSubmitting}
          />
          <Textarea
            label="Description"
            placeholder="Brief description of the evaluation area…"
            value={formData.description || ""}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, description: e.target.value }))
            }
            disabled={isSubmitting}
          />
        </form>
      </Modal>

      {/* Delete Confirmation (no responses) */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={() => void handleDelete()}
        title="Delete Area"
        message={`Are you sure you want to delete "${selectedArea?.name}"? This will also delete all questions in this area. This action cannot be undone.`}
        confirmText="Delete"
        confirmVariant="danger"
        isLoading={isSubmitting}
      />

      {/* Delete Warning with Responses */}
      <Modal
        isOpen={showResponseWarning}
        preventClose={isSubmitting}
        onClose={() => {
          setShowResponseWarning(false);
          setCollegesWithResponses([]);
        }}
        title="Warning: Area Has Responses"
        size="md"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={() => {
                setShowResponseWarning(false);
                setCollegesWithResponses([]);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => void handleDelete()}
              isLoading={isSubmitting}
            >
              {isSubmitting ? "Deleting…" : "Delete Anyway"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangleIcon className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-900">
                  This area contains responses from colleges
                </h3>
                <p className="text-sm text-amber-800 max-w-prose mt-1">
                  Deleting this area will permanently delete all recorded
                  responses from the following colleges:
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h4 className="text-sm font-medium text-gray-800 mb-2">
              Affected Colleges:
            </h4>
            <ul className="space-y-1">
              {collegesWithResponses.map((college) => (
                <li
                  key={college.id}
                  className="text-sm text-gray-700 flex items-center gap-2"
                >
                  <span
                    className="w-2 h-2 bg-maroon-600 rounded-full shrink-0"
                    aria-hidden="true"
                  />
                  {college.code ? `${college.code} - ` : ""}
                  {college.name}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-sm text-gray-700 max-w-prose">
            Are you sure you want to delete{" "}
            <strong>"{selectedArea?.name}"</strong> and all its responses?
          </p>
        </div>
      </Modal>

      {/* Clear All Areas Modal */}
      <Modal
        isOpen={showClearAllModal}
        preventClose={isClearingAll}
        onClose={() => {
          setShowClearAllModal(false);
          setClearAllPassword("");
        }}
        title="Clear All Areas?"
        size="md"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={isClearingAll}
              onClick={() => {
                setShowClearAllModal(false);
                setClearAllPassword("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="clear-areas-form"
              variant="danger"
              isLoading={isClearingAll}
              disabled={!clearAllPassword.trim()}
            >
              {isClearingAll ? "Clearing…" : "Clear All Areas"}
            </Button>
          </>
        }
      >
        <form
          id="clear-areas-form"
          onSubmit={handleClearAllAreas}
          className="space-y-4"
        >
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangleIcon className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-900">Danger Zone</h3>
                <p className="text-sm text-red-800 max-w-prose mt-1">
                  This will <strong>permanently delete</strong>:
                </p>
                <ul className="text-sm text-red-800 mt-2 list-disc list-inside tabular-nums space-y-0.5">
                  <li>All {areas.length} evaluation areas</li>
                  <li>All questions across every area</li>
                  <li>All evaluation sessions and responses</li>
                </ul>
                <p className="text-sm text-red-800 mt-2 font-medium">
                  This action cannot be undone.
                </p>
              </div>
            </div>
          </div>

          <Input
            label="Enter your password to confirm"
            type="password"
            value={clearAllPassword}
            onChange={(e) => setClearAllPassword(e.target.value)}
            placeholder="Your admin password"
            autoComplete="current-password"
            showPasswordToggle
            required
            disabled={isClearingAll}
          />
        </form>
      </Modal>
    </div>
  );
}

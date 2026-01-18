import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import type { Area, AreaFormData } from "../../lib/types";
import {
  Button,
  Card,
  Input,
  Textarea,
  Modal,
  ConfirmDialog,
  Loading,
  showToast,
} from "../../components/ui";

interface CollegeWithResponses {
  id: string;
  name: string;
  code: string | null;
}

export default function Areas() {
  const { user } = useAuth();
  const [areas, setAreas] = useState<Area[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    area_number: 0,
    name: "",
    description: "",
  });

  useEffect(() => {
    fetchAreas();
  }, []);

  const fetchAreas = async () => {
    try {
      const { data, error } = await supabase
        .from("areas")
        .select("*")
        .order("area_number", { ascending: true });

      if (error) throw error;
      setAreas(data || []);
    } catch (error) {
      console.error("Error fetching areas:", error);
      showToast("Failed to load areas", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Check if an area has any responses from colleges
  const checkAreaResponses = async (
    areaId: string
  ): Promise<CollegeWithResponses[]> => {
    try {
      // Get all questions in this area
      const { data: questions, error: questionsError } = await supabase
        .from("questions")
        .select("id")
        .eq("area_id", areaId);

      if (questionsError) throw questionsError;
      if (!questions || questions.length === 0) return [];

      const questionIds = questions.map((q) => q.id);

      // Get all responses for these questions
      const { data: responses, error: responsesError } = await supabase
        .from("responses")
        .select(
          `
          id,
          session_id,
          evaluation_sessions!inner (
            college_id,
            colleges!inner (
              id,
              name,
              code
            )
          )
        `
        )
        .in("question_id", questionIds);

      if (responsesError) throw responsesError;
      if (!responses || responses.length === 0) return [];

      // Extract unique colleges
      const collegeMap = new Map<string, CollegeWithResponses>();
      responses.forEach((r: any) => {
        const college = r.evaluation_sessions?.colleges;
        if (college && !collegeMap.has(college.id)) {
          collegeMap.set(college.id, {
            id: college.id,
            name: college.name,
            code: college.code,
          });
        }
      });

      return Array.from(collegeMap.values());
    } catch (error) {
      console.error("Error checking area responses:", error);
      return [];
    }
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
    setSelectedArea(area);

    // Check for responses before opening delete dialog
    const colleges = await checkAreaResponses(area.id);
    setCollegesWithResponses(colleges);

    if (colleges.length > 0) {
      setShowResponseWarning(true);
    } else {
      setIsDeleteOpen(true);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      showToast("Please enter an area name", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      if (selectedArea) {
        // Update
        const { error } = await supabase
          .from("areas")
          .update({
            area_number: formData.area_number,
            name: formData.name.trim(),
            description: formData.description?.trim() || null,
          })
          .eq("id", selectedArea.id);

        if (error) throw error;
        showToast("Area updated successfully", "success");
      } else {
        // Create
        const { error } = await supabase.from("areas").insert({
          area_number: formData.area_number,
          name: formData.name.trim(),
          description: formData.description?.trim() || null,
        });

        if (error) throw error;
        showToast("Area created successfully", "success");
      }

      setIsModalOpen(false);
      fetchAreas();
    } catch (error) {
      console.error("Error saving area:", error);
      showToast("Failed to save area", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedArea) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("areas")
        .delete()
        .eq("id", selectedArea.id);

      if (error) throw error;
      showToast("Area deleted successfully", "success");
      setIsDeleteOpen(false);
      setShowResponseWarning(false);
      fetchAreas();
    } catch (error) {
      console.error("Error deleting area:", error);
      showToast("Failed to delete area", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearAllAreas = async () => {
    if (!user?.email) {
      showToast("User not authenticated", "error");
      return;
    }

    if (!clearAllPassword.trim()) {
      showToast("Please enter your password", "error");
      return;
    }

    setIsClearingAll(true);
    try {
      // Verify admin password
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: clearAllPassword,
      });

      if (authError) {
        showToast("Invalid password. Please try again.", "error");
        return;
      }

      // Delete all responses first (foreign key constraint)
      const { error: responsesError } = await supabase
        .from("responses")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (responsesError) throw responsesError;

      // Delete all evaluation sessions
      const { error: sessionsError } = await supabase
        .from("evaluation_sessions")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (sessionsError) throw sessionsError;

      // Delete all questions
      const { error: questionsError } = await supabase
        .from("questions")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (questionsError) throw questionsError;

      // Delete all areas
      const { error: areasError } = await supabase
        .from("areas")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (areasError) throw areasError;

      showToast("All areas and questions have been cleared", "success");
      setShowClearAllModal(false);
      setClearAllPassword("");
      fetchAreas();
    } catch (error) {
      console.error("Error clearing all areas:", error);
      showToast("Failed to clear areas. Please try again.", "error");
    } finally {
      setIsClearingAll(false);
    }
  };

  const toggleActive = async (area: Area) => {
    try {
      const { error } = await supabase
        .from("areas")
        .update({ is_active: !area.is_active })
        .eq("id", area.id);

      if (error) throw error;
      showToast(
        `Area ${area.is_active ? "deactivated" : "activated"}`,
        "success"
      );
      fetchAreas();
    } catch (error) {
      console.error("Error toggling area:", error);
      showToast("Failed to update area status", "error");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loading size="lg" text="Loading areas..." />
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
          <p className="text-gray-600 mt-1">
            Manage PACUCOA evaluation areas and their questions
          </p>
        </div>
        <div className="flex items-center gap-2">
          {areas.length > 0 && (
            <Button variant="danger" onClick={() => setShowClearAllModal(true)}>
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
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Clear All
            </Button>
          )}
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
            Add Area
          </Button>
        </div>
      </div>

      {/* Areas List */}
      {areas.length === 0 ? (
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
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No areas yet
          </h3>
          <p className="text-gray-500 mb-6">
            Create your first evaluation area to get started.
          </p>
          <Button onClick={openCreateModal}>Create Area</Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {areas.map((area) => (
            <Card
              key={area.id}
              className="flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div
                  className={`
                  w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shrink-0
                  ${
                    area.is_active
                      ? "bg-maroon-100 text-maroon-800"
                      : "bg-gray-100 text-gray-400"
                  }
                `}
                >
                  {area.area_number}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3
                      className={`font-semibold truncate ${
                        area.is_active ? "text-gray-900" : "text-gray-400"
                      }`}
                    >
                      {area.name}
                    </h3>
                    {!area.is_active && (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full shrink-0">
                        Inactive
                      </span>
                    )}
                  </div>
                  {area.description && (
                    <p
                      className={`text-sm truncate ${
                        area.is_active ? "text-gray-500" : "text-gray-400"
                      }`}
                    >
                      {area.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Link to={`/admin/areas/${area.id}`}>
                  <Button variant="secondary" size="sm">
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
                        d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    Questions
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleActive(area)}
                >
                  {area.is_active ? (
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
                  onClick={() => openEditModal(area)}
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
                  onClick={() => openDeleteDialog(area)}
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
        title={selectedArea ? "Edit Area" : "Create Area"}
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
              {selectedArea ? "Save Changes" : "Create Area"}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Area Number"
            type="number"
            min={1}
            value={formData.area_number}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                area_number: parseInt(e.target.value) || 0,
              }))
            }
            required
          />
          <Input
            label="Area Name"
            placeholder="e.g., Philosophy and Objectives"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            required
          />
          <Textarea
            label="Description"
            placeholder="Brief description of the evaluation area..."
            value={formData.description || ""}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, description: e.target.value }))
            }
          />
        </form>
      </Modal>

      {/* Delete Confirmation (no responses) */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Area"
        message={`Are you sure you want to delete "${selectedArea?.name}"? This will also delete all questions in this area. This action cannot be undone.`}
        confirmText="Delete"
        confirmVariant="danger"
        isLoading={isSubmitting}
      />

      {/* Delete Warning with Responses */}
      <Modal
        isOpen={showResponseWarning}
        onClose={() => {
          setShowResponseWarning(false);
          setCollegesWithResponses([]);
        }}
        title="Warning: Area Has Responses"
        size="md"
      >
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-amber-600 shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <h4 className="font-semibold text-amber-800">
                  This area contains responses from colleges
                </h4>
                <p className="text-sm text-amber-700 mt-1">
                  Deleting this area will also permanently delete all responses
                  from the following colleges:
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <h5 className="text-sm font-medium text-gray-700 mb-2">
              Affected Colleges:
            </h5>
            <ul className="space-y-1">
              {collegesWithResponses.map((college) => (
                <li
                  key={college.id}
                  className="text-sm text-gray-600 flex items-center gap-2"
                >
                  <span className="w-2 h-2 bg-maroon-500 rounded-full" />
                  {college.code ? `${college.code} - ` : ""}
                  {college.name}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-sm text-gray-600">
            Are you sure you want to delete{" "}
            <strong>"{selectedArea?.name}"</strong> and all its responses?
          </p>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setShowResponseWarning(false);
                setCollegesWithResponses([]);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              isLoading={isSubmitting}
            >
              Delete Anyway
            </Button>
          </div>
        </div>
      </Modal>

      {/* Clear All Areas Modal */}
      <Modal
        isOpen={showClearAllModal}
        onClose={() => {
          setShowClearAllModal(false);
          setClearAllPassword("");
        }}
        title="Clear All Areas?"
        size="md"
      >
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-red-600 shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <h4 className="font-semibold text-red-800">Danger Zone</h4>
                <p className="text-sm text-red-700 mt-1">
                  This will <strong>permanently delete</strong>:
                </p>
                <ul className="text-sm text-red-700 mt-2 list-disc list-inside">
                  <li>All {areas.length} evaluation areas</li>
                  <li>All questions in all areas</li>
                  <li>All evaluation sessions and responses</li>
                </ul>
                <p className="text-sm text-red-700 mt-2 font-medium">
                  This action CANNOT be undone.
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Enter your password to confirm
            </label>
            <input
              type="password"
              value={clearAllPassword}
              onChange={(e) => setClearAllPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              placeholder="Your admin password"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setShowClearAllModal(false);
                setClearAllPassword("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleClearAllAreas}
              isLoading={isClearingAll}
              disabled={!clearAllPassword.trim()}
            >
              Clear All Areas
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

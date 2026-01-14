import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../../lib/supabase";
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
}

export default function Colleges() {
  const [colleges, setColleges] = useState<College[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedCollege, setSelectedCollege] = useState<College | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState<CollegeFormData>({
    name: "",
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
    setFormData({ name: "" });
    setIsModalOpen(true);
  };

  const openEditModal = (college: College) => {
    setSelectedCollege(college);
    setFormData({ name: college.name });
    setIsModalOpen(true);
  };

  const openDeleteDialog = (college: College) => {
    setSelectedCollege(college);
    setIsDeleteOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      showToast("Please enter a college name", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      if (selectedCollege) {
        // Update
        const { error } = await supabase
          .from("colleges")
          .update({ name: formData.name.trim() })
          .eq("id", selectedCollege.id);

        if (error) throw error;
        showToast("College updated successfully", "success");
      } else {
        // Create
        const { error } = await supabase.from("colleges").insert({
          name: formData.name.trim(),
        });

        if (error) throw error;
        showToast("College created successfully", "success");
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

  const toggleActive = async (college: College) => {
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
        <Loading size="lg" text="Loading colleges..." />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            College Management
          </h1>
          <p className="text-gray-600 mt-1">
            Manage organizational units for guest evaluation tracking
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
          Add College
        </Button>
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
            No colleges yet
          </h3>
          <p className="text-gray-500 mb-6">
            Add colleges to enable guest identification on evaluation forms.
          </p>
          <Button onClick={openCreateModal}>Add First College</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {colleges.map((college) => (
            <Card
              key={college.id}
              className="flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div
                  className={`
                  w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                  ${
                    college.is_active
                      ? "bg-maroon-100 text-maroon-800"
                      : "bg-gray-100 text-gray-400"
                  }
                `}
                >
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
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3
                      className={`font-semibold truncate ${
                        college.is_active ? "text-gray-900" : "text-gray-400"
                      }`}
                    >
                      {college.name}
                    </h3>
                    {!college.is_active && (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full shrink-0">
                        Inactive
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
        title={selectedCollege ? "Edit College" : "Add College"}
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
              {selectedCollege ? "Save Changes" : "Add College"}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="College Name"
            placeholder="e.g., College of Engineering"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            required
          />
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete College"
        message={`Are you sure you want to delete "${selectedCollege?.name}"? Existing evaluations linked to this college will lose their reference. This action cannot be undone.`}
        confirmText="Delete"
        confirmVariant="danger"
        isLoading={isSubmitting}
      />
    </div>
  );
}

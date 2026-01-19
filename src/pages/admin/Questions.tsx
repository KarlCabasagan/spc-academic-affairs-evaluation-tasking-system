import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import type { Area, Question, QuestionFormData } from "../../lib/types";
import {
  Button,
  Card,
  Input,
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

// Build hierarchical tree from flat question array
function buildQuestionTree(questions: Question[]): Question[] {
  const questionMap = new Map<string, Question>();
  const roots: Question[] = [];

  // Initialize all questions in map with empty children
  questions.forEach((q) => {
    questionMap.set(q.id, { ...q, children: [] });
  });

  // Build tree structure
  questions.forEach((q) => {
    const question = questionMap.get(q.id)!;
    if (q.parent_id && questionMap.has(q.parent_id)) {
      const parent = questionMap.get(q.parent_id)!;
      parent.children = parent.children || [];
      parent.children.push(question);
    } else {
      roots.push(question);
    }
  });

  // Sort children by question_order
  const sortChildren = (items: Question[]) => {
    items.sort((a, b) => a.question_order - b.question_order);
    items.forEach((item) => {
      if (item.children && item.children.length > 0) {
        sortChildren(item.children);
      }
    });
  };
  sortChildren(roots);

  // Assign hierarchical numbers
  const assignNumbers = (items: Question[], prefix: string = "") => {
    items.forEach((item, index) => {
      const num = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
      item.hierarchical_number = num;
      if (item.children && item.children.length > 0) {
        assignNumbers(item.children, num);
      }
    });
  };
  assignNumbers(roots);

  return roots;
}

// Get all questions as flat list with hierarchy info for parent selector
function getFlatQuestionsForSelector(
  questions: Question[],
  excludeId?: string
): { id: string; label: string }[] {
  const result: { id: string; label: string }[] = [];
  const addToResult = (items: Question[], depth: number = 0) => {
    items.forEach((item) => {
      if (item.id !== excludeId) {
        result.push({
          id: item.id,
          label: `${"─".repeat(depth)} ${
            item.hierarchical_number
          } ${item.question_text.substring(0, 50)}${
            item.question_text.length > 50 ? "..." : ""
          }`,
        });
        if (item.children && item.children.length > 0) {
          addToResult(item.children, depth + 1);
        }
      }
    });
  };
  addToResult(questions);
  return result;
}

// Get next order number for a given parent
function getNextOrderNumber(
  questions: Question[],
  parentId: string | null
): number {
  const siblings = questions.filter((q) => q.parent_id === parentId);
  if (siblings.length === 0) return 1;
  return Math.max(...siblings.map((q) => q.question_order)) + 1;
}

// Get indentation style based on depth (max 4 levels visually)

// Recursive question item component
interface QuestionItemProps {
  question: Question;
  depth: number;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onEdit: (question: Question) => void;
  onDelete: (question: Question) => void;
  onToggleActive: (question: Question) => void;
  onAddSubQuestion: (parentId: string) => void;
}

function QuestionItem({
  question,
  depth,
  expandedIds,
  onToggleExpand,
  onEdit,
  onDelete,
  onToggleActive,
  onAddSubQuestion,
}: QuestionItemProps) {
  const hasChildren = question.children && question.children.length > 0;
  const isExpanded = expandedIds.has(question.id);

  // Calculate indentation (max 4 levels to prevent overflow)
  const indentPx = Math.min(depth, 4) * 24;

  return (
    <div className="relative">
      {/* Vertical connector line for nested items */}
      {depth > 0 && (
        <div
          className="absolute top-0 bottom-0 border-l-2 border-maroon-200"
          style={{ left: `${indentPx - 12}px` }}
        />
      )}

      <Card
        className="flex flex-col sm:flex-row sm:items-start gap-4 transition-all duration-200 relative"
        style={{ marginLeft: `${indentPx}px` }}
      >
        {/* Expand/Collapse Toggle for parents */}
        {hasChildren && (
          <button
            onClick={() => onToggleExpand(question.id)}
            className="absolute -left-3 top-4 w-6 h-6 bg-white border-2 border-maroon-300 rounded-full flex items-center justify-center hover:bg-maroon-50 transition-colors z-10"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            <svg
              className={`w-3 h-3 text-maroon-600 transition-transform duration-200 ${
                isExpanded ? "rotate-90" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        )}

        <div
          className={`
          shrink-0 px-3 py-1 rounded-lg text-sm font-medium
          ${
            question.is_active
              ? "bg-maroon-100 text-maroon-800"
              : "bg-gray-100 text-gray-400"
          }
        `}
        >
          {question.hierarchical_number}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={`font-medium ${
              question.is_active ? "text-gray-900" : "text-gray-400"
            }`}
          >
            {question.question_text}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {hasChildren && (
              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full">
                {question.children!.length} sub-question
                {question.children!.length > 1 ? "s" : ""}
                {!isExpanded && " (collapsed)"}
              </span>
            )}
            {question.is_required && (
              <span className="px-2 py-0.5 bg-red-50 text-red-600 text-xs rounded-full">
                Required
              </span>
            )}
            {!question.is_active && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                Inactive
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAddSubQuestion(question.id)}
            title="Add Sub-question"
          >
            <svg
              className="w-4 h-4 text-blue-600"
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
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggleActive(question)}
          >
            {question.is_active ? (
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
          <Button variant="ghost" size="sm" onClick={() => onEdit(question)}>
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
          <Button variant="ghost" size="sm" onClick={() => onDelete(question)}>
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

      {/* Render children recursively (with collapse animation) */}
      {hasChildren && isExpanded && (
        <div className="space-y-2 mt-2">
          {question.children!.map((child) => (
            <QuestionItem
              key={child.id}
              question={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleActive={onToggleActive}
              onAddSubQuestion={onAddSubQuestion}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Questions() {
  const { areaId } = useParams<{ areaId: string }>();
  const { user } = useAuth();

  const [area, setArea] = useState<Area | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionTree, setQuestionTree] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Clear all questions modal state
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [clearAllPassword, setClearAllPassword] = useState("");
  const [isClearingAll, setIsClearingAll] = useState(false);

  // Response warning state
  const [collegesWithResponses, setCollegesWithResponses] = useState<
    CollegeWithResponses[]
  >([]);
  const [showResponseWarning, setShowResponseWarning] = useState(false);

  // Expand/collapse state - default all expanded
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Form state
  const [formData, setFormData] = useState<QuestionFormData>({
    area_id: areaId || "",
    parent_id: null,
    question_text: "",
    question_order: 1,
    is_required: true,
  });

  useEffect(() => {
    if (areaId) {
      fetchData();
    }
  }, [areaId]);

  const fetchData = async () => {
    try {
      // Fetch area
      const { data: areaData, error: areaError } = await supabase
        .from("areas")
        .select("*")
        .eq("id", areaId)
        .single();

      if (areaError) throw areaError;
      setArea(areaData);

      // Fetch questions
      const { data: questionsData, error: questionsError } = await supabase
        .from("questions")
        .select("*")
        .eq("area_id", areaId)
        .order("question_order", { ascending: true });

      if (questionsError) throw questionsError;
      setQuestions(questionsData || []);
      const tree = buildQuestionTree(questionsData || []);
      setQuestionTree(tree);

      // Initialize all parent questions as expanded
      const allParentIds = new Set<string>();
      const findParents = (items: Question[]) => {
        items.forEach((item) => {
          if (item.children && item.children.length > 0) {
            allParentIds.add(item.id);
            findParents(item.children);
          }
        });
      };
      findParents(tree);
      setExpandedIds(allParentIds);
    } catch (error) {
      console.error("Error fetching data:", error);
      showToast("Failed to load data", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const expandAll = () => {
    const allParentIds = new Set<string>();
    const findParents = (items: Question[]) => {
      items.forEach((item) => {
        if (item.children && item.children.length > 0) {
          allParentIds.add(item.id);
          findParents(item.children);
        }
      });
    };
    findParents(questionTree);
    setExpandedIds(allParentIds);
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  const openCreateModal = (parentId: string | null = null) => {
    setSelectedQuestion(null);
    setFormData({
      area_id: areaId || "",
      parent_id: parentId,
      question_text: "",
      question_order: getNextOrderNumber(questions, parentId),
      is_required: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (question: Question) => {
    setSelectedQuestion(question);
    setFormData({
      area_id: question.area_id,
      parent_id: question.parent_id,
      question_text: question.question_text,
      question_order: question.question_order,
      is_required: question.is_required,
    });
    setIsModalOpen(true);
  };

  // Check if a question (and its children) has any responses
  const checkQuestionResponses = async (
    questionId: string
  ): Promise<CollegeWithResponses[]> => {
    try {
      // Get all descendant question IDs (including this question)
      const getAllDescendantIds = (qId: string): string[] => {
        const ids = [qId];
        const findChildren = (items: Question[], targetId: string) => {
          items.forEach((item) => {
            if (item.id === targetId && item.children) {
              item.children.forEach((child) => {
                ids.push(child.id);
                findChildren(questionTree, child.id);
              });
            } else if (item.children) {
              findChildren(item.children, targetId);
            }
          });
        };
        findChildren(questionTree, qId);
        return ids;
      };

      const questionIds = getAllDescendantIds(questionId);

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
      console.error("Error checking question responses:", error);
      return [];
    }
  };

  const openDeleteDialog = async (question: Question) => {
    setSelectedQuestion(question);

    // Check for responses before opening delete dialog
    const colleges = await checkQuestionResponses(question.id);
    setCollegesWithResponses(colleges);

    if (colleges.length > 0) {
      setShowResponseWarning(true);
    } else {
      setIsDeleteOpen(true);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!formData.question_text.trim()) {
      showToast("Please enter question text", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      if (selectedQuestion) {
        // Update
        const { error } = await supabase
          .from("questions")
          .update({
            parent_id: formData.parent_id || null,
            question_text: formData.question_text.trim(),
            question_order: formData.question_order,
            is_required: formData.is_required,
          })
          .eq("id", selectedQuestion.id);

        if (error) throw error;
        showToast("Question updated successfully", "success");
      } else {
        // Create
        const { error } = await supabase.from("questions").insert({
          area_id: areaId,
          parent_id: formData.parent_id || null,
          question_text: formData.question_text.trim(),
          question_order: formData.question_order,
          is_required: formData.is_required,
        });

        if (error) throw error;
        showToast("Question created successfully", "success");
      }

      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      console.error("Error saving question:", error);
      showToast("Failed to save question", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedQuestion) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("questions")
        .delete()
        .eq("id", selectedQuestion.id);

      if (error) throw error;
      showToast("Question deleted successfully", "success");
      setIsDeleteOpen(false);
      setShowResponseWarning(false);
      fetchData();
    } catch (error) {
      console.error("Error deleting question:", error);
      showToast("Failed to delete question", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearAllQuestions = async () => {
    if (!user?.email || !areaId) {
      showToast("Unable to clear questions", "error");
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

      // Get all question IDs in this area
      const questionIds = questions.map((q) => q.id);

      if (questionIds.length > 0) {
        // Delete all responses for these questions first
        const { error: responsesError } = await supabase
          .from("responses")
          .delete()
          .in("question_id", questionIds);

        if (responsesError) throw responsesError;
      }

      // Delete all questions in this area
      const { error: questionsError } = await supabase
        .from("questions")
        .delete()
        .eq("area_id", areaId);

      if (questionsError) throw questionsError;

      showToast("All questions have been cleared", "success");
      setShowClearAllModal(false);
      setClearAllPassword("");
      fetchData();
    } catch (error) {
      console.error("Error clearing questions:", error);
      showToast("Failed to clear questions. Please try again.", "error");
    } finally {
      setIsClearingAll(false);
    }
  };

  const toggleActive = async (question: Question) => {
    try {
      // Get all descendant IDs including the question itself
      const getAllDescendantIds = (q: Question): string[] => {
        const ids = [q.id];
        if (q.children?.length) {
          q.children.forEach((child) => {
            ids.push(...getAllDescendantIds(child));
          });
        }
        return ids;
      };

      const questionIds = getAllDescendantIds(question);
      const newStatus = !question.is_active;

      const { error } = await supabase
        .from("questions")
        .update({ is_active: newStatus })
        .in("id", questionIds);

      if (error) throw error;

      const childCount = questionIds.length - 1;
      const message =
        childCount > 0
          ? `Question and ${childCount} sub-question${
              childCount > 1 ? "s" : ""
            } ${newStatus ? "activated" : "deactivated"}`
          : `Question ${newStatus ? "activated" : "deactivated"}`;

      showToast(message, "success");
      fetchData();
    } catch (error) {
      console.error("Error toggling question:", error);
      showToast("Failed to update question status", "error");
    }
  };

  // Count only leaf questions (terminal nodes without children - these are answerable)
  const getLeafCount = (items: Question[]): number => {
    return items.reduce((count, item) => {
      if (item.children && item.children.length > 0) {
        // This is a parent node - don't count it, but count its children
        return count + getLeafCount(item.children);
      } else {
        // This is a leaf node - count it
        return count + 1;
      }
    }, 0);
  };

  // Check if there are any parent questions (for showing expand/collapse all)
  const hasAnyParents = questionTree.some(
    (q) => q.children && q.children.length > 0
  );

  // Get parent question options for selector
  const getParentOptions = () => {
    return getFlatQuestionsForSelector(questionTree, selectedQuestion?.id);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loading size="lg" text="Loading questions..." />
      </div>
    );
  }

  if (!area) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Area not found
        </h2>
        <Link to="/admin/areas">
          <Button>Back to Areas</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <Link
          to="/admin/areas"
          className="inline-flex items-center gap-2 text-gray-500 hover:text-maroon-800 transition-colors mb-4"
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
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Areas
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-maroon-100 text-maroon-800 rounded-xl flex items-center justify-center font-bold text-lg">
              {area.area_number}
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                {area.name}
              </h1>
              <p className="text-gray-600">
                {getLeafCount(questionTree)} answerable question
                {getLeafCount(questionTree) !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasAnyParents && (
              <>
                <Button variant="secondary" size="sm" onClick={expandAll}>
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
                      d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                    />
                  </svg>
                  Expand All
                </Button>
                <Button variant="secondary" size="sm" onClick={collapseAll}>
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
                      d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"
                    />
                  </svg>
                  Collapse All
                </Button>
              </>
            )}
            {questionTree.length > 0 && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowClearAllModal(true)}
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
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                Clear All
              </Button>
            )}
            <Button onClick={() => openCreateModal(null)}>
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
              Add Question
            </Button>
          </div>
        </div>
      </div>

      {/* Questions List */}
      {questionTree.length === 0 ? (
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
              d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No questions yet
          </h3>
          <p className="text-gray-500 mb-6">
            Add evaluation questions for this area.
          </p>
          <Button onClick={() => openCreateModal(null)}>
            Add First Question
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {questionTree.map((question) => (
            <QuestionItem
              key={question.id}
              question={question}
              depth={0}
              expandedIds={expandedIds}
              onToggleExpand={toggleExpand}
              onEdit={openEditModal}
              onDelete={openDeleteDialog}
              onToggleActive={toggleActive}
              onAddSubQuestion={(parentId) => openCreateModal(parentId)}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedQuestion ? "Edit Question" : "Add Question"}
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
              {selectedQuestion ? "Save Changes" : "Add Question"}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Parent Question Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Parent Question (Optional)
            </label>
            <select
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-maroon-500 focus:border-transparent transition-colors"
              value={formData.parent_id || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  parent_id: e.target.value || null,
                  question_order: getNextOrderNumber(
                    questions,
                    e.target.value || null
                  ),
                }))
              }
            >
              <option value="">No parent (root level)</option>
              {getParentOptions().map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Select a parent to create a sub-question
            </p>
          </div>

          <Input
            label="Order Number"
            type="number"
            min={1}
            value={formData.question_order}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                question_order: parseInt(e.target.value) || 1,
              }))
            }
            required
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Question Text
            </label>
            <textarea
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 transition-all duration-200
                text-gray-900 placeholder-gray-400 resize-none
                focus:outline-none focus:ring-2 focus:ring-offset-0 focus:border-maroon-500 focus:ring-maroon-100"
              rows={4}
              placeholder="Enter the evaluation question..."
              value={formData.question_text}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  question_text: e.target.value,
                }))
              }
              required
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_required}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  is_required: e.target.checked,
                }))
              }
              className="w-4 h-4 text-maroon-800 border-gray-300 rounded focus:ring-maroon-500"
            />
            <span className="text-sm text-gray-700">
              Required question (must be answered)
            </span>
          </label>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Question"
        message={
          selectedQuestion?.children && selectedQuestion.children.length > 0
            ? `This question has ${selectedQuestion.children.length} sub-question(s) that will also be deleted. Are you sure?`
            : "Are you sure you want to delete this question? This action cannot be undone."
        }
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
        title="Warning: Question Has Responses"
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
                  This question has responses from colleges
                </h4>
                <p className="text-sm text-amber-700 mt-1">
                  Deleting this question will also permanently delete all
                  responses from the following colleges:
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
            Are you sure you want to delete this question and all its responses?
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

      {/* Clear All Questions Modal */}
      <Modal
        isOpen={showClearAllModal}
        onClose={() => {
          setShowClearAllModal(false);
          setClearAllPassword("");
        }}
        title="Clear All Questions?"
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
                  <li>All {questions.length} questions in this area</li>
                  <li>All responses for these questions</li>
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
              onClick={handleClearAllQuestions}
              isLoading={isClearingAll}
              disabled={!clearAllPassword.trim()}
            >
              Clear All Questions
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

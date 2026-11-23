import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  Button,
  buttonVariants,
  Card,
  ChevronRightIcon,
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
import {
  buildQuestionTree,
  collectAncestorIds,
  collectDescendantIds,
  flattenQuestionTree,
  getLeafQuestions,
  type TreeQuestionNode,
} from "../../lib/questionTree";
import { supabase, supabaseNoPersist } from "../../lib/supabase";
import type { Area, Question, QuestionFormData } from "../../lib/types";

interface CollegeWithResponses {
  id: string;
  name: string;
  code: string | null;
}

interface JoinedResponseRow {
  evaluation_sessions: {
    colleges: CollegeWithResponses | null;
  } | null;
}

function chunkIds(ids: readonly string[], chunkSize = 50): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }
  return chunks;
}

function getNextOrderNumber(
  questions: readonly Question[],
  parentId: string | null,
): number {
  const siblings = questions.filter((q) => q.parent_id === parentId);
  if (siblings.length === 0) return 1;
  return Math.max(...siblings.map((q) => q.question_order)) + 1;
}

function collectParentNodeIds(
  nodes: readonly TreeQuestionNode<Question>[],
): Set<string> {
  const result = new Set<string>();
  const walk = (items: readonly TreeQuestionNode<Question>[]) => {
    items.forEach((item) => {
      if (item.children.length > 0) {
        result.add(item.id);
        walk(item.children);
      }
    });
  };
  walk(nodes);
  return result;
}

interface QuestionItemProps {
  question: TreeQuestionNode<Question>;
  expandedIds: Set<string>;
  togglingIds: Set<string>;
  checkingDeleteId: string | null;
  onToggleExpand: (id: string) => void;
  onEdit: (question: TreeQuestionNode<Question>) => void;
  onDelete: (question: TreeQuestionNode<Question>) => void;
  onToggleActive: (question: TreeQuestionNode<Question>) => void;
  onAddSubQuestion: (parentId: string) => void;
}

function QuestionItem({
  question,
  expandedIds,
  togglingIds,
  checkingDeleteId,
  onToggleExpand,
  onEdit,
  onDelete,
  onToggleActive,
  onAddSubQuestion,
}: QuestionItemProps) {
  const hasChildren = question.children.length > 0;
  const isExpanded = expandedIds.has(question.id);
  const isToggling = togglingIds.has(question.id);
  const isChecking = checkingDeleteId === question.id;

  return (
    <div>
      <Card className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 p-4 sm:p-5">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          {hasChildren && (
            <button
              type="button"
              onClick={() => onToggleExpand(question.id)}
              aria-expanded={isExpanded}
              aria-label={
                isExpanded
                  ? `Collapse sub-questions for item ${question.hierarchical_number}`
                  : `Expand sub-questions for item ${question.hierarchical_number}`
              }
              className="w-11 h-11 -ml-2 -mt-1.5 inline-flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 hover:text-maroon-800 active:scale-[0.97] transition-[background-color,color,transform] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-800 shrink-0"
            >
              <ChevronRightIcon
                className={`w-4 h-4 transition-transform duration-150 ease-out ${
                  isExpanded ? "rotate-90" : ""
                }`}
              />
            </button>
          )}

          <span
            className={`shrink-0 px-2.5 py-1 rounded-lg text-sm font-semibold tabular-nums ${
              question.is_active
                ? "bg-maroon-100 text-maroon-800"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {question.hierarchical_number}
          </span>

          <div className="flex-1 min-w-0">
            <p
              className={`font-medium leading-relaxed max-w-prose ${
                question.is_active ? "text-gray-900" : "text-gray-500"
              }`}
            >
              {question.question_text}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {hasChildren && (
                <span className="px-2 py-0.5 bg-blue-50 text-blue-800 text-xs font-medium rounded-full tabular-nums">
                  {question.children.length} sub-question
                  {question.children.length === 1 ? "" : "s"}
                  {!isExpanded ? " (collapsed)" : ""}
                </span>
              )}
              {question.is_required && (
                <span className="px-2 py-0.5 bg-amber-50 text-amber-800 text-xs font-medium rounded-full border border-amber-200">
                  Required
                </span>
              )}
              {!question.is_active && (
                <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
                  Inactive
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 shrink-0 sm:mt-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onAddSubQuestion(question.id)}
            aria-label={`Add sub-question under ${question.hierarchical_number}`}
            className="w-11 h-11 p-0 text-blue-700 hover:bg-blue-50"
          >
            <PlusIcon className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onToggleActive(question)}
            isLoading={isToggling}
            disabled={isToggling}
            aria-pressed={question.is_active}
            aria-label={
              question.is_active
                ? `Deactivate item ${question.hierarchical_number}`
                : `Activate item ${question.hierarchical_number}`
            }
            className="w-11 h-11 p-0"
          >
            {question.is_active ? (
              <EyeOffIcon className="w-4 h-4 text-gray-600" />
            ) : (
              <EyeIcon className="w-4 h-4 text-emerald-700" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onEdit(question)}
            aria-label={`Edit item ${question.hierarchical_number}`}
            className="w-11 h-11 p-0"
          >
            <EditIcon className="w-4 h-4 text-gray-700" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDelete(question)}
            isLoading={isChecking}
            disabled={checkingDeleteId !== null}
            aria-label={`Delete item ${question.hierarchical_number}`}
            className="w-11 h-11 p-0 text-red-700 hover:bg-red-50"
          >
            <TrashIcon className="w-4 h-4" />
          </Button>
        </div>
      </Card>

      {hasChildren && isExpanded && (
        <div className="mt-2 ml-3 sm:ml-6 border-l-2 border-maroon-200 pl-3 sm:pl-4 space-y-2">
          {question.children.map((child) => (
            <QuestionItem
              key={child.id}
              question={child}
              expandedIds={expandedIds}
              togglingIds={togglingIds}
              checkingDeleteId={checkingDeleteId}
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
  const parentSelectId = useId();

  const [area, setArea] = useState<Area | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionTree, setQuestionTree] = useState<
    TreeQuestionNode<Question>[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] =
    useState<TreeQuestionNode<Question> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkingDeleteId, setCheckingDeleteId] = useState<string | null>(null);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(() => new Set());

  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [clearAllPassword, setClearAllPassword] = useState("");
  const [isClearingAll, setIsClearingAll] = useState(false);

  const [collegesWithResponses, setCollegesWithResponses] = useState<
    CollegeWithResponses[]
  >([]);
  const [showResponseWarning, setShowResponseWarning] = useState(false);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const [formData, setFormData] = useState<QuestionFormData>({
    area_id: areaId || "",
    parent_id: null,
    question_text: "",
    question_order: 1,
    is_required: true,
  });

  const fetchData = useCallback(async () => {
    if (!areaId) return;

    try {
      const [areaRes, questionsRes] = await Promise.all([
        supabase.from("areas").select("*").eq("id", areaId).single(),
        supabase
          .from("questions")
          .select("*")
          .eq("area_id", areaId)
          .order("question_order", { ascending: true }),
      ]);

      if (areaRes.error) throw areaRes.error;
      if (questionsRes.error) throw questionsRes.error;

      const qRows = (questionsRes.data || []) as Question[];
      const tree = buildQuestionTree(qRows);

      setArea(areaRes.data as Area);
      setQuestions(qRows);
      setQuestionTree(tree);
      setExpandedIds(collectParentNodeIds(tree));
    } catch {
      showToast("Failed to load evaluation questions.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [areaId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const activeLeafCount = useMemo(
    () =>
      getLeafQuestions(
        buildQuestionTree(questions.filter((q) => q.is_active)),
      ).length,
    [questions],
  );

  const parentOptions = useMemo(() => {
    const excludedIds = selectedQuestion
      ? new Set(collectDescendantIds(questions, selectedQuestion.id))
      : new Set<string>();

    return flattenQuestionTree(questionTree)
      .filter(({ node }) => !excludedIds.has(node.id))
      .map(({ node, depth }) => {
        const prefix = depth > 0 ? `${"─".repeat(depth)} ` : "";
        const snippet =
          node.question_text.length > 50
            ? `${node.question_text.slice(0, 50)}…`
            : node.question_text;
        return {
          id: node.id,
          label: `${prefix}${node.hierarchical_number} ${snippet}`,
        };
      });
  }, [questionTree, questions, selectedQuestion]);

  const hasAnyParents = useMemo(
    () => questionTree.some((q) => q.children.length > 0),
    [questionTree],
  );

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedIds(collectParentNodeIds(questionTree));
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

  const openEditModal = (question: TreeQuestionNode<Question>) => {
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

  const checkQuestionResponses = async (
    questionId: string,
  ): Promise<CollegeWithResponses[]> => {
    const questionIds = collectDescendantIds(questions, questionId);
    const collegeMap = new Map<string, CollegeWithResponses>();

    for (const batch of chunkIds(questionIds, 50)) {
      const { data, error } = await supabase
        .from("responses")
        .select(
          `
            id,
            evaluation_sessions!inner(
              colleges!inner(id, name, code)
            )
          `,
        )
        .in("question_id", batch);

      if (error) throw error;

      (data as unknown as JoinedResponseRow[] | null)?.forEach((row) => {
        const college = row.evaluation_sessions?.colleges;
        if (college && !collegeMap.has(college.id)) {
          collegeMap.set(college.id, {
            id: college.id,
            name: college.name,
            code: college.code,
          });
        }
      });
    }

    return Array.from(collegeMap.values());
  };

  const openDeleteDialog = async (question: TreeQuestionNode<Question>) => {
    if (checkingDeleteId) return;
    setCheckingDeleteId(question.id);
    setSelectedQuestion(question);

    try {
      const colleges = await checkQuestionResponses(question.id);
      setCollegesWithResponses(colleges);

      if (colleges.length > 0) {
        setShowResponseWarning(true);
      } else {
        setIsDeleteOpen(true);
      }
    } catch {
      showToast(
        "Failed to verify existing responses for this question. Deletion was cancelled.",
        "error",
      );
      setSelectedQuestion(null);
    } finally {
      setCheckingDeleteId(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (
      !Number.isInteger(formData.question_order) ||
      formData.question_order < 1
    ) {
      showToast("Order number must be at least 1.", "error");
      return;
    }

    if (!formData.question_text.trim()) {
      showToast("Please enter question text.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      if (selectedQuestion) {
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
        showToast("Question updated successfully.", "success");
      } else {
        const { error } = await supabase.from("questions").insert({
          area_id: areaId,
          parent_id: formData.parent_id || null,
          question_text: formData.question_text.trim(),
          question_order: formData.question_order,
          is_required: formData.is_required,
        });

        if (error) throw error;
        showToast("Question created successfully.", "success");
      }

      setIsModalOpen(false);
      await fetchData();
    } catch {
      showToast("Failed to save question.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedQuestion || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("questions")
        .delete()
        .eq("id", selectedQuestion.id);

      if (error) throw error;
      showToast("Question deleted successfully.", "success");
      setIsDeleteOpen(false);
      setShowResponseWarning(false);
      setCollegesWithResponses([]);
      await fetchData();
    } catch {
      showToast("Failed to delete question.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearAllQuestions = async (e: FormEvent) => {
    e.preventDefault();
    if (!user?.email || !areaId) {
      showToast("Unable to clear questions.", "error");
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

      // ON DELETE CASCADE on responses(question_id) cleans child responses safely without URL-length overflow
      const { error: questionsError } = await supabase
        .from("questions")
        .delete()
        .eq("area_id", areaId);

      if (questionsError) throw questionsError;

      showToast("All questions in this area have been cleared.", "success");
      setShowClearAllModal(false);
      setClearAllPassword("");
      await fetchData();
    } catch {
      showToast("Failed to clear questions. Please try again.", "error");
    } finally {
      setIsClearingAll(false);
    }
  };

  const toggleActive = async (question: TreeQuestionNode<Question>) => {
    if (togglingIds.has(question.id)) return;
    setTogglingIds((prev) => new Set(prev).add(question.id));

    try {
      const newStatus = !question.is_active;
      const descendantIds = collectDescendantIds(questions, question.id);
      const ancestorIds = newStatus
        ? collectAncestorIds(questions, question.id)
        : [];
      const inactiveAncestorCount = ancestorIds.filter((id) => {
        const row = questions.find((q) => q.id === id);
        return row ? !row.is_active : false;
      }).length;

      const idsToUpdate = Array.from(
        new Set([...descendantIds, ...ancestorIds]),
      );

      for (const batch of chunkIds(idsToUpdate, 50)) {
        const { error } = await supabase
          .from("questions")
          .update({ is_active: newStatus })
          .in("id", batch);

        if (error) throw error;
      }

      const childCount = descendantIds.length - 1;
      let message =
        childCount > 0
          ? `Question and ${childCount} sub-question${childCount > 1 ? "s" : ""} ${newStatus ? "activated" : "deactivated"}.`
          : `Question ${newStatus ? "activated" : "deactivated"}.`;

      if (inactiveAncestorCount > 0) {
        message = `Question reactivated along with ${inactiveAncestorCount} parent group${inactiveAncestorCount > 1 ? "s" : ""}.`;
      }

      showToast(message, "success");
      await fetchData();
    } catch {
      showToast("Failed to update question status.", "error");
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(question.id);
        return next;
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loading size="lg" text="Loading questions…" />
      </div>
    );
  }

  if (!area) {
    return (
      <div className="text-center py-16">
        <h1 className="text-xl font-semibold text-gray-900 mb-4">
          Area not found
        </h1>
        <Link to="/admin/areas" className={buttonVariants({ variant: "primary" })}>
          Back to Areas
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
          className="inline-flex items-center gap-2 min-h-11 -ml-2 px-2 rounded-lg text-gray-600 hover:text-maroon-800 transition-colors duration-150 mb-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-800"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Areas
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 bg-maroon-100 text-maroon-800 rounded-xl flex items-center justify-center font-bold text-lg tabular-nums shrink-0">
              {area.area_number}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 truncate">
                {area.name}
              </h1>
              <p className="text-gray-600 tabular-nums mt-0.5">
                {activeLeafCount} active answerable question
                {activeLeafCount === 1 ? "" : "s"} ({questions.length} total
                items)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasAnyParents && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={expandAll}
                >
                  Expand All
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={collapseAll}
                >
                  Collapse All
                </Button>
              </>
            )}
            {questionTree.length > 0 && (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => setShowClearAllModal(true)}
              >
                <TrashIcon className="w-4 h-4" />
                Clear All
              </Button>
            )}
            <Button type="button" onClick={() => openCreateModal(null)}>
              <PlusIcon className="w-5 h-5" />
              Add Question
            </Button>
          </div>
        </div>
      </div>

      {/* Questions List */}
      {questionTree.length === 0 ? (
        <Card className="text-center py-12">
          <InfoCircleIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h2 className="text-lg font-medium text-gray-900 mb-2">
            No questions yet
          </h2>
          <p className="text-gray-600 max-w-prose mx-auto mb-6">
            Add evaluation questions and hierarchical sub-criteria for this
            area.
          </p>
          <Button type="button" onClick={() => openCreateModal(null)}>
            Add First Question
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {questionTree.map((question) => (
            <QuestionItem
              key={question.id}
              question={question}
              expandedIds={expandedIds}
              togglingIds={togglingIds}
              checkingDeleteId={checkingDeleteId}
              onToggleExpand={toggleExpand}
              onEdit={openEditModal}
              onDelete={openDeleteDialog}
              onToggleActive={(q) => void toggleActive(q)}
              onAddSubQuestion={(parentId) => openCreateModal(parentId)}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        preventClose={isSubmitting}
        onClose={() => setIsModalOpen(false)}
        title={selectedQuestion ? "Edit Question" : "Add Question"}
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
            <Button type="submit" form="question-form" isLoading={isSubmitting}>
              {isSubmitting
                ? "Saving…"
                : selectedQuestion
                  ? "Save Changes"
                  : "Add Question"}
            </Button>
          </>
        }
      >
        <form id="question-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor={parentSelectId}
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              Parent Question (Optional)
            </label>
            <select
              id={parentSelectId}
              disabled={isSubmitting}
              className="w-full min-h-11 px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-maroon-500 focus:border-transparent transition-colors"
              value={formData.parent_id || ""}
              onChange={(e) => {
                const nextParentId = e.target.value || null;
                setFormData((prev) => ({
                  ...prev,
                  parent_id: nextParentId,
                  question_order: getNextOrderNumber(questions, nextParentId),
                }));
              }}
            >
              <option value="">No parent (root level)</option>
              {parentOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-600">
              Select a parent to create or move a sub-question
            </p>
          </div>

          <Input
            label="Order Number"
            type="number"
            min={1}
            value={formData.question_order || ""}
            onChange={(e) => {
              const parsed = Number.parseInt(e.target.value, 10);
              setFormData((prev) => ({
                ...prev,
                question_order: Number.isNaN(parsed) ? 0 : parsed,
              }));
            }}
            required
            disabled={isSubmitting}
          />

          <Textarea
            label="Question Text"
            placeholder="Enter the evaluation question…"
            value={formData.question_text}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                question_text: e.target.value,
              }))
            }
            required
            disabled={isSubmitting}
          />

          <label className="inline-flex items-center gap-3 min-h-11 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_required}
              disabled={isSubmitting}
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
        onConfirm={() => void handleDelete()}
        title="Delete Question"
        message={
          selectedQuestion && selectedQuestion.children.length > 0
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
        preventClose={isSubmitting}
        onClose={() => {
          setShowResponseWarning(false);
          setCollegesWithResponses([]);
        }}
        title="Warning: Question Has Responses"
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
                  This question has responses from colleges
                </h3>
                <p className="text-sm text-amber-800 max-w-prose mt-1">
                  Deleting this question will permanently delete all associated
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
            Are you sure you want to delete this question and all its responses?
          </p>
        </div>
      </Modal>

      {/* Clear All Questions Modal */}
      <Modal
        isOpen={showClearAllModal}
        preventClose={isClearingAll}
        onClose={() => {
          setShowClearAllModal(false);
          setClearAllPassword("");
        }}
        title="Clear All Questions?"
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
              form="clear-questions-form"
              variant="danger"
              isLoading={isClearingAll}
              disabled={!clearAllPassword.trim()}
            >
              {isClearingAll ? "Clearing…" : "Clear All Questions"}
            </Button>
          </>
        }
      >
        <form
          id="clear-questions-form"
          onSubmit={handleClearAllQuestions}
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
                  <li>All {questions.length} questions in this area</li>
                  <li>All recorded responses for these questions</li>
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

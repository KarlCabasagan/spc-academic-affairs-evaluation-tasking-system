import { useEffect, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  useOfflineEvaluation,
  type StoredResponse,
} from "../../hooks/useOfflineEvaluation";
import type { Area, Question, ComplianceStatus } from "../../lib/types";
import { supabase } from "../../lib/supabase";
import {
  Button,
  Card,
  Loading,
  Textarea,
  showToast,
} from "../../components/ui";

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

// Get all leaf questions (for response counting)
function getLeafQuestions(questions: Question[]): Question[] {
  const leaves: Question[] = [];
  const traverse = (items: Question[]) => {
    items.forEach((item) => {
      if (!item.children || item.children.length === 0) {
        leaves.push(item);
      } else {
        traverse(item.children);
      }
    });
  };
  traverse(questions);
  return leaves;
}

// Recursive question component
interface QuestionItemProps {
  question: Question;
  depth: number;
  responses: Map<string, StoredResponse>;
  onStatusChange: (questionId: string, status: ComplianceStatus) => void;
  onCommentChange: (questionId: string, comment: string) => void;
}

function QuestionItem({
  question,
  depth,
  responses,
  onStatusChange,
  onCommentChange,
}: QuestionItemProps) {
  const hasChildren = question.children && question.children.length > 0;
  const response = responses.get(question.id);

  // Calculate responsive indentation (reduced on mobile)
  const effectiveDepth = Math.min(depth, 4);

  // Parent questions (with children) are rendered as description headings
  if (hasChildren) {
    return (
      <div className="space-y-4">
        {/* Section Header */}
        <div
          className={`
            ${depth === 0 ? "mt-6" : "mt-4"}
            relative
          `}
          style={{
            marginLeft: `${Math.min(effectiveDepth, 2) * 8}px`,
            paddingLeft: effectiveDepth > 0 ? "16px" : "0",
          }}
        >
          {/* Vertical connector line */}
          {depth > 0 && (
            <div
              className="absolute left-0 top-0 bottom-0 w-0.5 bg-maroon-200"
              style={{ left: "-1px" }}
            />
          )}

          <div className="flex items-start gap-3 bg-maroon-50/50 rounded-lg p-4 border border-maroon-100">
            <span className="shrink-0 px-3 py-1.5 bg-maroon-600 text-white rounded-lg text-sm font-bold shadow-sm">
              {question.hierarchical_number}
            </span>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-800 text-lg leading-snug">
                {question.question_text}
              </h3>
              <p className="text-sm text-maroon-600 mt-1 font-medium">
                {question.children!.length} sub-item
                {question.children!.length > 1 ? "s" : ""} in this section
              </p>
            </div>
          </div>
        </div>

        {/* Render children */}
        <div
          className="space-y-4 relative"
          style={{
            marginLeft: `${Math.min(effectiveDepth + 1, 3) * 8}px`,
            paddingLeft: "16px",
          }}
        >
          {/* Vertical connector line for children group */}
          <div
            className="absolute left-0 top-0 w-0.5 bg-maroon-200"
            style={{ left: "-1px", bottom: "40px" }}
          />

          {question.children!.map((child) => (
            <QuestionItem
              key={child.id}
              question={child}
              depth={depth + 1}
              responses={responses}
              onStatusChange={onStatusChange}
              onCommentChange={onCommentChange}
            />
          ))}

          {/* End of Section Indicator */}
          <div
            className="flex items-center gap-3 py-3 border-t border-dashed border-gray-300"
            style={{
              marginLeft: "-16px",
              paddingLeft: "16px",
            }}
          >
            <div className="flex-1 h-px bg-linear-to-r from-maroon-200 to-transparent" />
            <span className="text-xs text-gray-400 font-medium whitespace-nowrap">
              End of Section {question.hierarchical_number}
            </span>
            <div className="flex-1 h-px bg-linear-to-l from-maroon-200 to-transparent" />
          </div>
        </div>
      </div>
    );
  }

  // Leaf questions (no children) are interactive
  return (
    <Card
      className={`transition-all duration-200 ${
        response?.answered ? "border-maroon-200 bg-maroon-50/30" : ""
      }`}
      style={{
        marginLeft: depth > 0 ? `${Math.min(effectiveDepth, 3) * 8}px` : "0",
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="shrink-0 w-auto px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium">
          {question.hierarchical_number}
        </div>
        <div className="flex-1">
          <p className="text-gray-900 font-medium mb-4">
            {question.question_text}
            {question.is_required && (
              <span className="text-red-500 ml-1">*</span>
            )}
          </p>

          {/* Response Buttons */}
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 mb-4">
            <button
              onClick={() => onStatusChange(question.id, "complied")}
              className={`
                px-4 py-3 sm:py-2 rounded-lg text-sm font-medium transition-all duration-200
                flex items-center justify-center sm:justify-start gap-2
                ${
                  response?.status === "complied" && response?.answered
                    ? "bg-green-600 text-white ring-2 ring-green-300"
                    : "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                }
              `}
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
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Complied
            </button>
            <button
              onClick={() => onStatusChange(question.id, "not_complied")}
              className={`
                px-4 py-3 sm:py-2 rounded-lg text-sm font-medium transition-all duration-200
                flex items-center justify-center sm:justify-start gap-2
                ${
                  response?.status === "not_complied" && response?.answered
                    ? "bg-red-600 text-white ring-2 ring-red-300"
                    : "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                }
              `}
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              Not Complied
            </button>
            <button
              onClick={() => onStatusChange(question.id, "not_applicable")}
              className={`
                px-4 py-3 sm:py-2 rounded-lg text-sm font-medium transition-all duration-200
                flex items-center justify-center sm:justify-start gap-2
                ${
                  response?.status === "not_applicable" && response?.answered
                    ? "bg-gray-600 text-white ring-2 ring-gray-300"
                    : "bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200"
                }
              `}
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
                  d="M20 12H4"
                />
              </svg>
              Not Applicable
            </button>
          </div>

          {/* Comment Field */}
          <Textarea
            placeholder="Add a comment (optional)..."
            value={response?.comment || ""}
            onChange={(e) => onCommentChange(question.id, e.target.value)}
            className="text-sm"
            rows={2}
          />
        </div>
      </div>
    </Card>
  );
}

export default function Evaluate() {
  const { areaId } = useParams<{ areaId: string }>();
  const {
    isOnline,
    isLoading: isAreasLoading,
    areas,
    fetchAreas,
    fetchQuestions,
    getResponses,
    saveResponses,
    markAreaComplete,
    isAreaCompleted,
    clearAreaResponses,
  } = useOfflineEvaluation();

  const navigate = useNavigate();

  const [area, setArea] = useState<Area | null>(null);
  const [questionTree, setQuestionTree] = useState<Question[]>([]);
  const [leafQuestions, setLeafQuestions] = useState<Question[]>([]);
  const [responses, setResponses] = useState<Map<string, StoredResponse>>(
    new Map(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);

  // Ensure areas are loaded (fetches from Supabase or cache)
  useEffect(() => {
    fetchAreas();
  }, [fetchAreas]);

  // Load area data once areas are available
  useEffect(() => {
    if (areaId && !isAreasLoading) {
      loadAreaData();
    }
  }, [areaId, isAreasLoading, areas]);

  const loadAreaData = async () => {
    if (!areaId) return;

    setIsLoading(true);
    try {
      // Find area from cached areas (offline-safe)
      let areaData = areas.find((a) => a.id === areaId);

      // If not in cache and online, try fetching fresh
      if (!areaData && isOnline) {
        const { data } = await supabase
          .from("areas")
          .select("*")
          .eq("id", areaId)
          .eq("is_active", true)
          .single();
        areaData = data;
      }

      if (!areaData) throw new Error("Area not found");
      setArea(areaData);

      // Fetch questions (with offline support)
      const questionsData = await fetchQuestions(areaId);

      // Build tree and get leaves
      const tree = buildQuestionTree(questionsData);
      setQuestionTree(tree);
      const leaves = getLeafQuestions(tree);
      setLeafQuestions(leaves);

      // Load saved responses from localStorage
      const savedResponses = getResponses(areaId);
      const responsesMap = new Map<string, StoredResponse>();

      // Initialize all leaf questions
      leaves.forEach((q) => {
        const saved = savedResponses[q.id];
        if (saved) {
          responsesMap.set(q.id, saved);
        } else {
          responsesMap.set(q.id, {
            questionId: q.id,
            status: "not_applicable",
            comment: "",
            answered: false,
          });
        }
      });
      setResponses(responsesMap);

      // Check if this area is already completed
      setIsCompleted(isAreaCompleted(areaId));
    } catch (err) {
      setError(
        "Failed to load evaluation. The area may not exist or is unavailable.",
      );
      console.error("Error fetching data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-save responses to localStorage whenever they change
  const saveCurrentResponses = useCallback(() => {
    if (!areaId) return;
    const responsesObj: { [key: string]: StoredResponse } = {};
    responses.forEach((value, key) => {
      responsesObj[key] = value;
    });
    saveResponses(areaId, responsesObj);
  }, [areaId, responses, saveResponses]);

  // Debounced save on response change
  useEffect(() => {
    if (responses.size > 0) {
      const timer = setTimeout(saveCurrentResponses, 500);
      return () => clearTimeout(timer);
    }
  }, [responses, saveCurrentResponses]);

  const handleStatusChange = (questionId: string, status: ComplianceStatus) => {
    setResponses((prev) => {
      const newMap = new Map(prev);
      const current = newMap.get(questionId);
      if (current) {
        newMap.set(questionId, { ...current, status, answered: true });
      }
      return newMap;
    });
  };

  const handleCommentChange = (questionId: string, comment: string) => {
    setResponses((prev) => {
      const newMap = new Map(prev);
      const current = newMap.get(questionId);
      if (current) {
        newMap.set(questionId, { ...current, comment });
      }
      return newMap;
    });
  };

  const getAnsweredCount = () => {
    return Array.from(responses.values()).filter((r) => r.answered).length;
  };

  const getRequiredUnanswered = () => {
    return leafQuestions.filter(
      (q) => q.is_required && !responses.get(q.id)?.answered,
    );
  };

  const handleMarkComplete = () => {
    if (!areaId) return;

    const requiredUnanswered = getRequiredUnanswered();
    if (requiredUnanswered.length > 0) {
      showToast(
        `Please answer all required questions (${requiredUnanswered.length} remaining)`,
        "error",
      );
      return;
    }

    // Save final responses
    saveCurrentResponses();

    // Mark area as complete
    markAreaComplete(areaId);
    setIsCompleted(true);

    showToast(
      isCompleted
        ? "Responses updated successfully!"
        : "Area marked as complete!",
      "success",
    );

    // Redirect back to area list
    navigate("/public");
  };

  const handleClearResponses = () => {
    if (!areaId) return;

    clearAreaResponses(areaId);

    // Reset local state
    const newResponses = new Map<string, StoredResponse>();
    leafQuestions.forEach((q) => {
      newResponses.set(q.id, {
        questionId: q.id,
        status: "not_applicable",
        comment: "",
        answered: false,
      });
    });
    setResponses(newResponses);
    setIsCompleted(false);

    showToast("Responses cleared for this area", "success");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loading size="lg" text="Loading evaluation questions..." />
      </div>
    );
  }

  if (error || !area) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <svg
            className="w-12 h-12 text-red-500 mx-auto mb-4"
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
          <h2 className="text-lg font-semibold text-red-800 mb-2">
            Evaluation Not Found
          </h2>
          <p className="text-red-600 mb-6">{error}</p>
          <Link to="/">
            <Button>Return to Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-24">
      {/* Offline Indicator */}
      {!isOnline && (
        <div className="bg-amber-100 border-b border-amber-200 px-4 py-2 text-center">
          <p className="text-sm text-amber-800">
            <span className="font-medium">Offline Mode:</span> Your responses
            are saved locally.
          </p>
        </div>
      )}

      {/* Area Header */}
      <div className="bg-linear-to-r from-maroon-800 to-maroon-900 text-white py-8 sm:py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            to="/public"
            className="inline-flex items-center gap-2 text-maroon-200 hover:text-white transition-colors mb-4"
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
          <div className="flex items-start gap-4">
            <div
              className={`shrink-0 w-14 h-14 rounded-xl flex items-center justify-center font-bold text-2xl ${
                isCompleted ? "bg-green-500/20" : "bg-white/10"
              }`}
            >
              {isCompleted ? (
                <svg
                  className="w-8 h-8"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                area.area_number
              )}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-bold">
                  Area {area.area_number}: {area.name}
                </h1>
                {isCompleted && (
                  <span className="px-2 py-1 bg-green-500/20 text-green-200 text-sm font-medium rounded-full">
                    Completed
                  </span>
                )}
              </div>
              {area.description && (
                <p className="text-maroon-100 mt-2">{area.description}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Progress: {getAnsweredCount()} of {leafQuestions.length} answered
            </span>
            <span className="text-sm text-gray-500">
              {Math.round(
                (getAnsweredCount() / Math.max(leafQuestions.length, 1)) * 100,
              )}
              %
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-maroon-800 transition-all duration-300 rounded-full"
              style={{
                width: `${
                  (getAnsweredCount() / Math.max(leafQuestions.length, 1)) * 100
                }%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Questions */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 overflow-x-hidden">
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
            <p className="text-gray-500">
              No evaluation questions have been added for this area yet.
            </p>
            <Link to="/" className="mt-4 inline-block">
              <Button variant="secondary">Choose Another Area</Button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-4">
            {questionTree.map((question) => (
              <QuestionItem
                key={question.id}
                question={question}
                depth={0}
                responses={responses}
                onStatusChange={handleStatusChange}
                onCommentChange={handleCommentChange}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      {leafQuestions.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-30">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearResponses}
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
                  Clear
                </Button>
                <div className="text-sm text-gray-600">
                  {getRequiredUnanswered().length > 0 ? (
                    <span className="text-amber-600">
                      {getRequiredUnanswered().length} required remaining
                    </span>
                  ) : (
                    <span className="text-green-600">
                      All required answered ✓
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {isCompleted && (
                  <Link to="/public/export">
                    <Button variant="secondary" size="lg">
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
                          d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      Export
                    </Button>
                  </Link>
                )}
                <Button size="lg" onClick={handleMarkComplete}>
                  {isCompleted ? "Update Response" : "Mark Complete"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../../lib/supabase";
import type {
  Area,
  Question,
  ComplianceStatus,
  ResponseFormData,
  College,
} from "../../lib/types";
import {
  Button,
  Card,
  Input,
  Loading,
  Textarea,
  showToast,
} from "../../components/ui";

interface QuestionResponse extends ResponseFormData {
  answered: boolean;
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
  responses: Map<string, QuestionResponse>;
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
  // Desktop: 16px per level (max 4 levels = 64px)
  // Mobile: 8px per level (max 2 levels = 16px)
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

          {question.children!.map((child, index) => (
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
            <div className="flex-1 h-px bg-gradient-to-r from-maroon-200 to-transparent" />
            <span className="text-xs text-gray-400 font-medium whitespace-nowrap">
              End of Section {question.hierarchical_number}
            </span>
            <div className="flex-1 h-px bg-gradient-to-l from-maroon-200 to-transparent" />
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

          {/* Response Buttons - Stack on mobile for better touch targets */}
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
  const navigate = useNavigate();

  const [area, setArea] = useState<Area | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionTree, setQuestionTree] = useState<Question[]>([]);
  const [leafQuestions, setLeafQuestions] = useState<Question[]>([]);
  const [responses, setResponses] = useState<Map<string, QuestionResponse>>(
    new Map()
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guest identification
  const [colleges, setColleges] = useState<College[]>([]);
  const [guestName, setGuestName] = useState("");
  const [collegeId, setCollegeId] = useState("");

  useEffect(() => {
    if (areaId) {
      fetchAreaAndQuestions();
      fetchColleges();
    }
  }, [areaId]);

  const fetchColleges = async () => {
    try {
      const { data, error } = await supabase
        .from("colleges")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) throw error;
      setColleges(data || []);
    } catch (err) {
      console.error("Error fetching colleges:", err);
    }
  };

  const fetchAreaAndQuestions = async () => {
    try {
      // Fetch area
      const { data: areaData, error: areaError } = await supabase
        .from("areas")
        .select("*")
        .eq("id", areaId)
        .eq("is_active", true)
        .single();

      if (areaError) throw areaError;
      if (!areaData) throw new Error("Area not found");

      setArea(areaData);

      // Fetch questions
      const { data: questionsData, error: questionsError } = await supabase
        .from("questions")
        .select("*")
        .eq("area_id", areaId)
        .eq("is_active", true)
        .order("question_order", { ascending: true });

      if (questionsError) throw questionsError;
      setQuestions(questionsData || []);

      // Build tree and get leaves
      const tree = buildQuestionTree(questionsData || []);
      setQuestionTree(tree);
      const leaves = getLeafQuestions(tree);
      setLeafQuestions(leaves);

      // Initialize responses map for leaf questions only
      const initialResponses = new Map<string, QuestionResponse>();
      leaves.forEach((q) => {
        initialResponses.set(q.id, {
          question_id: q.id,
          status: "not_applicable",
          comment: "",
          answered: false,
        });
      });
      setResponses(initialResponses);
    } catch (err) {
      setError(
        "Failed to load evaluation. The area may not exist or is unavailable."
      );
      console.error("Error fetching data:", err);
    } finally {
      setIsLoading(false);
    }
  };

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
      (q) => q.is_required && !responses.get(q.id)?.answered
    );
  };

  const handleSubmit = async () => {
    // Validate guest info
    if (!guestName.trim()) {
      showToast("Please enter your full name", "error");
      return;
    }
    if (!collegeId) {
      showToast("Please select your college", "error");
      return;
    }

    const requiredUnanswered = getRequiredUnanswered();
    if (requiredUnanswered.length > 0) {
      showToast(
        `Please answer all required questions (${requiredUnanswered.length} remaining)`,
        "error"
      );
      return;
    }

    setIsSubmitting(true);
    try {
      // Create session with guest info
      const sessionToken = uuidv4();
      const { data: sessionData, error: sessionError } = await supabase
        .from("evaluation_sessions")
        .insert({
          session_token: sessionToken,
          guest_name: guestName.trim(),
          college_id: collegeId,
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      // Insert responses (only leaf questions with answers)
      const responsesToInsert = Array.from(responses.entries())
        .filter(([, r]) => r.answered)
        .map(([, r]) => ({
          session_id: sessionData.id,
          question_id: r.question_id,
          status: r.status,
          comment: r.comment || null,
        }));

      if (responsesToInsert.length > 0) {
        const { error: responsesError } = await supabase
          .from("responses")
          .insert(responsesToInsert);

        if (responsesError) throw responsesError;
      }

      // Mark session as complete
      await supabase
        .from("evaluation_sessions")
        .update({ is_complete: true, completed_at: new Date().toISOString() })
        .eq("id", sessionData.id);

      navigate("/complete", { state: { areaName: area?.name } });
    } catch (err) {
      console.error("Error submitting evaluation:", err);
      showToast("Failed to submit evaluation. Please try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
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
      {/* Area Header */}
      <div className="bg-linear-to-r from-maroon-800 to-maroon-900 text-white py-8 sm:py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
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
            <div className="shrink-0 w-14 h-14 bg-white/10 rounded-xl flex items-center justify-center font-bold text-2xl">
              {area.area_number}
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">
                Area {area.area_number}: {area.name}
              </h1>
              {area.description && (
                <p className="text-maroon-100">{area.description}</p>
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
                (getAnsweredCount() / Math.max(leafQuestions.length, 1)) * 100
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

      {/* Guest Information */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <Card className="mb-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 bg-maroon-100 text-maroon-800 rounded-lg flex items-center justify-center shrink-0">
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
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Your Information</h2>
              <p className="text-sm text-gray-500">
                Please provide your details before answering the evaluation
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Full Name"
              placeholder="Enter your full name"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              required
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                College <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-maroon-500 focus:border-transparent transition-colors"
                value={collegeId}
                onChange={(e) => setCollegeId(e.target.value)}
                required
              >
                <option value="">Select your college</option>
                {colleges.map((college) => (
                  <option key={college.id} value={college.id}>
                    {college.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>
      </div>

      {/* Questions */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 overflow-x-hidden">
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

      {/* Submit Footer */}
      {leafQuestions.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-30">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm text-gray-600">
                {getRequiredUnanswered().length > 0 ? (
                  <span className="text-amber-600">
                    {getRequiredUnanswered().length} required question(s)
                    remaining
                  </span>
                ) : (
                  <span className="text-green-600">
                    All required questions answered ✓
                  </span>
                )}
              </div>
              <Button
                size="lg"
                onClick={handleSubmit}
                isLoading={isSubmitting}
                disabled={getRequiredUnanswered().length > 0}
              >
                Submit Evaluation
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

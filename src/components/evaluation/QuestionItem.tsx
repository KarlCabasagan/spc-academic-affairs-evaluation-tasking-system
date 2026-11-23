import type { TreeQuestionNode } from "../../lib/questionTree";
import type { ComplianceStatus, Question } from "../../lib/types";
import { Card, CheckIcon, CloseIcon, MinusIcon, Textarea } from "../ui";

export interface QuestionResponseValue {
  status: ComplianceStatus;
  comment: string;
  answered?: boolean;
}

interface QuestionItemProps {
  question: TreeQuestionNode<Question>;
  responses: ReadonlyMap<string, QuestionResponseValue>;
  onStatusChange: (questionId: string, status: ComplianceStatus) => void;
  onCommentChange: (questionId: string, comment: string) => void;
  onCommentBlur?: (questionId: string) => void;
  disabled?: boolean;
}

const STATUS_OPTIONS: readonly {
  value: ComplianceStatus;
  label: string;
  activeClass: string;
  inactiveClass: string;
}[] = [
  {
    value: "complied",
    label: "Complied",
    activeClass: "bg-emerald-700 text-white border-emerald-700 shadow-sm",
    inactiveClass:
      "bg-white text-gray-700 border-gray-300 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-900",
  },
  {
    value: "not_complied",
    label: "Not Complied",
    activeClass: "bg-red-700 text-white border-red-700 shadow-sm",
    inactiveClass:
      "bg-white text-gray-700 border-gray-300 hover:border-red-400 hover:bg-red-50 hover:text-red-900",
  },
  {
    value: "not_applicable",
    label: "Not Applicable",
    activeClass: "bg-gray-700 text-white border-gray-700 shadow-sm",
    inactiveClass:
      "bg-white text-gray-700 border-gray-300 hover:border-gray-400 hover:bg-gray-100 hover:text-gray-900",
  },
];

function StatusOptionIcon({ status }: { status: ComplianceStatus }) {
  if (status === "complied") return <CheckIcon className="w-4 h-4 shrink-0" />;
  if (status === "not_complied")
    return <CloseIcon className="w-4 h-4 shrink-0" />;
  return <MinusIcon className="w-4 h-4 shrink-0" />;
}

export default function QuestionItem({
  question,
  responses,
  onStatusChange,
  onCommentChange,
  onCommentBlur,
  disabled = false,
}: QuestionItemProps) {
  const hasChildren = question.children.length > 0;

  if (hasChildren) {
    return (
      <section className="space-y-3">
        <div className="flex items-start gap-2.5 pt-2">
          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-maroon-50 text-maroon-800 border border-maroon-200 text-xs sm:text-sm font-semibold tabular-nums shrink-0">
            {question.hierarchical_number}
          </span>
          <h3 className="text-base font-semibold text-gray-900 leading-snug max-w-prose">
            {question.question_text}
          </h3>
        </div>

        <div className="space-y-3 border-l-2 border-gray-200 pl-3 sm:pl-5">
          {question.children.map((child) => (
            <QuestionItem
              key={child.id}
              question={child}
              responses={responses}
              onStatusChange={onStatusChange}
              onCommentChange={onCommentChange}
              onCommentBlur={onCommentBlur}
              disabled={disabled}
            />
          ))}
        </div>
      </section>
    );
  }

  const currentResponse = responses.get(question.id);
  const isAnswered = currentResponse ? (currentResponse.answered ?? true) : false;
  const activeStatus = isAnswered ? currentResponse?.status : undefined;
  const commentValue = currentResponse?.comment ?? "";

  return (
    <Card className="p-4 sm:p-5 border border-gray-200">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-gray-100 text-gray-800 text-xs sm:text-sm font-semibold tabular-nums shrink-0">
            {question.hierarchical_number}
          </span>
          <p className="text-sm sm:text-base font-medium text-gray-900 leading-relaxed max-w-prose">
            {question.question_text}
          </p>
        </div>

        {question.is_required && (
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
            Required
          </span>
        )}
      </div>

      <div
        role="group"
        aria-label={`Compliance rating for item ${question.hierarchical_number}`}
        className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-4"
      >
        {STATUS_OPTIONS.map((option) => {
          const isSelected = activeStatus === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              onClick={() => onStatusChange(question.id, option.value)}
              className={`min-h-11 px-3.5 py-2.5 rounded-lg border text-sm font-medium inline-flex items-center justify-center gap-2 transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[0.97] disabled:active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-maroon-800 ${
                isSelected ? option.activeClass : option.inactiveClass
              }`}
            >
              <StatusOptionIcon status={option.value} />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3.5">
        <Textarea
          rows={2}
          aria-label={`Remarks or evidence notes for item ${question.hierarchical_number}`}
          placeholder="Add optional remarks, evidence, or observations…"
          value={commentValue}
          onChange={(e) => onCommentChange(question.id, e.target.value)}
          onBlur={onCommentBlur ? () => onCommentBlur(question.id) : undefined}
          disabled={disabled}
          className="text-sm"
        />
      </div>
    </Card>
  );
}

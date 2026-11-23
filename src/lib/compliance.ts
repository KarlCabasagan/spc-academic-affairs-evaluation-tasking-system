import type { ComplianceStatus } from "./types.ts";
import {
  buildQuestionTree,
  type TreeQuestionInput,
} from "./questionTree.ts";

export type ComplianceDisplayState =
  | "no_questions"
  | "no_response"
  | "all_na"
  | "percentage";

export type ComplianceTone = "neutral" | "good" | "warning" | "critical";

export interface ResponseRecord {
  question_id: string;
  status: ComplianceStatus;
  comment?: string | null;
}

export interface SessionWithResponses {
  id: string;
  college_id: string | null;
  completed_at?: string | null;
  started_at?: string | null;
  is_complete?: boolean;
  responses: ResponseRecord[] | null;
}

export interface AreaComplianceResult {
  compliance: number | null;
  displayState: ComplianceDisplayState;
  compliedCount: number;
  notCompliedCount: number;
  notApplicableCount: number;
  answeredCount: number;
  totalLeaves: number;
}

export interface QuestionComplianceInput extends TreeQuestionInput {
  question_text: string;
}

export interface QuestionComplianceNode {
  id: string;
  questionText: string;
  hierarchicalNumber: string;
  response: {
    status: ComplianceStatus;
    comment: string | null;
  } | null;
  compliance: number | null;
  displayState: ComplianceDisplayState;
  compliedCount: number;
  notCompliedCount: number;
  notApplicableCount: number;
  answeredCount: number;
  totalLeaves: number;
  children: QuestionComplianceNode[];
}

export const COMPLIANCE_TONE_CLASSES: Record<
  ComplianceTone,
  { text: string; bg: string; badgeBg: string; bar: string; dot: string }
> = {
  good: {
    text: "text-emerald-700",
    bg: "bg-emerald-50",
    badgeBg: "bg-emerald-100",
    bar: "bg-emerald-600",
    dot: "bg-emerald-600",
  },
  warning: {
    text: "text-amber-800",
    bg: "bg-amber-50",
    badgeBg: "bg-amber-100",
    bar: "bg-amber-600",
    dot: "bg-amber-600",
  },
  critical: {
    text: "text-red-700",
    bg: "bg-red-50",
    badgeBg: "bg-red-100",
    bar: "bg-red-600",
    dot: "bg-red-600",
  },
  neutral: {
    text: "text-gray-700",
    bg: "bg-gray-50",
    badgeBg: "bg-gray-100",
    bar: "bg-gray-400",
    dot: "bg-gray-400",
  },
};

export function getComplianceTone(compliance: number | null): ComplianceTone {
  if (compliance === null || Number.isNaN(compliance)) return "neutral";
  if (compliance >= 80) return "good";
  if (compliance >= 50) return "warning";
  return "critical";
}

function resolveDisplayState(
  totalLeaves: number,
  answeredCount: number,
  compliedCount: number,
  notCompliedCount: number,
): { compliance: number | null; displayState: ComplianceDisplayState } {
  if (totalLeaves === 0) {
    return { compliance: null, displayState: "no_questions" };
  }
  if (answeredCount === 0) {
    return { compliance: null, displayState: "no_response" };
  }
  const applicable = compliedCount + notCompliedCount;
  if (applicable === 0) {
    return { compliance: null, displayState: "all_na" };
  }
  return {
    compliance: (compliedCount / applicable) * 100,
    displayState: "percentage",
  };
}

/**
 * Single Source of Truth (SSOT):
 * Sort completed sessions newest-first and retain only the latest session's
 * responses per (college_id, area_id) pair in O(n).
 */
export function selectLatestSessionsByArea(
  sessions: readonly SessionWithResponses[],
  questionAreaMap: ReadonlyMap<string, string>,
): Map<string, Map<string, Map<string, ResponseRecord>>> {
  const sorted = [...sessions]
    .filter((s) => s.is_complete !== false && s.college_id)
    .sort((a, b) => {
      const timeA = Date.parse(a.completed_at || a.started_at || "") || 0;
      const timeB = Date.parse(b.completed_at || b.started_at || "") || 0;
      return timeB - timeA;
    });

  const result = new Map<string, Map<string, Map<string, ResponseRecord>>>();

  for (const session of sorted) {
    const collegeId = session.college_id!;
    if (!session.responses || session.responses.length === 0) continue;

    let collegeAreas = result.get(collegeId);
    if (!collegeAreas) {
      collegeAreas = new Map();
      result.set(collegeId, collegeAreas);
    }

    const sessionByArea = new Map<string, ResponseRecord[]>();
    for (const r of session.responses) {
      const areaId = questionAreaMap.get(r.question_id);
      if (!areaId) continue;
      const list = sessionByArea.get(areaId);
      if (list) {
        list.push(r);
      } else {
        sessionByArea.set(areaId, [r]);
      }
    }

    for (const [areaId, areaResponses] of sessionByArea.entries()) {
      // Skip if a newer session already claimed this (college, area)
      if (collegeAreas.has(areaId)) continue;
      const byQuestion = new Map<string, ResponseRecord>();
      for (const r of areaResponses) {
        byQuestion.set(r.question_id, r);
      }
      collegeAreas.set(areaId, byQuestion);
    }
  }

  return result;
}

/**
 * Calculate area compliance directly from active leaf questions and responses.
 */
export function calculateAreaCompliance(
  activeLeaves: readonly { id: string }[],
  responseByQuestionId: ReadonlyMap<string, Pick<ResponseRecord, "status">>,
): AreaComplianceResult {
  const totalLeaves = activeLeaves.length;
  let compliedCount = 0;
  let notCompliedCount = 0;
  let notApplicableCount = 0;
  let answeredCount = 0;

  for (const leaf of activeLeaves) {
    const r = responseByQuestionId.get(leaf.id);
    if (!r) continue;
    answeredCount++;
    if (r.status === "complied") compliedCount++;
    else if (r.status === "not_complied") notCompliedCount++;
    else if (r.status === "not_applicable") notApplicableCount++;
  }

  const { compliance, displayState } = resolveDisplayState(
    totalLeaves,
    answeredCount,
    compliedCount,
    notCompliedCount,
  );

  return {
    compliance,
    displayState,
    compliedCount,
    notCompliedCount,
    notApplicableCount,
    answeredCount,
    totalLeaves,
  };
}

/**
 * Build a hierarchical question compliance tree where parent compliance rolls up
 * exact leaf counts bottom-up so parent/area percentages match flat leaf ratios.
 */
export function buildQuestionComplianceTree<T extends QuestionComplianceInput>(
  questions: readonly T[],
  responseByQuestionId: ReadonlyMap<string, ResponseRecord>,
): QuestionComplianceNode[] {
  const tree = buildQuestionTree(questions);

  const convertNode = (
    node: ReturnType<typeof buildQuestionTree<T>>[number],
  ): QuestionComplianceNode => {
    const children = node.children.map(convertNode);
    const isLeaf = children.length === 0;
    const rawResponse = responseByQuestionId.get(node.id);

    if (isLeaf) {
      let compliedCount = 0;
      let notCompliedCount = 0;
      let notApplicableCount = 0;
      let answeredCount = 0;

      if (rawResponse) {
        answeredCount = 1;
        if (rawResponse.status === "complied") compliedCount = 1;
        else if (rawResponse.status === "not_complied") notCompliedCount = 1;
        else if (rawResponse.status === "not_applicable") notApplicableCount = 1;
      }

      const { compliance, displayState } = resolveDisplayState(
        1,
        answeredCount,
        compliedCount,
        notCompliedCount,
      );

      return {
        id: node.id,
        questionText: node.question_text,
        hierarchicalNumber: node.hierarchical_number,
        response: rawResponse
          ? { status: rawResponse.status, comment: rawResponse.comment ?? null }
          : null,
        compliance,
        displayState,
        compliedCount,
        notCompliedCount,
        notApplicableCount,
        answeredCount,
        totalLeaves: 1,
        children: [],
      };
    }

    let compliedCount = 0;
    let notCompliedCount = 0;
    let notApplicableCount = 0;
    let answeredCount = 0;
    let totalLeaves = 0;

    for (const child of children) {
      compliedCount += child.compliedCount;
      notCompliedCount += child.notCompliedCount;
      notApplicableCount += child.notApplicableCount;
      answeredCount += child.answeredCount;
      totalLeaves += child.totalLeaves;
    }

    const { compliance, displayState } = resolveDisplayState(
      totalLeaves,
      answeredCount,
      compliedCount,
      notCompliedCount,
    );

    return {
      id: node.id,
      questionText: node.question_text,
      hierarchicalNumber: node.hierarchical_number,
      response: null,
      compliance,
      displayState,
      compliedCount,
      notCompliedCount,
      notApplicableCount,
      answeredCount,
      totalLeaves,
      children,
    };
  };

  return tree.map(convertNode);
}

/**
 * Average non-null area compliance percentages across evaluated applicable areas.
 */
export function calculateOverallCompliance(
  areaCompliances: readonly (number | null)[],
): number | null {
  const valid = areaCompliances.filter(
    (c): c is number => c !== null && !Number.isNaN(c),
  );
  if (valid.length === 0) return null;
  return valid.reduce((sum, c) => sum + c, 0) / valid.length;
}

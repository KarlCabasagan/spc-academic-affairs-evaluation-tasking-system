import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { Area, College, ComplianceStatus } from "../../lib/types";
import * as XLSX from "xlsx";
import { Button, Card, Loading, showToast } from "../../components/ui";

interface QuestionData {
  id: string;
  area_id: string;
  parent_id: string | null;
  question_text: string;
  question_order: number;
}

// Response data for detailed export
interface DetailedResponse {
  question_id: string;
  status: ComplianceStatus;
  comment: string | null;
}

interface CollegeDetailedData {
  college: College;
  areas: {
    area: Area;
    questions: QuestionData[];
    responses: Map<string, DetailedResponse>;
  }[];
}

// Basic question data for matrix (without text)
interface BasicQuestionData {
  id: string;
  area_id: string;
  parent_id: string | null;
}

// Display state for a cell - matches Responses.tsx logic
type CellDisplayState = "no_questions" | "all_na" | "no_response" | "normal";

interface MatrixCell {
  complied: number;
  notComplied: number;
  notApplicable: number;
  compliance: number | null; // Percentage excluding N/A
  total: number;
  hasQuestions: boolean;
  displayState: CellDisplayState;
}

interface MatrixRow {
  area: Area;
  hasQuestions: boolean;
  collegeData: Record<string, MatrixCell>;
}

export default function Reports() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [matrixData, setMatrixData] = useState<MatrixRow[]>([]);
  const [collegeTotals, setCollegeTotals] = useState<
    Record<string, MatrixCell>
  >({});
  const [isLoading, setIsLoading] = useState(true);

  // Detailed data for export
  const [collegeDetailedData, setCollegeDetailedData] = useState<
    CollegeDetailedData[]
  >([]);

  useEffect(() => {
    fetchData();

    // Set up real-time subscriptions
    const sessionsChannel = supabase
      .channel("reports-sessions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "evaluation_sessions" },
        () => {
          fetchData();
        },
      )
      .subscribe();

    const responsesChannel = supabase
      .channel("reports-responses")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "responses" },
        () => {
          fetchData();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sessionsChannel);
      supabase.removeChannel(responsesChannel);
    };
  }, []);

  const fetchData = async () => {
    try {
      // Fetch areas
      const { data: areasData, error: areasError } = await supabase
        .from("areas")
        .select("*")
        .eq("is_active", true)
        .order("area_number", { ascending: true });

      if (areasError) throw areasError;
      setAreas(areasData || []);

      // Fetch colleges
      const { data: collegesData, error: collegesError } = await supabase
        .from("colleges")
        .select("*")
        .eq("is_active", true)
        .order("code", { ascending: true });

      if (collegesError) throw collegesError;
      setColleges(collegesData || []);

      // Fetch all questions with text and order for detailed export
      const { data: questionsDataFull, error: questionsError } = await supabase
        .from("questions")
        .select("id, area_id, parent_id, question_text, question_order")
        .eq("is_active", true)
        .order("question_order", { ascending: true });

      if (questionsError) throw questionsError;

      // Fetch all completed sessions with responses including comments for SSOT
      const { data: sessionsData, error: sessionsError } = await supabase
        .from("evaluation_sessions")
        .select(
          `
          id,
          college_id,
          completed_at,
          responses (
            question_id,
            status,
            comment
          )
        `,
        )
        .eq("is_complete", true)
        .order("completed_at", { ascending: false }); // Most recent first

      if (sessionsError) throw sessionsError;

      // Build matrix with SSOT (basic question data for matrix)
      const basicQuestionsData = (questionsDataFull || []).map((q) => ({
        id: q.id,
        area_id: q.area_id,
        parent_id: q.parent_id,
      }));

      buildMatrixWithSSOT(
        areasData || [],
        collegesData || [],
        basicQuestionsData,
        sessionsData || [],
      );

      // Build college detailed data for export
      buildCollegeDetailedData(
        areasData || [],
        collegesData || [],
        questionsDataFull || [],
        sessionsData || [],
      );
    } catch (error) {
      console.error("Error fetching data:", error);
      showToast("Failed to load report data", "error");
    } finally {
      setIsLoading(false);
    }
  };

  interface SessionWithResponses {
    id: string;
    college_id: string | null;
    completed_at: string | null;
    responses: { question_id: string; status: ComplianceStatus }[] | null;
  }

  const buildMatrixWithSSOT = (
    areasData: Area[],
    collegesData: College[],
    questionsData: BasicQuestionData[],
    sessionsData: SessionWithResponses[],
  ) => {
    // Create question -> area mapping
    const questionAreaMap = new Map<string, string>();
    questionsData.forEach((q) => {
      questionAreaMap.set(q.id, q.area_id);
    });

    // Identify leaf questions (questions that don't have children)
    const parentIds = new Set(
      questionsData.map((q) => q.parent_id).filter(Boolean),
    );
    const leafQuestionIds = new Set(
      questionsData.filter((q) => !parentIds.has(q.id)).map((q) => q.id),
    );

    // Count leaf questions per area
    const leafQuestionsPerArea = new Map<string, number>();
    questionsData.forEach((q) => {
      if (leafQuestionIds.has(q.id)) {
        const count = leafQuestionsPerArea.get(q.area_id) || 0;
        leafQuestionsPerArea.set(q.area_id, count + 1);
      }
    });

    // Initialize matrix
    const matrix: MatrixRow[] = areasData.map((area) => {
      const hasQuestions = (leafQuestionsPerArea.get(area.id) || 0) > 0;
      const collegeData: Record<string, MatrixCell> = {};
      collegesData.forEach((college) => {
        collegeData[college.id] = {
          complied: 0,
          notComplied: 0,
          notApplicable: 0,
          compliance: null,
          total: 0,
          hasQuestions,
          displayState: hasQuestions ? "no_response" : "no_questions",
        };
      });
      return { area, hasQuestions, collegeData };
    });

    // SSOT: For each college + area pair, track which we've already processed
    // Sessions are ordered most-recent-first, so first seen = most recent
    const processedCollegeAreas = new Map<string, Set<string>>(); // college_id -> Set<area_id>

    sessionsData.forEach((session) => {
      if (!session.college_id || !session.responses) return;

      // Get or create the processed areas set for this college
      let processedAreas = processedCollegeAreas.get(session.college_id);
      if (!processedAreas) {
        processedAreas = new Set();
        processedCollegeAreas.set(session.college_id, processedAreas);
      }

      // Group this session's responses by area (only leaf questions)
      const responsesByArea = new Map<
        string,
        { question_id: string; status: ComplianceStatus }[]
      >();
      session.responses.forEach((r) => {
        // Only count leaf question responses
        if (!leafQuestionIds.has(r.question_id)) return;

        const areaId = questionAreaMap.get(r.question_id);
        if (areaId) {
          const existing = responsesByArea.get(areaId) || [];
          existing.push(r);
          responsesByArea.set(areaId, existing);
        }
      });

      // For each area in this session, if not yet processed for this college, use these responses
      responsesByArea.forEach((responses, areaId) => {
        if (!processedAreas!.has(areaId)) {
          processedAreas!.add(areaId);

          // Find matrix row for this area
          const matrixRow = matrix.find((r) => r.area.id === areaId);
          if (!matrixRow || !matrixRow.collegeData[session.college_id!]) return;

          const cell = matrixRow.collegeData[session.college_id!];

          // Count responses
          responses.forEach((r) => {
            cell.total++;
            switch (r.status) {
              case "complied":
                cell.complied++;
                break;
              case "not_complied":
                cell.notComplied++;
                break;
              case "not_applicable":
                cell.notApplicable++;
                break;
            }
          });
        }
      });
    });

    // Calculate compliance percentages and display states
    matrix.forEach((row) => {
      Object.values(row.collegeData).forEach((cell) => {
        if (!cell.hasQuestions) {
          // Area has no questions
          cell.displayState = "no_questions";
          cell.compliance = null;
        } else if (cell.total === 0) {
          // Area has questions but no responses from this college
          cell.displayState = "no_response";
          cell.compliance = 0; // Show 0% for areas with questions but no responses
        } else {
          const denominator = cell.complied + cell.notComplied;
          if (denominator === 0 && cell.notApplicable > 0) {
            // All responses are N/A
            cell.displayState = "all_na";
            cell.compliance = null;
          } else if (denominator > 0) {
            // Normal case with valid responses
            cell.displayState = "normal";
            cell.compliance = (cell.complied / denominator) * 100;
          } else {
            // Edge case: has responses but no valid denominator
            cell.displayState = "no_response";
            cell.compliance = 0;
          }
        }
      });
    });

    // Calculate college totals - EXCLUDE areas without questions AND areas where all responses are N/A
    const totals: Record<string, MatrixCell> = {};
    collegesData.forEach((college) => {
      let totalComplied = 0;
      let totalNotComplied = 0;
      let totalNotApplicable = 0;
      let totalResponses = 0;
      let includedAreaCount = 0;
      let complianceSum = 0;

      matrix.forEach((row) => {
        const cell = row.collegeData[college.id];
        if (cell) {
          // Only include areas that have questions and are not all N/A
          if (
            cell.hasQuestions &&
            cell.displayState !== "all_na" &&
            cell.displayState !== "no_questions"
          ) {
            totalComplied += cell.complied;
            totalNotComplied += cell.notComplied;
            totalNotApplicable += cell.notApplicable;
            totalResponses += cell.total;

            // For averaging by area (matching Responses.tsx logic)
            if (cell.compliance !== null) {
              complianceSum += cell.compliance;
              includedAreaCount++;
            }
          }
        }
      });

      // Calculate overall compliance as average of area compliances (matching Responses.tsx)
      const overallCompliance =
        includedAreaCount > 0 ? complianceSum / includedAreaCount : null;

      totals[college.id] = {
        complied: totalComplied,
        notComplied: totalNotComplied,
        notApplicable: totalNotApplicable,
        compliance: overallCompliance,
        total: totalResponses,
        hasQuestions: true,
        displayState: overallCompliance !== null ? "normal" : "no_response",
      };
    });

    setMatrixData(matrix);
    setCollegeTotals(totals);
  };

  // Build detailed data structure for per-college export sheets
  interface SessionWithDetailedResponses {
    id: string;
    college_id: string | null;
    completed_at: string | null;
    responses:
      | {
          question_id: string;
          status: ComplianceStatus;
          comment: string | null;
        }[]
      | null;
  }

  const buildCollegeDetailedData = (
    areasData: Area[],
    collegesData: College[],
    questionsDataFull: QuestionData[],
    sessionsData: SessionWithDetailedResponses[],
  ) => {
    // Group questions by area
    const questionsByArea = new Map<string, QuestionData[]>();
    questionsDataFull.forEach((q) => {
      const existing = questionsByArea.get(q.area_id) || [];
      existing.push(q);
      questionsByArea.set(q.area_id, existing);
    });

    // SSOT: For each college, use the most recent session's responses per area
    const processedCollegeAreas = new Map<string, Set<string>>();

    const collegeResponses = new Map<
      string,
      Map<string, Map<string, DetailedResponse>>
    >();
    // collegeId -> areaId -> questionId -> response

    sessionsData.forEach((session) => {
      if (!session.college_id || !session.responses) return;

      let processedAreas = processedCollegeAreas.get(session.college_id);
      if (!processedAreas) {
        processedAreas = new Set();
        processedCollegeAreas.set(session.college_id, processedAreas);
      }

      // Determine which areas this session covers
      const areasInSession = new Set<string>();
      session.responses.forEach((r) => {
        const question = questionsDataFull.find((q) => q.id === r.question_id);
        if (question) {
          areasInSession.add(question.area_id);
        }
      });

      // For each area in this session, if not yet processed for this college, use these responses
      areasInSession.forEach((areaId) => {
        if (!processedAreas!.has(areaId)) {
          processedAreas!.add(areaId);

          // Initialize maps if needed
          if (!collegeResponses.has(session.college_id!)) {
            collegeResponses.set(session.college_id!, new Map());
          }
          const collegeAreaMap = collegeResponses.get(session.college_id!)!;
          if (!collegeAreaMap.has(areaId)) {
            collegeAreaMap.set(areaId, new Map());
          }
          const responseMap = collegeAreaMap.get(areaId)!;

          // Add responses for this area
          session.responses!.forEach((r) => {
            const question = questionsDataFull.find(
              (q) => q.id === r.question_id,
            );
            if (question && question.area_id === areaId) {
              responseMap.set(r.question_id, {
                question_id: r.question_id,
                status: r.status,
                comment: r.comment,
              });
            }
          });
        }
      });
    });

    // Build the final CollegeDetailedData structure
    const detailedData: CollegeDetailedData[] = collegesData.map((college) => {
      const collegeAreaResponses =
        collegeResponses.get(college.id) || new Map();

      const areasDataForCollege = areasData.map((area) => ({
        area,
        questions: questionsByArea.get(area.id) || [],
        responses:
          collegeAreaResponses.get(area.id) ||
          new Map<string, DetailedResponse>(),
      }));

      return {
        college,
        areas: areasDataForCollege,
      };
    });

    setCollegeDetailedData(detailedData);
  };

  const getComplianceColor = (compliance: number | null): string => {
    if (compliance === null) return "text-gray-400";
    if (compliance >= 80) return "text-emerald-600";
    if (compliance >= 50) return "text-amber-600";
    return "text-red-600";
  };

  const getComplianceBg = (compliance: number | null): string => {
    if (compliance === null) return "bg-gray-50";
    if (compliance >= 80) return "bg-emerald-50";
    if (compliance >= 50) return "bg-amber-50";
    return "bg-red-50";
  };

  const getCellDisplay = (cell: MatrixCell): string => {
    switch (cell.displayState) {
      case "no_questions":
        return "—";
      case "all_na":
        return "N/A";
      case "no_response":
        return "0.0%";
      case "normal":
        return cell.compliance !== null
          ? `${cell.compliance.toFixed(1)}%`
          : "—";
      default:
        return "—";
    }
  };

  const exportToExcel = () => {
    if (matrixData.length === 0) {
      showToast("No data to export", "error");
      return;
    }

    // Create workbook
    const wb = XLSX.utils.book_new();

    // ========================================
    // SHEET 1: Compliance Matrix
    // ========================================
    const headers = ["Area", ...colleges.map((c) => c.code || c.name)];

    const rows = matrixData.map((row) => {
      const dataRow: (string | number)[] = [
        `Area ${row.area.area_number}: ${row.area.name}`,
      ];
      colleges.forEach((college) => {
        const cell = row.collegeData[college.id];
        dataRow.push(getCellDisplay(cell));
      });
      return dataRow;
    });

    // Add totals row
    const totalsRow: (string | number)[] = ["Total Compliance"];
    colleges.forEach((college) => {
      const total = collegeTotals[college.id];
      totalsRow.push(
        total?.compliance !== null ? `${total.compliance.toFixed(1)}%` : "N/A",
      );
    });
    rows.push(totalsRow);

    const wsMatrix = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    wsMatrix["!cols"] = [{ wch: 40 }, ...colleges.map(() => ({ wch: 15 }))];
    XLSX.utils.book_append_sheet(wb, wsMatrix, "Compliance Matrix");

    // ========================================
    // SHEETS 2+: Per-College Detail Sheets
    // ========================================

    // Helper to flatten tree with numbers
    const flattenTree = (
      questions: QuestionData[],
    ): {
      question: QuestionData;
      hierarchicalNumber: string;
      isLeaf: boolean;
    }[] => {
      const questionMap = new Map<
        string,
        QuestionData & { children?: QuestionData[] }
      >();
      const roots: (QuestionData & { children?: QuestionData[] })[] = [];

      questions.forEach((q) => {
        questionMap.set(q.id, { ...q, children: [] });
      });

      questions.forEach((q) => {
        const question = questionMap.get(q.id)!;
        if (q.parent_id && questionMap.has(q.parent_id)) {
          const parent = questionMap.get(q.parent_id)!;
          parent.children!.push(question);
        } else {
          roots.push(question);
        }
      });

      // Sort
      const sortRecursive = (
        items: (QuestionData & { children?: QuestionData[] })[],
      ) => {
        items.sort((a, b) => a.question_order - b.question_order);
        items.forEach((item) => {
          if (item.children && item.children.length > 0) {
            sortRecursive(item.children);
          }
        });
      };
      sortRecursive(roots);

      // Flatten
      const result: {
        question: QuestionData;
        hierarchicalNumber: string;
        isLeaf: boolean;
      }[] = [];
      const flatten = (
        items: (QuestionData & { children?: QuestionData[] })[],
        prefix: string = "",
      ) => {
        items.forEach((item, index) => {
          const num = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
          const isLeaf = !item.children || item.children.length === 0;
          result.push({ question: item, hierarchicalNumber: num, isLeaf });
          if (item.children && item.children.length > 0) {
            flatten(item.children, num);
          }
        });
      };
      flatten(roots);
      return result;
    };

    collegeDetailedData.forEach((collegeData) => {
      const detailRows: (string | number)[][] = [];
      const detailHeaders = ["Area", "Question", "Response", "Comment"];

      collegeData.areas.forEach((areaData, areaIndex) => {
        if (areaData.questions.length === 0) return;

        const flatQuestions = flattenTree(areaData.questions);

        // Track complied/not-complied for compliance calc
        let complied = 0;
        let notComplied = 0;

        flatQuestions.forEach((item, qIndex) => {
          const response = areaData.responses.get(item.question.id);

          // Only leaf questions have actual responses
          let statusText = "";
          if (item.isLeaf) {
            if (!response) {
              statusText = "No Response";
            } else if (response.status === "complied") {
              statusText = "Complied";
              complied++;
            } else if (response.status === "not_complied") {
              statusText = "Not Complied";
              notComplied++;
            } else {
              statusText = "N/A";
            }
          }

          // Area name only on first question of area
          const areaName =
            qIndex === 0
              ? `Area ${areaData.area.area_number}: ${areaData.area.name}`
              : "";

          detailRows.push([
            areaName,
            `${item.hierarchicalNumber} ${item.question.question_text}`,
            statusText,
            item.isLeaf ? response?.comment || "" : "",
          ]);
        });

        // Add area compliance row
        const validResponses = complied + notComplied;
        const areaCompliance =
          validResponses > 0
            ? ((complied / validResponses) * 100).toFixed(1) + "%"
            : "N/A";
        detailRows.push([
          `Area ${areaData.area.area_number} Compliance`,
          "",
          areaCompliance,
          "",
        ]);

        // Blank row between areas
        if (areaIndex < collegeData.areas.length - 1) {
          detailRows.push(["", "", "", ""]);
        }
      });

      // Only create sheet if there's data
      if (detailRows.length > 0) {
        const wsDetail = XLSX.utils.aoa_to_sheet([
          detailHeaders,
          ...detailRows,
        ]);
        wsDetail["!cols"] = [
          { wch: 35 },
          { wch: 60 },
          { wch: 15 },
          { wch: 40 },
        ];

        // Sheet name max 31 chars
        const sheetName = (
          collegeData.college.code || collegeData.college.name
        ).substring(0, 31);
        XLSX.utils.book_append_sheet(wb, wsDetail, sheetName);
      }
    });

    XLSX.writeFile(
      wb,
      `compliance_report_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
    showToast("Report exported successfully", "success");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loading size="lg" text="Loading compliance matrix..." />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Compliance Matrix
          </h1>
          <p className="text-gray-600 mt-1">
            Cross-tabular view of PACUCOA Areas vs Colleges
          </p>
        </div>
        <Button onClick={exportToExcel}>
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
          Export Excel
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <Card>
          <div className="text-center">
            <p className="text-3xl font-bold text-maroon-800">{areas.length}</p>
            <p className="text-sm text-gray-500">PACUCOA Areas</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-3xl font-bold text-maroon-800">
              {colleges.length}
            </p>
            <p className="text-sm text-gray-500">Active Colleges</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-3xl font-bold text-maroon-800">
              {Object.values(collegeTotals).reduce(
                (sum, t) => sum + t.total,
                0,
              )}
            </p>
            <p className="text-sm text-gray-500">Total Responses</p>
          </div>
        </Card>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-6 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-emerald-500" />
          <span className="text-gray-600">≥80% Compliant</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-amber-500" />
          <span className="text-gray-600">50-79% Compliant</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-gray-600">&lt;50% Compliant</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-gray-300" />
          <span className="text-gray-600">No Data / N/A</span>
        </div>
      </div>

      {/* N/A Exclusion Note */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
        <div className="flex items-start gap-2">
          <svg
            className="w-4 h-4 text-blue-600 shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm text-blue-800">
            <strong>Scoring Logic:</strong> Compliance percentages exclude "Not
            Applicable" (N/A) responses from the denominator. Areas without
            questions show "—", areas where all responses are N/A show "N/A",
            and areas with no responses show "0%".
          </p>
        </div>
      </div>

      {/* Matrix Table */}
      {colleges.length === 0 || areas.length === 0 ? (
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
              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No data available
          </h3>
          <p className="text-gray-500">
            Add areas and colleges to see the compliance matrix
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              {/* Header */}
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider sticky left-0 bg-gray-50 z-10 min-w-[200px]">
                    PACUCOA Area
                  </th>
                  {colleges.map((college) => (
                    <th
                      key={college.id}
                      className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider min-w-[100px]"
                      title={college.name}
                    >
                      {college.code || college.name}
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Body */}
              <tbody className="divide-y divide-gray-100">
                {matrixData.map((row, index) => (
                  <tr
                    key={row.area.id}
                    className={index % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
                  >
                    <td className="px-4 py-3 text-sm sticky left-0 z-10 bg-inherit">
                      <span className="font-semibold text-gray-900">
                        Area {row.area.area_number}:
                      </span>{" "}
                      <span className="text-gray-700">{row.area.name}</span>
                      {!row.hasQuestions && (
                        <span className="ml-2 text-xs text-gray-400">
                          (no questions)
                        </span>
                      )}
                    </td>
                    {colleges.map((college) => {
                      const cell = row.collegeData[college.id];
                      const displayValue = getCellDisplay(cell);
                      const bgClass =
                        cell.displayState === "all_na" ||
                        cell.displayState === "no_questions"
                          ? "bg-gray-50"
                          : getComplianceBg(cell.compliance);
                      const textClass =
                        cell.displayState === "all_na" ||
                        cell.displayState === "no_questions"
                          ? "text-gray-400"
                          : getComplianceColor(cell.compliance);

                      return (
                        <td
                          key={college.id}
                          className={`px-4 py-3 text-center text-sm font-medium ${bgClass}`}
                          title={`Complied: ${
                            cell?.complied || 0
                          }, Not Complied: ${cell?.notComplied || 0}, N/A: ${
                            cell?.notApplicable || 0
                          }`}
                        >
                          <span className={textClass}>{displayValue}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>

              {/* Footer - Totals */}
              <tfoot>
                <tr className="bg-maroon-50 border-t-2 border-maroon-200">
                  <td className="px-4 py-3 text-sm font-bold text-maroon-900 sticky left-0 bg-maroon-50 z-10">
                    Total Compliance
                  </td>
                  {colleges.map((college) => {
                    const total = collegeTotals[college.id];
                    return (
                      <td
                        key={college.id}
                        className="px-4 py-3 text-center text-sm font-bold"
                        title={`Complied: ${
                          total?.complied || 0
                        }, Not Complied: ${total?.notComplied || 0}, N/A: ${
                          total?.notApplicable || 0
                        }`}
                      >
                        <span className={getComplianceColor(total?.compliance)}>
                          {total?.compliance !== null
                            ? `${total.compliance.toFixed(1)}%`
                            : "—"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

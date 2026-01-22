import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import type { Area, College, ComplianceStatus } from "../../lib/types";
import * as XLSX from "xlsx";
import { Button, Card, Loading, showToast } from "../../components/ui";

// Basic question data for matrix
interface BasicQuestionData {
  id: string;
  area_id: string;
  parent_id: string | null;
}

// Display state for a cell
type CellDisplayState = "no_questions" | "all_na" | "no_response" | "normal";

interface MatrixCell {
  complied: number;
  notComplied: number;
  notApplicable: number;
  compliance: number | null;
  total: number;
  hasQuestions: boolean;
  displayState: CellDisplayState;
}

interface MatrixRow {
  area: Area;
  hasQuestions: boolean;
  collegeData: Record<string, MatrixCell>;
}

export default function ComplianceMatrix() {
  const { college: currentCollege } = useAuth();
  const [areas, setAreas] = useState<Area[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [matrixData, setMatrixData] = useState<MatrixRow[]>([]);
  const [collegeTotals, setCollegeTotals] = useState<
    Record<string, MatrixCell>
  >({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();

    // Set up real-time subscriptions
    const sessionsChannel = supabase
      .channel("college-matrix-sessions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "evaluation_sessions" },
        () => {
          fetchData();
        },
      )
      .subscribe();

    const responsesChannel = supabase
      .channel("college-matrix-responses")
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

      // Fetch all questions
      const { data: questionsData, error: questionsError } = await supabase
        .from("questions")
        .select("id, area_id, parent_id")
        .eq("is_active", true);

      if (questionsError) throw questionsError;

      // Fetch all completed sessions with responses
      const { data: sessionsData, error: sessionsError } = await supabase
        .from("evaluation_sessions")
        .select(
          `
          id,
          college_id,
          completed_at,
          responses (
            question_id,
            status
          )
        `,
        )
        .eq("is_complete", true)
        .order("completed_at", { ascending: false });

      if (sessionsError) throw sessionsError;

      // Build matrix
      buildMatrix(
        areasData || [],
        collegesData || [],
        questionsData || [],
        sessionsData || [],
      );
    } catch (error) {
      console.error("Error fetching data:", error);
      showToast("Failed to load compliance matrix", "error");
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

  const buildMatrix = (
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

    // Identify leaf questions
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

    // SSOT: track processed college-area pairs
    const processedCollegeAreas = new Map<string, Set<string>>();

    sessionsData.forEach((session) => {
      if (!session.college_id || !session.responses) return;

      let processedAreas = processedCollegeAreas.get(session.college_id);
      if (!processedAreas) {
        processedAreas = new Set();
        processedCollegeAreas.set(session.college_id, processedAreas);
      }

      // Group responses by area
      const responsesByArea = new Map<
        string,
        { question_id: string; status: ComplianceStatus }[]
      >();
      session.responses.forEach((r) => {
        if (!leafQuestionIds.has(r.question_id)) return;

        const areaId = questionAreaMap.get(r.question_id);
        if (areaId) {
          const existing = responsesByArea.get(areaId) || [];
          existing.push(r);
          responsesByArea.set(areaId, existing);
        }
      });

      // Process each area
      responsesByArea.forEach((responses, areaId) => {
        if (!processedAreas!.has(areaId)) {
          processedAreas!.add(areaId);

          const matrixRow = matrix.find((r) => r.area.id === areaId);
          if (!matrixRow || !matrixRow.collegeData[session.college_id!]) return;

          const cell = matrixRow.collegeData[session.college_id!];

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

    // Calculate compliance percentages
    matrix.forEach((row) => {
      Object.values(row.collegeData).forEach((cell) => {
        if (!cell.hasQuestions) {
          cell.displayState = "no_questions";
          cell.compliance = null;
        } else if (cell.total === 0) {
          cell.displayState = "no_response";
          cell.compliance = 0;
        } else {
          const denominator = cell.complied + cell.notComplied;
          if (denominator === 0 && cell.notApplicable > 0) {
            cell.displayState = "all_na";
            cell.compliance = null;
          } else if (denominator > 0) {
            cell.displayState = "normal";
            cell.compliance = (cell.complied / denominator) * 100;
          } else {
            cell.displayState = "no_response";
            cell.compliance = 0;
          }
        }
      });
    });

    // Calculate college totals
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
          if (
            cell.hasQuestions &&
            cell.displayState !== "all_na" &&
            cell.displayState !== "no_questions"
          ) {
            totalComplied += cell.complied;
            totalNotComplied += cell.notComplied;
            totalNotApplicable += cell.notApplicable;
            totalResponses += cell.total;

            if (cell.compliance !== null) {
              complianceSum += cell.compliance;
              includedAreaCount++;
            }
          }
        }
      });

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

    const wb = XLSX.utils.book_new();

    // Compliance Matrix sheet
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

    XLSX.writeFile(
      wb,
      `compliance_comparison_${new Date().toISOString().split("T")[0]}.xlsx`,
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
            Compliance Comparison
          </h1>
          <p className="text-gray-600 mt-1">
            Compare compliance across all colleges by area
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

      {/* Matrix Table */}
      {matrixData.length === 0 || colleges.length === 0 ? (
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
              d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No data available
          </h3>
          <p className="text-gray-500">
            Compliance data will appear once colleges submit evaluations.
          </p>
        </Card>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-900 sticky left-0 bg-gray-50 z-10 min-w-[200px]">
                    Area
                  </th>
                  {colleges.map((college) => (
                    <th
                      key={college.id}
                      className={`text-center py-3 px-4 font-semibold min-w-[100px] ${
                        currentCollege?.id === college.id
                          ? "bg-maroon-50 text-maroon-800"
                          : "text-gray-900"
                      }`}
                    >
                      {college.code || college.name}
                      {currentCollege?.id === college.id && (
                        <span className="block text-xs font-normal text-maroon-600">
                          (You)
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixData.map((row, index) => (
                  <tr
                    key={row.area.id}
                    className={`border-b border-gray-100 ${
                      index % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                    }`}
                  >
                    <td className="py-3 px-4 font-medium text-gray-900 sticky left-0 bg-inherit z-10">
                      Area {row.area.area_number}: {row.area.name}
                    </td>
                    {colleges.map((college) => {
                      const cell = row.collegeData[college.id];
                      const isCurrentCollege =
                        currentCollege?.id === college.id;
                      return (
                        <td
                          key={college.id}
                          className={`text-center py-3 px-4 ${getComplianceBg(
                            cell.compliance,
                          )} ${isCurrentCollege ? "ring-2 ring-maroon-200 ring-inset" : ""}`}
                        >
                          <span
                            className={`font-medium ${getComplianceColor(
                              cell.compliance,
                            )}`}
                          >
                            {getCellDisplay(cell)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {/* Totals Row */}
                <tr className="bg-gray-100 border-t-2 border-gray-300 font-semibold">
                  <td className="py-3 px-4 text-gray-900 sticky left-0 bg-gray-100 z-10">
                    Overall Compliance
                  </td>
                  {colleges.map((college) => {
                    const total = collegeTotals[college.id];
                    const isCurrentCollege = currentCollege?.id === college.id;
                    return (
                      <td
                        key={college.id}
                        className={`text-center py-3 px-4 ${getComplianceBg(
                          total?.compliance,
                        )} ${isCurrentCollege ? "ring-2 ring-maroon-200 ring-inset" : ""}`}
                      >
                        <span
                          className={`font-bold ${getComplianceColor(
                            total?.compliance,
                          )}`}
                        >
                          {total?.compliance !== null
                            ? `${total.compliance.toFixed(1)}%`
                            : "—"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

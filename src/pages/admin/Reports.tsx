import { useCallback, useEffect, useRef, useState } from "react";
import ComplianceMatrixTable, {
  type MatrixColumn,
  type MatrixRow,
  type MatrixRowCell,
} from "../../components/compliance/ComplianceMatrixTable";
import {
  AlertCircleIcon,
  Button,
  Card,
  DownloadIcon,
  InfoCircleIcon,
  Loading,
  showToast,
} from "../../components/ui";
import {
  buildQuestionComplianceTree,
  calculateAreaCompliance,
  calculateOverallCompliance,
  selectLatestSessionsByArea,
  type SessionWithResponses,
} from "../../lib/compliance";
import {
  type ComplianceWorkbookDetailArea,
  type ComplianceWorkbookDetailSheet,
  exportComplianceWorkbook,
  localDateStamp,
} from "../../lib/excelExport";
import { buildQuestionTree, getLeafQuestions } from "../../lib/questionTree";
import { supabase } from "../../lib/supabase";
import type { Area, College } from "../../lib/types";

interface QuestionRow {
  id: string;
  area_id: string;
  parent_id: string | null;
  question_text: string;
  question_order: number;
}

interface ReportState {
  areaCount: number;
  collegeCount: number;
  totalLatestResponses: number;
  columns: MatrixColumn[];
  rows: MatrixRow[];
  detailSheets: ComplianceWorkbookDetailSheet[];
}

export default function Reports() {
  const [reportState, setReportState] = useState<ReportState>({
    areaCount: 0,
    collegeCount: 0,
    totalLatestResponses: 0,
    columns: [],
    rows: [],
    detailSheets: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIdRef = useRef(0);

  const fetchReportData = useCallback(async () => {
    const currentFetchId = ++fetchIdRef.current;

    try {
      const [areasRes, collegesRes, questionsRes, sessionsRes] =
        await Promise.all([
          supabase
            .from("areas")
            .select("*")
            .eq("is_active", true)
            .order("area_number", { ascending: true }),
          supabase
            .from("colleges")
            .select("*")
            .eq("is_active", true)
            .order("code", { ascending: true }),
          supabase
            .from("questions")
            .select("id, area_id, parent_id, question_text, question_order")
            .eq("is_active", true)
            .order("question_order", { ascending: true }),
          supabase
            .from("evaluation_sessions")
            .select(
              "id, college_id, completed_at, is_complete, responses(question_id, status, comment)",
            )
            .eq("is_complete", true)
            .order("completed_at", { ascending: false }),
        ]);

      if (areasRes.error) throw areasRes.error;
      if (collegesRes.error) throw collegesRes.error;
      if (questionsRes.error) throw questionsRes.error;
      if (sessionsRes.error) throw sessionsRes.error;

      if (currentFetchId !== fetchIdRef.current) return;

      const areasData = (areasRes.data || []) as Area[];
      const collegesData = (collegesRes.data || []) as College[];
      const questionsData = (questionsRes.data || []) as QuestionRow[];
      const sessionsData = (sessionsRes.data || []) as SessionWithResponses[];

      const activeAreaIds = new Set(areasData.map((a) => a.id));
      const questionsByArea = new Map<string, QuestionRow[]>();
      const questionAreaMap = new Map<string, string>();

      questionsData.forEach((q) => {
        if (!activeAreaIds.has(q.area_id)) return;
        questionAreaMap.set(q.id, q.area_id);
        const list = questionsByArea.get(q.area_id) || [];
        list.push(q);
        questionsByArea.set(q.area_id, list);
      });

      const leavesByArea = new Map<
        string,
        ReturnType<typeof getLeafQuestions<QuestionRow>>
      >();
      areasData.forEach((area) => {
        const areaQs = questionsByArea.get(area.id) || [];
        leavesByArea.set(area.id, getLeafQuestions(buildQuestionTree(areaQs)));
      });

      const latestByCollege = selectLatestSessionsByArea(
        sessionsData,
        questionAreaMap,
      );

      let totalLatestResponses = 0;

      const rows: MatrixRow[] = areasData.map((area) => {
        const leaves = leavesByArea.get(area.id) || [];
        const cells: Record<string, MatrixRowCell> = {};

        collegesData.forEach((col) => {
          const respMap = latestByCollege.get(col.id)?.get(area.id) ?? new Map();
          totalLatestResponses += respMap.size;
          const stats = calculateAreaCompliance(leaves, respMap);
          cells[col.id] = {
            displayState: stats.displayState,
            compliance: stats.compliance,
          };
        });

        return {
          id: area.id,
          areaNumber: area.area_number,
          areaLabel: `Area ${area.area_number}`,
          areaName: area.name,
          cells,
        };
      });

      const columns: MatrixColumn[] = collegesData.map((col) => ({
        id: col.id,
        label: col.code || col.name,
        subLabel: col.code ? col.name : null,
        overallCompliance: calculateOverallCompliance(
          rows.map((row) => {
            const cell = row.cells[col.id];
            return cell?.displayState === "percentage" ? cell.compliance : null;
          }),
        ),
      }));

      const detailSheets: ComplianceWorkbookDetailSheet[] = collegesData.map(
        (col) => {
          const detailAreas: ComplianceWorkbookDetailArea[] = areasData.map(
            (area) => {
              const areaQuestions = questionsByArea.get(area.id) || [];
              const leaves = leavesByArea.get(area.id) || [];
              const respMap =
                latestByCollege.get(col.id)?.get(area.id) ?? new Map();
              const stats = calculateAreaCompliance(leaves, respMap);
              const tree = buildQuestionComplianceTree(areaQuestions, respMap);

              return {
                areaNumber: area.area_number,
                areaName: area.name,
                compliance: stats.compliance,
                displayState: stats.displayState,
                questions: tree,
              };
            },
          );

          return {
            sheetLabel: col.code || col.name,
            areas: detailAreas,
          };
        },
      );

      setReportState({
        areaCount: areasData.length,
        collegeCount: collegesData.length,
        totalLatestResponses,
        columns,
        rows,
        detailSheets,
      });
      setError(null);
    } catch {
      if (currentFetchId === fetchIdRef.current) {
        setError("Failed to load report data.");
        showToast("Failed to load report data.", "error");
      }
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchReportData();

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void fetchReportData();
      }, 500);
    };

    const channel = supabase
      .channel("admin-reports-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "evaluation_sessions" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "responses" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "colleges" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "areas" },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [fetchReportData]);

  const handleExportExcel = async () => {
    if (
      reportState.columns.length === 0 ||
      reportState.rows.length === 0 ||
      isExporting
    ) {
      showToast("No compliance data available to export.", "error");
      return;
    }

    setIsExporting(true);
    try {
      await exportComplianceWorkbook({
        filenameBase: `PACUCOA_Compliance_Report_${localDateStamp()}`,
        matrixColumns: reportState.columns.map((c) => ({
          id: c.id,
          label: c.label,
          overallCompliance: c.overallCompliance,
        })),
        matrixRows: reportState.rows.map((r) => ({
          areaLabel: r.areaName ? `${r.areaLabel}: ${r.areaName}` : r.areaLabel,
          cells: r.cells,
        })),
        detailSheets: reportState.detailSheets,
      });
      showToast("Excel report exported successfully.", "success");
    } catch {
      showToast("Failed to export report.", "error");
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loading size="lg" text="Generating compliance report…" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Compliance Reports
          </h1>
          <p className="text-gray-600 max-w-prose mt-1">
            Cross-tabular compliance matrix across active areas and colleges.
          </p>
        </div>

        <Button
          type="button"
          onClick={() => void handleExportExcel()}
          isLoading={isExporting}
          disabled={
            reportState.columns.length === 0 || reportState.rows.length === 0
          }
        >
          <DownloadIcon className="w-4 h-4" />
          {isExporting ? "Exporting…" : "Export to Excel"}
        </Button>
      </div>

      {error && (
        <Card className="p-4 mb-6 border border-red-200 bg-red-50/70">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-sm text-red-800">
              <AlertCircleIcon className="w-5 h-5 text-red-600 shrink-0" />
              <span role="alert">{error}</span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setIsLoading(true);
                void fetchReportData();
              }}
            >
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Card>
          <div className="text-center">
            <p className="text-3xl font-bold text-maroon-800 tabular-nums">
              {reportState.areaCount}
            </p>
            <p className="text-sm text-gray-600 mt-1">Active Areas</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-3xl font-bold text-maroon-800 tabular-nums">
              {reportState.collegeCount}
            </p>
            <p className="text-sm text-gray-600 mt-1">Active Colleges</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-3xl font-bold text-maroon-800 tabular-nums">
              {reportState.totalLatestResponses.toLocaleString()}
            </p>
            <p className="text-sm text-gray-600 mt-1">Latest Responses</p>
          </div>
        </Card>
      </div>

      {/* Scoring Logic Note */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3.5 mb-6">
        <div className="flex items-start gap-2.5">
          <InfoCircleIcon className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-900 max-w-prose">
            <strong>Scoring Logic:</strong> Compliance percentages divide{" "}
            <em>Complied</em> responses by applicable answered criteria (
            <em>Complied + Not Complied</em>), excluding{" "}
            <em>Not Applicable</em>. Areas without criteria or submissions show{" "}
            <span className="font-semibold">—</span>, and areas where all
            submitted criteria are Not Applicable show{" "}
            <span className="font-semibold">N/A</span>.
          </p>
        </div>
      </div>

      <ComplianceMatrixTable
        caption="Admin PACUCOA compliance matrix across active colleges and evaluation areas"
        columns={reportState.columns}
        rows={reportState.rows}
        emptyMessage="Add active evaluation areas and participating colleges to view the compliance matrix."
      />
    </div>
  );
}

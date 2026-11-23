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
  Loading,
  showToast,
} from "../../components/ui";
import { useAuth } from "../../context/useAuth";
import {
  calculateAreaCompliance,
  calculateOverallCompliance,
  selectLatestSessionsByArea,
  type SessionWithResponses,
} from "../../lib/compliance";
import {
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
  question_order: number;
}

interface MatrixState {
  columns: MatrixColumn[];
  rows: MatrixRow[];
}

export default function ComplianceMatrix() {
  const { college: currentCollege } = useAuth();
  const [matrixState, setMatrixState] = useState<MatrixState>({
    columns: [],
    rows: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIdRef = useRef(0);
  const currentCollegeId = currentCollege?.id;

  const loadMatrixData = useCallback(async () => {
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
            .select("id, area_id, parent_id, question_order")
            .eq("is_active", true),
          supabase
            .from("evaluation_sessions")
            .select(
              "id, college_id, completed_at, is_complete, responses(question_id, status)",
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

      const latestByCollege = selectLatestSessionsByArea(
        sessionsData,
        questionAreaMap,
      );

      const rows: MatrixRow[] = areasData.map((area) => {
        const areaQuestions = questionsByArea.get(area.id) || [];
        const leaves = getLeafQuestions(buildQuestionTree(areaQuestions));
        const cells: Record<string, MatrixRowCell> = {};

        collegesData.forEach((col) => {
          const respMap = latestByCollege.get(col.id)?.get(area.id) ?? new Map();
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

      const columns: MatrixColumn[] = collegesData.map((col) => {
        const overall = calculateOverallCompliance(
          rows.map((row) => {
            const cell = row.cells[col.id];
            return cell?.displayState === "percentage" ? cell.compliance : null;
          }),
        );

        const isOwn = col.id === currentCollegeId;
        return {
          id: col.id,
          label: col.code || col.name,
          subLabel: isOwn ? "(Your College)" : col.code ? col.name : null,
          overallCompliance: overall,
          highlight: isOwn,
        };
      });

      setMatrixState({ columns, rows });
      setError(null);
    } catch {
      if (currentFetchId === fetchIdRef.current) {
        setError("Failed to load compliance matrix. Please try again.");
        showToast("Failed to load compliance matrix.", "error");
      }
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [currentCollegeId]);

  useEffect(() => {
    void loadMatrixData();

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void loadMatrixData();
      }, 500);
    };

    const channel = supabase
      .channel("college-matrix-updates")
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
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [loadMatrixData]);

  const handleExport = async () => {
    if (
      matrixState.columns.length === 0 ||
      matrixState.rows.length === 0 ||
      isExporting
    ) {
      return;
    }

    setIsExporting(true);
    try {
      await exportComplianceWorkbook({
        filenameBase: `Compliance_Matrix_${localDateStamp()}`,
        matrixColumns: matrixState.columns.map((c) => ({
          id: c.id,
          label: c.label,
          overallCompliance: c.overallCompliance,
        })),
        matrixRows: matrixState.rows.map((r) => ({
          areaLabel: r.areaName ? `${r.areaLabel}: ${r.areaName}` : r.areaLabel,
          cells: r.cells,
        })),
      });
      showToast("Compliance matrix exported to Excel.", "success");
    } catch {
      showToast("Failed to export compliance matrix.", "error");
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loading size="lg" text="Loading compliance matrix…" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Compliance Matrix
          </h1>
          <p className="text-gray-600 max-w-prose mt-1">
            Compare compliance percentages across all participating colleges and
            evaluation areas.
          </p>
        </div>

        <Button
          type="button"
          onClick={() => void handleExport()}
          isLoading={isExporting}
          disabled={
            matrixState.columns.length === 0 || matrixState.rows.length === 0
          }
        >
          <DownloadIcon className="w-4 h-4" />
          {isExporting ? "Exporting…" : "Export Excel"}
        </Button>
      </div>

      {error && (
        <Card className="p-4 border border-red-200 bg-red-50/70">
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
                void loadMatrixData();
              }}
            >
              Retry
            </Button>
          </div>
        </Card>
      )}

      <ComplianceMatrixTable
        caption="College compliance matrix across accreditation areas"
        columns={matrixState.columns}
        rows={matrixState.rows}
        emptyMessage="No active evaluation areas or participating colleges found yet."
      />
    </div>
  );
}

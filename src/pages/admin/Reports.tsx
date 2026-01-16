import { Fragment, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { College, ComplianceStatus } from "../../lib/types";
import * as XLSX from "xlsx";
import { Button, Card, Loading, showToast } from "../../components/ui";

interface QuestionWithArea {
  id: string;
  question_text: string;
  question_order: number;
  areas: { name: string; area_number: number } | null;
}

interface ResponseData {
  question_id: string;
  status: ComplianceStatus;
  evaluation_sessions: {
    college_id: string | null;
  } | null;
}

interface PivotRow {
  questionId: string;
  areaNumber: number;
  areaName: string;
  questionText: string;
  collegeData: Record<
    string,
    { complied: number; not_complied: number; not_applicable: number }
  >;
}

export default function Reports() {
  const [colleges, setColleges] = useState<College[]>([]);
  const [questions, setQuestions] = useState<QuestionWithArea[]>([]);
  const [responses, setResponses] = useState<ResponseData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pivotData, setPivotData] = useState<PivotRow[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch colleges
      const { data: collegesData, error: collegesError } = await supabase
        .from("colleges")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (collegesError) throw collegesError;
      setColleges(collegesData || []);

      // Fetch questions with areas
      const { data: questionsData, error: questionsError } = await supabase
        .from("questions")
        .select(
          `
          id,
          question_text,
          question_order,
          areas (name, area_number)
        `
        )
        .eq("is_active", true)
        .order("question_order", { ascending: true });

      if (questionsError) throw questionsError;
      setQuestions((questionsData as unknown as QuestionWithArea[]) || []);

      // Fetch all responses with session info
      const { data: responsesData, error: responsesError } =
        await supabase.from("responses").select(`
          question_id,
          status,
          evaluation_sessions (college_id)
        `);

      if (responsesError) throw responsesError;
      setResponses((responsesData as unknown as ResponseData[]) || []);

      // Build pivot data
      buildPivotData(
        collegesData || [],
        (questionsData as unknown as QuestionWithArea[]) || [],
        (responsesData as unknown as ResponseData[]) || []
      );
    } catch (error) {
      console.error("Error fetching data:", error);
      showToast("Failed to load report data", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const buildPivotData = (
    collegesData: College[],
    questionsData: QuestionWithArea[],
    responsesData: ResponseData[]
  ) => {
    const pivot: PivotRow[] = questionsData.map((question) => {
      const collegeData: Record<
        string,
        { complied: number; not_complied: number; not_applicable: number }
      > = {};

      // Initialize for each college
      collegesData.forEach((college) => {
        collegeData[college.id] = {
          complied: 0,
          not_complied: 0,
          not_applicable: 0,
        };
      });

      // Count responses per college for this question
      responsesData
        .filter((r) => r.question_id === question.id)
        .forEach((response) => {
          const collegeId = response.evaluation_sessions?.college_id;
          if (collegeId && collegeData[collegeId]) {
            collegeData[collegeId][response.status]++;
          }
        });

      return {
        questionId: question.id,
        areaNumber: question.areas?.area_number || 0,
        areaName: question.areas?.name || "Unknown",
        questionText: question.question_text,
        collegeData,
      };
    });

    // Sort by area number then question order
    pivot.sort((a, b) => a.areaNumber - b.areaNumber);
    setPivotData(pivot);
  };

  const exportToExcel = () => {
    if (pivotData.length === 0) {
      showToast("No data to export", "error");
      return;
    }

    // Build header row
    const headers = ["Area", "Question"];
    colleges.forEach((college) => {
      headers.push(`${college.name} - Complied`);
      headers.push(`${college.name} - Not Complied`);
      headers.push(`${college.name} - N/A`);
    });

    // Build data rows
    const rows = pivotData.map((row) => {
      const dataRow: (string | number)[] = [
        `Area ${row.areaNumber}: ${row.areaName}`,
        row.questionText,
      ];

      colleges.forEach((college) => {
        const data = row.collegeData[college.id] || {
          complied: 0,
          not_complied: 0,
          not_applicable: 0,
        };
        dataRow.push(data.complied);
        dataRow.push(data.not_complied);
        dataRow.push(data.not_applicable);
      });

      return dataRow;
    });

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Set column widths
    ws["!cols"] = [
      { wch: 30 }, // Area
      { wch: 60 }, // Question
      ...colleges.flatMap(() => [{ wch: 15 }, { wch: 15 }, { wch: 15 }]),
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Evaluation Report");
    XLSX.writeFile(
      wb,
      `evaluation_report_${new Date().toISOString().split("T")[0]}.xlsx`
    );
    showToast("Report exported successfully", "success");
  };

  const exportToCSV = () => {
    if (pivotData.length === 0) {
      showToast("No data to export", "error");
      return;
    }

    // Build header row
    const headers = ["Area", "Question"];
    colleges.forEach((college) => {
      headers.push(`${college.name} - Complied`);
      headers.push(`${college.name} - Not Complied`);
      headers.push(`${college.name} - N/A`);
    });

    // Build data rows
    const rows = pivotData.map((row) => {
      const dataRow: (string | number)[] = [
        `Area ${row.areaNumber}: ${row.areaName}`,
        row.questionText,
      ];

      colleges.forEach((college) => {
        const data = row.collegeData[college.id] || {
          complied: 0,
          not_complied: 0,
          not_applicable: 0,
        };
        dataRow.push(data.complied);
        dataRow.push(data.not_complied);
        dataRow.push(data.not_applicable);
      });

      return dataRow;
    });

    // Create workbook and export as CSV
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(
      wb,
      `evaluation_report_${new Date().toISOString().split("T")[0]}.csv`
    );
    showToast("CSV exported successfully", "success");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loading size="lg" text="Loading report data..." />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Reports
          </h1>
          <p className="text-gray-600 mt-1">
            Export evaluation data by question and college
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={exportToCSV}>
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
            Export CSV
          </Button>
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
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <Card>
          <div className="text-center">
            <p className="text-3xl font-bold text-maroon-800">
              {questions.length}
            </p>
            <p className="text-sm text-gray-500">Questions</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-3xl font-bold text-maroon-800">
              {colleges.length}
            </p>
            <p className="text-sm text-gray-500">Colleges</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-3xl font-bold text-maroon-800">
              {responses.length}
            </p>
            <p className="text-sm text-gray-500">Total Responses</p>
          </div>
        </Card>
      </div>

      {/* Preview Table */}
      {pivotData.length === 0 ? (
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
            Add questions and collect evaluations to see report data
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
                    Question
                  </th>
                  {colleges.map((college) => (
                    <th
                      key={college.id}
                      colSpan={3}
                      className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-l border-gray-200"
                    >
                      {college.name}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-gray-400 sticky left-0 bg-gray-50 z-10"></th>
                  {colleges.map((college) => (
                    <Fragment key={`header-${college.id}`}>
                      <th className="px-2 py-2 text-center text-xs text-green-600 font-medium border-l border-gray-200">
                        ✓
                      </th>
                      <th className="px-2 py-2 text-center text-xs text-red-600 font-medium">
                        ✗
                      </th>
                      <th className="px-2 py-2 text-center text-xs text-gray-400 font-medium">
                        N/A
                      </th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pivotData.slice(0, 10).map((row, index) => (
                  <tr
                    key={row.questionId}
                    className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}
                  >
                    <td className="px-4 py-3 text-sm text-gray-900 sticky left-0 bg-inherit z-10 max-w-xs">
                      <span className="text-xs text-gray-400 block">
                        Area {row.areaNumber}
                      </span>
                      <span className="line-clamp-2">{row.questionText}</span>
                    </td>
                    {colleges.map((college) => {
                      const data = row.collegeData[college.id] || {
                        complied: 0,
                        not_complied: 0,
                        not_applicable: 0,
                      };
                      return (
                        <Fragment key={`data-${college.id}`}>
                          <td className="px-2 py-3 text-center text-sm text-green-600 border-l border-gray-100">
                            {data.complied}
                          </td>
                          <td className="px-2 py-3 text-center text-sm text-red-600">
                            {data.not_complied}
                          </td>
                          <td className="px-2 py-3 text-center text-sm text-gray-400">
                            {data.not_applicable}
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pivotData.length > 10 && (
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-center text-sm text-gray-500">
              Showing 10 of {pivotData.length} questions. Export to see all
              data.
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

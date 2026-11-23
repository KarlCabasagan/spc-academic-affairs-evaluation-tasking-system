// shortcut: xlsx@0.18.5 is write-only here (never parses untrusted workbooks); migrate to exceljs or patched SheetJS if spreadsheet import is ever added.
import {
  calculateOverallCompliance,
  type ComplianceDisplayState,
  type QuestionComplianceNode,
} from "./compliance.ts";

const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;
const INVALID_SHEET_CHARS_RE = /[:\\/?*[\]]/g;
const INVALID_FILENAME_CHARS_RE = /[^a-zA-Z0-9\s_-]/g;

/**
 * Neutralize spreadsheet formula prefixes so user-entered comments or names
 * cannot execute formulas when opened or converted.
 */
export function safeExcelCell(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  return FORMULA_PREFIX_RE.test(str) ? `'${str}` : str;
}

/**
 * Sanitize and deduplicate an Excel worksheet name within Excel's 31-char limit
 * and forbidden character set (`: \ / ? * [ ]`).
 */
export function sanitizeSheetName(
  rawName: string,
  usedNames: Set<string>,
): string {
  const cleaned = rawName.replace(INVALID_SHEET_CHARS_RE, " ").trim() || "Sheet";
  const base = cleaned.slice(0, 31).trim() || "Sheet";

  if (!usedNames.has(base.toLowerCase())) {
    usedNames.add(base.toLowerCase());
    return base;
  }

  let suffixNum = 2;
  while (true) {
    const suffix = `_${suffixNum}`;
    const candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    if (!usedNames.has(candidate.toLowerCase())) {
      usedNames.add(candidate.toLowerCase());
      return candidate;
    }
    suffixNum++;
  }
}

/**
 * Sanitize a download filename stem, falling back if nothing ASCII remains.
 */
export function safeFileName(rawName: string, fallback = "export"): string {
  const cleaned = rawName
    .replace(INVALID_FILENAME_CHARS_RE, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, 60);

  return cleaned || fallback;
}

/**
 * Format local YYYY-MM-DD date string (avoids UTC midnight date drift).
 */
export function localDateStamp(date: Date = new Date()): string {
  return date.toLocaleDateString("en-CA");
}

export function formatMatrixCellValue(
  displayState: ComplianceDisplayState,
  compliance: number | null,
): string {
  switch (displayState) {
    case "no_questions":
    case "no_response":
      return "—";
    case "all_na":
      return "N/A";
    case "percentage":
      return compliance !== null ? `${compliance.toFixed(1)}%` : "—";
  }
}

export interface ComplianceWorkbookColumn {
  id: string;
  label: string;
  overallCompliance: number | null;
}

export interface ComplianceWorkbookRow {
  areaLabel: string;
  cells: Record<
    string,
    { displayState: ComplianceDisplayState; compliance: number | null }
  >;
}

export interface ComplianceWorkbookDetailArea {
  areaNumber: number;
  areaName: string;
  compliance: number | null;
  displayState: ComplianceDisplayState;
  questions: QuestionComplianceNode[];
}

export interface ComplianceWorkbookDetailSheet {
  sheetLabel: string;
  areas: ComplianceWorkbookDetailArea[];
}

export interface ExportComplianceWorkbookOptions {
  filenameBase: string;
  matrixColumns: ComplianceWorkbookColumn[];
  matrixRows: ComplianceWorkbookRow[];
  detailSheets?: ComplianceWorkbookDetailSheet[];
}

function flattenComplianceNodes(
  nodes: readonly QuestionComplianceNode[],
): { node: QuestionComplianceNode; isLeaf: boolean }[] {
  const result: { node: QuestionComplianceNode; isLeaf: boolean }[] = [];
  const walk = (items: readonly QuestionComplianceNode[]) => {
    for (const item of items) {
      const isLeaf = item.children.length === 0;
      result.push({ node: item, isLeaf });
      if (!isLeaf) walk(item.children);
    }
  };
  walk(nodes);
  return result;
}

/**
 * Export a cross-tabular compliance matrix workbook (plus optional per-college detail sheets).
 */
export async function exportComplianceWorkbook(
  options: ExportComplianceWorkbookOptions,
): Promise<void> {
  const { filenameBase, matrixColumns, matrixRows, detailSheets = [] } = options;
  if (matrixColumns.length === 0 || matrixRows.length === 0) {
    throw new Error("No compliance data to export");
  }

  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const usedSheetNames = new Set<string>();

  const matrixSheetName = sanitizeSheetName("Compliance Matrix", usedSheetNames);
  const headers = [
    "Area",
    ...matrixColumns.map((col) => safeExcelCell(col.label)),
  ];

  const rows: string[][] = matrixRows.map((row) => [
    safeExcelCell(row.areaLabel),
    ...matrixColumns.map((col) => {
      const cell = row.cells[col.id];
      if (!cell) return "—";
      return formatMatrixCellValue(cell.displayState, cell.compliance);
    }),
  ]);

  rows.push([
    "Total Compliance",
    ...matrixColumns.map((col) =>
      col.overallCompliance !== null
        ? `${col.overallCompliance.toFixed(1)}%`
        : "N/A",
    ),
  ]);

  const wsMatrix = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  wsMatrix["!cols"] = [
    { wch: 40 },
    ...matrixColumns.map(() => ({ wch: 15 })),
  ];
  XLSX.utils.book_append_sheet(wb, wsMatrix, matrixSheetName);

  for (const sheet of detailSheets) {
    const detailRows: string[][] = [];
    const detailHeaders = ["Area", "Question", "Response", "Comment"];

    const populatedAreas = sheet.areas.filter((a) => a.questions.length > 0);
    populatedAreas.forEach((areaData, areaIndex) => {
      const flat = flattenComplianceNodes(areaData.questions);

      flat.forEach((item, qIndex) => {
        let statusText = "";
        if (item.isLeaf) {
          if (!item.node.response) {
            statusText = "No Response";
          } else if (item.node.response.status === "complied") {
            statusText = "Complied";
          } else if (item.node.response.status === "not_complied") {
            statusText = "Not Complied";
          } else {
            statusText = "N/A";
          }
        }

        const areaName =
          qIndex === 0
            ? safeExcelCell(`Area ${areaData.areaNumber}: ${areaData.areaName}`)
            : "";

        detailRows.push([
          areaName,
          safeExcelCell(
            `${item.node.hierarchicalNumber} ${item.node.questionText}`,
          ),
          statusText,
          item.isLeaf ? safeExcelCell(item.node.response?.comment) : "",
        ]);
      });

      const areaComplianceText =
        areaData.displayState === "percentage" && areaData.compliance !== null
          ? `${areaData.compliance.toFixed(1)}%`
          : "N/A";

      detailRows.push([
        safeExcelCell(`Area ${areaData.areaNumber} Compliance`),
        "",
        areaComplianceText,
        "",
      ]);

      if (areaIndex < populatedAreas.length - 1) {
        detailRows.push(["", "", "", ""]);
      }
    });

    if (detailRows.length > 0) {
      const wsDetail = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows]);
      wsDetail["!cols"] = [
        { wch: 35 },
        { wch: 60 },
        { wch: 15 },
        { wch: 40 },
      ];
      const sheetName = sanitizeSheetName(sheet.sheetLabel, usedSheetNames);
      XLSX.utils.book_append_sheet(wb, wsDetail, sheetName);
    }
  }

  XLSX.writeFile(wb, `${safeFileName(filenameBase, "compliance_report")}.xlsx`);
}

export interface PublicExportArea {
  areaNumber: number;
  areaName: string;
  compliance: number | null;
  leaves: {
    hierarchicalNumber: string;
    questionText: string;
    statusText: string;
    comment: string | null;
  }[];
}

export async function exportPublicEvaluationWorkbook(options: {
  filenameBase?: string;
  areas: PublicExportArea[];
}): Promise<void> {
  const { filenameBase = `evaluation_results_${localDateStamp()}`, areas } =
    options;
  if (areas.length === 0) {
    throw new Error("No completed areas to export");
  }

  const XLSX = await import("xlsx");
  const rows: string[][] = [];

  areas.forEach((areaData, areaIndex) => {
    areaData.leaves.forEach((leaf, qIndex) => {
      rows.push([
        qIndex === 0
          ? safeExcelCell(`Area ${areaData.areaNumber}: ${areaData.areaName}`)
          : "",
        safeExcelCell(`${leaf.hierarchicalNumber} ${leaf.questionText}`),
        safeExcelCell(leaf.statusText),
        safeExcelCell(leaf.comment),
      ]);
    });

    rows.push([
      safeExcelCell(`Area ${areaData.areaNumber} Compliance`),
      "",
      areaData.compliance !== null
        ? `${areaData.compliance.toFixed(1)}%`
        : "N/A",
      "",
    ]);

    if (areaIndex < areas.length - 1) {
      rows.push(["", "", "", ""]);
    }
  });

  const overall = calculateOverallCompliance(areas.map((a) => a.compliance));
  rows.push(["", "", "", ""]);
  rows.push([
    "Overall Compliance",
    "",
    overall !== null ? `${overall.toFixed(1)}%` : "N/A",
    "",
  ]);

  const headers = ["Area", "Question", "Response", "Comment"];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = [{ wch: 35 }, { wch: 60 }, { wch: 15 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, ws, "Evaluation Results");
  XLSX.writeFile(wb, `${safeFileName(filenameBase, "evaluation_results")}.xlsx`);
}

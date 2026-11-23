import {
  COMPLIANCE_TONE_CLASSES,
  type ComplianceDisplayState,
  getComplianceTone,
} from "../../lib/compliance";
import { formatMatrixCellValue } from "../../lib/excelExport";

export interface MatrixColumn {
  id: string;
  label: string;
  subLabel?: string | null;
  overallCompliance: number | null;
  highlight?: boolean;
}

export interface MatrixRowCell {
  displayState: ComplianceDisplayState;
  compliance: number | null;
}

export interface MatrixRow {
  id: string;
  areaNumber: number;
  areaLabel: string;
  areaName?: string;
  cells: Record<string, MatrixRowCell>;
}

interface ComplianceMatrixTableProps {
  caption: string;
  columns: readonly MatrixColumn[];
  rows: readonly MatrixRow[];
  emptyMessage?: string;
}

export default function ComplianceMatrixTable({
  caption,
  columns,
  rows,
  emptyMessage = "No evaluation data available yet.",
}: ComplianceMatrixTableProps) {
  if (columns.length === 0 || rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-gray-600 max-w-prose mx-auto">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto bg-white rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 bg-gray-50 border-b border-r border-gray-200 px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-700 min-w-[200px] sm:min-w-[240px]"
              >
                Area
              </th>
              {columns.map((col) => (
                <th
                  key={col.id}
                  scope="col"
                  className={`border-b border-gray-200 px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-wider min-w-[120px] ${
                    col.highlight
                      ? "bg-maroon-50 text-maroon-900"
                      : "bg-gray-50 text-gray-700"
                  }`}
                >
                  <span className="block">{col.label}</span>
                  {col.subLabel && (
                    <span className="block text-[11px] font-medium normal-case tracking-normal text-gray-600 mt-0.5">
                      {col.subLabel}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-200">
            {rows.map((row) => (
              <tr
                key={row.id}
                className="group hover:bg-gray-50 transition-colors duration-150"
              >
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 border-r border-gray-200 px-4 py-3.5 text-sm font-medium text-gray-900 align-top transition-colors duration-150"
                >
                  <span className="tabular-nums block">{row.areaLabel}</span>
                  {row.areaName && (
                    <span className="block text-xs font-normal text-gray-600 mt-0.5 max-w-prose">
                      {row.areaName}
                    </span>
                  )}
                </th>
                {columns.map((col) => {
                  const cell = row.cells[col.id];
                  const displayState: ComplianceDisplayState =
                    cell?.displayState ?? "no_response";
                  const compliance = cell?.compliance ?? null;
                  const tone = getComplianceTone(
                    displayState === "percentage" ? compliance : null,
                  );
                  const styles = COMPLIANCE_TONE_CLASSES[tone];
                  const text = formatMatrixCellValue(displayState, compliance);

                  return (
                    <td
                      key={col.id}
                      className={`px-4 py-3.5 text-center align-middle ${
                        col.highlight ? "bg-maroon-50/40" : ""
                      }`}
                    >
                      <span
                        className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md text-sm font-semibold tabular-nums ${
                          displayState === "percentage"
                            ? `${styles.badgeBg} ${styles.text}`
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {text}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="bg-maroon-50 border-t-2 border-maroon-200 font-semibold">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-maroon-50 border-r border-maroon-200 px-4 py-3.5 text-sm font-bold text-maroon-900"
              >
                Total Compliance
              </th>
              {columns.map((col) => {
                const overall = col.overallCompliance;
                const tone = getComplianceTone(overall);
                const styles = COMPLIANCE_TONE_CLASSES[tone];

                return (
                  <td key={col.id} className="px-4 py-3.5 text-center">
                    <span
                      className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md text-sm font-bold tabular-nums ${
                        overall !== null
                          ? `${styles.badgeBg} ${styles.text}`
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {overall !== null ? `${overall.toFixed(1)}%` : "N/A"}
                    </span>
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-700 px-1">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full bg-emerald-600"
            aria-hidden="true"
          />
          <span className="tabular-nums">≥ 80% Compliant</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full bg-amber-600"
            aria-hidden="true"
          />
          <span className="tabular-nums">50% – 79.9% Moderate</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full bg-red-600"
            aria-hidden="true"
          />
          <span className="tabular-nums">&lt; 50% Needs Attention</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full bg-gray-500"
            aria-hidden="true"
          />
          N/A (All Items Not Applicable)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-semibold"
            aria-hidden="true"
          >
            —
          </span>
          No Completed Submission
        </span>
      </div>
    </div>
  );
}

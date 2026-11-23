import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatMatrixCellValue,
  localDateStamp,
  safeExcelCell,
  safeFileName,
  sanitizeSheetName,
} from "./excelExport.ts";

describe("excelExport utilities", () => {
  it("neutralizes dangerous spreadsheet formula prefixes", () => {
    assert.equal(safeExcelCell("=CMD|' /C calc'!A0"), "'=CMD|' /C calc'!A0");
    assert.equal(safeExcelCell("+1+1"), "'+1+1");
    assert.equal(safeExcelCell("-SUM(A1:A2)"), "'-SUM(A1:A2)");
    assert.equal(safeExcelCell("@SUM(1,2)"), "'@SUM(1,2)");
    assert.equal(safeExcelCell("\tfoo"), "'\tfoo");
    assert.equal(safeExcelCell("\rbar"), "'\rbar");
    assert.equal(safeExcelCell("Normal comment."), "Normal comment.");
    assert.equal(safeExcelCell(null), "");
  });

  it("sanitizes invalid characters, truncates to 31 chars, and deduplicates sheet names", () => {
    const used = new Set<string>();
    assert.equal(
      sanitizeSheetName("Compliance Matrix", used),
      "Compliance Matrix",
    );
    assert.equal(
      sanitizeSheetName("Compliance Matrix", used),
      "Compliance Matrix_2",
    );
    assert.equal(sanitizeSheetName("CCS/IT:2026?*[]", used), "CCS IT 2026");

    const long1 = sanitizeSheetName("A".repeat(40), used);
    const long2 = sanitizeSheetName("A".repeat(40), used);
    assert.equal(long1.length, 31);
    assert.equal(long2.length, 31);
    assert.notEqual(long1, long2);
    assert.ok(long2.endsWith("_2"));
  });

  it("sanitizes filenames with fallback and formats local YYYY-MM-DD dates", () => {
    assert.equal(safeFileName("!!!", "history_export"), "history_export");
    assert.equal(
      safeFileName("Archive - Jan 2026!"),
      "Archive_-_Jan_2026",
    );
    assert.match(localDateStamp(new Date("2026-05-01T01:00:00")), /^\d{4}-\d{2}-\d{2}$/);
  });

  it("formats matrix cells consistently", () => {
    assert.equal(formatMatrixCellValue("no_questions", null), "—");
    assert.equal(formatMatrixCellValue("no_response", null), "—");
    assert.equal(formatMatrixCellValue("all_na", null), "N/A");
    assert.equal(formatMatrixCellValue("percentage", 87.54), "87.5%");
  });
});

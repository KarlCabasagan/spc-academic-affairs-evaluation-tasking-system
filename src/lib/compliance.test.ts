import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildQuestionComplianceTree,
  calculateAreaCompliance,
  calculateOverallCompliance,
  selectLatestSessionsByArea,
  type ResponseRecord,
} from "./compliance.ts";

describe("compliance SSOT calculation", () => {
  it("matches flat-leaf ratio and parent tree rollup identically", () => {
    // Q1 is leaf (Complied); Q2 has 4 sub-questions (all Not Complied) => 1 / 5 = 20.0%
    const questions = [
      { id: "q1", parent_id: null, question_order: 1, question_text: "Q1" },
      { id: "q2", parent_id: null, question_order: 2, question_text: "Q2" },
      { id: "q2a", parent_id: "q2", question_order: 1, question_text: "Q2a" },
      { id: "q2b", parent_id: "q2", question_order: 2, question_text: "Q2b" },
      { id: "q2c", parent_id: "q2", question_order: 3, question_text: "Q2c" },
      { id: "q2d", parent_id: "q2", question_order: 4, question_text: "Q2d" },
    ];

    const responses = new Map<string, ResponseRecord>([
      ["q1", { question_id: "q1", status: "complied" }],
      ["q2a", { question_id: "q2a", status: "not_complied" }],
      ["q2b", { question_id: "q2b", status: "not_complied" }],
      ["q2c", { question_id: "q2c", status: "not_complied" }],
      ["q2d", { question_id: "q2d", status: "not_complied" }],
    ]);

    const flat = calculateAreaCompliance(
      [
        { id: "q1" },
        { id: "q2a" },
        { id: "q2b" },
        { id: "q2c" },
        { id: "q2d" },
      ],
      responses,
    );
    assert.equal(flat.displayState, "percentage");
    assert.equal(flat.compliance, 20);

    const tree = buildQuestionComplianceTree(questions, responses);
    const totalComplied = tree.reduce((s, n) => s + n.compliedCount, 0);
    const totalNotComplied = tree.reduce((s, n) => s + n.notCompliedCount, 0);
    const treePercent =
      (totalComplied / (totalComplied + totalNotComplied)) * 100;

    assert.equal(tree[0].compliance, 100);
    assert.equal(tree[1].compliance, 0);
    assert.equal(treePercent, flat.compliance);
  });

  it("handles N/A exclusion, all_na, no_response, and no_questions states", () => {
    assert.equal(
      calculateAreaCompliance([], new Map()).displayState,
      "no_questions",
    );

    const noResp = calculateAreaCompliance([{ id: "q1" }], new Map());
    assert.equal(noResp.displayState, "no_response");
    assert.equal(noResp.compliance, null);

    const allNa = calculateAreaCompliance(
      [{ id: "q1" }],
      new Map([["q1", { question_id: "q1", status: "not_applicable" }]]),
    );
    assert.equal(allNa.displayState, "all_na");
    assert.equal(allNa.compliance, null);

    // Unanswered optional leaf does not drag down answered leaf score
    const partial = calculateAreaCompliance(
      [{ id: "q1" }, { id: "q2" }, { id: "q3" }],
      new Map([
        ["q1", { question_id: "q1", status: "complied" }],
        ["q2", { question_id: "q2", status: "not_applicable" }],
      ]),
    );
    assert.equal(partial.displayState, "percentage");
    assert.equal(partial.compliance, 100);
    assert.equal(partial.answeredCount, 2);
    assert.equal(partial.totalLeaves, 3);
  });

  it("preserves archived child questions without parents in compliance trees", () => {
    const archivedResponses = [
      {
        id: "r1",
        parent_id: "missing-parent",
        question_order: 1,
        question_text: "Sub A",
      },
      {
        id: "r2",
        parent_id: "missing-parent",
        question_order: 2,
        question_text: "Sub B",
      },
    ];
    const responseMap = new Map<string, ResponseRecord>([
      ["r1", { question_id: "r1", status: "complied" }],
      ["r2", { question_id: "r2", status: "not_complied" }],
    ]);

    const tree = buildQuestionComplianceTree(archivedResponses, responseMap);
    assert.equal(tree.length, 2);
    assert.equal(tree[0].compliance, 100);
    assert.equal(tree[1].compliance, 0);
  });

  it("selects only the newest completed session per (college, area) and skips incomplete sessions", () => {
    const questionAreaMap = new Map([
      ["q1", "area1"],
      ["q2", "area2"],
    ]);

    const selected = selectLatestSessionsByArea(
      [
        {
          id: "old",
          college_id: "c1",
          completed_at: "2026-01-01T10:00:00Z",
          is_complete: true,
          responses: [
            { question_id: "q1", status: "not_complied" },
            { question_id: "q2", status: "complied" },
          ],
        },
        {
          id: "newest",
          college_id: "c1",
          completed_at: "2026-01-02T10:00:00Z",
          is_complete: true,
          responses: [{ question_id: "q1", status: "complied" }],
        },
        {
          id: "draft",
          college_id: "c1",
          completed_at: "2026-01-03T10:00:00Z",
          is_complete: false,
          responses: [{ question_id: "q1", status: "not_complied" }],
        },
      ],
      questionAreaMap,
    );

    const c1 = selected.get("c1")!;
    assert.equal(c1.get("area1")?.get("q1")?.status, "complied");
    assert.equal(c1.get("area2")?.get("q2")?.status, "complied");
  });

  it("averages only non-null area compliances in calculateOverallCompliance", () => {
    assert.equal(calculateOverallCompliance([null, null]), null);
    assert.equal(calculateOverallCompliance([100, null, 50]), 75);
  });
});

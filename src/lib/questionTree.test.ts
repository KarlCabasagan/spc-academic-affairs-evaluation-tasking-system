import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildQuestionTree,
  flattenQuestionTree,
  getLeafQuestions,
  collectDescendantIds,
  collectAncestorIds,
} from "./questionTree.ts";

describe("questionTree", () => {
  it("builds sorted trees with hierarchical numbering and leaf detection", () => {
    const items = [
      { id: "q2", parent_id: null, question_order: 2, text: "Second" },
      { id: "q1b", parent_id: "q1", question_order: 2, text: "Child 2" },
      { id: "q1", parent_id: null, question_order: 1, text: "First" },
      { id: "q1a", parent_id: "q1", question_order: 1, text: "Child 1" },
    ];

    const tree = buildQuestionTree(items);
    assert.equal(tree.length, 2);
    assert.equal(tree[0].hierarchical_number, "1");
    assert.equal(tree[0].children[0].id, "q1a");
    assert.equal(tree[0].children[0].hierarchical_number, "1.1");
    assert.equal(tree[0].children[1].hierarchical_number, "1.2");
    assert.equal(tree[1].hierarchical_number, "2");

    const leaves = getLeafQuestions(tree).map((q) => q.id);
    assert.deepEqual(leaves, ["q1a", "q1b", "q2"]);

    const flat = flattenQuestionTree(tree);
    assert.deepEqual(
      flat.map((f) => [f.node.id, f.depth, f.isLeaf]),
      [
        ["q1", 0, false],
        ["q1a", 1, true],
        ["q1b", 1, true],
        ["q2", 0, true],
      ],
    );
  });

  it("promotes orphaned children (inactive parent or archived sub-questions) to roots", () => {
    const archivedOrOrphaned = [
      { id: "child-2", parent_id: "missing-parent", question_order: 2 },
      { id: "child-1", parent_id: "missing-parent", question_order: 1 },
      { id: "grandchild", parent_id: "child-1", question_order: 1 },
    ];

    const tree = buildQuestionTree(archivedOrOrphaned);
    assert.equal(tree.length, 2);
    assert.equal(tree[0].id, "child-1");
    assert.equal(tree[0].hierarchical_number, "1");
    assert.equal(tree[0].children[0].id, "grandchild");
    assert.equal(tree[0].children[0].hierarchical_number, "1.1");
    assert.equal(tree[1].id, "child-2");
    assert.equal(tree[1].hierarchical_number, "2");
  });

  it("collects ancestors and descendants safely even with cycles", () => {
    const items = [
      { id: "root", parent_id: null },
      { id: "mid", parent_id: "root" },
      { id: "leaf", parent_id: "mid" },
      { id: "cycA", parent_id: "cycB" },
      { id: "cycB", parent_id: "cycA" },
    ];

    assert.deepEqual(collectDescendantIds(items, "root"), [
      "root",
      "mid",
      "leaf",
    ]);
    assert.deepEqual(collectAncestorIds(items, "leaf"), ["mid", "root"]);
    assert.deepEqual(collectDescendantIds(items, "cycA"), ["cycA", "cycB"]);
    assert.deepEqual(collectAncestorIds(items, "cycA"), ["cycB"]);
  });
});

export interface TreeQuestionInput {
  id: string;
  parent_id: string | null;
  question_order: number;
}

export type TreeQuestionNode<T extends TreeQuestionInput> = T & {
  children: TreeQuestionNode<T>[];
  hierarchical_number: string;
};

/**
 * Build a sorted, numbered hierarchy from a flat question list in O(n).
 * Items whose parent_id is missing or absent from the list become roots so
 * active sub-questions under inactive parents and archived child responses
 * are never silently dropped.
 */
export function buildQuestionTree<T extends TreeQuestionInput>(
  questions: readonly T[],
): TreeQuestionNode<T>[] {
  const nodeMap = new Map<string, TreeQuestionNode<T>>();
  const roots: TreeQuestionNode<T>[] = [];

  for (const q of questions) {
    nodeMap.set(q.id, {
      ...q,
      children: [],
      hierarchical_number: "",
    });
  }

  for (const q of questions) {
    const node = nodeMap.get(q.id)!;
    if (q.parent_id && q.parent_id !== q.id && nodeMap.has(q.parent_id)) {
      nodeMap.get(q.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortAndNumber = (
    items: TreeQuestionNode<T>[],
    prefix: string,
  ): void => {
    items.sort((a, b) => a.question_order - b.question_order);
    items.forEach((item, index) => {
      const num = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
      item.hierarchical_number = num;
      if (item.children.length > 0) {
        sortAndNumber(item.children, num);
      }
    });
  };

  sortAndNumber(roots, "");
  return roots;
}

export interface FlattenedQuestion<T extends TreeQuestionInput> {
  node: TreeQuestionNode<T>;
  depth: number;
  isLeaf: boolean;
}

/**
 * Flatten a hierarchical question tree in depth-first pre-order.
 */
export function flattenQuestionTree<T extends TreeQuestionInput>(
  nodes: readonly TreeQuestionNode<T>[],
  depth = 0,
): FlattenedQuestion<T>[] {
  const result: FlattenedQuestion<T>[] = [];

  for (const node of nodes) {
    const isLeaf = node.children.length === 0;
    result.push({ node, depth, isLeaf });
    if (!isLeaf) {
      result.push(...flattenQuestionTree(node.children, depth + 1));
    }
  }

  return result;
}

/**
 * Return all leaf (answerable) questions from a built question tree.
 */
export function getLeafQuestions<T extends TreeQuestionInput>(
  nodes: readonly TreeQuestionNode<T>[],
): TreeQuestionNode<T>[] {
  const leaves: TreeQuestionNode<T>[] = [];

  const traverse = (items: readonly TreeQuestionNode<T>[]): void => {
    for (const item of items) {
      if (item.children.length === 0) {
        leaves.push(item);
      } else {
        traverse(item.children);
      }
    }
  };

  traverse(nodes);
  return leaves;
}

/**
 * Collect rootId and all descendant IDs in O(n) with cycle protection.
 */
export function collectDescendantIds(
  questions: readonly { id: string; parent_id: string | null }[],
  rootId: string,
): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const q of questions) {
    if (!q.parent_id) continue;
    const list = childrenByParent.get(q.parent_id);
    if (list) {
      list.push(q.id);
    } else {
      childrenByParent.set(q.parent_id, [q.id]);
    }
  }

  const result: string[] = [];
  const visited = new Set<string>();
  const queue = [rootId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    result.push(current);

    const children = childrenByParent.get(current);
    if (children) {
      for (const childId of children) {
        if (!visited.has(childId)) {
          queue.push(childId);
        }
      }
    }
  }

  return result;
}

/**
 * Collect all ancestor parent IDs above startId (nearest first), with cycle guard.
 */
export function collectAncestorIds(
  questions: readonly { id: string; parent_id: string | null }[],
  startId: string,
): string[] {
  const parentById = new Map<string, string | null>();
  for (const q of questions) {
    parentById.set(q.id, q.parent_id);
  }

  const ancestors: string[] = [];
  const visited = new Set<string>([startId]);
  let currentId: string | null | undefined = parentById.get(startId);

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    if (!parentById.has(currentId)) break;
    ancestors.push(currentId);
    currentId = parentById.get(currentId);
  }

  return ancestors;
}

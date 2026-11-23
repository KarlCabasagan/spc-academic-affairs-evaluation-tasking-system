import type { Area, ComplianceStatus, Question } from "./types.ts";

export interface StoredResponse {
  questionId: string;
  status: ComplianceStatus;
  comment: string;
  answered: boolean;
}

export interface AreaResponses {
  [questionId: string]: StoredResponse;
}

export interface AllResponses {
  [areaId: string]: AreaResponses;
}

const VALID_STATUSES = new Set<string>([
  "complied",
  "not_complied",
  "not_applicable",
]);

export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isAreaArray(value: unknown): value is Area[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isPlainRecord(item) &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        isFiniteNumber(item.area_number),
    )
  );
}

export function isQuestionArray(value: unknown): value is Question[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isPlainRecord(item) &&
        typeof item.id === "string" &&
        typeof item.area_id === "string" &&
        typeof item.question_text === "string" &&
        isFiniteNumber(item.question_order),
    )
  );
}

export function isQuestionsCache(
  value: unknown,
): value is Record<string, Question[]> {
  return (
    isPlainRecord(value) &&
    Object.values(value).every((items) => isQuestionArray(items))
  );
}

export function isStoredResponse(value: unknown): value is StoredResponse {
  return (
    isPlainRecord(value) &&
    typeof value.status === "string" &&
    VALID_STATUSES.has(value.status) &&
    (value.questionId === undefined || typeof value.questionId === "string") &&
    (value.comment === undefined || typeof value.comment === "string") &&
    (value.answered === undefined || typeof value.answered === "boolean")
  );
}

export function isResponseMap(value: unknown): value is AllResponses {
  if (!isPlainRecord(value)) return false;

  return Object.values(value).every((areaMap) => {
    if (!isPlainRecord(areaMap)) return false;
    return Object.values(areaMap).every((entry) => isStoredResponse(entry));
  });
}

export function readStorageJson<T>(
  key: string,
  validator: (value: unknown) => value is T,
  fallback: T,
): T {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return validator(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorageJson(key: string, value: unknown): boolean {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeStorageKey(key: string): boolean {
  try {
    globalThis.localStorage?.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

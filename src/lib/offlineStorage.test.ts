import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isAreaArray,
  isFiniteNumber,
  isPlainRecord,
  isResponseMap,
  isStringArray,
  readStorageJson,
  removeStorageKey,
  writeStorageJson,
} from "./offlineStorage.ts";

function installMockStorage(options?: { throwOnSet?: boolean }) {
  const store = new Map<string, string>();
  const mockStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      if (options?.throwOnSet) {
        const err = new Error("QuotaExceededError");
        err.name = "QuotaExceededError";
        throw err;
      }
      store.set(key, value);
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    value: mockStorage,
    configurable: true,
    writable: true,
  });

  return store;
}

describe("offlineStorage", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );

  beforeEach(() => {
    installMockStorage();
  });

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, "localStorage", originalDescriptor);
    } else {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  });

  it("round-trips valid JSON matching validator", () => {
    const payload = {
      "area-1": {
        "q-1": {
          questionId: "q-1",
          status: "complied" as const,
          comment: "Verified",
          answered: true,
        },
      },
    };

    const ok = writeStorageJson("evaluation_responses", payload);
    assert.equal(ok, true);

    const read = readStorageJson("evaluation_responses", isResponseMap, {});
    assert.deepEqual(read, payload);
  });

  it("returns fallback on corrupt JSON", () => {
    globalThis.localStorage.setItem("evaluation_completed_areas", "{not-json");
    const result = readStorageJson("evaluation_completed_areas", isStringArray, [
      "fallback",
    ]);
    assert.deepEqual(result, ["fallback"]);
  });

  it("returns fallback when parsed JSON has unexpected shape", () => {
    // Array stored where plain object map is expected
    globalThis.localStorage.setItem(
      "evaluation_responses",
      JSON.stringify(["bad-array"]),
    );
    assert.deepEqual(readStorageJson("evaluation_responses", isResponseMap, {}), {});

    // Invalid compliance status rejected
    globalThis.localStorage.setItem(
      "evaluation_responses",
      JSON.stringify({ "area-1": { "q-1": { status: "hacked" } } }),
    );
    assert.deepEqual(readStorageJson("evaluation_responses", isResponseMap, {}), {});

    // Wrong element type in string array rejected
    globalThis.localStorage.setItem(
      "evaluation_completed_areas",
      JSON.stringify([123, "area-1"]),
    );
    assert.deepEqual(
      readStorageJson("evaluation_completed_areas", isStringArray, []),
      [],
    );
  });

  it("returns false instead of throwing on quota error", () => {
    installMockStorage({ throwOnSet: true });
    const ok = writeStorageJson("evaluation_responses", { a: {} });
    assert.equal(ok, false);
  });

  it("validates areas, numbers, records, and removes keys safely", () => {
    assert.equal(isPlainRecord({ a: 1 }), true);
    assert.equal(isPlainRecord([1, 2]), false);
    assert.equal(isFiniteNumber(42), true);
    assert.equal(isFiniteNumber(NaN), false);
    assert.equal(
      isAreaArray([{ id: "1", area_number: 1, name: "Area I" }]),
      true,
    );
    assert.equal(isAreaArray([{ id: "1", name: "Missing number" }]), false);

    writeStorageJson("temp_key", ["x"]);
    assert.equal(removeStorageKey("temp_key"), true);
    assert.deepEqual(readStorageJson("temp_key", isStringArray, []), []);
  });
});

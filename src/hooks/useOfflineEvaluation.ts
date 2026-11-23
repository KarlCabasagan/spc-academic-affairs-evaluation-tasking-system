import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Area, Question } from "../lib/types";
import {
  type AllResponses,
  type AreaResponses,
  type StoredResponse,
  isAreaArray,
  isFiniteNumber,
  isQuestionsCache,
  isResponseMap,
  isStringArray,
  readStorageJson,
  removeStorageKey,
  writeStorageJson,
} from "../lib/offlineStorage";

export type { AllResponses, AreaResponses, StoredResponse };

const STORAGE_KEYS = {
  AREAS_CACHE: "evaluation_areas_cache",
  QUESTIONS_CACHE: "evaluation_questions_cache",
  QUESTIONS_LAST_SYNC: "evaluation_questions_last_sync",
  RESPONSES: "evaluation_responses",
  COMPLETED_AREAS: "evaluation_completed_areas",
} as const;

export interface QuestionsCache {
  [areaId: string]: Question[];
}

export function useOfflineEvaluation() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [areas, setAreas] = useState<Area[]>([]);
  const [completedAreas, setCompletedAreas] = useState<string[]>(() =>
    readStorageJson(STORAGE_KEYS.COMPLETED_AREAS, isStringArray, []),
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEYS.COMPLETED_AREAS || event.key === null) {
        setCompletedAreas(
          readStorageJson(STORAGE_KEYS.COMPLETED_AREAS, isStringArray, []),
        );
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const fetchAreas = useCallback(async () => {
    setIsLoading(true);
    const cachedAreas = readStorageJson(
      STORAGE_KEYS.AREAS_CACHE,
      isAreaArray,
      [],
    );

    try {
      if (isOnline) {
        const { data, error } = await supabase
          .from("areas")
          .select("*")
          .eq("is_active", true)
          .order("area_number", { ascending: true });

        if (error) throw error;

        const areasData = data || [];
        setAreas(areasData);
        if (areasData.length > 0 || cachedAreas.length === 0) {
          writeStorageJson(STORAGE_KEYS.AREAS_CACHE, areasData);
        }
      } else {
        setAreas(cachedAreas);
      }
    } catch {
      setAreas(cachedAreas);
    } finally {
      setIsLoading(false);
    }
  }, [isOnline]);

  const fetchQuestions = useCallback(
    async (areaId: string): Promise<Question[]> => {
      const cache = readStorageJson<QuestionsCache>(
        STORAGE_KEYS.QUESTIONS_CACHE,
        isQuestionsCache,
        {},
      );

      try {
        if (isOnline) {
          const { data, error } = await supabase
            .from("questions")
            .select("*")
            .eq("area_id", areaId)
            .eq("is_active", true)
            .order("question_order", { ascending: true });

          if (error) throw error;

          const questionsData = data || [];
          const nextCache: QuestionsCache = {
            ...cache,
            [areaId]: questionsData,
          };
          writeStorageJson(STORAGE_KEYS.QUESTIONS_CACHE, nextCache);
          return questionsData;
        }
        return cache[areaId] || [];
      } catch {
        return cache[areaId] || [];
      }
    },
    [isOnline],
  );

  const prefetchAllQuestions = useCallback(async () => {
    if (!isOnline) return;

    try {
      const { data: allQuestions, error } = await supabase
        .from("questions")
        .select("*")
        .eq("is_active", true)
        .order("question_order", { ascending: true });

      if (error) throw error;

      const cache: QuestionsCache = {};
      (allQuestions || []).forEach((q: Question) => {
        if (!cache[q.area_id]) {
          cache[q.area_id] = [];
        }
        cache[q.area_id].push(q);
      });

      const saved = writeStorageJson(STORAGE_KEYS.QUESTIONS_CACHE, cache);
      if (saved) {
        writeStorageJson(STORAGE_KEYS.QUESTIONS_LAST_SYNC, Date.now());
      }
    } catch {
      // Cache stays at previous valid snapshot on transient fetch failure
    }
  }, [isOnline]);

  useEffect(() => {
    if (!isOnline) return;
    const lastSync = readStorageJson(
      STORAGE_KEYS.QUESTIONS_LAST_SYNC,
      isFiniteNumber,
      0,
    );
    const fiveMinutes = 5 * 60 * 1000;
    if (Date.now() - lastSync > fiveMinutes) {
      void prefetchAllQuestions();
    }
  }, [isOnline, prefetchAllQuestions]);

  const getResponses = useCallback((areaId: string): AreaResponses => {
    const allResponses = readStorageJson(
      STORAGE_KEYS.RESPONSES,
      isResponseMap,
      {},
    );
    return allResponses[areaId] || {};
  }, []);

  const saveResponses = useCallback(
    (areaId: string, responses: AreaResponses): boolean => {
      const allResponses = readStorageJson(
        STORAGE_KEYS.RESPONSES,
        isResponseMap,
        {},
      );
      const nextResponses: AllResponses = {
        ...allResponses,
        [areaId]: responses,
      };
      return writeStorageJson(STORAGE_KEYS.RESPONSES, nextResponses);
    },
    [],
  );

  const markAreaComplete = useCallback((areaId: string): boolean => {
    const stored = readStorageJson(
      STORAGE_KEYS.COMPLETED_AREAS,
      isStringArray,
      [],
    );
    if (stored.includes(areaId)) return true;

    const updated = [...stored, areaId];
    const saved = writeStorageJson(STORAGE_KEYS.COMPLETED_AREAS, updated);
    if (saved) {
      setCompletedAreas(updated);
    }
    return saved;
  }, []);

  const isAreaCompleted = useCallback(
    (areaId: string): boolean => {
      return completedAreas.includes(areaId);
    },
    [completedAreas],
  );

  const clearAreaResponses = useCallback((areaId: string): boolean => {
    const allResponses = readStorageJson(
      STORAGE_KEYS.RESPONSES,
      isResponseMap,
      {},
    );
    const nextResponses: AllResponses = { ...allResponses };
    delete nextResponses[areaId];
    const responsesSaved = writeStorageJson(
      STORAGE_KEYS.RESPONSES,
      nextResponses,
    );

    const stored = readStorageJson(
      STORAGE_KEYS.COMPLETED_AREAS,
      isStringArray,
      [],
    );
    const updated = stored.filter((id) => id !== areaId);
    const completedSaved = writeStorageJson(
      STORAGE_KEYS.COMPLETED_AREAS,
      updated,
    );
    if (completedSaved) {
      setCompletedAreas(updated);
    }

    return responsesSaved && completedSaved;
  }, []);

  const clearAllData = useCallback((): boolean => {
    const r = removeStorageKey(STORAGE_KEYS.RESPONSES);
    const c = removeStorageKey(STORAGE_KEYS.COMPLETED_AREAS);
    setCompletedAreas([]);
    return r && c;
  }, []);

  const getAllResponses = useCallback((): AllResponses => {
    return readStorageJson(STORAGE_KEYS.RESPONSES, isResponseMap, {});
  }, []);

  return {
    isOnline,
    isLoading,
    areas,
    completedAreas,
    fetchAreas,
    fetchQuestions,
    prefetchAllQuestions,
    getResponses,
    saveResponses,
    markAreaComplete,
    isAreaCompleted,
    clearAreaResponses,
    clearAllData,
    getAllResponses,
  };
}

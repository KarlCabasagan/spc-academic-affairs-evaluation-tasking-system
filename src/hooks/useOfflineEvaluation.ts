import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { Area, Question, ComplianceStatus } from "../lib/types";

// LocalStorage keys
const STORAGE_KEYS = {
  AREAS_CACHE: "evaluation_areas_cache",
  QUESTIONS_CACHE: "evaluation_questions_cache",
  QUESTIONS_LAST_SYNC: "evaluation_questions_last_sync",
  RESPONSES: "evaluation_responses",
  COMPLETED_AREAS: "evaluation_completed_areas",
};

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

export interface QuestionsCache {
  [areaId: string]: Question[];
}

// Helper functions for localStorage
const getFromStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
};

const setToStorage = <T>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error("Failed to save to localStorage:", e);
  }
};

export function useOfflineEvaluation() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [areas, setAreas] = useState<Area[]>([]);
  const [completedAreas, setCompletedAreas] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Load completed areas from localStorage
  useEffect(() => {
    const stored = getFromStorage<string[]>(STORAGE_KEYS.COMPLETED_AREAS, []);
    setCompletedAreas(stored);
  }, []);

  // Fetch areas with offline support
  const fetchAreas = useCallback(async () => {
    setIsLoading(true);
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
        // Cache for offline use
        setToStorage(STORAGE_KEYS.AREAS_CACHE, areasData);
      } else {
        // Load from cache when offline
        const cached = getFromStorage<Area[]>(STORAGE_KEYS.AREAS_CACHE, []);
        setAreas(cached);
      }
    } catch (error) {
      console.error("Error fetching areas:", error);
      // Fall back to cache on error
      const cached = getFromStorage<Area[]>(STORAGE_KEYS.AREAS_CACHE, []);
      setAreas(cached);
    } finally {
      setIsLoading(false);
    }
  }, [isOnline]);

  // Fetch questions for a specific area with offline support
  const fetchQuestions = useCallback(
    async (areaId: string): Promise<Question[]> => {
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
          // Cache for offline use
          const cache = getFromStorage<QuestionsCache>(
            STORAGE_KEYS.QUESTIONS_CACHE,
            {},
          );
          cache[areaId] = questionsData;
          setToStorage(STORAGE_KEYS.QUESTIONS_CACHE, cache);

          return questionsData;
        } else {
          // Load from cache when offline
          const cache = getFromStorage<QuestionsCache>(
            STORAGE_KEYS.QUESTIONS_CACHE,
            {},
          );
          return cache[areaId] || [];
        }
      } catch (error) {
        console.error("Error fetching questions:", error);
        // Fall back to cache on error
        const cache = getFromStorage<QuestionsCache>(
          STORAGE_KEYS.QUESTIONS_CACHE,
          {},
        );
        return cache[areaId] || [];
      }
    },
    [isOnline],
  );

  // Prefetch ALL questions from ALL areas (for offline support)
  const prefetchAllQuestions = useCallback(async () => {
    if (!isOnline) return;

    try {
      // Fetch all active questions at once
      const { data: allQuestions, error } = await supabase
        .from("questions")
        .select("*")
        .eq("is_active", true)
        .order("question_order", { ascending: true });

      if (error) throw error;

      // Group by area_id
      const cache: QuestionsCache = {};
      (allQuestions || []).forEach((q: Question) => {
        if (!cache[q.area_id]) {
          cache[q.area_id] = [];
        }
        cache[q.area_id].push(q);
      });

      // Save to localStorage
      setToStorage(STORAGE_KEYS.QUESTIONS_CACHE, cache);
      setToStorage(STORAGE_KEYS.QUESTIONS_LAST_SYNC, Date.now());

      console.log(
        `Prefetched ${allQuestions?.length || 0} questions for offline use`,
      );
    } catch (error) {
      console.error("Error prefetching questions:", error);
    }
  }, [isOnline]);

  // Sync questions cache when coming back online
  useEffect(() => {
    if (isOnline) {
      // Check if we need to sync (sync every 5 minutes max)
      const lastSync = getFromStorage<number>(
        STORAGE_KEYS.QUESTIONS_LAST_SYNC,
        0,
      );
      const fiveMinutes = 5 * 60 * 1000;

      if (Date.now() - lastSync > fiveMinutes) {
        prefetchAllQuestions();
      }
    }
  }, [isOnline, prefetchAllQuestions]);

  // Get responses for a specific area
  const getResponses = useCallback((areaId: string): AreaResponses => {
    const allResponses = getFromStorage<AllResponses>(
      STORAGE_KEYS.RESPONSES,
      {},
    );
    return allResponses[areaId] || {};
  }, []);

  // Save responses for a specific area
  const saveResponses = useCallback(
    (areaId: string, responses: AreaResponses) => {
      const allResponses = getFromStorage<AllResponses>(
        STORAGE_KEYS.RESPONSES,
        {},
      );
      allResponses[areaId] = responses;
      setToStorage(STORAGE_KEYS.RESPONSES, allResponses);
    },
    [],
  );

  // Mark area as completed
  const markAreaComplete = useCallback((areaId: string) => {
    const stored = getFromStorage<string[]>(STORAGE_KEYS.COMPLETED_AREAS, []);
    if (!stored.includes(areaId)) {
      const updated = [...stored, areaId];
      setToStorage(STORAGE_KEYS.COMPLETED_AREAS, updated);
      setCompletedAreas(updated);
    }
  }, []);

  // Unmark area as completed (for editing)
  const unmarkAreaComplete = useCallback((areaId: string) => {
    const stored = getFromStorage<string[]>(STORAGE_KEYS.COMPLETED_AREAS, []);
    const updated = stored.filter((id) => id !== areaId);
    setToStorage(STORAGE_KEYS.COMPLETED_AREAS, updated);
    setCompletedAreas(updated);
  }, []);

  // Check if area is completed
  const isAreaCompleted = useCallback(
    (areaId: string): boolean => {
      return completedAreas.includes(areaId);
    },
    [completedAreas],
  );

  // Clear responses for a specific area
  const clearAreaResponses = useCallback((areaId: string) => {
    const allResponses = getFromStorage<AllResponses>(
      STORAGE_KEYS.RESPONSES,
      {},
    );
    delete allResponses[areaId];
    setToStorage(STORAGE_KEYS.RESPONSES, allResponses);

    // Also unmark as completed
    const stored = getFromStorage<string[]>(STORAGE_KEYS.COMPLETED_AREAS, []);
    const updated = stored.filter((id) => id !== areaId);
    setToStorage(STORAGE_KEYS.COMPLETED_AREAS, updated);
    setCompletedAreas(updated);
  }, []);

  // Clear all data
  const clearAllData = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.RESPONSES);
    localStorage.removeItem(STORAGE_KEYS.COMPLETED_AREAS);
    setCompletedAreas([]);
  }, []);

  // Get all responses (for export)
  const getAllResponses = useCallback((): AllResponses => {
    return getFromStorage<AllResponses>(STORAGE_KEYS.RESPONSES, {});
  }, []);

  // Calculate compliance for an area (excluding N/A)
  const calculateAreaCompliance = useCallback(
    (areaResponses: AreaResponses): number | null => {
      const responses = Object.values(areaResponses).filter((r) => r.answered);
      const validResponses = responses.filter(
        (r) => r.status !== "not_applicable",
      );

      if (validResponses.length === 0) return null;

      const complied = validResponses.filter(
        (r) => r.status === "complied",
      ).length;
      return (complied / validResponses.length) * 100;
    },
    [],
  );

  // Calculate overall compliance across all areas
  const calculateOverallCompliance = useCallback((): number | null => {
    const allResponses = getAllResponses();
    const areaCompliances: number[] = [];

    Object.values(allResponses).forEach((areaResponses) => {
      const compliance = calculateAreaCompliance(areaResponses);
      if (compliance !== null) {
        areaCompliances.push(compliance);
      }
    });

    if (areaCompliances.length === 0) return null;
    return (
      areaCompliances.reduce((sum, c) => sum + c, 0) / areaCompliances.length
    );
  }, [getAllResponses, calculateAreaCompliance]);

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
    unmarkAreaComplete,
    isAreaCompleted,
    clearAreaResponses,
    clearAllData,
    getAllResponses,
    calculateAreaCompliance,
    calculateOverallCompliance,
  };
}

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { College, ComplianceStatus } from "../../lib/types";
import {
  Button,
  Card,
  Input,
  Modal,
  Loading,
  showToast,
} from "../../components/ui";

interface SessionWithCollege {
  id: string;
  session_token: string;
  guest_name: string | null;
  college_id: string | null;
  started_at: string;
  completed_at: string | null;
  is_complete: boolean;
  colleges: { name: string } | null;
}

interface ResponseDetail {
  id: string;
  status: ComplianceStatus;
  comment: string | null;
  questions: {
    question_text: string;
    question_order: number;
    areas: { name: string; area_number: number } | null;
  } | null;
}

export default function Responses() {
  const [sessions, setSessions] = useState<SessionWithCollege[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchName, setSearchName] = useState("");
  const [filterCollegeId, setFilterCollegeId] = useState("");

  // Detail modal
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedSession, setSelectedSession] =
    useState<SessionWithCollege | null>(null);
  const [sessionResponses, setSessionResponses] = useState<ResponseDetail[]>(
    []
  );
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  useEffect(() => {
    fetchSessions();
    fetchColleges();
  }, []);

  const fetchColleges = async () => {
    try {
      const { data, error } = await supabase
        .from("colleges")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      setColleges(data || []);
    } catch (err) {
      console.error("Error fetching colleges:", err);
    }
  };

  const fetchSessions = async () => {
    try {
      const { data, error } = await supabase
        .from("evaluation_sessions")
        .select(
          `
          *,
          colleges (name)
        `
        )
        .eq("is_complete", true)
        .order("completed_at", { ascending: false });

      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      console.error("Error fetching sessions:", error);
      showToast("Failed to load responses", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const openDetailModal = async (session: SessionWithCollege) => {
    setSelectedSession(session);
    setIsDetailOpen(true);
    setIsLoadingDetails(true);

    try {
      const { data, error } = await supabase
        .from("responses")
        .select(
          `
          id,
          status,
          comment,
          questions (
            question_text,
            question_order,
            areas (name, area_number)
          )
        `
        )
        .eq("session_id", session.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setSessionResponses(data || []);
    } catch (err) {
      console.error("Error fetching responses:", err);
      showToast("Failed to load response details", "error");
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Filter sessions based on search and filter
  const filteredSessions = sessions.filter((session) => {
    const matchesName =
      !searchName ||
      session.guest_name?.toLowerCase().includes(searchName.toLowerCase());
    const matchesCollege =
      !filterCollegeId || session.college_id === filterCollegeId;
    return matchesName && matchesCollege;
  });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: ComplianceStatus) => {
    switch (status) {
      case "complied":
        return (
          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
            Complied
          </span>
        );
      case "not_complied":
        return (
          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
            Not Complied
          </span>
        );
      case "not_applicable":
        return (
          <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
            N/A
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loading size="lg" text="Loading responses..." />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Response Registry
        </h1>
        <p className="text-gray-600 mt-1">
          View and search all evaluation submissions
        </p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            label="Search by Name"
            placeholder="Enter name..."
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Filter by College
            </label>
            <select
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-maroon-500 focus:border-transparent transition-colors"
              value={filterCollegeId}
              onChange={(e) => setFilterCollegeId(e.target.value)}
            >
              <option value="">All Colleges</option>
              {colleges.map((college) => (
                <option key={college.id} value={college.id}>
                  {college.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button
              variant="ghost"
              onClick={() => {
                setSearchName("");
                setFilterCollegeId("");
              }}
            >
              Clear Filters
            </Button>
          </div>
        </div>
      </Card>

      {/* Results */}
      {filteredSessions.length === 0 ? (
        <Card className="text-center py-12">
          <svg
            className="w-16 h-16 text-gray-300 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No responses found
          </h3>
          <p className="text-gray-500">
            {searchName || filterCollegeId
              ? "Try adjusting your filters"
              : "No evaluations have been submitted yet"}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredSessions.map((session) => (
            <Card
              key={session.id}
              className="flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="w-10 h-10 bg-maroon-100 text-maroon-800 rounded-full flex items-center justify-center shrink-0 font-medium">
                  {session.guest_name?.[0]?.toUpperCase() || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">
                    {session.guest_name || "Anonymous"}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>{session.colleges?.name || "Unknown College"}</span>
                    <span>•</span>
                    <span>{formatDate(session.completed_at)}</span>
                  </div>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openDetailModal(session)}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
                View Details
              </Button>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-4 text-sm text-gray-500 text-center">
        Showing {filteredSessions.length} of {sessions.length} responses
      </div>

      {/* Detail Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title="Response Details"
        size="lg"
      >
        {selectedSession && (
          <div>
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <span className="text-sm text-gray-500">Name:</span>
                  <p className="font-medium">
                    {selectedSession.guest_name || "Anonymous"}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">College:</span>
                  <p className="font-medium">
                    {selectedSession.colleges?.name || "Unknown"}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Submitted:</span>
                  <p className="font-medium">
                    {formatDate(selectedSession.completed_at)}
                  </p>
                </div>
              </div>
            </div>

            {isLoadingDetails ? (
              <div className="flex justify-center py-8">
                <Loading text="Loading responses..." />
              </div>
            ) : sessionResponses.length === 0 ? (
              <p className="text-center text-gray-500 py-8">
                No responses recorded for this session
              </p>
            ) : (
              <div className="space-y-4 max-h-[400px] overflow-y-auto">
                {sessionResponses.map((response, index) => (
                  <div
                    key={response.id}
                    className="border-b border-gray-100 pb-4 last:border-0"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 bg-gray-100 rounded text-xs flex items-center justify-center shrink-0 font-medium">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-gray-500 mb-1">
                          Area {response.questions?.areas?.area_number}:{" "}
                          {response.questions?.areas?.name}
                        </p>
                        <p className="text-gray-900 mb-2">
                          {response.questions?.question_text}
                        </p>
                        <div className="flex items-center gap-3">
                          {getStatusBadge(response.status)}
                          {response.comment && (
                            <span className="text-sm text-gray-500 italic">
                              "{response.comment}"
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

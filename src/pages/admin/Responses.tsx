import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type {
  College,
  Area,
  Question,
  ComplianceStatus,
} from "../../lib/types";
import { Card, Input, Loading, showToast } from "../../components/ui";
import ComplianceAccordion from "../../components/admin/ComplianceAccordion";
import QuestionComplianceTree from "../../components/admin/QuestionComplianceTree";
import type { QuestionComplianceNode } from "../../components/admin/QuestionComplianceTree";

interface ResponseData {
  id: string;
  question_id: string;
  status: ComplianceStatus;
  comment: string | null;
}

interface SessionData {
  id: string;
  college_id: string;
  responses: ResponseData[];
}

interface AreaComplianceData {
  area: Area;
  compliance: number | null;
  questions: QuestionComplianceNode[];
}

interface CollegeComplianceData {
  college: College;
  overallCompliance: number | null;
  areas: AreaComplianceData[];
}

export default function Responses() {
  const [collegesData, setCollegesData] = useState<CollegeComplianceData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchComplianceData();
  }, []);

  const fetchComplianceData = async () => {
    try {
      // Fetch all active colleges
      const { data: colleges, error: collegesError } = await supabase
        .from("colleges")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (collegesError) throw collegesError;

      // Fetch all active areas
      const { data: areas, error: areasError } = await supabase
        .from("areas")
        .select("*")
        .eq("is_active", true)
        .order("area_number", { ascending: true });

      if (areasError) throw areasError;

      // Fetch all questions (for building hierarchy)
      const { data: questions, error: questionsError } = await supabase
        .from("questions")
        .select("*")
        .eq("is_active", true)
        .order("question_order", { ascending: true });

      if (questionsError) throw questionsError;

      // Fetch all completed sessions with responses
      const { data: sessions, error: sessionsError } = await supabase
        .from("evaluation_sessions")
        .select(
          `
          id,
          college_id,
          responses (
            id,
            question_id,
            status,
            comment
          )
        `
        )
        .eq("is_complete", true);

      if (sessionsError) throw sessionsError;

      // Process data for each college
      const processedData: CollegeComplianceData[] = (colleges || []).map(
        (college) => {
          // Get all sessions for this college
          const collegeSessions = (sessions || []).filter(
            (s: SessionData) => s.college_id === college.id
          );

          // Aggregate all responses for this college
          const allResponses: ResponseData[] = [];
          collegeSessions.forEach((session: SessionData) => {
            if (session.responses) {
              allResponses.push(...session.responses);
            }
          });

          // Create a map of question_id -> response (use latest if multiple)
          const responseMap = new Map<string, ResponseData>();
          allResponses.forEach((r) => {
            responseMap.set(r.question_id, r);
          });

          // Process each area
          const areasData: AreaComplianceData[] = (areas || []).map((area) => {
            // Get questions for this area
            const areaQuestions = (questions || []).filter(
              (q: Question) => q.area_id === area.id
            );

            // Build hierarchical question tree with compliance
            const questionTree = buildQuestionTree(areaQuestions, responseMap);

            // Calculate area compliance
            const areaCompliance = calculateTreeCompliance(questionTree);

            return {
              area,
              compliance: areaCompliance,
              questions: questionTree,
            };
          });

          // Calculate overall college compliance (average of all areas with data)
          const areasWithData = areasData.filter((a) => a.compliance !== null);
          const overallCompliance =
            areasWithData.length > 0
              ? areasWithData.reduce((sum, a) => sum + (a.compliance || 0), 0) /
                areasWithData.length
              : null;

          return {
            college,
            overallCompliance,
            areas: areasData,
          };
        }
      );

      setCollegesData(processedData);
    } catch (error) {
      console.error("Error fetching compliance data:", error);
      showToast("Failed to load compliance data", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Build hierarchical question tree with compliance data
  const buildQuestionTree = (
    questions: Question[],
    responseMap: Map<string, ResponseData>
  ): QuestionComplianceNode[] => {
    // Create map for quick lookup
    const questionMap = new Map<string, Question>();
    questions.forEach((q) => questionMap.set(q.id, q));

    // Find root questions (no parent)
    const roots = questions.filter((q) => !q.parent_id);

    // Recursive function to build tree
    const buildNode = (
      question: Question,
      prefix: string,
      index: number
    ): QuestionComplianceNode => {
      const hierarchicalNumber = prefix
        ? `${prefix}.${index + 1}`
        : `${index + 1}`;
      const children = questions
        .filter((q) => q.parent_id === question.id)
        .sort((a, b) => a.question_order - b.question_order)
        .map((child, childIndex) =>
          buildNode(child, hierarchicalNumber, childIndex)
        );

      const response = responseMap.get(question.id);
      const isLeaf = children.length === 0;

      // Calculate compliance
      let compliance: number | null = null;
      if (isLeaf) {
        // Leaf node: use direct response
        if (response) {
          if (response.status === "not_applicable") {
            compliance = null; // Exclude N/A from calculations
          } else {
            compliance = response.status === "complied" ? 100 : 0;
          }
        }
      } else {
        // Parent node: average of children (excluding nulls)
        const childCompliances = children
          .map((c) => c.compliance)
          .filter((c): c is number => c !== null);
        if (childCompliances.length > 0) {
          compliance =
            childCompliances.reduce((sum, c) => sum + c, 0) /
            childCompliances.length;
        }
      }

      return {
        id: question.id,
        questionText: question.question_text,
        hierarchicalNumber,
        response: response
          ? { status: response.status, comment: response.comment }
          : null,
        compliance,
        children,
      };
    };

    // Sort roots and build tree
    return roots
      .sort((a, b) => a.question_order - b.question_order)
      .map((root, index) => buildNode(root, "", index));
  };

  // Calculate overall compliance for a question tree
  const calculateTreeCompliance = (
    nodes: QuestionComplianceNode[]
  ): number | null => {
    const compliances = nodes
      .map((n) => n.compliance)
      .filter((c): c is number => c !== null);
    if (compliances.length === 0) return null;
    return compliances.reduce((sum, c) => sum + c, 0) / compliances.length;
  };

  // Filter colleges by search term
  const filteredColleges = collegesData.filter(
    (cd) =>
      cd.college.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cd.college.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loading size="lg" text="Loading compliance data..." />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Compliance Analytics
        </h1>
        <p className="text-gray-600 mt-1">
          View evaluation compliance by college, area, and question
        </p>
      </div>

      {/* Search */}
      <Card className="mb-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div className="flex-1 w-full">
            <Input
              label="Search Colleges"
              placeholder="Search by name or code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="text-sm text-gray-500">
            Showing {filteredColleges.length} of {collegesData.length} colleges
          </div>
        </div>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-6 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-emerald-500" />
          <span className="text-gray-600">≥80% Compliant</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-amber-500" />
          <span className="text-gray-600">50-79% Compliant</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-gray-600">&lt;50% Compliant</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-gray-300" />
          <span className="text-gray-600">No Data</span>
        </div>
      </div>

      {/* College Accordions */}
      {filteredColleges.length === 0 ? (
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
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {searchTerm ? "No colleges found" : "No college accounts yet"}
          </h3>
          <p className="text-gray-500">
            {searchTerm
              ? "Try adjusting your search term"
              : "Create college accounts to track compliance"}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredColleges.map((collegeData) => (
            <ComplianceAccordion
              key={collegeData.college.id}
              title={collegeData.college.name}
              subtitle={collegeData.college.code || undefined}
              compliance={collegeData.overallCompliance}
              level="college"
              icon={
                collegeData.college.avatar_url ? (
                  <img
                    src={collegeData.college.avatar_url}
                    alt={collegeData.college.name}
                    className="w-10 h-10 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-maroon-100 text-maroon-800 flex items-center justify-center font-bold text-lg">
                    {collegeData.college.code?.[0] ||
                      collegeData.college.name[0]}
                  </div>
                )
              }
            >
              {/* Area Accordions */}
              {collegeData.areas.length === 0 ? (
                <p className="text-gray-500 text-sm py-4">
                  No evaluation areas configured
                </p>
              ) : (
                <div className="space-y-3">
                  {collegeData.areas.map((areaData) => (
                    <ComplianceAccordion
                      key={areaData.area.id}
                      title={`Area ${areaData.area.area_number}: ${areaData.area.name}`}
                      subtitle={areaData.area.description || undefined}
                      compliance={areaData.compliance}
                      level="area"
                    >
                      {/* Question Tree */}
                      {areaData.questions.length === 0 ? (
                        <p className="text-gray-500 text-sm py-4">
                          No questions in this area
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {areaData.questions.map((questionNode) => (
                            <QuestionComplianceTree
                              key={questionNode.id}
                              node={questionNode}
                              depth={0}
                            />
                          ))}
                        </div>
                      )}
                    </ComplianceAccordion>
                  ))}
                </div>
              )}
            </ComplianceAccordion>
          ))}
        </div>
      )}
    </div>
  );
}

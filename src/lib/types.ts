// Database Types matching schema.sql

export type ComplianceStatus = "complied" | "not_complied" | "not_applicable";

export interface Area {
  id: string;
  area_number: number;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Question {
  id: string;
  area_id: string;
  question_text: string;
  question_order: number;
  is_required: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface College {
  id: string;
  name: string;
  parent_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EvaluationSession {
  id: string;
  session_token: string;
  guest_name: string | null;
  college_id: string | null;
  started_at: string;
  completed_at: string | null;
  is_complete: boolean;
}

export interface Response {
  id: string;
  session_id: string;
  question_id: string;
  status: ComplianceStatus;
  comment: string | null;
  created_at: string;
}

// Form types for creating/updating
export interface AreaFormData {
  area_number: number;
  name: string;
  description?: string;
  is_active?: boolean;
}

export interface QuestionFormData {
  area_id: string;
  question_text: string;
  question_order: number;
  is_required?: boolean;
  is_active?: boolean;
}

export interface ResponseFormData {
  question_id: string;
  status: ComplianceStatus;
  comment?: string;
}

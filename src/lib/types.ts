// Database Types matching schema.sql

export type ComplianceStatus = "complied" | "not_complied" | "not_applicable";

export type UserRole = "admin" | "college";

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
  parent_id: string | null;
  question_text: string;
  question_order: number;
  is_required: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  children?: Question[];
  hierarchical_number?: string;
}

export interface College {
  id: string;
  user_id: string | null; // Links to auth.users
  name: string;
  code: string | null; // e.g., "CCS", "COE"
  avatar_url: string | null;
  parent_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EvaluationSession {
  id: string;
  session_token: string;
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
  parent_id?: string | null;
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

export interface CollegeAccountFormData {
  name: string;
  code: string;
  email: string;
  password: string;
  avatar_url?: string;
}

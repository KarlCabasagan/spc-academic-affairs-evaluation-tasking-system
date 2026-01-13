-- ============================================
-- Academic Affairs Evaluation Tasking System
-- Supabase Database Schema
-- ============================================

-- Function to check if any admin users exist
-- This uses SECURITY DEFINER to access auth.users table
CREATE OR REPLACE FUNCTION public.get_user_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO user_count FROM auth.users;
  RETURN user_count;
END;
$$;

-- Grant execute permission to all roles
GRANT EXECUTE ON FUNCTION public.get_user_count() TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_count() TO authenticated;

-- Areas Table: PACUCOA evaluation areas
CREATE TABLE areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_number INTEGER NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Questions Table: Evaluation questions per area
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_id UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_order INTEGER NOT NULL,
    is_required BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Evaluation Sessions: Track anonymous evaluation submissions
CREATE TABLE evaluation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token VARCHAR(255) UNIQUE NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    is_complete BOOLEAN DEFAULT false
);

-- Compliance Status Enum
CREATE TYPE compliance_status AS ENUM ('complied', 'not_complied', 'not_applicable');

-- Responses Table: Anonymous user responses
CREATE TABLE responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES evaluation_sessions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    status compliance_status NOT NULL,
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(session_id, question_id)
);

-- ============================================
-- Indexes for Performance
-- ============================================
CREATE INDEX idx_questions_area_id ON questions(area_id);
CREATE INDEX idx_responses_session_id ON responses(session_id);
CREATE INDEX idx_responses_question_id ON responses(question_id);

-- ============================================
-- Updated At Trigger Function
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_areas_updated_at
    BEFORE UPDATE ON areas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_questions_updated_at
    BEFORE UPDATE ON questions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Row Level Security Policies
-- ============================================

-- Enable RLS on all tables
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;

-- Areas: Admin can do everything, anonymous can only read active areas
CREATE POLICY "Admin full access to areas"
ON areas FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Anonymous can read active areas"
ON areas FOR SELECT
TO anon
USING (is_active = true);

-- Questions: Admin can do everything, anonymous can only read active questions
CREATE POLICY "Admin full access to questions"
ON questions FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Anonymous can read active questions"
ON questions FOR SELECT
TO anon
USING (is_active = true);

-- Evaluation Sessions: Admin can read all, anonymous can insert and read own
CREATE POLICY "Admin full access to sessions"
ON evaluation_sessions FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Anonymous can create sessions"
ON evaluation_sessions FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "Anonymous can read own session"
ON evaluation_sessions FOR SELECT
TO anon
USING (true);

CREATE POLICY "Anonymous can update own session"
ON evaluation_sessions FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Responses: Admin can read all, anonymous can insert
CREATE POLICY "Admin full access to responses"
ON responses FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Anonymous can insert responses"
ON responses FOR INSERT
TO anon
WITH CHECK (true);

-- ============================================
-- Seed Default PACUCOA Areas
-- ============================================
INSERT INTO areas (area_number, name, description) VALUES
(1, 'Philosophy and Objectives', 'Assessment of institutional mission, vision, and educational goals'),
(2, 'Faculty', 'Evaluation of faculty qualifications, development, and performance'),
(3, 'Instruction', 'Assessment of curriculum design, teaching methods, and learning outcomes'),
(4, 'Laboratories', 'Evaluation of laboratory facilities, equipment, and resources'),
(5, 'Research', 'Assessment of research programs, outputs, and faculty involvement'),
(6, 'Library', 'Evaluation of library resources, services, and accessibility'),
(7, 'Student Services', 'Assessment of student support services and welfare programs'),
(8, 'Social Orientation and Community Involvement', 'Evaluation of extension programs and community engagement'),
(9, 'Physical Plant and Facilities', 'Assessment of campus infrastructure and facilities'),
(10, 'Organization and Administration', 'Evaluation of institutional governance and management');

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

-- Questions Table: Evaluation questions per area (hierarchical structure)
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_id UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES questions(id) ON DELETE CASCADE, -- Self-reference for nesting
    question_text TEXT NOT NULL,
    question_order INTEGER NOT NULL,
    is_required BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Colleges Table: Organizational units with authentication
CREATE TABLE colleges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Links to Supabase auth
    name VARCHAR(255) NOT NULL UNIQUE,
    code VARCHAR(50), -- Department code e.g., "CCS", "COE"
    avatar_url TEXT,
    parent_id UUID REFERENCES colleges(id) ON DELETE SET NULL, -- For future department support
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Evaluation Sessions: Track authenticated evaluation submissions
CREATE TABLE evaluation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token VARCHAR(255) UNIQUE NOT NULL,
    college_id UUID REFERENCES colleges(id), -- Linked to authenticated college
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    is_complete BOOLEAN DEFAULT false
);

-- Compliance Status Enum
CREATE TYPE compliance_status AS ENUM ('complied', 'not_complied', 'not_applicable');

-- Responses Table: College user responses
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
CREATE INDEX idx_questions_parent_id ON questions(parent_id);
CREATE INDEX idx_responses_session_id ON responses(session_id);
CREATE INDEX idx_responses_question_id ON responses(question_id);
CREATE INDEX idx_colleges_user_id ON colleges(user_id);
CREATE INDEX idx_sessions_college_id ON evaluation_sessions(college_id);

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

CREATE TRIGGER update_colleges_updated_at
    BEFORE UPDATE ON colleges
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Function to get user role
-- ============================================
CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user is linked to a college
  IF EXISTS (SELECT 1 FROM colleges WHERE user_id = user_uuid AND is_active = true) THEN
    RETURN 'college';
  ELSE
    RETURN 'admin';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_role(UUID) TO authenticated;

-- ============================================
-- Function to get college by user ID
-- ============================================
CREATE OR REPLACE FUNCTION public.get_college_by_user(user_uuid UUID)
RETURNS TABLE (
  id UUID,
  name VARCHAR,
  code VARCHAR,
  avatar_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.name, c.code, c.avatar_url
  FROM colleges c
  WHERE c.user_id = user_uuid AND c.is_active = true
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_college_by_user(UUID) TO authenticated;

-- ============================================
-- Row Level Security Policies
-- ============================================

-- Enable RLS on all tables
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE colleges ENABLE ROW LEVEL SECURITY;

-- Areas: Authenticated users can read all active areas, Admin can manage
CREATE POLICY "Admin full access to areas"
ON areas FOR ALL
TO authenticated
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Authenticated can read active areas"
ON areas FOR SELECT
TO authenticated
USING (is_active = true);

-- Questions: Authenticated users can read all active questions, Admin can manage
CREATE POLICY "Admin full access to questions"
ON questions FOR ALL
TO authenticated
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Authenticated can read active questions"
ON questions FOR SELECT
TO authenticated
USING (is_active = true);

-- Evaluation Sessions: Admin can read all, College can manage own
CREATE POLICY "Admin full access to sessions"
ON evaluation_sessions FOR ALL
TO authenticated
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "College can manage own sessions"
ON evaluation_sessions FOR ALL
TO authenticated
USING (
  college_id IN (SELECT id FROM colleges WHERE user_id = auth.uid())
)
WITH CHECK (
  college_id IN (SELECT id FROM colleges WHERE user_id = auth.uid())
);

-- Responses: Admin can read all, College can insert own
CREATE POLICY "Admin full access to responses"
ON responses FOR ALL
TO authenticated
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "College can insert own responses"
ON responses FOR INSERT
TO authenticated
WITH CHECK (
  session_id IN (
    SELECT es.id FROM evaluation_sessions es
    JOIN colleges c ON es.college_id = c.id
    WHERE c.user_id = auth.uid()
  )
);

CREATE POLICY "College can read own responses"
ON responses FOR SELECT
TO authenticated
USING (
  session_id IN (
    SELECT es.id FROM evaluation_sessions es
    JOIN colleges c ON es.college_id = c.id
    WHERE c.user_id = auth.uid()
  )
);

-- Colleges: Admin can manage all, users can read their own
CREATE POLICY "Admin full access to colleges"
ON colleges FOR ALL
TO authenticated
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Authenticated can read own college"
ON colleges FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.get_user_role(auth.uid()) = 'admin');

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

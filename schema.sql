-- ============================================
-- Academic Affairs Evaluation Tasking System
-- Supabase Database Schema
-- ============================================

-- ============================================
-- Tables
-- ============================================

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
    user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL, -- Links 1:1 to Supabase auth
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
    college_id UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE, -- Cascades when college is deleted
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
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_areas_updated_at
    BEFORE UPDATE ON areas
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_questions_updated_at
    BEFORE UPDATE ON questions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_colleges_updated_at
    BEFORE UPDATE ON colleges
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Auth & Admin Existence Helpers
-- ============================================

-- Check if at least one admin exists without exposing exact user counts
CREATE OR REPLACE FUNCTION public.has_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM auth.users
    WHERE raw_app_meta_data ->> 'role' = 'admin'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.has_admin() TO authenticated;

-- Backwards-compatible wrapper returning 1 when an admin exists, 0 otherwise
CREATE OR REPLACE FUNCTION public.get_user_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN CASE WHEN public.has_admin() THEN 1 ELSE 0 END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_count() TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_count() TO authenticated;

-- Strictly resolve caller role from server-managed raw_app_meta_data (never default to admin)
CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid UUID DEFAULT auth.uid())
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  app_role TEXT;
BEGIN
  IF user_uuid IS NULL OR user_uuid IS DISTINCT FROM auth.uid() THEN
    RETURN NULL;
  END IF;

  SELECT raw_app_meta_data ->> 'role'
  INTO app_role
  FROM auth.users
  WHERE id = user_uuid;

  IF app_role = 'admin' THEN
    RETURN 'admin';
  END IF;

  IF app_role = 'college'
     AND EXISTS (SELECT 1 FROM colleges WHERE user_id = user_uuid AND is_active = true) THEN
    RETURN 'college';
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_role(UUID) TO authenticated;

-- ============================================
-- Row Level Security Policies
-- ============================================

ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE colleges ENABLE ROW LEVEL SECURITY;

-- Areas: Public & authenticated users can read active areas; Admin has full access
CREATE POLICY "Admin full access to areas"
ON areas FOR ALL
TO authenticated
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Public can read active areas"
ON areas FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- Questions: Public & authenticated users can read active questions; Admin has full access
CREATE POLICY "Admin full access to questions"
ON questions FOR ALL
TO authenticated
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Public can read active questions"
ON questions FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- Evaluation Sessions: Admin can manage all; active College can manage own
CREATE POLICY "Admin full access to sessions"
ON evaluation_sessions FOR ALL
TO authenticated
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "College can manage own sessions"
ON evaluation_sessions FOR ALL
TO authenticated
USING (
  college_id IN (
    SELECT id FROM colleges WHERE user_id = auth.uid() AND is_active = true
  )
)
WITH CHECK (
  college_id IN (
    SELECT id FROM colleges WHERE user_id = auth.uid() AND is_active = true
  )
);

-- Responses: Admin can manage all; active College can CRUD own responses
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
    WHERE c.user_id = auth.uid() AND c.is_active = true
  )
);

CREATE POLICY "College can read own responses"
ON responses FOR SELECT
TO authenticated
USING (
  session_id IN (
    SELECT es.id FROM evaluation_sessions es
    JOIN colleges c ON es.college_id = c.id
    WHERE c.user_id = auth.uid() AND c.is_active = true
  )
);

CREATE POLICY "College can update own responses"
ON responses FOR UPDATE
TO authenticated
USING (
  session_id IN (
    SELECT es.id FROM evaluation_sessions es
    JOIN colleges c ON es.college_id = c.id
    WHERE c.user_id = auth.uid() AND c.is_active = true
  )
)
WITH CHECK (
  session_id IN (
    SELECT es.id FROM evaluation_sessions es
    JOIN colleges c ON es.college_id = c.id
    WHERE c.user_id = auth.uid() AND c.is_active = true
  )
);

CREATE POLICY "College can delete own responses"
ON responses FOR DELETE
TO authenticated
USING (
  session_id IN (
    SELECT es.id FROM evaluation_sessions es
    JOIN colleges c ON es.college_id = c.id
    WHERE c.user_id = auth.uid() AND c.is_active = true
  )
);

-- Colleges: Admin can manage all, active users can read their own
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

-- ============================================
-- Automated Account Deletion Logic
-- ============================================

CREATE OR REPLACE FUNCTION public.delete_college_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.user_id IS NOT NULL THEN
    BEGIN
      DELETE FROM auth.users WHERE id = OLD.user_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to delete auth user %: %', OLD.user_id, SQLERRM;
    END;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_college_delete ON colleges;
CREATE TRIGGER on_college_delete
  AFTER DELETE ON colleges
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_college_auth_user();

-- ============================================
-- Role Assignment Logic
-- ============================================

-- Assign admin role to the very first user (serialized via transaction advisory lock)
CREATE OR REPLACE FUNCTION public.assign_admin_role_to_first_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('spc_assign_first_admin'));

  SELECT COUNT(*) INTO user_count FROM auth.users;

  IF user_count = 1 THEN
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_first_user_created ON auth.users;
CREATE TRIGGER on_first_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_admin_role_to_first_user();

-- Admin-only RPC to assign 'college' role to a newly created college user
CREATE OR REPLACE FUNCTION public.assign_college_role(user_uuid UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_user_role(auth.uid()) <> 'admin' THEN
    RAISE EXCEPTION 'Forbidden: admin access required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = user_uuid AND raw_app_meta_data ->> 'role' = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden: cannot overwrite an admin account role';
  END IF;

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role": "college"}'::jsonb
  WHERE id = user_uuid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_college_role(UUID) TO authenticated;

-- ============================================
-- Evaluation History Tables (for archiving reset data)
-- ============================================

CREATE TABLE evaluation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    archived_at TIMESTAMPTZ DEFAULT NOW(),
    archived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    total_sessions INTEGER DEFAULT 0,
    total_responses INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE history_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    history_id UUID NOT NULL REFERENCES evaluation_history(id) ON DELETE CASCADE,
    original_session_id UUID NOT NULL,
    college_id UUID,
    college_name VARCHAR(255),
    college_code VARCHAR(50),
    session_token VARCHAR(255),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE TABLE history_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    history_session_id UUID NOT NULL REFERENCES history_sessions(id) ON DELETE CASCADE,
    original_response_id UUID NOT NULL,
    question_id UUID,
    question_text TEXT,
    question_parent_id UUID,
    question_order INTEGER,
    area_id UUID,
    area_number INTEGER,
    area_name VARCHAR(255),
    status compliance_status NOT NULL,
    comment TEXT
);

CREATE INDEX idx_history_sessions_history_id ON history_sessions(history_id);
CREATE INDEX idx_history_responses_session_id ON history_responses(history_session_id);

CREATE TRIGGER update_evaluation_history_updated_at
    BEFORE UPDATE ON evaluation_history
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- RLS Policies for History Tables
-- ============================================

ALTER TABLE evaluation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE history_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE history_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to evaluation_history"
ON evaluation_history FOR ALL
TO authenticated
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admin full access to history_sessions"
ON history_sessions FOR ALL
TO authenticated
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admin full access to history_responses"
ON history_responses FOR ALL
TO authenticated
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- ============================================
-- RLS Policies for College Comparison Feature
-- ============================================

CREATE POLICY "College can read all completed sessions for comparison"
ON evaluation_sessions FOR SELECT
TO authenticated
USING (
  is_complete = true AND
  public.get_user_role(auth.uid()) = 'college'
);

CREATE POLICY "College can read all responses for comparison"
ON responses FOR SELECT
TO authenticated
USING (
  public.get_user_role(auth.uid()) = 'college' AND
  session_id IN (SELECT id FROM evaluation_sessions WHERE is_complete = true)
);

CREATE POLICY "College can read all active colleges for comparison"
ON colleges FOR SELECT
TO authenticated
USING (
  is_active = true AND
  public.get_user_role(auth.uid()) = 'college'
);

-- ============================================
-- Atomic Transactional RPCs
-- ============================================

-- Atomically submit or overwrite a college's evaluation for one area
CREATE OR REPLACE FUNCTION public.submit_area_evaluation(
  p_area_id UUID,
  p_responses JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_college_id UUID;
  v_session_id UUID;
BEGIN
  IF public.get_user_role(auth.uid()) <> 'college' THEN
    RAISE EXCEPTION 'Forbidden: active college account required';
  END IF;

  SELECT id INTO v_college_id
  FROM colleges
  WHERE user_id = auth.uid() AND is_active = true
  LIMIT 1;

  IF v_college_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden: active college profile not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM areas WHERE id = p_area_id AND is_active = true) THEN
    RAISE EXCEPTION 'Area not found or inactive';
  END IF;

  IF p_responses IS NULL OR jsonb_typeof(p_responses) <> 'array' OR jsonb_array_length(p_responses) = 0 THEN
    RAISE EXCEPTION 'At least one response is required';
  END IF;

  -- Remove prior responses for this college in this area
  DELETE FROM responses r
  USING evaluation_sessions es, questions q
  WHERE r.session_id = es.id
    AND r.question_id = q.id
    AND es.college_id = v_college_id
    AND q.area_id = p_area_id;

  -- Prune any now-empty prior sessions for this college
  DELETE FROM evaluation_sessions es
  WHERE es.college_id = v_college_id
    AND NOT EXISTS (SELECT 1 FROM responses r WHERE r.session_id = es.id);

  -- Insert new completed session
  INSERT INTO evaluation_sessions (session_token, college_id, is_complete, completed_at)
  VALUES (gen_random_uuid()::text, v_college_id, true, NOW())
  RETURNING id INTO v_session_id;

  -- Insert responses for active questions belonging to p_area_id
  INSERT INTO responses (session_id, question_id, status, comment)
  SELECT
    v_session_id,
    q.id,
    (item ->> 'status')::compliance_status,
    NULLIF(item ->> 'comment', '')
  FROM jsonb_array_elements(p_responses) AS item
  JOIN questions q
    ON q.id = (item ->> 'question_id')::uuid
   AND q.area_id = p_area_id
   AND q.is_active = true;

  IF NOT EXISTS (SELECT 1 FROM responses WHERE session_id = v_session_id) THEN
    RAISE EXCEPTION 'No valid responses recorded for area';
  END IF;

  RETURN v_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_area_evaluation(UUID, JSONB) TO authenticated;

-- Atomically archive all completed evaluation data and reset live tables (no 1,000-row limit)
CREATE OR REPLACE FUNCTION public.archive_and_reset_evaluations(
  p_archive_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_count INTEGER;
  v_response_count INTEGER;
  v_history_id UUID;
  v_name TEXT;
BEGIN
  IF public.get_user_role(auth.uid()) <> 'admin' THEN
    RAISE EXCEPTION 'Forbidden: admin access required';
  END IF;

  SELECT COUNT(*) INTO v_session_count
  FROM evaluation_sessions
  WHERE is_complete = true;

  SELECT COUNT(*) INTO v_response_count
  FROM responses r
  JOIN evaluation_sessions es ON es.id = r.session_id
  WHERE es.is_complete = true;

  IF v_session_count > 0 THEN
    v_name := COALESCE(
      NULLIF(TRIM(p_archive_name), ''),
      'Evaluation Archive - ' || to_char(NOW() AT TIME ZONE 'Asia/Manila', 'Mon DD, YYYY HH12:MI AM')
    );

    INSERT INTO evaluation_history (name, archived_by, total_sessions, total_responses)
    VALUES (v_name, auth.uid(), v_session_count, v_response_count)
    RETURNING id INTO v_history_id;

    INSERT INTO history_sessions (
      history_id,
      original_session_id,
      college_id,
      college_name,
      college_code,
      session_token,
      started_at,
      completed_at
    )
    SELECT
      v_history_id,
      es.id,
      es.college_id,
      c.name,
      c.code,
      es.session_token,
      es.started_at,
      es.completed_at
    FROM evaluation_sessions es
    LEFT JOIN colleges c ON c.id = es.college_id
    WHERE es.is_complete = true;

    INSERT INTO history_responses (
      history_session_id,
      original_response_id,
      question_id,
      question_text,
      question_parent_id,
      question_order,
      area_id,
      area_number,
      area_name,
      status,
      comment
    )
    SELECT
      hs.id,
      r.id,
      r.question_id,
      q.question_text,
      q.parent_id,
      q.question_order,
      q.area_id,
      a.area_number,
      a.name,
      r.status,
      r.comment
    FROM responses r
    JOIN history_sessions hs
      ON hs.original_session_id = r.session_id
     AND hs.history_id = v_history_id
    LEFT JOIN questions q ON q.id = r.question_id
    LEFT JOIN areas a ON a.id = q.area_id;
  END IF;

  DELETE FROM responses;
  DELETE FROM evaluation_sessions;

  RETURN v_history_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_and_reset_evaluations(TEXT) TO authenticated;

-- Atomically clear all areas, questions, sessions, and responses
CREATE OR REPLACE FUNCTION public.clear_all_areas_data()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_user_role(auth.uid()) <> 'admin' THEN
    RAISE EXCEPTION 'Forbidden: admin access required';
  END IF;

  DELETE FROM responses;
  DELETE FROM evaluation_sessions;
  DELETE FROM questions;
  DELETE FROM areas;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_all_areas_data() TO authenticated;

-- ============================================
-- Realtime Publication (includes colleges for auto-logout)
-- ============================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'colleges'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE colleges;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'evaluation_sessions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE evaluation_sessions;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'responses'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE responses;
    END IF;
  END IF;
END $$;

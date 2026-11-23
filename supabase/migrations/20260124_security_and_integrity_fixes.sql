-- ============================================
-- Migration: 2026-01-24 Security & Data Integrity Fixes
-- Run against an existing Supabase database provisioned from earlier schema.sql.
--
-- IMPORTANT BEFORE APPLYING:
--   Ensure existing admin accounts have app_metadata.role = 'admin':
--     UPDATE auth.users u
--     SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
--     WHERE NOT EXISTS (SELECT 1 FROM public.colleges c WHERE c.user_id = u.id)
--       AND COALESCE(u.raw_app_meta_data ->> 'role', '') <> 'college';
-- ============================================

-- 1. Harden trigger search_path
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

-- 2. Admin existence boolean RPC (no exact user count leak)
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

-- 3. Strict get_user_role() - never default deactivated or unknown users to admin
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

-- 4. Drop unused SECURITY DEFINER info-leak RPC
DROP FUNCTION IF EXISTS public.get_college_by_user(UUID);

-- 5. Serialize first-user admin trigger and protect assign_college_role
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

-- 6. Integrity constraints (applied safely if existing data conforms)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'colleges_user_id_key'
  ) THEN
    IF NOT EXISTS (
      SELECT user_id FROM colleges WHERE user_id IS NOT NULL GROUP BY user_id HAVING COUNT(*) > 1
    ) THEN
      ALTER TABLE colleges ADD CONSTRAINT colleges_user_id_key UNIQUE (user_id);
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM evaluation_sessions WHERE college_id IS NULL) THEN
    ALTER TABLE evaluation_sessions ALTER COLUMN college_id SET NOT NULL;
  END IF;
END $$;

-- 7. Update RLS policies for anon public access and active-college checks
DROP POLICY IF EXISTS "Authenticated can read active areas" ON areas;
DROP POLICY IF EXISTS "Public can read active areas" ON areas;
CREATE POLICY "Public can read active areas"
ON areas FOR SELECT
TO anon, authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "Authenticated can read active questions" ON questions;
DROP POLICY IF EXISTS "Public can read active questions" ON questions;
CREATE POLICY "Public can read active questions"
ON questions FOR SELECT
TO anon, authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "College can manage own sessions" ON evaluation_sessions;
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

DROP POLICY IF EXISTS "College can insert own responses" ON responses;
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

DROP POLICY IF EXISTS "College can read own responses" ON responses;
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

DROP POLICY IF EXISTS "College can update own responses" ON responses;
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

DROP POLICY IF EXISTS "College can delete own responses" ON responses;
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

-- 8. Atomic transactional RPCs
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

  DELETE FROM responses r
  USING evaluation_sessions es, questions q
  WHERE r.session_id = es.id
    AND r.question_id = q.id
    AND es.college_id = v_college_id
    AND q.area_id = p_area_id;

  DELETE FROM evaluation_sessions es
  WHERE es.college_id = v_college_id
    AND NOT EXISTS (SELECT 1 FROM responses r WHERE r.session_id = es.id);

  INSERT INTO evaluation_sessions (session_token, college_id, is_complete, completed_at)
  VALUES (gen_random_uuid()::text, v_college_id, true, NOW())
  RETURNING id INTO v_session_id;

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

-- 9. Realtime publication
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

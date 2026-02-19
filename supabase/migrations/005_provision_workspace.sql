-- ============================================================
-- provision_workspace RPC function
--
-- Called during bootstrap after Google OAuth login.
-- Creates user + workspace_members records needed for RLS
-- to allow node operations.
--
-- SECURITY DEFINER: runs with table owner privileges,
-- bypassing RLS to bootstrap the user's workspace access.
-- ============================================================

CREATE OR REPLACE FUNCTION provision_workspace(
  p_user_id TEXT,
  p_email TEXT,
  p_display_name TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Upsert user record
  INSERT INTO users (id, email, display_name, avatar_url)
  VALUES (p_user_id, p_email, p_display_name, p_avatar_url)
  ON CONFLICT (id) DO UPDATE SET
    display_name = COALESCE(EXCLUDED.display_name, users.display_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url);

  -- Create workspace membership (workspace_id = user_id for single-workspace mode)
  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (p_user_id, p_user_id, 'owner')
  ON CONFLICT (workspace_id, user_id) DO NOTHING;
END;
$$;

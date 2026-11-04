-- VitaWise Migration 013: Harden Family Security, Permissions, and RLS Policies
-- Fixes overly broad anon grants, drops custom-table password columns,
-- reinforces cross-family isolation and granular health data permissions.

-- 1. Revoke dangerous broad permissions from anonymous users on sensitive family tables
REVOKE ALL ON public.families FROM anon;
REVOKE ALL ON public.family_memberships FROM anon;
REVOKE ALL ON public.family_access_requests FROM anon;
REVOKE ALL ON public.family_permissions FROM anon;

-- Grant proper permissions to authenticated users (governed by RLS) and backend service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.families TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_memberships TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_access_requests TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_permissions TO authenticated, service_role;

-- 2. Clean up any custom-table password storage (passwords must solely exist within Supabase Auth)
ALTER TABLE public.family_memberships DROP COLUMN IF EXISTS password_hash;
ALTER TABLE public.family_memberships DROP COLUMN IF EXISTS password_salt;
ALTER TABLE public.users DROP COLUMN IF EXISTS password;
ALTER TABLE public.users DROP COLUMN IF EXISTS password_hash;
ALTER TABLE public.users DROP COLUMN IF EXISTS password_salt;

-- 3. Ensure proper indexing for query performance and relational integrity
CREATE INDEX IF NOT EXISTS idx_families_admin_user_id ON public.families(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_family_memberships_fam_user ON public.family_memberships(family_id, user_id);
CREATE INDEX IF NOT EXISTS idx_family_memberships_user_only ON public.family_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_family_permissions_composite ON public.family_permissions(family_id, member_user_id, admin_user_id);
CREATE INDEX IF NOT EXISTS idx_family_access_requests_fam ON public.family_access_requests(family_id);

-- 4. Harden Row Level Security (RLS) Policies on Family Domain

-- Families Table Policies
DROP POLICY IF EXISTS "Family members can view their own family" ON public.families;
CREATE POLICY "Family members can view their own family" ON public.families
  FOR SELECT TO authenticated
  USING (
    admin_user_id = auth.uid() OR
    id IN (
      SELECT family_id FROM public.family_memberships 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Family admin can update family" ON public.families;
DROP POLICY IF EXISTS "Family head can update their family" ON public.families;
CREATE POLICY "Family head can update their family" ON public.families
  FOR UPDATE TO authenticated
  USING (
    admin_user_id = auth.uid() OR
    id IN (
      SELECT family_id FROM public.family_memberships 
      WHERE user_id = auth.uid() AND role IN ('admin', 'family_head') AND status = 'active'
    )
  );

-- Family Memberships Table Policies
DROP POLICY IF EXISTS "Family members can view memberships in same family" ON public.family_memberships;
CREATE POLICY "Family members can view memberships in same family" ON public.family_memberships
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    family_id IN (
      SELECT fm.family_id FROM public.family_memberships fm 
      WHERE fm.user_id = auth.uid() AND fm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Family head can manage memberships" ON public.family_memberships;
CREATE POLICY "Family head can manage memberships" ON public.family_memberships
  FOR ALL TO authenticated
  USING (
    family_id IN (
      SELECT f.id FROM public.families f WHERE f.admin_user_id = auth.uid()
      UNION
      SELECT fm.family_id FROM public.family_memberships fm 
      WHERE fm.user_id = auth.uid() AND fm.role IN ('admin', 'family_head') AND fm.status = 'active'
    )
  )
  WITH CHECK (
    family_id IN (
      SELECT f.id FROM public.families f WHERE f.admin_user_id = auth.uid()
      UNION
      SELECT fm.family_id FROM public.family_memberships fm 
      WHERE fm.user_id = auth.uid() AND fm.role IN ('admin', 'family_head') AND fm.status = 'active'
    )
  );

-- Family Permissions Table Policies
DROP POLICY IF EXISTS "Users can view and manage their own granted permissions" ON public.family_permissions;
CREATE POLICY "Users can view and manage their own granted permissions" ON public.family_permissions
  FOR ALL TO authenticated
  USING (
    member_user_id = auth.uid() OR
    admin_user_id = auth.uid()
  )
  WITH CHECK (
    member_user_id = auth.uid() OR
    admin_user_id = auth.uid()
  );

-- Family Access Requests Policies
DROP POLICY IF EXISTS "Users can view and respond to access requests targeting them or sent by them" ON public.family_access_requests;
CREATE POLICY "Users can view and respond to access requests targeting them or sent by them" ON public.family_access_requests
  FOR ALL TO authenticated
  USING (
    target_user_id = auth.uid() OR
    requester_id = auth.uid()
  )
  WITH CHECK (
    target_user_id = auth.uid() OR
    requester_id = auth.uid()
  );

-- 5. Harden Health Records Cross-Family Isolation & Permission Enforcement
DROP POLICY IF EXISTS "health_records_family_access" ON public.health_records;
DROP POLICY IF EXISTS "health_records_self_manage" ON public.health_records;

-- Personal health records management for own user_id
CREATE POLICY "health_records_self_manage" ON public.health_records
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Family Head selective read access based on active family membership & permissions
CREATE POLICY "health_records_family_head_read" ON public.health_records
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id OR
    user_id IN (
      SELECT fm.user_id 
      FROM public.family_memberships fm
      JOIN public.family_permissions fp 
        ON fp.family_id = fm.family_id 
        AND fp.member_user_id = fm.user_id
      WHERE fp.admin_user_id = auth.uid()
        AND fp.private_health_history = true
    )
  );

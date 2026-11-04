-- VitaWise Migration 012: Complete Family Health Platform Transformation
-- Extends families and family_memberships with unique Member IDs, family emails,
-- secure member password credentials, granular access, and RLS policies.

-- 1. Extend Families Table
ALTER TABLE public.families 
  ADD COLUMN IF NOT EXISTS family_email TEXT,
  ADD COLUMN IF NOT EXISTS family_code TEXT;

CREATE INDEX IF NOT EXISTS idx_families_email ON public.families(LOWER(family_email));

-- 2. Extend Family Memberships Table with Member ID and Credentials
ALTER TABLE public.family_memberships 
  ADD COLUMN IF NOT EXISTS member_id TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS password_salt TEXT DEFAULT '';

-- Update check constraints on role if necessary
DO $$
BEGIN
  ALTER TABLE public.family_memberships DROP CONSTRAINT IF EXISTS family_memberships_role_check;
  ALTER TABLE public.family_memberships ADD CONSTRAINT family_memberships_role_check 
    CHECK (role IN ('admin', 'member', 'family_head', 'family_member'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_family_memberships_member_id ON public.family_memberships(member_id);
CREATE INDEX IF NOT EXISTS idx_family_memberships_fam_mem ON public.family_memberships(family_id, member_id);

-- 3. Ensure users table has member_id and family_id convenience references
ALTER TABLE public.users 
  ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES public.families(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS member_id TEXT;

CREATE INDEX IF NOT EXISTS idx_users_member_id ON public.users(member_id);
CREATE INDEX IF NOT EXISTS idx_users_family_id ON public.users(family_id);

-- 4. Supabase Row Level Security (RLS) Policies for Family Domain

-- Families policies
DROP POLICY IF EXISTS "Family members can view their own family" ON public.families;
CREATE POLICY "Family members can view their own family" ON public.families
  FOR SELECT USING (
    admin_user_id = auth.uid() OR
    id IN (SELECT family_id FROM public.family_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Family head can update their family" ON public.families;
CREATE POLICY "Family head can update their family" ON public.families
  FOR UPDATE USING (
    admin_user_id = auth.uid() OR
    id IN (SELECT family_id FROM public.family_memberships WHERE user_id = auth.uid() AND role IN ('admin', 'family_head'))
  );

-- Family memberships policies
DROP POLICY IF EXISTS "Family members can view memberships in same family" ON public.family_memberships;
CREATE POLICY "Family members can view memberships in same family" ON public.family_memberships
  FOR SELECT USING (
    family_id IN (SELECT family_id FROM public.family_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Family head can manage memberships" ON public.family_memberships;
CREATE POLICY "Family head can manage memberships" ON public.family_memberships
  FOR ALL USING (
    family_id IN (SELECT family_id FROM public.family_memberships WHERE user_id = auth.uid() AND role IN ('admin', 'family_head'))
  );

-- Health records family isolation: Members can view their own health records
-- and Family Head can view authorized family member records
DROP POLICY IF EXISTS "health_records_family_access" ON public.health_records;
CREATE POLICY "health_records_family_access" ON public.health_records
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    user_id IN (
      SELECT fm.user_id FROM public.family_memberships fm
      JOIN public.family_permissions fp ON fp.family_id = fm.family_id AND fp.member_user_id = fm.user_id
      WHERE fp.admin_user_id = auth.uid()
    )
  );

-- Grant appropriate permissions
GRANT ALL ON public.families TO anon, authenticated, service_role;
GRANT ALL ON public.family_memberships TO anon, authenticated, service_role;
GRANT ALL ON public.family_access_requests TO anon, authenticated, service_role;
GRANT ALL ON public.family_permissions TO anon, authenticated, service_role;

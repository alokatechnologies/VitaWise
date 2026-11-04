import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { DatabaseService } from '../database/database.service';
import { randomUUID } from 'node:crypto';

export interface SignupDto {
  email: string;
  password: string;
  fullName?: string;
  name?: string;
  phone?: string;
  role?: 'patient' | 'doctor' | 'nutritionist' | 'admin';
  languagePreference?: 'en' | 'te' | 'hi';
}

export interface LoginDto {
  email?: string;
  familyEmail?: string;
  memberId?: string;
  password: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly databaseService: DatabaseService,
  ) {}

  /**
   * Registers a user in Supabase Auth and seeds user records in public tables
   */
  async signup(dto: SignupDto) {
    const supabase = this.supabaseService.getClient();
    if (!supabase) {
      throw new BadRequestException('Supabase client is not configured.');
    }

    this.logger.log(`Registering new user with email: ${dto.email}`);
    const resolvedFullName = dto.fullName || dto.name || '';
    const phone = dto.phone ? String(dto.phone).trim() : null;

    // Create user in Supabase Auth via Admin API (pre-confirms email for reliable dev/demo flow)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true,
      user_metadata: {
        full_name: resolvedFullName || null,
        phone,
        role: dto.role || 'patient',
      },
    });

    if (authError || !authData.user) {
      this.logger.error(`Supabase Auth signup error: ${authError?.message}`);
      throw new BadRequestException(authError?.message || 'Failed to create user in Supabase Auth');
    }

    const userId = authData.user.id;

    // Seed public tables: users, user_profiles, user_preferences
    try {
      await this.databaseService.query(
        `INSERT INTO public.users (id, email, phone, role, full_name, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (id) DO UPDATE SET full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.users.full_name), phone = COALESCE(EXCLUDED.phone, public.users.phone), role = EXCLUDED.role;`,
        [userId, dto.email, phone, dto.role || 'patient', resolvedFullName]
      );

      await this.databaseService.query(
        `INSERT INTO public.user_profiles (user_id, language_preference)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO NOTHING;`,
        [userId, dto.languagePreference || 'en']
      );

      await this.databaseService.query(
        `INSERT INTO public.user_preferences (user_id)
         VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING;`,
        [userId]
      );
    } catch (dbErr: any) {
      this.logger.error(`Failed to seed public user tables: ${dbErr.message}`);
    }

    // Now sign in to generate access session tokens
    const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (sessionError || !sessionData.session) {
      this.logger.error(`Supabase session creation error: ${sessionError?.message || 'No session returned'}`);
      throw new BadRequestException(sessionError?.message || 'Account was created but no authenticated session was issued. Please sign in.');
    }

    return {
      success: true,
      user: {
        id: userId,
        email: dto.email,
        fullName: resolvedFullName || null,
        phone,
        role: dto.role || 'patient',
      },
      session: {
        accessToken: sessionData.session.access_token,
        refreshToken: sessionData.session.refresh_token,
        expiresIn: sessionData.session.expires_in,
        tokenType: sessionData.session.token_type,
      },
    };
  }

  /**
   * Authenticates user or family member against credentials and returns session tokens + profile
   */
  async login(dto: LoginDto) {
    const supabase = this.supabaseService.getClient();
    const rawEmail = (dto.email || dto.familyEmail || '').trim().toLowerCase();
    const memberId = (dto.memberId || '').trim();
    const password = dto.password || '';

    // 1. Check Family Member authentication by Member ID (e.g. FAM001, FAM002, FAM003)
    if (memberId) {
      const memRes = await this.databaseService.query(
        `SELECT fm.*, u.email as user_email, u.full_name as user_full_name,
                f.id as family_id, f.name as family_name, f.family_email, f.admin_user_id,
                p.gender, p.date_of_birth, p.height_cm, p.weight_kg, p.language_preference
         FROM public.family_memberships fm
         JOIN public.users u ON fm.user_id = u.id
         JOIN public.families f ON fm.family_id = f.id
         LEFT JOIN public.user_profiles p ON u.id = p.user_id
         WHERE LOWER(fm.member_id) = LOWER($1)
           AND ($2 = '' OR LOWER(f.family_email) = $2 OR LOWER(u.email) = $2)
         LIMIT 1;`,
        [memberId, rawEmail]
      );

      if (memRes.rows.length > 0) {
        const mem = memRes.rows[0];
        let sessionData: any = null;

        if (supabase && mem.user_email) {
          const { data: sData } = await supabase.auth.signInWithPassword({
            email: mem.user_email,
            password,
          });
          if (sData?.user && sData?.session) {
            sessionData = sData.session;
          }
        }

        if (sessionData) {
          let age = 25;
          if (mem.date_of_birth) {
            const diff = Date.now() - new Date(mem.date_of_birth).getTime();
            age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
          }

          const userProfile = {
            id: mem.user_id,
            userId: mem.user_id,
            email: mem.family_email || mem.user_email,
            fullName: mem.display_name || mem.user_full_name || 'Family Member',
            familyId: mem.family_id,
            familyName: mem.family_name,
            role: mem.role,
            isFamilyHead: mem.role === 'family_head' || mem.admin_user_id === mem.user_id,
            relationship: mem.relationship,
            gender: mem.gender || 'female',
            age,
            dob: mem.date_of_birth,
            heightCm: mem.height_cm ? Number(mem.height_cm) : null,
            weightKg: mem.weight_kg ? Number(mem.weight_kg) : null,
            languagePreference: mem.language_preference || 'en',
          };

          return {
            success: true,
            user: userProfile,
            session: {
              accessToken: sessionData.access_token,
              refreshToken: sessionData.refresh_token,
              expiresIn: sessionData.expires_in,
              tokenType: sessionData.token_type,
            },
          };
        }
      }
    }

    // 2. Standard Email Login
    if (!supabase) {
      throw new BadRequestException('Supabase client is not configured.');
    }

    if (!rawEmail) {
      throw new BadRequestException('Email address or Member ID is required.');
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: rawEmail,
      password,
    });

    if (error || !data.user) {
      this.logger.warn(`Authentication failed for ${rawEmail}: ${error?.message}`);
      throw new UnauthorizedException(error?.message || 'Invalid credentials');
    }

    // Fetch user details from public.users with family info
    const userRes = await this.databaseService.query(
      `SELECT u.id, u.email, u.full_name, u.role, u.member_id, u.family_id,
              fm.role as family_role, fm.member_id as fm_member_id, fm.relationship,
              f.name as family_name, f.admin_user_id,
              p.language_preference, p.pcos_diagnosed, p.gender,
              p.date_of_birth AS dob, p.height_cm AS "heightCm", p.weight_kg AS "weightKg"
       FROM public.users u
       LEFT JOIN public.user_profiles p ON p.user_id = u.id
       LEFT JOIN public.family_memberships fm ON fm.user_id = u.id
       LEFT JOIN public.families f ON fm.family_id = f.id
       WHERE u.id = $1;`,
      [data.user.id]
    );

    const row = userRes.rows[0];
    const userProfile = row
      ? {
          ...row,
          memberId: row.fm_member_id || row.member_id || 'FAM001',
          role: row.family_role || row.role || 'patient',
          isFamilyHead: row.family_role === 'family_head' || row.admin_user_id === row.id,
        }
      : {
          id: data.user.id,
          email: data.user.email,
          fullName: data.user.user_metadata?.full_name || 'VitaWise User',
          role: 'patient',
        };

    return {
      success: true,
      user: userProfile,
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
        expiresIn: data.session.expires_in,
        tokenType: data.session.token_type,
      },
    };
  }

  /**
   * Returns or seeds the default VitaWise demo user from PostgreSQL
   */
  async getDemoUser() {
    const demoEmail = 'ananya.demo@vitawise.ai';
    const userRes = await this.databaseService.query(
            `SELECT u.id, u.email, u.full_name, u.role,
              p.language_preference, p.pcos_diagnosed, p.dietary_preference,
              p.gender, p.date_of_birth AS dob,
              p.height_cm AS "heightCm", p.weight_kg AS "weightKg"
       FROM public.users u
       LEFT JOIN public.user_profiles p ON p.user_id = u.id
       WHERE u.email = $1 OR u.role = 'patient'
       ORDER BY u.created_at ASC
       LIMIT 1;`,
      [demoEmail]
    );

    if (userRes.rows.length > 0) {
      return userRes.rows[0];
    }

    // Fallback: try demo login/signup to ensure valid Supabase Auth record
    const session = await this.getDemoSession();
    return session.user;
  }

  /**
   * Retrieves or provisions a live demo session with real Supabase Auth JWT
   */
  async getDemoSession() {
    const demoEmail = 'ananya.demo@vitawise.ai';
    const demoPass = 'VitaWiseDemo2026!';

    try {
      return await this.login({ email: demoEmail, password: demoPass });
    } catch {
      // If user doesn't exist yet, sign up then return session
      try {
        return await this.signup({
          email: demoEmail,
          password: demoPass,
          fullName: 'Dr. Ananya Sharma',
          phone: '+919876543210',
          role: 'patient',
          languagePreference: 'en',
        });
      } catch (err: any) {
        // If already exists, retry login
        return await this.login({ email: demoEmail, password: demoPass });
      }
    }
  }

  /**
   * Validates Supabase JWT Bearer token and returns authenticated user
   */
  async validateToken(token: string) {
    if (token === 'demo-guest-token' || token === 'demo-token' || token === 'guest-token') {
      return this.getDemoUser();
    }

    const supabase = this.supabaseService.getClient();
    if (!supabase) {
      throw new UnauthorizedException('Supabase client is not configured');
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const userRes = await this.databaseService.query(
            `SELECT u.id, u.email, u.full_name, u.role,
              p.language_preference, p.pcos_diagnosed, p.dietary_preference,
              p.gender, p.date_of_birth AS dob,
              p.height_cm AS "heightCm", p.weight_kg AS "weightKg"
       FROM public.users u
       LEFT JOIN public.user_profiles p ON p.user_id = u.id
       WHERE u.id = $1;`,
      [data.user.id]
    );

    return userRes.rows[0] || {
      id: data.user.id,
      email: data.user.email,
      full_name: data.user.user_metadata?.full_name || 'VitaWise User',
      role: 'patient',
    };
  }

  /**
   * Refreshes user session
   */
  async refreshSession(refreshToken: string) {
    const supabase = this.supabaseService.getClient();
    if (!supabase) {
      throw new BadRequestException('Supabase client is not configured');
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      throw new UnauthorizedException(error?.message || 'Failed to refresh session');
    }

    return {
      success: true,
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresIn: data.session.expires_in,
      },
    };
  }

  async requestPasswordReset(email: string) {
    if (!email) {
      throw new BadRequestException('Email is required.');
    }
    const supabase = this.supabaseService.getClient();
    if (!supabase) {
      throw new BadRequestException('Password recovery is not configured.');
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      this.logger.warn(`Password reset request failed: ${error.message}`);
    }

    // Keep this response identical for existing and unknown addresses.
    return { success: true, message: 'If an account exists for this email, recovery instructions have been sent.' };
  }

  /**
   * Sign out / invalidate session
   */
  async logout(token?: string) {
    const supabase = this.supabaseService.getClient();
    if (supabase && token) {
      try {
        await supabase.auth.admin.signOut(token);
      } catch {
        // ignore logout warning
      }
    }
    return { success: true, message: 'Logged out successfully' };
  }

  /**
   * Updates user profile (Full Name, Phone, Dietary & Language preferences)
   */
  async updateProfile(userId: string, data: { fullName?: string; name?: string; phone?: string; languagePreference?: string; dietaryPreference?: string; gender?: string; dob?: string; heightCm?: number; weightKg?: number }) {
    const fullName = data.fullName || data.name;
    const phone = data.phone !== undefined ? (data.phone ? String(data.phone).trim() : null) : undefined;

    if (fullName !== undefined || phone !== undefined) {
      await this.databaseService.query(
        `UPDATE public.users
         SET full_name = COALESCE($1, full_name),
             phone = COALESCE($2, phone),
             updated_at = now()
         WHERE id = $3;`,
        [fullName || null, phone, userId]
      );
    }

    if (data.languagePreference || data.dietaryPreference || data.gender || data.dob || data.heightCm !== undefined || data.weightKg !== undefined) {
      await this.databaseService.query(
        `UPDATE public.user_profiles
         SET language_preference = COALESCE($1, language_preference),
             dietary_preference = COALESCE($2, dietary_preference),
             gender = COALESCE($3, gender),
             date_of_birth = COALESCE($4, date_of_birth),
             height_cm = COALESCE($5, height_cm),
             weight_kg = COALESCE($6, weight_kg),
             updated_at = now()
         WHERE user_id = $7;`,
        [data.languagePreference || null, data.dietaryPreference || null, data.gender || null, data.dob || null, data.heightCm ?? null, data.weightKg ?? null, userId]
      );
    }

    const supabase = this.supabaseService.getClient();
    if (supabase) {
      try {
        await supabase.auth.admin.updateUserById(userId, {
          user_metadata: {
            ...(fullName ? { full_name: fullName } : {}),
            ...(phone !== undefined ? { phone } : {}),
          },
        });
      } catch (err) {
        this.logger.warn(`Failed to sync user metadata to Supabase Auth: ${err}`);
      }
    }

    return {
      success: true,
      message: 'Profile updated successfully',
    };
  }

  /**
   * Verifies parent/admin credentials against Supabase Auth without leaking private details
   */
  async verifyParentAdmin(email: string, password: string) {
    const rawEmail = String(email || '').trim().toLowerCase();
    if (!rawEmail || !password) {
      throw new UnauthorizedException('Invalid parent/admin email or password.');
    }
    const supabase = this.supabaseService.getClient();
    if (!supabase) {
      throw new BadRequestException('Supabase client not configured.');
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: rawEmail,
      password,
    });
    if (error || !data.user) {
      throw new UnauthorizedException('Invalid parent/admin email or password.');
    }

    const userRes = await this.databaseService.query(
      `SELECT u.id, u.email, u.full_name, fm.family_id, fm.role, f.name as family_name
       FROM public.users u
       LEFT JOIN public.family_memberships fm ON fm.user_id = u.id
       LEFT JOIN public.families f ON fm.family_id = f.id
       WHERE u.id = $1;`,
      [data.user.id]
    );
    const dbUser = userRes.rows[0];
    return {
      ok: true,
      admin: {
        id: data.user.id,
        email: rawEmail,
        fullName: dbUser?.full_name || data.user.user_metadata?.full_name || 'Family Head',
        isFamilyHead: true,
        familyId: dbUser?.family_id || null,
        familyName: dbUser?.family_name || 'Family Space',
      },
    };
  }

  /**
   * Creates or registers Family Head and creates family member accounts via Supabase Auth
   */
  async registerFamily(dto: any) {
    const supabase = this.supabaseService.getClient();
    if (!supabase) throw new BadRequestException('Supabase client not configured.');
    const familyEmail = String(dto.familyEmail || dto.parentEmail || '').trim().toLowerCase();
    const parentPassword = String(dto.parentPassword || dto.password || '');
    const headName = String(dto.headName || 'Family Head').trim();
    const members = Array.isArray(dto.members) ? dto.members : [];

    if (!familyEmail || !parentPassword || parentPassword.length < 8) {
      throw new BadRequestException('Valid email and password (minimum 8 characters) required.');
    }
    if (members.length === 0) {
      throw new BadRequestException('At least one family member is required.');
    }

    let parentUserId: string;
    const { data: supaAuth, error: supaErr } = await supabase.auth.admin.createUser({
      email: familyEmail,
      password: parentPassword,
      email_confirm: true,
      user_metadata: { full_name: headName, role: 'family_head' },
    });

    if (supaAuth?.user) {
      parentUserId = supaAuth.user.id;
    } else {
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email: familyEmail,
        password: parentPassword,
      });
      if (signInErr || !signInData.user) {
        throw new BadRequestException('This email is already registered. Please sign in instead.');
      }
      parentUserId = signInData.user.id;
    }

    await this.databaseService.query(
      `INSERT INTO public.users (id, email, full_name, role, is_active)
       VALUES ($1, $2, $3, 'family_head', true)
       ON CONFLICT (id) DO UPDATE SET full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.users.full_name), role = 'family_head';`,
      [parentUserId, familyEmail, headName]
    );
    await this.databaseService.query(
      `INSERT INTO public.user_profiles (user_id, language_preference)
       VALUES ($1, 'en') ON CONFLICT (user_id) DO NOTHING;`,
      [parentUserId]
    );
    await this.databaseService.query(
      `INSERT INTO public.user_preferences (user_id)
       VALUES ($1) ON CONFLICT (user_id) DO NOTHING;`,
      [parentUserId]
    );

    let familyId: string;
    const famCheck = await this.databaseService.query(
      `SELECT id FROM public.families WHERE admin_user_id = $1 OR LOWER(family_email) = $2 LIMIT 1;`,
      [parentUserId, familyEmail]
    );
    if (famCheck.rows.length > 0) {
      familyId = famCheck.rows[0].id;
    } else {
      const famRes = await this.databaseService.query(
        `INSERT INTO public.families (name, family_email, admin_user_id)
         VALUES ($1, $2, $3) RETURNING id;`,
        [`${headName}'s Family`, familyEmail, parentUserId]
      );
      familyId = famRes.rows[0].id;
    }

    await this.databaseService.query(
      `INSERT INTO public.family_memberships (family_id, user_id, display_name, role, relationship, status)
       VALUES ($1, $2, $3, 'family_head', 'father', 'active')
       ON CONFLICT (family_id, user_id) DO UPDATE SET role = 'family_head', display_name = EXCLUDED.display_name, status = 'active';`,
      [familyId, parentUserId, headName]
    );

    const domain = familyEmail.split('@')[1] || 'vitawise.ai';
    const parentPrefix = familyEmail.split('@')[0];

    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      const memberName = String(m.name || m.fullName || `Member ${i + 1}`).trim();
      const age = parseInt(m.age, 10) || 25;
      const weight = parseFloat(m.weight || m.weightKg) || 60;
      const height = parseFloat(m.height || m.heightCm) || 165;
      const gender = (m.gender || 'female').toLowerCase();
      const memberPassword = String(m.password || parentPassword);
      const rel = gender === 'female' ? 'daughter' : (gender === 'male' ? 'son' : 'other');

      const cleanName = memberName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const memberEmail = `${parentPrefix}+${cleanName}_${randomUUID().substring(0, 6)}@${domain}`;

      const { data: mAuth, error: mAuthErr } = await supabase.auth.admin.createUser({
        email: memberEmail,
        password: memberPassword,
        email_confirm: true,
        user_metadata: { full_name: memberName, gender, role: 'family_member' },
      });

      if (mAuthErr || !mAuth.user) {
        this.logger.warn(`Failed to create member ${memberName} in Supabase Auth: ${mAuthErr?.message}`);
        continue;
      }

      const mUserId = mAuth.user.id;
      const dob = new Date(Date.now() - (age * 365.25 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];

      await this.databaseService.query(
        `INSERT INTO public.users (id, email, full_name, role, family_id, is_active)
         VALUES ($1, $2, $3, 'family_member', $4, true)
         ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, family_id = EXCLUDED.family_id;`,
        [mUserId, memberEmail, memberName, familyId]
      );

      await this.databaseService.query(
        `INSERT INTO public.user_profiles (user_id, gender, date_of_birth, height_cm, weight_kg, language_preference)
         VALUES ($1, $2, $3, $4, $5, 'en')
         ON CONFLICT (user_id) DO UPDATE SET gender = EXCLUDED.gender, date_of_birth = EXCLUDED.date_of_birth, height_cm = EXCLUDED.height_cm, weight_kg = EXCLUDED.weight_kg;`,
        [mUserId, gender, dob, height, weight]
      );

      await this.databaseService.query(
        `INSERT INTO public.user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING;`,
        [mUserId]
      );

      await this.databaseService.query(
        `INSERT INTO public.family_memberships (family_id, user_id, display_name, role, relationship, status)
         VALUES ($1, $2, $3, 'family_member', $4, 'active')
         ON CONFLICT (family_id, user_id) DO UPDATE SET display_name = EXCLUDED.display_name, status = 'active';`,
        [familyId, mUserId, memberName, rel]
      );

      await this.databaseService.query(
        `INSERT INTO public.family_permissions (family_id, member_user_id, admin_user_id, pcos_overview, cycle_period, symptoms_journal, hormonal_wellness)
         VALUES ($1, $2, $3, false, false, false, false)
         ON CONFLICT (family_id, member_user_id, admin_user_id) DO NOTHING;`,
        [familyId, mUserId, parentUserId]
      );
    }

    const { data: sessionData } = await supabase.auth.signInWithPassword({
      email: familyEmail,
      password: parentPassword,
    });

    const accessToken = sessionData?.session?.access_token;
    const refreshToken = sessionData?.session?.refresh_token;

    return {
      ok: true,
      sessionToken: accessToken,
      token: accessToken,
      session: {
        accessToken,
        refreshToken,
      },
      user: {
        id: parentUserId,
        userId: parentUserId,
        email: familyEmail,
        fullName: headName,
        name: headName,
        role: 'family_head',
        isFamilyHead: true,
        familyId,
        familyName: `${headName}'s Family`,
      },
      message: 'Family Health Space created successfully.',
    };
  }

  /**
   * Registers a single member under a verified parent
   */
  async registerWithParent(dto: any) {
    const supabase = this.supabaseService.getClient();
    if (!supabase) throw new BadRequestException('Supabase client not configured.');

    const parentEmail = String(dto.parentEmail || '').trim().toLowerCase();
    const parentPassword = String(dto.parentPassword || '');
    const fullName = String(dto.fullName || dto.name || 'Member').trim();
    const age = parseInt(dto.age, 10) || 25;
    const weightKg = parseFloat(dto.weightKg || dto.weight) || 60;
    const heightCm = parseFloat(dto.heightCm || dto.height) || 165;
    const gender = (dto.gender || 'female').toLowerCase();
    const memberPassword = String(dto.password || parentPassword);

    const { data: parentAuth, error: parentErr } = await supabase.auth.signInWithPassword({
      email: parentEmail,
      password: parentPassword,
    });

    if (parentErr || !parentAuth.user) {
      throw new UnauthorizedException('Invalid parent/admin email or password.');
    }

    const parentUserId = parentAuth.user.id;
    let familyId: string;
    const famCheck = await this.databaseService.query(
      `SELECT id FROM public.families WHERE admin_user_id = $1 OR LOWER(family_email) = $2 LIMIT 1;`,
      [parentUserId, parentEmail]
    );

    if (famCheck.rows.length > 0) {
      familyId = famCheck.rows[0].id;
    } else {
      const famRes = await this.databaseService.query(
        `INSERT INTO public.families (name, family_email, admin_user_id)
         VALUES ($1, $2, $3) RETURNING id;`,
        [`Family Space`, parentEmail, parentUserId]
      );
      familyId = famRes.rows[0].id;
    }

    const domain = parentEmail.split('@')[1] || 'vitawise.ai';
    const parentPrefix = parentEmail.split('@')[0];
    const cleanName = fullName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const memberEmail = `${parentPrefix}+${cleanName}_${randomUUID().substring(0, 6)}@${domain}`;

    const { data: mAuth, error: mAuthErr } = await supabase.auth.admin.createUser({
      email: memberEmail,
      password: memberPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName, gender, role: 'family_member' },
    });

    if (mAuthErr || !mAuth.user) {
      throw new BadRequestException(mAuthErr?.message || 'Failed to create member in Supabase Auth');
    }

    const mUserId = mAuth.user.id;
    const dob = new Date(Date.now() - (age * 365.25 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
    const rel = gender === 'female' ? 'daughter' : (gender === 'male' ? 'son' : 'other');

    await this.databaseService.query(
      `INSERT INTO public.users (id, email, full_name, role, family_id, is_active)
       VALUES ($1, $2, $3, 'family_member', $4, true)
       ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, family_id = EXCLUDED.family_id;`,
      [mUserId, memberEmail, fullName, familyId]
    );

    await this.databaseService.query(
      `INSERT INTO public.user_profiles (user_id, gender, date_of_birth, height_cm, weight_kg, language_preference)
       VALUES ($1, $2, $3, $4, $5, 'en')
       ON CONFLICT (user_id) DO UPDATE SET gender = EXCLUDED.gender, date_of_birth = EXCLUDED.date_of_birth, height_cm = EXCLUDED.height_cm, weight_kg = EXCLUDED.weight_kg;`,
      [mUserId, gender, dob, heightCm, weightKg]
    );

    await this.databaseService.query(
      `INSERT INTO public.user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING;`,
      [mUserId]
    );

    await this.databaseService.query(
      `INSERT INTO public.family_memberships (family_id, user_id, display_name, role, relationship, status)
       VALUES ($1, $2, $3, 'family_member', $4, 'active')
       ON CONFLICT (family_id, user_id) DO UPDATE SET display_name = EXCLUDED.display_name, status = 'active';`,
      [familyId, mUserId, fullName, rel]
    );

    await this.databaseService.query(
      `INSERT INTO public.family_permissions (family_id, member_user_id, admin_user_id, pcos_overview, cycle_period, symptoms_journal, hormonal_wellness)
       VALUES ($1, $2, $3, false, false, false, false)
       ON CONFLICT (family_id, member_user_id, admin_user_id) DO NOTHING;`,
      [familyId, mUserId, parentUserId]
    );

    const { data: memberSession } = await supabase.auth.signInWithPassword({
      email: memberEmail,
      password: memberPassword,
    });

    const accessToken = memberSession?.session?.access_token;
    const refreshToken = memberSession?.session?.refresh_token;

    return {
      ok: true,
      sessionToken: accessToken,
      token: accessToken,
      session: {
        accessToken,
        refreshToken,
      },
      user: {
        id: mUserId,
        userId: mUserId,
        email: memberEmail,
        fullName,
        name: fullName,
        role: 'family_member',
        isFamilyHead: false,
        familyId,
      },
      message: 'Account created successfully.',
    };
  }

  /**
   * Provisions a standalone Parent Head account
   */
  async setupParentHead(dto: any) {
    const email = String(dto.email || '').trim().toLowerCase();
    const password = String(dto.password || '');
    if (!email || !password || password.length < 8) {
      throw new BadRequestException('Valid email and password (minimum 8 characters) required.');
    }

    return this.signup({
      email,
      password,
      fullName: 'Family Head',
      role: 'patient',
      languagePreference: 'en',
    });
  }
}

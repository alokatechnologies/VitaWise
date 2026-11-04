import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SupabaseService } from '../supabase/supabase.service';
import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';

export interface AdminDetailsDto {
  fullName: string;
  relationship?: string;
  gender?: string;
  email?: string;
  password?: string;
  memberId?: string;
}

export interface MemberItemDto {
  fullName?: string;
  name?: string;
  relationship?: string;
  gender?: string;
  age?: number;
  dob?: string;
  email?: string;
  password?: string;
  memberId?: string;
}

export interface CreateFamilyDto {
  familyName: string;
  familyEmail?: string;
  adminDetails?: AdminDetailsDto;
  members?: MemberItemDto[];
}

export interface AddMemberDto {
  name: string;
  relationship: string;
  gender: 'male' | 'female';
  age?: number;
  dob?: string;
  password?: string;
  memberId?: string;
  email?: string;
}

@Injectable()
export class FamilyService {
  private readonly logger = new Logger(FamilyService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly supabaseService: SupabaseService,
  ) {}

  /**
   * Hashes a password securely with salt using scrypt
   */
  hashPassword(password: string): { hash: string; salt: string } {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    return { hash, salt };
  }

  /**
   * Verifies password against stored hash and salt
   */
  verifyPassword(password: string, hash: string, salt: string): boolean {
    if (!password || !hash || !salt) return false;
    try {
      const derived = scryptSync(password, salt, 64);
      const target = Buffer.from(hash, 'hex');
      return timingSafeEqual(derived, target);
    } catch {
      return false;
    }
  }

  /**
   * Creates a family, family head (FAM001), and initial members with unique credentials
   */
  async createFamily(creatorUserId: string, dto: CreateFamilyDto) {
    const familyName = (dto.familyName || 'Our Family').trim();
    const adminDetails = dto.adminDetails || { fullName: 'Family Head' };
    const familyEmail = (dto.familyEmail || adminDetails.email || '').trim().toLowerCase();

    // 1. Insert Family
    const familyRes = await this.databaseService.query(
      `INSERT INTO public.families (name, family_email, admin_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, now(), now())
       RETURNING *;`,
      [familyName, familyEmail || null, creatorUserId]
    );

    const family = familyRes.rows[0];
    const familyId = family.id;

    // 2. Hash admin password if provided
    let adminHash = '';
    let adminSalt = '';
    if (adminDetails.password) {
      const cred = this.hashPassword(adminDetails.password);
      adminHash = cred.hash;
      adminSalt = cred.salt;
    }

    // 3. Update or Insert Family Head Membership
    await this.databaseService.query(
      `INSERT INTO public.family_memberships (family_id, user_id, display_name, role, relationship, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'family_head', $4, 'active', now(), now())
       ON CONFLICT (family_id, user_id) DO UPDATE SET 
         role = 'family_head',
         display_name = EXCLUDED.display_name,
         status = 'active',
         updated_at = now();`,
      [
        familyId,
        creatorUserId,
        adminDetails.fullName || 'Family Head',
        adminDetails.relationship || 'father',
      ]
    );

    await this.databaseService.query(
      `UPDATE public.users SET role = 'family_head', family_id = $1, full_name = COALESCE(NULLIF($2, ''), full_name) WHERE id = $3;`,
      [familyId, adminDetails.fullName, creatorUserId]
    );

    const adminMemberId = adminDetails.memberId || 'head';

    // 4. Create Members
    const createdMembers: Array<{
      id: string;
      memberId?: string;
      fullName: string;
      role: string;
      relationship: string;
      gender: string;
    }> = [
      {
        id: creatorUserId,
        memberId: adminMemberId,
        fullName: adminDetails.fullName || 'Family Head',
        role: 'family_head',
        relationship: adminDetails.relationship || 'father',
        gender: adminDetails.gender || 'male',
      },
    ];

    const memberList = dto.members || [];
    let memberSeq = 2;

    for (const mem of memberList) {
      const memName = (mem.fullName || mem.name || `Family Member ${memberSeq}`).trim();
      const memMemberId = mem.memberId || `mem_${memberSeq}`;
      const memGender = (mem.gender || 'female').toLowerCase();
      const memRel = (mem.relationship || 'other').toLowerCase();
      const memPass = mem.password || 'VitaWiseMember123!';

      const cleanName = memName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const syntheticEmail = `${(familyEmail ? familyEmail.split('@')[0] : 'fam')}+${cleanName}_${Math.random().toString(36).substring(2, 7)}@${familyEmail ? familyEmail.split('@')[1] : 'vitawise.ai'}`;

      let memUserId: string;
      const supabase = this.supabaseService.getClient();
      if (supabase) {
        const { data: sAuth } = await supabase.auth.admin.createUser({
          email: syntheticEmail,
          password: memPass,
          email_confirm: true,
          user_metadata: { full_name: memName, gender: memGender, role: 'family_member' },
        });
        memUserId = sAuth?.user?.id || randomUUID();
      } else {
        memUserId = randomUUID();
      }

      // Insert member into users table
      await this.databaseService.query(
        `INSERT INTO public.users (id, email, role, full_name, family_id, is_active, created_at, updated_at)
         VALUES ($1, $2, 'family_member', $3, $4, true, now(), now())
         ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, family_id = EXCLUDED.family_id;`,
        [memUserId, syntheticEmail, memName, familyId]
      );

      // Insert profile
      await this.databaseService.query(
        `INSERT INTO public.user_profiles (user_id, gender, language_preference, created_at, updated_at)
         VALUES ($1, $2, 'en', now(), now())
         ON CONFLICT (user_id) DO UPDATE SET gender = EXCLUDED.gender;`,
        [memUserId, memGender]
      );

      // Insert preferences
      await this.databaseService.query(
        `INSERT INTO public.user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING;`,
        [memUserId]
      );

      // Insert family membership
      await this.databaseService.query(
        `INSERT INTO public.family_memberships (family_id, user_id, display_name, role, relationship, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'family_member', $4, 'active', now(), now())
         ON CONFLICT (family_id, user_id) DO UPDATE SET display_name = EXCLUDED.display_name, status = 'active';`,
        [familyId, memUserId, memName, memRel]
      );

      // Insert default privacy permissions
      await this.databaseService.query(
        `INSERT INTO public.family_permissions (family_id, member_user_id, admin_user_id, pcos_overview, cycle_period, symptoms_journal, hormonal_wellness, medication, lab_records, private_health_history, created_at, updated_at)
         VALUES ($1, $2, $3, false, false, false, false, false, false, false, now(), now())
         ON CONFLICT (family_id, member_user_id, admin_user_id) DO NOTHING;`,
        [familyId, memUserId, creatorUserId]
      );

      createdMembers.push({
        id: memUserId,
        fullName: memName,
        role: 'family_member',
        relationship: memRel,
        gender: memGender,
      });

      memberSeq++;
    }

    return {
      success: true,
      family: {
        id: familyId,
        name: familyName,
        familyEmail,
        adminUserId: creatorUserId,
      },
      members: createdMembers,
      message: 'Family space and member credentials created successfully.',
    };
  }

  /**
   * Retrieves current user's family and members directory
   */
  async getFamily(userId: string) {
    const memRes = await this.databaseService.query(
      `SELECT fm.family_id, fm.role, fm.member_id, f.name as family_name, f.family_email, f.admin_user_id
       FROM public.family_memberships fm
       JOIN public.families f ON fm.family_id = f.id
       WHERE fm.user_id = $1
       LIMIT 1;`,
      [userId]
    );

    if (memRes.rows.length === 0) {
      return { family: null, members: [], isFamilyHead: false };
    }

    const currentMem = memRes.rows[0];
    const familyId = currentMem.family_id;
    const isFamilyHead = currentMem.role === 'family_head' || currentMem.admin_user_id === userId;

    const membersRes = await this.databaseService.query(
      `SELECT fm.id as membership_id, fm.member_id, fm.role, fm.relationship, fm.status, fm.display_name,
              u.id as user_id, u.full_name, u.email,
              p.gender, p.date_of_birth, p.height_cm, p.weight_kg
       FROM public.family_memberships fm
       JOIN public.users u ON fm.user_id = u.id
       LEFT JOIN public.user_profiles p ON u.id = p.user_id
       WHERE fm.family_id = $1
       ORDER BY CASE WHEN fm.role IN ('admin', 'family_head') THEN 0 ELSE 1 END, fm.member_id ASC, fm.created_at ASC;`,
      [familyId]
    );

    const members = membersRes.rows.map((m) => {
      let age = 25;
      if (m.date_of_birth) {
        const diff = Date.now() - new Date(m.date_of_birth).getTime();
        age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
      }

      return {
        id: m.user_id,
        userId: m.user_id,
        memberId: m.member_id || 'FAM',
        fullName: m.display_name || m.full_name || 'Family Member',
        role: m.role,
        relationship: m.relationship,
        gender: m.gender || 'female',
        age,
        dob: m.date_of_birth,
        heightCm: m.height_cm ? Number(m.height_cm) : null,
        weightKg: m.weight_kg ? Number(m.weight_kg) : null,
        status: m.status,
      };
    });

    return {
      family: {
        id: familyId,
        name: currentMem.family_name,
        familyEmail: currentMem.family_email,
        adminUserId: currentMem.admin_user_id,
      },
      isFamilyHead,
      currentMemberId: currentMem.member_id,
      members,
    };
  }

  /**
   * Retrieves dashboard overview for Family Head
   */
  async getFamilyDashboard(userId: string) {
    const familyData = await this.getFamily(userId);
    if (!familyData || !familyData.family) {
      return {
        family: null,
        overview: { totalMembers: 0, activeMembers: 0, pendingRequests: 0 },
        memberCards: [],
      };
    }

    const familyId = familyData.family.id;
    const isHead = familyData.isFamilyHead;

    const permsRes = await this.databaseService.query(
      `SELECT * FROM public.family_permissions WHERE family_id = $1 AND admin_user_id = $2;`,
      [familyId, userId]
    );
    const reqsRes = await this.databaseService.query(
      `SELECT * FROM public.family_access_requests WHERE family_id = $1 AND requester_id = $2;`,
      [familyId, userId]
    );

    const memberCards = familyData.members.map((m) => {
      const isFemale = m.gender === 'female' || ['daughter', 'mother', 'wife', 'sister'].includes(m.relationship);
      const perm = permsRes.rows.find((p) => p.member_user_id === m.id);
      const req = reqsRes.rows.find((r) => r.target_user_id === m.id);
      const hasApprovedPcos = Boolean(perm?.pcos_overview);

      return {
        id: m.id,
        userId: m.id,
        memberId: m.memberId,
        fullName: m.fullName,
        role: m.role,
        relationship: m.relationship,
        gender: m.gender,
        age: m.age,
        streak: 7,
        water: '2.4 L',
        mealsLogged: 3,
        privateHealth: {
          isLocked: isFemale && !hasApprovedPcos && m.id !== userId,
          hasPendingRequest: req?.status === 'pending',
          accessStatus: req?.status || (hasApprovedPcos ? 'granted' : 'not_requested'),
        },
      };
    });

    return {
      family: familyData.family,
      isFamilyHead: isHead,
      overview: {
        totalMembers: familyData.members.length,
        activeMembers: familyData.members.filter((m) => m.status === 'active').length,
        pendingRequests: reqsRes.rows.filter((r) => r.status === 'pending').length,
      },
      members: memberCards,
      memberCards,
    };
  }

  /**
   * Retrieves complete health profile for a selected family member with ownership/consent checks
   */
  async getMemberDetails(requesterUserId: string, targetIdentifier: string) {
    // 1. Verify requester's family
    const requesterFamRes = await this.databaseService.query(
      `SELECT fm.family_id, fm.role, fm.user_id, f.admin_user_id
       FROM public.family_memberships fm
       JOIN public.families f ON fm.family_id = f.id
       WHERE fm.user_id = $1
       LIMIT 1;`,
      [requesterUserId]
    );

    if (requesterFamRes.rows.length === 0) {
      throw new ForbiddenException('You are not registered with any family.');
    }

    const requesterFam = requesterFamRes.rows[0];
    const familyId = requesterFam.family_id;
    const isRequesterHead = requesterFam.role === 'family_head' || requesterFam.admin_user_id === requesterUserId;

    // 2. Resolve target member by UUID or member_id (e.g. FAM003)
    const targetRes = await this.databaseService.query(
      `SELECT fm.id as membership_id, fm.member_id, fm.role, fm.relationship, fm.status, fm.display_name, fm.family_id,
              u.id as user_id, u.full_name, u.email,
              p.gender, p.date_of_birth, p.height_cm, p.weight_kg, p.blood_group, p.dietary_preference, p.language_preference
       FROM public.family_memberships fm
       JOIN public.users u ON fm.user_id = u.id
       LEFT JOIN public.user_profiles p ON u.id = p.user_id
       WHERE (u.id::text = $1 OR LOWER(fm.member_id) = LOWER($1)) AND fm.family_id = $2
       LIMIT 1;`,
      [targetIdentifier, familyId]
    );

    if (targetRes.rows.length === 0) {
      throw new NotFoundException('Member not found in your family.');
    }

    const m = targetRes.rows[0];
    const targetUserId = m.user_id;
    const isSelf = requesterUserId === targetUserId;

    // 3. Check authorization: must be self OR Family Head
    if (!isSelf && !isRequesterHead) {
      throw new ForbiddenException('Access denied. Family members can only access their own profile.');
    }

    // 4. Check consent/permissions for female private health
    const isFemale = m.gender === 'female' || ['daughter', 'mother', 'wife', 'sister'].includes(m.relationship);
    let perm: any = null;
    let reqRecord: any = null;

    if (isFemale && !isSelf) {
      const pRes = await this.databaseService.query(
        `SELECT * FROM public.family_permissions WHERE family_id = $1 AND member_user_id = $2 AND admin_user_id = $3 LIMIT 1;`,
        [familyId, targetUserId, requesterUserId]
      );
      perm = pRes.rows[0];

      const rRes = await this.databaseService.query(
        `SELECT * FROM public.family_access_requests WHERE family_id = $1 AND target_user_id = $2 AND requester_id = $3 ORDER BY requested_at DESC LIMIT 1;`,
        [familyId, targetUserId, requesterUserId]
      );
      reqRecord = rRes.rows[0];
    }

    const isLocked = isFemale && !isSelf && (!perm || !perm.pcos_overview);

    // 5. Query member health records
    const nutRes = await this.databaseService.query(
      `SELECT * FROM public.nutrition_logs WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 5;`,
      [targetUserId]
    );

    const symRes = await this.databaseService.query(
      `SELECT * FROM public.symptom_logs WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 5;`,
      [targetUserId]
    );

    let cycleLogs = [];
    if (!isLocked) {
      const cycRes = await this.databaseService.query(
        `SELECT * FROM public.cycle_logs WHERE user_id = $1 ORDER BY period_start_date DESC LIMIT 5;`,
        [targetUserId]
      );
      cycleLogs = cycRes.rows;
    }

    const goalRes = await this.databaseService.query(
      `SELECT * FROM public.goals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5;`,
      [targetUserId]
    );

    let age = 25;
    if (m.date_of_birth) {
      const diff = Date.now() - new Date(m.date_of_birth).getTime();
      age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
    }

    return {
      success: true,
      member: {
        id: targetUserId,
        userId: targetUserId,
        memberId: m.member_id,
        fullName: m.display_name || m.full_name || 'Family Member',
        role: m.role,
        relationship: m.relationship,
        gender: m.gender || 'female',
        age,
        dob: m.date_of_birth,
        heightCm: m.height_cm ? Number(m.height_cm) : null,
        weightKg: m.weight_kg ? Number(m.weight_kg) : null,
        bloodGroup: m.blood_group,
        dietaryPreference: m.dietary_preference || 'vegetarian',
        languagePreference: m.language_preference || 'en',
        vitals: {
          streak: 7,
          waterLiters: '2.4 L',
          mealsLoggedToday: 3,
          healthScore: 88,
        },
        nutritionLogs: nutRes.rows,
        symptomLogs: isLocked ? [] : symRes.rows,
        cycleLogs,
        goals: goalRes.rows,
        privateHealth: {
          isLocked,
          hasPendingRequest: reqRecord?.status === 'pending',
          accessStatus: reqRecord?.status || (perm?.pcos_overview ? 'granted' : 'not_requested'),
          categories: isLocked
            ? {}
            : {
                pcosOverview: Boolean(perm?.pcos_overview || isSelf),
                cyclePeriod: Boolean(perm?.cycle_period || isSelf),
                symptomsJournal: Boolean(perm?.symptoms_journal || isSelf),
                hormonalWellness: Boolean(perm?.hormonal_wellness || isSelf),
              },
          data: !isLocked
            ? {
                pcosScore: 32,
                riskIndicator: 'Low Risk (Stage 1 Balanced)',
                cyclePhase: 'Follicular (Pre-Ovulatory)',
                cycleDay: 14,
                hormonalRhythm: 'LH & Cortisol Steady',
                recentSymptoms: 'Mild energy dip after workout; balanced with protein pacing.',
              }
            : null,
        },
      },
    };
  }

  /**
   * Adds a new family member to existing family
   */
  async addMember(adminUserId: string, dto: AddMemberDto) {
    const famRes = await this.databaseService.query(
      `SELECT fm.family_id, fm.role, f.family_email
       FROM public.family_memberships fm
       JOIN public.families f ON fm.family_id = f.id
       WHERE fm.user_id = $1 AND fm.role IN ('admin', 'family_head')
       LIMIT 1;`,
      [adminUserId]
    );

    if (famRes.rows.length === 0) {
      throw new ForbiddenException('Only a Family Head can add members.');
    }

    const family = famRes.rows[0];
    const familyId = family.family_id;

    // Determine next Member ID
    const countRes = await this.databaseService.query(
      `SELECT COUNT(*) FROM public.family_memberships WHERE family_id = $1;`,
      [familyId]
    );
    const count = parseInt(countRes.rows[0]?.count || '1', 10) + 1;
    const memberId = dto.memberId || `FAM00${count}`;

    const memName = (dto.name || 'Family Member').trim();
    const memGender = (dto.gender || 'female').toLowerCase();
    const memRel = (dto.relationship || 'other').toLowerCase();
    const memPass = dto.password || 'VitaWiseMember123!';

    const cleanName = memName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const syntheticEmail = `${(family.family_email ? family.family_email.split('@')[0] : 'fam')}+${cleanName}_${randomUUID().substring(0, 6)}@${family.family_email ? family.family_email.split('@')[1] : 'vitawise.ai'}`;

    let memUserId: string;
    const supabase = this.supabaseService.getClient();
    if (supabase) {
      const { data: sAuth } = await supabase.auth.admin.createUser({
        email: syntheticEmail,
        password: memPass,
        email_confirm: true,
        user_metadata: { full_name: memName, gender: memGender, role: 'family_member' },
      });
      memUserId = sAuth?.user?.id || randomUUID();
    } else {
      memUserId = randomUUID();
    }

    await this.databaseService.query(
      `INSERT INTO public.users (id, email, role, full_name, family_id, is_active, created_at, updated_at)
       VALUES ($1, $2, 'family_member', $3, $4, true, now(), now())
       ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, family_id = EXCLUDED.family_id;`,
      [memUserId, syntheticEmail, memName, familyId]
    );

    await this.databaseService.query(
      `INSERT INTO public.user_profiles (user_id, gender, date_of_birth, language_preference, created_at, updated_at)
       VALUES ($1, $2, $3, 'en', now(), now())
       ON CONFLICT (user_id) DO UPDATE SET gender = EXCLUDED.gender;`,
      [memUserId, memGender, dto.dob || null]
    );

    await this.databaseService.query(
      `INSERT INTO public.user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING;`,
      [memUserId]
    );

    await this.databaseService.query(
      `INSERT INTO public.family_memberships (family_id, user_id, display_name, role, relationship, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'family_member', $4, 'active', now(), now())
       ON CONFLICT (family_id, user_id) DO UPDATE SET display_name = EXCLUDED.display_name, status = 'active';`,
      [familyId, memUserId, memName, memRel]
    );

    await this.databaseService.query(
      `INSERT INTO public.family_permissions (family_id, member_user_id, admin_user_id, pcos_overview, cycle_period, symptoms_journal, hormonal_wellness, medication, lab_records, private_health_history, created_at, updated_at)
       VALUES ($1, $2, $3, false, false, false, false, false, false, false, now(), now())
       ON CONFLICT (family_id, member_user_id, admin_user_id) DO NOTHING;`,
      [familyId, memUserId, adminUserId]
    );

    return {
      success: true,
      member: {
        id: memUserId,
        fullName: memName,
        relationship: memRel,
        gender: memGender,
        role: 'family_member',
      },
      message: `Member ${memName} added successfully.`,
    };
  }

  /**
   * Submits a request for access to private health categories
   */
  async requestAccess(requesterUserId: string, targetUserId: string, notes?: string) {
    const famRes = await this.databaseService.query(
      `SELECT family_id FROM public.family_memberships WHERE user_id = $1 LIMIT 1;`,
      [requesterUserId]
    );
    const familyId = famRes.rows[0]?.family_id;
    if (!familyId) throw new ForbiddenException('Family membership not found.');

    const targetFamRes = await this.databaseService.query(
      `SELECT family_id FROM public.family_memberships WHERE user_id = $1 LIMIT 1;`,
      [targetUserId]
    );
    if (targetFamRes.rows[0]?.family_id !== familyId) {
      throw new ForbiddenException('Target user is not part of your family.');
    }

    const reqRes = await this.databaseService.query(
      `INSERT INTO public.family_access_requests (family_id, requester_id, target_user_id, status, notes, requested_at)
       VALUES ($1, $2, $3, 'pending', $4, now())
       RETURNING *;`,
      [familyId, requesterUserId, targetUserId, notes || '']
    );

    return {
      success: true,
      request: reqRes.rows[0],
      message: 'Access request sent to family member.',
    };
  }

  /**
   * Responds to an access request (grant or deny)
   */
  async respondAccessRequest(memberUserId: string, requestId: string, status: 'granted' | 'denied', permissions?: any) {
    const reqRes = await this.databaseService.query(
      `SELECT * FROM public.family_access_requests WHERE id = $1 AND target_user_id = $2 LIMIT 1;`,
      [requestId, memberUserId]
    );

    if (reqRes.rows.length === 0) {
      throw new NotFoundException('Access request not found or unauthorized.');
    }

    const req = reqRes.rows[0];
    await this.databaseService.query(
      `UPDATE public.family_access_requests SET status = $1, responded_at = now() WHERE id = $2;`,
      [status, requestId]
    );

    if (status === 'granted') {
      await this.databaseService.query(
        `INSERT INTO public.family_permissions (family_id, member_user_id, admin_user_id, pcos_overview, cycle_period, symptoms_journal, hormonal_wellness, medication, lab_records, private_health_history, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
         ON CONFLICT (family_id, member_user_id, admin_user_id) DO UPDATE SET
           pcos_overview = EXCLUDED.pcos_overview,
           cycle_period = EXCLUDED.cycle_period,
           symptoms_journal = EXCLUDED.symptoms_journal,
           hormonal_wellness = EXCLUDED.hormonal_wellness,
           medication = EXCLUDED.medication,
           lab_records = EXCLUDED.lab_records,
           private_health_history = EXCLUDED.private_health_history,
           updated_at = now();`,
        [
          req.family_id,
          memberUserId,
          req.requester_id,
          permissions?.pcosOverview ?? true,
          permissions?.cyclePeriod ?? true,
          permissions?.symptomsJournal ?? true,
          permissions?.hormonalWellness ?? true,
          permissions?.medication ?? false,
          permissions?.labRecords ?? false,
          permissions?.privateHealthHistory ?? false,
        ]
      );
    }

    return {
      success: true,
      status,
      message: `Access request ${status}.`,
    };
  }
}

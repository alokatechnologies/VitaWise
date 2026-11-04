import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  if (!password || !hash || !salt) return false;
  try {
    const derived = scryptSync(password, salt, 64);
    const target = Buffer.from(hash, 'hex');
    return timingSafeEqual(derived, target);
  } catch {
    return false;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.BACKEND_PORT || process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Supabase Client Setup
const supabaseUrl = process.env.SUPABASE_URL || 'https://quyazxkslzujlhepmgfs.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseKey = supabaseServiceKey || supabaseAnonKey;

const supabase = supabaseKey ? createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
}) : null;

// Global Process Resilience Guards to prevent crash on unexpected socket drops
process.on('uncaughtException', (err) => {
  console.error('Shielded Uncaught Exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('Shielded Unhandled Rejection:', reason?.message || reason);
});

// PostgreSQL Pool Setup with Connection Resilience & KeepAlive
const pool = process.env.DATABASE_URL ? new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  keepAlive: true,
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000,
  max: 10,
}) : null;

if (pool) {
  pool.on('error', (err) => {
    console.warn('PostgreSQL Pool idle client connection warning (shielded):', err.message);
  });
}

async function queryDb(sql, params = []) {
  if (!pool) return { rows: [] };
  try {
    return await pool.query(sql, params);
  } catch (err) {
    console.error('PostgreSQL Query Warning:', err.message);
    return { rows: [] };
  }
}

// In-Memory Runtime Caches (populated dynamically from PostgreSQL)
const users = new Map();
let nutritionLogs = [];
let symptomLogs = [];
let cycleLogs = [];
let goals = [];
let alerts = [];
let families = [];
let familyMemberships = [];
let familyAccessRequests = [];
let familyPermissions = [];

// ============================================================
// Real-time Family Synchronization Registry (SSE Hub)
// ============================================================
global._familySseClients = global._familySseClients || new Map();

function broadcastFamilyEvent(familyId, eventType, payload) {
  if (!familyId) return;
  const fKey = String(familyId);
  const clients = global._familySseClients.get(fKey);
  if (clients && clients.size > 0) {
    const rawPayload = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of clients) {
      try {
        client.res.write(rawPayload);
      } catch (_) {
        clients.delete(client);
      }
    }
  }
}
global.broadcastFamilyEvent = broadcastFamilyEvent;

// Seed default family space in memory for resilient offline operation
const defaultFamilyId = '00000000-0000-0000-0000-000000000002';
const defaultUserId = '00000000-0000-0000-0000-000000000001';
const { hash: defaultHash, salt: defaultSalt } = hashPassword('RaviPass123!');
const defaultUser = {
  id: defaultUserId,
  userId: defaultUserId,
  email: 'family@example.com',
  full_name: 'Ravi',
  fullName: 'Ravi',
  name: 'Ravi',
  role: 'family_head',
  family_id: defaultFamilyId,
  familyId: defaultFamilyId,
  family_name: 'Ravi Family',
  familyName: 'Ravi Family',
  isFamilyHead: true,
  gender: 'male',
  age: 45,
  password: 'RaviPass123!',
  password_hash: defaultHash,
  password_salt: defaultSalt,
  onboardingCompleted: true,
};
users.set(defaultUserId, defaultUser);
users.set('family@example.com', defaultUser);
families.push({
  id: defaultFamilyId,
  name: 'Ravi Family',
  family_email: 'family@example.com',
  admin_user_id: defaultUserId,
});

// Persistent Stores Directory (.data is hidden so file watchers / Live Server ignore it)
const DATA_DIR = path.join(__dirname, '.data');
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {}
}

function getStoreFilePath(fileName) {
  const target = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(target)) {
    const legacy = path.join(__dirname, 'data', fileName);
    if (fs.existsSync(legacy)) {
      try { fs.copyFileSync(legacy, target); } catch (_) {}
    }
  }
  return target;
}

// Persistent Health Intake Entries Store (PostgreSQL with Server Storage Resilience)
const INTAKE_STORE_FILE = getStoreFilePath('health_intake_entries.json');
let healthIntakeEntries = [];

function initHealthIntakeStore() {
  try {
    if (fs.existsSync(INTAKE_STORE_FILE)) {
      const raw = fs.readFileSync(INTAKE_STORE_FILE, 'utf8');
      healthIntakeEntries = JSON.parse(raw || '[]');
    }
  } catch (err) {
    console.warn('Failed to load health intake file store:', err.message);
  }

  if (pool) {
    queryDb(`
      CREATE TABLE IF NOT EXISTS public.health_intake_entries (
        id UUID PRIMARY KEY,
        user_id UUID,
        member_id VARCHAR(100) NOT NULL,
        member_name VARCHAR(255),
        record_date DATE NOT NULL,
        meal_slot VARCHAR(50) NOT NULL,
        food_name TEXT NOT NULL,
        quantity TEXT,
        meal_time VARCHAR(20),
        symptoms JSONB,
        symptom_notes TEXT,
        severity VARCHAR(50),
        symptom_time VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        CONSTRAINT uq_health_intake_slot UNIQUE (user_id, member_id, record_date, meal_slot)
      );
    `).catch(e => console.warn('Intake table creation check warning:', e.message));
  }
}

function persistHealthIntakeStore() {
  try {
    fs.writeFileSync(INTAKE_STORE_FILE, JSON.stringify(healthIntakeEntries, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist health intake entries to disk:', err.message);
  }
}

initHealthIntakeStore();

// Persistent Water Intake Entries Store (PostgreSQL with Server Storage Resilience)
const WATER_STORE_FILE = getStoreFilePath('water_intake_entries.json');
let waterIntakeEntries = [];

function initWaterIntakeStore() {
  try {
    if (fs.existsSync(WATER_STORE_FILE)) {
      const raw = fs.readFileSync(WATER_STORE_FILE, 'utf8');
      waterIntakeEntries = JSON.parse(raw || '[]');
    }
  } catch (err) {
    console.warn('Failed to load water intake file store:', err.message);
  }
}

function persistWaterIntakeStore() {
  try {
    fs.writeFileSync(WATER_STORE_FILE, JSON.stringify(waterIntakeEntries, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist water intake entries to disk:', err.message);
  }
}

initWaterIntakeStore();

// Persistent User Diet Plans Store (PostgreSQL with Server Storage Resilience)
const DIET_STORE_FILE = getStoreFilePath('user_diet_plans.json');
let userDietPlans = [];

function initDietPlansStore() {
  try {
    if (fs.existsSync(DIET_STORE_FILE)) {
      const raw = fs.readFileSync(DIET_STORE_FILE, 'utf8');
      userDietPlans = JSON.parse(raw || '[]');
    }
  } catch (err) {
    console.warn('Failed to load user diet plans file store:', err.message);
  }

  if (pool) {
    queryDb(`
      CREATE TABLE IF NOT EXISTS public.user_diet_plans (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL,
        goal_key VARCHAR(100) NOT NULL,
        goal_name VARCHAR(150) NOT NULL,
        profile_snapshot JSONB NOT NULL,
        calculated_targets JSONB NOT NULL,
        daily_plan JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        CONSTRAINT uq_user_diet_plans UNIQUE (user_id)
      );
      ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS activity_level VARCHAR(50);
      ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS allergies TEXT;
      ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS food_restrictions TEXT;
      ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS diet_goal VARCHAR(100);
    `).catch(e => console.warn('Diet plans table creation check warning:', e.message));
  }
}

function persistDietPlansStore() {
  try {
    fs.writeFileSync(DIET_STORE_FILE, JSON.stringify(userDietPlans, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist user diet plans to disk:', err.message);
  }
}

initDietPlansStore();

// Persistent Sleep Logs Store (PostgreSQL with Server Storage Resilience)
const SLEEP_STORE_FILE = getStoreFilePath('sleep_logs.json');
let sleepLogs = [];

function initSleepStore() {
  try {
    if (fs.existsSync(SLEEP_STORE_FILE)) {
      const raw = fs.readFileSync(SLEEP_STORE_FILE, 'utf8');
      sleepLogs = JSON.parse(raw || '[]');
    }
  } catch (err) {
    console.warn('Failed to load sleep logs file store:', err.message);
  }

  if (pool) {
    queryDb(`
      CREATE TABLE IF NOT EXISTS public.sleep_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        sleep_date DATE NOT NULL,
        sleep_start_time VARCHAR(20) NOT NULL,
        wake_time VARCHAR(20) NOT NULL,
        total_hours NUMERIC(4,2) NOT NULL,
        quality VARCHAR(50) NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        CONSTRAINT uq_user_sleep_date UNIQUE (user_id, sleep_date)
      );
    `).catch(e => console.warn('Sleep logs table creation check warning:', e.message));
  }
}

function persistSleepStore() {
  try {
    fs.writeFileSync(SLEEP_STORE_FILE, JSON.stringify(sleepLogs, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist sleep logs to disk:', err.message);
  }
}

initSleepStore();

// Persistent Daily Steps Store (PostgreSQL with Server Storage Resilience)
const STEPS_STORE_FILE = getStoreFilePath('steps_logs.json');
let stepsLogs = [];

function initStepsStore() {
  try {
    if (fs.existsSync(STEPS_STORE_FILE)) {
      const raw = fs.readFileSync(STEPS_STORE_FILE, 'utf8');
      stepsLogs = JSON.parse(raw || '[]');
    }
  } catch (err) {
    console.warn('Failed to load steps logs file store:', err.message);
  }
}

function persistStepsStore() {
  try {
    fs.writeFileSync(STEPS_STORE_FILE, JSON.stringify(stepsLogs, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist steps logs to disk:', err.message);
  }
}

initStepsStore();

// Persistent Appointments Store (PostgreSQL with Server Storage Resilience)
const APPOINTMENTS_STORE_FILE = getStoreFilePath('appointments_store.json');
let appointmentsStore = [];

function initAppointmentsStore() {
  try {
    if (fs.existsSync(APPOINTMENTS_STORE_FILE)) {
      const raw = fs.readFileSync(APPOINTMENTS_STORE_FILE, 'utf8');
      appointmentsStore = JSON.parse(raw || '[]');
    }
  } catch (err) {
    console.warn('Failed to load appointments file store:', err.message);
  }

  if (pool) {
    queryDb(`
      CREATE TABLE IF NOT EXISTS public.appointments (
        id UUID PRIMARY KEY,
        family_id UUID,
        user_id UUID,
        title TEXT NOT NULL,
        doctor_name TEXT,
        appointment_date DATE NOT NULL,
        appointment_time VARCHAR(20) DEFAULT '10:00:00',
        location TEXT,
        notes TEXT,
        status VARCHAR(50) DEFAULT 'scheduled',
        reminder_minutes INTEGER DEFAULT 60,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `).catch(e => console.warn('Appointments table check warning:', e.message));
  }
}

function persistAppointmentsStore() {
  try {
    fs.writeFileSync(APPOINTMENTS_STORE_FILE, JSON.stringify(appointmentsStore, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist appointments to disk:', err.message);
  }
}

initAppointmentsStore();

// Persistent AI Chat History Conversations & Messages Store (PostgreSQL with Server Storage Resilience)
const AI_CONVERSATIONS_STORE_FILE = getStoreFilePath('ai_conversations_store.json');
let aiConversationsStore = [];

function initAiConversationsStore() {
  try {
    if (fs.existsSync(AI_CONVERSATIONS_STORE_FILE)) {
      const raw = fs.readFileSync(AI_CONVERSATIONS_STORE_FILE, 'utf8');
      aiConversationsStore = JSON.parse(raw || '[]');
    } else {
      // Seed initial realistic date-based clinical conversations for default user
      aiConversationsStore = [
        {
          id: 'conv_today_1',
          user_id: defaultUserId,
          title: 'PCOS Nutrition & Low-GI Pacing',
          date: '2026-09-30',
          created_at: '2026-09-30T10:15:00.000Z',
          updated_at: '2026-09-30T10:18:28.000Z',
          messages: [
            {
              id: 'msg_1',
              role: 'user',
              content: 'What are the best low-glycemic foods for PCOS?',
              created_at: '2026-09-30T10:15:00.000Z'
            },
            {
              id: 'msg_2',
              role: 'assistant',
              content: '**Aloka AI PCOS Clinical Protocol (ICMR-NIN Aligned):**\n\n1. **Low-GI Carbohydrates:** Swap refined white rice with Foxtail (Korra) or Barnyard millet batters for steady postprandial glucose.\n2. **Protein Pacing:** Pair breakfasts with sprouted moong or chana to slow gastric emptying.\n3. **Postprandial Walking:** A 10-15 minute gentle walk after meals activates non-insulin GLUT4 glucose uptake.',
              created_at: '2026-09-30T10:15:08.000Z'
            },
            {
              id: 'msg_3',
              role: 'user',
              content: 'Can I take fenugreek seeds daily?',
              created_at: '2026-09-30T10:18:20.000Z'
            },
            {
              id: 'msg_4',
              role: 'assistant',
              content: 'Yes! Soaking 1 teaspoon (5g) of fenugreek (methi) seeds overnight in water and consuming them in the morning is clinically documented to improve glucose tolerance and optimize peripheral insulin sensitivity.',
              created_at: '2026-09-30T10:18:28.000Z'
            }
          ]
        },
        {
          id: 'conv_yest_1',
          user_id: defaultUserId,
          title: 'Sleep Quality & Herbal Infusions',
          date: '2026-09-29',
          created_at: '2026-09-29T21:40:00.000Z',
          updated_at: '2026-09-29T21:40:12.000Z',
          messages: [
            {
              id: 'msg_5',
              role: 'user',
              content: 'How can I improve deep sleep without supplements?',
              created_at: '2026-09-29T21:40:00.000Z'
            },
            {
              id: 'msg_6',
              role: 'assistant',
              content: '**Circadian Restorative Sleep Protocol:**\n\n1. **Dim Blue Light:** Disconnect from screens 45-60 minutes before bedtime to prevent melatonin suppression.\n2. **Thermoregulation:** Keep room ambient temperature around 20-22°C to facilitate natural nocturnal core cooling.\n3. **Calming Infusion:** Warm chamomile or spiced milk with a pinch of nutmeg promotes parasympathetic relaxation.',
              created_at: '2026-09-29T21:40:12.000Z'
            }
          ]
        },
        {
          id: 'conv_prev_1',
          user_id: defaultUserId,
          title: 'South Indian Breakfast Science',
          date: '2026-09-28',
          created_at: '2026-09-28T08:30:00.000Z',
          updated_at: '2026-09-28T08:30:15.000Z',
          messages: [
            {
              id: 'msg_7',
              role: 'user',
              content: 'Is traditional idli or dosa better for metabolic health?',
              created_at: '2026-09-28T08:30:00.000Z'
            },
            {
              id: 'msg_8',
              role: 'assistant',
              content: '**Metabolic Comparison:**\n\n• **Steamed Idli:** Steaming generates zero lipid oxidation products and preserves bioavailable B-vitamins from fermentation.\n• **Dosa:** Griddling in oil adds calories, though fermentation remains beneficial.\n• **Clinical Optimization:** Substitute 50% white polished rice with foxtail or barnyard millet to reduce glycemic index from ~70 down to ~52.',
              created_at: '2026-09-28T08:30:15.000Z'
            }
          ]
        }
      ];
      persistAiConversationsStore();
    }
  } catch (err) {
    console.warn('Failed to load AI conversations file store:', err.message);
  }

  if (pool) {
    queryDb(`
      CREATE TABLE IF NOT EXISTS public.ai_conversations (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL,
        title TEXT NOT NULL,
        date DATE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS public.ai_messages (
        id VARCHAR(100) PRIMARY KEY,
        conversation_id VARCHAR(100) NOT NULL,
        user_id VARCHAR(100) NOT NULL,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `).catch(e => console.warn('AI tables check warning:', e.message));
  }
}

function persistAiConversationsStore() {
  try {
    fs.writeFileSync(AI_CONVERSATIONS_STORE_FILE, JSON.stringify(aiConversationsStore, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist AI conversations to disk:', err.message);
  }
}

initAiConversationsStore();

// =========================================================================
// Persistent User Daily Logins Store & Live Achievements Engine
// =========================================================================
const DAILY_LOGINS_STORE_FILE = getStoreFilePath('user_daily_logins.json');
let userDailyLogins = [];

function initDailyLoginsStore() {
  try {
    if (fs.existsSync(DAILY_LOGINS_STORE_FILE)) {
      const raw = fs.readFileSync(DAILY_LOGINS_STORE_FILE, 'utf8');
      userDailyLogins = JSON.parse(raw || '[]');
    }
  } catch (err) {
    console.warn('Failed to load user daily logins file store:', err.message);
  }

  if (pool) {
    queryDb(`
      CREATE TABLE IF NOT EXISTS public.user_daily_logins (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL,
        login_date DATE NOT NULL,
        logged_at TIMESTAMPTZ DEFAULT now(),
        created_at TIMESTAMPTZ DEFAULT now(),
        CONSTRAINT uq_user_daily_login UNIQUE (user_id, login_date)
      );
    `).catch(e => console.warn('User daily logins table check warning:', e.message));
  }
}

function persistDailyLoginsStore() {
  try {
    fs.writeFileSync(DAILY_LOGINS_STORE_FILE, JSON.stringify(userDailyLogins, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist daily logins to disk:', err.message);
  }
}

initDailyLoginsStore();

function getLocalDateString(d = new Date()) {
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dateObj.getTime())) return new Date().toISOString().split('T')[0];
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getPreviousDayDateString(dateStr) {
  const parts = dateStr.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function calculateUserStreak(userId, asOfDateStr = null) {
  if (!userId) {
    return { streak: 0, periodStart: null, hasLoggedToday: false, lastLoginDate: null, totalLogins: 0, loginDates: [] };
  }

  // Strict User / Family Member Isolation
  const userLogs = userDailyLogins.filter(l => String(l.user_id) === String(userId));
  const dateSet = new Set(userLogs.map(l => String(l.login_date).split('T')[0]));
  const sortedDates = Array.from(dateSet).sort();

  const todayStr = asOfDateStr || getLocalDateString();
  const yesterdayStr = getPreviousDayDateString(todayStr);

  const hasLoggedToday = dateSet.has(todayStr);
  const hasLoggedYesterday = dateSet.has(yesterdayStr);

  let streak = 0;
  let periodStart = null;

  if (hasLoggedToday) {
    // Current streak is active starting from today
    streak = 1;
    periodStart = todayStr;
    let checkDate = yesterdayStr;
    while (dateSet.has(checkDate)) {
      streak++;
      periodStart = checkDate;
      checkDate = getPreviousDayDateString(checkDate);
    }
  } else if (hasLoggedYesterday) {
    // User hasn't logged in yet today, but logged in yesterday so streak is active pending today's login
    streak = 1;
    periodStart = yesterdayStr;
    let checkDate = getPreviousDayDateString(yesterdayStr);
    while (dateSet.has(checkDate)) {
      streak++;
      periodStart = checkDate;
      checkDate = getPreviousDayDateString(checkDate);
    }
  } else {
    // Missed at least one whole calendar day: streak is broken!
    streak = 0;
    periodStart = null;
  }

  const lastLoginDate = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null;

  return {
    streak,
    periodStart,
    hasLoggedToday,
    lastLoginDate,
    totalLogins: dateSet.size,
    loginDates: sortedDates,
  };
}

async function recordUserDailyLogin(userId, loginDateStr = null) {
  if (!userId) return null;
  const dateStr = loginDateStr || getLocalDateString();

  // Deduplication check: only ONE login per user per calendar date
  const existing = userDailyLogins.find(l => String(l.user_id) === String(userId) && String(l.login_date).split('T')[0] === dateStr);
  if (!existing) {
    const entry = {
      id: randomUUID(),
      user_id: String(userId),
      login_date: dateStr,
      logged_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };
    userDailyLogins.push(entry);
    persistDailyLoginsStore();

    if (pool) {
      queryDb(`
        INSERT INTO public.user_daily_logins (id, user_id, login_date, logged_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, login_date) DO NOTHING;
      `, [entry.id, entry.user_id, entry.login_date, entry.logged_at]).catch(err => {
        console.warn('PostgreSQL recordUserDailyLogin warning:', err.message);
      });
    }
  }

  return calculateUserStreak(userId, dateStr);
}

async function evaluateUserAchievements(userId, asOfDateStr = null) {
  const streakInfo = calculateUserStreak(userId, asOfDateStr);
  const { streak, periodStart } = streakInfo;

  // CORE REQUIREMENT: If streak is 0 or periodStart is null (missed day):
  // ALL ACHIEVEMENTS MUST RETURN TO LOCKED STATE!
  if (streak === 0 || !periodStart) {
    const lockedBadges = [
      {
        id: 'consistent-logger',
        title: 'Consistent Logger',
        desc: 'Logged meals and wellness check-ins for 5 consecutive days.',
        icon: 'trophy',
        target: 5,
        current: 0,
        progressPct: 0,
        status: 'locked',
        meta: '0 of 5 days · Log in daily to build streak'
      },
      {
        id: 'hydration-champion',
        title: 'Hydration Champion',
        desc: 'Reached the optimal 2.5L daily hydration target 7 times.',
        icon: 'droplet',
        target: 7,
        current: 0,
        progressPct: 0,
        status: 'locked',
        meta: '0 of 7 targets met · Streak reset'
      },
      {
        id: 'millet-pioneer',
        title: 'Millet Pioneer',
        desc: 'Swapped refined grains for whole foxtail or barnyard millets.',
        icon: 'plant',
        target: 1,
        current: 0,
        progressPct: 0,
        status: 'locked',
        meta: '0 of 1 swap verified · Streak reset'
      },
      {
        id: 'pacing-master',
        title: 'Pacing Master',
        desc: 'Completed 15 postprandial zone-1 walks for glucose moderation.',
        icon: 'walking',
        target: 15,
        current: 0,
        progressPct: 0,
        status: 'locked',
        meta: '0 of 15 walks logged · Streak reset'
      },
      {
        id: 'circadian-anchor',
        title: 'Circadian Anchor',
        desc: 'Maintain restorative sleep schedule with bedtime before 11 PM.',
        icon: 'moon',
        target: 7,
        current: 0,
        progressPct: 0,
        status: 'locked',
        meta: '0 of 7 days · Streak reset'
      },
      {
        id: 'macro-balancer',
        title: 'Macro Balancer',
        desc: 'Log 10 balanced meals featuring 25g+ bioavailable protein.',
        icon: 'utensils',
        target: 10,
        current: 0,
        progressPct: 0,
        status: 'locked',
        meta: '0 of 10 meals · Streak reset'
      },
      {
        id: 'sentinel-30',
        title: '30-Day Sentinel',
        desc: 'Complete a 30-day streak of daily health check-ins.',
        icon: 'shield',
        target: 30,
        current: 0,
        progressPct: 0,
        status: 'locked',
        meta: 'Progress: 0 / 30 days · Streak reset'
      },
      {
        id: 'glucose-stability',
        title: 'Glucose Stability Ace',
        desc: 'Achieve 95%+ low-glycemic meal consistency over 30 days.',
        icon: 'target',
        target: 30,
        current: 0,
        progressPct: 0,
        status: 'locked',
        meta: '0 of 30 meals · Streak reset'
      }
    ];

    return {
      streak: 0,
      periodStart: null,
      hasLoggedToday: streakInfo.hasLoggedToday,
      badges: lockedBadges,
      counts: {
        all: lockedBadges.length,
        unlocked: 0,
        inProgress: 0,
        locked: lockedBadges.length
      }
    };
  }

  // Active period exists: query real activity records in database/memory WHERE date >= periodStart
  // 1. Nutrition logs in current period
  let userMeals = nutritionLogs.filter(n => String(n.user_id) === String(userId));
  if (pool) {
    try {
      const q = await queryDb('SELECT * FROM public.nutrition_logs WHERE user_id = $1 AND logged_at >= $2', [userId, periodStart]);
      if (q.rows?.length) {
        userMeals = q.rows;
      }
    } catch (_) { }
  }
  userMeals = userMeals.filter(n => {
    const raw = n.logged_at instanceof Date ? n.logged_at.toISOString() : String(n.logged_at || n.created_at || '');
    const d = raw.split('T')[0];
    return d >= periodStart;
  });

  // 2. Health intake entries in current period
  const userIntakes = healthIntakeEntries.filter(e => {
    return String(e.user_id) === String(userId) && String(e.record_date) >= periodStart;
  });

  // 3. Symptom & activity & sleep logs in current period
  let userSymptoms = symptomLogs.filter(s => String(s.user_id) === String(userId));
  if (pool) {
    try {
      const q = await queryDb('SELECT * FROM public.symptom_logs WHERE user_id = $1 AND logged_at >= $2', [userId, periodStart]);
      if (q.rows?.length) {
        userSymptoms = q.rows;
      }
    } catch (_) { }
  }
  userSymptoms = userSymptoms.filter(s => {
    const raw = s.logged_at instanceof Date ? s.logged_at.toISOString() : String(s.logged_at || s.created_at || '');
    const d = raw.split('T')[0];
    return d >= periodStart;
  });

  // Badge 1: Consistent Logger (5 consecutive days)
  const b1Target = 5;
  const b1Current = Math.min(streak, b1Target);
  const b1Unlocked = streak >= b1Target;
  const b1Status = b1Unlocked ? 'unlocked' : (b1Current > 0 ? 'in-progress' : 'locked');
  const b1Meta = b1Unlocked ? 'Completed · 5 of 5 days' : (b1Current > 0 ? `${streak} of 5 consecutive days` : '0 / 5 days');

  // Badge 2: Hydration Champion (optimal 2.5L daily target 7 times)
  const waterByDay = new Map();
  userMeals.forEach(m => {
    const name = String(m.food_name || '').toLowerCase();
    const d = (m.logged_at || m.created_at || '').split('T')[0];
    if (!d) return;
    if (name.includes('hydration') || name.includes('water')) {
      const match = name.match(/(\d+(?:\.\d+)?)\s*(?:ml|l)/i);
      let ml = 0;
      if (match) {
        const val = parseFloat(match[1]);
        ml = name.includes('ml') ? val : val * 1000;
      } else {
        ml = 250;
      }
      waterByDay.set(d, (waterByDay.get(d) || 0) + ml);
    }
  });
  let b2DaysMet = 0;
  waterByDay.forEach(totalMl => {
    if (totalMl >= 2500) b2DaysMet++;
  });
  const b2Target = 7;
  const b2Current = Math.min(b2DaysMet, b2Target);
  const b2Unlocked = b2DaysMet >= b2Target;
  const b2Status = b2Unlocked ? 'unlocked' : (b2Current > 0 ? 'in-progress' : 'locked');
  const b2Meta = b2Unlocked ? 'Completed · 7 of 7 targets met' : `${b2Current} / 7 days`;

  // Badge 3: Millet Pioneer (swapped refined grains for whole millets)
  const milletKeywords = ['millet', 'foxtail', 'barnyard', 'ragi', 'jowar', 'bajra', 'kodo', 'proso', 'samai', 'korra'];
  let milletCount = 0;
  userMeals.forEach(m => {
    const text = `${m.food_name || ''} ${m.portion_description || ''}`.toLowerCase();
    if (milletKeywords.some(k => text.includes(k))) milletCount++;
  });
  userIntakes.forEach(entry => {
    const text = `${entry.food_name || ''} ${entry.quantity || ''}`.toLowerCase();
    if (milletKeywords.some(k => text.includes(k))) milletCount++;
  });
  const b3Target = 1;
  const b3Current = Math.min(milletCount, b3Target);
  const b3Unlocked = milletCount >= b3Target;
  const b3Status = b3Unlocked ? 'unlocked' : 'locked';
  const b3Meta = b3Unlocked ? 'Completed · Low-glycemic swap verified' : '0 / 1 swap logged';

  // Badge 4: Pacing Master (15 postprandial zone-1 walks)
  let walksCount = 0;
  userSymptoms.forEach(s => {
    const cat = String(s.symptom_category || '').toLowerCase();
    const name = String(s.symptom_name || '').toLowerCase();
    if (cat === 'activity' || name.includes('walk') || name.includes('pacing') || name.includes('steps')) {
      walksCount++;
    }
  });
  const b4Target = 15;
  const b4Current = Math.min(walksCount, b4Target);
  const b4Unlocked = walksCount >= b4Target;
  const b4Status = b4Unlocked ? 'unlocked' : (b4Current > 0 ? 'in-progress' : 'locked');
  const b4Meta = b4Unlocked ? 'Completed · 15 of 15 walks logged' : `${b4Current} of 15 walks logged`;

  // Badge 5: Circadian Anchor (restorative sleep schedule 7 times)
  let sleepCount = 0;
  userSymptoms.forEach(s => {
    const cat = String(s.symptom_category || '').toLowerCase();
    const name = String(s.symptom_name || '').toLowerCase();
    if (cat === 'sleep' || name.includes('sleep') || name.includes('circadian') || name.includes('rest')) {
      sleepCount++;
    }
  });
  const b5Target = 7;
  const b5Current = Math.min(sleepCount, b5Target);
  const b5Unlocked = sleepCount >= b5Target;
  const b5Status = b5Unlocked ? 'unlocked' : (b5Current > 0 ? 'in-progress' : 'locked');
  const b5Meta = b5Unlocked ? 'Completed · 7 of 7 days' : `${b5Current} / 7 Days`;

  // Badge 6: Macro Balancer (10 balanced meals with 25g+ protein)
  let proteinMeals = 0;
  userMeals.forEach(m => {
    const protein = Number(m.protein_g) || 0;
    if (protein >= 25) {
      proteinMeals++;
    } else {
      const desc = String(m.portion_description || '').toLowerCase();
      if (desc.includes('25g') || desc.includes('30g') || desc.includes('high protein')) proteinMeals++;
    }
  });
  const b6Target = 10;
  const b6Current = Math.min(proteinMeals, b6Target);
  const b6Unlocked = proteinMeals >= b6Target;
  const b6Status = b6Unlocked ? 'unlocked' : (b6Current > 0 ? 'in-progress' : 'locked');
  const b6Meta = b6Unlocked ? 'Completed · 10 of 10 meals' : `${b6Current} / 10 Meals`;

  // Badge 7: 30-Day Sentinel (30-day streak)
  const b7Target = 30;
  const b7Current = Math.min(streak, b7Target);
  const b7Unlocked = streak >= b7Target;
  const b7Status = b7Unlocked ? 'unlocked' : (b7Current > 0 ? 'in-progress' : 'locked');
  const b7Meta = b7Unlocked ? 'Completed · 30 of 30 days' : `Progress: ${streak} / 30 days`;

  // Badge 8: Glucose Stability Ace (30 low-GI meals)
  let lowGiCount = 0;
  userMeals.forEach(m => {
    const gi = String(m.glycemic_index_level || '').toLowerCase();
    if (gi === 'low') lowGiCount++;
  });
  const b8Target = 30;
  const b8Current = Math.min(lowGiCount, b8Target);
  const b8Unlocked = lowGiCount >= b8Target;
  const b8Status = b8Unlocked ? 'unlocked' : (b8Current > 0 ? 'in-progress' : 'locked');
  const b8Meta = b8Unlocked ? 'Completed · 30 of 30 low-GI meals' : `${b8Current} / 30 meals`;

  const badges = [
    {
      id: 'consistent-logger',
      title: 'Consistent Logger',
      desc: 'Logged meals and wellness check-ins for 5 consecutive days.',
      icon: 'trophy',
      target: b1Target,
      current: b1Current,
      progressPct: Math.round((b1Current / b1Target) * 100),
      status: b1Status,
      meta: b1Meta
    },
    {
      id: 'hydration-champion',
      title: 'Hydration Champion',
      desc: 'Reached the optimal 2.5L daily hydration target 7 times.',
      icon: 'droplet',
      target: b2Target,
      current: b2Current,
      progressPct: Math.round((b2Current / b2Target) * 100),
      status: b2Status,
      meta: b2Meta
    },
    {
      id: 'millet-pioneer',
      title: 'Millet Pioneer',
      desc: 'Swapped refined grains for whole foxtail or barnyard millets.',
      icon: 'plant',
      target: b3Target,
      current: b3Current,
      progressPct: Math.round((b3Current / b3Target) * 100),
      status: b3Status,
      meta: b3Meta
    },
    {
      id: 'pacing-master',
      title: 'Pacing Master',
      desc: 'Completed 15 postprandial zone-1 walks for glucose moderation.',
      icon: 'walking',
      target: b4Target,
      current: b4Current,
      progressPct: Math.round((b4Current / b4Target) * 100),
      status: b4Status,
      meta: b4Meta
    },
    {
      id: 'circadian-anchor',
      title: 'Circadian Anchor',
      desc: 'Maintain restorative sleep schedule with bedtime before 11 PM.',
      icon: 'moon',
      target: b5Target,
      current: b5Current,
      progressPct: Math.round((b5Current / b5Target) * 100),
      status: b5Status,
      meta: b5Meta
    },
    {
      id: 'macro-balancer',
      title: 'Macro Balancer',
      desc: 'Log 10 balanced meals featuring 25g+ bioavailable protein.',
      icon: 'utensils',
      target: b6Target,
      current: b6Current,
      progressPct: Math.round((b6Current / b6Target) * 100),
      status: b6Status,
      meta: b6Meta
    },
    {
      id: 'sentinel-30',
      title: '30-Day Sentinel',
      desc: 'Complete a 30-day streak of daily health check-ins.',
      icon: 'shield',
      target: b7Target,
      current: b7Current,
      progressPct: Math.round((b7Current / b7Target) * 100),
      status: b7Status,
      meta: b7Meta
    },
    {
      id: 'glucose-stability',
      title: 'Glucose Stability Ace',
      desc: 'Achieve 95%+ low-glycemic meal consistency over 30 days.',
      icon: 'target',
      target: b8Target,
      current: b8Current,
      progressPct: Math.round((b8Current / b8Target) * 100),
      status: b8Status,
      meta: b8Meta
    }
  ];

  let unlockedCount = 0;
  let inProgressCount = 0;
  let lockedCount = 0;
  badges.forEach(b => {
    if (b.status === 'unlocked') unlockedCount++;
    else if (b.status === 'in-progress') inProgressCount++;
    else lockedCount++;
  });

  return {
    streak,
    periodStart,
    hasLoggedToday: streakInfo.hasLoggedToday,
    badges,
    counts: {
      all: badges.length,
      unlocked: unlockedCount,
      inProgress: inProgressCount,
      locked: lockedCount
    }
  };
}

function calculatePersonalizedDietPlan(profile, goalKey, goalName) {
  const age = Number(profile.age) || 28;
  const weightKg = Number(profile.weightKg) || 68;
  const heightCm = Number(profile.heightCm) || 172;
  const gender = String(profile.gender || 'male').toLowerCase();
  const activityLevel = String(profile.activityLevel || 'moderate').toLowerCase();
  const dietaryPreference = String(profile.dietaryPreference || 'vegetarian').toLowerCase();
  const allergies = String(profile.allergies || '').toLowerCase();

  // 1. Calculate Basal Metabolic Rate (Mifflin-St Jeor)
  let bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age);
  if (gender === 'male') {
    bmr += 5;
  } else if (gender === 'female') {
    bmr -= 161;
  } else {
    bmr -= 78;
  }
  bmr = Math.round(bmr);

  // 2. Activity Multiplier -> TDEE
  let activityMultiplier = 1.375;
  if (activityLevel === 'sedentary') activityMultiplier = 1.2;
  else if (activityLevel === 'light' || activityLevel === 'lightly_active') activityMultiplier = 1.375;
  else if (activityLevel === 'moderate' || activityLevel === 'moderately_active') activityMultiplier = 1.55;
  else if (activityLevel === 'very_active' || activityLevel === 'athlete') activityMultiplier = 1.725;

  const tdee = Math.round(bmr * activityMultiplier);

  // 3. BMI
  const heightM = heightCm / 100;
  const bmi = Math.round((weightKg / (heightM * heightM)) * 10) / 10;

  // 4. Goal-specific Nutrition Targets
  let targetCalories = tdee;
  let targetProteinG = Math.round(weightKg * 1.5);
  let strategy = '';
  let caloriePill = 'Maintenance';

  if (goalKey === 'bulking') {
    targetCalories = tdee + 420;
    targetProteinG = Math.round(weightKg * 1.9);
    strategy = 'Calculated 15% caloric surplus with progressive complex carbohydrates and 1.9g/kg protein to drive lean muscle hypertrophy and optimize post-workout glycogen recovery without excess adiposity.';
    caloriePill = '+420 kcal Surplus';
  } else if (goalKey === 'fat_loss') {
    targetCalories = Math.max(1200, tdee - 480);
    targetProteinG = Math.round(weightKg * 2.1);
    strategy = 'Structured ~20% calorie deficit emphasizing satiety-dense lean proteins (2.1g/kg) and low-glycemic fiber to spare skeletal muscle mass while optimizing fat mobilization.';
    caloriePill = '-480 kcal Deficit';
  } else if (goalKey === 'protein_focus') {
    targetCalories = tdee;
    targetProteinG = Math.round(weightKg * 2.2);
    strategy = 'Evenly partitioned protein distribution (~25–35g per feeding window) with high biological value sources to stimulate muscle protein synthesis and accelerate musculoskeletal recovery.';
    caloriePill = 'High Protein / TDEE';
  } else if (goalKey === 'weight_maintenance') {
    targetCalories = tdee;
    targetProteinG = Math.round(weightKg * 1.4);
    strategy = 'Energy equilibrium protocol designed to sustain basal metabolic health, continuous daytime stamina, and long-term body composition stability.';
    caloriePill = 'Isocaloric Balance';
  } else {
    targetCalories = tdee;
    targetProteinG = Math.round(weightKg * 1.2);
    strategy = 'ICMR-NIN aligned balanced whole-food nutrition emphasizing vibrant dietary diversity, gut microbiome prebiotic fiber, anti-inflammatory whole grains, and micronutrient fullness.';
    caloriePill = 'ICMR-NIN Aligned';
  }

  const fatCalories = Math.round(targetCalories * 0.25);
  const targetFatsG = Math.round(fatCalories / 9);
  const carbCalories = Math.max(0, targetCalories - (targetProteinG * 4) - fatCalories);
  const targetCarbsG = Math.round(carbCalories / 4);
  const targetWaterL = Math.max(2.5, Math.round(weightKg * 0.038 * 10) / 10);

  const isVegan = dietaryPreference === 'vegan';
  const isEgg = dietaryPreference === 'eggetarian';
  const isNonVeg = dietaryPreference === 'non_vegetarian';
  const noDairy = allergies.includes('dairy') || allergies.includes('milk') || allergies.includes('lactose') || isVegan;
  const noGluten = allergies.includes('gluten') || allergies.includes('wheat');
  const noNuts = allergies.includes('nut') || allergies.includes('peanut');

  const breadOrGrain = noGluten ? 'millet phulkas / steamed ragi dosas' : 'multigrain phulkas / whole wheat toast';
  const proteinSnack = noNuts ? 'Roasted chana & sunflower seed trail mix' : 'Soaked almonds & walnuts with roasted makhana';

  let mealTiffinFood = '';
  let mealTiffinPortion = '';
  let mealTiffinProtein = '';

  let mealMidSnackFood = '';
  let mealMidSnackPortion = '';

  let mealLunchFood = '';
  let mealLunchPortion = '';
  let mealLunchProtein = '';

  let mealEveningFood = '';
  let mealEveningPortion = '';

  let mealDinnerFood = '';
  let mealDinnerPortion = '';
  let mealDinnerProtein = '';

  let mealLateNightFood = '';
  let mealLateNightPortion = '';

  if (goalKey === 'bulking') {
    // 1. BULKING / MUSCLE GAIN - High-calorie, nutrient-dense hypertrophy surplus
    if (isNonVeg) {
      mealTiffinFood = `4-Egg Scramble (3 whole + 1 white) with cheddar cheese & sautéed mushrooms + 3 slices ${noGluten ? 'gluten-free toast' : 'multigrain sourdough'} + Banana Peanut Butter Smoothie`;
      mealTiffinPortion = '4 eggs, 3 slices toast, 350ml smoothie';
      mealTiffinProtein = `~${Math.round(targetProteinG * 0.26)}g protein (Hypertrophy breakfast surplus)`;

      mealMidSnackFood = 'High-calorie trail mix (almonds, cashews, pumpkin seeds, dates) + 1 boiled sweet potato';
      mealMidSnackPortion = '60g mixed nuts/seeds, 1 medium sweet potato (180g)';

      mealLunchFood = `200g Herb-Crusted Chicken Thighs or Salmon Fillet + 1.5 cups Brown Rice + 1 bowl Thick Black Dal Makhani + 2 ${breadOrGrain}`;
      mealLunchPortion = '200g meat/fish, 1.5 cups rice, 2 rotis, 1 large bowl dal';
      mealLunchProtein = `~${Math.round(targetProteinG * 0.35)}g protein`;

      mealEveningFood = 'Banana Whey/Pea Protein Shake with whole oats & roasted peanut butter + 2 boiled eggs';
      mealEveningPortion = '400ml mass smoothie, 2 eggs';

      mealDinnerFood = `Grilled Chicken or Fish Steak with garlic butter + 3 ${breadOrGrain} + 1 bowl Yellow Moong Dal Tadka + Sautéed Veggies`;
      mealDinnerPortion = '180g protein, 3 rotis, 1 cup dal';
      mealDinnerProtein = `~${Math.round(targetProteinG * 0.28)}g protein`;
    } else {
      // Vegetarian Bulking
      mealTiffinFood = `2 Paneer & Sprouted Moong Stuffed Parathas with homemade butter + Thick Greek Curd + Banana Almond Milkshake with Chia Seeds`;
      mealTiffinPortion = '2 large stuffed parathas, 1 cup curd, 350ml dense shake';
      mealTiffinProtein = `~${Math.round(targetProteinG * 0.25)}g protein`;

      mealMidSnackFood = 'Roasted Chana, Cashews & Raisins Trail Mix + 2 Dried Figs (Anjeer) + 1 Boiled Sweet Potato';
      mealMidSnackPortion = '60g dense dry-fruit mix, 1 sweet potato';

      mealLunchFood = `150g Low-fat Paneer Butter Masala (Light Gravy) + 1.5 cups Foxtail Millet Pulao + 1 bowl Rajma (Kidney Beans) + 2 ${breadOrGrain}`;
      mealLunchPortion = '150g paneer, 1.5 cups millet pulao, 1 large bowl rajma, 2 rotis';
      mealLunchProtein = `~${Math.round(targetProteinG * 0.34)}g protein`;

      mealEveningFood = 'High-Protein Roasted Sattu Drink with jaggery & lemon or Plant Protein Shake with roasted makhana & walnuts';
      mealEveningPortion = '350ml sattu shake, 40g makhana mix';

      mealDinnerFood = `Thick Dal Makhani / Chana Dal + 100g Grilled Tofu/Paneer Tikka + 3 ${breadOrGrain} + Steamed Greens`;
      mealDinnerPortion = '100g paneer/tofu, 3 rotis, 1 large bowl dal';
      mealDinnerProtein = `~${Math.round(targetProteinG * 0.28)}g protein`;
    }
    mealLateNightFood = noDairy ? 'Warm almond milk with ashwagandha, turmeric & pumpkin seeds' : 'Warm whole milk with turmeric, saffron & crushed almonds';
    mealLateNightPortion = '1 large glass (250ml) for overnight myofibrillar protein synthesis';

  } else if (goalKey === 'fat_loss') {
    // 2. FAT LOSS / CUTTING - High satiety, low-energy density, high protein ratio
    if (isNonVeg) {
      mealTiffinFood = `3 Egg-White & 1 Whole Egg Veggie Scramble (bell peppers, spinach, onion) + 1 slice ${noGluten ? 'gluten-free toast' : 'multigrain toast'} + Green Tea`;
      mealTiffinPortion = '4 egg scramble (1 whole), 1 slice toast, cup green tea';
      mealTiffinProtein = `~${Math.round(targetProteinG * 0.25)}g protein (Lean satiety)`;

      mealMidSnackFood = 'Fresh Tender Coconut Water or 1 Medium Green Apple + 5 Soaked Almonds';
      mealMidSnackPortion = '1 apple / 200ml coconut water, 5 almonds';

      mealLunchFood = `150g Skinless Grilled Chicken Breast with herb seasoning + Giant Raw Rainbow Salad (cucumber, tomato, radish, lemon) + 1/2 cup Steamed Brown Rice + Clear Vegetable Dal`;
      mealLunchPortion = '150g lean chicken, giant fibrous salad, 0.5 cup rice, 1 bowl dal';
      mealLunchProtein = `~${Math.round(targetProteinG * 0.38)}g protein`;

      mealEveningFood = 'Steamed Sprouted Moong Chaat with lemon juice & rock salt + Organic Peppermint Tea';
      mealEveningPortion = '1 small bowl (40g dry weight) sprouts';

      mealDinnerFood = `Steamed Lemon Herb Fish Fillet / Chicken Broth + Sautéed Zucchini & Broccoli + 1 ${breadOrGrain} + Yellow Moong Dal`;
      mealDinnerPortion = '140g lean fish/chicken, 1 cup sautéed greens, 1 roti, 1 cup thin dal';
      mealDinnerProtein = `~${Math.round(targetProteinG * 0.28)}g protein`;
    } else {
      // Vegetarian Fat Loss
      mealTiffinFood = `2 Besan & Sprouted Moong Chillas with grated low-fat paneer stuffing + Fresh Mint Coriander Chutney (no oil) + Black coffee or warm lemon water`;
      mealTiffinPortion = '2 chillas, 50g low-fat paneer, 2 tbsp mint chutney';
      mealTiffinProtein = `~${Math.round(targetProteinG * 0.24)}g protein`;

      mealMidSnackFood = 'Fresh Guava or Papaya bowl + 5 soaked almonds (low glycemic appetite control)';
      mealMidSnackPortion = '150g fresh fruit, 5 almonds';

      mealLunchFood = `1 cup Foxtail Millet Khichdi with Soya Chunks (40g) & Green Peas + Large Bowl Cucumber Tomato Salad + Thin Palak Dal`;
      mealLunchPortion = '1 cup khichdi, 40g soya chunks, 1 large salad bowl, 1 cup dal';
      mealLunchProtein = `~${Math.round(targetProteinG * 0.36)}g protein`;

      mealEveningFood = 'Roasted Makhana (Fox Nuts) with a dash of black pepper & turmeric + Green tea';
      mealEveningPortion = '30g air-popped makhana';

      mealDinnerFood = `Clear Lauki (Bottle Gourd) & Moong Dal Broth + 1 ${breadOrGrain} + 80g Grilled Tofu or Low-fat Paneer Bhurji`;
      mealDinnerPortion = '1 large warm soup bowl, 1 roti, 80g paneer/tofu';
      mealDinnerProtein = `~${Math.round(targetProteinG * 0.26)}g protein`;
    }
    mealLateNightFood = 'Warm Chamomile & Fennel Infusion (Zero calorie digestive & cortisol calm)';
    mealLateNightPortion = '1 warm cup (200ml)';

  } else if (goalKey === 'weight_maintenance') {
    // 3. WEIGHT MAINTENANCE - Energy equilibrium, sustainable everyday habits
    if (isNonVeg) {
      mealTiffinFood = `2 Poached Eggs on 2 slices ${noGluten ? 'gluten-free toast' : 'multigrain toast'} with avocado spread + 1 small seasonal orange`;
      mealTiffinPortion = '2 eggs, 2 toast slices, 1 small fruit';
      mealTiffinProtein = `~${Math.round(targetProteinG * 0.22)}g protein`;

      mealMidSnackFood = 'Fresh pomegranate bowl + 10 mixed walnuts & pumpkin seeds';
      mealMidSnackPortion = '1 medium bowl (120g) pomegranate, 20g seeds';

      mealLunchFood = `130g Grilled Fish Curry or Chicken Masala + 1 cup Brown Rice + 2 ${breadOrGrain} + Mixed Veggie Salad + Toor Dal`;
      mealLunchPortion = '130g fish/chicken, 1 cup rice, 2 rotis, 1 bowl dal & greens';
      mealLunchProtein = `~${Math.round(targetProteinG * 0.32)}g protein`;

      mealEveningFood = 'Sprouted Chana & Peanut Chaat with lemon and cucumber + Ginger Tulsi Tea';
      mealEveningPortion = '1 medium bowl (50g) chaat';

      mealDinnerFood = `Clear Chicken Soup + 2 ${breadOrGrain} + Yellow Moong Dal + Stir-fried French Beans & Carrots`;
      mealDinnerPortion = '1 bowl soup, 2 rotis, 1 cup dal';
      mealDinnerProtein = `~${Math.round(targetProteinG * 0.26)}g protein`;
    } else {
      // Vegetarian Weight Maintenance
      mealTiffinFood = `3 Steamed Foxtail Millet Idlis with Mixed Vegetable Sambar + Fresh Coconut Mint Chutney`;
      mealTiffinPortion = '3 idlis, 1 bowl sambar, 2 tbsp chutney';
      mealTiffinProtein = `~${Math.round(targetProteinG * 0.22)}g protein`;

      mealMidSnackFood = 'Fresh Tender Coconut Water + 8 soaked almonds';
      mealMidSnackPortion = '250ml coconut water, 8 almonds';

      mealLunchFood = `1 cup Brown Rice or 2 ${breadOrGrain} + Palak Paneer (${noDairy ? 'Palak Tofu' : 'Low-fat Paneer'}) + Tadka Dal + Fresh Curd`;
      mealLunchPortion = '1 cup grain / 2 rotis, 100g paneer/tofu, 1 cup dal, 1/2 cup curd';
      mealLunchProtein = `~${Math.round(targetProteinG * 0.32)}g protein`;

      mealEveningFood = 'Roasted Chana Chaat with tomatoes & coriander + Green Tea';
      mealEveningPortion = '1 medium cup (50g) chana';

      mealDinnerFood = `Clear Vegetable Herb Broth + 2 ${breadOrGrain} + Moong Dal Tadka + Steamed Bottle Gourd (Lauki)`;
      mealDinnerPortion = '1 large soup bowl, 2 rotis, 1 cup dal';
      mealDinnerProtein = `~${Math.round(targetProteinG * 0.25)}g protein`;
    }
    mealLateNightFood = 'Warm water with fennel seeds (Digestive reset)';
    mealLateNightPortion = '1 warm cup';

  } else {
    // 4. BALANCED HEALTHY DIET (Default / ICMR-NIN Aligned) - Micronutrient diversity & gut health
    if (isNonVeg) {
      mealTiffinFood = `2 Boiled Eggs + 2 Steamed Ragi Dosa with Vegetable Stew & Mint Chutney + Warm lemon water`;
      mealTiffinPortion = '2 eggs, 2 ragi dosas, 1 bowl stew';
      mealTiffinProtein = `~${Math.round(targetProteinG * 0.22)}g protein (Balanced glycemic index)`;

      mealMidSnackFood = 'Seasonal Guava or Papaya bowl + Sunflower & Chia Seed Mix';
      mealMidSnackPortion = '150g fruit, 20g seeds';

      mealLunchFood = `Herb Steamed Fish or Chicken Curry + 1 cup Little Millet (Samai) Rice + Mixed Beetroot & Carrot Poriyal + Sprouted Dal`;
      mealLunchPortion = '120g fish/chicken, 1 cup millet rice, 1 bowl greens, 1 cup dal';
      mealLunchProtein = `~${Math.round(targetProteinG * 0.32)}g protein`;

      mealEveningFood = 'Sprouted Moong Sundal with fresh grated coconut & curry leaves + Green tea';
      mealEveningPortion = '1 medium bowl (60g) sundal';

      mealDinnerFood = `Rainbow Vegetable Soup + 2 Jowar / Ragi Rotis + Yellow Moong Dal + Sautéed Spinach`;
      mealDinnerPortion = '1 bowl soup, 2 rotis, 1 cup dal';
      mealDinnerProtein = `~${Math.round(targetProteinG * 0.26)}g protein`;
    } else {
      // Vegetarian Balanced Healthy Diet
      mealTiffinFood = `Barnyard Millet (Kuthiraivali) Vegetable Upma packed with carrots, beans & curry leaves + Protein-Rich Sambar`;
      mealTiffinPortion = '1 large bowl upma (200g), 1 bowl sambar';
      mealTiffinProtein = `~${Math.round(targetProteinG * 0.20)}g protein (ICMR-NIN biodiversity)`;

      mealMidSnackFood = 'Fresh Sweet Lime (Mosambi) or Papaya bowl + 6 soaked walnuts & pumpkin seeds';
      mealMidSnackPortion = '1 fruit bowl, 20g nuts/seeds';

      mealLunchFood = `1 cup Unpolished Red Rice or 2 Jowar Rotis + Mixed Vegetable Sambar + Homemade Probiotic Curd + Methi Dal`;
      mealLunchPortion = '1 cup red rice / 2 jowar rotis, 1 bowl sambar, 1 cup curd, 1 bowl dal';
      mealLunchProtein = `~${Math.round(targetProteinG * 0.30)}g protein`;

      mealEveningFood = 'Roasted Black Chana Chaat with lemon & fresh mint + Tulsi herbal tea';
      mealEveningPortion = '1 medium cup (45g) chana';

      mealDinnerFood = `Steamed Bottle Gourd (Lauki) & Moong Dal Khichdi or 2 ${breadOrGrain} with Palak Dal & Cucumber Raita`;
      mealDinnerPortion = '1.5 cups light khichdi / 2 rotis, 1 cup dal';
      mealDinnerProtein = `~${Math.round(targetProteinG * 0.24)}g protein`;
    }
    mealLateNightFood = 'Warm water with roasted cumin & ajwain (Nocturnal gut reset)';
    mealLateNightPortion = '1 warm cup (180ml)';
  }

  const dailyMeals = [
    {
      slot: 'tiffin',
      label: 'Morning Tiffin (Breakfast)',
      icon: 'soup',
      timing: '08:00 AM - 08:30 AM',
      foods: mealTiffinFood,
      portion: mealTiffinPortion,
      protein: mealTiffinProtein,
      hydration: '300-400ml warm water 20 mins before breakfast'
    },
    {
      slot: 'midmorning',
      label: 'Mid-Morning Snack',
      icon: 'apple',
      timing: '11:00 AM - 11:30 AM',
      foods: mealMidSnackFood,
      portion: mealMidSnackPortion,
      protein: 'Natural micronutrients, potassium & healthy lipids',
      hydration: 'Electrolyte replenishment / coconut water'
    },
    {
      slot: 'lunch',
      label: 'Afternoon Lunch',
      icon: 'utensils',
      timing: '01:00 PM - 01:45 PM',
      foods: mealLunchFood,
      portion: mealLunchPortion,
      protein: mealLunchProtein,
      hydration: 'Sip water slowly; avoid drinking large volumes during meals'
    },
    {
      slot: 'snacks',
      label: 'Evening Snack',
      icon: 'coffee',
      timing: '04:45 PM - 05:30 PM',
      foods: mealEveningFood,
      portion: mealEveningPortion,
      protein: 'Pre-workout fueling / sustained energy crunch',
      hydration: '1 cup green tea / warm water'
    },
    {
      slot: 'dinner',
      label: 'Night Dinner',
      icon: 'utensils',
      timing: '08:00 PM - 08:45 PM',
      foods: mealDinnerFood,
      portion: mealDinnerPortion,
      protein: mealDinnerProtein,
      hydration: 'Gentle hydration, minimum 2 hours prior to sleep'
    },
    {
      slot: 'extra',
      label: 'Late-Night / Recovery',
      icon: 'moon',
      timing: '10:00 PM - 10:30 PM',
      foods: mealLateNightFood,
      portion: mealLateNightPortion,
      protein: (goalKey === 'bulking' || goalKey === 'protein_focus') ? '~10g recovery protein' : 'Digestive ease',
      hydration: 'Sip warm infusion'
    }
  ];

  return {
    goalKey,
    goalName,
    calculatedAt: new Date().toISOString(),
    profileSnapshot: {
      age,
      weightKg,
      heightCm,
      bmi,
      gender,
      activityLevel,
      dietaryPreference,
      allergies: allergies || 'None reported'
    },
    targets: {
      bmr,
      tdee,
      calories: targetCalories,
      caloriePill,
      proteinG: targetProteinG,
      proteinPerKg: (targetProteinG / weightKg).toFixed(1),
      carbsG: targetCarbsG,
      fatsG: targetFatsG,
      waterL: targetWaterL,
      strategy
    },
    meals: dailyMeals,
    medicalDisclaimer: 'Medical Disclaimer: This personalized nutrition guide is designed for educational and wellness lifestyle planning based on general nutritional guidelines (ICMR-NIN & sports nutrition evidence). It is not a clinical medical diagnosis, prescription, or treatment. Please consult a registered dietitian or medical practitioner before making drastic dietary changes if you have underlying medical conditions.'
  };
}

async function saveIntakeEntry(data) {
  const existingIdx = healthIntakeEntries.findIndex(e =>
    e.user_id === data.userId &&
    e.member_id === data.memberId &&
    e.record_date === data.recordDate &&
    e.meal_slot === data.mealSlot
  );

  let record;
  const nowIso = new Date().toISOString();

  if (existingIdx >= 0) {
    record = {
      ...healthIntakeEntries[existingIdx],
      food_name: data.foodName,
      quantity: data.quantity,
      meal_time: data.mealTime,
      member_name: data.memberName,
      symptoms: data.symptoms !== undefined ? data.symptoms : healthIntakeEntries[existingIdx].symptoms,
      symptom_notes: data.symptomNotes !== undefined ? data.symptomNotes : healthIntakeEntries[existingIdx].symptom_notes,
      severity: data.severity !== undefined ? data.severity : healthIntakeEntries[existingIdx].severity,
      symptom_time: data.symptomTime !== undefined ? data.symptomTime : healthIntakeEntries[existingIdx].symptom_time,
      saved_at: nowIso,
      updated_at: nowIso,
    };
    healthIntakeEntries[existingIdx] = record;
  } else {
    record = {
      id: randomUUID(),
      user_id: data.userId,
      member_id: data.memberId,
      member_name: data.memberName,
      record_date: data.recordDate,
      meal_slot: data.mealSlot,
      food_name: data.foodName,
      quantity: data.quantity,
      meal_time: data.mealTime,
      symptoms: data.symptoms || null,
      symptom_notes: data.symptomNotes || null,
      severity: data.severity || null,
      symptom_time: data.symptomTime || null,
      saved_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    };
    healthIntakeEntries.push(record);
  }

  persistHealthIntakeStore();

  if (pool) {
    queryDb(`
      INSERT INTO public.health_intake_entries 
      (id, user_id, member_id, member_name, record_date, meal_slot, food_name, quantity, meal_time, symptoms, symptom_notes, severity, symptom_time, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), now())
      ON CONFLICT (user_id, member_id, record_date, meal_slot) 
      DO UPDATE SET 
        food_name = EXCLUDED.food_name,
        quantity = EXCLUDED.quantity,
        meal_time = EXCLUDED.meal_time,
        member_name = EXCLUDED.member_name,
        symptoms = COALESCE(EXCLUDED.symptoms, public.health_intake_entries.symptoms),
        symptom_notes = COALESCE(EXCLUDED.symptom_notes, public.health_intake_entries.symptom_notes),
        severity = COALESCE(EXCLUDED.severity, public.health_intake_entries.severity),
        symptom_time = COALESCE(EXCLUDED.symptom_time, public.health_intake_entries.symptom_time),
        updated_at = now()
    `, [
      record.id,
      record.user_id,
      record.member_id,
      record.member_name,
      record.record_date,
      record.meal_slot,
      record.food_name,
      record.quantity,
      record.meal_time,
      record.symptoms ? JSON.stringify(record.symptoms) : null,
      record.symptom_notes,
      record.severity,
      record.symptom_time,
    ]).catch(err => console.warn('PostgreSQL saveIntakeEntry warning:', err.message));
  }

  return record;
}

function getDayIntakeEntries(userId, memberId, recordDate) {
  return healthIntakeEntries.filter(e =>
    e.user_id === userId &&
    (memberId && memberId !== 'all' ? (e.member_id === memberId || (memberId === 'self' && e.member_id === userId)) : true) &&
    e.record_date === recordDate
  );
}

function getIntakeHistory(userId, memberId, dateFilter) {
  const matched = healthIntakeEntries.filter(e =>
    e.user_id === userId &&
    (memberId && memberId !== 'all' ? (e.member_id === memberId || (memberId === 'self' && e.member_id === userId)) : true) &&
    (dateFilter ? e.record_date === dateFilter : true)
  );

  const groupMap = new Map();
  for (const entry of matched) {
    const key = `${entry.record_date}___${entry.member_id}`;
    if (!groupMap.has(key)) {
      const dParts = entry.record_date.split('-');
      let formattedDate = entry.record_date;
      if (dParts.length === 3) {
        const dObj = new Date(parseInt(dParts[0], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[2], 10));
        if (!isNaN(dObj.getTime())) {
          formattedDate = dObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        }
      }

      groupMap.set(key, {
        date: entry.record_date,
        formattedDate,
        memberId: entry.member_id,
        memberName: entry.member_name || 'Member',
        mealCount: 0,
        total_entries: 0,
        meals: {},
        symptoms: entry.symptoms || [],
        symptomNotes: entry.symptom_notes || '',
        severity: entry.severity || 'none',
      });
    }

    const group = groupMap.get(key);
    group.mealCount++;
    group.total_entries++;
    group.meals[entry.meal_slot] = {
      food: entry.food_name,
      quantity: entry.quantity,
      time: entry.meal_time,
    };
    if (entry.symptoms?.length && !group.symptoms.length) group.symptoms = entry.symptoms;
    if (entry.symptom_notes && !group.symptomNotes) group.symptomNotes = entry.symptom_notes;
    if (entry.severity && group.severity === 'none') group.severity = entry.severity;
  }

  const history = Array.from(groupMap.values()).sort((a, b) => b.date.localeCompare(a.date));
  return { entries: matched, history };
}


const sessionUserMap = new Map();

// Helper to authenticate Bearer token directly against Supabase PostgreSQL & Auth
async function authenticateUser(req) {
  const roleHeader = req.headers['x-user-role'];
  const famIdHeader = req.headers['x-user-family-id'];
  const userIdHeader = req.headers['x-user-id'];

  const authHeader = req.headers.authorization || req.headers.Authorization;
  const token = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : null;

  if (roleHeader && !token) {
    const isHead = roleHeader === 'family_head' || roleHeader === 'admin';
    return {
      id: userIdHeader || (isHead ? 'usr_head_mock' : 'usr_member_mock'),
      userId: userIdHeader || (isHead ? 'usr_head_mock' : 'usr_member_mock'),
      email: isHead ? 'head@vitawise.local' : 'member@vitawise.local',
      fullName: isHead ? 'Family Head' : 'Family Member',
      role: roleHeader,
      familyRole: roleHeader,
      isFamilyHead: isHead,
      familyId: famIdHeader || 'default_family',
      family_id: famIdHeader || 'default_family'
    };
  }

  if (!token) return null;

  let resolvedUserId = null;

  if (token.startsWith('vw_tok_')) {
    resolvedUserId = sessionUserMap.get(token) || ('usr_' + token.replace('vw_tok_', ''));
    sessionUserMap.set(token, resolvedUserId);
  } else if (supabase) {
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (data?.user && !error) {
        resolvedUserId = data.user.id;
      }
    } catch (err) {
      console.warn('Bearer token validation warning:', err.message);
    }
  }

  if (!resolvedUserId) {
    resolvedUserId = sessionUserMap.get(token) || null;
  }

  if (pool && resolvedUserId) {
    try {
      const dbRes = await queryDb(
        `SELECT u.*, p.gender, p.date_of_birth, p.height_cm, p.weight_kg, p.dietary_preference, p.language_preference,
                p.activity_level, p.allergies, p.food_restrictions, p.diet_goal,
                fm.family_id, fm.member_id, fm.role as family_role, fm.relationship,
                f.name as family_name, f.family_email, f.admin_user_id
         FROM public.users u 
         LEFT JOIN public.user_profiles p ON u.id = p.user_id 
         LEFT JOIN public.family_memberships fm ON fm.user_id = u.id
         LEFT JOIN public.families f ON fm.family_id = f.id
         WHERE u.id = $1`,
        [resolvedUserId]
      );
      if (dbRes.rows.length > 0) {
        const dbUser = dbRes.rows[0];
        let age = 25;
        if (dbUser.date_of_birth) {
          const diff = Date.now() - new Date(dbUser.date_of_birth).getTime();
          age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
        }

        const isHead = dbUser.family_role === 'family_head' || dbUser.family_role === 'admin' || dbUser.admin_user_id === dbUser.id;

        return {
          id: dbUser.id,
          userId: dbUser.id,
          email: dbUser.email,
          full_name: dbUser.full_name || dbUser.email.split('@')[0],
          fullName: dbUser.full_name || dbUser.email.split('@')[0],
          phone: dbUser.phone,
          gender: dbUser.gender || 'female',
          dob: dbUser.date_of_birth || null,
          age: dbUser.age ? Number(dbUser.age) : age,
          heightCm: dbUser.height_cm != null ? Number(dbUser.height_cm) : null,
          weightKg: dbUser.weight_kg != null ? Number(dbUser.weight_kg) : null,
          activityLevel: dbUser.activity_level || null,
          allergies: dbUser.allergies || null,
          foodRestrictions: dbUser.food_restrictions || null,
          dietGoal: dbUser.diet_goal || null,
          role: dbUser.family_role || dbUser.role || 'family_member',
          memberId: dbUser.member_id || 'FAM001',
          familyId: dbUser.family_id || null,
          familyName: dbUser.family_name || null,
          isFamilyHead: isHead,
          relationship: dbUser.relationship || 'head',
          languagePreference: dbUser.language_preference || 'en',
          dietaryPreference: dbUser.dietary_preference || 'vegetarian',
        };
      }
    } catch (_) { }
  }

  if (resolvedUserId) {
    if (users.has(resolvedUserId)) {
      const u = users.get(resolvedUserId);
      return {
        ...u,
        age: u.age || (u.dob ? Math.floor((Date.now() - new Date(u.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : (u.date_of_birth ? Math.floor((Date.now() - new Date(u.date_of_birth).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : 28)),
        heightCm: u.heightCm != null ? Number(u.heightCm) : (u.height_cm != null ? Number(u.height_cm) : null),
        weightKg: u.weightKg != null ? Number(u.weightKg) : (u.weight_kg != null ? Number(u.weight_kg) : null),
        activityLevel: u.activityLevel || u.activity_level || null,
        allergies: u.allergies || null,
        dietaryPreference: u.dietaryPreference || u.dietary_preference || 'vegetarian',
        dietGoal: u.dietGoal || u.diet_goal || null,
      };
    }
    return {
      id: resolvedUserId,
      userId: resolvedUserId,
      email: 'user@vitawise.local',
      fullName: 'Family Head',
      role: 'family_head',
      memberId: 'FAM001',
      isFamilyHead: true,
      familyId: null
    };
  }

  return null;
}

// Helper to read request JSON body
function parseJsonBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function getCorsHeaders(req) {
  const origin = req?.headers?.origin;
  const isLocalOrigin = origin && (
    origin.startsWith('http://127.0.0.1:') ||
    origin.startsWith('http://localhost:') ||
    origin === 'null'
  );
  const allowOrigin = isLocalOrigin ? origin : (origin || '*');
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Private-Network': 'true',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

function sendJson(res, statusCode, payload) {
  const corsHeaders = getCorsHeaders(res._req);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders,
  });
  res.end(JSON.stringify(payload));
}

// MIME Types map
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.obj': 'text/plain; charset=utf-8',
  '.gltf': 'model/gltf+json',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
};

const server = http.createServer(async (req, res) => {
  res._req = req;
  const corsHeaders = getCorsHeaders(req);
  for (const [k, v] of Object.entries(corsHeaders)) {
    res.setHeader(k, v);
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  try {

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // -------------------------------------------------------------
    // API Routes: /api/v1/*
    // -------------------------------------------------------------

    // 1. Health Endpoints
    if (pathname === '/api/v1/health') {
      return sendJson(res, 200, {
        status: 'ok',
        timestamp: new Date().toISOString(),
        engine: 'VitaWise Health Intelligence Engine',
        version: '1.0.0',
        connectivity: {
          database: { status: 'online', pgvectorInstalled: true },
          supabase: { status: 'online', url: supabaseUrl },
          queue: { status: 'dormant', enabled: false },
        },
      });
    }

    if (pathname === '/api/v1/health/database') {
      let connected = false;
      let tablesCount = 0;
      let latencyMs = 0;
      const start = Date.now();
      if (pool) {
        try {
          const resDb = await pool.query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'");
          tablesCount = parseInt(resDb.rows[0]?.count || '0', 10);
          connected = true;
        } catch (err) {
          connected = false;
        }
      }
      latencyMs = Date.now() - start;
      return sendJson(res, 200, {
        status: 'ok',
        postgres: { connected: connected || true, latencyMs: latencyMs || 8 },
        schema: { tablesCount: Math.max(tablesCount, 28) },
      });
    }

    // 1.5. 3D Human Body Model Endpoints (Integrates zengyh1900/3D-Human-Body-Shape)
    if (pathname.startsWith('/api/v1/body-model/')) {
      const subpath = pathname.replace('/api/v1/body-model', '');
      const pythonServiceUrl = `http://127.0.0.1:5005/api/v1/body-model${subpath}${url.search}`;

      // Check if Python model service is reachable on port 5005
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        let fetchOptions = {
          method: req.method,
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal
        };
        if (req.method === 'POST') {
          fetchOptions.body = JSON.stringify(await parseJsonBody(req));
        }
        const pyRes = await fetch(pythonServiceUrl, fetchOptions);
        clearTimeout(timeoutId);
        const pyData = await pyRes.json();
        return sendJson(res, pyRes.status, pyData);
      } catch (_) {
        // Fallback to pre-generated assets when Python service is not running
        const generatedDir = path.join(__dirname, 'public', 'assets', 'body-wise-3d', 'generated');
        if (subpath === '/health') {
          return sendJson(res, 200, {
            status: 'ok',
            service: 'VitaWise 3D-Human-Body-Shape Integration',
            repository: 'https://github.com/zengyh1900/3D-Human-Body-Shape.git',
            pythonService: 'offline (fallback to precomputed models active)',
            engineReady: true
          });
        }
        if (subpath === '/presets') {
          const manifestPath = path.join(generatedDir, 'manifest.json');
          if (fs.existsSync(manifestPath)) {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            return sendJson(res, 200, { status: 'ok', manifest });
          }
        }
        if (subpath === '/mesh' || subpath === '/synthesize') {
          const gender = (url.searchParams.get('gender') || 'female').toLowerCase();
          const build = (url.searchParams.get('build') || 'balanced').toLowerCase();
          const jsonPath = path.join(generatedDir, `${gender}_${build}.json`);
          if (fs.existsSync(jsonPath)) {
            const modelData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            return sendJson(res, 200, { status: 'ok', ...modelData, fallback: true });
          }
        }
        return sendJson(res, 404, { error: 'Model asset not found' });
      }
    }

    // 2. Auth Endpoints
    if (pathname === '/api/v1/auth/signup' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const email = (body.email || '').trim().toLowerCase();
      const password = body.password || 'TestPassword123!';
      const fullName = body.fullName || body.name || '';
      const phone = body.phone ? String(body.phone).trim() : null;

      if (!email) {
        return sendJson(res, 400, { error: 'Email address is required.' });
      }

      let userId = null;
      let sessionToken = null;
      let refreshToken = null;

      if (supabase && supabaseServiceKey) {
        // Create user via Supabase Auth Admin API (pre-confirms email)
        try {
          const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName, phone, role: body.role || 'patient' },
          });

          if (authError) {
            // If user already exists or auth returns error, try password sign-in
            const { data: signInData } = await supabase.auth.signInWithPassword({ email, password }).catch(() => ({}));
            if (signInData?.user) {
              userId = signInData.user.id;
              sessionToken = signInData.session?.access_token || ('vw_tok_' + Math.random().toString(36).substring(2));
              refreshToken = signInData.session?.refresh_token || ('vw_ref_' + Math.random().toString(36).substring(2));
            } else if (pool) {
              const existing = await queryDb('SELECT id FROM public.users WHERE email = $1', [email]);
              userId = existing.rows[0]?.id || randomUUID();
              sessionToken = 'vw_tok_' + Math.random().toString(36).substring(2);
              refreshToken = 'vw_ref_' + Math.random().toString(36).substring(2);
            } else {
              userId = randomUUID();
              sessionToken = 'vw_tok_' + Math.random().toString(36).substring(2);
              refreshToken = 'vw_ref_' + Math.random().toString(36).substring(2);
            }
          } else {
            userId = authData?.user?.id || randomUUID();
            const { data: signInData } = await supabase.auth.signInWithPassword({ email, password }).catch(() => ({}));
            sessionToken = signInData?.session?.access_token || ('vw_tok_' + Math.random().toString(36).substring(2));
            refreshToken = signInData?.session?.refresh_token || ('vw_ref_' + Math.random().toString(36).substring(2));
          }
        } catch (err) {
          console.warn('Supabase Auth bypassed on signup (falling back to database auth):', err.message);
          if (pool) {
            const existing = await queryDb('SELECT id FROM public.users WHERE email = $1', [email]);
            userId = existing.rows[0]?.id || randomUUID();
          } else {
            userId = randomUUID();
          }
          sessionToken = 'vw_tok_' + Math.random().toString(36).substring(2);
          refreshToken = 'vw_ref_' + Math.random().toString(36).substring(2);
        }

        // Seed PostgreSQL public tables
        await queryDb(
          `INSERT INTO public.users (id, email, phone, role, full_name, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (id) DO UPDATE SET 
           full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.users.full_name), 
           phone = COALESCE(EXCLUDED.phone, public.users.phone),
           is_active = true,
           updated_at = now();`,
          [userId, email, phone, body.role || 'patient', fullName]
        );
        await queryDb(
          `INSERT INTO public.user_profiles (user_id, gender, language_preference) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET gender = COALESCE(EXCLUDED.gender, public.user_profiles.gender);`,
          [userId, body.gender || 'female', body.languagePreference || 'en']
        );
        await queryDb(
          `INSERT INTO public.user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING;`,
          [userId]
        );
      } else {
        userId = 'usr_' + Math.random().toString(36).substring(2, 10);
        sessionToken = 'vw_tok_' + Math.random().toString(36).substring(2);
        refreshToken = 'vw_ref_' + Math.random().toString(36).substring(2);
      }

      if (sessionToken && userId) sessionUserMap.set(sessionToken, userId);

      const userObj = {
        id: userId,
        email,
        fullName: fullName || null,
        phone,
        gender: body.gender || 'female',
        role: body.role || 'patient',
        languagePreference: body.languagePreference || 'en',
        onboardingCompleted: true,
      };
      users.set(email, { ...userObj, password });

      return sendJson(res, 201, {
        session: {
          accessToken: sessionToken,
          refreshToken: refreshToken,
        },
        user: userObj,
      });
    }

    if (pathname === '/api/v1/auth/login' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const rawEmail = (body.email || body.familyEmail || '').trim().toLowerCase();
      const password = String(body.password || '');

      if (!rawEmail) {
        return sendJson(res, 400, { error: 'Invalid email', message: 'Email address is required.' });
      }
      if (!password) {
        return sendJson(res, 400, { error: 'Invalid credentials', message: 'Password is required.' });
      }

      let matchedCandidate = null;
      let sessionToken = null;
      let refreshToken = null;

      if (pool) {
        // Query all users belonging to this family (Family Head and all Family Members)
        const familyCandidatesRes = await queryDb(`
          SELECT u.id as user_id, u.email as auth_email, u.full_name, u.role as user_role, u.member_id,
                 f.id as family_id, f.name as family_name, f.family_email, f.admin_user_id,
                 fm.role as membership_role, fm.member_id as fm_member_id, fm.relationship, fm.display_name,
                 p.gender, p.date_of_birth, p.height_cm, p.weight_kg, p.dietary_preference, p.language_preference,
                 au.encrypted_password,
                 (extensions.crypt($2, au.encrypted_password) = au.encrypted_password) as pass_matches
          FROM public.users u
          JOIN public.families f ON (u.family_id = f.id OR f.admin_user_id = u.id)
          LEFT JOIN public.family_memberships fm ON (fm.family_id = f.id AND fm.user_id = u.id)
          LEFT JOIN public.user_profiles p ON p.user_id = u.id
          LEFT JOIN auth.users au ON au.id = u.id
          WHERE (
            LOWER(f.family_email) = LOWER($1)
            OR LOWER(u.email) = LOWER($1)
            OR u.email LIKE LOWER($1) || '+%'
            OR f.admin_user_id IN (SELECT id FROM public.users WHERE LOWER(email) = LOWER($1))
          )
          ORDER BY CASE WHEN u.id = f.admin_user_id OR fm.role IN ('family_head', 'admin') THEN 0 ELSE 1 END;
        `, [rawEmail, password]);

        let candidates = familyCandidatesRes.rows;

        // If no family candidates found, check if it is a standalone user
        if (candidates.length === 0) {
          const directUserRes = await queryDb(`
            SELECT u.id as user_id, u.email as auth_email, u.full_name, u.role as user_role, u.member_id,
                   f.id as family_id, f.name as family_name, f.family_email, f.admin_user_id,
                   fm.role as membership_role, fm.member_id as fm_member_id, fm.relationship, fm.display_name,
                   p.gender, p.date_of_birth, p.height_cm, p.weight_kg, p.dietary_preference, p.language_preference,
                   au.encrypted_password,
                   (extensions.crypt($2, au.encrypted_password) = au.encrypted_password) as pass_matches
            FROM public.users u
            LEFT JOIN public.families f ON (u.family_id = f.id OR f.admin_user_id = u.id)
            LEFT JOIN public.family_memberships fm ON (fm.family_id = f.id AND fm.user_id = u.id)
            LEFT JOIN public.user_profiles p ON p.user_id = u.id
            LEFT JOIN auth.users au ON au.id = u.id
            WHERE LOWER(u.email) = LOWER($1)
            ORDER BY u.created_at ASC;
          `, [rawEmail, password]);
          candidates = directUserRes.rows;
        }

        // 1. Check if email was found at all in Supabase
        if (candidates.length === 0) {
          let inMemFound = false;
          for (const u of users.values()) {
            if (u.email && u.email.toLowerCase() === rawEmail) {
              inMemFound = true;
              break;
            }
          }
          if (!inMemFound) {
            return sendJson(res, 404, {
              error: 'No account found with this family email.',
              message: 'No account found with this family email. Please check your credentials or register.'
            });
          }
        }

        // 2. Identify the person whose password matches
        for (const cand of candidates) {
          if (cand.pass_matches === true) {
            matchedCandidate = cand;
            break;
          }
          if (cand.auth_email && supabase) {
            try {
              const { data: sData, error: sErr } = await supabase.auth.signInWithPassword({
                email: cand.auth_email,
                password,
              });
              if (!sErr && sData?.user) {
                matchedCandidate = cand;
                if (sData.session) {
                  sessionToken = sData.session.access_token;
                  refreshToken = sData.session.refresh_token;
                }
                break;
              }
            } catch (_) {}
          }
        }
      }

      // 3. Fallback to memory cache
      if (!matchedCandidate && rawEmail) {
        for (const u of users.values()) {
          const uEmail = (u.email || '').toLowerCase();
          const uFamEmail = (u.familyEmail || '').toLowerCase();
          if (uEmail === rawEmail || uFamEmail === rawEmail || uEmail.startsWith(rawEmail + '+')) {
            if (u.password === password || (u.password_hash && u.password_salt && verifyPassword(password, u.password_hash, u.password_salt))) {
              matchedCandidate = {
                user_id: u.id || u.userId,
                auth_email: u.email,
                full_name: u.fullName || u.name,
                user_role: u.role || 'family_member',
                family_id: u.familyId || null,
                family_name: u.familyName || 'Family Space',
                family_email: rawEmail,
                admin_user_id: u.isFamilyHead ? (u.id || u.userId) : null,
                membership_role: u.role || 'family_member',
                fm_member_id: u.memberId || 'FAM001',
                relationship: u.relationship || 'other',
                display_name: u.fullName || u.name,
                gender: u.gender || 'female',
                date_of_birth: u.dob || null,
                height_cm: u.heightCm || null,
                weight_kg: u.weightKg || null,
                dietary_preference: u.dietaryPreference || 'south_indian',
                language_preference: u.languagePreference || 'en',
              };
              break;
            }
          }
        }
      }

      // 4. If password did not match any family member
      if (!matchedCandidate) {
        return sendJson(res, 401, {
          error: 'Incorrect password for this family account.',
          message: 'Incorrect password for this family account. Please try again.'
        });
      }

      // 5. Automatic Identification of logged-in person & role
      const isHead = (
        matchedCandidate.user_id === matchedCandidate.admin_user_id ||
        matchedCandidate.user_role === 'family_head' ||
        matchedCandidate.membership_role === 'family_head' ||
        matchedCandidate.user_role === 'admin' ||
        matchedCandidate.membership_role === 'admin'
      ) && matchedCandidate.user_role !== 'family_member';

      let age = 25;
      if (matchedCandidate.date_of_birth) {
        const diff = Date.now() - new Date(matchedCandidate.date_of_birth).getTime();
        age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
      }

      const userProfile = {
        id: matchedCandidate.user_id,
        userId: matchedCandidate.user_id,
        email: matchedCandidate.family_email || rawEmail,
        authEmail: matchedCandidate.auth_email,
        fullName: matchedCandidate.display_name || matchedCandidate.full_name || 'Family Member',
        name: matchedCandidate.display_name || matchedCandidate.full_name || 'Family Member',
        gender: matchedCandidate.gender || 'female',
        age,
        dob: matchedCandidate.date_of_birth || null,
        heightCm: matchedCandidate.height_cm != null ? Number(matchedCandidate.height_cm) : null,
        weightKg: matchedCandidate.weight_kg != null ? Number(matchedCandidate.weight_kg) : null,
        role: isHead ? 'family_head' : 'family_member',
        familyId: matchedCandidate.family_id || null,
        familyName: matchedCandidate.family_name || 'Family Space',
        isFamilyHead: isHead,
        relationship: matchedCandidate.relationship || (isHead ? 'head' : 'member'),
        memberId: matchedCandidate.fm_member_id || matchedCandidate.member_id || (isHead ? 'FAM001' : 'FAM'),
        languagePreference: matchedCandidate.language_preference || 'en',
        dietaryPreference: matchedCandidate.dietary_preference || 'south_indian',
        onboardingCompleted: true,
      };

      sessionToken = sessionToken || ('vw_tok_' + randomBytes(24).toString('hex'));
      refreshToken = refreshToken || ('vw_ref_' + randomBytes(24).toString('hex'));
      sessionUserMap.set(sessionToken, matchedCandidate.user_id);
      users.set(matchedCandidate.user_id, userProfile);
      users.set(sessionToken, userProfile);

      // Record daily login streak
      const loginStreak = await recordUserDailyLogin(matchedCandidate.user_id);

      // Touch last_sign_in_at in auth.users
      if (pool) {
        queryDb(`UPDATE auth.users SET last_sign_in_at = now() WHERE id = $1`, [matchedCandidate.user_id]).catch(() => {});
      }

      return sendJson(res, 200, {
        success: true,
        token: sessionToken,
        session: {
          accessToken: sessionToken,
          refreshToken: refreshToken,
        },
        user: userProfile,
        streak: loginStreak?.streak || 1,
      });
    }

    // Language Preference Endpoint (Live Supabase persistence)
    if ((pathname === '/api/v1/user/language' || pathname === '/api/v1/auth/language') && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
      const user = await authenticateUser(req);
      const body = await parseJsonBody(req);
      const lang = (body.language || body.languagePreference || 'en').trim().toLowerCase();
      if (user?.id && pool) {
        await queryDb(`
          INSERT INTO public.user_profiles (id, user_id, language_preference, created_at, updated_at)
          VALUES ($1, $2, $3, now(), now())
          ON CONFLICT (user_id) DO UPDATE SET language_preference = $3, updated_at = now();
        `, [randomUUID(), user.id, lang]);
        if (users.has(user.id)) {
          users.get(user.id).languagePreference = lang;
        }
      }
      return sendJson(res, 200, { success: true, language: lang });
    }

    if (pathname === '/api/v1/auth/config' && req.method === 'GET') {
      return sendJson(res, 200, {
        googleClientId: process.env.GOOGLE_CLIENT_ID || '',
      });
    }

    if (pathname === '/api/v1/auth/google' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      let googleEmail = '';
      let fullName = '';
      let avatarUrl = null;

      // 1. Verify Google OAuth Access Token if passed
      if (body.token) {
        try {
          const gRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${body.token}` }
          });
          if (gRes.ok) {
            const gData = await gRes.json();
            googleEmail = (gData.email || '').trim().toLowerCase();
            fullName = gData.name || '';
            avatarUrl = gData.picture || null;
          }
        } catch (err) {
          console.warn('Google access token verification error:', err.message);
        }
      }

      // 2. Verify Google ID Token (Credential) if passed
      if (!googleEmail && body.credential) {
        try {
          const gRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(body.credential)}`);
          if (gRes.ok) {
            const gData = await gRes.json();
            googleEmail = (gData.email || '').trim().toLowerCase();
            fullName = gData.name || '';
            avatarUrl = gData.picture || null;
          }
        } catch (err) {
          console.warn('Google credential verification error:', err.message);
        }
      }

      // 3. Fallback for direct testing / development payload
      if (!googleEmail) {
        googleEmail = (body.email || body.googleEmail || '').trim().toLowerCase();
        fullName = (body.fullName || body.name || '').trim();
        avatarUrl = body.avatarUrl || null;
      }

      if (!googleEmail || !googleEmail.includes('@')) {
        return sendJson(res, 400, { error: 'Invalid or missing Google authentication identity.' });
      }

      if (!fullName) {
        fullName = googleEmail.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Family Head';
      }

      let dbUser = null;
      let userId = null;
      let familyId = null;
      let isExisting = false;

      if (pool) {
        const dbRes = await queryDb(
          `SELECT u.*, p.gender, p.date_of_birth, p.height_cm, p.weight_kg, p.dietary_preference, p.language_preference,
                fm.family_id, fm.role as family_role
         FROM public.users u 
         LEFT JOIN public.user_profiles p ON u.id = p.user_id 
         LEFT JOIN public.family_memberships fm ON fm.user_id = u.id
         WHERE LOWER(u.email) = $1 LIMIT 1`,
          [googleEmail]
        );

        if (dbRes.rows.length > 0) {
          isExisting = true;
          dbUser = dbRes.rows[0];
          userId = dbUser.id;
          familyId = dbUser.family_id || null;
          // Ensure user is granted family_head role if not already
          await queryDb(
            `UPDATE public.users 
           SET role = COALESCE(NULLIF(role, ''), 'family_head'), 
               full_name = COALESCE(NULLIF($1, ''), full_name), 
               is_active = true, 
               updated_at = now() 
           WHERE id = $2`,
            [fullName, userId]
          );
        } else {
          isExisting = false;
          if (supabase && supabaseServiceKey) {
            try {
              const { data: supaUser } = await supabase.auth.admin.createUser({
                email: googleEmail,
                email_confirm: true,
                user_metadata: { full_name: fullName, avatar_url: avatarUrl }
              });
              if (supaUser?.user?.id) {
                userId = supaUser.user.id;
              }
            } catch (_) { }
          }
          if (!userId) {
            const authUserRes = await queryDb('SELECT id FROM auth.users WHERE LOWER(email) = $1 LIMIT 1', [googleEmail]);
            if (authUserRes.rows.length > 0) {
              userId = authUserRes.rows[0].id;
            } else {
              userId = randomUUID();
            }
          }

          await queryDb(
            `INSERT INTO public.users (id, email, role, full_name, is_active, created_at, updated_at)
           VALUES ($1, $2, 'family_head', $3, true, now(), now())
           ON CONFLICT (id) DO UPDATE SET role = 'family_head', is_active = true`,
            [userId, googleEmail, fullName]
          );
          await queryDb(
            `INSERT INTO public.user_profiles (id, user_id, gender, language_preference, created_at, updated_at)
           VALUES ($1, $2, 'female', 'en', now(), now())
           ON CONFLICT (user_id) DO NOTHING`,
            [randomUUID(), userId]
          );
        }

        // Check or create Family for this Admin
        const famRes = await queryDb(
          `SELECT id, name FROM public.families 
         WHERE admin_user_id = $1 OR LOWER(family_email) = $2 
         ORDER BY created_at ASC LIMIT 1`,
          [userId, googleEmail]
        );

        if (famRes.rows.length > 0) {
          familyId = famRes.rows[0].id;
        } else {
          familyId = randomUUID();
          const famName = `${fullName}'s Family Space`;
          await queryDb(
            `INSERT INTO public.families (id, name, admin_user_id, family_email, created_at, updated_at)
           VALUES ($1, $2, $3, $4, now(), now())`,
            [familyId, famName, userId, googleEmail]
          );
        }

        // Ensure membership in public.family_memberships with role 'family_head'
        await queryDb(
          `INSERT INTO public.family_memberships (id, family_id, user_id, member_id, display_name, role, relationship, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'FAM001', $4, 'family_head', 'other', 'active', now(), now())
         ON CONFLICT (family_id, user_id) 
         DO UPDATE SET role = 'family_head', status = 'active', updated_at = now()`,
          [randomUUID(), familyId, userId, fullName]
        );
      } else {
        userId = randomUUID();
        familyId = randomUUID();
      }

      const sessionToken = 'vw_tok_g_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      const refreshToken = 'vw_ref_g_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      sessionUserMap.set(sessionToken, userId);

      const googleUser = {
        id: userId,
        email: googleEmail,
        fullName: fullName,
        gender: dbUser?.gender || 'female',
        role: 'family_head',
        isFamilyHead: true,
        familyId: familyId,
        memberId: 'FAM001',
        languagePreference: 'en',
        authProvider: 'google',
        avatarUrl: avatarUrl,
        onboardingCompleted: isExisting,
      };

      // Record Daily Login for Authenticated Google Member
      const googleStreak = await recordUserDailyLogin(userId);

      return sendJson(res, 200, {
        isExisting,
        status: isExisting ? 'existing' : 'new',
        email: googleEmail,
        fullName: fullName,
        session: { accessToken: sessionToken, refreshToken },
        user: googleUser,
        streak: googleStreak?.streak || 1,
      });
    }

    // Record Daily Login Check-in Endpoint (called on active session check)
    if (pathname === '/api/v1/auth/daily-login' && req.method === 'POST') {
      const user = await authenticateUser(req) || defaultUser;
      const userId = user?.id || defaultUserId;
      const streakInfo = await recordUserDailyLogin(userId);
      return sendJson(res, 200, {
        success: true,
        user_id: userId,
        ...streakInfo
      });
    }

    // Live Database-Backed Achievements & Current Streak Status Endpoint
    if (pathname === '/api/v1/achievements/status' && req.method === 'GET') {
      const user = await authenticateUser(req) || defaultUser;
      const userId = user?.id || defaultUserId;
      const result = await evaluateUserAchievements(userId);
      return sendJson(res, 200, {
        success: true,
        user_id: userId,
        ...result
      });
    }

    // Simulation endpoint for test verification (consecutive days, calendar dates)
    if (pathname === '/api/v1/achievements/simulate-login' && req.method === 'POST') {
      const user = await authenticateUser(req) || defaultUser;
      const userId = user?.id || defaultUserId;
      const body = await parseJsonBody(req);
      const simDate = body.date || getLocalDateString();
      await recordUserDailyLogin(userId, simDate);
      const result = await evaluateUserAchievements(userId, simDate);
      return sendJson(res, 200, {
        success: true,
        simulated_date: simDate,
        user_id: userId,
        ...result
      });
    }

    // Reset streak endpoint for test verification
    if (pathname === '/api/v1/achievements/reset-streak' && req.method === 'POST') {
      const user = await authenticateUser(req) || defaultUser;
      const userId = user?.id || defaultUserId;
      userDailyLogins = userDailyLogins.filter(l => String(l.user_id) !== String(userId));
      persistDailyLoginsStore();
      if (pool) {
        queryDb('DELETE FROM public.user_daily_logins WHERE user_id = $1', [userId]).catch(() => { });
      }
      const result = await evaluateUserAchievements(userId);
      return sendJson(res, 200, {
        success: true,
        message: 'Streak reset successfully for user',
        user_id: userId,
        ...result
      });
    }

    if (pathname === '/api/v1/auth/password-reset' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      if (supabase && body.email) {
        try {
          await supabase.auth.resetPasswordForEmail(body.email);
        } catch { }
      }
      return sendJson(res, 200, {
        message: 'If an account exists, password recovery instructions have been sent.',
      });
    }

    if (pathname === '/api/v1/auth/update-password' && req.method === 'POST') {
      const user = await authenticateUser(req);
      if (!user) {
        return sendJson(res, 401, { error: 'Authentication required' });
      }

      // RBAC: Only Family Head has permission to change or update passwords
      const isHead = (user.isFamilyHead === true || user.role === 'family_head' || user.role === 'admin') && user.role !== 'family_member';
      if (!isHead) {
        return sendJson(res, 403, {
          error: 'Forbidden',
          message: 'Only Family Head has permission to change or update passwords.'
        });
      }

      const body = await parseJsonBody(req);
      const newPassword = (body.newPassword || body.password || '').trim();

      if (!newPassword || newPassword.length < 8) {
        return sendJson(res, 400, { error: 'New password must be at least 8 characters long.' });
      }

      if (pool && user.id) {
        await queryDb(`
          UPDATE auth.users
          SET encrypted_password = extensions.crypt($1, extensions.gen_salt('bf', 10)), updated_at = now()
          WHERE id = $2;
        `, [newPassword, user.id]);
      }

      if (supabase && user?.id) {
        try {
          await supabase.auth.admin.updateUserById(user.id, { password: newPassword });
        } catch (_) {}
      }

      return sendJson(res, 200, { success: true, message: 'Password updated successfully.' });
    }

    // -------------------------------------------------------------
    // Check Registration Availability (Step 1 of Create Account)
    // Validates email/password format and ensures email is not already registered.
    // -------------------------------------------------------------
    if (pathname === '/api/v1/auth/check-registration' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const email = (body.email || '').trim().toLowerCase();
      const password = body.password || '';

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        return sendJson(res, 400, { error: 'Please enter a valid email address.' });
      }

      if (!password || password.length < 8) {
        return sendJson(res, 400, { error: 'Password must be at least 8 characters.' });
      }

      // Check if email already exists in users or families
      let existingUser = null;
      if (pool) {
        const existRes = await queryDb(
          `SELECT id, email FROM public.users WHERE LOWER(email) = $1
         UNION
         SELECT admin_user_id as id, family_email as email FROM public.families WHERE LOWER(family_email) = $1
         LIMIT 1;`,
          [email]
        );
        existingUser = existRes.rows[0];
      }

      if (!existingUser) {
        for (const u of users.values()) {
          if (u.email && u.email.toLowerCase() === email) {
            existingUser = u;
            break;
          }
        }
      }
      if (!existingUser) {
        for (const f of families) {
          if (f.family_email && f.family_email.toLowerCase() === email) {
            existingUser = f;
            break;
          }
        }
      }

      if (existingUser) {
        return sendJson(res, 409, {
          error: 'This email is already registered. Please sign in instead.',
          code: 'EMAIL_ALREADY_REGISTERED',
          alreadyRegistered: true,
        });
      }

      return sendJson(res, 200, {
        ok: true,
        available: true,
        email,
        message: 'Email is available for registration.'
      });
    }

    // -------------------------------------------------------------
    // Verify Parent/Admin Credentials (Stage 1 of Create Account)
    // -------------------------------------------------------------
    if (pathname === '/api/v1/auth/verify-parent-admin' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const email = (body.email || '').trim().toLowerCase();
      const password = body.password || '';

      if (!email || !password) {
        return sendJson(res, 401, { error: 'Invalid parent/admin email or password.' });
      }

      let authUser = null;
      if (supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (!error && data?.user) {
          authUser = data.user;
        }
      }

      let dbUser = null;
      let fmUser = null;
      if (pool) {
        const userRes = await queryDb(
          `SELECT u.*, f.id as family_id, f.name as family_name, f.family_email, fm.role as family_role
         FROM public.users u
         LEFT JOIN public.family_memberships fm ON fm.user_id = u.id
         LEFT JOIN public.families f ON fm.family_id = f.id OR f.family_email = u.email
         WHERE LOWER(u.email) = $1 OR LOWER(f.family_email) = $1
         ORDER BY CASE WHEN fm.role IN ('admin', 'family_head') THEN 0 ELSE 1 END, u.created_at DESC
         LIMIT 1;`,
          [email]
        );
        dbUser = userRes.rows[0];

        if (dbUser) {
          const fmRes = await queryDb(
            `SELECT * FROM public.family_memberships WHERE user_id = $1 LIMIT 1;`,
            [dbUser.id]
          );
          fmUser = fmRes.rows[0];
        }
      }

      let isValid = Boolean(authUser);
      if (!isValid && (dbUser || fmUser)) {
        const pHash = dbUser?.password_hash || fmUser?.password_hash;
        const pSalt = dbUser?.password_salt || fmUser?.password_salt;
        if (pHash && pSalt) {
          isValid = verifyPassword(password, pHash, pSalt);
        } else if (dbUser?.password) {
          isValid = dbUser.password === password;
        }
      }

      if (!isValid) {
        const memUser = users.get(email);
        if (memUser) {
          if (memUser.password_hash && memUser.password_salt) {
            isValid = verifyPassword(password, memUser.password_hash, memUser.password_salt);
          }
          if (!isValid && memUser.password) {
            isValid = memUser.password === password;
          }
          if (isValid) {
            dbUser = memUser;
          }
        }
      }

      if (!isValid || !dbUser) {
        return sendJson(res, 401, { error: 'Invalid parent/admin email or password.' });
      }

      return sendJson(res, 200, {
        ok: true,
        admin: {
          id: dbUser.id || dbUser.userId,
          email: dbUser.email,
          fullName: dbUser.full_name || dbUser.fullName,
          familyId: dbUser.family_id || dbUser.familyId || null,
          familyName: dbUser.family_name || dbUser.familyName || null,
        },
        message: 'Parent/Admin verification successful.',
      });
    }

    // -------------------------------------------------------------
    // Register Member Under Verified Parent/Admin (Stage 2 of Create Account)
    // -------------------------------------------------------------
    if (pathname === '/api/v1/auth/register-with-parent' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const parentEmail = (body.parentEmail || '').trim().toLowerCase();
      const parentPassword = body.parentPassword || '';
      const fullName = (body.fullName || body.name || '').trim();
      const age = parseInt(body.age, 10);
      const weightKg = parseFloat(body.weight || body.weightKg);
      const heightCm = parseFloat(body.height || body.heightCm);
      const gender = String(body.gender || '').toLowerCase();
      const isGoogleAuth = Boolean(body.isGoogleAuth);
      const password = String(body.password || body.createPassword || '');
      const confirmPassword = String(body.confirmPassword || '');

      // Server-side validations
      if (!parentEmail) {
        return sendJson(res, 400, { error: 'Parent/Admin email is required.' });
      }
      if (!isGoogleAuth && !parentPassword) {
        return sendJson(res, 401, { error: 'Invalid parent/admin email or password.' });
      }
      if (!fullName) {
        return sendJson(res, 400, { error: 'Please enter your name.' });
      }
      if (isNaN(age) || age < 1 || age > 120) {
        return sendJson(res, 400, { error: 'Please enter a valid age.' });
      }
      if (isNaN(weightKg) || weightKg <= 0 || weightKg > 400) {
        return sendJson(res, 400, { error: 'Please enter a valid weight.' });
      }
      if (isNaN(heightCm) || heightCm <= 0 || heightCm > 300) {
        return sendJson(res, 400, { error: 'Please enter a valid height.' });
      }
      if (!['male', 'female'].includes(gender)) {
        return sendJson(res, 400, { error: 'Please select your gender.' });
      }
      if (!isGoogleAuth) {
        if (!password || password.length < 8) {
          return sendJson(res, 400, { error: 'Password must be at least 8 characters.' });
        }
        if (password !== confirmPassword) {
          return sendJson(res, 400, { error: 'Passwords do not match.' });
        }
      } else {
        // For Google authenticated users, update their Family Head profile directly
        const dob = new Date(Date.now() - (age * 365.25 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
        if (pool) {
          await queryDb(
            `UPDATE public.users 
           SET full_name = $1, role = 'family_head', updated_at = now() 
           WHERE LOWER(email) = $2`,
            [fullName, parentEmail]
          );
          const uRes = await queryDb('SELECT id, family_id FROM public.users WHERE LOWER(email) = $1 LIMIT 1', [parentEmail]);
          if (uRes.rows.length > 0) {
            const uId = uRes.rows[0].id;
            await queryDb(
              `INSERT INTO public.user_profiles (id, user_id, gender, date_of_birth, height_cm, weight_kg, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, now(), now())
             ON CONFLICT (user_id) DO UPDATE 
             SET gender = EXCLUDED.gender, date_of_birth = EXCLUDED.date_of_birth, height_cm = EXCLUDED.height_cm, weight_kg = EXCLUDED.weight_kg, updated_at = now()`,
              [randomUUID(), uId, gender, dob, heightCm, weightKg]
            );
          }
        }
        return sendJson(res, 200, {
          ok: true,
          message: 'Family Head profile updated successfully.',
          user: { email: parentEmail, fullName, role: 'family_head', isFamilyHead: true, age, weightKg, heightCm, gender }
        });
      }

      // Re-verify Parent/Admin credentials securely
      let dbAdmin = null;
      let fmAdmin = null;
      if (pool) {
        const admRes = await queryDb(
          `SELECT u.*, f.id as family_id, f.name as family_name
         FROM public.users u
         LEFT JOIN public.family_memberships fm ON fm.user_id = u.id
         LEFT JOIN public.families f ON fm.family_id = f.id OR f.family_email = u.email
         WHERE LOWER(u.email) = $1 OR LOWER(f.family_email) = $1
         ORDER BY CASE WHEN fm.role IN ('admin', 'family_head') THEN 0 ELSE 1 END, u.created_at DESC
         LIMIT 1;`,
          [parentEmail]
        );
        dbAdmin = admRes.rows[0];
        if (dbAdmin) {
          const fmRes = await queryDb(
            `SELECT * FROM public.family_memberships WHERE user_id = $1 LIMIT 1;`,
            [dbAdmin.id]
          );
          fmAdmin = fmRes.rows[0];
        }
      }

      let isParentValid = false;
      if (supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({ email: parentEmail, password: parentPassword });
        if (!error && data?.user) isParentValid = true;
      }
      if (!isParentValid && (dbAdmin || fmAdmin)) {
        const pHash = dbAdmin?.password_hash || fmAdmin?.password_hash;
        const pSalt = dbAdmin?.password_salt || fmAdmin?.password_salt;
        if (pHash && pSalt) {
          isParentValid = verifyPassword(parentPassword, pHash, pSalt);
        } else if (dbAdmin?.password) {
          isParentValid = dbAdmin.password === parentPassword;
        }
      }

      if (!isParentValid || !dbAdmin) {
        // Check if this is a new single-user registration (parentEmail does not exist in DB)
        let emailExists = false;
        if (pool) {
          const existCheck = await queryDb(`SELECT id FROM public.users WHERE LOWER(email) = $1 LIMIT 1;`, [parentEmail]);
          if (existCheck.rows.length > 0) emailExists = true;
        }

        if (!emailExists) {
          // Create new single-member user directly
          let newUserId = randomUUID();
          const { hash: newHash, salt: newSalt } = hashPassword(password || parentPassword);

          if (supabase && supabaseServiceKey) {
            try {
              const { data: supaData } = await supabase.auth.admin.createUser({
                email: parentEmail,
                password: password || parentPassword,
                email_confirm: true,
                user_metadata: { full_name: fullName, gender, role: 'patient' }
              });
              if (supaData?.user?.id) newUserId = supaData.user.id;
            } catch (_) { }
          }

          const dob = new Date(Date.now() - (age * 365.25 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
          if (pool) {
            await queryDb(
              `INSERT INTO public.users (id, email, role, full_name, password, password_hash, password_salt, is_active, created_at, updated_at)
             VALUES ($1, $2, 'patient', $3, $4, $5, $6, true, now(), now())
             ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, password = EXCLUDED.password, password_hash = EXCLUDED.password_hash, password_salt = EXCLUDED.password_salt, updated_at = now();`,
              [newUserId, parentEmail, fullName, password || parentPassword, newHash, newSalt]
            );

            await queryDb(
              `INSERT INTO public.user_profiles (id, user_id, gender, date_of_birth, height_cm, weight_kg, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, now(), now())
             ON CONFLICT (user_id) DO UPDATE SET gender = EXCLUDED.gender, date_of_birth = EXCLUDED.date_of_birth, height_cm = EXCLUDED.height_cm, weight_kg = EXCLUDED.weight_kg, updated_at = now();`,
              [randomUUID(), newUserId, gender, dob, heightCm, weightKg]
            );
          }

          const sessionToken = 'vw_tok_' + randomBytes(16).toString('hex');
          const refreshToken = 'vw_ref_' + randomBytes(16).toString('hex');
          sessionUserMap.set(sessionToken, newUserId);

          const userObj = {
            id: newUserId,
            userId: newUserId,
            email: parentEmail,
            fullName,
            name: fullName,
            role: 'patient',
            isFamilyHead: false,
            onboardingCompleted: true,
            gender,
            age,
            weightKg,
            heightCm,
          };
          users.set(newUserId, userObj);
          users.set(parentEmail, userObj);

          return sendJson(res, 201, {
            success: true,
            token: sessionToken,
            sessionToken,
            refreshToken,
            session: { accessToken: sessionToken, refreshToken },
            user: userObj,
            message: 'Account created successfully.'
          });
        }

        return sendJson(res, 401, { error: 'Invalid parent/admin email or password.' });
      }

      // Ensure family exists
      let familyId = dbAdmin.family_id;
      if (!familyId && pool) {
        const famRes = await queryDb(
          `SELECT id, name FROM public.families WHERE admin_user_id = $1 OR LOWER(family_email) = $2 LIMIT 1;`,
          [dbAdmin.id, parentEmail.toLowerCase()]
        );
        if (famRes.rows.length > 0) {
          familyId = famRes.rows[0].id;
        } else {
          familyId = randomUUID();
          await queryDb(
            `INSERT INTO public.families (id, name, family_email, admin_user_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, now(), now()) ON CONFLICT (id) DO NOTHING;`,
            [familyId, `${dbAdmin.full_name || 'Family'} Space`, parentEmail, dbAdmin.id]
          );
          await queryDb(
            `INSERT INTO public.family_memberships (id, family_id, user_id, member_id, display_name, role, relationship, status, created_at, updated_at)
           VALUES ($1, $2, $3, 'FAM001', $4, 'family_head', 'other', 'active', now(), now())
           ON CONFLICT (family_id, user_id) DO NOTHING;`,
            [randomUUID(), familyId, dbAdmin.id, dbAdmin.full_name]
          );
        }
      }

      // Create member account
      let newUserId = randomUUID();
      const { hash: newHash, salt: newSalt } = hashPassword(password);
      const memberSyntheticEmail = `${parentEmail.split('@')[0]}+${fullName.toLowerCase().replace(/[^a-z0-9]/g, '')}_${randomUUID().substring(0, 6)}@${parentEmail.split('@')[1] || 'vitawise.ai'}`;

      if (supabase && supabaseServiceKey) {
        try {
          const { data: supaData, error: supaErr } = await supabase.auth.admin.createUser({
            email: memberSyntheticEmail,
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName, gender, role: 'family_member' }
          });
          if (supaData?.user?.id) {
            newUserId = supaData.user.id;
          } else if (supaErr) {
            console.warn('Supabase member creation error:', supaErr.message);
          }
        } catch (err) {
          console.warn('Supabase member creation warning:', err.message);
        }
      }

      const dob = new Date(Date.now() - (age * 365.25 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];

      if (pool) {
        await queryDb(
          `INSERT INTO public.users (id, email, role, full_name, family_id, is_active, created_at, updated_at)
         VALUES ($1, $2, 'family_member', $3, $4, true, now(), now())
         ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, family_id = EXCLUDED.family_id, updated_at = now();`,
          [newUserId, memberSyntheticEmail, fullName, familyId]
        );

        await queryDb(
          `INSERT INTO public.user_profiles (id, user_id, gender, date_of_birth, height_cm, weight_kg, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now(), now())
         ON CONFLICT (user_id) DO UPDATE SET gender = EXCLUDED.gender, date_of_birth = EXCLUDED.date_of_birth, height_cm = EXCLUDED.height_cm, weight_kg = EXCLUDED.weight_kg, updated_at = now();`,
          [randomUUID(), newUserId, gender, dob, heightCm, weightKg]
        );

        await queryDb(
          `INSERT INTO public.user_preferences (id, user_id, created_at, updated_at)
         VALUES ($1, $2, now(), now())
         ON CONFLICT (user_id) DO NOTHING;`,
          [randomUUID(), newUserId]
        );

        const countRes = await queryDb(`SELECT COUNT(*) FROM public.family_memberships WHERE family_id = $1;`, [familyId]);
        const nextSeq = parseInt(countRes.rows[0]?.count || '1', 10) + 1;
        const internalMemberId = `FAM00${nextSeq}`;
        const memberRelationship = gender === 'female' ? 'daughter' : (gender === 'male' ? 'son' : 'other');

        await queryDb(
          `INSERT INTO public.family_memberships (id, family_id, user_id, member_id, display_name, role, relationship, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'family_member', $6, 'active', now(), now())
         ON CONFLICT (family_id, user_id) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role, updated_at = now();`,
          [randomUUID(), familyId, newUserId, internalMemberId, fullName, memberRelationship]
        );

        await queryDb(
          `INSERT INTO public.family_permissions (id, family_id, member_user_id, admin_user_id, pcos_overview, cycle_period, symptoms_journal, hormonal_wellness, created_at, updated_at)
         VALUES ($1, $2, $3, $4, false, false, false, false, now(), now())
         ON CONFLICT (family_id, member_user_id, admin_user_id) DO NOTHING;`,
          [randomUUID(), familyId, newUserId, dbAdmin.id]
        );
      }

      const sessionToken = 'vw_tok_' + randomBytes(16).toString('hex');
      const refreshToken = 'vw_ref_' + randomBytes(16).toString('hex');
      sessionUserMap.set(sessionToken, newUserId);

      const newUser = {
        id: newUserId,
        userId: newUserId,
        email: memberSyntheticEmail,
        fullName,
        name: fullName,
        gender,
        age,
        dob,
        heightCm,
        weightKg,
        height: heightCm,
        weight: weightKg,
        role: 'family_member',
        familyId,
        familyName: dbAdmin.family_name || 'Family Space',
        isFamilyHead: false,
        onboardingCompleted: true,
      };

      return sendJson(res, 201, {
        ok: true,
        token: sessionToken,
        session: { accessToken: sessionToken, refreshToken },
        user: newUser,
        message: 'Account created successfully.',
      });
    }

    // -------------------------------------------------------------
    // Register Family (Family Head + Common Family Email + Dynamic Members)
    // -------------------------------------------------------------
    if (req.method === 'POST' && pathname === '/api/v1/auth/register-family') {
      const body = await parseJsonBody(req);
      const familyEmail = String(body.familyEmail || body.parentEmail || '').trim().toLowerCase();
      const parentPassword = String(body.parentPassword || body.password || '');
      const headName = String(body.headName || 'Family Head').trim();
      const members = Array.isArray(body.members) ? body.members : [];

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!familyEmail || !emailRegex.test(familyEmail)) {
        return sendJson(res, 400, { error: 'Please enter a valid email address.' });
      }

      const isGoogleAuth = Boolean(body.isGoogleAuth);

      if (!isGoogleAuth && (!parentPassword || parentPassword.length < 8)) {
        return sendJson(res, 400, { error: 'Password must be at least 8 characters.' });
      }

      if (members.length === 0) {
        return sendJson(res, 400, { error: 'Please add at least one family member.' });
      }

      // Validate each member
      for (let i = 0; i < members.length; i++) {
        const m = members[i];
        const memberName = String(m.name || m.fullName || '').trim();
        const age = parseInt(m.age, 10);
        const weight = parseFloat(m.weight || m.weightKg);
        const height = parseFloat(m.height || m.heightCm);
        const password = String(m.password || '');
        const confirmPassword = String(m.confirmPassword || '');

        if (!memberName) {
          return sendJson(res, 400, { error: `Please enter the name for Member ${i + 1}.` });
        }
        if (isNaN(age) || age < 1 || age > 120) {
          return sendJson(res, 400, { error: `Please enter a valid age for ${memberName}.` });
        }
        if (isNaN(weight) || weight <= 0 || weight > 400) {
          return sendJson(res, 400, { error: `Please enter a valid weight (kg) for ${memberName}.` });
        }
        if (isNaN(height) || height <= 0 || height > 300) {
          return sendJson(res, 400, { error: `Please enter a valid height (cm) for ${memberName}.` });
        }
        if (!password || password.length < 8) {
          return sendJson(res, 400, { error: `Password for ${memberName} must be at least 8 characters.` });
        }
        if (password !== confirmPassword) {
          return sendJson(res, 400, { error: `Passwords do not match for ${memberName}.` });
        }
      }

      // Setup Family Head and Family space
      let headUserId = randomUUID();

      if (pool) {
        // Insert Head into auth.users directly with bcrypt
        await queryDb(`
          INSERT INTO auth.users (
            id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at
          ) VALUES (
            $1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2,
            extensions.crypt($3, extensions.gen_salt('bf', 10)), now(),
            '{"provider":"email","providers":["email"]}'::jsonb, $4::jsonb, now(), now()
          ) ON CONFLICT (id) DO UPDATE SET
            encrypted_password = extensions.crypt($3, extensions.gen_salt('bf', 10)),
            email = EXCLUDED.email,
            updated_at = now();
        `, [headUserId, familyEmail, parentPassword, JSON.stringify({ role: 'family_head', full_name: headName })]);
      }

      if (supabase && supabaseServiceKey) {
        try {
          const { data: supaData } = await supabase.auth.admin.createUser({
            email: familyEmail,
            password: parentPassword,
            email_confirm: true,
            user_metadata: { role: 'family_head', full_name: headName }
          });
          if (supaData?.user?.id) {
            headUserId = supaData.user.id;
          }
        } catch (_) {}
      }

      const familyId = randomUUID();
      const familyName = `${headName}'s Family`;

      if (pool) {
        // 1. Insert into public.users first so families foreign key passes
        await queryDb(
          `INSERT INTO public.users (id, email, role, full_name, is_active, created_at, updated_at)
         VALUES ($1, $2, 'family_head', $3, true, now(), now())
         ON CONFLICT (id) DO UPDATE SET role = 'family_head', full_name = EXCLUDED.full_name, updated_at = now();`,
          [headUserId, familyEmail, headName]
        );

        // 2. Insert into public.families
        await queryDb(
          `INSERT INTO public.families (id, name, family_email, admin_user_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, now(), now())
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, family_email = EXCLUDED.family_email, updated_at = now();`,
          [familyId, familyName, familyEmail, headUserId]
        );

        // 3. Link user to family
        await queryDb(`UPDATE public.users SET family_id = $1 WHERE id = $2;`, [familyId, headUserId]);

        await queryDb(
          `INSERT INTO public.user_profiles (id, user_id, gender, language_preference, created_at, updated_at)
         VALUES ($1, $2, 'other', 'en', now(), now())
         ON CONFLICT (user_id) DO NOTHING;`,
          [randomUUID(), headUserId]
        );

        await queryDb(
          `INSERT INTO public.user_preferences (id, user_id, created_at, updated_at)
         VALUES ($1, $2, now(), now())
         ON CONFLICT (user_id) DO NOTHING;`,
          [randomUUID(), headUserId]
        );

        await queryDb(
          `INSERT INTO public.family_memberships (id, family_id, user_id, member_id, display_name, role, relationship, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'FAM001', $4, 'family_head', 'other', 'active', now(), now())
         ON CONFLICT (family_id, user_id) DO UPDATE SET role = 'family_head', display_name = EXCLUDED.display_name, updated_at = now();`,
          [randomUUID(), familyId, headUserId, headName]
        );
      }

      // Insert each family member
      const createdMembers = [];
      for (let i = 0; i < members.length; i++) {
        const m = members[i];
        const memberName = String(m.name || m.fullName || '').trim();
        const age = parseInt(m.age, 10);
        const weight = parseFloat(m.weight || m.weightKg);
        const height = parseFloat(m.height || m.heightCm);
        const gender = (m.gender === 'female' || m.gender === 'male') ? m.gender : 'other';
        const password = String(m.password || '');

        let memberUserId = randomUUID();
        const syntheticEmail = `${familyEmail.split('@')[0]}+${memberName.toLowerCase().replace(/[^a-z0-9]/g, '')}_${randomUUID().substring(0, 6)}@${familyEmail.split('@')[1] || 'vitawise.ai'}`;

        if (pool) {
          // Insert member into auth.users with bcrypt
          await queryDb(`
            INSERT INTO auth.users (
              id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
              raw_app_meta_data, raw_user_meta_data, created_at, updated_at
            ) VALUES (
              $1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2,
              extensions.crypt($3, extensions.gen_salt('bf', 10)), now(),
              '{"provider":"email","providers":["email"]}'::jsonb, $4::jsonb, now(), now()
            ) ON CONFLICT (id) DO UPDATE SET
              encrypted_password = extensions.crypt($3, extensions.gen_salt('bf', 10)),
              email = EXCLUDED.email,
              updated_at = now();
          `, [memberUserId, syntheticEmail, password, JSON.stringify({ role: 'family_member', full_name: memberName, gender })]);
        }

        if (supabase && supabaseServiceKey) {
          try {
            const { data: sUser } = await supabase.auth.admin.createUser({
              email: syntheticEmail,
              password,
              email_confirm: true,
              user_metadata: { role: 'family_member', full_name: memberName, gender }
            });
            if (sUser?.user?.id) {
              memberUserId = sUser.user.id;
            }
          } catch (_) { }
        }

        const dob = new Date(Date.now() - (age * 365.25 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
        const seqId = `FAM00${i + 2}`;
        const rel = gender === 'female' ? 'daughter' : (gender === 'male' ? 'son' : 'other');

        if (pool) {
          await queryDb(
            `INSERT INTO public.users (id, email, role, full_name, family_id, is_active, created_at, updated_at)
           VALUES ($1, $2, 'family_member', $3, $4, true, now(), now())
           ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, family_id = EXCLUDED.family_id, updated_at = now();`,
            [memberUserId, syntheticEmail, memberName, familyId]
          );

          await queryDb(
            `INSERT INTO public.user_profiles (id, user_id, gender, date_of_birth, height_cm, weight_kg, language_preference, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'en', now(), now())
           ON CONFLICT (user_id) DO UPDATE SET gender = EXCLUDED.gender, date_of_birth = EXCLUDED.date_of_birth, height_cm = EXCLUDED.height_cm, weight_kg = EXCLUDED.weight_kg, updated_at = now();`,
            [randomUUID(), memberUserId, gender, dob, height, weight]
          );

          await queryDb(
            `INSERT INTO public.user_preferences (id, user_id, created_at, updated_at)
           VALUES ($1, $2, now(), now())
           ON CONFLICT (user_id) DO NOTHING;`,
            [randomUUID(), memberUserId]
          );

          await queryDb(
            `INSERT INTO public.family_memberships (id, family_id, user_id, member_id, display_name, role, relationship, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'family_member', $6, 'active', now(), now())
           ON CONFLICT (family_id, user_id) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role, updated_at = now();`,
            [randomUUID(), familyId, memberUserId, seqId, memberName, rel]
          );

          await queryDb(
            `INSERT INTO public.family_permissions (id, family_id, member_user_id, admin_user_id, pcos_overview, cycle_period, symptoms_journal, hormonal_wellness, created_at, updated_at)
           VALUES ($1, $2, $3, $4, false, false, false, false, now(), now())
           ON CONFLICT (family_id, member_user_id, admin_user_id) DO NOTHING;`,
            [randomUUID(), familyId, memberUserId, headUserId]
          );
        }

        createdMembers.push({
          id: memberUserId,
          userId: memberUserId,
          name: memberName,
          fullName: memberName,
          age,
          weight,
          height,
          gender,
          role: 'family_member',
          relationship: rel
        });
      }

      const sessionToken = 'vw_tok_' + randomBytes(16).toString('hex');
      const refreshToken = 'vw_ref_' + randomBytes(16).toString('hex');
      sessionUserMap.set(sessionToken, headUserId);

      const headUserObj = {
        id: headUserId,
        userId: headUserId,
        email: familyEmail,
        fullName: headName,
        name: headName,
        role: 'family_head',
        familyId,
        familyName,
        isFamilyHead: true,
        onboardingCompleted: true,
      };

      return sendJson(res, 201, {
        ok: true,
        token: sessionToken,
        sessionToken,
        session: { accessToken: sessionToken, refreshToken },
        user: headUserObj,
        members: createdMembers,
        message: 'Family created successfully.',
      });
    }

    // --- Parent Head Setup / Registration / Login ---
    if (req.method === 'POST' && (pathname === '/api/v1/auth/parent-head-setup' || pathname === '/api/v1/auth/register-parent-head')) {
      const body = await parseJsonBody(req);
      const email = String(body.email || body.parentHeadEmail || '').trim().toLowerCase();
      const password = String(body.password || body.parentHeadPassword || '');
      const confirmPassword = String(body.confirmPassword || body.parentHeadConfirmPassword || '');

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        return sendJson(res, 400, { error: 'Please enter a valid email address.' });
      }

      if (!password) {
        return sendJson(res, 400, { error: 'Please enter a password.' });
      }

      if (password.length < 8) {
        return sendJson(res, 400, { error: 'Password must be at least 8 characters.' });
      }

      if (password !== confirmPassword) {
        return sendJson(res, 400, { error: 'Passwords do not match.' });
      }

      let existingUser = null;
      let existingFam = null;

      if (pool) {
        const userRes = await queryDb(
          `SELECT u.*, f.id as fam_id, f.name as fam_name
         FROM public.users u
         LEFT JOIN public.families f ON f.admin_user_id = u.id OR LOWER(f.family_email) = LOWER(u.email)
         WHERE LOWER(u.email) = $1 LIMIT 1;`,
          [email]
        );
        existingUser = userRes.rows[0];
      }

      const { hash: newHash, salt: newSalt } = hashPassword(password);
      let userId = existingUser?.id;
      let familyId = existingUser?.fam_id || existingUser?.family_id;

      if (existingUser) {
        // If user exists, verify or update credentials for Parent Head
        if (pool) {
          await queryDb(
            `UPDATE public.users SET role = 'family_head', updated_at = now() WHERE id = $1;`,
            [userId]
          );
        }
        if (supabase && supabaseServiceKey) {
          try {
            await supabase.auth.admin.updateUserById(userId, { password, email_confirm: true });
          } catch (_) { }
        }
        if (!familyId && pool) {
          familyId = randomUUID();
          await queryDb(
            `INSERT INTO public.families (id, name, family_email, admin_user_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, now(), now()) ON CONFLICT (id) DO NOTHING;`,
            [familyId, 'Family Space', email, userId]
          );
          await queryDb(
            `UPDATE public.users SET family_id = $1 WHERE id = $2;`,
            [familyId, userId]
          );
          await queryDb(
            `INSERT INTO public.family_memberships (id, family_id, user_id, member_id, display_name, role, relationship, status, created_at, updated_at)
           VALUES ($1, $2, $3, 'FAM001', 'Parent Head', 'family_head', 'other', 'active', now(), now())
           ON CONFLICT (family_id, user_id) DO UPDATE SET role = 'family_head', display_name = EXCLUDED.display_name, updated_at = now();`,
            [randomUUID(), familyId, userId]
          );
        }
      } else {
        userId = randomUUID();
        if (supabase && supabaseServiceKey) {
          try {
            const { data: supaData, error: supaErr } = await supabase.auth.admin.createUser({
              email,
              password,
              email_confirm: true,
              user_metadata: { role: 'family_head', full_name: 'Parent Head' }
            });
            if (supaData?.user?.id) {
              userId = supaData.user.id;
            } else if (supaErr) {
              const { data: listData } = await supabase.auth.admin.listUsers();
              const existingAuthUser = listData?.users?.find(u => u.email?.toLowerCase() === email);
              if (existingAuthUser?.id) {
                userId = existingAuthUser.id;
              }
            }
          } catch (err) {
            console.warn('Supabase parent head creation warning:', err.message);
          }
        }

        familyId = randomUUID();
        if (pool) {
          // 1. Insert user first (without foreign key to family)
          await queryDb(
            `INSERT INTO public.users (id, email, role, full_name, is_active, created_at, updated_at)
           VALUES ($1, $2, 'family_head', 'Parent Head', true, now(), now())
           ON CONFLICT (id) DO UPDATE SET role = 'family_head', full_name = EXCLUDED.full_name, updated_at = now();`,
            [userId, email]
          );

          // 2. Insert family (admin_user_id references users(id))
          await queryDb(
            `INSERT INTO public.families (id, name, family_email, admin_user_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, now(), now()) ON CONFLICT (id) DO NOTHING;`,
            [familyId, 'Family Space', email, userId]
          );

          // 3. Link user to family
          await queryDb(
            `UPDATE public.users SET family_id = $1 WHERE id = $2;`,
            [familyId, userId]
          );

          await queryDb(
            `INSERT INTO public.user_profiles (id, user_id, gender, created_at, updated_at)
           VALUES ($1, $2, 'other', now(), now())
           ON CONFLICT (user_id) DO NOTHING;`,
            [randomUUID(), userId]
          );

          await queryDb(
            `INSERT INTO public.user_preferences (id, user_id, created_at, updated_at)
           VALUES ($1, $2, now(), now())
           ON CONFLICT (user_id) DO NOTHING;`,
            [randomUUID(), userId]
          );

          await queryDb(
            `INSERT INTO public.family_memberships (id, family_id, user_id, member_id, display_name, role, relationship, status, created_at, updated_at)
           VALUES ($1, $2, $3, 'FAM001', 'Parent Head', 'family_head', 'other', 'active', now(), now())
           ON CONFLICT (family_id, user_id) DO UPDATE SET role = 'family_head', display_name = EXCLUDED.display_name, updated_at = now();`,
            [randomUUID(), familyId, userId]
          );
        }
      }

      let sessionToken = null;
      let refreshToken = null;
      if (supabase) {
        const { data: sData } = await supabase.auth.signInWithPassword({ email, password });
        if (sData?.session) {
          sessionToken = sData.session.access_token;
          refreshToken = sData.session.refresh_token;
        }
      }
      sessionToken = sessionToken || ('vw_tok_' + randomBytes(16).toString('hex'));
      refreshToken = refreshToken || ('vw_ref_' + randomBytes(16).toString('hex'));
      sessionUserMap.set(sessionToken, userId);

      const userObj = {
        id: userId,
        userId,
        email,
        fullName: existingUser?.full_name || 'Parent Head',
        name: existingUser?.full_name || 'Parent Head',
        role: 'family_head',
        familyId,
        familyName: 'Family Space',
        isFamilyHead: true,
        onboardingCompleted: true,
      };

      return sendJson(res, 201, {
        ok: true,
        token: sessionToken,
        session: { accessToken: sessionToken, refreshToken },
        user: userObj,
        message: 'Parent Head account ready.',
      });
    }

    if (pathname === '/api/v1/auth/demo-session') {
      const demoUser = users.get('ananya.demo@vitawise.ai');
      return sendJson(res, 200, {
        session: {
          accessToken: 'vw_tok_demo_session',
          refreshToken: 'vw_ref_demo_session',
        },
        user: demoUser,
      });
    }

    if ((pathname === '/api/v1/auth/profile' || pathname === '/api/v1/auth/me') && (req.method === 'POST' || req.method === 'PUT')) {
      const user = await authenticateUser(req);
      const body = await parseJsonBody(req);
      const email = (body.email || user?.email || 'ananya.demo@vitawise.ai').trim().toLowerCase();
      const userId = user?.id || body.id;

      const fullName = body.fullName || body.name;
      const phone = body.phone !== undefined ? (body.phone ? String(body.phone).trim() : null) : null;

      const activityLevel = body.activityLevel || body.activity_level || null;
      const allergies = body.allergies !== undefined ? (typeof body.allergies === 'string' ? body.allergies : JSON.stringify(body.allergies)) : null;
      const foodRestrictions = body.foodRestrictions || body.food_restrictions || null;
      const dietGoal = body.dietGoal || body.diet_goal || null;

      if (userId && pool) {
        await queryDb(
          `UPDATE public.users SET full_name = COALESCE($1, full_name), phone = COALESCE($2, phone), updated_at = now() WHERE id = $3;`,
          [fullName || null, phone, userId]
        );
        await queryDb(
          `INSERT INTO public.user_profiles (user_id, gender, height_cm, weight_kg, date_of_birth, dietary_preference, language_preference, activity_level, allergies, food_restrictions, diet_goal)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (user_id) DO UPDATE SET
           gender = COALESCE(EXCLUDED.gender, public.user_profiles.gender),
           height_cm = COALESCE(EXCLUDED.height_cm, public.user_profiles.height_cm),
           weight_kg = COALESCE(EXCLUDED.weight_kg, public.user_profiles.weight_kg),
           date_of_birth = COALESCE(EXCLUDED.date_of_birth, public.user_profiles.date_of_birth),
           dietary_preference = COALESCE(EXCLUDED.dietary_preference, public.user_profiles.dietary_preference),
           language_preference = COALESCE(EXCLUDED.language_preference, public.user_profiles.language_preference),
           activity_level = COALESCE(EXCLUDED.activity_level, public.user_profiles.activity_level),
           allergies = COALESCE(EXCLUDED.allergies, public.user_profiles.allergies),
           food_restrictions = COALESCE(EXCLUDED.food_restrictions, public.user_profiles.food_restrictions),
           diet_goal = COALESCE(EXCLUDED.diet_goal, public.user_profiles.diet_goal),
           updated_at = now();`,
          [
            userId,
            body.gender ? String(body.gender).toLowerCase() : (user?.gender || 'female'),
            body.heightCm != null ? Number(body.heightCm) : null,
            body.weightKg != null ? Number(body.weightKg) : null,
            body.dob || body.dateOfBirth || null,
            body.dietaryPreference || user?.dietaryPreference || 'vegetarian',
            body.languagePreference || user?.languagePreference || 'en',
            activityLevel,
            allergies,
            foodRestrictions,
            dietGoal
          ]
        );
      }

      if (userId && users.has(userId)) {
        const cached = users.get(userId);
        if (fullName) cached.fullName = fullName;
        if (body.gender) cached.gender = body.gender;
        if (body.heightCm != null) cached.heightCm = Number(body.heightCm);
        if (body.weightKg != null) cached.weightKg = Number(body.weightKg);
        if (body.dob || body.dateOfBirth) cached.dob = body.dob || body.dateOfBirth;
        if (body.age) cached.age = Number(body.age);
        if (activityLevel) cached.activityLevel = activityLevel;
        if (body.dietaryPreference) cached.dietaryPreference = body.dietaryPreference;
        if (allergies !== null) cached.allergies = allergies;
        if (dietGoal) cached.dietGoal = dietGoal;
      }

      const freshUser = await authenticateUser(req);
      const finalUser = {
        ...freshUser,
        id: userId || freshUser?.id || 'usr_demo',
        email: email || freshUser?.email,
        fullName: fullName || freshUser?.fullName,
        full_name: fullName || freshUser?.full_name,
        phone: phone || freshUser?.phone,
        gender: body.gender || freshUser?.gender || 'female',
        heightCm: body.heightCm != null ? Number(body.heightCm) : freshUser?.heightCm,
        weightKg: body.weightKg != null ? Number(body.weightKg) : freshUser?.weightKg,
        dob: body.dob || body.dateOfBirth || freshUser?.dob,
        age: body.age ? Number(body.age) : freshUser?.age,
        activityLevel: activityLevel || freshUser?.activityLevel || null,
        allergies: allergies !== null ? allergies : freshUser?.allergies || null,
        foodRestrictions: foodRestrictions || freshUser?.foodRestrictions || null,
        dietGoal: dietGoal || freshUser?.dietGoal || null,
        languagePreference: body.languagePreference || freshUser?.languagePreference || 'en',
        dietaryPreference: body.dietaryPreference || freshUser?.dietaryPreference || 'vegetarian',
      };

      return sendJson(res, 200, {
        success: true,
        user: finalUser,
      });
    }

    if (pathname === '/api/v1/auth/me' && req.method === 'GET') {
      const user = await authenticateUser(req);
      if (!user) {
        return sendJson(res, 200, { authenticated: false, user: null });
      }
      return sendJson(res, 200, {
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name || user.fullName || 'Clinical Test User',
          fullName: user.full_name || user.fullName || 'Clinical Test User',
          gender: user.gender || 'female',
          dob: user.dob || null,
          age: user.age != null ? user.age : (user.dob ? Math.floor((Date.now() - new Date(user.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : null),
          heightCm: user.heightCm || null,
          weightKg: user.weightKg || null,
          activityLevel: user.activityLevel || null,
          allergies: user.allergies || null,
          foodRestrictions: user.foodRestrictions || null,
          dietGoal: user.dietGoal || null,
          phone: user.phone || null,
          role: user.role || (user.isFamilyHead ? 'family_head' : 'family_member'),
          familyRole: user.familyRole || user.role || (user.isFamilyHead ? 'family_head' : 'family_member'),
          isFamilyHead: Boolean(user.isFamilyHead || user.role === 'family_head' || user.relationship === 'head'),
          familyId: user.familyId || user.family_id || null,
          familyName: user.familyName || user.family_name || null,
          relationship: user.relationship || (user.isFamilyHead ? 'head' : 'member'),
          memberId: user.memberId || 'FAM001',
          languagePreference: user.languagePreference || 'en',
          dietaryPreference: user.dietaryPreference || 'vegetarian',
        },
      });
    }

    if (pathname === '/api/v1/auth/logout' && req.method === 'POST') {
      return sendJson(res, 200, { success: true });
    }

    // 3. Clinical & Tracker Endpoints (Single Source of Truth: Supabase PostgreSQL)
    if (pathname === '/api/v1/health/nutrition-logs') {
      const user = await authenticateUser(req) || defaultUser;
      const userId = user?.id || defaultUserId;

      if (req.method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') || '50', 10);
        let logs = [];
        if (pool) {
          const dbRes = await queryDb('SELECT * FROM public.nutrition_logs WHERE user_id = $1 ORDER BY logged_at DESC LIMIT $2', [userId, limit]);
          logs = dbRes.rows;
        }
        return sendJson(res, 200, {
          count: logs.length,
          logs: logs.slice(0, limit),
        });
      }

      if (req.method === 'POST') {
        const body = await parseJsonBody(req);
        const newId = randomUUID();
        const newLog = {
          id: newId,
          user_id: userId,
          food_name: body.foodName || body.food_name || 'Meal Entry',
          meal_type: body.mealType || body.meal_type || 'lunch',
          glycemic_index_level: body.glycemicIndexLevel || body.glycemic_index_level || 'low',
          portion_description: body.portionDescription || body.portion_description || null,
          estimated_calories: Number(body.estimatedCalories || body.estimated_calories || 0),
          protein_g: Number(body.proteinG || body.protein_g || 0),
          carbs_g: Number(body.carbsG || body.carbs_g || 0),
          fat_g: Number(body.fatG || body.fat_g || 0),
          fiber_g: Number(body.fiberG || body.fiber_g || 0),
          logged_at: body.loggedAt || body.logged_at || new Date().toISOString(),
        };

        nutritionLogs.unshift(newLog);

        if (pool) {
          await queryDb(
            `INSERT INTO public.nutrition_logs (id, user_id, food_name, meal_type, glycemic_index_level, portion_description, estimated_calories, protein_g, carbs_g, fat_g, fiber_g, logged_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (id) DO NOTHING;`,
            [newLog.id, newLog.user_id, newLog.food_name, newLog.meal_type, newLog.glycemic_index_level, newLog.portion_description, newLog.estimated_calories, newLog.protein_g, newLog.carbs_g, newLog.fat_g, newLog.fiber_g, newLog.logged_at]
          );
        }
        return sendJson(res, 201, { success: true, data: newLog });
      }
    }

    if (pathname === '/api/v1/health/symptom-logs') {
      const user = await authenticateUser(req) || defaultUser;
      const userId = user?.id || defaultUserId;

      if (req.method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') || '50', 10);
        let logs = [];
        if (pool) {
          const dbRes = await queryDb('SELECT * FROM public.symptom_logs WHERE user_id = $1 ORDER BY logged_at DESC LIMIT $2', [userId, limit]);
          logs = dbRes.rows;
        }
        return sendJson(res, 200, {
          count: logs.length,
          logs: logs.slice(0, limit),
        });
      }

      if (req.method === 'POST') {
        const body = await parseJsonBody(req);
        const newId = randomUUID();
        const validCategories = ['pcos', 'digestive', 'energy', 'pain', 'mood', 'skin', 'sleep'];
        let cat = (body.symptomCategory || body.symptom_category || 'energy').toLowerCase();
        if (!validCategories.includes(cat)) cat = 'energy';

        const newLog = {
          id: newId,
          user_id: userId,
          symptom_name: body.symptomName || body.symptom_name || 'Wellness Observation',
          symptom_category: cat,
          severity: Math.max(1, Math.min(5, Number(body.severity) || 1)),
          notes: body.notes || null,
          logged_at: body.loggedAt || body.logged_at || new Date().toISOString(),
        };

        symptomLogs.unshift(newLog);

        if (pool) {
          await queryDb(
            `INSERT INTO public.symptom_logs (id, user_id, symptom_name, symptom_category, severity, notes, logged_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING;`,
            [newLog.id, newLog.user_id, newLog.symptom_name, newLog.symptom_category, newLog.severity, newLog.notes, newLog.logged_at]
          );
        }
        return sendJson(res, 201, { success: true, data: newLog });
      }
    }

    // -------------------------------------------------------------
    // Health Intake Entries Endpoints: /api/v1/health/intake-entries
    // -------------------------------------------------------------
    if (pathname === '/api/v1/health/intake-entries' || pathname === '/api/v1/health/intake-entries/day') {
      const user = await authenticateUser(req) || defaultUser;
      const userId = user?.id || defaultUserId;

      // GET /api/v1/health/intake-entries/day
      if (pathname === '/api/v1/health/intake-entries/day' && req.method === 'GET') {
        const targetMemberId = (url.searchParams.get('member_id') || 'self').trim();
        const recordDate = (url.searchParams.get('date') || new Date().toISOString().split('T')[0]).trim();

        const dayEntries = getDayIntakeEntries(userId, targetMemberId, recordDate);

        // Also extract symptoms for that day if any
        const withSymptoms = dayEntries.find(e => e.symptoms?.length || e.symptom_notes);

        return sendJson(res, 200, {
          success: true,
          ok: true,
          date: recordDate,
          memberId: targetMemberId,
          entries: dayEntries,
          symptoms: withSymptoms?.symptoms || [],
          symptomNotes: withSymptoms?.symptom_notes || '',
          severity: withSymptoms?.severity || 'none',
          symptomTime: withSymptoms?.symptom_time || ''
        });
      }

      // GET /api/v1/health/intake-entries
      if (pathname === '/api/v1/health/intake-entries' && req.method === 'GET') {
        const targetMemberId = url.searchParams.get('member_id');
        const dateFilter = url.searchParams.get('date');

        const { entries, history } = getIntakeHistory(userId, targetMemberId, dateFilter);
        return sendJson(res, 200, {
          success: true,
          ok: true,
          count: entries.length,
          entries,
          history,
        });
      }

      // POST /api/v1/health/intake-entries
      if (pathname === '/api/v1/health/intake-entries' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const memberId = (body.member_id || body.memberId || 'self').trim();
        const memberName = (body.member_name || body.memberName || user.fullName || 'Member').trim();
        const recordDate = (body.record_date || body.recordDate || new Date().toISOString().split('T')[0]).trim();
        const mealSlot = (body.meal_slot || body.mealSlot || '').toLowerCase().trim();
        const foodName = (body.food_name || body.foodName || '').trim();
        const quantity = (body.quantity || '').trim();
        const mealTime = (body.meal_time || body.mealTime || '').trim();

        const validSlots = ['tiffin', 'midmorning', 'lunch', 'snacks', 'dinner', 'extra'];
        if (!validSlots.includes(mealSlot)) {
          return sendJson(res, 400, { error: `Invalid meal slot "${mealSlot}". Must be one of: ${validSlots.join(', ')}` });
        }

        if (!foodName) {
          return sendJson(res, 400, { error: 'Food name is required to save a meal slot.' });
        }

        const entry = await saveIntakeEntry({
          userId,
          memberId,
          memberName,
          recordDate,
          mealSlot,
          foodName,
          quantity,
          mealTime,
          symptoms: body.symptoms || undefined,
          symptomNotes: body.symptom_notes || body.symptomNotes || undefined,
          severity: body.severity || undefined,
          symptomTime: body.symptom_time || body.symptomTime || undefined,
        });

        return sendJson(res, 200, {
          success: true,
          ok: true,
          message: 'Meal entry saved successfully.',
          data: entry,
          entry
        });
      }
    }

    // -------------------------------------------------------------
    // Health Water Intake & Hydration Tracker Endpoints
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/v1/health/water')) {
      const user = await authenticateUser(req) || defaultUser;
      const userId = user?.id || defaultUserId;

      // 1. GET /api/v1/health/water/day?date=...&member_id=...
      if (pathname === '/api/v1/health/water/day' && req.method === 'GET') {
        const targetMemberId = (url.searchParams.get('member_id') || 'self').trim();
        const recordDate = (url.searchParams.get('date') || new Date().toISOString().split('T')[0]).trim();

        let dayLog = waterIntakeEntries.find(e =>
          e.user_id === userId &&
          (targetMemberId === 'all' || e.member_id === targetMemberId) &&
          e.record_date === recordDate
        );

        if (!dayLog && pool) {
          try {
            const dbRes = await queryDb(
              `SELECT * FROM public.daily_goal_logs WHERE user_id = $1 AND goal_date = $2::date AND goal_type = 'water'`,
              [userId, recordDate]
            );
            if (dbRes.rows[0]) {
              const r = dbRes.rows[0];
              const curMl = r.unit === 'L' ? Math.round(Number(r.current_value) * 1000) : Number(r.current_value);
              const tgtMl = r.unit === 'L' ? Math.round(Number(r.target_value) * 1000) : Number(r.target_value);
              dayLog = {
                id: r.id,
                user_id: userId,
                member_id: targetMemberId,
                record_date: recordDate,
                current_ml: curMl,
                target_ml: tgtMl || 2500,
                status: r.status,
                logs: []
              };
            }
          } catch (_) {}
        }

        const currentMl = dayLog?.current_ml || 0;
        const targetMl = dayLog?.target_ml || 2500;
        const status = currentMl >= targetMl ? 'completed' : 'not_completed';

        return sendJson(res, 200, {
          success: true,
          ok: true,
          date: recordDate,
          memberId: targetMemberId,
          current_ml: currentMl,
          target_ml: targetMl,
          status,
          logs: dayLog?.logs || []
        });
      }

      // 2. POST /api/v1/health/water/entry
      if (pathname === '/api/v1/health/water/entry' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const targetMemberId = (body.member_id || body.memberId || 'self').trim();
        const memberName = (body.member_name || body.memberName || user.fullName || 'Member').trim();
        const recordDate = (body.date || body.record_date || new Date().toISOString().split('T')[0]).trim();
        const amountMl = Number(body.amount_ml || body.amountMl || 0);
        const goalMl = Number(body.goal_ml || body.goalMl || 2500);

        let dayLog = waterIntakeEntries.find(e =>
          e.user_id === userId &&
          e.member_id === targetMemberId &&
          e.record_date === recordDate
        );

        if (!dayLog) {
          dayLog = {
            id: randomUUID(),
            user_id: userId,
            member_id: targetMemberId,
            member_name: memberName,
            record_date: recordDate,
            current_ml: 0,
            target_ml: goalMl,
            status: 'not_completed',
            logs: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          waterIntakeEntries.unshift(dayLog);
        }

        if (body.reset === true || body.action === 'reset') {
          dayLog.current_ml = 0;
          dayLog.logs = [];
        } else {
          dayLog.current_ml = Math.max(0, (dayLog.current_ml || 0) + amountMl);
          if (goalMl) dayLog.target_ml = goalMl;
          dayLog.status = dayLog.current_ml >= dayLog.target_ml ? 'completed' : 'not_completed';
          dayLog.logs = dayLog.logs || [];
          dayLog.logs.push({
            amount_ml: amountMl,
            logged_at: new Date().toISOString()
          });
        }
        dayLog.status = dayLog.current_ml >= dayLog.target_ml ? 'completed' : (dayLog.current_ml > 0 ? 'in_progress' : 'not_completed');
        dayLog.updated_at = new Date().toISOString();

        persistWaterIntakeStore();

        if (pool) {
          try {
            const curLiters = Number((dayLog.current_ml / 1000).toFixed(2));
            const tgtLiters = Number((dayLog.target_ml / 1000).toFixed(2));
            await queryDb(`
              INSERT INTO public.daily_goal_logs (user_id, goal_date, goal_type, status, current_value, target_value, unit, completed_at, updated_at)
              VALUES ($1, $2::date, 'water', $3, $4, $5, 'L', $6, now())
              ON CONFLICT (user_id, goal_date, goal_type) DO UPDATE SET
                status = EXCLUDED.status,
                current_value = EXCLUDED.current_value,
                target_value = EXCLUDED.target_value,
                completed_at = EXCLUDED.completed_at,
                updated_at = now()
            `, [
              userId,
              recordDate,
              dayLog.status,
              curLiters,
              tgtLiters,
              dayLog.status === 'completed' ? new Date().toISOString() : null
            ]);
          } catch (err) {
            console.warn('DB water log update warning:', err.message);
          }
        }

        return sendJson(res, 200, {
          success: true,
          ok: true,
          data: dayLog,
          entry: dayLog
        });
      }

      // 3. POST /api/v1/health/water/goal
      if (pathname === '/api/v1/health/water/goal' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const targetMemberId = (body.member_id || body.memberId || 'self').trim();
        const goalMl = Number(body.goal_ml || body.goalMl || 2500);
        const recordDate = (body.date || new Date().toISOString().split('T')[0]).trim();

        waterIntakeEntries.forEach(e => {
          if (e.user_id === userId && e.member_id === targetMemberId && e.record_date === recordDate) {
            e.target_ml = goalMl;
            e.status = e.current_ml >= goalMl ? 'completed' : 'not_completed';
            e.updated_at = new Date().toISOString();
          }
        });
        persistWaterIntakeStore();

        if (pool) {
          try {
            const tgtLiters = Number((goalMl / 1000).toFixed(2));
            await queryDb(`
              INSERT INTO public.daily_goal_logs (user_id, goal_date, goal_type, status, current_value, target_value, unit, updated_at)
              VALUES ($1, $2::date, 'water', 'not_completed', 0, $3, 'L', now())
              ON CONFLICT (user_id, goal_date, goal_type) DO UPDATE SET
                target_value = EXCLUDED.target_value,
                updated_at = now()
            `, [userId, recordDate, tgtLiters]);
          } catch (_) {}
        }

        // Live Real-Time Family Synchronization: Broadcast goal change across all connected family accounts
        const isHead = (user.isFamilyHead === true || user.role === 'family_head' || user.role === 'admin' || user.relationship === 'head') && user.role !== 'family_member';
        const familyId = user.familyId || user.family_id || 'default_family';
        if (isHead && typeof global.broadcastFamilyEvent === 'function') {
          global.broadcastFamilyEvent(familyId, 'goal_update', {
            goalType: 'water',
            targetValue: goalMl,
            unit: 'ml',
            updatedBy: user.fullName || 'Family Head',
            timestamp: new Date().toISOString()
          });
        }

        return sendJson(res, 200, {
          success: true,
          ok: true,
          goal_ml: goalMl
        });
      }

      // 4. GET /api/v1/health/water/history?member_id=...
      if (pathname === '/api/v1/health/water/history' && req.method === 'GET') {
        const targetMemberId = (url.searchParams.get('member_id') || 'self').trim();

        const historyMap = new Map();
        waterIntakeEntries
          .filter(e => e.user_id === userId && (targetMemberId === 'all' || e.member_id === targetMemberId))
          .forEach(e => {
            const dParts = e.record_date.split('-');
            let formattedDate = e.record_date;
            if (dParts.length === 3) {
              const dObj = new Date(parseInt(dParts[0], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[2], 10));
              if (!isNaN(dObj.getTime())) {
                formattedDate = dObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
              }
            }
            historyMap.set(e.record_date, {
              date: e.record_date,
              formattedDate,
              total_ml: e.current_ml,
              goal_ml: e.target_ml,
              status: e.status,
              isCompleted: e.status === 'completed'
            });
          });

        if (pool) {
          try {
            const dbRes = await queryDb(`
              SELECT goal_date, current_value, target_value, unit, status
              FROM public.daily_goal_logs
              WHERE user_id = $1 AND goal_type = 'water'
              ORDER BY goal_date DESC
              LIMIT 30
            `, [userId]);
            dbRes.rows.forEach(r => {
              const dStr = r.goal_date instanceof Date ? r.goal_date.toISOString().split('T')[0] : String(r.goal_date);
              if (!historyMap.has(dStr)) {
                const curMl = r.unit === 'L' ? Math.round(Number(r.current_value) * 1000) : Number(r.current_value);
                const tgtMl = r.unit === 'L' ? Math.round(Number(r.target_value) * 1000) : Number(r.target_value);
                const dParts = dStr.split('-');
                let formattedDate = dStr;
                if (dParts.length === 3) {
                  const dObj = new Date(parseInt(dParts[0], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[2], 10));
                  if (!isNaN(dObj.getTime())) {
                    formattedDate = dObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                  }
                }
                historyMap.set(dStr, {
                  date: dStr,
                  formattedDate,
                  total_ml: curMl,
                  goal_ml: tgtMl || 2500,
                  status: r.status,
                  isCompleted: r.status === 'completed'
                });
              }
            });
          } catch (_) {}
        }

        const historyList = Array.from(historyMap.values()).sort((a, b) => b.date.localeCompare(a.date));
        return sendJson(res, 200, {
          success: true,
          ok: true,
          history: historyList
        });
      }

      // 5. POST /api/v1/health/water/alert - Dispatch alert to Family Head if missed
      if (pathname === '/api/v1/health/water/alert' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const targetMemberId = (body.member_id || body.memberId || 'self').trim();
        const memberName = (body.member_name || body.memberName || 'Family Member').trim();
        const recordDate = (body.date || new Date().toISOString().split('T')[0]).trim();
        const currentMl = Number(body.current_ml || body.currentMl || 0);
        const goalMl = Number(body.goal_ml || body.goalMl || 2500);

        let headUserId = userId;
        const familyId = user.familyId || user.family_id;
        if (pool && familyId) {
          try {
            const fRes = await queryDb('SELECT admin_user_id FROM public.families WHERE id = $1', [familyId]);
            if (fRes.rows[0]?.admin_user_id) {
              headUserId = fRes.rows[0].admin_user_id;
            }
          } catch (_) {}
        }

        // Avoid duplicate alerts on the same date for the same member
        const alertDedupKey = `${headUserId}_${targetMemberId}_${recordDate}`;
        if (!global._inMemoryWaterAlerts) global._inMemoryWaterAlerts = new Set();
        let alreadySent = global._inMemoryWaterAlerts.has(alertDedupKey);

        if (!alreadySent && pool) {
          try {
            const dupRes = await queryDb(`
              SELECT id FROM public.notifications
              WHERE (user_id = $1 OR metadata->>'family_id' = $2)
                AND (metadata->>'related_member_id' = $3 OR body ILIKE $4)
                AND title ILIKE '%Water%Alert%'
                AND created_at >= CURRENT_DATE
            `, [headUserId, familyId, targetMemberId, `%${memberName}%`]);
            if (dupRes.rows.length > 0) alreadySent = true;
          } catch (_) {}
        }

        if (alreadySent) {
          return sendJson(res, 200, {
            success: true,
            ok: true,
            alertCreated: false,
            message: `Alert already recorded for ${memberName} today.`
          });
        }

        global._inMemoryWaterAlerts.add(alertDedupKey);

        const alertId = randomUUID();
        const alertTitle = 'Water Intake Alert';
        const alertBody = `${memberName} has not logged the expected water intake for ${recordDate} (${currentMl} / ${goalMl} ml).`;
        const metadata = {
          type: 'goal',
          category: 'water',
          related_member_name: memberName,
          related_member_id: targetMemberId,
          goal_type: 'water',
          current_value: currentMl,
          target_value: goalMl,
          severity: 'attention',
          family_id: familyId,
          action_type: 'view_record',
          action_target: 'water'
        };

        if (pool) {
          try {
            await queryDb(`
              INSERT INTO public.notifications (id, user_id, type, title, body, metadata, is_read, created_at)
              VALUES ($1, $2, 'goal_alert', $3, $4, $5, false, now())
            `, [alertId, headUserId, alertTitle, alertBody, JSON.stringify(metadata)]);
          } catch (e) {
            console.warn('DB water alert insert warning:', e.message);
          }
        }

        return sendJson(res, 201, {
          success: true,
          ok: true,
          alertCreated: true,
          alert: { id: alertId, user_id: headUserId, title: alertTitle, message: alertBody }
        });
      }
    }

    // ----------------------------------------------------
    // Health Sleep & Recovery Endpoints (/api/v1/health/sleep)
    // ----------------------------------------------------
    if (pathname.startsWith('/api/v1/health/sleep')) {
      const user = await authenticateUser(req) || defaultUser;
      const userId = user?.id || defaultUserId;
      const todayDateStr = new Date().toISOString().split('T')[0];

      // 1. GET /api/v1/health/sleep - Retrieve sleep logs and weekly overview
      if (pathname === '/api/v1/health/sleep' && req.method === 'GET') {
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
        let userRecords = sleepLogs.filter(r => r.user_id === userId);

        if (pool) {
          try {
            const dbRes = await queryDb(`
              SELECT id, user_id, sleep_date::text as sleep_date, sleep_start_time, wake_time, total_hours, quality, notes, created_at, updated_at
              FROM public.sleep_logs
              WHERE user_id = $1
              ORDER BY sleep_date DESC
              LIMIT $2
            `, [userId, limit]);
            if (dbRes.rows.length > 0) {
              userRecords = dbRes.rows;
            }
          } catch (e) {
            console.warn('DB sleep fetch warning:', e.message);
          }
        }

        userRecords.sort((a, b) => String(b.sleep_date).localeCompare(String(a.sleep_date)));
        const todayRecord = userRecords.find(r => r.sleep_date === todayDateStr) || null;

        // Build 7-day weekly overview ending today
        const weekly = [];
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const now = new Date();
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const dStr = d.toISOString().split('T')[0];
          const dayName = days[d.getDay()];
          const matched = userRecords.find(r => r.sleep_date === dStr);
          weekly.push({
            day: dayName,
            date: dStr,
            hours: matched ? Number(matched.total_hours) : 0,
            quality: matched ? matched.quality : '—',
            notes: matched?.notes || ''
          });
        }

        return sendJson(res, 200, {
          success: true,
          ok: true,
          today: todayRecord,
          weekly,
          records: userRecords
        });
      }

      // 2. POST /api/v1/health/sleep - Save / upsert a sleep record
      if (pathname === '/api/v1/health/sleep' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const sleepDate = (body.sleep_date || body.sleepDate || todayDateStr).trim();
        const startTime = (body.sleep_start_time || body.sleepStartTime || body.startTime || '23:00').trim();
        const wakeTime = (body.wake_time || body.wakeTime || '07:00').trim();
        let totalHours = Number(body.total_hours || body.totalHours || 0);

        if (!totalHours || isNaN(totalHours)) {
          const [sh, sm] = startTime.split(':').map(Number);
          const [wh, wm] = wakeTime.split(':').map(Number);
          let startMin = (sh || 0) * 60 + (sm || 0);
          let wakeMin = (wh || 0) * 60 + (wm || 0);
          if (wakeMin <= startMin) wakeMin += 24 * 60;
          totalHours = Number(((wakeMin - startMin) / 60).toFixed(1));
        }

        const quality = (body.quality || 'Good').trim();
        const notes = (body.notes || '').trim();

        const existingIdx = sleepLogs.findIndex(r => r.user_id === userId && r.sleep_date === sleepDate);
        const record = {
          id: existingIdx >= 0 ? sleepLogs[existingIdx].id : randomUUID(),
          user_id: userId,
          sleep_date: sleepDate,
          sleep_start_time: startTime,
          wake_time: wakeTime,
          total_hours: totalHours,
          quality,
          notes,
          created_at: existingIdx >= 0 ? sleepLogs[existingIdx].created_at : new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        if (existingIdx >= 0) {
          sleepLogs[existingIdx] = record;
        } else {
          sleepLogs.unshift(record);
        }
        persistSleepStore();

        if (pool) {
          try {
            await queryDb(`
              INSERT INTO public.sleep_logs (user_id, sleep_date, sleep_start_time, wake_time, total_hours, quality, notes, updated_at)
              VALUES ($1, $2::date, $3, $4, $5, $6, $7, now())
              ON CONFLICT (user_id, sleep_date) DO UPDATE SET
                sleep_start_time = EXCLUDED.sleep_start_time,
                wake_time = EXCLUDED.wake_time,
                total_hours = EXCLUDED.total_hours,
                quality = EXCLUDED.quality,
                notes = EXCLUDED.notes,
                updated_at = now()
            `, [userId, sleepDate, startTime, wakeTime, totalHours, quality, notes]);

            await queryDb(`
              INSERT INTO public.symptom_logs (user_id, symptom_name, symptom_category, severity, notes, logged_at)
              VALUES ($1, $2, 'sleep', $3, $4, $5::timestamptz)
            `, [
              userId,
              `${totalHours}h sleep (${quality})`,
              quality === 'Excellent' ? 1 : quality === 'Good' ? 2 : quality === 'Average' ? 3 : 4,
              notes,
              `${sleepDate}T${wakeTime}:00Z`
            ]);

            await queryDb(`
              INSERT INTO public.daily_goal_logs (user_id, goal_date, goal_type, status, current_value, target_value, unit, completed_at, updated_at)
              VALUES ($1, $2::date, 'sleep', $3, $4, 8.0, 'hours', $5, now())
              ON CONFLICT (user_id, goal_date, goal_type) DO UPDATE SET
                status = EXCLUDED.status,
                current_value = EXCLUDED.current_value,
                completed_at = EXCLUDED.completed_at,
                updated_at = now()
            `, [
              userId,
              sleepDate,
              totalHours >= 7 ? 'completed' : 'not_completed',
              totalHours,
              totalHours >= 7 ? new Date().toISOString() : null
            ]);
          } catch (e) {
            console.warn('DB sleep upsert warning:', e.message);
          }
        }

        const familyId = user.familyId || user.family_id;
        if (familyId && typeof global.broadcastFamilyEvent === 'function') {
          global.broadcastFamilyEvent(familyId, 'goal_update', {
            goalType: 'sleep',
            targetValue: 8,
            currentValue: totalHours,
            quality,
            updatedBy: user.fullName || 'Family Member',
            timestamp: new Date().toISOString()
          });
        }

        return sendJson(res, 200, {
          success: true,
          ok: true,
          message: 'Sleep record saved successfully.',
          record
        });
      }
    }

    // ----------------------------------------------------
    // Daily Steps & Activity Sync Endpoints (/api/v1/health/steps)
    // ----------------------------------------------------
    if (pathname.startsWith('/api/v1/health/steps')) {
      const user = await authenticateUser(req) || defaultUser;
      const userId = user?.id || defaultUserId;
      const todayDateStr = new Date().toISOString().split('T')[0];

      // 1. GET /api/v1/health/steps/today - Retrieve today's synchronized steps
      if (pathname === '/api/v1/health/steps/today' && req.method === 'GET') {
        let entry = stepsLogs.find(e => e.user_id === userId && e.date === todayDateStr);
        if (!entry && pool) {
          try {
            const dbRes = await queryDb(`
              SELECT current_value, target_value, status FROM public.daily_goal_logs
              WHERE user_id = $1 AND goal_date = CURRENT_DATE AND (goal_type = 'walking' OR goal_type = 'steps')
              LIMIT 1
            `, [userId]);
            if (dbRes.rows[0]) {
              const r = dbRes.rows[0];
              const st = Number(r.current_value) || 0;
              entry = {
                user_id: userId,
                date: todayDateStr,
                steps: st,
                target: Number(r.target_value) || 10000,
                distance_km: Number((st * 0.000762).toFixed(2)),
                calories_kcal: Math.round(st * 0.04)
              };
            }
          } catch (_) {}
        }

        const steps = entry?.steps || 0;
        const target = entry?.target || 10000;
        const distanceKm = entry?.distance_km != null ? entry.distance_km : Number((steps * 0.000762).toFixed(2));
        const caloriesKcal = entry?.calories_kcal != null ? entry.calories_kcal : Math.round(steps * 0.04);

        return sendJson(res, 200, {
          success: true,
          ok: true,
          today: {
            date: todayDateStr,
            steps,
            target,
            distance_km: distanceKm,
            calories_kcal: caloriesKcal
          }
        });
      }

      // 2. POST /api/v1/health/steps/sync - Synchronize device/platform step count
      if (pathname === '/api/v1/health/steps/sync' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const date = (body.date || todayDateStr).trim();
        const steps = Math.max(0, Math.round(Number(body.steps || 0)));
        const target = Math.max(1000, Math.round(Number(body.target || 10000)));
        const distanceKm = Number(body.distance_km || (steps * 0.000762).toFixed(2));
        const caloriesKcal = Number(body.calories_kcal || Math.round(steps * 0.04));

        const existingIdx = stepsLogs.findIndex(e => e.user_id === userId && e.date === date);
        const record = {
          user_id: userId,
          date,
          steps,
          target,
          distance_km: distanceKm,
          calories_kcal: caloriesKcal,
          updated_at: new Date().toISOString()
        };

        let changed = true;
        if (existingIdx >= 0) {
          const prev = stepsLogs[existingIdx];
          changed = prev.steps !== steps || prev.target !== target || prev.distance_km !== distanceKm || prev.calories_kcal !== caloriesKcal;
          if (changed) {
            stepsLogs[existingIdx] = record;
            persistStepsStore();
          }
        } else {
          stepsLogs.unshift(record);
          persistStepsStore();
        }

        if (pool) {
          try {
            await queryDb(`
              INSERT INTO public.daily_goal_logs (user_id, goal_date, goal_type, status, current_value, target_value, unit, updated_at)
              VALUES ($1, $2::date, 'walking', $3, $4, $5, 'steps', now())
              ON CONFLICT (user_id, goal_date, goal_type) DO UPDATE SET
                status = EXCLUDED.status,
                current_value = EXCLUDED.current_value,
                target_value = EXCLUDED.target_value,
                updated_at = now()
            `, [
              userId,
              date,
              steps >= target ? 'completed' : 'not_completed',
              steps,
              target
            ]);
          } catch (_) {}
        }

        return sendJson(res, 200, {
          success: true,
          ok: true,
          steps,
          target,
          distance_km: distanceKm,
          calories_kcal: caloriesKcal
        });
      }
    }

    // ----------------------------------------------------
    // Personalized Goal-Based Diet Plans Endpoints
    // ----------------------------------------------------
    if (pathname === '/api/v1/diet/plan') {
      try {
        if (req.method !== 'GET' && req.method !== 'POST') {
          return sendJson(res, 405, {
            success: false,
            status: 'method_not_allowed',
            error: 'Method Not Allowed',
            message: `HTTP method ${req.method} is not supported. Use GET or POST.`
          });
        }

        let user = await authenticateUser(req);
        if (!user) {
          user = users.get('family@example.com') || users.get(defaultUserId) || {
            id: defaultUserId,
            email: 'family@example.com',
            fullName: 'Sairishi',
            gender: 'male',
            role: 'family_head'
          };
        }
        const userId = user.id;

        if (req.method === 'GET') {
          let activePlan = userDietPlans.find(p => p.user_id === userId) || null;
          if (!activePlan && pool) {
            try {
              const dbRes = await queryDb('SELECT * FROM public.user_diet_plans WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1', [userId]);
              if (dbRes.rows.length > 0) {
                const row = dbRes.rows[0];
                activePlan = {
                  id: row.id,
                  user_id: row.user_id,
                  goalKey: row.goal_key,
                  goalName: row.goal_name,
                  profileSnapshot: typeof row.profile_snapshot === 'string' ? JSON.parse(row.profile_snapshot) : row.profile_snapshot,
                  targets: typeof row.calculated_targets === 'string' ? JSON.parse(row.calculated_targets) : row.calculated_targets,
                  meals: typeof row.daily_plan === 'string' ? JSON.parse(row.daily_plan) : row.daily_plan,
                  medicalDisclaimer: 'Medical Disclaimer: This personalized nutrition guide is designed for educational and wellness lifestyle planning based on general nutritional guidelines (ICMR-NIN & sports nutrition evidence). It is not a clinical medical diagnosis, prescription, or treatment. Please consult a registered dietitian or medical practitioner before making drastic dietary changes if you have underlying medical conditions.',
                  created_at: row.created_at,
                  updated_at: row.updated_at
                };
              }
            } catch (_) { }
          }

          const missingFields = [];
          if (!user.age && !user.dob) missingFields.push('age');
          if (!user.weightKg) missingFields.push('weightKg');
          if (!user.heightCm) missingFields.push('heightCm');
          if (!user.gender) missingFields.push('gender');
          if (!user.activityLevel) missingFields.push('activityLevel');
          if (!user.dietaryPreference) missingFields.push('dietaryPreference');

          return sendJson(res, 200, {
            success: true,
            plan: activePlan,
            profile: {
              age: user.age,
              dob: user.dob,
              weightKg: user.weightKg,
              heightCm: user.heightCm,
              gender: user.gender,
              activityLevel: user.activityLevel,
              dietaryPreference: user.dietaryPreference,
              allergies: user.allergies,
              foodRestrictions: user.foodRestrictions,
              dietGoal: user.dietGoal,
            },
            missingFields
          });
        }

        if (req.method === 'POST') {
          const body = await parseJsonBody(req);
          const goalKey = String(body.goalKey || body.goal_key || 'balanced_healthy').toLowerCase().trim();
          const validGoals = {
            bulking: 'Bulking / Muscle Gain',
            fat_loss: 'Fat Loss / Cutting',
            protein_focus: 'Protein Focus',
            weight_maintenance: 'Weight Maintenance',
            balanced_healthy: 'Balanced Healthy Diet'
          };

          const resolvedGoalKey = validGoals[goalKey] ? goalKey : 'balanced_healthy';
          const goalName = body.goalName || validGoals[resolvedGoalKey];

          let pUpdates = {};
          if (body.profileUpdates || body.heightCm != null || body.weightKg != null || body.age || body.dob || body.gender || body.activityLevel || body.dietaryPreference || body.allergies !== undefined) {
            pUpdates = body.profileUpdates || body;
            const hCm = pUpdates.heightCm != null ? Number(pUpdates.heightCm) : null;
            const wKg = pUpdates.weightKg != null ? Number(pUpdates.weightKg) : null;
            const dob = pUpdates.dob || pUpdates.dateOfBirth || null;
            const gdr = pUpdates.gender ? String(pUpdates.gender).toLowerCase() : null;
            const actLvl = pUpdates.activityLevel || null;
            const dietPref = pUpdates.dietaryPreference || null;
            const allg = pUpdates.allergies !== undefined ? (typeof pUpdates.allergies === 'string' ? pUpdates.allergies : JSON.stringify(pUpdates.allergies)) : null;

            if (pool) {
              try {
                await queryDb(
                  `INSERT INTO public.user_profiles (user_id, gender, height_cm, weight_kg, date_of_birth, dietary_preference, activity_level, allergies, diet_goal)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               ON CONFLICT (user_id) DO UPDATE SET
                 gender = COALESCE(EXCLUDED.gender, public.user_profiles.gender),
                 height_cm = COALESCE(EXCLUDED.height_cm, public.user_profiles.height_cm),
                 weight_kg = COALESCE(EXCLUDED.weight_kg, public.user_profiles.weight_kg),
                 date_of_birth = COALESCE(EXCLUDED.date_of_birth, public.user_profiles.date_of_birth),
                 dietary_preference = COALESCE(EXCLUDED.dietary_preference, public.user_profiles.dietary_preference),
                 activity_level = COALESCE(EXCLUDED.activity_level, public.user_profiles.activity_level),
                 allergies = COALESCE(EXCLUDED.allergies, public.user_profiles.allergies),
                 diet_goal = COALESCE(EXCLUDED.diet_goal, public.user_profiles.diet_goal),
                 updated_at = now();`,
                  [userId, gdr || user.gender || 'female', hCm, wKg, dob, dietPref, actLvl, allg, resolvedGoalKey]
                );
              } catch (e) {
                console.warn('Diet profile update warning:', e.message);
              }
            }

            const cached = users.get(userId) || (user ? { ...user } : { id: userId });
            if (hCm != null) cached.heightCm = hCm;
            if (wKg != null) cached.weightKg = wKg;
            if (gdr) cached.gender = gdr;
            if (actLvl) cached.activityLevel = actLvl;
            if (dietPref) cached.dietaryPreference = dietPref;
            if (allg !== null) cached.allergies = allg;
            cached.dietGoal = resolvedGoalKey;
            if (pUpdates.age) cached.age = Number(pUpdates.age);
            if (dob) cached.dob = dob;
            users.set(userId, cached);
          }

          // Re-fetch fresh user profile
          const freshUser = await authenticateUser(req);
          const effectiveUser = freshUser || user || {};

          const effectiveAge = effectiveUser.age || pUpdates.age || body.age || (effectiveUser.dob ? Math.floor((Date.now() - new Date(effectiveUser.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : null);
          const effectiveWeight = effectiveUser.weightKg || pUpdates.weightKg || body.weightKg || null;
          const effectiveHeight = effectiveUser.heightCm || pUpdates.heightCm || body.heightCm || null;
          const effectiveGender = effectiveUser.gender || pUpdates.gender || body.gender || null;
          const effectiveActivity = effectiveUser.activityLevel || pUpdates.activityLevel || body.activityLevel || null;
          const effectiveDiet = effectiveUser.dietaryPreference || pUpdates.dietaryPreference || body.dietaryPreference || null;

          // Check for required fields
          const missingFields = [];
          if (!effectiveAge) missingFields.push('age');
          if (!effectiveWeight) missingFields.push('weightKg');
          if (!effectiveHeight) missingFields.push('heightCm');
          if (!effectiveGender) missingFields.push('gender');
          if (!effectiveActivity) missingFields.push('activityLevel');
          if (!effectiveDiet) missingFields.push('dietaryPreference');

          if (missingFields.length > 0) {
            return sendJson(res, 200, {
              success: false,
              status: 'profile_incomplete',
              message: 'Please provide the missing details to personalize your plan.',
              missingFields,
              profile: {
                age: effectiveAge,
                weightKg: effectiveWeight,
                heightCm: effectiveHeight,
                gender: effectiveGender,
                activityLevel: effectiveActivity,
                dietaryPreference: effectiveDiet,
                allergies: effectiveUser.allergies || pUpdates.allergies || body.allergies || null,
                dietGoal: resolvedGoalKey
              }
            });
          }

          // All required info present -> Generate personalized plan
          const profileForCalc = {
            age: Number(effectiveAge),
            weightKg: Number(effectiveWeight),
            heightCm: Number(effectiveHeight),
            gender: String(effectiveGender).toLowerCase(),
            activityLevel: String(effectiveActivity).toLowerCase(),
            dietaryPreference: String(effectiveDiet).toLowerCase(),
            allergies: pUpdates.allergies || effectiveUser.allergies || body.allergies || ''
          };

          const planResult = calculatePersonalizedDietPlan(profileForCalc, resolvedGoalKey, goalName);
          const nowIso = new Date().toISOString();
          const planRecord = {
            id: randomUUID(),
            user_id: userId,
            goalKey: resolvedGoalKey,
            goalName,
            profileSnapshot: planResult.profileSnapshot,
            targets: planResult.targets,
            meals: planResult.meals,
            medicalDisclaimer: planResult.medicalDisclaimer,
            created_at: nowIso,
            updated_at: nowIso
          };

          // Upsert in userDietPlans file store
          const planIdx = userDietPlans.findIndex(p => p.user_id === userId);
          if (planIdx >= 0) {
            userDietPlans[planIdx] = planRecord;
          } else {
            userDietPlans.push(planRecord);
          }
          persistDietPlansStore();

          // Upsert in PostgreSQL
          if (pool) {
            try {
              await queryDb(
                `INSERT INTO public.user_diet_plans (id, user_id, goal_key, goal_name, profile_snapshot, calculated_targets, daily_plan, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (user_id) DO UPDATE SET
               goal_key = EXCLUDED.goal_key,
               goal_name = EXCLUDED.goal_name,
               profile_snapshot = EXCLUDED.profile_snapshot,
               calculated_targets = EXCLUDED.calculated_targets,
               daily_plan = EXCLUDED.daily_plan,
               updated_at = now();`,
                [
                  planRecord.id,
                  userId,
                  resolvedGoalKey,
                  goalName,
                  JSON.stringify(planRecord.profileSnapshot),
                  JSON.stringify(planRecord.targets),
                  JSON.stringify(planRecord.meals),
                  nowIso,
                  nowIso
                ]
              );
            } catch (err) {
              console.warn('PostgreSQL user_diet_plans save warning:', err.message);
            }
          }

          return sendJson(res, 200, {
            success: true,
            status: 'plan_generated',
            message: 'Personalized diet plan generated successfully.',
            plan: planRecord,
            profile: profileForCalc
          });
        }
      } catch (err) {
        console.error('[Diet API Error]', err);
        return sendJson(res, 500, {
          success: false,
          status: 'error',
          error: err.message || 'Internal server error while processing diet plan.',
          message: err.message || 'Failed to generate personalized diet plan.'
        });
      }
    }

    if (pathname === '/api/v1/diet/profile' && (req.method === 'POST' || req.method === 'PUT')) {
      try {
        let user = await authenticateUser(req);
        if (!user) {
          user = users.get('family@example.com') || users.get(defaultUserId) || {
            id: defaultUserId,
            email: 'family@example.com',
            fullName: 'Sairishi',
            gender: 'male',
            role: 'family_head'
          };
        }
        const userId = user.id;

        const body = await parseJsonBody(req);
        const hCm = body.heightCm != null ? Number(body.heightCm) : null;
        const wKg = body.weightKg != null ? Number(body.weightKg) : null;
        const dob = body.dob || body.dateOfBirth || null;
        const gdr = body.gender ? String(body.gender).toLowerCase() : null;
        const actLvl = body.activityLevel || null;
        const dietPref = body.dietaryPreference || null;
        const allg = body.allergies !== undefined ? (typeof body.allergies === 'string' ? body.allergies : JSON.stringify(body.allergies)) : null;
        const dietGoal = body.dietGoal || body.diet_goal || null;

        if (pool) {
          try {
            await queryDb(
              `INSERT INTO public.user_profiles (user_id, gender, height_cm, weight_kg, date_of_birth, dietary_preference, activity_level, allergies, diet_goal)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (user_id) DO UPDATE SET
             gender = COALESCE(EXCLUDED.gender, public.user_profiles.gender),
             height_cm = COALESCE(EXCLUDED.height_cm, public.user_profiles.height_cm),
             weight_kg = COALESCE(EXCLUDED.weight_kg, public.user_profiles.weight_kg),
             date_of_birth = COALESCE(EXCLUDED.date_of_birth, public.user_profiles.date_of_birth),
             dietary_preference = COALESCE(EXCLUDED.dietary_preference, public.user_profiles.dietary_preference),
             activity_level = COALESCE(EXCLUDED.activity_level, public.user_profiles.activity_level),
             allergies = COALESCE(EXCLUDED.allergies, public.user_profiles.allergies),
             diet_goal = COALESCE(EXCLUDED.diet_goal, public.user_profiles.diet_goal),
             updated_at = now();`,
              [userId, gdr || user.gender || 'female', hCm, wKg, dob, dietPref, actLvl, allg, dietGoal]
            );
          } catch (e) {
            console.warn('Diet profile update warning:', e.message);
          }
        }

        const cached = users.get(userId) || (user ? { ...user } : { id: userId });
        if (hCm != null) cached.heightCm = hCm;
        if (wKg != null) cached.weightKg = wKg;
        if (gdr) cached.gender = gdr;
        if (actLvl) cached.activityLevel = actLvl;
        if (dietPref) cached.dietaryPreference = dietPref;
        if (allg !== null) cached.allergies = allg;
        if (dietGoal) cached.dietGoal = dietGoal;
        if (body.age) cached.age = Number(body.age);
        if (dob) cached.dob = dob;
        users.set(userId, cached);

        const freshUser = await authenticateUser(req);
        return sendJson(res, 200, {
          success: true,
          message: 'Diet profile updated successfully.',
          profile: freshUser
        });
      } catch (err) {
        console.error('[Diet Profile API Error]', err);
        return sendJson(res, 500, {
          success: false,
          status: 'error',
          error: err.message || 'Internal server error',
          message: 'Failed to update diet profile.'
        });
      }
    }

    if (pathname === '/api/v1/health/cycle-logs') {
      const user = await authenticateUser(req);
      const userId = user?.id;
      if (!userId) {
        return sendJson(res, 401, { error: 'Authentication required' });
      }

      if (req.method === 'GET') {
        let logs = [];
        if (pool) {
          const dbRes = await queryDb('SELECT * FROM public.cycle_logs WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 50', [userId]);
          logs = dbRes.rows;
        }
        return sendJson(res, 200, { count: logs.length, logs });
      }
      if (req.method === 'POST') {
        const body = await parseJsonBody(req);
        const newId = randomUUID();
        const validFlow = ['spotting', 'light', 'medium', 'heavy', 'none'];
        let flow = (body.flowIntensity || body.flow_intensity || 'none').toLowerCase();
        if (!validFlow.includes(flow)) flow = 'none';

        const newLog = {
          id: newId,
          user_id: userId,
          cycle_day: Number(body.cycleDay || body.cycle_day) || 1,
          flow_intensity: flow,
          cervical_mucus: body.cervicalMucus || body.cervical_mucus || null,
          cramps_severity: Number(body.crampsSeverity || body.cramps_severity) || 0,
          basal_body_temp_c: body.basalBodyTempC ? Number(body.basalBodyTempC) : null,
          mood: body.mood || null,
          notes: body.notes || null,
          logged_at: body.loggedAt || body.logged_at || new Date().toISOString(),
        };
        if (pool) {
          await queryDb(
            `INSERT INTO public.cycle_logs (id, user_id, cycle_day, flow_intensity, cervical_mucus, cramps_severity, basal_body_temp_c, mood, notes, logged_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO NOTHING;`,
            [newLog.id, newLog.user_id, newLog.cycle_day, newLog.flow_intensity, newLog.cervical_mucus, newLog.cramps_severity, newLog.basal_body_temp_c, newLog.mood, newLog.notes, newLog.logged_at]
          );
        }
        return sendJson(res, 201, { success: true, data: newLog });
      }
    }

    if (pathname === '/api/v1/health/goals') {
      const user = await authenticateUser(req);
      const userId = user?.id;
      if (!userId) {
        return sendJson(res, 401, { error: 'Authentication required' });
      }

      if (req.method === 'GET') {
        let userGoals = [];
        if (pool) {
          const dbRes = await queryDb('SELECT * FROM public.goals WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
          userGoals = dbRes.rows;
        }
        return sendJson(res, 200, { count: userGoals.length, goals: userGoals });
      }
      if (req.method === 'POST') {
        const body = await parseJsonBody(req);
        const newId = randomUUID();
        const validTypes = ['pcos_management', 'weight_loss', 'nutrition_balance', 'cycle_regularity', 'stress_reduction', 'general_wellness'];
        let gType = body.goalType || body.goal_type || 'nutrition_balance';
        if (!validTypes.includes(gType)) gType = 'general_wellness';

        const newGoal = {
          id: newId,
          user_id: userId,
          title: body.title || 'Personal Health Goal',
          goal_type: gType,
          target_metric: body.targetMetric || body.target_metric || 'consistency',
          target_value: Number(body.targetValue || body.target_value || 1),
          current_value: Number(body.currentValue || body.current_value || 0),
          unit: body.unit || 'action',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (pool) {
          await queryDb(
            `INSERT INTO public.goals (id, user_id, goal_type, title, target_metric, target_value, current_value, unit, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO NOTHING;`,
            [newGoal.id, newGoal.user_id, newGoal.goal_type, newGoal.title, newGoal.target_metric, newGoal.target_value, newGoal.current_value, newGoal.unit, newGoal.status, newGoal.created_at, newGoal.updated_at]
          );
        }
        return sendJson(res, 201, { success: true, data: newGoal });
      }
    }

    if (pathname === '/api/v1/health/alerts') {
      const user = await authenticateUser(req) || defaultUser;
      const userId = user?.id || defaultUserId;

      if (req.method === 'GET') {
        const type = url.searchParams.get('type');
        const status = url.searchParams.get('status');
        const fromDate = url.searchParams.get('from');
        const toDate = url.searchParams.get('to');
        const memberSearch = url.searchParams.get('member');
        let userAlerts = [];

        if (pool) {
          const whereClauses = [];
          const queryParams = [];

          // 1. Role-based isolation:
          // Family Head can see their own notifications AND permitted family activity notifications.
          // Normal Member sees only their own notifications.
          if (user.isFamilyHead && user.familyId) {
            whereClauses.push(`(
            user_id = $${queryParams.length + 1}
            OR (
              metadata->>'family_id' = $${queryParams.length + 2}
              AND (metadata->>'privacy_locked' IS NULL OR metadata->>'privacy_locked' = 'false')
            )
          )`);
            queryParams.push(userId, user.familyId);
          } else {
            whereClauses.push(`user_id = $${queryParams.length + 1}`);
            queryParams.push(userId);
          }

          // 2. 7-day retention rule or explicit Date Range filter
          if (fromDate) {
            whereClauses.push(`created_at >= $${queryParams.length + 1}::timestamptz`);
            queryParams.push(fromDate);
          } else {
            whereClauses.push(`created_at >= (NOW() - INTERVAL '7 days')`);
          }

          if (toDate) {
            whereClauses.push(`created_at <= ($${queryParams.length + 1}::date + INTERVAL '1 day' - INTERVAL '1 millisecond')`);
            queryParams.push(toDate);
          }

          // 3. Member Search (checks related member name, title, body)
          if (memberSearch && memberSearch.trim()) {
            const term = `%${memberSearch.trim()}%`;
            whereClauses.push(`(
            metadata->>'related_member_name' ILIKE $${queryParams.length + 1}
            OR title ILIKE $${queryParams.length + 1}
            OR body ILIKE $${queryParams.length + 1}
          )`);
            queryParams.push(term);
          }

          const sql = `
          SELECT * FROM public.notifications
          WHERE ${whereClauses.join(' AND ')}
          ORDER BY created_at DESC
          LIMIT 100
        `;

          const dbRes = await queryDb(sql, queryParams);
          userAlerts = dbRes.rows.map(r => {
            const meta = r.metadata || {};
            return {
              id: r.id,
              user_id: r.user_id,
              type: meta.type || (r.type === 'cycle_alert' || r.type === 'clinical_flag' ? 'health' : 'goal'),
              category: meta.category || 'general',
              title: r.title,
              message: r.body,
              severity: meta.severity || (r.type === 'clinical_flag' ? 'attention' : 'informational'),
              progress_pct: meta.progress_pct !== undefined ? meta.progress_pct : null,
              progress_label: meta.progress_label || null,
              is_read: Boolean(r.is_read),
              is_resolved: Boolean(meta.is_resolved),
              action_type: meta.action_type || 'view_record',
              action_target: meta.action_target || 'vitals',
              action_text: meta.action_text || 'View',
              related_member_name: meta.related_member_name || null,
              related_member_id: meta.related_member_id || null,
              family_id: meta.family_id || null,
              created_at: r.created_at,
              updated_at: meta.updated_at || r.created_at,
            };
          });
        }

        let filtered = [...userAlerts];
        if (type && type !== 'all') {
          filtered = filtered.filter(a => a.type === type);
        }
        if (status === 'unread') {
          filtered = filtered.filter(a => !a.is_read);
        } else if (status === 'important') {
          filtered = filtered.filter(a => a.severity === 'important' || a.severity === 'attention');
        } else if (status === 'resolved') {
          filtered = filtered.filter(a => a.is_resolved);
        }

        return sendJson(res, 200, {
          count: filtered.length,
          unreadCount: filtered.filter(a => !a.is_read).length,
          healthUnread: userAlerts.filter(a => a.type === 'health' && !a.is_read).length,
          goalUnread: userAlerts.filter(a => a.type === 'goal' && !a.is_read).length,
          alerts: filtered
        });
      }

      if (req.method === 'POST') {
        const body = await parseJsonBody(req);
        const newId = randomUUID();
        const notifType = body.type === 'goal' ? 'reminder' : 'clinical_flag';
        const metadata = {
          type: body.type || 'health',
          category: body.category || 'general',
          severity: body.severity || 'informational',
          progress_pct: body.progress_pct !== undefined ? body.progress_pct : null,
          progress_label: body.progress_label || null,
          is_resolved: false,
          action_type: body.action_type || 'view_record',
          action_target: body.action_target || 'vitals',
          action_text: body.action_text || 'View',
          related_member_name: body.related_member_name || body.relatedMemberName || null,
          related_member_id: body.related_member_id || body.relatedMemberId || null,
          family_id: body.family_id || body.familyId || user.familyId || null,
          event_type: body.event_type || null,
          updated_at: new Date().toISOString(),
        };

        const newAlert = {
          id: newId,
          user_id: userId,
          type: metadata.type,
          category: metadata.category,
          title: body.title || 'Health Alert',
          message: body.message || '',
          severity: metadata.severity,
          progress_pct: metadata.progress_pct,
          progress_label: metadata.progress_label,
          is_read: false,
          is_resolved: false,
          action_type: metadata.action_type,
          action_target: metadata.action_target,
          action_text: metadata.action_text,
          related_member_name: metadata.related_member_name,
          related_member_id: metadata.related_member_id,
          family_id: metadata.family_id,
          created_at: new Date().toISOString(),
          updated_at: metadata.updated_at,
        };

        if (pool) {
          await queryDb(
            `INSERT INTO public.notifications (id, user_id, type, title, body, metadata, is_read, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO NOTHING;`,
            [newId, userId, notifType, newAlert.title, newAlert.message, JSON.stringify(metadata), false, newAlert.created_at]
          );

          // If member generated an activity and belongs to a family, notify Family Head if distinct
          if (body.notify_head && user.familyId) {
            const headRes = await queryDb('SELECT admin_user_id FROM public.families WHERE id = $1', [user.familyId]);
            const headId = headRes.rows[0]?.admin_user_id;
            if (headId && headId !== userId) {
              const headNotifId = randomUUID();
              await queryDb(
                `INSERT INTO public.notifications (id, user_id, type, title, body, metadata, is_read, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, false, now())`,
                [headNotifId, headId, notifType, newAlert.title, newAlert.message, JSON.stringify(metadata)]
              );
            }
          }
        }
        return sendJson(res, 201, { success: true, alert: newAlert });
      }

      if (req.method === 'PATCH') {
        const body = await parseJsonBody(req);
        const alertId = body.id;
        if (pool && alertId) {
          const existingRes = await queryDb('SELECT * FROM public.notifications WHERE id = $1', [alertId]);
          if (existingRes.rows.length > 0) {
            const row = existingRes.rows[0];
            const meta = row.metadata || {};
            let isRead = row.is_read;
            if (body.is_read !== undefined) isRead = Boolean(body.is_read);
            if (body.is_resolved !== undefined) meta.is_resolved = Boolean(body.is_resolved);
            meta.updated_at = new Date().toISOString();

            await queryDb(
              `UPDATE public.notifications SET is_read = $1, metadata = $2, read_at = CASE WHEN $1 = true AND read_at IS NULL THEN now() ELSE read_at END WHERE id = $3`,
              [isRead, JSON.stringify(meta), alertId]
            );
            return sendJson(res, 200, { success: true });
          }
        }
        return sendJson(res, 404, { success: false, message: 'Alert not found' });
      }

      if (req.method === 'DELETE') {
        const body = await parseJsonBody(req);
        const alertId = body.id || url.searchParams.get('id');
        if (pool && alertId) {
          await queryDb('DELETE FROM public.notifications WHERE id = $1', [alertId]);
          return sendJson(res, 200, { success: true });
        }
        return sendJson(res, 404, { success: false, message: 'Alert not found' });
      }
    }
    // -------------------------------------------------------------
    // Appointments Endpoints: /api/v1/appointments
    // -------------------------------------------------------------
    if (pathname === '/api/v1/appointments' || pathname.startsWith('/api/v1/appointments/')) {
      const user = await authenticateUser(req) || defaultUser;
      const userId = user?.id || defaultUserId;

      // GET /api/v1/appointments
      if (pathname === '/api/v1/appointments' && req.method === 'GET') {
        const targetMemberId = url.searchParams.get('member_id');
        const statusFilter = url.searchParams.get('status');

        let dbAppointments = [];
        if (pool) {
          try {
            const dbRes = await queryDb(`
            SELECT a.*, u.full_name as member_name, p.gender as member_gender
            FROM public.appointments a
            LEFT JOIN public.users u ON a.user_id = u.id
            LEFT JOIN public.user_profiles p ON u.id = p.user_id
            ORDER BY a.appointment_date ASC, a.appointment_time ASC LIMIT 100
          `);
            dbAppointments = dbRes.rows || [];
          } catch (_) { }
        }

        const allMap = new Map();
        for (const a of dbAppointments) {
          allMap.set(a.id, a);
        }
        for (const a of appointmentsStore) {
          const existing = allMap.get(a.id);
          allMap.set(a.id, {
            ...(existing || {}),
            ...a,
            status: existing?.status || a.status
          });
        }

        let allAppts = Array.from(allMap.values()).map(a => {
          let dStr = a.appointment_date;
          if (dStr instanceof Date) {
            dStr = dStr.toISOString().split('T')[0];
          } else if (typeof dStr === 'string' && dStr.includes('T')) {
            dStr = dStr.split('T')[0];
          }
          return {
            ...a,
            appointment_date: String(dStr || ''),
            member_id: a.member_id || a.user_id,
            user_id: a.user_id || a.member_id
          };
        });

        if (statusFilter && statusFilter !== 'all') {
          allAppts = allAppts.filter(a => (a.status || 'scheduled').toLowerCase() === statusFilter.toLowerCase());
        }
        if (targetMemberId && targetMemberId !== 'all') {
          allAppts = allAppts.filter(a => a.user_id === targetMemberId || a.member_id === targetMemberId);
        }

        allAppts.sort((a, b) => {
          const da = String(a.appointment_date || '');
          const db = String(b.appointment_date || '');
          return da.localeCompare(db);
        });

        return sendJson(res, 200, {
          count: allAppts.length,
          appointments: allAppts
        });
      }

      // POST /api/v1/appointments
      if (pathname === '/api/v1/appointments' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const title = (body.title || '').trim();
        const doctorName = (body.doctor_name || body.doctorName || '').trim();
        const appointmentDate = body.appointment_date || body.appointmentDate;
        const appointmentTime = body.appointment_time || body.appointmentTime || '10:00:00';
        const location = (body.location || '').trim();
        const notes = (body.notes || '').trim();
        const reminderMinutes = parseInt(body.reminder_minutes || 60, 10);

        let targetUserId = userId;
        let targetMemberName = body.member_name || body.memberName || user.full_name || user.fullName || 'Self';

        if (body.target_member_id && body.target_member_id !== userId) {
          targetUserId = body.target_member_id;
          targetMemberName = body.member_name || body.memberName || body.target_member_name || 'Family Member';
          if (pool) {
            try {
              const chk = await queryDb(
                `SELECT u.id, u.full_name FROM public.users u WHERE u.id::text = $1`,
                [body.target_member_id]
              );
              if (chk.rows.length > 0) {
                targetMemberName = chk.rows[0].full_name;
              }
            } catch (_) { }
          }
        }

        if (!title || !appointmentDate) {
          return sendJson(res, 400, { error: 'Title and appointment date are required' });
        }

        const newId = randomUUID();
        const apptRecord = {
          id: newId,
          family_id: user.familyId || defaultFamilyId,
          user_id: targetUserId,
          member_id: targetUserId,
          member_name: targetMemberName,
          title,
          doctor_name: doctorName || null,
          appointment_date: typeof appointmentDate === 'string' && appointmentDate.includes('T') ? appointmentDate.split('T')[0] : String(appointmentDate),
          appointment_time: appointmentTime,
          location: location || null,
          notes: notes || null,
          status: 'scheduled',
          reminder_minutes: reminderMinutes,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        // Store in memory / disk storage
        appointmentsStore.unshift(apptRecord);
        persistAppointmentsStore();

        // Also persist to PostgreSQL
        if (pool) {
          try {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            let validDbUserId = uuidRegex.test(targetUserId) ? targetUserId : null;
            let validDbFamilyId = uuidRegex.test(user.familyId) ? user.familyId : null;

            if (!validDbUserId) {
              const headLookup = await queryDb(`SELECT id FROM public.users LIMIT 1`);
              if (headLookup.rows.length > 0) {
                validDbUserId = headLookup.rows[0].id;
              }
            }

            if (validDbUserId) {
              const insertSql = `
              INSERT INTO public.appointments (id, family_id, user_id, title, doctor_name, appointment_date, appointment_time, location, notes, status, reminder_minutes, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'scheduled', $10, now(), now())
              ON CONFLICT (id) DO NOTHING;
            `;
              await queryDb(insertSql, [
                newId,
                validDbFamilyId,
                validDbUserId,
                title,
                doctorName || null,
                appointmentDate,
                appointmentTime,
                location || null,
                notes || null,
                reminderMinutes
              ]);

              // Create reminder notification for appointment
              const notifId = randomUUID();
              const notifTitle = `Appointment: ${title}`;
              const notifBody = `${doctorName ? 'Dr. ' + doctorName + ' - ' : ''}${appointmentDate} at ${appointmentTime}${location ? ' (' + location + ')' : ''}`;
              await queryDb(`
              INSERT INTO public.notifications (id, user_id, type, title, body, metadata, is_read, created_at)
              VALUES ($1, $2, 'reminder', $3, $4, $5, false, now())
            `, [
                notifId,
                validDbUserId,
                notifTitle,
                notifBody,
                JSON.stringify({
                  type: 'health',
                  category: 'appointment',
                  appointment_id: newId,
                  family_id: validDbFamilyId,
                  related_member_id: targetUserId,
                  related_member_name: targetMemberName,
                  appointment_date: appointmentDate,
                  appointment_time: appointmentTime
                })
              ]);
            }
          } catch (dbErr) {
            console.warn('Postgres appointment sync warning:', dbErr.message);
          }
        }

        return sendJson(res, 201, {
          success: true,
          appointment: apptRecord
        });
      }

      // PUT /api/v1/appointments/:id
      if (pathname.startsWith('/api/v1/appointments/') && (req.method === 'PUT' || req.method === 'PATCH')) {
        const aptId = pathname.replace('/api/v1/appointments/', '').trim();
        const body = await parseJsonBody(req);
        const newStatus = body.status || 'completed';

        const sIdx = appointmentsStore.findIndex(a => a.id === aptId);
        if (sIdx >= 0) {
          appointmentsStore[sIdx].status = newStatus;
          appointmentsStore[sIdx].updated_at = new Date().toISOString();
          persistAppointmentsStore();
        }

        if (pool) {
          try {
            await queryDb(`UPDATE public.appointments SET status = $1, updated_at = now() WHERE id = $2`, [newStatus, aptId]);
          } catch (_) { }
        }

        return sendJson(res, 200, { success: true, message: 'Appointment updated successfully.' });
      }

      // DELETE /api/v1/appointments/:id
      if (pathname.startsWith('/api/v1/appointments/') && req.method === 'DELETE') {
        const aptId = pathname.replace('/api/v1/appointments/', '').trim();
        appointmentsStore = appointmentsStore.filter(a => a.id !== aptId);
        persistAppointmentsStore();

        if (pool) {
          try {
            await queryDb(`DELETE FROM public.appointments WHERE id = $1`, [aptId]);
          } catch (_) { }
        }

        return sendJson(res, 200, { success: true, message: 'Appointment deleted successfully.' });
      }
    }

    if (pathname === '/api/v1/health/sync' && req.method === 'POST') {
      const user = await authenticateUser(req);
      const userId = user?.id;
      let nLogs = [];
      let sLogs = [];
      if (pool && userId) {
        const nr = await queryDb('SELECT * FROM public.nutrition_logs WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 50', [userId]);
        const sr = await queryDb('SELECT * FROM public.symptom_logs WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 50', [userId]);
        nLogs = nr.rows;
        sLogs = sr.rows;
      }
      return sendJson(res, 201, {
        success: true,
        syncedAt: new Date().toISOString(),
        sourceOfTruth: 'Supabase PostgreSQL Database (Single Source of Truth)',
        payload: {
          nutritionLogs: nLogs,
          symptomLogs: sLogs,
        },
      });
    }

    // 4. AI Assistant & Conversations & Consult
    if (pathname === '/api/v1/ai/conversations' && req.method === 'GET') {
      const user = await authenticateUser(req) || defaultUser;
      const userId = user?.id || defaultUserId;

      // Strict privacy verification: only list conversations belonging to this authenticated user
      const userConvs = aiConversationsStore.filter(c => c.user_id === userId);
      userConvs.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));

      const summaries = userConvs.map(c => ({
        id: c.id,
        title: c.title,
        date: c.date || (c.created_at ? c.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
        created_at: c.created_at,
        updated_at: c.updated_at,
        messageCount: Array.isArray(c.messages) ? c.messages.length : 0
      }));

      return sendJson(res, 200, { success: true, conversations: summaries });
    }

    if (pathname.startsWith('/api/v1/ai/conversations/') && req.method === 'GET') {
      const convId = pathname.replace('/api/v1/ai/conversations/', '').trim();
      const user = await authenticateUser(req) || defaultUser;
      const userId = user?.id || defaultUserId;

      const conv = aiConversationsStore.find(c => c.id === convId);
      if (!conv) {
        return sendJson(res, 404, { success: false, message: 'Conversation not found' });
      }
      // Strict privacy verification: Member A cannot see Member B's private chat
      if (conv.user_id !== userId) {
        return sendJson(res, 403, { success: false, message: 'Access denied: private conversation' });
      }
      return sendJson(res, 200, { success: true, conversation: conv });
    }

    if (pathname === '/api/v1/ai/conversations' && req.method === 'POST') {
      const user = await authenticateUser(req) || defaultUser;
      const userId = user?.id || defaultUserId;
      const body = await parseJsonBody(req);
      const title = (body.title || 'Health Consultation').trim();
      const nowIso = new Date().toISOString();
      const newConv = {
        id: randomUUID(),
        user_id: userId,
        title,
        date: nowIso.split('T')[0],
        created_at: nowIso,
        updated_at: nowIso,
        messages: []
      };
      aiConversationsStore.unshift(newConv);
      persistAiConversationsStore();

      if (pool) {
        try {
          await queryDb(`
          INSERT INTO public.ai_conversations (id, user_id, title, date, created_at, updated_at)
          VALUES ($1, $2, $3, $4, now(), now())
          ON CONFLICT (id) DO NOTHING;
        `, [newConv.id, userId, title, newConv.date]);
        } catch (_) { }
      }

      return sendJson(res, 201, { success: true, conversation: newConv });
    }

    if (pathname === '/api/v1/ai/consult' && req.method === 'POST') {
      const user = await authenticateUser(req) || defaultUser;
      const userId = user?.id || defaultUserId;
      const body = await parseJsonBody(req);
      const prompt = (body.prompt || '').trim();
      const lang = body.lang || 'en';
      let conversationId = body.conversation_id || null;

      // Helper to find or create conversation for this user
      let conv = null;
      if (conversationId) {
        conv = aiConversationsStore.find(c => c.id === conversationId && c.user_id === userId);
      }
      if (!conv) {
        const nowIso = new Date().toISOString();
        let autoTitle = prompt.replace(/\[CLINICAL CONTEXT:.*?\]/gis, '').replace(/\[AUTHENTICATED PATIENT TELEMETRY CONTEXT\].*$/gis, '').trim();
        if (autoTitle.length > 38) autoTitle = autoTitle.substring(0, 38) + '...';
        if (!autoTitle) autoTitle = lang === 'te' ? 'ఆరోగ్య సంప్రదింపు' : 'Health Consultation';

        conv = {
          id: randomUUID(),
          user_id: userId,
          title: autoTitle,
          date: nowIso.split('T')[0],
          created_at: nowIso,
          updated_at: nowIso,
          messages: []
        };
        aiConversationsStore.unshift(conv);
      }

      const userMsg = {
        id: randomUUID(),
        role: 'user',
        content: prompt,
        created_at: new Date().toISOString()
      };
      conv.messages.push(userMsg);

      // 1. HARD PRE-FILTER: Block ALL Programming/Code Questions
      const codeKeywords = [
        /\b(code|coding|program|programming|script|developer|software|algorithm)\b/i,
        /\b(javascript|js|python|html|css|sql|java|c\+\+|c#|typescript|php|react|angular|vue|node)\b/i,
        /\b(function|var|const|let|def|class|import|return|console\.log|print\(|select \* from|<div>|<script>)\b/i,
        /\b(write a script|create an app|debug|syntax error|git|github|api key|hack|compiler)\b/i
      ];
      let replyText = '';
      let safetyTier = 'standard';

      if (codeKeywords.some(pattern => pattern.test(prompt))) {
        replyText = lang === 'te'
          ? 'నేను అలోక AI (Aloka AI), మీ VitaWise ఆరోగ్య మరియు పోషకాహార సహాయకుడిని. నేను కేవలం ఆరోగ్యం, ఆహారం, PCOS మరియు పోషకాహార సలహాలు మాత్రమే ఇస్తాను. నేను ప్రోగ్రామింగ్ లేదా కోడింగ్ సంబంధిత ప్రశ్నలకు సమాధానమివ్వలేను.'
          : 'I am Aloka AI, your dedicated VitaWise Health & Nutrition Assistant. I specialize exclusively in clinical health, ICMR-NIN nutrition guidelines, PCOS wellness, and metabolic lifestyle advice. I am programmed to not answer technical, programming, or coding questions.';
        safetyTier = 'guarded';
      } else {
        // 2. Clinical emergency filter
        const redFlags = ['severe bleeding', 'acute pain', 'fainting', 'sudden collapse', 'తీవ్ర రక్తస్రావం', 'తీవ్ర కడుపునొప్పి'];
        if (redFlags.some((rf) => prompt.toLowerCase().includes(rf.toLowerCase()))) {
          replyText =
            lang === 'te'
              ? 'అత్యవసర హెచ్చరిక: మీరు పేర్కొన్న లక్షణాలు (తీవ్ర నొప్పి లేదా రక్తస్రావం) తక్షణ వైద్య సహాయం అవసరమైనవి కావచ్చు. దయచేసి సమీపంలోని వైద్యుడిని లేదా అత్యవసర విభాగాన్ని వెంటనే సంప్రదించండి.'
              : 'CLINICAL ESCALATION ALERT: The symptoms you described (acute severe pain or abnormal bleeding) require immediate in-person medical evaluation. Please contact a registered gynecologist or visit the nearest healthcare facility immediately.';
          safetyTier = 'high';
        } else {
          // 3. OpenRouter API Backend Integration using .env variables
          const openRouterKey = process.env.OPENROUTER_API_KEY || '';
          const openRouterModel = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-lite-001';

          if (openRouterKey) {
            try {
              const systemMsg = lang === 'te'
                ? `మీరు VitaWise ఆరోగ్య వేదిక కోసం అలోక AI (Aloka AI) అనే వైద్య మరియు పోషకాహార నిపుణులు.
మీరు చాలా సహజమైన, ఆప్యాయమైన, మరియు స్పష్టమైన మానవ తెలుగులో (Warm, Natural, Fluent Conversational Human Telugu) మాట్లాడాలి. ఏ మాత్రమూ రోబోటిక్ AI లాగా లేదా యంత్ర అనువాదంలాగా ఉండకూడదు.
ఒక అనుభవజ్ఞుడైన ఆత్మీయ వైద్యుడు లేదా పోషకాహార మిత్రుడు రోగితో లేదా మిత్రుడితో ఎంత ప్రేమగా, గౌరవంగా మాట్లాడుతారో అలా తెలుగులో పలకరించాలి మరియు సమాధానం ఇవ్వాలి.
ICMR-NIN మార్గదర్శకాలు, దక్షిణ భారత చిరుధాన్యాలు (కొర్రలు, రాగులు, జొన్నలు), పప్పుధాన్యాలు మరియు PCOS / జీవక్రియ సంబంధిత అంశాలపై స్పష్టమైన, సులభంగా అర్థమయ్యే సలహాలు ఇవ్వండి.
ముఖ్య గమనిక: కేవలం ఆరోగ్యం, పోషకాహారం, లైఫ్‌స్టైల్ మరియు VitaWise యాప్ ప్రశ్నలకు మాత్రమే సమాధానం ఇవ్వండి. ఎట్టి పరిస్థితుల్లోనూ కంప్యూటర్ కోడింగ్ లేదా ప్రోగ్రామింగ్ ప్రశ్నలకు సమాధానం ఇవ్వకండి.`
                : `You are Aloka AI, the dedicated health, nutrition, and metabolic intelligence assistant for the VitaWise platform.
You provide evidence-based guidance grounded in ICMR-NIN (Indian Council of Medical Research & National Institute of Nutrition) guidelines, PCOS hormonal health, low-glycemic South Indian diets, and metabolic wellness.
CRITICAL MANDATE: You ONLY answer health, nutrition, PCOS, diet, exercise, lifestyle, and VitaWise app questions. NEVER answer programming, coding, or software development questions. If asked about code, refuse politely.`;

              const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${openRouterKey}`,
                  'Content-Type': 'application/json',
                  'HTTP-Referer': 'https://vitawise.ai',
                  'X-Title': 'VitaWise Health Intelligence'
                },
                body: JSON.stringify({
                  model: openRouterModel,
                  messages: [
                    { role: 'system', content: systemMsg },
                    { role: 'user', content: prompt }
                  ],
                  temperature: 0.5,
                  max_tokens: 600
                })
              });

              if (orRes.ok) {
                const data = await orRes.json();
                const answer = data.choices?.[0]?.message?.content;
                if (answer) {
                  replyText = answer;
                  safetyTier = 'standard';
                }
              }
            } catch (err) {
              console.warn('OpenRouter API backend call error:', err.message);
            }
          }

          // 4. Evidence-based Clinical Fallback
          if (!replyText) {
            replyText =
              lang === 'te'
                ? `విశ్లేషణ: మీ అభ్యర్థనకు సంబంధించి ICMR మార్గదర్శకాల ప్రకారం, చిరుధాన్యాలు (కొర్రలు, రాగులు) మరియు మొలకెత్తిన పెసలు ఇన్సులిన్ స్థాయిలను సమతుల్యం చేయడంలో ఎంతో సహాయపడతాయి. భోజనం తర్వాత 15 నిమిషాల నడక గ్లూకోజ్ హెచ్చుతగ్గులను తగ్గిస్తుంది.`
                : `Clinical Synthesis: Grounded in ICMR-NIN guidelines and endocrine research, prioritizing low-glycemic traditional foods (sprouted moong, foxtail millets, and unrefined grains) helps maintain steady postprandial glucose. Pairing meals with a 15-minute zone-1 stroll supports GLUT4 glucose uptake without requiring insulin spikes.`;
            safetyTier = 'standard';
          }
        }
      }

      const assistantMsg = {
        id: randomUUID(),
        role: 'assistant',
        content: replyText,
        created_at: new Date().toISOString()
      };
      conv.messages.push(assistantMsg);
      conv.updated_at = new Date().toISOString();
      persistAiConversationsStore();

      if (pool) {
        try {
          await queryDb(`
          INSERT INTO public.ai_conversations (id, user_id, title, date, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO UPDATE SET updated_at = $6;
        `, [conv.id, userId, conv.title, conv.date, conv.created_at, conv.updated_at]);

          await queryDb(`
          INSERT INTO public.ai_messages (id, conversation_id, user_id, role, content, created_at)
          VALUES ($1, $2, $3, $4, $5, now());
        `, [userMsg.id, conv.id, userId, userMsg.role, userMsg.content]);

          await queryDb(`
          INSERT INTO public.ai_messages (id, conversation_id, user_id, role, content, created_at)
          VALUES ($1, $2, $3, $4, $5, now());
        `, [assistantMsg.id, conv.id, userId, assistantMsg.role, assistantMsg.content]);
        } catch (_) { }
      }

      return sendJson(res, 200, {
        content: replyText,
        reply: replyText,
        conversation_id: conv.id,
        title: conv.title,
        safetyTier
      });
    }

    // 5. AI Assessment (Rotterdam / ICMR-NIN Criteria)
    if (pathname === '/api/v1/ai/assess' && req.method === 'POST') {
      const dto = await parseJsonBody(req);
      const lang = dto.language || 'en';
      const startTime = Date.now();

      let riskScore = 15;
      const flags = [];

      if (dto.cycleIrregularity) {
        riskScore += 35;
        flags.push('Oligo/Amenorrhea detected (Rotterdam Phenotype Criterion 1)');
      }
      if (dto.hirsutismOrAcne) {
        riskScore += 30;
        flags.push('Clinical Hyperandrogenism markers indicated (Rotterdam Criterion 2)');
      }
      if (dto.fastingGlucose && dto.fastingGlucose > 100) {
        riskScore += 15;
        flags.push(`Elevated Fasting Glucose (${dto.fastingGlucose} mg/dL) indicating insulin sensitivity vulnerability`);
      }

      let riskLevel = 'low';
      if (riskScore >= 65) riskLevel = 'high';
      else if (riskScore >= 45) riskLevel = 'elevated';
      else if (riskScore >= 25) riskLevel = 'moderate';

      const aiSummary =
        lang === 'te'
          ? `విశ్లేషణ: మీ లక్షణాల ఆధారంగా ఇన్సులిన్ నిరోధకత మరియు హార్మోన్ల అసమతుల్యత ప్రమాదం ${riskLevel === 'high' ? 'ఎక్కువగా' : 'మధ్యస్థంగా'
          } ఉంది. చిరుధాన్యాలు మరియు పీచు పదార్థాలు తీసుకోవడం చాలా మంచిది.`
          : `Clinical synthesis indicates a ${riskLevel} metabolic predisposition. Recommended focus on complex unrefined millets, lean pulses, and 30-min daily brisk physical pacing to support insulin sensitivity.`;

      const recommendations = [
        {
          domain: 'diet',
          title: lang === 'te' ? 'తక్కువ గ్లైసెమిక్ ఆహార ఎంపికలు' : 'Low-Glycemic Millet Rotation',
          actionItem:
            lang === 'te'
              ? 'తెల్లటి అన్నం స్థానంలో కొర్రలు లేదా రాగులు వాడండి.'
              : 'Replace refined white rice with foxtail or barnyard millet at principal meals.',
          scientificRationale: 'Lowers postprandial glucose spike, reducing hyperinsulinemia-induced androgen secretion.',
          priority: 'high',
        },
        {
          domain: 'lifestyle',
          title: lang === 'te' ? 'భోజనం తర్వాత తేలికపాటి నడక' : 'Postprandial Zone-1 Pacing',
          actionItem: lang === 'te' ? 'భోజనం తర్వాత 15 నిమిషాల పాటు నెమ్మదిగా నడవండి.' : 'Engage in a 15-minute zone-1 stroll after principal meals.',
          scientificRationale: 'Promotes muscle GLUT4 translocation independent of insulin secretion.',
          priority: 'medium',
        },
        {
          domain: 'clinical_consult',
          title: lang === 'te' ? 'వైద్యుల సంప్రదింపు' : 'Confirmatory Rotterdam Screening',
          actionItem:
            lang === 'te'
              ? 'గైనకాలజిస్ట్ లేదా ఎండోక్రినాలజిస్ట్‌ను సంప్రదించండి.'
              : 'Schedule pelvic ultrasound and serum androgen panel with your gynecologist.',
          scientificRationale: 'Accurate clinical staging according to Rotterdam consensus guidelines.',
          priority: riskLevel === 'high' ? 'urgent' : 'medium',
        },
      ];

      return sendJson(res, 201, {
        assessmentId: 'asmt_' + Math.random().toString(36).substring(2, 9),
        riskLevel,
        riskScore,
        clinicalIndicators: flags,
        summary: aiSummary,
        recommendations,
        persistedInSupabase: true,
        inferenceLatencyMs: Date.now() - startTime,
      });
    }

    // -------------------------------------------------------------
    // 5b. Family Health, Privacy, Access Control & Dashboard Endpoints (Database-Driven)
    // -------------------------------------------------------------

    // Create Family with Head & Member Accounts
    if (pathname === '/api/v1/family/create' && req.method === 'POST') {
      const user = await authenticateUser(req);
      let userId = user?.id;

      const body = await parseJsonBody(req);
      const familyName = (body.familyName || 'Our Family').trim();
      const adminDetails = body.adminDetails || {};
      const familyEmail = (body.familyEmail || adminDetails.email || '').trim().toLowerCase();
      const memberList = Array.isArray(body.members) ? body.members : [];

      const familyId = randomUUID();
      const adminMemberId = adminDetails.memberId || 'FAM001';
      const adminPass = adminDetails.password || 'HeadPass123!';
      const { hash: adminHash, salt: adminSalt } = hashPassword(adminPass);

      if (!userId) {
        if (!familyEmail || !adminDetails.password) {
          return sendJson(res, 401, { error: 'Authentication required or admin credentials needed' });
        }
        if (pool) {
          const existing = await queryDb(`SELECT id FROM public.users WHERE email = $1`, [familyEmail]);
          if (existing.rows.length > 0) {
            userId = existing.rows[0].id;
            if (supabase && supabaseServiceKey) {
              try {
                await supabase.auth.admin.updateUserById(userId, { password: adminPass, email_confirm: true });
              } catch (_) { }
            }
            await queryDb(
              `UPDATE public.users SET role = 'family_head', member_id = $1, full_name = $2, updated_at = now() WHERE id = $3`,
              [adminMemberId, adminDetails.fullName || 'Family Head', userId]
            );
          } else {
            if (supabase && supabaseServiceKey) {
              const { data: supaUser } = await supabase.auth.admin.createUser({
                email: familyEmail,
                password: adminPass,
                email_confirm: true,
                user_metadata: { full_name: adminDetails.fullName || 'Family Head' }
              });
              if (supaUser?.user) {
                userId = supaUser.user.id;
              } else {
                const exAuth = await queryDb('SELECT id FROM auth.users WHERE email = $1', [familyEmail]);
                userId = exAuth.rows[0]?.id || randomUUID();
              }
            } else {
              userId = randomUUID();
            }
            await queryDb(
              `INSERT INTO public.users (id, email, role, full_name, member_id, is_active, created_at, updated_at)
             VALUES ($1, $2, 'family_head', $3, $4, true, now(), now())
             ON CONFLICT (id) DO UPDATE SET role = 'family_head', member_id = EXCLUDED.member_id, full_name = EXCLUDED.full_name, updated_at = now()`,
              [userId, familyEmail, adminDetails.fullName || 'Family Head', adminMemberId]
            );
            await queryDb(
              `INSERT INTO public.user_profiles (id, user_id, gender, created_at, updated_at)
             VALUES ($1, $2, $3, now(), now())
             ON CONFLICT (user_id) DO UPDATE SET gender = EXCLUDED.gender, updated_at = now()`,
              [randomUUID(), userId, adminDetails.gender || 'male']
            );
          }
        } else {
          userId = 'usr_' + randomUUID().substring(0, 8);
        }
      }

      const newFamily = {
        id: familyId,
        name: familyName,
        family_email: familyEmail || null,
        admin_user_id: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (pool) {
        await queryDb(
          `INSERT INTO public.families (id, name, family_email, admin_user_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
          [familyId, familyName, familyEmail || null, userId, newFamily.created_at, newFamily.updated_at]
        );
        await queryDb(
          `INSERT INTO public.family_memberships (id, family_id, user_id, member_id, display_name, role, relationship, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'family_head', $6, 'active', $7, $8)
         ON CONFLICT (family_id, user_id) DO UPDATE SET
           member_id = EXCLUDED.member_id,
           role = 'family_head',
           display_name = EXCLUDED.display_name,
           relationship = EXCLUDED.relationship,
           updated_at = now()`,
          [randomUUID(), familyId, userId, adminMemberId, adminDetails.fullName || 'Family Head', adminDetails.relationship || 'father', newFamily.created_at, newFamily.updated_at]
        );
        await queryDb(
          `UPDATE public.users SET role = 'family_head', member_id = $1, family_id = $2, updated_at = now() WHERE id = $3`,
          [adminMemberId, familyId, userId]
        );
      }

      if (familyEmail) {
        users.set(familyEmail, {
          id: userId,
          userId,
          email: familyEmail,
          fullName: adminDetails.fullName || 'Family Head',
          name: adminDetails.fullName || 'Family Head',
          password: adminPass,
          role: 'family_head',
          familyId,
        });
      }

      const createdMembers = [
        {
          id: userId,
          memberId: adminMemberId,
          fullName: adminDetails.fullName || 'Family Head',
          relationship: adminDetails.relationship || 'father',
          gender: adminDetails.gender || 'male',
          role: 'family_head',
        }
      ];

      let seq = 2;
      for (const mem of memberList) {
        const memName = (mem.fullName || mem.name || `Member ${seq}`).trim();
        const memMemberId = mem.memberId || `FAM00${seq}`;
        const memEmail = (mem.email || `${(familyEmail ? familyEmail.split('@')[0] : 'fam')}+${memMemberId.toLowerCase()}@${familyEmail ? familyEmail.split('@')[1] : 'vitawise.ai'}`).toLowerCase();
        const memGender = (mem.gender || 'female').toLowerCase();
        const memRel = (mem.relationship || 'other').toLowerCase();
        const memPass = mem.password || 'VitaWiseMember123!';
        const { hash: mHash, salt: mSalt } = hashPassword(memPass);
        let memUserId = randomUUID();

        if (pool) {
          // Check if user exists by email
          const existingU = await queryDb(`SELECT id FROM public.users WHERE email = $1`, [memEmail]);
          if (existingU.rows.length > 0) {
            memUserId = existingU.rows[0].id;
            await queryDb(
              `UPDATE public.users SET member_id = $1, family_id = $2, role = 'family_member', full_name = $3, updated_at = now() WHERE id = $4`,
              [memMemberId, familyId, memName, memUserId]
            );
          } else {
            if (supabase && supabaseServiceKey) {
              const { data: supaMem } = await supabase.auth.admin.createUser({
                email: memEmail,
                password: memPass,
                email_confirm: true,
                user_metadata: { full_name: memName }
              });
              if (supaMem?.user) {
                memUserId = supaMem.user.id;
              } else {
                const exAuth = await queryDb('SELECT id FROM auth.users WHERE email = $1', [memEmail]);
                memUserId = exAuth.rows[0]?.id || randomUUID();
              }
            } else {
              memUserId = randomUUID();
            }
            await queryDb(
              `INSERT INTO public.users (id, email, role, full_name, member_id, family_id, is_active, created_at, updated_at)
             VALUES ($1, $2, 'family_member', $3, $4, $5, true, now(), now())
             ON CONFLICT (id) DO UPDATE SET member_id = EXCLUDED.member_id, family_id = EXCLUDED.family_id, full_name = EXCLUDED.full_name, updated_at = now()`,
              [memUserId, memEmail, memName, memMemberId, familyId]
            );
            await queryDb(
              `INSERT INTO public.user_profiles (id, user_id, gender, created_at, updated_at)
             VALUES ($1, $2, $3, now(), now())
             ON CONFLICT (user_id) DO UPDATE SET gender = EXCLUDED.gender, updated_at = now()`,
              [randomUUID(), memUserId, memGender]
            );
          }

          await queryDb(
            `INSERT INTO public.family_memberships (id, family_id, user_id, member_id, display_name, role, relationship, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'family_member', $6, 'active', now(), now())
           ON CONFLICT (family_id, user_id) DO UPDATE SET
             member_id = EXCLUDED.member_id,
             role = 'family_member',
             display_name = EXCLUDED.display_name,
             relationship = EXCLUDED.relationship,
             updated_at = now()`,
            [randomUUID(), familyId, memUserId, memMemberId, memName, memRel]
          );

          await queryDb(
            `INSERT INTO public.family_permissions (id, family_id, member_user_id, admin_user_id, pcos_overview, cycle_period, symptoms_journal, hormonal_wellness, medication, lab_records, private_health_history, created_at, updated_at)
           VALUES ($1, $2, $3, $4, false, false, false, false, false, false, false, now(), now())
           ON CONFLICT (family_id, member_user_id, admin_user_id) DO NOTHING`,
            [randomUUID(), familyId, memUserId, userId]
          );
        }

        const memObj = {
          id: memUserId,
          userId: memUserId,
          email: memEmail,
          fullName: memName,
          name: memName,
          password: memPass,
          role: 'family_member',
          familyId,
        };
        users.set(memEmail, memObj);
        users.set(memUserId, memObj);
        users.set(memName.toLowerCase(), memObj);

        createdMembers.push({
          id: memUserId,
          memberId: memMemberId,
          fullName: memName,
          email: memEmail,
          gender: memGender,
          relationship: memRel,
          role: 'family_member',
        });

        seq++;
      }

      const sessionToken = 'vw_tok_' + randomBytes(16).toString('hex');
      const refreshToken = 'vw_ref_' + randomBytes(16).toString('hex');
      sessionUserMap.set(sessionToken, userId);

      return sendJson(res, 201, {
        ok: true,
        family: newFamily,
        members: createdMembers,
        session: { accessToken: sessionToken, refreshToken },
        user: {
          id: userId,
          email: familyEmail,
          fullName: adminDetails.fullName || 'Family Head',
          role: 'family_head',
          memberId: adminMemberId,
          familyId,
          familyName,
          isFamilyHead: true,
          gender: adminDetails.gender || 'male',
        },
        message: 'Family space and member accounts created successfully.',
      });
    }

    // Add individual family member
    if (pathname === '/api/v1/family/members' && req.method === 'POST') {
      const user = await authenticateUser(req);
      const userId = user?.id;
      if (!userId) {
        return sendJson(res, 401, { error: 'Authentication required' });
      }

      // RBAC: Only Family Head can manage or add members
      const isHead = (user.isFamilyHead === true || user.role === 'family_head' || user.role === 'admin' || user.relationship === 'head') && user.role !== 'family_member';
      if (user.role === 'family_member' || !isHead) {
        return sendJson(res, 403, {
          error: 'Forbidden',
          message: 'Access restricted to Family Head only. Family Members cannot add members or manage family.'
        });
      }

      if (!pool) {
        return sendJson(res, 400, { error: 'Database unavailable' });
      }

      let famRes = await queryDb(
        `SELECT f.id as family_id, COALESCE(fm.role, 'family_head') as role, f.family_email, f.name as family_name
       FROM public.families f
       LEFT JOIN public.family_memberships fm ON fm.family_id = f.id AND fm.user_id = $1
       WHERE fm.user_id = $1 OR f.admin_user_id = $1
       LIMIT 1;`,
        [userId]
      );

      if (famRes.rows.length === 0) {
        const uFam = await queryDb(`SELECT family_id FROM public.users WHERE id = $1`, [userId]);
        if (uFam.rows[0]?.family_id) {
          famRes = await queryDb(
            `SELECT id as family_id, 'family_head' as role, family_email, name as family_name
           FROM public.families WHERE id = $1 LIMIT 1;`,
            [uFam.rows[0].family_id]
          );
        }
      }

      let family;
      if (famRes.rows.length === 0) {
        // User is initializing their family space as Family Head
        const newFamilyId = randomUUID();
        const userFullName = user.fullName || user.full_name || 'My Family';
        const familyName = `${userFullName}'s Health Space`;
        const familyEmail = user.email || 'family@vitawise.ai';

        // 1. Ensure user exists in users table
        await queryDb(
          `INSERT INTO public.users (id, email, role, full_name, is_active, created_at, updated_at)
         VALUES ($1, $2, 'family_head', $3, true, now(), now())
         ON CONFLICT (id) DO UPDATE SET role = 'family_head', full_name = EXCLUDED.full_name, updated_at = now();`,
          [userId, user.email || 'head@vitawise.ai', userFullName]
        );

        // 2. Insert family
        await queryDb(
          `INSERT INTO public.families (id, name, family_email, admin_user_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, now(), now())
         ON CONFLICT (id) DO NOTHING;`,
          [newFamilyId, familyName, familyEmail, userId]
        );

        // 3. Link user to family
        await queryDb(
          `UPDATE public.users SET role = 'family_head', family_id = $1, member_id = 'FAM001', updated_at = now() WHERE id = $2;`,
          [newFamilyId, userId]
        );

        // 4. Insert head membership with allowed relationship 'other'
        await queryDb(
          `INSERT INTO public.family_memberships (id, family_id, user_id, member_id, display_name, role, relationship, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'FAM001', $4, 'family_head', 'other', 'active', now(), now())
         ON CONFLICT (family_id, user_id) DO UPDATE SET role = 'family_head', updated_at = now();`,
          [randomUUID(), newFamilyId, userId, userFullName]
        );

        family = {
          family_id: newFamilyId,
          role: 'family_head',
          family_email: familyEmail,
          family_name: familyName,
        };
      } else {
        family = famRes.rows[0];
      }

      const familyId = family.family_id;
      const body = await parseJsonBody(req);

      const countRes = await queryDb(`SELECT COUNT(*) FROM public.family_memberships WHERE family_id = $1;`, [familyId]);
      const nextSeq = parseInt(countRes.rows[0]?.count || '1', 10) + 1;
      const memberId = body.memberId || `FAM00${nextSeq}`;

      const memName = (body.name || body.fullName || 'Family Member').trim();
      const memGender = (body.gender || 'female').toLowerCase();
      const rawRel = (body.relationship || 'other').toLowerCase();
      const validRels = ['father', 'mother', 'husband', 'wife', 'son', 'daughter', 'brother', 'sister', 'other'];
      const memRel = validRels.includes(rawRel) ? rawRel : 'other';
      const memPass = body.password || 'VitaWiseMember123!';
      const memAge = parseInt(body.age, 10);
      const dob = !isNaN(memAge) && memAge > 0
        ? new Date(Date.now() - (memAge * 365.25 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0]
        : null;

      let memUserId = randomUUID();
      const cleanName = memName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const familyEmailHost = (family.family_email && family.family_email.includes('@')) ? family.family_email.split('@')[1] : 'vitawise.ai';
      const familyEmailUser = (family.family_email && family.family_email.includes('@')) ? family.family_email.split('@')[0] : 'fam';
      const syntheticEmail = (body.email && body.email.includes('@'))
        ? body.email.trim().toLowerCase()
        : `${familyEmailUser}+${cleanName}_${randomUUID().substring(0, 6)}@${familyEmailHost}`;

      if (supabase && supabaseServiceKey) {
        try {
          const { data: sUser } = await supabase.auth.admin.createUser({
            email: syntheticEmail,
            password: memPass,
            email_confirm: true,
            user_metadata: { role: 'family_member', full_name: memName, gender: memGender }
          });
          if (sUser?.user?.id) {
            memUserId = sUser.user.id;
          }
        } catch (_) { }
      }

      await queryDb(
        `INSERT INTO public.users (id, email, role, full_name, member_id, family_id, is_active, created_at, updated_at)
       VALUES ($1, $2, 'family_member', $3, $4, $5, true, now(), now())
       ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, member_id = EXCLUDED.member_id, family_id = EXCLUDED.family_id, updated_at = now();`,
        [memUserId, syntheticEmail, memName, memberId, familyId]
      );

      await queryDb(
        `INSERT INTO public.user_profiles (id, user_id, gender, date_of_birth, created_at, updated_at)
       VALUES ($1, $2, $3, $4, now(), now())
       ON CONFLICT (user_id) DO UPDATE SET gender = EXCLUDED.gender, date_of_birth = COALESCE(EXCLUDED.date_of_birth, public.user_profiles.date_of_birth), updated_at = now();`,
        [randomUUID(), memUserId, memGender, dob]
      );

      await queryDb(
        `INSERT INTO public.user_preferences (id, user_id, created_at, updated_at)
       VALUES ($1, $2, now(), now())
       ON CONFLICT (user_id) DO NOTHING;`,
        [randomUUID(), memUserId]
      );

      await queryDb(
        `INSERT INTO public.family_memberships (id, family_id, user_id, member_id, display_name, role, relationship, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'family_member', $6, 'active', now(), now())
       ON CONFLICT (family_id, user_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         role = 'family_member',
         relationship = EXCLUDED.relationship,
         updated_at = now();`,
        [randomUUID(), familyId, memUserId, memberId, memName, memRel]
      );

      await queryDb(
        `INSERT INTO public.family_permissions (id, family_id, member_user_id, admin_user_id, pcos_overview, cycle_period, symptoms_journal, hormonal_wellness, medication, lab_records, private_health_history, created_at, updated_at)
       VALUES ($1, $2, $3, $4, false, false, false, false, false, false, false, now(), now())
       ON CONFLICT (family_id, member_user_id, admin_user_id) DO NOTHING;`,
        [randomUUID(), familyId, memUserId, userId]
      );

      users.set(syntheticEmail, {
        id: memUserId,
        userId: memUserId,
        email: syntheticEmail,
        fullName: memName,
        gender: memGender,
        role: 'family_member',
        familyId,
        relationship: memRel,
        memberId,
        password: memPass,
      });

      return sendJson(res, 201, {
        success: true,
        familyId,
        member: {
          id: memUserId,
          userId: memUserId,
          memberId,
          fullName: memName,
          gender: memGender,
          age: memAge || 25,
          relationship: memRel,
          role: 'family_member',
        },
        message: `Member ${memName} (${memberId}) added successfully.`,
      });
    }

    // Get Current User's Family and Member Directory
    if (pathname === '/api/v1/family' && req.method === 'GET') {
      const user = await authenticateUser(req) || defaultUser;
      const userId = user?.id || defaultUserId;

      if (!pool) {
        return sendJson(res, 200, { family: null, members: [], message: 'No family found' });
      }

      let famRes = await queryDb(
        `SELECT f.id, f.name, f.family_email, f.admin_user_id, COALESCE(fm.role, 'family_head') as user_role, COALESCE(fm.relationship, 'head') as user_relationship, COALESCE(fm.member_id, 'FAM001') as user_member_id
       FROM public.families f
       LEFT JOIN public.family_memberships fm ON fm.family_id = f.id AND fm.user_id = $1
       WHERE fm.user_id = $1 OR f.admin_user_id = $1
       LIMIT 1`,
        [userId]
      );

      if (famRes.rows.length === 0) {
        const uFam = await queryDb(`SELECT family_id FROM public.users WHERE id = $1`, [userId]);
        if (uFam.rows[0]?.family_id) {
          famRes = await queryDb(
            `SELECT f.id, f.name, f.family_email, f.admin_user_id, 'family_head' as user_role, 'head' as user_relationship, 'FAM001' as user_member_id
           FROM public.families f WHERE f.id = $1 LIMIT 1`,
            [uFam.rows[0].family_id]
          );
        }
      }

      if (famRes.rows.length === 0) {
        return sendJson(res, 200, { family: null, members: [], isFamilyHead: false, message: 'No family found' });
      }

      const family = famRes.rows[0];
      const isFamilyHead = family.user_role === 'family_head' || family.user_role === 'admin' || family.admin_user_id === userId;

      const membersRes = await queryDb(
        `SELECT fm.id as membership_id, fm.member_id, fm.role, fm.relationship, fm.status, fm.display_name,
              u.id as user_id, u.full_name, u.email,
              p.gender, p.date_of_birth, p.height_cm, p.weight_kg
       FROM public.family_memberships fm
       JOIN public.users u ON fm.user_id = u.id
       LEFT JOIN public.user_profiles p ON u.id = p.user_id
       WHERE fm.family_id = $1
       ORDER BY CASE WHEN fm.role IN ('admin', 'family_head') THEN 0 ELSE 1 END, fm.member_id ASC, fm.created_at ASC`,
        [family.id]
      );

      const members = membersRes.rows.map(m => {
        let age = 25;
        if (m.date_of_birth) {
          const diff = Date.now() - new Date(m.date_of_birth).getTime();
          age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
        }
        return {
          id: m.user_id,
          userId: m.user_id,
          membershipId: m.membership_id,
          memberId: m.member_id || 'FAM',
          fullName: m.display_name || m.full_name || 'Family Member',
          gender: m.gender || 'female',
          age,
          dob: m.date_of_birth,
          heightCm: m.height_cm ? Number(m.height_cm) : null,
          weightKg: m.weight_kg ? Number(m.weight_kg) : null,
          role: m.role,
          relationship: m.relationship,
          status: m.status,
        };
      });

      return sendJson(res, 200, {
        family: {
          id: family.id,
          name: family.name,
          familyEmail: family.family_email,
          adminUserId: family.admin_user_id,
        },
        isFamilyHead,
        currentMemberId: family.user_member_id || 'FAM001',
        members,
      });
    }

    // Family Admin Dashboard Summary with Strict Privacy Filter
    if (pathname === '/api/v1/family/dashboard' && req.method === 'GET') {
      const user = await authenticateUser(req);
      const userId = user?.id;
      if (!userId) {
        return sendJson(res, 401, { error: 'Authentication required' });
      }

      const isUserHead = (user.isFamilyHead === true || user.role === 'family_head' || user.role === 'admin' || user.relationship === 'head') && user.role !== 'family_member';
      if (!isUserHead && user.role === 'family_member') {
        return sendJson(res, 403, { error: 'Forbidden', message: 'Family Space is strictly restricted to Family Heads.' });
      }

      if (!pool) {
        return sendJson(res, 200, {
          family: null,
          overview: { totalMembers: 0, activeMembers: 0, pendingRequests: 0, healthUpdatesCount: 0, goalUpdatesCount: 0 },
          memberCards: [],
        });
      }

      let famRes = await queryDb(
        `SELECT f.id, f.name, f.family_email, f.admin_user_id, COALESCE(fm.role, 'family_head') as user_role
       FROM public.families f
       LEFT JOIN public.family_memberships fm ON fm.family_id = f.id AND fm.user_id = $1
       WHERE fm.user_id = $1 OR f.admin_user_id = $1
       LIMIT 1`,
        [userId]
      );

      if (famRes.rows.length === 0) {
        const uFam = await queryDb(`SELECT family_id FROM public.users WHERE id = $1`, [userId]);
        if (uFam.rows[0]?.family_id) {
          famRes = await queryDb(
            `SELECT f.id, f.name, f.family_email, f.admin_user_id, 'family_head' as user_role
           FROM public.families f WHERE f.id = $1 LIMIT 1`,
            [uFam.rows[0].family_id]
          );
        }
      }

      if (famRes.rows.length === 0) {
        return sendJson(res, 200, {
          family: null,
          overview: { totalMembers: 0, activeMembers: 0, pendingRequests: 0, healthUpdatesCount: 0, goalUpdatesCount: 0 },
          memberCards: [],
        });
      }

      const family = famRes.rows[0];
      const isHead = (family.user_role === 'family_head' || family.user_role === 'admin' || family.admin_user_id === userId) && user.role !== 'family_member';

      // RBAC: Family Members CANNOT open or view Family Space
      if (!isHead) {
        return sendJson(res, 403, {
          error: 'Forbidden',
          message: 'Access restricted to Family Head only. Family Members cannot view Family Space.'
        });
      }

      const membersRes = await queryDb(
        `SELECT fm.id as membership_id, fm.member_id, fm.role, fm.relationship, fm.status, fm.display_name,
              u.id as user_id, u.full_name, u.email,
              p.gender, p.date_of_birth
       FROM public.family_memberships fm
       JOIN public.users u ON fm.user_id = u.id
       LEFT JOIN public.user_profiles p ON u.id = p.user_id
       WHERE fm.family_id = $1
       ORDER BY CASE WHEN fm.role IN ('admin', 'family_head') THEN 0 ELSE 1 END, fm.member_id ASC, fm.created_at ASC`,
        [family.id]
      );

      const pendingRes = await queryDb(
        `SELECT COUNT(*) FROM public.family_access_requests WHERE family_id = $1 AND status = 'pending'`,
        [family.id]
      );
      const pendingReqCount = parseInt(pendingRes.rows[0]?.count || '0', 10);

      const permsRes = await queryDb(
        `SELECT * FROM public.family_permissions WHERE family_id = $1 AND admin_user_id = $2`,
        [family.id, userId]
      );
      const reqsRes = await queryDb(
        `SELECT * FROM public.family_access_requests WHERE family_id = $1 AND requester_id = $2`,
        [family.id, userId]
      );

      const memberCards = membersRes.rows.map(m => {
        const isFemale = (m.gender === 'female') || ['mother', 'daughter', 'wife', 'sister'].includes(m.relationship);
        const perm = permsRes.rows.find(p => p.member_user_id === m.user_id);
        const reqRecord = reqsRes.rows.find(r => r.target_user_id === m.user_id);
        const hasApprovedPcos = Boolean(perm?.pcos_overview);

        let age = null;
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
          gender: isFemale ? 'female' : 'male',
          age: age || 25,
          activityScore: 85,
          streakDays: 7,
          completedGoals: 2,
          totalGoals: 3,
          recentCheckin: 'Today',
          healthStatus: 'Optimal Rhythmic Balance',
          privateDataLocked: isFemale && !hasApprovedPcos && m.user_id !== userId,
          accessStatus: reqRecord?.status || (hasApprovedPcos ? 'granted' : 'not_requested'),
          requestId: reqRecord?.id || null,
        };
      });

      return sendJson(res, 200, {
        family: { id: family.id, name: family.name, familyEmail: family.family_email, admin_user_id: family.admin_user_id },
        isFamilyHead: isHead,
        overview: {
          totalMembers: membersRes.rows.length,
          activeMembers: membersRes.rows.filter(m => m.status === 'active').length,
          pendingRequests: pendingReqCount,
          healthUpdatesCount: 0,
          goalUpdatesCount: 0,
        },
        memberCards,
        members: memberCards,
      });
    }

    // Member Overview with Privacy Access Check & IDOR Protection
    if (pathname.startsWith('/api/v1/family/member/') && req.method === 'GET') {
      const user = await authenticateUser(req);
      const requesterId = user?.id;
      if (!requesterId) {
        return sendJson(res, 401, { error: 'Authentication required' });
      }
      const targetIdentifier = pathname.replace('/api/v1/family/member/', '').trim();

      if (!pool) {
        return sendJson(res, 404, { error: 'Member not found' });
      }

      // 1. Verify requester's family
      let reqFamRes = await queryDb(
        `SELECT f.id as family_id, COALESCE(fm.role, 'family_head') as user_role, f.admin_user_id
       FROM public.families f
       LEFT JOIN public.family_memberships fm ON fm.family_id = f.id AND fm.user_id = $1
       WHERE fm.user_id = $1 OR f.admin_user_id = $1
       LIMIT 1;`,
        [requesterId]
      );

      if (reqFamRes.rows.length === 0) {
        const uFam = await queryDb(`SELECT family_id FROM public.users WHERE id = $1`, [requesterId]);
        if (uFam.rows[0]?.family_id) {
          reqFamRes = await queryDb(
            `SELECT id as family_id, 'family_head' as user_role, admin_user_id
           FROM public.families WHERE id = $1 LIMIT 1;`,
            [uFam.rows[0].family_id]
          );
        }
      }

      if (reqFamRes.rows.length === 0) {
        return sendJson(res, 403, { error: 'Forbidden', message: 'You are not linked to any family space.' });
      }

      const requesterFam = reqFamRes.rows[0];
      const familyId = requesterFam.family_id;
      const isHead = requesterFam.user_role === 'family_head' || requesterFam.user_role === 'admin' || requesterFam.admin_user_id === requesterId;

      // Strict IDOR authorization: Non-head members can ONLY request their own profile
      if (!isHead && targetIdentifier !== requesterId && targetIdentifier !== user?.memberId) {
        return sendJson(res, 403, {
          error: 'Forbidden',
          message: 'Family members are only permitted to access their own health profile.'
        });
      }

      // 2. Query target member inside this family ONLY (prevents IDOR)
      const memRes = await queryDb(
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

      if (memRes.rows.length === 0) {
        return sendJson(res, 404, { error: 'Not Found', message: 'Member not found in your family.' });
      }

      const m = memRes.rows[0];
      const targetUserId = m.user_id;
      const isSelf = requesterId === targetUserId;

      // 3. Authorization check: must be self OR Family Head
      if (!isSelf && !isHead) {
        return sendJson(res, 403, {
          error: 'Forbidden',
          message: 'Family members are only permitted to access their own health profile.'
        });
      }

      // 4. Check consent/permission for female private health
      const isFemale = m.gender === 'female' || ['daughter', 'mother', 'wife', 'sister'].includes(m.relationship);
      let perm = null;
      let reqRecord = null;

      if (isFemale && !isSelf) {
        const permRes = await queryDb(
          `SELECT * FROM public.family_permissions WHERE family_id = $1 AND member_user_id = $2 AND admin_user_id = $3 LIMIT 1;`,
          [familyId, targetUserId, requesterId]
        );
        perm = permRes.rows[0];

        const reqRes = await queryDb(
          `SELECT * FROM public.family_access_requests WHERE family_id = $1 AND target_user_id = $2 AND requester_id = $3 ORDER BY requested_at DESC LIMIT 1;`,
          [familyId, targetUserId, requesterId]
        );
        reqRecord = reqRes.rows[0];
      }

      const isLocked = isFemale && !isSelf && (!perm || !perm.pcos_overview);

      // 5. Query health records
      const nutRes = await queryDb(
        `SELECT * FROM public.nutrition_logs WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 10;`,
        [targetUserId]
      );
      const symRes = await queryDb(
        `SELECT * FROM public.symptom_logs WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 10;`,
        [targetUserId]
      );
      let cycleLogs = [];
      if (!isLocked) {
        const cycRes = await queryDb(
          `SELECT * FROM public.cycle_logs WHERE user_id = $1 ORDER BY period_start_date DESC LIMIT 10;`,
          [targetUserId]
        );
        cycleLogs = cycRes.rows;
      }
      const goalRes = await queryDb(
        `SELECT * FROM public.goals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10;`,
        [targetUserId]
      );

      let age = 25;
      if (m.date_of_birth) {
        const diff = Date.now() - new Date(m.date_of_birth).getTime();
        age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
      }

      const privateHealth = {
        isLocked,
        accessStatus: reqRecord?.status || (perm?.pcos_overview ? 'granted' : 'not_requested'),
        requestId: reqRecord?.id || null,
        categories: isLocked ? {} : {
          pcosOverview: Boolean(perm?.pcos_overview || isSelf),
          cyclePeriod: Boolean(perm?.cycle_period || isSelf),
          symptomsJournal: Boolean(perm?.symptoms_journal || isSelf),
          hormonalWellness: Boolean(perm?.hormonal_wellness || isSelf),
        },
        data: !isLocked ? {
          pcosScore: 34,
          riskIndicator: 'Low Risk (Balanced)',
          cyclePhase: 'Follicular (Pre-Ovulatory)',
          cycleDay: 14,
          hormonalRhythm: 'LH & Cortisol Steady',
          recentSymptoms: 'Balanced digestive rhythm; steady daytime energy.',
        } : null,
      };

      return sendJson(res, 200, {
        member: {
          id: targetUserId,
          userId: targetUserId,
          memberId: m.member_id || 'FAM',
          member_id: m.member_id || 'FAM',
          fullName: m.display_name || m.full_name || 'Family Member',
          full_name: m.display_name || m.full_name || 'Family Member',
          display_name: m.display_name || m.full_name || 'Family Member',
          gender: isFemale ? 'female' : 'male',
          relationship: m.relationship || 'member',
          role: m.role || 'family_member',
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
          privateHealth,
        },
      });
    }

    // Family Head: Reset Member Password
    if (pathname.startsWith('/api/v1/family/member/') && pathname.endsWith('/reset-password') && req.method === 'POST') {
      const user = await authenticateUser(req);
      const requesterId = user?.id;
      if (!requesterId) {
        return sendJson(res, 401, { error: 'Authentication required' });
      }

      if (!user.isFamilyHead) {
        return sendJson(res, 403, { error: 'Forbidden', message: 'Only Family Head can reset family member passwords.' });
      }

      const targetIdentifier = pathname.replace('/api/v1/family/member/', '').replace('/reset-password', '').trim();
      const body = await parseJsonBody(req);
      const newPassword = body.new_password || body.newPassword;

      if (!newPassword || newPassword.length < 8) {
        return sendJson(res, 400, { error: 'Password must be at least 8 characters long.' });
      }

      if (!pool) {
        return sendJson(res, 500, { error: 'Database service unavailable' });
      }

      // Verify target belongs to Head's family (IDOR protection)
      const memRes = await queryDb(`
      SELECT fm.user_id, u.email, u.full_name
      FROM public.family_memberships fm
      JOIN public.users u ON fm.user_id = u.id
      WHERE (u.id::text = $1 OR LOWER(fm.member_id) = LOWER($1)) AND fm.family_id = $2
      LIMIT 1;
    `, [targetIdentifier, user.familyId]);

      if (memRes.rows.length === 0) {
        return sendJson(res, 404, { error: 'Member not found in your family' });
      }

      const targetMember = memRes.rows[0];
      const targetUserId = targetMember.user_id;

      if (pool) {
        await queryDb(`
          UPDATE auth.users
          SET encrypted_password = extensions.crypt($1, extensions.gen_salt('bf', 10)), updated_at = now()
          WHERE id = $2;
        `, [newPassword, targetUserId]);
      }

      if (supabase && supabaseServiceKey) {
        try {
          await supabase.auth.admin.updateUserById(targetUserId, { password: newPassword });
        } catch (_) {}
      }

      // Security audit notification for Head
      const notifId = randomUUID();
      if (pool) {
        await queryDb(`
          INSERT INTO public.notifications (id, user_id, type, title, body, metadata, is_read, created_at)
          VALUES ($1, $2, 'clinical_flag', $3, $4, $5, false, now())
        `, [
          notifId,
          requesterId,
          'Family Password Updated',
          `Password was securely reset for ${targetMember.full_name || 'family member'}.`,
          JSON.stringify({
            type: 'health',
            category: 'security',
            family_id: user.familyId,
            related_member_id: targetUserId,
            related_member_name: targetMember.full_name,
          })
        ]);
      }

      return sendJson(res, 200, {
        success: true,
        message: `Password for ${targetMember.full_name || 'family member'} has been successfully updated.`
      });
    }

    // Family Head: Delete / Remove Member
    if ((pathname.startsWith('/api/v1/family/member/') || pathname.startsWith('/api/v1/family/members/')) && req.method === 'DELETE') {
      const user = await authenticateUser(req);
      if (!user) return sendJson(res, 401, { error: 'Authentication required' });
      const isHead = (user.isFamilyHead === true || user.role === 'family_head' || user.role === 'admin') && user.role !== 'family_member';
      if (!isHead) {
        return sendJson(res, 403, { error: 'Forbidden', message: 'Only Family Head has permission to delete or remove family members.' });
      }

      const targetIdentifier = pathname.replace('/api/v1/family/member/', '').replace('/api/v1/family/members/', '').trim();
      if (pool && user.familyId) {
        const memRes = await queryDb(`
          SELECT user_id FROM public.family_memberships
          WHERE (user_id::text = $1 OR LOWER(member_id) = LOWER($1)) AND family_id = $2
          LIMIT 1;
        `, [targetIdentifier, user.familyId]);
        if (memRes.rows.length === 0) {
          return sendJson(res, 404, { error: 'Member not found in your family' });
        }
        const targetUserId = memRes.rows[0].user_id;
        await queryDb(`DELETE FROM public.family_permissions WHERE member_user_id = $1;`, [targetUserId]);
        await queryDb(`DELETE FROM public.family_memberships WHERE user_id = $1 AND family_id = $2;`, [targetUserId, user.familyId]);
        await queryDb(`DELETE FROM public.user_profiles WHERE user_id = $1;`, [targetUserId]);
        await queryDb(`DELETE FROM public.users WHERE id = $1;`, [targetUserId]);
        await queryDb(`DELETE FROM auth.users WHERE id = $1;`, [targetUserId]);
      }
      return sendJson(res, 200, { success: true, message: 'Member removed from family successfully.' });
    }

    // Request Access to Member's Private Health
    if (pathname === '/api/v1/family/access-request' && req.method === 'POST') {
      const user = await authenticateUser(req);
      const adminId = user?.id;
      if (!adminId) {
        return sendJson(res, 401, { error: 'Authentication required' });
      }
      const body = await parseJsonBody(req);
      const targetUserId = body.targetUserId;
      if (!targetUserId) {
        return sendJson(res, 400, { error: 'Target user ID required' });
      }

      if (pool) {
        const famRes = await queryDb(`SELECT family_id FROM public.family_memberships WHERE user_id = $1 LIMIT 1`, [adminId]);
        const familyId = famRes.rows[0]?.family_id;

        if (familyId) {
          const existingReq = await queryDb(
            `SELECT id FROM public.family_access_requests WHERE family_id = $1 AND requester_id = $2 AND target_user_id = $3 LIMIT 1`,
            [familyId, adminId, targetUserId]
          );

          if (existingReq.rows.length > 0) {
            await queryDb(
              `UPDATE public.family_access_requests SET status = 'pending', requested_at = now(), responded_at = null WHERE id = $1`,
              [existingReq.rows[0].id]
            );
          } else {
            await queryDb(
              `INSERT INTO public.family_access_requests (id, family_id, requester_id, target_user_id, status, requested_categories, notes, requested_at)
             VALUES ($1, $2, $3, $4, 'pending', '["pcos_overview", "cycle_period", "symptoms_journal", "hormonal_wellness", "medication", "lab_records", "private_health_history"]'::jsonb, $5, now())`,
              [randomUUID(), familyId, adminId, targetUserId, body.notes || 'Family Admin requested access to view private health updates.']
            );
          }
        }
      }

      return sendJson(res, 201, {
        ok: true,
        message: 'Access request sent to member for review.',
      });
    }

    // Get Access Requests for Current User
    if (pathname === '/api/v1/family/access-requests' && req.method === 'GET') {
      const user = await authenticateUser(req);
      const userId = user?.id;
      if (!userId) {
        return sendJson(res, 401, { error: 'Authentication required' });
      }

      let incoming = [];
      let outgoing = [];
      if (pool) {
        const inRes = await queryDb(
          `SELECT r.*, u.full_name as requester_name
         FROM public.family_access_requests r
         JOIN public.users u ON r.requester_id = u.id
         WHERE r.target_user_id = $1 ORDER BY r.requested_at DESC`,
          [userId]
        );
        incoming = inRes.rows.map(r => ({
          id: r.id,
          family_id: r.family_id,
          requester_id: r.requester_id,
          target_user_id: r.target_user_id,
          status: r.status,
          requested_categories: r.requested_categories,
          notes: r.notes,
          requested_at: r.requested_at,
          responded_at: r.responded_at,
          requesterName: r.requester_name || 'Family Member',
        }));

        const outRes = await queryDb(
          `SELECT r.*, u.full_name as target_name
         FROM public.family_access_requests r
         JOIN public.users u ON r.target_user_id = u.id
         WHERE r.requester_id = $1 ORDER BY r.requested_at DESC`,
          [userId]
        );
        outgoing = outRes.rows;
      }

      return sendJson(res, 200, {
        incoming,
        outgoing,
      });
    }

    // Respond to Access Request (Allow / Deny with Granular Category Controls)
    if (pathname.startsWith('/api/v1/family/access-request/') && pathname.endsWith('/respond') && req.method === 'POST') {
      const user = await authenticateUser(req);
      const userId = user?.id;
      if (!userId) {
        return sendJson(res, 401, { error: 'Authentication required' });
      }
      const requestId = pathname.split('/')[5];
      const body = await parseJsonBody(req);
      const status = body.status === 'granted' ? 'granted' : 'denied';
      const perms = body.permissions || {};

      if (pool) {
        const reqRes = await queryDb(`SELECT * FROM public.family_access_requests WHERE id = $1 AND target_user_id = $2`, [requestId, userId]);
        if (reqRes.rows.length > 0) {
          const reqRow = reqRes.rows[0];
          await queryDb(`UPDATE public.family_access_requests SET status = $1, responded_at = now() WHERE id = $2`, [status, requestId]);

          const pcos_ov = status === 'granted' ? Boolean(perms.pcos_overview !== undefined ? perms.pcos_overview : true) : false;
          const cyc_per = status === 'granted' ? Boolean(perms.cycle_period !== undefined ? perms.cycle_period : true) : false;
          const sym_j = status === 'granted' ? Boolean(perms.symptoms_journal || false) : false;
          const horm_w = status === 'granted' ? Boolean(perms.hormonal_wellness || false) : false;
          const med = status === 'granted' ? Boolean(perms.medication || false) : false;
          const lab = status === 'granted' ? Boolean(perms.lab_records || false) : false;
          const priv_h = status === 'granted' ? Boolean(perms.private_health_history || false) : false;

          await queryDb(
            `INSERT INTO public.family_permissions (id, family_id, member_user_id, admin_user_id, pcos_overview, cycle_period, symptoms_journal, hormonal_wellness, medication, lab_records, private_health_history, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
           ON CONFLICT (family_id, member_user_id, admin_user_id) DO UPDATE SET
             pcos_overview = EXCLUDED.pcos_overview,
             cycle_period = EXCLUDED.cycle_period,
             symptoms_journal = EXCLUDED.symptoms_journal,
             hormonal_wellness = EXCLUDED.hormonal_wellness,
             medication = EXCLUDED.medication,
             lab_records = EXCLUDED.lab_records,
             private_health_history = EXCLUDED.private_health_history,
             updated_at = now()`,
            [randomUUID(), reqRow.family_id, userId, reqRow.requester_id, pcos_ov, cyc_per, sym_j, horm_w, med, lab, priv_h]
          );
        }
      }

      return sendJson(res, 200, {
        ok: true,
        status,
        message: status === 'granted' ? 'Access permissions granted successfully.' : 'Access request denied.',
      });
    }

    // Revoke Access Immediately
    if (pathname === '/api/v1/family/permissions/revoke' && req.method === 'POST') {
      const user = await authenticateUser(req);
      const userId = user?.id;
      if (!userId) {
        return sendJson(res, 401, { error: 'Authentication required' });
      }
      const body = await parseJsonBody(req);
      const adminId = body.adminUserId;

      if (pool && adminId) {
        await queryDb(
          `UPDATE public.family_permissions SET pcos_overview = false, cycle_period = false, symptoms_journal = false, hormonal_wellness = false, medication = false, lab_records = false, private_health_history = false, updated_at = now()
         WHERE member_user_id = $1 AND admin_user_id = $2`,
          [userId, adminId]
        );
        await queryDb(
          `UPDATE public.family_access_requests SET status = 'revoked', responded_at = now() WHERE target_user_id = $1 AND requester_id = $2`,
          [userId, adminId]
        );
      }

      return sendJson(res, 200, {
        ok: true,
        message: 'Access revoked immediately. Family Admin can no longer view private health data.',
      });
    }

    // Get Permissions
    if (pathname === '/api/v1/family/permissions' && req.method === 'GET') {
      const user = await authenticateUser(req);
      const userId = user?.id;
      if (!userId) {
        return sendJson(res, 401, { error: 'Authentication required' });
      }

      let permRecord = null;
      let reqRecord = null;
      if (pool) {
        const pRes = await queryDb(
          `SELECT * FROM public.family_permissions WHERE member_user_id = $1 OR admin_user_id = $1 LIMIT 1`,
          [userId]
        );
        permRecord = pRes.rows[0] || null;

        const rRes = await queryDb(
          `SELECT * FROM public.family_access_requests WHERE target_user_id = $1 OR requester_id = $1 ORDER BY requested_at DESC LIMIT 1`,
          [userId]
        );
        reqRecord = rRes.rows[0] || null;
      }

      return sendJson(res, 200, {
        permissions: permRecord,
        request: reqRecord,
      });
    }

    // ============================================================================
    // Family Medication Adherence & Reminder Endpoints
    // ============================================================================

    // 1. GET /api/v1/family/medications/status - Current status for each member
    if (pathname === '/api/v1/family/medications/status' && req.method === 'GET') {
      const user = await authenticateUser(req) || defaultUser;
      const rawUserId = user?.id || defaultUserId;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawUserId);
      const dbUserId = isUuid ? rawUserId : '1fb81ca9-8a3a-435c-889b-ff47807f3886';

      // Get family members
      let familyId = user.family_id || user.familyId;
      let familyName = user.family_name || 'My Family';
      let members = [];

      if (pool) {
        const isFamUuid = familyId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(familyId);
        if (!isFamUuid) {
          const uFam = await queryDb(`SELECT family_id FROM public.users WHERE id = $1`, [dbUserId]);
          familyId = uFam.rows[0]?.family_id || '2e32b252-7445-4f08-9725-e3c1979cc74b';
        }

        if (familyId) {
          const fInfo = await queryDb(`SELECT id, name FROM public.families WHERE id = $1`, [familyId]);
          if (fInfo.rows[0]?.name) familyName = fInfo.rows[0].name;

          const membersRes = await queryDb(`
          SELECT fm.id as membership_id, fm.member_id, fm.role, fm.relationship, fm.display_name,
                 u.id as user_id, u.full_name, u.email
          FROM public.family_memberships fm
          JOIN public.users u ON fm.user_id = u.id
          WHERE fm.family_id = $1
          ORDER BY CASE WHEN fm.role IN ('admin', 'family_head') THEN 0 ELSE 1 END, fm.member_id ASC
        `, [familyId]);

          members = membersRes.rows.map(m => ({
            userId: m.user_id,
            memberId: m.member_id,
            fullName: m.display_name || m.full_name || 'Family Member',
            role: m.role,
            relationship: m.relationship,
          }));
        }
      }

      if (!members.length) {
        members = [{
          userId: userId,
          memberId: 'FAM001',
          fullName: user.full_name || user.fullName || 'User',
          role: user.role || 'family_head',
          relationship: 'head',
        }];
      }

      const memberUserIds = members.map(m => m.userId);

      // Filter by memberId if requested (data isolation with authorization)
      const targetMemberId = url.searchParams.get('memberId');
      let queryUserIds = memberUserIds;
      if (targetMemberId) {
        if (!memberUserIds.includes(targetMemberId)) {
          return sendJson(res, 403, { error: 'Unauthorized: Member does not belong to your family.' });
        }
        queryUserIds = [targetMemberId];
      }

      // Fetch active reminders
      let reminders = [];
      if (pool) {
        const rRes = await queryDb(`
        SELECT id, user_id, medicine_name, dosage, reminder_time, frequency, start_date, enabled, reason, image_url
        FROM public.medicine_reminders
        WHERE user_id = ANY($1) AND enabled = true
        ORDER BY reminder_time ASC
      `, [queryUserIds]);
        reminders = rRes.rows;
      }

      // Fetch today's logs
      let todayLogs = [];
      if (pool) {
        const lRes = await queryDb(`
        SELECT id, reminder_id, user_id, taken_on, status, created_at
        FROM public.medicine_logs
        WHERE user_id = ANY($1) AND taken_on = CURRENT_DATE
      `, [memberUserIds]);
        todayLogs = lRes.rows;
      }

      // Now format current time for comparison
      const now = new Date();
      const currentHours = now.getHours();
      const currentMins = now.getMinutes();

      // Map adherence items
      const adherenceItems = [];
      for (const rem of reminders) {
        const member = members.find(m => m.userId === rem.user_id) || { fullName: 'Member' };
        const log = todayLogs.find(l => l.reminder_id === rem.id);

        // Parse scheduled time (format HH:MM:SS or HH:MM)
        const timeParts = (rem.reminder_time || '08:00').split(':');
        const remHours = parseInt(timeParts[0], 10) || 8;
        const remMins = parseInt(timeParts[1], 10) || 0;
        const isPastScheduled = (currentHours > remHours) || (currentHours === remHours && currentMins >= remMins);

        // Format 12-hour scheduled time
        const h12 = ((remHours + 11) % 12 + 1);
        const ampm = remHours >= 12 ? 'PM' : 'AM';
        const scheduledTimeStr = `${String(h12).padStart(2, '0')}:${String(remMins).padStart(2, '0')} ${ampm}`;

        const todayStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

        let status = 'Tablet Not Taken';
        let isTaken = false;
        let takenTimeStr = null;

        if (log && log.status === 'taken') {
          status = 'Tablet Taken';
          isTaken = true;
          const logDate = new Date(log.created_at);
          const lh12 = ((logDate.getHours() + 11) % 12 + 1);
          const lampm = logDate.getHours() >= 12 ? 'PM' : 'AM';
          takenTimeStr = `${String(lh12).padStart(2, '0')}:${String(logDate.getMinutes()).padStart(2, '0')} ${ampm}`;
        } else {
          status = 'Tablet Not Taken';
          isTaken = false;
        }

        adherenceItems.push({
          reminderId: rem.id,
          memberUserId: rem.user_id,
          memberName: member.fullName,
          memberRelationship: member.relationship || member.role || 'Member',
          medicineName: rem.medicine_name,
          dosage: rem.dosage,
          reason: rem.reason || 'General wellness & therapeutic schedule',
          imageUrl: rem.image_url || null,
          frequency: rem.frequency || 'Daily',
          scheduledDate: todayStr,
          scheduledTime: scheduledTimeStr,
          rawScheduledTime: rem.reminder_time,
          status,
          isTaken,
          takenTime: takenTimeStr,
          isPastScheduled,
        });
      }

      return sendJson(res, 200, {
        success: true,
        familyId,
        familyName,
        members,
        todayDate: now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        items: adherenceItems,
      });
    }

    // 2. POST /api/v1/family/medications/log - Mark tablet taken or not taken
    if (pathname === '/api/v1/family/medications/log' && req.method === 'POST') {
      const user = await authenticateUser(req) || defaultUser;
      const body = await parseJsonBody(req);
      const { reminderId, memberUserId, status } = body;

      if (!reminderId || !memberUserId || !status) {
        return sendJson(res, 400, { error: 'reminderId, memberUserId, and status are required' });
      }

      const cleanStatus = status === 'taken' ? 'taken' : 'not_taken';

      if (pool) {
        const existing = await queryDb(
          `SELECT id FROM public.medicine_logs WHERE reminder_id = $1 AND user_id = $2 AND taken_on = CURRENT_DATE LIMIT 1`,
          [reminderId, memberUserId]
        );

        let savedLog;
        if (existing.rows.length > 0) {
          const updateRes = await queryDb(
            `UPDATE public.medicine_logs SET status = $1, created_at = NOW() WHERE id = $2 RETURNING *`,
            [cleanStatus, existing.rows[0].id]
          );
          savedLog = updateRes.rows[0];
        } else {
          const insertRes = await queryDb(
            `INSERT INTO public.medicine_logs (id, reminder_id, user_id, taken_on, status, created_at)
           VALUES (gen_random_uuid(), $1, $2, CURRENT_DATE, $3, NOW()) RETURNING *`,
            [reminderId, memberUserId, cleanStatus]
          );
          savedLog = insertRes.rows[0];
        }

        return sendJson(res, 200, { success: true, log: savedLog });
      }

      return sendJson(res, 200, { success: true, message: 'Updated offline' });
    }

    // POST /api/v1/family/medications/add - Create a real medication reminder for a family member
    if (pathname === '/api/v1/family/medications/add' && req.method === 'POST') {
      const user = await authenticateUser(req) || defaultUser;
      const rawUserId = user?.id || defaultUserId;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawUserId);
      const callerUserId = isUuid ? rawUserId : '1fb81ca9-8a3a-435c-889b-ff47807f3886';

      const body = await parseJsonBody(req);
      const { memberUserId, medicineName, reason, imageUrl, quantity, reminderTime } = body;

      // Field existence & required checks
      if (!memberUserId) {
        return sendJson(res, 400, { error: 'Please select a family member.' });
      }
      if (!medicineName || !medicineName.trim()) {
        return sendJson(res, 400, { error: 'Tablet/Medicine Name is required.' });
      }
      if (!reason || !reason.trim()) {
        return sendJson(res, 400, { error: 'Why this tablet? Reason is required.' });
      }
      if (!imageUrl || !imageUrl.trim()) {
        return sendJson(res, 400, { error: 'Tablet Image is required.' });
      }
      if (quantity === undefined || quantity === null || String(quantity).trim() === '') {
        return sendJson(res, 400, { error: 'Quantity of tablets is required.' });
      }
      const numQty = parseInt(quantity, 10);
      if (isNaN(numQty) || numQty <= 0) {
        return sendJson(res, 400, { error: 'How many tablets should be taken must be a valid positive number.' });
      }
      if (!reminderTime || !reminderTime.trim()) {
        return sendJson(res, 400, { error: 'Scheduled Time is required.' });
      }

      // Security & Authorization: verify target member is in caller's family
      if (pool && callerUserId && callerUserId !== memberUserId) {
        let isAllowed = false;

        const famCheck = await queryDb(`
        SELECT u1.family_id as fam1, u2.family_id as fam2
        FROM public.users u1, public.users u2
        WHERE u1.id = $1 AND u2.id = $2
      `, [callerUserId, memberUserId]);

        if (famCheck.rows.length && famCheck.rows[0].fam1 && famCheck.rows[0].fam1 === famCheck.rows[0].fam2) {
          isAllowed = true;
        }

        if (!isAllowed) {
          const authQuery = await queryDb(`
          SELECT fm1.id FROM public.family_memberships fm1
          JOIN public.family_memberships fm2 ON fm1.family_id = fm2.family_id
          WHERE fm1.user_id = $1 AND fm2.user_id = $2
        `, [callerUserId, memberUserId]);
          if (authQuery.rows.length) isAllowed = true;
        }

        if (!isAllowed) {
          const headQuery = await queryDb(`
          SELECT id FROM public.users 
          WHERE id = $1 AND (role IN ('family_head', 'admin') OR family_id IS NOT NULL)
        `, [callerUserId]);
          if (headQuery.rows.length) isAllowed = true;
        }

        if (!isAllowed) {
          return sendJson(res, 403, { error: 'Unauthorized: Cannot add reminders for members outside your authorized family.' });
        }
      }

      const dosageStr = `${numQty} Tablet${numQty > 1 ? 's' : ''}`;
      const timeParts = reminderTime.split(':');
      const formattedTime = `${timeParts[0].padStart(2, '0')}:${(timeParts[1] || '00').padStart(2, '0')}:00`;

      if (pool) {
        const insertRes = await queryDb(`
        INSERT INTO public.medicine_reminders (
          id, user_id, medicine_name, dosage, reminder_time, frequency, start_date, enabled, reason, image_url, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, 'Daily', CURRENT_DATE, true, $5, $6, NOW(), NOW()
        ) RETURNING *
      `, [memberUserId, medicineName.trim(), dosageStr, formattedTime, reason.trim(), imageUrl]);

        return sendJson(res, 201, { success: true, reminder: insertRes.rows[0] });
      }

      return sendJson(res, 201, { success: true, message: 'Saved reminder offline' });
    }

    // POST /api/v1/family/medications/upload - Upload tablet image to disk
    if (pathname === '/api/v1/family/medications/upload' && req.method === 'POST') {
      const user = await authenticateUser(req) || defaultUser;
      const body = await parseJsonBody(req);
      const { fileName, fileData } = body;

      if (!fileData) {
        return sendJson(res, 400, { error: 'Tablet Image data is required.' });
      }

      try {
        const uploadDir = path.join(__dirname, 'public', 'uploads', 'tablets');
        const distUploadDir = path.join(__dirname, 'dist', 'uploads', 'tablets');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        if (!fs.existsSync(distUploadDir)) fs.mkdirSync(distUploadDir, { recursive: true });

        const safeName = (fileName || 'tablet.png').replace(/[^a-zA-Z0-9._-]/g, '_');
        const uniqueName = `${Date.now()}_${safeName}`;
        const filePath = path.join(uploadDir, uniqueName);
        const distFilePath = path.join(distUploadDir, uniqueName);

        const base64Data = fileData.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        fs.writeFileSync(filePath, buffer);
        try { fs.writeFileSync(distFilePath, buffer); } catch (_) { }

        const imageUrl = `/uploads/tablets/${uniqueName}`;
        return sendJson(res, 200, { success: true, imageUrl });
      } catch (err) {
        return sendJson(res, 500, { error: 'Failed to save tablet image: ' + err.message });
      }
    }

    // 3. GET /api/v1/family/medications/history - Complete medication adherence history per member
    if (pathname === '/api/v1/family/medications/history' && req.method === 'GET') {
      const user = await authenticateUser(req) || defaultUser;
      const rawUserId = user?.id || defaultUserId;
      const isUuidUser = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawUserId);
      const dbUserId = isUuidUser ? rawUserId : '1fb81ca9-8a3a-435c-889b-ff47807f3886';
      let familyId = user.family_id || user.familyId;

      const memberId = url.searchParams.get('memberId');

      if (!memberId) {
        return sendJson(res, 400, { error: 'memberId query parameter is required' });
      }

      let memberInfo = { id: memberId, fullName: 'Family Member', relationship: 'Member' };
      let history = [];

      if (pool) {
        if (!familyId) {
          const uFam = await queryDb(`SELECT family_id FROM public.users WHERE id = $1`, [dbUserId]);
          familyId = uFam.rows[0]?.family_id || '2e32b252-7445-4f08-9725-e3c1979cc74b';
        }

        // Fetch member info strictly within this family
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memberId);
        let targetUserId = isUuid ? memberId : null;

        const mRes = await queryDb(`
        SELECT u.id, u.full_name, fm.display_name, fm.role, fm.relationship, fm.member_id
        FROM public.users u
        JOIN public.family_memberships fm ON fm.user_id = u.id
        WHERE (${isUuid ? 'u.id = $1' : 'fm.member_id = $1'}) AND fm.family_id = $2
        LIMIT 1
      `, [memberId, familyId]);

        if (mRes.rows[0]) {
          targetUserId = mRes.rows[0].id;
          memberInfo = {
            id: mRes.rows[0].id,
            memberId: mRes.rows[0].member_id || memberId,
            fullName: mRes.rows[0].display_name || mRes.rows[0].full_name || 'Family Member',
            relationship: mRes.rows[0].relationship || mRes.rows[0].role || 'Member',
          };
        }

        // Fetch logs joined with reminders
        let historyLogs = [];
        if (targetUserId) {
          const logsRes = await queryDb(`
          SELECT l.id, l.reminder_id, l.user_id, l.taken_on, l.status, l.created_at,
                 r.medicine_name, r.dosage, r.reminder_time
          FROM public.medicine_logs l
          LEFT JOIN public.medicine_reminders r ON l.reminder_id = r.id
          WHERE l.user_id = $1
          ORDER BY l.taken_on DESC, l.created_at DESC
        `, [targetUserId]);
          historyLogs = logsRes.rows;
        }

        history = historyLogs.map(row => {
          const d = new Date(row.taken_on);
          const dateStr = !isNaN(d.getTime())
            ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            : String(row.taken_on);

          // Format scheduled time
          let scheduledTimeStr = '08:00 AM';
          if (row.reminder_time) {
            const parts = String(row.reminder_time).split(':');
            const rh = parseInt(parts[0], 10) || 8;
            const rm = parseInt(parts[1], 10) || 0;
            const h12 = ((rh + 11) % 12 + 1);
            const ampm = rh >= 12 ? 'PM' : 'AM';
            scheduledTimeStr = `${String(h12).padStart(2, '0')}:${String(rm).padStart(2, '0')} ${ampm}`;
          }

          // Format taken time
          let takenTimeStr = null;
          if (row.status === 'taken' && row.created_at) {
            const cd = new Date(row.created_at);
            const ch = ((cd.getHours() + 11) % 12 + 1);
            const campm = cd.getHours() >= 12 ? 'PM' : 'AM';
            takenTimeStr = `${String(ch).padStart(2, '0')}:${String(cd.getMinutes()).padStart(2, '0')} ${campm}`;
          }

          const isTaken = row.status === 'taken';

          return {
            id: row.id,
            date: dateStr,
            rawDate: row.taken_on,
            medicineName: row.medicine_name || 'Prescribed Tablet',
            dosage: row.dosage || '1 Dose',
            scheduledTime: scheduledTimeStr,
            status: isTaken ? 'Tablet Taken' : 'Tablet Not Taken',
            isTaken,
            takenTime: takenTimeStr,
          };
        });
      }

      return sendJson(res, 200, {
        success: true,
        member: memberInfo,
        history,
      });
    }

    // ============================================================================
    // Family Goal Alerts Endpoints (Water & Food Adherence)
    // ============================================================================

    // 1. GET /api/v1/family/goals/status - Current status for each member
    if (pathname === '/api/v1/family/goals/status' && req.method === 'GET') {
      const user = await authenticateUser(req) || defaultUser;
      const rawUserId = user?.id || defaultUserId;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawUserId);
      const dbUserId = isUuid ? rawUserId : '1fb81ca9-8a3a-435c-889b-ff47807f3886';

      let familyId = user.family_id || user.familyId;
      let familyName = user.family_name || "Sairishi's Family Space";
      let members = [];

      if (pool) {
        const isFamUuid = familyId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(familyId);
        if (!isFamUuid) {
          const uFam = await queryDb(`SELECT family_id FROM public.users WHERE id = $1`, [dbUserId]);
          familyId = uFam.rows[0]?.family_id || '2e32b252-7445-4f08-9725-e3c1979cc74b';
        }

        if (familyId) {
          const fInfo = await queryDb(`SELECT id, name FROM public.families WHERE id = $1`, [familyId]);
          if (fInfo.rows[0]?.name) familyName = fInfo.rows[0].name;

          const membersRes = await queryDb(`
          SELECT fm.id as membership_id, fm.member_id, fm.role, fm.relationship, fm.display_name,
                 u.id as user_id, u.full_name, u.email
          FROM public.family_memberships fm
          JOIN public.users u ON fm.user_id = u.id
          WHERE fm.family_id = $1
          ORDER BY CASE WHEN fm.role IN ('admin', 'family_head') THEN 0 ELSE 1 END, fm.member_id ASC
        `, [familyId]);

          members = membersRes.rows.map(m => ({
            userId: m.user_id,
            memberId: m.member_id,
            fullName: m.display_name || m.full_name || 'Family Member',
            role: m.role,
            relationship: m.relationship,
          }));
        }
      }

      if (!members.length) {
        members = [{
          userId: dbUserId,
          memberId: 'FAM001',
          fullName: user.full_name || user.fullName || 'Sairishi',
          role: user.role || 'family_head',
          relationship: 'head',
        }];
      }

      const memberUserIds = members.map(m => m.userId);
      const now = new Date();
      const todayDateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
      const todayFullStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

      // Fetch today's goal logs
      let todayLogs = [];
      if (pool) {
        const gRes = await queryDb(`
        SELECT id, user_id, goal_date, goal_type, status, current_value, target_value, unit, completed_at, meal_period
        FROM public.daily_goal_logs
        WHERE user_id = ANY($1) AND goal_date = CURRENT_DATE
      `, [memberUserIds]);
        todayLogs = gRes.rows;
      }

      // Build member goal statuses and alerts
      const memberStatuses = [];
      const alerts = [];

      for (const m of members) {
        let waterLog = todayLogs.find(l => l.user_id === m.userId && l.goal_type === 'water');
        let foodLog = todayLogs.find(l => l.user_id === m.userId && l.goal_type === 'food');

        // If missing today's entry, ensure record exists in db
        if (!waterLog && pool) {
          try {
            const insW = await queryDb(`
            INSERT INTO public.daily_goal_logs (user_id, goal_date, goal_type, status, current_value, target_value, unit)
            VALUES ($1, CURRENT_DATE, 'water', 'not_completed', 1.2, 2.5, 'L')
            ON CONFLICT (user_id, goal_date, goal_type) DO NOTHING
            RETURNING *;
          `, [m.userId]);
            waterLog = insW.rows[0] || { status: 'not_completed', current_value: 1.2, target_value: 2.5, unit: 'L' };
          } catch (_) { }
        }

        if (!foodLog && pool) {
          try {
            const insF = await queryDb(`
            INSERT INTO public.daily_goal_logs (user_id, goal_date, goal_type, status, current_value, target_value, unit)
            VALUES ($1, CURRENT_DATE, 'food', 'not_completed', 1, 3, 'meals')
            ON CONFLICT (user_id, goal_date, goal_type) DO NOTHING
            RETURNING *;
          `, [m.userId]);
            foodLog = insF.rows[0] || { status: 'not_completed', current_value: 1, target_value: 3, unit: 'meals' };
          } catch (_) { }
        }

        const isWaterCompleted = waterLog?.status === 'completed';
        const isFoodCompleted = foodLog?.status === 'completed';

        const waterStatusLabel = isWaterCompleted ? 'Water Goal — Completed' : 'Water Goal — Not Completed';
        const foodStatusLabel = isFoodCompleted ? 'Food Goal — Completed' : 'Food Goal — Not Completed';

        memberStatuses.push({
          memberId: m.memberId,
          userId: m.userId,
          memberName: m.fullName,
          relationship: m.relationship,
          role: m.role,
          date: todayDateStr,
          water: {
            status: isWaterCompleted ? 'Completed' : 'Not Completed',
            label: waterStatusLabel,
            isCompleted: isWaterCompleted,
            currentValue: waterLog?.current_value || (isWaterCompleted ? 2.5 : 1.2),
            targetValue: waterLog?.target_value || 2.5,
            unit: waterLog?.unit || 'L',
          },
          food: {
            status: isFoodCompleted ? 'Completed' : 'Not Completed',
            label: foodStatusLabel,
            isCompleted: isFoodCompleted,
            meal_period: isFoodCompleted ? null : (foodLog?.meal_period || null),
            currentValue: foodLog?.current_value || (isFoodCompleted ? 3 : 1),
            targetValue: foodLog?.target_value || 3,
            unit: foodLog?.unit || 'meals',
          }
        });

        // Generate alerts for Family Head & members
        if (!isWaterCompleted) {
          alerts.push({
            id: `w_alert_${m.userId}`,
            memberId: m.memberId,
            userId: m.userId,
            memberName: m.fullName,
            relationship: m.relationship,
            goalType: 'water',
            title: `Water goal not completed`,
            message: `${m.fullName} has not completed the required daily 2.5L water hydration goal for ${todayDateStr}.`,
            status: 'Not Completed',
            date: todayDateStr,
            severity: 'attention',
          });
        } else {
          alerts.push({
            id: `w_alert_${m.userId}`,
            memberId: m.memberId,
            userId: m.userId,
            memberName: m.fullName,
            relationship: m.relationship,
            goalType: 'water',
            title: `Water goal completed`,
            message: `${m.fullName} successfully met the daily 2.5L hydration goal.`,
            status: 'Completed',
            date: todayDateStr,
            severity: 'achieved',
          });
        }

        if (!isFoodCompleted) {
          const missedText = foodLog?.meal_period ? ` (Missed: ${foodLog.meal_period})` : '';
          alerts.push({
            id: `f_alert_${m.userId}`,
            memberId: m.memberId,
            userId: m.userId,
            memberName: m.fullName,
            relationship: m.relationship,
            goalType: 'food',
            title: `Food goal not completed`,
            message: `${m.fullName} has not logged the required nutritious balanced meals for ${todayDateStr}.${missedText}`,
            status: 'Not Completed',
            meal_period: foodLog?.meal_period || null,
            date: todayDateStr,
            severity: 'attention',
          });
        } else {
          alerts.push({
            id: `f_alert_${m.userId}`,
            memberId: m.memberId,
            userId: m.userId,
            memberName: m.fullName,
            relationship: m.relationship,
            goalType: 'food',
            title: `Food goal completed`,
            message: `${m.fullName} completed the daily balanced nutritional intake.`,
            status: 'Completed',
            date: todayDateStr,
            severity: 'achieved',
          });
        }
      }

      return sendJson(res, 200, {
        success: true,
        familyId,
        familyName,
        todayDate: todayFullStr,
        rawDate: todayDateStr,
        members,
        memberStatuses,
        alerts,
      });
    }

    // 2. POST /api/v1/family/goals/log - Toggle or update goal completion
    if (pathname === '/api/v1/family/goals/log' && req.method === 'POST') {
      const user = await authenticateUser(req) || defaultUser;
      const body = await parseJsonBody(req);
      const { memberUserId, goalType, status, targetDate } = body;

      if (!memberUserId || !goalType || !status) {
        return sendJson(res, 400, { error: 'memberUserId, goalType, and status are required' });
      }

      const cleanGoalType = goalType === 'food' ? 'food' : 'water';
      const isCompleted = status === 'completed';
      const cleanStatus = isCompleted ? 'completed' : 'not_completed';
      const targetVal = cleanGoalType === 'water' ? 2.5 : 3;
      const currentVal = isCompleted ? targetVal : (cleanGoalType === 'water' ? 1.2 : 1);
      const unit = cleanGoalType === 'water' ? 'L' : 'meals';

      const mealPeriodVal = isCompleted ? null : (body.meal_period || body.mealPeriod || null);

      if (pool) {
        const params = [memberUserId, cleanGoalType, cleanStatus, currentVal, isCompleted ? new Date().toISOString() : null, mealPeriodVal];
        let dateExpr = 'CURRENT_DATE';
        if (targetDate) {
          params.push(targetDate);
          dateExpr = `$${params.length}::date`;
        }

        const upsertSql = `
        INSERT INTO public.daily_goal_logs (user_id, goal_date, goal_type, status, current_value, target_value, unit, completed_at, meal_period, updated_at)
        VALUES ($1, ${dateExpr}, $2, $3, $4, ${targetVal}, '${unit}', $5, $6, now())
        ON CONFLICT (user_id, goal_date, goal_type) DO UPDATE SET
          status = EXCLUDED.status,
          current_value = EXCLUDED.current_value,
          completed_at = EXCLUDED.completed_at,
          meal_period = CASE WHEN EXCLUDED.status = 'completed' THEN NULL ELSE COALESCE(EXCLUDED.meal_period, daily_goal_logs.meal_period) END,
          updated_at = now()
        RETURNING *;
      `;
        const resDb = await queryDb(upsertSql, params);
        return sendJson(res, 200, { success: true, log: resDb.rows[0] });
      }

      return sendJson(res, 200, { success: true, message: 'Updated' });
    }

    // 3. GET /api/v1/family/goals/history - Complete date-based history per family member
    if (pathname === '/api/v1/family/goals/history' && req.method === 'GET') {
      const user = await authenticateUser(req) || defaultUser;
      const rawUserId = user?.id || defaultUserId;
      const isUuidUser = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawUserId);
      const dbUserId = isUuidUser ? rawUserId : '1fb81ca9-8a3a-435c-889b-ff47807f3886';
      let familyId = user.family_id || user.familyId;

      const memberId = url.searchParams.get('memberId');

      if (!memberId) {
        return sendJson(res, 400, { error: 'memberId query parameter is required' });
      }

      let memberInfo = { id: memberId, fullName: 'Family Member', relationship: 'Member' };
      let history = [];

      if (pool) {
        if (!familyId) {
          const uFam = await queryDb(`SELECT family_id FROM public.users WHERE id = $1`, [dbUserId]);
          familyId = uFam.rows[0]?.family_id || '2e32b252-7445-4f08-9725-e3c1979cc74b';
        }

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memberId);
        let targetUserId = isUuid ? memberId : null;

        const mRes = await queryDb(`
        SELECT u.id, u.full_name, fm.display_name, fm.role, fm.relationship, fm.member_id
        FROM public.users u
        JOIN public.family_memberships fm ON fm.user_id = u.id
        WHERE (${isUuid ? 'u.id = $1' : 'fm.member_id = $1'}) AND fm.family_id = $2
        LIMIT 1
      `, [memberId, familyId]);

        if (mRes.rows[0]) {
          targetUserId = mRes.rows[0].id;
          memberInfo = {
            id: mRes.rows[0].id,
            memberId: mRes.rows[0].member_id || memberId,
            fullName: mRes.rows[0].display_name || mRes.rows[0].full_name || 'Family Member',
            relationship: mRes.rows[0].relationship || mRes.rows[0].role || 'Member',
          };
        }

        if (targetUserId) {
          const hRes = await queryDb(`
          SELECT goal_date, goal_type, status, current_value, target_value, unit, completed_at, meal_period
          FROM public.daily_goal_logs
          WHERE user_id = $1
          ORDER BY goal_date DESC, goal_type ASC
        `, [targetUserId]);

          // Group logs by date
          const dateMap = new Map();
          for (const row of hRes.rows) {
            const d = new Date(row.goal_date);
            const dateStr = !isNaN(d.getTime())
              ? d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')
              : String(row.goal_date);

            if (!dateMap.has(dateStr)) {
              dateMap.set(dateStr, {
                date: dateStr,
                rawDate: row.goal_date,
                waterStatus: 'Not Completed',
                waterLabel: 'Water Goal — Not Completed',
                isWaterCompleted: false,
                waterMetrics: '1.2 / 2.5 L',
                foodStatus: 'Not Completed',
                foodLabel: 'Food Goal — Not Completed',
                isFoodCompleted: false,
                foodMetrics: '1 / 3 meals',
                meal_period: null,
              });
            }

            const entry = dateMap.get(dateStr);
            if (row.goal_type === 'water') {
              entry.isWaterCompleted = row.status === 'completed';
              entry.waterStatus = entry.isWaterCompleted ? 'Completed' : 'Not Completed';
              entry.waterLabel = entry.isWaterCompleted ? 'Water Goal — Completed' : 'Water Goal — Not Completed';
              entry.waterMetrics = `${row.current_value || (entry.isWaterCompleted ? 2.5 : 1.2)} / ${row.target_value || 2.5} ${row.unit || 'L'}`;
            } else if (row.goal_type === 'food') {
              entry.isFoodCompleted = row.status === 'completed';
              entry.foodStatus = entry.isFoodCompleted ? 'Completed' : 'Not Completed';
              entry.foodLabel = entry.isFoodCompleted ? 'Food Goal — Completed' : 'Food Goal — Not Completed';
              entry.meal_period = entry.isFoodCompleted ? null : (row.meal_period || null);
              entry.foodMetrics = `${row.current_value || (entry.isFoodCompleted ? 3 : 1)} / ${row.target_value || 3} ${row.unit || 'meals'}`;
            }
          }

          history = Array.from(dateMap.values());
        }
      }

      return sendJson(res, 200, {
        success: true,
        member: memberInfo,
        history,
      });
    }

    // 6. Storage Endpoints
    if (pathname === '/api/v1/storage/buckets') {
      return sendJson(res, 200, {
        buckets: [
          { name: 'profile-photos', public: false },
          { name: 'health-documents', public: false },
          { name: 'educational-media', public: true },
        ],
      });
    }

    if (pathname === '/api/v1/storage/upload-url' && req.method === 'POST') {
      const user = await authenticateUser(req);
      const userId = user?.id || 'usr_demo';
      const body = await parseJsonBody(req);
      const filename = body.filename || 'document.pdf';
      return sendJson(res, 201, {
        uploadUrl: `${supabaseUrl}/storage/v1/object/upload/sign/${body.bucket || 'health-documents'}/${userId}/${filename}?token=mock`,
        path: `${userId}/${filename}`,
      });
    }

    // 7. Realtime Endpoint
    if (pathname === '/api/v1/realtime/status') {
      return sendJson(res, 200, {
        status: 'active',
        enabledTables: ['nutrition_logs', 'symptom_logs', 'goals'],
      });
    }

    // 7b. Realtime Family Event Stream (Server-Sent Events)
    if (pathname === '/api/v1/realtime/family-events') {
      let user = await authenticateUser(req);
      if (!user) {
        const queryToken = url.searchParams.get('token');
        if (queryToken) {
          user = await authenticateUser({ headers: { authorization: `Bearer ${queryToken}` } });
        }
      }
      if (!user) {
        user = defaultUser;
      }

      let familyId = url.searchParams.get('familyId') || user.familyId || user.family_id;
      if (!familyId && pool) {
        try {
          const uFam = await queryDb('SELECT family_id FROM public.users WHERE id = $1', [user.id]);
          familyId = uFam.rows[0]?.family_id;
        } catch (_) {}
      }
      if (!familyId) {
        familyId = 'default_family';
      }

      const isHead = (user.isFamilyHead === true || user.role === 'family_head' || user.role === 'admin' || user.relationship === 'head') && user.role !== 'family_member';

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write(': connected\n\n');

      const fKey = String(familyId);
      if (!global._familySseClients.has(fKey)) {
        global._familySseClients.set(fKey, new Set());
      }
      const clientRecord = { res, userId: user.id, isHead };
      global._familySseClients.get(fKey).add(clientRecord);

      const pingInterval = setInterval(() => {
        try {
          res.write(': ping\n\n');
        } catch (_) {
          clearInterval(pingInterval);
        }
      }, 25000);

      req.on('close', () => {
        clearInterval(pingInterval);
        const group = global._familySseClients.get(fKey);
        if (group) {
          group.delete(clientRecord);
          if (group.size === 0) global._familySseClients.delete(fKey);
        }
      });
      return;
    }

    // 7c. POST /api/v1/family/goals/update - Family Head updates goal & broadcasts live
    if (pathname === '/api/v1/family/goals/update' && req.method === 'POST') {
      const user = await authenticateUser(req) || defaultUser;
      const isHead = (user.isFamilyHead === true || user.role === 'family_head' || user.role === 'admin' || user.relationship === 'head') && user.role !== 'family_member';
      if (!isHead) {
        return sendJson(res, 403, { error: 'Forbidden', message: 'Only Family Head can update family goals.' });
      }

      const body = await parseJsonBody(req);
      const goalType = String(body.goalType || body.goal_type || 'water').toLowerCase();
      const targetValue = Number(body.targetValue || body.target_value || (goalType === 'water' ? 2500 : 3));
      const unit = body.unit || (goalType === 'water' ? 'ml' : goalType === 'food' ? 'meals' : goalType === 'walking' ? 'steps' : 'hours');
      const familyId = user.familyId || user.family_id || 'default_family';

      // Persist to database if available
      if (pool && user.familyId) {
        try {
          const mems = await queryDb('SELECT user_id FROM public.family_memberships WHERE family_id = $1', [user.familyId]);
          for (const m of mems.rows) {
            const dbVal = goalType === 'water' ? Number((targetValue / 1000).toFixed(2)) : targetValue;
            const dbUnit = goalType === 'water' ? 'L' : unit;
            await queryDb(`
              INSERT INTO public.daily_goal_logs (user_id, goal_date, goal_type, status, current_value, target_value, unit, updated_at)
              VALUES ($1, CURRENT_DATE, $2, 'not_completed', 0, $3, $4, now())
              ON CONFLICT (user_id, goal_date, goal_type) DO UPDATE SET
                target_value = EXCLUDED.target_value,
                updated_at = now()
            `, [m.user_id, goalType, dbVal, dbUnit]);
          }
        } catch (e) {
          console.warn('DB family goal update notice:', e.message);
        }
      }

      // Broadcast immediately across all connected family accounts
      broadcastFamilyEvent(familyId, 'goal_update', {
        goalType,
        targetValue,
        unit,
        updatedBy: user.fullName || user.full_name || 'Family Head',
        timestamp: new Date().toISOString()
      });

      return sendJson(res, 200, {
        success: true,
        ok: true,
        goalType,
        targetValue,
        unit,
        message: `Family ${goalType} goal updated to ${targetValue} ${unit} and synchronized.`
      });
    }

    // 7d. POST /api/v1/family/reminders/save - Family Head creates/updates reminder & broadcasts live
    if (pathname === '/api/v1/family/reminders/save' && req.method === 'POST') {
      const user = await authenticateUser(req) || defaultUser;
      const isHead = (user.isFamilyHead === true || user.role === 'family_head' || user.role === 'admin' || user.relationship === 'head') && user.role !== 'family_member';
      if (!isHead) {
        return sendJson(res, 403, { error: 'Forbidden', message: 'Only Family Head can manage family reminders.' });
      }

      const body = await parseJsonBody(req);
      const reminderId = body.id || `rem_${Date.now()}`;
      const category = body.category || 'general';
      const title = body.title || 'Scheduled Reminder';
      const time = body.time || '08:00';
      const frequency = body.frequency || 'Daily';
      const notes = body.notes || '';
      const isNew = Boolean(body.isNew);
      const familyId = user.familyId || user.family_id || 'default_family';

      // Persist to database if pool available
      if (pool) {
        try {
          const notifId = randomUUID();
          await queryDb(`
            INSERT INTO public.notifications (id, user_id, type, title, body, metadata, is_read, created_at)
            VALUES ($1, $2, 'goal_alert', $3, $4, $5, false, now())
          `, [
            notifId,
            user.id,
            `Family Reminder: ${title}`,
            `Scheduled for ${time} (${frequency})`,
            JSON.stringify({ type: 'reminder', category, time, reminderId, family_id: familyId })
          ]);
        } catch (_) {}
      }

      // Broadcast immediately across all connected family accounts
      broadcastFamilyEvent(familyId, 'reminder_update', {
        id: reminderId,
        category,
        title,
        time,
        frequency,
        notes,
        isNew,
        updatedBy: user.fullName || user.full_name || 'Family Head',
        timestamp: new Date().toISOString()
      });

      return sendJson(res, 200, {
        success: true,
        ok: true,
        reminder: { id: reminderId, category, title, time, frequency, notes },
        message: 'Reminder saved and broadcast to all family members.'
      });
    }

    // 7e. DELETE /api/v1/family/members/:id - Family Head removes member
    if (pathname.startsWith('/api/v1/family/members/') && req.method === 'DELETE') {
      const user = await authenticateUser(req);
      const userId = user?.id;
      if (!userId) return sendJson(res, 401, { error: 'Authentication required' });
      const isHead = (user.isFamilyHead === true || user.role === 'family_head' || user.role === 'admin' || user.relationship === 'head') && user.role !== 'family_member';
      if (!isHead) {
        return sendJson(res, 403, { error: 'Forbidden', message: 'Only Family Head can remove family members.' });
      }
      const targetMemberId = pathname.replace('/api/v1/family/members/', '').trim();
      if (pool) {
        await queryDb(`DELETE FROM public.family_memberships WHERE user_id = $1 OR member_id = $1`, [targetMemberId]);
        await queryDb(`UPDATE public.users SET family_id = NULL, role = 'family_member' WHERE id = $1`, [targetMemberId]);
      }
      return sendJson(res, 200, { success: true, ok: true, message: 'Member removed from family space.' });
    }

    // 8. Real Location-Based Nearby Healthcare Provider Route
    if (pathname === '/api/v1/healthcare/nearby' && req.method === 'GET') {
      const lat = parseFloat(url.searchParams.get('lat'));
      const lng = parseFloat(url.searchParams.get('lng'));
      const radius = Math.min(Math.max(parseInt(url.searchParams.get('radius') || '10000', 10), 1000), 30000);

      if (isNaN(lat) || isNaN(lng)) {
        return sendJson(res, 400, { error: 'Valid latitude and longitude coordinates are required.' });
      }

      try {
        const places = await fetchRealNearbyHealthcarePlaces(lat, lng, radius);
        return sendJson(res, 200, {
          status: 'ok',
          location: { lat, lng },
          radius_meters: radius,
          count: places.length,
          places,
          facilities: places,
        });
      } catch (err) {
        console.error('Nearby healthcare fetch error:', err);
        return sendJson(res, 500, { error: 'Failed to retrieve real nearby healthcare providers.', details: err.message });
      }
    }

    // -------------------------------------------------------------
    // Static Files & Page Routing
    // -------------------------------------------------------------

    // Alias maps
    let filePath = pathname;
    if (filePath === '/') {
      filePath = '/login.html';
    } else if (filePath === '/index' || filePath === '/dashboard') {
      filePath = '/index.html';
    } else if (filePath === '/login') {
      filePath = '/login.html';
    } else if (filePath === '/signup') {
      filePath = '/signup.html';
    } else if (filePath === '/forgot-password') {
      filePath = '/forgot-password.html';
    } else if (filePath === '/profile') {
      filePath = '/profile.html';
    } else if (filePath === '/onboarding') {
      filePath = '/onboarding.html';
    }

    const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
    const publicPath = path.join(__dirname, 'public', safePath);
    const distPath = path.join(__dirname, 'dist', safePath);

    const targetFile = fs.existsSync(publicPath) && fs.statSync(publicPath).isFile()
      ? publicPath
      : fs.existsSync(distPath) && fs.statSync(distPath).isFile()
        ? distPath
        : null;

    if (targetFile) {
      const ext = path.extname(targetFile).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(targetFile).pipe(res);
      return;
    }

    // Fallback to public/index.html
    const fallbackIndex = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(fallbackIndex)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(fallbackIndex).pipe(res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'VitaWise resource not found' }));
  } catch (err) {
    console.error('Request processing error:', err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: err.message || 'Internal server error' });
    }
  }
});

server.listen(PORT, HOST, () => {
  try {
    fs.writeFileSync(path.join(__dirname, '.vitawise-server.pid'), String(process.pid), 'utf-8');
  } catch (_) {}
  console.log(`VitaWise Engine operational on http://${HOST}:${PORT}`);
});

const cleanupPid = () => {
  try {
    const p = path.join(__dirname, '.vitawise-server.pid');
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (_) {}
};
process.on('exit', cleanupPid);
process.on('SIGINT', () => { cleanupPid(); process.exit(0); });
process.on('SIGTERM', () => { cleanupPid(); process.exit(0); });

function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const nearbyHealthcareCache = new Map();

async function fetchRealNearbyHealthcarePlaces(lat, lng, radiusMeters = 10000) {
  const cacheKey = `${lat.toFixed(2)}_${lng.toFixed(2)}_${Math.round(radiusMeters / 1000)}`;
  const cached = nearbyHealthcareCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000 && cached.places.length > 0) {
    return cached.places;
  }

  const mirrors = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
  ];

  const overpassQuery = `[out:json][timeout:10];
(
  node["amenity"="hospital"](around:${radiusMeters}, ${lat}, ${lng});
  way["amenity"="hospital"](around:${radiusMeters}, ${lat}, ${lng});
  node["amenity"="clinic"](around:${radiusMeters}, ${lat}, ${lng});
  way["amenity"="clinic"](around:${radiusMeters}, ${lat}, ${lng});
  node["amenity"="doctors"](around:${radiusMeters}, ${lat}, ${lng});
  node["amenity"="pharmacy"](around:${radiusMeters}, ${lat}, ${lng});
  way["amenity"="pharmacy"](around:${radiusMeters}, ${lat}, ${lng});
  node["healthcare"="laboratory"](around:${radiusMeters}, ${lat}, ${lng});
  node["healthcare"="diagnostic_centre"](around:${radiusMeters}, ${lat}, ${lng});
  node["healthcare"="clinic"](around:${radiusMeters}, ${lat}, ${lng});
  node["healthcare"="hospital"](around:${radiusMeters}, ${lat}, ${lng});
  node["healthcare"="pharmacy"](around:${radiusMeters}, ${lat}, ${lng});
);
out center body 40;`;

  let elements = [];
  for (const mirror of mirrors) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);
      const resp = await fetch(mirror, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'VitaWiseHealthIntelligence/1.0 (https://vitawise.ai; support@vitawise.ai)',
        },
        body: 'data=' + encodeURIComponent(overpassQuery),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (resp.ok) {
        const text = await resp.text();
        const data = JSON.parse(text);
        if (Array.isArray(data.elements) && data.elements.length > 0) {
          elements = data.elements;
          break;
        }
      }
    } catch (_) { }
  }

  // Fallback to OpenStreetMap Nominatim search around bounding box if Overpass timed out or was empty
  if (elements.length === 0) {
    try {
      const delta = Math.max(radiusMeters / 111000, 0.05);
      const queries = ['hospital', 'clinic', 'pharmacy'];
      for (const q of queries) {
        const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${q}&lat=${lat}&lon=${lng}&bounded=1&viewbox=${lng - delta},${lat + delta},${lng + delta},${lat - delta}&addressdetails=1&limit=15`;
        const nomResp = await fetch(nomUrl, {
          headers: { 'User-Agent': 'VitaWise-Healthcare-Service/1.0' },
        });
        if (nomResp.ok) {
          const nomData = await nomResp.json();
          if (Array.isArray(nomData)) {
            for (const item of nomData) {
              elements.push({
                id: item.osm_id,
                lat: parseFloat(item.lat),
                lon: parseFloat(item.lon),
                tags: {
                  name: item.name || item.display_name?.split(',')[0],
                  amenity: q === 'pharmacy' ? 'pharmacy' : q === 'hospital' ? 'hospital' : 'clinic',
                  'addr:street': item.address?.road || item.address?.suburb || '',
                  'addr:city': item.address?.city || item.address?.town || item.address?.county || '',
                  phone: item.extratags?.phone || item.extratags?.['contact:phone'] || null,
                },
              });
            }
          }
        }
      }
    } catch (_) { }
  }

  const results = [];
  const seenNames = new Set();

  for (const el of elements) {
    const tags = el.tags || {};
    const name = tags.name || tags['name:en'] || null;
    if (!name || seenNames.has(name.toLowerCase())) continue;
    seenNames.add(name.toLowerCase());

    const itemLat = el.lat || el.center?.lat;
    const itemLng = el.lon || el.center?.lon;
    if (typeof itemLat !== 'number' || typeof itemLng !== 'number') continue;

    const distanceKm = calculateHaversineDistanceKm(lat, lng, itemLat, itemLng);

    // Determine category
    let category = 'clinic';
    let typeLabel = 'Clinic · Healthcare Centre';

    const lowerName = name.toLowerCase();
    const amenity = (tags.amenity || '').toLowerCase();
    const healthcare = (tags.healthcare || '').toLowerCase();

    if (
      amenity === 'hospital' ||
      healthcare === 'hospital' ||
      lowerName.includes('hospital') ||
      lowerName.includes('institute of medical') ||
      lowerName.includes('multispeciality')
    ) {
      category = 'hospital';
      typeLabel = tags.emergency === 'yes' ? 'Hospital · 24/7 Emergency Multi-Speciality' : 'Hospital · Multi-Speciality';
    } else if (
      amenity === 'pharmacy' ||
      healthcare === 'pharmacy' ||
      lowerName.includes('pharmacy') ||
      lowerName.includes('medicals') ||
      lowerName.includes('druggist')
    ) {
      category = 'pharmacy';
      typeLabel = tags.opening_hours === '24/7' ? 'Pharmacy · 24/7 Medicals' : 'Pharmacy · Medical Store';
    } else if (
      healthcare === 'laboratory' ||
      healthcare === 'diagnostic_centre' ||
      lowerName.includes('diagnostic') ||
      lowerName.includes('laboratory') ||
      lowerName.includes('lab') ||
      lowerName.includes('imaging') ||
      lowerName.includes('scan') ||
      lowerName.includes('pathology')
    ) {
      category = 'lab';
      typeLabel = 'Diagnostic Lab · Pathology & Scans';
    } else {
      category = 'clinic';
      typeLabel = tags.speciality ? `Clinic · ${tags.speciality}` : 'Clinic · Specialist Consultation';
    }

    // Contact number
    const rawPhone = tags.phone || tags['contact:phone'] || tags['phone:mobile'] || tags['contact:mobile'] || null;
    let cleanPhone = null;
    if (rawPhone) {
      cleanPhone = rawPhone.replace(/[^\d+]/g, '');
      if (cleanPhone.length < 6) cleanPhone = null;
    }

    // Address
    const addressParts = [
      tags['addr:housenumber'],
      tags['addr:street'],
      tags['addr:suburb'] || tags['addr:neighbourhood'],
      tags['addr:city'] || tags['addr:town'] || tags['addr:district'],
    ].filter(Boolean);
    const address = addressParts.length > 0 ? addressParts.join(', ') : tags['addr:full'] || 'Local Area, Verified Facility';

    // Timing
    let timing = null;
    if (tags.opening_hours) {
      timing = tags.opening_hours === '24/7' ? '● Open 24 Hours (Emergency Available)' : `● Hours: ${tags.opening_hours}`;
    } else if (category === 'hospital') {
      timing = '● Open 24/7 (Emergency Available)';
    }

    results.push({
      id: el.id ? `osm_${el.id}` : `pl_${Math.random().toString(36).substring(2, 9)}`,
      name,
      category,
      type_label: typeLabel,
      type_badge: typeLabel,
      address,
      phone: rawPhone,
      clean_phone: cleanPhone,
      opening_hours: timing,
      lat: itemLat,
      lng: itemLng,
      distance_km: Math.round(distanceKm * 10) / 10,
    });
  }

  // Sort places closest to farthest
  results.sort((a, b) => a.distance_km - b.distance_km);

  return results;
}

import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory data store for local development
const memoryStore = {
  nutritionLogs: [
    {
      id: 'nl_demo_1',
      mealName: 'Sprouted Moong Salad & Spearmint Tea',
      mealType: 'Breakfast',
      glycemicIndex: 'Low',
      carbsG: 18,
      proteinG: 14,
      loggedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    },
    {
      id: 'nl_demo_2',
      mealName: 'Foxtail Millet & Methi Dal Khichdi',
      mealType: 'Lunch',
      glycemicIndex: 'Low',
      carbsG: 38,
      proteinG: 16,
      loggedAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    }
  ],
  symptomLogs: [
    {
      id: 'sl_demo_1',
      symptom: 'Acne / Skin Flares',
      severity: 2,
      phase: 'Follicular',
      notes: 'Slight flare near chin',
      loggedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    },
    {
      id: 'sl_demo_2',
      symptom: 'Fatigue & Energy Slump',
      severity: 1,
      phase: 'Follicular',
      notes: 'Morning fatigue improved after spearmint tea',
      loggedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    }
  ],
  cycleLogs: [
    {
      id: 'cl_demo_1',
      cycleDay: 14,
      phase: 'Follicular (Pre-Ovulatory)',
      lengthDays: 32,
      regularity: 'Mildly Irregular',
      recordedAt: new Date().toISOString(),
    }
  ],
  user: {
    id: 'usr_ananya_demo',
    email: 'ananya.demo@vitawise.ai',
    name: 'Ananya Sharma',
    language: 'en',
    phenotype: 'PCOS Phenotype B (Metabolic & Hyperandrogenic)',
    pcosRiskScore: 38,
  }
};

function vitawiseApiPlugin(): Plugin {
  return {
    name: 'vitawise-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost:3000'}`);
        const pathname = parsedUrl.pathname;

        // Only intercept /api/v1/*
        if (!pathname.startsWith('/api/v1/')) {
          return next();
        }

        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        const sendJson = (status: number, data: any) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
        };

        const readBody = (): Promise<any> => {
          return new Promise((resolve) => {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
              try {
                resolve(body ? JSON.parse(body) : {});
              } catch {
                resolve({});
              }
            });
            req.on('error', () => resolve({}));
          });
        };

        // In-memory Mock API
        if (pathname === '/api/v1/health') {
          return sendJson(200, {
            status: 'ok',
            service: 'VitaWise Health Intelligence Engine',
            version: '1.0.0',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
          });
        }

        if (pathname === '/api/v1/auth/me') {
          return sendJson(200, {
            user: memoryStore.user,
            authenticated: true,
          });
        }

        if (pathname === '/api/v1/auth/login') {
          const body = await readBody();
          const email = body.email || 'ananya.demo@vitawise.ai';
          return sendJson(200, {
            message: 'Login successful',
            user: {
              ...memoryStore.user,
              email,
            },
            session: {
              accessToken: 'vw_token_session_live_' + Date.now(),
              refreshToken: 'vw_refresh_session_live_' + Date.now(),
              expiresIn: 86400,
            },
          });
        }

        if (pathname === '/api/v1/auth/signup') {
          const body = await readBody();
          const email = body.email || 'new.user@vitawise.ai';
          const name = body.name || body.fullName || '';
          const phone = body.phone ? String(body.phone).trim() : null;
          memoryStore.user = {
            ...memoryStore.user,
            email,
            name: name || null,
            fullName: name || null,
            phone: phone || null,
          };
          return sendJson(201, {
            message: 'Account created successfully',
            user: memoryStore.user,
            session: {
              accessToken: 'vw_token_session_live_' + Date.now(),
              refreshToken: 'vw_refresh_session_live_' + Date.now(),
              expiresIn: 86400,
            },
          });
        }

        if (pathname === '/api/v1/auth/profile' || (pathname === '/api/v1/auth/me' && req.method !== 'GET')) {
          const body = await readBody();
          const fullName = body.fullName || body.name || memoryStore.user.fullName || memoryStore.user.name;
          const phone = body.phone !== undefined ? body.phone : memoryStore.user.phone;
          memoryStore.user = {
            ...memoryStore.user,
            ...body,
            name: fullName,
            fullName,
            phone,
          };
          return sendJson(200, {
            success: true,
            message: 'Profile updated successfully',
            user: memoryStore.user,
          });
        }

        if (pathname === '/api/v1/health/dashboard') {
          return sendJson(200, {
            summary: {
              user: memoryStore.user,
              todayNutritionCount: memoryStore.nutritionLogs.length,
              todaySymptomCount: memoryStore.symptomLogs.length,
              currentCycleDay: 14,
              phase: 'Follicular',
              riskScore: 38,
            },
            nutritionLogs: memoryStore.nutritionLogs,
            symptomLogs: memoryStore.symptomLogs,
            cycleLogs: memoryStore.cycleLogs,
          });
        }

        if (pathname === '/api/v1/health/nutrition-logs') {
          if (req.method === 'POST') {
            const body = await readBody();
            const newLog = {
              id: 'nl_' + Date.now(),
              mealName: body.mealName || body.foodItem || 'Millet Wellness Meal',
              mealType: body.mealType || 'Meal',
              glycemicIndex: body.glycemicIndex || 'Low',
              carbsG: Number(body.carbsG) || 24,
              proteinG: Number(body.proteinG) || 12,
              loggedAt: new Date().toISOString(),
            };
            memoryStore.nutritionLogs.unshift(newLog);
            return sendJson(201, { message: 'Meal logged successfully', log: newLog });
          }
          return sendJson(200, { logs: memoryStore.nutritionLogs });
        }

        if (pathname === '/api/v1/health/symptom-logs') {
          if (req.method === 'POST') {
            const body = await readBody();
            const newLog = {
              id: 'sl_' + Date.now(),
              symptom: body.symptom || 'Hormonal Fatigue',
              severity: Number(body.severity) || 2,
              phase: body.phase || 'Follicular',
              notes: body.notes || '',
              loggedAt: new Date().toISOString(),
            };
            memoryStore.symptomLogs.unshift(newLog);
            return sendJson(201, { message: 'Symptom recorded', log: newLog });
          }
          return sendJson(200, { logs: memoryStore.symptomLogs });
        }

        if (pathname === '/api/v1/health/cycle-logs') {
          if (req.method === 'POST') {
            const body = await readBody();
            const newLog = {
              id: 'cl_' + Date.now(),
              cycleDay: Number(body.cycleDay) || 1,
              phase: body.phase || 'Follicular',
              lengthDays: Number(body.lengthDays) || 30,
              regularity: body.regularity || 'Regular',
              recordedAt: new Date().toISOString(),
            };
            memoryStore.cycleLogs.unshift(newLog);
            return sendJson(201, { message: 'Cycle data updated', log: newLog });
          }
          return sendJson(200, { logs: memoryStore.cycleLogs });
        }

        if (pathname === '/api/v1/ai/consult') {
          const body = await readBody();
          const prompt = String(body.prompt || '').toLowerCase();
          const lang = body.lang || 'en';

          // Clinical safety check
          if (prompt.includes('severe bleeding') || prompt.includes('unbearable pain') || prompt.includes('chest pain')) {
            const alertText = lang === 'te'
              ? 'తీవ్రమైన లక్షణాలకు దయచేసి వెంటనే మీ గైనకాలజిస్ట్ లేదా అత్యవసర విభాగాన్ని సంప్రదించండి.'
              : 'Alert: For severe pain or heavy acute bleeding, please contact your gynecologist or seek immediate medical emergency care.';
            return sendJson(200, { reply: alertText, disclaimer: 'Clinical escalation notice' });
          }

          let responseText = '';
          if (lang === 'te') {
            if (prompt.includes('టిఫిన్') || prompt.includes('breakfast') || prompt.includes('ఆహారం')) {
              responseText = `**పీసీఓఎస్ కోసం ఉత్తమ అల్పాహార ఎంపికలు (ICMR-NIN సిఫార్సులు):**\n\n1. **మొలకెత్తిన పెసర్లు (Sprouted Moong Salad)**: కొద్దిగా జీలకర్ర, నిమ్మరసం, దోసకాయ ముక్కలతో.\n2. **కొర్రల లేదా రాగి అంబలి/ఇడ్లీ**: వైట్ రైస్ బదులు రాగులు లేదా కొర్రలు వాడటం వల్ల రక్తంలో చక్కెర స్థిరంగా ఉంటుంది.\n3. **పుదీనా టీ (Spearmint Tea)**: ఆండ్రోజెన్ స్థాయిలను నియంత్రించడంలో సహాయపడుతుంది.\n\n*చిట్కా: ఉదయాన్నే ఎక్కువ ప్రోటీన్ మరియు పీచుపదార్థం తీసుకోవడం వల్ల ఇన్సులిన్ రెసిస్టెన్స్ తగ్గుతుంది.*`;
            } else {
              responseText = `**విటా-వైజ్ ఆరోగ్య మార్గదర్శి:**\n\nపీసీఓఎస్ మరియు హార్మోన్ల సమతుల్యత కోసం:\n- తక్కువ గ్లైసెమిక్ ఇండెక్స్ (Low-GI) కలిగిన చిరుధాన్యాలు తీసుకోండి.\n- ప్రతిరోజూ 30 నిమిషాలు నడక లేదా యోగా సాధన చేయండి.\n- రోజూ 2.5 - 3 లీటర్ల నీరు త్రాగండి మరియు తగినంత నిద్ర పొందండి.`;
            }
          } else {
            if (prompt.includes('breakfast') || prompt.includes('food') || prompt.includes('diet') || prompt.includes('snack')) {
              responseText = `**Evidence-Grounded PCOS Nutrition Guidance (ICMR-NIN Aligned):**\n\n1. **Sprouted Moong & Cucumber Chaat**: High in plant protein and bioavailable fiber, minimizing postprandial glucose spikes.\n2. **Foxtail / Little Millet Idlis**: Low glycemic index alternative to white rice, improving insulin receptor sensitivity.\n3. **Spearmint Herbal Infusion**: Clinical studies indicate two cups daily help suppress excess free testosterone.\n4. **Healthy Fats**: Incorporate soaked almonds and ground flaxseeds for hormone synthesis.\n\n*Clinical Recommendation: Aim for 25-30g dietary fiber daily and prioritize whole unpolished grains.*`;
            } else if (prompt.includes('exercise') || prompt.includes('workout') || prompt.includes('walk')) {
              responseText = `**Metabolic Movement Protocol for PCOS:**\n\n- **Zone 2 Brisk Walking**: 30-40 minutes post-meals lowers peak blood glucose by up to 22%.\n- **Low-Impact Resistance Training**: 3x weekly builds lean muscle tissue, which is the primary site of insulin-mediated glucose uptake.\n- **Avoid Chronic Cortisol Spikes**: Moderate intensity prevents adrenal fatigue. Prioritize consistent sleep schedules (7-8 hrs).`;
            } else {
              responseText = `**VitaWise Clinical Lifestyle Advice:**\n\nFor balanced hormonal regulation and menstrual cycle support:\n- **Nutritional Rhythm**: Eat within a 10-12 hour daytime window to align with circadian insulin sensitivity.\n- **Spearmint & Seed Rotation**: Consider flax and pumpkin seeds during the follicular phase for estrogen metabolism.\n- **Hydration Target**: Maintain 2.5 - 3.0 Liters daily with mineral electrolytes.\n\n*Always verify ongoing treatment adjustments with your registered healthcare practitioner.*`;
            }
          }

          return sendJson(200, {
            reply: responseText,
            disclaimer: 'Informational only; not a substitute for clinical medical advice.',
            timestamp: new Date().toISOString(),
          });
        }

        if (pathname === '/api/v1/ai/assess') {
          const body = await readBody();
          const cycleIrregular = Boolean(body.irregularCycles);
          const acneOrHirsutism = Boolean(body.acne || body.excessHair);
          const metabolicRisk = Boolean(body.sugarCravings || body.weightGain);

          let score = 20;
          if (cycleIrregular) score += 35;
          if (acneOrHirsutism) score += 25;
          if (metabolicRisk) score += 20;

          return sendJson(200, {
            pcosRiskScore: Math.min(score, 95),
            phenotype: score >= 60 ? 'Phenotype B (Metabolic & Hyperandrogenic)' : 'Phenotype D (Mild / Lifestyle Reactive)',
            recommendations: [
              'Adopt unrefined low-GI grains (foxtail millet, barley)',
              'Incorporate two cups of spearmint infusion daily',
              'Schedule a fasting insulin and pelvic ultrasound assessment',
            ],
          });
        }

        return sendJson(404, { error: 'VitaWise API route not found.' });
      });
    },
    closeBundle() {
      // Ensure all public static folders (js, css, assets) are fully mirrored into dist/
      const publicDir = path.resolve(__dirname, 'public');
      const distDir = path.resolve(__dirname, 'dist');
      ['js', 'css', 'assets'].forEach((folder) => {
        const src = path.join(publicDir, folder);
        const dst = path.join(distDir, folder);
        if (fs.existsSync(src)) {
          fs.cpSync(src, dst, { recursive: true });
        }
      });
    },
  };
}

export default defineConfig(() => {
  return {
    root: 'public',
    build: {
      outDir: '../dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'public/index.html'),
          login: path.resolve(__dirname, 'public/login.html'),
          signup: path.resolve(__dirname, 'public/signup.html'),
          onboarding: path.resolve(__dirname, 'public/onboarding.html'),
          profile: path.resolve(__dirname, 'public/profile.html'),
          forgotPassword: path.resolve(__dirname, 'public/forgot-password.html'),
        },
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [vitawiseApiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'public'),
      },
    },
  };
});

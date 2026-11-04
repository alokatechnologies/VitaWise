import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';

export interface AiAssessmentRequestDto {
  symptoms?: string[];
  dietaryContext?: string;
  cycleIrregularity?: boolean;
  hirsutismOrAcne?: boolean;
  bmiOrWeightKg?: number;
  fastingGlucose?: number;
  query?: string;
  language?: 'en' | 'te';
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly geminiApiKey: string | null;

  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
  ) {
    this.geminiApiKey = this.configService.get<string>('ai.geminiApiKey');
  }

  async runAssessment(userId: string, dto: AiAssessmentRequestDto) {
    const lang = dto.language || 'en';
    const startTime = Date.now();

    // 1. Clinical Rule-Based Screener (Rotterdam & ICMR-NIN Indian Dietary Criteria)
    let riskScore = 15; // baseline
    const flags: string[] = [];

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
      flags.push(`Elevated Fasting Glucose (${dto.fastingGlucose} mg/dL) indicating insulin resistance predisposition`);
    }

    let riskLevel: 'low' | 'moderate' | 'elevated' | 'high' = 'low';
    if (riskScore >= 65) riskLevel = 'high';
    else if (riskScore >= 45) riskLevel = 'elevated';
    else if (riskScore >= 25) riskLevel = 'moderate';

    // 2. Server-Side AI Orchestration (Gemini 2.5 Flash / 3.6 Flash)
    let aiSummary = '';
    let recommendations: Array<{
      domain: 'diet' | 'lifestyle' | 'clinical_consult' | 'supplement';
      title: string;
      actionItem: string;
      scientificRationale: string;
      priority: 'low' | 'medium' | 'high' | 'urgent';
    }> = [];

    const promptText = `
You are the VitaWise Clinical Intelligence Assistant for PCOS & Nutrition.
Context:
- Risk Level: ${riskLevel} (Score: ${riskScore}/100)
- Clinical Indicators: ${flags.join('; ') || 'General prevention'}
- Dietary Context: ${dto.dietaryContext || 'South Indian / Indian standard diet'}
- User Notes: ${dto.query || 'Evaluate metabolic balance and nutritional recommendations'}
- Target Language: ${lang === 'te' ? 'Telugu (తెలుగు)' : 'English'}

Provide:
1. A concise clinical summary (2-3 sentences).
2. Exactly 3 evidence-based action items grounded in ICMR-NIN Indian Dietary Guidelines (e.g. sprouted moong, foxtail millets, spearmint tea, resistance walking).
Output valid JSON in this exact structure:
{
  "summary": "...",
  "recommendations": [
    {
      "domain": "diet",
      "title": "...",
      "actionItem": "...",
      "scientificRationale": "...",
      "priority": "high"
    }
  ]
}
`;

    if (this.geminiApiKey) {
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: promptText }] }],
              generationConfig: { responseMimeType: 'application/json' },
            }),
          }
        );
        const data = await geminiRes.json();
        const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawContent) {
          const parsed = JSON.parse(rawContent);
          aiSummary = parsed.summary || '';
          recommendations = parsed.recommendations || [];
        }
      } catch (err: any) {
        this.logger.warn(`Gemini inference error (${err.message}). Using deterministic guidance.`);
      }
    }

    if (!aiSummary) {
      aiSummary = lang === 'te'
        ? `విశ్లేషణ: మీ లక్షణాల ఆధారంగా ఇన్సులిన్ నిరోధకత మరియు హార్మోన్ల అసమతుల్యత ప్రమాదం ${riskLevel === 'high' ? 'ఎక్కువగా' : 'మధ్యస్థంగా'} ఉంది. చిరుధాన్యాలు మరియు పీచు పదార్థాలు తీసుకోవడం చాలా మంచిది.`
        : `Clinical synthesis indicates a ${riskLevel} metabolic predisposition. Recommended focus on complex unrefined millets, lean pulses, and 30-min daily brisk physical pacing to support insulin sensitivity.`;
      
      recommendations = [
        {
          domain: 'diet',
          title: lang === 'te' ? 'తక్కువ గ్లైసెమిక్ ఆహార ఎంపికలు' : 'Low-Glycemic Millet Rotation',
          actionItem: lang === 'te' ? 'తెల్లటి అన్నం స్థానంలో కొర్రలు లేదా రాగులు వాడండి.' : 'Replace refined rice with foxtail or barnyard millet at lunch.',
          scientificRationale: 'Lowers postprandial glucose spike, reducing hyperinsulinemia-induced androgen secretion.',
          priority: 'high',
        },
        {
          domain: 'lifestyle',
          title: lang === 'te' ? 'భోజనం తర్వాత తేలికపాటి నడక' : 'Postprandial Pacing',
          actionItem: lang === 'te' ? 'భోజనం తర్వాత 15 నిమిషాల పాటు నెమ్మదిగా నడవండి.' : 'Engage in a 15-minute zone-1 stroll after principal meals.',
          scientificRationale: 'GLUT4 translocation without requiring insulin spikes.',
          priority: 'medium',
        },
        {
          domain: 'clinical_consult',
          title: lang === 'te' ? 'వైద్యుల సంప్రదింపు' : 'Confirmatory Rotterdam Screening',
          actionItem: lang === 'te' ? 'గైనకాలజిస్ట్ లేదా ఎండోక్రినాలజిస్ట్‌ను సంప్రదించండి.' : 'Schedule pelvic ultrasound and serum androgen panel with your physician.',
          scientificRationale: 'Accurate clinical staging according to Rotterdam 2004 consensus criteria.',
          priority: riskLevel === 'high' ? 'urgent' : 'medium',
        },
      ];
    }

    // 3. Persist Assessment & Recommendations into Supabase PostgreSQL
    let assessmentId: string | null = null;
    try {
      const assessRes = await this.databaseService.query(
        `INSERT INTO public.ai_assessments (
           user_id, assessment_type, risk_level, confidence_score, clinical_indicators, summary
         ) VALUES ($1, 'pcos_risk', $2, $3, $4, $5)
         RETURNING id;`,
        [
          userId,
          riskLevel,
          (riskScore / 100).toFixed(3),
          JSON.stringify({ flags, inputs: dto }),
          aiSummary,
        ]
      );
      assessmentId = assessRes.rows[0]?.id;

      if (assessmentId && recommendations.length > 0) {
        for (const rec of recommendations) {
          await this.databaseService.query(
            `INSERT INTO public.ai_recommendations (
               assessment_id, user_id, domain, title, action_item, scientific_rationale, priority
             ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              assessmentId,
              userId,
              rec.domain,
              rec.title,
              rec.actionItem,
              rec.scientificRationale,
              rec.priority,
            ]
          );
        }
      }

      // Record in audit model_outputs
      await this.databaseService.query(
        `INSERT INTO public.model_outputs (
           user_id, prompt_type, model_version, inference_duration_ms, response_payload
         ) VALUES ($1, 'pcos_assessment', 'gemini-2.5-flash', $2, $3)`,
        [
          userId,
          Date.now() - startTime,
          JSON.stringify({ riskLevel, riskScore, flags, recommendationsCount: recommendations.length }),
        ]
      );
    } catch (persistErr: any) {
      this.logger.error(`Failed to persist AI assessment to Supabase: ${persistErr.message}`);
    }

    return {
      assessmentId,
      riskLevel,
      riskScore,
      clinicalIndicators: flags,
      summary: aiSummary,
      recommendations,
      persistedInSupabase: !!assessmentId,
      inferenceLatencyMs: Date.now() - startTime,
    };
  }

  async consult(prompt: string, lang = 'en', track = 'pcos') {
    const tenglishMarkers = ['naku', 'naaku', 'undi', 'unnayi', 'cheddam', 'anukuntunna', 'em thinali', 'avvali', 'entha', 'ela', 'kavali'];
    const isTenglish = lang === 'en' && tenglishMarkers.some(marker => prompt.toLowerCase().includes(marker));
    const responseLanguage = lang === 'te' ? 'Telugu (తెలుగు)' : isTenglish ? 'Tenglish: Telugu mixed with English written in Latin script' : 'English';

    // Pre-inference Clinical Safety Screener
    const redFlags = ['severe bleeding', 'acute pain', 'fainting', 'sudden collapse', 'తీవ్ర రక్తస్రావం', 'తీవ్ర కడుపునొప్పి'];
    const isEmergency = redFlags.some(rf => prompt.toLowerCase().includes(rf.toLowerCase()));

    if (isEmergency) {
      const emergencyResponse = lang === 'te'
        ? '⚠️ అత్యవసర హెచ్చరిక: మీరు పేర్కొన్న లక్షణాలు (తీవ్ర నొప్పి లేదా రక్తస్రావం) తక్షణ వైద్య సహాయం అవసరమైనవి కావచ్చు. దయచేసి సమీపంలోని వైద్యుడిని లేదా అత్యవసర విభాగాన్ని వెంటనే సంప్రదించండి.'
        : isTenglish
        ? '⚠️ Mee symptoms severe pain or abnormal bleeding laga unnayi. Immediate ga doctor ni contact cheyyandi or nearest emergency department ki vellandi.'
        : '⚠️ CLINICAL ESCALATION ALERT: The symptoms you described (acute severe pain or abnormal bleeding) require immediate in-person medical evaluation. Please contact a registered gynecologist or visit the nearest healthcare facility immediately.';
      return { content: emergencyResponse, safetyTier: 'high' };
    }

    if (this.geminiApiKey) {
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: `You are the VitaWise Health Intelligence Assistant.
Domain: PCOS Awareness & Nutrition (ICMR-NIN Indian Dietary Guidelines).
Safety Rules:
1. Do NOT diagnose or prescribe pharmaceuticals.
2. Ground advice in Indian nutrition (millets, pulses, lifestyle habits) and PCOS hormonal balance.
3. Language: Respond in ${responseLanguage}. Understand imperfect grammar and mixed Telugu-English input.
User Query: ${prompt}`,
                    },
                  ],
                },
              ],
            }),
          }
        );
        const data = await geminiRes.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return { content: text, safetyTier: 'standard' };
        }
      } catch (err: any) {
        this.logger.warn(`Gemini consult inference failed: ${err.message}`);
      }
    }

    const fallbackText = lang === 'te'
      ? `విశ్లేషణ: మీ అభ్యర్థనకు సంబంధించి ICMR మార్గదర్శకాల ప్రకారం, చిరుధాన్యాలు (కొర్రలు, రాగులు) మరియు పప్పుధాన్యాలు ఇన్సులిన్ స్థాయిలను సమతుల్యం చేయడంలో సహాయపడతాయి. రోజువారీ 30 నిమిషాల వ్యాయామం PCOS లక్షణాలను నియంత్రించడంలో కీలకం.`
      : isTenglish
      ? `Mee question ni batti, millets, sprouts, pulses laanti foods and regular activity helpful ga untayi. Specific symptoms severe ga unte doctor ni consult cheyyandi.`
      : `Analysis: Grounded in ICMR-NIN guidelines and endocrine research, prioritizing low-glycemic traditional foods (sprouted moong, foxtail millets) helps steady postprandial glucose. Consistent light physical activity enhances insulin sensitivity.`;

    return { content: fallbackText, safetyTier: 'standard' };
  }
}

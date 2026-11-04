/**
 * VitaWise Health Record & Family Diet Intelligence Module
 * 
 * Features:
 * 1. Family Members Diet Plans: Displays 1 card per family member in Diet page.
 *    Tapping on any member card opens their tailored daily diet plan & macros modal.
 * 2. Health Record Journal:
 *    Tracks full day meals & exact quantities:
 *    - Morning Tiffin (Breakfast) + Quantity + Time
 *    - Mid-Morning Snack (10AM-12PM) + Quantity + Time
 *    - Afternoon Lunch + Quantity + Time
 *    - Evening Snacks (4PM-6PM) + Quantity + Time
 *    - Night Dinner + Quantity + Time
 *    - Late Night / Extra Foods / Drinks + Quantity + Time
 *    - Physical symptoms / pains / discomfort / illness
 * 3. Aloka AI Clinical Diagnosis & Correlation Engine:
 *    Analyzes all meals, quantities, and timings against reported symptoms or diseases.
 *    Pinpoints the root-cause trigger food/combination and provides immediate actionable solutions,
 *    home remedies, and tomorrow's corrective meal plan.
 */

(function () {
  'use strict';

  // In-memory cache & storage keys
  const STORAGE_KEY_HEALTH_RECORDS = 'vitawise_health_records';
  let activeSelectedMemberForDiet = null;

  // Default household diet plan profiles for standard clinical personas
  const DEFAULT_DIET_PROFILES = {
    head: {
      goal: 'High Protein, Clean Fuel & Metabolic Efficiency',
      dietType: 'High-Fiber Balanced (ICMR-NIN Aligned)',
      calories: '2,250 kcal',
      protein: '115 g',
      carbs: '235 g',
      fats: '55 g',
      meals: [
        { slot: 'Morning Tiffin (08:30 AM)', icon: 'soup', food: 'Foxtail Millet Idlis (3 pcs) + Vegetable Sambhar + Coconut-Mint Chutney', portion: '3 Idlis, 1 bowl Sambhar (200ml)', notes: 'Low GI, high dietary fiber, sustained morning glucose' },
        { slot: 'Mid-Morning Snack (11:15 AM)', icon: 'apple', food: 'Fresh Tender Coconut Water + Handful of Soaked Almonds & Walnuts', portion: '250 ml Coconut water, 8 Almonds', notes: 'Natural potassium electrolytes, brain omega-3 fats' },
        { slot: 'Afternoon Lunch (01:30 PM)', icon: 'utensils', food: 'Unpolished Brown Rice / 3 Multigrain Phulkas + Dal Tadka + Palak Paneer Sabzi + Fresh Curd', portion: '1.5 cups Rice / 3 Rotis, 1 cup Dal, 1 cup Sabzi, 100g Curd', notes: 'Complete amino acid profile & digestive probiotics' },
        { slot: 'Evening Snacks (05:00 PM)', icon: 'coffee', food: 'Roasted Chana / Makhana Chaat + Green Tea with Lemon', portion: '1 medium bowl (40g) roasted chana, 1 cup tea', notes: 'Zero trans-fat crunch, zinc & bioflavonoids' },
        { slot: 'Night Dinner (08:30 PM)', icon: 'utensils', food: '2 Jowar / Multigrain Rotis + Lauki Moong Dal + Mixed Veggie Clear Soup', portion: '2 Rotis, 1 bowl Dal, 1 large bowl warm soup', notes: 'Light on gastric load, anti-inflammatory, 2.5h before sleep' }
      ],
      clinicalNotes: 'Ensure minimum 3.0 Litres of water daily. Avoid deep-fried snacks after sunset to protect circadian acid rhythm.'
    },
    mother: {
      goal: 'Hormone Harmony, Bone Density & Low Glycemic Rhythm',
      dietType: 'Antioxidant & Calcium Rich',
      calories: '1,800 kcal',
      protein: '80 g',
      carbs: '210 g',
      fats: '48 g',
      meals: [
        { slot: 'Morning Tiffin (08:30 AM)', icon: 'soup', food: 'Ragi Vegetable Dosa + Roasted Chana Dal Chutney + Warm Methi Tea', portion: '2 medium Dosas, 2 tbsp Chutney', notes: 'Rich in bioavailable calcium & iron, stabilizes morning insulin' },
        { slot: 'Mid-Morning Snack (11:15 AM)', icon: 'apple', food: 'Papaya / Pomegranate Bowl with Chia & Sunflower Seeds', portion: '1 medium bowl (150g)', notes: 'Enzyme papain supports digestive ease & collagen' },
        { slot: 'Afternoon Lunch (01:30 PM)', icon: 'utensils', food: 'Samai (Little Millet) Khichdi / 2 Phulkas + Drumstick Sambar + Methi Sabzi + Buttermilk', portion: '1.5 cups Millet khichdi, 1 cup Sambar, 1 glass Buttermilk', notes: 'High magnesium for endocrine recovery & bone strength' },
        { slot: 'Evening Snacks (05:00 PM)', icon: 'coffee', food: 'Roasted Makhana + Warm Chamomile / Ginger Infusion', portion: '1 small bowl (30g)', notes: 'Calming nervous system regulation & zero acid load' },
        { slot: 'Night Dinner (08:15 PM)', icon: 'utensils', food: '2 Multigrain Phulkas + Yellow Moong Dal + Steamed Bottle Gourd (Lauki)', portion: '2 Phulkas, 1 cup Dal, 1 cup Steamed Lauki', notes: 'Easy gastric emptying, avoids nocturnal indigestion' }
      ],
      clinicalNotes: 'Prioritize calcium absorption: get 15 mins morning sunlight. Keep salt moderate to maintain healthy blood pressure.'
    },
    father: {
      goal: 'Cardiovascular Vitality & Steady Glycemic Load',
      dietType: 'Heart-Healthy Low Sodium & High Fiber',
      calories: '1,900 kcal',
      protein: '85 g',
      carbs: '220 g',
      fats: '45 g',
      meals: [
        { slot: 'Morning Tiffin (08:30 AM)', icon: 'soup', food: 'Sprouted Moong & Vegetable Poha + Boiled Egg White / Tofu', portion: '1 large bowl Poha, 2 Egg Whites', notes: 'Slow burning complex carbs, low glycemic index' },
        { slot: 'Mid-Morning Snack (11:15 AM)', icon: 'apple', food: 'Soaked Fenugreek (Methi) Water + 1 Fresh Guava / Green Apple', portion: '1 glass water, 1 fruit', notes: 'Soluble fiber balances postprandial glucose trajectory' },
        { slot: 'Afternoon Lunch (01:30 PM)', icon: 'utensils', food: 'Foxtail Millet / Samai Rice + Lauki Chana Dal + Cucumber Tomato Salad', portion: '1 cup cooked Millets, 1 cup Dal, 1 bowl Salad', notes: 'Cardiac lipid management & arterial endothelium support' },
        { slot: 'Evening Snacks (05:00 PM)', icon: 'coffee', food: 'Boiled Sprouted Chana Sundal with Curry Leaves + Herbal Tea', portion: '1 small cup (50g)', notes: 'Rich in dietary fiber and vascular bioflavonoids' },
        { slot: 'Night Dinner (08:30 PM)', icon: 'utensils', food: 'Clear Vegetable Herb Broth + 2 Phulkas with Dal Tadka', portion: '1 large bowl soup, 2 soft phulkas', notes: 'Gentle on gut, eliminates nocturnal gastro-esophageal reflux' }
      ],
      clinicalNotes: 'Limit table salt and fried savories. Gentle 15-min pacing walk after dinner recommended by cardiology guidelines.'
    },
    child: {
      goal: 'Active Growth, Cognitive Focus & Muscle Development',
      dietType: 'Nutrient-Dense & Micronutrient Rich',
      calories: '2,100 kcal',
      protein: '92 g',
      carbs: '260 g',
      fats: '60 g',
      meals: [
        { slot: 'Morning Tiffin (08:00 AM)', icon: 'soup', food: 'Paneer Stuffed Besan Chilla / Boiled Eggs + Warm Spiced Milk', portion: '2 Chillas, 1 glass (200ml) Milk', notes: 'High biological value protein for muscle & brain development' },
        { slot: 'Mid-Morning Snack (11:00 AM)', icon: 'apple', food: 'Banana with Peanut Butter + Handful of Raisins & Dates', portion: '1 Banana, 1 tbsp Peanut butter, 4 Dates', notes: 'Instant natural glycogen and bioavailable iron' },
        { slot: 'Afternoon Lunch (01:00 PM)', icon: 'utensils', food: 'Soft Phulkas with Pure Ghee + Rajma / Dal Makhani + Fresh Curd', portion: '3 Rotis, 1 cup Rajma, 1 cup Curd', notes: 'Sustained cognitive energy for study & sports activity' },
        { slot: 'Evening Snacks (04:45 PM)', icon: 'coffee', food: 'Homemade Paneer Veggie Roll or Corn Chaat + Coconut Water', portion: '1 roll or 1 cup corn, 1 glass coconut water', notes: 'Post-school play muscle replenishment' },
        { slot: 'Night Dinner (08:30 PM)', icon: 'utensils', food: 'Mild Vegetable Pulao / Roti with Paneer Curry + Carrot Salad', portion: '1.5 cups Pulao, 1 cup Curry', notes: 'Zinc, Vitamin A, and restorative deep sleep minerals' }
      ],
      clinicalNotes: 'Ensure hydration before outdoor sports. Limit artificial packaged snacks and refined sugars.'
    }
  };

  /**
   * Helper: Get relationship profile key
   */
  function getProfileKeyForMember(m) {
    const rel = String(m.relationship || '').toLowerCase();
    const gender = String(m.gender || '').toLowerCase();
    const isHead = m.role === 'family_head' || m.role === 'admin' || m.isFamilyHead;
    if (isHead) return 'head';
    if (['mother', 'wife', 'sister'].includes(rel) || (gender === 'female' && m.age >= 35)) return 'mother';
    if (['father', 'husband', 'brother'].includes(rel) || (gender === 'male' && m.age >= 45)) return 'father';
    if (['son', 'daughter', 'child'].includes(rel) || (m.age && m.age < 22)) return 'child';
    return gender === 'female' ? 'mother' : 'head';
  }

  /**
   * Render 1 Card per Family Member in Diet Page (#family-diet-cards-grid)
   */
  window.renderFamilyDietPlans = async function () {
    const grid = document.getElementById('family-diet-cards-grid');
    if (!grid) return;

    // Collect members from activeFamilyData or VitaWiseApi
    let members = [];
    try {
      if (window.activeFamilyData && window.activeFamilyData.members && window.activeFamilyData.members.length) {
        members = window.activeFamilyData.members;
      } else if (window.VitaWiseApi?.family?.getDashboard) {
        const data = await window.VitaWiseApi.family.getDashboard();
        if (data && data.members && data.members.length) {
          members = data.members;
          window.activeFamilyData = data;
        }
      }
    } catch (e) {
      console.warn('[FamilyDiet] Error loading family members:', e);
    }

    // If no members returned, provide standard household demo members
    if (!members.length) {
      const user = window.VitaWiseApi?.getUser() || {};
      const userName = user.fullName || user.name || 'Sairishi';
      members = [
        { id: 'mem_head', full_name: userName, relationship: 'Head', role: 'family_head', gender: user.gender || 'male', age: user.age || 28 },
        { id: 'mem_mother', full_name: 'Sunitha (Mother)', relationship: 'Mother', role: 'member', gender: 'female', age: 52 },
        { id: 'mem_father', full_name: 'Subbarao (Father)', relationship: 'Father', role: 'member', gender: 'male', age: 58 },
        { id: 'mem_child', full_name: 'Kiran (Son)', relationship: 'Son', role: 'member', gender: 'male', age: 14 }
      ];
    }

    grid.innerHTML = members.map(m => {
      const pKey = getProfileKeyForMember(m);
      const plan = DEFAULT_DIET_PROFILES[pKey] || DEFAULT_DIET_PROFILES.head;
      const memberName = m.display_name || m.full_name || m.fullName || 'Family Member';
      const isHead = m.role === 'family_head' || m.role === 'admin' || m.isFamilyHead || pKey === 'head';
      const relLabel = m.relationship ? (m.relationship.charAt(0).toUpperCase() + m.relationship.slice(1)) : (isHead ? 'Head' : 'Member');

      const avatarSvg = window.vwIcon ? window.vwIcon('user', { size: 24 }) : 'U';

      return `
        <article class="vw-member-card btn-tap-diet-card" data-member-id="${m.user_id || m.id}" style="cursor: pointer; display: flex; flex-direction: column; transition: transform 0.2s ease, box-shadow 0.2s ease; border: 1.5px solid #ECE7DF; border-radius: 18px; padding: 1.25rem; background: #FFFFFF; box-shadow: 0 4px 15px rgba(0,0,0,0.03);" role="button" tabindex="0" title="Tap to view ${memberName}'s diet plan">
          <div style="display: flex; align-items: center; gap: 0.85rem; margin-bottom: 0.85rem;">
            <span style="width: 48px; height: 48px; border-radius: 50%; background: #FAF0F2; color: #710014; display: flex; align-items: center; justify-content: center; border: 1.5px solid #F3D9DF; flex-shrink: 0;">${avatarSvg}</span>
            <div style="min-width: 0; flex: 1;">
              <h4 style="margin: 0; font-size: 1.05rem; font-weight: 800; color: #161616; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${memberName}</h4>
              <div style="display: flex; gap: 0.4rem; align-items: center; margin-top: 0.2rem;">
                <span class="vw-badge" style="font-size: 0.72rem; font-weight: 700; background: ${isHead ? '#710014' : '#F4F1EA'}; color: ${isHead ? '#fff' : '#4A4641'}; padding: 0.15rem 0.5rem; border-radius: 6px;">${isHead ? 'Family Head' : relLabel}</span>
                ${m.age ? `<span style="font-size: 0.75rem; color: #6E6862; font-weight: 600;">${m.age} yrs</span>` : ''}
              </div>
            </div>
          </div>

          <div style="background: #FAF8F5; border: 1px solid #ECE7DF; border-radius: 10px; padding: 0.75rem; margin-bottom: 0.85rem;">
            <div style="font-size: 0.72rem; text-transform: uppercase; font-weight: 700; color: #710014; letter-spacing: 0.5px; margin-bottom: 0.25rem;">Nutrition Focus</div>
            <p style="margin: 0; font-size: 0.84rem; color: #161616; font-weight: 600; line-height: 1.4;">${plan.goal}</p>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.8rem; margin-bottom: 1rem;">
            <div style="background: #FFF; border: 1px solid #EAE6DE; border-radius: 8px; padding: 0.4rem 0.6rem;">
              <span style="display: block; font-size: 0.68rem; color: #8A847C; text-transform: uppercase; font-weight: 700;">Target Calories</span>
              <strong style="font-size: 0.95rem; color: #710014;">${plan.calories}</strong>
            </div>
            <div style="background: #FFF; border: 1px solid #EAE6DE; border-radius: 8px; padding: 0.4rem 0.6rem;">
              <span style="display: block; font-size: 0.68rem; color: #8A847C; text-transform: uppercase; font-weight: 700;">Target Protein</span>
              <strong style="font-size: 0.95rem; color: #161616;">${plan.protein}</strong>
            </div>
          </div>

          <div style="margin-top: auto; padding-top: 0.75rem; border-top: 1px solid #ECE7DF;">
            <button class="vw-btn vw-btn-primary vw-btn-sm" type="button" style="width: 100%; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 0.4rem;">
              <span>View ${memberName}'s Diet Plan</span>
              <span>&rarr;</span>
            </button>
          </div>
        </article>
      `;
    }).join('');

    // Bind card clicks
    grid.querySelectorAll('.btn-tap-diet-card').forEach(card => {
      card.addEventListener('click', () => {
        const memId = card.dataset.memberId;
        const member = members.find(x => (x.user_id || x.id) === memId) || members[0];
        const pKey = getProfileKeyForMember(member);
        const plan = DEFAULT_DIET_PROFILES[pKey] || DEFAULT_DIET_PROFILES.head;
        openFamilyDietModal(member, plan);
      });
    });
  };

  // ========================================================
  // PERSONALIZED GOAL-BASED DIET PLANS MODULE
  // ========================================================
  let currentDietPlan = null;
  let currentDietProfile = null;
  let selectedGoalForCustomization = null;

  const DIET_GOAL_NAMES = {
    bulking: 'Bulking / Muscle Gain',
    fat_loss: 'Fat Loss / Cutting',
    protein_focus: 'Protein Focus',
    weight_maintenance: 'Weight Maintenance',
    balanced_healthy: 'Balanced Healthy Diet'
  };

  const DIET_GOAL_ICONS = {
    bulking: 'dumbbell',
    fat_loss: 'target',
    protein_focus: 'dumbbell',
    weight_maintenance: 'scale',
    balanced_healthy: 'utensils'
  };

  function getDietAuthHeader() {
    const token = window.VitaWiseApi?.getSessionToken?.() || localStorage.getItem('vitawise_token') || localStorage.getItem('supabase_auth_token') || '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  function getDietApiUrl(endpoint) {
    if (typeof window !== 'undefined' && typeof window.VitaWiseApi?.getApiBase === 'function') {
      const base = window.VitaWiseApi.getApiBase();
      return `${base}${endpoint}`;
    }
    const host = typeof window !== 'undefined' ? (window.location.hostname || '') : '';
    const isLocalhost = host === 'localhost' || host === '127.0.0.1';
    if (!isLocalhost) return endpoint;
    const port = typeof window !== 'undefined' ? window.location.port : '';
    if (port === '3001') return endpoint;
    return `http://${host || '127.0.0.1'}:3001${endpoint}`;
  }

  /**
   * Safely parses an HTTP fetch Response.
   * Prevents "Unexpected end of JSON input" and "Unexpected token" syntax crashes.
   * Handles empty responses, HTML error pages, and non-JSON payloads gracefully.
   *
   * @param {Response} res
   * @returns {Promise<{ ok: boolean, status: number, data: any, error: string|null }>}
   */
  async function parseSafeJsonResponse(res) {
    if (!res) {
      return {
        ok: false,
        status: 0,
        data: null,
        error: 'Network request failed. No response received from server.'
      };
    }

    let rawText = '';
    try {
      rawText = await res.text();
    } catch (readErr) {
      return {
        ok: false,
        status: res.status || 0,
        data: null,
        error: 'Unable to read the server response body.'
      };
    }

    const trimmed = (rawText || '').trim();

    // 1. Handle empty response body (e.g. 204, 405 empty, network termination)
    if (!trimmed) {
      return {
        ok: false,
        status: res.status,
        data: null,
        error: res.ok
          ? 'Server completed request but returned an empty response.'
          : `Server returned HTTP ${res.status} with an empty response.`
      };
    }

    // 2. Try parsing as JSON
    let parsedJson = null;
    try {
      parsedJson = JSON.parse(trimmed);
    } catch (jsonErr) {
      // Body is not valid JSON (e.g., HTML error page from web server / proxy)
      const isHtml = trimmed.startsWith('<') || trimmed.toLowerCase().includes('<!doctype html>');
      const errorDetail = isHtml
        ? 'HTML response instead of JSON'
        : trimmed.slice(0, 80);

      return {
        ok: false,
        status: res.status,
        data: null,
        error: res.ok
          ? `Server returned non-JSON data (${errorDetail}).`
          : `Server returned HTTP ${res.status} error (${errorDetail}).`
      };
    }

    // 3. Successfully parsed JSON
    const hasSuccessFlag = parsedJson && typeof parsedJson === 'object' && ('success' in parsedJson);
    const isSuccess = res.ok && (!hasSuccessFlag || parsedJson.success !== false);

    let extractedError = null;
    if (!isSuccess) {
      extractedError = parsedJson?.message || parsedJson?.error || `Request failed with HTTP status ${res.status}.`;
    }

    return {
      ok: isSuccess,
      status: res.status,
      data: parsedJson,
      error: extractedError
    };
  }

  let isDietModuleInitialized = false;
  let isDietPlanLoading = false;
  let dietPlanFetchPromise = null;

  /**
   * Initialize Personalized Diet Module (Idempotent & Deduplicated)
   */
  window.initPersonalizedDietModule = async function (forceReload = false) {
    const section = document.getElementById('view-diet') || document.getElementById('vw-diet-personalized-section') || document.getElementById('vw-diet-goal-selector-card');
    if (!section) return;

    bindDietGoalCardClicks();
    if (!isDietModuleInitialized) {
      bindDietProfileFormEvents();
      bindDietActivePlanActions();
      isDietModuleInitialized = true;
    }

    if (!currentDietPlan || forceReload) {
      await loadUserPersonalizedDietPlan();
    }
  };

  /**
   * Load active diet plan & user profile from backend (Deduplicated with in-flight lock)
   */
  async function loadUserPersonalizedDietPlan() {
    if (isDietPlanLoading && dietPlanFetchPromise) {
      return dietPlanFetchPromise;
    }

    const goalSelectorCard = document.getElementById('vw-diet-goal-selector-card');
    const profileCompletionCard = document.getElementById('vw-diet-profile-completion-card');
    const loadingCard = document.getElementById('vw-diet-loading-state');
    const activePlanCard = document.getElementById('vw-diet-active-plan-card');

    isDietPlanLoading = true;
    dietPlanFetchPromise = (async () => {
      try {
        const res = await fetch(getDietApiUrl('/api/v1/diet/plan'), {
          headers: getDietAuthHeader()
        }).catch(() => null);

        let data = null;
        if (res) {
          const parsedRes = await parseSafeJsonResponse(res);
          if (parsedRes.ok && parsedRes.data) {
            data = parsedRes.data;
            try {
              localStorage.setItem('vitawise_cached_diet_plan', JSON.stringify(data));
            } catch (_) { }
          }
        }

        if (!data) {
          try {
            data = JSON.parse(localStorage.getItem('vitawise_cached_diet_plan') || 'null');
          } catch (_) { }
        }

        currentDietPlan = data?.plan || null;
        currentDietProfile = data?.profile || null;

        if (currentDietPlan && currentDietPlan.targets) {
          if (goalSelectorCard) goalSelectorCard.style.display = 'none';
          if (profileCompletionCard) profileCompletionCard.style.display = 'none';
          if (loadingCard) loadingCard.style.display = 'none';
          if (activePlanCard) {
            activePlanCard.style.display = 'block';
            renderActiveDietPlan(currentDietPlan, currentDietProfile);
          }
        } else {
          if (activePlanCard) activePlanCard.style.display = 'none';
          if (profileCompletionCard) profileCompletionCard.style.display = 'none';
          if (loadingCard) loadingCard.style.display = 'none';
          if (goalSelectorCard) goalSelectorCard.style.display = 'block';
        }
      } catch (_) {
        if (goalSelectorCard) goalSelectorCard.style.display = 'block';
      } finally {
        isDietPlanLoading = false;
        dietPlanFetchPromise = null;
      }
    })();

    return dietPlanFetchPromise;
  }

  /**
   * Bind Goal Card Clicks
   */
  function bindDietGoalCardClicks() {
    const grid = document.getElementById('vw-diet-goals-grid');
    if (grid && !grid.dataset.bound) {
      grid.dataset.bound = 'true';
      grid.addEventListener('click', (e) => {
        const card = e.target.closest('.vw-diet-goal-opt-card');
        if (!card) return;
        e.preventDefault();
        const goalKey = card.dataset.dietGoal;
        if (goalKey) {
          document.querySelectorAll('.vw-diet-goal-opt-card').forEach(c => {
            c.classList.toggle('selected', c.dataset.dietGoal === goalKey);
          });
          handleDietGoalSelection(goalKey);
        }
      });
      grid.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const card = e.target.closest('.vw-diet-goal-opt-card');
          if (card) {
            e.preventDefault();
            const goalKey = card.dataset.dietGoal;
            if (goalKey) {
              document.querySelectorAll('.vw-diet-goal-opt-card').forEach(c => {
                c.classList.toggle('selected', c.dataset.dietGoal === goalKey);
              });
              handleDietGoalSelection(goalKey);
            }
          }
        }
      });
    }

    const cards = document.querySelectorAll('.vw-diet-goal-opt-card');
    cards.forEach(card => {
      card.onclick = (e) => {
        e.preventDefault();
        const goalKey = card.dataset.dietGoal;
        if (goalKey) {
          document.querySelectorAll('.vw-diet-goal-opt-card').forEach(c => {
            c.classList.toggle('selected', c.dataset.dietGoal === goalKey);
          });
          handleDietGoalSelection(goalKey);
        }
      };
    });
  }

  /**
   * Handle user choosing a goal
   */
  async function handleDietGoalSelection(goalKey) {
    selectedGoalForCustomization = goalKey;
    const goalName = DIET_GOAL_NAMES[goalKey] || 'Diet Plan';

    const goalSelectorCard = document.getElementById('vw-diet-goal-selector-card');
    const profileCompletionCard = document.getElementById('vw-diet-profile-completion-card');
    const loadingCard = document.getElementById('vw-diet-loading-state');
    const activePlanCard = document.getElementById('vw-diet-active-plan-card');

    // Ensure we have current user profile
    if (!currentDietProfile) {
      try {
        const res = await fetch(getDietApiUrl('/api/v1/auth/me'), { headers: getDietAuthHeader() });
        const parsedMe = await parseSafeJsonResponse(res);
        if (parsedMe.ok && parsedMe.data && parsedMe.data.user) {
          currentDietProfile = parsedMe.data.user;
        }
      } catch (_) { }
    }

    const prof = currentDietProfile || {};

    // Determine missing fields
    const missing = [];
    if (!prof.age && !prof.dob) missing.push('age');
    if (!prof.weightKg) missing.push('weightKg');
    if (!prof.heightCm) missing.push('heightCm');
    if (!prof.gender) missing.push('gender');
    if (!prof.activityLevel) missing.push('activityLevel');
    if (!prof.dietaryPreference) missing.push('dietaryPreference');

    if (missing.length > 0) {
      if (goalSelectorCard) goalSelectorCard.style.display = 'none';
      if (activePlanCard) activePlanCard.style.display = 'none';
      if (loadingCard) loadingCard.style.display = 'none';
      if (profileCompletionCard) {
        profileCompletionCard.style.display = 'block';
        renderProfileCompletionForm(goalKey, missing, prof);
        profileCompletionCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } else {
      await executeGeneratePlan(goalKey, goalName, {});
    }
  }

  /**
   * Render the inline profile completion form asking ONLY for missing fields
   */
  function renderProfileCompletionForm(goalKey, missingFields, profile) {
    const goalTitleEl = document.getElementById('vw-target-goal-title');
    if (goalTitleEl) goalTitleEl.textContent = DIET_GOAL_NAMES[goalKey] || goalKey;

    const badgesContainer = document.getElementById('vw-diet-verified-badges');
    const verifiedWrapper = document.getElementById('vw-diet-verified-wrapper');
    const fieldsContainer = document.getElementById('vw-diet-missing-fields-container');
    const errorEl = document.getElementById('vw-diet-profile-error');

    if (errorEl) {
      errorEl.style.display = 'none';
      errorEl.textContent = '';
    }

    // 1. Build verified badges for data ALREADY known
    const verifiedBadges = [];
    if (profile.age || profile.dob) {
      const ageVal = profile.age || (profile.dob ? Math.floor((Date.now() - new Date(profile.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : null);
      if (ageVal) verifiedBadges.push(`Age: ${ageVal} yrs`);
    }
    if (profile.weightKg) verifiedBadges.push(`Weight: ${profile.weightKg} kg`);
    if (profile.heightCm) verifiedBadges.push(`Height: ${profile.heightCm} cm`);
    if (profile.gender) {
      const gLabel = profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1);
      verifiedBadges.push(`Gender: ${gLabel}`);
    }
    if (profile.activityLevel) {
      const actLabels = { sedentary: 'Sedentary', light: 'Lightly Active', moderate: 'Moderately Active', very_active: 'Very Active' };
      verifiedBadges.push(`Activity: ${actLabels[profile.activityLevel] || profile.activityLevel}`);
    }
    if (profile.dietaryPreference) {
      const dietLabels = { vegetarian: 'Vegetarian', non_vegetarian: 'Non-Vegetarian', eggetarian: 'Eggetarian', vegan: 'Vegan', other: 'Other' };
      verifiedBadges.push(`Diet: ${dietLabels[profile.dietaryPreference] || profile.dietaryPreference}`);
    }

    if (badgesContainer) {
      if (verifiedBadges.length > 0) {
        if (verifiedWrapper) verifiedWrapper.style.display = 'block';
        badgesContainer.innerHTML = verifiedBadges.map(b => `
          <span style="display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; font-weight: 700; background: #FFFFFF; color: #161616; padding: 0.25rem 0.65rem; border-radius: 8px; border: 1px solid #ECE7DF;">
            <span class="vw-inline-icon-wrap" style="color: #710014; margin-right: 0.35rem;">${window.vwIcon ? window.vwIcon('check', { size: 14, color: '#710014' }) : ''}</span>${b}
          </span>
        `).join('');
      } else {
        if (verifiedWrapper) verifiedWrapper.style.display = 'none';
      }
    }

    // 2. Build input fields ONLY for missing items
    let inputsHtml = '';

    if (missingFields.includes('age')) {
      inputsHtml += `
        <div class="vw-form-group">
          <label class="vw-label" for="diet-field-age" style="font-size: 0.8rem; font-weight: 700; color: #161616;">Age (years) <span style="color: #710014;">*</span></label>
          <input type="number" id="diet-field-age" class="vw-input" min="14" max="110" placeholder="e.g. 28" required style="border-radius: 10px; font-weight: 600;">
        </div>
      `;
    }

    if (missingFields.includes('weightKg')) {
      inputsHtml += `
        <div class="vw-form-group">
          <label class="vw-label" for="diet-field-weight" style="font-size: 0.8rem; font-weight: 700; color: #161616;">Weight (kg) <span style="color: #710014;">*</span></label>
          <input type="number" id="diet-field-weight" class="vw-input" step="0.1" min="30" max="250" placeholder="e.g. 68.5" required style="border-radius: 10px; font-weight: 600;">
        </div>
      `;
    }

    if (missingFields.includes('heightCm')) {
      inputsHtml += `
        <div class="vw-form-group">
          <label class="vw-label" for="diet-field-height" style="font-size: 0.8rem; font-weight: 700; color: #161616;">Height (cm) <span style="color: #710014;">*</span></label>
          <input type="number" id="diet-field-height" class="vw-input" step="0.5" min="100" max="240" placeholder="e.g. 175" required style="border-radius: 10px; font-weight: 600;">
        </div>
      `;
    }

    if (missingFields.includes('gender')) {
      inputsHtml += `
        <div class="vw-form-group">
          <label class="vw-label" for="diet-field-gender" style="font-size: 0.8rem; font-weight: 700; color: #161616;">Gender <span style="color: #710014;">*</span></label>
          <select id="diet-field-gender" class="vw-select" required style="border-radius: 10px; font-weight: 600;">
            <option value="">Select gender...</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
      `;
    }

    if (missingFields.includes('activityLevel')) {
      inputsHtml += `
        <div class="vw-form-group">
          <label class="vw-label" for="diet-field-activity" style="font-size: 0.8rem; font-weight: 700; color: #161616;">Daily Activity / Training Level <span style="color: #710014;">*</span></label>
          <select id="diet-field-activity" class="vw-select" required style="border-radius: 10px; font-weight: 600;">
            <option value="">Select activity level...</option>
            <option value="sedentary">Sedentary (Desk work, little exercise)</option>
            <option value="light">Lightly Active (Light exercise 1-3 days/week)</option>
            <option value="moderate" selected>Moderately Active (Workout 3-5 days/week)</option>
            <option value="very_active">Very Active (Heavy training 6-7 days/week)</option>
          </select>
        </div>
      `;
    }

    if (missingFields.includes('dietaryPreference')) {
      inputsHtml += `
        <div class="vw-form-group">
          <label class="vw-label" for="diet-field-preference" style="font-size: 0.8rem; font-weight: 700; color: #161616;">Food Preference <span style="color: #710014;">*</span></label>
          <select id="diet-field-preference" class="vw-select" required style="border-radius: 10px; font-weight: 600;">
            <option value="">Select food preference...</option>
            <option value="vegetarian" selected>Vegetarian (Plant &amp; dairy whole foods)</option>
            <option value="non_vegetarian">Non-Vegetarian (Eggs, poultry, fish &amp; whole foods)</option>
            <option value="eggetarian">Eggetarian (Vegetarian + eggs)</option>
            <option value="vegan">Vegan (100% plant-based)</option>
            <option value="other">Other / Mixed</option>
          </select>
        </div>
      `;
    }

    if (!profile.allergies || profile.allergies === 'None reported') {
      inputsHtml += `
        <div class="vw-form-group">
          <label class="vw-label" for="diet-field-allergies" style="font-size: 0.8rem; font-weight: 700; color: #161616;">Food Allergies / Foods to Avoid <span style="font-size: 0.72rem; color: #8A847C; font-weight: 400;">(Optional)</span></label>
          <input type="text" id="diet-field-allergies" class="vw-input" placeholder="e.g. dairy, peanuts, gluten, or none" style="border-radius: 10px; font-weight: 500;">
        </div>
      `;
    }

    if (fieldsContainer) {
      fieldsContainer.innerHTML = inputsHtml;
    }
  }

  /**
   * Bind event listeners for missing form & active plan buttons
   */
  function bindDietProfileFormEvents() {
    const form = document.getElementById('vw-diet-missing-form');
    const cancelBtn = document.getElementById('btn-cancel-profile-completion');
    const errorEl = document.getElementById('vw-diet-profile-error');

    if (cancelBtn) {
      cancelBtn.onclick = () => {
        const goalSelectorCard = document.getElementById('vw-diet-goal-selector-card');
        const profileCompletionCard = document.getElementById('vw-diet-profile-completion-card');
        if (profileCompletionCard) profileCompletionCard.style.display = 'none';
        if (goalSelectorCard) goalSelectorCard.style.display = 'block';
      };
    }

    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        if (errorEl) errorEl.style.display = 'none';

        const goalKey = selectedGoalForCustomization || 'balanced_healthy';
        const goalName = DIET_GOAL_NAMES[goalKey] || 'Diet Plan';

        const ageInput = document.getElementById('diet-field-age');
        const weightInput = document.getElementById('diet-field-weight');
        const heightInput = document.getElementById('diet-field-height');
        const genderInput = document.getElementById('diet-field-gender');
        const actInput = document.getElementById('diet-field-activity');
        const prefInput = document.getElementById('diet-field-preference');
        const allergiesInput = document.getElementById('diet-field-allergies');

        const profileUpdates = {};
        if (ageInput && ageInput.value) profileUpdates.age = parseInt(ageInput.value, 10);
        if (weightInput && weightInput.value) profileUpdates.weightKg = parseFloat(weightInput.value);
        if (heightInput && heightInput.value) profileUpdates.heightCm = parseFloat(heightInput.value);
        if (genderInput && genderInput.value) profileUpdates.gender = genderInput.value;
        if (actInput && actInput.value) profileUpdates.activityLevel = actInput.value;
        if (prefInput && prefInput.value) profileUpdates.dietaryPreference = prefInput.value;
        if (allergiesInput) profileUpdates.allergies = allergiesInput.value.trim() || 'None reported';

        await executeGeneratePlan(goalKey, goalName, profileUpdates);
      };
    }
  }

  /**
   * Execute Generate Plan API call and update UI
   */
  async function executeGeneratePlan(goalKey, goalName, profileUpdates) {
    const goalSelectorCard = document.getElementById('vw-diet-goal-selector-card');
    const profileCompletionCard = document.getElementById('vw-diet-profile-completion-card');
    const loadingCard = document.getElementById('vw-diet-loading-state');
    const activePlanCard = document.getElementById('vw-diet-active-plan-card');
    const errorEl = document.getElementById('vw-diet-profile-error');
    const submitBtn = document.getElementById('btn-submit-diet-profile');

    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }

    if (goalSelectorCard) goalSelectorCard.style.display = 'none';
    if (profileCompletionCard) profileCompletionCard.style.display = 'none';
    if (activePlanCard) activePlanCard.style.display = 'none';
    if (loadingCard) loadingCard.style.display = 'block';

    const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
    }

    try {
      const res = await fetch(getDietApiUrl('/api/v1/diet/plan'), {
        method: 'POST',
        headers: getDietAuthHeader(),
        body: JSON.stringify({
          goalKey,
          goalName,
          profileUpdates
        })
      });

      const parsedRes = await parseSafeJsonResponse(res);
      const data = parsedRes.data;

      // Handle profile incomplete (requires user to fill missing fields)
      if (data && data.status === 'profile_incomplete') {
        if (loadingCard) loadingCard.style.display = 'none';
        if (profileCompletionCard) {
          profileCompletionCard.style.display = 'block';
          renderProfileCompletionForm(goalKey, data.missingFields || [], data.profile || {});
        }
        return;
      }

      if (!parsedRes.ok || !data || !data.success) {
        const message = parsedRes.error || data?.message || data?.error || 'Unable to generate personalized diet plan.';
        throw new Error(message);
      }

      currentDietPlan = data.plan;
      currentDietProfile = data.profile;

      if (loadingCard) loadingCard.style.display = 'none';
      if (activePlanCard) {
        activePlanCard.style.display = 'block';
        renderActiveDietPlan(currentDietPlan, currentDietProfile);
        activePlanCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (err) {
      console.error('[PersonalizedDiet] Generation error:', err);
      if (loadingCard) loadingCard.style.display = 'none';
      if (profileCompletionCard) {
        profileCompletionCard.style.display = 'block';
        if (errorEl) {
          errorEl.textContent = 'Could not generate plan: ' + (err.message || 'Server communication error.');
          errorEl.style.display = 'inline-block';
        }
      } else if (goalSelectorCard) {
        goalSelectorCard.style.display = 'block';
        if (errorEl) {
          errorEl.textContent = 'Could not generate plan: ' + (err.message || 'Server communication error.');
          errorEl.style.display = 'inline-block';
        }
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        if (originalBtnText) submitBtn.innerHTML = originalBtnText;
      }
    }
  }

  /**
   * Render the active plan in the UI
   */
  function renderActiveDietPlan(plan, profile) {
    if (!plan || !plan.targets) return;

    const goalKey = plan.goalKey || 'balanced_healthy';
    const iconEl = document.getElementById('active-plan-icon');
    const titleEl = document.getElementById('active-plan-title');
    const subtitleEl = document.getElementById('active-plan-subtitle');

    const calsEl = document.getElementById('active-plan-cals');
    const calSubEl = document.getElementById('active-plan-cal-sub');
    const proteinEl = document.getElementById('active-plan-protein');
    const proteinSubEl = document.getElementById('active-plan-protein-sub');
    const carbsEl = document.getElementById('active-plan-carbs');
    const fatsEl = document.getElementById('active-plan-fats');
    const waterEl = document.getElementById('active-plan-water');
    const bodyStatsEl = document.getElementById('active-plan-body-stats');
    const strategyEl = document.getElementById('active-plan-strategy');
    const mealsGrid = document.getElementById('active-plan-meals-grid');

    if (iconEl) iconEl.innerHTML = window.vwIcon ? window.vwIcon(DIET_GOAL_ICONS[goalKey] || 'utensils', { size: 28 }) : '';
    if (titleEl) titleEl.textContent = plan.goalName || DIET_GOAL_NAMES[goalKey] || 'Personalized Diet Plan';
    if (subtitleEl) {
      subtitleEl.textContent = `Calculated on ${new Date(plan.created_at || plan.calculatedAt || Date.now()).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })} based on verified body metrics.`;
    }

    if (calsEl) calsEl.textContent = `${plan.targets.calories.toLocaleString()} kcal`;
    if (calSubEl) calSubEl.textContent = plan.targets.caloriePill || 'Daily Target';
    if (proteinEl) proteinEl.textContent = `${plan.targets.proteinG} g`;
    if (proteinSubEl) proteinSubEl.textContent = `${plan.targets.proteinPerKg || '1.8'} g/kg body weight`;
    if (carbsEl) carbsEl.textContent = `${plan.targets.carbsG} g`;
    if (fatsEl) fatsEl.textContent = `${plan.targets.fatsG} g`;
    if (waterEl) waterEl.textContent = `${plan.targets.waterL} L / day`;

    const snap = plan.profileSnapshot || profile || {};
    if (bodyStatsEl) {
      const gLabel = snap.gender ? (snap.gender.charAt(0).toUpperCase() + snap.gender.slice(1)) : 'Male';
      const dLabel = snap.dietaryPreference ? (snap.dietaryPreference.charAt(0).toUpperCase() + snap.dietaryPreference.slice(1)) : 'Vegetarian';
      bodyStatsEl.innerHTML = `
        <span>Age: <strong>${snap.age || 28} yrs</strong></span> &nbsp;·&nbsp;
        <span>Weight: <strong>${snap.weightKg || 68} kg</strong></span> &nbsp;·&nbsp;
        <span>Height: <strong>${snap.heightCm || 172} cm</strong></span> &nbsp;·&nbsp;
        <span>BMI: <strong>${snap.bmi || '23.0'}</strong></span> &nbsp;·&nbsp;
        <span>Gender: <strong>${gLabel}</strong></span> &nbsp;·&nbsp;
        <span>Diet: <strong>${dLabel}</strong></span>
        ${snap.allergies && snap.allergies !== 'None reported' ? `&nbsp;·&nbsp;<span>Allergies: <strong>${snap.allergies}</strong></span>` : ''}
      `;
    }

    if (strategyEl) {
      strategyEl.textContent = plan.targets.strategy || '';
    }

    if (mealsGrid && Array.isArray(plan.meals)) {
      mealsGrid.innerHTML = plan.meals.map(m => `
        <div class="vw-hr-slot-card" style="background: #FAF8F5; border: 1.5px solid #ECE7DF; border-radius: 16px; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.65rem;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #ECE7DF; padding-bottom: 0.6rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span class="vw-meal-slot-icon" style="display: inline-flex; align-items: center; color: #710014;">${window.vwIcon ? window.vwIcon(m.icon || "utensils", { size: 20 }) : ""}</span>
              <strong style="font-size: 0.96rem; color: #161616;">${m.label || m.slot}</strong>
            </div>
            <span style="font-size: 0.74rem; font-weight: 700; color: #710014; background: #FAF0F2; padding: 0.15rem 0.5rem; border-radius: 6px;">
              ${m.timing || ''}
            </span>
          </div>

          <div>
            <span style="display: block; font-size: 0.72rem; text-transform: uppercase; font-weight: 700; color: #8A847C; margin-bottom: 0.2rem;">Recommended Whole Foods</span>
            <p style="margin: 0; font-size: 0.88rem; font-weight: 600; color: #161616; line-height: 1.45;">${m.foods || 'Wholesome balanced food'}</p>
          </div>

          <div style="background: #FFFFFF; border: 1px solid #EAE6DE; border-radius: 10px; padding: 0.6rem 0.75rem; display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.8rem;">
            <div style="display: flex; justify-content: space-between; gap: 0.5rem;">
              <span style="color: #6E6862; font-weight: 600;">Portion Guidance:</span>
              <span style="color: #161616; font-weight: 700; text-align: right;">${m.portion || 'Balanced serving'}</span>
            </div>
            ${m.protein ? `
              <div style="display: flex; justify-content: space-between; gap: 0.5rem; border-top: 1px solid #FAF8F5; padding-top: 0.25rem;">
                <span style="color: #710014; font-weight: 700;">Protein / Nutrient:</span>
                <span style="color: #710014; font-weight: 700; text-align: right;">${m.protein}</span>
              </div>
            ` : ''}
            ${m.hydration ? `
              <div style="display: flex; justify-content: space-between; gap: 0.5rem; border-top: 1px solid #FAF8F5; padding-top: 0.25rem;">
                <span style="color: #0284C7; font-weight: 600;">Hydration Tip:</span>
                <span style="color: #524B46; font-weight: 600; text-align: right;">${m.hydration}</span>
              </div>
            ` : ''}
          </div>
        </div>
      `).join('');
    }
  }

  /**
   * Bind Active Plan Actions ("Change Goal", "Edit Profile")
   */
  function bindDietActivePlanActions() {
    const changeGoalBtn = document.getElementById('btn-change-diet-goal');
    const editProfileBtn = document.getElementById('btn-edit-diet-profile');

    if (changeGoalBtn) {
      changeGoalBtn.onclick = () => {
        const goalSelectorCard = document.getElementById('vw-diet-goal-selector-card');
        const activePlanCard = document.getElementById('vw-diet-active-plan-card');
        const profileCompletionCard = document.getElementById('vw-diet-profile-completion-card');
        if (activePlanCard) activePlanCard.style.display = 'none';
        if (profileCompletionCard) profileCompletionCard.style.display = 'none';
        if (goalSelectorCard) {
          goalSelectorCard.style.display = 'block';
          goalSelectorCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      };
    }

    if (editProfileBtn) {
      editProfileBtn.onclick = () => {
        const goalKey = currentDietPlan?.goalKey || 'balanced_healthy';
        selectedGoalForCustomization = goalKey;
        const goalSelectorCard = document.getElementById('vw-diet-goal-selector-card');
        const activePlanCard = document.getElementById('vw-diet-active-plan-card');
        const profileCompletionCard = document.getElementById('vw-diet-profile-completion-card');

        if (goalSelectorCard) goalSelectorCard.style.display = 'none';
        if (activePlanCard) activePlanCard.style.display = 'none';
        if (profileCompletionCard) {
          profileCompletionCard.style.display = 'block';
          renderProfileCompletionForm(goalKey, ['weightKg', 'heightCm', 'activityLevel', 'dietaryPreference'], currentDietProfile || {});
          profileCompletionCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      };
    }
  }

  /**
   * Open Detailed Diet Plan Modal for tapped member
   */
  function openFamilyDietModal(member, plan) {
    const modal = document.getElementById('family-diet-plan-modal');
    if (!modal) return;

    activeSelectedMemberForDiet = member;

    const avatarEl = document.getElementById('fdm-avatar');
    const nameEl = document.getElementById('fdm-member-name');
    const roleBadge = document.getElementById('fdm-role-badge');
    const focusSub = document.getElementById('fdm-focus-subtitle');
    const calsEl = document.getElementById('fdm-macro-cals');
    const proteinEl = document.getElementById('fdm-macro-protein');
    const carbsEl = document.getElementById('fdm-macro-carbs');
    const fatsEl = document.getElementById('fdm-macro-fats');
    const mealsContainer = document.getElementById('fdm-meals-container');
    const notesEl = document.getElementById('fdm-clinical-notes');

    const memberName = member.display_name || member.full_name || member.fullName || 'Member';
    const isHead = member.role === 'family_head' || member.role === 'admin' || member.isFamilyHead;
    const relLabel = member.relationship ? (member.relationship.charAt(0).toUpperCase() + member.relationship.slice(1)) : (isHead ? 'Head' : 'Member');

    if (avatarEl) avatarEl.innerHTML = window.vwIcon ? window.vwIcon('user', { size: 24 }) : 'U';
    if (nameEl) nameEl.textContent = `${memberName}'s Diet Plan`;
    if (roleBadge) {
      roleBadge.textContent = isHead ? 'Family Head' : relLabel;
      roleBadge.style.background = isHead ? '#710014' : '#4A4641';
    }
    if (focusSub) focusSub.textContent = plan.goal;
    if (calsEl) calsEl.textContent = plan.calories;
    if (proteinEl) proteinEl.textContent = plan.protein;
    if (carbsEl) carbsEl.textContent = plan.carbs;
    if (fatsEl) fatsEl.textContent = plan.fats;
    if (notesEl) notesEl.textContent = plan.clinicalNotes;

    if (mealsContainer) {
      mealsContainer.innerHTML = plan.meals.map(m => `
        <div style="background: #FFFFFF; border: 1px solid #ECE7DF; border-radius: 12px; padding: 0.9rem 1.1rem; display: flex; gap: 0.85rem; align-items: flex-start;">
          <span class="vw-meal-slot-icon" style="display: inline-flex; align-items: center; color: #710014; flex-shrink: 0; padding-top: 0.15rem;">${window.vwIcon ? window.vwIcon(m.icon || "utensils", { size: 22 }) : ""}</span>
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.2rem; flex-wrap: wrap; gap: 0.4rem;">
              <strong style="font-size: 0.92rem; color: #161616;">${m.slot}</strong>
              <span style="font-size: 0.78rem; font-weight: 700; color: #710014; background: #FAF0F2; padding: 0.15rem 0.5rem; border-radius: 6px;">Portion: ${m.portion}</span>
            </div>
            <p style="margin: 0 0 0.25rem 0; font-size: 0.86rem; color: #332F2B; font-weight: 600;">${m.food}</p>
            <span style="font-size: 0.78rem; color: #6E6862; font-style: italic;">${m.notes}</span>
          </div>
        </div>
      `).join('');
    }

    // Show modal
    modal.classList.add('open');
    modal.style.display = 'flex';
    modal.removeAttribute('aria-hidden');

    // Bind close button once
    const closeBtn = document.getElementById('close-family-diet-modal');
    if (closeBtn && !closeBtn.dataset.bound) {
      closeBtn.dataset.bound = 'true';
      closeBtn.onclick = () => {
        if (modal.contains(document.activeElement)) {
          if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
          }
        }
        modal.classList.remove('open');
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
      };
    }

    // Bind Log Meal button
    const logMealBtn = document.getElementById('btn-fdm-log-meal');
    if (logMealBtn && !logMealBtn.dataset.bound) {
      logMealBtn.dataset.bound = 'true';
      logMealBtn.onclick = () => {
        if (modal.contains(document.activeElement)) {
          if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
          }
        }
        modal.classList.remove('open');
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        if (typeof window.openQuickForm === 'function') {
          window.openQuickForm('meal');
        }
      };
    }

    // Bind Ask Aloka AI button
    const askAiBtn = document.getElementById('btn-fdm-ask-ai');
    if (askAiBtn && !askAiBtn.dataset.bound) {
      askAiBtn.dataset.bound = 'true';
      askAiBtn.onclick = () => {
        modal.classList.remove('open');
        modal.style.display = 'none';
        const targetPrompt = `Review and customize the daily diet plan for my family member ${memberName} (${relLabel}, ${plan.goal}). Give me regional meal variations and metabolic suggestions.`;
        if (typeof window.showView === 'function') {
          window.showView('ai');
          const inputEl = document.getElementById('ai-prompt');
          const formEl = document.getElementById('ai-form');
          if (inputEl) {
            inputEl.value = targetPrompt;
            setTimeout(() => {
              if (formEl) formEl.dispatchEvent(new Event('submit'));
            }, 250);
          }
        }
      };
    }
  }

  /**
   * Health Record Journal System
   */
  window.initHealthRecordView = function () {
    const memberSelect = document.getElementById('hr-member-select');
    const dateInput = document.getElementById('hr-log-date');

    // Set default date to today
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }

    // Populate family members in member select
    if (memberSelect && !memberSelect.dataset.populated) {
      memberSelect.dataset.populated = 'true';
      const user = window.VitaWiseApi?.getUser() || {};
      const isHead = (user.isFamilyHead === true || user.role === 'family_head' || user.role === 'admin' || user.relationship === 'head') && user.role !== 'family_member';
      let members = [
        { id: user.id || 'self', name: `${user.fullName || 'Member'} (Self${isHead ? ' - Head' : ''})` }
      ];

      if (isHead) {
        if (window.activeFamilyData?.members?.length) {
          window.activeFamilyData.members.forEach(m => {
            const mId = m.user_id || m.id;
            if (mId && mId !== user.id) {
              members.push({ id: mId, name: `${m.full_name || m.name} (${m.relationship || 'Member'})` });
            }
          });
        }
      }

      memberSelect.innerHTML = members.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
      if (!isHead) {
        memberSelect.disabled = true;
        const selWrap = memberSelect.closest('.vw-form-group') || memberSelect.parentElement;
        if (selWrap && selWrap.id !== 'hr-header-row') {
          selWrap.style.display = 'none';
        }
      }
    }

    // Bind Quick Preset Chips for each slot
    document.querySelectorAll('.btn-hr-preset').forEach(btn => {
      if (!btn.dataset.bound) {
        btn.dataset.bound = 'true';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const slot = btn.dataset.slot;
          const food = btn.dataset.food;
          const qty = btn.dataset.qty;
          const foodInput = document.getElementById(`hr-food-${slot}`);
          const qtyInput = document.getElementById(`hr-qty-${slot}`);
          if (foodInput) foodInput.value = food;
          if (qtyInput) qtyInput.value = qty;
        });
      }
    });


    // Bind Individual Save Buttons for each of the 6 meal slots
    document.querySelectorAll('.btn-hr-save-slot').forEach(btn => {
      if (!btn.dataset.bound) {
        btn.dataset.bound = 'true';
        btn.addEventListener('click', (e) => {
          if (e) e.preventDefault();
          const slot = btn.dataset.slot;
          if (slot) {
            saveIndividualMealSlot(slot, btn);
          }
        });
      }
    });

    // Bind Date & Member select change listeners for seamless live database loading
    if (dateInput && !dateInput.dataset.changeBound) {
      dateInput.dataset.changeBound = 'true';
      dateInput.addEventListener('change', () => {
        loadHealthRecordForSelectedDateAndMember();
        loadWaterDataForSelectedDateAndMember();
      });
    }

    if (memberSelect && !memberSelect.dataset.changeBound) {
      memberSelect.dataset.changeBound = 'true';
      memberSelect.addEventListener('change', () => {
        loadHealthRecordForSelectedDateAndMember();
        renderHealthRecordHistory();
        loadWaterDataForSelectedDateAndMember();
      });
    }

    // Load active date & member saved intake entries from database
    loadHealthRecordForSelectedDateAndMember();

    // Render Past History List from database
    renderHealthRecordHistory();

    // Initialize Water section events and load water data
    bindWaterSectionEvents();
    loadWaterDataForSelectedDateAndMember();
  };

  /**
   * Water Intake, Progress & History System for Health Record page
   */
  function bindWaterSectionEvents() {
    const toggleBtn = document.getElementById('btn-toggle-water-section');
    const waterSection = document.getElementById('vw-hr-water-section');
    const chevronIcon = document.getElementById('water-chevron-icon');

    if (toggleBtn && !toggleBtn.dataset.bound) {
      toggleBtn.dataset.bound = 'true';
      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!waterSection) return;
        const isHidden = waterSection.style.display === 'none' || !waterSection.style.display;
        waterSection.style.display = isHidden ? 'block' : 'none';
        if (chevronIcon) {
          chevronIcon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
        }
        if (isHidden) {
          loadWaterDataForSelectedDateAndMember();
        }
      });
    }

    const minusBtn = document.getElementById('btn-water-minus');
    const plusBtn = document.getElementById('btn-water-plus');
    const amountInput = document.getElementById('water-input-amount');
    const removeWaterBtn = document.getElementById('btn-remove-water');

    if (minusBtn && !minusBtn.dataset.bound) {
      minusBtn.dataset.bound = 'true';
      minusBtn.addEventListener('click', () => {
        if (!amountInput) return;
        const current = parseInt(amountInput.value, 10) || 250;
        amountInput.value = Math.max(50, current - 50);
      });
    }

    if (plusBtn && !plusBtn.dataset.bound) {
      plusBtn.dataset.bound = 'true';
      plusBtn.addEventListener('click', () => {
        if (!amountInput) return;
        const current = parseInt(amountInput.value, 10) || 250;
        amountInput.value = Math.min(5000, current + 50);
      });
    }

    document.querySelectorAll('.btn-water-preset').forEach(btn => {
      if (!btn.dataset.bound) {
        btn.dataset.bound = 'true';
        btn.addEventListener('click', async () => {
          const amt = parseInt(btn.dataset.amount, 10);
          if (amt && amountInput) {
            amountInput.value = amt;
          }
          if (amt && window.HydrationStore) {
            await window.HydrationStore.addWater(amt);
          }
        });
      }
    });

    const logWaterBtn = document.getElementById('btn-log-water');
    if (logWaterBtn && !logWaterBtn.dataset.bound) {
      logWaterBtn.dataset.bound = 'true';
      logWaterBtn.addEventListener('click', async () => {
        await handleAddWaterIntake();
      });
    }

    if (removeWaterBtn && !removeWaterBtn.dataset.bound) {
      removeWaterBtn.dataset.bound = 'true';
      removeWaterBtn.addEventListener('click', async () => {
        await handleRemoveWaterIntake();
      });
    }

    const saveGoalBtn = document.getElementById('btn-save-water-goal');
    if (saveGoalBtn && !saveGoalBtn.dataset.bound) {
      saveGoalBtn.dataset.bound = 'true';
      saveGoalBtn.addEventListener('click', async () => {
        await handleSaveWaterGoal();
      });
    }

    const checkAlertBtn = document.getElementById('btn-check-water-alert');
    if (checkAlertBtn && !checkAlertBtn.dataset.bound) {
      checkAlertBtn.dataset.bound = 'true';
      checkAlertBtn.addEventListener('click', async () => {
        await handleCheckWaterAlert();
      });
    }

    // Subscribe Water Intake UI directly to the single shared source of truth
    if (window.HydrationStore && !window._hydrationHealthRecordSubscribed) {
      window._hydrationHealthRecordSubscribed = true;
      window.HydrationStore.subscribe(renderWaterIntakeComponent);
    }
  }

  function renderWaterIntakeComponent(state) {
    if (!state) return;
    const curEl = document.getElementById('water-current-amount');
    const tgtEl = document.getElementById('water-target-amount');
    const pctEl = document.getElementById('water-progress-pct');
    const barEl = document.getElementById('water-progress-bar');
    const statusBadge = document.getElementById('water-status-badge');
    const statusText = document.getElementById('water-status-text');
    const goalInput = document.getElementById('water-goal-input');

    if (curEl) curEl.innerText = state.currentMl;
    if (tgtEl) tgtEl.innerText = state.targetMl;
    if (pctEl) pctEl.innerText = `${state.percentage}%`;
    if (barEl) barEl.style.width = `${state.percentage}%`;
    if (goalInput && document.activeElement !== goalInput) goalInput.value = state.targetMl;

    if (statusBadge && statusText) {
      if (state.status === 'completed') {
        statusBadge.style.background = '#ECFDF5';
        statusBadge.style.color = '#065F46';
        statusBadge.style.borderColor = '#A7F3D0';
        statusText.innerText = 'Completed';
      } else if (state.status === 'in_progress') {
        statusBadge.style.background = '#FEF3C7';
        statusBadge.style.color = '#92400E';
        statusBadge.style.borderColor = '#FDE68A';
        statusText.innerText = 'In Progress';
      } else {
        statusBadge.style.background = '#FAF6F2';
        statusBadge.style.color = '#710014';
        statusBadge.style.borderColor = '#E5D5C5';
        statusText.innerText = 'Not Started';
      }
    }

    renderWaterHistoryList(state.history, state.logs);
  }

  async function handleAddWaterIntake(explicitAmount) {
    const amountInput = document.getElementById('water-input-amount');
    const amountMl = explicitAmount !== undefined ? explicitAmount : (parseInt(amountInput?.value, 10) || 250);

    const logBtn = document.getElementById('btn-log-water');
    if (logBtn) {
      logBtn.disabled = true;
      logBtn.innerText = 'Adding...';
    }

    try {
      if (window.HydrationStore) {
        await window.HydrationStore.addWater(amountMl);
      }

      const feedback = document.getElementById('water-log-feedback');
      if (feedback) {
        feedback.innerText = '✓ Water intake recorded successfully!';
        feedback.style.display = 'inline-flex';
        setTimeout(() => { if (feedback) feedback.style.display = 'none'; }, 2500);
      }
    } catch (_) {
    } finally {
      if (logBtn) {
        logBtn.disabled = false;
        logBtn.innerText = 'Add Water';
      }
    }
  }

  async function handleRemoveWaterIntake(explicitAmount) {
    const amountInput = document.getElementById('water-input-amount');
    const amountMl = explicitAmount !== undefined ? explicitAmount : (parseInt(amountInput?.value, 10) || 250);

    const removeBtn = document.getElementById('btn-remove-water');
    if (removeBtn) {
      removeBtn.disabled = true;
      removeBtn.innerText = 'Removing...';
    }

    try {
      if (window.HydrationStore) {
        await window.HydrationStore.removeWater(amountMl);
      }

      const feedback = document.getElementById('water-log-feedback');
      if (feedback) {
        feedback.innerText = '✓ Water intake removed successfully!';
        feedback.style.display = 'inline-flex';
        setTimeout(() => {
          if (feedback) {
            feedback.style.display = 'none';
            feedback.innerText = '✓ Water intake recorded successfully!';
          }
        }, 2500);
      }
    } catch (_) {
    } finally {
      if (removeBtn) {
        removeBtn.disabled = false;
        removeBtn.innerText = 'Remove';
      }
    }
  }

  async function handleSaveWaterGoal() {
    const goalInput = document.getElementById('water-goal-input');
    const goalMl = parseInt(goalInput?.value, 10) || 2500;

    const saveBtn = document.getElementById('btn-save-water-goal');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerText = 'Saving...';
    }

    try {
      if (window.HydrationStore) {
        await window.HydrationStore.setGoal(goalMl);
      }

      const user = window.VitaWiseApi?.getUser() || {};
      const isHead = (user.isFamilyHead === true || user.role === 'family_head' || user.role === 'admin' || user.relationship === 'head') && user.role !== 'family_member';
      if (isHead && window.FamilySync) {
        await window.FamilySync.broadcastGoal('water', goalMl, 'ml');
      }

      const feedback = document.getElementById('water-goal-feedback');
      if (feedback) {
        feedback.style.display = 'inline-flex';
        setTimeout(() => { if (feedback) feedback.style.display = 'none'; }, 2500);
      }
    } catch (_) {
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerText = 'Save Goal';
      }
    }
  }

  async function handleCheckWaterAlert() {
    const memberSelect = document.getElementById('hr-member-select');
    const memberId = memberSelect ? memberSelect.value : 'self';
    const memberName = memberSelect?.options[memberSelect.selectedIndex]?.text?.split('(')[0]?.trim() || 'Member';
    const logDate = document.getElementById('hr-log-date')?.value || new Date().toISOString().split('T')[0];
    const currentEl = document.getElementById('water-current-amount');
    const currentMl = parseInt(currentEl?.innerText, 10) || 0;
    const goalInput = document.getElementById('water-goal-input');
    const goalMl = parseInt(goalInput?.value, 10) || 2500;

    const alertFeedback = document.getElementById('water-alert-feedback');
    const alertBtn = document.getElementById('btn-check-water-alert');

    if (alertBtn) {
      alertBtn.disabled = true;
      alertBtn.innerText = 'Checking...';
    }

    try {
      let res = { ok: true, alertCreated: false };
      if (window.VitaWiseApi?.clinical?.sendMissedWaterAlert) {
        res = await window.VitaWiseApi.clinical.sendMissedWaterAlert({
          memberId,
          memberName,
          date: logDate,
          currentMl,
          goalMl
        });
      }

      if (alertFeedback) {
        alertFeedback.style.display = 'block';
        if (currentMl >= goalMl) {
          alertFeedback.style.color = '#15803D';
          alertFeedback.innerText = `✓ ${memberName} has reached their water goal (${currentMl}/${goalMl} ml). No alert needed.`;
        } else if (res?.alertCreated) {
          alertFeedback.style.color = '#9A3412';
          alertFeedback.innerText = `⚠️ Alert created for Family Head: ${memberName} has logged only ${currentMl} ml of ${goalMl} ml goal.`;
        } else {
          alertFeedback.style.color = '#B45309';
          alertFeedback.innerText = `ℹ️ ${res?.message || `Alert already recorded for ${memberName} today.`}`;
        }
        setTimeout(() => { if (alertFeedback) alertFeedback.style.display = 'none'; }, 6000);
      }
    } catch (_) {
    } finally {
      if (alertBtn) {
        alertBtn.disabled = false;
        alertBtn.innerText = 'Check Missed Alert';
      }
    }
  }

  async function loadWaterDataForSelectedDateAndMember() {
    const memberSelect = document.getElementById('hr-member-select');
    const memberId = memberSelect ? memberSelect.value : 'self';
    const memberName = memberSelect?.options[memberSelect.selectedIndex]?.text?.split('(')[0]?.trim() || 'Member';
    const logDate = document.getElementById('hr-log-date')?.value || new Date().toISOString().split('T')[0];

    if (window.HydrationStore) {
      await window.HydrationStore.load(logDate, memberId, memberName);
    }
  }

  function renderWaterHistoryList(history = [], currentLogs = []) {
    const historyList = document.getElementById('water-history-list');
    const emptyState = document.getElementById('water-history-empty');
    if (!historyList || !emptyState) return;

    const list = Array.isArray(history) && history.length ? history : [];

    if (!list.length) {
      historyList.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    historyList.innerHTML = list.slice(0, 10).map((item, idx) => {
      const isComp = item.isCompleted || (item.total_ml >= item.goal_ml);
      const badgeStyle = isComp
        ? 'background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0;'
        : 'background: #FEF3C7; color: #92400E; border: 1px solid #FDE68A;';
      const badgeLabel = isComp ? 'Goal Met' : 'Incomplete';
      const amt = item.total_ml || item.amount_ml || 0;

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; background: #FAF8F5; border: 1px solid #EFEAE1; border-radius: 12px; gap: 0.75rem; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 0.65rem;">
            <span style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; background: #E0F2FE; color: #0284C7; font-size: 1rem;">
              💧
            </span>
            <div>
              <strong style="font-size: 0.92rem; color: #1E1B18;">${item.formattedDate || item.date || 'Recorded Entry'}</strong>
              <div style="font-size: 0.76rem; color: #78716C; font-weight: 600;">Daily Hydration Log</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span style="font-size: 0.9rem; font-weight: 800; color: #0C4A6E;">
              ${amt} <span style="font-size: 0.76rem; font-weight: 600; color: #64748B;">/ ${item.goal_ml || 2500} ml</span>
            </span>
            <span style="padding: 0.25rem 0.65rem; border-radius: 8px; font-size: 0.74rem; font-weight: 700; ${badgeStyle}">
              ${badgeLabel}
            </span>
            ${amt > 0 ? `
            <button type="button" class="btn-remove-history-item" data-amount="${amt}" data-index="${idx}"
              style="background: #FEE2E2; border: 1px solid #FECACA; color: #991B1B; border-radius: 6px; padding: 0.2rem 0.5rem; font-size: 0.72rem; font-weight: 700; cursor: pointer;"
              title="Remove this hydration amount">
              − Remove
            </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    historyList.querySelectorAll('.btn-remove-history-item').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const amt = parseInt(btn.dataset.amount, 10);
        if (amt > 0 && window.HydrationStore) {
          await window.HydrationStore.removeWater(amt);
        }
      });
    });
  }

  const SLOT_NAMES = {
    tiffin: 'Morning Tiffin',
    midmorning: 'Mid-Morning Snack',
    lunch: 'Afternoon Lunch',
    snacks: 'Evening Snacks',
    dinner: 'Night Dinner',
    extra: 'Late Night / Extra Foods'
  };

  /**
   * Save an individual meal slot independently to the real database
   */
  async function saveIndividualMealSlot(slot, btn) {
    if (!btn) btn = document.querySelector(`.btn-hr-save-slot[data-slot="${slot}"]`);
    const memberSelect = document.getElementById('hr-member-select');
    const memberId = memberSelect ? memberSelect.value : 'self';
    const logDate = document.getElementById('hr-log-date')?.value || new Date().toISOString().split('T')[0];

    const foodInput = document.getElementById(`hr-food-${slot}`);
    const qtyInput = document.getElementById(`hr-qty-${slot}`);
    const timeInput = document.getElementById(`hr-time-${slot}`);

    const foodName = foodInput?.value?.trim() || '';
    const quantity = qtyInput?.value?.trim() || '';
    const mealTime = timeInput?.value || '';

    if (!foodName) {
      if (foodInput) {
        foodInput.focus();
        foodInput.style.borderColor = '#C5221F';
        setTimeout(() => { foodInput.style.borderColor = ''; }, 2000);
      }
      alert(`Please enter what was eaten for ${SLOT_NAMES[slot] || slot} before saving.`);
      return;
    }

    if (btn) {
      btn.classList.add('saving');
      btn.innerHTML = '<span>Saving...</span>';
    }

    try {
      const payload = {
        member_id: memberId,
        record_date: logDate,
        meal_slot: slot,
        food_name: foodName,
        quantity: quantity,
        meal_time: mealTime
      };

      let result;
      if (window.VitaWiseApi?.clinical?.saveIntakeEntry) {
        result = await window.VitaWiseApi.clinical.saveIntakeEntry(payload);
      } else {
        const headers = { 'Content-Type': 'application/json' };
        const token = window.VitaWiseApi?.getSessionToken?.();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(getDietApiUrl('/api/v1/health/intake-entries'), {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
        const parsed = await parseSafeJsonResponse(res);
        result = parsed.data || {};
      }

      if (btn) {
        btn.classList.remove('saving');
        btn.innerHTML = '<span>Save</span>';
      }

      // Refresh history list so the day's record count is immediately accurate
      renderHealthRecordHistory();
    } catch (err) {
      console.error('[HealthRecord] Error saving meal slot:', err);
      if (btn) {
        btn.classList.remove('saving');
        btn.innerHTML = '<span>Save</span>';
      }
      alert(`Could not save ${SLOT_NAMES[slot] || slot}: ${err.message || 'Please check your connection and try again.'}`);
    }
  }

  /**
   * Load saved meal entries for the selected date & member from the database
   */
  async function loadHealthRecordForSelectedDateAndMember() {
    const memberSelect = document.getElementById('hr-member-select');
    const memberId = memberSelect ? memberSelect.value : 'self';
    const logDate = document.getElementById('hr-log-date')?.value || new Date().toISOString().split('T')[0];

    const slots = ['tiffin', 'midmorning', 'lunch', 'snacks', 'dinner', 'extra'];

    try {
      let data;
      if (window.VitaWiseApi?.clinical?.getIntakeDay) {
        data = await window.VitaWiseApi.clinical.getIntakeDay(logDate, memberId);
      } else {
        const headers = {};
        const token = window.VitaWiseApi?.getSessionToken?.();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(getDietApiUrl(`/api/v1/health/intake-entries/day?date=${encodeURIComponent(logDate)}&member_id=${encodeURIComponent(memberId)}`), { headers });
        data = await res.json();
      }

      const entriesBySlot = {};
      if (data && Array.isArray(data.entries)) {
        data.entries.forEach(e => {
          if (e && e.meal_slot) {
            entriesBySlot[e.meal_slot] = e;
          }
        });
      }

      slots.forEach(slot => {
        const foodEl = document.getElementById(`hr-food-${slot}`);
        const qtyEl = document.getElementById(`hr-qty-${slot}`);
        const timeEl = document.getElementById(`hr-time-${slot}`);
        const saved = entriesBySlot[slot];

        if (saved) {
          if (foodEl) foodEl.value = saved.food_name || '';
          if (qtyEl) qtyEl.value = saved.quantity || '';
          if (timeEl && saved.meal_time) timeEl.value = saved.meal_time;
        } else {
          // If no saved entry for this slot on this date, clear it for new input
          if (foodEl) foodEl.value = '';
          if (qtyEl) qtyEl.value = '';
        }
      });
    } catch (_) {
      // Offline fallback: keep existing form state without console warning
    }
  }




  /**
   * Helper: Format YYYY-MM-DD to readable date like "30 September 2026"
   */
  function formatDisplayDate(dateStr) {
    if (!dateStr) return 'Unknown Date';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const d = new Date(year, month, day);
        return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
      }
      return dateStr;
    } catch (_) {
      return dateStr;
    }
  }

  /**
   * Helper: Format actual save timestamp to readable time like "10:46 AM"
   */
  function formatSaveTime(item) {
    if (!item) return '<em style="color:#9A948C; font-weight: 400;">N/A</em>';
    const ts = item.saved_at || item.updated_at || item.created_at;
    if (!ts) return '<em style="color:#9A948C; font-weight: 400;">N/A</em>';
    try {
      const d = new Date(ts);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      }
    } catch (_) { }
    return String(ts);
  }

  /**
   * Render Health Record History Timeline from the permanent database
   */
  async function renderHealthRecordHistory() {
    const list = document.getElementById('hr-history-list');
    const detail = document.getElementById('hr-history-detail');
    if (!list) return;

    // Reset detail view to history list view
    if (detail) {
      detail.style.display = 'none';
      detail.innerHTML = '';
    }
    list.style.display = 'flex';

    const memberSelect = document.getElementById('hr-member-select');
    const memberId = memberSelect ? memberSelect.value : 'self';

    try {
      let data;
      if (window.VitaWiseApi?.clinical?.getIntakeHistory) {
        data = await window.VitaWiseApi.clinical.getIntakeHistory(memberId);
      } else {
        const headers = {};
        const token = window.VitaWiseApi?.getSessionToken?.();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(getDietApiUrl(`/api/v1/health/intake-entries?history=true&member_id=${encodeURIComponent(memberId)}`), { headers });
        data = await res.json();
      }

      const history = (data && Array.isArray(data.history)) ? data.history : [];

      if (!history.length) {
        list.innerHTML = `
          <div style="text-align: center; padding: 2rem; color: #8A847C; font-size: 0.88rem; background: #FAF8F5; border-radius: 12px; border: 1px dashed #DDD8CE;">
            <span><span class="vw-inline-icon-wrap" style="margin-right: 0.35rem;">${window.vwIcon ? window.vwIcon("clipboard", { size: 16 }) : ""}</span>No saved health records yet. Log your meals above and tap Save to build your clinical history.</span>
          </div>
        `;
        return;
      }

      list.innerHTML = history.map(item => {
        const dateFormatted = formatDisplayDate(item.date);
        const count = item.total_entries || item.entries?.length || 0;
        const countText = `${count} meal ${count === 1 ? 'entry' : 'entries'}`;

        return `
          <div class="vw-hr-history-card" data-date="${item.date}" data-member="${memberId}" role="button" tabindex="0">
            <div class="vw-hr-history-card-left">
              <div class="vw-hr-history-card-title">${dateFormatted}</div>
              <div class="vw-hr-history-card-subtitle">Daily Health Record &bull; ${countText}</div>
            </div>
            <div class="vw-hr-history-card-action">
              <span>View Record</span>
              <span aria-hidden="true">&rarr;</span>
            </div>
          </div>
        `;
      }).join('');

      // Bind click handlers to each history card to open read-only detail view
      list.querySelectorAll('.vw-hr-history-card').forEach(card => {
        const handleOpen = () => {
          const date = card.dataset.date;
          const mId = card.dataset.member;
          openHistoricalDateDetail(date, mId);
        };
        card.addEventListener('click', handleOpen);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleOpen();
          }
        });
      });
    } catch (_) {
      list.innerHTML = `
        <div style="text-align: center; padding: 1.5rem; color: #8A847C; font-size: 0.88rem; background: #FAF8F5; border-radius: 12px;">
          <span>Could not load past records. Tap to retry.</span>
        </div>
      `;
    }
  }

  /**
   * Open Read-Only Historical Detail View for a clicked date
   */
  async function openHistoricalDateDetail(dateStr, memberId) {
    const list = document.getElementById('hr-history-list');
    const detail = document.getElementById('hr-history-detail');
    if (!detail) return;

    if (list) list.style.display = 'none';
    detail.style.display = 'block';

    detail.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: #7A746D;">
        <span>Loading daily health record...</span>
      </div>
    `;

    try {
      let data;
      if (window.VitaWiseApi?.clinical?.getIntakeDay) {
        data = await window.VitaWiseApi.clinical.getIntakeDay(dateStr, memberId);
      } else {
        const headers = {};
        const token = window.VitaWiseApi?.getSessionToken?.();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(getDietApiUrl(`/api/v1/health/intake-entries/day?date=${encodeURIComponent(dateStr)}&member_id=${encodeURIComponent(memberId)}`), { headers });
        data = await res.json();
      }

      const entries = (data && Array.isArray(data.entries)) ? data.entries : [];
      const dateFormatted = formatDisplayDate(dateStr);

      const slotsOrder = [
        { slot: 'tiffin', label: 'Morning Tiffin (Breakfast)', icon: 'soup' },
        { slot: 'midmorning', label: 'Mid-Morning Snack', icon: 'apple' },
        { slot: 'lunch', label: 'Afternoon Lunch', icon: 'utensils' },
        { slot: 'snacks', label: 'Evening Snacks', icon: 'coffee' },
        { slot: 'dinner', label: 'Night Dinner', icon: 'utensils' },
        { slot: 'extra', label: 'Late Night / Extra Foods', icon: 'moon' }
      ];

      const entriesBySlot = {};
      entries.forEach(e => {
        if (e && e.meal_slot) entriesBySlot[e.meal_slot] = e;
      });

      const cardsHtml = slotsOrder.map(s => {
        const item = entriesBySlot[s.slot];
        const food = item?.food_name ? item.food_name : '<em style="color:#9A948C; font-weight: 400;">Not recorded</em>';
        const qty = item?.quantity ? item.quantity : '<em style="color:#9A948C; font-weight: 400;">--</em>';
        const time = formatSaveTime(item);

        return `
          <div class="vw-hr-detail-item">
            <div class="vw-hr-detail-item-title">
              <span aria-hidden="true" style="display: inline-flex; align-items: center;">${window.vwIcon ? window.vwIcon(s.icon, { size: 18 }) : ""}</span>
              <span>${s.label}</span>
            </div>
            <div class="vw-hr-detail-row">
              <span class="vw-hr-detail-label">Food:</span>
              <span class="vw-hr-detail-val">${food}</span>
            </div>
            <div class="vw-hr-detail-row">
              <span class="vw-hr-detail-label">Quantity:</span>
              <span class="vw-hr-detail-val">${qty}</span>
            </div>
            <div class="vw-hr-detail-row">
              <span class="vw-hr-detail-label">Time:</span>
              <span class="vw-hr-detail-val">${time}</span>
            </div>
          </div>
        `;
      }).join('');

      detail.innerHTML = `
        <div class="vw-hr-detail-container">
          <div class="vw-hr-detail-header">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                <h4 style="margin: 0; font-size: 1.15rem; font-weight: 800; color: #161616;">${dateFormatted}</h4>
                <span style="font-size: 0.75rem; font-weight: 700; background: #FAF0F2; color: #710014; padding: 0.2rem 0.5rem; border-radius: 6px;">Read-Only Daily Record</span>
              </div>
              <p style="margin: 0.2rem 0 0 0; font-size: 0.82rem; color: #6E6862;">Viewing permanently saved clinical meal intake record.</p>
            </div>
            <button type="button" class="vw-btn vw-btn-subtle" id="btn-back-to-hr-history" style="font-weight: 700; padding: 0.45rem 1rem; font-size: 0.84rem; cursor: pointer;">
              &larr; Back to History
            </button>
          </div>
          <div class="vw-hr-detail-grid">
            ${cardsHtml}
          </div>
        </div>
      `;

      // Back button click handler - Pure UI navigation, zero deletion!
      const backBtn = document.getElementById('btn-back-to-hr-history');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          closeHistoricalDateDetail();
        });
      }
    } catch (err) {
      console.error('[HealthRecord] Error loading date detail:', err);
      detail.innerHTML = `
        <div style="padding: 1.5rem; background: #FAF8F5; border-radius: 12px; border: 1px solid #ECE7DF;">
          <p style="margin: 0 0 0.85rem 0; color: #C5221F; font-size: 0.88rem; font-weight: 600;">Failed to load record for ${dateStr}.</p>
          <button type="button" class="vw-btn vw-btn-subtle" id="btn-back-to-hr-history" style="font-weight: 700;">&larr; Back to History</button>
        </div>
      `;
      const backBtn = document.getElementById('btn-back-to-hr-history');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          closeHistoricalDateDetail();
        });
      }
    }
  }

  /**
   * Close Read-Only Detail View and return to History List (Navigation Only)
   */
  function closeHistoricalDateDetail() {
    const list = document.getElementById('hr-history-list');
    const detail = document.getElementById('hr-history-detail');
    if (detail) {
      detail.style.display = 'none';
      detail.innerHTML = '';
    }
    if (list) {
      list.style.display = 'flex';
    }
  }

  /**
   * Helper: Provides latest health record meal context for the main Aloka AI chat prompt
   */
  window.getLatestHealthRecordForContext = function () {
    try {
      const memberSelect = document.getElementById('hr-member-select');
      const memberName = memberSelect ? memberSelect.options[memberSelect.selectedIndex]?.text : 'Patient';
      const logDate = document.getElementById('hr-log-date')?.value || new Date().toISOString().split('T')[0];

      const slots = ['tiffin', 'midmorning', 'lunch', 'snacks', 'dinner', 'extra'];
      let summary = `Date: ${logDate}, Patient: ${memberName}\n`;
      let hasData = false;

      slots.forEach(slot => {
        const food = document.getElementById(`hr-food-${slot}`)?.value?.trim();
        const qty = document.getElementById(`hr-qty-${slot}`)?.value?.trim();
        const time = document.getElementById(`hr-time-${slot}`)?.value;
        if (food) {
          hasData = true;
          summary += `- ${SLOT_NAMES[slot] || slot} (${time || 'N/A'}): ${food} (Qty: ${qty || 'Standard'})\n`;
        }
      });


      return hasData ? summary : '';
    } catch (e) {
      return '';
    }
  };

  // Bind refresh button in Diet section
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-refresh-family-diet')?.addEventListener('click', () => {
      window.renderFamilyDietPlans();
    });
    if (window.initPersonalizedDietModule) {
      window.initPersonalizedDietModule();
    }
  });

})();


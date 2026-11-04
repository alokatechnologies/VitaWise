/**
 * VitaWise Comprehensive Language & Translation Engine (i18n)
 * Supports instant, full-application translation between English and Telugu.
 * Translates Sidebar, Navigation, Buttons, Cards, Dropdowns, Alerts, Validation,
 * Tables, Charts, Reports, Calendar, AI Assistant, Dialogs, Forms, Notifications,
 * Profile, Login, Signup, Health Dashboard, History, and dynamic updates.
 * Persists selection locally and synchronizes live with Supabase.
 */

(function () {
  'use strict';

  // 1. Comprehensive English <-> Telugu Dictionary
  const translations = {
    // Brand & Navigation
    'VitaWise': 'VitaWise',
    'HEALTH INTELLIGENCE': 'ఆరోగ్య మేధస్సు',
    'Evidence-Aware Health Intelligence': 'ఆధార-ఆధారిత ఆరోగ్య మేధస్సు',
    'Dashboard': 'డ్యాష్‌బోర్డ్',
    'Health Records': 'ఆరోగ్య రికార్డులు',
    'Cycle Tracking': 'ఋతుక్రమ ట్రాకింగ్',
    'Family Space': 'కుటుంబ వేదిక',
    'Nutrition & Diet': 'పోషకాహారం & డైట్',
    'Appointments': 'అపాయింట్‌మెంట్లు',
    'Health Profile': 'ఆరోగ్య ప్రొఫైల్',
    'Achievements': 'విజయాలు & బ్యాడ్జీలు',
    'Achievements & Badges': 'విజయాలు & బ్యాడ్జీలు',
    'Achievements & Clinical Guidance': 'విజయాలు & క్లినికల్ మార్గదర్శకత్వం',
    'History': 'చరిత్ర & రికార్డులు',
    'Sign Out': 'లాగ్ అవుట్',
    'Sign In': 'సైన్ ఇన్',
    'Sign Up': 'సైన్ అప్',
    'Create Account': 'ఖాతాను సృష్టించండి',
    'Create your Space': 'మీ స్పేస్‌ను సృష్టించండి',
    'New to VitaWise?': 'వీటావైజ్‌కి కొత్తవారా?',
    'Already registered?': 'ఇప్పటికే నమోదు చేసుకున్నారా?',
    'Welcome Back': 'తిరిగి స్వాగతం',
    'Start Your Journey': 'మీ ప్రయాణాన్ని ప్రారంభించండి',
    'Sign In to Your Space': 'మీ స్పేస్‌కు సైన్ ఇన్ చేయండి',
    'Access your personal health logs, cycle patterns, and nutrition insights.': 'మీ వ్యక్తిగత ఆరోగ్య రికార్డులు, ఋతుక్రమం మరియు పోషకాహార సమాచారాన్ని పొందండి.',
    'Parent/Admin verification and personal health space setup.': 'తల్లిదండ్రులు/అడ్మిన్ ధృవీకరణ మరియు వ్యక్తిగత ఆరోగ్య సెటప్.',
    'Family Email Address': 'కుటుంబ ఇమెయిల్ చిరునామా',
    'Family Email': 'కుటుంబ ఇమెయిల్',
    'Your Password': 'మీ పాస్‌వర్డ్',
    'Forgot password?': 'పాస్‌వర్డ్ మర్చిపోయారా?',
    'Continue with Google': 'Google తో కొనసాగించండి',
    'or sign in with family credentials': 'లేదా కుటుంబ ఆధారాలతో సైన్ ఇన్ చేయండి',
    'Password': 'పాస్‌వర్డ్',
    'New Password': 'కొత్త పాస్‌వర్డ్',
    'Confirm New Password': 'కొత్త పాస్‌వర్డ్‌ను నిర్ధారించండి',
    'Confirm Password': 'పాస్‌వర్డ్‌ను తిరిగి నమోదు చేయండి',
    'Re-enter Password': 'పాస్‌వర్డ్‌ను తిరిగి నమోదు చేయండి',
    'Update Password': 'పాస్‌వర్డ్‌ను నవీకరించండి',
    'Reset Member Password': 'సభ్యుడి పాస్‌వర్డ్‌ను రీసెట్ చేయండి',
    'Select Family Member': 'కుటుంబ సభ్యుడిని ఎంచుకోండి',
    '-- Myself (Update Personal Password) --': '-- స్వయంగా (వ్యక్తిగత పాస్‌వర్డ్ నవీకరించండి) --',
    'Create Family Health Space': 'కుటుంబ ఆరోగ్య స్థలాన్ని సృష్టించండి',
    'Single Member': 'ఒక్కరే సభ్యుడు',
    'Family Members': 'కుటుంబ సభ్యులు',
    'How many family members?': 'కుటుంబంలో ఎంతమంది సభ్యులు ఉన్నారు?',
    'Choose how many people in your family to add.': 'మీ కుటుంబంలో ఎంతమందిని చేర్చాలో ఎంచుకోండి.',
    'Confirm Family': 'కుటుంబాన్ని నిర్ధారించండి',
    'Your Family': 'మీ కుటుంబం',
    'Family Head': 'కుటుంబ అధిపతి',
    'Family Member': 'కుటుంబ సభ్యుడు',
    'Member': 'సభ్యుడు',
    'Household Members': 'ఇంటి సభ్యులు',
    'Household Members Managed': 'నిర్వహించబడుతున్న కుటుంబ సభ్యులు',
    'Open Family Dashboard →': 'కుటుంబ డ్యాష్‌బోర్డ్ తెరవండి →',
    'Household Members & Privacy Status': 'కుటుంబ సభ్యులు & గోప్యతా స్థితి',
    'General Health': 'సాధారణ ఆరోగ్యం',
    'Private Records Locked': 'వ్యక్తిగత రికార్డులు లాక్ చేయబడ్డాయి',
    'Private Records': 'వ్యక్తిగత రికార్డులు',
    'Consent Granted': 'అనుమతి ఇవ్వబడింది',
    'Protected': 'సురక్షితం',
    'Active': 'క్రియాశీలం',

    // Action Buttons
    '+ Log Meal': '+ భోజనం నమోదు',
    'Log Meal': 'భోజనం నమోదు',
    '+ Log Water': '+ నీరు నమోదు',
    'Log Water': 'నీరు నమోదు',
    '+ Log Symptom': '+ లక్షణం నమోదు',
    'Log Symptom': 'లక్షణం నమోదు',
    '+ Add Family Member': '+ కుటుంబ సభ్యుడిని చేర్చండి',
    'Add Family Member': 'కుటుంబ సభ్యుడిని చేర్చండి',
    'Book Appointment': 'అపాయింట్‌మెంట్ బుక్ చేయండి',
    '+ Book Appointment': '+ అపాయింట్‌మెంట్ బుక్ చేయండి',
    'Save Changes': 'మార్పులను భద్రపరచండి',
    'Save Preferences': 'ప్రాధాన్యతలను భద్రపరచండి',
    'Continue': 'కొనసాగించండి',
    'Back': 'వెనుకకు',
    'Cancel': 'రద్దు చేయి',
    'Close': 'మూసివేయి',
    'Submit': 'సమర్పించండి',
    'Send': 'పంపండి',
    'Delete': 'తొలగించు',
    'Edit': 'సవరించు',
    'Remove': 'తీసివేయి',
    'Confirm': 'నిర్ధారించు',
    'Refresh': 'రిఫ్రెష్ చేయండి',
    'Download Report': 'నివేదికను డౌన్‌లోడ్ చేయండి',
    'Download PDF': 'PDF డౌన్‌లోడ్ చేయండి',
    'View Dashboard →': 'డ్యాష్‌బోర్డ్ చూడండి →',
    'Sync Device': 'డివైజ్ సింక్ చేయండి',

    // Dashboard Cards & Metrics
    'Today\'s Steps': 'నేటి అడుగులు',
    'Daily Steps': 'రోజువారీ అడుగులు',
    'Steps': 'అడుగులు',
    'Calories': 'క్యాలరీలు',
    'Distance': 'దూరం',
    'km': 'కి.మీ',
    'kcal': 'కి.క్యాలరీలు',
    'Goal': 'లక్ష్యం',
    'Target': 'లక్ష్యం',
    'Water Intake': 'నీటి తీసుకోవడం',
    'Hydration Tracker': 'హైడ్రేషన్ ట్రాకర్',
    'Sleep & Recovery': 'నిద్ర & కోలుకోవడం',
    'Sleep Score': 'నిద్ర స్కోర్',
    'Active Recovery': 'యాక్టివ్ రికవరీ',
    'Optimal Recovery': 'సరైన కోలుకోవడం',
    'Heart Rate': 'గుండె వేగం',
    'Blood Pressure': 'రక్తపోటు',
    'Blood Glucose': 'రక్తంలో గ్లూకోజ్',
    'Vitals Overview': 'జీవసంబంధిత కొలతలు',
    'PCOS & Hormonal Overview': 'PCOS & హార్మోన్ల స్థితి',
    'Cycle & Menstrual Rhythm': 'ఋతుక్రమ గమనం',
    'Current Phase': 'ప్రస్తుత దశ',
    'Follicular Phase': 'ఫోలిక్యులర్ దశ',
    'Ovulatory Phase': 'అండోత్సర్గ దశ',
    'Luteal Phase': 'లూటియల్ దశ',
    'Menstrual Phase': 'ఋతుస్రావ దశ',
    'Next Period in': 'తదుపరి పీరియడ్ ఇంకా',
    'Days': 'రోజులు',
    'Days Streak': 'రోజుల స్ట్రీక్',
    'Day Streak': 'రోజుల స్ట్రీక్',

    // Nutrition & Meal Slots
    'Breakfast / Tiffin': 'అల్పాహారం / టిఫిన్',
    'Mid-Morning Snack': 'ఉదయం స్నాక్స్',
    'Lunch': 'మధ్యాహ్న భోజనం',
    'Evening Snacks': 'సాయంత్రం స్నాక్స్',
    'Dinner': 'రాత్రి భోజనం',
    'Post-Dinner / Extra': 'రాత్రి తర్వాత / అదనపు',
    'Dietary Pattern': 'ఆహార శైలి',
    'Language Preference': 'భాషా ప్రాధాన్యత',
    'South Indian Traditional': 'దక్షిణ భారత సాంప్రదాయం',
    'North Indian Traditional': 'ఉత్తర భారత సాంప్రదాయం',
    'Lacto-Vegetarian': 'శాకాహారం (పాల ఉత్పత్తులతో)',
    'Millet, Pulse & Low-GI Metabolic Focus': 'చిరుధాన్యాలు, పప్పుదినుసులు & తక్కువ GI మెటబాలిక్ పోషణ',
    'Whole Wheat, Roti & Protein Balance': 'గోధుమలు, రోటీ & ప్రోటీన్ సమతుల్యత',
    'Plant-Based, Legumes & Dairy Focus': 'మొక్కల ఆధారిత, పప్పులు & పాల ఉత్పత్తుల ప్రాధాన్యత',

    // Personal & Demographic Details
    'Personal Details': 'వ్యక్తిగత వివరాలు',
    'Name': 'పేరు',
    'Full Name': 'పూర్తి పేరు',
    'Age': 'వయస్సు',
    'Gender': 'లింగం',
    'Female': 'స్త్రీ',
    'Male': 'పురుషుడు',
    'Other': 'ఇతర',
    'Weight': 'బరువు',
    'Weight (kg)': 'బరువు (కేజీలు)',
    'Height': 'ఎత్తు',
    'Height (cm)': 'ఎత్తు (సెం.మీ)',
    'Date of Birth': 'పుట్టిన తేదీ',
    'Phone Number': 'ఫోన్ నంబర్',
    'Relationship': 'సంబంధం',
    'Father': 'తండ్రి',
    'Mother': 'తల్లి',
    'Son': 'కుమారుడు',
    'Daughter': 'కుమార్తె',
    'Spouse': 'భార్య/భర్త',
    'Husband': 'భర్త',
    'Wife': 'భార్య',
    'Brother': 'సోదరుడు',
    'Sister': 'సోదరి',

    // Health Records & Tables
    'Record Date': 'రికార్డు తేదీ',
    'Type': 'రకం',
    'Category': 'వర్గం',
    'Metric': 'కొలత',
    'Value': 'విలువ',
    'Status': 'స్థితి',
    'Notes': 'గమనికలు',
    'Doctor': 'వైద్యులు',
    'Clinic / Hospital': 'క్లినిక్ / ఆసుపత్రి',
    'Normal': 'సాధారణం',
    'Elevated': 'ఎక్కువ',
    'Critical': 'తీవ్రమైనది',
    'Completed': 'పూర్తయింది',
    'Pending': 'వేచి ఉంది',
    'In Progress': 'పురోగతిలో ఉంది',
    'Scheduled': 'షెడ్యూల్ చేయబడింది',
    'Cancelled': 'రద్దు చేయబడింది',

    // Appointments & Consultations
    'Upcoming Appointments': 'రాబోయే అపాయింట్‌మెంట్లు',
    'Past Consultations': 'మునుపటి సంప్రదింపులు',
    'Doctor Consultation': 'వైద్యుల సంప్రదింపులు',
    'Consultation Type': 'సంప్రదింపుల రకం',
    'Appointment Date': 'అపాయింట్‌మెంట్ తేదీ',
    'Appointment Time': 'అపాయింట్‌మెంట్ సమయం',
    'Specialty': 'స్పెషాలిటీ',
    'General Physician': 'జనరల్ ఫిజీషియన్',
    'Gynecologist': 'స్త్రీల వైద్య నిపుణులు (గైనకాలజిస్ట్)',
    'Endocrinologist': 'ఎండోక్రినాలజిస్ట్',
    'Nutritionist': 'న్యూట్రిషనిస్ట్ / డైటీషియన్',
    'Select Member': 'సభ్యుడిని ఎంచుకోండి',

    // AI Health Assistant
    'Ask VitaWise Health AI...': 'వీటావైజ్ హెల్త్ AI ని అడగండి...',
    'VitaWise Health Intelligence': 'వీటావైజ్ హెల్త్ ఇంటెలిజెన్స్',
    'Ask anything about your health, cycles, symptoms, or nutrition...': 'మీ ఆరోగ్యం, ఋతుక్రమం, లక్షణాలు లేదా ఆహారం గురించి ఏదైనా అడగండి...',
    'Hello! How can I assist with your health wellness today?': 'నమస్కారం! నేడు మీ ఆరోగ్య సంరక్షణలో నేను ఎలా సహాయపడగలను?',
    'Clear Chat': 'చాట్ క్లియర్ చేయండి',

    // Alerts & Notifications
    'Please enter a valid email address.': 'దయచేసి సరైన ఇమెయిల్ చిరునామాను నమోదు చేయండి.',
    'Please enter a password.': 'దయచేసి పాస్‌వర్డ్‌ను నమోదు చేయండి.',
    'Password must be at least 8 characters.': 'పాస్‌వర్డ్ కనీసం 8 అక్షరాలు ఉండాలి.',
    'Passwords do not match.': 'పాస్‌వర్డ్‌లు సరిపోలడం లేదు.',
    'Account created successfully! Redirecting...': 'ఖాతా విజయవంతంగా సృష్టించబడింది! దారిమళ్లిస్తోంది...',
    'Incorrect password for this family account.': 'ఈ కుటుంబ ఖాతాకు పాస్‌వర్డ్ సరైనది కాదు.',
    'No account found with this family email.': 'ఈ కుటుంబ ఇమెయిల్‌తో ఏ ఖాతా కనుగొనబడలేదు.',
    'Password updated successfully!': 'పాస్‌వర్డ్ విజయవంతంగా నవీకరించబడింది!',
    'Preferences saved successfully!': 'ప్రాధాన్యతలు విజయవంతంగా భద్రపరచబడ్డాయి!',
    'Please fill in all required fields.': 'దయచేసి అవసరమైన అన్ని వివరాలను పూరించండి.',
    'Access granted successfully.': 'యాక్సెస్ విజయవంతంగా ఇవ్వబడింది.',
    'Access revoked immediately.': 'యాక్సెస్ వెంటనే రద్దు చేయబడింది.',
    'Loading Family Space...': 'కుటుంబ వేదిక లోడ్ అవుతోంది...',
    'No family data found.': 'కుటుంబ వివరాలు కనుగొనబడలేదు.',
  };

  // Build Reverse Telugu -> English Dictionary
  const reverseTranslations = {};
  for (const [en, te] of Object.entries(translations)) {
    if (en !== te) {
      reverseTranslations[te] = en;
    }
  }

  // Get current language preference
  function getLang() {
    try {
      return localStorage.getItem('vitawise_language') || 'en';
    } catch (_) {
      return 'en';
    }
  }

  // Set and persist language preference
  async function setLanguage(lang) {
    const validLang = lang === 'te' ? 'te' : 'en';
    try {
      localStorage.setItem('vitawise_language', validLang);
    } catch (_) {}

    document.documentElement.lang = validLang;

    // Update all language toggle labels
    document.querySelectorAll('#auth-lang-label, .vw-lang-toggle-text, #app-lang-label').forEach(el => {
      el.textContent = validLang === 'te' ? 'తెలుగు' : 'EN';
    });

    // Update interactive language tiles on profile
    document.querySelectorAll('[data-lang]').forEach(btn => {
      if (btn.dataset.lang === validLang) {
        btn.classList.add('selected');
      } else {
        btn.classList.remove('selected');
      }
    });

    // Translate all DOM elements
    applyTranslation(validLang);

    // Sync live to Supabase if authenticated
    try {
      if (window.VitaWiseApi?.isAuthenticated()) {
        const token = window.VitaWiseApi.getToken();
        if (token) {
          const apiBase = (typeof window !== 'undefined' && window.VitaWiseApi?.getApiBase?.()) || ((typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '3001') ? 'http://127.0.0.1:3001' : '');
          fetch(`${apiBase}/api/v1/user/language`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ language: validLang })
          }).catch(() => {});
        }
      }
    } catch (_) {}

    // Dispatch global event for custom views
    window.dispatchEvent(new CustomEvent('vitawise:languageChanged', { detail: { language: validLang } }));
  }

  // Translate specific text string
  function translateText(str, targetLang) {
    if (!str || typeof str !== 'string') return str;
    const trimmed = str.trim();
    if (!trimmed) return str;

    if (targetLang === 'te') {
      if (translations[trimmed]) {
        return str.replace(trimmed, translations[trimmed]);
      }
    } else {
      if (reverseTranslations[trimmed]) {
        return str.replace(trimmed, reverseTranslations[trimmed]);
      }
    }
    return str;
  }

  // Translate text nodes in a DOM element subtree
  function walkAndTranslateNodes(root, targetLang) {
    if (!root) return;

    // NodeFilter: reject scripts, styles, code blocks, SVG paths
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName.toLowerCase();
          if (tag === 'script' || tag === 'style' || tag === 'svg' || tag === 'path' || tag === 'code') {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent.hasAttribute('data-no-translate')) {
            return NodeFilter.FILTER_REJECT;
          }
          const text = node.nodeValue.trim();
          if (!text || /^[0-9\s:.,/%+-]+$/.test(text)) {
            return NodeFilter.FILTER_SKIP;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      },
      false
    );

    let currentNode;
    while ((currentNode = walker.nextNode())) {
      const original = currentNode.nodeValue;
      const trimmed = original.trim();

      if (targetLang === 'te') {
        if (translations[trimmed]) {
          if (!currentNode._origEn) currentNode._origEn = original;
          currentNode.nodeValue = original.replace(trimmed, translations[trimmed]);
        }
      } else {
        if (currentNode._origEn) {
          currentNode.nodeValue = currentNode._origEn;
        } else if (reverseTranslations[trimmed]) {
          currentNode.nodeValue = original.replace(trimmed, reverseTranslations[trimmed]);
        }
      }
    }

    // Translate placeholder attributes on inputs and textareas
    root.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
      const ph = el.getAttribute('placeholder');
      if (!ph) return;
      if (targetLang === 'te') {
        if (translations[ph]) {
          if (!el._origPh) el._origPh = ph;
          el.setAttribute('placeholder', translations[ph]);
        }
      } else {
        if (el._origPh) {
          el.setAttribute('placeholder', el._origPh);
        } else if (reverseTranslations[ph]) {
          el.setAttribute('placeholder', reverseTranslations[ph]);
        }
      }
    });

    // Translate titles and aria-labels
    root.querySelectorAll('[aria-label]').forEach(el => {
      const label = el.getAttribute('aria-label');
      if (!label) return;
      if (targetLang === 'te' && translations[label]) {
        if (!el._origAria) el._origAria = label;
        el.setAttribute('aria-label', translations[label]);
      } else if (targetLang === 'en' && el._origAria) {
        el.setAttribute('aria-label', el._origAria);
      }
    });
  }

  // Primary application translator
  function applyTranslation(lang) {
    const targetLang = lang === 'te' ? 'te' : 'en';

    // 1. Explicit ID-based translations for high precision
    const idMap = {
      // Topbar & Nav
      'auth-lang-label': targetLang === 'te' ? 'తెలుగు' : 'EN',
      'app-lang-label': targetLang === 'te' ? 'తెలుగు' : 'EN',
      'topbar-prompt-login': targetLang === 'te' ? 'వీటావైజ్‌కి కొత్తవారా?' : 'New to VitaWise?',
      'prompt-new-to-vitawise': targetLang === 'te' ? 'వీటావైజ్‌కి కొత్తవారా?' : 'New to VitaWise?',
      'prompt-create-space': targetLang === 'te' ? 'మీ స్పేస్‌ను సృష్టించండి' : 'Create your Space',
      'btn-login-to-signup': targetLang === 'te' ? 'ఖాతాను సృష్టించండి' : 'Create Account',
      'login-eyebrow': targetLang === 'te' ? 'తిరిగి స్వాగతం' : 'Welcome Back',
      'login-title': targetLang === 'te' ? 'మీ స్పేస్‌కు సైన్ ఇన్ చేయండి' : 'Sign In to Your Space',
      'login-subtitle': targetLang === 'te' ? 'మీ వ్యక్తిగత ఆరోగ్య రికార్డులు, ఋతుక్రమం మరియు పోషకాహార సమాచారాన్ని పొందండి.' : 'Access your personal health logs, cycle patterns, and nutrition insights.',
      'login-google-text': targetLang === 'te' ? 'Google తో కొనసాగించండి' : 'Continue with Google',
      'login-divider-text': targetLang === 'te' ? 'లేదా కుటుంబ ఆధారాలతో సైన్ ఇన్ చేయండి' : 'or sign in with family credentials',
      'lbl-login-email': targetLang === 'te' ? 'కుటుంబ ఇమెయిల్ చిరునామా' : 'Family Email Address',
      'lbl-login-password': targetLang === 'te' ? 'మీ పాస్‌వర్డ్' : 'Your Password',
      'forgot-password-link': targetLang === 'te' ? 'పాస్‌వర్డ్ మర్చిపోయారా?' : 'Forgot password?',
      'btn-text-login': targetLang === 'te' ? 'మీ స్పేస్‌కు సైన్ ఇన్ చేయండి' : 'Sign In to Your Space',

      // Profile Page
      'btn-submit-fam-reset-pass': targetLang === 'te' ? 'పాస్‌వర్డ్‌ను నవీకరించండి' : 'Update Password',
      'update-password-btn': targetLang === 'te' ? 'పాస్‌వర్డ్‌ను నవీకరించండి' : 'Update Password',
      'save-preferences-btn': targetLang === 'te' ? 'ప్రాధాన్యతలను భద్రపరచండి' : 'Save Preferences',
    };

    for (const [id, val] of Object.entries(idMap)) {
      const el = document.getElementById(id);
      if (el) {
        if (el.tagName.toLowerCase() === 'input' && (el.type === 'button' || el.type === 'submit')) {
          el.value = val;
        } else {
          el.textContent = val;
        }
      }
    }

    // 2. Full DOM recursive walker across body
    if (document.body) {
      walkAndTranslateNodes(document.body, targetLang);
    }
  }

  // Bind all language toggle triggers
  function bindToggleButtons() {
    document.querySelectorAll('#auth-lang-toggle, .vw-lang-toggle, [data-action="toggle-language"]').forEach(btn => {
      if (btn.dataset.i18nBound) return;
      btn.dataset.i18nBound = 'true';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const next = getLang() === 'te' ? 'en' : 'te';
        setLanguage(next);
      });
    });

    // Profile option tiles
    document.querySelectorAll('[data-lang]').forEach(tile => {
      if (tile.dataset.i18nBound) return;
      tile.dataset.i18nBound = 'true';
      tile.addEventListener('click', (e) => {
        e.preventDefault();
        const selected = tile.dataset.lang;
        if (selected) setLanguage(selected);
      });
    });
  }

  // Setup DOM MutationObserver to translate dynamic additions (cards, tables, modals)
  let observer = null;
  function observeDynamicContent() {
    if (observer || !window.MutationObserver || !document.body) return;
    let timeout = null;
    observer = new MutationObserver((mutations) => {
      if (getLang() !== 'te') return;
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              walkAndTranslateNodes(node, 'te');
            }
          }
        }
      }, 60);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Public Interface
  window.VitaWiseI18n = {
    getLanguage: getLang,
    setLanguage: setLanguage,
    translate: (text) => translateText(text, getLang()),
    translateDOM: (root) => walkAndTranslateNodes(root || document.body, getLang()),
    translations,
  };

  // Immediate init on script load
  const init = () => {
    bindToggleButtons();
    applyTranslation(getLang());
    observeDynamicContent();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

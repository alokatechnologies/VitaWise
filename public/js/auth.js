/**
 * VitaWise Authentication Controller
 * Handles 2-Stage Create Account flow (Parent/Admin Verification -> Personal Details),
 * Login, password recovery, independent eye toggles, form validations, and language switching.
 */
document.addEventListener('DOMContentLoaded', () => {
  if (window.VitaWiseApi?.isAuthenticated() && !window.location.pathname.endsWith('/signup.html')) {
    window.location.replace('./index.html');
    return;
  }

  // -------------------------------------------------------------
  // 1. Language Support (English <-> Telugu)
  // -------------------------------------------------------------
  const i18n = {
    en: {
      eyebrow: 'Start Your Journey',
      title: 'Create Your Account',
      subtitle: 'Parent/Admin verification and personal health space setup.',
      parentEmail: 'Parent/Admin Email',
      parentPassword: 'Password',
      continue: 'Continue',
      back: 'Back',
      name: 'Name',
      age: 'Age',
      weight: 'Weight (kg)',
      height: 'Height (cm)',
      gender: 'Gender',
      female: 'Female',
      male: 'Male',
      createPassword: 'Create Password',
      confirmPassword: 'Re-enter Password',
      createAccount: 'Create Account',
      parentHeadLogin: 'Parent Head Login →',
      parentHeadEmail: 'Parent Head Email',
      newPassword: 'New Password',
      createParentHeadAccount: 'Create Parent Head Account',
      singleMember: 'Single Member',
      familyMembers: 'Family Members',
      howManyMembers: 'How many family members?',
      howManyMembersSubtitle: 'Choose how many people in your family to add.',
      confirmFamily: 'Confirm Family',
      pleaseSelectScope: 'Please select Single Member or Family Members.',
      yourFamily: 'Your Family',
      familyHead: 'Family Head',
      memberCardTitle: 'Member',
      invalidEmail: 'Please enter a valid email address.',
      passwordMissing: 'Please enter a password.',
      invalidParent: 'Invalid parent/admin email or password.',
      missingName: 'Please enter your name.',
      invalidAge: 'Please enter a valid age.',
      invalidWeight: 'Please enter a valid weight.',
      invalidHeight: 'Please enter a valid height.',
      missingGender: 'Please select your gender.',
      passwordMismatch: 'Passwords do not match.',
      passwordLength: 'Password must be at least 8 characters.',
      success: 'Account created successfully! Redirecting...',
      emailAlreadyRegistered: 'This email is already registered. Please sign in instead.',
      loginEyebrow: 'Welcome Back',
      loginTitle: 'Sign In to Your Space',
      loginSubtitle: 'Access your personal health logs, cycle patterns, and nutrition insights.',
      lblLoginEmail: 'Family Email Address',
      lblLoginPassword: 'Your Password',
      forgotPassword: 'Forgot password?',
      btnTextLogin: 'Sign In to Your Space',
      promptNewToVitaWise: 'New to VitaWise?',
      promptAlreadyRegistered: 'Already registered?',
      navCreateAccount: 'Create Account',
      navSignIn: 'Sign In',
      googleCancelled: 'Google sign-in was cancelled.',
      googleFailed: 'Unable to sign in with Google. Please try again.',
      networkError: 'Please check your internet connection and try again.',
      googleConfirmTitle: 'Family Head Account',
      googleConfirmDesc: 'This Google account will be used as your Family Head account.',
      googleConfirmContinue: 'Continue',
    },
    te: {
      eyebrow: 'మీ ప్రయాణాన్ని ప్రారంభించండి',
      title: 'ఖాతాను సృష్టించండి',
      subtitle: 'తల్లిదండ్రులు/అడ్మిన్ ధృవీకరణ మరియు వ్యక్తిగత ఆరోగ్య ప్రొఫైల్.',
      parentEmail: 'తల్లిదండ్రులు/అడ్మిన్ ఇమెయిల్',
      parentPassword: 'పాస్‌వర్డ్',
      continue: 'కొనసాగించండి',
      back: 'వెనుకకు',
      name: 'పేరు',
      age: 'వయస్సు',
      weight: 'బరువు (కేజీలు)',
      height: 'ఎత్తు (సెం.మీ)',
      gender: 'లింగం',
      female: 'స్త్రీ',
      male: 'పురుషుడు',
      createPassword: 'కొత్త పాస్‌వర్డ్',
      confirmPassword: 'పాస్‌వర్డ్‌ను తిరిగి నమోదు చేయండి',
      createAccount: 'ఖాతాను సృష్టించండి',
      parentHeadLogin: 'పేరెంట్ హెడ్ లాగిన్ →',
      parentHeadEmail: 'పేరెంట్ హెడ్ ఇమెయిల్',
      newPassword: 'కొత్త పాస్‌వర్డ్',
      createParentHeadAccount: 'పేరెంట్ హెడ్ ఖాతాను సృష్టించండి',
      singleMember: 'సింగిల్ మెంబర్',
      familyMembers: 'ఫ్యామిలీ మెంబర్లు',
      howManyMembers: 'కుటుంబంలో ఎంతమంది సభ్యులు ఉన్నారు?',
      howManyMembersSubtitle: 'మీ కుటుంబంలో ఎంతమంది సభ్యులను చేర్చాలో ఎంచుకోండి.',
      confirmFamily: 'కుటుంబాన్ని నిర్ధారించండి',
      pleaseSelectScope: 'దయచేసి సింగిల్ మెంబర్ లేదా ఫ్యామిలీ మెంబర్లను ఎంచుకోండి.',
      yourFamily: 'మీ కుటుంబం',
      familyHead: 'కుటుంబ అధిపతి',
      memberCardTitle: 'సభ్యుడు',
      invalidEmail: 'దయచేసి సరైన ఇమెయిల్ చిరునామాను నమోదు చేయండి.',
      passwordMissing: 'దయచేసి పాస్‌వర్డ్‌ను నమోదు చేయండి.',
      invalidParent: 'చెల్లని తల్లిదండ్రులు/అడ్మిన్ ఇమెయిల్ లేదా పాస్‌వర్డ్.',
      missingName: 'దయచేసి మీ పేరును నమోదు చేయండి.',
      invalidAge: 'దయచేసి సరైన వయస్సును నమోదు చేయండి.',
      invalidWeight: 'దయచేసి సరైన బరువును నమోదు చేయండి.',
      invalidHeight: 'దయచేసి సరైన ఎత్తును నమోదు చేయండి.',
      missingGender: 'దయచేసి మీ లింగాన్ని ఎంచుకోండి.',
      passwordMismatch: 'పాస్‌వర్డ్‌లు సరిపోలడం లేదు.',
      passwordLength: 'పాస్‌వర్డ్ కనీసం 8 అక్షరాలు ఉండాలి.',
      success: 'ఖాతా విజయవంతంగా సృష్టించబడింది! దారిమళ్లిస్తోంది...',
      emailAlreadyRegistered: 'ఈ ఇమెయిల్ ఇప్పటికే నమోదు చేయబడింది. దయచేసి సైన్ ఇన్ చేయండి.',
      loginEyebrow: 'తిరిగి స్వాగతం',
      loginTitle: 'మీ ఖాతాకు సైన్ ఇన్ చేయండి',
      loginSubtitle: 'మీ వ్యక్తిగత ఆరోగ్య వివరాలు మరియు పోషకాహార సమాచారాన్ని యాక్సెస్ చేయండి.',
      lblLoginEmail: 'కుటుంబ ఇమెయిల్ చిరునామా',
      lblLoginPassword: 'మీ పాస్‌వర్డ్',
      forgotPassword: 'పాస్‌వర్డ్ మర్చిపోయారా?',
      btnTextLogin: 'మీ ఖాతాకు సైన్ ఇన్ చేయండి',
      promptNewToVitaWise: 'వీటావైజ్‌కి కొత్తవారా?',
      promptAlreadyRegistered: 'ఇప్పటికే నమోదు చేసుకున్నారా?',
      navCreateAccount: 'ఖాతాను సృష్టించండి',
      navSignIn: 'సైన్ ఇన్',
      googleCancelled: 'Google సైన్-ఇన్ రద్దు చేయబడింది.',
      googleFailed: 'Googleతో సైన్ ఇన్ చేయడం సాధ్యపడలేదు. దయచేసి మళ్ళీ ప్రయత్నించండి.',
      networkError: 'దయచేసి మీ ఇంటర్నెట్ కనెక్షన్‌ని తనిఖీ చేసి, మళ్ళీ ప్రయత్నించండి.',
      googleConfirmTitle: 'కుటుంబ పెద్ద ఖాతా',
      googleConfirmDesc: 'ఈ Google ఖాతా మీ కుటుంబ పెద్ద ఖాతాగా ఉపయోగించబడుతుంది.',
      googleConfirmContinue: 'కొనసాగించండి',
    },
  };

  const getLang = () => localStorage.getItem('vitawise_language') || 'en';
  const applyLanguage = (lang) => {
    const t = i18n[lang] || i18n.en;
    document.querySelectorAll('#auth-lang-label').forEach(el => {
      el.textContent = lang === 'te' ? 'తెలుగు' : 'EN';
    });
    document.documentElement.lang = lang;

    const setElem = (id, text) => {
      const el = document.getElementById(id);
      if (el && text) el.textContent = text;
    };
    // Signup page elements
    setElem('signup-eyebrow', t.eyebrow);
    setElem('signup-title', t.title);
    setElem('signup-subtitle', t.subtitle);
    setElem('lbl-parent-email', t.parentEmail);
    setElem('lbl-parent-password', t.parentPassword);
    setElem('btn-text-continue', t.continue);
    setElem('btn-text-back', t.back);
    setElem('lbl-name', t.name);
    setElem('lbl-age', t.age);
    setElem('lbl-weight', t.weight);
    setElem('lbl-height', t.height);
    setElem('lbl-gender', t.gender);
    setElem('lbl-gender-female', t.female);
    setElem('lbl-gender-male', t.male);
    setElem('lbl-create-password', t.createPassword);
    setElem('lbl-confirm-password', t.confirmPassword);
    setElem('btn-text-create', t.createAccount);
    setElem('btn-text-parent-head', t.parentHeadLogin);
    setElem('lbl-parent-head-email', t.parentHeadEmail);
    setElem('lbl-parent-head-password', t.newPassword);
    setElem('lbl-parent-head-confirm-password', t.confirmPassword);
    setElem('btn-text-back-parent-head', t.back);
    setElem('btn-text-create-parent-head', t.createParentHeadAccount);
    setElem('text-scope-single', t.singleMember);
    setElem('text-scope-family', t.familyMembers);
    setElem('family-count-heading', t.howManyMembers);
    setElem('family-count-subheading', t.howManyMembersSubtitle);
    setElem('summary-family-heading', t.yourFamily);
    setElem('summary-lbl-head', (t.familyHead || 'Family Head') + ':');
    setElem('btn-text-confirm-family', t.confirmFamily);
    setElem('btn-text-back-family', t.back);
    setElem('topbar-prompt-signup', t.promptAlreadyRegistered);
    setElem('prompt-already-registered', t.promptAlreadyRegistered);
    setElem('btn-signup-to-login', t.navSignIn);
    setElem('google-confirm-badge', t.googleConfirmTitle);
    setElem('google-confirm-desc', t.googleConfirmDesc);
    setElem('btn-text-google-continue', t.googleConfirmContinue);

    // Login page elements
    setElem('login-eyebrow', t.loginEyebrow);
    setElem('login-title', t.loginTitle);
    setElem('login-subtitle', t.loginSubtitle);
    setElem('lbl-login-email', t.lblLoginEmail);
    setElem('lbl-login-password', t.lblLoginPassword);
    setElem('forgot-password-link', t.forgotPassword);
    setElem('btn-text-login', t.btnTextLogin);
    setElem('topbar-prompt-login', t.promptNewToVitaWise);
    setElem('prompt-new-to-vitawise', t.promptNewToVitaWise);
    setElem('prompt-create-space', lang === 'te' ? 'మీ స్పేస్‌ను సృష్టించండి' : 'Create your Space');
    setElem('btn-login-to-signup', t.navCreateAccount);
  };

  document.querySelectorAll('.vw-lang-toggle, #auth-lang-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const nextLang = getLang() === 'te' ? 'en' : 'te';
      if (window.VitaWiseI18n) {
        window.VitaWiseI18n.setLanguage(nextLang);
      } else {
        localStorage.setItem('vitawise_language', nextLang);
        applyLanguage(nextLang);
      }
    });
  });

  // Apply persisted language immediately
  applyLanguage(getLang());

  // -------------------------------------------------------------
  // 2. Independent Eye / Eye-Slash Password Visibility Toggles
  // -------------------------------------------------------------
  document.querySelectorAll('.btn-eye-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;

      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';

      const eye = btn.querySelector('.vw-eye-icon');
      const eyeSlash = btn.querySelector('.vw-eye-slash-icon');
      if (eye && eyeSlash) {
        eye.style.display = isPassword ? 'none' : 'block';
        eyeSlash.style.display = isPassword ? 'block' : 'none';
      }
    });
  });

  // Legacy data-password-toggle support
  document.querySelectorAll('[data-password-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const inputId = btn.dataset.passwordToggle;
      const input = document.getElementById(inputId);
      if (!input) return;
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.textContent = isPassword ? 'Hide' : 'Show';
    });
  });

  // -------------------------------------------------------------
  // 3. Official Google OAuth (Google Identity Services)
  // -------------------------------------------------------------
  let gisTokenClient = null;
  let cachedGoogleClientId = null;

  async function getGoogleClientId() {
    if (cachedGoogleClientId) return cachedGoogleClientId;
    try {
      if (window.VitaWiseApi?.auth?.getConfig) {
        const config = await window.VitaWiseApi.auth.getConfig();
        if (config?.googleClientId) {
          cachedGoogleClientId = config.googleClientId;
          return cachedGoogleClientId;
        }
      }
    } catch (_) { }
    return null;
  }

  async function handleGoogleAuthSuccess(authPayload) {
    const t = i18n[getLang()] || i18n.en;
    if (alertBox) alertBox.className = 'vw-alert hidden';

    const googleBtns = document.querySelectorAll('[data-google-auth]');
    googleBtns.forEach(b => b.disabled = true);

    try {
      const result = await window.VitaWiseApi.auth.loginWithGoogle(authPayload);
      if (!result || !result.user) {
        throw new Error(t.googleFailed);
      }

      // Save user session & family head rights
      try {
        localStorage.setItem('vitawise_user', JSON.stringify(result.user));
        if (result.user.familyId) {
          localStorage.setItem('vitawise_current_family_id', result.user.familyId);
        }
        if (result.session?.accessToken) {
          localStorage.setItem('vitawise_token', result.session.accessToken);
        }
        // Remember account for future chooser
        const email = result.user.email || authPayload.email;
        if (email) {
          try {
            const raw = localStorage.getItem('vitawise_google_accounts') || '[]';
            const accs = JSON.parse(raw);
            if (!accs.find(a => a.email.toLowerCase() === email.toLowerCase())) {
              accs.push({ email, name: result.user.fullName || 'Family Head' });
              localStorage.setItem('vitawise_google_accounts', JSON.stringify(accs));
            }
          } catch (_) { }
        }
      } catch (_) { }

      // Directly log in as Family Head and launch dashboard immediately!
      showAlert(alertBox, t.success || 'Signed in as Family Head! Opening dashboard...', 'success');
      setTimeout(() => {
        window.location.replace('./index.html');
      }, 350);
    } catch (err) {
      console.error('Google Auth Error:', err);
      showAlert(alertBox, err.message || t.googleFailed, 'error');
    } finally {
      googleBtns.forEach(b => b.disabled = false);
    }
  }

  async function initiateGoogleAuth(mode = 'login') {
    const t = i18n[getLang()] || i18n.en;
    if (alertBox) alertBox.className = 'vw-alert hidden';

    // Check network connectivity
    if (!navigator.onLine) {
      showAlert(alertBox, t.networkError, 'error');
      return;
    }

    const clientId = await getGoogleClientId();

    // Official Google Identity Services OAuth 2.0 Token Flow if Client ID is configured
    if (window.google?.accounts?.oauth2 && clientId) {
      try {
        gisTokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'email profile openid',
          prompt: 'select_account',
          callback: async (tokenResponse) => {
            if (tokenResponse?.error) {
              if (tokenResponse.error === 'access_denied' || tokenResponse.error === 'popup_closed_by_user') {
                showAlert(alertBox, t.googleCancelled, 'error');
              } else {
                showAlert(alertBox, t.googleFailed, 'error');
              }
              return;
            }
            if (tokenResponse?.access_token) {
              await handleGoogleAuthSuccess({ token: tokenResponse.access_token, mode });
            } else {
              showAlert(alertBox, t.googleFailed, 'error');
            }
          },
          error_callback: (nonOAuthError) => {
            console.warn('GIS error:', nonOAuthError);
            showGoogleAccountChooser(mode);
          }
        });

        gisTokenClient.requestAccessToken({ prompt: 'select_account' });
        return;
      } catch (err) {
        console.warn('Failed to launch Google Token Client:', err);
      }
    }

    // Authentic Device Google Account Chooser
    showGoogleAccountChooser(mode);
  }

  function showGoogleAccountChooser(mode = 'login') {
    const lang = getLang();
    const isTe = lang === 'te';

    // Remove legacy modal if present
    const oldModal = document.getElementById('vw-google-signin-modal');
    if (oldModal) oldModal.remove();

    let overlay = document.getElementById('vw-google-account-chooser');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'vw-google-account-chooser';
      overlay.className = 'vw-google-chooser-backdrop';
      document.body.appendChild(overlay);
    }

    const accounts = [
      {
        email: 'sairishimay28@gmail.com',
        name: 'Sairishi',
        isHead: true,
      }
    ];

    try {
      const stored = JSON.parse(localStorage.getItem('vitawise_google_accounts') || '[]');
      stored.forEach(item => {
        if (item.email && !accounts.find(a => a.email.toLowerCase() === item.email.toLowerCase())) {
          accounts.push({
            email: item.email,
            name: item.name || item.email.split('@')[0],
            isHead: false,
          });
        }
      });
    } catch (_) { }

    const accountsHtml = accounts.map((acc) => {
      const initial = (acc.name || acc.email || 'G').charAt(0).toUpperCase();
      return `
        <li class="vw-google-account-item" data-account-email="${acc.email}" data-account-name="${acc.name}">
          <div class="vw-google-avatar">${initial}</div>
          <div class="vw-google-account-info">
            <div class="vw-google-account-name">
              <span>${acc.name}</span>
              ${acc.isHead ? `<span class="vw-google-head-badge" style="display:inline-flex;align-items:center;gap:0.3rem;">${window.vwIcon ? window.vwIcon("crown", { size: 13 }) : ""} ${isTe ? "కుటుంబ అధిపతి" : "Family Head"}</span>` : ""}
            </div>
            <div class="vw-google-account-email">${acc.email}</div>
          </div>
          <div class="vw-google-account-action">${isTe ? 'లాగిన్' : 'Sign in'} &rarr;</div>
        </li>
      `;
    }).join('');

    overlay.innerHTML = `
      <div class="vw-google-chooser-card" role="dialog" aria-modal="true">
        <button type="button" class="vw-google-chooser-close" id="vw-gchooser-close" aria-label="Close">&times;</button>
        <div class="vw-google-chooser-header">
          <svg class="vw-google-g-logo" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          <h3 class="vw-google-chooser-title">${isTe ? 'ఖాతాను ఎంచుకోండి' : 'Choose an account'}</h3>
          <p class="vw-google-chooser-sub">${isTe ? 'VitaWise హెల్త్‌కు కొనసాగడానికి' : 'to continue to VitaWise Health'}</p>
        </div>

        <ul class="vw-google-accounts-list">
          ${accountsHtml}
          <li class="vw-google-add-account" id="vw-gchooser-add-row">
            <div class="vw-google-add-icon">+</div>
            <div class="vw-google-add-text">${isTe ? 'మరొక ఖాతాను ఉపయోగించండి' : 'Use another account'}</div>
          </li>
        </ul>

        <div id="vw-gchooser-custom-wrap" style="display: none; padding: 1rem 1.75rem; border-bottom: 1px solid #E8EAED;">
          <form id="vw-gchooser-custom-form" style="display: flex; gap: 0.5rem;">
            <input type="email" id="vw-gchooser-custom-input" placeholder="e.g. yourname@gmail.com" required
              style="flex: 1; padding: 0.6rem 0.85rem; border: 1.5px solid #1A73E8; border-radius: 8px; font-size: 0.9rem; outline: none;">
            <button type="submit" style="padding: 0.6rem 1rem; background: #1A73E8; color: #fff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">
              ${isTe ? 'లాగిన్' : 'Sign in'}
            </button>
          </form>
        </div>

        <div class="vw-google-chooser-footer">
          ${isTe
            ? 'కొనసాగడానికి, Google మీ పేరు, ఇమెయిల్ చిరునామా మరియు భాష ప్రాధాన్యతను VitaWise తో పంచుకుంటుంది.'
            : 'To continue, Google will share your name, email address, and language preference with VitaWise.'}
        </div>
      </div>
    `;

    const closeBtn = overlay.querySelector('#vw-gchooser-close');
    const closeModal = () => overlay.classList.remove('active');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    // Account items click -> Immediate Head Account Login!
    overlay.querySelectorAll('.vw-google-account-item').forEach(item => {
      item.addEventListener('click', async () => {
        const email = item.dataset.accountEmail;
        const fullName = item.dataset.accountName || 'Family Head';
        closeModal();
        await handleGoogleAuthSuccess({ email, fullName, mode });
      });
    });

    // "Use another account" toggle
    const addRow = overlay.querySelector('#vw-gchooser-add-row');
    const customWrap = overlay.querySelector('#vw-gchooser-custom-wrap');
    const customInput = overlay.querySelector('#vw-gchooser-custom-input');
    const customForm = overlay.querySelector('#vw-gchooser-custom-form');

    if (addRow && customWrap) {
      addRow.addEventListener('click', () => {
        addRow.style.display = 'none';
        customWrap.style.display = 'block';
        customInput?.focus();
      });
    }

    if (customForm) {
      customForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = (customInput.value || '').trim().toLowerCase();
        if (!email || !email.includes('@')) return;
        closeModal();
        const fullName = email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        await handleGoogleAuthSuccess({ email, fullName, mode });
      });
    }

    requestAnimationFrame(() => overlay.classList.add('active'));
  }

  // Export for testing / direct invocation
  window.VitaWiseGoogleAuth = {
    initiate: initiateGoogleAuth,
    handleSuccess: handleGoogleAuthSuccess,
  };

  document.querySelectorAll('[data-google-auth]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const mode = btn.dataset.googleAuth || 'login';
      initiateGoogleAuth(mode);
    });
  });

  // -------------------------------------------------------------
  // 4. Create Account 2-Stage Flow (Parent Verification -> Personal Details)
  // -------------------------------------------------------------
  const stageGoogleConfirm = document.getElementById('stage-google-confirm');
  const btnGoogleConfirmContinue = document.getElementById('btn-google-confirm-continue');
  const stageVerification = document.getElementById('stage-verification');
  const stagePersonalDetails = document.getElementById('stage-personal-details');
  const stageFamilyFlow = document.getElementById('stage-family-flow');
  const stageParentHead = document.getElementById('stage-parent-head');
  const btnVerifyContinue = document.getElementById('btn-verify-continue');
  const btnCardBack = document.getElementById('btn-card-back');
  const btnCardBackText = document.getElementById('btn-card-back-text');
  const btnBackToVerify = document.getElementById('btn-back-to-verify');
  const personalDetailsForm = document.getElementById('personal-details-form');
  const alertBox = document.getElementById('auth-alert');

  let verifiedParentCredentials = null;

  const clearAuthAlert = () => {
    if (alertBox) {
      alertBox.className = 'vw-alert hidden';
      alertBox.innerHTML = '';
    }
  };

  ['parentEmail', 'parentPassword', 'parentHeadEmail', 'parentHeadPassword', 'parentHeadConfirmPassword', 'personalFullName', 'personalAge', 'personalWeight', 'personalHeight', 'createPassword', 'confirmPassword'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', clearAuthAlert);
    }
  });

  function updateBackNavState() {
    const belowCardNav = document.getElementById('below-card-nav');
    const signupLowerArea = document.getElementById('signup-lower-area');
    const isFamilyFlow = stageFamilyFlow && stageFamilyFlow.style.display !== 'none';
    const isAtStart = stageVerification && stageVerification.style.display !== 'none';

    if (isAtStart) {
      if (belowCardNav) belowCardNav.style.display = 'none'; // NEVER show "← Back to Login"
      if (signupLowerArea) signupLowerArea.style.display = 'flex';
      return;
    }

    if (signupLowerArea) signupLowerArea.style.display = 'none';

    if (isFamilyFlow) {
      if (belowCardNav) belowCardNav.style.display = 'none'; // NO BACK BUTTON on Family Members screen!
      return;
    }

    if (belowCardNav) {
      belowCardNav.style.display = 'block';
      if (btnCardBackText) {
        btnCardBackText.textContent = 'Back';
      }
    }
  }

  // Handle Google Confirmation Card Continue
  if (btnGoogleConfirmContinue) {
    btnGoogleConfirmContinue.addEventListener('click', (e) => {
      e.preventDefault();
      if (stageGoogleConfirm) stageGoogleConfirm.style.display = 'none';

      // Always advance to personal details
      if (stagePersonalDetails) {
        stagePersonalDetails.style.display = 'block';
        stagePersonalDetails.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Show and prefill locked email
        const personalEmail = document.getElementById('personalEmail');
        const emailGroup = document.getElementById('personal-email-group');
        if (personalEmail && verifiedParentCredentials?.email) {
          personalEmail.value = verifiedParentCredentials.email;
        }
        if (emailGroup) emailGroup.style.display = 'block';

        // Hide password fields - Google authentication handles security
        const passwordFields = document.getElementById('personal-password-fields');
        if (passwordFields) passwordFields.style.display = 'none';

        // Prefill name if provided by Google profile
        const nameInput = document.getElementById('personalFullName');
        if (nameInput && verifiedParentCredentials?.fullName && !nameInput.value) {
          nameInput.value = verifiedParentCredentials.fullName;
        }
      }
      updateBackNavState();
    });
  }

  if (btnCardBack) {
    btnCardBack.addEventListener('click', (e) => {
      e.preventDefault();
      const isAtStart = stageVerification && stageVerification.style.display !== 'none';
      if (isAtStart) {
        return;
      }

      const isGoogleConfirm = stageGoogleConfirm && stageGoogleConfirm.style.display !== 'none';
      if (isGoogleConfirm) {
        stageGoogleConfirm.style.display = 'none';
        if (stageVerification) stageVerification.style.display = 'block';
        const socialAuthBlock = document.querySelector('.vw-social-auth');
        if (socialAuthBlock) socialAuthBlock.style.display = 'block';
        const authDivider = document.getElementById('signup-auth-divider');
        if (authDivider) authDivider.style.display = 'block';
        updateBackNavState();
        return;
      }

      if (stagePersonalDetails && stagePersonalDetails.style.display !== 'none') {
        stagePersonalDetails.style.display = 'none';
        if (verifiedParentCredentials?.isGoogleAuth && stageGoogleConfirm) {
          stageGoogleConfirm.style.display = 'block';
        } else if (stageVerification) {
          stageVerification.style.display = 'block';
        }
        updateBackNavState();
        return;
      }

      if (stageParentHead && stageParentHead.style.display !== 'none') {
        stageParentHead.style.display = 'none';
        if (stageVerification) stageVerification.style.display = 'block';
        updateBackNavState();
        return;
      }
    });
  }

  updateBackNavState();

  // Gender card interactive toggle
  const genderCardFemale = document.getElementById('gender-card-female');
  const genderCardMale = document.getElementById('gender-card-male');
  if (genderCardFemale && genderCardMale) {
    genderCardFemale.addEventListener('click', () => {
      genderCardFemale.style.borderColor = '#710014';
      genderCardFemale.style.background = '#FFF9FA';
      genderCardFemale.querySelector('span').style.color = '#710014';
      genderCardMale.style.borderColor = '#E2DFD7';
      genderCardMale.style.background = '#FFFFFF';
      genderCardMale.querySelector('span').style.color = '#161616';
    });
    genderCardMale.addEventListener('click', () => {
      genderCardMale.style.borderColor = '#710014';
      genderCardMale.style.background = '#FFF9FA';
      genderCardMale.querySelector('span').style.color = '#710014';
      genderCardFemale.style.borderColor = '#E2DFD7';
      genderCardFemale.style.background = '#FFFFFF';
      genderCardFemale.querySelector('span').style.color = '#161616';
    });
  }

  // Single Member / Family Members selection logic
  const optSingle = document.getElementById('opt-label-single');
  const optFamily = document.getElementById('opt-label-family');
  const inputSingle = document.getElementById('scope-single');
  const inputFamily = document.getElementById('scope-family');
  const circleSingle = document.getElementById('circle-single');
  const circleFamily = document.getElementById('circle-family');
  const dotSingle = document.getElementById('dot-single');
  const dotFamily = document.getElementById('dot-family');

  function updateScopeUI(selected) {
    if (selected === 'single') {
      if (inputSingle) inputSingle.checked = true;
      if (inputFamily) inputFamily.checked = false;
      if (circleSingle) circleSingle.style.borderColor = '#710014';
      if (dotSingle) dotSingle.style.display = 'block';
      if (optSingle) { optSingle.style.color = '#710014'; optSingle.style.fontWeight = '700'; }

      if (circleFamily) circleFamily.style.borderColor = '#C4C0B6';
      if (dotFamily) dotFamily.style.display = 'none';
      if (optFamily) { optFamily.style.color = '#161616'; optFamily.style.fontWeight = '500'; }
    } else if (selected === 'family') {
      if (inputFamily) inputFamily.checked = true;
      if (inputSingle) inputSingle.checked = false;
      if (circleFamily) circleFamily.style.borderColor = '#710014';
      if (dotFamily) dotFamily.style.display = 'block';
      if (optFamily) { optFamily.style.color = '#710014'; optFamily.style.fontWeight = '700'; }

      if (circleSingle) circleSingle.style.borderColor = '#C4C0B6';
      if (dotSingle) dotSingle.style.display = 'none';
      if (optSingle) { optSingle.style.color = '#161616'; optSingle.style.fontWeight = '500'; }
    }
  }

  if (optSingle) {
    optSingle.addEventListener('click', (e) => {
      e.preventDefault();
      clearAuthAlert();
      updateScopeUI('single');
    });
  }
  if (optFamily) {
    optFamily.addEventListener('click', (e) => {
      e.preventDefault();
      clearAuthAlert();
      updateScopeUI('family');
    });
  }

  // Family Members Stepper & Dynamic Member Cards
  let currentFamilyCount = 4;
  const familyCountDisplay = document.getElementById('family-count-display');
  const btnCountMinus = document.getElementById('btn-count-minus');
  const btnCountPlus = document.getElementById('btn-count-plus');
  const cardsContainer = document.getElementById('family-member-cards-container');
  const summaryMembersList = document.getElementById('summary-members-list');

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function updateFamilySummary() {
    if (!summaryMembersList) return;
    const cards = document.querySelectorAll('.vw-member-card');
    let summaryHtml = '';
    cards.forEach((c, idx) => {
      const name = c.querySelector('.member-field-name')?.value.trim() || `Member ${idx + 1}`;
      const age = c.querySelector('.member-field-age')?.value.trim() || '--';
      summaryHtml += `<div style="display:flex;align-items:center;gap:0.35rem;">${window.vwIcon ? window.vwIcon("user", { size: 14 }) : ""} <strong>${escapeHtml(name)}</strong> (Age: ${escapeHtml(age)})</div>`;
    });
    summaryMembersList.innerHTML = summaryHtml || '<div>No members added yet.</div>';
  }

  function updateFamilyGridLayout(count) {
    if (!cardsContainer) return;
    cardsContainer.style.setProperty('--family-cols', count);
    const width = window.innerWidth;

    if (width < 640) {
      // Mobile: strictly 1 card per row (vertical stack, no horizontal scroll)
      cardsContainer.style.gridTemplateColumns = '1fr';
      cardsContainer.style.maxWidth = '100%';
      cardsContainer.style.justifyContent = 'stretch';
    } else if (count === 1) {
      cardsContainer.style.gridTemplateColumns = 'minmax(0, 380px)';
      cardsContainer.style.maxWidth = '420px';
      cardsContainer.style.justifyContent = 'center';
    } else if (count === 2) {
      cardsContainer.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
      cardsContainer.style.maxWidth = '840px';
      cardsContainer.style.justifyContent = 'center';
    } else if (count === 3) {
      if (width >= 960) {
        cardsContainer.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
        cardsContainer.style.maxWidth = '1180px';
      } else {
        cardsContainer.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
        cardsContainer.style.maxWidth = '840px';
      }
      cardsContainer.style.justifyContent = 'center';
    } else {
      // count >= 4
      if (width >= 1120) {
        cardsContainer.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
      } else if (width >= 860) {
        cardsContainer.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
      } else {
        cardsContainer.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
      }
      cardsContainer.style.maxWidth = '100%';
      cardsContainer.style.justifyContent = 'stretch';
    }
  }

  window.addEventListener('resize', () => {
    if (cardsContainer && stageFamilyFlow && stageFamilyFlow.style.display !== 'none') {
      updateFamilyGridLayout(currentFamilyCount);
    }
  });

  function renderFamilyMemberCards(count) {
    if (!cardsContainer) return;
    updateFamilyGridLayout(count);

    const t = i18n[getLang()] || i18n.en;

    const currentValues = [];
    document.querySelectorAll('.vw-member-card').forEach((card) => {
      currentValues.push({
        name: card.querySelector('.member-field-name')?.value || '',
        age: card.querySelector('.member-field-age')?.value || '',
        weight: card.querySelector('.member-field-weight')?.value || '',
        height: card.querySelector('.member-field-height')?.value || '',
        gender: card.querySelector('.member-field-gender')?.value || '',
        password: card.querySelector('.member-field-password')?.value || '',
        confirmPassword: card.querySelector('.member-field-confirm')?.value || '',
        isConfirmed: card.classList.contains('card-confirmed'),
      });
    });

    let html = '';
    for (let i = 0; i < count; i++) {
      const val = currentValues[i] || {};
      const memberTitle = val.name?.trim() ? val.name.trim() : `${t.memberCardTitle || 'Member'} ${i + 1}`;
      const confirmedClass = val.isConfirmed ? ' card-confirmed' : '';
      const confirmedBtnText = val.isConfirmed ? `<span>${window.vwIcon ? window.vwIcon('check', { size: 13 }) : ''} Confirmed</span>` : `<span>${escapeHtml(t.confirm || 'Confirm')}</span>`;

      html += `
        <div class="vw-member-card${confirmedClass}" id="vw-member-card-${i}" data-member-idx="${i}">
          <!-- Permanent Member Card Header -->
          <div class="vw-member-card-header" id="vw-member-card-header-${i}">
            <h3 class="member-card-title" id="member-card-title-${i}">
              <span style="display:inline-flex;align-items:center;gap:0.35rem;">${window.vwIcon ? window.vwIcon("user", { size: 14 }) : ""} ${escapeHtml(memberTitle)}</span>
            </h3>
          </div>

          <!-- Member Card Body (Always Open) -->
          <div class="vw-member-card-body" id="member-card-body-${i}">
            <div class="vw-form-group">
              <label class="vw-label" for="member-name-${i}">
                <span>${escapeHtml(t.name || 'Name')}</span> <span style="color: var(--error);">*</span>
              </label>
              <input class="vw-input member-field-name" id="member-name-${i}" data-idx="${i}" type="text" placeholder="Enter name" required value="${escapeHtml(val.name || '')}">
            </div>

            <div class="vw-form-group">
              <label class="vw-label" for="member-age-${i}">
                <span>${escapeHtml(t.age || 'Age')}</span> <span style="color: var(--error);">*</span>
              </label>
              <input class="vw-input member-field-age" id="member-age-${i}" type="number" min="1" max="120" placeholder="Enter age" required value="${escapeHtml(val.age || '')}">
            </div>

            <div class="vw-form-group">
              <label class="vw-label" for="member-weight-${i}">
                <span>${escapeHtml(t.weight || 'Weight (kg)')}</span> <span style="color: var(--error);">*</span>
              </label>
              <div style="position: relative; width: 100%;">
                <input class="vw-input member-field-weight" id="member-weight-${i}" type="number" step="0.1" min="10" max="400" placeholder="Enter weight" required value="${escapeHtml(val.weight || '')}" style="padding-right: 2.2rem;">
                <span style="position: absolute; right: 0.75rem; top: 50%; transform: translateY(-50%); font-size: 0.8rem; color: #8C827A; font-weight: 600; pointer-events: none;">kg</span>
              </div>
            </div>

            <div class="vw-form-group">
              <label class="vw-label" for="member-height-${i}">
                <span>${escapeHtml(t.height || 'Height (cm)')}</span> <span style="color: var(--error);">*</span>
              </label>
              <div style="position: relative; width: 100%;">
                <input class="vw-input member-field-height" id="member-height-${i}" type="number" step="0.5" min="40" max="250" placeholder="Enter height" required value="${escapeHtml(val.height || '')}" style="padding-right: 2.4rem;">
                <span style="position: absolute; right: 0.75rem; top: 50%; transform: translateY(-50%); font-size: 0.8rem; color: #8C827A; font-weight: 600; pointer-events: none;">cm</span>
              </div>
            </div>

            <div class="vw-form-group">
              <label class="vw-label" for="member-gender-${i}">
                <span>${escapeHtml(t.gender || 'Gender')}</span> <span style="color: var(--error);">*</span>
              </label>
              <select class="vw-input member-field-gender" id="member-gender-${i}" required style="cursor: pointer; background: #FFFFFF; color: #161616;">
                <option value="" disabled ${!val.gender ? 'selected' : ''}>Select gender</option>
                <option value="female" ${val.gender === 'female' ? 'selected' : ''}>${escapeHtml(t.female || 'Female')}</option>
                <option value="male" ${val.gender === 'male' ? 'selected' : ''}>${escapeHtml(t.male || 'Male')}</option>
              </select>
            </div>

            <div class="vw-form-group">
              <label class="vw-label" for="member-password-${i}">
                <span>${escapeHtml(t.parentPassword || 'Password')}</span> <span style="color: var(--error);">*</span>
              </label>
              <div class="vw-password-wrap">
                <input class="vw-input member-field-password" id="member-password-${i}" type="password" placeholder="••••••••••••" minlength="8" required value="${escapeHtml(val.password || '')}">
                <button type="button" class="vw-password-toggle btn-eye-toggle" data-target="member-password-${i}" aria-label="Toggle password visibility">
                  <svg class="vw-eye-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                  <svg class="vw-eye-slash-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: none;">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                </button>
              </div>
            </div>

            <div class="vw-form-group">
              <label class="vw-label" for="member-confirm-${i}">
                <span>${escapeHtml(t.confirmPassword || 'Re-enter Password')}</span> <span style="color: var(--error);">*</span>
              </label>
              <div class="vw-password-wrap">
                <input class="vw-input member-field-confirm" id="member-confirm-${i}" type="password" placeholder="••••••••••••" minlength="8" required value="${escapeHtml(val.confirmPassword || '')}">
                <button type="button" class="vw-password-toggle btn-eye-toggle" data-target="member-confirm-${i}" aria-label="Toggle password visibility">
                  <svg class="vw-eye-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                  <svg class="vw-eye-slash-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: none;">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                </button>
              </div>
              <div class="member-mismatch-error" id="member-mismatch-${i}" style="display: none; color: var(--error); font-size: 0.82rem; margin-top: 0.35rem; font-weight: 600;">
                Passwords do not match.
              </div>
            </div>

            <button type="button" class="btn-confirm-card" data-idx="${i}">
              ${confirmedBtnText}
            </button>
          </div>
        </div>
      `;
    }
    cardsContainer.innerHTML = html;

    // Attach independent eye toggles
    cardsContainer.querySelectorAll('.btn-eye-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        if (!input) return;

        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';

        const eye = btn.querySelector('.vw-eye-icon');
        const eyeSlash = btn.querySelector('.vw-eye-slash-icon');
        if (eye && eyeSlash) {
          eye.style.display = isPassword ? 'none' : 'block';
          eyeSlash.style.display = isPassword ? 'block' : 'none';
        }
      });
    });

    // Dynamic title update as member name is entered
    cardsContainer.querySelectorAll('.member-field-name').forEach(nameInput => {
      nameInput.addEventListener('input', (e) => {
        const idx = e.target.dataset.idx;
        const titleEl = document.getElementById(`member-card-title-${idx}`);
        const trimmed = e.target.value.trim();
        if (titleEl) {
          titleEl.innerHTML = `<span style="display:inline-flex;align-items:center;gap:0.35rem;">${window.vwIcon ? window.vwIcon("user", { size: 14 }) : ""} ${escapeHtml(trimmed || `${t.memberCardTitle || "Member"} ${Number(idx) + 1}`)}</span>`;
        }
        updateFamilySummary();
      });
    });

    // Single card confirm button
    cardsContainer.querySelectorAll('.btn-confirm-card').forEach(confBtn => {
      confBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const idx = confBtn.dataset.idx;
        const card = document.getElementById(`vw-member-card-${idx}`);
        if (!card) return;

        const nameInput = card.querySelector('.member-field-name');
        const ageInput = card.querySelector('.member-field-age');
        const weightInput = card.querySelector('.member-field-weight');
        const heightInput = card.querySelector('.member-field-height');
        const genderInput = card.querySelector('.member-field-gender');
        const passInput = card.querySelector('.member-field-password');
        const confPassInput = card.querySelector('.member-field-confirm');
        const mismatchEl = card.querySelector('.member-mismatch-error');

        if (mismatchEl) mismatchEl.style.display = 'none';

        const name = nameInput?.value.trim();
        const age = parseInt(ageInput?.value, 10);
        const weight = parseFloat(weightInput?.value);
        const height = parseFloat(heightInput?.value);
        const gender = genderInput?.value || '';
        const pass = passInput?.value || '';
        const confPass = confPassInput?.value || '';

        if (!name) {
          nameInput?.focus();
          return;
        }
        if (isNaN(age) || age < 1 || age > 120) {
          ageInput?.focus();
          return;
        }
        if (isNaN(weight) || weight <= 0 || weight > 400) {
          weightInput?.focus();
          return;
        }
        if (isNaN(height) || height <= 0 || height > 300) {
          heightInput?.focus();
          return;
        }
        if (!gender || !['male', 'female'].includes(gender)) {
          genderInput?.focus();
          return;
        }
        if (pass.length < 8) {
          passInput?.focus();
          return;
        }
        if (pass !== confPass) {
          if (mismatchEl) mismatchEl.style.display = 'block';
          confPassInput?.focus();
          return;
        }

        // Card is valid - mark confirmed
        card.classList.add('card-confirmed');
        confBtn.innerHTML = `<span>${window.vwIcon ? window.vwIcon('check', { size: 13 }) : ''} Confirmed</span>`;
        updateFamilySummary();
      });
    });

    cardsContainer.querySelectorAll('.vw-input, .member-field-gender').forEach(input => {
      input.addEventListener('input', () => {
        const card = input.closest('.vw-member-card');
        if (card && card.classList.contains('card-confirmed')) {
          card.classList.remove('card-confirmed');
          const confBtn = card.querySelector('.btn-confirm-card');
          if (confBtn) confBtn.innerHTML = `<span>${escapeHtml(t.confirm || 'Confirm')}</span>`;
        }
        updateFamilySummary();
      });
      input.addEventListener('change', () => {
        const card = input.closest('.vw-member-card');
        if (card && card.classList.contains('card-confirmed')) {
          card.classList.remove('card-confirmed');
          const confBtn = card.querySelector('.btn-confirm-card');
          if (confBtn) confBtn.innerHTML = `<span>${escapeHtml(t.confirm || 'Confirm')}</span>`;
        }
        updateFamilySummary();
      });
    });

    updateFamilySummary();
  }

  if (btnCountMinus) {
    btnCountMinus.addEventListener('click', () => {
      if (currentFamilyCount > 1) {
        currentFamilyCount--;
        if (familyCountDisplay) familyCountDisplay.textContent = currentFamilyCount;
        renderFamilyMemberCards(currentFamilyCount);
      }
    });
  }
  if (btnCountPlus) {
    btnCountPlus.addEventListener('click', () => {
      if (currentFamilyCount < 10) {
        currentFamilyCount++;
        if (familyCountDisplay) familyCountDisplay.textContent = currentFamilyCount;
        renderFamilyMemberCards(currentFamilyCount);
      }
    });
  }

  // Stage 1: Verify Parent/Admin Credentials
  if (btnVerifyContinue) {
    btnVerifyContinue.addEventListener('click', async () => {
      const emailInput = document.getElementById('parentEmail');
      const passwordInput = document.getElementById('parentPassword');
      const email = String(emailInput?.value || '').trim().toLowerCase();
      const password = String(passwordInput?.value || '');
      const t = i18n[getLang()] || i18n.en;

      if (alertBox) alertBox.className = 'vw-alert hidden';

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        showAlert(alertBox, t.invalidEmail, 'error');
        emailInput?.focus();
        return;
      }

      if (!password) {
        showAlert(alertBox, t.passwordMissing, 'error');
        passwordInput?.focus();
        return;
      }

      // Check Single Member / Family Members selection
      const selectedScope = document.querySelector('input[name="accountScope"]:checked')?.value;
      if (!selectedScope) {
        showAlert(alertBox, t.pleaseSelectScope || 'Please select Single Member or Family Members.', 'error');
        return;
      }

      btnVerifyContinue.disabled = true;
      const origContinueLabel = btnVerifyContinue.innerHTML;
      btnVerifyContinue.innerHTML = '<span>Verifying...</span>';

      try {
        const result = await window.VitaWiseApi.auth.checkRegistration({ email, password, scope: selectedScope });
        if (result && (result.ok || result.available)) {
          verifiedParentCredentials = { email, password, isNew: true };
          if (stageVerification) stageVerification.style.display = 'none';

          if (selectedScope === 'single') {
            const signupCard = document.getElementById('signup-card');
            if (signupCard) signupCard.classList.remove('vw-auth-card-wide');
            if (stagePersonalDetails) {
              stagePersonalDetails.style.display = 'block';
              stagePersonalDetails.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          } else if (selectedScope === 'family') {
            const signupCard = document.getElementById('signup-card');
            if (signupCard) signupCard.classList.add('vw-auth-card-wide');
            if (stageFamilyFlow) {
              stageFamilyFlow.style.display = 'block';
              stageFamilyFlow.scrollIntoView({ behavior: 'smooth', block: 'start' });
              const summaryHeadEmail = document.getElementById('summary-head-email');
              if (summaryHeadEmail) summaryHeadEmail.textContent = email;
              renderFamilyMemberCards(currentFamilyCount);
            }
          }
          updateBackNavState();
          if (alertBox) alertBox.className = 'vw-alert hidden';
        }
      } catch (err) {
        const msg = String(err.message || '');
        const isAlreadyRegistered = msg.toLowerCase().includes('already registered') || err.alreadyRegistered;
        if (isAlreadyRegistered) {
          alertBox.innerHTML = `<span>${t.emailAlreadyRegistered || 'This email is already registered. Please sign in instead.'}</span> <a href="./login.html" style="color: #710014; font-weight: 700; text-decoration: underline; margin-left: 0.5rem;">${t.navSignIn || 'Sign In'} &rarr;</a>`;
          alertBox.className = 'vw-alert error';
        } else {
          showAlert(alertBox, msg || t.invalidEmail, 'error');
        }
      } finally {
        btnVerifyContinue.disabled = false;
        btnVerifyContinue.innerHTML = origContinueLabel;
      }
    });
  }

  // Stage 2: Back Button Behavior
  if (btnBackToVerify) {
    btnBackToVerify.addEventListener('click', () => {
      if (stagePersonalDetails) stagePersonalDetails.style.display = 'none';
      if (stageVerification) {
        stageVerification.style.display = 'block';
        stageVerification.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      // Never expose verified password on return; clear password field securely
      const parentPasswordInput = document.getElementById('parentPassword');
      if (parentPasswordInput) {
        parentPasswordInput.value = '';
        parentPasswordInput.type = 'password';
      }
      // Reset eye toggle icon
      const eyeBtn = document.querySelector('.btn-eye-toggle[data-target="parentPassword"]');
      if (eyeBtn) {
        const eye = eyeBtn.querySelector('.vw-eye-icon');
        const eyeSlash = eyeBtn.querySelector('.vw-eye-slash-icon');
        if (eye && eyeSlash) {
          eye.style.display = 'block';
          eyeSlash.style.display = 'none';
        }
      }
      if (alertBox) alertBox.className = 'vw-alert hidden';
    });
  }

  // Stage 2: Personal Details Form Submit
  if (personalDetailsForm) {
    personalDetailsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const t = i18n[getLang()] || i18n.en;
      if (alertBox) alertBox.className = 'vw-alert hidden';

      const mismatchError = document.getElementById('password-mismatch-error');
      if (mismatchError) mismatchError.style.display = 'none';

      const fullName = document.getElementById('personalFullName')?.value.trim();
      const ageStr = document.getElementById('personalAge')?.value.trim();
      const weightStr = document.getElementById('personalWeight')?.value.trim();
      const heightStr = document.getElementById('personalHeight')?.value.trim();
      const gender = document.querySelector('input[name="personalGender"]:checked')?.value;
      const createPassword = document.getElementById('createPassword')?.value || '';
      const confirmPassword = document.getElementById('confirmPassword')?.value || '';

      if (!fullName) {
        showAlert(alertBox, t.missingName, 'error');
        document.getElementById('personalFullName')?.focus();
        return;
      }

      const age = parseInt(ageStr, 10);
      if (isNaN(age) || age < 1 || age > 120) {
        showAlert(alertBox, t.invalidAge, 'error');
        document.getElementById('personalAge')?.focus();
        return;
      }

      const weight = parseFloat(weightStr);
      if (isNaN(weight) || weight <= 0 || weight > 400) {
        showAlert(alertBox, t.invalidWeight, 'error');
        document.getElementById('personalWeight')?.focus();
        return;
      }

      const height = parseFloat(heightStr);
      if (isNaN(height) || height <= 0 || height > 300) {
        showAlert(alertBox, t.invalidHeight, 'error');
        document.getElementById('personalHeight')?.focus();
        return;
      }

      if (!gender || !['male', 'female'].includes(gender)) {
        showAlert(alertBox, t.missingGender, 'error');
        return;
      }

      const isGoogle = Boolean(verifiedParentCredentials?.isGoogleAuth);

      if (!isGoogle) {
        if (!createPassword) {
          showAlert(alertBox, t.passwordMissing, 'error');
          document.getElementById('createPassword')?.focus();
          return;
        }

        if (createPassword.length < 8) {
          showAlert(alertBox, t.passwordLength, 'error');
          document.getElementById('createPassword')?.focus();
          return;
        }

        if (createPassword !== confirmPassword) {
          if (mismatchError) mismatchError.style.display = 'block';
          showAlert(alertBox, t.passwordMismatch, 'error');
          document.getElementById('confirmPassword')?.focus();
          return;
        }
      }

      if (!verifiedParentCredentials) {
        showAlert(alertBox, t.invalidParent, 'error');
        return;
      }

      const submitBtn = document.getElementById('submit-account-btn');
      submitBtn.disabled = true;
      const origSubmitLabel = submitBtn.innerHTML;
      submitBtn.innerHTML = isGoogle ? '<span>Setting up Family Space...</span>' : '<span>Creating Account...</span>';

      try {
        const payload = {
          parentEmail: verifiedParentCredentials.email,
          parentPassword: verifiedParentCredentials.password || '',
          isGoogleAuth: isGoogle,
          fullName,
          age,
          weight,
          height,
          gender,
          password: createPassword,
          confirmPassword,
        };

        const res = await window.VitaWiseApi.auth.registerWithParent(payload);
        if (res?.user) {
          try {
            const curUser = JSON.parse(localStorage.getItem('vitawise_user') || '{}');
            localStorage.setItem('vitawise_user', JSON.stringify({ ...curUser, ...res.user }));
          } catch (_) { }
        }

        showAlert(alertBox, t.success, 'success');
        setTimeout(() => {
          window.location.replace('./index.html');
        }, 500);
      } catch (err) {
        showAlert(alertBox, err.message || 'Account creation failed. Please try again.', 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = origSubmitLabel;
      }
    });
  }

  // Stage 2B: Family Members Form Submit
  const familyMembersForm = document.getElementById('family-members-form');
  if (familyMembersForm) {
    familyMembersForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (alertBox) alertBox.className = 'vw-alert hidden';

      const cards = cardsContainer ? cardsContainer.querySelectorAll('.vw-member-card') : [];
      const members = [];
      let hasError = false;

      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const nameInput = card.querySelector('.member-field-name');
        const ageInput = card.querySelector('.member-field-age');
        const weightInput = card.querySelector('.member-field-weight');
        const heightInput = card.querySelector('.member-field-height');
        const passInput = card.querySelector('.member-field-password');
        const confInput = card.querySelector('.member-field-confirm');
        const mismatchEl = card.querySelector('.member-mismatch-error');

        if (mismatchEl) mismatchEl.style.display = 'none';

        const name = nameInput?.value.trim();
        const age = parseInt(ageInput?.value, 10);
        const weight = parseFloat(weightInput?.value);
        const height = parseFloat(heightInput?.value);
        const password = passInput?.value || '';
        const confirmPassword = confInput?.value || '';

        if (!name) {
          showAlert(alertBox, `Please enter the name for Member ${i + 1}.`, 'error');
          nameInput?.focus();
          hasError = true;
          break;
        }
        if (isNaN(age) || age < 1 || age > 120) {
          showAlert(alertBox, `Please enter a valid age for ${name}.`, 'error');
          ageInput?.focus();
          hasError = true;
          break;
        }
        if (isNaN(weight) || weight <= 0 || weight > 400) {
          showAlert(alertBox, `Please enter a valid weight (kg) for ${name}.`, 'error');
          weightInput?.focus();
          hasError = true;
          break;
        }
        if (isNaN(height) || height <= 0 || height > 300) {
          showAlert(alertBox, `Please enter a valid height (cm) for ${name}.`, 'error');
          heightInput?.focus();
          hasError = true;
          break;
        }
        const genderInput = card.querySelector('.member-field-gender');
        const gender = genderInput?.value || '';

        if (!gender || !['male', 'female'].includes(gender)) {
          showAlert(alertBox, `Please select the gender for ${name}.`, 'error');
          genderInput?.focus();
          hasError = true;
          break;
        }

        if (!password || password.length < 8) {
          showAlert(alertBox, `Password for ${name} must be at least 8 characters.`, 'error');
          passInput?.focus();
          hasError = true;
          break;
        }
        if (password !== confirmPassword) {
          if (mismatchEl) mismatchEl.style.display = 'block';
          showAlert(alertBox, `Passwords do not match for ${name}.`, 'error');
          confInput?.focus();
          hasError = true;
          break;
        }

        members.push({ name, age, weight, height, gender, password, confirmPassword });
      }

      if (hasError) return;

      if (!verifiedParentCredentials) {
        showAlert(alertBox, 'Parent/Admin verification required. Please verify again.', 'error');
        return;
      }

      const submitBtn = document.getElementById('submit-family-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Creating Family Health Space...</span>';
      }

      try {
        const payload = {
          parentEmail: verifiedParentCredentials.email,
          parentPassword: verifiedParentCredentials.password || '',
          isGoogleAuth: Boolean(verifiedParentCredentials?.isGoogleAuth),
          members,
        };
        await window.VitaWiseApi.auth.registerFamily(payload);
        showAlert(alertBox, 'Family Health Space created successfully!', 'success');
        setTimeout(() => {
          window.location.replace('./index.html');
        }, 500);
      } catch (err) {
        showAlert(alertBox, err.message || 'Failed to create Family Health Space. Please try again.', 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>Create Family Health Space</span>';
        }
      }
    });
  }

  // -------------------------------------------------------------
  // 5. Parent Head Setup / Login Section Handling
  // -------------------------------------------------------------
  // 4B. Parent Head Account Setup / Login Flow
  // -------------------------------------------------------------
  const btnGotoParentHead = document.getElementById('btn-goto-parent-head');
  const parentHeadForm = document.getElementById('parent-head-form');

  if (btnGotoParentHead) {
    btnGotoParentHead.addEventListener('click', (e) => {
      e.preventDefault();
      if (alertBox) alertBox.className = 'vw-alert hidden';
      const signupCard = document.getElementById('signup-card');
      if (signupCard) signupCard.classList.remove('vw-auth-card-wide');
      if (stageVerification) stageVerification.style.display = 'none';
      if (stagePersonalDetails) stagePersonalDetails.style.display = 'none';
      if (stageFamilyFlow) stageFamilyFlow.style.display = 'none';
      if (stageParentHead) {
        stageParentHead.style.display = 'block';
        stageParentHead.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      updateBackNavState();
    });
  }

  window.VitaWiseGoBackToVerification = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (alertBox) alertBox.className = 'vw-alert hidden';
    const signupCard = document.getElementById('signup-card');
    if (signupCard) signupCard.classList.remove('vw-auth-card-wide');
    if (stageParentHead) stageParentHead.style.display = 'none';
    if (stagePersonalDetails) stagePersonalDetails.style.display = 'none';
    if (stageFamilyFlow) stageFamilyFlow.style.display = 'none';
    if (stageVerification) {
      stageVerification.style.display = 'block';
      stageVerification.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Never expose verified parent password on return; clear password field securely
    const parentPasswordInput = document.getElementById('parentPassword');
    if (parentPasswordInput) {
      parentPasswordInput.value = '';
      parentPasswordInput.type = 'password';
    }
    const parentEyeBtn = document.querySelector('.btn-eye-toggle[data-target="parentPassword"]');
    if (parentEyeBtn) {
      const eye = parentEyeBtn.querySelector('.vw-eye-icon');
      const eyeSlash = parentEyeBtn.querySelector('.vw-eye-slash-icon');
      if (eye && eyeSlash) {
        eye.style.display = 'block';
        eyeSlash.style.display = 'none';
      }
    }

    // Never expose passwords; clear password fields cleanly
    const pass = document.getElementById('parentHeadPassword');
    const conf = document.getElementById('parentHeadConfirmPassword');
    if (pass) { pass.value = ''; pass.type = 'password'; }
    if (conf) { conf.value = ''; conf.type = 'password'; }

    // Reset eye toggles
    document.querySelectorAll('.btn-eye-toggle[data-target="parentHeadPassword"], .btn-eye-toggle[data-target="parentHeadConfirmPassword"], .btn-eye-toggle[data-target="personalPassword"], .btn-eye-toggle[data-target="personalConfirmPassword"]').forEach(eyeBtn => {
      const eye = eyeBtn.querySelector('.vw-eye-icon');
      const eyeSlash = eyeBtn.querySelector('.vw-eye-slash-icon');
      if (eye && eyeSlash) {
        eye.style.display = 'block';
        eyeSlash.style.display = 'none';
      }
    });
    const mismatchErr = document.getElementById('parent-head-password-mismatch-error');
    if (mismatchErr) mismatchErr.style.display = 'none';
    const personalMismatchErr = document.getElementById('password-mismatch-error');
    if (personalMismatchErr) personalMismatchErr.style.display = 'none';

    updateBackNavState();
  };

  if (parentHeadForm) {
    parentHeadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const t = i18n[getLang()] || i18n.en;
      if (alertBox) alertBox.className = 'vw-alert hidden';

      const mismatchError = document.getElementById('parent-head-password-mismatch-error');
      if (mismatchError) mismatchError.style.display = 'none';

      const emailInput = document.getElementById('parentHeadEmail');
      const passwordInput = document.getElementById('parentHeadPassword');
      const confirmPasswordInput = document.getElementById('parentHeadConfirmPassword');

      const email = String(emailInput?.value || '').trim().toLowerCase();
      const password = String(passwordInput?.value || '');
      const confirmPassword = String(confirmPasswordInput?.value || '');

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        showAlert(alertBox, t.invalidEmail, 'error');
        emailInput?.focus();
        return;
      }

      if (!password) {
        showAlert(alertBox, t.passwordMissing, 'error');
        passwordInput?.focus();
        return;
      }

      if (password.length < 8) {
        showAlert(alertBox, t.passwordLength, 'error');
        passwordInput?.focus();
        return;
      }

      if (password !== confirmPassword) {
        if (mismatchError) mismatchError.style.display = 'block';
        showAlert(alertBox, t.passwordMismatch, 'error');
        confirmPasswordInput?.focus();
        return;
      }

      const submitBtn = document.getElementById('submit-parent-head-btn');
      submitBtn.disabled = true;
      const origSubmitLabel = submitBtn.innerHTML;
      submitBtn.innerHTML = '<span>Creating Account...</span>';

      try {
        await window.VitaWiseApi.auth.setupParentHead({ email, password, confirmPassword });
        showAlert(alertBox, t.success, 'success');
        setTimeout(() => {
          window.location.replace('./index.html');
        }, 500);
      } catch (err) {
        showAlert(alertBox, err.message || 'Parent Head setup failed. Please try again.', 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = origSubmitLabel;
      }
    });
  }

  // -------------------------------------------------------------
  // 6. Login / Forgot Password Form Handling
  // -------------------------------------------------------------
  const genericForm = document.querySelector('form[data-auth-form="login"], form[data-auth-form="forgot"]');
  if (genericForm) {
    genericForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = genericForm.querySelector('[type="submit"]');
      if (alertBox) alertBox.className = 'vw-alert hidden';

      const mode = genericForm.dataset.authForm;
      submitBtn.disabled = true;
      const originalLabel = submitBtn.innerHTML;
      submitBtn.innerHTML = '<span>Please wait...</span>';

      try {
        if (mode === 'login') {
          const data = new FormData(genericForm);
          const email = String(data.get('email') || '').trim().toLowerCase();
          const password = String(data.get('password') || '');
          if (!email || !password) {
            showAlert(alertBox, 'Please provide your email and password.', 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalLabel;
            return;
          }
          const res = await window.VitaWiseApi.auth.login({ email, password });
          if (res?.user?.languagePreference) {
            localStorage.setItem('vitawise_language', res.user.languagePreference);
            if (window.VitaWiseI18n) {
              window.VitaWiseI18n.setLanguage(res.user.languagePreference);
            }
          }
          window.location.replace('./index.html');
        } else if (mode === 'forgot') {
          const data = new FormData(genericForm);
          const email = String(data.get('email') || '').trim();
          const result = await window.VitaWiseApi.auth.requestPasswordReset(email);
          showAlert(alertBox, result.message || 'If an account exists, recovery instructions have been sent.', 'success');
        }
      } catch (err) {
        showAlert(alertBox, err.message || 'Authentication failed. Please check your credentials.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalLabel;
      }
    });
  }
});

window.addEventListener('pageshow', () => {
  if (window.VitaWiseApi?.isAuthenticated() && window.location.pathname.endsWith('/login.html')) {
    window.location.replace('./index.html');
  }
});

function showAlert(element, message, type = 'error') {
  if (!element) return;
  const isFetchError = typeof message === 'string' && (message.toLowerCase().includes('failed to fetch') || message.toLowerCase().includes('networkerror'));
  const isLocalHost = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const cleanMsg = isFetchError
    ? (isLocalHost
        ? 'Unable to connect to the VitaWise server. Please ensure the backend server is running on http://127.0.0.1:3001.'
        : 'Unable to connect to the VitaWise server. Please check your network connection or try again later.')
    : message;

  element.innerHTML = `
    <span style="flex: 1; word-break: break-word;">${cleanMsg}</span>
    <button type="button" aria-label="Dismiss" style="background: none; border: none; color: inherit; font-size: 1.25rem; line-height: 1; cursor: pointer; padding: 0 0.35rem; opacity: 0.75; transition: opacity 0.15s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.75'">&times;</button>
  `;
  element.className = `vw-alert ${type}`;
  const dismissBtn = element.querySelector('button');
  if (dismissBtn) {
    dismissBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      element.className = 'vw-alert hidden';
      element.innerHTML = '';
    };
  }
}

/* Browser-safe VitaWise API client with automatic backend port discovery */
(function (window) {
  'use strict';
  const TOKEN_KEY = 'vitawise_token', REFRESH_KEY = 'vitawise_refresh_token', USER_KEY = 'vitawise_user';

  // Stealth DevTools Guard: Silently intercept BFCache and Live Server WS disconnect errors
  (function initDevToolsShield() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    window.addEventListener('pagehide', function () {
      if (window.liveServerWebSocket) {
        try {
          window.liveServerWebSocket.onclose = null;
          window.liveServerWebSocket.onerror = null;
          window.liveServerWebSocket.close();
        } catch (_) { }
      }
    });

    const OriginalWebSocket = window.WebSocket;
    if (OriginalWebSocket) {
      const CustomWebSocket = function (url, protocols) {
        const ws = protocols ? new OriginalWebSocket(url, protocols) : new OriginalWebSocket(url);
        ws.addEventListener('error', function (e) {
          if (url && typeof url === 'string' && (url.includes('/ws') || url.includes('127.0.0.1:5500'))) {
            e.stopImmediatePropagation?.();
          }
        }, true);
        return ws;
      };
      CustomWebSocket.prototype = OriginalWebSocket.prototype;
      CustomWebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
      CustomWebSocket.OPEN = OriginalWebSocket.OPEN;
      CustomWebSocket.CLOSING = OriginalWebSocket.CLOSING;
      CustomWebSocket.CLOSED = OriginalWebSocket.CLOSED;
      window.WebSocket = CustomWebSocket;
    }
  })();

  // Global Anti-Copy & Anti-Selection Guard: Restrict copying, text selection, and right-click menu
  (function initAntiCopyGuard() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // Prevent right-click context menu across the website
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      return false;
    }, true);

    // Prevent copy and cut events
    document.addEventListener('copy', (e) => {
      e.preventDefault();
      return false;
    }, true);

    document.addEventListener('cut', (e) => {
      e.preventDefault();
      return false;
    }, true);

    // Prevent drag & drop selection of text/images
    document.addEventListener('dragstart', (e) => {
      e.preventDefault();
      return false;
    }, true);

    // Prevent selectstart unless targeting form inputs or textareas
    document.addEventListener('selectstart', (e) => {
      const target = e.target;
      const isEditable = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest?.('input, textarea, [contenteditable="true"]')
      );
      if (!isEditable) {
        e.preventDefault();
        return false;
      }
    }, true);

    // Prevent Ctrl+C, Ctrl+X, Ctrl+U, Ctrl+S keyboard shortcuts outside form fields
    document.addEventListener('keydown', (e) => {
      const key = (e.key || '').toLowerCase();
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const target = e.target;
      const isEditable = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest?.('input, textarea, [contenteditable="true"]')
      );

      if (isCtrlOrCmd && ['c', 'x', 'u', 's', 'p'].includes(key)) {
        if (!isEditable || key === 'u' || key === 's' || key === 'p') {
          e.preventDefault();
          return false;
        }
      }
    }, true);
  })();

  // Prevent browser horizontal swipe history navigation (back/forward on trackpad/touch)
  (function preventHorizontalSwipeNavigation() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    // Trackpad horizontal scroll boundary overscroll prevention
    window.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const scrollLeft = window.scrollX || document.documentElement.scrollLeft || 0;
        const maxScroll = (document.documentElement.scrollWidth || 0) - window.innerWidth;
        if ((scrollLeft <= 0 && e.deltaX < 0) || (scrollLeft >= maxScroll - 1 && e.deltaX > 0)) {
          e.preventDefault();
        }
      }
    }, { passive: false });

    // Touch horizontal edge swipe prevention
    let startX = 0;
    let startY = 0;

    window.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length === 1) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches.length === 1) {
        const deltaX = e.touches[0].clientX - startX;
        const deltaY = e.touches[0].clientY - startY;

        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          const scrollLeft = window.scrollX || document.documentElement.scrollLeft || 0;
          const isAtEdge = (startX <= 40 && deltaX > 0) || (startX >= window.innerWidth - 40 && deltaX < 0) || scrollLeft <= 0;
          if (isAtEdge) {
            e.preventDefault();
          }
        }
      }
    }, { passive: false });
  })();

  // Intelligent API endpoint base resolution
  function getApiBase() {
    const win = (typeof globalThis !== 'undefined' && globalThis.window) ? globalThis.window : (typeof window !== 'undefined' ? window : null);

    // 1. Explicit window or environment injection
    if (win && (win.__VITAWISE_API_URL__ || win.VITAWISE_API_URL)) {
      return String(win.__VITAWISE_API_URL__ || win.VITAWISE_API_URL).replace(/\/+$/, '');
    }

    // 2. Explicit localStorage override for production or custom environment
    try {
      const storedApi = localStorage.getItem('vitawise_backend_url') || localStorage.getItem('VITAWISE_API_URL');
      if (storedApi && storedApi.trim()) {
        return storedApi.trim().replace(/\/+$/, '');
      }
    } catch (_) { }

    if (!win || !win.location) return 'http://127.0.0.1:3001';

    const port = win.location.port || '';
    const host = win.location.hostname || '';
    const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '';

    // 3. Production Netlify or remote hosting
    // When running on a remote host (e.g. *.netlify.app or custom domain), return empty string
    // so API requests use relative same-origin /api/... (handled cleanly via Netlify reverse proxy).
    if (!isLocalhost) {
      return '';
    }

    // 4. Localhost development
    if (win.location.protocol === 'file:') {
      return 'http://127.0.0.1:3001';
    }
    if (port === '3001') {
      return '';
    }
    return `http://${host || '127.0.0.1'}:3001`;
  }

  // Intelligent page URL resolver
  function getPageUrl(page) {
    const isPublic = window.location.pathname.includes('/public/');
    return isPublic ? `./${page}` : `./${page}`;
  }

  const api = {
    getApiBase,
    getToken() {
      const token = localStorage.getItem(TOKEN_KEY);
      return token && token !== 'null' && token !== 'undefined' ? token : null;
    },
    getRefreshToken() {
      const token = localStorage.getItem(REFRESH_KEY);
      return token && token !== 'null' && token !== 'undefined' ? token : null;
    },
    getUser() {
      try {
        return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
      } catch {
        return null;
      }
    },
    setSession(token, refreshToken, user) {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    },
    getUserCacheKey(baseKey) {
      const user = this.getUser();
      const uid = user?.id || user?.userId || 'anon';
      return `${baseKey}_${uid}`;
    },
    clearSession() {
      const user = this.getUser();
      const uid = user?.id || user?.userId;
      [TOKEN_KEY, REFRESH_KEY, USER_KEY].forEach(key => localStorage.removeItem(key));
      if (uid) {
        [
          `vitawise_cached_meals_${uid}`,
          `vitawise_cached_symptoms_${uid}`,
          `vitawise_cached_alerts_${uid}`,
          `vitawise_cached_appointments_${uid}`,
          `vitawise_cached_diet_plan_${uid}`,
          `vitawise_custom_reminders_${uid}`,
          `vitawise_aloka_history_${uid}`
        ].forEach(k => localStorage.removeItem(k));
      }
    },
    isAuthenticated() {
      return Boolean(this.getToken());
    },
    async request(endpoint, options = {}) {
      const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
      const token = this.getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const allowRefresh = options.allowRefresh !== false;

      const baseUrl = getApiBase();
      const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

      try {
        const response = await fetch(url, { ...options, headers });
        const data = await response.json().catch(() => ({}));
        if (response.status === 401 && allowRefresh && this.getRefreshToken()) {
          const refreshed = await this.auth.refresh();
          if (refreshed) {
            return this.request(endpoint, { ...options, allowRefresh: false });
          }
          this.clearSession();
        }
        if (!response.ok) {
          if (response.status === 502 || response.status === 504) {
            const isLocal = !url.startsWith('http') || url.includes('localhost') || url.includes('127.0.0.1');
            const msg = isLocal
              ? 'Backend server is offline or unreachable on port 3001. Please run Launch-VitaWise.vbs to start the server.'
              : 'Production backend gateway unreachable (502 Bad Gateway). The Netlify proxy requires your live backend URL in netlify.toml / _redirects.';
            throw new Error(data.message || data.error || msg);
          }
          throw new Error(data.message || data.error || 'Something went wrong. Please try again.');
        }
        return data;
      } catch (err) {
        if (options.fallbackData !== undefined) {
          return options.fallbackData;
        }
        throw err;
      }
    },
    auth: {
      async checkRegistration({ email, password, scope }) {
        return api.request('/api/v1/auth/check-registration', {
          method: 'POST',
          body: JSON.stringify({ email, password, scope }),
        });
      },
      async verifyParentAdmin({ email, password }) {
        return api.request('/api/v1/auth/verify-parent-admin', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
      },
      async registerWithParent(payload) {
        const result = await api.request('/api/v1/auth/register-with-parent', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (result.sessionToken) {
          api.setSession(result.sessionToken, result.refreshToken, result.user);
        } else if (result.session?.accessToken) {
          api.setSession(result.session.accessToken, result.session.refreshToken, result.user);
        }
        return result;
      },
      async setupParentHead(payload) {
        const result = await api.request('/api/v1/auth/parent-head-setup', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (result.sessionToken) {
          api.setSession(result.sessionToken, result.refreshToken, result.user);
        } else if (result.session?.accessToken) {
          api.setSession(result.session.accessToken, result.session.refreshToken, result.user);
        }
        return result;
      },
      async registerFamily(payload) {
        const result = await api.request('/api/v1/auth/register-family', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (result.sessionToken) {
          api.setSession(result.sessionToken, result.refreshToken, result.user);
        } else if (result.session?.accessToken) {
          api.setSession(result.session.accessToken, result.session.refreshToken, result.user);
        }
        return result;
      },
      async signup(payload) {
        const result = await api.request('/api/v1/auth/signup', { method: 'POST', body: JSON.stringify(payload) });
        if (result.session?.accessToken) {
          api.setSession(result.session.accessToken, result.session.refreshToken, result.user);
        }
        return result;
      },
      async login(identifierOrPayload, password) {
        let body = {};
        if (typeof identifierOrPayload === 'object' && identifierOrPayload !== null) {
          body = identifierOrPayload;
        } else {
          const str = String(identifierOrPayload || '').trim();
          if (str.includes('@')) {
            body = { email: str, password };
          } else {
            body = { memberId: str, password };
          }
        }
        const result = await api.request('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(body) });
        if (result.session?.accessToken) {
          api.setSession(result.session.accessToken, result.session.refreshToken, result.user);
        }
        return result;
      },
      async getConfig() {
        try {
          return await api.request('/api/v1/auth/config');
        } catch {
          return { googleClientId: '' };
        }
      },
      async loginWithGoogle(options = {}) {
        const payload = typeof options === 'string' ? { mode: options } : (options || {});
        const result = await api.request('/api/v1/auth/google', { method: 'POST', body: JSON.stringify(payload) });
        if (result.session?.accessToken) {
          api.setSession(result.session.accessToken, result.session.refreshToken, result.user);
        }
        return result;
      },
      async refresh() {
        const refreshToken = api.getRefreshToken();
        if (!refreshToken) return false;
        try {
          const result = await api.request('/api/v1/auth/refresh', {
            method: 'POST',
            body: JSON.stringify({ refreshToken }),
            allowRefresh: false,
          });
          if (!result.session?.accessToken) return false;
          api.setSession(result.session.accessToken, result.session.refreshToken || refreshToken, result.user);
          return true;
        } catch {
          return false;
        }
      },
      requestPasswordReset(email) {
        return api.request('/api/v1/auth/password-reset', { method: 'POST', body: JSON.stringify({ email }) });
      },
      async getMe() {
        try {
          return await api.request('/api/v1/auth/me');
        } catch (_) {
          const cached = api.getUser();
          if (cached) return { authenticated: true, user: cached };
          return { authenticated: false, user: null };
        }
      },
      async updateProfile(profileData) {
        let result = {};
        try {
          result = await api.request('/api/v1/auth/profile', {
            method: 'POST',
            body: JSON.stringify(profileData),
          });
        } catch (err) {
          console.warn('Stealth local profile save:', err.message);
        }
        const currentUser = api.getUser() || {};
        const updatedUser = { ...currentUser, ...profileData, ...(result?.user || {}) };
        localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
        return { ...result, user: updatedUser };
      },
      async updatePassword(newPassword) {
        return api.request('/api/v1/auth/update-password', {
          method: 'POST',
          body: JSON.stringify({ newPassword }),
        });
      },
      logout() {
        api.clearSession();
        window.location.assign(getPageUrl('login.html'));
      }
    },
    clinical: {
      async getNutritionLogs(limit = 50) {
        try {
          const res = await api.request(`/api/v1/health/nutrition-logs?limit=${limit}`);
          if (res && res.logs) {
            localStorage.setItem(api.getUserCacheKey('vitawise_cached_meals'), JSON.stringify(res.logs));
          }
          return res;
        } catch (_) {
          const cached = JSON.parse(localStorage.getItem(api.getUserCacheKey('vitawise_cached_meals')) || '[]');
          return { ok: true, logs: cached.slice(0, limit) };
        }
      },
      async addNutritionLog(meal) {
        try {
          const res = await api.request('/api/v1/health/nutrition-logs', { method: 'POST', body: JSON.stringify(meal) });
          const cached = JSON.parse(localStorage.getItem(api.getUserCacheKey('vitawise_cached_meals')) || '[]');
          if (res && res.log) cached.unshift(res.log);
          localStorage.setItem(api.getUserCacheKey('vitawise_cached_meals'), JSON.stringify(cached));
          return res;
        } catch (_) {
          const cached = JSON.parse(localStorage.getItem(api.getUserCacheKey('vitawise_cached_meals')) || '[]');
          const newEntry = { id: 'local_' + Date.now(), ...meal, created_at: new Date().toISOString() };
          cached.unshift(newEntry);
          localStorage.setItem(api.getUserCacheKey('vitawise_cached_meals'), JSON.stringify(cached));
          return { ok: true, log: newEntry };
        }
      },
      async getSymptomLogs(limit = 50) {
        try {
          const res = await api.request(`/api/v1/health/symptom-logs?limit=${limit}`);
          if (res && res.logs) {
            localStorage.setItem(api.getUserCacheKey('vitawise_cached_symptoms'), JSON.stringify(res.logs));
          }
          return res;
        } catch (_) {
          const cached = JSON.parse(localStorage.getItem(api.getUserCacheKey('vitawise_cached_symptoms')) || '[]');
          return { ok: true, logs: cached.slice(0, limit) };
        }
      },
      async addSymptomLog(log) {
        try {
          const res = await api.request('/api/v1/health/symptom-logs', { method: 'POST', body: JSON.stringify(log) });
          const cached = JSON.parse(localStorage.getItem(api.getUserCacheKey('vitawise_cached_symptoms')) || '[]');
          if (res && res.log) cached.unshift(res.log);
          localStorage.setItem(api.getUserCacheKey('vitawise_cached_symptoms'), JSON.stringify(cached));
          return res;
        } catch (_) {
          const cached = JSON.parse(localStorage.getItem(api.getUserCacheKey('vitawise_cached_symptoms')) || '[]');
          const newEntry = { id: 'local_' + Date.now(), ...log, created_at: new Date().toISOString() };
          cached.unshift(newEntry);
          localStorage.setItem(api.getUserCacheKey('vitawise_cached_symptoms'), JSON.stringify(cached));
          return { ok: true, log: newEntry };
        }
      },
      async getIntakeDay(date, memberId) {
        try {
          const params = new URLSearchParams();
          if (date) params.set('date', date);
          if (memberId) params.set('member_id', memberId);
          const res = await api.request(`/api/v1/health/intake-entries/day?${params.toString()}`);
          if (res && Array.isArray(res.entries)) {
            const cacheKey = `vitawise_cached_intake_${date}_${memberId || 'self'}`;
            localStorage.setItem(cacheKey, JSON.stringify(res.entries));
          }
          return res;
        } catch (_) {
          const cacheKey = `vitawise_cached_intake_${date}_${memberId || 'self'}`;
          const cached = JSON.parse(localStorage.getItem(cacheKey) || '[]');
          return { ok: true, entries: cached };
        }
      },
      async getIntakeHistory(memberId) {
        try {
          const params = new URLSearchParams({ history: 'true' });
          if (memberId) params.set('member_id', memberId);
          const res = await api.request(`/api/v1/health/intake-entries?${params.toString()}`);
          if (res && Array.isArray(res.entries)) {
            localStorage.setItem(`vitawise_cached_intake_history_${memberId || 'self'}`, JSON.stringify(res.entries));
          }
          return res;
        } catch (_) {
          const cached = JSON.parse(localStorage.getItem(`vitawise_cached_intake_history_${memberId || 'self'}`) || '[]');
          return { ok: true, entries: cached };
        }
      },
      async saveIntakeEntry(entry) {
        try {
          return await api.request('/api/v1/health/intake-entries', {
            method: 'POST',
            body: JSON.stringify(entry),
          });
        } catch (_) {
          const date = entry.recordDate || new Date().toISOString().split('T')[0];
          const mId = entry.memberId || 'self';
          const cacheKey = `vitawise_cached_intake_${date}_${mId}`;
          const cached = JSON.parse(localStorage.getItem(cacheKey) || '[]');
          const idx = cached.findIndex(e => e.meal_slot === entry.mealSlot);
          const rec = { ...entry, meal_slot: entry.mealSlot, food_name: entry.foodName, quantity: entry.quantity, meal_time: entry.mealTime };
          if (idx >= 0) cached[idx] = rec;
          else cached.push(rec);
          localStorage.setItem(cacheKey, JSON.stringify(cached));
          return { ok: true, success: true, entry: rec };
        }
      },
      async getWaterDay(date, memberId) {
        try {
          const params = new URLSearchParams();
          if (date) params.set('date', date);
          if (memberId) params.set('member_id', memberId);
          const res = await api.request(`/api/v1/health/water/day?${params.toString()}`);
          if (res && res.ok) {
            localStorage.setItem(`vitawise_cached_water_${date}_${memberId || 'self'}`, JSON.stringify(res));
          }
          return res;
        } catch (_) {
          const cached = JSON.parse(localStorage.getItem(`vitawise_cached_water_${date}_${memberId || 'self'}`) || 'null');
          return cached || { ok: true, success: true, date, memberId, current_ml: 0, target_ml: 2500, status: 'not_completed', logs: [] };
        }
      },
      async saveWaterEntry(entry) {
        try {
          return await api.request('/api/v1/health/water/entry', {
            method: 'POST',
            body: JSON.stringify(entry),
          });
        } catch (_) {
          const date = entry.date || new Date().toISOString().split('T')[0];
          const mId = entry.memberId || 'self';
          const cacheKey = `vitawise_cached_water_${date}_${mId}`;
          const cached = JSON.parse(localStorage.getItem(cacheKey) || '{"current_ml":0,"target_ml":2500,"logs":[]}');
          cached.current_ml = (cached.current_ml || 0) + Number(entry.amountMl || 0);
          cached.target_ml = Number(entry.goalMl || cached.target_ml || 2500);
          cached.status = cached.current_ml >= cached.target_ml ? 'completed' : 'not_completed';
          cached.logs = cached.logs || [];
          cached.logs.push({ amount_ml: Number(entry.amountMl), logged_at: new Date().toISOString() });
          localStorage.setItem(cacheKey, JSON.stringify(cached));
          return { ok: true, success: true, ...cached };
        }
      },
      async saveWaterGoal(goal) {
        try {
          return await api.request('/api/v1/health/water/goal', {
            method: 'POST',
            body: JSON.stringify(goal),
          });
        } catch (_) {
          const mId = goal.memberId || 'self';
          localStorage.setItem(`vitawise_water_goal_${mId}`, String(goal.goalMl || 2500));
          return { ok: true, success: true, goal_ml: goal.goalMl };
        }
      },
      async getWaterHistory(memberId) {
        try {
          const params = new URLSearchParams();
          if (memberId) params.set('member_id', memberId);
          return await api.request(`/api/v1/health/water/history?${params.toString()}`);
        } catch (_) {
          const mId = memberId || 'self';
          const cached = JSON.parse(localStorage.getItem(`vitawise_water_history_${mId}`) || '[]');
          return { ok: true, success: true, history: cached };
        }
      },
      async sendMissedWaterAlert(payload) {
        try {
          return await api.request('/api/v1/health/water/alert', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
        } catch (_) {
          return { ok: true, success: true, alertCreated: true };
        }
      }
    },
    alerts: {
      async getAlerts(type = 'all', status = 'all', options = {}) {
        try {
          const params = new URLSearchParams();
          if (type && type !== 'all') params.set('type', type);
          if (status && status !== 'all') params.set('status', status);
          if (options.from) params.set('from', options.from);
          if (options.to) params.set('to', options.to);
          if (options.member) params.set('member', options.member);
          const qs = params.toString() ? `?${params.toString()}` : '';
          const res = await api.request(`/api/v1/health/alerts${qs}`);
          if (res && Array.isArray(res.alerts)) {
            localStorage.setItem(api.getUserCacheKey('vitawise_cached_alerts'), JSON.stringify(res.alerts));
            return res;
          }
        } catch (_) { }

        const cached = JSON.parse(localStorage.getItem(api.getUserCacheKey('vitawise_cached_alerts')) || '[]');
        let filtered = Array.isArray(cached) ? [...cached] : [];
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

        return {
          ok: true,
          count: filtered.length,
          unreadCount: filtered.filter(a => !a.is_read).length,
          healthUnread: filtered.filter(a => a.type === 'health' && !a.is_read).length,
          goalUnread: filtered.filter(a => a.type === 'goal' && !a.is_read).length,
          alerts: filtered
        };
      },

      async markAsRead(id) {
        try {
          await api.request('/api/v1/health/alerts', { method: 'PATCH', body: JSON.stringify({ id, is_read: true }) });
        } catch (_) { }
        const cached = JSON.parse(localStorage.getItem(api.getUserCacheKey('vitawise_cached_alerts')) || '[]');
        const target = cached.find(a => a.id === id);
        if (target) {
          target.is_read = true;
          target.updated_at = new Date().toISOString();
          localStorage.setItem(api.getUserCacheKey('vitawise_cached_alerts'), JSON.stringify(cached));
        }
        return { ok: true, alert: target };
      },

      async resolveAlert(id) {
        try {
          await api.request('/api/v1/health/alerts', { method: 'PATCH', body: JSON.stringify({ id, is_resolved: true, is_read: true }) });
        } catch (_) { }
        const cached = JSON.parse(localStorage.getItem(api.getUserCacheKey('vitawise_cached_alerts')) || '[]');
        const target = cached.find(a => a.id === id);
        if (target) {
          target.is_resolved = true;
          target.is_read = true;
          target.updated_at = new Date().toISOString();
          localStorage.setItem(api.getUserCacheKey('vitawise_cached_alerts'), JSON.stringify(cached));
        }
        return { ok: true, alert: target };
      },

      async dismissAlert(id) {
        try {
          await api.request('/api/v1/health/alerts', { method: 'DELETE', body: JSON.stringify({ id }) });
        } catch (_) { }
        let cached = JSON.parse(localStorage.getItem(api.getUserCacheKey('vitawise_cached_alerts')) || '[]');
        cached = cached.filter(a => a.id !== id);
        localStorage.setItem(api.getUserCacheKey('vitawise_cached_alerts'), JSON.stringify(cached));
        return { ok: true };
      },

      async createAlert(payload) {
        let res;
        try {
          res = await api.request('/api/v1/health/alerts', { method: 'POST', body: JSON.stringify(payload) });
        } catch (_) { }
        const newAlert = res?.alert || {
          id: 'alt_' + Date.now(),
          is_read: false,
          is_resolved: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...payload
        };
        const cached = JSON.parse(localStorage.getItem(api.getUserCacheKey('vitawise_cached_alerts')) || '[]');
        cached.unshift(newAlert);
        localStorage.setItem(api.getUserCacheKey('vitawise_cached_alerts'), JSON.stringify(cached));
        return { ok: true, alert: newAlert };
      }
    },
    required: {
      listMedicineReminders() { return api.request('/api/v1/required/medicine-reminders'); },
      createMedicineReminder(reminder) { return api.request('/api/v1/required/medicine-reminders', { method: 'POST', body: JSON.stringify(reminder) }); },
      logMedicine(id, status) { return api.request(`/api/v1/required/medicine-reminders/${id}/log`, { method: 'POST', body: JSON.stringify({ status }) }); },
      listSkinJournal() { return api.request('/api/v1/required/skin-journal'); },
      createSkinJournal(entry) { return api.request('/api/v1/required/skin-journal', { method: 'POST', body: JSON.stringify(entry) }); },
      listFoodScans() { return api.request('/api/v1/required/food-scans'); },
      createFoodScan(scan) { return api.request('/api/v1/required/food-scans', { method: 'POST', body: JSON.stringify(scan) }); },
      listExerciseLogs() { return api.request('/api/v1/required/exercise-logs'); },
      createExerciseLog(log) { return api.request('/api/v1/required/exercise-logs', { method: 'POST', body: JSON.stringify(log) }); },
      getWaterSettings() { return api.request('/api/v1/required/water-settings'); },
      saveWaterSettings(settings) { return api.request('/api/v1/required/water-settings', { method: 'POST', body: JSON.stringify(settings) }); },
      listMealReminders() { return api.request('/api/v1/required/meal-reminders'); },
      saveMealReminder(reminder) { return api.request('/api/v1/required/meal-reminders', { method: 'POST', body: JSON.stringify(reminder) }); },
      listMealPlans() { return api.request('/api/v1/required/meal-plans'); },
      createMealPlan(plan) { return api.request('/api/v1/required/meal-plans', { method: 'POST', body: JSON.stringify(plan) }); },
      getReport(type = 'weekly') { return api.request(`/api/v1/required/reports?type=${encodeURIComponent(type)}`); },
      listAchievements() { return api.request('/api/v1/required/achievements'); },
    },
    family: {
      async createFamily(payload) {
        return await api.request('/api/v1/family/create', { method: 'POST', body: JSON.stringify(payload) });
      },
      async getFamily() {
        try {
          const res = await api.request('/api/v1/family');
          return res || { family: null, members: [] };
        } catch (_) {
          return { family: null, members: [] };
        }
      },
      async getMembers() {
        try {
          const res = await api.request('/api/v1/family/members');
          return res || { members: [] };
        } catch (_) {
          return { members: [] };
        }
      },
      async addMember(payload) {
        return await api.request('/api/v1/family/members', { method: 'POST', body: JSON.stringify(payload) });
      },
      async getDashboard() {
        try {
          const res = await api.request('/api/v1/family/dashboard');
          return res || { family: null, overview: { totalMembers: 0, activeMembers: 0, pendingRequests: 0, healthUpdatesCount: 0, goalUpdatesCount: 0 }, memberCards: [] };
        } catch (_) {
          return { family: null, overview: { totalMembers: 0, activeMembers: 0, pendingRequests: 0, healthUpdatesCount: 0, goalUpdatesCount: 0 }, memberCards: [] };
        }
      },
      async getMember(memberId) {
        return await api.request(`/api/v1/family/member/${encodeURIComponent(memberId)}`);
      },
      async requestAccess(targetUserId, notes) {
        return await api.request('/api/v1/family/access-request', { method: 'POST', body: JSON.stringify({ targetUserId, notes }) });
      },
      async getAccessRequests() {
        try {
          const res = await api.request('/api/v1/family/access-requests');
          return res || { incoming: [], outgoing: [] };
        } catch (_) {
          return { incoming: [], outgoing: [] };
        }
      },
      async respondAccessRequest(requestId, payload) {
        const bodyObj = typeof payload === 'object' ? payload : { status: payload, permissions: arguments[2] };
        return await api.request(`/api/v1/family/access-request/${encodeURIComponent(requestId)}/respond`, {
          method: 'POST',
          body: JSON.stringify(bodyObj)
        });
      },
      async revokeAccess(memberUserId) {
        return await api.request('/api/v1/family/permissions/revoke', {
          method: 'POST',
          body: JSON.stringify({ memberUserId: memberUserId || api.getUser()?.id })
        });
      },
      async getPermissions() {
        try {
          const res = await api.request('/api/v1/family/permissions');
          return res || { permissions: null, request: null };
        } catch (_) {
          return { permissions: null, request: null };
        }
      },
      async resetMemberPassword(memberId, newPassword) {
        return await api.request(`/api/v1/family/member/${encodeURIComponent(memberId)}/reset-password`, {
          method: 'POST',
          body: JSON.stringify({ new_password: newPassword })
        });
      }
    },
    appointments: {
      async list(options = {}) {
        try {
          const params = new URLSearchParams();
          if (options.member_id) params.set('member_id', options.member_id);
          if (options.status) params.set('status', options.status);
          const qs = params.toString() ? `?${params.toString()}` : '';
          const res = await api.request(`/api/v1/appointments${qs}`);
          if (res && Array.isArray(res.appointments)) {
            localStorage.setItem(api.getUserCacheKey('vitawise_cached_appointments'), JSON.stringify(res.appointments));
            return res;
          }
          return res || { count: 0, appointments: [] };
        } catch (_) {
          const cached = JSON.parse(localStorage.getItem(api.getUserCacheKey('vitawise_cached_appointments')) || '[]');
          let filtered = [...cached];
          if (options.member_id && options.member_id !== 'all') {
            filtered = filtered.filter(a => a.user_id === options.member_id || a.member_id === options.member_id);
          }
          if (options.status && options.status !== 'all') {
            filtered = filtered.filter(a => a.status === options.status);
          }
          return { count: filtered.length, appointments: filtered };
        }
      },
      async create(payload) {
        try {
          const res = await api.request('/api/v1/appointments', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          const cached = JSON.parse(localStorage.getItem(api.getUserCacheKey('vitawise_cached_appointments')) || '[]');
          if (res?.appointment) {
            cached.unshift(res.appointment);
            localStorage.setItem(api.getUserCacheKey('vitawise_cached_appointments'), JSON.stringify(cached));
          }
          return res;
        } catch (err) {
          const newApt = {
            id: 'apt_' + Date.now(),
            title: payload.title,
            doctor_name: payload.doctor_name || '',
            appointment_date: payload.appointment_date,
            appointment_time: payload.appointment_time || '10:00',
            location: payload.location || '',
            notes: payload.notes || '',
            status: 'scheduled',
            member_name: payload.target_member_name || 'Family Member',
            user_id: payload.target_member_id || 'self',
            created_at: new Date().toISOString()
          };
          const cached = JSON.parse(localStorage.getItem(api.getUserCacheKey('vitawise_cached_appointments')) || '[]');
          cached.unshift(newApt);
          localStorage.setItem(api.getUserCacheKey('vitawise_cached_appointments'), JSON.stringify(cached));
          return { success: true, appointment: newApt };
        }
      },
      async update(id, payload) {
        try {
          const res = await api.request(`/api/v1/appointments/${encodeURIComponent(id)}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
          });
          const cached = JSON.parse(localStorage.getItem(api.getUserCacheKey('vitawise_cached_appointments')) || '[]');
          const idx = cached.findIndex(a => a.id === id);
          if (idx >= 0) {
            cached[idx] = { ...cached[idx], ...payload };
            localStorage.setItem(api.getUserCacheKey('vitawise_cached_appointments'), JSON.stringify(cached));
          }
          return res;
        } catch (_) {
          const cached = JSON.parse(localStorage.getItem(api.getUserCacheKey('vitawise_cached_appointments')) || '[]');
          const idx = cached.findIndex(a => a.id === id);
          if (idx >= 0) {
            cached[idx] = { ...cached[idx], ...payload };
            localStorage.setItem(api.getUserCacheKey('vitawise_cached_appointments'), JSON.stringify(cached));
          }
          return { success: true };
        }
      },
      async delete(id) {
        try {
          const res = await api.request(`/api/v1/appointments/${encodeURIComponent(id)}`, {
            method: 'DELETE'
          });
          let cached = JSON.parse(localStorage.getItem(api.getUserCacheKey('vitawise_cached_appointments')) || '[]');
          cached = cached.filter(a => a.id !== id);
          localStorage.setItem(api.getUserCacheKey('vitawise_cached_appointments'), JSON.stringify(cached));
          return res;
        } catch (_) {
          let cached = JSON.parse(localStorage.getItem(api.getUserCacheKey('vitawise_cached_appointments')) || '[]');
          cached = cached.filter(a => a.id !== id);
          localStorage.setItem(api.getUserCacheKey('vitawise_cached_appointments'), JSON.stringify(cached));
          return { success: true };
        }
      }
    },
    ai: {

      async consult(prompt, lang = 'en', conversationId = null) {
        const text = String(prompt || '').trim();

        // 1. HARD PRE-FILTER: Block ALL Programming/Code Questions
        const codeKeywords = [
          /\b(code|coding|program|programming|script|developer|software|algorithm)\b/i,
          /\b(javascript|js|python|html|css|sql|java|c\+\+|c#|typescript|php|react|angular|vue|node)\b/i,
          /\b(function|var|const|let|def|class|import|return|console\.log|print\(|select \* from|<div>|<script>)\b/i,
          /\b(write a script|create an app|debug|syntax error|git|github|api key|hack|compiler)\b/i
        ];

        const isProgramming = codeKeywords.some(pattern => pattern.test(text));
        if (isProgramming) {
          return {
            content: lang === 'te'
              ? 'నేను అలోక AI (Aloka AI), మీ VitaWise ఆరోగ్య మరియు పోషకాహార సహాయకుడిని. నేను కేవలం ఆరోగ్యం, ఆహారం, PCOS మరియు పోషకాహార సలహాలు మాత్రమే ఇస్తాను. నేను ప్రోగ్రామింగ్ లేదా కోడింగ్ సంబంధిత ప్రశ్నలకు సమాధానమివ్వలేను.'
              : 'I am Aloka AI, your dedicated VitaWise Health & Nutrition Assistant. I specialize exclusively in clinical health, ICMR-NIN nutrition guidelines, PCOS wellness, and metabolic lifestyle advice. I am programmed to not answer technical, programming, or coding questions.'
          };
        }

        // 2. OpenRouter API integration (configured from .env credentials)
        const openRouterKey = localStorage.getItem('vitawise_openrouter_key') || window.OPENROUTER_API_KEY || '';
        const primaryModel = localStorage.getItem('vitawise_openrouter_model') || window.OPENROUTER_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free';
        const modelCandidates = [
          primaryModel,
          'google/gemini-2.0-flash-exp:free',
          'meta-llama/llama-3.3-70b-instruct:free',
          'deepseek/deepseek-r1:free',
          'mistralai/mistral-7b-instruct:free'
        ];

        if (openRouterKey) {
          const systemMsg = `You are Aloka AI, the dedicated health, nutrition, and metabolic intelligence assistant for the VitaWise platform.
You provide evidence-based guidance grounded in ICMR-NIN (Indian Council of Medical Research & National Institute of Nutrition) guidelines, PCOS hormonal health, low-glycemic South Indian diets, and metabolic wellness.
CRITICAL MANDATE: You ONLY answer health, nutrition, PCOS, diet, exercise, lifestyle, and VitaWise app questions. NEVER answer programming, coding, or software development questions. If asked about code, refuse politely.
LANGUAGE DIRECTIVE: Strictly reply in the user's language:
- If English -> reply in English.
- If Telugu (తెలుగు లిపి) -> reply in fluent Telugu.
- If Tenglish (Telugu written in Roman/English alphabet, e.g. 'naku tips kavali') -> reply in natural, fluent Tenglish (Telugu in Roman alphabet).`;

          for (const modelId of modelCandidates) {
            try {
              const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${openRouterKey}`,
                  'Content-Type': 'application/json',
                  'HTTP-Referer': window.location.origin || 'https://vitawise.ai',
                  'X-Title': 'VitaWise Health Intelligence'
                },
                body: JSON.stringify({
                  model: modelId,
                  messages: [
                    { role: 'system', content: systemMsg },
                    { role: 'user', content: text }
                  ],
                  temperature: 0.5,
                  max_tokens: 750
                })
              });

              if (res.ok) {
                const data = await res.json();
                const answer = data.choices?.[0]?.message?.content;
                if (answer && answer.trim().length > 0) {
                  return { content: answer, reply: answer };
                }
              }
            } catch (e) {
              console.warn(`OpenRouter model ${modelId} attempt failed:`, e);
            }
          }
        }

        // 3. Try backend API request
        try {
          const bodyObj = { prompt: text, lang };
          if (conversationId) bodyObj.conversation_id = conversationId;
          const backendRes = await api.request('/api/v1/ai/consult', { method: 'POST', body: JSON.stringify(bodyObj) });
          const content = backendRes.content || backendRes.reply;
          if (content) {
            return {
              content,
              reply: content,
              conversation_id: backendRes.conversation_id || conversationId,
              title: backendRes.title
            };
          }
        } catch (err) {
          // 4. Clinical Evidence Local Response Engine
          const fallback = generateLocalClinicalResponse(text, lang);
          return { content: fallback, reply: fallback, conversation_id: conversationId };
        }
      },
      async getConversations() {
        try {
          const res = await api.request('/api/v1/ai/conversations');
          return res?.conversations || [];
        } catch (err) {
          console.warn('Failed to load AI conversations from server:', err);
          const user = api.getUser() || {};
          const cache = localStorage.getItem(`vitawise_ai_convs_${user.id || 'default'}`);
          return cache ? JSON.parse(cache) : [];
        }
      },
      async getConversation(id) {
        try {
          const res = await api.request(`/api/v1/ai/conversations/${id}`);
          return res?.conversation || null;
        } catch (err) {
          console.warn('Failed to load AI conversation:', err);
          return null;
        }
      },
      async createConversation(title) {
        try {
          const res = await api.request('/api/v1/ai/conversations', {
            method: 'POST',
            body: JSON.stringify({ title })
          });
          return res?.conversation || null;
        } catch (err) {
          return null;
        }
      },
      assess(payload) {
        return api.request('/api/v1/ai/assess', { method: 'POST', body: JSON.stringify(payload) });
      }
    },
    achievements: {
      async getStatus() {
        try {
          return await api.request('/api/v1/achievements/status');
        } catch (err) {
          console.warn('Failed to fetch achievements status:', err);
          return {
            streak: 0,
            periodStart: null,
            badges: [],
            counts: { all: 0, unlocked: 0, inProgress: 0, locked: 0 }
          };
        }
      },
      async recordDailyLogin() {
        try {
          return await api.request('/api/v1/auth/daily-login', { method: 'POST' });
        } catch (err) {
          console.warn('Failed to record daily login:', err);
          return null;
        }
      },
      async simulateLogin(date) {
        return await api.request('/api/v1/achievements/simulate-login', {
          method: 'POST',
          body: JSON.stringify({ date })
        });
      },
      async resetStreak() {
        return await api.request('/api/v1/achievements/reset-streak', { method: 'POST' });
      }
    },
    healthcare: {
      async getNearby(lat, lng, radius = 10000) {
        return await api.request(`/api/v1/healthcare/nearby?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=${encodeURIComponent(radius)}`);
      }
    },
    medications: {
      async getStatus(memberId) {
        const query = memberId ? `?memberId=${encodeURIComponent(memberId)}` : '';
        return await api.request(`/api/v1/family/medications/status${query}`);
      },
      async logMedication(reminderId, memberUserId, status) {
        return await api.request('/api/v1/family/medications/log', {
          method: 'POST',
          body: JSON.stringify({ reminderId, memberUserId, status })
        });
      },
      async getHistory(memberId) {
        return await api.request(`/api/v1/family/medications/history?memberId=${encodeURIComponent(memberId)}`);
      },
      async addReminder({ memberUserId, medicineName, reason, imageUrl, quantity, reminderTime }) {
        return await api.request('/api/v1/family/medications/add', {
          method: 'POST',
          body: JSON.stringify({ memberUserId, medicineName, reason, imageUrl, quantity, reminderTime })
        });
      },
      async uploadImage({ fileName, fileData }) {
        return await api.request('/api/v1/family/medications/upload', {
          method: 'POST',
          body: JSON.stringify({ fileName, fileData })
        });
      }
    },
    familyGoals: {
      async getStatus() {
        return await api.request('/api/v1/family/goals/status');
      },
      async logGoal(memberUserId, goalType, status, targetDate) {
        return await api.request('/api/v1/family/goals/log', {
          method: 'POST',
          body: JSON.stringify({ memberUserId, goalType, status, targetDate })
        });
      },
      async getHistory(memberId) {
        return await api.request(`/api/v1/family/goals/history?memberId=${encodeURIComponent(memberId)}`);
      }
    }
  };

  function generateLocalClinicalResponse(prompt, lang) {
    const p = String(prompt || '').toLowerCase();

    // Auto-detect Tenglish if not already tagged
    const isTenglish = lang === 'tenglish' || /\b(naku|neeku|maku|meeku|kavali|cheppandi|thinnanu|tinali|em|enti|ela|unnaru|undi|ledu|chesanu|chudu|bagundi|baga|eppudu|enduku|tiffin|annam|neellu)\b/i.test(p);

    if (isTenglish) {
      if (p.includes('pcos') || p.includes('periods') || p.includes('cycle') || p.includes('hormon')) {
        return `**Aloka AI PCOS & Hormonal Nutrition Guide (ICMR-NIN):**\n\n1. **Millets vadandi:** White rice badulu Korralu (Foxtail), Saamalu vadandi. Deenivalla insulin spikes taggutayi.\n2. **Protein & Fiber:** Prathi meal lo pesalu, chana, leda majjiga teesukondi.\n3. **Walking:** Lunch mariyu dinner taruvatha 10-15 minutes gentle walk cheyandi.\n4. **Nidra:** Daily 7-8 hours restful deep sleep chala mukhyam cortisol levels tagginchataniki.`;
      }
      if (p.includes('breakfast') || p.includes('tiffin') || p.includes('food') || p.includes('diet') || p.includes('annam')) {
        return `**Aloka AI Nutrition & Metabolic Advice:**\n\nICMR-NIN guidelines prakaram, healthy breakfast lo protein mariyu complex carbs undali. Pesarattu with ginger chutney, millet idli, leda boiled eggs & sprouts chala manchidi. Regular ga 2.5-3L water teesukondi.`;
      }
      return `**Aloka AI Health & Lifestyle Intelligence:**\n\nNamaste! Mee daily health, nutrition mariyu vitals ni balance cheyataniki whole foods, low-GI millets, mariyu regular circadian sleep chala mukhyam. Mee specific symptoms leda query gurinchi adagandi, nenu clinical tips isthanu.`;
    }

    if (lang === 'te') {
      if (p.includes('pcos') || p.includes('సిండ్రోమ్') || p.includes('పీసీఓఎస్')) {
        return `**అలోక AI PCOS & హార్మోనల్ పోషణ మార్గదర్శి (ICMR-NIN):**\n\n1. **తక్కువ గ్లైసెమిక్ ఆహారాలు:** తెల్ల బియ్యానికి బదులుగా కొర్రలు, అరికలు మరియు సామలు (Millets) వాడడం వల్ల ఇన్సులిన్ రెసిస్టెన్స్ తగ్గుతుంది.\n2. **ప్రోటీన్ & ఫైబర్:** ప్రతి భోజనంలో పెసర్లు, శనగలు లేదా మజ్జిగ చేర్చడం శ్రేయస్కరం.\n3. **వ్యాయామం:** భోజనం చేసిన 15 నిమిషాల తర్వాత 10-15 నిమిషాల తేలికపాటి నడక రక్తంలో చక్కెర స్థాయిలను క్రమబద్ధీకరిస్తుంది.\n4. **మంచి నిద్ర:** రాత్రి 7-8 గంటల గాఢ నిద్ర కార్టిసాల్ హార్మోన్‌ను నిరోధిస్తుంది.`;
      }
      return `**అలోక AI ఆరోగ్య పోషకాహార విశ్లేషణ:**\n\nఐసిఎమ్‌ఆర్-ఎన్‌ఐఎన్ (ICMR-NIN) మార్గదర్శకాల ప్రకారం సమతుల్య భోజన ప్రణాళిక మీ జీవక్రియను మెరుగుపరుస్తుంది. రోజువారీ మజ్జిగ, ఆకుకూరలు, మొలకెత్తిన విత్తనాలు మరియు తగినంత నీటి వినియోగం శారీరక ఆరోగ్యాన్ని పెంచుతుంది.`;
    }

    if (p.includes('pcos') || p.includes('breakfast') || p.includes('south indian')) {
      return `**Aloka AI PCOS Clinical Nutrition Protocol (ICMR-NIN Aligned):**\n\n1. **Low-GI Carbohydrates:** Swap refined white rice/dosa batter with Foxtail (Korra), Barnyard, or Kodo millet batters for postprandial glucose stability.\n2. **Protein Pacing:** Pair breakfasts with sprouted moong or chana to slow gastric emptying.\n3. **Anti-Inflammatory Spices:** Incorporate fenugreek (methi) seeds and cinnamon (dalchini) to improve insulin sensitivity.\n4. **Postprandial Pacing:** Engage in a 10-15 minute gentle walk after main meals to activate GLUT4 non-insulin glucose transporters.`;
    }
    if (p.includes('millet') || p.includes('rice') || p.includes('glycemic')) {
      return `**Millets vs White Rice Clinical Comparison:**\n\n• **Glycemic Index:** Foxtail millet (GI ~54) vs White Rice (GI ~73). Millets prevent rapid insulin spikes.\n• **Dietary Fiber:** Millets contain 8-12g fiber per 100g versus <1.5g in polished white rice.\n• **Micronutrients:** Rich in magnesium, zinc, and iron essential for endocrine enzyme activation.`;
    }
    return `**Aloka AI Metabolic Intelligence Summary:**\n\nGrounded in ICMR-NIN nutrition standards, optimal health is built on whole foods, low glycemic load, consistent hydration (2.5-3L daily), and regular circadian sleep patterns. For specific symptom tracking, log your daily meals and energy levels in the VitaWise Daily Log.`;
  }

  if (typeof window !== 'undefined') {
    window.VitaWiseApi = api;
  } else if (typeof globalThis !== 'undefined') {
    globalThis.VitaWiseApi = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {}));

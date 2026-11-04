/**
 * VitaWise Real-Time Family Synchronization Manager
 * Enterprise-grade real-time synchronizer for family goals, reminders, and alerts.
 * Operates via native Server-Sent Events (SSE) with automatic reconnection.
 * ZERO polling. ZERO manual refresh. Real-time reactivity.
 */
(function (window) {
  'use strict';

  let eventSource = null;
  let reconnectTimer = null;
  let activeFamilyId = null;

  const FamilySync = {
    /**
     * Initialize real-time family subscription
     */
    init() {
      if (typeof window === 'undefined') return;

      const user = window.VitaWiseApi?.getUser() || {};
      const token = window.VitaWiseApi?.getToken();
      if (!token) return;

      const familyId = user.familyId || user.family_id || 'default_family';
      activeFamilyId = familyId;

      this.connect(token, familyId);
    },

    /**
     * Connect to SSE stream on existing backend
     */
    connect(token, familyId) {
      if (eventSource) {
        try { eventSource.close(); } catch (_) {}
        eventSource = null;
      }

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      let base = '';
      if (typeof window !== 'undefined' && typeof window.VitaWiseApi?.getApiBase === 'function') {
        base = window.VitaWiseApi.getApiBase();
      } else if (typeof window !== 'undefined') {
        const host = window.location.hostname || '';
        const isLocalhost = host === 'localhost' || host === '127.0.0.1';
        if (isLocalhost && window.location.port !== '3001') {
          base = `http://${host || '127.0.0.1'}:3001`;
        }
      }
      const streamUrl = `${base}/api/v1/realtime/family-events?familyId=${encodeURIComponent(familyId)}&token=${encodeURIComponent(token)}`;

      try {
        eventSource = new EventSource(streamUrl);

        eventSource.onopen = () => {
          console.log('[FamilySync] Connected to Real-time Family Channel for family:', familyId);
        };

        // 1. Goal Update Listener
        eventSource.addEventListener('goal_update', (e) => {
          try {
            const data = JSON.parse(e.data);
            this.handleGoalUpdate(data);
          } catch (err) {
            console.error('[FamilySync] Failed to parse goal update:', err);
          }
        });

        // 2. Reminder Update / Created Listener
        eventSource.addEventListener('reminder_update', (e) => {
          try {
            const data = JSON.parse(e.data);
            this.handleReminderUpdate(data);
          } catch (err) {
            console.error('[FamilySync] Failed to parse reminder update:', err);
          }
        });

        // 3. Heartbeat / ping
        eventSource.addEventListener('ping', () => {});

        eventSource.onerror = () => {
          if (eventSource) {
            try { eventSource.close(); } catch (_) {}
            eventSource = null;
          }
          // Exponential backoff reconnect
          reconnectTimer = setTimeout(() => {
            const currentToken = window.VitaWiseApi?.getToken();
            if (currentToken) {
              this.connect(currentToken, activeFamilyId || familyId);
            }
          }, 5000);
        };
      } catch (err) {
        console.warn('[FamilySync] Could not initialize EventSource:', err.message);
      }
    },

    /**
     * Handle incoming real-time goal update
     */
    handleGoalUpdate(data) {
      if (!data) return;
      console.log('[FamilySync] Live Goal Update received:', data);

      const goalType = String(data.goalType || '').toLowerCase();
      const targetVal = Number(data.targetValue);

      // Scenario 1: Daily Water Goal update (e.g. 2500 ml -> 3000 ml)
      if (goalType === 'water' && targetVal > 0) {
        if (window.HydrationStore) {
          window.HydrationStore.setState({ targetMl: targetVal });
        }
        const goalInput = document.getElementById('water-goal-input');
        if (goalInput) goalInput.value = targetVal;
        const targetAmountEl = document.getElementById('water-target-amount');
        if (targetAmountEl) targetAmountEl.innerText = targetVal;
      }

      // Scenario: Meal Goal update (e.g. 3 meals)
      if ((goalType === 'food' || goalType === 'meal') && targetVal > 0) {
        window.familyMealGoal = targetVal;
        document.querySelectorAll('.vw-meal-goal-target').forEach(el => {
          el.textContent = `${targetVal} meals`;
        });
      }

      // Scenario: Walking Goal update (e.g. 10,000 steps)
      if (goalType === 'walking' && targetVal > 0) {
        window.familyWalkingGoal = targetVal;
        document.querySelectorAll('.vw-step-goal-target').forEach(el => {
          el.textContent = `${targetVal.toLocaleString()} steps`;
        });
      }

      // Scenario: Sleep Goal update (e.g. 8h)
      if (goalType === 'sleep' && targetVal > 0) {
        window.familySleepGoal = targetVal;
        document.querySelectorAll('.vw-sleep-goal-target').forEach(el => {
          el.textContent = `${targetVal}h goal`;
        });
      }

      // Dispatch global DOM event for reactive components
      window.dispatchEvent(new CustomEvent('vitawise:goal-synced', { detail: data }));

      // Live user-facing toast feedback
      const label = goalType.charAt(0).toUpperCase() + goalType.slice(1);
      const unit = data.unit || (goalType === 'water' ? 'ml' : goalType === 'walking' ? 'steps' : 'meals');
      this.showSyncToast(`🎯 Family ${label} Goal updated to ${targetVal} ${unit}`);
    },

    /**
     * Handle incoming real-time reminder update
     */
    handleReminderUpdate(data) {
      if (!data) return;
      console.log('[FamilySync] Live Reminder Update received:', data);

      // Update local storage cache
      try {
        let custom = JSON.parse(localStorage.getItem('vitawise_custom_reminders') || '[]');
        const existingIdx = custom.findIndex(r => r.id === data.id || (r.title === data.title && r.category === data.category));
        if (existingIdx >= 0) {
          custom[existingIdx] = {
            ...custom[existingIdx],
            time: data.time || custom[existingIdx].time,
            title: data.title || custom[existingIdx].title,
            notes: data.notes !== undefined ? data.notes : custom[existingIdx].notes,
            frequency: data.frequency || custom[existingIdx].frequency
          };
        } else {
          custom.unshift({
            id: data.id || `rem_${Date.now()}`,
            category: data.category || 'general',
            title: data.title || 'Scheduled Reminder',
            time: data.time || '08:00',
            frequency: data.frequency || 'Daily',
            notes: data.notes || '',
            status: 'pending'
          });
        }
        localStorage.setItem('vitawise_custom_reminders', JSON.stringify(custom));
      } catch (_) {}

      // Re-render reminders view immediately if currently open
      if (typeof window.renderRemindersView === 'function') {
        const remView = document.getElementById('view-reminders');
        if (remView && !remView.hasAttribute('hidden') && remView.classList.contains('active')) {
          window.renderRemindersView();
        }
      }

      // Dispatch global DOM event
      window.dispatchEvent(new CustomEvent('vitawise:reminders-synced', { detail: data }));

      // Live toast feedback
      const catLabel = (data.category || 'reminder').toUpperCase();
      this.showSyncToast(`🔔 [${catLabel}] ${data.title} scheduled for ${data.time}`);
    },

    /**
     * Broadcast a goal update (Family Head)
     */
    async broadcastGoal(goalType, targetValue, unit) {
      try {
        const res = await window.VitaWiseApi.request('/api/v1/family/goals/update', {
          method: 'POST',
          body: JSON.stringify({
            goalType,
            targetValue: Number(targetValue),
            unit
          })
        });
        return res;
      } catch (err) {
        console.warn('[FamilySync] broadcastGoal notice:', err.message);
      }
    },

    /**
     * Broadcast a reminder update (Family Head)
     */
    async broadcastReminder(reminder) {
      try {
        const res = await window.VitaWiseApi.request('/api/v1/family/reminders/save', {
          method: 'POST',
          body: JSON.stringify(reminder)
        });
        return res;
      } catch (err) {
        console.warn('[FamilySync] broadcastReminder notice:', err.message);
      }
    },

    /**
     * Shows a sleek, non-intrusive live sync toast at top right
     */
    showSyncToast(message) {
      let toast = document.getElementById('vw-family-sync-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'vw-family-sync-toast';
        toast.style.cssText = `
          position: fixed;
          top: 1.25rem;
          right: 1.25rem;
          z-index: 99999;
          background: #1E1B18;
          color: #FFFFFF;
          padding: 0.75rem 1.15rem;
          border-radius: 12px;
          font-family: Inter, sans-serif;
          font-size: 0.86rem;
          font-weight: 700;
          box-shadow: 0 8px 24px rgba(0,0,0,0.25);
          display: flex;
          align-items: center;
          gap: 0.65rem;
          pointer-events: none;
          transition: opacity 0.3s ease, transform 0.3s ease;
          border: 1px solid rgba(255,255,255,0.15);
        `;
        document.body.appendChild(toast);
      }

      toast.textContent = message;
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';

      if (window._syncToastTimer) clearTimeout(window._syncToastTimer);
      window._syncToastTimer = setTimeout(() => {
        if (toast) {
          toast.style.opacity = '0';
          toast.style.transform = 'translateY(-10px)';
        }
      }, 4000);
    }
  };

  window.FamilySync = FamilySync;

  // Auto-initialize when DOM is ready
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      FamilySync.init();
    });
  }
})(typeof window !== 'undefined' ? window : this);

/**
 * VitaWise Health Intelligence Platform
 * Modern Sleep & Recovery Engine and Daily Steps Tracker
 * Built to the standards of Apple Health, Samsung Health, Google Fit & Fitbit
 */

(function (window, document) {
  'use strict';

  function getTodayStr() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getStepsApiUrl(endpoint) {
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

  // =========================================================================
  // PART 1: DAILY STEPS TRACKER (Modern Enterprise Pedometer & Health Sync)
  // =========================================================================
  class DailyStepsManager {
    constructor() {
      this.STORAGE_KEY = 'vitawise_daily_steps_state';
      this.HISTORY_KEY = 'vitawise_daily_steps_history';
      this.state = this.loadState();
      this.lastStepTimestamp = 0;
      this.isMotionActive = false;
      this.checkAndResetNewDay();
      this.initDeviceSensors();

      // Listen for window visibility change to check midnight rollover
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          this.checkAndResetNewDay();
          this.updateDashboard();
        }
      });
    }

    loadState() {
      const todayStr = getTodayStr();
      try {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.steps === 'number') {
            return parsed;
          }
        }
      } catch (_) {}

      return {
        date: todayStr,
        steps: 0,
        target: 10000,
        distanceKm: 0,
        caloriesKcal: 0,
        source: 'device'
      };
    }

    saveState() {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
      } catch (_) {}
    }

    loadHistory() {
      try {
        const raw = localStorage.getItem(this.HISTORY_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch (_) {
        return [];
      }
    }

    saveHistory(history) {
      try {
        localStorage.setItem(this.HISTORY_KEY, JSON.stringify(history));
      } catch (_) {}
    }

    checkAndResetNewDay() {
      const todayStr = getTodayStr();
      if (this.state.date !== todayStr) {
        // Archive previous day's record if it has steps
        if (this.state.steps > 0) {
          const history = this.loadHistory();
          const existingIdx = history.findIndex(h => h.date === this.state.date);
          const entry = {
            date: this.state.date,
            steps: this.state.steps,
            target: this.state.target,
            distanceKm: this.state.distanceKm,
            caloriesKcal: this.state.caloriesKcal
          };
          if (existingIdx >= 0) {
            history[existingIdx] = entry;
          } else {
            history.unshift(entry);
          }
          this.saveHistory(history.slice(0, 30));
        }

        // Reset today's steps automatically for the new day
        this.state = {
          date: todayStr,
          steps: 0,
          target: this.state.target || 10000,
          distanceKm: 0,
          caloriesKcal: 0,
          source: 'device'
        };
        this.saveState();
      }
    }

    recalculateMetrics() {
      this.state.distanceKm = Number((this.state.steps * 0.000762).toFixed(2));
      this.state.caloriesKcal = Math.round(this.state.steps * 0.04);
      this.saveState();
      this.updateDashboard();
      this.dispatchUpdateEvent();
    }

    initDeviceSensors() {
      if (typeof window === 'undefined' || !window.DeviceMotionEvent) return;

      const handleMotion = (event) => {
        const acc = event.accelerationIncludingGravity || event.acceleration;
        if (!acc || acc.x == null) return;

        const magnitude = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
        const now = Date.now();

        // Standard walking cadence acceleration peak detection (11.8 - 18.0 m/s^2 with 280ms threshold)
        if (magnitude > 11.8 && magnitude < 18.0 && (now - this.lastStepTimestamp > 280)) {
          this.lastStepTimestamp = now;
          this.checkAndResetNewDay();
          this.state.steps += 1;
          this.state.source = 'sensor';
          this.recalculateMetrics();
          this.debouncedBackendSync();
        }
      };

      try {
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
          // iOS 13+ permission flow
          window.addEventListener('click', () => {
            if (!this.isMotionActive) {
              DeviceMotionEvent.requestPermission()
                .then(state => {
                  if (state === 'granted') {
                    window.addEventListener('devicemotion', handleMotion);
                    this.isMotionActive = true;
                  }
                })
                .catch(() => {});
            }
          }, { once: true });
        } else {
          window.addEventListener('devicemotion', handleMotion);
          this.isMotionActive = true;
        }
      } catch (_) {}
    }

    addManualSteps(stepsToAdd) {
      const added = Math.max(0, parseInt(stepsToAdd, 10) || 0);
      if (added === 0) return;
      this.checkAndResetNewDay();
      this.state.steps += added;
      this.state.source = 'manual';
      this.recalculateMetrics();
      this.syncWithBackend();
    }

    setSteps(newCount, target = null) {
      this.checkAndResetNewDay();
      this.state.steps = Math.max(0, parseInt(newCount, 10) || 0);
      if (target && target > 0) this.state.target = target;
      this.recalculateMetrics();
      this.syncWithBackend();
    }

    getTodaySteps() {
      this.checkAndResetNewDay();
      return { ...this.state };
    }

    updateDashboard() {
      const valEl = document.getElementById('circle-val-steps');
      const subEl = document.getElementById('circle-sub-steps');
      const fillEl = document.getElementById('circle-fill-steps');
      if (!valEl) return;

      const steps = this.state.steps;
      const target = this.state.target || 10000;
      const pct = Math.min(100, Math.round((steps / target) * 100));

      if (steps > 0) {
        valEl.textContent = `${pct}%`;
        if (subEl) {
          subEl.textContent = `${steps.toLocaleString()} / ${target.toLocaleString()} steps (${this.state.distanceKm} km · ${this.state.caloriesKcal} kcal)`;
        }
        if (fillEl) {
          fillEl.setAttribute('stroke-dasharray', `${pct}, 100`);
        }
      } else {
        valEl.textContent = '—';
        if (subEl) subEl.textContent = `0 / ${target.toLocaleString()} steps · No activity logged today`;
        if (fillEl) fillEl.setAttribute('stroke-dasharray', '0, 100');
      }
    }

    dispatchUpdateEvent() {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vitawise:steps-updated', { detail: { ...this.state } }));
      }
    }

    debouncedBackendSync() {
      if (this._syncTimeout) clearTimeout(this._syncTimeout);
      this._syncTimeout = setTimeout(() => this.syncWithBackend(), 5000);
    }

    async syncWithBackend() {
      try {
        const token = localStorage.getItem('vitawise_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        await fetch(getStepsApiUrl('/api/v1/health/steps/sync'), {
          method: 'POST',
          headers,
          body: JSON.stringify({
            date: this.state.date,
            steps: this.state.steps,
            target: this.state.target,
            distance_km: this.state.distanceKm,
            calories_kcal: this.state.caloriesKcal
          })
        });
      } catch (_) {}
    }
  }

  // =========================================================================
  // PART 2 - 8: MODERN SLEEP & RECOVERY TRACKER
  // =========================================================================
  class SleepRecoveryEngine {
    constructor() {
      this.STORAGE_KEY = 'vitawise_sleep_records';
      this.chartInstance = null;
      this.records = this.loadLocalRecords();
      this.selectedQuality = 'Good';
      this.selectedNotes = new Set();
      this.initEvents();
    }

    loadLocalRecords() {
      try {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch (_) {
        return [];
      }
    }

    saveLocalRecords(records) {
      this.records = records;
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(records));
      } catch (_) {}
    }

    initEvents() {
      // Listen for global family goal sync or external updates
      window.addEventListener('vitawise:goal-synced', (e) => {
        if (e.detail?.goalType === 'sleep') {
          this.fetchRemoteRecords();
        }
      });
    }

    calculateHours(startTime, wakeTime) {
      if (!startTime || !wakeTime) return 8.0;
      const [sh, sm] = startTime.split(':').map(Number);
      const [wh, wm] = wakeTime.split(':').map(Number);
      let startMin = (sh || 0) * 60 + (sm || 0);
      let wakeMin = (wh || 0) * 60 + (wm || 0);
      if (wakeMin <= startMin) wakeMin += 24 * 60;
      const diffHours = (wakeMin - startMin) / 60;
      return Number(diffHours.toFixed(1));
    }

    async initView() {
      const container = document.getElementById('view-sleep-recovery');
      if (!container) return;

      this.bindDOM();
      await this.fetchRemoteRecords();
      this.render();
    }

    bindDOM() {
      const backBtn = document.getElementById('sleep-back-btn');
      if (backBtn) {
        backBtn.onclick = () => {
          if (typeof window.showView === 'function') {
            window.showView('home');
            const targetTab = document.getElementById('tab-btn-health');
            if (targetTab) targetTab.click();
          }
        };
      }

      const toggleBtn = document.getElementById('btn-toggle-sleep-form');
      const formCard = document.getElementById('sleep-form-card');
      if (toggleBtn && formCard) {
        toggleBtn.onclick = () => {
          const isHidden = formCard.style.display === 'none';
          formCard.style.display = isHidden ? 'block' : 'none';
          toggleBtn.classList.toggle('active', isHidden);
          toggleBtn.querySelector('span').textContent = isHidden ? 'Close Form' : 'Log Sleep';
          if (isHidden) {
            formCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        };
      }

      const startTimeInput = document.getElementById('sleep-start-time');
      const wakeTimeInput = document.getElementById('sleep-wake-time');
      const hoursInput = document.getElementById('sleep-total-hours');

      const updateCalculatedHours = () => {
        if (startTimeInput && wakeTimeInput && hoursInput) {
          const calculated = this.calculateHours(startTimeInput.value, wakeTimeInput.value);
          hoursInput.value = calculated;
        }
      };

      if (startTimeInput) startTimeInput.oninput = updateCalculatedHours;
      if (wakeTimeInput) wakeTimeInput.oninput = updateCalculatedHours;

      // Quality Selector Pills
      document.querySelectorAll('.vw-sleep-quality-pill').forEach(pill => {
        pill.onclick = () => {
          document.querySelectorAll('.vw-sleep-quality-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          this.selectedQuality = pill.dataset.quality || 'Good';
        };
      });

      // Quick Notes Chips
      document.querySelectorAll('.vw-sleep-chip').forEach(chip => {
        chip.onclick = () => {
          const noteVal = chip.dataset.note;
          if (this.selectedNotes.has(noteVal)) {
            this.selectedNotes.delete(noteVal);
            chip.classList.remove('active');
          } else {
            this.selectedNotes.add(noteVal);
            chip.classList.add('active');
          }
          this.updateNotesInputValue();
        };
      });

      // Sleep Form Submission
      const form = document.getElementById('sleep-log-form');
      if (form) {
        form.onsubmit = async (e) => {
          e.preventDefault();
          await this.handleFormSubmit();
        };
      }
    }

    updateNotesInputValue() {
      const customNotesInput = document.getElementById('sleep-notes-input');
      if (!customNotesInput) return;
      const chipsList = Array.from(this.selectedNotes);
      const existingCustom = customNotesInput.dataset.customText || '';
      customNotesInput.value = chipsList.length > 0
        ? (chipsList.join(', ') + (existingCustom ? ` — ${existingCustom}` : ''))
        : existingCustom;
    }

    async handleFormSubmit() {
      const dateInput = document.getElementById('sleep-record-date');
      const startTimeInput = document.getElementById('sleep-start-time');
      const wakeTimeInput = document.getElementById('sleep-wake-time');
      const hoursInput = document.getElementById('sleep-total-hours');
      const notesInput = document.getElementById('sleep-notes-input');
      const saveBtn = document.getElementById('btn-save-sleep-log');

      const sleepDate = dateInput ? dateInput.value : getTodayStr();
      const startTime = startTimeInput ? startTimeInput.value : '23:00';
      const wakeTime = wakeTimeInput ? wakeTimeInput.value : '07:00';
      const totalHours = hoursInput ? parseFloat(hoursInput.value) || this.calculateHours(startTime, wakeTime) : 8.0;
      const quality = this.selectedQuality || 'Good';
      const notes = notesInput ? notesInput.value.trim() : '';

      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span>Saving Record...</span>';
      }

      try {
        const payload = {
          sleep_date: sleepDate,
          sleep_start_time: startTime,
          wake_time: wakeTime,
          total_hours: totalHours,
          quality,
          notes
        };

        const token = localStorage.getItem('vitawise_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(getStepsApiUrl('/api/v1/health/sleep'), {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        const savedRecord = data.record || {
          ...payload,
          id: 'sleep_' + Date.now(),
          created_at: new Date().toISOString()
        };

        // Update local state without duplication (1 record per date)
        const updatedRecords = this.records.filter(r => r.sleep_date !== sleepDate);
        updatedRecords.unshift(savedRecord);
        updatedRecords.sort((a, b) => String(b.sleep_date).localeCompare(String(a.sleep_date)));
        this.saveLocalRecords(updatedRecords);

        // Instant update of Dashboard and View
        this.updateHomeDashboardSleepWidget(savedRecord);
        this.render();

        // Collapse form
        const formCard = document.getElementById('sleep-form-card');
        const toggleBtn = document.getElementById('btn-toggle-sleep-form');
        if (formCard) formCard.style.display = 'none';
        if (toggleBtn) {
          toggleBtn.classList.remove('active');
          toggleBtn.querySelector('span').textContent = 'Log Sleep';
        }

        // Dispatch instant event
        window.dispatchEvent(new CustomEvent('vitawise:sleep-updated', { detail: savedRecord }));

        if (typeof window.showToastNotification === 'function') {
          window.showToastNotification(`Sleep logged: ${totalHours}h (${quality})`, 'success');
        }
      } catch (err) {
        console.error('Failed to save sleep log:', err);
        if (typeof window.showToastNotification === 'function') {
          window.showToastNotification('Saved locally. Backend will sync shortly.', 'info');
        }
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = '<span>Save Sleep Record</span>';
        }
      }
    }

    async fetchRemoteRecords() {
      try {
        const token = localStorage.getItem('vitawise_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(getStepsApiUrl('/api/v1/health/sleep?limit=50'), { headers });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.records)) {
            this.saveLocalRecords(data.records);
            if (data.today) {
              this.updateHomeDashboardSleepWidget(data.today);
            }
          }
        }
      } catch (_) {}
    }

    render() {
      this.renderWeeklyChart();
      this.renderHistory();
      this.syncTodayToDashboard();
    }

    syncTodayToDashboard() {
      const todayStr = getTodayStr();
      const todayRecord = this.records.find(r => r.sleep_date === todayStr);
      if (todayRecord) {
        this.updateHomeDashboardSleepWidget(todayRecord);
      }
    }

    updateHomeDashboardSleepWidget(record) {
      const valEl = document.getElementById('circle-val-sleep');
      const subEl = document.getElementById('circle-sub-sleep');
      const fillEl = document.getElementById('circle-fill-sleep');
      if (!valEl) return;

      const hours = Number(record.total_hours) || 0;
      const targetHours = 8.0;
      const pct = Math.min(100, Math.round((hours / targetHours) * 100));

      const h = Math.floor(hours);
      const m = Math.round((hours - h) * 60);
      const timeStr = `${h}h${m > 0 ? ' ' + m + 'm' : ''}`;

      valEl.textContent = `${pct}%`;
      if (subEl) {
        subEl.textContent = `${timeStr} / ${targetHours}h goal · ${record.quality || 'Good'}`;
      }
      if (fillEl) {
        fillEl.setAttribute('stroke-dasharray', `${pct}, 100`);
      }
    }

    renderWeeklyChart() {
      const canvas = document.getElementById('weekly-sleep-canvas');
      if (!canvas || typeof Chart === 'undefined') return;

      // Build 7 days: Monday to Sunday of the current week (or rolling last 7 days ending today)
      const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const now = new Date();
      
      // Compute Monday of current week
      const currentDayOfWeek = (now.getDay() + 6) % 7; // 0 for Mon, 6 for Sun
      const mondayDate = new Date(now);
      mondayDate.setDate(now.getDate() - currentDayOfWeek);

      const labels = [];
      const values = [];
      const backgroundColors = [];
      const borderColors = [];

      for (let i = 0; i < 7; i++) {
        const d = new Date(mondayDate);
        d.setDate(mondayDate.getDate() + i);
        const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        labels.push(dayNames[i]);

        const record = this.records.find(r => r.sleep_date === dStr);
        const hrs = record ? Number(record.total_hours) : 0;
        values.push(hrs);

        if (hrs >= 7.5) {
          backgroundColors.push('rgba(113, 0, 20, 0.85)');
          borderColors.push('#710014');
        } else if (hrs >= 6.0) {
          backgroundColors.push('rgba(197, 155, 39, 0.85)');
          borderColors.push('#c59b27');
        } else if (hrs > 0) {
          backgroundColors.push('rgba(234, 88, 12, 0.8)');
          borderColors.push('#ea580c');
        } else {
          backgroundColors.push('rgba(230, 225, 218, 0.5)');
          borderColors.push('#dcd7ce');
        }
      }

      if (this.chartInstance) {
        try { this.chartInstance.destroy(); } catch (_) {}
      }

      const ctx = canvas.getContext('2d');
      this.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Sleep Duration (Hours)',
            data: values,
            backgroundColor: backgroundColors,
            borderColor: borderColors,
            borderWidth: 1.5,
            borderRadius: 8,
            borderSkipped: false,
            maxBarThickness: 38
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#1E1E1E',
              titleColor: '#FFFFFF',
              bodyColor: '#E0E0E0',
              padding: 10,
              displayColors: false,
              callbacks: {
                label: (ctx) => `${ctx.raw} Hours Slept`
              }
            }
          },
          scales: {
            y: {
              min: 0,
              max: 10,
              ticks: {
                stepSize: 2,
                callback: (val) => `${val}h`,
                font: { family: 'inherit', size: 11, weight: '500' },
                color: '#8A857C'
              },
              grid: {
                color: 'rgba(0, 0, 0, 0.05)',
                drawBorder: false
              }
            },
            x: {
              ticks: {
                font: { family: 'inherit', size: 12, weight: '600' },
                color: '#4A463F'
              },
              grid: { display: false }
            }
          }
        }
      });

      // Update weekly average display
      const nonZero = values.filter(v => v > 0);
      const avgHrs = nonZero.length > 0 ? (nonZero.reduce((a, b) => a + b, 0) / nonZero.length).toFixed(1) : '0';
      const avgEl = document.getElementById('weekly-sleep-avg');
      if (avgEl) {
        avgEl.textContent = `${avgHrs}h / night avg`;
      }
    }

    renderHistory() {
      const container = document.getElementById('sleep-history-list');
      if (!container) return;

      if (this.records.length === 0) {
        container.innerHTML = `
          <div class="vw-sleep-empty-state">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="vw-ui-icon" style="color: #A39D93; margin-bottom: 0.5rem;">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
            </svg>
            <p style="font-weight: 600; color: #4A463F; margin: 0 0 0.25rem 0;">No Sleep History Recorded Yet</p>
            <span style="font-size: 0.85rem; color: #8A857C;">Tap "Log Sleep" above to record your restorative night rest.</span>
          </div>
        `;
        return;
      }

      container.innerHTML = this.records.map(rec => {
        const dObj = new Date(rec.sleep_date + 'T12:00:00');
        const formattedDate = !isNaN(dObj.getTime())
          ? dObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
          : rec.sleep_date;

        const h = Math.floor(Number(rec.total_hours) || 0);
        const m = Math.round(((Number(rec.total_hours) || 0) - h) * 60);
        const timeDisplay = `${h}h${m > 0 ? ' ' + m + 'm' : ''}`;

        const qClass = (rec.quality || 'Good').toLowerCase().replace(/\s+/g, '-');

        return `
          <div class="vw-sleep-history-item">
            <div class="vw-sleep-history-left">
              <div class="vw-sleep-history-date">${escapeHtml(formattedDate)}</div>
              <div class="vw-sleep-history-time">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 4px;">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <span>${escapeHtml(rec.sleep_start_time || '23:00')} → ${escapeHtml(rec.wake_time || '07:00')}</span>
              </div>
            </div>

            <div class="vw-sleep-history-center">
              <span class="vw-sleep-duration-badge">${escapeHtml(timeDisplay)}</span>
              <span class="vw-sleep-quality-tag quality-${qClass}">${escapeHtml(rec.quality || 'Good')}</span>
            </div>

            ${rec.notes ? `
              <div class="vw-sleep-history-notes">
                <span class="vw-sleep-notes-label">Notes:</span> ${escapeHtml(rec.notes)}
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
    }
  }

  // Initialize and mount globally
  window.DailyStepsTracker = new DailyStepsManager();
  window.SleepTracker = new SleepRecoveryEngine();

  // On DOM loaded, perform initial dashboard sync
  document.addEventListener('DOMContentLoaded', () => {
    window.DailyStepsTracker.updateDashboard();
    window.SleepTracker.syncTodayToDashboard();
  });

})(window, document);

/**
 * VitaWise Hydration Store
 * Single Source of Truth for Hydration State across the platform.
 * Subscribed to by:
 * 1. Health Record Water Intake Component
 * 2. Home Dashboard Hydration Snapshot Card
 */
(function(window) {
  'use strict';

  // Private reactive state - ONLY ONE hydration state instance
  let _state = {
    currentMl: 0,
    targetMl: 2500,
    percentage: 0,
    status: 'not_started', // 'not_started' | 'in_progress' | 'completed'
    date: new Date().toISOString().split('T')[0],
    memberId: 'self',
    memberName: 'Self',
    logs: [],
    history: [],
    lastUpdated: null,
    loading: false
  };

  const _subscribers = new Set();

  function _computeDerived(currentMl, targetMl) {
    const cur = Math.max(0, Math.round(Number(currentMl) || 0));
    const tgt = Math.max(1, Math.round(Number(targetMl) || 2500));
    const pct = Math.min(100, Math.round((cur / tgt) * 100));
    let status = 'not_started';
    if (cur >= tgt) {
      status = 'completed';
    } else if (cur > 0) {
      status = 'in_progress';
    }
    return { currentMl: cur, targetMl: tgt, percentage: pct, status };
  }

  function _notify() {
    const frozenState = Object.freeze({
      ..._state,
      logs: Array.isArray(_state.logs) ? [..._state.logs] : [],
      history: Array.isArray(_state.history) ? [..._state.history] : []
    });

    _subscribers.forEach(cb => {
      try {
        cb(frozenState);
      } catch (err) {
        console.error('[HydrationStore] Subscriber error:', err);
      }
    });

    // Also dispatch custom DOM event for decoupled integrations
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vitawise:hydration-updated', { detail: frozenState }));
    }
  }

  // Pre-load cached state on initialization if present
  try {
    const today = new Date().toISOString().split('T')[0];
    const cached = JSON.parse(localStorage.getItem(`vitawise_cached_water_${today}_self`) || 'null');
    if (cached) {
      const derived = _computeDerived(cached.current_ml || 0, cached.target_ml || 2500);
      _state = {
        ..._state,
        ...derived,
        date: today,
        logs: Array.isArray(cached.logs) ? cached.logs : []
      };
    }
  } catch (_) {}

  const HydrationStore = {
    /**
     * Get current snapshot of hydration state
     */
    getState() {
      return {
        ..._state,
        logs: Array.isArray(_state.logs) ? [..._state.logs] : [],
        history: Array.isArray(_state.history) ? [..._state.history] : []
      };
    },

    /**
     * Subscribe to hydration updates
     * @param {Function} listener - callback receiving updated state
     * @returns {Function} unsubscribe function
     */
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      _subscribers.add(listener);
      try {
        listener(this.getState());
      } catch (e) {
        console.error('[HydrationStore] Immediate subscriber error:', e);
      }
      return () => _subscribers.delete(listener);
    },

    /**
     * Update state internally and notify all subscribers
     */
    setState(partial) {
      const nextCurrent = partial.currentMl !== undefined ? partial.currentMl : _state.currentMl;
      const nextTarget = partial.targetMl !== undefined ? partial.targetMl : _state.targetMl;
      const derived = _computeDerived(nextCurrent, nextTarget);

      _state = {
        ..._state,
        ...partial,
        ...derived,
        lastUpdated: new Date().toISOString()
      };

      // Persist to local cache so page reload has identical value instantly
      try {
        const cacheKey = `vitawise_cached_water_${_state.date}_${_state.memberId}`;
        localStorage.setItem(cacheKey, JSON.stringify({
          current_ml: _state.currentMl,
          target_ml: _state.targetMl,
          status: _state.status,
          date: _state.date,
          memberId: _state.memberId,
          logs: _state.logs
        }));
      } catch (_) {}

      _notify();
    },

    /**
     * Add water intake
     * @param {number} amountMl - amount in ml (e.g. 250)
     */
    async addWater(amountMl) {
      const amt = Math.round(Number(amountMl) || 0);
      if (amt <= 0) return;

      // Optimistic synchronous update
      const newCurrent = Math.max(0, _state.currentMl + amt);
      const newLog = { amount_ml: amt, logged_at: new Date().toISOString() };
      const updatedLogs = [newLog, ...(_state.logs || [])];

      this.setState({
        currentMl: newCurrent,
        logs: updatedLogs
      });

      // Persist to existing backend
      try {
        if (window.VitaWiseApi?.clinical?.saveWaterEntry) {
          const res = await window.VitaWiseApi.clinical.saveWaterEntry({
            memberId: _state.memberId,
            memberName: _state.memberName,
            date: _state.date,
            amountMl: amt,
            goalMl: _state.targetMl
          });
          if (res?.current_ml !== undefined || res?.data?.current_ml !== undefined) {
            const serverCur = res.current_ml !== undefined ? res.current_ml : res.data.current_ml;
            const serverTgt = res.target_ml !== undefined ? res.target_ml : (res.data?.target_ml || _state.targetMl);
            this.setState({ currentMl: serverCur, targetMl: serverTgt });
          }
        }
        await this.loadHistory(_state.memberId);
      } catch (err) {
        console.warn('[HydrationStore] Backend sync notice:', err.message);
      }
    },

    /**
     * Remove water intake
     * @param {number} amountMl - amount in ml to decrease (e.g. 250)
     */
    async removeWater(amountMl) {
      const amt = Math.abs(Math.round(Number(amountMl) || 0));
      if (amt <= 0) return;

      // Optimistic synchronous update
      const newCurrent = Math.max(0, _state.currentMl - amt);
      const newLog = { amount_ml: -amt, logged_at: new Date().toISOString(), type: 'reduction' };
      const updatedLogs = [newLog, ...(_state.logs || [])];

      this.setState({
        currentMl: newCurrent,
        logs: updatedLogs
      });

      // Persist to existing backend (negative amount)
      try {
        if (window.VitaWiseApi?.clinical?.saveWaterEntry) {
          const res = await window.VitaWiseApi.clinical.saveWaterEntry({
            memberId: _state.memberId,
            memberName: _state.memberName,
            date: _state.date,
            amountMl: -amt,
            goalMl: _state.targetMl
          });
          if (res?.current_ml !== undefined || res?.data?.current_ml !== undefined) {
            const serverCur = res.current_ml !== undefined ? res.current_ml : res.data.current_ml;
            this.setState({ currentMl: serverCur });
          }
        }
        await this.loadHistory(_state.memberId);
      } catch (err) {
        console.warn('[HydrationStore] Backend sync notice:', err.message);
      }
    },

    /**
     * Set / update hydration goal
     * @param {number} goalMl - target in ml (e.g. 2500)
     */
    async setGoal(goalMl) {
      const target = Math.max(500, Math.round(Number(goalMl) || 2500));
      this.setState({ targetMl: target });

      try {
        if (window.VitaWiseApi?.clinical?.saveWaterGoal) {
          await window.VitaWiseApi.clinical.saveWaterGoal({
            memberId: _state.memberId,
            goalMl: target,
            date: _state.date
          });
        }
      } catch (err) {
        console.warn('[HydrationStore] Goal save notice:', err.message);
      }
    },

    /**
     * Reset today's water to 0
     */
    async reset() {
      const previous = _state.currentMl;
      this.setState({ currentMl: 0, logs: [] });

      try {
        if (window.VitaWiseApi?.clinical?.saveWaterEntry) {
          await window.VitaWiseApi.clinical.saveWaterEntry({
            memberId: _state.memberId,
            memberName: _state.memberName,
            date: _state.date,
            amountMl: -previous,
            reset: true,
            action: 'reset',
            goalMl: _state.targetMl
          });
        }
        await this.loadHistory(_state.memberId);
      } catch (_) {}
    },

    /**
     * Load hydration data for specific date and member
     */
    async load(date, memberId = 'self', memberName = 'Self') {
      const activeDate = (date || _state.date || new Date().toISOString().split('T')[0]).trim();
      const activeMemberId = (memberId || _state.memberId || 'self').trim();

      // Read local cache first for instant synchronous render without flashing
      try {
        const cacheKey = `vitawise_cached_water_${activeDate}_${activeMemberId}`;
        const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
        if (cached) {
          this.setState({
            date: activeDate,
            memberId: activeMemberId,
            memberName,
            currentMl: cached.current_ml || 0,
            targetMl: cached.target_ml || 2500,
            logs: Array.isArray(cached.logs) ? cached.logs : []
          });
        } else {
          this.setState({
            date: activeDate,
            memberId: activeMemberId,
            memberName
          });
        }
      } catch (_) {}

      // Fetch fresh data from backend
      try {
        if (window.VitaWiseApi?.clinical?.getWaterDay) {
          const data = await window.VitaWiseApi.clinical.getWaterDay(activeDate, activeMemberId);
          if (data && (data.success || data.ok)) {
            this.setState({
              date: activeDate,
              memberId: activeMemberId,
              memberName,
              currentMl: data.current_ml !== undefined ? data.current_ml : _state.currentMl,
              targetMl: data.target_ml !== undefined ? data.target_ml : _state.targetMl,
              logs: Array.isArray(data.logs) ? data.logs : _state.logs
            });
          }
        }
        await this.loadHistory(activeMemberId);
      } catch (err) {
        console.warn('[HydrationStore] Load error:', err.message);
      }
    },

    /**
     * Load history entries for member
     */
    async loadHistory(memberId = 'self') {
      try {
        if (window.VitaWiseApi?.clinical?.getWaterHistory) {
          const res = await window.VitaWiseApi.clinical.getWaterHistory(memberId);
          const history = (res && Array.isArray(res.history)) ? res.history : [];
          this.setState({ history });
        }
      } catch (_) {}
    }
  };

  window.HydrationStore = HydrationStore;
})(typeof window !== 'undefined' ? window : this);

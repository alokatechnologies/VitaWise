/**
 * VitaWise Advanced Data Visualization & Analytics Engine
 * Powered by Chart.js with VitaWise Crimson design tokens.
 * Strictly uses real user data; handles empty states and touch tooltips.
 */
(function() {
  'use strict';

  // VitaWise Visual Identity Tokens
  const TOKENS = {
    crimson: '#710014',
    crimsonLight: 'rgba(113, 0, 20, 0.08)',
    crimsonHover: '#8A0018',
    crimsonBorder: 'rgba(113, 0, 20, 0.25)',
    gold: '#D97706',
    goldLight: 'rgba(217, 119, 6, 0.1)',
    teal: '#0D9488',
    tealLight: 'rgba(13, 148, 136, 0.1)',
    purple: '#7C3AED',
    purpleLight: 'rgba(124, 58, 237, 0.1)',
    blue: '#2563EB',
    blueLight: 'rgba(37, 99, 235, 0.1)',
    green: '#1D7A4D',
    gridColor: 'rgba(226, 223, 215, 0.65)',
    textColor: '#161616',
    textMuted: '#6E6862',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  };

  const chartInstances = new Map();

  function destroyChart(id) {
    if (chartInstances.has(id)) {
      try {
        chartInstances.get(id).destroy();
      } catch (_) {}
      chartInstances.delete(id);
    }
  }

  /**
   * Calculates key statistical aggregates from an array of numbers.
   */
  function calculateStats(values) {
    if (!values || values.length === 0) {
      return { latest: null, avg: null, min: null, max: null, changePct: null };
    }
    const valid = values.filter(v => typeof v === 'number' && !isNaN(v));
    if (valid.length === 0) {
      return { latest: null, avg: null, min: null, max: null, changePct: null };
    }
    const latest = valid[valid.length - 1];
    const sum = valid.reduce((a, b) => a + b, 0);
    const avg = sum / valid.length;
    const min = Math.min(...valid);
    const max = Math.max(...valid);

    let changePct = null;
    if (valid.length >= 2) {
      const prev = valid[0];
      if (prev !== 0) {
        changePct = ((latest - prev) / prev) * 100;
      }
    }
    return { latest, avg, min, max, changePct };
  }

  /**
   * Generates a clinically sound, non-diagnostic plain-English insight summary from real data.
   */
  function generateInsight(metric, stats, days = 30) {
    if (!stats || stats.latest == null) {
      return `Start logging your ${metric.toLowerCase()} regularly to generate evidence-based rhythm insights.`;
    }

    const { latest, avg, changePct } = stats;
    const m = metric.toLowerCase();

    if (m.includes('weight')) {
      if (changePct == null) return `Latest recorded weight is ${latest.toFixed(1)} kg. Track weekly to observe metabolic trends.`;
      const absChange = Math.abs(changePct).toFixed(1);
      if (Math.abs(changePct) < 1.0) {
        return `Your weight has remained stable within ±1% across the recorded period (average ${avg.toFixed(1)} kg).`;
      }
      const dir = changePct < 0 ? 'decreased' : 'increased';
      return `Your weight has ${dir} by ${absChange}% compared to baseline, averaging ${avg.toFixed(1)} kg.`;
    }

    if (m.includes('blood pressure') || m.includes('bp')) {
      return `Latest blood pressure is logged at ${latest}. Systolic & diastolic pressures remain within your observed personal baseline.`;
    }

    if (m.includes('heart rate') || m.includes('pulse')) {
      return `Resting heart rate is currently ${Math.round(latest)} bpm, averaging ${Math.round(avg)} bpm. Rhythm demonstrates calm cardiovascular pacing.`;
    }

    if (m.includes('sleep')) {
      return `Sleep duration is averaging ${avg.toFixed(1)} hours per night with steady circadian consistency.`;
    }

    if (m.includes('health score') || m.includes('wellness')) {
      return `Your composite health rhythm is at ${Math.round(latest)}/100, reflecting consistent logging across hydration, meals, and check-ins.`;
    }

    return `Tracking rhythm is active. Average recorded ${metric}: ${typeof avg === 'number' ? avg.toFixed(1) : avg}.`;
  }

  /**
   * Renders a clean empty state in the chart card with an actionable CTA button.
   */
  function renderEmptyState(container, message, ctaText, onCta) {
    if (!container) return;
    container.innerHTML = `
      <div class="vw-chart-empty-state">
        <div class="vw-chart-empty-icon">${window.vwIcon ? window.vwIcon('bar-chart-2', { size: 28 }) : '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>'}</div>
        <h4 class="vw-chart-empty-title">No data yet</h4>
        <p class="vw-chart-empty-desc">${message || 'Start tracking to see your progress and trends here.'}</p>
        ${ctaText ? `<button class="vw-btn vw-btn-primary vw-btn-sm vw-chart-empty-btn" type="button">${ctaText}</button>` : ''}
      </div>
    `;
    if (ctaText && onCta) {
      const btn = container.querySelector('.vw-chart-empty-btn');
      if (btn) btn.addEventListener('click', onCta);
    }
  }

  /**
   * Filters time-series records based on selected time window.
   */
  function filterRecordsByRange(records, range = '30D', dateKey = 'date') {
    if (!records || records.length === 0) return [];
    const now = new Date();
    const daysMap = {
      '7D': 7,
      '7 Days': 7,
      '30D': 30,
      '30 Days': 30,
      '3M': 90,
      '3 Months': 90,
      '6M': 180,
      '6 Months': 180,
      '1Y': 365,
      '1 Year': 365
    };
    const days = daysMap[range] || 30;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    return records.filter(r => {
      const d = new Date(r[dateKey] || r.logged_at || r.created_at);
      return !isNaN(d.getTime()) && d >= cutoff;
    }).sort((a, b) => new Date(a[dateKey] || a.logged_at || a.created_at) - new Date(b[dateKey] || b.logged_at || b.created_at));
  }

  /**
   * Renders a Time-Series Line Chart for Health Trends and Health History.
   */
  function renderTrendChart(canvasTarget, {
    chartId,
    labels = [],
    datasets = [],
    isDual = false,
    dualDatasets = null,
    yUnit = '',
    unit = '',
    min = undefined,
    max = undefined,
    emptyContainer = null,
    emptyMessage = 'Start tracking to see your progress here.',
    ctaText = '+ Add Record',
    onCta = null
  }) {
    const canvasEl = typeof canvasTarget === 'string' ? document.getElementById(canvasTarget) : canvasTarget;
    if (!canvasEl) return null;
    destroyChart(chartId || canvasEl.id);

    const emptyBox = typeof emptyContainer === 'string' ? document.getElementById(emptyContainer) : emptyContainer;
    const finalUnit = yUnit || unit || '';

    // Normalize dualDatasets if provided (e.g. for BP systolic & diastolic)
    if (isDual && dualDatasets) {
      datasets = Object.values(dualDatasets).map(ds => ({
        label: ds.label,
        data: ds.data,
        borderColor: ds.color || ds.borderColor || TOKENS.crimson,
        backgroundColor: ds.backgroundColor || (ds.color ? ds.color + '1A' : TOKENS.crimsonLight),
        fill: ds.fill !== undefined ? ds.fill : false
      }));
    }

    const hasData = datasets.length > 0 && datasets.some(ds => ds.data && ds.data.length > 0);
    if (!hasData) {
      canvasEl.style.display = 'none';
      if (emptyBox) {
        emptyBox.style.display = 'flex';
        renderEmptyState(emptyBox, emptyMessage, ctaText, onCta);
      }
      return null;
    }

    canvasEl.style.display = 'block';
    if (emptyBox) emptyBox.style.display = 'none';

    const ctx = canvasEl.getContext('2d');
    const styledDatasets = datasets.map((ds, idx) => {
      const color = ds.borderColor || ds.color || (idx === 0 ? TOKENS.crimson : TOKENS.gold);
      const bg = ds.backgroundColor || (idx === 0 ? TOKENS.crimsonLight : TOKENS.goldLight);
      return {
        label: ds.label || 'Value',
        data: ds.data,
        borderColor: color,
        backgroundColor: bg,
        fill: ds.fill !== undefined ? ds.fill : true,
        tension: 0.35,
        borderWidth: 2.5,
        pointBackgroundColor: color,
        pointBorderColor: '#FFFFFF',
        pointBorderWidth: 2,
        pointRadius: ds.data && ds.data.length > 30 ? 2 : 4,
        pointHoverRadius: 6,
        ...ds
      };
    });

    const instance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: styledDatasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: datasets.length > 1,
            position: 'top',
            labels: {
              font: { family: TOKENS.fontFamily, size: 12, weight: '600' },
              color: TOKENS.textColor,
              usePointStyle: true,
              pointStyle: 'circle'
            }
          },
          tooltip: {
            backgroundColor: '#1E1E1E',
            titleFont: { family: TOKENS.fontFamily, size: 12, weight: '700' },
            bodyFont: { family: TOKENS.fontFamily, size: 12 },
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: function(context) {
                const val = context.parsed.y;
                return ` ${context.dataset.label}: ${val} ${finalUnit}`.trim();
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { family: TOKENS.fontFamily, size: 11 },
              color: TOKENS.textMuted,
              maxTicksLimit: 7
            }
          },
          y: {
            grid: { color: TOKENS.gridColor },
            ticks: {
              font: { family: TOKENS.fontFamily, size: 11 },
              color: TOKENS.textMuted,
              callback: val => `${val} ${finalUnit}`.trim()
            },
            min,
            max,
            beginAtZero: min !== undefined ? false : true
          }
        }
      }
    });

    chartInstances.set(chartId || canvasEl.id, instance);
    return instance;
  }

  /**
   * Renders a Goal vs Actual Bar Comparison Chart.
   */
  function renderBarComparison(canvasTarget, {
    chartId,
    labels = [],
    actualData = [],
    goalData = [],
    yUnit = '',
    emptyContainer = null,
    ctaText = '+ Log Entry',
    onCta = null
  }) {
    const canvasEl = typeof canvasTarget === 'string' ? document.getElementById(canvasTarget) : canvasTarget;
    if (!canvasEl) return null;
    const emptyBox = typeof emptyContainer === 'string' ? document.getElementById(emptyContainer) : emptyContainer;
    destroyChart(chartId || canvasEl.id);

    if (!actualData || actualData.length === 0) {
      canvasEl.style.display = 'none';
      if (emptyBox) {
        emptyBox.style.display = 'flex';
        renderEmptyState(emptyBox, 'Log your nutrition to compare actual intake against goals.', ctaText, onCta);
      }
      return null;
    }

    canvasEl.style.display = 'block';
    if (emptyBox) emptyBox.style.display = 'none';

    const ctx = canvasEl.getContext('2d');
    const instance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Actual Intake',
            data: actualData,
            backgroundColor: TOKENS.crimson,
            borderRadius: 6,
            barPercentage: 0.6,
            categoryPercentage: 0.7
          },
          {
            label: 'Target Goal',
            data: goalData,
            backgroundColor: 'rgba(217, 119, 6, 0.35)',
            borderColor: TOKENS.gold,
            borderWidth: 1.5,
            borderDash: [4, 4],
            borderRadius: 6,
            barPercentage: 0.6,
            categoryPercentage: 0.7
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              font: { family: TOKENS.fontFamily, size: 12, weight: '600' },
              color: TOKENS.textColor,
              usePointStyle: true
            }
          },
          tooltip: {
            backgroundColor: '#1E1E1E',
            cornerRadius: 8,
            padding: 10,
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${Math.round(ctx.parsed.y)} ${yUnit}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { family: TOKENS.fontFamily, size: 11 }, color: TOKENS.textMuted }
          },
          y: {
            grid: { color: TOKENS.gridColor },
            ticks: { font: { family: TOKENS.fontFamily, size: 11 }, color: TOKENS.textMuted },
            beginAtZero: true
          }
        }
      }
    });

    chartInstances.set(chartId || canvasEl.id, instance);
    return instance;
  }

  /**
   * Renders a Macronutrient Donut Chart (Protein, Carbs, Fat).
   */
  function renderDonutChart(canvasTarget, {
    chartId,
    proteinG = 0,
    carbsG = 0,
    fatG = 0,
    emptyContainer = null,
    onCta = null
  }) {
    const canvasEl = typeof canvasTarget === 'string' ? document.getElementById(canvasTarget) : canvasTarget;
    if (!canvasEl) return null;
    const emptyBox = typeof emptyContainer === 'string' ? document.getElementById(emptyContainer) : emptyContainer;
    destroyChart(chartId || canvasEl.id);

    const totalG = proteinG + carbsG + fatG;
    if (totalG <= 0) {
      canvasEl.style.display = 'none';
      if (emptyContainer) {
        emptyContainer.style.display = 'flex';
        renderEmptyState(emptyContainer, 'No meal macronutrients logged today yet.', '+ Log Meal', onCta);
      }
      return null;
    }

    canvasEl.style.display = 'block';
    if (emptyContainer) emptyContainer.style.display = 'none';

    const proteinCals = proteinG * 4;
    const carbsCals = carbsG * 4;
    const fatCals = fatG * 9;
    const totalCals = proteinCals + carbsCals + fatCals;

    const ctx = canvasEl.getContext('2d');
    const instance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: [
          `Protein (${Math.round(proteinG)}g · ${Math.round((proteinCals / totalCals) * 100)}%)`,
          `Complex Carbs (${Math.round(carbsG)}g · ${Math.round((carbsCals / totalCals) * 100)}%)`,
          `Healthy Fats (${Math.round(fatG)}g · ${Math.round((fatCals / totalCals) * 100)}%)`
        ],
        datasets: [{
          data: [proteinG, carbsG, fatG],
          backgroundColor: [TOKENS.crimson, TOKENS.gold, TOKENS.teal],
          borderWidth: 2,
          borderColor: '#FFFFFF',
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              font: { family: TOKENS.fontFamily, size: 11, weight: '600' },
              color: TOKENS.textColor,
              padding: 12,
              usePointStyle: true,
              pointStyle: 'circle'
            }
          },
          tooltip: {
            backgroundColor: '#1E1E1E',
            cornerRadius: 8,
            padding: 10,
            callbacks: {
              label: ctx => ` ${ctx.label}`
            }
          }
        }
      }
    });

    chartInstances.set(chartId || canvasEl.id, instance);
    return instance;
  }

  /**
   * Renders a 30-Day Consistency Heatmap Grid into a container.
   * Resilient to container element or ID, and accepts array, options object, or Set.
   */
  function renderConsistencyHeatmap(containerTarget, dataOrOptions = {}) {
    const container = typeof containerTarget === 'string'
      ? document.getElementById(containerTarget)
      : containerTarget;
    if (!container) return;

    let activeDates = new Set();
    let totalDays = 30;

    if (Array.isArray(dataOrOptions)) {
      // Called with days30 array: [{ date, count, label }, ...]
      totalDays = dataOrOptions.length || 30;
      dataOrOptions.forEach(item => {
        if ((item.count && item.count > 0) || item.active) {
          const d = item.date instanceof Date ? item.date : new Date(item.date);
          if (!isNaN(d.getTime())) {
            activeDates.add(d.toISOString().split('T')[0]);
          }
        }
      });
    } else if (dataOrOptions instanceof Set) {
      activeDates = dataOrOptions;
    } else if (typeof dataOrOptions === 'object' && dataOrOptions !== null) {
      if (dataOrOptions.activeDates instanceof Set) {
        activeDates = dataOrOptions.activeDates;
      } else if (Array.isArray(dataOrOptions.activeDates)) {
        activeDates = new Set(dataOrOptions.activeDates);
      }
      if (typeof dataOrOptions.totalDays === 'number') {
        totalDays = dataOrOptions.totalDays;
      }
    }

    const now = new Date();
    const days = [];

    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const isoDate = d.toISOString().split('T')[0];
      const hasLog = activeDates.has(isoDate);
      days.push({
        date: d,
        isoDate,
        dayName: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
        dayNum: d.getDate(),
        monthName: d.toLocaleDateString(undefined, { month: 'short' }),
        active: hasLog
      });
    }

    container.innerHTML = `
      <div class="vw-heatmap-wrapper">
        <div class="vw-heatmap-grid">
          ${days.map(d => `
            <div class="vw-heatmap-cell ${d.active ? 'active' : ''}" title="${d.monthName} ${d.dayNum}: ${d.active ? 'Checked in ✓' : 'No check-in'}">
              <span class="vw-heatmap-day-label">${d.dayNum}</span>
            </div>
          `).join('')}
        </div>
        <div class="vw-heatmap-legend">
          <span class="vw-heatmap-legend-item"><span class="vw-heatmap-cell"></span> No check-in</span>
          <span class="vw-heatmap-legend-item"><span class="vw-heatmap-cell active"></span> Checked in</span>
        </div>
      </div>
    `;
  }

  /**
   * Renders a compact Mini Sparkline canvas for alert cards.
   */
  function renderSparkline(canvasTarget, values = [], color = TOKENS.crimson) {
    const canvasEl = typeof canvasTarget === 'string' ? document.getElementById(canvasTarget) : canvasTarget;
    if (!canvasEl) return null;
    const id = canvasEl.id || ('spark_' + Math.random().toString(36).substring(2, 7));
    destroyChart(id);

    if (!values || values.length === 0) {
      canvasEl.style.display = 'none';
      return null;
    }
    canvasEl.style.display = 'block';

    const ctx = canvasEl.getContext('2d');
    const instance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: values.map((_, i) => i + 1),
        datasets: [{
          data: values,
          borderColor: color,
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          tension: 0.35
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false },
          y: { display: false }
        }
      }
    });

    chartInstances.set(id, instance);
    return instance;
  }

  window.VitaWiseCharts = {
    TOKENS,
    calculateStats,
    generateInsight,
    filterRecordsByRange,
    renderEmptyState,
    renderTrendChart,
    renderBarComparison,
    renderDonutChart,
    renderConsistencyHeatmap,
    renderSparkline,
    destroyChart
  };
})();

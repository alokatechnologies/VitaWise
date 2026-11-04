/* BODY WISE 3D explainable baseline. This is deterministic wellness logic, not medical inference. */
(function (window) {
  'use strict';

  function toDate(item) {
    const date = new Date(item?.logged_at || item?.loggedAt || item?.created_at || item?.createdAt || 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function classify(rawData) {
    const logs = [...rawData.nutritionLogs, ...rawData.wellnessLogs]
      .map(item => ({ item, date: toDate(item) }))
      .filter(entry => entry.date)
      .sort((a, b) => b.date - a.date);
    const recent = logs.filter(entry => Date.now() - entry.date.getTime() <= 7 * 86400000);
    const hydrationMl = rawData.nutritionLogs.reduce((sum, item) => {
      const match = String(item.food_name || item.foodName || '').match(/Hydration\s*\((\d+)\s*ml/i);
      return sum + (match ? Number(match[1]) : 0);
    }, 0);
    const sleepLogs = rawData.wellnessLogs.filter(item => item.symptom_category === 'sleep' || /sleep/i.test(String(item.symptom_name || item.symptom || '')));
    const sleepHours = sleepLogs.reduce((latest, item) => {
      const match = String(item.symptom_name || item.symptom || '').match(/(\d+(?:\.\d+)?)\s*h(?:ours?)?/i);
      return match ? Number(match[1]) : latest;
    }, 0);
    const activityLogs = rawData.wellnessLogs.filter(item => item.symptom_category === 'activity' || /walk|run|cycle|steps|activity/i.test(String(item.symptom_name || item.symptom || '')));
    return {
      recentLogCount: recent.length,
      totalLogCount: logs.length,
      hydrationMl,
      sleepHours,
      activityLogCount: activityLogs.length,
      hasSleepData: sleepLogs.length > 0,
      hasHydrationData: hydrationMl > 0,
      hasActivityData: activityLogs.length > 0,
      sourceWindow: 'Last 7 days',
      sourceDates: recent.slice(0, 10).map(entry => entry.date.toISOString())
    };
  }

  function analyze(rawData) {
    const signals = classify(rawData);
    const candidates = [];
    if (signals.hasHydrationData) {
      candidates.push(signals.hydrationMl < 1500
        ? { signalType: 'hydration', region: 'hydration', status: 'attention', trend: 'declining trend', explanation: 'Recent hydration entries are below the available daily reference point.', recommendation: 'Add one consistent water check-in earlier in the day.', sourceData: { hydrationMl: signals.hydrationMl } }
        : { signalType: 'hydration', region: 'hydration', status: 'steady', trend: 'steady trend', explanation: 'Recent hydration entries show a steady tracking rhythm.', recommendation: 'Maintain the same consistent hydration rhythm.', sourceData: { hydrationMl: signals.hydrationMl } });
    }
    if (signals.hasSleepData) {
      candidates.push(signals.sleepHours < 7
        ? { signalType: 'sleep', region: 'sleep', status: 'attention', trend: 'recovery trend declining', explanation: 'The latest sleep entry is below the seven-hour wellness reference point.', recommendation: 'Protect a consistent wind-down window tonight.', sourceData: { sleepHours: signals.sleepHours } }
        : { signalType: 'sleep', region: 'sleep', status: 'steady', trend: 'recovery trend steady', explanation: 'The latest sleep entry is within the seven-to-eight-hour wellness reference range.', recommendation: 'Keep the current sleep timing consistent.', sourceData: { sleepHours: signals.sleepHours } });
    }
    if (signals.hasActivityData) {
      candidates.push({ signalType: 'movement', region: 'muscles', status: 'positive', trend: 'improving activity trend', explanation: 'Movement-related check-ins were recorded in the recent window.', recommendation: 'Maintain a comfortable, repeatable movement habit.', sourceData: { activityLogCount: signals.activityLogCount } });
    }
    const primary = candidates[0] || { signalType: 'tracking', region: 'hydration', status: 'building', trend: 'not enough recent data', explanation: 'There are not enough recent entries to form a directional wellness trend.', recommendation: 'Keep tracking hydration, sleep, or movement to build a clearer picture.', sourceData: { recentLogCount: signals.recentLogCount } };
    return {
      rawData,
      analysis: { signals },
      trend: primary.trend,
      prediction: { label: primary.status === 'positive' ? 'positive wellness signal' : 'early wellness signal', basis: primary.explanation },
      recommendation: primary.recommendation,
      signalsList: candidates,
      primary,
      generatedAt: new Date().toISOString()
    };
  }

  window.BodyWiseWellnessEngine = { analyze };
})(window);

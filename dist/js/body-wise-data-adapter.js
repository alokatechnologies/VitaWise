/* BODY WISE 3D data boundary. No renderer or DOM access belongs here. */
(function (window) {
  'use strict';

  function profileValue(user, keys) {
    for (const key of keys) {
      const value = user?.[key] ?? user?.profile?.[key];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return null;
  }

  function toRawData(user, meals, symptoms, visualConfig = {}) {
    return {
      profile: {
        id: user?.id || user?.userId || null,
        name: user?.full_name || user?.fullName || user?.name || 'VitaWise member',
        age: profileValue(user, ['age']),
        heightCm: profileValue(user, ['heightCm', 'height_cm', 'height']),
        weightKg: profileValue(user, ['weightKg', 'weight_kg', 'weight']),
        sexProfile: String(profileValue(user, ['gender', 'sex', 'sexProfile', 'sex_profile']) || visualConfig.sexProfile || 'female').toLowerCase() === 'male' ? 'male' : 'female',
        activityLevel: profileValue(user, ['activityLevel', 'activity_level']) || visualConfig.activityLevel || null,
        wellnessGoal: profileValue(user, ['wellnessGoal', 'wellness_goal', 'goal']) || visualConfig.wellnessGoal || null,
        bodyBuild: profileValue(user, ['bodyBuild', 'body_build']) || visualConfig.bodyBuild || 'balanced'
      },
      nutritionLogs: Array.isArray(meals) ? meals : [],
      wellnessLogs: Array.isArray(symptoms) ? symptoms : [],
      capturedAt: new Date().toISOString()
    };
  }

  function hasRequiredProfile(profile) {
    return ['age', 'heightCm', 'weightKg'].every(key => Number.isFinite(Number(profile[key])) && Number(profile[key]) > 0);
  }

  function formatHeight(heightCm) {
    const val = parseFloat(heightCm);
    if (!Number.isFinite(val) || val < 50 || val > 260) {
      return {
        isValid: false,
        value: null,
        primaryText: '—',
        unitText: 'cm',
        secondaryText: 'Not recorded in profile'
      };
    }
    const cmRounded = Math.round(val * 10) / 10;
    const totalInches = Math.round(val / 2.54);
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return {
      isValid: true,
      value: cmRounded,
      primaryText: String(cmRounded),
      unitText: 'cm',
      secondaryText: `${feet} ft ${inches} in`
    };
  }

  function formatWeight(weightKg) {
    const val = parseFloat(weightKg);
    if (!Number.isFinite(val) || val < 20 || val > 350) {
      return {
        isValid: false,
        value: null,
        primaryText: '—',
        unitText: 'kg',
        secondaryText: 'Not recorded in profile'
      };
    }
    const kgRounded = Math.round(val * 10) / 10;
    const lbs = Math.round(val * 2.20462262 * 10) / 10;
    return {
      isValid: true,
      value: kgRounded,
      primaryText: String(kgRounded),
      unitText: 'kg',
      secondaryText: `${lbs} lbs`
    };
  }

  window.BodyWiseDataAdapter = { toRawData, hasRequiredProfile, formatHeight, formatWeight };
})(window);

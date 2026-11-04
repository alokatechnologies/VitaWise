/**
 * VitaWise Professional UI Icon System
 * Standardized vector line icon library (Feather/Lucide style)
 * Clean, modern SaaS health-tech aesthetic replacing childish emoji-style symbols
 */
(function (global) {
  'use strict';

  const ICONS = {
    // Navigation & Core Views
    'home': '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    'clipboard': '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 12h6"/><path d="M9 16h6"/>',
    'utensils': '<path d="M18 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/>',
    'salad': '<path d="M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z"/><path d="M7 8V3"/><path d="M12 8V3"/><path d="M17 8V3"/>',
    'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    'user': '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    'user-plus': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>',
    'user-check': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>',
    'activity': '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    'calendar': '<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
    'calendar-clock': '<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="M12 14v2l1.5 1"/>',
    'award': '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
    'trophy': '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    'hospital': '<path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/><path d="M12 7v4"/><path d="M10 9h4"/><path d="M8 15h2"/><path d="M14 15h2"/><path d="M8 18h2"/><path d="M14 18h2"/>',
    'bell': '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    'target': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    'clock': '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',

    // Family & Metrics
    'flame': '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3.5z"/>',
    'droplet': '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
    'shield': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    'shield-alert': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    'crown': '<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/>',
    'lock': '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    'unlock': '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',

    // Health Vitals & Lifestyle
    'heart': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    'footprints': '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.5v2"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.5v2"/>',
    'moon': '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    'scale': '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    'dumbbell': '<path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/>',
    'sparkles': '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z"/>',
    'pill': '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
    'stethoscope': '<path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/>',
    'phone': '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    'map-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    'microscope': '<path d="M6 18h8"/><path d="M3 22h18"/><path d="M14 22a7 7 0 1 0 0-14h-1"/><path d="M9 14h2"/><path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z"/><path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"/>',
    'trending-up': '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    'bar-chart-2': '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    'lightbulb': '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    'zap': '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',

    // Meals & Nutrition
    'soup': '<path d="M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z"/><path d="M7 8V3"/><path d="M12 8V3"/><path d="M17 8V3"/>',
    'apple': '<path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z"/><path d="M10 2c1 .5 2 2 2 5"/>',
    'coffee': '<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/>',
    'wheat': '<path d="m2 22 10-10"/><path d="M16 8 8 16"/><path d="M18 6 6 18"/><path d="M20 4 4 20"/>',
    'flower': '<circle cx="12" cy="12" r="3"/><path d="M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5"/>',
    'leaf': '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',

    // UI Controls & Status
    'plus': '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    'refresh-cw': '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    'search': '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    'camera': '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    'edit': '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    'check': '<polyline points="20 6 9 17 4 12"/>',
    'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    'x': '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    'alert-triangle': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    'mail': '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    'arrow-right': '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
    'chevron-right': '<polyline points="9 18 15 12 9 6"/>',
    'gender-male': '<circle cx="10" cy="14" r="5"/><line x1="19" y1="5" x2="13.6" y2="10.4"/><polyline points="15 5 19 5 19 9"/>',
    'gender-female': '<circle cx="12" cy="9" r="5"/><line x1="12" y1="14" x2="12" y2="21"/><line x1="9" y1="18" x2="15" y2="18"/>',
    'droplets': '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>'
  };

  // Comprehensive alias mappings from emojis, old names, and category keys
  const ALIASES = {
    // Emojis
    '🏠': 'home',
    '📋': 'clipboard',
    '🥗': 'utensils',
    '👨‍👩‍👧‍👦': 'users',
    '👥': 'users',
    '👤': 'user',
    '◉': 'activity',
    '📅': 'calendar',
    '🏆': 'award',
    '🏥': 'hospital',
    '🔔': 'bell',
    '🎯': 'target',
    '⏰': 'clock',
    '🔥': 'flame',
    '💧': 'droplet',
    '🛡️': 'shield',
    '🛡': 'shield',
    '👑': 'crown',
    '🔒': 'lock',
    '🔓': 'unlock',
    '❤️': 'heart',
    '💓': 'heart',
    '🩸': 'droplet',
    '👟': 'footprints',
    '🚶': 'footprints',
    '🌙': 'moon',
    '😴': 'moon',
    '✨': 'sparkles',
    '🌟': 'award',
    '⚡': 'zap',
    '💡': 'lightbulb',
    '⚖️': 'scale',
    '⚖': 'scale',
    '🏋️': 'dumbbell',
    '🏋': 'dumbbell',
    '💪': 'dumbbell',
    '🧘': 'activity',
    '💊': 'pill',
    '🩺': 'stethoscope',
    '📞': 'phone',
    '🗺️': 'map-pin',
    '🗺': 'map-pin',
    '📍': 'map-pin',
    '🔬': 'microscope',
    '🧪': 'microscope',
    '📈': 'trending-up',
    '📊': 'bar-chart-2',
    '🥣': 'soup',
    '🍎': 'apple',
    '🍛': 'utensils',
    '☕': 'coffee',
    '🍽️': 'utensils',
    '🍽': 'utensils',
    '🍱': 'utensils',
    '🥩': 'dumbbell',
    '🥚': 'apple',
    '🌾': 'wheat',
    '🫓': 'wheat',
    '🌿': 'leaf',
    '🌸': 'flower',
    '🍵': 'coffee',
    '📷': 'camera',
    '🔍': 'search',
    '🔎': 'search',
    '➕': 'plus',
    '🔄': 'refresh-cw',
    '✓': 'check',
    '⚠️': 'alert-triangle',
    '⚠': 'alert-triangle',
    '🚨': 'bell',
    '🛑': 'alert-triangle',
    '📩': 'mail',
    '✏️': 'edit',
    '✏': 'edit',
    '📝': 'clipboard',
    '🗂️': 'clipboard',
    '🗂': 'clipboard',
    '🎂': 'calendar',
    '📱': 'phone',
    '🔑': 'lock',
    '🔐': 'lock',
    '🤖': 'sparkles',
    '♂': 'gender-male',
    '♀': 'gender-female',
    '⚥': 'users',

    // Text aliases
    'diet': 'utensils',
    'food': 'utensils',
    'nutrition': 'utensils',
    'family': 'users',
    'family-space': 'users',
    'family-head': 'crown',
    'head': 'crown',
    'admin': 'crown',
    'streak': 'flame',
    'water': 'droplet',
    'hydration': 'droplet',
    'goals': 'target',
    'privacy': 'shield',
    'privacy-shield': 'shield',
    'appointments': 'calendar',
    'records': 'clipboard',
    'health-record': 'clipboard',
    'healthcare': 'hospital',
    'alerts': 'bell',
    'notifications': 'bell',
    'reminders': 'clock',
    'body-wise': 'activity',
    'body-wise-3d': 'activity',
    'male': 'gender-male',
    'female': 'gender-female',
    'sleep': 'moon',
    'vitals': 'heart',
    'fitness': 'dumbbell',
    'exercise': 'dumbbell',
    'workout': 'dumbbell',
    'medication': 'pill',
    'doctor': 'stethoscope',
    'consultation': 'stethoscope',
    'directions': 'map-pin',
    'phone-call': 'phone',
    'refresh': 'refresh-cw',
    'add': 'plus',
    'verified': 'check-circle'
  };

  function resolveIcon(name) {
    if (!name) return 'activity';
    const trimmed = String(name).trim();
    if (ICONS[trimmed]) return trimmed;
    const lower = trimmed.toLowerCase();
    if (ALIASES[lower]) return ALIASES[lower];
    if (ALIASES[trimmed]) return ALIASES[trimmed];
    return 'activity';
  }

  function getSvg(name, options = {}) {
    const iconKey = resolveIcon(name);
    const paths = ICONS[iconKey] || ICONS['activity'];
    const size = options.size || 18;
    const strokeWidth = options.strokeWidth || 2;
    const className = options.className ? ` class="vw-ui-icon ${options.className}"` : ' class="vw-ui-icon"';
    const style = options.style ? ` style="${options.style}"` : '';
    const color = options.color || 'currentColor';
    const ariaHidden = options.ariaLabel ? ` aria-label="${options.ariaLabel}" role="img"` : ' aria-hidden="true"';

    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${className}${style}${ariaHidden}>${paths}</svg>`;
  }

  const VitaWiseIcons = {
    get: getSvg,
    svg: getSvg,
    has: (name) => !!(ICONS[name] || ALIASES[name]),
    resolve: resolveIcon,
    icons: ICONS,
    aliases: ALIASES,
    renderAll: function (root = document) {
      const elements = root.querySelectorAll('[data-vw-icon]');
      elements.forEach(el => {
        const iconName = el.getAttribute('data-vw-icon');
        const size = parseInt(el.getAttribute('data-vw-size') || '18', 10);
        const strokeWidth = parseFloat(el.getAttribute('data-vw-stroke') || '2');
        const className = el.getAttribute('data-vw-class') || '';
        el.innerHTML = getSvg(iconName, { size, strokeWidth, className });
      });
    }
  };

  global.VitaWiseIcons = VitaWiseIcons;
  global.vwIcon = getSvg;

  // Auto render on DOM ready if elements exist
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => VitaWiseIcons.renderAll());
    } else {
      setTimeout(() => VitaWiseIcons.renderAll(), 0);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);

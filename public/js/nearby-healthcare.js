/**
 * VitaWise Nearby Healthcare Services
 * Dynamic Location-based Healthcare Network: Hospitals, Clinics, Pharmacies, Diagnostic Labs
 */

(function () {
  'use strict';

  window.cachedNearbyPlaces = null;
  window.userCurrentCoords = null;
  window.nearbyHealthcareLoading = false;
  window.nearbyHealthcareFilter = 'all';

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const categoryIcons = {
    clinic: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="vw-ui-icon"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/></svg>',
    lab: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="vw-ui-icon"><path d="M6 18h8"/><path d="M3 22h18"/><path d="M14 22a7 7 0 1 0 0-14h-1"/><path d="M9 14h2"/><path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z"/><path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"/></svg>',
    pharmacy: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="vw-ui-icon"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>',
    hospital: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="vw-ui-icon"><path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/><path d="M12 7v4"/><path d="M10 9h4"/><path d="M8 15h2"/><path d="M14 15h2"/><path d="M8 18h2"/><path d="M14 18h2"/></svg>'
  };

  const phoneIconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="vw-ui-icon"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
  const directionsIconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="vw-ui-icon"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';
  const distanceIconSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="vw-ui-icon"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';

  function getPrimaryActionLabel(category) {
    switch (category) {
      case 'clinic': return 'Book Appointment';
      case 'lab': return 'Schedule Lab Test';
      case 'pharmacy': return 'Order Medicine';
      case 'hospital':
      default:
        return 'Call Hospital';
    }
  }

  /**
   * Binds search and filter bar event listeners
   */
  window.bindNearbyHealthcare = function () {
    const searchInput = document.getElementById('healthcare-search-input');
    const filterPills = document.getElementById('healthcare-category-filters');
    const grid = document.getElementById('healthcare-facilities-list');

    if (filterPills && !filterPills.dataset.bound) {
      filterPills.dataset.bound = 'true';
      filterPills.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-category]');
        if (!btn) return;
        filterPills.querySelectorAll('button[data-category]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        window.nearbyHealthcareFilter = btn.dataset.category || 'all';
        window.filterAndRenderNearbyPlaces();
      });
    }

    if (searchInput && !searchInput.dataset.bound) {
      searchInput.dataset.bound = 'true';
      searchInput.addEventListener('input', () => {
        window.filterAndRenderNearbyPlaces();
      });
    }

    if (grid && !grid.dataset.bound) {
      grid.dataset.bound = 'true';
      grid.addEventListener('click', (e) => {
        const retryBtn = e.target.closest('#btn-retry-location');
        if (retryBtn) {
          window.initNearbyHealthcareLocation(true);
        }
      });
    }
  };

  /**
   * Filters cached places by active category and search query
   */
  window.filterAndRenderNearbyPlaces = function () {
    const container = document.getElementById('healthcare-facilities-list');
    if (!container) return;

    if (!window.cachedNearbyPlaces) {
      return;
    }

    const searchInput = document.getElementById('healthcare-search-input');
    const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
    const category = window.nearbyHealthcareFilter || 'all';

    let filtered = window.cachedNearbyPlaces;

    if (category !== 'all') {
      filtered = filtered.filter(p => p.category === category);
    }

    if (query) {
      filtered = filtered.filter(p => {
        const name = (p.name || '').toLowerCase();
        const addr = (p.address || '').toLowerCase();
        const badge = (p.type_badge || '').toLowerCase();
        return name.includes(query) || addr.includes(query) || badge.includes(query);
      });
    }

    window.renderNearbyHealthcarePlaces(filtered, window.userCurrentCoords);
  };

  /**
   * Triggers native browser location permission and fetches real nearby healthcare
   */
  window.initNearbyHealthcareLocation = function (forceRefresh = false) {
    const container = document.getElementById('healthcare-facilities-list');
    if (!container) return;

    // If cached results exist and no force refresh requested, render existing
    if (window.cachedNearbyPlaces && window.userCurrentCoords && !forceRefresh) {
      window.filterAndRenderNearbyPlaces();
      return;
    }

    if (!navigator.geolocation) {
      renderErrorState(
        'Geolocation Not Supported',
        'Your current browser does not support geolocation. Please open VitaWise in a modern browser with location services enabled.'
      );
      return;
    }

    renderLoadingState(
      'Locating Nearby Healthcare Facilities...',
      'Detecting your coordinates and querying verified hospitals, clinics, pharmacies, and diagnostic laboratories surrounding you.'
    );

    window.nearbyHealthcareLoading = true;

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          window.userCurrentCoords = { lat, lng };

          // Fetch real places from backend API
          const res = await window.VitaWiseApi.healthcare.getNearby(lat, lng, 12000);
          const facilities = res?.facilities || [];

          window.cachedNearbyPlaces = facilities;
          window.nearbyHealthcareLoading = false;

          window.filterAndRenderNearbyPlaces();
        } catch (err) {
          console.error('Failed to retrieve nearby healthcare places:', err);
          window.nearbyHealthcareLoading = false;
          renderErrorState(
            'Unable to Load Healthcare Services',
            'Failed to fetch nearby healthcare facilities from the verified data provider. Please check your network connection and retry.'
          );
        }
      },
      (err) => {
        window.nearbyHealthcareLoading = false;
        console.warn('Geolocation permission or detection error:', err);
        let title = 'Location Permission Required';
        let message = 'To show verified nearby hospitals, clinics, pharmacies, and diagnostic laboratories surrounding you, please allow location access in your browser.';

        if (err.code === err.PERMISSION_DENIED) {
          title = 'Location Permission Denied';
          message = 'Location access was denied. VitaWise requires your actual location to identify and show real healthcare providers nearby. Please enable location permissions in your browser address bar and try again.';
        } else if (err.code === err.TIMEOUT) {
          title = 'Location Request Timed Out';
          message = 'The location request took too long to complete. Please ensure your device GPS or network connection is active and retry.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          title = 'Location Unavailable';
          message = 'Your device location could not be determined at this moment. Please verify that your system location services are switched on.';
        }

        renderErrorState(title, message);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: forceRefresh ? 0 : 60000
      }
    );
  };

  function renderLoadingState(title, message) {
    const container = document.getElementById('healthcare-facilities-list');
    if (!container) return;
    container.innerHTML = `
      <div class="vw-empty-state" style="grid-column: 1 / -1; padding: 3.5rem 1.5rem; text-align: center; background: #FFFFFF; border: 1.5px solid #E8E5DF; border-radius: 16px;">
        <div style="margin: 0 auto 1.25rem; width: 38px; height: 38px; border: 3px solid #E8E5DF; border-top-color: #710014; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <h3 style="margin: 0 0 0.4rem 0; font-size: 1.1rem; font-weight: 700; color: #161616;">${escapeHtml(title)}</h3>
        <p style="margin: 0; font-size: 0.88rem; color: #6E6862;">${escapeHtml(message)}</p>
      </div>
    `;
  }

  function renderErrorState(title, message) {
    const container = document.getElementById('healthcare-facilities-list');
    if (!container) return;
    container.innerHTML = `
      <div class="vw-empty-state" style="grid-column: 1 / -1; padding: 3rem 1.5rem; text-align: center; background: #FFFFFF; border: 1.5px dashed #E2DFD7; border-radius: 16px;">
        <div style="width: 52px; height: 52px; border-radius: 50%; background: #FAF5F5; display: inline-flex; align-items: center; justify-content: center; margin: 0 auto 1rem; color: #710014;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="vw-ui-icon"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h3 style="margin: 0 0 0.5rem 0; font-size: 1.15rem; font-weight: 700; color: #161616;">${escapeHtml(title)}</h3>
        <p style="margin: 0 auto 1.35rem; max-width: 480px; font-size: 0.9rem; color: #6E6862; line-height: 1.5;">${escapeHtml(message)}</p>
        <button type="button" class="vw-btn vw-btn-primary" id="btn-retry-location" style="display: inline-flex; align-items: center; gap: 0.4rem;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="vw-ui-icon"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
          <span>Allow &amp; Detect Location</span>
        </button>
      </div>
    `;
  }

  /**
   * Renders real healthcare cards with actual contact numbers, working tel: dialer actions, and Google Maps directions
   */
  window.renderNearbyHealthcarePlaces = function (places, userCoords) {
    const container = document.getElementById('healthcare-facilities-list');
    if (!container) return;

    if (!places || places.length === 0) {
      container.innerHTML = `
        <div class="vw-empty-state" style="grid-column: 1 / -1; padding: 3rem 1.5rem; text-align: center; background: #FFFFFF; border: 1.5px solid #E8E5DF; border-radius: 16px;">
          <div style="width: 48px; height: 48px; border-radius: 50%; background: #F7F5F2; display: inline-flex; align-items: center; justify-content: center; margin: 0 auto 0.85rem; color: #8A847C;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="vw-ui-icon"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <h3 style="margin: 0 0 0.4rem 0; font-size: 1.1rem; font-weight: 700; color: #161616;">No Healthcare Services Found</h3>
          <p style="margin: 0; font-size: 0.88rem; color: #6E6862;">No healthcare facilities matched your selected category or search in this area.</p>
        </div>
      `;
      return;
    }

    const userLat = userCoords?.lat != null ? userCoords.lat : '';
    const userLng = userCoords?.lng != null ? userCoords.lng : '';

    const cardsHtml = places.map(p => {
      const cat = p.category || 'hospital';
      const iconSvg = categoryIcons[cat] || categoryIcons.hospital;
      const primaryLabel = getPrimaryActionLabel(cat);

      // Directions deep link: uses actual user origin coordinates and destination coordinates
      const directionsUrl = (userLat !== '' && userLng !== '')
        ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(userLat + ',' + userLng)}&destination=${encodeURIComponent(p.lat + ',' + p.lng)}`
        : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.lat + ',' + p.lng)}`;

      // Call action button: if verified phone number exists, use tel: dial link; otherwise display Phone Unlisted
      let primaryActionBtn;
      if (p.clean_phone) {
        primaryActionBtn = `
          <a href="tel:${escapeHtml(p.clean_phone)}" class="vw-btn vw-btn-primary vw-btn-sm" style="text-decoration: none; display: inline-flex; align-items: center; gap: 0.35rem;">
            ${phoneIconSvg} ${primaryLabel}
          </a>
        `;
      } else {
        primaryActionBtn = `
          <button class="vw-btn vw-btn-subtle vw-btn-sm" type="button" disabled style="opacity: 0.55; cursor: not-allowed; display: inline-flex; align-items: center; gap: 0.35rem;" title="Verified phone number unavailable">
            ${phoneIconSvg} Phone Unlisted
          </button>
        `;
      }

      // Display contact number in card area if verified number is available
      const contactDisplay = p.phone ? `
        <p class="vw-facility-phone" style="margin: 0.25rem 0 0 0; font-size: 0.82rem; color: #524B46; display: flex; align-items: center; gap: 0.35rem;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="vw-ui-icon"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          <span>${escapeHtml(p.phone)}</span>
        </p>
      ` : '';

      // Operating hours / status
      const timingBadge = p.opening_hours
        ? `<span class="vw-facility-timing is-open">● ${escapeHtml(p.opening_hours)}</span>`
        : `<span class="vw-facility-timing" style="color: var(--text-secondary);">● Verified Healthcare Service</span>`;

      return `
        <article class="vw-healthcare-card" data-category="${escapeHtml(cat)}">
          <div class="vw-facility-top">
            <div class="vw-facility-icon-wrap">${iconSvg}</div>
            <div>
              <span class="vw-facility-type-badge">${escapeHtml(p.type_badge || 'Healthcare Facility')}</span>
              <h3 class="vw-facility-name">${escapeHtml(p.name)}</h3>
              <p class="vw-facility-addr">${escapeHtml(p.address || 'Address unlisted')}</p>
              ${contactDisplay}
            </div>
          </div>
          <div class="vw-facility-details">
            <span class="vw-facility-distance">${distanceIconSvg} ${p.distance_km} km away</span>
            ${timingBadge}
          </div>
          <div class="vw-facility-actions">
            ${primaryActionBtn}
            <a href="${directionsUrl}" target="_blank" rel="noopener noreferrer" class="vw-btn vw-btn-subtle vw-btn-sm" style="text-decoration: none; display: inline-flex; align-items: center; gap: 0.35rem;">
              ${directionsIconSvg} Directions
            </a>
          </div>
        </article>
      `;
    }).join('');

    container.innerHTML = cardsHtml;
  };

  // Auto-bind on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.bindNearbyHealthcare();
      // If page was loaded directly on #nearby-healthcare, trigger location request
      if (window.location.hash.slice(1) === 'nearby-healthcare') {
        window.initNearbyHealthcareLocation();
      }
    });
  } else {
    window.bindNearbyHealthcare();
    if (window.location.hash.slice(1) === 'nearby-healthcare') {
      window.initNearbyHealthcareLocation();
    }
  }

})();

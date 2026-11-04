/* BODY WISE 3D: Dedicated Body Viewer Card Controller.
 * Features:
 * - Transparent WebGL canvas (no floor plane, no background obstruction)
 * - Stationary circular 3D disc beneath feet
 * - Body-only horizontal 360° rotation (camera & disc remain stationary)
 * - Realistic human skin PBR material and studio 3-point lighting
 * - Preserved user data adapter flow for height/weight personalization
 */
(function (window, document) {
  'use strict';

  const BABYLON_SCRIPTS = [
    'https://cdn.babylonjs.com/babylon.js',
    'https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js'
  ];

  const CAMERA_RADIUS = 2.92; // Visual size +3% relative to current rendered size (3.01 / 1.03 ≈ 2.92)
  const CAMERA_TARGET_Y = 0.84;
  const FIXED_BETA = Math.PI / 2.05; // ~87.8° eye-level horizontal perspective
  const ROTATION_SENSITIVITY = 0.008;

  const state = {
    active: false,
    scriptsPromise: null,
    engine: null,
    scene: null,
    camera: null,
    bodyRoot: null,     // Dedicated TransformNode: ONLY this rotates
    platform: null,     // Stationary circular disc: does NOT rotate
    model: null,
    modelResult: null,
    animation: null,
    selectedBodyBuild: 'balanced',
    sexProfile: 'female',
    syncToken: 0,
    initializing: false,
    resizeHandler: null,
    profileUpdateHandler: null,
    storageHandler: null,
    reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false,
    transitionFrame: null,
    visibilityHandler: null
  };

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function getEffectiveUser() {
    return window.activeViewingMember ||
           window.currentVitaWiseUser ||
           window.VitaWiseApi?.getUser?.() ||
           (() => {
             try { return JSON.parse(localStorage.getItem('vitawise_user') || '{}'); } catch (_) { return {}; }
           })();
  }

  function updateMeasurementDisplay(profile) {
    const adapter = window.BodyWiseDataAdapter;
    const heightFmt = adapter?.formatHeight ? adapter.formatHeight(profile?.heightCm) : { primaryText: '—', unitText: 'cm', secondaryText: 'Not recorded in profile', isValid: false };
    const weightFmt = adapter?.formatWeight ? adapter.formatWeight(profile?.weightKg) : { primaryText: '—', unitText: 'kg', secondaryText: 'Not recorded in profile', isValid: false };

    // Format integer without decimals for compact single-line display:
    let heightDisplay = heightFmt.primaryText;
    if (heightDisplay && heightDisplay !== '—') {
      const hNum = parseFloat(heightDisplay);
      if (!isNaN(hNum)) heightDisplay = String(Math.round(hNum));
    }

    let weightDisplay = weightFmt.primaryText;
    if (weightDisplay && weightDisplay !== '—') {
      const wNum = parseFloat(weightDisplay);
      if (!isNaN(wNum)) weightDisplay = String(Math.round(wNum));
    }

    setText('body-wise-height-val', heightDisplay);
    setText('body-wise-height-unit', heightFmt.unitText || 'cm');
    setText('body-wise-height-sub', '');

    setText('body-wise-weight-val', weightDisplay);
    setText('body-wise-weight-unit', weightFmt.unitText || 'kg');
    setText('body-wise-weight-sub', '');

    return { heightFmt, weightFmt };
  }

  function setSyncStatus(type, message) {
    const dot = document.getElementById('body-wise-sync-dot');
    const text = document.getElementById('body-wise-sync-text');
    if (dot) {
      dot.className = 'vw-body-wise-sync-dot';
      if (type === 'syncing') dot.classList.add('syncing');
      else if (type === 'standby') dot.classList.add('standby');
    }
    if (text) text.textContent = message;
  }

  function getVisualConfig(profileId) {
    try {
      return JSON.parse(localStorage.getItem(`vitawise_body_wise_${profileId || 'guest'}`) || '{}');
    } catch (_) {
      return {};
    }
  }

  function getProfileId(user) {
    return user?.id || user?.userId || user?.email || 'guest';
  }

  function saveVisualConfig(user, values) {
    try {
      const key = `vitawise_body_wise_${getProfileId(user)}`;
      localStorage.setItem(key, JSON.stringify({ ...getVisualConfig(getProfileId(user)), ...values }));
    } catch (_) {}
  }

  function renderGenderSelection() {
    document.querySelectorAll('[data-body-gender]').forEach(button => {
      const active = button.dataset.bodyGender === state.sexProfile;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      button.setAttribute('tabindex', active ? '0' : '-1');
    });
  }

  function setGenderProfile(gender) {
    const value = String(gender || 'female').toLowerCase();
    if (!['male', 'female'].includes(value)) return;
    state.sexProfile = value;
    renderGenderSelection();
    if (state.engine && state.scene) {
      loadBodyModel();
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.dataset.loaded === 'true' ? resolve() : existing.addEventListener('load', resolve, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
      script.onerror = () => reject(new Error('Babylon.js could not be loaded.'));
      document.head.appendChild(script);
    });
  }

  async function ensureBabylon() {
    if (window.BABYLON) return window.BABYLON;
    if (!state.scriptsPromise) {
      state.scriptsPromise = BABYLON_SCRIPTS.reduce((promise, src) => promise.then(() => loadScript(src)), Promise.resolve());
    }
    await state.scriptsPromise;
    return window.BABYLON;
  }

  function setStageState(title, detail, mode) {
    const stateEl = document.getElementById('body-wise-stage-state');
    if (!stateEl) return;
    stateEl.className = `vw-body-wise-stage-state ${mode || ''}`;
    stateEl.innerHTML = `<strong>${title}</strong><span>${detail}</span>${mode === 'error' ? '<button type="button" class="vw-btn vw-btn-primary vw-btn-sm" data-body-retry>Retry model load</button>' : ''}`;
    stateEl.querySelector('[data-body-retry]')?.addEventListener('click', () => initializeRenderer(true));
  }

  /* Stationary 3D Circular Platform (Turntable Disc) */
  function createStationaryPlatform(BABYLON, scene) {
    // Elegant, thin circular platform (diameter 1.25m, thickness 0.024m)
    // Top surface sits at exactly y = 0.000 so the feet rest naturally on it.
    const disc = BABYLON.MeshBuilder.CreateCylinder(
      'body-wise-platform',
      { diameter: 1.25, height: 0.024, tessellation: 64 },
      scene
    );
    disc.position = new BABYLON.Vector3(0, -0.012, 0);
    disc.isPickable = false;

    // Satin warm off-white finish on the top surface
    const discMat = new BABYLON.PBRMaterial('platform-mat', scene);
    discMat.albedoColor = new BABYLON.Color3(0.94, 0.93, 0.91);
    discMat.roughness = 0.35;
    discMat.metallic = 0.06;
    discMat.specularIntensity = 0.40;
    disc.material = discMat;

    // Outer perimeter accent ring in VitaWise deep burgundy (#710014)
    const outerRing = BABYLON.MeshBuilder.CreateTorus(
      'platform-outer-ring',
      { diameter: 1.25, thickness: 0.010, tessellation: 64 },
      scene
    );
    outerRing.position = new BABYLON.Vector3(0, 0.0005, 0);
    outerRing.parent = disc;
    outerRing.isPickable = false;

    const ringMat = new BABYLON.PBRMaterial('platform-ring-mat', scene);
    ringMat.albedoColor = new BABYLON.Color3(0.44, 0.0, 0.08); // Burgundy
    ringMat.metallic = 0.50;
    ringMat.roughness = 0.25;
    outerRing.material = ringMat;

    // Disc remains in world coordinates — it NEVER rotates
    return disc;
  }

  function disposeLoadedModel() {
    if (state.modelResult) window.BodyWiseAssetLoader?.dispose?.(state.modelResult);
    state.modelResult = null;
    state.model = null;
    state.animation = null;
  }

  async function loadBodyModel() {
    const canvas = document.getElementById('body-wise-3d-canvas');
    const build = window.BodyWiseBuildRegistry?.getBodyBuild(state.selectedBodyBuild);
    if (!canvas || !build || !state.scene || !state.bodyRoot) return;

    const requestToken = ++state.syncToken;
    const currentRotationY = state.bodyRoot.rotation.y;

    const user = getEffectiveUser();
    const rawData = window.BodyWiseDataAdapter?.toRawData(user);
    const profile = rawData?.profile || {};
    const { heightFmt, weightFmt } = updateMeasurementDisplay(profile);

    setSyncStatus('syncing', 'Synthesizing 3D body proportions...');
    setStageState(`Loading ${build.displayName} body...`, `Applying personalized body dimensions...`, 'loading');

    try {
      const customOptions = {
        heightCm: heightFmt.isValid ? heightFmt.value : null,
        weightKg: weightFmt.isValid ? weightFmt.value : null
      };

      const result = await window.BodyWiseAssetLoader.load(
        window.BABYLON,
        state.scene,
        build.id,
        state.sexProfile,
        customOptions
      );

      // If a newer request has started, discard this result safely
      if (requestToken !== state.syncToken) {
        window.BodyWiseAssetLoader.dispose(result);
        return;
      }

      disposeLoadedModel();

      state.modelResult = result;
      state.model = result.root;
      state.animation = result.animate || null;

      // Parent ONLY the body mesh to state.bodyRoot (so only the body rotates)
      state.model.parent = state.bodyRoot;

      // Preserve existing horizontal rotation angle
      state.bodyRoot.rotation.y = currentRotationY;

      // Update sync indicator based on real source
      if (result.isPersonalized) {
        if (result.sourceType === 'live-synthesis') {
          setSyncStatus('ready', 'Personalized (PCA synthesis)');
        } else {
          setSyncStatus('ready', 'Calibrated height (offline baseline)');
        }
      } else if (heightFmt.isValid || weightFmt.isValid) {
        setSyncStatus('ready', 'Profile loaded (standard build)');
      } else {
        setSyncStatus('standby', 'Profile measurements pending');
      }

      setStageState('', '', 'ready');
      document.getElementById('body-wise-stage-state')?.classList.add('is-hidden');
    } catch (error) {
      if (requestToken !== state.syncToken) return;
      console.warn('[BodyWise3D] Selected model could not load:', error.message);
      disposeLoadedModel();
      setSyncStatus('standby', 'Model unavailable');
      setStageState(`${build.displayName} model could not load.`, 'The 3D model could not be initialized. Please retry.', 'error');
    }
  }

  function setupBodyRotationController(canvas) {
    let isDragging = false;
    let lastPointerX = 0;

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      isDragging = true;
      lastPointerX = e.clientX;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!isDragging || !state.bodyRoot) return;
      const deltaX = e.clientX - lastPointerX;
      lastPointerX = e.clientX;
      // Rotate ONLY the human body around its vertical Y axis:
      state.bodyRoot.rotation.y += deltaX * ROTATION_SENSITIVITY;
    });

    const endDrag = (e) => {
      if (!isDragging) return;
      isDragging = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    };

    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
  }

  async function initializeRenderer(retry) {
    const canvas = document.getElementById('body-wise-3d-canvas');
    if (!canvas || state.engine || state.initializing) return;

    state.initializing = true;
    setStageState('Preparing your BODY WISE 3D experience...', 'Loading Babylon.js 3D rendering pipeline.', 'loading');
    try {
      const BABYLON = await ensureBabylon();

      // 1. Transparent WebGL Canvas Engine
      state.engine = new BABYLON.Engine(canvas, true, {
        preserveDrawingBuffer: false,
        stencil: true,
        alpha: true,
        premultipliedAlpha: false
      }, true);
      state.engine.setHardwareScalingLevel(window.devicePixelRatio > 1.5 ? 1.5 : 1);

      // 2. 100% Transparent Scene Clear Color
      state.scene = new BABYLON.Scene(state.engine);
      state.scene.clearColor = new BABYLON.Color4(0, 0, 0, 0); // Transparent WebGL canvas
      state.scene.ambientColor = new BABYLON.Color3(0.88, 0.88, 0.90);
      state.scene.fogEnabled = false;

      // 3. Stationary Fixed Camera (faces the model directly; does NOT orbit or move on drag)
      state.camera = new BABYLON.ArcRotateCamera(
        'body-wise-fixed-camera',
        Math.PI / 2,     // Alpha = Math.PI / 2: direct front view
        FIXED_BETA,      // Beta = ~87.8°: level perspective
        CAMERA_RADIUS,   // Fixed framing distance
        new BABYLON.Vector3(0, CAMERA_TARGET_Y, 0), // Target at torso mid-height
        state.scene
      );
      // Detach default camera controls so user drag never moves the camera
      state.camera.detachControl();

      // 4. Dedicated Body Root TransformNode (ONLY this rotates)
      state.bodyRoot = new BABYLON.TransformNode('body-root-transform', state.scene);
      state.bodyRoot.position = new BABYLON.Vector3(0, 0, 0);
      state.bodyRoot.rotation = new BABYLON.Vector3(0, 0, 0);

      // 5. Stationary Circular Disc Platform (sits under feet; NEVER rotates)
      state.platform = createStationaryPlatform(BABYLON, state.scene);

      // 6. Direct Pointer Rotation Controller (rotates ONLY state.bodyRoot)
      setupBodyRotationController(canvas);

      // 7. Studio 3-Point Lighting Pipeline
      const ambient = new BABYLON.HemisphericLight('body-wise-ambient', new BABYLON.Vector3(0, 1, 0), state.scene);
      ambient.intensity = 0.82;
      ambient.diffuse = new BABYLON.Color3(0.96, 0.95, 0.94);
      ambient.groundColor = new BABYLON.Color3(0.60, 0.58, 0.56);

      const key = new BABYLON.DirectionalLight('body-wise-key', new BABYLON.Vector3(-0.55, -0.9, -0.65), state.scene);
      key.position = new BABYLON.Vector3(2.5, 4.0, 3.2);
      key.intensity = 1.25;
      key.diffuse = new BABYLON.Color3(1.0, 0.98, 0.95);
      key.specular = new BABYLON.Color3(0.85, 0.82, 0.78);

      const fill = new BABYLON.DirectionalLight('body-wise-fill', new BABYLON.Vector3(0.55, -0.4, -0.55), state.scene);
      fill.position = new BABYLON.Vector3(-2.5, 2.5, 2.5);
      fill.intensity = 0.50;
      fill.diffuse = new BABYLON.Color3(0.85, 0.88, 0.94);

      const rim = new BABYLON.DirectionalLight('body-wise-rim', new BABYLON.Vector3(0.1, -0.5, 0.9), state.scene);
      rim.position = new BABYLON.Vector3(0.0, 2.8, -3.0);
      rim.intensity = 0.70;
      rim.diffuse = new BABYLON.Color3(0.95, 0.92, 0.88);

      const resize = () => {
        if (state.engine) state.engine.resize();
      };
      state.resizeHandler = resize;
      window.addEventListener('resize', state.resizeHandler);

      state.engine.runRenderLoop(() => {
        if (!state.active) return;
        if (!state.reducedMotion) state.animation?.(performance.now());
        state.scene?.render();
      });

      await loadBodyModel();
      state.initializing = false;
    } catch (error) {
      console.warn('[BodyWise3D] Model pipeline unavailable:', error.message);
      state.engine?.dispose();
      state.engine = null;
      state.scene = null;
      state.scriptsPromise = null;
      setStageState('BODY WISE 3D could not load right now.', 'Retry after the 3D rendering pipeline is ready.', 'error');
      state.initializing = false;
    }
  }

  function disposeRenderer() {
    if (state.visibilityHandler) document.removeEventListener('visibilitychange', state.visibilityHandler);
    state.visibilityHandler = null;
    if (state.profileUpdateHandler) {
      window.removeEventListener('vitawise:profile-updated', state.profileUpdateHandler);
      window.removeEventListener('vitawise:user-changed', state.profileUpdateHandler);
      state.profileUpdateHandler = null;
    }
    if (state.storageHandler) {
      window.removeEventListener('storage', state.storageHandler);
      state.storageHandler = null;
    }
    if (state.transitionFrame) cancelAnimationFrame(state.transitionFrame);
    if (state.resizeHandler) window.removeEventListener('resize', state.resizeHandler);
    state.resizeHandler = null;
    state.scene?.dispose();
    state.engine?.dispose();
    disposeLoadedModel();
    state.scene = null;
    state.engine = null;
    state.camera = null;
    state.bodyRoot = null;
    state.platform = null;
  }

  /* Angle Preset Controls: Animates ONLY bodyRoot.rotation.y */
  function setBodyAngle(mode) {
    if (!state.bodyRoot) return;
    const angles = {
      front: 0,
      side:  -Math.PI / 2,
      back:  Math.PI,
      reset: 0
    };
    const targetAngle = angles[mode] !== undefined ? angles[mode] : 0;
    const startAngle = state.bodyRoot.rotation.y;

    // Calculate shortest angular distance on circle
    let delta = (targetAngle - startAngle) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;

    const duration = state.reducedMotion ? 0 : 450;
    if (state.transitionFrame) cancelAnimationFrame(state.transitionFrame);

    if (!duration) {
      state.bodyRoot.rotation.y = targetAngle;
    } else {
      const startedAt = performance.now();
      const step = (now) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        state.bodyRoot.rotation.y = startAngle + delta * eased;
        if (progress < 1) {
          state.transitionFrame = requestAnimationFrame(step);
        }
      };
      state.transitionFrame = requestAnimationFrame(step);
    }

    document.querySelectorAll('[data-body-angle]').forEach(button => {
      button.classList.toggle('active', button.dataset.bodyAngle === mode);
    });
  }

  async function activate() {
    state.active = true;
    if (!state.visibilityHandler) {
      state.visibilityHandler = () => {
        state.active = !document.hidden && document.getElementById('view-body-wise-3d')?.classList.contains('active');
      };
      document.addEventListener('visibilitychange', state.visibilityHandler);
    }

    if (!state.profileUpdateHandler) {
      state.profileUpdateHandler = () => {
        if (state.active && state.engine && state.scene) {
          loadBodyModel();
        }
      };
      window.addEventListener('vitawise:profile-updated', state.profileUpdateHandler);
      window.addEventListener('vitawise:user-changed', state.profileUpdateHandler);
    }

    if (!state.storageHandler) {
      state.storageHandler = (e) => {
        if (e.key === 'vitawise_user' && state.active && state.engine && state.scene) {
          loadBodyModel();
        }
      };
      window.addEventListener('storage', state.storageHandler);
    }

    // Bind angle buttons
    document.querySelectorAll('[data-body-angle]').forEach(button => {
      if (!button.dataset.bound) {
        button.dataset.bound = 'true';
        button.addEventListener('click', () => setBodyAngle(button.dataset.bodyAngle));
      }
    });

    // Bind gender toggle buttons
    document.querySelectorAll('[data-body-gender]').forEach(button => {
      if (!button.dataset.bound) {
        button.dataset.bound = 'true';
        button.addEventListener('click', () => setGenderProfile(button.dataset.bodyGender));
      }
    });

    const user = getEffectiveUser();
    const rawData = window.BodyWiseDataAdapter?.toRawData(user);
    const profile = rawData?.profile || {};
    updateMeasurementDisplay(profile);

    if (profile.sexProfile && ['male', 'female'].includes(profile.sexProfile)) {
      state.sexProfile = profile.sexProfile;
    }
    renderGenderSelection();

    if (!state.engine) {
      await initializeRenderer(false);
    } else {
      state.engine.resize();
      await loadBodyModel();
    }
  }

  function deactivate() {
    state.active = false;
  }

  window.addEventListener('pagehide', disposeRenderer);
  window.BodyWise3D = {
    activate,
    deactivate,
    loadBodyModel,
    setGenderProfile,
    setBodyAngle,
    updateMeasurementDisplay
  };
})(window, document);

/* BODY WISE 3D body-build configuration and approved 3D-Human-Body-Shape registry. */
(function (window) {
  'use strict';

  const MODEL_ROOT = './assets/body-wise-3d/generated/';
  const MODEL_STATES = Object.freeze({ READY: 'ready', LOADING: 'loading', MISSING: 'missing', ERROR: 'error', BLOCKED: 'blocked' });
  const BODY_BUILDS = [
    {
      id: 'lean',
      displayName: 'Lean',
      shortDescription: 'Streamlined, lighter athletic build',
      visualIntent: 'A streamlined human baseline synthesized using the 3D-Human-Body-Shape anthropometric model.',
      preferredModelAsset: 'female_lean.json',
      source: 'github-3d-human-body-shape',
      modelFormat: 'json',
      animationAsset: null,
      genderCompatibility: ['female', 'male', 'unspecified'],
      supported: true,
      assetStatus: 'ready',
      variants: {
        male: { modelAsset: 'male_lean.json', objAsset: 'male_lean.obj' },
        female: { modelAsset: 'female_lean.json', objAsset: 'female_lean.obj' }
      },
      futureCustomization: 'Parameterized by negative weight, waist and hip deviations in the deformation basis.'
    },
    {
      id: 'balanced',
      displayName: 'Balanced',
      shortDescription: 'Statistical neutral everyday build',
      visualIntent: 'A neutral human baseline synthesized from the statistical mean of the 3D-Human-Body-Shape dataset.',
      preferredModelAsset: 'female_balanced.json',
      source: 'github-3d-human-body-shape',
      modelFormat: 'json',
      animationAsset: null,
      genderCompatibility: ['female', 'male', 'unspecified'],
      supported: true,
      assetStatus: 'ready',
      variants: {
        male: { modelAsset: 'male_balanced.json', objAsset: 'male_balanced.obj' },
        female: { modelAsset: 'female_balanced.json', objAsset: 'female_balanced.obj' }
      },
      futureCustomization: 'Standard neutral deformation reference (all anthropometric deviations = 0).'
    },
    {
      id: 'athletic',
      displayName: 'Athletic',
      shortDescription: 'Defined athletic V-taper build',
      visualIntent: 'An active visual baseline synthesized with expanded chest, shoulders, and toned core.',
      preferredModelAsset: 'female_athletic.json',
      source: 'github-3d-human-body-shape',
      modelFormat: 'json',
      animationAsset: null,
      genderCompatibility: ['female', 'male', 'unspecified'],
      supported: true,
      assetStatus: 'ready',
      variants: {
        male: { modelAsset: 'male_athletic.json', objAsset: 'male_athletic.obj' },
        female: { modelAsset: 'female_athletic.json', objAsset: 'female_athletic.obj' }
      },
      futureCustomization: 'Positive chest (+1.6 std), back (+1.5 std), arm (+1.8 std) with tapered waist.'
    },
    {
      id: 'broad',
      displayName: 'Broad',
      shortDescription: 'Wider-shouldered, solid frame',
      visualIntent: 'A broader human frame synthesized with wide clavicle span and solid upper chest.',
      preferredModelAsset: 'female_broad.json',
      source: 'github-3d-human-body-shape',
      modelFormat: 'json',
      animationAsset: null,
      genderCompatibility: ['female', 'male', 'unspecified'],
      supported: true,
      assetStatus: 'ready',
      variants: {
        male: { modelAsset: 'male_broad.json', objAsset: 'male_broad.obj' },
        female: { modelAsset: 'female_broad.json', objAsset: 'female_broad.obj' }
      },
      futureCustomization: 'Positive back-shoulder span (+2.2 std), neck (+1.2 std), chest (+1.7 std).'
    },
    {
      id: 'fuller',
      displayName: 'Fuller',
      shortDescription: 'Fuller, naturally proportioned build',
      visualIntent: 'A fuller human baseline synthesized with increased core, waist, and hip volume.',
      preferredModelAsset: 'female_fuller.json',
      source: 'github-3d-human-body-shape',
      modelFormat: 'json',
      animationAsset: null,
      genderCompatibility: ['female', 'male', 'unspecified'],
      supported: true,
      assetStatus: 'ready',
      variants: {
        male: { modelAsset: 'male_fuller.json', objAsset: 'male_fuller.obj' },
        female: { modelAsset: 'female_fuller.json', objAsset: 'female_fuller.obj' }
      },
      futureCustomization: 'Positive volume across waist (+2.0 std), hips (+1.8 std), thighs (+1.6 std).'
    },
    {
      id: 'custom',
      displayName: 'Custom',
      shortDescription: 'Personalized to your height, weight & goals',
      visualIntent: 'Dynamically synthesized using 3D-Human-Body-Shape linear deformation regression.',
      preferredModelAsset: 'female_balanced.json',
      source: 'github-3d-human-body-shape',
      modelFormat: 'json',
      animationAsset: null,
      genderCompatibility: ['female', 'male', 'unspecified'],
      supported: true,
      assetStatus: 'ready',
      variants: {
        male: { modelAsset: 'male_balanced.json', objAsset: 'male_balanced.obj' },
        female: { modelAsset: 'female_balanced.json', objAsset: 'female_balanced.obj' }
      },
      futureCustomization: 'Synthesizes custom mesh via /api/v1/body-model/synthesize or biometric mapping.'
    }
  ];

  function getBodyBuild(id) {
    return BODY_BUILDS.find(build => build.id === id) || BODY_BUILDS.find(build => build.id === 'balanced');
  }

  function getModelUrl(bodyBuildId, gender) {
    const build = getBodyBuild(bodyBuildId);
    const normalizedGender = String(gender || 'female').toLowerCase();
    const variant = build.variants?.[normalizedGender] || build.variants?.female || { modelAsset: build.preferredModelAsset };
    const modelAsset = variant?.modelAsset || build.preferredModelAsset;
    if (!modelAsset) return null;
    return `${MODEL_ROOT}${modelAsset}`;
  }

  function getAvailability(bodyBuildId) {
    const build = getBodyBuild(bodyBuildId);
    return build.supported ? 'ready' : (build.assetStatus || 'blocked');
  }

  window.BodyWiseBuildRegistry = {
    MODEL_ROOT,
    MODEL_STATES,
    BODY_BUILDS,
    getBodyBuild,
    getModelUrl,
    getAvailability
  };
})(window);

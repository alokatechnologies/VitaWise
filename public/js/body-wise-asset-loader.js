/* BODY WISE 3D Asset Loader — Integrated with zengyh1900/3D-Human-Body-Shape. */
(function (window) {
  'use strict';

  const registry = () => window.BodyWiseBuildRegistry;

  const REGION_BOUNDS = {
    brain:     { yMin: 1.45, yMax: 2.00, xMin: -0.15, xMax: 0.15, zMin: -0.20, zMax: 0.20, label: 'Head & focus', center: [0, 1.58, 0] },
    heart:     { yMin: 1.15, yMax: 1.34, xMin: -0.12, xMax: 0.02, zMin: -0.15, zMax: 0.05, label: 'Heart & circulation', center: [-0.05, 1.24, -0.06] },
    lungs:     { yMin: 1.10, yMax: 1.35, xMin: -0.20, xMax: 0.20, zMin: -0.18, zMax: 0.12, label: 'Breathing rhythm', center: [0, 1.22, -0.05] },
    digestive: { yMin: 0.88, yMax: 1.10, xMin: -0.16, xMax: 0.16, zMin: -0.16, zMax: 0.10, label: 'Digestive rhythm', center: [0, 0.99, -0.04] },
    hydration: { yMin: 0.80, yMax: 1.02, xMin: -0.18, xMax: 0.18, zMin: -0.18, zMax: 0.12, label: 'Hydration', center: [0, 0.91, -0.02] },
    muscles:   { yMin: 0.20, yMax: 0.85, xMin: -0.35, xMax: 0.35, zMin: -0.25, zMax: 0.25, label: 'Movement', center: [0, 0.55, 0] },
    sleep:     { yMin: 0.00, yMax: 2.00, xMin: -0.50, xMax: 0.50, zMin: -0.50, zMax: 0.50, label: 'Sleep & recovery', center: [0, 1.35, 0] }
  };

  function resolve(bodyBuildId, sexProfile = 'female') {
    const buildRegistry = registry();
    if (!buildRegistry) throw new Error('BODY WISE asset registry is unavailable.');
    const build = buildRegistry.getBodyBuild(bodyBuildId);
    return {
      build,
      status: buildRegistry.getAvailability(build.id),
      modelUrl: buildRegistry.getModelUrl(build.id, sexProfile)
    };
  }

  async function fetchModelData(url, bodyBuildId, sexProfile, customOptions) {
    const validHeight = customOptions?.heightCm && Number(customOptions.heightCm) >= 50 && Number(customOptions.heightCm) <= 260;
    const validWeight = customOptions?.weightKg && Number(customOptions.weightKg) >= 20 && Number(customOptions.weightKg) <= 350;

    // If profile measurements are available, synthesize live personalized 3D model
    if (validHeight || validWeight) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const res = await fetch('/api/v1/body-model/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gender: sexProfile,
            build: bodyBuildId || 'balanced',
            heightCm: validHeight ? Number(customOptions.heightCm) : undefined,
            weightKg: validWeight ? Number(customOptions.weightKg) : undefined,
            params: customOptions.params || {}
          }),
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (res.ok) {
          const liveData = await res.json();
          if (liveData && liveData.positions && liveData.positions.length > 0) {
            console.log('[BodyWiseAssetLoader] Successfully synthesized personalized 3D body via PCA model service.');
            liveData.sourceType = 'live-synthesis';
            return liveData;
          }
        }
      } catch (err) {
        console.warn('[BodyWiseAssetLoader] Live synthesis service unavailable, using precomputed baseline with calibration:', err.message);
      }
    }

    // Default: Load pre-synthesized 3D-Human-Body-Shape model JSON
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load model file (${response.status}): ${url}`);
    }
    const data = await response.json();
    data.sourceType = 'precomputed-baseline';
    return data;
  }

  /* Build Anatomical Garments (Fitted Sports Bra & Underwear for Female, Athletic Shorts for Male)
   * Extruded along vertex normals to fit perfectly over the body without clipping or floating.
   */
  function buildAnatomicalGarments(BABYLON, scene, humanMesh, sexProfile, positions, indices, normals, heightMeters) {
    const garmentMeshes = [];
    const totalFaces = indices.length / 3;

    function buildSubmesh(faceList, offsetMeters) {
      if (!faceList || faceList.length === 0) return null;
      const vertexMap = new Map();
      const newPositions = [];
      const newNormals = [];
      const newIndices = [];

      for (const f of faceList) {
        for (let k = 0; k < 3; k++) {
          const origVIdx = indices[f * 3 + k];
          if (!vertexMap.has(origVIdx)) {
            const newVIdx = newPositions.length / 3;
            vertexMap.set(origVIdx, newVIdx);

            const nx = normals[origVIdx * 3];
            const ny = normals[origVIdx * 3 + 1];
            const nz = normals[origVIdx * 3 + 2];

            newPositions.push(
              positions[origVIdx * 3] + nx * offsetMeters,
              positions[origVIdx * 3 + 1] + ny * offsetMeters,
              positions[origVIdx * 3 + 2] + nz * offsetMeters
            );
            newNormals.push(nx, ny, nz);
          }
          newIndices.push(vertexMap.get(origVIdx));
        }
      }

      return {
        positions: new Float32Array(newPositions),
        normals: new Float32Array(newNormals),
        indices: new Uint32Array(newIndices)
      };
    }

    function createGarment(name, submeshData, mat) {
      if (!submeshData || submeshData.indices.length === 0) return null;
      const mesh = new BABYLON.Mesh(name, scene);
      mesh.isPickable = false;
      const vd = new BABYLON.VertexData();
      vd.positions = submeshData.positions;
      vd.normals = submeshData.normals;
      vd.indices = submeshData.indices;
      vd.applyToMesh(mesh, false);
      mesh.material = mat;
      mesh.parent = humanMesh;
      garmentMeshes.push(mesh);
      return mesh;
    }

    const faceGroups = sexProfile === 'female'
      ? { braCups: [], braBand: [], underwear: [], undBand: [], hair: [] }
      : { shortsBody: [], shortsBand: [] };

    for (let f = 0; f < totalFaces; f++) {
      const i0 = indices[f * 3] * 3;
      const cy = positions[i0 + 1] / heightMeters;
      const cx = positions[i0];
      const cz = positions[i0 + 2];
      const rLateral = Math.sqrt(cx * cx + cz * cz);

      if (sexProfile === 'female') {
        const isTorso = Math.abs(cx) < 0.23 && rLateral < 0.26;
        if (isTorso) {
          // Sports bra white underbust band
          if (cy >= 0.655 && cy < 0.695) {
            faceGroups.braBand.push(f);
          }
          // Sports bra cups and straps
          else if (cy >= 0.695 && cy <= 0.815) {
            const isNeck = Math.abs(cx) < 0.055 && cy > 0.785;
            const isArmpit = Math.abs(cx) > 0.175 && cy < 0.75;
            if (!isNeck && !isArmpit) {
              faceGroups.braCups.push(f);
            }
          }
          // Underwear briefs body
          else if (cy >= 0.475 && cy < 0.555) {
            faceGroups.underwear.push(f);
          }
          // Underwear white waistband
          else if (cy >= 0.555 && cy <= 0.590) {
            faceGroups.undBand.push(f);
          }
        }

        // Female bob hair (scalp + posterior/lateral head matching Hum3D reference)
        if (cy >= 0.865) {
          if (cy >= 0.935 || (cy >= 0.875 && (cz < 0.03 || Math.abs(cx) > 0.065))) {
            faceGroups.hair.push(f);
          }
        }
      } else {
        // Male athletic shorts: sits from waist down to mid-thigh
        const isPelvisAndThighs = Math.abs(cx) < 0.26 && rLateral < 0.28;
        if (isPelvisAndThighs) {
          if (cy >= 0.545 && cy <= 0.585) {
            faceGroups.shortsBand.push(f);
          } else if (cy >= 0.405 && cy < 0.545) {
            faceGroups.shortsBody.push(f);
          }
        }
      }
    }

    if (sexProfile === 'female') {
      // 1. Light-Grey Heather Sports Bra Material (Matching Reference Image 1)
      const braMat = new BABYLON.PBRMaterial(`mat_sports_bra_${Date.now()}`, scene);
      braMat.albedoColor = new BABYLON.Color3(0.78, 0.80, 0.83); // Light heather grey
      braMat.roughness = 0.82;
      braMat.metallic = 0.02;
      braMat.specularIntensity = 0.25;

      // 2. Crisp White Elastic Band Material (Matching Reference Image 1)
      const whiteElasticMat = new BABYLON.PBRMaterial(`mat_white_elastic_${Date.now()}`, scene);
      whiteElasticMat.albedoColor = new BABYLON.Color3(0.95, 0.95, 0.96); // Crisp white
      whiteElasticMat.roughness = 0.65;
      whiteElasticMat.metallic = 0.0;
      whiteElasticMat.specularIntensity = 0.35;

      // 3. Light-Grey Underwear Fabric Material
      const undMat = new BABYLON.PBRMaterial(`mat_underwear_${Date.now()}`, scene);
      undMat.albedoColor = new BABYLON.Color3(0.78, 0.80, 0.83); // Light heather grey
      undMat.roughness = 0.82;
      undMat.metallic = 0.02;
      undMat.specularIntensity = 0.25;

      // 4. Brunette Bob Hair Material (Matching Reference Image 1)
      const hairMat = new BABYLON.PBRMaterial(`mat_hair_${Date.now()}`, scene);
      hairMat.albedoColor = new BABYLON.Color3(0.24, 0.16, 0.12); // Brunette/chestnut
      hairMat.roughness = 0.65;
      hairMat.metallic = 0.08;
      hairMat.specularIntensity = 0.55;

      createGarment('body-wise-female-sports-bra-cups', buildSubmesh(faceGroups.braCups, 0.0022), braMat);
      createGarment('body-wise-female-sports-bra-band', buildSubmesh(faceGroups.braBand, 0.0030), whiteElasticMat);
      createGarment('body-wise-female-underwear-briefs', buildSubmesh(faceGroups.underwear, 0.0022), undMat);
      createGarment('body-wise-female-underwear-band', buildSubmesh(faceGroups.undBand, 0.0030), whiteElasticMat);
      createGarment('body-wise-female-hair', buildSubmesh(faceGroups.hair, 0.0065), hairMat);
    } else {
      // 1. Athletic Slate-Grey Shorts Fabric Material (Matching Reference Image 2)
      const shortsMat = new BABYLON.PBRMaterial(`mat_shorts_body_${Date.now()}`, scene);
      shortsMat.albedoColor = new BABYLON.Color3(0.44, 0.50, 0.60); // Slate athletic grey/blue-grey
      shortsMat.roughness = 0.78;
      shortsMat.metallic = 0.03;
      shortsMat.specularIntensity = 0.30;

      // 2. Athletic Coordinated Waistband Material (Matching Reference Image 2)
      const shortsBandMat = new BABYLON.PBRMaterial(`mat_shorts_band_${Date.now()}`, scene);
      shortsBandMat.albedoColor = new BABYLON.Color3(0.38, 0.43, 0.52); // Darker athletic waistband
      shortsBandMat.roughness = 0.70;
      shortsBandMat.metallic = 0.0;
      shortsBandMat.specularIntensity = 0.35;

      createGarment('body-wise-male-shorts-body', buildSubmesh(faceGroups.shortsBody, 0.0032), shortsMat);
      createGarment('body-wise-male-shorts-band', buildSubmesh(faceGroups.shortsBand, 0.0040), shortsBandMat);
    }

    // Natural Eye Features for Both Models
    const eyeMat = new BABYLON.PBRMaterial(`mat_eyes_${Date.now()}`, scene);
    eyeMat.albedoColor = new BABYLON.Color3(0.20, 0.17, 0.15); // Natural hazel/brown
    eyeMat.roughness = 0.12;
    eyeMat.metallic = 0.0;
    eyeMat.specularIntensity = 0.85;

    const leftEye = BABYLON.MeshBuilder.CreateSphere('eye_left', { diameter: 0.015, segments: 16 }, scene);
    leftEye.position = new BABYLON.Vector3(0.034, 0.935 * heightMeters, 0.096);
    leftEye.material = eyeMat;
    leftEye.parent = humanMesh;
    leftEye.isPickable = false;
    garmentMeshes.push(leftEye);

    const rightEye = BABYLON.MeshBuilder.CreateSphere('eye_right', { diameter: 0.015, segments: 16 }, scene);
    rightEye.position = new BABYLON.Vector3(-0.036, 0.935 * heightMeters, 0.093);
    rightEye.material = eyeMat;
    rightEye.parent = humanMesh;
    rightEye.isPickable = false;
    garmentMeshes.push(rightEye);

    return garmentMeshes;
  }

  /* Load Realistic Male Photogrammetry Human Model (CC-BY-4.0 by FletchTech) */
  async function loadRealisticMaleModel(BABYLON, scene, bodyBuildId, customOptions) {
    console.log('[BodyWiseAssetLoader] Loading realistic male photogrammetry human model...');
    const folder = './assets/body-wise-3d/human/body-wise-male/';
    const filename = 'scene.gltf';

    const result = await BABYLON.SceneLoader.ImportMeshAsync('', folder, filename, scene);
    const root = result.meshes[0];
    const allMeshes = result.meshes;

    // Enable picking and tune materials for natural, realistic human skin
    allMeshes.forEach(mesh => {
      mesh.isPickable = true;
      if (mesh.material) {
        mesh.material.backFaceCulling = false;
        if (mesh.material instanceof BABYLON.PBRMaterial) {
          mesh.material.roughness = 0.54;
          mesh.material.metallic = 0.0;
          if (mesh.material.emissiveFactor) {
            mesh.material.emissiveColor = new BABYLON.Color3(0.06, 0.06, 0.06);
          }
        }
      }
    });

    // Compute bounding box across all children to determine raw dimensions
    const childMeshes = root.getChildMeshes(false);
    let min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
    let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);

    for (const m of childMeshes) {
      m.computeWorldMatrix(true);
      const b = m.getBoundingInfo().boundingBox;
      min = BABYLON.Vector3.Minimize(min, b.minimumWorld);
      max = BABYLON.Vector3.Maximize(max, b.maximumWorld);
    }

    const rawHeight = max.y - min.y;
    let targetHeightMeters = 1.76;
    let isPersonalized = false;

    if (customOptions?.heightCm && Number(customOptions.heightCm) >= 50 && Number(customOptions.heightCm) <= 260) {
      targetHeightMeters = Number(customOptions.heightCm) / 100.0;
      isPersonalized = true;
    }

    const baseScale = (rawHeight > 0) ? (targetHeightMeters / rawHeight) : 0.106;
    root.scaling = new BABYLON.Vector3(baseScale, baseScale, baseScale);

    // Recompute bounding box after scaling to rest feet on turntable disc (y = 0.000)
    let sMin = new BABYLON.Vector3(Infinity, Infinity, Infinity);
    let sMax = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);

    for (const m of childMeshes) {
      m.computeWorldMatrix(true);
      const b = m.getBoundingInfo().boundingBox;
      sMin = BABYLON.Vector3.Minimize(sMin, b.minimumWorld);
      sMax = BABYLON.Vector3.Maximize(sMax, b.maximumWorld);
    }

    const cX = (sMin.x + sMax.x) / 2;
    const cZ = (sMin.z + sMax.z) / 2;

    root.position = new BABYLON.Vector3(-cX, -sMin.y, -cZ);

    // Subtle natural standing micro-breathing motion
    const animate = (time) => {
      const breathPhase = Math.sin(time * 0.0016);
      root.scaling.x = baseScale * (1.0 + breathPhase * 0.003);
      root.scaling.z = baseScale * (1.0 + breathPhase * 0.005);
    };

    const buildRegistry = registry();
    const build = buildRegistry?.getBodyBuild?.(bodyBuildId) || { id: 'balanced', displayName: 'Balanced' };

    return {
      root,
      meshes: allMeshes,
      bodyBuild: build,
      heightMeters: targetHeightMeters,
      animate,
      source: 'realistic-human-photogrammetry',
      sourceType: 'gltf-photogrammetry',
      isPersonalized,
      personalizationType: isPersonalized ? 'calibrated-height' : 'baseline',
      metrics: {
        heightCm: Math.round(targetHeightMeters * 1000) / 10,
        weightKg: customOptions?.weightKg || 74
      },
      garments: []
    };
  }

  async function load(BABYLON, scene, bodyBuildId = 'balanced', sexProfile = 'female', customOptions = {}) {
    if (!BABYLON || !scene) {
      throw new Error('Babylon.js 3D rendering engine is not initialized.');
    }

    // Stage B: Use verified realistic male human model (CC-BY-4.0 by FletchTech)
    if (sexProfile === 'male') {
      try {
        const realisticMale = await loadRealisticMaleModel(BABYLON, scene, bodyBuildId, customOptions);
        if (realisticMale) return realisticMale;
      } catch (err) {
        console.warn('[BodyWiseAssetLoader] Realistic male GLTF failed to load, falling back to statistical model:', err.message);
      }
    }

    const selection = resolve(bodyBuildId, sexProfile);
    if (selection.status !== 'ready' || !selection.modelUrl) {
      const error = new Error(`The 3D-Human-Body-Shape ${selection.build.displayName} model is not ready.`);
      error.code = selection.status;
      error.bodyBuild = selection.build.id;
      throw error;
    }

    console.log(`[BodyWiseAssetLoader] Loading 3D-Human-Body-Shape (${sexProfile} - ${bodyBuildId})`, customOptions);
    const data = await fetchModelData(selection.modelUrl, bodyBuildId, sexProfile, customOptions);

    if (!data.positions || !data.indices || !data.normals) {
      throw new Error('Invalid mesh payload from 3D-Human-Body-Shape asset pipeline.');
    }

    // Create root human mesh
    const meshName = `body_wise_${sexProfile}_${bodyBuildId}_${Date.now()}`;
    const humanMesh = new BABYLON.Mesh(meshName, scene);
    humanMesh.isPickable = true;

    // Center lateral coordinates (X, Z) and ground bottom of feet at y = 0.000
    const rawPos = data.positions;
    const len = rawPos.length;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (let i = 0; i < len; i += 3) {
      const px = rawPos[i];
      const py = rawPos[i + 1];
      const pz = rawPos[i + 2];
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
      if (pz < minZ) minZ = pz;
      if (pz > maxZ) maxZ = pz;
    }

    const cX = (minX + maxX) / 2;
    const cZ = (minZ + maxZ) / 2;
    const rawHeightMeters = maxY - minY;

    // Calibrate height if using precomputed fallback and user has valid heightCm
    let scaleY = 1.0;
    let isHeightCalibrated = false;
    if (data.sourceType !== 'live-synthesis' && customOptions?.heightCm && Number(customOptions.heightCm) >= 50 && Number(customOptions.heightCm) <= 260) {
      const targetHeightMeters = Number(customOptions.heightCm) / 100.0;
      if (rawHeightMeters > 0) {
        scaleY = targetHeightMeters / rawHeightMeters;
        isHeightCalibrated = true;
      }
    }

    const centeredPositions = new Float32Array(len);

    for (let i = 0; i < len; i += 3) {
      centeredPositions[i] = rawPos[i] - cX;
      centeredPositions[i + 1] = (rawPos[i + 1] - minY) * scaleY; // Bottom of feet rests directly at y = 0.000
      centeredPositions[i + 2] = rawPos[i + 2] - cZ;
    }

    const heightMeters = (maxY - minY) * scaleY;
    const isPersonalized = data.sourceType === 'live-synthesis' || isHeightCalibrated;
    const personalizationType = data.sourceType === 'live-synthesis' ? 'synthesis' : (isHeightCalibrated ? 'calibrated-baseline' : 'baseline');

    // Apply vertex data (12,500 vertices, 25,000 triangular facets)
    const vertexData = new BABYLON.VertexData();
    vertexData.positions = centeredPositions;
    vertexData.indices = data.indices;
    vertexData.normals = data.normals;
    vertexData.applyToMesh(humanMesh, true);

    // Realistic Light Ivory Human Skin PBR Material
    const skinMat = new BABYLON.PBRMaterial(`skin_${meshName}`, scene);
    if (sexProfile === 'female') {
      // Natural light ivory Caucasian/fair skin tone
      skinMat.albedoColor = new BABYLON.Color3(0.89, 0.82, 0.77);
      skinMat.roughness = 0.56;
      skinMat.specularIntensity = 0.32;
      skinMat.directIntensity = 0.88;
      if (skinMat.subSurface) {
        skinMat.subSurface.isTranslucencyEnabled = true;
        skinMat.subSurface.translucencyIntensity = 0.18;
        skinMat.subSurface.minimumThickness = 0.001;
        skinMat.subSurface.maximumThickness = 0.004;
        skinMat.subSurface.tintColor = new BABYLON.Color3(0.96, 0.78, 0.72);
        skinMat.subSurface.diffusionDistance = new BABYLON.Color3(0.004, 0.002, 0.001);
        skinMat.subSurface.useAlbedoToTintTranslucency = true;
      }
    } else {
      // Natural light ivory human skin tone matching male photogrammetry
      skinMat.albedoColor = new BABYLON.Color3(0.89, 0.82, 0.77);
      skinMat.roughness = 0.54;
      skinMat.specularIntensity = 0.22;
      skinMat.directIntensity = 0.88;
      if (skinMat.subSurface) {
        skinMat.subSurface.isTranslucencyEnabled = true;
        skinMat.subSurface.translucencyIntensity = 0.12;
        skinMat.subSurface.minimumThickness = 0.001;
        skinMat.subSurface.maximumThickness = 0.004;
        skinMat.subSurface.tintColor = new BABYLON.Color3(0.96, 0.78, 0.72);
        skinMat.subSurface.diffusionDistance = new BABYLON.Color3(0.004, 0.002, 0.001);
        skinMat.subSurface.useAlbedoToTintTranslucency = true;
      }
    }
    skinMat.metallic = 0.0; // Dielectric human skin
    humanMesh.material = skinMat;

    // Build 3D Garments (Fitted Sports Bra & Underwear for Female, Athletic Shorts for Male)
    const garmentMeshes = buildAnatomicalGarments(
      BABYLON,
      scene,
      humanMesh,
      sexProfile,
      centeredPositions,
      data.indices,
      data.normals,
      heightMeters
    );

    // Semantic Wellness Region Landmarks (centered with mesh)
    const regionNodes = [];
    const regionIndicators = {};

    Object.entries(REGION_BOUNDS).forEach(([regionKey, regionConfig]) => {
      const marker = BABYLON.MeshBuilder.CreateSphere(`region_${regionKey}`, { diameter: 0.06 }, scene);
      marker.position = new BABYLON.Vector3(
        regionConfig.center[0],
        regionConfig.center[1] - minY,
        regionConfig.center[2]
      );
      marker.parent = humanMesh;
      marker.isVisible = false;
      marker.isPickable = false;

      const markerMat = new BABYLON.StandardMaterial(`marker_mat_${regionKey}`, scene);
      markerMat.diffuseColor = new BABYLON.Color3(0.44, 0.0, 0.08); // Burgundy accent
      markerMat.emissiveColor = new BABYLON.Color3(0.44, 0.0, 0.08);
      markerMat.alpha = 0.0;
      marker.material = markerMat;

      regionNodes.push(marker);
      regionIndicators[regionKey] = marker;
    });

    humanMesh.metadata = {
      bodyWiseSource: '3D-Human-Body-Shape',
      gender: sexProfile,
      build: bodyBuildId,
      sourceType: data.sourceType,
      isPersonalized,
      personalizationType,
      metrics: {
        ...data.metrics,
        heightCm: Math.round(heightMeters * 1000) / 10
      },
      bounds: {
        min: [minX - cX, 0, minZ - cZ],
        max: [maxX - cX, heightMeters, maxZ - cZ]
      },
      heightMeters,
      regionIndicators
    };

    // Lifelike subtle standing micro-breathing motion (14 breaths/min)
    const animate = (time) => {
      const breathPhase = Math.sin(time * 0.0016);
      humanMesh.scaling.x = 1.0 + breathPhase * 0.004;
      humanMesh.scaling.z = 1.0 + breathPhase * 0.006;
    };

    return {
      root: humanMesh,
      meshes: [humanMesh, ...garmentMeshes, ...regionNodes],
      bodyBuild: selection.build,
      metrics: humanMesh.metadata.metrics,
      heightMeters,
      animate,
      regionIndicators,
      source: 'github-3d-human-body-shape',
      sourceType: data.sourceType,
      isPersonalized,
      personalizationType,
      garments: garmentMeshes
    };
  }

  function dispose(result) {
    if (!result) return;
    if (result.root) {
      result.root.dispose(false, true);
    }
    if (Array.isArray(result.meshes)) {
      result.meshes.forEach(m => m.dispose?.(false, true));
    }
  }

  window.BodyWiseAssetLoader = { load, dispose, resolve, REGION_BOUNDS };
})(window);

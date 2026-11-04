# VitaWise 3D Human Body Model Integration Guide

This guide explains how the [zengyh1900/3D-Human-Body-Shape](https://github.com/zengyh1900/3D-Human-Body-Shape.git) project is integrated into VitaWise.

---

## 1. Architecture & File Structure

The integration is cleanly separated into modular layers:

```
vitawise/
├── integrations/
│   ├── 3D-Human-Body-Shape/          <-- Original cloned GitHub repository (untouched)
│   │   ├── release_model/            <-- Pretrained anthropometric deformation matrices (.npy, .npz)
│   │   ├── src/                      <-- Original Python model logic (reshaper.py, utils.py)
│   │   └── data/                     <-- Anthropometric landmarks and templates
│   │
│   ├── service/
│   │   └── body_shape_service.py     <-- VitaWise Python model service & pre-exporter
│   │
│   └── README.md                     <-- This integration documentation
│
├── public/
│   ├── assets/body-wise-3d/
│   │   └── generated/                <-- Pre-synthesized 3D models (10 models: 5 builds x 2 genders)
│   │       ├── manifest.json
│   │       ├── female_lean.json / .obj
│   │       ├── female_balanced.json / .obj
│   │       ├── female_athletic.json / .obj
│   │       ├── female_broad.json / .obj
│   │       ├── female_fuller.json / .obj
│   │       ├── male_lean.json / .obj
│   │       ├── male_balanced.json / .obj
│   │       ├── male_athletic.json / .obj
│   │       ├── male_broad.json / .obj
│   │       └── male_fuller.json / .obj
│   │
│   └── js/
│       ├── body-wise-build-registry.js  <-- Controls preset definitions & asset routing
│       ├── body-wise-asset-loader.js   <-- Loads mesh buffers into Babylon.js
│       └── body-wise-3d.js             <-- Controls 3D viewer, camera, lighting & wellness regions
│
└── server.mjs                          <-- Main VitaWise server with API proxy (/api/v1/body-model/*)
```

---

## 2. Key Files Overview

| Concern | File Location | Responsibility |
| :--- | :--- | :--- |
| **Original Model** | `integrations/3D-Human-Body-Shape/src/reshaper.py` | Original deformation and shape mapping algorithm. |
| **Model Weights** | `integrations/3D-Human-Body-Shape/release_model/` | Trained numpy matrices (facets, d2v, d_basis, m2d). |
| **Python Service** | `integrations/service/body_shape_service.py` | Runs the HTTP inference service & exports pre-synthesized models. |
| **Shape Presets** | `integrations/service/body_shape_service.py` (`PRESET_DEFINITIONS`) | Maps Lean, Balanced, Athletic, Broad, Fuller to anthropometric deviations. |
| **Frontend Registry** | `public/js/body-wise-build-registry.js` | UI presets, metadata, and asset file mapping. |
| **Babylon.js Loader** | `public/js/body-wise-asset-loader.js` | Creates the 3D mesh in Babylon.js and configures PBR skin shading. |
| **3D Stage & Viewer** | `public/js/body-wise-3d.js` | Orbit camera, lighting, studio ground, and wellness region selection. |
| **Backend API Proxy** | `server.mjs` | Routes `/api/v1/body-model/*` to Python service or disk fallback. |

---

## 3. How to Run VitaWise

### Step 1: Start the Python Model Service (Port 5005)
The Python service handles dynamic 3D body synthesis in real time (~50 ms per mesh):

```bash
# In vitawise folder:
python integrations/service/body_shape_service.py --serve --port 5005
```

### Step 2: Start the VitaWise Web Server (Port 3001)
In a separate terminal:

```bash
# In vitawise folder:
npm start
```
VitaWise is now running at: `http://localhost:3001`

> **Note on Resiliency:** If the Python service is not running, VitaWise automatically falls back to the pre-synthesized high-fidelity models in `public/assets/body-wise-3d/generated/`. The 3D body will always render reliably.

---

## 4. How to Modify Body Shape Parameters & Presets

The 3D-Human-Body-Shape model uses **19 standard-deviation parameters**:

| Index | Parameter Name | What It Controls |
| :---: | :--- | :--- |
| `0` | `weight` | Overall body volume and mass (+ is heavier, - is leaner) |
| `1` | `height` | Stature / vertical height (+ is taller, - is shorter) |
| `2` | `neck` | Neck thickness |
| `3` | `chest` | Chest circumference and depth |
| `4` | `belly button waist` | Abdominal / core girth |
| `5` | `gluteal hip` | Hip / gluteal projection and volume |
| `6` | `neck shoulder elbow wrist` | Total arm length |
| `7` | `crotch knee floor` | Leg length from crotch to floor |
| `8` | `across back shoulder neck` | Shoulder width / clavicle span |
| `9` | `neck to gluteal hip` | Torso length |
| `10` | `natural waist` | Upper waist taper |
| `11` | `max. hip` | Maximum hip breadth |
| `12` | `natural waist rise` | Waist rise elevation |
| `13` | `shoulder to midhand` | Upper arm + forearm reach |
| `14` | `upper arm` | Biceps / triceps thickness |
| `15` | `wrist` | Wrist circumference |
| `16` | `outer natural waist to floor` | Total lower body length |
| `17` | `knee` | Knee joint width |
| `18` | `max. thigh` | Upper leg / thigh thickness |

### To adjust an existing preset or add a new one:
1. Open `integrations/service/body_shape_service.py`.
2. Locate `PRESET_DEFINITIONS`:
   ```python
   "athletic": {
       "displayName": "Athletic",
       "description": "Defined athletic V-taper build",
       "params": {
           3: 1.6,   # Chest +1.6 std
           8: 1.5,   # Shoulders +1.5 std
           14: 1.8,  # Arms +1.8 std
           10: -0.8  # Waist -0.8 std
       }
   }
   ```
3. Re-export the static baseline assets:
   ```bash
   python integrations/service/body_shape_service.py --export
   node build.js
   ```

---

## 5. Dependencies and Runtime Requirements

- **Python:** Python 3.8+ (tested and verified with Python 3.12).
- **Python Libraries:**
  - `numpy` (tested with 2.5.1)
  - `scipy` (tested with 1.18.0)
- **Node.js:** Node.js 18+ (tested with Node 22).
- **Browser:** Any modern browser supporting WebGL 2.0 (Chrome, Edge, Firefox, Safari).

---

## 6. Troubleshooting Common Issues

### Issue 1: Port 5005 is already in use
```bash
python integrations/service/body_shape_service.py --serve --port 5006
```
Then update the proxy URL in `server.mjs` if a non-standard port is used.

### Issue 2: Changes in `public/` are not appearing in `dist/`
Run:
```bash
node build.js
```
VitaWise uses `build.js` to copy public assets into production distribution.

### Issue 3: Python throws `DeprecationWarning: Setting the shape on a NumPy array`
This is an informational warning in newer NumPy 2.x versions and does not affect the correctness of the synthesized 3D mesh.

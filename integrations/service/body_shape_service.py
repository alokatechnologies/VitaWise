#!/usr/bin/env python3
"""
VitaWise 3D Human Body Model Service & Integration Adapter
Integrates: https://github.com/zengyh1900/3D-Human-Body-Shape.git

Provides:
1. Direct Python wrapper around the original 3D-Human-Body-Shape deformation & mapping engine.
2. Coordinate system transformer (converts model Z-up to Web 3D / Babylon.js Y-up).
3. Preset and anthropometric parameter synthesizer.
4. Lightweight zero-dependency HTTP API service (built-in http.server).
5. Offline / precomputed asset generator for instant client-side performance.
"""

import os
import sys
import json
import time
import argparse
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# Resolve paths to the cloned repository
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, "..", ".."))
INTEGRATION_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))
REPO_DIR = os.path.join(INTEGRATION_ROOT, "3D-Human-Body-Shape")
SRC_DIR = os.path.join(REPO_DIR, "src")
MODEL_DIR = os.path.join(REPO_DIR, "release_model")
GENERATED_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "body-wise-3d", "generated")

sys.path.insert(0, SRC_DIR)
import utils
utils.MODEL_DIR = MODEL_DIR

import numpy as np
import scipy.sparse
import scipy.sparse.linalg

# Anthropometric Parameter Names in 3D-Human-Body-Shape
# 0: weight, 1: height, 2: neck, 3: chest, 4: belly button waist, 5: gluteal hip,
# 6: neck-shoulder-elbow-wrist, 7: crotch-knee-floor, 8: across-back-shoulder-neck,
# 9: neck-to-gluteal-hip, 10: natural-waist, 11: max-hip, 12: natural-waist-rise,
# 13: shoulder-to-midhand, 14: upper-arm, 15: wrist, 16: outer-natural-waist-to-floor,
# 17: knee, 18: max-thigh

PRESET_DEFINITIONS = {
    "lean": {
        "displayName": "Lean",
        "description": "Streamlined, lighter athletic build with reduced core and hip volume",
        "params": {
            0: -1.6,   # weight
            4: -1.4,   # belly button waist
            5: -1.2,   # gluteal hip
            10: -1.3,  # natural waist
            11: -1.2,  # max hip
            14: -0.9,  # upper arm
            18: -1.1   # max thigh
        }
    },
    "balanced": {
        "displayName": "Balanced",
        "description": "Statistical neutral human baseline from the anthropometric body dataset",
        "params": {}  # all standard deviations = 0
    },
    "athletic": {
        "displayName": "Athletic",
        "description": "V-taper athletic build with broader chest, shoulders and lean waist",
        "params": {
            0: 0.3,    # weight
            3: 1.6,    # chest
            8: 1.5,    # across back shoulder neck
            10: -0.8,  # natural waist
            4: -0.6,   # belly button waist
            14: 1.8,   # upper arm
            18: 0.9    # max thigh
        }
    },
    "broad": {
        "displayName": "Broad",
        "description": "Sturdy frame with wide shoulders, solid chest and tall stature",
        "params": {
            1: 0.8,    # height
            2: 1.2,    # neck
            3: 1.7,    # chest
            8: 2.2,    # across back shoulder neck
            14: 1.4,   # upper arm
            18: 0.7    # max thigh
        }
    },
    "fuller": {
        "displayName": "Fuller",
        "description": "Full-figured build with increased core, waist, hip and thigh volume",
        "params": {
            0: 2.2,    # weight
            3: 1.2,    # chest
            4: 2.0,    # belly button waist
            5: 1.8,    # gluteal hip
            10: 1.7,   # natural waist
            11: 1.9,   # max hip
            14: 1.1,   # upper arm
            18: 1.6    # max thigh
        }
    }
}


class ReshaperEngine:
    """Core integration wrapper for the 3D-Human-Body-Shape model repository."""

    def __init__(self):
        print("[ReshaperEngine] Initializing 3D-Human-Body-Shape models from:", MODEL_DIR)
        self.facets = np.load(open(os.path.join(MODEL_DIR, "facets.npy"), "rb"))
        self.normals = np.load(open(os.path.join(MODEL_DIR, "normals.npy"), "rb"))
        
        self.models = {}
        for gender in ["female", "male"]:
            print(f"[ReshaperEngine] Loading {gender} deformation matrices & LU factorization...")
            m2d = np.load(open(os.path.join(MODEL_DIR, f"{gender}_m2d.npy"), "rb"))
            d_basis = np.load(open(os.path.join(MODEL_DIR, f"{gender}_d_basis.npy"), "rb"))
            mean_deform = np.load(open(os.path.join(MODEL_DIR, f"{gender}_mean_deform.npy"), "rb"))
            std_deform = np.load(open(os.path.join(MODEL_DIR, f"{gender}_std_deform.npy"), "rb"))
            mean_measure = np.load(open(os.path.join(MODEL_DIR, f"{gender}_mean_measure.npy"), "rb"))
            std_measure = np.load(open(os.path.join(MODEL_DIR, f"{gender}_std_measure.npy"), "rb"))
            mean_vertex = np.load(open(os.path.join(MODEL_DIR, f"{gender}_mean_vertex.npy"), "rb"))

            d2v_loader = np.load(os.path.join(MODEL_DIR, f"{gender}_d2v.npz"))
            d2v = scipy.sparse.coo_matrix(
                (d2v_loader['data'], (d2v_loader['row'], d2v_loader['col'])),
                shape=d2v_loader['shape']
            )
            # Factorize sparse matrix A = d2v.T * d2v for high-speed linear solving
            lu = scipy.sparse.linalg.splu(d2v.transpose().dot(d2v).tocsc())

            self.models[gender] = {
                "m2d": m2d,
                "d_basis": d_basis,
                "mean_deform": mean_deform,
                "std_deform": std_deform,
                "mean_measure": mean_measure,
                "std_measure": std_measure,
                "mean_vertex": mean_vertex,
                "d2v": d2v,
                "lu": lu
            }
        print("[ReshaperEngine] All models initialized successfully and cached in memory!")

    def synthesize(self, gender="female", params_dict=None, flag=0, target_height_cm=None):
        """
        Synthesizes 3D mesh vertices from anthropometric deviation parameters.
        Returns:
            vertices: (12500, 3) in Babylon.js coordinates (Y-up, feet at ground y=0)
            facets: (25000, 3) 0-indexed triangle face indices
            normals: (12500, 3) vertex normal vectors
            bounds: min and max bounding coordinates
            metadata: height, width, depth, and volume metrics
        """
        gender = str(gender).lower()
        if gender not in self.models:
            gender = "female"
        m = self.models[gender]

        # Assemble the 19 standard-deviation weight vector
        weight = np.zeros((utils.M_NUM, 1), dtype=np.float64)
        if params_dict:
            for k, val in params_dict.items():
                try:
                    idx = int(k)
                    if 0 <= idx < utils.M_NUM:
                        weight[idx, 0] = float(val)
                except (ValueError, TypeError):
                    pass

        # Global mapping deformation synthesis
        w_m2d = m["m2d"].dot(weight)
        d = np.matmul(m["d_basis"], w_m2d)
        d = d.reshape((utils.F_NUM, 9))
        d *= m["std_deform"]
        d += m["mean_deform"]
        d = d.reshape((utils.F_NUM * 9, 1))

        Atd = m["d2v"].transpose().dot(d)
        raw_x = m["lu"].solve(Atd)
        v = raw_x[:utils.V_NUM * 3].reshape((utils.V_NUM, 3))

        # In the SPRING dataset, the subject is scanned diagonally in the XY plane.
        # Align the coronal plane (shoulder-to-shoulder / arm-to-arm lateral axis) to the X axis.
        xy = v[:, :2] - v[:, :2].mean(axis=0)
        cov = np.cov(xy.T)
        _, eigvecs = np.linalg.eigh(cov)
        lat_axis = eigvecs[:, 1]
        theta = -np.arctan2(lat_axis[1], lat_axis[0])
        R = np.array([[np.cos(theta), -np.sin(theta)], [np.sin(theta), np.cos(theta)]])
        rot_xy = xy.dot(R.T)

        # Check face direction: face should point towards +depth (+Z)
        face_idx = (v[:, 2] > (v[:, 2].max() - 0.15))
        if rot_xy[face_idx, 1].mean() < 0:
            R = -R
            rot_xy = xy.dot(R.T)

        # Web coordinates:
        # X: lateral left-to-right (centered at 0)
        # Y: vertical height from ground (bottom of feet at y = 0.0)
        # Z: depth (front faces +Z towards camera)
        web_x = rot_xy[:, 0].copy()
        web_y = v[:, 2] - v[:, 2].min()
        web_z = rot_xy[:, 1].copy()

        # Ensure exact centering of lateral X and depth Z around origin (0, 0)
        web_x -= (web_x.min() + web_x.max()) / 2.0
        web_z -= (web_z.min() + web_z.max()) / 2.0

        web_vertices = np.column_stack((web_x, web_y, web_z))

        # Exact height calibration if target_height_cm is specified (>0)
        if target_height_cm and float(target_height_cm) > 0:
            current_h = float((web_vertices[:, 1].max() - web_vertices[:, 1].min()) * 100.0)
            target_h = float(target_height_cm)
            if current_h > 0:
                scale_y = target_h / current_h
                web_vertices[:, 1] *= scale_y

        # Recompute accurate smooth vertex normals for Babylon PBR lighting
        facets_0idx = (self.facets - 1).astype(np.int32)
        normals = self._compute_smooth_normals(web_vertices, facets_0idx)

        # Calculate bounding metrics
        min_pt = web_vertices.min(axis=0)
        max_pt = web_vertices.max(axis=0)
        height_cm = float((max_pt[1] - min_pt[1]) * 100.0)
        width_cm = float((max_pt[0] - min_pt[0]) * 100.0)
        depth_cm = float((max_pt[2] - min_pt[2]) * 100.0)

        return {
            "vertices": web_vertices,
            "facets": facets_0idx,
            "normals": normals,
            "bounds": {
                "min": [float(x) for x in min_pt],
                "max": [float(x) for x in max_pt]
            },
            "metrics": {
                "heightCm": round(height_cm, 1),
                "widthCm": round(width_cm, 1),
                "depthCm": round(depth_cm, 1),
                "gender": gender,
                "vertexCount": utils.V_NUM,
                "faceCount": utils.F_NUM
            }
        }

    def _compute_smooth_normals(self, vertices, facets):
        """Computes area-weighted smooth vertex normals."""
        v0 = vertices[facets[:, 0]]
        v1 = vertices[facets[:, 1]]
        v2 = vertices[facets[:, 2]]
        face_normals = np.cross(v1 - v0, v2 - v0)
        
        vertex_normals = np.zeros_like(vertices)
        for i in range(3):
            np.add.at(vertex_normals, facets[:, i], face_normals)

        norms = np.linalg.norm(vertex_normals, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return vertex_normals / norms

    def measurements_to_params(self, gender="female", height_cm=None, weight_kg=None, preset_name="balanced"):
        """Translates user height (cm) and weight (kg) into anthropometric deviation parameters."""
        gender = str(gender).lower()
        if gender not in self.models:
            gender = "female"
        m = self.models[gender]

        params = {}
        # Start from base preset if available
        if preset_name in PRESET_DEFINITIONS:
            params.update(PRESET_DEFINITIONS[preset_name]["params"])

        # Override height if provided
        if height_cm and float(height_cm) > 0:
            height_mm = float(height_cm) * 10.0
            height_std = (height_mm - m["mean_measure"][1, 0]) / m["std_measure"][1, 0]
            params[1] = float(np.clip(height_std, -3.5, 3.5))

        # Override weight if provided
        if weight_kg and float(weight_kg) > 0:
            weight_vol = (float(weight_kg) ** (1.0 / 3.0)) * 1000.0
            weight_std = (weight_vol - m["mean_measure"][0, 0]) / m["std_measure"][0, 0]
            params[0] = float(np.clip(weight_std, -3.5, 3.5))

        return params

    def export_all_preset_assets(self, target_dir=GENERATED_DIR):
        """Generates static JSON and OBJ assets for all 5 presets x 2 genders."""
        os.makedirs(target_dir, exist_ok=True)
        print(f"[ReshaperEngine] Exporting pre-synthesized preset models to: {target_dir}")

        manifest = {
            "version": "1.0.0",
            "source": "https://github.com/zengyh1900/3D-Human-Body-Shape.git",
            "presets": list(PRESET_DEFINITIONS.keys()),
            "genders": ["female", "male"],
            "models": {}
        }

        for gender in ["female", "male"]:
            for preset_key, preset_data in PRESET_DEFINITIONS.items():
                print(f" -> Synthesizing {gender} - {preset_key} ({preset_data['displayName']})...")
                res = self.synthesize(gender=gender, params_dict=preset_data["params"])

                # Save JSON format for ultra-fast direct buffer loading
                model_id = f"{gender}_{preset_key}"
                json_filename = f"{model_id}.json"
                json_path = os.path.join(target_dir, json_filename)
                
                # Flatten vertex and normal arrays for high-performance Float32 loading in JS
                positions_flat = [round(float(n), 4) for n in res["vertices"].flatten()]
                normals_flat = [round(float(n), 4) for n in res["normals"].flatten()]
                indices_flat = [int(n) for n in res["facets"].flatten()]

                export_payload = {
                    "id": model_id,
                    "gender": gender,
                    "preset": preset_key,
                    "displayName": preset_data["displayName"],
                    "description": preset_data["description"],
                    "positions": positions_flat,
                    "normals": normals_flat,
                    "indices": indices_flat,
                    "bounds": res["bounds"],
                    "metrics": res["metrics"],
                    "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ")
                }

                with open(json_path, "w", encoding="utf-8") as f:
                    json.dump(export_payload, f)

                # Save OBJ format as universal fallback
                obj_filename = f"{model_id}.obj"
                obj_path = os.path.join(target_dir, obj_filename)
                self._save_obj(obj_path, res["vertices"], res["facets"])

                manifest["models"][model_id] = {
                    "json": f"./assets/body-wise-3d/generated/{json_filename}",
                    "obj": f"./assets/body-wise-3d/generated/{obj_filename}",
                    "metrics": res["metrics"]
                }

        manifest_path = os.path.join(target_dir, "manifest.json")
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)

        print(f"[ReshaperEngine] Successfully exported 10 models + manifest to {target_dir}")
        return manifest

    def _save_obj(self, filename, vertices, facets):
        with open(filename, "w", encoding="utf-8") as f:
            f.write("# VitaWise 3D Human Body Model\n")
            f.write("# Generated from zengyh1900/3D-Human-Body-Shape anthropometric model\n")
            for v in vertices:
                f.write(f"v {v[0]:.4f} {v[1]:.4f} {v[2]:.4f}\n")
            for face in facets:
                f.write(f"f {face[0]+1} {face[1]+1} {face[2]+1}\n")


# Global engine instance
_ENGINE = None

def get_engine():
    global _ENGINE
    if _ENGINE is None:
        _ENGINE = ReshaperEngine()
    return _ENGINE


class BodyModelHttpHandler(BaseHTTPRequestHandler):
    """Zero-dependency HTTP handler for real-time 3D body shape synthesis."""

    def _set_headers(self, status=200, content_type="application/json"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(204)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path == "/health" or path == "/api/v1/body-model/health":
            self._set_headers(200)
            self.wfile.write(json.dumps({
                "status": "ok",
                "service": "VitaWise 3D-Human-Body-Shape Model Service",
                "repository": "https://github.com/zengyh1900/3D-Human-Body-Shape.git",
                "python": sys.version,
                "engineReady": True
            }).encode("utf-8"))
            return

        if path == "/api/v1/body-model/presets":
            self._set_headers(200)
            self.wfile.write(json.dumps({
                "status": "ok",
                "presets": PRESET_DEFINITIONS
            }).encode("utf-8"))
            return

        if path == "/api/v1/body-model/mesh":
            gender = query.get("gender", ["female"])[0]
            build = query.get("build", ["balanced"])[0]
            engine = get_engine()
            params = engine.measurements_to_params(gender=gender, preset_name=build)
            res = engine.synthesize(gender=gender, params_dict=params)

            fmt = query.get("format", ["json"])[0]
            if fmt == "obj":
                self._set_headers(200, "text/plain")
                lines = ["# VitaWise 3D Human Body Model\n"]
                for v in res["vertices"]:
                    lines.append(f"v {v[0]:.4f} {v[1]:.4f} {v[2]:.4f}\n")
                for f in res["facets"]:
                    lines.append(f"f {f[0]+1} {f[1]+1} {f[2]+1}\n")
                self.wfile.write("".join(lines).encode("utf-8"))
            else:
                self._set_headers(200)
                payload = {
                    "status": "ok",
                    "id": f"{gender}_{build}",
                    "gender": gender,
                    "preset": build,
                    "positions": [round(float(n), 4) for n in res["vertices"].flatten()],
                    "normals": [round(float(n), 4) for n in res["normals"].flatten()],
                    "indices": [int(n) for n in res["facets"].flatten()],
                    "bounds": res["bounds"],
                    "metrics": res["metrics"]
                }
                self.wfile.write(json.dumps(payload).encode("utf-8"))
            return

        self._set_headers(404)
        self.wfile.write(json.dumps({"error": "Endpoint not found"}).encode("utf-8"))

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/v1/body-model/synthesize":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(length).decode("utf-8")) if length > 0 else {}
            except Exception as e:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid JSON body", "details": str(e)}).encode("utf-8"))
                return

            gender = body.get("gender", "female")
            build = body.get("build", "balanced")
            height_cm = body.get("heightCm")
            weight_kg = body.get("weightKg")
            custom_params = body.get("params", {})

            engine = get_engine()
            merged_params = engine.measurements_to_params(
                gender=gender,
                height_cm=height_cm,
                weight_kg=weight_kg,
                preset_name=build
            )
            # Add any user fine-tuning slider overrides
            if isinstance(custom_params, dict):
                for k, v in custom_params.items():
                    merged_params[k] = v

            start_t = time.time()
            res = engine.synthesize(gender=gender, params_dict=merged_params, target_height_cm=height_cm)
            duration_ms = round((time.time() - start_t) * 1000.0, 1)

            self._set_headers(200)
            payload = {
                "status": "ok",
                "id": f"{gender}_{build}",
                "gender": gender,
                "preset": build,
                "inferenceMs": duration_ms,
                "positions": [round(float(n), 4) for n in res["vertices"].flatten()],
                "normals": [round(float(n), 4) for n in res["normals"].flatten()],
                "indices": [int(n) for n in res["facets"].flatten()],
                "bounds": res["bounds"],
                "metrics": res["metrics"]
            }
            self.wfile.write(json.dumps(payload).encode("utf-8"))
            return

        self._set_headers(404)
        self.wfile.write(json.dumps({"error": "Endpoint not found"}).encode("utf-8"))

    def log_message(self, format, *args):
        # Clean logging
        sys.stderr.write(f"[BodyModelService] {self.address_string()} - {format % args}\n")


def run_service(host="0.0.0.0", port=5005):
    engine = get_engine()
    server_address = (host, port)
    httpd = HTTPServer(server_address, BodyModelHttpHandler)
    print(f"\n========================================================")
    print(f" VitaWise 3D Human Body Model Service Operational")
    print(f" URL: http://{host if host != '0.0.0.0' else '127.0.0.1'}:{port}")
    print(f" Source: zengyh1900/3D-Human-Body-Shape")
    print(f" Endpoints:")
    print(f"   GET  /health")
    print(f"   GET  /api/v1/body-model/presets")
    print(f"   GET  /api/v1/body-model/mesh?gender=female&build=balanced")
    print(f"   POST /api/v1/body-model/synthesize")
    print(f"========================================================\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[BodyModelService] Shutting down cleanly...")
        httpd.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="VitaWise 3D Human Body Model Service")
    parser.add_argument("--export", action="store_true", help="Pre-synthesize all preset assets into public folder")
    parser.add_argument("--serve", action="store_true", help="Run HTTP model service")
    parser.add_argument("--port", type=int, default=5005, help="HTTP server port (default: 5005)")
    parser.add_argument("--both", action="store_true", help="Pre-synthesize assets AND start HTTP service")
    args = parser.parse_args()

    engine = get_engine()

    if args.export or args.both or len(sys.argv) == 1:
        engine.export_all_preset_assets()

    if args.serve or args.both:
        run_service(port=args.port)

# BODY WISE 3D human asset

Place approved realistic, fully rigged wellness-suit GLB/GLTF assets here using the names in
`public/js/body-wise-build-registry.js`:

- `lean.glb`
- `balanced.glb`
- `athletic.glb`
- `broad.glb`
- `fuller.glb`

The registry is the source of truth for future gender-specific variants and optional animation assets.

The application intentionally does not generate a primitive or placeholder GLB. Stage 1 also has a clearly identified procedural human source in `public/js/body-wise-human-generator.js`; the approved GLB/GLTF pipeline remains available for future reviewed assets and will only be used when a registry entry selects it.

Expected pipeline:

- realistic full-body human proportions
- PBR materials and studio-ready textures
- neutral fitted wellness suit
- optional idle animation group
- semantic mesh metadata such as `bodyWiseRegion: "heart"` where region highlighting is supported

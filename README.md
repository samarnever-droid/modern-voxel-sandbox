# FRONTLINE: ZERO HOUR

A moddable, WebGPU-first voxel sandbox set in a post-collapse near-future. **The world is your frontline:** light a *Frontline Beacon*, claim land, restore it, fortify it and push outward.

* **Engine** – custom TypeScript engine on raw WebGPU (no scene-graph library: voxel rendering wants its own mesh format, texture arrays and one-draw-per-chunk submission). A **WebGL2 fallback renderer** shares the exact mesh/atlas data, so the game still runs without WebGPU.
* **Rendering** – PBR-lite materials per texture layer (roughness/metal/emissive), cascaded sun shadows (1–2 cascades), procedural sky with sun/moon/stars/clouds, aerial-perspective + height fog, animated water with Fresnel/sun glints, wet-surface rain response, bloom, volumetric light shafts (Ultra), ACES tone-mapping, vignette/chromatic aberration/grain, per-vertex AO + smooth voxel light (sun + block light), greedy meshing, frustum culling, distance LOD, time-sliced chunk streaming.
* **World** – 10 environments (metropolis, suburbs, industrial, forest, plains, desert, snow, mountains, anomaly zone, + underground labs/bunkers/subway). Deterministic per-chunk generation with designed structures: skyscrapers, garages, markets, houses, factories, silos, cooling towers, substations, hangars, radar domes, comm spires, monolith arrays, sublevel labs, sealed bunkers, subway stations.
* **Content** – 253 hand-parameterised blocks in 16 categories (see `src/content`), 50 additional items (materials, tools, weapons, gadgets, food, equipment), 230+ recipes, a 17-node research tree, 14 sandbox challenges, lore terminals.
* **Gameplay** – Survival / Creative / Exploration / Sandbox Challenges. Tech tiers via Workbench → Smelter → Fabricator → Research Station → Foundry. Power grids (solar, wind, combustion, fusion, batteries, switches), automated drills into crates, turrets, arc coils, charging pads, **Frontline Beacons** (claim radius, suppress machines, restore dead land, respawn), Custodian machines (scrapper / sentinel / warden), world events (supply drops, sweeps, power surges, signal anomalies), dynamic weather.
* **Equipment** – tool tiers (Salvage Cutter → Pulse Cutter → Arc Driver → Plasma Excavator → Quantum Disruptor), energy weapons, Survey Scanner, Tether Hook, Shield Projector, Recon Drone, Thruster Pack, Nano Repair Tool, Blueprint Builder, Terraformer.
* **Audio** – entirely synthesised: spatial SFX, material-specific footsteps/mining/breaking, ambience beds, generative score with six moods (explore, city, underground, night, discovery, combat).
* **Modding** – JSON data packs + sandboxed Lua, dependency/version checks, in-game manager, examples, docs: [`docs/MOD_SDK.md`](docs/MOD_SDK.md).
* **Saves** – IndexedDB (modified chunks RLE-compressed, palette-remapped so mods can come and go).

## Controls
WASD move · Space jump (double-tap = fly in Creative) · Shift sneak · Ctrl sprint · LMB mine/attack · RMB place/use · MMB pick (Creative) · 1-9/wheel hotbar · E inventory & crafting · F scan · V third person · T console (`/help`) · Q drop · F3 FPS. All keys are rebindable in Settings.

## Develop
```
npm install
npm run dev       # vite dev server
npm run build     # production build (single-file dist/index.html)
npm test          # vitest: registry, worldgen, lighting, meshing, WGSL parse, headless gameplay, mods, UI boot
```

## Architecture
```
src/engine    math, noise, registry (data-driven blocks/items/recipes/…), procedural texture painters
src/content   block/item/research/challenge definitions (same API mods use)
src/world     chunk store, incremental lighting, greedy mesher, generator, structures
src/render    WGSL shaders, WebGPU renderer, WebGL2 fallback, quality presets
src/game      Game (player, interaction, streaming), Sim (machines, power, weather, events), dynamic geometry
src/audio     synthesised audio engine + generative music
src/save      IndexedDB persistence
src/mods      loader (manifest/deps/semver), sandboxed Lua runtime, example mods
src/ui        React HUD, menus, inventory/crafting/research, settings, mod manager
```
Multiplayer is **not** implemented. The architecture keeps simulation (`Game`/`Sim`/`World`) free of DOM and renderer dependencies — they run headless in the test-suite — so a deterministic server/client split can be added without a rewrite.

## Recent improvements
- **Ladders rebuilt**: real rails + rungs, attach to the clicked wall (placement bug fixed), click to extend, forgiving selection box, climb with W/Space, S to descend, Shift to hold, hop over the top, pop off when the wall is removed. New hand-craftable Timber Ladder.
- **Machines redesigned**: jointed rigs with bending legs, spinning rotors, glowing eyes, attack wind-ups, health bars, shadows, death debris. New third-person avatar and first-person arm/tool models.
- **Learn-to-play**: Minecraft-style main menu (Quick Start, world list, mode cards), step-by-step Guide tracker (G), full manual (H / F1), contextual hints, loading-screen tips.
- **HUD/graphics**: pixel hearts & food, hit marker, wireframe block outline, fixed a texture bug that produced black specks on grass.

import { P } from '../engine/textures';
import { B, C, hand, wb, family, sm } from './helpers';

/** Terrain, vegetation, construction, industrial, roads. */
export function registerWorldBlocks() {
  // ------------------------------------------------------------ TERRAIN & NATURAL
  B('bedrock', 'Bedrock', C.terr, P.noise('#16181c', '#2b2e35', 0.9, 4), { unbreakable: true, hard: -1, map: '#1a1c20' });
  B('stone', 'Stone', C.terr, P.stone('#7c8087', '#5e6269', '#9aa0a8'), { hard: 3, map: '#7c8087', desc: 'Dense bedrock layer.' });
  B('dirt', 'Dirt', C.terr, P.dirt('#6b4a32', '#4e3424'), { hard: 0.7, snd: 'dirt', map: '#6b4a32' });
  B('grass', 'Grass Block', C.terr, { top: P.grassTop('#4f8a3a', '#6aa84a'), side: P.grassSide('#58943f', '#6b4a32'), bottom: P.dirt('#6b4a32', '#4e3424') }, { hard: 0.8, snd: 'grass', drop: 'dirt', map: '#58943f' });
  B('dead_grass', 'Dead Grass', C.terr, { top: P.grassTop('#7d7a4a', '#9a9357'), side: P.grassSide('#847f4e', '#5d4630'), bottom: P.dirt('#5d4630', '#443224') }, { hard: 0.8, snd: 'grass', drop: 'dirt', map: '#847f4e', desc: 'Lifeless turf. Frontline beacons can restore it.' });
  B('sand', 'Sand', C.terr, P.sand('#d9c58f', '#c4ae74'), { hard: 0.6, snd: 'sand', map: '#d9c58f' });
  B('sandstone', 'Sandstone', C.terr, P.noiseBars('#cdb77c', '#b79f62'), { hard: 2, snd: 'sand', map: '#c4ad70' });
  B('red_sandstone', 'Red Sandstone', C.terr, P.noiseBars('#b5683c', '#98502c'), { hard: 2, snd: 'sand', map: '#b0623a' });
  B('snow', 'Snow Block', C.terr, P.snow('#f2f6fa'), { hard: 0.5, snd: 'snow', map: '#eef3f8' });
  B('permafrost', 'Permafrost', C.terr, P.dirt('#7d8a94', '#5f6b75', 0.15), { hard: 1.5, snd: 'gravel', map: '#76828c' });
  B('ice', 'Glacial Ice', C.terr, P.ice('#a8d8f0', '#7fbce0'), { hard: 0.8, snd: 'glass', render: 'glass', rough: 0.08, opacity: 1, map: '#8ac4e6' });
  B('gravel', 'Gravel', C.terr, P.gravel('#8a8782', '#b0ada6'), { hard: 0.7, snd: 'gravel', map: '#8a8782' });
  B('shale', 'Clay Shale', C.terr, P.noise('#8a5a46', '#a8705a', 0.6, 8), { hard: 1.2, snd: 'dirt', map: '#8a5a46' });
  B('basalt', 'Basalt', C.terr, P.stone('#3b3e45', '#2a2c32', '#565a63'), { hard: 4.5, tier: 1, map: '#3b3e45', rough: 0.7 });
  B('granite', 'Granite', C.terr, P.speckle('#9a7a74', '#6f5650', '#c8b0a8', 0.2), { hard: 4, tier: 1, map: '#9a7a74', rough: 0.55 });
  B('mud', 'Mud', C.terr, P.noise('#4a3626', '#5c4630', 0.5, 4), { hard: 0.6, snd: 'dirt', map: '#4a3626', rough: 0.4 });
  B('ash', 'Ashfall', C.terr, P.noise('#4a4a4e', '#6a6a70', 0.8, 4), { hard: 0.5, snd: 'sand', map: '#55555a', desc: 'Grey residue of the Zero Hour event.' });
  B('moss_stone', 'Moss-Covered Stone', C.terr, P.ore('#6e7a68', '#4e5c48', '#5f8a45', 0), { hard: 3, map: '#6e7a68' });
  B('water', 'Water', C.terr, P.water('#2f6fa8', '#4a8cc4'), { shape: 'liquid', render: 'water', rough: 0.02, solid: false, unbreakable: true, hard: -1, snd: 'water', map: '#2f6fa8', opacity: 2 });
  B('copper_ore', 'Copper Ore', C.terr, P.ore('#7c8087', '#5e6269', '#c8794a'), { hard: 4, tier: 0, drop: 'raw_copper', dropN: [1, 3], map: '#a87050' });
  B('ferrite_ore', 'Ferrite Ore', C.terr, P.ore('#7c8087', '#5e6269', '#b8a090'), { hard: 5, tier: 0, drop: 'raw_iron', dropN: [1, 2], map: '#a09084' });
  B('carbon_seam', 'Carbon Seam', C.terr, P.ore('#6a6e75', '#4e5258', '#16171a'), { hard: 3.5, drop: 'carbon', dropN: [1, 3], map: '#2a2c30' });
  B('bauxite_ore', 'Bauxite Ore', C.terr, P.ore('#7c8087', '#5e6269', '#c25a40'), { hard: 5, tier: 1, drop: 'raw_bauxite', dropN: [1, 2], map: '#a85a46' });
  B('titanite_ore', 'Titanite Ore', C.terr, P.ore('#5e6269', '#464a52', '#7ab0d8'), { hard: 8, tier: 2, drop: 'raw_titanite', map: '#6a94b8', metal: 0.4 });
  B('lithium_ore', 'Lithium Ore', C.terr, P.ore('#7c8087', '#5e6269', '#d8dce8'), { hard: 6, tier: 0, drop: 'lithium', dropN: [1, 2], map: '#c0c4d0' });
  B('zerite_ore', 'Zerite Ore', C.terr, P.ore('#3b3e45', '#2a2c32', '#4ff0d0', 1), { hard: 12, tier: 3, drop: 'zerite_shard', dropN: [1, 2], emit: 8, glow: 1.6, map: '#3fd8c0', desc: 'Faintly humming crystal found only deep underground.' });
  B('oil_shale', 'Oil Shale', C.terr, P.noise('#2e2c2a', '#4a4540', 0.7, 4), { hard: 3, map: '#3a3633', snd: 'stone' });

  // ------------------------------------------------------------ VEGETATION & LANDSCAPING
  B('timber_log', 'Timber Log', C.veg, { side: P.logSide('#6b4a2c', '#4a3220'), top: P.logTop('#b58a54', '#6b4a2c') }, { hard: 2, snd: 'wood', map: '#6b4a2c' });
  B('pine_log', 'Pine Log', C.veg, { side: P.logSide('#4a3a2e', '#2e231b'), top: P.logTop('#c49a68', '#4a3a2e') }, { hard: 2, snd: 'wood', map: '#4a3a2e' });
  B('leaves', 'Leaves', C.veg, P.leaves('#2e6a2a', '#4a9a3c', 0.22), { render: 'cutout', hard: 0.3, snd: 'grass', drop: null, sway: true, map: '#3a7e32' });
  B('pine_needles', 'Pine Needles', C.veg, P.leaves('#1f4a34', '#2f6a48', 0.2), { render: 'cutout', hard: 0.3, snd: 'grass', drop: null, sway: true, map: '#245238' });
  B('timber_planks', 'Timber Planks', C.con, P.planks('#b58a54', '#9a7240'), { hard: 1.6, snd: 'wood', craft: hand({ timber_log: 1 }, 4), map: '#a87e4c' });
  B('tall_grass', 'Tall Grass', C.veg, P.plant('tall', '#5a9a3e', '#78b84e'), { shape: 'cross', render: 'cutout', hard: 0.05, snd: 'grass', drop: null, sway: true, map: '#5a9a3e' });
  B('dry_grass', 'Dry Grass', C.veg, P.plant('tuft', '#a89a52', '#c4b468'), { shape: 'cross', render: 'cutout', hard: 0.05, snd: 'grass', drop: null, sway: true, map: '#a89a52' });
  B('fern', 'Fern', C.veg, P.plant('fern', '#2f7a3a', '#4a9a4c'), { shape: 'cross', render: 'cutout', hard: 0.05, snd: 'grass', drop: null, sway: true, map: '#2f7a3a' });
  B('wildflower_red', 'Red Wildflower', C.veg, P.plant('flower', '#4a8a36', '#d8403a', '#ffd040'), { shape: 'cross', render: 'cutout', hard: 0.05, snd: 'grass', sway: true, map: '#d8403a' });
  B('wildflower_blue', 'Blue Wildflower', C.veg, P.plant('flower', '#4a8a36', '#4a78e0', '#f0f0f8'), { shape: 'cross', render: 'cutout', hard: 0.05, snd: 'grass', sway: true, map: '#4a78e0' });
  B('berry_bush', 'Berry Bush', C.veg, P.plant('bush', '#2f6a30', '#3f8a3c', '#d8304a'), { shape: 'cross', render: 'cutout', hard: 0.1, snd: 'grass', drop: 'wild_berries', dropN: [1, 3], sway: true, map: '#3f8a3c' });
  B('glow_cap', 'Glowcap Mushroom', C.veg, P.plant('mushroom', '#30e0c8', '#a0fff0', '#d8e0d0'), { shape: 'cross', render: 'cutout', hard: 0.1, snd: 'grass', emit: 9, glow: 1.4, map: '#30e0c8' });
  B('cactus', 'Desert Cactus', C.veg, P.plant('cactus', '#3f8a46', '#1e5a2c', '#e8d860'), { shape: 'cross', render: 'cutout', hard: 0.3, snd: 'grass', map: '#3f8a46' });
  B('reed', 'Marsh Reed', C.veg, P.plant('reed', '#5a8a3a', '#6a4a30'), { shape: 'cross', render: 'cutout', hard: 0.05, snd: 'grass', drop: null, sway: true, map: '#5a8a3a' });
  B('vine_curtain', 'Hanging Vines', C.veg, P.plant('vine', '#3a7a34', '#68a848'), { shape: 'cross', render: 'cutout', hard: 0.05, snd: 'grass', drop: null, sway: true, climb: true, map: '#3a7a34' });
  B('sapling', 'Sapling', C.veg, P.plant('sapling', '#3f8a38', '#58aa4a', '#6b4a2c'), { shape: 'cross', render: 'cutout', hard: 0.05, snd: 'grass', map: '#3f8a38' });
  B('dead_bush', 'Dead Shrub', C.veg, P.plant('tuft', '#6a5a3a', '#7e6a44'), { shape: 'cross', render: 'cutout', hard: 0.05, snd: 'grass', drop: null, map: '#6a5a3a' });
  B('hedge', 'Trimmed Hedge', C.veg, P.leaves('#1f5a2a', '#2f7a38', 0.08), { render: 'cutout', hard: 0.5, snd: 'grass', map: '#27682f' });
  B('lawn', 'Manicured Lawn', C.veg, { top: P.grassTop('#5ca046', '#74b858'), side: P.grassSide('#66ac4c', '#6b4a32'), bottom: P.dirt('#6b4a32', '#4e3424') }, { hard: 0.8, snd: 'grass', drop: 'dirt', map: '#66ac4c' });
  B('planter_box', 'Planter Box', C.veg, { top: P.dirt('#4a3626', '#33261a'), side: P.planks('#8a6a44', '#74562f') }, { shape: 'custom', boxes: [{ b: [0.05, 0, 0.05, 0.95, 0.6, 0.95] }], hard: 1, snd: 'wood', craft: hand({ timber_planks: 3, dirt: 1 }), map: '#8a6a44' });
  B('crop_row', 'Hydro Crop Row', C.veg, P.plant('crop', '#4a9a3a', '#e8c840'), { shape: 'cross', render: 'cutout', hard: 0.05, snd: 'grass', drop: 'wild_berries', sway: true, map: '#4a9a3a' });

  // ------------------------------------------------------------ CONSTRUCTION MATERIALS
  B('brick', 'Brick', C.con, P.bricks('#9a4a38', '#c4b8a8'), { hard: 3, craft: wb({ shale: 2, sand: 1 }, 4), map: '#9a4a38' });
  family('brick', 'Brick', C.con, P.bricks('#9a4a38', '#c4b8a8'), { hard: 3, map: '#9a4a38' });
  B('cinder_block', 'Cinder Block', C.con, P.concrete('#8c8e90', '#6f7173', 1), { hard: 3, craft: wb({ stone: 2, gravel: 1 }, 4), map: '#8c8e90' });
  B('stucco', 'Stucco Wall', C.con, P.noise('#d8cdb6', '#c8bca2', 0.6, 4), { hard: 2, craft: wb({ sand: 2, stone: 1 }, 4), map: '#d8cdb6' });
  B('vinyl_siding', 'Vinyl Siding', C.con, P.stripes('#dfe4e8', '#cdd3d8', 4, 0), { hard: 1.2, snd: 'plastic', craft: wb({ polymer: 2 }, 4), map: '#dfe4e8' });
  B('vinyl_siding_blue', 'Blue Siding', C.con, P.stripes('#6a8cb0', '#5a7a9e', 4, 0), { hard: 1.2, snd: 'plastic', craft: wb({ polymer: 2 }, 4), map: '#6a8cb0' });
  B('roof_shingles', 'Roof Shingles', C.con, P.bricks('#4a4e58', '#363940', 4), { hard: 1.5, craft: wb({ polymer: 1, gravel: 1 }, 4), map: '#4a4e58' });
  family('roof_shingles', 'Shingle', C.con, P.bricks('#4a4e58', '#363940', 4), { hard: 1.5, map: '#4a4e58' });
  B('terracotta_tiles', 'Terracotta Tiles', C.con, P.pavers('#c4683c', '#8a4a2c'), { hard: 2, craft: wb({ shale: 3 }, 4), map: '#c4683c' });
  B('plaster', 'Plaster', C.con, P.noise('#ece8e0', '#ddd8cc', 0.3, 8), { hard: 1, craft: wb({ sand: 1, stone: 1 }, 4), map: '#ece8e0' });
  B('rammed_earth', 'Rammed Earth', C.con, P.noiseBars('#9a7a58', '#7e6040'), { hard: 1.5, snd: 'dirt', craft: wb({ dirt: 4 }, 2), map: '#9a7a58' });
  B('timber_cladding', 'Timber Cladding', C.arch, P.planks('#6a4a30', '#583c26'), { hard: 1.6, snd: 'wood', craft: wb({ timber_planks: 2 }, 2), map: '#6a4a30' });
  B('parquet', 'Parquet Flooring', C.furn, P.planks('#a87a48', '#8e6234'), { hard: 1.4, snd: 'wood', craft: wb({ timber_planks: 2, polymer: 1 }, 2), map: '#a87a48' });
  family('timber_planks', 'Timber', C.con, P.planks('#b58a54', '#9a7240'), { hard: 1.6, snd: 'wood', map: '#a87e4c' });

  // ------------------------------------------------------------ CONCRETE & INDUSTRIAL
  B('concrete', 'Poured Concrete', C.ind, P.concrete('#9a9ca0', '#85878b'), { hard: 4, craft: wb({ stone: 2, sand: 1, gravel: 1 }, 4), map: '#9a9ca0', desc: 'The backbone of every build.' });
  family('concrete', 'Concrete', C.ind, P.concrete('#9a9ca0', '#85878b'), { hard: 4, map: '#9a9ca0' });
  B('concrete_wall', 'Concrete Barrier Wall', C.ind, P.concrete('#9a9ca0', '#85878b'), { shape: 'wall', hard: 4, connect: 'wall', craft: wb({ concrete: 1 }, 2), map: '#9a9ca0' });
  B('cracked_concrete', 'Cracked Concrete', C.ind, P.concrete('#8a8c8e', '#6a6c6e'), { hard: 3, map: '#8a8c8e', desc: 'Decades of neglect.' });
  B('stained_concrete', 'Weathered Concrete', C.ind, P.noise('#8e9094', '#6e7068', 0.6, 8), { hard: 4, craft: wb({ concrete: 1, dirt: 1 }), map: '#7e8084' });
  B('reinforced_concrete', 'Reinforced Concrete', C.ind, P.panel('#8e9296', '#4a4e52', '#5c6064', 2), { hard: 9, tier: 1, craft: wb({ concrete: 2, steel_ingot: 1 }, 2), map: '#8e9296' });
  B('formwork_concrete', 'Formwork Concrete', C.ind, P.concrete('#a8aaac', '#9a9ca0', 1), { hard: 4, craft: wb({ concrete: 1 }), map: '#a8aaac' });
  B('rubble', 'Concrete Rubble', C.ind, P.gravel('#7a7c80', '#a0a2a6'), { hard: 1.2, snd: 'gravel', drop: 'scrap_metal', dropN: [0, 2], map: '#7a7c80' });
  B('hazard_block', 'Hazard Stripe Block', C.ind, P.hazard('#e8b820', '#1c1c20'), { hard: 4, snd: 'metal', craft: wb({ concrete: 1, scrap_metal: 1 }, 2), map: '#e8b820' });
  B('industrial_floor', 'Industrial Floor Plate', C.ind, P.plate('#5a5e66', '#767b84'), { hard: 5, snd: 'metal', tier: 1, craft: wb({ steel_ingot: 1 }, 2), metal: 0.8, rough: 0.5, map: '#5a5e66' });
  B('rusted_steel', 'Rusted Steel', C.ind, P.rust('#6a5e56', '#a8582c'), { hard: 5, snd: 'metal', metal: 0.5, rough: 0.9, map: '#8a5a3c' });
  B('corrugated_metal', 'Corrugated Metal', C.ind, P.stripes('#8a9298', '#6e767c', 2, 1), { hard: 4, snd: 'metal', metal: 0.8, rough: 0.5, craft: wb({ steel_ingot: 1 }, 3), map: '#8a9298' });
  B('smokestack_brick', 'Smokestack Brick', C.ind, P.bricks('#6a3a30', '#3a3430', 4), { hard: 5, map: '#6a3a30' });
  B('cooling_vent', 'Cooling Vent', C.ind, P.vent('#7a8088', '#16181c'), { hard: 4, snd: 'metal', metal: 0.7, craft: wb({ steel_ingot: 1, scrap_metal: 1 }), map: '#7a8088' });
  B('slag_block', 'Slag Block', C.ind, P.noise('#2a2224', '#5a3a30', 0.9, 4), { hard: 4, tier: 1, emit: 3, glow: 0.4, map: '#3a2c2a' });

  // ------------------------------------------------------------ ROADS & TRANSPORT
  B('asphalt', 'Asphalt', C.road, P.asphalt('plain', 0), { hard: 3.5, craft: wb({ gravel: 2, oil_shale: 1 }, 4), map: '#2e3137', rough: 0.45, desc: 'Fresh enough to still reflect rain.' });
  B('asphalt_cracked', 'Cracked Asphalt', C.road, P.asphalt('cracked', 0), { hard: 3, map: '#2a2d32', rough: 0.7 });
  B('road_line_x', 'Road Line (X)', C.road, P.asphalt('line', 0), { hard: 3.5, craft: wb({ asphalt: 1, sand: 1 }), map: '#2e3137', rough: 0.45 });
  B('road_line_z', 'Road Line (Z)', C.road, P.asphalt('line', 1), { hard: 3.5, craft: wb({ asphalt: 1, sand: 1 }), map: '#2e3137', rough: 0.45 });
  B('road_dash_x', 'Lane Dash (X)', C.road, P.asphalt('dash', 0), { hard: 3.5, craft: wb({ asphalt: 1, sand: 1 }), map: '#2e3137', rough: 0.45 });
  B('road_dash_z', 'Lane Dash (Z)', C.road, P.asphalt('dash', 1), { hard: 3.5, craft: wb({ asphalt: 1, sand: 1 }), map: '#2e3137', rough: 0.45 });
  B('road_edge_x', 'Road Edge (X)', C.road, P.asphalt('edge', 0), { hard: 3.5, craft: wb({ asphalt: 1, sand: 1 }), map: '#2e3137', rough: 0.45 });
  B('crosswalk_x', 'Crosswalk (X)', C.road, P.asphalt('cross', 0), { hard: 3.5, craft: wb({ asphalt: 1, sand: 1 }), map: '#40444a', rough: 0.45 });
  B('crosswalk_z', 'Crosswalk (Z)', C.road, P.asphalt('cross', 1), { hard: 3.5, craft: wb({ asphalt: 1, sand: 1 }), map: '#40444a', rough: 0.45 });
  B('sidewalk', 'Sidewalk Pavers', C.road, P.pavers('#a4a39e', '#7e7d78'), { hard: 3, craft: wb({ stone: 1, gravel: 1 }, 4), map: '#a4a39e' });
  B('curb', 'Curb Stone', C.road, P.concrete('#b4b4b0', '#9a9a96', 0), { shape: 'slab', hard: 3, craft: wb({ concrete: 1 }, 2), map: '#b4b4b0' });
  B('rail_track', 'Rail Track', C.road, P.rail(), { shape: 'carpet', hard: 3, snd: 'metal', craft: wb({ steel_ingot: 1, timber_planks: 1 }, 4), map: '#6a645c', metal: 0.7 });
  B('subway_tile', 'Subway Tile', C.road, P.tiles('#d8dcd8', '#8a8e8a', 4), { hard: 2, craft: wb({ sand: 1, stone: 1 }, 4), map: '#d8dcd8', rough: 0.2 });
  B('platform_edge', 'Platform Edge Tile', C.road, P.hazard('#e8c820', '#38383c', 3), { hard: 3, craft: wb({ subway_tile: 1, hazard_block: 1 }, 2), map: '#e8c820' });
  B('tunnel_lining', 'Tunnel Lining', C.road, P.tiles('#6a7078', '#3a3e44', 2), { hard: 5, tier: 1, map: '#6a7078' });
  B('manhole_cover', 'Manhole Cover', C.road, P.plate('#3a3e44', '#565c66'), { shape: 'carpet', hard: 3, snd: 'metal', craft: wb({ steel_ingot: 1 }, 2), metal: 0.7, map: '#3a3e44' });
  B('jersey_barrier', 'Jersey Barrier', C.road, P.concrete('#b0b0ac', '#9a9a96', 0), { shape: 'custom', boxes: [{ b: [0, 0, 0.2, 1, 0.25, 0.8] }, { b: [0, 0.25, 0.3, 1, 0.55, 0.7] }, { b: [0, 0.55, 0.38, 1, 1, 0.62] }], rot: 'facing4', hard: 4, craft: wb({ concrete: 2 }, 2), map: '#b0b0ac' });
  B('traffic_cone', 'Traffic Cone', C.road, P.hazard('#ff6a1c', '#f0f0f0', 4), { shape: 'custom', boxes: [{ b: [0.1, 0, 0.1, 0.9, 0.08, 0.9] }, { b: [0.3, 0.08, 0.3, 0.7, 0.5, 0.7] }, { b: [0.4, 0.5, 0.4, 0.6, 0.75, 0.6] }], hard: 0.3, snd: 'plastic', craft: wb({ polymer: 1 }, 2), map: '#ff6a1c' });
  B('street_lamp', 'Street Lamp', C.road, { all: P.panel('#4a4e56', '#2a2c32', '#7a7e86', 1), lamp: P.lamp('#fff2c8', '#4a4e56', 1) }, { shape: 'custom', rot: 'facing4', boxes: [{ b: [0.44, 0, 0.44, 0.56, 0.7, 0.56] }, { b: [0.44, 0.7, 0.44, 0.56, 0.78, 0.9] }, { b: [0.3, 0.64, 0.7, 0.7, 0.72, 1.0], t: 'lamp' }], emitOn: 15, power: { use: 1 }, hard: 3, snd: 'metal', craft: wb({ steel_ingot: 1, copper_wire: 1, energy_cell: 1 }), map: '#4a4e56', metal: 0.6 });
  B('traffic_light', 'Traffic Signal', C.road, { all: P.panel('#2a2c32', '#16181c', '#5a5e66', 1), lamp: P.lamp('#ff3a30', '#16181c', 1), green: P.lamp('#38f070', '#16181c', 1) }, { shape: 'custom', rot: 'facing4', boxes: [{ b: [0.44, 0, 0.44, 0.56, 1, 0.56] }, { b: [0.3, 0.55, 0.62, 0.7, 1, 0.82] }, { b: [0.4, 0.82, 0.8, 0.6, 0.94, 0.84], t: 'lamp' }, { b: [0.4, 0.62, 0.8, 0.6, 0.74, 0.84], t: 'green' }], emit: 6, hard: 3, snd: 'metal', craft: wb({ steel_ingot: 1, copper_wire: 1, polymer: 1 }), map: '#2a2c32' });
  B('road_sign', 'Road Sign', C.road, P.sign('#1c5a9a', '#f4f4f4', 'arrow'), { shape: 'panel', rot: 'facing4', hard: 1, snd: 'metal', craft: wb({ alu_ingot: 1, polymer: 1 }, 2), map: '#1c5a9a' });
  B('warning_sign', 'Warning Sign', C.road, P.sign('#e8b820', '#1c1c20', 'warn'), { shape: 'panel', rot: 'facing4', hard: 1, snd: 'metal', craft: wb({ alu_ingot: 1, polymer: 1 }, 2), map: '#e8b820' });
  B('guardrail', 'Guardrail', C.road, P.corrugated ? P.stripes('#a8b0b6', '#8e969c', 2, 0) : P.solid('#a8b0b6'), { shape: 'fence', connect: 'fence', hard: 3, snd: 'metal', metal: 0.8, craft: wb({ steel_ingot: 1 }, 3), map: '#a8b0b6' });
  B('parking_bay', 'Parking Bay Marking', C.road, P.asphalt('edge', 1), { hard: 3.5, craft: wb({ asphalt: 1, sand: 1 }), map: '#2e3137' });
  void sm;
}

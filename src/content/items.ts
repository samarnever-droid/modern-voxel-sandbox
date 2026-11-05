import { P } from '../engine/textures';
import { defineItem, defineResearch, defineChallenge, Reg } from '../engine/registry';
import { hand, wb, fab, sm, lab, fnd } from './helpers';

const M = (key: string, name: string, icon: any, desc: string, craft?: any, stack = 64) =>
  defineItem({ key, name, type: 'material', icon, desc, craft, stack });

export function registerItems() {
  // ---- raw & refined materials
  M('scrap_metal', 'Scrap Metal', P.i_scrap('#9aa2aa', '#6a727a'), 'Salvaged from the old world. Smelts into steel.');
  M('raw_copper', 'Raw Copper', P.i_chunk('#e8905a', '#a8582c'), 'Unrefined copper ore.');
  M('raw_iron', 'Raw Ferrite', P.i_chunk('#c8b0a0', '#7a6a60'), 'Unrefined iron-bearing ore.');
  M('raw_bauxite', 'Raw Bauxite', P.i_chunk('#e07050', '#8a4030'), 'Source of aluminum.');
  M('raw_titanite', 'Raw Titanite', P.i_chunk('#8ac4f0', '#4a7aa8'), 'Dense blue ore. Needs a strong cutter.');
  M('carbon', 'Carbon', P.i_chunk('#4a4e56', '#16171a'), 'Fuel and alloy additive.', sm({ timber_log: 1 }, 2));
  M('copper_ingot', 'Copper Ingot', P.i_ingot('#e8905a', '#a8582c'), '', sm({ raw_copper: 1 }));
  M('steel_ingot', 'Steel Ingot', P.i_ingot('#c0c8d0', '#7a828a'), 'The backbone alloy.', sm({ raw_iron: 1, carbon: 1 }));
  defineItem({ key: 'steel_ingot_scrap', name: 'Steel Ingot (from scrap)', type: 'material', icon: P.i_ingot('#c0c8d0', '#7a828a'), desc: 'Recycle scrap into steel.', craft: sm({ scrap_metal: 3, carbon: 1 }), stack: 64 });
  M('alu_ingot', 'Aluminum Ingot', P.i_ingot('#e0e8f0', '#9aa4b0'), '', sm({ raw_bauxite: 2 }));
  M('titanium_ingot', 'Titanium Ingot', P.i_ingot('#9ac0e8', '#587ca8'), '', sm({ raw_titanite: 2, carbon: 1 }));
  M('silicon', 'Silicon', P.i_ingot('#5a5a78', '#34344c'), 'Refined from sand.', sm({ sand: 2 }));
  M('polymer', 'Polymer', P.i_sheet('#e8e8f0', '#b0b0c0'), 'Smelted from oil shale.', sm({ oil_shale: 1 }, 2));
  M('lithium', 'Lithium', P.i_chunk('#e0e4f0', '#8a90a8'), 'Battery grade lithium salts.');
  M('zerite_shard', 'Zerite Shard', P.i_core('#10806a', '#58ffd8'), 'Rare humming crystal. Powers experimental tech.');
  M('copper_wire', 'Copper Wire', P.i_wire('#e8905a', '#a8582c'), '', wb({ copper_ingot: 1 }, 3));
  M('circuit_board', 'Circuit Board', P.i_chip('#1c6a4c', '#58ffb0'), '', wb({ silicon: 1, copper_wire: 2, polymer: 1 }));
  M('energy_cell', 'Energy Cell', P.i_cell('#2a4a8a', '#58d8ff'), 'Compact rechargeable power.', wb({ lithium: 1, copper_wire: 2, polymer: 1 }));
  M('power_core', 'Power Core', P.i_core('#4a5a7a', '#ffc048'), 'Dense regulated energy source.', fab({ energy_cell: 2, circuit_board: 1, steel_ingot: 2 }));
  M('servo', 'Servo Motor', P.i_gear('#a0a8b0'), '', wb({ steel_ingot: 1, copper_wire: 2 }));
  M('nanogel', 'Nanogel', P.i_vial('#58ffa8'), 'Self-assembling repair paste.', lab({ polymer: 2, silicon: 2, lithium: 1 }));
  M('data_chip', 'Data Chip', P.i_chip('#2a2e3a', '#ffd048'), 'Recovered research data. Spend at a Research Station.', lab({ silicon: 1, copper_wire: 2, scrap_metal: 1 }));
  M('optic_lens', 'Optic Lens', P.i_lens('#8a98a8', '#58d8ff'), '', lab({ glass: 1, silicon: 1 }));
  M('carbon_fiber', 'Carbon Fiber', P.i_sheet('#33363c', '#16181c'), '', fab({ carbon: 4, polymer: 2 }));
  M('plasma_cell', 'Plasma Cell', P.i_cell('#4a2a8a', '#ff58f0'), 'Fuel for fusion cells.', fnd({ zerite_shard: 1, energy_cell: 1, lithium: 1 }, 2));

  // ---- food
  defineItem({ key: 'wild_berries', name: 'Wild Berries', type: 'food', icon: P.i_food('fruit', '#d8304a', '#4a9a3a'), food: { hunger: 3 }, desc: 'Foraged from berry bushes.' });
  defineItem({ key: 'ration_bar', name: 'Ration Bar', type: 'food', icon: P.i_food('bar', '#c8a050', '#6a5a38'), food: { hunger: 6 }, desc: 'Dense, sensible, boring.', craft: wb({ wild_berries: 3, carbon: 0 + 1 }) });
  defineItem({ key: 'canned_stew', name: 'Canned Stew', type: 'food', icon: P.i_food('can', '#c8603a', '#f0d890'), food: { hunger: 10 }, desc: 'Pre-collapse. Somehow still fine.', craft: wb({ wild_berries: 2, steel_ingot: 1 }) });
  defineItem({ key: 'nutrient_paste', name: 'Nutrient Paste', type: 'food', icon: P.i_food('tube', '#88d858', '#e8e8e8'), food: { hunger: 8, heal: 4 }, desc: 'Tastes like progress.', craft: lab({ wild_berries: 4, polymer: 1 }) });
  defineItem({ key: 'fresh_meal', name: 'Reclaimer Meal', type: 'food', icon: P.i_food('meal', '#e8a050', '#58a838'), food: { hunger: 14, heal: 6 }, desc: 'A rare hot meal.' });

  // ---- tools (upgrade path: each tier consumes the previous)
  const tool = (key: string, name: string, kind: string, hc: string, gc: string, speed: number, tier: number, dur: number, craft: any, desc: string, extra: any = {}) =>
    defineItem({ key, name, type: 'tool', icon: P.i_tool(hc, gc, kind), tool: { speed, tier, dur, ...extra }, desc, craft });
  tool('salvage_cutter', 'Salvage Cutter', 'cutter', '#9aa2aa', '#ffa040', 1.6, 0, 160, hand({ scrap_metal: 3 }), 'A crude thermal cutter. Tier 0.');
  tool('pulse_cutter', 'Pulse Cutter', 'cutter', '#7ab8e8', '#58d8ff', 3.2, 1, 380, wb({ salvage_cutter: 1, steel_ingot: 2, energy_cell: 1, copper_wire: 2 }), 'Fast pulsed edge. Tier 1.');
  tool('arc_driver', 'Arc Driver', 'drill', '#e8b820', '#58ffb0', 5.5, 2, 700, fab({ pulse_cutter: 1, steel_ingot: 3, servo: 1, circuit_board: 1 }), 'Rotary arc drill. Tier 2 (breaks titanite).');
  tool('plasma_excavator', 'Plasma Excavator', 'excav', '#ff7a30', '#ffd048', 8, 3, 1000, fnd({ arc_driver: 1, titanium_ingot: 3, power_core: 1, servo: 2 }, 1, 'excavation'), 'Excavates a 3x3 area. Tier 3.', { area: 1 });
  tool('quantum_disruptor', 'Quantum Disruptor', 'disrupt', '#6a40c8', '#e080ff', 14, 4, 1600, fnd({ plasma_excavator: 1, titanium_ingot: 4, power_core: 2, zerite_shard: 3 }, 1, 'quantum'), 'Phase-shifts whole veins and 3x3 areas. Tier 4.', { area: 1, vein: true });

  // ---- weapons (stylised energy gear)
  const wpn = (key: string, name: string, icon: any, w: any, craft: any, desc: string) => defineItem({ key, name, type: 'weapon', icon, weapon: w, desc, craft });
  wpn('arc_baton', 'Arc Baton', P.i_tool('#4a4e56', '#58d8ff', 'baton'), { dmg: 6, kind: 'melee', cd: 0.45, dur: 260, range: 3.2 }, wb({ steel_ingot: 1, energy_cell: 1, copper_wire: 1 }), 'Close-range stun baton. Short but reliable.');
  wpn('pulse_emitter', 'Pulse Emitter', P.i_gun('#7a828c', '#58d8ff', 'emitter'), { dmg: 5, kind: 'bolt', cd: 0.35, dur: 420 }, fab({ steel_ingot: 2, energy_cell: 2, circuit_board: 1 }), 'Fires bolts of pulsed light.');
  wpn('scatter_arc', 'Scatter Arc', P.i_gun('#8a6a4a', '#ffa040', 'scatter'), { dmg: 3, kind: 'spread', cd: 0.9, dur: 300 }, fab({ pulse_emitter: 1, servo: 1, steel_ingot: 2 }, 1, 'defense'), 'Wide arc of short-range sparks.');
  wpn('rail_lance', 'Rail Lance', P.i_gun('#3a3e56', '#e080ff', 'rail'), { dmg: 22, kind: 'rail', cd: 1.4, dur: 260 }, fnd({ scatter_arc: 1, titanium_ingot: 2, power_core: 1, carbon_fiber: 2, zerite_shard: 1 }, 1, 'railtech'), 'Pierces multiple targets in a straight line.');

  // ---- gadgets
  const gad = (key: string, name: string, kind: string, c: string, g: string, cd: number, craft: any, desc: string, type: 'gadget' | 'equip' = 'gadget', equip?: any) =>
    defineItem({ key, name, type, icon: P.i_gadget(kind, c, g), gadget: { kind, cd }, equip, desc, craft });
  gad('scanner', 'Survey Scanner', 'scanner', '#4a5058', '#58ffb0', 8, wb({ circuit_board: 1, glass: 1, copper_wire: 2, energy_cell: 1 }), 'Right-click: pings ores, loot, machines and landmarks through terrain.');
  gad('tether_hook', 'Tether Hook', 'hook', '#6a727a', '#ffa040', 2.5, fab({ servo: 1, steel_ingot: 2, copper_wire: 3 }, 1, 'traversal'), 'Right-click: fires a line and reels you to the point.');
  gad('shield_projector', 'Shield Projector', 'shield', '#5a7aa8', '#58d8ff', 20, fab({ energy_cell: 2, alu_ingot: 2, circuit_board: 1 }, 1, 'defense'), 'Right-click: a 6 second barrier that absorbs all damage.');
  gad('recon_drone', 'Recon Drone', 'drone', '#4a5058', '#58ffb0', 30, fab({ servo: 2, circuit_board: 2, alu_ingot: 2, optic_lens: 1 }, 1, 'robotics'), 'Right-click: deploys a companion that zaps hostile machines and marks resources.');
  gad('thruster_pack', 'Thruster Pack', 'pack', '#3a3e46', '#ffa040', 0, fnd({ titanium_ingot: 2, servo: 2, power_core: 1, carbon_fiber: 2 }, 1, 'thrusters'), 'Equip: hold Space in the air to boost. Hold Shift to hover-descend.', 'equip', { slot: 'pack', boost: 1 });
  gad('repair_tool', 'Nano Repair Tool', 'repair', '#5a8a7a', '#58ffa8', 1, lab({ nanogel: 2, servo: 1, alu_ingot: 1 }, 1, 'repair'), 'Right-click: restores durability on the tool in the next hotbar slot.');
  gad('blueprint_builder', 'Blueprint Builder', 'builder', '#4a6a9a', '#58d8ff', 0.8, fab({ circuit_board: 2, optic_lens: 1, servo: 1, power_core: 1 }, 1, 'construction'), 'Right-click: places a 3x3 layer using the block in the next hotbar slot.');
  gad('terraformer', 'Terraformer', 'terra', '#6a5a3a', '#58ffa8', 6, fnd({ power_core: 2, servo: 2, titanium_ingot: 2, zerite_shard: 2 }, 1, 'terraform'), 'Right-click: flattens a radius-5 plateau at the targeted height.');
  defineItem({ key: 'reactive_vest', name: 'Reactive Vest', type: 'equip', icon: P.i_armor('#4a6a8a', '#58d8ff'), equip: { slot: 'armor', def: 0.35 }, desc: 'Equip: reduces incoming damage by 35%.', craft: fab({ carbon_fiber: 3, polymer: 4, alu_ingot: 2 }, 1, 'defense') });
  defineItem({ key: 'recon_visor', name: 'Recon Visor', type: 'equip', icon: P.i_lens('#4a5058', '#58ffb0'), equip: { slot: 'visor' }, desc: 'Equip: enhanced low-light vision.', craft: lab({ optic_lens: 2, circuit_board: 1, polymer: 2 }, 1, 'scanning') });
  defineItem({ key: 'data_log', name: 'Recovered Log', type: 'material', icon: P.i_log('#3a3e4a', '#58ffb0'), desc: 'A recovered log entry. Right-click to read.', stack: 16 });

  // ---- research tree
  const R = (key: string, name: string, tier: number, cost: Record<string, number>, requires: string[], desc: string, branch = 'core') => defineResearch({ key, name, tier, cost, requires, desc, branch });
  R('fabrication', 'Industrial Fabrication', 1, { data_chip: 2, steel_ingot: 2 }, [], 'Unlocks the Industrial Fabricator and arc-tier machinery.');
  R('scanning', 'Survey Optics', 1, { data_chip: 2, glass: 2 }, [], 'Recon visor and sensor equipment.');
  R('traversal', 'Traversal Kit', 2, { data_chip: 3, servo: 1 }, ['fabrication'], 'Tether Hook.', 'mobility');
  R('frontline', 'Frontline Doctrine', 2, { data_chip: 4, energy_cell: 2 }, ['fabrication'], 'Frontline Beacons: claim and restore land.', 'frontline');
  R('defense', 'Perimeter Defense', 2, { data_chip: 3, steel_ingot: 4 }, ['fabrication'], 'Turrets, shield projector, reactive vest, scatter arc.', 'frontline');
  R('automation', 'Automation', 2, { data_chip: 3, servo: 2 }, ['fabrication'], 'Automated drills.', 'industry');
  R('foundry', 'Assembly Foundry', 3, { data_chip: 5, titanium_ingot: 2 }, ['fabrication'], 'Tier 4 foundry for advanced equipment.', 'industry');
  R('holo', 'Holographics', 3, { data_chip: 4, optic_lens: 2 }, ['scanning'], 'Holo table, prisms and hologram blocks.');
  R('robotics', 'Autonomous Robotics', 3, { data_chip: 5, servo: 3 }, ['automation'], 'Recon Drone.', 'mobility');
  R('power3', 'Fusion Power', 3, { data_chip: 5, power_core: 1 }, ['automation'], 'Fusion cell generators.', 'industry');
  R('repair', 'Nano Repair', 3, { data_chip: 4, nanogel: 2 }, ['fabrication'], 'Nano Repair Tool.', 'industry');
  R('excavation', 'Heavy Excavation', 3, { data_chip: 5, steel_ingot: 4 }, ['foundry'], 'Plasma Excavator.', 'industry');
  R('thrusters', 'Thruster Systems', 4, { data_chip: 6, titanium_ingot: 2 }, ['traversal', 'foundry'], 'Thruster Pack.', 'mobility');
  R('construction', 'Construction Systems', 4, { data_chip: 6, optic_lens: 2 }, ['holo'], 'Blueprint Builder.', 'frontline');
  R('quantum', 'Quantum Mechanics', 5, { data_chip: 10, zerite_shard: 4 }, ['power3', 'excavation'], 'Quantum cores & disruptor.', 'experimental');
  R('railtech', 'Rail Acceleration', 5, { data_chip: 8, carbon_fiber: 2 }, ['defense', 'foundry'], 'Rail Lance.', 'experimental');
  R('terraform', 'Terraforming', 5, { data_chip: 10, power_core: 2 }, ['quantum', 'construction'], 'Terraformer.', 'experimental');

  // ---- sandbox challenges
  const Ch = (key: string, name: string, desc: string, stat: string, goal: number, reward?: Record<string, number>) => defineChallenge({ key, name, desc, stat, goal, reward });
  Ch('first_light', 'First Light', 'Place 10 blocks.', 'blocks_placed', 10, { scrap_metal: 4 });
  Ch('scavenger', 'Scavenger', 'Break 60 blocks.', 'blocks_broken', 60, { data_chip: 1 });
  Ch('hands_on', 'Hands-On', 'Craft 6 items.', 'crafted', 6, { data_chip: 1 });
  Ch('lights_on', 'Lights On', 'Generate 4 power units on a single grid.', 'power_peak', 4, { energy_cell: 2 });
  Ch('plant_flag', 'Planting a Flag', 'Place a Frontline Beacon.', 'beacons', 1, { data_chip: 3 });
  Ch('reclaimer', 'Reclaimer', 'Restore 60 blocks of dead land with a beacon.', 'restored', 60, { fresh_meal: 2 });
  Ch('hunter', 'Machine Hunter', 'Disable 8 hostile machines.', 'machines', 8, { power_core: 1 });
  Ch('cartographer', 'Cartographer', 'Discover 5 landmarks.', 'discoveries', 5, { data_chip: 3 });
  Ch('think_tank', 'Think Tank', 'Complete 3 research nodes.', 'research', 3, { optic_lens: 2 });
  Ch('urban_planner', 'Urban Planner', 'Place 400 blocks.', 'blocks_placed', 400, { data_chip: 4 });
  Ch('deep_delve', 'Deep Delve', 'Descend 35 blocks below sea level.', 'depth', 35, { lithium: 4 });
  Ch('skybound', 'Skybound', 'Climb 60 blocks above sea level.', 'height', 60, { titanium_ingot: 2 });
  Ch('grid_master', 'Grid Master', 'Run a grid producing 40 power.', 'power_peak', 40, { zerite_shard: 2 });
  Ch('wanderer', 'Wanderer', 'Travel 1500 blocks on foot.', 'distance', 1500, { ration_bar: 4 });
  void Reg;
}

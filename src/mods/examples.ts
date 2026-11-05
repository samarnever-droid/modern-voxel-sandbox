import type { ModBundle } from './loader';

/** Bundled example mods — each is also a template players can download from the Mod Manager. */
export const EXAMPLE_MODS: ModBundle[] = [
  {
    manifest: { id: 'neon-district', name: 'Neon District', version: '1.2.0', apiVersion: '^1.0.0', author: 'Frontline Studio', description: 'Adds neon building blocks, a stun baton, a research node, a structure, and Lua-powered events.', dependencies: { 'frontline-core': '>=1.0.0' } },
    data: {
      blocks: [
        { key: 'neon_tile', name: 'Neon Tile', cat: 'Mods: Neon District', tex: { p: 'neon', a: ['#ff3ec8'] }, emit: 12, glow: 1.8, hard: 1, snd: 'glass', craft: { st: 'workbench', in: { glass: 1, copper_wire: 1 }, n: 2 } },
        { key: 'chrome_floor', name: 'Chrome Floor', cat: 'Mods: Neon District', tex: { p: 'panel', a: ['#b8c0c8', '#6a727a', '#ffffff', 2] }, metal: 1, rough: 0.15, hard: 4, snd: 'metal', craft: { st: 'workbench', in: { steel_ingot: 1, glass: 1 }, n: 4 } },
        { key: 'holo_billboard', name: 'Holo Billboard', cat: 'Mods: Neon District', tex: { front: { p: 'screen', a: ['#10042a', '#c858ff', 'radar'] }, side: { p: 'panel', a: ['#2a1048', '#10062a', '#6a3aa0', 1] } }, rot: 'facing4', emit: 9, glow: 1.4, hard: 2, snd: 'tech', craft: { st: 'workbench', in: { glass: 1, circuit_board: 1 } } },
      ],
      items: [
        { key: 'neon_baton', name: 'Neon Baton', type: 'weapon', icon: { p: 'i_tool', a: ['#ff3ec8', '#30f0ff', 'baton'] }, weapon: { dmg: 10, kind: 'melee', cd: 0.35, dur: 320, range: 3.4 }, desc: 'A flashy stun baton.', craft: { st: 'workbench', in: { arc_baton: 1, neon_tile: 2 } } },
      ],
      research: [{ key: 'neon_tech', name: 'Neon Engineering', desc: 'Unlocks neon decor for the Fabricator.', cost: { data_chip: 1 }, requires: [], tier: 1 }],
      structures: [{
        key: 'neon_kiosk', name: 'Neon Kiosk', biomes: ['metropolis', 'suburb', 'plains'], rarity: 0.2,
        palette: { '#': 'chrome_floor', N: 'neon_tile', G: 'glass', T: 'terminal' },
        layers: [['#####', '#TTT#', '#####'], ['N###N', 'G   G', 'N###N'], ['N###N', 'G   G', 'N###N'], ['#####', '#####', '#####']],
      }],
      lore: [{ tag: 'city', text: 'A flickering sign: "NEON DISTRICT — still open." The power never went out here. Nobody asked why.' }],
      challenges: [{ key: 'glow_up', name: 'Glow Up', desc: 'Place 25 blocks.', stat: 'blocks_placed', goal: 25 }],
      hud: [{ id: 'coords', text: 'XYZ {x} {y} {z}', pos: 'bottom-left' }],
      sounds: { sizzle: { layers: [{ noise: true, dur: 0.3, freq: 5000, q: 3, vol: 0.3 }, { freq: 900, dur: 0.25, wave: 'sawtooth', slide: 200, vol: 0.12 }] } },
    },
    scripts: {
      'scripts/main.lua': `frontline.log("Neon District online")
frontline.on("block_broken", function(e)
  if e.block == "neon-district:neon_tile" then
    frontline.notify("The neon fizzles out!")
    frontline.spawn_particles(e.x, e.y, e.z, "spark", 24)
    frontline.play("neon-district:sizzle")
  end
end)
frontline.register_command("cheer", function(args)
  frontline.play("discover")
  return "Cheers from Neon District! (" .. #args .. " args)"
end)
`,
    },
  },
  {
    manifest: { id: 'frontier-flora', name: 'Frontier Flora', version: '1.0.0', apiVersion: '^1.0.0', author: 'Frontline Studio', description: 'A new Crystal Meadow biome, glimmer ore veins and a Lua harvest event.', dependencies: { 'frontline-core': '^1.0.0' } },
    data: {
      blocks: [
        { key: 'crystal_grass', name: 'Crystal Grass', cat: 'Mods: Frontier Flora', tex: { top: { p: 'grassTop', a: ['#3aa88a', '#70e0c0'] }, side: { p: 'grassSide', a: ['#48b898', '#6b4a32'] }, bottom: { p: 'dirt', a: ['#6b4a32', '#4e3424'] } }, drop: 'dirt', hard: 0.8, snd: 'grass' },
        { key: 'glimmer_ore', name: 'Glimmer Ore', cat: 'Mods: Frontier Flora', tex: { p: 'ore', a: ['#7c8087', '#5e6269', '#ffe060', 1] }, emit: 7, glow: 1.3, hard: 5, tier: 1, drop: 'lithium' },
        { key: 'glimmer_bloom', name: 'Glimmer Bloom', cat: 'Mods: Frontier Flora', tex: { p: 'plant', a: ['flower', '#3aa88a', '#ffe060', '#ffffff'] }, shape: 'cross', render: 'cutout', sway: true, emit: 6, hard: 0.05, snd: 'grass' },
      ],
      biomes: [{ key: 'crystal_meadow', name: 'Crystal Meadow', temp: [-0.15, 0.25], moist: [0.15, 0.7], rarity: 0.35, surface: 'crystal_grass', filler: 'dirt', fog: '#a8f0e0' }],
      features: [{ key: 'glimmer_veins', block: 'glimmer_ore', replace: 'stone', minY: 8, maxY: 48, size: 4, perChunk: 3 }],
    },
    scripts: { 'scripts/main.lua': `frontline.log("Frontier Flora growing")\nfrontline.on("tick", function(e) if frontline.random() < 0.01 then frontline.notify("A distant chime echoes across the meadow...") end end)\n` },
  },
  {
    manifest: { id: 'hello-mod', name: 'Hello Mod (Starter Template)', version: '0.1.0', apiVersion: '^1.0.0', author: 'You', description: 'The smallest possible mod: one block, one recipe, one Lua command. Copy me!' },
    data: {
      blocks: [{ key: 'hello_block', name: 'Hello Block', cat: 'Mods: Hello', tex: { p: 'stripes', a: ['#ffcc00', '#222222', 4, 0] }, hard: 1, craft: { st: 'hand', in: { scrap_metal: 1 }, n: 4 } }],
    },
    scripts: { 'scripts/main.lua': `frontline.register_command("hello", function(args) return "Hello from Lua!" end)\n` },
  },
];

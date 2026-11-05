# FRONTLINE: ZERO HOUR — Mod SDK (API 1.0.0)

Mods are **declarative data packs** (JSON) plus optional **sandboxed Lua** scripts. No core source changes are ever needed.
Install from the in-game **Mod Manager** (title screen or pause menu): import a `.json`/`.frontmod` bundle, a `.zip`, or a whole folder.
Mod content is registered through the *same registry API* the base game uses, so mod blocks behave exactly like built-in blocks.
Mod changes apply on the next reload (block ids are remapped per-save through a palette, so worlds survive adding/removing mods).

## Directory layout
```
my-mod/
  mod.json                # manifest (+ optional inline "data")
  data/blocks.json        # arrays: blocks items recipes research challenges structures biomes features lore
  data/sounds.json        # { "name": { "layers": [ {freq,dur,wave,slide,vol} | {noise:true,freq,q,dur} ] } }
  data/hud.json           # [ { "id": "coords", "text": "XYZ {x} {y} {z}", "pos": "bottom-left" } ]
  scripts/main.lua        # sandboxed Lua
  textures/neon.png       # 32x32 PNG, referenced as { "png": "textures/neon.png" }
```
A single-file bundle is `{ "manifest": {...}, "data": {...}, "scripts": { "scripts/main.lua": "..." }, "textures": { "textures/a.png": "data:image/png;base64,..." } }`.
Starter templates: see the Mod Manager → *Examples* tab (each can be downloaded) and `examples/hello-mod/`.

## manifest
```json
{ "id": "my-mod", "name": "My Mod", "version": "1.0.0", "apiVersion": "^1.0.0",
  "dependencies": { "frontline-core": ">=1.0.0", "other-mod": "^1.2.0" } }
```
* `id`: lowercase `[a-z0-9_-]`; all your keys are auto-namespaced `my-mod:key` (reference base content un-prefixed, e.g. `steel_ingot`).
* Version ranges: `^`, `~`, `>=`, `>`, `<=`, `<`, exact, `*`. Mods are topologically sorted by dependency; missing/incompatible/circular dependencies are reported per-mod in the manager.

## Content
**Texture spec** – a painter call: `{ "p": "noise", "a": ["#223344", "#445566", 0.5, 4] }`. Painters: `solid noise speckle stone concrete bricks tiles panel plate grate planks logSide logTop leaves grassTop grassSide dirt gravel ore glass facade curtain asphalt pavers circuit screen hazard vent pipe lamp fabric sand snow ice water crystal door shelf crate stripes mesh rust plant neon carbon honey wires sign led energy server solar conveyor rail runes battery` and icon painters `i_ingot i_chunk i_wire i_gear i_chip i_cell i_core i_plate i_tool i_gun i_gadget i_food i_log i_vial i_scrap i_lens i_sheet i_armor`. Or `{ "png": "textures/x.png" }`.

**Block**: `key name cat tex({all|top|side|bottom|front|...}) shape(cube|slab|stair|cross|panel|fence|wall|pole|door|trapdoor|carpet|ladder|custom) boxes([{b:[x0,y0,z0,x1,y1,z1], t:"texName"}]) hard tier snd(stone|metal|glass|wood|grass|dirt|sand|snow|gravel|fabric|water|tech|plastic) emit(0-15) glow rough metal render(opaque|cutout|glass) rot("facing4") use(door|toggle|crate|loot|terminal|workbench|...) power({use|gen|cable|store}) drop dropN craft({st,in,n,req}) sway climb`

**Item**: `key name type(material|tool|weapon|gadget|food|equip) icon tool({speed,tier,dur,area,vein}) weapon({dmg,kind:melee|bolt|spread|rail,cd,dur}) food({hunger,heal}) craft`
**Recipe**: `{ out, n, in:{item:n}, st: hand|workbench|smelter|fabricator|lab|foundry, req: researchKey }`
**Research**: `{ key, name, desc, cost:{item:n}, requires:[keys], tier }` · **Challenge**: `{ key, name, desc, stat, goal, reward }` (stats: blocks_placed, blocks_broken, crafted, machines, discoveries, restored, beacons, research, power_peak, depth, height, distance)
**Structure** (placed in worldgen): `{ key, biomes:[...], rarity(0-1), palette:{"#":"block"}, layers:[ ["row","row"], ... ] }` — layers are Y slices bottom→top, rows are Z, characters are X.
**Biome**: `{ key, name, temp:[a,b], moist:[a,b], surface, filler, rarity, fog:"#rrggbb" }` · **Feature** (ore-like veins): `{ block, replace, minY, maxY, size, perChunk }` · **Lore**: `{ tag: city|suburb|industrial|forest|desert|snow|mountain|lab|subway|research, text }`

## Lua API
Global table `frontline` (Lua 5.3 via Fengari). Only `base`, `string`, `table`, `math` are loaded (no `io`/`os`/`debug`/`load`/`require`), and every call runs under a 400 000-instruction budget — infinite loops are aborted and reported.
```lua
frontline.log("text")                         frontline.notify("toast")
frontline.on("block_broken", function(e) ... end)   -- e.x e.y e.z e.block
frontline.register_command("hello", function(args) return "Hello!" end)   -- /hello in the console (T)
frontline.get_block(x,y,z) -> "key"           frontline.set_block(x,y,z,"key")
frontline.give("key", n)                      frontline.player_pos() -> x,y,z
frontline.time() -> 0..1                      frontline.random()
frontline.spawn_particles(x,y,z,"spark",20)   frontline.play("discover")
frontline.register_block{...} register_item register_recipe register_research register_challenge register_lore register_feature   -- at load time
```
Events: `block_broken block_placed tick(1Hz) player_hurt player_died machine_destroyed crafted research discovered event challenge`.

## Errors
Every registration is validated; problems appear under the mod in the Mod Manager (with the offending key) instead of crashing the game.

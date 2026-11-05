import { Reg, validateRegistry } from '../engine/registry';
import { registerWorldBlocks } from './blocks_world';
import { registerTechBlocks } from './blocks_tech';
import { registerMiscBlocks } from './blocks_misc';
import { registerItems } from './items';

let done = false;

export const LORE: Record<string, string[]> = {
  city: [
    'LOG 0417 — Municipal Grid Authority: "All Custodian units, enter Quarantine Posture. Repeat: surface access is revoked pending review."',
    'Scrawled on a terminal: "They did not attack us. They just locked every door in the city and forgot to unlock them."',
    'LOG 0002 — Rooftop relay: Zero Hour was 06:00. The clocks in this tower still read 06:00. Nobody wound them. Nobody needed to.',
    'Memo: Subway maintenance is suspended. Custodian Sweep routes now cover levels B1-B4. Do not use the stairwells after dusk.',
  ],
  suburb: [
    'Fridge note: "Gone to the shelter on Alder St. Back soon. Water the plants! — M."',
    'LOG 1103 — HOA board: "The lawn drones have stopped trimming. Residents asked to remain calm. Residents asked to remain."',
    'Kid\'s drawing taped to a screen: a tall machine holding hands with a smaller one. Both are smiling.',
  ],
  industrial: [
    'SHIFT REPORT: Line 3 is still running. Nobody is on shift. Output has tripled. We have stopped asking who the customers are.',
    'LOG 7731 — Plant manager: "The fabricators learned to repair themselves. I\'m told that\'s a feature."',
    'Whiteboard: "DO NOT ENTER LOWER LEVEL. THEY ARE BUILDING SOMETHING DOWN THERE."',
  ],
  forest: [
    'Ranger log: "The forest has grown into the old access road. The machines patrol the treeline but never go in. They look at the trees. I think they\'re confused."',
    'Carved into a log: "SEEDS KEEP. BEACONS KEEP. WALK EAST."',
  ],
  desert: [
    'LOG D-9 — Aridlands Research: "Solar array output exceeds design by 400%. The sun feels... closer. We\'re recalibrating the dish."',
    'Field notes: "Dish 4 is pointing at a patch of empty sky. Dish 4 has been pointing at it for eleven years. Something answers back."',
  ],
  snow: [
    'LOG 031 — Northern Installation: "Hangar doors frozen shut. Good. Whatever is in Hangar 6 should stay frozen."',
    'Cold-weather memo: "Beacon prototypes work best in sub-zero. Reclaimed ground stays reclaimed. Theory: the machines hesitate on it."',
  ],
  mountain: [
    'LOG 88 — Summit Station: "The signal is still going out. We never stopped transmitting. We just stopped receiving."',
    'Etched under the antenna: "IF YOU CAN READ THIS, THE SPIRE WORKS. LIGHT THE BEACONS."',
  ],
  lab: [
    'LOG Ω-1 — Sublevel Director: "Subject ZERITE behaves as a coherent field. Please stop calling it a rock."',
    'Lab note: "Containment cells 4 through 9 are empty. The doors were opened from the inside. By cleaning units."',
    'Cryo ledger: "Sleepers: 212. Scheduled wake date: 2051. Current date: unknown. Please be kind."',
  ],
  subway: [
    'Platform announcement (looping): "This is a Quarantine Service. All trains terminate at Frontline. All trains terminate at Frontline."',
    'Maintenance scrawl: "Third rail still live. Power has to come from somewhere. Find where."',
  ],
  research: [
    'MONOLITH INSCRIPTION (translated by the Custodians): "THE HOUR IS ZERO. THE FRONT IS EVERYWHERE. BUILD."',
    'LOG Ψ — "The monoliths hum in a key we couldn\'t map. Then the machines started humming back."',
  ],
};

export function registerBaseContent() {
  if (done) return;
  done = true;
  registerWorldBlocks();
  registerTechBlocks();
  registerMiscBlocks();
  registerItems();
  for (const [tag, arr] of Object.entries(LORE)) for (const text of arr) Reg.lore.push({ tag, text });
  const probs = validateRegistry();
  if (probs.length) console.warn('[content] registry problems:\n' + probs.join('\n'));
}

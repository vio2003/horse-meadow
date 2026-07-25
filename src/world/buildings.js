/**
 * Where the castle and the stable sit, and what she can't walk through.
 *
 * Every number worth fiddling with after watching her play is in this file.
 * Both buildings open toward +z because the camera sits south of the player and
 * looks north — an entrance facing any other way would put a wall between her
 * and herself.
 */

// ---------- palette ----------
export const PINK = '#F2A8C4'
export const PINK_DEEP = '#D9789F'
export const GOLD = '#E8C15A'
export const GOLD_DEEP = '#C2952F'
export const STONE = '#EADDCB'
export const TIMBER = '#8B5E3C'

// ---------- castle ----------
export const CASTLE = {
  wallH: 5.2,
  outerX: 14.4, // outer face of the side walls
  innerX: 12.0, // inner face — the rideable courtyard edge
  northZ: -46.2, // centre line of the north wall
  southZ: -23.8, // centre line of the south (gate) wall
  wallHD: 1.2, // half-thickness of every curtain wall
  /** Half-width of the hole in the south wall. Widen if riding in feels fiddly. */
  gateHalf: 5.5,
  gateTowerX: 6.2,
  gateTowerR: 2.2,
  gateTowerH: 13,
  cornerX: 13.2,
  cornerR: 3.0,
  cornerH: 11.5,
  fountain: { x: 0, z: -36, r: 2.2 },
  /**
   * Far enough back that its padded footprint clears the north wall's. Let the
   * two overlap and you get a sliver between them that a tap can resolve into
   * but nothing can ever walk to — she'd press against the wall forever.
   */
  keep: { x: 0, z: -55, hw: 8, hd: 4.5, h: 9 },
}

/**
 * Where the solid part of the south wall ends and the gate opening begins.
 * The gate towers are drawn over this line, so collision matches what she sees.
 */
export const GATE_INNER_X = CASTLE.gateTowerX - CASTLE.gateTowerR

/** The rideable part. Also the trigger for fading the front wall out of the way. */
export const COURTYARD = { minX: -12.4, maxX: 12.4, minZ: -45.4, maxZ: -24.4 }

// ---------- stable ----------
export const STABLE = {
  x: -27,
  z: -12.5,
  hw: 12, // x from -39 to -15
  hd: 5.5, // z from -18 to -7
  wallHD: 0.6,
  eaveY: 3.6,
  ridgeY: 5.6,
  backZ: -17.4, // centre line of the back wall
}

/**
 * One stall per horse, so the "stay here" button always has somewhere to put
 * one. Horses line up at STALL_APPROACH_Z first and then back in, which keeps
 * them from walking diagonally through the stall dividers.
 */
export const STALLS = [-35, -31, -27, -23, -19].map((x) => ({ x, z: -15.2 }))
export const STALL_COUNT = STALLS.length
export const STALL_APPROACH_Z = -10.5

/** Inside here (plus a little apron out front), the stable button appears. */
export const STABLE_ZONE = { minX: -39, maxX: -15, minZ: -18, maxZ: -5 }

export function inRect(x, z, r) {
  return x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ
}

// ---------- collision ----------
/**
 * Boxes ({x, z, hw, hd}) and circles ({x, z, r}). There is no physics engine
 * here and there doesn't need to be: pushing a point out along its shallowest
 * axis gives wall-sliding for free, so a tap past a wall walks her along it
 * instead of stopping her dead. Nothing can trap her, which matters more than
 * accuracy.
 */
export const BLOCKERS = [
  // curtain walls
  { x: 0, z: CASTLE.northZ, hw: CASTLE.outerX, hd: CASTLE.wallHD },
  { x: CASTLE.cornerX, z: -35, hw: CASTLE.wallHD, hd: 11.2 },
  { x: -CASTLE.cornerX, z: -35, hw: CASTLE.wallHD, hd: 11.2 },
  // The south wall runs all the way in to the gate towers' inner edge, and the
  // towers get no blocker of their own. A circle poking out of a flat wall
  // makes a notch, and riding at the gate from an angle wedges her in it —
  // which is unacceptable at the one spot she aims for most. Flush instead.
  { x: (GATE_INNER_X + CASTLE.outerX) / 2, z: CASTLE.southZ, hw: (CASTLE.outerX - GATE_INNER_X) / 2, hd: CASTLE.wallHD },
  { x: -(GATE_INNER_X + CASTLE.outerX) / 2, z: CASTLE.southZ, hw: (CASTLE.outerX - GATE_INNER_X) / 2, hd: CASTLE.wallHD },
  // corner towers
  { x: CASTLE.cornerX, z: CASTLE.northZ, r: CASTLE.cornerR },
  { x: -CASTLE.cornerX, z: CASTLE.northZ, r: CASTLE.cornerR },
  { x: CASTLE.cornerX, z: CASTLE.southZ, r: CASTLE.cornerR },
  { x: -CASTLE.cornerX, z: CASTLE.southZ, r: CASTLE.cornerR },
  // courtyard fountain
  { x: CASTLE.fountain.x, z: CASTLE.fountain.z, r: CASTLE.fountain.r + 0.2 },
  // the keep is scenery — she can see it, she can't get behind the wall to it
  { x: CASTLE.keep.x, z: CASTLE.keep.z, hw: CASTLE.keep.hw, hd: CASTLE.keep.hd },
  // stable shell: back and sides. The front is deliberately open.
  { x: STABLE.x, z: STABLE.backZ, hw: STABLE.hw, hd: STABLE.wallHD },
  { x: STABLE.x - STABLE.hw + 0.6, z: STABLE.z, hw: STABLE.wallHD, hd: STABLE.hd },
  { x: STABLE.x + STABLE.hw - 0.6, z: STABLE.z, hw: STABLE.wallHD, hd: STABLE.hd },
]

/**
 * Footprints the meadow's grass, flowers, rocks and trees are kept out of, so
 * nothing sprouts through a stone floor.
 */
const FOOTPRINTS = [
  { minX: -16, maxX: 16, minZ: -49, maxZ: -21 }, // castle
  { minX: -6, maxX: 6, minZ: -24, maxZ: -14 }, // the apron outside the gate
  { minX: -10, maxX: 10, minZ: -62, maxZ: -49 }, // keep
  { minX: -41, maxX: -13, minZ: -20, maxZ: -5 }, // stable
]

export function isBuiltOn(x, z) {
  return FOOTPRINTS.some((r) => inRect(x, z, r))
}

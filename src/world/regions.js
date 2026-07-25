/**
 * The shape of the world.
 *
 * It used to be one disc — a meadow of radius 52 around the origin. Now it's the
 * **union of overlapping circles**, one per place, and she rides between them.
 * No menus and no loading, which this game has never had and shouldn't start
 * having; the horse is the way you cover distance.
 *
 * Circles rather than rectangles because the clamp in shared.js is what actually
 * decides where she can go, and pushing a point back onto the nearest circle is
 * two lines of arithmetic that cannot fail. Anything cleverer here would be a
 * pathfinder, and this game deliberately doesn't have one.
 *
 * **The numbers matter.** Each outer region overlaps the meadow by ~11 units,
 * which leaves a doorway 42–45 units wide — wide enough that a horse rides
 * through without aiming. The overlap is deliberately deep rather than a
 * kissing touch: where two circles cross they form a concave notch, and
 * tasks/todo.md records a notch at the castle gate that wedged her in place at
 * the one spot she aimed for most. A deep overlap makes that notch shallow, and
 * tests/world.mjs sweeps every doorway to prove it.
 *
 * The doorways are also placed so the *approach* to them is clear, which is a
 * stronger requirement than the doorway itself being clear. The snow started out
 * to the north-west, and its doorway was fine — but the ride to it went straight
 * through the stable, and this game has no pathfinding, so she simply stopped at
 * the wall. It sits due west now, along the one westward line that misses the
 * stable's z range entirely.
 */

/**
 * `y` is the height each region's ground disc is drawn at.
 *
 * They have to differ. Regions overlap by design — that overlap *is* the
 * doorway — and two coplanar discs at the same height z-fight into a shimmering
 * mess exactly where she walks between places. A few thousandths apart is
 * invisible from the chase camera and completely fixes it.
 */
export const REGIONS = [
  {
    id: 'meadow',
    x: 0,
    z: 0,
    r: 52,
    y: 0.01,
    ground: '#79B364',
  },
  {
    id: 'beach',
    x: 80,
    z: 4,
    r: 40,
    y: 0.014,
    ground: '#E4D5A8',
  },
  {
    id: 'town',
    x: 4,
    z: 78,
    r: 38,
    y: 0.018,
    ground: '#84AC63',
  },
  {
    id: 'snow',
    x: -80,
    z: 14,
    r: 40,
    y: 0.022,
    ground: '#E8F0F6',
  },
]

/** Home. The horses never leave it, and it's the one every doorway leads back to. */
export const MEADOW = REGIONS[0]

export const region = (id) => REGIONS.find((g) => g.id === id)

/** How far outside a region a point is. Negative means inside. */
export function edgeDistance(g, x, z) {
  return Math.hypot(x - g.x, z - g.z) - g.r
}

export function inRegion(g, x, z) {
  return edgeDistance(g, x, z) <= 0
}

/** Is this anywhere she's allowed to be, before buildings are considered? */
export function inWorld(x, z) {
  return REGIONS.some((g) => inRegion(g, x, z))
}

/**
 * The region a point belongs to — the one it's inside, or if it's out in the
 * gaps between them, the one whose edge is closest. That second case is what
 * turns a tap on the far hills into a walk to the fence rather than a walk into
 * nothing.
 */
export function nearestRegion(x, z) {
  let best = REGIONS[0]
  let bestD = Infinity
  for (const g of REGIONS) {
    const d = edgeDistance(g, x, z)
    if (d <= 0) return g
    if (d < bestD) {
      bestD = d
      best = g
    }
  }
  return best
}

/**
 * Points around a region's rim where it genuinely borders nothing.
 *
 * A boundary she can't see is an invisible wall, so every region gets a ring of
 * *something* — fence posts, surf, snowdrifts, hedges. But a marker that falls
 * inside a neighbouring region isn't a boundary at all, it's a doorway, and
 * fencing off your own doorway is the kind of thing that gets found by a
 * six-year-old in about four seconds. Those get dropped.
 */
export function edgeMarkers(g, count, outset = 0) {
  const out = []
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    const x = g.x + Math.cos(a) * (g.r + outset)
    const z = g.z + Math.sin(a) * (g.r + outset)
    if (REGIONS.some((o) => o !== g && inRegion(o, x, z))) continue
    out.push({ x, z, a })
  }
  return out
}

/** How far out the whole world reaches, for ground planes and fog. */
export const WORLD_REACH = Math.max(
  ...REGIONS.map((g) => Math.hypot(g.x, g.z) + g.r)
)

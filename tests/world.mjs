/**
 * Headless check of the real game modules, loaded through Vite so the project's
 * own import resolution applies. Two questions matter:
 *
 *   1. Can she actually get where she's meant to go?
 *   2. Is her horse still in its stall tomorrow?
 *
 * Run it with `npm test`. It also runs automatically before you push a version
 * tag — see .githooks/pre-push. Deliberately not run in CI: it boots Vite a few
 * times and takes a moment, and production shouldn't be gated on it remotely.
 *
 * This replays the real movement code frame by frame rather than testing a
 * reimplementation of it, which is the only reason it has ever caught anything.
 */
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// store.js touches localStorage at import time. Give it a real one.
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}

const boot = () =>
  createServer({
    root: ROOT,
    configFile: false,
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  })

let fails = 0
const ok = (name, cond, extra = '') => {
  if (!cond) fails++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
}

const server = await boot()
const THREE = await server.ssrLoadModule('three')
const { clampToWorld, clampToMeadow, MEADOW_RADIUS } =
  await server.ssrLoadModule('/src/world/shared.js')
const REG = await server.ssrLoadModule('/src/world/regions.js')
const B = await server.ssrLoadModule('/src/world/buildings.js')
const { useGame, foalSpawn, canRide, FOAL_GROW_MS, CHARACTERS, characterOr } =
  await server.ssrLoadModule('/src/store.js')

const inside = (x, z, pad = 0) =>
  B.BLOCKERS.some((b) => {
    if (b.r !== undefined) return Math.hypot(x - b.x, z - b.z) < b.r + pad
    return Math.abs(x - b.x) < b.hw + pad && Math.abs(z - b.z) < b.hd + pad
  })

/** Replays Player/Horse movement exactly: step toward target, clamp, repeat. */
function walk(from, to, { speed = 5.4, pad = 0.5, seconds = 40, clamp = clampToWorld } = {}) {
  const pos = new THREE.Vector3(from[0], 0, from[1])
  const target = new THREE.Vector3(to[0], 0, to[1])
  const d = new THREE.Vector3()
  const dt = 1 / 60
  let stuckFor = 0
  const prev = pos.clone()
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    d.copy(target).sub(pos)
    d.y = 0
    const len = d.length()
    if (len < 0.25) return { reached: true, pos, seconds: i * dt }
    d.normalize()
    pos.addScaledVector(d, Math.min(speed * dt, len))
    clamp(pos, pad)
    if (pos.distanceTo(prev) < 1e-4) {
      if (++stuckFor > 90) return { reached: false, pos, stuck: true }
    } else stuckFor = 0
    prev.copy(pos)
  }
  return { reached: false, pos, timeout: true }
}
const at = (r) => `${r.pos.x.toFixed(1)},${r.pos.z.toFixed(1)}${r.stuck ? ' STUCK' : ''}`

/**
 * Somewhere she is allowed to be: inside some region.
 *
 * `slack` is not a fudge. The castle's keep and corner towers sit *on* the
 * meadow's edge, and being ejected from a wall deliberately takes priority over
 * the world boundary — better a step outside the world than inside a tower. So
 * a tap resolving behind the castle lands a fraction proud of the fence, in a
 * spot the north wall means she can never reach anyway. The failure this check
 * exists to catch is a tap stranded in the empty *gaps between regions*, and
 * that would miss by tens of units, not by one.
 */
const legal = (x, z, slack = 1.5) =>
  REG.REGIONS.some((g) => Math.hypot(x - g.x, z - g.z) <= g.r + slack)
/** The point where two regions' circles cross — the doorway between them. */
function doorway(a, b) {
  const d = Math.hypot(b.x - a.x, b.z - a.z)
  const t = (d * d - b.r * b.r + a.r * a.r) / (2 * d)
  const ux = (b.x - a.x) / d
  const uz = (b.z - a.z) / d
  return { x: a.x + ux * t, z: a.z + uz * t, ux, uz, half: Math.sqrt(a.r * a.r - t * t) }
}

console.log('--- blockers are sane ---')
for (const s of [[-14, 6], [22, -6], [17, -16], [-28, 14], [30, 24], [0, 6]]) {
  ok(`${s} is open ground`, !inside(s[0], s[1], 1.0))
}

console.log('\n--- the gate is passable on a horse ---')
const ride = walk([0, -8], [0, -42], { speed: 5.2, pad: 1.0 })
ok('rides from the meadow into the courtyard', ride.reached, at(ride))
ok('and ends up inside the courtyard', B.inRect(ride.pos.x, ride.pos.z, B.COURTYARD))
// Off-centre approaches are the realistic case — she will not tap dead centre.
// Sweep the whole southern approach. Every start point is checked to be in the
// open first, so a failure here means the gate, not the test.
let inFails = []
let swept = 0
for (const startX of [-12,-11,-9,-7,-6,-5,-3,-1,1,3,5,6,7,9,11,12]) {
  for (const startZ of [-8, -14, -20]) {
    if (inside(startX, startZ, 1.0)) continue
    swept++
    const r = walk([startX, startZ], [0, -42], { speed: 5.2, pad: 1.0 })
    if (!(r.reached && B.inRect(r.pos.x, r.pos.z, B.COURTYARD))) inFails.push(`${startX},${startZ} -> ${at(r)}`)
  }
}
ok(`rides in from all ${swept} southern approaches`, inFails.length === 0, inFails.slice(0, 6).join(' | '))

// Every corner of the rideable courtyard, from the middle.
let cornerFails = []
for (const [cx, cz] of [[-9,-42],[9,-42],[-9,-27],[9,-27],[-10,-40],[10,-40]]) {
  if (inside(cx, cz, 1.0)) { cornerFails.push(`${cx},${cz} is not open ground`); continue }
  const r = walk([0, -31], [cx, cz], { speed: 5.2, pad: 1.0 })
  if (!r.reached) cornerFails.push(`${cx},${cz} -> ${at(r)}`)
}
ok('reaches every corner of the courtyard', cornerFails.length === 0, cornerFails.join(' | '))

// Riding the length of each wall face, which is where a notch would catch her.
let wallFails = []
for (const [name, from, to] of [
  ['inside, along the north wall', [-9,-42], [9,-42]],
  ['inside, along the south wall', [-9,-27], [9,-27]],
  ['inside, along the east wall', [10,-27], [10,-42]],
  ['inside, along the west wall', [-10,-42], [-10,-27]],
  ['outside, past the gate', [-18,-19], [18,-19]],
]) {
  const r = walk(from, to, { speed: 5.2, pad: 1.0 })
  if (!r.reached) wallFails.push(`${name} -> ${at(r)}`)
}
ok('rides the length of every wall face without catching', wallFails.length === 0, wallFails.join(' | '))

// A wall between her and the tap is meant to stop her. What must NOT happen is
// jitter, escaping the wall, or ending up somewhere illegal — Player's stall
// detector then drops the destination so she isn't left grinding.
const blocked = walk([-20, -35], [0, -35], { speed: 5.2, pad: 1.0 })
ok('a tap behind a wall stops her at the wall',
  !blocked.reached && blocked.stuck && !inside(blocked.pos.x, blocked.pos.z, 1.0 - 1e-6),
  at(blocked))

const out = walk([0, -42], [0, -12], { speed: 5.2, pad: 1.0 })
ok('rides back out through the gate', out.reached, at(out))
const round = walk([-8, -36], [8, -36], { speed: 5.2, pad: 1.0 })
ok('rides past the fountain without sticking', round.reached, at(round))
const corner = walk([0, -42], [-10.5, -42.5], { speed: 5.2, pad: 1.0 })
ok('reaches a far courtyard corner', corner.reached, at(corner))

console.log('\n--- the stable works ---')
for (const [i, stall] of B.STALLS.entries()) {
  ok(`stall ${i} (x=${stall.x}) is clear of the walls`, !inside(stall.x, stall.z, 1.0))
  ok(`stall ${i} is inside the button zone`, B.inRect(stall.x, stall.z, B.STABLE_ZONE))
  const a = walk([-27, -4], [stall.x, B.STALL_APPROACH_Z], { speed: 1.3, pad: 1.0, seconds: 90 })
  const b = a.reached
    ? walk([a.pos.x, a.pos.z], [stall.x, stall.z], { speed: 1.3, pad: 1.0, seconds: 90 })
    : null
  ok(`a horse walks itself into stall ${i}`, !!b?.reached, b ? at(b) : 'never lined up')
}
const rideIn = walk([-27, 2], [-27, -13], { speed: 5.2, pad: 1.0 })
ok('rides into the stable', rideIn.reached && B.inRect(rideIn.pos.x, rideIn.pos.z, B.STABLE_ZONE), at(rideIn))

console.log('\n--- taps always resolve somewhere reachable ---')
for (const [name, x, z] of [
  ['inside the north wall', 0, -46.2],
  ['inside a corner tower', 13.2, -23.8],
  ['inside the fountain', 0, -36],
  ['inside the keep', 0, -53],
  ['inside the stable back wall', -27, -17.4],
  ['miles outside the meadow', 0, -140],
  ['on the gate itself', 0, -23.8],
]) {
  const t = clampToWorld(new THREE.Vector3(x, 0, z), 1.0)
  ok(
    `tap ${name} lands somewhere legal`,
    !inside(t.x, t.z, 1.0 - 1e-6) && legal(t.x, t.z),
    `-> ${t.x.toFixed(1)},${t.z.toFixed(1)}`
  )
}

console.log('\n--- the world is bigger than the meadow ---')

const OUTER = REG.REGIONS.filter((g) => g.id !== 'meadow')
ok('there are four regions', REG.REGIONS.length === 4, REG.REGIONS.map((g) => g.id).join(','))

// Every doorway must be wide enough to ride through without aiming, and must
// not open onto a building.
for (const g of OUTER) {
  const d = doorway(REG.MEADOW, g)
  ok(`the ${g.id} doorway is wide`, d.half * 2 > 20, `${(d.half * 2).toFixed(0)} units`)
  ok(`the ${g.id} doorway is not blocked by a building`, !inside(d.x, d.z, 1.0),
    `at ${d.x.toFixed(0)},${d.z.toFixed(0)}`)
}

// The whole point of the feature: she can get there, and get home again.
for (const g of OUTER) {
  const out = walk([0, 8], [g.x, g.z], { speed: 5.2, pad: 1.0, seconds: 120 })
  ok(`rides from the meadow to the ${g.id}`, out.reached, at(out))
  const home = walk([g.x, g.z], [0, 8], { speed: 5.2, pad: 1.0, seconds: 120 })
  ok(`and rides home from the ${g.id}`, home.reached, at(home))
}

// A notch where two circles cross is exactly what wedged her at the castle gate.
// Cross every doorway off-centre, in both directions, and along its face.
let doorFails = []
let doorTries = 0
for (const g of OUTER) {
  const d = doorway(REG.MEADOW, g)
  const px = -d.uz
  const pz = d.ux
  for (const off of [-14, -9, -4, 0, 4, 9, 14]) {
    const midX = d.x + px * off
    const midZ = d.z + pz * off
    // in from the meadow side, out from the region side, and back again
    const inner = [midX - d.ux * 26, midZ - d.uz * 26]
    const outer = [midX + d.ux * 26, midZ + d.uz * 26]
    // Skip endpoints sitting on a building — including its open interior, which
    // is why this tests isBuiltOn and not just the blockers. The stable is only
    // enterable from the front, and walking at its back wall from outside is the
    // game's documented no-pathfinding behaviour, not a doorway fault.
    const onBuilding = (p) => inside(p[0], p[1], 1.0) || B.isBuiltOn(p[0], p[1])
    if (onBuilding(inner) || onBuilding(outer)) continue
    for (const [from, to, way] of [[inner, outer, 'out'], [outer, inner, 'back']]) {
      doorTries++
      const r = walk(from, to, { speed: 5.2, pad: 1.0, seconds: 60 })
      if (!r.reached) doorFails.push(`${g.id} ${way} @${off} -> ${at(r)}`)
    }
  }
}
ok(`rides through every doorway, ${doorTries} crossings, without catching on the notch`,
  doorFails.length === 0, doorFails.slice(0, 6).join(' | '))

// Taps anywhere at all — including the empty gaps between regions, which is
// where a union-of-circles world can strand her if the clamp is wrong.
let tapFails = []
let taps = 0
for (let x = -130; x <= 140; x += 10) {
  for (let z = -110; z <= 130; z += 10) {
    taps++
    const t = clampToWorld(new THREE.Vector3(x, 0, z), 1.0)
    if (inside(t.x, t.z, 1.0 - 1e-6) || !legal(t.x, t.z)) {
      tapFails.push(`${x},${z} -> ${t.x.toFixed(1)},${t.z.toFixed(1)}`)
    }
  }
}
ok(`all ${taps} taps across the whole world resolve somewhere legal`,
  tapFails.length === 0, tapFails.slice(0, 6).join(' | '))

console.log('\n--- the mountain turns her aside, it does not swallow her ---')

const MT = B.MOUNTAIN
ok('the mountain is inside the snow', REG.inRegion(REG.region('snow'), MT.x, MT.z))
// Straight at it from every side: she must end up outside it, never inside.
let mtFails = []
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2
  const from = [MT.x + Math.cos(a) * (MT.r + 16), MT.z + Math.sin(a) * (MT.r + 16)]
  if (!legal(from[0], from[1], 0)) continue
  const r = walk(from, [MT.x, MT.z], { speed: 5.2, pad: 1.0, seconds: 40 })
  const d = Math.hypot(r.pos.x - MT.x, r.pos.z - MT.z)
  if (d < MT.r) mtFails.push(`from ${a.toFixed(1)}rad ended ${d.toFixed(1)} from centre`)
}
ok('riding at the mountain from any side never gets inside it', mtFails.length === 0,
  mtFails.join(' | '))
// And she can get round it — the thing a circle blocker is supposed to give free.
const around = walk(
  [MT.x, MT.z - MT.r - 10],
  [MT.x, MT.z + MT.r + 10],
  { speed: 5.2, pad: 1.0, seconds: 90 }
)
ok('and she can ride around it to the far side', around.reached, at(around))

console.log('\n--- the town is rideable ---')

let houseFails = []
for (const h of B.HOUSES) {
  ok(`house at ${h.x},${h.z} is in the town`, REG.inRegion(REG.region('town'), h.x, h.z))
}
// Out from the green to each doorstep and back — the route she'd actually take,
// because riding at the *far* side of a house means the house is in the way and
// this game has no pathfinding. What must never happen is a house walled off.
const GREEN = [REG.region('town').x, REG.region('town').z]
for (const h of B.HOUSES) {
  const step = [h.x, h.z - h.hd - 3]
  if (inside(step[0], step[1], 1.0)) {
    houseFails.push(`doorstep of ${h.x},${h.z} is inside a wall`)
    continue
  }
  const out = walk(GREEN, step, { speed: 5.2, pad: 1.0, seconds: 90 })
  if (!out.reached) houseFails.push(`green -> ${h.x},${h.z} ${at(out)}`)
  const back = walk(step, GREEN, { speed: 5.2, pad: 1.0, seconds: 90 })
  if (!back.reached) houseFails.push(`${h.x},${h.z} -> green ${at(back)}`)
}
ok('rides from the green to every doorstep and back', houseFails.length === 0,
  houseFails.slice(0, 4).join(' | '))

// And in from the meadow, off-centre, without a house standing in the road.
const intoTown = walk([2, 40], GREEN, { speed: 5.2, pad: 1.0, seconds: 120 })
ok('rides in from the meadow to the green', intoTown.reached, at(intoTown))

console.log('\n--- the horses stay in the meadow ---')

// A horse fleeing flat out for a minute must still be in the meadow.
for (const [name, from, to] of [
  ['toward the beach', [40, 4], [200, 4]],
  ['toward the town', [4, 40], [4, 200]],
  ['toward the snow', [-36, -22], [-200, -160]],
]) {
  const r = walk(from, to, { speed: 6.4, pad: 1.0, seconds: 60, clamp: clampToMeadow })
  ok(`a horse bolting ${name} is held at the meadow fence`,
    Math.hypot(r.pos.x, r.pos.z) <= MEADOW_RADIUS + 1e-6, at(r))
}
// She, on the other hand, is not.
const outRun = walk([40, 4], [200, 4], { speed: 5.2, pad: 1.0, seconds: 60 })
ok('but she can ride past it', Math.hypot(outRun.pos.x, outRun.pos.z) > MEADOW_RADIUS, at(outRun))

console.log('\n--- scatter is kept off the buildings ---')
ok('courtyard counts as built on', B.isBuiltOn(0, -35))
ok('stable counts as built on', B.isBuiltOn(-27, -12.5))
ok('open meadow does not', !B.isBuiltOn(20, 20))

console.log('\n--- stabling, and still stabled tomorrow ---')
const g = () => useGame.getState()
// Foals can't be ridden, so they can't be stabled either — the stable is
// entirely a grown-horse affair, and these checks are about the grown ones.
const grownOnes = () => g().horses.filter((h) => !h.foal)
ok('the meadow holds five grown horses and three foals',
  grownOnes().length === 5 && g().horses.filter((h) => h.foal).length === 3,
  `${g().horses.length} horses`)
ok('nothing is stabled on a fresh save', g().horses.every((h) => h.stall === null))
// Tame and stable every grown horse — five horses, five stalls, no one left out.
for (const h of grownOnes()) {
  g().tame(h.id)
  g().nameHorse(h.id, 'Star')
  g().mount(h.id)
  g().stableHorse(h.id)
}
const stalls = grownOnes().map((h) => h.stall)
ok('all five grown horses got a stall', stalls.every((s) => s !== null), `stalls ${stalls}`)
ok('no two horses share a stall', new Set(stalls).size === 5)
ok('stabling hops her down', g().mounted === null)

const saved = JSON.parse(store.get('horse-meadow-save-v1'))
ok('stalls are written to the save', Object.values(saved.tamed).every((h) => h.stall !== undefined))

// Re-import the module from a second Vite server: this is "she opens it tomorrow".
const server2 = await boot()
const { useGame: reloaded } = await server2.ssrLoadModule('/src/store.js')
const reloadedGrown = reloaded.getState().horses.filter((h) => !h.foal)
const after = reloadedGrown.map((h) => h.stall)
ok('every horse is still in the same stall after a reload', String(after) === String(stalls), `${after}`)
ok('and still tamed', reloadedGrown.every((h) => h.tamed))

// Five stalls, and once foals grow up there are more than five horses that
// could want one. The odd one out must stay with her rather than vanish.
const spare = g().horses.find((h) => h.foal)
g().tame(spare.id)
g().growUp(Date.now() + FOAL_GROW_MS)
g().mount(spare.id)
g().stableHorse(spare.id)
const spareNow = g().horses.find((h) => h.id === spare.id)
ok('a sixth horse finds no free stall and stays with her',
  spareNow.stall === null && g().mounted === spare.id, `stall ${spareNow.stall}`)
g().dismount()

// A corrupt save must not put a horse inside a wall.
store.set(
  'horse-meadow-save-v1',
  JSON.stringify({ tamed: { h1: { name: 'Star', coat: 0, stall: 99 }, h2: { name: 'Moon', coat: 1, stall: 0 }, h3: { name: 'Berry', coat: 2, stall: 0 } } })
)
const server3 = await boot()
const { useGame: corrupt } = await server3.ssrLoadModule('/src/store.js')
const cs = corrupt.getState().horses.map((h) => h.stall)
ok('an out-of-range stall is dropped', cs[0] === null, `h1 -> ${cs[0]}`)
ok('a double-booked stall is dropped for the second horse', cs[1] === 0 && cs[2] === null, `${cs}`)

console.log('\n--- foals ---')

// Where a foal turns up is random, which is exactly why one sample proves
// nothing. Check five hundred of them.
const spawnFails = []
for (let i = 0; i < 500; i++) {
  const [x, , z] = foalSpawn()
  if (inside(x, z, 1.0 - 1e-6) || Math.hypot(x, z) > MEADOW_RADIUS + 1e-6) {
    spawnFails.push(`${x.toFixed(1)},${z.toFixed(1)}`)
  }
}
ok('500 random foal spawns all land on open ground inside the meadow',
  spawnFails.length === 0, spawnFails.slice(0, 5).join(' | '))

ok('a foal cannot be ridden', !canRide({ tamed: true, foal: true }))
ok('a grown horse she has tamed can', canRide({ tamed: true, foal: false }))
ok('a wild horse cannot', !canRide({ tamed: false, foal: false }))

// Growing up, on a store with nothing saved.
store.clear()
const server4 = await boot()
const { useGame: fresh } = await server4.ssrLoadModule('/src/store.js')
const f = () => fresh.getState()
const one = (id) => f().horses.find((h) => h.id === id)
const foalId = f().horses.find((h) => h.foal).id
const t0 = Date.now()

f().growUp(t0 + 60 * 60 * 1000)
ok('an untamed foal never grows up, however long she leaves it',
  f().horses.filter((h) => h.foal).length === 3)

f().tame(foalId)
f().nameHorse(foalId, 'Blossom')
const coatBefore = one(foalId).coat
f().growUp(t0 + FOAL_GROW_MS - 1000)
ok('a tamed foal is still a foal a second short of five minutes', one(foalId).foal)
f().growUp(t0 + FOAL_GROW_MS + 1000)
ok('and is a grown horse a second past it', !one(foalId).foal)
ok('so now she can ride it', canRide(one(foalId)))
ok('it is the same horse she named, in the same colour',
  one(foalId).name === 'Blossom' && one(foalId).coat === coatBefore)

// She closes the app with a foal part-grown and opens it again tomorrow.
store.clear()
const now = Date.now()
store.set(
  'horse-meadow-save-v1',
  JSON.stringify({
    tamed: {
      f1: { name: 'Berry', coat: 4, stall: null, foal: true, tamedAt: now - 10 * 60 * 1000 },
      f2: { name: 'Daisy', coat: 5, stall: null, foal: true, tamedAt: now - 60 * 1000 },
    },
  })
)
const server5 = await boot()
const { useGame: tomorrow } = await server5.ssrLoadModule('/src/store.js')
const t = (id) => tomorrow.getState().horses.find((h) => h.id === id)
ok('a foal tamed ten minutes ago grew up while the app was closed',
  !t('f1').foal && t('f1').name === 'Berry')
ok('one tamed a minute ago is still a foal', t('f2').foal)
tomorrow.getState().growUp(now + 3 * 60 * 1000)
ok('and is not rushed by the reload — four minutes in, still a foal', t('f2').foal)
tomorrow.getState().growUp(now + 4 * 60 * 1000 + 1000)
ok('it finishes on its original clock, not one restarted at load', !t('f2').foal)

console.log('\n--- which girl she plays as ---')

ok('there are three to choose between', CHARACTERS.length === 3,
  CHARACTERS.map((c) => c.id).join(','))
ok('every one has a label and a model file',
  CHARACTERS.every((c) => c.id && c.label && /\.glb$/.test(c.file)))
ok('an unknown id falls back to the first rather than to nothing',
  characterOr('nonesuch').id === CHARACTERS[0].id)
ok('and so does a missing one', characterOr(undefined).id === CHARACTERS[0].id)

store.clear()
const server6 = await boot()
const { useGame: picked } = await server6.ssrLoadModule('/src/store.js')
ok('she starts as the first character', picked.getState().character === CHARACTERS[0].id)

picked.getState().chooseCharacter(CHARACTERS[2].id)
ok('choosing another switches her', picked.getState().character === CHARACTERS[2].id)
ok('and writes it to the save',
  JSON.parse(store.get('horse-meadow-save-v1')).character === CHARACTERS[2].id)

// Choosing must not disturb her horses — it shares a save with them.
picked.getState().tame('h1')
picked.getState().nameHorse('h1', 'Star')
picked.getState().chooseCharacter(CHARACTERS[1].id)
const kept = JSON.parse(store.get('horse-meadow-save-v1'))
ok('and does not lose the horses she has already tamed',
  kept.tamed.h1?.name === 'Star' && kept.character === CHARACTERS[1].id)

const server7 = await boot()
const { useGame: nextDay } = await server7.ssrLoadModule('/src/store.js')
ok('she is still the girl she picked when she opens it tomorrow',
  nextDay.getState().character === CHARACTERS[1].id)
ok('and her horse is still tamed', nextDay.getState().horses.find((h) => h.id === 'h1')?.tamed)

// A save naming a character that no longer exists must still boot.
store.set('horse-meadow-save-v1', JSON.stringify({ tamed: {}, character: 'wizard' }))
const server8 = await boot()
const { useGame: gone } = await server8.ssrLoadModule('/src/store.js')
ok('a character that no longer exists falls back to the first',
  gone.getState().character === CHARACTERS[0].id, `${gone.getState().character}`)

console.log('\n--- advanced controls ---')

const C = await server.ssrLoadModule('/src/controls.js')

/** Run the meter for `seconds`, sprinting or resting, at 60fps. */
function wind(stamina, seconds, sprinting) {
  const dt = 1 / 60
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    stamina = C.stepStamina(stamina, { sprinting, dt })
  }
  return stamina
}

ok('ten seconds of sprinting empties the bar', wind(1, 10, true) <= 0.0001,
  wind(1, 10, true).toFixed(4))
ok('and it is not empty a moment before', wind(1, 9.5, true) > 0.02,
  wind(1, 9.5, true).toFixed(3))
ok('fifteen seconds of rest refills it', wind(0, 15, false) >= 0.9999,
  wind(0, 15, false).toFixed(4))
ok('and it is not full a moment before', wind(0, 14.5, false) < 0.99,
  wind(0, 14.5, false).toFixed(3))
ok('resting never overfills', wind(1, 30, false) === 1)
ok('sprinting never goes below empty', wind(0, 30, true) === 0)
ok('not sprinting only ever recovers', wind(0.5, 1, false) > 0.5)

// The winded latch: empty means no sprint until it has recovered a quarter.
ok('an empty horse will not sprint', !C.canSprint(0, false))
ok('nor after a sliver of recovery', !C.canSprint(0.2, false))
ok('but it will once it has a quarter back', C.canSprint(0.25, false))
ok('a horse already sprinting keeps going on the last drop', C.canSprint(0.01, true))
ok('and stops when there is nothing left', !C.canSprint(0, true))

// Stick geometry. The camera never rotates, so up is -z and right is +x.
const up = C.stickAxis(0, -50, 56)
ok('pushing the stick up walks away from the camera', up.z < -0.99 && Math.abs(up.x) < 1e-9,
  `${up.x.toFixed(2)},${up.z.toFixed(2)}`)
const right = C.stickAxis(50, 0, 56)
ok('pushing it right goes +x', right.x > 0.99 && Math.abs(right.z) < 1e-9)
const down = C.stickAxis(0, 50, 56)
ok('pushing it down comes back toward the camera', down.z > 0.99)

ok('a nudge inside the dead zone does nothing', C.stickAxis(4, 4, 56).mag === 0)
ok('a push past the rim is still full tilt, not more', C.stickAxis(0, -400, 56).mag === 1)
const diag = C.stickAxis(40, -40, 56)
ok('a diagonal is unit length, so it is no faster than straight',
  Math.abs(Math.hypot(diag.x, diag.z) - 1) < 1e-9, Math.hypot(diag.x, diag.z).toFixed(6))
ok('and its magnitude is what was actually pushed',
  diag.mag > 0.99 && diag.mag <= 1, diag.mag.toFixed(3))

/**
 * Replay the stick exactly as Player and Horse do it: turn a thumb offset into
 * an axis with the real stickAxis, step, clamp with the real clampToWorld.
 *
 * The browser is where this feature is *felt*, but the browser is not where it
 * can be proved — so the arithmetic between thumb and position gets checked
 * here, with the real functions, the same way walk() has always covered
 * tap-to-move.
 */
function drive(from, { dx, dy, seconds = 1, top, sprint = false, sprintTop, clamp = clampToWorld, pad = 0.5 }) {
  const pos = new THREE.Vector3(from[0], 0, from[1])
  const dt = 1 / 60
  const a = C.stickAxis(dx, dy, 56)
  const speed = (sprint ? sprintTop : top) * a.mag
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    pos.x += a.x * speed * dt
    pos.z += a.z * speed * dt
    clamp(pos, pad)
  }
  return { pos, axis: a, speed }
}

// On foot: RUN * mag, and past 0.75 tilt she is running (which spooks horses).
const PLAYER_RUN = 5.4
const full = drive([0, 6], { dx: 0, dy: -56, seconds: 1, top: PLAYER_RUN })
ok('a full push walks her a full second of run speed',
  Math.abs(full.pos.z - (6 - PLAYER_RUN)) < 0.05, `z ${full.pos.z.toFixed(2)}`)
ok('and she ends up north of where she started', full.pos.z < 6)

const half = drive([0, 6], { dx: 0, dy: -28, seconds: 1, top: PLAYER_RUN })
ok('a half push moves her about half as far',
  Math.abs((6 - half.pos.z) - PLAYER_RUN / 2) < 0.05, `${(6 - half.pos.z).toFixed(2)}`)
ok('a half push is not running', half.axis.mag <= 0.75)
ok('a full push is running', full.axis.mag > 0.75)

const east = drive([0, 6], { dx: 56, dy: 0, seconds: 1, top: PLAYER_RUN })
ok('pushing right takes her east', east.pos.x > 5 && Math.abs(east.pos.z - 6) < 1e-6,
  `${east.pos.x.toFixed(2)},${east.pos.z.toFixed(2)}`)

// The stick obeys the world's edges exactly as a tap does.
const intoFence = drive([0, 40], { dx: 0, dy: 56, seconds: 8, top: PLAYER_RUN })
ok('driving at the fence stops at the fence, it does not leave the world',
  legal(intoFence.pos.x, intoFence.pos.z, 0), at({ pos: intoFence.pos }))
const intoWall = drive([0, -16], { dx: 0, dy: -56, seconds: 8, top: PLAYER_RUN })
ok('and driving at the castle never ends up inside it',
  !inside(intoWall.pos.x, intoWall.pos.z, 0.5 - 1e-6), at({ pos: intoWall.pos }))

// Mounted: sprint is meaningfully faster than a plain ride.
const RIDE = 5.2
const RIDE_SPRINT = 8.6
const cruise = drive([0, 20], { dx: 0, dy: -56, seconds: 1, top: RIDE, sprintTop: RIDE_SPRINT })
const flat = drive([0, 20], { dx: 0, dy: -56, seconds: 1, top: RIDE, sprintTop: RIDE_SPRINT, sprint: true })
ok('sprinting covers more ground than cruising',
  (20 - flat.pos.z) > (20 - cruise.pos.z) * 1.5,
  `${(20 - cruise.pos.z).toFixed(1)} -> ${(20 - flat.pos.z).toFixed(1)} units`)

// Ten seconds of sprinting is a real distance — the reason to want it at all.
const sprintRun = 10 * RIDE_SPRINT
ok('a full tank of sprint crosses most of the meadow', sprintRun > MEADOW_RADIUS,
  `${sprintRun} units vs a ${MEADOW_RADIUS}-unit radius`)

console.log('\n--- the controls toggle is remembered ---')

store.clear()
const server9 = await boot()
const { useGame: adv } = await server9.ssrLoadModule('/src/store.js')
ok('tap-to-move is the default', adv.getState().advanced === false)
adv.getState().toggleAdvanced()
ok('turning it on sticks', adv.getState().advanced === true)
ok('and is written to the save',
  JSON.parse(store.get('horse-meadow-save-v1')).advanced === true)

adv.getState().tame('h1')
adv.getState().nameHorse('h1', 'Star')
const withHorse = JSON.parse(store.get('horse-meadow-save-v1'))
ok('taming a horse does not lose the setting',
  withHorse.advanced === true && withHorse.tamed.h1?.name === 'Star')

const server10 = await boot()
const { useGame: tomorrowAdv } = await server10.ssrLoadModule('/src/store.js')
ok('and it is still on when she opens it tomorrow', tomorrowAdv.getState().advanced === true)
tomorrowAdv.getState().toggleAdvanced()
ok('turning it off sticks too', tomorrowAdv.getState().advanced === false)

console.log('\n--- geometry sanity ---')
const clear = B.CASTLE.gateTowerX - B.CASTLE.gateTowerR - 1.0
ok('gate clears a padded horse', clear > 1.5, `clear half-width ${clear.toFixed(2)}`)

await server.close()
await server2.close()
await server3.close()
await server4.close()
await server5.close()
await server6.close()
await server7.close()
await server8.close()
await server9.close()
await server10.close()
console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILURES'}`)
// exitCode rather than exit(): let the Vite/esbuild teardown finish, or it
// prints "The build was canceled" over the top of the results.
process.exitCode = fails === 0 ? 0 : 1

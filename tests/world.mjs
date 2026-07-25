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
const { clampToWorld, MEADOW_RADIUS } = await server.ssrLoadModule('/src/world/shared.js')
const B = await server.ssrLoadModule('/src/world/buildings.js')
const { useGame, foalSpawn, canRide, FOAL_GROW_MS, CHARACTERS, characterOr } =
  await server.ssrLoadModule('/src/store.js')

const inside = (x, z, pad = 0) =>
  B.BLOCKERS.some((b) => {
    if (b.r !== undefined) return Math.hypot(x - b.x, z - b.z) < b.r + pad
    return Math.abs(x - b.x) < b.hw + pad && Math.abs(z - b.z) < b.hd + pad
  })

/** Replays Player/Horse movement exactly: step toward target, clamp, repeat. */
function walk(from, to, { speed = 5.4, pad = 0.5, seconds = 40 } = {}) {
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
    clampToWorld(pos, pad)
    if (pos.distanceTo(prev) < 1e-4) {
      if (++stuckFor > 90) return { reached: false, pos, stuck: true }
    } else stuckFor = 0
    prev.copy(pos)
  }
  return { reached: false, pos, timeout: true }
}
const at = (r) => `${r.pos.x.toFixed(1)},${r.pos.z.toFixed(1)}${r.stuck ? ' STUCK' : ''}`

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
    !inside(t.x, t.z, 1.0 - 1e-6) && Math.hypot(t.x, t.z) <= MEADOW_RADIUS + 1e-6,
    `-> ${t.x.toFixed(1)},${t.z.toFixed(1)}`
  )
}

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
console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILURES'}`)
// exitCode rather than exit(): let the Vite/esbuild teardown finish, or it
// prints "The build was canceled" over the top of the results.
process.exitCode = fails === 0 ? 0 : 1

import { create } from 'zustand'
import { STALL_COUNT, isBuiltOn } from './world/buildings'
import { clampToWorld } from './world/shared'

const SAVE_KEY = 'horse-meadow-save-v1'

/**
 * Coat + mane pairs. Half are real horse colours, half are frankly not, because
 * the target audience is six and has strong feelings about purple.
 */
export const COATS = [
  { id: 'chestnut', coat: '#A05C33', mane: '#5C3218', label: 'Chestnut' },
  { id: 'bay', coat: '#6E4326', mane: '#241610', label: 'Bay' },
  { id: 'black', coat: '#3B3236', mane: '#221D20', label: 'Black' },
  { id: 'palomino', coat: '#D9A257', mane: '#F5EAD2', label: 'Palomino' },
  { id: 'grey', coat: '#B9B4B0', mane: '#807A76', label: 'Grey' },
  { id: 'cream', coat: '#EBD9BE', mane: '#C9A87C', label: 'Cream' },
  { id: 'lavender', coat: '#B49AD8', mane: '#F2E6FF', label: 'Lavender' },
  { id: 'mint', coat: '#8FD3B6', mane: '#F0FFF7', label: 'Mint' },
  { id: 'strawberry', coat: '#EFA0B4', mane: '#FFF0F4', label: 'Strawberry' },
  { id: 'sky', coat: '#93BEE0', mane: '#EAF6FF', label: 'Sky' },
]

/**
 * Names as pictures. She can't reliably read yet, so naming a horse is
 * "tap the star" -> the horse is called Star. The word is shown underneath
 * so the reading comes along for free.
 */
export const NAME_CARDS = [
  { icon: '⭐', name: 'Star' },
  { icon: '🌙', name: 'Moon' },
  { icon: '🌈', name: 'Rainbow' },
  { icon: '🍓', name: 'Berry' },
  { icon: '🌸', name: 'Blossom' },
  { icon: '❄️', name: 'Snow' },
  { icon: '☀️', name: 'Sunny' },
  { icon: '🍯', name: 'Honey' },
  { icon: '🦋', name: 'Flutter' },
  { icon: '🌼', name: 'Daisy' },
  { icon: '🍎', name: 'Apple' },
  { icon: '⚡', name: 'Bolt' },
]

/**
 * Who she plays as. She picks on the start screen and the choice is saved.
 *
 * All three are Quaternius CC0 characters off one shared 62-bone rig, so a
 * single loader and a single clip set serve all of them. They're modelled as
 * grown women — see PlayerModel for how they're brought down to child height,
 * because the girl in the meadow is meant to be *her*.
 *
 * `recolor` overrides a material by name. The dress is pinked to match the
 * girl she's had until now; the other two keep the colours they shipped with,
 * which is what makes the three easy to tell apart at a glance.
 */
export const CHARACTERS = [
  { id: 'dress', label: 'Dress', file: 'girl-dress.glb', recolor: { LimeGreen: '#E4557A' } },
  { id: 'jeans', label: 'Jeans', file: 'girl-jeans.glb' },
  { id: 'rider', label: 'Rider', file: 'girl-rider.glb' },
]

/** An id from a hand-edited or newer save must never render nothing. */
export function characterOr(id) {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0]
}

/** Spawns are kept clear of the castle courtyard and the stable. */
const HORSE_SPAWNS = [
  { id: 'h1', pos: [-14, 0, 6], coat: 3 },
  { id: 'h2', pos: [22, 0, -6], coat: 0 },
  { id: 'h3', pos: [17, 0, -16], coat: 6 },
  { id: 'h4', pos: [-28, 0, 14], coat: 1 },
  { id: 'h5', pos: [30, 0, 24], coat: 8 },
]

/**
 * Foals.
 *
 * Five minutes of wall clock from the moment she tames it, saved — so she can
 * tame a foal, go off and do something else, and come back to a horse. Close
 * the app at bedtime and it has grown by morning. Standing still watching a
 * timer is not a thing a six-year-old should be asked to do.
 *
 * An untamed foal has no save entry at all, which is exactly why it never
 * grows up: there is nothing to count from.
 */
export const FOAL_GROW_MS = 5 * 60 * 1000
/** How big a foal is next to a grown horse. */
export const FOAL_SCALE = 0.62
const FOAL_IDS = ['f1', 'f2', 'f3']

function isGrown(tamedAt, now = Date.now()) {
  return typeof tamedAt === 'number' && now - tamedAt >= FOAL_GROW_MS
}

/** Only grown horses can be ridden. One place decides it, so the click handler
 *  and the tests can never disagree about it. */
export function canRide(h) {
  return !!h && h.tamed && !h.foal
}

/**
 * Somewhere out in the meadow nobody told her about. Sampled on a ring wide
 * enough that a foal is never standing on the spot she starts at, rejecting
 * anything sitting on a building, and then run through `clampToWorld` — the
 * same function that guarantees every other position in this game is legal. So
 * a foal can't turn up inside a castle wall however the dice land.
 *
 * `clampToWorld` only ever reads `.x` and `.z`, which is why a plain object
 * does and this file needs no `three` import.
 */
export function foalSpawn() {
  let x = 18
  let z = 18
  for (let i = 0; i < 60; i++) {
    const ang = Math.random() * Math.PI * 2
    const r = 14 + Math.random() * 26
    x = Math.cos(ang) * r
    z = Math.sin(ang) * r
    if (!isBuiltOn(x, z)) break
  }
  const p = clampToWorld({ x, z }, 1.0)
  return [p.x, 0, p.z]
}

/** The adults at their fixed spots, then three foals wherever today's are. */
function allSpawns() {
  return [
    ...HORSE_SPAWNS.map((h) => ({ ...h, foal: false })),
    ...FOAL_IDS.map((id) => ({
      id,
      pos: foalSpawn(),
      coat: Math.floor(Math.random() * COATS.length),
      foal: true,
    })),
  ]
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function persist(horses, character) {
  try {
    const tamed = {}
    for (const h of horses) {
      if (h.tamed) {
        tamed[h.id] = {
          name: h.name,
          coat: h.coat,
          stall: h.stall,
          foal: h.foal,
          tamedAt: h.tamedAt,
        }
      }
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify({ tamed, character }))
  } catch {
    // Private browsing or a full disk. Not worth interrupting play over.
  }
}

function initialHorses() {
  const saved = loadSave().tamed || {}
  const claimed = new Set()
  return allSpawns().map((h) => {
    const s = saved[h.id]
    // A stall from an older save could be out of range, or — if the save were
    // ever hand-edited — double-booked. Either way, put the horse in the field
    // rather than in a wall.
    let stall = s?.stall
    if (typeof stall !== 'number' || stall < 0 || stall >= STALL_COUNT || claimed.has(stall)) {
      stall = null
    } else {
      claimed.add(stall)
    }
    return {
      ...h,
      tamed: !!s,
      name: s?.name ?? null,
      coat: s?.coat ?? h.coat,
      stall,
      tamedAt: s?.tamedAt ?? null,
      // The five minutes ran while the app was closed, so a foal she tamed
      // last night is a horse this morning.
      foal: s ? !!s.foal && !isGrown(s.tamedAt) : h.foal,
    }
  })
}

export const useGame = create((set, get) => ({
  started: false,
  horses: initialHorses(),
  /** Horse currently close enough to interact with. */
  nearHorse: null,
  /** True when she's standing (or riding) inside the stable. */
  nearStable: false,
  /** Horse that just got tamed and is waiting to be named. */
  namingHorse: null,
  mounted: null,
  /** Which of CHARACTERS she plays as. */
  character: characterOr(loadSave().character).id,

  start: () => set({ started: true }),

  chooseCharacter: (id) => {
    const character = characterOr(id).id
    if (character === get().character) return
    persist(get().horses, character)
    set({ character })
  },

  setNear: (id) => {
    if (get().nearHorse !== id) set({ nearHorse: id })
  },

  setNearStable: (v) => {
    if (get().nearStable !== v) set({ nearStable: v })
  },

  tame: (id) => {
    const horses = get().horses.map((h) =>
      // The growing-up clock starts here, and only here.
      h.id === id ? { ...h, tamed: true, tamedAt: h.tamedAt ?? Date.now() } : h
    )
    persist(horses, get().character)
    set({ horses, namingHorse: id })
  },

  /**
   * Tamed foals that have done their five minutes become adults. Returns the
   * ids that just grew, so the caller can make a noise about it, and leaves
   * state alone entirely when nothing has. Driven by one interval in App.jsx
   * rather than a clock inside each horse.
   */
  growUp: (now = Date.now()) => {
    const grown = get()
      .horses.filter((h) => h.foal && h.tamed && isGrown(h.tamedAt, now))
      .map((h) => h.id)
    if (grown.length === 0) return grown
    const horses = get().horses.map((h) => (grown.includes(h.id) ? { ...h, foal: false } : h))
    persist(horses, get().character)
    set({ horses })
    return grown
  },

  nameHorse: (id, name) => {
    const horses = get().horses.map((h) => (h.id === id ? { ...h, name } : h))
    persist(horses, get().character)
    set({ horses })
  },

  recolor: (id, coat) => {
    const horses = get().horses.map((h) => (h.id === id ? { ...h, coat } : h))
    persist(horses, get().character)
    set({ horses })
  },

  closeNaming: () => set({ namingHorse: null }),

  mount: (id) => set({ mounted: id, nearHorse: id }),
  dismount: () => set({ mounted: null }),

  /** Park the horse she's riding in the first free stall and hop her down. */
  stableHorse: (id) => {
    const taken = new Set(get().horses.map((h) => h.stall).filter((s) => s !== null))
    let slot = 0
    while (taken.has(slot)) slot++
    if (slot >= STALL_COUNT) return
    const horses = get().horses.map((h) => (h.id === id ? { ...h, stall: slot } : h))
    persist(horses, get().character)
    set({ horses, mounted: null })
  },

  /** Tapping a stabled horse opens its stall — it walks back out to her. */
  unstable: (id) => {
    const horses = get().horses.map((h) => (h.id === id ? { ...h, stall: null } : h))
    persist(horses, get().character)
    set({ horses })
  },
}))

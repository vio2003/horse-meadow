import { create } from 'zustand'
import { STALL_COUNT } from './world/buildings'

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

/** Spawns are kept clear of the castle courtyard and the stable. */
const HORSE_SPAWNS = [
  { id: 'h1', pos: [-14, 0, 6], coat: 3 },
  { id: 'h2', pos: [22, 0, -6], coat: 0 },
  { id: 'h3', pos: [17, 0, -16], coat: 6 },
  { id: 'h4', pos: [-28, 0, 14], coat: 1 },
  { id: 'h5', pos: [30, 0, 24], coat: 8 },
]

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function persist(horses) {
  try {
    const tamed = {}
    for (const h of horses) {
      if (h.tamed) tamed[h.id] = { name: h.name, coat: h.coat, stall: h.stall }
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify({ tamed }))
  } catch {
    // Private browsing or a full disk. Not worth interrupting play over.
  }
}

function initialHorses() {
  const saved = loadSave().tamed || {}
  const claimed = new Set()
  return HORSE_SPAWNS.map((h) => {
    // A stall from an older save could be out of range, or — if the save were
    // ever hand-edited — double-booked. Either way, put the horse in the field
    // rather than in a wall.
    let stall = saved[h.id]?.stall
    if (typeof stall !== 'number' || stall < 0 || stall >= STALL_COUNT || claimed.has(stall)) {
      stall = null
    } else {
      claimed.add(stall)
    }
    return {
      ...h,
      tamed: !!saved[h.id],
      name: saved[h.id]?.name ?? null,
      coat: saved[h.id]?.coat ?? h.coat,
      stall,
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

  start: () => set({ started: true }),

  setNear: (id) => {
    if (get().nearHorse !== id) set({ nearHorse: id })
  },

  setNearStable: (v) => {
    if (get().nearStable !== v) set({ nearStable: v })
  },

  tame: (id) => {
    const horses = get().horses.map((h) => (h.id === id ? { ...h, tamed: true } : h))
    persist(horses)
    set({ horses, namingHorse: id })
  },

  nameHorse: (id, name) => {
    const horses = get().horses.map((h) => (h.id === id ? { ...h, name } : h))
    persist(horses)
    set({ horses })
  },

  recolor: (id, coat) => {
    const horses = get().horses.map((h) => (h.id === id ? { ...h, coat } : h))
    persist(horses)
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
    persist(horses)
    set({ horses, mounted: null })
  },

  /** Tapping a stabled horse opens its stall — it walks back out to her. */
  unstable: (id) => {
    const horses = get().horses.map((h) => (h.id === id ? { ...h, stall: null } : h))
    persist(horses)
    set({ horses })
  },
}))

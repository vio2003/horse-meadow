import * as THREE from 'three'
import { BLOCKERS } from './buildings'

/**
 * Per-frame game state lives here, NOT in React.
 *
 * Anything that changes 60x/second (positions, trust meters) would cause a
 * re-render storm if it went through useState or zustand. Components read and
 * write this object directly inside useFrame. React state (store.js) is only
 * for things a human actually clicks: menus, taming, mounting.
 */
export const world = {
  playerPos: new THREE.Vector3(0, 0, 6),
  playerRunning: false,
  /** Where the player last tapped. null when standing still. */
  moveTarget: null,
  /** id of the horse being ridden, or null */
  mountedHorse: null,
  /** id -> THREE.Vector3, kept current by each Horse component */
  horsePositions: new Map(),
  /** id -> yaw in radians, so the rider faces where the horse faces */
  horseRotations: new Map(),
  /** id -> number 0..1, so the HUD can tell which horse is being befriended */
  horseTrust: new Map(),
  /** Bumped by the apple button. Horses consume it. */
  feedPulse: 0,
  /** True while the brush button is held down. */
  brushing: false,
  /** Set by Castle/Stable each frame — they fade their front out of the way. */
  insideCastle: false,
  insideStable: false,
}

export const MEADOW_RADIUS = 52

/**
 * Push a point out of any wall it has ended up inside.
 *
 * Boxes eject along their shallowest axis, which is what makes walking into a
 * wall slide along it rather than stop. Two passes so an inside corner (a tower
 * meeting a wall) settles instead of ping-ponging.
 */
export function resolveBlockers(v, pad = 0.6) {
  for (let pass = 0; pass < 2; pass++) {
    for (const b of BLOCKERS) {
      const dx = v.x - b.x
      const dz = v.z - b.z
      if (b.r !== undefined) {
        const rr = b.r + pad
        const d = Math.hypot(dx, dz)
        if (d < rr) {
          // Out along the radius — plus a nudge *around* the circle, sized to
          // how far in she got. Without the nudge, riding dead-on at the
          // fountain deadlocks: the push points exactly back down her line of
          // travel and she grinds to a stop in front of it. Sizing the nudge to
          // the overlap turns the movement she loses into movement sideways,
          // which is what going round something looks like.
          const ang = (d < 1e-4 ? 0 : Math.atan2(dz, dx)) + (rr - d) / rr
          v.x = b.x + Math.cos(ang) * (rr + 1e-3)
          v.z = b.z + Math.sin(ang) * (rr + 1e-3)
        }
      } else {
        const ox = b.hw + pad - Math.abs(dx)
        const oz = b.hd + pad - Math.abs(dz)
        if (ox > 0 && oz > 0) {
          if (ox < oz) v.x = b.x + (dx < 0 ? -1 : 1) * (b.hw + pad)
          else v.z = b.z + (dz < 0 ? -1 : 1) * (b.hd + pad)
        }
      }
    }
  }
  return v
}

/**
 * Keep a point inside the meadow and outside the buildings. `pad` is how fat
 * the thing being moved is — the player is slim, a horse needs more room.
 */
export function clampToWorld(v, pad = 0.6) {
  const d = Math.hypot(v.x, v.z)
  if (d > MEADOW_RADIUS) {
    v.x = (v.x / d) * MEADOW_RADIUS
    v.z = (v.z / d) * MEADOW_RADIUS
  }
  return resolveBlockers(v, pad)
}

/** Shortest-path angle lerp, so characters never spin the long way round. */
export function lerpAngle(current, target, t) {
  let diff = target - current
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  return current + diff * t
}

/** Frame-rate independent smoothing factor. */
export function damp(dt, rate = 8) {
  return 1 - Math.exp(-rate * dt)
}

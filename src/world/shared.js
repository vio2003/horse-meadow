import * as THREE from 'three'
import { BLOCKERS } from './buildings'
import { MEADOW, nearestRegion, inWorld } from './regions'

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

  // ---- advanced controls. All of it moves every frame, so none of it is React.
  /**
   * Joystick direction in world space, unit length, plus how far it's pushed.
   * `mag` 0 means she isn't touching it and the tap-to-move target still rules.
   */
  moveAxis: { x: 0, z: 0, mag: 0 },
  /** True while the sprint button is held — not the same as actually sprinting. */
  sprintHeld: false,
  /** The resolved answer: held, mounted, moving and with wind left. Horse reads it. */
  riderSprinting: false,
  /** The ridden horse's wind, 0..1. Player owns it; the HUD ring reads it. */
  stamina: 1,
  /** How high off the ground the hop currently is. Player owns it. */
  hopY: 0,
  /** Bumped by the jump button, consumed by Player. Same idiom as feedPulse. */
  jumpPulse: 0,
  /** Set by Castle/Stable each frame — they fade their front out of the way. */
  insideCastle: false,
  insideStable: false,
}

export const MEADOW_RADIUS = MEADOW.r

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

/** Push a point back onto a circle if it has strayed outside it. */
function ontoCircle(v, g) {
  const dx = v.x - g.x
  const dz = v.z - g.z
  const d = Math.hypot(dx, dz)
  if (d > g.r) {
    // d can't be 0 here: that would mean the centre is outside its own circle.
    v.x = g.x + (dx / d) * g.r
    v.z = g.z + (dz / d) * g.r
  }
  return v
}

/**
 * Keep a point somewhere in the world and outside the buildings. `pad` is how
 * fat the thing being moved is — the player is slim, a horse needs more room.
 *
 * Inside any region, a point is already legal and nothing moves. Out in the gaps
 * between them, it goes back to the nearest region's edge — so a tap on the far
 * hills becomes a walk to the fence rather than a walk into nothing.
 *
 * The radius is *not* padded, only the blockers are. That's how this worked when
 * the world was one disc, and preserving it exactly is what makes an expansion
 * of the world's shape a safe change rather than a rewrite of every position in
 * the game.
 */
export function clampToWorld(v, pad = 0.6) {
  if (!inWorld(v.x, v.z)) ontoCircle(v, nearestRegion(v.x, v.z))
  return resolveBlockers(v, pad)
}

/**
 * The same, but the meadow only — for everything that lives there and stays
 * there. The horses use this; she doesn't. See Horse.jsx for why: she can ride
 * out to the sea, but she'll find her herd at home where she left it.
 */
export function clampToMeadow(v, pad = 0.6) {
  ontoCircle(v, MEADOW)
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

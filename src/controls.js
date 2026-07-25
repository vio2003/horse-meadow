/**
 * The maths behind the advanced controls, kept away from React and three.
 *
 * Both functions here are pure, which is the whole point: stamina and the stick
 * are the only parts of this feature with rules rather than feel, and rules can
 * be proved. tests/world.mjs runs them frame by frame. Everything else about the
 * joystick — how it looks, how it feels under a thumb — is a browser job.
 */

/** Seconds of flat-out sprinting before the horse is spent. */
export const SPRINT_SECONDS = 10
/** Seconds of not sprinting to get back to full. */
export const RECOVER_SECONDS = 15

/**
 * How much has to come back before a winded horse will gallop again.
 *
 * Not in the issue, and here for a reason. Without it, holding sprint at empty
 * gives a stutter: each frame recovers a sliver, the next frame spends it, and
 * the horse surges and dies about sixty times a second. Being winded for a
 * moment is better behaved and much easier for her to understand — it stops,
 * and then after a breath it works again.
 */
export const WINDED_UNTIL = 0.25

/**
 * Advance the stamina meter by one frame.
 *
 * `sprinting` means *actually* sprinting — held, moving, mounted, and with
 * something left in the tank. Holding the button while standing still is not
 * sprinting, so it doesn't cost anything.
 */
export function stepStamina(stamina, { sprinting, dt }) {
  const next = sprinting
    ? stamina - dt / SPRINT_SECONDS
    : stamina + dt / RECOVER_SECONDS
  return Math.max(0, Math.min(1, next))
}

/**
 * Whether sprint is available right now, given the meter and whether we were
 * already sprinting. Once empty, it stays unavailable until WINDED_UNTIL.
 */
export function canSprint(stamina, wasSprinting) {
  return wasSprinting ? stamina > 0 : stamina >= WINDED_UNTIL
}

/** Inside this fraction of the stick's travel, she hasn't really pushed it. */
export const DEAD_ZONE = 0.18

/**
 * Stick offset in pixels to a direction in the world.
 *
 * The camera in this game never rotates — it's a fixed-angle chase camera, on
 * purpose ([FollowCamera.jsx]) — so screen-up is always −z and screen-right is
 * always +x, and the mapping is a straight copy. Screen y grows downward, which
 * is the same direction +z grows, so dy needs no flip. If the camera ever learns
 * to orbit, this is the function that has to know about it.
 *
 * Returns a direction of unit length plus the separate `mag` it was pushed to,
 * so callers can steer and choose a speed independently.
 */
export function stickAxis(dx, dy, radius) {
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return { x: 0, z: 0, mag: 0 }
  const mag = Math.min(1, len / radius)
  if (mag < DEAD_ZONE) return { x: 0, z: 0, mag: 0 }
  // dy is used as z unchanged: screen y grows downward, world z grows the same
  // way, so pushing the stick up gives a negative z and walks her away from the
  // camera. That is the whole camera-to-world transform, and it only works
  // because the camera is fixed.
  return { x: dx / len, z: dy / len, mag }
}

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { world, clampToWorld, lerpAngle, damp } from './shared'
import { STABLE_ZONE, inRect } from './buildings'
import { SADDLE_Y } from './HorseModel'
import PlayerModel from './PlayerModel'
import { useGame } from '../store'
import { hoofstep } from '../audio'

const WALK = 2.2
const RUN = 5.4
/** Tap further than this and she runs — which is what spooks the horses. */
export const RUN_DISTANCE = 7

export default function Player() {
  const group = useRef()
  const bodyRef = useRef()
  const scratch = useMemo(() => new THREE.Vector3(), [])
  const lastPos = useMemo(() => new THREE.Vector3(), [])
  const st = useRef({ stepClock: 0, walkPhase: 0, stalled: 0 })
  const character = useGame((s) => s.character)
  // Read by PlayerModel every frame to pick a clip and pose her for riding.
  const anim = useRef({ speed: 0, mounted: false })

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const s = st.current
    const g = useGame.getState()

    // If she has somewhere to be but hasn't actually got anywhere for a beat,
    // she's pressed against something — a castle wall, or a spot behind it she
    // can't reach. Let the destination go instead of grinding into it, and stop
    // "running", which would otherwise leave every horse in the meadow spooked
    // for as long as she leaned on that wall. Works while mounted too: her
    // position is the horse's, so a stuck horse reads as a stuck her.
    if (world.moveTarget) {
      if (world.playerPos.distanceToSquared(lastPos) < 1e-6) {
        s.stalled += dt
        if (s.stalled > 0.35) {
          world.moveTarget = null
          world.playerRunning = false
          s.stalled = 0
        }
      } else {
        s.stalled = 0
      }
    } else {
      s.stalled = 0
    }
    lastPos.copy(world.playerPos)

    if (g.mounted) {
      // Riding: sit on the horse's back and let the horse do the driving.
      const hp = world.horsePositions.get(g.mounted)
      const hy = world.horseRotations.get(g.mounted) ?? 0
      if (hp) {
        world.playerPos.copy(hp)
        // Seat position is in the horse's local space, then rotated with it,
        // so she stays on the saddle through turns instead of sliding off.
        // Essentially over the horse's origin. Further forward puts her on the
        // neck; further back puts her on the rump. The cone could sit anywhere
        // along here and nobody could tell — a rider with legs cannot.
        const seatForward = 0.02
        group.current.position.set(
          hp.x + Math.sin(hy) * seatForward,
          SADDLE_Y,
          hp.z + Math.cos(hy) * seatForward
        )
        group.current.rotation.y = hy
      }
      world.playerRunning = false
      bodyRef.current.position.y = Math.sin(performance.now() * 0.008) * 0.02
      anim.current.speed = 0
      anim.current.mounted = true
      // Nearest-horse bookkeeping is irrelevant while mounted — but the stable
      // check is not. Riding in is exactly when she needs that button.
      g.setNearStable(inRect(world.playerPos.x, world.playerPos.z, STABLE_ZONE))
      return
    }
    anim.current.mounted = false

    let speed = 0
    if (world.moveTarget) {
      scratch.copy(world.moveTarget).sub(world.playerPos)
      scratch.y = 0
      const d = scratch.length()
      if (d < 0.25) {
        world.moveTarget = null
        world.playerRunning = false
      } else {
        scratch.normalize()
        speed = world.playerRunning ? RUN : WALK
        world.playerPos.addScaledVector(scratch, Math.min(speed * dt, d))
        clampToWorld(world.playerPos, 0.5)
        group.current.rotation.y = lerpAngle(
          group.current.rotation.y,
          Math.atan2(scratch.x, scratch.z),
          damp(dt, 9)
        )
      }
    } else {
      world.playerRunning = false
    }

    group.current.position.set(world.playerPos.x, 0, world.playerPos.z)

    // The Walk and Run clips carry her own bob now, so the hand-rolled sine is
    // gone. Footsteps stay — they're paced to ground speed, not to the clip.
    anim.current.speed = speed
    bodyRef.current.position.y = 0
    if (speed > 0.3) {
      s.stepClock -= dt * speed
      if (s.stepClock <= 0) {
        hoofstep(0.055)
        s.stepClock = 1.4
      }
    }

    // One place decides which horse is "the" nearby horse, so the HUD and all
    // five Horse components can never disagree about it.
    let best = null
    let bestD = 4.4
    for (const [id, p] of world.horsePositions) {
      const d = p.distanceTo(world.playerPos)
      if (d < bestD) {
        bestD = d
        best = id
      }
    }
    g.setNear(best)
    g.setNearStable(inRect(world.playerPos.x, world.playerPos.z, STABLE_ZONE))
  })

  return (
    <group ref={group}>
      <group ref={bodyRef}>
        <PlayerModel character={character} anim={anim} />
      </group>
    </group>
  )
}

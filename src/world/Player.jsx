import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { world, clampToWorld, lerpAngle, damp } from './shared'
import { STABLE_ZONE, inRect } from './buildings'
import { SADDLE_Y } from './HorseModel'
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
        const back = -0.15
        group.current.position.set(
          hp.x + Math.sin(hy) * back,
          SADDLE_Y,
          hp.z + Math.cos(hy) * back
        )
        group.current.rotation.y = hy
      }
      world.playerRunning = false
      bodyRef.current.position.y = Math.sin(performance.now() * 0.008) * 0.02
      // Nearest-horse bookkeeping is irrelevant while mounted — but the stable
      // check is not. Riding in is exactly when she needs that button.
      g.setNearStable(inRect(world.playerPos.x, world.playerPos.z, STABLE_ZONE))
      return
    }

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

    // Bob and footsteps
    s.walkPhase += dt * speed * 3.4
    bodyRef.current.position.y = Math.abs(Math.sin(s.walkPhase)) * 0.055
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
        {/* dress */}
        <mesh position={[0, 0.42, 0]} castShadow>
          <coneGeometry args={[0.31, 0.66, 9]} />
          <meshStandardMaterial color="#E4557A" flatShading roughness={0.8} />
        </mesh>
        {/* arms */}
        {[-0.22, 0.22].map((x) => (
          <mesh key={x} position={[x, 0.62, 0.03]} rotation={[0, 0, x * 1.1]} castShadow>
            <capsuleGeometry args={[0.055, 0.22, 3, 6]} />
            <meshStandardMaterial color="#F0C39C" flatShading roughness={0.9} />
          </mesh>
        ))}
        {/* head */}
        <mesh position={[0, 0.93, 0]} castShadow>
          <sphereGeometry args={[0.18, 10, 8]} />
          <meshStandardMaterial color="#F0C39C" flatShading roughness={0.9} />
        </mesh>
        {/* hair */}
        <mesh position={[0, 0.98, -0.02]} scale={[1.06, 1, 1.06]} castShadow>
          <sphereGeometry args={[0.185, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
          <meshStandardMaterial color="#6B4326" flatShading roughness={0.85} />
        </mesh>
        {/* ponytail */}
        <mesh position={[0, 0.86, -0.2]} rotation={[0.5, 0, 0]} castShadow>
          <capsuleGeometry args={[0.07, 0.24, 3, 6]} />
          <meshStandardMaterial color="#6B4326" flatShading roughness={0.85} />
        </mesh>
        {/* eyes */}
        {[-0.07, 0.07].map((x) => (
          <mesh key={x} position={[x, 0.94, 0.16]}>
            <sphereGeometry args={[0.028, 8, 6]} />
            <meshStandardMaterial color="#2B1F1A" roughness={0.3} />
          </mesh>
        ))}
        {/* boots */}
        {[-0.1, 0.1].map((x) => (
          <mesh key={x} position={[x, 0.06, 0.02]} castShadow>
            <boxGeometry args={[0.11, 0.12, 0.18]} />
            <meshStandardMaterial color="#6E4326" flatShading roughness={0.9} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

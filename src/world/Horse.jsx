import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import HorseModel from './HorseModel'
import TrustHearts from './TrustHearts'
import { world, clampToWorld, lerpAngle, damp } from './shared'
import { STALLS, STALL_APPROACH_Z } from './buildings'
import { useGame, COATS } from '../store'
import { whinny, nicker, munch, hoofstep, sparkle } from '../audio'

const WALK = 1.3
const FLEE = 6.4
const RIDE = 5.2

// Tuning for the taming loop. All of it is forgiving on purpose.
const NOTICE_RANGE = 4.0 // close enough to start earning trust
const BRUSH_RANGE = 2.6
const SPOOK_RANGE = 13.0
const TRUST_FLOOR = 0.12 // trust never falls back to zero — no wiped progress

export default function Horse({ id, spawn, coatIndex, tamed, name }) {
  const group = useRef()
  const heartsRef = useRef()
  const pos = useMemo(() => new THREE.Vector3(...spawn), [spawn])
  const target = useMemo(() => new THREE.Vector3(...spawn), [spawn])
  const scratch = useMemo(() => new THREE.Vector3(), [])

  const anim = useRef({ t: 0, speed: 0, graze: 0, coat: '#A05C33' })
  const st = useRef({
    mode: 'graze',
    timer: 1 + Math.random() * 3,
    trust: tamed ? 1 : TRUST_FLOOR,
    lastFeed: 0,
    stepClock: 0,
    nickerCooldown: 0,
  })

  world.horsePositions.set(id, pos)

  const palette = COATS[coatIndex] ?? COATS[0]

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05) // guard against tab-switch time jumps
    const s = st.current
    const a = anim.current
    a.t += dt
    s.timer -= dt
    s.nickerCooldown -= dt

    const gameState = useGame.getState()
    const isMounted = gameState.mounted === id
    const me = gameState.horses.find((h) => h.id === id)
    const isTamed = me?.tamed
    const stall = me?.stall ?? null

    const dist = pos.distanceTo(world.playerPos)
    let speed = 0

    if (isMounted) {
      // ---- being ridden: the horse becomes the player's vehicle
      s.mode = 'ridden'
      a.graze = 0
      if (world.moveTarget) {
        scratch.copy(world.moveTarget).sub(pos)
        scratch.y = 0
        const d = scratch.length()
        if (d < 0.4) {
          world.moveTarget = null
        } else {
          scratch.normalize()
          speed = RIDE
          pos.addScaledVector(scratch, Math.min(speed * dt, d))
          group.current.rotation.y = lerpAngle(
            group.current.rotation.y,
            Math.atan2(scratch.x, scratch.z),
            damp(dt, 6)
          )
        }
      }
    } else if (stall !== null) {
      // ---- stabled: walk to its stall and stay there. It does NOT follow her,
      // which is the entire point of the stable as far as she's concerned.
      const slot = STALLS[stall]
      const linedUp = Math.abs(pos.x - slot.x) < 0.5
      // Line up in the aisle first, then back in, so it never cuts diagonally
      // through a stall divider.
      target.set(slot.x, 0, linedUp ? slot.z : STALL_APPROACH_Z)
      scratch.copy(target).sub(pos)
      scratch.y = 0
      const d = scratch.length()
      if (d > 0.2) {
        scratch.normalize()
        speed = WALK
        pos.addScaledVector(scratch, Math.min(speed * dt, d))
        group.current.rotation.y = lerpAngle(
          group.current.rotation.y,
          Math.atan2(scratch.x, scratch.z),
          damp(dt, 4)
        )
        a.graze += (0 - a.graze) * damp(dt, 4)
      } else {
        // Settled in. Yaw 0 faces +z — out through the open front, at her.
        group.current.rotation.y = lerpAngle(group.current.rotation.y, 0, damp(dt, 2))
        a.graze += (0.85 - a.graze) * damp(dt, 1.2)
      }
      if (dist < 7 && s.nickerCooldown <= 0) {
        nicker()
        s.nickerCooldown = 10 + Math.random() * 8
      }
    } else if (isTamed) {
      // ---- tamed but not ridden: hangs around, drifts toward the player
      a.graze += (0.7 - a.graze) * damp(dt, 1.2)
      if (dist > 9) {
        scratch.copy(world.playerPos).sub(pos)
        scratch.y = 0
        scratch.normalize()
        speed = WALK * 1.4
        pos.addScaledVector(scratch, speed * dt)
        a.graze += (0 - a.graze) * damp(dt, 4)
        group.current.rotation.y = lerpAngle(
          group.current.rotation.y,
          Math.atan2(scratch.x, scratch.z),
          damp(dt, 4)
        )
      }
      if (dist < 5 && s.nickerCooldown <= 0) {
        nicker()
        s.nickerCooldown = 9 + Math.random() * 8
      }
    } else {
      // ---- wild
      const spooked = world.playerRunning && dist < SPOOK_RANGE

      if (spooked && s.mode !== 'flee') {
        s.mode = 'flee'
        s.timer = 2.2
        whinny()
        scratch.copy(pos).sub(world.playerPos)
        scratch.y = 0
        scratch.normalize()
        target.copy(pos).addScaledVector(scratch, 16)
        clampToWorld(target, 1.0)
      }

      if (s.mode === 'flee') {
        scratch.copy(target).sub(pos)
        scratch.y = 0
        const d = scratch.length()
        if (s.timer <= 0 || d < 0.5) {
          s.mode = 'graze'
          s.timer = 2 + Math.random() * 3
        } else {
          scratch.normalize()
          speed = FLEE
          pos.addScaledVector(scratch, Math.min(speed * dt, d))
          group.current.rotation.y = lerpAngle(
            group.current.rotation.y,
            Math.atan2(scratch.x, scratch.z),
            damp(dt, 7)
          )
        }
        a.graze += (0 - a.graze) * damp(dt, 9)
      } else if (dist < NOTICE_RANGE) {
        // ---- she's close and calm: the horse stands and looks at her
        s.mode = 'alert'
        a.graze += (0 - a.graze) * damp(dt, 5)
        scratch.copy(world.playerPos).sub(pos)
        scratch.y = 0
        group.current.rotation.y = lerpAngle(
          group.current.rotation.y,
          Math.atan2(scratch.x, scratch.z),
          damp(dt, 3)
        )
      } else {
        // ---- idle life: graze a while, amble somewhere, graze again
        if (s.timer <= 0) {
          if (s.mode === 'graze') {
            s.mode = 'wander'
            s.timer = 2 + Math.random() * 3
            const ang = Math.random() * Math.PI * 2
            const r = 4 + Math.random() * 9
            target.set(
              pos.x + Math.cos(ang) * r,
              0,
              pos.z + Math.sin(ang) * r
            )
            clampToWorld(target, 1.0)
          } else {
            s.mode = 'graze'
            s.timer = 3 + Math.random() * 5
          }
        }
        if (s.mode === 'wander') {
          scratch.copy(target).sub(pos)
          scratch.y = 0
          const d = scratch.length()
          if (d > 0.4) {
            scratch.normalize()
            speed = WALK
            pos.addScaledVector(scratch, Math.min(speed * dt, d))
            group.current.rotation.y = lerpAngle(
              group.current.rotation.y,
              Math.atan2(scratch.x, scratch.z),
              damp(dt, 3)
            )
          }
          a.graze += (0 - a.graze) * damp(dt, 4)
        } else {
          a.graze += (1 - a.graze) * damp(dt, 1.5)
        }
      }

      // ---- trust
      const isNearest = gameState.nearHorse === id
      const calm = !world.playerRunning && dist < NOTICE_RANGE && s.mode !== 'flee'

      if (calm) {
        let rate = 0.085
        if (world.brushing && dist < BRUSH_RANGE) rate = 0.42
        s.trust = Math.min(1, s.trust + rate * dt)
      } else if (dist > NOTICE_RANGE + 3) {
        // Drifts back slowly so wandering off isn't punishing, but never to zero.
        s.trust = Math.max(TRUST_FLOOR, s.trust - 0.012 * dt)
      }

      if (isNearest && world.feedPulse !== s.lastFeed) {
        s.lastFeed = world.feedPulse
        if (dist < NOTICE_RANGE + 0.6) {
          s.trust = Math.min(1, s.trust + 0.3)
          munch()
          a.graze = 1
          s.mode = 'alert'
        }
      }

      if (s.trust >= 1) {
        sparkle()
        nicker()
        gameState.tame(id)
      }
    }

    // ---- hoofbeats, paced to actual speed
    if (speed > 0.4) {
      s.stepClock -= dt * speed
      if (s.stepClock <= 0) {
        hoofstep(speed > 4 ? 0.16 : 0.09)
        s.stepClock = 1.1
      }
    }

    // One clamp at the end covers every branch above — ridden, stabled,
    // following, grazing, fleeing. A horse can never end up inside a wall.
    clampToWorld(pos, 1.0)

    a.speed = speed
    world.horseTrust.set(id, s.trust)

    group.current.position.copy(pos)
    world.horseRotations.set(id, group.current.rotation.y)
    if (heartsRef.current) heartsRef.current.setTrust(s.trust, !isTamed && dist < 6.5)
  })

  return (
    <group
      ref={group}
      onClick={(e) => {
        e.stopPropagation()
        const g = useGame.getState()
        const h = g.horses.find((x) => x.id === id)
        if (!h?.tamed || g.mounted) return
        if (h.stall !== null) {
          // Tapping a stabled horse opens its stall from anywhere in the yard —
          // she shouldn't have to walk to it to get her own horse back.
          g.unstable(id)
          nicker()
          return
        }
        if (pos.distanceTo(world.playerPos) < 5) {
          g.mount(id)
          nicker()
        }
      }}
    >
      <HorseModel coat={palette.coat} mane={palette.mane} anim={anim} />
      <TrustHearts ref={heartsRef} />
    </group>
  )
}

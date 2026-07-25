import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { world, damp } from './shared'
import {
  STABLE,
  STALLS,
  STABLE_ZONE,
  inRect,
  PINK,
  PINK_DEEP,
  GOLD,
  GOLD_DEEP,
  STONE,
  TIMBER,
} from './buildings'
import { useGame, NAME_CARDS } from '../store'

/**
 * The stable. Ride in, tap the button, and the horse stays here — including
 * after she closes the app, which is the part that actually matters to her.
 *
 * One stall per horse, so the button is never greyed out. The roof fades while
 * she's inside for the same reason the castle's front wall does.
 */

const S = STABLE
const RIDGE_DZ = S.hd + 0.6 // eaves overhang the walls a little
const SLOPE = Math.atan2(S.ridgeY - S.eaveY, RIDGE_DZ)
const SLAB_LEN = Math.hypot(RIDGE_DZ, S.ridgeY - S.eaveY)

/**
 * The horse's name as its picture, hung over its stall. She picked the name by
 * tapping this exact icon, so the sign means something to her without reading.
 */
function StallSign({ icon, position }) {
  const texture = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')
    g.fillStyle = GOLD
    g.fillRect(0, 0, 128, 128)
    g.font = '84px serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(icon, 64, 70)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [icon])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <mesh position={position}>
      <planeGeometry args={[1.1, 1.1]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}

export default function Stable() {
  const horses = useGame((s) => s.horses)

  const mat = useMemo(() => {
    const solid = (color, roughness = 0.9) =>
      new THREE.MeshStandardMaterial({ color, flatShading: true, roughness })
    const fading = (color, roughness = 0.9) =>
      new THREE.MeshStandardMaterial({
        color,
        flatShading: true,
        roughness,
        transparent: true,
        opacity: 1,
      })
    return {
      pink: solid(PINK),
      pinkDeep: solid(PINK_DEEP),
      gold: solid(GOLD, 0.5),
      goldDeep: solid(GOLD_DEEP, 0.5),
      stone: solid(STONE, 1),
      timber: solid(TIMBER),
      hay: solid('#DFC06A'),
      roof: fading(GOLD, 0.5),
      roofTrim: fading(GOLD_DEEP, 0.5),
      post: fading(PINK_DEEP),
    }
  }, [])

  // The gable ends, as a flat triangle extruded a little.
  const gableGeo = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(-RIDGE_DZ, S.eaveY)
    s.lineTo(RIDGE_DZ, S.eaveY)
    s.lineTo(0, S.ridgeY)
    s.closePath()
    return new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: false })
  }, [])

  useEffect(() => () => gableGeo.dispose(), [gableGeo])

  const fade = useRef(1)

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const inside = inRect(world.playerPos.x, world.playerPos.z, STABLE_ZONE)
    world.insideStable = inside

    const goal = inside ? 0.16 : 1
    fade.current += (goal - fade.current) * damp(dt, 3.5)
    for (const m of [mat.roof, mat.roofTrim, mat.post]) {
      m.opacity = fade.current
      m.depthWrite = fade.current > 0.97
    }
  })

  // No pointer handlers, for the same reason as the castle: the roof sits
  // between the camera and the floor she's trying to tap.
  const occupant = (i) => horses.find((h) => h.stall === i)

  return (
    <group>
      {/* floor */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[S.x, 0.03, S.z]}
        material={mat.stone}
        raycast={() => null}
        receiveShadow
      >
        <planeGeometry args={[S.hw * 2, S.hd * 2 + 3]} />
      </mesh>

      {/* back wall */}
      <mesh position={[S.x, S.eaveY / 2, S.backZ]} material={mat.pink} castShadow receiveShadow>
        <boxGeometry args={[S.hw * 2, S.eaveY, S.wallHD * 2]} />
      </mesh>

      {/* side walls */}
      {[S.hw - 0.6, -(S.hw - 0.6)].map((dx) => (
        <mesh key={dx} position={[S.x + dx, S.eaveY / 2, S.z]} material={mat.pink} castShadow receiveShadow>
          <boxGeometry args={[S.wallHD * 2, S.eaveY, S.hd * 2]} />
        </mesh>
      ))}

      {/* Stall dividers — four of them, between the five stalls; the side walls
          close off the ends. Deliberately not solid: a horse that clipped a
          divider would be stuck, and nothing in this game is allowed to stick. */}
      {[-33, -29, -25, -21].map((x) => (
        <group key={x} position={[x, 0, -15]}>
          <mesh position={[0, 0.85, 0]} material={mat.timber} castShadow receiveShadow>
            <boxGeometry args={[0.22, 1.7, 4.2]} />
          </mesh>
          <mesh position={[0, 1.78, 0]} material={mat.goldDeep} castShadow receiveShadow>
            <boxGeometry args={[0.32, 0.18, 4.3]} />
          </mesh>
        </group>
      ))}

      {/* name signs over the occupied stalls */}
      {STALLS.map((stall, i) => {
        const h = occupant(i)
        const icon = NAME_CARDS.find((c) => c.name === h?.name)?.icon
        if (!icon) return null
        return (
          <StallSign key={stall.x} icon={icon} position={[stall.x, 2.55, S.backZ + 0.75]} />
        )
      })}

      {/* a little hay, because a stable without hay isn't one */}
      {[-33.2, -21.2].map((x) => (
        <mesh key={x} position={[x, 0.35, -13.4]} rotation={[0, 0.3, 0]} material={mat.hay} castShadow receiveShadow>
          <boxGeometry args={[1.3, 0.7, 0.9]} />
        </mesh>
      ))}

      {/* ---- roof and front posts: faded while she's inside */}
      <mesh
        position={[S.x, (S.ridgeY + S.eaveY) / 2, S.z - RIDGE_DZ / 2]}
        rotation={[-SLOPE, 0, 0]}
        material={mat.roof}
        castShadow
      >
        <boxGeometry args={[S.hw * 2 + 1.2, 0.3, SLAB_LEN]} />
      </mesh>
      <mesh
        position={[S.x, (S.ridgeY + S.eaveY) / 2, S.z + RIDGE_DZ / 2]}
        rotation={[SLOPE, 0, 0]}
        material={mat.roof}
        castShadow
      >
        <boxGeometry args={[S.hw * 2 + 1.2, 0.3, SLAB_LEN]} />
      </mesh>
      <mesh position={[S.x, S.ridgeY + 0.12, S.z]} material={mat.roofTrim} castShadow>
        <boxGeometry args={[S.hw * 2 + 1.4, 0.34, 0.5]} />
      </mesh>

      {[S.hw, -S.hw].map((dx) => (
        <mesh
          key={dx}
          position={[S.x + dx - Math.sign(dx) * 0.25, 0, S.z]}
          rotation={[0, Math.PI / 2, 0]}
          geometry={gableGeo}
          material={mat.roof}
          castShadow
          receiveShadow
        />
      ))}

      {/* corner posts at the open front, so the entrance reads as one */}
      {[S.hw - 0.6, -(S.hw - 0.6)].map((dx) => (
        <mesh
          key={dx}
          position={[S.x + dx, S.eaveY / 2, S.z + S.hd - 0.4]}
          material={mat.post}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[0.82, S.eaveY, 0.82]} />
        </mesh>
      ))}
    </group>
  )
}

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { world, damp } from './shared'
import {
  CASTLE,
  COURTYARD,
  inRect,
  PINK,
  PINK_DEEP,
  GOLD,
  GOLD_DEEP,
  STONE,
} from './buildings'

/**
 * Pink walls, gold roofs, and a courtyard she can ride into. Everything else —
 * the keep, the towers — is a silhouette she rides around, which is the whole
 * point: one open space to gallop in, no interior to get lost in.
 *
 * The front wall fades out when she's inside. The chase camera sits south of
 * her, so without that she'd disappear behind her own castle the moment she
 * rode through the gate.
 */

const C = CASTLE

/** Gold teeth along the top of a wall. Pure decoration, no collision. */
function Merlons({ from, to, along, at, y, material, step = 1.9 }) {
  const items = useMemo(() => {
    const out = []
    const span = to - from
    const n = Math.max(2, Math.round(Math.abs(span) / step))
    for (let i = 0; i < n; i++) {
      const t = from + (span * (i + 0.5)) / n
      out.push(along === 'x' ? [t, y, at] : [at, y, t])
    }
    return out
  }, [from, to, along, at, y, step])

  return items.map((p, i) => (
    <mesh key={i} position={p} material={material} castShadow receiveShadow>
      <boxGeometry args={along === 'x' ? [0.9, 0.7, 2.6] : [2.6, 0.7, 0.9]} />
    </mesh>
  ))
}

function Tower({ x, z, r, h, pink, gold, goldDeep }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, h / 2, 0]} material={pink} castShadow receiveShadow>
        <cylinderGeometry args={[r, r * 1.12, h, 12]} />
      </mesh>
      {/* gold band under the eaves — the detail that makes it read as a castle */}
      <mesh position={[0, h - 0.5, 0]} material={goldDeep} castShadow receiveShadow>
        <cylinderGeometry args={[r * 1.1, r * 1.1, 0.5, 12]} />
      </mesh>
      <mesh position={[0, h + 1.5, 0]} material={gold} castShadow receiveShadow>
        <coneGeometry args={[r * 1.3, 3.2, 12]} />
      </mesh>
      {/* pennant */}
      <mesh position={[0, h + 3.7, 0]} material={goldDeep}>
        <cylinderGeometry args={[0.06, 0.06, 1.4, 5]} />
      </mesh>
      <mesh position={[0.45, h + 4.1, 0]} material={pink}>
        <boxGeometry args={[0.9, 0.5, 0.05]} />
      </mesh>
    </group>
  )
}

export default function Castle() {
  // Two sets of materials. The "front" set is transparent from the start —
  // flipping .transparent at runtime forces a shader recompile and a hitch.
  const mat = useMemo(() => {
    const solid = (color, roughness = 0.85) =>
      new THREE.MeshStandardMaterial({ color, flatShading: true, roughness })
    const fading = (color, roughness = 0.85) =>
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
      gold: solid(GOLD, 0.45),
      goldDeep: solid(GOLD_DEEP, 0.45),
      stone: solid(STONE, 1),
      water: new THREE.MeshStandardMaterial({
        color: '#8FD0F0',
        roughness: 0.15,
        metalness: 0.1,
      }),
      frontPink: fading(PINK),
      frontGold: fading(GOLD, 0.45),
      frontGoldDeep: fading(GOLD_DEEP, 0.45),
    }
  }, [])

  const fade = useRef(1)
  const water = useRef()

  useFrame((s, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const inside = inRect(world.playerPos.x, world.playerPos.z, COURTYARD)
    world.insideCastle = inside

    const goal = inside ? 0.18 : 1
    fade.current += (goal - fade.current) * damp(dt, 3.5)
    for (const m of [mat.frontPink, mat.frontGold, mat.frontGoldDeep]) {
      m.opacity = fade.current
      // Once it's see-through it must stop writing depth, or it punches a hole
      // in everything drawn behind it.
      m.depthWrite = fade.current > 0.97
    }

    if (water.current) {
      water.current.position.y = 1.06 + Math.sin(s.clock.elapsedTime * 1.6) * 0.03
    }
  })

  // Deliberately no pointer handlers on any of this. Nothing here blocks a tap
  // from reaching the ground, which matters because from inside the courtyard
  // the camera looks *through* the front wall — swallowing taps would leave a
  // dead strip she couldn't ride to. Walking into a wall is handled by clamping
  // the destination instead, in Meadow's tap handler.
  const wallY = C.wallH / 2

  return (
    <group>
      {/* courtyard floor */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.03, -35]}
        material={mat.stone}
        raycast={() => null}
        receiveShadow
      >
        <planeGeometry args={[C.outerX * 2, 24]} />
      </mesh>
      {/* An apron outside the gate, so the entrance reads as an entrance. It
          butts up against the courtyard floor rather than overlapping it —
          two coplanar planes at the same height would z-fight. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.03, -19]}
        material={mat.stone}
        raycast={() => null}
        receiveShadow
      >
        <planeGeometry args={[C.gateHalf * 2, 8]} />
      </mesh>

      {/* ---- north wall */}
      <mesh position={[0, wallY, C.northZ]} material={mat.pink} castShadow receiveShadow>
        <boxGeometry args={[C.outerX * 2, C.wallH, C.wallHD * 2]} />
      </mesh>
      <Merlons
        from={-C.outerX}
        to={C.outerX}
        along="x"
        at={C.northZ}
        y={C.wallH + 0.35}
        material={mat.gold}
      />

      {/* ---- side walls */}
      {[C.cornerX, -C.cornerX].map((x) => (
        <group key={x}>
          <mesh position={[x, wallY, -35]} material={mat.pink} castShadow receiveShadow>
            <boxGeometry args={[C.wallHD * 2, C.wallH, 22.4]} />
          </mesh>
          <Merlons
            from={C.northZ}
            to={C.southZ}
            along="z"
            at={x}
            y={C.wallH + 0.35}
            material={mat.gold}
          />
        </group>
      ))}

      {/* ---- corner towers */}
      {[
        [C.cornerX, C.northZ],
        [-C.cornerX, C.northZ],
        [C.cornerX, C.southZ],
        [-C.cornerX, C.southZ],
      ].map(([x, z]) => (
        <Tower
          key={`${x}:${z}`}
          x={x}
          z={z}
          r={C.cornerR}
          h={C.cornerH}
          pink={mat.pink}
          gold={mat.gold}
          goldDeep={mat.goldDeep}
        />
      ))}

      {/* ---- the front: everything here fades when she's in the courtyard */}
      <group>
        {[1, -1].map((sign) => (
          <group key={sign}>
            <mesh
              position={[sign * 9.95, wallY, C.southZ]}
              material={mat.frontPink}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[8.9, C.wallH, C.wallHD * 2]} />
            </mesh>
            <Merlons
              from={sign * C.gateHalf}
              to={sign * C.outerX}
              along="x"
              at={C.southZ}
              y={C.wallH + 0.35}
              material={mat.frontGold}
            />
            {/* gate pillar the arch springs from */}
            <mesh
              position={[sign * C.gateHalf, 1.8, C.southZ]}
              material={mat.frontGoldDeep}
              castShadow
            >
              <boxGeometry args={[0.7, 3.6, C.wallHD * 2 + 0.3]} />
            </mesh>
          </group>
        ))}

        {/* gate arch — squashed so it tops out level with the wall */}
        <mesh position={[0, 3.6, C.southZ]} scale={[1, 0.28, 1]} material={mat.frontGold}>
          <torusGeometry args={[C.gateHalf, 0.38, 8, 20, Math.PI]} />
        </mesh>

        <Tower
          x={C.gateTowerX}
          z={C.southZ}
          r={C.gateTowerR}
          h={C.gateTowerH}
          pink={mat.frontPink}
          gold={mat.frontGold}
          goldDeep={mat.frontGoldDeep}
        />
        <Tower
          x={-C.gateTowerX}
          z={C.southZ}
          r={C.gateTowerR}
          h={C.gateTowerH}
          pink={mat.frontPink}
          gold={mat.frontGold}
          goldDeep={mat.frontGoldDeep}
        />
      </group>

      {/* ---- fountain: something to ride circles around */}
      <group position={[C.fountain.x, 0, C.fountain.z]}>
        <mesh position={[0, 0.45, 0]} material={mat.pinkDeep} castShadow receiveShadow>
          <cylinderGeometry args={[C.fountain.r, C.fountain.r + 0.2, 0.9, 16]} />
        </mesh>
        <mesh position={[0, 0.92, 0]} material={mat.gold}>
          <torusGeometry args={[C.fountain.r - 0.05, 0.14, 6, 20]} />
        </mesh>
        <mesh ref={water} position={[0, 1.06, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat.water}>
          <circleGeometry args={[C.fountain.r - 0.18, 20]} />
        </mesh>
        <mesh position={[0, 1.5, 0]} material={mat.gold} castShadow>
          <cylinderGeometry args={[0.16, 0.3, 1.6, 8]} />
        </mesh>
        <mesh position={[0, 2.45, 0]} material={mat.gold} castShadow>
          <sphereGeometry args={[0.34, 10, 8]} />
        </mesh>
      </group>

      {/* ---- the keep, behind the north wall. Scenery only. */}
      <group position={[C.keep.x, 0, C.keep.z]}>
        <mesh position={[0, C.keep.h / 2, 0]} material={mat.pink} castShadow receiveShadow>
          <boxGeometry args={[C.keep.hw * 2, C.keep.h, C.keep.hd * 2]} />
        </mesh>
        <mesh position={[0, C.keep.h + 2.1, 0]} rotation={[0, Math.PI / 4, 0]} material={mat.gold} castShadow>
          <coneGeometry args={[C.keep.hw * 1.15, 4.4, 4]} />
        </mesh>
        {[-5.2, 5.2].map((x) => (
          <Tower
            key={x}
            x={x}
            z={C.keep.hd}
            r={2.2}
            h={14}
            pink={mat.pink}
            gold={mat.gold}
            goldDeep={mat.goldDeep}
          />
        ))}
      </group>
    </group>
  )
}

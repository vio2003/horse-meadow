import { useMemo } from 'react'
import * as THREE from 'three'
import { Scatter } from './Meadow'
import { region, edgeMarkers } from './regions'
import { MOUNTAIN } from './buildings'

/**
 * The snowy west, and the mountain in it.
 *
 * The mountain is scenery with a collision circle — the same shape the castle's
 * corner towers use, which is exactly why it can't trap her: a circle ejects
 * along its radius, so walking into it slides around it. She goes round, not up.
 * Walkable height would mean giving every position in this game a y, and the
 * player, the horses, the tap-to-move, the camera and the shadows all currently
 * assume flat ground.
 *
 * Drawn a good deal wider than its blocker at the base, so the slope she can't
 * walk on is visibly a slope rather than an invisible wall in open snow.
 */

const SNOW = region('snow')
/** The drawn slope, wider than the blocker so the collision reads as a hillside. */
const SLOPE_R = MOUNTAIN.r + 4.5
const CAP_R = SLOPE_R * 0.4
const CAP_H = MOUNTAIN.h * 0.35

export default function Snow() {
  const rockGeo = useMemo(() => new THREE.IcosahedronGeometry(0.7, 0), [])
  const rockMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#C6CDD4', flatShading: true, roughness: 1 }),
    []
  )
  const driftGeo = useMemo(() => new THREE.SphereGeometry(0.9, 6, 4), [])
  const driftMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#F4FAFF', flatShading: true, roughness: 1 }),
    []
  )

  const firs = useMemo(() => {
    // Deterministic, like the meadow's trees, so the place looks the same every
    // time she comes back to it.
    let s = 1234
    const rng = () => ((s = (s * 1664525 + 1013904223) % 4294967296), s / 4294967296)
    return Array.from({ length: 22 }, () => {
      const a = rng() * Math.PI * 2
      const r = 8 + rng() * (SNOW.r - 12)
      return { x: SNOW.x + Math.cos(a) * r, z: SNOW.z + Math.sin(a) * r, s: 0.7 + rng() * 0.7 }
    }).filter((t) => Math.hypot(t.x - MOUNTAIN.x, t.z - MOUNTAIN.z) > MOUNTAIN.r + 3)
  }, [])

  const drifts = useMemo(() => edgeMarkers(SNOW, 46, 1), [])

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[SNOW.x, SNOW.y, SNOW.z]}
        raycast={() => null}
        receiveShadow
      >
        <circleGeometry args={[SNOW.r, 64]} />
        <meshStandardMaterial color={SNOW.ground} roughness={0.95} />
      </mesh>

      {/* The mountain. Base is wider than the blocker so the collision reads as
          the foot of a slope rather than a wall standing in open snow. */}
      <group position={[MOUNTAIN.x, 0, MOUNTAIN.z]}>
        <mesh position={[0, MOUNTAIN.h / 2, 0]} castShadow receiveShadow>
          <coneGeometry args={[SLOPE_R, MOUNTAIN.h, 9]} />
          <meshStandardMaterial color="#9AA6B2" flatShading roughness={1} />
        </mesh>
        {/* Snowcap. It has to be *wider* than the slope it sits on at the height
            it sits at, or a cone inside a cone is simply invisible — which is
            what the first attempt was. */}
        <mesh position={[0, MOUNTAIN.h - CAP_H / 2 - 0.5, 0]} castShadow>
          <coneGeometry args={[CAP_R, CAP_H, 9]} />
          <meshStandardMaterial color="#FBFEFF" flatShading roughness={0.9} />
        </mesh>
        {/* A smaller shoulder, so it isn't one lonely cone. */}
        <mesh position={[MOUNTAIN.r * 0.7, MOUNTAIN.h * 0.24, MOUNTAIN.r * 0.5]} castShadow receiveShadow>
          <coneGeometry args={[MOUNTAIN.r * 0.55, MOUNTAIN.h * 0.48, 8]} />
          <meshStandardMaterial color="#A6B1BC" flatShading roughness={1} />
        </mesh>
      </group>

      <Scatter
        count={200}
        radius={SNOW.r - 3}
        center={[SNOW.x, SNOW.z]}
        seed={919}
        geometry={driftGeo}
        material={driftMat}
        scaleRange={[0.4, 1.1]}
        yOffset={-0.35}
      />
      <Scatter
        count={22}
        radius={SNOW.r - 6}
        inner={6}
        center={[SNOW.x, SNOW.z]}
        seed={1020}
        geometry={rockGeo}
        material={rockMat}
        scaleRange={[0.5, 1.3]}
        yOffset={0.2}
        castShadow
      />

      {firs.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]} scale={t.s}>
          <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.26, 0.36, 2.4, 6]} />
            <meshStandardMaterial color="#5B4633" flatShading roughness={1} />
          </mesh>
          <mesh position={[0, 3.4, 0]} castShadow receiveShadow>
            <coneGeometry args={[1.8, 3.2, 7]} />
            <meshStandardMaterial color="#39634A" flatShading roughness={1} />
          </mesh>
          <mesh position={[0, 4.9, 0]} castShadow receiveShadow>
            <coneGeometry args={[1.3, 2.2, 7]} />
            <meshStandardMaterial color="#F4FAFF" flatShading roughness={0.95} />
          </mesh>
        </group>
      ))}

      {/* Snowdrifts mark where the snow ends — minus the doorway home. */}
      {drifts.map((d, i) => (
        <mesh key={i} position={[d.x, 0.1, d.z]} rotation={[0, d.a, 0]} castShadow receiveShadow>
          <sphereGeometry args={[2.0, 7, 5]} />
          <meshStandardMaterial color="#F7FBFF" flatShading roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

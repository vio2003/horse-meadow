import { useMemo, useRef, useLayoutEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { world, MEADOW_RADIUS, clampToWorld } from './shared'
import { MEADOW, WORLD_REACH, edgeMarkers } from './regions'
import { isBuiltOn } from './buildings'
import { RUN_DISTANCE } from './Player'
import { useGame } from '../store'

/** Deterministic pseudo-random, so the meadow looks identical every session. */
function makeRng(seed) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

export function Scatter({
  count,
  radius,
  inner = 0,
  center = [0, 0],
  seed,
  geometry,
  material,
  scaleRange,
  yOffset = 0,
  castShadow = false,
}) {
  const ref = useRef()
  const [cx, cz] = center
  const items = useMemo(() => {
    const rng = makeRng(seed)
    return Array.from({ length: count }, () => {
      const ang = rng() * Math.PI * 2
      const r = inner + Math.sqrt(rng()) * (radius - inner)
      const sc = scaleRange[0] + rng() * (scaleRange[1] - scaleRange[0])
      const x = cx + Math.cos(ang) * r
      const z = cz + Math.sin(ang) * r
      // Anything that landed under a building gets scaled to nothing rather
      // than dropped, so the instance count (and the seed) stay stable.
      return { x, z, rot: rng() * Math.PI * 2, sc: isBuiltOn(x, z) ? 0 : sc }
    })
  }, [count, radius, inner, cx, cz, seed, scaleRange])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    items.forEach((it, i) => {
      e.set(0, it.rot, 0)
      q.setFromEuler(e)
      m.compose(
        new THREE.Vector3(it.x, yOffset, it.z),
        q,
        new THREE.Vector3(it.sc, it.sc, it.sc)
      )
      ref.current.setMatrixAt(i, m)
    })
    ref.current.instanceMatrix.needsUpdate = true
  }, [items, yOffset])

  // Scattered things receive shadow but mostly don't cast one: 800 grass tufts
  // casting individually is a lot of shadow-map work to produce visual noise.
  // Receiving is what matters — without it, grass stays lit inside the castle's
  // shadow and the shadow stops looking like it's on the ground.
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, count]}
      raycast={() => null}
      castShadow={castShadow}
      receiveShadow
    />
  )
}

function MoveMarker() {
  const ref = useRef()
  useFrame((s) => {
    const t = world.moveTarget
    if (!t) {
      ref.current.visible = false
      return
    }
    ref.current.visible = true
    ref.current.position.set(t.x, 0.06, t.z)
    const pulse = 1 + Math.sin(s.clock.elapsedTime * 6) * 0.12
    ref.current.scale.setScalar(pulse)
  })
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.34, 0.46, 20]} />
      <meshBasicMaterial color="#FFF3D0" transparent opacity={0.85} />
    </mesh>
  )
}

export default function Meadow() {
  const grassGeo = useMemo(() => new THREE.ConeGeometry(0.09, 0.42, 4), [])
  const grassMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#5F9E52', flatShading: true, roughness: 1 }),
    []
  )
  const flowerGeo = useMemo(() => new THREE.SphereGeometry(0.1, 6, 5), [])
  const flowerMats = useMemo(
    () =>
      ['#F3D14E', '#EFA0B4', '#FFFFFF', '#B49AD8'].map(
        (c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.9 })
      ),
    []
  )
  const rockGeo = useMemo(() => new THREE.IcosahedronGeometry(0.55, 0), [])
  const rockMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#9A9691', flatShading: true, roughness: 1 }),
    []
  )

  const trees = useMemo(() => {
    const rng = makeRng(99)
    return Array.from({ length: 18 }, () => {
      const ang = rng() * Math.PI * 2
      const r = 40 + rng() * 14
      return {
        x: Math.cos(ang) * r,
        z: Math.sin(ang) * r,
        s: 0.85 + rng() * 0.7,
        tint: ['#3F7A46', '#4E8A52', '#356B3D'][Math.floor(rng() * 3)],
      }
    }).filter((t) => !isBuiltOn(t.x, t.z))
  }, [])

  // The fence stops where the castle starts — the keep is the boundary there —
  // and, now, wherever the meadow opens onto somewhere else.
  const posts = useMemo(() => edgeMarkers(MEADOW, 44, 2).filter((p) => !isBuiltOn(p.x, p.z)), [])

  return (
    <group>
      {/* The ground is the only thing that takes taps. Horses stopPropagation. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation()
          const g = useGame.getState()
          if (g.namingHorse) return
          // Pull the destination somewhere actually reachable — inside the
          // fence and out of the walls. Otherwise she'd press against a wall
          // forever, and (because the tap counted as a run) spook every horse
          // in the meadow while doing it. Padded for a horse, the fatter of
          // the two things that might be walking there.
          const t = clampToWorld(new THREE.Vector3(e.point.x, 0, e.point.z), 1.0)
          world.moveTarget = t
          // A long tap-away is a run. Running is what startles horses — that's
          // the whole lesson of the game, expressed as one comparison. Measured
          // after the clamp, so a tap at an unreachable spot doesn't start a
          // gallop that turns into two steps.
          const d = Math.hypot(t.x - world.playerPos.x, t.z - world.playerPos.z)
          world.playerRunning = !g.mounted && d > RUN_DISTANCE
        }}
      >
        <circleGeometry args={[WORLD_REACH + 60, 64]} />
        <meshStandardMaterial color="#6B9A56" roughness={1} />
      </mesh>

      {/* The meadow itself, laid over the base. Every region does this — the
          base is only there to catch taps and to fill the gaps between them. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, MEADOW.y, 0]} raycast={() => null}>
        <circleGeometry args={[MEADOW_RADIUS, 64]} />
        <meshStandardMaterial color={MEADOW.ground} roughness={1} />
      </mesh>

      {/* A slightly darker inner ring gives the eye something to read as distance */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, MEADOW.y + 0.001, 0]} raycast={() => null}>
        <ringGeometry args={[MEADOW_RADIUS - 1.0, MEADOW_RADIUS, 64]} />
        <meshStandardMaterial color="#6AA057" roughness={1} />
      </mesh>

      <MoveMarker />

      <Scatter
        count={800}
        radius={MEADOW_RADIUS + 6}
        seed={7}
        geometry={grassGeo}
        material={grassMat}
        scaleRange={[0.7, 1.5]}
        yOffset={0.2}
      />
      {flowerMats.map((mat, i) => (
        <Scatter
          key={i}
          count={40}
          radius={MEADOW_RADIUS}
          seed={31 + i * 13}
          geometry={flowerGeo}
          material={mat}
          scaleRange={[0.7, 1.2]}
          yOffset={0.24}
        />
      ))}
      <Scatter
        count={14}
        radius={MEADOW_RADIUS - 4}
        inner={10}
        seed={404}
        geometry={rockGeo}
        material={rockMat}
        scaleRange={[0.6, 1.5]}
        yOffset={0.2}
        castShadow
      />

      {trees.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]} scale={t.s}>
          <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.34, 0.46, 3, 6]} />
            <meshStandardMaterial color="#6E4A32" flatShading roughness={1} />
          </mesh>
          <mesh position={[0, 4.1, 0]} castShadow receiveShadow>
            <coneGeometry args={[2.3, 3.6, 7]} />
            <meshStandardMaterial color={t.tint} flatShading roughness={1} />
          </mesh>
          <mesh position={[0, 5.6, 0]} castShadow receiveShadow>
            <coneGeometry args={[1.7, 2.6, 7]} />
            <meshStandardMaterial color={t.tint} flatShading roughness={1} />
          </mesh>
        </group>
      ))}

      {posts.map((p, i) => (
        <mesh key={i} position={[p.x, 0.55, p.z]} castShadow receiveShadow>
          <boxGeometry args={[0.18, 1.1, 0.18]} />
          <meshStandardMaterial color="#A9663C" flatShading roughness={0.95} />
        </mesh>
      ))}
    </group>
  )
}

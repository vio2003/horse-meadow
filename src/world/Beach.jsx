import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Scatter } from './Meadow'
import { region, edgeMarkers } from './regions'

/**
 * The beach, east of the meadow, and the sea beyond it.
 *
 * The sand is a disc like every other region, so the shoreline is the arc of
 * that circle — which reads as a bay, and costs nothing. The sea is a much
 * bigger disc centred further out to sea, laid *under* the sand and over the
 * base ground, so the water laps up to the sand and stops. It reaches back far
 * enough to slide under the meadow's eastern edge, where the meadow's own disc
 * covers it.
 *
 * Nothing here is a blocker. The water is the boundary, and the boundary is
 * already enforced by the region clamp — so what matters is that she can *see*
 * where the beach ends, which the surf line does.
 */

const BEACH = region('beach')
/** Far enough east that it never reaches the town or the snow. */
const SEA = { x: 150, z: 4, r: 120 }

function Surf() {
  const ref = useRef()
  // A slow breathing scale is enough to read as water without a shader, and
  // costs one matrix update a frame rather than a vertex program.
  useFrame((s) => {
    const t = 1 + Math.sin(s.clock.elapsedTime * 0.6) * 0.004
    ref.current.scale.set(t, t, 1)
  })
  return (
    <mesh
      ref={ref}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[BEACH.x, BEACH.y + 0.002, BEACH.z]}
      raycast={() => null}
    >
      <ringGeometry args={[BEACH.r - 2.2, BEACH.r + 1.6, 72]} />
      <meshStandardMaterial color="#EAF6FA" transparent opacity={0.75} roughness={0.6} />
    </mesh>
  )
}

export default function Beach() {
  const shellGeo = useMemo(() => new THREE.SphereGeometry(0.16, 6, 5), [])
  const shellMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#F6E7DC', flatShading: true, roughness: 0.8 }),
    []
  )
  const tuftGeo = useMemo(() => new THREE.ConeGeometry(0.1, 0.55, 4), [])
  const tuftMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#A8B471', flatShading: true, roughness: 1 }),
    []
  )
  const rockGeo = useMemo(() => new THREE.IcosahedronGeometry(0.6, 0), [])
  const rockMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#B0A79A', flatShading: true, roughness: 1 }),
    []
  )

  // Only where the beach borders the sea — the landward side opens to the meadow.
  const palms = useMemo(() => edgeMarkers(BEACH, 26, -7).filter((_, i) => i % 2 === 0), [])

  return (
    <group>
      {/* Sea, under the sand and over the base ground. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[SEA.x, 0.006, SEA.z]}
        raycast={() => null}
        receiveShadow
      >
        <circleGeometry args={[SEA.r, 72]} />
        <meshStandardMaterial color="#4E9BC4" roughness={0.35} metalness={0.05} />
      </mesh>

      {/* Sand. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[BEACH.x, BEACH.y, BEACH.z]}
        raycast={() => null}
        receiveShadow
      >
        <circleGeometry args={[BEACH.r, 64]} />
        <meshStandardMaterial color={BEACH.ground} roughness={1} />
      </mesh>

      {/* Wet sand, darker, where the water has just been. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[BEACH.x, BEACH.y + 0.001, BEACH.z]}
        raycast={() => null}
      >
        <ringGeometry args={[BEACH.r - 5.5, BEACH.r, 72]} />
        <meshStandardMaterial color="#CDBB8E" roughness={1} />
      </mesh>

      <Surf />

      <Scatter
        count={90}
        radius={BEACH.r - 4}
        center={[BEACH.x, BEACH.z]}
        seed={515}
        geometry={shellGeo}
        material={shellMat}
        scaleRange={[0.6, 1.3]}
        yOffset={0.1}
      />
      <Scatter
        count={140}
        radius={BEACH.r - 10}
        center={[BEACH.x, BEACH.z]}
        seed={616}
        geometry={tuftGeo}
        material={tuftMat}
        scaleRange={[0.6, 1.4]}
        yOffset={0.24}
      />
      <Scatter
        count={16}
        radius={BEACH.r - 6}
        inner={8}
        center={[BEACH.x, BEACH.z]}
        seed={717}
        geometry={rockGeo}
        material={rockMat}
        scaleRange={[0.5, 1.4]}
        yOffset={0.2}
        castShadow
      />

      {/* Palms mark the seaward rim, so the edge of the sand is never a surprise.
          The fronds hang *down and out* rather than standing up: cones pointing
          skyward read as a pine, and the first attempt gave the beach a fir
          forest. Leaning the trunk a little stops six of them looking stamped
          from the same mould. */}
      {palms.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]} rotation={[0, p.a, 0]} scale={0.9 + (i % 3) * 0.12}>
          <mesh position={[0, 1.7, 0]} rotation={[0, 0, 0.1 + (i % 2) * 0.06]} castShadow receiveShadow>
            <cylinderGeometry args={[0.16, 0.28, 3.4, 6]} />
            <meshStandardMaterial color="#9A7A52" flatShading roughness={1} />
          </mesh>
          {[0, 1, 2, 3, 4, 5].map((f) => {
            const a = (f / 6) * Math.PI * 2
            return (
              <mesh
                key={f}
                position={[Math.cos(a) * 0.95, 3.3, Math.sin(a) * 0.95]}
                rotation={[Math.PI / 2 - 0.42, 0, -a]}
                castShadow
              >
                <coneGeometry args={[0.34, 2.6, 4]} />
                <meshStandardMaterial color="#5C9A50" flatShading roughness={1} />
              </mesh>
            )
          })}
          {/* Coconuts, because she is six. */}
          <mesh position={[0.2, 3.15, 0.15]} castShadow>
            <sphereGeometry args={[0.2, 6, 5]} />
            <meshStandardMaterial color="#6B4A30" flatShading roughness={1} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
